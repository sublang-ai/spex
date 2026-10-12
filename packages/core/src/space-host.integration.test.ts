// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Groups surface against the stand-in Git host (git-host-12):
// sign-in in both flows, picks, joins, members, the notice, sign-out
// by the reader and by the host, the read a signed-in start owes, and
// the host's renames, archives, removals and refusals over its own
// HTTP transport, and groups and sharing — the host's roles and what
// it lets the person do, groups created, members added and removed
// (space-37, space-38, space-52, space-59, space-65, git-host-4,
// git-host-5, git-host-7, git-host-8, git-host-11, git-host-15..17) —
// hermetic, on loopback alone, in a file budget of its own.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { basename, join } from "node:path";
import { resolveMachineIdentity } from "@sublang/playbook/machine-identity";
import { createSessionStore } from "@sublang/playbook/session-store";
import { CredentialChanged, GitHostClient, fileCredentialStore, type CredentialStore, type HostAccount, type StoredCredential } from "./git-host.js";
import { Home } from "./home.js";
import { seedHistorySession } from "./testing/demo.js";
import { holdingFetch, samePair, settled } from "./testing/holding-fetch.js";
import { clonePath, createSpaceHarness, OWN, OWN_KEY, ownClone, prefsOf, repositoryOf } from "./testing/space-harness.js";
import { STANDIN_STORAGE, type StandinHost } from "./testing/standin-host.js";
import type { GroupsState, RepositoryState } from "./protocol.js";

const fixture = createSpaceHarness();
const { scratch, git, gitFolder, bareRepo, addFolder, sleep, startHome, startHost, signIn, runTurn, holdingGit, turnRecords } = fixture;
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
  return host.bareOf(key);
}

/** The host's id of the repository whose creation by the core a clone's
 * own Git configuration records (git-host-7), if any. */
function createdOn(clone: string): string | null {
  const read = spawnSync("git", ["-C", clone, "config", "--local", "--get", "spex.created"], { encoding: "utf8" });
  return read.status === 0 ? read.stdout.trim() : null;
}

/** A repository's readings up to its first sync's end: they reach the
 * sync and its end, and none reads unreachable (space-61). */
function assertNeverUnreachable(readings: RepositoryState[]): void {
  assert.ok(readings.some((repository) => repository.sync.phase === "running"), "the readings reach the sync");
  assert.equal(readings[readings.length - 1]?.sync.phase, "done", "the readings reach the sync's end");
  const unreachable = readings.filter((repository) => repository.state === "unreachable");
  assert.deepEqual(unreachable.map((repository) => `${repository.key}: ${repository.reason ?? ""} (${repository.sync.phase})`), []);
}

/** Each repository creation the stand-in was asked for, as its name and
 * the `group_id` its body named, in order (git-host-6). */
function creationsAsked(host: StandinHost): [unknown, unknown][] {
  return host.script.creations.map((body) => {
    const { name, group_id: groupId } = body as { name?: unknown; group_id?: unknown };
    return [name, groupId];
  });
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
  assert.deepEqual(signed.account, { id: "1001", login: LOGIN, displayName: "Ada Lovelace", canCreateGroup: true });
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
  // Asked of the stand-in in your own group by none, never by its id,
  // which names no group of the instance there (git-host-6).
  assert.deepEqual(creationsAsked(host), [[`${LOGIN}-spex`, null]]);
  // Created at the host, it goes straight to its sync: no state between
  // reads it no longer shared (space-61, git-host-5).
  assertNeverUnreachable(home.client.readings(from, [OWN_KEY, HOST_OWN]));
  assert.equal(git(bareOf(host, HOST_OWN), "rev-parse", "spex"), git(clone, "rev-parse", "spex"));
  assert.equal(git(bareOf(host, HOST_OWN), "symbolic-ref", "HEAD"), "refs/heads/main");
  assert.equal(git(clone, "config", "--get", "spex.repositoryId"), own.id);
  // The clone's remote is the Git URL the stand-in handed over; the
  // state reads it as its path in the instance (space-30, DR-120).
  assert.equal(own.remote, HOST_OWN);
  const origin = git(clone, "remote", "get-url", "origin");
  assert.ok(origin.startsWith(`${host.gitOrigin}/${LOGIN}/`) && !origin.includes("@"), origin);
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
  // What the host lets the person do waits for a read held since the
  // start, as do its roles (DR-114).
  assert.deepEqual(reread.account, { ...signed.account, canCreateGroup: false });
  assert.deepEqual(reread.roles, []);
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
  assert.deepEqual(read.account, signed.account);
  assert.deepEqual(read.roles, signed.roles);
  await again.client.expectOk("space.get", {});
  await sleep(300);
  assert.equal(reads() - readsBefore, 1, "one read of the host for every ask since the start");
});

