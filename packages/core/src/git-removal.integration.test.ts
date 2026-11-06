// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Git's read-only files removed on every platform (projects-46, space-76,
// storage-59, environments-54): a project's clone removed while the core
// watches it, and a removal refused changing nothing; a join's private
// clone removed once its place was taken; a failed set-up's `.git`; and
// a Git source's staged mirror. Git marks its objects read-only, Windows
// refuses to remove a read-only file, and the Node the app's Electron
// ships no longer makes one writable first; there a watched folder also
// holds its clone where it lies. CI runs this file on Windows on that
// Node, where the join waits for a credential an instance brokers to
// reach Git.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, watch, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";

import { gitSource } from "@sublang/spex/environment";
import { initializeClone } from "./storage-git.js";
import { scratchDir } from "./testing/scratch.js";
import { clonePath, createSpaceHarness, hostKey, repositoryOf } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
const { git, sleep, startHome, startHost, signIn, addFolder, turnRecords } = fixture;
test.after(() => fixture.dispose());

/** Git for the test's own repositories: no configuration of the host's. */
const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "T", GIT_AUTHOR_EMAIL: "t@example.test", GIT_COMMITTER_NAME: "T", GIT_COMMITTER_EMAIL: "t@example.test" };

/** Whether a file reads read-only: on Windows, its read-only mark. */
const readOnly = (path: string): boolean => (statSync(path).mode & 0o222) === 0;

/** Every file beneath `dir`. */
function filesOf(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesOf(path));
    else out.push(path);
  }
  return out;
}

/** The clone's own files as bytes, Git's data and lease coordination
 * aside, with the commit its `spex` branch holds. */
function standing(clone: string): { files: Map<string, string>; head: string } {
  const files = new Map<string, string>();
  for (const path of filesOf(clone)) {
    const inside = path.slice(clone.length + 1).split(/[\\/]/);
    if (inside[0] === ".git" || inside.some((part) => /^\.lock|^\.lease|\.lock(?:\.|$)/.test(part))) continue;
    files.set(inside.join("/"), readFileSync(path).toString("base64"));
  }
  return { files, head: git(clone, "rev-parse", "HEAD") };
}

/** A session another host wrote into a clone, as the playbook CLI writes
 * one (core-service-60). */
function writeSession(clone: string, cwd: string, prompt: string): string {
  const id = randomUUID();
  const sessions = join(clone, "sessions");
  writeFileSync(join(sessions, `${id}.json`), JSON.stringify({ schemaVersion: 6, sessionId: id, state: "settled", cwd }), { mode: 0o600 });
  writeFileSync(join(sessions, `${id}.records.jsonl`), turnRecords(prompt, 1).map((record, index) => JSON.stringify({ v: 1, seq: index + 1, record })).join("\n") + "\n", { mode: 0o600 });
  return id;
}

type StartedHome = Awaited<ReturnType<typeof startHome>>;

async function listed(home: StartedHome, id: string): Promise<boolean> {
  for (let i = 0; i < 800; i += 1) {
    if ((await home.client.expectOk("session.list", {})).some((session) => session.id === id)) return true;
    await sleep(25);
  }
  return false;
}

/** What a removal left beside the clone: its folder, or anything set
 * aside under its name. */
const leftBeside = (clone: string): string[] =>
  existsSync(dirname(clone)) ? readdirSync(dirname(clone)).filter((name) => name === basename(clone) || name.startsWith(`.${basename(clone)}.`) || name.startsWith(".removed-")) : [];

/** Whether `home.yaml` pairs a folder with `key`. */
const paired = (dataDir: string, key: string): boolean =>
  (parseYaml(readFileSync(join(dataDir, "home.yaml"), "utf8")) as { folders: { repository: string }[] }).folders.some((folder) => folder.repository === key);

/** A home whose core reads its clones' sessions and config as they
 * change, its project — the working folder `folderName`, where given —
 * registered with a local-only clone holding its first commit and a
 * session another host wrote, listed. */
