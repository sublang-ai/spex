// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Groups surface against the stand-in Git host (git-host-12):
// sign-in in both flows, picks, joins, members, the notice, sign-out
// by the reader and by the host, the read a signed-in start owes, and
// the host's renames, archives, removals and refusals over its own
// HTTP transport (space-37, space-38, space-52, space-59, space-65,
// git-host-4, git-host-5, git-host-11) — hermetic, on loopback alone,
// in a file budget of its own.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { CredentialChanged, GitHostClient, fileCredentialStore, type CredentialStore, type HostAccount, type StoredCredential } from "./git-host.js";
import { Home } from "./home.js";
import { holdingFetch, samePair, settled } from "./testing/holding-fetch.js";
import { clonePath, createSpaceHarness, OWN, OWN_KEY, ownClone, prefsOf, repositoryOf } from "./testing/space-harness.js";
import type { StandinHost } from "./testing/standin-host.js";
import type { GroupsState, RepositoryState } from "./protocol.js";

const fixture = createSpaceHarness();
const { scratch, git, gitFolder, bareRepo, addFolder, sleep, startHome, startHost, signIn, runTurn, holdingGit } = fixture;
test.after(() => fixture.dispose());

// ---------------------------------------------------------------------------
// space-37, space-38, space-52 against the stand-in Git host (git-host-12)
// ---------------------------------------------------------------------------

/** The stand-in's person, and your own group's repository once signed in. */
const LOGIN = "ada";
const HOST_OWN = `${LOGIN}/${LOGIN}-spex`;
const HOST_NAME = "Stand-in Git host";

/** The stand-in's bare repository holding a key's records. */
function bareOf(host: StandinHost, key: string): string {
  const parts = key.split("/");
  return join(host.dir, ...parts.slice(0, -1), `${parts[parts.length - 1]}.git`);
}

/** A repository's readings up to its first sync's end: they reach the
 * sync and its end, and none reads unreachable (space-61). */
function assertNeverUnreachable(readings: RepositoryState[]): void {
  assert.ok(readings.some((repository) => repository.sync.phase === "running"), "the readings reach the sync");
  assert.equal(readings[readings.length - 1]?.sync.phase, "done", "the readings reach the sync's end");
  const unreachable = readings.filter((repository) => repository.state === "unreachable");
  assert.deepEqual(unreachable.map((repository) => `${repository.key}: ${repository.reason ?? ""} (${repository.sync.phase})`), []);
}

/** A project's code: a Git working folder with one commit. */
function codeRepository(name: string): string {
  const dir = gitFolder(name);
  writeFileSync(join(dir, "README.md"), `# ${name}\n`);
  git(dir, "add", "README.md");
  git(dir, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "code");
  return dir;
}

