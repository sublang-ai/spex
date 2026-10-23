// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The instance is the space (space-74, DR-120), each clone at it keyed
// under its folder (DR-127): against the stand-in
// Git host, whose remote URLs lie under its Git origin and inside a
// storage group no answer names, no reply or broadcast names anything
// behind the instance; another account's spex repository stands under
// that login; a group named like your login stands apart and takes no
// folder; a transfer is listed under its new group before its sync moves
// the clone; a clone keyed outside the instance's folder, or one the
// instances migration deferred, moves under it at its next sync; Git's
// lines carry no URL under the Git origin, a status no rule reads
// standing as the host's error; and a home signs in to several
// instances by their origins, each entry appended in its turn, each
// clone's transport, commit identity and commands going to its own
// instance, a group colliding with a login within its own instance
// alone, and a host repository two instances over one Git backend list
// one row, governed by the instance its clone is keyed under.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createSessionStore } from "@sublang/playbook/session-store";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { GitHostClient, HostError, credentialsPath, fileCredentialStore, type StoredCredential } from "./git-host.js";
import { Home } from "./home.js";
import { canonicalOrigin } from "./instance.js";
import { needsInstancesMigration } from "./migrate-instances.js";
import { encodePlacementFile, PLACEMENTS_DIR } from "./placements.js";
import { bareOf, clonePath, createSpaceHarness, hostFolder, hostKey, instanceOf, OWN, OWN_KEY, ownClone, placementOf, prefsOf, repositoryOf, rowsOf, stringsOf } from "./testing/space-harness.js";
import { STANDIN_STORAGE, type StandinHost } from "./testing/standin-host.js";
import type { GroupsState, InstanceGroupState, RepositoryState, ServerMessage } from "./protocol.js";

const fixture = createSpaceHarness();
const { scratch, git, gitFolder, bareRepo, addFolder, sleep, startHome, startHost, signIn, signOut, forget, runTurn } = fixture;
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

/** The entry an instance's heading lists under a path: your namespace
 * there where `mine`, else a group or another account's login. */
function entry(state: GroupsState, host: StandinHost, fullPath: string, mine = false): InstanceGroupState {
  const entries = instanceOf(state, host.url)?.groups ?? [];
  const found = entries.find((group) => group.fullPath === fullPath && group.mine === mine);
  assert.ok(found, `no ${mine ? "namespace " : ""}entry ${fullPath} in ${JSON.stringify(entries.map((group) => [group.fullPath, group.mine]))}`);
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

  // Your own group by its folder's name; under the instance its groups,
  // your namespace there and the login under which the host lists
  // another account's repository, in the order of their paths (space-1).
  const state = await home.client.expectOk("space.get", {});
  assert.equal(state.own.name, LOGIN);
  assert.deepEqual(instanceOf(state, host.url)?.groups.map((group) => [group.fullPath, group.id, group.login, group.mine]), [
    ["acme", "2002", null, false], ["acme/research", "2003", null, false], [LOGIN, null, LOGIN, true], ["bob", null, "bob", false],
  ]);
  const bob = entry(state, host, "bob");
  assert.deepEqual([bob.name, bob.can], ["bob", { createSubgroup: false, manageMembers: false, rename: false, delete: false }], "another login's entry has no abilities");
  assert.deepEqual(bob.repositories.map((repository) => [repository.key, repository.state, placementOf(repository, host.url).path]), [[hostKey(host, "bob/notes-spex"), "absent", "bob/notes-spex"]]);
  const listedTeam = repositoryOf(state, hostKey(host, "acme/team-spex"));
  assert.deepEqual([listedTeam.id, placementOf(listedTeam, host.url).path], [team.id, "acme/team-spex"], "a listed remote reads as its path in the instance");

  // Joined, it clones under `workspace/<folder>/bob/`, its remote named
  // by the instance's folder (DR-127); its members are read with no page
  // (space-63, space-62).
  const notesFolder = join(mkdtempSync(join(scratch, "notes-")), "notes");
  let mark = home.client.mark();
  await home.client.expectOk("space.join", { instance: host.url, hostId: notes.id, folder: notesFolder });
  const joined = await home.client.waitRepository(mark, hostKey(host, "bob/notes-spex"), (repository) => repository.state === "reachable" && repository.folder !== null);
  assert.equal(placementOf(joined, host.url).path, "bob/notes-spex");
  const notesClone = clonePath(home.dataDir, hostKey(host, "bob/notes-spex"));
  assert.ok(existsSync(join(notesClone, ".git")));
  assert.ok(git(notesClone, "remote", "get-url", hostFolder(host)).startsWith(`${host.gitOrigin}/bob/`), "the clone keeps the host's Git URL");
  const members = await home.client.expectOk("space.members", { repository: hostKey(host, "bob/notes-spex") });
  const teamMembers = await home.client.expectOk("space.members", { repository: hostKey(host, "acme/team-spex") });
  assert.deepEqual(teamMembers.members.map((member) => [member.login, member.role]), [[LOGIN, "Owner"], ["bob", "Developer"]]);

  // No longer listed, it reads unreachable under its key's group with
  // its files untouched (space-61).
  const files = readdirSync(notesClone).sort();
  host.script.removeMember(notes.id);
  mark = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  const unlisted = await home.client.waitRepository(mark, hostKey(host, "bob/notes-spex"), (repository) => repository.state === "unreachable");
  assert.equal(unlisted.reason, "No longer shared with you");
  assert.deepEqual(readdirSync(notesClone).sort(), files, "nothing on this device is deleted");
  assert.ok(entry(await home.client.expectOk("space.get", {}), host, "bob").repositories.some((repository) => repository.key === hostKey(host, "bob/notes-spex")));

  // A project picked into acme, the pick moving the clone under the
  // instance's folder with its remote named by it (storage-35), and
  // transferred by the stand-in into acme/research: a Refresh lists it
  // there with its key unchanged, and its next sync moves the clone
  // (space-1, space-60).
  const code = gitFolder("plans");
  const { key: local } = await addFolder(home, code);
  mark = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: host.url, groupId: "2002", name: "plans" } });
  const picked = await home.client.waitRepository(mark, hostKey(host, "acme/plans-spex"), (repository) => repository.sync.phase === "done", 30_000);
  assert.ok(picked.id);
  assert.ok(git(clonePath(home.dataDir, hostKey(host, "acme/plans-spex")), "remote", "get-url", hostFolder(host)).startsWith(`${host.gitOrigin}/${STANDIN_STORAGE}/acme/`));
  host.script.rename(picked.id, { group: "acme/research" });
  mark = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  const listed = await home.client.waitSpace(mark, (candidate) => entry(candidate, host, "acme/research").repositories.some((repository) => repository.key === hostKey(host, "acme/plans-spex")));
  assert.ok(!entry(listed, host, "acme").repositories.some((repository) => repository.key === hostKey(host, "acme/plans-spex")), "no longer under its former group");
  assert.equal(placementOf(repositoryOf(listed, hostKey(host, "acme/plans-spex")), host.url).path, "acme/research/plans-spex");
  assert.ok(existsSync(clonePath(home.dataDir, hostKey(host, "acme/plans-spex"))), "a read moves no clone");
  mark = home.client.mark();
  await home.client.expectOk("space.sync", { repository: hostKey(host, "acme/plans-spex") });
  const after = await home.client.waitRepository(mark, hostKey(host, "acme/research/plans-spex"), (repository) => repository.sync.phase !== "running", 30_000);
  assert.deepEqual([after.sync.phase, after.state], ["done", "reachable"], JSON.stringify(after.sync));
  assert.ok(existsSync(clonePath(home.dataDir, hostKey(host, "acme/research/plans-spex"))) && !existsSync(clonePath(home.dataDir, hostKey(host, "acme/plans-spex"))));

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
  assert.ok(git(ownClone, "remote", "get-url", hostFolder(host)).startsWith(`${host.gitOrigin}/${LOGIN}/`));

  // The group stands as an entry of its own after your namespace; your
  // own group's rows stay yours (space-1, space-61).
  const state = await home.client.expectOk("space.get", {});
  assert.deepEqual(instanceOf(state, host.url)?.groups.map((group) => [group.fullPath, group.id, group.login, group.mine]), [
    ["acme", "2002", null, false], ["acme/research", "2003", null, false], [LOGIN, null, LOGIN, true], [LOGIN, named.id, null, false],
  ]);
  assert.deepEqual(state.own.repositories.map((repository) => [repository.key, repository.state]), [[HOST_OWN, "reachable"]]);
  assert.deepEqual(entry(state, host, LOGIN, true).repositories, []);
  const apart = entry(state, host, LOGIN);
  assert.deepEqual(apart.repositories.map((repository) => [repository.key, repository.state, repository.reason, placementOf(repository, host.url).path, placementOf(repository, host.url).branch]), [
    [`${hostFolder(host)}/${LOGIN}/${LOGIN}-spex@${clash.id}`, "unreachable", "a group named like your login", `${LOGIN}/${LOGIN}-spex`, null],
  ]);

  // Join, a pick joining it and a pick creating in that group are each
  // refused with the cause; no folder is made for it (space-29).
  await home.client.expectError("space.join", { instance: host.url, hostId: clash.id, folder: join(scratch, "nowhere") }, "invalid_request", /named like your login/);
  const { key: local } = await addFolder(home, gitFolder("drafts"));
  await home.client.expectError("space.pick", { repository: local, choice: { kind: "join", instance: host.url, hostId: clash.id } }, "invalid_request", /named like your login/);
  await home.client.expectError("space.pick", { repository: local, choice: { kind: "create", instance: host.url, groupId: named.id, name: "drafts" } }, "invalid_request", /named like your login/);
  assert.deepEqual(readdirSync(join(home.dataDir, "workspace", LOGIN)).sort(), [`${LOGIN}-spex`, "drafts-spex"]);

  // A root path the stand-in holds an account under is taken (space-68).
  await home.client.expectError("space.group.create", { instance: host.url, name: "Bob", path: "bob", parent: null }, "invalid_request", /taken/);
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
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: host.url, groupId: "2002", name: "lines" } });
  const key = hostKey(host, "acme/lines-spex");
  await home.client.waitRepository(mark, key, (repository) => repository.sync.phase === "done", 30_000);
  const clone = clonePath(home.dataDir, key);
  const remote = git(clone, "remote", "get-url", hostFolder(host));
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
  await home.client.expectOk("space.join", { instance: host.url, hostId: team.id, folder: join(mkdtempSync(join(scratch, "team-")), "team") });
  const joining = await home.client.waitRepository(mark, hostKey(host, "acme/team-spex"), (repository) => repository.sync.phase === "stopped");
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
  const words = `${HOST_NAME} refused: Push refused for acme/lines-spex and ${HOST_NAME} by a rule.`;
  assert.deepEqual([refused.sync.cause, refused.sync.message], ["refused", words]);
  assert.equal(refused.sync.guidance, "Membership decides who may send here: use Share, or ask a member who may share it.");
  const readOnly = await home.client.repository(key);
  assert.deepEqual([readOnly.state, readOnly.reason], ["read-only", words]);
  host.script.refusePush(null);

  assert.deepEqual(leaks(host, [...broadcasts(home.client.messages), await home.client.expectOk("space.get", {})]), []);
});

test("space-60: a clone an earlier Spex keyed outside the instance's folder, its remote origin recording the host's id, moves under that folder at its next sync with its remote renamed, its upstream and fetched spex following; your own group's own repository keeps its folder", async (t) => {
  const host = await startHost();
  const folder = hostFolder(host);
  const home = await startHome("earlier", { host, project: false, extra: { signIn: "browser" } });
  let mark = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  const code = gitFolder("earlier");
  const { key: local } = await addFolder(home, code);
  mark = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: host.url, groupId: "2002", name: "earlier" } });
  const key = hostKey(host, "acme/earlier-spex");
  const picked = await home.client.waitRepository(mark, key, (repository) => repository.sync.phase === "done", 30_000);
  assert.ok(picked.id);
  await home.stop();

  // The clone as an earlier Spex left it: keyed by its path in the
  // instance, its remote `origin` beside the host's id, its pair naming
  // that key. Its next sync keys it under the instance's folder and
  // names its remote by that folder (DR-127).
  const legacy = "acme/earlier-spex";
  mkdirSync(dirname(clonePath(home.dataDir, legacy)), { recursive: true });
  renameSync(clonePath(home.dataDir, key), clonePath(home.dataDir, legacy));
  git(clonePath(home.dataDir, legacy), "remote", "rename", folder, "origin");
  const file = Home.load(home.dataDir);
  file.move([{ from: key, to: legacy }]);
  file.save();

  const again = await startHome("earlier-again", { dataDir: home.dataDir, project: false, extra: { signIn: "browser" } });
  t.after(() => again.stop());
  assert.equal((await again.client.repository(legacy)).id, picked.id);
  mark = again.client.mark();
  await again.client.expectOk("space.sync", { repository: legacy });
  const moved = await again.client.waitRepository(mark, key, (repository) => repository.sync.phase !== "running" && repository.sync.phase !== "idle", 30_000);
  assert.deepEqual([moved.sync.phase, moved.state, moved.id, placementOf(moved, host.url).path], ["done", "reachable", picked.id, "acme/earlier-spex"], JSON.stringify(moved.sync));
  const clone = clonePath(home.dataDir, key);
  assert.ok(existsSync(join(clone, ".git")) && !existsSync(clonePath(home.dataDir, legacy)), "the clone moved under the instance's folder");
  assert.deepEqual(git(clone, "remote").split("\n"), [folder], "its one remote is named by the instance's folder");
  assert.equal(git(clone, "config", "--get", `remote.${folder}.spexId`), picked.id);
  assert.equal(git(clone, "config", "--get", "branch.spex.remote"), folder);
  assert.equal(git(clone, "rev-parse", `refs/remotes/${folder}/spex`), git(clone, "rev-parse", "spex"));
  assert.equal(Home.load(home.dataDir).keyForFolder(code), key, "its pair follows it");
  assert.ok((await again.client.expectOk("project.list", {})).some((project) => project.id === key));

  // Your own group's own repository syncs where it stands, its folder
  // outside every instance's.
  const own = await again.client.settle("space.sync", { repository: HOST_OWN });
  assert.equal(own.sync.phase, "done", JSON.stringify(own.sync));
  assert.ok(existsSync(join(clonePath(home.dataDir, HOST_OWN), ".git")));
  assert.ok(!existsSync(clonePath(home.dataDir, hostKey(host, HOST_OWN))));
});

/** A clone's remote as a Spex before DR-127 left it: named `origin`,
 * the host's id at the top level of its Git configuration rather than in
 * the remote's section (storage-34); that id. */
function asFormerRemote(clone: string, folder: string): string {
  git(clone, "remote", "rename", folder, "origin");
  const id = git(clone, "config", "--get", "remote.origin.spexId");
  git(clone, "config", "--unset", "remote.origin.spexId");
  git(clone, "config", "spex.repositoryId", id);
  return id;
}

test("space-60, storage-34: a clone the instances migration deferred, a live session's lease beneath it, is listed by the key it kept with the id it records at the top level, and syncs only once its next sync has moved it under the instance's folder, its remote renamed with the id moved into its section", async (t) => {
  const host = await startHost();
  const folder = hostFolder(host);
  const home = await startHome("deferred", { host, project: false, extra: { signIn: "browser" } });
  let mark = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  const code = gitFolder("deferred");
  const { key: local } = await addFolder(home, code);
  mark = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: host.url, groupId: "2002", name: "deferred" } });
  const key = hostKey(host, "acme/deferred-spex");
  const picked = await home.client.waitRepository(mark, key, (repository) => repository.sync.phase === "done", 30_000);
  assert.ok(picked.id);
  await home.stop();

  // The home as a Spex before DR-127 left it: `home.yaml` in format 1,
  // the clone keyed by its path in the instance with its remote
  // `origin`, your own group's remote `origin` too.
  const legacy = "acme/deferred-spex";
  const legacyClone = clonePath(home.dataDir, legacy);
  mkdirSync(dirname(legacyClone), { recursive: true });
  renameSync(clonePath(home.dataDir, key), legacyClone);
  asFormerRemote(legacyClone, folder);
  const ownId = asFormerRemote(clonePath(home.dataDir, HOST_OWN), folder);
  const current = Home.load(home.dataDir).file;
  writeFileSync(join(home.dataDir, "home.yaml"), stringifyYaml({
    format: 1, device: current.device,
    host: { url: current.origin, clientId: "spex", account: current.instances[0].account },
    own: current.own, folders: current.folders.map((pair) => pair.repository === key ? { ...pair, repository: legacy } : pair),
  }));
  // A writer of another process holds the clone where it is.
  const sessions = createSessionStore({ sessionsDir: join(legacyClone, "sessions") });
  await sessions.prepare();
  const live = await sessions.acquireManagement(randomUUID());
  let released = false;
  try {
    const again = await startHome("deferred-again", { dataDir: home.dataDir, project: false, extra: { signIn: "browser" } });
    t.after(() => again.stop());
    assert.ok(existsSync(join(legacyClone, ".git")) && !existsSync(clonePath(home.dataDir, key)), "deferred, it keeps its key");
    assert.deepEqual(git(clonePath(home.dataDir, HOST_OWN), "remote").split("\n"), [folder], "your own group's remote is renamed in place");
    // Its id moved into that remote's section in the same step; the
    // deferred clone keeps its own at the top level (storage-34).
    assert.equal(git(clonePath(home.dataDir, HOST_OWN), "config", "--get", `remote.${folder}.spexId`), ownId);
    assert.throws(() => git(clonePath(home.dataDir, HOST_OWN), "config", "--get", "spex.repositoryId"));
    assert.equal(git(legacyClone, "config", "--get", "spex.repositoryId"), picked.id);
    mark = again.client.mark();
    await again.client.expectOk("space.refresh", {});
    const state = await again.client.waitSpace(mark, (candidate) => instanceOf(candidate, host.url)?.read.phase === "idle" && typeof instanceOf(candidate, host.url)?.readAt === "number", 30_000);
    const rows = rowsOf(state).filter((repository) => repository.id === picked.id);
    assert.deepEqual(rows.map((repository) => repository.key), [legacy], "listed once, by the key it kept, with the id it records at the top level as its placement's");
    assert.ok(entry(state, host, "acme").repositories.some((repository) => repository.key === legacy), "under its group at the instance");

    // Its sync moves it first, which the lease refuses: nothing syncs.
    const stopped = await again.client.settle("space.sync", { repository: legacy });
    assert.ok(stopped.sync.phase === "stopped" && stopped.sync.cause === "lease" && stopped.sync.step === "check", JSON.stringify(stopped.sync));
    assert.ok(existsSync(join(legacyClone, ".git")) && !existsSync(clonePath(home.dataDir, key)));

    await live.release();
    released = true;
    mark = again.client.mark();
    await again.client.expectOk("space.sync", { repository: legacy });
    const moved = await again.client.waitRepository(mark, key, (repository) => repository.sync.phase !== "running" && repository.sync.phase !== "idle", 30_000);
    assert.deepEqual([moved.sync.phase, moved.state, moved.id], ["done", "reachable", picked.id], JSON.stringify(moved.sync));
    const clone = clonePath(home.dataDir, key);
    assert.ok(existsSync(join(clone, ".git")) && !existsSync(legacyClone), "moved under the instance's folder");
    assert.deepEqual(git(clone, "remote").split("\n"), [folder], "its remote named by the folder");
    assert.equal(git(clone, "config", "--get", `remote.${folder}.spexId`), picked.id, "its id moved into the renamed remote's section");
    assert.throws(() => git(clone, "config", "--get", "spex.repositoryId"));
    assert.equal(git(clone, "config", "--get", "branch.spex.remote"), folder);
    assert.equal(Home.load(home.dataDir).keyForFolder(code), key, "its pair follows it");
    // The migration's receipt names it no longer, so no start moves
    // anything at the key it kept.
    assert.equal(needsInstancesMigration(home.dataDir), false);
    const receipts = readdirSync(join(home.dataDir, "local", "migrations"));
    const deferred = receipts.flatMap((id) => {
      const receipt = JSON.parse(readFileSync(join(home.dataDir, "local", "migrations", id, "receipt.json"), "utf8")) as { kind: string; deferred?: unknown[] };
      return receipt.kind === "instances" ? receipt.deferred ?? [] : [];
    });
    assert.deepEqual(deferred, []);
  } finally { if (!released) await live.release(); }
});