async function watchedProject(name: string, folderName?: string): Promise<{ home: StartedHome; key: string; clone: string }> {
  const home = await startHome(name, { extra: { watchConfig: true } });
  let folder = home.projectDir;
  if (folderName !== undefined) {
    folder = join(scratchDir("spex-git-removal-folder-"), folderName);
    mkdirSync(folder);
    execFileSync("git", ["init", "-q", folder], { env: gitEnv });
  }
  writeFileSync(join(folder, "README.md"), `# ${name}\n`);
  execFileSync("git", ["-C", folder, "add", "-A"], { env: gitEnv });
  execFileSync("git", ["-C", folder, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "fixture"], { env: gitEnv });
  const { key, clone } = await addFolder(home, folder);
  assert.ok(filesOf(join(clone, ".git", "objects")).some(readOnly), "the clone's first commit stored Git's read-only objects");
  const session = writeSession(clone, folder, "written by another host");
  assert.ok(await listed(home, session), "the core read the clone's sessions as they changed");
  return { home, key, clone };
}

test("projects-46: a project's clone, watched by the core and holding Git's read-only objects, is removed, leaving nothing beside it", async (t) => {
  const { home, key, clone } = await watchedProject("git-removal");
  t.after(() => home.stop());
  assert.equal(await home.client.expectOk("project.remove", { projectId: key, confirm: true }), null);
  assert.deepEqual(leftBeside(clone), [], "[projects-10] no clone, and nothing set aside beside it");
  assert.equal(paired(home.dataDir, key), false, "[projects-10] no pair");
  assert.ok(!(await home.client.expectOk("project.list", {})).some((project) => project.id === key));
});

test("projects-46: a project whose clone's name runs to 225 characters is removed the same way", async (t) => {
  // Git for Windows takes no path past 260 characters without
  // core.longpaths, so no such clone is made there.
  if (process.platform === "win32") { t.skip("no clone of so long a name is made on Windows"); return; }
  const { home, key, clone } = await watchedProject("git-removal-long", "p".repeat(220));
  t.after(() => home.stop());
  assert.equal(basename(clone).length, 225, "the clone's folder name is 225 characters long");
  assert.equal(await home.client.expectOk("project.remove", { projectId: key, confirm: true }), null, "[projects-10] its removal sets it aside under a name no longer than any clone's");
  assert.deepEqual(leftBeside(clone), [], "[projects-10] no clone, and nothing set aside beside it");
  assert.equal(paired(home.dataDir, key), false, "[projects-10] no pair");
});

test("projects-46: a removal whose rename is refused changes nothing, the clone still watched, and completes once released", async (t) => {
  const { home, key, clone } = await watchedProject("git-removal-refused");
  t.after(() => home.stop());
  const group = dirname(clone);
  // Refused as another program refuses it: on Windows, a reader holding
  // a folder of the clone open; on POSIX, a group folder taking no
  // rename.
  let release: () => void;
  if (process.platform === "win32") {
    const held = watch(join(clone, "sessions"), () => {});
    release = () => held.close();
  } else {
    if (process.getuid?.() === 0) { t.skip("root renames in a read-only folder"); return; }
    chmodSync(group, 0o555);
    release = () => chmodSync(group, 0o755);
  }
  const before = standing(clone);
  let refused: Awaited<ReturnType<typeof home.client.command>>;
  try {
    refused = await home.client.command("project.remove", { projectId: key, confirm: true });
  } catch (error) { release(); throw error; }
  try {
    assert.ok(!refused.ok, "[projects-10] the removal is refused");
    assert.deepEqual(leftBeside(clone), [basename(clone)], "[projects-10] the clone stands where it was, nothing set aside");
    assert.deepEqual(standing(clone), before, "[projects-10] its files and Git as they were");
    assert.equal(paired(home.dataDir, key), true, "[projects-10] the pair stands");
    assert.ok((await home.client.expectOk("project.list", {})).some((project) => project.id === key));
    // The scan a refusal makes once settles first, so only the watch
    // resumed reads a session written after it.
    await sleep(500);
    const later = writeSession(clone, home.projectDir, "written after the refusal");
    assert.ok(await listed(home, later), "[projects-10] the core reads the clone's sessions again");
  } finally { release(); }
  assert.equal(await home.client.expectOk("project.remove", { projectId: key, confirm: true }), null);
  assert.deepEqual(leftBeside(clone), [], "[projects-10] once released, the removal completes");
  assert.equal(paired(home.dataDir, key), false);
});

