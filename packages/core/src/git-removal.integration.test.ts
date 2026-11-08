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
// Node.

import assert from "node:assert/strict";
import { syncBuiltinESMExports } from "node:module";
import { randomUUID } from "node:crypto";
import fs, { appendFileSync, chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, statSync, watch, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";

import { gitSource } from "@sublang/spex/environment";
import type { MediaAsset } from "./protocol.js";
import { initializeClone } from "./storage-git.js";
import { scratchDir } from "./testing/scratch.js";
import { clonePath, createSpaceHarness, hostKey, repositoryOf } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
const { git, gitFolder, bareRepo, holdingGit, sleep, snapshot, startHome, startHost, signIn, addFolder, writeForeignSession: writeSession, announced: listed } = fixture;
test.after(() => fixture.dispose());

/** The environment a set-up's Git runs with: no configuration of the
 * host's, a fixed identity. */
const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "T", GIT_AUTHOR_EMAIL: "t@example.test", GIT_COMMITTER_NAME: "T", GIT_COMMITTER_EMAIL: "t@example.test" };

/** Whether a file reads read-only: on Windows, its read-only mark. */
const readOnly = (path: string): boolean => (statSync(path).mode & 0o222) === 0;

/** Every file beneath `dir`. */
const filesOf = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name));

/** The clone's own files, Git's data and lease coordination aside, with
 * the commit its `spex` branch holds. */
const standing = (clone: string): { files: Map<string, Buffer>; head: string } => ({ files: snapshot(clone), head: git(clone, "rev-parse", "HEAD") });

type StartedHome = Awaited<ReturnType<typeof startHome>>;

/** What a removal left beside the clone: its folder, or what it set
 * aside. */
const leftBeside = (clone: string): string[] =>
  existsSync(dirname(clone)) ? readdirSync(dirname(clone)).filter((name) => name === basename(clone) || name.startsWith(".removed-")) : [];

/** Whether `home.yaml` pairs a folder with `key`. */
const paired = (dataDir: string, key: string): boolean =>
  (parseYaml(readFileSync(join(dataDir, "home.yaml"), "utf8")) as { folders: { repository: string }[] }).folders.some((folder) => folder.repository === key);

/** A home whose core — unless `watching` is false — reads its clones'
 * sessions and config as they change, its project — the working folder
 * `folderName`, where given — registered with a local-only clone holding
 * its first commit and, unless `withSession` is false, a session another
 * host wrote, listed. */
async function watchedProject(name: string, options: { folderName?: string; withSession?: boolean; watching?: boolean; env?: Record<string, string> } = {}): Promise<{ home: StartedHome; key: string; clone: string; session: string }> {
  const { folderName, withSession = true, watching = true, env } = options;
  const home = await startHome(name, { ...(env ? { env } : {}), extra: { watchConfig: watching } });
  const folder = folderName === undefined ? home.projectDir : gitFolder(folderName);
  writeFileSync(join(folder, "README.md"), `# ${name}\n`);
  git(folder, "add", "-A");
  git(folder, "commit", "-q", "-m", "fixture");
  const { key, clone } = await addFolder(home, folder);
  assert.ok(filesOf(join(clone, ".git", "objects")).some(readOnly), "the clone's first commit stored Git's read-only objects");
  if (!withSession) return { home, key, clone, session: "" };
  const session = await writeSession(clone, folder, "written by another host");
  assert.ok(await listed(home, session), "the core read the clone's sessions");
  return { home, key, clone, session };
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
  const { home, key, clone } = await watchedProject("git-removal-long", { folderName: "p".repeat(220) });
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
  try {
    const refused = await home.client.command("project.remove", { projectId: key, confirm: true });
    assert.ok(!refused.ok, "[projects-10] the removal is refused");
    assert.deepEqual(leftBeside(clone), [basename(clone)], "[projects-10] the clone stands where it was, nothing set aside");
    assert.deepEqual(standing(clone), before, "[projects-10] its files and Git as they were");
    assert.equal(paired(home.dataDir, key), true, "[projects-10] the pair stands");
    assert.ok((await home.client.expectOk("project.list", {})).some((project) => project.id === key));
    // The scan a refusal makes once settles first, so only the watch
    // resumed reads a session written after it.
    await sleep(500);
    const later = await writeSession(clone, home.projectDir, "written after the refusal");
    assert.ok(await listed(home, later), "[projects-10] the core reads the clone's sessions again");
  } finally { release(); }
  assert.equal(await home.client.expectOk("project.remove", { projectId: key, confirm: true }), null);
  assert.deepEqual(leftBeside(clone), [], "[projects-10] once released, the removal completes");
  assert.equal(paired(home.dataDir, key), false);
});