test("space-37: a fresh core with no sync of a clone recorded reads the last sync the clone holds", async (t) => {
  const host = await startHost();
  const home = await startHome("agreed", { host });
  t.after(() => home.stop());
  await addFolder(home, home.projectDir);
  const from = home.client.mark();
  await signIn(home, host);
  const synced = await home.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done");
  assert.ok(synced.lastSync, "the sign-in's sync is recorded");
  const clone = clonePath(home.dataDir, HOST_OWN);
  const pushed = git(clone, "rev-parse", "spex");
  assert.equal(git(clone, "rev-parse", "refs/remotes/origin/spex"), pushed);
  const at = Number(git(clone, "log", "-1", "--format=%ct", pushed)) * 1000;
  assert.deepEqual(synced.branch?.agreed, { at, current: true });
  await home.stop();
  // The record gone — a sync made elsewhere, or a home that kept none —
  // the clone itself still holds its last sync (space-61, DR-111).
  const prefsFile = join(home.dataDir, "local", "prefs.json");
  const file = JSON.parse(readFileSync(prefsFile, "utf8")) as { prefs: Record<string, unknown> };
  delete file.prefs[`sync:${HOST_OWN}:last`];
  writeFileSync(prefsFile, JSON.stringify(file));
  const again = await startHome("agreed-again", { dataDir: home.dataDir, project: false, host });
  t.after(() => again.stop());
  const read = await again.client.expectOk("space.get", {});
  const own = repositoryOf(read, HOST_OWN);
  assert.equal(own.lastSync, null);
  assert.deepEqual(own.branch?.agreed, { at, current: true });
  // A project's clone the host's `spex` never reached holds no sync.
  const project = repositoryOf(read, `${LOGIN}/${basename(home.projectDir)}-spex`);
  assert.equal(project.state, "local-only");
  assert.ok(project.branch, "the project's clone is read");
  assert.equal(project.branch.agreed, null);
  // A commit on `spex` alone: the clone and the host last agreed on the
  // pushed commit, and no longer do.
  git(clone, "-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", "Only here");
  const ahead = await again.client.repository(HOST_OWN);
  assert.deepEqual(ahead.branch?.agreed, { at, current: false });
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
  // Your own group's id names no group of the instance: refused before
  // the stand-in is asked to create anything (git-host-6).
  const asked = creationsAsked(host).length;
  await home.client.expectError("space.pick", { repository: local, choice: { kind: "create", groupId: "2001", name: "alpha" } }, "not_found", /The host lists no such group/);
  assert.equal(creationsAsked(host).length, asked);
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

test("git-host-14: a creation's first sync reads the stand-in again until the README it held lands; one that never lands gets `main` from that sync before `spex`, or, that push refused, stops in the stand-in's words, a Retry stopping with no read again until the README lands; a core stopped during those reads leaves the creation on the clone for the next core's sync", async (t) => {
  const host = await startHost();
  const home = await startHome("created-uninitialized", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const signedFrom = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(signedFrom, HOST_OWN, (repository) => repository.sync.phase === "done");
  t.after(() => host.script.holdInitialization(null));
  /** The reads of one repository made since `asked` beyond the one each
   * read of the host makes: the check's reads of it again. */
  const rereads = (asked: number, id: string): number => {
    const reads = host.script.requests.slice(asked).filter((request) => request.method === "GET");
    return reads.filter((request) => request.path === `/api/v1/host/repositories/${id}`).length - reads.filter((request) => request.path === "/api/v1/host/me").length;
  };
  // The stand-in answers the creation, and its first reads, before the
  // README lands on `main`: the creation's first sync reads it again and
  // pushes beside it with no stop (git-host-7).
  host.script.holdInitialization(5);
  const soon = await addFolder(home, gitFolder("soon"));
  let asked = host.script.requests.length;
  let from = home.client.mark();
  await home.client.expectOk("space.pick", { repository: soon.key, choice: { kind: "create", groupId: "2002", name: "soon" } });
  const pushed = await home.client.waitRepository(from, "acme/soon-spex", (repository) => repository.sync.phase === "done", 30_000);
  assert.deepEqual(home.client.readings(from, [soon.key, "acme/soon-spex"]).filter((repository) => repository.sync.phase === "stopped").map((repository) => repository.sync), []);
  assert.ok(pushed.lastSync && pushed.lastSync.sent > 0, JSON.stringify(pushed.lastSync));
  assert.ok(rereads(asked, pushed.id ?? "") >= 1, "the check read the repository again");
  const soonBare = bareOf(host, "acme/soon-spex");
  assert.equal(git(soonBare, "ls-tree", "--name-only", "main"), "README.md");
  assert.equal(git(soonBare, "symbolic-ref", "HEAD"), "refs/heads/main");
  assert.equal(git(soonBare, "rev-parse", "spex"), git(clonePath(home.dataDir, "acme/soon-spex"), "rev-parse", "spex"));
  // One whose README never lands gets it from that first sync once it has
  // read it again five times: `main`, one commit of the README the
  // stand-in would have written, made with the clone's identity and
  // pushed first, so the stand-in takes it as its default, then `spex`
  // beside it, with no stop and the clone's own branch and files
  // untouched (git-host-7).
  host.script.holdInitialization(Infinity);
  const never = await addFolder(home, gitFolder("never"));
  const neverKey = "acme/never-spex";
  asked = host.script.requests.length;
  from = home.client.mark();
  await home.client.expectOk("space.pick", { repository: never.key, choice: { kind: "create", groupId: "2002", name: "never" } });
  const made = await home.client.waitRepository(from, neverKey, (repository) => repository.sync.phase !== "idle" && repository.sync.phase !== "running", 30_000);
  assert.ok(made.sync.phase === "done" && made.sync.pushed, JSON.stringify(made.sync));
  assert.deepEqual(home.client.readings(from, [never.key, neverKey]).filter((repository) => repository.sync.phase === "stopped").map((repository) => repository.sync), []);
  assert.equal(rereads(asked, made.id ?? ""), 5);
  const neverBare = bareOf(host, neverKey);
  const neverClone = clonePath(home.dataDir, neverKey);
  assert.equal(git(neverBare, "symbolic-ref", "HEAD"), "refs/heads/main");
  assert.equal(git(neverBare, "ls-tree", "--name-only", "main"), "README.md");
  assert.equal(git(neverBare, "show", "main:README.md"), "# never-spex");
  assert.equal(git(neverBare, "rev-list", "--count", "main"), "1");
  assert.equal(git(neverBare, "log", "-1", "--format=%an <%ae>", "main"), "Ada Lovelace <ada@users.noreply.127.0.0.1>");
  assert.equal(git(neverBare, "rev-parse", "spex"), git(neverClone, "rev-parse", "spex"));
  assert.equal(git(neverClone, "for-each-ref", "--format=%(refname)", "refs/heads/"), "refs/heads/spex");
  assert.equal(git(neverClone, "status", "--porcelain"), "");
  assert.equal(createdOn(neverClone), null, "the clone records the creation no more");
  // That push refused, as a protected default branch refuses a member
  // who may not push there, the sync stops after the re-reads in the
  // stand-in's words, nothing pushed (git-host-7).
  const protectedWords = "You are not allowed to push code to protected branches on this project.";
  host.script.refuseDefaultBranch(protectedWords);
  t.after(() => host.script.refuseDefaultBranch(null));
  const refused = await addFolder(home, gitFolder("refused"));
  const key = "acme/refused-spex";
  asked = host.script.requests.length;
  from = home.client.mark();
  await home.client.expectOk("space.pick", { repository: refused.key, choice: { kind: "create", groupId: "2002", name: "refused" } });
  const stopped = await home.client.waitRepository(from, key, (repository) => repository.sync.phase !== "idle" && repository.sync.phase !== "running", 30_000);
  assert.ok(stopped.sync.phase === "stopped" && stopped.sync.step === "check" && stopped.sync.cause === "refused" && stopped.sync.retry, JSON.stringify(stopped.sync));
  assert.equal(stopped.sync.message, `${HOST_NAME} refused: ${protectedWords}`);
  assert.equal(rereads(asked, stopped.id ?? ""), 5);
  const refusedBare = bareOf(host, key);
  assert.equal(git(refusedBare, "for-each-ref", "refs/heads/"), "");
  // A Retry is no creation's first sync: it stops at once, the host
  // holding no default branch for it, reading the repository no more;
  // once the README lands, a Retry pushes beside it, `main` alone being
  // refused (git-host-7).
  asked = host.script.requests.length;
  const retried = await home.client.settle("space.sync", { repository: key });
  assert.ok(retried.sync.phase === "stopped" && retried.sync.message === `${HOST_NAME} holds no default branch for it yet`, JSON.stringify(retried.sync));
  assert.equal(rereads(asked, stopped.id ?? ""), 0);
  assert.equal(git(refusedBare, "for-each-ref", "refs/heads/"), "");
  host.script.holdInitialization(null);
  const synced = await home.client.settle("space.sync", { repository: key });
  assert.ok(synced.sync.phase === "done" && synced.sync.pushed, JSON.stringify(synced.sync));
  assert.equal(git(refusedBare, "ls-tree", "--name-only", "main"), "README.md");
  assert.equal(git(refusedBare, "rev-parse", "spex"), git(clonePath(home.dataDir, key), "rev-parse", "spex"));
  // A core stopped while a creation's first sync reads it again — the app
  // closed — leaves the creation recorded on the clone, so the next core
  // on the home reads it again and pushes `main`, then `spex` (git-host-7).
  host.script.refuseDefaultBranch(null);
  host.script.holdInitialization(Infinity);
  const restarted = await addFolder(home, gitFolder("restarted"));
  const restartedKey = "acme/restarted-spex";
  asked = host.script.requests.length;
  await home.client.expectOk("space.pick", { repository: restarted.key, choice: { kind: "create", groupId: "2002", name: "restarted" } });
  const createdId = (): string => host.script.repositories.find((repository) => repository.path === "restarted-spex")?.id ?? "";
  for (let i = 0; i < 400 && rereads(asked, createdId()) < 1; i += 1) await sleep(25);
  const id = createdId();
  assert.ok(rereads(asked, id) >= 1, "the first sync reads the repository again");
  await home.stop();
  assert.ok(rereads(asked, id) < 5, "the core stopped before the reads ended");
  const restartedClone = clonePath(home.dataDir, restartedKey);
  const restartedBare = bareOf(host, restartedKey);
  assert.equal(createdOn(restartedClone), id);
  assert.equal(git(restartedBare, "for-each-ref", "refs/heads/"), "");
  const again = await startHome("created-uninitialized-again", { host, dataDir: home.dataDir, project: false, extra: { signIn: "browser" } });
  t.after(() => again.stop());
  asked = host.script.requests.length;
  // This sync holds the five 2 s re-reads by design, after the restarted
  // core's own set-up, so its budget is the creation cases' 30 s and more.
  const resumed = await again.client.settle("space.sync", { repository: restartedKey }, 60_000);
  assert.ok(resumed.sync.phase === "done" && resumed.sync.pushed, JSON.stringify(resumed.sync));
  assert.equal(rereads(asked, id), 5);
  assert.equal(git(restartedBare, "symbolic-ref", "HEAD"), "refs/heads/main");
  assert.equal(git(restartedBare, "show", "main:README.md"), "# restarted-spex");
  assert.equal(git(restartedBare, "rev-parse", "spex"), git(restartedClone, "rev-parse", "spex"));
  assert.equal(createdOn(restartedClone), null, "the clone records the creation no more");
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
  assert.deepEqual(Object.keys(members), ["members"], "no page of the host");
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

test("git-host-14, space-37: with every members route failing at the stand-in, a Refresh and a sync's Check stand with no count, and a pick joining or a first push waits for the notice", async (t) => {
  const host = await startHost();
  t.after(() => host.script.failMembers(false));
  const code = codeRepository("solo");
  const solo = host.script.addRepository({ group: "acme", name: "solo-spex", project: { format: 1, name: "solo", remote: code } });
  const pal = host.script.addRepository({ group: "acme", name: "pal-spex" });
  const home = await startHome("members-down", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const signedIn = home.client.mark();
  const signed = await signIn(home, host);
  // Counted while the stand-in answers: the account alone (git-host-5).
  assert.equal(repositoryOf(signed, "acme/solo-spex").members, 1);
  assert.equal(repositoryOf(signed, "acme/pal-spex").members, 1);
  await home.client.waitRepository(signedIn, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);

  // The stand-in fails every members route, every other answering, as
  // spex.pub does while its service identity's read fails: a Refresh
  // holds its read, each count unknown and the rest as listed
  // (git-host-5).
  host.script.failMembers(true);
  const before = (await home.client.expectOk("space.get", {})).readAt ?? 0;
  const fromRead = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  const read = await home.client.waitSpace(fromRead, (state) => (state.readAt ?? 0) > before, 30_000);
  assert.deepEqual(read.groups.map((group) => group.fullPath), [LOGIN, "acme", "acme/research"]);
  assert.deepEqual([HOST_OWN, "acme/solo-spex", "acme/pal-spex"].map((key) => [key, repositoryOf(read, key).state, repositoryOf(read, key).members]), [
    [HOST_OWN, "reachable", null],
    ["acme/solo-spex", "absent", null],
    ["acme/pal-spex", "absent", null],
  ]);
  assert.equal(repositoryOf(read, "acme/solo-spex").id, solo.id);
  // A members read is the host's failure, relayed (git-host-11).
  await home.client.expectError("space.members", { repository: HOST_OWN }, "invalid_request", new RegExp(`^Could not reach ${HOST_NAME}`));

  // A sync's Check reads the host and goes on (git-host-5).
  const synced = await home.client.settle("space.sync", { repository: HOST_OWN });
  assert.equal(synced.sync.phase, "done", JSON.stringify(synced.sync));
  assert.equal(synced.state, "reachable");

  // An unknown count is taken to have other members (space-57): the first
  // sync of a repository joined here waits for the notice, then goes on.
  const folder = join(mkdtempSync(join(scratch, "solo-")), "solo");
  const fromJoin = home.client.mark();
  await home.client.expectOk("space.join", { hostId: solo.id, folder });
  const joined = await home.client.waitRepository(fromJoin, "acme/solo-spex", (repository) => repository.state !== "absent" && repository.folder !== null && repository.sync.phase === "idle", 30_000);
  assert.equal(joined.state, "reachable");
  assert.equal(joined.members, null);
  await home.client.expectError("space.sync", { repository: "acme/solo-spex" }, "invalid_request", /sharing notice/);
  const noticed = await home.client.settle("space.sync", { repository: "acme/solo-spex", noticed: true });
  assert.equal(noticed.sync.phase, "done", JSON.stringify(noticed.sync));
  // And a pick joining one waits for it too.
  const mine = await addFolder(home, gitFolder("pal"));
  await home.client.expectError("space.pick", { repository: mine.key, choice: { kind: "join", hostId: pal.id } }, "invalid_request", /sharing notice/);
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
  const signedIn = home.client.mark();
  await signIn(home, host);
  // The sign-in's set-up of your own group runs on after the sign-in
  // reads idle; the pick starts only once that sync has settled, or its
  // host reads race the pick's own.
  await home.client.waitRepository(signedIn, HOST_OWN, (repository) => repository.sync.phase === "done" || repository.sync.phase === "stopped", 30_000);
  const added = home.client.mark();
  assert.equal((await addFolder(home, gitFolder("raced"))).key, key);
  // The Groups state the registration sets going reads the new clone
  // after the reply; the hold waits for it, or that read takes the hold.
  await home.client.waitRepository(added, key, () => true);
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

test("space-73: a repository the host moved keeps the clone's sync and this device's record through a pick; another repository's remote clears them", async (t) => {
  const host = await startHost();
  const home = await startHome("moved-pick", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  t.after(() => host.script.sleepListing(0));
  const signedIn = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(signedIn, HOST_OWN, (repository) => repository.sync.phase === "done" || repository.sync.phase === "stopped", 30_000);
  // Created in your own group on the host and synced from here.
  await addFolder(home, gitFolder("invites"));
  const key = `${LOGIN}/invites-spex`;
  const fromCreate = home.client.mark();
  await home.client.expectOk("space.pick", { repository: key, choice: { kind: "create", groupId: null, name: "invites" } });
  // Your own group named to the stand-in by none (git-host-6).
  assert.deepEqual(creationsAsked(host).at(-1), ["invites-spex", null]);
  const synced = await home.client.waitRepository(fromCreate, key, (repository) => repository.sync.phase === "done", 30_000);
  const clone = clonePath(home.dataDir, key);
  const pushed = git(clone, "rev-parse", "spex");
  const at = Number(git(clone, "log", "-1", "--format=%ct", pushed)) * 1000;
  const id = synced.id ?? "";
  assert.ok(synced.lastSync && id, JSON.stringify(synced));
  assert.deepEqual(synced.branch?.agreed, { at, current: true });

  // The host moves it into acme, its id kept; the reader takes the remote
  // away, the clone still recording that repository.
  host.script.rename(id, { group: "acme" });
  const away = repositoryOf(await home.client.expectOk("space.remote.set", { repository: key, url: null }), key);
  assert.equal(away.state, "local-only");
  assert.equal(away.id, id);
  assert.equal(git(clone, "rev-parse", "refs/remotes/origin/spex"), pushed);
  assert.deepEqual(prefsOf(home.dataDir)[`sync:${key}:last`], synced.lastSync);
  const before = (await home.client.expectOk("space.get", {})).readAt ?? 0;
  const fromRead = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  await home.client.waitSpace(fromRead, (state) => (state.readAt ?? 0) > before);

  // Picked into acme by the host's id: the same repository keeps the sync
  // the clone holds and this device's record, read while the pick's sync
  // waits on its host read (space-5).
  host.script.sleepListing(2_000);
  const fromJoin = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.pick", { repository: key, choice: { kind: "join", hostId: id }, noticed: true }), { accepted: true });
  const joined = await home.client.repository(key);
  assert.equal(joined.state, "reachable");
  assert.equal(joined.remote, "acme/invites-spex");
  assert.equal(joined.id, id);
  assert.deepEqual(joined.lastSync, synced.lastSync, "this device's recorded sync is kept");
  assert.deepEqual(joined.branch?.agreed, { at, current: true }, "the sync the clone holds is kept");
  assert.equal(git(clone, "config", "--get", "branch.spex.remote"), "origin");
  host.script.sleepListing(0);
  const moved = "acme/invites-spex";
  const followed = await home.client.waitRepository(fromJoin, moved, (repository) => repository.sync.phase === "done", 30_000);
  assert.ok(followed.lastSync && followed.lastSync.at >= (synced.lastSync?.at ?? 0), JSON.stringify(followed.lastSync));
  assert.deepEqual(followed.branch?.agreed, { at, current: true });

  // Taken away again and a group picked to create another repository: the
  // host's remote for another id clears them (space-5).
  const movedClone = clonePath(home.dataDir, moved);
  await home.client.expectOk("space.remote.set", { repository: moved, url: null });
  host.script.sleepListing(2_000);
  const fromOther = home.client.mark();
  await home.client.expectOk("space.pick", { repository: moved, choice: { kind: "create", groupId: "2003", name: "invites" } });
  assert.deepEqual(creationsAsked(host).at(-1), ["invites-spex", "2003"]);
  const other = await home.client.repository(moved);
  assert.equal(other.remote, "acme/research/invites-spex");
  assert.ok(other.id && other.id !== id, JSON.stringify(other.id));
  assert.equal(other.lastSync, null);
  assert.equal(other.branch?.agreed, null);
  assert.equal(prefsOf(home.dataDir)[`sync:${moved}:last`], undefined);
  assert.throws(() => git(movedClone, "rev-parse", "-q", "--verify", "refs/remotes/origin/spex"));
  host.script.sleepListing(0);
  const research = "acme/research/invites-spex";
  const created = await home.client.waitRepository(fromOther, research, (repository) => repository.sync.phase === "done", 30_000);
  assert.ok(created.lastSync, "its own sync is recorded");

  // A remote the reader names is another repository too (space-5).
  const named = repositoryOf(await home.client.expectOk("space.remote.set", { repository: research, url: bareRepo() }), research);
  assert.equal(named.lastSync, null);
  assert.equal(named.branch?.agreed, null);
  assert.equal(named.branch?.checkedAt, null);
  assert.equal(named.id, null);
  assert.equal(prefsOf(home.dataDir)[`sync:${research}:last`], undefined);
});

/** A Playbook session lease `sessions/.<id>.lock` planted in a clone as
 * a writer of another process or machine leaves it, in Playbook's owner
 * shape; `fields` overrides or adds owner fields. */
function plantLease(clone: string, id: string, owner: { pid: number; hostname: string }, fields: Record<string, unknown> = {}): string {
  const dir = join(clone, "sessions", `.${id}.lock`);
  mkdirSync(dir, { mode: 0o700 });
  writeFileSync(join(dir, "owner.json"), JSON.stringify({ schemaVersion: 1, kind: "captain-session-lease", sessionId: id, ownerToken: randomUUID(), pid: owner.pid, hostname: owner.hostname, acquiredAt: new Date().toISOString(), ...fields }), { mode: 0o600 });
  return dir;
}

/** Release a lease in a test's teardown, once its body failed: one gone
 * with a clone a defective move took away answers ENOENT, which must not
 * replace the failed assertion. A body that passed releases strictly. */
async function releaseLease(lease: { release(): Promise<unknown> }): Promise<void> {
  try { await lease.release(); }
  catch (error) {
    const gone = (error as NodeJS.ErrnoException).code === "ENOENT" || ((error as { cause?: NodeJS.ErrnoException }).cause)?.code === "ENOENT";
    if (!gone) throw error;
  }
}

/** A process of this machine that has exited: a dead owner's pid. */
const deadPid = (): number => spawnSync(process.execPath, ["-e", ""]).pid as number;

/** Whether the scratch filesystem folds case: `a` written, `A` read. */
const foldsCase = ((): boolean => {
  const dir = mkdtempSync(join(fixture.scratch, "case-"));
  writeFileSync(join(dir, "a"), "");
  return existsSync(join(dir, "A"));
})();

/** A project's spex repository created in the stand-in's acme group by a
 * signed-in home and synced there, with one finished session. */
async function acmeProject(home: Awaited<ReturnType<typeof startHome>>, name: string): Promise<{ key: string; id: string; clone: string; folder: string; sessionId: string }> {
  const folder = gitFolder(name);
  await addFolder(home, folder);
  const from = home.client.mark();
  await home.client.expectOk("space.pick", { repository: `${LOGIN}/${name}-spex`, choice: { kind: "create", groupId: "2002", name } });
  const key = `acme/${name}-spex`;
  const created = await home.client.waitRepository(from, key, (repository) => repository.sync.phase === "done");
  const sessionId = await runTurn(home, key, `Work in ${name}`);
  return { key, id: created.id ?? "", clone: clonePath(home.dataDir, key), folder, sessionId };
}

test("space-60: a sync moving a renamed repository's clone stops naming a session whose lease stands beneath it, and moves it once released, a dead owner's lease moving with it", async (t) => {
  const host = await startHost();
  const home = await startHome("move-leased", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  await signIn(home, host);
  const { key, id, clone, folder, sessionId } = await acmeProject(home, "leased");
  host.script.rename(id, { name: "relocated-spex" });
  const renamed = "acme/relocated-spex";
  const sessions = createSessionStore({ sessionsDir: join(clone, "sessions") });
  await sessions.prepare();
  const stopsNaming = async (why: string, named: RegExp): Promise<void> => {
    const stopped = await home.client.settle("space.sync", { repository: key });
    assert.ok(stopped.sync.phase === "stopped" && stopped.sync.step === "check" && stopped.sync.cause === "lease" && named.test(stopped.sync.message) && stopped.sync.retry, `${why}: ${JSON.stringify(stopped.sync)}`);
    assert.ok(existsSync(join(clone, "sessions", `${sessionId}.json`)) && !existsSync(clonePath(home.dataDir, renamed)), `${why}: the clone stays where it was`);
    assert.equal(Home.load(home.dataDir).keyForFolder(folder), key, `${why}: its pair stays`);
    assert.ok((await home.client.expectOk("session.list", {})).some((session) => session.id === sessionId && session.projectId === key), `${why}: its session stays listed there`);
  };
  // A live writer's lease of a recorded session, and one standing only as
  // its lease file, hold the clone where it is (space-60).
  const live = await sessions.acquireManagement(sessionId);
  let released = false;
  try { await stopsNaming("a live lease", /“Work in leased” is in use/); await live.release(); released = true; }
  finally { if (!released) await releaseLease(live); }
  const leaseOnly = randomUUID();
  const onlyLease = await sessions.acquireManagement(leaseOnly);
  released = false;
  try { await stopsNaming("a lease-only session", new RegExp(`Session ${leaseOnly.slice(0, 8)} is in use`)); await onlyLease.release(); released = true; }
  finally { if (!released) await releaseLease(onlyLease); }
  // Another machine's lease cannot be proven dead here.
  const foreignId = randomUUID();
  const foreign = plantLease(clone, foreignId, { pid: process.pid, hostname: "machine-id:v1:00000000-0000-4000-8000-0000000000ff" });
  try { await stopsNaming("another machine's lease", new RegExp(`Session ${foreignId.slice(0, 8)} is in use`)); }
  finally { rmSync(foreign, { recursive: true, force: true }); }
  // A dead process of this machine whose owner record is not Playbook's
  // supported shape cannot be read as harmless.
  const identity = await resolveMachineIdentity({ env: process.env, homeDir: process.env.HOME ?? homedir() });
  const malformedId = randomUUID();
  const malformed = plantLease(clone, malformedId, { pid: deadPid(), hostname: identity }, { kind: "another-lease" });
  try { await stopsNaming("a malformed owner", new RegExp(`Session ${malformedId.slice(0, 8)} is in use`)); }
  finally { rmSync(malformed, { recursive: true, force: true }); }
  // Leases left by dead processes of this machine — named by its identity
  // or by its legacy host name — hold nothing: the next sync moves the
  // clone, every pair and session following it.
  const deadId = randomUUID();
  plantLease(clone, deadId, { pid: deadPid(), hostname: identity });
  const legacyId = randomUUID();
  plantLease(clone, legacyId, { pid: deadPid(), hostname: hostname() });
  const fromMove = home.client.mark();
  await home.client.expectOk("space.sync", { repository: key });
  const moved = await home.client.waitRepository(fromMove, renamed, (repository) => repository.sync.phase !== "running" && repository.sync.phase !== "idle");
  assert.equal(moved.sync.phase, "done", JSON.stringify(moved.sync));
  assert.ok(!existsSync(clone), "the clone left its former path");
  assert.ok(existsSync(join(clonePath(home.dataDir, renamed), "sessions", `${sessionId}.json`)));
  assert.ok(existsSync(join(clonePath(home.dataDir, renamed), "sessions", `.${deadId}.lock`, "owner.json")), "the dead owner's lease moved with it");
  assert.ok(existsSync(join(clonePath(home.dataDir, renamed), "sessions", `.${legacyId}.lock`, "owner.json")), "the legacy dead owner's lease moved with it");
  assert.equal(Home.load(home.dataDir).keyForFolder(folder), renamed);
  assert.ok((await home.client.expectOk("session.list", {})).some((session) => session.id === sessionId && session.projectId === renamed));
});

test("space-37: a sign-in on a second home whose own group's clone holds only the set-up commits takes the host's environment and configuration without asking; one holding a session of its own asks", async (t) => {
  const host = await startHost();
  // The first device pushes your own group's spex repository, then
  // another environment and configuration into it.
  const first = await startHome("first-device", { host, project: false, model: "claude-test-first", extra: { signIn: "browser" } });
  t.after(() => first.stop());
  const fromFirst = first.client.mark();
  await signIn(first, host);
  await first.client.waitRepository(fromFirst, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  const firstClone = clonePath(first.dataDir, HOST_OWN);
  const builtin = /sublang\/playbooks:\s*\n\s*version:\s*"?\^([^"\s]+)"?/.exec(readFileSync(join(firstClone, "spex.yaml"), "utf8"))?.[1];
  assert.ok(builtin, readFileSync(join(firstClone, "spex.yaml"), "utf8"));
  const fromRequest = first.client.mark();
  await first.client.expectOk("environment.request", { repository: HOST_OWN, name: "sublang/playbooks", request: { kind: "registry", version: builtin } });
  await first.client.waitFor((message) => first.client.messages.indexOf(message) >= fromRequest && message.type === "environment.state" && message.repository === HOST_OWN && message.state.busy === null && message.state.stale === null && message.state.requests["sublang/playbooks"]?.kind === "registry" && (message.state.requests["sublang/playbooks"] as { version: string }).version === builtin, 60_000);
  await first.client.expectOk("config.edit", { op: { kind: "captain.set", patch: { model: "claude-test-host" } } });
  assert.equal((await first.client.settle("space.sync", { repository: HOST_OWN })).sync.phase, "done");
  const hostFiles = ["spex.yaml", "spex.lock", "config/playbook.config.yaml"];
  const hosted = new Map(hostFiles.map((file) => [file, readFileSync(join(firstClone, file))]));
  for (const file of hostFiles) assert.equal(git(bareOf(host, HOST_OWN), "show", `spex:${file}`), hosted.get(file)?.toString("utf8").trim(), `the host holds the first device's ${file}`);
  const hostRoot = git(bareOf(host, HOST_OWN), "rev-list", "--max-parents=0", "spex");

  // The second device: its own group's clone holds the set-up commit
  // alone, an unrelated history whose environment and configuration
  // each differ from the host's.
  const second = await startHome("second-device", { host, project: false, model: "claude-test-second", extra: { signIn: "browser" } });
  t.after(() => second.stop());
  const before = ownClone(second.dataDir);
  assert.ok(git(before, "log", "--format=%s").split("\n").every((subject) => subject.startsWith("Start the spex branch on ")));
  assert.notEqual(git(before, "rev-list", "--max-parents=0", "HEAD"), hostRoot, "unrelated histories");
  for (const file of hostFiles) assert.notDeepEqual(readFileSync(join(before, file)), hosted.get(file), `the second device's own ${file}`);
  const fromSecond = second.client.mark();
  await signIn(second, host);
  const joined = await second.client.waitRepository(fromSecond, HOST_OWN, (repository) => repository.sync.phase !== "running" && repository.sync.phase !== "idle", 30_000);
  assert.equal(joined.sync.phase, "done", JSON.stringify(joined.sync));
  // No choice was asked: the join took the host's side (space-59).
  const readings = second.client.readings(fromSecond, [OWN_KEY, HOST_OWN]);
  assert.equal(readings.at(-1)?.sync.phase, "done");
  assert.deepEqual(readings.filter((repository) => repository.sync.phase === "choices").map((repository) => repository.conflicts.map((conflict) => conflict.unit.unit)), []);
  assert.ok(joined.sync.phase === "done" && joined.sync.received >= 2, JSON.stringify(joined.sync));
  const secondClone = clonePath(second.dataDir, HOST_OWN);
  for (const file of hostFiles) assert.deepEqual(readFileSync(join(secondClone, file)), hosted.get(file), `the host's ${file} on the second device`);
  const config = await second.client.expectOk("config.get", {});
  assert.ok(config.status === "valid" && config.summary.captain.model === "claude-test-host", "the configuration reloaded");
  assert.equal(git(bareOf(host, HOST_OWN), "rev-parse", "spex"), git(secondClone, "rev-parse", "spex"));

  // A third device whose own group's clone holds a session of its own:
  // every unit on both sides is one choice (space-13).
  const third = await startHome("own-session-device", { host, project: false, model: "claude-test-third", extra: { signIn: "browser" } });
  t.after(() => third.stop());
  const ownSession = await seedHistorySession(join(ownClone(third.dataDir), "sessions"), third.dataDir, turnRecords("Mine before signing in", 1));
  const seeded = new Map(hostFiles.map((file) => [file, readFileSync(join(ownClone(third.dataDir), file))]));
  const fromThird = third.client.mark();
  await signIn(third, host);
  const choices = await third.client.waitRepository(fromThird, HOST_OWN, (repository) => repository.sync.phase !== "running" && repository.sync.phase !== "idle", 30_000);
  assert.equal(choices.sync.phase, "choices", JSON.stringify(choices.sync));
  assert.deepEqual(choices.conflicts.map((conflict) => conflict.unit.unit).sort(), ["config/playbook.config.yaml", "environment"]);
  assert.ok(choices.local.some((unit) => unit.sessionId === ownSession), JSON.stringify(choices.local));
  const thirdClone = clonePath(third.dataDir, HOST_OWN);
  for (const file of hostFiles) assert.deepEqual(readFileSync(join(thirdClone, file)), seeded.get(file), `the third device's ${file} kept`);
});

test("space-59: a sign-in while a session's lease stands beneath a clone of your own group moves none of its clones, and a Refresh after the release moves them all", async (t) => {
  const host = await startHost();
  const home = await startHome("signin-leased", { host, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const { key } = await addFolder(home, home.projectDir);
  const sessionId = await runTurn(home, key, "Before the sign-in");
  // The lease stands in your own group's own clone, which moves last: no
  // other clone may move before it is read.
  const sessions = createSessionStore({ sessionsDir: join(ownClone(home.dataDir), "sessions") });
  await sessions.prepare();
  const lease = await sessions.acquireManagement(randomUUID());
  const moved = `${LOGIN}/${basename(home.projectDir)}-spex`;
  let released = false;
  try {
    const signed = await signIn(home, host);
    assert.equal(signed.account?.login, LOGIN);
    assert.ok(existsSync(ownClone(home.dataDir)), "your own group's clone stays");
    assert.ok(existsSync(join(clonePath(home.dataDir, key), "sessions", `${sessionId}.json`)), "the project's clone stays, its session with it");
    assert.ok(!existsSync(clonePath(home.dataDir, moved)));
    const file = Home.load(home.dataDir).file;
    assert.equal(file.own, OWN);
    assert.deepEqual(file.folders.map((entry) => [entry.path, entry.repository]), [[home.projectDir, key]]);
    assert.ok((await home.client.expectOk("session.list", {})).some((session) => session.id === sessionId && session.projectId === key));
    await lease.release();
    released = true;
  } finally { if (!released) await releaseLease(lease); }
  // A damaged session in the project's clone stands as a diagnostic once
  // a core reads it at its start.
  await home.stop();
  const damagedId = randomUUID();
  writeFileSync(join(clonePath(home.dataDir, key), "sessions", `${damagedId}.json`), "{ not a manifest", { mode: 0o600 });
  const damagedAt = (repositoryKey: string): string => join(clonePath(home.dataDir, repositoryKey), "sessions", `${damagedId}.json`);
  const again = await startHome("signin-leased-again", { host, dataDir: home.dataDir, project: false, extra: { signIn: "browser" } });
  t.after(() => again.stop());
  const reported = (await again.client.expectOk("space.get", {})).diagnostics;
  assert.ok(reported.some((d) => d.file === damagedAt(key)), `the damaged session is reported: ${damagedAt(key)} in ${JSON.stringify(reported)}`);
  const from = again.client.mark();
  await again.client.expectOk("space.refresh", {});
  // The first state naming the moved clone names the still-damaged
  // session's file where that clone now lies, never where it stood.
  const first = await again.client.waitSpace(from, (state) => state.groups.some((group) => group.repositories.some((repository) => repository.key === moved)), 30_000);
  assert.ok(first.diagnostics.some((d) => d.file === damagedAt(moved)), JSON.stringify(first.diagnostics));
  assert.ok(!first.diagnostics.some((d) => d.file === damagedAt(key)), JSON.stringify(first.diagnostics));
  await again.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  assert.ok(!existsSync(join(home.dataDir, "workspace", OWN)), "the former folder left with its clones");
  const file = Home.load(home.dataDir).file;
  assert.equal(file.own, LOGIN);
  assert.deepEqual(file.folders.map((entry) => [entry.path, entry.repository]), [[home.projectDir, moved]]);
  assert.ok((await again.client.expectOk("session.list", {})).some((session) => session.id === sessionId && session.projectId === moved));
});

test("space-60, space-59: a destination already standing stops the host's move and the sign-in's rename, each moving nothing until it is gone", async (t) => {
  const host = await startHost();
  const home = await startHome("taken", { host, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  // The sign-in's destination for your own group's clone, which moves
  // last, is taken: the project clone's move stands free.
  const { key: ownProject } = await addFolder(home, home.projectDir);
  const destination = clonePath(home.dataDir, HOST_OWN);
  mkdirSync(destination, { recursive: true });
  writeFileSync(join(destination, "keep.txt"), "already here\n");
  await signIn(home, host);
  assert.ok(existsSync(clonePath(home.dataDir, ownProject)) && existsSync(ownClone(home.dataDir)), "no clone moved");
  assert.deepEqual(readdirSync(destination), ["keep.txt"], "the folder standing there is untouched");
  assert.equal(Home.load(home.dataDir).file.own, OWN);
  rmSync(destination, { recursive: true, force: true });
  const fromRefresh = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  await home.client.waitRepository(fromRefresh, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  assert.equal(Home.load(home.dataDir).keyForFolder(home.projectDir), `${LOGIN}/${basename(home.projectDir)}-spex`, "a Refresh once it is gone moves them all");
  // The host renames a repository onto a folder standing here.
  const { key, id, clone } = await acmeProject(home, "occupy");
  host.script.rename(id, { name: "standing-spex" });
  const standing = clonePath(home.dataDir, "acme/standing-spex");
  mkdirSync(standing, { recursive: true });
  writeFileSync(join(standing, "keep.txt"), "already here\n");
  const stopped = await home.client.settle("space.sync", { repository: key });
  assert.ok(stopped.sync.phase === "stopped" && stopped.sync.step === "check" && /workspace\/acme\/standing-spex already exists/.test(stopped.sync.message), JSON.stringify(stopped.sync));
  assert.deepEqual(readdirSync(standing), ["keep.txt"], "the standing folder is unchanged");
  assert.equal(readFileSync(join(standing, "keep.txt"), "utf8"), "already here\n");
  assert.ok(existsSync(join(clone, ".git")), "the clone stays");
  assert.equal(Home.load(home.dataDir).file.folders.find((entry) => entry.repository === key)?.repository, key, "its pair stays");
});

test("space-60: where the filesystem folds case, a rename of the repository's name by case moves the clone, and one of its group's by case stops with nothing moved", { skip: foldsCase ? false : "the scratch filesystem tells case apart" }, async (t) => {
  const host = await startHost();
  const home = await startHome("cased", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  await signIn(home, host);
  const { key, id, folder, sessionId } = await acmeProject(home, "cased");
  // The repository's own name changes case: the clone is its destination.
  host.script.rename(id, { name: "Cased-spex" });
  const recased = "acme/Cased-spex";
  const from = home.client.mark();
  await home.client.expectOk("space.sync", { repository: key });
  const moved = await home.client.waitRepository(from, recased, (repository) => repository.sync.phase !== "running" && repository.sync.phase !== "idle");
  assert.equal(moved.sync.phase, "done", JSON.stringify(moved.sync));
  const listed = readdirSync(join(home.dataDir, "workspace", "acme"));
  assert.ok(listed.includes("Cased-spex") && !listed.includes("cased-spex"), JSON.stringify(listed));
  assert.equal(Home.load(home.dataDir).keyForFolder(folder), recased);
  assert.ok((await home.client.expectOk("project.list", {})).some((project) => project.id === recased));
  assert.ok((await home.client.expectOk("session.list", {})).some((session) => session.id === sessionId && session.projectId === recased));
  // Its group changes case: the same folder under another spelling of its
  // group is no destination, and nothing moves.
  host.script.groups.push({ id: "2009", fullPath: "Acme", name: "Acme", kind: "group" });
  host.script.rename(id, { group: "Acme" });
  const homeBytes = readFileSync(Home.file(home.dataDir));
  const projects = (await home.client.expectOk("project.list", {})).map((project) => project.id).sort();
  const stopped = await home.client.settle("space.sync", { repository: recased });
  assert.ok(stopped.sync.phase === "stopped" && stopped.sync.step === "check" && /already exists/.test(stopped.sync.message), JSON.stringify(stopped.sync));
  assert.ok(readdirSync(join(home.dataDir, "workspace")).includes("acme") && !readdirSync(join(home.dataDir, "workspace")).includes("Acme"));
  assert.deepEqual(readFileSync(Home.file(home.dataDir)), homeBytes, "home.yaml is unchanged");
  assert.deepEqual((await home.client.expectOk("project.list", {})).map((project) => project.id).sort(), projects);
  assert.ok((await home.client.expectOk("session.list", {})).some((session) => session.id === sessionId && session.projectId === recased));
});

test("space-60: where the filesystem folds case, a move whose path below workspace/ stands under another spelling stops with nothing moved, at the group and at a nested group", { skip: foldsCase ? false : "the scratch filesystem tells case apart" }, async (t) => {
  const host = await startHost();
  const home = await startHome("cased-path", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  await signIn(home, host);
  const stopsUnmoved = async (why: string, key: string, folder: string, sessionId: string, target: string): Promise<void> => {
    const homeBytes = readFileSync(Home.file(home.dataDir));
    const stopped = await home.client.settle("space.sync", { repository: key });
    assert.ok(stopped.sync.phase === "stopped" && stopped.sync.step === "check" && /already exists/.test(stopped.sync.message), `${why}: ${JSON.stringify(stopped.sync)}`);
    assert.ok(existsSync(join(clonePath(home.dataDir, key), "sessions", `${sessionId}.json`)), `${why}: the clone stays where it was`);
    const parts = target.split("/");
    assert.ok(!readdirSync(join(home.dataDir, "workspace", ...parts.slice(0, -1))).includes(parts[parts.length - 1]), `${why}: nothing lands under the on-disk spelling`);
    assert.deepEqual(readFileSync(Home.file(home.dataDir)), homeBytes, `${why}: home.yaml is unchanged`);
    assert.equal(Home.load(home.dataDir).keyForFolder(folder), key, `${why}: its pair stays`);
    assert.ok((await home.client.expectOk("session.list", {})).some((session) => session.id === sessionId && session.projectId === key), `${why}: its session stays listed there`);
  };
  // The group changes case and the repository its name: the new leaf is
  // absent, but its group folder stands as `acme`.
  const renamed = await acmeProject(home, "regrouped");
  host.script.groups.push({ id: "2009", fullPath: "Acme", name: "Acme", kind: "group" });
  host.script.rename(renamed.id, { group: "Acme", name: "elsewhere-spex" });
  await stopsUnmoved("a group recased with a new name", renamed.key, renamed.folder, renamed.sessionId, "acme/elsewhere-spex");
  // A nested group's folder stands as `acme/research`; a repository moved
  // into `acme/Research` would land there.
  const folder = gitFolder("nested");
  await addFolder(home, folder);
  const fromNested = home.client.mark();
  await home.client.expectOk("space.pick", { repository: `${LOGIN}/nested-spex`, choice: { kind: "create", groupId: "2003", name: "nested" } });
  await home.client.waitRepository(fromNested, "acme/research/nested-spex", (repository) => repository.sync.phase === "done");
  const moving = await acmeProject(home, "transferred");
  host.script.groups.push({ id: "2010", fullPath: "acme/Research", name: "Research", kind: "group" });
  host.script.rename(moving.id, { group: "acme/Research" });
  await stopsUnmoved("a nested group recased", moving.key, moving.folder, moving.sessionId, "acme/research/transferred-spex");
});

test("space-59: where the filesystem folds case, a sign-in into a group folder standing under another spelling moves none of your own group's clones", { skip: foldsCase ? false : "the scratch filesystem tells case apart" }, async (t) => {
  const host = await startHost();
  const home = await startHome("cased-own", { host, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const { key } = await addFolder(home, home.projectDir);
  const sessionId = await runTurn(home, key, "Before the sign-in");
  // An unrelated folder stands as `Ada`; the login's folder is `ada`.
  const unrelated = join(home.dataDir, "workspace", LOGIN.toUpperCase().slice(0, 1) + LOGIN.slice(1));
  mkdirSync(unrelated);
  writeFileSync(join(unrelated, "keep.txt"), "unrelated\n");
  const signed = await signIn(home, host);
  assert.equal(signed.account?.login, LOGIN);
  assert.ok(existsSync(ownClone(home.dataDir)), "your own group's clone stays");
  assert.ok(existsSync(join(clonePath(home.dataDir, key), "sessions", `${sessionId}.json`)), "the project's clone stays, its session with it");
  assert.deepEqual(readdirSync(unrelated), ["keep.txt"], "the unrelated folder is untouched");
  const file = Home.load(home.dataDir).file;
  assert.equal(file.own, OWN);
  assert.deepEqual(file.folders.map((entry) => [entry.path, entry.repository]), [[home.projectDir, key]]);
  assert.ok((await home.client.expectOk("session.list", {})).some((session) => session.id === sessionId && session.projectId === key));
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
  assert.equal(git(clonePath(b.dataDir, renamed), "remote", "get-url", "origin"), `${host.gitOrigin}/${STANDIN_STORAGE}/acme/renamed-spex.git`);
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
  // A refusal names the host's own words and Share, claims no role and
  // offers no act the host did not name (space-50).
  const words = "Your account is blocked: contact support.";
  host.script.refuseTransport(words);
  const refused = await home.client.settle("space.sync", { repository: HOST_OWN });
  assert.ok(refused.sync.phase === "stopped" && refused.sync.cause === "refused", JSON.stringify(refused.sync));
  assert.equal(refused.sync.message, `${HOST_NAME} refused: ${words}`);
  assert.equal(refused.sync.guidance, "Membership decides who may send here: use Share, or ask a member who may share it.");
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

test("space-38, git-host-14: a check the stand-in answers 429 stops throttled in the seconds it asks for, and a Retry waits them out before its step, a Stop ending that wait, while a members read meanwhile is refused at once", async (t) => {
  const host = await startHost();
  const home = await startHome("host-throttled", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const from = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done");
  const requests = host.script.requests;
  /** The stand-in's clock at the first host route a request at or after
   * `index` reached — the one its scripted 429 answers. */
  const firstHostRoute = (index: number): number => {
    const found = requests.slice(index).find((request) => request.path.startsWith("/api/v1/host/"));
    assert.ok(found, "a host route was asked");
    return found.at;
  };
  /** A check the stand-in answers 429, stopped: its message, and when
   * its 429's request reached the stand-in. */
  const throttle = async (retryAfter: string | null): Promise<{ message: string; at: number }> => {
    host.script.rateLimit(1, retryAfter);
    const index = requests.length;
    const stopped = await home.client.settle("space.fetch", { repository: HOST_OWN });
    // Its own cause, the host's time in its words, and a Retry that
    // waits (space-15): never the network.
    assert.ok(stopped.sync.phase === "stopped" && stopped.sync.step === "check" && stopped.sync.cause === "throttled" && stopped.sync.retry, JSON.stringify(stopped.sync));
    assert.equal(stopped.sync.guidance, "Retry waits, then runs the step.");
    return { message: stopped.sync.message, at: firstHostRoute(index) };
  };
  /** A Retry, read running at its Check step, then settled: how it
   * ended, and when its first request reached the stand-in. */
  const retry = async (): Promise<{ settled: RepositoryState; at: number }> => {
    const mark = home.client.mark();
    const index = requests.length;
    const settling = home.client.settle("space.fetch", { repository: HOST_OWN });
    const running = await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "running");
    assert.ok(running.sync.phase === "running" && running.sync.step === "check", JSON.stringify(running.sync));
    const settled = await settling;
    return { settled, at: requests[index]?.at ?? Number.NaN };
  };

  // The header's number: the Retry reads running and completes once the
  // 2 s are out, with no second 429 (space-15).
  const two = await throttle("2");
  assert.equal(two.message, `${HOST_NAME} asks to wait 2 seconds`);
  const waited = await retry();
  assert.equal(waited.settled.sync.phase, "idle", JSON.stringify(waited.settled.sync));
  assert.ok(waited.at - two.at >= 1_950, `the Retry reached the stand-in ${Math.round(waited.at - two.at)} ms after its 429`);

  // An HTTP date four seconds ahead: the seconds until it, read when the
  // 429 is answered, so a slow machine may have spent a second or two of
  // them by then (space-15).
  const date = Math.floor(Date.now() / 1_000) * 1_000 + 4_000;
  const dated = await throttle(new Date(date).toUTCString());
  const datedSeconds = /asks to wait (\d+) seconds$/.exec(dated.message)?.[1];
  assert.ok(datedSeconds !== undefined && Number(datedSeconds) >= 2 && Number(datedSeconds) <= 4, dated.message);
  assert.ok(dated.message.startsWith(`${HOST_NAME} asks to wait `), dated.message);

  // No time of its own: "a moment", and a Retry runs at once (space-15).
  const moment = await throttle(null);
  assert.equal(moment.message, `${HOST_NAME} asks to wait a moment`);
  const prompt = await retry();
  assert.equal(prompt.settled.sync.phase, "idle", JSON.stringify(prompt.settled.sync));
  assert.ok(prompt.at - moment.at < 3_000, `the Retry reached the stand-in ${Math.round(prompt.at - moment.at)} ms after its 429`);

  // During the hold, a members read is refused at once with the seconds
  // that remain, nothing reaching the stand-in, while a Check begun then
  // waits (git-host-21).
  const five = await throttle("5");
  const membersAt = Date.now();
  const beforeMembers = requests.length;
  await home.client.expectError("space.members", { repository: HOST_OWN }, "invalid_request", new RegExp(`^${HOST_NAME} asks to wait [1-5] seconds?$`));
  assert.ok(Date.now() - membersAt < 3_000, "the members read is refused at once");
  assert.equal(requests.length, beforeMembers, "the refused members read sent nothing");

  // A Stop while the Retry waits ends that wait at once, nothing sent,
  // and the next Retry waits out what remains (space-16, space-15).
  const mark = home.client.mark();
  const index = requests.length;
  const asked = Date.now();
  assert.deepEqual(await home.client.expectOk("space.fetch", { repository: HOST_OWN }), { accepted: true });
  await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "running" && repository.sync.step === "check" && repository.sync.cancelable);
  // A broadcast of the earlier stop may still arrive: the Stop's own
  // ending is the one read after the step ran.
  const stopMark = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.cancel", { repository: HOST_OWN }), { stopped: true });
  const ended = await home.client.waitRepository(stopMark, HOST_OWN, (repository) => repository.sync.phase === "stopped" && repository.sync.cause !== "throttled");
  assert.ok(ended.sync.phase === "stopped" && ended.sync.step === "check" && ended.sync.cause === "stopped" && ended.sync.retry, JSON.stringify(ended.sync));
  assert.equal(ended.sync.message, `Stopped while waiting for ${HOST_NAME}`);
  assert.equal(ended.sync.guidance, "Retry waits, then runs the step.");
  assert.ok(Date.now() - asked < 3_000, "the Stop ends the wait");
  assert.equal(requests.length, index, "nothing reached the stand-in while it asked to wait");
  const rest = await retry();
  assert.equal(rest.settled.sync.phase, "idle", JSON.stringify(rest.settled.sync));
  assert.ok(rest.at - five.at >= 4_950, `the next Retry reached the stand-in ${Math.round(rest.at - five.at)} ms after its 429`);
});

test("git-host-11: a read the stand-in refuses keeps the previous view and its time, phrased in English and in Chinese", async (t) => {
  const host = await startHost();
  // The stand-in's 30 seconds hold the next read 1 s at most here, a
  // test-shortened bound (git-host-21).
  const home = await startHome("host-relay", { host, project: false, extra: { signIn: "browser", hostHoldMaxMs: 1_000 } });
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
  // A rate limit reads as the host asking to wait, in seconds, never as
  // a network failure (git-host-11).
  host.script.rateLimit(1, "30");
  await refresh(`${HOST_NAME} asks to wait 30 seconds`);
  await home.client.expectOk("language.set", { language: "zh" });
  host.script.refuseHost(1, words);
  await refresh(`${HOST_NAME} 拒绝了：${words}`);
  host.script.rateLimit(1, "30");
  await refresh(`${HOST_NAME} 要求等待 30 秒`);
  host.script.unavailable(1);
  await refresh(`无法连接 ${HOST_NAME}`);
  // A read that succeeds again ends the failure.
  const mark = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  const back = await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.state === "reachable");
  assert.equal(back.reason, null);
});

// ---------------------------------------------------------------------------
// Groups and sharing (DR-114): git-host-5, git-host-8, git-host-15..17
// ---------------------------------------------------------------------------

/** The stand-in's API requests at or after `from`: none where a command
 * was refused before the host was asked. */
function apiRequests(host: StandinHost, from: number): string[] {
  return host.script.requests.slice(from).filter((request) => request.path.startsWith("/api/")).map((request) => `${request.method} ${request.path}`);
}

/** The stand-in's groups listings at or after `from`: one per read of
 * it begun (git-host-5). */
function groupsReads(host: StandinHost, from: number): number {
  return host.script.requests.slice(from).filter((request) => request.method === "GET" && request.path === "/api/v1/host/groups").length;
}

/** Refresh until a read is held after `readAt`, and return the state it
 * announced: a Refresh while the last one's set-up still runs joins
 * that set-up, whose read may already be held. */
async function refreshRead(home: Awaited<ReturnType<typeof startHome>>, readAt: number | null): Promise<GroupsState> {
  for (let attempt = 1; ; attempt += 1) {
    const from = home.client.mark();
    assert.deepEqual(await home.client.expectOk("space.refresh", {}), { accepted: true });
    try {
      return await home.client.waitSpace(from, (state) => state.readAt !== readAt, 5_000);
    } catch (error) {
      if (attempt >= 5) throw error;
    }
  }
}

/** The full paths of a state's groups of the host, in its order. */
const groupPaths = (state: GroupsState): string[] => state.groups.filter((group) => !group.own).map((group) => group.fullPath);

/** Create a group and return the reply with the state broadcast before
 * it, which lists the group as the core holds it (git-host-15). */
async function createGroupHeld(home: Awaited<ReturnType<typeof startHome>>, fields: { name: string; path: string; parent: string | null }): Promise<{ group: { id: string; fullPath: string; name: string }; announced: GroupsState }> {
  const from = home.client.mark();
  const reply = await home.client.expectOk("space.group.create", fields);
  const since = home.client.messages.slice(from);
  const at = since.findIndex((message) => message.type === "reply" && message.ok && (message.result as { group?: { id?: string } }).group?.id === reply.group.id);
  assert.ok(at >= 0, "the reply arrived");
  const announced = since.slice(0, at).find((message) => message.type === "space.state" && message.state.groups.some((group) => group.id === reply.group.id));
  assert.ok(announced?.type === "space.state", `a state broadcast before the reply lists ${reply.group.fullPath}`);
  return { group: reply.group, announced: announced.state };
}

test("git-host-5, git-host-15: the read holds the stand-in's roles and what it lets the person do; groups created at the top and in a listed group stand at once, before any read, until a read lists them", async (t) => {
  const host = await startHost();
  const research = host.script.groups.find((group) => group.fullPath === "acme/research");
  assert.ok(research);
  research.can = { createSubgroup: false, manageMembers: false, rename: false, delete: false };
  host.script.addRepository({ group: "acme", name: "a-spex", role: "Maintainer" });
  host.script.addRepository({ group: "acme", name: "b-spex", role: "Developer" });
  const home = await startHome("groups-create", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  // Signed out: nothing is held of the host, and nothing is asked of it.
  const before = await home.client.expectOk("space.get", {});
  assert.deepEqual(before.roles, []);
  await home.client.expectError("space.group.create", { name: "Lumen Labs", path: "lumen-labs", parent: null }, "invalid_request", /^Sign in first$/);
  const from = home.client.mark();
  const signed = await signIn(home, host);
  await home.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done");
  // The read holds the stand-in's roles in its order and what it lets the
  // person do: create a group; in acme a subgroup and its members; in
  // research neither; a-spex's members, not b-spex's (git-host-5).
  assert.deepEqual(signed.roles, [
    { id: "reporter", name: "Reporter", mayPush: false },
    { id: "developer", name: "Developer", mayPush: true },
    { id: "maintainer", name: "Maintainer", mayPush: true },
    { id: "owner", name: "Owner", mayPush: true },
  ]);
  assert.equal(signed.account?.canCreateGroup, true);
  assert.deepEqual(signed.groups.map((group) => [group.fullPath, group.own, group.can]), [
    [LOGIN, true, { createSubgroup: false, manageMembers: false, rename: false, delete: false }],
    ["acme", false, { createSubgroup: true, manageMembers: true, rename: true, delete: true }],
    ["acme/research", false, { createSubgroup: false, manageMembers: false, rename: false, delete: false }],
  ]);
  assert.deepEqual(repositoryOf(signed, "acme/a-spex").can, { manageMembers: true, transfer: false });
  assert.deepEqual(repositoryOf(signed, "acme/b-spex").can, { manageMembers: false, transfer: false });
  assert.deepEqual((await home.client.repository(HOST_OWN)).can, { manageMembers: true, transfer: true });

  // A group at the top and one in acme, each named as typed at the path
  // given, replied with its full path (git-host-15), and standing — in a
  // state broadcast before the reply and in the next space.get, after its
  // parent, with what the stand-in says the person may do there — with
  // no read of the stand-in begun (git-host-5).
  const unread = host.script.requests.length;
  const top = await createGroupHeld(home, { name: "Lumen Labs", path: "lumen-labs", parent: null });
  assert.deepEqual([top.group.fullPath, top.group.name], ["lumen-labs", "Lumen Labs"]);
  assert.deepEqual(top.announced.groups.find((group) => group.id === top.group.id)?.can, { createSubgroup: true, manageMembers: true, rename: true, delete: true });
  const named = await createGroupHeld(home, { name: "华芯智造", path: "huaxin-mfg", parent: null });
  assert.deepEqual([named.group.fullPath, named.group.name], ["huaxin-mfg", "华芯智造"]);
  const sub = await createGroupHeld(home, { name: "Team One", path: "team-one", parent: "2002" });
  assert.deepEqual([sub.group.fullPath, sub.group.name], ["acme/team-one", "Team One"]);
  assert.ok(host.script.groups.some((group) => group.id === sub.group.id), "the stand-in holds it");
  const held = await home.client.expectOk("space.get", {});
  assert.deepEqual(groupPaths(held), ["acme", "acme/research", "acme/team-one", "huaxin-mfg", "lumen-labs"]);
  assert.deepEqual(held.groups.find((group) => group.id === sub.group.id)?.can, { createSubgroup: true, manageMembers: true, rename: true, delete: true });
  // A held group is taken as a parent, and its members are read, before
  // any read (git-host-15, git-host-5).
  const nested = await createGroupHeld(home, { name: "Studio", path: "studio", parent: top.group.id });
  assert.equal(nested.group.fullPath, "lumen-labs/studio");
  assert.deepEqual(groupPaths(nested.announced).slice(-2), ["lumen-labs", "lumen-labs/studio"]);
  const topMembers = await home.client.expectOk("space.members", { group: top.group.id });
  assert.deepEqual(topMembers.members.map((member) => [member.login, member.role, member.direct]), [[LOGIN, "Owner", true]]);
  assert.equal(groupsReads(host, unread), 0, "no read of the stand-in begun");

  // A taken name is refused saying so there, the stand-in's refusal in
  // its words; the host is asked whatever the view said, research's
  // refusal its own (git-host-15, git-host-11).
  const taken = await home.client.expectError("space.group.create", { name: "Lumen Labs", path: "lumen-labs", parent: null }, "invalid_request");
  assert.equal(taken, `Lumen Labs is taken at ${HOST_NAME}; choose another name`);
  const takenSub = await home.client.expectError("space.group.create", { name: "team one", path: "team-one", parent: "2002" }, "invalid_request");
  assert.equal(takenSub, "team one is taken in acme; choose another name");
  host.script.refuseGroupCreate("You need the Owner role in acme to create subgroups.");
  const refused = await home.client.expectError("space.group.create", { name: "Other", path: "other", parent: "2002" }, "invalid_request");
  assert.equal(refused, `${HOST_NAME} refused: You need the Owner role in acme to create subgroups.`);
  host.script.refuseGroupCreate(null);
  const asked = host.script.requests.length;
  const notAllowed = await home.client.expectError("space.group.create", { name: "Lab", path: "lab", parent: "2003" }, "invalid_request");
  assert.equal(notAllowed, `${HOST_NAME} refused: You are not allowed to create subgroups in acme/research.`);
  assert.deepEqual(apiRequests(host, asked), ["POST /api/v1/host/groups"]);

  // A blank name, a blank path and a parent the view does not list are
  // refused before any request reaches the stand-in.
  const quiet = host.script.requests.length;
  await home.client.expectError("space.group.create", { name: "   ", path: "lab", parent: null }, "invalid_request", /^Name the group$/);
  await home.client.expectError("space.group.create", { name: "华芯智造", path: "   ", parent: null }, "invalid_request", /^Give the group a path$/);
  await home.client.expectError("space.group.create", { name: "Lab", path: "lab", parent: "9999" }, "not_found", new RegExp(`^${HOST_NAME} listed no group 9999$`));
  assert.deepEqual(apiRequests(host, quiet), []);

  // What the person may do is the host's last read's; that read, begun
  // after the creations and listing them, keeps every created group
  // (git-host-5).
  host.script.canCreateGroup = false;
  const fromRefresh = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  const reread = await home.client.waitSpace(fromRefresh, (state) => state.account?.canCreateGroup === false);
  assert.ok(groupsReads(host, unread) > 0, "the Refresh read the stand-in");
  assert.deepEqual(groupPaths(reread), ["acme", "acme/research", "acme/team-one", "huaxin-mfg", "lumen-labs", "lumen-labs/studio"]);
});

test("git-host-5, git-host-15: a group created while the stand-in's listing lags stands until a read begun after it drops it; a read begun before it is made again", async (t) => {
  const host = await startHost();
  const home = await startHome("groups-lag", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const from = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done");

  // A read begins and takes the groups listing before a creation, its
  // repositories listing sleeping, and answers after it without the
  // group: it is made again before it is held, and no state from the
  // creation to that read's end lacks the group (git-host-5).
  const signedRead = (await home.client.expectOk("space.get", {})).readAt;
  assert.ok(signedRead !== null);
  host.script.sleepListing(1_500);
  t.after(() => host.script.sleepListing(0));
  const asked = host.script.requests.length;
  const fromEarly = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.refresh", {}), { accepted: true });
  for (let i = 0; i < 400 && groupsReads(host, asked) === 0; i += 1) await sleep(10);
  assert.equal(groupsReads(host, asked), 1, "the read took the groups listing");
  const early = await createGroupHeld(home, { name: "Early", path: "early", parent: "2002" });
  assert.equal(early.group.fullPath, "acme/early");
  const afterEarly = await home.client.waitSpace(fromEarly, (state) => state.readAt !== signedRead, 30_000);
  assert.equal(groupsReads(host, asked), 2, "the read begun before the creation was made again");
  assert.ok(groupPaths(afterEarly).includes("acme/early"));
  const creation = home.client.messages.slice(fromEarly).findIndex((message) => message.type === "space.state" && message.state.groups.some((group) => group.id === early.group.id));
  const lacking = home.client.messages.slice(fromEarly).slice(creation)
    .filter((message) => message.type === "space.state" && !message.state.groups.some((group) => group.id === early.group.id));
  assert.equal(lacking.length, 0, "no state from the creation on lacks the group");
  host.script.sleepListing(0);

  // While the stand-in's listing lags behind its creation, a group
  // created at the top stands at once, with no read begun (git-host-15).
  host.script.lagGroupListing(true);
  t.after(() => host.script.lagGroupListing(false));
  const unread = host.script.requests.length;
  const late = await createGroupHeld(home, { name: "Late", path: "late", parent: null });
  const held = await home.client.expectOk("space.get", {});
  assert.deepEqual(groupPaths(held), ["acme", "acme/early", "acme/research", "late"]);
  assert.equal(groupsReads(host, unread), 0, "no read of the stand-in begun");

  // A Refresh whose read the stand-in answers without it drops it
  // (git-host-5).
  const dropped = await refreshRead(home, held.readAt);
  assert.ok(groupsReads(host, unread) > 0, "the Refresh read the stand-in");
  assert.deepEqual(groupPaths(dropped), ["acme", "acme/early", "acme/research"]);
  assert.equal(dropped.groups.some((group) => group.id === late.group.id), false);

  // Its listing caught up, the next read lists it again.
  host.script.lagGroupListing(false);
  const found = await refreshRead(home, dropped.readAt);
  assert.deepEqual(groupPaths(found), ["acme", "acme/early", "acme/research", "late"]);
});

test("git-host-8, git-host-16, git-host-17: a group's members with their source; members added and removed in groups and spex repositories, the stand-in's members replied; its refusals in its words, in English and in Chinese", async (t) => {
  const host = await startHost();
  const research = host.script.groups.find((group) => group.fullPath === "acme/research");
  assert.ok(research);
  research.members = [{ id: "1003", login: "grace", displayName: "Grace Hopper", role: "Developer" }];
  host.script.addRepository({ group: "acme", name: "team-spex", members: [{ id: "1002", login: "bob", displayName: "Bob", role: "Developer" }] });
  host.script.addRepository({ group: "acme", name: "b-spex", role: "Developer" });
  const home = await startHome("sharing", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  await home.client.expectError("space.share", { group: "2002", login: "grace", role: "developer" }, "invalid_request", /^Sign in first$/);
  const from = home.client.mark();
  const signed = await signIn(home, host);
  await home.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done");

  // A group's members, each with its source (git-host-8).
  const group = await home.client.expectOk("space.members", { group: "2003" });
  assert.deepEqual(group.members.map((m) => [m.login, m.role, m.direct, m.via]), [["grace", "Developer", true, null], [LOGIN, "Owner", false, "acme"]]);

  // Added by login at a role's id: to a group, to a spex repository this
  // device lacks, and to your own group's clone, each reply the
  // stand-in's members afterwards (git-host-16).
  const toGroup = await home.client.expectOk("space.share", { group: "2002", login: "alan", role: "maintainer" });
  assert.deepEqual(toGroup.members.map((m) => [m.login, m.role, m.direct]), [[LOGIN, "Owner", true], ["alan", "Maintainer", true]]);
  const toRepository = await home.client.expectOk("space.share", { repository: "acme/team-spex", login: "grace", role: "developer" });
  assert.deepEqual(toRepository.members.map((m) => [m.login, m.role, m.direct, m.via]), [
    [LOGIN, "Owner", true, null], ["bob", "Developer", true, null], ["grace", "Developer", true, null], ["alan", "Maintainer", false, "acme"],
  ]);
  const toOwn = await home.client.expectOk("space.share", { repository: HOST_OWN, login: "bob", role: "reporter" });
  assert.deepEqual(toOwn.members.map((m) => [m.login, m.role]), [[LOGIN, "Owner"], ["bob", "Reporter"]]);

  // An unknown login is not_found in the stand-in's words naming it; an
  // existing member and a refusal are refused in its words; the host is
  // asked whatever the view said, b-spex's refusal its own.
  const unknown = await home.client.expectError("space.share", { group: "2002", login: "zed", role: "developer" }, "not_found");
  assert.equal(unknown, `Not found at ${HOST_NAME}: No account is named zed.`);
  const existing = await home.client.expectError("space.share", { repository: "acme/team-spex", login: "bob", role: "maintainer" }, "invalid_request");
  assert.equal(existing, `${HOST_NAME} refused: Member already exists`);
  host.script.refuseMembers("You need the Owner role to add members.");
  const refusedAdd = await home.client.expectError("space.share", { group: "2003", login: "bob", role: "developer" }, "invalid_request");
  assert.equal(refusedAdd, `${HOST_NAME} refused: You need the Owner role to add members.`);
  host.script.refuseMembers(null);
  assert.deepEqual(repositoryOf(signed, "acme/b-spex").can, { manageMembers: false, transfer: false });
  const notAllowed = await home.client.expectError("space.share", { repository: "acme/b-spex", login: "bob", role: "developer" }, "invalid_request");
  assert.equal(notAllowed, `${HOST_NAME} refused: You are not allowed to manage the members of acme/b-spex.`);

  // Removed from a group's and a spex repository's own members, each
  // reply the stand-in's members afterwards; a membership through
  // another group is not found there, a refusal in its words
  // (git-host-17).
  const fromGroup = await home.client.expectOk("space.unshare", { group: "2003", login: "grace" });
  assert.deepEqual(fromGroup.members.map((m) => [m.login, m.direct, m.via]), [[LOGIN, false, "acme"], ["alan", false, "acme"]]);
  const fromRepository = await home.client.expectOk("space.unshare", { repository: "acme/team-spex", login: "bob" });
  assert.deepEqual(fromRepository.members.map((m) => m.login), [LOGIN, "grace", "alan"]);
  const inherited = await home.client.expectError("space.unshare", { group: "2003", login: "alan" }, "not_found");
  assert.equal(inherited, `Not found at ${HOST_NAME}: alan is not a direct member of acme/research.`);
  host.script.refuseMembers("The group keeps its last owner.");
  const refusedRemove = await home.client.expectError("space.unshare", { group: "2002", login: LOGIN }, "invalid_request");
  assert.equal(refusedRemove, `${HOST_NAME} refused: The group keeps its last owner.`);
  host.script.refuseMembers(null);

  // A role the view does not hold, a blank login, neither or both
  // targets, and a group or repository the view does not list are
  // refused before any request reaches the stand-in.
  const quiet = host.script.requests.length;
  await home.client.expectError("space.share", { group: "2002", login: "bob", role: "admin" }, "invalid_request", new RegExp(`^admin is not one of the roles ${HOST_NAME} grants$`));
  await home.client.expectError("space.share", { group: "2002", login: "  ", role: "developer" }, "invalid_request", new RegExp(`^Name the account's login at ${HOST_NAME}$`));
  await home.client.expectError("space.share", { login: "bob", role: "developer" }, "invalid_request", /^Name one group or one spex repository$/);
  await home.client.expectError("space.share", { group: "2002", repository: "acme/team-spex", login: "bob", role: "developer" }, "invalid_request", /^Name one group or one spex repository$/);
  await home.client.expectError("space.share", { group: "9999", login: "bob", role: "developer" }, "not_found", new RegExp(`^${HOST_NAME} listed no group 9999$`));
  await home.client.expectError("space.share", { repository: "acme/nowhere-spex", login: "bob", role: "developer" }, "not_found");
  await home.client.expectError("space.unshare", { group: "2002", login: " " }, "invalid_request", /^Name the account's login/);
  await home.client.expectError("space.unshare", { group: "9999", login: "bob" }, "not_found");
  await home.client.expectError("space.unshare", { login: "bob" }, "invalid_request", /^Name one group or one spex repository$/);
  await home.client.expectError("space.members", { group: "9999" }, "not_found");
  await home.client.expectError("space.members", {}, "invalid_request", /^Name one group or one spex repository$/);
  assert.deepEqual(apiRequests(host, quiet), []);

  // In Chinese, the stand-in's words kept whole (git-host-11).
  await home.client.expectOk("language.set", { language: "zh" });
  const zhUnknown = await home.client.expectError("space.share", { group: "2002", login: "zed", role: "developer" }, "not_found");
  assert.equal(zhUnknown, `在 ${HOST_NAME} 上未找到：No account is named zed.`);
  const zhExisting = await home.client.expectError("space.share", { group: "2002", login: "alan", role: "developer" }, "invalid_request");
  assert.equal(zhExisting, `${HOST_NAME} 拒绝了：Member already exists`);
  const zhTaken = await home.client.expectError("space.group.create", { name: "Acme", path: "acme", parent: null }, "invalid_request");
  assert.equal(zhTaken, `Acme 在 ${HOST_NAME} 上已被占用；请另选一个名称`);
});
