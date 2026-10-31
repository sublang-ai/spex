// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Spec packages and environments (environments-19..23): the format read
// and refused, resolution against the stand-in registry, installs on
// scratch homes through the store, exports into scratch working folders
// and a scratch user home, and the built-in spec package seeded and
// resolved with no registry reachable; and the stand-in registry itself
// answering at several stand-in instances (environments-18).

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, linkSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { RUNTIME_ABI } from "@sublang/playbook/xstate-runtime";
import { build } from "esbuild";
import { getNativeSkillSupport } from "@sublang/cligent";
import { KNOWN_PLAYER_ADAPTERS } from "@sublang/cligent/tmux-play";
import { parse as parseYaml } from "yaml";

import { compilePlaybook, defaultSpawner, ENGINE_LINKS_EXCLUDE, installEngine, moduleDirectoriesAbove, type LineSpawner } from "./compile.js";
import { createModuleLoader, isValidRegistryEntry, type RegistryEntryLike } from "./config.js";
import { fileVersion } from "@sublang/spex/files";
import { instanceFolder } from "@sublang/spex/instance";
import {
  artifactLanguages,
  builtinLock,
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
  launchModules,
  lockStoreKeys,
  moduleLocations,
  ORGS_TIMEOUT_MS,
  playbookSkill,
  packFiles,
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
  rewriteSkillName,
  satisfies,
  seedBuiltinPackage,
  setRequest,
  sha256Hex,
  specSkill,
  storeKey,
  writeLock,
  type InstallOptions,
  type Lock,
  type RegistrySource,
  type RegistrySourceLock,
  type ResolveResult,
  type RunGit,
} from "@sublang/spex/environment";
import { builtinPackage } from "./builtins.js";
import { AGENT_FOLDERS } from "@sublang/spex/environment";
import { startGitHttpHost, testCredentialArgs } from "./testing/git-http-host.js";
import { APP_ENGINE_URL, APP_XSTATE_URL, importsOf, LINKED_ID, recordingResolutions, writeLinkedFixture } from "./testing/linked-artifact.js";
import { scratchDir } from "./testing/scratch.js";
import { browserSignIn, instanceClient } from "./testing/host-sign-in.js";
import { startStandinHost, type StandinHost } from "./testing/standin-host.js";
import { makeRelease, RELAY_HEADERS, startStandinRegistry, type ReleaseFixture, type StandinRegistry } from "@sublang/spex/testing";
import { stubSlcScriptedSource } from "./testing/stub-slc.js";

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

