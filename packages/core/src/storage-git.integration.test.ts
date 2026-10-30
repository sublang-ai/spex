// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The storage Git tool and its library (storage-10..12, storage-16,
// storage-17, storage-20..22) over one spex repository's clone: real
// Git branches of the clone's `spex` branch, merged and selected unit by
// unit, under the home and session leases.

import { createAssetStore } from "@sublang/playbook/session-assets";
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSessionStore } from "@sublang/playbook/session-store";
import { spexRepository, Store } from "./store.js";
import { sha256 } from "./app-storage.js";
import { Home } from "./home.js";
import { starterText, templatePath, type PlaybookModules } from "./config.js";
import { speak } from "./i18n.js";
import type { ProjectInfo } from "./protocol.js";
import { applyStorageSelection, EMPTY_TREE, planStorageMerge, prepareStorageGitFiles, reserveStorageHome, selectStorageMerge as selectStorageMergeWith, StorageDestinationRefused, StorageWriteRefused, validateStorageSnapshot, validateStorageTree, type StorageChoice } from "./storage-git.js";
import { scratchDir } from "./testing/scratch.js";
import { StorageFormatError } from "@sublang/spex/files";

/** One fixed machine identity for the in-process writers and the
 * command alike (storage-26): the command reads it from its own state
 * directory, never the developer's. */
const machineIdentity = "machine-id:v1:00000000-0000-4000-8000-0000000000aa";
const stateHome = scratchDir("spex-xdg-");
mkdirSync(join(stateHome, "playbook"), { mode: 0o700 });
writeFileSync(join(stateHome, "playbook", "machine-id"), `${machineIdentity}\n`, { mode: 0o600 });
/** A process of this machine that has exited: a dead owner's pid. */
const deadPid = (): number => spawnSync(process.execPath, ["-e", ""]).pid as number;
const selectStorageMerge = (home: string, key: string, choices: Record<string, StorageChoice> = {}, options: { join?: boolean } = {}) =>
  selectStorageMergeWith(home, key, choices, { ...options, machineIdentity });

/** The test's own Git: no user or system configuration, a fixed identity. */
const gitEnv: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Storage Test", GIT_AUTHOR_EMAIL: "storage@example.test",
  GIT_COMMITTER_NAME: "Storage Test", GIT_COMMITTER_EMAIL: "storage@example.test",
  LC_ALL: "C",
  XDG_STATE_HOME: stateHome,
};
const git = (dir: string, ...args: string[]): string => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", env: gitEnv, stdio: ["ignore", "pipe", "pipe"] }).trim();
const script = resolve(dirname(fileURLToPath(import.meta.url)), "../../../scripts/storage-git.mjs");
/** The documented entry point (storage-10), its JSON result parsed. */
const cli = (home: string, key: string, ...args: string[]): any =>
  JSON.parse(execFileSync(process.execPath, [script, "--home", home, "--repository", key, ...args], { encoding: "utf8", env: gitEnv, stdio: ["ignore", "pipe", "pipe"] }));
/** A refused invocation: nonzero exit, the cause on stderr, nothing on stdout. */
function cliFails(home: string, key: string, args: string[], pattern: RegExp): void {
  let failed = false;
  try { execFileSync(process.execPath, [script, "--home", home, "--repository", key, ...args], { encoding: "utf8", env: gitEnv, stdio: ["ignore", "pipe", "pipe"] }); }
  catch (error) {
    failed = true;
    const { status, stderr, stdout } = error as { status: number; stderr: string; stdout: string };
    assert.notEqual(status, 0);
    assert.match(stderr, pattern);
    assert.equal(stdout, "");
  }
  assert.ok(failed, `${args.join(" ")} must be refused`);
}

function writeIntent(clone: string, id: string, text: string, fields: Record<string, unknown> = {}): void {
  mkdirSync(join(clone, "intents"), { recursive: true });
  writeFileSync(join(clone, "intents", `${id}.json`), JSON.stringify({ format: 1, id, text, createdAt: 1, ...fields }));
}
const intentText = (clone: string, id: string): string => (JSON.parse(readFileSync(join(clone, "intents", `${id}.json`), "utf8")) as { text: string }).text;
function writeAuthoring(clone: string, label: string): void {
  mkdirSync(join(clone, "authoring"), { recursive: true });
  writeFileSync(join(clone, "authoring", "demo.json"), JSON.stringify({ format: 1, id: "demo", createdAt: 1, touchedAt: 2, package: "spex-packages/demo", queued: [{ text: label }], failures: 0 }));
  writeFileSync(join(clone, "authoring", "demo.records.jsonl"), `${JSON.stringify({ seq: 1, record: { type: "captain_status", turnId: null, timestamp: 1, message: label } })}\n`);
}
function writeEnvironment(clone: string, requests: string, lock: string): void {
  writeFileSync(join(clone, "spex.yaml"), `format: 1\nrequests: ${requests}\n`);
  writeFileSync(join(clone, "spex.lock"), `format: 1\nlock: ${lock}\n`);
}
/** Every file of a clone but Git data and leases, as path → bytes. */
function snapshot(dir: string): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === ".git" || /^\.lock|\.lock(?:\.|$)/.test(entry.name)) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.set(relative(dir, full), readFileSync(full));
    }
  };
  walk(dir);
  return out;
}

/** A home with one project whose clone holds one session committed on
 * its `spex` branch; optionally a second project beside it. */
