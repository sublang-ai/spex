// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A spex repository's placements following and reconciled with their
// files (DR-128): real cores on scratch homes against stand-in Git hosts,
// some over one Git backend. A merge that changes the clone's placement
// files reconciles its placements with them before the next placement's
// turn — two files naming one host repository leaving the one the clone
// holds it under, a placement whose file another instance's replaced
// following that instance, one whose file was removed dropped, the first
// moving the clone with its drop (space-91, storage-38); a drop the move
// refuses waits, syncing nothing with that placement, and is tried again
// before its turn at each sync; and a placement beside the first follows
// a signed-in instance listing it while its own is signed out, moving no
// clone, never onto an instance the clone holds another placement at
// (space-60). Leave fetches a placement first and stops, unless
// confirmed, for records no remaining placement holds or for a placement
// it cannot read; it then drops it and deletes its file, the first
// moving the clone, a lease beneath refusing it whole; and a placement
// whose instance is signed out, listed at another, follows that one
// instead (space-98, storage-38) — hermetic, on loopback alone, in a
// file budget of its own.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createSessionStore } from "@sublang/playbook/session-store";
import { Home } from "./home.js";
import { canonicalOrigin } from "./instance.js";
import type { GroupsState, SpaceUnit } from "./protocol.js";
import { bareOf, clonePath, createSpaceHarness, hostFolder, hostKey, instanceOf, placementOf, syncRecordsOf } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
const { git, gitFolder, addFolder, peerClone, peerPush, attachByHand, startHome, startHost, signIn, signOut } = fixture;
test.after(() => fixture.dispose());

/** The stand-in's person, and your own group's repository once signed in. */
const LOGIN = "ada";
const HOST_OWN = `${LOGIN}/${LOGIN}-spex`;
const FIRST_NAME = "Stand-in Git host";
const SECOND_NAME = "Second stand-in";
const THIRD_NAME = "Third stand-in";

/** A placement file's bytes, as storage-36 spells them out. */
const placementBytes = (origin: string, id: string | null): string => `format: 1\ninstance: "${origin}"\nid: "${id ?? ""}"\n`;

/** The unit names a list holds, in its order. */
const units = (list: SpaceUnit[]): string[] => list.map((unit) => unit.unit);

/** A Refresh of every signed-in instance, landed. */
async function refreshed(home: Awaited<ReturnType<typeof startHome>>): Promise<GroupsState> {
  const before = await home.client.expectOk("space.get", {});
  const mark = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  return home.client.waitSpace(mark, (state) => state.instances.every((instance) => !instance.signedIn
    || (instance.read.phase === "idle" && (instance.readAt ?? 0) > (instanceOf(before, instance.origin)?.readAt ?? 0))), 30_000);
}

/** A scratch home signed in to every stand-in given, in order, holding a
 * project's spex repository created in the first's `acme` from a working
 * folder of its own, synced. */
async function projectAt(name: string, hosts: Awaited<ReturnType<typeof startHost>>[]) {
  const [first, ...rest] = hosts;
  const home = await startHome(name, { host: first, project: false });
  let mark = home.client.mark();
  await signIn(home, first);
  await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  for (const host of rest) await signIn(home, host);
  const code = gitFolder("atlas");
  const { key: local } = await addFolder(home, code);
  mark = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: first.url, groupId: "2002", name: "atlas" } });
  const key = hostKey(first, "acme/atlas-spex");
  const created = await home.client.waitRepository(mark, key, (repository) => repository.sync.phase === "done", 30_000);
  return { home, key, code, id: created.id as string, clone: clonePath(home.dataDir, key) };
}