test("projects-46: on Windows a clone held open as its removal begins, let go within that request while another clone's watch is rebuilt, is removed by the same request", async (t) => {
  // Only Windows refuses to rename a folder while a file or folder in it
  // is held open, and only there is the rename tried again.
  if (process.platform !== "win32") { t.skip("no folder held open refuses a rename here"); return; }
  const { home, key, clone } = await watchedProject("git-removal-let-go");
  t.after(() => home.stop());
  // The clone holds a `config/`, which the core then watches inside it.
  mkdirSync(join(clone, "config"));
  await sleep(500);
  // A second project, whose clone the core watches until it holds a
  // `config/`: the folder appearing rebuilds every clone's config watch,
  // the removed clone's among them.
  const other = await addFolder(home, gitFolder("git-removal-other"));
  // The holder: a watch of the clone's `sessions/`, which also sees the
  // removal lease the clone's session right before its first try.
  let leased!: () => void;
  const leasing = new Promise<void>((resolve) => { leased = resolve; });
  const held = watch(join(clone, "sessions"), () => leased());
  let released = false;
  const release = (): void => { if (!released) { released = true; held.close(); } };
  try {
    const removal = home.client.command("project.remove", { projectId: key, confirm: true });
    await leasing;
    await sleep(100);
    mkdirSync(join(other.clone, "config"));
    await sleep(150);
    release();
    const removed = await removal;
    assert.ok(removed.ok, `[projects-10] the same request removes the project once its clone is let go: ${removed.ok ? "" : removed.error.message}`);
  } finally { release(); }
  assert.deepEqual(leftBeside(clone), [], "[projects-10] no clone, and nothing set aside beside it");
  assert.equal(paired(home.dataDir, key), false, "[projects-10] no pair");
});

test("projects-46: on Windows a record a removal's tries let in before its clone is let go asks the second confirmation, the record kept", async (t) => {
  if (process.platform !== "win32") { t.skip("no folder held open refuses a rename here"); return; }
  const { home, key, clone } = await watchedProject("git-removal-new-record", { withSession: false });
  t.after(() => home.stop());
  // Every record reached a placement: the first confirm alone removes.
  await home.client.expectOk("space.remote.set", { repository: key, url: pathToFileURL(bareRepo()).href });
  const from = home.client.mark();
  await home.client.expectOk("space.sync", { repository: key });
  await home.client.waitRepository(from, key, (repository) => repository.sync.phase === "done");
  const held = watch(join(clone, "sessions"), () => {});
  let released = false;
  const release = (): void => { if (!released) { released = true; held.close(); } };
  let intent: string;
  try {
    const removal = home.client.command("project.remove", { projectId: key });
    // Its first tries refused while the clone stays held, work queued
    // meanwhile writes a record no placement holds.
    await sleep(400);
    intent = (await home.client.expectOk("intent.queue", { projectId: key, text: "Queued while the removal waits" })).id;
    assert.ok(existsSync(join(clone, "intents", `${intent}.json`)), "the intent's record is written");
    release();
    const refused = await removal;
    assert.ok(!refused.ok, "[projects-10] a try after the record came reads it, asking the second confirmation [projects-9]");
  } finally { release(); }
  assert.ok(existsSync(join(clone, "intents", `${intent}.json`)), "[projects-10] the record stays until confirmed");
  assert.equal(paired(home.dataDir, key), true, "[projects-10] the pair stands");
});

