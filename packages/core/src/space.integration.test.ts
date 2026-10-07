// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Core coverage of the Groups surface (space-37, space-38, space-39,
// space-51, space-52): real cores with substitute agents on scratch
// homes whose configuration lies in your own group's spex repository,
// each sync on one spex repository's clone, a bare repository standing
// in for the host's copy, an isolated Git configuration through the
// core's environment, a sleeping GIT_SSH_COMMAND for the transport limit
// and Stop, and two homes syncing one spex repository through one
// remote; and, from the stand-in Git host on (git-host-12), sign-in in
// both flows, picks, joins, members, the notice, sign-out, and the
// host's renames, archives, removals and refusals over its own HTTP
// transport — hermetic, on loopback alone.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { hostname } from "node:os";
import { basename, join } from "node:path";
import { createSessionStore } from "@sublang/playbook/session-store";
import { appendHistorySession, seedHistorySession } from "./testing/demo.js";
import { Home } from "./home.js";
import type { Command } from "./protocol.js";
import { clonePath, createSpaceHarness, OWN, OWN_KEY, ownClone, repositoryOf } from "./testing/space-harness.js";
import type { StandinHost } from "./testing/standin-host.js";

const fixture = createSpaceHarness();
const { scratch, git, bareRepo, sleepingSsh, sleep, sleeperPid, joinRemote, hangingCompileSpawner, COMPILE_INPUT, startHome, startHost, signIn, runTurn, peerClone, peerPush, turnRecords } = fixture;
test.after(() => fixture.dispose());

type Started = Awaited<ReturnType<typeof startHome>>;

/** Add a working folder: it pairs with a local spex repository in your
 * own group (storage-6); returns its key and its clone. */
async function addFolder(home: Started, path: string): Promise<{ key: string; clone: string }> {
  const project = await home.client.expectOk("project.register", { path });
  return { key: project.id, clone: clonePath(home.dataDir, project.id) };
}

/** A Git working folder bearing another folder's name, so the second
 * home's spex repository takes the same key and `project.json`. */
function sameNameFolder(original: string, side: string): string {
  const dir = join(mkdtempSync(join(scratch, `${side}-`)), basename(original));
  mkdirSync(dir);
  git(dir, "init", "-q");
  return dir;
}

function gitFolder(name: string): string {
  const dir = join(mkdtempSync(join(scratch, `${name}-`)), name);
  mkdirSync(dir);
  git(dir, "init", "-q");
  return dir;
}

const prefsOf = (dataDir: string): Record<string, unknown> =>
  (JSON.parse(readFileSync(join(dataDir, "local", "prefs.json"), "utf8")) as { prefs: Record<string, unknown> }).prefs;

// ---------------------------------------------------------------------------
// space-37: your own group, its repositories, and the first sync
// ---------------------------------------------------------------------------

test("space-37: a fresh home lists your own group alone with its own repository, and the git guidance without git", async (t) => {
  const home = await startHome("fresh", { project: false });
  t.after(() => home.stop());
  const state = await home.client.expectOk("space.get", {});
  assert.ok(state.git.ok);
  assert.equal(state.home, home.dataDir);
  assert.equal(state.account, null);
  assert.deepEqual(state.signIn, { phase: "idle" });
  assert.equal(state.readAt, null);
  assert.equal(state.groups.length, 1, "your own group alone");
  const [group] = state.groups;
  assert.deepEqual({ id: group.id, fullPath: group.fullPath, name: group.name, url: group.url, own: group.own }, { id: null, fullPath: OWN, name: OWN, url: null, own: true });
  assert.deepEqual(group.repositories.map((repository) => repository.key), [OWN_KEY]);
  const own = group.repositories[0];
  assert.equal(own.name, `${OWN}-spex`);
  assert.equal(own.own, true);
  assert.equal(own.state, "local-only");
  assert.equal(own.code, null);
  assert.equal(own.folder, null);
  assert.equal(own.lastSync, null);
  assert.equal(own.sync.phase, "idle");
  assert.equal(own.branch?.checkedAt, null);
  assert.equal(own.branch?.mergePending, false);
  assert.equal(git(ownClone(home.dataDir), "symbolic-ref", "--short", "HEAD"), "spex");
  assert.ok(git(ownClone(home.dataDir), "ls-files").split("\n").includes("config/playbook.config.yaml"));
  const empty = mkdtempSync(join(scratch, "nogit-"));
  const bare = await startHome("nogit", { env: { PATH: empty }, project: false });
  t.after(() => bare.stop());
  const without = await bare.client.expectOk("space.get", {});
  assert.equal(without.git.ok, false);
  assert.match((without.git as { guidance: string }).guidance, /Git is not installed/);
  assert.equal(repositoryOf(without, OWN_KEY).branch, null, "no repository without git");
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
  assert.deepEqual(state.groups.map((group) => group.fullPath), [OWN]);
  assert.deepEqual(state.groups[0].repositories.map((repository) => repository.key), [OWN_KEY, key], "your own group's repository first");
  const row = repositoryOf(state, key);
  assert.equal(row.state, "local-only");
  assert.equal(row.own, false);
  assert.equal(row.folder, home.projectDir);
  assert.equal(row.code, null, "the folder has no remote of its own");
  assert.equal(row.sync.phase, "idle");
  // Its clone begins on `spex` with one commit of the managed rules,
  // project.json, and its environment requesting the built-in spec
  // package, under the fallback identity (space-32, storage-17,
  // storage-6).
  assert.equal(git(clone, "symbolic-ref", "--short", "HEAD"), "spex");
  assert.equal(git(clone, "rev-list", "--count", "HEAD"), "1");
  assert.deepEqual(git(clone, "ls-files").split("\n"), [".gitattributes", ".gitignore", "project.json", "spex.lock", "spex.yaml"]);
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
  assert.ok(tracked.includes(`sessions/${sessionId}.json`) && tracked.includes(`sessions/${sessionId}.records.jsonl`));
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
  await home.client.expectError("space.fetch", { repository: key }, "invalid_request", /Sign in first/);
  await home.client.expectError("space.sync", { repository: "tester/nowhere-spex" }, "not_found", /no spex repository/);
  const bare = bareRepo();
  const set = await home.client.expectOk("space.remote.set", { repository: key, url: bare });
  assert.equal(repositoryOf(set, key).state, "reachable");
  assert.equal(repositoryOf(set, OWN_KEY).state, "local-only", "only that repository");
  assert.equal(git(clone, "remote", "get-url", "origin"), bare);
  for (const [url, pattern] of [["", /malformed/], ["  ", /malformed/], ["git@example.com:a b.git", /malformed/], ["https://user:secret@example.com/x.git", /credential/]] as const) {
    await home.client.expectError("space.remote.set", { repository: key, url }, "invalid_request", pattern);
    assert.equal(git(clone, "remote", "get-url", "origin"), bare, `origin unchanged after ${JSON.stringify(url)}`);
  }
  const checked = await home.client.settle("space.fetch", { repository: key });
  assert.equal(checked.sync.phase, "idle");
  assert.equal(typeof checked.branch?.checkedAt, "number");
  assert.equal(checked.branch?.hostEmpty, true);
  const other = bareRepo();
  const changed = repositoryOf(await home.client.expectOk("space.remote.set", { repository: key, url: other }), key);
  assert.equal(changed.branch?.checkedAt, null);
  assert.equal(changed.branch?.ahead, null);
  assert.equal(git(clone, "remote", "get-url", "origin"), other);
  const cleared = repositoryOf(await home.client.expectOk("space.remote.set", { repository: key, url: null }), key);
  assert.equal(cleared.state, "local-only");
  await home.client.expectError("space.sync", { repository: key }, "invalid_request", /Sign in first/);
});

test("space-37: the first sync pushes spex to the empty host, sets the upstream and records sync:<repository>:last", async (t) => {
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
  assert.equal(done.branch?.ahead, 0);
  assert.equal(done.branch?.behind, 0);
  const last = prefsOf(home.dataDir)[`sync:${key}:last`] as { at: number; sent: number; received: number };
  assert.equal(typeof last.at, "number");
  assert.equal(last.sent, done.sync.phase === "done" ? done.sync.sent : -1);
  assert.deepEqual(done.lastSync, last);
  assert.deepEqual(done.local, []);
  assert.equal(prefsOf(home.dataDir)[`sync:${OWN_KEY}:last`], undefined, "only the synced repository records a sync");
  assert.equal(git(clone, "status", "--porcelain"), "", "nothing of the sync stands uncommitted");
  const again = await home.client.settle("space.sync", { repository: key });
  assert.ok(again.sync.phase === "done" && !again.sync.pushed && again.sync.sent === 0 && again.sync.received === 0, JSON.stringify(again.sync));
  // A restarted core holds no check but still reports the last sync; a
  // changed remote clears both.
  await home.stop();
  const restarted = await startHome("first-push-restart", { dataDir: home.dataDir, project: false });
  t.after(() => restarted.stop());
  const reread = await restarted.client.repository(key);
  assert.equal(reread.branch?.checkedAt, null);
  assert.deepEqual(reread.lastSync, again.lastSync);
  assert.equal(reread.state, "reachable");
  const moved = repositoryOf(await restarted.client.expectOk("space.remote.set", { repository: key, url: bareRepo() }), key);
  assert.equal(moved.branch?.checkedAt, null);
  assert.equal(moved.lastSync, null);
  assert.equal(prefsOf(home.dataDir)[`sync:${key}:last`], undefined);
  // A fresh home's joining sync against an empty host completes as a first push.
  const joiner = await startHome("joiner");
  t.after(() => joiner.stop());
  const joined = await addFolder(joiner, joiner.projectDir);
  const empty = bareRepo();
  await joiner.client.expectOk("space.remote.set", { repository: joined.key, url: empty });
  const first = await joiner.client.settle("space.sync", { repository: joined.key, join: true });
  assert.ok(first.sync.phase === "done" && first.sync.pushed && first.sync.sent > 0 && first.sync.received === 0, JSON.stringify(first.sync));
  assert.equal(first.branch?.hostEmpty, false);
  assert.equal(git(empty, "rev-parse", "spex"), git(joined.clone, "rev-parse", "spex"));
});

