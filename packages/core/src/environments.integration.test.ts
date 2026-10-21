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
import { appendFileSync, chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
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
import { defaultSpawner, ENGINE_LINKS_EXCLUDE, type LineSpawner } from "./compile.js";
import { createModuleLoader, starterText, templatePath } from "./config.js";
import { builtinPackage, INSTALL_RECORD, publishRelease, readRelease, RegistryClient, requestsDigest, type BuiltinPackage, type Lock } from "./environment/index.js";
import type { Command, CommandResults, EnvironmentState, ServerMessage } from "./protocol.js";
import { authoringScript } from "./testing/authoring.js";
import { fakeAdapterImports, type FakeScript } from "./testing/fake-adapter.js";
import { createScriptedCaptain } from "./testing/scripted-captain.js";
import { scratchDir } from "./testing/scratch.js";
import { createSpaceHarness, instanceOf, ownClone, rowsOf } from "./testing/space-harness.js";
import { STANDIN_STORAGE } from "./testing/standin-host.js";
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

  /** Observe the broadcast, then confirm it still describes the files and
   * running work: an earlier idle announcement may still be in transit. */
  async environment(repository: string, from: number, check: (state: EnvironmentState) => boolean, timeoutMs = 60_000): Promise<EnvironmentState> {
    const start = Date.now();
    let next = from;
    for (;;) {
      const remaining = Math.max(0, timeoutMs - (Date.now() - start));
      const message = await this.waitFor((m) => m.type === "environment.state" && m.repository === repository && check(m.state), remaining, next);
      next = this.messages.indexOf(message) + 1;
      const current = await this.expectOk("environment.get", { repository });
      if (check(current)) return current;
    }
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
    format: 2, device: randomUUID(), origin: hostUrl,
    instances: [{ origin: hostUrl, clientId: "spex", account: { id: "1", login: OWN, displayName: "Tester" } }],
    own: OWN, folders: [],
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
  // [environments-11] each state names the newer release beside the
  // older its lock selects, the caret request admitting the newer.
  assert.deepEqual(still.builtinUpdate, { shipped: newer.version, locked: shipped.version });
  const ownBefore = await core.client.expectOk("environment.get", { repository: own });
  assert.deepEqual(ownBefore.builtinUpdate, { shipped: newer.version, locked: shipped.version });
  // A new environment takes the newer release, and its state names none.
  const later = await core.client.expectOk("project.register", { path: gitFolder(join(dir, "later")) });
  const laterLock = parseYaml(readFileSync(join(clonePath(core.dataDir, later.id), "spex.lock"), "utf8")) as { packages: Record<string, { source: { version: string } }> };
  assert.equal(laterLock.packages["sublang/playbooks"]!.source.version, newer.version);
  const laterState = await core.client.expectOk("environment.get", { repository: later.id });
  assert.ok(!("builtinUpdate" in laterState), "[environments-11] a lock selecting the shipped release names no update");

  // [environments-11] resolving again — what Update sends — moves the
  // lock to the newer release, and the state names none.
  let mark = core.client.mark();
  await core.client.expectOk("environment.resolve", { repository: own });
  const updated = await core.client.environment(own, mark, (state) => state.busy === null && state.packages[0]?.version === newer.version);
  assert.deepEqual(updated.packages.map((pkg) => [pkg.name, pkg.version, pkg.source.kind, pkg.installed]), [["sublang/playbooks", newer.version, "builtin", true]]);
  assert.ok(!("builtinUpdate" in updated), "[environments-11] the lock selects the shipped release");

  // [environments-11] a request admitting only the older release names
  // no update, its lock still selecting the older.
  mark = core.client.mark();
  await core.client.expectOk("environment.request", { repository: project.id, name: "sublang/playbooks", request: { kind: "registry", version: shipped.version } });
  const exact = await core.client.environment(project.id, mark, (state) => state.busy === null && state.stale === null
    && JSON.stringify(state.requests["sublang/playbooks"]) === JSON.stringify({ kind: "registry", version: shipped.version }));
  assert.deepEqual(exact.packages.map((pkg) => [pkg.version, pkg.installed]), [[shipped.version, true]]);
  assert.ok(!("builtinUpdate" in exact), "[environments-11] the request admits only the older release");
});

test("environments-22 through a real core: retained files of another lock are not imported before a successful same-process resolve", { timeout: 120_000 }, async (t) => {
  const dir = scratchDir("spex-env-retained-module-");
  // Install the shipped release without loading its registries yet.
  let core = await startCore(dir, { hostUrl: UNREACHABLE, config: CONFIG.replace(/playbooks:[\s\S]*/, "playbooks: {}\n") });
  t.after(() => core.stop());
  const own = `${OWN}/${OWN}-spex`;
  const clone = clonePath(core.dataDir, own);
  await core.stop();
  writeFileSync(core.configPath, CONFIG);

  // A synced older lock cannot be restored. Its previous installed tree
  // stays intact, including an engine link invalidated by a local move.
  const major = builtinPackage().version.split(".")[0]!;
  const requests = stringifyYaml({ format: 1, packages: { "sublang/playbooks": { version: `^${major}.0.0` } } });
  writeFileSync(join(clone, "spex.yaml"), requests);
  const lockPath = join(clone, "spex.lock");
  const lock = parseYaml(readFileSync(lockPath, "utf8")) as Lock;
  lock.requests = requestsDigest(requests);
  const previous = lock.packages["sublang/playbooks"]!;
  assert.ok("version" in previous.source);
  previous.source.version = `${major}.0.0`;
  previous.files[0]!.sha256 = "0".repeat(64);
  writeFileSync(lockPath, stringifyYaml(lock));
  for (const id of ["code", "review"]) {
    const link = join(clone, "packages", "sublang", "playbooks", "playbooks", "en", id, "node_modules", "xstate");
    rmSync(link, { recursive: true, force: true });
    symlinkSync(join(dir, "retired-engine", "xstate"), link, process.platform === "win32" ? "junction" : "dir");
  }
  const loaded: string[] = [];
  const loader = createModuleLoader();
  core = await startCore(dir, { hostUrl: UNREACHABLE, extra: { loadModule: async (module) => { loaded.push(module); return loader(module); } } });
  const before = await core.client.expectOk("environment.get", { repository: own });
  assert.equal(before.packages[0]?.installed, false);
  assert.ok(before.error, "the failed restoration remains visible");
  const configBefore = await core.client.expectOk("config.get", {});
  const importedBefore = loaded.length;

  // One normal resolve selects the seeded release, installs it and
  // prepares the engine links before the first registry import.
  const mark = core.client.mark();
  await core.client.expectOk("environment.resolve", { repository: own });
  const after = await core.client.environment(own, mark, (state) => state.busy === null && state.packages[0]?.installed === true);
  assert.equal(after.error, null);
  assert.equal((await core.client.expectOk("config.get", {})).status, "valid", "a successful resolve repairs config without restarting the core");
  assert.equal(configBefore.status, "invalid");
  assert.match(JSON.stringify(configBefore), /exports no playbook code/);
  assert.equal(importedBefore, 0, "no retained registry was imported while its package was uninstalled");
  assert.ok(loaded.length > 0, "the installed registries were imported after recovery");

  // Install-record changes matter even when config, lock and entry bytes
  // stay unchanged, with watchers disabled. Restoring the exact record
  // makes the already installed package available again.
  const recordPath = join(clone, "packages", INSTALL_RECORD);
  const record = readFileSync(recordPath);
  rmSync(recordPath);
  assert.equal((await core.client.expectOk("config.get", {})).status, "invalid");
  writeFileSync(recordPath, record);
  assert.equal((await core.client.expectOk("config.get", {})).status, "valid");

  const machinePath = join(clone, "packages", "sublang", "playbooks", "playbooks", "en", "code", "code.playbook", "code.fsm.js");
  const machine = readFileSync(machinePath);
  rmSync(machinePath);
  assert.equal((await core.client.expectOk("config.get", {})).status, "invalid", "a missing selected non-entry file invalidates cached availability");
  writeFileSync(machinePath, machine);
  assert.equal((await core.client.expectOk("config.get", {})).status, "valid");

  // A Git source at another commit is equally unavailable: the retained
  // registry files never establish that the new locked source installed.
  const installedLock = readFileSync(lockPath);
  const gitLock = parseYaml(installedLock.toString()) as Lock;
  gitLock.packages["sublang/playbooks"]!.source = { git: pathToFileURL(join(dir, "not-fetched.git")).href, commit: "0".repeat(40) };
  const beforeGitRead = loaded.length;
  writeFileSync(lockPath, stringifyYaml(gitLock));
  assert.equal((await core.client.expectOk("config.get", {})).status, "invalid");
  assert.equal(loaded.length, beforeGitRead, "no files retained for a different Git source are imported");
  writeFileSync(lockPath, installedLock);
  assert.equal((await core.client.expectOk("config.get", {})).status, "valid");
  assert.equal(readFileSync(core.configPath, "utf8"), CONFIG, "recovery preserves the authored configuration");
  assert.equal(readFileSync(join(clone, "spex.yaml"), "utf8"), requests, "resolving again preserves the authored version requirement");
  assert.deepEqual(readdirSync(join(clone, "sessions")), [], "no workflow or provider turn was needed");
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

  // An authoring session writes its spec package in the working folder,
  // under the org New playbook gave — a registry org, not the login.
  const ORG = "workshop";
  const created = await core.client.expectOk("draft.create", { projectId: project.id, draftId: "triage", org: ORG, license: "Apache-2.0" });
  assert.equal(created.package, `${ORG}/triage`);
  const folder = join(working, "spex-packages", "triage");
  const instance = created.instance!;
  await core.client.expectOk("draft.send", { projectId: project.id, draftId: "triage", instance, text: "I want a playbook that triages new issues." });
  const latest = () => core.client.messages.filter((m) => m.type === "draft.state" && m.draft.id === "triage").map((m) => (m as { draft: CommandResults["draft.create"] }).draft).at(-1);
  await until(() => latest()?.activity === "idle" && latest()?.proposal !== undefined, 120_000, "the compiled proposal");
  assert.equal(latest()?.state, "compiled");
  assert.ok(existsSync(join(folder, "playbooks", "en", "triage", "triage.registry.mjs")), "compiled in the playbook artifact");
  // The engine links stay out of the working folder's Git.
  assert.match(readFileSync(join(working, ".git", "info", "exclude"), "utf8"), /^\*\*\/playbooks\/\*\/\*\/node_modules\/$/m);

  // Enabling requests it by path, installs and writes the project's entry.
  await core.client.expectOk("draft.register", {
    projectId: project.id, draftId: "triage", instance, command: "triage", intent: "Label new issues",
    bindings: { Triager: "dev.coder", Verifier: "dev.coder" },
  });
  assert.equal((parseYaml(readFileSync(join(clone, "spex.yaml"), "utf8")) as { packages: Record<string, unknown> }).packages[`${ORG}/triage`] !== undefined, true);
  await until(() => latest()?.state === "enabled", 10_000, "the enabled chip");
  // A session of the project launches it from the working folder.
  const session = await core.client.expectOk("session.create", { projectId: project.id });
  const manifestFile = join(clone, "sessions", `${session.id}.json`);
  await until(() => existsSync(manifestFile), 10_000, "the session's manifest");
  const catalog = (JSON.parse(readFileSync(manifestFile, "utf8")) as { structuralProjection: { catalog: Record<string, { from: string }> } }).structuralProjection.catalog;
  assert.equal(catalog.triage?.from, pathToFileURL(join(folder, "playbooks", "en", "triage", "triage.registry.mjs")).href);

  // What the compiler keeps beside the playbook for itself — its build
  // history and its verifier's support — is no release file
  // (environments-1).
  const playbookFolder = join(folder, "playbooks", "en", "triage");
  const compilerOwn = [".slc/builds/0001/triage.md", "triage.playbook/.slc/latest", "triage.playbook/.slc-verify/support.mjs"];
  for (const path of compilerOwn) {
    mkdirSync(dirname(join(playbookFolder, path)), { recursive: true });
    writeFileSync(join(playbookFolder, path), `${path}\n`);
  }
  const ownedByCompiler = (path: string): boolean => /(^|\/)\.slc(-verify)?\//.test(path);

  // Publishing: a manifest without the license the registry requires is
  // refused naming the field, the preview as the upload, before
  // anything reaches the registry (environments-10).
  const metaFile = join(folder, "meta.yaml");
  const metaText = readFileSync(metaFile, "utf8");
  const { license: _license, ...unlicensed } = parseYaml(metaText) as Record<string, unknown>;
  writeFileSync(metaFile, stringifyYaml(unlicensed));
  registry.script.clearRequests();
  for (const dryRun of [true, false]) {
    await core.client.expectError("environment.publish", { repository: project.id, path: "spex-packages/triage", ...(dryRun ? { dryRun } : {}) },
      "invalid_request", /spex-packages\/triage cannot be published: meta\.yaml: missing required field "license"/);
  }
  assert.deepEqual(registry.script.requests.filter((request) => request.startsWith("PUT ")), [], "nothing was uploaded");
  writeFileSync(metaFile, metaText);

  // The dry run names what would go, then the upload.
  const preview = await core.client.expectOk("environment.publish", { repository: project.id, path: "spex-packages/triage", dryRun: true });
  const declared = (await readRelease(folder)).files;
  assert.deepEqual(preview.preview, { name: `${ORG}/triage`, version: "0.1.0", files: declared.map((file) => file.path).sort() });
  assert.ok(!preview.preview?.files.some((path) => path.includes("node_modules")), "engine links never upload");
  assert.deepEqual(preview.preview?.files.filter(ownedByCompiler), [], "the compiler's own files never upload");
  assert.ok(preview.preview?.files.includes("playbooks/en/triage/triage.registry.mjs"), "the compiled module uploads");
  const from = core.client.mark();
  assert.deepEqual(await core.client.expectOk("environment.publish", { repository: project.id, path: "spex-packages/triage" }), { accepted: true });
  const published = await core.client.environment(project.id, from, (state) => state.busy === null && (state.published !== null && state.published !== undefined || state.error !== null));
  assert.equal(published.error, null);
  assert.deepEqual(published.published, { name: `${ORG}/triage`, version: "0.1.0", url: `${registry.url}/${ORG}/triage` });
  // The release at the registry is exactly the folder's declared files,
  // its manifest carrying the description and license.
  const resource = await (await fetch(`${registry.url}/api/v1/packages/${ORG}/triage/0.1.0`)).json() as { files: { path: string; sha256: string }[]; description?: string; license?: string };
  assert.deepEqual(resource.files.map((file) => [file.path, file.sha256]), declared.map((file) => [file.path, file.sha256]));
  assert.deepEqual(resource.files.map((file) => file.path).filter(ownedByCompiler), [], "the registry received none of the compiler's own files");
  assert.deepEqual([resource.description, resource.license], ["The triage playbook", "Apache-2.0"]);

  // A second home requests the published version from the registry.
  const second = scratchDir("spex-env-second-");
  const other = await startCore(second, { hostUrl: registry.url });
  t.after(() => other.stop());
  const otherProject = await other.client.expectOk("project.register", { path: gitFolder(join(second, "project")) });
  const mark = other.client.mark();
  await other.client.expectOk("environment.request", { repository: otherProject.id, name: `${ORG}/triage`, request: { kind: "registry", version: "^0.1.0" } });
  const installed = await other.client.environment(otherProject.id, mark, (state) => state.busy === null && state.packages.some((pkg) => pkg.name === `${ORG}/triage` && pkg.installed));
  const pkg = installed.packages.find((entry) => entry.name === `${ORG}/triage`)!;
  assert.deepEqual([pkg.version, pkg.source.kind, pkg.direct], ["0.1.0", "registry", true]);
  const playbooks = await other.client.expectOk("environment.playbooks", { projectId: otherProject.id });
  const row = playbooks.project?.find((entry) => entry.id === "triage");
  assert.deepEqual([row?.source, row?.version, row?.enabled, row?.present], ["registry", "0.1.0", [], true]);
});

