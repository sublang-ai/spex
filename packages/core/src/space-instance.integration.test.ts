// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The instance is the space (space-74, DR-120): against the stand-in
// Git host, whose remote URLs lie under its Git origin and inside a
// storage group no answer names, no reply or broadcast names anything
// behind the instance; another account's spex repository stands under
// that login; a group named like your login stands apart and takes no
// folder; a transfer is listed under its new group before its sync moves
// the clone; and Git's lines carry no URL under the Git origin, a status
// no rule reads standing as the host's error.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { clonePath, createSpaceHarness, repositoryOf, stringsOf } from "./testing/space-harness.js";
import { STANDIN_STORAGE, type StandinHost } from "./testing/standin-host.js";
import type { GroupsState, ServerMessage } from "./protocol.js";

const fixture = createSpaceHarness();
const { scratch, git, gitFolder, addFolder, startHome, startHost, signIn } = fixture;
test.after(() => fixture.dispose());

/** The stand-in's person, and your own group's repository once signed in. */
const LOGIN = "ada";
const HOST_OWN = `${LOGIN}/${LOGIN}-spex`;
const HOST_NAME = "Stand-in Git host";

/** What names something behind the instance in the strings a client
 * was sent (space-1, space-30): a URL under the stand-in's own — a Git
 * URL or a page — the storage group, or the Git system's name. */
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

test("space-74: nothing behind the instance is named; another login's repository stands under it; a transfer lists under its new group before its sync moves the clone", async (t) => {
  const host = await startHost();
  const team = host.script.addRepository({ group: "acme", name: "team-spex", members: [{ id: "1002", login: "bob", displayName: "Bob", role: "Developer" }] });
  const notes = host.script.addRepository({ group: "bob", name: "notes-spex", role: "Developer" });
  const home = await startHome("instance", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const from = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);

  // Your own group, the groups of the instance by their paths, and the
  // login under which the host lists another account's repository, in
  // the order of their paths (space-1).
  const state = await home.client.expectOk("space.get", {});
  assert.deepEqual(state.groups.map((group) => [group.fullPath, group.own, group.id]), [
    [LOGIN, true, "2001"], ["acme", false, "2002"], ["acme/research", false, "2003"], ["bob", false, null],
  ]);
  const bob = entry(state, "bob");
  assert.deepEqual([bob.name, bob.can], ["bob", { createSubgroup: false, manageMembers: false, rename: false, delete: false }], "another login's entry has no abilities");
  assert.deepEqual(bob.repositories.map((repository) => [repository.key, repository.state, repository.remote]), [["bob/notes-spex", "absent", "bob/notes-spex"]]);
  const listedTeam = repositoryOf(state, "acme/team-spex");
  assert.deepEqual([listedTeam.id, listedTeam.remote], [team.id, "acme/team-spex"], "a listed remote reads as its path in the instance");

  // Joined, it clones under `workspace/bob/`; its members are read with
  // no page (space-63, space-62).
  const notesFolder = join(mkdtempSync(join(scratch, "notes-")), "notes");
  let mark = home.client.mark();
  await home.client.expectOk("space.join", { hostId: notes.id, folder: notesFolder });
  const joined = await home.client.waitRepository(mark, "bob/notes-spex", (repository) => repository.state === "reachable" && repository.folder !== null);
  assert.equal(joined.remote, "bob/notes-spex");
  const notesClone = clonePath(home.dataDir, "bob/notes-spex");
  assert.ok(existsSync(join(notesClone, ".git")));
  assert.ok(git(notesClone, "remote", "get-url", "origin").startsWith(`${host.gitOrigin}/bob/`), "the clone keeps the host's Git URL");
  const members = await home.client.expectOk("space.members", { repository: "bob/notes-spex" });
  const teamMembers = await home.client.expectOk("space.members", { repository: "acme/team-spex" });
  assert.deepEqual(teamMembers.members.map((member) => [member.login, member.role]), [[LOGIN, "Owner"], ["bob", "Developer"]]);

  // No longer listed, it reads unreachable under its key's group with
  // its files untouched (space-61).
  const files = readdirSync(notesClone).sort();
  host.script.removeMember(notes.id);
  mark = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  const unlisted = await home.client.waitRepository(mark, "bob/notes-spex", (repository) => repository.state === "unreachable");
  assert.equal(unlisted.reason, "No longer shared with you");
  assert.deepEqual(readdirSync(notesClone).sort(), files, "nothing on this device is deleted");
  assert.ok(entry(await home.client.expectOk("space.get", {}), "bob").repositories.some((repository) => repository.key === "bob/notes-spex"));

  // A project picked into acme and transferred by the stand-in into
  // acme/research: a Refresh lists it there with its key unchanged, and
  // its next sync moves the clone (space-1, space-60).
  const code = gitFolder("plans");
  const { key: local } = await addFolder(home, code);
  mark = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", groupId: "2002", name: "plans" } });
  const picked = await home.client.waitRepository(mark, "acme/plans-spex", (repository) => repository.sync.phase === "done", 30_000);
  assert.ok(picked.id);
  assert.ok(git(clonePath(home.dataDir, "acme/plans-spex"), "remote", "get-url", "origin").startsWith(`${host.gitOrigin}/${STANDIN_STORAGE}/acme/`));
  host.script.rename(picked.id, { group: "acme/research" });
  mark = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  const listed = await home.client.waitSpace(mark, (candidate) => entry(candidate, "acme/research").repositories.some((repository) => repository.key === "acme/plans-spex"));
  assert.ok(!entry(listed, "acme").repositories.some((repository) => repository.key === "acme/plans-spex"), "no longer under its former group");
  assert.equal(repositoryOf(listed, "acme/plans-spex").remote, "acme/research/plans-spex");
  assert.ok(existsSync(clonePath(home.dataDir, "acme/plans-spex")), "a read moves no clone");
  mark = home.client.mark();
  await home.client.expectOk("space.sync", { repository: "acme/plans-spex" });
  const after = await home.client.waitRepository(mark, "acme/research/plans-spex", (repository) => repository.sync.phase !== "running", 30_000);
  assert.deepEqual([after.sync.phase, after.state], ["done", "reachable"], JSON.stringify(after.sync));
  assert.ok(existsSync(clonePath(home.dataDir, "acme/research/plans-spex")) && !existsSync(clonePath(home.dataDir, "acme/plans-spex")));

  // Every state and members reply this client was sent names nothing
  // behind the instance (space-30).
  assert.deepEqual(leaks(host, [...broadcasts(home.client.messages), await home.client.expectOk("space.get", {}), members, teamMembers]), []);
});

