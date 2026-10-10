// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Environments through a real core (environments-22..25): the built-in
// spec package seeded and launched with no registry reachable, a
// playbook authored in a project and published to the stand-in
// registry, and the environment commands driven over the protocol.

import { randomUUID } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import { WebSocket } from "ws";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { CoreService, type CoreServiceOptions } from "./service.js";
import type { EnvironmentManager } from "./environments.js";
import { CoreError } from "./session.js";
import type { Store } from "./store.js";
import { defaultSpawner, type LineSpawner } from "./compile.js";
import { starterText, templatePath } from "./config.js";
import { builtinPackage, publishRelease, readRelease, RegistryClient, type BuiltinPackage } from "./environment/index.js";
import type { Command, CommandResults, EnvironmentState, ServerMessage } from "./protocol.js";
import { authoringScript } from "./testing/authoring.js";
import { fakeAdapterImports, type FakeScript } from "./testing/fake-adapter.js";
import { createScriptedCaptain } from "./testing/scripted-captain.js";
import { scratchDir } from "./testing/scratch.js";
import { createSpaceHarness } from "./testing/space-harness.js";
import { makeRelease, startStandinRegistry } from "./testing/standin-registry.js";
import { stubSlcSource } from "./testing/stub-slc.js";

const OWN = "tester";
const UNREACHABLE = "http://127.0.0.1:9";

const CONFIG = `captain:
  adapter: claude
  model: claude-test
players:
  dev.coder:
    adapter: claude
    model: claude-test
playbooks:
  code:
    roles:
      coder: dev.coder
  review:
    roles:
      coder: dev.coder
      reviewer: dev.coder
`;

class Client {
  private readonly socket: WebSocket;
  readonly messages: ServerMessage[] = [];
  private nextId = 0;