test("space-94, space-91, space-60, space-5: for a project placed at the first of two instances over one Git backend, a peer's commit adding a file for the second naming the same host repository leaves only the first's file after the next Sync's merge, the Sync after pushing that deletion; a peer's commit then replacing the first's file by the second's renames the clone's remote to the second's folder at that merge, the clone following it to its path there, dropping nothing and keeping its last sync", async (t) => {
  const first = await startHost();
  const second = await startHost({ gitBackend: first, displayName: SECOND_NAME });
  const firstFolder = hostFolder(first);
  const secondFolder = hostFolder(second);
  const firstFile = `placements/${firstFolder}.yaml`;
  const secondFile = `placements/${secondFolder}.yaml`;
  const home = await startHome("reconcile-files", { host: first, project: false });
  t.after(() => home.stop());
  let mark = home.client.mark();
  await signIn(home, first);
  await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  await signIn(home, second);
  // In the person's namespace at the first, which both instances list
  // under one id (git-host-12).
  const code = gitFolder("team");
  const { key: local } = await addFolder(home, code);
  mark = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: first.url, groupId: null, name: "team" } });
  const key = hostKey(first, `${LOGIN}/team-spex`);
  const created = await home.client.waitRepository(mark, key, (repository) => repository.sync.phase === "done", 30_000);
  const id = created.id as string;
  const clone = clonePath(home.dataDir, key);
  const bare = bareOf(first, key);
  writeFileSync(join(clone, "notes.md"), "kept\n");
  // Each instance's view lists it.
  await refreshed(home);
  const kept = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(kept.sync.phase, "done", JSON.stringify(kept.sync));
  assert.equal(git(bare, "show", `spex:${firstFile}`), placementBytes(first.url, id).trimEnd());

  // A peer adds a file for the second naming the same host repository:
  // the merge brings it, and the reconcile leaves the first's alone, the
  // clone's remote and records as they were (space-91).
  const peer = peerClone(bare);
  await peerPush(peer, (dir) => { writeFileSync(join(dir, secondFile), placementBytes(second.url, id)); });
  const merged = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(merged.sync.phase, "done", JSON.stringify(merged.sync));
  assert.doesNotThrow(() => git(clone, "cat-file", "-e", `HEAD:${secondFile}`), "the merge brought the second's file");
  assert.deepEqual(readdirSync(join(clone, "placements")), [`${firstFolder}.yaml`]);
  assert.ok(units(merged.local).includes(secondFile), "its deletion a local change the next sync carries");
  assert.deepEqual(git(clone, "remote").split("\n"), [firstFolder]);
  assert.deepEqual([merged.key, merged.instance, merged.placements.map((line) => line.instance)], [key, first.url, [first.url]]);

  // The Sync after pushes that deletion.
  const pushed = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(pushed.sync.phase, "done", JSON.stringify(pushed.sync));
  assert.throws(() => git(bare, "cat-file", "-e", `spex:${secondFile}`));
  assert.doesNotThrow(() => git(bare, "cat-file", "-e", `spex:${firstFile}`));
  const lastSync = pushed.lastSync;
  assert.ok(lastSync, "its last sync recorded");
  assert.deepEqual(syncRecordsOf(home.dataDir, key), { [`sync:${key}:${firstFolder}:last`]: lastSync });

  // A peer replaces the first's file by the second's: at that merge the
  // clone's remote is renamed to the second's folder with its id in its
  // section, the clone moved to its path at the second with its pair,
  // dropping nothing, and its last sync re-keyed in the same step, as a
  // follow makes them (space-91, space-60, space-5).
  await peerPush(peer, (dir) => {
    rmSync(join(dir, firstFile));
    writeFileSync(join(dir, secondFile), placementBytes(second.url, id));
  });
  const followed = hostKey(second, `${LOGIN}/team-spex`);
  const movedClone = clonePath(home.dataDir, followed);
  let atRefresh: Record<string, unknown> | undefined;
  home.hooks.beforeStep = ({ step, repository }) => {
    if (step !== "refresh" || atRefresh !== undefined) return;
    atRefresh = {
      repository,
      remotes: git(movedClone, "remote").split("\n"),
      id: git(movedClone, "config", "--get", `remote.${secondFolder}.spexId`),
      files: readdirSync(join(movedClone, "placements")),
      records: { ...syncRecordsOf(home.dataDir, key), ...syncRecordsOf(home.dataDir, followed) },
    };
  };
  mark = home.client.mark();
  await home.client.expectOk("space.sync", { repository: key });
  const moved = await home.client.waitRepository(mark, followed, (repository) => repository.sync.phase !== "running" && repository.sync.phase !== "idle", 30_000);
  home.hooks.beforeStep = undefined;
  assert.deepEqual([moved.sync.phase, moved.id, moved.instance, moved.placements.map((line) => line.instance)], ["done", id, second.url, [second.url]], JSON.stringify(moved.sync));
  assert.deepEqual(atRefresh, {
    repository: followed,
    remotes: [secondFolder],
    id,
    files: [`${secondFolder}.yaml`],
    records: { [`sync:${followed}:${secondFolder}:last`]: lastSync },
  });
  assert.ok(existsSync(join(movedClone, ".git")) && !existsSync(clone), "the clone follows its key placement");
  assert.equal(readFileSync(join(movedClone, "notes.md"), "utf8"), "kept\n", "its records kept");
  assert.equal(readFileSync(join(movedClone, secondFile), "utf8"), placementBytes(second.url, id));
  assert.equal(git(movedClone, "config", "--get", "branch.spex.remote"), secondFolder);
  assert.equal(Home.load(home.dataDir).keyForFolder(code), followed);

  // From then on it syncs at the second, with the second's credential.
  const transports = first.script.transportCredentials.length;
  const again = await home.client.settle("space.sync", { repository: followed }, 30_000);
  assert.equal(again.sync.phase, "done", JSON.stringify(again.sync));
  assert.deepEqual([...new Set(first.script.transportCredentials.slice(transports).map((entry) => entry.instance))], [second.url]);
  assert.deepEqual(git(movedClone, "remote").split("\n"), [secondFolder]);
});

