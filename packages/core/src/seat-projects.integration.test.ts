// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A seat's projects (space-103, space-104, projects-37, git-host-9,
// DR-132), against the stand-in instance and a Git HTTP host that is no
// instance: a join, or a pick, allocates the project's folder under the
// seat's `projects/` tree at the repository's own path, no project's
// folder inside another's, and clones the code there with the member's
// own token through the app's helper; a clone failing for want of a
// credential leaves the records readable, naming the host, one whose
// token will not read says so, and an ssh remote's failure shows as it
// is; a join again after `credential.set` clones into the same folder,
// and a folder allocated before is reused. The seat account's own Git
// configuration names the app's helper in its member mode, so a push an
// agent makes from the work tree outside the app carries the member's
// token to its host and none to any other (core-service-125); a store
// that will not read is refused by its path alone, its token reaching
// no output of the helper's or the core's (storage-44).

import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { codeCredentialsPath } from "./code-credentials.js";
import { GIT_CREDENTIAL_FILE_ENV, gitCredentialHelperPath } from "./git-credential.js";
import { Home } from "./home.js";
import { seatGitConfigPath } from "./seat-git.js";
import { SpaceGit, type GitRunOptions } from "./space-git.js";
import { startGitHttpHost, type GitHttpHost } from "./testing/git-http-host.js";
import { createSpaceHarness, hostFolder, hostKey, repositoryOf, stringsOf, OWN } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
const { scratch, git, gitFolder, startHome, startHost, signIn, runTurn } = fixture;
test.after(() => fixture.dispose());

const SEAT = { serverId: "srv_7f3a", serverName: "lab-1", personId: "1001" };
const USERNAME = "ada";
const TOKEN = "glpat-member-own-token-5e1f";

/** A code host that is no instance: Git's smart-HTTP backend serving one
 * repository of one commit to the member's username with their token. */
async function codeHost(t: TestContext): Promise<{ url: string; root: string; remote: string; host: string; bare: string; head: string; server: GitHttpHost }> {
  const root = mkdtempSync(join(scratch, "code-host-"));
  const work = gitFolder("code-work");
  writeFileSync(join(work, "README.md"), "the project's code\n");
  git(work, "add", "README.md");
  git(work, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "code");
  const bare = join(root, "code.git");
  git(root, "clone", "-q", "--bare", work, bare);
  const server = await startGitHttpHost({ root, username: USERNAME, password: TOKEN });
  t.after(() => server.close());
  return { url: server.url, root, remote: `${server.url}/code.git`, host: new URL(server.url).host, bare, head: git(bare, "rev-parse", "HEAD"), server };
}

/** The credential handed to a Git child, observed without replacing its
 * transport or helper: its bytes never leave its file. */
function inspectCredential(options: GitRunOptions): { file: string; mode: number; args: string[] } {
  const file = options.credential?.env[GIT_CREDENTIAL_FILE_ENV] ?? "";
  return { file, mode: file ? statSync(file).mode & 0o777 : 0, args: options.credential?.configArgs ?? [] };
}

/** The folder the core allocates on a seat for a spex repository at a
 * stand-in instance (space-103): `projects/@<host>/<group path>/
 * <repository>/`, `<repository>` its own path name with its `-spex`
 * kept. */
function allocated(dataDir: string, host: { url: string }, group: string, repository: string): string {
  return join(dataDir, "projects", hostFolder(host), ...group.split("/"), repository);
}

/** Every line the core logs from here on, each still printed. */
function captureConsole(t: TestContext): string[] {
  const logged: string[] = [];
  for (const name of ["log", "info", "warn", "error"] as const) {
    const original = console[name].bind(console);
    t.mock.method(console, name, (...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
      original(...args);
    });
  }
  return logged;
}

/** Whether `folder` is `outer` or lies inside it. */
function within(folder: string, outer: string): boolean {
  const rest = relative(outer, folder);
  return rest === "" || (!rest.startsWith("..") && !isAbsolute(rest));
}