  constructor(port: number) {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/?token=test`);
    this.socket.on("message", (data) => this.messages.push(JSON.parse(String(data)) as ServerMessage));
  }

  async open(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      if (this.socket.readyState === WebSocket.OPEN) { resolve(); return; }
      this.socket.once("open", resolve);
      this.socket.once("error", reject);
    });
    await this.waitFor((m) => m.type === "hello");
  }

  close(): void { this.socket.close(); }

  sendRaw(text: string): void { this.socket.send(text); }

  async command<T extends Command["type"]>(type: T, fields: Omit<Extract<Command, { type: T }>, "type" | "id">):
    Promise<{ ok: true; result: CommandResults[T] } | { ok: false; error: { code: string; message: string } }> {
    const id = `c${(this.nextId += 1)}`;
    this.socket.send(JSON.stringify({ type, id, ...fields }));
    const reply = await this.waitFor((m) => m.type === "reply" && m.id === id, 120_000);
    if (reply.type !== "reply") throw new Error("unreachable");
    return reply.ok ? { ok: true, result: reply.result as CommandResults[T] } : { ok: false, error: reply.error };
  }

  async expectOk<T extends Command["type"]>(type: T, fields: Omit<Extract<Command, { type: T }>, "type" | "id">): Promise<CommandResults[T]> {
    const reply = await this.command(type, fields);
    if (!reply.ok) throw new Error(`${type} failed: ${reply.error.code} ${reply.error.message}`);
    return reply.result;
  }

  async expectError<T extends Command["type"]>(type: T, fields: Omit<Extract<Command, { type: T }>, "type" | "id">, code: string, pattern?: RegExp): Promise<string> {
    const reply = await this.command(type, fields);
    assert.ok(!reply.ok, `${type} must be refused`);
    if (reply.ok) throw new Error("unreachable");
    assert.equal(reply.error.code, code, `${type}: ${reply.error.message}`);
    if (pattern) assert.match(reply.error.message, pattern);
    return reply.error.message;
  }

  mark(): number { return this.messages.length; }

  async waitFor(check: (message: ServerMessage) => boolean, timeoutMs = 30_000, from = 0): Promise<ServerMessage> {
    const start = Date.now();
    for (;;) {
      const found = this.messages.slice(from).find(check);
      if (found) return found;
      if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting; got ${JSON.stringify(this.messages.map((m) => m.type))}`);
      await sleep(15);
    }
  }

  /** The next environment.state of a repository after a mark that holds. */
  async environment(repository: string, from: number, check: (state: EnvironmentState) => boolean, timeoutMs = 60_000): Promise<EnvironmentState> {
    const message = await this.waitFor((m) => m.type === "environment.state" && m.repository === repository && check(m.state), timeoutMs, from);
    if (message.type !== "environment.state") throw new Error("unreachable");
    return message.state;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function until(check: () => boolean, timeoutMs = 60_000, what = "condition"): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${what}`);
    await sleep(15);
  }
}

function gitFolder(path: string): string {
  mkdirSync(path, { recursive: true });
  execFileSync("git", ["init", "-q", path]);
  return path;
}

function clonePath(dataDir: string, key: string): string {
  return join(dataDir, "workspace", ...key.split("/"));
}

/** A user home where claude has been used: exports reach it (environments-8). */
function userHome(path: string): string {
  mkdirSync(join(path, ".claude"), { recursive: true });
  return path;
}

/** The toolchain probe wants a system Node; every other spawn — the stub slc — is real. */
function probeSpawner(): LineSpawner {
  return (command, args, cwd, onLine, signal, env) => {
    if (args.length === 1 && args[0] === "--version" && command !== process.execPath) {
      onLine("v24.1.0");
      return Promise.resolve(0);
    }
    return defaultSpawner(command, args, cwd, onLine, signal, env);
  };
}

/** A signed-in home before its core starts: the account in home.yaml,
 * the app token in local/credentials.yaml (git-host-4). */
function signedInHome(dataDir: string, hostUrl: string, token: string): void {
  mkdirSync(join(dataDir, "local"), { recursive: true, mode: 0o700 });
  writeFileSync(join(dataDir, "home.yaml"), stringifyYaml({
    format: 1, device: randomUUID(), own: OWN, folders: [],
    host: { url: hostUrl, clientId: "spex", account: { id: "1", login: OWN, displayName: "Tester" } },
  }));
  writeFileSync(join(dataDir, "local", "credentials.yaml"), stringifyYaml({
    format: 1, hosts: { [hostUrl]: { access: token, accessExpiresAt: Date.now() + 3_600_000, refresh: "refresh" } },
  }), { mode: 0o600 });
}

interface Core {
  service: CoreService;
  client: Client;
  dataDir: string;
  configPath: string;
  stop(): Promise<void>;
}

async function startCore(dir: string, options: {
  hostUrl: string;
  script?: FakeScript;
  realShell?: boolean;
  slc?: string;
  extra?: Partial<CoreServiceOptions>;
  config?: string;
}): Promise<Core> {
  const dataDir = join(dir, "state");
  const configPath = join(dir, "playbook.config.yaml");
  if (!existsSync(configPath)) writeFileSync(configPath, options.config ?? CONFIG);
  const { imports } = fakeAdapterImports(options.script ?? {
    rules: [{ match: "Select exactly one action from the closed set", response: { result: JSON.stringify({ action: "respond", text: "Answered." }) } }],
    fallback: { result: "done" },
  });
  const env: NodeJS.ProcessEnv = { SPEX_HOST_URL: options.hostUrl };
  if (options.slc) {
    const stub = join(dir, "stub-slc.cjs");
    writeFileSync(stub, options.slc);
    env.SPEX_SLC = `${process.execPath} ${stub}`;
  }
  const captain = createScriptedCaptain(async (_turn, _context, session) => { await session.emitStatus("◇ scripted"); });
  const service = await CoreService.start({
    token: "test", configPath, dataDir, adapterImports: imports, adapterRuntime: () => ({ usable: true }),
    env, home: userHome(join(dir, "user")), own: OWN, watchConfig: false, compileSpawner: probeSpawner(),
    ...(options.realShell ? {} : { captainFactory: async () => captain }),
    ...options.extra,
  });
  const client = new Client(service.port());
  await client.open();
  return { service, client, dataDir, configPath, stop: async () => { client.close(); await service.stop(); } };
}

/** A copy of the shipped built-in release at a newer version. */
function newerBuiltin(): BuiltinPackage {
  const shipped = builtinPackage();
  const [major, minor] = shipped.version.split(".").map(Number);
  const version = `${major}.${minor! + 1}.0`;
  const dir = join(scratchDir("spex-newer-builtin-"), version);
  cpSync(shipped.dir, dir, { recursive: true });
  writeFileSync(join(dir, "meta.yaml"), readFileSync(join(dir, "meta.yaml"), "utf8").replace(`version: ${shipped.version}`, `version: ${version}`));
  return { name: "sublang/playbooks", version, dir };
}

// ---------------------------------------------------------------------------
// environments-23: the built-in spec package through a real core
// ---------------------------------------------------------------------------

test("environments-23: a fresh home with no registry reachable seeds the built-in spec package, launches every built-in from it, and seeds a newer release beside the older", { timeout: 180_000 }, async (t) => {
  const dir = scratchDir("spex-env-builtin-");
  const shipped = builtinPackage();
  // The starter enables every built-in playbook (core-service-3).
  let core = await startCore(dir, { hostUrl: UNREACHABLE, realShell: true, config: starterText(readFileSync(templatePath(), "utf8")) });
  t.after(() => core.stop());
  const own = `${OWN}/${OWN}-spex`;
  const ownClone = clonePath(core.dataDir, own);
  // Seeded into the store, its release index recorded.
  assert.ok(existsSync(join(core.dataDir, "cache", "builtins", `${shipped.version}.json`)));
  assert.ok(readdirSync(join(core.dataDir, "store")).some((name) => /^[0-9a-f]{64}$/.test(name)));
  // Requested in your own group's environment, at a caret, and locked.
  assert.deepEqual(parseYaml(readFileSync(join(ownClone, "spex.yaml"), "utf8")), { format: 1, packages: { "sublang/playbooks": { version: `^${shipped.version}` } } });
  const ownState = await core.client.expectOk("environment.get", { repository: own });
  assert.deepEqual(ownState.packages.map((pkg) => [pkg.name, pkg.version, pkg.source.kind, pkg.installed]), [["sublang/playbooks", shipped.version, "builtin", true]]);
  assert.equal(ownState.stale, null);

  // A new project's environment requests it from the clone's first commit.
  const project = await core.client.expectOk("project.register", { path: gitFolder(join(dir, "project")) });
  const projectClone = clonePath(core.dataDir, project.id);
  const firstCommit = execFileSync("git", ["-C", projectClone, "show", "--name-only", "--format=", "HEAD"], { encoding: "utf8" });
  assert.match(firstCommit, /^spex\.yaml$/m);
  assert.match(firstCommit, /^spex\.lock$/m);
  const config = await core.client.expectOk("config.get", {});
  assert.equal(config.status, "valid", JSON.stringify(config));

  // Every built-in playbook launches from the project's installed package.
  const session = await core.client.expectOk("session.create", { projectId: project.id });
  await core.client.expectOk("turn.submit", { sessionId: session.id, text: "Hello" });
  await core.client.waitFor((m) => m.type === "session.state" && m.session.id === session.id && m.session.turns === 1 && m.session.turnActive === false, 60_000);
  const manifest = JSON.parse(readFileSync(join(projectClone, "sessions", `${session.id}.json`), "utf8")) as { structuralProjection: { catalog: Record<string, { from: string }> } };
  const ids = ["branch", "code", "decide", "dev", "inspect", "pr", "review"];
  assert.deepEqual(Object.keys(manifest.structuralProjection.catalog).sort(), ids);
  for (const id of ids) {
    assert.ok(manifest.structuralProjection.catalog[id]!.from.startsWith(pathToFileURL(join(projectClone, "packages", "sublang", "playbooks", "playbooks", "en", id)).href), id);
  }
  // The built-ins' skills are exported where claude reads them.
  assert.ok(existsSync(join(dir, "project", ".claude", "skills", "code", "SKILL.md")));
  assert.ok(existsSync(join(dir, "user", ".claude", "skills", "review", "SKILL.md")));

  // A newer built-in release seeds beside the older; neither lock moves.
  const locks = [ownClone, projectClone].map((clone) => readFileSync(join(clone, "spex.lock"), "utf8"));
  await core.stop();
  const newer = newerBuiltin();
  core = await startCore(dir, { hostUrl: UNREACHABLE, realShell: true, extra: { builtinPackage: newer } });
  assert.ok(existsSync(join(core.dataDir, "cache", "builtins", `${shipped.version}.json`)), "the older stays seeded");
  assert.ok(existsSync(join(core.dataDir, "cache", "builtins", `${newer.version}.json`)), "the newer is seeded beside it");
  assert.deepEqual([ownClone, projectClone].map((clone) => readFileSync(join(clone, "spex.lock"), "utf8")), locks, "an app update changes no lock");
  const still = await core.client.expectOk("environment.get", { repository: project.id });
  assert.deepEqual(still.packages.map((pkg) => [pkg.version, pkg.installed]), [[shipped.version, true]]);
  // A new environment takes the newer release.
  const later = await core.client.expectOk("project.register", { path: gitFolder(join(dir, "later")) });
  const laterLock = parseYaml(readFileSync(join(clonePath(core.dataDir, later.id), "spex.lock"), "utf8")) as { packages: Record<string, { source: { version: string } }> };
  assert.equal(laterLock.packages["sublang/playbooks"]!.source.version, newer.version);
});

// ---------------------------------------------------------------------------
// environments-24: author, enable, launch, publish, install elsewhere
// ---------------------------------------------------------------------------

test("environments-24: a playbook authored in a project compiles, is requested by path, enables, launches, publishes, and installs on a second home", { timeout: 240_000 }, async (t) => {
  const registry = await startStandinRegistry({ dir: scratchDir("spex-env-registry-") });
  t.after(() => registry.close());
  const dir = scratchDir("spex-env-author-");
  signedInHome(join(dir, "state"), registry.url, "tester-token");
  // The compiled entry's role ids are canonical local ids, as a session's
  // catalog requires of them.
  const core = await startCore(dir, { hostUrl: registry.url, script: authoringScript(), slc: stubSlcSource("['triager', 'verifier']") });
  t.after(() => core.stop());
  const working = gitFolder(join(dir, "project"));
  const project = await core.client.expectOk("project.register", { path: working });
  const clone = clonePath(core.dataDir, project.id);

  // An authoring session writes its spec package in the working folder.
  const created = await core.client.expectOk("draft.create", { projectId: project.id, draftId: "triage" });
  assert.equal(created.package, `${OWN}/triage`, "the account's login is the org (playbook-library-70)");
  const folder = join(working, "spex-packages", "triage");
  const instance = created.instance!;
  await core.client.expectOk("draft.send", { projectId: project.id, draftId: "triage", instance, text: "I want a playbook that triages new issues." });
  const latest = () => core.client.messages.filter((m) => m.type === "draft.state" && m.draft.id === "triage").map((m) => (m as { draft: CommandResults["draft.create"] }).draft).at(-1);
  await until(() => latest()?.activity === "idle" && latest()?.proposal !== undefined, 120_000, "the compiled proposal");
  assert.equal(latest()?.state, "compiled");
  assert.ok(existsSync(join(folder, "playbooks", "en", "triage", "triage.registry.mjs")), "compiled in the playbook artifact");
  // The engine links stay out of the working folder's Git.
  assert.match(readFileSync(join(working, ".git", "info", "exclude"), "utf8"), /\/spex-packages\/\*\*\/node_modules\//);

  // Enabling requests it by path, installs and writes the project's entry.
  await core.client.expectOk("draft.register", {
    projectId: project.id, draftId: "triage", instance, command: "triage", intent: "Label new issues",
    bindings: { Triager: "dev.coder", Verifier: "dev.coder" },
  });
  assert.equal((parseYaml(readFileSync(join(clone, "spex.yaml"), "utf8")) as { packages: Record<string, unknown> }).packages[`${OWN}/triage`] !== undefined, true);
  await until(() => latest()?.state === "enabled", 10_000, "the enabled chip");
  // A session of the project launches it from the working folder.
  const session = await core.client.expectOk("session.create", { projectId: project.id });
  const manifestFile = join(clone, "sessions", `${session.id}.json`);
  await until(() => existsSync(manifestFile), 10_000, "the session's manifest");
  const catalog = (JSON.parse(readFileSync(manifestFile, "utf8")) as { structuralProjection: { catalog: Record<string, { from: string }> } }).structuralProjection.catalog;
  assert.equal(catalog.triage?.from, pathToFileURL(join(folder, "playbooks", "en", "triage", "triage.registry.mjs")).href);

  // Publishing: the dry run names what would go, then the upload.
  const preview = await core.client.expectOk("environment.publish", { repository: project.id, path: "spex-packages/triage", dryRun: true });
  const declared = (await readRelease(folder)).files;
  assert.deepEqual(preview.preview, { name: `${OWN}/triage`, version: "0.1.0", files: declared.map((file) => file.path).sort() });
  assert.ok(!preview.preview?.files.some((path) => path.includes("node_modules")), "engine links never upload");
  const from = core.client.mark();
  assert.deepEqual(await core.client.expectOk("environment.publish", { repository: project.id, path: "spex-packages/triage" }), { accepted: true });
  const published = await core.client.environment(project.id, from, (state) => state.busy === null && (state.published !== null && state.published !== undefined || state.error !== null));
  assert.equal(published.error, null);
  assert.deepEqual(published.published, { name: `${OWN}/triage`, version: "0.1.0", url: `${registry.url}/${OWN}/triage` });
  // The release at the registry is exactly the folder's declared files.
  const resource = await (await fetch(`${registry.url}/api/v1/packages/${OWN}/triage/0.1.0`)).json() as { files: { path: string; sha256: string }[] };
  assert.deepEqual(resource.files.map((file) => [file.path, file.sha256]), declared.map((file) => [file.path, file.sha256]));

  // A second home requests the published version from the registry.
  const second = scratchDir("spex-env-second-");
  const other = await startCore(second, { hostUrl: registry.url });
  t.after(() => other.stop());
  const otherProject = await other.client.expectOk("project.register", { path: gitFolder(join(second, "project")) });
  const mark = other.client.mark();
  await other.client.expectOk("environment.request", { repository: otherProject.id, name: `${OWN}/triage`, request: { kind: "registry", version: "^0.1.0" } });
  const installed = await other.client.environment(otherProject.id, mark, (state) => state.busy === null && state.packages.some((pkg) => pkg.name === `${OWN}/triage` && pkg.installed));
  const pkg = installed.packages.find((entry) => entry.name === `${OWN}/triage`)!;
  assert.deepEqual([pkg.version, pkg.source.kind, pkg.direct], ["0.1.0", "registry", true]);
  const playbooks = await other.client.expectOk("environment.playbooks", { projectId: otherProject.id });
  const row = playbooks.project?.find((entry) => entry.id === "triage");
  assert.deepEqual([row?.source, row?.version, row?.enabled, row?.present], ["registry", "0.1.0", [], true]);
});

// ---------------------------------------------------------------------------
// environments-25: the commands over the protocol
// ---------------------------------------------------------------------------

test("environments-25: every environment command replies and refuses as its table says and broadcasts its state", { timeout: 180_000 }, async (t) => {
  const registry = await startStandinRegistry({ dir: scratchDir("spex-env-commands-registry-") });
  t.after(() => registry.close());
  const skill = (name: string): string => `---\nname: ${name}\ndescription: The ${name} skill.\n---\n\nDo ${name}.\n`;
  await makeRelease(join(scratchDir("spex-env-commands-release-"), "lint"), {
    format: 2, org: "acme", name: "lint", version: "1.2.0", description: "Lint skills", license: "Apache-2.0",
    artifacts: { tidy: { kind: "skill", language: "en" } },
  }, { "skills/en/tidy/SKILL.md": skill("tidy") }).then(async (releaseDir) => {
    const { publishRelease, RegistryClient } = await import("./environment/index.js");
    await publishRelease(new RegistryClient({ url: registry.url }), releaseDir);
  });

  const dir = scratchDir("spex-env-commands-");
  const core = await startCore(dir, { hostUrl: registry.url });
  t.after(() => core.stop());
  const { client } = core;
  const working = gitFolder(join(dir, "project"));
  const project = await client.expectOk("project.register", { path: working });
  const key = project.id;

  // environment.get carries every field the surface lists (environments-14).
  await client.expectError("environment.get", { repository: "nobody/none-spex" }, "not_found");
  const initial = await client.expectOk("environment.get", { repository: key });
  assert.deepEqual(Object.keys(initial).sort(), ["busy", "conflicts", "error", "language", "packages", "published", "repository", "requests", "stale"]);
  assert.deepEqual(Object.keys(initial.packages[0]!).sort(), ["artifacts", "direct", "exports", "installed", "missingPath", "name", "requiredBy", "source", "version"]);
  assert.deepEqual(initial.requests["sublang/playbooks"], { kind: "registry", version: `^${builtinPackage().version}` });

  // environment.search through the registry.
  const found = await client.expectOk("environment.search", { query: "lint" });
  assert.deepEqual(found.packages.find((entry) => entry.name === "acme/lint"), { name: "acme/lint", description: "Lint skills", versions: ["1.2.0"] });

  // environment.request: refused before any write, else accepted and broadcast.
  const requests = readFileSync(join(clonePath(core.dataDir, key), "spex.yaml"), "utf8");
  await client.expectError("environment.request", { repository: key, name: "acme/lint", request: { kind: "path", path: "../outside" } }, "invalid_request");
  await client.expectError("environment.request", { repository: key, name: "acme/lint", request: { kind: "registry", version: "1.x" } }, "invalid_request");
  const badName = await client.command("environment.request", { repository: key, name: "Not A Name", request: { kind: "registry", version: "^1.0.0" } });
  assert.ok(!badName.ok, "a name that is not <org>/<pkg> is refused");
  assert.equal(readFileSync(join(clonePath(core.dataDir, key), "spex.yaml"), "utf8"), requests, "a refusal writes nothing");
  let mark = client.mark();
  assert.deepEqual(await client.expectOk("environment.request", { repository: key, name: "acme/lint", request: { kind: "registry", version: "^1.0.0" } }), { accepted: true });
  const requested = await client.environment(key, mark, (state) => state.busy === null && state.packages.some((pkg) => pkg.name === "acme/lint" && pkg.installed));
  assert.deepEqual(requested.packages.find((pkg) => pkg.name === "acme/lint")?.exports, [{ name: "tidy", artifact: "tidy" }]);
  assert.ok(existsSync(join(working, ".claude", "skills", "tidy", "SKILL.md")), "the skill is exported where claude reads it");

  // A changed spex.yaml reads stale with the surface's phrase; resolve
  // and install reply at once and broadcast.
  writeFileSync(join(clonePath(core.dataDir, key), "spex.yaml"), `${requests.trimEnd()}\n  acme/lint:\n    version: "~1.2.0"\n`);
  const stale = await client.expectOk("environment.get", { repository: key });
  assert.deepEqual(stale.stale, ["Requests changed; resolve again to install"]);
  mark = client.mark();
  assert.deepEqual(await client.expectOk("environment.resolve", { repository: key }), { accepted: true });
  await client.environment(key, mark, (state) => state.busy === null && state.stale === null);
  mark = client.mark();
  assert.deepEqual(await client.expectOk("environment.install", { repository: key }), { accepted: true });
  await client.environment(key, mark, (state) => state.busy === null);

  // A conflict stands in the state, by name.
  mark = client.mark();
  await client.expectOk("environment.request", { repository: key, name: "acme/lint", request: { kind: "registry", version: "^2.0.0" } });
  const conflicted = await client.environment(key, mark, (state) => state.busy === null && state.conflicts !== null);
  assert.equal(conflicted.conflicts?.[0]?.name, "acme/lint");
  // The report stands only while spex.yaml holds the bytes it read.
  const conflictedRequests = join(clonePath(core.dataDir, key), "spex.yaml");
  writeFileSync(conflictedRequests, `${readFileSync(conflictedRequests, "utf8")}# edited\n`);
  assert.equal((await client.expectOk("environment.get", { repository: key })).conflicts, null, "a report of former requests is not shown");

  // environment.remove.
  await client.expectError("environment.remove", { repository: key, name: "acme/never" }, "invalid_request");
  mark = client.mark();
  assert.deepEqual(await client.expectOk("environment.remove", { repository: key, name: "acme/lint" }), { accepted: true });
  const removed = await client.environment(key, mark, (state) => state.busy === null && !state.packages.some((pkg) => pkg.name === "acme/lint"));
  assert.equal(removed.conflicts, null);
  assert.ok(!existsSync(join(working, ".claude", "skills", "tidy")), "a skill the lock no longer selects leaves the folder");

  // environment.publish: signed out, and not a release.
  await client.expectError("environment.publish", { repository: key, path: "spex-packages/none" }, "invalid_request", /Sign in to publish/);
  await client.expectError("environment.publish", { repository: key, path: "spex-packages/none", dryRun: true }, "invalid_request", /not a spec package release/);

  // The playbooks both environments export, with where each is enabled.
  const listed = await client.expectOk("environment.playbooks", { projectId: key });
  const code = listed.project?.find((row) => row.id === "code");
  assert.deepEqual([code?.source, code?.enabled, code?.present], ["builtin", ["own"], true]);
  assert.equal(code?.bindings?.own?.coder?.playerId, "dev.coder");
  assert.ok(code?.folder?.endsWith(join("packages", "sublang", "playbooks", "playbooks", "en", "code")));
  assert.ok(listed.own.some((row) => row.id === "review"));

  // The spex repository syncs to a host.
  const bare = join(dir, "host.git");
  execFileSync("git", ["init", "-q", "--bare", "-b", "spex", bare]);
  await client.expectOk("space.remote.set", { repository: key, url: bare });
  const from = client.mark();
  await client.expectOk("space.sync", { repository: key });
  await client.waitFor((m) => m.type === "space.state" && m.state.groups.some((group) => group.repositories.some((repository) => repository.key === key && repository.sync.phase === "done")), 30_000, from);

  // Another member changes the environment on the host: the lock a sync
  // applies installs and exports, its state broadcast (environments-17).
  const peer = join(dir, "peer");
  execFileSync("git", ["clone", "-q", "-b", "spex", bare, peer]);
  const peerRequests = `${readFileSync(join(peer, "spex.yaml"), "utf8").trimEnd()}\n  acme/lint:\n    version: ^1.0.0\n`;
  writeFileSync(join(peer, "spex.yaml"), peerRequests);
  const { builtinRegistrySource, compositeRegistry, ContentStore, gitSource, parseRequests, RegistryClient, resolve, writeLock } = await import("./environment/index.js");
  const peerHome = scratchDir("spex-env-peer-home-");
  const peerStore = new ContentStore(peerHome);
  const resolved = await resolve({
    requests: parseRequests(peerRequests), requestsText: peerRequests, workingFolder: null, git: gitSource(join(peerHome, "cache")),
    registry: compositeRegistry(builtinRegistrySource({ store: peerStore, cacheDir: join(peerHome, "cache"), url: registry.url, shipped: builtinPackage() }), new RegistryClient({ url: registry.url })),
  });
  assert.ok(resolved.ok);
  if (resolved.ok) await writeLock(join(peer, "spex.lock"), resolved.lock);
  execFileSync("git", ["-C", peer, "add", "-A"]);
  execFileSync("git", ["-C", peer, "-c", "user.name=Peer", "-c", "user.email=peer@example.invalid", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "Add lint"]);
  execFileSync("git", ["-C", peer, "push", "-q", "origin", "spex"]);
  const synced = client.mark();
  await client.expectOk("space.sync", { repository: key });
  const applied = await client.environment(key, synced, (state) => state.busy === null && state.packages.some((pkg) => pkg.name === "acme/lint" && pkg.installed), 60_000);
  assert.equal(applied.stale, null);
  assert.ok(existsSync(join(working, ".claude", "skills", "tidy", "SKILL.md")), "the applied lock's skill is exported");
});