test("space-101, space-91, storage-38, storage-37: for a project placed at the first and the third of three instances, the first two over one Git backend, a peer's commit at the third deleting the first's placement file drops nothing at the next Sync while a lease taken out of band stands beneath the clone, syncing nothing with the first, nor at the Sync after, which writes no file again; the Sync after the release drops it and moves the clone under the third's folder with its pair", async (t) => {
  const first = await startHost();
  const second = await startHost({ gitBackend: first, displayName: SECOND_NAME });
  const third = await startHost({ displayName: THIRD_NAME });
  const firstFolder = hostFolder(first);
  const thirdFolder = hostFolder(third);
  const firstFile = `placements/${firstFolder}.yaml`;
  const { home, key, code, clone } = await projectAt("reconcile-leased", [first, second, third]);
  t.after(() => home.stop());
  const placed = attachByHand(home, key, third);
  const both = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(both.sync.phase, "done", JSON.stringify(both.sync));
  assert.deepEqual(both.placements.map((line) => [line.instance, line.outcome?.kind]), [[first.url, "synced"], [third.url, "synced"]]);
  const firstBare = bareOf(first, key);
  const thirdBare = third.bareOf("acme/atlas-spex");
  const atFirst = git(firstBare, "rev-parse", "spex");

  // A peer at the third deletes the first's placement file.
  const peer = peerClone(thirdBare);
  const removed = await peerPush(peer, (dir) => rmSync(join(dir, firstFile)));
  // A writer of another process holds the clone where it is.
  const sessions = createSessionStore({ sessionsDir: join(clone, "sessions") });
  await sessions.prepare();
  const lease = randomUUID();
  const live = await sessions.acquireManagement(lease);
  let released = false;
  try {
    // The third's merge brings the removal; the first's drop, which moves
    // the clone, waits on the lease, the first's line naming the session;
    // nothing is pushed to the first, its catch-up skipped (space-91,
    // storage-38).
    const leased = await home.client.settle("space.sync", { repository: key }, 30_000);
    assert.equal(leased.sync.phase, "done", JSON.stringify(leased.sync));
    const waiting = placementOf(leased, first.url).outcome;
    assert.ok(waiting?.kind === "stopped" && waiting.cause === "lease" && waiting.message.includes(lease.slice(0, 8)), JSON.stringify(waiting));
    assert.equal(placementOf(leased, third.url).outcome?.kind, "synced");
    assert.equal(git(clone, "rev-parse", "HEAD"), removed, "the third's merge stands");
    assert.equal(git(firstBare, "rev-parse", "spex"), atFirst, "nothing synced with the first");
    assert.deepEqual(git(clone, "remote").split("\n"), [firstFolder, thirdFolder]);
    assert.equal(existsSync(join(clone, firstFile)), false);

    // The Sync after: the drop, tried again before the first's turn, still
    // waits, and nothing is fetched from or pushed to the first; its Save
    // writes the removed file no more (storage-37).
    const transports = first.script.transportCredentials.length;
    const still = await home.client.settle("space.sync", { repository: key }, 30_000);
    assert.equal(still.sync.phase, "done", JSON.stringify(still.sync));
    const again = placementOf(still, first.url).outcome;
    assert.ok(again?.kind === "stopped" && again.cause === "lease", JSON.stringify(again));
    assert.deepEqual(first.script.transportCredentials.slice(transports), [], "nothing synced with the first");
    assert.equal(existsSync(join(clone, firstFile)), false);
    assert.throws(() => git(clone, "cat-file", "-e", `HEAD:${firstFile}`));
    assert.equal(git(firstBare, "rev-parse", "spex"), atFirst);
    assert.deepEqual(git(clone, "remote").split("\n"), [firstFolder, thirdFolder]);

    // Released, the Sync after drops the first and moves the clone to its
    // path at the third, its pair and its records there following; the
    // third syncs (storage-38, space-91).
    await live.release();
    released = true;
    const movedKey = hostKey(third, "acme/atlas-spex");
    const mark = home.client.mark();
    await home.client.expectOk("space.sync", { repository: key });
    const moved = await home.client.waitRepository(mark, movedKey, (repository) => repository.sync.phase !== "running" && repository.sync.phase !== "idle", 30_000);
    assert.deepEqual([moved.sync.phase, moved.instance, moved.id], ["done", third.url, placed.id], JSON.stringify(moved.sync));
    assert.deepEqual(moved.placements.map((line) => [line.instance, line.outcome?.kind]), [[third.url, "synced"]]);
    const movedClone = clonePath(home.dataDir, movedKey);
    assert.ok(existsSync(join(movedClone, ".git")) && !existsSync(clone), "moved under the third's folder");
    assert.deepEqual(git(movedClone, "remote").split("\n"), [thirdFolder]);
    assert.equal(Home.load(home.dataDir).keyForFolder(code), movedKey);
    assert.deepEqual(Object.keys({ ...syncRecordsOf(home.dataDir, key), ...syncRecordsOf(home.dataDir, movedKey) }).filter((name) => name.includes(`:${firstFolder}:`)), []);
    assert.equal(git(firstBare, "rev-parse", "spex"), atFirst, "the first's host repository left as it stands");
  } finally { if (!released) await live.release(); }
});

test("space-60, space-61, space-5: a placement beside the first follows a signed-in instance over its Git backend that lists its host repository while its own is signed out, its remote renamed and its file rewritten, moving no clone and taking that instance's credential, but never onto an instance at which the clone holds another placement, where it reads unreachable and is not followed", async (t) => {
  const first = await startHost();
  const second = await startHost({ displayName: SECOND_NAME });
  const third = await startHost({ gitBackend: second, displayName: THIRD_NAME });
  const firstFolder = hostFolder(first);
  const secondFolder = hostFolder(second);
  const thirdFolder = hostFolder(third);
  const { home, key, clone, id } = await projectAt("reconcile-follow", [first, second, third]);
  t.after(() => home.stop());
  // Placed in the person's namespace at the second, which the third, over
  // its Git backend, lists too; and in the third's own `acme`.
  const atSecond = attachByHand(home, key, second, LOGIN);
  attachByHand(home, key, third);
  await refreshed(home);
  const all = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(all.sync.phase, "done", JSON.stringify(all.sync));
  assert.deepEqual(all.placements.map((line) => [line.instance, line.outcome?.kind]), [[first.url, "synced"], [second.url, "synced"], [third.url, "synced"]]);

  // The second signed out: the third lists its host repository, but the
  // clone holds a placement there, so it follows nothing and reads
  // unreachable, its Check stopping it alone (space-60, space-61).
  await signOut(home, second);
  const unfollowed = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(unfollowed.sync.phase, "done", JSON.stringify(unfollowed.sync));
  const stranded = placementOf(unfollowed, second.url);
  assert.deepEqual([stranded.state, stranded.reason, stranded.outcome?.kind], ["unreachable", "Sign in again", "stopped"], JSON.stringify(stranded));
  assert.ok(stranded.outcome?.kind === "stopped" && stranded.outcome.cause === "reauth", JSON.stringify(stranded.outcome));
  assert.deepEqual([placementOf(unfollowed, first.url).outcome?.kind, placementOf(unfollowed, third.url).outcome?.kind], ["synced", "synced"]);
  assert.deepEqual(git(clone, "remote").split("\n"), [firstFolder, secondFolder, thirdFolder]);
  assert.deepEqual(readdirSync(join(clone, "placements")), [`${firstFolder}.yaml`, `${secondFolder}.yaml`, `${thirdFolder}.yaml`]);

  // The third's placement taken away from a terminal: the second's now
  // follows the third at its Check — its remote renamed to the third's
  // folder with its id, its file rewritten to the third's in place of the
  // second's, its records re-keyed — the clone moved nowhere, and its
  // transport taking the third's credential (space-60, space-5).
  git(clone, "remote", "remove", thirdFolder);
  rmSync(join(clone, "placements", `${thirdFolder}.yaml`));
  const transports = second.script.transportCredentials.length;
  const follows = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(follows.sync.phase, "done", JSON.stringify(follows.sync));
  assert.deepEqual([follows.key, follows.instance, follows.id], [key, first.url, id]);
  assert.ok(existsSync(join(clone, ".git")), "the clone stays where it is");
  assert.deepEqual(git(clone, "remote").split("\n"), [firstFolder, thirdFolder]);
  assert.equal(git(clone, "config", "--get", `remote.${thirdFolder}.url`), atSecond.url);
  assert.equal(git(clone, "config", "--get", `remote.${thirdFolder}.spexId`), atSecond.id);
  assert.deepEqual(readdirSync(join(clone, "placements")), [`${firstFolder}.yaml`, `${thirdFolder}.yaml`]);
  assert.equal(readFileSync(join(clone, "placements", `${thirdFolder}.yaml`), "utf8"), placementBytes(third.url, atSecond.id));
  const line = placementOf(follows, third.url);
  assert.deepEqual([line.path, line.id, line.state, line.outcome?.kind], [`${LOGIN}/atlas-spex`, atSecond.id, "reachable", "synced"], JSON.stringify(line));
  assert.deepEqual(follows.placements.map((each) => each.instance), [first.url, third.url]);
  assert.deepEqual(Object.keys(syncRecordsOf(home.dataDir, key)).filter((name) => name.includes(`:${secondFolder}:`)), []);
  assert.ok(syncRecordsOf(home.dataDir, key)[`sync:${key}:${thirdFolder}:last`], "its last sync recorded under its remote");
  const issued = second.script.transportCredentials.slice(transports);
  assert.ok(issued.length > 0 && issued.every((entry) => entry.instance === third.url), JSON.stringify(issued));
});