/** A spec file in the GEARS form, its items named after its spec package. */
function specText(pkg: string): string {
  return `# ${pkg}: The ${pkg} Spec\n\n## Intent\n\nThe ${pkg} spec.\n\n## External Behavior\n\n### ${pkg}-1\n\nThe ${pkg} tool shall split costs.\n\n## Verification\n\n### ${pkg}-2\n\nWhen run, the suite shall assert the split [[${pkg}-1](#${pkg}-1)].\n`;
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

async function resolveText(clone: string, text: string, options: { through?: RegistrySource; workingFolder?: string | null; git?: ReturnType<typeof gitSource>; cache?: string; gitCredential?: () => Promise<{ username: string; secret: string } | undefined> } = {}): Promise<ResolveResult> {
  mkdirSync(clone, { recursive: true });
  writeFileSync(join(clone, "spex.yaml"), text);
  return resolve({
    requests: parseRequests(text),
    requestsText: text,
    registry: options.through ?? client,
    pathRoot: options.workingFolder ?? null,
    git: options.git ?? gitSource(options.cache ?? join(clone, "..", "..", "..", "cache")),
    ...(options.gitCredential ? { gitCredential: options.gitCredential } : {}),
  });
}

/** An install expecting `spex.lock` at the version it stands at on disk
 * now — none where none stands (DR-111). */
function installAsOnDisk(options: Omit<InstallOptions, "lockVersion">): ReturnType<typeof install> {
  return install({ engine: installEngine(), ...options, lockVersion: fileVersion(join(options.root, "spex.lock")) });
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

/** A registry's folder under `cache/registry/`: its scheme's, holding
 * its instance's folder (environments-7). */
const cacheFolderOf = (url: string): string => join(new URL(url).protocol.slice(0, -1), instanceFolder(url));

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
    // An applet is entered at `index.html` at its folder's root
    // (DR-161): one elsewhere in the folder is no entry.
    { label: "an applet without index.html at its folder's root", rule: "applet-entry", change: (_manifest, files) => {
      delete files["applets/viewer/index.html"];
      files["applets/viewer/pages/index.html"] = "<!doctype html>\n";
    } },
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
  // An applet's missing entry is refused naming the applet, a link
  // standing in its place too (environments-1).
  for (const entry of [undefined, { symlink: "other.html" }] as const) {
    const files = widgetsFiles();
    delete files["applets/viewer/index.html"];
    files["applets/viewer/other.html"] = "<!doctype html>\n";
    if (entry) files["applets/viewer/index.html"] = entry;
    const dir = await makeRelease(join(scratchDir("spex-format-"), "widgets"), widgetsManifest(), files);
    await assert.rejects(readRelease(dir), (error: unknown) => {
      assert.ok(error instanceof FormatError);
      assert.ok(error.issues.some((issue) => issue.rule === "applet-entry" && /applet viewer/.test(issue.message)), JSON.stringify(error.issues));
      return true;
    });
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

test("environments-20: a graph resolves to the highest solution from the version index, yanked, suppressed and cycles", async () => {
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
  assert.equal(existsSync(join(home.clone, ".spex", "packages")), false);
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
  assert.deepEqual(chosen.artifacts, { guide: { language: "zh-Hans", fallback: false }, ship: { language: "en", fallback: true } });
  assert.ok(chosen.files.some((file) => file.path === "skills/zh-Hans/guide/SKILL.md"));
  assert.ok(!chosen.files.some((file) => file.path === "skills/en/guide/SKILL.md"));
  assert.ok(chosen.files.some((file) => file.path === "playbooks/en/ship/ship.md"));
  assert.ok(chosen.files.some((file) => file.path === "meta.yaml"));
  assert.deepEqual(chosen.exports, { guide: "guide", ship: "ship" });

  // A select entry's language comes before the environment's.
  const named = locked(await resolveText(home.clone, requestsYaml({ "acme/docs": { version: "^1.0.0", select: [{ artifact: "guide", language: "en" }] } }, "zh-Hans")));
  assert.deepEqual(named.packages["acme/docs"]!.artifacts, { guide: { language: "en", fallback: false } });

  // No language wanted: the original, no fallback.
  const original = locked(await resolveText(home.clone, requestsYaml({ "acme/docs": { version: "^1.0.0" } })));
  assert.deepEqual(original.packages["acme/docs"]!.artifacts, { guide: { language: "en", fallback: false }, ship: { language: "en", fallback: false } });

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
  assert.deepEqual(aliased.packages["acme/two"]!.exports, { "helper-two": "helper" });
  // A playbook's generated skill counts among the skill names.
  await publish(manifestOf("acme/three", "1.0.0", { helper: { kind: "playbook", language: "en" } }), playbookFiles("helper"));
  const playbookClash = await resolveText(home.clone, requestsYaml({ "acme/one": { version: "^1.0.0" }, "acme/three": { version: "^1.0.0" } }));
  assert.equal(playbookClash.ok, false);

  // A spec exports under <org>-<pkg>; under <pkg> where that is longer
  // than an Agent Skills name may be; under its alias where one is named.
  await publish(manifestOf("acme/trip-split", "1.0.0", { "trip-split": { kind: "spec", language: "en" } }), { "specs/en/trip-split.md": specText("trip-split") });
  const spec = locked(await resolveText(home.clone, requestsYaml({ "acme/trip-split": { version: "^1.0.0" } })));
  assert.deepEqual(spec.packages["acme/trip-split"]!.exports, { "acme-trip-split": "trip-split" });
  const longOrg = `org-${"o".repeat(36)}`;
  const longPkg = `pkg-${"p".repeat(26)}`;
  assert.ok(`${longOrg}-${longPkg}`.length > 64);
  await publish(manifestOf(`${longOrg}/${longPkg}`, "1.0.0", { [longPkg]: { kind: "spec", language: "en" } }), { [`specs/en/${longPkg}.md`]: specText(longPkg) });
  const long = locked(await resolveText(home.clone, requestsYaml({ [`${longOrg}/${longPkg}`]: { version: "^1.0.0" } })));
  assert.deepEqual(long.packages[`${longOrg}/${longPkg}`]!.exports, { [longPkg]: longPkg });
  const renamed = locked(await resolveText(home.clone, requestsYaml({ "acme/trip-split": { version: "^1.0.0", alias: { "trip-split": "trips" } } })));
  assert.deepEqual(renamed.packages["acme/trip-split"]!.exports, { trips: "trip-split" });
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
    for (const artifact of Object.values(resolution.artifacts as Record<string, Record<string, unknown>>)) assert.deepEqual(Object.keys(artifact), ["language", "fallback"]);
  }
  assert.deepEqual(await readLock(join(first.clone, "spex.lock")), lock);
  const firstReport = await installAsOnDisk({ root: first.clone, lock, store: first.store, cache: first.cache, registry: client, git: gitSource(first.cache), pathRoot: null });
  assert.deepEqual(firstReport.installed, ["acme/app", "acme/lib", "acme/press"]);

  const second = makeHome();
  mkdirSync(second.clone, { recursive: true });
  cpSync(join(first.clone, "spex.yaml"), join(second.clone, "spex.yaml"));
  cpSync(join(first.clone, "spex.lock"), join(second.clone, "spex.lock"));
  registry.script.clearRequests();
  const secondLock = (await readLock(join(second.clone, "spex.lock")))!;
  const report = await installAsOnDisk({ root: second.clone, lock: secondLock, store: second.store, cache: second.cache, registry: client, git: gitSource(second.cache), pathRoot: null });
  assert.equal(report.unchanged, false);
  // Installing from the lock resolves nothing: no version index is read.
  assert.deepEqual(registry.script.requests.filter((line) => /^GET \/api\/v1\/packages\/[^/]+\/[^/]+$/.test(line)), []);
  // A store lacking every file takes the release archive.
  assert.ok(registry.script.requests.some((line) => /^GET \/api\/v1\/packages\/acme\/press\/1\.0\.0\/download$/.test(line)));
  assert.deepEqual(snapshot(join(second.clone, ".spex", "packages")), snapshot(join(first.clone, ".spex", "packages")));
  assert.equal(readFileSync(join(second.clone, "spex.lock"), "utf8"), written);
  // A second install of the same lock changes nothing.
  const again = await installAsOnDisk({ root: second.clone, lock: secondLock, store: second.store, cache: second.cache, registry: client, git: gitSource(second.cache), pathRoot: null });
  assert.equal(again.unchanged, true);
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
  const base = { root: home.clone, store: home.store, cache: home.cache, registry: client, git: gitSource(home.cache), pathRoot: null };
  const report = await installAsOnDisk({ ...base, lock });
  assert.deepEqual(report, { installed: ["acme/kit"], missingPaths: [], unchanged: false, engineKept: [] });

  // Every selected file with its bytes and executable flag, under the
  // root's `.spex/`, whose `.gitignore` ignores everything in it
  // (environments-26).
  assert.equal(readFileSync(join(home.clone, ".spex", ".gitignore"), "utf8"), "*\n");
  const root = join(home.clone, ".spex", "packages", "acme", "kit");
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
  const before = snapshot(join(home.clone, ".spex", "packages"));
  const tampered = structuredClone(lock);
  tampered.packages["acme/kit"]!.files.find((file) => file.path === "skills/en/tidy/other.txt")!.sha256 = "0".repeat(64);
  await assert.rejects(installAsOnDisk({ ...base, lock: tampered }), (error: unknown) =>
    error instanceof InstallError && error.packageName === "acme/kit" && /other\.txt/.test(error.message));
  assert.deepEqual(snapshot(join(home.clone, ".spex", "packages")), before);

  // Atomic: a failure between fetch and replace leaves the last files whole.
  const newer = locked(await resolveText(home.clone, requestsYaml({ "acme/kit": { version: "1.1.0" } })));
  const primaryFailure = new Error("power cut");
  await assert.rejects(installAsOnDisk({ ...base, lock: newer, beforeReplace: () => { throw primaryFailure; } }),
    (error: unknown) => error instanceof InstallError && error.cause === primaryFailure);
  assert.deepEqual(snapshot(join(home.clone, ".spex", "packages")), before);
  assert.deepEqual(existsSync(join(home.cache, "staging")) ? readdirSync(join(home.cache, "staging")) : [], []);

  // A file leaves the store only when no lock on the device selects it.
  writeFileSync(join(home.clone, "spex.yaml"), text);
  const peerHome = cloneOf(home, "me/peer-spex");
  const peerLock = locked(await resolveText(peerHome, requestsYaml({ "acme/peer": { version: "1.0.0" } })));
  await installAsOnDisk({ ...base, root: peerHome, lock: peerLock });
  assert.deepEqual(home.store.gc(lockStoreKeys([lock, newer, peerLock])), []);
  const removed = home.store.gc(lockStoreKeys([peerLock]));
  assert.ok(removed.includes(storeKey(same, true)));
  assert.ok(!removed.includes(storeKey(same, false)), "a file another lock selects stays");
  assert.ok(home.store.has(same, false));

  // cache/ may be deleted: an install that needs it rebuilds it.
  rmSync(home.cache, { recursive: true, force: true });
  rmSync(join(home.clone, ".spex", "packages"), { recursive: true, force: true });
  registry.script.clearRequests();
  const rebuilt = await installAsOnDisk({ ...base, lock });
  // Half the files or fewer missing: fetched as raw files.
  assert.ok(registry.script.requests.includes("GET /acme/kit/1.0.0/skills/en/tidy/other.txt"), JSON.stringify(registry.script.requests));
  assert.equal(rebuilt.unchanged, false);
  assert.ok(existsSync(join(home.cache, "registry", cacheFolderOf(registry.url), "acme", "kit", "1.0.0.json")));
  assert.deepEqual(snapshot(join(home.clone, ".spex", "packages")), before);

  // A changed spex.yaml marks the lock stale: nothing new is installed.
  const edited = await setRequest(join(home.clone, "spex.yaml"), "acme/peer", { version: "^1.0.0" });
  assert.match(edited.text, /^# The environment's requests\.\n/);
  assert.deepEqual(Object.keys(edited.requests.packages), ["acme/kit", "acme/peer"]);
  const stale = await installAsOnDisk({ ...base, lock: newer });
  assert.equal(stale.installed.length, 0);
  assert.ok(stale.stale?.some((reason) => /spex\.yaml changed/.test(reason)));
  assert.deepEqual(snapshot(join(home.clone, ".spex", "packages")), before);
});

test("environments-21: obsolete-tree cleanup cannot fail a committed install or prevent its exports", {
  skip: process.platform === "win32" || process.getuid?.() === 0,
}, async (t) => {
  await publish(manifestOf("acme/cleanup-kit", "1.0.0", { tidy: { kind: "skill", language: "en" } }), skillFiles("tidy", "en", "old release"));
  await publish(manifestOf("acme/cleanup-kit", "1.1.0", { tidy: { kind: "skill", language: "en" } }), skillFiles("tidy", "en", "new release"));
  const home = makeHome("me/cleanup-spex");
  const scratch = scratchDir("spex-cleanup-export-");
  const workingFolder = join(scratch, "project");
  const { git } = hermeticGit(scratch);
  git(scratch, ["init", "--quiet", "-b", "main", workingFolder]);
  const base = { root: home.clone, store: home.store, cache: home.cache, registry: client, git: gitSource(home.cache), pathRoot: null };
  const installAndExport = async (lock: Lock) => {
    const report = await installAsOnDisk({ ...base, lock });
    await exportEnvironment({ root: home.clone, lock, workingFolder, userHome: null, agents: ["claude", "codex"] });
    return report;
  };
  const first = locked(await resolveText(home.clone, requestsYaml({ "acme/cleanup-kit": { version: "1.0.0" } })));
  await writeLock(join(home.clone, "spex.lock"), first);
  await installAndExport(first);
  const folder = join(home.clone, ".spex/packages/acme/cleanup-kit/skills/en/tidy");
  const oldMode = statSync(folder).mode & 0o777;
  // Restore only this test's directories, including the moved old tree,
  // even if an assertion fails before ordinary scratch cleanup runs.
  const restore = (dir: string): void => {
    chmodSync(dir, 0o700);
    for (const name of readdirSync(dir)) {
      const child = join(dir, name);
      if (lstatSync(child).isDirectory()) restore(child);
    }
  };
  try {
    chmodSync(folder, 0o555);
    const diagnostics = t.mock.method(console, "error", () => {});
    const next = locked(await resolveText(home.clone, requestsYaml({ "acme/cleanup-kit": { version: "1.1.0" } })));
    await writeLock(join(home.clone, "spex.lock"), next);
    const report = await installAndExport(next);
    assert.deepEqual(report.installed, ["acme/cleanup-kit"]);
    assert.equal(report.unchanged, false);
    for (const file of next.packages["acme/cleanup-kit"]!.files) {
      assert.equal(sha256Hex(readFileSync(join(home.clone, ".spex/packages/acme/cleanup-kit", file.path))), file.sha256);
    }
    for (const dir of [join(home.clone, ".spex", "skills"), join(workingFolder, ".claude/skills"), join(workingFolder, ".agents/skills")]) {
      assert.match(readFileSync(join(dir, "tidy/SKILL.md"), "utf8"), /new release/);
    }
    const obsolete = readdirSync(join(home.cache, "trash"));
    assert.equal(obsolete.length, 1, "the failed garbage collection retains its obsolete tree");
    const retained = join(home.cache, "trash", obsolete[0]!, "acme/cleanup-kit/skills/en/tidy");
    assert.match(readFileSync(join(retained, "SKILL.md"), "utf8"), /old release/);
    assert.equal(statSync(retained).mode & 0o777, 0o555);
    const diagnostic = diagnostics.mock.calls.map((call) => String(call.arguments[0]))
      .find((message) => message.includes(join(home.cache, "trash", obsolete[0]!)));
    assert.ok(diagnostic, "the retained tree is named in the cleanup diagnostic");
    assert.match(diagnostic, /could not be removed:.*(?:EACCES|EPERM|ENOTEMPTY)/);
    // The current installation does not inherit the old tree's mode.
    assert.equal(statSync(folder).mode & 0o777, oldMode);
  } finally {
    restore(home.root);
  }
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
  assert.deepEqual(lock.packages["acme/local"]!.source, { path: "tools/local", version: "0.1.0", dependencies: {}, requires: { tidy: ["pave"] } });
  assert.deepEqual(lock.packages["acme/local"]!.files, []);
  const base = { root: home.clone, store: home.store, cache: home.cache, registry: client, git: gitSource(home.cache), lock };

  const report = await installAsOnDisk({ ...base, pathRoot: first });
  assert.deepEqual(report.missingPaths, []);
  assert.equal(existsSync(join(home.clone, ".spex", "packages", "acme", "local")), false, "a path source copies nothing");
  assert.equal(moduleLocations(lock, home.clone, first).get("pave")!.module, join(first, "tools/local/playbooks/en/pave/pave.playbook/pave.registry.mjs"));
  // A second working folder of the same project runs its own copy.
  assert.equal(moduleLocations(lock, home.clone, second).get("pave")!.module, join(second, "tools/local/playbooks/en/pave/pave.playbook/pave.registry.mjs"));
  await exportEnvironment({ root: home.clone, lock, workingFolder: second, userHome: null, agents: ["claude"] });
  assert.match(readFileSync(join(second, ".claude/skills/tidy/SKILL.md"), "utf8"), /the second folder's copy/);
  // A device whose working folder lacks it reports it missing; the rest installs.
  rmSync(join(home.clone, ".spex", "packages"), { recursive: true, force: true });
  const missing = await installAsOnDisk({ ...base, pathRoot: bare });
  assert.deepEqual(missing.missingPaths, ["acme/local"]);
  assert.ok(existsSync(join(home.clone, ".spex", "packages", "acme", "solid", "meta.yaml")));

  // A changed path-source manifest and a missing selected artifact mark the lock stale.
  await local(first, "0.2.0", "bumped");
  const bumped = await installAsOnDisk({ ...base, pathRoot: first });
  assert.ok(bumped.stale?.some((reason) => /^acme\/local changed in tools\/local: version 0\.1\.0 is now 0\.2\.0$/.test(reason)), JSON.stringify(bumped));
  rmSync(join(first, "tools", "local"), { recursive: true, force: true });
  await local(first, "0.1.0", "", false);
  const lacking = await installAsOnDisk({ ...base, pathRoot: first });
  assert.ok(lacking.stale?.some((reason) => /^acme\/local changed in tools\/local: it no longer has tidy$/.test(reason)), JSON.stringify(lacking));
});

// ---------------------------------------------------------------------------
// playbook-library-108: an installed playbook runs on the app's engine
// ---------------------------------------------------------------------------

/** Every file under a folder, by its path there, the engine links and
 * the stub compiler's run counter left out. */
function folderFiles(dir: string, prefix: string): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  const walk = (folder: string): void => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".stub-slc-runs") continue;
      const path = join(folder, entry.name);
      if (entry.isDirectory()) walk(path);
      else out[`${prefix}/${relative(dir, path).split("\\").join("/")}`] = readFileSync(path);
    }
  };
  walk(dir);
  return out;
}

/** Playbook's own `review` compiled through the real runner from a stub
 * `slc` placing it as `slc` links it, with the module that compile
 * packaged, and the same sources' module as an app bundled it before
 * modules imported the engine: the engine inside. */
