// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileCredentialStore } from "@sublang/spex/git-host";
import { PUBLIC_REGISTRY_ORIGIN, gitSource, parseRequests, publishRelease, RegistryClient, resolve, serializeLock } from "@sublang/spex/environment";
import { makeRelease, startStandinRegistry } from "@sublang/spex/testing";
import { createSpaceHarness, instanceOf, ownClone } from "./testing/space-harness.js";

const harness = createSpaceHarness();
test.after(() => harness.dispose());
type Home = Awaited<ReturnType<typeof harness.startHome>>;
type Host = Awaited<ReturnType<typeof harness.startHost>>;

async function signInRegistry(home: Home, origin: string, host: Host): Promise<void> {
  const from = home.client.mark();
  const started = await home.client.expectOk("registry.signin.start", { origin });
  if (started.flow === "browser") await (await fetch(started.url)).text();
  else host.script.approveDevice(started.userCode);
  await home.client.waitFor((message) => home.client.messages.indexOf(message) >= from && message.type === "registry.state"
    && message.state.origin === origin && message.state.account !== null && message.state.signIn.phase === "idle");
}

async function registryWithPackage(name: string) {
  const dir = join(harness.scratch, `${name}-registry`);
  mkdirSync(dir);
  const registry = await startStandinRegistry({ dir });
  const release = join(harness.scratch, `${name}-release`);
  await makeRelease(release, {
    format: 2, org: name, name: "guide", version: "1.0.0", description: "A guide", license: "MIT",
    artifacts: { guide: { kind: "skill", language: "en" } },
  }, { "skills/en/guide/SKILL.md": "---\nname: guide\ndescription: A guide\n---\nRead it.\n" });
  await publishRelease(new RegistryClient({ url: registry.url }), release);
  return registry;
}

test("environments-38, environments-40, environments-27: missing registry configuration uses public packages and registry namespaces without consulting Space accounts", { timeout: 90_000 }, async (t) => {
  const registry = await registryWithPackage("public");
  t.after(() => registry.close());
  const publicHost = await harness.startHost({ registry, displayName: "Public packages" });
  const space = await harness.startHost({ displayName: "Workshop Space" });
  publicHost.script.deviceInterval = 0;
  space.script.deviceInterval = 0;
  const packageOrigins: string[] = [];
  const registryFetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    packageOrigins.push(url.origin);
    const response = await fetch(url.origin === PUBLIC_REGISTRY_ORIGIN ? `${publicHost.url}${url.pathname}${url.search}` : input, init);
    if (url.origin === PUBLIC_REGISTRY_ORIGIN && url.pathname === "/api/v1/account/orgs" && response.ok) {
      const data = await response.json() as { orgs: unknown[] };
      return Response.json({ ...data, orgs: [...data.orgs].reverse() });
    }
    return response;
  };
  const home = await harness.startHome("strict-public-default", { host: space, project: false, extra: { registryFetch } });
  t.after(() => home.stop());
  await harness.signIn(home, space);
  const key = (await home.client.expectOk("space.get", {})).own.repositories.find((repository) => repository.own)!.key;
  const root = ownClone(home.dataDir);
  const text = `# An older environment retains its collaboration choice.\nformat: 1\nspace: ${space.url}\npackages:\n  public/guide:\n    version: ^1.0.0\n`;
  writeFileSync(join(root, "spex.yaml"), text);
  const spacePair = await fileCredentialStore(home.dataDir, space.url, "space").read();
  assert.ok(spacePair);
  const state = await home.client.expectOk("environment.get", { repository: key });
  assert.deepEqual(state.registry, { origin: PUBLIC_REGISTRY_ORIGIN, legacy: false });
  assert.equal((await home.client.expectOk("draft.defaults", { projectId: key })).org, "", "a Space login and local group supply no package namespace");
  const signedOut = await home.client.expectOk("registry.get", { repository: key });
  assert.equal(signedOut.origin, PUBLIC_REGISTRY_ORIGIN);
  assert.equal(signedOut.account, null);
  await home.client.expectOk("environment.resolve", { repository: key, wait: true });
  assert.ok((await home.client.expectOk("environment.get", { repository: key })).packages.find((entry) => entry.name === "public/guide")?.installed);
  assert.equal(readFileSync(join(root, "spex.yaml"), "utf8"), text, "using the public default rewrites no legacy manifest");
  assert.ok(packageOrigins.every((origin) => origin === PUBLIC_REGISTRY_ORIGIN), "package/account requests never go to the collaboration Space");

  registry.script.setOrgs(publicHost.url, [
    { name: "registry-owner", path: "unrelated-to-workshop", role: "Owner" },
    { name: "zeta-owner", path: "other-registry-org", role: "Owner" },
  ]);
  const homeBefore = readFileSync(join(home.dataDir, "home.yaml"), "utf8");
  await signInRegistry(home, PUBLIC_REGISTRY_ORIGIN, publicHost);
  assert.equal((await home.client.expectOk("draft.defaults", { projectId: key })).org, "registry-owner");
  assert.deepEqual((await home.client.expectOk("registry.orgs", { repository: key })).orgs.map((org) => org.name), ["registry-owner", "zeta-owner"], "a custom service's response order does not alter suggestions");
  await home.client.expectOk("registry.signout", { origin: PUBLIC_REGISTRY_ORIGIN });
  assert.equal((await home.client.expectOk("draft.defaults", { projectId: key })).org, "");
  assert.equal(readFileSync(join(home.dataDir, "home.yaml"), "utf8"), homeBefore);
  assert.deepEqual(await fileCredentialStore(home.dataDir, space.url, "space").read(), spacePair);
});

