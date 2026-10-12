// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Undo in Spex (space-79, git-host-14, DR-120): against the stand-in Git
// host, whose remote URLs lie under its Git origin and inside a storage
// group no answer names, a group of the instance is renamed — everything
// inside it carried to its new path — or, empty, deleted, and a spex
// repository is moved to another group or your own, each held as the
// stand-in answered before the reply with no read of its own, the clone
// moved by its next sync; what the stand-in cannot be asked is refused
// before it is, and its refusals keep its words, in English and in
// Chinese; nothing behind the instance is named on the way.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { clonePath, createSpaceHarness, repositoryOf, stringsOf } from "./testing/space-harness.js";
import { STANDIN_STORAGE, type StandinHost } from "./testing/standin-host.js";
import type { Command, CommandResults, GroupsState, ServerMessage } from "./protocol.js";

const fixture = createSpaceHarness();
const { git, gitFolder, addFolder, startHome, startHost, signIn } = fixture;
test.after(() => fixture.dispose());

/** The stand-in's person, and your own group's repository once signed in. */
const LOGIN = "ada";
const HOST_OWN = `${LOGIN}/${LOGIN}-spex`;
const HOST_NAME = "Stand-in Git host";

type Home = Awaited<ReturnType<typeof startHome>>;

/** What names something behind the instance in the strings a client
 * was sent (space-30): a URL under the stand-in's own, its storage
 * group, or the Git system's name. */
function leaks(host: StandinHost, values: unknown[]): string[] {
  return values.flatMap(stringsOf).filter((text) => text.includes(`${host.url}/`) || text.includes(STANDIN_STORAGE) || /gitlab/i.test(text));
}

/** Every Groups state broadcast to a client, the sign-in's own pages
 * aside (space-3). */
function broadcasts(messages: ServerMessage[]): GroupsState[] {
  return messages.flatMap((message) => message.type === "space.state" ? [{ ...message.state, signIn: { phase: "idle" as const } }] : []);
}

/** The group entry a state lists under a path, by kind of entry. */
function entry(state: GroupsState, fullPath: string, own = false): GroupsState["groups"][number] {
  const found = state.groups.find((group) => group.fullPath === fullPath && group.own === own);
  assert.ok(found, `no ${own ? "own " : ""}entry ${fullPath} in ${JSON.stringify(state.groups.map((group) => [group.fullPath, group.own]))}`);
  return found;
}

/** The keys of the rows an entry holds, sorted. */
const keysUnder = (state: GroupsState, fullPath: string, own = false): string[] => entry(state, fullPath, own).repositories.map((repository) => repository.key).sort();

/** The full paths of a state's groups of the instance, in its order. */
const groupPaths = (state: GroupsState): string[] => state.groups.filter((group) => !group.own && group.id !== null).map((group) => group.fullPath);

/** The stand-in's API requests at or after `from`. */
function apiRequests(host: StandinHost, from: number): string[] {
  return host.script.requests.slice(from).filter((request) => request.path.startsWith("/api/")).map((request) => `${request.method} ${request.path}`);
}

/** Send one undo command and return its reply with the state broadcast
 * before it that `check` accepts: the core holds the stand-in's answer
 * and announces it first (git-host-18..20). */
async function heldBefore<T extends "space.group.rename" | "space.group.delete" | "space.repository.move">(
  home: Home,
  type: T,
  fields: Omit<Extract<Command, { type: T }>, "type" | "id">,
  check: (state: GroupsState) => boolean,
): Promise<{ reply: CommandResults[T]; announced: GroupsState }> {
  const from = home.client.mark();
  const reply = await home.client.expectOk(type, fields);
  const since = home.client.messages.slice(from);
  const at = since.findIndex((message) => message.type === "reply" && message.ok && JSON.stringify(message.result) === JSON.stringify(reply));
  assert.ok(at >= 0, "the reply arrived");
  const announced = since.slice(0, at).find((message) => message.type === "space.state" && check(message.state));
  assert.ok(announced?.type === "space.state", `a state broadcast before the ${type} reply holds the change`);
  return { reply, announced: announced.state };
}

/** Sign a home in and pick a project's folder into `acme`, its first
 * sync done: `acme/<name>-spex`. */
async function signedWithProject(home: Home, host: StandinHost, name: string): Promise<{ key: string; id: string }> {
  let mark = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  const { key: local } = await addFolder(home, gitFolder(name));
  mark = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", groupId: "2002", name } });
  const key = `acme/${name}-spex`;
  const picked = await home.client.waitRepository(mark, key, (repository) => repository.sync.phase === "done", 30_000);
  assert.ok(picked.id);
  return { key, id: picked.id };
}