async function compiledReview(): Promise<{ folder: string; compiled: Buffer; carried: Buffer }> {
  const dir = scratchDir("spex-review-");
  const fixture = writeLinkedFixture(join(dir, "fixture"));
  const stub = join(dir, "stub-slc.cjs");
  writeFileSync(stub, stubSlcScriptedSource(["ok"], "['coder', 'reviewer']", { fixtureDir: fixture }));
  const spawner: LineSpawner = async (command, args, cwd, onLine) => {
    if (args[0] === "--version") { onLine("v24.1.0"); return 0; }
    return defaultSpawner(command, args, cwd, onLine);
  };
  const libraryDir = join(dir, "playbooks", "en");
  await compilePlaybook({
    playbookId: LINKED_ID, source: { text: readFileSync(join(fixture, `${LINKED_ID}.md`), "utf8") }, roles: ["coder", "reviewer"],
    command: LINKED_ID, intent: "Review a change", libraryDir, env: { SPEX_SLC: `${process.execPath} ${stub}` }, spawner,
  });
  const folder = join(libraryDir, LINKED_ID);
  const module = join(folder, `${LINKED_ID}.registry.mjs`);
  const compiled = readFileSync(module);
  await build({
    entryPoints: [join(folder, `${LINKED_ID}.registry.ts`)], outfile: module,
    bundle: true, format: "esm", platform: "node", logLevel: "silent", nodePaths: moduleDirectoriesAbove(import.meta.url),
  });
  return { folder, compiled, carried: readFileSync(module) };
}

const carriesEngine = (text: string): boolean => /\bRUNTIME_ABI\s*=/.test(text) && !/from "@sublang\/playbook\//.test(text);

test("playbook-library-108: an install bundles again a module carrying its engine, keeps one without its wrapper, and links a path source's playbooks", async () => {
  const { folder, compiled, carried } = await compiledReview();
  assert.ok(carriesEngine(carried.toString("utf8")), "the fixture's module carries its engine, as an earlier app bundled it");
  // One release ships the whole artifact; beside it a playbook whose
  // module ships without the wrapper it was bundled from.
  await publish(manifestOf("acme/review-kit", "1.0.0", {
    [LINKED_ID]: { kind: "playbook", language: "en" },
    nudge: { kind: "playbook", language: "en" },
  }), {
    ...folderFiles(folder, `playbooks/en/${LINKED_ID}`),
    "playbooks/en/nudge/nudge.md": "# Nudge\n\nRoles:\n\n- Coder\n",
    "playbooks/en/nudge/nudge.registry.mjs": carried,
  });
  // A path source in the working folder, its module carrying the engine.
  const scratch = scratchDir("spex-review-wf-");
  const { git } = hermeticGit(scratch);
  const workingFolder = join(scratch, "project");
  git(scratch, ["init", "--quiet", "-b", "main", workingFolder]);
  await makeRelease(join(workingFolder, "tools", "local"), manifestOf("acme/local-kit", "0.1.0", { walk: { kind: "playbook", language: "en" } }), {
    "playbooks/en/walk/walk.md": "# Walk\n\nRoles:\n\n- Walker\n",
    "playbooks/en/walk/walk.registry.mjs": carried,
  });

  const home = makeHome("acme/review-spex");
  const lock = locked(await resolveText(home.clone, requestsYaml({ "acme/review-kit": { version: "^1.0.0" }, "acme/local-kit": { path: "tools/local" } }), { workingFolder }));
  await writeLock(join(home.clone, "spex.lock"), lock);
  const base = { root: home.clone, lock, store: home.store, cache: home.cache, registry: client, git: gitSource(home.cache), pathRoot: workingFolder };
  const report = await installAsOnDisk(base);
  assert.deepEqual(report.installed, ["acme/review-kit"]);

  const installed = join(home.clone, ".spex", "packages", "acme", "review-kit", "playbooks", "en");
  const module = join(installed, LINKED_ID, `${LINKED_ID}.registry.mjs`);
  const lockedModule = lock.packages["acme/review-kit"]!.files.find((file) => file.path === `playbooks/en/${LINKED_ID}/${LINKED_ID}.registry.mjs`)!;
  const assertEngineImported = (when: string): void => {
    // [playbook-library-46] bundled again by the compile's own rule: the
    // very bytes the compile packaged, the engine imported.
    assert.ok(readFileSync(module).equals(compiled), `[playbook-library-46] ${when}: the module is bundled again as a compile bundles it`);
    // [playbook-library-46] the store's copy and the lock's digest stay.
    assert.equal(lockedModule.sha256, sha256Hex(carried));
    assert.ok(readFileSync(home.store.pathOf(lockedModule.sha256, false)).equals(carried), `[playbook-library-46] ${when}: the store keeps the release's bytes`);
    for (const name of ["xstate", "@sublang/playbook"]) {
      assert.ok(lstatSync(join(installed, LINKED_ID, "node_modules", name)).isSymbolicLink(), `[playbook-library-46] ${when}: ${name} is linked`);
    }
  };
  assertEngineImported("installed");
  // [playbook-library-46] a module whose wrapper is missing stays as it
  // is, and the install goes on naming it and why.
  assert.ok(readFileSync(join(installed, "nudge", "nudge.registry.mjs")).equals(carried), "[playbook-library-46] the module without its wrapper stays");
  assert.deepEqual(report.engineKept, [{ module: join(installed, "nudge", "nudge.registry.mjs"), reason: "its nudge.registry.ts is missing" }]);

  // [playbook-library-46] loaded through the core's own module loader,
  // the installed playbook runs on the very engine module the app runs.
  const location = moduleLocations(lock, home.clone, workingFolder).get(LINKED_ID)!;
  assert.equal(location.module, module);
  const { value, resolutions } = await recordingResolutions(() => createModuleLoader({})(location.module));
  const imports = importsOf(resolutions, module);
  assert.equal(imports.get("@sublang/playbook/xstate-runtime"), APP_ENGINE_URL, "[playbook-library-46] the app's engine");
  assert.equal(imports.get("xstate"), APP_XSTATE_URL, "[playbook-library-46] the app's machine library");
  const entry = (value as { default: RegistryEntryLike & { runtimeProfile: { compat: { runtimeAbi: number } } } }).default;
  assert.ok(isValidRegistryEntry(entry));
  assert.deepEqual([entry.id, entry.runtimeProfile.compat.runtimeAbi], [LINKED_ID, RUNTIME_ABI]);

  // [playbook-library-46] a path source's playbook gets the engine links
  // alone, ignored by the working folder's Git, its module as it was.
  const walk = join(workingFolder, "tools", "local", "playbooks", "en", "walk");
  for (const name of ["xstate", "@sublang/playbook"]) assert.ok(lstatSync(join(walk, "node_modules", name)).isSymbolicLink(), `[playbook-library-46] ${name} is linked in the path source`);
  assert.ok(readFileSync(join(walk, "walk.registry.mjs")).equals(carried), "[playbook-library-46] a path source's files are left as they are");
  assert.match(readFileSync(join(workingFolder, ".git", "info", "exclude"), "utf8"), new RegExp(`^${ENGINE_LINKS_EXCLUDE.replaceAll("*", "\\*")}$`, "m"));
  assert.equal(git(workingFolder, ["status", "--porcelain", "--untracked-files=all", "--", "tools"]).split("\n").filter((line) => line.includes("node_modules")).length, 0, "[playbook-library-46] Git ignores the links");

  // [playbook-library-46] a tree an earlier app installed — its module
  // the release's, linked from the store — is prepared where it stands
  // when an install finds the lock installed already.
  rmSync(module);
  linkSync(home.store.pathOf(lockedModule.sha256, false), module);
  const again = await installAsOnDisk(base);
  assert.equal(again.unchanged, true);
  assertEngineImported("found installed");
  assert.notEqual(statSync(module).ino, statSync(home.store.pathOf(lockedModule.sha256, false)).ino, "[playbook-library-46] replaced, never written through the store's link");
  assert.deepEqual(again.engineKept, report.engineKept);
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
    const report = await installAsOnDisk({
      root: elsewhere.clone, lock, store: elsewhere.store, cache: elsewhere.cache, registry: client,
      git: gitSource(elsewhere.cache, { runGit: run, credentialArgs: testCredentialArgs(join(scratch, "credentials")) }),
      gitCredential: credential, pathRoot: null,
    });
    assert.deepEqual(report.installed, ["acme/tools"]);
    assert.ok(host.refused > refusedBefore, "the fetch went through the host's credential challenge");
    assert.match(readFileSync(join(elsewhere.clone, ".spex/packages/acme/tools/skills/en/sharpen/SKILL.md"), "utf8"), /first commit/);
    assert.ok(statSync(join(elsewhere.clone, ".spex/packages/acme/tools/skills/en/sharpen/hone.sh")).mode & 0o100);
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
  const report = await installAsOnDisk({ root: home.clone, lock, store: home.store, cache: home.cache, registry: member, git: gitSource(home.cache), pathRoot: null });
  assert.deepEqual(report.installed, ["vault/secrets"]);

  const other = makeHome();
  mkdirSync(other.clone, { recursive: true });
  writeFileSync(join(other.clone, "spex.yaml"), text);
  await assert.rejects(installAsOnDisk({ root: other.clone, lock, store: other.store, cache: other.cache, registry: anonymous, git: gitSource(other.cache), pathRoot: null }),
    (error: unknown) => error instanceof InstallError && error.packageName === "vault/secrets" && /vault\/secrets/.test(error.message));
  await assert.rejects(resolveText(other.clone, text, { through: stranger }),
    (error: unknown) => error instanceof RegistryError && error.kind === "forbidden" && error.packageName === "vault/secrets");
  // One the registry does not list to a reader is its answer, never a
  // conflict of versions (environments-5).
  await assert.rejects(resolveText(other.clone, text, { through: anonymous }),
    (error: unknown) => error instanceof RegistryError && error.kind === "not_found" && error.packageName === "vault/secrets",
    "[environments-5] the registry's answer naming the package");
  // An outage is reported naming what could not be read.
  registry.script.unavailable(1);
  await assert.rejects(resolveText(other.clone, text, { through: member }),
    (error: unknown) => error instanceof RegistryError && error.kind === "unavailable" && error.packageName === "vault/secrets");
});

// ---------------------------------------------------------------------------
// environments-28: the orgs a person may publish to
// ---------------------------------------------------------------------------

test("environments-28: the orgs scripted for the device's app token read sorted by name, and every other answer reads as none", async () => {
  const asked = (): number => registry.script.requests.filter((request) => request === "GET /api/v1/account/orgs").length;
  registry.script.setOrgs("publisher-token", [
    { name: "workshop", path: "acme/workshop", role: "developer" },
    { name: "alpha", path: "alpha", role: "owner" },
  ]);
  const publisher = new RegistryClient({ url: registry.url, token: async () => "publisher-token" });
  let before = asked();
  assert.deepEqual(await publisher.orgs(), [
    { name: "alpha", path: "alpha", role: "owner" },
    { name: "workshop", path: "acme/workshop", role: "developer" },
  ]);
  assert.equal(asked() - before, 1, "one request");

  // Another token, or none, is refused 401; an outage answers 500.
  assert.equal(await new RegistryClient({ url: registry.url, token: async () => "someone-else" }).orgs(), null);
  assert.equal(await client.orgs(), null);
  registry.script.unavailable(1);
  assert.equal(await publisher.orgs(), null);

  // An answer delayed a second past the timeout is none, once the
  // timeout has passed.
  registry.script.delayOrgs(ORGS_TIMEOUT_MS + 1_000);
  try {
    before = asked();
    const started = Date.now();
    assert.equal(await publisher.orgs(), null);
    const waited = Date.now() - started;
    assert.ok(waited >= ORGS_TIMEOUT_MS - 50 && waited < ORGS_TIMEOUT_MS + 1_000, `waited ${waited} ms`);
    assert.equal(asked() - before, 1, "one request");
  } finally {
    registry.script.delayOrgs(0);
  }
});

