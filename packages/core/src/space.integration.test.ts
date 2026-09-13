// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Core coverage of the Space surface (space-37, space-38, space-39):
// real cores with substitute agents on scratch homes whose configuration
// lies inside them, a bare repository standing in for origin, an
// isolated Git configuration through the core's environment, a sleeping
// GIT_SSH_COMMAND for the transport limit and Stop, and two homes
// syncing through one remote — hermetic, no network, no credentials.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { WebSocket } from "ws";
import { createSessionStore } from "@sublang/playbook/session-store";
import { CoreService, type CoreServiceOptions } from "./service.js";
import { fakeAdapterImports } from "./testing/fake-adapter.js";
import { createScriptedCaptain } from "./testing/scripted-captain.js";
import { seedHistorySession } from "./testing/demo.js";
import { prepareStorageGitFiles } from "./storage-git.js";
import type { LineSpawner } from "./compile.js";
import type { Command, CommandResults, ServerMessage, SpaceState, SpaceStateMessage, SyncStep, SpaceOp } from "./protocol.js";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const scratch = mkdtempSync(join(tmpdir(), "spex-space-"));
const userHome = join(scratch, "home");
mkdirSync(userHome, { recursive: true });

const config = (model: string): string => `captain:
  adapter: claude
  model: ${model}
players:
  dev.coder:
    adapter: claude
    model: ${model}
playbooks:
  code:
    from: "@sublang/playbook/code/registry"
    roles:
      coder: dev.coder
`;

/** The test's own Git: isolated config and a fixed identity. */
const peerEnv = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "Peer", GIT_AUTHOR_EMAIL: "peer@example.test", GIT_COMMITTER_NAME: "Peer", GIT_COMMITTER_EMAIL: "peer@example.test", LC_ALL: "C" };
const git = (cwd: string, ...args: string[]): string => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", env: peerEnv, stdio: ["ignore", "pipe", "pipe"] }).trim();

/** The core's environment: PATH, a scratch HOME, and Git configured only
 * through it — no identity by default, so the fallback engages (space-4). */
function coreEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? "",
    HOME: userHome,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "user.useConfigOnly",
    GIT_CONFIG_VALUE_0: "true",
    ...extra,
  };
}

function bareRepo(): string {
  const dir = mkdtempSync(join(scratch, "bare-"));
  git(dir, "init", "-q", "--bare", "-b", "main");
  return dir;
}

function sleepingSsh(): { script: string; pidFile: string } {
  const script = join(scratch, `sleep-ssh-${randomUUID().slice(0, 8)}.sh`);
  const pidFile = `${script}.pid`;
  writeFileSync(script, `#!/bin/sh\necho $$ > "${pidFile}"\nexec sleep 300\n`);
  chmodSync(script, 0o755);
  return { script, pidFile };
}

class Client {
  private readonly socket: WebSocket;
  readonly messages: ServerMessage[] = [];
  private nextId = 0;
  constructor(port: number) {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/?token=test`);
    this.socket.on("message", (data) => { this.messages.push(JSON.parse(String(data)) as ServerMessage); });
  }
  async open(): Promise<void> {
    await new Promise<void>((resolveOpen, reject) => {
      if (this.socket.readyState === WebSocket.OPEN) { resolveOpen(); return; }
      this.socket.once("open", resolveOpen);
      this.socket.once("error", reject);
    });
    await this.waitFor((m) => m.type === "hello");
  }
  close(): void { this.socket.close(); }
  async command<T extends Command["type"]>(type: T, fields: Omit<Extract<Command, { type: T }>, "type" | "id">): Promise<{ ok: true; result: CommandResults[T] } | { ok: false; error: { code: string; message: string } }> {
    const id = `c${(this.nextId += 1)}`;
    this.socket.send(JSON.stringify({ type, id, ...fields }));
    const reply = await this.waitFor((m) => m.type === "reply" && m.id === id, 30_000);
    if (reply.type !== "reply") throw new Error("unreachable");
    return reply.ok ? { ok: true, result: reply.result as CommandResults[T] } : { ok: false, error: reply.error };
  }
  async expectOk<T extends Command["type"]>(type: T, fields: Omit<Extract<Command, { type: T }>, "type" | "id">): Promise<CommandResults[T]> {
    const reply = await this.command(type, fields);
    if (!reply.ok) throw new Error(`${type} failed: ${reply.error.code} ${reply.error.message}`);
    // The state-shaped replies carry the SpaceState shape (space-30).
    if (type === "space.get" || type === "space.init" || type === "space.remote.set") assertSpaceState(reply.result as SpaceState);
    return reply.result;
  }
  async expectError<T extends Command["type"]>(type: T, fields: Omit<Extract<Command, { type: T }>, "type" | "id">, code: string, pattern?: RegExp): Promise<string> {
    const reply = await this.command(type, fields);
    assert.ok(!reply.ok, `${type} must fail ${code}`);
    assert.equal(reply.error.code, code, `${type}: ${reply.error.message}`);
    if (pattern) assert.match(reply.error.message, pattern);
    return reply.error.message;
  }
  async waitFor(check: (message: ServerMessage) => boolean, timeoutMs = 10_000): Promise<ServerMessage> {
    const start = Date.now();
    for (;;) {
      const found = this.messages.find(check);
      if (found) return found;
      if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting; got ${JSON.stringify(this.messages.slice(-12).map((m) => m.type === "space.state" ? `space.state:${JSON.stringify(m.state.sync)}` : m.type))}`);
      await sleep(10);
    }
  }
  /** The first space.state message at or after `from` matching `check`. */
  async waitSpace(from: number, check: (state: SpaceState) => boolean, timeoutMs = 20_000): Promise<SpaceState> {
    const start = Date.now();
    for (;;) {
      for (let i = from; i < this.messages.length; i += 1) {
        const message = this.messages[i];
        if (message.type !== "space.state") continue;
        assertSpaceState(message.state);
        if (check(message.state)) return message.state;
      }
      if (Date.now() - start > timeoutMs) {
        const seen = this.messages.slice(from).filter((m): m is SpaceStateMessage => m.type === "space.state").map((m) => JSON.stringify(m.state.sync));
        throw new Error(`timeout waiting for space state; saw ${seen.join(" | ")}`);
      }
      await sleep(10);
    }
  }
  /** Run a long Space command — it replies accepted at once (space-29) —
   * and wait until the machine leaves running. */
  async settle<T extends "space.sync" | "space.fetch">(type: T, fields: Omit<Extract<Command, { type: T }>, "type" | "id">): Promise<SpaceState> {
    const from = this.messages.length;
    assert.deepEqual(await this.expectOk(type, fields), { accepted: true });
    return this.waitSpace(from, (state) => state.sync.phase !== "running");
  }
  mark(): number { return this.messages.length; }
}

function sleep(ms: number): Promise<void> { return new Promise((resolveSleep) => setTimeout(resolveSleep, ms)); }

const SPACE_KEYS = ["conflicts", "diagnostics", "git", "home", "incoming", "lastSync", "local", "outside", "repository", "sync"];
const REPOSITORY_KEYS = ["ahead", "behind", "branch", "checkedAt", "identityFallback", "mergePending", "remote", "remoteEmpty", "unrelated", "upstream"];
const PHASES = new Set(["idle", "running", "choices", "unrelated", "stopped", "done"]);
const CHANGES = new Set(["new", "updated", "deleted"]);

/** Every reply and broadcast carries the SpaceState shape (space-30). */
function assertSpaceState(state: SpaceState): void {
  assert.deepEqual(Object.keys(state).sort(), SPACE_KEYS);
  assert.ok(PHASES.has(state.sync.phase), `phase ${JSON.stringify(state.sync)}`);
  assert.ok(typeof state.home === "string" && Array.isArray(state.outside) && Array.isArray(state.diagnostics));
  if (state.repository !== null) assert.deepEqual(Object.keys(state.repository).sort(), REPOSITORY_KEYS);
  for (const unit of [...state.local, ...state.incoming, ...state.conflicts.map((c) => c.unit)]) {
    assert.ok(typeof unit.unit === "string" && typeof unit.label === "string" && CHANGES.has(unit.change) && Array.isArray(unit.paths) && typeof unit.diff === "boolean", JSON.stringify(unit));
  }
  for (const conflict of state.conflicts) {
    assert.ok(CHANGES.has(conflict.mine.change) && CHANGES.has(conflict.remote.change), JSON.stringify(conflict));
  }
  if (state.lastSync !== null) assert.deepEqual(Object.keys(state.lastSync).sort(), ["at", "received", "sent"]);
}

/** The pid the sleeping GIT_SSH_COMMAND wrote once Git spawned it. */
async function sleeperPid(pidFile: string): Promise<number> {
  for (let i = 0; i < 400; i += 1) {
    if (existsSync(pidFile)) {
      const pid = Number.parseInt(readFileSync(pidFile, "utf8").trim(), 10);
      if (pid > 0) return pid;
    }
    await sleep(25);
  }
  throw new Error(`the sleeping transport never started (${pidFile})`);
}

/** Join a freshly initialized home to the remote: the first sync ends
 * unrelated, the join asks for any conflict, "mine" answers each. */
