// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A spex repository's placements as the Groups state shows them
// (DR-128): real cores on scratch homes against stand-in Git hosts, on
// separate Git backends and over one. A host repository a placement file
// of a clone here names, at a signed-in instance listing it, stands as a
// line of that clone's row — "Not on this device" with the listing's
// path, members and rights — never as a row of its own offering Join,
// and `space.join` of it is refused; the row stands under its key
// placement's group, every other group a placement of it stands in
// showing one line naming it; the row carries each instance its files
// name; and a host repository two instances over one Git backend list
// is one placement (git-host-5, space-87, space-1, space-61, space-29,
// space-30). Members, Share, removing a member and Move act on the
// placement each command names, at the instance governing it, only a
// move of the key placement moving the clone, at its next sync
// (git-host-8, git-host-16, git-host-17, git-host-20, space-60) —
// hermetic, on loopback alone, in a file budget of its own.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalOrigin } from "./instance.js";
import { encodePlacementFile, PLACEMENTS_DIR } from "./placements.js";
import type { GroupsState } from "./protocol.js";
import type { StandinGroup } from "./testing/standin-host.js";
import { bareOf, clonePath, createSpaceHarness, hostFolder, hostKey, instanceOf, placementOf, repositoryOf, rowsOf } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
const { git, gitFolder, addFolder, bareRepo, peerClone, peerPush, attachByHand, startHome, startHost, signIn, signOut } = fixture;
test.after(() => fixture.dispose());

/** The stand-in's person, and your own group's repository once signed in. */
const LOGIN = "ada";
const HOST_OWN = `${LOGIN}/${LOGIN}-spex`;
const SECOND_NAME = "Second stand-in";

/** A Refresh of every signed-in instance, landed. */
async function refreshed(home: Awaited<ReturnType<typeof startHome>>): Promise<GroupsState> {
  const before = await home.client.expectOk("space.get", {});
  const mark = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  return home.client.waitSpace(mark, (state) => state.instances.every((instance) => !instance.signedIn
    || (instance.read.phase === "idle" && (instance.readAt ?? 0) > (instanceOf(before, instance.origin)?.readAt ?? 0))), 30_000);
}

/** The entry of an instance's heading at a path in it (space-30). */
function entryAt(state: GroupsState, origin: string, fullPath: string) {
  const entry = instanceOf(state, origin)?.groups.find((group) => group.fullPath === fullPath);
  assert.ok(entry, `${fullPath} under ${origin}`);
  return entry;
}