function setup(options: { second?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "spex-git-store-"));
  const home = join(root, "home");
  const folder = join(root, "project");
  mkdirSync(folder); git(folder, "init", "-q");
  const store = new Store({ machineIdentity, dir: home, own: "tester", env: gitEnv });
  let project: ProjectInfo; let other: ProjectInfo | undefined;
  try {
    project = store.registerProject(folder, "Project");
    if (options.second) {
      const otherFolder = join(root, "other"); mkdirSync(otherFolder); git(otherFolder, "init", "-q");
      other = store.registerProject(otherFolder, "Other");
    }
  } finally { store.close(); }
  const key = project.id;
  const clone = Home.load(home).clonePath(key);
  mkdirSync(join(clone, "intents"), { recursive: true });
  const sessionId = randomUUID();
  const bundle = (label: string, id = sessionId, dir = clone, cwd = project.path) => {
    const records = `${JSON.stringify({ v: 1, seq: 1, record: { futureKind: label } })}\n`;
    writeFileSync(join(dir, "sessions", `${id}.records.jsonl`), records, { mode: 0o600 });
    writeFileSync(join(dir, "sessions", `${id}.json`), JSON.stringify({ schemaVersion: 7, kind: "captain-session", sessionId: id, cwd, createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z", state: "history-only", reason: label, replay: { seq: 1, sha256: sha256(records), incomplete: false }, contextSeq: null }, null, 2), { mode: 0o600 });
  };
  const commit = (message: string) => { git(clone, "add", "-A", "--", "."); git(clone, "commit", "-q", "-m", message); };
  bundle("base"); commit("base");
  return { root, home, folder, key, clone, project, other, sessionId, bundle, commit, dispose: () => rmSync(root, { recursive: true, force: true }) };
}
function merge(clone: string, ref = "other") { try { git(clone, "merge", "--no-commit", "--no-ff", ref); } catch { /* conflicts are the subject */ } }

test("storage-16: the documented entry point plans, selects, validates and rebinds one spex repository", async () => {
  const s = setup({ second: true });
  const { root, home, folder, key, clone, sessionId, bundle, commit } = s;
  try {
    assert.equal(key, "tester/project-spex");
    assert.equal(git(clone, "symbolic-ref", "--short", "HEAD"), "spex");
    // The base: a session both sides change, one deleted here and
    // changed there, an intent both sides edit, an authoring session,
    // the environment, and a text file both sides change on different
    // lines — which Git alone would merge cleanly.
    const doomed = randomUUID(); bundle("doomed", doomed);
    const edited = randomUUID(); writeIntent(clone, edited, "base");
    writeAuthoring(clone, "base"); writeEnvironment(clone, "base", "base");
    writeFileSync(join(clone, "notes.md"), "one\ntwo\nthree\n");
    commit("base units");
    git(clone, "branch", "other");
    bundle("ours"); rmSync(join(clone, "sessions", `${doomed}.json`)); rmSync(join(clone, "sessions", `${doomed}.records.jsonl`));
    writeIntent(clone, edited, "ours");
    const mine = randomUUID(); writeIntent(clone, mine, "added here", { createdAt: 2 });
    writeAuthoring(clone, "ours"); writeEnvironment(clone, "ours", "base");
    writeFileSync(join(clone, "notes.md"), "ONE\ntwo\nthree\n");
    commit("ours");
    git(clone, "checkout", "-q", "other");
    bundle("theirs"); bundle("doomed changed", doomed);
    writeIntent(clone, edited, "theirs");
    const theirs = randomUUID(); writeIntent(clone, theirs, "added there", { createdAt: 3 });
    writeAuthoring(clone, "theirs"); writeEnvironment(clone, "base", "theirs");
    writeFileSync(join(clone, "notes.md"), "one\ntwo\nTHREE\n");
    commit("theirs");
    const theirsRecords = readFileSync(join(clone, "sessions", `${sessionId}.records.jsonl`));
    const theirsAuthoring = readFileSync(join(clone, "authoring", "demo.json"));
    git(clone, "checkout", "-q", "spex");

    // plan: the revisions, the ancestor and every unit's choice, with
    // neither the files nor the index changed (storage-20).
    const indexBefore = git(clone, "ls-files", "-s");
    const filesBefore = snapshot(clone);
    const plan = cli(home, key, "plan", "HEAD", "other");
    assert.equal(plan.ours, git(clone, "rev-parse", "HEAD"));
    assert.equal(plan.theirs, git(clone, "rev-parse", "other"));
    assert.equal(plan.base, git(clone, "merge-base", "HEAD", "other"));
    assert.equal(plan.unrelated, false);
    const choiceOf = (name: string) => (plan.units as { name: string; choice: string }[]).find((unit) => unit.name === name)?.choice;
    assert.equal(choiceOf(`sessions/${sessionId}`), "conflict");
    assert.equal(choiceOf(`sessions/${doomed}`), "conflict", "deletion against a change is a choice");
    assert.equal(choiceOf(`intents/${edited}`), "conflict");
    assert.equal(choiceOf(`intents/${mine}`), "ours", "an intent added here asks nothing");
    assert.equal(choiceOf(`intents/${theirs}`), "theirs", "an intent added there asks nothing");
    assert.equal(choiceOf("authoring/demo"), "conflict");
    assert.equal(choiceOf("environment"), "conflict", "spex.yaml and spex.lock are one unit");
    assert.equal(choiceOf("notes.md"), "conflict", "a clean text merge is still a choice");
    assert.equal(choiceOf("project.json"), "ours");
    assert.equal(choiceOf("spex.yaml"), undefined);
    assert.equal(git(clone, "ls-files", "-s"), indexBefore, "plan leaves the index");
    assert.deepEqual(snapshot(clone), filesBefore, "plan leaves the files");

    merge(clone);
    const mergeIndex = git(clone, "ls-files", "-s");
    const mergeFiles = snapshot(clone);
    const unchanged = (why: string) => {
      assert.equal(git(clone, "ls-files", "-s"), mergeIndex, `${why}: index unchanged`);
      assert.deepEqual(snapshot(clone), mergeFiles, `${why}: files unchanged`);
    };
    // Refused selections leave the index and the files (storage-21).
    const complete = [`sessions/${sessionId}=theirs`, `sessions/${doomed}=ours`, `intents/${edited}=ours`, "authoring/demo=theirs", "environment=ours", "notes.md=ours"];
    cliFails(home, key, ["select"], /choose ours or theirs/);
    unchanged("an unresolved conflict");
    cliFails(home, key, ["select", ...complete, "notes.md=theirs"], /invalid choice/);
    unchanged("a duplicate choice");
    cliFails(home, key, ["select", ...complete, "nope=ours"], /unknown storage unit/);
    unchanged("an unknown unit");
    cliFails(home, key, ["select", ...complete, `intents/${mine}=theirs`], /no divergent change/);
    unchanged("a choice contrary to the comparison");
    cliFails(home, key, ["select", "notes.md=sideways"], /invalid choice/);
    unchanged("an invalid side");

    // Leases block competing writes (storage-14): the home lease refuses
    // every mutating command; a session lease in this clone refuses that
    // session's write, leaving it and the index as the merge left them,
    // while one in another spex repository's own store refuses nothing.
    const releaseHome = reserveStorageHome(home, machineIdentity);
    try {
      // The command reads this machine's identity, so the holder is a
      // live owner of this machine, named by its pid (storage-26).
      cliFails(home, key, ["select", ...complete], new RegExp(`stop the Spex core before changing stored data; .*pid ${process.pid} on this machine`));
      cliFails(home, key, ["validate"], /stop the Spex core/);
      cliFails(home, key, ["rebind", key, folder], /held|one core/);
    } finally { releaseHome(); }
    unchanged("a held home lease");
    const sessions = createSessionStore({ sessionsDir: join(clone, "sessions") }); await sessions.prepare();
    const held = await sessions.acquireManagement(sessionId);
    try { cliFails(home, key, ["select", ...complete], new RegExp(`sessions/${sessionId}: .*(held|owner|active|lease)`, "i")); }
    finally { await held.release(); }
    assert.equal(git(clone, "ls-files", "-s"), mergeIndex, "a held session lease: index unchanged");
    for (const file of [`sessions/${sessionId}.json`, `sessions/${sessionId}.records.jsonl`]) assert.deepEqual(readFileSync(join(clone, file)), mergeFiles.get(file), `a held session lease: ${file} unchanged`);
    const otherClone = Home.load(home).clonePath(s.other!.id);
    const otherSession = randomUUID(); bundle("elsewhere", otherSession, otherClone, s.other!.path);
    const otherStore = createSessionStore({ sessionsDir: join(otherClone, "sessions") }); await otherStore.prepare();
    const elsewhere = await otherStore.acquireManagement(otherSession);
    // The retry completes what the refused selection began (storage-21).
    let result: { plan: { base: string }; diagnostics: unknown[] };
    try { result = cli(home, key, "select", ...complete); }
    finally { await elsewhere.release(); }

    // Every unit taken whole from its chosen side (storage-11).
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.plan.base, plan.base);
    assert.deepEqual(readFileSync(join(clone, "sessions", `${sessionId}.records.jsonl`)), theirsRecords);
    assert.equal(existsSync(join(clone, "sessions", `${doomed}.json`)), false, "the deleting side deletes the whole bundle");
    assert.equal(existsSync(join(clone, "sessions", `${doomed}.records.jsonl`)), false);
    assert.equal(intentText(clone, edited), "ours");
    assert.equal(intentText(clone, mine), "added here");
    assert.equal(intentText(clone, theirs), "added there");
    assert.deepEqual(readFileSync(join(clone, "authoring", "demo.json")), theirsAuthoring);
    assert.match(readFileSync(join(clone, "authoring", "demo.records.jsonl"), "utf8"), /"message":"theirs"/);
    assert.equal(readFileSync(join(clone, "spex.yaml"), "utf8"), "format: 1\nrequests: ours\n");
    assert.equal(readFileSync(join(clone, "spex.lock"), "utf8"), "format: 1\nlock: base\n", "the environment is one unit, never mixed");
    assert.equal(readFileSync(join(clone, "notes.md"), "utf8"), "ONE\ntwo\nthree\n", "the chosen side, not Git's clean merge");
    assert.equal(git(clone, "diff", "--name-only", "--diff-filter=U"), "");
    const staged = git(clone, "diff", "--cached", "--name-only").split("\n");
    for (const path of [`sessions/${sessionId}.records.jsonl`, `sessions/${sessionId}.json`, `intents/${theirs}.json`, "authoring/demo.json", "authoring/demo.records.jsonl"]) {
      assert.ok(staged.includes(path), `${path} staged in ${staged.join(", ")}`);
    }
    git(clone, "commit", "-q", "-m", "merge the other branch");

    // validate: reserves the home and changes nothing (storage-22). A
    // dead owner of this machine is reclaimed by the command, its record
    // kept under `.lease.retired/<token>/` (storage-10).
    const settled = snapshot(clone); const settledIndex = git(clone, "ls-files", "-s");
    const deadToken = randomUUID();
    mkdirSync(join(home, ".lease"), { mode: 0o700 });
    writeFileSync(join(home, ".lease", "owner.json"), JSON.stringify({ pid: deadPid(), hostname: machineIdentity, acquiredAt: Date.now(), token: deadToken }), { mode: 0o600 });
    assert.deepEqual(cli(home, key, "validate"), []);
    assert.equal(existsSync(join(home, ".lease")), false);
    assert.equal(JSON.parse(readFileSync(join(home, ".lease.retired", deadToken, "owner.json"), "utf8")).token, deadToken);
    assert.deepEqual(snapshot(clone), settled); assert.equal(git(clone, "ls-files", "-s"), settledIndex);
    // A dispatch naming a turn its session never ran, and a damaged
    // bundle, are refused by name (storage-12).
    const dispatched = randomUUID();
    writeIntent(clone, dispatched, "Work", { dispatched: { sessionId, turnId: 1, at: 1 } });
    cliFails(home, key, ["validate"], /invalid dispatch/);
    rmSync(join(clone, "intents", `${dispatched}.json`));
    writeFileSync(join(clone, "sessions", `${sessionId}.records.jsonl`), `${JSON.stringify({ v: 1, seq: 1, record: { futureKind: "tampered" } })}\n`);
    cliFails(home, key, ["validate"], /digest|checkpoint|replay|damaged/i);
    git(clone, "checkout", "--", `sessions/${sessionId}.records.jsonl`);
    assert.deepEqual(cli(home, key, "validate"), []);

    // Two open intents from one issue, each added on one side, merge
    // without a choice but are refused at selection with nothing written.
    git(clone, "branch", "dup");
    writeIntent(clone, randomUUID(), "from the issue here", { source: { kind: "issue", ref: "#7" } }); commit("issue here");
    git(clone, "checkout", "-q", "dup");
    writeIntent(clone, randomUUID(), "from the issue there", { source: { kind: "issue", ref: "#7" } }); commit("issue there");
    git(clone, "checkout", "-q", "spex");
    merge(clone, "dup");
    const dupIndex = git(clone, "ls-files", "-s"); const dupFiles = snapshot(clone);
    cliFails(home, key, ["select"], /duplicate open source/);
    assert.equal(git(clone, "ls-files", "-s"), dupIndex);
    assert.deepEqual(snapshot(clone), dupFiles);
    git(clone, "merge", "--abort");

    // rebind pairs the spex repository with a folder under the home
    // lease, supplied aliases replacing the list (storage-22).
    const moved = join(root, "moved"); mkdirSync(join(moved, "child"), { recursive: true }); git(moved, "init", "-q");
    const bound = cli(home, key, "rebind", key, moved, "--alias", folder);
    assert.equal(bound.project.id, key);
    assert.equal(bound.project.path, moved);
    assert.deepEqual(bound.diagnostics, []);
    assert.deepEqual(Home.load(home).folderOf(key), { path: moved, repository: key, aliases: [folder] });
    const homeFile = readFileSync(join(home, "home.yaml"));
    cliFails(home, key, ["rebind", key, join(moved, "child")], /not the root/);
    cliFails(home, key, ["rebind", key, moved, "--elsewhere", folder], /--alias/);
    assert.deepEqual(readFileSync(join(home, "home.yaml")), homeFile, "a refused rebind leaves the home file");
    cliFails(home, key, ["plan"], /Usage/);
    assert.throws(() => execFileSync(process.execPath, [script, "--home", home, "validate"], { stdio: "pipe", env: gitEnv }), /--repository/);
  } finally { s.dispose(); }
});

test("storage-16: real Git branches select session bundles and intents as complete units", async () => {
  const { home, key, clone, sessionId, bundle, commit, dispose } = setup();
  try {
    const shared = randomUUID(); writeIntent(clone, shared, "base");
    const untouched = randomUUID(); writeIntent(clone, untouched, "neither side changes it"); commit("intent");
    git(clone, "branch", "other"); bundle("ours");
    writeIntent(clone, shared, "ours"); const mine = randomUUID(); writeIntent(clone, mine, "added here", { createdAt: 2 });
    commit("ours"); const oursManifest = readFileSync(join(clone, "sessions", `${sessionId}.json`));
    git(clone, "checkout", "-q", "other"); bundle("theirs");
    writeIntent(clone, shared, "theirs"); const theirs = randomUUID(); writeIntent(clone, theirs, "added there", { createdAt: 3 });
    commit("theirs"); const theirsRecords = readFileSync(join(clone, "sessions", `${sessionId}.records.jsonl`));
    git(clone, "checkout", "-q", "spex"); const plan = planStorageMerge(clone, "HEAD", "other");
    // An attachment never committed, in a unit neither side changed, is Git's untracked file and stays (storage-21).
    const local = join(clone, "intents", `${untouched}.assets`, "local.bin");
    mkdirSync(dirname(local), { recursive: true }); writeFileSync(local, "kept");
    assert.equal(plan.units.find((u) => u.name === `sessions/${sessionId}`)?.choice, "conflict");
    assert.equal(plan.units.find((u) => u.name === `intents/${shared}`)?.choice, "conflict");
    assert.deepEqual(plan.units.find((u) => u.name === `intents/${mine}`)?.changed, { ours: true, theirs: false });
    assert.equal(plan.units.find((u) => u.name === `intents/${theirs}`)?.choice, "theirs");
    merge(clone); await assert.rejects(() => selectStorageMerge(home, key), /choose ours or theirs/);
    const result = await selectStorageMerge(home, key, { [`sessions/${sessionId}`]: "theirs", [`intents/${shared}`]: "ours" });
    assert.equal(result.diagnostics.length, 0);
    assert.notDeepEqual(readFileSync(join(clone, "sessions", `${sessionId}.json`)), oursManifest);
    assert.deepEqual(readFileSync(join(clone, "sessions", `${sessionId}.records.jsonl`)), theirsRecords);
    assert.equal(intentText(clone, shared), "ours");
    assert.equal(intentText(clone, mine), "added here");
    assert.equal(intentText(clone, theirs), "added there");
    assert.equal(readFileSync(local, "utf8"), "kept");
    assert.equal(git(clone, "diff", "--name-only", "--diff-filter=U"), "");
    assert.equal(statSync(join(clone, "sessions")).mode & 0o777, 0o700);
    assert.equal(statSync(join(clone, "sessions", `${sessionId}.json`)).mode & 0o777, 0o600);
  } finally { dispose(); }
});

test("storage-16: delete versus modify needs explicit bundle choice; active core or CLI lease blocks selection", async () => {
  const { home, key, clone, sessionId, bundle, commit, dispose } = setup();
  try {
    git(clone, "branch", "other");
    rmSync(join(clone, "sessions", `${sessionId}.json`)); rmSync(join(clone, "sessions", `${sessionId}.records.jsonl`)); commit("delete");
    git(clone, "checkout", "-q", "other"); bundle("changed"); commit("modify"); git(clone, "checkout", "-q", "spex"); merge(clone);
    const release = reserveStorageHome(home, machineIdentity); await assert.rejects(() => selectStorageMerge(home, key, { [`sessions/${sessionId}`]: "theirs" }), /stop the Spex core/); release();
    const shared = createSessionStore({ sessionsDir: join(clone, "sessions") }); await shared.prepare(); const lease = await shared.acquireManagement(sessionId);
    await assert.rejects(() => selectStorageMerge(home, key, { [`sessions/${sessionId}`]: "ours" }), /held|owner|active|lease/i); await lease.release();
    await selectStorageMerge(home, key, { [`sessions/${sessionId}`]: "ours" });
    assert.equal(existsSync(join(clone, "sessions", `${sessionId}.json`)), false); assert.equal(existsSync(join(clone, "sessions", `${sessionId}.records.jsonl`)), false);
  } finally { dispose(); }
});

test("storage-16: an authoring session and the environment are each one unit chosen whole, and the plan names the ancestor", async () => {
  const { home, key, clone, commit, dispose } = setup();
  try {
    writeAuthoring(clone, "base"); writeEnvironment(clone, "base", "base"); commit("base");
    git(clone, "branch", "other");
    writeAuthoring(clone, "ours"); writeEnvironment(clone, "ours", "base"); commit("ours");
    git(clone, "checkout", "-q", "other");
    writeAuthoring(clone, "theirs"); writeEnvironment(clone, "base", "theirs"); commit("theirs");
    git(clone, "checkout", "-q", "spex");
    const plan = planStorageMerge(clone, "HEAD", "other");
    assert.equal(plan.base, git(clone, "merge-base", "HEAD", "other")); assert.equal(plan.unrelated, false);
    const authoring = plan.units.find((u) => u.name === "authoring/demo");
    assert.equal(authoring?.choice, "conflict");
    assert.deepEqual(authoring?.paths, ["authoring/demo.json", "authoring/demo.records.jsonl"]);
    const environment = plan.units.find((u) => u.name === "environment");
    assert.equal(environment?.choice, "conflict", "each side changed a different file of the one unit");
    assert.deepEqual(environment?.paths, ["spex.lock", "spex.yaml"]);
    assert.deepEqual(environment?.changed, { ours: true, theirs: true });
    assert.ok(!plan.units.some((u) => ["spex.yaml", "spex.lock"].includes(u.name) || u.name.startsWith("authoring/demo.")), "no file of a unit is its own unit");
    merge(clone);
    await assert.rejects(() => selectStorageMerge(home, key, { "spex.yaml": "ours" }), /unknown storage unit/);
    await selectStorageMerge(home, key, { "authoring/demo": "theirs", environment: "theirs" });
    assert.match(readFileSync(join(clone, "authoring", "demo.json"), "utf8"), /"text":"theirs"/);
    assert.match(readFileSync(join(clone, "authoring", "demo.records.jsonl"), "utf8"), /"message":"theirs"/);
    assert.equal(readFileSync(join(clone, "spex.yaml"), "utf8"), "format: 1\nrequests: base\n");
    assert.equal(readFileSync(join(clone, "spex.lock"), "utf8"), "format: 1\nlock: theirs\n");
    assert.equal(git(clone, "diff", "--name-only", "--diff-filter=U"), "");
  } finally { dispose(); }
});

test("storage-16: a spec package folder is one unit chosen whole, a folder nested in it and a file added on one side within it, a folder made one on one side, and a file beside it its own", async () => {
  const { home, key, clone, commit, dispose } = setup();
  const write = (path: string, text: string): void => { mkdirSync(dirname(join(clone, path)), { recursive: true }); writeFileSync(join(clone, path), text); };
  try {
    for (const path of ["mine/notes/meta.yaml", "mine/notes/skills/en/notes/SKILL.md", "mine/notes/inner/meta.yaml", "mine/README.md", "mine/drafts/b.md"]) write(path, "base");
    commit("base");
    git(clone, "branch", "other");
    // One side makes `mine/drafts/` a spec package folder while the other
    // edits a file under it: one unit on every side, in conflict.
    write("mine/notes/meta.yaml", "ours"); write("mine/README.md", "ours"); write("mine/drafts/meta.yaml", "ours"); commit("ours");
    git(clone, "checkout", "-q", "other");
    write("mine/notes/skills/en/notes/SKILL.md", "theirs"); write("mine/notes/skills/en/notes/extra.md", "theirs"); write("mine/drafts/b.md", "theirs"); commit("theirs");
    git(clone, "checkout", "-q", "spex");
    const plan = planStorageMerge(clone, "HEAD", "other");
    const folder = plan.units.find((u) => u.name === "mine/notes/");
    assert.equal(folder?.choice, "conflict", "each side changed a different file of the one folder");
    assert.deepEqual(folder?.paths, ["mine/notes/inner/meta.yaml", "mine/notes/meta.yaml", "mine/notes/skills/en/notes/SKILL.md", "mine/notes/skills/en/notes/extra.md"]);
    assert.deepEqual(folder?.changed, { ours: true, theirs: true });
    assert.ok(!plan.units.some((u) => u.name !== "mine/notes/" && u.name.startsWith("mine/notes/")), "no file or nested folder under it is a unit of its own");
    assert.equal(plan.units.find((u) => u.name === "mine/README.md")?.choice, "ours", "a file beside it is its own unit");
    const drafts = plan.units.find((u) => u.name === "mine/drafts/");
    assert.equal(drafts?.choice, "conflict", "a meta.yaml on one side makes the folder one unit on both");
    assert.deepEqual(drafts?.paths, ["mine/drafts/b.md", "mine/drafts/meta.yaml"]);
    assert.ok(!plan.units.some((u) => u.name === "mine/drafts/b.md"), "the edited file is no unit of its own");
    merge(clone);
    await assert.rejects(() => selectStorageMerge(home, key, { "mine/notes/meta.yaml": "ours" }), /unknown storage unit/);
    await selectStorageMerge(home, key, { "mine/notes/": "theirs", "mine/drafts/": "ours" });
    assert.equal(readFileSync(join(clone, "mine", "drafts", "b.md"), "utf8"), "base", "this device's folder whole: its b.md unchanged here");
    assert.equal(readFileSync(join(clone, "mine", "drafts", "meta.yaml"), "utf8"), "ours");
    assert.equal(readFileSync(join(clone, "mine", "notes", "meta.yaml"), "utf8"), "base", "the host's folder whole: its meta.yaml unchanged there");
    assert.equal(readFileSync(join(clone, "mine", "notes", "skills", "en", "notes", "SKILL.md"), "utf8"), "theirs");
    assert.equal(readFileSync(join(clone, "mine", "notes", "skills", "en", "notes", "extra.md"), "utf8"), "theirs");
    assert.equal(readFileSync(join(clone, "mine", "README.md"), "utf8"), "ours");
    assert.equal(git(clone, "diff", "--name-only", "--diff-filter=U"), "");
  } finally { dispose(); }
});

test("storage-16: real Git branches forced to track a meta.yaml under packages/, a folder the catalog ignores, plan each file there as its own unit", async () => {
  const { clone, commit, dispose } = setup();
  const write = (path: string, text: string): void => { mkdirSync(dirname(join(clone, path)), { recursive: true }); writeFileSync(join(clone, path), text); };
  // The clone's Git rules ignore `packages/`: each side forces its files in.
  const forced = (message: string): void => { git(clone, "add", "-f", "--", "packages/acme/kit"); commit(message); };
  try {
    write("packages/acme/kit/meta.yaml", "base"); write("packages/acme/kit/x.md", "base"); forced("base");
    git(clone, "branch", "other");
    write("packages/acme/kit/meta.yaml", "ours"); forced("ours");
    git(clone, "checkout", "-q", "other");
    write("packages/acme/kit/x.md", "theirs"); forced("theirs");
    git(clone, "checkout", "-q", "spex");
    assert.deepEqual(git(clone, "ls-tree", "-r", "--name-only", "other", "--", "packages").split("\n"), ["packages/acme/kit/meta.yaml", "packages/acme/kit/x.md"], "Git tracks both files");
    const plan = planStorageMerge(clone, "HEAD", "other");
    assert.ok(!plan.units.some((u) => u.name === "packages/acme/kit/"), "a meta.yaml under packages/ forms no unit");
    assert.deepEqual(plan.units.filter((u) => u.name.startsWith("packages/")).map((u) => [u.name, u.choice]),
      [["packages/acme/kit/meta.yaml", "ours"], ["packages/acme/kit/x.md", "theirs"]], "each file there is its own unit");
  } finally { dispose(); }
});

test("storage-11, storage-12, storage-41: a placement file is one unit chosen whole and a meta.yaml under placements/ forms no unit; the validator reports a placement file not of its encoding, one named for another instance and a placements that is no folder, each blocking nothing", async () => {
  const { home, key, clone, commit, dispose } = setup();
  const write = (path: string, text: string): void => { mkdirSync(dirname(join(clone, path)), { recursive: true }); writeFileSync(join(clone, path), text); };
  const placed = (origin: string, id: string): string => `format: 1\ninstance: "${origin}"\nid: "${id}"\n`;
  const file = "placements/@a.example.yaml";
  try {
    write(file, placed("https://a.example", "1")); write("placements/kit/meta.yaml", "base"); write("placements/kit/x.md", "base"); commit("base");
    git(clone, "branch", "other");
    write(file, placed("https://a.example", "2")); write("placements/kit/meta.yaml", "ours"); commit("ours");
    git(clone, "checkout", "-q", "other");
    write(file, placed("https://a.example", "3")); write("placements/kit/x.md", "theirs"); commit("theirs");
    git(clone, "checkout", "-q", "spex");
    const plan = planStorageMerge(clone, "HEAD", "other");
    const unit = plan.units.find((u) => u.name === file);
    assert.deepEqual([unit?.choice, unit?.paths], ["conflict", [file]], "each placement file its own unit");
    assert.ok(!plan.units.some((u) => u.name === "placements/kit/"), "a meta.yaml under placements/ forms no unit");
    assert.deepEqual(plan.units.filter((u) => u.name.startsWith("placements/kit/")).map((u) => [u.name, u.choice]),
      [["placements/kit/meta.yaml", "ours"], ["placements/kit/x.md", "theirs"]], "each file there is its own unit");
    merge(clone);
    await selectStorageMerge(home, key, { [file]: "theirs" });
    assert.equal(readFileSync(join(clone, file), "utf8"), placed("https://a.example", "3"));
    assert.equal(git(clone, "diff", "--name-only", "--diff-filter=U"), "");

    // A file not of its encoding, and one named for another instance than
    // the one it names, name no placement and block nothing (storage-12).
    write("placements/@b.example.yaml", placed("https://c.example", "4"));
    write("placements/@d.example.yaml", "format: 1\n");
    const reported = async (): Promise<unknown[]> => (await validateStorageTree(clone)).filter((d) => d.file.startsWith("placements")).map((d) => [d.file, d.reason, d.blocking]);
    assert.deepEqual(await reported(), [
      ["placements/@b.example.yaml", "its name is not the folder of the instance it names", false],
      ["placements/@d.example.yaml", "does not read as format: 1, instance and id, one line each", false],
    ]);
    rmSync(join(clone, "placements"), { recursive: true });
    writeFileSync(join(clone, "placements"), "not a folder");
    assert.deepEqual(await reported(), [["placements", "not a folder of placement files", false]]);
  } finally { dispose(); }
});

test("storage-16: through the documented entry point, a clone placed at two instances is planned and selected against each placement's remote in turn, the second against the first's merge, each placement file its own unit and one that does not read reported without blocking, and the push to the first again a fast-forward", async () => {
  const { root, home, key, clone, commit, dispose } = setup();
  const write = (dir: string, path: string, text: string): void => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); };
  const placed = (origin: string, id: string): string => `format: 1\ninstance: "${origin}"\nid: "${id}"\n`;
  const unitsOf = (plan: { units: { name: string; choice: string; paths: string[] }[] }, names: string[]) =>
    Object.fromEntries(names.map((name) => { const unit = plan.units.find((u) => u.name === name); return [name, unit && [unit.choice, unit.paths]]; }));
  const unreadable = { file: "placements/@d.example.yaml", reason: "does not read as format: 1, instance and id, one line each", blocking: false };
  try {
    // Two placements, in the order added: each a remote named by its
    // instance's folder with the host's id in its own section, and each
    // named in its own placement file, both holding the same `spex`.
    const bare = { a: join(root, "a.git"), b: join(root, "b.git") };
    for (const dir of [bare.a, bare.b]) execFileSync("git", ["init", "-q", "--bare", dir], { env: gitEnv, stdio: "pipe" });
    const edited = randomUUID(); writeIntent(clone, edited, "base");
    writeFileSync(join(clone, "notes.md"), "base\n");
    write(clone, "placements/@a.example.yaml", placed("https://a.example", "100"));
    write(clone, "placements/@b.example.yaml", placed("https://b.example", "200"));
    commit("placed at both");
    const base = git(clone, "rev-parse", "HEAD");
    for (const [name, dir, id] of [["@a.example", bare.a, "100"], ["@b.example", bare.b, "200"]]) {
      git(clone, "remote", "add", name, dir); git(clone, "config", `remote.${name}.spexId`, id);
      git(clone, "push", "-q", name, "spex");
    }
    // The documented listing names the placements in the order added.
    assert.deepEqual(git(clone, "config", "--get-regexp", "^remote\\..*\\.url$").split("\n").map((line) => line.split(" ")[0]),
      ["remote.@a.example.url", "remote.@b.example.url"]);

    // A peer at each instance edits the intent this device edits too;
    // the first's also places the records at a third instance, and the
    // second's changes the notes and adds a placement file that does not
    // read.
    const peer = (name: string, from: string, change: (dir: string) => void): void => {
      const dir = join(root, name);
      execFileSync("git", ["clone", "-q", "--branch", "spex", from, dir], { env: gitEnv, stdio: "pipe" });
      change(dir);
      git(dir, "add", "-A", "--", "."); git(dir, "commit", "-q", "-m", name); git(dir, "push", "-q", "origin", "spex");
    };
    peer("peer-a", bare.a, (dir) => { writeIntent(dir, edited, "from the first"); write(dir, "placements/@c.example.yaml", placed("https://c.example", "300")); });
    peer("peer-b", bare.b, (dir) => { writeIntent(dir, edited, "from the second"); writeFileSync(join(dir, "notes.md"), "the second's\n"); write(dir, unreadable.file, "format: 1\n"); });
    writeIntent(clone, edited, "ours"); commit("saved");
    const saved = git(clone, "rev-parse", "HEAD");
    const files = ["placements/@a.example.yaml", "placements/@b.example.yaml", "placements/@c.example.yaml", unreadable.file];
    const names = [`intents/${edited}`, "notes.md", ...files];

    // The first placement: its remote's `spex` fetched and planned with
    // neither the index nor the files changed (storage-20), each placement
    // file one unit of its one path (storage-11).
    git(clone, "fetch", "-q", "@a.example");
    const indexBefore = git(clone, "ls-files", "-s"); const filesBefore = snapshot(clone);
    const first = cli(home, key, "plan", "HEAD", "@a.example/spex");
    assert.deepEqual([first.ours, first.theirs, first.base], [saved, git(clone, "rev-parse", "refs/remotes/@a.example/spex"), base]);
    assert.deepEqual(unitsOf(first, names), {
      [`intents/${edited}`]: ["conflict", [`intents/${edited}.json`]],
      "notes.md": ["ours", ["notes.md"]],
      [files[0]]: ["ours", [files[0]]],
      [files[1]]: ["ours", [files[1]]],
      [files[2]]: ["theirs", [files[2]]],
      [files[3]]: undefined,
    });
    assert.equal(git(clone, "ls-files", "-s"), indexBefore, "plan leaves the index");
    assert.deepEqual(snapshot(clone), filesBefore, "plan leaves the files");
    // Merged, selected (storage-21), committed and pushed there.
    merge(clone, "@a.example/spex");
    const firstSelected = cli(home, key, "select", `intents/${edited}=theirs`);
    assert.deepEqual(firstSelected.diagnostics, []);
    git(clone, "commit", "-q", "-m", "merge the first placement");
    const firstMerge = git(clone, "rev-parse", "HEAD");
    assert.deepEqual(git(clone, "log", "-1", "--format=%P").split(" "), [saved, first.theirs]);
    assert.equal(readFileSync(join(clone, files[2]), "utf8"), placed("https://c.example", "300"));
    git(clone, "push", "-q", "@a.example", "spex");
    assert.equal(git(bare.a, "rev-parse", "spex"), firstMerge);

    // The second placement, planned against `spex` as the first's merge
    // left it: the intent that merge took from the first is ours now,
    // in conflict with the second's.
    git(clone, "fetch", "-q", "@b.example");
    const second = cli(home, key, "plan", "HEAD", "@b.example/spex");
    assert.deepEqual([second.ours, second.theirs, second.base], [firstMerge, git(clone, "rev-parse", "refs/remotes/@b.example/spex"), base]);
    assert.deepEqual(unitsOf(second, names), {
      [`intents/${edited}`]: ["conflict", [`intents/${edited}.json`]],
      "notes.md": ["theirs", ["notes.md"]],
      [files[0]]: ["ours", [files[0]]],
      [files[1]]: ["ours", [files[1]]],
      [files[2]]: ["ours", [files[2]]],
      [files[3]]: ["theirs", [files[3]]],
    });
    merge(clone, "@b.example/spex");
    // A placement file that does not read blocks no selection; the
    // validation reports it (storage-12).
    const secondSelected = cli(home, key, "select", `intents/${edited}=theirs`);
    assert.deepEqual(secondSelected.diagnostics, [unreadable]);
    git(clone, "commit", "-q", "-m", "merge the second placement");
    const secondMerge = git(clone, "rev-parse", "HEAD");
    assert.deepEqual(git(clone, "log", "-1", "--format=%P").split(" "), [firstMerge, second.theirs]);
    assert.equal(intentText(clone, edited), "from the second");
    assert.equal(readFileSync(join(clone, "notes.md"), "utf8"), "the second's\n");
    git(clone, "push", "-q", "@b.example", "spex");

    // The first placement again: the second's merge descends from what
    // it holds, so the push is a fast-forward and both hold one `spex`.
    git(clone, "merge-base", "--is-ancestor", firstMerge, secondMerge);
    git(clone, "push", "-q", "@a.example", "spex");
    assert.deepEqual([git(bare.a, "rev-parse", "spex"), git(bare.b, "rev-parse", "spex")], [secondMerge, secondMerge]);

    // validate reports the file that does not read and blocks nothing,
    // changing nothing (storage-22).
    const settled = snapshot(clone); const settledIndex = git(clone, "ls-files", "-s");
    assert.deepEqual(cli(home, key, "validate"), [unreadable]);
    assert.deepEqual(snapshot(clone), settled); assert.equal(git(clone, "ls-files", "-s"), settledIndex);
  } finally { dispose(); }
});

