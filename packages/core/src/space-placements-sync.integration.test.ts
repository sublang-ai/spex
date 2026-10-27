// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A spex repository placed at two instances, read and checked placement
// by placement (DR-128): real cores on scratch homes against two
// stand-in Git hosts on separate Git backends, the second placement made
// by hand as a device holding it would have made it. Check host fetches
// each placement's `spex` in the order added and lists each one's
// incoming units and conflicts on its own line, the units local against
// either on the row (space-8, space-7); a placement whose check stops
// stops alone (space-15); and each line reads its own instance's answer,
// the row reachable where any placement is (space-61). A Sync saves once
// and runs each placement's turn in the order added, each Apply against
// the previous placement's merge, then catches the earlier placements
// up; a placement's stop stands on its line while the next runs, and
// Stop, an Apply's refusal and Git's own error end the sync (space-12,
// space-15, space-19, space-31); a placement owing its sharing notice,
// or whose first-notice read fails, stops alone while the others sync
// (space-57, git-host-22) — hermetic, on loopback alone, in a file
// budget of its own.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalOrigin } from "./instance.js";
import { GitError, SpaceGit } from "./space-git.js";
import type { GroupsState, RepositoryState, SpaceConflict, SpaceUnit } from "./protocol.js";
import type { SpaceStepEvent } from "./space.js";
import { holdingFetch } from "./testing/holding-fetch.js";
import type { StandinGroup, StandinHost } from "./testing/standin-host.js";
import { bareOf, clonePath, createSpaceHarness, hostFolder, hostKey, instanceOf, placementOf, repositoryOf, syncRecordsOf, remoteNamesOf } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
const { scratch, git, gitFolder, addFolder, bareRepo, peerClone, peerPush, attachByHand, startHome, startHost, signIn, signOut, sleep } = fixture;
test.after(() => fixture.dispose());

/** The stand-in's person, and your own group's repository once signed in. */
const LOGIN = "ada";
const HOST_OWN = `${LOGIN}/${LOGIN}-spex`;
const HOST_NAME = "Stand-in Git host";
const SECOND_NAME = "Second stand-in";

/** A Refresh of every signed-in instance, landed. */
async function refreshed(home: Awaited<ReturnType<typeof startHome>>): Promise<GroupsState> {
  const before = await home.client.expectOk("space.get", {});
  const mark = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  return home.client.waitSpace(mark, (state) => state.instances.every((instance) => !instance.signedIn
    || (instance.read.phase === "idle" && (instance.readAt ?? 0) > (instanceOf(before, instance.origin)?.readAt ?? 0))), 30_000);
}

/** The unit names a list holds, in its order. */
const units = (list: SpaceUnit[]): string[] => list.map((unit) => unit.unit);
/** The unit names a list of conflicts holds, in its order. */
const choices = (list: SpaceConflict[]): string[] => list.map((conflict) => conflict.unit.unit);

/** A scratch home signed in to two stand-ins on separate Git backends —
 * the second as `bob` — holding a project's spex repository created in
 * the first's `acme` and placed by hand in the second's `acme`, or in a
 * group the second lists from then on. */
async function placedAtBoth(name: string, group?: StandinGroup) {
  const first = await startHost();
  const second = await startHost({ displayName: SECOND_NAME, person: { id: "1002", login: "bob", displayName: "Bob" } });
  const home = await startHome(name, { host: first, project: false });
  let mark = home.client.mark();
  await signIn(home, first);
  await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  await signIn(home, second);
  const { key: local } = await addFolder(home, gitFolder("atlas"));
  mark = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: first.url, groupId: "2002", name: "atlas" } });
  const key = hostKey(first, "acme/atlas-spex");
  await home.client.waitRepository(mark, key, (repository) => repository.sync.phase === "done", 30_000);
  const clone = clonePath(home.dataDir, key);
  if (group) second.script.groups.push(group);
  const at = group?.fullPath ?? "acme";
  const placed = attachByHand(home, key, second, at);
  return { first, second, home, key, clone, placed, firstBare: bareOf(first, key), secondBare: second.bareOf(`${at}/atlas-spex`) };
}

test("space-8, space-31, space-33, space-7, space-15, space-10, space-29: Check host fetches each placement's spex in the order added, each line listing its own incoming units and the conflicts this device made too, the row every unit local against some placement and every placement's conflicts; a placement whose check stops stops alone, its list kept, the next still checked; the check stops, with the first stop, only where every placement stopped; space.diff reads the side of the placement it names", async (t) => {
  const { first, second, home, key, clone, placed, firstBare, secondBare } = await placedAtBoth("check-each");
  t.after(() => home.stop());

  // A unit sent to the first alone, the second unreachable meanwhile:
  // the second lacks it.
  writeFileSync(join(clone, "sent.md"), "sent to the first\n");
  second.script.failTransport(503);
  const sent = await home.client.settle("space.sync", { repository: key }, 30_000);
  second.script.failTransport(null);
  assert.equal(sent.sync.phase, "done", JSON.stringify(sent.sync));
  assert.equal(placementOf(sent, second.url).outcome?.kind, "stopped", JSON.stringify(placementOf(sent, second.url).outcome));
  // A peer at each advances its `spex`, the second's with a unit this
  // device then changes too.
  const firstPeer = peerClone(firstBare);
  const secondPeer = peerClone(secondBare);
  await peerPush(firstPeer, (dir) => { writeFileSync(join(dir, "from-first.md"), "the first's\n"); });
  await peerPush(secondPeer, (dir) => {
    writeFileSync(join(dir, "from-second.md"), "the second's\n");
    writeFileSync(join(dir, "both.md"), "theirs\n");
  });
  writeFileSync(join(clone, "both.md"), "mine\n");

  // Each placement fetched, in the order added, each line listing its own
  // incoming units against its own common ancestor, the second's marking
  // the unit this device changed too as a choice (space-8).
  const checked = await home.client.settle("space.fetch", { repository: key }, 30_000);
  assert.equal(checked.sync.phase, "idle", JSON.stringify(checked.sync));
  assert.deepEqual(checked.placements.map((line) => [line.instance, line.path, line.id, line.attached]), [
    [first.url, "acme/atlas-spex", checked.id, true],
    [second.url, "acme/atlas-spex", placed.id, true],
  ]);
  const atFirst = placementOf(checked, first.url);
  const atSecond = placementOf(checked, second.url);
  assert.deepEqual([units(atFirst.incoming), choices(atFirst.conflicts)], [["from-first.md"], []]);
  assert.deepEqual([units(atSecond.incoming), choices(atSecond.conflicts)], [["from-second.md"], ["both.md"]]);
  assert.deepEqual([atSecond.conflicts[0].mine.change, atSecond.conflicts[0].remote.change], ["new", "new"]);
  for (const line of [atFirst, atSecond]) {
    assert.equal(typeof line.branch?.checkedAt, "number", JSON.stringify(line.branch));
    assert.deepEqual([line.branch?.behind, line.branch?.hostEmpty, line.branch?.unrelated], [1, false, false], JSON.stringify(line.branch));
  }
  assert.ok((atSecond.branch?.ahead ?? 0) >= 1, "the second lacks the sync sent to the first alone");
  // The row: each unit local against some placement — the one sent to
  // the first alone, and the second's placement file, which only the
  // first received, against the second; the one changed here against
  // the first — and every placement's conflicts in their order (space-7,
  // space-30).
  assert.deepEqual(units(checked.local), ["both.md", `placements/${placed.folder}.yaml`, "sent.md"]);
  assert.deepEqual(choices(checked.conflicts), ["both.md"]);
  assert.deepEqual([checked.state, checked.instance, checked.governing], ["reachable", first.url, first.url]);

  // The remote side of a unit is the named placement's, the first's where
  // none is named; a placement the clone does not hold is refused
  // (space-10, space-29).
  const theirs = await home.client.expectOk("space.diff", { repository: key, unit: "both.md", path: "both.md", side: "remote", placement: second.url });
  assert.match(theirs.patch, /^\+theirs$/m);
  const atTheFirst = await home.client.expectOk("space.diff", { repository: key, unit: "both.md", path: "both.md", side: "remote" });
  assert.equal(atTheFirst.patch, "", "the first holds no both.md");
  await home.client.expectError("space.diff", { repository: key, unit: "both.md", path: "both.md", side: "remote", placement: null }, "invalid_request", /^atlas-spex holds no such placement$/);
  await home.client.expectError("space.diff", { repository: key, unit: "both.md", path: "both.md", side: "remote", placement: "http://127.0.0.1:9" }, "invalid_request", /^atlas-spex holds no such placement$/);

  // The first's transport answering 503 stops its check alone: its list
  // stands as its last check left it, and the second is still checked,
  // the check ending idle (space-8, space-15).
  first.script.failTransport(503);
  t.after(() => first.script.failTransport(null));
  await peerPush(firstPeer, (dir) => { writeFileSync(join(dir, "unseen.md"), "not fetched\n"); });
  await peerPush(secondPeer, (dir) => { writeFileSync(join(dir, "later.md"), "the second's, later\n"); });
  const partly = await home.client.settle("space.fetch", { repository: key }, 30_000);
  assert.equal(partly.sync.phase, "idle", JSON.stringify(partly.sync));
  assert.deepEqual(units(placementOf(partly, first.url).incoming), ["from-first.md"], "the first's list kept");
  assert.deepEqual(units(placementOf(partly, second.url).incoming), ["from-second.md", "later.md"]);
  assert.equal(placementOf(partly, second.url).branch?.behind, 2);

  // Both stopping — the first unreachable, the second refusing in its
  // own words, which turn its line alone read-only — the check stops with
  // the first's stop; the row stays reachable through the first (space-15,
  // space-61).
  second.script.refuseTransport("Transfers are paused for the audit.");
  t.after(() => second.script.refuseTransport(null));
  const stopped = await home.client.settle("space.fetch", { repository: key }, 30_000);
  assert.ok(stopped.sync.phase === "stopped", JSON.stringify(stopped.sync));
  assert.deepEqual([stopped.sync.op, stopped.sync.step, stopped.sync.cause, stopped.sync.message], ["check", "check", "unreachable", `Could not reach ${HOST_NAME}`]);
  assert.deepEqual([placementOf(stopped, first.url).state, placementOf(stopped, second.url).state], ["reachable", "read-only"]);
  assert.equal(placementOf(stopped, second.url).reason, `${SECOND_NAME} refused: Transfers are paused for the audit.`);
  assert.deepEqual(units(placementOf(stopped, second.url).incoming), ["from-second.md", "later.md"], "the second's list kept");
  assert.deepEqual([stopped.state, stopped.reason], ["reachable", null]);

  // The second's next read is its answer again (git-host-5).
  first.script.failTransport(null);
  second.script.refuseTransport(null);
  const read = await refreshed(home);
  assert.equal(placementOf(repositoryOf(read, key), second.url).state, "reachable");
  assert.equal(git(clone, "config", "--get", `remote.${hostFolder(second)}.spexId`), placed.id);
});