test("space-104, space-103, projects-37, git-host-9: a seat's join allocates the folder at its path, clones the code with the member's own token at a host no instance is, pairs the two, and reuses that folder", async (t) => {
  const code = await codeHost(t);
  const host = await startHost();
  const records = host.script.addRepository({ group: "acme", name: "alpha-spex", project: { format: 1, name: "alpha", remote: code.remote } });
  const key = hostKey(host, "acme/alpha-spex");
  // A repository x-spex in the subgroup acme/alpha, beside it.
  host.script.groups.push({ id: "2011", fullPath: "acme/alpha", name: "Alpha", kind: "group" });
  const nested = host.script.addRepository({ group: "acme/alpha", name: "x-spex", project: { format: 1, name: "x" } });
  const logged = captureConsole(t);
  const home = await startHome("seat-allocate", { host, project: false, extra: { seat: SEAT } });
  t.after(() => home.stop());
  // The harness's Git takes no global file (GIT_CONFIG_GLOBAL=/dev/null):
  // the seat's include is left out without a word (core-service-125).
  assert.deepEqual(logged.filter((line) => line.includes("Git configuration")), [], "no line says the seat's Git configuration was not written");
  await signIn(home, host);
  await home.client.expectOk("credential.set", { kind: "host", name: code.host, values: { token: TOKEN, username: USERNAME } });

  let codeClones = 0;
  let observed: ReturnType<typeof inspectCredential> | undefined;
  const run = SpaceGit.prototype.run;
  t.mock.method(SpaceGit.prototype, "run", function (this: SpaceGit, args: string[], options: GitRunOptions = {}) {
    if (args[0] === "clone" && args.includes(code.remote)) {
      codeClones += 1;
      observed = inspectCredential(options);
    }
    return run.call(this, args, options);
  });

  const from = home.client.mark();
  await home.client.expectOk("space.join", { instance: host.url, hostId: records.id });
  const joined = await home.client.waitRepository(from, key, (repository) => repository.folder !== null || repository.sync.phase === "stopped", 30_000);
  const folder = allocated(home.dataDir, host, "acme", "alpha-spex");
  // The folder the core allocated, `<repository>` with its `-spex` kept,
  // paired with the records (space-103).
  assert.deepEqual([joined.folder, joined.sync.phase, joined.state], [folder, "idle", "reachable"], JSON.stringify(joined.sync));
  assert.ok((await home.client.expectOk("project.list", {})).some((project) => project.id === key && project.path === folder));
  assert.equal(git(folder, "rev-parse", "HEAD"), code.head, "the code is cloned into that folder");
  // The member's token, through the app's helper, owner-only and gone
  // with the child; it enters no remote URL, no config and no reply
  // (projects-37, git-host-9, storage-44).
  assert.equal(codeClones, 1);
  assert.ok(observed?.file, "the code child takes the app's helper");
  assert.equal(observed.mode, 0o600);
  assert.deepEqual(observed.args.slice(0, 3), ["-c", "credential.helper=", "-c"]);
  assert.ok(!existsSync(observed.file), "the credential's file is removed with the child");
  assert.equal(git(folder, "remote", "get-url", "origin"), code.remote);
  assert.ok(!readFileSync(join(folder, ".git", "config"), "utf8").includes(TOKEN));
  assert.deepEqual(home.client.messages.flatMap(stringsOf).filter((text) => text.includes(TOKEN)), [], "no message carries the token");

  // A join naming no folder of a project here is refused as any join of
  // a clone here; its folder stays the one.
  await home.client.expectError("space.join", { instance: host.url, hostId: records.id }, "invalid_request", /is on this device already$/);

  // Removed, its folder stands; a join again reuses the folder allocated
  // for it, its code there, and makes no second one (space-103).
  await home.client.expectOk("project.remove", { projectId: key, confirm: true });
  assert.ok(existsSync(join(folder, ".git")), "the code's folder stands");
  const again = home.client.mark();
  await home.client.expectOk("space.join", { instance: host.url, hostId: records.id });
  const rejoined = await home.client.waitRepository(again, key, (repository) => repository.folder !== null || repository.sync.phase === "stopped", 30_000);
  assert.deepEqual([rejoined.folder, rejoined.sync.phase], [folder, "idle"], JSON.stringify(rejoined.sync));
  assert.equal(codeClones, 1, "the allocated folder is paired as it stands, its code not cloned again");
  assert.deepEqual(readdirSync(join(home.dataDir, "projects", hostFolder(host), "acme")), ["alpha-spex"], "no second folder is made");

  // The repository x-spex in the subgroup acme/alpha takes a folder of
  // its own, neither folder lying inside the other (space-103).
  const nestedKey = hostKey(host, "acme/alpha/x-spex");
  const fromNested = home.client.mark();
  await home.client.expectOk("space.join", { instance: host.url, hostId: nested.id });
  const other = await home.client.waitRepository(fromNested, nestedKey, (repository) => repository.folder !== null || repository.sync.phase === "stopped", 30_000);
  assert.deepEqual([other.folder, other.sync.phase], [allocated(home.dataDir, host, "acme/alpha", "x-spex"), "idle"], JSON.stringify(other.sync));
  assert.ok(other.folder !== null && !within(other.folder, folder) && !within(folder, other.folder), `${other.folder} and ${folder} lie apart`);
});

