// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Projects as working folders paired with spex repositories (projects-9,
// projects-10, projects-21): removal forgets the pair and deletes the
// clone, asking a second confirmation while the clone holds what has not
// reached the host, and leaves the working folder exactly as it was; a
// config write never recreates a clone that is gone (playbook-library-104).

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import { WebSocket } from "ws";

import { CoreService } from "./service.js";
import { defaultSpawner, type LineSpawner } from "./compile.js";
import { AUTHORING_SOURCE, authoringScript } from "./testing/authoring.js";
import { fakeAdapterImports } from "./testing/fake-adapter.js";
import { createScriptedCaptain } from "./testing/scripted-captain.js";
import { scratchDir } from "./testing/scratch.js";
import { STUB_SLC_RELEASE_FILE, stubSlcScriptedSource } from "./testing/stub-slc.js";
import type { Command, CommandResults, DraftInfo, ServerMessage } from "./protocol.js";

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
`;

const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "T", GIT_AUTHOR_EMAIL: "t@example.test", GIT_COMMITTER_NAME: "T", GIT_COMMITTER_EMAIL: "t@example.test" };
const git = (cwd: string, ...args: string[]): string => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", env: gitEnv, stdio: ["ignore", "pipe", "pipe"] }).trim();

class Client {
  private readonly socket: WebSocket;
  readonly messages: ServerMessage[] = [];
  private nextId = 0;
  constructor(port: number) {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/?token=test`);
    this.socket.on("message", (data) => { this.messages.push(JSON.parse(String(data)) as ServerMessage); });
  }
  open(): Promise<void> { return new Promise((resolveOpen, reject) => { this.socket.once("open", () => resolveOpen()); this.socket.once("error", reject); }); }
  close(): void { this.socket.close(); }
  async command<T extends Command["type"]>(type: T, fields: Omit<Extract<Command, { type: T }>, "type" | "id">): Promise<{ ok: true; result: CommandResults[T] } | { ok: false; error: { code: string; message: string; details?: Record<string, unknown> } }> {
    const id = `c${(this.nextId += 1)}`;
    this.socket.send(JSON.stringify({ type, id, ...fields }));
    for (let i = 0; i < 3000; i += 1) {
      const reply = this.messages.find((m) => m.type === "reply" && m.id === id);
      if (reply?.type === "reply") return reply.ok ? { ok: true, result: reply.result as CommandResults[T] } : { ok: false, error: reply.error };
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`${type}: no reply`);
  }
  async ok<T extends Command["type"]>(type: T, fields: Omit<Extract<Command, { type: T }>, "type" | "id">): Promise<CommandResults[T]> {
    const reply = await this.command(type, fields);
    if (!reply.ok) throw new Error(`${type}: ${reply.error.code} ${reply.error.message}`);
    return reply.result;
  }
  async until(check: (message: ServerMessage) => boolean, timeoutMs = 20_000): Promise<void> {
    const start = Date.now();
    while (!this.messages.some(check)) {
      if (Date.now() - start > timeoutMs) throw new Error("timeout");
      await new Promise((r) => setTimeout(r, 10));
    }
  }
}

/** Every file of a folder with its bytes and mode, `.git` included —
 * except what Git's own background maintenance creates and removes
 * meanwhile: its `maintenance.lock`, and any file gone by the time it
 * is read. */
function snapshot(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "maintenance.lock") continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        try {
          out.set(relative(dir, full), `${statSync(full).mode}:${readFileSync(full).toString("base64")}`);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
    }
  };
  walk(dir);
  return out;
}

