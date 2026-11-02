// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Core coverage of the Groups surface (space-37, space-39, space-51):
// real cores with substitute agents on scratch homes whose configuration
// lies in your own group's spex repository, each sync on one spex
// repository's clone, a bare repository standing in for the host's copy,
// an isolated Git configuration through the core's environment, and a
// sleeping GIT_SSH_COMMAND for the transport limit and Stop. The sync
// loop over two homes and the stand-in Git host each own a file budget.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { basename, join } from "node:path";
import { createSessionStore } from "@sublang/playbook/session-store";
import { WebSocket } from "ws";
import { seedHistorySession } from "./testing/demo.js";
import { Home } from "./home.js";
import type { SpaceHost } from "./space.js";
import type { Command, GroupsState, ServerMessage } from "./protocol.js";
import { clonePath, createSpaceHarness, OWN, OWN_KEY, ownClone, placementOf, prefsOf, repositoryOf, rowsOf } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
const { scratch, git, bareRepo, gitFolder, addFolder, sleepingSsh, holdingGit, sleep, sleeperPid, hangingCompileSpawner, COMPILE_INPUT, startHome, runTurn, peerClone, peerPush, turnRecords } = fixture;
test.after(() => fixture.dispose());

// ---------------------------------------------------------------------------
// space-37: your own group, its repositories, and the first sync
// ---------------------------------------------------------------------------

test("space-37: a fresh home lists your own group alone with its own repository, and the git guidance without git", async (t) => {
  const home = await startHome("fresh", { project: false });
  t.after(() => home.stop());
  const state = await home.client.expectOk("space.get", {});
  assert.ok(state.git.ok);
  assert.equal(state.home, home.dataDir);
  assert.deepEqual(state.instances, [], "no instance listed");
  assert.deepEqual(state.signIn, { phase: "idle" });
  assert.equal(state.own.name, OWN, "your own group alone");
  assert.deepEqual(state.own.repositories.map((repository) => repository.key), [OWN_KEY]);
  const own = state.own.repositories[0];
  assert.equal(own.name, `${OWN}-spex`);
  assert.equal(own.own, true);
  assert.equal(own.state, "local-only");
  assert.equal(own.code, null);
  assert.equal(own.folder, null);
  assert.deepEqual(own.placements, [], "local only, it holds no placement to have synced or checked");
  assert.equal(own.sync.phase, "idle");
  assert.equal(own.mergePending, false);
  assert.equal(git(ownClone(home.dataDir), "symbolic-ref", "--short", "HEAD"), "spex");
  assert.ok(git(ownClone(home.dataDir), "ls-files").split("\n").includes("config/playbook.config.yaml"));
  const empty = mkdtempSync(join(scratch, "nogit-"));
  const bare = await startHome("nogit", { env: { PATH: empty }, project: false });
  t.after(() => bare.stop());
  const without = await bare.client.expectOk("space.get", {});
  assert.equal(without.git.ok, false);
  assert.match((without.git as { guidance: string }).guidance, /Git is not installed/);
  assert.deepEqual(repositoryOf(without, OWN_KEY).placements, [], "no placement read without git");
});

