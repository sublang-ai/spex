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
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, join } from "node:path";
import { Home } from "./home.js";
import { clonePath, createSpaceHarness, OWN, OWN_KEY, ownClone, prefsOf, repositoryOf } from "./testing/space-harness.js";
import type { StandinHost } from "./testing/standin-host.js";
import type { GroupsState, RepositoryState } from "./protocol.js";

const fixture = createSpaceHarness();
const { scratch, git, gitFolder, addFolder, sleep, startHome, startHost, signIn, runTurn } = fixture;
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

test("space-37: a login spelled with a capital or a dot names your own group's folder, its clones and every pair as the host spells it", async (t) => {
  const errors = t.mock.method(console, "error");
  for (const login of ["Ada", "ada.dev"]) {
    const host = await startHost();
    host.script.person.login = login;
    host.script.groups[0].fullPath = login;
    host.script.groups[0].name = login;
    const home = await startHome("signin-spelled", { host, extra: { signIn: "browser" } });
    t.after(() => home.stop());
    await addFolder(home, home.projectDir);
    const from = home.client.mark();
    const signed = await signIn(home, host);
    assert.equal(signed.account?.login, login);
    // The folder, every clone in it and every pair bear the login as
    // the host spells it (space-59, storage-2).
    const ownKey = `${login}/${login}-spex`;
    const moved = `${login}/${basename(home.projectDir)}-spex`;
    assert.equal(repositoryOf(signed, moved).folder, home.projectDir);
    assert.ok(existsSync(join(clonePath(home.dataDir, moved), ".git")), moved);
    assert.ok(!existsSync(join(home.dataDir, "workspace", OWN)), "the former folder left with its clones");
    const file = Home.load(home.dataDir).file;
    assert.equal(file.own, login);
    assert.deepEqual(file.folders.map((folder) => [folder.path, folder.repository]), [[home.projectDir, moved]]);
    // Your own group's spex repository stands on the stand-in as
    // `<login>-spex`, pushed (space-4, space-65).
    const own = await home.client.waitRepository(from, ownKey, (repository) => repository.sync.phase === "done");
    assert.equal(own.state, "reachable");
    assert.equal(git(bareOf(host, ownKey), "rev-parse", "spex"), git(clonePath(home.dataDir, ownKey), "rev-parse", "spex"));
    // Nothing of the set-up failed, and a restart reads the same project.
    assert.deepEqual(errors.mock.calls.map((call) => String(call.arguments[0])).filter((line) => /failed/.test(line)), []);
    await home.stop();
    const again = await startHome("signin-spelled-again", { dataDir: home.dataDir, project: false });
    t.after(() => again.stop());
    assert.deepEqual((await again.client.expectOk("project.list", {})).map((project) => [project.id, project.path]), [[moved, home.projectDir]]);
    await again.stop();
  }
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

/** A `git` on the core's PATH that holds one clone's `rev-parse
 * --git-dir` — the read a Groups state makes of it — while the test
 * holds it, then runs the real Git: a read caught in flight. */
function holdingGit(clone: string): { path: string; hold(): void; held(): Promise<void>; release(): void } {
  const dir = mkdtempSync(join(scratch, "holding-git-"));
  const real = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
  const hold = join(dir, "hold");
  const held = join(dir, "held");
  writeFileSync(join(dir, "git"), [
    "#!/bin/sh",
    'case " $* " in',
    `  *" ${clone} rev-parse --git-dir "*)`,
    `    if [ -e "${hold}" ]; then : > "${held}"; while [ -e "${hold}" ]; do sleep 0.05; done; fi ;;`,
    "esac",
    `exec "${real}" "$@"`,
    "",
  ].join("\n"));
  chmodSync(join(dir, "git"), 0o755);
  return {
    path: `${dir}:${process.env.PATH ?? ""}`,
    hold: () => writeFileSync(hold, ""),
    held: async () => {
      for (let i = 0; i < 400 && !existsSync(held); i += 1) await sleep(25);
      assert.ok(existsSync(held), "the read reached Git");
    },
    release: () => rmSync(hold, { force: true }),
  };
}

test("space-59: a sign-in while a read of your own group is in flight moves the folder once the read ends, then pushes it", async (t) => {
  const host = await startHost();
  const dataDir = mkdtempSync(join(scratch, "signin-reading-"));
  const shim = holdingGit(ownClone(dataDir));
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

  // The account arrives meanwhile; the set-up's rename waits for the
  // read, the gate held for every clone beneath (space-59, space-21).
  const from = home.client.mark();
  const started = await home.client.expectOk("space.signin.start", {});
  assert.ok(started.flow === "device", JSON.stringify(started));
  host.script.approveDevice(started.userCode);
  for (let i = 0; i < 400 && Home.load(dataDir).file.host.account === undefined; i += 1) await sleep(25);
  assert.equal(Home.load(dataDir).file.host.account?.login, LOGIN);
  await sleep(400);
  assert.ok(existsSync(ownClone(dataDir)), "the folder stays while the read is in flight");
  const refused = await home.client.command("intent.queue", { projectId: key, text: "written mid-move" });
  assert.ok(!refused.ok && refused.error.code === "busy", JSON.stringify(refused));

  // The read ends where the clone lay; the folder then moves, and your
  // own group's spex repository is created and pushed.
  shim.release();
  const read = await reading;
  assert.ok(read.ok, JSON.stringify(read));
  assert.ok(read.result.groups.some((group) => group.repositories.some((repository) => repository.key === OWN_KEY)));
  const signed = await home.client.waitSpace(from, (state) => state.account !== null && state.signIn.phase === "idle", 30_000);
  assert.equal(signed.account?.login, LOGIN);
  assert.ok(!existsSync(join(dataDir, "workspace", OWN)), "the former folder left with its clones");
  assert.equal(repositoryOf(signed, `${LOGIN}/${basename(home.projectDir)}-spex`).folder, home.projectDir);
  const own = await home.client.waitRepository(from, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  assert.equal(own.state, "reachable");
  assert.equal(git(bareOf(host, HOST_OWN), "rev-parse", "spex"), git(clonePath(dataDir, HOST_OWN), "rev-parse", "spex"));
  // A read after the move finds every clone where it lies.
  const after = await home.client.expectOk("space.get", {});
  assert.deepEqual(after.groups.flatMap((group) => group.repositories.map((repository) => repository.key)).filter((repoKey) => repoKey.startsWith(`${OWN}/`)), []);
});

test("space-37: Pick a group creates <name>-spex there and pushes, a group other than your own once the notice is seen; a taken name is refused; a refused creation waits until a Refresh finds it", async (t) => {
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
  // A creation in a group other than your own waits for the notice, its
  // members unknown until it exists: nothing is created or pushed
  // (space-57).
  const asked = host.script.requests.length;
  const unseen = await home.client.command("space.pick", { repository: local, choice: { kind: "create", groupId: "2002", name: "alpha" } });
  assert.ok(!unseen.ok, "the creation waits for the notice");
  assert.equal(unseen.error.code, "invalid_request");
  assert.match(unseen.error.message, /sharing notice before creating alpha-spex in acme/);
  assert.deepEqual(unseen.error.details, { notice: true, members: null, visibility: null });
  assert.ok(!host.script.repositories.some((repository) => repository.path === "alpha-spex"), "nothing is created");
  assert.ok(!host.script.requests.slice(asked).some((request) => request.path.includes("alpha-spex")), "nothing is pushed");
  const held = await home.client.repository(local);
  assert.deepEqual([held.state, held.noticed], ["local-only", false]);
  // A group picked with the notice seen: `<name>-spex` created there, the
  // clone following it under `workspace/acme/`, its `spex` pushed and the
  // notice recorded (space-57, space-58, space-60).
  const from = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", groupId: "2002", name: "alpha" }, noticed: true }), { accepted: true });
  const created = await home.client.waitRepository(from, "acme/alpha-spex", (repository) => repository.sync.phase === "done");
  assert.equal(created.noticed, true);
  assert.equal(prefsOf(home.dataDir)["sync:acme/alpha-spex:noticed"], true);
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
  await home.client.expectError("space.pick", { repository: beta.key, choice: { kind: "create", groupId: "2002", name: "beta" }, noticed: true }, "invalid_request", /beta-spex is taken in acme/);
  await home.client.expectError("space.pick", { repository: beta.key, choice: { kind: "create", groupId: "2002", name: "--" } }, "invalid_request", /letter or a digit/);
  assert.equal((await home.client.repository(beta.key)).state, "local-only");
  // A creation in your own group says nothing (space-57).
  const omega = await addFolder(home, gitFolder("omega"));
  const fromOmega = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.pick", { repository: omega.key, choice: { kind: "create", groupId: "2001", name: "omega" } }), { accepted: true });
  const ownCreated = await home.client.waitRepository(fromOmega, `${LOGIN}/omega-spex`, (repository) => repository.sync.phase === "done");
  assert.equal(ownCreated.state, "reachable");
  assert.equal(ownCreated.noticed, false);
  assert.equal(git(bareOf(host, `${LOGIN}/omega-spex`), "rev-parse", "spex"), git(clonePath(home.dataDir, `${LOGIN}/omega-spex`), "rev-parse", "spex"));
  // A creation the host leaves waiting stands on the row with its words,
  // and the next read after it grants finds it done (space-64).
  const words = "You need the Maintainer role in Research to create projects.";
  host.script.refuseCreate(words);
  const gamma = await addFolder(home, gitFolder("gamma"));
  const fromGamma = home.client.mark();
  await home.client.expectOk("space.pick", { repository: gamma.key, choice: { kind: "create", groupId: "2003", name: "gamma" }, noticed: true });
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
  assert.deepEqual(await home.client.expectOk("space.pick", { repository: key, choice: { kind: "create", groupId: "2002", name: "delta" }, noticed: true }), { accepted: true });
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

test("space-37: while a check sleeps on the stand-in's transport, writes beneath that clone are refused naming the sync, another's admitted, and Stop ends it", async (t) => {
  const host = await startHost();
  const home = await startHome("host-gate", { host, project: false, extra: { signIn: "browser", spaceTransportTimeoutMs: 60_000 } });
  t.after(() => home.stop());
  const elsewhere = gitFolder("elsewhere");
  await addFolder(home, elsewhere);
  const gated = gitFolder("gated");
  await addFolder(home, gated);
  await signIn(home, host);
  const from = home.client.mark();
  await home.client.expectOk("space.pick", { repository: `${LOGIN}/gated-spex`, choice: { kind: "create", groupId: "2002", name: "gated" }, noticed: true });
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
  const blocked = await home.client.command("intent.queue", { projectId: key, text: "blocked" });
  assert.ok(!blocked.ok && blocked.error.code === "busy" && /gated-spex is syncing/.test(blocked.error.message), JSON.stringify(blocked));
  await home.client.expectError("space.sync", { repository: key }, "busy", /Already syncing/);
  await home.client.expectOk("intent.queue", { projectId: `${LOGIN}/elsewhere-spex`, text: "elsewhere" });
  assert.deepEqual(await home.client.expectOk("space.cancel", { repository: key }), { stopped: true });
  const stopped = await home.client.waitRepository(fromSync, key, (repository) => repository.sync.phase === "stopped");
  assert.ok(stopped.sync.phase === "stopped" && stopped.sync.step === "check" && stopped.sync.cause === "stopped", JSON.stringify(stopped.sync));
  assert.notEqual(git(clone, "rev-parse", "HEAD"), head, "the Save commit stands");
  await home.client.expectOk("intent.queue", { projectId: key, text: "after the stop" });
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
  await a.client.expectOk("space.pick", { repository: local.key, choice: { kind: "create", groupId: "2002", name: "shared" }, noticed: true });
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
