// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Legacy environments without registry settings at several instances
// (environments-34/39, DR-168), through
// real cores: a home signed in to two stand-in instances over one Git
// backend, each relaying to a stand-in registry of its own, the first
// the home's default instance; and a second home signed in only to a
// third stand-in instance that the first's registry also answers. An
// environment resolves at its instance's registry, or the default
// instance's where it has none, with that instance's token, keeping the
// registry its lock records for the same release; new pairings instead
// lock the built-in at the public registry; and a compatibility install
// takes each locked release from the environment's instance, else the
// registry its lock records, else any instance the home is signed in
// to. A search asks the registry of the environment it names, the orgs
// a project's new playbook defaults from are asked of its environment's
// registry, and a publish uses a separately obtained registry grant. A
// registry refusing an instance's token signs that instance alone out,
// where that token is still the stored pair's.

import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml, parseDocument } from "yaml";

import {
  BUILTIN_PACKAGE_NAME,
  PUBLIC_REGISTRY_ORIGIN,
  gitSource,
  parseLock,
  parseRequests,
  publishRelease,
  RegistryClient,
  RegistryError,
  requestsDigest,
  resolve,
  serializeLock,
  type Lock,
  type RegistrySourceLock,
  type Resolution,
} from "@sublang/spex/environment";
import type { EnvironmentState, GroupsState, RepositoryState } from "./protocol.js";
import { credentialsPath, fileCredentialStore, GitHostClient, type StoredCredential } from "@sublang/spex/git-host";
import { holdingFetch } from "./testing/holding-fetch.js";
import { clonePath, createSpaceHarness, environmentRoot, hostFolder, hostKey, instanceOf, ownClone, rowsOf, remoteNamesOf } from "./testing/space-harness.js";
import type { StandinHost } from "./testing/standin-host.js";
import { makeRelease, startStandinRegistry, type StandinRegistry, type StandinRegistryRequest } from "@sublang/spex/testing";

const fixture = createSpaceHarness();
const { scratch, git, gitFolder, sleep, startHost, signIn, signOut, forget } = fixture;
test.after(() => fixture.dispose());

type Home = Awaited<ReturnType<typeof fixture.startHome>>;

// These compatibility journeys start with actual old manifests, without a
// registry setting, before the core prepares their builtin request and lock.
async function startHome(name: string, options: Parameters<typeof fixture.startHome>[1] = {}): Promise<Home> {
  if (options.dataDir) return fixture.startHome(name, options);
  const dataDir = mkdtempSync(join(scratch, `${name}-legacy-`));
  seedLegacy(ownClone(dataDir));
  return fixture.startHome(name, { ...options, dataDir });
}
function seedLegacy(clone: string): void {
  mkdirSync(clone, { recursive: true });
  writeFileSync(join(clone, "spex.yaml"), "format: 1\npackages: {}\n");
}
async function addFolder(home: Home, path: string) {
  const added = await fixture.addFolder(home, path);
  // Restore a pre-migration project snapshot after allocating its real key.
  // Precreating its directory would make registration allocate another key.
  const root = environmentRoot(home.dataDir, added.key);
  const yaml = join(root, "spex.yaml");
  const doc = parseDocument(readFileSync(yaml, "utf8"));
  doc.delete("registry");
  const text = doc.toString({ lineWidth: 0 });
  const lock = parseLock(readFileSync(join(root, "spex.lock"), "utf8"));
  const builtin = lock.packages[BUILTIN_PACKAGE_NAME]!;
  const origin = (await home.client.expectOk("space.get", {})).defaultInstance!;
  writeFileSync(yaml, text);
  writeFileSync(join(root, "spex.lock"), serializeLock({ ...lock, requests: requestsDigest(text), packages: {
    ...lock.packages, [BUILTIN_PACKAGE_NAME]: { ...builtin, source: { ...(builtin.source as RegistrySourceLock), registry: origin } },
  } }));
  return added;
}
async function registrySignIn(home: Home, host: StandinHost): Promise<void> {
  host.script.deviceInterval = 0;
  const from = home.client.messages.length;
  const start = await home.client.expectOk("registry.signin.start", { origin: host.url });
  if (start.flow === "browser") await (await fetch(start.url)).text();
  else host.script.approveDevice(start.userCode);
  await home.client.waitFor((message) => home.client.messages.indexOf(message) >= from && message.type === "registry.state" && message.state.origin === host.url && message.state.account !== null && message.state.signIn.phase === "idle");
}

/** The stand-ins' default person, and your own group's repository once
 * signed in as them. */
const LOGIN = "ada";
const HOST_OWN = `${LOGIN}/${LOGIN}-spex`;
const GRACE = { id: "1003", login: "grace", displayName: "Grace Hopper" };

/** A release folder holding one skill named after its spec package,
 * under the scratch folder or at `dir`: one folder packs to one
 * archive, so every registry it is published to holds it at one
 * checksum. */
async function release(name: string, version = "1.0.0", dir?: string): Promise<string> {
  const [org, pkg] = name.split("/") as [string, string];
  const skill = `${pkg}-skill`;
  return makeRelease(dir ?? join(scratch, "releases", org, pkg, version), {
    format: 2, org, name: pkg, version, description: `The ${name} spec package`, license: "Apache-2.0",
    artifacts: { [skill]: { kind: "skill", language: "en" } },
  }, { [`skills/en/${skill}/SKILL.md`]: `---\nname: ${skill}\ndescription: The ${pkg} skill\n---\n\nUse ${pkg}.\n` });
}

/** Publish a release folder to a stand-in registry directly. */
async function publishTo(registry: StandinRegistry, folder: string): Promise<string> {
  return (await publishRelease(new RegistryClient({ url: registry.url }), folder)).checksum;
}

/** An environment as `environment.get` reads it once no operation runs
 * there and `check` holds. */