// ---------------------------------------------------------------------------
// environments-21 through a real core signed in at the stand-in host
// ---------------------------------------------------------------------------

interface FrontEntry { to: "host" | "registry"; method: string; path: string; bearer: string | null }

/** One origin in front of the stand-in host and the stand-in registry,
 * as spex.pub serves both under one URL: the host's routes go to the
 * one and the registry's to the other, each request logged with the
 * bearer it carried. The Git transport stays at the host's own origin. */
async function startFront(hostUrl: string, registryUrl: string): Promise<{ url: string; log: FrontEntry[]; close(): Promise<void> }> {
  const log: FrontEntry[] = [];
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://front").pathname;
    const toRegistry = path.startsWith("/api/v1/packages") || path === "/api/v1/search"
      || !(path.startsWith("/api/") || path.startsWith("/login") || path.startsWith("/git"));
    const target = new URL(req.url ?? "/", toRegistry ? registryUrl : hostUrl);
    const header = req.headers.authorization;
    log.push({ to: toRegistry ? "registry" : "host", method: req.method ?? "GET", path, bearer: typeof header === "string" ? header.replace(/^Bearer\s+/i, "") : null });
    const forward = httpRequest(target, { method: req.method, headers: { ...req.headers, host: target.host } }, (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(res);
    });
    forward.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(forward);
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    log,
    close: () => new Promise<void>((resolveClose) => { server.closeAllConnections(); server.close(() => resolveClose()); }),
  };
}