test("git-host-21, space-16, space-15, space-60: a placement beside the first whose own instance is signed out, governed by a signed-in instance over its Git backend that lists its host repository, waits at its Check for that instance's rate limit alone, its step offering Stop, which ends the wait naming that instance", async (t) => {
  const first = await startHost();
  const second = await startHost({ displayName: SECOND_NAME });
  const third = await startHost({ gitBackend: second, displayName: THIRD_NAME });
  const { home, key } = await projectAt("hold-governing", [first, second, third]);
  t.after(() => home.stop());
  // Placed in the person's namespace at the second, which the third, over
  // its Git backend, lists too.
  attachByHand(home, key, second, LOGIN);
  await refreshed(home);
  const both = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.deepEqual(both.placements.map((line) => [line.instance, line.outcome?.kind]), [[first.url, "synced"], [second.url, "synced"]], JSON.stringify(both.sync));
  await signOut(home, second);

  // The third asks to wait as long as a hold lasts: its read fails and
  // its calls are held, its view kept (git-host-21, git-host-5).
  third.script.rateLimit(1, "120");
  let mark = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  await home.client.waitSpace(mark, (state) => instanceOf(state, third.url)?.read.phase === "failed", 30_000);

  // The second's Check reads the third, which governs it: that call
  // waits out the third's hold, the step offering Stop; Stop ends the
  // wait, naming the third, and the sync with it, the first synced
  // (git-host-21, space-16, space-15).
  mark = home.client.mark();
  await home.client.expectOk("space.sync", { repository: key });
  await home.client.waitRepository(mark, key, (row) => row.sync.phase === "running" && row.sync.step === "check" && row.sync.placement === canonicalOrigin(second.url) && row.sync.cancelable, 20_000);
  assert.deepEqual(await home.client.expectOk("space.cancel", { repository: key }), { stopped: true });
  const stopped = await home.client.waitRepository(mark, key, (row) => row.sync.phase !== "running", 20_000);
  const waited = `Stopped while waiting for ${THIRD_NAME}`;
  assert.ok(stopped.sync.phase === "stopped" && stopped.sync.step === "check" && stopped.sync.cause === "stopped" && stopped.sync.message === waited, JSON.stringify(stopped.sync));
  assert.deepEqual(placementOf(stopped, second.url).outcome, { kind: "stopped", step: "check", cause: "stopped", message: waited, guidance: "Retry waits, then runs the step.", retry: true });
  assert.equal(placementOf(stopped, first.url).outcome?.kind, "synced");
});

