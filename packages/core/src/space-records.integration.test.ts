// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A group's own spex repository found on the host by the records it
// holds, never by its name (space-65, space-69, DR-110): your own
// group's after a namespace rename, one with no `spex` branch yet, the
// choice among several, a renamed group's first session, the row's
// "Group records", a creation left waiting, and one lookup or pick of a
// clone at a time — against the stand-in Git host (git-host-12),
// hermetic, on loopback alone, in a file budget of its own (space-37).

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parse as parseYaml } from "yaml";
import { clonePath, createSpaceHarness, prefsOf, repositoryOf } from "./testing/space-harness.js";
import type { StandinHost } from "./testing/standin-host.js";
import type { GroupsState, RepositoryState } from "./protocol.js";

const fixture = createSpaceHarness();
const { git, gitFolder, addFolder, startHome, startHost, signIn } = fixture;
test.after(() => fixture.dispose());

/** A group's own records on the host: a `spex` branch holding no
 * `project.json` (DR-110). */
const GROUP_RECORDS = { "notes.md": "# Records of the group\n" };

/** `home.yaml` as written (storage-2). */
function homeFile(dataDir: string): { own: string; folders: { path: string; repository: string }[] } {
  return parseYaml(readFileSync(join(dataDir, "home.yaml"), "utf8")) as { own: string; folders: { path: string; repository: string }[] };
}

/** The stand-in's bare repository holding a key's records. */
function bareOf(host: StandinHost, key: string): string {
  const parts = key.split("/");
  return join(host.dir, ...parts.slice(0, -1), `${parts[parts.length - 1]}.git`);
}

/** The stand-in renames the person's namespace: the login, the person's
 * own group, and every repository in it, which keep their names. */
function respellPerson(host: StandinHost, login: string): void {
  host.script.person.login = login;
  host.script.groups[0].fullPath = login;
  host.script.groups[0].name = login;
  for (const repository of host.script.repositories) {
    if (repository.group === host.script.groups[0]) host.script.rename(repository.id, { group: login });
  }
}

/** Every repository the stand-in holds, as `<group>/<path>`. */
function hostKeys(host: StandinHost): string[] {
  return host.script.repositories.map((repository) => `${repository.group.fullPath}/${repository.path}`).sort();
}

/** The creations asked of the stand-in. */
function creations(host: StandinHost): number {
  return host.script.requests.filter((request) => request.method === "POST" && request.path === "/api/v1/host/repositories").length;
}

/** The rows of one group, in the state's order. */
function rowsOf(state: GroupsState, fullPath: string): RepositoryState[] {
  const group = state.groups.find((entry) => entry.fullPath === fullPath);
  assert.ok(group, `no group ${fullPath} in ${JSON.stringify(state.groups.map((entry) => entry.fullPath))}`);
  return group.repositories;
}

/** A Refresh whose read lands after `since`: one asked while the
 * set-up a start began still runs past its read joins that set-up, so
 * it is asked again (space-2). */
async function refreshAfter(home: Awaited<ReturnType<typeof startHome>>, since: number): Promise<GroupsState> {
  for (let attempt = 0; ; attempt += 1) {
    const from = home.client.mark();
    assert.deepEqual(await home.client.expectOk("space.refresh", {}), { accepted: true });
    try { return await home.client.waitSpace(from, (state) => (state.readAt ?? 0) > since, 2_000); }
    catch (error) { if (attempt >= 4) throw error; }
  }
}

/** Until `check` holds, polled. */
async function until(check: () => boolean, what: string, ms = 10_000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`timeout waiting for ${what}`);
    await delay(20);
  }
}

/** Your own group's clone row: the one row of your own group that is
 * your own. */
function ownRow(state: GroupsState): RepositoryState {
  const rows = state.groups[0].repositories.filter((row) => row.own);
  assert.equal(rows.length, 1, JSON.stringify(state.groups[0].repositories.map((row) => [row.key, row.state])));
  return rows[0];
}