test("space-74: a group named like your login stands apart, its repositories unreachable with no folder, unjoined and unpicked; a root path an account holds is taken", async (t) => {
  const host = await startHost();
  // A group at the instance's root under the login's path, as a later
  // sign-up leaves one, holding a repository named like your own's.
  const named = { id: "2100", fullPath: LOGIN, name: "Ada's team", kind: "group" as const, members: [{ id: "1001", login: LOGIN, displayName: "Ada Lovelace", role: "Owner" }] };
  host.script.groups.push(named);
  const clash = host.script.addRepository({ group: named.id, name: `${LOGIN}-spex` });
  const home = await startHome("collision", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const from = home.client.mark();
  await signIn(home, host);
  const own = await home.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);

  // Your own group's repository is made in your own namespace, never
  // taken from the group named like you (space-4).
  assert.notEqual(own.id, clash.id);
  const ownClone = clonePath(home.dataDir, HOST_OWN);
  // Its remote is named by the instance's folder (DR-127).
  assert.ok(git(ownClone, "remote", "get-url", `@127.0.0.1_${new URL(host.url).port}`).startsWith(`${host.gitOrigin}/${LOGIN}/`));

  // The group stands as an entry of its own after yours; your own
  // group's rows stay yours (space-1, space-61).
  const state = await home.client.expectOk("space.get", {});
  assert.deepEqual(state.groups.map((group) => [group.fullPath, group.own, group.id]), [
    [LOGIN, true, "2001"], ["acme", false, "2002"], ["acme/research", false, "2003"], [LOGIN, false, named.id],
  ]);
  assert.deepEqual(entry(state, LOGIN, true).repositories.map((repository) => [repository.key, repository.state]), [[HOST_OWN, "reachable"]]);
  const apart = entry(state, LOGIN);
  assert.deepEqual(apart.repositories.map((repository) => [repository.key, repository.state, repository.reason, repository.remote, repository.branch]), [
    [`${LOGIN}/${LOGIN}-spex@${clash.id}`, "unreachable", "a group named like your login", `${LOGIN}/${LOGIN}-spex`, null],
  ]);

  // Join, a pick joining it and a pick creating in that group are each
  // refused with the cause; no folder is made for it (space-29).
  await home.client.expectError("space.join", { hostId: clash.id, folder: join(scratch, "nowhere") }, "invalid_request", /named like your login/);
  const { key: local } = await addFolder(home, gitFolder("drafts"));
  await home.client.expectError("space.pick", { repository: local, choice: { kind: "join", hostId: clash.id } }, "invalid_request", /named like your login/);
  await home.client.expectError("space.pick", { repository: local, choice: { kind: "create", groupId: named.id, name: "drafts" } }, "invalid_request", /named like your login/);
  assert.deepEqual(readdirSync(join(home.dataDir, "workspace", LOGIN)).sort(), [`${LOGIN}-spex`, "drafts-spex"]);

  // A root path the stand-in holds an account under is taken (space-68).
  await home.client.expectError("space.group.create", { name: "Bob", path: "bob", parent: null }, "invalid_request", /taken/);
  assert.ok(!host.script.groups.some((group) => group.fullPath === "bob"));

  assert.deepEqual(leaks(host, [...broadcasts(home.client.messages), await home.client.expectOk("space.get", {})]), []);
});

