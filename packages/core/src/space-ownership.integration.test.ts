// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { test } from "node:test";
import { clonePath, createSpaceHarness } from "./testing/space-harness.js";
import type { SpaceGit } from "./space-git.js";

const fixture = createSpaceHarness();
test.after(() => fixture.dispose());
type Home = Awaited<ReturnType<typeof fixture.startHome>>;

function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

/** Scheduling seams only: commands still execute through the real core,
 * filesystem, Git and stand-in host. */
function manager(home: Home) {
  return (home.service as unknown as { space: {
    probe: SpaceGit;
    machine(key: string): { git: SpaceGit };
    holdRemoval(key: string): { refused(): void; removed(): void };
    settingUp?: Promise<void>;
  } }).space;
}

function pauseGit(home: Home, key: string, match: (args: string[]) => boolean) {
  const reached = deferred();
  const released = deferred();
  const git = manager(home).machine(key).git;
  const run = git.run.bind(git);
  let held = false;
  git.run = async (args, options) => {
    if (!held && match(args)) { held = true; reached.resolve(); await released.promise; }
    return run(args, options);
  };
  return { reached: reached.promise, release: released.resolve };
}

async function signedHome(name: string) {
  const host = await fixture.startHost();
  const home = await fixture.startHome(name, { host, project: false, extra: { signIn: "browser" } });
  const from = home.client.mark();
  await fixture.signIn(home, host);
  await home.client.waitRepository(from, "ada/ada-spex", (row) => row.sync.phase === "done");
  return { host, home };
}

test("space-37 ownership: a remote change reserves before its read and removal owns the reverse ordering", async (t) => {
  const drain = deferred();
  const releaseDrain = deferred();
  const home = await fixture.startHome("ownership-remote", { project: false, extra: {
    mediaBeforeDrain: async (owner) => {
      if (owner.kind === "project") { drain.resolve(); await releaseDrain.promise; }
    },
  } });
  const { key, clone } = await fixture.addFolder(home, fixture.gitFolder("remote-work"));
  const remote = fixture.bareRepo();
  const held = pauseGit(home, key, (args) => args[0] === "remote" && args[1] === "get-url");
  t.after(async () => { held.release(); releaseDrain.resolve(); await home.stop(); });
  const changing = home.client.command("space.remote.set", { repository: key, url: remote });
  await held.reached;
  await home.client.expectError("project.remove", { projectId: key, confirm: true }, "busy");
  await home.client.expectError("space.sync", { repository: key }, "busy");
  held.release();
  assert.ok((await changing).ok);
  assert.equal(fixture.git(clone, "remote", "get-url", "origin"), remote);
  const removing = home.client.command("project.remove", { projectId: key, confirm: true });
  await drain.promise;
  await home.client.expectError("space.remote.set", { repository: key, url: fixture.bareRepo() }, "busy", /being removed/);
  await home.client.expectError("session.create", { projectId: key }, "busy", /being removed/);
  assert.equal(fixture.git(clone, "remote", "get-url", "origin"), remote);
  releaseDrain.resolve();
  assert.ok((await removing).ok);
  assert.ok(!existsSync(clone));
});

test("space-37 ownership: a retired removal cannot release its successor", async (t) => {
  const home = await fixture.startHome("ownership-release", { project: false });
  t.after(() => home.stop());
  const { key } = await fixture.addFolder(home, fixture.gitFolder("release-work"));
  const first = manager(home).holdRemoval(key);
  first.refused();
  const second = manager(home).holdRemoval(key);
  try {
    first.refused();
    await home.client.expectError("space.remote.set", { repository: key, url: fixture.bareRepo() }, "busy", /being removed/);
    await home.client.expectError("project.remove", { projectId: key, confirm: true }, "busy", /being removed/);
  } finally { second.refused(); }
  await home.client.expectOk("space.remote.set", { repository: key, url: fixture.bareRepo() });
});

test("space-37 ownership: concurrent assignments share one host claim and keep unrelated clones writable", async (t) => {
  const { host, home } = await signedHome("ownership-picks");
  const remote = "https://example.test/shared-code.git";
  const listed = host.script.addRepository({ group: "acme", name: "shared-spex", project: { format: 1, name: "shared", remote } });
  await home.client.settle("space.sync", { repository: "ada/ada-spex" });
  const folders = [fixture.gitFolder("first-work"), fixture.gitFolder("second-work")];
  for (const folder of folders) fixture.git(folder, "remote", "add", "origin", remote);
  const first = await fixture.addFolder(home, folders[0]);
  const second = await fixture.addFolder(home, folders[1]);
  const held = pauseGit(home, first.key, (args) => args[0] === "remote" && args[1] === "add");
  t.after(async () => { held.release(); await home.stop(); });
  const from = home.client.mark();
  const picking = home.client.command("space.pick", { repository: first.key, choice: { kind: "join", hostId: listed.id } });
  await held.reached;
  await home.client.expectError("space.pick", { repository: second.key, choice: { kind: "join", hostId: listed.id } }, "invalid_request", /on this device already/);
  await home.client.expectError("space.join", { hostId: listed.id, folder: fixture.gitFolder("third-work") }, "invalid_request", /on this device already/);
  await home.client.expectError("project.remove", { projectId: first.key, confirm: true }, "busy");
  const session = await home.client.expectOk("session.create", { projectId: second.key });
  assert.equal(session.projectId, second.key);
  held.release();
  assert.ok((await picking).ok);
  await home.client.waitRepository(from, "acme/shared-spex", (row) => row.sync.phase === "done" || row.sync.phase === "choices");
  const state = await home.client.expectOk("space.get", {});
  assert.deepEqual(state.groups.flatMap((group) => group.repositories.filter((row) => row.id === listed.id).map((row) => row.key)), ["acme/shared-spex"]);
  assert.equal((await home.client.repository(second.key)).remote, null);
});

