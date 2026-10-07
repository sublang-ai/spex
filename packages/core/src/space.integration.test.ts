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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { basename, join } from "node:path";
import { createSessionStore } from "@sublang/playbook/session-store";
import { seedHistorySession } from "./testing/demo.js";
import { Home } from "./home.js";
import type { Command } from "./protocol.js";
import { clonePath, createSpaceHarness, OWN, OWN_KEY, ownClone, prefsOf, repositoryOf } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
const { scratch, git, bareRepo, gitFolder, addFolder, sleepingSsh, sleep, sleeperPid, hangingCompileSpawner, COMPILE_INPUT, startHome, runTurn, peerClone, peerPush, turnRecords } = fixture;
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