test("space-74: a 500 stops a check, a push and a join as the host's error; a refusal's remote: words read the clone's URL as its path and any other as the host's name", async (t) => {
  const host = await startHost();
  const team = host.script.addRepository({ group: "acme", name: "team-spex" });
  const home = await startHome("lines", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  let mark = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  const { key: local } = await addFolder(home, gitFolder("lines"));
  mark = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", groupId: "2002", name: "lines" } });
  const key = "acme/lines-spex";
  await home.client.waitRepository(mark, key, (repository) => repository.sync.phase === "done", 30_000);
  const clone = clonePath(home.dataDir, key);
  const remote = git(clone, "remote", "get-url", "origin");
  assert.ok(remote.startsWith(`${host.gitOrigin}/${STANDIN_STORAGE}/`), remote);

  // An HTTP status no rule reads is the host's error, with Retry, naming
  // no part of the Git origin (space-15, space-32).
  const clean = (text: string): void => {
    assert.ok(!text.includes(host.gitOrigin) && !text.includes(host.url) && !text.includes(STANDIN_STORAGE), text);
  };
  host.script.failTransport(500);
  const checked = await home.client.settle("space.fetch", { repository: key });
  assert.ok(checked.sync.phase === "stopped", JSON.stringify(checked.sync));
  assert.deepEqual([checked.sync.step, checked.sync.message, checked.sync.retry], ["check", `${HOST_NAME} answered with an error (HTTP 500)`, true]);
  clean(checked.sync.message);
  clean(checked.sync.guidance);

  host.script.failTransport(500, "push");
  writeFileSync(join(clone, "notes.txt"), "to send\n");
  const pushed = await home.client.settle("space.sync", { repository: key });
  assert.ok(pushed.sync.phase === "stopped", JSON.stringify(pushed.sync));
  assert.deepEqual([pushed.sync.step, pushed.sync.message, pushed.sync.retry], ["push", `${HOST_NAME} answered with an error (HTTP 500)`, true]);
  clean(pushed.sync.message);
  clean(pushed.sync.guidance);

  host.script.failTransport(500);
  mark = home.client.mark();
  await home.client.expectOk("space.join", { hostId: team.id, folder: join(mkdtempSync(join(scratch, "team-")), "team") });
  const joining = await home.client.waitRepository(mark, "acme/team-spex", (repository) => repository.sync.phase === "stopped");
  assert.ok(joining.sync.phase === "stopped", JSON.stringify(joining.sync));
  assert.deepEqual([joining.sync.op, joining.sync.message, joining.sync.retry], ["join", `${HOST_NAME} answered with an error (HTTP 500)`, true]);
  clean(joining.sync.message);
  clean(joining.sync.guidance);
  host.script.failTransport(null);

  // The host's refusal in `remote:` lines naming the clone's own URL —
  // without `.git`, with a trailing slash — and another under the Git
  // origin reads the first as the repository's path in the instance and
  // the second as the host's name, and the repository turns read-only
  // with those words (space-15, space-61).
  const bare = remote.replace(/\.git$/, "");
  host.script.refusePush(`Push refused for ${bare}/ and ${host.gitOrigin}/${STANDIN_STORAGE}/acme/other-spex.git by a rule.`);
  writeFileSync(join(clone, "notes.txt"), "to send again\n");
  const refused = await home.client.settle("space.sync", { repository: key });
  assert.ok(refused.sync.phase === "stopped", JSON.stringify(refused.sync));
  const words = `${HOST_NAME} refused: Push refused for ${key} and ${HOST_NAME} by a rule.`;
  assert.deepEqual([refused.sync.cause, refused.sync.message], ["refused", words]);
  assert.equal(refused.sync.guidance, "Membership decides who may send here: use Share, or ask a member who may share it.");
  const readOnly = await home.client.repository(key);
  assert.deepEqual([readOnly.state, readOnly.reason], ["read-only", words]);
  host.script.refusePush(null);

  assert.deepEqual(leaks(host, [...broadcasts(home.client.messages), await home.client.expectOk("space.get", {})]), []);
});