test("storage-16: through the apply seam, a file added under a spec package folder since the Save refuses the folder's replacement, that file kept", async () => {
  const { clone, commit, dispose } = setup();
  const skill = join(clone, "mine", "notes", "skills", "en", "notes", "SKILL.md");
  try {
    mkdirSync(dirname(skill), { recursive: true });
    writeFileSync(join(clone, "mine", "notes", "meta.yaml"), "base"); writeFileSync(skill, "base"); commit("base");
    const ours = git(clone, "rev-parse", "HEAD");
    git(clone, "checkout", "-q", "-b", "other"); writeFileSync(skill, "theirs"); commit("theirs"); const theirs = git(clone, "rev-parse", "HEAD");
    git(clone, "checkout", "-q", "spex");
    const plan = planStorageMerge(clone, ours, theirs);
    assert.equal(plan.units.find((u) => u.name === "mine/notes/")?.choice, "theirs");
    const added = join(clone, "mine", "notes", "skills", "en", "notes", "draft.md");
    writeFileSync(added, "mine since the Save");
    await assert.rejects(() => applyStorageSelection(clone, plan, {}), (error: StorageWriteRefused) =>
      error instanceof StorageWriteRefused && error.reason === "changed" && error.unit === "mine/notes/" && /draft\.md changed since it was read/.test(error.message));
    assert.equal(readFileSync(added, "utf8"), "mine since the Save");
    assert.equal(readFileSync(skill, "utf8"), "base");
    rmSync(added);
    await applyStorageSelection(clone, plan, {});
    assert.equal(readFileSync(skill, "utf8"), "theirs", "the folder taken whole once nothing stands beside its files");
  } finally { dispose(); }
});