test("space-104, space-103: a code clone failing for want of the member's credential leaves the records readable with the phrase and the host in `credential`; a join again after credential.set clones into the same folder", async (t) => {
  const code = await codeHost(t);
  const host = await startHost();
  const key = hostKey(host, "acme/alpha-spex");

  // The member's records, made on a device of their own: a project whose
  // code is at the code host, a session and a queued intent.
  const laptop = await startHome("seat-laptop", { host, project: false });
  t.after(() => laptop.stop());
  const fromLaptop = laptop.client.mark();
  await signIn(laptop, host);
  await laptop.client.waitRepository(fromLaptop, `${USERNAME}/${USERNAME}-spex`, (repository) => repository.sync.phase === "done", 30_000);
  const work = gitFolder("alpha");
  git(work, "remote", "add", "origin", code.remote);
  const local = (await laptop.client.expectOk("project.register", { path: work })).id;
  const fromPick = laptop.client.mark();
  await laptop.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: host.url, groupId: "2002", name: "alpha" } });
  await laptop.client.waitRepository(fromPick, key, (repository) => repository.sync.phase === "done", 30_000);
  const sessionId = await runTurn(laptop, key, "shape the project");
  const intent = await laptop.client.expectOk("intent.queue", { projectId: key, text: "make it so" });
  const pushed = await laptop.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(pushed.sync.phase, "done", JSON.stringify(pushed.sync));
  await laptop.stop();
  const listed = host.script.repositories.find((repository) => repository.path === "alpha-spex");
  assert.ok(listed);

  const home = await startHome("seat-retry", { host, project: false, extra: { seat: SEAT } });
  t.after(() => home.stop());
  await signIn(home, host);
  const from = home.client.mark();
  await home.client.expectOk("space.join", { instance: host.url, hostId: listed.id });
  const stopped = await home.client.waitRepository(from, key, (repository) => repository.folder !== null || repository.sync.phase === "stopped", 30_000);
  assert.ok(stopped.sync.phase === "stopped", JSON.stringify(stopped.sync));
  // The row shows the failure with the phrase, the host in `credential`
  // for a client to open the Credentials section by (space-103).
  assert.deepEqual([stopped.sync.op, stopped.sync.step, stopped.folder], ["join", "code", null]);
  assert.equal(stopped.sync.message, `Code not cloned: ${code.host} needs a credential of yours. Add one under Settings.`);
  assert.equal(stopped.sync.credential, code.host);
  // A retry is a join of it again (space-103).
  assert.equal(stopped.sync.guidance, "The spex repository is here; join it again to clone its code.");
  const folder = allocated(home.dataDir, host, "acme", "alpha-spex");
  // The records are cloned, their session and intent readable in the
  // repository's explorer (space-35).
  assert.ok(existsSync(join(home.dataDir, "workspace", ...key.split("/"), "project.json")), "the records are cloned");
  const sessions = (await home.client.expectOk("space.tree", { repository: key, path: "sessions" })).entries;
  assert.ok(sessions.some((entry) => entry.path === `sessions/${sessionId}.json`), JSON.stringify(sessions.map((entry) => entry.path)));
  const records = await home.client.expectOk("space.read", { repository: key, path: `sessions/${sessionId}.records.jsonl` });
  assert.ok(records.kind === "text" && records.text.includes("shape the project"), "the session's records read");
  const queued = await home.client.expectOk("space.read", { repository: key, path: `intents/${intent.id}.json` });
  assert.ok(queued.kind === "text" && queued.text.includes("make it so"), "the intent reads");
  // In Chinese, the phrase names the same host.
  await home.client.expectOk("language.set", { language: "zh" });
  const spoken = repositoryOf(await home.client.expectOk("space.get", {}), key);
  assert.ok(spoken.sync.phase === "stopped" && spoken.sync.message.includes(code.host) && spoken.sync.credential === code.host, JSON.stringify(spoken.sync));
  await home.client.expectOk("language.set", { language: "en" });

  // The member places their token; a join again clones the code into the
  // same folder and pairs it (space-103).
  await home.client.expectOk("credential.set", { kind: "host", name: code.host, values: { token: TOKEN, username: USERNAME } });
  const again = home.client.mark();
  await home.client.expectOk("space.join", { instance: host.url, hostId: listed.id });
  const joined = await home.client.waitRepository(again, key, (repository) => repository.folder !== null, 30_000);
  assert.deepEqual([joined.folder, joined.sync.phase], [folder, "idle"], JSON.stringify(joined.sync));
  assert.equal(git(folder, "rev-parse", "HEAD"), code.head);
  assert.deepEqual(readdirSync(join(home.dataDir, "projects", hostFolder(host), "acme")), ["alpha-spex"]);
  assert.deepEqual(home.client.messages.flatMap(stringsOf).filter((text) => text.includes(TOKEN)), [], "no message carries the token");
});