// ---------------------------------------------------------------------------
// environments-22: a spec package's spec exported through a real core
// ---------------------------------------------------------------------------

test("environments-22 through a real core: a spec-only spec package requested from the registry exports its spec where claude reads skills, your own group's to the user home, and leaves once removed", { timeout: 180_000 }, async (t) => {
  const registry = await startStandinRegistry({ dir: scratchDir("spex-env-spec-registry-") });
  t.after(() => registry.close());
  const spec = "# trip-split: Trip Split\n\n## Intent\n\nSplit a trip's costs.\n\n## External Behavior\n\n### trip-split-1\n\nThe splitter shall divide each cost among the travellers who shared it.\n\n## Verification\n\n### trip-split-2\n\nWhen a cost is shared, the suite shall assert its division [[trip-split-1](#trip-split-1)].\n";
  const releaseDir = await makeRelease(join(scratchDir("spex-env-spec-release-"), "trip-split"), {
    format: 2, org: "acme", name: "trip-split", version: "1.0.0", description: "Split a trip's costs fairly", license: "Apache-2.0",
    artifacts: { "trip-split": { kind: "spec", language: "en" } },
  }, { "specs/en/trip-split.md": spec });
  await publishRelease(new RegistryClient({ url: registry.url }), releaseDir);
  const released = readFileSync(join(releaseDir, "specs", "en", "trip-split.md"));

  const dir = scratchDir("spex-env-spec-");
  const core = await startCore(dir, { hostUrl: registry.url });
  t.after(() => core.stop());
  const { client } = core;
  const working = gitFolder(join(dir, "project"));
  const { id: key } = await client.expectOk("project.register", { path: working });
  const own = `${OWN}/${OWN}-spex`;
  const exported = join(working, ".claude", "skills", "acme-trip-split");
  const shared = join(working, ".agents", "skills", "acme-trip-split");
  const atHome = join(dir, "user", ".claude", "skills", "acme-trip-split");
  const exclude = (): string => readFileSync(join(working, ".git", "info", "exclude"), "utf8");
  const request = { kind: "registry", version: "^1.0.0" } as const;
  const holds = (state: EnvironmentState): boolean => state.packages.some((pkg) => pkg.name === "acme/trip-split" && pkg.installed);

  // Requested in the project: the generated skill stands where claude
  // reads skills, the release's spec file in it byte for byte.
  let mark = client.mark();
  await client.expectOk("environment.request", { repository: key, name: "acme/trip-split", request });
  const requested = await client.environment(key, mark, (state) => state.busy === null && holds(state));
  assert.deepEqual(requested.packages.find((pkg) => pkg.name === "acme/trip-split")?.exports, [{ name: "acme-trip-split", artifact: "trip-split" }]);
  assert.deepEqual(readdirSync(exported).sort(), ["SKILL.md", "trip-split.md"]);
  assert.ok(readFileSync(join(exported, "trip-split.md")).equals(released), "the spec file is the release's, byte for byte");
  const skill = readFileSync(join(exported, "SKILL.md"), "utf8");
  assert.match(skill, /^---\nname: acme-trip-split\n/);
  assert.match(skill, /`acme\/trip-split` — org `acme`, name `trip-split`, version `1\.0\.0`: Split a trip's costs fairly/);
  assert.match(exclude(), /^\/\.claude\/skills\/acme-trip-split\/$/m);
  // The same skill stands where Codex, Gemini CLI, Kimi Code and OpenCode
  // read skills, whatever agents this device has (environments-16).
  assert.deepEqual(readdirSync(shared).sort(), ["SKILL.md", "trip-split.md"]);
  assert.ok(readFileSync(join(shared, "trip-split.md")).equals(released), "the shared folder's copy is the release's too");
  assert.match(exclude(), /^\/\.agents\/skills\/acme-trip-split\/$/m);
  assert.equal(execFileSync("git", ["-C", working, "status", "--porcelain", "--untracked-files=all", "--", ".claude", ".agents"], { encoding: "utf8" }), "", "Git ignores the export");
  assert.equal(existsSync(atHome), false, "a project's spec stays in its working folder");

  // Requested in your own group's environment: your agents' home folder holds it.
  mark = client.mark();
  await client.expectOk("environment.request", { repository: own, name: "acme/trip-split", request });
  await client.environment(own, mark, (state) => state.busy === null && holds(state));
  assert.deepEqual(readdirSync(atHome).sort(), ["SKILL.md", "trip-split.md"]);
  assert.ok(readFileSync(join(atHome, "trip-split.md")).equals(released), "your own group's copy is the release's too");
  // Only claude has a home folder here: no user-level folder of the other
  // four, and no agent's home folder, is made (environments-16).
  for (const folder of [".agents", ".codex", ".gemini", ".kimi-code", ".config/opencode", ".local/share/opencode"]) {
    assert.equal(existsSync(join(dir, "user", folder)), false, folder);
  }
  // Once OpenCode has a home folder here, an export writes the folder it
  // shares with Codex, Gemini CLI and Kimi Code, and makes no other.
  mkdirSync(join(dir, "user", ".local", "share", "opencode"), { recursive: true });
  mark = client.mark();
  await client.expectOk("environment.install", { repository: own });
  await client.environment(own, mark, (state) => state.busy === null && holds(state));
  const sharedAtHome = join(dir, "user", ".agents", "skills", "acme-trip-split");
  assert.deepEqual(readdirSync(sharedAtHome).sort(), ["SKILL.md", "trip-split.md"]);
  for (const folder of [".codex", ".gemini", ".kimi-code", ".config"]) assert.equal(existsSync(join(dir, "user", folder)), false, folder);

  // Removed and installed again: the skill, its exclude line and the
  // home folder's copy leave with the spec package.
  mark = client.mark();
  await client.expectOk("environment.remove", { repository: key, name: "acme/trip-split" });
  await client.environment(key, mark, (state) => state.busy === null && !holds(state));
  assert.equal(existsSync(exported), false, "the removed spec package's skill is gone");
  assert.equal(existsSync(shared), false, "and so is its copy in the shared folder");
  assert.doesNotMatch(exclude(), /acme-trip-split/);
  mark = client.mark();
  await client.expectOk("environment.remove", { repository: own, name: "acme/trip-split" });
  await client.environment(own, mark, (state) => state.busy === null && !holds(state));
  assert.equal(existsSync(atHome), false, "your own group's copy is gone");
  assert.equal(existsSync(sharedAtHome), false, "and so is its copy in the shared user folder");
});

test("environments-22 through a real core: a project rebound to a second working folder is exported there, and its state names what the export left out until an install exports it", { timeout: 180_000 }, async (t) => {
  const registry = await startStandinRegistry({ dir: scratchDir("spex-env-pair-registry-") });
  t.after(() => registry.close());
  const skill = (name: string, body: string): string => `---\nname: ${name}\ndescription: The ${name} skill.\n---\n\n${body}\n`;
  const releaseDir = await makeRelease(join(scratchDir("spex-env-pair-release-"), "kit"), {
    format: 2, org: "acme", name: "kit", version: "1.0.0", description: "Lint and format", license: "Apache-2.0",
    artifacts: { lint: { kind: "skill", language: "en" }, fmt: { kind: "skill", language: "en" } },
  }, { "skills/en/lint/SKILL.md": skill("lint", "Lint the code."), "skills/en/fmt/SKILL.md": skill("fmt", "Format the code.") });
  await publishRelease(new RegistryClient({ url: registry.url }), releaseDir);

  const dir = scratchDir("spex-env-pair-");
  const core = await startCore(dir, { hostUrl: registry.url });
  t.after(() => core.stop());
  const { client } = core;
  // The first working folder holds a spec package under development,
  // requested by path beside the registry's.
  const first = gitFolder(join(dir, "first"));
  await makeRelease(join(first, "tools", "tidy"), {
    format: 2, org: "acme", name: "tidy", version: "0.1.0",
    artifacts: { tidy: { kind: "skill", language: "en" } },
  }, { "skills/en/tidy/SKILL.md": skill("tidy", "Tidy up.") });
  const { id: key } = await client.expectOk("project.register", { path: first });
  const holds = (state: EnvironmentState, name: string): boolean => state.packages.some((pkg) => pkg.name === name && pkg.installed);
  let mark = client.mark();
  await client.expectOk("environment.request", { repository: key, name: "acme/kit", request: { kind: "registry", version: "^1.0.0" } });
  await client.environment(key, mark, (state) => state.busy === null && holds(state, "acme/kit"));
  mark = client.mark();
  await client.expectOk("environment.request", { repository: key, name: "acme/tidy", request: { kind: "path", path: "tools/tidy" } });
  const installed = await client.environment(key, mark, (state) => state.busy === null && holds(state, "acme/kit") && holds(state, "acme/tidy"));
  assert.equal(installed.unexported, undefined, "the first folder took every export");
  for (const name of ["fmt", "lint", "tidy"]) {
    for (const folder of [".claude/skills", ".agents/skills"]) assert.ok(existsSync(join(first, folder, name, "SKILL.md")), `${folder}/${name}`);
  }

  // A second working folder, where the reader keeps a lint skill of
  // their own in the folder Codex, Gemini CLI, Kimi Code and OpenCode
  // read, and which lacks the path source.
  const second = gitFolder(join(dir, "second"));
  const theirs = join(second, ".agents", "skills", "lint");
  mkdirSync(theirs, { recursive: true });
  writeFileSync(join(theirs, "SKILL.md"), "the reader's own lint\n");
  // Rebound with no environment command: the pairing exports there and
  // broadcasts the state (environments-31, environments-17).
  mark = client.mark();
  await client.expectOk("project.rebind", { projectId: key, path: second });
  const paired = await client.environment(key, mark, (state) => state.busy === null && state.unexported !== undefined);
  for (const name of ["fmt", "lint"]) assert.ok(existsSync(join(second, ".claude", "skills", name, "SKILL.md")), `.claude/skills/${name}`);
  assert.ok(existsSync(join(second, ".agents", "skills", "fmt", "SKILL.md")), ".agents/skills/fmt");
  const exclude = (): string[] => readFileSync(join(second, ".git", "info", "exclude"), "utf8").split("\n");
  for (const line of ["/.claude/skills/fmt/", "/.claude/skills/lint/", "/.agents/skills/fmt/"]) assert.ok(exclude().includes(line), line);
  // The reader's folder stays byte for byte, out of Spex's exclude lines,
  // the path source this folder lacks is exported nowhere
  // (environments-8), and the state names both (environments-14).
  assert.equal(readFileSync(join(theirs, "SKILL.md"), "utf8"), "the reader's own lint\n");
  assert.ok(!exclude().includes("/.agents/skills/lint/"));
  assert.equal(existsSync(join(second, ".claude", "skills", "tidy")), false);
  assert.equal(existsSync(join(second, ".agents", "skills", "tidy")), false);
  assert.deepEqual(paired.unexported, { skipped: [{ name: "lint", folder: ".agents/skills" }], missing: ["acme/tidy"] });
  assert.equal(paired.packages.find((pkg) => pkg.name === "acme/tidy")?.missingPath, "tools/tidy");

  // The reader moves their folder away and copies the path source in:
  // an install exports both, and the state names nothing left out.
  renameSync(theirs, join(dir, "their-lint"));
  cpSync(join(first, "tools"), join(second, "tools"), { recursive: true });
  mark = client.mark();
  await client.expectOk("environment.install", { repository: key });
  const whole = await client.environment(key, mark, (state) => state.busy === null && state.unexported === undefined);
  assert.ok(holds(whole, "acme/tidy"), "the path source stands in the second folder");
  assert.match(readFileSync(join(second, ".agents", "skills", "lint", "SKILL.md"), "utf8"), /Lint the code\./);
  for (const folder of [".claude/skills", ".agents/skills"]) assert.ok(existsSync(join(second, folder, "tidy", "SKILL.md")), `${folder}/tidy`);
  assert.ok(exclude().includes("/.agents/skills/lint/"));

  // Rebound to a third working folder while the registry spec package's
  // installed files are gone: the pairing's read installs them
  // (environments-7) and the export follows into the folder with no
  // environment command sent (environments-31); the state names the
  // path source this folder lacks (environments-14).
  const clone = clonePath(core.dataDir, key);
  rmSync(join(clone, "packages", "acme", "kit"), { recursive: true, force: true });
  const third = gitFolder(join(dir, "third"));
  mark = client.mark();
  await client.expectOk("project.rebind", { projectId: key, path: third });
  const reinstalled = await client.environment(key, mark, (state) => state.busy === null && holds(state, "acme/kit") && state.unexported !== undefined);
  assert.ok(existsSync(join(clone, "packages", "acme", "kit", "skills", "en", "lint", "SKILL.md")), "the pairing installed the files again");
  for (const name of ["fmt", "lint"]) {
    for (const folder of [".claude/skills", ".agents/skills"]) assert.ok(existsSync(join(third, folder, name, "SKILL.md")), `third ${folder}/${name}`);
  }
  assert.deepEqual(reinstalled.unexported, { skipped: [], missing: ["acme/tidy"] });

  // Rebound to a fourth whose path source states another version, the
  // lock is stale there and nothing is exported: the state names
  // nothing the third folder's export left out (environments-14).
  const fourth = gitFolder(join(dir, "fourth"));
  await makeRelease(join(fourth, "tools", "tidy"), {
    format: 2, org: "acme", name: "tidy", version: "0.2.0",
    artifacts: { tidy: { kind: "skill", language: "en" } },
  }, { "skills/en/tidy/SKILL.md": skill("tidy", "Tidy up.") });
  mark = client.mark();
  await client.expectOk("project.rebind", { projectId: key, path: fourth });
  const elsewhere = await client.environment(key, mark, (state) => state.busy === null && state.stale !== null);
  assert.equal(elsewhere.unexported, undefined);
  assert.equal(existsSync(join(fourth, ".claude", "skills", "fmt")), false);
});

// ---------------------------------------------------------------------------
// environments-33: a spec package kept in your own group's clone
// ---------------------------------------------------------------------------

test("environments-33 through real cores: a skill your own group requests by a path in its clone exports at once, refuses paths that would not sync, and reaches a second home through the sync", { timeout: 240_000 }, async (t) => {
  const harness = createSpaceHarness();
  t.after(() => harness.dispose());
  const ownKey = `${OWN}/${OWN}-spex`;
  // Each home's agents read their own user home, Claude Code's and,
  // through Codex's home folder, the folder the other four share.
  const agentsHome = (name: string): string => {
    const dir = join(harness.scratch, `${name}-user`);
    for (const folder of [".claude", ".codex"]) mkdirSync(join(dir, folder), { recursive: true });
    return dir;
  };
  const userA = agentsHome("a");
  const userB = agentsHome("b");
  const a = await harness.startHome("own-path-a", { project: false, extra: { home: userA } });
  t.after(() => a.stop());
  const b = await harness.startHome("own-path-b", { project: false, env: harness.otherDevice("own-path-b"), extra: { home: userB } });
  t.after(() => b.stop());
  const cloneA = ownClone(a.dataDir);
  const cloneB = ownClone(b.dataDir);

  // Both homes' own groups share one spex repository before the request.
  const bare = harness.bareRepo();
  await a.client.expectOk("space.remote.set", { repository: ownKey, url: bare });
  assert.equal((await a.client.settle("space.sync", { repository: ownKey })).sync.phase, "done");
  await b.client.expectOk("space.remote.set", { repository: ownKey, url: bare });
  await harness.joinRemote(b, ownKey);
  assert.equal((await a.client.settle("space.sync", { repository: ownKey })).sync.phase, "done");

  const skill = (text: string): string => `---\nname: notes\ndescription: Keeps my notes.\n---\n\n${text}\n`;
  await makeRelease(join(cloneA, "mine", "notes"), {
    format: 2, org: OWN, name: "notes", version: "0.1.0", description: "My notes", license: "Apache-2.0",
    artifacts: { notes: { kind: "skill", language: "en" } },
  }, { "skills/en/notes/SKILL.md": skill("Write it down.") });
  const holds = (state: EnvironmentState): boolean => state.packages.some((pkg) => pkg.name === `${OWN}/notes` && pkg.installed);
  const settled = async (client: typeof a.client, check: (state: EnvironmentState) => boolean): Promise<EnvironmentState> => {
    const start = Date.now();
    for (;;) {
      const state = await client.expectOk("environment.get", { repository: ownKey });
      if (state.busy === null && check(state)) return state;
      if (Date.now() - start > 60_000) throw new Error(`the environment never settled: ${JSON.stringify(state)}`);
      await sleep(50);
    }
  };

  // Requested by its path in the clone: resolved in place, the lock
  // holding the path and no files, and exported at once.
  await a.client.expectOk("environment.request", { repository: ownKey, name: `${OWN}/notes`, request: { kind: "path", path: "mine/notes" } });
  const state = await settled(a.client, holds);
  assert.equal(state.pathRoot, cloneA, "your own group's paths are relative to its clone [environments-2]");
  const lock = parseYaml(readFileSync(join(cloneA, "spex.lock"), "utf8")) as Lock;
  assert.deepEqual(lock.packages[`${OWN}/notes`]?.source, { path: "mine/notes", version: "0.1.0", dependencies: {}, requires: {} });
  assert.deepEqual(lock.packages[`${OWN}/notes`]?.files, []);
  for (const folder of [".claude", ".agents"]) {
    assert.equal(readFileSync(join(userA, folder, "skills", "notes", "SKILL.md"), "utf8"), skill("Write it down."), folder);
  }
  // Edited in place: the next export carries the edit.
  writeFileSync(join(cloneA, "mine", "notes", "skills", "en", "notes", "SKILL.md"), skill("Write it down, then read it back."));
  await a.client.expectOk("environment.install", { repository: ownKey });
  await until(() => readFileSync(join(userA, ".agents", "skills", "notes", "SKILL.md"), "utf8") === skill("Write it down, then read it back."), 60_000, "the edit exported");
  assert.equal(readFileSync(join(userA, ".claude", "skills", "notes", "SKILL.md"), "utf8"), skill("Write it down, then read it back."));
  // Publishing reads the same folder by the same path.
  const preview = await a.client.expectOk("environment.publish", { repository: ownKey, path: "mine/notes", dryRun: true });
  assert.deepEqual(preview.preview, { name: `${OWN}/notes`, version: "0.1.0", files: ["meta.yaml", "skills/en/notes/SKILL.md"] });

  // A file added later that the sync would drop fails the next install
  // before anything is installed: the state names it, and the exports
  // stay as the last install left them (environments-32).
  const helper = join(cloneA, "mine", "notes", "skills", "en", "notes", "helper.bak");
  writeFileSync(helper, "a backup the sync drops");
  await a.client.expectOk("environment.install", { repository: ownKey });
  const failed = await settled(a.client, (s) => s.error !== null);
  assert.match(failed.error!, /mine\/notes holds mine\/notes\/skills\/en\/notes\/helper\.bak, which the clone's Git rules ignore, so it would not sync/, "[environments-32] the install refuses the folder [environments-14]");
  for (const folder of [".claude", ".agents"]) assert.equal(existsSync(join(userA, folder, "skills", "notes", "helper.bak")), false, `[environments-32] ${folder}: nothing of it exported`);
  rmSync(helper);
  await a.client.expectOk("environment.install", { repository: ownKey });
  await settled(a.client, (s) => s.error === null && holds(s));

  // Paired with a Git working folder holding another release at the
  // same path, your own group's paths stay relative to its clone.
  const working = join(harness.scratch, "own-working");
  gitFolder(working);
  await makeRelease(join(working, "mine", "notes"), {
    format: 2, org: OWN, name: "notes", version: "0.1.0", description: "My notes", license: "Apache-2.0",
    artifacts: { notes: { kind: "skill", language: "en" } },
  }, { "skills/en/notes/SKILL.md": skill("The working folder's copy.") });
  await a.client.expectOk("project.rebind", { projectId: ownKey, path: working });
  const pairedSkill = join(working, ".claude", "skills", "notes", "SKILL.md");
  await until(() => existsSync(pairedSkill), 60_000, "the pairing's export");
  assert.equal(readFileSync(pairedSkill, "utf8"), skill("Write it down, then read it back."), "[environments-8] the clone's bytes, not the working folder's");
  assert.equal((await settled(a.client, holds)).pathRoot, cloneA, "[environments-2] still the clone while paired [environments-14]");

  // A path that would not sync with the clone is refused before any write.
  symlinkSync(join(cloneA, "mine", "notes"), join(cloneA, "linked"));
  const skillRelease = async (path: string, id: string, extra: Record<string, string> = {}): Promise<void> => {
    await makeRelease(join(cloneA, ...path.split("/")), {
      format: 2, org: OWN, name: id, version: "0.1.0", artifacts: { [id]: { kind: "skill", language: "en" } },
    }, { [`skills/en/${id}/SKILL.md`]: `---\nname: ${id}\ndescription: ${id}.\n---\n`, ...extra });
  };
  await skillRelease("mine/scratchy", "scratchy", { "skills/en/scratchy/draft.tmp": "scratch" });
  // Forced into Git, a file of an ignored family is tracked, and still
  // never shared.
  await skillRelease("mine/forced", "forced", { "skills/en/forced/keep.tmp": "kept" });
  harness.git(cloneA, "add", "-f", "mine/forced/skills/en/forced/keep.tmp");
  // A Git repository of its own: the folder itself, or one inside it.
  await skillRelease("mine/repo", "repo");
  harness.git(join(cloneA, "mine", "repo"), "init", "-q");
  await skillRelease("mine/vendored", "vendored");
  gitFolder(join(cloneA, "mine", "vendored", "vendor"));
  // A link a script left under `node_modules/`, which no release reads.
  await skillRelease("mine/linky", "linky");
  mkdirSync(join(cloneA, "mine", "linky", "skills", "en", "linky", "node_modules", ".bin"), { recursive: true });
  symlinkSync("../../SKILL.md", join(cloneA, "mine", "linky", "skills", "en", "linky", "node_modules", ".bin", "tool"));
  const requests = readFileSync(join(cloneA, "spex.yaml"));
  const kept = /is a path Spex keeps in your own group's clone/;
  const refusals: [string, RegExp][] = [
    [".", /is not a folder below your own group's clone's root/],
    ["../elsewhere", /is not a relative folder inside the working folder or your own group's clone/],
    ...["config", "sessions", "intents", "authoring", "packages", "skills", "local", ".git", ".spex-uploads", "spex.yaml", "spex.lock", "project.json", ".gitignore", ".gitattributes", ".spex-apply.json", ".lockfoo"]
      .map((first): [string, RegExp] => [`${first}/notes`, kept]),
    // Compared without case after compatibility normalization.
    ["Sessions/notes", kept],
    ["\u017fkills/notes", kept],
    ["drafts.tmp", /the clone's Git rules ignore/],
    ["linked", /is reached through a link/],
    ["mine/repo", /mine\/repo: mine\/repo is a Git repository of its own, which the clone's sync does not carry/],
    ["mine/scratchy", /holds mine\/scratchy\/skills\/en\/scratchy\/draft\.tmp, which the clone's Git rules ignore/],
    ["mine/forced", /holds mine\/forced\/skills\/en\/forced\/keep\.tmp, which the clone's sync refuses to share/],
    ["mine/vendored", /mine\/vendored: mine\/vendored\/vendor is a Git repository of its own/],
    ["mine/linky", /mine\/linky: mine\/linky\/skills\/en\/linky\/node_modules\/\.bin\/tool is a link, which the clone's sync does not carry/],
  ];
  for (const [path, why] of refusals) {
    await a.client.expectError("environment.request", { repository: ownKey, name: `${OWN}/bad`, request: { kind: "path", path } }, "invalid_request", why);
    assert.ok(readFileSync(join(cloneA, "spex.yaml")).equals(requests), `${path}: spex.yaml keeps its bytes`);
  }
  rmSync(join(cloneA, "linked"));
  harness.git(cloneA, "rm", "-q", "--cached", "mine/forced/skills/en/forced/keep.tmp");
  for (const folder of ["scratchy", "forced", "repo", "vendored", "linky"]) rmSync(join(cloneA, "mine", folder), { recursive: true });

  // A tracked file only this device's excludes match still syncs, so its
  // folder is accepted (environments-32).
  await skillRelease("mine/logged", "logged", { "skills/en/logged/run.log": "a log kept on purpose" });
  harness.git(cloneA, "add", "mine/logged");
  mkdirSync(join(cloneA, ".git", "info"), { recursive: true });
  appendFileSync(join(cloneA, ".git", "info", "exclude"), "*.log\n");
  await a.client.expectOk("environment.request", { repository: ownKey, name: `${OWN}/logged`, request: { kind: "path", path: "mine/logged" } });
  const logged = await settled(a.client, (s) => s.error !== null || s.packages.some((pkg) => pkg.name === `${OWN}/logged` && pkg.installed));
  assert.equal(logged.error, null, "[environments-32] a tracked file is never ignored");
  await a.client.expectOk("environment.remove", { repository: ownKey, name: `${OWN}/logged` });
  await settled(a.client, (s) => s.error === null && !s.packages.some((pkg) => pkg.name === `${OWN}/logged`));
  harness.git(cloneA, "rm", "-q", "-r", "--cached", "mine/logged");
  rmSync(join(cloneA, "mine", "logged"), { recursive: true });

  // A path requested before its folder exists is accepted; once the
  // folder holds what the sync drops, a resolution refuses it, the lock
  // keeping its bytes (environments-32).
  await a.client.expectOk("environment.request", { repository: ownKey, name: `${OWN}/later`, request: { kind: "path", path: "mine/later" } });
  await settled(a.client, (s) => s.error !== null && /mine\/later/.test(s.error));
  const lockBytes = readFileSync(join(cloneA, "spex.lock"));
  await skillRelease("mine/later", "later", { "skills/en/later/draft.tmp": "scratch" });
  await a.client.expectOk("environment.resolve", { repository: ownKey });
  const refused = await settled(a.client, (s) => s.error !== null && /draft\.tmp/.test(s.error));
  assert.match(refused.error!, /mine\/later holds mine\/later\/skills\/en\/later\/draft\.tmp, which the clone's Git rules ignore, so it would not sync/, "[environments-32] the resolution refuses the folder [environments-5]");
  assert.ok(readFileSync(join(cloneA, "spex.lock")).equals(lockBytes), "[environments-5] spex.lock keeps its bytes");
  await a.client.expectOk("environment.remove", { repository: ownKey, name: `${OWN}/later` });
  await settled(a.client, (s) => s.error === null && !(`${OWN}/later` in s.requests) && holds(s));
  rmSync(join(cloneA, "mine", "later"), { recursive: true });

  // The sync carries the folder with the environment; the second home
  // installs and exports it as its own.
  assert.equal((await a.client.settle("space.sync", { repository: ownKey })).sync.phase, "done");
  const received = await b.client.settle("space.sync", { repository: ownKey });
  assert.equal(received.sync.phase, "done", JSON.stringify(received.sync));
  assert.ok(readFileSync(join(cloneB, "spex.lock")).equals(readFileSync(join(cloneA, "spex.lock"))), "the lock arrived");
  assert.ok(readFileSync(join(cloneB, "spex.yaml")).equals(readFileSync(join(cloneA, "spex.yaml"))), "the requests arrived");
  assert.equal(readFileSync(join(cloneB, "mine", "notes", "meta.yaml"), "utf8"), readFileSync(join(cloneA, "mine", "notes", "meta.yaml"), "utf8"));
  const there = await settled(b.client, holds);
  assert.equal(there.pathRoot, cloneB);
  for (const folder of [".claude", ".agents"]) {
    const exported = join(userB, folder, "skills", "notes", "SKILL.md");
    await until(() => existsSync(exported), 60_000, `${folder} on the second home`);
    assert.equal(readFileSync(exported, "utf8"), skill("Write it down, then read it back."), folder);
  }
});

// ---------------------------------------------------------------------------
// environments-33: unreadable entries cannot establish confinement
// ---------------------------------------------------------------------------

test("environments-33: a nonignored unreadable subtree refuses request, resolution and install, while ignored and missing folders retain their behavior", {
  timeout: 120_000,
  skip: process.platform === "win32" || process.getuid?.() === 0,
}, async (t) => {
  const dir = scratchDir("spex-own-path-unreadable-");
  const core = await startCore(dir, { hostUrl: UNREACHABLE });
  t.after(() => core.stop());
  const { client } = core;
  const key = `${OWN}/${OWN}-spex`;
  const clone = clonePath(core.dataDir, key);
  const packageDir = join(clone, "mine", "notes");
  await makeRelease(packageDir, {
    format: 2, org: OWN, name: "notes", version: "0.1.0",
    artifacts: { notes: { kind: "skill", language: "en" } },
  }, { "skills/en/notes/SKILL.md": "---\nname: notes\ndescription: My notes.\n---\n\nRead the notes.\n" });
  const hidden = join(packageDir, "node_modules");
  gitFolder(hidden);
  t.after(() => { if (existsSync(hidden)) chmodSync(hidden, 0o700); });
  const name = `${OWN}/notes`;
  const request = { kind: "path" as const, path: "mine/notes" };
  const requestsFile = join(clone, "spex.yaml");
  const lockFile = join(clone, "spex.lock");
  const before = [requestsFile, lockFile].map((file) => readFileSync(file));
  await client.expectError("environment.request", { repository: key, name, request }, "invalid_request", /mine\/notes\/node_modules is a Git repository of its own/);
  chmodSync(hidden, 0);
  assert.throws(() => readdirSync(hidden), (error: NodeJS.ErrnoException) => error.code === "EACCES", "the fixture is genuinely unreadable");
  const unreadable = /mine\/notes\/node_modules cannot be inspected to confirm it syncs with the clone/;
  await client.expectError("environment.request", { repository: key, name, request }, "invalid_request", unreadable);
  assert.deepEqual([requestsFile, lockFile].map((file) => readFileSync(file)), before, "[environments-32] refused requests write neither file");

  // The same unreadable subtree is harmless only once Git ignores it.
  const exclude = join(clone, ".git", "info", "exclude");
  const excludedBefore = readFileSync(exclude);
  appendFileSync(exclude, "\n/mine/notes/node_modules/\n");
  let from = client.mark();
  await client.expectOk("environment.request", { repository: key, name, request });
  await client.environment(key, from, (state) => state.busy === null && state.error === null && state.packages.some((pkg) => pkg.name === name && pkg.installed));
  const requested = readFileSync(requestsFile);
  const locked = readFileSync(lockFile);
  const exported = join(clone, "skills", "notes", "SKILL.md");
  const exportedBefore = readFileSync(exported);

  // A request already locked must be checked again by both operations,
  // without changing that lock or the last successful export.
  writeFileSync(exclude, excludedBefore);
  for (const type of ["environment.resolve", "environment.install"] as const) {
    from = client.mark();
    await client.expectOk(type, { repository: key });
    const failed = await client.environment(key, from, (state) => state.busy === null && state.error !== null);
    assert.match(failed.error!, unreadable, `[environments-32] ${type} names the unreadable subtree`);
    assert.deepEqual(readFileSync(requestsFile), requested);
    assert.deepEqual(readFileSync(lockFile), locked);
    assert.deepEqual(readFileSync(exported), exportedBefore, "[environments-7] the last export stays");
  }
  appendFileSync(exclude, "\n/mine/notes/node_modules/\n");
  from = client.mark();
  await client.expectOk("environment.install", { repository: key });
  await client.environment(key, from, (state) => state.busy === null && state.error === null);
  assert.deepEqual(readFileSync(exported), exportedBefore, "[environments-32] an ignored unreadable subtree is permitted");

  // A genuinely missing path is still admitted and reported missing by
  // resolution, rather than mistaken for an unreadable standing folder.
  from = client.mark();
  await client.expectOk("environment.request", { repository: key, name: `${OWN}/later`, request: { kind: "path", path: "mine/later" } });
  const missing = await client.environment(key, from, (state) => state.busy === null && state.error !== null);
  assert.match(missing.error!, /mine\/later is missing/);
  assert.doesNotMatch(missing.error!, /cannot be inspected/);
});

// ---------------------------------------------------------------------------
// playbook-library-109: engine links in your own group's clone stay out of its sync
// ---------------------------------------------------------------------------

test("playbook-library-109 through real cores: a playbook your own group keeps in its clone takes no engine link while the clone's exclude cannot list them, then takes engine links its clone's Git ignores, and both homes sync", { timeout: 240_000 }, async (t) => {
  const harness = createSpaceHarness();
  t.after(() => harness.dispose());
  const ownKey = `${OWN}/${OWN}-spex`;
  const a = await harness.startHome("own-links-a", { project: false });
  t.after(() => a.stop());
  const b = await harness.startHome("own-links-b", { project: false, env: harness.otherDevice("own-links-b") });
  t.after(() => b.stop());
  const cloneA = ownClone(a.dataDir);
  const cloneB = ownClone(b.dataDir);
  const bare = harness.bareRepo();
  await a.client.expectOk("space.remote.set", { repository: ownKey, url: bare });
  assert.equal((await a.client.settle("space.sync", { repository: ownKey })).sync.phase, "done");
  await b.client.expectOk("space.remote.set", { repository: ownKey, url: bare });
  await harness.joinRemote(b, ownKey);
  assert.equal((await a.client.settle("space.sync", { repository: ownKey })).sync.phase, "done");

  await makeRelease(join(cloneA, "mine", "walker"), {
    format: 2, org: OWN, name: "walker", version: "0.1.0", artifacts: { walk: { kind: "playbook", language: "en" } },
  }, { "playbooks/en/walk/walk.md": "# Walk\n\nRoles:\n\n- Walker\n", "playbooks/en/walk/walk.registry.mjs": "export default {};\n" });
  const linked = (clone: string): string[] => ["xstate", "@sublang/playbook"].map((name) => join(clone, "mine", "walker", "playbooks", "en", "walk", "node_modules", name));
  const engineLinked = (clone: string): boolean => linked(clone).every((link) => { try { return lstatSync(link).isSymbolicLink(); } catch { return false; } });
  const anyLink = (clone: string): boolean => linked(clone).some((link) => { try { lstatSync(link); return true; } catch { return false; } });

  // While the clone's `.git/info` is a file, its exclude cannot list the
  // engine links: the install fails with that cause and makes no link
  // (playbook-library-46).
  const info = join(cloneA, ".git", "info");
  const excludeFile = join(info, "exclude");
  const excludeBefore = existsSync(excludeFile) ? readFileSync(excludeFile) : null;
  rmSync(info, { recursive: true, force: true });
  writeFileSync(info, "not a folder\n");
  await a.client.expectOk("environment.request", { repository: ownKey, name: `${OWN}/walker`, request: { kind: "path", path: "mine/walker" } });
  const settledOwn = async (check: (state: EnvironmentState) => boolean): Promise<EnvironmentState> => {
    const start = Date.now();
    for (;;) {
      const state = await a.client.expectOk("environment.get", { repository: ownKey });
      if (state.busy === null && check(state)) return state;
      if (Date.now() - start > 60_000) throw new Error(`the environment never settled: ${JSON.stringify(state)}`);
      await sleep(50);
    }
  };
  const failed = await settledOwn((state) => state.error !== null || state.packages.some((pkg) => pkg.name === `${OWN}/walker` && pkg.installed));
  assert.match(failed.error ?? "", /\.git\/info\/exclude cannot list the engine links, so none is made/, "[playbook-library-46] the install fails with its cause");
  assert.equal(anyLink(cloneA), false, "[playbook-library-46] no engine link is made");

  // A folder again, the install links the folder.
  rmSync(info);
  mkdirSync(info);
  if (excludeBefore !== null) writeFileSync(excludeFile, excludeBefore);
  // A line the reader wrote in the clone's exclude stays beside Spex's block.
  appendFileSync(excludeFile, "scratch/\n");
  await a.client.expectOk("environment.install", { repository: ownKey });
  await until(() => engineLinked(cloneA), 60_000, "the engine links in the first clone");
  const exclude = readFileSync(join(cloneA, ".git", "info", "exclude"), "utf8").split("\n");
  assert.ok(exclude.includes("scratch/"), "[playbook-library-46] the reader's line stays");
  const begin = exclude.indexOf("# >>> spex engine links (managed by Spex; do not edit)");
  assert.ok(begin >= 0 && exclude[begin + 1] === ENGINE_LINKS_EXCLUDE && exclude[begin + 2] === "# <<< spex engine links", "[playbook-library-46] the clone's exclude lists the engine links in its managed block");
  const untracked = (clone: string): string[] => harness.git(clone, "status", "--porcelain", "--untracked-files=all", "--", "mine").split("\n").filter((line) => line.includes("node_modules"));
  assert.deepEqual(untracked(cloneA), [], "[playbook-library-46] Git reports no engine link");

  // The sync carries the folder and no link.
  const sent = await a.client.settle("space.sync", { repository: ownKey });
  assert.equal(sent.sync.phase, "done", JSON.stringify(sent.sync));
  const pushed = harness.git(bare, "ls-tree", "-r", "spex").split("\n");
  assert.ok(pushed.some((line) => line.endsWith("\tmine/walker/playbooks/en/walk/walk.md")), "the folder is pushed");
  assert.deepEqual(pushed.filter((line) => line.startsWith("120000 ") || line.startsWith("160000 ")), [], "[playbook-library-46] no link reaches the host");

  // The second home installs the lock its sync brings, links the folder
  // there, and syncs again with nothing of the links.
  const received = await b.client.settle("space.sync", { repository: ownKey });
  assert.equal(received.sync.phase, "done", JSON.stringify(received.sync));
  await until(() => engineLinked(cloneB), 60_000, "the engine links in the second clone");
  assert.deepEqual(untracked(cloneB), [], "[playbook-library-46] the second clone's Git reports no engine link");
  const again = await b.client.settle("space.sync", { repository: ownKey });
  assert.equal(again.sync.phase, "done", JSON.stringify(again.sync));
  assert.deepEqual(harness.git(bare, "ls-tree", "-r", "spex").split("\n").filter((line) => line.startsWith("120000 ") || line.startsWith("160000 ")), [], "[playbook-library-46] still no link on the host");
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
  assert.deepEqual(Object.keys(initial).sort(), ["busy", "conflicts", "error", "language", "packages", "pathRoot", "published", "repository", "requests", "stale"]);
  assert.equal(initial.pathRoot, project.path, "a project's paths are relative to its working folder (environments-2)");
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
  await client.waitFor((m) => m.type === "space.state" && rowsOf(m.state).some((repository) => repository.key === key && repository.sync.phase === "done"), 30_000, from);

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
    requests: parseRequests(peerRequests), requestsText: peerRequests, pathRoot: null, git: gitSource(join(peerHome, "cache")),
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
  // The home's instance is the front, which serves the stand-in's sign-in.
  await harness.signIn(home, host, front.url);
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
  const repo = `${host.gitOrigin}/${STANDIN_STORAGE}/acme/toolbox.git`;
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
  assert.ok(asked.some((request) => request.path.startsWith(`/git/${STANDIN_STORAGE}/acme/toolbox.git/`) && request.authorization), "the transport carried it");

  // Signed out, the registry is called with no bearer at all.
  from = home.client.mark();
  await home.client.expectOk("environment.remove", { repository: own, name: "acme/toolbox" });
  assert.equal((await ran(from)).error, null);
  await home.client.expectOk("space.signout", { instance: front.url });
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
function heldFetch(): { fetch: typeof fetch; arm(match: (path: string) => boolean, fail?: boolean): void; reached(): boolean; release(): void } {
  let matcher: ((path: string) => boolean) | undefined;
  let gate: Promise<void> | undefined;
  let open: (() => void) | undefined;
  let hit = false;
  // Where armed to fail, the held request is answered 503 once released.
  let failing = false;
  return {
    fetch: async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (matcher?.(url.pathname) && gate) {
        const wait = gate;
        const fail = failing;
        matcher = undefined;
        failing = false;
        hit = true;
        await wait;
        if (fail) return new Response("unavailable", { status: 503 });
      }
      return fetch(input, init);
    },
    arm(match, fail = false) { matcher = match; failing = fail; hit = false; gate = new Promise((resolve) => { open = resolve; }); },
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

test("environments-25: a request is admitted while another's resolution is held, an overtaken or obsolete resolution writes no lock and records no failure while its awaiting caller is refused, a resolve asked of a clone reads its files, and a stopped core starts no work", { timeout: 180_000 }, async (t) => {
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
    // lock and records no failure over the second's success.
    mark = client.mark();
    held.release();
    const idle = await client.environment(key, mark, (state) => state.busy === null);
    assert.equal(readFileSync(lockPath, "utf8"), lock, "the overtaken resolution wrote nothing");
    assert.equal(idle.error, null, "an overtaken resolution records no failure");
    assert.equal(idle.stale, null);
    assert.ok(["acme/slow", "acme/lint"].every((name) => idle.packages.some((pkg) => pkg.name === name && pkg.installed)));

    // spex.lock rewritten by hand during a held resolution, spex.yaml as
    // it was: the lock's own check refuses the write, and no failure is
    // recorded (environments-5).
    held.arm((path) => path === "/api/v1/packages/acme/slow");
    await client.expectOk("environment.resolve", { repository: key });
    await until(held.reached, 30_000, "the held resolution");
    const edited = `${lock}# edited by hand\n`;
    writeFileSync(lockPath, edited);
    mark = client.mark();
    held.release();
    const refused = await client.environment(key, mark, (state) => state.busy === null);
    assert.equal(readFileSync(lockPath, "utf8"), edited, "the hand-edited lock stands");
    assert.equal(refused.error, null);
    // The enabling path's awaited resolution, overtaken the same way, is
    // refused as its reply alone.
    held.arm((path) => path === "/api/v1/packages/acme/slow");
    const strict = managerOf(core).installNow(key, true, { lockWritten: false, installed: false });
    strict.catch(() => {});
    await until(held.reached, 30_000, "the held strict resolution");
    const rewritten = `${lock}# edited by hand again\n`;
    writeFileSync(lockPath, rewritten);
    held.release();
    await assert.rejects(strict, (error: unknown) => refusedWith("conflict")(error) && /spex\.lock changed meanwhile; retry$/.test((error as Error).message));
    assert.equal(readFileSync(lockPath, "utf8"), rewritten);
    assert.equal((await client.expectOk("environment.get", { repository: key })).error, null);

    // A resolution failing at the registry once spex.yaml changed under
    // it, after a later resolution succeeded, records nothing over it.
    held.arm((path) => path === "/api/v1/packages/acme/slow", true);
    await client.expectOk("environment.resolve", { repository: key });
    await until(held.reached, 30_000, "the held failing resolution");
    const requestsPath = join(clone, "spex.yaml");
    writeFileSync(requestsPath, `${readFileSync(requestsPath, "utf8")}# edited meanwhile\n`);
    mark = client.mark();
    await client.expectOk("environment.resolve", { repository: key });
    await client.environment(key, mark, (state) => state.stale === null && state.error === null && state.busy === "resolving");
    mark = client.mark();
    held.release();
    const outlived = await client.environment(key, mark, (state) => state.busy === null);
    assert.equal(outlived.error, null, "the obsolete failure is recorded nowhere");
    assert.equal(outlived.stale, null);
    assert.ok(["acme/slow", "acme/lint"].every((name) => outlived.packages.some((pkg) => pkg.name === name && pkg.installed)));

    // A resolution finding no solution once released, after a later
    // request's resolution failed on the files as they stand, leaves
    // that later failure standing (environments-5).
    held.arm((path) => path === "/api/v1/packages/acme/slow");
    await client.expectOk("environment.request", { repository: key, name: "acme/slow", request: { kind: "registry", version: "^2.0.0" } });
    await until(held.reached, 30_000, "the held unsolvable resolution");
    mark = client.mark();
    await client.expectOk("environment.request", { repository: key, name: "acme/local", request: { kind: "path", path: "missing-kit" } });
    const failed = await client.environment(key, mark, (state) => /missing-kit is missing/.test(state.error ?? "") && state.busy === "resolving");
    mark = client.mark();
    held.release();
    const kept = await client.environment(key, mark, (state) => state.busy === null);
    assert.equal(kept.error, failed.error, "the obsolete no-solution clears no later failure");
    assert.equal(kept.conflicts, null);
    // Back to requests that resolve.
    await client.expectOk("environment.remove", { repository: key, name: "acme/local" });
    mark = client.mark();
    await client.expectOk("environment.request", { repository: key, name: "acme/slow", request: { kind: "registry", version: "^1.0.0" } });
    await client.environment(key, mark, (state) => state.busy === null && state.error === null && state.conflicts === null
      && ["acme/slow", "acme/lint"].every((name) => state.packages.some((pkg) => pkg.name === name && pkg.installed)));

    // A clone whose lock and installed files go, asked to resolve,
    // resolves from its files as they stand and installs (environments-5).
    rmSync(lockPath);
    rmSync(join(clone, "packages"), { recursive: true, force: true });
    mark = client.mark();
    await client.expectOk("environment.resolve", { repository: key });
    const resettled = await client.environment(key, mark, (state) => state.busy === null && state.packages.some((pkg) => pkg.name === "acme/lint" && pkg.installed));
    assert.ok(existsSync(lockPath), "the lock is resolved again");
    assert.ok(["acme/slow", "acme/lint"].every((name) => resettled.packages.some((pkg) => pkg.name === name && pkg.installed)));
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

test("environments-21 through a real core: an install whose lock or requests changed during its held download publishes nothing and records no failure, one whose files change after its swap leaves the exports standing, a removed clone is not made again, and installed means installed as locked", { timeout: 180_000 }, async (t) => {
  const registry = await startStandinRegistry({ dir: scratchDir("spex-env-held-registry-") });
  t.after(() => registry.close());
  const kit = (version: string, files: Record<string, string>): Promise<void> => makeRelease(join(scratchDir("spex-env-held-release-"), "kit"), {
    format: 2, org: "acme", name: "kit", version, description: "Kit", license: "Apache-2.0",
    artifacts: { tidy: { kind: "skill", language: "en" } },
  }, files).then(async (releaseDir) => { await publishRelease(new RegistryClient({ url: registry.url }), releaseDir); });
  const skillMd = (body: string): string => `---\nname: tidy\ndescription: The tidy skill\n---\n\n${body}\n`;
  // Each later release holds a subset of the first's file names.
  await kit("1.0.0", { "skills/en/tidy/SKILL.md": skillMd("one"), "skills/en/tidy/notes.txt": "notes\n" });
  for (const [version, body] of [["1.1.0", "two"], ["1.2.0", "three"], ["1.3.0", "four"], ["1.4.0", "five"], ["1.5.0", "six"]] as const) await kit(version, { "skills/en/tidy/SKILL.md": skillMd(body) });
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
    assert.equal(state.error, null, "the overtaken install records no failure");

    // spex.yaml gone while its lock stands installed: the enabling path's
    // awaited install is refused, resolving again needed, never a success.
    rmSync(join(clone, "spex.yaml"));
    try {
      const progress = { lockWritten: false, installed: false };
      await assert.rejects(managerOf(core).installNow(key, false, progress), (error: unknown) =>
        refusedWith("invalid_request")(error) && /resolve again to install/.test((error as Error).message));
      assert.deepEqual(progress, { lockWritten: false, installed: false });
      assert.deepEqual(readFileSync(join(clone, "spex.lock")), lock);
      assert.equal((await client.expectOk("environment.get", { repository: key })).error, null, "the awaited refusal is its reply alone");
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
    assert.equal(state.error, null, "the overtaken install records no failure; the state reads stale");
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

    // The exports' own check (environments-7): an install the enabling
    // path awaits whose lock is rewritten, or whose install record is
    // removed, after its swap and before its exports — the progress
    // setter runs at that instant — is refused as changed meanwhile, the
    // exports standing as they were; the swapped-in files stay.
    const exports = [exported, join(clone, "skills", "tidy", "SKILL.md")];
    const exportsNow = (): [Buffer, number][] => exports.map((file) => [readFileSync(file), statSync(file).ino]);
    const exportsBefore = exportsNow();
    const afterSwap = (change: () => void): { lockWritten: boolean; installed: boolean } => {
      let installed = false;
      return {
        lockWritten: false,
        get installed() { return installed; },
        set installed(value: boolean) { installed = value; if (value) change(); },
      };
    };
    const manager = managerOf(core);
    await manager.ensureRequested(key, "acme/kit", { version: "1.1.0" });
    const lockRewritten = afterSwap(() => writeFileSync(join(clone, "spex.lock"), lock));
    await assert.rejects(manager.installNow(key, true, lockRewritten), (error: unknown) =>
      refusedWith("conflict")(error) && /spex\.lock changed meanwhile; retry$/.test((error as Error).message));
    assert.deepEqual([lockRewritten.lockWritten, lockRewritten.installed], [true, true]);
    assert.deepEqual(exportsNow(), exportsBefore, "the exports stand, byte for byte on the same inodes");
    assert.equal(installedVersion(), "1.1.0", "the swapped-in files stay");
    await manager.ensureRequested(key, "acme/kit", { version: "1.2.0" });
    const recordRemoved = afterSwap(() => rmSync(join(clone, "packages", ".spex-install.json")));
    await assert.rejects(manager.installNow(key, true, recordRemoved), (error: unknown) =>
      refusedWith("conflict")(error) && /packages changed meanwhile; retry$/.test((error as Error).message));
    assert.deepEqual([recordRemoved.lockWritten, recordRemoved.installed], [true, true]);
    assert.deepEqual(exportsNow(), exportsBefore, "the exports stand, byte for byte on the same inodes");
    assert.equal(installedVersion(), "1.2.0", "the swapped-in files stay");
    assert.equal((await client.expectOk("environment.get", { repository: key })).error, null, "a refusal awaited is recorded nowhere");

    // A download failing once released, after spex.yaml changed under it
    // and a later install succeeded, is an obsolete failure recorded
    // nowhere: the later installed state stands (environments-7).
    held.arm(download("1.4.0"), true);
    await client.expectOk("environment.request", { repository: key, name: "acme/kit", request: { kind: "registry", version: "1.4.0" } });
    await until(held.reached, 30_000, "the held failing download of 1.4.0");
    mark = client.mark();
    await client.expectOk("environment.request", { repository: key, name: "acme/kit", request: { kind: "registry", version: "1.2.0" } });
    await client.environment(key, mark, (current) => current.busy === "installing" && current.stale === null && current.error === null
      && kitOf(current)?.version === "1.2.0" && kitOf(current)?.installed === true);
    mark = client.mark();
    held.release();
    state = await client.environment(key, mark, (current) => current.busy === null);
    assert.equal(state.error, null, "the obsolete download failure is recorded nowhere");
    assert.deepEqual([kitOf(state)?.version, kitOf(state)?.installed, state.stale], ["1.2.0", true, null]);
    assert.equal(installedVersion(), "1.2.0");

    // A failure recorded by a held download failing once released, the
    // files unchanged meanwhile (environments-7).
    held.arm(download("1.5.0"), true);
    await client.expectOk("environment.request", { repository: key, name: "acme/kit", request: { kind: "registry", version: "1.5.0" } });
    await until(held.reached, 30_000, "the held failing download of 1.5.0");
    mark = client.mark();
    held.release();
    const failure = (await client.environment(key, mark, (current) => current.busy === null)).error;
    assert.match(failure ?? "", /acme\/kit/, "the failed download is recorded");
    // An awaited install succeeding while spex.yaml changes after its
    // swap is refused as changed meanwhile, the earlier failure standing;
    // its installed files and exports stand.
    const requestsPath = join(clone, "spex.yaml");
    const requestsChanged = afterSwap(() => writeFileSync(requestsPath, `${readFileSync(requestsPath, "utf8")}# edited after the swap\n`));
    await assert.rejects(manager.installNow(key, false, requestsChanged), (error: unknown) =>
      refusedWith("conflict")(error) && /spex\.yaml changed meanwhile; retry$/.test((error as Error).message));
    assert.deepEqual([requestsChanged.lockWritten, requestsChanged.installed], [false, true]);
    assert.equal((await client.expectOk("environment.get", { repository: key })).error, failure, "the earlier failure stands");
    assert.equal(installedVersion(), "1.5.0", "the installed files stand");
    assert.equal(readFileSync(exported, "utf8"), skillMd("six"), "the exports stand");
    // A stale report on files changed since is no outcome either: a path
    // source's manifest and spex.yaml rewritten once the lock is written
    // refuse the awaited install as changed meanwhile, never with the
    // stale reasons, the earlier failure standing.
    const local = skillRelease("acme", "local");
    const localDir = await makeRelease(join(dir, "project", "kits", "local"), local.manifest, local.files);
    await manager.ensureRequested(key, "acme/local", { path: "kits/local" });
    let lockWritten = false;
    const staleAfterLock = {
      get lockWritten() { return lockWritten; },
      set lockWritten(value: boolean) {
        lockWritten = value;
        if (!value) return;
        writeFileSync(join(localDir, "meta.yaml"), stringifyYaml({ ...local.manifest, version: "1.0.1" }));
        writeFileSync(requestsPath, `${readFileSync(requestsPath, "utf8")}# edited with the manifest\n`);
      },
      installed: false,
    };
    await assert.rejects(manager.installNow(key, true, staleAfterLock), (error: unknown) =>
      refusedWith("conflict")(error) && /spex\.yaml changed meanwhile; retry$/.test((error as Error).message));
    assert.deepEqual([staleAfterLock.lockWritten, staleAfterLock.installed], [true, false]);
    assert.equal((await client.expectOk("environment.get", { repository: key })).error, failure, "the earlier failure stands");
    // Back to the registry kit alone, settled.
    mark = client.mark();
    await client.expectOk("environment.remove", { repository: key, name: "acme/local" });
    await client.environment(key, mark, (current) => current.busy === null && current.error === null && !current.packages.some((pkg) => pkg.name === "acme/local"));

    // A clone removed while the download is held is never made again,
    // by the install or its exports. The request's own operation is
    // awaited to its end: a missing clone is announced nowhere and read
    // as not found.
    const original = manager.request;
    let done = undefined as Promise<void> | undefined;
    manager.request = async (...args) => {
      const admitted = await original.apply(manager, args);
      done = admitted.done;
      return admitted;
    };
    try {
      held.arm(download("1.3.0"));
      await client.expectOk("environment.request", { repository: key, name: "acme/kit", request: { kind: "registry", version: "1.3.0" } });
    } finally {
      manager.request = original;
    }
    assert.ok(done, "the request's operation was admitted");
    await until(held.reached, 30_000, "the held download of 1.3.0");
    rmSync(clone, { recursive: true, force: true });
    held.release();
    await done;
    assert.equal(existsSync(clone), false, "the install made no folder at the clone's address");
    assert.deepEqual(existsSync(join(core.dataDir, "cache", "staging")) ? readdirSync(join(core.dataDir, "cache", "staging")) : [], [], "no staged tree outlives the refusal");
    await client.expectError("environment.get", { repository: key }, "not_found");
    // A request or removal naming the clone gone is refused at once.
    await client.expectError("environment.request", { repository: key, name: "acme/kit", request: { kind: "registry", version: "1.0.0" } }, "not_found");
    await client.expectError("environment.remove", { repository: key, name: "acme/kit" }, "not_found");
    // The enabling path's strict steps are refused there, no folder made.
    await assert.rejects(manager.installNow(key, false, { lockWritten: false, installed: false }), refusedWith("not_found"));
    await assert.rejects(manager.ensureRequested(key, "acme/kit", { version: "1.0.0" }), refusedWith("not_found"));
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
    assert.equal(ended.error, null, "the held resolution, overtaken by the move, records no failure");
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
  const { instance } = await client.expectOk("draft.create", { projectId: project.id, draftId: "triage", org: OWN, license: "Apache-2.0" });
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

test("playbook-library-110: an authoring session whose spec package lies in your own group's clone enables in your own group's environment by its path there", { timeout: 180_000 }, async (t) => {
  const dir = scratchDir("spex-env-enable-own-");
  const core = await startCore(dir, { hostUrl: UNREACHABLE, script: authoringScript(), slc: stubSlcSource("['triager', 'verifier']") });
  t.after(() => core.stop());
  const { client } = core;
  const ownKey = `${OWN}/${OWN}-spex`;
  const clone = ownClone(core.dataDir);
  await settledProject(client, ownKey);

  // Your own group's spex repository paired with its own clone as its
  // working folder: an authoring session there makes its spec package
  // folder inside the clone.
  await client.expectOk("project.rebind", { projectId: ownKey, path: clone });
  const created = await client.expectOk("draft.create", { projectId: ownKey, draftId: "triage", org: OWN, license: "Apache-2.0" });
  const { instance } = created;
  assert.ok(instance, "the session's recorded instance");
  assert.equal(created.packagePath, "spex-packages/triage");
  assert.ok(existsSync(join(clone, "spex-packages", "triage", "meta.yaml")), "the spec package folder lies in the clone");
  await client.expectOk("draft.send", { projectId: ownKey, draftId: "triage", instance, text: "I want a playbook that triages new issues." });
  const latest = () => client.messages.filter((m) => m.type === "draft.state" && m.draft.id === "triage").map((m) => (m as { draft: CommandResults["draft.create"] }).draft).at(-1);
  await until(() => latest()?.activity === "idle" && latest()?.proposal !== undefined, 120_000, "the compiled proposal");

  // Enabled in your own group's environment by its path in the clone
  // (playbook-library-7).
  await client.expectOk("draft.register", { projectId: ownKey, draftId: "triage", instance, repository: ownKey,
    command: "triage", intent: "Label new issues", bindings: { Triager: "dev.triager", Verifier: "dev.coder" }, newPlayers: { "dev.triager": { adapter: "claude" } } });
  const requests = parseYaml(readFileSync(join(clone, "spex.yaml"), "utf8")) as { packages: Record<string, unknown> };
  assert.deepEqual(requests.packages[`${OWN}/triage`], { path: "spex-packages/triage" }, "[playbook-library-7] requested by its path in your own group's clone");
  const lock = parseYaml(readFileSync(join(clone, "spex.lock"), "utf8")) as Lock;
  assert.equal((lock.packages[`${OWN}/triage`]?.source as { path?: string } | undefined)?.path, "spex-packages/triage", "[playbook-library-7] resolved there");
  const own = parseYaml(readFileSync(core.configPath, "utf8")) as { playbooks: Record<string, unknown> };
  // Keyed by the roles the stub compile derived.
  assert.deepEqual(own.playbooks.triage, { roles: { triager: "dev.triager", verifier: "dev.coder" } }, "[playbook-library-7] enabled in your own group's config");
});


test("instance package sources keep transport locators out of state and broadcasts", { timeout: 180_000 }, async (t) => {
  const harness = createSpaceHarness();
  const homes: { stop(): Promise<void> }[] = [];
  t.after(async () => {
    // Stop every core before the harness removes its shared scratch:
    // restarted cores may still be publishing their startup host read.
    for (const home of [...homes].reverse()) await home.stop();
    await harness.dispose();
  });
  const host = await harness.startHost();
  const source = host.script.addRepository({ group: "acme", name: "toolbox" });
  const work = join(harness.scratch, "source");
  harness.git(harness.scratch, "clone", "-q", source.bare, work);
  const release = skillRelease("acme", "toolbox");
  await makeRelease(join(work, "pkg"), release.manifest, release.files);
  harness.git(work, "add", "-A");
  harness.git(work, "commit", "-q", "-m", "Release");
  harness.git(work, "push", "-q", "origin", "HEAD:main");
  const remote = `${host.gitOrigin}/${STANDIN_STORAGE}/acme/toolbox.git`;
  const home = await harness.startHome("source-display", { project: false, host });
  homes.push(home);
  const own = `${host.script.person.login}/${host.script.person.login}-spex`;
  const signed = home.client.mark();
  await harness.signIn(home, host);
  await home.client.waitRepository(signed, own, (row) => row.sync.phase === "done", 60_000);
  const mark = home.client.mark();
  await home.client.expectOk("environment.request", { repository: own, name: "acme/toolbox", request: { kind: "git", git: remote, rev: "main", path: "pkg" } });
  let state: EnvironmentState;
  const installDeadline = Date.now() + 30_000;
  for (;;) {
    assert.ok(Date.now() < installDeadline, "the synthetic install settles");
    state = await home.client.expectOk("environment.get", { repository: own });
    if (state.busy === null && state.packages.some((pkg) => pkg.name === "acme/toolbox" && pkg.installed)) break;
    if (state.busy === null && state.error) assert.fail(state.error);
    await sleep(15);
  }
  const instance = instanceOf(await home.client.expectOk("space.get", {}), host.url)?.displayName;
  assert.ok(instance);
  const commitPrefix = harness.git(work, "rev-parse", "HEAD").slice(0, 12);
  const safe = (value: unknown): void => {
    const text = JSON.stringify(value);
    assert.ok(!text.includes(host.gitOrigin), text);
    assert.ok(!text.includes(STANDIN_STORAGE), text);
    assert.ok(!text.includes("secret-user"), text);
    assert.ok(!text.includes("password"), text);
    assert.ok(!text.includes("secr@et"), text);
    assert.ok(!text.includes("secr ret"), text);
    assert.ok(!text.includes("ss@127."), text);
    assert.ok(!text.includes("pa%22ss"), text);
    assert.ok(!text.includes("backing-only-path"), text);
  };
  const summary = state.requests["acme/toolbox"] as unknown as Record<string, unknown>;
  assert.equal(summary.git, undefined, "a displayed request is not a reusable command input");
  assert.equal(summary.repository, instance);
  assert.equal(state.packages.find((pkg) => pkg.name === "acme/toolbox")?.source.detail, `${instance} ${commitPrefix} pkg`);
  safe(state);
  for (const message of home.client.messages.slice(mark)) if (message.type === "environment.state") safe(message.state);
  const clone = clonePath(home.dataDir, own);
  const requests = readFileSync(join(clone, "spex.yaml"));
  const locked = readFileSync(join(clone, "spex.lock"));
  const config = readFileSync(join(clone, "config/playbook.config.yaml"));
  assert.equal((parseYaml(requests.toString()) as { packages: Record<string, { git?: string }> }).packages["acme/toolbox"]?.git, remote);
  const lock = parseYaml(locked.toString()) as Lock;
  assert.deepEqual(lock.packages["acme/toolbox"]?.source, { git: remote, commit: harness.git(work, "rev-parse", "HEAD"), path: "pkg" });
  assert.deepEqual(readFileSync(join(clone, "packages/acme/toolbox/skills/en/toolbox-skill/SKILL.md")), Buffer.from(release.files["skills/en/toolbox-skill/SKILL.md"]!));
  // HTTP users are input bytes, never part of a summary; normalization
  // affects presentation alone, including an instance URL with a user.
  for (const [uri, label] of [
    [remote.replace("http://", "HTTP://secret-user:password@"), instance],
    ["https://secret-user:password@example.test/acme/toolbox.git", "https://example.test/acme/toolbox.git"],
    ["https://secret-user:secr@et@example.test/acme/toolbox.git", "https://example.test/acme/toolbox.git"],
    ["https://secret-user:secr ret@bad host/acme/toolbox.git", "the remote"],
    [work, work], [pathToFileURL(work).href, pathToFileURL(work).href],
  ] as const) {
    const text = stringifyYaml({ ...parseYaml(requests.toString()), packages: { "acme/toolbox": { git: uri, rev: "main" } } });
    const copied = structuredClone(lock);
    copied.packages["acme/toolbox"]!.source = { git: uri, commit: harness.git(work, "rev-parse", "HEAD") };
    writeFileSync(join(clone, "spex.yaml"), text);
    writeFileSync(join(clone, "spex.lock"), stringifyYaml(copied));
    const beforeLock = readFileSync(join(clone, "spex.lock"));
    state = await home.client.expectOk("environment.get", { repository: own });
    safe(state);
    assert.equal((state.requests["acme/toolbox"] as unknown as { repository: string }).repository, label);
    assert.equal(state.packages.find((pkg) => pkg.name === "acme/toolbox")?.source.detail, `${label} ${commitPrefix}`);
    assert.deepEqual(readFileSync(join(clone, "spex.yaml")), Buffer.from(text));
    assert.deepEqual(readFileSync(join(clone, "spex.lock")), beforeLock);
  }
  writeFileSync(join(clone, "spex.yaml"), requests);
  writeFileSync(join(clone, "spex.lock"), locked);
  const manager = (home.service as unknown as { environments: EnvironmentManager }).environments;
  const failure = async (name: string, request: { git: string; rev: string; path?: string }, extra: Record<string, unknown> = {}): Promise<void> => {
    const text = stringifyYaml({ ...parseYaml(requests.toString()), packages: { [name]: request, ...extra } });
    writeFileSync(join(clone, "spex.yaml"), text);
    const from = home.client.mark();
    await home.client.expectOk("environment.resolve", { repository: own });
    const deadline = Date.now() + 30_000;
    for (;;) {
      assert.ok(Date.now() < deadline, "the synthetic failed resolve settles");
      state = await home.client.expectOk("environment.get", { repository: own });
      if (state.busy === null && (state.error || state.conflicts)) break;
      await sleep(15);
    }
    safe(state);
    assert.ok(state.error || state.conflicts);
    await assert.rejects(manager.installNow(own, true, { lockWritten: false, installed: false }), (error: unknown) => {
      assert.ok(error instanceof CoreError);
      safe((error as Error).message);
      assert.ok(!(error as Error).message.includes("backing-only-path"));
      return true;
    });
    for (const message of home.client.messages.slice(from)) if (message.type === "environment.state") safe(message.state);
    assert.deepEqual(readFileSync(join(clone, "spex.yaml")), Buffer.from(text));
    assert.deepEqual(readFileSync(join(clone, "spex.lock")), locked, "failed resolution does not change the lock");
  };
  await failure("acme/toolbox", { git: remote, rev: "missing-rev", path: "pkg" });
  await failure("acme/toolbox", { git: remote, rev: "main", path: "missing" });
  await failure("acme/other", { git: remote, rev: "main", path: "pkg" });
  const needs = skillRelease("acme", "needs");
  await makeRelease(join(work, "needs"), { ...needs.manifest, dependencies: { "acme/toolbox": "^2.0.0" } }, needs.files);
  harness.git(work, "add", "-A");
  harness.git(work, "commit", "-q", "-m", "Add a dependent release");
  harness.git(work, "push", "-q", "origin", "HEAD:main");
  await failure("acme/toolbox", { git: remote, rev: "main", path: "pkg" }, { "acme/needs": { git: remote, rev: "main", path: "needs" } });
  assert.ok(state!.conflicts?.some((entry) => entry.name === "acme/toolbox" && entry.requirements.some((item) => item.requirement.includes(instance))));
  host.script.refuseTransport(`Denied ${remote}: backing-only-path`);
  await failure("acme/toolbox", { git: remote, rev: "main", path: "pkg" });
  const failed = state!.error;
  assert.ok(failed);
  writeFileSync(join(clone, "spex.yaml"), stringifyYaml({ format: 1, packages: { "acme/toolbox": { git: "https://example.test/new.git", rev: "main" } } }));
  assert.equal((await home.client.expectOk("environment.get", { repository: own })).error, failed, "a saved failure retains its original operation source after request edits");
  // Signed out, no origin has been read: even a real denied Git
  // transport cannot expose the backing locator in its unknown state.
  const unknown = await harness.startHome("source-unknown", { project: false, env: { SPEX_HOST_URL: UNREACHABLE } });
  homes.push(unknown);
  const unknownKey = `${OWN}/${OWN}-spex`;
  await unknown.client.expectOk("environment.request", { repository: unknownKey, name: "acme/toolbox", request: { kind: "git", git: remote, rev: "main", path: "pkg" } });
  let unknownState: EnvironmentState;
  const unknownDeadline = Date.now() + 30_000;
  for (;;) {
    assert.ok(Date.now() < unknownDeadline, "the synthetic unknown transport settles");
    unknownState = await unknown.client.expectOk("environment.get", { repository: unknownKey });
    if (unknownState.busy === null && unknownState.error) break;
    await sleep(15);
  }
  safe(unknownState);
  assert.doesNotMatch(unknownState.error!, /Share|Sign in|No longer shared/);
  await unknown.stop();
  host.script.refuseTransport(null);
  const external = createServer((_request, response) => { response.writeHead(418); response.end("Synthetic refusal"); });
  await new Promise<void>((done) => external.listen(0, "127.0.0.1", done));
  t.after(() => new Promise<void>((done) => external.close(() => done())));
  const externalPort = (external.address() as AddressInfo).port;
  await failure("acme/toolbox", { git: `http://secret-user:pa"ss@127.0.0.1:${externalPort}/tools.git`, rev: "main" });
  assert.match(state!.error!, /418/, "the real external Git refusal reached the unclassified stderr path");
  writeFileSync(join(clone, "spex.yaml"), requests);
  writeFileSync(join(clone, "spex.lock"), locked);
  // A restart has no reported origin yet; local reads do not discover it.
  await home.stop();
  const restarted = await harness.startHome("source-restart", { dataDir: home.dataDir, project: false, host });
  homes.push(restarted);
  const seen = host.script.requests.length;
  state = await restarted.client.expectOk("environment.get", { repository: own });
  safe(state);
  assert.equal((state.requests["acme/toolbox"] as unknown as { repository: string }).repository, "the remote");
  assert.equal(state.packages.find((pkg) => pkg.name === "acme/toolbox")?.source.detail, `the remote ${commitPrefix} pkg`);
  assert.equal(host.script.requests.length, seen, "environment.get does not read the host");
  const reading = restarted.client.mark();
  await restarted.client.expectOk("space.get", {});
  await restarted.client.waitSpace(reading, (view) => typeof instanceOf(view, host.url)?.readAt === "number");
  state = await restarted.client.expectOk("environment.get", { repository: own });
  assert.equal((state.requests["acme/toolbox"] as unknown as { repository: string }).repository, instance);
  assert.deepEqual(readFileSync(join(clone, "spex.yaml")), requests);
  assert.deepEqual(readFileSync(join(clone, "spex.lock")), locked);
  assert.deepEqual(readFileSync(join(clone, "config/playbook.config.yaml")), config);
});