test("space-37: a turn in flight, an out-of-band lease and a running compile refuse their repository's sync by name while another's proceeds", async (t) => {
  const home = await startHome("blockers", { env: { SPEX_SLC: "fake-slc" }, extra: { compileSpawner: hangingCompileSpawner() } });
  t.after(() => home.stop());
  const { key, clone } = await addFolder(home, home.projectDir);
  const other = await addFolder(home, gitFolder("blockers-other"));
  const sessionId = await runTurn(home, key, "Settle first");
  await home.client.expectOk("space.remote.set", { repository: key, url: bareRepo() });
  await home.client.expectOk("space.remote.set", { repository: other.key, url: bareRepo() });
  assert.equal((await home.client.settle("space.sync", { repository: key })).sync.phase, "done");
  const proceeds = async (repository: string, why: string): Promise<void> => {
    const synced = await home.client.settle("space.sync", { repository });
    assert.equal(synced.sync.phase, "done", `${why}: ${JSON.stringify(synced.sync)}`);
  };
  // A turn in flight.
  await home.client.expectOk("turn.submit", { sessionId, text: "slow: keep going" });
  await home.client.waitFor((m) => m.type === "session.state" && m.session.id === sessionId && m.session.turnActive === true);
  await home.client.expectError("space.sync", { repository: key }, "busy", /Wait for “Settle first” in/);
  await proceeds(other.key, "another repository's sync never waits for this one's turn");
  await home.client.waitFor((m) => m.type === "session.state" && m.session.id === sessionId && !m.session.live && (m.session.turns ?? 0) >= 2, 20_000);
  // A management lease taken out of band.
  const shared = createSessionStore({ sessionsDir: join(clone, "sessions") });
  await shared.prepare();
  const lease = await shared.acquireManagement(sessionId);
  try {
    await home.client.expectError("space.sync", { repository: key }, "busy", /“Settle first” (is in use elsewhere|ownership cannot be verified)/);
    await proceeds(other.key, "a lease in one clone holds no other");
  } finally { await lease.release(); }
  // A running compile belongs to the project whose working folder holds
  // its spec package (environments-10).
  const compile = home.client.command("compile.run", { ...COMPILE_INPUT, projectId: key });
  await home.client.waitFor((m) => m.type === "compile.progress" && m.line === "slc: working");
  await home.client.expectError("space.sync", { repository: key }, "busy", /demo is compiling/);
  await proceeds(other.key, "a compile holds only its own repository");
  await home.client.expectOk("compile.abort", { playbookId: "demo" });
  await compile;
  const settled = await home.client.settle("space.sync", { repository: key });
  assert.equal(settled.sync.phase, "done");
});

test("space-37: while a check runs, writes beneath that clone are refused naming the sync, another repository's are admitted, and Stop ends the child", async (t) => {
  const { script, pidFile } = sleepingSsh();
  const home = await startHome("gate", { env: { GIT_SSH_COMMAND: script }, extra: { spaceTransportTimeoutMs: 60_000 } });
  t.after(() => home.stop());
  const { key, clone } = await addFolder(home, home.projectDir);
  const other = await addFolder(home, gitFolder("gate-other"));
  const sessionId = await runTurn(home, key, "Gate me");
  const otherSession = await runTurn(home, other.key, "Elsewhere");
  await home.client.expectOk("space.remote.set", { repository: key, url: "ssh://localhost/x" });
  const before = git(clone, "rev-parse", "HEAD");
  await home.client.expectOk("intent.queue", { projectId: key, text: "Saved by the sync" });
  const from = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.sync", { repository: key }), { accepted: true });
  // Stop is offered once the step's Git child runs (space-16).
  const running = await home.client.waitRepository(from, key, (repository) => repository.sync.phase === "running" && repository.sync.step === "check" && repository.sync.cancelable);
  assert.ok(running.sync.phase === "running" && running.sync.cancelable);
  for (const [type, fields] of [
    ["turn.submit", { sessionId, text: "blocked" }],
    ["session.create", { projectId: key }],
    ["session.viewed", { sessionId, turnId: 1 }],
    ["intent.queue", { projectId: key, text: "blocked" }],
    ["project.rebind", { projectId: key, path: home.projectDir }],
  ] as const) {
    const reply = await home.client.command(type as Command["type"], fields as never);
    assert.ok(!reply.ok && reply.error.code === "busy", `${type} must be refused busy: ${JSON.stringify(reply)}`);
    assert.match(reply.error.message, /-spex is syncing; wait for it to finish/);
  }
  await home.client.expectError("space.sync", { repository: key }, "busy", /Already syncing/);
  await home.client.expectError("space.fetch", { repository: key }, "busy", /Already syncing/);
  // Other spex repositories stay writable (space-21).
  await home.client.expectOk("intent.queue", { projectId: other.key, text: "elsewhere" });
  await runTurn(home, other.key, "Admitted elsewhere", otherSession);
  await home.client.expectOk("config.edit", { op: { kind: "captain.set", patch: { model: "claude-test-edited" } } });
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
  // The gate is lifted: writes go through again.
  await home.client.expectOk("intent.queue", { projectId: key, text: "after the stop" });
});

test("space-37: a MERGE_HEAD planted in a clone reads as a pending merge and refuses its sync", async (t) => {
  const first = await startHome("merge");
  const { key, clone } = await addFolder(first, first.projectDir);
  await first.stop();
  writeFileSync(join(clone, ".git", "MERGE_HEAD"), `${git(clone, "rev-parse", "HEAD")}\n`);
  const home = await startHome("merge-again", { dataDir: first.dataDir, project: false });
  t.after(() => home.stop());
  const state = await home.client.expectOk("space.get", {});
  assert.equal(repositoryOf(state, key).branch?.mergePending, true);
  assert.equal(repositoryOf(state, OWN_KEY).branch?.mergePending, false);
  assert.ok(state.diagnostics.some((d) => d.file === `workspace/${key}/.git/MERGE_HEAD` && /merge is pending/.test(d.reason) && !d.blocking), JSON.stringify(state.diagnostics));
  await home.client.expectOk("space.remote.set", { repository: key, url: bareRepo() });
  await home.client.expectError("space.sync", { repository: key }, "invalid_request", /Finish or abort the merge/);
  await home.client.expectError("space.fetch", { repository: key }, "invalid_request", /Finish or abort the merge/);
});

// ---------------------------------------------------------------------------
// space-38: the sync loop of one spex repository over two homes
// ---------------------------------------------------------------------------

test("space-38: your own group's repository joins with one Settings choice, and a project's session lands on the joining home", async (t) => {
  const bareOwn = bareRepo();
  const bareProject = bareRepo();
  const a = await startHome("a");
  t.after(() => a.stop());
  const identity = join(scratch, "b-gitconfig");
  writeFileSync(identity, "[user]\n\tname = Home B\n\temail = b@example.test\n[commit]\n\tgpgsign = true\n");
  const b = await startHome("b", { model: "claude-test-b", env: { GIT_CONFIG_GLOBAL: identity }, project: false });
  t.after(() => b.stop());
  // A pushes a project's spex repository with a session, and its own group's.
  const { key } = await addFolder(a, a.projectDir);
  const sessionA = await runTurn(a, key, "Fix the login redirect");
  await a.client.expectOk("space.remote.set", { repository: key, url: bareProject });
  assert.equal((await a.client.settle("space.sync", { repository: key })).sync.phase, "done");
  await a.client.expectOk("space.remote.set", { repository: OWN_KEY, url: bareOwn });
  assert.equal((await a.client.settle("space.sync", { repository: OWN_KEY })).sync.phase, "done");
  // B's own group's repository, begun under B's own identity with signing
  // turned off, holds a different configuration and an unrelated history.
  assert.equal(git(ownClone(b.dataDir), "log", "-1", "--format=%cn"), "Home B");
  await b.client.expectOk("space.remote.set", { repository: OWN_KEY, url: bareOwn });
  const unrelated = await b.client.settle("space.sync", { repository: OWN_KEY });
  assert.equal(unrelated.sync.phase, "unrelated", JSON.stringify(unrelated.sync));
  assert.equal(unrelated.branch?.unrelated, true);
  assert.deepEqual(unrelated.incoming, []);
  const choices = await b.client.settle("space.sync", { repository: OWN_KEY, join: true });
  assert.equal(choices.sync.phase, "choices", JSON.stringify(choices.sync));
  assert.equal(choices.conflicts.length, 1);
  const conflict = choices.conflicts[0];
  assert.equal(conflict.unit.unit, "config/playbook.config.yaml");
  assert.equal(conflict.unit.kind, "settings");
  assert.equal(conflict.unit.label, "Settings changed");
  assert.equal(conflict.mine.change, "new");
  assert.equal(conflict.remote.change, "new");
  assert.ok(conflict.mine.diff && conflict.remote.diff);
  assert.ok(typeof conflict.mine.at === "number" && typeof conflict.remote.at === "number");
  await b.client.expectError("space.sync", { repository: OWN_KEY, choices: { "sessions/nope": "mine" }, join: true }, "invalid_request", /unknown unit/);
  await b.client.expectError("space.sync", { repository: OWN_KEY, choices: { ".gitignore": "mine" }, join: true }, "invalid_request", /no divergent change/);
  const mineBytes = readFileSync(b.configPath);
  const joined = await b.client.settle("space.sync", { repository: OWN_KEY, choices: { "config/playbook.config.yaml": "mine" }, join: true });
  assert.equal(joined.sync.phase, "done", JSON.stringify(joined.sync));
  assert.ok(joined.sync.phase === "done" && joined.sync.pushed);
  assert.deepEqual(readFileSync(b.configPath), mineBytes, "Keep mine leaves this home's file");
  assert.equal(joined.branch?.unrelated, false);
  assert.equal(git(ownClone(b.dataDir), "log", "-1", "--format=%P").split(" ").length, 2, "one merge commit with two parents");
  assert.equal(git(bareOwn, "rev-parse", "spex"), git(ownClone(b.dataDir), "rev-parse", "spex"));
  assert.equal(git(ownClone(b.dataDir), "log", "-1", "--format=%cn"), "Home B");
  // B adds a folder of the same name: its local spex repository joins the
  // one A pushed, and A's session lists with its history (space-20).
  const bFolder = sameNameFolder(a.projectDir, "b");
  const { key: bKey, clone: bClone } = await addFolder(b, bFolder);
  assert.equal(bKey, key);
  const sessionB = await runTurn(b, key, "B's own work");
  await b.client.expectOk("space.remote.set", { repository: key, url: bareProject });
  const from = b.client.mark();
  await joinRemote(b, key);
  assert.equal(existsSync(join(bClone, "sessions", `${sessionA}.json`)), true);
  assert.equal(existsSync(join(bClone, "sessions", `${sessionA}.records.jsonl`)), true);
  const listed = (await b.client.expectOk("session.list", {})).find((s) => s.id === sessionA);
  assert.equal(listed?.title, "Fix the login redirect");
  assert.equal(listed?.projectId, key);
  const history = await b.client.expectOk("history.get", { sessionId: sessionA });
  assert.ok(history.records.some((r) => r.record.type === "turn_started"));
  await b.client.waitFor((m) => b.client.messages.indexOf(m) >= from && m.type === "intents.changed" && m.projectIds.includes(key));
  // A receives B's session.
  const back = await a.client.settle("space.sync", { repository: key });
  assert.equal(back.sync.phase, "done", JSON.stringify(back.sync));
  assert.equal(existsSync(join(clonePath(a.dataDir, key), "sessions", `${sessionB}.json`)), true);
  assert.ok((await a.client.expectOk("session.list", {})).some((s) => s.id === sessionB && s.projectId === key));
  // A takes B's kept configuration as a fast-forward; then Settings
  // diverge again: "Take host's" replaces the file whole and the
  // configuration reloads.
  const forwarded = await a.client.settle("space.sync", { repository: OWN_KEY });
  assert.ok(forwarded.sync.phase === "done" && forwarded.sync.received === 1 && forwarded.sync.sent === 0, JSON.stringify(forwarded.sync));
  assert.deepEqual(readFileSync(a.configPath), mineBytes, "A now holds the configuration B kept");
  await a.client.expectOk("config.edit", { op: { kind: "captain.set", patch: { model: "claude-test-a2" } } });
  assert.equal((await a.client.settle("space.sync", { repository: OWN_KEY })).sync.phase, "done");
  await b.client.expectOk("config.edit", { op: { kind: "captain.set", patch: { model: "claude-test-b2" } } });
  const diverged = await b.client.settle("space.sync", { repository: OWN_KEY });
  assert.equal(diverged.sync.phase, "choices");
  assert.deepEqual(diverged.conflicts.map((c) => c.unit.unit), ["config/playbook.config.yaml"]);
  assert.equal(diverged.conflicts[0].mine.change, "updated");
  const mine = await b.client.expectOk("space.diff", { repository: OWN_KEY, unit: "config/playbook.config.yaml", path: "config/playbook.config.yaml", side: "mine" });
  assert.match(mine.patch, /\+.*claude-test-b2/);
  const remote = await b.client.expectOk("space.diff", { repository: OWN_KEY, unit: "config/playbook.config.yaml", path: "config/playbook.config.yaml", side: "remote" });
  assert.match(remote.patch, /\+.*claude-test-a2/);
  const taken = await b.client.settle("space.sync", { repository: OWN_KEY, choices: { "config/playbook.config.yaml": "remote" } });
  assert.equal(taken.sync.phase, "done", JSON.stringify(taken.sync));
  assert.match(readFileSync(b.configPath, "utf8"), /claude-test-a2/, "Take host's replaces the file");
  const configState = await b.client.expectOk("config.get", {});
  assert.ok(configState.status === "valid" && configState.summary.captain.model === "claude-test-a2", "the configuration reloaded");
});

