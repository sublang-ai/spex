// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The instances migration (DR-127). Its home step: `home.yaml` in
// format 1 takes format 2 with its host as the recorded origin and, where
// it holds an account, the one instance; the app token is re-keyed to
// that origin in the same step. Its clones step: every clone at the
// instance moves under the instance's folder, its remote named by that
// folder where it records the host's id, its pairs, sync preferences and
// forge cache entry following; your own group's own repository renames
// its remote and keeps its folder; the clones never at an instance stay.
// A restart finishes what remains, a divergent destination stops it
// unchanged, a clone a session's lease holds is deferred to a later
// start, and a host URL the origin rule refuses stops it naming the URL.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createSessionStore } from "@sublang/playbook/session-store";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { StorageFormatError, sha256 } from "./files.js";
import { fileCredentialStore } from "./git-host.js";
import { Home, orderRemotes, remoteOrderOf } from "./home.js";
import { migrateInstances, needsInstancesMigration } from "./migrate-instances.js";
import { initializeClone } from "./storage-git.js";
import { Store } from "./store.js";
import { seedHistorySession } from "./testing/demo.js";
import { scratchDir } from "./testing/scratch.js";

const machineIdentity = "machine-id:v1:00000000-0000-4000-8000-0000000000aa";
const DEVICE = "71000000-0000-4000-8000-0000000000aa";
const ADA = { id: "1001", login: "ada", displayName: "Ada Lovelace" };

/** A home a Spex before DR-127 wrote: one host, as that Spex trimmed
 * the URL it was given, with the account signed in there. */
function formerHome(options: { url: string; account?: boolean; signedOut?: boolean; token?: boolean }): string {
  const root = scratchDir("spex-migrate-instances-");
  mkdirSync(join(root, "local"), { recursive: true, mode: 0o700 });
  writeFileSync(join(root, "home.yaml"), stringifyYaml({
    format: 1, device: DEVICE,
    host: { url: options.url, clientId: "spex", ...(options.account !== false ? { account: ADA } : {}), ...(options.signedOut ? { signedOut: true } : {}) },
    own: "ada", folders: [{ path: join(root, "work"), repository: "ada/work-spex" }],
  }));
  writeFileSync(join(root, "local", "prefs.json"), JSON.stringify({ format: 1, prefs: { language: "en" } }));
  if (options.token !== false) {
    writeFileSync(join(root, "local", "credentials.yaml"), stringifyYaml({ format: 1, hosts: {
      "https://elsewhere.example": { access: "other", accessExpiresAt: 1, refresh: "other-refresh" },
      [options.url]: { access: "ada-token", accessExpiresAt: 2, refresh: "ada-refresh" },
    } }), { mode: 0o600 });
  }
  return root;
}

test("instances migration: home.yaml takes format 2 with its host as the recorded origin and its one instance, the app token re-keyed to that origin in the same step", async () => {
  const root = formerHome({ url: "HTTPS://Spex.Pub:443" });
  const homeBefore = readFileSync(join(root, "home.yaml"));
  const credentialsBefore = readFileSync(join(root, "local", "credentials.yaml"));
  assert.equal(needsInstancesMigration(root), true);
  // A store opened without Store.open refuses to migrate in its constructor.
  assert.throws(() => new Store({ machineIdentity, dir: root }), /open it with Store\.open to migrate/);
  assert.deepEqual(readFileSync(join(root, "home.yaml")), homeBefore, "nothing written before the migration runs");

  const receipt = migrateInstances(root);
  assert.equal(needsInstancesMigration(root), false);
  const file = parseYaml(readFileSync(join(root, "home.yaml"), "utf8")) as Record<string, unknown>;
  assert.deepEqual(file, {
    format: 2, device: DEVICE, origin: "https://spex.pub",
    instances: [{ origin: "https://spex.pub", clientId: "spex", account: ADA }],
    own: "ada", folders: [{ path: join(root, "work"), repository: "ada/work-spex" }],
  });
  // The token under the origin, every other instance's kept, owner-only.
  const credentials = parseYaml(readFileSync(join(root, "local", "credentials.yaml"), "utf8")) as { format: number; hosts: Record<string, unknown> };
  assert.deepEqual(credentials, { format: 1, hosts: {
    "https://elsewhere.example": { access: "other", accessExpiresAt: 1, refresh: "other-refresh" },
    "https://spex.pub": { access: "ada-token", accessExpiresAt: 2, refresh: "ada-refresh" },
  } });
  assert.equal(statSync(join(root, "local", "credentials.yaml")).mode & 0o777, 0o600);
  assert.deepEqual(await fileCredentialStore(root, "https://spex.pub/").read(), { access: "ada-token", accessExpiresAt: 2, refresh: "ada-refresh" });
  // The receipt: every input's digest, the originals kept but the token's.
  const receiptDir = join(root, "local", "migrations", receipt.id);
  assert.deepEqual(JSON.parse(readFileSync(join(receiptDir, "receipt.json"), "utf8")), receipt);
  assert.equal(receipt.kind, "instances");
  assert.equal(receipt.complete, true);
  assert.deepEqual(receipt.deferred, []);
  assert.deepEqual(receipt.inputs.map((input) => [input.path, input.kept]), [["home.yaml", true], ["local/prefs.json", true], ["local/credentials.yaml", false]]);
  assert.deepEqual(readFileSync(join(receiptDir, "inputs", "0")), homeBefore);
  assert.equal(receipt.inputs[2].sha256, sha256(credentialsBefore));
  assert.equal(existsSync(join(receiptDir, "inputs", "2")), false, "the app token is never kept");
  assert.deepEqual(receipt.steps, [{
    step: "home", origin: "https://spex.pub", written: true,
    credentials: { from: sha256(credentialsBefore), to: sha256(readFileSync(join(root, "local", "credentials.yaml"))) },
  }, { step: "clones", folder: "@spex.pub", moves: [], done: [] }]);

  // The store opens the migrated home signed in at its one instance.
  const store = await Store.open({ machineIdentity, dir: root });
  try {
    assert.equal(store.home.defaultInstance().origin, "https://spex.pub");
    assert.deepEqual(store.home.account(), ADA);
    assert.deepEqual(store.storageDiagnostics().filter((entry) => entry.blocking), []);
  } finally { store.close(); }
});