test("space-61, space-87: with the first instance signed out, the first placement's line reads unreachable, Sign in again, while the second's reads reachable from the second's own read, with its path, unknown members' count and rights there, and the row reads reachable through it", async (t) => {
  const { first, second, home, key, placed } = await placedAtBoth("line-states");
  t.after(() => home.stop());
  const before = repositoryOf(await refreshed(home), key);
  assert.deepEqual(before.placements.map((line) => [line.instance, line.state]), [[first.url, "reachable"], [second.url, "reachable"]]);

  const out = await signOut(home, first);
  const row: RepositoryState = repositoryOf(out, key);
  const [atFirst, atSecond] = [placementOf(row, first.url), placementOf(row, second.url)];
  assert.deepEqual([atFirst.state, atFirst.reason], ["unreachable", "Sign in again"]);
  assert.deepEqual([atSecond.state, atSecond.reason, atSecond.path, atSecond.id, atSecond.can.manageMembers], ["reachable", null, "acme/atlas-spex", placed.id, true]);
  assert.equal(atSecond.members, null, "the full view leaves membership unknown");
  assert.deepEqual([row.state, row.reason, row.governing], ["reachable", null, null]);
  // The row stands where its key lies, under the first's heading
  // (space-1).
  assert.ok(instanceOf(out, first.url)?.groups.some((group) => group.repositories.some((repository) => repository.key === key)));
});

test("space-29, git-host-20, space-60, space-61: space.repository.move naming the second's instance moves the second placement's host repository there alone, its line reading its new path and its next Sync taking the URL the second hands over, the clone and the first's repository staying; naming the first's moves the first's; naming an instance at which the clone holds no placement is refused, and one the home does not list is not found", async (t) => {
  const { first, second, home, key, clone, placed } = await placedAtBoth("move-each");
  t.after(() => home.stop());
  await refreshed(home);
  const firstId = (await home.client.repository(key)).id as string;
  const firstUrl = git(clone, "config", "--get", `remote.${hostFolder(first)}.url`);

  // The second's placement moves at the second, into its acme/research;
  // the first's host repository and the clone stand (space-29,
  // git-host-20).
  const moved = await home.client.expectOk("space.repository.move", { repository: key, instance: second.url, groupId: "2003" });
  assert.deepEqual(moved, { repository: { id: placed.id, fullPath: "acme/research/atlas-spex" } });
  assert.equal(second.script.repositories.find((repository) => repository.id === placed.id)?.group.fullPath, "acme/research");
  assert.equal(first.script.repositories.find((repository) => repository.id === firstId)?.group.fullPath, "acme");
  const after = await home.client.repository(key);
  assert.deepEqual(after.placements.map((line) => [line.instance, line.path]), [[first.url, "acme/atlas-spex"], [second.url, "acme/research/atlas-spex"]]);
  assert.equal(after.key, key);

  // Its next Sync takes the URL the second hands over for it, the clone
  // moved nowhere, each placement synced (space-60).
  const synced = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(synced.sync.phase, "done", JSON.stringify(synced.sync));
  assert.deepEqual(synced.placements.map((line) => line.outcome?.kind), ["synced", "synced"]);
  assert.match(git(clone, "config", "--get", `remote.${hostFolder(second)}.url`), /\/acme\/research\/atlas-spex\.git$/);
  assert.equal(git(clone, "config", "--get", `remote.${hostFolder(first)}.url`), firstUrl);
  assert.equal(git(second.bareOf("acme/research/atlas-spex"), "rev-parse", "spex"), git(clone, "rev-parse", "HEAD"));

  // Naming the first's instance moves the first's placement there.
  const atFirst = await home.client.expectOk("space.repository.move", { repository: key, instance: first.url, groupId: "2003" });
  assert.deepEqual(atFirst, { repository: { id: firstId, fullPath: "acme/research/atlas-spex" } });
  assert.equal(first.script.repositories.find((repository) => repository.id === firstId)?.group.fullPath, "acme/research");

  // A clone holding only the path placement holds none at either
  // instance; an instance the home does not list is not found
  // (space-29).
  const { key: solo } = await addFolder(home, gitFolder("solo"));
  await home.client.expectOk("space.remote.set", { repository: solo, url: bareRepo() });
  for (const host of [first, second]) {
    await home.client.expectError("space.repository.move", { repository: solo, instance: host.url, groupId: "2003" }, "invalid_request", /^solo-spex holds no such placement$/);
  }
  await home.client.expectError("space.repository.move", { repository: key, instance: "http://127.0.0.1:9", groupId: "2003" }, "not_found");
  assert.equal(second.script.repositories.find((repository) => repository.id === placed.id)?.group.fullPath, "acme/research", "nothing more moved");
});

test("storage-34, space-5, space-29: a clone placed at the second holds one remote there — a second remote at the second's Git origin under another name than its folder is no placement, with no line, nothing fetched under it and nothing pushed to its repository, and one named through space.remote.set is refused", async (t) => {
  const { first, second, home, key, clone } = await placedAtBoth("one-per-instance");
  t.after(() => home.stop());
  const spare = second.script.addRepository({ group: "acme", name: "spare-spex" });
  const spareUrl = `${second.gitOrigin}/${second.storage}/acme/spare-spex.git`;
  git(clone, "remote", "add", "spare", spareUrl);
  const refs = (dir: string): string => git(dir, "for-each-ref", "--format=%(refname) %(objectname)");
  const spareRefs = refs(spare.bare);

  // Its placements stay one per instance, the spare remote read as none:
  // no line names it, the sync fetches nothing under it and pushes
  // nothing to its repository, and leaves it as it stands (storage-34).
  const synced = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(synced.sync.phase, "done", JSON.stringify(synced.sync));
  assert.deepEqual(synced.placements.map((line) => [line.instance, line.attached, line.outcome?.kind]), [[first.url, true, "synced"], [second.url, true, "synced"]]);
  assert.equal(git(clone, "for-each-ref", "--format=%(refname)", "refs/remotes/spare"), "");
  assert.equal(refs(spare.bare), spareRefs, "nothing pushed to its repository");
  assert.deepEqual(remoteNamesOf(clone).sort(), [hostFolder(first), hostFolder(second), "spare"].sort());
  assert.equal(git(clone, "config", "--get", "remote.spare.url"), spareUrl);

  // A remote the reader names at that instance's Git origin is refused,
  // nothing written (space-5, space-29).
  await home.client.expectError("space.remote.set", { repository: key, url: spareUrl }, "invalid_request", /used as the host gives them/);
  assert.ok(!remoteNamesOf(clone).includes("origin"), "no path placement written");
});

test("space-100, space-11, space-6: with both instances signed out no placement can run, and the Sync is refused naming the first's display name, nothing run", async (t) => {
  const { first, second, home, key, clone } = await placedAtBoth("both-out");
  t.after(() => home.stop());
  await signOut(home, first);
  await signOut(home, second);
  const steps = recordSteps(home, key, { first, second });
  const head = git(clone, "rev-parse", "HEAD");
  await home.client.expectError("space.sync", { repository: key }, "invalid_request", new RegExp(`^Sign in to ${HOST_NAME} first$`));
  home.hooks.beforeStep = undefined;
  assert.deepEqual(steps, [], "nothing run, Save among it");
  assert.equal(git(clone, "rev-parse", "HEAD"), head);
  const row = await home.client.repository(key);
  assert.deepEqual(row.placements.map((line) => [line.instance, line.state, line.reason]), [[first.url, "unreachable", "Sign in again"], [second.url, "unreachable", "Sign in again"]]);
  assert.equal(row.state, "unreachable");
});

