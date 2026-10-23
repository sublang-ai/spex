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
// (git-host-8, git-host-16, git-host-17, git-host-20, space-60). Place
// creates or joins a placement at another instance, asking that
// instance alone, adds its remote and id and writes its file, then syncs
// the clone, that placement among its placements, its notice owed there
// alone; a creation left waiting waits on that placement's line while the
// clone syncs its others, and the next read finds it done; a branch held
// back waits at that placement's Check, and a refused default branch
// stops it alone (space-97, space-88, space-57, space-64, git-host-6,
// git-host-7, git-host-9, storage-36). Your own group's own repository
// is placed at every instance the home signs in to, created or joined in
// the namespace there, its first push at every instance after its first
// placement's waiting for Continue, and none added at an instance
// listing a placement it holds; Place and Leave refuse it (space-4,
// space-65, space-57, space-29). Forget of an instance makes each
// placement there follow a signed-in instance listing it — a key
// placement moving its clone, any other renamed in place, each file
// rewritten — and is refused while a placement of a project or a group
// there follows none, naming each; your own group's placement there
// follows one too, else is dropped with its file left (space-82,
// space-60, storage-36) — hermetic, on loopback alone, in a file budget
// of its own.

import { test } from "node:test";
import { orderRemotes, remoteOrderOf } from "./home.js";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalOrigin } from "./instance.js";
import { encodePlacementFile, PLACEMENTS_DIR } from "./placements.js";
import type { Command, GroupsState, SpaceUnit } from "./protocol.js";
import type { SpaceStepEvent } from "./space.js";
import type { StandinGroup, StandinHost } from "./testing/standin-host.js";
import { bareOf, clonePath, createSpaceHarness, hostFolder, hostKey, instanceOf, placementOf, repositoryOf, rowsOf, syncRecordsOf } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
const { git, gitFolder, addFolder, bareRepo, peerClone, peerPush, attachByHand, startHome, startHost, signIn, signOut, forget } = fixture;
test.after(() => fixture.dispose());

/** The stand-in's person, and your own group's repository once signed in. */
const LOGIN = "ada";
const HOST_OWN = `${LOGIN}/${LOGIN}-spex`;
const HOST_NAME = "Stand-in Git host";
const SECOND_NAME = "Second stand-in";
const THIRD_NAME = "Third stand-in";
/** The commit identity the first's account gives a clone (space-32). */
const ADA = "Ada Lovelace <ada@users.noreply.127.0.0.1>";

/** A Refresh of every signed-in instance, landed. */
async function refreshed(home: Awaited<ReturnType<typeof startHome>>): Promise<GroupsState> {
  const before = await home.client.expectOk("space.get", {});
  const mark = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  return home.client.waitSpace(mark, (state) => state.instances.every((instance) => !instance.signedIn
    || (instance.read.phase === "idle" && (instance.readAt ?? 0) > (instanceOf(before, instance.origin)?.readAt ?? 0))), 30_000);
}

/** One Git configuration value of a clone, or null where none stands. */
function configOf(clone: string, key: string): string | null {
  try { return git(clone, "config", "--get", key); } catch { return null; }
}

/** A clone's remotes in the order its Git configuration holds them
 * (storage-34). */
function remotesOf(clone: string): string[] {
  // Git's listing sorts the keys in some versions; the order is the file's (storage-34).
  const listed = git(clone, "config", "--get-regexp", "^remote\\..*\\.url$").split("\n").map((line) => line.split(" ")[0].replace(/^remote\./, "").replace(/\.url$/, ""));
  return orderRemotes(listed, (name) => name, remoteOrderOf(clone));
}

/** The placement files a commit of a repository's `spex` holds. */
function filesAt(repository: string): string[] {
  return git(repository, "ls-tree", "--name-only", `spex:${PLACEMENTS_DIR}`).split("\n").filter((name) => name !== "").sort();
}

/** The host API requests an instance received at or after `from`, as
 * `METHOD path`: Git's own transport aside. */
const apiCalls = (host: StandinHost, from: number): string[] => host.script.requests.slice(from)
  .filter((request) => request.path.startsWith("/api/"))
  .map((request) => `${request.method} ${request.path}`);

/** The unit names a list holds, in its order. */
const units = (list: SpaceUnit[]): string[] => list.map((unit) => unit.unit);

/** A scratch home signed in to two stand-ins on separate Git backends —
 * the second as `bob`, with a `workshop` holding another member — and a
 * project's spex repository created in the first's `acme` per name in
 * `projects`, each synced. */
async function twoInstances(name: string, projects: string[]) {
  const first = await startHost();
  const second = await startHost({ displayName: SECOND_NAME, person: { id: "1002", login: "bob", displayName: "Bob" } });
  const workshop: StandinGroup = { id: "2900", fullPath: "workshop", name: "Workshop", kind: "group", members: [{ id: "1002", login: "bob", displayName: "Bob", role: "Owner" }, { id: "1003", login: "carol", displayName: "Carol", role: "Developer" }] };
  second.script.groups.push(workshop);
  const home = await startHome(name, { host: first, project: false });
  let mark = home.client.mark();
  await signIn(home, first);
  await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  await signIn(home, second);
  const keys: string[] = [];
  for (const project of projects) {
    const { key: local } = await addFolder(home, gitFolder(project));
    mark = home.client.mark();
    await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: first.url, groupId: "2002", name: project } });
    const key = hostKey(first, `acme/${project}-spex`);
    await home.client.waitRepository(mark, key, (repository) => repository.sync.phase === "done", 30_000);
    keys.push(key);
  }
  return { first, second, workshop, home, keys };
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