test("space-38: an intent added on each home lists on the other with no choice asked, the older first; one edited on both is one choice taken whole", async (t) => {
  const bare = bareRepo();
  const a = await startHome("intents-a");
  t.after(() => a.stop());
  const b = await startHome("intents-b", { project: false });
  t.after(() => b.stop());
  const { key, clone: aClone } = await addFolder(a, a.projectDir);
  await a.client.expectOk("space.remote.set", { repository: key, url: bare });
  assert.equal((await a.client.settle("space.sync", { repository: key })).sync.phase, "done");
  const { clone: bClone } = await addFolder(b, sameNameFolder(a.projectDir, "intents-b"));
  await b.client.expectOk("space.remote.set", { repository: key, url: bare });
  await joinRemote(b, key);
  const older = await a.client.expectOk("intent.queue", { projectId: key, text: "Ship the parser" });
  await sleep(5);
  const newer = await b.client.expectOk("intent.queue", { projectId: key, text: "Document the parser" });
  assert.ok(older.createdAt < newer.createdAt);
  assert.equal((await a.client.settle("space.sync", { repository: key })).sync.phase, "done");
  const merged = await b.client.settle("space.sync", { repository: key });
  assert.ok(merged.sync.phase === "done" && merged.sync.received === 1 && merged.sync.sent === 1, JSON.stringify(merged.sync));
  assert.deepEqual(merged.conflicts, [], "adding an intent never conflicts");
  const back = await a.client.settle("space.sync", { repository: key });
  assert.ok(back.sync.phase === "done" && back.sync.received === 1, JSON.stringify(back.sync));
  for (const home of [a, b]) {
    const queue = (await home.client.expectOk("ledger.get", {})).intents.filter((row) => row.intent.projectId === key && row.state === "queued");
    assert.deepEqual(queue.map((row) => row.intent.id), [older.id, newer.id], "the older reads first");
    assert.ok(queue[0].next && !queue[1].next, "the oldest queued intent is next");
  }
  // The same intent edited on both homes is one choice, replaced whole.
  await a.client.expectOk("intent.edit", { intentId: newer.id, text: "Document the parser for users" });
  assert.equal((await a.client.settle("space.sync", { repository: key })).sync.phase, "done");
  await b.client.expectOk("intent.edit", { intentId: newer.id, text: "Document the parser in the README" });
  const choices = await b.client.settle("space.sync", { repository: key });
  assert.equal(choices.sync.phase, "choices", JSON.stringify(choices.sync));
  assert.deepEqual(choices.conflicts.map((c) => c.unit.unit), [`intents/${newer.id}`]);
  const row = choices.conflicts[0];
  assert.equal(row.unit.kind, "intent");
  assert.equal(row.unit.intentId, newer.id);
  assert.equal(row.unit.label, "Document the parser in the README");
  assert.equal(row.mine.change, "updated");
  assert.equal(row.remote.change, "updated");
  assert.ok(!row.mine.diff && !row.remote.diff);
  await b.client.expectError("space.diff", { repository: key, unit: `intents/${newer.id}`, path: `intents/${newer.id}.json`, side: "mine" }, "invalid_request", /no text diff/);
  const taken = await b.client.settle("space.sync", { repository: key, choices: { [`intents/${newer.id}`]: "remote" } });
  assert.equal(taken.sync.phase, "done", JSON.stringify(taken.sync));
  assert.deepEqual(readFileSync(join(bClone, "intents", `${newer.id}.json`)), readFileSync(join(aClone, "intents", `${newer.id}.json`)));
  const ledger = (await b.client.expectOk("ledger.get", {})).intents.find((entry) => entry.intent.id === newer.id);
  assert.equal(ledger?.intent.text, "Document the parser for users");
  assert.equal((await a.client.settle("space.sync", { repository: key })).sync.phase, "done");
  assert.equal(git(bare, "rev-parse", "spex"), git(aClone, "rev-parse", "spex"));
});

test("space-38: the same session changed on both homes is one choice; the host's replaces the bundle and clears local marks; delete versus modify", async (t) => {
  const bare = bareRepo();
  const a = await startHome("a2");
  t.after(() => a.stop());
  const b = await startHome("b2", { project: false });
  t.after(() => b.stop());
  const { key, clone: aClone } = await addFolder(a, a.projectDir);
  const shared = await runTurn(a, key, "Shared session");
  const doomed = await runTurn(a, key, "Doomed session");
  await a.client.expectOk("space.remote.set", { repository: key, url: bare });
  assert.equal((await a.client.settle("space.sync", { repository: key })).sync.phase, "done");
  const bFolder = sameNameFolder(a.projectDir, "b2");
  const { clone: bClone } = await addFolder(b, bFolder);
  await b.client.expectOk("space.remote.set", { repository: key, url: bare });
  await joinRemote(b, key);
  assert.ok((await b.client.expectOk("session.list", {})).some((s) => s.id === shared));
  // Both change the shared session: A runs a turn; B appends its own and marks it viewed with hints.
  await runTurn(a, key, "A's second turn", shared);
  assert.equal((await a.client.settle("space.sync", { repository: key })).sync.phase, "done");
  await appendHistorySession(join(bClone, "sessions"), shared, turnRecords("B's second turn", 2));
  await b.client.expectOk("project.register", { path: bFolder });
  await b.client.waitFor((m) => m.type === "session.state" && m.session.id === shared && (m.session.turns ?? 0) === 2, 20_000);
  writeFileSync(join(bClone, "sessions", `${shared}.hints.json`), "{}");
  await b.client.expectOk("session.viewed", { sessionId: shared, turnId: 1 });
  const listedBefore = await b.client.repository(key);
  assert.ok(listedBefore.local.some((u) => u.sessionId === shared && u.change === "updated" && u.detail?.includes("2 turns")), JSON.stringify(listedBefore.local));
  const choices = await b.client.settle("space.sync", { repository: key });
  assert.equal(choices.sync.phase, "choices", JSON.stringify(choices.sync));
  assert.deepEqual(choices.conflicts.map((c) => c.unit.unit), [`sessions/${shared}`]);
  const row = choices.conflicts[0];
  assert.equal(row.unit.label, "Shared session");
  assert.equal(row.unit.sessionId, shared);
  assert.equal(row.mine.detail, "2 turns");
  assert.equal(row.remote.detail, "2 turns");
  assert.ok(typeof row.mine.at === "number" && typeof row.remote.at === "number");
  await b.client.expectError("space.diff", { repository: key, unit: `sessions/${shared}`, path: `sessions/${shared}.json`, side: "mine" }, "invalid_request", /no text diff/);
  const from = b.client.mark();
  const done = await b.client.settle("space.sync", { repository: key, choices: { [`sessions/${shared}`]: "remote" } });
  assert.equal(done.sync.phase, "done", JSON.stringify(done.sync));
  assert.deepEqual(readFileSync(join(bClone, "sessions", `${shared}.json`)), readFileSync(join(aClone, "sessions", `${shared}.json`)));
  assert.deepEqual(readFileSync(join(bClone, "sessions", `${shared}.records.jsonl`)), readFileSync(join(aClone, "sessions", `${shared}.records.jsonl`)));
  assert.equal(existsSync(join(bClone, "sessions", `${shared}.hints.json`)), false, "hints cleared");
  assert.equal(prefsOf(b.dataDir)[`viewed:${shared}`], undefined, "viewed marker cleared");
  const messages = b.client.messages.slice(from);
  const replaced = messages.findIndex((m) => m.type === "session.history-replaced" && m.sessionId === shared);
  const summary = messages.findIndex((m, i) => i > replaced && m.type === "session.state" && m.session.id === shared);
  assert.ok(replaced >= 0 && summary > replaced, "history-replaced before the summary");
  const served = await b.client.expectOk("history.get", { sessionId: shared });
  assert.ok(served.records.some((r) => r.record.type === "turn_started" && (r.record as { turn?: { prompt?: string } }).turn?.prompt === "A's second turn"));
  assert.ok(!served.records.some((r) => r.record.type === "turn_started" && (r.record as { turn?: { prompt?: string } }).turn?.prompt === "B's second turn"));
  assert.equal(existsSync(join(bClone, ".git", "MERGE_HEAD")), false);
  // Delete versus modify: B deletes the doomed session, A modifies it; A takes the deleting side.
  await b.client.expectOk("session.delete", { sessionId: doomed });
  assert.equal((await b.client.settle("space.sync", { repository: key })).sync.phase, "done");
  await runTurn(a, key, "Still working on it", doomed);
  const conflict = await a.client.settle("space.sync", { repository: key });
  assert.equal(conflict.sync.phase, "choices", JSON.stringify(conflict.sync));
  const deleting = conflict.conflicts.find((c) => c.unit.unit === `sessions/${doomed}`);
  assert.equal(deleting?.remote.change, "deleted");
  assert.equal(deleting?.remote.detail, "deleted");
  assert.equal(deleting?.mine.change, "updated");
  const gone = await a.client.settle("space.sync", { repository: key, choices: { [`sessions/${doomed}`]: "remote" } });
  assert.equal(gone.sync.phase, "done", JSON.stringify(gone.sync));
  assert.equal(existsSync(join(aClone, "sessions", `${doomed}.json`)), false);
  assert.equal(existsSync(join(aClone, "sessions", `${doomed}.records.jsonl`)), false);
  assert.ok(!(await a.client.expectOk("session.list", {})).some((s) => s.id === doomed));
  assert.ok(a.client.messages.some((m) => m.type === "session.removed" && m.sessionId === doomed));
});