test("projects-46: a record written after the count read the clone, before the removal commits, is counted again, asking the second confirmation", async (t) => {
  // The count's Git snapshot held at its write-tree by a stand-in Git.
  if (process.platform === "win32") { t.skip("the held Git is a POSIX shell script"); return; }
  const shim = holdingGit("write-tree", { skipFirst: true });
  t.after(() => shim.release());
  const { home, key, clone } = await watchedProject("git-removal-recount", { withSession: false, watching: false, env: { PATH: shim.path } });
  t.after(() => home.stop());
  // Every record reached a placement: the first confirm alone removes.
  await home.client.expectOk("space.remote.set", { repository: key, url: bareRepo() });
  const from = home.client.mark();
  await home.client.expectOk("space.sync", { repository: key });
  await home.client.waitRepository(from, key, (repository) => repository.sync.phase === "done");
  await sleep(500);
  // The count before the leasing runs; the try's own is held after Git
  // staged the clone, while an intent writes its record.
  shim.hold();
  const removal = home.client.command("project.remove", { projectId: key });
  await shim.held();
  const intent = (await home.client.expectOk("intent.queue", { projectId: key, text: "Queued after the count read the clone" })).id;
  assert.ok(existsSync(join(clone, "intents", `${intent}.json`)), "the intent's record is written");
  shim.release();
  const refused = await removal;
  assert.ok(!refused.ok, "[projects-10] the removal is refused");
  assert.equal(refused.error.code, "conflict", "[projects-9] asking the second confirmation");
  assert.deepEqual((refused.error as { details?: unknown }).details, { units: 1 }, "[projects-9] counting the new record");
  assert.ok(existsSync(join(clone, "intents", `${intent}.json`)), "[projects-10] the record stays until confirmed");
  assert.equal(paired(home.dataDir, key), true, "[projects-10] the pair stands");
});

/** A home whose project's records — an intent, where `withIntent` — all
 * reached a path placement, its core's Git run through `shim`,
 * unwatched: what a count of unsent records reads stands still but for
 * the test's own acts. */
async function syncedProject(name: string, shim: { path: string }, withIntent = false): Promise<{ home: StartedHome; key: string; clone: string }> {
  const { home, key, clone } = await watchedProject(name, { withSession: false, watching: false, env: { PATH: shim.path } });
  if (withIntent) await home.client.expectOk("intent.queue", { projectId: key, text: "Synced before the removal" });
  await home.client.expectOk("space.remote.set", { repository: key, url: bareRepo() });
  const from = home.client.mark();
  await home.client.expectOk("space.sync", { repository: key });
  await home.client.waitRepository(from, key, (repository) => repository.sync.phase === "done");
  await sleep(500);
  return { home, key, clone };
}

test("projects-46: a placement detached while the count reads the clone is counted again, asking the second confirmation", async (t) => {
  if (process.platform === "win32") { t.skip("the held Git is a POSIX shell script"); return; }
  const shim = holdingGit("write-tree", { skipFirst: true });
  t.after(() => shim.release());
  const { home, key, clone } = await syncedProject("git-removal-detached", shim, true);
  t.after(() => home.stop());
  // The try's count held after it read the sole placement, which is
  // then detached: every record is this computer's alone.
  shim.hold();
  const removal = home.client.command("project.remove", { projectId: key });
  await shim.held();
  await home.client.expectOk("space.remote.set", { repository: key, url: null });
  shim.release();
  const refused = await removal;
  assert.ok(!refused.ok, "[projects-10] the removal is refused");
  assert.equal(refused.error.code, "conflict", "[projects-9] asking the second confirmation");
  const units = ((refused.error as { details?: { units?: unknown } }).details)?.units;
  assert.ok(typeof units === "number" && units > 0, `[projects-9] counting the records no placement holds now: ${String(units)}`);
  assert.deepEqual(leftBeside(clone), [basename(clone)], "[projects-10] the clone stands");
  assert.equal(paired(home.dataDir, key), true, "[projects-10] the pair stands");
});

