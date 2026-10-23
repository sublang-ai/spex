// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A spex repository's placements in its clone's tracked files
// (storage-36, storage-41, DR-128): real cores on scratch homes against
// the stand-in Git host, each act that creates or joins a placement
// writing its file as its three lines, the same bytes on every home, a
// file that does not read naming no placement and blocking nothing, and
// a migrated clone's first sync writing each placement's file no commit
// held (storage-37); this device's last sync and notice recorded per
// placement, following its remote (storage-5); and, end to end, a
// project placed at two instances, joined on a second home, left
// placement by placement and attached again (storage-39), and two
// migrated homes of one repository placing, attaching and leaving it
// (storage-40) — hermetic, on loopback alone, in a file budget of its
// own.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { createSessionStore } from "@sublang/playbook/session-store";
import { stringify as stringifyYaml } from "yaml";
import { Home } from "./home.js";
import type { GroupsState, SpaceUnit } from "./protocol.js";
import { bareOf, clonePath, createSpaceHarness, hostFolder, hostKey, instanceOf, placementOf, prefsOf, repositoryOf, syncRecordsOf } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
const { git, gitFolder, bareRepo, addFolder, otherDevice, peerClone, peerPush, runTurn, sleep, startHome, startHost, signIn, signOut } = fixture;
test.after(() => fixture.dispose());

/** The stand-in's person, and your own group's repository once signed in. */
const LOGIN = "ada";
const HOST_OWN = `${LOGIN}/${LOGIN}-spex`;
/** A second stand-in's display name, and the person signing in there. */
const SECOND_NAME = "Second stand-in";
const BOB = { id: "1002", login: "bob", displayName: "Bob" };

/** One Git configuration value of a clone, or null where none stands. */
function configOf(clone: string, key: string): string | null {
  try { return git(clone, "config", "--get", key); } catch { return null; }
}

/** A clone's remotes in the order its Git configuration holds them
 * (storage-34) — `git remote` sorts them. */
function remotesOf(clone: string): string[] {
  let lines: string;
  try { lines = git(clone, "config", "--get-regexp", "^remote\\..*\\.url$"); } catch { return []; }
  return lines.split("\n").filter((line) => line !== "").map((line) => line.split(" ")[0].replace(/^remote\./, "").replace(/\.url$/, ""));
}

/** The unit names a list holds. */
const units = (list: SpaceUnit[]): string[] => list.map((unit) => unit.unit);

/** Whether a file stands, waiting up to ten seconds for it. */
async function eventually(file: string): Promise<boolean> {
  for (let i = 0; i < 400 && !existsSync(file); i += 1) await sleep(25);
  return existsSync(file);
}

/** A placement file's bytes, as storage-36 spells them out. */
const placementBytes = (origin: string, id: string | null): string => `format: 1\ninstance: "${origin}"\nid: "${id ?? ""}"\n`;

/** A file as a bare repository's `spex` holds it. */
const committed = (bare: string, path: string): string => `${git(bare, "show", `spex:${path}`)}\n`;

/** A scratch home's preferences changed as another writer changes them,
 * by one atomic replacement the running core reads at its next use
 * (storage-5, DR-111). */
function rewritePrefs(dataDir: string, change: (prefs: Record<string, unknown>) => void): void {
  const file = join(dataDir, "local", "prefs.json");
  const prefs = prefsOf(dataDir);
  change(prefs);
  writeFileSync(`${file}.next`, JSON.stringify({ format: 1, prefs }));
  renameSync(`${file}.next`, file);
}

/** A Refresh of every signed-in instance, landed. */
async function refreshed(home: Awaited<ReturnType<typeof startHome>>): Promise<GroupsState> {
  const before = await home.client.expectOk("space.get", {});
  const mark = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  return home.client.waitSpace(mark, (state) => state.instances.every((instance) => !instance.signedIn
    || (instance.read.phase === "idle" && (instance.readAt ?? 0) > (instanceOf(before, instance.origin)?.readAt ?? 0))), 30_000);
}

test("storage-36, space-35, space-23: your own group's sign-in, a pick's creation, a group's first session and a join on a second home each write placements/<folder>.yaml as its three lines, the same bytes on both homes, which the sync pushes and the explorer reads as a placement, shared; a remote set through space.remote.set writes none", async (t) => {
  const host = await startHost();
  const file = `placements/${hostFolder(host)}.yaml`;
  const a = await startHome("placed-a", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => a.stop());

  // The sign-in's own-group step (space-4, space-65): the file names the
  // stand-in and the host's id for your own group's own repository
  // there, and its first sync pushes it.
  let from = a.client.mark();
  await signIn(a, host);
  const own = await a.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  const ownBytes = readFileSync(join(clonePath(a.dataDir, HOST_OWN), file), "utf8");
  assert.equal(ownBytes, placementBytes(host.url, own.id));
  assert.equal(committed(bareOf(host, HOST_OWN), file), ownBytes);

  // A pick's creation in acme (space-58): the file in the clone moved
  // under the stand-in's folder, pushed by the pick's sync.
  const local = await addFolder(a, gitFolder("placed"));
  from = a.client.mark();
  await a.client.expectOk("space.pick", { repository: local.key, choice: { kind: "create", instance: host.url, groupId: "2002", name: "placed" } });
  const key = hostKey(host, "acme/placed-spex");
  const created = await a.client.waitRepository(from, key, (repository) => repository.sync.phase === "done", 30_000);
  const clone = clonePath(a.dataDir, key);
  const bytes = readFileSync(join(clone, file), "utf8");
  assert.equal(bytes, placementBytes(host.url, created.id));
  assert.deepEqual(readdirSync(join(clone, "placements")), [`${hostFolder(host)}.yaml`], "one file, for its one placement");
  assert.equal(committed(bareOf(host, key), file), bytes);

  // The explorer reads `placements/` and its file as a placement, shared
  // (space-35, space-23).
  const root = await a.client.expectOk("space.tree", { repository: key });
  const folder = root.entries.find((entry) => entry.path === "placements");
  assert.deepEqual([folder?.kind, folder?.family, folder?.sync], ["dir", "placement", "shared"]);
  const placed = await a.client.expectOk("space.tree", { repository: key, path: "placements" });
  assert.deepEqual(placed.entries.map((entry) => [entry.path, entry.kind, entry.family, entry.sync]), [[file, "file", "placement", "shared"]]);

  // A remote the reader names is the path placement, written to no file
  // (storage-36, space-5).
  await a.client.expectOk("space.remote.set", { repository: key, url: bareRepo() });
  assert.deepEqual(git(clone, "remote").split("\n"), [hostFolder(host), "origin"]);
  assert.deepEqual(readdirSync(join(clone, "placements")), [`${hostFolder(host)}.yaml`]);
  assert.equal(readFileSync(join(clone, file), "utf8"), bytes);

  // A group's first session (space-65): its own spex repository, on no
  // host yet, created in acme and pushed, its file naming that one.
  const groupKey = hostKey(host, "acme/acme-spex");
  const groupClone = clonePath(a.dataDir, groupKey);
  mkdirSync(groupClone, { recursive: true });
  git(groupClone, "init", "-q", "-b", "spex");
  git(groupClone, "-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", "Start");
  const work = gitFolder("acme-work");
  await a.client.expectOk("project.rebind", { projectId: groupKey, path: work });
  from = a.client.mark();
  assert.equal((await a.client.expectOk("project.register", { path: work })).id, groupKey);
  const group = await a.client.waitRepository(from, groupKey, (repository) => repository.sync.phase === "done", 30_000);
  const groupBytes = readFileSync(join(groupClone, file), "utf8");
  assert.equal(groupBytes, placementBytes(host.url, group.id));
  assert.notEqual(group.id, created.id);
  assert.equal(committed(bareOf(host, groupKey), file), groupBytes);

  // A second home: its sign-in joins your own group's own repository and
  // writes that file's very bytes; its join of the project writes the
  // bytes the first pushed, so nothing is left to save (space-59,
  // space-63).
  const b = await startHome("placed-b", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => b.stop());
  from = b.client.mark();
  await signIn(b, host);
  const ownB = await b.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase !== "running" && repository.sync.phase !== "idle", 30_000);
  assert.equal(ownB.sync.phase, "done", JSON.stringify(ownB.sync));
  assert.equal(readFileSync(join(clonePath(b.dataDir, HOST_OWN), file), "utf8"), ownBytes);
  from = b.client.mark();
  await b.client.expectOk("space.join", { instance: host.url, hostId: created.id ?? "" });
  await b.client.waitRepository(from, key, (repository) => repository.state === "reachable" && repository.sync.phase === "idle", 30_000);
  const joined = clonePath(b.dataDir, key);
  assert.equal(readFileSync(join(joined, file), "utf8"), bytes);
  assert.equal(git(joined, "status", "--porcelain", "--", "placements"), "", "the same bytes as committed");
});

