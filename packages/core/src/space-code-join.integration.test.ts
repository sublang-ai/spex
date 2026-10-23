// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Code joining runs the real core, broker and credential helper against
// Git's smart-HTTP backend, with no machine credentials or live host; a
// home signed in to two stand-in instances has a project's code brokered
// and read by its project's instance, or by the instance of another of
// its placements whose Git origin the code lies under (projects-37,
// DR-127, DR-128).

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GIT_CREDENTIAL_FILE_ENV } from "./git-credential.js";
import { canonicalOrigin } from "./instance.js";
import { encodePlacementFile, PLACEMENTS_DIR } from "./placements.js";
import { SpaceGit, type GitRunOptions } from "./space-git.js";
import { startGitHttpHost } from "./testing/git-http-host.js";
import { holdingFetch } from "./testing/holding-fetch.js";
import { clonePath, createSpaceHarness, hostFolder, hostKey, instanceOf, repositoryOf, stringsOf } from "./testing/space-harness.js";
import { type StandinHost } from "./testing/standin-host.js";
import type { GroupsState, ServerMessage } from "./protocol.js";
import type { Store } from "./store.js";

const fixture = createSpaceHarness();
const { scratch, git, gitFolder, addFolder, startHome, startHost, signIn, signOut, peerClone, peerPush } = fixture;
test.after(() => fixture.dispose());

const HOST_OWN = "ada/ada-spex";
const HOST_NAME = "Stand-in Git host";
const PAIR_GUIDANCE = "The spex repository is here; choose a folder for its code to pair it.";

