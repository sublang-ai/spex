// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Public code is served by Git's real smart-HTTP backend. Only the code
// transport child's URL is routed to that loopback server: the saved
// address and each working folder's origin remain their real inputs,
// so a sync also exercises their portable-address contract.

import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { SpaceGit, type GitRunOptions } from "./space-git.js";
import { startGitHttpHost } from "./testing/git-http-host.js";
import { createSpaceHarness, hostFolder, hostKey, repositoryOf } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
const { scratch, git, gitFolder, startHome, startHost, signIn } = fixture;
const execFileAsync = promisify(execFile);
test.after(() => fixture.dispose());

const SEAT = { serverId: "srv_public", serverName: "Public workshop", personId: "1001" };
const SSH = "git@github.com:acme/public.git";
const HTTPS = "https://github.com/acme/public.git";

async function publicCode(t: TestContext) {
  const root = mkdtempSync(join(scratch, "public-code-"));
  const work = gitFolder("public");
  writeFileSync(join(work, "README.md"), "Public code\n");
  git(work, "add", "README.md");
  git(work, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "Public code");
  git(work, "remote", "add", "origin", SSH);
  const bare = join(root, "public.git");
  git(root, "clone", "-q", "--bare", work, bare);
  const server = await startGitHttpHost({ root, username: "unused", password: "unused", anonymous: true });
  t.after(() => server.close());
  return { root, work, bare, server, head: git(bare, "rev-parse", "HEAD") };
}

/** Route recognized HTTPS transports without teaching metadata reads
 * Git's test-only URL mapping, which `remote get-url` would expand. */
function routePublicClones(t: TestContext, url: string): { remotes: string[]; credentialed: boolean[] } {
  const remotes: string[] = [];
  const credentialed: boolean[] = [];
  const run = SpaceGit.prototype.run;
  t.mock.method(SpaceGit.prototype, "run", function (this: SpaceGit, args: string[], options: GitRunOptions = {}) {
    if (args[0] === "clone" && args.some((arg) => arg.startsWith("https://github.com/acme/"))) {
      remotes.push(args.find((arg) => arg.startsWith("https://github.com/acme/"))!);
      credentialed.push(options.credential !== undefined);
      return run.call(this, args, {
        ...options,
        env: {
          ...options.env,
          GIT_CONFIG_COUNT: "2",
          GIT_CONFIG_KEY_1: `url.${url}/.insteadOf`,
          GIT_CONFIG_VALUE_1: "https://github.com/acme/",
        },
      });
    }
    return run.call(this, args, options);
  });
  return { remotes, credentialed };
}

function projectFile(dataDir: string, key: string): string {
  return join(dataDir, "workspace", ...key.split("/"), "project.json");
}

test("projects-44, projects-45, space-63, space-103, space-104: a legacy GitHub SSH code address opens on a fresh seat through public HTTPS without a credential, and its checkout fetches over HTTPS", async (t) => {
  const code = await publicCode(t);
  const host = await startHost();
  const records = host.script.addRepository({ group: "acme", name: "public-spex", project: { format: 1, name: "public", remote: SSH } });
  const key = hostKey(host, "acme/public-spex");
  const observed = routePublicClones(t, code.server.url);
  const seat = await startHome("public-legacy", { host, project: false, env: { GIT_SSH_COMMAND: "false" }, extra: { seat: SEAT } });
  t.after(() => seat.stop());
  await signIn(seat, host);

  const from = seat.client.mark();
  await seat.client.expectOk("space.join", { instance: host.url, hostId: records.id });
  const opened = await seat.client.waitRepository(from, key, (repository) => repository.folder !== null || repository.sync.phase === "stopped", 30_000);
  const folder = join(seat.dataDir, "projects", hostFolder(host), "acme", "public-spex");
  assert.deepEqual([opened.folder, opened.sync.phase, opened.state], [folder, "idle", "reachable"], JSON.stringify(opened.sync));
  assert.deepEqual(observed.remotes, [HTTPS], "legacy shared SSH metadata is normalized before the actual clone");
  assert.deepEqual(observed.credentialed, [false], "the app supplies no credential for public code");
  assert.equal(code.server.credentialed, 0, "the public transport sees no authorization header");
  assert.equal(code.server.refused, 0, "the public transport needs no authentication round trip");
  assert.equal(git(folder, "rev-parse", "HEAD"), code.head);
  assert.equal(git(folder, "config", "--local", "--get", "remote.origin.url"), HTTPS, "later Git operations retain an HTTPS origin");
  assert.deepEqual(await seat.client.expectOk("credential.list", {}), { hosts: [], agents: [] });

  writeFileSync(join(code.work, "README.md"), "A public update\n");
  git(code.work, "add", "README.md");
  git(code.work, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "Public update");
  git(code.work, "push", "-q", code.bare, "HEAD");
  // The HTTP backend runs on this event loop, so the external Git
  // fetch must leave the loop free to serve its transport requests.
  await execFileAsync("git", ["-C", folder, "-c", `url.${code.server.url}/.insteadOf=https://github.com/acme/`, "fetch", "-q", "origin"], {
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" },
    timeout: 20_000,
  });
  assert.equal(git(folder, "rev-parse", "refs/remotes/origin/HEAD"), git(code.work, "rev-parse", "HEAD"));
  assert.equal(code.server.credentialed, 0, "a later fetch also works without credentials");
});