test("instances migration: Store.open migrates a home in format 1; one never signed in records its origin and no instance, one signed out its instance signed out", async () => {
  const fresh = formerHome({ url: "http://127.0.0.1:4100", account: false, token: false });
  const store = await Store.open({ machineIdentity, dir: fresh });
  try {
    assert.deepEqual(Home.load(fresh).file.instances, []);
    assert.equal(Home.load(fresh).origin, "http://127.0.0.1:4100");
    assert.equal(store.home.account(), null);
    assert.equal(existsSync(join(fresh, "local", "credentials.yaml")), false);
  } finally { store.close(); }

  const out = formerHome({ url: "https://spex.pub", signedOut: true, token: false });
  migrateInstances(out);
  assert.deepEqual(Home.load(out).instances(), [{ origin: "https://spex.pub", clientId: "spex", account: ADA, signedOut: true }]);
  assert.equal(Home.load(out).account(), null);
});

test("instances migration: a restart finishes what remains, verifying its own writes, and a destination that diverged stops it unchanged", () => {
  const root = formerHome({ url: "https://Spex.pub" });
  const homeBefore = readFileSync(join(root, "home.yaml"));
  const receipt = migrateInstances(root);
  const receiptFile = join(root, "local", "migrations", receipt.id, "receipt.json");
  const homeAfter = readFileSync(join(root, "home.yaml"));
  const credentialsAfter = readFileSync(join(root, "local", "credentials.yaml"));

  // Interrupted once the token moved, before home.yaml was written.
  const interrupted = (): void => {
    writeFileSync(join(root, "home.yaml"), homeBefore);
    writeFileSync(receiptFile, JSON.stringify({ ...receipt, complete: false, steps: [{ ...receipt.steps[0], written: false }] }));
  };
  interrupted();
  assert.equal(needsInstancesMigration(root), true);
  const resumed = migrateInstances(root);
  assert.equal(resumed.id, receipt.id, "the interrupted receipt resumes");
  assert.equal(resumed.complete, true);
  assert.deepEqual(readFileSync(join(root, "home.yaml")), homeAfter);
  assert.deepEqual(readFileSync(join(root, "local", "credentials.yaml")), credentialsAfter, "the token is not moved twice");

  // Another writer's credentials since the plan: stopped, nothing written.
  interrupted();
  const theirs = stringifyYaml({ format: 1, hosts: { "https://Spex.pub": { access: "theirs", accessExpiresAt: 3, refresh: "theirs" } } });
  writeFileSync(join(root, "local", "credentials.yaml"), theirs);
  assert.throws(() => migrateInstances(root), (error: unknown) => error instanceof StorageFormatError &&
    error.file === join(root, "local", "credentials.yaml") && error.reason === "migration destination diverged; preserved unchanged");
  assert.equal(readFileSync(join(root, "local", "credentials.yaml"), "utf8"), theirs);
  assert.deepEqual(readFileSync(join(root, "home.yaml")), homeBefore);

  // An editor's home.yaml since the migration began: stopped likewise.
  writeFileSync(join(root, "local", "credentials.yaml"), credentialsAfter);
  const edited = homeBefore.toString("utf8").replace("own: ada", "own: ada\n# edited");
  writeFileSync(join(root, "home.yaml"), edited);
  assert.throws(() => migrateInstances(root), (error: unknown) => error instanceof StorageFormatError &&
    error.file === join(root, "home.yaml") && error.reason === "migration destination diverged; preserved unchanged");
  assert.equal(readFileSync(join(root, "home.yaml"), "utf8"), edited);
  assert.equal(needsInstancesMigration(root), true, "it runs again at the next start");
});

test("instances migration: a host URL the origin rule refuses stops it naming the URL, every file left as it stood", async () => {
  const root = formerHome({ url: "http://spex.example" });
  const homeBefore = readFileSync(join(root, "home.yaml"));
  const credentialsBefore = readFileSync(join(root, "local", "credentials.yaml"));
  await assert.rejects(Store.open({ machineIdentity, dir: root }), (error: unknown) => error instanceof StorageFormatError &&
    error.file === join(root, "home.yaml") && error.reason === "http://spex.example is not an instance's origin");
  assert.deepEqual(readFileSync(join(root, "home.yaml")), homeBefore);
  assert.deepEqual(readFileSync(join(root, "local", "credentials.yaml")), credentialsBefore);
  assert.equal(needsInstancesMigration(root), true);
});

