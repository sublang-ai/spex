// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Projects as working folders paired with spex repositories (projects-9,
// projects-10, projects-21, projects-40): removal forgets the pair and
// deletes the clone, asking a second confirmation while the clone holds
// a unit no placement's `spex` holds, as last fetched or pushed or at
// their last shared commit — every unit of a local-only one — and leaves
// the working folder exactly as it was and every instance unchanged.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { parse as parseYaml } from "yaml";
import { WebSocket } from "ws";

import { CoreService } from "./service.js";
import { fakeAdapterImports } from "./testing/fake-adapter.js";
import { createScriptedCaptain } from "./testing/scripted-captain.js";
import { scratchDir } from "./testing/scratch.js";
import { bareOf, clonePath, createSpaceHarness, hostKey, placementOf, rowsOf } from "./testing/space-harness.js";
import type { Command, CommandResults, ServerMessage } from "./protocol.js";

const fixture = createSpaceHarness();
test.after(() => fixture.dispose());

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
      if (entry.isSymbolicLink()) out.set(relative(dir, full), `link:${readlinkSync(full)}`);
      else if (entry.isDirectory()) walk(full);
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
  // Git's exclude file with a mode of the reader's own, which the
  // exports' writes to it keep.
  chmodSync(join(folder, ".git", "info", "exclude"), 0o640);
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

  // The environment's installed tree as the removal finds it: it stays
  // with the folder byte for byte (environments-26).
  const inSpex = ([path]: [string, string]): boolean => path === ".spex" || path.startsWith(`.spex${sep}`);
  const spexBefore = new Map([...snapshot(folder)].filter(inSpex));
  assert.ok(spexBefore.size > 1, "the installed tree stands under .spex/");

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
    // The environment's installed tree stays with the folder, its own
    // (environments-26); every other file and the Git state are as they
    // were.
    assert.equal(readFileSync(join(folder, ".spex", ".gitignore"), "utf8"), "*\n", "the environment's .spex/ stays");
    assert.deepEqual(new Map([...snapshot(folder)].filter(inSpex)), spexBefore, "the installed tree stays as it was");
    const after = new Map([...snapshot(folder)].filter((entry) => !inSpex(entry)));
    assert.deepEqual(after, before, "the working folder's files and Git state are as they were");

    // A project whose spex repository has reached the host goes on the
    // first confirm alone.
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
      rowsOf(m.state).some((repository) => repository.key === again.id && repository.sync.phase === "done"), 30_000);
    await client.ok("project.remove", { projectId: again.id });
    assert.ok(!existsSync(join(dataDir, "workspace", "tester", "fixture-spex")));
    assert.notEqual(git(bare, "rev-parse", "spex"), "", "nothing on the host changed");
  } finally {
    client.close();
    await service.stop();
  }
});