test("space-103, storage-44: on a seat an ssh remote's failed code clone shows as it is, naming no credential; an https host whose token of the member's will not read says so, the host in `credential`", async (t) => {
  const code = await codeHost(t);
  const host = await startHost();
  const ssh = host.script.addRepository({ group: "acme", name: "gamma-spex", project: { format: 1, name: "gamma", remote: "ssh://git@127.0.0.1:1/acme/gamma.git" } });
  const https = host.script.addRepository({ group: "acme", name: "alpha-spex", project: { format: 1, name: "alpha", remote: code.remote } });
  const home = await startHome("seat-failures", { host, project: false, extra: { seat: SEAT } });
  t.after(() => home.stop());
  await signIn(home, host);

  // An ssh remote whose host has no token of the member's: Git's own
  // failure, no credential named (space-103).
  const sshKey = hostKey(host, "acme/gamma-spex");
  const fromSsh = home.client.mark();
  await home.client.expectOk("space.join", { instance: host.url, hostId: ssh.id });
  const sshStop = await home.client.waitRepository(fromSsh, sshKey, (repository) => repository.folder !== null || repository.sync.phase === "stopped", 30_000);
  assert.ok(sshStop.sync.phase === "stopped", JSON.stringify(sshStop.sync));
  assert.deepEqual([sshStop.sync.op, sshStop.sync.step, sshStop.folder], ["join", "code", null]);
  assert.equal(Object.hasOwn(sshStop.sync, "credential"), false, JSON.stringify(sshStop.sync));
  assert.ok(!/needs a credential of yours|cannot be read/.test(sshStop.sync.message), sshStop.sync.message);
  assert.ok(existsSync(join(home.dataDir, "workspace", ...sshKey.split("/"), "project.json")), "the records are cloned");

  // The member's entry for the https host, written by hand, is malformed:
  // refused by the read before the clone, the clone fails, and the row
  // says the credential cannot be read, the host in `credential`
  // (space-103, storage-44).
  const file = codeCredentialsPath(home.dataDir);
  mkdirSync(join(home.dataDir, "local"), { recursive: true, mode: 0o700 });
  writeFileSync(file, `format: 1\nhosts:\n  "${code.host}":\n    token: 5\nagents: {}\n`, { mode: 0o600 });
  const httpsKey = hostKey(host, "acme/alpha-spex");
  const fromHttps = home.client.mark();
  await home.client.expectOk("space.join", { instance: host.url, hostId: https.id });
  const unread = await home.client.waitRepository(fromHttps, httpsKey, (repository) => repository.folder !== null || repository.sync.phase === "stopped", 30_000);
  assert.ok(unread.sync.phase === "stopped", JSON.stringify(unread.sync));
  assert.deepEqual([unread.sync.op, unread.sync.step, unread.folder], ["join", "code", null]);
  assert.equal(unread.sync.message, `Code not cloned: your credential for ${code.host} cannot be read`);
  assert.equal(unread.sync.credential, code.host);
  assert.equal(unread.sync.guidance, "The spex repository is here; join it again to clone its code.");
  const folder = allocated(home.dataDir, host, "acme", "alpha-spex");
  assert.ok(existsSync(join(home.dataDir, "workspace", ...httpsKey.split("/"), "project.json")), "the records are cloned");

  // A join of it again, in Chinese, runs the code clone alone into the
  // same folder, the entry still unread: the row says so in Chinese,
  // the guidance a join again (space-103).
  await home.client.expectOk("language.set", { language: "zh" });
  const codeInto: (string | undefined)[] = [];
  let recordClones = 0;
  const run = SpaceGit.prototype.run;
  t.mock.method(SpaceGit.prototype, "run", function (this: SpaceGit, args: string[], options: GitRunOptions = {}) {
    if (args[0] === "clone" && args.includes(code.remote)) codeInto.push(args.at(-1));
    else if (args[0] === "clone") recordClones += 1;
    return run.call(this, args, options);
  });
  const said = unread.sync.message;
  const fromAgain = home.client.mark();
  await home.client.expectOk("space.join", { instance: host.url, hostId: https.id });
  const again = await home.client.waitRepository(fromAgain, httpsKey, (repository) => repository.folder !== null || (repository.sync.phase === "stopped" && repository.sync.message !== said), 30_000);
  assert.ok(again.sync.phase === "stopped", JSON.stringify(again.sync));
  assert.deepEqual([again.sync.message, again.sync.credential, again.sync.guidance], [`代码未克隆：无法读取你为 ${code.host} 设置的凭据`, code.host, "spex 仓库已在本设备上；再次加入即可克隆其代码。"]);
  assert.deepEqual([codeInto, recordClones], [[folder], 0], "the code clone runs alone, into the folder allocated for it");
  await home.client.expectOk("language.set", { language: "en" });
});