test("projects-46: a count whose records changed while it read them is taken again before the second confirmation shows it", async (t) => {
  if (process.platform === "win32") { t.skip("the held Git is a POSIX shell script"); return; }
  const shim = holdingGit("write-tree");
  t.after(() => shim.release());
  const { home, key } = await syncedProject("git-removal-stale-count", shim);
  t.after(() => home.stop());
  await home.client.expectOk("intent.queue", { projectId: key, text: "Queued before the removal" });
  await sleep(500);
  // The first count held after it staged the one unsent record; a
  // second is queued meanwhile.
  shim.hold();
  const removal = home.client.command("project.remove", { projectId: key });
  await shim.held();
  await home.client.expectOk("intent.queue", { projectId: key, text: "Queued while the count reads" });
  shim.release();
  const refused = await removal;
  assert.ok(!refused.ok && refused.error.code === "conflict", "[projects-9] the second confirmation is asked");
  assert.deepEqual((refused.error as { details?: unknown }).details, { units: 2 }, "[projects-9] counting both records, not the one first read");
});

test("projects-46: a removal whose home.yaml another writer changed once it read it is refused, the clone put back and that change standing", async (t) => {
  const { home, key, clone } = await watchedProject("git-removal-home-edited");
  t.after(() => home.stop());
  // The other writer's change lands as the clone is set aside, after the
  // core read the home file and before it publishes the unpair: node:fs
  // is patched and its named exports synced.
  const homeFile = join(home.dataDir, "home.yaml");
  const original = fs.renameSync;
  let edited = false;
  fs.renameSync = (from: fs.PathLike, to: fs.PathLike): void => {
    original(from, to);
    if (!edited && basename(String(to)).startsWith(".removed-")) { edited = true; appendFileSync(homeFile, "# changed by another writer\n"); }
  };
  syncBuiltinESMExports();
  let refused: Awaited<ReturnType<typeof home.client.command>>;
  try { refused = await home.client.command("project.remove", { projectId: key, confirm: true }); }
  finally { fs.renameSync = original; syncBuiltinESMExports(); }
  assert.ok(edited, "the other writer's change landed while the clone was set aside");
  assert.ok(!refused.ok, "[projects-10] the removal is refused");
  assert.equal(refused.error.code, "conflict", "[projects-10] as a conflict to retry");
  assert.deepEqual(leftBeside(clone), [basename(clone)], "[projects-10] the clone is put back, nothing set aside");
  assert.equal(paired(home.dataDir, key), true, "[projects-10] the pair stands");
  assert.match(readFileSync(homeFile, "utf8"), /# changed by another writer/, "[projects-10] the other writer's change stands");
});

test("projects-46: on Windows a removal closes the cached readers of every owner within the clone, an intent's attachment among them", async (t) => {
  if (process.platform !== "win32") { t.skip("no reader held open refuses a rename here"); return; }
  const { home, key, clone } = await watchedProject("git-removal-reader");
  t.after(() => home.stop());
  // An attachment taken into an intent, then read: its reader stays open.
  // The upload is only the setup, tried again where Windows refuses its
  // staged entry's admission now and then — a refusal of the upload's
  // own, apart from the removal.
  let asset!: MediaAsset;
  for (let attempt = 1; ; attempt += 1) {
    const uploadId = randomUUID();
    try {
      await home.client.expectOk("media.begin", { owner: { kind: "project", id: key }, uploadId, name: "evidence.txt", mimeType: "text/plain", byteLength: 4 });
      await home.client.expectOk("media.chunk", { uploadId, offset: 0, data: Buffer.from("kept").toString("base64") });
      ({ asset } = await home.client.expectOk("media.finish", { uploadId }));
      break;
    } catch (error) {
      if (attempt >= 3 || !/entry publication admission failed/.test(String(error))) throw error;
      await sleep(200);
    }
  }
  const intent = await home.client.expectOk("intent.queue", { projectId: key, text: "", attachments: [asset] });
  for (let i = 0; i < 400 && (await home.client.expectOk("session.list", {})).some((session) => session.projectId === key && session.live); i += 1) await sleep(50);
  const read = await home.client.expectOk("media.read", { owner: { kind: "intent", projectId: key, intentId: intent.id }, assetId: asset.assetId, offset: 0, length: 1 });
  assert.equal(read.data, Buffer.from("k").toString("base64"), "the intent's attachment is read");
  const removed = await home.client.command("project.remove", { projectId: key, confirm: true });
  assert.ok(removed.ok, `[projects-10] the removal completes: ${removed.ok ? "" : removed.error.message}`);
  assert.deepEqual(leftBeside(clone), [], "[projects-10] no clone, and nothing set aside beside it");
});

test("projects-46: a removal whose cleanup of a session's preferences fails once it has committed still completes and announces the session's removal", async (t) => {
  const { home, key, clone, session } = await watchedProject("git-removal-cleanup");
  t.after(() => home.stop());
  // A preference the session's removal clears, and a preferences file
  // that then refuses its write: its temporary file a folder.
  await home.client.expectOk("session.viewed", { sessionId: session, turnId: 1 });
  const temporary = join(home.dataDir, "local", "prefs.json.tmp");
  mkdirSync(temporary);
  try {
    const from = home.client.mark();
    assert.equal(await home.client.expectOk("project.remove", { projectId: key, confirm: true }), null, "[projects-10] the removal completes");
    await home.client.waitFor((message) => home.client.messages.indexOf(message) >= from && message.type === "session.removed" && message.sessionId === session, 20_000);
  } finally { rmdirSync(temporary); }
  assert.deepEqual(leftBeside(clone), [], "[projects-10] no clone, and nothing set aside beside it");
  assert.equal(paired(home.dataDir, key), false, "[projects-10] no pair");
});

test("projects-46: a removal whose write of home.yaml fails puts the clone back and is refused, the clone set aside once", async (t) => {
  // The write refused: on Windows, `home.yaml` read-only, whose
  // replacement is refused as a held clone's rename is; on POSIX, the
  // home's folder taking no new file.
  if (process.platform !== "win32" && process.getuid?.() === 0) { t.skip("root writes in a read-only folder"); return; }
  const { home, key, clone } = await watchedProject("git-removal-home-write");
  t.after(() => home.stop());
  const [target, refused, allowed] = process.platform === "win32" ? [join(home.dataDir, "home.yaml"), 0o444, 0o644] : [home.dataDir, 0o555, 0o755];
  // Each try sets the clone aside under a name of its own, which a watch
  // of its group's folder sees, as it holds nothing open in the clone.
  const asides = new Set<string>();
  const group = watch(dirname(clone), (_event, name) => { if (name?.startsWith(".removed-")) asides.add(name); });
  const before = standing(clone);
  chmodSync(target, refused);
  try {
    const removal = await home.client.command("project.remove", { projectId: key, confirm: true });
    assert.ok(!removal.ok, "[projects-10] the failed write refuses the removal");
  } finally { chmodSync(target, allowed); }
  await sleep(100);
  group.close();
  assert.ok(asides.size <= 1, `[projects-10] the removal is not tried again: set aside ${asides.size} times`);
  assert.deepEqual(leftBeside(clone), [basename(clone)], "[projects-10] the clone is put back, nothing set aside");
  assert.deepEqual(standing(clone), before, "[projects-10] its files and Git as they were");
  assert.equal(paired(home.dataDir, key), true, "[projects-10] the pair stands");
});

test("space-76: a join whose place is taken while its clone runs stops, leaving what stands there, and no private folder of it remains", async (t) => {
  const host = await startHost();
  // A name of 250 characters, near the longest a folder takes: the
  // join's private folder is named apart from it. Git for Windows takes
  // no path so long without core.longpaths, so a short one stands there.
  const name = process.platform === "win32" ? "taken-spex" : `${"t".repeat(245)}-spex`;
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
  git(work, "init", "-q", "-b", "main");
  writeFileSync(join(work, "README.md"), "# source\n");
  git(work, "add", "-A");
  git(work, "commit", "-q", "-m", "source");
  const bare = join(root, "source.git");
  git(root, "clone", "-q", "--bare", work, bare);
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