test("git-host-26, git-host-8, git-host-16, git-host-17, git-host-20, space-29, space-62, space-69, space-72, space-78, space-60, space-1, space-4: members are read from, a member added to and removed from, and the repository moved at the instance of the placement each command names, its first where none is named, nothing asked of the other; a move of the second leaves the key and the clone, the group naming the row following it at once, beside your own group's own repository the sign-in placed there; a move of the first stands the row under its new group at once and moves the clone at its next sync, the second's placement kept; an instance at which the spex repository holds no placement is refused, one the home does not list not found, and the second signed out refuses acts at it alone", async (t) => {
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
  // Your namespace there names the row, beside your own group's own
  // repository, which each sign-in places there (space-1, space-4).
  assert.deepEqual(entryAt(afterSecond, second.url, "bob").placed, [{ key, name: "atlas-spex" }, { key: HOST_OWN, name: `${LOGIN}-spex` }]);
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
  assert.deepEqual(entryAt(await home.client.expectOk("space.get", {}), second.url, "bob").placed, [{ key: movedKey, name: "atlas-spex" }, { key: HOST_OWN, name: `${LOGIN}-spex` }]);

  // The second signed out, acts at its placement are refused; the
  // first's still read (space-29).
  await signOut(home, second);
  await home.client.expectError("space.members", { repository: movedKey, instance: second.url }, "invalid_request", /^Sign in first$/);
  await home.client.expectError("space.share", { repository: movedKey, instance: second.url, login: "grace", role: "developer" }, "invalid_request", /^Sign in first$/);
  await home.client.expectError("space.repository.move", { repository: movedKey, instance: second.url, groupId: "2002" }, "invalid_request", /^Sign in first$/);
  assert.deepEqual(logins(await home.client.expectOk("space.members", { repository: movedKey })), [LOGIN]);
});

test("space-92, space-97, space-57, space-87, space-1, space-29, space-30, space-8, space-7, space-32, space-23, space-35, storage-36, git-host-26, git-host-6, git-host-7, git-host-9: Place creating in the second's workshop asks the second alone, records its remote by the second's folder with the id in that remote's section and writes its file, then that same sync merges and pushes the first's peer change, the first's line synced and the second's waiting for Continue; space.sync with noticed for the second prepares its branch and pushes there with a credential the second issued, the row standing once under the first's acme naming both placements and the workshop naming it in one line; Check host then lists each placement's incoming units and a unit the second lacks; the commit identity is the first's account and space.tree reads the file as a placement, shared", async (t) => {
  const { first, second, workshop, home, keys: [key] } = await twoInstances("place-create", ["atlas"]);
  t.after(() => home.stop());
  const clone = clonePath(home.dataDir, key);
  const firstBare = bareOf(first, key);
  const firstOrigin = canonicalOrigin(first.url);
  const secondOrigin = canonicalOrigin(second.url);
  const secondFolder = hostFolder(second);
  await refreshed(home);
  // A peer's change standing at the first.
  await peerPush(peerClone(firstBare), (dir) => { writeFileSync(join(dir, "peer.md"), "the first's peer\n"); });

  // Nothing is asked of the first until the Place's sync saves: its
  // host step is the second's alone (git-host-26, git-host-6).
  const firstAsked = first.script.requests.length;
  const secondAsked = second.script.requests.length;
  const creations = second.script.creations.length;
  let firstBeforeSave: string[] | undefined;
  const steps: string[] = [];
  home.hooks.beforeStep = (event: SpaceStepEvent) => {
    if (event.repository !== key) return;
    steps.push(`${event.op}:${event.step}:${event.placement === secondOrigin ? "second" : event.placement === firstOrigin ? "first" : "-"}`);
    if (event.op === "place" && event.step === "save") firstBeforeSave ??= apiCalls(first, firstAsked);
  };
  const placed = await home.client.settle("space.place", { repository: key, choice: { kind: "create", instance: second.url, groupId: workshop.id, name: "atlas" } }, 30_000);
  home.hooks.beforeStep = undefined;
  assert.deepEqual(firstBeforeSave, [], "the first is asked nothing before the Place's sync");
  assert.deepEqual(apiCalls(second, secondAsked).filter((call) => call === "POST /api/v1/host/repositories"), ["POST /api/v1/host/repositories"]);
  assert.equal(second.script.creations.length, creations + 1);
  const asked = second.script.creations.at(-1) as { group_id: unknown; name: unknown };
  assert.deepEqual([asked.group_id, asked.name], [workshop.id, "atlas-spex"]);
  // The host's step first, at the second, then the sync from Save: each
  // placement's turn in the order added (space-31, space-12).
  assert.equal(steps[0], "place:check:second");
  assert.equal(steps[1], "place:save:-");
  assert.ok(steps.indexOf("place:check:first") < steps.indexOf("place:check:second", 1), steps.join(" "));
  const created = second.script.repositories.find((repository) => repository.group.fullPath === "workshop" && repository.path === "atlas-spex");
  assert.ok(created, "the second created atlas-spex in its workshop");

  // The same sync merged and pushed the first's, its line synced, while
  // the second's waits for Continue, nothing pushed there; the sync is
  // done by the first (space-97, space-57, space-87, space-12).
  assert.equal(placed.sync.phase, "done", JSON.stringify(placed.sync));
  assert.deepEqual(placed.placements.map((line) => [line.instance, line.path, line.attached, line.outcome?.kind]), [
    [firstOrigin, "acme/atlas-spex", true, "synced"],
    [secondOrigin, "workshop/atlas-spex", true, "waiting"],
  ]);
  assert.ok(existsSync(join(clone, "peer.md")), "the first's peer change merged");
  assert.equal(git(firstBare, "rev-parse", "spex"), git(clone, "rev-parse", "HEAD"));
  assert.equal(git(created.bare, "for-each-ref", "refs/heads/spex"), "", "nothing pushed to the second before Continue");
  assert.equal(placementOf(placed, second.url).noticed, false);
  // Its remote, named by the second's folder, holds the host's id and
  // the core's creation in its own section, the creation kept while its
  // branch is owed; no id stands at the top level (storage-34,
  // git-host-7, space-32).
  assert.match(configOf(clone, `remote.${secondFolder}.url`) ?? "", /\/workshop\/atlas-spex\.git$/);
  assert.equal(configOf(clone, `remote.${secondFolder}.spexId`), created.id);
  assert.equal(configOf(clone, `remote.${secondFolder}.spexCreated`), created.id);
  assert.equal(configOf(clone, `remote.${hostFolder(first)}.spexId`), placed.id);
  assert.equal(configOf(clone, "spex.repositoryId"), null);
  // Its file holds exactly the three lines, committed by that sync's
  // Save and pushed to the first (storage-36).
  const bytes = `format: 1\ninstance: "${secondOrigin}"\nid: "${created.id}"\n`;
  assert.equal(encodePlacementFile(secondOrigin, created.id), bytes);
  assert.equal(readFileSync(join(clone, PLACEMENTS_DIR, `${secondFolder}.yaml`), "utf8"), bytes);
  assert.equal(`${git(firstBare, "show", `spex:${PLACEMENTS_DIR}/${secondFolder}.yaml`)}\n`, bytes);
  assert.deepEqual([...placed.placedAt].sort(), [firstOrigin, secondOrigin].sort());

  // Continue for the second: its branch prepared, then pushed there with
  // a credential the second issued; each line synced and its last sync
  // and notice recorded apart (space-57, git-host-7, git-host-9,
  // storage-5).
  const branchAsked = second.script.requests.length;
  const continued = await home.client.settle("space.sync", { repository: key, placement: second.url, noticed: true }, 30_000);
  assert.equal(continued.sync.phase, "done", JSON.stringify(continued.sync));
  assert.deepEqual(continued.placements.map((line) => [line.instance, line.outcome?.kind, line.noticed]), [[firstOrigin, "synced", false], [secondOrigin, "synced", true]]);
  assert.ok(apiCalls(second, branchAsked).includes(`POST /api/v1/host/repositories/${created.id}/spex-branch`), "the second prepared its branch");
  assert.equal(git(created.bare, "rev-parse", "spex"), git(clone, "rev-parse", "HEAD"));
  assert.equal(configOf(clone, `remote.${secondFolder}.spexCreated`), null, "the prepared branch spends the creation");
  const pushes = second.script.transportCredentials.filter((entry) => entry.push);
  assert.ok(pushes.length > 0 && second.script.transportCredentials.every((entry) => entry.instance === second.url), JSON.stringify(second.script.transportCredentials));
  assert.ok(first.script.transportCredentials.every((entry) => entry.instance === first.url), "nothing at the first went with the second's credential");
  const records = syncRecordsOf(home.dataDir, key);
  assert.equal(records[`sync:${key}:${secondFolder}:noticed`], true);
  assert.ok(records[`sync:${key}:${secondFolder}:last`], JSON.stringify(records));

  // The row stands once, under the first's acme, naming both placements
  // by display name and path; the second's workshop shows one line
  // naming it, with no row and no control of its own (space-1,
  // space-87, space-30).
  const state = await home.client.expectOk("space.get", {});
  assert.equal(rowsOf(state).filter((repository) => repository.key === key).length, 1);
  assert.deepEqual(entryAt(state, first.url, "acme").repositories.map((repository) => repository.key), [key]);
  assert.deepEqual(repositoryOf(state, key).placements.map((line) => [instanceOf(state, line.instance ?? "")?.displayName, line.path]), [[HOST_NAME, "acme/atlas-spex"], [SECOND_NAME, "workshop/atlas-spex"]]);
  const named = entryAt(state, second.url, "workshop");
  assert.deepEqual(named.placed, [{ key, name: "atlas-spex" }]);
  assert.deepEqual(named.repositories, []);

  // Check host lists each placement's incoming units under its instance,
  // and the local list a unit the second lacks — sent to the first alone
  // while the second answered 503 (space-8, space-7, space-15).
  await peerPush(peerClone(firstBare), (dir) => { writeFileSync(join(dir, "only-first.md"), "the first alone\n"); });
  second.script.failTransport(503);
  const alone = await home.client.settle("space.sync", { repository: key }, 30_000);
  second.script.failTransport(null);
  assert.deepEqual(alone.placements.map((line) => line.outcome?.kind), ["synced", "stopped"]);
  await peerPush(peerClone(firstBare), (dir) => { writeFileSync(join(dir, "first-new.md"), "the first's\n"); });
  await peerPush(peerClone(created.bare), (dir) => { writeFileSync(join(dir, "second-new.md"), "the second's\n"); });
  const checked = await home.client.settle("space.fetch", { repository: key }, 30_000);
  assert.deepEqual(units(placementOf(checked, first.url).incoming), ["first-new.md"]);
  assert.deepEqual(units(placementOf(checked, second.url).incoming), ["second-new.md"]);
  assert.ok(units(checked.local).includes("only-first.md"), JSON.stringify(units(checked.local)));

  // The commit identity is the first's account, its key placement's,
  // never the second's (space-32); space.tree reads the placement's
  // file as a placement, shared (space-23, space-35).
  assert.equal(git(clone, "log", "-1", "--format=%an <%ae>", "--", `${PLACEMENTS_DIR}/${secondFolder}.yaml`), ADA);
  const tree = await home.client.expectOk("space.tree", { repository: key, path: PLACEMENTS_DIR });
  const entry = tree.entries.find((candidate) => candidate.name === `${secondFolder}.yaml`);
  assert.deepEqual([entry?.family, entry?.sync, entry?.kind], ["placement", "shared", "file"]);
});