test("storage-41, storage-12: a placement file that does not read as its encoding, or is named for another instance than it names, is reported as nonblocking and names no placement, while one naming an instance the home does not list makes its remote that placement; the Save commits each and the sync proceeds", async (t) => {
  const host = await startHost();
  const home = await startHome("misplaced", { host, project: false });
  t.after(() => home.stop());
  const from = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  const clone = clonePath(home.dataDir, HOST_OWN);
  const lines = async (): Promise<unknown[]> => (await home.client.repository(HOST_OWN)).placements.map((line) => [line.instance, line.attached, line.state, line.reason]);
  const held: unknown = [host.url, true, "reachable", null];

  // A remote under the folder of an instance the home does not list is a
  // placement only where the clone's file under that folder names that
  // instance (storage-34, storage-41).
  const nowhere = "https://nowhere.example";
  git(clone, "remote", "add", "@nowhere.example", `${nowhere}/ada/ada-spex.git`);
  git(clone, "config", "remote.@nowhere.example.spexId", "9001");
  assert.deepEqual(await lines(), [held]);
  const named = join(clone, "placements", "@nowhere.example.yaml");
  writeFileSync(named, placementBytes(nowhere, "9001"));
  assert.deepEqual(await lines(), [held, [nowhere, true, "unreachable", "Sign in again"]]);

  // Not of its encoding — another line ending — or naming an instance
  // whose folder is not its name, a file names none; each is reported,
  // blocking nothing (storage-12).
  writeFileSync(named, placementBytes(nowhere, "9001").replaceAll("\n", "\r\n"));
  assert.deepEqual(await lines(), [held]);
  writeFileSync(named, placementBytes("https://elsewhere.example", "9001"));
  assert.deepEqual(await lines(), [held]);
  writeFileSync(join(clone, "placements", "@junk.example.yaml"), "instance: https://junk.example\n");
  const diagnostics = await home.client.expectOk("storage.diagnostics", {});
  assert.deepEqual(
    diagnostics.filter((diagnostic) => diagnostic.file.startsWith(join(clone, "placements"))).map((diagnostic) => [relative(clone, diagnostic.file), diagnostic.reason, diagnostic.blocking]),
    [
      [join("placements", "@junk.example.yaml"), "does not read as format: 1, instance and id, one line each", false],
      [join("placements", "@nowhere.example.yaml"), "its name is not the folder of the instance it names", false],
    ],
  );

  // The Save commits them as any tracked file, and the sync goes on with
  // the stand-in (storage-12).
  const synced = await home.client.settle("space.sync", { repository: HOST_OWN }, 30_000);
  assert.equal(synced.sync.phase, "done", JSON.stringify(synced.sync));
  const pushed = git(bareOf(host, HOST_OWN), "ls-tree", "-r", "--name-only", "spex", "--", "placements").split("\n");
  assert.deepEqual(pushed, ["placements/@junk.example.yaml", "placements/@nowhere.example.yaml", `placements/${hostFolder(host)}.yaml`].sort());
  assert.deepEqual(await lines(), [held]);
});

test("storage-5, space-22, space-5, space-15: this device's last sync and notice are kept per placement under sync:<repository>:<placement>:, a former sync:<repository>:last and :noticed reading as the first placement's — a path placement's kept under its own name once a pick places the clone at an instance in front of it, an instance placement's until its next sync records its own, which removes them — and a placement dropped takes its own alone", async (t) => {
  const host = await startHost();
  const folder = hostFolder(host);
  const home = await startHome("per-placement", { host, project: false });
  t.after(() => home.stop());
  let from = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  const lines = (row: { placements: { instance: string | null; lastSync: unknown; noticed: boolean }[] }): unknown[] => row.placements.map((line) => [line.instance, line.lastSync, line.noticed]);

  // A clone synced with its path placement alone records its sync under
  // `origin` (space-22); written back as an earlier Spex kept it, one
  // record per repository, it reads as that first placement's.
  const local = await addFolder(home, gitFolder("kept"));
  const pathBare = bareRepo();
  await home.client.expectOk("space.remote.set", { repository: local.key, url: pathBare });
  const viaPath = await home.client.settle("space.sync", { repository: local.key }, 30_000);
  assert.equal(viaPath.sync.phase, "done", JSON.stringify(viaPath.sync));
  const former = placementOf(viaPath, null).lastSync;
  assert.ok(former);
  assert.deepEqual(syncRecordsOf(home.dataDir, local.key), { [`sync:${local.key}:origin:last`]: former });
  rewritePrefs(home.dataDir, (prefs) => {
    delete prefs[`sync:${local.key}:origin:last`];
    prefs[`sync:${local.key}:last`] = former;
  });
  const pathOnly = await home.client.repository(local.key);
  assert.deepEqual(lines(pathOnly), [[null, former, false]]);

  // A pick places it at the stand-in, in front of its path placement:
  // the path placement keeps that record under its own name, following
  // the clone's move, and the new placement's sync records its own. The
  // path placement's remote set aside meanwhile, the pick's sync stops
  // that placement alone, recording nothing of it (space-12, space-15).
  const aside = `${pathBare}-aside`;
  renameSync(pathBare, aside);
  from = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local.key, choice: { kind: "create", instance: host.url, groupId: "2002", name: "kept" } });
  const key = hostKey(host, "acme/kept-spex");
  // Moved as the creation lands, it reads the path sync's outcome until
  // its own sync ends.
  const picked = await home.client.waitRepository(from, key, (repository) => repository.sync.phase === "done" && repository.sync.at > former.at, 30_000);
  renameSync(aside, pathBare);
  assert.deepEqual(picked.placements.map((line) => line.outcome?.kind), ["synced", "stopped"]);
  const pickedLast = placementOf(picked, host.url).lastSync;
  assert.ok(pickedLast && pickedLast.at > former.at, JSON.stringify(pickedLast));
  assert.deepEqual(syncRecordsOf(home.dataDir, key), { [`sync:${key}:${folder}:last`]: pickedLast, [`sync:${key}:origin:last`]: former });
  assert.deepEqual(syncRecordsOf(home.dataDir, local.key), {});
  assert.deepEqual(lines(picked), [[host.url, pickedLast, false], [null, former, false]]);

  // A former record of the repository reads as its first placement's —
  // now its instance placement — the path placement reading its own,
  // until that placement's next sync records its own, which removes
  // both former keys, the notice kept as that placement's; the path
  // placement's turn of that sync records its own (storage-5, space-22).
  const earlier = { at: 1, sent: 2, received: 3 };
  rewritePrefs(home.dataDir, (prefs) => {
    delete prefs[`sync:${key}:${folder}:last`];
    prefs[`sync:${key}:last`] = earlier;
    prefs[`sync:${key}:noticed`] = true;
  });
  const reread = await home.client.repository(key);
  assert.deepEqual(lines(reread), [[host.url, earlier, true], [null, former, false]]);
  const synced = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(synced.sync.phase, "done", JSON.stringify(synced.sync));
  const syncedLast = placementOf(synced, host.url).lastSync;
  assert.ok(syncedLast && syncedLast.at > earlier.at, JSON.stringify(syncedLast));
  const pathSynced = placementOf(synced, null).lastSync;
  assert.ok(pathSynced && pathSynced.at > former.at, JSON.stringify(pathSynced));
  assert.deepEqual(syncRecordsOf(home.dataDir, key), {
    [`sync:${key}:${folder}:last`]: syncedLast,
    [`sync:${key}:${folder}:noticed`]: true,
    [`sync:${key}:origin:last`]: pathSynced,
  });
  assert.deepEqual(lines(synced), [[host.url, syncedLast, true], [null, pathSynced, false]]);

  // The path placement dropped takes its own record alone (space-5).
  const dropped = repositoryOf(await home.client.expectOk("space.remote.set", { repository: key, url: null }), key);
  assert.deepEqual(syncRecordsOf(home.dataDir, key), { [`sync:${key}:${folder}:last`]: syncedLast, [`sync:${key}:${folder}:noticed`]: true });
  assert.deepEqual(lines(dropped), [[host.url, syncedLast, true]]);
});