test("git-host-26, git-host-5, space-87, space-61, space-1, space-29, space-30, space-62, storage-41: a repository the second lists, shown with Join while no clone here names it, becomes — once a placement file of a clone here names it, brought by that clone's merge — that clone's line \"Not on this device\" with the listing's path, members and rights, and no row of its own, `space.join` of it refused; the row standing once under the first's acme, reachable by its placement there, the second's workshop naming it in one line, and the row carrying each instance its files name; once its remote is added, its line held and the workshop still naming the row in one line", async (t) => {
  const first = await startHost();
  const second = await startHost({ displayName: SECOND_NAME, person: { id: "1002", login: "bob", displayName: "Bob" } });
  // A group of the second's with another member besides the account.
  const workshop: StandinGroup = { id: "2900", fullPath: "workshop", name: "Workshop", kind: "group", members: [{ id: "1002", login: "bob", displayName: "Bob", role: "Owner" }, { id: "1003", login: "carol", displayName: "Carol", role: "Developer" }] };
  second.script.groups.push(workshop);
  const home = await startHome("filed-lines", { host: first, project: false });
  t.after(() => home.stop());
  let mark = home.client.mark();
  await signIn(home, first);
  await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  await signIn(home, second);
  const { key: local } = await addFolder(home, gitFolder("atlas"));
  mark = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: first.url, groupId: "2002", name: "atlas" } });
  const key = hostKey(first, "acme/atlas-spex");
  const created = await home.client.waitRepository(mark, key, (repository) => repository.sync.phase === "done", 30_000);
  const clone = clonePath(home.dataDir, key);
  const firstOrigin = canonicalOrigin(first.url);
  const secondOrigin = canonicalOrigin(second.url);
  // The pick wrote its own placement's file (storage-36).
  assert.deepEqual(created.placedAt, [firstOrigin]);

  // Another device placed the project in the second's workshop. Until
  // a file here names it, the second's listing is a row of its own,
  // "Not on this device", offering Join (space-61, space-63).
  const there = second.script.addRepository({ group: "workshop", name: "atlas-spex" });
  const absentKey = hostKey(second, "workshop/atlas-spex");
  const before = await refreshed(home);
  const absent = repositoryOf(before, absentKey);
  assert.equal(absent.state, "absent");
  assert.equal(absent.placements.length, 1);
  const listed = absent.placements[0];
  assert.deepEqual({ instance: listed.instance, path: listed.path, id: listed.id, attached: listed.attached, state: listed.state, members: listed.members }, { instance: secondOrigin, path: "workshop/atlas-spex", id: there.id, attached: false, state: "absent", members: 2 });

  // That device's file reaches this clone through the first: a peer's
  // commit the next Sync merges (storage-36, storage-41: read as the
  // files stand).
  const secondFolder = hostFolder(second);
  const peer = peerClone(bareOf(first, key));
  await peerPush(peer, (dir) => {
    mkdirSync(join(dir, PLACEMENTS_DIR), { recursive: true });
    writeFileSync(join(dir, PLACEMENTS_DIR, `${secondFolder}.yaml`), encodePlacementFile(secondOrigin, there.id));
  });
  const synced = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(synced.sync.phase, "done", JSON.stringify(synced.sync));
  const state = await home.client.expectOk("space.get", {});

  // The second's listing is now the clone's line, not on this device,
  // with that listing's path, members, visibility and rights; no row of
  // its own stands, so no Join is offered (git-host-5, space-87,
  // space-61, space-30).
  const row = repositoryOf(state, key);
  assert.deepEqual(row.placements.map((line) => [line.instance, line.attached, line.state]), [[firstOrigin, true, "reachable"], [secondOrigin, false, "absent"]]);
  const filed = placementOf(row, second.url);
  assert.deepEqual(
    { path: filed.path, id: filed.id, reason: filed.reason, waiting: filed.waiting, members: filed.members, visibility: filed.visibility, can: filed.can, branch: filed.branch, lastSync: filed.lastSync, outcome: filed.outcome },
    { path: listed.path, id: there.id, reason: null, waiting: null, members: listed.members, visibility: listed.visibility, can: listed.can, branch: null, lastSync: null, outcome: null },
  );
  assert.ok(!rowsOf(state).some((repository) => repository.key === absentKey), "no row of its own");
  // Two Git systems mint ids alike: the second's by its instance.
  assert.deepEqual(rowsOf(state).filter((repository) => repository.placements.some((line) => line.instance === secondOrigin && line.id === there.id)).map((repository) => repository.key), [key]);
  // The row reads its placement there alone: reachable, governed by the
  // first, under the first's acme (space-61, space-1).
  assert.equal(row.state, "reachable");
  assert.equal(row.governing, firstOrigin);
  assert.deepEqual(entryAt(state, first.url, "acme").repositories.map((repository) => repository.key), [key]);
  assert.deepEqual(entryAt(state, first.url, "acme").placed, []);
  // The second's workshop shows one line naming the row, with no
  // repository of its own (space-1, space-30).
  const named = entryAt(state, second.url, "workshop");
  assert.deepEqual(named.placed, [{ key, name: "atlas-spex" }]);
  assert.deepEqual(named.repositories, []);
  // Every instance its files name, held here or not (space-62).
  assert.deepEqual([...row.placedAt].sort(), [firstOrigin, secondOrigin].sort());
  // Join of it is refused: it is a placement of the clone's, to attach
  // on its row (space-29, space-87).
  await home.client.expectError("space.join", { instance: second.url, hostId: there.id }, "invalid_request", /^atlas-spex is a placement of atlas-spex not on this device yet$/);
  assert.ok(!rowsOf(await home.client.expectOk("space.get", {})).some((repository) => repository.key === absentKey), "the refused join cloned nothing");

  // Its remote added as a device holding it adds it (storage-34): the
  // line is held, read from the second's listing, the workshop still
  // naming the row in one line, and Join refused as on this device.
  const url = `${second.gitOrigin}/${second.storage}/workshop/atlas-spex.git`;
  git(clone, "remote", "add", secondFolder, url);
  git(clone, "config", `remote.${secondFolder}.spexId`, there.id);
  const attached = await home.client.expectOk("space.get", {});
  const held = repositoryOf(attached, key);
  assert.deepEqual(held.placements.map((line) => [line.instance, line.attached, line.state]), [[firstOrigin, true, "reachable"], [secondOrigin, true, "reachable"]]);
  assert.deepEqual({ path: placementOf(held, second.url).path, members: placementOf(held, second.url).members }, { path: "workshop/atlas-spex", members: 2 });
  assert.deepEqual(entryAt(attached, second.url, "workshop").placed, [{ key, name: "atlas-spex" }]);
  assert.deepEqual(entryAt(attached, first.url, "acme").repositories.map((repository) => repository.key), [key]);
  assert.ok(!rowsOf(attached).some((repository) => repository.key === absentKey), "no row of its own");
  await home.client.expectError("space.join", { instance: second.url, hostId: there.id }, "invalid_request", /^atlas-spex is on this device already$/);
});