test("storage-38, space-91: a first placement's drop a merge brings is refused, nothing dropped or moved, while something else takes its next placement's path, naming that path, and in a restarted core that has not read the next placement's instance, naming that instance, the next placement syncing each time; the sync after drops it and moves the clone there", async (t) => {
  const first = await startHost();
  const second = await startHost({ displayName: SECOND_NAME, person: { id: "1002", login: "bob", displayName: "Bob" } });
  const firstFolder = hostFolder(first);
  const secondFolder = hostFolder(second);
  const firstFile = `placements/${firstFolder}.yaml`;
  const { home, key, code, clone } = await projectAt("reconcile-refused", [first, second]);
  t.after(() => home.stop());
  const placed = attachByHand(home, key, second);
  const both = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(both.sync.phase, "done", JSON.stringify(both.sync));
  const firstBare = bareOf(first, key);
  const atFirst = git(firstBare, "rev-parse", "spex");
  await peerPush(peerClone(second.bareOf("acme/atlas-spex")), (dir) => rmSync(join(dir, firstFile)));

  // Something takes the clone's path at the second: the drop the second's
  // merge brings is refused as a sync's move is, the first's line saying
  // so, while the second syncs (storage-38).
  const movedKey = hostKey(second, "acme/atlas-spex");
  const movedClone = clonePath(home.dataDir, movedKey);
  mkdirSync(dirname(movedClone), { recursive: true });
  writeFileSync(movedClone, "taken\n");
  const taken = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(taken.sync.phase, "done", JSON.stringify(taken.sync));
  const refused = placementOf(taken, first.url).outcome;
  assert.ok(refused?.kind === "stopped" && refused.message === `workspace/${movedKey} already exists, so the clone cannot follow the host there`, JSON.stringify(refused));
  assert.equal(placementOf(taken, second.url).outcome?.kind, "synced");
  assert.deepEqual(git(clone, "remote").split("\n"), [firstFolder, secondFolder]);
  assert.equal(readFileSync(movedClone, "utf8"), "taken\n");
  rmSync(movedClone);
  await home.stop();

  // A restarted core, which has read no instance yet: the drop, tried
  // again before the first's turn, is refused naming the second, whose
  // path it would move the clone to; the second syncs (storage-38).
  const again = await startHome("reconcile-refused-again", { dataDir: home.dataDir, project: false });
  t.after(() => again.stop());
  let mark = again.client.mark();
  await again.client.expectOk("space.sync", { repository: key });
  const unread = await again.client.waitRepository(mark, key, (repository) => repository.sync.phase !== "running" && repository.sync.phase !== "idle", 30_000);
  assert.equal(unread.sync.phase, "done", JSON.stringify(unread.sync));
  const named = placementOf(unread, first.url).outcome;
  assert.ok(named?.kind === "stopped" && named.message === `${SECOND_NAME} is not read yet, so the clone cannot move to its path there`, JSON.stringify(named));
  assert.equal(placementOf(unread, second.url).outcome?.kind, "synced");
  assert.deepEqual(git(clone, "remote").split("\n"), [firstFolder, secondFolder]);
  assert.equal(git(firstBare, "rev-parse", "spex"), atFirst, "nothing synced with the first");

  // The second read at its turn, the sync after drops the first and moves
  // the clone to its path at the second.
  mark = again.client.mark();
  await again.client.expectOk("space.sync", { repository: key });
  const moved = await again.client.waitRepository(mark, movedKey, (repository) => repository.sync.phase !== "running" && repository.sync.phase !== "idle", 30_000);
  assert.deepEqual([moved.sync.phase, moved.instance, moved.id, moved.placements.map((line) => line.instance)], ["done", second.url, placed.id, [second.url]], JSON.stringify(moved.sync));
  assert.ok(existsSync(join(movedClone, ".git")) && !existsSync(clone), "moved to its path at the second");
  assert.deepEqual(git(movedClone, "remote").split("\n"), [secondFolder]);
  assert.deepEqual(readdirSync(join(movedClone, "placements")), [`${secondFolder}.yaml`]);
  assert.equal(Home.load(home.dataDir).keyForFolder(code), movedKey);
  assert.equal(git(firstBare, "rev-parse", "spex"), atFirst);
});

test("storage-38, space-91, storage-31, space-57, space-4: your own group's own repository placed at two instances on separate Git backends by their sign-ins, owing its notice at the second until continued, a peer's commit at the second removing the first's placement file drops the first's remote alone at that merge, the clone keeping its folder, the second synced and the row then at the second", async (t) => {
  const first = await startHost();
  const second = await startHost({ displayName: SECOND_NAME, person: { id: "1002", login: "bob", displayName: "Bob" } });
  const firstFolder = hostFolder(first);
  const secondFolder = hostFolder(second);
  const firstFile = `placements/${firstFolder}.yaml`;
  const home = await startHome("own-dropped", { host: first, project: false });
  t.after(() => home.stop());
  const mark = home.client.mark();
  await signIn(home, first);
  await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  await signIn(home, second);
  const own = clonePath(home.dataDir, HOST_OWN);
  // The second's sign-in places your own group's own repository there as
  // bob-spex (space-4), which owes its notice, its only member the
  // account there: that line waits for Continue while the first syncs;
  // continued, both sync (space-57).
  await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase !== "running" && repository.placements[1]?.outcome?.kind === "waiting", 30_000);
  const owed = await home.client.settle("space.sync", { repository: HOST_OWN }, 30_000);
  assert.deepEqual(owed.placements.map((line) => [line.instance, line.outcome?.kind]), [[first.url, "synced"], [second.url, "waiting"]], JSON.stringify(owed.sync));
  const both = await home.client.settle("space.sync", { repository: HOST_OWN, placement: second.url, noticed: true }, 30_000);
  assert.equal(both.sync.phase, "done", JSON.stringify(both.sync));
  assert.deepEqual(both.placements.map((line) => [line.instance, line.outcome?.kind]), [[first.url, "synced"], [second.url, "synced"]]);
  const firstBare = bareOf(first, HOST_OWN);
  const secondBare = second.bareOf("bob/bob-spex");
  const atFirst = git(firstBare, "rev-parse", "spex");

  // A peer at the second removes the first's file: at the second's merge
  // the first's remote is dropped alone, its fetched spex, upstream and
  // records with it, the clone keeping its folder; the second syncs and
  // the row reads at the second, nothing more sent to the first
  // (storage-38, space-91, storage-31).
  const removed = await peerPush(peerClone(secondBare), (dir) => rmSync(join(dir, firstFile)));
  const dropped = await home.client.settle("space.sync", { repository: HOST_OWN }, 30_000);
  assert.equal(dropped.sync.phase, "done", JSON.stringify(dropped.sync));
  assert.deepEqual([dropped.key, dropped.own, dropped.instance], [HOST_OWN, true, second.url]);
  assert.deepEqual(dropped.placements.map((line) => [line.instance, line.outcome?.kind]), [[second.url, "synced"]]);
  assert.ok(existsSync(join(own, ".git")), "the clone keeps its folder");
  assert.deepEqual(git(own, "remote").split("\n"), [secondFolder]);
  assert.equal(git(own, "for-each-ref", "--format=%(refname)", `refs/remotes/${firstFolder}`), "");
  const upstream = ((): string | null => { try { return git(own, "config", "--get", "branch.spex.remote"); } catch { return null; } })();
  assert.notEqual(upstream, firstFolder);
  assert.deepEqual(Object.keys(syncRecordsOf(home.dataDir, HOST_OWN)).filter((name) => name.includes(`:${firstFolder}:`)), []);
  assert.equal(existsSync(join(own, firstFile)), false);
  assert.ok(git(own, "rev-list", "HEAD").split("\n").includes(removed), "the second's merge stands");
  assert.equal(git(secondBare, "rev-parse", "spex"), git(own, "rev-parse", "HEAD"));
  assert.equal(git(firstBare, "rev-parse", "spex"), atFirst, "the first's host repository left as it stands");
});