// ---------------------------------------------------------------------------
// The clones step
// ---------------------------------------------------------------------------

const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const git = (cwd: string, ...args: string[]): string =>
  execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", env: gitEnv, stdio: ["ignore", "pipe", "pipe"] }).trim();
/** The one instance's folder, and its Git origin as remote URLs name it. */
const FOLDER = "@spex.pub";
const GIT_ORIGIN = "https://git.spex.example";
const workspace = (root: string, key: string): string => join(root, "workspace", ...key.split("/"));
const remotesOf = (dir: string): string[] => orderRemotes(git(dir, "remote").split("\n").filter(Boolean), (name) => name, remoteOrderOf(dir));
const prefsIn = (root: string): Record<string, unknown> =>
  (JSON.parse(readFileSync(join(root, "local", "prefs.json"), "utf8")) as { prefs: Record<string, unknown> }).prefs;
const receiptsOf = (root: string): string[] => readdirSync(join(root, "local", "migrations"));

/** A clone as a Spex before DR-127 left it at `key`: a repository on
 * `spex` with one commit; `remote` its `origin`, `id` the host's id
 * and `created` the core's creation mark at the top level of its Git
 * configuration and, with both a remote and an id, the host's `spex`
 * fetched under `origin` as its upstream. */
function formerClone(root: string, key: string, options: { remote?: string; id?: string; created?: string } = {}): string {
  const dir = workspace(root, key);
  initializeClone(dir, { env: gitEnv });
  if (options.remote) git(dir, "remote", "add", "origin", options.remote);
  if (options.id) git(dir, "config", "spex.repositoryId", options.id);
  if (options.created) git(dir, "config", "spex.created", options.created);
  if (options.remote && options.id) {
    git(dir, "update-ref", "refs/remotes/origin/spex", "HEAD");
    git(dir, "config", "branch.spex.remote", "origin");
    git(dir, "config", "branch.spex.merge", "refs/heads/spex");
  }
  return dir;
}

/** A one-instance home a Spex before DR-127 left, with a clone for every
 * row of the migration's table: your own group's own repository; in
 * your own group's folder, a project in your namespace there recording
 * the host's id, a local-only clone and one with a remote the reader
 * named; elsewhere, a subgroup's and another account's repository
 * recording it, one with a remote the reader named, and a group's
 * repository the host has not created yet; and one already under the
 * instance's folder. Each project's folder is paired; the sync
 * preferences and the forge cache name some of them. */
function formerHomeWithClones(): string {
  const root = formerHome({ url: "https://Spex.pub" });
  const pair = (name: string, key: string): { path: string; repository: string } => ({ path: join(root, "work", name), repository: key });
  writeFileSync(join(root, "home.yaml"), stringifyYaml({
    format: 1, device: DEVICE, host: { url: "https://Spex.pub", clientId: "spex", account: ADA }, own: "ada",
    folders: [
      pair("notes", "ada/notes-spex"), pair("scratch", "ada/scratch-spex"), pair("web", "acme/platform/web-spex"),
      pair("draft", "acme/draft-spex"), pair("planned", "acme/planned-spex"),
    ],
  }));
  formerClone(root, "ada/ada-spex", { remote: `${GIT_ORIGIN}/ada/ada-spex.git`, id: "100" });
  formerClone(root, "ada/notes-spex", { remote: `${GIT_ORIGIN}/ada/notes-spex.git`, id: "101", created: "101" });
  formerClone(root, "ada/scratch-spex");
  formerClone(root, "ada/mirror-spex", { remote: join(root, "elsewhere", "mirror.git") });
  formerClone(root, "acme/platform/web-spex", { remote: `${GIT_ORIGIN}/acme/platform/web-spex.git`, id: "102" });
  formerClone(root, "bob/shared-spex", { remote: `${GIT_ORIGIN}/bob/shared-spex.git`, id: "103" });
  formerClone(root, "acme/draft-spex", { remote: join(root, "elsewhere", "draft.git") });
  formerClone(root, "acme/planned-spex");
  formerClone(root, `${FOLDER}/acme/already-spex`, { remote: `${GIT_ORIGIN}/acme/already-spex.git`, id: "104" });
  writeFileSync(join(root, "local", "prefs.json"), JSON.stringify({ format: 1, prefs: {
    language: "en",
    "sync:acme/platform/web-spex:last": { at: 1, sent: 1, received: 0 },
    "sync:acme/platform/web-spex:noticed": true,
    "sync:ada/notes-spex:last": { at: 2, sent: 0, received: 1 },
    "sync:ada/scratch-spex:noticed": true,
  } }));
  const forge = (repo: string) => ({ at: 5, state: { adapter: "github", authenticated: true, repo, issues: [], prs: [], at: 5 } });
  writeFileSync(join(root, "local", "forge-cache.json"), JSON.stringify({ format: 1, entries: {
    "acme/platform/web-spex": forge("acme/web"), "ada/scratch-spex": forge("ada/scratch"),
  } }));
  return root;
}

