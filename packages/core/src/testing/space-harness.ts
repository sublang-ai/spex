// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Real Groups integration fixtures; each file owns its scratch and cores.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { WebSocket } from "ws";
import { CoreService, type CoreServiceOptions } from "../service.js";
import { fakeAdapterImports } from "./fake-adapter.js";
import { createScriptedCaptain } from "./scripted-captain.js";
import { startStandinHost, type StandinHost } from "./standin-host.js";
import type { LineSpawner } from "../compile.js";
import type { Command, CommandResults, GroupsState, RepositoryState, ServerMessage, SpaceStateMessage, SyncStep, SpaceOp } from "../protocol.js";

/** Every scratch home's own group: a name no device user collides with. */
export const OWN = "tester";
export const OWN_KEY = `${OWN}/${OWN}-spex`;

/** One repository's state out of the Groups state. */
export function repositoryOf(state: GroupsState, key: string): RepositoryState {
  for (const group of state.groups) {
    const found = group.repositories.find((repository) => repository.key === key);
    if (found) return found;
  }
  throw new Error(`no repository ${key} in ${JSON.stringify(state.groups.map((group) => group.repositories.map((repository) => repository.key)))}`);
}

const describe = (state: GroupsState): string =>
  JSON.stringify(state.groups.flatMap((group) => group.repositories.map((repository) => `${repository.key}:${JSON.stringify(repository.sync)}`)));

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
  async command<T extends Command["type"]>(type: T, fields: Omit<Extract<Command, { type: T }>, "type" | "id">): Promise<{ ok: true; result: CommandResults[T] } | { ok: false; error: { code: string; message: string; details?: Record<string, unknown> } }> {
    const id = `c${(this.nextId += 1)}`;
    this.socket.send(JSON.stringify({ type, id, ...fields }));
    const reply = await this.waitFor((m) => m.type === "reply" && m.id === id, 30_000);
    if (reply.type !== "reply") throw new Error("unreachable");
    return reply.ok ? { ok: true, result: reply.result as CommandResults[T] } : { ok: false, error: reply.error };
  }
  async expectOk<T extends Command["type"]>(type: T, fields: Omit<Extract<Command, { type: T }>, "type" | "id">): Promise<CommandResults[T]> {
    const reply = await this.command(type, fields);
    if (!reply.ok) throw new Error(`${type} failed: ${reply.error.code} ${reply.error.message}`);
    // The state-shaped replies carry the GroupsState shape (space-30).
    if (type === "space.get" || type === "space.remote.set" || type === "space.signout") assertGroupsState(reply.result as GroupsState);
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
      if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting; got ${JSON.stringify(this.messages.slice(-12).map((m) => m.type === "space.state" ? `space.state:${describe(m.state)}` : m.type))}`);
      await sleep(10);
    }
  }
  /** The first space.state message at or after `from` matching `check`. */
  async waitSpace(from: number, check: (state: GroupsState) => boolean, timeoutMs = 20_000): Promise<GroupsState> {
    const start = Date.now();
    for (;;) {
      for (let i = from; i < this.messages.length; i += 1) {
        const message = this.messages[i];
        if (message.type !== "space.state") continue;
        assertGroupsState(message.state);
        if (check(message.state)) return message.state;
      }
      if (Date.now() - start > timeoutMs) {
        const seen = this.messages.slice(from).filter((m): m is SpaceStateMessage => m.type === "space.state").map((m) => describe(m.state));
        throw new Error(`timeout waiting for space state; saw ${seen.join(" | ")}`);
      }
      await sleep(10);
    }
  }
  /** The first state at or after `from` where one repository matches. */
  async waitRepository(from: number, key: string, check: (repository: RepositoryState) => boolean, timeoutMs = 20_000): Promise<RepositoryState> {
    const state = await this.waitSpace(from, (candidate) => {
      try { return check(repositoryOf(candidate, key)); } catch { return false; }
    }, timeoutMs);
    return repositoryOf(state, key);
  }
  /** Run a long command on one repository — it replies accepted at once
   * (space-29) — and wait until that repository's machine leaves
   * running. Broadcasts coalesce, and one assembled before the command
   * took effect can arrive after it still reading the previous phase: a
   * reading that is not running settles the command only after one of
   * its own running readings, or where a read made after the reply
   * agrees the machine no longer runs. */
  async settle<T extends "space.sync" | "space.fetch">(type: T, fields: Omit<Extract<Command, { type: T }>, "type" | "id">): Promise<RepositoryState> {
    const key = (fields as { repository: string }).repository;
    const from = this.messages.length;
    // The core runs in this process: its steps' `since` reads this clock.
    const sent = Date.now();
    assert.deepEqual(await this.expectOk(type, fields), { accepted: true });
    const start = Date.now();
    let ran = false;
    for (let next = from; ;) {
      for (; next < this.messages.length; next += 1) {
        const message = this.messages[next];
        if (message.type !== "space.state") continue;
        assertGroupsState(message.state);
        let repository: RepositoryState;
        try { repository = repositoryOf(message.state, key); } catch { continue; }
        const { sync } = repository;
        if (sync.phase === "running") { ran ||= sync.since >= sent; continue; }
        if (ran) return repository;
        const fresh = await this.repository(key);
        if (fresh.sync.phase !== "running") return fresh;
      }
      if (Date.now() - start > 20_000) {
        const seen = this.messages.slice(from).filter((m): m is SpaceStateMessage => m.type === "space.state").map((m) => describe(m.state));
        throw new Error(`timeout waiting for ${key} to settle; saw ${seen.join(" | ")}`);
      }
      await sleep(10);
    }
  }
  /** One repository's state, read afresh. */
  async repository(key: string): Promise<RepositoryState> {
    return repositoryOf(await this.expectOk("space.get", {}), key);
  }
  /** Every reading of one spex repository — under any of its keys, as a
   * move changes it — in the states broadcast at or after `from`, up to
   * the first reading its sync done. */
  readings(from: number, keys: string[]): RepositoryState[] {
    const out: RepositoryState[] = [];
    for (let i = from; i < this.messages.length; i += 1) {
      const message = this.messages[i];
      if (message.type !== "space.state") continue;
      for (const key of keys) {
        let repository: RepositoryState;
        try { repository = repositoryOf(message.state, key); } catch { continue; }
        out.push(repository);
        if (repository.sync.phase === "done") return out;
      }
    }
    return out;
  }
  mark(): number { return this.messages.length; }
}

function sleep(ms: number): Promise<void> { return new Promise((resolveSleep) => setTimeout(resolveSleep, ms)); }

const GROUPS_KEYS = ["account", "diagnostics", "git", "groups", "home", "host", "issues", "readAt", "signIn"];

const REPOSITORY_KEYS = ["branch", "code", "conflicts", "folder", "id", "incoming", "key", "lastSync", "local", "members", "name", "noticed", "own", "reason", "remote", "state", "sync", "visibility", "waiting"];

const BRANCH_KEYS = ["ahead", "behind", "checkedAt", "hostEmpty", "mergePending", "unrelated"];

const PHASES = new Set(["idle", "running", "choices", "unrelated", "stopped", "done"]);

const CHANGES = new Set(["new", "updated", "deleted"]);

/** Every reply and broadcast carries the GroupsState shape (space-30). */
export function assertGroupsState(state: GroupsState): void {
  assert.deepEqual(Object.keys(state).sort(), GROUPS_KEYS);
  assert.ok(typeof state.home === "string" && Array.isArray(state.diagnostics) && Array.isArray(state.groups));
  // The sign-in's phase: idle carries nothing but the host's sign-out,
  // with the login, and that only while signed out (space-30).
  const signIn = state.signIn;
  assert.ok(["idle", "running", "failed"].includes(signIn.phase), JSON.stringify(signIn));
  if (signIn.phase === "idle" && signIn.signedOut !== undefined) {
    assert.deepEqual(Object.keys(signIn).sort(), ["phase", "signedOut"]);
    assert.ok(signIn.signedOut.by === "host" && typeof signIn.signedOut.login === "string" && Object.keys(signIn.signedOut).length === 2, JSON.stringify(signIn));
    assert.equal(state.account, null, "the host's sign-out is said only while signed out");
  } else if (signIn.phase === "idle") {
    assert.deepEqual(Object.keys(signIn), ["phase"]);
  }
  for (const group of state.groups) {
    assert.deepEqual(Object.keys(group).sort(), ["fullPath", "id", "name", "own", "repositories", "url"]);
    for (const repository of group.repositories) {
      assert.deepEqual(Object.keys(repository).sort(), REPOSITORY_KEYS);
      assert.ok(PHASES.has(repository.sync.phase), `phase ${JSON.stringify(repository.sync)}`);
      assert.ok(["local-only", "reachable", "read-only", "unreachable", "absent"].includes(repository.state));
      if (repository.branch !== null) assert.deepEqual(Object.keys(repository.branch).sort(), BRANCH_KEYS);
      for (const unit of [...repository.local, ...repository.incoming, ...repository.conflicts.map((c) => c.unit)]) {
        assert.ok(typeof unit.unit === "string" && typeof unit.label === "string" && CHANGES.has(unit.change) && Array.isArray(unit.paths) && typeof unit.diff === "boolean", JSON.stringify(unit));
      }
      for (const conflict of repository.conflicts) {
        assert.ok(CHANGES.has(conflict.mine.change) && CHANGES.has(conflict.remote.change), JSON.stringify(conflict));
      }
      if (repository.lastSync !== null) assert.deepEqual(Object.keys(repository.lastSync).sort(), ["at", "received", "sent"]);
    }
  }
}

interface Home {
  service: CoreService;
  client: Client;
  dataDir: string;
  projectDir: string;
  configPath: string;
  hooks: { beforeStep?: (event: { op: SpaceOp; step: SyncStep; repository: string }) => void | Promise<void> };
  stop(): Promise<void>;
}

/** Your own group's clone in a scratch home: under the name its
 * `home.yaml` records, once it has one — a sign-in renames it. */
export function ownClone(dataDir: string): string {
  let own = OWN;
  try { own = /^own: (\S+)$/m.exec(readFileSync(join(dataDir, "home.yaml"), "utf8"))?.[1] ?? OWN; } catch { own = OWN; }
  return join(dataDir, "workspace", own, `${own}-spex`);
}

/** A project's clone in a scratch home. */
export function clonePath(dataDir: string, key: string): string {
  return join(dataDir, "workspace", ...key.split("/"));
}

/** A scratch home's preferences file, as written. */
export const prefsOf = (dataDir: string): Record<string, unknown> =>
  (JSON.parse(readFileSync(join(dataDir, "local", "prefs.json"), "utf8")) as { prefs: Record<string, unknown> }).prefs;

export function createSpaceHarness() {
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
    roles:
      coder: dev.coder
`;

  /** The test's own Git: isolated config and a fixed identity. */
  const peerEnv = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "Peer", GIT_AUTHOR_EMAIL: "peer@example.test", GIT_COMMITTER_NAME: "Peer", GIT_COMMITTER_EMAIL: "peer@example.test", LC_ALL: "C" };
  const git = (cwd: string, ...args: string[]): string => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", env: peerEnv, stdio: ["ignore", "pipe", "pipe"] }).trim();

  /** The core's environment: PATH, a scratch HOME, and Git configured only
   * through it — no identity by default, so the fallback engages (space-32). */
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
    git(dir, "init", "-q", "--bare", "-b", "spex");
    return dir;
  }

  /** The core environment of a home standing in for another device: Git
   * configured with that device's own identity. Every scratch home runs
   * on this host, so under the fallback identity (space-32) two homes
   * starting one project's spex repository within one clock second write
   * the same root commit, and their histories are one — never the
   * unrelated pair a join meets (space-13). */
  function otherDevice(name: string): Record<string, string> {
    const file = join(scratch, `${name}.gitconfig`);
    writeFileSync(file, `[user]\n\tname = ${name}\n\temail = ${name}@example.test\n`);
    return { GIT_CONFIG_GLOBAL: file };
  }

  /** A Git working folder named `name`. */
  function gitFolder(name: string): string {
    const dir = join(mkdtempSync(join(scratch, `${name}-`)), name);
    mkdirSync(dir);
    git(dir, "init", "-q");
    return dir;
  }

  /** A Git working folder bearing another folder's name, so the second
   * home's spex repository takes the same key and `project.json`. */
  function sameNameFolder(original: string, side: string): string {
    const dir = join(mkdtempSync(join(scratch, `${side}-`)), basename(original));
    mkdirSync(dir);
    git(dir, "init", "-q");
    return dir;
  }

  /** Add a working folder: it pairs with a local spex repository in your
   * own group (storage-6); returns its key and its clone. */
  async function addFolder(home: Home, path: string): Promise<{ key: string; clone: string }> {
    const project = await home.client.expectOk("project.register", { path });
    return { key: project.id, clone: clonePath(home.dataDir, project.id) };
  }

  function sleepingSsh(): { script: string; pidFile: string } {
    const script = join(scratch, `sleep-ssh-${randomUUID().slice(0, 8)}.sh`);
    const pidFile = `${script}.pid`;
    writeFileSync(script, `#!/bin/sh\necho $$ > "${pidFile}"\nexec sleep 300\n`);
    chmodSync(script, 0o755);
    return { script, pidFile };
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

  /** Join a clone to a remote whose history it does not share — the
   * clone of a home with its own identity (`otherDevice`): the first
   * sync ends unrelated, the join asks for any conflict, "mine" answers
   * each. */
  async function joinRemote(home: Home, repository: string): Promise<RepositoryState> {
    const unrelated = await home.client.settle("space.sync", { repository });
    assert.equal(unrelated.sync.phase, "unrelated", JSON.stringify(unrelated.sync));
    let joined = await home.client.settle("space.sync", { repository, join: true });
    if (joined.sync.phase === "choices") {
      joined = await home.client.settle("space.sync", { repository, join: true, choices: Object.fromEntries(joined.conflicts.map((c) => [c.unit.unit, "mine" as const])) });
    }
    assert.equal(joined.sync.phase, "done", JSON.stringify(joined.sync));
    return joined;
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

  const hosts: StandinHost[] = [];

  /** A stand-in Git host (git-host-12) of this suite's own. */
  async function startHost(): Promise<StandinHost> {
    const host = await startStandinHost({ dir: mkdtempSync(join(scratch, "host-")) });
    hosts.push(host);
    return host;
  }

  /** Sign a home in at the stand-in through the flow its core runs —
   * the browser's redirect followed as the system browser would, or the
   * user code approved — and wait for the set-up to end (space-4). */
  async function signIn(home: Home, host: StandinHost): Promise<GroupsState> {
    const from = home.client.mark();
    const started = await home.client.expectOk("space.signin.start", {});
    if (started.flow === "browser") {
      const first = await fetch(started.url, { redirect: "manual" });
      const location = first.headers.get("location");
      assert.ok(location, `the stand-in answered ${first.status}`);
      await (await fetch(location)).text();
    } else {
      host.script.approveDevice(started.userCode);
    }
    return home.client.waitSpace(from, (state) => state.account !== null && state.signIn.phase === "idle", 30_000);
  }

  /** A real core on a scratch home whose configuration lies in your own
   * group's spex repository; `host` names the stand-in it signs in to. */
  async function startHome(name: string, options: { model?: string; env?: Record<string, string>; dataDir?: string; project?: boolean; host?: StandinHost; extra?: Partial<CoreServiceOptions> } = {}): Promise<Home> {
    const dataDir = options.dataDir ?? mkdtempSync(join(scratch, `${name}-`));
    const configPath = join(ownClone(dataDir), "config", "playbook.config.yaml");
    if (!existsSync(configPath)) { mkdirSync(join(ownClone(dataDir), "config"), { recursive: true }); writeFileSync(configPath, config(options.model ?? "claude-test")); }
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
      dataDir,
      own: OWN,
      adapterImports: imports,
      adapterRuntime: () => ({ usable: true }),
      captainFactory: async () => captain,
      env: coreEnv({ ...(options.host ? { SPEX_HOST_URL: options.host.url } : {}), ...(options.env ?? {}) }),
      home: userHome,
      watchConfig: false,
      // Real Git operations here run against local bare repositories, so
      // they must never race the transport watchdog: a loaded CI runner
      // pushed to a local path in more than half a second and the sync
      // stopped as "timeout", exactly as specified. Tests that assert the
      // watchdog itself shorten this through `extra`.
      spaceTransportTimeoutMs: 20_000,
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

  /** Every file of a directory except Git data and lease coordination, as path → bytes. */
  function snapshot(dir: string): Map<string, Buffer> {
    const out = new Map<string, Buffer>();
    const walk = (current: string): void => {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        if (entry.name === ".git" || /^\.lock|^\.lease|\.lock(?:\.|$)/.test(entry.name)) continue;
        const full = join(current, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile()) out.set(relative(dir, full), readFileSync(full));
      }
    };
    walk(dir);
    return out;
  }

  /** A peer working copy of the bare remote's `spex` branch, committing
   * as plain Git. */
  function peerClone(bare: string): string {
    const dir = mkdtempSync(join(scratch, "peer-"));
    git(dir, "clone", "-q", "--branch", "spex", bare, ".");
    return dir;
  }
  async function peerPush(dir: string, mutate: (dir: string) => void | Promise<void>): Promise<string> {
    git(dir, "fetch", "-q", "origin");
    git(dir, "reset", "-q", "--hard", "origin/spex");
    await mutate(dir);
    git(dir, "add", "-A", "--", ".");
    git(dir, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "peer change");
    git(dir, "push", "-q", "origin", "HEAD:spex");
    return git(dir, "rev-parse", "HEAD");
  }

  const turnRecords = (prompt: string, turnId: number, at = Date.now()): Record<string, unknown>[] => [
    { type: "turn_started", turnId, turn: { id: turnId, prompt }, timestamp: at },
    { type: "turn_finished", turnId, timestamp: at + 1 },
  ];

  return {
    scratch, config, git, bareRepo, otherDevice, gitFolder, sameNameFolder, addFolder, sleepingSsh, sleep, sleeperPid, joinRemote, hangingCompileSpawner, COMPILE_INPUT, startHome, startHost, signIn, runTurn, snapshot, peerClone, peerPush, turnRecords,
    dispose: async () => {
      await Promise.all(hosts.map((host) => host.close()));
      rmSync(scratch, { recursive: true, force: true });
    },
  };
}