test("space-79: a group renamed, a non-empty one refused deletion and an empty one deleted, a repository moved and relisted at once, its clone moved by its next sync; refusals in the stand-in's words; nothing behind the instance named", async (t) => {
  const host = await startHost();
  // A repository the person may push to but not move (space-30).
  host.script.addRepository({ group: "acme", name: "team-spex", role: "Developer" });
  const home = await startHome("undo", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const { key, id } = await signedWithProject(home, host, "plans");
  const replies: unknown[] = [];

  // What the stand-in lets the person do: rename and delete each group
  // of the instance, neither on your own group; move the repository
  // they own, not the one they may only push to (space-30).
  const state = await home.client.expectOk("space.get", {});
  assert.deepEqual(entry(state, LOGIN, true).can, { createSubgroup: false, manageMembers: false, rename: false, delete: false });
  assert.deepEqual(entry(state, "acme").can, { createSubgroup: true, manageMembers: true, rename: true, delete: true });
  assert.deepEqual(entry(state, "acme/research").can, { createSubgroup: true, manageMembers: true, rename: true, delete: true });
  assert.deepEqual(repositoryOf(state, key).can, { manageMembers: true, transfer: true });
  assert.deepEqual(repositoryOf(state, "acme/team-spex").can, { manageMembers: false, transfer: false });

  // A rename of acme/research replies its new path, announced before the
  // reply; the stand-in holds it there (space-29, space-1).
  const renamed = await heldBefore(home, "space.group.rename", { group: "2003", name: "Studies", path: "studies" }, (candidate) =>
    candidate.groups.some((group) => group.id === "2003" && group.fullPath === "acme/studies" && group.name === "Studies"));
  replies.push(renamed.reply);
  assert.deepEqual(renamed.reply, { group: { id: "2003", fullPath: "acme/studies", name: "Studies" } });
  assert.deepEqual(groupPaths(renamed.announced), ["acme", "acme/studies"]);
  assert.equal(host.script.groups.find((group) => group.id === "2003")?.fullPath, "acme/studies");

  // A path taken there is refused naming it (space-29).
  const lumen = await home.client.expectOk("space.group.create", { name: "Lumen Labs", path: "lumen-labs", parent: null });
  await home.client.expectError("space.group.rename", { group: lumen.group.id, path: "acme" }, "invalid_request", new RegExp(`^acme is taken at ${HOST_NAME}`));

  // acme holds the project and a group: its deletion is refused with no
  // request reaching the stand-in; the empty group's goes, the state no
  // longer listing it (space-29).
  const quiet = host.script.requests.length;
  await home.client.expectError("space.group.delete", { group: "2002" }, "invalid_request", /^acme is not empty$/);
  assert.deepEqual(apiRequests(host, quiet), []);
  const deleted = await heldBefore(home, "space.group.delete", { group: lumen.group.id }, (candidate) => !candidate.groups.some((group) => group.id === lumen.group.id));
  replies.push(deleted.reply);
  assert.deepEqual(deleted.reply, { deleted: true });
  assert.ok(!host.script.groups.some((group) => group.id === lumen.group.id), "the stand-in holds it no more");
  assert.ok(!groupPaths(await home.client.expectOk("space.get", {})).includes("lumen-labs"));

  // The project moved into the renamed group replies its new path; the
  // row stands under that group at once, its key unchanged and its clone
  // where it was (space-1, space-29).
  const moved = await heldBefore(home, "space.repository.move", { repository: key, groupId: "2003" }, (candidate) =>
    keysUnder(candidate, "acme/studies").includes(key));
  replies.push(moved.reply);
  assert.deepEqual(moved.reply, { repository: { id, fullPath: "acme/studies/plans-spex" } });
  assert.ok(!keysUnder(moved.announced, "acme").includes(key), "no longer under its former group");
  assert.equal(repositoryOf(moved.announced, key).remote, "acme/studies/plans-spex");
  assert.ok(existsSync(clonePath(home.dataDir, key)), "the move moves no clone");

  // Its next sync moves the clone under that group's folder (space-60).
  let mark = home.client.mark();
  await home.client.expectOk("space.sync", { repository: key });
  const synced = await home.client.waitRepository(mark, "acme/studies/plans-spex", (repository) => repository.sync.phase !== "running", 30_000);
  assert.deepEqual([synced.sync.phase, synced.state], ["done", "reachable"], JSON.stringify(synced.sync));
  assert.ok(existsSync(clonePath(home.dataDir, "acme/studies/plans-spex")) && !existsSync(clonePath(home.dataDir, key)));

  // With no group named, it moves into your own group, and its next sync
  // moves the clone under your own group's folder (space-1, space-60).
  const toOwn = await heldBefore(home, "space.repository.move", { repository: "acme/studies/plans-spex", groupId: null }, (candidate) =>
    keysUnder(candidate, LOGIN, true).includes("acme/studies/plans-spex"));
  replies.push(toOwn.reply);
  assert.deepEqual(toOwn.reply, { repository: { id, fullPath: `${LOGIN}/plans-spex` } });
  mark = home.client.mark();
  await home.client.expectOk("space.sync", { repository: "acme/studies/plans-spex" });
  const own = await home.client.waitRepository(mark, `${LOGIN}/plans-spex`, (repository) => repository.sync.phase !== "running", 30_000);
  assert.deepEqual([own.sync.phase, own.state], ["done", "reachable"], JSON.stringify(own.sync));
  assert.ok(existsSync(clonePath(home.dataDir, `${LOGIN}/plans-spex`)));
  assert.ok(git(clonePath(home.dataDir, `${LOGIN}/plans-spex`), "remote", "get-url", "origin").startsWith(`${host.gitOrigin}/${LOGIN}/`));

  // A rename, a deletion and a move the stand-in refuses each reply in
  // its words, and one it answers provider_unavailable that it could
  // not be reached, the state unchanged (space-29).
  const scratchGroup = await home.client.expectOk("space.group.create", { name: "Scratch", path: "scratch", parent: null });
  const before = JSON.stringify((await home.client.expectOk("space.get", {})).groups.map((group) => [group.id, group.fullPath, group.repositories.map((repository) => repository.key)]));
  host.script.refuseGroupRename("Renames are paused for this group.");
  await home.client.expectError("space.group.rename", { group: "2002", name: "Acme Labs" }, "invalid_request", new RegExp(`^${HOST_NAME} refused: Renames are paused for this group\\.$`));
  host.script.refuseGroupRename(null);
  host.script.refuseGroupDelete("Deletions are paused for this group.");
  await home.client.expectError("space.group.delete", { group: scratchGroup.group.id }, "invalid_request", new RegExp(`^${HOST_NAME} refused: Deletions are paused for this group\\.$`));
  host.script.refuseGroupDelete(null);
  host.script.refuseTransfer("Moves are paused for this project.");
  await home.client.expectError("space.repository.move", { repository: `${LOGIN}/plans-spex`, groupId: "2002" }, "invalid_request", new RegExp(`^${HOST_NAME} refused: Moves are paused for this project\\.$`));
  host.script.refuseTransfer(null);
  host.script.unavailable(1);
  await home.client.expectError("space.group.rename", { group: "2002", name: "Acme Labs" }, "invalid_request", new RegExp(`^Could not reach ${HOST_NAME}$`));
  const after = JSON.stringify((await home.client.expectOk("space.get", {})).groups.map((group) => [group.id, group.fullPath, group.repositories.map((repository) => repository.key)]));
  assert.equal(after, before, "a refusal changes nothing");

  // Every reply and broadcast this client was sent names nothing behind
  // the instance (space-30, space-1).
  assert.deepEqual(leaks(host, [...broadcasts(home.client.messages), await home.client.expectOk("space.get", {}), ...replies]), []);
});

test("git-host-14: a rename carries the groups and repositories inside to the new path, a deletion and moves stand before their replies with no read begun; what the stand-in cannot be asked is refused before it is, its refusals in its words, in English and in Chinese", async (t) => {
  const host = await startHost();
  const research = host.script.groups.find((group) => group.fullPath === "acme/research");
  assert.ok(research);
  research.can = { createSubgroup: false, manageMembers: false, rename: false, delete: false };
  const team = host.script.addRepository({ group: "acme", name: "team-spex", role: "Developer" });
  // A group at the instance's root under the login's path, held as
  // colliding (git-host-5).
  host.script.groups.push({ id: "2100", fullPath: LOGIN, name: "Ada's team", kind: "group", members: [{ id: "1001", login: LOGIN, displayName: "Ada Lovelace", role: "Owner" }] });
  const home = await startHome("undo-host", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const { key, id } = await signedWithProject(home, host, "plans");
  const { key: local } = await addFolder(home, gitFolder("drafts"));

  // Refused before any request reaches the stand-in: neither a name nor
  // a path, a blank one, your own group and a group the view does not
  // list; a group holding a spex repository or a group; a local-only or
  // unlisted repository, an unlisted group and one held as colliding
  // (git-host-18, git-host-19, git-host-20).
  const quiet = host.script.requests.length;
  await home.client.expectError("space.group.rename", { group: "2003" }, "invalid_request", /^Give the group a new name or path$/);
  await home.client.expectError("space.group.rename", { group: "2003", name: "   " }, "invalid_request", /^Name the group$/);
  await home.client.expectError("space.group.rename", { group: "2003", path: "  " }, "invalid_request", /^Give the group a path$/);
  await home.client.expectError("space.group.rename", { group: "2001", name: "Me" }, "not_found", new RegExp(`^${HOST_NAME} listed no group 2001$`));
  await home.client.expectError("space.group.rename", { group: "9999", name: "Lab" }, "not_found", new RegExp(`^${HOST_NAME} listed no group 9999$`));
  await home.client.expectError("space.group.delete", { group: "2002" }, "invalid_request", /^acme is not empty$/);
  await home.client.expectError("space.group.delete", { group: "2001" }, "not_found");
  await home.client.expectError("space.group.delete", { group: "9999" }, "not_found");
  await home.client.expectError("space.repository.move", { repository: local, groupId: "2002" }, "invalid_request", /^On this device only$/);
  await home.client.expectError("space.repository.move", { repository: "acme/nowhere-spex", groupId: "2002" }, "not_found");
  await home.client.expectError("space.repository.move", { repository: key, groupId: "9999" }, "not_found", new RegExp(`^${HOST_NAME} listed no group 9999$`));
  await home.client.expectError("space.repository.move", { repository: key, groupId: "2100" }, "invalid_request", /named like your login/);
  assert.deepEqual(apiRequests(host, quiet), []);

  // The stand-in's own refusal of what it says the person may not do,
  // and one it scripts, each in its words (git-host-18..20).
  let asked = host.script.requests.length;
  const notRename = await home.client.expectError("space.group.rename", { group: "2003", name: "Studies" }, "invalid_request");
  assert.equal(notRename, `${HOST_NAME} refused: You are not allowed to rename acme/research.`);
  const notDelete = await home.client.expectError("space.group.delete", { group: "2003" }, "invalid_request");
  assert.equal(notDelete, `${HOST_NAME} refused: You are not allowed to delete acme/research.`);
  const notMove = await home.client.expectError("space.repository.move", { repository: "acme/team-spex", groupId: "2003" }, "invalid_request");
  assert.equal(notMove, `${HOST_NAME} refused: You are not allowed to transfer acme/team-spex.`);
  assert.deepEqual(apiRequests(host, asked), ["PATCH /api/v1/host/groups/2003", "DELETE /api/v1/host/groups/2003", `POST /api/v1/host/repositories/${team.id}/transfer`]);
  host.script.refuseGroupRename("Renames wait for the owner's review.");
  const scriptedRename = await home.client.expectError("space.group.rename", { group: "2002", name: "Acme Labs" }, "invalid_request");
  assert.equal(scriptedRename, `${HOST_NAME} refused: Renames wait for the owner's review.`);
  host.script.refuseGroupRename(null);
  host.script.refuseGroupDelete("Deletions wait for the owner's review.");
  const empty = await home.client.expectOk("space.group.create", { name: "Empty", path: "empty", parent: null });
  const scriptedDelete = await home.client.expectError("space.group.delete", { group: empty.group.id }, "invalid_request");
  assert.equal(scriptedDelete, `${HOST_NAME} refused: Deletions wait for the owner's review.`);
  host.script.refuseGroupDelete(null);
  host.script.refuseTransfer("Moves need the Owner role in the destination.");
  const scripted = await home.client.expectError("space.repository.move", { repository: key, groupId: "2003" }, "invalid_request");
  assert.equal(scripted, `${HOST_NAME} refused: Moves need the Owner role in the destination.`);
  host.script.refuseTransfer(null);

  // A taken path and a taken name are refused as taken (git-host-18,
  // git-host-20).
  await home.client.expectError("space.group.rename", { group: "2002", path: "bob" }, "invalid_request", new RegExp(`^bob is taken at ${HOST_NAME}; choose another name$`));
  host.script.addRepository({ group: "acme/research", name: "plans-spex" });
  const taken = await home.client.expectError("space.repository.move", { repository: key, groupId: "2003" }, "invalid_request");
  assert.equal(taken, "acme/research already holds plans-spex");

  // acme renamed: it, its subgroup and every spex repository inside
  // stand under the new path in a state broadcast before the reply, no
  // read of the stand-in begun (git-host-18, git-host-5).
  asked = host.script.requests.length;
  const renamed = await heldBefore(home, "space.group.rename", { group: "2002", name: "Acme Labs", path: "acme-labs" }, (candidate) =>
    candidate.groups.some((group) => group.id === "2002" && group.fullPath === "acme-labs"));
  assert.deepEqual(renamed.reply, { group: { id: "2002", fullPath: "acme-labs", name: "Acme Labs" } });
  assert.deepEqual(apiRequests(host, asked), ["PATCH /api/v1/host/groups/2002"]);
  assert.deepEqual(groupPaths(renamed.announced), ["acme-labs", "acme-labs/research", LOGIN, "empty"]);
  assert.deepEqual(entry(renamed.announced, "acme-labs").name, "Acme Labs");
  assert.deepEqual(keysUnder(renamed.announced, "acme-labs"), [key, "acme-labs/team-spex"].sort());
  assert.equal(repositoryOf(renamed.announced, key).remote, "acme-labs/plans-spex");
  // A read held after it lists the stand-in's answer, the same.
  const from = home.client.mark();
  const readAt = (await home.client.expectOk("space.get", {})).readAt;
  await home.client.expectOk("space.refresh", {});
  const reread = await home.client.waitSpace(from, (state) => state.readAt !== readAt, 30_000);
  assert.deepEqual(groupPaths(reread), ["acme-labs", "acme-labs/research", LOGIN, "empty"]);
  assert.deepEqual(keysUnder(reread, "acme-labs"), [key, "acme-labs/team-spex"].sort());
  assert.deepEqual(keysUnder(reread, "acme-labs/research"), ["acme-labs/research/plans-spex"]);

  // An empty group deleted, gone before the reply, no read begun
  // (git-host-19).
  const scratch = await home.client.expectOk("space.group.create", { name: "Scratch", path: "scratch", parent: null });
  asked = host.script.requests.length;
  const deleted = await heldBefore(home, "space.group.delete", { group: scratch.group.id }, (candidate) => !candidate.groups.some((group) => group.id === scratch.group.id));
  assert.deepEqual(deleted.reply, { deleted: true });
  assert.deepEqual(apiRequests(host, asked), [`DELETE /api/v1/host/groups/${scratch.group.id}`]);

  // Moved into your own group and back into a group, each standing
  // before its reply with no read begun (git-host-20).
  asked = host.script.requests.length;
  const toOwn = await heldBefore(home, "space.repository.move", { repository: key, groupId: null }, (candidate) => keysUnder(candidate, LOGIN, true).includes(key));
  assert.equal(toOwn.reply.repository.fullPath, `${LOGIN}/plans-spex`);
  const toGroup = await heldBefore(home, "space.repository.move", { repository: key, groupId: "2002" }, (candidate) => keysUnder(candidate, "acme-labs").includes(key));
  assert.equal(toGroup.reply.repository.fullPath, "acme-labs/plans-spex");
  assert.equal(apiRequests(host, asked).filter((request) => request.startsWith("GET")).length, 0, "no read of the stand-in begun");
  assert.deepEqual(apiRequests(host, asked), [`POST /api/v1/host/repositories/${id}/transfer`, `POST /api/v1/host/repositories/${id}/transfer`]);

  // In Chinese, the stand-in's words kept whole (git-host-11).
  await home.client.expectOk("language.set", { language: "zh" });
  const zhRefused = await home.client.expectError("space.group.rename", { group: "2003", name: "Studies" }, "invalid_request");
  assert.equal(zhRefused, `${HOST_NAME} 拒绝了：You are not allowed to rename acme-labs/research.`);
  const zhTaken = await home.client.expectError("space.repository.move", { repository: key, groupId: "2003" }, "invalid_request");
  assert.equal(zhTaken, "acme-labs/research 中已有 plans-spex");
  await home.client.expectError("space.group.delete", { group: "2002" }, "invalid_request", /^acme-labs 不为空$/);
  await home.client.expectError("space.group.rename", { group: "2002" }, "invalid_request", /^请为群组提供新的名称或路径$/);
});
