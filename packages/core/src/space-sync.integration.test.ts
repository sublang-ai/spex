// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The sync loop of one spex repository over two homes (space-38): real
// cores with substitute agents on scratch homes, two homes syncing one
// spex repository through one bare remote, the repairs a half-applied
// selection leaves for startup, and the transport's stops — in a file
// budget of its own.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createSessionStore } from "@sublang/playbook/session-store";
import { appendHistorySession, seedHistorySession } from "./testing/demo.js";
import { clonePath, createSpaceHarness, OWN_KEY, ownClone, prefsOf } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
const { scratch, git, bareRepo, otherDevice, sameNameFolder, addFolder, sleepingSsh, sleep, joinRemote, startHome, runTurn, peerClone, peerPush, turnRecords } = fixture;
test.after(() => fixture.dispose());

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
  const b = await startHome("intents-b", { project: false, env: otherDevice("intents-b") });
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
  const b = await startHome("b2", { project: false, env: otherDevice("b2") });
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

test("space-38: a marker with a half-written selection is repaired at startup into the recorded commit, and one whose file changed since records none", async (t) => {
  const first = await startHome("repair");
  const { key, clone } = await addFolder(first, first.projectDir);
  await first.stop();
  const dataDir = first.dataDir;
  const cwd = first.projectDir;
  const sessionId = await seedHistorySession(join(clone, "sessions"), cwd, turnRecords("Base turn", 1));
  const whole = await seedHistorySession(join(clone, "sessions"), cwd, turnRecords("Another base turn", 1));
  git(clone, "add", "-A", "--", ".");
  git(clone, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "base");
  const base = git(clone, "rev-parse", "HEAD");
  const remote = bareRepo();
  git(clone, "remote", "add", "origin", remote);
  git(clone, "push", "-q", "-u", "origin", "spex");
  const theirsDir = peerClone(remote);
  await createSessionStore({ sessionsDir: join(theirsDir, "sessions") }).prepare();
  await seedHistorySession(join(theirsDir, "sessions"), cwd, turnRecords("Their second turn", 2), sessionId);
  await seedHistorySession(join(theirsDir, "sessions"), cwd, turnRecords("Their other second turn", 2), whole);
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
  // The interrupted apply: one session landed whole, its hint and viewed
  // marker not yet cleared; the other's replay landed and its manifest did
  // not; the marker stands.
  const marker = join(clone, ".spex-apply.json");
  for (const file of [`${whole}.records.jsonl`, `${whole}.json`]) writeFileSync(join(clone, "sessions", file), readFileSync(join(theirsDir, "sessions", file)));
  writeFileSync(join(clone, "sessions", `${whole}.hints.json`), "{}");
  const prefsFile = join(dataDir, "local", "prefs.json");
  const prefs = existsSync(prefsFile) ? JSON.parse(readFileSync(prefsFile, "utf8")) : { format: 1, prefs: {} };
  writeFileSync(prefsFile, JSON.stringify({ ...prefs, prefs: { ...prefs.prefs, [`viewed:${whole}`]: Date.now() } }));
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
  assert.equal(existsSync(join(clone, "sessions", `${whole}.hints.json`)), false, "the session landed before the crash loses its hint");
  assert.equal(prefsOf(dataDir)[`viewed:${whole}`], undefined, "and its viewed marker");
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
  // A file the interrupted apply would write, changed since by another
  // hand, is left as it stands: the marker goes and no merge commit is recorded.
  await again.stop();
  writeFileSync(join(theirsDir, "other.txt"), "host\n");
  git(theirsDir, "add", "-A", "--", ".");
  git(theirsDir, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "theirs again");
  git(theirsDir, "push", "-q", "origin", "HEAD:spex");
  git(clone, "fetch", "-q", "origin");
  const theirsAgain = git(clone, "rev-parse", "refs/remotes/origin/spex");
  writeFileSync(join(clone, "other.txt"), "mine meanwhile\n");
  writeFileSync(marker, JSON.stringify({ v: 1, ours: head, theirs: theirsAgain, base: theirs, choices: {}, at: Date.now() }));
  const diverged = await startHome("repair-diverged", { dataDir, project: false });
  t.after(() => diverged.stop());
  const left = await diverged.client.expectOk("space.get", {});
  assert.ok(!left.diagnostics.some((d) => d.file.endsWith(".spex-apply.json")), JSON.stringify(left.diagnostics));
  assert.equal(existsSync(marker), false);
  assert.equal(git(clone, "rev-parse", "HEAD"), head, "no merge commit");
  assert.equal(readFileSync(join(clone, "other.txt"), "utf8"), "mine meanwhile\n");
  // The abandoned selection leaves an ordinary local change: the next sync
  // saves it and replans, the file now a choice between both sides.
  const replanned = await diverged.client.settle("space.sync", { repository: key });
  assert.equal(replanned.sync.phase, "choices", JSON.stringify(replanned.sync));
  assert.deepEqual(replanned.conflicts.map((c) => c.unit.unit), ["other.txt"]);
  assert.equal(git(clone, "show", "HEAD:other.txt"), "mine meanwhile");
  // A marker whose merge never landed, with spex moved on since — a commit
  // from a terminal — is obsolete: it goes with nothing written or committed.
  await diverged.stop();
  const movedOn = git(clone, "rev-parse", "HEAD");
  writeFileSync(marker, JSON.stringify({ v: 1, ours: head, theirs: theirsAgain, base: theirs, choices: {}, at: Date.now() }));
  const obsolete = await startHome("repair-obsolete", { dataDir, project: false });
  t.after(() => obsolete.stop());
  const read = await obsolete.client.expectOk("space.get", {});
  assert.ok(!read.diagnostics.some((d) => d.file.endsWith(".spex-apply.json")), JSON.stringify(read.diagnostics));
  assert.equal(existsSync(marker), false);
  assert.equal(git(clone, "rev-parse", "HEAD"), movedOn);
  assert.equal(readFileSync(join(clone, "other.txt"), "utf8"), "mine meanwhile\n");
});