test("storage-35, storage-5: a pick of a clone in your own group's folder moves it under the instance's folder as the creation or the join lands, its pair, sessions and preferences following; a session's lease beneath leaves it there, read as the instance's by its remote, until its next sync moves it", async (t) => {
  const host = await startHost();
  const folder = hostFolder(host);
  const listed = host.script.addRepository({ group: "acme", name: "joined-spex" });
  const home = await startHome("pick-move", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  let mark = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  // Each pick's first sync is held before its first step, so only the
  // pick itself may have moved its clone.
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const held = new Set<string>();
  home.hooks.beforeStep = async ({ op, step, repository }) => { if (op === "sync" && step === "save" && held.has(repository)) await gate; };

  // A creation: the pick's reply finds the clone moved, its remote named
  // by the instance's folder beside the host's id, its pair and its
  // session following it.
  const created = gitFolder("created");
  const { key: createdLocal } = await addFolder(home, created);
  const sessionId = await runTurn(home, createdLocal, "Before the pick");
  const createdKey = hostKey(host, "acme/created-spex");
  held.add(createdLocal).add(createdKey);
  mark = home.client.mark();
  await home.client.expectOk("space.pick", { repository: createdLocal, choice: { kind: "create", instance: host.url, groupId: "2002", name: "created" } });
  const createdClone = clonePath(home.dataDir, createdKey);
  assert.ok(existsSync(join(createdClone, ".git")) && !existsSync(clonePath(home.dataDir, createdLocal)), "moved as the creation landed");
  assert.deepEqual(git(createdClone, "remote").split("\n"), [folder]);
  assert.ok(git(createdClone, "config", "--get", `remote.${folder}.spexId`).length > 0);
  assert.equal(Home.load(home.dataDir).keyForFolder(created), createdKey, "its pair follows it");
  assert.ok((await home.client.expectOk("session.list", {})).some((session) => session.id === sessionId && session.projectId === createdKey), "its session follows it");
  assert.ok(existsSync(join(createdClone, "sessions", `${sessionId}.json`)));

  // A join, the notice it was picked with following it.
  const joinedCode = gitFolder("joined");
  const { key: joinedLocal } = await addFolder(home, joinedCode);
  const joinedKey = hostKey(host, "acme/joined-spex");
  held.add(joinedLocal).add(joinedKey);
  await home.client.expectOk("space.pick", { repository: joinedLocal, choice: { kind: "join", instance: host.url, hostId: listed.id }, noticed: true });
  const joinedClone = clonePath(home.dataDir, joinedKey);
  assert.ok(existsSync(join(joinedClone, ".git")) && !existsSync(clonePath(home.dataDir, joinedLocal)), "moved as the join landed");
  assert.deepEqual(git(joinedClone, "remote").split("\n"), [folder]);
  assert.equal(git(joinedClone, "config", "--get", `remote.${folder}.spexId`), listed.id);
  assert.equal(Home.load(home.dataDir).keyForFolder(joinedCode), joinedKey);
  assert.equal(prefsOf(home.dataDir)[`sync:${joinedKey}:${folder}:noticed`], true, "its sync preferences follow it, under its placement's remote");
  assert.deepEqual(Object.keys(prefsOf(home.dataDir)).filter((name) => name.startsWith(`sync:${joinedLocal}:`)), []);

  // Released, each first sync runs where its clone now lies.
  release();
  for (const key of [createdKey, joinedKey]) {
    const synced = await home.client.waitRepository(mark, key, (repository) => repository.sync.phase !== "running" && repository.sync.phase !== "idle", 30_000);
    assert.deepEqual([synced.sync.phase, synced.state], ["done", "reachable"], `${key}: ${JSON.stringify(synced.sync)}`);
  }
  home.hooks.beforeStep = undefined;

  // A session's lease beneath: the pick stands, the clone stays in your
  // own group's folder with its remote named by the instance's folder,
  // and its first sync stops at the move the lease refuses.
  const leased = gitFolder("leased");
  const { key: leasedLocal } = await addFolder(home, leased);
  const leasedClone = clonePath(home.dataDir, leasedLocal);
  const leasedKey = hostKey(host, "acme/leased-spex");
  const sessions = createSessionStore({ sessionsDir: join(leasedClone, "sessions") });
  await sessions.prepare();
  const live = await sessions.acquireManagement(randomUUID());
  let released = false;
  try {
    mark = home.client.mark();
    await home.client.expectOk("space.pick", { repository: leasedLocal, choice: { kind: "create", instance: host.url, groupId: "2002", name: "leased" } });
    const stopped = await home.client.waitRepository(mark, leasedLocal, (repository) => repository.sync.phase === "stopped", 30_000);
    assert.ok(stopped.sync.phase === "stopped" && stopped.sync.cause === "lease" && stopped.sync.step === "check", JSON.stringify(stopped.sync));
    assert.ok(existsSync(join(leasedClone, ".git")) && !existsSync(clonePath(home.dataDir, leasedKey)), "it stays where it lies");
    assert.deepEqual(git(leasedClone, "remote").split("\n"), [folder], "its remote names its instance");
    assert.ok(stopped.id, "it records the host's id");
    assert.equal(Home.load(home.dataDir).keyForFolder(leased), leasedLocal);
    assert.ok(entry(await home.client.expectOk("space.get", {}), host, "acme").repositories.some((repository) => repository.key === leasedLocal), "listed under its group at the instance");

    await live.release();
    released = true;
    mark = home.client.mark();
    await home.client.expectOk("space.sync", { repository: leasedLocal });
    const moved = await home.client.waitRepository(mark, leasedKey, (repository) => repository.sync.phase !== "running" && repository.sync.phase !== "idle", 30_000);
    assert.deepEqual([moved.sync.phase, moved.state, moved.id], ["done", "reachable", stopped.id], JSON.stringify(moved.sync));
    assert.ok(existsSync(join(clonePath(home.dataDir, leasedKey), ".git")) && !existsSync(leasedClone), "its next sync moved it");
    assert.equal(Home.load(home.dataDir).keyForFolder(leased), leasedKey);
  } finally { if (!released) await live.release(); }
});

test("space-4, git-host-5: your namespace's listing of your own group's own repository is your own clone's — never a row not on this device, never cloned again by Join — before and after that clone records the host's id", async (t) => {
  const host = await startHost();
  // Your own group's repository, made at the instance from another device.
  const listedOwn = host.script.addRepository({ group: LOGIN, name: `${LOGIN}-spex` });
  const home = await startHome("own-listed", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const listedOwnKeys = (state: GroupsState): string[] => rowsOf(state).filter((repository) => repository.id === listedOwn.id || repository.key === hostKey(host, HOST_OWN)).map((repository) => repository.key);
  // A session's lease in your own group's clone holds the sign-in's
  // rename, and with it the set-up's join: your clone has no remote and
  // no id while the instance lists the repository (space-4, space-59).
  const sessions = createSessionStore({ sessionsDir: join(ownClone(home.dataDir), "sessions") });
  await sessions.prepare();
  const lease = await sessions.acquireManagement(randomUUID());
  let released = false;
  try {
    const mark = home.client.mark();
    await signIn(home, host);
    const state = await home.client.waitSpace(mark, (candidate) => typeof instanceOf(candidate, host.url)?.readAt === "number" && instanceOf(candidate, host.url)?.read.phase === "idle", 30_000);
    const own = repositoryOf(state, OWN_KEY);
    assert.deepEqual([own.id, own.state], [null, "local-only"]);
    assert.deepEqual(listedOwnKeys(state), [], "no row not on this device");
    await home.client.expectError("space.join", { instance: host.url, hostId: listedOwn.id, folder: join(scratch, "own-elsewhere") }, "invalid_request", /on this device already/);
    assert.ok(!existsSync(clonePath(home.dataDir, hostKey(host, HOST_OWN))), "no second clone");
    await lease.release();
    released = true;
  } finally { if (!released) await lease.release(); }

  // Released, a Refresh renames your own group and joins the two
  // histories: the one row is your own clone, recording the host's id.
  const mark = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  const joined = await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  assert.equal(joined.id, listedOwn.id);
  assert.deepEqual(listedOwnKeys(await home.client.expectOk("space.get", {})), [HOST_OWN]);
  await home.client.expectError("space.join", { instance: host.url, hostId: listedOwn.id }, "invalid_request", /on this device already/);
  assert.ok(!existsSync(clonePath(home.dataDir, hostKey(host, HOST_OWN))));
});

/** A clone the instances migration deferred at `waiting` — a group's
 * repository the host had not created, recording no id and no remote —
 * its move to `destination` waiting on a live session's lease beneath
 * it, as a receipt the core reads at its next start names it. */
async function deferredClone(dataDir: string, folder: string, waiting: string, destination: string): Promise<{ clone: string; receipt: string; release: () => Promise<void> }> {
  const clone = clonePath(dataDir, waiting);
  mkdirSync(clone, { recursive: true });
  git(clone, "init", "-q", "-b", "spex");
  git(clone, "commit", "-q", "--allow-empty", "-m", "held");
  const receiptId = randomUUID();
  const receiptDir = join(dataDir, "local", "migrations", receiptId);
  mkdirSync(receiptDir, { recursive: true, mode: 0o700 });
  const receipt = join(receiptDir, "receipt.json");
  writeFileSync(receipt, JSON.stringify({
    format: 1, id: receiptId, kind: "instances", inputs: [],
    steps: [
      { step: "home", origin: "", credentials: null, written: true },
      { step: "clones", folder, moves: [{ from: waiting, to: destination, remote: false, id: null, url: null }], done: [] },
    ],
    deferred: [{ from: waiting, to: destination }], complete: true,
  }));
  const sessions = createSessionStore({ sessionsDir: join(clone, "sessions") });
  await sessions.prepare();
  const live = await sessions.acquireManagement(randomUUID());
  return { clone, receipt, release: () => live.release().catch(() => undefined) };
}

test("storage-30, space-60: a clone made at a deferred clone's key since is not the one deferred: its sync never moves it, and the receipt names that key no more", async (t) => {
  const host = await startHost();
  const folder = hostFolder(host);
  const home = await startHome("deferred-other", { host, project: false, extra: { signIn: "browser" } });
  const mark = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  await home.stop();

  const waiting = "acme/held-spex";
  const destination = hostKey(host, waiting);
  const deferred = await deferredClone(home.dataDir, folder, waiting, destination);
  try {
    const again = await startHome("deferred-other-again", { dataDir: home.dataDir, project: false, extra: { signIn: "browser" } });
    t.after(() => again.stop());
    assert.ok(existsSync(join(deferred.clone, ".git")) && !existsSync(clonePath(home.dataDir, destination)), "deferred at the start");
    // Another clone at the deferred key — here, given a remote the reader
    // named — is not the one the migration deferred: released, its sync
    // leaves it where it lies and the receipt names its key no more.
    git(deferred.clone, "remote", "add", "origin", bareRepo());
    await deferred.release();
    const synced = await again.client.settle("space.sync", { repository: waiting });
    assert.equal(synced.sync.phase, "done", JSON.stringify(synced.sync));
    assert.ok(existsSync(join(deferred.clone, ".git")) && !existsSync(clonePath(home.dataDir, destination)), "the other clone is never moved");
    assert.deepEqual((JSON.parse(readFileSync(deferred.receipt, "utf8")) as { deferred: unknown[] }).deferred, []);
    assert.equal(needsInstancesMigration(home.dataDir), false);
  } finally { await deferred.release(); }
});

test("space-60, storage-30: a host's rename onto the destination a deferred clone waits to move to stops the sync naming that clone; that clone removed, its entry settles and the sync follows the host there", async (t) => {
  const host = await startHost();
  const folder = hostFolder(host);
  const home = await startHome("deferred-destination", { host, project: false, extra: { signIn: "browser" } });
  let mark = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  const { key: local } = await addFolder(home, gitFolder("plans"));
  mark = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: host.url, groupId: "2002", name: "plans" } });
  const key = hostKey(host, "acme/plans-spex");
  const picked = await home.client.waitRepository(mark, key, (repository) => repository.sync.phase === "done", 30_000);
  assert.ok(picked.id);
  await home.stop();

  // The deferred clone waits to move where the stand-in will transfer
  // plans-spex.
  const waiting = "acme/held-spex";
  const destination = hostKey(host, "acme/research/plans-spex");
  const deferred = await deferredClone(home.dataDir, folder, waiting, destination);
  try {
    const again = await startHome("deferred-destination-again", { dataDir: home.dataDir, project: false, extra: { signIn: "browser" } });
    t.after(() => again.stop());
    host.script.rename(picked.id as string, { group: "acme/research" });
    const stopped = await again.client.settle("space.sync", { repository: key });
    assert.ok(stopped.sync.phase === "stopped" && stopped.sync.step === "check", JSON.stringify(stopped.sync));
    assert.deepEqual([stopped.sync.message, stopped.sync.guidance, stopped.sync.retry],
      [`workspace/${destination} waits for ${waiting}, so the clone cannot follow the host there`, `Sync ${waiting} first, then Retry.`, true]);
    assert.ok(existsSync(join(clonePath(home.dataDir, key), ".git")) && !existsSync(clonePath(home.dataDir, destination)), "nothing moved");

    // The deferred clone removed, its receipt entry settles and the
    // destination is free.
    await deferred.release();
    await again.client.expectOk("project.remove", { projectId: waiting, confirm: true });
    assert.ok(!existsSync(deferred.clone));
    assert.deepEqual((JSON.parse(readFileSync(deferred.receipt, "utf8")) as { deferred: unknown[] }).deferred, []);
    mark = again.client.mark();
    await again.client.expectOk("space.sync", { repository: key });
    const moved = await again.client.waitRepository(mark, destination, (repository) => repository.sync.phase !== "running" && repository.sync.phase !== "idle", 30_000);
    assert.equal(moved.sync.phase, "done", JSON.stringify(moved.sync));
    assert.ok(existsSync(join(clonePath(home.dataDir, destination), ".git")) && !existsSync(clonePath(home.dataDir, key)));
  } finally { await deferred.release(); }
});

test("storage-34: at the core's start, the host's id and the core's creation mark an unreleased Spex left at the top level beside a clone's remote move into that remote's section, and a clone with no remote records none", async (t) => {
  const host = await startHost();
  const folder = hostFolder(host);
  const home = await startHome("legacy-ids", { host, project: false, extra: { signIn: "browser" } });
  let mark = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  const { key: local } = await addFolder(home, gitFolder("unreleased"));
  mark = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: host.url, groupId: "2002", name: "unreleased" } });
  const key = hostKey(host, "acme/unreleased-spex");
  const id = (await home.client.waitRepository(mark, key, (repository) => repository.sync.phase === "done", 30_000)).id ?? "";
  assert.ok(id);
  const { key: stray } = await addFolder(home, gitFolder("stray"));
  await home.stop();

  // As an unreleased Spex left them: the id, and a creation mark, at the
  // top level beside the clone's remote; and an id beside no remote.
  const clone = clonePath(home.dataDir, key);
  git(clone, "config", "--unset", `remote.${folder}.spexId`);
  git(clone, "config", "spex.repositoryId", id);
  git(clone, "config", "spex.created", id);
  const strayClone = clonePath(home.dataDir, stray);
  git(strayClone, "config", "spex.repositoryId", "999");

  // Settled as the core starts, before any command.
  const again = await startHome("legacy-ids-again", { dataDir: home.dataDir, project: false, extra: { signIn: "browser" } });
  t.after(() => again.stop());
  assert.equal(git(clone, "config", "--get", `remote.${folder}.spexId`), id);
  assert.equal(git(clone, "config", "--get", `remote.${folder}.spexCreated`), id);
  for (const legacy of ["spex.repositoryId", "spex.created"]) assert.throws(() => git(clone, "config", "--get", legacy), `${legacy} is gone`);
  assert.throws(() => git(strayClone, "config", "--get", "spex.repositoryId"), "a clone with no remote records no id");
  assert.equal((await again.client.repository(key)).id, id);
  assert.equal((await again.client.repository(stray)).id, null);
  // Its next check reads the mark there and, the default branch standing,
  // spends it (git-host-7).
  const synced = await again.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(synced.sync.phase, "done", JSON.stringify(synced.sync));
  assert.throws(() => git(clone, "config", "--get", `remote.${folder}.spexCreated`), "the mark is spent");
  assert.equal(git(clone, "config", "--get", `remote.${folder}.spexId`), id);
});

test("git-host-12, space-30: the harness runs several stand-in instances at once, two on Git backends of their own and one over the first's, a home at each signing in by its origin, reading it and signing out of it on its own", async (t) => {
  const bob = { id: "1002", login: "bob", displayName: "Bob" };
  const grace = { id: "1003", login: "grace", displayName: "Grace Hopper" };
  const first = await startHost();
  const second = await startHost({ displayName: "Second stand-in", person: bob, canCreateGroup: false });
  const over = await startHost({ gitBackend: first, displayName: "Over the first", person: grace });
  // Each instance at its own origin and folder; the one over the first's
  // Git backend reports the first's Git origin (git-host-12, DR-127).
  assert.equal(new Set([first, second, over].map((host) => host.url)).size, 3);
  assert.equal(new Set([first, second, over].map(hostFolder)).size, 3);
  assert.notEqual(second.gitOrigin, first.gitOrigin);
  assert.equal(over.gitOrigin, first.gitOrigin);

  const arranged = [
    { host: first, login: LOGIN, name: HOST_NAME, canCreateGroup: true, home: await startHome("several-first", { host: first, project: false, extra: { signIn: "browser" } }) },
    { host: second, login: bob.login, name: "Second stand-in", canCreateGroup: false, home: await startHome("several-second", { host: second, project: false }) },
    { host: over, login: grace.login, name: "Over the first", canCreateGroup: true, home: await startHome("several-over", { host: over, project: false }) },
  ];
  for (const { home } of arranged) t.after(() => home.stop());
  for (const { host, login, name, canCreateGroup, home } of arranged) {
    const from = home.client.mark();
    // Signed in by the instance's origin, the home lists that instance
    // alone, with the account of the person it signs in (space-30).
    const signed = await signIn(home, host);
    assert.equal(signed.defaultInstance, host.url);
    assert.deepEqual(signed.instances.map((instance) => [instance.origin, instance.account.login, instance.signedIn]), [[host.url, login, true]]);
    // Its read held names its display name and what the person may do
    // there; your own group's own repository is made in the person's
    // namespace there and pushed (space-4).
    const read = await home.client.waitSpace(from, (state) => (instanceOf(state, host.url)?.readAt ?? null) !== null);
    assert.deepEqual([instanceOf(read, host.url)?.displayName, instanceOf(read, host.url)?.account.canCreateGroup], [name, canCreateGroup]);
    await home.client.waitRepository(from, `${login}/${login}-spex`, (repository) => repository.sync.phase === "done", 30_000);
    assert.notEqual(git(host.bareOf(`${login}/${login}-spex`), "rev-parse", "spex"), "");
  }

  // Over one Git backend, the namespace's repository is one on the Git
  // system, listed by both instances under one id, and its push came
  // through the one transport with a credential the instance over it
  // issued; the separate instance's stays on its own backend (git-host-12).
  const listed = (host: typeof first, path: string) => host.script.repositories.find((repository) => `${repository.group.fullPath}/${repository.path}` === path);
  assert.ok(listed(over, "grace/grace-spex") && listed(over, "grace/grace-spex") === listed(first, "grace/grace-spex"));
  assert.equal(over.bareOf("grace/grace-spex"), first.bareOf("grace/grace-spex"));
  assert.equal(listed(first, "bob/bob-spex"), undefined, "the separate instance's repository is not on the first's Git system");
  const pushers = (host: typeof first) => [...new Set(host.script.transportCredentials.filter((credential) => credential.push).map((credential) => credential.instance))].sort();
  assert.deepEqual(pushers(first), [first.url, over.url].sort());
  assert.deepEqual(pushers(second), [second.url]);
  // Nothing behind the instance over the first's backend is named to its
  // home, not even under the first's URL, where its Git origin lies
  // (space-30).
  const overHome = arranged[2].home;
  const behind = [...broadcasts(overHome.client.messages), await overHome.client.expectOk("space.get", {})]
    .flatMap(stringsOf).filter((text) => text.includes(`${first.url}/`) || text.includes(`${over.url}/`) || /gitlab/i.test(text));
  assert.deepEqual(behind, []);

  // Signed out of its instance, a home keeps its entry, signed out.
  const out = await signOut(arranged[1].home, second);
  assert.deepEqual(out.instances.map((instance) => [instance.origin, instance.account.login, instance.signedIn]), [[second.url, bob.login, false]]);
});