test("instances migration: every clone at the instance moves under its folder, its remote named by the folder where it records the host's id, its pair, sync preferences and forge cache entry following; your own group's own repository renames its remote in place; the clones never at an instance stay", async () => {
  const root = formerHomeWithClones();
  const t = 1_700_000_000_000;
  const sessionId = await seedHistorySession(join(workspace(root, "acme/platform/web-spex"), "sessions"), join(root, "work", "web"), [
    { type: "turn_started", turnId: 1, turn: { id: 1, prompt: "Ship the web" }, timestamp: t },
    { type: "turn_finished", turnId: 1, timestamp: t + 1 },
  ]);
  const prefsBefore = readFileSync(join(root, "local", "prefs.json"));
  const cacheBefore = readFileSync(join(root, "local", "forge-cache.json"));
  const credentialsBefore = readFileSync(join(root, "local", "credentials.yaml"));
  const headOf = (key: string): string => git(workspace(root, key), "rev-parse", "HEAD");
  const heads = Object.fromEntries(["acme/platform/web-spex", "acme/draft-spex", "ada/notes-spex"].map((key) => [key, headOf(key)]));
  assert.equal(needsInstancesMigration(root), true);

  const store = await Store.open({ machineIdentity, dir: root, env: gitEnv });
  try {
    // Every clone where the table puts it.
    const moved = {
      "ada/notes-spex": `${FOLDER}/ada/notes-spex`,
      "acme/platform/web-spex": `${FOLDER}/acme/platform/web-spex`,
      "bob/shared-spex": `${FOLDER}/bob/shared-spex`,
      "acme/draft-spex": `${FOLDER}/acme/draft-spex`,
      "acme/planned-spex": `${FOLDER}/acme/planned-spex`,
    };
    for (const [from, to] of Object.entries(moved)) {
      assert.ok(!existsSync(workspace(root, from)), `${from} left its key`);
      assert.ok(existsSync(join(workspace(root, to), ".git")), `${from} stands at ${to}`);
    }
    assert.equal(git(workspace(root, `${FOLDER}/acme/platform/web-spex`), "rev-parse", "HEAD"), heads["acme/platform/web-spex"], "moved whole, its history with it");
    assert.ok(!existsSync(join(root, "workspace", "acme")) && !existsSync(join(root, "workspace", "bob")), "the folders a move left empty go");
    for (const key of ["ada/ada-spex", "ada/scratch-spex", "ada/mirror-spex", `${FOLDER}/acme/already-spex`]) {
      assert.ok(existsSync(join(workspace(root, key), ".git")), `${key} stays`);
    }
    assert.deepEqual(store.listRepositories().map((repository) => repository.key), [
      `${FOLDER}/acme/already-spex`, `${FOLDER}/acme/draft-spex`, `${FOLDER}/acme/planned-spex`, `${FOLDER}/acme/platform/web-spex`,
      `${FOLDER}/ada/notes-spex`, `${FOLDER}/bob/shared-spex`, "ada/ada-spex", "ada/mirror-spex", "ada/scratch-spex",
    ].sort((a, b) => a.localeCompare(b)));

    // The host's remote takes the instance's folder's name, its fetched
    // spex and its upstream with it, and the host's id, and a creation
    // mark, move from the top level into its section (storage-34); a
    // remote the reader named keeps its own; your own group's own
    // repository renames its remote in place; a clone already under the
    // folder is not touched.
    for (const [key, id] of [["ada/ada-spex", "100"], [`${FOLDER}/ada/notes-spex`, "101"], [`${FOLDER}/acme/platform/web-spex`, "102"], [`${FOLDER}/bob/shared-spex`, "103"]]) {
      const dir = workspace(root, key);
      assert.deepEqual(remotesOf(dir), [FOLDER], `${key}: its one remote is named by the folder`);
      assert.match(git(dir, "remote", "get-url", FOLDER), new RegExp(`^${GIT_ORIGIN}/`));
      assert.equal(git(dir, "config", "branch.spex.remote"), FOLDER, `${key}: its upstream follows`);
      assert.equal(git(dir, "rev-parse", `refs/remotes/${FOLDER}/spex`), git(dir, "rev-parse", "spex"), `${key}: its fetched spex follows`);
      assert.equal(git(dir, "config", "--get", `remote.${FOLDER}.spexId`), id, `${key}: the host's id stands in its remote's section`);
      assert.equal(spawnSync("git", ["-C", dir, "config", "--get", "spex.repositoryId"], { env: gitEnv }).status, 1, `${key}: no id at the top level`);
      assert.equal(spawnSync("git", ["-C", dir, "config", "--get", "spex.created"], { env: gitEnv }).status, 1, `${key}: no creation mark at the top level`);
    }
    assert.equal(git(workspace(root, `${FOLDER}/ada/notes-spex`), "config", "--get", `remote.${FOLDER}.spexCreated`), "101", "the creation mark moves with the id");
    assert.equal(git(workspace(root, `${FOLDER}/acme/already-spex`), "config", "--get", "spex.repositoryId"), "104", "a clone already under the folder is not touched");
    for (const key of [`${FOLDER}/acme/draft-spex`, "ada/mirror-spex", `${FOLDER}/acme/already-spex`]) {
      assert.deepEqual(remotesOf(workspace(root, key)), ["origin"], `${key} keeps its remote`);
    }
    assert.equal(git(workspace(root, `${FOLDER}/acme/draft-spex`), "remote", "get-url", "origin"), join(root, "elsewhere", "draft.git"));
    assert.deepEqual(remotesOf(workspace(root, `${FOLDER}/acme/planned-spex`)), []);
    assert.deepEqual(remotesOf(workspace(root, "ada/scratch-spex")), []);

    // home.yaml: format 2, the one instance, every pair following its clone.
    const home = Home.load(root);
    assert.deepEqual(home.instances(), [{ origin: "https://spex.pub", clientId: "spex", account: ADA }]);
    assert.equal(home.ownName, "ada");
    assert.deepEqual(home.folders().map((folder) => [folder.path, folder.repository]), [
      [join(root, "work", "notes"), `${FOLDER}/ada/notes-spex`],
      [join(root, "work", "scratch"), "ada/scratch-spex"],
      [join(root, "work", "web"), `${FOLDER}/acme/platform/web-spex`],
      [join(root, "work", "draft"), `${FOLDER}/acme/draft-spex`],
      [join(root, "work", "planned"), `${FOLDER}/acme/planned-spex`],
    ]);
    // The app token re-keyed to the origin in the home's step.
    assert.deepEqual(await fileCredentialStore(root, "https://spex.pub").read(), { access: "ada-token", accessExpiresAt: 2, refresh: "ada-refresh" });

    // The sync preferences and the forge cache follow each moved clone;
    // a clone that stays keeps its own.
    assert.deepEqual(prefsIn(root), {
      language: "en",
      [`sync:${FOLDER}/acme/platform/web-spex:last`]: { at: 1, sent: 1, received: 0 },
      [`sync:${FOLDER}/acme/platform/web-spex:noticed`]: true,
      [`sync:${FOLDER}/ada/notes-spex:last`]: { at: 2, sent: 0, received: 1 },
      "sync:ada/scratch-spex:noticed": true,
    });
    assert.equal(store.getPref<boolean>(`sync:${FOLDER}/acme/platform/web-spex:noticed`), true);
    assert.equal(store.getForgeCache(`${FOLDER}/acme/platform/web-spex`)?.state.repo, "acme/web");
    assert.equal(store.getForgeCache("acme/platform/web-spex"), undefined);
    assert.equal(store.getForgeCache("ada/scratch-spex")?.state.repo, "ada/scratch");

    // The session lies in its clone where it now stands, its project the new key.
    await store.initializeSessions();
    assert.deepEqual(store.listSessions().filter((session) => session.id === sessionId).map((session) => session.projectId), [`${FOLDER}/acme/platform/web-spex`]);
    assert.deepEqual(store.listProjects().find((project) => project.path === join(root, "work", "web"))?.id, `${FOLDER}/acme/platform/web-spex`);
    assert.deepEqual(store.deferredMoves(), []);
    assert.deepEqual(store.storageDiagnostics().filter((entry) => entry.blocking), []);
  } finally { store.close(); }

  // The receipt: the originals kept, the clones step planned before any
  // move and every move done, nothing deferred.
  const [id] = receiptsOf(root);
  const receipt = JSON.parse(readFileSync(join(root, "local", "migrations", id, "receipt.json"), "utf8")) as {
    inputs: { path: string; sha256: string; kept: boolean }[]; steps: Record<string, unknown>[]; deferred: unknown[]; complete: boolean;
  };
  assert.equal(receipt.complete, true);
  assert.deepEqual(receipt.deferred, []);
  assert.deepEqual(receipt.inputs.map((input) => [input.path, input.kept]), [
    ["home.yaml", true], ["local/prefs.json", true], ["local/forge-cache.json", true], ["local/credentials.yaml", false],
  ]);
  assert.deepEqual(readFileSync(join(root, "local", "migrations", id, "inputs", "1")), prefsBefore);
  assert.deepEqual(readFileSync(join(root, "local", "migrations", id, "inputs", "2")), cacheBefore);
  assert.equal(receipt.inputs[3].sha256, sha256(credentialsBefore));
  const clones = receipt.steps.find((entry) => entry.step === "clones") as { folder: string; moves: { from: string; to: string; remote: boolean; id: string | null; url: string | null }[]; done: string[] };
  assert.equal(clones.folder, FOLDER);
  // Each planned with the clone it was: its host id and its remote's URL.
  assert.deepEqual(clones.moves, [
    { from: "acme/draft-spex", to: `${FOLDER}/acme/draft-spex`, remote: false, id: null, url: join(root, "elsewhere", "draft.git") },
    { from: "acme/planned-spex", to: `${FOLDER}/acme/planned-spex`, remote: false, id: null, url: null },
    { from: "acme/platform/web-spex", to: `${FOLDER}/acme/platform/web-spex`, remote: true, id: "102", url: `${GIT_ORIGIN}/acme/platform/web-spex.git` },
    { from: "ada/ada-spex", to: "ada/ada-spex", remote: true, id: "100", url: `${GIT_ORIGIN}/ada/ada-spex.git` },
    { from: "ada/notes-spex", to: `${FOLDER}/ada/notes-spex`, remote: true, id: "101", url: `${GIT_ORIGIN}/ada/notes-spex.git` },
    { from: "bob/shared-spex", to: `${FOLDER}/bob/shared-spex`, remote: true, id: "103", url: `${GIT_ORIGIN}/bob/shared-spex.git` },
  ]);
  assert.deepEqual([...clones.done].sort(), clones.moves.map((move) => move.from).sort());

  // A second open migrates nothing again and writes no second receipt.
  assert.equal(needsInstancesMigration(root), false);
  const homeAfter = readFileSync(join(root, "home.yaml"));
  (await Store.open({ machineIdentity, dir: root, env: gitEnv })).close();
  assert.deepEqual(receiptsOf(root), [id]);
  assert.deepEqual(readFileSync(join(root, "home.yaml")), homeAfter);
  assert.equal(git(workspace(root, `${FOLDER}/acme/draft-spex`), "rev-parse", "HEAD"), heads["acme/draft-spex"]);
});