// ---------------------------------------------------------------------------
// environments-18: one stand-in registry behind several instances
// ---------------------------------------------------------------------------

test("environments-18: one stand-in registry answers at each instance relaying to it", async () => {
  const scratch = scratchDir("spex-relay-");
  const shared = await startStandinRegistry({ dir: join(scratch, "registry") });
  const first = await startStandinHost({ dir: join(scratch, "first"), displayName: "First", registry: shared.url });
  const second = await startStandinHost({ dir: join(scratch, "second"), displayName: "Second", person: { id: "1002", login: "bob", displayName: "Bob" }, registry: shared.url });
  const third = await startStandinHost({ dir: join(scratch, "third"), displayName: "Third", person: { id: "1003", login: "grace", displayName: "Grace Hopper" }, registry: shared.url });
  try {
    // A home signed in to the first and the second, another to the third
    // alone, each app token minted by its instance's own sign-in.
    const tokenAt = async (home: string, host: StandinHost): Promise<string> => {
      const signedIn = instanceClient(join(scratch, home), host);
      await browserSignIn(signedIn);
      const secret = await signedIn.accessSecret();
      assert.ok(secret, "the sign-in stored an app token");
      return secret;
    };
    const one = await tokenAt("home", first);
    const two = await tokenAt("home", second);
    const three = await tokenAt("other", third);
    /** The registry as reached at `host`, presenting `token` or none. */
    const at = (host: Pick<StandinHost, "url">, token?: string): RegistryClient =>
      new RegistryClient({ url: host.url, ...(token === undefined ? {} : { token: async () => token }) });
    const refusedAs = (kind: string, code?: string) => (error: unknown): boolean => {
      assert.ok(error instanceof RegistryError, String(error));
      assert.equal(error.kind, kind, error.message);
      if (code !== undefined) assert.equal(error.code, code, error.message);
      return true;
    };
    const versionsOf = async (registry: RegistryClient, name: string): Promise<string[]> => (await registry.index(name)).versions.map((entry) => entry.version);
    const get = (path: string, instance: string | null, account: string | null, bearer: boolean) => ({ method: "GET", path, instance, account, bearer });

    // A private org whose readers are both instances, published to
    // through the first as its account: it reads with either instance's
    // token, finds nothing without one, and is forbidden through the
    // third, which it does not list, and to the first's token presented
    // to the registry directly, through no instance.
    shared.script.setPrivate("vault", [first.url, second.url]);
    const vault = join(scratch, "vault");
    await makeRelease(vault, manifestOf("vault/secrets", "1.0.0", { keep: { kind: "skill", language: "en" } }), skillFiles("keep"));
    let from = shared.script.received.length;
    const { checksum } = await publishRelease(at(first, one), vault);
    assert.deepEqual(shared.script.received.slice(from), [{ method: "PUT", path: "/api/v1/packages/vault/secrets/1.0.0", instance: first.url, account: "ada", bearer: true }]);
    from = shared.script.received.length;
    assert.equal((await at(first, one).version("vault/secrets", "1.0.0")).checksum, checksum);
    assert.deepEqual(await versionsOf(at(second, two), "vault/secrets"), ["1.0.0"]);
    await assert.rejects(at(first).index("vault/secrets"), refusedAs("not_found"));
    await assert.rejects(at(third, three).index("vault/secrets"), refusedAs("forbidden"));
    await assert.rejects(at(shared, one).index("vault/secrets"), refusedAs("forbidden"));
    assert.deepEqual(shared.script.received.slice(from), [
      get("/api/v1/packages/vault/secrets/1.0.0", first.url, "ada", true),
      get("/api/v1/packages/vault/secrets", second.url, "bob", true),
      get("/api/v1/packages/vault/secrets", first.url, null, false),
      get("/api/v1/packages/vault/secrets", third.url, "grace", true),
      get("/api/v1/packages/vault/secrets", null, null, true),
    ]);
    // No relay header a request carries passes the relay: through the
    // third, a request claiming the second is still the third's.
    const forged = await fetch(`${third.url}/api/v1/packages/vault/secrets`, {
      headers: { authorization: `Bearer ${three}`, [RELAY_HEADERS.instance]: second.url, [RELAY_HEADERS.account]: "bob" },
    });
    assert.equal(forged.status, 403);
    await forged.arrayBuffer();
    assert.deepEqual(shared.script.received.at(-1), get("/api/v1/packages/vault/secrets", third.url, "grace", true));

    // A token the instance does not know — another instance's, or one
    // never issued — is refused 401 invalid_token on every route, a public
    // spec package's among them, which reads there with no token.
    const open = join(scratch, "open");
    await makeRelease(open, manifestOf("acme/open", "1.0.0", { tidy: { kind: "skill", language: "en" } }), skillFiles("tidy"));
    await publishRelease(at(second, two), open);
    const never = `spexa_${"A".repeat(43)}`;
    from = shared.script.received.length;
    for (const [host, token] of [[first, two], [second, never]] as const) {
      await assert.rejects(at(host, token).index("acme/open"), refusedAs("unauthenticated", "invalid_token"));
      await assert.rejects(at(host, token).index("vault/secrets"), refusedAs("unauthenticated", "invalid_token"));
    }
    assert.deepEqual(shared.script.received.slice(from), [
      get("/api/v1/packages/acme/open", first.url, null, true),
      get("/api/v1/packages/vault/secrets", first.url, null, true),
      get("/api/v1/packages/acme/open", second.url, null, true),
      get("/api/v1/packages/vault/secrets", second.url, null, true),
    ]);
    assert.deepEqual(await versionsOf(at(first), "acme/open"), ["1.0.0"]);

    // A scripted refusal answers one instance's tokens alone, with
    // token_revoked unless it names another code; a request presenting no
    // token there still reads the public spec package.
    shared.script.refuseTokens(first.url);
    try {
      await assert.rejects(at(first, one).index("acme/open"), refusedAs("unauthenticated", "token_revoked"));
      await assert.rejects(at(first, one).version("vault/secrets", "1.0.0"), refusedAs("unauthenticated", "token_revoked"));
      assert.equal((await at(second, two).version("vault/secrets", "1.0.0")).checksum, checksum);
      assert.deepEqual(await versionsOf(at(first), "acme/open"), ["1.0.0"]);
      shared.script.refuseTokens(second.url, "reauth_required");
      await assert.rejects(at(second, two).index("acme/open"), refusedAs("unauthenticated", "reauth_required"));
    } finally {
      shared.script.refuseTokens(null);
    }
    assert.equal((await at(first, one).version("vault/secrets", "1.0.0")).checksum, checksum);
    assert.deepEqual(await versionsOf(at(second, two), "acme/open"), ["1.0.0"]);

    // The orgs scripted for an instance are listed, sorted by name, for
    // its tokens alone: another instance's token, an unknown one, or none
    // reads as no answer.
    shared.script.setOrgs(first.url, [
      { name: "workshop", path: "acme/workshop", role: "developer" },
      { name: "alpha", path: "alpha", role: "owner" },
    ]);
    shared.script.setOrgs(second.url, [{ name: "beta", path: "beta", role: "maintainer" }]);
    from = shared.script.received.length;
    assert.deepEqual(await at(first, one).orgs(), [
      { name: "alpha", path: "alpha", role: "owner" },
      { name: "workshop", path: "acme/workshop", role: "developer" },
    ]);
    assert.deepEqual(await at(second, two).orgs(), [{ name: "beta", path: "beta", role: "maintainer" }]);
    assert.equal(await at(third, three).orgs(), null);
    assert.equal(await at(first, two).orgs(), null);
    assert.equal(await at(first).orgs(), null);
    assert.deepEqual(shared.script.received.slice(from), [
      get("/api/v1/account/orgs", first.url, "ada", true),
      get("/api/v1/account/orgs", second.url, "bob", true),
      get("/api/v1/account/orgs", third.url, "grace", true),
      get("/api/v1/account/orgs", first.url, null, true),
      get("/api/v1/account/orgs", first.url, null, false),
    ]);

    // A raw file and a release archive arrive through the relay, a private
    // one's only to its readers.
    from = shared.script.received.length;
    assert.equal(Buffer.from(await at(first, one).file("vault/secrets", "1.0.0", "skills/en/keep/SKILL.md")).toString("utf8"), skillText("keep"));
    assert.equal(sha256Hex(await at(second, two).archive("vault/secrets", "1.0.0")), checksum);
    assert.equal(Buffer.from(await at(third).file("acme/open", "1.0.0", "skills/en/tidy/SKILL.md")).toString("utf8"), skillText("tidy"));
    await assert.rejects(at(third, three).file("vault/secrets", "1.0.0", "skills/en/keep/SKILL.md"), refusedAs("forbidden"));
    assert.deepEqual(shared.script.received.slice(from), [
      get("/vault/secrets/1.0.0/skills/en/keep/SKILL.md", first.url, "ada", true),
      get("/api/v1/packages/vault/secrets/1.0.0/download", second.url, "bob", true),
      get("/acme/open/1.0.0/skills/en/tidy/SKILL.md", third.url, null, false),
      get("/vault/secrets/1.0.0/skills/en/keep/SKILL.md", third.url, "grace", true),
    ]);
    assert.deepEqual(shared.script.requests.slice(-4), [
      "GET /vault/secrets/1.0.0/skills/en/keep/SKILL.md",
      "GET /api/v1/packages/vault/secrets/1.0.0/download",
      "GET /acme/open/1.0.0/skills/en/tidy/SKILL.md",
      "GET /vault/secrets/1.0.0/skills/en/keep/SKILL.md",
    ]);
    shared.script.clearRequests();
    assert.deepEqual([shared.script.requests, shared.script.received], [[], []]);
  } finally {
    await Promise.all([first.close(), second.close(), third.close()]);
    await shared.close();
  }
});

// ---------------------------------------------------------------------------
// environments-5, environments-7, environments-12: several registries
// ---------------------------------------------------------------------------

/** Stand-in registries of a test's own, each under the scratch folder. */
function ownRegistries(scratch: string, count: number): Promise<StandinRegistry[]> {
  return Promise.all(Array.from({ length: count }, (_, at) => startStandinRegistry({ dir: join(scratch, `registry-${at + 1}`) })));
}