/** A placed clone settled by one Sync: the second's placement file
 * committed, and each placement holding what the clone holds. */
async function settledAtBoth(name: string) {
  const placed = await placedAtBoth(name);
  const synced = await placed.home.client.settle("space.sync", { repository: placed.key }, 30_000);
  assert.equal(synced.sync.phase, "done", JSON.stringify(synced.sync));
  assert.deepEqual(synced.placements.map((line) => line.outcome?.kind), ["synced", "synced"]);
  return { ...placed, synced };
}

/** The steps a home's operations on `key` enter, each as
 * `<placement>:<step>`, the placement read as `first`, `second` or
 * `path`, Save as `save`, the catch-up's push as `<placement>:catch-up`;
 * `then` runs at each step before it does. */
function recordSteps(home: Awaited<ReturnType<typeof startHome>>, key: string, hosts: { first: { url: string }; second: { url: string } }, then?: (event: SpaceStepEvent, label: string) => void | Promise<void>): string[] {
  const steps: string[] = [];
  const name = (placement: string | null | undefined): string => placement === undefined ? "" : placement === null ? "path"
    : canonicalOrigin(placement) === canonicalOrigin(hosts.first.url) ? "first" : canonicalOrigin(placement) === canonicalOrigin(hosts.second.url) ? "second" : placement;
  home.hooks.beforeStep = async (event) => {
    if (event.repository !== key || event.at === "commit") return;
    const label = event.placement === undefined ? event.step : `${name(event.placement)}:${event.at === "catch-up" ? "catch-up" : event.step}`;
    steps.push(label);
    await then?.(event, label);
  };
  return steps;
}

/** A peer working copy of the second's bare repository standing on the
 * first's `spex`, as a member holding both carried it there: its next
 * push to the second descends from the first's history. */
function peerOnFirst(secondBare: string, firstBare: string): string {
  const dir = peerClone(secondBare);
  git(dir, "fetch", "-q", firstBare, "spex");
  git(dir, "reset", "-q", "--hard", "FETCH_HEAD");
  return dir;
}

/** A peer's commit pushed to its origin's `spex` from where the copy
 * stands, with no fetch first. */
function pushFrom(dir: string, files: Record<string, string>): string {
  for (const [path, text] of Object.entries(files)) writeFileSync(join(dir, path), text);
  git(dir, "add", "-A", "--", ".");
  git(dir, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "peer change");
  git(dir, "push", "-q", "origin", "HEAD:spex");
  return git(dir, "rev-parse", "HEAD");
}

test("space-92, space-12, space-19, space-33, space-31, space-22: one Sync saves once, merges the first placement's spex, then the second's against the first's merge, then pushes the first once more as a fast-forward, each line synced, a unit the first's merge rewrote taken from the second's side with no restart, and each placement's last sync recorded apart; a catch-up push the first rejects runs it once more from Check, and rejected again leaves its line behind", async (t) => {
  const { first, second, home, key, clone, firstBare, secondBare } = await settledAtBoth("merge-each");
  t.after(() => home.stop());
  writeFileSync(join(clone, "unit.md"), "original\n");
  assert.equal((await home.client.settle("space.sync", { repository: key }, 30_000)).sync.phase, "done");
  // The first's peer rewrites the unit; the second's peer, holding the
  // first's history, rewrites it again; this device changes another.
  const firstPeer = peerClone(firstBare);
  const atFirst = await peerPush(firstPeer, (dir) => {
    writeFileSync(join(dir, "unit.md"), "the first's rewrite\n");
    writeFileSync(join(dir, "from-first.md"), "the first's\n");
  });
  const atSecond = pushFrom(peerOnFirst(secondBare, firstBare), { "unit.md": "the second's rewrite\n", "from-second.md": "the second's\n" });
  writeFileSync(join(clone, "local.md"), "this device's\n");

  const steps = recordSteps(home, key, { first, second });
  const merged = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.ok(merged.sync.phase === "done" && merged.sync.pushed, JSON.stringify(merged.sync));
  // Save once, each placement's turn in the order added, then the first
  // caught up; no Apply restarted (space-12, space-19, space-31).
  assert.deepEqual(steps, [
    "save",
    "first:check", "first:compare", "first:apply", "first:refresh", "first:push",
    "second:check", "second:compare", "second:apply", "second:refresh", "second:push",
    "first:catch-up",
  ]);
  // The second's merge stands on the first's, and the unit the first's
  // merge rewrote holds the second's side (space-19, space-33).
  const [firstMerge, secondParent] = git(clone, "log", "-1", "--format=%P", "HEAD").split(" ");
  assert.equal(secondParent, atSecond);
  assert.equal(git(clone, "log", "-1", "--format=%P", firstMerge).split(" ")[1], atFirst);
  assert.equal(readFileSync(join(clone, "unit.md"), "utf8"), "the second's rewrite\n");
  assert.ok(existsSync(join(clone, "from-first.md")) && existsSync(join(clone, "from-second.md")));
  // Each placement holds the clone's `spex`, the first by the catch-up's
  // fast-forward, and each line reads synced with its own counts
  // (space-12, space-22).
  const head = git(clone, "rev-parse", "HEAD");
  assert.deepEqual([git(firstBare, "rev-parse", "spex"), git(secondBare, "rev-parse", "spex")], [head, head]);
  assert.deepEqual(merged.placements.map((line) => line.outcome), [
    { kind: "synced", sent: 1, received: 2 },
    { kind: "synced", sent: 1, received: 2 },
  ]);
  const records = syncRecordsOf(home.dataDir, key);
  const last = (host: { url: string }) => records[`sync:${key}:${hostFolder(host)}:last`] as { at: number; sent: number; received: number } | undefined;
  assert.deepEqual([last(first)?.sent, last(first)?.received, last(second)?.sent, last(second)?.received], [1, 2, 1, 2], JSON.stringify(records));
  assert.ok((last(second)?.at ?? 0) >= (last(first)?.at ?? Infinity), "each recorded at its own push");
  assert.deepEqual(merged.placements.map((line) => line.lastSync), [last(first), last(second)]);
  assert.deepEqual(merged.placements.map((line) => [line.branch?.ahead, line.branch?.behind]), [[0, 0], [0, 0]]);

  // A catch-up push the first rejects — its host moved meanwhile — runs
  // the first once more from Check, merging what it received, and the
  // second is caught up to that merge (space-12).
  const secondPeer = peerClone(secondBare);
  await peerPush(firstPeer, (dir) => { writeFileSync(join(dir, "f2.md"), "the first's, again\n"); });
  await peerPush(secondPeer, (dir) => { writeFileSync(join(dir, "s2.md"), "the second's, again\n"); });
  const rejectedOnce = recordSteps(home, key, { first, second }, async (_event, label) => {
    if (label === "first:catch-up" && !existsSync(join(clone, "f3.md"))) await peerPush(firstPeer, (dir) => { writeFileSync(join(dir, "f3.md"), "meanwhile at the first\n"); });
  });
  const rerun = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(rerun.sync.phase, "done", JSON.stringify(rerun.sync));
  assert.deepEqual(rejectedOnce.slice(11), [
    "first:catch-up",
    "first:check", "first:compare", "first:apply", "first:refresh", "first:push",
    "second:catch-up",
  ]);
  assert.equal(readFileSync(join(clone, "f3.md"), "utf8"), "meanwhile at the first\n");
  const again = git(clone, "rev-parse", "HEAD");
  assert.deepEqual([git(firstBare, "rev-parse", "spex"), git(secondBare, "rev-parse", "spex")], [again, again]);
  assert.deepEqual(rerun.placements.map((line) => line.outcome?.kind), ["synced", "synced"]);

  // Rejected again, the first ends behind while the second is caught up
  // to the first's merge (space-12).
  await peerPush(firstPeer, (dir) => { writeFileSync(join(dir, "f4.md"), "the first's, later\n"); });
  await peerPush(secondPeer, (dir) => { writeFileSync(join(dir, "s4.md"), "the second's, later\n"); });
  let moved = 0;
  recordSteps(home, key, { first, second }, async (event, label) => {
    if ((label === "first:catch-up" && moved === 0) || (label === "first:push" && moved === 1)) {
      moved += 1;
      await peerPush(firstPeer, (dir) => { writeFileSync(join(dir, `f${4 + moved}.md`), "meanwhile at the first\n"); });
    }
  });
  const behind = await home.client.settle("space.sync", { repository: key }, 30_000);
  home.hooks.beforeStep = undefined;
  assert.equal(moved, 2, "the catch-up push and the run's push again each met the first moved");
  assert.ok(behind.sync.phase === "done", JSON.stringify(behind.sync));
  assert.deepEqual(behind.placements.map((line) => line.outcome?.kind), ["behind", "synced"]);
  assert.ok(existsSync(join(clone, "f5.md")) && !existsSync(join(clone, "f6.md")), "the run again merged what the first received before its push");
  const later = git(clone, "rev-parse", "HEAD");
  assert.equal(git(secondBare, "rev-parse", "spex"), later);
  assert.notEqual(git(firstBare, "rev-parse", "spex"), later);
  // The next Sync brings the first in line.
  const caught = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.deepEqual([caught.sync.phase, ...caught.placements.map((line) => line.outcome?.kind)], ["done", "synced", "synced"]);
  assert.equal(git(firstBare, "rev-parse", "spex"), git(secondBare, "rev-parse", "spex"));
});