test("git-host-4, git-host-21, storage-19: the core keeps a client per instance, each refreshing its own pair once however many calls wait on it, held by its own rate limit, and signed out of its own instance alone, the other's entry, token and view kept", async (t) => {
  const bob = { id: "1002", login: "bob", displayName: "Bob" };
  const first = await startHost();
  const second = await startHost({ displayName: "Second stand-in", person: bob });
  const home = await startHome("client-per-instance", { host: first, project: false });
  t.after(() => home.stop());
  // The origins a shell may open pages at (app-shell-37): none before a
  // sign-in, the one a running sign-in names, then the listed ones.
  assert.deepEqual(home.service.instanceOrigins(), []);
  const from = home.client.mark();
  const started = await home.client.expectOk("space.signin.start", { url: first.url });
  assert.ok(started.flow === "device");
  assert.deepEqual(home.service.instanceOrigins(), [first.url], "the instance a running sign-in names");
  first.script.approveDevice(started.userCode);
  await home.client.waitSpace(from, (state) => instanceOf(state, first.url)?.signedIn === true && state.signIn.phase === "idle", 30_000);
  await home.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  await home.stop();

  // A sign-in at the second stores its pair under its origin beside the
  // first's and appends its entry, as the core's own does (git-host-2,
  // storage-19, storage-2).
  const outside = new GitHostClient({ url: second.url, label: "Spex on test", credentials: fileCredentialStore(home.dataDir, second.url) });
  const flow = await outside.startBrowserSignIn();
  const redirect = (await fetch(flow.url, { redirect: "manual" })).headers.get("location");
  assert.ok(redirect, "the second answered the sign-in page with its redirect");
  await (await fetch(redirect)).text();
  const account = await flow.done;
  const file = Home.load(home.dataDir);
  file.signIn(second.url, { id: account.id, login: account.login, displayName: account.displayName });
  file.save();

  const again = await startHome("client-per-instance-again", { dataDir: home.dataDir, project: false });
  t.after(() => again.stop());
  assert.deepEqual(again.service.instanceOrigins(), [first.url, second.url]);
  type Client = Pick<GitHostClient, "url" | "me" | "holding">;
  const space = (again.service as unknown as { space: { instanceAt(origin: string): { origin: string; client: Client }; accessSecretFor(origin: string): Promise<string | null> } }).space;
  // One client per instance, by its origin in any spelling (DR-127).
  const atFirst = space.instanceAt(first.url).client;
  const atSecond = space.instanceAt(second.url).client;
  assert.deepEqual([atFirst.url, atSecond.url], [first.url, second.url]);
  assert.notEqual(atFirst, atSecond);
  assert.equal(space.instanceAt(`${second.url.toUpperCase()}/`).client, atSecond);
  const mark = again.client.mark();
  await again.client.expectOk("space.get", {});
  const read = await again.client.waitSpace(mark, (state) => (instanceOf(state, first.url)?.readAt ?? null) !== null, 30_000);
  const readAt = instanceOf(read, first.url)?.readAt;

  const credentials = () => (parseYaml(readFileSync(credentialsPath(home.dataDir), "utf8")) as { hosts: Record<string, StoredCredential> }).hosts;
  const refreshes = (host: StandinHost) => host.script.tokenGrants.filter((grant) => grant.grantType === "refresh_token").length;
  const before = credentials();
  assert.deepEqual(Object.keys(before).sort(), [first.url, second.url].sort());
  // Each instance refuses its access secret as expired: its own client
  // refreshes once for the two calls waiting on it, and each refresh
  // replaces its own instance's pair alone (git-host-4, storage-19).
  const grants = [refreshes(first), refreshes(second)];
  first.script.expireAccess();
  second.script.expireAccess();
  const people = await Promise.all([atFirst.me(), atFirst.me(), atSecond.me()]);
  assert.deepEqual(people.map((person) => person.login), [LOGIN, LOGIN, bob.login]);
  assert.deepEqual([refreshes(first), refreshes(second)], [grants[0] + 1, grants[1] + 1]);
  const refreshed = credentials();
  assert.deepEqual(Object.keys(refreshed).sort(), [first.url, second.url].sort());
  assert.notEqual(refreshed[first.url].access, before[first.url].access);
  assert.notEqual(refreshed[second.url].access, before[second.url].access);
  assert.equal(await space.accessSecretFor(first.url), refreshed[first.url].access);
  assert.equal(await space.accessSecretFor(second.url), refreshed[second.url].access);

  // A 429 from the first holds the first's calls alone: one made there
  // is refused at once with nothing sent, while one to the second
  // reaches it at once (git-host-21).
  first.script.rateLimit(1, "30");
  const rateLimited = (error: unknown) => error instanceof HostError && error.kind === "rate_limited";
  await assert.rejects(atFirst.me(), rateLimited);
  assert.deepEqual([atFirst.holding(), atSecond.holding()], [true, false]);
  const sentFirst = first.script.requests.length;
  await assert.rejects(atFirst.me(), rateLimited);
  assert.equal(first.script.requests.length, sentFirst, "nothing reached the held instance");
  const sentSecond = second.script.requests.length;
  assert.equal((await atSecond.me()).login, bob.login);
  assert.ok(second.script.requests.length > sentSecond, "the other instance answered at once");

  // The second refusing its refresh signs the device out of the second
  // alone: its pair removed and its entry kept, marked signed out; the
  // first's pair, entry and view stand (git-host-4, storage-19).
  second.script.refuseRefresh = true;
  second.script.expireAccess();
  await assert.rejects(atSecond.me(), (error: unknown) => error instanceof HostError && error.kind === "reauth");
  const left = credentials();
  assert.deepEqual(Object.keys(left), [first.url]);
  assert.deepEqual(left[first.url], refreshed[first.url]);
  const recorded = Home.load(home.dataDir);
  assert.deepEqual(recorded.instances().map((entry) => [entry.origin, entry.account?.login, entry.signedOut === true]), [[first.url, LOGIN, false], [second.url, bob.login, true]]);
  const state = await again.client.expectOk("space.get", {});
  assert.deepEqual(state.instances.map((instance) => [instance.origin, instance.signedIn]), [[first.url, true], [second.url, false]]);
  assert.equal(instanceOf(state, first.url)?.readAt, readAt, "the first's view stands");
  assert.equal(await space.accessSecretFor(first.url), refreshed[first.url].access);
  assert.equal(await space.accessSecretFor(second.url), null);
  assert.deepEqual(again.service.instanceOrigins(), [first.url, second.url], "a signed-out entry stays listed");
});

/** A device sign-in at `url`, approved at `host`, and the first state
 * after it ran that reads it ended — signed in, failed or stopped. */
async function deviceSignIn(home: Awaited<ReturnType<typeof startHome>>, host: StandinHost, url: string): Promise<GroupsState> {
  const from = home.client.mark();
  const started = await home.client.expectOk("space.signin.start", { url });
  assert.ok(started.flow === "device", JSON.stringify(started));
  const running = await home.client.waitSpace(from, (state) => state.signIn.phase === "running");
  assert.ok(running.signIn.phase === "running" && running.signIn.instance === canonical(url), JSON.stringify(running.signIn));
  const ran = home.client.mark();
  host.script.approveDevice(started.userCode);
  return home.client.waitSpace(ran, (state) => state.signIn.phase !== "running", 30_000);
}

/** An origin as the core records it: `HTTP://127.0.0.1:4100/` is
 * `http://127.0.0.1:4100`. */
function canonical(url: string): string {
  return new URL(url).origin;
}

test("git-host-24, git-host-2, git-host-3: a sign-in at the second instance, then at the first, appends each entry after the listed ones with its token under its origin; one at the first named with a trailing / signs its entry in again, one there as another account ends failed naming the entry's login, both pairs kept; one sign-in runs at a time, whichever instance it names", async (t) => {
  const bob = { id: "1002", login: "bob", displayName: "Bob" };
  const first = await startHost();
  const second = await startHost({ displayName: "Second stand-in", person: bob });
  const home = await startHome("second-then-first", { host: first, project: false });
  t.after(() => home.stop());
  const entries = (): unknown[] => Home.load(home.dataDir).instances().map((entry) => [entry.origin, entry.account?.login, entry.signedOut === true]);
  const pairs = (): Record<string, StoredCredential> => (parseYaml(readFileSync(credentialsPath(home.dataDir), "utf8")) as { hosts: Record<string, StoredCredential> }).hosts;
  /** Who the pair stored under an instance's origin signs in as there. */
  const personAt = async (host: StandinHost): Promise<string> =>
    (await new GitHostClient({ url: host.url, label: "Spex on test", credentials: fileCredentialStore(home.dataDir, host.url) }).me()).login;

  // A sign-in naming the second runs at the second; while it runs, a
  // start naming any instance is busy (git-host-3, git-host-2).
  const from = home.client.mark();
  const started = await home.client.expectOk("space.signin.start", { url: second.url });
  assert.ok(started.flow === "device", JSON.stringify(started));
  const running = await home.client.waitSpace(from, (state) => state.signIn.phase === "running");
  assert.ok(running.signIn.phase === "running" && running.signIn.instance === second.url, JSON.stringify(running.signIn));
  await home.client.expectError("space.signin.start", { url: first.url }, "busy");
  await home.client.expectError("space.signin.start", { url: second.url }, "busy");
  second.script.approveDevice(started.userCode);
  await home.client.waitSpace(from, (state) => instanceOf(state, second.url)?.signedIn === true && state.signIn.phase === "idle", 30_000);
  await home.client.waitRepository(from, "bob/bob-spex", (repository) => repository.sync.phase === "done", 30_000);
  assert.deepEqual(entries(), [[second.url, bob.login, false]]);
  assert.deepEqual(Object.keys(pairs()), [second.url]);

  // Then the first, appended after the second, each pair under its own
  // origin signing in as that instance's person (git-host-2, storage-19).
  const signed = await signIn(home, first);
  assert.deepEqual(signed.instances.map((instance) => [instance.origin, instance.account.login, instance.signedIn]), [[second.url, bob.login, true], [first.url, LOGIN, true]]);
  assert.equal(signed.defaultInstance, second.url, "the first entry listed is the default instance");
  assert.deepEqual(entries(), [[second.url, bob.login, false], [first.url, LOGIN, false]]);
  assert.deepEqual(Object.keys(pairs()).sort(), [first.url, second.url].sort());
  assert.deepEqual([await personAt(first), await personAt(second)], [LOGIN, bob.login]);

  // Named with a trailing `/`, the first's entry signs in again: its new
  // pair in place of its former, the second's untouched, no entry added.
  const before = pairs();
  const again = await deviceSignIn(home, first, `${first.url}/`);
  assert.deepEqual(again.signIn, { phase: "idle" });
  const after = pairs();
  assert.notDeepEqual(after[first.url], before[first.url]);
  assert.deepEqual(after[second.url], before[second.url]);
  assert.deepEqual(entries(), [[second.url, bob.login, false], [first.url, LOGIN, false]]);

  // As another account there, the sign-in ends failed naming the entry's
  // login, both stored pairs kept and both entries as they stood.
  const ada = first.script.person;
  first.script.person = { id: "1003", login: "grace", displayName: "Grace Hopper" };
  const refused = await deviceSignIn(home, first, first.url);
  first.script.person = ada;
  assert.ok(refused.signIn.phase === "failed", JSON.stringify(refused.signIn));
  assert.deepEqual([refused.signIn.instance, refused.signIn.cause], [first.url, "refused"]);
  assert.match(refused.signIn.message, /signed you in as another account; this device uses @ada there/);
  assert.deepEqual(pairs(), after);
  assert.deepEqual(entries(), [[second.url, bob.login, false], [first.url, LOGIN, false]]);
});

test("space-83, space-4, space-59, space-65, space-5, space-57, storage-2, storage-36: a sign-in at the first, then one naming the second's origin, lists both in that order with their accounts; your own group's folder bears the first's login and its own repository is created in the first's namespace, its remote named by the first's folder; the second's sign-in renames nothing and places it as bob-spex in the second's namespace, its remote named by the second's folder after the first's, its file written, its push there waiting for Continue", async (t) => {
  const bob = { id: "1002", login: "bob", displayName: "Bob" };
  const first = await startHost();
  const second = await startHost({ displayName: "Second stand-in", person: bob });
  const home = await startHome("first-then-second", { host: first, project: false });
  t.after(() => home.stop());
  const from = home.client.mark();
  await signIn(home, first);
  await home.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  const read = await home.client.waitSpace(from, (state) => (instanceOf(state, first.url)?.readAt ?? null) !== null);
  assert.equal(instanceOf(read, first.url)?.displayName, HOST_NAME);
  // The entry keeps the display name the read named (storage-2).
  assert.equal(Home.load(home.dataDir).instance(first.url)?.displayName, HOST_NAME);

  const placing = home.client.mark();
  const signed = await signIn(home, second);
  assert.deepEqual(signed.instances.map((instance) => [instance.origin, instance.account.login, instance.signedIn]), [[first.url, LOGIN, true], [second.url, bob.login, true]]);
  // Your own group is placed at the second too, its first push there
  // waiting for Continue while the first syncs (space-4, space-57).
  await home.client.waitRepository(placing, HOST_OWN, (repository) => repository.sync.phase !== "running" && repository.placements[1]?.outcome?.kind === "waiting", 30_000);
  const state = await home.client.expectOk("space.get", {});
  assert.equal(state.defaultInstance, first.url);
  assert.deepEqual(state.instances.map((instance) => instance.origin), [first.url, second.url]);
  // Each with its own account, display name, read state and groups, the
  // second's set-up having read the second (space-30, space-4,
  // git-host-5).
  const headings = state.instances.map((instance) => [instance.displayName, instance.read, typeof instance.readAt, instance.account.canCreateGroup]);
  assert.deepEqual(headings, [[HOST_NAME, { phase: "idle" }, "number", true], ["Second stand-in", { phase: "idle" }, "number", true]]);
  const entries = (origin: string) => instanceOf(state, origin)?.groups.map((group) => [group.fullPath, group.login, group.mine]);
  assert.deepEqual(entries(first.url), [["acme", null, false], ["acme/research", null, false], [LOGIN, LOGIN, true]]);
  assert.deepEqual(entries(second.url), [["acme", null, false], ["acme/research", null, false], [bob.login, bob.login, true]]);
  assert.equal(Home.load(home.dataDir).instance(second.url)?.displayName, "Second stand-in");
  // Your own group's folder bears the first's login, no later sign-in
  // renaming it; its own repository is the first's, in your namespace
  // there, its first remote named by the first's folder, the instance
  // its row reads (space-4, space-59, space-5, storage-31).
  assert.equal(state.own.name, LOGIN);
  assert.equal(Home.load(home.dataDir).ownName, LOGIN);
  const own = state.own.repositories.find((repository) => repository.own);
  assert.deepEqual([own?.key, own?.instance, own?.state], [HOST_OWN, first.url, "reachable"]);
  const ownDir = clonePath(home.dataDir, HOST_OWN);
  assert.deepEqual(first.script.creations.map((body) => (body as { name?: unknown }).name), [`${LOGIN}-spex`]);
  // The second's sign-in places it there as bob-spex in your namespace,
  // its remote named by the second's folder after the first's, its id
  // in its own section and its file written; its first push there waits
  // for Continue, nothing pushed (space-4, space-65, space-5, space-57,
  // storage-34, storage-36).
  assert.deepEqual(second.script.creations.map((body) => [(body as { name?: unknown }).name, (body as { group_id?: unknown }).group_id ?? null]), [[`${bob.login}-spex`, null]]);
  assert.deepEqual(git(ownDir, "remote").split("\n"), [hostFolder(first), hostFolder(second)]);
  const placedThere = second.script.repositories.find((repository) => repository.path === `${bob.login}-spex`);
  assert.ok(placedThere, "bob-spex stands at the second");
  assert.equal(git(ownDir, "config", "--get", `remote.${hostFolder(second)}.spexId`), placedThere.id);
  assert.equal(readFileSync(join(ownDir, "placements", `${hostFolder(second)}.yaml`), "utf8"), `format: 1\ninstance: "${second.url}"\nid: "${placedThere.id}"\n`);
  assert.deepEqual(own?.placements.map((line) => [line.instance, line.path, line.attached, line.outcome?.kind ?? null]), [[first.url, HOST_OWN, true, "synced"], [second.url, `${bob.login}/${bob.login}-spex`, true, "waiting"]]);
  assert.equal(git(second.bareOf(`${bob.login}/${bob.login}-spex`), "for-each-ref", "--format=%(refname)", "refs/heads/spex"), "", "nothing is pushed to the second before Continue");
  assert.equal(existsSync(join(home.dataDir, "workspace", bob.login)), false, "no folder bears the second's login");
  assert.deepEqual(readdirSync(join(home.dataDir, "workspace")).sort(), [LOGIN], "nothing moved under an instance's folder");
});

/** Two stand-in instances on Git backends of their own, each holding a
 * group `acme` with a spex repository, and a home signed in at the
 * first as `ada`, then at the second as `bob` (git-host-24, space-83),
 * your own group's own repository placed at both, its push at the
 * second waiting for Continue once its sync has ended (space-4). */
async function twoInstances(name: string) {
  const bob = { id: "1002", login: "bob", displayName: "Bob" };
  const first = await startHost();
  const second = await startHost({ displayName: "Second stand-in", person: bob });
  const alpha = first.script.addRepository({ group: "acme", name: "alpha-spex" });
  const beta = second.script.addRepository({ group: "acme", name: "beta-spex" });
  const home = await startHome(name, { host: first, project: false });
  const from = home.client.mark();
  await signIn(home, first);
  await home.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  await signIn(home, second);
  await home.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase !== "running" && repository.placements[1]?.outcome?.kind === "waiting", 30_000);
  return { bob, first, second, alpha, beta, home, alphaKey: hostKey(first, "acme/alpha-spex"), betaKey: hostKey(second, "acme/beta-spex") };
}

/** The rows an instance's heading holds under one of its entries. */
function rowsUnder(state: GroupsState, origin: string, fullPath: string): [string, string, string | null][] {
  const group = instanceOf(state, origin)?.groups.find((entry) => entry.fullPath === fullPath);
  return (group?.repositories ?? []).map((repository) => [repository.key, repository.state, repository.instance]);
}

/** Who each instance's `/api/v1/host/me` was asked by, counted: one per
 * read of it (git-host-5). */
function meReads(host: StandinHost): number {
  return host.script.requests.filter((request) => request.path === "/api/v1/host/me").length;
}