async function environmentOf(home: Home, key: string, check: (state: EnvironmentState) => boolean, timeoutMs = 60_000): Promise<EnvironmentState> {
  const start = Date.now();
  for (;;) {
    const state = await home.client.expectOk("environment.get", { repository: key });
    if (state.busy === null && check(state)) return state;
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for the environment of ${key}: ${JSON.stringify(state)}`);
    await sleep(25);
  }
}

/** Whether a spec package is installed as the lock locks it, and where
 * its lock records it from. */
const installedFrom = (state: EnvironmentState, name: string, registry: string): boolean =>
  state.packages.some((pkg) => pkg.name === name && pkg.installed && pkg.source.detail === registry);

/** A repository's row in the Groups state, under your own group or an
 * instance's heading (space-30), asserted to stand there. */
function rowOf(state: GroupsState, key: string): RepositoryState {
  const row = rowsOf(state).find((candidate) => candidate.key === key);
  assert.ok(row, `${key} is listed under your own group or an instance's heading`);
  return row;
}

/** An environment's `spex.lock` as written at its root
 * (environments-26). */
function lockOf(home: Home, key: string): Lock {
  return parseLock(readFileSync(join(environmentRoot(home.dataDir, key), "spex.lock"), "utf8"));
}

/** The registry a lock records for a spec package (environments-3). */
function registryOf(lock: Lock, name: string): string {
  const source = lock.packages[name]?.source as RegistrySourceLock | undefined;
  assert.ok(source && "registry" in source, `${name} is locked from a registry`);
  return source.registry;
}

/** What a registry received for one spec package after a mark: each
 * request's path with the instance that relayed it, the account that
 * instance accepted the bearer as, and whether one was presented
 * (environments-18). */
function receivedFor(registry: StandinRegistry, from: number, name: string): [string, string | null, string | null, boolean][] {
  return registry.script.received.slice(from)
    .filter((request: StandinRegistryRequest) => request.path.includes(`/${name}/`) || request.path.endsWith(`/${name}`))
    .map((request) => [request.path, request.instance, request.account, request.bearer]);
}

/** Resolve one registry request against a registry outside any core, as
 * another member's home would have locked it: its resolution. */
async function resolvedAt(registry: RegistryClient, name: string, version: string): Promise<Resolution> {
  const text = `format: 1\npackages:\n  ${name}:\n    version: ${version}\n`;
  const result = await resolve({ requests: parseRequests(text), requestsText: text, registry, pathRoot: null, git: gitSource(join(scratch, "resolve-cache")) });
  assert.ok(result.ok, JSON.stringify(result));
  return result.lock.packages[name]!;
}

/** Add a registry request to a clone's environment by hand, with its
 * resolution as another home locked it: `spex.yaml` and `spex.lock`
 * written together, so the lock stands current (environments-3). */
function lockByHand(home: Home, key: string, name: string, version: string, resolution: Resolution): void {
  const clone = environmentRoot(home.dataDir, key);
  const doc = parseDocument(readFileSync(join(clone, "spex.yaml"), "utf8"));
  doc.setIn(["packages", name], doc.createNode({ version }));
  const text = doc.toString({ lineWidth: 0 });
  const lock = parseLock(readFileSync(join(clone, "spex.lock"), "utf8"));
  writeFileSync(join(clone, "spex.yaml"), text);
  writeFileSync(join(clone, "spex.lock"), serializeLock({ ...lock, requests: requestsDigest(text), packages: { ...lock.packages, [name]: resolution } }));
}

/** The `space` a clone's `spex.yaml` names (environments-2). */
function spaceOf(home: Home, key: string): string | undefined {
  return parseRequests(readFileSync(join(environmentRoot(home.dataDir, key), "spex.yaml"), "utf8")).space;
}

/** Pick a project into your namespace at an instance (space-58), its
 * clone moved under that instance's folder (storage-35): its key. */
async function pickAt(home: Home, local: string, host: StandinHost, name: string): Promise<string> {
  const key = hostKey(host, `${LOGIN}/${name}-spex`);
  const mark = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: host.url, groupId: null, name } });
  const row = await home.client.waitRepository(mark, key, (repository) => repository.sync.phase !== "idle" && repository.sync.phase !== "running", 30_000);
  assert.deepEqual([row.sync.phase, row.instance], ["done", host.url], JSON.stringify(row.sync));
  return key;
}

/** Join a repository a group at an instance holds (space-63), pairing
 * `folder` where given: its key, once its row reads reachable. */
async function joinAt(home: Home, host: StandinHost, path: string, folder?: string): Promise<string> {
  const repository = host.script.addRepository({ group: "acme", name: path.split("/").pop()! });
  const key = hostKey(host, path);
  let mark = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  await home.client.waitSpace(mark, (state) => rowsOf(state).some((row) => row.key === key), 30_000);
  mark = home.client.mark();
  await home.client.expectOk("space.join", { instance: host.url, hostId: repository.id, ...(folder ? { folder } : {}) });
  await home.client.waitRepository(mark, key, (row) => row.state === "reachable" && row.sync.phase === "idle" && (folder === undefined || row.folder !== null), 30_000);
  return key;
}

/** Two stand-in instances over one Git backend, each relaying to a
 * stand-in registry of its own, and a home signed in to the first, its
 * default instance, then to the second, the same person at both,
 * holding the second's project and a local-only one (environments-34).
 * A project added is local only, its pairing locking the built-in at
 * the default instance's registry; picked into your namespace at the
 * second, it is the second's project, its built-in locked at the
 * second's origin (environments-11). `registryFetch` stands between the
 * core and every registry where given. */
