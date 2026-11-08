// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Clones moved while the core watches them (space-119, storage-60): the
// first sign-in's rename of your own group's folder, a pick moving a
// local-only clone under its instance's folder, a sync following the
// host's rename, and a Leave of a clone's first placement. The core lets
// go of what it watches and reads within a clone across its move
// (media-23) and takes it up again where the clone then lies. On Windows, which refuses to rename a
// folder anything holds open, a program holding the clone refuses the
// move with nothing changed, until it lets go. CI runs this file on
// Windows on the Node the app's Electron ships.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { test } from "node:test";

import { Home } from "./home.js";
import { MEDIA_CHUNK_BYTES, type ServerMessage } from "./protocol.js";
import { bareOf, clonePath, createSpaceHarness, hostFolder, hostKey, OWN } from "./testing/space-harness.js";
import type { StandinHost } from "./testing/standin-host.js";

const fixture = createSpaceHarness();
const { git, gitFolder, addFolder, config, startHome, startHost, signIn, writeForeignSession, announced } = fixture;
test.after(() => fixture.dispose());

/** The stand-in's account, whose login names your own group's folder
 * once the home signs in (space-59). */
const LOGIN = "ada";
const WINDOWS_ONLY = process.platform === "win32" ? false : "only Windows refuses to rename a folder something holds open";

type StartedHome = Awaited<ReturnType<typeof startHome>>;

/** A home whose core watches its clones' sessions and config. */
function watchingHome(name: string, host: StandinHost, project = true): Promise<StartedHome> {
  return startHome(name, { host, project, extra: { watchConfig: true } });
}

/** A program other than the core holding `dir` open: a process whose
 * working folder it is, as a terminal opened there is. */
async function holdOpen(dir: string): Promise<() => Promise<void>> {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { cwd: dir, env: process.env, stdio: "ignore" });
  await new Promise<void>((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  return async () => { child.kill(); await exited; };
}

/** Whether a config state with the captain on `model` is announced. */
const reloadedTo = (model: string) => (message: ServerMessage): boolean =>
  message.type === "config.state" && message.state.status === "valid" && message.state.summary.captain.model === model;

/** A project placed at the stand-in's `acme` by a pick creating it, its
 * clone moved there and its first sync done, holding a session another
 * host wrote, which the core read. */
async function placedProject(home: StartedHome, host: StandinHost, name: string): Promise<{ key: string; id: string; clone: string; folder: string }> {
  const folder = gitFolder(name);
  const { key: local, clone: localClone } = await addFolder(home, folder);
  assert.ok(await announced(home, await writeForeignSession(localClone, folder, `written in ${name}`)), "the core reads the clone's sessions");
  const from = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: Home.load(home.dataDir).origin, groupId: "2002", name } });
  const key = hostKey(host, `acme/${name}-spex`);
  const synced = await home.client.waitRepository(from, key, (repository) => repository.sync.phase === "done", 30_000);
  return { key, id: synced.id ?? "", clone: clonePath(home.dataDir, key), folder };
}

test("space-119: the first sign-in moves your own group's folder its core watches, places your own group's repository, and watches the clones where they now lie", async (t) => {
  const host = await startHost();
  const home = await watchingHome("moves-signin", host);
  t.after(() => home.stop());
  const { clone } = await addFolder(home, home.projectDir);
  const before = await writeForeignSession(clone, home.projectDir, "written before the sign-in");
  assert.ok(await announced(home, before), "the core reads the project clone's sessions");

  const from = home.client.mark();
  await signIn(home, host);
  const own = `${LOGIN}/${LOGIN}-spex`;
  const placed = await home.client.waitRepository(from, own, (repository) => repository.sync.phase === "done", 30_000);
  assert.equal(placed.state, "reachable", "[space-59] your own group's repository is placed at the Space");
  assert.equal(git(bareOf(host, own), "rev-parse", "spex"), git(clonePath(home.dataDir, own), "rev-parse", "spex"), "[space-59] and pushed there");
  const former = join(home.dataDir, "workspace", OWN);
  assert.ok(!existsSync(former), `[space-59] the folder bearing the device's user name left with its clones: ${existsSync(former) ? JSON.stringify(readdirSync(former, { recursive: true })) : ""}`);
  const moved = `${LOGIN}/${basename(home.projectDir)}-spex`;
  assert.equal(Home.load(home.dataDir).keyForFolder(home.projectDir), moved, "[space-59] the pair names the moved clone");
  const movedClone = clonePath(home.dataDir, moved);
  assert.ok(existsSync(join(movedClone, "sessions", `${before}.json`)), "[space-59] the session moved with its clone");

  // Watched where they now lie: a session another host writes, and a
  // change of your own group's config (space-59).
  assert.ok(await announced(home, await writeForeignSession(movedClone, home.projectDir, "written after the sign-in")), "[space-59] the moved clone's sessions are read as they are written");
  // A reload whose files change while it reads them — the environment
  // still installing beneath your own group's clone — announces nothing
  // (DR-111): the change is written again until one reload announces it,
  // each write read by the watch alone.
  let reloaded = false;
  for (let attempt = 0; attempt < 6 && !reloaded; attempt += 1) {
    const model = `claude-moved-${attempt}`;
    writeFileSync(join(clonePath(home.dataDir, own), "config", "playbook.config.yaml"), config(model));
    reloaded = await home.client.waitFor(reloadedTo(model), 5_000).then(() => true, () => false);
  }
  assert.ok(reloaded, "[space-59] a change of your own group's config where it now lies is read as it is written");
});

