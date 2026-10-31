// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileCredentialStore, GitHostClient } from "@sublang/spex/git-host";
import { PUBLIC_REGISTRY_ORIGIN, publishRelease, RegistryClient, parseLock, requestsDigest } from "@sublang/spex/environment";
import { makeRelease, startStandinRegistry } from "@sublang/spex/testing";
import { holdingFetch, samePair } from "./testing/holding-fetch.js";
import { createSpaceHarness, instanceOf, ownClone, clonePath } from "./testing/space-harness.js";

const harness = createSpaceHarness();
test.after(() => harness.dispose());
async function registrySignIn(home: Awaited<ReturnType<typeof harness.startHome>>, origin: string, host: Awaited<ReturnType<typeof harness.startHost>>) {
  const from = home.client.messages.length;
  const start = await home.client.expectOk("registry.signin.start", { origin });
  if (start.flow === "browser") await (await fetch(start.url)).text();
  else host.script.approveDevice(start.userCode);
  await home.client.waitFor((message) => home.client.messages.indexOf(message) >= from && message.type === "registry.state" && message.state.origin === origin && message.state.account !== null && message.state.signIn.phase === "idle");
}

test("core-service-144/storage-52: same-origin registry and Space grants stay independent across login, refresh, logout and restart", { timeout: 120_000 }, async (t) => {
  const host = await harness.startHost({ displayName: "Shared Space" });
  const home = await harness.startHome("registry-account", { host, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const before = readFileSync(join(home.dataDir, "home.yaml"), "utf8");
  await registrySignIn(home, host.url, host);
  assert.equal(readFileSync(join(home.dataDir, "home.yaml"), "utf8"), before, "registry sign-in creates no Space or placement");
  const registryStore = fileCredentialStore(home.dataDir, host.url, "registry");
  const spaceStore = fileCredentialStore(home.dataDir, host.url, "space");
  assert.ok(await registryStore.read()); assert.equal(await spaceStore.read(), null);
  const space = await harness.signIn(home, host);
  assert.equal(instanceOf(space, host.url)?.signedIn, true);
  const registryPair = await registryStore.read(); const spacePair = await spaceStore.read();
  assert.ok(spacePair); assert.ok(registryPair?.access !== spacePair.access);
  assert.ok(!readFileSync(join(home.dataDir, "local/registry-accounts.json"), "utf8").includes(spacePair.access));
  // A CLI-like client sees and refreshes the same registry slot. It has
  // no home/Space side effects and cannot erase the same-origin Space.
  const cli = new GitHostClient({ url: host.url, scope: "registry", label: "CLI", credentials: registryStore });
  assert.ok(await registryStore.replace(registryPair!, { ...registryPair!, accessExpiresAt: 0 }));
  assert.equal((await cli.me()).login, "ada");
  assert.ok((await registryStore.read())?.refresh !== registryPair?.refresh);
  assert.ok(samePair(await spaceStore.read(), spacePair));
  await home.client.expectOk("space.signout", { instance: host.url });
  assert.equal(await spaceStore.read(), null); assert.equal((await home.client.expectOk("registry.get", { origin: host.url })).account?.login, "ada");
  await harness.signIn(home, host);
  const stillSpace = await spaceStore.read();
  await home.client.expectOk("registry.signout", { origin: host.url });
  assert.ok(samePair(await spaceStore.read(), stillSpace)); assert.equal(await registryStore.read(), null);
  // A credential created outside the IDE must appear without requiring
  // the IDE's metadata file or a registry-created Space entry.
  const flow = await cli.startBrowserSignIn(); await (await fetch(flow.url)).text(); await flow.done;
  assert.equal((await home.client.expectOk("registry.get", { origin: host.url })).account?.login, "ada");
  const refusedPair = await registryStore.read();
  const independentSpace = await spaceStore.read();
  host.script.refuseRefresh = true;
  assert.ok(registryStore.replace(refusedPair, { ...refusedPair!, accessExpiresAt: 0 }));
  assert.equal((await home.client.expectOk("registry.get", { origin: host.url })).account, null);
  assert.equal(await registryStore.read(), null);
  assert.ok(samePair(await spaceStore.read(), independentSpace), "refused registry refresh preserves Space credentials");
  host.script.refuseRefresh = false;
  const again = await cli.startBrowserSignIn(); await (await fetch(again.url)).text(); await again.done;
  const directory = await home.client.expectOk("registry.directory", { origin: host.url });
  assert.deepEqual(directory.spaces, [{ origin: host.url, displayName: "Shared Space", signIn: ["github", "gitlab"] }]);
  await home.stop();
  const restarted = await harness.startHome("registry-account-restarted", { host, project: false, dataDir: home.dataDir });t.after(() => restarted.stop());
  assert.equal((await restarted.client.expectOk("registry.get", { origin: host.url })).account?.login, "ada");
  assert.ok(instanceOf(await restarted.client.expectOk("space.get", {}), host.url)?.signedIn);
});

test("core-service-144/hub-13: a self-managed Space seat installs canonical public packages but needs its own registry grant for private packages", { timeout: 120_000 }, async (t) => {
  const registryDir = join(harness.scratch, "independent-registry");mkdirSync(registryDir);
  const registry = await startStandinRegistry({ dir: registryDir });t.after(() => registry.close());
  const publicHost = await harness.startHost({ registry, displayName: "Public registry" }); publicHost.script.deviceInterval = 0;
  const selfhost = await harness.startHost({ displayName: "Team Space" }); selfhost.script.deviceInterval = 0;
  for (const org of ["public", "private"]) {
    const folder = join(harness.scratch, `${org}-release`);
    await makeRelease(folder, { format: 2, org, name: "guide", version: "1.0.0", description: "A guide", license: "MIT", artifacts: { [`${org}-guide`]: { kind: "skill", language: "en" } } }, { [`skills/en/${org}-guide/SKILL.md`]: `---\nname: ${org}-guide\ndescription: A guide\n---\nUse it.\n` });
    await publishRelease(new RegistryClient({ url: registry.url }), folder);
  }
  registry.script.setPrivate("private", [publicHost.url]);
  registry.script.setOrgs(publicHost.url, [{ name: "private", path: "private", role: "Owner" }, { name: "other", path: "other", role: "Owner" }]);
  const registryFetch: typeof fetch = (input, init) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    return fetch(url.origin === PUBLIC_REGISTRY_ORIGIN ? `${publicHost.url}${url.pathname}${url.search}` : input, init);
  };
  const seat = await harness.startHome("registry-seat", { host: selfhost, project: false, extra: { registryFetch, seat: { serverId: "team-server", serverName: "Team", personId: "1001" } } });t.after(() => seat.stop());
  await harness.signIn(seat, selfhost);
  const projects = await seat.client.expectOk("space.get", {}); const own = projects.own.repositories.find((r) => r.own)!.key;
  const env = await seat.client.expectOk("environment.get", { repository: own });
  assert.deepEqual(env.registry, { origin: PUBLIC_REGISTRY_ORIGIN, legacy: false });
  const state = await seat.client.expectOk("registry.get", { repository: own });assert.equal(state.account, null);
  const publicInstall = await seat.client.expectOk("environment.request", { repository: own, name: "public/guide", request: { kind: "registry", version: "^1.0.0" }, wait: true });assert.ok(publicInstall);
  const denied = await seat.client.command("environment.request", { repository: own, name: "private/guide", request: { kind: "registry", version: "^1.0.0" }, wait: true });assert.equal(denied.ok, false);
  assert.match((await seat.client.expectOk("environment.get", { repository: own })).error ?? "", /Sign in to registry/);
  assert.equal(await fileCredentialStore(seat.dataDir, PUBLIC_REGISTRY_ORIGIN, "registry").read(), null);
  await registrySignIn(seat, PUBLIC_REGISTRY_ORIGIN, publicHost);
  assert.equal(publicHost.script.deviceRequests.at(-1)?.serverId, null, "registry sign-in inherits no seat grant");
  const allowed = await seat.client.expectOk("environment.resolve", { repository: own, wait: true });assert.ok(allowed);
  const installed = await seat.client.expectOk("environment.get", { repository: own });assert.ok(installed.packages.find((p) => p.name === "private/guide")?.installed);
  assert.deepEqual((await seat.client.expectOk("registry.orgs", { repository: own })).orgs.map((org) => org.name), ["other", "private"]);
  assert.ok(instanceOf(await seat.client.expectOk("space.get", {}), selfhost.url)?.signedIn);
});


test("core-service-144: explicit registry selection preserves comments, extension fields, Space and the exact lock, including migration at the same origin", async (t) => {
  const home = await harness.startHome("registry-document", { project: false });t.after(() => home.stop());
  const own = "tester/tester-spex";
  const folder = ownClone(home.dataDir);
  const file = join(folder, "spex.yaml");
  const lock = readFileSync(join(folder, "spex.lock"));
  const text = `# Registry routing is a separate choice.
format: 1 # Keep this format comment.
space: https://team.example
x-team-note: preserve-me
packages: {} # Preserve the package map comment.
`;
  writeFileSync(file, text);
  const state = await home.client.expectOk("environment.registry.set", { repository: own, origin: "https://team.example" });
  assert.deepEqual(state.registry, { origin: "https://team.example", legacy: false });assert.equal(state.instance, "https://team.example");
  const after = readFileSync(file, "utf8");
  for (const kept of ["# Registry routing is a separate choice.", "format: 1 # Keep this format comment.", "space: https://team.example", "x-team-note: preserve-me", "packages: {} # Preserve the package map comment."]) assert.ok(after.includes(kept), kept);
  assert.deepEqual(readFileSync(join(folder, "spex.lock")), lock);
  rmSync(file);
  await home.client.expectOk("environment.registry.set", { repository: own, origin: "https://packages.example" });
  const created = readFileSync(file, "utf8");assert.match(created, /^format: 1$/m);assert.match(created, /^packages: {}$/m);assert.match(created, /^registry: https:\/\/packages.example$/m);
  assert.deepEqual(readFileSync(join(folder, "spex.lock")), lock);
});


test("core-service-144: cancellation during a registry device start leaves no grant and does not cancel the next sign-in", { timeout: 60_000 }, async (t) => {
  const host = await harness.startHost({ displayName: "Registry" });host.script.deviceInterval = 0;
  const held = holdingFetch();
  const home = await harness.startHome("registry-cancel-start", { host, project: false, extra: { registryFetch: held.fetch } });t.after(() => home.stop());
  const gate = held.hold((path) => path === "/api/v1/auth/device");t.after(() => gate.release());
  const starting = home.client.command("registry.signin.start", { origin: host.url });
  await gate.reached;
  assert.deepEqual(await home.client.expectOk("registry.signin.cancel", { origin: host.url }), { stopped: true });
  gate.release();
  const ended = await starting;
  assert.equal(ended.ok, false);if (ended.ok) throw new Error("Cancelled start unexpectedly succeeded");assert.equal(ended.error.code, "aborted");
  assert.equal(await fileCredentialStore(home.dataDir, host.url, "registry").read(), null);
  await registrySignIn(home, host.url, host);
  assert.equal((await home.client.expectOk("registry.get", { origin: host.url })).account?.login, "ada");
});


test("space-118: placement changes only the Space binding and a current lock digest, preserving stale locks and every package pin", { timeout: 120_000 }, async (t) => {
  const first = await harness.startHost({ displayName: "First Space" });
  const second = await harness.startHost({ displayName: "Second Space" });
  first.script.deviceInterval = 0;second.script.deviceInterval = 0;
  const home = await harness.startHome("registry-placement", { host: first, project: false });t.after(() => home.stop());
  await harness.signIn(home, first);await harness.signIn(home, second);
  for (const condition of ["fresh", "stale", "malformed"]) {
    const name = `placement-${condition}`;
    const folder = harness.gitFolder(name);
    const project = await harness.addFolder(home, folder);
    await home.client.expectOk("environment.resolve", { repository: project.key, wait: true });
    const lockPath = join(project.clone, "spex.lock");
    const pins = parseLock(readFileSync(lockPath, "utf8")).packages;
    if (condition === "stale") writeFileSync(lockPath, readFileSync(lockPath, "utf8").replace(/^requests: .+$/m, `requests: ${"f".repeat(64)}`));
    if (condition === "malformed") writeFileSync(lockPath, "format: 99\n");
    const lockedText = readFileSync(lockPath, "utf8");
    const requested = readFileSync(join(project.clone, "spex.yaml"), "utf8");
    assert.match(requested, /^registry: https:\/\/spex.sublang.ai$/m);
    const from = home.client.messages.length;
    await home.client.expectOk("space.pick", { repository: project.key, choice: { kind: "create", instance: second.url, groupId: "2002", name } });
    const message = await home.client.waitFor((entry) => home.client.messages.indexOf(entry) >= from && entry.type === "environment.state" && entry.state.pathRoot === folder && entry.state.instance === second.url);
    assert.equal(message.type, "environment.state");if (message.type !== "environment.state") throw new Error("Expected the placed environment");
    assert.deepEqual(message.state.registry, { origin: PUBLIC_REGISTRY_ORIGIN, legacy: false });
    const placedClone = clonePath(home.dataDir, message.state.repository);
    const nextRequests = readFileSync(join(placedClone, "spex.yaml"), "utf8");
    assert.match(nextRequests, new RegExp(`^space: ${second.url.replaceAll(".", "\\.")}$`, "m"));
    const nextLockedText = readFileSync(join(placedClone, "spex.lock"), "utf8");
    if (condition === "malformed") { assert.equal(nextLockedText, lockedText); assert.ok(message.state.error); continue; }
    const locked = parseLock(lockedText);
    const nextLock = parseLock(nextLockedText);
    assert.deepEqual(nextLock.packages, pins);
    if (condition === "stale") { assert.equal(nextLockedText, lockedText); assert.ok(message.state.stale); }
    else {
      assert.equal(nextLock.requests, requestsDigest(nextRequests));
      assert.equal(nextLockedText, lockedText.replace(locked.requests, requestsDigest(nextRequests)));
      assert.equal(message.state.stale, null);
    }
  }
});