test("storage-3, storage-55, projects-44, projects-45, space-12, space-103, space-104: local SSH and server HTTPS checkouts save one stable portable address through record-sync round trips", async (t) => {
  const code = await publicCode(t);
  const host = await startHost();
  const observed = routePublicClones(t, code.server.url);
  const laptop = await startHome("public-laptop", { host, project: false });
  const seat = await startHome("public-roundtrip", { host, project: false, env: { GIT_SSH_COMMAND: "false" }, extra: { seat: SEAT } });
  t.after(() => laptop.stop());
  t.after(() => seat.stop());
  await signIn(laptop, host);
  await signIn(seat, host);

  const local = (await laptop.client.expectOk("project.register", { path: code.work })).id;
  assert.equal(JSON.parse(readFileSync(projectFile(laptop.dataDir, local), "utf8")).remote, HTTPS, "registration saves a portable address");
  assert.equal(git(code.work, "config", "--local", "--get", "remote.origin.url"), SSH, "registration leaves local SSH configuration alone");
  const key = hostKey(host, "acme/public-spex");
  const picked = laptop.client.mark();
  await laptop.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: host.url, groupId: "2002", name: "public" } });
  const shared = await laptop.client.waitRepository(picked, key, (repository) => repository.sync.phase === "done" || repository.sync.phase === "stopped", 30_000);
  assert.equal(shared.sync.phase, "done", JSON.stringify(shared.sync));
  const records = host.script.repositories.find((repository) => repository.path === "public-spex");
  assert.ok(records);
  const portable = readFileSync(projectFile(laptop.dataDir, key), "utf8");

  const joining = seat.client.mark();
  await seat.client.expectOk("space.join", { instance: host.url, hostId: records.id });
  const opened = await seat.client.waitRepository(joining, key, (repository) => repository.folder !== null || repository.sync.phase === "stopped", 30_000);
  assert.ok(opened.folder !== null, JSON.stringify(opened.sync));
  assert.equal(git(opened.folder, "config", "--local", "--get", "remote.origin.url"), HTTPS);
  assert.equal(readFileSync(projectFile(seat.dataDir, key), "utf8"), portable);

  for (const home of [seat, laptop, seat, laptop]) {
    const synced = await home.client.settle("space.sync", { repository: key }, 30_000);
    assert.equal(synced.sync.phase, "done", JSON.stringify(synced.sync));
    assert.equal(readFileSync(projectFile(home.dataDir, key), "utf8"), portable, "switching devices does not rewrite the shared address");
    assert.equal(git(records.bare, "show", "spex:project.json"), portable.trim(), "the published address stays identical");
  }
  assert.equal(git(code.work, "config", "--local", "--get", "remote.origin.url"), SSH, "sync also leaves the laptop's SSH remote alone");
  assert.deepEqual(observed.remotes, [HTTPS]);
  assert.deepEqual(observed.credentialed, [false]);
  assert.equal(code.server.credentialed, 0);
});

test("storage-3, space-1, space-58: canonical and legacy uppercase GitHub code addresses expose equal inputs to the existing-project picker", async (t) => {
  const host = await startHost();
  host.script.addRepository({ group: "acme", name: "public-spex", project: { format: 1, name: "public", remote: "git@GITHUB.COM:ACME/PUBLIC.git" } });
  const listedKey = hostKey(host, "acme/public-spex");
  const home = await startHome("public-matching", { host, project: false, env: { GIT_SSH_COMMAND: "false" } });
  t.after(() => home.stop());
  await signIn(home, host);
  const work = gitFolder("public");
  git(work, "remote", "add", "origin", SSH);
  const localKey = (await home.client.expectOk("project.register", { path: work })).id;
  assert.equal(JSON.parse(readFileSync(projectFile(home.dataDir, localKey), "utf8")).remote, HTTPS);

  const groups = await home.client.expectOk("space.get", {});
  const listed = repositoryOf(groups, listedKey);
  const local = repositoryOf(groups, localKey);
  // The picker compares code, codeKind and the project name with the
  // records suffix removed. The core supplies the same display value
  // for older SSH metadata and a new canonical registration.
  const matchingInputs = (repository: typeof listed) => [
    repository.code,
    repository.codeKind,
    repository.name.replace(/-spex$/i, "").toLowerCase(),
  ];
  assert.deepEqual(matchingInputs(listed), ["Code: github.com", "elsewhere", "public"]);
  assert.deepEqual(matchingInputs(local), matchingInputs(listed));
  assert.equal(git(work, "config", "--local", "--get", "remote.origin.url"), SSH);
});