test("space-119: a sync follows the host's rename of a clone its core watches, and watches it where it now lies", async (t) => {
  const host = await startHost();
  const home = await watchingHome("moves-rename", host, false);
  t.after(() => home.stop());
  await signIn(home, host);
  const { key, id, clone, folder } = await placedProject(home, host, "renamed");
  host.script.rename(id, { name: "relocated-spex" });
  const relocated = hostKey(host, "acme/relocated-spex");
  const from = home.client.mark();
  await home.client.expectOk("space.sync", { repository: key });
  const moved = await home.client.waitRepository(from, relocated, (repository) => repository.sync.phase !== "running" && repository.sync.phase !== "idle", 30_000);
  assert.equal(moved.sync.phase, "done", `[space-60] ${JSON.stringify(moved.sync)}`);
  assert.ok(!existsSync(clone), "[space-60] the clone left its former path");
  const movedClone = clonePath(home.dataDir, relocated);
  assert.equal(Home.load(home.dataDir).keyForFolder(folder), relocated, "[space-60] its pair follows it");
  assert.ok(await announced(home, await writeForeignSession(movedClone, folder, "written after the move")), "[space-60] its sessions are read where it now lies");
});

test("space-119: on Windows, a sync's move of a clone another program holds open stops naming the project with nothing changed, and moves once let go", { skip: WINDOWS_ONLY }, async (t) => {
  const host = await startHost();
  const home = await watchingHome("moves-held", host, false);
  t.after(() => home.stop());
  await signIn(home, host);
  const { key, id, clone, folder } = await placedProject(home, host, "held");
  host.script.rename(id, { name: "released-spex" });
  const released = hostKey(host, "acme/released-spex");

  // Held through every try: the move stops, nothing moved (space-60).
  const release = await holdOpen(join(clone, "sessions"));
  try {
    const stopped = await home.client.settle("space.sync", { repository: key });
    assert.ok(stopped.sync.phase === "stopped" && stopped.sync.step === "check" && stopped.sync.cause === "lease" && stopped.sync.retry, `[space-60] ${JSON.stringify(stopped.sync)}`);
    assert.equal(stopped.sync.message, "The records of held are open in another program", `[space-60] the stop names the project: ${JSON.stringify(stopped.sync)}`);
    assert.ok(existsSync(join(clone, ".git")) && !existsSync(clonePath(home.dataDir, released)), "[space-60] the clone stays where it was");
    assert.equal(Home.load(home.dataDir).keyForFolder(folder), key, "[space-60] its pair stays");
    assert.ok(await announced(home, await writeForeignSession(clone, folder, "written after the refusal")), "[space-60] its sessions are read again where it stays");
  } finally { await release(); }

  // Let go within its tries: the same sync moves it.
  const brief = await holdOpen(join(clone, "sessions"));
  const from = home.client.mark();
  await home.client.expectOk("space.sync", { repository: key });
  setTimeout(() => { void brief(); }, 300);
  const moved = await home.client.waitRepository(from, released, (repository) => repository.sync.phase !== "running" && repository.sync.phase !== "idle", 30_000);
  assert.equal(moved.sync.phase, "done", `[space-60] ${JSON.stringify(moved.sync)}`);
  assert.ok(!existsSync(clone), "[space-60] the clone moved once let go");
  assert.equal(Home.load(home.dataDir).keyForFolder(folder), released, "[space-60] its pair follows it");
});

test("storage-60: a pick moves a local-only clone its core watches under its instance's folder, its first sync pushes from there, and it is watched where it now lies", async (t) => {
  const host = await startHost();
  const home = await watchingHome("moves-pick", host, false);
  t.after(() => home.stop());
  await signIn(home, host);
  const local = `${LOGIN}/picked-spex`;
  const { key, clone, folder } = await placedProject(home, host, "picked");
  assert.equal(key, `${hostFolder(host)}/acme/picked-spex`);
  assert.ok(!existsSync(clonePath(home.dataDir, local)), "[storage-35] the clone left your own group's folder");
  assert.equal(git(bareOf(host, key), "rev-parse", "spex"), git(clone, "rev-parse", "spex"), "[storage-35] its first sync pushed from where it now lies");
  assert.equal(Home.load(home.dataDir).keyForFolder(folder), key, "[storage-35] its pair follows it");
  assert.ok(await announced(home, await writeForeignSession(clone, folder, "written after the pick")), "[storage-35] its sessions are read where it now lies");
});