test("environments-38, environments-40: an old pinned package source needs its own registry grant while the selected registry and Space account stay unchanged", { timeout: 120_000 }, async (t) => {
  const registry = await registryWithPackage("locked");
  t.after(() => registry.close());
  const host = await harness.startHost({ registry, displayName: "Legacy source" });
  host.script.deviceInterval = 0;
  registry.script.setPrivate("locked", [host.url]);
  const maker = await harness.startHome("locked-source-maker", { host, project: false });
  t.after(() => maker.stop());
  await signInRegistry(maker, host.url, host);
  const pair = await fileCredentialStore(maker.dataDir, host.url, "registry").read();
  assert.ok(pair);
  const text = `format: 1\nspace: ${host.url}\npackages:\n  locked/guide:\n    version: ^1.0.0\n`;
  const resolved = await resolve({ requests: parseRequests(text), requestsText: text,
    registry: new RegistryClient({ url: host.url, token: async () => pair.access }), pathRoot: ownClone(maker.dataDir), git: gitSource(join(harness.scratch, "registry-git")) });
  assert.ok(resolved.ok);
  const lockedText = serializeLock(resolved.lock);

  const origins: string[] = [];
  const registryFetch: typeof fetch = (input, init) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    origins.push(url.origin);
    return fetch(input, init);
  };
  const home = await harness.startHome("locked-source-reader", { host, project: false, extra: { registryFetch } });
  t.after(() => home.stop());
  await harness.signIn(home, host);
  const key = (await home.client.expectOk("space.get", {})).own.repositories.find((repository) => repository.own)!.key;
  const root = ownClone(home.dataDir);
  writeFileSync(join(root, "spex.yaml"), text);
  writeFileSync(join(root, "spex.lock"), lockedText);
  const spacePair = await fileCredentialStore(home.dataDir, host.url, "space").read();
  const reply = await home.client.command("environment.install", { repository: key, wait: true });
  assert.equal(reply.ok, false, "Space membership does not authorize the pinned private package");
  if (!reply.ok) {
    assert.ok(reply.error.message.includes(new URL(host.url).host), reply.error.message);
    assert.doesNotMatch(reply.error.message, /on Space/);
  }
  assert.ok(origins.length > 0 && origins.every((origin) => origin === host.url), "installation asks only the pinned registry");
  assert.deepEqual(await fileCredentialStore(home.dataDir, host.url, "space").read(), spacePair);
  assert.equal(await fileCredentialStore(home.dataDir, host.url, "registry").read(), null);
  assert.equal(readFileSync(join(root, "spex.lock"), "utf8"), lockedText);

  await signInRegistry(home, host.url, host);
  await home.client.expectOk("environment.install", { repository: key, wait: true });
  assert.ok((await home.client.expectOk("environment.get", { repository: key })).packages.find((entry) => entry.name === "locked/guide")?.installed);
  assert.equal(readFileSync(join(root, "spex.lock"), "utf8"), lockedText, "registry sign-in installs the exact lock without rehoming its source");
  assert.equal(readFileSync(join(root, "spex.yaml"), "utf8"), text);
  assert.deepEqual((await home.client.expectOk("environment.get", { repository: key })).registry, { origin: PUBLIC_REGISTRY_ORIGIN, legacy: false });
  assert.ok(instanceOf(await home.client.expectOk("space.get", {}), host.url)?.signedIn);
});
