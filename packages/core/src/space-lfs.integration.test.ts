// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { applyStorageSelection, planStorageMerge, StorageWriteRefused, validateStorageSnapshot } from "./storage-git.js";
import { bareOf, createSpaceHarness, clonePath, hostKey } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
const { addFolder, bareRepo, git, gitFolder, startHost, startHome, signIn } = fixture;
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
  const result = await home.client.settle("space.sync", { repository: key, placement: host.url }, 30_000);
  assert.equal(result.sync.phase, "done", JSON.stringify(result.sync));
  assert.deepEqual(readFileSync(join(clone, "asset.bin")), incoming);
  assert.match(git(clone, "show", "HEAD:asset.bin"), /^version https:\/\/git-lfs.github.com\/spec\/v1/);
  assert.ok(host.script.transportCredentials.some(request => request.path.endsWith(`/info/lfs/objects/${oid(incoming)}`)));
  assert.equal(host.script.requests.filter(request => request.path.startsWith("/git/")).length, requestsAtApply, "Apply makes no transport request");
});

test("space-142: Stop ends a held authenticated LFS Check before Apply", async (t) => {
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
  await home.client.expectOk("space.sync", { repository: key, placement: host.url });
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
  const result = await home.client.settle("space.sync", { repository: key, placement: host.url }, 30_000);
  assert.ok(result.sync.phase === "stopped" && result.sync.step === "check", JSON.stringify(result.sync));
  const requests = alternate.script.requests.filter(request => request.path.startsWith("/git/"));
  assert.ok(requests.length > 0, "real LFS transport reached the alternate endpoint");
  assert.ok(requests.every(request => !request.authorization), "the alternate origin never receives an Authorization header");
  assert.equal(existsSync(join(clone, "asset.bin")), false);
});

test("git-host-14, space-142: an LFS override cannot send a personal records Check to another Space repository", async (t) => {
  const { host, home, key, clone } = await coldReader(t);
  const endpoint = new URL(`${host.gitOrigin}/elsewhere.git/info/lfs`);
  for (const override of [endpoint.href, `ssh://git@${endpoint.hostname}:1${endpoint.pathname}`]) {
    git(clone, "config", "lfs.url", override);
    const result = await home.client.settle("space.sync", { repository: key, placement: host.url }, 30_000);
    assert.ok(result.sync.phase === "stopped" && result.sync.step === "check" && result.sync.cause === "git", JSON.stringify(result.sync));
    assert.match(result.sync.message, /Git settings.*Git LFS settings/);
    assert.equal(result.sync.retry, true);
    assert.ok(!host.script.requests.some((request) => request.path.startsWith(endpoint.pathname)), "the override receives no LFS request");
    assert.equal(existsSync(join(clone, "asset.bin")), false);
  }
});

test("space-142: a hosted LFS upload override stops both the default-branch push and the ordinary records push", async (t) => {
  const host = await startHost();
  const home = await startHome("hosted-lfs-upload", { host });
  t.after(() => home.stop());
  await signIn(home, host);
  await home.client.waitRepository(0, "ada/ada-spex", row => row.sync.phase === "done");

  const name = "hosted-lfs";
  const key = hostKey(host, `ada/${name}-spex`);
  const local = await addFolder(home, gitFolder(name));
  const alternate = new URL(`${host.gitOrigin}/elsewhere.git/info/lfs`);
  git(local.clone, "lfs", "install", "--local");
  git(local.clone, "config", "lfs.pushurl", alternate.href);
  host.script.holdInitialization(Infinity);
  t.after(() => host.script.holdInitialization(null));
  const firstRequest = host.script.requests.length;
  const mark = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local.key, choice: { kind: "create", instance: host.url, name } });
  const initial = await home.client.waitRepository(mark, key, row => row.sync.phase === "stopped" || row.sync.phase === "done", 60_000);
  assert.ok(initial.sync.phase === "stopped" && initial.sync.step === "check" && initial.sync.cause === "git", JSON.stringify(initial.sync));
  assert.match(initial.sync.message, /Git settings.*Git LFS settings/);
  assert.equal(initial.sync.retry, true);
  const bare = bareOf(host, key);
  assert.equal(git(bare, "for-each-ref", "refs/heads/"), "");
  const assertNoUpload = (from: number) => {
    assert.ok(!host.script.requests.slice(from).some(request =>
      request.path.startsWith(alternate.pathname) || request.path.endsWith("/git-receive-pack")
        || request.query.includes("service=git-receive-pack")), "refusal precedes Git and LFS upload requests");
  };
  assertNoUpload(firstRequest);

  const clone = clonePath(home.dataDir, key);
  git(clone, "config", "--unset", "lfs.pushurl");
  const initialized = await home.client.settle("space.sync", { repository: key, placement: host.url }, 60_000);
  assert.equal(initialized.sync.phase, "done", JSON.stringify(initialized.sync));
  assert.equal(git(bare, "show", "main:README.md"), `# ${name}-spex`);
  const head = git(bare, "rev-parse", "spex");
  writeFileSync(join(clone, ".gitattributes"), "*.bin filter=lfs diff=lfs merge=lfs -text\n");
  writeFileSync(join(clone, "asset.bin"), incoming);
  git(clone, "config", "lfs.pushurl", `ssh://git@${alternate.hostname}:1${alternate.pathname}`);
  const laterRequest = host.script.requests.length;
  const updated = await home.client.settle("space.sync", { repository: key, placement: host.url });
  assert.ok(updated.sync.phase === "stopped" && updated.sync.step === "push" && updated.sync.cause === "git", JSON.stringify(updated.sync));
  assert.match(updated.sync.message, /Git settings.*Git LFS settings/);
  assert.equal(updated.sync.retry, true);
  assert.equal(git(bare, "rev-parse", "spex"), head);
  assertNoUpload(laterRequest);
  assert.deepEqual(readFileSync(join(clone, "asset.bin")), incoming);
});