test("git-host-26, git-host-5, space-87, space-1, space-29, space-62: a host repository both of two instances over one Git backend list is one placement — a clone holding it through the first, with a file for the second naming it too, holds one line, no line or row offering it through the second, no other group naming the row, Join through the second refused as on this device, the row carrying both instances its files name", async (t) => {
  const first = await startHost();
  const second = await startHost({ gitBackend: first, displayName: SECOND_NAME });
  const home = await startHome("one-placement", { host: first, project: false });
  t.after(() => home.stop());
  let mark = home.client.mark();
  await signIn(home, first);
  await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  await signIn(home, second);
  // In the person's namespace at the first, which both instances list
  // under one id (git-host-12).
  const { key: local } = await addFolder(home, gitFolder("team"));
  mark = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: first.url, groupId: null, name: "team" } });
  const key = hostKey(first, `${LOGIN}/team-spex`);
  const created = await home.client.waitRepository(mark, key, (repository) => repository.sync.phase === "done", 30_000);
  const id = created.id as string;
  const clone = clonePath(home.dataDir, key);
  const firstOrigin = canonicalOrigin(first.url);
  const secondOrigin = canonicalOrigin(second.url);
  // A file for the second naming the same host repository, as a device
  // that joined it through the second writes (storage-36).
  writeFileSync(join(clone, PLACEMENTS_DIR, `${hostFolder(second)}.yaml`), encodePlacementFile(secondOrigin, id));
  const state = await refreshed(home);
  const row = repositoryOf(state, key);
  assert.deepEqual(row.placements.map((line) => [line.instance, line.attached, line.id]), [[firstOrigin, true, id]]);
  assert.deepEqual([...row.placedAt].sort(), [firstOrigin, secondOrigin].sort());
  assert.deepEqual(rowsOf(state).filter((repository) => repository.id === id || repository.placements.some((line) => line.id === id)).map((repository) => repository.key), [key]);
  assert.deepEqual(entryAt(state, first.url, LOGIN).repositories.map((repository) => repository.key), [key]);
  assert.ok(instanceOf(state, second.url)?.groups.every((group) => group.placed.length === 0 && group.repositories.every((repository) => repository.id !== id)), "nothing at the second stands for it");
  await home.client.expectError("space.join", { instance: second.url, hostId: id }, "invalid_request", /^team-spex is on this device already$/);
});