test("space-100, space-97, space-88, space-29, space-57, space-64, space-13, space-87, space-30, git-host-26, git-host-6, storage-36: a Place joining a repository the second lists asks the first nothing, is refused until its notice is seen, and joins the two histories, the choice keyed by the second; one creating in a group of the second that refuses it for the account's rights waits on the second's line while the first syncs, and the next read after it grants creates and syncs it there; a name taken there, an instance the clone holds a placement at, a local-only clone, your own group's own repository, a group the view lists not, a name with nothing of a name, and a placement whose members the person may not manage are each refused, no refusal naming a URL under either instance", async (t) => {
  const { first, second, home, keys: [atlas, beacon] } = await twoInstances("place-each", ["atlas", "beacon"]);
  t.after(() => home.stop());
  const firstOrigin = canonicalOrigin(first.url);
  const secondOrigin = canonicalOrigin(second.url);
  const secondFolder = hostFolder(second);
  const atlasClone = clonePath(home.dataDir, atlas);
  const beaconClone = clonePath(home.dataDir, beacon);
  const { key: loose } = await addFolder(home, gitFolder("loose"));
  await refreshed(home);
  const refusals: string[] = [];
  const refused = async (repository: string, choice: Extract<Command, { type: "space.place" }>["choice"], code: string, pattern: RegExp): Promise<void> => {
    refusals.push(await home.client.expectError("space.place", { repository, choice }, code, pattern));
  };
  const atSecond = { kind: "create" as const, instance: second.url, groupId: "2002", name: "atlas" };

  // Refused before the host is asked: a local-only clone picks a group
  // instead; your own group's own repository, which each sign-in places;
  // an instance the clone holds a placement at; one the home does not
  // list; a group the second's view lists not; a name with nothing of a
  // name (space-29, space-88).
  const secondAsked = second.script.requests.length;
  await refused(loose, atSecond, "invalid_request", /^Pick a group first$/);
  await refused(HOST_OWN, atSecond, "invalid_request", /^ada-spex holds a group's records; only a project's are placed at another instance$/);
  await refused(atlas, { ...atSecond, instance: first.url }, "invalid_request", new RegExp(`^atlas-spex is placed at ${HOST_NAME} already$`));
  await refused(atlas, { ...atSecond, instance: "http://127.0.0.1:9" }, "not_found", /has not signed in/);
  await refused(atlas, { ...atSecond, groupId: "9999" }, "not_found", /^The host lists no such group$/);
  await refused(atlas, { ...atSecond, name: "--" }, "invalid_request", /letter or a digit/);
  assert.deepEqual(apiCalls(second, secondAsked), [], "no refusal asked the second");
  // Placing widens who reads every record: refused while the view does
  // not say the person may manage the members of every placement it
  // holds (space-88, space-29).
  const atlasThere = first.script.repositories.find((repository) => repository.path === "atlas-spex");
  assert.ok(atlasThere);
  atlasThere.can = { manageMembers: false, transfer: false };
  await refreshed(home);
  await refused(atlas, atSecond, "invalid_request", /^Placing atlas-spex elsewhere needs the right to manage the members of each of its placements$/);
  delete atlasThere.can;
  await refreshed(home);

  // A Place joining a repository the second's workshop lists, which may
  // have other members: refused until its notice is seen (space-57),
  // then joined asking the first nothing before its sync (git-host-26).
  const listed = second.script.addRepository({ group: "workshop", name: "atlas-spex", project: { name: "atlas", remote: null, kept: "theirs" } });
  await refreshed(home);
  const joining = { kind: "join" as const, instance: second.url, hostId: listed.id };
  const theirs = git(listed.bare, "rev-parse", "spex");
  await refused(atlas, joining, "invalid_request", /^Read the sharing notice before joining atlas-spex$/);
  const firstAsked = first.script.requests.length;
  let firstBeforeSave: string[] | undefined;
  home.hooks.beforeStep = (event: SpaceStepEvent) => {
    if (event.repository === atlas && event.op === "place" && event.step === "save") firstBeforeSave ??= apiCalls(first, firstAsked);
  };
  // The second's transport failing meanwhile, the Place's own sync stops
  // there alone, before its Compare.
  second.script.failTransport(503);
  const placed = await home.client.settle("space.place", { repository: atlas, choice: joining, noticed: true }, 30_000);
  second.script.failTransport(null);
  home.hooks.beforeStep = undefined;
  assert.deepEqual(firstBeforeSave, [], "the first is asked nothing before the Place's sync");
  assert.equal(placed.sync.phase, "done", JSON.stringify(placed.sync));
  assert.deepEqual(placed.placements.map((line) => [line.instance, line.outcome?.kind]), [[firstOrigin, "synced"], [secondOrigin, "stopped"]]);
  // Its remote by the second's folder with the joined id and no
  // creation, its file, and the notice recorded for it (storage-34,
  // storage-36, storage-5).
  assert.equal(configOf(atlasClone, `remote.${secondFolder}.spexId`), listed.id);
  assert.equal(configOf(atlasClone, `remote.${secondFolder}.spexCreated`), null);
  assert.equal(readFileSync(join(atlasClone, PLACEMENTS_DIR, `${secondFolder}.yaml`), "utf8"), encodePlacementFile(secondOrigin, listed.id));
  assert.equal(syncRecordsOf(home.dataDir, atlas)[`sync:${atlas}:${secondFolder}:noticed`], true);
  // The next Sync joins the two histories as any two, as the Place said,
  // with no second confirmation: the first synced, the unit both sides
  // hold differently the second's choice (space-13, space-97, space-14).
  const joined = await home.client.settle("space.sync", { repository: atlas }, 30_000);
  assert.ok(joined.sync.phase === "choices" && joined.sync.placement === secondOrigin, JSON.stringify(joined.sync));
  assert.deepEqual(joined.placements.map((line) => [line.instance, line.outcome?.kind]), [[firstOrigin, "synced"], [secondOrigin, "choices"]]);
  assert.deepEqual(placementOf(joined, second.url).conflicts.map((conflict) => conflict.unit.unit), ["project.json"]);
  const chosen = await home.client.settle("space.sync", { repository: atlas, placement: second.url, join: true, choices: { "project.json": "mine" } }, 30_000);
  assert.equal(chosen.sync.phase, "done", JSON.stringify(chosen.sync));
  assert.deepEqual(chosen.placements.map((line) => [line.instance, line.outcome?.kind]), [[firstOrigin, "synced"], [secondOrigin, "synced"]]);
  assert.equal(git(listed.bare, "rev-parse", "spex"), git(atlasClone, "rev-parse", "HEAD"));
  assert.equal(git(atlasClone, "merge-base", "--is-ancestor", theirs, "HEAD"), "", "the second's history joined");

  // A name the second holds in that group is refused in place, the
  // clone and its line as they were (space-29, git-host-6).
  second.script.addRepository({ group: "acme", name: "taken-spex" });
  const before = await home.client.repository(beacon);
  await refused(beacon, { ...atSecond, name: "taken" }, "invalid_request", /^taken-spex is taken in acme; choose another name$/);
  const after = await home.client.repository(beacon);
  assert.deepEqual([after.sync, after.placements], [before.sync, before.placements]);
  assert.equal(configOf(beaconClone, `remote.${secondFolder}.url`), null);

  // A creation the second refuses for the account's rights waits on the
  // second's line, attached to no remote, while the first syncs; the row
  // reads its first placement (space-100, space-97, space-64, space-87,
  // space-30, git-host-26).
  const words = "You need the Maintainer role in Acme to create projects.";
  second.script.refuseCreate(words);
  t.after(() => second.script.refuseCreate(null));
  await peerPush(peerClone(bareOf(first, beacon)), (dir) => { writeFileSync(join(dir, "peer.md"), "the first's peer\n"); });
  const waiting = await home.client.settle("space.place", { repository: beacon, choice: { ...atSecond, name: "beacon" } }, 30_000);
  assert.equal(waiting.sync.phase, "done", JSON.stringify(waiting.sync));
  assert.deepEqual(waiting.placements.map((line) => [line.instance, line.attached, line.state, line.outcome?.kind ?? null]), [[firstOrigin, true, "reachable", "synced"], [secondOrigin, false, "absent", null]]);
  assert.deepEqual(placementOf(waiting, second.url).waiting, { step: "create", group: "acme", message: words });
  assert.equal(placementOf(waiting, second.url).path, "acme/beacon-spex");
  assert.deepEqual([waiting.state, placementOf(waiting, first.url).waiting], ["reachable", null]);
  assert.ok(existsSync(join(beaconClone, "peer.md")), "the first synced meanwhile");
  assert.equal(configOf(beaconClone, `remote.${secondFolder}.url`), null);
  assert.ok(!existsSync(join(beaconClone, PLACEMENTS_DIR, `${secondFolder}.yaml`)), "no file for a placement not added");
  // The next read after the second grants it creates it there, adds the
  // placement and syncs it (space-64).
  second.script.refuseCreate(null);
  const mark = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  const found = await home.client.waitRepository(mark, beacon, (repository) => repository.sync.phase === "done" && placementOf(repository, second.url).attached && placementOf(repository, second.url).outcome?.kind === "synced", 30_000);
  const made = second.script.repositories.find((repository) => repository.group.fullPath === "acme" && repository.path === "beacon-spex");
  assert.ok(made, "created at the second");
  assert.deepEqual(found.placements.map((line) => [line.instance, line.attached, line.waiting]), [[firstOrigin, true, null], [secondOrigin, true, null]]);
  assert.equal(git(made.bare, "rev-parse", "spex"), git(beaconClone, "rev-parse", "HEAD"));
  assert.equal(readFileSync(join(beaconClone, PLACEMENTS_DIR, `${secondFolder}.yaml`), "utf8"), encodePlacementFile(secondOrigin, made.id));

  // No refusal names a URL under either instance (space-30, space-1).
  assert.deepEqual(refusals.filter((message) => message.includes(`${first.url}/`) || message.includes(`${second.url}/`)), []);
  assert.equal(refusals.length, 9, JSON.stringify(refusals));
});

