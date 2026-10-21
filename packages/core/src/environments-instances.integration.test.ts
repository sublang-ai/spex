// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Environments at several instances (environments-34, DR-127), through
// real cores: a home signed in to two stand-in instances over one Git
// backend, each relaying to a stand-in registry of its own, the first
// the home's default instance; and a second home signed in only to a
// third stand-in instance that the first's registry also answers. An
// environment resolves at its instance's registry, or the default
// instance's where it has none, with that instance's token, keeping the
// registry its lock records for the same release; a project paired at
// an instance locks the built-in spec package there; and an install
// takes each locked release from the environment's instance, else the
// registry its lock records, else any instance the home is signed in
// to. A search asks the registry of the environment it names. A
// registry refusing an instance's token signs that instance alone out,
// where that token is still the stored pair's.

import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml, parseDocument } from "yaml";

import {
  BUILTIN_PACKAGE_NAME,
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
} from "./environment/index.js";
import type { EnvironmentState } from "./protocol.js";
import { credentialsPath, fileCredentialStore, GitHostClient, type StoredCredential } from "./git-host.js";
import { holdingFetch } from "./testing/holding-fetch.js";
import { clonePath, createSpaceHarness, hostKey, instanceOf, repositoryOf, rowsOf } from "./testing/space-harness.js";
import type { StandinHost } from "./testing/standin-host.js";
import { makeRelease, startStandinRegistry, type StandinRegistry, type StandinRegistryRequest } from "./testing/standin-registry.js";

const fixture = createSpaceHarness();
const { scratch, git, gitFolder, addFolder, sleep, startHome, startHost, signIn, signOut } = fixture;
test.after(() => fixture.dispose());

type Home = Awaited<ReturnType<typeof startHome>>;

/** The stand-ins' default person, and your own group's repository once
 * signed in as them. */
const LOGIN = "ada";
const HOST_OWN = `${LOGIN}/${LOGIN}-spex`;
const GRACE = { id: "1003", login: "grace", displayName: "Grace Hopper" };

/** A release folder holding one skill named after its spec package,
 * under the scratch folder: one folder packs to one archive, so every
 * registry it is published to holds it at one checksum. */
async function release(name: string, version = "1.0.0"): Promise<string> {
  const [org, pkg] = name.split("/") as [string, string];
  const skill = `${pkg}-skill`;
  return makeRelease(join(scratch, "releases", org, pkg, version), {
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

/** A clone's `spex.lock` as written. */
function lockOf(home: Home, key: string): Lock {
  return parseLock(readFileSync(join(clonePath(home.dataDir, key), "spex.lock"), "utf8"));
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
  const clone = clonePath(home.dataDir, key);
  const doc = parseDocument(readFileSync(join(clone, "spex.yaml"), "utf8"));
  doc.setIn(["packages", name], doc.createNode({ version }));
  const text = doc.toString({ lineWidth: 0 });
  const lock = parseLock(readFileSync(join(clone, "spex.lock"), "utf8"));
  writeFileSync(join(clone, "spex.yaml"), text);
  writeFileSync(join(clone, "spex.lock"), serializeLock({ ...lock, requests: requestsDigest(text), packages: { ...lock.packages, [name]: resolution } }));
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
  const { key: local } = await addFolder(home, gitFolder("local"));
  assert.equal(repositoryOf(await home.client.expectOk("space.get", {}), local).instance, null, "a project with no instance");
  await environmentOf(home, local, (state) => installedFrom(state, BUILTIN_PACKAGE_NAME, first.url));
  return { R1, R2, first, second, home, south, local };
}

test("environments-34, environments-5, environments-12, environments-3, environments-7, environments-11: the second's project resolves at the second's registry with its token, its lock recording the second's origin, and installs from it, the local-only project resolving at the first's; a lock recording the first's origin for a release the second's registry holds alike keeps it; a project paired at the second by a pick, a join or a rebind locks the built-in there; a release the second's registry lacks installs from the first's; and a second home installs a private release locked at the first's through the third with its token, failing naming it while signed out there", { timeout: 300_000 }, async (t) => {
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
  writeFileSync(join(clonePath(home.dataDir, south), "spex.lock"), serializeLock({
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
  // until paired; each pairing locks the built-in at the second's origin
  // (environments-11).
  const joined = await joinAt(home, second, "acme/joined-spex", gitFolder("joined"));
  await environmentOf(home, joined, (candidate) => installedFrom(candidate, BUILTIN_PACKAGE_NAME, second.url));
  assert.equal(registryOf(lockOf(home, joined), BUILTIN_PACKAGE_NAME), second.url);
  const rebound = await joinAt(home, second, "acme/rebound-spex");
  assert.equal(existsSync(join(clonePath(home.dataDir, rebound), "spex.yaml")), false, "a bare join requests nothing");
  await home.client.expectOk("project.rebind", { projectId: rebound, path: gitFolder("rebound") });
  await environmentOf(home, rebound, (candidate) => installedFrom(candidate, BUILTIN_PACKAGE_NAME, second.url));
  assert.equal(registryOf(lockOf(home, rebound), BUILTIN_PACKAGE_NAME), second.url);

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
    writeFileSync(join(clonePath(other.dataDir, copy), file), readFileSync(join(clonePath(home.dataDir, local), file)));
  }
  assert.equal(registryOf(lockOf(other, copy), "vault/secrets"), first.url);
  await assert.rejects(new RegistryClient({ url: first.url }).version("vault/secrets", "1.0.0"), (error: unknown) => error instanceof RegistryError && error.kind === "not_found",
    "the first's registry refuses the private release without a token");

  // Signed out of the third, nothing serves it: the first's registry is
  // asked with no token, the third not at all, and the install fails
  // naming the spec package, the last files staying (environments-7,
  // environments-12).
  await signOut(other, third);
  one = R1.script.received.length;
  await other.client.expectOk("environment.install", { repository: copy });
  state = await environmentOf(other, copy, (candidate) => candidate.error !== null);
  assert.match(state.error ?? "", /vault\/secrets/);
  assert.equal(state.packages.find((pkg) => pkg.name === "vault/secrets")?.installed, false);
  assert.deepEqual(receivedFor(R1, one, "vault/secrets"), [["/api/v1/packages/vault/secrets/1.0.0", first.url, null, false]]);

  // Signed in to the third again, it installs through the third with the
  // third's token, after the first's registry refused it without one;
  // the lock still records the first's origin (environments-7,
  // environments-12).
  await signIn(other, third);
  one = R1.script.received.length;
  await other.client.expectOk("environment.install", { repository: copy });
  state = await environmentOf(other, copy, (candidate) => installedFrom(candidate, "vault/secrets", first.url) || candidate.error !== null);
  assert.equal(state.error, null);
  assert.deepEqual(receivedFor(R1, one, "vault/secrets"), [
    ["/api/v1/packages/vault/secrets/1.0.0", first.url, null, false],
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
  assert.equal(repositoryOf(await home.client.expectOk("space.get", {}), south).state, "reachable");

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

  // Its files gone from the clone and the store, and its fetched
  // repository from the cache, an install fetches the locked commit with
  // the credential the second brokers (environments-13).
  const files = lockOf(home, south).packages[NAME]!.files;
  const stored = files.map((file) => join(home.dataDir, "store", ...(file.executable ? ["x"] : []), file.sha256));
  assert.ok(stored.length > 0 && stored.every((file) => existsSync(file)), "the store holds its files");
  for (const file of stored) rmSync(file);
  rmSync(join(clonePath(home.dataDir, south), "packages", ...NAME.split("/")), { recursive: true });
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