async function joinRemote(home: Home): Promise<SpaceState> {
  const unrelated = await home.client.settle("space.sync", {});
  assert.equal(unrelated.sync.phase, "unrelated", JSON.stringify(unrelated.sync));
  let joined = await home.client.settle("space.sync", { join: true });
  if (joined.sync.phase === "choices") {
    joined = await home.client.settle("space.sync", { join: true, choices: Object.fromEntries(joined.conflicts.map((c) => [c.unit.unit, "mine" as const])) });
  }
  assert.equal(joined.sync.phase, "done", JSON.stringify(joined.sync));
  return joined;
}

interface Home {
  service: CoreService;
  client: Client;
  dataDir: string;
  projectDir: string;
  configPath: string;
  hooks: { beforeStep?: (event: { op: SpaceOp; step: SyncStep }) => void | Promise<void> };
  stop(): Promise<void>;
}

/** Compile spawner whose slc run hangs until its signal aborts. */
function hangingCompileSpawner(): LineSpawner {
  return (_command, args, _cwd, onLine, signal) => {
    if (args[0] === "--version") { onLine("v24.0.0"); return Promise.resolve(0); }
    onLine("slc: working");
    return new Promise((_resolveRun, reject) => {
      const abort = (): void => reject(new Error("The operation was aborted"));
      if (signal?.aborted) { abort(); return; }
      signal?.addEventListener("abort", abort, { once: true });
    });
  };
}

const COMPILE_INPUT = {
  playbookId: "demo",
  sourceText: "# Demo\n\nA one-player demo workflow.\n",
  roles: ["helper"],
  command: "demo",
  intent: "demo workflow for tests",
  bindings: { helper: "dev.helper" },
  newPlayers: { "dev.helper": { adapter: "claude" as const } },
};

/** A real core on a scratch home whose configuration lies inside it. */
async function startHome(name: string, options: { model?: string; env?: Record<string, string>; dataDir?: string; project?: boolean; extra?: Partial<CoreServiceOptions> } = {}): Promise<Home> {
  const dataDir = options.dataDir ?? mkdtempSync(join(scratch, `${name}-`));
  const configPath = join(dataDir, "playbook", "playbook.config.yaml");
  if (!existsSync(configPath)) { mkdirSync(join(dataDir, "playbook"), { recursive: true }); writeFileSync(configPath, config(options.model ?? "claude-test")); }
  const projectDir = join(scratch, `${name}-project-${randomUUID().slice(0, 8)}`);
  if (options.project !== false) { mkdirSync(projectDir); git(projectDir, "init", "-q"); }
  const { imports } = fakeAdapterImports({
    rules: [
      { match: "route:", response: { result: '{"decision":"dispatch"}' } },
      { match: "slow:", response: { deltas: ["working"], result: "slow done", delayMs: 1_500 } },
    ],
    fallback: { deltas: ["hello ", "world"], result: "hello world" },
  });
  const captain = createScriptedCaptain(async (turn, context, session) => {
    await session.emitStatus(`◇ turn ${turn.id}`);
    await context.callCaptain(`route: ${turn.prompt}`, { visibility: "hidden" });
    await context.callPlayer("dev.coder", `${turn.prompt}`);
    await context.emitReply("Finished the scripted turn.");
  });
  const hooks: Home["hooks"] = {};
  const service = await CoreService.start({
    token: "test",
    configPath,
    dataDir,
    adapterImports: imports,
    adapterRuntime: () => ({ usable: true }),
    captainFactory: async () => captain,
    env: coreEnv(options.env),
    home: userHome,
    watchConfig: false,
    spaceTransportTimeoutMs: 500,
    spaceBeforeStep: (event) => hooks.beforeStep?.(event),
    ...(options.extra ?? {}),
  });
  const client = new Client(service.port());
  await client.open();
  let stopped = false;
  return {
    service, client, dataDir, projectDir, configPath, hooks,
    async stop() {
      if (stopped) return;
      stopped = true;
      client.close();
      await service.stop();
    },
  };
}

/** Run one scripted turn in a session and wait for the runtime's release. */
async function runTurn(home: Home, projectId: string, text: string, sessionId?: string): Promise<string> {
  const id = sessionId ?? (await home.client.expectOk("session.create", { projectId })).id;
  const before = (await home.client.expectOk("session.list", {})).find((s) => s.id === id)?.turns ?? 0;
  await home.client.expectOk("turn.submit", { sessionId: id, text });
  await home.client.waitFor((m) => m.type === "session.state" && m.session.id === id && !m.session.live && (m.session.turns ?? 0) > before, 20_000);
  return id;
}

/** Every home file except Git data and lease coordination, as path → bytes. */
function snapshot(dir: string): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === ".git" || /^\.lock|\.lock(?:\.|$)/.test(entry.name)) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.set(relative(dir, full), readFileSync(full));
    }
  };
  walk(dir);
  return out;
}

/** A peer working copy of the bare remote, committing as plain Git. */
function peerClone(bare: string): string {
  const dir = mkdtempSync(join(scratch, "peer-"));
  git(dir, "clone", "-q", bare, ".");
  return dir;
}
async function peerPush(dir: string, mutate: (dir: string) => void | Promise<void>): Promise<string> {
  git(dir, "fetch", "-q", "origin");
  git(dir, "reset", "-q", "--hard", "origin/main");
  await mutate(dir);
  git(dir, "add", "-A", "--", ".");
  git(dir, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "peer change");
  git(dir, "push", "-q", "origin", "HEAD:main");
  return git(dir, "rev-parse", "HEAD");
}

const turnRecords = (prompt: string, turnId: number, at = Date.now()): Record<string, unknown>[] => [
  { type: "turn_started", turnId, turn: { id: turnId, prompt }, timestamp: at },
  { type: "turn_finished", turnId, timestamp: at + 1 },
];

test.after(() => rmSync(scratch, { recursive: true, force: true }));

// ---------------------------------------------------------------------------
// space-37: setup and the first sync
// ---------------------------------------------------------------------------

test("space-37: a fresh home reads no repository, and the git guidance without git", async (t) => {
  const home = await startHome("fresh");
  t.after(() => home.stop());
  const state = await home.client.expectOk("space.get", {});
  assert.equal(state.repository, null);
  assert.ok(state.git.ok);
  assert.equal(state.home, home.dataDir);
  assert.deepEqual(state.outside, []);
  assert.equal(state.lastSync, null);
  assert.equal(state.sync.phase, "idle");
  const empty = mkdtempSync(join(scratch, "nogit-"));
  const bare = await startHome("nogit", { env: { PATH: empty } });
  t.after(() => bare.stop());
  const without = await bare.client.expectOk("space.get", {});
  assert.equal(without.git.ok, false);
  assert.match((without.git as { guidance: string }).guidance, /Git is not installed/);
  assert.equal(without.repository, null);
});

test("space-37: space.init refuses a blocking diagnostic and an incomplete migration, creating nothing", async (t) => {
  const damaged = mkdtempSync(join(scratch, "damaged-"));
  mkdirSync(join(damaged, "intents"), { recursive: true });
  const projectId = randomUUID();
  writeFileSync(join(damaged, "intents", `${projectId}.jsonl`), "{not json\n");
  const home = await startHome("damaged", { dataDir: damaged });
  t.after(() => home.stop());
  const refusal = await home.client.expectError("space.init", {}, "invalid_request", new RegExp(`${projectId}\\.jsonl`));
  assert.ok(refusal.length > 0);
  assert.equal(existsSync(join(damaged, ".git")), false);

  const partial = mkdtempSync(join(scratch, "partial-"));
  const receiptDir = join(partial, "local", "migrations", randomUUID());
  mkdirSync(join(receiptDir, "inputs"), { recursive: true });
  writeFileSync(join(receiptDir, "inputs", "0"), "{}");
  writeFileSync(join(receiptDir, "receipt.json"), JSON.stringify({ v: 1, id: basename(receiptDir), inputs: [{ path: join(partial, "x.json"), sha256: "00" }], complete: false }));
  const second = await startHome("partial", { dataDir: partial });
  t.after(() => second.stop());
  await second.client.expectError("space.init", {}, "invalid_request", /receipt\.json/);
  assert.equal(existsSync(join(partial, ".git")), false);
});

