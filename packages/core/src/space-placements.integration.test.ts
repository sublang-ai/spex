// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Personal project placement across Spaces, including shared Git backends,
// synchronization at multiple destinations, and forgetting a Space.

import { test } from "node:test";
import { orderRemotes, remoteOrderOf } from "./home.js";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalOrigin } from "@sublang/spex/instance";
import { encodePlacementFile, PLACEMENTS_DIR } from "./placements.js";
import type { Command, RepositoryState, SpaceState, SpaceUnit } from "./protocol.js";
import type { SpaceStepEvent } from "./space.js";
import type { StandinHost } from "./testing/standin-host.js";
import { bareOf, clonePath, createSpaceHarness, hostFolder, hostKey, instanceOf, placementOf, repositoryOf, rowsOf, syncRecordsOf, remoteNamesOf } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
const { git, gitFolder, addFolder, bareRepo, peerClone, peerPush, attachByHand, startHome, startHost, signIn, signOut, forget } = fixture;
test.after(() => fixture.dispose());

/** The stand-in's person, and the personal settings repository once signed in. */
const LOGIN = "ada";
const HOST_OWN = `${LOGIN}/${LOGIN}-spex`;
const HOST_NAME = "Stand-in Git host";
const SECOND_NAME = "Second stand-in";
const THIRD_NAME = "Third stand-in";
/** The commit identity the first's account gives a clone (space-32). */
const ADA = "ada <ada@users.noreply.127.0.0.1>";

/** A Refresh of every signed-in instance, landed. */
async function refreshed(home: Awaited<ReturnType<typeof startHome>>): Promise<SpaceState> {
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
 * the second as `bob` — with a project created in the first account's namespace per name in
 * `projects`, each synced. */
async function twoInstances(name: string, projects: string[]) {
  const first = await startHost();
  const second = await startHost({ displayName: SECOND_NAME, person: { id: "1002", login: "bob", displayName: "Bob" } });
  const home = await startHome(name, { host: first, project: false });
  let mark = home.client.mark();
  await signIn(home, first);
  await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  await signIn(home, second);
  const keys: string[] = [];
  for (const project of projects) {
    const { key: local } = await addFolder(home, gitFolder(project));
    mark = home.client.mark();
    await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: first.url, name: project } });
    const key = hostKey(first, `ada/${project}-spex`);
    await home.client.waitRepository(mark, key, (repository) => repository.sync.phase === "done", 30_000);
    keys.push(key);
  }
  return { first, second, home, keys };
}

test("space-87: a personal listing named by another clone’s placement file appears only as that clone’s line", async (t) => {
  const first = await startHost();
  const second = await startHost({ displayName: SECOND_NAME, person: { id: "1002", login: "bob", displayName: "Bob" } });
  const home = await startHome("filed-lines", { host: first, project: false });
  t.after(() => home.stop());
  let mark = home.client.mark();
  await signIn(home, first);
  await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  await signIn(home, second);
  const { key: local } = await addFolder(home, gitFolder("atlas"));
  mark = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: first.url, name: "atlas" } });
  const key = hostKey(first, "ada/atlas-spex");
  const created = await home.client.waitRepository(mark, key, (repository) => repository.sync.phase === "done", 30_000);
  const clone = clonePath(home.dataDir, key);
  const firstOrigin = canonicalOrigin(first.url);
  const secondOrigin = canonicalOrigin(second.url);
  // The pick wrote its own placement's file (storage-36).
  assert.deepEqual(created.placedAt, [firstOrigin]);

  // Another device placed the project in the second Space. Until
  // a file here names it, the second's listing is a row of its own,
  // "Not on this device", offering Join (space-61, space-63).
  const there = second.script.addRepository({ group: "bob", name: "atlas-spex" });
  const absentKey = hostKey(second, "bob/atlas-spex");
  const before = await refreshed(home);
  const absent = repositoryOf(before, absentKey);
  assert.equal(absent.state, "absent");
  assert.equal(absent.placements.length, 1);
  const listed = absent.placements[0];
  assert.deepEqual({ instance: listed.instance, path: listed.path, id: listed.id, attached: listed.attached, state: listed.state }, { instance: secondOrigin, path: "bob/atlas-spex", id: there.id, attached: false, state: "absent" });

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
    { path: filed.path, id: filed.id, reason: filed.reason, waiting: filed.waiting, branch: filed.branch, lastSync: filed.lastSync, outcome: filed.outcome },
    { path: listed.path, id: there.id, reason: null, waiting: null, branch: null, lastSync: null, outcome: null },
  );
  assert.ok(!rowsOf(state).some((repository) => repository.key === absentKey), "no row of its own");
  // Two Git systems mint ids alike: the second's by its instance.
  assert.deepEqual(rowsOf(state).filter((repository) => repository.placements.some((line) => line.instance === secondOrigin && line.id === there.id)).map((repository) => repository.key), [key]);
  // The row reads its placement there alone: reachable, governed by the
  // first, under the first account's namespace (space-61, space-1).
  assert.equal(row.state, "reachable");
  assert.equal(row.governing, firstOrigin);
  // Every instance its files name, held here or not (space-87).
  assert.deepEqual([...row.placedAt].sort(), [firstOrigin, secondOrigin].sort());
  // Join of it is refused: it is a placement of the clone's, to attach
  // on its row (space-29, space-87).
  await home.client.expectError("space.join", { instance: second.url, hostId: there.id }, "invalid_request", /^atlas belongs to atlas on this computer — open atlas instead$/);
  assert.ok(!rowsOf(await home.client.expectOk("space.get", {})).some((repository) => repository.key === absentKey), "the refused join cloned nothing");

  // Its remote added as a device holding it adds it (storage-34): the
  // line is held and Join is refused as already on this computer.
  const url = `${second.gitOrigin}/bob/atlas-spex.git`;
  git(clone, "remote", "add", secondFolder, url);
  git(clone, "config", `remote.${secondFolder}.spexId`, there.id);
  const attached = await home.client.expectOk("space.get", {});
  const held = repositoryOf(attached, key);
  assert.deepEqual(held.placements.map((line) => [line.instance, line.attached, line.state]), [[firstOrigin, true, "reachable"], [secondOrigin, true, "reachable"]]);
  assert.deepEqual({ path: placementOf(held, second.url).path }, { path: "bob/atlas-spex" });
  assert.ok(!rowsOf(attached).some((repository) => repository.key === absentKey), "no row of its own");
  await home.client.expectError("space.join", { instance: second.url, hostId: there.id }, "invalid_request", /^atlas is on this computer already — Show it instead$/);
});