test("storage-60: on Windows, a Leave of a clone's first placement while another program holds the clone open neither drops nor moves it, and leaves once let go", { skip: WINDOWS_ONLY }, async (t) => {
  const host = await startHost();
  const home = await watchingHome("moves-leave", host, false);
  t.after(() => home.stop());
  await signIn(home, host);
  const { key, clone, folder } = await placedProject(home, host, "leaving");
  const remotes = git(clone, "remote");
  const release = await holdOpen(join(clone, "sessions"));
  try {
    const stopped = await home.client.settle("space.leave", { repository: key, instance: host.url, confirmed: true });
    assert.ok(stopped.sync.phase === "stopped" && stopped.sync.cause === "lease" && stopped.sync.retry, `[storage-38] ${JSON.stringify(stopped.sync)}`);
    assert.equal(git(clone, "remote"), remotes, "[storage-38] its placement is not dropped");
    assert.ok(existsSync(join(clone, "placements", `${hostFolder(host)}.yaml`)), "[storage-38] its placement file stays");
    assert.equal(Home.load(home.dataDir).keyForFolder(folder), key, "[storage-38] nor is it moved");
  } finally { await release(); }
  const local = `${LOGIN}/leaving-spex`;
  const from = home.client.mark();
  await home.client.expectOk("space.leave", { repository: key, instance: host.url, confirmed: true });
  const left = await home.client.waitRepository(from, local, (repository) => repository.sync.phase !== "running", 30_000);
  assert.equal(left.state, "local-only", `[storage-38] ${JSON.stringify(left)}`);
  assert.ok(!existsSync(clone) && existsSync(join(clonePath(home.dataDir, local), ".git")), "[storage-38] dropped and moved under your own group's folder once let go");
});

test("media-23: a pick moving a project's clone while the core reads an attachment there leaves it readable under the project's key now, from where the clone now lies, and under its former key no more", async (t) => {
  const host = await startHost();
  const home = await watchingHome("moves-media", host, false);
  t.after(() => home.stop());
  await signIn(home, host);
  const folder = gitFolder("attached");
  const { key: local } = await addFolder(home, folder);
  const bytes = randomBytes(MEDIA_CHUNK_BYTES + 7);
  const uploadId = randomUUID();
  await home.client.expectOk("media.begin", { owner: { kind: "project", id: local }, uploadId, name: "notes.bin", mimeType: "application/octet-stream", byteLength: bytes.length });
  await home.client.expectOk("media.chunk", { uploadId, offset: 0, data: bytes.subarray(0, MEDIA_CHUNK_BYTES).toString("base64") });
  await home.client.expectOk("media.chunk", { uploadId, offset: MEDIA_CHUNK_BYTES, data: bytes.subarray(MEDIA_CHUNK_BYTES).toString("base64") });
  const { asset } = await home.client.expectOk("media.finish", { uploadId });
  // Its reader stands open in the clone between chunks, as a page
  // reading the attachment leaves it: on Windows it would hold the clone.
  const first = await home.client.expectOk("media.read", { owner: { kind: "project", id: local }, assetId: asset.assetId, offset: 0, length: MEDIA_CHUNK_BYTES });
  assert.equal(first.eof, false);
  const from = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: Home.load(home.dataDir).origin, groupId: "2002", name: "attached" } });
  const key = hostKey(host, "acme/attached-spex");
  const synced = await home.client.waitRepository(from, key, (repository) => repository.sync.phase !== "running" && repository.sync.phase !== "idle", 30_000);
  assert.equal(synced.sync.phase, "done", `[media-22] the clone moved: ${JSON.stringify(synced.sync)}`);
  assert.ok(!existsSync(clonePath(home.dataDir, local)), "[media-22] the clone left its former path");
  await home.client.expectError("media.read", { owner: { kind: "project", id: local }, assetId: asset.assetId, offset: MEDIA_CHUNK_BYTES, length: MEDIA_CHUNK_BYTES }, "not_found", /no project/i);
  const rest = await home.client.expectOk("media.read", { owner: { kind: "project", id: key }, assetId: asset.assetId, offset: MEDIA_CHUNK_BYTES, length: MEDIA_CHUNK_BYTES });
  assert.ok(rest.eof, "[media-22] the read under the project's key now ends the file");
  assert.deepEqual(Buffer.from(rest.data, "base64"), bytes.subarray(MEDIA_CHUNK_BYTES), "[media-22] from where the clone now lies");
});