test("space-103, space-58: on a seat a pick joining a listed spex repository for a clone no folder pairs allocates the folder and clones the code there with the member's token", async (t) => {
  const code = await codeHost(t);
  const host = await startHost();
  const records = host.script.addRepository({ group: "acme", name: "alpha-spex", project: { format: 1, name: "alpha", remote: code.remote } });
  const key = hostKey(host, "acme/alpha-spex");
  // A local-only project's records no folder pairs, left from before.
  const before = await startHome("seat-pick", { host, project: false });
  const work = gitFolder("alpha");
  git(work, "remote", "add", "origin", code.remote);
  const local = (await before.client.expectOk("project.register", { path: work })).id;
  assert.equal(local, `${OWN}/alpha-spex`);
  await before.stop();
  const left = Home.load(before.dataDir);
  assert.ok(left.unpair(local));
  left.save();

  const home = await startHome("seat-pick-again", { dataDir: before.dataDir, host, project: false, extra: { seat: SEAT } });
  t.after(() => home.stop());
  await signIn(home, host);
  await home.client.expectOk("credential.set", { kind: "host", name: code.host, values: { token: TOKEN, username: USERNAME } });
  // Your own group's folder took the login's name at the sign-in.
  const picked = `${USERNAME}/alpha-spex`;
  assert.equal(repositoryOf(await home.client.expectOk("space.get", {}), picked).folder, null);
  const from = home.client.mark();
  await home.client.expectOk("space.pick", { repository: picked, choice: { kind: "join", instance: host.url, hostId: records.id }, noticed: true });
  const joined = await home.client.waitRepository(from, key, (repository) => repository.folder !== null || (repository.sync.phase === "stopped" && repository.sync.op === "join"), 30_000);
  const folder = allocated(home.dataDir, host, "acme", "alpha-spex");
  assert.equal(joined.folder, folder, JSON.stringify(joined.sync));
  assert.equal(git(folder, "rev-parse", "HEAD"), code.head);
  assert.equal(git(folder, "remote", "get-url", "origin"), code.remote);
});

test("git-host-9, storage-44: on a seat a spex repository's remote the reader named, at a host the member placed a token for, syncs through the app's helper with that token", async (t) => {
  const code = await codeHost(t);
  git(code.root, "init", "-q", "--bare", "records.git");
  const remote = `${code.url}/records.git`;
  const host = await startHost();
  // A local-only spex repository, left from before.
  const before = await startHome("seat-named", { host, project: false });
  await before.client.expectOk("project.register", { path: gitFolder("beta") });
  await before.stop();
  const home = await startHome("seat-named-again", { dataDir: before.dataDir, host, project: false, extra: { seat: SEAT } });
  t.after(() => home.stop());
  await signIn(home, host);
  const key = `${USERNAME}/beta-spex`;
  await home.client.expectOk("space.remote.set", { repository: key, url: remote });

  // With no token of the member's, the host refuses the transport.
  const refused = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(refused.sync.phase, "stopped", JSON.stringify(refused.sync));

  // With one, the app's helper serves it, and the token stays out of
  // the clone's configuration and every message (git-host-9).
  await home.client.expectOk("credential.set", { kind: "host", name: code.host, values: { token: TOKEN, username: USERNAME } });
  const synced = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(synced.sync.phase, "done", JSON.stringify(synced.sync));
  const clone = join(home.dataDir, "workspace", ...key.split("/"));
  assert.equal(git(join(code.root, "records.git"), "rev-parse", "spex"), git(clone, "rev-parse", "spex"));
  assert.ok(!readFileSync(join(clone, ".git", "config"), "utf8").includes(TOKEN));
  assert.deepEqual(home.client.messages.flatMap(stringsOf).filter((text) => text.includes(TOKEN)), [], "no message carries the token");
});