test("storage-42, storage-36, storage-34, storage-5, space-57, space-60: two instances over one Git backend, a project other members share placed at the first and synced after the notice; the first signed out, that project's sync follows the second, leaving placements/ holding the second's file, naming the same id, in place of the first's, its remote renamed to the second's folder with the id in its section, and its last sync and notice re-keyed to that remote in the same step", async (t) => {
  const first = await startHost();
  const second = await startHost({ gitBackend: first, displayName: "Second stand-in" });
  const firstFolder = hostFolder(first);
  const secondFolder = hostFolder(second);
  // In the person's namespace, which both list under one id (git-host-12),
  // shared with another member.
  const bob = { id: "1002", login: "bob", displayName: "Bob", role: "Developer" };
  const team = first.script.addRepository({ group: LOGIN, name: "team-spex", members: [bob] });
  const home = await startHome("placement-follow", { host: first, project: false });
  t.after(() => home.stop());
  let from = home.client.mark();
  await signIn(home, first);
  await home.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  await signIn(home, second);
  await refreshed(home);
  const key = hostKey(first, `${LOGIN}/team-spex`);
  const followed = hostKey(second, `${LOGIN}/team-spex`);

  // Placed at the first by its Join, and synced once the notice is seen:
  // its notice and its last sync recorded under the first's remote
  // (space-57, space-22, storage-5).
  from = home.client.mark();
  await home.client.expectOk("space.join", { instance: first.url, hostId: team.id });
  await home.client.waitRepository(from, key, (repository) => repository.state === "reachable" && repository.sync.phase === "idle", 30_000);
  await home.client.expectError("space.sync", { repository: key }, "invalid_request", /sharing notice/);
  const once = await home.client.settle("space.sync", { repository: key, noticed: true }, 30_000);
  const onceLine = placementOf(once, first.url);
  assert.deepEqual([once.sync.phase, onceLine.noticed], ["done", true], JSON.stringify(once.sync));
  assert.deepEqual(syncRecordsOf(home.dataDir, key), { [`sync:${key}:${firstFolder}:last`]: onceLine.lastSync, [`sync:${key}:${firstFolder}:noticed`]: true });
  assert.deepEqual(readdirSync(join(clonePath(home.dataDir, key), "placements")), [`${firstFolder}.yaml`]);

  // The first signed out, its sync follows the second at Check: by its
  // Compare, the clone under the second's folder holds the second's file
  // alone, naming the same id, its remote renamed with the id in its
  // section, and its records under that remote, none left under the
  // first's (storage-36, storage-34, storage-5, space-60).
  await signOut(home, first);
  const clone = clonePath(home.dataDir, followed);
  let atCompare: Record<string, unknown> | undefined;
  home.hooks.beforeStep = async ({ step, repository }) => {
    if (step !== "compare" || repository !== followed || atCompare !== undefined) return;
    const seen: Record<string, unknown> = {
      files: readdirSync(join(clone, "placements")),
      bytes: readFileSync(join(clone, "placements", `${secondFolder}.yaml`), "utf8"),
      remotes: git(clone, "remote").split("\n"),
      id: git(clone, "config", "--get", `remote.${secondFolder}.spexId`),
      records: { ...syncRecordsOf(home.dataDir, key), ...syncRecordsOf(home.dataDir, followed) },
    };
    atCompare = seen;
    const row = await home.client.repository(followed);
    seen.read = [row.instance, row.placements[0]?.instance, row.placements[0]?.lastSync, row.placements[0]?.noticed];
  };
  from = home.client.mark();
  await home.client.expectOk("space.sync", { repository: key });
  const moved = await home.client.waitRepository(from, followed, (repository) => repository.sync.phase !== "running" && repository.sync.phase !== "idle", 30_000);
  home.hooks.beforeStep = undefined;
  const movedLine = placementOf(moved, second.url);
  assert.deepEqual([moved.sync.phase, moved.id, moved.instance, movedLine.noticed], ["done", team.id, second.url, true], JSON.stringify(moved.sync));
  assert.deepEqual(atCompare, {
    files: [`${secondFolder}.yaml`],
    bytes: placementBytes(second.url, team.id),
    remotes: [secondFolder],
    id: team.id,
    records: { [`sync:${followed}:${secondFolder}:last`]: onceLine.lastSync, [`sync:${followed}:${secondFolder}:noticed`]: true },
    read: [second.url, second.url, onceLine.lastSync, true],
  });
  // In one step with the remote's rename: no state the sync broadcast
  // reads the placement without its last sync and notice.
  for (const reading of home.client.readings(from, [key, followed]).filter((candidate) => candidate.sync.phase !== "done")) {
    assert.deepEqual([reading.placements[0]?.lastSync, reading.placements[0]?.noticed], [onceLine.lastSync, true], `${reading.key}: ${JSON.stringify(reading.sync)}`);
  }
  // Its push to the second records its last sync there.
  assert.ok(movedLine.lastSync && onceLine.lastSync && movedLine.lastSync.at >= onceLine.lastSync.at, JSON.stringify(movedLine.lastSync));
  assert.deepEqual({ ...syncRecordsOf(home.dataDir, key), ...syncRecordsOf(home.dataDir, followed) }, { [`sync:${followed}:${secondFolder}:last`]: movedLine.lastSync, [`sync:${followed}:${secondFolder}:noticed`]: true });
  assert.deepEqual(readdirSync(join(clone, "placements")), [`${secondFolder}.yaml`]);
});

/** A clone's remote and host id as a Spex before DR-127 kept them: the
 * remote named `origin`, the id at the top level of its Git
 * configuration. */
function asFormerRemote(clone: string, folder: string): void {
  git(clone, "remote", "rename", folder, "origin");
  const id = git(clone, "config", "--get", "remote.origin.spexId");
  git(clone, "config", "--unset", "remote.origin.spexId");
  git(clone, "config", "spex.repositoryId", id);
}