test("space-103, space-104: a public HTTPS code download failure retains the real cause without a credential claim, and retry reuses its allocated folder", async (t) => {
  const code = await publicCode(t);
  const host = await startHost();
  const remote = "https://github.com/acme/missing.git";
  const records = host.script.addRepository({ group: "acme", name: "missing-spex", project: { format: 1, name: "missing", remote } });
  const key = hostKey(host, "acme/missing-spex");
  const observed = routePublicClones(t, code.server.url);
  const seat = await startHome("public-missing", { host, project: false, extra: { seat: SEAT } });
  t.after(() => seat.stop());
  await signIn(seat, host);

  const from = seat.client.mark();
  await seat.client.expectOk("space.join", { instance: host.url, hostId: records.id });
  const failed = await seat.client.waitRepository(from, key, (repository) => repository.folder !== null || repository.sync.phase === "stopped", 30_000);
  assert.ok(failed.sync.phase === "stopped", JSON.stringify(failed.sync));
  assert.deepEqual([failed.sync.op, failed.sync.step, failed.folder], ["join", "code", null]);
  assert.match(failed.sync.message, /not found/i);
  assert.doesNotMatch(failed.sync.message, /needs your credential|cannot be read|Settings/);
  assert.equal(failed.sync.credential, undefined, "absence alone establishes no missing credential");
  assert.ok(existsSync(projectFile(seat.dataDir, key)), "the downloaded records remain available");

  git(code.root, "clone", "-q", "--bare", code.work, join(code.root, "missing.git"));
  const retry = seat.client.mark();
  await seat.client.expectOk("space.join", { instance: host.url, hostId: records.id });
  const opened = await seat.client.waitRepository(retry, key, (repository) => repository.folder !== null, 30_000);
  assert.equal(opened.folder, join(seat.dataDir, "projects", hostFolder(host), "acme", "missing-spex"));
  assert.equal(opened.sync.phase, "idle");
  assert.equal(git(opened.folder!, "rev-parse", "HEAD"), code.head);
  assert.deepEqual(observed.remotes, [remote, remote]);
  assert.deepEqual(observed.credentialed, [false, false]);
  assert.equal(code.server.credentialed, 0);
  assert.equal(repositoryOf(await seat.client.expectOk("space.get", {}), key).folder, opened.folder);
});

test("space-103, space-104: a public HTTPS network failure keeps its transport cause without requesting a credential", async (t) => {
  const code = await publicCode(t);
  await code.server.close();
  const host = await startHost();
  const records = host.script.addRepository({ group: "acme", name: "public-spex", project: { format: 1, name: "public", remote: HTTPS } });
  const key = hostKey(host, "acme/public-spex");
  const observed = routePublicClones(t, code.server.url);
  const seat = await startHome("public-unreachable", { host, project: false, extra: { seat: SEAT } });
  t.after(() => seat.stop());
  await signIn(seat, host);

  const from = seat.client.mark();
  await seat.client.expectOk("space.join", { instance: host.url, hostId: records.id });
  const failed = await seat.client.waitRepository(from, key, (repository) => repository.folder !== null || repository.sync.phase === "stopped", 30_000);
  assert.ok(failed.sync.phase === "stopped", JSON.stringify(failed.sync));
  assert.deepEqual([failed.sync.op, failed.sync.step, failed.folder], ["join", "code", null]);
  assert.match(failed.sync.message, /Failed to connect|Couldn't connect|Connection refused|Could not connect/i);
  assert.doesNotMatch(failed.sync.message, /needs your credential|cannot be read|Settings/);
  assert.equal(failed.sync.credential, undefined, "a failed connection establishes no missing credential");
  assert.ok(existsSync(projectFile(seat.dataDir, key)), "the downloaded records remain available");
  assert.deepEqual(await seat.client.expectOk("credential.list", {}), { hosts: [], agents: [] });
  assert.deepEqual(observed.remotes, [HTTPS]);
  assert.deepEqual(observed.credentialed, [false]);
});