async function boot(dataDir: string, home: string): Promise<{ service: CoreService; client: Client }> {
  const { imports } = fakeAdapterImports({ rules: [{ match: "route:", response: { result: '{"decision":"dispatch"}' } }], fallback: { result: "done" } });
  const captain = createScriptedCaptain(async (turn, context) => {
    await context.callPlayer("dev.coder", turn.prompt);
    await context.emitReply("Finished.");
  });
  const env = { PATH: process.env.PATH ?? "", HOME: home, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
  const service = await CoreService.start({
    token: "test", dataDir, own: "tester", env, home, adapterImports: imports, adapterRuntime: () => ({ usable: true }),
    captainFactory: async () => captain, watchConfig: false, spaceTransportTimeoutMs: 20_000,
  });
  const client = new Client(service.port());
  await client.open();
  return { service, client };
}

test("projects-21: removal deletes the clone behind a second confirm naming its one unit, and the folder stays untouched", async () => {
  const scratch = scratchDir("spex-project-removal-");
  const dataDir = join(scratch, "home");
  const home = join(scratch, "user");
  // The device has claude, so the environment exports to it (environments-8).
  mkdirSync(join(home, ".claude"), { recursive: true });
  const config = join(dataDir, "workspace", "tester", "tester-spex", "config");
  mkdirSync(config, { recursive: true });
  writeFileSync(join(config, "playbook.config.yaml"), CONFIG);
  const folder = join(scratch, "fixture");
  mkdirSync(folder);
  git(folder, "init", "-q");
  writeFileSync(join(folder, "README.md"), "# Fixture\n");
  git(folder, "add", "-A");
  git(folder, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "fixture");
  // The folder as it stood before Spex paired it: removal leaves it so,
  // the skills the environment exported there gone with the pair
  // (projects-9, environments-8).
  const before = snapshot(folder);

  let { service, client } = await boot(dataDir, home);
  const project = await client.ok("project.register", { path: folder });
  const clone = join(dataDir, "workspace", "tester", "fixture-spex");
  assert.ok(existsSync(clone));
  // One session in the local-only spex repository.
  const session = await client.ok("session.create", { projectId: project.id });
  await client.ok("turn.submit", { sessionId: session.id, text: "Read the fixture" });
  await client.until((m) => m.type === "session.state" && m.session.id === session.id && !m.session.live && m.session.turns > 0);
  assert.ok(existsSync(join(folder, ".claude", "skills", "code", "SKILL.md")), "the environment exported its skills into the folder");

  // The first confirm meets what would be lost, named by count: the
  // session's unit, and the environment the new spex repository
  // requests the built-in spec package in (storage-6, environments-11).
  const refused = await client.command("project.remove", { projectId: project.id });
  assert.ok(!refused.ok);
  assert.equal(refused.error.code, "conflict");
  assert.match(refused.error.message, /2 records have not reached the host/);
  assert.deepEqual(refused.error.details, { units: 2 });
  assert.ok(existsSync(clone), "nothing is deleted before the second confirm");

  // The second confirm removes it, announcing the session's removal.
  await client.ok("project.remove", { projectId: project.id, confirm: true });
  await client.until((m) => m.type === "session.removed" && m.sessionId === session.id);
  assert.ok(!existsSync(clone), "the clone is gone");
  assert.deepEqual(await client.ok("project.list", {}), []);

  client.close();
  await service.stop();
  ({ service, client } = await boot(dataDir, home));
  try {
    assert.deepEqual(await client.ok("project.list", {}), []);
    assert.deepEqual(await client.ok("session.list", {}), []);
    const file = parseYaml(readFileSync(join(dataDir, "home.yaml"), "utf8")) as { folders: unknown[] };
    assert.deepEqual(file.folders, [], "no pair for it remains");
    assert.ok(!existsSync(clone));
    assert.deepEqual(snapshot(folder), before, "the working folder's files and Git state are as they were");

    // The project registered again, its spex repository synced to a host.
    const bare = join(scratch, "host.git");
    execFileSync("git", ["init", "-q", "--bare", "-b", "spex", bare]);
    const again = await client.ok("project.register", { path: folder });
    const second = await client.ok("session.create", { projectId: again.id });
    await client.ok("turn.submit", { sessionId: second.id, text: "Read it again" });
    await client.until((m) => m.type === "session.state" && m.session.id === second.id && !m.session.live && m.session.turns > 0);
    await client.ok("space.remote.set", { repository: again.id, url: bare });
    const from = client.messages.length;
    await client.ok("space.sync", { repository: again.id });
    await client.until((m) => client.messages.indexOf(m) >= from && m.type === "space.state" &&
      m.state.groups.some((group) => group.repositories.some((repository) => repository.key === again.id && repository.sync.phase === "done")), 30_000);
    const synced = (phase: string, since: number) => (m: ServerMessage) => client.messages.indexOf(m) >= since && m.type === "space.state" &&
      m.state.groups.some((group) => group.repositories.some((repository) => repository.key === again.id && repository.sync.phase === phase));

    // A later turn whose push the host refuses has not reached it: after
    // a restart, which remembers no check, the first confirm still names
    // it (projects-9).
    const hook = join(bare, "hooks", "pre-receive");
    writeFileSync(hook, "#!/bin/sh\nexit 1\n");
    chmodSync(hook, 0o755);
    await client.ok("turn.submit", { sessionId: second.id, text: "Read it once more" });
    await client.until((m) => m.type === "session.state" && m.session.id === second.id && !m.session.live && m.session.turns > 1);
    const refusedFrom = client.messages.length;
    await client.ok("space.sync", { repository: again.id });
    await client.until(synced("stopped", refusedFrom), 30_000);
    const hostHead = git(bare, "rev-parse", "spex");
    client.close();
    await service.stop();
    ({ service, client } = await boot(dataDir, home));
    const lacking = await client.command("project.remove", { projectId: again.id });
    assert.ok(!lacking.ok, "the refused push is not taken for the host's");
    assert.equal(lacking.error.code, "conflict");
    assert.match(lacking.error.message, /1 record has not reached the host/);
    assert.deepEqual(lacking.error.details, { units: 1 });
    assert.ok(existsSync(join(dataDir, "workspace", "tester", "fixture-spex")), "nothing is deleted before the second confirm");
    assert.equal(git(bare, "rev-parse", "spex"), hostHead);

    // Once a sync has pushed it, the first confirm alone removes it.
    rmSync(hook);
    const pushedFrom = client.messages.length;
    await client.ok("space.sync", { repository: again.id });
    await client.until(synced("done", pushedFrom), 30_000);
    await client.ok("project.remove", { projectId: again.id });
    assert.ok(!existsSync(join(dataDir, "workspace", "tester", "fixture-spex")));
    assert.notEqual(git(bare, "rev-parse", "spex"), "", "nothing on the host changed");
  } finally {
    client.close();
    await service.stop();
  }
});

test("projects-21: removal waits for an authoring session's turn, compile and enabling, naming it, and once idle removes the clone for good", async () => {
  const scratch = scratchDir("spex-project-removal-authoring-");
  const dataDir = join(scratch, "home");
  const home = join(scratch, "user");
  const config = join(dataDir, "workspace", "tester", "tester-spex", "config");
  mkdirSync(config, { recursive: true });
  writeFileSync(join(config, "playbook.config.yaml"), CONFIG);
  const folder = join(scratch, "fixture");
  mkdirSync(folder);
  git(folder, "init", "-q");
  // The stub slc holds each compile in its first phase until released.
  const stub = join(scratch, "stub-slc.cjs");
  writeFileSync(stub, stubSlcScriptedSource(["ok"], "['Triager', 'Verifier']", { hold: true }));
  const authoring = authoringScript();
  const { imports } = fakeAdapterImports({
    rules: [{ match: "Boss: hold the turn", response: { deltas: ["working"], result: "", untilAborted: true } }, ...(authoring.rules ?? [])],
    ...(authoring.fallback ? { fallback: authoring.fallback } : {}),
  });
  // The toolchain probe wants a system Node; the stub slc runs for real.
  const spawner: LineSpawner = (command, args, cwd, onLine, signal, spawnEnv) => {
    if (args.length === 1 && args[0] === "--version" && command !== process.execPath) {
      onLine("v24.1.0");
      return Promise.resolve(0);
    }
    return defaultSpawner(command, args, cwd, onLine, signal, spawnEnv);
  };
  const env = { PATH: process.env.PATH ?? "", HOME: home, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", SPEX_SLC: `${process.execPath} ${stub}` };
  const service = await CoreService.start({
    token: "test", dataDir, own: "tester", env, home, adapterImports: imports, adapterRuntime: () => ({ usable: true }),
    watchConfig: false, compileSpawner: spawner,
  });
  const client = new Client(service.port());
  await client.open();
  try {
    const projectId = (await client.ok("project.register", { path: folder })).id;
    const clone = join(dataDir, "workspace", "tester", "fixture-spex");
    const environmentIdle = async (): Promise<void> => {
      const start = Date.now();
      while ((await client.ok("environment.get", { repository: projectId })).busy !== null) {
        if (Date.now() - start > 60_000) throw new Error("timeout waiting for the environment");
        await new Promise((r) => setTimeout(r, 25));
      }
    };
    const latest = (id: string): DraftInfo | undefined => client.messages
      .filter((m): m is Extract<ServerMessage, { type: "draft.state" }> => m.type === "draft.state" && m.draft.id === id).at(-1)?.draft;
    const settled = async (id: string, check: (draft: DraftInfo) => boolean): Promise<void> => {
      const start = Date.now();
      for (let draft = latest(id); !(draft && check(draft)); draft = latest(id)) {
        if (Date.now() - start > 60_000) throw new Error(`timeout waiting for ${id}`);
        await new Promise((r) => setTimeout(r, 10));
      }
    };
    /** Removal is refused busy naming what runs, and the clone stays. */
    const refusedNaming = async (id: string): Promise<void> => {
      const reply = await client.command("project.remove", { projectId, confirm: true });
      assert.ok(!reply.ok, `removal waits for ${id}`);
      assert.equal(reply.error.code, "busy");
      assert.match(reply.error.message, new RegExp(`\\b${id}\\b`), "the refusal names what runs");
      assert.ok(existsSync(clone), "the clone stays");
    };
    await environmentIdle();

    // An authoring turn held by the fake.
    await client.ok("draft.create", { projectId, draftId: "held" });
    await client.ok("draft.send", { projectId, draftId: "held", text: "hold the turn" });
    await settled("held", (draft) => draft.activity === "turn");
    await refusedNaming("held");
    await client.ok("draft.abort", { projectId, draftId: "held" });
    await settled("held", (draft) => draft.activity === "idle");

    // A compile held by the stub slc in its first phase.
    await client.ok("draft.create", { projectId, draftId: "slow" });
    await client.ok("draft.source.write", { projectId, draftId: "slow", content: AUTHORING_SOURCE.replaceAll("<id>", "slow") });
    const compiling = client.command("draft.compile", { projectId, draftId: "slow" });
    await client.until((m) => m.type === "compile.progress" && m.playbookId === "slow" && m.line.startsWith("→ normalize"), 60_000);
    await refusedNaming("slow");
    await client.ok("compile.abort", { playbookId: "slow" });
    const aborted = await compiling;
    assert.ok(!aborted.ok && aborted.error.code === "aborted");
    await settled("slow", (draft) => draft.activity === "idle");

    // An enabling held at its re-package, where it loads the entry the
    // compiler emitted (playbook-library-100).
    await client.ok("draft.create", { projectId, draftId: "triage" });
    await client.ok("draft.source.write", { projectId, draftId: "triage", content: AUTHORING_SOURCE.replaceAll("<id>", "triage") });
    const artifactDir = join(folder, "spex-packages", "triage", "playbooks", "en", "triage");
    writeFileSync(join(artifactDir, STUB_SLC_RELEASE_FILE), "");
    await client.ok("draft.compile", { projectId, draftId: "triage" });
    await settled("triage", (draft) => draft.activity === "idle" && draft.proposal !== undefined);
    const reached = join(scratch, "repackage-reached");
    const release = join(scratch, "repackage-release");
    const entry = join(artifactDir, "triage.ts");
    writeFileSync(entry, [
      'import { existsSync as heldExists, writeFileSync as heldWrite } from "node:fs";',
      `heldWrite(${JSON.stringify(reached)}, "");`,
      `while (!heldExists(${JSON.stringify(release)})) await new Promise((resolve) => setTimeout(resolve, 25));`,
      readFileSync(entry, "utf8"),
    ].join("\n"));
    const registering = client.command("draft.register", {
      projectId,
      draftId: "triage",
      command: "triage",
      intent: "Label new issues",
      bindings: { Triager: "dev.triager", Verifier: "dev.coder" },
      newPlayers: { "dev.triager": { adapter: "claude" } },
    });
    const start = Date.now();
    while (!existsSync(reached)) {
      if (Date.now() - start > 60_000) throw new Error("timeout waiting for the held re-package");
      await new Promise((r) => setTimeout(r, 25));
    }
    await refusedNaming("triage");
    writeFileSync(release, "");
    const enabled = await registering;
    assert.ok(enabled.ok, `the enabling finishes: ${enabled.ok ? "" : enabled.error.message}`);
    await settled("triage", (draft) => draft.activity === "idle");

    // Once nothing runs, removal deletes the clone for good and
    // announces each authoring session's departure.
    await environmentIdle();
    const from = client.messages.length;
    await client.ok("project.remove", { projectId, confirm: true });
    assert.ok(!existsSync(clone), "the clone is gone");
    await client.until((m) => client.messages.indexOf(m) >= from && m.type === "draft.removed" && m.draftId === "triage");
    const removed = client.messages.slice(from).filter((m): m is Extract<ServerMessage, { type: "draft.removed" }> => m.type === "draft.removed");
    assert.deepEqual(removed.map((m) => `${m.draftId} ${m.projectId}`).sort(), ["held", "slow", "triage"].map((id) => `${id} ${projectId}`));
    await new Promise((r) => setTimeout(r, 500));
    assert.ok(!existsSync(clone), "nothing under workspace/ is recreated");
    assert.deepEqual(readdirSync(join(dataDir, "workspace", "tester")), ["tester-spex"], "only your own group's spex repository stands");
  } finally {
    client.close();
    await service.stop();
  }
});

test("playbook-library-104: a config write to a project whose spex repository's clone is gone is refused, never recreating the clone", async () => {
  const scratch = scratchDir("spex-project-config-gone-");
  const dataDir = join(scratch, "home");
  const home = join(scratch, "user");
  const config = join(dataDir, "workspace", "tester", "tester-spex", "config");
  mkdirSync(config, { recursive: true });
  writeFileSync(join(config, "playbook.config.yaml"), CONFIG);
  const folder = join(scratch, "fixture");
  mkdirSync(folder);
  git(folder, "init", "-q");
  const { service, client } = await boot(dataDir, home);
  try {
    const project = await client.ok("project.register", { path: folder });
    const clone = join(dataDir, "workspace", "tester", "fixture-spex");
    const start = Date.now();
    while ((await client.ok("environment.get", { repository: project.id })).busy !== null) {
      if (Date.now() - start > 60_000) throw new Error("timeout waiting for the environment");
      await new Promise((r) => setTimeout(r, 25));
    }
    // The clone leaves this device while its pair stands.
    rmSync(clone, { recursive: true, force: true });
    const refused = await client.command("config.edit", { repository: project.id, op: { kind: "playbook.add", playbookId: "code", roles: { coder: "dev.coder" } } });
    assert.ok(!refused.ok, "the write is refused");
    assert.match(refused.error.message, /no longer on this device/);
    assert.ok(!existsSync(clone), "the clone is not recreated");
  } finally {
    client.close();
    await service.stop();
  }
});