/** The registry source a lock records for a spec package. */
function registrySourceOf(lock: Lock, name: string): RegistrySourceLock {
  const source = lock.packages[name]?.source;
  assert.ok(source && "registry" in source, `${name} is locked from a registry`);
  return source as RegistrySourceLock;
}

test("environments-5: a resolution keeps the registry its lock records where it reproduces the version and checksum, and records the one asked otherwise", async () => {
  const scratch = scratchDir("spex-keep-");
  const [r1, r2] = await ownRegistries(scratch, 2);
  try {
    const one = new RegistryClient({ url: r1.url });
    const two = new RegistryClient({ url: r2.url });
    // One release folder published to both packs to one archive, so both
    // hold it at one checksum; another spec package is published at one
    // version as a release of its own to each; a third has a newer
    // version at the second alone.
    const same = await makeRelease(join(scratch, "same"), manifestOf("acme/same", "1.0.0", { same: { kind: "skill", language: "en" } }), skillFiles("same"));
    assert.equal((await publishRelease(one, same)).checksum, (await publishRelease(two, same)).checksum);
    await publish(manifestOf("acme/differs", "1.0.0", { differs: { kind: "skill", language: "en" } }), skillFiles("differs", "en", "the first's release"), one);
    await publish(manifestOf("acme/differs", "1.0.0", { differs: { kind: "skill", language: "en" } }), skillFiles("differs", "en", "the second's release"), two);
    const newer = await makeRelease(join(scratch, "newer"), manifestOf("acme/newer", "1.0.0", { newer: { kind: "skill", language: "en" } }), skillFiles("newer"));
    await publishRelease(one, newer);
    await publishRelease(two, newer);
    await publish(manifestOf("acme/newer", "1.1.0", { newer: { kind: "skill", language: "en" } }), skillFiles("newer", "en", "newer"), two);

    const home = makeHome();
    const text = requestsYaml({ "acme/same": { version: "^1.0.0" }, "acme/differs": { version: "^1.0.0" }, "acme/newer": { version: "^1.0.0" } });
    const resolveAt = async (registry: RegistrySource, previous?: Lock, requestsText = text): Promise<Lock> => locked(await resolve({
      requests: parseRequests(requestsText), requestsText, registry, pathRoot: null, git: gitSource(home.cache), ...(previous ? { previous } : {}),
    }));

    // Resolved at the first, every spec package records the first.
    const first = await resolveAt(one);
    for (const name of ["acme/differs", "acme/newer", "acme/same"]) assert.equal(registrySourceOf(first, name).registry, r1.url, name);
    assert.equal(registrySourceOf(first, "acme/newer").version, "1.0.0");

    // Resolved again at the second with that lock in hand: the release
    // the second holds at the recorded version and checksum keeps the
    // first; another checksum, or another version, records the second.
    const again = await resolveAt(two, first);
    assert.deepEqual(registrySourceOf(again, "acme/same"), registrySourceOf(first, "acme/same"));
    assert.equal(registrySourceOf(again, "acme/differs").registry, r2.url);
    assert.equal(registrySourceOf(again, "acme/differs").version, "1.0.0");
    assert.notEqual(registrySourceOf(again, "acme/differs").checksum, registrySourceOf(first, "acme/differs").checksum);
    assert.equal(registrySourceOf(again, "acme/newer").registry, r2.url);
    assert.equal(registrySourceOf(again, "acme/newer").version, "1.1.0");

    // Only the label is kept: the solution is the one resolved there
    // with no lock in hand, which records the second throughout.
    const fresh = await resolveAt(two);
    for (const name of ["acme/differs", "acme/newer", "acme/same"]) assert.equal(registrySourceOf(fresh, name).registry, r2.url, name);
    const unlabelled = (lock: Lock): Lock => {
      const copy = structuredClone(lock);
      for (const resolution of Object.values(copy.packages)) if ("registry" in resolution.source) resolution.source.registry = "";
      return copy;
    };
    assert.deepEqual(unlabelled(again), unlabelled(fresh));

    // The built-in spec package's resolution, made from the seed offline,
    // records the registry it was resolved at, and keeps the one a lock
    // records at its version and checksum; neither registry is asked.
    const pkg = builtinPackage();
    const builtinText = requestsYaml({ "sublang/playbooks": { version: `^${pkg.version}` } });
    const seeded = compositeRegistry(builtinRegistrySource({ store: home.store, cacheDir: home.cache, url: two.url, shipped: pkg }), two);
    r1.script.clearRequests();
    r2.script.clearRequests();
    const resolvedThere = await resolveAt(seeded, undefined, builtinText);
    assert.equal(registrySourceOf(resolvedThere, "sublang/playbooks").registry, r2.url);
    const recorded = builtinLock(pkg, r1.url, builtinText);
    const kept = await resolveAt(seeded, recorded, builtinText);
    assert.deepEqual(registrySourceOf(kept, "sublang/playbooks"), registrySourceOf(recorded, "sublang/playbooks"));
    assert.deepEqual([r1.script.requests, r2.script.requests], [[], []]);
  } finally {
    await Promise.all([r1.close(), r2.close()]);
  }
});

test("environments-5, environments-3: a lock's registry is kept only as an instance's canonical origin — another spelling of an origin kept as that origin, a path, a file URL, a user or no URL at all giving way to the registry asked", async () => {
  const scratch = scratchDir("spex-keep-origin-");
  const [r1, r2] = await ownRegistries(scratch, 2);
  try {
    const one = new RegistryClient({ url: r1.url });
    await publishRelease(one, await makeRelease(join(scratch, "same"), manifestOf("acme/same", "1.0.0", { same: { kind: "skill", language: "en" } }), skillFiles("same")));
    const home = makeHome();
    const text = requestsYaml({ "acme/same": { version: "^1.0.0" } });
    const resolveAt = async (previous?: Lock): Promise<Lock> => locked(await resolve({
      requests: parseRequests(text), requestsText: text, registry: one, pathRoot: null, git: gitSource(home.cache), ...(previous ? { previous } : {}),
    }));
    const first = await resolveAt();
    assert.equal(registrySourceOf(first, "acme/same").registry, r1.url);
    /** The same lock, its release recorded at `registry`. */
    const recording = (registry: string): Lock => {
      const copy = structuredClone(first);
      (copy.packages["acme/same"]!.source as RegistrySourceLock).registry = registry;
      return copy;
    };
    const port = new URL(r2.url).port;
    r2.script.clearRequests();

    // Another spelling of the second's origin, for the release the first
    // reproduces at that version and checksum, is kept as the second's
    // canonical origin (environments-5, environments-3).
    for (const spelling of [`HTTP://127.0.0.1:${port}/`, `http://127.0.0.1:0${port}`]) {
      const kept = await resolveAt(recording(spelling));
      assert.deepEqual(registrySourceOf(kept, "acme/same"), { ...registrySourceOf(first, "acme/same"), registry: r2.url }, spelling);
    }

    // A recorded registry that names no origin is not kept: the
    // resolution records the registry it asked (environments-3).
    for (const recorded of [`${r2.url}/api/v1`, "file:///srv/registry", `http://reader@127.0.0.1:${port}`, "_"]) {
      const asked = await resolveAt(recording(recorded));
      assert.deepEqual(registrySourceOf(asked, "acme/same"), registrySourceOf(first, "acme/same"), recorded);
    }
    assert.deepEqual(r2.script.requests, [], "the recorded registry is asked nothing");
  } finally {
    await Promise.all([r1.close(), r2.close()]);
  }
});

test("environments-7: an install takes each registry package from the first registry serving its locked checksum", async () => {
  const scratch = scratchDir("spex-candidates-");
  const [r1, r2, r3] = await ownRegistries(scratch, 3);
  try {
    const [one, two, three] = [r1, r2, r3].map((registry) => new RegistryClient({ url: registry.url })) as [RegistryClient, RegistryClient, RegistryClient];
    // The first holds `acme/kept` and `acme/both`; the second neither; the
    // third `acme/kept` as another release at that version, and `acme/both`
    // as the first holds it.
    const keptRelease = await makeRelease(join(scratch, "kept"), manifestOf("acme/kept", "1.0.0", { kept: { kind: "skill", language: "en" } }), {
      ...skillFiles("kept"),
      "skills/en/kept/notes.txt": "kept notes\n",
    });
    await publishRelease(one, keptRelease);
    await publish(manifestOf("acme/kept", "1.0.0", { kept: { kind: "skill", language: "en" } }), skillFiles("kept", "en", "another release"), three);
    const bothRelease = await makeRelease(join(scratch, "both"), manifestOf("acme/both", "1.0.0", { both: { kind: "skill", language: "en" } }), skillFiles("both"));
    await publishRelease(one, bothRelease);
    await publishRelease(three, bothRelease);

    const text = requestsYaml({ "acme/kept": { version: "1.0.0" }, "acme/both": { version: "1.0.0" } });
    const home = makeHome();
    const lock = locked(await resolveText(home.clone, text, { through: one }));
    await writeLock(join(home.clone, "spex.lock"), lock);
    const kept = registrySourceOf(lock, "acme/kept");
    const both = registrySourceOf(lock, "acme/both");
    /** A home of its own holding the environment's files, sharing `cache`
     * where given. */
    const homeWith = (cache?: string): Home => {
      const made = makeHome();
      mkdirSync(made.clone, { recursive: true });
      cpSync(join(home.clone, "spex.yaml"), join(made.clone, "spex.yaml"));
      cpSync(join(home.clone, "spex.lock"), join(made.clone, "spex.lock"));
      return cache === undefined ? made : { ...made, cache };
    };
    const installAt = (at: Home, registries: readonly RegistrySource[], asked: RegistrySourceLock[] = []) => installAsOnDisk({
      root: at.clone, lock, store: at.store, cache: at.cache, registry: one, git: gitSource(at.cache), pathRoot: null,
      registries: (source) => { asked.push(source); return registries; },
    });
    const clear = (): void => { for (const registry of [r1, r2, r3]) registry.script.clearRequests(); };
    const version = (name: string): string => `GET /api/v1/packages/${name}/1.0.0`;
    const download = (name: string): string => `GET /api/v1/packages/${name}/1.0.0/download`;
    const installedAsLocked = (at: Home): void => {
      for (const name of ["acme/both", "acme/kept"]) {
        for (const file of lock.packages[name]!.files) {
          assert.equal(sha256Hex(readFileSync(join(at.clone, ".spex", "packages", ...name.split("/"), ...file.path.split("/")))), file.sha256, `${name} ${file.path}`);
        }
      }
    };

    // Asked in turn — the second lacking both, the third holding `acme/kept`
    // at another checksum — each spec package comes from the first
    // registry serving its locked checksum: `acme/both` from the third,
    // `acme/kept` from the first, the third's other release fetched not.
    clear();
    const asked: RegistrySourceLock[] = [];
    const report = await installAt(home, [two, three, one], asked);
    assert.deepEqual(report.installed, ["acme/both", "acme/kept"]);
    assert.deepEqual(asked, [both, kept]);
    installedAsLocked(home);
    assert.deepEqual(r2.script.requests, [version("acme/both"), version("acme/kept")]);
    assert.deepEqual(r3.script.requests, [version("acme/both"), download("acme/both"), version("acme/kept")]);
    assert.deepEqual(r1.script.requests, [version("acme/kept"), download("acme/kept")]);

    // The cache holds each registry's answer under that registry's folder,
    // and each archive under the checksum it was verified at.
    const resourceAt = (registry: StandinRegistry, cache: string, name: string): string => join(cache, "registry", cacheFolderOf(registry.url), ...name.split("/"), "1.0.0.json");
    const archivesOf = (cache: string, name: string): string[] => readdirSync(join(cache, "archives", ...name.split("/"), "1.0.0")).sort();
    for (const [registry, name] of [[r1, "acme/kept"], [r3, "acme/kept"], [r3, "acme/both"]] as const) assert.ok(existsSync(resourceAt(registry, home.cache, name)), `${registry.url} ${name}`);
    assert.notEqual(JSON.parse(readFileSync(resourceAt(r3, home.cache, "acme/kept"), "utf8")).checksum, kept.checksum);
    assert.ok(!existsSync(join(home.cache, "registry", cacheFolderOf(r2.url))), "a registry lacking the release leaves nothing cached");
    assert.deepEqual(archivesOf(home.cache, "acme/kept"), [`${kept.checksum}.tgz`]);
    assert.deepEqual(archivesOf(home.cache, "acme/both"), [`${both.checksum}.tgz`]);

    // A home sharing that cache: an answer cached with the locked checksum
    // and an archive cached at it serve without a request, an answer
    // cached with another checksum is asked again.
    clear();
    const sharing = homeWith(home.cache);
    await installAt(sharing, [two, three, one]);
    installedAsLocked(sharing);
    assert.deepEqual(r1.script.requests, []);
    assert.deepEqual(r3.script.requests, [version("acme/kept")]);
    assert.deepEqual(r2.script.requests, [version("acme/both"), version("acme/kept")]);

    // An outage moves on as well.
    clear();
    r2.script.unavailable(1);
    const afterOutage = homeWith();
    assert.deepEqual((await installAt(afterOutage, [two, one])).installed, ["acme/both", "acme/kept"]);
    installedAsLocked(afterOutage);
    assert.deepEqual(r2.script.requests, [version("acme/both"), version("acme/kept")]);
    assert.deepEqual(r1.script.requests, [version("acme/both"), download("acme/both"), version("acme/kept"), download("acme/kept")]);

    // Where none serves it at the locked checksum, the install fails naming
    // the spec package and each registry's answer, and installs nothing.
    const unserved = homeWith();
    await assert.rejects(installAt(unserved, [two, three]), (error: unknown) => {
      assert.ok(error instanceof InstallError, String(error));
      assert.equal(error.packageName, "acme/kept");
      assert.match(error.message, /^acme\/kept 1\.0\.0: no registry has it as spex\.lock records it: /);
      assert.ok(error.message.includes(`not at ${new URL(r2.url).host}, or private`), error.message);
      assert.ok(error.message.includes(`${new URL(r3.url).host} has it, but not as spex.lock records it`), error.message);
      return true;
    });
    assert.equal(existsSync(join(unserved.clone, ".spex", "packages")), false);

    // cache/ deleted, an install that needs it rebuilds it in that layout.
    rmSync(home.cache, { recursive: true, force: true });
    const rebuilt = homeWith(home.cache);
    await installAt(rebuilt, [two, three, one]);
    installedAsLocked(rebuilt);
    assert.ok(existsSync(resourceAt(r1, home.cache, "acme/kept")));
    assert.deepEqual(archivesOf(home.cache, "acme/kept"), [`${kept.checksum}.tgz`]);
  } finally {
    await Promise.all([r1.close(), r2.close(), r3.close()]);
  }
});