function skillRelease(org: string, name: string): { manifest: Record<string, unknown>; files: Record<string, string> } {
  return {
    manifest: { format: 2, org, name, version: "1.0.0", description: `The ${org}/${name} spec package`, license: "Apache-2.0", artifacts: { [`${name}-skill`]: { kind: "skill", language: "en" } } },
    files: { [`skills/en/${name}-skill/SKILL.md`]: `---\nname: ${name}-skill\ndescription: The ${name} skill\n---\n\nUse ${name}.\n` },
  };
}

test("environments-21 through a real core: the registry presents the access secret the host client refreshed, a Git source at the host's origin installs with the brokered credential and one elsewhere with this device's Git, and a signed-out home presents none", { timeout: 240_000 }, async (t) => {
  const harness = createSpaceHarness();
  t.after(() => harness.dispose());
  const host = await harness.startHost();
  const registry = await startStandinRegistry({ dir: scratchDir("spex-env-front-registry-") });
  t.after(() => registry.close());
  const front = await startFront(host.url, registry.url);
  t.after(() => front.close());
  const tools = skillRelease("acme", "tools");
  await publishRelease(new RegistryClient({ url: registry.url }), await makeRelease(join(harness.scratch, "tools"), tools.manifest, tools.files));

  const home = await harness.startHome("front", { project: false, env: { SPEX_HOST_URL: front.url } });
  t.after(() => home.stop());
  const own = `${host.script.person.login}/${host.script.person.login}-spex`;
  const signing = home.client.mark();
  await harness.signIn(home, host);
  // Your own group's spex repository is created on the host and pushed
  // before its environment takes a write (environments-17).
  await home.client.waitRepository(signing, own, (repository) => repository.sync.phase === "done", 60_000);
  const states = (from: number): EnvironmentState[] =>
    home.client.messages.slice(from).flatMap((m) => (m.type === "environment.state" && m.repository === own ? [m.state] : []));
  /** One operation run through after a mark: its first busy state, then
   * the first idle one after that. */
  const ran = async (from: number): Promise<EnvironmentState> => {
    const start = Date.now();
    for (;;) {
      const seenStates = states(from);
      const busy = seenStates.findIndex((state) => state.busy !== null);
      const done = busy < 0 ? undefined : seenStates.slice(busy + 1).find((state) => state.busy === null);
      if (done) return done;
      if (Date.now() - start > 90_000) throw new Error(`timeout waiting for an operation on ${own}`);
      await sleep(15);
    }
  };
  const installed = (state: EnvironmentState, name: string): boolean => state.packages.some((pkg) => pkg.name === name && pkg.installed);

  // The access secret nears its expiry: the registry's next call
  // presents the one the host client refreshed first (environments-12,
  // git-host-4), never the file's stale one.
  const credentials = join(home.dataDir, "local", "credentials.yaml");
  type Stored = { access: string; accessExpiresAt: number; refresh: string };
  const stored = (): Stored => (parseYaml(readFileSync(credentials, "utf8")) as { hosts: Record<string, Stored> }).hosts[front.url]!;
  const stale = stored();
  writeFileSync(credentials, stringifyYaml({ format: 1, hosts: { [front.url]: { ...stale, accessExpiresAt: Date.now() + 5_000 } } }), { mode: 0o600 });
  const grants = host.script.tokenGrants.length;
  front.log.length = 0;
  let from = home.client.mark();
  await home.client.expectOk("environment.request", { repository: own, name: "acme/tools", request: { kind: "registry", version: "^1.0.0" } });
  let state = await ran(from);
  assert.equal(state.error, null);
  assert.ok(installed(state, "acme/tools"));
  const fresh = stored();
  assert.notEqual(fresh.access, stale.access, "the access secret was refreshed before the registry call");
  assert.ok(host.script.tokenGrants.slice(grants).some((grant) => grant.grantType === "refresh_token" && grant.ok), JSON.stringify(host.script.tokenGrants));
  const registryCalls = front.log.filter((entry) => entry.to === "registry");
  assert.ok(registryCalls.some((entry) => entry.path === "/api/v1/packages/acme/tools"), JSON.stringify(registryCalls));
  assert.ok(registryCalls.every((entry) => entry.bearer === fresh.access), "every registry call carried the refreshed secret");
  assert.ok(registry.script.requests.includes("GET /api/v1/packages/acme/tools"));

  // A Git source anywhere but the host's Git origin: this device's own
  // Git, the host not asked (environments-13).
  const bare = join(harness.scratch, "local-tools.git");
  harness.git(harness.scratch, "init", "-q", "--bare", "-b", "main", bare);
  const localWork = join(harness.scratch, "local-work");
  harness.git(harness.scratch, "init", "-q", "-b", "main", localWork);
  const local = skillRelease("acme", "local");
  await makeRelease(localWork, local.manifest, local.files);
  harness.git(localWork, "add", "-A");
  harness.git(localWork, "commit", "-q", "-m", "Release");
  harness.git(localWork, "push", "-q", bare, "main");
  let seen = host.script.requests.length;
  from = home.client.mark();
  await home.client.expectOk("environment.request", { repository: own, name: "acme/local", request: { kind: "git", git: bare, rev: "main" } });
  state = await ran(from);
  assert.equal(state.error, null);
  assert.ok(installed(state, "acme/local"));
  assert.ok(!host.script.requests.slice(seen).some((request) => request.path === "/api/v1/host/credential"), "no credential for another origin");

  // A Git source at the host's Git origin: the host is asked for the
  // credential, and the transport carries it (environments-13, git-host-9).
  const toolbox = host.script.addRepository({ group: "acme", name: "toolbox" });
  const work = join(harness.scratch, "toolbox-work");
  harness.git(harness.scratch, "clone", "-q", toolbox.bare, work);
  const boxed = skillRelease("acme", "toolbox");
  await makeRelease(join(work, "pkg"), boxed.manifest, boxed.files);
  harness.git(work, "add", "-A");
  harness.git(work, "commit", "-q", "-m", "Release");
  harness.git(work, "push", "-q", "origin", "HEAD:main");
  const commit = harness.git(work, "rev-parse", "HEAD");
  const repo = `${host.gitOrigin}/acme/toolbox.git`;
  seen = host.script.requests.length;
  from = home.client.mark();
  await home.client.expectOk("environment.request", { repository: own, name: "acme/toolbox", request: { kind: "git", git: repo, rev: "main", path: "pkg" } });
  state = await ran(from);
  assert.equal(state.error, null);
  assert.ok(installed(state, "acme/toolbox"));
  const lock = parseYaml(readFileSync(join(clonePath(home.dataDir, own), "spex.lock"), "utf8")) as { packages: Record<string, { source: unknown }> };
  assert.deepEqual(lock.packages["acme/toolbox"]!.source, { git: repo, commit, path: "pkg" });
  const asked = host.script.requests.slice(seen);
  assert.ok(asked.some((request) => request.method === "POST" && request.path === "/api/v1/host/credential"), "the host was asked for the credential");
  assert.ok(asked.some((request) => request.path.startsWith("/git/acme/toolbox.git/") && request.authorization), "the transport carried it");

  // Signed out, the registry is called with no bearer at all.
  from = home.client.mark();
  await home.client.expectOk("environment.remove", { repository: own, name: "acme/toolbox" });
  assert.equal((await ran(from)).error, null);
  await home.client.expectOk("space.signout", {});
  front.log.length = 0;
  from = home.client.mark();
  await home.client.expectOk("environment.resolve", { repository: own });
  state = await ran(from);
  assert.equal(state.error, null);
  assert.ok(installed(state, "acme/tools"));
  const signedOut = front.log.filter((entry) => entry.to === "registry");
  assert.ok(signedOut.length > 0 && signedOut.every((entry) => entry.bearer === null), JSON.stringify(signedOut));
});

