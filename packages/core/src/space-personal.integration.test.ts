// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { encodePlacementFile, PLACEMENTS_DIR } from "./placements.js";
import { clonePath, createSpaceHarness, hostFolder, hostKey, instanceOf, placementOf } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
const { git, gitFolder, addFolder, startHome, startHost, signIn, peerClone, peerPush } = fixture;
const globalRecords = "ada/ada-spex";
test.after(() => fixture.dispose());

async function signedIn(name: string, host: Awaited<ReturnType<typeof startHost>>) {
  const home = await startHome(name, { host, project: false, extra: { signIn: "browser" } });
  const mark = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(mark, globalRecords, (row) => row.sync.phase === "done", 30_000);
  return home;
}

async function personalProject(home: Awaited<ReturnType<typeof startHome>>, host: Awaited<ReturnType<typeof startHost>>) {
  const folder = gitFolder("orchard");
  const { key: local } = await addFolder(home, folder);
  const from = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: host.url, name: "orchard" } });
  const key = hostKey(host, "ada/orchard-spex");
  const row = await home.client.waitRepository(from, key, (candidate) => candidate.sync.phase === "done", 30_000);
  assert.ok(row.id);
  return { key, id: row.id, clone: clonePath(home.dataDir, key) };
}

async function refresh(home: Awaited<ReturnType<typeof startHome>>, host: Awaited<ReturnType<typeof startHost>>) {
  const current = await home.client.expectOk("space.get", {});
  const last = instanceOf(current, host.url)?.readAt ?? 0;
  const mark = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  return home.client.waitSpace(mark, (state) => (instanceOf(state, host.url)?.readAt ?? 0) > last, 30_000);
}

test("DR-246: a second home discovers and joins only the account’s personal projects", async (t) => {
  const host = await startHost();
  const group = host.script.addRepository({ group: "acme", name: "team-spex" });
  const another = host.script.addRepository({
    group: "bob", name: "another-spex",
    members: [{ id: "1001", login: "ada", displayName: "Ada Lovelace", role: "Developer" }],
  });
  const writer = await signedIn("personal-writer", host);
  t.after(() => writer.stop());
  const { key, id, clone } = await personalProject(writer, host);
  writeFileSync(join(clone, "notes.md"), "On both computers.\n");
  const write = await writer.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(write.sync.phase, "done");

  const reader = await signedIn("personal-reader", host);
  t.after(() => reader.stop());
  const state = await reader.client.expectOk("space.get", {});
  assert.deepEqual(state.repositories.filter((row) => !row.own).map((row) => [row.id, row.state]), [[id, "absent"]]);
  for (const hidden of [group, another]) {
    await reader.client.expectError("space.join", { instance: host.url, hostId: hidden.id }, "not_found");
  }
  const mark = reader.client.mark();
  const folder = gitFolder("reader-orchard");
  await reader.client.expectOk("space.join", { instance: host.url, hostId: id, folder });
  await reader.client.waitRepository(mark, key, (row) => row.state === "reachable" && row.folder === folder, 30_000);
  assert.equal(git(clonePath(reader.dataDir, key), "show", "spex:notes.md"), "On both computers.");
  assert.ok(host.script.requests.every((request) => !/\/api\/v1\/host\/(?:groups|servers)|\/members$/.test(request.path)));
});

test("DR-246: a cached project moved out of the personal namespace cannot open, attach, or receive a push", async (t) => {
  const first = await startHost();
  const second = await startHost();
  const home = await signedIn("personal-ownership", first);
  t.after(() => home.stop());
  const { key, id, clone } = await personalProject(home, first);
  await signIn(home, second);
  const listed = second.script.addRepository({ group: "ada", name: "orchard-spex" });
  mkdirSync(join(clone, PLACEMENTS_DIR), { recursive: true });
  const file = join(clone, PLACEMENTS_DIR, `${hostFolder(second)}.yaml`);
  writeFileSync(file, encodePlacementFile(second.url, listed.id));
  await refresh(home, second);
  second.script.rename(listed.id, { name: "orchard-spex", group: "acme" });

  await home.client.expectError("space.attach", { repository: key, instance: second.url }, "not_found");
  await home.client.expectError("space.place", { repository: key, choice: { kind: "join", instance: second.url, hostId: listed.id } }, "not_found");
  const detached = await home.client.repository(key);
  assert.ok(!detached.placements.some((line) => line.instance === second.url && line.attached));

  const reader = await signedIn("personal-cached", first);
  t.after(() => reader.stop());
  assert.equal((await reader.client.repository(key)).state, "absent");
  writeFileSync(join(clone, "local-only.md"), "A saved local note.\n");
  let moved = false;
  home.hooks.beforeStep = ({ repository, step }) => {
    if (repository === key && step === "push" && !moved) {
      moved = true;
      first.script.rename(id, { name: "orchard-spex", group: "acme" });
    }
  };
  const stopped = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.ok(moved);
  assert.ok(stopped.sync.phase === "stopped" && stopped.sync.step === "push" && stopped.sync.cause === "gone");
  await reader.client.expectError("space.join", { instance: first.url, hostId: id }, "not_found");
  assert.ok(!(await reader.client.expectOk("space.get", {})).repositories.some((row) => row.id === id));
  assert.equal(git(clone, "show", "spex:local-only.md"), "A saved local note.");
  assert.throws(() => git(first.bareOf("acme/orchard-spex"), "show", "spex:local-only.md"));
  const replacement = first.script.addRepository({ group: "ada", name: "orchard-spex" });
  assert.notEqual(replacement.id, id);
  const retried = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.ok(retried.sync.phase === "stopped" && retried.sync.step === "check" && retried.sync.cause === "gone");
  assert.throws(() => git(replacement.bare, "show", "spex:local-only.md"));
});

test("DR-246: catch-up checks the first destination again when a later personal placement adds records", async (t) => {
  const first = await startHost();
  const second = await startHost();
  const home = await signedIn("personal-catch-up", first);
  t.after(() => home.stop());
  const { key, id } = await personalProject(home, first);
  await signIn(home, second);
  const placed = await home.client.settle("space.place", { repository: key, choice: { kind: "create", instance: second.url, name: "orchard" } }, 30_000);
  assert.equal(placementOf(placed, second.url).outcome?.kind, "synced");
  await peerPush(peerClone(second.bareOf("ada/orchard-spex")), (dir) => {
    writeFileSync(join(dir, "only-second.md"), "Received from the second Space.\n");
  });
  let moved = false;
  home.hooks.beforeStep = ({ repository, at, placement }) => {
    if (repository === key && at === "catch-up" && placement === first.url && !moved) {
      moved = true;
      first.script.rename(id, { name: "orchard-spex", group: "acme" });
    }
  };
  const synced = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.ok(moved);
  const rejected = placementOf(synced, first.url).outcome;
  assert.ok(rejected?.kind === "stopped" && rejected.cause === "gone", JSON.stringify(rejected));
  assert.equal(placementOf(synced, second.url).outcome?.kind, "synced");
  assert.equal(git(clonePath(home.dataDir, key), "show", "spex:only-second.md"), "Received from the second Space.");
  assert.throws(() => git(first.bareOf("acme/orchard-spex"), "show", "spex:only-second.md"));
});