test("instances migration: a clone nine segments deep, as deep as a key stood before, moves under the instance's folder, where the store finds and pairs it", async () => {
  const root = formerHome({ url: "https://spex.pub" });
  const deep = "acme/b/c/d/e/f/g/h/deep-spex";
  const to = `${FOLDER}/${deep}`;
  assert.equal(to.split("/").length, 10);
  writeFileSync(join(root, "home.yaml"), stringifyYaml({
    format: 1, device: DEVICE, host: { url: "https://spex.pub", clientId: "spex", account: ADA }, own: "ada",
    folders: [{ path: join(root, "work", "deep"), repository: deep }],
  }));
  formerClone(root, deep, { remote: `${GIT_ORIGIN}/${deep}.git`, id: "105" });
  const store = await Store.open({ machineIdentity, dir: root, env: gitEnv });
  try {
    assert.ok(!existsSync(workspace(root, deep)) && existsSync(join(workspace(root, to), ".git")), "moved under the instance's folder");
    assert.deepEqual(remotesOf(workspace(root, to)), [FOLDER]);
    assert.ok(store.listRepositories().some((repository) => repository.key === to), "the store's walk finds it");
    assert.equal(store.home.keyForFolder(join(root, "work", "deep")), to);
    assert.deepEqual(store.listProjects().map((project) => project.id), [to]);
  } finally { store.close(); }
});