test("space-4, space-83, space-65, space-57, storage-31: with both instances signed in and your own group's own repository holding no remote, a Refresh places it at the first, the earliest in the home's list, though the second answers first, then at the second, joining the bob-spex there, its push there waiting for Continue", async (t) => {
  const { bob, first, second, home } = await twoInstances("own-at-the-first");
  t.after(() => home.stop());
  const ownDir = clonePath(home.dataDir, HOST_OWN);
  const placed = await home.client.waitRepository(0, HOST_OWN, (repository) => repository.sync.phase !== "running" && repository.placements[1]?.outcome?.kind === "waiting", 30_000);
  const ownId = placed.id;
  assert.ok(ownId);
  const bobSpex = placed.placements[1].id;
  assert.ok(bobSpex);
  const before = await refreshed(home);
  // Its remotes taken away from a terminal and the first listing nothing
  // under its name any more, a set-up there creates it, the second's
  // still listing bob-spex (space-4); the first answers its listing
  // slower than the second.
  git(ownDir, "config", "--remove-section", `remote.${hostFolder(first)}`);
  git(ownDir, "config", "--remove-section", `remote.${hostFolder(second)}`);
  const removedAt = Date.now();
  first.script.rename(ownId, { name: "former-spex" });
  first.script.sleepListing(1_500);
  t.after(() => first.script.sleepListing(0));
  const createdAtFirst = first.script.creations.length;
  const createdAtSecond = second.script.creations.length;
  const mark = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  // The second's read is held while the first's still runs.
  await home.client.waitSpace(mark, (state) => instanceOf(state, first.url)?.read.phase === "running" && instanceOf(state, second.url)?.read.phase === "idle"
    && (instanceOf(state, second.url)?.readAt ?? 0) > (instanceOf(before, second.url)?.readAt ?? 0), 30_000);
  // The first, the earliest signed in, places it first: `ada-spex`
  // created in its namespace and pushed, the clone's first remote named
  // by the first's folder, the instance its row reads; then the second,
  // its bob-spex joined as the second placement, nothing created there,
  // its first push there waiting for Continue (space-4, space-65,
  // space-57, storage-31).
  const own = await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.instance === first.url && repository.sync.phase === "done" && repository.sync.at > removedAt
    && repository.placements.length === 2 && repository.placements[1].outcome?.kind === "waiting", 30_000);
  assert.equal(own.state, "reachable");
  assert.deepEqual(first.script.creations.slice(createdAtFirst).map((body) => (body as { name?: unknown }).name), [`${LOGIN}-spex`]);
  assert.equal(second.script.creations.length, createdAtSecond, "nothing is created at the second");
  assert.deepEqual(git(ownDir, "remote").split("\n"), [hostFolder(first), hostFolder(second)]);
  assert.deepEqual(own.placements.map((line) => [line.instance, line.path, line.attached, line.outcome?.kind ?? null]), [[first.url, HOST_OWN, true, "synced"], [second.url, `${bob.login}/${bob.login}-spex`, true, "waiting"]]);
  assert.notEqual(own.id, ownId, "a repository created anew at the first");
  assert.equal(own.placements[1].id, bobSpex, "the second's bob-spex joined");
  assert.equal(git(bareOf(first, HOST_OWN), "rev-parse", "spex"), git(ownDir, "rev-parse", "spex"));
});

test("storage-34, storage-31: a clone's placements are its remotes in the order its Git configuration holds them, a rename keeping its place and origin last; your own group's own repository is at its first placement's instance, its row's, its environment's and its commits' identity's", async (t) => {
  const { first, second, home } = await twoInstances("placements-in-order");
  t.after(() => home.stop());
  const own = clonePath(home.dataDir, HOST_OWN);
  const [atFirst, atSecond] = [hostFolder(first), hostFolder(second)];
  const firstUrl = git(own, "remote", "get-url", atFirst);
  const firstId = git(own, "config", "--get", `remote.${atFirst}.spexId`);
  // Your own group's records at the second too, placed there as bob-spex
  // by its sign-in (space-4), its `spex` pushed from here.
  await home.client.waitRepository(0, HOST_OWN, (repository) => repository.sync.phase !== "running" && repository.placements[1]?.outcome?.kind === "waiting", 30_000);
  const notesPath = "bob/bob-spex";
  const secondUrl = git(own, "remote", "get-url", atSecond);
  const notes = { id: git(own, "config", "--get", `remote.${atSecond}.spexId`) };
  git(own, "push", "-q", second.bareOf(notesPath), "spex:spex");
  // The first's remote set aside under a name no instance's folder bears,
  // a path remote and the second's remote added after it, then the first's
  // named back: its rename keeps its place.
  git(own, "remote", "rename", atFirst, "parked");
  git(own, "config", "--remove-section", `remote.${atSecond}`);
  git(own, "remote", "add", "origin", bareRepo());
  const path = git(own, "remote", "get-url", "origin");
  git(own, "remote", "add", atSecond, secondUrl);
  git(own, "config", `remote.${atSecond}.spexId`, notes.id);
  git(own, "remote", "rename", "parked", atFirst);
  const configured = (): string[] => git(own, "config", "--get-regexp", "^remote\\..*\\.url$").split("\n").map((line) => line.split(" ")[0]);
  assert.deepEqual(configured(), [`remote.${atFirst}.url`, "remote.origin.url", `remote.${atSecond}.url`]);
  const instanceOrigin = (): string | null => (home.service as unknown as { space: { instanceOriginOf(key: string): string | null } }).space.instanceOriginOf(HOST_OWN);
  // Its placements in that order, the path placement last whatever its
  // place: the first, the clone's instance and the row's id (storage-34,
  // storage-31).
  const firstFirst = repositoryOf(await refreshed(home), HOST_OWN);
  assert.deepEqual(firstFirst.placements.map((line) => [line.instance, line.path, line.id, line.attached]), [
    [first.url, HOST_OWN, firstId, true],
    [second.url, notesPath, notes.id, true],
    [null, path, null, true],
  ]);
  assert.deepEqual([firstFirst.instance, firstFirst.governing, firstFirst.id, firstFirst.state], [first.url, first.url, firstId, "reachable"]);
  assert.equal(git(own, "config", "--get", `remote.${atFirst}.url`), firstUrl);
  assert.equal(instanceOrigin(), first.url);

  // Its first placement dropped and added again, it stands after the
  // second's: your own group's own repository is now at the second, its
  // folder kept, its commits made as the account there (space-32).
  git(own, "config", "--remove-section", `remote.${atFirst}`);
  git(own, "remote", "add", atFirst, firstUrl);
  git(own, "config", `remote.${atFirst}.spexId`, firstId);
  assert.deepEqual(configured(), ["remote.origin.url", `remote.${atSecond}.url`, `remote.${atFirst}.url`]);
  const secondFirst = repositoryOf(await refreshed(home), HOST_OWN);
  assert.deepEqual(secondFirst.placements.map((line) => [line.instance, line.id]), [[second.url, notes.id], [first.url, firstId], [null, null]]);
  assert.deepEqual([secondFirst.instance, secondFirst.governing, secondFirst.id, secondFirst.state], [second.url, second.url, notes.id, "reachable"]);
  assert.equal(instanceOrigin(), second.url);
  writeFileSync(join(own, "notes.txt"), "kept at the second\n");
  const synced = await home.client.settle("space.sync", { repository: HOST_OWN }, 30_000);
  assert.equal(synced.sync.phase, "done", JSON.stringify(synced.sync));
  assert.equal(git(own, "log", "-1", "--format=%an <%ae>"), "Bob <bob@users.noreply.127.0.0.1>");
  assert.equal(git(second.bareOf(notesPath), "rev-parse", "spex"), git(own, "rev-parse", "spex"));
  assert.ok(existsSync(join(own, ".git")), "its folder is kept");
});

test("git-host-24, space-83, git-host-5, git-host-21: Refresh reads each instance on its own, its acme repository under a key in its own folder; a core restarted signed in to both begins one read of each at its first space.get, the second answering 503 leaving the first's view and read time while the second reports its failure; after a 429 from the first, a read of the second reaches it at once while the first's waits out its hold", async (t) => {
  const { first, second, home, alphaKey, betaKey } = await twoInstances("each-read-on-its-own");
  t.after(() => home.stop());
  // A Refresh reads both, each listing its `acme` repository, not on
  // this device, under a key in its own instance's folder and that
  // instance's heading (git-host-5, space-1).
  const before = await home.client.expectOk("space.get", {});
  const refreshed = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  const read = await home.client.waitSpace(refreshed, (state) => state.instances.every((instance) => instance.read.phase === "idle" && (instance.readAt ?? 0) > (instanceOf(before, instance.origin)?.readAt ?? 0)), 30_000);
  assert.deepEqual(rowsUnder(read, first.url, "acme"), [[alphaKey, "absent", first.url]]);
  assert.deepEqual(rowsUnder(read, second.url, "acme"), [[betaKey, "absent", second.url]]);
  assert.notEqual(hostFolder(first), hostFolder(second));
  await home.stop();

  // Restarted signed in to both, the first `space.get` begins one read
  // of each, however many follow, and answers with neither read held
  // (git-host-5).
  const again = await startHome("each-read-on-its-own-again", { dataDir: home.dataDir, project: false });
  t.after(() => again.stop());
  const readsBefore = [meReads(first), meReads(second)];
  second.script.unavailable(1);
  const fromStart = again.client.mark();
  const [initial] = await Promise.all([again.client.expectOk("space.get", {}), again.client.expectOk("space.get", {})]);
  assert.deepEqual(initial.instances.map((instance) => [instance.origin, instance.signedIn, instance.readAt]), [[first.url, true, null], [second.url, true, null]]);
  // Before any read, the default instance reads the display name its
  // entry recorded (storage-2, space-30).
  assert.equal(instanceOf(initial, first.url)?.displayName, HOST_NAME);
  // The second answering 503, the first's view is held with its read
  // time and its rows, while the second reports its failure in its own
  // name, its heading kept with the display name its entry holds
  // (git-host-5, space-1).
  const settled = await again.client.waitSpace(fromStart, (state) =>
    (instanceOf(state, first.url)?.readAt ?? null) !== null && instanceOf(state, first.url)?.read.phase === "idle" && instanceOf(state, second.url)?.read.phase === "failed", 30_000);
  const atFirst = instanceOf(settled, first.url);
  const atSecond = instanceOf(settled, second.url);
  assert.equal(typeof atFirst?.readAt, "number");
  assert.deepEqual(rowsUnder(settled, first.url, "acme"), [[alphaKey, "absent", first.url]]);
  assert.equal(repositoryOf(settled, HOST_OWN).state, "reachable");
  assert.deepEqual(atSecond?.read, { phase: "failed", message: "Could not reach Second stand-in" });
  assert.deepEqual([atSecond?.signedIn, atSecond?.readAt, atSecond?.displayName], [true, null, "Second stand-in"]);
  assert.deepEqual(rowsUnder(settled, second.url, "acme"), [], "no read of the second is held since the start");
  await again.client.expectOk("space.get", {});
  await sleep(300);
  assert.deepEqual([meReads(first) - readsBefore[0], meReads(second) - readsBefore[1]], [1, 1], "one read of each instance since the start");

  // A 429 from the first holds the first's read alone (git-host-21): a
  // Refresh's read of the second reaches it at once, while the first's
  // waits out the 2 seconds the first asked for, then is held.
  first.script.rateLimit(1, "2");
  let mark = again.client.mark();
  await again.client.expectOk("space.refresh", {});
  const limited = await again.client.waitSpace(mark, (state) => instanceOf(state, first.url)?.read.phase === "failed" && instanceOf(state, second.url)?.read.phase === "idle" && (instanceOf(state, second.url)?.readAt ?? null) !== null, 30_000);
  assert.deepEqual(instanceOf(limited, first.url)?.read, { phase: "failed", message: `${HOST_NAME} asks to wait 2 seconds` });
  assert.equal(instanceOf(limited, first.url)?.readAt, atFirst?.readAt, "the first's view keeps its time");
  const answered = Math.max(...first.script.requests.map((request) => request.at));
  const secondReadAt = instanceOf(limited, second.url)?.readAt ?? 0;
  mark = again.client.mark();
  const asked = performance.now();
  const sentFirst = first.script.requests.length;
  const sentSecond = second.script.requests.length;
  await again.client.expectOk("space.refresh", {});
  const waited = await again.client.waitSpace(mark, (state) => state.instances.every((instance) => instance.read.phase === "idle")
    && (instanceOf(state, first.url)?.readAt ?? 0) > (atFirst?.readAt ?? 0) && (instanceOf(state, second.url)?.readAt ?? 0) > secondReadAt, 30_000);
  const reachedSecond = second.script.requests[sentSecond]?.at ?? Infinity;
  const reachedFirst = first.script.requests[sentFirst]?.at ?? -Infinity;
  // At once: within the first's hold, which the first's own read waits out
  // — a bound a loaded runner meets, unlike a wall-clock one.
  assert.ok(reachedSecond < answered + 1_900, `the second was read at once, ${Math.round(reachedSecond - asked)} ms after the ask`);
  assert.ok(reachedFirst >= answered + 1_900, `the first waited out its hold, reached ${Math.round(reachedFirst - answered)} ms after its 429`);
  assert.ok(reachedFirst > reachedSecond);
  assert.deepEqual(rowsUnder(waited, second.url, "acme"), [[betaKey, "absent", second.url]]);
});

test("git-host-24, git-host-4, git-host-10, space-6, space-61: a refresh the first refuses signs that instance out alone, its entry kept marked signed out and its rows unreachable with Sign in again — your own group's own repository, placed at the second too, reachable by that placement, its first placement's line reading Sign in again — the second's token, view and rows kept, and Refresh then reading the second alone; a sign-out of one keeps the other signed in", async (t) => {
  const { bob, first, second, alpha, home, alphaKey, betaKey } = await twoInstances("signed-out-alone");
  t.after(() => home.stop());
  let mark = home.client.mark();
  await home.client.expectOk("space.join", { instance: first.url, hostId: alpha.id });
  await home.client.waitRepository(mark, alphaKey, (repository) => repository.state === "reachable", 30_000);
  const pairs = (): Record<string, StoredCredential> => (parseYaml(readFileSync(credentialsPath(home.dataDir), "utf8")) as { hosts: Record<string, StoredCredential> }).hosts;
  const entries = (): unknown[] => Home.load(home.dataDir).instances().map((entry) => [entry.origin, entry.account?.login, entry.signedOut === true]);
  const before = await home.client.expectOk("space.get", {});
  const pairsBefore = pairs();
  assert.deepEqual(Object.keys(pairsBefore).sort(), [first.url, second.url].sort());

  // The first refuses the refresh of its expired access secret: this
  // device is signed out of the first alone, its pair removed and its
  // entry kept marked signed out, its heading saying the first did it
  // with the account's login (git-host-4, space-3).
  first.script.refuseRefresh = true;
  first.script.expireAccess();
  const readsOfSecond = meReads(second);
  mark = home.client.mark();
  await home.client.expectError("space.members", { repository: alphaKey }, "invalid_request", /Sign in again/);
  const out = await home.client.waitSpace(mark, (state) => instanceOf(state, first.url)?.signedIn === false);
  assert.deepEqual(entries(), [[first.url, LOGIN, true], [second.url, bob.login, false]]);
  assert.deepEqual(Object.keys(pairs()), [second.url]);
  assert.deepEqual(pairs()[second.url], pairsBefore[second.url], "the second's token stands");
  const atFirst = instanceOf(out, first.url);
  assert.deepEqual([atFirst?.signedIn, atFirst?.hostSignedOut, atFirst?.read, atFirst?.readAt], [false, true, { phase: "idle" }, null]);
  // Its rows turn unreachable with "Sign in again", their clones kept,
  // each under its key's group at its heading, your own group's own
  // repository under your own group (git-host-4, space-6, space-1). Your
  // own group's own repository, placed at the second too, stays
  // reachable by that placement, its first placement's line reading
  // "Sign in again" (space-61, space-4).
  assert.deepEqual(atFirst?.groups.map((group) => [group.fullPath, group.repositories.map((repository) => repository.key)]), [["acme", [alphaKey]]]);
  assert.ok(out.own.repositories.some((repository) => repository.key === HOST_OWN));
  const alphaRow = repositoryOf(out, alphaKey);
  assert.deepEqual([alphaRow.state, alphaRow.reason, alphaRow.instance], ["unreachable", "Sign in again", first.url]);
  const ownRow = repositoryOf(out, HOST_OWN);
  assert.deepEqual([ownRow.state, ownRow.reason, ownRow.instance], ["reachable", null, first.url]);
  assert.deepEqual(ownRow.placements.map((line) => [line.instance, line.state, line.reason]), [[first.url, "unreachable", "Sign in again"], [second.url, "reachable", null]]);
  for (const key of [HOST_OWN, alphaKey]) assert.ok(existsSync(join(clonePath(home.dataDir, key), ".git")), key);
  // The second stands as it stood: signed in, its view and read time
  // kept, nothing read of it, its rows listed (git-host-4).
  const atSecond = instanceOf(out, second.url);
  assert.deepEqual([atSecond?.signedIn, atSecond?.hostSignedOut, atSecond?.readAt], [true, false, instanceOf(before, second.url)?.readAt]);
  assert.deepEqual(rowsUnder(out, second.url, "acme"), [[betaKey, "absent", second.url]]);
  assert.equal(meReads(second), readsOfSecond);
  // No sign-in runs; the first's heading says it signed this device out,
  // with the login its account bore (space-3, space-30).
  assert.deepEqual([out.signIn, atFirst?.hostSignedOut, atFirst?.account.login], [{ phase: "idle" }, true, LOGIN]);

  // Refresh reads every signed-in instance: the second alone, nothing
  // reaching the first (space-2, space-3).
  const sentFirst = first.script.requests.length;
  mark = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  const reread = await home.client.waitSpace(mark, (state) => (instanceOf(state, second.url)?.readAt ?? 0) > (atSecond?.readAt ?? 0) && instanceOf(state, second.url)?.read.phase === "idle", 30_000);
  assert.equal(first.script.requests.length, sentFirst, "the signed-out instance is never contacted");
  assert.equal(instanceOf(reread, first.url)?.signedIn, false);

  // Signed in again at the first, its rows are reachable again; then a
  // sign-out of the second keeps the first signed in, its view and rows
  // as they stood, the second's entry kept, signed out by the reader,
  // its pair revoked and removed (git-host-10, space-6).
  first.script.refuseRefresh = false;
  mark = home.client.mark();
  await signIn(home, first);
  const back = await home.client.waitSpace(mark, (state) => state.signIn.phase === "idle" && repositoryOf(state, alphaKey).state === "reachable" && instanceOf(state, first.url)?.read.phase === "idle" && (instanceOf(state, first.url)?.readAt ?? null) !== null, 30_000);
  assert.equal(instanceOf(back, first.url)?.hostSignedOut, false);
  assert.deepEqual(back.signIn, { phase: "idle" });
  const live = second.script.liveDevices();
  const signedOut = await signOut(home, second);
  assert.deepEqual(signedOut.instances.map((instance) => [instance.origin, instance.signedIn, instance.hostSignedOut]), [[first.url, true, false], [second.url, false, false]]);
  assert.equal(instanceOf(signedOut, first.url)?.readAt, instanceOf(back, first.url)?.readAt, "the first's view stands");
  assert.equal(repositoryOf(signedOut, alphaKey).state, "reachable");
  assert.deepEqual(rowsOf(signedOut).filter((repository) => repository.instance === second.url), [], "a signed-out instance lists nothing");
  assert.deepEqual(entries(), [[first.url, LOGIN, false], [second.url, bob.login, true]]);
  assert.deepEqual(Object.keys(pairs()), [first.url]);
  assert.equal(second.script.liveDevices(), live - 1, "the second revoked this device");
});