test("environments-7: two registries at one loopback host and port, apart by scheme alone, cache their answers apart, so one's answer never counts for the other", async () => {
  const scratch = scratchDir("spex-scheme-cache-");
  const [r1, r2] = await ownRegistries(scratch, 2);
  try {
    const one = new RegistryClient({ url: r1.url });
    const two = new RegistryClient({ url: r2.url });
    // The first holds the release the lock records; the second another
    // release at that version, answering as `https` at the first's host
    // and port, so the two registries' instances share one folder.
    const manifest = manifestOf("acme/kept", "1.0.0", { kept: { kind: "skill", language: "en" } });
    await publishRelease(one, await makeRelease(join(scratch, "kept"), manifest, skillFiles("kept")));
    await publish(manifest, skillFiles("kept", "en", "another release"), two);
    const secure = `https://127.0.0.1:${new URL(r1.url).port}`;
    assert.equal(instanceFolder(secure), instanceFolder(r1.url));
    const apart: RegistrySource = {
      url: secure,
      index: (name) => two.index(name),
      version: (name, version) => two.version(name, version),
      file: (name, version, path) => two.file(name, version, path),
      archive: (name, version) => two.archive(name, version),
      publish: (name, version, tgz) => two.publish(name, version, tgz),
      search: (query) => two.search(query),
    };

    const text = requestsYaml({ "acme/kept": { version: "1.0.0" } });
    const home = makeHome();
    const lock = locked(await resolveText(home.clone, text, { through: one }));
    await writeLock(join(home.clone, "spex.lock"), lock);
    const kept = registrySourceOf(lock, "acme/kept");
    const installAt = (at: Home) => installAsOnDisk({
      root: at.clone, lock, store: at.store, cache: at.cache, registry: one, git: gitSource(at.cache), pathRoot: null,
      registries: () => [apart, one],
    });
    const clear = (): void => { for (const registry of [r1, r2]) registry.script.clearRequests(); };
    const version = "GET /api/v1/packages/acme/kept/1.0.0";

    // Asked first, the `https` registry answers another checksum and the
    // `http` one serves the release; each answer is cached apart, under
    // its scheme's folder.
    clear();
    assert.deepEqual((await installAt(home)).installed, ["acme/kept"]);
    const cachedAt = (url: string): string => (JSON.parse(readFileSync(join(home.cache, "registry", cacheFolderOf(url), "acme", "kept", "1.0.0.json"), "utf8")) as { checksum: string }).checksum;
    assert.equal(cachedAt(r1.url), kept.checksum);
    assert.notEqual(cachedAt(secure), kept.checksum);
    assert.deepEqual(r2.script.requests, [version]);

    // A home sharing that cache: the `https` registry's own answer, at
    // another checksum, has it asked again, the `http` one's answer and
    // archive serving with no request; the `http` answer never counts for
    // the `https` registry.
    clear();
    const sharing = { ...makeHome(), cache: home.cache };
    mkdirSync(sharing.clone, { recursive: true });
    for (const file of ["spex.yaml", "spex.lock"]) cpSync(join(home.clone, file), join(sharing.clone, file));
    assert.deepEqual((await installAt(sharing)).installed, ["acme/kept"]);
    assert.deepEqual(r2.script.requests, [version]);
    assert.deepEqual(r1.script.requests, []);
  } finally {
    await Promise.all([r1.close(), r2.close()]);
  }
});

