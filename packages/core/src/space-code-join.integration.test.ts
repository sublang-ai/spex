// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Code joining runs the real core, broker and credential helper against
// Git's smart-HTTP backend, with no machine credentials or live host.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GIT_CREDENTIAL_FILE_ENV } from "./git-credential.js";
import { SpaceGit, type GitRunOptions } from "./space-git.js";
import { startGitHttpHost } from "./testing/git-http-host.js";
import { holdingFetch } from "./testing/holding-fetch.js";
import { clonePath, createSpaceHarness, repositoryOf } from "./testing/space-harness.js";
import { STANDIN_STORAGE, type StandinHost } from "./testing/standin-host.js";
import type { Store } from "./store.js";

const fixture = createSpaceHarness();
const { scratch, git, startHome, startHost, signIn } = fixture;
test.after(() => fixture.dispose());

const HOST_OWN = "ada/ada-spex";
const HOST_NAME = "Stand-in Git host";
const PAIR_GUIDANCE = "The spex repository is here; choose a folder for its code to pair it.";

function privateCode(host: StandinHost, name: string): { remote: string; bare: string } {
  const code = host.script.addRepository({ group: "acme", name });
  return { remote: `${host.gitOrigin}/${STANDIN_STORAGE}/acme/${name}.git`, bare: code.bare };
}

function credentialRequests(host: StandinHost): number {
  return host.script.requests.filter((request) => request.path === "/api/v1/host/credential").length;
}

/** Observe the actual code child without replacing its transport or
 * credential helper; the credential's bytes never leave its file. */
function inspectCredential(options: GitRunOptions): { file: string; mode: number; args: string[] } {
  const file = options.credential?.env[GIT_CREDENTIAL_FILE_ENV] ?? "";
  return { file, mode: file ? statSync(file).mode & 0o777 : 0, args: options.credential?.configArgs ?? [] };
}