test("storage-16: Apply refuses unsafe destination parents before overwrites, creations and deletions", async (t) => {
  for (const kind of ["overwrite", "create", "delete", "non-directory"] as const) await t.test(kind, async () => {
    const { root, clone, commit, dispose } = setup();
    try {
      const file = kind === "create" ? "docs/missing/new.txt" : "docs/notes.txt";
      mkdirSync(join(clone, "docs"));
      writeFileSync(join(clone, "docs", "keep.txt"), "unchanged\n");
      if (kind !== "create") writeFileSync(join(clone, file), "base\n");
      commit("base destination");
      git(clone, "checkout", "-q", "-b", "other");
      if (kind === "delete") rmSync(join(clone, file));
      else { mkdirSync(dirname(join(clone, file)), { recursive: true }); writeFileSync(join(clone, file), "incoming\n"); }
      commit("incoming destination");
      git(clone, "checkout", "-q", "spex");
      const plan = planStorageMerge(clone, "HEAD", "other");
      const head = git(clone, "rev-parse", "HEAD"); const index = git(clone, "ls-files", "-s");
      const outside = join(root, "outside"); mkdirSync(outside);
      writeFileSync(join(outside, "keep.txt"), "unchanged\n");
      if (kind !== "create") writeFileSync(join(outside, "notes.txt"), "base\n");
      const before = snapshot(outside);
      // It was safe during Save and the initial pending-unit read. A
      // different hand replaces only the parent at the Apply boundary.
      await assert.rejects(() => applyStorageSelection(clone, plan, {}, { beforeWrite: () => {
        renameSync(join(clone, "docs"), join(root, "preserved-docs"));
        if (kind === "non-directory") writeFileSync(join(clone, "docs"), "not a directory\n");
        else symlinkSync(outside, join(clone, "docs"), "dir");
      } }), (error: unknown) => error instanceof StorageFormatError && /unsafe destination/.test(error.reason));
      assert.deepEqual(snapshot(outside), before, "no external file changed or was created/deleted");
      assert.equal(git(clone, "rev-parse", "HEAD"), head);
      assert.equal(git(clone, "ls-files", "-s"), index);
    } finally { dispose(); }
  });
});

test("storage-16: a safe missing destination tail is created without following a parent", async () => {
  const { clone, commit, dispose } = setup();
  try {
    git(clone, "checkout", "-q", "-b", "other");
    mkdirSync(join(clone, "new", "nested"), { recursive: true });
    writeFileSync(join(clone, "new", "nested", "note.txt"), "incoming\n"); commit("incoming new tail");
    git(clone, "checkout", "-q", "spex");
    await applyStorageSelection(clone, planStorageMerge(clone, "HEAD", "other"), {});
    assert.equal(readFileSync(join(clone, "new", "nested", "note.txt"), "utf8"), "incoming\n");
  } finally { dispose(); }
});

test("storage-16: a session parent is checked before lease acquisition and again after its await", async (t) => {
  for (const at of ["before lease", "after lease"] as const) await t.test(at, async () => {
    const { root, clone, sessionId, bundle, commit, dispose } = setup();
    try {
      const assets = createAssetStore({ directory: join(clone, "sessions", `${sessionId}.assets`) });
      const media = async (label: string) => {
        await assets.prepare();
        const asset = await assets.importAsset({ bytes: Buffer.from(label), mimeType: "image/png", name: `${label}.png` });
        const file = join(clone, "sessions", `${sessionId}.json`); const manifest = JSON.parse(readFileSync(file, "utf8"));
        manifest.assets = { version: 1, entries: [asset] }; writeFileSync(file, JSON.stringify(manifest));
      };
      await media("base"); commit("base session media");
      git(clone, "checkout", "-q", "-b", "other"); bundle("incoming"); await media("incoming"); commit("incoming session");
      git(clone, "checkout", "-q", "spex");
      const plan = planStorageMerge(clone, "HEAD", "other"); const index = git(clone, "ls-files", "-s");
      const sessions = createSessionStore({ sessionsDir: join(clone, "sessions") }); await sessions.prepare();
      const outside = join(root, "outside-sessions");
      const swap = () => { renameSync(join(clone, "sessions"), outside); symlinkSync(outside, join(clone, "sessions"), "dir"); };
      const before = snapshot(join(clone, "sessions")); let acquisitions = 0;
      const wrapped = { acquireManagement: async (id: string) => {
        acquisitions += 1;
        const lease = await sessions.acquireManagement(id);
        if (at === "after lease") swap();
        return lease;
      } };
      await assert.rejects(() => applyStorageSelection(clone, plan, {}, {
        sessions: wrapped, ...(at === "before lease" ? { beforeWrite: swap } : {}),
      }), (error: unknown) => error instanceof StorageFormatError && /unsafe destination/.test(error.reason));
      assert.equal(acquisitions, at === "before lease" ? 0 : 1);
      assert.deepEqual(snapshot(outside), before, "session records stay unchanged outside the clone");
      assert.equal(git(clone, "ls-files", "-s"), index);
      assert.ok(existsSync(join(outside, `${sessionId}.json`)));
    } finally { dispose(); }
  });
});

test("storage-16: completed session selection cannot clear hints through a replaced parent", async () => {
  const { root, clone, sessionId, bundle, commit, dispose } = setup();
  try {
    git(clone, "checkout", "-q", "-b", "other"); bundle("incoming"); commit("incoming session");
    const incoming = git(clone, "rev-parse", "HEAD"); git(clone, "checkout", "-q", "spex");
    const plan = planStorageMerge(clone, "HEAD", incoming); const index = git(clone, "ls-files", "-s");
    // An interrupted selection already wrote all selected bytes. There
    // is no pending unit/lease, but completion still clears its hint.
    for (const ext of ["json", "records.jsonl"]) writeFileSync(join(clone, "sessions", `${sessionId}.${ext}`), execFileSync("git", ["-C", clone, "show", `${incoming}:sessions/${sessionId}.${ext}`], { env: gitEnv }));
    writeFileSync(join(clone, "sessions", `${sessionId}.hints.json`), "synthetic local hint\n");
    const outside = join(root, "outside-hints");
    await assert.rejects(() => applyStorageSelection(clone, plan, {}, { beforeWrite: () => {
      renameSync(join(clone, "sessions"), outside); symlinkSync(outside, join(clone, "sessions"), "dir");
    } }), (error: unknown) => error instanceof StorageFormatError && /unsafe destination/.test(error.reason));
    assert.equal(readFileSync(join(outside, `${sessionId}.hints.json`), "utf8"), "synthetic local hint\n");
    assert.equal(git(clone, "ls-files", "-s"), index);
  } finally { dispose(); }
});