async function externalReader(home: Awaited<ReturnType<typeof startHome>>, url?: string) {
  const { key, clone } = await addFolder(home, gitFolder("external-lfs"));
  const bare = bareRepo();
  await home.client.expectOk("space.remote.set", { repository: key, url: bare });
  const seeded = await home.client.settle("space.sync", { repository: key });
  assert.equal(seeded.sync.phase, "done", JSON.stringify(seeded.sync));
  const peer = fixture.peerClone(bare);
  filters(peer);
  writeFileSync(join(peer, ".gitattributes"), "*.bin filter=lfs diff=lfs merge=lfs -text\n");
  writeFileSync(join(peer, "asset.bin"), incoming);
  commit(peer);
  git(peer, "push", "-q", "origin", "HEAD:spex");
  if (url) await home.client.expectOk("space.remote.set", { repository: key, url });
  filters(clone);
  return { key, clone, bare };
}

test("space-142: an external records Check refuses a configured Space LFS endpoint", async (t) => {
  const host = await startHost();
  const home = await startHome("external-lfs-override", { host });
  t.after(() => home.stop());
  await signIn(home, host);
  await home.client.waitRepository(0, "ada/ada-spex", row => row.sync.phase === "done");
  const { key, clone } = await externalReader(home);
  const endpoint = `${host.gitOrigin}/unlisted/override-spex.git/info/lfs`;
  git(clone, "config", "lfs.url", endpoint);
  git(clone, "config", "lfs.transfer.maxretries", "0");

  const blocked = await home.client.settle("space.fetch", { repository: key });
  assert.equal(blocked.sync.phase, "stopped");
  assert.equal(blocked.sync.step, "check");
  assert.equal(blocked.sync.cause, "git");
  assert.match(blocked.sync.message, /Git settings.*Git LFS settings/);
  assert.equal(blocked.sync.retry, true);
  assert.ok(!host.script.requests.some(request => request.path.startsWith(new URL(endpoint).pathname)));
  assert.equal(existsSync(object(join(clone, ".git"), incoming)), false);
});

