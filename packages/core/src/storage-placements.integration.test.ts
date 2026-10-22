// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A spex repository's placements in its clone's tracked files
// (storage-36, storage-41, DR-128): real cores on scratch homes against
// the stand-in Git host, each act that creates or joins a placement
// writing its file as its three lines, the same bytes on every home, a
// file that does not read naming no placement and blocking nothing —
// hermetic, on loopback alone, in a file budget of its own.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { bareOf, clonePath, createSpaceHarness, hostFolder, hostKey } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
const { git, gitFolder, bareRepo, addFolder, startHome, startHost, signIn } = fixture;
test.after(() => fixture.dispose());

/** The stand-in's person, and your own group's repository once signed in. */
const LOGIN = "ada";
const HOST_OWN = `${LOGIN}/${LOGIN}-spex`;

/** A placement file's bytes, as storage-36 spells them out. */
const placementBytes = (origin: string, id: string | null): string => `format: 1\ninstance: "${origin}"\nid: "${id ?? ""}"\n`;

/** A file as a bare repository's `spex` holds it. */
const committed = (bare: string, path: string): string => `${git(bare, "show", `spex:${path}`)}\n`;

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