test("storage-40, storage-37, storage-34, storage-38, space-91, space-97, space-99, space-98: two signed-in format-1 homes, each holding a clone of one spex repository at the stand-in recording the host's id, migrate with that id in each renamed remote's section; each first sync's Save writes placements/<folder>.yaml, which no commit had held, as its three lines, the same bytes on both homes, and the second's merge asks no choice; the repository then placed at a second stand-in from the first home, attached on the second home and its first placement left on the first home, the second home's sync while a live writer holds a session lease beneath its clone merges that file's removal and its drop waits, nothing carried to the first; the sync after the release, whose Save writes no file again, drops the first and moves the clone to its path at the second", async (t) => {
  const host = await startHost();
  const folder = hostFolder(host);
  const file = `placements/${folder}.yaml`;
  // A spex repository a Spex before DR-128 made: no commit of its
  // history holds a placement file.
  const shared = host.script.addRepository({ group: "acme", name: "shared-spex", project: { format: 1, name: "Shared", remote: null } });
  const url = `${host.gitOrigin}/${host.storage}/acme/shared-spex.git`;
  const legacy = "acme/shared-spex";
  const key = hostKey(host, legacy);
  const bytes = placementBytes(host.url, shared.id);

  const homes: Awaited<ReturnType<typeof startHome>>[] = [];
  for (const name of ["migrated-a", "migrated-b"]) {
    // Each home a device of its own, committing as itself.
    const env = otherDevice(name);
    const home = await startHome(name, { host, project: false, env, extra: { signIn: "browser" } });
    const from = home.client.mark();
    await signIn(home, host);
    await home.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
    await home.stop();
    // The home as a Spex before DR-127 left it: `home.yaml` in format 1,
    // the clone keyed by its path in the instance with its remote
    // `origin` and the host's id at the top level, your own group's
    // likewise.
    const clone = clonePath(home.dataDir, legacy);
    mkdirSync(dirname(clone), { recursive: true });
    git(dirname(clone), "clone", "-q", "--branch", "spex", "--single-branch", shared.bare, basename(clone));
    git(clone, "remote", "set-url", "origin", url);
    git(clone, "config", "spex.repositoryId", shared.id);
    asFormerRemote(clonePath(home.dataDir, HOST_OWN), folder);
    const current = Home.load(home.dataDir).file;
    writeFileSync(join(home.dataDir, "home.yaml"), stringifyYaml({
      format: 1, device: current.device,
      host: { url: current.origin, clientId: "spex", account: current.instances[0].account },
      own: current.own, folders: current.folders,
    }));
    const again = await startHome(`${name}-again`, { dataDir: home.dataDir, project: false, env, extra: { signIn: "browser" } });
    t.after(() => again.stop());
    // Migrated: the clone under the stand-in's folder, its remote named
    // by that folder with the host's id in its section, and no placement
    // file yet (storage-30, storage-34).
    const moved = clonePath(home.dataDir, key);
    assert.ok(existsSync(join(moved, ".git")) && !existsSync(clone), "moved under the instance's folder");
    assert.deepEqual(git(moved, "remote").split("\n"), [folder]);
    assert.equal(git(moved, "config", "--get", `remote.${folder}.spexId`), shared.id);
    assert.throws(() => git(moved, "config", "--get", "spex.repositoryId"));
    assert.equal(existsSync(join(moved, "placements")), false);
    homes.push(again);
  }
  const [a, b] = homes;
  const cloneA = clonePath(a.dataDir, key);
  const cloneB = clonePath(b.dataDir, key);

  // The first home's first sync: its Save writes the file no commit held
  // and commits it, and its push carries it to the host (storage-37).
  const syncedA = await a.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(syncedA.sync.phase, "done", JSON.stringify(syncedA.sync));
  assert.equal(readFileSync(join(cloneA, file), "utf8"), bytes);
  assert.equal(`${git(cloneA, "show", `HEAD:${file}`)}\n`, bytes);
  assert.equal(committed(shared.bare, file), bytes);
  const pushedA = git(shared.bare, "rev-parse", "spex");

  // The second home's first sync: its own Save writes and commits the
  // same bytes before it reads the host, and its merge with the first's
  // asks no choice, both sides holding that file alike.
  const syncedB = await b.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(syncedB.sync.phase, "done", JSON.stringify(syncedB.sync));
  assert.deepEqual(syncedB.conflicts, []);
  const [merge, ownSave, theirs] = git(cloneB, "rev-list", "--parents", "-n", "1", "HEAD").split(" ");
  assert.equal(theirs, pushedA, "a merge with the first home's sync");
  assert.equal(`${git(cloneB, "show", `${ownSave}:${file}`)}\n`, bytes, "the second home's Save committed the file itself");
  assert.notEqual(git(cloneB, "rev-parse", `${ownSave}^`), pushedA);
  assert.equal(readFileSync(join(cloneB, file), "utf8"), readFileSync(join(cloneA, file), "utf8"));
  assert.equal(git(shared.bare, "rev-parse", "spex"), merge);
  assert.equal(git(cloneB, "status", "--porcelain"), "");

  // The first home places the repository in a second stand-in's acme,
  // that same operation syncing both (space-97).
  const second = await startHost({ displayName: SECOND_NAME, person: BOB });
  const secondFolder = hostFolder(second);
  const secondFile = `placements/${secondFolder}.yaml`;
  await signIn(a, second);
  const acme = second.script.groups.find((group) => group.kind === "group" && group.fullPath === "acme");
  assert.ok(acme, "the second's acme");
  const placed = await a.client.settle("space.place", { repository: key, choice: { kind: "create", instance: second.url, groupId: acme.id, name: "shared" }, noticed: true }, 30_000);
  assert.equal(placed.sync.phase, "done", JSON.stringify(placed.sync));
  assert.deepEqual(placed.placements.map((line) => [line.instance, line.outcome?.kind]), [[host.url, "synced"], [second.url, "synced"]]);
  const there = second.script.repositories.find((repository) => repository.group.fullPath === "acme" && repository.path === "shared-spex");
  assert.ok(there, "the second created shared-spex in its acme");

  // The second home, signed in at the second, brings that placement's
  // file with its sync and attaches it, syncing both (space-99).
  await signIn(b, second);
  const brought = await b.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(brought.sync.phase, "done", JSON.stringify(brought.sync));
  assert.equal(readFileSync(join(cloneB, secondFile), "utf8"), placementBytes(second.url, there.id));
  assert.deepEqual(brought.placements.map((line) => [line.instance, line.attached]), [[host.url, true], [second.url, false]]);
  const attached = await b.client.settle("space.attach", { repository: key, instance: second.url, noticed: true }, 30_000);
  assert.equal(attached.sync.phase, "done", JSON.stringify(attached.sync));
  assert.deepEqual(attached.placements.map((line) => [line.instance, line.attached, line.outcome?.kind]), [[host.url, true, "synced"], [second.url, true, "synced"]]);
  assert.deepEqual(remotesOf(cloneB), [folder, secondFolder]);
  assert.equal(configOf(cloneB, `remote.${secondFolder}.spexId`), there.id);

  // The first home, holding what the second home sent, leaves the first
  // placement — the clone moving to its path at the second — and its
  // next sync carries the file's removal there (space-98, storage-38).
  assert.equal((await a.client.settle("space.sync", { repository: key }, 30_000)).sync.phase, "done");
  const movedKey = hostKey(second, "acme/shared-spex");
  let mark = a.client.mark();
  assert.deepEqual(await a.client.expectOk("space.leave", { repository: key, instance: host.url }), { accepted: true });
  const leftA = await a.client.waitRepository(mark, movedKey, (repository) => repository.sync.phase !== "running", 30_000);
  assert.deepEqual([leftA.sync, leftA.placements.map((line) => line.instance)], [{ phase: "idle" }, [second.url]], JSON.stringify(leftA));
  const carried = await a.client.settle("space.sync", { repository: movedKey }, 30_000);
  assert.equal(carried.sync.phase, "done", JSON.stringify(carried.sync));
  assert.throws(() => git(there.bare, "cat-file", "-e", `spex:${file}`), "the second holds the first's file no more");

  // The second home syncs while a writer of another process holds its
  // clone: the second's merge brings the removal, and the drop of the
  // first placement — which moves the clone — waits on the lease, the
  // first's line naming the session, the second synced; nothing of the
  // removal reaches the first (space-91, storage-38).
  const sessions = createSessionStore({ sessionsDir: join(cloneB, "sessions") });
  await sessions.prepare();
  const lease = randomUUID();
  const live = await sessions.acquireManagement(lease);
  let released = false;
  let removal = "";
  try {
    const waits = await b.client.settle("space.sync", { repository: key }, 30_000);
    assert.equal(waits.sync.phase, "done", JSON.stringify(waits.sync));
    const withheld = placementOf(waits, host.url).outcome;
    assert.ok(withheld?.kind === "stopped" && withheld.cause === "lease" && withheld.message.includes(lease.slice(0, 8)), JSON.stringify(withheld));
    assert.equal(placementOf(waits, second.url).outcome?.kind, "synced");
    assert.equal(existsSync(join(cloneB, file)), false, "the removal the merge brought stands");
    assert.throws(() => git(cloneB, "cat-file", "-e", `HEAD:${file}`));
    assert.deepEqual(remotesOf(cloneB), [folder, secondFolder], "neither dropped nor moved");
    assert.equal(committed(shared.bare, file), bytes, "nothing carried to the first");
    removal = git(cloneB, "rev-parse", "HEAD");
    await live.release();
    released = true;
  } finally { if (!released) await live.release(); }

  // Released, the next sync's Save, made while the drop still waits,
  // writes no file again, and the drop before the first's turn moves the
  // clone to its path at the second (storage-37, storage-38).
  mark = b.client.mark();
  await b.client.expectOk("space.sync", { repository: key });
  const dropped = await b.client.waitRepository(mark, movedKey, (repository) => repository.sync.phase !== "running" && repository.sync.phase !== "idle", 30_000);
  assert.equal(dropped.sync.phase, "done", JSON.stringify(dropped.sync));
  assert.deepEqual([dropped.instance, dropped.id, dropped.placements.map((line) => line.instance)], [second.url, there.id, [second.url]]);
  const movedB = clonePath(b.dataDir, movedKey);
  assert.ok(existsSync(join(movedB, ".git")) && !existsSync(cloneB), "moved to its path at the second");
  assert.deepEqual(remotesOf(movedB), [secondFolder]);
  assert.equal(existsSync(join(movedB, file)), false);
  assert.equal(git(movedB, "rev-list", "--full-history", `${removal}..HEAD`, "--", file), "", "no Save since the merge wrote the file again");
  assert.equal(committed(shared.bare, file), bytes, "the first's repository left as it stands");
});