test("environments-12: a registry answering invalid_token, token_revoked or reauth_required reports the token it refused and fails the call; token_expired, another 401 and a call without a token report none", async () => {
  const scratch = scratchDir("spex-refused-");
  const [registryAt, spare] = await ownRegistries(scratch, 2);
  try {
    const release = await makeRelease(join(scratch, "open"), manifestOf("acme/open", "1.0.0", { open: { kind: "skill", language: "en" } }), skillFiles("open"));
    await publishRelease(new RegistryClient({ url: registryAt.url }), release);
    await publishRelease(new RegistryClient({ url: spare.url }), release);
    const reported: [string, string][] = [];
    const presenting = (registry: StandinRegistry, token: string | null): RegistryClient =>
      new RegistryClient({ url: registry.url, token: async () => token, refused: (refused, code) => { reported.push([refused, code]); } });
    const failedAs = (kind: string, code?: string) => (error: unknown): boolean => {
      assert.ok(error instanceof RegistryError, String(error));
      assert.equal(error.kind, kind, error.message);
      assert.equal(error.code, code, error.message);
      return true;
    };

    // Each sign-out code, on every call presenting the token: the call
    // fails, the token it presented and the code reported once per call;
    // the orgs still read as no answer.
    for (const code of ["invalid_token", "token_revoked", "reauth_required"]) {
      const token = `refused-as-${code}`;
      registryAt.script.refuseTokens(token, code);
      const client = presenting(registryAt, token);
      reported.length = 0;
      await assert.rejects(client.index("acme/open"), failedAs("unauthenticated", code));
      await assert.rejects(client.version("acme/open", "1.0.0"), failedAs("unauthenticated", code));
      await assert.rejects(client.file("acme/open", "1.0.0", "skills/en/open/SKILL.md"), failedAs("unauthenticated", code));
      await assert.rejects(client.archive("acme/open", "1.0.0"), failedAs("unauthenticated", code));
      await assert.rejects(client.search("open"), failedAs("unauthenticated", code));
      await assert.rejects(publishRelease(client, release), failedAs("unauthenticated", code));
      assert.equal(await client.orgs(), null);
      assert.deepEqual(reported, Array.from({ length: 7 }, () => [token, code]), code);
    }

    // A resolution presenting it fails, the refusal reported; an install
    // presenting it there moves on to the next registry serving the
    // release, as it does past a token that cannot be had, which reaches
    // no registry and is reported as no refusal.
    const revoked = "refused-as-token_revoked";
    const home = makeHome();
    const text = requestsYaml({ "acme/open": { version: "^1.0.0" } });
    reported.length = 0;
    await assert.rejects(resolveText(home.clone, text, { through: presenting(registryAt, revoked) }), failedAs("unauthenticated", "token_revoked"));
    assert.deepEqual(reported, [[revoked, "token_revoked"]]);
    const lock = locked(await resolveText(home.clone, text, { through: presenting(registryAt, null) }));
    await writeLock(join(home.clone, "spex.lock"), lock);
    const unhad = new RegistryClient({ url: registryAt.url, token: async () => { throw new Error("the instance could not be reached"); }, refused: () => { reported.push(["", "unhad"]); } });
    registryAt.script.clearRequests();
    await assert.rejects(unhad.index("acme/open"), (error: unknown) => {
      assert.ok(error instanceof RegistryError, String(error));
      assert.equal(error.kind, "unavailable");
      assert.equal(error.packageName, "acme/open");
      assert.match(error.message, /the instance could not be reached/);
      return true;
    });
    assert.deepEqual(registryAt.script.requests, []);
    reported.length = 0;
    const report = await installAsOnDisk({
      root: home.clone, lock, store: home.store, cache: home.cache, registry: presenting(registryAt, revoked), git: gitSource(home.cache), pathRoot: null,
      registries: () => [presenting(registryAt, revoked), unhad, presenting(spare, null)],
    });
    assert.deepEqual(report.installed, ["acme/open"]);
    assert.deepEqual(reported, [[revoked, "token_revoked"]]);

    // An expired access secret fails its call, reporting nothing; so does
    // another 401 — the orgs refused to a token none are scripted for, and
    // to a call without a token, which a public spec package answers.
    registryAt.script.refuseTokens("expired", "token_expired");
    reported.length = 0;
    await assert.rejects(presenting(registryAt, "expired").index("acme/open"), failedAs("unauthenticated", "token_expired"));
    assert.equal(await presenting(registryAt, "unscripted").orgs(), null);
    assert.equal(await presenting(registryAt, null).orgs(), null);
    assert.deepEqual((await presenting(registryAt, null).index("acme/open")).versions.map((entry) => entry.version), ["1.0.0"]);
    assert.deepEqual(reported, []);
  } finally {
    await Promise.all([registryAt.close(), spare.close()]);
  }
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
  await makeRelease(join(workingFolder, "tools", "walk"), manifestOf("acme/walker", "0.1.0", { walk: { kind: "playbook", language: "en" }, walker: { kind: "spec", language: "en" } }), { ...playbookFiles("walk"), "specs/en/walker.md": specText("walker") });
  const userHome = join(scratch, "user");
  const projectKey = "acme/kit2-spex";
  const ownKey = "me/me-spex";
  const ownClone = cloneOf(home, ownKey);

  const projectText = requestsYaml({ "acme/kit2": { version: "^1.0.0", alias: { fmt: "format-code" } }, "acme/walker": { path: "tools/walk" } });
  const projectLock = locked(await resolveText(home.clone, projectText, { workingFolder }));
  const base = { store: home.store, cache: home.cache, registry: client, git: gitSource(home.cache) };
  await installAsOnDisk({ ...base, root: home.clone, lock: projectLock, pathRoot: workingFolder });
  const report = await exportEnvironment({ root: home.clone, lock: projectLock, workingFolder, userHome: null, agents: ["claude", "codex"] });
  assert.deepEqual(report.skills, ["acme-walker", "format-code", "lint", "ship", "walk"]);
  // The table names every agent Spex drives (environments-16), and a
  // working folder receives every project-level folder whatever agents
  // the device has: Claude Code's, and the one the other four share.
  assert.deepEqual(Object.keys(AGENT_FOLDERS).sort(), [...KNOWN_PLAYER_ADAPTERS].sort());
  // Each agent's project- and user-level folders are the ones Cligent
  // publishes for its runtime (DR-130).
  for (const [agent, folders] of Object.entries(AGENT_FOLDERS)) {
    assert.deepEqual({ project: folders.project, user: folders.user }, { ...getNativeSkillSupport(agent)?.folders }, agent);
  }
  assert.deepEqual(report.folders, [
    { agents: ["claude"], level: "project", dir: join(workingFolder, ".claude/skills") },
    { agents: ["codex", "gemini", "kimi", "opencode"], level: "project", dir: join(workingFolder, ".agents/skills") },
  ]);
  // A playbook's generated skill goes only where Claude Code reads.
  const playbooks = ["ship", "walk"];
  for (const name of report.skills) {
    assert.ok(existsSync(join(home.clone, ".spex", "skills", name, "SKILL.md")), name);
    assert.ok(existsSync(join(workingFolder, ".claude/skills", name, "SKILL.md")), name);
    assert.equal(existsSync(join(workingFolder, ".agents/skills", name)), !playbooks.includes(name), name);
  }
  // An aliased skill is copied with its name rewritten; the verified file is not changed.
  assert.match(readFileSync(join(workingFolder, ".claude/skills/format-code/SKILL.md"), "utf8"), /^---\nname: format-code\n/);
  assert.match(readFileSync(join(workingFolder, ".agents/skills/format-code/SKILL.md"), "utf8"), /^---\nname: format-code\n/);
  assert.match(readFileSync(join(home.clone, ".spex/packages/acme/kit2/skills/en/fmt/SKILL.md"), "utf8"), /^---\nname: fmt\n/);
  // A name YAML would read as another type is written as a string, so an
  // agent reading the skill by its name finds the one it is exported under.
  const frontName = (text: string): unknown => (parseYaml(/^---\n([\s\S]*?)\n---\n/.exec(text)![1]!) as { name: unknown }).name;
  for (const odd of ["true", "null", "123"]) {
    assert.equal(frontName(rewriteSkillName(skillText("fmt"), odd)), odd);
    assert.equal(frontName(playbookSkill({ name: odd, id: "ship", packageName: "acme/kit2", version: "1.0.0" })), odd);
    assert.equal(frontName(specSkill({ name: odd, packageName: "acme/kit2", version: "1.0.0", file: "kit2.md" })), odd);
  }
  // Git ignores the exports, and no staging copy is left beside them.
  const exclude = readFileSync(join(workingFolder, ".git/info/exclude"), "utf8");
  for (const name of report.skills) assert.ok(exclude.includes(`/.claude/skills/${name}/`), name);
  for (const name of report.skills.filter((name) => !playbooks.includes(name))) assert.ok(exclude.includes(`/.agents/skills/${name}/`), name);
  assert.equal(git(workingFolder, ["status", "--porcelain", "--untracked-files=all", "--", ".claude", ".agents"]), "");
  const stagingLeft = (): string[] => [".claude", ".agents"].flatMap((parent) => readdirSync(join(workingFolder, parent)).filter((name) => name.startsWith(".spex-staging-")));
  assert.deepEqual(stagingLeft(), []);
  // A re-export of the same lock leaves each unchanged skill's files as
  // they were, and a changed one stands whole again (environments-30).
  const lintFile = (folder: string): string => join(workingFolder, folder, "lint", "SKILL.md");
  const before = { claude: statSync(lintFile(".claude/skills")).ino, agents: statSync(lintFile(".agents/skills")).ino };
  writeFileSync(lintFile(".agents/skills"), "edited meanwhile\n");
  await exportEnvironment({ root: home.clone, lock: projectLock, workingFolder, userHome: null, agents: ["claude"] });
  assert.equal(statSync(lintFile(".claude/skills")).ino, before.claude, "an unchanged skill is left as it stands");
  assert.ok(readFileSync(lintFile(".agents/skills")).equals(readFileSync(join(home.clone, ".spex/skills/lint/SKILL.md"))), "a changed skill is replaced whole");
  assert.deepEqual(stagingLeft(), []);
  // Where renaming the new copy in fails, the replaced skill is put back.
  const exportProject = (rename?: (from: string, to: string) => void) =>
    exportEnvironment({ root: home.clone, lock: projectLock, workingFolder, userHome: null, agents: ["claude"], ...(rename ? { rename } : {}) });
  writeFileSync(lintFile(".agents/skills"), "edited once more\n");
  await assert.rejects(exportProject((from, to) => {
    if (from.includes(`${sep}new${sep}`)) throw new Error("injected rename failure");
    renameSync(from, to);
  }), /injected rename failure/);
  assert.equal(readFileSync(lintFile(".agents/skills"), "utf8"), "edited once more\n");
  assert.deepEqual(stagingLeft(), []);
  await exportProject();
  assert.ok(readFileSync(lintFile(".agents/skills")).equals(readFileSync(join(home.clone, ".spex/skills/lint/SKILL.md"))), "the next export replaces it");
  if (process.platform !== "win32" && process.getuid?.() !== 0) {
    // Where a changed skill cannot be moved, the previous one stands
    // whole: it is replaced by a rename, never deleted first.
    writeFileSync(lintFile(".agents/skills"), "edited again\n");
    chmodSync(join(workingFolder, ".agents/skills"), 0o555);
    try {
      await assert.rejects(exportEnvironment({ root: home.clone, lock: projectLock, workingFolder, userHome: null, agents: ["claude"] }));
    } finally {
      chmodSync(join(workingFolder, ".agents/skills"), 0o755);
    }
    assert.equal(readFileSync(lintFile(".agents/skills"), "utf8"), "edited again\n");
    assert.deepEqual(stagingLeft(), []);
    await exportEnvironment({ root: home.clone, lock: projectLock, workingFolder, userHome: null, agents: ["claude"] });
    assert.ok(readFileSync(lintFile(".agents/skills")).equals(readFileSync(join(home.clone, ".spex/skills/lint/SKILL.md"))), "the next export replaces it");

    // A working folder whose .agents/skills links to its .claude/skills,
    // before that folder exists, has one folder: an export writes it
    // once, the playbook's skill included, and a second leaves it so.
    const linked = join(scratch, "linked");
    git(scratch, ["init", "--quiet", "-b", "main", linked]);
    mkdirSync(join(linked, ".agents"), { recursive: true });
    symlinkSync("../.claude/skills", join(linked, ".agents/skills"));
    for (let pass = 0; pass < 2; pass += 1) {
      const once = await exportEnvironment({ root: home.clone, lock: projectLock, workingFolder: linked, userHome: null, agents: [] });
      assert.deepEqual(once.folders, [{ agents: ["claude", "codex", "gemini", "kimi", "opencode"], level: "project", dir: join(linked, ".claude/skills") }]);
      assert.deepEqual(once.removed, []);
      for (const name of ["format-code", "lint", "ship"]) assert.ok(existsSync(join(linked, ".claude/skills", name, "SKILL.md")), `${name} after export ${pass + 1}`);
    }
    // A folder the reader put there under an exported name stays as it
    // is, named under both of the folder's names (environments-8).
    const linkedTheirs = join(scratch, "linked-theirs");
    git(scratch, ["init", "--quiet", "-b", "main", linkedTheirs]);
    mkdirSync(join(linkedTheirs, ".claude/skills/lint"), { recursive: true });
    writeFileSync(join(linkedTheirs, ".claude/skills/lint/SKILL.md"), "the reader's own lint\n");
    mkdirSync(join(linkedTheirs, ".agents"), { recursive: true });
    symlinkSync("../.claude/skills", join(linkedTheirs, ".agents/skills"));
    const linkedReport = await exportEnvironment({ root: home.clone, lock: projectLock, workingFolder: linkedTheirs, userHome: null, agents: [] });
    assert.deepEqual(linkedReport.skipped, [{ name: "lint", folder: ".claude/skills" }, { name: "lint", folder: ".agents/skills" }]);
    assert.equal(readFileSync(join(linkedTheirs, ".claude/skills/lint/SKILL.md"), "utf8"), "the reader's own lint\n");
    assert.ok(existsSync(join(linkedTheirs, ".claude/skills/format-code/SKILL.md")));
  }
  // The generated skill names the spec package, version and id; its
  // description and its last sentence send a player back to its step.
  const ship = readFileSync(join(workingFolder, ".claude/skills/ship/SKILL.md"), "utf8");
  const shipFront = parseYaml(/^---\n([\s\S]*?)\n---\n/.exec(ship)![1]!) as Record<string, string>;
  assert.deepEqual(Object.keys(shipFront), ["name", "description"]);
  assert.equal(shipFront.name, "ship");
  assert.equal(shipFront.description, "Starts the ship playbook of acme/kit2 through Spex in this working folder. Not for an agent already playing a role in this or any playbook; that agent does the step it was given.");
  assert.ok(shipFront.description!.length <= 1024);
  assert.match(ship, /`ship`.*`acme\/kit2`.*`1\.0\.0`.*through Spex in this working folder/s);
  assert.match(ship, /\n\nIf you are already inside a Spex session as a player of a playbook, given a role and a step, this skill does not apply: do the step you were given\.\n$/);
  // A path source's spec stands as a generated skill: the working
  // folder's spec file byte for byte, beside a SKILL.md naming the
  // spec package's org, name, version and description.
  const walkerDir = join(workingFolder, ".claude/skills/acme-walker");
  assert.deepEqual(readdirSync(walkerDir).sort(), ["SKILL.md", "walker.md"]);
  assert.ok(readFileSync(join(walkerDir, "walker.md")).equals(readFileSync(join(workingFolder, "tools/walk/specs/en/walker.md"))));
  const walker = readFileSync(join(walkerDir, "SKILL.md"), "utf8");
  const walkerFront = parseYaml(/^---\n([\s\S]*?)\n---\n/.exec(walker)![1]!) as Record<string, string>;
  assert.deepEqual(Object.keys(walkerFront), ["name", "description"]);
  assert.equal(walkerFront.name, "acme-walker");
  assert.match(walkerFront.description!, /acme\/walker 0\.1\.0: The acme\/walker spec package\. Read walker\.md beside this skill\.$/);
  assert.match(walker, /`acme\/walker` — org `acme`, name `walker`, version `0\.1\.0`: The acme\/walker spec package/);
  assert.match(walker, /Its spec is `walker\.md` beside this file/);

  // Your own group's skills go to the user's home; a name the project
  // also exports stands in both, each from where it came.
  const ownText = requestsYaml({ "acme/mine": { version: "^1.0.0" } });
  const ownLock = locked(await resolveText(ownClone, ownText));
  await installAsOnDisk({ ...base, root: ownClone, lock: ownLock, pathRoot: null });
  const ownReport = await exportEnvironment({ root: ownClone, lock: ownLock, workingFolder: null, userHome, agents: ["claude"] });
  assert.deepEqual(ownReport.folders, [{ agents: ["claude"], level: "user", dir: join(userHome, ".claude/skills") }]);
  assert.match(readFileSync(join(userHome, ".claude/skills/lint/SKILL.md"), "utf8"), /my own lint/);
  // The user-level folder the other four share is written only where
  // the device has one of them; the playbook's skill stays out of it.
  assert.equal(existsSync(join(userHome, ".agents")), false);
  const withKimi = await exportEnvironment({ root: ownClone, lock: ownLock, workingFolder: null, userHome, agents: ["claude", "kimi"] });
  assert.deepEqual(withKimi.folders.map((folder) => folder.dir), [join(userHome, ".claude/skills"), join(userHome, ".agents/skills")]);
  assert.match(readFileSync(join(userHome, ".agents/skills/lint/SKILL.md"), "utf8"), /my own lint/);
  assert.equal(existsSync(join(userHome, ".agents/skills/own-pb")), false);
  assert.ok(existsSync(join(userHome, ".claude/skills/own-pb/SKILL.md")));
  // A folder the reader put in a user-level folder under an exported
  // name stays as it is, the skill standing in the other folder, and
  // the export names that folder as the table does (environments-8).
  const otherHome = join(scratch, "other-user");
  mkdirSync(join(otherHome, ".agents/skills/lint"), { recursive: true });
  writeFileSync(join(otherHome, ".agents/skills/lint/SKILL.md"), "the reader's own lint\n");
  const shadowed = await exportEnvironment({ root: ownClone, lock: ownLock, workingFolder: null, userHome: otherHome, agents: ["claude", "kimi"] });
  assert.deepEqual(shadowed.skipped, [{ name: "lint", folder: "~/.agents/skills" }]);
  assert.deepEqual(shadowed.missing, []);
  assert.equal(readFileSync(join(otherHome, ".agents/skills/lint/SKILL.md"), "utf8"), "the reader's own lint\n");
  assert.match(readFileSync(join(otherHome, ".claude/skills/lint/SKILL.md"), "utf8"), /my own lint/);
  assert.match(readFileSync(join(workingFolder, ".claude/skills/lint/SKILL.md"), "utf8"), /the project's lint/);

  // A session hands the launcher the project's playbook, your own
  // group's where the project lacks it, the path source's in the folder.
  const project = { repository: projectKey, locations: moduleLocations(projectLock, home.clone, workingFolder) };
  const own = { repository: ownKey, locations: moduleLocations(ownLock, ownClone, null) };
  const launch = launchModules(["ship", "own-pb", "walk"], project, own);
  assert.ok(launch.ok);
  if (launch.ok) {
    assert.equal(launch.modules.get("ship")!.module, join(home.clone, ".spex/packages/acme/kit2/playbooks/en/ship/ship.playbook/ship.registry.mjs"));
    assert.equal(launch.modules.get("ship")!.repository, projectKey);
    assert.equal(launch.modules.get("own-pb")!.repository, ownKey);
    assert.equal(launch.modules.get("walk")!.module, join(workingFolder, "tools/walk/playbooks/en/walk/walk.playbook/walk.registry.mjs"));
    for (const location of launch.modules.values()) assert.ok(location.present);
    const loaded = (await import(pathToFileURL(launch.modules.get("ship")!.module).href)) as { default: { id: string } };
    assert.equal(loaded.default.id, "ship");
  }
  assert.deepEqual(launchModules(["ship", "ghost"], project, own), { ok: false, errors: [{ playbook: "ghost", repository: projectKey }] });

  // A re-export removes a skill the lock no longer selects and leaves a reader's.
  mkdirSync(join(workingFolder, ".claude/skills/mine"), { recursive: true });
  writeFileSync(join(workingFolder, ".claude/skills/mine/SKILL.md"), skillText("mine"));
  const narrowed = locked(await resolveText(home.clone, requestsYaml({ "acme/kit2": { version: "^1.0.0", select: [{ artifact: "ship" }, { artifact: "fmt" }], alias: { fmt: "format-code" } } }), { workingFolder }));
  await installAsOnDisk({ ...base, root: home.clone, lock: narrowed, pathRoot: workingFolder });
  const again = await exportEnvironment({ root: home.clone, lock: narrowed, workingFolder, userHome: null, agents: ["claude"] });
  assert.deepEqual(again.removed.sort(), ["acme-walker", "lint", "walk"]);
  assert.equal(existsSync(join(workingFolder, ".claude/skills/lint")), false);
  assert.equal(existsSync(join(workingFolder, ".agents/skills/lint")), false);
  assert.ok(existsSync(join(workingFolder, ".claude/skills/mine/SKILL.md")));
  assert.ok(!readFileSync(join(workingFolder, ".git/info/exclude"), "utf8").includes("/.claude/skills/lint/"));

  // Exported again, the skill finds a folder the reader put in
  // `.agents/skills` under its name: that folder stays byte for byte,
  // the skill stands in `.claude/skills`, and the export names it.
  mkdirSync(join(workingFolder, ".agents/skills/lint"), { recursive: true });
  writeFileSync(join(workingFolder, ".agents/skills/lint/SKILL.md"), "the reader's own lint\n");
  const widenedLock = locked(await resolveText(home.clone, projectText, { workingFolder }));
  await installAsOnDisk({ ...base, root: home.clone, lock: widenedLock, pathRoot: workingFolder });
  const widened = await exportEnvironment({ root: home.clone, lock: widenedLock, workingFolder, userHome: null, agents: ["claude"] });
  assert.deepEqual(widened.skipped, [{ name: "lint", folder: ".agents/skills" }]);
  assert.deepEqual(widened.missing, []);
  assert.equal(readFileSync(join(workingFolder, ".agents/skills/lint/SKILL.md"), "utf8"), "the reader's own lint\n");
  assert.match(readFileSync(join(workingFolder, ".claude/skills/lint/SKILL.md"), "utf8"), /the project's lint/);
  const widenedExclude = readFileSync(join(workingFolder, ".git/info/exclude"), "utf8");
  assert.ok(widenedExclude.includes("/.claude/skills/lint/"));
  assert.ok(!widenedExclude.includes("/.agents/skills/lint/"), "the reader's folder is not Spex's to exclude");
  // A working folder lacking the path source exports the rest and names it.
  const bare = join(scratch, "bare");
  git(scratch, ["init", "--quiet", "-b", "main", bare]);
  const lacking = await exportEnvironment({ root: home.clone, lock: widenedLock, workingFolder: bare, userHome: null, agents: ["claude"] });
  assert.deepEqual(lacking.missing, ["acme/walker"]);
  assert.deepEqual(lacking.skipped, []);
  assert.ok(existsSync(join(bare, ".claude/skills/lint/SKILL.md")));
  assert.equal(existsSync(join(bare, ".claude/skills/walk")), false);
  // A path source whose manifest still declares a playbook its folder
  // lacks: no skill runs that playbook, its spec still stands, and the
  // export names the spec package (environments-8).
  const gutted = join(scratch, "gutted");
  git(scratch, ["init", "--quiet", "-b", "main", gutted]);
  await makeRelease(join(gutted, "tools", "walk"), manifestOf("acme/walker", "0.1.0", { walk: { kind: "playbook", language: "en" }, walker: { kind: "spec", language: "en" } }), { "specs/en/walker.md": specText("walker") });
  const gap = await exportEnvironment({ root: home.clone, lock: widenedLock, workingFolder: gutted, userHome: null, agents: ["claude"] });
  assert.deepEqual(gap.missing, ["acme/walker"]);
  assert.ok(!gap.skills.includes("walk"));
  assert.equal(existsSync(join(gutted, ".claude/skills/walk")), false);
  assert.ok(existsSync(join(gutted, ".claude/skills/acme-walker/walker.md")));
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
    const report = await installAsOnDisk({ root: clone, lock, store: home.store, cache: home.cache, registry: source(), git: gitSource(home.cache), pathRoot: null });
    assert.deepEqual(report.installed, ["sublang/playbooks"]);
    locks[clone] = lock;
  }

  // Every built-in playbook loads from the installed spec package.
  const locations = moduleLocations(locks[projectClone]!, projectClone, null);
  assert.deepEqual([...locations.keys()].sort(), ["branch", "code", "decide", "dev", "inspect", "pr", "review"]);
  for (const [id, location] of locations) {
    assert.ok(location.builtin && location.present, id);
    assert.ok(location.module.startsWith(join(projectClone, ".spex", "packages", "sublang", "playbooks", "playbooks", "en", id)), location.module);
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
    const report = await installAsOnDisk({ root: clone, lock: (await readLock(join(clone, "spex.lock")))!, store: home.store, cache: home.cache, registry: source(), git: gitSource(home.cache), pathRoot: null });
    assert.equal(report.unchanged, true);
  }
  // A new environment takes the newer release; the store keeps both while locks select them.
  const newer = locked(await resolveText(cloneOf(home, "acme/later-spex"), text, { through: source() }));
  assert.equal((newer.packages["sublang/playbooks"]!.source as { version: string }).version, newerVersion);
  assert.deepEqual(home.store.gc(lockStoreKeys([...Object.values(locks), newer])).length, 0);
});
