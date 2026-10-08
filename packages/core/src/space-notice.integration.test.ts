// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The sharing notice against the stand-in Git host (git-host-12): it is
// decided on the host's answer the sync acts on, read by its Check
// step, and only the reader's having seen it lets a sync send into a
// spex repository with other members (space-57, space-12, space-15,
// space-37) — hermetic, on loopback alone, in a file budget of its own.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { clonePath, createSpaceHarness, prefsOf } from "./testing/space-harness.js";
import type { StandinHost, StandinMember } from "./testing/standin-host.js";
import type { RepositoryState } from "./protocol.js";

const fixture = createSpaceHarness();
const { scratch, git, gitFolder, startHome, startHost, signIn, runTurn } = fixture;
test.after(() => fixture.dispose());

/** The stand-in's person, and your own group's repository once signed in. */
const LOGIN = "ada";
const HOST_OWN = `${LOGIN}/${LOGIN}-spex`;
/** A member besides the person. */
const BOB = { id: "1002", login: "bob", displayName: "Bob", role: "Developer" };

/** The stand-in's bare repository holding a key's records. */
function bareOf(host: StandinHost, key: string): string {
  const parts = key.split("/");
  return join(host.dir, ...parts.slice(0, -1), `${parts[parts.length - 1]}.git`);
}

/** Whether the stand-in's `spex` holds a path; false where it has no `spex`. */
function hostHolds(host: StandinHost, key: string, path: string): boolean {
  try { return git(bareOf(host, key), "ls-tree", "-r", "--name-only", "spex").split("\n").includes(path); }
  catch { return false; }
}

/** Whether a push into a key's repository reached the stand-in since
 * its `asked`-th request. */
function pushedSince(host: StandinHost, key: string, asked: number): boolean {
  return host.script.requests.slice(asked).some((request) => request.path === `/git/${key}.git/git-receive-pack`);
}

/** A stopped sync's place and cause, apart from its words. */
function stopOf(repository: RepositoryState): Record<string, unknown> {
  const { sync } = repository;
  return sync.phase === "stopped"
    ? { phase: sync.phase, op: sync.op, step: sync.step, cause: sync.cause, retry: sync.retry }
    : { phase: sync.phase };
}

/** The place a sync the core holds for the notice stops at (space-15). */
const NOTICE_STOP = { phase: "stopped", op: "sync", step: "check", cause: "notice", retry: true };

/** A project's code: a Git working folder with one commit. */
function codeRepository(name: string): string {
  const dir = gitFolder(name);
  writeFileSync(join(dir, "README.md"), `# ${name}\n`);
  git(dir, "add", "README.md");
  git(dir, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "code");
  return dir;
}

/** A project's spex repository on the stand-in, with its code. */
function listedProject(host: StandinHost, name: string, options: { members?: StandinMember[]; role?: string } = {}) {
  const code = codeRepository(name);
  return host.script.addRepository({ group: "acme", name: `${name}-spex`, project: { format: 1, name, remote: code }, ...options });
}

/** Join a listed spex repository with its code into a fresh folder
 * (space-63), the join ended and the row idle. */
async function joinListed(home: Awaited<ReturnType<typeof startHome>>, hostId: string, key: string, name: string): Promise<RepositoryState> {
  const folder = join(mkdtempSync(join(scratch, `${name}-`)), name);
  const from = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.join", { hostId, folder }), { accepted: true });
  return home.client.waitRepository(from, key, (repository) => repository.state !== "absent" && repository.folder !== null && repository.sync.phase === "idle");
}

/** Refresh, and wait until the row reads `members`. */
async function refreshUntil(home: Awaited<ReturnType<typeof startHome>>, key: string, members: number): Promise<RepositoryState> {
  const from = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.refresh", {}), { accepted: true });
  return home.client.waitRepository(from, key, (repository) => repository.members === members);
}

/** A `space.sync` without the notice is refused, its facts naming it,
 * and reaches nothing at the host (space-57, space-29). */