test("storage-37, storage-38, space-91: a placement file a commit once held, removed by a peer's commit the sync merges, is not written again by the next Save while that placement's drop waits on a session's lease beneath the clone, which syncs nothing with it; the sync after the release drops it, moving the clone, its last placement gone, under your own group's folder, local only, its pair following", async (t) => {
  const host = await startHost();
  const folder = hostFolder(host);
  const file = `placements/${folder}.yaml`;
  const home = await startHome("held-once", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  let from = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  const code = gitFolder("held");
  const local = await addFolder(home, code);
  from = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local.key, choice: { kind: "create", instance: host.url, groupId: "2002", name: "held" } });
  const key = hostKey(host, "acme/held-spex");
  const created = await home.client.waitRepository(from, key, (repository) => repository.sync.phase === "done", 30_000);
  const clone = clonePath(home.dataDir, key);
  const bare = bareOf(host, key);
  assert.equal(committed(bare, file), placementBytes(host.url, created.id));

  // A writer of another process holds the clone where it is.
  const sessions = createSessionStore({ sessionsDir: join(clone, "sessions") });
  await sessions.prepare();
  const lease = randomUUID();
  const live = await sessions.acquireManagement(lease);
  let released = false;
  try {
    // A peer removes the file; the sync merges that removal, and the drop
    // it brings — the clone's first placement's, which moves the clone —
    // waits on the lease, the placement's line naming the session; the
    // clone and its remote stand (space-91, storage-38).
    const peer = peerClone(bare);
    const removed = await peerPush(peer, (dir) => rmSync(join(dir, file)));
    const merged = await home.client.settle("space.sync", { repository: key }, 30_000);
    assert.ok(merged.sync.phase === "stopped" && merged.sync.cause === "lease" && merged.sync.message.includes(lease.slice(0, 8)), JSON.stringify(merged.sync));
    const line = merged.placements[0];
    assert.ok(line?.outcome?.kind === "stopped" && line.outcome.cause === "lease", JSON.stringify(line?.outcome));
    assert.equal(git(clone, "rev-parse", "HEAD"), removed, "the merge stands");
    assert.equal(existsSync(join(clone, file)), false, "the removal the merge brought stands");
    assert.deepEqual(git(clone, "remote").split("\n"), [folder]);

    // The next Save finds that a commit held the file, and writes nothing;
    // the drop waits still, and nothing is synced with the placement
    // (storage-37, space-91).
    const transports = host.script.transportCredentials.length;
    const again = await home.client.settle("space.sync", { repository: key }, 30_000);
    assert.ok(again.sync.phase === "stopped" && again.sync.cause === "lease", JSON.stringify(again.sync));
    assert.equal(existsSync(join(clone, file)), false);
    assert.throws(() => git(clone, "cat-file", "-e", `HEAD:${file}`));
    assert.throws(() => git(bare, "cat-file", "-e", `spex:${file}`));
    assert.equal(host.script.transportCredentials.length, transports, "nothing fetched from or pushed to the placement");
    assert.deepEqual(git(clone, "remote").split("\n"), [folder]);

    // Released, the next sync drops the placement before its turn: the
    // clone, its last placement gone, moves under your own group's folder,
    // local only, its pair following and this device's records of the
    // placement leaving with it (storage-38, storage-5).
    await live.release();
    released = true;
    const ownKey = `${LOGIN}/held-spex`;
    from = home.client.mark();
    await home.client.expectOk("space.sync", { repository: key });
    const dropped = await home.client.waitRepository(from, ownKey, (repository) => repository.sync.phase !== "running" && repository.sync.phase !== "idle", 30_000);
    assert.deepEqual([dropped.sync.phase, dropped.state, dropped.placements, dropped.id], ["done", "local-only", [], null], JSON.stringify(dropped.sync));
    const ownClone = clonePath(home.dataDir, ownKey);
    assert.ok(existsSync(join(ownClone, ".git")) && !existsSync(clone), "moved under your own group's folder");
    assert.equal(git(ownClone, "remote"), "");
    assert.equal(git(ownClone, "rev-parse", "HEAD"), removed, "its records kept");
    assert.equal(Home.load(home.dataDir).keyForFolder(code), ownKey);
    assert.deepEqual({ ...syncRecordsOf(home.dataDir, key), ...syncRecordsOf(home.dataDir, ownKey) }, {});
    assert.equal(git(bare, "rev-parse", "spex"), removed, "the host's repository is left as it stands");
  } finally { if (!released) await live.release(); }
});

test("space-91, storage-38: a lone placement's file deleted by hand on this device is the proposal to drop it: the next sync's Save commits the deletion and the drop before its turn moves the clone, its last placement gone, under your own group's folder, local only, its pair following, nothing sent to the host", async (t) => {
  const host = await startHost();
  const folder = hostFolder(host);
  const file = `placements/${folder}.yaml`;
  const home = await startHome("dropped-by-hand", { host, project: false });
  t.after(() => home.stop());
  let from = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  const code = gitFolder("lone");
  const local = await addFolder(home, code);
  from = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local.key, choice: { kind: "create", instance: host.url, groupId: "2002", name: "lone" } });
  const key = hostKey(host, "acme/lone-spex");
  const created = await home.client.waitRepository(from, key, (repository) => repository.sync.phase === "done", 30_000);
  const clone = clonePath(home.dataDir, key);
  const bare = bareOf(host, key);
  assert.equal(committed(bare, file), placementBytes(host.url, created.id));
  const atHost = git(bare, "rev-parse", "spex");

  // The reader deletes the file; the next sync's Save commits that, and
  // the placement is dropped before its turn: the clone moves under your
  // own group's folder, local only, its records and pair with it, and
  // the deletion never reaches the host (space-91, storage-38).
  rmSync(join(clone, file));
  const transports = host.script.transportCredentials.length;
  const ownKey = `${LOGIN}/lone-spex`;
  from = home.client.mark();
  await home.client.expectOk("space.sync", { repository: key });
  const dropped = await home.client.waitRepository(from, ownKey, (repository) => repository.sync.phase !== "running" && repository.sync.phase !== "idle", 30_000);
  assert.deepEqual([dropped.state, dropped.placements, dropped.id], ["local-only", [], null], JSON.stringify(dropped.sync));
  const ownClone = clonePath(home.dataDir, ownKey);
  assert.ok(existsSync(join(ownClone, ".git")) && !existsSync(clone), "moved under your own group's folder");
  assert.equal(git(ownClone, "remote"), "");
  assert.throws(() => git(ownClone, "cat-file", "-e", `HEAD:${file}`), "the Save committed the deletion");
  assert.equal(existsSync(join(ownClone, file)), false);
  assert.equal(Home.load(home.dataDir).keyForFolder(code), ownKey);
  assert.deepEqual({ ...syncRecordsOf(home.dataDir, key), ...syncRecordsOf(home.dataDir, ownKey) }, {});
  assert.equal(host.script.transportCredentials.length, transports, "nothing fetched from or pushed to the host");
  assert.equal(git(bare, "rev-parse", "spex"), atHost, "the host's repository is left as it stands");
});