// ---------------------------------------------------------------------------
// DR-111: operations side by side, each write versioned on its file
// ---------------------------------------------------------------------------

/** A registry fetch that holds the first call a matcher picks while
 * armed, until the test lets it go. */
function heldFetch(): { fetch: typeof fetch; arm(match: (path: string) => boolean): void; reached(): boolean; release(): void } {
  let matcher: ((path: string) => boolean) | undefined;
  let gate: Promise<void> | undefined;
  let open: (() => void) | undefined;
  let hit = false;
  return {
    fetch: async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (matcher?.(url.pathname) && gate) {
        const wait = gate;
        matcher = undefined;
        hit = true;
        await wait;
      }
      return fetch(input, init);
    },
    arm(match) { matcher = match; hit = false; gate = new Promise((resolve) => { open = resolve; }); },
    reached: () => hit,
    release() { open?.(); gate = undefined; },
  };
}

/** Wait until a project's environment stands idle with its built-in
 * spec package installed: the clone's first settle done. */
async function settledProject(client: Client, key: string): Promise<void> {
  const start = Date.now();
  for (;;) {
    const state = await client.expectOk("environment.get", { repository: key });
    if (state.busy === null && state.packages.some((pkg) => pkg.name === "sublang/playbooks" && pkg.installed)) return;
    if (Date.now() - start > 60_000) throw new Error(`timeout waiting for ${key} to settle`);
    await sleep(25);
  }
}