test("instances migration: a destination taken stops the clones step before any clone moves, nothing found overwritten; a retry once it is moved aside finishes the work in the same receipt", async () => {
  const root = formerHomeWithClones();
  const stray = workspace(root, `${FOLDER}/acme/draft-spex`);
  mkdirSync(stray, { recursive: true });
  writeFileSync(join(stray, "notes.txt"), "someone's own");
  await assert.rejects(Store.open({ machineIdentity, dir: root, env: gitEnv }), (error: unknown) => error instanceof StorageFormatError &&
    error.file === stray && error.reason === "migration destination diverged; preserved unchanged");
  assert.equal(readFileSync(join(stray, "notes.txt"), "utf8"), "someone's own");
  for (const key of ["acme/draft-spex", "acme/platform/web-spex", "ada/notes-spex", "bob/shared-spex"]) {
    assert.ok(existsSync(join(workspace(root, key), ".git")), `${key} has not moved`);
  }
  assert.deepEqual(remotesOf(workspace(root, "ada/ada-spex")), ["origin"], "no remote is renamed");
  const receipts = receiptsOf(root);
  assert.equal(receipts.length, 1);
  assert.equal(JSON.parse(readFileSync(join(root, "local", "migrations", receipts[0], "receipt.json"), "utf8")).complete, false);
  assert.equal(needsInstancesMigration(root), true, "it runs again at the next start");

  rmSync(stray, { recursive: true, force: true });
  const store = await Store.open({ machineIdentity, dir: root, env: gitEnv });
  try {
    assert.ok(existsSync(join(workspace(root, `${FOLDER}/acme/draft-spex`), ".git")) && !existsSync(workspace(root, "acme/draft-spex")));
    assert.deepEqual(remotesOf(workspace(root, `${FOLDER}/acme/platform/web-spex`)), [FOLDER]);
    assert.equal(store.home.keyForFolder(join(root, "work", "draft")), `${FOLDER}/acme/draft-spex`);
  } finally { store.close(); }
  assert.deepEqual(receiptsOf(root), receipts, "the interrupted receipt finished");
  assert.equal(JSON.parse(readFileSync(join(root, "local", "migrations", receipts[0], "receipt.json"), "utf8")).complete, true);
  assert.equal(needsInstancesMigration(root), false);
});

test("instances migration: a restart after a clone's rename, before its records followed, finishes that move without moving it twice", () => {
  const root = formerHomeWithClones();
  const receipt = migrateInstances(root, { machineIdentity, env: gitEnv });
  const receiptFile = join(root, "local", "migrations", receipt.id, "receipt.json");
  const to = `${FOLDER}/acme/platform/web-spex`;
  // Interrupted once web-spex was renamed: its pair, preferences, forge
  // cache entry and remote still name its former key.
  const home = Home.load(root);
  home.move([{ from: to, to: "acme/platform/web-spex" }]);
  home.save();
  const dir = workspace(root, to);
  git(dir, "remote", "rename", FOLDER, "origin");
  git(dir, "config", "--unset", "remote.origin.spexId");
  git(dir, "config", "spex.repositoryId", "102");
  const prefs = prefsIn(root);
  writeFileSync(join(root, "local", "prefs.json"), JSON.stringify({ format: 1, prefs: Object.fromEntries(Object.entries(prefs)
    .map(([key, value]) => [key.replace(`sync:${to}:`, "sync:acme/platform/web-spex:"), value])) }));
  const clones = receipt.steps.find((entry) => entry.step === "clones") as { done: string[] };
  writeFileSync(receiptFile, JSON.stringify({ ...receipt, complete: false, steps: receipt.steps.map((entry) => entry.step === "clones"
    ? { ...entry, done: clones.done.filter((key) => key !== "acme/platform/web-spex") } : entry) }));
  const head = git(dir, "rev-parse", "HEAD");
  assert.equal(needsInstancesMigration(root), true);

  const resumed = migrateInstances(root, { machineIdentity, env: gitEnv });
  assert.equal(resumed.id, receipt.id);
  assert.equal(resumed.complete, true);
  assert.equal(git(dir, "rev-parse", "HEAD"), head);
  assert.ok(!existsSync(workspace(root, "acme/platform/web-spex")));
  assert.equal(Home.load(root).keyForFolder(join(root, "work", "web")), to);
  assert.deepEqual(remotesOf(dir), [FOLDER]);
  // Its id moved into the renamed remote's section in the same step
  // (storage-34).
  assert.equal(git(dir, "config", "--get", `remote.${FOLDER}.spexId`), "102");
  assert.equal(spawnSync("git", ["-C", dir, "config", "--get", "spex.repositoryId"], { env: gitEnv }).status, 1);
  assert.equal(prefsIn(root)[`sync:${to}:noticed`], true);
  assert.equal(prefsIn(root)["sync:acme/platform/web-spex:noticed"], undefined);
});