test("space-37 ownership: a waiting project creation cannot adopt a repository joined meanwhile", async (t) => {
  const { host, home } = await signedHome("ownership-waiting");
  t.after(() => home.stop());
  const project = await fixture.addFolder(home, fixture.gitFolder("waiting-work"));
  host.script.refuseCreate("Waiting for a member who can create");
  await home.client.expectOk("space.pick", { repository: project.key, choice: { kind: "create", groupId: "2002", name: "shared" }, noticed: true });
  const listed = host.script.addRepository({ group: "acme", name: "shared-spex", project: { format: 1, name: "shared", remote: null } });
  await home.client.settle("space.sync", { repository: "ada/ada-spex" });
  const from = home.client.mark();
  await home.client.expectOk("space.join", { hostId: listed.id, folder: fixture.gitFolder("joined-work") });
  await home.client.waitRepository(from, "acme/shared-spex", (row) => row.state === "reachable" && row.folder !== null);
  await home.client.expectOk("space.refresh", {});
  await manager(home).settingUp;
  const row = await home.client.repository(project.key);
  assert.deepEqual([row.state, row.id, row.remote], ["local-only", null, null]);
  const state = await home.client.expectOk("space.get", {});
  assert.deepEqual(state.groups.flatMap((group) => group.repositories.filter((entry) => entry.id === listed.id).map((entry) => entry.key)), ["acme/shared-spex"]);
});

test("space-37 ownership: starting a group session defers its opportunistic host assignment", async (t) => {
  const { host, home: seed } = await signedHome("ownership-session-seed");
  await seed.stop();
  const key = "acme/acme-spex";
  const clone = clonePath(seed.dataDir, key);
  mkdirSync(clone, { recursive: true });
  fixture.git(clone, "init", "-q", "-b", "spex");
  fixture.git(clone, "commit", "-q", "--allow-empty", "-m", "Start");
  host.script.addRepository({ group: "acme", name: "notes-spex", records: { "notes.md": "Group records\n" } });
  const home = await fixture.startHome("ownership-session", { dataDir: seed.dataDir, project: false });
  t.after(() => home.stop());
  await home.client.expectOk("space.get", {});
  await manager(home).settingUp;
  await home.client.expectOk("project.rebind", { projectId: key, path: fixture.gitFolder("group-work") });
  const session = await home.client.expectOk("session.create", { projectId: key });
  assert.equal(session.projectId, key);
  assert.ok(existsSync(clone));
  await home.client.expectOk("session.dispose", { sessionId: session.id });
  const from = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  await home.client.waitRepository(from, "acme/notes-spex", (row) => row.sync.phase === "done" || row.sync.phase === "choices");
});

test("space-37 ownership: a namespace move cannot carry an unindexed Join", async (t) => {
  const { host, home } = await signedHome("ownership-join-move");
  const alpha = host.script.addRepository({ group: "acme", name: "alpha-spex", project: { format: 1, name: "alpha", remote: null } });
  const beta = host.script.addRepository({ group: "acme", name: "beta-spex", project: { format: 1, name: "beta", remote: null } });
  await home.client.settle("space.sync", { repository: "ada/ada-spex" });
  const first = home.client.mark();
  await home.client.expectOk("space.join", { hostId: alpha.id, folder: fixture.gitFolder("moving-alpha") });
  await home.client.waitRepository(first, "acme/alpha-spex", (row) => row.state === "reachable" && row.folder !== null);
  const reached = deferred();
  const released = deferred();
  const probe = manager(home).probe;
  const run = probe.run.bind(probe);
  probe.run = async (args, options) => {
    const result = await run(args, options);
    if (args[0] === "clone" && args.at(-1) === clonePath(home.dataDir, "acme/beta-spex")) {
      assert.equal(result.code, 0);
      reached.resolve();
      await released.promise;
    }
    return result;
  };
  t.after(async () => { released.resolve(); await home.stop(); });
  const joined = home.client.mark();
  await home.client.expectOk("space.join", { hostId: beta.id, folder: fixture.gitFolder("joining-beta") });
  await reached.promise;
  const sameFolder = existsSync(clonePath(home.dataDir, "Acme/alpha-spex"));
  host.script.groups.push({ id: "2004", fullPath: "Acme", name: "Acme", kind: "group" });
  host.script.rename(alpha.id, { group: "Acme" });
  const syncing = home.client.mark();
  await home.client.expectOk("space.sync", { repository: "acme/alpha-spex", noticed: true });
  await home.client.waitRepository(syncing, sameFolder ? "acme/alpha-spex" : "Acme/alpha-spex", (row) => row.sync.phase === "done");
  assert.ok(existsSync(clonePath(home.dataDir, "acme/beta-spex")));
  released.resolve();
  await home.client.waitRepository(joined, "acme/beta-spex", (row) => row.state === "reachable" && row.folder !== null);
  host.script.rename(beta.id, { group: "Acme" });
  if (sameFolder) {
    const next = home.client.mark();
    await home.client.expectOk("space.sync", { repository: "acme/alpha-spex", noticed: true });
    await home.client.waitRepository(next, "Acme/alpha-spex", (row) => row.sync.phase === "done");
  }
  const last = home.client.mark();
  await home.client.expectOk("space.sync", { repository: sameFolder ? "Acme/beta-spex" : "acme/beta-spex", noticed: true });
  const row = await home.client.waitRepository(last, "Acme/beta-spex", (entry) => entry.sync.phase === "done");
  assert.ok(row.folder);
  assert.ok(existsSync(clonePath(home.dataDir, row.key)));
});