test("space-38: a marker with a half-written selection is repaired at startup into the recorded commit", async (t) => {
  const first = await startHome("repair");
  const { key, clone } = await addFolder(first, first.projectDir);
  await first.stop();
  const dataDir = first.dataDir;
  const cwd = first.projectDir;
  const sessionId = await seedHistorySession(join(clone, "sessions"), cwd, turnRecords("Base turn", 1));
  git(clone, "add", "-A", "--", ".");
  git(clone, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "base");
  const base = git(clone, "rev-parse", "HEAD");
  const remote = bareRepo();
  git(clone, "remote", "add", "origin", remote);
  git(clone, "push", "-q", "-u", "origin", "spex");
  const theirsDir = peerClone(remote);
  await createSessionStore({ sessionsDir: join(theirsDir, "sessions") }).prepare();
  await seedHistorySession(join(theirsDir, "sessions"), cwd, turnRecords("Their second turn", 2), sessionId);
  git(theirsDir, "add", "-A", "--", ".");
  git(theirsDir, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "theirs");
  git(theirsDir, "push", "-q", "origin", "HEAD:spex");
  git(clone, "fetch", "-q", "origin");
  const theirs = git(clone, "rev-parse", "refs/remotes/origin/spex");
  const intentId = randomUUID();
  mkdirSync(join(clone, "intents"), { recursive: true });
  writeFileSync(join(clone, "intents", `${intentId}.json`), JSON.stringify({ format: 1, id: intentId, text: "Ours", createdAt: 1 }));
  writeFileSync(join(clone, "notes.txt"), "ours\n");
  git(clone, "add", "-A", "--", ".");
  git(clone, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "ours");
  const ours = git(clone, "rev-parse", "HEAD");
  // The interrupted apply: the replay landed, the manifest did not, the marker stands.
  const marker = join(clone, ".spex-apply.json");
  writeFileSync(join(clone, "sessions", `${sessionId}.records.jsonl`), readFileSync(join(theirsDir, "sessions", `${sessionId}.records.jsonl`)));
  writeFileSync(marker, JSON.stringify({ v: 1, ours, theirs, base, choices: { [`sessions/${sessionId}`]: "theirs" }, at: Date.now() }));
  const home = await startHome("repair-start", { dataDir, project: false });
  t.after(() => home.stop());
  const state = await home.client.expectOk("space.get", {});
  assert.ok(!state.diagnostics.some((d) => d.file.endsWith(".spex-apply.json")), JSON.stringify(state.diagnostics));
  assert.equal(existsSync(marker), false);
  const head = git(clone, "rev-parse", "HEAD");
  assert.notEqual(head, ours);
  assert.deepEqual(git(clone, "log", "-1", "--format=%P").split(" "), [ours, theirs]);
  assert.deepEqual(readFileSync(join(clone, "sessions", `${sessionId}.json`)), readFileSync(join(theirsDir, "sessions", `${sessionId}.json`)));
  assert.equal(git(clone, "show", "HEAD:notes.txt"), "ours");
  assert.equal(git(clone, "status", "--porcelain"), "");
  assert.equal(git(clone, "symbolic-ref", "--short", "HEAD"), "spex");
  const listed = (await home.client.expectOk("session.list", {})).find((s) => s.id === sessionId);
  assert.equal(listed?.turns, 2, "the clone's project lists the repaired session");
  assert.equal(listed?.projectId, key);
  // A marker left standing after its merge commit landed is cleared
  // with nothing re-applied: spex stays on the landed commit.
  await home.stop();
  writeFileSync(marker, JSON.stringify({ v: 1, ours, theirs, base, choices: { [`sessions/${sessionId}`]: "theirs" }, at: Date.now() }));
  const again = await startHome("repair-again", { dataDir, project: false });
  t.after(() => again.stop());
  const cleared = await again.client.expectOk("space.get", {});
  assert.ok(!cleared.diagnostics.some((d) => d.file.endsWith(".spex-apply.json")), JSON.stringify(cleared.diagnostics));
  assert.equal(existsSync(marker), false);
  assert.equal(git(clone, "rev-parse", "HEAD"), head);
});

test("space-38: a marker left after a landed fast-forward is cleared at startup with spex on the host's commit", async (t) => {
  const first = await startHome("repair-ff");
  const { clone } = await addFolder(first, first.projectDir);
  await first.stop();
  const base = git(clone, "rev-parse", "HEAD");
  const remote = bareRepo();
  git(clone, "remote", "add", "origin", remote);
  git(clone, "push", "-q", "-u", "origin", "spex");
  const peer = peerClone(remote);
  const theirs = await peerPush(peer, (dir) => writeFileSync(join(dir, "notes.txt"), "theirs\n"));
  // The fast-forward landed — spex moved to the host's commit and the
  // tree followed — but the marker was never removed.
  git(clone, "fetch", "-q", "origin");
  git(clone, "reset", "-q", "--hard", "refs/remotes/origin/spex");
  assert.equal(git(clone, "rev-parse", "HEAD"), theirs);
  const marker = join(clone, ".spex-apply.json");
  writeFileSync(marker, JSON.stringify({ v: 1, ours: base, theirs, base, choices: {}, at: Date.now() }));
  const home = await startHome("repair-ff-start", { dataDir: first.dataDir, project: false });
  t.after(() => home.stop());
  const state = await home.client.expectOk("space.get", {});
  assert.ok(!state.diagnostics.some((d) => d.file.endsWith(".spex-apply.json")), JSON.stringify(state.diagnostics));
  assert.equal(existsSync(marker), false);
  assert.equal(git(clone, "rev-parse", "HEAD"), theirs);
  assert.equal(git(clone, "log", "-1", "--format=%P").split(" ").length, 1, "no merge commit");
  assert.equal(git(clone, "status", "--porcelain"), "");
  assert.equal(readFileSync(join(clone, "notes.txt"), "utf8"), "theirs\n");
});

test("space-38: a missing repository, an unreachable host and a sleeping transport stop with their causes", async (t) => {
  const { script } = sleepingSsh();
  const home = await startHome("transport", { env: { GIT_SSH_COMMAND: script }, extra: { spaceTransportTimeoutMs: 500 } });
  t.after(() => home.stop());
  const { key } = await addFolder(home, home.projectDir);
  const expectStop = async (url: string, cause: string, message: RegExp, retry: boolean): Promise<void> => {
    await home.client.expectOk("space.remote.set", { repository: key, url });
    const stopped = await home.client.settle("space.fetch", { repository: key });
    assert.ok(stopped.sync.phase === "stopped" && stopped.sync.op === "check" && stopped.sync.step === "check", JSON.stringify(stopped.sync));
    assert.equal(stopped.sync.phase === "stopped" ? stopped.sync.cause : "", cause, JSON.stringify(stopped.sync));
    assert.match(stopped.sync.phase === "stopped" ? stopped.sync.message : "", message);
    assert.ok(stopped.sync.phase === "stopped" && stopped.sync.guidance.length > 0);
    assert.equal(stopped.sync.phase === "stopped" && stopped.sync.retry, retry);
  };
  // The host answers alike for absent and for unreadable, so the report
  // names both causes, claims neither, and keeps Retry.
  await expectStop(join(scratch, "nonexistent", "path"), "gone", /No repository this machine can see at/, true);
  const localStop = await home.client.repository(key);
  // A local path has a folder to read, no account (space-50).
  assert.ok(
    localStop.sync.phase === "stopped" && /Check the path,.*make sure this user can read the folder/.test(localStop.sync.guidance),
    JSON.stringify(localStop.sync),
  );
  const start = Date.now();
  await expectStop("ssh://localhost/x", "timeout", /No answer from localhost/, true);
  assert.ok(Date.now() - start < 5_000, "the shortened limit ends the sleeping transport");
  // The unreachable case runs the machine's ssh with BatchMode, as the core sets it where none is given.
  const plain = await startHome("transport-plain");
  t.after(() => plain.stop());
  const { key: plainKey } = await addFolder(plain, plain.projectDir);
  await plain.client.expectOk("space.remote.set", { repository: plainKey, url: "ssh://127.0.0.1:1/x" });
  const refusedHost = await plain.client.settle("space.fetch", { repository: plainKey });
  assert.ok(refusedHost.sync.phase === "stopped" && refusedHost.sync.cause === "unreachable", JSON.stringify(refusedHost.sync));
  assert.match(refusedHost.sync.phase === "stopped" ? refusedHost.sync.message : "", /Could not reach 127\.0\.0\.1/);
  const synced = await plain.client.settle("space.sync", { repository: plainKey });
  assert.ok(synced.sync.phase === "stopped" && synced.sync.op === "sync" && synced.sync.step === "check" && synced.sync.cause === "unreachable", JSON.stringify(synced.sync));
  // Nothing stands before the host on http(s), with or without a colon,
  // so a bare token never reaches .git/config or the screen (space-5).
  for (const url of ["https://user:secret@example.com/x.git", "https://ghp_0123456789abcdef@example.com/x.git"]) {
    await plain.client.expectError("space.remote.set", { repository: plainKey, url }, "invalid_request", /stores no credential/);
  }
  // An SSH form's user is the transport's own, not a credential; a
  // network failure turns on no identity, so its guidance names no act
  // of access (space-50).
  await plain.client.expectOk("space.remote.set", { repository: plainKey, url: "ssh://git@127.0.0.1:1/x" });
  const sshStop = await plain.client.settle("space.fetch", { repository: plainKey });
  assert.ok(sshStop.sync.phase === "stopped" && sshStop.sync.cause === "unreachable", JSON.stringify(sshStop.sync));
  assert.ok(!/SSH key|gh auth|sign this machine in/.test(sshStop.sync.phase === "stopped" ? sshStop.sync.guidance : ""), JSON.stringify(sshStop.sync));
});

// ---------------------------------------------------------------------------
// space-39: listings and the explorer
// ---------------------------------------------------------------------------