test("space-76: a join whose place is taken while its clone runs stops, leaving what stands there, and no private folder of it remains", async (t) => {
  // On Windows no join clones yet: the credential an instance brokers is
  // refused there, the runtime's path holding backslashes Git's helper
  // line is not quoted for.
  if (process.platform === "win32") { t.skip("no brokered credential reaches Git on Windows yet"); return; }
  const host = await startHost();
  // A name of 250 characters, near the longest a folder takes: the
  // join's private folder is named apart from it.
  const name = `${"t".repeat(245)}-spex`;
  const listing = host.script.addRepository({ group: "acme", name });
  const key = hostKey(host, `acme/${name}`);
  const home = await startHome("join-taken", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  await signIn(home, host);
  const place = clonePath(home.dataDir, key);
  const from = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.join", { instance: host.url, hostId: listing.id }), { accepted: true });
  // The join made its private folder beside its place before replying;
  // its clone from the host still runs.
  writeFileSync(place, "taken while the join ran\n");
  const stopped = await home.client.waitRepository(from, key, (repository) => repository.sync.phase === "stopped");
  assert.ok(stopped.sync.phase === "stopped" && stopped.sync.op === "join", "[space-63] the join stops");
  assert.match(stopped.sync.phase === "stopped" ? stopped.sync.message : "", /already/, "[space-63] reading the place taken");
  assert.equal(readFileSync(place, "utf8"), "taken while the join ran\n", "[space-63] what stands at the place stays as it is");
  assert.deepEqual(readdirSync(dirname(place)).filter((name) => name.includes(".join-")), [], "[space-63] no private folder of the join remains, its clone's read-only objects removed with it");
  assert.equal(repositoryOf(await home.client.expectOk("space.get", {}), key).sync.phase, "stopped");
});

test("storage-59: a set-up whose first commit fails after Git stored its files leaves the clone a plain folder and reports the commit's own failure", () => {
  const clone = join(scratchDir("spex-set-up-"), "fixture-spex");
  mkdirSync(join(clone, "sessions"), { recursive: true });
  writeFileSync(join(clone, "project.json"), "{}\n");
  writeFileSync(join(clone, "sessions", "notes.json"), "{}\n");
  // Git stores the files' objects, read-only, before the commit refuses
  // a date it cannot read.
  const env = { ...gitEnv, GIT_COMMITTER_DATE: "not a date" };
  assert.throws(() => initializeClone(clone, { env }), (error: Error) => /invalid date/i.test(error.message) && !/EPERM|ENOTEMPTY|EBUSY/.test(error.message), "[storage-6] the commit's own failure is reported");
  assert.ok(!existsSync(join(clone, ".git")), "[storage-6] no .git remains");
  assert.equal(readFileSync(join(clone, "project.json"), "utf8"), "{}\n", "[storage-6] the clone's files stand");
  assert.ok(existsSync(join(clone, "sessions", "notes.json")));
  // A plain folder again, a later set-up makes it a repository.
  assert.equal(initializeClone(clone, { env: gitEnv }), true, "[storage-6] the folder is made a repository later");
});

test("environments-54: two fetches of one Git source at once keep one mirror, no staged clone beside it", async () => {
  const root = scratchDir("spex-git-mirror-");
  const work = join(root, "work");
  mkdirSync(work);
  execFileSync("git", ["init", "-q", "-b", "main", work], { env: gitEnv });
  writeFileSync(join(work, "README.md"), "# source\n");
  execFileSync("git", ["-C", work, "add", "-A"], { env: gitEnv });
  execFileSync("git", ["-C", work, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "source"], { env: gitEnv });
  const bare = join(root, "source.git");
  execFileSync("git", ["clone", "-q", "--bare", work, bare], { env: gitEnv });
  // A URL, as a host serves it: no hard links into the source's objects.
  const url = pathToFileURL(bare).href;
  const cache = join(root, "cache");
  const source = gitSource(cache);
  const [first, second] = await Promise.all([source.fetch(url, "main"), source.fetch(url, "main")]);
  assert.equal(first.commit, second.commit, "[environments-13] both resolve the same commit");
  const mirrors = readdirSync(join(cache, "git"));
  assert.equal(mirrors.length, 1, `[environments-13] one mirror stands, no staged clone beside it: ${mirrors.join(", ")}`);
  assert.ok(filesOf(join(cache, "git", mirrors[0]!, "objects")).some(readOnly), "the mirror holds Git's read-only objects");
});