/** The core's environment on a seat account's home: Git configured
 * through the account's own global file alone, no identity by default
 * (space-32), the device's system file left out. */
function accountCoreEnv(account: string, host: { url: string }): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? "",
    HOME: account,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "user.useConfigOnly",
    GIT_CONFIG_VALUE_0: "true",
    SPEX_HOST_URL: host.url,
  };
}

/** Git as an agent on the seat runs it, outside the app: the account's
 * HOME, no helper or setting in the environment, never a prompt. A child
 * awaited, never a synchronous one, so the Git HTTP host in this process
 * answers it. */
function asAccount(account: string, cwd: string, ...args: string[]): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", HOME: account, GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" },
    }, (error, stdout, stderr) => {
      if (error && typeof error.code !== "number") return reject(error);
      resolve({ status: error ? error.code as number : 0, stdout, stderr });
    });
  });
}

/** Every file under `dir` but those `skipped` and Git's object store. */
function filesUnder(dir: string, skipped: readonly string[]): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (skipped.includes(path) || entry.name === "objects" && dir.endsWith(".git")) continue;
    if (entry.isDirectory()) files.push(...filesUnder(path, skipped));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

test("core-service-127, core-service-125, git-host-9, storage-44: on a seat the account's own Git configuration names the app's helper in its member mode, included once across restarts; a push outside the app from the project's work tree carries the member's token to its host and none to a host without one", async (t) => {
  const code = await codeHost(t);
  // A host taking the same credential, for which the member placed none.
  const elsewhere = await codeHost(t);
  const host = await startHost();
  const records = host.script.addRepository({ group: "acme", name: "alpha-spex", project: { format: 1, name: "alpha", remote: code.remote } });
  const key = hostKey(host, "acme/alpha-spex");
  const account = mkdtempSync(join(scratch, "seat-account-"));
  const seat = { host, project: false, extra: { seat: SEAT, env: accountCoreEnv(account, host), home: account } } as const;
  // Every line the core logs, kept to look for the token in.
  const logged = captureConsole(t);

  const first = await startHome("seat-pushes", seat);
  t.after(() => first.stop());
  // The account's global configuration includes the core's own file,
  // owner-only, naming the helper in its member mode over the member's
  // store on the app's runtime (core-service-125, git-host-9).
  const include = seatGitConfigPath(account);
  const includes = async (): Promise<string[]> => (await asAccount(account, account, "config", "--global", "--get-all", "include.path")).stdout.split("\n").filter(Boolean);
  const helpers = async (): Promise<string[]> => (await asAccount(account, account, "config", "--file", include, "--get-all", "credential.helper")).stdout.split("\n").filter(Boolean);
  const helper = `!"${process.execPath}" "${gitCredentialHelperPath()}" --member "${codeCredentialsPath(first.dataDir)}"`;
  assert.deepEqual(await includes(), [include]);
  assert.equal(statSync(include).mode & 0o777, 0o600);
  assert.deepEqual(await helpers(), [helper]);

  // The member's token, then the project the seat allocates and clones.
  await signIn(first, host);
  await first.client.expectOk("credential.set", { kind: "host", name: code.host, values: { token: TOKEN, username: USERNAME } });
  const from = first.client.mark();
  await first.client.expectOk("space.join", { instance: host.url, hostId: records.id });
  const joined = await first.client.waitRepository(from, key, (repository) => repository.folder !== null || repository.sync.phase === "stopped", 30_000);
  const folder = allocated(first.dataDir, host, "acme", "alpha-spex");
  assert.equal(joined.folder, folder, JSON.stringify(joined.sync));

  // An agent's commit, pushed outside the app: the one helper Git asks
  // is the include's, and the host takes the member's token through it.
  writeFileSync(join(folder, "CHANGE.md"), "an agent's change\n");
  git(folder, "add", "CHANGE.md");
  git(folder, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "an agent's change");
  const head = git(folder, "rev-parse", "HEAD");
  assert.equal((await asAccount(account, folder, "config", "--show-origin", "--get-all", "credential.helper")).stdout.trim(), `file:${include}\t${helper}`);
  const pushed = await asAccount(account, folder, "push", "origin", "HEAD");
  assert.equal(pushed.status, 0, pushed.stderr);
  assert.equal(git(code.bare, "rev-parse", "HEAD"), head, "the push reached the member's host");

  // The same push to a host without the member's token takes no
  // credential from the helper, and the host refuses it.
  const denied = await asAccount(account, folder, "push", elsewhere.remote, "HEAD:refs/heads/pushed");
  assert.notEqual(denied.status, 0, denied.stderr);
  assert.ok(elsewhere.server.refused > 0, "the host was asked");
  assert.equal(elsewhere.server.credentialed, 0, "no request to the host carried a credential");
  assert.equal(git(elsewhere.bare, "for-each-ref", "refs/heads/pushed"), "", "nothing reached the other host");

  // The helper itself: the member's token for an http(s) host they placed
  // it for, the host's default port as the store leaves it out; nothing
  // for another host or protocol, for `store` and `erase`, or from a store
  // that will not read or an entry that is malformed (storage-44).
  await first.client.expectOk("credential.set", { kind: "host", name: "code.example.test", values: { token: TOKEN } });
  const ask = (request: string, operation = "get", store = codeCredentialsPath(first.dataDir)): string =>
    execFileSync(process.execPath, [gitCredentialHelperPath(), "--member", store, operation], { input: `${request}\n\n`, encoding: "utf8", env: { PATH: process.env.PATH ?? "", HOME: account } });
  assert.equal(ask(`protocol=http\nhost=${code.host}`), `username=${USERNAME}\npassword=${TOKEN}\n\n`);
  // A username in the remote's URL is matched as Git's own helpers match
  // it: the entry's own, or any for an entry naming none; another
  // answers nothing.
  assert.equal(ask(`protocol=http\nhost=${code.host}\nusername=${USERNAME}`), `username=${USERNAME}\npassword=${TOKEN}\n\n`);
  assert.equal(ask(`protocol=http\nhost=${code.host}\nusername=grace`), "", "another username than the entry's is declined");
  assert.equal(ask("protocol=https\nhost=code.example.test\nusername=oauth2"), `username=oauth2\npassword=${TOKEN}\n\n`);
  assert.equal(ask("protocol=https\nhost=Code.Example.Test:443\npath=acme/code.git"), `username=token\npassword=${TOKEN}\n\n`);
  assert.equal(ask("protocol=http\nhost=code.example.test:443"), "");
  assert.equal(ask(`protocol=http\nhost=${elsewhere.host}`), "");
  assert.equal(ask(`protocol=ssh\nhost=${code.host}`), "");
  assert.equal(ask(`protocol=http\nhost=${code.host}`, "store"), "");
  assert.equal(ask(`protocol=http\nhost=${code.host}`, "erase"), "");
  const malformed = join(account, "malformed.yaml");
  writeFileSync(malformed, `format: 1\nhosts:\n  "${code.host}":\n    token: 5\nagents: {}\n`, { mode: 0o600 });
  assert.equal(ask(`protocol=http\nhost=${code.host}`, "get", malformed), "");
  writeFileSync(malformed, `format: 2\nhosts:\n  "${code.host}":\n    token: ${TOKEN}\nagents: {}\n`, { mode: 0o600 });
  assert.equal(ask(`protocol=http\nhost=${code.host}`, "get", malformed), "");
  assert.equal(ask(`protocol=http\nhost=${code.host}`, "get", join(account, "absent.yaml")), "");

  // A restart includes the file still once, naming the same helper.
  await first.stop();
  const second = await startHome("seat-pushes-again", { ...seat, dataDir: first.dataDir });
  t.after(() => second.stop());
  assert.deepEqual(await includes(), [include], "a restart adds no second include");
  assert.deepEqual(await helpers(), [helper]);

  // The token enters no Git configuration, no remote URL, no other file
  // of the account or the home, no log and no message (git-host-9,
  // storage-44).
  assert.equal(git(folder, "remote", "get-url", "origin"), code.remote);
  const written = [...filesUnder(account, [malformed]), ...filesUnder(first.dataDir, [codeCredentialsPath(first.dataDir)])];
  assert.ok(written.includes(join(account, ".gitconfig")) && written.includes(include) && written.includes(join(folder, ".git", "config")));
  assert.deepEqual(written.filter((file) => readFileSync(file).includes(TOKEN)), [], "no file but the member's store holds the token");
  assert.deepEqual([pushed, denied].flatMap((run) => [run.stdout, run.stderr]).filter((text) => text.includes(TOKEN)), []);
  assert.deepEqual(logged.filter((line) => line.includes(TOKEN)), [], "no log line carries the token");
  assert.deepEqual([...first.client.messages, ...second.client.messages].flatMap(stringsOf).filter((text) => text.includes(TOKEN)), [], "no message carries the token");
});