const PROJECT_CONFIG = "playbooks:\n  code:\n    roles:\n      coder: dev.coder\n";
const PEER_CONFIG = "playbooks:\n  review:\n    roles:\n      reviewer: dev.reviewer\n";

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
  const listed = await home.client.repository(key);
  assert.equal(listed.code, "git@example.com:acme/app.git", "the row reads where the code lives");
  const local = listed.local;
  assert.deepEqual(local.map((u) => u.kind), ["session", "intent", "authoring", "environment", "settings", "code", "rules", "other"], JSON.stringify(local));
  const [session, queued, authoring, environment, settings, code, rules, other] = local;
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
  assert.equal(checked.branch?.ahead, 0);
  assert.equal(checked.branch?.behind, 1);
  assert.equal(checked.branch?.hostEmpty, false);
  assert.deepEqual(checked.incoming.map((u) => u.kind), ["session", "intent"], JSON.stringify(checked.incoming));
  assert.equal(checked.incoming[0].label, "Peer's session");
  assert.equal(checked.incoming[0].change, "new");
  assert.equal(checked.incoming[1].label, "Review the parser");
  assert.equal(checked.incoming[1].intentId, peerIntent);
  assert.deepEqual(checked.conflicts.map((c) => c.unit.unit), ["config/playbook.config.yaml"]);
  assert.ok(checked.conflicts[0].mine.diff && checked.conflicts[0].remote.diff);
  assert.deepEqual(checked.local.map((u) => u.kind), ["session", "intent", "authoring", "environment", "code", "rules", "other"]);
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
  await home.client.expectError("space.diff", { repository: key, unit: "config/playbook.config.yaml", path: "other", side: "mine" }, "invalid_request", /unknown path/);
  await home.client.expectError("space.diff", { repository: key, unit: "nope", path: "nope", side: "mine" }, "invalid_request", /unknown unit/);
  const empty = bareRepo();
  await home.client.expectOk("space.remote.set", { repository: key, url: empty });
  const vacant = await home.client.settle("space.fetch", { repository: key });
  assert.equal(vacant.branch?.hostEmpty, true);
  assert.deepEqual(vacant.incoming, []);
  assert.deepEqual(vacant.conflicts, []);
  assert.ok(vacant.local.every((u) => u.change === "new"));
  await home.client.expectOk("space.remote.set", { repository: key, url: bare });
  // The explorer.
  mkdirSync(join(clone, "packages", "builtin"), { recursive: true });
  writeFileSync(join(clone, "packages", "builtin", "spex.yaml"), "format: 1\n");
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
  assert.equal(entry("link").kind, "file");
  assert.equal(entry("link").preview, "none");
  assert.equal(entry("big.log").preview, "text");
  assert.ok(root.entries.findIndex((e) => e.kind !== "dir" && e.kind !== "git") > root.entries.findIndex((e) => e.kind === "dir"), "directories first");
  await home.client.expectError("space.tree", { repository: key, path: "link" }, "invalid_request", /symbolic link/);
  await home.client.expectError("space.tree", { repository: key, path: "link/README.md" }, "invalid_request", /symbolic link/);
  await home.client.expectError("space.tree", { repository: key, path: "../" }, "invalid_request", /escapes/);
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
  const records = sessions.entries.find((e) => e.name === `${sessionId}.records.jsonl`);
  assert.equal(records?.family, "session records");
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
  const stream = await home.client.expectOk("space.read", { repository: key, path: `sessions/${sessionId}.records.jsonl` });
  assert.ok(stream.kind === "text" && stream.lines >= 2 && stream.text.split("\n")[0].startsWith("{"));
  const cut = await home.client.expectOk("space.read", { repository: key, path: "big.log" });
  assert.ok(cut.kind === "text" && cut.truncated && cut.lines <= 2_000 && cut.text.endsWith("\n") && Buffer.byteLength(cut.text) <= 256 * 1024);
  assert.ok(cut.kind === "text" && cut.text.split("\n").every((line) => line === "" || /^line \d{6} x{80}$/.test(line)), "cut on a complete line");
  assert.deepEqual(await home.client.expectOk("space.read", { repository: key, path: `sessions/${sessionId}.hints.json` }), { kind: "withheld", reason: "May hold provider tokens — not shown" });
  await home.client.expectError("space.read", { repository: key, path: "../etc/passwd" }, "invalid_request", /escapes/);
  await home.client.expectError("space.read", { repository: key, path: ".git/HEAD" }, "invalid_request", /Git data/);
  await home.client.expectError("space.read", { repository: key, path: "sessions" }, "invalid_request", /not a file/);
  await home.client.expectError("space.read", { repository: key, path: "link" }, "invalid_request", /symbolic link/);
  await home.client.expectError("space.read", { repository: key, path: "absent.txt" }, "not_found");
});

// ---------------------------------------------------------------------------
// space-51: a clone no folder pairs, and the repair the reader answers
// ---------------------------------------------------------------------------

test("space-51: a clone no folder pairs folds to one repair the reader answers, and a rebind with its recorded folder as an alias resolves it", async (t) => {
  const first = await startHome("repairs");
  const { key } = await addFolder(first, first.projectDir);
  const sessionId = await runTurn(first, key, "Work before the move");
  await first.stop();
  // The folder's pair is forgotten on this device; its clone stays.
  const unpaired = Home.load(first.dataDir); unpaired.unpair(key); unpaired.save();
  const home = await startHome("repairs-again", { dataDir: first.dataDir, project: false });
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
  assert.ok(!(await home.client.expectOk("session.list", {})).some((s) => s.id === sessionId), "unlisted until paired");
  // Only the reader's act settles a repair, and it is this device's alone.
  const before = await home.client.expectOk("space.get", {});
  assert.equal(before.issues, before.diagnostics.length, "an unanswered repair counts");
  const status = git(clonePath(home.dataDir, key), "status", "--porcelain");
  const declined = await home.client.expectOk("space.repair.decline", { repair: repair.repair!.key, declined: true });
  assert.notEqual(declined.diagnostics.find((d) => d.repair?.repository === key)?.repair?.declined, undefined);
  assert.equal(declined.issues, before.issues - 1, "a repair not added counts no more");
  assert.equal(typeof prefsOf(home.dataDir)[`space:repair:${repair.repair!.key}`], "object", "the answer is a preference");
  assert.equal(git(clonePath(home.dataDir, key), "status", "--porcelain"), status, "and never a tracked file");
  const restored = await home.client.expectOk("space.repair.decline", { repair: repair.repair!.key, declined: false });
  assert.equal(restored.issues, before.issues, "brought back, it counts again");
  await home.client.expectError("space.repair.decline", { repair: "no-such-repair", declined: true }, "invalid_request");
  // A rebind to a chosen folder carrying the recorded one as an alias
  // pairs the spex repository; every session recorded there lists again.
  const checkout = gitFolder("repairs-checkout");
  const bound = await home.client.expectOk("project.rebind", { projectId: key, path: checkout, aliases: [first.projectDir] });
  assert.equal(bound.id, key);
  assert.equal(bound.path, checkout);
  const after = await home.client.expectOk("space.get", {});
  assert.ok(!after.diagnostics.some((d) => d.repair?.repository === key), "one rebind resolves the repair");
  assert.equal(repositoryOf(after, key).folder, checkout);
  const listed = (await home.client.expectOk("session.list", {})).find((s) => s.id === sessionId);
  assert.equal(listed?.title, "Work before the move");
  assert.equal(listed?.projectId, key);
  const history = await home.client.expectOk("history.get", { sessionId });
  assert.ok(history.records.some((r) => r.record.type === "turn_started"));
});

// ---------------------------------------------------------------------------
// space-37, space-38, space-52 against the stand-in Git host (git-host-12)
// ---------------------------------------------------------------------------

/** The stand-in's person, and your own group's repository once signed in. */
const LOGIN = "ada";
const HOST_OWN = `${LOGIN}/${LOGIN}-spex`;
const HOST_NAME = "Stand-in Git host";

/** The stand-in's bare repository holding a key's records. */
function bareOf(host: StandinHost, key: string): string {
  const parts = key.split("/");
  return join(host.dir, ...parts.slice(0, -1), `${parts[parts.length - 1]}.git`);
}

/** A project's code: a Git working folder with one commit. */
function codeRepository(name: string): string {
  const dir = gitFolder(name);
  writeFileSync(join(dir, "README.md"), `# ${name}\n`);
  git(dir, "add", "README.md");
  git(dir, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "code");
  return dir;
}