test("space-29, git-host-4, git-host-10, space-6, space-64, space-63: space.signout naming an instance the first signed out is refused, nothing asked of it, its sign-out mark and its step waiting there kept; signed in again, a sign-out of the first ends its own waiting step while a join stopped at the second stands", async (t) => {
  const { first, second, beta, home, betaKey } = await twoInstances("signout-scoped");
  t.after(() => home.stop());
  // A creation at the first left waiting for a member with the rights
  // (space-64), and a join at the second whose clone the second's
  // transport refuses, stopped (space-63).
  const words = "You need the Maintainer role in Acme to create projects.";
  first.script.refuseCreate(words);
  const { key: local } = await addFolder(home, gitFolder("waits"));
  let mark = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: first.url, groupId: "2002", name: "waits" } });
  const waitsAt = (row: RepositoryState) => row.placements.find((line) => line.instance === canonicalOrigin(first.url))?.waiting ?? null;
  const waiting = await home.client.waitRepository(mark, local, (repository) => waitsAt(repository) !== null, 30_000);
  assert.deepEqual(placementOf(waiting, first.url).waiting, { step: "create", group: "acme", message: words });
  second.script.refuseTransport("Access denied");
  mark = home.client.mark();
  await home.client.expectOk("space.join", { instance: second.url, hostId: beta.id });
  const stopped = await home.client.waitRepository(mark, betaKey, (repository) => repository.sync.phase === "stopped", 30_000);
  assert.ok(stopped.sync.phase === "stopped" && stopped.sync.op === "join", JSON.stringify(stopped.sync));
  second.script.refuseTransport(null);

  // The first signs this device out (git-host-4): its heading says so,
  // and the step waiting there stands.
  first.script.revokeDevices();
  mark = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  const out = await home.client.waitSpace(mark, (state) => instanceOf(state, first.url)?.hostSignedOut === true, 30_000);
  assert.deepEqual(placementOf(repositoryOf(out, local), first.url).waiting, placementOf(waiting, first.url).waiting);

  // space.signout naming the first, signed out, is refused (space-29):
  // nothing is asked of it, its entry stays marked signed out, its
  // heading still says it signed this device out, the step waiting there
  // stands, and so does the second's stopped join.
  const asked = first.script.requests.length;
  await home.client.expectError("space.signout", { instance: first.url }, "invalid_request", /^Sign in first$/);
  assert.equal(first.script.requests.length, asked, "nothing is asked of the first");
  assert.deepEqual(Home.load(home.dataDir).instances().map((entry) => [entry.origin, entry.signedOut === true]), [[first.url, true], [second.url, false]]);
  const kept = await home.client.expectOk("space.get", {});
  assert.deepEqual([instanceOf(kept, first.url)?.signedIn, instanceOf(kept, first.url)?.hostSignedOut], [false, true]);
  assert.deepEqual(placementOf(repositoryOf(kept, local), first.url).waiting, placementOf(waiting, first.url).waiting);
  assert.deepEqual(repositoryOf(kept, betaKey).sync, stopped.sync);

  // Signed in again at the first, its creation still waiting; then the
  // reader's sign-out of the first ends the step waiting there, while the
  // join stopped at the second stands as it stood (git-host-10, space-6).
  mark = home.client.mark();
  await signIn(home, first);
  await home.client.waitSpace(mark, (state) => instanceOf(state, first.url)?.read.phase === "idle" && (instanceOf(state, first.url)?.readAt ?? null) !== null, 30_000);
  assert.deepEqual(placementOf(await home.client.repository(local), first.url).waiting, placementOf(waiting, first.url).waiting);
  const signedOut = await signOut(home, first);
  assert.deepEqual([instanceOf(signedOut, first.url)?.hostSignedOut, instanceOf(signedOut, second.url)?.signedIn], [false, true]);
  assert.equal(waitsAt(repositoryOf(signedOut, local)), null, "the first's own step ends");
  assert.deepEqual(repositoryOf(signedOut, betaKey).sync, stopped.sync, "the second's stopped join stands");
});

test("storage-31, storage-30, space-1, space-30: in a home signed in to both instances, a clone the instances migration deferred, keeping its key outside every instance's folder and no remote, reads as the instance whose folder its destination names — the second's, not the default — under that instance's acme alone", async (t) => {
  const { first, second, home } = await twoInstances("deferred-of-two");
  await home.stop();
  // The receipt names the clone's destination under the second's folder.
  const waiting = "acme/held-spex";
  const deferred = await deferredClone(home.dataDir, hostFolder(second), waiting, hostKey(second, waiting));
  try {
    const again = await startHome("deferred-of-two-again", { dataDir: home.dataDir, project: false });
    t.after(() => again.stop());
    const from = again.client.mark();
    await again.client.expectOk("space.get", {});
    const state = await again.client.waitSpace(from, (candidate) => candidate.instances.every((instance) => instance.read.phase === "idle" && instance.readAt !== null), 30_000);
    assert.ok(existsSync(join(deferred.clone, ".git")) && !existsSync(clonePath(home.dataDir, hostKey(second, waiting))), "deferred, it keeps its key");
    const row = repositoryOf(state, waiting);
    assert.deepEqual([row.instance, row.state, row.placements], [second.url, "local-only", []]);
    assert.ok(rowsUnder(state, second.url, "acme").some(([key]) => key === waiting), "under the second's acme");
    assert.ok(!rowsUnder(state, first.url, "acme").some(([key]) => key === waiting), "not under the first's");
    assert.ok(!state.own.repositories.some((repository) => repository.key === waiting), "not under your own group");
  } finally { await deferred.release(); }
});

/** Every Groups state and command result or refusal a client was sent
 * from `from` on (space-30, space-83). */
function sentSince(messages: ServerMessage[], from: number): unknown[] {
  return messages.slice(from).flatMap((message) => message.type === "space.state" ? [message.state] : message.type === "reply" ? [message.ok ? message.result : message.error] : []);
}

/** The transports an instance's Git transport accepted with a credential
 * one instance issued, for a spex repository at `path` there. */
function transportsOf(host: StandinHost, path: string, push?: boolean): { instance: string; push: boolean }[] {
  return host.script.transportCredentials.filter((entry) => entry.path.includes(`/${path}.git/`) && (push === undefined || entry.push === push)).map((entry) => ({ instance: entry.instance, push: entry.push }));
}

test("git-host-24, space-83, git-host-6, git-host-9, git-host-15, git-host-16, git-host-20, space-63, space-58, space-32, space-60, space-29, core-service-42: Join keys each instance's acme repository under its own folder; a project picked into the second's acme is created and pushed at the second alone, its Save commit bearing the second's login; a pick naming another instance than its key's is refused; a lease-held pick leaves the clone with its remote at the second until its next sync moves it; a group created and a member added reach the instance named alone, and a move into the other instance's group is refused before any request; nothing under either instance's URL is said; signed out of the second, its project's intent records no author", async (t) => {
  const { bob, first, second, alpha, beta, home, alphaKey, betaKey } = await twoInstances("each-at-its-instance");
  t.after(() => home.stop());
  const said = home.client.mark();

  // Join of each `acme` repository clones it under its own instance's
  // folder at `acme/`, its remote named by that folder, the two under
  // distinct keys though both instances mint one id, each row under its
  // own instance's `acme` (space-63, space-1, git-host-9).
  assert.equal(alpha.id, beta.id, "two Git systems mint one id");
  let mark = home.client.mark();
  await home.client.expectOk("space.join", { instance: first.url, hostId: alpha.id });
  await home.client.waitRepository(mark, alphaKey, (repository) => repository.state === "reachable" && repository.sync.phase === "idle", 30_000);
  mark = home.client.mark();
  await home.client.expectOk("space.join", { instance: second.url, hostId: beta.id });
  await home.client.waitRepository(mark, betaKey, (repository) => repository.state === "reachable" && repository.sync.phase === "idle", 30_000);
  const joined = await home.client.waitSpace(mark, (state) => repositoryOf(state, alphaKey).state === "reachable" && repositoryOf(state, betaKey).state === "reachable", 30_000);
  assert.notEqual(alphaKey, betaKey);
  assert.deepEqual(rowsUnder(joined, first.url, "acme"), [[alphaKey, "reachable", first.url]]);
  assert.deepEqual(rowsUnder(joined, second.url, "acme"), [[betaKey, "reachable", second.url]]);
  assert.deepEqual(git(clonePath(home.dataDir, alphaKey), "remote").split("\n"), [hostFolder(first)]);
  assert.deepEqual(git(clonePath(home.dataDir, betaKey), "remote").split("\n"), [hostFolder(second)]);
  assert.deepEqual(transportsOf(second, `${STANDIN_STORAGE}/acme/beta-spex`, false).map((entry) => entry.instance).filter((instance, index, all) => all.indexOf(instance) === index), [second.url], "the second brokers its clone");
  assert.deepEqual(transportsOf(first, `${STANDIN_STORAGE}/acme/beta-spex`), []);

  // A local-only project picked into the second's `acme`: created at the
  // second alone, its clone moved under the second's folder with its
  // pair, session and sync preferences following, pushed with a
  // credential the second issued, its Save commit bearing the second's
  // login (space-58, storage-35, git-host-6, git-host-9, space-32).
  const code = gitFolder("gamma");
  const { key: local } = await addFolder(home, code);
  const sessionId = await runTurn(home, local, "Before the pick");
  const gammaKey = hostKey(second, "acme/gamma-spex");
  const createdAtFirst = first.script.creations.length;
  const createdAtSecond = second.script.creations.length;
  mark = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: second.url, groupId: "2002", name: "gamma" } });
  const gamma = await home.client.waitRepository(mark, gammaKey, (repository) => repository.sync.phase !== "idle" && repository.sync.phase !== "running", 30_000);
  assert.deepEqual([gamma.sync.phase, gamma.state, gamma.instance], ["done", "reachable", second.url], JSON.stringify(gamma.sync));
  assert.deepEqual(second.script.creations.slice(createdAtSecond).map((body) => (body as { name?: unknown; group_id?: unknown })).map((body) => [body.name, body.group_id]), [["gamma-spex", "2002"]]);
  assert.equal(first.script.creations.length, createdAtFirst, "nothing is created at the first");
  const gammaClone = clonePath(home.dataDir, gammaKey);
  assert.ok(existsSync(join(gammaClone, ".git")) && !existsSync(clonePath(home.dataDir, local)), "moved under the second's folder");
  assert.deepEqual(git(gammaClone, "remote").split("\n"), [hostFolder(second)]);
  assert.equal(git(gammaClone, "config", "--get", `remote.${hostFolder(second)}.spexId`), gamma.id);
  assert.equal(Home.load(home.dataDir).keyForFolder(code), gammaKey, "its pair follows it");
  assert.ok((await home.client.expectOk("session.list", {})).some((session) => session.id === sessionId && session.projectId === gammaKey), "its session follows it");
  assert.equal(typeof (prefsOf(home.dataDir)[`sync:${gammaKey}:${hostFolder(second)}:last`] as { at?: unknown } | undefined)?.at, "number");
  assert.deepEqual(Object.keys(prefsOf(home.dataDir)).filter((name) => name.startsWith(`sync:${local}:`)), []);
  assert.equal(git(bareOf(second, gammaKey), "rev-parse", "spex"), git(gammaClone, "rev-parse", "spex"));
  assert.ok(transportsOf(second, `${STANDIN_STORAGE}/acme/gamma-spex`, true).length > 0, "pushed");
  assert.deepEqual([...new Set(transportsOf(second, `${STANDIN_STORAGE}/acme/gamma-spex`).map((entry) => entry.instance))], [second.url], "with credentials the second issued");
  assert.equal(git(gammaClone, "log", "-1", "--format=%an <%ae>"), `${bob.displayName} <${bob.login}@users.noreply.127.0.0.1>`);
  // Its intents' author is the account at its instance; a local-only
  // project's has none (core-service-42).
  const queued = await home.client.expectOk("intent.queue", { projectId: gammaKey, text: "At the second" });
  assert.deepEqual(queued.author, { login: bob.login, displayName: bob.displayName });
  const { key: elsewhere } = await addFolder(home, gitFolder("elsewhere"));
  assert.equal((await home.client.expectOk("intent.queue", { projectId: elsewhere, text: "Here alone" })).author, undefined);

  // A pick while a session beneath the clone stands under a lease taken
  // out of band: the clone stays in your own group's folder with its
  // remote named by the second's folder, read as the second's, and,
  // released, its next sync moves it under the second's folder, its
  // sync preferences following, and pushes there (storage-35, space-60).
  const leased = gitFolder("leased");
  const { key: leasedLocal } = await addFolder(home, leased);
  const leasedClone = clonePath(home.dataDir, leasedLocal);
  const leasedKey = hostKey(second, "acme/leased-spex");
  const sessions = createSessionStore({ sessionsDir: join(leasedClone, "sessions") });
  await sessions.prepare();
  const live = await sessions.acquireManagement(randomUUID());
  let released = false;
  try {
    mark = home.client.mark();
    await home.client.expectOk("space.pick", { repository: leasedLocal, choice: { kind: "create", instance: second.url, groupId: "2002", name: "leased" } });
    const stopped = await home.client.waitRepository(mark, leasedLocal, (repository) => repository.sync.phase === "stopped", 30_000);
    assert.ok(stopped.sync.phase === "stopped" && stopped.sync.cause === "lease" && stopped.sync.step === "check", JSON.stringify(stopped.sync));
    assert.equal(stopped.instance, second.url, "read as the second's by its remote");
    assert.ok(existsSync(join(leasedClone, ".git")) && !existsSync(clonePath(home.dataDir, leasedKey)), "it stays where it lies");
    assert.deepEqual(git(leasedClone, "remote").split("\n"), [hostFolder(second)]);
    assert.ok(rowsUnder(await home.client.expectOk("space.get", {}), second.url, "acme").some(([key]) => key === leasedLocal), "listed under the second's acme");
    await live.release();
    released = true;
    mark = home.client.mark();
    await home.client.expectOk("space.sync", { repository: leasedLocal, noticed: true });
    const moved = await home.client.waitRepository(mark, leasedKey, (repository) => repository.sync.phase !== "running" && repository.sync.phase !== "idle", 30_000);
    assert.deepEqual([moved.sync.phase, moved.state, moved.id, moved.instance], ["done", "reachable", stopped.id, second.url], JSON.stringify(moved.sync));
    assert.ok(existsSync(join(clonePath(home.dataDir, leasedKey), ".git")) && !existsSync(leasedClone), "its next sync moved it");
    assert.equal(Home.load(home.dataDir).keyForFolder(leased), leasedKey);
    assert.equal(prefsOf(home.dataDir)[`sync:${leasedKey}:${hostFolder(second)}:noticed`], true, "its sync preferences follow it");
    assert.deepEqual(Object.keys(prefsOf(home.dataDir)).filter((name) => name.startsWith(`sync:${leasedLocal}:`)), []);
    assert.equal(git(bareOf(second, leasedKey), "rev-parse", "spex"), git(clonePath(home.dataDir, leasedKey), "rev-parse", "spex"));
    assert.deepEqual([...new Set(transportsOf(second, `${STANDIN_STORAGE}/acme/leased-spex`, true).map((entry) => entry.instance))], [second.url]);
  } finally { if (!released) await live.release(); }

  // A group created at each root reaches only the instance the command
  // names; a member added in the second's `acme` reaches the second
  // alone; a move into a group of the other instance is refused
  // `not_found` before any request (git-host-15, git-host-16,
  // git-host-20, space-29).
  const lumen = await home.client.expectOk("space.group.create", { instance: first.url, name: "Lumen", path: "lumen", parent: null });
  const nova = await home.client.expectOk("space.group.create", { instance: second.url, name: "Nova", path: "nova", parent: null });
  const paths = (host: StandinHost): string[] => host.script.groups.map((group) => group.fullPath);
  assert.ok(paths(first).includes("lumen") && !paths(first).includes("nova"), JSON.stringify(paths(first)));
  assert.ok(paths(second).includes("nova") && !paths(second).includes("lumen"), JSON.stringify(paths(second)));
  const grouped = await home.client.expectOk("space.get", {});
  const headings = (origin: string): string[] => (instanceOf(grouped, origin)?.groups ?? []).map((group) => group.fullPath);
  assert.ok(headings(first.url).includes("lumen") && !headings(first.url).includes("nova"));
  assert.ok(headings(second.url).includes("nova") && !headings(second.url).includes("lumen"));
  const shared = await home.client.expectOk("space.share", { instance: second.url, group: "2002", login: "grace", role: "developer" });
  assert.ok(shared.members.some((member) => member.login === "grace"));
  const acmeMembers = (host: StandinHost): string[] => (host.script.groups.find((group) => group.fullPath === "acme")?.members ?? []).map((member) => member.login);
  assert.ok(acmeMembers(second).includes("grace"));
  assert.ok(!acmeMembers(first).includes("grace"), "nothing reaches the first's acme");
  assert.ok(!(await home.client.expectOk("space.members", { instance: first.url, group: "2002" })).members.some((member) => member.login === "grace"));
  assert.ok(!first.script.groups.some((group) => group.id === nova.group.id), "the second's group id names none at the first");
  const asked = [first.script.requests.length, second.script.requests.length];
  await home.client.expectError("space.repository.move", { repository: alphaKey, groupId: nova.group.id }, "not_found", new RegExp(`^${HOST_NAME} listed no group ${nova.group.id}$`));
  assert.deepEqual([first.script.requests.length, second.script.requests.length], asked, "no request at either instance");
  assert.ok(lumen.group.id);

  // A remote the reader names under either instance's Git origin is
  // refused, whichever instance the clone is at (space-29, space-5).
  for (const host of [first, second]) {
    await home.client.expectError("space.remote.set", { repository: alphaKey, url: `${host.gitOrigin}/acme/other-spex.git` }, "invalid_request", /used as the host gives them/);
  }
  assert.deepEqual(git(clonePath(home.dataDir, alphaKey), "remote").split("\n"), [hostFolder(first)]);

  // A pick of a clone keyed under the first that names the second is
  // refused, nothing created there (space-29, space-58), its remote taken
  // away from a terminal.
  git(clonePath(home.dataDir, alphaKey), "config", "--remove-section", `remote.${hostFolder(first)}`);
  const createdThere = second.script.creations.length;
  await home.client.expectError("space.pick", { repository: alphaKey, choice: { kind: "create", instance: second.url, groupId: "2002", name: "alpha" } }, "invalid_request", new RegExp(`^alpha-spex is kept under ${HOST_NAME}; pick a group there$`));
  assert.equal(second.script.creations.length, createdThere);

  // No reply or broadcast holds a string under either stand-in's URL but
  // that URL itself, or one naming the Git system (space-30, space-1).
  const values = [...sentSince(home.client.messages, said), await home.client.expectOk("space.get", {})];
  assert.deepEqual(leaks(first, values), []);
  assert.deepEqual(leaks(second, values), []);

  // Signed out of the second, an intent of its project records no
  // author, though the first stays signed in (core-service-42).
  await signOut(home, second);
  assert.equal((await home.client.expectOk("intent.queue", { projectId: gammaKey, text: "Signed out there" })).author, undefined);
});

test("core-service-123, core-service-42: signed in at the first as ada and at the second as bob, an intent queued in a project picked into each namespace stores the account at its own project's instance, a local-only project's storing none; signed out of the second, a further intent of its project stores none while the first's still stores ada", async (t) => {
  const { bob, first, second, home } = await twoInstances("author-by-instance");
  t.after(() => home.stop());
  const ada = first.script.person;

  // A project picked into your namespace at each instance, its clone
  // keyed under that instance's folder (storage-35, space-58), and a
  // project with no instance.
  const picked = async (host: StandinHost, login: string, name: string): Promise<string> => {
    const { key: local } = await addFolder(home, gitFolder(name));
    const key = hostKey(host, `${login}/${name}-spex`);
    const mark = home.client.mark();
    await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: host.url, groupId: null, name } });
    const row = await home.client.waitRepository(mark, key, (repository) => repository.sync.phase !== "idle" && repository.sync.phase !== "running", 30_000);
    assert.deepEqual([row.sync.phase, row.instance], ["done", host.url], JSON.stringify(row.sync));
    return key;
  };
  const north = await picked(first, LOGIN, "north");
  const south = await picked(second, bob.login, "south");
  const { key: local } = await addFolder(home, gitFolder("local"));
  const rows = rowsOf(await home.client.expectOk("space.get", {}));
  assert.deepEqual([north, south, local].map((key) => rows.find((row) => row.key === key)?.instance), [first.url, second.url, null]);

  /** Queue an intent over the protocol and read the author its stored
   * file holds (storage-4, core-service-52), the reply carrying the
   * same. */
  const authorOf = async (projectId: string, text: string): Promise<unknown> => {
    const queued = await home.client.expectOk("intent.queue", { projectId, text });
    const stored = JSON.parse(readFileSync(join(clonePath(home.dataDir, projectId), "intents", `${queued.id}.json`), "utf8")) as { text?: unknown; author?: unknown };
    assert.equal(stored.text, text);
    assert.deepEqual(queued.author, stored.author, "the reply carries the stored author");
    return stored.author;
  };

  // Each records the account signed in at its project's instance; the
  // local-only project's records none (core-service-42).
  assert.deepEqual(await authorOf(north, "At the first"), { login: ada.login, displayName: ada.displayName });
  assert.deepEqual(await authorOf(south, "At the second"), { login: bob.login, displayName: bob.displayName });
  assert.equal(await authorOf(local, "Here alone"), undefined);

  // Signed out of the second, a further intent of its project records
  // none, while the first's still records ada (core-service-42).
  await signOut(home, second);
  assert.equal(await authorOf(south, "Signed out there"), undefined);
  assert.deepEqual(await authorOf(north, "Still at the first"), { login: ada.login, displayName: ada.displayName });
  assert.equal(await authorOf(local, "Still here alone"), undefined);
});