test("space-37: a sign-in after a namespace rename joins the group's own repository under its former name, nothing created", async (t) => {
  const host = await startHost();
  const listed = host.script.addRepository({ group: "ada", name: "ada-spex", records: GROUP_RECORDS });
  respellPerson(host, "ada2");
  const home = await startHome("records-renamed", { host, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const { key: local } = await addFolder(home, home.projectDir);
  const project = local.split("/")[1];
  const from = home.client.mark();
  const signed = await signIn(home, host);
  assert.equal(signed.account?.login, "ada2");
  // Joined as your own group's: the clone takes the host's key on that
  // sync, a move within your own group (space-65, space-60).
  const own = await home.client.waitRepository(from, "ada2/ada-spex", (repository) => repository.sync.phase === "done");
  assert.ok(own.sync.phase === "done" && own.sync.pushed, JSON.stringify(own.sync));
  assert.deepEqual([own.state, own.own, own.id, own.records, own.choice], ["reachable", true, listed.id, "group", null]);
  // Nothing created at the stand-in (space-65).
  assert.deepEqual(hostKeys(host), ["ada2/ada-spex"]);
  assert.equal(creations(host), 0);
  // The clone lies at the host's key, holding both histories, and
  // `home.yaml` records that key with every pair rewritten (storage-2).
  const clone = clonePath(home.dataDir, "ada2/ada-spex");
  assert.ok(existsSync(join(clone, "notes.md")), "the host's records are joined");
  assert.ok(!existsSync(clonePath(home.dataDir, "ada2/ada2-spex")), "no clone is left under the login's name");
  assert.equal(git(bareOf(host, "ada2/ada-spex"), "rev-parse", "spex"), git(clone, "rev-parse", "spex"));
  const file = homeFile(home.dataDir);
  assert.equal(file.own, "ada2/ada-spex");
  assert.deepEqual(file.folders.map((entry) => [entry.path, entry.repository]), [[home.projectDir, `ada2/${project}`]]);
  assert.equal(ownRow(await home.client.expectOk("space.get", {})).key, "ada2/ada-spex");
  // A restarted core lists the same project.
  await home.stop();
  const again = await startHome("records-renamed-again", { dataDir: home.dataDir, project: false });
  t.after(() => again.stop());
  assert.deepEqual((await again.client.expectOk("project.list", {})).map((entry) => [entry.id, entry.path]), [[`ada2/${project}`, home.projectDir]]);
});

test("space-37: a sign-in joins your own group's repository created with no spex branch yet, reporting no taken name", async (t) => {
  const host = await startHost();
  const listed = host.script.addRepository({ group: "ada", name: "ada-spex" });
  const home = await startHome("records-unbranched", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const from = home.client.mark();
  await signIn(home, host);
  const own = await home.client.waitRepository(from, "ada/ada-spex", (repository) => repository.sync.phase === "done");
  assert.ok(own.sync.phase === "done" && own.sync.pushed, JSON.stringify(own.sync));
  assert.deepEqual([own.state, own.own, own.id, own.records, own.waiting, own.reason], ["reachable", true, listed.id, "group", null, null]);
  assert.deepEqual(hostKeys(host), ["ada/ada-spex"]);
  assert.equal(creations(host), 0, "no creation was asked, so no name was taken");
  assert.equal(git(bareOf(host, "ada/ada-spex"), "rev-parse", "spex"), git(clonePath(home.dataDir, "ada/ada-spex"), "rev-parse", "spex"));
});

test("space-37: two group's own repositories leave your own group's clone local only with the choice, set aside or picked", async (t) => {
  const host = await startHost();
  const bob = { id: "1002", login: "bob", displayName: "Bob", role: "Developer" };
  const ada = host.script.addRepository({ group: "ada", name: "ada-spex", records: GROUP_RECORDS });
  const notes = host.script.addRepository({ group: "ada", name: "notes-spex", records: GROUP_RECORDS, members: [bob] });
  const branches = [git(ada.bare, "rev-parse", "spex"), git(notes.bare, "rev-parse", "spex")];
  const home = await startHome("records-two", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const signed = await signIn(home, host);
  // Nothing created or joined; the choice stands on your own group's
  // local-only row as one issue, both candidates listed not on this
  // device (space-65, space-69).
  const repair = `choice:ada/ada-spex:${[ada.id, notes.id].sort().join(",")}`;
  const own = ownRow(signed);
  assert.deepEqual([own.key, own.state, own.remote, own.records], ["ada/ada-spex", "local-only", null, "group"]);
  assert.deepEqual(own.choice, {
    repair,
    candidates: [
      { hostId: ada.id, name: "ada-spex", members: 1, visibility: "private" },
      { hostId: notes.id, name: "notes-spex", members: 2, visibility: "private" },
    ],
    declined: false,
  });
  assert.equal(signed.issues, 1);
  assert.deepEqual(rowsOf(signed, "ada").filter((row) => row.state === "absent").map((row) => [row.name, row.id, row.records]),
    [["ada-spex", ada.id, "group"], ["notes-spex", notes.id, "group"]]);
  assert.equal(creations(host), 0);
  assert.deepEqual(hostKeys(host), ["ada/ada-spex", "ada/notes-spex"]);
  assert.deepEqual([git(ada.bare, "rev-parse", "spex"), git(notes.bare, "rev-parse", "spex")], branches, "nothing pushed");
  // Not now: the choice stands quietly, its controls kept, and counts no
  // more — across a Refresh too, the candidates unchanged (space-69,
  // space-49).
  const declined = await home.client.expectOk("space.repair.decline", { repair, declined: true });
  assert.equal(declined.issues, 0);
  assert.equal(ownRow(declined).choice?.declined, true);
  assert.equal(ownRow(declined).choice?.candidates.length, 2);
  assert.equal(typeof (prefsOf(home.dataDir)[`space:repair:${repair}`] as { declined?: unknown } | undefined)?.declined, "number");
  const before = declined.readAt ?? 0;
  const fromRefresh = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.refresh", {}), { accepted: true });
  const refreshed = await home.client.waitSpace(fromRefresh, (state) => (state.readAt ?? 0) > before);
  assert.deepEqual([refreshed.issues, ownRow(refreshed).state, ownRow(refreshed).choice?.repair, ownRow(refreshed).choice?.declined], [0, "local-only", repair, true]);
  const answered = await home.client.expectOk("space.repair.decline", { repair, declined: false });
  assert.deepEqual([answered.issues, ownRow(answered).choice?.declined], [1, false]);
  // The candidate bearing the clone's key is told apart by its state and
  // id, and its Join is refused for Use (space-30, space-69).
  assert.deepEqual(rowsOf(answered, "ada").filter((row) => row.key === "ada/ada-spex").map((row) => [row.state, row.id]), [["local-only", null], ["absent", ada.id]]);
  await home.client.expectError("space.join", { hostId: ada.id }, "invalid_request", /^Use ada-spex where this device asks which holds the records$/);
  assert.deepEqual([ownRow(await home.client.expectOk("space.get", {})).state, creations(host)], ["local-only", 0]);
  // Use is the pick of that repository, honouring the notice: it joins
  // the clone with it, the clone taking its key, the other staying
  // listed not on this device and the issue gone (space-69, space-57,
  // space-60).
  const unseen = await home.client.command("space.pick", { repository: "ada/ada-spex", choice: { kind: "join", hostId: notes.id } });
  assert.ok(!unseen.ok, "the pick waits for the notice");
  assert.equal(unseen.error.code, "invalid_request");
  assert.deepEqual(unseen.error.details, { notice: true, members: 2, visibility: "private" });
  const fromPick = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.pick", { repository: "ada/ada-spex", choice: { kind: "join", hostId: notes.id }, noticed: true }), { accepted: true });
  const joined = await home.client.waitRepository(fromPick, "ada/notes-spex", (repository) => repository.sync.phase === "done");
  assert.ok(joined.sync.phase === "done" && joined.sync.pushed, JSON.stringify(joined.sync));
  assert.deepEqual([joined.state, joined.own, joined.id, joined.choice], ["reachable", true, notes.id, null]);
  const after = await home.client.expectOk("space.get", {});
  assert.equal(after.issues, 0);
  assert.equal(ownRow(after).key, "ada/notes-spex");
  const left = repositoryOf(after, "ada/ada-spex");
  assert.deepEqual([left.state, left.id, left.own, left.records], ["absent", ada.id, false, "group"]);
  assert.equal(homeFile(home.dataDir).own, "ada/notes-spex");
  assert.ok(existsSync(join(clonePath(home.dataDir, "ada/notes-spex"), "notes.md")));
  assert.ok(!existsSync(clonePath(home.dataDir, "ada/ada-spex")), "the clone left its former folder");
  assert.equal(git(notes.bare, "rev-parse", "spex"), git(clonePath(home.dataDir, "ada/notes-spex"), "rev-parse", "spex"));
  assert.equal(git(ada.bare, "rev-parse", "spex"), branches[0], "the other candidate is left be");
  assert.equal(creations(host), 0);
  assert.equal(prefsOf(home.dataDir)[`space:repair:${repair}`], undefined);
});

test("space-37: of two group's own repositories, the one left after the other is deleted on the host is joined at the next Refresh", async (t) => {
  const host = await startHost();
  const ada = host.script.addRepository({ group: "ada", name: "ada-spex", records: GROUP_RECORDS });
  const notes = host.script.addRepository({ group: "ada", name: "notes-spex", records: GROUP_RECORDS });
  const home = await startHome("records-deleted", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const signed = await signIn(home, host);
  const repair = ownRow(signed).choice?.repair ?? "";
  assert.equal(repair, `choice:ada/ada-spex:${[ada.id, notes.id].sort().join(",")}`);
  // Set aside, the clone stays local only and counts no more (space-69).
  const declined = await home.client.expectOk("space.repair.decline", { repair, declined: true });
  assert.deepEqual([declined.issues, ownRow(declined).state], [0, "local-only"]);
  // The candidates change while several remain: another choice stands,
  // not declined and counting afresh, the earlier answer discarded
  // (space-69, space-54).
  const plans = host.script.addRepository({ group: "ada", name: "plans-spex", records: GROUP_RECORDS });
  host.script.remove(notes.id);
  const replaced = `choice:ada/ada-spex:${[ada.id, plans.id].sort().join(",")}`;
  const fromChange = home.client.mark();
  await refreshAfter(home, declined.readAt ?? 0);
  const changed = await home.client.waitSpace(fromChange, (state) => state.groups[0].repositories.find((row) => row.own)?.choice?.repair === replaced);
  assert.deepEqual([changed.issues, ownRow(changed).state, ownRow(changed).choice?.declined], [1, "local-only", false]);
  assert.deepEqual(ownRow(changed).choice?.candidates.map((entry) => entry.name), ["ada-spex", "plans-spex"]);
  assert.equal(prefsOf(home.dataDir)[`space:repair:${repair}`], undefined, "the earlier answer is discarded");
  // The choice lapses when the candidates the host lists change: one
  // left is joined at the next read (space-69, space-65).
  host.script.remove(plans.id);
  const from = home.client.mark();
  await refreshAfter(home, changed.readAt ?? 0);
  const own = await home.client.waitRepository(from, "ada/ada-spex", (repository) => repository.sync.phase === "done");
  assert.ok(own.sync.phase === "done" && own.sync.pushed, JSON.stringify(own.sync));
  assert.deepEqual([own.state, own.own, own.id, own.choice], ["reachable", true, ada.id, null]);
  const after = await home.client.expectOk("space.get", {});
  assert.equal(after.issues, 0);
  assert.deepEqual(rowsOf(after, "ada").map((row) => row.key), ["ada/ada-spex"]);
  assert.ok(existsSync(join(clonePath(home.dataDir, "ada/ada-spex"), "notes.md")));
  assert.equal(git(ada.bare, "rev-parse", "spex"), git(clonePath(home.dataDir, "ada/ada-spex"), "rev-parse", "spex"));
  assert.equal(creations(host), 0);
  assert.equal(prefsOf(home.dataDir)[`space:repair:${repair}`], undefined, "the lapsed answer is discarded");
});

test("space-37: a sync's Check reading the host after it deletes one of two candidates joins the one left, with no Refresh", async (t) => {
  const host = await startHost();
  const ada = host.script.addRepository({ group: "ada", name: "ada-spex", records: GROUP_RECORDS });
  const notes = host.script.addRepository({ group: "ada", name: "notes-spex", records: GROUP_RECORDS });
  const home = await startHome("records-check", { host, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const { key: local } = await addFolder(home, home.projectDir);
  const signed = await signIn(home, host);
  assert.equal(ownRow(signed).choice?.candidates.length, 2);
  // A project of your own group on the host, whose sync reads it.
  const project = `ada/${local.split("/")[1]}`;
  const fromPick = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.pick", { repository: project, choice: { kind: "create", groupId: null, name: local.split("/")[1] } }), { accepted: true });
  await home.client.waitRepository(fromPick, project, (repository) => repository.sync.phase === "done");
  assert.equal(ownRow(await home.client.expectOk("space.get", {})).choice?.candidates.length, 2);
  // The choice lapses at the next read, a Check's too: the one left is
  // joined (space-69, space-65).
  host.script.remove(notes.id);
  const from = home.client.mark();
  assert.equal((await home.client.settle("space.fetch", { repository: project })).sync.phase, "idle");
  const own = await home.client.waitRepository(from, "ada/ada-spex", (repository) => repository.sync.phase === "done");
  assert.ok(own.sync.phase === "done" && own.sync.pushed, JSON.stringify(own.sync));
  assert.deepEqual([own.state, own.own, own.id, own.choice], ["reachable", true, ada.id, null]);
  const after = await home.client.expectOk("space.get", {});
  assert.equal(after.issues, 0);
  assert.equal(git(ada.bare, "rev-parse", "spex"), git(clonePath(home.dataDir, "ada/ada-spex"), "rev-parse", "spex"));
});

test("space-37: another group's choice stands at its first session, keeps its Not now across a restart, and lapses to the one left at the next Refresh", async (t) => {
  const host = await startHost();
  const old = host.script.addRepository({ group: "acme", name: "old-spex", records: GROUP_RECORDS });
  const other = host.script.addRepository({ group: "acme", name: "other-spex", records: GROUP_RECORDS });
  const first = await startHome("records-other", { host, project: false, extra: { signIn: "browser" } });
  const fromSignIn = first.client.mark();
  await signIn(first, host);
  await first.client.waitRepository(fromSignIn, "ada/ada-spex", (repository) => repository.sync.phase === "done");
  await first.stop();
  // A group's own clone on this device under the group's name, on no
  // host yet.
  const key = "acme/acme-spex";
  const clone = clonePath(first.dataDir, key);
  mkdirSync(clone, { recursive: true });
  git(clone, "init", "-q", "-b", "spex");
  git(clone, "-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", "Start");
  const home = await startHome("records-other-again", { dataDir: first.dataDir, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const folder = gitFolder("acme-other");
  await home.client.expectOk("project.rebind", { projectId: key, path: folder });
  const asked = creations(host);
  const from = home.client.mark();
  assert.equal((await home.client.expectOk("project.register", { path: folder })).id, key);
  // Its first session finds two: nothing created or joined, the choice
  // standing on the group's local-only row as one issue (space-65,
  // space-69).
  const repair = `choice:${key}:${[old.id, other.id].sort().join(",")}`;
  const stood = await home.client.waitRepository(from, key, (repository) => repository.choice !== null);
  assert.deepEqual([stood.state, stood.records, stood.folder, stood.choice], ["local-only", "group", folder, {
    repair,
    candidates: [
      { hostId: old.id, name: "old-spex", members: 1, visibility: "private" },
      { hostId: other.id, name: "other-spex", members: 1, visibility: "private" },
    ],
    declined: false,
  }]);
  const state = await home.client.expectOk("space.get", {});
  assert.equal(state.issues, 1);
  assert.deepEqual(rowsOf(state, "acme").map((row) => [row.key, row.state]), [[key, "local-only"], ["acme/old-spex", "absent"], ["acme/other-spex", "absent"]]);
  assert.equal(creations(host), asked);
  // Not now holds across a restart: the read that start owes stands the
  // choice again with the same candidates, the answer kept (space-69,
  // space-54).
  const declined = await home.client.expectOk("space.repair.decline", { repair, declined: true });
  assert.deepEqual([declined.issues, repositoryOf(declined, key).choice?.declined], [0, true]);
  await home.stop();
  const again = await startHome("records-other-restart", { dataDir: first.dataDir, project: false, extra: { signIn: "browser" } });
  t.after(() => again.stop());
  const fromRead = again.client.mark();
  await again.client.expectOk("space.get", {});
  const read = await again.client.waitSpace(fromRead, (candidate) => candidate.readAt !== null && repositoryOf(candidate, key).choice !== null);
  assert.deepEqual([read.issues, repositoryOf(read, key).state, repositoryOf(read, key).choice?.repair, repositoryOf(read, key).choice?.declined], [0, "local-only", repair, true]);
  assert.equal(typeof (prefsOf(first.dataDir)[`space:repair:${repair}`] as { declined?: unknown } | undefined)?.declined, "number");
  // The candidates change: the one left is joined at the next Refresh,
  // the lapsed answer discarded (space-69, space-65).
  host.script.remove(other.id);
  const since = Date.now();
  const fromRefresh = again.client.mark();
  await refreshAfter(again, since);
  const joined = await again.client.waitRepository(fromRefresh, "acme/old-spex", (repository) => repository.sync.phase === "done");
  assert.ok(joined.sync.phase === "done" && joined.sync.pushed, JSON.stringify(joined.sync));
  assert.deepEqual([joined.state, joined.id, joined.records, joined.folder, joined.choice], ["reachable", old.id, "group", folder, null]);
  assert.equal((await again.client.expectOk("space.get", {})).issues, 0);
  assert.equal(creations(host), asked);
  assert.ok(!existsSync(clone), "the clone left the group's name");
  assert.equal(git(old.bare, "rev-parse", "spex"), git(clonePath(first.dataDir, "acme/old-spex"), "rev-parse", "spex"));
  assert.equal(prefsOf(first.dataDir)[`space:repair:${repair}`], undefined, "the lapsed answer is discarded");
});

test("space-37: a renamed group's first session joins the group's own repository under its former name instead of creating <group>-spex", async (t) => {
  const host = await startHost();
  const old = host.script.addRepository({ group: "acme", name: "old-spex", records: GROUP_RECORDS });
  const first = await startHome("records-group", { host, project: false, extra: { signIn: "browser" } });
  const fromSignIn = first.client.mark();
  await signIn(first, host);
  await first.client.waitRepository(fromSignIn, "ada/ada-spex", (repository) => repository.sync.phase === "done");
  await first.stop();
  // A group's own clone on this device under the group's name, on no
  // host yet.
  const key = "acme/acme-spex";
  const clone = clonePath(first.dataDir, key);
  mkdirSync(clone, { recursive: true });
  git(clone, "init", "-q", "-b", "spex");
  git(clone, "-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", "Start");
  const home = await startHome("records-group-again", { dataDir: first.dataDir, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const folder = gitFolder("acme-work");
  await home.client.expectOk("project.rebind", { projectId: key, path: folder });
  const asked = creations(host);
  const from = home.client.mark();
  assert.equal((await home.client.expectOk("project.register", { path: folder })).id, key);
  // Joined at the first session, the clone lying at the host's key after
  // that sync, nothing created (space-65, space-60).
  const joined = await home.client.waitRepository(from, "acme/old-spex", (repository) => repository.sync.phase === "done");
  assert.ok(joined.sync.phase === "done" && joined.sync.pushed, JSON.stringify(joined.sync));
  assert.deepEqual([joined.state, joined.id, joined.records, joined.folder], ["reachable", old.id, "group", folder]);
  assert.equal(creations(host), asked);
  assert.ok(!hostKeys(host).includes("acme/acme-spex"), "no acme-spex is created");
  assert.ok(existsSync(join(clonePath(home.dataDir, "acme/old-spex"), "notes.md")));
  assert.ok(!existsSync(clone), "the clone left the group's name");
  assert.equal(git(old.bare, "rev-parse", "spex"), git(clonePath(home.dataDir, "acme/old-spex"), "rev-parse", "spex"));
  assert.deepEqual(homeFile(home.dataDir).folders.find((entry) => entry.path === folder)?.repository, "acme/old-spex");
  // Asked again at a later session, a repository on the host is left be.
  assert.equal(await home.service.ensureGroupRepository("acme/old-spex"), "unchanged");
});

test("space-37: a group's own repository listed under another name reads as the group's records, first in its group", async (t) => {
  const host = await startHost();
  const old = host.script.addRepository({ group: "acme", name: "old-spex", records: GROUP_RECORDS });
  const aaa = host.script.addRepository({ group: "acme", name: "aaa-spex", project: { format: 1, name: "aaa", remote: null } });
  const home = await startHome("records-rows", { host, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const { key: local } = await addFolder(home, home.projectDir);
  const from = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(from, "ada/ada-spex", (repository) => repository.sync.phase === "done");
  const state = await home.client.expectOk("space.get", {});
  // The group's own first by what its `spex` branch holds, not by its
  // name (space-1, space-65).
  assert.deepEqual(rowsOf(state, "acme").map((row) => [row.name, row.id, row.state, row.records]), [
    ["old-spex", old.id, "absent", "group"],
    ["aaa-spex", aaa.id, "absent", "project"],
  ]);
  // A clone reads by its own records: your own group's holds no
  // `project.json`, a project's does.
  const moved = `ada/${local.split("/")[1]}`;
  assert.deepEqual(rowsOf(state, "ada").map((row) => [row.key, row.records]), [["ada/ada-spex", "group"], [moved, "project"]]);
  // A group's local-only clone whose choice stands lists first in its
  // group, before the candidates it asks about, whatever their names
  // (space-69).
  host.script.groups.push({ id: "2009", fullPath: "zed", name: "Zed", kind: "group" });
  host.script.addRepository({ group: "zed", name: "a-spex", records: GROUP_RECORDS });
  host.script.addRepository({ group: "zed", name: "b-spex", records: GROUP_RECORDS });
  await home.stop();
  const key = "zed/zed-spex";
  const clone = clonePath(home.dataDir, key);
  mkdirSync(clone, { recursive: true });
  git(clone, "init", "-q", "-b", "spex");
  git(clone, "-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", "Start");
  const again = await startHome("records-rows-again", { dataDir: home.dataDir, project: false, extra: { signIn: "browser" } });
  t.after(() => again.stop());
  const folder = gitFolder("zed-work");
  await again.client.expectOk("project.rebind", { projectId: key, path: folder });
  const fromChoice = again.client.mark();
  assert.equal((await again.client.expectOk("project.register", { path: folder })).id, key);
  await again.client.waitRepository(fromChoice, key, (repository) => repository.choice !== null);
  assert.deepEqual(rowsOf(await again.client.expectOk("space.get", {}), "zed").map((row) => [row.key, row.state, row.records]), [
    [key, "local-only", "group"],
    ["zed/a-spex", "absent", "group"],
    ["zed/b-spex", "absent", "group"],
  ]);
});

test("space-37: a creation of your own group's left waiting joins the group's own repository the host lists meanwhile under another name, nothing created", async (t) => {
  const host = await startHost();
  const words = "You need the Maintainer role in ada to create projects.";
  host.script.refuseCreate(words);
  const home = await startHome("records-waiting", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const signed = await signIn(home, host);
  // The creation is left waiting, the clone local only (space-64).
  assert.deepEqual([ownRow(signed).state, ownRow(signed).waiting], ["local-only", { step: "create", group: "ada", message: words }]);
  const asked = creations(host);
  // The host grants creations and lists the group's own under another
  // name: the next read joins it, the clone taking its key on that sync
  // and nothing created (space-64, space-65, space-60).
  host.script.refuseCreate(null);
  const notes = host.script.addRepository({ group: "ada", name: "notes-spex", records: GROUP_RECORDS });
  const from = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.refresh", {}), { accepted: true });
  const own = await home.client.waitRepository(from, "ada/notes-spex", (repository) => repository.sync.phase === "done");
  assert.ok(own.sync.phase === "done" && own.sync.pushed, JSON.stringify(own.sync));
  assert.deepEqual([own.state, own.own, own.id, own.waiting, own.choice], ["reachable", true, notes.id, null, null]);
  assert.deepEqual([hostKeys(host), creations(host)], [["ada/notes-spex"], asked]);
  assert.equal(homeFile(home.dataDir).own, "ada/notes-spex");
  assert.ok(!existsSync(clonePath(home.dataDir, "ada/ada-spex")), "the clone left its former folder");
  assert.equal(git(notes.bare, "rev-parse", "spex"), git(clonePath(home.dataDir, "ada/notes-spex"), "rev-parse", "spex"));
});

test("space-37: a lookup and a pick of one clone run one at a time: a pick during the set-up's lookup is refused busy, a lookup during a pick acts on nothing", async (t) => {
  const host = await startHost();
  host.script.sleepCreate(1_500);
  const first = await startHome("records-serial", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => first.stop());
  // The set-up's lookup for your own group's clone asks the creation of
  // `ada-spex`, which the stand-in holds: a pick of that clone meanwhile
  // is refused busy (space-29, space-58), one creation reaching the
  // stand-in (space-65).
  const fromSignIn = first.client.mark();
  const signing = signIn(first, host);
  await until(() => creations(host) === 1, "the set-up's creation");
  await first.client.expectError("space.pick", { repository: "ada/ada-spex", choice: { kind: "create", groupId: null, name: "ada" } }, "busy", /^Already syncing$/);
  await signing;
  const own = await first.client.waitRepository(fromSignIn, "ada/ada-spex", (repository) => repository.sync.phase === "done");
  assert.ok(own.sync.phase === "done" && own.sync.pushed, JSON.stringify(own.sync));
  assert.deepEqual([hostKeys(host), creations(host)], [["ada/ada-spex"], 1]);
  await first.stop();
  // A group's local-only clone, a pick creating its group's spex
  // repository held at the stand-in: the group's lookup at a session's
  // start meanwhile acts on nothing (space-65).
  const key = "acme/acme-spex";
  const clone = clonePath(first.dataDir, key);
  mkdirSync(clone, { recursive: true });
  git(clone, "init", "-q", "-b", "spex");
  git(clone, "-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", "Start");
  const home = await startHome("records-serial-again", { dataDir: first.dataDir, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const fromPick = home.client.mark();
  const picked = home.client.expectOk("space.pick", { repository: key, choice: { kind: "create", groupId: "2002", name: "acme" }, noticed: true });
  await until(() => creations(host) === 2, "the pick's creation");
  assert.equal(await home.service.ensureGroupRepository(key), "local");
  assert.deepEqual(await picked, { accepted: true });
  const created = await home.client.waitRepository(fromPick, key, (repository) => repository.sync.phase === "done");
  assert.ok(created.sync.phase === "done" && created.sync.pushed, JSON.stringify(created.sync));
  assert.deepEqual([created.state, created.waiting, created.choice], ["reachable", null, null]);
  assert.deepEqual([hostKeys(host), creations(host)], [["acme/acme-spex", "ada/ada-spex"], 2]);
});
