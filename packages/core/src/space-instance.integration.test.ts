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
// instances by their origins, each entry appended in its turn.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createSessionStore } from "@sublang/playbook/session-store";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { GitHostClient, HostError, credentialsPath, fileCredentialStore, type StoredCredential } from "./git-host.js";
import { Home } from "./home.js";
import { needsInstancesMigration } from "./migrate-instances.js";
import { clonePath, createSpaceHarness, hostFolder, hostKey, instanceOf, OWN_KEY, ownClone, prefsOf, repositoryOf, stringsOf } from "./testing/space-harness.js";
import { STANDIN_STORAGE, type StandinHost } from "./testing/standin-host.js";
import type { GroupsState, ServerMessage } from "./protocol.js";

const fixture = createSpaceHarness();
const { scratch, git, gitFolder, bareRepo, addFolder, startHome, startHost, signIn, signOut, runTurn } = fixture;
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
  assert.deepEqual(bob.repositories.map((repository) => [repository.key, repository.state, repository.remote]), [[hostKey(host, "bob/notes-spex"), "absent", "bob/notes-spex"]]);
  const listedTeam = repositoryOf(state, hostKey(host, "acme/team-spex"));
  assert.deepEqual([listedTeam.id, listedTeam.remote], [team.id, "acme/team-spex"], "a listed remote reads as its path in the instance");

  // Joined, it clones under `workspace/<folder>/bob/`, its remote named
  // by the instance's folder (DR-127); its members are read with no page
  // (space-63, space-62).
  const notesFolder = join(mkdtempSync(join(scratch, "notes-")), "notes");
  let mark = home.client.mark();
  await home.client.expectOk("space.join", { hostId: notes.id, folder: notesFolder });
  const joined = await home.client.waitRepository(mark, hostKey(host, "bob/notes-spex"), (repository) => repository.state === "reachable" && repository.folder !== null);
  assert.equal(joined.remote, "bob/notes-spex");
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
  assert.ok(entry(await home.client.expectOk("space.get", {}), "bob").repositories.some((repository) => repository.key === hostKey(host, "bob/notes-spex")));

  // A project picked into acme, the pick moving the clone under the
  // instance's folder with its remote named by it (storage-35), and
  // transferred by the stand-in into acme/research: a Refresh lists it
  // there with its key unchanged, and its next sync moves the clone
  // (space-1, space-60).
  const code = gitFolder("plans");
  const { key: local } = await addFolder(home, code);
  mark = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", groupId: "2002", name: "plans" } });
  const picked = await home.client.waitRepository(mark, hostKey(host, "acme/plans-spex"), (repository) => repository.sync.phase === "done", 30_000);
  assert.ok(picked.id);
  assert.ok(git(clonePath(home.dataDir, hostKey(host, "acme/plans-spex")), "remote", "get-url", hostFolder(host)).startsWith(`${host.gitOrigin}/${STANDIN_STORAGE}/acme/`));
  host.script.rename(picked.id, { group: "acme/research" });
  mark = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  const listed = await home.client.waitSpace(mark, (candidate) => entry(candidate, "acme/research").repositories.some((repository) => repository.key === hostKey(host, "acme/plans-spex")));
  assert.ok(!entry(listed, "acme").repositories.some((repository) => repository.key === hostKey(host, "acme/plans-spex")), "no longer under its former group");
  assert.equal(repositoryOf(listed, hostKey(host, "acme/plans-spex")).remote, "acme/research/plans-spex");
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

  // The group stands as an entry of its own after yours; your own
  // group's rows stay yours (space-1, space-61).
  const state = await home.client.expectOk("space.get", {});
  assert.deepEqual(state.groups.map((group) => [group.fullPath, group.own, group.id]), [
    [LOGIN, true, "2001"], ["acme", false, "2002"], ["acme/research", false, "2003"], [LOGIN, false, named.id],
  ]);
  assert.deepEqual(entry(state, LOGIN, true).repositories.map((repository) => [repository.key, repository.state]), [[HOST_OWN, "reachable"]]);
  const apart = entry(state, LOGIN);
  assert.deepEqual(apart.repositories.map((repository) => [repository.key, repository.state, repository.reason, repository.remote, repository.branch]), [
    [`${hostFolder(host)}/${LOGIN}/${LOGIN}-spex@${clash.id}`, "unreachable", "a group named like your login", `${LOGIN}/${LOGIN}-spex`, null],
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
  await home.client.expectOk("space.join", { hostId: team.id, folder: join(mkdtempSync(join(scratch, "team-")), "team") });
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
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", groupId: "2002", name: "earlier" } });
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
  assert.deepEqual([moved.sync.phase, moved.state, moved.id, moved.remote], ["done", "reachable", picked.id, "acme/earlier-spex"], JSON.stringify(moved.sync));
  const clone = clonePath(home.dataDir, key);
  assert.ok(existsSync(join(clone, ".git")) && !existsSync(clonePath(home.dataDir, legacy)), "the clone moved under the instance's folder");
  assert.deepEqual(git(clone, "remote").split("\n"), [folder], "its one remote is named by the instance's folder");
  assert.equal(git(clone, "config", "--get", "spex.repositoryId"), picked.id);
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

test("space-60: a clone the instances migration deferred, a live session's lease beneath it, is listed by the key it kept and syncs only once its next sync has moved it under the instance's folder, its remote renamed", async (t) => {
  const host = await startHost();
  const folder = hostFolder(host);
  const home = await startHome("deferred", { host, project: false, extra: { signIn: "browser" } });
  let mark = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  const code = gitFolder("deferred");
  const { key: local } = await addFolder(home, code);
  mark = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", groupId: "2002", name: "deferred" } });
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
  git(legacyClone, "remote", "rename", folder, "origin");
  git(clonePath(home.dataDir, HOST_OWN), "remote", "rename", folder, "origin");
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
    mark = again.client.mark();
    await again.client.expectOk("space.refresh", {});
    const state = await again.client.waitSpace(mark, (candidate) => candidate.read.phase === "idle" && candidate.readAt !== null, 30_000);
    const rows = state.groups.flatMap((group) => group.repositories).filter((repository) => repository.id === picked.id);
    assert.deepEqual(rows.map((repository) => repository.key), [legacy], "listed once, by the key it kept");
    assert.ok(entry(state, "acme").repositories.some((repository) => repository.key === legacy), "under its group at the instance");

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

test("storage-35: a pick of a clone in your own group's folder moves it under the instance's folder as the creation or the join lands, its pair, sessions and preferences following; a session's lease beneath leaves it there, read as the instance's by its remote, until its next sync moves it", async (t) => {
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
  await home.client.expectOk("space.pick", { repository: createdLocal, choice: { kind: "create", groupId: "2002", name: "created" } });
  const createdClone = clonePath(home.dataDir, createdKey);
  assert.ok(existsSync(join(createdClone, ".git")) && !existsSync(clonePath(home.dataDir, createdLocal)), "moved as the creation landed");
  assert.deepEqual(git(createdClone, "remote").split("\n"), [folder]);
  assert.ok(git(createdClone, "config", "--get", "spex.repositoryId").length > 0);
  assert.equal(Home.load(home.dataDir).keyForFolder(created), createdKey, "its pair follows it");
  assert.ok((await home.client.expectOk("session.list", {})).some((session) => session.id === sessionId && session.projectId === createdKey), "its session follows it");
  assert.ok(existsSync(join(createdClone, "sessions", `${sessionId}.json`)));

  // A join, the notice it was picked with following it.
  const joinedCode = gitFolder("joined");
  const { key: joinedLocal } = await addFolder(home, joinedCode);
  const joinedKey = hostKey(host, "acme/joined-spex");
  held.add(joinedLocal).add(joinedKey);
  await home.client.expectOk("space.pick", { repository: joinedLocal, choice: { kind: "join", hostId: listed.id }, noticed: true });
  const joinedClone = clonePath(home.dataDir, joinedKey);
  assert.ok(existsSync(join(joinedClone, ".git")) && !existsSync(clonePath(home.dataDir, joinedLocal)), "moved as the join landed");
  assert.deepEqual(git(joinedClone, "remote").split("\n"), [folder]);
  assert.equal(git(joinedClone, "config", "--get", "spex.repositoryId"), listed.id);
  assert.equal(Home.load(home.dataDir).keyForFolder(joinedCode), joinedKey);
  assert.equal(prefsOf(home.dataDir)[`sync:${joinedKey}:noticed`], true, "its sync preferences follow it");
  assert.equal(prefsOf(home.dataDir)[`sync:${joinedLocal}:noticed`], undefined);

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
    await home.client.expectOk("space.pick", { repository: leasedLocal, choice: { kind: "create", groupId: "2002", name: "leased" } });
    const stopped = await home.client.waitRepository(mark, leasedLocal, (repository) => repository.sync.phase === "stopped", 30_000);
    assert.ok(stopped.sync.phase === "stopped" && stopped.sync.cause === "lease" && stopped.sync.step === "check", JSON.stringify(stopped.sync));
    assert.ok(existsSync(join(leasedClone, ".git")) && !existsSync(clonePath(home.dataDir, leasedKey)), "it stays where it lies");
    assert.deepEqual(git(leasedClone, "remote").split("\n"), [folder], "its remote names its instance");
    assert.ok(stopped.id, "it records the host's id");
    assert.equal(Home.load(home.dataDir).keyForFolder(leased), leasedLocal);
    assert.ok(entry(await home.client.expectOk("space.get", {}), "acme").repositories.some((repository) => repository.key === leasedLocal), "listed under its group at the instance");

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
  const rowsOf = (state: GroupsState): string[] => state.groups.flatMap((group) => group.repositories).filter((repository) => repository.id === listedOwn.id || repository.key === hostKey(host, HOST_OWN)).map((repository) => repository.key);
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
    const state = await home.client.waitSpace(mark, (candidate) => candidate.readAt !== null && candidate.read.phase === "idle", 30_000);
    const own = repositoryOf(state, OWN_KEY);
    assert.deepEqual([own.id, own.state], [null, "local-only"]);
    assert.deepEqual(rowsOf(state), [], "no row not on this device");
    await home.client.expectError("space.join", { hostId: listedOwn.id, folder: join(scratch, "own-elsewhere") }, "invalid_request", /on this device already/);
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
  assert.deepEqual(rowsOf(await home.client.expectOk("space.get", {})), [HOST_OWN]);
  await home.client.expectError("space.join", { hostId: listedOwn.id }, "invalid_request", /on this device already/);
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
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", groupId: "2002", name: "plans" } });
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
  await home.client.expectError("space.signin.start", {}, "busy");
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

test("space-83, space-4, space-59, storage-2: a sign-in at the first, then one naming the second's origin, lists both in that order with their accounts; your own group's folder bears the first's login and its own repository is created in the first's namespace alone, its remote named by the first's folder; the second's sign-in creates and renames nothing", async (t) => {
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

  const signed = await signIn(home, second);
  assert.deepEqual(signed.instances.map((instance) => [instance.origin, instance.account.login, instance.signedIn]), [[first.url, LOGIN, true], [second.url, bob.login, true]]);
  const state = await home.client.expectOk("space.get", {});
  assert.equal(state.defaultInstance, first.url);
  assert.deepEqual(state.instances.map((instance) => instance.origin), [first.url, second.url]);
  assert.deepEqual([instanceOf(state, first.url)?.displayName, instanceOf(state, first.url)?.read, typeof instanceOf(state, first.url)?.readAt], [HOST_NAME, { phase: "idle" }, "number"]);
  // Your own group's folder bears the first's login, no later sign-in
  // renaming it; its own repository is the first's, in your namespace
  // there, its one remote named by the first's folder (space-4, space-59,
  // space-5).
  assert.equal(state.own.name, LOGIN);
  assert.equal(Home.load(home.dataDir).ownName, LOGIN);
  const own = state.own.repositories.find((repository) => repository.own);
  assert.deepEqual([own?.key, own?.instance, own?.state], [HOST_OWN, first.url, "reachable"]);
  assert.deepEqual(git(clonePath(home.dataDir, HOST_OWN), "remote").split("\n"), [hostFolder(first)]);
  assert.deepEqual(first.script.creations.map((body) => (body as { name?: unknown }).name), [`${LOGIN}-spex`]);
  assert.deepEqual(second.script.creations, [], "nothing is created at the second");
  assert.equal(existsSync(join(home.dataDir, "workspace", bob.login)), false, "no folder bears the second's login");
  assert.deepEqual(readdirSync(join(home.dataDir, "workspace")).sort(), [LOGIN], "nothing moved under an instance's folder");
});
