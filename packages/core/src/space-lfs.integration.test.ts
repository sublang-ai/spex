// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyStorageSelection, planStorageMerge, StorageWriteRefused, validateStorageSnapshot } from "./storage-git.js";
import { createSpaceHarness, clonePath } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
const { git, gitFolder, startHost, startHome, signIn } = fixture;
test.after(() => fixture.dispose());
const base = Buffer.alloc(65_578, 17), incoming = Buffer.alloc(65_578, 29);
const oid = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
function filters(dir: string) {
  git(dir, "config", "filter.lfs.clean", "git-lfs clean -- %f");
  git(dir, "config", "filter.lfs.smudge", "git-lfs smudge -- %f");
  git(dir, "config", "filter.lfs.process", "git-lfs filter-process");
  git(dir, "config", "filter.lfs.required", "true");
}
function commit(dir: string) { git(dir, "add", "."); git(dir, "-c", "commit.gpgsign=false", "commit", "-qm", "fixture"); }
function object(dir: string, bytes: Buffer) { const id = oid(bytes); return join(dir, "lfs", "objects", id.slice(0, 2), id.slice(2, 4), id); }

async function coldReader(t: TestContext) {
  const host = await startHost(), home = await startHome("lfs-reader", { host });
  t.after(() => home.stop());
  await signIn(home, host);
  const key = "ada/ada-spex";
  await home.client.waitRepository(0, key, row => row.sync.phase === "done");
  const clone = clonePath(home.dataDir, key), bare = host.bareOf(key);
  filters(clone);
  git(clone, "config", "credential.helper", "!exit 37"); // No usable ambient credential.
  const peer = fixture.peerClone(bare); filters(peer);
  writeFileSync(join(peer, ".gitattributes"), "*.bin filter=lfs diff=lfs merge=lfs -text\n");
  writeFileSync(join(peer, "asset.bin"), incoming); commit(peer);
  git(peer, "push", "-q", "origin", "HEAD:spex");
  const stored = object(bare, incoming); mkdirSync(join(stored, ".."), { recursive: true });
  if (!existsSync(stored)) cpSync(object(join(peer, ".git"), incoming), stored);
  assert.equal(existsSync(object(join(clone, ".git"), incoming)), false);
  // A reader receives without a push; path exclusions must not omit selected bytes.
  host.script.repositories.find(repo => repo.bare === bare)!.role = "Reporter";
  git(clone, "config", "lfs.fetchexclude", "*");
  return { host, home, key, clone };
}

test("git-host-14, space-37: authenticated LFS Check hydrates a cold reader before bounded local Apply", async (t) => {
  const { host, home, key, clone } = await coldReader(t);
  let requestsAtApply = -1;
  home.hooks.beforeStep = ({ step, repository }) => {
    if (step !== "apply" || repository !== key) return;
    assert.ok(existsSync(object(join(clone, ".git"), incoming)));
    requestsAtApply = host.script.requests.filter(request => request.path.startsWith("/git/")).length;
    host.script.refuseTransport("Apply must stay local");
  };
  const result = await home.client.settle("space.sync", { repository: key, placement: host.url, noticed: true }, 30_000);
  assert.equal(result.sync.phase, "done", JSON.stringify(result.sync));
  assert.deepEqual(readFileSync(join(clone, "asset.bin")), incoming);
  assert.match(git(clone, "show", "HEAD:asset.bin"), /^version https:\/\/git-lfs.github.com\/spec\/v1/);
  assert.ok(host.script.transportCredentials.some(request => request.path.endsWith(`/info/lfs/objects/${oid(incoming)}`)));
  assert.equal(host.script.requests.filter(request => request.path.startsWith("/git/")).length, requestsAtApply, "Apply makes no transport request");
});

