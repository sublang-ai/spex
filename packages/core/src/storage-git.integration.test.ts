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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSessionStore } from "@sublang/playbook/session-store";
import { Store } from "./store.js";
import { sha256 } from "./app-storage.js";
import { Home } from "./home.js";
import { starterText, templatePath, type PlaybookModules } from "./config.js";
import { speak } from "./i18n.js";
import type { ProjectInfo } from "./protocol.js";
import { applyStorageSelection, EMPTY_TREE, planStorageMerge, prepareStorageGitFiles, reserveStorageHome, selectStorageMerge as selectStorageMergeWith, validateStorageTree, type StorageChoice } from "./storage-git.js";
import { scratchDir } from "./testing/scratch.js";

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
    // every mutating command; a session lease in this clone refuses
    // selection, while one in another spex repository's own store does not.
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
    try { cliFails(home, key, ["select", ...complete], /held|owner|active|lease/i); }
    finally { await held.release(); }
    unchanged("a held session lease");
    const otherClone = Home.load(home).clonePath(s.other!.id);
    const otherSession = randomUUID(); bundle("elsewhere", otherSession, otherClone, s.other!.path);
    const otherStore = createSessionStore({ sessionsDir: join(otherClone, "sessions") }); await otherStore.prepare();
    const elsewhere = await otherStore.acquireManagement(otherSession);
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
    const shared = randomUUID(); writeIntent(clone, shared, "base"); commit("intent");
    git(clone, "branch", "other"); bundle("ours");
    writeIntent(clone, shared, "ours"); const mine = randomUUID(); writeIntent(clone, mine, "added here", { createdAt: 2 });
    commit("ours"); const oursManifest = readFileSync(join(clone, "sessions", `${sessionId}.json`));
    git(clone, "checkout", "-q", "other"); bundle("theirs");
    writeIntent(clone, shared, "theirs"); const theirs = randomUUID(); writeIntent(clone, theirs, "added there", { createdAt: 3 });
    commit("theirs"); const theirsRecords = readFileSync(join(clone, "sessions", `${sessionId}.records.jsonl`));
    git(clone, "checkout", "-q", "spex"); const plan = planStorageMerge(clone, "HEAD", "other");
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

test("storage-16: the apply seam plans over a caller-supplied ancestor and writes under a lease the caller already holds", async () => {
  const { home, key, clone, sessionId, bundle, commit, dispose } = setup();
  try {
    git(clone, "branch", "other");
    bundle("ours"); commit("ours"); const ours = git(clone, "rev-parse", "HEAD");
    git(clone, "checkout", "-q", "other"); bundle("theirs"); commit("theirs"); const theirs = git(clone, "rev-parse", "HEAD");
    const theirsRecords = readFileSync(join(clone, "sessions", `${sessionId}.records.jsonl`), "utf8");
    git(clone, "checkout", "-q", "spex");
    assert.notEqual(readFileSync(join(clone, "sessions", `${sessionId}.records.jsonl`), "utf8"), theirsRecords);
    const plan = planStorageMerge(clone, ours, theirs);
    const release = reserveStorageHome(home, machineIdentity);
    try {
      await assert.rejects(() => selectStorageMerge(home, key, { [`sessions/${sessionId}`]: "theirs" }), /stop the Spex core/);
      let marked = false;
      const applied = await applyStorageSelection(clone, plan, { [`sessions/${sessionId}`]: "theirs" }, { beforeWrite: () => { marked = true; } });
      assert.ok(marked, "the caller's marker runs before the first write");
      assert.deepEqual(applied.changedSessions, [`sessions/${sessionId}`]);
      assert.equal(applied.selected.get(`sessions/${sessionId}`), "theirs");
    } finally { release(); }
    assert.equal(readFileSync(join(clone, "sessions", `${sessionId}.records.jsonl`), "utf8"), theirsRecords);
    assert.equal(git(clone, "diff", "--cached", "--name-only"), [`sessions/${sessionId}.json`, `sessions/${sessionId}.records.jsonl`].join("\n"));
    assert.equal(git(clone, "rev-parse", "HEAD"), ours, "the seam commits nothing itself");
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