async function refusedForNotice(home: Awaited<ReturnType<typeof startHome>>, host: StandinHost, key: string): Promise<void> {
  const asked = host.script.requests.length;
  const unseen = await home.client.command("space.sync", { repository: key });
  assert.ok(!unseen.ok, "the sync waits for the notice");
  assert.equal(unseen.error.code, "invalid_request");
  assert.match(unseen.error.message, /sharing notice/);
  assert.deepEqual(unseen.error.details, { notice: true, members: 2, visibility: "private" });
  assert.ok(!pushedSince(host, key, asked), "no push reached the stand-in");
}

test("space-37: a member added since the last read stops the sync at Check for the notice with nothing sent; the next sync asks it", async (t) => {
  const host = await startHost();
  const listed = listedProject(host, "solo");
  const key = "acme/solo-spex";
  const home = await startHome("notice-stale", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  await signIn(home, host);
  const joined = await joinListed(home, listed.id, key, "solo");
  assert.deepEqual([joined.state, joined.members, joined.noticed], ["reachable", 1, false]);
  const sessionId = await runTurn(home, key, "Mine alone");
  // A member joins at the host; this device has not read it since.
  listed.members.push(BOB);
  const asked = host.script.requests.length;
  const stopped = await home.client.settle("space.sync", { repository: key });
  // Its Check reads two members and no notice seen: it stops there,
  // before anything is prepared or sent (space-57, space-12, space-15).
  assert.deepEqual(stopOf(stopped), NOTICE_STOP, JSON.stringify(stopped.sync));
  assert.ok(stopped.sync.phase === "stopped" && /sharing notice/.test(stopped.sync.message), JSON.stringify(stopped.sync));
  assert.ok(!pushedSince(host, key, asked), "no push reached the stand-in");
  assert.ok(!hostHolds(host, key, `sessions/${sessionId}.json`), "the session stays here");
  const row = await home.client.repository(key);
  assert.deepEqual([row.state, row.members, row.noticed], ["reachable", 2, false]);
  assert.equal(prefsOf(home.dataDir)[`sync:${key}:noticed`], undefined);
  // The reader's next sync asks for the notice, then pushes with it.
  await refusedForNotice(home, host, key);
  const sent = host.script.requests.length;
  const done = await home.client.settle("space.sync", { repository: key, noticed: true });
  assert.ok(done.sync.phase === "done" && done.sync.pushed, JSON.stringify(done.sync));
  assert.ok(pushedSince(host, key, sent), "the push reached the stand-in");
  assert.equal(done.noticed, true);
  assert.equal(prefsOf(home.dataDir)[`sync:${key}:noticed`], true);
  assert.ok(hostHolds(host, key, `sessions/${sessionId}.json`), "the session is sent");
});

test("space-37: a read-only sync records its last sync with no notice; push granted with no read since stops at Check, then the notice is asked", async (t) => {
  const host = await startHost();
  const listed = listedProject(host, "watch", { members: [BOB], role: "Reporter" });
  const key = "acme/watch-spex";
  const home = await startHome("notice-granted", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  await signIn(home, host);
  const joined = await joinListed(home, listed.id, key, "watch");
  assert.deepEqual([joined.state, joined.members, joined.noticed], ["read-only", 2, false]);
  // The account only reads: its sync brings, sends nothing and asks no
  // notice, its last sync recorded (space-57, space-22).
  const asked0 = host.script.requests.length;
  const brought = await home.client.settle("space.sync", { repository: key });
  assert.ok(brought.sync.phase === "done" && !brought.sync.pushed && brought.sync.sent === 0, JSON.stringify(brought.sync));
  assert.ok(!pushedSince(host, key, asked0), "nothing is sent");
  assert.deepEqual(prefsOf(home.dataDir)[`sync:${key}:last`], brought.lastSync);
  assert.equal(brought.noticed, false);
  const sessionId = await runTurn(home, key, "Before the grant");
  // The host grants push; this device has not read it since.
  host.script.accessLevel(listed.id, "Developer");
  const asked = host.script.requests.length;
  const stopped = await home.client.settle("space.sync", { repository: key });
  assert.deepEqual(stopOf(stopped), NOTICE_STOP, JSON.stringify(stopped.sync));
  assert.ok(!pushedSince(host, key, asked), "no push reached the stand-in");
  assert.ok(!hostHolds(host, key, `sessions/${sessionId}.json`), "the session stays here");
  // That read stands: the next sync is refused until noticed, and with
  // it pushes (space-57).
  await refusedForNotice(home, host, key);
  const done = await home.client.settle("space.sync", { repository: key, noticed: true });
  assert.ok(done.sync.phase === "done" && done.sync.pushed, JSON.stringify(done.sync));
  assert.ok(hostHolds(host, key, `sessions/${sessionId}.json`), "the session is sent");
});

test("space-37: a second device whose first sync sent nothing asks the notice once the repository gains a member", async (t) => {
  const host = await startHost();
  const listed = listedProject(host, "pair");
  const key = "acme/pair-spex";
  // Device one joins the sole-member repository and pushes.
  const one = await startHome("notice-one", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => one.stop());
  await signIn(one, host);
  await joinListed(one, listed.id, key, "pair-one");
  const first = await one.client.settle("space.sync", { repository: key });
  assert.ok(first.sync.phase === "done" && first.sync.pushed, JSON.stringify(first.sync));
  // Device two, the same account, joins; its first sync sends nothing
  // and records its last sync.
  const two = await startHome("notice-two", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => two.stop());
  const signedFrom = two.client.mark();
  await signIn(two, host);
  await two.client.waitRepository(signedFrom, HOST_OWN, (repository) => repository.sync.phase !== "running" && repository.sync.phase !== "idle");
  await joinListed(two, listed.id, key, "pair-two");
  const nothing = await two.client.settle("space.sync", { repository: key });
  assert.ok(nothing.sync.phase === "done" && !nothing.sync.pushed && nothing.sync.sent === 0, JSON.stringify(nothing.sync));
  assert.deepEqual(prefsOf(two.dataDir)[`sync:${key}:last`], nothing.lastSync);
  // A member joins at the host, and device two reads it.
  listed.members.push(BOB);
  await refreshUntil(two, key, 2);
  const sessionId = await runTurn(two, key, "From the second device");
  await refusedForNotice(two, host, key);
  assert.ok(!hostHolds(host, key, `sessions/${sessionId}.json`), "the session stays here");
  const done = await two.client.settle("space.sync", { repository: key, noticed: true });
  assert.ok(done.sync.phase === "done" && done.sync.pushed, JSON.stringify(done.sync));
  assert.ok(hostHolds(host, key, `sessions/${sessionId}.json`), "the session is sent");
});

test("space-37: a group's own repository joined at its first session from a read listing the account alone stops at Check once a member was added", async (t) => {
  const host = await startHost();
  const listed = host.script.addRepository({ group: "acme", name: "acme-spex" });
  const first = await startHome("notice-group", { host, project: false, extra: { signIn: "browser" } });
  const signedFrom = first.client.mark();
  await signIn(first, host);
  await first.client.waitRepository(signedFrom, HOST_OWN, (repository) => repository.sync.phase === "done");
  await first.stop();
  // A group's own clone on this device, holding a file, on no host yet.
  const key = "acme/acme-spex";
  const clone = clonePath(first.dataDir, key);
  mkdirSync(clone, { recursive: true });
  git(clone, "init", "-q", "-b", "spex");
  writeFileSync(join(clone, "note.txt"), "for the group\n");
  git(clone, "add", "note.txt");
  git(clone, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "Start");
  const home = await startHome("notice-group-again", { dataDir: first.dataDir, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  // The read a signed-in start owes lists the group's own repository
  // with the account alone; a member joins it at the host since.
  const fromRead = home.client.mark();
  await home.client.expectOk("space.get", {});
  await home.client.waitSpace(fromRead, (state) => state.readAt !== null);
  listed.members.push(BOB);
  const folder = gitFolder("acme-work");
  await home.client.expectOk("project.rebind", { projectId: key, path: folder });
  const asked = host.script.requests.length;
  const from = home.client.mark();
  assert.equal((await home.client.expectOk("project.register", { path: folder })).id, key);
  // The join the core starts stops at its Check for the notice, sending
  // nothing (space-57, space-65).
  const held = await home.client.waitRepository(from, key, (repository) => repository.sync.phase === "stopped" || repository.sync.phase === "done");
  assert.deepEqual(stopOf(held), NOTICE_STOP, JSON.stringify(held.sync));
  assert.ok(!pushedSince(host, key, asked), "no push reached the stand-in");
  // It stops before its branch is prepared: acme-spex has no `spex` yet
  // (space-12).
  assert.ok(!host.script.requests.slice(asked).some((request) => request.method === "POST" && request.path === `/api/v1/host/repositories/${listed.id}/spex-branch`), "no branch prepared");
  assert.ok(!hostHolds(host, key, "note.txt"), "the clone's file stays here");
  const row = await home.client.repository(key);
  assert.deepEqual([row.state, row.members, row.noticed], ["reachable", 2, false]);
  assert.equal(prefsOf(home.dataDir)[`sync:${key}:noticed`], undefined);
  // The row's Sync, the notice seen, sends it (space-57).
  const done = await home.client.settle("space.sync", { repository: key, noticed: true });
  assert.ok(done.sync.phase === "done" && done.sync.pushed, JSON.stringify(done.sync));
  assert.ok(hostHolds(host, key, "note.txt"), "the clone's file is sent");
});

test("space-37: a repository pushed while the account was its only member asks the notice once it gains a member", async (t) => {
  const host = await startHost();
  const listed = listedProject(host, "grow");
  const key = "acme/grow-spex";
  const home = await startHome("notice-grow", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  await signIn(home, host);
  await joinListed(home, listed.id, key, "grow");
  const alone = await runTurn(home, key, "While alone");
  // Its only member the account, it pushes with no notice asked.
  const pushed = await home.client.settle("space.sync", { repository: key });
  assert.ok(pushed.sync.phase === "done" && pushed.sync.pushed, JSON.stringify(pushed.sync));
  assert.equal(pushed.noticed, false);
  assert.ok(hostHolds(host, key, `sessions/${alone}.json`));
  // A member joins and a Refresh reads it: the next push asks the notice
  // first (space-57; DR-103).
  listed.members.push(BOB);
  await refreshUntil(home, key, 2);
  const shared = await runTurn(home, key, "Now shared");
  await refusedForNotice(home, host, key);
  assert.ok(!hostHolds(host, key, `sessions/${shared}.json`), "the session stays here");
  const done = await home.client.settle("space.sync", { repository: key, noticed: true });
  assert.ok(done.sync.phase === "done" && done.sync.pushed, JSON.stringify(done.sync));
  assert.ok(hostHolds(host, key, `sessions/${shared}.json`), "the session is sent");
});

test("space-37: a synced sole-member repository whose host does not answer after a restart is admitted and stops at Check unreachable, no notice recorded", async (t) => {
  const host = await startHost();
  const listed = listedProject(host, "offline");
  const key = "acme/offline-spex";
  const first = await startHome("notice-offline", { host, project: false, extra: { signIn: "browser" } });
  await signIn(first, host);
  await joinListed(first, listed.id, key, "offline");
  // Its only member the account, it pushes with no notice asked.
  const pushed = await first.client.settle("space.sync", { repository: key });
  assert.ok(pushed.sync.phase === "done" && pushed.sync.pushed, JSON.stringify(pushed.sync));
  assert.equal(prefsOf(first.dataDir)[`sync:${key}:noticed`], undefined);
  await first.stop();
  // Restarted, the core has read nothing yet, and the host answers no
  // request.
  const home = await startHome("notice-offline-again", { dataDir: first.dataDir, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  host.script.unavailable(1_000);
  const asked = host.script.requests.length;
  // The admission's read for the unknown members fails: the sync goes on
  // to its Check, which stops on the host's failure (space-57, space-15).
  const stopped = await home.client.settle("space.sync", { repository: key });
  assert.deepEqual(stopOf(stopped), { phase: "stopped", op: "sync", step: "check", cause: "unreachable", retry: true }, JSON.stringify(stopped.sync));
  assert.ok(!pushedSince(host, key, asked), "no push reached the stand-in");
  assert.equal(prefsOf(home.dataDir)[`sync:${key}:noticed`], undefined);
});