test("projects-40, projects-9: a project placed at two stand-in instances, while a session neither placement's `spex` holds stands, asks the second confirmation naming that one unit, deleting nothing; once every unit is held by one placement or the other — the sessions synced while the first's transport failed held by the second alone — it is removed on the first confirm alone, nothing at either instance changed", async (t) => {
  const { gitFolder, addFolder, startHome, startHost, signIn, runTurn } = fixture;
  const first = await startHost();
  const second = await startHost({ displayName: "Second stand-in", person: { id: "1002", login: "bob", displayName: "Bob" } });
  const home = await startHome("removal-placed", { host: first, project: false });
  t.after(() => home.stop());
  // Signed in to both: your own group created at the first, then placed
  // at the second, waiting there for Continue (space-94).
  let mark = home.client.mark();
  await signIn(home, first);
  await home.client.waitRepository(mark, "ada/ada-spex", (repository) => repository.sync.phase === "done", 30_000);
  mark = home.client.mark();
  await signIn(home, second);
  await home.client.waitRepository(mark, "ada/ada-spex", (repository) => repository.sync.phase !== "running" && repository.placements[1]?.outcome?.kind === "waiting", 30_000);

  // A fixture repository whose spex repository is created in the
  // first's acme and then placed in the second's, both synced.
  const { key: local } = await addFolder(home, gitFolder("atlas"));
  mark = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: first.url, groupId: "2002", name: "atlas" } });
  const key = hostKey(first, "acme/atlas-spex");
  await home.client.waitRepository(mark, key, (repository) => repository.sync.phase === "done", 30_000);
  const placed = await home.client.settle("space.place", { repository: key, choice: { kind: "create", instance: second.url, groupId: "2002", name: "atlas" }, noticed: true }, 30_000);
  assert.deepEqual(placed.placements.map((line) => [line.attached, line.outcome?.kind]), [[true, "synced"], [true, "synced"]]);
  const clone = clonePath(home.dataDir, key);
  const firstBare = bareOf(first, key);
  const secondBare = second.script.repositories.find((repository) => repository.group.fullPath === "acme" && repository.path === "atlas-spex")?.bare;
  assert.ok(secondBare, "created at the second");
  const sessionsAt = (bare: string): string[] => git(bare, "ls-tree", "-r", "--name-only", "spex", "sessions").split("\n").filter((path) => path !== "");

  // The first's transport failing, a session's turn reaches the second
  // alone: the first's line stops at Check, the second's syncs.
  first.script.failTransport(503);
  t.after(() => first.script.failTransport(null));
  const reached = await runTurn(home, key, "Note the plan");
  const synced = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.deepEqual(synced.placements.map((line) => line.outcome?.kind), ["stopped", "synced"]);
  assert.ok(sessionsAt(secondBare).some((path) => path.startsWith(`sessions/${reached}`)), "the second holds the session");
  assert.ok(!sessionsAt(firstBare).some((path) => path.startsWith(`sessions/${reached}`)), "the first does not");

  // A second session's turn, synced nowhere: the one unit neither
  // placement holds asks the second confirmation, naming that one unit;
  // the session the second alone holds is not counted (projects-9).
  const unsent = await runTurn(home, key, "Draft the next step");
  const refused = await home.client.command("project.remove", { projectId: key });
  assert.ok(!refused.ok, "the first confirm is refused");
  assert.equal(refused.error.code, "conflict");
  assert.match(refused.error.message, /^1 record has not reached the host/);
  assert.deepEqual((refused.error as { details?: unknown }).details, { units: 1 });
  assert.ok(existsSync(join(clone, ".git")), "nothing is deleted before the second confirm");

  // Synced while the first still fails, every unit is held by one
  // placement or the other — both sessions by the second alone — and the
  // removal goes on the first confirm alone (projects-9, projects-10).
  const again = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.deepEqual(again.placements.map((line) => line.outcome?.kind), ["stopped", "synced"]);
  assert.ok(sessionsAt(secondBare).some((path) => path.startsWith(`sessions/${unsent}`)), "the second holds the second session");
  assert.deepEqual(sessionsAt(firstBare), [], "the first holds neither session");
  first.script.failTransport(null);
  const atFirst = git(firstBare, "rev-parse", "spex");
  const atSecond = git(secondBare, "rev-parse", "spex");
  assert.equal(await home.client.expectOk("project.remove", { projectId: key }), null);
  assert.ok(!existsSync(clone), "the clone is gone");
  assert.ok(!(await home.client.expectOk("project.list", {})).some((project) => project.id === key), "no project card for it remains");
  assert.deepEqual([git(firstBare, "rev-parse", "spex"), git(secondBare, "rev-parse", "spex")], [atFirst, atSecond], "nothing at either instance changed");
});

test("projects-9, projects-40: a project whose one placement holds a peer's change to a unit this device left unchanged since their last shared commit — fetched, not merged — counts that unit as reached: a unit changed here asks the second confirmation naming it alone, and without it the removal goes on the first confirm, nothing at the instance changed", async (t) => {
  const { gitFolder, addFolder, startHome, startHost, signIn, peerClone, peerPush } = fixture;
  const host = await startHost();
  const home = await startHome("removal-incoming", { host, project: false });
  t.after(() => home.stop());
  let mark = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(mark, "ada/ada-spex", (repository) => repository.sync.phase === "done", 30_000);
  const { key: local } = await addFolder(home, gitFolder("cedar"));
  mark = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: host.url, groupId: "2002", name: "cedar" } });
  const key = hostKey(host, "acme/cedar-spex");
  await home.client.waitRepository(mark, key, (repository) => repository.sync.phase === "done", 30_000);
  const clone = clonePath(home.dataDir, key);
  const bare = bareOf(host, key);
  writeFileSync(join(clone, "notes.md"), "as this device wrote it\n");
  assert.equal((await home.client.settle("space.sync", { repository: key }, 30_000)).sync.phase, "done");

  // A peer rewrites the unit at the placement, and this device fetches
  // that without merging it: the clone holds it as at their last shared
  // commit (space-12).
  await peerPush(peerClone(bare), (dir) => { writeFileSync(join(dir, "notes.md"), "as a peer rewrote it\n"); });
  const fetched = await home.client.settle("space.fetch", { repository: key }, 30_000);
  assert.deepEqual(placementOf(fetched, host.url).incoming.map((unit) => unit.unit), ["notes.md"]);

  // A unit changed here and sent nowhere asks the second confirmation,
  // naming it alone (projects-9).
  writeFileSync(join(clone, "draft.md"), "changed here, sent nowhere\n");
  const refused = await home.client.command("project.remove", { projectId: key });
  assert.ok(!refused.ok, "the first confirm is refused");
  assert.equal(refused.error.code, "conflict");
  assert.deepEqual((refused.error as { details?: unknown }).details, { units: 1 });
  assert.ok(existsSync(join(clone, ".git")), "nothing is deleted before the second confirm");

  // Without it, the unit only the peer changed has reached the
  // placement, and the removal goes on the first confirm alone.
  rmSync(join(clone, "draft.md"));
  const atHost = git(bare, "rev-parse", "spex");
  assert.equal(await home.client.expectOk("project.remove", { projectId: key }), null);
  assert.ok(!existsSync(clone), "the clone is gone");
  assert.equal(git(bare, "rev-parse", "spex"), atHost, "nothing at the instance changed");
});