test("space-92, space-14, space-9, space-17, space-18, space-29: a conflict at the second ends that placement in choices, naming it, with the first's merge and push standing; choices are the named placement's, a placement the clone does not hold refused; the sync sent with them runs from Save, passing the first as a fast-forward", async (t) => {
  const { first, second, home, key, clone, firstBare, secondBare } = await settledAtBoth("choices-second");
  t.after(() => home.stop());
  await peerPush(peerClone(firstBare), (dir) => { writeFileSync(join(dir, "from-first.md"), "the first's\n"); });
  await peerPush(peerClone(secondBare), (dir) => { writeFileSync(join(dir, "both.md"), "theirs\n"); });
  writeFileSync(join(clone, "both.md"), "mine\n");

  const ended = await home.client.settle("space.sync", { repository: key }, 30_000);
  // The second in choices names it; the first's merge and push stand,
  // its line synced and holding nothing incoming (space-14, space-9).
  assert.ok(ended.sync.phase === "choices" && ended.sync.placement === canonicalOrigin(second.url), JSON.stringify(ended.sync));
  const head = git(clone, "rev-parse", "HEAD");
  assert.equal(ended.sync.savedCommit, git(clone, "rev-parse", "HEAD^1"), "the merge stands on the Save commit");
  assert.equal(git(firstBare, "rev-parse", "spex"), head);
  assert.ok(existsSync(join(clone, "from-first.md")));
  assert.deepEqual(ended.placements.map((line) => line.outcome?.kind), ["synced", "choices"]);
  assert.deepEqual(placementOf(ended, first.url).incoming, []);
  assert.deepEqual(choices(placementOf(ended, second.url).conflicts), ["both.md"]);
  assert.deepEqual(choices(ended.conflicts), ["both.md"]);
  assert.notEqual(git(secondBare, "rev-parse", "spex"), head, "nothing is pushed to the second");
  assert.equal(readFileSync(join(clone, "both.md"), "utf8"), "mine\n");

  // Choices are validated against the placement they are for (space-29).
  await home.client.expectError("space.sync", { repository: key, placement: "http://127.0.0.1:9", choices: { "both.md": "mine" } }, "invalid_request", /^atlas-spex holds no such placement$/);
  await home.client.expectError("space.sync", { repository: key, placement: null, choices: { "both.md": "mine" } }, "invalid_request", /^atlas-spex holds no such placement$/);
  await home.client.expectError("space.sync", { repository: key, placement: first.url, choices: { "both.md": "mine" } }, "invalid_request", /no divergent change|unknown unit/);

  // Sent with them, the sync runs from Save, the first already equal
  // passing as a fast-forward — no merge made there — and the second
  // merged with the choice (space-18).
  const steps = recordSteps(home, key, { first, second });
  const chosen = await home.client.settle("space.sync", { repository: key, placement: second.url, choices: { "both.md": "mine" } }, 30_000);
  home.hooks.beforeStep = undefined;
  assert.equal(chosen.sync.phase, "done", JSON.stringify(chosen.sync));
  assert.deepEqual(steps.filter((step) => step.startsWith("first:")), ["first:check", "first:compare", "first:push", "first:catch-up"]);
  assert.equal(git(clone, "log", "-1", "--format=%P", "HEAD").split(" ")[0], head, "the second's merge stands on the first's");
  const now = git(clone, "rev-parse", "HEAD");
  assert.deepEqual([git(firstBare, "rev-parse", "spex"), git(secondBare, "rev-parse", "spex")], [now, now]);
  assert.equal(readFileSync(join(clone, "both.md"), "utf8"), "mine\n");
  assert.deepEqual(chosen.placements.map((line) => line.outcome?.kind), ["synced", "synced"]);
});

test("space-92, space-12, space-5: a path placement set by space.remote.set syncs last, with no catalog read and no notice, the upstream staying at the first placement, and no merge drops it", async (t) => {
  const { first, second, home, key, clone } = await settledAtBoth("path-last");
  t.after(() => home.stop());
  const bare = bareRepo();
  await home.client.expectOk("space.remote.set", { repository: key, url: bare });
  writeFileSync(join(clone, "for-everyone.md"), "every placement's\n");
  const requests = (): number => first.script.requests.length + second.script.requests.length;
  let atPath: number | undefined;
  const steps = recordSteps(home, key, { first, second }, (event) => { if (event.placement === null && event.step === "check") atPath ??= requests(); });
  const synced = await home.client.settle("space.sync", { repository: key }, 30_000);
  home.hooks.beforeStep = undefined;
  assert.equal(synced.sync.phase, "done", JSON.stringify(synced.sync));
  // Its turn comes last, the host empty there taking every unit at its
  // push (space-12).
  assert.deepEqual(steps.filter((step) => step.startsWith("path:")), ["path:check", "path:push"]);
  assert.ok(steps.indexOf("path:check") > steps.lastIndexOf("second:push"));
  assert.equal(requests(), atPath, "no instance is read for the path placement");
  assert.equal(git(bare, "rev-parse", "spex"), git(clone, "rev-parse", "HEAD"));
  const path = placementOf(synced, null);
  assert.deepEqual([path.path, path.state, path.noticed, path.outcome?.kind], [bare, "reachable", false, "synced"]);
  assert.deepEqual(synced.placements.map((line) => line.instance), [canonicalOrigin(first.url), canonicalOrigin(second.url), null]);
  // The upstream stays at the first placement, and the path placement
  // stands after the merge (space-12, space-5).
  assert.equal(git(clone, "config", "--get", "branch.spex.remote"), hostFolder(first));
  assert.deepEqual(remoteNamesOf(clone).sort(), [hostFolder(first), hostFolder(second), "origin"].sort());
  assert.equal(git(clone, "rev-parse", "refs/remotes/origin/spex"), git(clone, "rev-parse", "HEAD"));
});

test("space-100, space-15, space-61, git-host-26, git-host-9: the first answering 503 at Check stops its line alone, unreachable, while the second syncs and the row stays reachable; a credential the second refuses signs the second out alone, its line unreachable, while the first syncs", async (t) => {
  const { first, second, home, key, clone, firstBare, secondBare } = await settledAtBoth("one-down");
  t.after(() => home.stop());
  first.script.failTransport(503);
  t.after(() => first.script.failTransport(null));
  writeFileSync(join(clone, "while-first-down.md"), "sent where it can go\n");
  const firstDown = await home.client.settle("space.sync", { repository: key }, 30_000);
  first.script.failTransport(null);
  // The row's sync is done: the second synced (space-15, space-12).
  assert.ok(firstDown.sync.phase === "done" && firstDown.sync.pushed, JSON.stringify(firstDown.sync));
  assert.deepEqual(placementOf(firstDown, first.url).outcome, {
    kind: "stopped", step: "check", cause: "unreachable", message: `Could not reach ${HOST_NAME}`, guidance: "Check the network, then Retry.", retry: true,
  });
  assert.equal(placementOf(firstDown, second.url).outcome?.kind, "synced");
  assert.deepEqual([firstDown.state, firstDown.reason], ["reachable", null]);
  const head = git(clone, "rev-parse", "HEAD");
  assert.equal(git(secondBare, "rev-parse", "spex"), head);
  assert.notEqual(git(firstBare, "rev-parse", "spex"), head);

  // The second refusing this device's credential signs the second out
  // alone; its line reads unreachable, and the first syncs (git-host-26,
  // git-host-9, git-host-4).
  second.script.revokeDevices();
  const secondOut = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.ok(secondOut.sync.phase === "done", JSON.stringify(secondOut.sync));
  const state = await home.client.expectOk("space.get", {});
  assert.deepEqual([instanceOf(state, first.url)?.signedIn, instanceOf(state, second.url)?.signedIn], [true, false]);
  const row = repositoryOf(state, key);
  const atSecond = placementOf(row, second.url);
  assert.ok(atSecond.outcome?.kind === "stopped" && atSecond.outcome.cause === "reauth", JSON.stringify(atSecond.outcome));
  assert.deepEqual([atSecond.state, atSecond.reason], ["unreachable", "Sign in again"]);
  assert.deepEqual([placementOf(row, first.url).outcome?.kind, row.state], ["synced", "reachable"]);
  assert.equal(git(firstBare, "rev-parse", "spex"), git(clone, "rev-parse", "HEAD"));
  // Each placement's transport took its own instance's credential
  // (git-host-9).
  assert.ok(first.script.transportCredentials.length > 0 && first.script.transportCredentials.every((credential) => credential.instance === first.url), JSON.stringify(first.script.transportCredentials));
  assert.ok(second.script.transportCredentials.length > 0 && second.script.transportCredentials.every((credential) => credential.instance === second.url), JSON.stringify(second.script.transportCredentials));
});