test("space-37: a clean init commits only portable files with the managed rules and the fallback identity", async (t) => {
  const home = await startHome("init");
  t.after(() => home.stop());
  const project = await home.client.expectOk("project.register", { path: home.projectDir });
  const sessionId = await runTurn(home, project.id, "First work");
  writeFileSync(join(home.dataDir, "sessions", `${sessionId}.hints.json`), "{}");
  await home.client.expectOk("session.viewed", { sessionId, turnId: 1 });
  const from = home.client.mark();
  const state = await home.client.expectOk("space.init", {});
  assert.equal(state.repository?.branch, "main");
  assert.equal(state.repository?.remote, null);
  assert.equal(state.repository?.identityFallback, true);
  assert.equal(state.lastSync, null);
  assert.equal(state.sync.phase, "idle");
  await home.client.waitSpace(from, (s) => s.repository?.branch === "main");
  const tracked = git(home.dataDir, "ls-files").split("\n");
  assert.ok(tracked.includes(".gitignore") && tracked.includes(".gitattributes"));
  assert.ok(tracked.includes("playbook/playbook.config.yaml"));
  assert.ok(tracked.includes(`sessions/${sessionId}.json`) && tracked.includes(`sessions/${sessionId}.records.jsonl`));
  for (const file of tracked) {
    assert.doesNotMatch(file, /^local\/|^prefs\.json$|^meta\.json$|\.hints\.json$|\.lock/, `must not track ${file}`);
  }
  assert.match(readFileSync(join(home.dataDir, ".gitignore"), "utf8"), /# BEGIN Spex managed storage rules/);
  assert.equal(git(home.dataDir, "log", "-1", "--format=%cn <%ce>"), `Spex <spex@${execFileSync("hostname", { encoding: "utf8" }).trim()}>`);
  assert.equal(git(home.dataDir, "rev-list", "--count", "HEAD"), "1");
  await home.client.expectError("space.init", {}, "invalid_request", /already a repository/);
});

test("space-37: the remote row accepts the bare path, refuses malformed and credentialed URLs, and clears the check", async (t) => {
  const home = await startHome("remote");
  t.after(() => home.stop());
  await home.client.expectError("space.remote.set", { url: "/tmp/x" }, "invalid_request", /Initialize the repository first/);
  await home.client.expectOk("space.init", {});
  const bare = bareRepo();
  const set = await home.client.expectOk("space.remote.set", { url: bare });
  assert.equal(set.repository?.remote, bare);
  assert.equal(git(home.dataDir, "remote", "get-url", "origin"), bare);
  for (const [url, pattern] of [["", /malformed/], ["  ", /malformed/], ["git@example.com:a b.git", /malformed/], ["https://user:secret@example.com/x.git", /credential/]] as const) {
    await home.client.expectError("space.remote.set", { url }, "invalid_request", pattern);
    assert.equal(git(home.dataDir, "remote", "get-url", "origin"), bare, `origin unchanged after ${JSON.stringify(url)}`);
  }
  const checked = await home.client.settle("space.fetch", {});
  assert.equal(checked.sync.phase, "idle");
  assert.equal(typeof checked.repository?.checkedAt, "number");
  assert.equal(checked.repository?.remoteEmpty, true);
  const other = bareRepo();
  const changed = await home.client.expectOk("space.remote.set", { url: other });
  assert.equal(changed.repository?.checkedAt, null);
  assert.equal(changed.repository?.ahead, null);
  assert.equal(changed.repository?.remote, other);
  const cleared = await home.client.expectOk("space.remote.set", { url: null });
  assert.equal(cleared.repository?.remote, null);
  await home.client.expectError("space.sync", {}, "invalid_request", /Add a remote first/);
});

test("space-37: the first sync pushes main to the empty remote, sets the upstream and records space:lastSync", async (t) => {
  const home = await startHome("first-push");
  t.after(() => home.stop());
  const project = await home.client.expectOk("project.register", { path: home.projectDir });
  await runTurn(home, project.id, "Push me");
  await home.client.expectOk("space.init", {});
  const bare = bareRepo();
  await home.client.expectOk("space.remote.set", { url: bare });
  const done = await home.client.settle("space.sync", {});
  assert.equal(done.sync.phase, "done", JSON.stringify(done.sync));
  assert.ok(done.sync.phase === "done" && done.sync.pushed);
  assert.ok(done.sync.phase === "done" && done.sync.sent > 0);
  assert.equal(git(bare, "rev-parse", "main"), git(home.dataDir, "rev-parse", "main"));
  assert.equal(git(home.dataDir, "config", "--get", "branch.main.remote"), "origin");
  assert.equal(done.repository?.upstream, true);
  assert.equal(done.repository?.ahead, 0);
  assert.equal(done.repository?.behind, 0);
  const prefs = JSON.parse(readFileSync(join(home.dataDir, "prefs.json"), "utf8")) as { prefs: Record<string, { at: number; sent: number; received: number }> };
  assert.equal(typeof prefs.prefs["space:lastSync"].at, "number");
  assert.equal(prefs.prefs["space:lastSync"].sent, done.sync.sent);
  assert.deepEqual(done.lastSync, prefs.prefs["space:lastSync"]);
  assert.deepEqual(done.local, []);
  const again = await home.client.settle("space.sync", {});
  assert.ok(again.sync.phase === "done" && !again.sync.pushed && again.sync.sent === 0 && again.sync.received === 0, JSON.stringify(again.sync));
  // A fresh home's Join against an empty remote — init with the remote,
  // then a joining sync — completes as a first push (space-6).
  const joiner = await startHome("joiner");
  t.after(() => joiner.stop());
  const empty = bareRepo();
  const initialized = await joiner.client.expectOk("space.init", { remote: empty });
  assert.equal(initialized.repository?.remote, empty);
  assert.equal(initialized.repository?.checkedAt, null);
  const first = await joiner.client.settle("space.sync", { join: true });
  assert.ok(first.sync.phase === "done" && first.sync.pushed && first.sync.sent > 0 && first.sync.received === 0, JSON.stringify(first.sync));
  assert.equal(first.repository?.remoteEmpty, false);
  assert.equal(git(empty, "rev-parse", "main"), git(joiner.dataDir, "rev-parse", "main"));
});

test("space-37: a turn in flight, an out-of-band lease and a running compile refuse space.sync and space.init by name", async (t) => {
  const home = await startHome("blockers", { env: { SPEX_SLC: "fake-slc" }, extra: { compileSpawner: hangingCompileSpawner() } });
  t.after(() => home.stop());
  const project = await home.client.expectOk("project.register", { path: home.projectDir });
  const sessionId = await runTurn(home, project.id, "Settle first");
  await home.client.expectOk("space.init", {});
  const bare = bareRepo();
  await home.client.expectOk("space.remote.set", { url: bare });
  await home.client.settle("space.sync", {});
  // A turn in flight.
  await home.client.expectOk("turn.submit", { sessionId, text: "slow: keep going" });
  await home.client.waitFor((m) => m.type === "session.state" && m.session.id === sessionId && m.session.turnActive === true);
  await home.client.expectError("space.sync", {}, "busy", /Wait for “Settle first” in/);
  await home.client.expectError("space.init", {}, "busy", /Wait for “Settle first” in/);
  await home.client.waitFor((m) => m.type === "session.state" && m.session.id === sessionId && !m.session.live && (m.session.turns ?? 0) >= 2, 20_000);
  // A management lease taken out of band.
  const shared = createSessionStore({ sessionsDir: join(home.dataDir, "sessions") });
  await shared.prepare();
  const lease = await shared.acquireManagement(sessionId);
  try {
    await home.client.expectError("space.sync", {}, "busy", /“Settle first” (is in use elsewhere|ownership cannot be verified)/);
    await home.client.expectError("space.init", {}, "busy", /“Settle first”/);
  } finally { await lease.release(); }
  // A running compile.
  const compile = home.client.command("compile.run", COMPILE_INPUT);
  await home.client.waitFor((m) => m.type === "compile.progress" && m.line === "slc: working");
  await home.client.expectError("space.sync", {}, "busy", /demo is compiling/);
  await home.client.expectError("space.init", {}, "busy", /demo is compiling/);
  await home.client.expectOk("compile.abort", { playbookId: "demo" });
  await compile;
  const settled = await home.client.settle("space.sync", {});
  assert.equal(settled.sync.phase, "done");
});

test("space-37: while a check runs, home-writing commands are refused naming the sync, and Stop ends the child", async (t) => {
  const { script, pidFile } = sleepingSsh();
  const home = await startHome("gate", { env: { GIT_SSH_COMMAND: script, SPEX_SLC: "fake-slc" }, extra: { compileSpawner: hangingCompileSpawner(), spaceTransportTimeoutMs: 60_000 } });
  t.after(() => home.stop());
  const project = await home.client.expectOk("project.register", { path: home.projectDir });
  const sessionId = await runTurn(home, project.id, "Gate me");
  await home.client.expectOk("space.init", {});
  await home.client.expectOk("space.remote.set", { url: "ssh://localhost/x" });
  const before = git(home.dataDir, "rev-parse", "HEAD");
  await home.client.expectOk("intent.queue", { projectId: project.id, text: "Saved by the sync" });
  const from = home.client.mark();
  await home.client.expectOk("space.sync", {});
  const running = await home.client.waitSpace(from, (s) => s.sync.phase === "running" && s.sync.step === "check");
  assert.ok(running.sync.phase === "running" && running.sync.cancelable);
  for (const [type, fields] of [
    ["turn.submit", { sessionId, text: "blocked" }],
    ["intent.queue", { projectId: project.id, text: "blocked" }],
    ["config.edit", { op: { kind: "captain.set", patch: { model: "blocked" } } }],
    ["project.register", { path: home.projectDir }],
    ["compile.run", COMPILE_INPUT],
    ["session.create", { projectId: project.id }],
  ] as const) {
    const reply = await home.client.command(type as Command["type"], fields as never);
    assert.ok(!reply.ok && reply.error.code === "busy", `${type} must be refused busy: ${JSON.stringify(reply)}`);
    assert.match(reply.error.message, /Space is syncing/);
  }
  await home.client.expectError("space.sync", {}, "busy", /Space is busy/);
  await home.client.expectError("space.fetch", {}, "busy", /Space is busy/);
  const pid = await sleeperPid(pidFile);
  const stopped = await home.client.expectOk("space.cancel", {});
  assert.deepEqual(stopped, { stopped: true });
  const after = await home.client.waitSpace(from, (s) => s.sync.phase === "stopped");
  assert.ok(after.sync.phase === "stopped" && after.sync.step === "check" && after.sync.cause === "stopped", JSON.stringify(after.sync));
  assert.ok(after.sync.phase === "stopped" && after.sync.retry);
  assert.notEqual(git(home.dataDir, "rev-parse", "HEAD"), before, "the Save commit stands");
  assert.match(git(home.dataDir, "log", "-1", "--format=%s"), /^Sync from /);
  for (let i = 0; i < 100; i += 1) {
    try { process.kill(pid, 0); await sleep(50); } catch { break; }
  }
  assert.throws(() => process.kill(pid, 0), "the sleeping child is gone");
  assert.deepEqual(await home.client.expectOk("space.cancel", {}), { stopped: false });
  // The gate is lifted: writes go through again.
  await home.client.expectOk("intent.queue", { projectId: project.id, text: "after the stop" });
});

test("space-37: a MERGE_HEAD planted before start reads as a pending merge and refuses the sync", async (t) => {
  const dataDir = mkdtempSync(join(scratch, "merge-"));
  mkdirSync(join(dataDir, "playbook"), { recursive: true });
  writeFileSync(join(dataDir, "playbook", "playbook.config.yaml"), config("claude-test"));
  git(dataDir, "init", "-q", "-b", "main");
  prepareStorageGitFiles(dataDir);
  git(dataDir, "add", "-A", "--", ".");
  git(dataDir, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "seed");
  writeFileSync(join(dataDir, ".git", "MERGE_HEAD"), `${git(dataDir, "rev-parse", "HEAD")}\n`);
  const home = await startHome("merge", { dataDir });
  t.after(() => home.stop());
  const state = await home.client.expectOk("space.get", {});
  assert.equal(state.repository?.mergePending, true);
  assert.ok(state.diagnostics.some((d) => d.file === ".git/MERGE_HEAD" && /merge is pending/.test(d.reason) && !d.blocking));
  await home.client.expectOk("space.remote.set", { url: bareRepo() });
  await home.client.expectError("space.sync", {}, "invalid_request", /Finish or abort the merge/);
  await home.client.expectError("space.fetch", {}, "invalid_request", /Finish or abort the merge/);
});

// ---------------------------------------------------------------------------
// space-38: the sync loop over two homes
// ---------------------------------------------------------------------------

test("space-38: a join asks about Settings, both sessions land, and the other home's session lists after binding", async (t) => {
  const bare = bareRepo();
  const a = await startHome("a");
  t.after(() => a.stop());
  const identity = join(scratch, "b-gitconfig");
  writeFileSync(identity, "[user]\n\tname = Home B\n\temail = b@example.test\n[commit]\n\tgpgsign = true\n");
  const b = await startHome("b", { model: "claude-test-b", env: { GIT_CONFIG_GLOBAL: identity }, project: false });
  t.after(() => b.stop());
  const projectA = await a.client.expectOk("project.register", { path: a.projectDir });
  const sessionA = await runTurn(a, projectA.id, "Fix the login redirect");
  await a.client.expectOk("space.init", {});
  await a.client.expectOk("space.remote.set", { url: bare });
  const pushed = await a.client.settle("space.sync", {});
  assert.equal(pushed.sync.phase, "done");
  // B: its own configuration and session, unrelated to A's history.
  const sessionB = await seedHistorySession(join(b.dataDir, "sessions"), join(scratch, "elsewhere"), turnRecords("B's own work", 1));
  const initB = await b.client.expectOk("space.init", { remote: bare });
  assert.equal(initB.repository?.remote, bare);
  assert.equal(initB.repository?.identityFallback, false);
  assert.equal(git(b.dataDir, "log", "-1", "--format=%cn"), "Home B");
  const unrelated = await b.client.settle("space.sync", {});
  assert.equal(unrelated.sync.phase, "unrelated", JSON.stringify(unrelated.sync));
  assert.equal(unrelated.repository?.unrelated, true);
  assert.deepEqual(unrelated.incoming, []);
  const choices = await b.client.settle("space.sync", { join: true });
  assert.equal(choices.sync.phase, "choices", JSON.stringify(choices.sync));
  assert.equal(choices.conflicts.length, 1);
  const conflict = choices.conflicts[0];
  assert.equal(conflict.unit.unit, "playbook/playbook.config.yaml");
  assert.equal(conflict.unit.kind, "settings");
  assert.equal(conflict.unit.label, "Settings changed");
  assert.equal(conflict.mine.change, "new");
  assert.equal(conflict.remote.change, "new");
  assert.ok(conflict.mine.diff && conflict.remote.diff);
  assert.ok(typeof conflict.mine.at === "number" && typeof conflict.remote.at === "number");
  assert.ok(choices.incoming.some((u) => u.kind === "session" && u.sessionId === sessionA && u.label === "Fix the login redirect"));
  await b.client.expectError("space.sync", { choices: { "sessions/nope": "mine" }, join: true }, "invalid_request", /unknown unit/);
  await b.client.expectError("space.sync", { choices: { [`sessions/${sessionA}`]: "mine" }, join: true }, "invalid_request", /no divergent change/);
  const mineBytes = readFileSync(b.configPath);
  const joined = await b.client.settle("space.sync", { choices: { "playbook/playbook.config.yaml": "mine" }, join: true });
  assert.equal(joined.sync.phase, "done", JSON.stringify(joined.sync));
  assert.ok(joined.sync.phase === "done" && joined.sync.pushed && joined.sync.received >= 1);
  assert.deepEqual(readFileSync(b.configPath), mineBytes, "Keep mine leaves this home's file");
  assert.equal(joined.repository?.unrelated, false);
  assert.equal(existsSync(join(b.dataDir, "sessions", `${sessionA}.json`)), true);
  assert.equal(existsSync(join(b.dataDir, "sessions", `${sessionA}.records.jsonl`)), true);
  assert.equal(git(b.dataDir, "log", "-1", "--format=%P").split(" ").length, 2, "one merge commit with two parents");
  assert.equal(git(bare, "rev-parse", "main"), git(b.dataDir, "rev-parse", "main"));
  assert.ok(joined.diagnostics.some((d) => /unresolved|No project binding/.test(d.reason) && d.file.includes(sessionA)), JSON.stringify(joined.diagnostics));
  assert.ok(!(await b.client.expectOk("session.list", {})).some((s) => s.id === sessionA), "unresolved until bound");
  // B binds A's project to a local checkout with A's path as the alias.
  const checkout = join(scratch, "b-checkout");
  mkdirSync(checkout);
  git(checkout, "init", "-q");
  const bound = await b.client.expectOk("project.rebind", { projectId: projectA.id, path: checkout, aliases: [a.projectDir] });
  assert.equal(bound.id, projectA.id);
  const listed = (await b.client.expectOk("session.list", {})).find((s) => s.id === sessionA);
  assert.equal(listed?.title, "Fix the login redirect");
  assert.equal(listed?.projectId, projectA.id);
  const history = await b.client.expectOk("history.get", { sessionId: sessionA });
  assert.ok(history.records.some((r) => r.record.type === "turn_started"));
  await b.client.waitFor((m) => m.type === "intents.changed" && m.projectIds.includes(projectA.id));
  // A receives B's session and B's registry stays A's; then Settings diverge again and "Take remote" replaces A's file.
  const back = await a.client.settle("space.sync", {});
  assert.equal(back.sync.phase, "done", JSON.stringify(back.sync));
  assert.equal(existsSync(join(a.dataDir, "sessions", `${sessionB}.json`)), true);
  await a.client.expectOk("config.edit", { op: { kind: "captain.set", patch: { model: "claude-test-a2" } } });
  assert.equal((await a.client.settle("space.sync", {})).sync.phase, "done");
  await b.client.expectOk("config.edit", { op: { kind: "captain.set", patch: { model: "claude-test-b2" } } });
  const diverged = await b.client.settle("space.sync", {});
  assert.equal(diverged.sync.phase, "choices");
  assert.deepEqual(diverged.conflicts.map((c) => c.unit.unit), ["playbook/playbook.config.yaml"]);
  assert.equal(diverged.conflicts[0].mine.change, "updated");
  const mine = await b.client.expectOk("space.diff", { unit: "playbook/playbook.config.yaml", path: "playbook/playbook.config.yaml", side: "mine" });
  assert.match(mine.patch, /\+.*claude-test-b2/);
  const remote = await b.client.expectOk("space.diff", { unit: "playbook/playbook.config.yaml", path: "playbook/playbook.config.yaml", side: "remote" });
  assert.match(remote.patch, /\+.*claude-test-a2/);
  const taken = await b.client.settle("space.sync", { choices: { "playbook/playbook.config.yaml": "remote" } });
  assert.equal(taken.sync.phase, "done", JSON.stringify(taken.sync));
  assert.match(readFileSync(b.configPath, "utf8"), /claude-test-a2/, "Take remote replaces the file");
  const configState = await b.client.expectOk("config.get", {});
  assert.ok(configState.status === "valid" && configState.summary.captain.model === "claude-test-a2", "the configuration reloaded");
});

test("space-38: the same session changed on both homes is one choice; remote replaces the bundle and clears local marks; delete versus modify", async (t) => {
  const bare = bareRepo();
  const a = await startHome("a2");
  t.after(() => a.stop());
  const b = await startHome("b2", { project: false });
  t.after(() => b.stop());
  const projectA = await a.client.expectOk("project.register", { path: a.projectDir });
  const shared = await runTurn(a, projectA.id, "Shared session");
  const doomed = await runTurn(a, projectA.id, "Doomed session");
  await a.client.expectOk("space.init", {});
  await a.client.expectOk("space.remote.set", { url: bare });
  assert.equal((await a.client.settle("space.sync", {})).sync.phase, "done");
  await b.client.expectOk("space.init", { remote: bare });
  await joinRemote(b);
  const checkout = join(scratch, "b2-checkout");
  mkdirSync(checkout);
  git(checkout, "init", "-q");
  await b.client.expectOk("project.rebind", { projectId: projectA.id, path: checkout, aliases: [a.projectDir] });
  assert.ok((await b.client.expectOk("session.list", {})).some((s) => s.id === shared));
  // Both change the shared session: A runs a turn; B appends its own and marks it viewed with hints.
  await runTurn(a, projectA.id, "A's second turn", shared);
  assert.equal((await a.client.settle("space.sync", {})).sync.phase, "done");
  await seedHistorySession(join(b.dataDir, "sessions"), a.projectDir, turnRecords("B's second turn", 2), shared);
  await b.client.expectOk("project.register", { path: checkout });
  await b.client.waitFor((m) => m.type === "session.state" && m.session.id === shared && (m.session.turns ?? 0) === 2, 20_000);
  writeFileSync(join(b.dataDir, "sessions", `${shared}.hints.json`), "{}");
  await b.client.expectOk("session.viewed", { sessionId: shared, turnId: 1 });
  const listedBefore = await b.client.expectOk("space.get", {});
  assert.ok(listedBefore.local.some((u) => u.sessionId === shared && u.change === "updated" && u.detail?.includes("2 turns")), JSON.stringify(listedBefore.local));
  const choices = await b.client.settle("space.sync", {});
  assert.equal(choices.sync.phase, "choices", JSON.stringify(choices.sync));
  assert.deepEqual(choices.conflicts.map((c) => c.unit.unit), [`sessions/${shared}`]);
  const row = choices.conflicts[0];
  assert.equal(row.unit.label, "Shared session");
  assert.equal(row.unit.project?.id, projectA.id);
  assert.equal(row.mine.detail, "2 turns");
  assert.equal(row.remote.detail, "2 turns");
  assert.ok(typeof row.mine.at === "number" && typeof row.remote.at === "number");
  await b.client.expectError("space.diff", { unit: `sessions/${shared}`, path: `sessions/${shared}.json`, side: "mine" }, "invalid_request", /no text diff/);
  const from = b.client.mark();
  const done = await b.client.settle("space.sync", { choices: { [`sessions/${shared}`]: "remote" } });
  assert.equal(done.sync.phase, "done", JSON.stringify(done.sync));
  assert.deepEqual(readFileSync(join(b.dataDir, "sessions", `${shared}.json`)), readFileSync(join(a.dataDir, "sessions", `${shared}.json`)));
  assert.deepEqual(readFileSync(join(b.dataDir, "sessions", `${shared}.records.jsonl`)), readFileSync(join(a.dataDir, "sessions", `${shared}.records.jsonl`)));
  assert.equal(existsSync(join(b.dataDir, "sessions", `${shared}.hints.json`)), false, "hints cleared");
  const prefs = JSON.parse(readFileSync(join(b.dataDir, "prefs.json"), "utf8")) as { prefs: Record<string, unknown> };
  assert.equal(prefs.prefs[`viewed:${shared}`], undefined, "viewed marker cleared");
  const messages = b.client.messages.slice(from);
  const replaced = messages.findIndex((m) => m.type === "session.history-replaced" && m.sessionId === shared);
  const summary = messages.findIndex((m) => m.type === "session.state" && m.session.id === shared);
  assert.ok(replaced >= 0 && summary > replaced, "history-replaced before the summary");
  const served = await b.client.expectOk("history.get", { sessionId: shared });
  assert.ok(served.records.some((r) => r.record.type === "turn_started" && (r.record as { turn?: { prompt?: string } }).turn?.prompt === "A's second turn"));
  assert.ok(!(await b.client.expectOk("session.list", {})).some((s) => s.title === "B's second turn"));
  assert.equal(existsSync(join(b.dataDir, ".git", "MERGE_HEAD")), false);
  // Delete versus modify: B deletes the doomed session, A modifies it; A takes the deleting side.
  await b.client.expectOk("session.delete", { sessionId: doomed });
  assert.equal((await b.client.settle("space.sync", {})).sync.phase, "done");
  await runTurn(a, projectA.id, "Still working on it", doomed);
  const conflict = await a.client.settle("space.sync", {});
  assert.equal(conflict.sync.phase, "choices", JSON.stringify(conflict.sync));
  const deleting = conflict.conflicts.find((c) => c.unit.unit === `sessions/${doomed}`);
  assert.equal(deleting?.remote.change, "deleted");
  assert.equal(deleting?.remote.detail, "deleted");
  assert.equal(deleting?.mine.change, "updated");
  const gone = await a.client.settle("space.sync", { choices: { [`sessions/${doomed}`]: "remote" } });
  assert.equal(gone.sync.phase, "done", JSON.stringify(gone.sync));
  assert.equal(existsSync(join(a.dataDir, "sessions", `${doomed}.json`)), false);
  assert.equal(existsSync(join(a.dataDir, "sessions", `${doomed}.records.jsonl`)), false);
  assert.ok(!(await a.client.expectOk("session.list", {})).some((s) => s.id === doomed));
  assert.ok(a.client.messages.some((m) => m.type === "session.removed" && m.sessionId === doomed));
});

test("space-38: playbook directories, validation at Apply, a slipped writer, a rejected push and a fast-forward", async (t) => {
  const bare = bareRepo();
  const a = await startHome("a3");
  t.after(() => a.stop());
  const b = await startHome("b3", { project: false });
  t.after(() => b.stop());
  const projectA = await a.client.expectOk("project.register", { path: a.projectDir });
  await runTurn(a, projectA.id, "Seed");
  await a.client.expectOk("space.init", {});
  await a.client.expectOk("space.remote.set", { url: bare });
  assert.equal((await a.client.settle("space.sync", {})).sync.phase, "done");
  await b.client.expectOk("space.init", { remote: bare });
  await joinRemote(b);
  const checkout = join(scratch, "b3-checkout");
  mkdirSync(checkout);
  git(checkout, "init", "-q");
  await b.client.expectOk("project.rebind", { projectId: projectA.id, path: checkout, aliases: [a.projectDir] });
  // A playbook source changed differently on both sides is one whole-directory conflict.
  for (const [home, text] of [[a, "# Demo from A\n"], [b, "# Demo from B\n"]] as const) {
    mkdirSync(join(home.dataDir, "playbooks", "demo"), { recursive: true });
    writeFileSync(join(home.dataDir, "playbooks", "demo", "demo.md"), text);
  }
  assert.equal((await a.client.settle("space.sync", {})).sync.phase, "done");
  const playbook = await b.client.settle("space.sync", {});
  assert.equal(playbook.sync.phase, "choices", JSON.stringify(playbook.sync));
  assert.deepEqual(playbook.conflicts.map((c) => c.unit.unit), ["playbooks/demo"]);
  assert.equal(playbook.conflicts[0].unit.label, "Playbook demo");
  assert.equal(playbook.conflicts[0].unit.detail, "demo.md");
  const kept = await b.client.settle("space.sync", { choices: { "playbooks/demo": "mine" } });
  assert.equal(kept.sync.phase, "done", JSON.stringify(kept.sync));
  assert.equal(readFileSync(join(b.dataDir, "playbooks", "demo", "demo.md"), "utf8"), "# Demo from B\n");
  assert.equal((await a.client.settle("space.sync", {})).sync.phase, "done");
  assert.equal(readFileSync(join(a.dataDir, "playbooks", "demo", "demo.md"), "utf8"), "# Demo from B\n");
  for (const home of [a, b]) {
    assert.equal(existsSync(join(home.dataDir, ".git", "MERGE_HEAD")), false);
    for (const [file, bytes] of snapshot(home.dataDir)) assert.ok(!bytes.includes("<<<<<<<"), `conflict marker in ${file}`);
  }
  // A chosen unit refused by validation stops at Apply naming the file, files untouched.
  const peer = peerClone(bare);
  const intentId = randomUUID();
  const badLog = `intents/${projectA.id}.jsonl`;
  const act = JSON.stringify({ v: 1, act: "queue", intent: { id: intentId, projectId: projectA.id, text: "twice", rank: "a", createdAt: 1 } });
  await peerPush(peer, (dir) => { mkdirSync(join(dir, "intents"), { recursive: true }); writeFileSync(join(dir, badLog), `${act}\n${act}\n`); });
  const before = snapshot(b.dataDir);
  const refused = await b.client.settle("space.sync", {});
  assert.ok(refused.sync.phase === "stopped" && refused.sync.step === "apply" && refused.sync.cause === "validation", JSON.stringify(refused.sync));
  assert.ok(refused.sync.phase === "stopped" && refused.sync.message.includes(`${projectA.id}.jsonl`) && refused.sync.retry);
  const after = snapshot(b.dataDir);
  assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort());
  for (const [file, bytes] of before) assert.deepEqual(after.get(file), bytes, `${file} changed`);
  assert.equal(existsSync(join(b.dataDir, "local", "space-apply.json")), false);
  await peerPush(peer, (dir) => { writeFileSync(join(dir, badLog), `${act}\n`); });
  assert.equal((await b.client.settle("space.sync", {})).sync.phase, "done");
  assert.equal((await a.client.settle("space.sync", {})).sync.phase, "done");
  // A records file appended between Save and Apply restarts once from Save; a second append stops it.
  const bSession = await seedHistorySession(join(b.dataDir, "sessions"), a.projectDir, turnRecords("B's session", 1));
  await b.client.expectOk("project.register", { path: checkout });
  await runTurn(a, projectA.id, "Something incoming for B");
  assert.equal((await a.client.settle("space.sync", {})).sync.phase, "done");
  let slips = 1;
  let applies = 0;
  b.hooks.beforeStep = async ({ step }) => {
    if (step !== "apply") return;
    applies += 1;
    if (slips > 0) { slips -= 1; await seedHistorySession(join(b.dataDir, "sessions"), a.projectDir, turnRecords(`slip ${applies}`, applies + 1), bSession); }
  };
  const restarted = await b.client.settle("space.sync", {});
  assert.equal(restarted.sync.phase, "done", JSON.stringify(restarted.sync));
  assert.equal(applies, 2, "one restart from Save");
  assert.match(git(b.dataDir, "show", `HEAD:sessions/${bSession}.records.jsonl`), /slip 1/);
  await runTurn(a, projectA.id, "More incoming for B");
  assert.equal((await a.client.settle("space.sync", {})).sync.phase, "done");
  slips = 2;
  applies = 0;
  const twice = await b.client.settle("space.sync", {});
  assert.ok(twice.sync.phase === "stopped" && twice.sync.step === "apply" && twice.sync.cause === "writer", JSON.stringify(twice.sync));
  b.hooks.beforeStep = undefined;
  assert.equal((await b.client.settle("space.sync", {})).sync.phase, "done");
  // A push rejected because the peer advanced after the check re-checks once; advanced again, it stops.
  let pushes = 0;
  let pushesToReject = 1;
  let notes = 0;
  b.hooks.beforeStep = async ({ step }) => {
    if (step !== "push") return;
    pushes += 1;
    if (pushesToReject > 0) { pushesToReject -= 1; notes += 1; await peerPush(peer, (dir) => writeFileSync(join(dir, "notes.txt"), `note ${notes}\n`)); }
  };
  await b.client.expectOk("intent.queue", { projectId: projectA.id, text: "B queues work" });
  const rechecked = await b.client.settle("space.sync", {});
  assert.equal(rechecked.sync.phase, "done", JSON.stringify(rechecked.sync));
  assert.equal(pushes, 2);
  assert.equal(readFileSync(join(b.dataDir, "notes.txt"), "utf8"), "note 1\n");
  assert.equal(git(bare, "rev-parse", "main"), git(b.dataDir, "rev-parse", "main"));
  pushes = 0;
  pushesToReject = 2;
  await b.client.expectOk("intent.queue", { projectId: projectA.id, text: "B queues more" });
  const changedAgain = await b.client.settle("space.sync", {});
  assert.ok(changedAgain.sync.phase === "stopped" && changedAgain.sync.step === "push" && changedAgain.sync.cause === "rejected", JSON.stringify(changedAgain.sync));
  assert.ok(changedAgain.sync.phase === "stopped" && /changed again/.test(changedAgain.sync.message));
  assert.ok((changedAgain.repository?.ahead ?? 0) >= 1, JSON.stringify(changedAgain.repository));
  assert.equal(git(b.dataDir, "rev-list", "--count", "origin/main..main"), String(changedAgain.repository?.ahead));
  b.hooks.beforeStep = undefined;
  assert.equal((await b.client.settle("space.sync", {})).sync.phase, "done");
  // A fast-forward: main equals the remote's with no merge commit, hints cleared, private modes under umask 022.
  assert.equal((await a.client.settle("space.sync", {})).sync.phase, "done");
  const ffSession = await runTurn(a, projectA.id, "Fast forward me");
  assert.equal((await a.client.settle("space.sync", {})).sync.phase, "done");
  writeFileSync(join(b.dataDir, "sessions", `${ffSession}.hints.json`), "{}");
  const previousUmask = process.umask(0o022);
  let forwarded: SpaceState;
  try { forwarded = await b.client.settle("space.sync", {}); } finally { process.umask(previousUmask); }
  assert.equal(forwarded.sync.phase, "done", JSON.stringify(forwarded.sync));
  assert.equal(git(b.dataDir, "rev-parse", "main"), git(b.dataDir, "rev-parse", "origin/main"));
  assert.equal(git(b.dataDir, "log", "-1", "--format=%P").split(" ").length, 1, "no merge commit");
  assert.equal(existsSync(join(b.dataDir, "sessions", `${ffSession}.hints.json`)), false);
  assert.equal(statSync(join(b.dataDir, "sessions")).mode & 0o777, 0o700);
  for (const entry of readdirSync(join(b.dataDir, "sessions"))) {
    const mode = statSync(join(b.dataDir, "sessions", entry)).mode & 0o777;
    assert.ok((mode & 0o077) === 0, `${entry} is ${mode.toString(8)}`);
  }
  assert.ok((await b.client.expectOk("session.list", {})).some((s) => s.id === ffSession && s.title === "Fast forward me"));
});