test("git-host-26, git-host-8, git-host-16, git-host-17, git-host-20, space-29, space-62, space-69, space-72, space-78, space-60, space-1: members are read from, a member added to and removed from, and the repository moved at the instance of the placement each command names, its first where none is named, nothing asked of the other; a move of the second leaves the key and the clone, the group naming the row following it at once; a move of the first stands the row under its new group at once and moves the clone at its next sync, the second's placement kept; an instance at which the spex repository holds no placement is refused, one the home does not list not found, and the second signed out refuses acts at it alone", async (t) => {
  const first = await startHost();
  const second = await startHost({ displayName: SECOND_NAME, person: { id: "1002", login: "bob", displayName: "Bob" } });
  const home = await startHome("act-each", { host: first, project: false });
  t.after(() => home.stop());
  let mark = home.client.mark();
  await signIn(home, first);
  await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  await signIn(home, second);
  const { key: local } = await addFolder(home, gitFolder("atlas"));
  mark = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: first.url, groupId: "2002", name: "atlas" } });
  const key = hostKey(first, "acme/atlas-spex");
  const created = await home.client.waitRepository(mark, key, (repository) => repository.sync.phase === "done", 30_000);
  const firstId = created.id as string;
  const clone = clonePath(home.dataDir, key);
  // Placed in the second's acme as a device holding it placed it, and a
  // repository the first lists that no clone here holds.
  const placed = attachByHand(home, key, second, "acme");
  first.script.addRepository({ group: "acme", name: "notes-spex" });
  const notesKey = hostKey(first, "acme/notes-spex");
  const read = await refreshed(home);
  assert.deepEqual(repositoryOf(read, key).placements.map((line) => [line.instance, line.path, line.attached]), [[first.url, "acme/atlas-spex", true], [second.url, "acme/atlas-spex", true]]);
  assert.deepEqual(entryAt(read, second.url, "acme").placed, [{ key, name: "atlas-spex" }]);

  const logins = (reply: { members: { login: string }[] }): string[] => reply.members.map((member) => member.login).sort();
  /** The members, transfer and repository requests an instance's API
   * received at or after `from`. */
  const acts = (host: typeof first, from: number): string[] => host.script.requests.slice(from)
    .filter((request) => /^\/api\/v1\/host\/repositories\//.test(request.path))
    .map((request) => `${request.method} ${request.path}`);
  const repositoryAt = (host: typeof first, id: string) => host.script.repositories.find((repository) => repository.id === id);

  // The second's placement's members are read from the second — bob
  // there — and the first's from the first, where none is named too;
  // the instance not named is asked nothing (git-host-8, space-62).
  let fromFirst = first.script.requests.length;
  assert.deepEqual(logins(await home.client.expectOk("space.members", { repository: key, instance: second.url })), ["bob"]);
  assert.deepEqual(acts(first, fromFirst), []);
  let fromSecond = second.script.requests.length;
  assert.deepEqual(logins(await home.client.expectOk("space.members", { repository: key, instance: first.url })), [LOGIN]);
  assert.deepEqual(logins(await home.client.expectOk("space.members", { repository: key })), [LOGIN]);
  assert.deepEqual(acts(second, fromSecond), []);

  // A member added at the second joins the second's repository alone,
  // and removed there leaves it; one added where none is named joins
  // the first's (git-host-16, git-host-17, space-69, space-72).
  fromFirst = first.script.requests.length;
  const shared = await home.client.expectOk("space.share", { repository: key, instance: second.url, login: "grace", role: "developer" });
  assert.deepEqual(logins(shared), ["bob", "grace"]);
  assert.ok(repositoryAt(second, placed.id)?.members.some((member) => member.login === "grace" && member.role === "Developer"));
  assert.ok(first.script.repositories.every((repository) => !repository.members.some((member) => member.login === "grace")), "nothing added at the first");
  const unshared = await home.client.expectOk("space.unshare", { repository: key, instance: second.url, login: "grace" });
  assert.deepEqual(logins(unshared), ["bob"]);
  assert.ok(!repositoryAt(second, placed.id)?.members.some((member) => member.login === "grace"));
  assert.deepEqual(acts(first, fromFirst), []);
  fromSecond = second.script.requests.length;
  assert.deepEqual(logins(await home.client.expectOk("space.share", { repository: key, login: "alan", role: "reporter" })), [LOGIN, "alan"]);
  assert.ok(repositoryAt(first, firstId)?.members.some((member) => member.login === "alan"));
  assert.ok(!repositoryAt(second, placed.id)?.members.some((member) => member.login === "alan"));
  assert.deepEqual(logins(await home.client.expectOk("space.unshare", { repository: key, instance: first.url, login: "alan" })), [LOGIN]);
  assert.deepEqual(acts(second, fromSecond), []);

  // An instance at which the spex repository holds no placement is
  // refused — a clone holding only the path placement, and a repository
  // not on this device, whose one placement is the first's — and one the
  // home does not list is not found (space-29).
  const { key: solo } = await addFolder(home, gitFolder("solo"));
  await home.client.expectOk("space.remote.set", { repository: solo, url: bareRepo() });
  const noPlacement = /^solo-spex holds no such placement$/;
  await home.client.expectError("space.members", { repository: solo, instance: second.url }, "invalid_request", noPlacement);
  await home.client.expectError("space.share", { repository: solo, instance: second.url, login: "grace", role: "developer" }, "invalid_request", noPlacement);
  await home.client.expectError("space.unshare", { repository: solo, instance: second.url, login: "grace" }, "invalid_request", noPlacement);
  await home.client.expectError("space.members", { repository: notesKey, instance: second.url }, "invalid_request", /^notes-spex holds no such placement$/);
  assert.deepEqual(logins(await home.client.expectOk("space.members", { repository: notesKey, instance: first.url })), [LOGIN]);
  await home.client.expectError("space.members", { repository: key, instance: "http://127.0.0.1:9" }, "not_found");

  // A move of the second asks the second alone: a name its group holds
  // there is refused in its words, nothing moved; into your namespace
  // there it moves the second's repository, the line and the group
  // naming the row following it at once, the key, the clone and the
  // first's repository staying (git-host-20, space-78, space-1).
  second.script.addRepository({ group: "acme/research", name: "atlas-spex" });
  fromFirst = first.script.requests.length;
  await home.client.expectError("space.repository.move", { repository: key, instance: second.url, groupId: "2003" }, "invalid_request", /^acme\/research already holds atlas-spex$/);
  assert.equal(repositoryAt(second, placed.id)?.group.fullPath, "acme");
  const movedThere = await home.client.expectOk("space.repository.move", { repository: key, instance: second.url, groupId: null });
  assert.deepEqual(movedThere, { repository: { id: placed.id, fullPath: "bob/atlas-spex" } });
  assert.deepEqual(acts(first, fromFirst), []);
  assert.equal(repositoryAt(first, firstId)?.group.fullPath, "acme");
  const afterSecond = await home.client.expectOk("space.get", {});
  const rowThen = repositoryOf(afterSecond, key);
  assert.deepEqual(rowThen.placements.map((line) => [line.instance, line.path]), [[first.url, "acme/atlas-spex"], [second.url, "bob/atlas-spex"]]);
  assert.deepEqual(entryAt(afterSecond, second.url, "bob").placed, [{ key, name: "atlas-spex" }]);
  assert.deepEqual(entryAt(afterSecond, second.url, "acme").placed, []);
  assert.deepEqual(entryAt(afterSecond, first.url, "acme").repositories.map((repository) => repository.key), [key, notesKey]);
  assert.ok(existsSync(clone), "a move of the second moves no clone");

  // A move of the first asks the first alone: the row stands under its
  // new group at once, its key and clone unchanged (git-host-20,
  // space-78, space-1).
  fromSecond = second.script.requests.length;
  const movedHere = await home.client.expectOk("space.repository.move", { repository: key, instance: first.url, groupId: "2003" });
  assert.deepEqual(movedHere, { repository: { id: firstId, fullPath: "acme/research/atlas-spex" } });
  assert.deepEqual(acts(second, fromSecond), []);
  assert.equal(repositoryAt(first, firstId)?.group.fullPath, "acme/research");
  assert.equal(repositoryAt(second, placed.id)?.group.fullPath, "bob");
  const afterFirst = await home.client.expectOk("space.get", {});
  assert.deepEqual(entryAt(afterFirst, first.url, "acme/research").repositories.map((repository) => repository.key), [key]);
  assert.ok(!entryAt(afterFirst, first.url, "acme").repositories.some((repository) => repository.key === key), "no longer under its former group");
  assert.equal(repositoryOf(afterFirst, key).key, key);
  assert.ok(existsSync(clone), "the move moves no clone of its own");

  // Its next Sync moves the clone under the first's new group, takes
  // the URL each instance hands over, and syncs both placements, the
  // second's kept (space-60, space-78).
  const movedKey = hostKey(first, "acme/research/atlas-spex");
  mark = home.client.mark();
  await home.client.expectOk("space.sync", { repository: key });
  const synced = await home.client.waitRepository(mark, movedKey, (repository) => repository.sync.phase !== "running", 30_000);
  assert.equal(synced.sync.phase, "done", JSON.stringify(synced.sync));
  assert.deepEqual(synced.placements.map((line) => [line.instance, line.path, line.outcome?.kind]), [[first.url, "acme/research/atlas-spex", "synced"], [second.url, "bob/atlas-spex", "synced"]]);
  const movedClone = clonePath(home.dataDir, movedKey);
  assert.ok(existsSync(movedClone) && !existsSync(clone), "the clone moved under the first's new group");
  assert.match(git(movedClone, "config", "--get", `remote.${hostFolder(first)}.url`), /\/acme\/research\/atlas-spex\.git$/);
  assert.match(git(movedClone, "config", "--get", `remote.${hostFolder(second)}.url`), /\/bob\/atlas-spex\.git$/);
  assert.equal(git(movedClone, "config", "--get", `remote.${hostFolder(second)}.spexId`), placed.id);
  assert.equal(git(second.bareOf("bob/atlas-spex"), "rev-parse", "spex"), git(movedClone, "rev-parse", "HEAD"));
  assert.deepEqual(entryAt(await home.client.expectOk("space.get", {}), second.url, "bob").placed, [{ key: movedKey, name: "atlas-spex" }]);

  // The second signed out, acts at its placement are refused; the
  // first's still read (space-29).
  await signOut(home, second);
  await home.client.expectError("space.members", { repository: movedKey, instance: second.url }, "invalid_request", /^Sign in first$/);
  await home.client.expectError("space.share", { repository: movedKey, instance: second.url, login: "grace", role: "developer" }, "invalid_request", /^Sign in first$/);
  await home.client.expectError("space.repository.move", { repository: movedKey, instance: second.url, groupId: "2002" }, "invalid_request", /^Sign in first$/);
  assert.deepEqual(logins(await home.client.expectOk("space.members", { repository: movedKey })), [LOGIN]);
});