test("storage-39, storage-36, storage-34, storage-1, storage-31, storage-6, storage-38, storage-5, storage-11, storage-12, storage-41, storage-35, space-97, space-98, space-99, space-63, space-5: a project created in the first's acme and placed in the second's on separate Git backends, joined on a second home signed in at the second alone and renamed by the second, is left placement by placement — refused under a live writer's lease naming the session and in a restarted core whose read of the second fails naming the second, then moved to the second's path with its pair, session, records and exports, and local only at the last — while the second home leaves its one placement and attaches the first's from its file", async (t) => {
  const first = await startHost();
  const second = await startHost({ displayName: SECOND_NAME, person: BOB });
  const firstFolder = hostFolder(first);
  const secondFolder = hostFolder(second);
  const firstFile = `placements/${firstFolder}.yaml`;
  const secondFile = `placements/${secondFolder}.yaml`;
  const home = await startHome("end-to-end", { host: first, project: false });
  t.after(() => home.stop());

  // Your own group's sign-in at each instance writes each placement's
  // file as its three lines, its remote named by that instance's folder
  // with the host's id in its section, in the order added; its own
  // repository keeps its folder and reads as the first's, where it was
  // first placed (storage-36, storage-34, storage-1, storage-31).
  let mark = home.client.mark();
  await signIn(home, first);
  const own = await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  const ownClone = clonePath(home.dataDir, HOST_OWN);
  const ownFirstBytes = readFileSync(join(ownClone, firstFile), "utf8");
  assert.equal(ownFirstBytes, placementBytes(first.url, own.id));
  mark = home.client.mark();
  await signIn(home, second);
  await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase !== "running" && repository.placements[1]?.outcome?.kind === "waiting", 30_000);
  const bobSpex = second.script.repositories.find((repository) => repository.group.fullPath === BOB.login && repository.path === `${BOB.login}-spex`);
  assert.ok(bobSpex, "the sign-in created bob-spex at the second");
  const ownBoth = await home.client.settle("space.sync", { repository: HOST_OWN, placement: second.url, noticed: true }, 30_000);
  assert.equal(ownBoth.sync.phase, "done", JSON.stringify(ownBoth.sync));
  const ownSecondBytes = readFileSync(join(ownClone, secondFile), "utf8");
  assert.equal(ownSecondBytes, placementBytes(second.url, bobSpex.id));
  assert.deepEqual(remotesOf(ownClone), [firstFolder, secondFolder]);
  assert.deepEqual([configOf(ownClone, `remote.${firstFolder}.spexId`), configOf(ownClone, `remote.${secondFolder}.spexId`)], [own.id, bobSpex.id]);
  assert.deepEqual([ownBoth.key, ownBoth.instance, ownBoth.placements.map((line) => [line.instance, line.id])], [HOST_OWN, first.url, [[first.url, own.id], [second.url, bobSpex.id]]]);

  // A project created in the first's acme: keyed under the first's
  // folder, read as the first's, its file written and its environment
  // exported into its working folder (storage-36, storage-1, storage-31).
  const code = gitFolder("atlas");
  const { key: local } = await addFolder(home, code);
  mark = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: first.url, groupId: "2002", name: "atlas" } });
  const key = hostKey(first, "acme/atlas-spex");
  const created = await home.client.waitRepository(mark, key, (repository) => repository.sync.phase === "done", 30_000);
  const id1 = created.id as string;
  const clone = clonePath(home.dataDir, key);
  const firstBare = bareOf(first, key);
  assert.ok(key.startsWith(`${firstFolder}/`), key);
  assert.equal(created.instance, first.url);
  const firstBytes = readFileSync(join(clone, firstFile), "utf8");
  assert.equal(firstBytes, placementBytes(first.url, id1));
  assert.deepEqual(remotesOf(clone), [firstFolder]);
  assert.equal(configOf(clone, `remote.${firstFolder}.spexId`), id1);
  const exported = join(code, ".claude", "skills", "code", "SKILL.md");
  assert.ok(await eventually(exported), "its environment exported into its working folder");
  const sessionId = await runTurn(home, key, "Chart the atlas");

  // A remote the reader names is `origin`, written to no file (storage-36,
  // space-5).
  await home.client.expectOk("space.remote.set", { repository: key, url: bareRepo() });
  assert.deepEqual(remotesOf(clone), [firstFolder, "origin"]);
  assert.deepEqual(readdirSync(join(clone, "placements")), [`${firstFolder}.yaml`]);

  // Placed in the second's acme: its remote added after `origin`, read
  // in the order added with `origin` last; its file written beside the
  // first's, none for `origin`; each placement's last sync recorded
  // apart, and the notice its Place saw (space-97, storage-36,
  // storage-34, storage-5).
  const acme = second.script.groups.find((group) => group.kind === "group" && group.fullPath === "acme");
  assert.ok(acme, "the second's acme");
  const placed = await home.client.settle("space.place", { repository: key, choice: { kind: "create", instance: second.url, groupId: acme.id, name: "atlas" }, noticed: true }, 30_000);
  assert.equal(placed.sync.phase, "done", JSON.stringify(placed.sync));
  const there = second.script.repositories.find((repository) => repository.group.fullPath === "acme" && repository.path === "atlas-spex");
  assert.ok(there, "the second created atlas-spex in its acme");
  const id2 = there.id;
  assert.deepEqual(placed.placements.map((line) => [line.instance, line.id, line.outcome?.kind]), [[first.url, id1, "synced"], [second.url, id2, "synced"], [null, null, "synced"]]);
  assert.deepEqual(remotesOf(clone), [firstFolder, "origin", secondFolder]);
  assert.deepEqual([configOf(clone, `remote.${firstFolder}.spexId`), configOf(clone, `remote.${secondFolder}.spexId`), configOf(clone, "remote.origin.spexId")], [id1, id2, null]);
  const secondBytes = readFileSync(join(clone, secondFile), "utf8");
  assert.equal(secondBytes, placementBytes(second.url, id2));
  assert.deepEqual(readdirSync(join(clone, "placements")).sort(), [`${firstFolder}.yaml`, `${secondFolder}.yaml`].sort());
  assert.deepEqual([committed(there.bare, firstFile), committed(there.bare, secondFile)], [firstBytes, secondBytes]);
  const records = syncRecordsOf(home.dataDir, key);
  assert.deepEqual(Object.keys(records).sort(), [`sync:${key}:${firstFolder}:last`, `sync:${key}:${secondFolder}:last`, `sync:${key}:${secondFolder}:noticed`, `sync:${key}:origin:last`].sort());
  assert.deepEqual(placed.placements.map((line) => [line.lastSync, line.noticed]), [
    [records[`sync:${key}:${firstFolder}:last`], false],
    [records[`sync:${key}:${secondFolder}:last`], true],
    [records[`sync:${key}:origin:last`], false],
  ]);
  // `origin` removed again, with its record (space-5, storage-5).
  const unpathed = repositoryOf(await home.client.expectOk("space.remote.set", { repository: key, url: null }), key);
  assert.deepEqual(remotesOf(clone), [firstFolder, secondFolder]);
  assert.deepEqual(unpathed.placements.map((line) => line.instance), [first.url, second.url]);
  assert.equal(syncRecordsOf(home.dataDir, key)[`sync:${key}:origin:last`], undefined);

  // A second home signed in at the second alone: its sign-in joins your
  // own group's own repository there, and its join of the project, each
  // writing the very bytes of that placement's file the first home wrote
  // (storage-36, space-63). The home is made with the first's origin, as
  // the first home was, so its own group's bootstrap locks the built-in
  // at the same registry and its sign-in's join asks no choice (space-59).
  const other = await startHome("end-to-end-other", { host: first, project: false });
  t.after(() => other.stop());
  const otherOwn = `${BOB.login}/${BOB.login}-spex`;
  mark = other.client.mark();
  await signIn(other, second);
  const otherOwnRow = await other.client.waitRepository(mark, otherOwn, (repository) => repository.sync.phase !== "running" && repository.sync.phase !== "idle", 30_000);
  assert.equal(otherOwnRow.sync.phase, "done", JSON.stringify(otherOwnRow.sync));
  assert.equal(readFileSync(join(clonePath(other.dataDir, otherOwn), secondFile), "utf8"), ownSecondBytes);
  mark = other.client.mark();
  await other.client.expectOk("space.join", { instance: second.url, hostId: id2 });
  const otherKey = hostKey(second, "acme/atlas-spex");
  const joined = await other.client.waitRepository(mark, otherKey, (repository) => repository.state === "reachable" && repository.sync.phase === "idle", 30_000);
  const otherClone = clonePath(other.dataDir, otherKey);
  assert.equal(readFileSync(join(otherClone, secondFile), "utf8"), secondBytes);
  assert.equal(git(otherClone, "status", "--porcelain", "--", "placements"), "", "the same bytes as committed");
  assert.deepEqual(remotesOf(otherClone), [secondFolder]);
  assert.equal(configOf(otherClone, `remote.${secondFolder}.spexId`), id2);
  assert.deepEqual(joined.placements.map((line) => [line.instance, line.attached]), [[second.url, true]]);

  // A peer at the first adds a placement file of its encoding for an
  // instance no home lists, one not of its encoding and a meta.yaml: each
  // is a unit of its own, `placements/` forming no spec package; the
  // unreadable ones are reported, naming no placement and blocking
  // nothing else, the sync carrying each to the second (storage-11,
  // storage-12, storage-41).
  const elsewhere = "placements/@elsewhere.example.yaml";
  const junk = "placements/@junk.example.yaml";
  const meta = "placements/meta.yaml";
  await peerPush(peerClone(firstBare), (dir) => {
    writeFileSync(join(dir, elsewhere), placementBytes("https://elsewhere.example", "4242"));
    writeFileSync(join(dir, junk), "instance: https://junk.example\n");
    writeFileSync(join(dir, meta), "name: placements\nversion: 1.0.0\n");
  });
  const checked = await home.client.settle("space.fetch", { repository: key }, 30_000);
  assert.deepEqual(units(placementOf(checked, first.url).incoming).sort(), [elsewhere, junk, meta].sort());
  assert.deepEqual(units(placementOf(checked, second.url).incoming), []);
  const merged = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(merged.sync.phase, "done", JSON.stringify(merged.sync));
  assert.deepEqual(merged.placements.map((line) => [line.instance, line.attached, line.outcome?.kind]), [[first.url, true, "synced"], [second.url, true, "synced"]]);
  for (const file of [elsewhere, junk, meta]) assert.ok(existsSync(join(clone, file)) && git(there.bare, "cat-file", "-t", `spex:${file}`) === "blob", file);
  const diagnostics = await home.client.expectOk("storage.diagnostics", {});
  assert.deepEqual(
    diagnostics.filter((diagnostic) => diagnostic.file.startsWith(join(clone, "placements"))).map((diagnostic) => [relative(clone, diagnostic.file), diagnostic.reason, diagnostic.blocking]),
    [
      [junk, "does not read as format: 1, instance and id, one line each", false],
      [meta, "does not read as format: 1, instance and id, one line each", false],
    ],
  );

  // The second renames that placement's repository: the next sync takes
  // its new URL there, the remote keeping its name and its place, and
  // moves no clone (storage-6, storage-34).
  second.script.rename(id2, { name: "atlas-two-spex" });
  const renamed = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(renamed.sync.phase, "done", JSON.stringify(renamed.sync));
  assert.deepEqual([renamed.key, renamed.instance], [key, first.url]);
  assert.ok(existsSync(join(clone, ".git")) && !existsSync(clonePath(home.dataDir, hostKey(second, "acme/atlas-two-spex"))), "no clone moved");
  assert.deepEqual(remotesOf(clone), [firstFolder, secondFolder]);
  assert.match(configOf(clone, `remote.${secondFolder}.url`) ?? "", /\/acme\/atlas-two-spex\.git$/);
  assert.equal(configOf(clone, `remote.${secondFolder}.spexId`), id2);
  assert.deepEqual(renamed.placements.map((line) => [line.instance, line.path, line.outcome?.kind]), [[first.url, "acme/atlas-spex", "synced"], [second.url, "acme/atlas-two-spex", "synced"]]);
  assert.equal(readFileSync(join(clone, secondFile), "utf8"), secondBytes);

  // A former record of the repository reads as its first placement's
  // (storage-5).
  const secondLast = syncRecordsOf(home.dataDir, key)[`sync:${key}:${secondFolder}:last`];
  assert.ok(secondLast, "the second's last sync");
  const earlier = { at: 1, sent: 2, received: 3 };
  rewritePrefs(home.dataDir, (prefs) => {
    delete prefs[`sync:${key}:${firstFolder}:last`];
    delete prefs[`sync:${key}:${firstFolder}:noticed`];
    prefs[`sync:${key}:last`] = earlier;
    prefs[`sync:${key}:noticed`] = true;
  });
  const former = await home.client.repository(key);
  assert.deepEqual(former.placements.map((line) => [line.instance, line.lastSync, line.noticed]), [[first.url, earlier, true], [second.url, secondLast, true]]);

  // The clone as it stands while the first placement's leave is refused.
  const standing = (why: string): void => {
    assert.ok(existsSync(join(clone, ".git")), `${why}: the clone stays`);
    assert.deepEqual(remotesOf(clone), [firstFolder, secondFolder], `${why}: its remotes stay`);
    assert.ok(existsSync(join(clone, firstFile)), `${why}: its file stays`);
    assert.equal(Home.load(home.dataDir).keyForFolder(code), key, `${why}: its pair stays`);
  };

  // The first placement left while a writer of another process holds the
  // clone: refused whole, naming the session (storage-38).
  const sessions = createSessionStore({ sessionsDir: join(clone, "sessions") });
  await sessions.prepare();
  const lease = randomUUID();
  const live = await sessions.acquireManagement(lease);
  let released = false;
  try {
    const leased = await home.client.settle("space.leave", { repository: key, instance: first.url }, 30_000);
    assert.ok(leased.sync.phase === "stopped" && leased.sync.op === "leave" && leased.sync.cause === "lease" && leased.sync.retry && leased.sync.message.includes(lease.slice(0, 8)), JSON.stringify(leased.sync));
    standing("under the lease");
    await live.release();
    released = true;
  } finally { if (!released) await live.release(); }

  // Left again in a restarted core whose read of the second fails: the
  // second placement's path there unread this run, refused naming the
  // second (storage-38).
  await home.stop();
  const again = await startHome("end-to-end-again", { dataDir: home.dataDir, project: false });
  t.after(() => again.stop());
  second.script.unavailable(1);
  mark = again.client.mark();
  await again.client.expectOk("space.get", {});
  await again.client.waitSpace(mark, (state) => (instanceOf(state, first.url)?.readAt ?? null) !== null && instanceOf(state, first.url)?.read.phase === "idle" && instanceOf(state, second.url)?.read.phase === "failed", 30_000);
  const unread = await again.client.settle("space.leave", { repository: key, instance: first.url }, 30_000);
  assert.deepEqual(unread.sync, { phase: "stopped", op: "leave", step: "check", cause: "unreachable", message: `${SECOND_NAME} is not read yet, so the clone cannot move to its path there`, guidance: "Refresh, then Retry.", retry: true });
  standing("the second unread");

  // The second read, the first placement left: dropped with its records
  // and the former ones, its file deleted, and the clone moved to the
  // second's path there, its pair, its session, the second's records and
  // its environment's exports following it (storage-38, storage-5).
  await refreshed(again);
  rmSync(join(code, ".claude", "skills", "code"), { recursive: true, force: true });
  const movedKey = hostKey(second, "acme/atlas-two-spex");
  const movedClone = clonePath(home.dataDir, movedKey);
  mark = again.client.mark();
  assert.deepEqual(await again.client.expectOk("space.leave", { repository: key, instance: first.url }), { accepted: true });
  const moved = await again.client.waitRepository(mark, movedKey, (repository) => repository.sync.phase !== "running", 30_000);
  assert.deepEqual([moved.sync, moved.instance, moved.id, moved.placements.map((line) => line.instance)], [{ phase: "idle" }, second.url, id2, [second.url]], JSON.stringify(moved));
  assert.ok(existsSync(join(movedClone, ".git")) && !existsSync(clone), "moved to its path at the second");
  assert.deepEqual(remotesOf(movedClone), [secondFolder]);
  assert.equal(existsSync(join(movedClone, firstFile)), false, "its file deleted");
  assert.equal(Home.load(home.dataDir).keyForFolder(code), movedKey, "its pair follows");
  assert.ok((await again.client.expectOk("session.list", {})).some((session) => session.id === sessionId && session.projectId === movedKey), "its session follows");
  assert.deepEqual({ ...syncRecordsOf(home.dataDir, key), ...syncRecordsOf(home.dataDir, movedKey) }, { [`sync:${movedKey}:${secondFolder}:last`]: secondLast, [`sync:${movedKey}:${secondFolder}:noticed`]: true });
  await again.client.waitFor((message) => again.client.messages.indexOf(message) >= mark && message.type === "environment.state" && message.repository === movedKey && message.state.busy === null, 30_000);
  assert.ok(existsSync(exported), "its exports written again from where it moved");
  assert.equal((await again.client.expectOk("environment.get", { repository: movedKey })).repository, movedKey);
  await again.client.expectError("environment.get", { repository: key }, "not_found");

  // The last placement left, confirmed: the clone moves under your own
  // group's folder, local only, with its pair, session and no record of
  // a placement left; a remote then named through space.remote.set makes
  // it local only no more, written to no file (storage-38, storage-34,
  // storage-36, storage-5).
  const localKey = `${LOGIN}/atlas-two-spex`;
  const localClone = clonePath(home.dataDir, localKey);
  mark = again.client.mark();
  assert.deepEqual(await again.client.expectOk("space.leave", { repository: movedKey, instance: second.url, confirmed: true }), { accepted: true });
  const left = await again.client.waitRepository(mark, localKey, (repository) => repository.sync.phase !== "running", 30_000);
  assert.deepEqual([left.sync, left.state, left.instance, left.id, left.placements], [{ phase: "idle" }, "local-only", null, null, []], JSON.stringify(left));
  assert.ok(existsSync(join(localClone, ".git")) && !existsSync(movedClone), "moved under your own group's folder");
  assert.equal(Home.load(home.dataDir).keyForFolder(code), localKey);
  assert.ok((await again.client.expectOk("session.list", {})).some((session) => session.id === sessionId && session.projectId === localKey));
  assert.deepEqual(remotesOf(localClone), []);
  assert.equal(existsSync(join(localClone, secondFile)), false, "its file deleted");
  assert.deepEqual({ ...syncRecordsOf(home.dataDir, movedKey), ...syncRecordsOf(home.dataDir, localKey) }, {});
  const filesLeft = readdirSync(join(localClone, "placements")).sort();
  const pathed = repositoryOf(await again.client.expectOk("space.remote.set", { repository: localKey, url: bareRepo() }), localKey);
  assert.notEqual(pathed.state, "local-only");
  assert.deepEqual(pathed.placements.map((line) => [line.instance, line.attached]), [[null, true]]);
  assert.deepEqual(remotesOf(localClone), ["origin"]);
  assert.deepEqual(readdirSync(join(localClone, "placements")).sort(), filesLeft, "no file for the remote the reader names");

  // The second home leaves its one placement, confirmed: its clone local
  // only under your own group's folder, holding the first's file; signed
  // in at the first — your own group's own repository there writing the
  // first home's bytes — that file offers the first's placement, and its
  // Attach moves the clone under the first's folder at the repository's
  // path there and syncs it (storage-35, space-98, space-99, storage-36).
  const otherLocal = `${BOB.login}/atlas-spex`;
  const otherLocalClone = clonePath(other.dataDir, otherLocal);
  mark = other.client.mark();
  assert.deepEqual(await other.client.expectOk("space.leave", { repository: otherKey, instance: second.url, confirmed: true }), { accepted: true });
  const otherLeft = await other.client.waitRepository(mark, otherLocal, (repository) => repository.sync.phase !== "running", 30_000);
  assert.deepEqual([otherLeft.sync, otherLeft.state, otherLeft.placements], [{ phase: "idle" }, "local-only", []], JSON.stringify(otherLeft));
  assert.ok(existsSync(join(otherLocalClone, ".git")) && !existsSync(otherClone));
  assert.equal(readFileSync(join(otherLocalClone, firstFile), "utf8"), firstBytes);
  assert.equal(existsSync(join(otherLocalClone, secondFile)), false);
  mark = other.client.mark();
  await signIn(other, first);
  await other.client.waitRepository(mark, otherOwn, (repository) => repository.sync.phase !== "running" && repository.placements.some((line) => line.instance === first.url && line.outcome?.kind === "waiting"), 30_000);
  assert.equal(readFileSync(join(clonePath(other.dataDir, otherOwn), firstFile), "utf8"), ownFirstBytes);
  const offered = await other.client.repository(otherLocal);
  assert.deepEqual(offered.placements.map((line) => [line.instance, line.attached, line.state]), [[first.url, false, "absent"]]);
  const attachedKey = hostKey(first, "acme/atlas-spex");
  const attachedClone = clonePath(other.dataDir, attachedKey);
  mark = other.client.mark();
  assert.deepEqual(await other.client.expectOk("space.attach", { repository: otherLocal, instance: first.url, noticed: true }), { accepted: true });
  assert.ok(existsSync(join(attachedClone, ".git")) && !existsSync(otherLocalClone), "moved under the first's folder as the reply came");
  const attached = await other.client.waitRepository(mark, attachedKey, (repository) => repository.sync.phase !== "running" && repository.sync.phase !== "idle", 30_000);
  assert.equal(attached.sync.phase, "done", JSON.stringify(attached.sync));
  assert.deepEqual([attached.state, attached.instance, attached.placements.map((line) => [line.instance, line.attached, line.outcome?.kind])], ["reachable", first.url, [[first.url, true, "synced"]]]);
  assert.deepEqual(remotesOf(attachedClone), [firstFolder]);
  assert.equal(configOf(attachedClone, `remote.${firstFolder}.spexId`), id1);
  assert.equal(readFileSync(join(attachedClone, firstFile), "utf8"), firstBytes);
  assert.equal(git(firstBare, "rev-parse", "spex"), git(attachedClone, "rev-parse", "HEAD"));
});