test("space-38: a marker with a half-written selection is repaired at startup into the recorded commit", async (t) => {
  const dataDir = mkdtempSync(join(scratch, "repair-"));
  mkdirSync(join(dataDir, "playbook"), { recursive: true });
  writeFileSync(join(dataDir, "playbook", "playbook.config.yaml"), config("claude-test"));
  mkdirSync(join(dataDir, "intents"));
  git(dataDir, "init", "-q", "-b", "main");
  prepareStorageGitFiles(dataDir);
  const cwd = join(scratch, "repair-project");
  mkdirSync(cwd, { recursive: true });
  const sessionId = await seedHistorySession(join(dataDir, "sessions"), cwd, turnRecords("Base turn", 1));
  git(dataDir, "add", "-A", "--", ".");
  git(dataDir, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "base");
  const base = git(dataDir, "rev-parse", "HEAD");
  const remote = bareRepo();
  git(dataDir, "remote", "add", "origin", remote);
  git(dataDir, "push", "-q", "-u", "origin", "main");
  const theirsDir = peerClone(remote);
  const shared = createSessionStore({ sessionsDir: join(theirsDir, "sessions") });
  await shared.prepare();
  await seedHistorySession(join(theirsDir, "sessions"), cwd, turnRecords("Their second turn", 2), sessionId);
  git(theirsDir, "add", "-A", "--", ".");
  git(theirsDir, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "theirs");
  git(theirsDir, "push", "-q", "origin", "HEAD:main");
  git(dataDir, "fetch", "-q", "origin");
  const theirs = git(dataDir, "rev-parse", "refs/remotes/origin/main");
  writeFileSync(join(dataDir, "intents", `${randomUUID()}.jsonl`), "");
  writeFileSync(join(dataDir, "notes.txt"), "ours\n");
  git(dataDir, "add", "-A", "--", ".");
  git(dataDir, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "ours");
  const ours = git(dataDir, "rev-parse", "HEAD");
  // The interrupted apply: the replay landed, the manifest did not, the marker stands.
  writeFileSync(join(dataDir, "sessions", `${sessionId}.records.jsonl`), readFileSync(join(theirsDir, "sessions", `${sessionId}.records.jsonl`)));
  mkdirSync(join(dataDir, "local"), { recursive: true });
  writeFileSync(join(dataDir, "local", "space-apply.json"), JSON.stringify({ v: 1, ours, theirs, base, choices: { [`sessions/${sessionId}`]: "theirs" }, at: Date.now() }));
  const home = await startHome("repair", { dataDir });
  t.after(() => home.stop());
  const state = await home.client.expectOk("space.get", {});
  assert.ok(!state.diagnostics.some((d) => d.file === "local/space-apply.json"), JSON.stringify(state.diagnostics));
  assert.equal(existsSync(join(dataDir, "local", "space-apply.json")), false);
  const head = git(dataDir, "rev-parse", "HEAD");
  assert.notEqual(head, ours);
  assert.deepEqual(git(dataDir, "log", "-1", "--format=%P").split(" "), [ours, theirs]);
  assert.deepEqual(readFileSync(join(dataDir, "sessions", `${sessionId}.json`)), readFileSync(join(theirsDir, "sessions", `${sessionId}.json`)));
  assert.equal(git(dataDir, "show", "HEAD:notes.txt"), "ours");
  assert.equal(git(dataDir, "status", "--porcelain"), "");
  assert.equal(state.repository?.branch, "main");
  const listed = (await home.client.expectOk("session.list", {})).length;
  assert.equal(listed, 0, "the session's project is unbound on this home");
  assert.ok(state.diagnostics.some((d) => d.file.includes(sessionId)));
  // A marker left standing after its merge commit landed is cleared
  // with nothing re-applied: main stays on the landed commit.
  await home.stop();
  writeFileSync(join(dataDir, "local", "space-apply.json"), JSON.stringify({ v: 1, ours, theirs, base, choices: { [`sessions/${sessionId}`]: "theirs" }, at: Date.now() }));
  const again = await startHome("repair-again", { dataDir });
  t.after(() => again.stop());
  const cleared = await again.client.expectOk("space.get", {});
  assert.ok(!cleared.diagnostics.some((d) => d.file === "local/space-apply.json"), JSON.stringify(cleared.diagnostics));
  assert.equal(existsSync(join(dataDir, "local", "space-apply.json")), false);
  assert.equal(git(dataDir, "rev-parse", "HEAD"), head);
});