test("git-host-26, git-host-7, space-97, space-12, space-15, space-87: a Place's creation whose README the second holds back waits at that placement's Check, reading it again, while the first has synced, the clone recording the creation in that remote's section; the second's refusal of the default branch the core then pushes stops that placement alone in the second's words, the creation kept, and once the second's default branch exists the next Sync prepares its branch and pushes there, the creation spent", async (t) => {
  const { first, second, home, keys: [key] } = await twoInstances("place-branch", ["atlas"]);
  t.after(() => home.stop());
  const clone = clonePath(home.dataDir, key);
  const firstBare = bareOf(first, key);
  const secondOrigin = canonicalOrigin(second.url);
  const secondFolder = hostFolder(second);
  await refreshed(home);
  const words = "You are not allowed to push code to protected branches on this project.";
  second.script.holdInitialization(Infinity);
  second.script.refuseDefaultBranch(words);
  t.after(() => { second.script.holdInitialization(null); second.script.refuseDefaultBranch(null); });
  await peerPush(peerClone(firstBare), (dir) => { writeFileSync(join(dir, "peer.md"), "the first's peer\n"); });

  // At the second's Check, after the Place's Save: the first already
  // merged and pushed, and the creation recorded in the second's
  // remote's section (git-host-7, space-12).
  let saved = false;
  let atCheck: { created: string | null; firstPushed: boolean } | undefined;
  home.hooks.beforeStep = (event: SpaceStepEvent) => {
    if (event.repository !== key || event.op !== "place") return;
    if (event.step === "save") saved = true;
    else if (saved && event.step === "check" && event.placement === secondOrigin) {
      atCheck ??= { created: configOf(clone, `remote.${secondFolder}.spexCreated`), firstPushed: git(firstBare, "rev-parse", "spex") === git(clone, "rev-parse", "HEAD") };
    }
  };
  const asked = second.script.requests.length;
  const stopped = await home.client.settle("space.place", { repository: key, choice: { kind: "create", instance: second.url, groupId: "2002", name: "atlas" } }, 60_000);
  home.hooks.beforeStep = undefined;
  const created = second.script.repositories.find((repository) => repository.group.fullPath === "acme" && repository.path === "atlas-spex");
  assert.ok(created, "created at the second");
  assert.deepEqual(atCheck, { created: created.id, firstPushed: true });
  // Read again five times, then `main` pushed by the core and refused:
  // that placement stops alone in the second's words, the first synced
  // and the sync done by it (git-host-7, space-15).
  const rereads = second.script.requests.slice(asked).filter((request) => request.method === "GET" && request.path === `/api/v1/host/repositories/${created.id}`).length
    - second.script.requests.slice(asked).filter((request) => request.method === "GET" && request.path === "/api/v1/host/me").length;
  assert.equal(rereads, 5);
  assert.equal(stopped.sync.phase, "done", JSON.stringify(stopped.sync));
  const line = placementOf(stopped, second.url);
  assert.ok(line.outcome?.kind === "stopped" && line.outcome.step === "check" && line.outcome.cause === "refused" && line.outcome.retry, JSON.stringify(line.outcome));
  assert.equal(line.outcome.message, `${SECOND_NAME} refused: ${words}`);
  assert.equal(placementOf(stopped, first.url).outcome?.kind, "synced");
  assert.equal(git(firstBare, "rev-parse", "spex"), git(clone, "rev-parse", "HEAD"));
  assert.equal(git(created.bare, "for-each-ref", "refs/heads/"), "", "nothing landed at the second");
  assert.equal(configOf(clone, `remote.${secondFolder}.spexCreated`), created.id, "the refused push keeps the creation");

  // The second's default branch exists once its README lands: the next
  // Sync prepares the branch and pushes there, the creation spent
  // (git-host-7).
  second.script.refuseDefaultBranch(null);
  second.script.holdInitialization(null);
  const synced = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(synced.sync.phase, "done", JSON.stringify(synced.sync));
  assert.deepEqual(synced.placements.map((placement) => placement.outcome?.kind), ["synced", "synced"]);
  assert.equal(git(created.bare, "ls-tree", "--name-only", "main"), "README.md");
  assert.equal(git(created.bare, "rev-parse", "spex"), git(clone, "rev-parse", "HEAD"));
  assert.equal(configOf(clone, `remote.${secondFolder}.spexCreated`), null, "the default branch spends the creation");
});