test("core-service-125: off a seat the core writes no Git configuration of the account's", async (t) => {
  const host = await startHost();
  const account = mkdtempSync(join(scratch, "own-account-"));
  const home = await startHome("own-pushes", { host, project: false, extra: { env: accountCoreEnv(account, host), home: account } });
  t.after(() => home.stop());
  await signIn(home, host);
  assert.equal(existsSync(join(account, ".gitconfig")), false, "no global configuration is written");
  assert.equal(existsSync(seatGitConfigPath(account)), false, "no include file is written");
  assert.equal((await asAccount(account, account, "config", "--global", "--get-all", "include.path")).stdout, "");
});

test("storage-44, git-host-9: a store the YAML parser warns about, quoting its token, or naming it as its format, is refused by its path alone: the helper prints nothing, no warning, log line, reply or diagnostic carries the token", async (t) => {
  const host = await startHost();
  const home = await startHome("seat-quiet-store", { host, project: false, extra: { seat: SEAT } });
  t.after(() => home.stop());
  // Every warning the process emits and every line the core logs.
  const warnings: string[] = [];
  const onWarning = (warning: Error): void => { warnings.push(`${warning.name}: ${warning.message}`); };
  process.on("warning", onWarning);
  t.after(() => { process.off("warning", onWarning); });
  const logged = captureConsole(t);
  const file = codeCredentialsPath(home.dataDir);
  mkdirSync(join(home.dataDir, "local"), { recursive: true, mode: 0o700 });
  const named = "code.example.test";

  // Each store but the last makes the parser warn with the token in its
  // words — a tagged token in a store of another format, the token as a
  // collection key in the host's entry, a directive carrying it before a
  // second document — and the last names it as its format; each is
  // refused, the file or the entry.
  const stores: [string, RegExp][] = [
    [`format: 2\nhosts:\n  ${named}:\n    token: !secret ${TOKEN}\nagents: {}\n`, /^unsupported format 2; preserved unchanged$/],
    [`format: 1\nhosts:\n  ${named}:\n    ? [${TOKEN}]\n    : token\nagents: {}\n`, new RegExp(`^the host entry ${named.replace(/\./g, "\\.")} is malformed; preserved unchanged$`)],
    [`%SECRET ${TOKEN}\n---\nformat: 1\nhosts: {}\nagents: {}\n---\n${TOKEN}\n`, /^not valid YAML; preserved unchanged$/],
    [`format: ${TOKEN}\nhosts: {}\nagents: {}\n`, /^unsupported format; preserved unchanged$/],
  ];
  for (const [text, reason] of stores) {
    writeFileSync(file, text, { mode: 0o600 });
    // The helper in its member mode, as Git runs it: an empty answer and
    // not a word on stderr (git-host-9).
    const asked = spawnSync(process.execPath, [gitCredentialHelperPath(), "--member", file, "get"], {
      input: `protocol=https\nhost=${named}\n\n`, encoding: "utf8", env: { PATH: process.env.PATH ?? "", HOME: home.dataDir },
    });
    assert.deepEqual([asked.status, asked.stdout, asked.stderr], [0, "", ""], text);
    // The core reports the file by its path, the reason naming no
    // secret (storage-44).
    const reports = (await home.client.expectOk("storage.diagnostics", {})).filter((report) => report.file === file);
    assert.equal(reports.length, 1, JSON.stringify(reports));
    assert.match(reports[0]?.reason ?? "", reason);
    assert.ok(!JSON.stringify(reports).includes(TOKEN), "no diagnostic carries the token");
    const listed = await home.client.command("credential.list", {});
    assert.ok(!JSON.stringify(listed).includes(TOKEN), "no reply carries the token");
  }
  assert.deepEqual(warnings.filter((warning) => warning.includes(TOKEN) || warning.startsWith("YAMLWarning")), [], "the parser warns nowhere");
  assert.deepEqual(logged.filter((line) => line.includes(TOKEN)), [], "no log line carries the token");
  assert.deepEqual(home.client.messages.flatMap(stringsOf).filter((text) => text.includes(TOKEN)), [], "no message carries the token");
});