test("space-37: the browser sign-in renames your own group after the login, pushes its spex repository, and writes the account", async (t) => {
  const host = await startHost();
  const home = await startHome("signin-browser", { host, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const { key } = await addFolder(home, home.projectDir);
  const before = await home.client.expectOk("space.get", {});
  assert.equal(before.account, null);
  assert.deepEqual(before.groups.map((group) => group.fullPath), [OWN]);
  assert.equal(repositoryOf(before, key).state, "local-only");
  await home.client.expectError("space.refresh", {}, "invalid_request", /Sign in first/);
  // The browser flow's URL names the loopback, an S256 challenge and the
  // public client (git-host-2).
  const from = home.client.mark();
  const started = await home.client.expectOk("space.signin.start", {});
  assert.equal(started.flow, "browser");
  const url = new URL(started.flow === "browser" ? started.url : "");
  assert.equal(`${url.origin}${url.pathname}`, `${host.url}/login/app`);
  assert.equal(url.searchParams.get("client_id"), "spex");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.match(url.searchParams.get("redirect_uri") ?? "", /^http:\/\/127\.0\.0\.1:\d+\/callback$/);
  const running = await home.client.waitSpace(from, (state) => state.signIn.phase === "running");
  assert.ok(running.signIn.phase === "running" && running.signIn.flow === "browser");
  await home.client.expectError("space.signin.start", {}, "busy");
  const redirect = await fetch(url, { redirect: "manual" });
  const page = await (await fetch(redirect.headers.get("location") ?? "")).text();
  assert.match(page, /You may close this browser window/);
  const signed = await home.client.waitSpace(from, (state) => state.account !== null && state.signIn.phase === "idle", 30_000);
  assert.deepEqual(signed.account, { id: "1001", login: LOGIN, displayName: "Ada Lovelace" });
  assert.equal(signed.host.displayName, HOST_NAME);
  assert.equal(typeof signed.readAt, "number");
  assert.deepEqual(signed.groups.map((group) => [group.fullPath, group.own]), [[LOGIN, true], ["acme", false], ["acme/research", false]]);
  assert.equal(signed.groups[0].id, "2001");
  // Your own group's folder and every clone in it bear the login, and
  // every pair naming one is rewritten (space-59, storage-2).
  const moved = `${LOGIN}/${basename(home.projectDir)}-spex`;
  assert.equal(repositoryOf(signed, moved).state, "local-only");
  assert.equal(repositoryOf(signed, moved).folder, home.projectDir);
  assert.ok(!existsSync(join(home.dataDir, "workspace", OWN)), "the former folder left with its clones");
  const file = Home.load(home.dataDir).file;
  assert.deepEqual(file.host.account, { id: "1001", login: LOGIN, displayName: "Ada Lovelace" });
  assert.equal(file.host.signedOut, undefined);
  assert.equal(file.own, LOGIN);
  assert.deepEqual(file.folders.map((folder) => [folder.path, folder.repository]), [[home.projectDir, moved]]);
  // The app token, owner-only (storage-19).
  assert.equal(statSync(join(home.dataDir, "local", "credentials.yaml")).mode & 0o777, 0o600);
  // Your own group's spex repository stands on the stand-in, pushed
  // beside its default branch (space-4, space-65, git-host-7).
  const own = await home.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done");
  const clone = clonePath(home.dataDir, HOST_OWN);
  assert.equal(own.state, "reachable");
  assert.equal(git(bareOf(host, HOST_OWN), "rev-parse", "spex"), git(clone, "rev-parse", "spex"));
  assert.equal(git(bareOf(host, HOST_OWN), "symbolic-ref", "HEAD"), "refs/heads/main");
  assert.equal(git(clone, "config", "--get", "spex.repositoryId"), own.id);
  assert.ok(own.remote?.startsWith(`${host.gitOrigin}/${LOGIN}/`) && !own.remote.includes("@"), own.remote ?? "");
  assert.equal((await home.client.expectOk("config.get", {})).status, "valid", "your own group's config moved with it");
  // A core restarted on the home reads the same account and last sync,
  // no read time, and the host it recorded whatever SPEX_HOST_URL says
  // (space-1, git-host-1).
  await home.stop();
  const again = await startHome("signin-browser-again", { dataDir: home.dataDir, project: false, env: { SPEX_HOST_URL: "http://127.0.0.1:9" } });
  t.after(() => again.stop());
  const reread = await again.client.expectOk("space.get", {});
  assert.deepEqual(reread.account, signed.account);
  assert.equal(reread.readAt, null);
  assert.equal(reread.host.url, host.url);
  assert.deepEqual(repositoryOf(reread, HOST_OWN).lastSync, own.lastSync);
});

test("space-37: the device sign-in links the stand-in's code, names the host, and completes on approval; a denied code ends failed", async (t) => {
  const host = await startHost();
  const home = await startHome("signin-device", { host, project: false });
  t.after(() => home.stop());
  // A start whose description fails still starts, the host's display
  // name unknown (git-host-15); a cancel stops the polling and ends the
  // flow with nothing stored.
  host.script.describeUnavailable = true;
  const fromCancel = home.client.mark();
  const canceled = await home.client.expectOk("space.signin.start", {});
  assert.equal(canceled.flow, "device");
  assert.equal((await home.client.expectOk("space.get", {})).host.displayName, null);
  assert.deepEqual(await home.client.expectOk("space.signin.cancel", {}), { stopped: true });
  await home.client.waitSpace(fromCancel, (state) => state.signIn.phase === "idle" && state.account === null);
  assert.deepEqual(await home.client.expectOk("space.signin.cancel", {}), { stopped: false });
  host.script.describeUnavailable = false;
  const from = home.client.mark();
  const denied = await home.client.expectOk("space.signin.start", {});
  assert.ok(denied.flow === "device", JSON.stringify(denied));
  assert.ok(host.script.pendingDevices().includes(denied.userCode));
  // The verification URL carries the code, so nobody types it
  // (git-host-3, space-29); the host's display name is read before the
  // reply (git-host-15).
  assert.equal(denied.verificationUri, `${host.url}/login/device?user_code=${encodeURIComponent(denied.userCode)}`);
  assert.ok(denied.expiresAt > Date.now());
  assert.equal((await home.client.expectOk("space.get", {})).host.displayName, "Stand-in Git host");
  const running = await home.client.waitSpace(from, (state) => state.signIn.phase === "running");
  assert.ok(running.signIn.phase === "running" && running.signIn.flow === "device" && running.signIn.userCode === denied.userCode);
  assert.equal(running.signIn.verificationUri, denied.verificationUri);
  host.script.denyDevice(denied.userCode);
  const failed = await home.client.waitSpace(from, (state) => state.signIn.phase === "failed");
  assert.ok(failed.signIn.phase === "failed" && failed.signIn.cause === "denied", JSON.stringify(failed.signIn));
  assert.equal(failed.account, null);
  assert.ok(!existsSync(join(home.dataDir, "local", "credentials.yaml")), "nothing is stored");
  const signed = await signIn(home, host);
  assert.equal(signed.account?.login, LOGIN);
  const own = await home.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done");
  assert.equal(own.state, "reachable");
  assert.ok(host.script.repositories.some((repository) => repository.id === own.id && repository.path === `${LOGIN}-spex`));
});

/** A `git` on the core's PATH that holds one clone's `rev-parse
 * --git-dir` — the read a Groups state makes of it — while the test
 * holds it, then runs the real Git: a read caught in flight. */
function holdingGit(clone: string): { path: string; hold(): void; held(): Promise<void>; release(): void } {
  const dir = mkdtempSync(join(scratch, "holding-git-"));
  const real = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
  const hold = join(dir, "hold");
  const held = join(dir, "held");
  writeFileSync(join(dir, "git"), [
    "#!/bin/sh",
    'case " $* " in',
    `  *" ${clone} rev-parse --git-dir "*)`,
    `    if [ -e "${hold}" ]; then : > "${held}"; while [ -e "${hold}" ]; do sleep 0.05; done; fi ;;`,
    "esac",
    `exec "${real}" "$@"`,
    "",
  ].join("\n"));
  chmodSync(join(dir, "git"), 0o755);
  return {
    path: `${dir}:${process.env.PATH ?? ""}`,
    hold: () => writeFileSync(hold, ""),
    held: async () => {
      for (let i = 0; i < 400 && !existsSync(held); i += 1) await sleep(25);
      assert.ok(existsSync(held), "the read reached Git");
    },
    release: () => rmSync(hold, { force: true }),
  };
}

test("space-59: a sign-in while a read of your own group is in flight moves the folder once the read ends, then pushes it", async (t) => {
  const host = await startHost();
  const dataDir = mkdtempSync(join(scratch, "signin-reading-"));
  const shim = holdingGit(ownClone(dataDir));
  const home = await startHome("signin-reading", { host, dataDir, env: { PATH: shim.path } });
  t.after(() => { shim.release(); return home.stop(); });
  const added = home.client.mark();
  const { key } = await addFolder(home, home.projectDir);
  // The announcement of the new folder has read every clone.
  await home.client.waitSpace(added, (state) => state.groups.some((group) => group.repositories.some((repository) => repository.key === key)));
  await sleep(200);

  // A Groups read stands inside Git on your own group's clone.
  shim.hold();
  const reading = home.client.command("space.get", {});
  await shim.held();

  // The account arrives meanwhile; the set-up's rename waits for the
  // read, the gate held for every clone beneath (space-59, space-21).
  const from = home.client.mark();
  const started = await home.client.expectOk("space.signin.start", {});
  assert.ok(started.flow === "device", JSON.stringify(started));
  host.script.approveDevice(started.userCode);
  for (let i = 0; i < 400 && Home.load(dataDir).file.host.account === undefined; i += 1) await sleep(25);
  assert.equal(Home.load(dataDir).file.host.account?.login, LOGIN);
  await sleep(400);
  assert.ok(existsSync(ownClone(dataDir)), "the folder stays while the read is in flight");
  const refused = await home.client.command("intent.queue", { projectId: key, text: "written mid-move" });
  assert.ok(!refused.ok && refused.error.code === "busy", JSON.stringify(refused));

  // The read ends where the clone lay; the folder then moves, and your
  // own group's spex repository is created and pushed.
  shim.release();
  const read = await reading;
  assert.ok(read.ok, JSON.stringify(read));
  assert.ok(read.result.groups.some((group) => group.repositories.some((repository) => repository.key === OWN_KEY)));
  const signed = await home.client.waitSpace(from, (state) => state.account !== null && state.signIn.phase === "idle", 30_000);
  assert.equal(signed.account?.login, LOGIN);
  assert.ok(!existsSync(join(dataDir, "workspace", OWN)), "the former folder left with its clones");
  assert.equal(repositoryOf(signed, `${LOGIN}/${basename(home.projectDir)}-spex`).folder, home.projectDir);
  const own = await home.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  assert.equal(own.state, "reachable");
  assert.equal(git(bareOf(host, HOST_OWN), "rev-parse", "spex"), git(clonePath(dataDir, HOST_OWN), "rev-parse", "spex"));
  // A read after the move finds every clone where it lies.
  const after = await home.client.expectOk("space.get", {});
  assert.deepEqual(after.groups.flatMap((group) => group.repositories.map((repository) => repository.key)).filter((repoKey) => repoKey.startsWith(`${OWN}/`)), []);
});

test("space-37: Pick a group creates <name>-spex there and pushes; a taken name is refused; a refused creation waits until a Refresh finds it", async (t) => {
  const host = await startHost();
  const home = await startHome("pick", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const alpha = gitFolder("alpha");
  const first = await addFolder(home, alpha);
  await home.client.expectError("space.pick", { repository: first.key, choice: { kind: "create", groupId: "2002", name: "alpha" } }, "invalid_request", /Sign in first/);
  const signed = await signIn(home, host);
  const local = `${LOGIN}/alpha-spex`;
  const row = repositoryOf(signed, local);
  assert.equal(row.state, "local-only");
  const sessionId = await runTurn(home, local, "Shared with Acme");
  // A group picked: `<name>-spex` created there, the clone following it
  // under `workspace/acme/`, its `spex` pushed (space-58, space-60).
  const from = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", groupId: "2002", name: "alpha" } }), { accepted: true });
  const created = await home.client.waitRepository(from, "acme/alpha-spex", (repository) => repository.sync.phase === "done");
  assert.equal(created.state, "reachable");
  assert.ok(created.lastSync && created.lastSync.sent > 0, JSON.stringify(created.lastSync));
  assert.equal(created.folder, alpha);
  const clone = clonePath(home.dataDir, "acme/alpha-spex");
  assert.ok(existsSync(clone) && !existsSync(clonePath(home.dataDir, local)));
  assert.equal(git(bareOf(host, "acme/alpha-spex"), "rev-parse", "spex"), git(clone, "rev-parse", "spex"));
  assert.ok(git(bareOf(host, "acme/alpha-spex"), "ls-tree", "-r", "--name-only", "spex").split("\n").includes(`sessions/${sessionId}.json`));
  assert.equal(Home.load(home.dataDir).keyForFolder(alpha), "acme/alpha-spex");
  // The account commits, at the host's no-reply address (space-32).
  assert.equal(git(clone, "log", "-1", "--format=%an <%ae>"), "Ada Lovelace <ada@users.noreply.127.0.0.1>");
  // The host's own URLs are its to hand over (space-5).
  await home.client.expectError("space.remote.set", { repository: "acme/alpha-spex", url: `${host.gitOrigin}/acme/other-spex.git` }, "invalid_request", /used as the host gives them/);
  // A name the host reports taken is refused in place (space-58).
  host.script.addRepository({ group: "acme", name: "beta-spex" });
  const fromBeta = home.client.mark();
  const beta = await addFolder(home, gitFolder("beta"));
  // A project added is announced, so the surface re-reads (space-2).
  await home.client.waitRepository(fromBeta, beta.key, (repository) => repository.state === "local-only");
  await home.client.expectError("space.pick", { repository: beta.key, choice: { kind: "create", groupId: "2002", name: "beta" } }, "invalid_request", /beta-spex is taken in acme/);
  await home.client.expectError("space.pick", { repository: beta.key, choice: { kind: "create", groupId: "2002", name: "--" } }, "invalid_request", /letter or a digit/);
  assert.equal((await home.client.repository(beta.key)).state, "local-only");
  // A creation the host leaves waiting stands on the row with its words,
  // and the next read after it grants finds it done (space-64).
  const words = "You need the Maintainer role in Research to create projects.";
  host.script.refuseCreate(words);
  const gamma = await addFolder(home, gitFolder("gamma"));
  const fromGamma = home.client.mark();
  await home.client.expectOk("space.pick", { repository: gamma.key, choice: { kind: "create", groupId: "2003", name: "gamma" } });
  const waiting = await home.client.waitRepository(fromGamma, gamma.key, (repository) => repository.waiting !== null);
  assert.deepEqual(waiting.waiting, { step: "create", group: "acme/research", message: words });
  assert.equal(waiting.state, "local-only");
  host.script.refuseCreate(null);
  assert.deepEqual(await home.client.expectOk("space.refresh", {}), { accepted: true });
  const found = await home.client.waitRepository(fromGamma, "acme/research/gamma-spex", (repository) => repository.sync.phase === "done");
  assert.equal(found.waiting, null);
  assert.equal(found.state, "reachable");
});

test("space-65: a working folder paired with a group's own spex repository brings it to that group on the host, pushed", async (t) => {
  const host = await startHost();
  const first = await startHome("group-first", { host, project: false, extra: { signIn: "browser" } });
  const from = first.client.mark();
  await signIn(first, host);
  await first.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done");
  await first.stop();
  // A group's own clone on this device, on no host yet.
  const key = "acme/acme-spex";
  const clone = clonePath(first.dataDir, key);
  mkdirSync(clone, { recursive: true });
  git(clone, "init", "-q", "-b", "spex");
  git(clone, "-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", "Start");
  const home = await startHome("group-first-again", { dataDir: first.dataDir, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const folder = gitFolder("acme-work");
  await home.client.expectOk("project.rebind", { projectId: key, path: folder });
  const fromRegister = home.client.mark();
  assert.equal((await home.client.expectOk("project.register", { path: folder })).id, key);
  const pushed = await home.client.waitRepository(fromRegister, key, (repository) => repository.sync.phase === "done");
  assert.equal(pushed.state, "reachable");
  assert.equal(git(bareOf(host, key), "rev-parse", "spex"), git(clone, "rev-parse", "spex"));
  assert.equal(host.script.repositories.find((repository) => repository.id === pushed.id)?.description, "Spex records of the group acme");
  // Asked again at a later session, a repository on the host is left be.
  assert.equal(await home.service.ensureGroupRepository(key), "unchanged");
});

test("space-37: a join pick and the first sync into a repository with other members wait for the notice; space.join clones it with its code; members read live", async (t) => {
  const host = await startHost();
  const code = codeRepository("team");
  const bob = { id: "1002", login: "bob", displayName: "Bob", role: "Developer" };
  const team = host.script.addRepository({ group: "acme", name: "team-spex", project: { format: 1, name: "team", remote: code }, members: [bob], visibility: "internal" });
  const pal = host.script.addRepository({ group: "acme", name: "pal-spex", members: [bob] });
  const home = await startHome("notice", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const signed = await signIn(home, host);
  const absent = repositoryOf(signed, "acme/team-spex");
  assert.deepEqual([absent.state, absent.id, absent.code, absent.members, absent.visibility, absent.folder], ["absent", team.id, code, 2, "internal", null]);
  // Members, as the host names them, read on each ask (space-62).
  const members = await home.client.expectOk("space.members", { repository: "acme/team-spex" });
  assert.deepEqual(members.members.map((member) => [member.login, member.role]), [[LOGIN, "Owner"], ["bob", "Developer"]]);
  assert.match(members.membersUrl, /\/acme\/team-spex\/-\/project_members$/);
  await home.client.expectError("space.members", { repository: "acme/nowhere-spex" }, "not_found");
  // Join: the spex repository under workspace/acme/, the code into the
  // folder named, the two paired (space-63).
  const folder = join(mkdtempSync(join(scratch, "team-")), "team");
  const from = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.join", { hostId: team.id, folder }), { accepted: true });
  const joined = await home.client.waitRepository(from, "acme/team-spex", (repository) => repository.state !== "absent" && repository.folder !== null && repository.sync.phase === "idle");
  assert.equal(joined.state, "reachable");
  assert.equal(joined.id, team.id);
  assert.ok(existsSync(join(folder, "README.md")), "the code is cloned");
  assert.equal(git(folder, "remote", "get-url", "origin"), code);
  assert.equal(git(clonePath(home.dataDir, "acme/team-spex"), "symbolic-ref", "--short", "HEAD"), "spex");
  await home.client.expectError("space.join", { hostId: team.id }, "invalid_request", /on this device already/);
  // Its first sync waits for the notice, then pushes and records both
  // (space-57, space-12, space-22).
  await runTurn(home, "acme/team-spex", "For the team");
  await home.client.expectError("space.sync", { repository: "acme/team-spex" }, "invalid_request", /sharing notice/);
  const done = await home.client.settle("space.sync", { repository: "acme/team-spex", noticed: true });
  assert.ok(done.sync.phase === "done" && done.sync.pushed, JSON.stringify(done.sync));
  assert.equal(done.noticed, true);
  const prefs = prefsOf(home.dataDir);
  assert.equal(prefs["sync:acme/team-spex:noticed"], true);
  assert.deepEqual(prefs["sync:acme/team-spex:last"], done.lastSync);
  assert.equal(git(bareOf(host, "acme/team-spex"), "rev-parse", "spex"), git(clonePath(home.dataDir, "acme/team-spex"), "rev-parse", "spex"));
  // A pick joining a repository with other members waits for it too.
  const mine = await addFolder(home, gitFolder("pal"));
  await home.client.expectError("space.pick", { repository: mine.key, choice: { kind: "join", hostId: pal.id } }, "invalid_request", /sharing notice/);
  const fromPal = home.client.mark();
  await home.client.expectOk("space.pick", { repository: mine.key, choice: { kind: "join", hostId: pal.id }, noticed: true });
  const palJoined = await home.client.waitRepository(fromPal, "acme/pal-spex", (repository) => repository.sync.phase === "done");
  assert.equal(palJoined.state, "reachable");
  assert.equal(prefsOf(home.dataDir)["sync:acme/pal-spex:noticed"], true);
});

test("space-37: Sign out revokes this device and keeps every clone, its repositories unreachable until the next sign-in", async (t) => {
  const host = await startHost();
  const home = await startHome("signout", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const from = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done");
  assert.equal(host.script.liveDevices(), 1);
  const out = await home.client.expectOk("space.signout", {});
  assert.equal(out.account, null);
  assert.equal(out.readAt, null);
  assert.deepEqual(out.groups.map((group) => group.fullPath), [LOGIN]);
  assert.equal(host.script.liveDevices(), 0, "revoked at the stand-in");
  assert.ok(!existsSync(join(home.dataDir, "local", "credentials.yaml")), "the credential is gone");
  const file = Home.load(home.dataDir).file;
  assert.equal(file.host.signedOut, true);
  assert.equal(file.host.account?.login, LOGIN, "the account is kept");
  const own = repositoryOf(out, HOST_OWN);
  assert.deepEqual([own.state, own.reason], ["unreachable", "Sign in again"]);
  assert.ok(existsSync(join(clonePath(home.dataDir, HOST_OWN), ".git")), "nothing is deleted");
  await home.client.expectError("space.sync", { repository: HOST_OWN }, "invalid_request", /Sign in first/);
  await home.client.expectError("space.refresh", {}, "invalid_request", /Sign in first/);
  const fromAgain = home.client.mark();
  await signIn(home, host);
  const back = await home.client.waitRepository(fromAgain, HOST_OWN, (repository) => repository.state === "reachable");
  assert.equal(back.reason, null);
  assert.equal(Home.load(home.dataDir).file.host.signedOut, undefined);
});

test("space-37: while a check sleeps on the stand-in's transport, writes beneath that clone are refused naming the sync, another's admitted, and Stop ends it", async (t) => {
  const host = await startHost();
  const home = await startHome("host-gate", { host, project: false, extra: { signIn: "browser", spaceTransportTimeoutMs: 60_000 } });
  t.after(() => home.stop());
  const elsewhere = gitFolder("elsewhere");
  await addFolder(home, elsewhere);
  const gated = gitFolder("gated");
  await addFolder(home, gated);
  await signIn(home, host);
  const from = home.client.mark();
  await home.client.expectOk("space.pick", { repository: `${LOGIN}/gated-spex`, choice: { kind: "create", groupId: "2002", name: "gated" } });
  const key = "acme/gated-spex";
  await home.client.waitRepository(from, key, (repository) => repository.sync.phase === "done");
  const clone = clonePath(home.dataDir, key);
  await home.client.expectOk("intent.queue", { projectId: key, text: "Saved by the sync" });
  const head = git(clone, "rev-parse", "HEAD");
  host.script.sleepTransport(30_000);
  t.after(() => host.script.sleepTransport(0));
  const requests = host.script.requests.length;
  const fromSync = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.sync", { repository: key }), { accepted: true });
  // The Check step reads the host first, offering no Stop; Stop comes
  // once its Git child runs (space-16).
  const entered = await home.client.waitRepository(fromSync, key, (repository) => repository.sync.phase === "running" && repository.sync.step === "check");
  assert.ok(entered.sync.phase === "running" && !entered.sync.cancelable, JSON.stringify(entered.sync));
  await home.client.waitRepository(fromSync, key, (repository) => repository.sync.phase === "running" && repository.sync.step === "check" && repository.sync.cancelable);
  for (let i = 0; i < 400 && !host.script.requests.slice(requests).some((request) => request.path.startsWith("/git/")); i += 1) await sleep(25);
  assert.ok(host.script.requests.slice(requests).some((request) => request.path.startsWith("/git/")), "the transport is in flight");
  const blocked = await home.client.command("intent.queue", { projectId: key, text: "blocked" });
  assert.ok(!blocked.ok && blocked.error.code === "busy" && /gated-spex is syncing/.test(blocked.error.message), JSON.stringify(blocked));
  await home.client.expectError("space.sync", { repository: key }, "busy", /Already syncing/);
  await home.client.expectOk("intent.queue", { projectId: `${LOGIN}/elsewhere-spex`, text: "elsewhere" });
  assert.deepEqual(await home.client.expectOk("space.cancel", { repository: key }), { stopped: true });
  const stopped = await home.client.waitRepository(fromSync, key, (repository) => repository.sync.phase === "stopped");
  assert.ok(stopped.sync.phase === "stopped" && stopped.sync.step === "check" && stopped.sync.cause === "stopped", JSON.stringify(stopped.sync));
  assert.notEqual(git(clone, "rev-parse", "HEAD"), head, "the Save commit stands");
  await home.client.expectOk("intent.queue", { projectId: key, text: "after the stop" });
});

test("space-38: a second home joins a project from the stand-in with its code; a rename moves both clones; an archive turns it read-only; a removed membership unreachable", async (t) => {
  const host = await startHost();
  const code = codeRepository("shared");
  const a = await startHome("host-a", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => a.stop());
  const folderA = join(mkdtempSync(join(scratch, "a-code-")), "shared");
  git(scratch, "clone", "-q", code, folderA);
  await signIn(a, host);
  const local = await addFolder(a, folderA);
  assert.equal(local.key, `${LOGIN}/shared-spex`);
  assert.equal(JSON.parse(readFileSync(join(local.clone, "project.json"), "utf8")).remote, code);
  const sessionA = await runTurn(a, local.key, "From home A");
  const fromA = a.client.mark();
  await a.client.expectOk("space.pick", { repository: local.key, choice: { kind: "create", groupId: "2002", name: "shared" } });
  const key = "acme/shared-spex";
  const pushed = await a.client.waitRepository(fromA, key, (repository) => repository.sync.phase === "done");
  const id = pushed.id ?? "";
  // The second home: your own group's repository joins the first's, and
  // the project lists as not on this device.
  const b = await startHome("host-b", { host, project: false, model: "claude-test", extra: { signIn: "browser" } });
  t.after(() => b.stop());
  const fromB = b.client.mark();
  await signIn(b, host);
  const ownB = await b.client.waitRepository(fromB, HOST_OWN, (repository) => repository.sync.phase !== "running" && repository.sync.phase !== "idle");
  assert.equal(ownB.sync.phase, "done", JSON.stringify(ownB.sync));
  const absent = repositoryOf(await b.client.expectOk("space.get", {}), key);
  assert.deepEqual([absent.state, absent.id, absent.code], ["absent", id, code]);
  // Join: the spex repository and the code, paired, the first home's
  // session served with its history (space-63, space-20).
  const folderB = join(mkdtempSync(join(scratch, "b-code-")), "shared");
  await b.client.expectOk("space.join", { hostId: id, folder: folderB });
  const joined = await b.client.waitRepository(fromB, key, (repository) => repository.state === "reachable" && repository.folder === folderB && repository.sync.phase === "idle");
  assert.equal(joined.code, code);
  assert.ok(existsSync(join(folderB, "README.md")));
  assert.ok((await b.client.expectOk("session.list", {})).some((session) => session.id === sessionA && session.projectId === key));
  const history = await b.client.expectOk("history.get", { sessionId: sessionA });
  assert.ok(history.records.some((entry) => entry.record.type === "turn_started"));
  // A rename on the host moves the clone on its next sync, its pair and
  // key following, on both homes (space-60).
  host.script.rename(id, { name: "renamed-spex" });
  const renamed = "acme/renamed-spex";
  const fromRename = b.client.mark();
  await b.client.expectOk("space.sync", { repository: key });
  const moved = await b.client.waitRepository(fromRename, renamed, (repository) => repository.sync.phase !== "running");
  assert.equal(moved.sync.phase, "done", JSON.stringify(moved.sync));
  assert.ok(existsSync(clonePath(b.dataDir, renamed)) && !existsSync(clonePath(b.dataDir, key)));
  assert.equal(Home.load(b.dataDir).keyForFolder(folderB), renamed);
  assert.equal(git(clonePath(b.dataDir, renamed), "remote", "get-url", "origin"), `${host.gitOrigin}/acme/renamed-spex.git`);
  assert.ok((await b.client.expectOk("session.list", {})).some((session) => session.id === sessionA && session.projectId === renamed));
  const sessionA2 = await runTurn(a, key, "Second from A");
  const fromA2 = a.client.mark();
  await a.client.expectOk("space.sync", { repository: key });
  const movedA = await a.client.waitRepository(fromA2, renamed, (repository) => repository.sync.phase !== "running");
  assert.equal(movedA.sync.phase, "done", JSON.stringify(movedA.sync));
  assert.equal(Home.load(a.dataDir).keyForFolder(folderA), renamed);
  // Archived: read-only with the host's reason; a sync brings the peer's
  // session and sends nothing, this home's new session kept here.
  host.script.archive(id);
  const sessionB = await runTurn(b, renamed, "Kept on B");
  const fromArchive = b.client.mark();
  await b.client.expectOk("space.refresh", {});
  const readOnly = await b.client.waitRepository(fromArchive, renamed, (repository) => repository.state === "read-only");
  assert.equal(readOnly.reason, "This project is archived and its repository is read-only.");
  const bareHead = git(bareOf(host, renamed), "rev-parse", "spex");
  const brought = await b.client.settle("space.sync", { repository: renamed });
  assert.ok(brought.sync.phase === "done" && !brought.sync.pushed && brought.sync.sent === 0 && brought.sync.received > 0, JSON.stringify(brought.sync));
  assert.equal(git(bareOf(host, renamed), "rev-parse", "spex"), bareHead, "nothing was sent");
  assert.ok((await b.client.expectOk("session.list", {})).some((session) => session.id === sessionA2));
  assert.ok(brought.local.some((unit) => unit.sessionId === sessionB), "this home's session stays here, listed to send");
  // The membership removed: unreachable on the next read, the clone whole.
  host.script.removeMember(id);
  const fromGone = b.client.mark();
  await b.client.expectOk("space.refresh", {});
  const gone = await b.client.waitRepository(fromGone, renamed, (repository) => repository.state === "unreachable");
  assert.equal(gone.reason, "No longer shared with you");
  assert.ok(existsSync(join(clonePath(b.dataDir, renamed), "sessions", `${sessionB}.json`)), "nothing on the device is deleted");
});

test("space-38, space-52: the stand-in's 401 stops reauth, its refusal names only its words, a sleeping transport stops timeout; a credentialed origin is refused", async (t) => {
  const host = await startHost();
  const home = await startHome("host-failures", { host, project: false, extra: { signIn: "browser", spaceTransportTimeoutMs: 4_000 } });
  t.after(() => home.stop());
  // A folder whose origin carries a credential is refused before its
  // project.json is written (space-5).
  const leaky = gitFolder("leaky");
  git(leaky, "remote", "add", "origin", "https://user:token@example.com/leaky.git");
  await home.client.expectError("project.register", { path: leaky }, "invalid_request", /stores no credential/);
  assert.ok(!existsSync(clonePath(home.dataDir, `${OWN}/leaky-spex`)));
  const from = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done");
  // A transport the host answers 401 asks for a sign-in (space-15).
  host.script.unauthorizeTransport(true);
  const reauth = await home.client.settle("space.fetch", { repository: HOST_OWN });
  assert.ok(reauth.sync.phase === "stopped" && reauth.sync.cause === "reauth" && reauth.sync.message === "Sign in again", JSON.stringify(reauth.sync));
  assert.match(reauth.sync.guidance, /Sign in from the header/);
  host.script.unauthorizeTransport(false);
  // A refusal names the host's own words and the members page, claims no
  // role and offers no act the host did not name (space-50).
  const words = "Your account is blocked by GitLab.com: contact support.";
  host.script.refuseTransport(words);
  const refused = await home.client.settle("space.sync", { repository: HOST_OWN });
  assert.ok(refused.sync.phase === "stopped" && refused.sync.cause === "refused", JSON.stringify(refused.sync));
  assert.equal(refused.sync.message, `${HOST_NAME} refused: ${words}`);
  assert.match(refused.sync.guidance, /members page/);
  assert.doesNotMatch(`${refused.sync.message} ${refused.sync.guidance}`, /\b(Owner|Maintainer|Developer|Reporter|Guest|role)\b|SSH key|gh auth|credential helper/);
  assert.deepEqual([refused.state, refused.reason], ["read-only", refused.sync.message]);
  host.script.refuseTransport(null);
  // A transport that sleeps past the limit stops "timeout".
  host.script.sleepTransport(15_000);
  t.after(() => host.script.sleepTransport(0));
  const start = Date.now();
  const slept = await home.client.settle("space.fetch", { repository: HOST_OWN });
  assert.ok(slept.sync.phase === "stopped" && slept.sync.cause === "timeout", JSON.stringify(slept.sync));
  assert.equal(slept.sync.message, `No answer from ${HOST_NAME}`);
  assert.ok(Date.now() - start < 12_000, "the shortened limit ends it");
});

test("git-host-11: a read the stand-in refuses keeps the previous view and its time, phrased in English and in Chinese", async (t) => {
  const host = await startHost();
  const home = await startHome("host-relay", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const from = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done");
  const before = await home.client.expectOk("space.get", {});
  const refresh = async (expected: string): Promise<void> => {
    const mark = home.client.mark();
    await home.client.expectOk("space.refresh", {});
    const row = await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.reason === expected);
    assert.equal(row.state, "unreachable");
    const state = await home.client.expectOk("space.get", {});
    assert.equal(state.readAt, before.readAt, "the previous view keeps its time");
    assert.deepEqual(state.groups.map((group) => group.fullPath), before.groups.map((group) => group.fullPath));
  };
  const words = "Your account is blocked.";
  host.script.refuseHost(1, words);
  await refresh(`${HOST_NAME} refused: ${words}`);
  host.script.rateLimit(1, "30");
  await refresh(`${HOST_NAME} asks to wait; try again after 30`);
  await home.client.expectOk("language.set", { language: "zh" });
  host.script.refuseHost(1, words);
  await refresh(`${HOST_NAME} 拒绝了：${words}`);
  host.script.rateLimit(1, "30");
  await refresh(`${HOST_NAME} 要求稍候；请在 30 之后重试`);
  host.script.unavailable(1);
  await refresh(`无法连接 ${HOST_NAME}`);
  // A read that succeeds again ends the failure.
  const mark = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  const back = await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.state === "reachable");
  assert.equal(back.reason, null);
});