test("space-91, storage-41, storage-12: a placement's file a merge makes unreadable drops nothing: the placement stays and syncs, the file reported as nonblocking, and the catch-up carries it to that placement too", async (t) => {
  const first = await startHost();
  const second = await startHost({ displayName: SECOND_NAME, person: { id: "1002", login: "bob", displayName: "Bob" } });
  const firstFolder = hostFolder(first);
  const secondFolder = hostFolder(second);
  const firstFile = `placements/${firstFolder}.yaml`;
  const { home, key, clone } = await projectAt("reconcile-unreadable", [first, second]);
  t.after(() => home.stop());
  attachByHand(home, key, second);
  const both = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.deepEqual(both.placements.map((line) => [line.instance, line.outcome?.kind]), [[first.url, "synced"], [second.url, "synced"]], JSON.stringify(both.sync));
  const firstBare = bareOf(first, key);
  const secondBare = second.bareOf("acme/atlas-spex");

  // A peer at the second rewrites the first's file as no encoding reads.
  const unreadable = "format: 2\ninstance: elsewhere\n";
  await peerPush(peerClone(secondBare), (dir) => { writeFileSync(join(dir, firstFile), unreadable); });
  const merged = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(merged.sync.phase, "done", JSON.stringify(merged.sync));
  assert.deepEqual(merged.placements.map((line) => [line.instance, line.outcome?.kind]), [[first.url, "synced"], [second.url, "synced"]]);
  assert.deepEqual(git(clone, "remote").split("\n"), [firstFolder, secondFolder]);
  assert.equal(readFileSync(join(clone, firstFile), "utf8"), unreadable);
  const diagnostics = await home.client.expectOk("storage.diagnostics", {});
  assert.deepEqual(
    diagnostics.filter((diagnostic) => diagnostic.file === join(clone, firstFile)).map((diagnostic) => [diagnostic.reason, diagnostic.blocking]),
    [["does not read as format: 1, instance and id, one line each", false]],
  );
  // The catch-up carried the merge to the first, the file as it stands.
  const head = git(clone, "rev-parse", "HEAD");
  assert.deepEqual([git(firstBare, "rev-parse", "spex"), git(secondBare, "rev-parse", "spex")], [head, head]);
  assert.equal(`${git(firstBare, "show", `spex:${firstFile}`)}\n`, unreadable);

  // The Sync after still syncs the first, writing nothing over the file
  // (storage-37).
  writeFileSync(join(clone, "later.md"), "after the merge\n");
  const later = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.deepEqual([later.sync.phase, ...later.placements.map((line) => line.outcome?.kind)], ["done", "synced", "synced"]);
  assert.equal(readFileSync(join(clone, firstFile), "utf8"), unreadable);
  assert.equal(git(firstBare, "rev-parse", "spex"), git(clone, "rev-parse", "HEAD"));
});

