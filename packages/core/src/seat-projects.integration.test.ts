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
// and a folder allocated before is reused.

import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { codeCredentialsPath } from "./code-credentials.js";
import { GIT_CREDENTIAL_FILE_ENV } from "./git-credential.js";
import { Home } from "./home.js";
import { SpaceGit, type GitRunOptions } from "./space-git.js";
import { startGitHttpHost } from "./testing/git-http-host.js";
import { createSpaceHarness, hostFolder, hostKey, repositoryOf, stringsOf, OWN } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
const { scratch, git, gitFolder, startHome, startHost, signIn, runTurn } = fixture;
test.after(() => fixture.dispose());

const SEAT = { serverId: "srv_7f3a", serverName: "lab-1", personId: "1001" };
const USERNAME = "ada";
const TOKEN = "glpat-member-own-token-5e1f";

/** A code host that is no instance: Git's smart-HTTP backend serving one
 * repository of one commit to the member's username with their token. */
async function codeHost(t: TestContext): Promise<{ url: string; root: string; remote: string; host: string; bare: string; head: string }> {
  const root = mkdtempSync(join(scratch, "code-host-"));
  const work = gitFolder("code-work");
  writeFileSync(join(work, "README.md"), "the project's code\n");
  git(work, "add", "README.md");
  git(work, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "code");
  const bare = join(root, "code.git");
  git(root, "clone", "-q", "--bare", work, bare);
  const server = await startGitHttpHost({ root, username: USERNAME, password: TOKEN });
  t.after(() => server.close());
  return { url: server.url, root, remote: `${server.url}/code.git`, host: new URL(server.url).host, bare, head: git(bare, "rev-parse", "HEAD") };
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
  const home = await startHome("seat-allocate", { host, project: false, extra: { seat: SEAT } });
  t.after(() => home.stop());
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