test("storage-38, space-98, space-15: a Leave of the first placement whose remote Git refuses to remove — the clone's configuration locked — stops at Check in Git's words, the clone, its remote, its file and its pair where they were; once Git can, the same Leave drops it and moves the clone under your own group's folder, local only", async (t) => {
  const host = await startHost();
  const folder = hostFolder(host);
  const file = `placements/${folder}.yaml`;
  const home = await startHome("drop-refused", { host, project: false });
  t.after(() => home.stop());
  let from = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  const code = gitFolder("locked");
  const local = await addFolder(home, code);
  from = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local.key, choice: { kind: "create", instance: host.url, groupId: "2002", name: "locked" } });
  const key = hostKey(host, "acme/locked-spex");
  await home.client.waitRepository(from, key, (repository) => repository.sync.phase === "done", 30_000);
  const clone = clonePath(home.dataDir, key);
  const ownKey = `${LOGIN}/locked-spex`;
  const ownClone = clonePath(home.dataDir, ownKey);

  // Git cannot write the clone's configuration while its lock stands:
  // the removal is refused, the Leave stops in Git's words with Retry,
  // and the clone is neither dropped nor moved (storage-38, space-15).
  const lock = join(clone, ".git", "config.lock");
  writeFileSync(lock, "");
  from = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.leave", { repository: key, instance: host.url, confirmed: true }), { accepted: true });
  const stopped = await home.client.waitRepository(from, key, (repository) => repository.sync.phase === "stopped", 30_000);
  assert.ok(stopped.sync.phase === "stopped" && stopped.sync.op === "leave" && stopped.sync.step === "check" && stopped.sync.cause === "git" && stopped.sync.retry, JSON.stringify(stopped.sync));
  assert.match(stopped.sync.message, /lock/i);
  assert.deepEqual([stopped.placements.length, placementOf(stopped, host.url).attached], [1, true]);
  assert.ok(existsSync(join(clone, ".git")) && !existsSync(ownClone), "the clone stays where it was");
  assert.deepEqual(remotesOf(clone), [folder]);
  assert.ok(existsSync(join(clone, file)), "its file kept");
  assert.equal(Home.load(home.dataDir).keyForFolder(code), key, "its pair kept");

  // The lock gone, the same Leave drops the placement and moves the
  // clone, its last placement gone, under your own group's folder, local
  // only, its pair following (storage-38, space-98).
  rmSync(lock);
  from = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.leave", { repository: key, instance: host.url, confirmed: true }), { accepted: true });
  const left = await home.client.waitRepository(from, ownKey, (repository) => repository.sync.phase !== "running", 30_000);
  assert.deepEqual([left.state, left.placements, left.sync.phase], ["local-only", [], "idle"], JSON.stringify(left.sync));
  assert.ok(existsSync(join(ownClone, ".git")) && !existsSync(clone), "moved under your own group's folder");
  assert.equal(git(ownClone, "remote"), "");
  assert.equal(existsSync(join(ownClone, file)), false, "its file deleted");
  assert.equal(Home.load(home.dataDir).keyForFolder(code), ownKey);
});