test("instances migration: a clone a live session's lease holds is deferred, keeping its key and remote, named in the receipt and listed by the store; once that lease is released the next open moves it, a dead owner's lease with it, in the same receipt", async () => {
  const root = formerHomeWithClones();
  const held = "acme/platform/web-spex";
  const to = `${FOLDER}/${held}`;
  const sessions = createSessionStore({ sessionsDir: join(workspace(root, held), "sessions") });
  await sessions.prepare();
  const live = await sessions.acquireManagement(randomUUID());
  // A lease a dead process of this machine left holds nothing.
  const deadId = randomUUID();
  const deadLease = join(workspace(root, held), "sessions", `.${deadId}.lock`);
  mkdirSync(deadLease, { mode: 0o700 });
  const deadPid = spawnSync(process.execPath, ["-e", ""]).pid as number;
  writeFileSync(join(deadLease, "owner.json"), JSON.stringify({ schemaVersion: 1, kind: "captain-session-lease", sessionId: deadId, ownerToken: randomUUID(), pid: deadPid, hostname: machineIdentity, acquiredAt: new Date().toISOString() }), { mode: 0o600 });
  let released = false;
  try {
    const store = await Store.open({ machineIdentity, dir: root, env: gitEnv });
    try {
      assert.ok(existsSync(join(workspace(root, held), ".git")) && !existsSync(workspace(root, to)), "it keeps its key");
      assert.deepEqual(remotesOf(workspace(root, held)), ["origin"], "and its remote");
      // Its id stays at the top level until its move (storage-34).
      assert.equal(git(workspace(root, held), "config", "--get", "spex.repositoryId"), "102");
      assert.equal(spawnSync("git", ["-C", workspace(root, held), "config", "--get", "remote.origin.spexId"], { env: gitEnv }).status, 1);
      assert.equal(store.home.keyForFolder(join(root, "work", "web")), held, "its pair stays");
      assert.equal(prefsIn(root)[`sync:${held}:noticed`], true, "its preferences stay");
      assert.deepEqual(store.deferredMoves(), [{ from: held, to, id: "102", url: `${GIT_ORIGIN}/${held}.git` }]);
      assert.ok(store.listRepositories().some((repository) => repository.key === held));
      // Every other clone moved.
      assert.ok(existsSync(join(workspace(root, `${FOLDER}/acme/draft-spex`), ".git")));
      assert.deepEqual(remotesOf(workspace(root, "ada/ada-spex")), [FOLDER]);
    } finally { store.close(); }
    const [id] = receiptsOf(root);
    const receipt = JSON.parse(readFileSync(join(root, "local", "migrations", id, "receipt.json"), "utf8")) as { complete: boolean; deferred: unknown[] };
    assert.equal(receipt.complete, true);
    assert.deepEqual(receipt.deferred, [{ from: held, to }]);
    assert.equal(needsInstancesMigration(root), true, "the next start moves it");
    // Still held at the next open: deferred again, nothing else written.
    (await Store.open({ machineIdentity, dir: root, env: gitEnv })).close();
    assert.ok(existsSync(join(workspace(root, held), ".git")));
    assert.deepEqual(receiptsOf(root), [id]);

    await live.release();
    released = true;
    const store2 = await Store.open({ machineIdentity, dir: root, env: gitEnv });
    try {
      assert.ok(!existsSync(workspace(root, held)) && existsSync(join(workspace(root, to), ".git")), "moved under the instance's folder");
      assert.ok(existsSync(join(workspace(root, to), "sessions", `.${deadId}.lock`, "owner.json")), "the dead owner's lease moved with it");
      assert.deepEqual(remotesOf(workspace(root, to)), [FOLDER]);
      // The move renamed its remote, its id moved into that section
      // (storage-34).
      assert.equal(git(workspace(root, to), "config", "--get", `remote.${FOLDER}.spexId`), "102");
      assert.equal(spawnSync("git", ["-C", workspace(root, to), "config", "--get", "spex.repositoryId"], { env: gitEnv }).status, 1);
      assert.equal(store2.home.keyForFolder(join(root, "work", "web")), to);
      assert.equal(prefsIn(root)[`sync:${to}:noticed`], true);
      assert.equal(store2.getForgeCache(to)?.state.repo, "acme/web");
      assert.deepEqual(store2.deferredMoves(), []);
    } finally { store2.close(); }
    assert.deepEqual(receiptsOf(root), [id], "no second receipt");
    assert.deepEqual(JSON.parse(readFileSync(join(root, "local", "migrations", id, "receipt.json"), "utf8")).deferred, []);
    assert.equal(needsInstancesMigration(root), false);
  } finally { if (!released) await live.release(); }
});