test("space-38: a marker left after a landed fast-forward is cleared at startup with main on the remote's commit", async (t) => {
  const dataDir = mkdtempSync(join(scratch, "repair-ff-"));
  mkdirSync(join(dataDir, "playbook"), { recursive: true });
  writeFileSync(join(dataDir, "playbook", "playbook.config.yaml"), config("claude-test"));
  git(dataDir, "init", "-q", "-b", "main");
  prepareStorageGitFiles(dataDir);
  git(dataDir, "add", "-A", "--", ".");
  git(dataDir, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "base");
  const base = git(dataDir, "rev-parse", "HEAD");
  const remote = bareRepo();
  git(dataDir, "remote", "add", "origin", remote);
  git(dataDir, "push", "-q", "-u", "origin", "main");
  const peer = peerClone(remote);
  const theirs = await peerPush(peer, (dir) => writeFileSync(join(dir, "notes.txt"), "theirs\n"));
  // The fast-forward landed — main moved to the remote's commit and the
  // tree followed — but the marker was never removed.
  git(dataDir, "fetch", "-q", "origin");
  git(dataDir, "reset", "-q", "--hard", "refs/remotes/origin/main");
  assert.equal(git(dataDir, "rev-parse", "HEAD"), theirs);
  mkdirSync(join(dataDir, "local"), { recursive: true });
  writeFileSync(join(dataDir, "local", "space-apply.json"), JSON.stringify({ v: 1, ours: base, theirs, base, choices: {}, at: Date.now() }));
  const home = await startHome("repair-ff", { dataDir });
  t.after(() => home.stop());
  const state = await home.client.expectOk("space.get", {});
  assert.ok(!state.diagnostics.some((d) => d.file === "local/space-apply.json"), JSON.stringify(state.diagnostics));
  assert.equal(existsSync(join(dataDir, "local", "space-apply.json")), false);
  assert.equal(git(dataDir, "rev-parse", "HEAD"), theirs);
  assert.equal(git(dataDir, "log", "-1", "--format=%P").split(" ").length, 1, "no merge commit");
  assert.equal(git(dataDir, "status", "--porcelain"), "");
  assert.equal(readFileSync(join(dataDir, "notes.txt"), "utf8"), "theirs\n");
});