test("space-83, git-host-24, git-host-9, git-host-4, space-11, space-6, space-61, space-57: a credential the second refuses to a transport signs the second out alone before Git runs; space.signout of the first lists it signed out, its rows unreachable and their Sync refused naming the first's display name — your own group's own repository, placed at the second too, reachable by that placement, its Sync asking for the second's notice — while the second's stay reachable and sync with the second's credential", async (t) => {
  const { first, second, alpha, beta, home, alphaKey, betaKey } = await twoInstances("signed-out-transport");
  t.after(() => home.stop());
  let mark = home.client.mark();
  await home.client.expectOk("space.join", { instance: first.url, hostId: alpha.id });
  await home.client.waitRepository(mark, alphaKey, (repository) => repository.state === "reachable" && repository.sync.phase === "idle", 30_000);
  mark = home.client.mark();
  await home.client.expectOk("space.join", { instance: second.url, hostId: beta.id });
  await home.client.waitRepository(mark, betaKey, (repository) => repository.state === "reachable" && repository.sync.phase === "idle", 30_000);
  const pairs = (): string[] => Object.keys((parseYaml(readFileSync(credentialsPath(home.dataDir), "utf8")) as { hosts: Record<string, StoredCredential> }).hosts).sort();
  assert.deepEqual(pairs(), [first.url, second.url].sort());

  // The second refusing the credential a join's clone asks it for signs
  // the second out alone, its entry kept marked signed out, before Git
  // runs: nothing is cloned and its transport is never reached; the
  // first's token, view and rows stand (git-host-9, git-host-4).
  const delta = second.script.addRepository({ group: "acme", name: "delta-spex" });
  mark = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  await home.client.waitSpace(mark, (state) => rowsUnder(state, second.url, "acme").some(([key]) => key === hostKey(second, "acme/delta-spex")), 30_000);
  const reachedSecond = second.script.transportCredentials.length;
  const firstReadAt = instanceOf(await home.client.expectOk("space.get", {}), first.url)?.readAt;
  second.script.revokeDevices();
  mark = home.client.mark();
  await home.client.expectOk("space.join", { instance: second.url, hostId: delta.id });
  const out = await home.client.waitSpace(mark, (state) => instanceOf(state, second.url)?.signedIn === false, 30_000);
  assert.deepEqual([instanceOf(out, second.url)?.hostSignedOut, instanceOf(out, first.url)?.signedIn, instanceOf(out, first.url)?.readAt], [true, true, firstReadAt]);
  assert.deepEqual(Home.load(home.dataDir).instances().map((entry) => [entry.origin, entry.signedOut === true]), [[first.url, false], [second.url, true]]);
  assert.deepEqual(pairs(), [first.url]);
  assert.equal(repositoryOf(out, alphaKey).state, "reachable");
  assert.deepEqual([repositoryOf(out, betaKey).state, repositoryOf(out, betaKey).reason], ["unreachable", "Sign in again"]);
  // Its clone, which no read lists now, stands under the second's
  // heading alone, never the first's (space-1, space-30).
  assert.deepEqual(rowsUnder(out, second.url, "acme"), [[betaKey, "unreachable", second.url]]);
  assert.ok(!rowsUnder(out, first.url, "acme").some(([key]) => key === betaKey), JSON.stringify(rowsUnder(out, first.url, "acme")));
  assert.equal(existsSync(clonePath(home.dataDir, hostKey(second, "acme/delta-spex"))), false, "nothing is cloned");
  assert.equal(second.script.transportCredentials.length, reachedSecond, "its transport is never reached");
  assert.equal(second.script.requests.filter((request) => request.path.includes("/delta-spex.git/")).length, 0);

  // Signed in again at the second; then `space.signout` of the first
  // lists it signed out, its rows unreachable, and their Sync refused
  // naming the first's display name, while the second's row stays
  // reachable and syncs with a credential the second issued (space-6,
  // space-11, space-83).
  mark = home.client.mark();
  await signIn(home, second);
  await home.client.waitRepository(mark, betaKey, (repository) => repository.state === "reachable", 30_000);
  const signedOut = await signOut(home, first);
  assert.deepEqual(signedOut.instances.map((instance) => [instance.origin, instance.signedIn]), [[first.url, false], [second.url, true]]);
  const alphaRow = repositoryOf(signedOut, alphaKey);
  assert.deepEqual([alphaRow.state, alphaRow.reason, alphaRow.instance], ["unreachable", "Sign in again", first.url]);
  await home.client.expectError("space.sync", { repository: alphaKey }, "invalid_request", new RegExp(`^Sign in to ${HOST_NAME} first$`));
  // Your own group's own repository, placed at the second too, stays
  // reachable by that placement, its first placement's line reading
  // "Sign in again"; its Sync, the second's notice never continued, asks
  // for it (space-61, space-57, space-4).
  const ownRow = repositoryOf(signedOut, HOST_OWN);
  assert.deepEqual([ownRow.state, ownRow.reason, ownRow.instance], ["reachable", null, first.url]);
  assert.deepEqual(ownRow.placements.map((line) => [line.instance, line.state, line.reason]), [[first.url, "unreachable", "Sign in again"], [second.url, "reachable", null]]);
  await home.client.expectError("space.sync", { repository: HOST_OWN }, "invalid_request", /^Read the sharing notice before the first sync of ada-spex$/);
  assert.deepEqual([repositoryOf(signedOut, betaKey).state, repositoryOf(signedOut, betaKey).instance], ["reachable", second.url]);
  const fetchedFirst = first.script.transportCredentials.length;
  const fetchedSecond = second.script.transportCredentials.length;
  const synced = await home.client.settle("space.sync", { repository: betaKey }, 30_000);
  assert.deepEqual([synced.sync.phase, synced.state], ["done", "reachable"], JSON.stringify(synced.sync));
  assert.ok(second.script.transportCredentials.slice(fetchedSecond).some((entry) => entry.instance === second.url && entry.path.includes("/acme/beta-spex.git/")), "the second brokered its transport");
  assert.equal(first.script.transportCredentials.length, fetchedFirst, "nothing reaches the first");
});

/** A Refresh of every signed-in instance, and the first state after it
 * in which each read since the ask is held (git-host-5). */
async function refreshed(home: Awaited<ReturnType<typeof startHome>>): Promise<GroupsState> {
  const before = await home.client.expectOk("space.get", {});
  const mark = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  return home.client.waitSpace(mark, (state) => state.instances.every((instance) => !instance.signedIn
    || (instance.read.phase === "idle" && (instance.readAt ?? 0) > (instanceOf(before, instance.origin)?.readAt ?? 0))), 30_000);
}

/** The requests an instance answered since `from`, by method and path,
 * those touching a repository's or a group's members alone. */
function membersRequests(host: StandinHost, from: number): string[] {
  return host.script.requests.slice(from).filter((request) => request.path.endsWith("/members")).map((request) => `${request.method} ${request.path}`);
}

test("git-host-25, space-84, git-host-5, git-host-8, git-host-16, git-host-9, space-1, space-61, space-63: two instances over one Git backend list a namespace repository as one row under the first; Join keys it under the first's folder, whichever instance it names, and the second's listing withholds another; the second answering it archived or below the pushing role changes nothing while the first is signed in; its members are read and added at the first, and its push presents a credential the first issued", async (t) => {
  const first = await startHost();
  const second = await startHost({ gitBackend: first, displayName: "Second stand-in" });
  // Both list the person's namespace there with its repositories under
  // one id; the first alone lists its own group's (git-host-12).
  const a = first.script.addRepository({ group: LOGIN, name: "a-spex" });
  const b = first.script.addRepository({ group: LOGIN, name: "b-spex" });
  const solo = first.script.addRepository({ group: "acme", name: "solo-spex" });
  const listedAt = (host: StandinHost, id: string) => host.script.repositories.find((repository) => repository.id === id);
  assert.ok(listedAt(second, a.id) === a && listedAt(second, b.id) === b && listedAt(second, solo.id) === undefined);
  const home = await startHome("one-backend", { host: first, project: false });
  t.after(() => home.stop());
  let mark = home.client.mark();
  await signIn(home, first);
  const own = await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  await signIn(home, second);
  // What the sign-ins' own pages aside a client is sent from here on
  // (space-3).
  const said = home.client.mark();
  const aKey = hostKey(first, `${LOGIN}/a-spex`);
  const bKey = hostKey(first, `${LOGIN}/b-spex`);
  const rowsWith = (state: GroupsState, id: string): [string, string, string | null][] =>
    rowsOf(state).filter((repository) => repository.id === id).map((repository) => [repository.key, repository.state, repository.instance]);

  // Signed in at both, each namespace repository is one row, not on this
  // device, under the first's heading in your namespace there, keyed
  // under the first's folder; the second's listing adds none, and your
  // own group's own repository, which both list, stays your own group's
  // one row (git-host-5, space-1, space-61).
  const listed = await refreshed(home);
  assert.deepEqual(rowsWith(listed, a.id), [[aKey, "absent", first.url]]);
  assert.deepEqual(rowsWith(listed, b.id), [[bKey, "absent", first.url]]);
  assert.deepEqual(rowsUnder(listed, first.url, LOGIN), [[aKey, "absent", first.url], [bKey, "absent", first.url]]);
  assert.deepEqual(rowsUnder(listed, second.url, LOGIN), [], "the second's namespace there holds no row of its own");
  assert.deepEqual(instanceOf(listed, second.url)?.groups.find((group) => group.fullPath === LOGIN)?.mine, true);
  assert.deepEqual(rowsWith(listed, own.id ?? ""), [[HOST_OWN, "reachable", first.url]]);
  assert.ok(listed.own.repositories.some((repository) => repository.key === HOST_OWN));
  assert.deepEqual(rowsUnder(listed, first.url, "acme"), [[hostKey(first, "acme/solo-spex"), "absent", first.url]]);
  assert.deepEqual(rowsWith(listed, solo.id), [[hostKey(first, "acme/solo-spex"), "absent", first.url]]);

  // Join keys each under the first's folder with its remote named by it,
  // the one naming the second among them, its clone brokered by the
  // first (space-63, git-host-9).
  mark = home.client.mark();
  await home.client.expectOk("space.join", { instance: second.url, hostId: a.id });
  await home.client.waitRepository(mark, aKey, (repository) => repository.state === "reachable" && repository.sync.phase === "idle", 30_000);
  mark = home.client.mark();
  await home.client.expectOk("space.join", { instance: first.url, hostId: b.id });
  await home.client.waitRepository(mark, bKey, (repository) => repository.state === "reachable" && repository.sync.phase === "idle", 30_000);
  for (const key of [aKey, bKey]) {
    assert.deepEqual(git(clonePath(home.dataDir, key), "remote").split("\n"), [hostFolder(first)], key);
  }
  assert.ok(!existsSync(join(home.dataDir, "workspace", hostFolder(second))), "nothing is keyed under the second's folder");
  assert.deepEqual([...new Set(transportsOf(first, `${LOGIN}/a-spex`).map((entry) => entry.instance))], [first.url], "the first brokered the clone");

  // Joined, each stays one row under the first; the second's listing
  // only withholds Join, a join naming either instance refused as here
  // already (space-61, git-host-5).
  const joined = await refreshed(home);
  assert.deepEqual(rowsWith(joined, a.id), [[aKey, "reachable", first.url]]);
  assert.deepEqual(rowsWith(joined, b.id), [[bKey, "reachable", first.url]]);
  assert.deepEqual(rowsUnder(joined, second.url, LOGIN), []);
  for (const fields of [{ instance: second.url, hostId: a.id }, { instance: first.url, hostId: a.id }, { instance: second.url, hostId: b.id }]) {
    await home.client.expectError("space.join", fields, "invalid_request", /on this device already/);
  }

  // The second answering `a-spex` archived and the account below the
  // pushing role on `b-spex` changes nothing while the first is signed
  // in: both read reachable from the first's answer (git-host-5,
  // space-61).
  second.script.archive(a.id);
  second.script.accessLevel(b.id, "Reporter");
  const scripted = await refreshed(home);
  for (const [id, key] of [[a.id, aKey], [b.id, bKey]] as const) {
    assert.deepEqual(rowsWith(scripted, id), [[key, "reachable", first.url]]);
    assert.equal(repositoryOf(scripted, key).reason, null);
  }

  // Its members are read from the first, and a member added there, the
  // second asked nothing (git-host-8, git-host-16).
  const asked = [first.script.requests.length, second.script.requests.length];
  const members = await home.client.expectOk("space.members", { repository: aKey });
  assert.ok(members.members.some((member) => member.login === LOGIN));
  const shared = await home.client.expectOk("space.share", { repository: aKey, login: "bob", role: "developer" });
  assert.ok(shared.members.some((member) => member.login === "bob"));
  assert.deepEqual(membersRequests(first, asked[0]), [
    `GET /api/v1/host/repositories/${a.id}/members`, `POST /api/v1/host/repositories/${a.id}/members`, `GET /api/v1/host/repositories/${a.id}/members`,
  ]);
  assert.deepEqual(second.script.requests.slice(asked[1]).map((request) => request.path), [], "nothing reaches the second");

  // Its push presents a credential the first issued, the Git system's
  // own state the first's (git-host-9).
  const pushedFrom = first.script.transportCredentials.length;
  for (const key of [aKey, bKey]) {
    const synced = await home.client.settle("space.sync", { repository: key, noticed: true }, 30_000);
    assert.deepEqual([synced.sync.phase, synced.state], ["done", "reachable"], `${key}: ${JSON.stringify(synced.sync)}`);
    assert.ok(synced.sync.phase === "done" && synced.sync.pushed, `${key} pushed`);
    assert.equal(git(bareOf(first, key), "rev-parse", "spex"), git(clonePath(home.dataDir, key), "rev-parse", "spex"));
  }
  const pushes = first.script.transportCredentials.slice(pushedFrom).filter((entry) => entry.push);
  assert.ok(pushes.some((entry) => entry.path.includes(`/${LOGIN}/a-spex.git/`)) && pushes.some((entry) => entry.path.includes(`/${LOGIN}/b-spex.git/`)));
  assert.deepEqual([...new Set(pushes.map((entry) => entry.instance))], [first.url], "with credentials the first issued");

  // No reply or broadcast since the sign-ins holds a string under either
  // instance's URL, the shared Git origin's among them, but that URL
  // itself (space-30).
  const values = [...sentSince(home.client.messages, said), await home.client.expectOk("space.get", {})];
  assert.deepEqual(leaks(first, values), []);
  assert.deepEqual(leaks(second, values), []);
});

test("git-host-24, space-83, git-host-5, space-61, space-30, space-63, space-1: a Refresh reads both instances, each acme repository under a key in its own folder, and a group named like the first's login collides at the first alone, its repository there unreachable under a key naming the first's folder, while the second's group of that name lists its repository with Join, which clones it under the second's folder apart from your own group's", async (t) => {
  const { bob, first, second, home, alphaKey, betaKey } = await twoInstances("collides-at-its-instance");
  t.after(() => home.stop());
  // A group at each instance's root under the first's login, `ada`: the
  // first's login, and your own group's folder name, but no login the
  // second names (git-host-5, DR-127).
  first.script.groups.push({ id: "2100", fullPath: LOGIN, name: "Ada's team", kind: "group", members: [{ id: "1001", login: LOGIN, displayName: "Ada Lovelace", role: "Owner" }] });
  const team = first.script.addRepository({ group: "2100", name: "team-spex" });
  second.script.groups.push({ id: "2100", fullPath: LOGIN, name: "Ada's lab", kind: "group", members: [{ ...bob, role: "Owner" }] });
  const lab = second.script.addRepository({ group: "2100", name: "lab-spex" });
  assert.equal(Home.load(home.dataDir).ownName, LOGIN);

  // A Refresh reads both, each `acme` repository under a key in its own
  // instance's folder (git-host-5, space-1).
  const state = await refreshed(home);
  assert.deepEqual(rowsUnder(state, first.url, "acme"), [[alphaKey, "absent", first.url]]);
  assert.deepEqual(rowsUnder(state, second.url, "acme"), [[betaKey, "absent", second.url]]);

  // At the first the group collides with the login there: its own entry
  // beside your namespace, its repository unreachable under a key
  // naming the first's folder and no clone; at the second it is a group
  // like any, its repository not on this device under the second's
  // folder (git-host-5, space-61, space-30).
  const entriesAt = (origin: string) => (instanceOf(state, origin)?.groups ?? []).filter((group) => group.fullPath === LOGIN)
    .map((group) => [group.id, group.login, group.mine, group.name]).sort((x, y) => String(x[0]).localeCompare(String(y[0])));
  assert.deepEqual(entriesAt(first.url), [["2100", null, false, "Ada's team"], [null, LOGIN, true, LOGIN]]);
  assert.deepEqual(entriesAt(second.url), [["2100", null, false, "Ada's lab"]]);
  const groupRows = (origin: string) => (instanceOf(state, origin)?.groups.find((group) => group.id === "2100")?.repositories ?? [])
    .map((repository) => [repository.key, repository.state, repository.reason, repository.instance]);
  assert.deepEqual(groupRows(first.url), [[`${hostFolder(first)}/${LOGIN}/team-spex@${team.id}`, "unreachable", "a group named like your login", first.url]]);
  const labKey = hostKey(second, `${LOGIN}/lab-spex`);
  assert.deepEqual(groupRows(second.url), [[labKey, "absent", null, second.url]]);
  assert.deepEqual(state.own.repositories.map((repository) => repository.key), [HOST_OWN], "your own group's rows stay its own");

  // Join of the first's is refused with that cause; Join of the second's
  // clones it under the second's folder at its path there, your own
  // group's folder holding only what it held (space-61, space-63).
  await home.client.expectError("space.join", { instance: first.url, hostId: team.id }, "invalid_request", /named like your login/);
  const mark = home.client.mark();
  await home.client.expectOk("space.join", { instance: second.url, hostId: lab.id });
  const joined = await home.client.waitRepository(mark, labKey, (repository) => repository.state === "reachable" && repository.sync.phase === "idle", 30_000);
  assert.equal(joined.instance, second.url);
  assert.ok(existsSync(join(clonePath(home.dataDir, labKey), ".git")));
  assert.deepEqual(git(clonePath(home.dataDir, labKey), "remote").split("\n"), [hostFolder(second)]);
  assert.deepEqual(readdirSync(join(home.dataDir, "workspace", LOGIN)), [`${LOGIN}-spex`]);
  assert.ok(!existsSync(join(home.dataDir, "workspace", hostFolder(first), LOGIN)), "no folder is made for the colliding group");
  const after = await home.client.expectOk("space.get", {});
  assert.deepEqual(rowsOf(after).filter((repository) => repository.id === team.id && repository.instance === first.url).map((repository) => [repository.key, repository.state]), [[`${hostFolder(first)}/${LOGIN}/team-spex@${team.id}`, "unreachable"]]);
});