/** A one-instance home migrated with `acme/platform/web-spex` deferred,
 * a live session's lease beneath it, which the caller releases. */
async function deferredWeb(): Promise<{ root: string; held: string; to: string; release: () => Promise<void> }> {
  const root = formerHomeWithClones();
  const held = "acme/platform/web-spex";
  const sessions = createSessionStore({ sessionsDir: join(workspace(root, held), "sessions") });
  await sessions.prepare();
  const live = await sessions.acquireManagement(randomUUID());
  (await Store.open({ machineIdentity, dir: root, env: gitEnv })).close();
  assert.ok(existsSync(join(workspace(root, held), ".git")), "deferred");
  return { root, held, to: `${FOLDER}/${held}`, release: () => live.release().catch(() => undefined) };
}

const deferredIn = (root: string): unknown[] => receiptsOf(root).flatMap((id) =>
  (JSON.parse(readFileSync(join(root, "local", "migrations", id, "receipt.json"), "utf8")) as { deferred: unknown[] }).deferred);

test("instances migration: a deferred clone whose destination is taken stays deferred at the next start, reported naming that destination, the store opening; once the destination is free the next start moves it", async () => {
  const { root, held, to, release } = await deferredWeb();
  await release();
  const stray = workspace(root, to);
  mkdirSync(stray, { recursive: true });
  writeFileSync(join(stray, "notes.txt"), "someone's own");
  const store = await Store.open({ machineIdentity, dir: root, env: gitEnv });
  try {
    assert.ok(existsSync(join(workspace(root, held), ".git")), "it keeps its key");
    assert.equal(readFileSync(join(stray, "notes.txt"), "utf8"), "someone's own", "nothing found is overwritten");
    assert.deepEqual(store.deferredMoves().map((move) => [move.from, move.to]), [[held, to]]);
    // The stray folder itself reads as a clone no folder pairs, its repair apart.
    assert.deepEqual(store.storageDiagnostics().filter((entry) => entry.file === join("workspace", ...to.split("/")) && !entry.repair), [
      { file: join("workspace", ...to.split("/")), reason: `taken, so ${held} cannot move here under its instance's folder; move it aside`, blocking: false },
    ]);
  } finally { store.close(); }
  assert.deepEqual(deferredIn(root), [{ from: held, to }]);

  rmSync(stray, { recursive: true, force: true });
  const moved = await Store.open({ machineIdentity, dir: root, env: gitEnv });
  try {
    assert.ok(existsSync(join(workspace(root, to), ".git")) && !existsSync(workspace(root, held)), "moved under the instance's folder");
    assert.deepEqual(remotesOf(workspace(root, to)), [FOLDER]);
    assert.deepEqual(moved.deferredMoves(), []);
    assert.ok(!moved.storageDiagnostics().some((entry) => entry.reason.startsWith("taken, so")));
  } finally { moved.close(); }
  assert.deepEqual(deferredIn(root), []);
});

test("instances migration: a deferred clone the store removes settles its entry, and a clone made at a deferred key since is another, never moved by a start, the entry settled", async () => {
  // Removed: the receipt names the key no more, so a clone made there
  // later stays where it is made.
  const removed = await deferredWeb();
  const store = await Store.open({ machineIdentity, dir: removed.root, env: gitEnv });
  try {
    assert.equal(store.removeProject(removed.held), true);
    assert.deepEqual(store.deferredMoves(), []);
  } finally { store.close(); await removed.release(); }
  assert.deepEqual(deferredIn(removed.root), []);
  assert.equal(needsInstancesMigration(removed.root), false);
  formerClone(removed.root, removed.held, { remote: `${GIT_ORIGIN}/acme/platform/web-spex.git`, id: "102" });
  (await Store.open({ machineIdentity, dir: removed.root, env: gitEnv })).close();
  assert.ok(existsSync(join(workspace(removed.root, removed.held), ".git")) && !existsSync(workspace(removed.root, removed.to)), "a clone made at that key since is not moved");

  // Replaced at its key while the core was away: the clone there records
  // no host id, so it is not the one deferred, and stays.
  const replaced = await deferredWeb();
  await replaced.release();
  rmSync(workspace(replaced.root, replaced.held), { recursive: true, force: true });
  formerClone(replaced.root, replaced.held);
  const reopened = await Store.open({ machineIdentity, dir: replaced.root, env: gitEnv });
  try {
    assert.ok(existsSync(join(workspace(replaced.root, replaced.held), ".git")) && !existsSync(workspace(replaced.root, replaced.to)), "another clone at its key is never moved");
    assert.deepEqual(remotesOf(workspace(replaced.root, replaced.held)), []);
    assert.deepEqual(reopened.deferredMoves(), []);
  } finally { reopened.close(); }
  assert.deepEqual(deferredIn(replaced.root), []);
  assert.equal(needsInstancesMigration(replaced.root), false);
});
