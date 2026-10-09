// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Spec packages and environments (environments-19..23): the format read
// and refused, resolution against the stand-in registry, installs on
// scratch homes through the store, exports into scratch working folders
// and a scratch user home, and the built-in spec package seeded and
// resolved with no registry reachable.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";

import { ARTIFACT_SCHEMAS, composeConfig, isValidRegistryEntry, REGISTRY_CONTRACT, RegistryError as ConfigRegistryError, type PlaybookModules } from "./config.js";
import {
  artifactLanguages,
  builtinPackage,
  builtinRegistrySource,
  compositeRegistry,
  ContentStore,
  defaultRunGit,
  exportEnvironment,
  FormatError,
  gitSource,
  GitSourceError,
  install,
  InstallError,
  lockStoreKeys,
  moduleLocations,
  packFiles,
  parseLock,
  parseManifestText,
  parseRequests,
  parseRequirement,
  portablePathIssues,
  publishRelease,
  readLock,
  readRelease,
  RegistryClient,
  RegistryError,
  requestsDigest,
  resolve,
  satisfies,
  seedBuiltinPackage,
  serializeLock,
  serializeManifest,
  setRequest,
  sha256Hex,
  storeKey,
  writeLock,
  type Lock,
  type RegistrySource,
  type ResolveResult,
  type RunGit,
} from "./environment/index.js";
import { EnvironmentManager } from "./environments.js";
import { Store } from "./store.js";
import { startGitHttpHost, testCredentialArgs } from "./testing/git-http-host.js";
import { scratchDir } from "./testing/scratch.js";
import { makeRelease, startStandinRegistry, type ReleaseFixture, type StandinRegistry } from "./testing/standin-registry.js";

const machineIdentity = "machine-id:v1:00000000-0000-4000-8000-0000000000aa";

let registry: StandinRegistry;
let client: RegistryClient;

before(async () => {
  registry = await startStandinRegistry({ dir: scratchDir("spex-standin-") });
  client = new RegistryClient({ url: registry.url });
});

