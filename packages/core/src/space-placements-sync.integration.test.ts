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
// the row reachable where any placement is (space-61) — hermetic, on
// loopback alone, in a file budget of its own.

import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { GroupsState, RepositoryState, SpaceConflict, SpaceUnit } from "./protocol.js";
import { bareOf, clonePath, createSpaceHarness, hostFolder, hostKey, instanceOf, placementOf, repositoryOf } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
const { git, gitFolder, addFolder, peerClone, peerPush, attachByHand, startHome, startHost, signIn, signOut } = fixture;
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
 * the first's `acme` and placed by hand in the second's `acme`. */
async function placedAtBoth(name: string) {
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
  const placed = attachByHand(home, key, second);
  return { first, second, home, key, clone, placed, firstBare: bareOf(first, key), secondBare: second.bareOf("acme/atlas-spex") };
}

test("space-8, space-31, space-33, space-7, space-15, space-10, space-29: Check host fetches each placement's spex in the order added, each line listing its own incoming units and the conflicts this device made too, the row every unit local against some placement and every placement's conflicts; a placement whose check stops stops alone, its list kept, the next still checked; the check stops, with the first stop, only where every placement stopped; space.diff reads the side of the placement it names", async (t) => {
  const { first, second, home, key, clone, placed, firstBare, secondBare } = await placedAtBoth("check-each");
  t.after(() => home.stop());

  // A unit sent to the first alone: the second lacks it.
  writeFileSync(join(clone, "sent.md"), "sent to the first\n");
  const sent = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(sent.sync.phase, "done", JSON.stringify(sent.sync));
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

test("space-61, space-87: with the first instance signed out, the first placement's line reads unreachable, Sign in again, while the second's reads reachable from the second's own read, with its path, members' count and rights there, and the row reads reachable through it", async (t) => {
  const { first, second, home, key, placed } = await placedAtBoth("line-states");
  t.after(() => home.stop());
  const before = repositoryOf(await refreshed(home), key);
  assert.deepEqual(before.placements.map((line) => [line.instance, line.state]), [[first.url, "reachable"], [second.url, "reachable"]]);

  const out = await signOut(home, first);
  const row: RepositoryState = repositoryOf(out, key);
  const [atFirst, atSecond] = [placementOf(row, first.url), placementOf(row, second.url)];
  assert.deepEqual([atFirst.state, atFirst.reason], ["unreachable", "Sign in again"]);
  assert.deepEqual([atSecond.state, atSecond.reason, atSecond.path, atSecond.id, atSecond.can.manageMembers], ["reachable", null, "acme/atlas-spex", placed.id, true]);
  assert.equal(typeof atSecond.members, "number");
  assert.deepEqual([row.state, row.reason, row.governing], ["reachable", null, null]);
  // The row stands where its key lies, under the first's heading
  // (space-1).
  assert.ok(instanceOf(out, first.url)?.groups.some((group) => group.repositories.some((repository) => repository.key === key)));
});