/** The core's environment manager, for the assertions no command reaches. */
const managerOf = (core: Core): EnvironmentManager => (core.service as unknown as { environments: EnvironmentManager }).environments;

const refusedWith = (code: string) => (error: unknown): boolean => error instanceof CoreError && error.code === code;

test("environments-25: a request is admitted while another's resolution is held, an overtaken resolution writes no lock and says so, a clone's files decide its next settle, and a stopped core starts no work", { timeout: 180_000 }, async (t) => {
  const registry = await startStandinRegistry({ dir: scratchDir("spex-env-side-registry-") });
  t.after(() => registry.close());
  for (const name of ["slow", "lint"]) {
    const release = skillRelease("acme", name);
    await publishRelease(new RegistryClient({ url: registry.url }), await makeRelease(join(scratchDir("spex-env-side-release-"), name), release.manifest, release.files));
  }
  const held = heldFetch();
  const dir = scratchDir("spex-env-side-");
  const core = await startCore(dir, { hostUrl: registry.url, extra: { registryFetch: held.fetch } });
  let stopped = false;
  t.after(() => (stopped ? undefined : core.stop()));
  const { client } = core;
  try {
    const project = await client.expectOk("project.register", { path: gitFolder(join(dir, "project")) });
    const key = project.id;
    const clone = clonePath(core.dataDir, key);
    const lockPath = join(clone, "spex.lock");
    await settledProject(client, key);

    // The first request's resolution waits at the registry.
    held.arm((path) => path === "/api/v1/packages/acme/slow");
    await client.expectOk("environment.request", { repository: key, name: "acme/slow", request: { kind: "registry", version: "^1.0.0" } });
    await until(held.reached, 30_000, "the held resolution");
    // A second request is admitted at once and written beside the first.
    let mark = client.mark();
    assert.deepEqual(await client.expectOk("environment.request", { repository: key, name: "acme/lint", request: { kind: "registry", version: "^1.0.0" } }), { accepted: true });
    const requested = parseYaml(readFileSync(join(clone, "spex.yaml"), "utf8")) as { packages: Record<string, unknown> };
    assert.ok(requested.packages["acme/slow"] && requested.packages["acme/lint"], "both requests stand in spex.yaml");
    // The second resolves both and installs, while the first still runs:
    // its end claims nothing for the other (environments-14).
    const both = await client.environment(key, mark, (state) => ["acme/slow", "acme/lint"].every((name) => state.packages.some((pkg) => pkg.name === name && pkg.installed)));
    assert.equal(both.busy, "resolving", "the held resolution still reads as running");
    assert.equal(both.error, null);
    const lock = readFileSync(lockPath, "utf8");

    // Let the first go: overtaken by the second's write, it writes no
    // lock, and its outcome says what changed.
    mark = client.mark();
    held.release();
    const idle = await client.environment(key, mark, (state) => state.busy === null);
    assert.equal(readFileSync(lockPath, "utf8"), lock, "the overtaken resolution wrote nothing");
    assert.match(idle.error ?? "", /^Resolving stopped: .*spex\.yaml changed meanwhile; retry$/);
    assert.equal(idle.stale, null);
    assert.ok(["acme/slow", "acme/lint"].every((name) => idle.packages.some((pkg) => pkg.name === name && pkg.installed)));

    // spex.lock rewritten by hand during a held resolution, spex.yaml as
    // it was: the lock's own check refuses the write, reported (environments-5).
    held.arm((path) => path === "/api/v1/packages/acme/slow");
    await client.expectOk("environment.resolve", { repository: key });
    await until(held.reached, 30_000, "the held resolution");
    const edited = `${lock}# edited by hand\n`;
    writeFileSync(lockPath, edited);
    mark = client.mark();
    held.release();
    const refused = await client.environment(key, mark, (state) => state.busy === null);
    assert.equal(readFileSync(lockPath, "utf8"), edited, "the hand-edited lock stands");
    assert.match(refused.error ?? "", /^Resolving stopped: .*spex\.lock changed meanwhile; retry$/);

    // A clone whose lock and installed files go is settled again at the
    // next change of the repositories, its files deciding (environments-5).
    rmSync(lockPath);
    rmSync(join(clone, "packages"), { recursive: true, force: true });
    mark = client.mark();
    await client.expectOk("project.register", { path: gitFolder(join(dir, "other")) });
    const resettled = await client.environment(key, mark, (state) => state.busy === null && state.packages.some((pkg) => pkg.name === "acme/lint" && pkg.installed));
    assert.ok(existsSync(lockPath), "the lock is resolved again");
    assert.equal(resettled.error, null);

    // Once the core stops, strict environment work is refused before any write.
    const manager = managerOf(core);
    const requests = readFileSync(join(clone, "spex.yaml"));
    stopped = true;
    await core.stop();
    await assert.rejects(manager.ensureRequested(key, "acme/late", { version: "^1.0.0" }), refusedWith("aborted"));
    await assert.rejects(manager.installNow(key, true, { lockWritten: false, installed: false }), refusedWith("aborted"));
    assert.deepEqual(readFileSync(join(clone, "spex.yaml")), requests, "nothing was written");
  } finally {
    held.release();
  }
});