test("space-87: personal listings from two Spaces over one Git backend identify one placement", async (t) => {
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
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: first.url, name: "team" } });
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
  // A Place there is refused, the row placed there already (space-29).
  await home.client.expectError("space.place", { repository: key, choice: { kind: "create", instance: second.url, name: "team" } }, "invalid_request", new RegExp(`^team is at ${SECOND_NAME} already$`));
  await home.client.expectError("space.join", { instance: second.url, hostId: id }, "invalid_request", /^team is on this computer already — Show it instead$/);
});

test("space-92, space-97, space-87: creating a second personal placement writes its remote and file, then syncs both", async (t) => {
  const { first, second, home, keys: [key] } = await twoInstances("place-create", ["atlas"]);
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
  const placed = await home.client.settle("space.place", { repository: key, choice: { kind: "create", instance: second.url, name: "atlas" } }, 30_000);
  home.hooks.beforeStep = undefined;
  assert.deepEqual(firstBeforeSave, [], "the first is asked nothing before the Place's sync");
  assert.deepEqual(apiCalls(second, secondAsked).filter((call) => call === "POST /api/v1/host/repositories"), ["POST /api/v1/host/repositories"]);
  assert.equal(second.script.creations.length, creations + 1);
  const asked = second.script.creations.at(-1) as { group_id: unknown; name: unknown };
  assert.deepEqual([asked.group_id, asked.name], [null, "atlas-spex"]);
  // The host's step first, at the second, then the sync from Save: each
  // placement's turn in the order added (space-31, space-12).
  assert.equal(steps[0], "place:check:second");
  assert.equal(steps[1], "place:save:-");
  assert.ok(steps.indexOf("place:check:first") < steps.indexOf("place:check:second", 1), steps.join(" "));
  const created = second.script.repositories.find((repository) => repository.group.fullPath === second.script.person.login && repository.path === "atlas-spex");
  assert.ok(created, "the second created atlas-spex in the account’s namespace");

  // The same sync merges and pushes the first's peer change to both
  // placements without another acknowledgement (space-97, space-12,
  // space-87, space-12).
  assert.equal(placed.sync.phase, "done", JSON.stringify(placed.sync));
  assert.deepEqual(placed.placements.map((line) => [line.instance, line.path, line.attached, line.outcome?.kind]), [
    [firstOrigin, "ada/atlas-spex", true, "synced"],
    [secondOrigin, "bob/atlas-spex", true, "synced"],
  ]);
  assert.ok(existsSync(join(clone, "peer.md")), "the first's peer change merged");
  assert.equal(git(firstBare, "rev-parse", "spex"), git(clone, "rev-parse", "HEAD"));
  assert.equal(git(created.bare, "rev-parse", "spex"), git(clone, "rev-parse", "HEAD"));
  // Its remote, named by the second's folder, holds the host's id in
  // its own section; no id stands at the top level (storage-34, space-32).
  assert.match(configOf(clone, `remote.${secondFolder}.url`) ?? "", /\/bob\/atlas-spex\.git$/);
  assert.equal(configOf(clone, `remote.${secondFolder}.spexId`), created.id);
  assert.equal(configOf(clone, `remote.${hostFolder(first)}.spexId`), placed.id);
  assert.equal(configOf(clone, "spex.repositoryId"), null);
  // Its file holds exactly the three lines, committed by that sync's
  // Save and pushed to the first (storage-36).
  const bytes = `format: 1\ninstance: "${secondOrigin}"\nid: "${created.id}"\n`;
  assert.equal(encodePlacementFile(secondOrigin, created.id), bytes);
  assert.equal(readFileSync(join(clone, PLACEMENTS_DIR, `${secondFolder}.yaml`), "utf8"), bytes);
  assert.equal(`${git(firstBare, "show", `spex:${PLACEMENTS_DIR}/${secondFolder}.yaml`)}\n`, bytes);
  assert.deepEqual([...placed.placedAt].sort(), [firstOrigin, secondOrigin].sort());

  // The Place prepares the second's branch and pushes with its own
  // credential, recording the completed sync without an acceptance
  // preference (space-12, git-host-7, git-host-9, storage-5).
  assert.ok(apiCalls(second, secondAsked).includes(`POST /api/v1/host/repositories/${created.id}/spex-branch`), "the second prepared its branch");
  assert.equal(git(created.bare, "rev-parse", "spex"), git(clone, "rev-parse", "HEAD"));
  assert.equal(configOf(clone, `remote.${secondFolder}.spexCreated`), null, "the prepared branch spends the creation");
  const pushes = second.script.transportCredentials.filter((entry) => entry.push);
  assert.ok(pushes.length > 0 && second.script.transportCredentials.every((entry) => entry.instance === second.url), JSON.stringify(second.script.transportCredentials));
  assert.ok(first.script.transportCredentials.every((entry) => entry.instance === first.url), "nothing at the first went with the second's credential");
  const records = syncRecordsOf(home.dataDir, key);
  assert.equal(records[`sync:${key}:${secondFolder}:noticed`], undefined);
  assert.ok(records[`sync:${key}:${secondFolder}:last`], JSON.stringify(records));

  // The flat list contains one row identifying both placements.
  const state = await home.client.expectOk("space.get", {});
  assert.equal(rowsOf(state).filter((repository) => repository.key === key).length, 1);
  assert.deepEqual(repositoryOf(state, key).placements.map((line) => [instanceOf(state, line.instance ?? "")?.displayName, line.path, line.state]), [[HOST_NAME, "ada/atlas-spex", "reachable"], [SECOND_NAME, "bob/atlas-spex", "reachable"]]);
  assert.ok(repositoryOf(state, key).placements.every((line) => line.lastSync !== null));

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
  let secondCheckRequests: number | undefined;
  home.hooks.beforeStep = (event: SpaceStepEvent) => {
    if (event.repository !== key || event.op !== "place") return;
    if (event.step === "save") saved = true;
    else if (saved && event.step === "check" && event.placement === secondOrigin) {
      if (atCheck === undefined) {
        atCheck = { created: configOf(clone, `remote.${secondFolder}.spexCreated`), firstPushed: git(firstBare, "rev-parse", "spex") === git(clone, "rev-parse", "HEAD") };
        secondCheckRequests = second.script.requests.length;
      }
    }
  };
  const stopped = await home.client.settle("space.place", { repository: key, choice: { kind: "create", instance: second.url, name: "atlas" } }, 60_000);
  home.hooks.beforeStep = undefined;
  const created = second.script.repositories.find((repository) => repository.group.fullPath === second.script.person.login && repository.path === "atlas-spex");
  assert.ok(created, "created at the second");
  assert.deepEqual(atCheck, { created: created.id, firstPushed: true });
  // Read again five times, then `main` pushed by the core and refused:
  // that placement stops alone in the second's words, the first synced
  // and the sync done by it (git-host-7, space-15).
  assert.ok(secondCheckRequests !== undefined);
  const requests = second.script.requests.slice(secondCheckRequests);
  const push = requests.findIndex((request) => request.path.includes("/bob/atlas-spex.git/"));
  assert.ok(push >= 0, "the core tried to push the default branch");
  const checks = requests.slice(0, push).filter((request) => request.method === "GET" && request.path === `/api/v1/host/repositories/${created.id}`);
  // One initial target read, five branch polls and one ownership check
  // immediately before starting the default-branch transport.
  assert.equal(checks.length, 7);
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

test("space-94, space-4, space-65, space-12, space-29, space-1, space-82, space-60, space-5, storage-31, storage-34, storage-36, storage-5, git-host-6, git-host-9: personal settings are placed at every instance the home signs in to — a sign-in at the first creates its own repository there; one at the third, on a Git backend of its own, creates bob-spex in the namespace there as its second placement, its remote named by the third's folder with its id and its file written, its first push proceeding directly with a credential the third issued; one at the second, over the first's Git backend and listing the first's repository, adds no placement; space.place and space.leave naming it are each refused, nothing asked of any instance; the first signed out and forgotten, its placement there follows the second, its remote renamed in its place with its id and last sync kept and its file rewritten to the second's with the first's deleted, and the third receives that change at the next sync; the third then signed out and forgotten, which no signed-in instance but the second lists, its remote there is dropped with its id, what it fetched and its last sync, its file left", async (t) => {
  const first = await startHost();
  const second = await startHost({ gitBackend: first, displayName: SECOND_NAME });
  const third = await startHost({ displayName: THIRD_NAME, person: { id: "1002", login: "bob", displayName: "Bob" } });
  const home = await startHome("own-everywhere", { host: first, project: false });
  t.after(() => home.stop());
  const own = clonePath(home.dataDir, HOST_OWN);
  const names = (host: StandinHost): unknown[] => host.script.creations.map((body) => [(body as { name?: unknown }).name, (body as { group_id?: unknown }).group_id ?? null]);

  // A sign-in at the first creates the personal settings repository in
  // your namespace there, its first placement (space-4, space-65).
  let mark = home.client.mark();
  await signIn(home, first);
  const created = await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  assert.deepEqual(names(first), [[`${LOGIN}-spex`, null]]);
  assert.deepEqual(remoteNamesOf(own), [hostFolder(first)]);
  const ownId = created.id;
  assert.ok(ownId);

  // One at the third creates `<login there>-spex` in your namespace
  // there as its second placement, its remote named by the third's
  // folder with the host's id in its own section and its file written;
  // its first push reaches the third directly, both synced (space-4,
  // space-65, space-12, git-host-6, storage-34, storage-36). The row stays at the first, its first
  // placement's (storage-31, space-1).
  mark = home.client.mark();
  await signIn(home, third);
  const placed = await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "done" && repository.placements.length === 2 && repository.placements.every((line) => line.outcome?.kind === "synced"), 30_000);
  assert.deepEqual(names(third), [["bob-spex", null]]);
  const atThird = third.script.repositories.find((repository) => repository.path === "bob-spex");
  assert.ok(atThird, "bob-spex stands at the third");
  assert.equal(atThird.group.fullPath, "bob");
  assert.deepEqual(remoteNamesOf(own), [hostFolder(first), hostFolder(third)]);
  assert.equal(configOf(own, `remote.${hostFolder(third)}.spexId`), atThird.id);
  assert.equal(readFileSync(join(own, PLACEMENTS_DIR, `${hostFolder(third)}.yaml`), "utf8"), encodePlacementFile(canonicalOrigin(third.url), atThird.id));
  assert.deepEqual(placed.placements.map((line) => [line.instance, line.path, line.attached, line.outcome?.kind ?? null]), [[first.url, HOST_OWN, true, "synced"], [third.url, "bob/bob-spex", true, "synced"]]);
  assert.deepEqual([placed.key, placed.own, placed.instance, placed.id, placed.sync.phase], [HOST_OWN, true, first.url, ownId, "done"]);
  // The same operation pushes with a credential the third issued.
  assert.equal(git(atThird.bare, "rev-parse", "spex"), git(own, "rev-parse", "spex"));
  assert.ok(third.script.transportCredentials.some((entry) => entry.push) && third.script.transportCredentials.every((entry) => entry.instance === third.url), JSON.stringify(third.script.transportCredentials));

  // One at the second, over the first's Git backend, which lists the
  // first's repository in your namespace there: no placement added,
  // nothing created and no file written, its listing that placement
  // and no row of its own (space-4, git-host-5).
  await signIn(home, second);
  assert.deepEqual(second.script.creations, [], "nothing is created at the second");
  assert.deepEqual(remoteNamesOf(own), [hostFolder(first), hostFolder(third)]);
  assert.equal(existsSync(join(own, PLACEMENTS_DIR, `${hostFolder(second)}.yaml`)), false);
  const state = await home.client.expectOk("space.get", {});
  const row = repositoryOf(state, HOST_OWN);
  assert.deepEqual(row.placements.map((line) => [line.instance, line.attached]), [[first.url, true], [third.url, true]]);
  assert.deepEqual(rowsOf(state).filter((repository) => repository.id === ownId).map((repository) => repository.key), [HOST_OWN], "the second's listing is the first's placement");

  // space.place and space.leave naming the personal settings repository
  // are each refused, nothing changed and nothing asked (space-29).
  const asked = [first, second, third].map((host) => host.script.requests.length);
  await home.client.expectError("space.place", { repository: HOST_OWN, choice: { kind: "create", instance: second.url, name: LOGIN } }, "invalid_request", /^Personal settings sync with each Space when you sign in$/);
  await home.client.expectError("space.leave", { repository: HOST_OWN, instance: third.url }, "invalid_request", /^Personal settings sync with each Space when you sign in$/);
  assert.deepEqual(remoteNamesOf(own), [hostFolder(first), hostFolder(third)]);
  assert.deepEqual([first, second, third].map((host) => host.script.requests.length), asked);

  // The first signed out and forgotten: the personal settings placement there
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

test("space-82: Forget follows available personal copies and refuses when project placements still depend on the Space", async (t) => {
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
  // The third's sign-in places personal settings there too, its push
  // syncing directly (space-4).
  mark = home.client.mark();
  await signIn(home, third);
  await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "done" && repository.placements.length === 2 && repository.placements.every((line) => line.outcome?.kind === "synced"), 30_000);

  // `atlas` keyed under the first, in your namespace there, which the
  // second lists too, and placed in the third account's namespace; `borealis` keyed
  // under the third account's namespace and placed in your namespace at the first
  // (space-97). A group of `null` is your namespace.
  const created = async (name: string, at: StandinHost, namespace: string): Promise<string> => {
    const { key: local } = await addFolder(home, gitFolder(name));
    const from = home.client.mark();
    await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: at.url, name } });
    const key = hostKey(at, `${namespace}/${name}-spex`);
    await home.client.waitRepository(from, key, (repository) => repository.sync.phase === "done", 30_000);
    return key;
  };
  const placedAt = async (key: string, at: StandinHost, name: string): Promise<void> => {
    const placed = await home.client.settle("space.place", { repository: key, choice: { kind: "create", instance: at.url, name } }, 30_000);
    assert.equal(placed.sync.phase, "done", JSON.stringify(placed.sync));
  };
  const atlas = await created("atlas", first, LOGIN);
  await placedAt(atlas, third, "atlas");
  const borealis = await created("borealis", third, third.script.person.login);
  await placedAt(borealis, first, "borealis");
  const atlasClone = clonePath(home.dataDir, atlas);
  const borealisClone = clonePath(home.dataDir, borealis);
  assert.deepEqual([remotesOf(atlasClone), remotesOf(borealisClone)], [[firstFolder, thirdFolder], [thirdFolder, firstFolder]]);
  const borealisAtFirst = configOf(borealisClone, `remote.${firstFolder}.spexId`);
  assert.ok(borealisAtFirst);

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
  // the second, and `borealis` and the personal settings repository, keyed
  // under it (space-82, space-29, storage-31) — the instance kept signed
  // out, every clone, remote and file as it stood, the personal settings
  // remote there untouched, nothing asked of any instance.
  await signOut(home, third);
  const own = clonePath(home.dataDir, HOST_OWN);
  const standing = (clone: string): unknown[] => [remotesOf(clone), readdirSync(join(clone, PLACEMENTS_DIR)).sort()];
  const before = [atlasMoved, borealisClone, own].map(standing);
  const asked = [first, second, third].map((host) => host.script.requests.length);
  const projects = new Intl.ListFormat("en", { type: "conjunction", style: "narrow" }).format(["borealis", "atlas"]);
  await home.client.expectError("space.forget", { instance: third.url }, "invalid_request",
    new RegExp(`^Still syncing: ${projects} — stop them first$`));
  assert.deepEqual([atlasMoved, borealisClone, own].map(standing), before);
  assert.deepEqual(remotesOf(own), [secondFolder, thirdFolder]);
  const kept = await home.client.expectOk("space.get", {});
  assert.deepEqual(kept.instances.map((instance) => [instance.origin, instance.signedIn]), [[second.url, true], [third.url, false]]);
  assert.deepEqual([first, second, third].map((host) => host.script.requests.length), asked, "Forget asks nothing of any instance");
});