test("git-host-14, space-37: Stop ends a held authenticated LFS Check before Apply", async (t) => {
  const { host, home, key, clone } = await coldReader(t);
  let release!: () => void, reached!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const entered = new Promise<void>(resolve => { reached = resolve; });
  t.after(release);
  host.script.beforeLfsDownload = async () => { reached(); await held; };
  const head = git(clone, "rev-parse", "HEAD"), index = git(clone, "ls-files", "-s");
  let applied = false;
  home.hooks.beforeStep = ({ step, repository }) => { if (step === "apply" && repository === key) applied = true; };
  const from = home.client.mark();
  await home.client.expectOk("space.sync", { repository: key, placement: host.url, noticed: true });
  await entered;
  await home.client.waitRepository(from, key, row => row.sync.phase === "running" && row.sync.step === "check" && row.sync.cancelable);
  assert.deepEqual(await home.client.expectOk("space.cancel", { repository: key }), { stopped: true });
  const stopped = await home.client.waitRepository(from, key, row => row.sync.phase === "stopped");
  assert.ok(stopped.sync.phase === "stopped" && stopped.sync.step === "check" && stopped.sync.cause === "stopped", JSON.stringify(stopped.sync));
  assert.equal(applied, false);
  assert.equal(existsSync(join(clone, "asset.bin")), false);
  assert.equal(existsSync(object(join(clone, ".git"), incoming)), false);
  assert.equal(git(clone, "rev-parse", "HEAD"), head);
  assert.equal(git(clone, "ls-files", "-s"), index);
  release();
});

test("git-host-14: an alternate LFS endpoint receives no brokered credential", async (t) => {
  const { host, home, key, clone } = await coldReader(t);
  const alternate = await startHost();
  git(clone, "config", "lfs.url", `${alternate.gitOrigin}/elsewhere.git/info/lfs`);
  git(clone, "config", "lfs.transfer.maxretries", "0");
  const result = await home.client.settle("space.sync", { repository: key, placement: host.url, noticed: true }, 30_000);
  assert.ok(result.sync.phase === "stopped" && result.sync.step === "check", JSON.stringify(result.sync));
  const requests = alternate.script.requests.filter(request => request.path.startsWith("/git/"));
  assert.ok(requests.length > 0, "real LFS transport reached the alternate endpoint");
  assert.ok(requests.every(request => !request.authorization), "the alternate origin never receives an Authorization header");
  assert.equal(existsSync(join(clone, "asset.bin")), false);
});

function selected() {
  const dir = gitFolder("lfs-selection"); filters(dir); git(dir, "checkout", "-qb", "spex");
  writeFileSync(join(dir, ".gitattributes"), "*.bin filter=lfs diff=lfs merge=lfs -text\n*.txt text eol=crlf\n");
  writeFileSync(join(dir, "asset.bin"), base); writeFileSync(join(dir, "note.txt"), "base\r\n"); commit(dir);
  git(dir, "checkout", "-qb", "incoming");
  writeFileSync(join(dir, "asset.bin"), incoming); writeFileSync(join(dir, "note.txt"), "incoming\r\n"); commit(dir);
  git(dir, "checkout", "-q", "spex");
  return { dir, plan: planStorageMerge(dir, "HEAD", "incoming") };
}

test("storage-16: local selection writes validated LFS and ordinary filtered bytes with version guards", async () => {
  const { dir, plan } = selected();
  const index = git(dir, "ls-files", "-s");
  await assert.rejects(applyStorageSelection(dir, plan, {}, { beforeWrite: () => writeFileSync(join(dir, "asset.bin"), Buffer.from("concurrent")) }),
    error => error instanceof StorageWriteRefused && error.reason === "changed");
  assert.equal(readFileSync(join(dir, "asset.bin"), "utf8"), "concurrent");
  assert.equal(git(dir, "ls-files", "-s"), index);
  writeFileSync(join(dir, "asset.bin"), base);
  const result = await applyStorageSelection(dir, plan, {});
  assert.deepEqual(readFileSync(join(dir, "asset.bin")), incoming);
  assert.equal(readFileSync(join(dir, "note.txt"), "utf8"), "incoming\r\n");
  assert.equal(git(dir, "write-tree"), result.tree);
});