test("space-37: the browser sign-in renames your own group after the login, pushes its spex repository, and writes the account", async (t) => {
  const host = await startHost();
  const home = await startHome("signin-browser", { host, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const { key } = await addFolder(home, home.projectDir);
  const before = await home.client.expectOk("space.get", {});
  assert.equal(before.account, null);
  assert.deepEqual(before.groups.map((group) => group.fullPath), [OWN]);
  assert.equal(repositoryOf(before, key).state, "local-only");
  await home.client.expectError("space.refresh", {}, "invalid_request", /Sign in first/);
  // The browser flow's URL names the loopback, an S256 challenge and the
  // public client (git-host-2).
  const from = home.client.mark();
  const started = await home.client.expectOk("space.signin.start", {});
  assert.equal(started.flow, "browser");
  const url = new URL(started.flow === "browser" ? started.url : "");
  assert.equal(`${url.origin}${url.pathname}`, `${host.url}/login/app`);
  assert.equal(url.searchParams.get("client_id"), "spex");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.match(url.searchParams.get("redirect_uri") ?? "", /^http:\/\/127\.0\.0\.1:\d+\/callback$/);
  const running = await home.client.waitSpace(from, (state) => state.signIn.phase === "running");
  assert.ok(running.signIn.phase === "running" && running.signIn.flow === "browser");
  await home.client.expectError("space.signin.start", {}, "busy");
  const redirect = await fetch(url, { redirect: "manual" });
  const page = await (await fetch(redirect.headers.get("location") ?? "")).text();
  assert.match(page, /You may close this browser window/);
  const signed = await home.client.waitSpace(from, (state) => state.account !== null && state.signIn.phase === "idle", 30_000);
  assert.deepEqual(signed.account, { id: "1001", login: LOGIN, displayName: "Ada Lovelace" });
  assert.equal(signed.host.displayName, HOST_NAME);
  assert.equal(typeof signed.readAt, "number");
  assert.deepEqual(signed.groups.map((group) => [group.fullPath, group.own]), [[LOGIN, true], ["acme", false], ["acme/research", false]]);
  assert.equal(signed.groups[0].id, "2001");
  // Your own group's folder and every clone in it bear the login, and
  // every pair naming one is rewritten (space-59, storage-2).
  const moved = `${LOGIN}/${basename(home.projectDir)}-spex`;
  assert.equal(repositoryOf(signed, moved).state, "local-only");
  assert.equal(repositoryOf(signed, moved).folder, home.projectDir);
  assert.ok(!existsSync(join(home.dataDir, "workspace", OWN)), "the former folder left with its clones");
  const file = Home.load(home.dataDir).file;
  assert.deepEqual(file.host.account, { id: "1001", login: LOGIN, displayName: "Ada Lovelace" });
  assert.equal(file.host.signedOut, undefined);
  assert.equal(file.own, LOGIN);
  assert.deepEqual(file.folders.map((folder) => [folder.path, folder.repository]), [[home.projectDir, moved]]);
  // The app token, owner-only (storage-19).
  assert.equal(statSync(join(home.dataDir, "local", "credentials.yaml")).mode & 0o777, 0o600);
  // Your own group's spex repository stands on the stand-in, pushed
  // beside its default branch (space-4, space-65, git-host-7).
  const own = await home.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done");
  const clone = clonePath(home.dataDir, HOST_OWN);
  assert.equal(own.state, "reachable");
  // Created at the host, it goes straight to its sync: no state between
  // reads it no longer shared (space-61, git-host-5).
  assertNeverUnreachable(home.client.readings(from, [OWN_KEY, HOST_OWN]));
  assert.equal(git(bareOf(host, HOST_OWN), "rev-parse", "spex"), git(clone, "rev-parse", "spex"));
  assert.equal(git(bareOf(host, HOST_OWN), "symbolic-ref", "HEAD"), "refs/heads/main");
  assert.equal(git(clone, "config", "--get", "spex.repositoryId"), own.id);
  assert.ok(own.remote?.startsWith(`${host.gitOrigin}/${LOGIN}/`) && !own.remote.includes("@"), own.remote ?? "");
  assert.equal((await home.client.expectOk("config.get", {})).status, "valid", "your own group's config moved with it");
  // A core restarted on the home reads the same account and last sync,
  // no read time, and the host it recorded whatever SPEX_HOST_URL says
  // (space-1, git-host-1).
  await home.stop();
  const again = await startHome("signin-browser-again", { dataDir: home.dataDir, project: false, env: { SPEX_HOST_URL: "http://127.0.0.1:9" } });
  t.after(() => again.stop());
  const reads = (): number => host.script.requests.filter((request) => request.path === "/api/v1/host/me").length;
  const readsBefore = reads();
  const fromStart = again.client.mark();
  const [reread] = await Promise.all([again.client.expectOk("space.get", {}), again.client.expectOk("space.get", {})]);
  assert.deepEqual(reread.account, signed.account);
  assert.equal(reread.readAt, null);
  assert.equal(reread.host.url, host.url);
  assert.deepEqual(repositoryOf(reread, HOST_OWN).lastSync, own.lastSync);
  // That first ask began the read a signed-in start owes, once for both
  // asks, its state landing with a read time and the host's groups for
  // the picker (space-1, git-host-5); a later ask begins none.
  const read = await again.client.waitSpace(fromStart, (state) => state.readAt !== null);
  assert.equal(typeof read.readAt, "number");
  assert.deepEqual(read.groups.map((group) => group.fullPath), [LOGIN, "acme", "acme/research"]);
  assert.equal(repositoryOf(read, HOST_OWN).state, "reachable");
  await again.client.expectOk("space.get", {});
  await sleep(300);
  assert.equal(reads() - readsBefore, 1, "one read of the host for every ask since the start");
});

test("space-37: the device sign-in links the stand-in's code, names the host, and completes on approval; a denied code ends failed", async (t) => {
  const host = await startHost();
  const home = await startHome("signin-device", { host, project: false });
  t.after(() => home.stop());
  // A cancel stops the polling and ends the flow with nothing stored.
  const fromCancel = home.client.mark();
  const canceled = await home.client.expectOk("space.signin.start", {});
  assert.equal(canceled.flow, "device");
  assert.deepEqual(await home.client.expectOk("space.signin.cancel", {}), { stopped: true });
  await home.client.waitSpace(fromCancel, (state) => state.signIn.phase === "idle" && state.account === null);
  assert.deepEqual(await home.client.expectOk("space.signin.cancel", {}), { stopped: false });
  const from = home.client.mark();
  const denied = await home.client.expectOk("space.signin.start", {});
  assert.ok(denied.flow === "device", JSON.stringify(denied));
  assert.ok(host.script.pendingDevices().includes(denied.userCode));
  // The verification URL carries the code, so nobody types it
  // (git-host-3, space-29).
  assert.equal(denied.verificationUri, `${host.url}/login/device?user_code=${encodeURIComponent(denied.userCode)}`);
  assert.ok(denied.expiresAt > Date.now());
  const running = await home.client.waitSpace(from, (state) => state.signIn.phase === "running");
  assert.ok(running.signIn.phase === "running" && running.signIn.flow === "device" && running.signIn.userCode === denied.userCode);
  assert.equal(running.signIn.verificationUri, denied.verificationUri);
  host.script.denyDevice(denied.userCode);
  const failed = await home.client.waitSpace(from, (state) => state.signIn.phase === "failed");
  assert.ok(failed.signIn.phase === "failed" && failed.signIn.cause === "denied", JSON.stringify(failed.signIn));
  assert.equal(failed.account, null);
  assert.ok(!existsSync(join(home.dataDir, "local", "credentials.yaml")), "nothing is stored");
  const signed = await signIn(home, host);
  assert.equal(signed.account?.login, LOGIN);
  const own = await home.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done");
  assert.equal(own.state, "reachable");
  assert.ok(host.script.repositories.some((repository) => repository.id === own.id && repository.path === `${LOGIN}-spex`));
});

test("space-59: a sign-in moves your own group's folder at its instant while a read of it is in flight; a write naming the old key is refused and recreates nothing", async (t) => {
  const host = await startHost();
  const dataDir = mkdtempSync(join(scratch, "signin-reading-"));
  const shim = holdingGit(`${ownClone(dataDir)} rev-parse --git-dir`);
  const home = await startHome("signin-reading", { host, dataDir, env: { PATH: shim.path } });
  t.after(() => { shim.release(); return home.stop(); });
  const added = home.client.mark();
  const { key } = await addFolder(home, home.projectDir);
  // The announcement of the new folder has read every clone.
  await home.client.waitSpace(added, (state) => state.groups.some((group) => group.repositories.some((repository) => repository.key === key)));
  await sleep(200);

  // A Groups read stands inside Git on your own group's clone.
  shim.hold();
  const reading = home.client.command("space.get", {});
  await shim.held();

  // The account arrives meanwhile; the set-up's rename waits for no read
  // (space-59, space-21): the folder moves with the read still in flight.
  const from = home.client.mark();
  const started = await home.client.expectOk("space.signin.start", {});
  assert.ok(started.flow === "device", JSON.stringify(started));
  host.script.approveDevice(started.userCode);
  for (let i = 0; i < 400 && existsSync(join(dataDir, "workspace", OWN)); i += 1) await sleep(25);
  assert.ok(!existsSync(join(dataDir, "workspace", OWN)), "the former folder left with its clones while the read was held");
  const moved = `${LOGIN}/${basename(home.projectDir)}-spex`;
  // A write resolving the old key at its instant finds nothing there.
  const refused = await home.client.command("intent.queue", { projectId: key, text: "written after the move" });
  assert.ok(!refused.ok && refused.error.code !== "busy", JSON.stringify(refused));
  assert.ok(!existsSync(join(dataDir, "workspace", OWN)), "nor does it recreate the former folder");
  await home.client.expectOk("intent.queue", { projectId: moved, text: "written where it lies" });

  // The held read ends against a path that moved: it reads or fails, and
  // recreates nothing.
  shim.release();
  await reading;
  assert.ok(!existsSync(join(dataDir, "workspace", OWN)), "the held read recreated nothing");
  const signed = await home.client.waitSpace(from, (state) => state.account !== null && state.signIn.phase === "idle", 30_000);
  assert.equal(signed.account?.login, LOGIN);
  const own = await home.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  assert.equal(own.state, "reachable");
  assert.equal(git(bareOf(host, HOST_OWN), "rev-parse", "spex"), git(clonePath(dataDir, HOST_OWN), "rev-parse", "spex"));
  // A read after the move finds every clone where it lies.
  const after = await home.client.expectOk("space.get", {});
  assert.equal(repositoryOf(after, moved).folder, home.projectDir);
  assert.deepEqual(after.groups.flatMap((group) => group.repositories.map((repository) => repository.key)).filter((repoKey) => repoKey.startsWith(`${OWN}/`)), []);
});

test("space-37: a Save held after its own read of HEAD writes where its clone lies: removed, it makes nothing; moved by a sign-in, it saves and syncs there", async (t) => {
  const host = await startHost();
  // The Save's own read of HEAD has run, its answer held: the Save awaits it.
  const shim = holdingGit("rev-parse HEAD", { after: true });
  const home = await startHome("save-held", { host, project: false, env: { PATH: shim.path } });
  t.after(() => { shim.release(); return home.stop(); });
  const own = join(home.dataDir, "workspace", OWN);

  // Removed meanwhile: the resumed Save refuses, its folder never made again.
  const removed = await addFolder(home, gitFolder("save-removed"));
  await home.client.expectOk("space.remote.set", { repository: removed.key, url: bareRepo() });
  writeFileSync(join(removed.clone, "notes.txt"), "never saved\n");
  await sleep(200);
  shim.hold();
  assert.deepEqual(await home.client.expectOk("space.sync", { repository: removed.key }), { accepted: true });
  await shim.held();
  assert.equal(await home.client.expectOk("project.remove", { projectId: removed.key, confirm: true }), null);
  assert.ok(!existsSync(removed.clone), "the clone is gone");
  await sleep(200);
  const ended = home.client.mark();
  shim.release();
  // Nothing else runs: the next state is the one the stopped Save publishes.
  const after = await home.client.waitSpace(ended, () => true, 30_000);
  assert.ok(!existsSync(removed.clone), "the resumed Save made nothing where the clone stood");
  assert.ok(!after.groups.some((group) => group.repositories.some((repository) => repository.key === removed.key)), "and lists no row for it");

  // Moved meanwhile by the sign-in's rename of your own group's folder:
  // the resumed Save refreshes the rules, validates and commits where
  // the clone lies, and the sync goes through there.
  const { key, clone } = await addFolder(home, gitFolder("save-moved"));
  const bare = bareRepo();
  await home.client.expectOk("space.remote.set", { repository: key, url: bare });
  writeFileSync(join(clone, "notes.txt"), "saved where it lies\n");
  await sleep(200);
  shim.hold();
  assert.deepEqual(await home.client.expectOk("space.sync", { repository: key }), { accepted: true });
  await shim.held();
  await signIn(home, host);
  for (let i = 0; i < 400 && existsSync(own); i += 1) await sleep(25);
  assert.ok(!existsSync(own), "your own group's folder moved while the Save was held");
  const moved = `${LOGIN}/save-moved-spex`;
  const movedClone = clonePath(home.dataDir, moved);
  const resumed = home.client.mark();
  shim.release();
  const synced = await home.client.waitRepository(resumed, moved, (repository) => repository.sync.phase !== "running", 30_000);
  assert.equal(synced.sync.phase, "done", JSON.stringify(synced.sync));
  assert.ok(!existsSync(own), "the former folder is not made again");
  assert.equal(git(movedClone, "show", "HEAD:notes.txt"), "saved where it lies");
  assert.equal(git(bare, "rev-parse", "spex"), git(movedClone, "rev-parse", "spex"));
});

test("space-37: Pick a group creates <name>-spex there and pushes; a taken name is refused; a refused creation waits until a Refresh finds it", async (t) => {
  const host = await startHost();
  const home = await startHome("pick", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const alpha = gitFolder("alpha");
  const first = await addFolder(home, alpha);
  await home.client.expectError("space.pick", { repository: first.key, choice: { kind: "create", groupId: "2002", name: "alpha" } }, "invalid_request", /Sign in first/);
  const signed = await signIn(home, host);
  const local = `${LOGIN}/alpha-spex`;
  const row = repositoryOf(signed, local);
  assert.equal(row.state, "local-only");
  const sessionId = await runTurn(home, local, "Shared with Acme");
  // A group picked: `<name>-spex` created there, the clone following it
  // under `workspace/acme/`, its `spex` pushed (space-58, space-60).
  const from = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", groupId: "2002", name: "alpha" } }), { accepted: true });
  const created = await home.client.waitRepository(from, "acme/alpha-spex", (repository) => repository.sync.phase === "done");
  assert.equal(created.state, "reachable");
  assertNeverUnreachable(home.client.readings(from, [local, "acme/alpha-spex"]));
  assert.ok(created.lastSync && created.lastSync.sent > 0, JSON.stringify(created.lastSync));
  assert.equal(created.folder, alpha);
  const clone = clonePath(home.dataDir, "acme/alpha-spex");
  assert.ok(existsSync(clone) && !existsSync(clonePath(home.dataDir, local)));
  assert.equal(git(bareOf(host, "acme/alpha-spex"), "rev-parse", "spex"), git(clone, "rev-parse", "spex"));
  assert.ok(git(bareOf(host, "acme/alpha-spex"), "ls-tree", "-r", "--name-only", "spex").split("\n").includes(`sessions/${sessionId}.json`));
  assert.equal(Home.load(home.dataDir).keyForFolder(alpha), "acme/alpha-spex");
  // The account commits, at the host's no-reply address (space-32).
  assert.equal(git(clone, "log", "-1", "--format=%an <%ae>"), "Ada Lovelace <ada@users.noreply.127.0.0.1>");
  // The host's own URLs are its to hand over (space-5).
  await home.client.expectError("space.remote.set", { repository: "acme/alpha-spex", url: `${host.gitOrigin}/acme/other-spex.git` }, "invalid_request", /used as the host gives them/);
  // A name the host reports taken is refused in place (space-58).
  host.script.addRepository({ group: "acme", name: "beta-spex" });
  const fromBeta = home.client.mark();
  const beta = await addFolder(home, gitFolder("beta"));
  // A project added is announced, so the surface re-reads (space-2).
  await home.client.waitRepository(fromBeta, beta.key, (repository) => repository.state === "local-only");
  await home.client.expectError("space.pick", { repository: beta.key, choice: { kind: "create", groupId: "2002", name: "beta" } }, "invalid_request", /beta-spex is taken in acme/);
  await home.client.expectError("space.pick", { repository: beta.key, choice: { kind: "create", groupId: "2002", name: "--" } }, "invalid_request", /letter or a digit/);
  assert.equal((await home.client.repository(beta.key)).state, "local-only");
  // A creation the host leaves waiting stands on the row with its words,
  // and the next read after it grants finds it done (space-64).
  const words = "You need the Maintainer role in Research to create projects.";
  host.script.refuseCreate(words);
  const gamma = await addFolder(home, gitFolder("gamma"));
  const fromGamma = home.client.mark();
  await home.client.expectOk("space.pick", { repository: gamma.key, choice: { kind: "create", groupId: "2003", name: "gamma" } });
  const waiting = await home.client.waitRepository(fromGamma, gamma.key, (repository) => repository.waiting !== null);
  assert.deepEqual(waiting.waiting, { step: "create", group: "acme/research", message: words });
  assert.equal(waiting.state, "local-only");
  host.script.refuseCreate(null);
  assert.deepEqual(await home.client.expectOk("space.refresh", {}), { accepted: true });
  const found = await home.client.waitRepository(fromGamma, "acme/research/gamma-spex", (repository) => repository.sync.phase === "done");
  assert.equal(found.waiting, null);
  assert.equal(found.state, "reachable");
});

test("git-host-14: a repository created while a read begun before it is in flight never reads unreachable, and its push lands with no Refresh", async (t) => {
  const host = await startHost();
  const home = await startHome("created-mid-read", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const signedFrom = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(signedFrom, HOST_OWN, (repository) => repository.sync.phase === "done");
  const added = home.client.mark();
  const { key } = await addFolder(home, gitFolder("delta"));
  await home.client.waitRepository(added, key, (repository) => repository.state === "local-only");
  // A read begins and takes the listing before the creation, and answers
  // after it without the new repository (git-host-5).
  const asked = host.script.requests.length;
  const listingSince = () => host.script.requests.slice(asked).find((request) => request.method === "GET" && request.path === "/api/v1/host/repositories");
  host.script.sleepListing(1_500);
  t.after(() => host.script.sleepListing(0));
  const from = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.refresh", {}), { accepted: true });
  for (let i = 0; i < 400 && !listingSince(); i += 1) await sleep(10);
  const listing = listingSince();
  assert.ok(listing, "the read reached the listing");
  assert.deepEqual(await home.client.expectOk("space.pick", { repository: key, choice: { kind: "create", groupId: "2002", name: "delta" } }), { accepted: true });
  const creation = host.script.requests.slice(asked).find((request) => request.method === "POST" && request.path === "/api/v1/host/repositories");
  assert.ok(creation && creation.at < listing.at + 1_500, "the creation came while the listing slept");
  // The created repository goes straight to its sync, which pushes with
  // no Refresh asked after the pick (git-host-5, git-host-6).
  const synced = await home.client.waitRepository(from, "acme/delta-spex", (repository) => repository.sync.phase === "done", 30_000);
  assert.equal(synced.state, "reachable");
  assert.ok(synced.lastSync && synced.lastSync.sent > 0, JSON.stringify(synced.lastSync));
  assert.equal(git(bareOf(host, "acme/delta-spex"), "rev-parse", "spex"), git(clonePath(home.dataDir, "acme/delta-spex"), "rev-parse", "spex"));
  assertNeverUnreachable(home.client.readings(from, [key, "acme/delta-spex"]));
  assert.equal((await home.client.repository("acme/delta-spex")).state, "reachable");
});

test("space-65: a working folder paired with a group's own spex repository brings it to that group on the host, pushed", async (t) => {
  const host = await startHost();
  const first = await startHome("group-first", { host, project: false, extra: { signIn: "browser" } });
  const from = first.client.mark();
  await signIn(first, host);
  await first.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done");
  await first.stop();
  // A group's own clone on this device, on no host yet.
  const key = "acme/acme-spex";
  const clone = clonePath(first.dataDir, key);
  mkdirSync(clone, { recursive: true });
  git(clone, "init", "-q", "-b", "spex");
  git(clone, "-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", "Start");
  const home = await startHome("group-first-again", { dataDir: first.dataDir, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const folder = gitFolder("acme-work");
  await home.client.expectOk("project.rebind", { projectId: key, path: folder });
  const fromRegister = home.client.mark();
  assert.equal((await home.client.expectOk("project.register", { path: folder })).id, key);
  const pushed = await home.client.waitRepository(fromRegister, key, (repository) => repository.sync.phase === "done");
  assert.equal(pushed.state, "reachable");
  assert.equal(git(bareOf(host, key), "rev-parse", "spex"), git(clone, "rev-parse", "spex"));
  assert.equal(host.script.repositories.find((repository) => repository.id === pushed.id)?.description, "Spex records of the group acme");
  // Asked again at a later session, a repository on the host is left be.
  assert.equal(await home.service.ensureGroupRepository(key), "unchanged");
});

test("space-37: a join pick and the first sync into a repository with other members wait for the notice; space.join clones it with its code; members read live", async (t) => {
  const host = await startHost();
  const code = codeRepository("team");
  const bob = { id: "1002", login: "bob", displayName: "Bob", role: "Developer" };
  const team = host.script.addRepository({ group: "acme", name: "team-spex", project: { format: 1, name: "team", remote: code }, members: [bob], visibility: "internal" });
  const pal = host.script.addRepository({ group: "acme", name: "pal-spex", members: [bob] });
  const home = await startHome("notice", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const signed = await signIn(home, host);
  const absent = repositoryOf(signed, "acme/team-spex");
  assert.deepEqual([absent.state, absent.id, absent.code, absent.members, absent.visibility, absent.folder], ["absent", team.id, code, 2, "internal", null]);
  // Members, as the host names them, read on each ask (space-62).
  const members = await home.client.expectOk("space.members", { repository: "acme/team-spex" });
  assert.deepEqual(members.members.map((member) => [member.login, member.role]), [[LOGIN, "Owner"], ["bob", "Developer"]]);
  assert.match(members.membersUrl, /\/acme\/team-spex\/-\/project_members$/);
  await home.client.expectError("space.members", { repository: "acme/nowhere-spex" }, "not_found");
  // Join: the spex repository under workspace/acme/, the code into the
  // folder named, the two paired (space-63).
  const folder = join(mkdtempSync(join(scratch, "team-")), "team");
  const from = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.join", { hostId: team.id, folder }), { accepted: true });
  const joined = await home.client.waitRepository(from, "acme/team-spex", (repository) => repository.state !== "absent" && repository.folder !== null && repository.sync.phase === "idle");
  assert.equal(joined.state, "reachable");
  assert.equal(joined.id, team.id);
  assert.ok(existsSync(join(folder, "README.md")), "the code is cloned");
  assert.equal(git(folder, "remote", "get-url", "origin"), code);
  assert.equal(git(clonePath(home.dataDir, "acme/team-spex"), "symbolic-ref", "--short", "HEAD"), "spex");
  await home.client.expectError("space.join", { hostId: team.id }, "invalid_request", /on this device already/);
  // Its first sync waits for the notice, then pushes and records both
  // (space-57, space-12, space-22).
  await runTurn(home, "acme/team-spex", "For the team");
  await home.client.expectError("space.sync", { repository: "acme/team-spex" }, "invalid_request", /sharing notice/);
  const done = await home.client.settle("space.sync", { repository: "acme/team-spex", noticed: true });
  assert.ok(done.sync.phase === "done" && done.sync.pushed, JSON.stringify(done.sync));
  assert.equal(done.noticed, true);
  const prefs = prefsOf(home.dataDir);
  assert.equal(prefs["sync:acme/team-spex:noticed"], true);
  assert.deepEqual(prefs["sync:acme/team-spex:last"], done.lastSync);
  assert.equal(git(bareOf(host, "acme/team-spex"), "rev-parse", "spex"), git(clonePath(home.dataDir, "acme/team-spex"), "rev-parse", "spex"));
  // A pick joining a repository with other members waits for it too.
  const mine = await addFolder(home, gitFolder("pal"));
  await home.client.expectError("space.pick", { repository: mine.key, choice: { kind: "join", hostId: pal.id } }, "invalid_request", /sharing notice/);
  const fromPal = home.client.mark();
  await home.client.expectOk("space.pick", { repository: mine.key, choice: { kind: "join", hostId: pal.id }, noticed: true });
  const palJoined = await home.client.waitRepository(fromPal, "acme/pal-spex", (repository) => repository.sync.phase === "done");
  assert.equal(palJoined.state, "reachable");
  // Joined from the listing, it goes straight to its sync (git-host-5).
  assertNeverUnreachable(home.client.readings(fromPal, [mine.key, "acme/pal-spex"]));
  assert.equal(prefsOf(home.dataDir)["sync:acme/pal-spex:noticed"], true);
});

test("space-37: a join reads not on this device, running at its Code step, until its code is cloned into the folder", async (t) => {
  const host = await startHost();
  const code = codeRepository("held");
  const listed = host.script.addRepository({ group: "acme", name: "held-spex", project: { format: 1, name: "held", remote: code } });
  const key = "acme/held-spex";
  const folder = join(mkdtempSync(join(scratch, "held-")), "held");
  const shim = holdingGit(`clone -q ${code} ${folder}`);
  const home = await startHome("join-code", { host, project: false, env: { PATH: shim.path }, extra: { signIn: "browser" } });
  t.after(() => { shim.release(); return home.stop(); });
  await signIn(home, host);
  shim.hold();
  const from = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.join", { hostId: listed.id, folder }), { accepted: true });
  await shim.held();
  // The spex repository is cloned; its code clone stands held: the join
  // runs at Code with no Stop, and the row is not on this device yet
  // (space-63, space-61).
  const cloning = await home.client.waitRepository(from, key, (repository) => repository.sync.phase === "running" && repository.sync.step === "code");
  assert.ok(cloning.sync.phase === "running" && cloning.sync.op === "join" && !cloning.sync.cancelable, JSON.stringify(cloning.sync));
  assert.equal(cloning.state, "absent");
  assert.ok(existsSync(join(clonePath(home.dataDir, key), "project.json")), "the spex repository is cloned");
  const read = await home.client.repository(key);
  assert.ok(read.state === "absent" && read.sync.phase === "running" && read.sync.step === "code", JSON.stringify([read.state, read.sync]));
  assert.deepEqual(await home.client.expectOk("space.cancel", { repository: key }), { stopped: false });
  assert.ok(!existsSync(join(folder, "README.md")), "the code is not here yet");
  // Released, the join ends: the row reads reachable with the code in
  // the folder and the two paired, and no reading before reads it so.
  shim.release();
  const joined = await home.client.waitRepository(from, key, (repository) => repository.state === "reachable");
  assert.equal(joined.folder, folder);
  assert.equal(joined.sync.phase, "idle");
  assert.ok(existsSync(join(folder, "README.md")), "the code is cloned");
  assert.equal(git(folder, "remote", "get-url", "origin"), code);
  const readings = home.client.readings(from, [key]);
  const first = readings.findIndex((repository) => repository.state === "reachable");
  assert.deepEqual(readings.slice(0, first).map((repository) => repository.state).filter((state) => state !== "absent"), []);
});

test("space-63: two joins of one repository publish one clone; the later finds it standing, removes only its own stage, and the clone stays whole", async (t) => {
  const host = await startHost();
  const listed = host.script.addRepository({ group: "acme", name: "twice-spex" });
  const key = "acme/twice-spex";
  const shim = holdingGit("clone -q --branch spex");
  const home = await startHome("join-twice", { host, project: false, env: { PATH: shim.path }, extra: { signIn: "browser" } });
  t.after(() => { shim.release(); return home.stop(); });
  await signIn(home, host);
  // The first join's clone stands held; the second is refused nothing.
  shim.hold();
  assert.deepEqual(await home.client.expectOk("space.join", { hostId: listed.id }), { accepted: true });
  await shim.held();
  const from = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.join", { hostId: listed.id }), { accepted: true });
  await home.client.waitRepository(from, key, (repository) => repository.state === "reachable");
  const clone = clonePath(home.dataDir, key);
  writeFileSync(join(clone, "mine.txt"), "written after the publication\n");
  // Released, the first finds the place taken and leaves it as it is.
  shim.release();
  const group = join(home.dataDir, "workspace", "acme");
  const stages = (): string[] => readdirSync(group).filter((name) => name.includes(".join-"));
  for (let i = 0; i < 400 && stages().length > 0; i += 1) await sleep(25);
  assert.deepEqual(stages(), [], "each join's stage is gone");
  assert.equal(readFileSync(join(clone, "mine.txt"), "utf8"), "written after the publication\n", "the published clone is untouched");
  assert.equal(git(clone, "config", "--get", "spex.repositoryId"), listed.id);
  assert.equal(git(clone, "symbolic-ref", "--short", "HEAD"), "spex");
});

test("space-37: a join's clone child runs owner-only while the core's own umask stays as it was, and the clone it writes stays private", async (t) => {
  const host = await startHost();
  const listed = host.script.addRepository({ group: "acme", name: "private-spex" });
  const key = "acme/private-spex";
  const shim = holdingGit("clone -q --branch spex");
  // The ordinary umask a desktop starts under; read back by setting it
  // again, synchronously.
  const readUmask = (): number => { const mask = process.umask(0o022); process.umask(mask); return mask; };
  const previous = process.umask(0o022);
  const home = await startHome("join-umask", { host, project: false, env: { PATH: shim.path }, extra: { signIn: "browser" } });
  t.after(() => { shim.release(); process.umask(previous); return home.stop(); });
  await signIn(home, host);
  shim.hold();
  const from = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.join", { hostId: listed.id }), { accepted: true });
  // The child was spawned owner-only; while it stands held the core has
  // awaited it and its own umask is the one it had (space-32).
  assert.equal(await shim.held(), "0077", "the clone child runs under 0077");
  assert.equal(readUmask(), 0o022, "the core's umask is restored before it awaits the child");
  await sleep(100);
  assert.equal(readUmask(), 0o022, "and stays restored while the child runs");
  shim.release();
  await home.client.waitRepository(from, key, (repository) => repository.state === "reachable");
  assert.equal(readUmask(), 0o022, "the join leaves the core's umask as it was");
  // What the child alone wrote — the clone's folders and the pack it
  // fetched, which no later command under the core's umask rewrites —
  // keeps its owner-only modes once published.
  const clone = clonePath(home.dataDir, key);
  const pack = join(clone, ".git", "objects", "pack");
  const written = [clone, join(clone, ".git"), join(clone, ".git", "objects"), pack, ...readdirSync(pack).map((name) => join(pack, name))];
  assert.ok(written.some((path) => path.endsWith(".pack")), "the clone fetched a pack");
  assert.deepEqual(written.filter((path) => (statSync(path).mode & 0o077) !== 0), [], "no entry the clone child wrote is wider than owner-only");
});

test("space-37: Sign out revokes this device and keeps every clone, its repositories unreachable until the next sign-in", async (t) => {
  const host = await startHost();
  const home = await startHome("signout", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const from = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done");
  assert.equal(host.script.liveDevices(), 1);
  const out = await home.client.expectOk("space.signout", {});
  assert.equal(out.account, null);
  assert.equal(out.readAt, null);
  assert.deepEqual(out.groups.map((group) => group.fullPath), [LOGIN]);
  assert.equal(host.script.liveDevices(), 0, "revoked at the stand-in");
  assert.ok(!existsSync(join(home.dataDir, "local", "credentials.yaml")), "the credential is gone");
  const file = Home.load(home.dataDir).file;
  assert.equal(file.host.signedOut, true);
  assert.equal(file.host.account?.login, LOGIN, "the account is kept");
  const own = repositoryOf(out, HOST_OWN);
  assert.deepEqual([own.state, own.reason], ["unreachable", "Sign in again"]);
  assert.ok(existsSync(join(clonePath(home.dataDir, HOST_OWN), ".git")), "nothing is deleted");
  await home.client.expectError("space.sync", { repository: HOST_OWN }, "invalid_request", /Sign in first/);
  await home.client.expectError("space.refresh", {}, "invalid_request", /Sign in first/);
  const fromAgain = home.client.mark();
  await signIn(home, host);
  const back = await home.client.waitRepository(fromAgain, HOST_OWN, (repository) => repository.state === "reachable");
  assert.equal(back.reason, null);
  assert.equal(Home.load(home.dataDir).file.host.signedOut, undefined);
});

test("git-host-4: a refresh the stand-in refuses, or a device it revoked, signs this device out, the state saying the host did it as whom until the next sign-in", async (t) => {
  const host = await startHost();
  const home = await startHome("host-signout", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const from = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done");
  assert.deepEqual((await home.client.expectOk("space.get", {})).signIn, { phase: "idle" });
  /** Refresh, and the first state signed out after it. */
  const signedOutBy = async (): Promise<GroupsState> => {
    const mark = home.client.mark();
    await home.client.expectOk("space.refresh", {});
    return home.client.waitSpace(mark, (state) => state.account === null);
  };
  /** The sign-out as the host's: the credential gone, the account kept
   * marked signed out, the remote repository waiting for a sign-in. */
  const assertHostSignedOut = (state: GroupsState): void => {
    assert.deepEqual(state.signIn, { phase: "idle", signedOut: { by: "host", login: LOGIN } });
    assert.ok(!existsSync(join(home.dataDir, "local", "credentials.yaml")), "the credential is gone");
    const file = Home.load(home.dataDir).file;
    assert.equal(file.host.signedOut, true);
    assert.equal(file.host.account?.login, LOGIN, "the account is kept");
    const own = repositoryOf(state, HOST_OWN);
    assert.deepEqual([own.state, own.reason], ["unreachable", "Sign in again"]);
  };
  // An expired access secret whose refresh the stand-in refuses.
  host.script.refuseRefresh = true;
  host.script.expireAccess();
  assertHostSignedOut(await signedOutBy());
  // A sign-in that ends without an account leaves it said.
  const fromCancel = home.client.mark();
  await home.client.expectOk("space.signin.start", {});
  await home.client.waitSpace(fromCancel, (state) => state.signIn.phase === "running");
  assert.deepEqual(await home.client.expectOk("space.signin.cancel", {}), { stopped: true });
  assertHostSignedOut(await home.client.expectOk("space.get", {}));
  /** Sign in again and wait for its set-up's read to land. */
  const signInRead = async (): Promise<GroupsState> => {
    const mark = home.client.mark();
    const signed = await signIn(home, host);
    await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.state === "reachable");
    return signed;
  };
  // The next sign-in clears it.
  host.script.refuseRefresh = false;
  assert.deepEqual((await signInRead()).signIn, { phase: "idle" });
  // A device the stand-in revoked: the same.
  host.script.revokeDevices();
  assertHostSignedOut(await signedOutBy());
  // A sign-out of the reader's own says nothing of the host.
  await signInRead();
  assert.deepEqual((await home.client.expectOk("space.signout", {})).signIn, { phase: "idle" });
});

test("git-host-4, git-host-10: a refusal or a sign-out overtaken by a newer sign-in leaves that sign-in's account signed in", async (t) => {
  const host = await startHost();
  const home = await startHome("overtaken", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const from = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done");
  // The core's own client and Groups, reached for what no command shows:
  // its answers held, and the instant its pair is removed.
  const core = home.service as unknown as { hostClient: GitHostClient; space: { readHost(): Promise<unknown>; signedInAs(account: HostAccount): Promise<void> } };
  const client = core.hostClient as unknown as { fetchImpl: typeof fetch; credentials: CredentialStore };
  const holds = holdingFetch(client.fetchImpl);
  client.fetchImpl = holds.fetch;
  const store = fileCredentialStore(home.dataDir, host.url);
  /** A device sign-in elsewhere — another process on this home, or a
   * home of its own — storing its pair through `credentials`. */
  const signInElsewhere = async (credentials: CredentialStore): Promise<HostAccount> => {
    const elsewhere = new GitHostClient({ url: host.url, label: "Spex elsewhere", credentials });
    const flow = await elsewhere.startDeviceSignIn();
    host.script.approveDevice(flow.userCode);
    return flow.done;
  };
  const assertSignedIn = async (pair: StoredCredential | null): Promise<void> => {
    const state = await home.client.expectOk("space.get", {});
    assert.equal(state.account?.login, LOGIN);
    assert.deepEqual(state.signIn, { phase: "idle" });
    assert.equal(Home.load(home.dataDir).file.host.signedOut, undefined);
    assert.ok(samePair(await store.read(), pair), "the newer pair stays");
  };

  // A read the stand-in refused for the former pair, while a newer one was stored.
  host.script.revokeDevices();
  let gate = holds.hold((path, status) => path.startsWith("/api/v1/host/") && status === 401);
  const before = await store.read();
  const reading = core.space.readHost();
  reading.catch(() => undefined);
  let newer: StoredCredential | null = null;
  try {
    await gate.reached;
    await signInElsewhere(fileCredentialStore(home.dataDir, host.url));
    newer = await store.read();
  } finally {
    gate.release();
  }
  assert.ok(newer !== null && !samePair(newer, before), "a newer pair was stored");
  await assert.rejects(reading, (error: unknown) => error instanceof CredentialChanged);
  await settled();
  await assertSignedIn(newer);

  // A sign-out whose revocation is held while a newer pair is stored.
  gate = holds.hold((path) => path === "/api/v1/auth/revoke");
  const refused = home.client.expectError("space.signout", {}, "conflict", /The sign-in changed meanwhile; try again/);
  const read = newer;
  try {
    await gate.reached;
    await signInElsewhere(fileCredentialStore(home.dataDir, host.url));
    newer = await store.read();
  } finally {
    gate.release();
  }
  await refused;
  assert.ok(newer !== null && !samePair(newer, read), "a newer pair was stored");
  await assertSignedIn(newer);

  // A sign-out whose removal is followed, before its own continuation,
  // by a newer sign-in publishing its pair and its account.
  const scratchHome = mkdtempSync(join(scratch, "elsewhere-"));
  const account = await signInElsewhere(fileCredentialStore(scratchHome, host.url));
  const latest = await fileCredentialStore(scratchHome, host.url).read();
  const own = client.credentials;
  let published = false;
  client.credentials = {
    read: () => own.read(),
    replace: (expected, next) => {
      const replaced = own.replace(expected, next);
      if (replaced && next === null) {
        queueMicrotask(() => {
          published = store.replace(null, latest);
          void core.space.signedInAs(account);
        });
      }
      return replaced;
    },
  };
  const mark = home.client.mark();
  const out = await home.client.expectOk("space.signout", {});
  assert.ok(published, "the newer pair was published after the removal");
  assert.equal(out.account?.login, LOGIN, "the newer sign-in's account is signed in");
  await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.state === "reachable");
  await assertSignedIn(latest);
});

test("space-37: while a check sleeps on the stand-in's transport, writes beneath that clone are admitted, a second Sync joins it, and Stop ends it", async (t) => {
  const host = await startHost();
  const home = await startHome("host-gate", { host, project: false, extra: { signIn: "browser", spaceTransportTimeoutMs: 60_000 } });
  t.after(() => home.stop());
  const elsewhere = gitFolder("elsewhere");
  await addFolder(home, elsewhere);
  const gated = gitFolder("gated");
  await addFolder(home, gated);
  await signIn(home, host);
  const from = home.client.mark();
  await home.client.expectOk("space.pick", { repository: `${LOGIN}/gated-spex`, choice: { kind: "create", groupId: "2002", name: "gated" } });
  const key = "acme/gated-spex";
  await home.client.waitRepository(from, key, (repository) => repository.sync.phase === "done");
  const clone = clonePath(home.dataDir, key);
  await home.client.expectOk("intent.queue", { projectId: key, text: "Saved by the sync" });
  const head = git(clone, "rev-parse", "HEAD");
  host.script.sleepTransport(30_000);
  t.after(() => host.script.sleepTransport(0));
  const requests = host.script.requests.length;
  const fromSync = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.sync", { repository: key }), { accepted: true });
  // The Check step reads the host first, offering no Stop; Stop comes
  // once its Git child runs (space-16).
  const entered = await home.client.waitRepository(fromSync, key, (repository) => repository.sync.phase === "running" && repository.sync.step === "check");
  assert.ok(entered.sync.phase === "running" && !entered.sync.cancelable, JSON.stringify(entered.sync));
  await home.client.waitRepository(fromSync, key, (repository) => repository.sync.phase === "running" && repository.sync.step === "check" && repository.sync.cancelable);
  for (let i = 0; i < 400 && !host.script.requests.slice(requests).some((request) => request.path.startsWith("/git/")); i += 1) await sleep(25);
  assert.ok(host.script.requests.slice(requests).some((request) => request.path.startsWith("/git/")), "the transport is in flight");
  // The check refuses nothing beneath its clone (space-21): a write is
  // admitted, and a second Sync joins the one running.
  await home.client.expectOk("intent.queue", { projectId: key, text: "admitted beside the check" });
  assert.deepEqual(await home.client.expectOk("space.sync", { repository: key }), { accepted: true });
  await home.client.expectOk("intent.queue", { projectId: `${LOGIN}/elsewhere-spex`, text: "elsewhere" });
  assert.deepEqual(await home.client.expectOk("space.cancel", { repository: key }), { stopped: true });
  const stopped = await home.client.waitRepository(fromSync, key, (repository) => repository.sync.phase === "stopped");
  assert.ok(stopped.sync.phase === "stopped" && stopped.sync.step === "check" && stopped.sync.cause === "stopped", JSON.stringify(stopped.sync));
  assert.notEqual(git(clone, "rev-parse", "HEAD"), head, "the Save commit stands");
  await home.client.expectOk("intent.queue", { projectId: key, text: "after the stop" });
});

test("space-60: a remote changed while the Check step reads the host stands; the host's new URL is not written over it", async (t) => {
  const host = await startHost();
  const home = await startHome("origin-read", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  await addFolder(home, gitFolder("guarded"));
  await signIn(home, host);
  const from = home.client.mark();
  await home.client.expectOk("space.pick", { repository: `${LOGIN}/guarded-spex`, choice: { kind: "create", groupId: "2002", name: "guarded" } });
  const key = "acme/guarded-spex";
  const created = await home.client.waitRepository(from, key, (repository) => repository.sync.phase === "done");
  const clone = clonePath(home.dataDir, key);
  // The host renames the repository, so its next read hands a new URL.
  host.script.rename(created.id ?? "", { name: "renamed-spex" });
  host.script.sleepListing(1_500);
  t.after(() => host.script.sleepListing(0));
  const requests = host.script.requests.length;
  const fromCheck = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.fetch", { repository: key }), { accepted: true });
  for (let i = 0; i < 400 && !host.script.requests.slice(requests).some((request) => request.path.includes("/repositories")); i += 1) await sleep(25);
  // A terminal sets the remote while the host's read is in flight.
  git(clone, "remote", "set-url", "origin", "/elsewhere/terminal.git");
  const stopped = await home.client.waitRepository(fromCheck, key, (repository) => repository.sync.phase === "stopped", 30_000);
  assert.ok(stopped.sync.phase === "stopped" && /changed meanwhile/.test(stopped.sync.message), JSON.stringify(stopped.sync));
  assert.equal(git(clone, "config", "--get-all", "remote.origin.url"), "/elsewhere/terminal.git", "the terminal's remote stands alone");
});

test("space-60: a remote set while a sync's Check step reads a renamed repository stops the move; the new remote stands", async (t) => {
  const host = await startHost();
  const home = await startHome("move-origin", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  await addFolder(home, gitFolder("moving"));
  await signIn(home, host);
  const from = home.client.mark();
  await home.client.expectOk("space.pick", { repository: `${LOGIN}/moving-spex`, choice: { kind: "create", groupId: "2002", name: "moving" } });
  const key = "acme/moving-spex";
  const created = await home.client.waitRepository(from, key, (repository) => repository.sync.phase === "done");
  const clone = clonePath(home.dataDir, key);
  // The host renames the repository, so the sync's next read would move
  // the clone to acme/renamed-spex.
  host.script.rename(created.id ?? "", { name: "renamed-spex" });
  host.script.sleepListing(3_000);
  t.after(() => host.script.sleepListing(0));
  const requests = host.script.requests.length;
  const fromSync = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.sync", { repository: key }), { accepted: true });
  for (let i = 0; i < 400 && !host.script.requests.slice(requests).some((request) => request.path.includes("/repositories")); i += 1) await sleep(25);
  // The core's own command gives the clone another remote, clearing its
  // recorded id, while the host's read is in flight.
  const remote = bareRepo();
  const set = home.client.command("space.remote.set", { repository: key, url: remote });
  for (let i = 0; i < 400 && git(clone, "config", "--get-all", "remote.origin.url") !== remote; i += 1) await sleep(10);
  assert.equal(git(clone, "config", "--get-all", "remote.origin.url"), remote, "the remote is set while the read is held");
  const stopped = await home.client.waitRepository(fromSync, key, (repository) => repository.sync.phase === "stopped", 30_000);
  assert.ok(stopped.sync.phase === "stopped" && stopped.sync.step === "check" && /changed meanwhile/.test(stopped.sync.message), JSON.stringify(stopped.sync));
  assert.ok((await set).ok);
  assert.ok(existsSync(clone) && !existsSync(clonePath(home.dataDir, "acme/renamed-spex")), "the clone was not moved");
  assert.equal(git(clone, "config", "--get-all", "remote.origin.url"), remote, "the new remote stands");
});

test("space-5: a remote set while space.remote.set read the clone is refused, never replaced", async (t) => {
  const host = await startHost();
  const dataDir = mkdtempSync(join(scratch, "remote-race-"));
  const key = `${OWN}/remote-race-spex`;
  const clone = clonePath(dataDir, key);
  const shim = holdingGit(`${clone} config --get spex.repositoryId`);
  const home = await startHome("remote-race", { host, dataDir, project: false, env: { PATH: shim.path } });
  t.after(() => { shim.release(); return home.stop(); });
  assert.equal((await addFolder(home, gitFolder("remote-race"))).key, key);
  await sleep(200);
  shim.hold();
  const reply = home.client.command("space.remote.set", { repository: key, url: bareRepo() });
  await shim.held();
  // The command read the clone with no remote; a terminal sets one.
  git(clone, "remote", "add", "origin", "/elsewhere/terminal.git");
  shim.release();
  const set = await reply;
  assert.ok(!set.ok && set.error.code === "conflict" && /changed meanwhile/.test(set.error.message), JSON.stringify(set));
  assert.equal(git(clone, "config", "--get-all", "remote.origin.url"), "/elsewhere/terminal.git");
});

test("space-58: a remote set while a pick asked the host is refused, never replaced", async (t) => {
  const host = await startHost();
  const dataDir = mkdtempSync(join(scratch, "pick-origin-"));
  const key = `${LOGIN}/raced-spex`;
  const clone = clonePath(dataDir, key);
  // The pick's own read of the clone, held after it read the remote.
  const shim = holdingGit(`${clone} config --get spex.repositoryId`);
  const home = await startHome("pick-origin", { host, dataDir, project: false, env: { PATH: shim.path }, extra: { signIn: "browser" } });
  t.after(() => { shim.release(); return home.stop(); });
  await signIn(home, host);
  assert.equal((await addFolder(home, gitFolder("raced"))).key, key);
  await sleep(200);
  shim.hold();
  const reply = home.client.command("space.pick", { repository: key, choice: { kind: "create", groupId: "2002", name: "raced" } });
  await shim.held();
  // The pick read the clone local only; a terminal sets a remote before
  // the pick writes the host's.
  git(clone, "remote", "add", "origin", "/elsewhere/terminal.git");
  shim.release();
  const picked = await reply;
  assert.ok(!picked.ok && picked.error.code === "conflict" && /changed meanwhile/.test(picked.error.message), JSON.stringify(picked));
  assert.equal(git(clone, "config", "--get-all", "remote.origin.url"), "/elsewhere/terminal.git");
});

test("space-38: a second home joins a project from the stand-in with its code; a rename moves both clones; an archive turns it read-only; a removed membership unreachable", async (t) => {
  const host = await startHost();
  const code = codeRepository("shared");
  const a = await startHome("host-a", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => a.stop());
  const folderA = join(mkdtempSync(join(scratch, "a-code-")), "shared");
  git(scratch, "clone", "-q", code, folderA);
  await signIn(a, host);
  const local = await addFolder(a, folderA);
  assert.equal(local.key, `${LOGIN}/shared-spex`);
  assert.equal(JSON.parse(readFileSync(join(local.clone, "project.json"), "utf8")).remote, code);
  const sessionA = await runTurn(a, local.key, "From home A");
  const fromA = a.client.mark();
  await a.client.expectOk("space.pick", { repository: local.key, choice: { kind: "create", groupId: "2002", name: "shared" } });
  const key = "acme/shared-spex";
  const pushed = await a.client.waitRepository(fromA, key, (repository) => repository.sync.phase === "done");
  const id = pushed.id ?? "";
  // The second home: your own group's repository joins the first's, and
  // the project lists as not on this device.
  const b = await startHome("host-b", { host, project: false, model: "claude-test", extra: { signIn: "browser" } });
  t.after(() => b.stop());
  const fromB = b.client.mark();
  await signIn(b, host);
  const ownB = await b.client.waitRepository(fromB, HOST_OWN, (repository) => repository.sync.phase !== "running" && repository.sync.phase !== "idle");
  assert.equal(ownB.sync.phase, "done", JSON.stringify(ownB.sync));
  const absent = repositoryOf(await b.client.expectOk("space.get", {}), key);
  assert.deepEqual([absent.state, absent.id, absent.code], ["absent", id, code]);
  // Join: the spex repository and the code, paired, the first home's
  // session served with its history (space-63, space-20).
  const folderB = join(mkdtempSync(join(scratch, "b-code-")), "shared");
  await b.client.expectOk("space.join", { hostId: id, folder: folderB });
  const joined = await b.client.waitRepository(fromB, key, (repository) => repository.state === "reachable" && repository.folder === folderB && repository.sync.phase === "idle");
  assert.equal(joined.code, code);
  assert.ok(existsSync(join(folderB, "README.md")));
  assert.ok((await b.client.expectOk("session.list", {})).some((session) => session.id === sessionA && session.projectId === key));
  const history = await b.client.expectOk("history.get", { sessionId: sessionA });
  assert.ok(history.records.some((entry) => entry.record.type === "turn_started"));
  // A rename on the host moves the clone on its next sync, its pair and
  // key following, on both homes (space-60).
  host.script.rename(id, { name: "renamed-spex" });
  const renamed = "acme/renamed-spex";
  const fromRename = b.client.mark();
  await b.client.expectOk("space.sync", { repository: key });
  const moved = await b.client.waitRepository(fromRename, renamed, (repository) => repository.sync.phase !== "running");
  assert.equal(moved.sync.phase, "done", JSON.stringify(moved.sync));
  assert.ok(existsSync(clonePath(b.dataDir, renamed)) && !existsSync(clonePath(b.dataDir, key)));
  assert.equal(Home.load(b.dataDir).keyForFolder(folderB), renamed);
  assert.equal(git(clonePath(b.dataDir, renamed), "remote", "get-url", "origin"), `${host.gitOrigin}/acme/renamed-spex.git`);
  assert.ok((await b.client.expectOk("session.list", {})).some((session) => session.id === sessionA && session.projectId === renamed));
  const sessionA2 = await runTurn(a, key, "Second from A");
  const fromA2 = a.client.mark();
  await a.client.expectOk("space.sync", { repository: key });
  const movedA = await a.client.waitRepository(fromA2, renamed, (repository) => repository.sync.phase !== "running");
  assert.equal(movedA.sync.phase, "done", JSON.stringify(movedA.sync));
  assert.equal(Home.load(a.dataDir).keyForFolder(folderA), renamed);
  // Archived: read-only with the host's reason; a sync brings the peer's
  // session and sends nothing, this home's new session kept here.
  host.script.archive(id);
  const sessionB = await runTurn(b, renamed, "Kept on B");
  const fromArchive = b.client.mark();
  await b.client.expectOk("space.refresh", {});
  const readOnly = await b.client.waitRepository(fromArchive, renamed, (repository) => repository.state === "read-only");
  assert.equal(readOnly.reason, "This project is archived and its repository is read-only.");
  const bareHead = git(bareOf(host, renamed), "rev-parse", "spex");
  const brought = await b.client.settle("space.sync", { repository: renamed });
  assert.ok(brought.sync.phase === "done" && !brought.sync.pushed && brought.sync.sent === 0 && brought.sync.received > 0, JSON.stringify(brought.sync));
  assert.equal(git(bareOf(host, renamed), "rev-parse", "spex"), bareHead, "nothing was sent");
  assert.ok((await b.client.expectOk("session.list", {})).some((session) => session.id === sessionA2));
  assert.ok(brought.local.some((unit) => unit.sessionId === sessionB), "this home's session stays here, listed to send");
  // The membership removed: unreachable on the next read, the clone whole.
  host.script.removeMember(id);
  const fromGone = b.client.mark();
  await b.client.expectOk("space.refresh", {});
  const gone = await b.client.waitRepository(fromGone, renamed, (repository) => repository.state === "unreachable");
  assert.equal(gone.reason, "No longer shared with you");
  assert.ok(existsSync(join(clonePath(b.dataDir, renamed), "sessions", `${sessionB}.json`)), "nothing on the device is deleted");
});

test("space-38, space-52: the stand-in's 401 stops reauth, its refusal names only its words, a sleeping transport stops timeout; a credentialed origin is refused", async (t) => {
  const host = await startHost();
  const home = await startHome("host-failures", { host, project: false, extra: { signIn: "browser", spaceTransportTimeoutMs: 4_000 } });
  t.after(() => home.stop());
  // A folder whose origin carries a credential is refused before its
  // project.json is written (space-5).
  const leaky = gitFolder("leaky");
  git(leaky, "remote", "add", "origin", "https://user:token@example.com/leaky.git");
  await home.client.expectError("project.register", { path: leaky }, "invalid_request", /stores no credential/);
  assert.ok(!existsSync(clonePath(home.dataDir, `${OWN}/leaky-spex`)));
  const from = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done");
  // A transport the host answers 401 asks for a sign-in (space-15).
  host.script.unauthorizeTransport(true);
  const reauth = await home.client.settle("space.fetch", { repository: HOST_OWN });
  assert.ok(reauth.sync.phase === "stopped" && reauth.sync.cause === "reauth" && reauth.sync.message === "Sign in again", JSON.stringify(reauth.sync));
  assert.match(reauth.sync.guidance, /Sign in from the header/);
  host.script.unauthorizeTransport(false);
  // A refusal names the host's own words and the members page, claims no
  // role and offers no act the host did not name (space-50).
  const words = "Your account is blocked by GitLab.com: contact support.";
  host.script.refuseTransport(words);
  const refused = await home.client.settle("space.sync", { repository: HOST_OWN });
  assert.ok(refused.sync.phase === "stopped" && refused.sync.cause === "refused", JSON.stringify(refused.sync));
  assert.equal(refused.sync.message, `${HOST_NAME} refused: ${words}`);
  assert.match(refused.sync.guidance, /members page/);
  assert.doesNotMatch(`${refused.sync.message} ${refused.sync.guidance}`, /\b(Owner|Maintainer|Developer|Reporter|Guest|role)\b|SSH key|gh auth|credential helper/);
  assert.deepEqual([refused.state, refused.reason], ["read-only", refused.sync.message]);
  host.script.refuseTransport(null);
  // A transport that sleeps past the limit stops "timeout".
  host.script.sleepTransport(15_000);
  t.after(() => host.script.sleepTransport(0));
  const start = Date.now();
  const slept = await home.client.settle("space.fetch", { repository: HOST_OWN });
  assert.ok(slept.sync.phase === "stopped" && slept.sync.cause === "timeout", JSON.stringify(slept.sync));
  assert.equal(slept.sync.message, `No answer from ${HOST_NAME}`);
  assert.ok(Date.now() - start < 12_000, "the shortened limit ends it");
});

test("git-host-11: a read the stand-in refuses keeps the previous view and its time, phrased in English and in Chinese", async (t) => {
  const host = await startHost();
  const home = await startHome("host-relay", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const from = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done");
  const before = await home.client.expectOk("space.get", {});
  const refresh = async (expected: string): Promise<void> => {
    const mark = home.client.mark();
    await home.client.expectOk("space.refresh", {});
    const row = await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.reason === expected);
    assert.equal(row.state, "unreachable");
    const state = await home.client.expectOk("space.get", {});
    assert.equal(state.readAt, before.readAt, "the previous view keeps its time");
    assert.deepEqual(state.groups.map((group) => group.fullPath), before.groups.map((group) => group.fullPath));
  };
  const words = "Your account is blocked.";
  host.script.refuseHost(1, words);
  await refresh(`${HOST_NAME} refused: ${words}`);
  host.script.rateLimit(1, "30");
  await refresh(`${HOST_NAME} asks to wait; try again after 30`);
  await home.client.expectOk("language.set", { language: "zh" });
  host.script.refuseHost(1, words);
  await refresh(`${HOST_NAME} 拒绝了：${words}`);
  host.script.rateLimit(1, "30");
  await refresh(`${HOST_NAME} 要求稍候；请在 30 之后重试`);
  host.script.unavailable(1);
  await refresh(`无法连接 ${HOST_NAME}`);
  // A read that succeeds again ends the failure.
  const mark = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  const back = await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.state === "reachable");
  assert.equal(back.reason, null);
});
