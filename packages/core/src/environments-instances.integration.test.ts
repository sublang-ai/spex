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
// to.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseDocument } from "yaml";

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
import { clonePath, createSpaceHarness, hostKey, repositoryOf, rowsOf } from "./testing/space-harness.js";
import type { StandinHost } from "./testing/standin-host.js";
import { makeRelease, startStandinRegistry, type StandinRegistry, type StandinRegistryRequest } from "./testing/standin-registry.js";

const fixture = createSpaceHarness();
const { scratch, gitFolder, addFolder, sleep, startHome, startHost, signIn, signOut } = fixture;
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

test("environments-34, environments-5, environments-12, environments-3, environments-7, environments-11: the second's project resolves at the second's registry with its token, its lock recording the second's origin, and installs from it, the local-only project resolving at the first's; a lock recording the first's origin for a release the second's registry holds alike keeps it; a project paired at the second by a pick, a join or a rebind locks the built-in there; a release the second's registry lacks installs from the first's; and a second home installs a private release locked at the first's through the third with its token, failing naming it while signed out there", { timeout: 300_000 }, async (t) => {
  const R1 = await startStandinRegistry({ dir: join(scratch, "registry-first") });
  const R2 = await startStandinRegistry({ dir: join(scratch, "registry-second") });
  t.after(() => Promise.all([R1.close(), R2.close()]));
  const first = await startHost({ registry: R1 });
  const second = await startHost({ gitBackend: first, registry: R2, displayName: "Second stand-in" });
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

  // A home signed in to the first, its default instance, then to the
  // second over the first's Git backend, the same person at both.
  const home = await startHome("instances", { host: first, project: false });
  t.after(() => home.stop());
  const signing = home.client.mark();
  await signIn(home, first);
  await home.client.waitRepository(signing, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  await signIn(home, second);

  // A project added is local only, its pairing locking the built-in at
  // the default instance's registry; picked into your namespace at the
  // second, it is the second's project, its built-in locked at the
  // second's origin (environments-11).
  const { key: added } = await addFolder(home, gitFolder("south"));
  assert.equal(registryOf(lockOf(home, added), BUILTIN_PACKAGE_NAME), first.url);
  const south = await pickAt(home, added, second, "south");
  await environmentOf(home, south, (state) => installedFrom(state, BUILTIN_PACKAGE_NAME, second.url));
  assert.equal(registryOf(lockOf(home, south), BUILTIN_PACKAGE_NAME), second.url);
  const { key: local } = await addFolder(home, gitFolder("local"));
  assert.equal(repositoryOf(await home.client.expectOk("space.get", {}), local).instance, null, "a project with no instance");
  await environmentOf(home, local, (state) => installedFrom(state, BUILTIN_PACKAGE_NAME, first.url));

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
