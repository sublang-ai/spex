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
// instances migration deferred, moves under it at its next sync; and
// Git's lines carry no URL under the Git origin, a status no rule reads
// standing as the host's error.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createSessionStore } from "@sublang/playbook/session-store";
import { stringify as stringifyYaml } from "yaml";
import { Home } from "./home.js";
import { needsInstancesMigration } from "./migrate-instances.js";
import { clonePath, createSpaceHarness, hostFolder, hostKey, OWN_KEY, ownClone, prefsOf, repositoryOf, stringsOf } from "./testing/space-harness.js";
import { STANDIN_STORAGE, type StandinHost } from "./testing/standin-host.js";
import type { GroupsState, ServerMessage } from "./protocol.js";

const fixture = createSpaceHarness();
const { scratch, git, gitFolder, bareRepo, addFolder, startHome, startHost, signIn, runTurn } = fixture;
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

test("space-86: an explicit content-size rejection keeps access and Save, names only the instance and limit, and retries only on an explicit Sync", async (t) => {
  const host = await startHost();
  const home = await startHome("size-limit", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  let mark = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(mark, HOST_OWN, (row) => row.sync.phase === "done", 30_000);
  const { key: local } = await addFolder(home, gitFolder("size-limit"));
  mark = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", groupId: "2002", name: "size-limit" } });
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