test("environments-21 through a real core: an install whose lock or requests changed during its held download publishes nothing and says so, a removed clone is not made again, and installed means installed as locked", { timeout: 180_000 }, async (t) => {
  const registry = await startStandinRegistry({ dir: scratchDir("spex-env-held-registry-") });
  t.after(() => registry.close());
  const kit = (version: string, files: Record<string, string>): Promise<void> => makeRelease(join(scratchDir("spex-env-held-release-"), "kit"), {
    format: 2, org: "acme", name: "kit", version, description: "Kit", license: "Apache-2.0",
    artifacts: { tidy: { kind: "skill", language: "en" } },
  }, files).then(async (releaseDir) => { await publishRelease(new RegistryClient({ url: registry.url }), releaseDir); });
  const skillMd = (body: string): string => `---\nname: tidy\ndescription: The tidy skill\n---\n\n${body}\n`;
  // Each later release holds a subset of the first's file names.
  await kit("1.0.0", { "skills/en/tidy/SKILL.md": skillMd("one"), "skills/en/tidy/notes.txt": "notes\n" });
  for (const [version, body] of [["1.1.0", "two"], ["1.2.0", "three"], ["1.3.0", "four"]] as const) await kit(version, { "skills/en/tidy/SKILL.md": skillMd(body) });
  const held = heldFetch();
  const dir = scratchDir("spex-env-held-");
  const core = await startCore(dir, { hostUrl: registry.url, extra: { registryFetch: held.fetch } });
  t.after(() => core.stop());
  const { client } = core;
  try {
    const project = await client.expectOk("project.register", { path: gitFolder(join(dir, "project")) });
    const key = project.id;
    const clone = clonePath(core.dataDir, key);
    await settledProject(client, key);
    const installedVersion = (): string => (parseYaml(readFileSync(join(clone, "packages", "acme", "kit", "meta.yaml"), "utf8")) as { version: string }).version;
    const download = (version: string) => (path: string): boolean =>
      path === `/api/v1/packages/acme/kit/${version}/download` || path.startsWith(`/acme/kit/${version}/`);
    const kitOf = (state: EnvironmentState) => state.packages.find((pkg) => pkg.name === "acme/kit");

    let mark = client.mark();
    await client.expectOk("environment.request", { repository: key, name: "acme/kit", request: { kind: "registry", version: "1.0.0" } });
    await client.environment(key, mark, (state) => state.busy === null && kitOf(state)?.installed === true);
    const requests = readFileSync(join(clone, "spex.yaml"));
    const lock = readFileSync(join(clone, "spex.lock"));

    // A lock replaced while the download is held — a sync applying the
    // host's — refuses the outdated swap: the newer lock's files stand.
    held.arm(download("1.1.0"));
    await client.expectOk("environment.request", { repository: key, name: "acme/kit", request: { kind: "registry", version: "1.1.0" } });
    await until(held.reached, 30_000, "the held download of 1.1.0");
    writeFileSync(join(clone, "spex.yaml"), requests);
    writeFileSync(join(clone, "spex.lock"), lock);
    mark = client.mark();
    held.release();
    let state = await client.environment(key, mark, (current) => current.busy === null);
    assert.deepEqual(readFileSync(join(clone, "spex.lock")), lock, "the replaced lock stands");
    assert.equal(installedVersion(), "1.0.0", "the outdated install published nothing");
    assert.deepEqual([kitOf(state)?.version, kitOf(state)?.installed, state.stale], ["1.0.0", true, null]);
    assert.match(state.error ?? "", /^Installing stopped; the last files stay: .*spex\.lock changed meanwhile; retry$/);

    // spex.yaml gone while its lock stands installed: the enabling path's
    // awaited install is refused, resolving again needed, never a success.
    rmSync(join(clone, "spex.yaml"));
    try {
      const progress = { lockWritten: false, installed: false };
      await assert.rejects(managerOf(core).installNow(key, false, progress), (error: unknown) =>
        refusedWith("invalid_request")(error) && /resolve again to install/.test((error as Error).message));
      assert.deepEqual(progress, { lockWritten: false, installed: false });
      assert.deepEqual(readFileSync(join(clone, "spex.lock")), lock);
    } finally {
      writeFileSync(join(clone, "spex.yaml"), requests);
    }

    // A spex.yaml changed while the download is held refuses the swap
    // too; the lock written for the former requests reads stale, and its
    // package reads not installed, though files of its names stand
    // (environments-14).
    held.arm(download("1.2.0"));
    await client.expectOk("environment.request", { repository: key, name: "acme/kit", request: { kind: "registry", version: "1.2.0" } });
    await until(held.reached, 30_000, "the held download of 1.2.0");
    writeFileSync(join(clone, "spex.yaml"), `${readFileSync(join(clone, "spex.yaml"), "utf8")}# edited meanwhile\n`);
    mark = client.mark();
    held.release();
    state = await client.environment(key, mark, (current) => current.busy === null);
    assert.equal(installedVersion(), "1.0.0");
    assert.equal(existsSync(join(clone, "packages", "acme", "kit", "skills", "en", "tidy", "SKILL.md")), true);
    assert.deepEqual([kitOf(state)?.version, kitOf(state)?.installed], ["1.2.0", false]);
    assert.deepEqual(state.stale, ["Requests changed; resolve again to install"]);
    assert.match(state.error ?? "", /spex\.yaml changed meanwhile; retry$/);
    // Installing the stale lock installs and exports nothing, and reports
    // the stale reasons alone, no change meanwhile invented (environments-7).
    const exported = join(dir, "project", ".claude", "skills", "tidy", "SKILL.md");
    const exportedBefore = statSync(exported).ino;
    mark = client.mark();
    await client.expectOk("environment.install", { repository: key });
    state = await client.environment(key, mark, (current) => current.busy === null);
    assert.equal(state.error, null);
    assert.deepEqual(state.stale, ["Requests changed; resolve again to install"]);
    assert.equal(installedVersion(), "1.0.0");
    assert.equal(statSync(exported).ino, exportedBefore, "no export of the stale lock");

    // A clone removed while the download is held is never made again,
    // by the install or its exports.
    held.arm(download("1.3.0"));
    await client.expectOk("environment.request", { repository: key, name: "acme/kit", request: { kind: "registry", version: "1.3.0" } });
    await until(held.reached, 30_000, "the held download of 1.3.0");
    rmSync(clone, { recursive: true, force: true });
    held.release();
    const start = Date.now();
    while ((await client.expectOk("environment.get", { repository: key })).busy !== null) {
      if (Date.now() - start > 30_000) throw new Error("timeout waiting for the held install to end");
      await sleep(25);
    }
    assert.equal(existsSync(clone), false, "the install made no folder at the clone's address");
    assert.deepEqual(existsSync(join(core.dataDir, "cache", "staging")) ? readdirSync(join(core.dataDir, "cache", "staging")) : [], [], "no staged tree outlives the refusal");
    // The enabling path's strict steps are refused there, no folder made.
    const manager = managerOf(core);
    await assert.rejects(manager.installNow(key, false, { lockWritten: false, installed: false }), refusedWith("not_found"));
    await assert.rejects(manager.ensureRequested(key, "acme/kit", { version: "1.0.0" }), refusedWith("conflict"));
    assert.equal(existsSync(clone), false);
  } finally {
    held.release();
  }
});