test("space-37, projects-20, git-host-14: joining private code uses the brokered helper, disposes it and keeps the remote unchanged", async (t) => {
  const host = await startHost();
  const code = privateCode(host, "private-code");
  const records = host.script.addRepository({ group: "acme", name: "private-spex", project: { format: 1, name: "private", remote: code.remote } });
  const home = await startHome("join-private-code", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const fromSignIn = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(fromSignIn, HOST_OWN, (repository) => repository.sync.phase === "done");
  for (const [language, label] of [["en", "Code on this instance"], ["zh", "此实例上的代码"]] as const) {
    await home.client.expectOk("language.set", { language });
    assert.equal(repositoryOf(await home.client.expectOk("space.get", {}), "acme/private-spex").code, label, "the listed row hides the transport URL in both languages");
  }
  await home.client.expectOk("language.set", { language: "en" });

  let observed: ReturnType<typeof inspectCredential> | undefined;
  const run = SpaceGit.prototype.run;
  t.mock.method(SpaceGit.prototype, "run", function (this: SpaceGit, args: string[], options: GitRunOptions = {}) {
    if (args[0] === "clone" && args.includes(code.remote)) observed = inspectCredential(options);
    return run.call(this, args, options);
  });
  const before = credentialRequests(host);
  const folder = join(mkdtempSync(join(scratch, "private-code-")), "code");
  const from = home.client.mark();
  await home.client.expectOk("space.join", { hostId: records.id, folder });
  const joined = await home.client.waitRepository(from, "acme/private-spex", (repository) => repository.folder !== null || repository.sync.phase === "stopped");
  assert.deepEqual([joined.state, joined.folder, joined.sync.phase], ["reachable", folder, "idle"], JSON.stringify(joined.sync));
  assert.equal(git(folder, "rev-parse", "HEAD"), git(code.bare, "rev-parse", "main"));
  assert.equal(git(folder, "remote", "get-url", "origin"), code.remote);
  for (const [language, label] of [["en", "Code on this instance"], ["zh", "此实例上的代码"]] as const) {
    await home.client.expectOk("language.set", { language });
    assert.equal(repositoryOf(await home.client.expectOk("space.get", {}), "acme/private-spex").code, label, "the joined row hides the transport URL in both languages");
  }
  await home.client.expectOk("language.set", { language: "en" });
  assert.equal(credentialRequests(host) - before, 2, "records and code each ask the broker");
  assert.ok(observed?.file, "the code child receives the brokered helper");
  assert.equal(observed.mode, 0o600);
  assert.deepEqual(observed.args.slice(0, 3), ["-c", "credential.helper=", "-c"]);
  assert.ok(!existsSync(observed.file), "the code child's credential file is disposed");
  assert.ok(!readFileSync(join(folder, ".git", "config"), "utf8").includes("credential.helper"), "the helper is not persisted");
  const status = await home.client.expectOk("project.status", { projectId: "acme/private-spex" });
  assert.equal(status.branch, "main");
  assert.equal(status.originUrl, undefined, "local status does not expose the instance's Git URL");
  const forge = await home.client.expectOk("forge.items", { projectId: "acme/private-spex", refresh: true });
  const instanceGuidance = "Issues and PRs come from GitHub; this project's code is on this instance.";
  assert.equal(forge.guidance, instanceGuidance);
  // A cache written by an earlier app may hold its old raw guidance.
  const core = home.service as unknown as { store: Store };
  const cachedAt = Date.now();
  core.store.setForgeCache("acme/private-spex", { at: cachedAt, state: { ...forge, guidance: `Code at ${code.remote}` } });
  const cached = await home.client.expectOk("forge.items", { projectId: "acme/private-spex" });
  assert.deepEqual([cached.guidance, cached.at], [instanceGuidance, cachedAt], "cached guidance obeys the current origin rule");
  await home.stop();
  const again = await startHome("join-private-code-again", { dataDir: home.dataDir, project: false });
  t.after(() => again.stop());
  const restarted = again.service as unknown as { hostClient: { fetchImpl: typeof fetch } };
  const holds = holdingFetch(restarted.hostClient.fetchImpl);
  restarted.hostClient.fetchImpl = holds.fetch;
  const description = holds.hold((path) => path === "/api/v1/host");
  t.after(() => description.release());
  const beforeLocal = host.script.requests.length;
  const initialStatus = await again.client.expectOk("project.status", { projectId: "acme/private-spex" });
  const initialForge = await again.client.expectOk("forge.items", { projectId: "acme/private-spex" });
  assert.equal(initialStatus.originUrl, undefined);
  assert.deepEqual([initialForge.guidance, initialForge.at], ["Issues and PRs come from GitHub; this project's code is on a remote.", cachedAt]);
  assert.equal(host.script.requests.length, beforeLocal, "local status and cached forge guidance trigger no host read");
  const reread = again.client.mark();
  const initial = again.client.expectOk("space.get", {});
  await description.reached;
  assert.equal(repositoryOf(await initial, "acme/private-spex").code, "Code on a remote", "the initial reply withholds the remote before the description arrives");
  description.release();
  await again.client.waitRepository(reread, "acme/private-spex", (repository) => repository.code === "Code on this instance");
  const afterRead = await again.client.expectOk("forge.items", { projectId: "acme/private-spex" });
  assert.deepEqual([afterRead.guidance, afterRead.at], [instanceGuidance, cachedAt], "the same cache follows the newly reported origin");
});

test("space-37: joining code at another origin keeps that device's credentials and asks no code credential of the broker", async (t) => {
  const host = await startHost();
  const root = mkdtempSync(join(scratch, "other-origin-"));
  const bare = join(root, "code.git");
  git(root, "clone", "-q", "--bare", privateCode(host, "other-code").bare, bare);
  const other = await startGitHttpHost({ root, username: "device", password: "device-secret" });
  t.after(() => other.close());
  const remote = `${other.url}/code.git`;
  const records = host.script.addRepository({ group: "acme", name: "other-spex", project: { format: 1, name: "other", remote } });
  const home = await startHome("join-other-code", {
    host, project: false, extra: { signIn: "browser" },
    env: {
      GIT_CONFIG_COUNT: "2", GIT_CONFIG_KEY_1: "credential.helper",
      GIT_CONFIG_VALUE_1: "!f() { test \"$1\" = get && printf 'username=device\\npassword=device-secret\\n'; }; f",
    },
  });
  t.after(() => home.stop());
  const fromSignIn = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(fromSignIn, HOST_OWN, (repository) => repository.sync.phase === "done");
  let observed: GitRunOptions | undefined;
  const run = SpaceGit.prototype.run;
  t.mock.method(SpaceGit.prototype, "run", function (this: SpaceGit, args: string[], options: GitRunOptions = {}) {
    if (args[0] === "clone" && args.includes(remote)) observed = options;
    return run.call(this, args, options);
  });
  const before = credentialRequests(host);
  const folder = join(mkdtempSync(join(scratch, "other-code-")), "code");
  const from = home.client.mark();
  await home.client.expectOk("space.join", { hostId: records.id, folder });
  const joined = await home.client.waitRepository(from, "acme/other-spex", (repository) => repository.folder !== null || repository.sync.phase === "stopped");
  assert.deepEqual([joined.state, joined.folder, joined.sync.phase], ["reachable", folder, "idle"], JSON.stringify(joined.sync));
  assert.equal(git(folder, "remote", "get-url", "origin"), remote);
  assert.equal((await home.client.expectOk("project.status", { projectId: "acme/other-spex" })).originUrl, remote);
  assert.equal((await home.client.expectOk("forge.items", { projectId: "acme/other-spex" })).guidance, "Issues and PRs come from GitHub; this project's origin is at 127.0.0.1.");
  assert.equal(credentialRequests(host) - before, 1, "only the records clone asks the broker");
  assert.ok(observed && observed.credential === undefined, "the code child's device helper is preserved");
});

for (const failure of ["unauthorized", "server", "credential", "occupied"] as const) {
  test(`space-37: a private code join stopped by ${failure} keeps its records and existing files, with no Git origin in the failure`, async (t) => {
    const host = await startHost();
    const code = privateCode(host, `code-${failure}`);
    const key = `acme/${failure}-spex`;
    const records = host.script.addRepository({ group: "acme", name: `${failure}-spex`, project: { format: 1, name: failure, remote: code.remote } });
    const home = await startHome(`join-code-${failure}`, { host, project: false, extra: { signIn: "browser" } });
    t.after(() => home.stop());
    const fromSignIn = home.client.mark();
    await signIn(home, host);
    await home.client.waitRepository(fromSignIn, HOST_OWN, (repository) => repository.sync.phase === "done");
    const folder = join(mkdtempSync(join(scratch, `${failure}-`)), "code");
    const marker = join(folder, "keep.txt");
    if (failure === "occupied") { mkdirSync(folder); writeFileSync(marker, "keep these bytes\n"); }
    const run = SpaceGit.prototype.run;
    const credentials: string[] = [];
    let codeChildren = 0;
    t.mock.method(SpaceGit.prototype, "run", async function (this: SpaceGit, args: string[], options: GitRunOptions = {}) {
      const cloning = args[0] === "clone";
      if (cloning && args.includes(code.remote)) {
        codeChildren += 1;
        credentials.push(inspectCredential(options).file);
        if (failure === "unauthorized") host.script.unauthorizeTransport(true);
        if (failure === "server") host.script.failTransport(500);
      }
      const result = await run.call(this, args, options);
      if (failure === "credential" && cloning && !args.includes(code.remote) && result.code === 0) host.script.revokeDevices();
      return result;
    });
    const from = home.client.mark();
    await home.client.expectOk("space.join", { hostId: records.id, folder });
    const stopped = await home.client.waitRepository(from, key, (repository) => repository.sync.phase === "stopped");
    assert.ok(stopped.sync.phase === "stopped");
    assert.deepEqual([stopped.sync.op, stopped.sync.step, stopped.folder, stopped.sync.retry], ["join", "code", null, false]);
    assert.equal(stopped.sync.guidance, PAIR_GUIDANCE);
    assert.ok(!`${stopped.sync.message} ${stopped.sync.guidance}`.includes(host.url), JSON.stringify(stopped.sync));
    if (failure === "unauthorized" || failure === "credential") assert.deepEqual([stopped.sync.cause, stopped.sync.message], ["reauth", "Sign in again"]);
    if (failure === "server") assert.equal(stopped.sync.message, `${HOST_NAME} answered with an error (HTTP 500)`);
    if (failure === "credential") assert.equal(codeChildren, 0, "the broker's refusal stops before a code child runs");
    else assert.ok(credentials.length === 1 && credentials[0] && !existsSync(credentials[0]), "the failed child's helper is disposed");
    const clone = clonePath(home.dataDir, key);
    assert.ok(existsSync(join(clone, ".git")), "the records clone stays");
    assert.equal(JSON.parse(readFileSync(join(clone, "project.json"), "utf8")).remote, code.remote);
    assert.ok(!(await home.client.expectOk("project.list", {})).some((project) => project.id === key), "no failed folder is paired");
    if (failure === "occupied") assert.equal(readFileSync(marker, "utf8"), "keep these bytes\n");
  });
}
