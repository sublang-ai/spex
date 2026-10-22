// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A spex repository's placements in its clone's tracked files
// (storage-36, storage-41, DR-128): real cores on scratch homes against
// the stand-in Git host, each act that creates or joins a placement
// writing its file as its three lines, the same bytes on every home, a
// file that does not read naming no placement and blocking nothing, and
// a migrated clone's first sync writing each placement's file no commit
// held (storage-37); and this device's last sync and notice recorded per
// placement, following its remote (storage-5) — hermetic, on loopback
// alone, in a file budget of its own.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { createSessionStore } from "@sublang/playbook/session-store";
import { stringify as stringifyYaml } from "yaml";
import { Home } from "./home.js";
import type { GroupsState } from "./protocol.js";
import { bareOf, clonePath, createSpaceHarness, hostFolder, hostKey, instanceOf, prefsOf, repositoryOf, syncRecordsOf } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
const { git, gitFolder, bareRepo, addFolder, otherDevice, peerClone, peerPush, startHome, startHost, signIn, signOut } = fixture;
test.after(() => fixture.dispose());

/** The stand-in's person, and your own group's repository once signed in. */
const LOGIN = "ada";
const HOST_OWN = `${LOGIN}/${LOGIN}-spex`;

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
  const former = viaPath.lastSync;
  assert.ok(former);
  assert.deepEqual(syncRecordsOf(home.dataDir, local.key), { [`sync:${local.key}:origin:last`]: former });
  rewritePrefs(home.dataDir, (prefs) => {
    delete prefs[`sync:${local.key}:origin:last`];
    prefs[`sync:${local.key}:last`] = former;
  });
  const pathOnly = await home.client.repository(local.key);
  assert.deepEqual([pathOnly.lastSync, lines(pathOnly)], [former, [[null, former, false]]]);

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
  assert.ok(picked.lastSync && picked.lastSync.at > former.at, JSON.stringify(picked.lastSync));
  assert.deepEqual(syncRecordsOf(home.dataDir, key), { [`sync:${key}:${folder}:last`]: picked.lastSync, [`sync:${key}:origin:last`]: former });
  assert.deepEqual(syncRecordsOf(home.dataDir, local.key), {});
  assert.deepEqual(lines(picked), [[host.url, picked.lastSync, false], [null, former, false]]);

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
  assert.deepEqual([reread.lastSync, reread.noticed, lines(reread)], [earlier, true, [[host.url, earlier, true], [null, former, false]]]);
  const synced = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(synced.sync.phase, "done", JSON.stringify(synced.sync));
  assert.ok(synced.lastSync && synced.lastSync.at > earlier.at, JSON.stringify(synced.lastSync));
  const pathSynced = synced.placements[1].lastSync;
  assert.ok(pathSynced && pathSynced.at > former.at, JSON.stringify(pathSynced));
  assert.deepEqual(syncRecordsOf(home.dataDir, key), {
    [`sync:${key}:${folder}:last`]: synced.lastSync,
    [`sync:${key}:${folder}:noticed`]: true,
    [`sync:${key}:origin:last`]: pathSynced,
  });
  assert.deepEqual([synced.noticed, lines(synced)], [true, [[host.url, synced.lastSync, true], [null, pathSynced, false]]]);

  // The path placement dropped takes its own record alone (space-5).
  const dropped = repositoryOf(await home.client.expectOk("space.remote.set", { repository: key, url: null }), key);
  assert.deepEqual(syncRecordsOf(home.dataDir, key), { [`sync:${key}:${folder}:last`]: synced.lastSync, [`sync:${key}:${folder}:noticed`]: true });
  assert.deepEqual(lines(dropped), [[host.url, synced.lastSync, true]]);
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
  assert.deepEqual([once.sync.phase, once.noticed], ["done", true], JSON.stringify(once.sync));
  assert.deepEqual(syncRecordsOf(home.dataDir, key), { [`sync:${key}:${firstFolder}:last`]: once.lastSync, [`sync:${key}:${firstFolder}:noticed`]: true });
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
    seen.read = [row.instance, row.lastSync, row.noticed, row.placements[0]?.instance, row.placements[0]?.lastSync, row.placements[0]?.noticed];
  };
  from = home.client.mark();
  await home.client.expectOk("space.sync", { repository: key });
  const moved = await home.client.waitRepository(from, followed, (repository) => repository.sync.phase !== "running" && repository.sync.phase !== "idle", 30_000);
  home.hooks.beforeStep = undefined;
  assert.deepEqual([moved.sync.phase, moved.id, moved.instance, moved.noticed], ["done", team.id, second.url, true], JSON.stringify(moved.sync));
  assert.deepEqual(atCompare, {
    files: [`${secondFolder}.yaml`],
    bytes: placementBytes(second.url, team.id),
    remotes: [secondFolder],
    id: team.id,
    records: { [`sync:${followed}:${secondFolder}:last`]: once.lastSync, [`sync:${followed}:${secondFolder}:noticed`]: true },
    read: [second.url, once.lastSync, true, second.url, once.lastSync, true],
  });
  // In one step with the remote's rename: no state the sync broadcast
  // reads the placement without its last sync and notice.
  for (const reading of home.client.readings(from, [key, followed]).filter((candidate) => candidate.sync.phase !== "done")) {
    assert.deepEqual([reading.lastSync, reading.noticed, reading.placements[0]?.lastSync, reading.placements[0]?.noticed], [once.lastSync, true, once.lastSync, true], `${reading.key}: ${JSON.stringify(reading.sync)}`);
  }
  // Its push to the second records its last sync there.
  assert.ok(moved.lastSync && once.lastSync && moved.lastSync.at >= once.lastSync.at, JSON.stringify(moved.lastSync));
  assert.deepEqual({ ...syncRecordsOf(home.dataDir, key), ...syncRecordsOf(home.dataDir, followed) }, { [`sync:${followed}:${secondFolder}:last`]: moved.lastSync, [`sync:${followed}:${secondFolder}:noticed`]: true });
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

test("storage-37, storage-34: two signed-in format-1 homes, each holding a clone of one spex repository at the stand-in recording the host's id, migrate with that id in each renamed remote's section; each first sync's Save writes placements/<folder>.yaml, which no commit had held, as its three lines, the same bytes on both homes, and the second's merge asks no choice", async (t) => {
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