test("space-38: a missing repository, an unreachable host and a sleeping transport stop with their causes", async (t) => {
  const { script } = sleepingSsh();
  const home = await startHome("transport", { env: { GIT_SSH_COMMAND: script } });
  t.after(() => home.stop());
  await home.client.expectOk("space.init", {});
  const expectStop = async (url: string, cause: string, message: RegExp, retry: boolean): Promise<void> => {
    await home.client.expectOk("space.remote.set", { url });
    const stopped = await home.client.settle("space.fetch", {});
    assert.ok(stopped.sync.phase === "stopped" && stopped.sync.op === "check" && stopped.sync.step === "check", JSON.stringify(stopped.sync));
    assert.equal(stopped.sync.phase === "stopped" ? stopped.sync.cause : "", cause, JSON.stringify(stopped.sync));
    assert.match(stopped.sync.phase === "stopped" ? stopped.sync.message : "", message);
    assert.ok(stopped.sync.phase === "stopped" && stopped.sync.guidance.length > 0);
    assert.equal(stopped.sync.phase === "stopped" && stopped.sync.retry, retry);
  };
  await expectStop(join(scratch, "nonexistent", "path"), "not-found", /No repository at/, false);
  const start = Date.now();
  await expectStop("ssh://localhost/x", "timeout", /No answer from localhost/, true);
  assert.ok(Date.now() - start < 5_000, "the shortened limit ends the sleeping transport");
  // The unreachable case runs the machine's ssh with BatchMode, as the core sets it where none is given.
  const plain = await startHome("transport-plain");
  t.after(() => plain.stop());
  await plain.client.expectOk("space.init", {});
  await plain.client.expectOk("space.remote.set", { url: "ssh://127.0.0.1:1/x" });
  const refusedHost = await plain.client.settle("space.fetch", {});
  assert.ok(refusedHost.sync.phase === "stopped" && refusedHost.sync.cause === "unreachable", JSON.stringify(refusedHost.sync));
  assert.match(refusedHost.sync.phase === "stopped" ? refusedHost.sync.message : "", /Could not reach 127\.0\.0\.1/);
  const synced = await plain.client.settle("space.sync", {});
  assert.ok(synced.sync.phase === "stopped" && synced.sync.op === "sync" && synced.sync.step === "check" && synced.sync.cause === "unreachable", JSON.stringify(synced.sync));
});