test("storage-16: a missing LFS object or incoming symlink refuses before any live write", async (t) => {
  const { dir, plan } = selected();
  // Apply runs synchronous Git children: an independent HTTP process can
  // answer even an incorrect smudge download, and records every attempt.
  const contacted = join(dir, ".git", "unexpected-lfs-request");
  const trap = spawn(process.execPath, ["-e", `const http = require('node:http'), fs = require('node:fs');
    const server = http.createServer((req, res) => { fs.writeFileSync(process.argv[1], 'contacted'); res.writeHead(401, {'www-authenticate':'Basic realm="fixture"'}).end(); });
    server.listen(0, '127.0.0.1', () => process.send(server.address().port));`, contacted], { stdio: ["ignore", "ignore", "ignore", "ipc"] });
  t.after(async () => { const exited = once(trap, "exit"); trap.kill(); await exited; });
  const [port] = await once(trap, "message");
  const remote = `http://127.0.0.1:${port}/fixture.git`;
  git(dir, "remote", "add", "origin", remote);
  git(dir, "config", "lfs.url", `${remote}/info/lfs`);
  git(dir, "config", "lfs.activitytimeout", "1");
  git(dir, "config", "lfs.transfer.maxretries", "0");
  rmSync(object(join(dir, ".git"), incoming));
  const index = git(dir, "ls-files", "-s"); let writes = false;
  await assert.rejects(applyStorageSelection(dir, plan, {}, { beforeWrite: () => { writes = true; } }));
  assert.equal(writes, false);
  assert.deepEqual(readFileSync(join(dir, "asset.bin")), base);
  assert.equal(git(dir, "ls-files", "-s"), index);
  assert.equal(existsSync(contacted), false, "a cold local Apply never contacts even its reachable remote");
  writeFileSync(object(join(dir, ".git"), incoming), base); // Same length, wrong SHA-256.
  await assert.rejects(applyStorageSelection(dir, plan, {}, { beforeWrite: () => { writes = true; } }), /materialized content does not match/);
  assert.equal(writes, false);
  assert.deepEqual(readFileSync(join(dir, "asset.bin")), base);
  assert.equal(git(dir, "ls-files", "-s"), index);
  assert.equal(existsSync(contacted), false, "a corrupt cache object also refuses locally");
  const canary = join(fixture.scratch, "lfs-canary"); writeFileSync(canary, "outside");
  rmSync(join(dir, "asset.bin")); symlinkSync(canary, join(dir, "asset.bin")); git(dir, "add", "asset.bin");
  const tree = git(dir, "write-tree");
  await assert.rejects(validateStorageSnapshot(dir, tree), /tracked storage entries must be regular files/);
  assert.equal(readFileSync(canary, "utf8"), "outside");
});

test("storage-16: recognized noncanonical LFS pointers refuse instead of being installed as ordinary bytes", async () => {
  for (const version of ["http://git-media.io/v/2", "https://hawser.github.com/spec/v1", "https://git-lfs.github.com/spec/v1"]) {
    const { dir } = selected();
    git(dir, "checkout", "-q", "incoming");
    const pointer = git(dir, "show", "HEAD:asset.bin").replace("https://git-lfs.github.com/spec/v1", version);
    writeFileSync(join(dir, "asset.bin"), `\n${pointer}\n\n`);
    const blob = git(dir, "hash-object", "-w", "--no-filters", "asset.bin");
    git(dir, "update-index", "--cacheinfo", `100644,${blob},asset.bin`);
    git(dir, "-c", "commit.gpgsign=false", "commit", "-qm", "noncanonical fixture");
    git(dir, "checkout", "-qf", "spex");
    const index = git(dir, "ls-files", "-s"); let writes = false;
    await assert.rejects(applyStorageSelection(dir, planStorageMerge(dir, "HEAD", "incoming"), {}, { beforeWrite: () => { writes = true; } }), /materialized content does not match/);
    assert.equal(writes, false);
    assert.deepEqual(readFileSync(join(dir, "asset.bin")), base);
    assert.equal(git(dir, "ls-files", "-s"), index);
  }
});