test("git-host-25, space-84, space-60, storage-36, storage-5, git-host-22, git-host-9, space-5, space-11, space-12, space-32, space-61: two instances over one Git backend, the first signed out — a namespace repository both list reads reachable through the second, a Check host of it refused until it follows; its next Sync moves its clone under the second's folder with its remote renamed, its placement file rewritten to the second and the first's deleted, its pair, session and sync preferences re-keyed and its last sync kept, then reads the second's catalog and pushes with a credential the second issued, its Save commit bearing the account there; your own group's own repository follows by its remote's rename alone; the repository the first lists alone reads unreachable, no transport running for it through the second's credential", async (t) => {
  const first = await startHost();
  const second = await startHost({ gitBackend: first, displayName: "Second stand-in" });
  // Both list the person's namespace there under one id; the first alone
  // lists its own group's (git-host-12).
  const a = first.script.addRepository({ group: LOGIN, name: "a-spex" });
  const solo = first.script.addRepository({ group: "acme", name: "solo-spex" });
  const home = await startHome("follow-at-check", { host: first, project: false });
  t.after(() => home.stop());
  let mark = home.client.mark();
  await signIn(home, first);
  await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  await signIn(home, second);
  await refreshed(home);
  const aKey = hostKey(first, `${LOGIN}/a-spex`);
  const followedKey = hostKey(second, `${LOGIN}/a-spex`);
  const soloKey = hostKey(first, "acme/solo-spex");

  // Joined through the first — `a-spex` paired with a working folder and
  // synced there once, recording this device's last sync — and the
  // first's own group's repository beside it.
  const code = gitFolder("a");
  mark = home.client.mark();
  await home.client.expectOk("space.join", { instance: first.url, hostId: a.id, folder: code });
  await home.client.waitRepository(mark, aKey, (repository) => repository.state === "reachable" && repository.sync.phase === "idle" && repository.folder !== null, 30_000);
  mark = home.client.mark();
  await home.client.expectOk("space.join", { instance: first.url, hostId: solo.id });
  await home.client.waitRepository(mark, soloKey, (repository) => repository.state === "reachable" && repository.sync.phase === "idle", 30_000);
  const once = await home.client.settle("space.sync", { repository: aKey, noticed: true }, 30_000);
  assert.deepEqual([once.sync.phase, once.state], ["done", "reachable"], JSON.stringify(once.sync));
  // The join named its placement at the first in a tracked file
  // (storage-36).
  const placed = (origin: string, id: string | null): string => `format: 1\ninstance: "${origin}"\nid: "${id ?? ""}"\n`;
  assert.deepEqual(readdirSync(join(clonePath(home.dataDir, aKey), "placements")), [`${hostFolder(first)}.yaml`]);
  assert.equal(readFileSync(join(clonePath(home.dataDir, aKey), "placements", `${hostFolder(first)}.yaml`), "utf8"), placed(first.url, a.id));
  const last = prefsOf(home.dataDir)[`sync:${aKey}:${hostFolder(first)}:last`];
  assert.equal(typeof (last as { at?: unknown } | undefined)?.at, "number", "its last sync is recorded");
  const sessionId = await runTurn(home, aKey, "Before the follow");

  // The first signed out: both rows stand reachable under the second's
  // heading, each still the first's clone, read from the second's answer;
  // the repository the first alone lists reads unreachable (space-61,
  // space-6, git-host-5).
  const out = await signOut(home, first);
  const said = home.client.mark();
  assert.deepEqual(rowsUnder(out, second.url, LOGIN), [[aKey, "reachable", first.url]]);
  assert.deepEqual([repositoryOf(out, HOST_OWN).state, repositoryOf(out, HOST_OWN).instance], ["reachable", first.url]);
  assert.deepEqual([repositoryOf(out, soloKey).state, repositoryOf(out, soloKey).reason, repositoryOf(out, soloKey).instance], ["unreachable", "Sign in again", first.url]);

  // A Check host follows no instance: refused naming the first, nothing
  // fetched through the second (git-host-9); the first's own group's
  // repository, which the second does not list, is refused a Sync
  // likewise (space-11).
  const transported = first.script.transportCredentials.length;
  await home.client.expectError("space.fetch", { repository: aKey }, "invalid_request", new RegExp(`^Sign in to ${HOST_NAME} first$`));
  await home.client.expectError("space.sync", { repository: soloKey }, "invalid_request", new RegExp(`^Sign in to ${HOST_NAME} first$`));
  assert.equal(first.script.transportCredentials.length, transported, "no transport runs");

  // Its next Sync moves the clone under the second's folder at Check,
  // before any fetch or push — its remote renamed, its fetched spex and
  // upstream with it, its pair, session and sync preferences re-keyed and
  // its last sync kept — then reads the second's catalog and pushes with
  // a credential the second issued, its Save commit bearing the account
  // there (space-60, space-5, git-host-22, git-host-9, space-32).
  const clone = clonePath(home.dataDir, followedKey);
  const refs = (dir: string): string[] => git(dir, "for-each-ref", "--format=%(refname)", "refs/remotes").split("\n");
  let atCompare: { last: unknown; former: string[]; remotes: string[]; spex: boolean } | undefined;
  home.hooks.beforeStep = ({ step, repository }) => {
    if (step !== "compare" || repository !== followedKey || atCompare) return;
    const prefs = prefsOf(home.dataDir);
    atCompare = {
      last: prefs[`sync:${followedKey}:${hostFolder(second)}:last`],
      former: Object.keys(prefs).filter((name) => name.startsWith(`sync:${aKey}:`)),
      remotes: [...new Set(refs(clone).map((ref) => ref.split("/")[2]))],
      spex: refs(clone).includes(`refs/remotes/${hostFolder(second)}/spex`),
    };
  };
  const asked = [first.script.requests.length, second.script.requests.length];
  mark = home.client.mark();
  await home.client.expectOk("space.sync", { repository: aKey });
  const moved = await home.client.waitRepository(mark, followedKey, (repository) => repository.sync.phase !== "running" && repository.sync.phase !== "idle", 30_000);
  home.hooks.beforeStep = undefined;
  assert.deepEqual([moved.sync.phase, moved.state, moved.id, moved.instance], ["done", "reachable", a.id, second.url], JSON.stringify(moved.sync));
  assert.ok(moved.sync.phase === "done" && moved.sync.pushed, "pushed");
  assert.ok(existsSync(join(clone, ".git")) && !existsSync(clonePath(home.dataDir, aKey)), "moved under the second's folder");
  assert.deepEqual(git(clone, "remote").split("\n"), [hostFolder(second)]);
  assert.equal(git(clone, "config", "--get", "branch.spex.remote"), hostFolder(second), "its upstream follows");
  assert.equal(git(clone, "config", "--get", `remote.${hostFolder(second)}.spexId`), a.id);
  // Its placement file follows the remote in that step: the second's
  // naming the same id, the first's deleted (storage-36).
  assert.deepEqual(readdirSync(join(clone, "placements")), [`${hostFolder(second)}.yaml`]);
  assert.equal(readFileSync(join(clone, "placements", `${hostFolder(second)}.yaml`), "utf8"), placed(second.url, a.id));
  assert.deepEqual(atCompare, { last, former: [], remotes: [hostFolder(second)], spex: true }, "its last sync and fetched spex kept, re-keyed");
  assert.equal(Home.load(home.dataDir).keyForFolder(code), followedKey, "its pair follows it");
  assert.ok((await home.client.expectOk("session.list", {})).some((session) => session.id === sessionId && session.projectId === followedKey), "its session follows it");
  assert.equal(prefsOf(home.dataDir)[`sync:${followedKey}:${hostFolder(second)}:noticed`], true, "its sync preferences follow it, re-keyed to its remote");
  assert.deepEqual(Object.keys(prefsOf(home.dataDir)).filter((name) => name.startsWith(`sync:${aKey}:`)), []);
  const apiAt = (host: StandinHost, from: number): string[] => host.script.requests.slice(from).filter((request) => request.path.startsWith("/api/")).map((request) => `${request.method} ${request.path}`);
  assert.deepEqual(apiAt(first, asked[0]), [], "nothing asks the first");
  assert.ok(apiAt(second, asked[1]).includes("GET /api/v1/host/repositories"), "its Check reads the second's catalog");
  assert.ok(apiAt(second, asked[1]).includes("POST /api/v1/host/credential"), "the second brokers its transport");
  const followed = first.script.transportCredentials.slice(transported).filter((entry) => entry.path.includes(`/${LOGIN}/a-spex.git/`));
  assert.ok(followed.some((entry) => entry.push), "pushed through the shared transport");
  assert.deepEqual([...new Set(followed.map((entry) => entry.instance))], [second.url], "with credentials the second issued");
  assert.equal(git(bareOf(second, followedKey), "rev-parse", "spex"), git(clone, "rev-parse", "spex"));
  assert.equal(git(clone, "log", "-1", "--format=%an <%ae>", "spex"), `Ada Lovelace <${LOGIN}@users.noreply.127.0.0.1>`);
  const after = await home.client.expectOk("space.get", {});
  assert.deepEqual(rowsUnder(after, second.url, LOGIN), [[followedKey, "reachable", second.url]]);

  // Your own group's own repository follows the second by its remote's
  // rename alone, keeping its folder, and syncs through it (space-60).
  const ownFrom = first.script.transportCredentials.length;
  const ownSynced = await home.client.settle("space.sync", { repository: HOST_OWN }, 30_000);
  assert.deepEqual([ownSynced.sync.phase, ownSynced.state, ownSynced.instance, ownSynced.key], ["done", "reachable", second.url, HOST_OWN], JSON.stringify(ownSynced.sync));
  assert.deepEqual(git(ownClone(home.dataDir), "remote").split("\n"), [hostFolder(second)]);
  assert.deepEqual(readdirSync(join(ownClone(home.dataDir), "placements")), [`${hostFolder(second)}.yaml`]);
  assert.equal(readFileSync(join(ownClone(home.dataDir), "placements", `${hostFolder(second)}.yaml`), "utf8"), placed(second.url, ownSynced.id));
  const ownTransports = first.script.transportCredentials.slice(ownFrom).filter((entry) => entry.path.includes(`/${HOST_OWN}.git/`));
  assert.ok(ownTransports.length > 0, "its sync reaches the shared transport");
  assert.deepEqual([...new Set(ownTransports.map((entry) => entry.instance))], [second.url], "with credentials the second issued");

  // The repository the first lists alone stays unreachable, its clone
  // where it lay; no transport ran for it through the second's
  // credential (git-host-9, space-61).
  const end = await home.client.expectOk("space.get", {});
  assert.deepEqual([repositoryOf(end, soloKey).state, repositoryOf(end, soloKey).reason], ["unreachable", "Sign in again"]);
  assert.ok(existsSync(join(clonePath(home.dataDir, soloKey), ".git")));
  assert.deepEqual(first.script.transportCredentials.filter((entry) => entry.path.includes("/acme/solo-spex.git/") && entry.instance === second.url), []);

  // No reply or broadcast since the sign-out holds a string under either
  // instance's URL, the shared Git origin's among them, but that URL
  // itself (space-30).
  const values = [...sentSince(home.client.messages, said), end];
  assert.deepEqual(leaks(first, values), []);
  assert.deepEqual(leaks(second, values), []);
});

test("space-60, space-5, storage-34, storage-31: a follow half made — a clone re-keyed under the second's folder, its remote still named by the first's — reads that remote, reachable through the second, and its next Sync renames the remote to the second's folder, its upstream and fetched spex with it, its key and id kept", async (t) => {
  const first = await startHost();
  const second = await startHost({ gitBackend: first, displayName: "Second stand-in" });
  const a = first.script.addRepository({ group: LOGIN, name: "a-spex" });
  const home = await startHome("half-followed", { host: first, project: false });
  t.after(() => home.stop());
  let mark = home.client.mark();
  await signIn(home, first);
  await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  await signIn(home, second);
  await refreshed(home);
  const aKey = hostKey(first, `${LOGIN}/a-spex`);
  const followedKey = hostKey(second, `${LOGIN}/a-spex`);
  mark = home.client.mark();
  await home.client.expectOk("space.join", { instance: first.url, hostId: a.id });
  await home.client.waitRepository(mark, aKey, (repository) => repository.state === "reachable" && repository.sync.phase === "idle", 30_000);
  await signOut(home, first);
  await home.stop();

  // The follow half made, as a refused rename of its remote leaves it:
  // the clone re-keyed under the second's folder, its remote still named
  // by the first's.
  const clone = clonePath(home.dataDir, followedKey);
  mkdirSync(dirname(clone), { recursive: true });
  renameSync(clonePath(home.dataDir, aKey), clone);
  assert.deepEqual(git(clone, "remote").split("\n"), [hostFolder(first)]);

  // Restarted, the clone reads that remote: the second's, reachable under
  // its heading in your namespace there, its remote shown as its path
  // (storage-31, space-61).
  const again = await startHome("half-followed-again", { dataDir: home.dataDir, project: false });
  t.after(() => again.stop());
  mark = again.client.mark();
  await again.client.expectOk("space.get", {});
  const row = await again.client.waitRepository(mark, followedKey, (repository) => repository.state === "reachable", 30_000);
  // Its one placement is that remote, at the first, whose folder names
  // it (storage-34).
  assert.deepEqual([row.instance, row.id, placementOf(row, first.url).path], [second.url, a.id, `${LOGIN}/a-spex`]);

  // Its next Sync makes the rename: the remote named by the second's
  // folder, its upstream and fetched spex with it, its key and id kept,
  // and it syncs with the second (space-60, space-5, storage-34).
  const synced = await again.client.settle("space.sync", { repository: followedKey, noticed: true }, 30_000);
  assert.deepEqual([synced.sync.phase, synced.state, synced.key, synced.id, synced.instance], ["done", "reachable", followedKey, a.id, second.url], JSON.stringify(synced.sync));
  assert.deepEqual(git(clone, "remote").split("\n"), [hostFolder(second)]);
  assert.equal(git(clone, "config", "--get", "branch.spex.remote"), hostFolder(second));
  // The rename carried the id in its remote's section (storage-34).
  assert.equal(git(clone, "config", "--get", `remote.${hostFolder(second)}.spexId`), a.id);
  assert.deepEqual([...new Set(git(clone, "for-each-ref", "--format=%(refname)", "refs/remotes").split("\n").map((ref) => ref.split("/")[2]))], [hostFolder(second)]);
  assert.ok(existsSync(join(clone, ".git")) && !existsSync(clonePath(home.dataDir, aKey)), "its key is kept");
  assert.equal(git(bareOf(second, followedKey), "rev-parse", "spex"), git(clone, "rev-parse", "spex"));
});

test("space-83, space-82, space-29, git-host-10: space.forget of a signed-out instance under which acme clones are still kept is refused naming each, every clone, remote and entry kept as they were; of an instance still signed in, refused; of one the home does not list, not found; nothing is asked of either instance", async (t) => {
  const { bob, first, second, alpha, beta, home, alphaKey, betaKey } = await twoInstances("forget-refused");
  t.after(() => home.stop());
  const delta = first.script.addRepository({ group: "acme", name: "delta-spex" });
  const deltaKey = hostKey(first, "acme/delta-spex");
  await refreshed(home);
  for (const [host, id, key] of [[first, alpha.id, alphaKey], [first, delta.id, deltaKey], [second, beta.id, betaKey]] as const) {
    const mark = home.client.mark();
    await home.client.expectOk("space.join", { instance: host.url, hostId: id });
    await home.client.waitRepository(mark, key, (repository) => repository.state === "reachable" && repository.sync.phase === "idle", 30_000);
  }
  await signOut(home, first);
  const entries = (): unknown[] => Home.load(home.dataDir).instances().map((entry) => [entry.origin, entry.account?.login, entry.signedOut === true]);
  const remotes = (key: string): string[] => git(clonePath(home.dataDir, key), "remote").split("\n");
  const asked = [first.script.requests.length, second.script.requests.length];

  // The first's acme clones are listed by no signed-in instance — the
  // second is another Git system — so Forget is refused naming each,
  // its clones still keyed under it with their remotes, your own
  // group's own repository's remotes there and at the second untouched,
  // its entry kept signed out (space-82, git-host-10).
  await home.client.expectError("space.forget", { instance: first.url }, "invalid_request", new RegExp(`^Still kept under ${HOST_NAME}: (alpha-spex, delta-spex|delta-spex, alpha-spex)$`));
  for (const key of [alphaKey, deltaKey]) {
    assert.ok(existsSync(join(clonePath(home.dataDir, key), ".git")), key);
    assert.deepEqual(remotes(key), [hostFolder(first)], key);
  }
  assert.deepEqual(remotes(HOST_OWN), [hostFolder(first), hostFolder(second)]);
  assert.deepEqual(entries(), [[first.url, LOGIN, true], [second.url, bob.login, false]]);
  const kept = await home.client.expectOk("space.get", {});
  assert.deepEqual(kept.instances.map((instance) => [instance.origin, instance.signedIn]), [[first.url, false], [second.url, true]]);
  for (const key of [alphaKey, deltaKey]) assert.deepEqual([repositoryOf(kept, key).instance, repositoryOf(kept, key).state], [first.url, "unreachable"], key);

  // An instance still signed in is refused, and one the home does not
  // list is not found, each changing nothing (space-29).
  await home.client.expectError("space.forget", { instance: second.url }, "invalid_request", /^Sign out of Second stand-in first$/);
  await home.client.expectError("space.forget", { instance: "https://elsewhere.example" }, "not_found");
  assert.deepEqual(entries(), [[first.url, LOGIN, true], [second.url, bob.login, false]]);
  assert.deepEqual(remotes(betaKey), [hostFolder(second)]);
  assert.deepEqual([first.script.requests.length, second.script.requests.length], asked, "Forget asks nothing of either instance");
});

test("space-83, space-82, space-61, space-4, space-59, space-5, space-32, storage-2, storage-34: on a home signed in at the first alone, space.forget after its sign-out drops your own group's own repository's remote, its id, the spex it fetched and its upstream with it, its placement file left, the state listing no instance and that row local only; a sign-in then at the second creates bob-spex in the second's namespace and pushes it, the folder keeping ada", async (t) => {
  const bob = { id: "1002", login: "bob", displayName: "Bob" };
  const first = await startHost();
  const second = await startHost({ displayName: "Second stand-in", person: bob });
  const home = await startHome("forget-alone", { host: first, project: false });
  t.after(() => home.stop());
  let mark = home.client.mark();
  await signIn(home, first);
  const created = await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  assert.ok(created.id);
  await signOut(home, first);

  // Forget of the first, which no signed-in instance replaces: your own
  // group's own repository's remote there is dropped — the host's id in
  // its section (storage-34), the spex it fetched and the upstream naming
  // it with it, its last check cleared, its placement file left — and the
  // entry goes, the home as before any sign-in (space-82, space-5,
  // space-32, storage-2).
  const forgotten = await forget(home, first);
  assert.deepEqual(forgotten.instances, []);
  assert.equal(forgotten.defaultInstance, first.url, "the origin the home was created with");
  assert.deepEqual(Home.load(home.dataDir).instances(), []);
  const own = repositoryOf(forgotten, HOST_OWN);
  assert.deepEqual([own.own, own.state, own.instance, own.id, own.placements], [true, "local-only", null, null, []]);
  assert.ok(forgotten.own.repositories.some((repository) => repository.key === HOST_OWN));
  const ownDir = clonePath(home.dataDir, HOST_OWN);
  assert.equal(git(ownDir, "remote"), "");
  assert.throws(() => git(ownDir, "config", "--get-regexp", "spexid$"), "no host id recorded");
  assert.equal(git(ownDir, "for-each-ref", "--format=%(refname)", `refs/remotes/${hostFolder(first)}`), "", "what it fetched goes with it");
  assert.throws(() => git(ownDir, "config", "--get", "branch.spex.remote"), "no upstream left");
  assert.equal(readFileSync(join(ownDir, PLACEMENTS_DIR, `${hostFolder(first)}.yaml`), "utf8"), encodePlacementFile(canonicalOrigin(first.url), created.id as string), "its placement file is left as it stood");
  await home.client.expectError("space.sync", { repository: HOST_OWN }, "invalid_request", /^Pick a group first$/);

  // A sign-in then at the second creates `bob-spex` in the second's
  // namespace for it and pushes it there, its remote named by the
  // second's folder, its folder keeping `ada` (space-4, space-59,
  // space-61).
  const createdAtFirst = first.script.creations.length;
  mark = home.client.mark();
  await signIn(home, second);
  const pushed = await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.instance === second.url && repository.sync.phase === "done", 30_000);
  assert.deepEqual([pushed.state, pushed.key, pushed.own], ["reachable", HOST_OWN, true]);
  assert.ok(pushed.sync.phase === "done" && pushed.sync.pushed, JSON.stringify(pushed.sync));
  assert.deepEqual(second.script.creations.map((body) => (body as { name?: unknown; group_id?: unknown })).map((body) => [body.name, body.group_id ?? null]), [[`${bob.login}-spex`, null]]);
  assert.equal(first.script.creations.length, createdAtFirst, "nothing is created at the first");
  assert.deepEqual(git(ownDir, "remote").split("\n"), [hostFolder(second)]);
  assert.equal(git(bareOf(second, `${bob.login}/${bob.login}-spex`), "rev-parse", "spex"), git(ownDir, "rev-parse", "spex"));
  assert.ok(second.script.transportCredentials.some((entry) => entry.push && entry.instance === second.url && entry.path.includes(`/${bob.login}/${bob.login}-spex.git/`)), "pushed with a credential the second issued");
  assert.equal(Home.load(home.dataDir).ownName, LOGIN);
  assert.deepEqual(readdirSync(join(home.dataDir, "workspace")), [LOGIN], "the folder keeps its name");
  const state = await home.client.expectOk("space.get", {});
  assert.deepEqual(state.instances.map((instance) => [instance.origin, instance.account.login, instance.signedIn]), [[second.url, bob.login, true]]);
  assert.equal(state.own.name, LOGIN);
});