// ---------------------------------------------------------------------------
// space-39: listings and the explorer
// ---------------------------------------------------------------------------

test("space-39: local changes of every kind list in order, incoming units after a peer pushes, diffs, and the explorer", async (t) => {
  const bare = bareRepo();
  const home = await startHome("explorer");
  t.after(() => home.stop());
  const project = await home.client.expectOk("project.register", { path: home.projectDir });
  await home.client.expectOk("space.init", {});
  await home.client.expectOk("space.remote.set", { url: bare });
  assert.equal((await home.client.settle("space.sync", {})).sync.phase, "done");
  const name = basename(home.projectDir);
  // Local changes of every kind.
  const sessionId = await runTurn(home, project.id, "Fix the login redirect");
  for (const text of ["one", "two", "three"]) await home.client.expectOk("intent.queue", { projectId: project.id, text });
  const secondDir = join(scratch, "explorer-second");
  mkdirSync(secondDir);
  git(secondDir, "init", "-q");
  await home.client.expectOk("project.register", { path: secondDir });
  await home.client.expectOk("config.edit", { op: { kind: "captain.set", patch: { model: "claude-test-edited" } } });
  mkdirSync(join(home.dataDir, "playbooks", "demo"), { recursive: true });
  writeFileSync(join(home.dataDir, "playbooks", "demo", "demo.md"), "# Demo\n");
  writeFileSync(join(home.dataDir, ".gitignore"), `${readFileSync(join(home.dataDir, ".gitignore"), "utf8")}# authored\n/scratch/\n`);
  const local = (await home.client.expectOk("space.get", {})).local;
  assert.deepEqual(local.map((u) => u.kind), ["session", "queue", "projects", "settings", "playbook", "rules"], JSON.stringify(local));
  const [session, queue, projects, settings, playbook, rules] = local;
  assert.equal(session.label, "Fix the login redirect");
  assert.equal(session.change, "new");
  assert.equal(session.sessionId, sessionId);
  assert.equal(session.project?.name, name);
  assert.match(session.detail ?? "", /1 turn/);
  assert.equal(session.diff, false);
  assert.equal(queue.label, `3 changes in ${name}'s queue`);
  assert.equal(queue.change, "new");
  assert.equal(projects.label, 'Registered "explorer-second"');
  assert.equal(settings.label, "Settings changed");
  assert.equal(settings.change, "updated");
  assert.equal(settings.diff, true);
  assert.equal(playbook.label, "Playbook demo");
  assert.equal(playbook.detail, "demo.md");
  assert.equal(rules.label, "Sync rules updated");
  assert.equal(rules.unit, ".gitignore");
  // A peer pushes: a differing configuration, a new session and a queue.
  const peer = peerClone(bare);
  const peerSession = randomUUID();
  const second = (await home.client.expectOk("project.list", {})).find((p) => p.path === secondDir);
  assert.ok(second);
  await peerPush(peer, async (dir) => {
    writeFileSync(join(dir, "playbook", "playbook.config.yaml"), config("claude-test-peer"));
    await seedHistorySession(join(dir, "sessions"), home.projectDir, turnRecords("Peer's session", 1), peerSession);
    mkdirSync(join(dir, "intents"), { recursive: true });
    writeFileSync(join(dir, "intents", `${second.id}.jsonl`), ["a", "b"].map((text) => JSON.stringify({ v: 1, act: "queue", intent: { id: randomUUID(), projectId: second.id, text, rank: text, createdAt: 1 } })).join("\n") + "\n");
  });
  const checked = await home.client.settle("space.fetch", {});
  assert.equal(checked.sync.phase, "idle", JSON.stringify(checked.sync));
  assert.equal(checked.repository?.ahead, 0);
  assert.equal(checked.repository?.behind, 1);
  assert.equal(checked.repository?.remoteEmpty, false);
  assert.deepEqual(checked.incoming.map((u) => u.kind), ["session", "queue"], JSON.stringify(checked.incoming));
  assert.equal(checked.incoming[0].label, "Peer's session");
  assert.equal(checked.incoming[0].change, "new");
  assert.equal(checked.incoming[0].project?.name, name);
  assert.equal(checked.incoming[1].label, "2 changes in explorer-second's queue");
  assert.deepEqual(checked.conflicts.map((c) => c.unit.unit), ["playbook/playbook.config.yaml"]);
  assert.ok(checked.conflicts[0].mine.diff && checked.conflicts[0].remote.diff);
  assert.deepEqual(checked.local.map((u) => u.kind), ["session", "queue", "projects", "playbook", "rules"]);
  const mine = await home.client.expectOk("space.diff", { unit: "playbook/playbook.config.yaml", path: "playbook/playbook.config.yaml", side: "mine" });
  assert.match(mine.patch, /^\+.*claude-test-edited/m);
  assert.equal(mine.truncated, false);
  const remote = await home.client.expectOk("space.diff", { unit: "playbook/playbook.config.yaml", path: "playbook/playbook.config.yaml", side: "remote" });
  assert.match(remote.patch, /^\+.*claude-test-peer/m);
  const fresh = await home.client.expectOk("space.diff", { unit: "playbooks/demo", path: "playbooks/demo/demo.md", side: "mine" });
  assert.match(fresh.patch, /^\+# Demo$/m, "a new file diffs against the ancestor");
  await home.client.expectError("space.diff", { unit: `sessions/${sessionId}`, path: `sessions/${sessionId}.json`, side: "mine" }, "invalid_request", /no text diff/);
  await home.client.expectError("space.diff", { unit: "playbook/playbook.config.yaml", path: "other", side: "mine" }, "invalid_request", /unknown path/);
  const empty = bareRepo();
  await home.client.expectOk("space.remote.set", { url: empty });
  const vacant = await home.client.settle("space.fetch", {});
  assert.equal(vacant.repository?.remoteEmpty, true);
  assert.deepEqual(vacant.incoming, []);
  assert.deepEqual(vacant.conflicts, []);
  assert.ok(vacant.local.every((u) => u.change === "new"));
  await home.client.expectOk("space.remote.set", { url: bare });
  // The explorer.
  writeFileSync(join(home.dataDir, "notes.txt"), "stray\n");
  symlinkSync(home.projectDir, join(home.dataDir, "link"));
  const migration = join(home.dataDir, "local", "migrations", "x", "inputs");
  mkdirSync(migration, { recursive: true });
  writeFileSync(join(migration, "0"), "{\"token\":\"secret\"}");
  writeFileSync(join(home.dataDir, "sessions", `${sessionId}.hints.json`), "{}");
  writeFileSync(join(home.dataDir, "big.log"), Array.from({ length: 3_500 }, (_, i) => `line ${String(i).padStart(6, "0")} ${"x".repeat(80)}`).join("\n") + "\n");
  const root = await home.client.expectOk("space.tree", {});
  assert.equal(root.path, "");
  const entry = (path: string) => { const found = root.entries.find((e) => e.path === path); assert.ok(found, `missing ${path} in ${root.entries.map((e) => e.path).join(", ")}`); return found; };
  assert.equal(entry(".git").kind, "git");
  assert.equal(entry(".git").sync, "git");
  assert.equal(entry(".git").family, "Git data");
  assert.equal(entry(".git").count, undefined);
  assert.equal(entry("sessions").kind, "dir");
  assert.equal(entry("sessions").family, "session bundles");
  assert.ok((entry("sessions").count ?? 0) >= 3);
  assert.equal(entry("notes.txt").family, "Not a Spex file");
  assert.equal(entry("notes.txt").sync, "pending");
  assert.equal(entry("link").kind, "file");
  assert.equal(entry("link").preview, "none");
  assert.equal(entry("prefs.json").family, "preferences");
  assert.equal(entry("prefs.json").sync, "local");
  assert.equal(entry("projects.json").family, "project registry");
  assert.equal(entry("projects.json").sync, "pending");
  assert.equal(entry(".gitignore").family, "sync rules");
  assert.equal(entry(".gitattributes").sync, "shared");
  assert.equal(entry("playbook").family, "Settings");
  assert.equal(entry("local").sync, "local");
  assert.equal(entry("big.log").preview, "text");
  assert.ok(root.entries.findIndex((e) => e.kind !== "dir" && e.kind !== "git") > root.entries.findIndex((e) => e.kind === "dir"), "directories first");
  await home.client.expectError("space.tree", { path: "link" }, "invalid_request", /symbolic link/);
  await home.client.expectError("space.tree", { path: "link/README.md" }, "invalid_request", /symbolic link/);
  await home.client.expectError("space.tree", { path: "../" }, "invalid_request", /escapes/);
  await home.client.expectError("space.tree", { path: ".git" }, "invalid_request", /Git data/);
  await home.client.expectError("space.tree", { path: "nope" }, "not_found");
  const sessions = await home.client.expectOk("space.tree", { path: "sessions" });
  const manifest = sessions.entries.find((e) => e.name === `${sessionId}.json`);
  assert.equal(manifest?.family, "session manifest");
  assert.equal(manifest?.sync, "pending");
  assert.equal(manifest?.preview, "text");
  assert.deepEqual(manifest?.owner, { sessionId, title: "Fix the login redirect", projectId: project.id, name });
  const hints = sessions.entries.find((e) => e.name === `${sessionId}.hints.json`);
  assert.equal(hints?.family, "provider hints");
  assert.equal(hints?.sync, "local");
  assert.equal(hints?.preview, "withheld");
  const records = sessions.entries.find((e) => e.name === `${sessionId}.records.jsonl`);
  assert.equal(records?.family, "session records");
  assert.ok((records?.size ?? 0) > 0 && typeof records?.mtime === "number");
  const queues = await home.client.expectOk("space.tree", { path: "intents" });
  const log = queues.entries.find((e) => e.name === `${project.id}.jsonl`);
  assert.equal(log?.family, "project queue");
  assert.deepEqual(log?.owner, { projectId: project.id, name });
  const inputs = await home.client.expectOk("space.tree", { path: "local/migrations/x/inputs" });
  assert.equal(inputs.entries[0]?.family, "migration inputs");
  assert.equal(inputs.entries[0]?.preview, "withheld");
  const pretty = await home.client.expectOk("space.read", { path: `sessions/${sessionId}.json` });
  assert.ok(pretty.kind === "text" && pretty.text.startsWith("{\n  \"") && !pretty.truncated);
  const yaml = await home.client.expectOk("space.read", { path: "playbook/playbook.config.yaml" });
  assert.ok(yaml.kind === "text" && yaml.text.includes("captain:"));
  const markdown = await home.client.expectOk("space.read", { path: "playbooks/demo/demo.md" });
  assert.ok(markdown.kind === "text" && markdown.text === "# Demo\n" && markdown.lines === 1);
  const stream = await home.client.expectOk("space.read", { path: `sessions/${sessionId}.records.jsonl` });
  assert.ok(stream.kind === "text" && stream.lines >= 2 && stream.text.split("\n")[0].startsWith("{"));
  const cut = await home.client.expectOk("space.read", { path: "big.log" });
  assert.ok(cut.kind === "text" && cut.truncated && cut.lines <= 2_000 && cut.text.endsWith("\n") && Buffer.byteLength(cut.text) <= 256 * 1024);
  assert.ok(cut.kind === "text" && cut.text.split("\n").every((line) => line === "" || /^line \d{6} x{80}$/.test(line)), "cut on a complete line");
  assert.deepEqual(await home.client.expectOk("space.read", { path: `sessions/${sessionId}.hints.json` }), { kind: "withheld", reason: "May hold provider tokens — not shown" });
  assert.equal((await home.client.expectOk("space.read", { path: "local/migrations/x/inputs/0" })).kind, "withheld");
  await home.client.expectError("space.read", { path: "../etc/passwd" }, "invalid_request", /escapes/);
  await home.client.expectError("space.read", { path: ".git/HEAD" }, "invalid_request", /Git data/);
  await home.client.expectError("space.read", { path: "sessions" }, "invalid_request", /not a file/);
  await home.client.expectError("space.read", { path: "link" }, "invalid_request", /symbolic link/);
  await home.client.expectError("space.read", { path: "absent.txt" }, "not_found");
});