test("space-142: an external records Push refuses Git LFS upload overrides into a known Space", async (t) => {
  const host = await startHost();
  const home = await startHome("external-lfs-push-override", { host });
  t.after(() => home.stop());
  await signIn(home, host);
  await home.client.waitRepository(0, "ada/ada-spex", row => row.sync.phase === "done");
  const { key, clone } = await addFolder(home, gitFolder("external-lfs-upload"));
  const bare = bareRepo();
  await home.client.expectOk("space.remote.set", { repository: key, url: bare });
  const seeded = await home.client.settle("space.sync", { repository: key });
  assert.equal(seeded.sync.phase, "done", JSON.stringify(seeded.sync));
  const head = git(bare, "rev-parse", "spex");
  git(clone, "lfs", "install", "--local");
  writeFileSync(join(clone, ".gitattributes"), "*.bin filter=lfs diff=lfs merge=lfs -text\n");
  writeFileSync(join(clone, "asset.bin"), incoming);

  const endpoint = `${host.gitOrigin}/unlisted/upload-spex.git/info/lfs`;
  git(clone, "config", "remote.origin.lfspushurl", "fixture-upload");
  git(clone, "config", `url.${endpoint}.pushInsteadOf`, "fixture-upload");
  const blocked = await home.client.settle("space.sync", { repository: key });
  assert.equal(blocked.sync.phase, "stopped");
  assert.equal(blocked.sync.step, "push");
  assert.equal(blocked.sync.cause, "git");
  assert.match(blocked.sync.message, /Git settings.*Git LFS settings/);
  assert.equal(blocked.sync.retry, true);
  assert.ok(!host.script.requests.some(request => request.path.startsWith(new URL(endpoint).pathname)));
  assert.equal(git(bare, "rev-parse", "spex"), head);

  git(clone, "config", "--unset", "remote.origin.lfspushurl");
  const url = new URL(endpoint);
  git(clone, "config", "--file", ".lfsconfig", "lfs.pushurl", `git@${url.hostname}:${url.pathname.slice(1)}`);
  const tracked = await home.client.settle("space.sync", { repository: key });
  assert.equal(tracked.sync.phase, "stopped");
  assert.equal(tracked.sync.step, "push");
  assert.equal(tracked.sync.cause, "git");
  assert.ok(!host.script.requests.some(request => request.path.startsWith(new URL(endpoint).pathname)));
  assert.equal(git(bare, "rev-parse", "spex"), head);

  rmSync(join(clone, ".lfsconfig"));
  const repaired = await home.client.settle("space.sync", { repository: key });
  assert.equal(repaired.sync.phase, "done", JSON.stringify(repaired.sync));
  assert.deepEqual(readFileSync(object(bare, incoming)), incoming);
});

test("space-142: external SSH records Check authenticates and downloads through Git LFS", { skip: process.platform === "win32" }, async (t) => {
  const authorization = "Bearer external-lfs-fixture";
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    request.resume();
    if (request.headers.authorization !== authorization) {
      response.writeHead(403).end();
    } else if (request.method === "POST" && request.url === "/records.git/info/lfs/objects/batch") {
      response.writeHead(200, { "content-type": "application/vnd.git-lfs+json" }).end(JSON.stringify({
        transfer: "basic", objects: [{
          oid: oid(incoming), size: incoming.length, authenticated: true,
          actions: { download: { href: `${origin}/asset`, header: { Authorization: authorization } } },
        }],
      }));
    } else if (request.method === "GET" && request.url === "/asset") {
      response.writeHead(200, { "content-type": "application/octet-stream" }).end(incoming);
    } else {
      response.writeHead(404).end();
    }
  });
  server.listen(0, "127.0.0.1");
  t.after(() => { server.close(); });
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const ssh = join(fixture.scratch, "lfs-ssh.sh");
  const url = "ssh://git@127.0.0.1:1/records.git";
  const home = await startHome("external-lfs-ssh", {
    env: { GIT_SSH_COMMAND: `"${ssh}"`, GIT_SSH_VARIANT: "ssh" },
  });
  t.after(() => home.stop());
  const { key, clone, bare } = await externalReader(home, url);
  const authenticated = join(fixture.scratch, "lfs-ssh-authenticated");
  const commandLog = join(fixture.scratch, "lfs-ssh-commands");
  // Real Git and Git LFS call the SSH transport. The fixture answers the
  // remote commands locally, without a machine SSH account or keys.
  const auth = JSON.stringify({ href: `${origin}/records.git/info/lfs`, header: { Authorization: authorization } });
  writeFileSync(ssh, [
    "#!/bin/sh",
    `printf '%s\\n' "$*" >> "${commandLog}"`,
    'case " $* " in',
    `  *" git-upload-pack "*) exec git-upload-pack "${bare}" ;;`,
    `  *" git-lfs-authenticate "*" download"*) touch "${authenticated}"; printf '%s\\n' '${auth}' ;;`,
    "  *) exit 1 ;;",
    "esac",
    "",
  ].join("\n"), { mode: 0o755 });
  git(clone, "config", "lfs.transfer.maxretries", "0");

  const fetched = await home.client.settle("space.fetch", { repository: key }, 30_000);
  assert.equal(fetched.sync.phase, "idle", JSON.stringify({
    sync: fetched.sync, requests,
    commands: existsSync(commandLog) ? readFileSync(commandLog, "utf8") : "",
  }));
  assert.ok(existsSync(authenticated), "Git LFS requested its download credential over SSH");
  assert.deepEqual(requests, ["POST /records.git/info/lfs/objects/batch", "GET /asset"]);
  assert.deepEqual(readFileSync(object(join(clone, ".git"), incoming)), incoming);
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