/** The host client a home's core keeps for one instance (DR-127), whose
 * fetch a test may hold. */
function clientAt(home: Awaited<ReturnType<typeof startHome>>, origin: string): { fetchImpl: typeof fetch } {
  const space = (home.service as unknown as { space: { instanceAt(origin: string): { client: { fetchImpl: typeof fetch } } } }).space;
  return space.instanceAt(canonicalOrigin(origin)).client;
}

test("space-15, space-100, git-host-22: a sign-out at the second while its Check reads the second stops the second alone, as the sign-in changed meanwhile, its line unreachable; the path placement after it still syncs, and the first is caught up to that merge", async (t) => {
  const { first, second, home, key, clone, placed, firstBare, secondBare } = await settledAtBoth("signout-turn");
  t.after(() => home.stop());
  const pathBare = bareRepo();
  await home.client.expectOk("space.remote.set", { repository: key, url: pathBare });
  assert.equal((await home.client.settle("space.sync", { repository: key }, 30_000)).sync.phase, "done");
  await peerPush(peerClone(pathBare), (dir) => { writeFileSync(join(dir, "from-path.md"), "the path placement's\n"); });
  const secondLeft = git(secondBare, "rev-parse", "spex");

  // The second's answer for its repository held until the second is
  // signed out (git-host-22).
  const client = clientAt(home, second.url);
  const inner = client.fetchImpl;
  const holds = holdingFetch(inner);
  client.fetchImpl = holds.fetch;
  const gate = holds.hold((path, status) => path === `/api/v1/host/repositories/${placed.id}` && status === 200);
  t.after(() => { client.fetchImpl = inner; gate.release(); });
  const steps = recordSteps(home, key, { first, second });
  assert.deepEqual(await home.client.expectOk("space.sync", { repository: key }), { accepted: true });
  await gate.reached;
  client.fetchImpl = inner;
  await home.client.expectOk("space.signout", { instance: second.url });
  const from = home.client.mark();
  gate.release();
  const ended = await home.client.waitRepository(from, key, (row) => row.sync.phase !== "running", 30_000);
  home.hooks.beforeStep = undefined;

  // The second stops alone, its Check's answer refused as the sign-in
  // changed meanwhile, nothing sent there (space-15, git-host-22).
  assert.equal(ended.sync.phase, "done", JSON.stringify(ended.sync));
  assert.deepEqual(placementOf(ended, second.url).outcome, {
    kind: "stopped", step: "check", cause: "reauth", message: "The sign-in changed meanwhile; try again", guidance: "Sign in from the header, then Retry.", retry: true,
  });
  assert.deepEqual([placementOf(ended, second.url).state, placementOf(ended, second.url).reason], ["unreachable", "Sign in again"]);
  assert.equal(git(secondBare, "rev-parse", "spex"), secondLeft, "nothing is pushed to the second");
  // The path placement's turn runs after it, merging what it brought,
  // and the first is caught up to that merge (space-12, space-100).
  const at = steps.indexOf("second:check");
  assert.ok(at > 0, steps.join(" "));
  assert.deepEqual(steps.slice(at), ["second:check", "path:check", "path:compare", "path:apply", "path:refresh", "path:push", "first:catch-up"]);
  assert.deepEqual(ended.placements.map((line) => line.outcome?.kind), ["synced", "stopped", "synced"]);
  const head = git(clone, "rev-parse", "HEAD");
  assert.equal(readFileSync(join(clone, "from-path.md"), "utf8"), "the path placement's\n");
  assert.deepEqual([git(firstBare, "rev-parse", "spex"), git(pathBare, "rev-parse", "spex")], [head, head]);
});