test("space-94, space-4, space-65, space-57, space-29, space-1, space-82, space-60, space-5, storage-31, storage-34, storage-36, storage-5, git-host-6, git-host-9: your own group is placed at every instance the home signs in to — a sign-in at the first creates its own repository there; one at the third, on a Git backend of its own, creates bob-spex in the namespace there as its second placement, its remote named by the third's folder with its id and its file written, its first push waiting for Continue, which then pushes there with a credential the third issued; one at the second, over the first's Git backend and listing the first's repository, adds no placement; space.place and space.leave naming it are each refused, nothing asked of any instance; the first signed out and forgotten, its placement there follows the second, its remote renamed in its place with its id and last sync kept and its file rewritten to the second's with the first's deleted, and the third receives that change at the next sync; the third then signed out and forgotten, which no signed-in instance but the second lists, its remote there is dropped with its id, what it fetched and its last sync, its file left", async (t) => {
  const first = await startHost();
  const second = await startHost({ gitBackend: first, displayName: SECOND_NAME });
  const third = await startHost({ displayName: THIRD_NAME, person: { id: "1002", login: "bob", displayName: "Bob" } });
  const home = await startHome("own-everywhere", { host: first, project: false });
  t.after(() => home.stop());
  const own = clonePath(home.dataDir, HOST_OWN);
  const names = (host: StandinHost): unknown[] => host.script.creations.map((body) => [(body as { name?: unknown }).name, (body as { group_id?: unknown }).group_id ?? null]);

  // A sign-in at the first creates your own group's own repository in
  // your namespace there, its first placement (space-4, space-65).
  let mark = home.client.mark();
  await signIn(home, first);
  const created = await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  assert.deepEqual(names(first), [[`${LOGIN}-spex`, null]]);
  assert.deepEqual(git(own, "remote").split("\n"), [hostFolder(first)]);
  const ownId = created.id;
  assert.ok(ownId);

  // One at the third creates `<login there>-spex` in your namespace
  // there as its second placement, its remote named by the third's
  // folder with the host's id in its own section and its file written;
  // its first push there waits for Continue, the first synced and
  // nothing sent to the third (space-4, space-65, space-57, git-host-6,
  // storage-34, storage-36). The row stays at the first, its first
  // placement's (storage-31, space-1).
  mark = home.client.mark();
  await signIn(home, third);
  const waiting = await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase !== "running" && repository.placements[1]?.outcome?.kind === "waiting", 30_000);
  assert.deepEqual(names(third), [["bob-spex", null]]);
  const atThird = third.script.repositories.find((repository) => repository.path === "bob-spex");
  assert.ok(atThird, "bob-spex stands at the third");
  assert.equal(atThird.group.fullPath, "bob");
  assert.deepEqual(git(own, "remote").split("\n"), [hostFolder(first), hostFolder(third)]);
  assert.equal(configOf(own, `remote.${hostFolder(third)}.spexId`), atThird.id);
  assert.equal(readFileSync(join(own, PLACEMENTS_DIR, `${hostFolder(third)}.yaml`), "utf8"), encodePlacementFile(canonicalOrigin(third.url), atThird.id));
  assert.deepEqual(waiting.placements.map((line) => [line.instance, line.path, line.attached, line.outcome?.kind ?? null]), [[first.url, HOST_OWN, true, "synced"], [third.url, "bob/bob-spex", true, "waiting"]]);
  assert.deepEqual([waiting.key, waiting.own, waiting.instance, waiting.id, waiting.sync.phase], [HOST_OWN, true, first.url, ownId, "done"]);
  assert.equal(git(atThird.bare, "for-each-ref", "refs/heads/spex"), "", "nothing is pushed to the third before Continue");
  assert.equal(third.script.transportCredentials.length, 0, "no transport reaches the third before Continue");
  // Continue pushes there, with a credential the third issued (space-57,
  // git-host-9).
  const continued = await home.client.settle("space.sync", { repository: HOST_OWN, placement: third.url, noticed: true }, 30_000);
  assert.equal(continued.sync.phase, "done", JSON.stringify(continued.sync));
  assert.deepEqual(continued.placements.map((line) => [line.instance, line.outcome?.kind]), [[first.url, "synced"], [third.url, "synced"]]);
  assert.equal(git(atThird.bare, "rev-parse", "spex"), git(own, "rev-parse", "spex"));
  assert.ok(third.script.transportCredentials.some((entry) => entry.push) && third.script.transportCredentials.every((entry) => entry.instance === third.url), JSON.stringify(third.script.transportCredentials));

  // One at the second, over the first's Git backend, which lists the
  // first's repository in your namespace there: no placement added,
  // nothing created and no file written, its listing that placement
  // and no row of its own (space-4, git-host-5).
  await signIn(home, second);
  assert.deepEqual(second.script.creations, [], "nothing is created at the second");
  assert.deepEqual(git(own, "remote").split("\n"), [hostFolder(first), hostFolder(third)]);
  assert.equal(existsSync(join(own, PLACEMENTS_DIR, `${hostFolder(second)}.yaml`)), false);
  const state = await home.client.expectOk("space.get", {});
  const row = repositoryOf(state, HOST_OWN);
  assert.deepEqual(row.placements.map((line) => [line.instance, line.attached]), [[first.url, true], [third.url, true]]);
  assert.deepEqual(rowsOf(state).filter((repository) => repository.id === ownId).map((repository) => repository.key), [HOST_OWN], "the second's listing is the first's placement");

  // space.place and space.leave naming your own group's own repository
  // are each refused, nothing changed and nothing asked (space-29).
  const asked = [first, second, third].map((host) => host.script.requests.length);
  await home.client.expectError("space.place", { repository: HOST_OWN, choice: { kind: "create", instance: second.url, groupId: null, name: LOGIN } }, "invalid_request", new RegExp(`^${LOGIN}-spex holds a group's records; only a project's are placed at another instance$`));
  await home.client.expectError("space.leave", { repository: HOST_OWN, instance: third.url }, "invalid_request", new RegExp(`^${LOGIN}-spex holds a group's records; only a project's are removed from an instance$`));
  assert.deepEqual(git(own, "remote").split("\n"), [hostFolder(first), hostFolder(third)]);
  assert.deepEqual([first, second, third].map((host) => host.script.requests.length), asked);

  // The first signed out and forgotten: your own group's placement there
  // follows the second, which lists the same host repository over the
  // shared Git backend — its remote renamed to the second's folder in
  // its place, the host's id in its section and its last sync kept, its
  // file rewritten to the second's and the first's deleted — the
  // third's placement untouched and the row at the second, its folder
  // kept (space-82, space-60, space-5, storage-34, storage-36, storage-5).
  const [firstFolder, secondFolder, thirdFolder] = [hostFolder(first), hostFolder(second), hostFolder(third)];
  const lastAtFirst = syncRecordsOf(home.dataDir, HOST_OWN)[`sync:${HOST_OWN}:${firstFolder}:last`];
  assert.ok(lastAtFirst, "a last sync with the first");
  await signOut(home, first);
  const forgotten = await forget(home, first);
  assert.deepEqual(forgotten.instances.map((instance) => instance.origin), [third.url, second.url]);
  assert.deepEqual(remotesOf(own), [secondFolder, thirdFolder], "renamed in its place");
  assert.equal(configOf(own, `remote.${secondFolder}.spexId`), ownId);
  const records = syncRecordsOf(home.dataDir, HOST_OWN);
  assert.deepEqual(records[`sync:${HOST_OWN}:${secondFolder}:last`], lastAtFirst, "its last sync kept");
  assert.deepEqual(Object.keys(records).filter((name) => name.includes(firstFolder)), [], "nothing kept under the first's name");
  assert.equal(readFileSync(join(own, PLACEMENTS_DIR, `${secondFolder}.yaml`), "utf8"), encodePlacementFile(canonicalOrigin(second.url), ownId));
  assert.equal(existsSync(join(own, PLACEMENTS_DIR, `${firstFolder}.yaml`)), false, "the first's file is deleted");
  const followed = repositoryOf(forgotten, HOST_OWN);
  assert.deepEqual([followed.key, followed.instance, followed.id], [HOST_OWN, second.url, ownId]);
  assert.deepEqual(followed.placements.map((line) => [line.instance, line.path, line.attached]), [[second.url, HOST_OWN, true], [third.url, "bob/bob-spex", true]]);

  // The next sync carries that change to the third, as to the second
  // (space-94, space-12).
  const carried = await home.client.settle("space.sync", { repository: HOST_OWN }, 30_000);
  assert.equal(carried.sync.phase, "done", JSON.stringify(carried.sync));
  assert.deepEqual(carried.placements.map((line) => [line.instance, line.outcome?.kind]), [[second.url, "synced"], [third.url, "synced"]]);
  const expected = [`${secondFolder}.yaml`, `${thirdFolder}.yaml`].sort();
  assert.deepEqual(filesAt(atThird.bare), expected, "the third receives the rewrite");
  assert.equal(git(atThird.bare, "rev-parse", "spex"), git(own, "rev-parse", "spex"));
  assert.deepEqual(filesAt(bareOf(first, HOST_OWN)), expected);

  // The third signed out and forgotten: the second, the one signed-in
  // instance left, holds the first placement and lists nothing of the
  // third's, so the remote there is dropped — its id, the spex it
  // fetched and its last sync with it — its file left as it stands and
  // the second's placement standing (space-82, space-5, storage-5).
  await signOut(home, third);
  const alone = await forget(home, third);
  assert.deepEqual(alone.instances.map((instance) => instance.origin), [second.url]);
  assert.deepEqual(remotesOf(own), [secondFolder]);
  assert.equal(configOf(own, `remote.${thirdFolder}.spexId`), null);
  assert.equal(git(own, "for-each-ref", "--format=%(refname)", `refs/remotes/${thirdFolder}`), "", "what it fetched goes with it");
  assert.deepEqual(Object.keys(syncRecordsOf(home.dataDir, HOST_OWN)).filter((name) => name.includes(thirdFolder)), [], "its records go with it");
  assert.equal(readFileSync(join(own, PLACEMENTS_DIR, `${thirdFolder}.yaml`), "utf8"), encodePlacementFile(canonicalOrigin(third.url), atThird.id), "its file is left");
  assert.deepEqual(repositoryOf(alone, HOST_OWN).placements.map((line) => [line.instance, line.attached]), [[second.url, true]]);
});