after(async () => {
  await registry.close();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function manifestOf(name: string, version: string, artifacts: Record<string, unknown>, dependencies?: Record<string, string>): Record<string, unknown> {
  const [org, pkg] = name.split("/");
  return {
    format: 2, org, name: pkg, version, description: `The ${name} spec package`, license: "Apache-2.0",
    ...(dependencies ? { dependencies } : {}),
    artifacts,
  };
}

function skillText(id: string, body = `Use ${id}.`): string {
  return `---\nname: ${id}\ndescription: The ${id} skill\n---\n\n${body}\n`;
}

function skillFiles(id: string, language = "en", body?: string): Record<string, ReleaseFixture> {
  return { [`skills/${language}/${id}/SKILL.md`]: skillText(id, body) };
}

function playbookFiles(id: string, language = "en"): Record<string, ReleaseFixture> {
  return {
    [`playbooks/${language}/${id}/${id}.md`]: `# ${id}\n\nRoles:\n\n- Worker\n`,
    [`playbooks/${language}/${id}/${id}.playbook/${id}.registry.mjs`]: `export default { id: ${JSON.stringify(id)} };\n`,
  };
}

/** A playbook whose module is a registry entry composition accepts. */
function launchablePlaybookFiles(id: string): Record<string, ReleaseFixture> {
  return {
    [`playbooks/en/${id}/${id}.md`]: `# ${id}\n\nRoles:\n\n- Worker\n`,
    [`playbooks/en/${id}/${id}.playbook/${id}.registry.mjs`]: [
      `export const spexRegistryContract = ${REGISTRY_CONTRACT};`,
      `export default { id: ${JSON.stringify(id)}, command: ${JSON.stringify(id)}, intent: "Run ${id}", artifactSchema: ${ARTIFACT_SCHEMAS[0]}, requiredRoleIds: ["worker"], validateOptions: (options) => options ?? {}, createRuntime: () => ({}) };`,
      "",
    ].join("\n"),
  };
}

/** A session's config enabling one playbook, its role bound to one player. */
function sessionConfig(playbook: string): Record<string, unknown> {
  return { captain: { adapter: "claude" }, players: { worker: { adapter: "claude" } }, playbooks: { [playbook]: { roles: { worker: "worker" } } } };
}

/** A value as JSON reads it back: own keys alike, whatever the prototype. */
function plain(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

/** Publish a release to the stand-in through the real publish path. */
async function publish(manifest: Record<string, unknown>, files: Record<string, ReleaseFixture>, through: RegistryClient = client): Promise<void> {
  const dir = join(scratchDir("spex-release-"), "release");
  await makeRelease(dir, manifest, files);
  await publishRelease(through, dir);
}

/** A package with one skill named after it, depending as given. */
async function publishSimple(name: string, version: string, dependencies?: Record<string, string>, skill = name.split("/")[1]!): Promise<void> {
  await publish(manifestOf(name, version, { [skill]: { kind: "skill", language: "en" } }, dependencies), skillFiles(skill, "en", `${name} ${version}`));
}

interface Home {
  root: string;
  store: ContentStore;
  cache: string;
  clone: string;
}

function makeHome(clone = "me/me-spex"): Home {
  const root = scratchDir("spex-home-");
  return { root, store: new ContentStore(root), cache: join(root, "cache"), clone: join(root, "workspace", ...clone.split("/")) };
}

function cloneOf(home: Home, key: string): string {
  return join(home.root, "workspace", ...key.split("/"));
}

/** The core's environment manager over a scratch home's clones; the
 * store holds what a session's module lookup reads: your own group,
 * each clone and the working folder paired with it. */
function environmentsOver(home: Home, own: string, clones: Record<string, { dir: string; workingFolder: string | null }>): EnvironmentManager {
  const store = {
    dir: home.root,
    home: {
      own: () => own,
      folderOf: (key: string) => (clones[key]?.workingFolder ? { path: clones[key].workingFolder } : undefined),
      host: { url: registry.url },
    },
    repository: (key: string) => (clones[key] ? { dir: clones[key].dir } : undefined),
  };
  return new EnvironmentManager({
    store: store as unknown as Store, userHome: null, deviceHome: home.root, builtin: null, token: async () => null,
    gitCredential: async () => undefined, credentialArgs: async () => ({ env: {}, configArgs: [], dispose: () => {} }), broadcast: () => {},
  });
}

async function resolveText(clone: string, text: string, options: { through?: RegistrySource; workingFolder?: string | null; git?: ReturnType<typeof gitSource>; cache?: string; gitCredential?: () => Promise<{ username: string; secret: string } | undefined> } = {}): Promise<ResolveResult> {
  mkdirSync(clone, { recursive: true });
  writeFileSync(join(clone, "spex.yaml"), text);
  return resolve({
    requests: parseRequests(text),
    requestsText: text,
    registry: options.through ?? client,
    workingFolder: options.workingFolder ?? null,
    git: options.git ?? gitSource(options.cache ?? join(clone, "..", "..", "..", "cache")),
    ...(options.gitCredential ? { gitCredential: options.gitCredential } : {}),
  });
}

function locked(result: ResolveResult): Lock {
  if (!result.ok) assert.fail(`resolution failed: ${JSON.stringify(result.conflicts)}`);
  return result.lock;
}

/** Every entry under a folder: a file's mode bit and digest, a link's target. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(dir)) return out;
  const walk = (relative: string): void => {
    for (const name of readdirSync(join(dir, relative)).sort()) {
      const path = relative ? `${relative}/${name}` : name;
      const stat = lstatSync(join(dir, path));
      if (stat.isSymbolicLink()) out[path] = `link:${readlinkSync(join(dir, path))}`;
      else if (stat.isDirectory()) walk(path);
      else out[path] = `file:${stat.mode & 0o100 ? "x" : "-"}:${sha256Hex(readFileSync(join(dir, path)))}`;
    }
  };
  walk("");
  return out;
}

const requestsYaml = (packages: Record<string, unknown>, language?: string): string =>
  `# The environment's requests.\nformat: 1\n${language ? `language: ${language}\n` : ""}packages:\n${Object.entries(packages)
    .map(([name, request]) => `  ${name}: ${JSON.stringify(request)}\n`).join("")}`;

// Git, kept off this machine's own Git configuration.
function hermeticGit(scratch: string): { env: NodeJS.ProcessEnv; run: RunGit; git: (cwd: string, args: string[]) => string } {
  const config = join(scratch, "gitconfig");
  writeFileSync(config, "");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: config,
    GIT_AUTHOR_NAME: "Spex Test",
    GIT_AUTHOR_EMAIL: "test@spex.invalid",
    GIT_COMMITTER_NAME: "Spex Test",
    GIT_COMMITTER_EMAIL: "test@spex.invalid",
    GIT_TERMINAL_PROMPT: "0",
  };
  return {
    env,
    run: (args, options = {}) => defaultRunGit(args, { env: { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: config, ...(options.env ?? {}) } }),
    git: (cwd, args) => execFileSync("git", args, { cwd, env, encoding: "utf8" }).trim(),
  };
}

// ---------------------------------------------------------------------------
// environments-19: the format
// ---------------------------------------------------------------------------

const SPEC_EN = "# widgets: Widgets\n\n## Intent\n\nWidgets spin.\n\n## External Behavior\n\n### widgets-1\n\nThe widget shall spin.\n\n### widgets-2\n\nThe widget shall stop.\n\n## Verification\n\n### widgets-3\n\nWhen spun, the suite shall assert it spins [[widgets-1](#widgets-1)] and stops [[widgets-2](#widgets-2)].\n";
const SPEC_ZH = "# widgets: 部件\n\n## Intent\n\n部件旋转。\n\n## External Behavior\n\n### widgets-1\n\n部件应旋转。\n\n### widgets-2\n\n部件应停止。\n\n## Verification\n\n### widgets-3\n\n旋转时，测试应断言其旋转 [[widgets-1](#widgets-1)] 并停止 [[widgets-2](#widgets-2)]。\n";

function widgetsManifest(): Record<string, unknown> {
  return {
    ...manifestOf("acme/widgets", "1.0.0", {
      brief: { kind: "source", language: "en" },
      widgets: { kind: "spec", language: "en", from: "brief", "generated-by": { agent: "claude", model: "opus" } },
      lint: { kind: "skill", language: "en", from: "widgets" },
      build: { kind: "playbook", language: "en", from: "widgets", requires: ["lint"] },
      viewer: { kind: "applet", from: "widgets" },
    }),
    repository: "https://example.invalid/acme/widgets",
    "x-note": "an x- field a reader ignores",
  };
}

function widgetsFiles(): Record<string, ReleaseFixture> {
  return {
    "README.md": "# Widgets\n",
    LICENSE: "Apache-2.0\n",
    "sources/en/brief/SOURCE.md": "# Brief\n\nWidgets spin.\n",
    "sources/en/brief/sketch.txt": "a sketch\n",
    "sources/zh-Hans/brief/SOURCE.md": "# 简介\n\n部件旋转。\n",
    "specs/en/widgets.md": SPEC_EN,
    "specs/zh-Hans/widgets.md": SPEC_ZH,
    ...skillFiles("lint"),
    ...skillFiles("lint", "zh-Hans", "使用 lint。"),
    "skills/en/lint/scripts/run.sh": { data: "#!/bin/sh\necho lint\n", executable: true },
    ...playbookFiles("build"),
    "applets/viewer/index.html": "<!doctype html>\n<title>Viewer</title>\n",
  };
}


/** The module a `find` hands the launcher, undefined where it is missing or unknown. */
function moduleOf(found: ReturnType<PlaybookModules["find"]>): string | undefined {
  return found !== undefined && "module" in found ? found.module : undefined;
}

test("environments-19: the format accepts a whole release and refuses each broken rule by name", async () => {
  // A release with every kind and two languages is accepted whole.
  const accepted = await makeRelease(join(scratchDir("spex-format-"), "widgets"), widgetsManifest(), widgetsFiles());
  const release = await readRelease(accepted);
  assert.deepEqual(Object.keys(release.manifest.artifacts).sort(), ["brief", "build", "lint", "viewer", "widgets"]);
  assert.equal(release.manifest.artifacts.widgets!.generatedBy?.agent, "claude");
  assert.deepEqual(release.files.map((file) => file.path), Object.keys(widgetsFiles()).concat("meta.yaml").sort());
  assert.equal(release.files.find((file) => file.path === "skills/en/lint/scripts/run.sh")!.executable, true);
  assert.equal(release.files.find((file) => file.path === "skills/en/lint/SKILL.md")!.executable, false);
  const languages = artifactLanguages(release.manifest, release.files);
  assert.deepEqual(languages.brief, ["en", "zh-Hans"]);
  assert.deepEqual(languages.widgets, ["en", "zh-Hans"]);
  assert.deepEqual(languages.viewer, []);

  const cases: { label: string; rule: string; change: (manifest: Record<string, unknown>, files: Record<string, ReleaseFixture>) => void }[] = [
    { label: "a manifest without format 2", rule: "format", change: (manifest) => { manifest.format = 1; } },
    { label: "an unknown field", rule: "field", change: (manifest) => { manifest.colour = "red"; } },
    { label: "a file under no artifact", rule: "layout", change: (_manifest, files) => { files["notes.txt"] = "stray\n"; } },
    { label: "a folder without a manifest entry", rule: "folder", change: (_manifest, files) => { Object.assign(files, skillFiles("extra")); } },
    { label: "a skill whose SKILL.md name differs from its id", rule: "skill-md", change: (_manifest, files) => { files["skills/en/lint/SKILL.md"] = skillText("linter"); } },
    { label: "a skill and a playbook sharing an id", rule: "shared-id", change: (_manifest, files) => { files["playbooks/en/lint/lint.md"] = "# lint\n"; } },
    { label: "a translation whose item ids differ", rule: "translation", change: (_manifest, files) => { files["specs/zh-Hans/widgets.md"] = SPEC_ZH.replace("### widgets-2", "### widgets-9"); } },
    { label: "a non-portable path", rule: "path", change: (_manifest, files) => { files["skills/en/lint/a:b.md"] = "colon\n"; } },
    { label: "a Windows device name", rule: "path", change: (_manifest, files) => { files["skills/en/lint/aux.md"] = "device\n"; } },
    { label: "a trailing dot", rule: "path", change: (_manifest, files) => { files["skills/en/lint/notes."] = "dot\n"; } },
    { label: "a link", rule: "link", change: (_manifest, files) => { files["skills/en/lint/link.md"] = { symlink: "SKILL.md" }; } },
    { label: "a playbook id that is no Agent Skills name", rule: "skill-name", change: (manifest, files) => {
      (manifest.artifacts as Record<string, unknown>).Build_It = { kind: "playbook", language: "en" };
      files["playbooks/en/Build_It/Build_It.md"] = "# Build\n";
    } },
    { label: "a language folder that is no BCP 47 tag", rule: "language", change: (_manifest, files) => { files["sources/not_a_tag/brief/SOURCE.md"] = "# x\n"; } },
  ];
  for (const { label, rule, change } of cases) {
    const manifest = widgetsManifest();
    const files = widgetsFiles();
    change(manifest, files);
    const dir = await makeRelease(join(scratchDir("spex-format-"), "widgets"), manifest, files);
    await assert.rejects(readRelease(dir), (error: unknown) => {
      assert.ok(error instanceof FormatError, `${label}: ${String(error)}`);
      assert.ok(error.issues.some((issue) => issue.rule === rule), `${label} is refused as ${rule}: ${JSON.stringify(error.issues)}`);
      return true;
    }, label);
  }

  // Paths unique only before NFC and case folding are refused, here and
  // at the registry, which checks an archive as the core reads a release.
  assert.ok(portablePathIssues(["skills/en/lint/Notes.md", "skills/en/lint/notes.md"]).some((issue) => /case folding/.test(issue.message)));
  assert.ok(portablePathIssues(["skills/en/lint/café.md", "skills/en/lint/café.md"]).some((issue) => /NFC/.test(issue.message)));
  const colliding = packFiles("collide", [
    { path: "meta.yaml", executable: false, data: Buffer.from(`format: 2\norg: acme\nname: collide\nversion: 1.0.0\nartifacts:\n  tip: {kind: skill, language: en}\n`) },
    { path: "skills/en/tip/SKILL.md", executable: false, data: Buffer.from(skillText("tip")) },
    { path: "skills/en/tip/A.md", executable: false, data: Buffer.from("a") },
    { path: "skills/en/tip/a.md", executable: false, data: Buffer.from("b") },
  ]);
  await assert.rejects(client.publish("acme/collide", "1.0.0", colliding), (error: unknown) => {
    assert.ok(error instanceof RegistryError && error.kind === "rejected" && error.code === "invalid_artifact");
    assert.ok((error.details as { rule: string }[]).some((issue) => issue.rule === "path"));
    return true;
  });
  // A dependency carrying the retired `mode` is refused by name.
  const moded = widgetsManifest();
  moded.dependencies = { "acme/base": { version: "^1.0.0", mode: "include" } };
  await assert.rejects(readRelease(await makeRelease(join(scratchDir("spex-format-"), "widgets"), moded, widgetsFiles())),
    (error: unknown) => error instanceof FormatError && error.issues.some((issue) => /mode/.test(issue.message)));
});

// ---------------------------------------------------------------------------
// environments-20: resolution
// ---------------------------------------------------------------------------

test("environments-20: version requirements admit and refuse the table's versions", async () => {
  const table: [string, string, boolean][] = [
    ["1.2.3", "1.2.3", true], ["1.2.3+build.7", "1.2.3", true], ["1.2.4", "1.2.3", false],
    ["1.2.3", "^1.2.3", true], ["1.9.0", "^1.2.3", true], ["2.0.0", "^1.2.3", false], ["1.2.2", "^1.2.3", false],
    ["0.2.9", "^0.2.3", true], ["0.3.0", "^0.2.3", false],
    ["0.0.3", "^0.0.3", true], ["0.0.4", "^0.0.3", false],
    ["1.2.9", "~1.2.3", true], ["1.3.0", "~1.2.3", false],
    ["1.3.0-beta.1", "^1.2.3", false], ["1.3.0-beta.2", "^1.3.0-beta.1", true], ["1.3.0", "^1.3.0-beta.1", true],
    ["1.4.0-alpha.1", "^1.3.0-beta.1", false], ["1.3.0-alpha.1", "^1.3.0-beta.1", false],
  ];
  for (const [version, requirement, expected] of table) {
    assert.equal(satisfies(version, requirement), expected, `${version} against ${requirement}`);
  }
  for (const malformed of [">=1.0.0", "1.2", "^1", "1.2.3 || 2.0.0", "*"]) assert.throws(() => parseRequirement(malformed), malformed);

  for (const version of ["0.9.0", "1.0.0", "1.0.5", "1.2.0", "1.3.0-beta.1", "2.0.0"]) await publishSimple("acme/base", version);
  const home = makeHome();
  const pick = async (requirement: string): Promise<string | null> => {
    const result = await resolveText(home.clone, requestsYaml({ "acme/base": { version: requirement } }));
    if (!result.ok) return null;
    const source = result.lock.packages["acme/base"]!.source;
    return "version" in source ? source.version : null;
  };
  assert.equal(await pick("^1.0.0"), "1.2.0");
  assert.equal(await pick("~1.0.0"), "1.0.5");
  assert.equal(await pick("1.2.0"), "1.2.0");
  assert.equal(await pick("^0.9.0"), "0.9.0");
  assert.equal(await pick("^1.3.0-beta.1"), "1.3.0-beta.1");
  assert.equal(await pick("^2.0.0"), "2.0.0");
  assert.equal(await pick("^3.0.0"), null);
});

test("environments-20: a graph resolves to the first solution of a depth-first search over the version index, yanked, suppressed and cycles", async () => {
  for (const version of ["1.0.0", "1.1.0", "1.2.0", "1.3.0", "2.0.0"]) await publishSimple("acme/lib", version);
  registry.script.yank("acme/lib", "1.2.0");
  registry.script.suppress("acme/lib", "1.3.0");
  for (const version of ["1.0.0", "1.1.0"]) await publishSimple("acme/app", version, { "acme/lib": "^1.0.0" });

  const home = makeHome();
  registry.script.clearRequests();
  const lock = locked(await resolveText(home.clone, requestsYaml({ "acme/app": { version: "^1.0.0" } })));
  assert.deepEqual(lock.packages["acme/app"]!.source, { registry: registry.url, version: "1.1.0", checksum: (lock.packages["acme/app"]!.source as { checksum: string }).checksum });
  assert.equal((lock.packages["acme/lib"]!.source as { version: string }).version, "1.1.0");
  assert.deepEqual(lock.packages["acme/lib"]!.requiredBy, ["acme/app"]);
  assert.deepEqual(lock.packages["acme/app"]!.requiredBy, []);
  // The graph was picked from the version index alone: a version
  // resource was read only for each version picked.
  const reads = registry.script.requests.filter((line) => /^GET \/api\/v1\/packages\/acme\/(app|lib)/.test(line));
  assert.deepEqual(reads.sort(), [
    "GET /api/v1/packages/acme/app",
    "GET /api/v1/packages/acme/app/1.1.0",
    "GET /api/v1/packages/acme/lib",
    "GET /api/v1/packages/acme/lib/1.1.0",
  ]);

  // A yanked version: skipped by caret, taken by exact. A suppressed one: never.
  const yanked = locked(await resolveText(home.clone, requestsYaml({ "acme/lib": { version: "1.2.0" } })));
  assert.equal((yanked.packages["acme/lib"]!.source as { version: string }).version, "1.2.0");
  const caret = await resolveText(home.clone, requestsYaml({ "acme/lib": { version: "^1.2.0" } }));
  assert.equal(caret.ok, false);
  const suppressed = await resolveText(home.clone, requestsYaml({ "acme/lib": { version: "1.3.0" } }));
  assert.equal(suppressed.ok, false);

  // A cycle resolves.
  await publishSimple("acme/ping", "1.0.0", { "acme/pong": "^1.0.0" });
  await publishSimple("acme/pong", "1.0.0", { "acme/ping": "^1.0.0" });
  const cycle = locked(await resolveText(home.clone, requestsYaml({ "acme/ping": { version: "^1.0.0" } })));
  assert.deepEqual(cycle.packages["acme/ping"]!.requiredBy, ["acme/pong"]);
  assert.deepEqual(cycle.packages["acme/pong"]!.requiredBy, ["acme/ping"]);

  // The depth-first search's first solution stands: the required
  // acme/zeta keeps its highest version, though that leaves acme/alpha,
  // earlier in name order, at 1.0.0 where acme/zeta 1.0.0 would take 2.0.0.
  for (const version of ["1.0.0", "2.0.0"]) await publishSimple("acme/alpha", version);
  await publishSimple("acme/zeta", "1.0.0", { "acme/alpha": "^2.0.0" });
  await publishSimple("acme/zeta", "1.1.0", { "acme/alpha": "^1.0.0" });
  await publishSimple("acme/hub", "1.0.0", { "acme/zeta": "^1.0.0" });
  const deep = locked(await resolveText(home.clone, requestsYaml({ "acme/hub": { version: "^1.0.0" } })));
  assert.deepEqual(Object.entries(deep.packages).map(([name, resolution]) => [name, (resolution.source as { version: string }).version]),
    [["acme/alpha", "1.0.0"], ["acme/hub", "1.0.0"], ["acme/zeta", "1.1.0"]]);

  // Conflicting requirements are reported by name before anything is installed.
  await publishSimple("acme/left", "1.0.0", { "acme/lib": "^1.0.0" });
  await publishSimple("acme/right", "1.0.0", { "acme/lib": "^2.0.0" });
  const conflicted = await resolveText(home.clone, requestsYaml({ "acme/left": { version: "^1.0.0" }, "acme/right": { version: "^1.0.0" } }));
  assert.equal(conflicted.ok, false);
  if (!conflicted.ok) {
    const lib = conflicted.conflicts.find((conflict) => conflict.name === "acme/lib");
    assert.ok(lib, JSON.stringify(conflicted.conflicts));
    assert.deepEqual(lib.requirements.filter((entry) => entry.by !== "spex.yaml").sort((a, b) => a.by.localeCompare(b.by)),
      [{ by: "acme/left", requirement: "^1.0.0" }, { by: "acme/right", requirement: "^2.0.0" }]);
  }
  assert.equal(existsSync(join(home.clone, "packages")), false);
});

test("environments-20: selection chooses languages in order, takes what a playbook requires, and refuses a skill name twice", async () => {
  const docs = (version: string, withTips: boolean): Promise<void> => publish(manifestOf("acme/docs", version, {
    guide: { kind: "skill", language: "en" },
    ...(withTips ? { tips: { kind: "skill", language: "en" } } : {}),
    ship: { kind: "playbook", language: "en", requires: ["guide"] },
  }), {
    ...skillFiles("guide"),
    ...skillFiles("guide", "zh-Hans", "使用指南。"),
    ...(withTips ? skillFiles("tips") : {}),
    ...playbookFiles("ship"),
  });
  await docs("1.0.0", true);
  await docs("1.1.0", false);
  const home = makeHome();

  // The environment's language where the artifact has it, else the
  // original as a fallback; what the playbook requires comes with it.
  const preferred = locked(await resolveText(home.clone, requestsYaml({ "acme/docs": { version: "^1.0.0", select: [{ artifact: "ship" }] } }, "zh-Hans")));
  const chosen = preferred.packages["acme/docs"]!;
  assert.equal((chosen.source as { version: string }).version, "1.1.0");
  assert.deepEqual(plain(chosen.artifacts), { guide: { kind: "skill", language: "zh-Hans", fallback: false }, ship: { kind: "playbook", language: "en", fallback: true } });
  assert.ok(chosen.files.some((file) => file.path === "skills/zh-Hans/guide/SKILL.md"));
  assert.ok(!chosen.files.some((file) => file.path === "skills/en/guide/SKILL.md"));
  assert.ok(chosen.files.some((file) => file.path === "playbooks/en/ship/ship.md"));
  assert.ok(chosen.files.some((file) => file.path === "meta.yaml"));
  assert.deepEqual(plain(chosen.exports), { guide: "guide", ship: "ship" });

  // A select entry's language comes before the environment's.
  const named = locked(await resolveText(home.clone, requestsYaml({ "acme/docs": { version: "^1.0.0", select: [{ artifact: "guide", language: "en" }] } }, "zh-Hans")));
  assert.deepEqual(plain(named.packages["acme/docs"]!.artifacts), { guide: { kind: "skill", language: "en", fallback: false } });

  // No language wanted: the original, no fallback.
  const original = locked(await resolveText(home.clone, requestsYaml({ "acme/docs": { version: "^1.0.0" } })));
  assert.deepEqual(plain(original.packages["acme/docs"]!.artifacts), { guide: { kind: "skill", language: "en", fallback: false }, ship: { kind: "playbook", language: "en", fallback: false } });

  // A newer release lacking a selected artifact does not block an older solution.
  const older = locked(await resolveText(home.clone, requestsYaml({ "acme/docs": { version: "^1.0.0", select: [{ artifact: "tips" }] } })));
  assert.equal((older.packages["acme/docs"]!.source as { version: string }).version, "1.0.0");

  // Two skills of one name are refused naming both, until one is aliased.
  await publishSimple("acme/one", "1.0.0", undefined, "helper");
  await publishSimple("acme/two", "1.0.0", undefined, "helper");
  const clash = await resolveText(home.clone, requestsYaml({ "acme/one": { version: "^1.0.0" }, "acme/two": { version: "^1.0.0" } }));
  assert.equal(clash.ok, false);
  if (!clash.ok) {
    assert.deepEqual(clash.conflicts, [{ name: "helper", requirements: [{ by: "acme/one", requirement: "skill helper" }, { by: "acme/two", requirement: "skill helper" }] }]);
  }
  const aliased = locked(await resolveText(home.clone, requestsYaml({ "acme/one": { version: "^1.0.0" }, "acme/two": { version: "^1.0.0", alias: { helper: "helper-two" } } })));
  assert.deepEqual(plain(aliased.packages["acme/two"]!.exports), { "helper-two": "helper" });
  // A playbook's generated skill counts among the skill names.
  await publish(manifestOf("acme/three", "1.0.0", { helper: { kind: "playbook", language: "en" } }), playbookFiles("helper"));
  const playbookClash = await resolveText(home.clone, requestsYaml({ "acme/one": { version: "^1.0.0" }, "acme/three": { version: "^1.0.0" } }));
  assert.equal(playbookClash.ok, false);
  // Two playbooks of one id are refused naming both, alias or not: an
  // alias names a playbook's skill, never the playbook.
  await publish(manifestOf("acme/fleet", "1.0.0", { ship: { kind: "playbook", language: "en" } }), playbookFiles("ship"));
  const sameId = [{ name: "ship", requirements: [{ by: "acme/docs", requirement: "playbook ship" }, { by: "acme/fleet", requirement: "playbook ship" }] }];
  for (const fleet of [{ version: "^1.0.0" }, { version: "^1.0.0", alias: { ship: "ship-fleet" } }]) {
    const twoShips = await resolveText(home.clone, requestsYaml({ "acme/docs": { version: "^1.0.0" }, "acme/fleet": fleet }));
    assert.deepEqual(twoShips.ok ? [] : twoShips.conflicts, sameId, JSON.stringify(fleet));
  }
});

test("environments-20: the lock is exactly its encoding, and a second home installs it byte for byte resolving nothing", async () => {
  await publish(manifestOf("acme/press", "1.0.0", { press: { kind: "skill", language: "en" }, roll: { kind: "playbook", language: "en", requires: ["press"] } }), {
    ...skillFiles("press"),
    "skills/en/press/bin/press.sh": { data: "#!/bin/sh\necho press\n", executable: true },
    ...playbookFiles("roll"),
    "README.md": "# Press\n",
  });
  const first = makeHome();
  const text = requestsYaml({ "acme/press": { version: "^1.0.0" }, "acme/app": { version: "^1.0.0" } });
  const lock = locked(await resolveText(first.clone, text));
  const written = await writeLock(join(first.clone, "spex.lock"), lock);
  const raw = parseYaml(written) as Record<string, unknown>;
  assert.deepEqual(Object.keys(raw), ["format", "requests", "packages"]);
  assert.equal(raw.format, 1);
  assert.equal(raw.requests, requestsDigest(readFileSync(join(first.clone, "spex.yaml"))));
  for (const [name, resolution] of Object.entries(raw.packages as Record<string, Record<string, unknown>>)) {
    assert.deepEqual(Object.keys(resolution), ["source", "required-by", "artifacts", "files", "exports"], name);
    assert.deepEqual(Object.keys(resolution.source as object), ["registry", "version", "checksum"]);
    for (const file of resolution.files as Record<string, unknown>[]) assert.deepEqual(Object.keys(file), ["path", "sha256", "executable"]);
    for (const artifact of Object.values(resolution.artifacts as Record<string, Record<string, unknown>>)) assert.deepEqual(Object.keys(artifact), ["kind", "language", "fallback"]);
  }
  assert.deepEqual(plain(lock.packages["acme/press"]!.artifacts), { press: { kind: "skill", language: "en", fallback: false }, roll: { kind: "playbook", language: "en", fallback: false } });
  assert.deepEqual(await readLock(join(first.clone, "spex.lock")), lock);
  // A lock written before artifacts carried their kind still reads, the
  // kind unknown, and writes back the same bytes until a resolve.
  const kindless = written.replace(/kind: [a-z]+, /g, "");
  assert.notEqual(kindless, written);
  const older = parseLock(kindless);
  assert.deepEqual(plain(older.packages["acme/press"]!.artifacts), { press: { language: "en", fallback: false }, roll: { language: "en", fallback: false } });
  assert.equal(serializeLock(older), kindless);
  // A kind that is not one of the five is refused.
  assert.throws(() => parseLock(written.replace("press: { kind: skill", "press: { kind: tool")), /packages\.acme\/press\.artifacts\.press is not \{kind, language, fallback\}/);
  const firstReport = await install({ cloneDir: first.clone, lock, store: first.store, cache: first.cache, registry: client, git: gitSource(first.cache), workingFolder: null });
  assert.deepEqual(firstReport.installed, ["acme/app", "acme/lib", "acme/press"]);

  const second = makeHome();
  mkdirSync(second.clone, { recursive: true });
  cpSync(join(first.clone, "spex.yaml"), join(second.clone, "spex.yaml"));
  cpSync(join(first.clone, "spex.lock"), join(second.clone, "spex.lock"));
  registry.script.clearRequests();
  const secondLock = (await readLock(join(second.clone, "spex.lock")))!;
  const report = await install({ cloneDir: second.clone, lock: secondLock, store: second.store, cache: second.cache, registry: client, git: gitSource(second.cache), workingFolder: null });
  assert.equal(report.unchanged, false);
  // Installing from the lock resolves nothing: no version index is read.
  assert.deepEqual(registry.script.requests.filter((line) => /^GET \/api\/v1\/packages\/[^/]+\/[^/]+$/.test(line)), []);
  // A store lacking every file takes the release archive.
  assert.ok(registry.script.requests.some((line) => /^GET \/api\/v1\/packages\/acme\/press\/1\.0\.0\/download$/.test(line)));
  assert.deepEqual(snapshot(join(second.clone, "packages")), snapshot(join(first.clone, "packages")));
  assert.equal(readFileSync(join(second.clone, "spex.lock"), "utf8"), written);
  // A second install of the same lock changes nothing.
  const again = await install({ cloneDir: second.clone, lock: secondLock, store: second.store, cache: second.cache, registry: client, git: gitSource(second.cache), workingFolder: null });
  assert.equal(again.unchanged, true);
});

test("environments-19, environments-20: artifact ids alike to object members, constructor and __proto__, stand like any other id", async () => {
  const meta = [
    "format: 2", "org: acme", "name: members", "version: 1.0.0", "description: Ids alike to object members", "license: Apache-2.0", "artifacts:",
    "  constructor: {kind: skill, language: en}", "  __proto__: {kind: applet}", "  guide: {kind: skill, language: en}", "",
  ].join("\n");
  const files: Record<string, ReleaseFixture> = { ...skillFiles("constructor"), ...skillFiles("guide"), "applets/__proto__/index.html": "<!doctype html>\n<title>Members</title>\n" };
  const ids = ["__proto__", "constructor", "guide"];

  // The manifest keeps every id, read and written again.
  const { manifest, issues } = parseManifestText(meta);
  assert.deepEqual(issues, []);
  assert.deepEqual(Object.keys(manifest!.artifacts).sort(), ids);
  assert.deepEqual(Object.keys(parseManifestText(serializeManifest(manifest!)).manifest!.artifacts).sort(), ids);
  assert.deepEqual(plain(artifactLanguages(manifest!, Object.keys(files).map((path) => ({ path })))), JSON.parse('{"__proto__": [], "constructor": ["en"], "guide": ["en"]}'));

  // The registry accepts the release, and its version index names every id.
  const dir = join(scratchDir("spex-release-"), "release");
  await makeRelease(dir, meta, files);
  await publishRelease(client, dir);
  assert.deepEqual(Object.keys((await client.index("acme/members")).versions[0]!.artifacts).sort(), ids);

  // Resolution selects each; an alias of another skill leaves constructor its own name.
  const home = makeHome("me/members-spex");
  const lock = locked(await resolveText(home.clone, requestsYaml({ "acme/members": { version: "^1.0.0", alias: { guide: "member-guide" } } })));
  const resolution = lock.packages["acme/members"]!;
  assert.deepEqual(plain(resolution.artifacts), JSON.parse('{"__proto__": {"kind": "applet", "language": null, "fallback": false}, "constructor": {"kind": "skill", "language": "en", "fallback": false}, "guide": {"kind": "skill", "language": "en", "fallback": false}}'));
  assert.deepEqual(plain(resolution.exports), { constructor: "constructor", "member-guide": "guide" });
  assert.ok(resolution.files.some((file) => file.path === "applets/__proto__/index.html"));

  // The lock writes every id and reads it back byte for byte.
  const written = await writeLock(join(home.clone, "spex.lock"), lock);
  const read = (await readLock(join(home.clone, "spex.lock")))!;
  assert.deepEqual(read, lock);
  assert.equal(serializeLock(parseLock(written)), written);

  // Installed and exported: the skill under its own name, and no playbook to launch.
  await install({ cloneDir: home.clone, lock: read, store: home.store, cache: home.cache, registry: client, git: gitSource(home.cache), workingFolder: null });
  assert.ok(existsSync(join(home.clone, "packages/acme/members/applets/__proto__/index.html")));
  const report = await exportEnvironment({ cloneDir: home.clone, lock: read, workingFolder: null, userHome: null, agents: ["claude"], packagesDir: join(home.clone, "packages") });
  assert.deepEqual(report.skills, ["constructor", "member-guide"]);
  assert.deepEqual([...moduleLocations(read, home.clone, null).keys()], []);
});

// ---------------------------------------------------------------------------
// environments-21: installing
// ---------------------------------------------------------------------------

test("environments-21: files land with bytes and flags through a store keeping each once, verified, atomic, collected", async () => {
  await publish(manifestOf("acme/kit", "1.0.0", { tidy: { kind: "skill", language: "en" } }), {
    ...skillFiles("tidy"),
    "skills/en/tidy/same-a.txt": "same bytes\n",
    "skills/en/tidy/same-b.txt": "same bytes\n",
    "skills/en/tidy/same-x.sh": { data: "same bytes\n", executable: true },
    "skills/en/tidy/other.txt": "other\n",
  });
  await publish(manifestOf("acme/kit", "1.1.0", { tidy: { kind: "skill", language: "en" } }), { ...skillFiles("tidy", "en", "newer"), "skills/en/tidy/same-a.txt": "same bytes\n" });
  await publish(manifestOf("acme/peer", "1.0.0", { peer: { kind: "skill", language: "en" } }), { ...skillFiles("peer"), "skills/en/peer/same.txt": "same bytes\n" });
  const home = makeHome("me/kit-spex");
  const text = requestsYaml({ "acme/kit": { version: "1.0.0" } });
  const lock = locked(await resolveText(home.clone, text));
  await writeLock(join(home.clone, "spex.lock"), lock);
  const base = { cloneDir: home.clone, store: home.store, cache: home.cache, registry: client, git: gitSource(home.cache), workingFolder: null };
  const report = await install({ ...base, lock });
  assert.deepEqual(report, { installed: ["acme/kit"], missingPaths: [], unchanged: false });

  // Every selected file with its bytes and executable flag.
  const root = join(home.clone, "packages", "acme", "kit");
  for (const file of lock.packages["acme/kit"]!.files) {
    const installed = join(root, ...file.path.split("/"));
    assert.equal(sha256Hex(readFileSync(installed)), file.sha256, file.path);
    assert.equal((statSync(installed).mode & 0o100) !== 0, file.executable, file.path);
  }
  // Each distinct file once, the executable copy apart.
  const same = sha256Hex("same bytes\n");
  assert.ok(home.store.has(same, false) && home.store.has(same, true));
  assert.equal(statSync(join(root, "skills/en/tidy/same-a.txt")).ino, statSync(home.store.pathOf(same, false)).ino);
  assert.equal(statSync(join(root, "skills/en/tidy/same-b.txt")).ino, statSync(home.store.pathOf(same, false)).ino);
  assert.equal(statSync(join(root, "skills/en/tidy/same-x.sh")).ino, statSync(home.store.pathOf(same, true)).ino);
  const distinct = new Set(lock.packages["acme/kit"]!.files.map((file) => storeKey(file.sha256, file.executable)));
  assert.deepEqual(new Set(home.store.keys()), distinct);
  assert.equal(statSync(home.store.pathOf(same, false)).mode & 0o777, 0o444);
  assert.equal(statSync(home.store.pathOf(same, true)).mode & 0o777, 0o555);

  // A wrong digest installs nothing and is reported.
  const before = snapshot(join(home.clone, "packages"));
  const tampered = structuredClone(lock);
  tampered.packages["acme/kit"]!.files.find((file) => file.path === "skills/en/tidy/other.txt")!.sha256 = "0".repeat(64);
  await assert.rejects(install({ ...base, lock: tampered }), (error: unknown) =>
    error instanceof InstallError && error.packageName === "acme/kit" && /other\.txt/.test(error.message));
  assert.deepEqual(snapshot(join(home.clone, "packages")), before);

  // Atomic: a failure between fetch and replace leaves the last files whole.
  const newer = locked(await resolveText(home.clone, requestsYaml({ "acme/kit": { version: "1.1.0" } })));
  await assert.rejects(install({ ...base, lock: newer, beforeReplace: () => { throw new Error("power cut"); } }), InstallError);
  assert.deepEqual(snapshot(join(home.clone, "packages")), before);
  assert.deepEqual(existsSync(join(home.cache, "staging")) ? readdirSync(join(home.cache, "staging")) : [], []);

  // A file leaves the store only when no lock on the device selects it.
  writeFileSync(join(home.clone, "spex.yaml"), text);
  const peerHome = cloneOf(home, "me/peer-spex");
  const peerLock = locked(await resolveText(peerHome, requestsYaml({ "acme/peer": { version: "1.0.0" } })));
  await install({ ...base, cloneDir: peerHome, lock: peerLock });
  assert.deepEqual(home.store.gc(lockStoreKeys([lock, newer, peerLock])), []);
  const removed = home.store.gc(lockStoreKeys([peerLock]));
  assert.ok(removed.includes(storeKey(same, true)));
  assert.ok(!removed.includes(storeKey(same, false)), "a file another lock selects stays");
  assert.ok(home.store.has(same, false));

  // cache/ may be deleted: an install that needs it rebuilds it.
  rmSync(home.cache, { recursive: true, force: true });
  rmSync(join(home.clone, "packages"), { recursive: true, force: true });
  registry.script.clearRequests();
  const rebuilt = await install({ ...base, lock });
  // Half the files or fewer missing: fetched as raw files.
  assert.ok(registry.script.requests.includes("GET /acme/kit/1.0.0/skills/en/tidy/other.txt"), JSON.stringify(registry.script.requests));
  assert.equal(rebuilt.unchanged, false);
  assert.ok(existsSync(join(home.cache, "registry", "acme", "kit", "1.0.0.json")));
  assert.deepEqual(snapshot(join(home.clone, "packages")), before);

  // A changed spex.yaml marks the lock stale: nothing new is installed.
  const edited = await setRequest(join(home.clone, "spex.yaml"), "acme/peer", { version: "^1.0.0" });
  assert.match(edited.text, /^# The environment's requests\.\n/);
  assert.deepEqual(Object.keys(edited.requests.packages), ["acme/kit", "acme/peer"]);
  const stale = await install({ ...base, lock: newer });
  assert.equal(stale.installed.length, 0);
  assert.ok(stale.stale?.some((reason) => /spex\.yaml changed/.test(reason)));
  assert.deepEqual(snapshot(join(home.clone, "packages")), before);
});

test("environments-21: a path source is used in place per working folder, missing reported, its manifest change stale", async () => {
  await publishSimple("acme/solid", "1.0.0");
  const home = makeHome("acme/proj-spex");
  const local = (folder: string, version: string, note: string, withTidy = true): Promise<string> => makeRelease(join(folder, "tools", "local"), manifestOf("acme/local", version, {
    pave: { kind: "playbook", language: "en" },
    ...(withTidy ? { tidy: { kind: "skill", language: "en", requires: ["pave"] } } : {}),
  }), { ...playbookFiles("pave"), ...(withTidy ? skillFiles("tidy", "en", note) : {}) });
  const first = scratchDir("spex-wf-");
  const second = scratchDir("spex-wf-");
  const bare = scratchDir("spex-wf-");
  await local(first, "0.1.0", "the first folder's copy");
  await local(second, "0.1.0", "the second folder's copy");
  const text = requestsYaml({ "acme/local": { path: "tools/local" }, "acme/solid": { version: "^1.0.0" } });
  const lock = locked(await resolveText(home.clone, text, { workingFolder: first }));
  assert.deepEqual(plain(lock.packages["acme/local"]!.source), { path: "tools/local", version: "0.1.0", dependencies: {}, requires: { tidy: ["pave"] } });
  assert.deepEqual(lock.packages["acme/local"]!.files, []);
  const base = { cloneDir: home.clone, store: home.store, cache: home.cache, registry: client, git: gitSource(home.cache), lock };

  const report = await install({ ...base, workingFolder: first });
  assert.deepEqual(report.missingPaths, []);
  assert.equal(existsSync(join(home.clone, "packages", "acme", "local")), false, "a path source copies nothing");
  assert.equal(moduleLocations(lock, home.clone, first).get("pave")!.module, join(first, "tools/local/playbooks/en/pave/pave.playbook/pave.registry.mjs"));
  // A second working folder of the same project runs its own copy.
  assert.equal(moduleLocations(lock, home.clone, second).get("pave")!.module, join(second, "tools/local/playbooks/en/pave/pave.playbook/pave.registry.mjs"));
  await exportEnvironment({ cloneDir: home.clone, lock, workingFolder: second, userHome: null, agents: ["claude"], packagesDir: join(home.clone, "packages") });
  assert.match(readFileSync(join(second, ".claude/skills/tidy/SKILL.md"), "utf8"), /the second folder's copy/);
  // A device whose working folder lacks it reports it missing; the rest installs.
  rmSync(join(home.clone, "packages"), { recursive: true, force: true });
  const missing = await install({ ...base, workingFolder: bare });
  assert.deepEqual(missing.missingPaths, ["acme/local"]);
  assert.ok(existsSync(join(home.clone, "packages", "acme", "solid", "meta.yaml")));

  // A changed path-source manifest and a missing selected artifact mark the lock stale.
  await local(first, "0.2.0", "bumped");
  const bumped = await install({ ...base, workingFolder: first });
  assert.ok(bumped.stale?.some((reason) => /changed version from 0\.1\.0 to 0\.2\.0/.test(reason)), JSON.stringify(bumped));
  rmSync(join(first, "tools", "local"), { recursive: true, force: true });
  await local(first, "0.1.0", "", false);
  const lacking = await install({ ...base, workingFolder: first });
  assert.ok(lacking.stale?.some((reason) => /no longer holds the selected artifact tidy/.test(reason)), JSON.stringify(lacking));
});

test("environments-21: a Git source at a branch locks its commit and installs it through the host's credential", async () => {
  const scratch = scratchDir("spex-git-");
  const { run, git } = hermeticGit(scratch);
  const root = join(scratch, "host");
  mkdirSync(join(root, "acme"), { recursive: true });
  git(scratch, ["init", "--quiet", "--bare", "-b", "main", join(root, "acme", "tools.git")]);
  const work = join(scratch, "work");
  git(scratch, ["init", "--quiet", "-b", "main", work]);
  await makeRelease(work, manifestOf("acme/tools", "1.0.0", { sharpen: { kind: "skill", language: "en" } }), {
    ...skillFiles("sharpen", "en", "first commit"),
    "skills/en/sharpen/hone.sh": { data: "#!/bin/sh\necho hone\n", executable: true },
  });
  git(work, ["add", "-A"]);
  git(work, ["commit", "--quiet", "-m", "first"]);
  git(work, ["push", "--quiet", join(root, "acme", "tools.git"), "main"]);
  const first = git(work, ["rev-parse", "HEAD"]);

  const host = await startGitHttpHost({ root, username: "spex", password: "s3cret" });
  try {
    const repo = `${host.url}/acme/tools.git`;
    const home = makeHome();
    const credential = async () => ({ username: "spex", secret: "s3cret" });
    const source = gitSource(home.cache, { runGit: run, credentialArgs: testCredentialArgs(join(scratch, "credentials")) });
    const text = requestsYaml({ "acme/tools": { git: repo, rev: "main" } });

    // Without the credential the host refuses.
    await assert.rejects(resolveText(home.clone, text, { git: gitSource(join(scratch, "nocred"), { runGit: run }) }), GitSourceError);

    const lock = locked(await resolveText(home.clone, text, { git: source, gitCredential: credential }));
    assert.deepEqual(lock.packages["acme/tools"]!.source, { git: repo, commit: first });
    assert.ok(lock.packages["acme/tools"]!.files.some((file) => file.path === "skills/en/sharpen/hone.sh" && file.executable));

    // The branch moves on; the lock holds the commit, and installs it.
    writeFileSync(join(work, "skills/en/sharpen/SKILL.md"), skillText("sharpen", "second commit"));
    git(work, ["commit", "--quiet", "-am", "second"]);
    git(work, ["push", "--quiet", join(root, "acme", "tools.git"), "main"]);
    const elsewhere = makeHome();
    mkdirSync(elsewhere.clone, { recursive: true });
    writeFileSync(join(elsewhere.clone, "spex.yaml"), text);
    const refusedBefore = host.refused;
    const report = await install({
      cloneDir: elsewhere.clone, lock, store: elsewhere.store, cache: elsewhere.cache, registry: client,
      git: gitSource(elsewhere.cache, { runGit: run, credentialArgs: testCredentialArgs(join(scratch, "credentials")) }),
      gitCredential: credential, workingFolder: null,
    });
    assert.deepEqual(report.installed, ["acme/tools"]);
    assert.ok(host.refused > refusedBefore, "the fetch went through the host's credential challenge");
    assert.match(readFileSync(join(elsewhere.clone, "packages/acme/tools/skills/en/sharpen/SKILL.md"), "utf8"), /first commit/);
    assert.ok(statSync(join(elsewhere.clone, "packages/acme/tools/skills/en/sharpen/hone.sh")).mode & 0o100);
  } finally {
    await host.close();
  }
});

test("environments-21: a private namespace installs with the device's app token and refuses without, naming the spec package", async () => {
  registry.script.setPrivate("vault", new Set(["app-token-1"]));
  const member = new RegistryClient({ url: registry.url, token: async () => "app-token-1" });
  const stranger = new RegistryClient({ url: registry.url, token: async () => "someone-else" });
  const anonymous = new RegistryClient({ url: registry.url });
  await publish(manifestOf("vault/secrets", "1.0.0", { keep: { kind: "skill", language: "en" } }), skillFiles("keep"), member);

  const home = makeHome();
  const text = requestsYaml({ "vault/secrets": { version: "^1.0.0" } });
  const lock = locked(await resolveText(home.clone, text, { through: member }));
  const report = await install({ cloneDir: home.clone, lock, store: home.store, cache: home.cache, registry: member, git: gitSource(home.cache), workingFolder: null });
  assert.deepEqual(report.installed, ["vault/secrets"]);

  const other = makeHome();
  mkdirSync(other.clone, { recursive: true });
  writeFileSync(join(other.clone, "spex.yaml"), text);
  await assert.rejects(install({ cloneDir: other.clone, lock, store: other.store, cache: other.cache, registry: anonymous, git: gitSource(other.cache), workingFolder: null }),
    (error: unknown) => error instanceof InstallError && error.packageName === "vault/secrets" && /vault\/secrets/.test(error.message));
  await assert.rejects(resolveText(other.clone, text, { through: stranger }),
    (error: unknown) => error instanceof RegistryError && error.kind === "forbidden" && error.packageName === "vault/secrets");
  const unseen = await resolveText(other.clone, text, { through: anonymous });
  assert.equal(unseen.ok, false);
  if (!unseen.ok) assert.equal(unseen.conflicts[0]!.name, "vault/secrets");
  // An outage is reported naming what could not be read.
  registry.script.unavailable(1);
  await assert.rejects(resolveText(other.clone, text, { through: member }),
    (error: unknown) => error instanceof RegistryError && error.kind === "unavailable" && error.packageName === "vault/secrets");
});

// ---------------------------------------------------------------------------
// environments-22: exports
// ---------------------------------------------------------------------------

test("environments-22: skills and playbooks export to agent folders, the user's home and the launcher", async () => {
  await publish(manifestOf("acme/kit2", "1.0.0", {
    lint: { kind: "skill", language: "en" },
    fmt: { kind: "skill", language: "en" },
    ship: { kind: "playbook", language: "en" },
  }), { ...skillFiles("lint", "en", "the project's lint"), ...skillFiles("fmt"), ...playbookFiles("ship") });
  await publish(manifestOf("acme/mine", "1.0.0", {
    lint: { kind: "skill", language: "en" },
    "own-pb": { kind: "playbook", language: "en" },
  }), { ...skillFiles("lint", "en", "my own lint"), ...playbookFiles("own-pb") });

  const scratch = scratchDir("spex-export-");
  const { git } = hermeticGit(scratch);
  const home = makeHome("acme/kit2-spex");
  const workingFolder = join(scratch, "project");
  git(scratch, ["init", "--quiet", "-b", "main", workingFolder]);
  await makeRelease(join(workingFolder, "tools", "walk"), manifestOf("acme/walker", "0.1.0", { walk: { kind: "playbook", language: "en" } }), playbookFiles("walk"));
  const userHome = join(scratch, "user");
  const projectKey = "acme/kit2-spex";
  const ownKey = "me/me-spex";
  const ownClone = cloneOf(home, ownKey);

  const projectText = requestsYaml({ "acme/kit2": { version: "^1.0.0", alias: { fmt: "format-code" } }, "acme/walker": { path: "tools/walk" } });
  const projectLock = locked(await resolveText(home.clone, projectText, { workingFolder }));
  const base = { store: home.store, cache: home.cache, registry: client, git: gitSource(home.cache) };
  await install({ ...base, cloneDir: home.clone, lock: projectLock, workingFolder });
  const report = await exportEnvironment({ cloneDir: home.clone, lock: projectLock, workingFolder, userHome: null, agents: ["claude", "codex"], packagesDir: join(home.clone, "packages") });
  assert.deepEqual(report.skills, ["format-code", "lint", "ship", "walk"]);
  assert.deepEqual(report.unsupportedAgents, ["codex"]);
  assert.deepEqual(report.folders, [{ agent: "claude", level: "project", dir: join(workingFolder, ".claude/skills") }]);
  for (const name of report.skills) {
    assert.ok(existsSync(join(home.clone, "skills", name, "SKILL.md")), name);
    assert.ok(existsSync(join(workingFolder, ".claude/skills", name, "SKILL.md")), name);
  }
  // An aliased skill is copied with its name rewritten; the verified file is not changed.
  assert.match(readFileSync(join(workingFolder, ".claude/skills/format-code/SKILL.md"), "utf8"), /^---\nname: format-code\n/);
  assert.match(readFileSync(join(home.clone, "packages/acme/kit2/skills/en/fmt/SKILL.md"), "utf8"), /^---\nname: fmt\n/);
  // Git ignores the exports.
  const exclude = readFileSync(join(workingFolder, ".git/info/exclude"), "utf8");
  for (const name of report.skills) assert.ok(exclude.includes(`/.claude/skills/${name}/`), name);
  assert.equal(git(workingFolder, ["status", "--porcelain", "--untracked-files=all", "--", ".claude"]), "");
  // The generated skill names the spec package, version and id.
  const ship = readFileSync(join(workingFolder, ".claude/skills/ship/SKILL.md"), "utf8");
  assert.match(ship, /^---\nname: ship\ndescription: Runs the ship playbook of acme\/kit2 1\.0\.0 in this working folder\.\n---\n/);
  assert.match(ship, /`ship`.*`acme\/kit2`.*`1\.0\.0`.*through Spex in this working folder/s);

  // Your own group's skills go to the user's home; a name the project
  // also exports stands in both, each from where it came.
  const ownText = requestsYaml({ "acme/mine": { version: "^1.0.0" } });
  const ownLock = locked(await resolveText(ownClone, ownText));
  await install({ ...base, cloneDir: ownClone, lock: ownLock, workingFolder: null });
  const ownReport = await exportEnvironment({ cloneDir: ownClone, lock: ownLock, workingFolder: null, userHome, agents: ["claude"], packagesDir: join(ownClone, "packages") });
  assert.deepEqual(ownReport.folders, [{ agent: "claude", level: "user", dir: join(userHome, ".claude/skills") }]);
  assert.match(readFileSync(join(userHome, ".claude/skills/lint/SKILL.md"), "utf8"), /my own lint/);
  assert.match(readFileSync(join(workingFolder, ".claude/skills/lint/SKILL.md"), "utf8"), /the project's lint/);

  // A session hands the launcher the project's playbook, your own
  // group's where the project lacks it, the path source's in the folder.
  await writeLock(join(home.clone, "spex.lock"), projectLock);
  await writeLock(join(ownClone, "spex.lock"), ownLock);
  const modules = environmentsOver(home, ownKey, { [projectKey]: { dir: home.clone, workingFolder }, [ownKey]: { dir: ownClone, workingFolder: null } }).modulesFor(projectKey);
  assert.equal(modules.repository, projectKey);
  assert.equal(moduleOf(modules.find("ship")), join(home.clone, "packages/acme/kit2/playbooks/en/ship/ship.playbook/ship.registry.mjs"));
  assert.equal(moduleOf(modules.find("own-pb")), join(ownClone, "packages/acme/mine/playbooks/en/own-pb/own-pb.playbook/own-pb.registry.mjs"));
  assert.equal(moduleOf(modules.find("walk")), join(workingFolder, "tools/walk/playbooks/en/walk/walk.playbook/walk.registry.mjs"));
  const loaded = (await import(pathToFileURL(moduleOf(modules.find("ship"))!).href)) as { default: { id: string } };
  assert.equal(loaded.default.id, "ship");
  // A config enabling a playbook no environment exports is refused naming both.
  await assert.rejects(composeConfig(sessionConfig("ghost"), undefined, undefined, { modules }),
    (error: Error) => error.message.includes("ghost") && error.message.includes(projectKey));

  // A re-export removes a skill the lock no longer selects and leaves a reader's.
  mkdirSync(join(workingFolder, ".claude/skills/mine"), { recursive: true });
  writeFileSync(join(workingFolder, ".claude/skills/mine/SKILL.md"), skillText("mine"));
  const narrowed = locked(await resolveText(home.clone, requestsYaml({ "acme/kit2": { version: "^1.0.0", select: [{ artifact: "ship" }, { artifact: "fmt" }], alias: { fmt: "format-code" } } }), { workingFolder }));
  await install({ ...base, cloneDir: home.clone, lock: narrowed, workingFolder });
  const again = await exportEnvironment({ cloneDir: home.clone, lock: narrowed, workingFolder, userHome: null, agents: ["claude"], packagesDir: join(home.clone, "packages") });
  assert.deepEqual(again.removed.sort(), ["lint", "walk"]);
  assert.equal(existsSync(join(workingFolder, ".claude/skills/lint")), false);
  assert.ok(existsSync(join(workingFolder, ".claude/skills/mine/SKILL.md")));
  assert.ok(!readFileSync(join(workingFolder, ".git/info/exclude"), "utf8").includes("/.claude/skills/lint/"));
});

test("environments-22: an aliased playbook is found and enabled by its id, its alias naming only its skill", async () => {
  await publish(manifestOf("acme/dock", "1.0.0", { moor: { kind: "playbook", language: "en" } }), launchablePlaybookFiles("moor"));
  await publish(manifestOf("acme/berth", "1.0.0", { moor: { kind: "playbook", language: "en" } }), launchablePlaybookFiles("moor"));
  const projectKey = "acme/dock-spex";
  const ownKey = "me/me-spex";
  const home = makeHome(projectKey);
  const ownClone = cloneOf(home, ownKey);
  const base = { store: home.store, cache: home.cache, registry: client, git: gitSource(home.cache), workingFolder: null };
  // The project aliases its playbook; your own group's environment has
  // another playbook of the same id.
  const projectLock = locked(await resolveText(home.clone, requestsYaml({ "acme/dock": { version: "^1.0.0", alias: { moor: "moor-dock" } } })));
  assert.deepEqual(plain(projectLock.packages["acme/dock"]!.exports), { "moor-dock": "moor" });
  const ownLock = locked(await resolveText(ownClone, requestsYaml({ "acme/berth": { version: "^1.0.0" } })));
  for (const [clone, lock] of [[home.clone, projectLock], [ownClone, ownLock]] as const) {
    await writeLock(join(clone, "spex.lock"), lock);
    await install({ ...base, cloneDir: clone, lock });
  }
  // The alias names the exported skill, which runs the playbook by its id.
  const report = await exportEnvironment({ cloneDir: home.clone, lock: projectLock, workingFolder: null, userHome: null, agents: ["claude"], packagesDir: join(home.clone, "packages") });
  assert.deepEqual(report.skills, ["moor-dock"]);
  assert.match(readFileSync(join(home.clone, "skills/moor-dock/SKILL.md"), "utf8"), /^---\nname: moor-dock\ndescription: Runs the moor playbook of acme\/dock 1\.0\.0 /);

  // A session finds the playbook by its id, the project's before your
  // own group's, and never by its alias.
  const environments = environmentsOver(home, ownKey, { [projectKey]: { dir: home.clone, workingFolder: null }, [ownKey]: { dir: ownClone, workingFolder: null } });
  const modules = environments.modulesFor(projectKey);
  const projectModule = join(home.clone, "packages/acme/dock/playbooks/en/moor/moor.playbook/moor.registry.mjs");
  assert.equal(moduleOf(modules.find("moor")), projectModule);
  assert.equal(modules.find("moor-dock"), undefined);
  assert.equal(moduleOf(environments.modulesFor(null).find("moor")), join(ownClone, "packages/acme/berth/playbooks/en/moor/moor.playbook/moor.registry.mjs"));
  // `playbooks.moor` enables it from the project's environment; the alias enables nothing.
  const composed = await composeConfig(sessionConfig("moor"), undefined, undefined, { modules });
  assert.deepEqual(composed.playbooks.map((playbook) => [playbook.id, playbook.from]), [["moor", projectModule]]);
  await assert.rejects(composeConfig(sessionConfig("moor-dock"), undefined, undefined, { modules }),
    (error: Error) => error.message.includes("moor-dock") && error.message.includes(projectKey));
});

// ---------------------------------------------------------------------------
// environments-23: the built-in spec package
// ---------------------------------------------------------------------------

test("environments-23: the built-in spec package seeds, resolves offline, launches, and a newer release seeds beside the older", async () => {
  const home = makeHome();
  const shipped = builtinPackage();
  const seeded = await seedBuiltinPackage(home.store, home.cache, shipped);
  for (const file of seeded.files) assert.ok(home.store.has(file.sha256, file.executable), file.path);
  assert.ok(existsSync(join(home.cache, "builtins", `${shipped.version}.json`)));

  // No registry is reachable.
  const offline = new RegistryClient({ url: "http://127.0.0.1:9" });
  const source = (): ReturnType<typeof compositeRegistry> =>
    compositeRegistry(builtinRegistrySource({ store: home.store, cacheDir: home.cache, shipped }), offline);
  const text = requestsYaml({ "sublang/playbooks": { version: `^${shipped.version}` } });
  const ownClone = cloneOf(home, "me/me-spex");
  const projectClone = cloneOf(home, "acme/fresh-spex");
  const locks: Record<string, Lock> = {};
  for (const clone of [ownClone, projectClone]) {
    const lock = locked(await resolveText(clone, text, { through: source() }));
    assert.deepEqual(lock.packages["sublang/playbooks"]!.source, { registry: offline.url, version: shipped.version, checksum: seeded.checksum });
    assert.deepEqual(Object.keys(lock.packages["sublang/playbooks"]!.artifacts), ["branch", "code", "decide", "dev", "inspect", "pr", "review"]);
    await writeLock(join(clone, "spex.lock"), lock);
    const report = await install({ cloneDir: clone, lock, store: home.store, cache: home.cache, registry: source(), git: gitSource(home.cache), workingFolder: null });
    assert.deepEqual(report.installed, ["sublang/playbooks"]);
    locks[clone] = lock;
  }

  // Every built-in playbook loads from the installed spec package.
  const locations = moduleLocations(locks[projectClone]!, projectClone, null);
  assert.deepEqual([...locations.keys()].sort(), ["branch", "code", "decide", "dev", "inspect", "pr", "review"]);
  for (const [id, location] of locations) {
    assert.ok(location.builtin && location.present, id);
    assert.ok(location.module.startsWith(join(projectClone, "packages", "sublang", "playbooks", "playbooks", "en", id)), location.module);
    const entry = ((await import(pathToFileURL(location.module).href)) as { default: unknown }).default;
    assert.ok(isValidRegistryEntry(entry), id);
    assert.equal((entry as { id: string }).id, id);
  }

  // A newer built-in release seeds beside the older; neither lock changes.
  const lockTexts = [ownClone, projectClone].map((clone) => readFileSync(join(clone, "spex.lock"), "utf8"));
  const [major, minor] = shipped.version.split(".").map(Number);
  const newerVersion = `${major}.${minor! + 1}.0`;
  const newerDir = join(scratchDir("spex-builtin-"), newerVersion);
  cpSync(shipped.dir, newerDir, { recursive: true });
  writeFileSync(join(newerDir, "meta.yaml"), readFileSync(join(newerDir, "meta.yaml"), "utf8").replace(`version: ${shipped.version}`, `version: ${newerVersion}`));
  await seedBuiltinPackage(home.store, home.cache, { name: "sublang/playbooks", version: newerVersion, dir: newerDir });
  const index = await source().index("sublang/playbooks");
  assert.deepEqual(index.versions.map((entry) => entry.version), [shipped.version, newerVersion]);
  assert.deepEqual([ownClone, projectClone].map((clone) => readFileSync(join(clone, "spex.lock"), "utf8")), lockTexts);
  for (const clone of [ownClone, projectClone]) {
    const report = await install({ cloneDir: clone, lock: (await readLock(join(clone, "spex.lock")))!, store: home.store, cache: home.cache, registry: source(), git: gitSource(home.cache), workingFolder: null });
    assert.equal(report.unchanged, true);
  }
  // A new environment takes the newer release; the store keeps both while locks select them.
  const newer = locked(await resolveText(cloneOf(home, "acme/later-spex"), text, { through: source() }));
  assert.equal((newer.packages["sublang/playbooks"]!.source as { version: string }).version, newerVersion);
  assert.deepEqual(home.store.gc(lockStoreKeys([...Object.values(locks), newer])).length, 0);
});

test("environments-22: a playbook the project's environment exports but has not installed is refused naming the project, never taken from your own group's", async () => {
  await publish(manifestOf("acme/shipper", "1.0.0", {
    ship: { kind: "playbook", language: "en" },
    dock: { kind: "playbook", language: "en" },
  }), { ...playbookFiles("ship"), ...playbookFiles("dock") });
  await publish(manifestOf("acme/shipper", "2.0.0", { ship: { kind: "playbook", language: "en" } }), playbookFiles("ship"));

  const scratch = scratchDir("spex-uninstalled-");
  const { git } = hermeticGit(scratch);
  const workingFolder = join(scratch, "project");
  git(scratch, ["init", "--quiet", "-b", "main", workingFolder]);
  const store = new Store({ machineIdentity, dir: join(scratch, "state"), own: "me" });
  try {
    const projectKey = store.registerProject(workingFolder, "project").id;
    const ownKey = store.home.own();
    const projectClone = store.repository(projectKey)!.dir;
    const ownClone = store.repository(ownKey)!.dir;
    const cache = join(store.dir, "cache");
    const base = { store: new ContentStore(store.dir), cache, registry: client, git: gitSource(cache) };
    const moduleIn = (clone: string, id: string): string => join(clone, "packages/acme/shipper/playbooks/en", id, `${id}.playbook`, `${id}.registry.mjs`);

    // Your own group's environment installs ship 1.0.0 beside dock.
    const ownLock = locked(await resolveText(ownClone, requestsYaml({ "acme/shipper": { version: "~1.0.0" } })));
    await writeLock(join(ownClone, "spex.lock"), ownLock);
    await install({ ...base, cloneDir: ownClone, lock: ownLock, workingFolder: null });
    // A sync brought the project's lock at 2.0.0; nothing installed it here.
    const projectLock = locked(await resolveText(projectClone, requestsYaml({ "acme/shipper": { version: "^2.0.0" } }), { workingFolder }));
    await writeLock(join(projectClone, "spex.lock"), projectLock);

    const manager = new EnvironmentManager({
      store, userHome: null, deviceHome: scratch, builtin: null,
      token: async () => null,
      gitCredential: async () => undefined,
      credentialArgs: async () => ({ env: {}, configArgs: [], dispose: () => {} }),
      broadcast: () => {},
    });
    const modules = manager.modulesFor(projectKey);
    const ship = modules.find("ship");
    assert.ok(ship && "missing" in ship, JSON.stringify(ship));
    if (ship && "missing" in ship) {
      assert.equal(ship.missing.repository, projectKey);
      assert.ok(ship.missing.module.startsWith(join(projectClone, "packages/acme/shipper/playbooks/en/ship")), ship.missing.module);
    }
    assert.ok(existsSync(moduleIn(ownClone, "ship")), "your own group's copy stands, and is not taken");
    // A playbook the project does not export still comes from your own group's.
    assert.deepEqual(modules.find("dock"), { module: moduleIn(ownClone, "dock"), builtin: false });
    assert.equal(modules.find("ghost"), undefined);

    // Composition refuses it, naming the project's spex repository.
    const config = "captain:\n  adapter: claude\n  model: claude-test\nplayers:\n  dev.coder:\n    adapter: claude\n    model: claude-test\nplaybooks:\n  ship:\n    roles:\n      worker: dev.coder\n";
    await assert.rejects(composeConfig(parseYaml(config), undefined, undefined, { modules }), (error: unknown) =>
      error instanceof ConfigRegistryError && error.kind === "unavailable"
      && error.message === `playbooks.ship is enabled, but the environment of ${projectKey} has not installed its module on this device; install that environment in Playbooks`);

    // Once installed, the project's own module is the one handed over.
    await install({ ...base, cloneDir: projectClone, lock: projectLock, workingFolder });
    assert.deepEqual(manager.modulesFor(projectKey).find("ship"), { module: moduleIn(projectClone, "ship"), builtin: false });
  } finally {
    store.close();
  }
});

test("environments-22: a path source's playbook whose folder this device lacks is refused naming the project and the folder, never taken from your own group's", async () => {
  // Your own group's environment installs walk and stroll from the registry.
  await publish(manifestOf("acme/hiker", "1.0.0", {
    walk: { kind: "playbook", language: "en" },
    stroll: { kind: "playbook", language: "en" },
  }), { ...playbookFiles("walk"), ...playbookFiles("stroll") });
  const projectKey = "acme/trail-spex";
  const ownKey = "me/me-spex";
  const home = makeHome(projectKey);
  const ownClone = cloneOf(home, ownKey);
  const ownModule = (id: string): string => join(ownClone, "packages/acme/hiker/playbooks/en", id, `${id}.playbook`, `${id}.registry.mjs`);
  const ownLock = locked(await resolveText(ownClone, requestsYaml({ "acme/hiker": { version: "^1.0.0" } })));
  await writeLock(join(ownClone, "spex.lock"), ownLock);
  await install({ cloneDir: ownClone, lock: ownLock, store: home.store, cache: home.cache, registry: client, git: gitSource(home.cache), workingFolder: null });

  // The project requests its own walk by path: the device that resolved
  // it has the folder, this one lacks it.
  const resolvedOn = scratchDir("spex-wf-");
  await makeRelease(join(resolvedOn, "tools", "walk"), manifestOf("acme/trail", "0.1.0", { walk: { kind: "playbook", language: "en" } }), playbookFiles("walk"));
  const projectLock = locked(await resolveText(home.clone, requestsYaml({ "acme/trail": { path: "tools/walk" } }), { workingFolder: resolvedOn }));
  const lockText = await writeLock(join(home.clone, "spex.lock"), projectLock);
  const lacking = scratchDir("spex-wf-");
  const expected = "tools/walk/playbooks/en/walk/walk.playbook/walk.registry.js";

  // A working folder lacking the folder, no working folder on this
  // device, and a lock written before artifacts carried their kind.
  const cases: [string, string | null, string][] = [
    ["a working folder lacking it", lacking, lockText],
    ["no working folder on this device", null, lockText],
    ["a lock without kinds", lacking, lockText.replace(/kind: [a-z]+, /g, "")],
  ];
  for (const [label, workingFolder, text] of cases) {
    writeFileSync(join(home.clone, "spex.lock"), text);
    const environments = environmentsOver(home, ownKey, { [projectKey]: { dir: home.clone, workingFolder }, [ownKey]: { dir: ownClone, workingFolder: null } });
    const modules = environments.modulesFor(projectKey);
    // Missing in the project's environment, naming it and the folder.
    assert.deepEqual(modules.find("walk"), { missing: { repository: projectKey, module: workingFolder === null ? expected : join(workingFolder, expected), path: "tools/walk" } }, label);
    await assert.rejects(composeConfig(sessionConfig("walk"), undefined, undefined, { modules }), (error: unknown) =>
      error instanceof ConfigRegistryError && error.kind === "unavailable"
      && error.message === `playbooks.walk is enabled, but the environment of ${projectKey} finds no tools/walk in the working folder on this device`, label);
    // A playbook the project does not export still comes from your own
    // group's, whose own walk stands for its own sessions.
    assert.deepEqual(modules.find("stroll"), { module: ownModule("stroll"), builtin: false }, label);
    assert.equal(moduleOf(environments.modulesFor(null).find("walk")), ownModule("walk"), label);
    // The Playbooks surface lists the folder missing.
    const listed = environments.state(projectKey).packages.find((entry) => entry.name === "acme/trail");
    assert.equal(listed?.missingPath, "tools/walk", label);
    assert.deepEqual(listed?.artifacts.map((artifact) => [artifact.id, artifact.kind]), [["walk", "playbook"]], label);
  }

  // Once the folder is in this working folder, its own module is handed over.
  writeFileSync(join(home.clone, "spex.lock"), lockText);
  cpSync(join(resolvedOn, "tools"), join(lacking, "tools"), { recursive: true });
  const found = environmentsOver(home, ownKey, { [projectKey]: { dir: home.clone, workingFolder: lacking }, [ownKey]: { dir: ownClone, workingFolder: null } }).modulesFor(projectKey).find("walk");
  assert.deepEqual(found, { module: join(lacking, "tools/walk/playbooks/en/walk/walk.playbook/walk.registry.mjs"), builtin: false });
});

// Enabling publishes a whole prepared environment with its config in
// one queue turn (environments-26..27, playbook-library-100).
test("environment enabling owns preparation, publication and rollback", async (t) => {
  const deferred = () => {
    let release!: () => void;
    return { promise: new Promise<void>((resolve) => { release = resolve; }), release: () => release() };
  };
  const fixture = () => {
    const home = makeHome();
    const key = "me/me-spex";
    const working = join(home.root, "working");
    mkdirSync(home.clone, { recursive: true });
    mkdirSync(working, { recursive: true });
    mkdirSync(join(home.root, ".claude"), { recursive: true });
    return { home, key, working, manager: environmentsOver(home, key, { [key]: { dir: home.clone, workingFolder: working } }) };
  };

  await t.test("an unchanged request cannot install or export for a departed owner", async () => {
    await publishSimple("tx-retired/tool", "1.0.0");
    const { home, key, working, manager } = fixture();
    await makeRelease(join(working, "draft"), manifestOf("tx-retired/draft", "1.0.0", { draft: { kind: "skill", language: "en" } }, { "tx-retired/tool": "1.0.0" }), skillFiles("draft"));
    const text = "format: 1\npackages:\n  tx-retired/draft:\n    path: draft\n";
    const lock = locked(await resolveText(home.clone, text, { workingFolder: working }));
    await writeLock(join(home.clone, "spex.lock"), lock);
    const before = snapshot(home.clone);
    const entered = deferred();
    const release = deferred();
    const source = manager.registry();
    const archive = source.archive.bind(source);
    source.archive = async (...args) => { entered.release(); await release.promise; return archive(...args); };
    let alive = true;
    const enabling = manager.requestAndInstall(key, "tx-retired/draft", { path: "draft" }, () => {
      if (!alive) throw new Error("the authoring session departed");
    });
    const refused = assert.rejects(enabling, /the authoring session departed/);
    await entered.promise;
    alive = false;
    release.release();
    await refused;
    assert.deepEqual(snapshot(home.clone), before, "the old request and lock remain; no packages or exports become visible");
    assert.equal(existsSync(join(working, ".claude", "skills")), false);
    assert.equal(manager.busyFor(key), undefined);
  });

  await t.test("a failed enabling cannot erase the independent request queued behind it", async () => {
    await publishSimple("tx-queued/accepted", "1.0.0");
    const { home, key, manager } = fixture();
    const entered = deferred();
    const release = deferred();
    const source = manager.registry();
    const index = source.index.bind(source);
    source.index = async (name) => {
      if (name === "tx-queued/failed") {
        entered.release();
        await release.promise;
        throw new Error("the release could not be read");
      }
      return index(name);
    };
    const enabling = manager.requestAndInstall(key, "tx-queued/failed", { version: "1.0.0" });
    const refused = assert.rejects(enabling, /the release could not be read/);
    await entered.promise;
    const accepted = manager.request(key, "tx-queued/accepted", { version: "1.0.0" });
    assert.ok(manager.busyFor(key), "the clone remains owned through queued work");
    release.release();
    await refused;
    await (await accepted).done;
    const requests = parseRequests(readFileSync(join(home.clone, "spex.yaml"), "utf8"));
    assert.deepEqual(plain(requests.packages), { "tx-queued/accepted": { version: "1.0.0" } });
    assert.ok(existsSync(join(home.clone, "packages", "tx-queued", "accepted", "meta.yaml")));
    assert.equal(manager.busyFor(key), undefined);
  });

  await t.test("a config publication failure restores only that synchronous commit", async () => {
    await publishSimple("tx-rollback/previous", "1.0.0");
    await publishSimple("tx-rollback/proposed", "1.0.0");
    const { home, key, working, manager } = fixture();
    await (await manager.request(key, "tx-rollback/previous", { version: "1.0.0" })).done;
    const config = join(home.clone, "config.yaml");
    writeFileSync(config, "previous config\n");
    const before = snapshot(home.clone);
    const exportsBefore = snapshot(join(working, ".claude"));
    await assert.rejects(manager.requestAndInstall(key, "tx-rollback/proposed", { version: "1.0.0" }, undefined, async () => ({
      files: [config], validate() {}, commit() {
        writeFileSync(config, "part of the proposed config\n");
        throw new Error("the second config destination is not writable");
      },
    })), /the second config destination is not writable/);
    assert.deepEqual(snapshot(home.clone), before, "requests, lock, installed files, exports and config are restored");
    assert.deepEqual(snapshot(join(working, ".claude")), exportsBefore, "agent exports are restored too");
  });

  await t.test("config preparation can load a newly installed transitive playbook", async () => {
    await publish(manifestOf("tx-candidate/helper", "1.0.0", { helper: { kind: "playbook", language: "en" } }), launchablePlaybookFiles("helper"));
    const { home, key, working, manager } = fixture();
    await makeRelease(join(working, "draft"), manifestOf("tx-candidate/draft", "1.0.0", { draft: { kind: "skill", language: "en" } }, { "tx-candidate/helper": "1.0.0" }), skillFiles("draft"));
    const config = join(home.clone, "config.yaml");
    let prepared = false;
    await manager.requestAndInstall(key, "tx-candidate/draft", { path: "draft" }, undefined, async (modules) => {
      assert.equal(existsSync(join(home.clone, "spex.yaml")), false, "the proposed request is not visible during preparation");
      assert.equal(existsSync(join(home.clone, "packages")), false, "the candidate tree is private");
      await composeConfig(sessionConfig("helper"), (specifier) => import(pathToFileURL(specifier).href), config, { modules });
      prepared = true;
      return { files: [config], validate() {}, commit() { writeFileSync(config, "accepted config\n"); } };
    });
    assert.equal(prepared, true);
    assert.equal(readFileSync(config, "utf8"), "accepted config\n");
    assert.ok(existsSync(join(home.clone, "packages", "tx-candidate", "helper", "meta.yaml")));
    assert.ok(existsSync(join(working, ".claude", "skills", "helper", "SKILL.md")));
  });

  await t.test("a path manifest changed during resolution cannot supply an unstaged candidate", async () => {
    await publishSimple("tx-resolving/tool", "1.0.0");
    const { home, key, working, manager } = fixture();
    const folder = join(working, "draft");
    const artifacts = { draft: { kind: "skill", language: "en" } };
    const dependencies = { "tx-resolving/tool": "1.0.0" };
    await makeRelease(folder, manifestOf("tx-resolving/draft", "1.0.0", artifacts, dependencies), skillFiles("draft"));
    const source = manager.registry();
    const index = source.index.bind(source);
    source.index = async (name) => {
      await makeRelease(folder, manifestOf("tx-resolving/draft", "2.0.0", artifacts, dependencies), skillFiles("draft"));
      return index(name);
    };
    await assert.rejects(manager.requestAndInstall(key, "tx-resolving/draft", { path: "draft" }, undefined, async () => {
      assert.fail("a stale install supplies no candidate config");
    }), /changed in draft; resolve again/);
    assert.deepEqual(snapshot(home.clone), {});
  });

  await t.test("a path manifest changed during config preparation refuses publication", async () => {
    const { home, key, working, manager } = fixture();
    const folder = join(working, "draft");
    const artifacts = { draft: { kind: "skill", language: "en" } };
    await makeRelease(folder, manifestOf("tx-changed/draft", "1.0.0", artifacts), skillFiles("draft"));
    await assert.rejects(manager.requestAndInstall(key, "tx-changed/draft", { path: "draft" }, undefined, async () => {
      await makeRelease(folder, manifestOf("tx-changed/draft", "2.0.0", artifacts), skillFiles("draft"));
      return { files: [], validate() {}, commit() { assert.fail("a stale candidate must not commit its config"); } };
    }), /changed in draft; resolve again/);
    assert.deepEqual(snapshot(home.clone), {}, "no stale request, lock, installed files or exports became visible");
  });

  await t.test("an ordinary resolution still publishes its lock when downloading fails", async () => {
    await publishSimple("tx-ordinary/tool", "1.0.0");
    const { home, key, manager } = fixture();
    const source = manager.registry();
    source.archive = async () => { throw new Error("the download stopped"); };
    source.file = async () => { throw new Error("the download stopped"); };
    await (await manager.request(key, "tx-ordinary/tool", { version: "1.0.0" })).done;
    const lock = await readLock(join(home.clone, "spex.lock"));
    assert.ok(lock?.packages["tx-ordinary/tool"], "resolution is durable even though the files are unavailable");
    assert.equal(manager.state(key).packages.find((entry) => entry.name === "tx-ordinary/tool")?.installed, false);
  });
});