test("environments-14: an operation held while its clone moves announces its end at the new address, and writes nothing at the old", { timeout: 120_000 }, async (t) => {
  const registry = await startStandinRegistry({ dir: scratchDir("spex-env-move-registry-") });
  t.after(() => registry.close());
  const release = skillRelease("acme", "slow");
  await publishRelease(new RegistryClient({ url: registry.url }), await makeRelease(join(scratchDir("spex-env-move-release-"), "slow"), release.manifest, release.files));
  const held = heldFetch();
  const dir = scratchDir("spex-env-move-");
  const core = await startCore(dir, { hostUrl: registry.url, extra: { registryFetch: held.fetch } });
  t.after(() => core.stop());
  const { client } = core;
  try {
    const project = await client.expectOk("project.register", { path: gitFolder(join(dir, "project")) });
    const from = project.id;
    const to = `${OWN}/moved-spex`;
    const source = clonePath(core.dataDir, from);
    const target = clonePath(core.dataDir, to);
    await settledProject(client, from);
    held.arm((path) => path === "/api/v1/packages/acme/slow");
    await client.expectOk("environment.request", { repository: from, name: "acme/slow", request: { kind: "registry", version: "^1.0.0" } });
    await until(held.reached, 30_000, "the held resolution");
    const lock = readFileSync(join(source, "spex.lock"));

    // The clone moves as a sync following a host rename moves it: the
    // folder renamed, the store and the environment told (space-60's
    // own calls, invoked here beside the held work).
    mkdirSync(dirname(target), { recursive: true });
    renameSync(source, target);
    (core.service as unknown as { store: Store }).store.moveRepositories([{ from, to }]);
    await managerOf(core).moved(from, to);
    const moved = await client.expectOk("environment.get", { repository: to });
    assert.equal(moved.busy, "resolving", "the held operation still runs, read at the new address");

    const mark = client.mark();
    held.release();
    const ended = await client.environment(to, mark, (state) => state.busy === null, 30_000);
    assert.match(ended.error ?? "", /changed meanwhile; retry$/, "the held resolution found its files moved");
    assert.equal(existsSync(source), false, "nothing was made at the old address");
    assert.deepEqual(readFileSync(join(target, "spex.lock")), lock, "the held resolution wrote no lock");
  } finally {
    held.release();
  }
});

test("shared-config-roundtrip-3: a config edit whose file another writer changes while it composes is refused as a conflict, the other writer's bytes standing", { timeout: 60_000 }, async (t) => {
  let gate: Promise<void> | undefined;
  let open: (() => void) | undefined;
  let reached = false;
  const loadModule = async (specifier: string): Promise<unknown> => {
    if (gate) { const wait = gate; gate = undefined; reached = true; await wait; }
    return import(isAbsolute(specifier) ? pathToFileURL(specifier).href : specifier);
  };
  const dir = scratchDir("spex-env-config-conflict-");
  const core = await startCore(dir, { hostUrl: UNREACHABLE, extra: { loadModule } });
  t.after(() => core.stop());
  try {
    gate = new Promise((resolve) => { open = resolve; });
    const reply = core.client.command("config.edit", { op: { kind: "captain.set", patch: { model: "claude-other" } } });
    await until(() => reached, 30_000, "the held composition");
    const other = `${readFileSync(core.configPath, "utf8")}# another writer\n`;
    writeFileSync(core.configPath, other);
    open?.();
    const answer = await reply;
    assert.ok(!answer.ok, "the edit is refused");
    if (answer.ok) return;
    assert.equal(answer.error.code, "conflict");
    assert.match(answer.error.message, /changed meanwhile; retry/);
    assert.equal(readFileSync(core.configPath, "utf8"), other, "the other writer's bytes stand");
  } finally {
    gate = undefined;
    open?.();
  }
});

test("playbook-library-98: an enabling refused after some of its writes names them, they stand, nothing else is overwritten, and a retry enables from what stands", { timeout: 180_000 }, async (t) => {
  const dir = scratchDir("spex-env-enable-");
  const core = await startCore(dir, { hostUrl: UNREACHABLE, script: authoringScript(), slc: stubSlcSource("['triager', 'verifier']") });
  t.after(() => core.stop());
  const { client } = core;
  const working = gitFolder(join(dir, "project"));
  const project = await client.expectOk("project.register", { path: working });
  const clone = clonePath(core.dataDir, project.id);
  await settledProject(client, project.id);

  // An authoring session compiles its playbook (playbook-library-69).
  const { instance } = await client.expectOk("draft.create", { projectId: project.id, draftId: "triage" });
  assert.ok(instance, "the session's recorded instance");
  await client.expectOk("draft.send", { projectId: project.id, draftId: "triage", instance, text: "I want a playbook that triages new issues." });
  const latest = () => client.messages.filter((m) => m.type === "draft.state" && m.draft.id === "triage").map((m) => (m as { draft: CommandResults["draft.create"] }).draft).at(-1);
  await until(() => latest()?.activity === "idle" && latest()?.proposal !== undefined, 120_000, "the compiled proposal");
  const register = { projectId: project.id, draftId: "triage", instance, command: "triage", intent: "Label new issues",
    bindings: { Triager: "dev.triager", Verifier: "dev.coder" }, newPlayers: { "dev.triager": { adapter: "claude" } } };

  // The project's config folder is a file another writer placed: the
  // entry, the enabling's last write, fails after the request, the lock
  // and the new player were written.
  const configDir = join(clone, "config");
  const aside = join(clone, "config.aside");
  const hadConfig = existsSync(configDir);
  if (hadConfig) renameSync(configDir, aside);
  const foreign = "a file another writer placed\n";
  writeFileSync(configDir, foreign);
  let failure: { code: string; message: string } | undefined;
  let afterFailure: { requests: string; lock: string; own: string; foreign: string } | undefined;
  try {
    const reply = await client.command("draft.register", register);
    if (!reply.ok) failure = reply.error;
    afterFailure = {
      requests: readFileSync(join(clone, "spex.yaml"), "utf8"),
      lock: readFileSync(join(clone, "spex.lock"), "utf8"),
      own: readFileSync(core.configPath, "utf8"),
      foreign: readFileSync(configDir, "utf8"),
    };
  } finally {
    rmSync(configDir, { force: true });
    if (hadConfig) renameSync(aside, configDir);
  }
  assert.ok(failure, "the enabling is refused");
  assert.equal(failure.code, "internal", failure.message);
  assert.match(failure.message, /^enabling stopped after /);
  for (const step of [/local\/triage requested in spex\.yaml|\/triage requested in spex\.yaml/, /spex\.lock resolved/, /player dev\.triager written/]) assert.match(failure.message, step);
  assert.match(failure.message, /ENOTDIR/);
  assert.doesNotMatch(failure.message, /playbook triage written/);
  // What was written stands; the other writer's file is not overwritten.
  assert.match(afterFailure!.requests, /\/triage:\n\s+path: spex-packages\/triage\n/);
  assert.match(afterFailure!.lock, /\/triage:/);
  assert.match(afterFailure!.own, /dev\.triager:\n\s+adapter: claude/);
  assert.equal(afterFailure!.foreign, foreign);

  // A retry, the folder back, reads what stands: no request written
  // again, the entry written, the session enabled.
  await client.expectOk("draft.register", register);
  assert.equal(readFileSync(join(clone, "spex.yaml"), "utf8"), afterFailure!.requests, "the standing request is not written again");
  assert.match(readFileSync(join(clone, "config", "playbook.config.yaml"), "utf8"), /triage:\n\s+roles:/);
  await until(() => latest()?.state === "enabled", 10_000, "the enabled chip");
});