test("space-100, space-15, space-16, space-31: Stop during the first's Check, a chosen unit refused by validation at the first's Apply, and a stale lock on the first's remote-tracking ref failing its fetch with Git's own error each end the sync, the second not run", async (t) => {
  const { first, second, home, key, clone, firstBare, secondBare } = await settledAtBoth("ends-whole");
  t.after(() => home.stop());
  const firstPeer = peerClone(firstBare);
  const notAtSecond = (steps: string[]): void => assert.ok(!steps.some((step) => step.startsWith("second:")), `the second not run: ${steps.join(", ")}`);

  // Stop while the first's transport sleeps (space-16).
  first.script.sleepTransport(30_000);
  t.after(() => first.script.sleepTransport(0));
  let steps = recordSteps(home, key, { first, second });
  const from = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.sync", { repository: key }), { accepted: true });
  await home.client.waitRepository(from, key, (repository) => repository.sync.phase === "running" && repository.sync.step === "check" && repository.sync.placement === canonicalOrigin(first.url) && repository.sync.cancelable, 30_000);
  assert.deepEqual(await home.client.expectOk("space.cancel", { repository: key }), { stopped: true });
  const stopped = await home.client.waitRepository(from, key, (repository) => repository.sync.phase === "stopped", 30_000);
  first.script.sleepTransport(0);
  assert.ok(stopped.sync.phase === "stopped" && stopped.sync.step === "check" && stopped.sync.cause === "stopped", JSON.stringify(stopped.sync));
  assert.equal(placementOf(stopped, first.url).outcome?.kind, "stopped");
  assert.equal(placementOf(stopped, second.url).outcome, null);
  notAtSecond(steps);

  // A chosen unit refused by validation at the first's Apply: two open
  // intents from one issue (space-15).
  const one = randomUUID();
  const two = randomUUID();
  const fromIssue = (id: string, text: string): string => JSON.stringify({ format: 1, id, text, createdAt: 1, source: { kind: "issue", ref: "#7" } });
  await peerPush(firstPeer, (dir) => {
    mkdirSync(join(dir, "intents"), { recursive: true });
    writeFileSync(join(dir, "intents", `${one}.json`), fromIssue(one, "Fix issue 7"));
    writeFileSync(join(dir, "intents", `${two}.json`), fromIssue(two, "Fix issue 7 again"));
  });
  steps = recordSteps(home, key, { first, second });
  const refused = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.ok(refused.sync.phase === "stopped" && refused.sync.step === "apply" && refused.sync.cause === "validation" && /duplicate open source #7/.test(refused.sync.message), JSON.stringify(refused.sync));
  assert.ok(placementOf(refused, first.url).outcome?.kind === "stopped");
  notAtSecond(steps);
  await peerPush(firstPeer, (dir) => {
    writeFileSync(join(dir, "intents", `${two}.json`), JSON.stringify({ ...JSON.parse(fromIssue(two, "Fix issue 7 again")), closed: { as: "dropped", at: 2 } }));
  });
  assert.equal((await home.client.settle("space.sync", { repository: key }, 30_000)).sync.phase, "done");

  // A stale lock on the first's remote-tracking ref fails its fetch with
  // Git's own error, which ends the sync (space-15, space-31).
  await peerPush(firstPeer, (dir) => { writeFileSync(join(dir, "locked-out.md"), "not fetched\n"); });
  const lock = join(clone, ".git", "refs", "remotes", hostFolder(first), "spex.lock");
  writeFileSync(lock, "");
  steps = recordSteps(home, key, { first, second });
  const locked = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.ok(locked.sync.phase === "stopped" && locked.sync.step === "check" && locked.sync.cause === "git", JSON.stringify(locked.sync));
  assert.match(locked.sync.message, /cannot lock ref/i);
  assert.ok(locked.sync.message.includes(`refs/remotes/${hostFolder(first)}/spex`), locked.sync.message);
  assert.match(locked.sync.message, /File exists/i);
  assert.ok(locked.sync.message.split("\n").filter(Boolean).length <= 3, locked.sync.message);
  notAtSecond(steps);
  rmSync(lock);
  home.hooks.beforeStep = undefined;
  const after = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.deepEqual([after.sync.phase, ...after.placements.map((line) => line.outcome?.kind)], ["done", "synced", "synced"]);
  assert.ok(existsSync(join(clone, "locked-out.md")));
  assert.equal(git(secondBare, "rev-parse", "spex"), git(clone, "rev-parse", "HEAD"));

  // The real Git adapter's command wrapper and the operation's fallback
  // both summarize this failed fetch. A harmless config value also puts
  // a synthetic credentialed backing URL in the wrapper's command text;
  // the transport itself uses the local bare repository, never that URL.
  await peerPush(firstPeer, (dir) => { writeFileSync(join(dir, "nested-error.md"), "not fetched through the lock\n"); });
  writeFileSync(lock, "");
  t.after(() => rmSync(lock, { force: true }));
  const privateUrl = new URL(git(clone, "remote", "get-url", hostFolder(first)));
  privateUrl.username = "summary-user";
  privateUrl.password = "summary-secret";
  const adapter = new SpaceGit(clone, { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", LC_ALL: "C", LANG: "C" });
  let gitAdvice: string | undefined;
  home.hooks.beforeStep = async (event) => {
    if (event.repository === key && event.step === "save") {
      try {
        await adapter.ok(["-c", `spex.summary-context=${privateUrl.href}`, "fetch", "-q", "--no-tags", firstBare, `+refs/heads/spex:refs/remotes/${hostFolder(first)}/spex`]);
      } catch (error) {
        assert.ok(error instanceof GitError);
        gitAdvice = error.run.stderr.trimEnd().split("\n").at(-1);
        throw error;
      }
    }
  };
  const nested = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.ok(nested.sync.phase === "stopped" && nested.sync.step === "save" && nested.sync.cause === "git", JSON.stringify(nested.sync));
  assert.match(nested.sync.message, /cannot lock ref/i);
  assert.match(nested.sync.message, /File exists/i);
  assert.ok(nested.sync.message.includes(`refs/remotes/${hostFolder(first)}/spex`), nested.sync.message);
  assert.ok(gitAdvice, "the failed Git command supplied its diagnostic tail");
  assert.ok(nested.sync.message.endsWith(gitAdvice), nested.sync.message);
  assert.ok(nested.sync.message.split("\n").filter(Boolean).length <= 3, nested.sync.message);
  assert.doesNotMatch(nested.sync.message, /summary-user|summary-secret|https?:\/\//i);
  assert.ok(!existsSync(join(clone, "nested-error.md")), "the failed fetch changed no working file");
  home.hooks.beforeStep = undefined;
  rmSync(lock);
});

test("space-100, space-20, space-67, space-19, space-13, space-15, space-31: a file another process leaves invalid during the first's Apply stands as the refresh's finding while the first pushes and the second syncs; a repair marker left at the second on the first's merge commit is finished by the next admission into the recorded merge; a placement whose spex shares no ancestor stops alone as unrelated, and a join of it compares from the empty tree", async (t) => {
  const { first, second, home, key, clone, firstBare, secondBare } = await settledAtBoth("apply-each");
  t.after(() => home.stop());
  const firstPeer = peerClone(firstBare);
  const secondPeer = peerClone(secondBare);

  // The refresh's finding stops nothing (space-20, space-15).
  await peerPush(firstPeer, (dir) => { writeFileSync(join(dir, "from-first.md"), "the first's\n"); });
  await peerPush(secondPeer, (dir) => { writeFileSync(join(dir, "from-second.md"), "the second's\n"); });
  const stray = join(clone, "intents", `${randomUUID()}.assets`);
  recordSteps(home, key, { first, second }, (_event, label) => {
    if (label !== "first:apply") return;
    mkdirSync(stray, { recursive: true });
    writeFileSync(join(stray, "stray.png"), "no intent names this");
  });
  const found = await home.client.settle("space.sync", { repository: key }, 30_000);
  home.hooks.beforeStep = undefined;
  assert.equal(found.sync.phase, "done", JSON.stringify(found.sync));
  assert.deepEqual(found.placements.map((line) => line.outcome?.kind), ["synced", "synced"]);
  const head = git(clone, "rev-parse", "HEAD");
  assert.deepEqual([git(firstBare, "rev-parse", "spex"), git(secondBare, "rev-parse", "spex")], [head, head]);
  assert.ok((await home.client.expectOk("space.get", {})).diagnostics.some((d) => d.blocking && d.reason.includes("attachments without their intent")), "the refresh's finding is reported");
  rmSync(stray, { recursive: true, force: true });

  // The first merged while the second could not be reached: a merge
  // commit the second's selection is then planted on, half written.
  await peerPush(firstPeer, (dir) => { writeFileSync(join(dir, "f.md"), "the first's, again\n"); });
  writeFileSync(join(clone, "l.md"), "this device's\n");
  second.script.failTransport(503);
  const firstOnly = await home.client.settle("space.sync", { repository: key }, 30_000);
  second.script.failTransport(null);
  assert.deepEqual(firstOnly.placements.map((line) => line.outcome?.kind), ["synced", "stopped"]);
  const firstMerge = git(clone, "rev-parse", "HEAD");
  assert.equal(git(clone, "log", "-1", "--format=%P", firstMerge).split(" ").length, 2, "the first's merge is a merge commit");
  const theirs = await peerPush(secondPeer, (dir) => {
    writeFileSync(join(dir, "s.md"), "the second's, written\n");
    writeFileSync(join(dir, "s2.md"), "the second's, not yet written\n");
  });
  git(clone, "fetch", "-q", secondBare, `+spex:refs/remotes/${hostFolder(second)}/spex`);
  const base = git(clone, "merge-base", firstMerge, theirs);
  writeFileSync(join(clone, ".spex-apply.json"), JSON.stringify({ v: 1, placement: canonicalOrigin(second.url), ours: firstMerge, theirs, base, choices: {}, at: Date.now() }));
  writeFileSync(join(clone, "s.md"), "the second's, written\n");
  const repaired = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(repaired.sync.phase, "done", JSON.stringify(repaired.sync));
  assert.equal(existsSync(join(clone, ".spex-apply.json")), false);
  assert.equal(readFileSync(join(clone, "s2.md"), "utf8"), "the second's, not yet written\n");
  const merge = git(clone, "rev-parse", "HEAD");
  assert.equal(git(clone, "log", "-1", "--format=%P", merge), `${firstMerge} ${theirs}`, "the recorded merge, on the first's merge commit");
  assert.deepEqual([git(firstBare, "rev-parse", "spex"), git(secondBare, "rev-parse", "spex")], [merge, merge]);
  assert.deepEqual(repaired.placements.map((line) => line.outcome?.kind), ["synced", "synced"]);

  // The second replaced by a history sharing no ancestor (space-13).
  writeFileSync(join(clone, "both.md"), "mine\n");
  assert.equal((await home.client.settle("space.sync", { repository: key }, 30_000)).sync.phase, "done");
  const foreign = join(mkdtempSync(join(scratch, "foreign-")), "foreign");
  mkdirSync(foreign);
  git(foreign, "init", "-q", "-b", "spex");
  writeFileSync(join(foreign, "both.md"), "theirs\n");
  writeFileSync(join(foreign, "only-there.md"), "theirs alone\n");
  git(foreign, "add", "-A", "--", ".");
  git(foreign, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "another history");
  git(foreign, "push", "-q", "-f", secondBare, "spex:spex");
  writeFileSync(join(clone, "l2.md"), "this device's, later\n");
  const unrelated = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.ok(unrelated.sync.phase === "unrelated" && unrelated.sync.placement === canonicalOrigin(second.url), JSON.stringify(unrelated.sync));
  assert.deepEqual(unrelated.placements.map((line) => line.outcome?.kind), ["synced", "unrelated"]);
  assert.equal(placementOf(unrelated, second.url).branch?.unrelated, true);
  assert.equal(git(firstBare, "rev-parse", "spex"), git(clone, "rev-parse", "HEAD"), "the first synced");
  // A join of it plans from the empty tree: every unit on both sides
  // with other bytes a choice (space-13).
  const joined = await home.client.settle("space.sync", { repository: key, placement: second.url, join: true }, 30_000);
  assert.ok(joined.sync.phase === "choices" && joined.sync.placement === canonicalOrigin(second.url), JSON.stringify(joined.sync));
  assert.deepEqual(choices(joined.conflicts), ["both.md"]);
  const done = await home.client.settle("space.sync", { repository: key, placement: second.url, join: true, choices: { "both.md": "mine" } }, 30_000);
  assert.equal(done.sync.phase, "done", JSON.stringify(done.sync));
  assert.deepEqual(done.placements.map((line) => line.outcome?.kind), ["synced", "synced"]);
  assert.equal(readFileSync(join(clone, "both.md"), "utf8"), "mine\n");
  assert.equal(readFileSync(join(clone, "only-there.md"), "utf8"), "theirs alone\n");
  const now = git(clone, "rev-parse", "HEAD");
  assert.deepEqual([git(firstBare, "rev-parse", "spex"), git(secondBare, "rev-parse", "spex")], [now, now]);
});

/** The requests at a stand-in that act on a repository's Git or its
 * branch: a transport, a brokered credential, a branch preparation. */
function gitEffects(host: StandinHost): number {
  return host.script.requests.filter((request) => request.path.includes(".git/") || request.path.endsWith("/credential") || request.path.endsWith("/spex-branch")).length;
}

/** The reads of a stand-in's catalog, one per `/api/v1/host/me`
 * (git-host-22). */
function catalogReads(host: StandinHost): number {
  return host.script.requests.filter((request) => request.path === "/api/v1/host/me").length;
}

test("space-57, git-host-22, space-87, space-12, space-11, space-29, storage-5: a placement whose repository has other members and was never pushed from this device owes its own notice — found by its Check's fresh read, or read afresh at admission — its line waiting for Continue, nothing sent there, while the first syncs; with no other placement able to run the sync is refused with that notice, naming the placement; a sync noticed for it pushes there and records it under its remote alone", async (t) => {
  // The second placement in a group of the second's, the account alone
  // its member until a member joins it during the sync.
  const workshop: StandinGroup = { id: "2900", fullPath: "workshop", name: "Workshop", kind: "group", members: [{ id: "1002", login: "bob", displayName: "Bob", role: "Owner" }] };
  const { first, second, home, key, clone, placed, firstBare, secondBare } = await placedAtBoth("notice-each", workshop);
  t.after(() => home.stop());
  const firstFolder = hostFolder(first);
  const secondLeft = git(secondBare, "rev-parse", "spex");
  const firstRecord = syncRecordsOf(home.dataDir, key);
  assert.deepEqual(Object.keys(firstRecord), [`sync:${key}:${firstFolder}:last`], "the pick's sync recorded at the first alone");

  // Shared at the second only once its turn begins: its Check's fresh
  // read finds the notice owed and its line waits for Continue, before
  // any branch or transport effect there, while the first syncs
  // (space-57, git-host-22, space-87).
  let shared = false;
  const steps = recordSteps(home, key, { first, second }, (_event, label) => {
    if (label !== "second:check" || shared) return;
    shared = true;
    workshop.members?.push({ id: "1003", login: "carol", displayName: "Carol", role: "Developer" });
  });
  let effects = gitEffects(second);
  const checked = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(checked.sync.phase, "done", JSON.stringify(checked.sync));
  assert.deepEqual(placementOf(checked, first.url).outcome?.kind, "synced");
  const waiting = placementOf(checked, second.url);
  assert.deepEqual(waiting.outcome, { kind: "waiting", sent: 0, received: 0 });
  assert.deepEqual([waiting.state, waiting.path, waiting.members, waiting.noticed, waiting.lastSync], ["reachable", "workshop/atlas-spex", 2, false, null]);
  assert.ok(steps.includes("second:check") && !steps.some((label) => /^second:(compare|apply|refresh|push|catch-up)$/.test(label)), steps.join(" "));
  assert.equal(gitEffects(second), effects, "no branch preparation, credential or transport at the second");
  assert.equal(git(secondBare, "rev-parse", "spex"), secondLeft);
  assert.equal(git(firstBare, "rev-parse", "spex"), git(clone, "rev-parse", "HEAD"), "the first synced");
  assert.equal(syncRecordsOf(home.dataDir, key)[`sync:${key}:${placed.folder}:last`], undefined);
  assert.equal(syncRecordsOf(home.dataDir, key)[`sync:${key}:${placed.folder}:noticed`], undefined);

  // The next sync's admission reads the second afresh, its notice owed:
  // no step runs there, its line waiting, the first syncing (space-57,
  // space-11).
  steps.length = 0;
  writeFileSync(join(clone, "later.md"), "after the notice was owed\n");
  const admitted = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(admitted.sync.phase, "done", JSON.stringify(admitted.sync));
  assert.deepEqual(admitted.placements.map((line) => line.outcome?.kind), ["synced", "waiting"]);
  assert.ok(steps.length > 0 && !steps.some((label) => label.startsWith("second:")), steps.join(" "));
  assert.equal(gitEffects(second), effects);
  assert.equal(git(firstBare, "rev-parse", "spex"), git(clone, "rev-parse", "HEAD"));

  // The first signed out, no other placement can run: the sync is
  // refused with the second's notice, naming it (space-11, space-29).
  await signOut(home, first);
  const refused = await home.client.command("space.sync", { repository: key });
  assert.ok(!refused.ok);
  assert.equal(refused.error.code, "invalid_request");
  assert.match(refused.error.message, /^Read the sharing notice before the first sync of atlas-spex$/);
  assert.deepEqual((refused.error as { details?: unknown }).details, { notice: true, members: 2, visibility: "private", placement: canonicalOrigin(second.url) });

  // Continue for the second: its notice recorded under its remote, the
  // sync pushes there, the first's line stopped for its sign-in and its
  // record untouched (space-57, storage-5, space-15).
  effects = gitEffects(second);
  const continued = await home.client.settle("space.sync", { repository: key, placement: second.url, noticed: true }, 30_000);
  home.hooks.beforeStep = undefined;
  assert.equal(continued.sync.phase, "done", JSON.stringify(continued.sync));
  const atSecond = placementOf(continued, second.url);
  assert.deepEqual([atSecond.outcome?.kind, atSecond.noticed, typeof atSecond.lastSync?.at], ["synced", true, "number"]);
  const atFirst = placementOf(continued, first.url);
  assert.ok(atFirst.outcome?.kind === "stopped" && atFirst.outcome.cause === "reauth", JSON.stringify(atFirst.outcome));
  assert.ok(gitEffects(second) > effects, "the second's transport ran");
  assert.equal(git(secondBare, "rev-parse", "spex"), git(clone, "rev-parse", "HEAD"));
  const records = syncRecordsOf(home.dataDir, key);
  assert.deepEqual(records[`sync:${key}:${placed.folder}:last`], atSecond.lastSync);
  assert.equal(records[`sync:${key}:${placed.folder}:noticed`], true);
  assert.equal(records[`sync:${key}:${firstFolder}:noticed`], undefined, "the first's notice never asked");
  assert.ok(records[`sync:${key}:${firstFolder}:last`] !== undefined);
});

test("git-host-26, git-host-22, space-57, space-15: a first-notice read failing at the second — the second unavailable, or refusing in its own words — leaves the first's sync admitted, the second's line stopped as unreachable with no step run there; each Check reads its own instance's catalog at its placement's turn; a failed read of the second at its Check stops its placement alone", async (t) => {
  const { first, second, home, key, clone, firstBare, secondBare } = await placedAtBoth("notice-read");
  t.after(() => home.stop());
  await refreshed(home);

  // The second, never pushed from this device, is read at admission; that
  // read failing stops it alone (git-host-22, space-57).
  let steps = recordSteps(home, key, { first, second });
  second.script.unavailable(1);
  const effects = gitEffects(second);
  const admitted = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(admitted.sync.phase, "done", JSON.stringify(admitted.sync));
  assert.equal(placementOf(admitted, first.url).outcome?.kind, "synced");
  const unread = placementOf(admitted, second.url);
  assert.ok(unread.outcome?.kind === "stopped", JSON.stringify(unread.outcome));
  assert.deepEqual([unread.outcome.step, unread.outcome.cause, unread.outcome.message], ["check", "unreachable", `Could not reach ${SECOND_NAME}`]);
  assert.deepEqual([unread.state, unread.reason], ["unreachable", `Could not reach ${SECOND_NAME}`]);
  assert.ok(!steps.some((label) => label.startsWith("second:")), steps.join(" "));
  assert.equal(gitEffects(second), effects);
  assert.equal(git(firstBare, "rev-parse", "spex"), git(clone, "rev-parse", "HEAD"));

  // A read the second refuses in its own words stops it alone as
  // unreachable too, carrying those words (git-host-22).
  steps = recordSteps(home, key, { first, second });
  second.script.refuseHost(1, "Reads are paused for the audit.");
  writeFileSync(join(clone, "while-refused.md"), "sent to the first\n");
  const refusedRead = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(refusedRead.sync.phase, "done", JSON.stringify(refusedRead.sync));
  assert.equal(placementOf(refusedRead, first.url).outcome?.kind, "synced");
  const refused = placementOf(refusedRead, second.url).outcome;
  assert.ok(refused?.kind === "stopped", JSON.stringify(refused));
  assert.deepEqual([refused.step, refused.cause, refused.message], ["check", "unreachable", `${SECOND_NAME} refused: Reads are paused for the audit.`]);
  assert.ok(!steps.some((label) => label.startsWith("second:")), steps.join(" "));
  assert.equal(gitEffects(second), effects);

  // Each placement's Check reads its own instance's catalog at its turn
  // (git-host-22): the first's during the first's, the second's during
  // the second's alone.
  const counts = new Map<string, [number, number]>();
  steps = recordSteps(home, key, { first, second }, (_event, label) => { counts.set(label, [catalogReads(first), catalogReads(second)]); });
  const synced = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(synced.sync.phase, "done", JSON.stringify(synced.sync));
  assert.deepEqual(synced.placements.map((line) => line.outcome?.kind), ["synced", "synced"]);
  const at = (label: string): [number, number] => {
    const found = counts.get(label);
    assert.ok(found, `${label} in ${steps.join(" ")}`);
    return found;
  };
  assert.equal(at("first:compare")[0] - at("first:check")[0], 1, "the first's catalog read at its turn");
  assert.equal(at("second:check")[1] - at("first:check")[1], 0, "the second not read during the first's turn");
  assert.equal(at("second:compare")[1] - at("second:check")[1], 1, "the second's catalog read at its turn");
  assert.equal(at("second:compare")[0] - at("second:check")[0], 0, "the first not read during the second's turn");
  assert.equal(git(secondBare, "rev-parse", "spex"), git(clone, "rev-parse", "HEAD"));

  // The second's catalog failing at its Check stops it alone, the first
  // syncing (git-host-26, space-15).
  writeFileSync(join(clone, "first-only.md"), "the second unread\n");
  recordSteps(home, key, { first, second }, (_event, label) => { if (label === "second:check") second.script.unavailable(1); });
  const partly = await home.client.settle("space.sync", { repository: key }, 30_000);
  home.hooks.beforeStep = undefined;
  assert.equal(partly.sync.phase, "done", JSON.stringify(partly.sync));
  const stopped = placementOf(partly, second.url);
  assert.ok(stopped.outcome?.kind === "stopped", JSON.stringify(stopped.outcome));
  assert.deepEqual([stopped.outcome.step, stopped.outcome.cause, stopped.state], ["check", "unreachable", "unreachable"]);
  assert.equal(placementOf(partly, first.url).outcome?.kind, "synced");
  assert.equal(git(firstBare, "rev-parse", "spex"), git(clone, "rev-parse", "HEAD"));
  assert.notEqual(git(secondBare, "rev-parse", "spex"), git(clone, "rev-parse", "HEAD"));
});

test("space-21, space-98, space-31, space-57, space-93: a Leave sent while a Sync still awaits its admission's read of the second enters no step until that Sync has run, then follows it, dropping the second's remote and deleting its file", async (t) => {
  // The second placement in a group whose other member makes its notice
  // owed, so the Sync's admission reads the second (space-57).
  const workshop: StandinGroup = { id: "2900", fullPath: "workshop", name: "Workshop", kind: "group", members: [{ id: "1002", login: "bob", displayName: "Bob", role: "Owner" }, { id: "1003", login: "carol", displayName: "Carol", role: "Developer" }] };
  const { first, second, home, key, clone, placed, firstBare } = await placedAtBoth("leave-follows", workshop);
  t.after(() => home.stop());
  const client = clientAt(home, second.url);
  const inner = client.fetchImpl;
  const holds = holdingFetch(inner);
  client.fetchImpl = holds.fetch;
  const gate = holds.hold((path, status) => path === `/api/v1/host/repositories/${placed.id}` && status === 200);
  t.after(() => { client.fetchImpl = inner; gate.release(); });
  // Every step either operation enters, as `<op>:<placement>:<step>`.
  const steps: string[] = [];
  const name = (placement: string | null | undefined): string => placement === undefined ? "" : placement === null ? "path:"
    : canonicalOrigin(placement) === canonicalOrigin(first.url) ? "first:" : canonicalOrigin(placement) === canonicalOrigin(second.url) ? "second:" : `${placement}:`;
  home.hooks.beforeStep = (event) => {
    if (event.repository !== key || event.at === "commit") return;
    steps.push(`${event.op}:${name(event.placement)}${event.at === "catch-up" ? "catch-up" : event.step}`);
  };
  writeFileSync(join(clone, "later.md"), "sent by the sync the leave follows\n");

  // The Sync's admission waits on the second's answer; the Leave sent
  // meanwhile is accepted and runs nothing (space-21, space-31).
  const syncing = home.client.expectOk("space.sync", { repository: key });
  await gate.reached;
  assert.deepEqual(await home.client.expectOk("space.leave", { repository: key, instance: second.url, confirmed: true }), { accepted: true });
  await sleep(1_000);
  assert.deepEqual([...steps], [], "nothing runs while the Sync is in its admission");
  client.fetchImpl = inner;
  const from = home.client.mark();
  gate.release();
  assert.deepEqual(await syncing, { accepted: true });

  // The Sync runs its turns, the second waiting for its notice, and the
  // Leave follows it: its one step comes last, after the first's push
  // (space-21, space-98).
  const left = await home.client.waitRepository(from, key, (row) => row.sync.phase === "idle" && row.placements.length === 1, 30_000);
  home.hooks.beforeStep = undefined;
  const leaving = steps.indexOf("leave:second:check");
  assert.equal(leaving, steps.length - 1, steps.join(" "));
  const before = steps.slice(0, leaving);
  assert.ok(before.length > 0 && before.every((step) => step.startsWith("sync:")) && before.includes("sync:save") && before.includes("sync:first:push"), steps.join(" "));
  assert.ok(!before.some((step) => step.startsWith("sync:second:")), steps.join(" "));
  assert.deepEqual(left.placements.map((line) => line.instance), [canonicalOrigin(first.url)]);
  assert.deepEqual(remoteNamesOf(clone), [hostFolder(first)]);
  assert.equal(existsSync(join(clone, "placements", `${placed.folder}.yaml`)), false, "its file deleted");
  assert.equal(git(firstBare, "cat-file", "-p", "spex:later.md"), "sent by the sync the leave follows");
});

test("space-98, space-12, space-29: a Leave not confirmed counts a unit changed here that no remaining placement holds, and not one this device holds unchanged since its last shared commit with the first while a peer rewrote it there; stopped, it keeps the placement", async (t) => {
  const { first, second, home, key, clone, placed, firstBare } = await settledAtBoth("leave-count");
  t.after(() => home.stop());
  writeFileSync(join(clone, "shared.md"), "as both placements hold it\n");
  assert.equal((await home.client.settle("space.sync", { repository: key }, 30_000)).sync.phase, "done");

  // A peer at the first rewrites the unit, which this device fetches
  // without merging; another unit is changed here and sent nowhere.
  await peerPush(peerClone(firstBare), (dir) => { writeFileSync(join(dir, "shared.md"), "as a peer at the first rewrote it\n"); });
  writeFileSync(join(clone, "mine.md"), "changed here, sent nowhere\n");
  const fetched = await home.client.settle("space.fetch", { repository: key }, 30_000);
  assert.deepEqual(units(placementOf(fetched, first.url).incoming), ["shared.md"]);

  // The Leave of the second counts the unit changed here alone: the
  // first holds the other at its last shared commit with the clone
  // (space-98).
  const from = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.leave", { repository: key, instance: second.url }), { accepted: true });
  const stopped = await home.client.waitRepository(from, key, (row) => row.sync.phase === "stopped", 30_000);
  assert.ok(stopped.sync.phase === "stopped" && stopped.sync.op === "leave" && stopped.sync.cause === "unreceived" && stopped.sync.count === 1, JSON.stringify(stopped.sync));
  assert.deepEqual(stopped.placements.map((line) => [line.instance, line.attached]), [[canonicalOrigin(first.url), true], [canonicalOrigin(second.url), true]]);
  assert.deepEqual(remoteNamesOf(clone).sort(), [hostFolder(first), placed.folder].sort());
});

test("space-98, space-12: a Leave not confirmed counts the units a remaining placement's host no longer holds, found holding no spex at the last check, whatever its tracking ref still names; stopped, it keeps the placement", async (t) => {
  const { first, second, home, key, clone, placed, secondBare } = await settledAtBoth("leave-empty");
  t.after(() => home.stop());
  const firstFolder = hostFolder(first);
  const firstFile = `placements/${firstFolder}.yaml`;
  writeFileSync(join(clone, "notes.md"), "everywhere\n");
  const synced = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(synced.sync.phase, "done", JSON.stringify(synced.sync));
  assert.deepEqual(synced.placements.map((line) => line.outcome?.kind), ["synced", "synced"]);

  // The second's `spex` deleted at its host; the Check finds it holding
  // none, while the clone's tracking ref still names what it last
  // fetched (space-8).
  assert.equal(git(secondBare, "for-each-ref", "--format=%(refname)", "refs/heads/spex"), "refs/heads/spex");
  const atSecond = git(secondBare, "rev-parse", "spex");
  git(secondBare, "update-ref", "-d", "refs/heads/spex");
  const checked = await home.client.settle("space.fetch", { repository: key }, 30_000);
  assert.equal(checked.sync.phase, "idle", JSON.stringify(checked.sync));
  assert.equal(placementOf(checked, second.url).branch?.hostEmpty, true, JSON.stringify(placementOf(checked, second.url).branch));
  assert.equal(git(clone, "rev-parse", "--verify", `refs/remotes/${placed.folder}/spex`), atSecond, "the stale tracking ref stands");

  // The Leave of the first counts every record unit it or the clone
  // holds — the environment and notes.md, the managed rules, project.json
  // and the placement files being none — the second holding none
  // (space-98).
  let mark = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.leave", { repository: key, instance: first.url }), { accepted: true });
  const stopped = await home.client.waitRepository(mark, key, (row) => row.sync.phase === "stopped", 30_000);
  assert.deepEqual(stopped.sync, { phase: "stopped", op: "leave", step: "check", cause: "unreceived", message: "2 records have reached no other placement", guidance: "Confirm to remove it anyway.", retry: true, count: 2 });
  assert.deepEqual(stopped.placements.map((line) => [line.instance, line.attached]), [[canonicalOrigin(first.url), true], [canonicalOrigin(second.url), true]]);
  assert.deepEqual(remoteNamesOf(clone), [firstFolder, placed.folder]);
  assert.ok(existsSync(join(clone, firstFile)), "its file kept");

  // Sent confirmed, the first is dropped, the clone moving to its path at
  // the second (space-98, storage-38).
  const movedKey = hostKey(second, "acme/atlas-spex");
  const movedClone = clonePath(home.dataDir, movedKey);
  mark = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.leave", { repository: key, instance: first.url, confirmed: true }), { accepted: true });
  const moved = await home.client.waitRepository(mark, movedKey, (row) => row.sync.phase !== "running", 30_000);
  assert.deepEqual([moved.sync, moved.placements.map((line) => line.instance)], [{ phase: "idle" }, [canonicalOrigin(second.url)]], JSON.stringify(moved));
  assert.ok(existsSync(join(movedClone, ".git")) && !existsSync(clone), "moved under the second's folder");
  assert.deepEqual(remoteNamesOf(movedClone), [placed.folder]);
  assert.equal(existsSync(join(movedClone, firstFile)), false, "its file deleted");
  assert.equal(readFileSync(join(movedClone, "notes.md"), "utf8"), "everywhere\n", "its records kept");
});