test("space-84, space-82, space-60, space-29, space-5, storage-34, storage-36: two instances over one Git backend, the first signed out — space.forget of the first, a session beneath b-spex's clone under a lease taken out of band, is refused naming that session, the instance and that clone kept as they were and a-spex's follow made; the lease released, it re-keys b-spex's clone under the second's folder with its remote renamed, its pair re-keyed and its placement file rewritten to the second's, and removes the instance, your own group's own repository keeping its folder and syncing with the second through its remote renamed, its placement file rewritten to the second's with the first's deleted", async (t) => {
  const first = await startHost();
  const second = await startHost({ gitBackend: first, displayName: "Second stand-in" });
  const a = first.script.addRepository({ group: LOGIN, name: "a-spex" });
  const b = first.script.addRepository({ group: LOGIN, name: "b-spex" });
  const home = await startHome("forget-follows", { host: first, project: false });
  t.after(() => home.stop());
  let mark = home.client.mark();
  await signIn(home, first);
  await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  await signIn(home, second);
  await refreshed(home);
  const aKey = hostKey(first, `${LOGIN}/a-spex`);
  const bKey = hostKey(first, `${LOGIN}/b-spex`);
  const aFollowed = hostKey(second, `${LOGIN}/a-spex`);
  const bFollowed = hostKey(second, `${LOGIN}/b-spex`);
  const code = gitFolder("b");
  mark = home.client.mark();
  await home.client.expectOk("space.join", { instance: first.url, hostId: a.id });
  await home.client.waitRepository(mark, aKey, (repository) => repository.state === "reachable" && repository.sync.phase === "idle", 30_000);
  mark = home.client.mark();
  await home.client.expectOk("space.join", { instance: first.url, hostId: b.id, folder: code });
  await home.client.waitRepository(mark, bKey, (repository) => repository.state === "reachable" && repository.sync.phase === "idle" && repository.folder !== null, 30_000);
  await signOut(home, first);
  const said = home.client.mark();
  const entries = (): unknown[] => Home.load(home.dataDir).instances().map((entry) => [entry.origin, entry.signedOut === true]);
  const remotes = (key: string): string[] => git(clonePath(home.dataDir, key), "remote").split("\n");
  const askedFirst = first.script.requests.filter((request) => request.path.startsWith("/api/")).length;

  // A session beneath `b-spex`'s clone stands under a lease taken out of
  // band: Forget is refused naming that session, the instance kept
  // signed out and that clone where it lay, with its remote and pair;
  // `a-spex`, which no lease holds, has followed the second meanwhile
  // (space-82).
  const bClone = clonePath(home.dataDir, bKey);
  const sessions = createSessionStore({ sessionsDir: join(bClone, "sessions") });
  await sessions.prepare();
  const sessionId = randomUUID();
  const live = await sessions.acquireManagement(sessionId);
  let released = false;
  try {
    await home.client.expectError("space.forget", { instance: first.url }, "invalid_request", new RegExp(`^Session ${sessionId.slice(0, 8)} is in use$`));
    assert.deepEqual(entries(), [[first.url, true], [second.url, false]]);
    assert.ok(existsSync(join(bClone, ".git")) && !existsSync(clonePath(home.dataDir, bFollowed)), "that clone stays where it lay");
    assert.deepEqual(remotes(bKey), [hostFolder(first)]);
    assert.equal(Home.load(home.dataDir).keyForFolder(code), bKey);
    assert.deepEqual(remotes(HOST_OWN), [hostFolder(first)], "your own group's own repository is reached only after every follow");
    assert.ok(existsSync(join(clonePath(home.dataDir, aFollowed), ".git")) && !existsSync(clonePath(home.dataDir, aKey)), "a-spex's follow is made");
    assert.deepEqual(remotes(aFollowed), [hostFolder(second)]);
    const refusedState = await home.client.expectOk("space.get", {});
    assert.deepEqual(refusedState.instances.map((instance) => [instance.origin, instance.signedIn]), [[first.url, false], [second.url, true]]);
    assert.deepEqual([repositoryOf(refusedState, bKey).instance, repositoryOf(refusedState, aFollowed).instance], [first.url, second.url]);
  } finally {
    await live.release();
    released = true;
  }
  assert.ok(released);

  // The lease released, Forget re-keys `b-spex`'s clone under the
  // second's folder with its remote renamed and its pair re-keyed, then
  // removes the instance; your own group's own repository keeps its
  // folder, its remote renamed to the second's folder (space-82,
  // space-60, storage-34).
  const forgotten = await forget(home, first);
  assert.deepEqual(forgotten.instances.map((instance) => instance.origin), [second.url]);
  assert.deepEqual(entries(), [[second.url, false]]);
  assert.ok(existsSync(join(clonePath(home.dataDir, bFollowed), ".git")) && !existsSync(bClone), "b-spex follows the second");
  assert.deepEqual(remotes(bFollowed), [hostFolder(second)]);
  assert.equal(git(clonePath(home.dataDir, bFollowed), "config", "--get", `remote.${hostFolder(second)}.spexId`), b.id);
  assert.equal(Home.load(home.dataDir).keyForFolder(code), bFollowed, "its pair follows it");
  assert.deepEqual(remotes(HOST_OWN), [hostFolder(second)]);
  assert.ok(existsSync(join(ownClone(home.dataDir), ".git")));
  // Each placement file is rewritten to the second's, the first's
  // deleted, in the step that renames its remote (storage-36): your own
  // group's among them (space-82).
  const ownId = git(ownClone(home.dataDir), "config", "--get", `remote.${hostFolder(second)}.spexId`);
  for (const [clone, id] of [[clonePath(home.dataDir, bFollowed), b.id], [ownClone(home.dataDir), ownId]] as const) {
    assert.deepEqual(readdirSync(join(clone, PLACEMENTS_DIR)), [`${hostFolder(second)}.yaml`], clone);
    assert.equal(readFileSync(join(clone, PLACEMENTS_DIR, `${hostFolder(second)}.yaml`), "utf8"), encodePlacementFile(canonicalOrigin(second.url), id), clone);
  }
  for (const key of [aFollowed, bFollowed, HOST_OWN]) {
    assert.deepEqual([repositoryOf(forgotten, key).instance, repositoryOf(forgotten, key).state], [second.url, "reachable"], key);
  }
  assert.ok(!existsSync(join(home.dataDir, "workspace", hostFolder(first))), "nothing is kept under the first's folder");
  assert.equal(first.script.requests.filter((request) => request.path.startsWith("/api/")).length, askedFirst, "nothing asks the first");

  // Your own group's own repository syncs with the second through its
  // renamed remote, with a credential the second issued (space-82).
  const ownFrom = first.script.transportCredentials.length;
  const ownSynced = await home.client.settle("space.sync", { repository: HOST_OWN }, 30_000);
  assert.deepEqual([ownSynced.sync.phase, ownSynced.state, ownSynced.instance, ownSynced.key], ["done", "reachable", second.url, HOST_OWN], JSON.stringify(ownSynced.sync));
  const ownTransports = first.script.transportCredentials.slice(ownFrom).filter((entry) => entry.path.includes(`/${HOST_OWN}.git/`));
  assert.ok(ownTransports.length > 0, "its sync reaches the shared transport");
  assert.deepEqual([...new Set(ownTransports.map((entry) => entry.instance))], [second.url], "with credentials the second issued");

  // No reply or broadcast since the sign-out holds a string under either
  // instance's URL, the shared Git origin's among them, but that URL
  // itself (space-30).
  const values = [...sentSince(home.client.messages, said), await home.client.expectOk("space.get", {})];
  assert.deepEqual(leaks(first, values), []);
  assert.deepEqual(leaks(second, values), []);
});

test("git-host-5, space-84, space-30, space-1: signed in at the first, then at a third on a Git backend of its own, then at a second over the first's, a namespace repository joined through the first and one the first lists alone read the first as governing; the first signed out, the namespace repository reads the second, the earliest signed-in instance listing it, not the third before it, and the other none", async (t) => {
  const bob = { id: "1002", login: "bob", displayName: "Bob" };
  const first = await startHost();
  const third = await startHost({ displayName: "Third stand-in", person: bob });
  const second = await startHost({ gitBackend: first, displayName: "Second stand-in" });
  // The first and the second list the person's namespace there under
  // one id; the third, another Git system, lists neither repository
  // (git-host-12).
  const a = first.script.addRepository({ group: LOGIN, name: "a-spex" });
  const solo = first.script.addRepository({ group: "acme", name: "solo-spex" });
  const home = await startHome("governing", { host: first, project: false });
  t.after(() => home.stop());
  let mark = home.client.mark();
  await signIn(home, first);
  await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  await signIn(home, third);
  await signIn(home, second);
  const listed = await refreshed(home);
  assert.deepEqual(listed.instances.map((instance) => instance.origin), [first.url, third.url, second.url]);
  const aKey = hostKey(first, `${LOGIN}/a-spex`);
  const soloKey = hostKey(first, "acme/solo-spex");
  const governing = (state: GroupsState, key: string): [string, string | null] => [repositoryOf(state, key).state, repositoryOf(state, key).governing];

  // Not on this device, a repository is governed by the earliest
  // instance whose read lists it, under whose heading it stands
  // (git-host-5, space-1).
  assert.deepEqual(governing(listed, aKey), ["absent", first.url]);
  assert.deepEqual(governing(listed, soloKey), ["absent", first.url]);

  // Joined through the first, each is governed by its clone's instance
  // while signed in there, as is your own group's own repository
  // (git-host-5, space-30).
  for (const [id, key] of [[a.id, aKey], [solo.id, soloKey]] as const) {
    mark = home.client.mark();
    await home.client.expectOk("space.join", { instance: first.url, hostId: id });
    await home.client.waitRepository(mark, key, (repository) => repository.state === "reachable" && repository.sync.phase === "idle", 30_000);
  }
  const joined = await home.client.expectOk("space.get", {});
  for (const key of [aKey, soloKey, HOST_OWN]) assert.deepEqual(governing(joined, key), ["reachable", first.url], key);

  // The first signed out: the namespace repository and your own group's
  // own repository are governed by the second, the earliest signed-in
  // instance in the home's list that lists them — the third, signed in
  // before it, lists neither — and the repository the first lists alone
  // by none, its row unreachable with Sign in again (git-host-5,
  // space-30, space-1).
  const out = await signOut(home, first);
  assert.equal(instanceOf(out, third.url)?.signedIn, true);
  assert.deepEqual(governing(out, aKey), ["reachable", second.url]);
  assert.deepEqual(rowsUnder(out, second.url, LOGIN), [[aKey, "reachable", first.url]]);
  assert.deepEqual(governing(out, HOST_OWN), ["reachable", second.url]);
  assert.deepEqual([...governing(out, soloKey), repositoryOf(out, soloKey).reason], ["unreachable", null, "Sign in again"]);
});

test("space-1, space-30, space-83, space-59, space-82: own.named reads true before any sign-in, false once a sign-in names the folder after the login there, and false still after the sign-out and Forget; where the login there is this device's user name, which names nothing, it reads true still after the Forget", async (t) => {
  const first = await startHost();
  const same = await startHost({ displayName: "Same-name stand-in", person: { id: "1009", login: OWN, displayName: "Tester" } });
  for (const { host, name, named } of [
    { host: first, name: LOGIN, named: false },
    { host: same, name: OWN, named: true },
  ]) {
    const home = await startHome(`named-${name}`, { host, project: false });
    t.after(() => home.stop());
    // Before any sign-in, the folder bears this device's user name
    // (space-1, storage-2).
    const before = await home.client.expectOk("space.get", {});
    assert.deepEqual([before.instances, before.own.name, before.own.named], [[], OWN, true], name);
    // A sign-in names it after a login there other than that name
    // (space-59), its own repository pushed there (space-4).
    const mark = home.client.mark();
    await signIn(home, host);
    await home.client.waitRepository(mark, `${name}/${name}-spex`, (repository) => repository.sync.phase === "done", 30_000);
    const signed = await home.client.expectOk("space.get", {});
    assert.deepEqual([signed.own.name, signed.own.named], [name, named], name);
    // Signed out and forgotten, the home lists no instance, and the
    // folder keeps the name it bears (space-82, space-1).
    await signOut(home, host);
    const forgotten = await forget(home, host);
    assert.deepEqual([forgotten.instances, forgotten.own.name, forgotten.own.named], [[], name, named], name);
  }
});

test("space-86: an explicit content-size rejection keeps access and Save, names only the instance and limit, and retries only on an explicit Sync", async (t) => {
  const host = await startHost();
  const home = await startHome("size-limit", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  let mark = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(mark, HOST_OWN, (row) => row.sync.phase === "done", 30_000);
  const { key: local } = await addFolder(home, gitFolder("size-limit"));
  mark = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: host.url, groupId: "2002", name: "size-limit" } });
  const key = hostKey(host, "acme/size-limit-spex");
  await home.client.waitRepository(mark, key, (row) => row.sync.phase === "done", 30_000);
  const clone = clonePath(home.dataDir, key);
  const repo = host.script.repositories.find((row) => row.group.fullPath === "acme" && row.path === "size-limit-spex");
  assert.ok(repo);
  const hostHead = git(repo.bare, "rev-parse", "spex");
  const pushes = (): number => host.script.requests.filter((row) => row.method === "POST" && row.path.endsWith("/git-receive-pack")).length;
  const beforePushes = pushes();
  const rawWords = [
    "GitLab: You are attempting to check in one or more blobs which exceed the 100.0MiB limit:",
    `${"a".repeat(40)} (159MiB)`,
    `See "${host.gitOrigin}/${STANDIN_STORAGE}/help/size" and '${host.gitOrigin}/${STANDIN_STORAGE}/acme/size-limit-spex.git'.`,
  ].join("\n");
  host.script.refusePush(rawWords);
  writeFileSync(join(clone, "notes.txt"), "saved but rejected by the content rule\n");
  const sized = await home.client.settle("space.sync", { repository: key });
  assert.ok(sized.sync.phase === "stopped", JSON.stringify(sized.sync));
  assert.deepEqual([sized.sync.step, sized.sync.cause, sized.sync.message, sized.sync.retry], ["push", "size_limit", `${HOST_NAME} refused content above its size limit (100.0MiB)`, true]);
  assert.equal(sized.sync.guidance, "Your saved commits remain on this device. Address the content limit, then Retry.");
  assert.equal(sized.state, "reachable", "a content rejection is not loss of access");
  assert.doesNotMatch(`${sized.sync.message} ${sized.sync.guidance}`, /159MiB|GitLab|https?:|Share|membership|sign in|reauth/i);
  const saved = git(clone, "rev-parse", "HEAD");
  assert.notEqual(saved, hostHead, "the actual Save stands");
  assert.equal(git(repo.bare, "rev-parse", "spex"), hostHead, "the rejected push changed no remote ref");
  assert.equal(pushes(), beforePushes + 1);
  assert.equal((await home.client.repository(key)).sync.phase, "stopped");
  assert.equal(pushes(), beforePushes + 1, "a settled rejection starts no automatic push retry");

  host.script.refusePush("You are attempting to check in one or more blobs which exceed the size limit:");
  const unknownLimit = await home.client.settle("space.sync", { repository: key });
  assert.ok(unknownLimit.sync.phase === "stopped");
  assert.deepEqual([unknownLimit.sync.cause, unknownLimit.sync.message, unknownLimit.state], ["size_limit", `${HOST_NAME} refused content above its size limit`, "reachable"]);
  assert.equal(git(clone, "rev-parse", "HEAD"), saved, "retry did not replace the saved content");
  host.script.refusePush([
    "You are attempting to check in one or more blobs which exceed the 100MiB limit:",
    "You are attempting to check in one or more blobs which exceed the 200MiB limit:",
  ].join("\n"));
  const mixedLimits = await home.client.settle("space.sync", { repository: key });
  assert.ok(mixedLimits.sync.phase === "stopped");
  assert.deepEqual([mixedLimits.sync.cause, mixedLimits.sync.message, mixedLimits.state], ["size_limit", `${HOST_NAME} refused content above its size limit`, "reachable"]);
  host.script.refusePush(null);
  const sent = await home.client.settle("space.sync", { repository: key });
  assert.ok(sent.sync.phase === "done" && sent.sync.pushed, JSON.stringify(sent.sync));
  assert.equal(git(repo.bare, "rev-parse", "spex"), saved, "an explicit Sync sends the retained Save after the condition changes");
  assert.equal(pushes(), beforePushes + 4, "only the four explicit Sync commands reached Push");

  host.script.refuseTransport("Your account may not push here.");
  const denied = await home.client.settle("space.sync", { repository: key });
  assert.ok(denied.sync.phase === "stopped");
  assert.deepEqual([denied.sync.cause, denied.state], ["refused", "read-only"]);
  assert.match(denied.sync.guidance, /Membership.*Share/);
  host.script.refuseTransport(null);
  mark = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  await home.client.waitRepository(mark, key, (row) => row.state === "reachable");

  host.script.refusePush([
    "Permission denied: your account may not push here.",
    "You are attempting to check in one or more blobs which exceed the 100MiB limit:",
  ].join("\n"));
  writeFileSync(join(clone, "notes.txt"), "mixed permission and size evidence\n");
  const mixedDenial = await home.client.settle("space.sync", { repository: key });
  assert.ok(mixedDenial.sync.phase === "stopped");
  assert.deepEqual([mixedDenial.sync.cause, mixedDenial.state], ["refused", "read-only"], "specific permission evidence keeps priority over size wording");
  assert.match(mixedDenial.sync.guidance, /Membership.*Share/);
  host.script.refusePush(null);
  mark = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  await home.client.waitRepository(mark, key, (row) => row.state === "reachable");

  // Quoted payload words and a size-looking documentation URL establish no size rejection.
  host.script.refusePush([
    `Rule declined commit subject "too large"; see '${host.gitOrigin}/blobs/exceed/100MiB-size-limit'.`,
    'Quoted commit message: "You are attempting to check in one or more blobs which exceed the 100.0MiB limit:"',
  ].join("\n"));
  writeFileSync(join(clone, "notes.txt"), "a separate ordinary rule rejection\n");
  const otherRule = await home.client.settle("space.sync", { repository: key });
  assert.ok(otherRule.sync.phase === "stopped");
  assert.deepEqual([otherRule.sync.cause, otherRule.state], ["refused", "read-only"]);
  assert.match(otherRule.sync.guidance, /Membership.*Share/);
  host.script.refusePush(null);
  assert.deepEqual(leaks(host, [...broadcasts(home.client.messages), await home.client.expectOk("space.get", {})]), []);
});