test("space-37: a working folder added pairs with a local-only spex repository whose commits hold only portable files", async (t) => {
  const home = await startHome("init");
  t.after(() => home.stop());
  const project = await home.client.expectOk("project.register", { path: home.projectDir });
  const key = project.id;
  const clone = clonePath(home.dataDir, key);
  assert.equal(key, `${OWN}/${basename(home.projectDir)}-spex`);
  assert.deepEqual(project.repository, { key, name: `${basename(home.projectDir)}-spex`, group: OWN, own: true });
  const state = await home.client.expectOk("space.get", {});
  assert.deepEqual([state.own.name, state.instances], [OWN, []]);
  assert.deepEqual(state.own.repositories.map((repository) => repository.key), [OWN_KEY, key], "your own group's repository first");
  const row = repositoryOf(state, key);
  assert.equal(row.state, "local-only");
  assert.equal(row.own, false);
  assert.equal(row.folder, home.projectDir);
  assert.deepEqual([row.code, row.codeKind], ["Code only on this computer", "none"], "the folder has no remote of its own, its code only here");
  assert.equal(row.sync.phase, "idle");
  // Its clone begins on `spex` with one commit of the managed rules and
  // project.json, under the fallback identity, its environment
  // requesting the built-in spec package at the working folder's root,
  // never in the clone (space-32, storage-17, storage-6,
  // environments-26).
  assert.equal(git(clone, "symbolic-ref", "--short", "HEAD"), "spex");
  assert.equal(git(clone, "rev-list", "--count", "HEAD"), "1");
  assert.deepEqual(git(clone, "ls-files").split("\n"), [".gitattributes", ".gitignore", "project.json"]);
  assert.ok(existsSync(join(home.projectDir, "spex.yaml")) && existsSync(join(home.projectDir, "spex.lock")), "the environment stands in the working folder");
  assert.deepEqual(JSON.parse(readFileSync(join(clone, "project.json"), "utf8")), { format: 1, name: basename(home.projectDir), remote: null });
  assert.match(readFileSync(join(clone, ".gitignore"), "utf8"), /# BEGIN Spex managed storage rules/);
  assert.equal(git(clone, "log", "-1", "--format=%cn <%ce>"), `Spex <spex@${hostname()}>`);
  // A turn, provider hints and a viewed marker: the sync commits the
  // session and nothing that stays on this device (space-12).
  const sessionId = await runTurn(home, key, "First work");
  assert.ok(existsSync(join(clone, "sessions", `${sessionId}.json`)), "the session lives in its project's clone");
  writeFileSync(join(clone, "sessions", `${sessionId}.hints.json`), "{}");
  await home.client.expectOk("session.viewed", { sessionId, turnId: 1 });
  await home.client.expectOk("space.remote.set", { repository: key, url: bareRepo() });
  const done = await home.client.settle("space.sync", { repository: key });
  assert.equal(done.sync.phase, "done", JSON.stringify(done.sync));
  const tracked = git(clone, "ls-files").split("\n");
  assert.ok(tracked.includes(`sessions/${sessionId}.json`) && tracked.includes(`sessions/${sessionId}.replay.json`));
  // The environment's lock is the one tracked `.lock` (storage-1).
  for (const file of tracked.filter((path) => path !== "spex.lock")) assert.doesNotMatch(file, /\.hints\.json$|\.lock|^\.spex-/, `must not track ${file}`);
  assert.equal(prefsOf(home.dataDir)[`viewed:${sessionId}`], 1, "the viewed marker stays in this device's preferences");
  assert.match(git(clone, "log", "-1", "--format=%s"), /^Sync from /);
  assert.equal(git(clone, "log", "-1", "--format=%cn <%ce>"), `Spex <spex@${hostname()}>`);
});

test("space-37: setting a remote turns a repository reachable, refuses malformed and credentialed URLs, and clears the check", async (t) => {
  const home = await startHome("remote");
  t.after(() => home.stop());
  const { key, clone } = await addFolder(home, home.projectDir);
  // A clone no instance holds reaches one by a group picked for it
  // (space-11).
  await home.client.expectError("space.fetch", { repository: key }, "invalid_request", /^Add it to a group first$/);
  await home.client.expectError("space.sync", { repository: "tester/nowhere-spex" }, "not_found", /^nowhere is not on this computer — Refresh, then Retry$/);
  const bare = bareRepo();
  const set = await home.client.expectOk("space.remote.set", { repository: key, url: bare });
  assert.equal(repositoryOf(set, key).state, "reachable");
  // A remote the reader named is the path placement: no instance, read
  // as a report reads it (space-30, space-15).
  const line = placementOf(repositoryOf(set, key), null);
  assert.deepEqual([repositoryOf(set, key).placements.length, line.path, line.id, line.attached, line.state], [1, bare, null, true, "reachable"]);
  assert.equal(repositoryOf(set, OWN_KEY).state, "local-only", "only that repository");
  assert.equal(git(clone, "remote", "get-url", "origin"), bare);
  for (const [url, pattern] of [["", /malformed/], ["  ", /malformed/], ["git@example.com:a b.git", /malformed/], ["https://user:secret@example.com/x.git", /credential/]] as const) {
    await home.client.expectError("space.remote.set", { repository: key, url }, "invalid_request", pattern);
    assert.equal(git(clone, "remote", "get-url", "origin"), bare, `origin unchanged after ${JSON.stringify(url)}`);
  }
  const checked = await home.client.settle("space.fetch", { repository: key });
  assert.equal(checked.sync.phase, "idle");
  assert.equal(typeof placementOf(checked, null).branch?.checkedAt, "number");
  assert.equal(placementOf(checked, null).branch?.hostEmpty, true);
  const other = bareRepo();
  const changed = placementOf(repositoryOf(await home.client.expectOk("space.remote.set", { repository: key, url: other }), key), null);
  assert.equal(changed.branch?.checkedAt, null);
  assert.equal(changed.branch?.ahead, null);
  assert.equal(git(clone, "remote", "get-url", "origin"), other);
  const cleared = repositoryOf(await home.client.expectOk("space.remote.set", { repository: key, url: null }), key);
  assert.equal(cleared.state, "local-only");
  assert.deepEqual(cleared.placements, []);
  await home.client.expectError("space.sync", { repository: key }, "invalid_request", /^Add it to a group first$/);
});

test("space-37, space-22, storage-5: the first sync pushes spex to the empty host, sets the upstream and records sync:<repository>:<placement>:last under its path placement origin; naming another path placement removes it", async (t) => {
  const home = await startHome("first-push");
  t.after(() => home.stop());
  const { key, clone } = await addFolder(home, home.projectDir);
  await runTurn(home, key, "Push me");
  const bare = bareRepo();
  await home.client.expectOk("space.remote.set", { repository: key, url: bare });
  const done = await home.client.settle("space.sync", { repository: key });
  assert.equal(done.sync.phase, "done", JSON.stringify(done.sync));
  assert.ok(done.sync.phase === "done" && done.sync.pushed);
  assert.ok(done.sync.phase === "done" && done.sync.sent > 0);
  assert.equal(git(bare, "rev-parse", "spex"), git(clone, "rev-parse", "spex"));
  assert.equal(git(clone, "config", "--get", "branch.spex.remote"), "origin");
  const doneLine = placementOf(done, null);
  assert.equal(doneLine.branch?.ahead, 0);
  assert.equal(doneLine.branch?.behind, 0);
  const last = prefsOf(home.dataDir)[`sync:${key}:origin:last`] as { at: number; sent: number; received: number };
  assert.equal(typeof last.at, "number");
  assert.equal(last.sent, done.sync.phase === "done" ? done.sync.sent : -1);
  assert.deepEqual(doneLine.lastSync, last);
  assert.deepEqual(done.local, []);
  assert.deepEqual(Object.keys(prefsOf(home.dataDir)).filter((name) => name.startsWith("sync:")), [`sync:${key}:origin:last`], "only the synced placement records a sync");
  assert.equal(git(clone, "status", "--porcelain"), "", "nothing of the sync stands uncommitted");
  const again = await home.client.settle("space.sync", { repository: key });
  assert.ok(again.sync.phase === "done" && !again.sync.pushed && again.sync.sent === 0 && again.sync.received === 0, JSON.stringify(again.sync));
  // A restarted core holds no check but still reports the last sync; a
  // changed remote clears both.
  await home.stop();
  const restarted = await startHome("first-push-restart", { dataDir: home.dataDir, project: false });
  t.after(() => restarted.stop());
  const reread = await restarted.client.repository(key);
  assert.equal(placementOf(reread, null).branch?.checkedAt, null);
  assert.deepEqual(placementOf(reread, null).lastSync, placementOf(again, null).lastSync);
  assert.equal(reread.state, "reachable");
  const moved = placementOf(repositoryOf(await restarted.client.expectOk("space.remote.set", { repository: key, url: bareRepo() }), key), null);
  assert.equal(moved.branch?.checkedAt, null);
  assert.equal(moved.lastSync, null);
  assert.equal(prefsOf(home.dataDir)[`sync:${key}:origin:last`], undefined);
  // A fresh home's joining sync against an empty host completes as a first push.
  const joiner = await startHome("joiner");
  t.after(() => joiner.stop());
  const joined = await addFolder(joiner, joiner.projectDir);
  const empty = bareRepo();
  await joiner.client.expectOk("space.remote.set", { repository: joined.key, url: empty });
  const first = await joiner.client.settle("space.sync", { repository: joined.key, placement: null, join: true });
  assert.ok(first.sync.phase === "done" && first.sync.pushed && first.sync.sent > 0 && first.sync.received === 0, JSON.stringify(first.sync));
  assert.equal(placementOf(first, null).branch?.hostEmpty, false);
  assert.equal(git(empty, "rev-parse", "spex"), git(joined.clone, "rev-parse", "spex"));
});

/** Release a lease in a test's cleanup: one already gone with its clone
 * — a removal that went through — answers ENOENT, which must not replace
 * the failed assertion that let it go through. */
async function releaseLease(lease: { release(): Promise<unknown> } | undefined): Promise<void> {
  try { await lease?.release(); }
  catch (error) {
    const gone = (error as NodeJS.ErrnoException).code === "ENOENT" || ((error as { cause?: NodeJS.ErrnoException }).cause)?.code === "ENOENT";
    if (!gone) throw error;
  }
}

test("space-37: a running compile and an out-of-band lease refuse no sync", async (t) => {
  const home = await startHome("unrefused", { env: { SPEX_SLC: "fake-slc" }, extra: { compileSpawner: hangingCompileSpawner() } });
  t.after(() => home.stop());
  const { key, clone } = await addFolder(home, home.projectDir);
  const sessionId = await runTurn(home, key, "Settle first");
  await home.client.expectOk("space.remote.set", { repository: key, url: bareRepo() });
  const synced = async (why: string): Promise<void> => {
    const done = await home.client.settle("space.sync", { repository: key });
    assert.equal(done.sync.phase, "done", `${why}: ${JSON.stringify(done.sync)}`);
  };
  // A running compile belongs to the project whose working folder holds
  // its spec package (environments-10): it refuses no sync (space-21).
  const compile = home.client.command("compile.run", { ...COMPILE_INPUT, projectId: key });
  await home.client.waitFor((m) => m.type === "compile.progress" && m.line === "slc: working");
  await synced("a compile refuses no sync");
  // A management lease taken out of band: the sync, which writes no
  // session here, proceeds (space-11).
  const shared = createSessionStore({ sessionsDir: join(clone, "sessions") });
  await shared.prepare();
  const lease = await shared.acquireManagement(sessionId);
  try { await synced("a lease refuses no sync"); }
  finally { await releaseLease(lease); }
  await home.client.expectOk("compile.abort", { playbookId: "demo" });
  await compile;
});

test("projects-33: a removal is refused at its own instant by a session's lease alone, a clone gone while its leasing waits is a change, and released it completes beside a compile", async (t) => {
  const home = await startHome("removal", { env: { SPEX_SLC: "fake-slc" }, extra: { compileSpawner: hangingCompileSpawner() } });
  t.after(() => home.stop());
  const { key, clone } = await addFolder(home, home.projectDir);
  const sessionId = await runTurn(home, key, "Settle first");
  const compile = home.client.command("compile.run", { ...COMPILE_INPUT, projectId: key });
  await home.client.waitFor((m) => m.type === "compile.progress" && m.line === "slc: working");
  // A management lease taken out of band refuses the removal, which would
  // delete it, at its own instant (projects-10).
  const shared = createSessionStore({ sessionsDir: join(clone, "sessions") });
  await shared.prepare();
  const lease = await shared.acquireManagement(sessionId);
  try {
    await home.client.expectError("project.remove", { projectId: key, confirm: true }, "busy", /running turn/);
    assert.ok(existsSync(clone), "nothing is deleted under a held lease");
  } finally { await releaseLease(lease); }
  // A session standing only as a live writer's lease, before any record,
  // refuses it as well.
  const leaseOnly = await shared.acquireManagement(randomUUID());
  try {
    await home.client.expectError("project.remove", { projectId: key, confirm: true }, "busy", /running turn/);
    assert.ok(existsSync(clone), "nothing is deleted under a lease-only session");
  } finally { await releaseLease(leaseOnly); }
  // A session appearing while the removal takes its leases is refused at
  // its final check as changed meanwhile.
  const repositoryOfStore = (): { store: typeof shared } => (Reflect.get(home.service, "store") as { repository(key: string): { store: typeof shared } }).repository(key);
  let repository = repositoryOfStore();
  let sessions = repository.store;
  let entered!: () => void, release!: () => void;
  const leasing = new Promise<void>((resolve) => { entered = resolve; });
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  repository.store = { ...sessions, acquireManagement: async (id: string) => {
    const held = await sessions.acquireManagement(id);
    entered(); await barrier;
    return held;
  } };
  let appeared: Awaited<ReturnType<typeof shared.acquireManagement>> | undefined;
  try {
    const removal = home.client.expectError("project.remove", { projectId: key, confirm: true }, "conflict", /changed meanwhile/);
    await Promise.race([leasing, removal]);
    appeared = await shared.acquireManagement(randomUUID());
    release();
    await removal;
  } finally {
    release();
    repository.store = sessions;
    await releaseLease(appeared);
  }
  assert.ok(existsSync(clone), "the clone stands after the conflict");
  // The clone moved away while the removal's leasing waits before the
  // real acquisition: the removal is a change, never a running turn, and
  // the acquisition makes nothing where the clone stood.
  const away = `${clone}.away`;
  const pausing = new Promise<void>((resolve) => { entered = resolve; });
  const paused = new Promise<void>((resolve) => { release = resolve; });
  repository.store = { ...sessions, acquireManagement: async (id: string) => {
    entered(); await paused;
    return sessions.acquireManagement(id);
  } };
  try {
    const removal = home.client.expectError("project.remove", { projectId: key, confirm: true }, "conflict", /changed meanwhile/);
    await Promise.race([pausing, removal]);
    renameSync(clone, away);
    release();
    await removal;
    assert.ok(!existsSync(clone), "nothing is made where the clone stood");
    assert.ok(existsSync(join(away, "sessions", `${sessionId}.json`)), "the moved clone keeps its session");
  } finally {
    release();
    repository.store = sessions;
    if (existsSync(away) && !existsSync(clone)) renameSync(away, clone);
  }
  // The store reads the clone where it stands again, by a new handle.
  repository = repositoryOfStore();
  sessions = repository.store;
  // The home file going while the removal takes its leases refuses it at
  // its final check too; the file is not written back.
  const homeFile = Home.file(home.dataDir);
  const homeBytes = readFileSync(homeFile);
  const leasingAgain = new Promise<void>((resolve) => { entered = resolve; });
  const barrierAgain = new Promise<void>((resolve) => { release = resolve; });
  repository.store = { ...sessions, acquireManagement: async (id: string) => {
    const held = await sessions.acquireManagement(id);
    entered(); await barrierAgain;
    return held;
  } };
  try {
    const removal = home.client.expectError("project.remove", { projectId: key, confirm: true }, "invalid_request", /home\.yaml changed meanwhile; retry/);
    await Promise.race([leasingAgain, removal]);
    rmSync(homeFile);
    release();
    await removal;
    assert.ok(!existsSync(homeFile), "the home file is not written back from memory");
  } finally {
    release();
    repository.store = sessions;
    writeFileSync(homeFile, homeBytes);
  }
  assert.ok(existsSync(clone), "the clone stands after the home refusal");
  // Released, the removal runs with the compile still running: it waits
  // for no other work.
  assert.equal(await home.client.expectOk("project.remove", { projectId: key, confirm: true }), null);
  assert.ok(!existsSync(clone), "the clone is gone");
  await home.client.expectOk("compile.abort", { playbookId: "demo" });
  await compile;
});

test("space-37: while a check runs, writes beneath that clone are admitted, a second Sync or Check joins it, and Stop ends the child", async (t) => {
  const { script, pidFile } = sleepingSsh();
  const home = await startHome("unrefused-check", { env: { GIT_SSH_COMMAND: script }, extra: { spaceTransportTimeoutMs: 60_000 } });
  t.after(() => home.stop());
  const { key, clone } = await addFolder(home, home.projectDir);
  const sessionId = await runTurn(home, key, "Beside the check");
  await home.client.expectOk("space.remote.set", { repository: key, url: "ssh://localhost/x" });
  const before = git(clone, "rev-parse", "HEAD");
  await home.client.expectOk("intent.queue", { projectId: key, text: "Saved by the sync" });
  const from = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.sync", { repository: key }), { accepted: true });
  // Stop is offered once the step's Git child runs (space-16).
  const running = await home.client.waitRepository(from, key, (repository) => repository.sync.phase === "running" && repository.sync.step === "check" && repository.sync.cancelable);
  assert.ok(running.sync.phase === "running" && running.sync.cancelable);
  // Nothing beneath the clone is refused (space-21): a turn, a viewed
  // marker, an intent, a pairing and a settings edit all land, the
  // runtime's own rules alone deciding the turn.
  await runTurn(home, key, "Admitted beside the check", sessionId);
  await home.client.expectOk("session.viewed", { sessionId, turnId: 1 });
  const queued = await home.client.expectOk("intent.queue", { projectId: key, text: "Admitted beside the check" });
  assert.ok(existsSync(join(clone, "intents", `${queued.id}.json`)), "the intent is written");
  await home.client.expectOk("project.rebind", { projectId: key, path: home.projectDir });
  await home.client.expectOk("config.edit", { op: { kind: "captain.set", patch: { model: "claude-test-edited" } } });
  // A second Sync or Check joins the running one rather than being refused.
  assert.deepEqual(await home.client.expectOk("space.sync", { repository: key }), { accepted: true });
  assert.deepEqual(await home.client.expectOk("space.fetch", { repository: key }), { accepted: true });
  const pid = await sleeperPid(pidFile);
  assert.deepEqual(await home.client.expectOk("space.cancel", { repository: key }), { stopped: true });
  const after = await home.client.waitRepository(from, key, (repository) => repository.sync.phase === "stopped");
  assert.ok(after.sync.phase === "stopped" && after.sync.step === "check" && after.sync.cause === "stopped", JSON.stringify(after.sync));
  assert.ok(after.sync.phase === "stopped" && after.sync.retry);
  assert.notEqual(git(clone, "rev-parse", "HEAD"), before, "the Save commit stands");
  assert.match(git(clone, "log", "-1", "--format=%s"), /^Sync from /);
  for (let i = 0; i < 100; i += 1) {
    try { process.kill(pid, 0); await sleep(50); } catch { break; }
  }
  assert.throws(() => process.kill(pid, 0), "the sleeping child is gone");
  assert.deepEqual(await home.client.expectOk("space.cancel", { repository: key }), { stopped: false });
});

test("space-37: a Sync asked while a check stands held makes no Save commit until that check ends, then saves and completes", async (t) => {
  // The check's transport, held inside Git before it runs.
  const shim = holdingGit("ls-remote");
  const home = await startHome("follows-check", { env: { PATH: shim.path } });
  t.after(() => { shim.release(); return home.stop(); });
  const { key, clone } = await addFolder(home, home.projectDir);
  const bare = bareRepo();
  await home.client.expectOk("space.remote.set", { repository: key, url: bare });
  const queued = await home.client.expectOk("intent.queue", { projectId: key, text: "Saved once the check ends" });
  const before = git(clone, "rev-parse", "HEAD");
  shim.hold();
  const from = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.fetch", { repository: key }), { accepted: true });
  await shim.held();
  // The Sync follows the check (space-21): accepted at once, and through
  // a bounded watch from that reply no Save lands and no sync begins.
  assert.deepEqual(await home.client.expectOk("space.sync", { repository: key }), { accepted: true });
  const accepted = Date.now();
  while (Date.now() - accepted < 3_000) {
    assert.equal(git(clone, "rev-parse", "HEAD"), before, "no Save commit while the check stands");
    const syncing = home.client.messages.slice(from).some((message) => message.type === "space.state" && rowsOf(message.state).some((repository) => repository.key === key && repository.sync.phase === "running" && repository.sync.op === "sync"));
    assert.equal(syncing, false, "the sync has not begun while the check runs");
    await sleep(100);
  }
  shim.release();
  const done = await home.client.waitRepository(from, key, (repository) => repository.sync.phase === "done" || repository.sync.phase === "stopped");
  assert.equal(done.sync.phase, "done", JSON.stringify(done.sync));
  assert.notEqual(git(clone, "rev-parse", "HEAD"), before, "the Save commit came once the check ended");
  assert.ok(git(clone, "ls-files").split("\n").includes(`intents/${queued.id}.json`));
  assert.equal(git(bare, "rev-parse", "spex"), git(clone, "rev-parse", "spex"));
});

test("space-37: a MERGE_HEAD planted in a clone reads as a pending merge and refuses its sync", async (t) => {
  const first = await startHome("merge");
  const { key, clone } = await addFolder(first, first.projectDir);
  await first.stop();
  writeFileSync(join(clone, ".git", "MERGE_HEAD"), `${git(clone, "rev-parse", "HEAD")}\n`);
  const home = await startHome("merge-again", { dataDir: first.dataDir, project: false });
  t.after(() => home.stop());
  const state = await home.client.expectOk("space.get", {});
  assert.equal(repositoryOf(state, key).mergePending, true);
  assert.equal(repositoryOf(state, OWN_KEY).mergePending, false);
  assert.ok(state.diagnostics.some((d) => d.file === `workspace/${key}/.git/MERGE_HEAD` && /merge is pending/.test(d.reason) && !d.blocking), JSON.stringify(state.diagnostics));
  await home.client.expectOk("space.remote.set", { repository: key, url: bareRepo() });
  await home.client.expectError("space.sync", { repository: key }, "invalid_request", /Finish or abort the merge/);
  await home.client.expectError("space.fetch", { repository: key }, "invalid_request", /Finish or abort the merge/);
});

// ---------------------------------------------------------------------------
// space-39: listings and the explorer
// ---------------------------------------------------------------------------

const PROJECT_CONFIG = "playbooks:\n  code:\n    roles:\n      coder: dev.coder\n";
const PEER_CONFIG = "playbooks:\n  review:\n    roles:\n      reviewer: dev.reviewer\n";


test("space-37: a blocking diagnostic of one clone's session refuses that clone's sync alone, a clone whose path prefixes it admitted", async (t) => {
  const first = await startHome("blocking-scope", { project: false });
  const short = await addFolder(first, gitFolder("scope"));
  const long = await addFolder(first, gitFolder("scope-spex-b"));
  assert.ok(long.clone.startsWith(short.clone), "one clone's path is a string prefix of the other's");
  await first.stop();
  const damaged = join(long.clone, "sessions", `${randomUUID()}.json`);
  writeFileSync(damaged, "{ not a manifest", { mode: 0o600 });
  const home = await startHome("blocking-scope-again", { dataDir: first.dataDir, project: false });
  t.after(() => home.stop());
  const state = await home.client.expectOk("space.get", {});
  assert.ok(state.diagnostics.some((d) => d.blocking && d.file.endsWith(basename(damaged))), JSON.stringify(state.diagnostics));
  for (const { key } of [short, long]) await home.client.expectOk("space.remote.set", { repository: key, url: bareRepo() });
  const admitted = await home.client.settle("space.sync", { repository: short.key });
  assert.equal(admitted.sync.phase, "done", JSON.stringify(admitted.sync));
  await home.client.expectError("space.sync", { repository: long.key }, "invalid_request", new RegExp(basename(damaged)));
});
test("space-39: local changes of every unit kind list in order, incoming units after a peer pushes, diffs, and the explorer", async (t) => {
  const bare = bareRepo();
  const home = await startHome("explorer");
  t.after(() => home.stop());
  const { key, clone } = await addFolder(home, home.projectDir);
  const name = basename(home.projectDir);
  await home.client.expectOk("space.remote.set", { repository: key, url: bare });
  assert.equal((await home.client.settle("space.sync", { repository: key })).sync.phase, "done");
  // A directory of a tracked kind holding nothing yet — intents/ before the
  // first queued intent — is not yet shared, never "Stays here" (space-23).
  mkdirSync(join(clone, "intents"), { recursive: true });
  const vacantIntents = (await home.client.expectOk("space.tree", { repository: key })).entries.find((e) => e.path === "intents");
  assert.equal(vacantIntents?.kind, "dir");
  assert.equal(vacantIntents?.family, "intents");
  assert.equal(vacantIntents?.count, 0);
  assert.equal(vacantIntents?.sync, "pending");
  assert.deepEqual(repositoryOf(await home.client.expectOk("space.get", {}), key).local, []);
  // Local changes of every unit kind.
  const sessionId = await runTurn(home, key, "Fix the login redirect");
  const intent = await home.client.expectOk("intent.queue", { projectId: key, text: "Ship the parser\nwith its tests" });
  mkdirSync(join(clone, "authoring"), { recursive: true });
  writeFileSync(join(clone, "authoring", "triage.json"), JSON.stringify({ format: 1, id: "triage", createdAt: 1, touchedAt: 2, package: "spex-packages/triage", queued: [{ text: "Draft a triage workflow" }], failures: 0 }));
  writeFileSync(join(clone, "authoring", "triage.records.jsonl"), "");
  writeFileSync(join(clone, "spex.yaml"), "format: 1\nrequests:\n  - builtin\n");
  writeFileSync(join(clone, "spex.lock"), "format: 1\n");
  mkdirSync(join(clone, "config"), { recursive: true });
  writeFileSync(join(clone, "config", "playbook.config.yaml"), PROJECT_CONFIG);
  writeFileSync(join(clone, "project.json"), JSON.stringify({ format: 1, name, remote: "git@example.com:acme/app.git" }));
  writeFileSync(join(clone, ".gitignore"), `${readFileSync(join(clone, ".gitignore"), "utf8")}# authored\n/scratch/\n`);
  writeFileSync(join(clone, "notes.txt"), "stray\n");
  // A spec package's folder: one row with every file under it.
  mkdirSync(join(clone, "mine", "notes", "skills", "en", "notes"), { recursive: true });
  writeFileSync(join(clone, "mine", "notes", "meta.yaml"), "format: 2\norg: tester\nname: notes\nversion: 0.1.0\nartifacts:\n  notes: { kind: skill, language: en }\n");
  writeFileSync(join(clone, "mine", "notes", "skills", "en", "notes", "SKILL.md"), "---\nname: notes\ndescription: Notes.\n---\n");
  const listed = await home.client.repository(key);
  assert.deepEqual([listed.code, listed.codeKind], [null, "unknown"], "the row withholds the code until the instance reports its Git origin");
  const local = listed.local;
  assert.deepEqual(local.map((u) => u.kind), ["session", "intent", "authoring", "environment", "settings", "code", "rules", "other", "other"], JSON.stringify(local));
  const [session, queued, authoring, environment, settings, code, rules, folder, other] = local;
  assert.equal(session.label, "Fix the login redirect");
  assert.equal(session.change, "new");
  assert.equal(session.sessionId, sessionId);
  assert.match(session.detail ?? "", /1 turn/);
  assert.equal(session.diff, false);
  assert.equal(queued.label, "Ship the parser", "an intent by its text's first line");
  assert.equal(queued.intentId, intent.id);
  assert.equal(queued.change, "new");
  assert.equal(queued.diff, false);
  assert.equal(authoring.label, "Draft a triage workflow");
  assert.equal(authoring.unit, "authoring/triage");
  assert.equal(authoring.diff, false);
  assert.equal(environment.label, "Spec packages changed");
  assert.equal(environment.unit, "environment");
  assert.equal(environment.detail, "spex.lock, spex.yaml");
  assert.equal(environment.diff, true);
  assert.equal(settings.label, "Settings changed");
  assert.equal(settings.change, "new");
  assert.equal(settings.diff, true);
  assert.equal(code.label, "Code remote changed");
  assert.equal(code.change, "updated");
  assert.equal(rules.label, "Sync rules updated");
  assert.equal(rules.unit, ".gitignore");
  assert.equal(folder.label, "mine/notes/");
  assert.equal(folder.unit, "mine/notes/");
  assert.equal(folder.change, "new");
  assert.deepEqual(folder.paths, ["mine/notes/meta.yaml", "mine/notes/skills/en/notes/SKILL.md"]);
  assert.equal(other.label, "notes.txt");
  assert.equal(other.change, "new");
  // A peer pushes: a differing configuration, a new session and an intent.
  const peer = peerClone(bare);
  const peerSession = randomUUID();
  const peerIntent = randomUUID();
  await peerPush(peer, async (dir) => {
    mkdirSync(join(dir, "config"), { recursive: true });
    writeFileSync(join(dir, "config", "playbook.config.yaml"), PEER_CONFIG);
    mkdirSync(join(dir, "sessions"), { recursive: true, mode: 0o700 });
    await seedHistorySession(join(dir, "sessions"), home.projectDir, turnRecords("Peer's session", 1), peerSession);
    mkdirSync(join(dir, "intents"), { recursive: true });
    writeFileSync(join(dir, "intents", `${peerIntent}.json`), JSON.stringify({ format: 1, id: peerIntent, text: "Review the parser", createdAt: 1 }));
  });
  const checked = await home.client.settle("space.fetch", { repository: key });
  assert.equal(checked.sync.phase, "idle", JSON.stringify(checked.sync));
  const line = placementOf(checked, null);
  assert.equal(line.branch?.ahead, 0);
  assert.equal(line.branch?.behind, 1);
  assert.equal(line.branch?.hostEmpty, false);
  assert.deepEqual(line.incoming.map((u) => u.kind), ["session", "intent"], JSON.stringify(line.incoming));
  assert.equal(line.incoming[0].label, "Peer's session");
  assert.equal(line.incoming[0].change, "new");
  assert.equal(line.incoming[1].label, "Review the parser");
  assert.equal(line.incoming[1].intentId, peerIntent);
  assert.deepEqual(checked.conflicts.map((c) => c.unit.unit), ["config/playbook.config.yaml"]);
  assert.ok(checked.conflicts[0].mine.diff && checked.conflicts[0].remote.diff);
  assert.deepEqual(checked.local.map((u) => u.kind), ["session", "intent", "authoring", "environment", "code", "rules", "other", "other"]);
  const mine = await home.client.expectOk("space.diff", { repository: key, unit: "config/playbook.config.yaml", path: "config/playbook.config.yaml", side: "mine" });
  assert.match(mine.patch, /^\+.*coder: dev\.coder/m);
  assert.equal(mine.truncated, false);
  const remote = await home.client.expectOk("space.diff", { repository: key, unit: "config/playbook.config.yaml", path: "config/playbook.config.yaml", side: "remote" });
  assert.match(remote.patch, /^\+.*reviewer: dev\.reviewer/m);
  const requests = await home.client.expectOk("space.diff", { repository: key, unit: "environment", path: "spex.yaml", side: "mine" });
  assert.match(requests.patch, /^\+requests:$/m, "a new file diffs against the ancestor");
  const codeDiff = await home.client.expectOk("space.diff", { repository: key, unit: "project.json", path: "project.json", side: "mine" });
  assert.match(codeDiff.patch, /^\+.*acme\/app\.git/m);
  await home.client.expectError("space.diff", { repository: key, unit: `sessions/${sessionId}`, path: `sessions/${sessionId}.json`, side: "mine" }, "invalid_request", /no text diff/);
  await home.client.expectError("space.diff", { repository: key, unit: `intents/${intent.id}`, path: `intents/${intent.id}.json`, side: "mine" }, "invalid_request", /no text diff/);
  await home.client.expectError("space.diff", { repository: key, unit: "config/playbook.config.yaml", path: "other", side: "mine" }, "invalid_request", /^other is not part of config\/playbook\.config\.yaml$/);
  await home.client.expectError("space.diff", { repository: key, unit: "nope", path: "nope", side: "mine" }, "invalid_request", /^nope is not among the changes — Check, then choose again$/);
  const empty = bareRepo();
  await home.client.expectOk("space.remote.set", { repository: key, url: empty });
  const vacant = await home.client.settle("space.fetch", { repository: key });
  assert.equal(placementOf(vacant, null).branch?.hostEmpty, true);
  assert.deepEqual(placementOf(vacant, null).incoming, []);
  assert.deepEqual(vacant.conflicts, []);
  assert.ok(vacant.local.every((u) => u.change === "new"));
  await home.client.expectOk("space.remote.set", { repository: key, url: bare });
  // The explorer.
  mkdirSync(join(clone, "packages", "builtin"), { recursive: true });
  writeFileSync(join(clone, "packages", "builtin", "spex.yaml"), "format: 1\n");
  // The installed tree of a group's own environment, a manifest inside
  // it no spec package folder (environments-26, storage-1).
  mkdirSync(join(clone, ".spex", "packages", "acme", "kit"), { recursive: true });
  writeFileSync(join(clone, ".spex", "packages", "acme", "kit", "meta.yaml"), "format: 2\n");
  mkdirSync(join(clone, "intents", `${intent.id}.assets`), { recursive: true });
  symlinkSync(home.projectDir, join(clone, "link"));
  writeFileSync(join(clone, "sessions", `${sessionId}.hints.json`), "{}");
  writeFileSync(join(clone, "README.md"), "# Demo\n");
  writeFileSync(join(clone, "big.log"), Array.from({ length: 3_500 }, (_, i) => `line ${String(i).padStart(6, "0")} ${"x".repeat(80)}`).join("\n") + "\n");
  const root = await home.client.expectOk("space.tree", { repository: key });
  assert.equal(root.path, "");
  const entry = (path: string) => { const found = root.entries.find((e) => e.path === path); assert.ok(found, `missing ${path} in ${root.entries.map((e) => e.path).join(", ")}`); return found; };
  assert.equal(entry(".git").kind, "git");
  assert.equal(entry(".git").sync, "git");
  assert.equal(entry(".git").family, "Git data");
  assert.equal(entry(".git").count, undefined);
  assert.equal(entry("sessions").kind, "dir");
  assert.equal(entry("sessions").family, "session bundles");
  assert.ok((entry("sessions").count ?? 0) >= 3);
  assert.equal(entry("intents").family, "intents");
  assert.equal(entry("authoring").family, "authoring sessions");
  assert.equal(entry("packages").family, "installed spec packages");
  assert.equal(entry("packages").sync, "local", "installed spec packages stay here");
  assert.equal(entry(".spex").family, "installed spec packages");
  assert.equal(entry(".spex").sync, "local", "the installed tree under .spex/ stays here");
  assert.equal(entry("config").family, "Settings");
  assert.equal(entry("spex.yaml").family, "spec package requests");
  assert.equal(entry("spex.yaml").sync, "pending");
  assert.equal(entry("spex.lock").family, "spec package lock");
  assert.equal(entry("project.json").family, "code remote");
  assert.equal(entry("project.json").sync, "pending", "changed since the last commit");
  assert.equal(entry(".gitignore").family, "sync rules");
  assert.equal(entry(".gitattributes").sync, "shared");
  assert.equal(entry("notes.txt").family, "Not a Spex file");
  assert.equal(entry("notes.txt").sync, "pending");
  // A spec package's folder, and every path under it, reads as one; the
  // folder above it is none (space-35).
  assert.equal(entry("mine").family, "Not a Spex folder");
  const packageFolder = (await home.client.expectOk("space.tree", { repository: key, path: "mine" })).entries.find((e) => e.name === "notes");
  assert.equal(packageFolder?.family, "spec package");
  assert.equal(packageFolder?.sync, "pending");
  const packageFiles = await home.client.expectOk("space.tree", { repository: key, path: "mine/notes" });
  assert.equal(packageFiles.entries.find((e) => e.name === "meta.yaml")?.family, "spec package");
  assert.equal(packageFiles.entries.find((e) => e.name === "skills")?.family, "spec package");
  assert.equal(entry("link").kind, "file");
  assert.equal(entry("link").preview, "none");
  assert.equal(entry("big.log").preview, "text");
  assert.ok(root.entries.findIndex((e) => e.kind !== "dir" && e.kind !== "git") > root.entries.findIndex((e) => e.kind === "dir"), "directories first");
  await home.client.expectError("space.tree", { repository: key, path: "link" }, "invalid_request", /symbolic link/);
  await home.client.expectError("space.tree", { repository: key, path: "link/README.md" }, "invalid_request", /symbolic link/);
  await home.client.expectError("space.tree", { repository: key, path: "../" }, "invalid_request", /^the path leads outside these records$/);
  await home.client.expectError("space.tree", { repository: key, path: ".git" }, "invalid_request", /Git data/);
  await home.client.expectError("space.tree", { repository: key, path: "nope" }, "not_found");
  const sessions = await home.client.expectOk("space.tree", { repository: key, path: "sessions" });
  const manifest = sessions.entries.find((e) => e.name === `${sessionId}.json`);
  assert.equal(manifest?.family, "session manifest");
  assert.equal(manifest?.sync, "pending", "not committed since the session began");
  assert.equal(manifest?.preview, "text");
  assert.deepEqual(manifest?.owner, { sessionId, title: "Fix the login redirect" });
  const hints = sessions.entries.find((e) => e.name === `${sessionId}.hints.json`);
  assert.equal(hints?.family, "provider hints");
  assert.equal(hints?.sync, "local");
  assert.equal(hints?.preview, "withheld");
  const records = sessions.entries.find((e) => e.name === `${sessionId}.replay.json`);
  assert.equal(records?.family, "session records");
  const chunks = sessions.entries.find((e) => e.name === `${sessionId}.chunks`);
  assert.equal(chunks?.family, "session chunks");
  assert.deepEqual(chunks?.owner, { sessionId, title: "Fix the login redirect" });
  const chunkFiles = await home.client.expectOk("space.tree", { repository: key, path: `sessions/${sessionId}.chunks` });
  assert.ok(chunkFiles.entries.length > 0);
  assert.ok(chunkFiles.entries.every((entry) => entry.family === "session chunks" && entry.owner?.sessionId === sessionId));
  assert.ok((records?.size ?? 0) > 0 && typeof records?.mtime === "number");
  const intents = await home.client.expectOk("space.tree", { repository: key, path: "intents" });
  const intentEntry = intents.entries.find((e) => e.name === `${intent.id}.json`);
  assert.equal(intentEntry?.family, "intent");
  assert.equal(intentEntry?.sync, "pending");
  assert.deepEqual(intentEntry?.owner, { intentId: intent.id, title: "Ship the parser" });
  const attachments = intents.entries.find((e) => e.name === `${intent.id}.assets`);
  assert.equal(attachments?.family, "intent attachments");
  assert.deepEqual(attachments?.owner, { intentId: intent.id, title: "Ship the parser" });
  const drafts = await home.client.expectOk("space.tree", { repository: key, path: "authoring" });
  assert.equal(drafts.entries.find((e) => e.name === "triage.json")?.family, "authoring session");
  assert.equal(drafts.entries.find((e) => e.name === "triage.records.jsonl")?.family, "authoring records");
  const installed = await home.client.expectOk("space.tree", { repository: key, path: "packages" });
  assert.equal(installed.entries[0]?.family, "installed spec packages");
  assert.equal(installed.entries[0]?.sync, "local");
  const pretty = await home.client.expectOk("space.read", { repository: key, path: `sessions/${sessionId}.json` });
  assert.ok(pretty.kind === "text" && pretty.text.startsWith("{\n  \"") && !pretty.truncated);
  const yaml = await home.client.expectOk("space.read", { repository: key, path: "config/playbook.config.yaml" });
  assert.ok(yaml.kind === "text" && yaml.text === PROJECT_CONFIG);
  const markdown = await home.client.expectOk("space.read", { repository: key, path: "README.md" });
  assert.ok(markdown.kind === "text" && markdown.text === "# Demo\n" && markdown.lines === 1);
  const stream = await home.client.expectOk("space.read", { repository: key, path: `sessions/${sessionId}.replay.json` });
  assert.ok(stream.kind === "text" && stream.lines >= 2 && stream.text.split("\n")[0].startsWith("{"));
  const cut = await home.client.expectOk("space.read", { repository: key, path: "big.log" });
  assert.ok(cut.kind === "text" && cut.truncated && cut.lines <= 2_000 && cut.text.endsWith("\n") && Buffer.byteLength(cut.text) <= 256 * 1024);
  assert.ok(cut.kind === "text" && cut.text.split("\n").every((line) => line === "" || /^line \d{6} x{80}$/.test(line)), "cut on a complete line");
  assert.deepEqual(await home.client.expectOk("space.read", { repository: key, path: `sessions/${sessionId}.hints.json` }), { kind: "withheld", reason: "May hold provider tokens — not shown" });
  await home.client.expectError("space.read", { repository: key, path: "../etc/passwd" }, "invalid_request", /^the path leads outside these records$/);
  await home.client.expectError("space.read", { repository: key, path: ".git/HEAD" }, "invalid_request", /Git data/);
  await home.client.expectError("space.read", { repository: key, path: "sessions" }, "invalid_request", /not a file/);
  await home.client.expectError("space.read", { repository: key, path: "link" }, "invalid_request", /symbolic link/);
  await home.client.expectError("space.read", { repository: key, path: "absent.txt" }, "not_found");
});

// ---------------------------------------------------------------------------
// space-51: a clone no folder pairs, and the repair the reader answers
// ---------------------------------------------------------------------------

test("space-51: deferred folder review survives restart and changed checks, with history readable before rebind resolves it", async (t) => {
  const first = await startHome("repairs");
  const { key } = await addFolder(first, first.projectDir);
  const sessionId = await runTurn(first, key, "Work before the move");
  await first.stop();
  // The folder's pair is forgotten on this device; its clone stays.
  const unpaired = Home.load(first.dataDir); unpaired.unpair(key); unpaired.save();
  let home = await startHome("repairs-again", { dataDir: first.dataDir, project: false });
  t.after(() => home.stop());
  const state = await home.client.expectOk("space.get", {});
  const repair = state.diagnostics.find((d) => d.repair?.repository === key);
  assert.ok(repair, JSON.stringify(state.diagnostics));
  assert.equal(repair.repair?.kind, "repository");
  assert.equal(repair.repair?.name, `${basename(first.projectDir)}-spex`);
  assert.equal(repair.repair?.group, OWN);
  assert.deepEqual(repair.repair?.directories, [first.projectDir]);
  assert.equal(repair.repair?.sessions, 1);
  assert.ok(repair.repair?.key.length, "a repair carries its own key (space-54)");
  assert.equal(repair.repair?.declined, undefined, "unanswered, so it counts");
  assert.equal(repositoryOf(state, key).folder, null);
  // The core checked the folder the repair names — here a work tree no
  // pair claims — and proposes it, searching for none (space-53).
  const checked = repair.repair?.checked ?? [];
  assert.ok(checked.some((c) => c.path === first.projectDir && c.here && c.repo && !c.claimedBy), JSON.stringify(checked));
  assert.deepEqual(repair.repair?.proposal, { path: first.projectDir, from: "recorded" });
  assert.ok(checked.every((c) => repair.repair!.directories.includes(c.path)), "only paths the repair names");
  const unpairedSession = (await home.client.expectOk("session.list", {})).find((s) => s.id === sessionId);
  assert.ok(unpairedSession, "saved conversation is listed before its files are located");
  assert.equal(unpairedSession.continuable, undefined, "locating files is separate from reading history");
  const savedHistory = await home.client.expectOk("history.get", { sessionId });
  assert.ok(savedHistory.records.some((r) => r.record.type === "turn_started"));
  assert.ok(!(await home.client.expectOk("project.list", {})).some((project) => project.id === key), "reading history registers no project");
  // Only the reader's act settles a repair, and it is this device's alone.
  const before = await home.client.expectOk("space.get", {});
  assert.equal(before.issues, before.diagnostics.length, "an unanswered repair counts");
  const status = git(clonePath(home.dataDir, key), "status", "--porcelain");
  const declined = await home.client.expectOk("space.repair.decline", { repair: repair.repair!.key, declined: true });
  const declinedAt = declined.diagnostics.find((d) => d.repair?.repository === key)?.repair?.declined;
  assert.equal(typeof declinedAt, "number");
  assert.equal(declined.issues, before.issues - 1, "a repair not added counts no more");
  assert.equal(typeof prefsOf(home.dataDir)[`space:repair:${repair.repair!.key}`], "object", "the answer is a preference");
  assert.equal(git(clonePath(home.dataDir, key), "status", "--porcelain"), status, "and never a tracked file");
  // A changed check is not a new task: the recorded folder, not its
  // current availability or proposal, identifies this answer.
  const temporarilyMoved = `${first.projectDir}-aside`;
  renameSync(first.projectDir, temporarilyMoved);
  try {
    const absent = await home.client.expectOk("space.get", {});
    const postponed = absent.diagnostics.find((d) => d.repair?.repository === key)?.repair;
    assert.equal(postponed?.key, repair.repair!.key);
    assert.equal(postponed?.declined, declinedAt);
    assert.equal(postponed?.checked?.find((entry) => entry.path === first.projectDir)?.here, false);
    assert.equal(postponed?.proposal, undefined);
    assert.equal(absent.issues, declined.issues, "changed checks never raise a postponed task again");
  } finally {
    renameSync(temporarilyMoved, first.projectDir);
  }
  // The persisted answer survives both a fresh core and a proposal
  // becoming available again. The card and its history remain reachable.
  await home.stop();
  home = await startHome("repairs-deferred-restart", { dataDir: first.dataDir, project: false });
  const restarted = await home.client.expectOk("space.get", {});
  const postponed = restarted.diagnostics.find((d) => d.repair?.repository === key)?.repair;
  assert.equal(postponed?.key, repair.repair!.key);
  assert.equal(postponed?.declined, declinedAt);
  assert.equal(restarted.issues, declined.issues, "the reduced review count survives restart");
  assert.deepEqual(postponed?.proposal, { path: first.projectDir, from: "recorded" });
  assert.equal(repositoryOf(restarted, key).folder, null);
  assert.deepEqual(await home.client.expectOk("history.get", { sessionId }), savedHistory, "Not now preserves readable history across restart");
  const restored = await home.client.expectOk("space.repair.decline", { repair: repair.repair!.key, declined: false });
  assert.equal(restored.issues, before.issues, "brought back, it counts again");
  await home.client.expectError("space.repair.decline", { repair: "no-such-repair", declined: true }, "invalid_request");
  await home.client.expectOk("space.repair.decline", { repair: repair.repair!.key, declined: true });
  // A deferred card can locate its folder directly, without first
  // restoring its review count. Rebind retires the task and its answer.
  const checkout = gitFolder("repairs-checkout");
  const bound = await home.client.expectOk("project.rebind", { projectId: key, path: checkout, aliases: [first.projectDir] });
  assert.equal(bound.id, key);
  assert.equal(bound.path, checkout);
  const after = await home.client.expectOk("space.get", {});
  assert.ok(!after.diagnostics.some((d) => d.repair?.repository === key), "one rebind resolves the repair");
  assert.equal(prefsOf(home.dataDir)[`space:repair:${repair.repair!.key}`], undefined, "resolved task leaves no postponed answer");
  assert.equal(after.issues, declined.issues, "resolving a deferred task does not raise the count");
  assert.equal(repositoryOf(after, key).folder, checkout);
  const listed = (await home.client.expectOk("session.list", {})).find((s) => s.id === sessionId);
  assert.equal(listed?.title, "Work before the move");
  assert.equal(listed?.projectId, key);
  const history = await home.client.expectOk("history.get", { sessionId });
  assert.ok(history.records.some((r) => r.record.type === "turn_started"));
});

test("core-service-149: dismissing an older-conversation notice preserves its source and survives restart without hiding changed failures", async (t) => {
  const userHome = mkdtempSync(join(scratch, "notice-home-"));
  const dataDir = join(userHome, ".spex");
  const stateDir = join(userHome, "state");
  const legacyDir = join(stateDir, "playbook", "sessions");
  mkdirSync(legacyDir, { recursive: true });
  const source = join(legacyDir, `${randomUUID()}.json`);
  const otherSource = join(legacyDir, `${randomUUID()}.json`);
  const original = JSON.stringify({ schemaVersion: 1, title: "An earlier conversation" });
  writeFileSync(source, original, { mode: 0o600 });
  writeFileSync(otherSource, original, { mode: 0o600 });
  const options = { dataDir, project: false, env: { HOME: userHome, XDG_STATE_HOME: stateDir }, extra: { home: userHome } };
  let home = await startHome("notice", options);
  t.after(() => home.stop());
  const { key: projectKey } = await addFolder(home, gitFolder("notice-project"));
  await home.stop();
  const unpaired = Home.load(dataDir); unpaired.unpair(projectKey); unpaired.save();
  home = await startHome("notice-unpaired", options);
  const noticeIn = (state: GroupsState, file = source) => state.diagnostics.find((entry) => entry.file === file);
  const all = await home.client.expectOk("space.get", {});
  const folderTask = all.diagnostics.find((entry) => entry.repair?.repository === projectKey)?.repair;
  assert.ok(folderTask);
  const before = await home.client.expectOk("space.repair.decline", { repair: folderTask.key, declined: true });
  assert.equal(before.issues, all.issues - 1, "dismissing the folder task leaves both independent notices counted");
  const notice = noticeIn(before);
  assert.equal(notice?.code, "session-import");
  assert.equal(notice.blocking, false);
  assert.match(notice.reason, /unsupported legacy schema 1/);
  assert.ok(notice.notice?.key);
  assert.equal(notice.notice.dismissed, undefined);
  const key = notice.notice.key;
  assert.deepEqual((await home.client.expectOk("storage.diagnostics", {})).find((entry) => entry.file === source)?.notice, { key }, "the diagnostics command exposes the same dismissal capability");
  const status = git(ownClone(dataDir), "status", "--porcelain");
  const observed: GroupsState[] = [];
  const observe = async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${home.service.port()}/?token=test`);
    socket.on("message", (bytes) => {
      const message = JSON.parse(String(bytes)) as ServerMessage;
      if (message.type === "space.state") observed.push(message.state);
    });
    await new Promise<void>((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
    return socket;
  };
  let observer = await observe();
  t.after(() => observer.close());
  const waitObserved = async (check: (state: GroupsState) => boolean) => {
    const deadline = Date.now() + 5_000;
    while (!observed.some(check) && Date.now() < deadline) await sleep(10);
    assert.ok(observed.some(check), "another connected reader receives the updated dismissal and count");
  };
  const dismissed = await home.client.expectOk("space.notice.dismiss", { notice: key, dismissed: true });
  const dismissedAt = noticeIn(dismissed)?.notice?.dismissed;
  assert.equal(typeof dismissedAt, "number");
  assert.equal(dismissed.issues, before.issues - 1, "only the chosen notice leaves the count");
  await waitObserved((state) => state.issues === dismissed.issues && noticeIn(state)?.notice?.dismissed === dismissedAt);
  assert.equal(noticeIn(dismissed, otherSource)?.notice?.dismissed, undefined, "the other unsupported conversation still counts");
  assert.equal(readFileSync(source, "utf8"), original, "dismissal does not convert or delete the old conversation");
  assert.equal(readFileSync(otherSource, "utf8"), original);
  assert.equal(git(ownClone(dataDir), "status", "--porcelain"), status, "dismissal changes no tracked data");
  assert.deepEqual(prefsOf(dataDir)[`space:notice:${key}`], { dismissed: dismissedAt });
  assert.deepEqual((await home.client.expectOk("storage.diagnostics", {})).find((entry) => entry.file === source)?.notice, { key, dismissed: dismissedAt }, "both diagnostic surfaces report the stored answer");
  assert.equal((await home.client.expectOk("space.get", {})).issues, dismissed.issues, "a fresh read preserves dismissal");

  observer.close();
  await home.stop();
  home = await startHome("notice-restart", options);
  observed.length = 0;
  observer = await observe();
  const restarted = await home.client.expectOk("space.get", {});
  assert.deepEqual(noticeIn(restarted)?.notice, { key, dismissed: dismissedAt });
  assert.equal(typeof restarted.diagnostics.find((entry) => entry.repair?.key === folderTask.key)?.repair?.declined, "number");
  assert.equal(restarted.issues, dismissed.issues);
  assert.equal(readFileSync(source, "utf8"), original, "restart retains the unsupported source unchanged");
  const restored = await home.client.expectOk("space.notice.dismiss", { notice: key, dismissed: false });
  assert.equal(restored.issues, before.issues, "Show again restores exactly this notice to the count");
  assert.equal(noticeIn(restored)?.notice?.dismissed, undefined);
  await waitObserved((state) => state.issues === before.issues && noticeIn(state)?.notice?.key === key && noticeIn(state)?.notice?.dismissed === undefined);
  assert.equal(prefsOf(dataDir)[`space:notice:${key}`], undefined);
  await home.client.expectError("space.notice.dismiss", { notice: "unknown-notice", dismissed: true }, "invalid_request");
  await home.client.expectOk("space.notice.dismiss", { notice: key, dismissed: true });

  // The same source path can now hold different work. The old answer
  // must neither hide it nor authorize a stale dismissal command.
  writeFileSync(source, JSON.stringify({ schemaVersion: 1, title: "Different earlier work" }));
  const changed = await home.client.expectOk("space.get", {});
  const changedKey = noticeIn(changed)?.notice?.key;
  assert.ok(changedKey && changedKey !== key);
  assert.equal(noticeIn(changed)?.notice?.dismissed, undefined);
  assert.equal(changed.issues, before.issues);
  await home.client.expectError("space.notice.dismiss", { notice: key, dismissed: true }, "invalid_request");
  await home.client.expectError("space.notice.dismiss", { notice: key, dismissed: false }, "invalid_request");

  // A linked source is not a verified regular source, even when it
  // points to the same bytes. It cannot retain a dismissible identity.
  const aside = `${source}.retained`;
  renameSync(source, aside);
  symlinkSync(aside, source);
  try {
    const linked = await home.client.expectOk("space.get", {});
    assert.equal(noticeIn(linked)?.notice, undefined);
    assert.equal(linked.issues, before.issues);
    await home.client.expectError("space.notice.dismiss", { notice: changedKey, dismissed: true }, "invalid_request");
  } finally {
    rmSync(source);
    renameSync(aside, source);
  }

  // Unrelated malformed storage and an actual blocker remain outside
  // the dismissal contract, even while a prior dismissal is stored.
  const projectFile = join(ownClone(dataDir), "project.json");
  writeFileSync(projectFile, "{}");
  const unsupported = await home.client.expectOk("space.get", {});
  assert.equal(noticeIn(unsupported, projectFile)?.notice, undefined);
  assert.ok(noticeIn(unsupported, projectFile));
  await home.client.expectError("space.notice.dismiss", { notice: projectFile, dismissed: true }, "invalid_request");
  const homeFile = join(dataDir, "home.yaml");
  const homeBytes = readFileSync(homeFile);
  writeFileSync(homeFile, "format: invalid\n");
  try {
    const blocked = await home.client.expectOk("space.get", {});
    assert.ok(blocked.diagnostics.some((entry) => entry.blocking));
    assert.ok(blocked.diagnostics.filter((entry) => entry.blocking).every((entry) => !entry.notice));
    await home.client.expectError("space.notice.dismiss", { notice: homeFile, dismissed: true }, "invalid_request");
  } finally {
    writeFileSync(homeFile, homeBytes);
  }
});

test("core-service-149: overlapping notice answers cannot publish stale counts or source capabilities", async (t) => {
  const userHome = mkdtempSync(join(scratch, "overlapping-notices-"));
  const stateDir = join(userHome, "state");
  const legacyDir = join(stateDir, "playbook", "sessions");
  mkdirSync(legacyDir, { recursive: true });
  const sources = [join(legacyDir, `${randomUUID()}.json`), join(legacyDir, `${randomUUID()}.json`)];
  const original = JSON.stringify({ schemaVersion: 1 });
  for (const source of sources) writeFileSync(source, original, { mode: 0o600 });
  const home = await startHome("overlapping-notices", { dataDir: join(userHome, ".spex"), project: false,
    env: { HOME: userHome, XDG_STATE_HOME: stateDir }, extra: { home: userHome } });
  t.after(() => home.stop());
  const before = await home.client.expectOk("space.get", {});
  const keys = sources.map((file) => {
    const key = before.diagnostics.find((entry) => entry.file === file)?.notice?.key;
    assert.ok(key);
    return key;
  });
  // Hold a real Space read after it has captured its diagnostic facts;
  // all commands, preferences and broadcasts still use the real core.
  const host = (home.service as unknown as { space: { host: SpaceHost } }).space.host;
  const checkRepairs = host.checkRepairs;
  let waiting: { enter(): void; released: Promise<void> } | undefined;
  const releases: (() => void)[] = [];
  t.after(() => { for (const release of releases) release(); host.checkRepairs = checkRepairs; });
  host.checkRepairs = async (diagnostics) => {
    const hold = waiting;
    waiting = undefined;
    const checked = await checkRepairs(diagnostics);
    if (hold) { hold.enter(); await hold.released; }
    return checked;
  };
  const holdNextRead = () => {
    let entered = false;
    let release!: () => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    waiting = { enter: () => { entered = true; }, released };
    releases.push(release);
    return { release, async entered() {
      const deadline = Date.now() + 5_000;
      while (!entered && Date.now() < deadline) await sleep(10);
      assert.ok(entered, "the first command reached its held diagnostic read");
    } };
  };
  for (const dismissed of [true, false]) {
    const hold = holdNextRead();
    const earlier = home.client.expectOk("space.notice.dismiss", { notice: keys[0]!, dismissed });
    await hold.entered();
    const later = await home.client.expectOk("space.notice.dismiss", { notice: keys[1]!, dismissed });
    const expectedCount = before.issues - (dismissed ? 2 : 0);
    assert.equal(later.issues, expectedCount);
    const from = home.client.mark();
    hold.release();
    const finishedLast = await earlier;
    assert.equal(finishedLast.issues, expectedCount, "finishing an older read does not undo either answer");
    const broadcasts = home.client.messages.slice(from).filter((message) => message.type === "space.state");
    assert.ok(broadcasts.length > 0, "the held command broadcasts after the newer answer");
    for (const message of broadcasts) {
      assert.equal(message.state.issues, expectedCount);
      for (const key of keys) assert.equal(message.state.diagnostics.find((entry) => entry.notice?.key === key)?.notice?.dismissed !== undefined, dismissed);
    }
  }
  for (const source of sources) assert.equal(readFileSync(source, "utf8"), original);
  const hold = holdNextRead();
  const earlier = home.client.expectOk("space.get", {});
  await hold.entered();
  writeFileSync(sources[0]!, `${original}\n`);
  hold.release();
  const changed = await earlier;
  const changedNotice = changed.diagnostics.find((entry) => entry.file === sources[0])?.notice;
  assert.ok(changedNotice?.key && changedNotice.key !== keys[0], "a source changed during the read receives a fresh capability");
  assert.equal(changedNotice.dismissed, undefined);
});