function privateCode(host: StandinHost, name: string): { remote: string; bare: string } {
  const code = host.script.addRepository({ group: "acme", name });
  return { remote: `${host.gitOrigin}/${host.storage}/acme/${name}.git`, bare: code.bare };
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
  const privateKey = hostKey(host, "acme/private-spex");
  const code = privateCode(host, "private-code");
  const records = host.script.addRepository({ group: "acme", name: "private-spex", project: { format: 1, name: "private", remote: code.remote } });
  const home = await startHome("join-private-code", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const fromSignIn = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(fromSignIn, HOST_OWN, (repository) => repository.sync.phase === "done");
  for (const [language, label] of [["en", "Code on this instance"], ["zh", "此实例上的代码"]] as const) {
    await home.client.expectOk("language.set", { language });
    assert.equal(repositoryOf(await home.client.expectOk("space.get", {}), privateKey).code, label, "the listed row hides the transport URL in both languages");
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
  await home.client.expectOk("space.join", { instance: host.url, hostId: records.id, folder });
  const joined = await home.client.waitRepository(from, privateKey, (repository) => repository.folder !== null || repository.sync.phase === "stopped");
  assert.deepEqual([joined.state, joined.folder, joined.sync.phase], ["reachable", folder, "idle"], JSON.stringify(joined.sync));
  assert.equal(git(folder, "rev-parse", "HEAD"), git(code.bare, "rev-parse", "main"));
  assert.equal(git(folder, "remote", "get-url", "origin"), code.remote);
  for (const [language, label] of [["en", "Code on this instance"], ["zh", "此实例上的代码"]] as const) {
    await home.client.expectOk("language.set", { language });
    assert.equal(repositoryOf(await home.client.expectOk("space.get", {}), privateKey).code, label, "the joined row hides the transport URL in both languages");
  }
  await home.client.expectOk("language.set", { language: "en" });
  assert.equal(credentialRequests(host) - before, 2, "records and code each ask the broker");
  assert.ok(observed?.file, "the code child receives the brokered helper");
  assert.equal(observed.mode, 0o600);
  assert.deepEqual(observed.args.slice(0, 3), ["-c", "credential.helper=", "-c"]);
  assert.ok(!existsSync(observed.file), "the code child's credential file is disposed");
  assert.ok(!readFileSync(join(folder, ".git", "config"), "utf8").includes("credential.helper"), "the helper is not persisted");
  const status = await home.client.expectOk("project.status", { projectId: privateKey });
  assert.equal(status.branch, "main");
  assert.equal(status.originUrl, undefined, "local status does not expose the instance's Git URL");
  const forge = await home.client.expectOk("forge.items", { projectId: privateKey, refresh: true });
  const instanceGuidance = "Issues and PRs come from GitHub; this project's code is on this instance.";
  assert.equal(forge.guidance, instanceGuidance);
  // A cache written by an earlier app may hold its old raw guidance.
  const core = home.service as unknown as { store: Store };
  const cachedAt = Date.now();
  core.store.setForgeCache(privateKey, { at: cachedAt, state: { ...forge, guidance: `Code at ${code.remote}` } });
  const cached = await home.client.expectOk("forge.items", { projectId: privateKey });
  assert.deepEqual([cached.guidance, cached.at], [instanceGuidance, cachedAt], "cached guidance obeys the current origin rule");
  await home.stop();
  const again = await startHome("join-private-code-again", { dataDir: home.dataDir, project: false });
  t.after(() => again.stop());
  // The client the restarted core keeps for the home's one instance
  // (DR-127).
  const restarted = (again.service as unknown as { space: { instanceAt(origin: string): { client: { fetchImpl: typeof fetch } } } }).space.instanceAt(host.url);
  const holds = holdingFetch(restarted.client.fetchImpl);
  restarted.client.fetchImpl = holds.fetch;
  const description = holds.hold((path) => path === "/api/v1/host");
  t.after(() => description.release());
  const beforeLocal = host.script.requests.length;
  const initialStatus = await again.client.expectOk("project.status", { projectId: privateKey });
  const initialForge = await again.client.expectOk("forge.items", { projectId: privateKey });
  assert.equal(initialStatus.originUrl, undefined);
  assert.deepEqual([initialForge.guidance, initialForge.at], ["Issues and PRs come from GitHub; this project's code is on a remote.", cachedAt]);
  assert.equal(host.script.requests.length, beforeLocal, "local status and cached forge guidance trigger no host read");
  const reread = again.client.mark();
  const initial = again.client.expectOk("space.get", {});
  await description.reached;
  assert.equal(repositoryOf(await initial, privateKey).code, "Code on a remote", "the initial reply withholds the remote before the description arrives");
  description.release();
  await again.client.waitRepository(reread, privateKey, (repository) => repository.code === "Code on this instance");
  const afterRead = await again.client.expectOk("forge.items", { projectId: privateKey });
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
  const otherKey = hostKey(host, "acme/other-spex");
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
  await home.client.expectOk("space.join", { instance: host.url, hostId: records.id, folder });
  const joined = await home.client.waitRepository(from, otherKey, (repository) => repository.folder !== null || repository.sync.phase === "stopped");
  assert.deepEqual([joined.state, joined.folder, joined.sync.phase], ["reachable", folder, "idle"], JSON.stringify(joined.sync));
  assert.equal(git(folder, "remote", "get-url", "origin"), remote);
  assert.equal((await home.client.expectOk("project.status", { projectId: otherKey })).originUrl, remote);
  assert.equal((await home.client.expectOk("forge.items", { projectId: otherKey })).guidance, "Issues and PRs come from GitHub; this project's origin is at 127.0.0.1.");
  assert.equal(credentialRequests(host) - before, 1, "only the records clone asks the broker");
  assert.ok(observed && observed.credential === undefined, "the code child's device helper is preserved");
});

for (const failure of ["unauthorized", "server", "credential", "occupied"] as const) {
  test(`space-37: a private code join stopped by ${failure} keeps its records and existing files, with no Git origin in the failure`, async (t) => {
    const host = await startHost();
    const code = privateCode(host, `code-${failure}`);
    const key = hostKey(host, `acme/${failure}-spex`);
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
    await home.client.expectOk("space.join", { instance: host.url, hostId: records.id, folder });
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

// -- two instances (DR-127) --------------------------------------------------

type Home = Awaited<ReturnType<typeof startHome>>;

const BOB = { id: "1002", login: "bob", displayName: "Bob" };
const SECOND_NAME = "Second stand-in";
const INSTANCE_GUIDANCE = "Issues and PRs come from GitHub; this project's code is on this instance.";
const REMOTE_GUIDANCE = "Issues and PRs come from GitHub; this project's code is on a remote.";

/** A home signed in at the first stand-in instance as `ada`, your own
 * group's repository pushed there, then at the second, on a Git backend
 * of its own, as `bob`: the first the home's default instance. */
async function twoInstances(name: string): Promise<{ first: StandinHost; second: StandinHost; home: Home }> {
  const first = await startHost();
  const second = await startHost({ displayName: SECOND_NAME, person: BOB });
  const home = await startHome(name, { host: first, project: false });
  const from = home.client.mark();
  await signIn(home, first);
  await home.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  await signIn(home, second);
  return { first, second, home };
}

/** A Refresh, then the state once a read of every listed instance begun
 * since is held (git-host-5). */
async function readEach(home: Home): Promise<GroupsState> {
  const asked = Date.now();
  const from = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  return home.client.waitSpace(from, (state) => state.instances.every((instance) => instance.read.phase === "idle" && (instance.readAt ?? 0) >= asked), 30_000);
}

/** What names something behind either instance in the strings a client
 * was sent (space-1, space-30): a URL under an instance's own — a Git
 * URL or a page — its storage group, or the Git system's name. */
function leaks(hosts: StandinHost[], values: unknown[]): string[] {
  return values.flatMap(stringsOf).filter((text) => hosts.some((host) => text.includes(`${host.url}/`) || text.includes(host.storage)) || /gitlab/i.test(text));
}

/** Every Groups state broadcast to a client, the sign-in's own pages
 * aside (space-3). */
function broadcasts(messages: ServerMessage[]): GroupsState[] {
  return messages.flatMap((message) => message.type === "space.state" ? [{ ...message.state, signIn: { phase: "idle" as const } }] : []);
}

test("projects-39, projects-37, space-83, space-1, space-63, space-15: signed in to two instances on Git backends of their own, the first listing a project whose code is private at the first's Git origin and c-spex whose code is private at the second's, Join with this device's Git holding no credential clones the first's code with a credential the first brokered, while the second's is brokered by neither, refused by the second's transport and stopped at Code with no code cloned and no URL under either Git origin said; c-spex reads Code on a remote, listed and joined", async (t) => {
  const { first, second, home } = await twoInstances("code-by-instance");
  t.after(() => home.stop());
  // Each instance serves private code through its real transport; both
  // projects' spex repositories lie in the first's `acme`.
  const firstCode = privateCode(first, "alpha-code");
  const secondCode = privateCode(second, "c-code");
  const alpha = first.script.addRepository({ group: "acme", name: "alpha-spex", project: { format: 1, name: "alpha", remote: firstCode.remote } });
  const c = first.script.addRepository({ group: "acme", name: "c-spex", project: { format: 1, name: "c", remote: secondCode.remote } });
  const alphaKey = hostKey(first, "acme/alpha-spex");
  const cKey = hostKey(first, "acme/c-spex");
  const codePath = (remote: string): string => new URL(remote).pathname;

  // Both instances reported, the first's code reads on this instance and
  // c-spex's on a remote, never as its URL (space-1).
  const listed = await readEach(home);
  const rowOf = (state: GroupsState, key: string): [string, string | null, string | null] => {
    const row = repositoryOf(state, key);
    return [row.state, row.instance, row.code];
  };
  assert.deepEqual(rowOf(listed, alphaKey), ["absent", first.url, "Code on this instance"]);
  assert.deepEqual(rowOf(listed, cKey), ["absent", first.url, "Code on a remote"]);

  const codeChildren: { remote: string; credential: boolean }[] = [];
  const run = SpaceGit.prototype.run;
  t.mock.method(SpaceGit.prototype, "run", function (this: SpaceGit, args: string[], options: GitRunOptions = {}) {
    for (const remote of [firstCode.remote, secondCode.remote]) {
      if (args[0] === "clone" && args.includes(remote)) codeChildren.push({ remote, credential: options.credential !== undefined });
    }
    return run.call(this, args, options);
  });

  // The first's code clones with a credential the first brokered, its
  // transport recording the first as its issuer (projects-37).
  let before = [credentialRequests(first), credentialRequests(second)];
  const alphaFolder = join(mkdtempSync(join(scratch, "alpha-code-")), "code");
  let mark = home.client.mark();
  await home.client.expectOk("space.join", { instance: first.url, hostId: alpha.id, folder: alphaFolder });
  const joined = await home.client.waitRepository(mark, alphaKey, (repository) => repository.folder !== null || repository.sync.phase === "stopped", 30_000);
  assert.deepEqual([joined.state, joined.folder, joined.sync.phase], ["reachable", alphaFolder, "idle"], JSON.stringify(joined.sync));
  assert.equal(git(alphaFolder, "rev-parse", "HEAD"), git(firstCode.bare, "rev-parse", "main"));
  assert.deepEqual(codeChildren, [{ remote: firstCode.remote, credential: true }], "the code child presents the brokered helper");
  // Git's own number of helper calls varies by its version (2.55 asks once more), so the first's count is a floor.
  const brokered = [credentialRequests(first) - before[0], credentialRequests(second) - before[1]];
  assert.ok(brokered[0] >= 2 && brokered[1] === 0, `the first brokers the records and the code, the second nothing: ${JSON.stringify(brokered)}`);
  const fetched = first.script.transportCredentials.filter((entry) => entry.path.startsWith(`${codePath(firstCode.remote)}/`));
  assert.ok(fetched.length > 0 && fetched.every((entry) => entry.instance === first.url), JSON.stringify(fetched));

  // The second's code is brokered by neither instance — the first's
  // broker asked for the records alone — and the second's transport
  // refuses Git's request, which carries no credential: the join stops at
  // Code in Git's words with no code cloned, the records clone kept
  // (projects-37, space-63).
  before = [credentialRequests(first), credentialRequests(second)];
  const sentSecond = second.script.requests.length;
  const cFolder = join(mkdtempSync(join(scratch, "c-code-")), "code");
  mark = home.client.mark();
  await home.client.expectOk("space.join", { instance: first.url, hostId: c.id, folder: cFolder });
  const stopped = await home.client.waitRepository(mark, cKey, (repository) => repository.sync.phase === "stopped", 30_000);
  assert.ok(stopped.sync.phase === "stopped");
  assert.deepEqual([stopped.sync.op, stopped.sync.step, stopped.sync.cause, stopped.sync.guidance, stopped.sync.retry, stopped.folder], ["join", "code", "git", PAIR_GUIDANCE, false, null], JSON.stringify(stopped.sync));
  assert.deepEqual(codeChildren.slice(1), [{ remote: secondCode.remote, credential: false }], "the code child presents no credential of the app's");
  assert.deepEqual([credentialRequests(first) - before[0], credentialRequests(second) - before[1]], [1, 0], "neither instance brokers the code");
  const refused = second.script.requests.slice(sentSecond).filter((request) => request.path.startsWith(`${codePath(secondCode.remote)}/`));
  assert.ok(refused.length > 0 && refused.every((request) => !request.authorization), JSON.stringify(refused));
  assert.ok(!first.script.transportCredentials.some((entry) => entry.path.startsWith(`${codePath(secondCode.remote)}/`)), "no credential reached the second's code");
  assert.ok(!second.script.transportCredentials.some((entry) => entry.path.startsWith(`${codePath(secondCode.remote)}/`)), "no credential reached the second's code");
  assert.equal(existsSync(cFolder), false, "no code is cloned");
  assert.ok(existsSync(join(clonePath(home.dataDir, cKey), ".git")), "the records clone stays");
  assert.ok(!(await home.client.expectOk("project.list", {})).some((project) => project.id === cKey), "no folder is paired");
  const said = `${stopped.sync.message} ${stopped.sync.guidance}`;
  for (const host of [first, second]) assert.ok(!said.includes(host.gitOrigin) && !said.includes(`${host.url}/`), said);

  // Joined, c-spex still reads Code on a remote, and nothing behind
  // either instance was said (space-1, space-83).
  const after = await home.client.expectOk("space.get", {});
  assert.deepEqual(rowOf(after, cKey), ["reachable", first.url, "Code on a remote"]);
  assert.deepEqual(rowOf(after, alphaKey), ["reachable", first.url, "Code on this instance"]);
  assert.deepEqual(leaks([first, second], [...broadcasts(home.client.messages), after]), []);
});

test("projects-41, projects-37, space-63, storage-36: signed in to two instances on Git backends of their own, the first listing a project's spex repository whose placement file names a placement at the second and whose code is private at the second's Git origin, Join at the first with this device's Git holding no credential clones the code with a credential the second brokered, the first's broker asked for the records alone", async (t) => {
  const { first, second, home } = await twoInstances("code-by-placement");
  t.after(() => home.stop());
  // The project's code is private at the second; its spex repository
  // lies in the first's `acme` and is placed at the second's too, its
  // file there committed by another device (storage-36).
  const code = privateCode(second, "d-code");
  const records = first.script.addRepository({ group: "acme", name: "d-spex", project: { format: 1, name: "d", remote: code.remote } });
  const there = second.script.addRepository({ group: "acme", name: "d-spex" });
  await peerPush(peerClone(records.bare), (dir) => {
    mkdirSync(join(dir, PLACEMENTS_DIR), { recursive: true });
    writeFileSync(join(dir, PLACEMENTS_DIR, `${hostFolder(second)}.yaml`), encodePlacementFile(canonicalOrigin(second.url), there.id));
  });
  const key = hostKey(first, "acme/d-spex");
  const codePath = new URL(code.remote).pathname;
  await readEach(home);

  const codeChildren: boolean[] = [];
  const run = SpaceGit.prototype.run;
  t.mock.method(SpaceGit.prototype, "run", function (this: SpaceGit, args: string[], options: GitRunOptions = {}) {
    if (args[0] === "clone" && args.includes(code.remote)) codeChildren.push(options.credential !== undefined);
    return run.call(this, args, options);
  });

  // The join's records come through the first, the instance it joins
  // at; its code through the second, the instance of the placement its
  // file names whose Git origin the code lies under (projects-37).
  const before = [credentialRequests(first), credentialRequests(second)];
  const folder = join(mkdtempSync(join(scratch, "d-code-")), "code");
  const mark = home.client.mark();
  await home.client.expectOk("space.join", { instance: first.url, hostId: records.id, folder });
  const joined = await home.client.waitRepository(mark, key, (repository) => repository.folder !== null || repository.sync.phase === "stopped", 30_000);
  assert.deepEqual([joined.folder, joined.sync.phase, joined.instance], [folder, "idle", first.url], JSON.stringify(joined.sync));
  assert.equal(git(folder, "rev-parse", "HEAD"), git(code.bare, "rev-parse", "main"), "the code is cloned");
  assert.ok(existsSync(join(clonePath(home.dataDir, key), PLACEMENTS_DIR, `${hostFolder(second)}.yaml`)), "the clone holds the file naming the second");
  assert.deepEqual(codeChildren, [true], "the code child presents the brokered helper");
  const brokeredApart = [credentialRequests(first) - before[0], credentialRequests(second) - before[1]];
  assert.ok(brokeredApart[0] >= 1 && brokeredApart[1] >= 1, `the first brokers the records, the second the code: ${JSON.stringify(brokeredApart)}`);
  const fetched = second.script.transportCredentials.filter((entry) => entry.path.startsWith(`${codePath}/`));
  assert.ok(fetched.length > 0 && fetched.every((entry) => entry.instance === second.url), JSON.stringify(fetched));
  assert.ok(!first.script.transportCredentials.some((entry) => entry.path.startsWith(`${codePath}/`)), "the first's credential reached no code");
  assert.ok((await home.client.expectOk("project.list", {})).some((project) => project.id === key && project.path === folder), "the folder is paired");
});

test("projects-38, projects-7, projects-36: signed in to two instances on Git backends of their own, the first the default, a project at the first reads its forge guidance and project.status by the first's reported Git origin — code at the first's on this instance, at the second's on a remote, at another origin named with its credential-free URL — and a local-only project by the default instance's; after a restart with the second signed out and the first read anew, code at another origin reads on a remote with no URL", async (t) => {
  const { first, second, home } = await twoInstances("code-kinds");
  t.after(() => home.stop());
  // Three projects at the first, each a working folder whose `origin`
  // is its code, joined to a spex repository in the first's `acme`, and
  // one local only.
  const origins: Record<string, string> = {
    first: `${first.gitOrigin}/${first.storage}/acme/one-code.git`,
    second: `${second.gitOrigin}/${second.storage}/acme/two-code.git`,
    other: "https://dev@code.example.test/team/three.git",
  };
  const records = Object.fromEntries(Object.keys(origins).map((name) => [name, first.script.addRepository({ group: "acme", name: `${name}-spex` })]));
  await readEach(home);
  const keys: Record<string, string> = {};
  for (const [name, remote] of Object.entries(origins)) {
    const folder = gitFolder(`${name}-code`);
    git(folder, "remote", "add", "origin", remote);
    const key = hostKey(first, `acme/${name}-spex`);
    const mark = home.client.mark();
    await home.client.expectOk("space.join", { instance: first.url, hostId: records[name].id, folder });
    const joined = await home.client.waitRepository(mark, key, (repository) => repository.folder !== null || repository.sync.phase === "stopped", 30_000);
    assert.deepEqual([joined.folder, joined.instance], [folder, first.url], JSON.stringify(joined.sync));
    keys[name] = key;
  }
  const local = gitFolder("local-code");
  git(local, "remote", "add", "origin", `${first.gitOrigin}/${first.storage}/acme/local-code.git`);
  keys.local = (await addFolder(home, local)).key;
  assert.equal(repositoryOf(await home.client.expectOk("space.get", {}), keys.local).instance, null, "the local-only project has no instance");

  /** Each project's forge guidance and `project.status` origin. */
  const read = async (core: Home, refresh: boolean): Promise<Record<string, (string | null)[]>> =>
    Object.fromEntries(await Promise.all(Object.entries(keys).map(async ([name, key]) => {
      const forge = await core.client.expectOk("forge.items", { projectId: key, ...(refresh ? { refresh: true } : {}) });
      const status = await core.client.expectOk("project.status", { projectId: key });
      return [name, [forge.guidance ?? null, status.originUrl ?? null]];
    })));

  // Both instances reported (projects-7, projects-36).
  const reported = await home.client.expectOk("space.get", {});
  assert.deepEqual(reported.instances.map((instance) => [instance.origin, instance.signedIn, typeof instance.readAt]), [[first.url, true, "number"], [second.url, true, "number"]]);
  assert.deepEqual(await read(home, true), {
    first: [INSTANCE_GUIDANCE, null],
    second: [REMOTE_GUIDANCE, null],
    other: ["Issues and PRs come from GitHub; this project's origin is at code.example.test.", "https://code.example.test/team/three.git"],
    local: [INSTANCE_GUIDANCE, null],
  });

  // Restarted with the second signed out, the first read anew: the
  // second has reported no Git origin this run, so only code under the
  // first's is classified, a cached reply included (projects-7).
  await signOut(home, second);
  await home.stop();
  const again = await startHome("code-kinds-again", { dataDir: home.dataDir, project: false });
  t.after(() => again.stop());
  const from = again.client.mark();
  await again.client.expectOk("space.get", {});
  const anew = await again.client.waitSpace(from, (state) => instanceOf(state, first.url)?.read.phase === "idle" && (instanceOf(state, first.url)?.readAt ?? null) !== null, 30_000);
  assert.deepEqual([instanceOf(anew, second.url)?.signedIn, instanceOf(anew, second.url)?.readAt], [false, null]);
  const expected = { first: [INSTANCE_GUIDANCE, null], second: [REMOTE_GUIDANCE, null], other: [REMOTE_GUIDANCE, null], local: [INSTANCE_GUIDANCE, null] };
  assert.deepEqual(await read(again, false), expected, "cached replies follow the origins known now");
  assert.deepEqual(await read(again, true), expected);
});
