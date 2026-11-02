// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bareOf, clonePath, createSpaceHarness, hostKey, repositoryOf } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
const { scratch, git, gitFolder, addFolder, startHome, startHost, signIn } = fixture;
test.after(() => fixture.dispose());

test("space-129: Sync publishes a code remote added after registration and enables a seat's real code open", async (t) => {
  const host = await startHost();
  const home = await startHome("remote-refresh", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  await signIn(home, host);
  const folder = gitFolder("published-later");
  git(folder, "-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "--allow-empty", "-m", "Initial code");
  const local = await addFolder(home, folder);
  const key = hostKey(host, "acme/published-later-spex");
  const picked = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local.key, choice: { kind: "create", instance: host.url, groupId: "2002", name: "published-later" } });
  let row = await home.client.waitRepository(picked, key, (r) => r.sync.phase === "done" || r.sync.phase === "stopped");
  assert.equal(row.sync.phase, "done", JSON.stringify(row.sync));
  const file = () => join(clonePath(home.dataDir, key), "project.json");
  const project = () => JSON.parse(readFileSync(file(), "utf8"));
  assert.equal(project().remote, null);

  const remote = join(scratch, "published-code.git");
  mkdirSync(remote);
  git(remote, "init", "--bare", "-q");
  git(folder, "remote", "add", "origin", remote);
  git(folder, "push", "-u", "origin", "HEAD");
  await home.client.expectOk("space.get", {});
  await home.client.expectOk("project.status", { projectId: key });
  assert.equal(project().remote, null, "reads do not change records");
  async function sync() {
    const from = home.client.mark();
    await home.client.expectOk("space.sync", { repository: key });
    return home.client.waitRepository(from, key, (r) => r.sync.phase === "done" || r.sync.phase === "stopped");
  }
  row = await sync();
  assert.equal(row.sync.phase, "done", JSON.stringify(row.sync));
  assert.deepEqual(project(), { format: 1, name: "published-later", remote });
  assert.equal(JSON.parse(git(bareOf(host, key), "show", "spex:project.json")).remote, remote);
  assert.notEqual(row.codeKind, "none", "server opening receives code-backed metadata");

  const seat = await startHome("remote-refresh-seat", { host, project: false, extra: { seat: { serverId: "srv_7f3a", serverName: "lab-1", personId: "1001" } } });
  t.after(() => seat.stop());
  await signIn(seat, host);
  const listed = repositoryOf(await seat.client.expectOk("space.get", {}), key);
  assert.notEqual(listed.codeKind, "none");
  const opened = seat.client.mark();
  await seat.client.expectOk("space.join", { instance: host.url, hostId: listed.id! });
  const joined = await seat.client.waitRepository(opened, key, (r) => r.folder !== null || r.sync.phase === "stopped");
  assert.ok(joined.folder, JSON.stringify(joined.sync));
  assert.equal(git(joined.folder!, "rev-parse", "HEAD"), git(folder, "rev-parse", "HEAD"));

  const second = join(scratch, "changed-code.git");
  mkdirSync(second);
  git(second, "init", "--bare", "-q");
  git(folder, "remote", "set-url", "origin", second);
  git(folder, "push", "origin", "HEAD");
  assert.equal((await sync()).sync.phase, "done");
  assert.equal(project().remote, second);
  const previous = readFileSync(file(), "utf8");
  git(folder, "remote", "set-url", "origin", "https://user:secret@example.test/code.git");
  const refused = await sync();
  assert.equal(refused.sync.phase, "stopped");
  assert.equal(readFileSync(file(), "utf8"), previous, "credential-bearing values never reach records");
  git(folder, "remote", "set-url", "origin", "relative-code.git");
  assert.equal((await sync()).sync.phase, "stopped");
  assert.equal(readFileSync(file(), "utf8"), previous, "malformed values preserve records");
  const config = join(folder, ".git", "config");
  const configBefore = readFileSync(config, "utf8");
  writeFileSync(config, "[broken config\n");
  assert.equal((await sync()).sync.phase, "stopped");
  assert.equal(readFileSync(file(), "utf8"), previous, "failed Git reads do not mean origin was removed");
  writeFileSync(config, configBefore);
  git(folder, "remote", "remove", "origin");
  assert.equal((await sync()).sync.phase, "done");
  assert.equal(project().remote, null);
  assert.equal(JSON.parse(git(bareOf(host, key), "show", "spex:project.json")).remote, null);
  git(folder, "remote", "add", "origin", second);
  const moved = `${folder}-away`;
  renameSync(folder, moved);
  assert.equal((await sync()).sync.phase, "done");
  assert.equal(project().remote, null, "an unavailable folder does not overwrite metadata");
  renameSync(moved, folder);
  renameSync(join(folder, ".git"), join(scratch, "saved-code-git"));
  assert.equal((await sync()).sync.phase, "done");
  assert.equal(project().remote, null, "a folder without its Git root does not overwrite metadata");
});