test("space-38: Save commits the tree it validated on the HEAD it staged against; a HEAD moved meanwhile refuses it, and a file written after validation stays local", async (t) => {
  const home = await startHome("save-snapshot");
  t.after(() => home.stop());
  const { key, clone } = await addFolder(home, home.projectDir);
  const bare = bareRepo();
  await home.client.expectOk("space.remote.set", { repository: key, url: bare });
  assert.equal((await home.client.settle("space.sync", { repository: key })).sync.phase, "done");
  // A terminal commit lands while Save validates: the stale tree is not
  // made a child of the new HEAD, and both the commit and the bytes stay.
  writeFileSync(join(clone, "notes.txt"), "first\n");
  let terminal = "";
  home.hooks.beforeStep = ({ step, repository, at }) => {
    if (step !== "save" || at !== "commit" || repository !== key) return;
    home.hooks.beforeStep = undefined;
    terminal = git(clone, "commit-tree", "HEAD^{tree}", "-p", "HEAD", "-m", "from a terminal");
    git(clone, "update-ref", "refs/heads/spex", terminal);
  };
  const stale = await home.client.settle("space.sync", { repository: key });
  assert.ok(stale.sync.phase === "stopped" && stale.sync.step === "save" && stale.sync.retry, JSON.stringify(stale.sync));
  assert.equal(git(clone, "rev-parse", "HEAD"), terminal, "the terminal's commit stands");
  assert.equal(readFileSync(join(clone, "notes.txt"), "utf8"), "first\n");
  assert.throws(() => git(clone, "cat-file", "-e", "HEAD:notes.txt"), "nothing saved over it");
  // A file rewritten after validation stays a local change; the validated bytes are what Save commits.
  home.hooks.beforeStep = ({ step, repository, at }) => {
    if (step !== "save" || at !== "commit" || repository !== key) return;
    home.hooks.beforeStep = undefined;
    writeFileSync(join(clone, "notes.txt"), "late\n");
  };
  const saved = await home.client.settle("space.sync", { repository: key });
  assert.equal(saved.sync.phase, "done", JSON.stringify(saved.sync));
  assert.equal(git(clone, "show", "HEAD:notes.txt"), "first");
  assert.equal(git(clone, "rev-parse", "HEAD~1"), terminal);
  assert.equal(readFileSync(join(clone, "notes.txt"), "utf8"), "late\n");
  assert.match(git(clone, "status", "--porcelain", "--", "notes.txt"), /^ ?M/);
  // A file another process leaves invalid while an incoming change is
  // applied stands as the refresh's finding; it admits the next sync,
  // whose Save names the file, and once the reader repairs it the sync
  // after goes through with the core still running (space-20, space-15).
  await peerPush(peerClone(bare), (dir) => writeFileSync(join(dir, "incoming.txt"), "from the host\n"));
  const stray = join(clone, "intents", `${randomUUID()}.assets`);
  home.hooks.beforeStep = ({ step, repository }) => {
    if (step !== "refresh" || repository !== key) return;
    home.hooks.beforeStep = undefined;
    mkdirSync(stray, { recursive: true });
    writeFileSync(join(stray, "stray.png"), "no intent names this");
  };
  assert.equal((await home.client.settle("space.sync", { repository: key })).sync.phase, "done");
  const finding = (await home.client.expectOk("space.get", {})).diagnostics.find((d) => d.blocking && d.reason.includes("attachments without their intent"));
  assert.ok(finding, "the refresh's finding is reported");
  const named = await home.client.settle("space.sync", { repository: key });
  assert.ok(named.sync.phase === "stopped" && named.sync.step === "save" && /attachments without their intent/.test(named.sync.message), JSON.stringify(named.sync));
  rmSync(stray, { recursive: true, force: true });
  assert.equal((await home.client.settle("space.sync", { repository: key })).sync.phase, "done", "a repaired file admits the sync");
  assert.ok(!(await home.client.expectOk("space.get", {})).diagnostics.some((d) => d.reason.includes("attachments without their intent")));
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