test("space-101, space-98, space-15, space-31, storage-38, space-7, space-29: for a project placed at the first and the third of three instances, the first two over one Git backend, the first lacking a record the third holds — space.leave refused at an instance it holds no placement at, at one the home does not list and for your own group's own repository — space.leave of the third, fetched first, stops unreceived naming the count, the placement kept; of the first, while a lease taken out of band stands beneath, is refused whole naming the session with Retry, and once it is released moves the clone under the third's folder with its pair re-keyed, its file deleted as a local change; and of the third, the last, sent confirmed after it stops naming every unit, moves the clone under your own group's folder, local only, nothing at either host changed", async (t) => {
  const first = await startHost();
  const second = await startHost({ gitBackend: first, displayName: SECOND_NAME });
  const third = await startHost({ displayName: THIRD_NAME });
  const firstFolder = hostFolder(first);
  const thirdFolder = hostFolder(third);
  const firstFile = `placements/${firstFolder}.yaml`;
  const thirdFile = `placements/${thirdFolder}.yaml`;
  const { home, key, code, clone } = await projectAt("leave-each", [first, second, third]);
  t.after(() => home.stop());
  // A record every placement receives, and the project placed in the
  // third's acme (space-97).
  writeFileSync(join(clone, "notes.md"), "everywhere\n");
  const placed = await home.client.settle("space.place", { repository: key, choice: { kind: "create", instance: third.url, groupId: "2002", name: "atlas" }, noticed: true }, 30_000);
  assert.equal(placed.sync.phase, "done", JSON.stringify(placed.sync));
  assert.deepEqual(placed.placements.map((line) => [line.instance, line.outcome?.kind]), [[first.url, "synced"], [third.url, "synced"]]);
  const firstBare = bareOf(first, key);
  const thirdBare = third.bareOf("acme/atlas-spex");
  const atFirst = git(firstBare, "rev-parse", "spex");
  // A peer at the third adds a record the first lacks.
  const atThird = await peerPush(peerClone(thirdBare), (dir) => { writeFileSync(join(dir, "peer.md"), "the third's alone\n"); });

  // Refused before anything runs: an instance the clone holds no
  // placement at, one the home does not list, and your own group's own
  // spex repository (space-29).
  await home.client.expectError("space.leave", { repository: key, instance: second.url }, "invalid_request", /^atlas-spex holds no such placement$/);
  await home.client.expectError("space.leave", { repository: key, instance: "https://unlisted.example" }, "not_found");
  await home.client.expectError("space.leave", { repository: HOST_OWN, instance: first.url }, "invalid_request", /^ada-spex holds a group's records/);

  // The third left: fetched first, the record it holds that no remaining
  // placement holds stops the leave, naming the count, nothing dropped
  // (space-98).
  const unreceived = await home.client.settle("space.leave", { repository: key, instance: third.url }, 30_000);
  assert.deepEqual(unreceived.sync, { phase: "stopped", op: "leave", step: "check", cause: "unreceived", message: "1 record has reached no other placement", guidance: "Confirm to remove it anyway.", retry: true, count: 1 });
  assert.equal(git(clone, "rev-parse", `refs/remotes/${thirdFolder}/spex`), atThird, "the third fetched first");
  assert.deepEqual(git(clone, "remote").split("\n"), [firstFolder, thirdFolder]);
  assert.ok(existsSync(join(clone, thirdFile)), "its file kept");
  assert.deepEqual(unreceived.placements.map((line) => line.instance), [first.url, third.url]);

  // The first left while a writer of another process holds the clone:
  // its drop, which moves the clone, is refused whole, naming the
  // session, with Retry, nothing dropped or moved (space-98, storage-38).
  const sessions = createSessionStore({ sessionsDir: join(clone, "sessions") });
  await sessions.prepare();
  const lease = randomUUID();
  const live = await sessions.acquireManagement(lease);
  let released = false;
  try {
    const leased = await home.client.settle("space.leave", { repository: key, instance: first.url }, 30_000);
    assert.ok(leased.sync.phase === "stopped" && leased.sync.op === "leave" && leased.sync.step === "check" && leased.sync.cause === "lease" && leased.sync.retry && leased.sync.message.includes(lease.slice(0, 8)), JSON.stringify(leased.sync));
    assert.deepEqual(git(clone, "remote").split("\n"), [firstFolder, thirdFolder]);
    assert.ok(existsSync(join(clone, firstFile)), "its file kept");
    assert.equal(Home.load(home.dataDir).keyForFolder(code), key);
    await live.release();
    released = true;
  } finally { if (!released) await live.release(); }

  // Released, the first left: dropped with its remote, id, fetched spex
  // and records, and its file deleted, a local change the clone's next
  // sync carries; the clone moved to its path at the third with its pair
  // (space-98, storage-38, space-7).
  const movedKey = hostKey(third, "acme/atlas-spex");
  const movedClone = clonePath(home.dataDir, movedKey);
  let mark = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.leave", { repository: key, instance: first.url }), { accepted: true });
  const moved = await home.client.waitRepository(mark, movedKey, (repository) => repository.sync.phase !== "running", 30_000);
  assert.deepEqual([moved.sync, moved.instance, moved.placements.map((line) => line.instance)], [{ phase: "idle" }, third.url, [third.url]], JSON.stringify(moved));
  assert.ok(existsSync(join(movedClone, ".git")) && !existsSync(clone), "moved under the third's folder");
  assert.equal(Home.load(home.dataDir).keyForFolder(code), movedKey, "its pair re-keyed");
  assert.deepEqual(git(movedClone, "remote").split("\n"), [thirdFolder]);
  assert.throws(() => git(movedClone, "rev-parse", "-q", "--verify", `refs/remotes/${firstFolder}/spex`));
  assert.equal(existsSync(join(movedClone, firstFile)), false, "its file deleted");
  assert.ok(moved.local.some((unit) => unit.unit === firstFile && unit.change === "deleted"), JSON.stringify(moved.local));
  assert.deepEqual(Object.keys({ ...syncRecordsOf(home.dataDir, key), ...syncRecordsOf(home.dataDir, movedKey) }).filter((name) => name.includes(`:${firstFolder}:`)), []);
  assert.equal(git(firstBare, "rev-parse", "spex"), atFirst, "nothing at the first changed");

  // The third, the last, left: every record unit it or the clone holds —
  // the environment, notes.md and peer.md — reached no remaining
  // placement, which stops it; sent confirmed, it is dropped and the clone
  // moves under your own group's folder, local only, its records kept
  // (space-98, storage-38).
  const every = await home.client.settle("space.leave", { repository: movedKey, instance: third.url }, 30_000);
  assert.deepEqual(every.sync, { phase: "stopped", op: "leave", step: "check", cause: "unreceived", message: "3 records have reached no other placement", guidance: "Confirm to remove it anyway.", retry: true, count: 3 });
  assert.deepEqual(git(movedClone, "remote").split("\n"), [thirdFolder]);
  const localKey = `${LOGIN}/atlas-spex`;
  const localClone = clonePath(home.dataDir, localKey);
  mark = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.leave", { repository: movedKey, instance: third.url, confirmed: true }), { accepted: true });
  const local = await home.client.waitRepository(mark, localKey, (repository) => repository.sync.phase !== "running", 30_000);
  assert.deepEqual([local.sync, local.state, local.instance, local.id, local.placements], [{ phase: "idle" }, "local-only", null, null, []], JSON.stringify(local));
  assert.ok(existsSync(join(localClone, ".git")) && !existsSync(movedClone), "moved under your own group's folder");
  assert.equal(Home.load(home.dataDir).keyForFolder(code), localKey);
  assert.equal(git(localClone, "remote"), "");
  assert.equal(existsSync(join(localClone, thirdFile)), false, "its file deleted");
  assert.equal(readFileSync(join(localClone, "notes.md"), "utf8"), "everywhere\n", "its records kept");
  assert.equal(git(thirdBare, "rev-parse", "spex"), atThird, "nothing at the third changed");
});

test("space-101, space-98, space-60, space-61, storage-36, storage-38: with the first of three instances signed out, the first two over one Git backend, space.leave of the first for a project placed there alone, whose repository the second lists, renames its remote to the second's folder and rewrites its file, the clone following it there, nothing fetched or dropped; a project placed at the first and at the second reads its first placement unreachable, its Sync's Check following nothing, and its space.leave of the first stops for the placement it could not read, then, sent confirmed, drops it, moving the clone to its path at the second", async (t) => {
  const first = await startHost();
  const second = await startHost({ gitBackend: first, displayName: SECOND_NAME });
  const third = await startHost({ displayName: THIRD_NAME });
  const firstFolder = hostFolder(first);
  const secondFolder = hostFolder(second);
  const secondFile = `placements/${secondFolder}.yaml`;
  const { home, key: atlas, clone: atlasClone } = await projectAt("leave-signed-out", [first, second, third]);
  t.after(() => home.stop());
  // A second project in the person's namespace at the first, which the
  // second lists under one id (git-host-12).
  const beaconCode = gitFolder("beacon");
  const { key: local } = await addFolder(home, beaconCode);
  let mark = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: first.url, groupId: null, name: "beacon" } });
  const beacon = hostKey(first, `${LOGIN}/beacon-spex`);
  const beaconId = (await home.client.waitRepository(mark, beacon, (repository) => repository.sync.phase === "done", 30_000)).id as string;
  // The first project placed in the second's acme as well, a group of the
  // second's own under its own id (space-97).
  const acme = second.script.groups.find((group) => group.kind === "group" && group.fullPath === "acme");
  assert.ok(acme, "the second's acme");
  const placed = await home.client.settle("space.place", { repository: atlas, choice: { kind: "create", instance: second.url, groupId: acme.id, name: "atlas" }, noticed: true }, 30_000);
  assert.deepEqual(placed.placements.map((line) => [line.instance, line.outcome?.kind]), [[first.url, "synced"], [second.url, "synced"]], JSON.stringify(placed.sync));
  await refreshed(home);
  await signOut(home, first);

  // The first left for the project placed there alone: the second lists
  // its host repository, so its remote is renamed to the second's folder
  // with its id and last sync, its file rewritten to the second's, and the
  // clone follows it to its path there — nothing fetched or dropped
  // (space-98, space-60, storage-36).
  const followed = hostKey(second, `${LOGIN}/beacon-spex`);
  const followedClone = clonePath(home.dataDir, followed);
  const transports = first.script.transportCredentials.length;
  mark = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.leave", { repository: beacon, instance: first.url }), { accepted: true });
  const renamed = await home.client.waitRepository(mark, followed, (repository) => repository.sync.phase !== "running", 30_000);
  assert.deepEqual([renamed.sync, renamed.instance, renamed.id, renamed.placements.map((line) => [line.instance, line.id])], [{ phase: "idle" }, second.url, beaconId, [[second.url, beaconId]]], JSON.stringify(renamed));
  assert.ok(existsSync(join(followedClone, ".git")) && !existsSync(clonePath(home.dataDir, beacon)), "the clone follows its key placement");
  assert.equal(Home.load(home.dataDir).keyForFolder(beaconCode), followed);
  assert.deepEqual(git(followedClone, "remote").split("\n"), [secondFolder]);
  assert.equal(git(followedClone, "config", "--get", `remote.${secondFolder}.spexId`), beaconId);
  assert.deepEqual(readdirSync(join(followedClone, "placements")), [`${secondFolder}.yaml`]);
  assert.equal(readFileSync(join(followedClone, secondFile), "utf8"), placementBytes(second.url, beaconId));
  assert.ok(syncRecordsOf(home.dataDir, followed)[`sync:${followed}:${secondFolder}:last`], "its last sync kept under its remote");
  assert.deepEqual(first.script.transportCredentials.slice(transports), [], "nothing fetched");

  // The project placed at both reads its first placement unreachable,
  // its Sync's Check following nothing, as the clone holds a placement at
  // the second (space-61, space-60).
  const stranded = await home.client.settle("space.sync", { repository: atlas }, 30_000);
  assert.equal(stranded.sync.phase, "done", JSON.stringify(stranded.sync));
  const line = placementOf(stranded, first.url);
  assert.deepEqual([line.state, line.reason, line.outcome?.kind], ["unreachable", "Sign in again", "stopped"], JSON.stringify(line));
  assert.equal(placementOf(stranded, second.url).outcome?.kind, "synced");
  assert.deepEqual(git(atlasClone, "remote").split("\n"), [firstFolder, secondFolder]);

  // Its first left: a placement it cannot read stops the leave, saying
  // records pushed there since the last sync may be left behind, nothing
  // dropped; sent confirmed, it is dropped, the clone moving to its path
  // at the second (space-98, storage-38).
  const unread = await home.client.settle("space.leave", { repository: atlas, instance: first.url }, 30_000);
  assert.deepEqual(unread.sync, { phase: "stopped", op: "leave", step: "check", cause: "reauth", message: `Records pushed to ${FIRST_NAME} since the last sync may be left behind`, guidance: "Confirm to remove it anyway.", retry: true });
  assert.deepEqual(git(atlasClone, "remote").split("\n"), [firstFolder, secondFolder]);
  const atSecond = hostKey(second, "acme/atlas-spex");
  const atSecondClone = clonePath(home.dataDir, atSecond);
  mark = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.leave", { repository: atlas, instance: first.url, confirmed: true }), { accepted: true });
  const dropped = await home.client.waitRepository(mark, atSecond, (repository) => repository.sync.phase !== "running", 30_000);
  assert.deepEqual([dropped.sync, dropped.instance, dropped.placements.map((each) => each.instance)], [{ phase: "idle" }, second.url, [second.url]], JSON.stringify(dropped));
  assert.ok(existsSync(join(atSecondClone, ".git")) && !existsSync(atlasClone), "moved to its path at the second");
  assert.deepEqual(git(atSecondClone, "remote").split("\n"), [secondFolder]);
  assert.deepEqual(readdirSync(join(atSecondClone, "placements")), [`${secondFolder}.yaml`]);
});