async function twoInstances(t: TestContext, name: string, registryFetch?: typeof fetch) {
  const R1 = await startStandinRegistry({ dir: join(scratch, `${name}-registry-first`) });
  const R2 = await startStandinRegistry({ dir: join(scratch, `${name}-registry-second`) });
  t.after(() => Promise.all([R1.close(), R2.close()]));
  const first = await startHost({ registry: R1 });
  const second = await startHost({ gitBackend: first, registry: R2, displayName: "Second stand-in" });
  const home = await startHome(name, { host: first, project: false, ...(registryFetch ? { extra: { registryFetch } } : {}) });
  t.after(() => home.stop());
  const signing = home.client.mark();
  await signIn(home, first);
  await home.client.waitRepository(signing, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  await signIn(home, second);

  const { key: added } = await addFolder(home, gitFolder("south"));
  assert.equal(registryOf(lockOf(home, added), BUILTIN_PACKAGE_NAME), first.url);
  const south = await pickAt(home, added, second, "south");
  await environmentOf(home, south, (state) => installedFrom(state, BUILTIN_PACKAGE_NAME, second.url));
  assert.equal(registryOf(lockOf(home, south), BUILTIN_PACKAGE_NAME), second.url);
  // The pick names the second, not the default, as its environment's
  // instance (environments-11, environments-2).
  assert.equal(spaceOf(home, south), second.url);
  assert.equal((await home.client.expectOk("environment.get", { repository: south })).instance, second.url, "the state names the environment's instance");
  const { key: local } = await addFolder(home, gitFolder("local"));
  assert.equal(spaceOf(home, local), undefined, "a local-only project names no space");
  assert.equal((await home.client.expectOk("environment.get", { repository: local })).instance, first.url, "one naming none is the default instance's");
  assert.equal(rowOf(await home.client.expectOk("space.get", {}), local).instance, null, "a project with no instance");
  await environmentOf(home, local, (state) => installedFrom(state, BUILTIN_PACKAGE_NAME, first.url));
  return { R1, R2, first, second, home, south, local };
}

test("environments-34, environments-5, environments-12, environments-3, environments-7, environments-11: the second's project resolves at the second's registry with its token, its lock recording the second's origin, and installs from it, the local-only project resolving at the first's; a lock recording the first's origin for a release the second's registry holds alike keeps it; a legacy project picked at the second keeps legacy source behavior while a fresh join or rebind uses the public registry; a release the second's registry lacks installs from the first's; and a second home installs a private release locked at the first's through the third with its token, failing naming it while signed out there", { timeout: 300_000 }, async (t) => {
  const { R1, R2, first, second, home, south, local } = await twoInstances(t, "instances");
  const third = await startHost({ registry: R1, displayName: "Third stand-in", person: GRACE });

  // Releases: `team/kit` at both registries alike, private at the second
  // to its tokens; `vault/secrets` private at the first's registry to
  // the first's and the third's tokens; `acme/open` public at the
  // first's alone.
  const kit = await release("team/kit");
  const kitChecksum = await publishTo(R2, kit);
  assert.equal(await publishTo(R1, kit), kitChecksum, "one folder, one checksum at both registries");
  R2.script.setPrivate("team", [second.url]);
  await publishTo(R1, await release("vault/secrets"));
  R1.script.setPrivate("vault", [first.url, third.url]);
  await publishTo(R1, await release("acme/open"));

  // The second's project resolves at the second's registry with the
  // second's token — the private release reads there — its lock
  // recording the second's origin, and installs from it; the first's
  // registry is asked nothing (environments-5, environments-12,
  // environments-3, environments-7).
  let one = R1.script.received.length;
  let two = R2.script.received.length;
  await home.client.expectOk("environment.request", { repository: south, name: "team/kit", request: { kind: "registry", version: "^1.0.0" } });
  let state = await environmentOf(home, south, (candidate) => installedFrom(candidate, "team/kit", second.url) || candidate.error !== null);
  assert.equal(state.error, null);
  assert.equal(registryOf(lockOf(home, south), "team/kit"), second.url);
  assert.deepEqual(receivedFor(R2, two, "team/kit"), [
    ["/api/v1/packages/team/kit", second.url, LOGIN, true],
    ["/api/v1/packages/team/kit/1.0.0", second.url, LOGIN, true],
    ["/api/v1/packages/team/kit/1.0.0", second.url, LOGIN, true],
    ["/api/v1/packages/team/kit/1.0.0/download", second.url, LOGIN, true],
  ]);
  assert.deepEqual(receivedFor(R1, one, "team/kit"), []);

  // The local-only project resolves at the first's, the default
  // instance's, with the first's token, its lock recording the first's
  // origin (environments-5, environments-12).
  one = R1.script.received.length;
  two = R2.script.received.length;
  await home.client.expectOk("environment.request", { repository: local, name: "vault/secrets", request: { kind: "registry", version: "^1.0.0" } });
  state = await environmentOf(home, local, (candidate) => installedFrom(candidate, "vault/secrets", first.url) || candidate.error !== null);
  assert.equal(state.error, null);
  assert.equal(registryOf(lockOf(home, local), "vault/secrets"), first.url);
  assert.deepEqual(receivedFor(R1, one, "vault/secrets")[0], ["/api/v1/packages/vault/secrets", first.url, LOGIN, true]);
  assert.ok(receivedFor(R1, one, "vault/secrets").every(([, instance, account, bearer]) => instance === first.url && account === LOGIN && bearer));
  assert.deepEqual(receivedFor(R2, two, "vault/secrets"), []);

  // A lock recording the first's origin for the release the second's
  // registry holds at that version and checksum, resolved again in the
  // second's project, keeps the first's origin — the second's registry
  // asked, the first's not (environments-5).
  const southLock = lockOf(home, south);
  const kitLocked = southLock.packages["team/kit"]!;
  writeFileSync(join(environmentRoot(home.dataDir, south), "spex.lock"), serializeLock({
    ...southLock, packages: { ...southLock.packages, "team/kit": { ...kitLocked, source: { ...(kitLocked.source as RegistrySourceLock), registry: first.url } } },
  }));
  one = R1.script.received.length;
  two = R2.script.received.length;
  await home.client.expectOk("environment.resolve", { repository: south });
  state = await environmentOf(home, south, (candidate) => installedFrom(candidate, "team/kit", first.url) || candidate.error !== null);
  assert.equal(state.error, null);
  assert.deepEqual(registryOf(lockOf(home, south), "team/kit"), first.url);
  assert.equal((lockOf(home, south).packages["team/kit"]!.source as RegistrySourceLock).checksum, kitChecksum);
  assert.deepEqual(receivedFor(R2, two, "team/kit").map(([path, instance]) => [path, instance]), [
    ["/api/v1/packages/team/kit", second.url],
    ["/api/v1/packages/team/kit/1.0.0", second.url],
  ]);
  assert.deepEqual(receivedFor(R1, one, "team/kit"), []);

  // A public release the second's project locks at the first's origin,
  // which the second's registry lacks, installs from the first's: the
  // second's registry asked first, then the first's with the first's
  // token (environments-7, environments-12).
  lockByHand(home, south, "acme/open", "1.0.0", await resolvedAt(new RegistryClient({ url: first.url }), "acme/open", "1.0.0"));
  assert.equal(registryOf(lockOf(home, south), "acme/open"), first.url);
  one = R1.script.received.length;
  two = R2.script.received.length;
  await home.client.expectOk("environment.install", { repository: south });
  state = await environmentOf(home, south, (candidate) => installedFrom(candidate, "acme/open", first.url) || candidate.error !== null);
  assert.equal(state.error, null);
  assert.deepEqual(receivedFor(R2, two, "acme/open"), [["/api/v1/packages/acme/open/1.0.0", second.url, LOGIN, true]]);
  assert.deepEqual(receivedFor(R1, one, "acme/open"), [
    ["/api/v1/packages/acme/open/1.0.0", first.url, LOGIN, true],
    ["/api/v1/packages/acme/open/1.0.0/download", first.url, LOGIN, true],
  ]);
  assert.equal(registryOf(lockOf(home, south), "acme/open"), first.url, "an install changes no lock");

  // A repository joined at the second with its working folder paired,
  // and one joined bare and paired by a rebind, hold no environment
  // until paired; each new pairing locks the built-in at the public registry
  // (environments-11).
  const joined = await joinAt(home, second, "acme/joined-spex", gitFolder("joined"));
  await environmentOf(home, joined, (candidate) => installedFrom(candidate, BUILTIN_PACKAGE_NAME, PUBLIC_REGISTRY_ORIGIN));
  assert.equal(registryOf(lockOf(home, joined), BUILTIN_PACKAGE_NAME), PUBLIC_REGISTRY_ORIGIN);
  assert.equal(spaceOf(home, joined), second.url, "[environments-11] the pairing names the second as space");
  const rebound = await joinAt(home, second, "acme/rebound-spex");
  assert.equal(existsSync(join(clonePath(home.dataDir, rebound), "spex.yaml")), false, "a bare join requests nothing");
  assert.equal((await home.client.expectOk("environment.get", { repository: rebound })).committed, null, "[environments-14] no working folder on this device: committed is unknown, not false");
  await home.client.expectOk("project.rebind", { projectId: rebound, path: gitFolder("rebound") });
  await environmentOf(home, rebound, (candidate) => installedFrom(candidate, BUILTIN_PACKAGE_NAME, PUBLIC_REGISTRY_ORIGIN));
  assert.equal(registryOf(lockOf(home, rebound), BUILTIN_PACKAGE_NAME), PUBLIC_REGISTRY_ORIGIN);
  assert.equal(spaceOf(home, rebound), second.url, "[environments-11] the pairing names the second as space");
  // One joined at the first, the default instance, with its working
  // folder paired records that Space separately and uses the public registry
  // (environments-11, environments-2).
  const atFirst = await joinAt(home, first, "acme/at-first-spex", gitFolder("at-first"));
  await environmentOf(home, atFirst, (candidate) => installedFrom(candidate, BUILTIN_PACKAGE_NAME, PUBLIC_REGISTRY_ORIGIN));
  assert.equal(registryOf(lockOf(home, atFirst), BUILTIN_PACKAGE_NAME), PUBLIC_REGISTRY_ORIGIN);
  assert.equal(spaceOf(home, atFirst), first.url, "a fresh independent environment records collaboration separately from its public registry");
  // A local-only project picked into the first, the default instance,
  // names it as space all the same (environments-11).
  const { key: north } = await addFolder(home, gitFolder("north"));
  assert.equal(spaceOf(home, north), undefined, "local only: no space");
  const atDefault = await pickAt(home, north, first, "north");
  await environmentOf(home, atDefault, () => spaceOf(home, atDefault) === first.url);
  assert.equal(spaceOf(home, atDefault), first.url, "[environments-34] a pick into the default instance names it as space");
  assert.equal((await home.client.expectOk("environment.get", { repository: atDefault })).instance, first.url, "[environments-2] the state names the environment's instance");

  // A `space` that is no instance origin is refused naming it
  // (environments-2), the files kept as they stand.
  const localYaml = join(environmentRoot(home.dataDir, local), "spex.yaml");
  const localText = readFileSync(localYaml, "utf8");
  writeFileSync(localYaml, localText.replace("format: 1\n", "format: 1\nspace: http://example.com\n"));
  await home.client.expectOk("environment.resolve", { repository: local });
  state = await environmentOf(home, local, (candidate) => candidate.error !== null);
  assert.match(state.error ?? "", /space "http:\/\/example\.com" is not an instance origin/);
  // Its environment then names no instance: a search and a publish are
  // refused with that reason, never sent to the default instance's
  // registry (environments-2, environments-10, environments-17).
  assert.equal(state.instance, null, "a spex.yaml that does not read names no instance");
  const asked = R1.script.requests.length;
  await home.client.expectError("environment.search", { repository: local, query: "search" }, "invalid_request", /^spex\.yaml does not read: space "http:\/\/example\.com" is not an instance origin/);
  await home.client.expectError("environment.publish", { repository: local, name: "acme/none", dryRun: true }, "invalid_request", /^spex\.yaml does not read: space "http:\/\/example\.com" is not an instance origin/);
  assert.equal(R1.script.requests.length, asked, "the default instance's registry is asked nothing");
  writeFileSync(localYaml, localText);

  // A second home signed in to the third alone, which the first's
  // registry also answers, whose local-only project holds the lock the
  // first home's local-only project wrote: a private release at the
  // first's origin.
  const other = await startHome("third", { host: third, project: false });
  t.after(() => other.stop());
  const otherSigning = other.client.mark();
  await signIn(other, third);
  await other.client.waitRepository(otherSigning, `${GRACE.login}/${GRACE.login}-spex`, (repository) => repository.sync.phase === "done", 30_000);
  const { key: copy } = await addFolder(other, gitFolder("copy"));
  await environmentOf(other, copy, (candidate) => installedFrom(candidate, BUILTIN_PACKAGE_NAME, third.url));
  for (const file of ["spex.yaml", "spex.lock"]) {
    writeFileSync(join(environmentRoot(other.dataDir, copy), file), readFileSync(join(environmentRoot(home.dataDir, local), file)));
  }
  assert.equal(registryOf(lockOf(other, copy), "vault/secrets"), first.url);
  await assert.rejects(new RegistryClient({ url: first.url }).version("vault/secrets", "1.0.0"), (error: unknown) => error instanceof RegistryError && error.kind === "not_found",
    "the first's registry refuses the private release without a token");

  // Signed out of the third, nothing serves it: the registry of the
  // environment's instance — the home's default, the third, whose
  // `spex.yaml` names no space (environments-2) — is asked with no
  // token, then the first's, the lock's, with none, and the install
  // fails naming the spec package, the last files staying
  // (environments-7, environments-12).
  await signOut(other, third);
  one = R1.script.received.length;
  await other.client.expectOk("environment.install", { repository: copy });
  state = await environmentOf(other, copy, (candidate) => candidate.error !== null);
  assert.match(state.error ?? "", /vault\/secrets/);
  assert.equal(state.packages.find((pkg) => pkg.name === "vault/secrets")?.installed, false);
  assert.deepEqual(receivedFor(R1, one, "vault/secrets"), [
    ["/api/v1/packages/vault/secrets/1.0.0", third.url, null, false],
    ["/api/v1/packages/vault/secrets/1.0.0", first.url, null, false],
  ]);

  // Signed in to the third again, it installs through the third, the
  // environment's instance, with the third's token, the first's
  // registry asked nothing directly; the lock still records the first's
  // origin (environments-7, environments-12).
  await signIn(other, third);
  one = R1.script.received.length;
  await other.client.expectOk("environment.install", { repository: copy });
  state = await environmentOf(other, copy, (candidate) => installedFrom(candidate, "vault/secrets", first.url) || candidate.error !== null);
  assert.equal(state.error, null);
  assert.deepEqual(receivedFor(R1, one, "vault/secrets"), [
    ["/api/v1/packages/vault/secrets/1.0.0", third.url, GRACE.login, true],
    ["/api/v1/packages/vault/secrets/1.0.0/download", third.url, GRACE.login, true],
  ]);
  assert.equal(registryOf(lockOf(other, copy), "vault/secrets"), first.url);
});

test("environments-34, environments-12, git-host-4: with the first's registry answering token_revoked to the first's tokens, a resolution in the local-only project signs the first instance alone out and fails, the second staying signed in and its project resolving and installing; a refusal of a pair a refresh replaced meanwhile signs nothing out and fails as changed meanwhile", { timeout: 300_000 }, async (t) => {
  const holds = holdingFetch();
  const { R1, R2, first, second, home, south, local } = await twoInstances(t, "refused", holds.fetch);
  await publishTo(R1, await release("acme/open"));
  await publishTo(R2, await release("team/kit"));
  R2.script.setPrivate("team", [second.url]);
  const pairs = (): Record<string, StoredCredential> => (parseYaml(readFileSync(credentialsPath(home.dataDir), "utf8")) as { hosts: Record<string, StoredCredential> }).hosts;
  const signedIn = async (): Promise<[boolean | undefined, boolean | undefined][]> => {
    const space = await home.client.expectOk("space.get", {});
    return [first, second].map((host) => [instanceOf(space, host.url)?.signedIn, instanceOf(space, host.url)?.hostSignedOut]);
  };

  // The local-only project locks a public release at the first's
  // registry, the default instance's, asked with the first's token.
  await home.client.expectOk("environment.request", { repository: local, name: "acme/open", request: { kind: "registry", version: "^1.0.0" } });
  let state = await environmentOf(home, local, (candidate) => installedFrom(candidate, "acme/open", first.url) || candidate.error !== null);
  assert.equal(state.error, null);

  // The first's registry now refuses the first's tokens. A refusal held
  // while a refresh replaces the pair that presented it answers that
  // pair alone: nothing is removed or signed out, the refreshed pair
  // stays, and the resolution fails as changed meanwhile (git-host-4).
  R1.script.refuseTokens(first.url);
  const presented = pairs()[first.url]!;
  let one = R1.script.received.length;
  const gate = holds.hold((path, status) => path === "/api/v1/packages/acme/open" && status === 401);
  await home.client.expectOk("environment.resolve", { repository: local });
  try {
    await gate.reached;
    first.script.expireAccess();
    const outside = new GitHostClient({ url: first.url, label: "Spex on test", credentials: fileCredentialStore(home.dataDir, first.url) });
    assert.equal((await outside.me()).login, LOGIN);
  } finally {
    gate.release();
  }
  const refreshed = pairs()[first.url];
  assert.ok(refreshed && refreshed.access !== presented.access, "a refresh replaced the pair meanwhile");
  state = await environmentOf(home, local, (candidate) => candidate.error !== null);
  assert.match(state.error ?? "", /changed meanwhile/);
  assert.deepEqual(receivedFor(R1, one, "acme/open"), [["/api/v1/packages/acme/open", first.url, LOGIN, true]]);
  assert.deepEqual(await signedIn(), [[true, false], [true, false]]);
  assert.equal(pairs()[first.url]?.access, refreshed.access, "the refreshed pair stays");

  // Refused the stored pair, a resolution in the local-only project
  // signs the first alone out — its credential gone, its entry kept,
  // the sign-out said as the host's with its login — and fails; the
  // second's token, entry and rows stay (environments-12, git-host-4).
  one = R1.script.received.length;
  const mark = home.client.mark();
  await home.client.expectOk("environment.resolve", { repository: local });
  const out = await home.client.waitSpace(mark, (space) => instanceOf(space, first.url)?.signedIn === false, 30_000);
  assert.equal(instanceOf(out, first.url)?.account.login, LOGIN);
  state = await environmentOf(home, local, (candidate) => candidate.error !== null && !/changed meanwhile/.test(candidate.error));
  assert.match(state.error ?? "", /acme\/open/);
  assert.deepEqual(receivedFor(R1, one, "acme/open"), [["/api/v1/packages/acme/open", first.url, LOGIN, true]]);
  assert.deepEqual(await signedIn(), [[false, true], [true, false]]);
  assert.deepEqual(Object.keys(pairs()), [second.url]);
  assert.equal(rowOf(await home.client.expectOk("space.get", {}), south).state, "reachable");

  // The second's project resolves and installs at the second's registry
  // with the second's token, the private release reading there.
  let two = R2.script.received.length;
  await home.client.expectOk("environment.request", { repository: south, name: "team/kit", request: { kind: "registry", version: "^1.0.0" } });
  state = await environmentOf(home, south, (candidate) => installedFrom(candidate, "team/kit", second.url) || candidate.error !== null);
  assert.equal(state.error, null);
  two = R2.script.received.length - two;
  assert.ok(two > 0);
  assert.ok(R2.script.received.slice(-two).every((request) => request.instance === second.url && request.account === LOGIN && request.bearer), "every request the second's");
  one = R1.script.received.length;
  await home.client.expectOk("environment.install", { repository: south });
  state = await environmentOf(home, south, (candidate) => installedFrom(candidate, "team/kit", second.url) || candidate.error !== null);
  assert.equal(state.error, null);
  assert.equal(R1.script.received.length, one, "the first's registry is asked nothing");

  // Signed out there, the local-only project's resolution asks the
  // first's registry with no token, and the public release resolves
  // (environments-12).
  one = R1.script.received.length;
  await home.client.expectOk("environment.resolve", { repository: local });
  state = await environmentOf(home, local, (candidate) => candidate.error === null);
  const asked = receivedFor(R1, one, "acme/open");
  assert.ok(asked.length > 0 && asked.every(([, instance, account, bearer]) => instance === first.url && account === null && !bearer), JSON.stringify(asked));
  assert.deepEqual(await signedIn(), [[false, true], [true, false]]);
});

test("environments-34, environments-13, environments-29: a Git source at the shared Git backend's origin, requested in the second's project, is fetched at resolution and at install with the credential the second brokers, its request, its locked source and its failures reading as the second's display name; in the local-only project the first brokers it and names it; and with the second signed out, the first brokers it for the second's project", { timeout: 300_000 }, async (t) => {
  const { first, second, home, south, local } = await twoInstances(t, "git-source");
  assert.equal(second.gitOrigin, first.gitOrigin, "one Git backend, one Git origin");
  const SECOND = "Second stand-in";
  const FIRST = "Stand-in Git host";
  const NAME = "acme/toolbox";

  // A release in a repository of the person's namespace, which both
  // instances list over their shared Git backend: any instance over it
  // may broker its credential, and its transport records which did.
  const toolbox = second.script.addRepository({ group: LOGIN, name: "toolbox" });
  const work = join(scratch, "git-source-toolbox");
  git(scratch, "clone", "-q", toolbox.bare, work);
  cpSync(await release(NAME), join(work, "pkg"), { recursive: true });
  git(work, "add", "-A");
  git(work, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "Release");
  git(work, "push", "-q", "origin", "HEAD:main");
  const commit = git(work, "rev-parse", "HEAD");
  const repo = `${second.gitOrigin}/${LOGIN}/toolbox.git`;
  const request = { kind: "git" as const, git: repo, rev: "main", path: "pkg" };
  const transports = first.script.transportCredentials;
  const brokers = (from: number): string[] => [...new Set(transports.slice(from).filter((entry) => entry.path.includes(`/${LOGIN}/toolbox.git/`)).map((entry) => entry.instance))];
  const installed = (state: EnvironmentState): boolean => state.packages.some((pkg) => pkg.name === NAME && pkg.installed);
  const detailOf = (state: EnvironmentState): string | undefined => state.packages.find((pkg) => pkg.name === NAME)?.source.detail;
  const named = (text: string, name: string, other: string): void => {
    assert.ok(text.includes(name), `${JSON.stringify(text)} names ${name}`);
    assert.ok(!text.includes(other) && !text.includes(second.gitOrigin), `${JSON.stringify(text)} names neither ${other} nor the Git origin`);
  };

  // Requested in the second's project, the source resolves with the
  // credential the second brokers, the environment's own instance,
  // though the first, the default instance, lies at the same Git origin
  // (environments-13); the lock holds the locator and the commit, while
  // the request and the locked source read as the second's name
  // (environments-29).
  let from = transports.length;
  await home.client.expectOk("environment.request", { repository: south, name: NAME, request });
  let state = await environmentOf(home, south, (candidate) => installed(candidate) || candidate.error !== null);
  assert.equal(state.error, null);
  assert.deepEqual(lockOf(home, south).packages[NAME]!.source, { git: repo, commit, path: "pkg" });
  assert.deepEqual(brokers(from), [second.url], "the second brokered the resolution's fetch");
  assert.deepEqual(state.requests[NAME], { kind: "git", repository: SECOND, rev: "main", path: "pkg" });
  assert.equal(detailOf(state), `${SECOND} ${commit.slice(0, 12)} pkg`);
  assert.ok(!JSON.stringify(state).includes(second.gitOrigin), "no Git origin in the state");

  // Its files gone from its root's .spex/ and the store, and its fetched
  // repository from the cache, an install fetches the locked commit with
  // the credential the second brokers (environments-13).
  const files = lockOf(home, south).packages[NAME]!.files;
  const stored = files.map((file) => join(home.dataDir, "store", ...(file.executable ? ["x"] : []), file.sha256));
  assert.ok(stored.length > 0 && stored.every((file) => existsSync(file)), "the store holds its files");
  for (const file of stored) rmSync(file);
  const southRoot = (await home.client.expectOk("environment.get", { repository: south })).pathRoot!;
  rmSync(join(southRoot, ".spex", "packages", ...NAME.split("/")), { recursive: true });
  rmSync(join(home.dataDir, "cache", "git"), { recursive: true, force: true });
  from = transports.length;
  await home.client.expectOk("environment.install", { repository: south });
  state = await environmentOf(home, south, (candidate) => installed(candidate) || candidate.error !== null);
  assert.equal(state.error, null);
  assert.deepEqual(brokers(from), [second.url], "the second brokered the install's fetch");
  assert.ok(stored.every((file) => existsSync(file)), "the store holds its files again");

  // A transport the Git backend refuses, at the second's credential,
  // fails the resolution as the second's refusal; a revision the
  // repository lacks fails naming the second; neither names the first
  // or says the locator (environments-29).
  second.script.refuseTransport("Members decide who may read");
  try {
    from = transports.length;
    await home.client.expectOk("environment.resolve", { repository: south });
    state = await environmentOf(home, south, (candidate) => candidate.error !== null);
  } finally {
    second.script.refuseTransport(null);
  }
  named(state.error!, SECOND, FIRST);
  assert.deepEqual(brokers(from), [second.url]);
  await home.client.expectOk("environment.request", { repository: south, name: NAME, request: { ...request, rev: "no-such-rev" } });
  state = await environmentOf(home, south, (candidate) => candidate.error !== null && candidate.requests[NAME]?.kind === "git" && candidate.requests[NAME].rev === "no-such-rev");
  named(state.error!, SECOND, FIRST);
  assert.match(state.error!, /no-such-rev/);
  assert.deepEqual(state.requests[NAME], { kind: "git", repository: SECOND, rev: "no-such-rev", path: "pkg" });
  await home.client.expectOk("environment.request", { repository: south, name: NAME, request });
  state = await environmentOf(home, south, (candidate) => (installed(candidate) && candidate.error === null) || (candidate.error !== null && !candidate.error.includes("no-such-rev")));
  assert.equal(state.error, null);

  // In the local-only project, which has no instance, the same source is
  // brokered by the first, the earliest instance in the home's list, and
  // reads as the first's name (environments-13, environments-29).
  from = transports.length;
  await home.client.expectOk("environment.request", { repository: local, name: NAME, request });
  state = await environmentOf(home, local, (candidate) => installed(candidate) || candidate.error !== null);
  assert.equal(state.error, null);
  assert.deepEqual(brokers(from), [first.url], "the first brokered the local-only project's fetch");
  assert.deepEqual(state.requests[NAME], { kind: "git", repository: FIRST, rev: "main", path: "pkg" });
  assert.equal(detailOf(state), `${FIRST} ${commit.slice(0, 12)} pkg`);

  // Signed out of the second, its project's source is brokered by the
  // first, signed in at the same Git origin: a signed-out instance
  // brokers nothing (environments-13).
  await signOut(home, second);
  from = transports.length;
  await home.client.expectOk("environment.resolve", { repository: south });
  state = await environmentOf(home, south, (candidate) => installed(candidate) || candidate.error !== null);
  assert.equal(state.error, null);
  assert.deepEqual(brokers(from), [first.url], "the first brokered the fetch once the second signed out");
});

test("environments-34, environments-17, environments-12: environment.search for the second's project lists the second's registry's spec packages and not the first's, asked through the second with its token, the local-only project and your own group listing the first's and a key naming no clone refused; with the second's registry refusing the second's token, the search is refused and signs the second alone out, a later search asking the second's registry with no token", { timeout: 300_000 }, async (t) => {
  const { R1, R2, first, second, home, south, local } = await twoInstances(t, "search");
  await publishTo(R1, await release("acme/search-first"));
  await publishTo(R2, await release("team/search-second"));
  const names = (packages: { name: string }[]): string[] => packages.map((entry) => entry.name).sort();
  // What a registry received for the searches after a mark: the search
  // and each listed spec package's versions, with the instance that
  // relayed each, its account and whether a bearer came (environments-18).
  const searched = (registry: StandinRegistry, from: number): [string, string | null, string | null, boolean][] =>
    registry.script.received.slice(from)
      .filter((request) => request.path === "/api/v1/search" || request.path.includes("/search-"))
      .map((request) => [request.path, request.instance, request.account, request.bearer]);

  // The second's project searches the second's registry, asked through
  // the second with its token; the first's registry is asked nothing
  // (environments-17, environments-12).
  let one = R1.script.received.length;
  let two = R2.script.received.length;
  let found = await home.client.expectOk("environment.search", { repository: south, query: "search" });
  assert.deepEqual(found.packages, [{ name: "team/search-second", description: "The team/search-second spec package", versions: ["1.0.0"] }]);
  assert.deepEqual(searched(R2, two), [
    ["/api/v1/search", second.url, LOGIN, true],
    ["/api/v1/packages/team/search-second", second.url, LOGIN, true],
  ]);
  assert.deepEqual(searched(R1, one), []);

  // The local-only project, which has no instance, searches the first's
  // registry, the default instance's, with the first's token; so does
  // your own group, whose own repository's remote names the first
  // (environments-17, environments-12).
  for (const key of [local, HOST_OWN]) {
    one = R1.script.received.length;
    two = R2.script.received.length;
    found = await home.client.expectOk("environment.search", { repository: key, query: "search" });
    assert.deepEqual(names(found.packages), ["acme/search-first"], key);
    assert.deepEqual(searched(R1, one), [
      ["/api/v1/search", first.url, LOGIN, true],
      ["/api/v1/packages/acme/search-first", first.url, LOGIN, true],
    ], key);
    assert.deepEqual(searched(R2, two), [], key);
  }

  // A key naming no clone on this device is refused, no registry asked
  // (environments-17).
  one = R1.script.received.length;
  two = R2.script.received.length;
  await home.client.expectError("environment.search", { repository: hostKey(second, "acme/none-spex"), query: "search" }, "not_found");
  assert.deepEqual([searched(R1, one), searched(R2, two)], [[], []]);

  // The second's registry refusing the second's token refuses the
  // search and signs the second alone out, the first staying signed in
  // (environments-17, environments-12).
  R2.script.refuseTokens(second.url);
  two = R2.script.received.length;
  const mark = home.client.mark();
  await home.client.expectError("environment.search", { repository: south, query: "search" }, "invalid_request");
  const out = await home.client.waitSpace(mark, (space) => instanceOf(space, second.url)?.signedIn === false, 30_000);
  assert.deepEqual([instanceOf(out, first.url)?.signedIn, instanceOf(out, second.url)?.hostSignedOut], [true, true]);
  assert.deepEqual(searched(R2, two), [["/api/v1/search", second.url, LOGIN, true]]);

  // Signed out there, the second's project still searches the second's
  // registry, its instance's, with no token (environments-17,
  // environments-12).
  one = R1.script.received.length;
  two = R2.script.received.length;
  found = await home.client.expectOk("environment.search", { repository: south, query: "search" });
  assert.deepEqual(names(found.packages), ["team/search-second"]);
  assert.deepEqual(searched(R2, two), [
    ["/api/v1/search", second.url, null, false],
    ["/api/v1/packages/team/search-second", second.url, null, false],
  ]);
  assert.deepEqual(searched(R1, one), []);
});

test("environments-34, environments-10, environments-17, environments-5: a publish from the second's project lands at the second's registry as the second's account and one from the local-only project at the first's; once the second registry is signed out, a publish from its project is refused as not signed in there, naming it, and nothing is uploaded; the first then forgotten, your own group's environment, whose own repository was created at the first and now syncs with the second, resolves at the second's registry, its lock recording the second's origin, and a publish from it lands there", { timeout: 300_000 }, async (t) => {
  const { R1, R2, first, second, home, south, local } = await twoInstances(t, "publish");
  await registrySignIn(home, first);
  await registrySignIn(home, second);
  // Each upload a registry received after a mark: its path, the instance
  // that relayed it, that instance's account and whether a bearer came
  // (environments-18).
  const uploads = (registry: StandinRegistry, from: number): [string, string | null, string | null, boolean][] =>
    registry.script.received.slice(from).filter((request) => request.method === "PUT").map((request) => [request.path, request.instance, request.account, request.bearer]);
  // Whether a registry holds a release, asked of it directly.
  const holds = async (registry: StandinRegistry, name: string): Promise<boolean> => (await fetch(`${registry.url}/api/v1/packages/${name}/1.0.0`)).ok;
  // A spec package under development in an environment's path root, as
  // an authoring session keeps it, at spex-packages/<org>/<pkg>/
  // (environments-10): its name, by which it publishes.
  const underDevelopment = async (key: string, name: string): Promise<string> => {
    const root = (await home.client.expectOk("environment.get", { repository: key })).pathRoot;
    assert.ok(root, `${key} has a path root on this device`);
    await release(name, "1.0.0", join(root, "spex-packages", ...name.split("/")));
    return name;
  };
  // Publish it by name and wait for the publish to end: the
  // environment's state.
  const publish = async (key: string, name: string): Promise<EnvironmentState> => {
    assert.deepEqual(await home.client.expectOk("environment.publish", { repository: key, name }), { accepted: true });
    return environmentOf(home, key, (state) => state.published?.name === name || state.error !== null);
  };

  // A publish from the second's project goes to the second's registry,
  // through the second as its account, and reads its page there; the
  // first's registry, the default instance's, receives nothing
  // (environments-10, environments-17).
  let one = R1.script.received.length;
  let two = R2.script.received.length;
  let state = await publish(south, await underDevelopment(south, "acme/south-pub"));
  assert.equal(state.error, null);
  assert.deepEqual(state.published, { name: "acme/south-pub", version: "1.0.0", url: `${second.url}/acme/south-pub` });
  assert.deepEqual(uploads(R2, two), [["/api/v1/packages/acme/south-pub/1.0.0", second.url, LOGIN, true]]);
  assert.deepEqual(uploads(R1, one), []);
  assert.deepEqual([await holds(R2, "acme/south-pub"), await holds(R1, "acme/south-pub")], [true, false]);

  // A publish from the local-only project, which has no instance, goes
  // to the first's registry, the default instance's, as the first's
  // account (environments-10).
  one = R1.script.received.length;
  two = R2.script.received.length;
  state = await publish(local, await underDevelopment(local, "acme/local-pub"));
  assert.equal(state.error, null);
  assert.deepEqual(state.published, { name: "acme/local-pub", version: "1.0.0", url: `${first.url}/acme/local-pub` });
  assert.deepEqual(uploads(R1, one), [["/api/v1/packages/acme/local-pub/1.0.0", first.url, LOGIN, true]]);
  assert.deepEqual(uploads(R2, two), []);
  assert.deepEqual([await holds(R1, "acme/local-pub"), await holds(R2, "acme/local-pub")], [true, false]);

  // Signed out of the second registry alone, a publish from its project is
  // refused as not signed in there, naming the second by its display
  // name, though both Spaces stay signed in; nothing reaches
  // either registry (environments-10, environments-17).
  await home.client.expectOk("registry.signout", { origin: second.url });
  const later = await underDevelopment(south, "acme/south-later");
  one = R1.script.received.length;
  two = R2.script.received.length;
  await home.client.expectError("environment.publish", { repository: south, name: later }, "invalid_request", new RegExp(`^Sign in to registry to publish at ${new URL(second.url).host.replaceAll(".", "\\.")}$`));
  assert.deepEqual([R1.script.received.length, R2.script.received.length], [one, two], "no registry is asked");
  assert.deepEqual([await holds(R2, "acme/south-later"), await holds(R1, "acme/south-later")], [false, false]);

  // Signed in to the second again, the first signed out and forgotten:
  // your own group's own repository, created at the first, follows the
  // second — the second lists it over the shared Git backend — and syncs
  // with it.
  await registrySignIn(home, second);
  await signOut(home, first);
  const before = instanceOf(await home.client.expectOk("space.get", {}), second.url)?.readAt ?? 0;
  const mark = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  await home.client.waitSpace(mark, (space) => {
    const at = instanceOf(space, second.url);
    return at?.read.phase === "idle" && (at.readAt ?? 0) > before;
  }, 30_000);
  const forgotten = await forget(home, first);
  assert.equal(rowOf(forgotten, HOST_OWN).instance, second.url);
  const synced = await home.client.settle("space.sync", { repository: HOST_OWN }, 30_000);
  assert.deepEqual([synced.sync.phase, synced.instance, synced.key], ["done", second.url, HOST_OWN], JSON.stringify(synced.sync));

  // Your own group's environment resolves a spec package newly requested
  // there at the second's registry, with the second's token — the
  // release private there to it — its lock recording the second's
  // origin; the built-in keeps the origin its lock records, as it
  // resolves to the same version and checksum (environments-5). The
  // first's registry is asked nothing.
  await publishTo(R2, await release("team/own-kit"));
  R2.script.setPrivate("team", [second.url]);
  one = R1.script.received.length;
  two = R2.script.received.length;
  await home.client.expectOk("environment.request", { repository: HOST_OWN, name: "team/own-kit", request: { kind: "registry", version: "^1.0.0" } });
  state = await environmentOf(home, HOST_OWN, (candidate) => installedFrom(candidate, "team/own-kit", second.url) || candidate.error !== null);
  assert.equal(state.error, null);
  const ownLock = lockOf(home, HOST_OWN);
  assert.equal(registryOf(ownLock, "team/own-kit"), second.url);
  assert.equal(registryOf(ownLock, BUILTIN_PACKAGE_NAME), first.url);
  const asked = receivedFor(R2, two, "team/own-kit");
  assert.deepEqual(asked[0], ["/api/v1/packages/team/own-kit", second.url, LOGIN, true]);
  assert.ok(asked.every(([, instance, account, bearer]) => instance === second.url && account === LOGIN && bearer), JSON.stringify(asked));
  assert.equal(R1.script.received.length, one, "the first's registry is asked nothing");

  // A publish from your own group lands at the second's registry, as the
  // second's account; the first's registry is asked nothing
  // (environments-10).
  one = R1.script.received.length;
  two = R2.script.received.length;
  state = await publish(HOST_OWN, await underDevelopment(HOST_OWN, "acme/own-pub"));
  assert.equal(state.error, null);
  assert.deepEqual(state.published, { name: "acme/own-pub", version: "1.0.0", url: `${second.url}/acme/own-pub` });
  assert.deepEqual(uploads(R2, two), [["/api/v1/packages/acme/own-pub/1.0.0", second.url, LOGIN, true]]);
  assert.equal(R1.script.received.length, one, "the first's registry is asked nothing");
  assert.deepEqual([await holds(R2, "acme/own-pub"), await holds(R1, "acme/own-pub")], [true, false]);
});

test("environments-34, environments-27: the orgs asked for the second's project are asked of the second's registry once, relayed by the second with its token as its account, the first's registry asked nothing; the local-only project's are asked of the first's with the first's token", { timeout: 300_000 }, async (t) => {
  const { R1, R2, first, second, home, south, local } = await twoInstances(t, "orgs");
  await registrySignIn(home, first);
  await registrySignIn(home, second);
  // Each registry lists an org for the bearers its own instance accepts
  // (environments-18), at the namespace both projects' keys name, so an
  // org replied is the one its registry read (playbook-library-103).
  R1.script.setOrgs(first.url, [{ name: "first-org", path: LOGIN, role: "owner" }]);
  R2.script.setOrgs(second.url, [{ name: "second-org", path: LOGIN, role: "owner" }]);
  // Each orgs request a registry received after a mark: its method, the
  // instance that relayed it, that instance's account and whether a
  // bearer came (environments-18).
  const orgsAsked = (registry: StandinRegistry, from: number): [string, string | null, string | null, boolean][] =>
    registry.script.received.slice(from).filter((request) => request.path === "/api/v1/account/orgs").map((request) => [request.method, request.instance, request.account, request.bearer]);

  // The second's project asks the second's registry, through the second
  // with its token, read as the second's account (environments-27).
  let one = R1.script.received.length;
  let two = R2.script.received.length;
  assert.equal((await home.client.expectOk("draft.defaults", { projectId: south })).org, "second-org");
  assert.deepEqual(orgsAsked(R2, two), [["GET", second.url, LOGIN, true]]);
  assert.deepEqual(orgsAsked(R1, one), []);

  // The local-only project, which has no instance, asks the first's
  // registry, the default instance's, with the first's token
  // (environments-27).
  one = R1.script.received.length;
  two = R2.script.received.length;
  assert.equal((await home.client.expectOk("draft.defaults", { projectId: local })).org, "first-org");
  assert.deepEqual(orgsAsked(R1, one), [["GET", first.url, LOGIN, true]]);
  assert.deepEqual(orgsAsked(R2, two), []);
});

test("environments-34, environments-11, storage-31: with the first, the default instance, signed out and your own group's own repository following the second by its remote, a start finding your own group's environment gone requests the built-in spec package at the public registry with the second still selected for collaboration", { timeout: 300_000 }, async (t) => {
  const { first, second, home } = await twoInstances(t, "own-prepare");

  // The first signed out, the second read again: your own group's own
  // repository, created at the first, follows the second — the second
  // lists it over the shared Git backend — its remote renamed to the
  // second's folder by its next sync (space-60, storage-34).
  await signOut(home, first);
  const before = instanceOf(await home.client.expectOk("space.get", {}), second.url)?.readAt ?? 0;
  const mark = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  await home.client.waitSpace(mark, (space) => {
    const at = instanceOf(space, second.url);
    return at?.read.phase === "idle" && (at.readAt ?? 0) > before;
  }, 30_000);
  const synced = await home.client.settle("space.sync", { repository: HOST_OWN }, 30_000);
  assert.deepEqual([synced.sync.phase, synced.instance, synced.key], ["done", second.url, HOST_OWN], JSON.stringify(synced.sync));
  assert.deepEqual(remoteNamesOf(ownClone(home.dataDir)), [hostFolder(second)]);

  // Stopped, its environment taken away, then started again: the first
  // is still the home's default instance, signed out, and your own
  // group's own repository reads as the second's by its remote
  // (storage-31).
  await home.stop();
  for (const file of ["spex.yaml", "spex.lock"]) rmSync(join(ownClone(home.dataDir), file));
  const again = await startHome("own-prepare", { dataDir: home.dataDir, host: first, project: false });
  t.after(() => again.stop());
  const state = await again.client.expectOk("space.get", {});
  assert.equal(state.defaultInstance, first.url);
  assert.deepEqual([instanceOf(state, first.url)?.signedIn, instanceOf(state, second.url)?.signedIn], [false, true]);
  assert.equal(rowOf(state, HOST_OWN).instance, second.url);

  // The start requests the built-in spec package in your own group's
  // environment again, locked at the public registry while its Space
  // still follows the remote at the second
  // (environments-11).
  assert.ok(parseRequests(readFileSync(join(ownClone(again.dataDir), "spex.yaml"), "utf8")).packages[BUILTIN_PACKAGE_NAME], "the built-in is requested");
  assert.equal(spaceOf(again, HOST_OWN), second.url, "[environments-11] with space naming the second, not the default");
  assert.equal(registryOf(lockOf(again, HOST_OWN), BUILTIN_PACKAGE_NAME), PUBLIC_REGISTRY_ORIGIN);
  await environmentOf(again, HOST_OWN, (candidate) => installedFrom(candidate, BUILTIN_PACKAGE_NAME, PUBLIC_REGISTRY_ORIGIN));
});