test("space-101, space-82, space-60, space-29, space-65, space-64, storage-31, storage-36: with three instances, the first two over one Git backend, Forget of the first, signed out, makes each placement there follow the second, which lists its host repository — a project's key placement moving its clone under the second's folder, a placement beside another project's key placement at the third renamed in place, moving no clone, each file rewritten to the second's — and removes the instance; with the third then signed out, space.forget of it is refused naming the project placed there beside its key placement, and the project and the group's spex repository keyed under it, the group's creation the third left pending, the instance kept signed out with every clone, remote and file as it stood, nothing asked of any instance", async (t) => {
  const first = await startHost();
  const second = await startHost({ gitBackend: first, displayName: SECOND_NAME });
  const third = await startHost({ displayName: THIRD_NAME });
  const [firstFolder, secondFolder, thirdFolder] = [hostFolder(first), hostFolder(second), hostFolder(third)];
  const home = await startHome("forget-placed", { host: first, project: false });
  t.after(() => home.stop());
  let mark = home.client.mark();
  await signIn(home, first);
  await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  await signIn(home, second);
  // The third's sign-in places your own group there too, its push
  // waiting for Continue (space-4).
  mark = home.client.mark();
  await signIn(home, third);
  await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase !== "running" && repository.placements[1]?.outcome?.kind === "waiting", 30_000);

  // `atlas` keyed under the first, in your namespace there, which the
  // second lists too, and placed in the third's acme; `borealis` keyed
  // under the third's acme and placed in your namespace at the first
  // (space-58, space-97). A group of `null` is your namespace.
  const created = async (name: string, at: StandinHost, groupId: string | null, path: string): Promise<string> => {
    const { key: local } = await addFolder(home, gitFolder(name));
    const from = home.client.mark();
    await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: at.url, groupId, name } });
    const key = hostKey(at, `${path}/${name}-spex`);
    await home.client.waitRepository(from, key, (repository) => repository.sync.phase === "done", 30_000);
    return key;
  };
  const placedAt = async (key: string, at: StandinHost, groupId: string | null, name: string): Promise<void> => {
    const placed = await home.client.settle("space.place", { repository: key, choice: { kind: "create", instance: at.url, groupId, name }, noticed: true }, 30_000);
    assert.equal(placed.sync.phase, "done", JSON.stringify(placed.sync));
  };
  const atlas = await created("atlas", first, null, LOGIN);
  await placedAt(atlas, third, "2002", "atlas");
  const borealis = await created("borealis", third, "2002", "acme");
  await placedAt(borealis, first, null, "borealis");
  const atlasClone = clonePath(home.dataDir, atlas);
  const borealisClone = clonePath(home.dataDir, borealis);
  assert.deepEqual([remotesOf(atlasClone), remotesOf(borealisClone)], [[firstFolder, thirdFolder], [thirdFolder, firstFolder]]);
  const borealisAtFirst = configOf(borealisClone, `remote.${firstFolder}.spexId`);
  assert.ok(borealisAtFirst);

  // A group's spex repository keyed under the third, its creation there
  // left waiting for a member with the rights (space-65, space-64).
  const words = "You need the Maintainer role in Acme to create projects.";
  third.script.refuseCreate(words);
  t.after(() => third.script.refuseCreate(null));
  const group = hostKey(third, "acme/acme-spex");
  const groupClone = clonePath(home.dataDir, group);
  mkdirSync(groupClone, { recursive: true });
  git(groupClone, "init", "-q", "-b", "spex");
  git(groupClone, "-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", "Start");
  const work = gitFolder("acme-work");
  await home.client.expectOk("project.rebind", { projectId: group, path: work });
  mark = home.client.mark();
  assert.equal((await home.client.expectOk("project.register", { path: work })).id, group);
  const pending = await home.client.waitRepository(mark, group, (repository) => repository.placements.some((line) => line.waiting !== null), 30_000);
  assert.deepEqual([pending.state, placementOf(pending, third.url).waiting?.message], ["local-only", words]);

  // The first signed out, a Refresh reads the second's listing of what
  // was created at the first since its sign-in; Forget of the first then
  // makes each placement there follow the second (space-82, space-60):
  // `atlas`'s key placement moves its clone under the second's folder,
  // its remote renamed and its pair kept with it; `borealis`'s placement
  // beside its key placement has its remote renamed in place, its clone
  // keyed under the third as it was; each file rewritten to the second's
  // with the first's deleted (storage-36).
  await signOut(home, first);
  await refreshed(home);
  const forgotten = await forget(home, first);
  assert.deepEqual(forgotten.instances.map((instance) => instance.origin), [second.url, third.url]);
  const atlasFollowed = hostKey(second, `${LOGIN}/atlas-spex`);
  const atlasMoved = clonePath(home.dataDir, atlasFollowed);
  assert.ok(existsSync(join(atlasMoved, ".git")) && !existsSync(atlasClone), "atlas follows the second");
  assert.deepEqual(remotesOf(atlasMoved), [secondFolder, thirdFolder]);
  assert.deepEqual(remotesOf(borealisClone), [thirdFolder, secondFolder], "renamed in its place, no clone moved");
  assert.equal(configOf(borealisClone, `remote.${secondFolder}.spexId`), borealisAtFirst);
  assert.equal(readFileSync(join(borealisClone, PLACEMENTS_DIR, `${secondFolder}.yaml`), "utf8"), encodePlacementFile(canonicalOrigin(second.url), borealisAtFirst));
  for (const clone of [atlasMoved, borealisClone]) {
    assert.ok(existsSync(join(clone, PLACEMENTS_DIR, `${secondFolder}.yaml`)) && !existsSync(join(clone, PLACEMENTS_DIR, `${firstFolder}.yaml`)), clone);
  }
  assert.deepEqual([repositoryOf(forgotten, atlasFollowed).instance, repositoryOf(forgotten, borealis).instance], [second.url, third.url]);

  // The third signed out, which no signed-in instance replaces: Forget
  // is refused, naming `atlas`, placed there beside its key placement at
  // the second, and `borealis` and the group's spex repository, keyed
  // under it (space-82, space-29, storage-31) — the instance kept signed
  // out, every clone, remote and file as it stood, your own group's
  // remote there untouched, nothing asked of any instance.
  await signOut(home, third);
  const own = clonePath(home.dataDir, HOST_OWN);
  const standing = (clone: string): unknown[] => [remotesOf(clone), readdirSync(join(clone, PLACEMENTS_DIR)).sort()];
  const before = [atlasMoved, borealisClone, own].map(standing);
  const asked = [first, second, third].map((host) => host.script.requests.length);
  await home.client.expectError("space.forget", { instance: third.url }, "invalid_request",
    new RegExp(`^Still kept under ${THIRD_NAME}: (borealis-spex, acme-spex|acme-spex, borealis-spex) · Still placed at ${THIRD_NAME}: atlas-spex$`));
  assert.deepEqual([atlasMoved, borealisClone, own].map(standing), before);
  assert.ok(existsSync(join(groupClone, ".git")), "the group's clone stays keyed under the third");
  assert.deepEqual(remotesOf(own), [secondFolder, thirdFolder]);
  const kept = await home.client.expectOk("space.get", {});
  assert.deepEqual(kept.instances.map((instance) => [instance.origin, instance.signedIn]), [[second.url, true], [third.url, false]]);
  assert.deepEqual([repositoryOf(kept, group).instance, repositoryOf(kept, borealis).instance, repositoryOf(kept, atlasFollowed).instance], [third.url, third.url, second.url]);
  assert.deepEqual([first, second, third].map((host) => host.script.requests.length), asked, "Forget asks nothing of any instance");
});