test("storage-16: unrelated histories refuse selection until joined, whereupon the empty tree is the ancestor", async () => {
  const { root, home, key, clone, sessionId, dispose } = setup();
  try {
    const foreign = join(root, "foreign"); mkdirSync(foreign); git(foreign, "init", "-q", "-b", "spex");
    mkdirSync(join(foreign, "sessions"), { mode: 0o700 }); prepareStorageGitFiles(foreign);
    const otherId = randomUUID(); const records = `${JSON.stringify({ v: 1, seq: 1, record: { futureKind: "foreign" } })}\n`;
    writeFileSync(join(foreign, "sessions", `${otherId}.records.jsonl`), records, { mode: 0o600 });
    writeFileSync(join(foreign, "sessions", `${otherId}.json`), JSON.stringify({ schemaVersion: 7, kind: "captain-session", sessionId: otherId, cwd: join(foreign, "project"), createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z", state: "history-only", reason: "foreign", replay: { seq: 1, sha256: sha256(records), incomplete: false }, contextSeq: null }, null, 2), { mode: 0o600 });
    writeFileSync(join(foreign, "project.json"), JSON.stringify({ format: 1, name: "Foreign", remote: null }));
    git(foreign, "add", "."); git(foreign, "commit", "-q", "-m", "foreign base");
    git(clone, "fetch", "-q", foreign, "spex:refs/remotes/origin/spex");
    // The tool reports the revisions unrelated and refuses to select (storage-20, storage-21).
    const reported = cli(home, key, "plan", "HEAD", "refs/remotes/origin/spex");
    assert.equal(reported.unrelated, true); assert.equal(reported.base, null); assert.deepEqual(reported.units, []);
    const refused = planStorageMerge(clone, "HEAD", "refs/remotes/origin/spex");
    assert.equal(refused.unrelated, true); assert.equal(refused.base, null); assert.deepEqual(refused.units, []);
    const joined = planStorageMerge(clone, "HEAD", "refs/remotes/origin/spex", { join: true });
    assert.equal(joined.unrelated, true); assert.equal(joined.base, EMPTY_TREE);
    assert.equal(joined.units.find((u) => u.name === `sessions/${sessionId}`)?.choice, "ours");
    assert.equal(joined.units.find((u) => u.name === `sessions/${otherId}`)?.choice, "theirs");
    assert.equal(joined.units.find((u) => u.name === "project.json")?.choice, "conflict", "present on both sides differently");
    assert.equal(joined.units.find((u) => u.name === ".gitignore")?.choice, "ours", "identical rules agree");
    try { git(clone, "merge", "--no-commit", "--no-ff", "--allow-unrelated-histories", "refs/remotes/origin/spex"); } catch { /* conflicts are the subject */ }
    cliFails(home, key, ["select", "project.json=ours"], /no common ancestor/);
    await assert.rejects(() => selectStorageMerge(home, key, { "project.json": "ours" }), /no common ancestor/);
    const result = await selectStorageMerge(home, key, { "project.json": "ours" }, { join: true });
    assert.equal(result.plan.base, EMPTY_TREE);
    assert.equal(existsSync(join(clone, "sessions", `${otherId}.json`)), true);
    assert.equal(existsSync(join(clone, "sessions", `${sessionId}.json`)), true);
    assert.match(readFileSync(join(clone, "project.json"), "utf8"), /"name":"Project"/);
    assert.equal(git(clone, "diff", "--name-only", "--diff-filter=U"), "");
  } finally { dispose(); }
});

test("storage-16: the apply seam writes each changed unit under the version it read, a session's lease for that write alone, and stages the validated tree", async () => {
  const { home, key, clone, sessionId, bundle, commit, dispose } = setup();
  try {
    git(clone, "branch", "other");
    bundle("ours"); commit("ours"); const ours = git(clone, "rev-parse", "HEAD");
    git(clone, "checkout", "-q", "other"); bundle("theirs"); writeFileSync(join(clone, "notes.md"), "theirs\n"); commit("theirs"); const theirs = git(clone, "rev-parse", "HEAD");
    const theirsRecords = readFileSync(join(clone, "sessions", `${sessionId}.records.jsonl`), "utf8");
    git(clone, "checkout", "-q", "spex");
    const records = join(clone, "sessions", `${sessionId}.records.jsonl`);
    const oursRecords = readFileSync(records, "utf8");
    const plan = planStorageMerge(clone, ours, theirs);
    const choices = { [`sessions/${sessionId}`]: "theirs" as const };
    const store = createSessionStore({ sessionsDir: join(clone, "sessions") }); await store.prepare();
    const release = reserveStorageHome(home, machineIdentity);
    try {
      await assert.rejects(() => selectStorageMerge(home, key, choices), /stop the Spex core/);
      // A held lease refuses the session's write before any other unit,
      // sessions going first, and the index stays (storage-14).
      const held = await store.acquireManagement(sessionId);
      try {
        await assert.rejects(() => applyStorageSelection(clone, plan, choices), (error: StorageWriteRefused) =>
          error instanceof StorageWriteRefused && error.reason === "lease" && error.unit === `sessions/${sessionId}` && error.written.length === 0);
      } finally { await held.release(); }
      assert.equal(readFileSync(records, "utf8"), oursRecords);
      assert.equal(existsSync(join(clone, "notes.md")), false, "nothing after the refused session is written");
      assert.equal(git(clone, "diff", "--cached", "--name-only"), "");
      // A writer appending just before the lease is granted — after the
      // candidate validated, the last await before the write — has its
      // change refused over and kept, and the lease goes with the refusal.
      const appendFirst = { acquireManagement: (id: string) => { writeFileSync(records, `${oursRecords}{"appended":true}\n`); return store.acquireManagement(id); } };
      await assert.rejects(() => applyStorageSelection(clone, plan, choices, { sessions: appendFirst }), (error: StorageWriteRefused) => error instanceof StorageWriteRefused && error.reason === "changed");
      assert.match(readFileSync(records, "utf8"), /appended/);
      await (await store.acquireManagement(sessionId)).release();
      writeFileSync(records, oursRecords);
      let marked = false;
      const applied = await applyStorageSelection(clone, plan, choices, { beforeWrite: () => { marked = true; } });
      assert.ok(marked, "the caller's marker runs before the first write");
      assert.deepEqual(applied.changedSessions, [`sessions/${sessionId}`]);
      assert.deepEqual(applied.written, [`sessions/${sessionId}`, "notes.md"], "sessions first");
      assert.equal(applied.selected.get(`sessions/${sessionId}`), "theirs");
      assert.equal(applied.tree, git(clone, "rev-parse", `${theirs}^{tree}`));
      // The lease was the write's alone.
      await (await store.acquireManagement(sessionId)).release();
    } finally { release(); }
    assert.equal(readFileSync(records, "utf8"), theirsRecords);
    assert.equal(git(clone, "write-tree"), git(clone, "rev-parse", `${theirs}^{tree}`), "the index holds the validated tree");
    assert.equal(git(clone, "rev-parse", "HEAD"), ours, "the seam commits nothing itself");
  } finally { dispose(); }
});

test("storage-16: through the apply seam, against an earlier placement's merge commit as a later placement's base, a file changed while its session's lease is awaited is refused with the change kept and the index unchanged, and the apply then stages the validated tree with the lease free", async () => {
  const { home, clone, sessionId, bundle, commit, dispose } = setup();
  try {
    git(clone, "branch", "first");
    git(clone, "branch", "second");
    // Each placement's `spex`: the first's adds a note, the second's
    // changes the session this device changed too.
    git(clone, "checkout", "-q", "first"); writeFileSync(join(clone, "first.md"), "the first's\n"); commit("first's");
    git(clone, "checkout", "-q", "second"); bundle("second's"); commit("second's");
    const second = git(clone, "rev-parse", "HEAD");
    const theirsRecords = readFileSync(join(clone, "sessions", `${sessionId}.records.jsonl`), "utf8");
    git(clone, "checkout", "-q", "spex"); bundle("ours"); commit("saved");
    // The first placement's merge, as a sync's Apply records it: `spex`
    // and the first's `spex` as parents.
    git(clone, "merge", "-q", "--no-ff", "--no-edit", "first");
    const firstMerge = git(clone, "rev-parse", "HEAD");
    assert.equal(git(clone, "log", "-1", "--format=%P", firstMerge).split(" ").length, 2);
    const records = join(clone, "sessions", `${sessionId}.records.jsonl`);
    const oursRecords = readFileSync(records, "utf8");
    const plan = planStorageMerge(clone, "HEAD", "second");
    assert.equal(plan.ours, firstMerge);
    const choices = { [`sessions/${sessionId}`]: "theirs" as const };
    const store = createSessionStore({ sessionsDir: join(clone, "sessions") }); await store.prepare();
    const index = git(clone, "ls-files", "-s");
    const release = reserveStorageHome(home, machineIdentity);
    try {
      // A writer appending just before the lease is granted has its change
      // refused over and kept, and the index stays (storage-14).
      const appendFirst = { acquireManagement: (id: string) => { writeFileSync(records, `${oursRecords}{"appended":true}\n`); return store.acquireManagement(id); } };
      await assert.rejects(() => applyStorageSelection(clone, plan, choices, { sessions: appendFirst }), (error: StorageWriteRefused) => error instanceof StorageWriteRefused && error.reason === "changed" && error.unit === `sessions/${sessionId}`);
      assert.match(readFileSync(records, "utf8"), /appended/);
      assert.equal(git(clone, "ls-files", "-s"), index, "the index stays");
      await (await store.acquireManagement(sessionId)).release();
      writeFileSync(records, oursRecords);
      // The selection on the first's merge stages its validated tree: the
      // first's note and this device's commit kept, the second's session
      // taken, and the session's lease the write's alone (storage-21).
      const applied = await applyStorageSelection(clone, plan, choices);
      assert.deepEqual(applied.written, [`sessions/${sessionId}`]);
      assert.equal(readFileSync(records, "utf8"), theirsRecords);
      assert.equal(git(clone, "write-tree"), applied.tree, "the index holds the validated tree");
      assert.equal(git(clone, "rev-parse", `${applied.tree}:first.md`), git(clone, "rev-parse", `${firstMerge}:first.md`));
      assert.equal(git(clone, "rev-parse", `${applied.tree}:sessions/${sessionId}.records.jsonl`), git(clone, "rev-parse", `${second}:sessions/${sessionId}.records.jsonl`));
      await (await store.acquireManagement(sessionId)).release();
    } finally { release(); }
    assert.equal(git(clone, "rev-parse", "HEAD"), firstMerge, "the seam commits nothing itself");
  } finally { dispose(); }
});

test("storage-16: under select, a unit changed after the apply read Git's merge output is refused and kept, and a clone moved or removed during a lease's await is never made anew", async () => {
  const { root, home, key, clone, sessionId, bundle, commit, dispose } = setup();
  try {
    git(clone, "branch", "other");
    bundle("ours"); commit("ours");
    git(clone, "checkout", "-q", "other"); bundle("theirs"); const fresh = randomUUID(); bundle("fresh", fresh); commit("theirs");
    git(clone, "checkout", "-q", "spex"); merge(clone);
    const records = join(clone, "sessions", `${sessionId}.records.jsonl`);
    const merged = readFileSync(records);
    assert.match(merged.toString(), /^<<<<<<< /m, "Git's merge output is the version select reads");
    const plan = planStorageMerge(clone, "HEAD", "MERGE_HEAD");
    const choices = { [`sessions/${sessionId}`]: "theirs" as const };
    const store = createSessionStore({ sessionsDir: join(clone, "sessions") });
    const release = reserveStorageHome(home, machineIdentity);
    try {
      // A writer changing the merged unit while its lease is awaited:
      // refused over, the change kept, the index as the merge left it (storage-21).
      const index = git(clone, "ls-files", "-s");
      const late = { acquireManagement: (id: string) => { writeFileSync(records, "late\n"); return store.acquireManagement(id); } };
      await assert.rejects(() => applyStorageSelection(clone, plan, choices, { workingTree: "merge", sessions: late }), (error: StorageWriteRefused) =>
        error instanceof StorageWriteRefused && error.reason === "changed" && error.unit === `sessions/${sessionId}`);
      assert.equal(readFileSync(records, "utf8"), "late\n");
      assert.equal(git(clone, "ls-files", "-s"), index);
      writeFileSync(records, merged);
      // The clone moved, then removed, while a lease is awaited: the
      // clone's own session store — the one the core opens — is asked as
      // the clone goes, the write is refused as moved, never as a lease,
      // and no folder is made where the clone was (space-19).
      const moved = join(root, "moved");
      const backup = join(root, "backup");
      const real = spexRepository(key, clone).store;
      const away = (gone: () => void) => ({ acquireManagement: async (id: string) => { gone(); return real.acquireManagement(id); } });
      const removed = (): void => { execFileSync("cp", ["-Rp", clone, backup]); rmSync(clone, { recursive: true, force: true }); };
      for (const gone of [() => renameSync(clone, moved), removed]) {
        await assert.rejects(() => applyStorageSelection(clone, plan, choices, { workingTree: "merge", sessions: away(gone) }), (error: StorageWriteRefused) => error instanceof StorageWriteRefused && error.reason === "moved");
        assert.equal(existsSync(clone), false, "the clone's old path stays absent");
        const kept = existsSync(moved) ? moved : backup;
        assert.deepEqual(readFileSync(join(kept, "sessions", `${sessionId}.records.jsonl`)), merged, "the clone elsewhere is untouched");
        renameSync(kept, clone);
      }
      // A successor standing at the same path with the same bytes, the
      // former clone kept alive elsewhere so no inode is reused: the lease
      // is taken in the successor, yet the write is refused as moved and
      // the successor keeps every byte.
      const successor = (): void => { renameSync(clone, moved); execFileSync("cp", ["-Rp", moved, clone]); };
      const before = snapshot(clone);
      const history = git(clone, "log", "--format=%H", "--all");
      const staged = git(clone, "ls-files", "-s");
      await assert.rejects(() => applyStorageSelection(clone, plan, choices, { workingTree: "merge", sessions: away(successor) }), (error: StorageWriteRefused) => error instanceof StorageWriteRefused && error.reason === "moved");
      // Its records and units keep every byte — the lease metadata the
      // acquisition leaves is no record — and its history and index stand.
      assert.deepEqual(snapshot(clone), before, "the successor's records and units are unchanged");
      assert.equal(git(clone, "log", "--format=%H", "--all"), history, "the successor's history is unchanged");
      assert.equal(git(clone, "ls-files", "-s"), staged, "the successor's index is unchanged");
      assert.deepEqual(readFileSync(join(moved, "sessions", `${sessionId}.records.jsonl`)), merged, "the former clone is untouched");
      await (await real.acquireManagement(sessionId)).release();
      rmSync(clone, { recursive: true, force: true });
      renameSync(moved, clone);
      // The clone moved once its lease is published: the write is refused
      // as moved, and the lease's release failing at the former path
      // replaces nothing.
      const published = { acquireManagement: async (id: string) => { const lease = await real.acquireManagement(id); renameSync(clone, moved); return lease; } };
      await assert.rejects(() => applyStorageSelection(clone, plan, choices, { workingTree: "merge", sessions: published }), (error: StorageWriteRefused) => error instanceof StorageWriteRefused && error.reason === "moved");
      assert.equal(existsSync(clone), false, "the release made nothing at the former path");
      assert.deepEqual(readFileSync(join(moved, "sessions", `${sessionId}.records.jsonl`)), merged);
    } finally { release(); }
  } finally { dispose(); }
});

test("storage-16: a unit's version is read as Git reads its path, so a clean CRLF checkout under core.autocrlf is no change", async () => {
  const { home, clone, commit, dispose } = setup();
  try {
    git(clone, "config", "core.autocrlf", "true");
    writeFileSync(join(clone, "notes.txt"), "base\n"); commit("notes");
    git(clone, "branch", "other");
    git(clone, "checkout", "-q", "other"); writeFileSync(join(clone, "notes.txt"), "theirs\n"); commit("theirs"); const theirs = git(clone, "rev-parse", "HEAD");
    git(clone, "checkout", "-q", "spex");
    assert.equal(readFileSync(join(clone, "notes.txt"), "utf8"), "base\r\n", "Git checked the file out with CRLF");
    assert.equal(git(clone, "status", "--porcelain"), "");
    const release = reserveStorageHome(home, machineIdentity);
    try {
      const applied = await applyStorageSelection(clone, planStorageMerge(clone, "HEAD", "other"), {});
      assert.deepEqual(applied.written, ["notes.txt"]);
    } finally { release(); }
    assert.equal(git(clone, "show", `${theirs}:notes.txt`), "theirs");
    assert.equal(readFileSync(join(clone, "notes.txt"), "utf8").replace(/\r/g, ""), "theirs\n");
  } finally { dispose(); }
});

test("storage-16: reopening a real ordinary-umask checkout tightens permissions and refuses altered replay bytes", async () => {
  const { root, clone, sessionId, dispose } = setup();
  try {
    const copy = join(root, "checkout"); const previous = process.umask(0o022);
    try { execFileSync("git", ["clone", "-q", "--branch", "spex", clone, copy], { env: gitEnv, stdio: "pipe" }); } finally { process.umask(previous); }
    const manifest = join(copy, "sessions", `${sessionId}.json`); assert.equal(statSync(manifest).mode & 0o777, 0o644);
    assert.deepEqual(await validateStorageTree(copy), []);
    assert.equal(statSync(manifest).mode & 0o777, 0o600); assert.equal(statSync(join(copy, "sessions")).mode & 0o777, 0o700);
    writeFileSync(join(copy, "sessions", `${sessionId}.records.jsonl`), '{"v":1,"seq":1,"record":{"futureKind":"tampered"}}\n');
    await assert.rejects(() => validateStorageTree(copy), /digest|checkpoint|replay/i);
  } finally { dispose(); }
});

test("storage-17: a clone's Git rules exclude hints, leases, staging, installed packages and every other device-local family", () => {
  const { clone, sessionId, dispose } = setup();
  try {
    const intent = randomUUID();
    for (const file of [
      `sessions/${sessionId}.hints.json`, `sessions/.${sessionId}.lock/owner.json`, `sessions/.${sessionId}.lock.retired.x/owner.json`,
      ".lock/owner.json", ".spex-apply.json", ".spex-uploads/x/y.png", "packages/demo/spex.yaml", "skills/demo/SKILL.md",
      "config/playbook.config.yaml.bak.2", "sessions/value.json.x.tmp", `sessions/${sessionId}.spex.json`,
    ]) {
      assert.equal(git(clone, "check-ignore", "--no-index", file), file);
    }
    for (const file of ["spex.lock", "spex.yaml", "project.json", "config/playbook.config.yaml", `intents/${intent}.json`, `intents/${intent}.assets/a`, "authoring/demo.json", `sessions/${sessionId}.json`]) {
      assert.throws(() => git(clone, "check-ignore", "--no-index", file), `${file} is shared`);
    }
    for (const line of git(clone, "check-attr", "text", "--", `sessions/${sessionId}.json`, `sessions/${sessionId}.records.jsonl`, `intents/${intent}.assets/a`, "authoring/demo.assets/a").split("\n")) {
      assert.match(line, /: text: unset$/, line);
    }
  } finally { dispose(); }
});

test("storage-17: the documented entry point operates on the chosen clone and protective Git rules override earlier exceptions", async () => {
  const { home, key, clone, sessionId, dispose } = setup();
  try {
    writeFileSync(join(clone, ".gitignore"), readFileSync(join(clone, ".gitignore"), "utf8") + "!*.hints.json\n!/packages/\n");
    writeFileSync(join(clone, ".gitattributes"), readFileSync(join(clone, ".gitattributes"), "utf8") + "sessions/*.json text\n");
    prepareStorageGitFiles(clone);
    assert.equal(git(clone, "check-ignore", "--no-index", `sessions/${sessionId}.hints.json`), `sessions/${sessionId}.hints.json`);
    assert.equal(git(clone, "check-ignore", "--no-index", "packages/x"), "packages/x");
    assert.match(git(clone, "check-attr", "text", "--", `sessions/${sessionId}.json`), /text: unset/);
    const plan = cli(home, key, "plan", "HEAD", "HEAD");
    assert.equal(plan.units.find((unit: { name: string }) => unit.name === `sessions/${sessionId}`).choice, "ours");
    assert.deepEqual(cli(home, key, "validate"), []);
    cliFails(home, key, ["plan", "HEAD"], /Usage/);
    // A key naming no clone, or leading outside the workspace, is refused (storage-10).
    cliFails(home, "tester/absent-spex", ["validate"], /no spex repository tester\/absent-spex/);
    cliFails(home, "../../escape-spex", ["validate"], /no spex repository/);
  } finally { dispose(); }
});

test("storage-16: unknown session versions stay local and cannot enter a selected portable tree", async () => {
  const { clone, project, dispose } = setup();
  try {
    const id = randomUUID();
    const file = `sessions/${id}.json`;
    const bytes = JSON.stringify({ schemaVersion: 99, sessionId: id, cwd: project.path, future: "opaque" });
    writeFileSync(join(clone, file), bytes, { mode: 0o600 });
    writeFileSync(join(clone, "sessions", `${id}.records.jsonl`), '{"v":1,"seq":1,"record":{}}\n', { mode: 0o600 });
    prepareStorageGitFiles(clone, [file, `sessions/${id}.records.jsonl`]);
    assert.ok((await validateStorageTree(clone)).some((entry) => entry.reason.includes("retained locally")));
    assert.equal(readFileSync(join(clone, file), "utf8"), bytes);
    await assert.rejects(() => validateStorageTree(clone, { selectedSessionIds: new Set([id]) }), /unsupported session version/);
    git(clone, "add", "-f", file);
    await assert.rejects(() => validateStorageTree(clone), /unsupported session version/);
  } finally { dispose(); }
});

test("storage-16: Git validation refuses a dispatch outside its session's turns, and reopening leaves the file and its project as they are", async () => {
  const { home, key, clone, project, sessionId, dispose } = setup({ second: true });
  const intentId = randomUUID();
  const manifestPath = join(clone, "sessions", `${sessionId}.json`);
  const streamPath = join(clone, "sessions", `${sessionId}.records.jsonl`);
  const intentPath = join(clone, "intents", `${intentId}.json`);
  const bundle = () => {
    const records = JSON.stringify({ v: 1, seq: 1, record: { type: "turn_started", timestamp: 1, turnId: 1, turn: { id: 1, prompt: "Work" } } }) + "\n";
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    writeFileSync(streamPath, records);
    writeFileSync(manifestPath, JSON.stringify({ ...manifest, cwd: project.path, replay: { seq: 1, sha256: sha256(records), incomplete: false } }));
  };
  const dispatch = (turnId: number) => writeIntent(clone, intentId, "Work", { dispatched: { sessionId, turnId, at: 1 } });
  const verify = async (valid: boolean) => {
    const before = readFileSync(intentPath);
    if (valid) assert.deepEqual(await validateStorageTree(clone), []);
    else await assert.rejects(() => validateStorageTree(clone), /invalid dispatch/);
    const store = new Store({ machineIdentity, dir: home, env: gitEnv });
    try {
      await store.initializeSessions();
      // An invalid intent file blocks that intent alone, never its project (storage-12).
      store.assertWritable({ projectId: key });
    } finally { store.close(); }
    assert.deepEqual(readFileSync(intentPath), before);
  };
  try {
    bundle(); dispatch(1); await verify(true);
    dispatch(2); await verify(false);
    rmSync(manifestPath); rmSync(streamPath); await verify(true);
  } finally { dispose(); }
});

test("storage-22: the rebind command pairs a clone no folder pairs, and every session it holds lists again", async () => {
  const { root, home, key, clone, folder, sessionId, dispose } = setup();
  try {
    const unpaired = Home.load(home); unpaired.unpair(key); unpaired.save();
    let store = new Store({ machineIdentity, dir: home, env: gitEnv });
    try {
      await store.initializeSessions();
      assert.equal(store.listSessions().length, 0, "a clone no folder pairs lists nothing");
      const repair = store.storageDiagnostics().find((d) => d.repair?.repository === key);
      assert.equal(repair?.repair?.kind, "repository");
      assert.deepEqual(repair?.repair?.directories, [folder]);
      assert.equal(repair?.repair?.sessions, 1);
    } finally { store.close(); }
    const checkout = join(root, "checkout"); mkdirSync(checkout); git(checkout, "init", "-q");
    const output = cli(home, key, "rebind", key, checkout, "--alias", folder);
    assert.equal(output.project.id, key); assert.equal(output.project.path, checkout); assert.deepEqual(output.diagnostics, []);
    store = new Store({ machineIdentity, dir: home, env: gitEnv });
    try { await store.initializeSessions(); assert.equal(store.listSessions()[0]?.id, sessionId); assert.equal(store.listSessions()[0]?.projectId, key); }
    finally { store.close(); }
    const before = readFileSync(join(home, "home.yaml")); const child = join(checkout, "child"); mkdirSync(child);
    cliFails(home, key, ["rebind", key, child], /not the root/);
    assert.deepEqual(readFileSync(join(home, "home.yaml")), before);
    const release = reserveStorageHome(home, machineIdentity);
    try { cliFails(home, key, ["rebind", key, checkout], /held|one core/); }
    finally { release(); }
    assert.ok(existsSync(clone));
  } finally { dispose(); }
});

test("storage-17: a clone's Git rules ignore a session Playbook has yet to accept, and drop the ignore once it validates", async () => {
  const { home, key, clone, sessionId, dispose } = setup();
  const file = join(clone, ".gitignore");
  const authorId = randomUUID(); const authored = `# Authored rule\n/sessions/${authorId}.json\n`;
  writeFileSync(file, authored + readFileSync(file, "utf8"));
  const manifestFile = join(clone, "sessions", `${sessionId}.json`); const valid = readFileSync(manifestFile);
  const future = { ...JSON.parse(valid.toString()), schemaVersion: 99 }; writeFileSync(manifestFile, JSON.stringify(future));
  const store = new Store({ machineIdentity, dir: home, env: gitEnv });
  try {
    await store.initializeSessions(); prepareStorageGitFiles(clone, store.untrackedSessionPaths(key));
    assert.deepEqual(store.untrackedSessionPaths(key).sort(), [`sessions/${sessionId}.json`, `sessions/${sessionId}.records.jsonl`]);
    assert.equal(git(clone, "check-ignore", "--no-index", `sessions/${sessionId}.json`), `sessions/${sessionId}.json`);
    writeFileSync(manifestFile, valid); await store.initializeSessions();
    prepareStorageGitFiles(clone, store.untrackedSessionPaths(key));
    assert.deepEqual(store.untrackedSessionPaths(key), []);
    assert.throws(() => git(clone, "check-ignore", "--no-index", `sessions/${sessionId}.json`));
    assert.throws(() => git(clone, "check-ignore", "--no-index", `sessions/${sessionId}.records.jsonl`));
    assert.equal(git(clone, "check-ignore", "--no-index", `sessions/${authorId}.json`), `sessions/${authorId}.json`);
    const after = readFileSync(file, "utf8"); assert.ok(after.startsWith(authored));
    assert.equal(after.split("# BEGIN Spex managed storage rules").length, 2, "one managed block, never accumulated");
    prepareStorageGitFiles(clone, []); assert.equal(readFileSync(file, "utf8"), after, "preparation is idempotent");
    git(clone, "add", "--", `sessions/${sessionId}.json`, `sessions/${sessionId}.records.jsonl`);
  } finally { store.close(); dispose(); }
});

test("storage-16: a config naming a playbook the environment lacks stays a nonblocking diagnostic whatever language the core speaks", async () => {
  const { home, dispose } = setup();
  const own = Home.load(home);
  const ownClone = own.clonePath(own.own());
  const config = join(ownClone, "config", "playbook.config.yaml");
  // The starter as Spex seeds it; the environment exports code from a
  // module that will not import (environments-9).
  const template = starterText(readFileSync(templatePath(), "utf8"));
  writeFileSync(config, template, { mode: 0o600 });
  const modules: PlaybookModules = { repository: own.own(), find: (id) => ({ module: id === "code" ? "@sublang/definitely-missing" : `@sublang/playbook/${id}/registry`, builtin: true }) };
  const configDiagnostic = async () => (await validateStorageTree(ownClone, { own: true, modules })).find((entry) => entry.file.endsWith(join("config", "playbook.config.yaml")));
  try {
    const english = await configDiagnostic();
    assert.ok(english); assert.equal(english.blocking, false); assert.match(english.reason, /failed to import/);
    // The kind, not the words, decides: a Chinese reason stays nonblocking.
    speak("zh");
    try {
      const chinese = await configDiagnostic();
      assert.ok(chinese); assert.equal(chinese.blocking, false);
      assert.doesNotMatch(chinese.reason, /failed to import/);
      assert.match(chinese.reason, /导入失败/);
    } finally { speak("en"); }
    // An entry no environment of the session exports.
    writeFileSync(config, `${template}\n`.replace(/^playbooks:\n/m, "playbooks:\n  absent-playbook:\n    roles:\n      coder: dev.coder\n"), { mode: 0o600 });
    const unavailable = await configDiagnostic();
    assert.ok(unavailable, "the missing playbook is reported"); assert.equal(unavailable.blocking, false);
  } finally { dispose(); }
});

test("storage-16: Git selects intent and session media as complete independently owned bundles", async () => {
  const { home, key, clone, sessionId, bundle, commit, dispose } = setup();
  const intentId = randomUUID();
  const intentFile = join(clone, "intents", `${intentId}.json`);
  const sessionAssets = createAssetStore({ directory: join(clone, "sessions", `${sessionId}.assets`) });
  const intentAssets = createAssetStore({ directory: join(clone, "intents", `${intentId}.assets`) });
  const write = async (label: string) => {
    bundle(label);
    await sessionAssets.prepare(); await intentAssets.prepare();
    const bytes = Buffer.from(`${label}: selected binary content\r\n`);
    const sessionAsset = await sessionAssets.importAsset({ bytes, mimeType: "image/png", name: `${label}.png` });
    const intentAsset = await intentAssets.importAsset({ bytes, mimeType: "image/png", name: `${label}.png` });
    const manifestPath = join(clone, "sessions", `${sessionId}.json`);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.assets = { version: 1, entries: [sessionAsset] };
    writeFileSync(manifestPath, JSON.stringify(manifest));
    writeIntent(clone, intentId, "", { attachments: [intentAsset] });
    return intentAsset;
  };
  try {
    git(clone, "branch", "other");
    const ours = await write("ours"); commit("ours media");
    git(clone, "checkout", "-q", "other");
    const theirs = await write("theirs"); commit("theirs media");
    git(clone, "checkout", "-q", "spex");
    const plan = planStorageMerge(clone, "HEAD", "other");
    const session = plan.units.find((unit) => unit.name === `sessions/${sessionId}`)!;
    const intent = plan.units.find((unit) => unit.name === `intents/${intentId}`)!;
    assert.equal(session.choice, "conflict"); assert.equal(intent.choice, "conflict");
    assert.ok(session.paths.length > 2 && session.paths.every((path) => path.startsWith(`sessions/${sessionId}.`)), JSON.stringify(session.paths));
    assert.ok(intent.paths.length > 1 && intent.paths.every((path) => path.startsWith(`intents/${intentId}.`)), JSON.stringify(intent.paths));
    assert.equal(plan.units.filter((unit) => unit.name.includes(".assets/")).length, 0);
    merge(clone);
    await selectStorageMerge(home, key, { [session.name]: "theirs", [intent.name]: "ours" });
    assert.deepEqual(await sessionAssets.readAsset(theirs), Buffer.from("theirs: selected binary content\r\n"));
    assert.deepEqual(await intentAssets.readAsset(ours), Buffer.from("ours: selected binary content\r\n"));
    assert.equal(existsSync(join(sessionAssets.directory, ours.assetId.slice(7))), false);
    assert.equal(existsSync(join(intentAssets.directory, theirs.assetId.slice(7))), false);
    assert.equal((JSON.parse(readFileSync(intentFile, "utf8")) as { attachments: { assetId: string }[] }).attachments[0].assetId, ours.assetId);
    assert.deepEqual(await validateStorageTree(clone), []);
    // An attachment the intent names must stand beside it.
    rmSync(join(intentAssets.directory, ours.assetId.slice(7)));
    await assert.rejects(validateStorageTree(clone), /content|ENOENT|asset/i);
  } finally { dispose(); }
});

test("storage-16: validation refuses unsafe read boundaries without changing the Git clone", async (t) => {
  const cases = [
    ["project.json", "leaf-link"], ["project.json", "directory-leaf"],
    ["intents", "parent-link"], ["intents", "file-parent"],
    ["intents/ID.json", "leaf-link"], ["intents/ID.json", "directory-leaf"],
    ["authoring", "parent-link"], ["authoring", "file-parent"],
    ["authoring/demo.json", "leaf-link"],
    ["config", "parent-link"], ["config", "file-parent"],
    ["config/playbook.config.yaml", "leaf-link"],
  ] as const;
  for (const [pattern, kind] of cases) await t.test(`${pattern}: ${kind}`, async () => {
    const s = setup();
    try {
      const path = pattern.replace("ID", randomUUID());
      const target = join(s.clone, path);
      const outside = join(s.root, "outside"); mkdirSync(outside);
      // Invalid owned canaries would yield a parser error if followed.
      const canary = join(outside, "canary");
      writeFileSync(canary, "{SYNTHETIC_OUTSIDE_VALIDATOR_CANARY", { mode: 0o640 });
      rmSync(target, { force: true, recursive: true });
      mkdirSync(dirname(target), { recursive: true });
      if (kind === "parent-link") {
        const name = path === "config" ? "playbook.config.yaml" : path === "authoring" ? "demo.json" : `${randomUUID()}.json`;
        writeFileSync(join(outside, name), readFileSync(canary), { mode: 0o640 });
        symlinkSync(outside, target, "dir");
      } else if (kind === "leaf-link") symlinkSync(canary, target, "file");
      else if (kind === "file-parent") writeFileSync(target, "not a directory", { mode: 0o640 });
      else mkdirSync(target);
      const before = snapshot(s.clone); const outsideBefore = snapshot(outside);
      const canaryMode = lstatSync(canary).mode;
      const modes = new Map([...before.keys()].map((p) => [p, lstatSync(join(s.clone, p)).mode]));
      const index = readFileSync(join(s.clone, ".git", "index"));
      await assert.rejects(validateStorageTree(s.clone), (error: unknown) => {
        if (!(error instanceof StorageDestinationRefused)) return false;
        assert.equal(error.file, path, "the repair target is the offending parent or leaf");
        if (path === "config" && kind === "file-parent") assert.equal(error.reason, "config is not a directory");
        return true;
      }, "an unsafe path must refuse before parsing an outside canary");
      assert.deepEqual(snapshot(s.clone), before); assert.deepEqual(snapshot(outside), outsideBefore);
      for (const [p, mode] of modes) assert.equal(lstatSync(join(s.clone, p)).mode, mode, p);
      assert.equal(lstatSync(canary).mode, canaryMode);
      assert.deepEqual(readFileSync(join(s.clone, ".git", "index")), index);
    } finally { s.dispose(); }
  });
  if (process.platform !== "win32") await t.test("a special-file leaf refuses without opening it", () => {
    const s = setup();
    try {
      rmSync(join(s.clone, "project.json"));
      execFileSync("mkfifo", [join(s.clone, "project.json")]);
      const result = spawnSync(process.execPath, [script, "--home", s.home, "--repository", s.key, "validate"],
        { env: gitEnv, encoding: "utf8", timeout: 5000 });
      assert.equal(result.error, undefined, "validation must not block opening a FIFO");
      assert.notEqual(result.status, 0); assert.match(result.stderr, /not a file/);
      assert.equal(lstatSync(join(s.clone, "project.json")).isFIFO(), true);
    } finally { s.dispose(); }
  });
});

test("storage-16: validation rechecks an intent parent after its awaited import", async () => {
  const s = setup();
  try {
    const outside = join(s.root, "outside"); mkdirSync(outside);
    const id = randomUUID();
    writeFileSync(join(outside, `${id}.json`), "{SYNTHETIC_LATE_VALIDATOR_CANARY", { mode: 0o640 });
    const index = readFileSync(join(s.clone, ".git", "index"));
    const canaryMode = lstatSync(join(outside, `${id}.json`)).mode;
    const running = validateStorageTree(s.clone);
    // Even a cached dynamic import yields before the next family read.
    renameSync(join(s.clone, "intents"), join(s.root, "saved-intents"));
    symlinkSync(outside, join(s.clone, "intents"), "dir");
    await assert.rejects(running, (error: unknown) => {
      if (!(error instanceof StorageDestinationRefused)) return false;
      assert.equal(error.file, "intents", "the late linked parent is the repair target");
      assert.equal(error.reason, "the path goes through a symbolic link");
      return true;
    });
    assert.equal(readFileSync(join(outside, `${id}.json`), "utf8"), "{SYNTHETIC_LATE_VALIDATOR_CANARY");
    assert.equal(lstatSync(join(outside, `${id}.json`)).mode, canaryMode);
    assert.deepEqual(readFileSync(join(s.clone, ".git", "index")), index);
  } finally { s.dispose(); }
});

test("storage-16: validation keeps optional absence and malformed-file diagnostics", async () => {
  const root = mkdtempSync(join(tmpdir(), "spex-validation-optional-"));
  try {
    git(root, "init", "-q");
    assert.deepEqual(await validateStorageTree(root), []);
    mkdirSync(join(root, "config"));
    writeFileSync(join(root, "config", "playbook.config.yaml"), "playbooks: [", { mode: 0o600 });
    await assert.rejects(validateStorageTree(root), (error: unknown) =>
      error instanceof StorageFormatError && !(error instanceof StorageDestinationRefused) && error.file.endsWith("playbook.config.yaml"));
    rmSync(join(root, "config"), { recursive: true });
    writeFileSync(join(root, "project.json"), "{malformed", { mode: 0o640 });
    const mode = lstatSync(join(root, "project.json")).mode;
    await assert.rejects(validateStorageTree(root), (error: unknown) =>
      error instanceof StorageFormatError && !(error instanceof StorageDestinationRefused) && error.file.endsWith("project.json"));
    assert.equal(readFileSync(join(root, "project.json"), "utf8"), "{malformed");
    assert.equal(lstatSync(join(root, "project.json")).mode, mode);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

/** Convert a deliberately legacy synthetic bundle through the public
 * migrator; no test duplicates the bounded format's encoder. */
async function boundedFixture(sessionsDir: string, sessionId: string): Promise<ReturnType<typeof createSessionStore>> {
  // Each branch is a separate fixture import. The migrator correctly
  // refuses replacing a prior migration's retained original input.
  const temporary = mkdtempSync(join(tmpdir(), "spex-bounded-fixture-"));
  const stage = join(temporary, "sessions"); mkdirSync(stage, { mode: 0o700 });
  try {
    for (const suffix of [".json", ".records.jsonl"]) writeFileSync(join(stage, `${sessionId}${suffix}`), readFileSync(join(sessionsDir, `${sessionId}${suffix}`)), { mode: 0o600 });
    const imported = createSessionStore({ sessionsDir: stage }); await imported.prepare();
    await imported.migrate(sessionId);
    const exported = await imported.exportBundle(sessionId);
    const files = (exported as typeof exported & { files: readonly { path: string; byteLength: number }[] }).files;
    for (const file of [...files].sort((a, b) => Number(a.path === `${sessionId}.json`) - Number(b.path === `${sessionId}.json`))) {
      mkdirSync(dirname(join(sessionsDir, file.path)), { recursive: true, mode: 0o700 });
      writeFileSync(join(sessionsDir, file.path), readFileSync(join(stage, file.path)), { mode: 0o600 });
    }
    rmSync(join(sessionsDir, `${sessionId}.records.jsonl`));
  } finally { rmSync(temporary, { recursive: true, force: true }); }
  const shared = createSessionStore({ sessionsDir }); await shared.prepare();
  const physical = JSON.parse(readFileSync(join(sessionsDir, `${sessionId}.json`), "utf8"));
  assert.equal(physical.schemaVersion, 8);
  assert.equal(physical.kind, "captain-session-storage");
  assert.equal((await shared.readManifest(sessionId)).schemaVersion, 7, "the semantic host API stays hydrated");
  return shared;
}

test("storage-16: bounded session roots, replay and immutable chunks are selected whole through the shared store", async () => {
  const { home, clone, sessionId, bundle, commit, dispose } = setup();
  const sessionsDir = join(clone, "sessions");
  const intentId = randomUUID();
  const runtime = { device: Home.load(home).device, label: "Captured runtime" };
  const intentPath = join(clone, "intents", `${intentId}.json`);
  const dispatchedBundle = (label: string, text: string): void => {
    bundle(label);
    const replayPath = join(sessionsDir, `${sessionId}.records.jsonl`);
    const replay = readFileSync(replayPath, "utf8") + [
      { v: 1, seq: 2, record: { type: "turn_started", turnId: 1, timestamp: 1, turn: { id: 1, prompt: text } } },
      { v: 1, seq: 3, record: { type: "turn_finished", turnId: 1, timestamp: 2 } },
    ].map((entry) => `${JSON.stringify(entry)}\n`).join("");
    writeFileSync(replayPath, replay, { mode: 0o600 });
    const manifestPath = join(sessionsDir, `${sessionId}.json`);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    writeFileSync(manifestPath, JSON.stringify({ ...manifest, replay: { seq: 3, sha256: sha256(replay), incomplete: false } }), { mode: 0o600 });
    writeIntent(clone, intentId, text, { format: 2, runtime, dispatched: { sessionId, turnId: 1, at: 1 } });
  };
  try {
    writeIntent(clone, intentId, "Captured intent", { format: 2, runtime });
    await boundedFixture(sessionsDir, sessionId); commit("bounded base");
    git(clone, "branch", "bounded-peer");
    dispatchedBundle("ours", "Our dispatched intent"); await boundedFixture(sessionsDir, sessionId); commit("ours");
    const ours = git(clone, "rev-parse", "HEAD");
    git(clone, "checkout", "-q", "bounded-peer");
    // Both recovery data and one replay record cross the physical-file
    // bound; the real migrator must preserve their complete values.
    const large = `incoming:${"x".repeat(9 * 1024 * 1024)}`;
    dispatchedBundle(large, "Peer's dispatched intent");
    const peer = await boundedFixture(sessionsDir, sessionId);
    commit("bounded peer");
    const incoming = git(clone, "rev-parse", "HEAD");
    const incomingIntent = readFileSync(intentPath);
    const exported = await peer.exportBundle(sessionId);
    const files = (exported as typeof exported & { files: readonly { path: string; byteLength: number }[] }).files;
    assert.ok(files.some((file) => file.path === `${sessionId}.replay.json`));
    assert.ok(files.some((file) => file.path.startsWith(`${sessionId}.chunks/`)));
    for (const file of files) assert.ok(file.byteLength <= 8 * 1024 * 1024, `${file.path} stays bounded`);
    assert.equal(existsSync(join(sessionsDir, `${sessionId}.records.jsonl`)), false);
    const incomingFiles = new Map(files.map((file) => [file.path, readFileSync(join(sessionsDir, file.path))]));
    git(clone, "checkout", "-q", "spex");
    const plan = planStorageMerge(clone, ours, incoming);
    const unit = plan.units.find((unit) => unit.name === `sessions/${sessionId}`)!;
    assert.equal(unit.choice, "conflict");
    assert.equal(plan.units.find((unit) => unit.name === `intents/${intentId}`)?.choice, "conflict");
    assert.ok(unit.paths.includes(`sessions/${sessionId}.replay.json`));
    assert.ok(unit.paths.some((path) => path.startsWith(`sessions/${sessionId}.chunks/`)));
    assert.equal(plan.units.some((unit) => unit.name.includes(".chunks/")), false, "a chunk is never a choice of its own");
    writeFileSync(join(sessionsDir, `${sessionId}.hints.json`), "synthetic stale hint\n", { mode: 0o600 });
    const release = reserveStorageHome(home, machineIdentity);
    try { await applyStorageSelection(clone, plan, { [`sessions/${sessionId}`]: "theirs", [`intents/${intentId}`]: "theirs" }); }
    finally { release(); }
    for (const [path, bytes] of incomingFiles) assert.deepEqual(readFileSync(join(sessionsDir, path)), bytes);
    assert.deepEqual(readFileSync(intentPath), incomingIntent, "selection preserves the format-2 intent and its frozen runtime byte for byte");
    assert.deepEqual(JSON.parse(incomingIntent.toString()).dispatched, { sessionId, turnId: 1, at: 1 });
    assert.equal(existsSync(join(sessionsDir, `${sessionId}.hints.json`)), false);
    const selected = createSessionStore({ sessionsDir });
    assert.equal((await selected.readManifest(sessionId) as { reason?: string }).reason, large);
    assert.equal((await selected.readHistory(sessionId)).entries[0].record.futureKind, large);
    assert.equal((await selected.validate(sessionId)).integrityValid, true);
    assert.equal(statSync(join(sessionsDir, `${sessionId}.chunks`)).mode & 0o777, 0o700);
    for (const file of files) assert.equal(statSync(join(sessionsDir, file.path)).mode & 0o777, 0o600);
    assert.equal(git(clone, "write-tree"), git(clone, "rev-parse", `${incoming}^{tree}`));
    const reopened = new Store({ machineIdentity, dir: home, own: "tester", env: gitEnv });
    try {
      assert.deepEqual(reopened.getIntent(intentId)?.runtime, runtime);
      reopened.editIntent(intentId, "Edited after selection");
      reopened.stampIntentDispatch(intentId, sessionId, 1, 3);
      reopened.closeIntent(intentId, "done", 4);
      const rewritten = JSON.parse(readFileSync(intentPath, "utf8"));
      assert.equal(rewritten.format, 2);
      assert.deepEqual(rewritten.runtime, runtime, "edit, dispatch and close preserve the runtime captured before Sync");
    } finally { reopened.close(); }
  } finally { dispose(); }
});

test("storage-16: a selected bounded session with a missing or corrupt chunk refuses before any live write", async (t) => {
  for (const damage of ["missing", "corrupt"] as const) await t.test(damage, async () => {
    const { clone, sessionId, bundle, commit, dispose } = setup();
    const sessionsDir = join(clone, "sessions");
    try {
      await boundedFixture(sessionsDir, sessionId); commit("bounded base");
      git(clone, "branch", "bounded-bad");
      bundle("ours"); await boundedFixture(sessionsDir, sessionId); commit("ours");
      git(clone, "checkout", "-q", "bounded-bad");
      bundle("incoming"); await boundedFixture(sessionsDir, sessionId);
      const root = JSON.parse(readFileSync(join(sessionsDir, `${sessionId}.json`), "utf8"));
      const chunk = join(sessionsDir, `${sessionId}.chunks`, root.root.sha256);
      if (damage === "missing") rmSync(chunk);
      else writeFileSync(chunk, "synthetic corrupt chunk\n", { mode: 0o600 });
      commit(`bounded ${damage}`);
      git(clone, "checkout", "-q", "spex");
      const plan = planStorageMerge(clone, "HEAD", "bounded-bad");
      const before = snapshot(clone);
      const index = git(clone, "write-tree");
      await assert.rejects(() => applyStorageSelection(clone, plan, { [`sessions/${sessionId}`]: "theirs" }), /chunk|digest|missing|ENOENT|content|hash/i);
      assert.deepEqual(snapshot(clone), before, "the live unit is unchanged");
      assert.equal(git(clone, "write-tree"), index, "the index is unchanged");
    } finally { dispose(); }
  });
});

test("storage-16: a chunk added while a bounded session's lease is awaited refuses replacement and stays local", async (t) => {
  for (const workingTree of ["ours", "merge"] as const) await t.test(workingTree, async () => {
  const { clone, sessionId, bundle, commit, dispose } = setup();
  const sessionsDir = join(clone, "sessions");
  try {
    await boundedFixture(sessionsDir, sessionId); commit("bounded base");
    git(clone, "branch", "bounded-peer");
    bundle("ours"); await boundedFixture(sessionsDir, sessionId); commit("ours");
    git(clone, "checkout", "-q", "bounded-peer");
    bundle("incoming"); await boundedFixture(sessionsDir, sessionId); commit("incoming");
    git(clone, "checkout", "-q", "spex");
    const shared = createSessionStore({ sessionsDir }); await shared.prepare();
    const plan = planStorageMerge(clone, "HEAD", "bounded-peer");
    const root = readFileSync(join(sessionsDir, `${sessionId}.json`));
    const index = git(clone, "write-tree");
    const bytes = Buffer.from("synthetic newly published immutable chunk\n");
    const { createSessionChunks } = await import(new URL("./bin/session-chunks.js", import.meta.resolve("@sublang/playbook/session-host")).href);
    const chunks = createSessionChunks({ directory: join(sessionsDir, `${sessionId}.chunks`) });
    let late = ""; let published: Buffer | undefined;
    const preexisting = workingTree === "merge" ? await chunks.writeBytes(Buffer.from("synthetic preexisting untracked chunk\n")) : undefined;
    const preexistingPath = preexisting ? join(sessionsDir, `${sessionId}.chunks`, preexisting.sha256) : undefined;
    const preexistingBytes = preexistingPath ? readFileSync(preexistingPath) : undefined;
    await assert.rejects(() => applyStorageSelection(clone, plan, { [`sessions/${sessionId}`]: "theirs" }, {
      workingTree,
      sessions: { acquireManagement: async (id) => {
        const ref = await chunks.writeBytes(bytes);
        late = join(sessionsDir, `${sessionId}.chunks`, ref.sha256);
        published = readFileSync(late);
        return shared.acquireManagement(id);
      } },
    }), (error: StorageWriteRefused) => error instanceof StorageWriteRefused && error.reason === "changed" && error.unit === `sessions/${sessionId}` && error.written.length === 0);
    assert.deepEqual(readFileSync(late), published);
    if (preexistingPath) assert.deepEqual(readFileSync(preexistingPath), preexistingBytes);
    assert.deepEqual(readFileSync(join(sessionsDir, `${sessionId}.json`)), root);
    assert.equal(git(clone, "write-tree"), index);
    await (await shared.acquireManagement(sessionId)).release();
    if (workingTree === "merge") {
      rmSync(late);
      await applyStorageSelection(clone, plan, { [`sessions/${sessionId}`]: "theirs" }, { workingTree });
      assert.deepEqual(readFileSync(preexistingPath!), preexistingBytes, "preexisting untracked chunks remain local");
    }
  } finally { dispose(); }
  });
});

test("storage-16: snapshot validation refuses orphan bounded replay and chunks without changing live files or index", async (t) => {
  for (const orphan of ["replay", "chunks", "both"] as const) await t.test(orphan, async () => {
    const { clone, sessionId, commit, dispose } = setup();
    const sessionsDir = join(clone, "sessions");
    try {
      await boundedFixture(sessionsDir, sessionId);
      rmSync(join(sessionsDir, `${sessionId}.json`));
      if (orphan === "replay") rmSync(join(sessionsDir, `${sessionId}.chunks`), { recursive: true });
      if (orphan === "chunks") rmSync(join(sessionsDir, `${sessionId}.replay.json`));
      commit(`orphan ${orphan}`);
      const tree = git(clone, "write-tree"); const before = snapshot(clone);
      await assert.rejects(() => validateStorageSnapshot(clone, tree), /session bundle root is missing/);
      assert.equal(git(clone, "write-tree"), tree);
      assert.deepEqual(snapshot(clone), before);
    } finally { dispose(); }
  });
});
