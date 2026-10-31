// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { makeRelease, startStandinRegistry } from "./testing/index.js";
import { fileCredentialStore, GitHostClient } from "./lib/git-host.js";
import { environmentRegistry, ensureBuiltinRequest, installRegistryOrder, parseLock, prepareBuiltinEnvironment, rehomeBuiltinLock, parseRequests, PUBLIC_REGISTRY_ORIGIN, publishRelease, RegistryClient, requestsDigest, serializeLock } from "./lib/environment/index.js";

const CLI = fileURLToPath(new URL("./cli.js", import.meta.url));

function cli(home: string, cwd: string, ...args: string[]): Promise<{ code: number | null; out: string }> {
  const child = spawn(process.execPath, [CLI, ...args], { cwd, env: { ...process.env, SPEX_HOME: home }, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (bytes) => { out += String(bytes); });
  child.stderr.on("data", (bytes) => { out += String(bytes); });
  return new Promise((resolve, reject) => { child.on("error", reject); child.on("close", (code) => resolve({ code, out })); });
}

test("real CLI and shared clients isolate registry purpose at the same origin", async () => {
  const scratch = mkdtempSync(join(tmpdir(), "spex-purpose-"));
  const home = join(scratch, "home");
  const work = join(scratch, "work");
  mkdirSync(work);
  const requests: { path: string; body: any; bearer: string | undefined }[] = [];
  let origin = "";
  let next = 0;
  let rejectRegistry = false;
  const grants = new Map<string, { scope: string; refresh: string }>();
  const codes = new Map<string, string>();
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += String(chunk);
    const body = raw ? JSON.parse(raw) : {};
    const path = req.url!;
    const bearer = req.headers.authorization?.replace(/^Bearer /, "");
    requests.push({ path, body, bearer });
    const answer = (value: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(value)); };
    const account = { id: "person", login: "reader", display_name: "Reader", can_create_group: false };
    if (path === "/api/v1/registry") return answer({ origin, display_name: "Registry", providers: ["github", "gitlab"] });
    if (path === "/api/v1/spaces") return answer({ spaces: [{ origin, display_name: "Space", sign_in: ["gitlab"] }] });
    if (path === "/api/v1/host") return answer({ display_name: "Space", git_origin: origin, roles: [] });
    if (path === "/api/v1/auth/device") { const code = `code-${++next}`; codes.set(code, body.scope); return answer({ device_code: code, user_code: code, verification_uri: `${origin}/device`, expires_in: 60, interval: 0.001 }); }
    if (path === "/api/v1/auth/token") {
      const scope = body.scope;
      const previous = body.grant_type === "refresh_token" ? [...grants.values()].find((grant) => grant.refresh === body.refresh_token) : null;
      if (body.grant_type === "refresh_token" ? previous?.scope !== scope : codes.get(body.device_code) !== scope) return answer({ error: "invalid_grant" }, 401);
      const access = `${scope}-${++next}`;
      const refresh = `refresh-${next}`;
      grants.set(access, { scope, refresh });
      return answer({ access_token: access, refresh_token: refresh, expires_in: 3600 });
    }
    if (path === "/api/v1/auth/revoke") { if (grants.get(bearer!)?.scope !== body.scope) return answer({ error: "invalid_token" }, 401); grants.delete(bearer!); return answer({}); }
    if (path === "/api/v1/whoami?scope=registry" || path === "/api/v1/host/me") {
      const scope = path.includes("whoami") ? "registry" : "space";
      if (grants.get(bearer!)?.scope !== scope || (scope === "registry" && rejectRegistry)) return answer({ error: { code: "invalid_token" } }, 401);
      return answer(account);
    }
    if (path.startsWith("/api/v1/search?")) { assert.equal(bearer, undefined); return answer({ results: [] }); }
    return answer({ error: { code: "not_found" } }, 404);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    writeFileSync(join(work, "spex.yaml"), `format: 1\nregistry: ${origin}\nspace: https://private.example\npackages: {}\n`);
    const login = await cli(home, work, "login");
    assert.equal(login.code, 0, login.out);
    assert.equal(existsSync(join(home, "home.yaml")), false, "registry login registers no Space");
    assert.ok(requests.every((request) => !request.path.startsWith("/api/v1/host")));
    const registry = fileCredentialStore(home, origin, "registry");
    const space = fileCredentialStore(home, origin);
    assert.ok(await registry.read());
    const firstGrant = await registry.read();
    assert.equal((await cli(home, work, "login")).code, 0);
    assert.deepEqual(await registry.read(), firstGrant, "existing grant is retained without force");
    const forced = await cli(home, work, "login", "--force");
    assert.equal(forced.code, 0, forced.out);
    assert.notDeepEqual(await registry.read(), firstGrant);
    assert.equal(grants.has(firstGrant!.access), false, "only replaced registry grant revoked");
    assert.equal(await space.read(), null, "registry pair never upgrades a legacy Space slot");
    const both = await cli(home, work, "login", "--registry", origin, "--space", origin);
    assert.equal(both.code, 1);
    assert.match(both.out, /mutually exclusive/);
    const spaceLogin = await cli(home, work, "login", "--space", origin);
    assert.equal(spaceLogin.code, 0, spaceLogin.out);
    const spacePair = await space.read();
    assert.ok(spacePair);
    const storedHome = readFileSync(join(home, "home.yaml"), "utf8");
    const registryWho = await cli(home, work, "whoami");
    assert.equal(registryWho.code, 0, registryWho.out);
    assert.match(registryWho.out, /reader/);
    const descriptorClient = new RegistryClient({ url: origin, token: async () => "must-not-leak" });
    assert.deepEqual((await descriptorClient.describe()).providers, ["github", "gitlab"]);
    assert.deepEqual((await descriptorClient.spaces())[0].signIn, ["gitlab"]);
    assert.ok(requests.filter((request) => ["/api/v1/registry", "/api/v1/spaces"].includes(request.path)).every((request) => !request.bearer));
    const registryPair = (await registry.read())!;
    registry.replace(registryPair, { ...registryPair, accessExpiresAt: 0 });
    const client = new GitHostClient({ url: origin, label: "test", scope: "registry", credentials: registry });
    assert.equal((await client.me()).login, "reader");
    rejectRegistry = true;
    await assert.rejects(client.me());
    assert.equal(await registry.read(), null);
    assert.deepEqual(await space.read(), spacePair);
    assert.equal(readFileSync(join(home, "home.yaml"), "utf8"), storedHome);
    rejectRegistry = false;
    assert.equal((await cli(home, work, "login")).code, 0);
    const logout = await cli(home, work, "logout");
    assert.equal(logout.code, 0, logout.out);
    assert.equal(await registry.read(), null);
    assert.deepEqual(await space.read(), spacePair);
    assert.equal(readFileSync(join(home, "home.yaml"), "utf8"), storedHome);
    assert.ok(requests.filter((request) => request.path.startsWith("/api/v1/auth/")).every((request) => request.body.scope === "registry" || request.body.scope === "space"));
    const spaceClient = new GitHostClient({ url: origin, label: "old", credentials: space });
    assert.equal((await spaceClient.me()).login, "reader");
    await spaceClient.signOut();
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("registry manifests preserve legacy sources and new CLI manifests explicitly choose public registry", async () => {
  const home = { origin: "https://private.example", instances: [] };
  assert.deepEqual(environmentRegistry(parseRequests("format: 1\npackages: {}\n"), home), { origin: home.origin, scope: "space", legacy: true });
  assert.deepEqual(environmentRegistry(null, home), { origin: PUBLIC_REGISTRY_ORIGIN, scope: "registry", legacy: false });
  assert.deepEqual(installRegistryOrder("https://packages.example", "https://locked.example", ["https://private.example"], { independent: true }), [{ origin: "https://locked.example" }]);
  const scratch = mkdtempSync(join(tmpdir(), "spex-registry-new-"));
  try {
    const work = join(scratch, "work"); mkdirSync(work);
    const skill = join(work, "greet"); mkdirSync(skill);
    writeFileSync(join(skill, "SKILL.md"), "---\nname: greet\ndescription: Greet the reader.\n---\nHello.\n");
    const result = await cli(join(scratch, "home"), work, "new", "acme/hello", "--skill", "greet");
    assert.equal(result.code, 0, result.out);
    const manifest = parse(readFileSync(join(work, "spex.yaml"), "utf8"));
    assert.equal(manifest.registry, PUBLIC_REGISTRY_ORIGIN);
    assert.equal(manifest.space, undefined);
    const seed = await makeRelease(join(scratch, "seed"), { format: 2, org: "sublang", name: "playbooks", version: "1.0.0", artifacts: { greet: { kind: "skill", language: "en" } } }, { "skills/en/greet/SKILL.md": "---\nname: greet\ndescription: Greet.\n---\nHello.\n" });
    const builtin = { name: "sublang/playbooks" as const, version: "1.0.0", dir: seed };
    const paired = join(scratch, "paired"); mkdirSync(paired);
    prepareBuiltinEnvironment(paired, builtin, "https://private.example", "https://private.example");
    const pairedManifest = parse(readFileSync(join(paired, "spex.yaml"), "utf8"));
    assert.equal(pairedManifest.registry, PUBLIC_REGISTRY_ORIGIN);
    assert.equal(pairedManifest.space, "https://private.example");
    const pairedLock = readFileSync(join(paired, "spex.lock"), "utf8");
    assert.equal((parseLock(pairedLock).packages["sublang/playbooks"].source as { registry: string }).registry, PUBLIC_REGISTRY_ORIGIN);
    assert.equal(rehomeBuiltinLock(paired, builtin, "https://another-space.example"), false);
    assert.equal(readFileSync(join(paired, "spex.lock"), "utf8"), pairedLock);
    const legacy = join(scratch, "legacy"); mkdirSync(legacy);
    writeFileSync(join(legacy, "spex.yaml"), "format: 1\nspace: https://private.example\npackages: {}\n");
    ensureBuiltinRequest(legacy, "1.0.0");
    assert.equal(parse(readFileSync(join(legacy, "spex.yaml"), "utf8")).registry, undefined);
    const gone = join(scratch, "gone");
    assert.equal(ensureBuiltinRequest(gone, "1.0.0"), false, "a root that does not exist is left as it is");
    assert.equal(existsSync(gone), false, "nothing created");
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});


test("real CLI installs public packages, isolates private reads and publishing, and never scans signed-in Spaces", async () => {
  const scratch = mkdtempSync(join(tmpdir(), "spex-registry-install-"));
  const first = await startStandinRegistry({ dir: join(scratch, "first") });
  const unrelated = await startStandinRegistry({ dir: join(scratch, "unrelated") });
  const home = join(scratch, "home");
  const work = join(scratch, "work");
  mkdirSync(work);
  mkdirSync(home);
  const pair = { access: "registry-grant", refresh: "registry-refresh", accessExpiresAt: Date.now() + 3600000 };
  const oldPair = { access: "space-grant", refresh: "space-refresh", accessExpiresAt: Date.now() + 3600000 };
  const homeText = `format: 2\ndevice: 00000000-0000-4000-8000-000000000000\norigin: ${unrelated.url}\ninstances:\n  - origin: ${unrelated.url}\n    clientId: spex\n    account: {id: person, login: reader, displayName: Reader}\nown: reader\nfolders: []\n`;
  writeFileSync(join(home, "home.yaml"), homeText);
  fileCredentialStore(home, first.url).replace(null, oldPair);
  fileCredentialStore(home, unrelated.url).replace(null, oldPair);
  const manifest = (org: string) => ({ format: 2, org, name: "hello", version: "1.0.0", description: "Hello", license: "Apache-2.0", artifacts: { greet: { kind: "skill", language: "en" } } });
  const files = { "skills/en/greet/SKILL.md": "---\nname: greet\ndescription: Greet.\n---\nHello.\n" };
  try {
    const publicFolder = await makeRelease(join(scratch, "public"), manifest("demo"), files);
    const privateFolder = await makeRelease(join(scratch, "private"), manifest("private"), files);
    await publishRelease(new RegistryClient({ url: first.url }), publicFolder);
    await publishRelease(new RegistryClient({ url: first.url }), privateFolder);
    await publishRelease(new RegistryClient({ url: unrelated.url }), publicFolder);
    first.script.setPrivate("private", [pair.access]);
    const text = `format: 1\nregistry: ${first.url}\nspace: ${unrelated.url}\npackages: {}\n`;
    writeFileSync(join(work, "spex.yaml"), text);
    first.script.clearRequests();
    const publicInstall = await cli(home, work, "add", "demo/hello@1.0.0");
    assert.equal(publicInstall.code, 0, publicInstall.out);
    assert.ok(first.script.received.length);
    assert.ok(first.script.received.every((request) => !request.bearer), "public install never presents the same-origin Space grant");
    const privateRefused = await cli(home, work, "add", "private/hello@1.0.0");
    assert.equal(privateRefused.code, 1, privateRefused.out);
    const registryStore = fileCredentialStore(home, first.url, "registry");
    registryStore.replace(null, pair);
    assert.equal((await cli(home, work, "remove", "demo/hello")).code, 0);
    const privateInstall = await cli(home, work, "add", "private/hello@1.0.0");
    assert.equal(privateInstall.code, 0, privateInstall.out);
    assert.match(readFileSync(join(work, ".spex/packages/private/hello/skills/en/greet/SKILL.md"), "utf8"), /Hello/);
    assert.ok(first.script.received.some((request) => request.path.includes("private") && request.bearer));
    mkdirSync(join(work, "spex-packages/private"), { recursive: true });
    const own = join(work, "spex-packages/private/owned");
    await makeRelease(own, { ...manifest("private"), name: "owned" }, files);
    const published = await cli(home, work, "publish", "private/owned");
    assert.equal(published.code, 0, published.out);
    registryStore.replace(pair, null);
    const deniedPublish = await cli(home, work, "publish", "private/owned");
    assert.equal(deniedPublish.code, 1);
    assert.match(deniedPublish.out, /login --registry/);
    assert.deepEqual(await fileCredentialStore(home, first.url).read(), oldPair);
    assert.equal(readFileSync(join(home, "home.yaml"), "utf8"), homeText);

    // Changing the default for future resolution cannot move a private
    // locked read to that origin or to an unrelated signed-in Space.
    const isolated = join(scratch, "isolated"); mkdirSync(isolated);
    const locked = parseLock(readFileSync(join(work, "spex.lock"), "utf8"));
    const resolution = locked.packages["private/hello"];
    const isolatedText = `format: 1\nregistry: ${unrelated.url}\npackages:\n  private/hello: {version: 1.0.0}\n`;
    writeFileSync(join(isolated, "spex.yaml"), isolatedText);
    writeFileSync(join(isolated, "spex.lock"), serializeLock({ format: 1, requests: requestsDigest(isolatedText), packages: { "private/hello": resolution } }));
    first.script.clearRequests(); unrelated.script.clearRequests();
    const isolatedResult = await cli(join(scratch, "fresh-home"), isolated, "install");
    assert.equal(isolatedResult.code, 1, isolatedResult.out);
    assert.ok(first.script.requests.length > 0, "the lock retains its original source");
    assert.equal(unrelated.script.requests.length, 0, "a new default is not permission to move private locked reads");
    const readerHome = join(scratch, "reader-home");
    fileCredentialStore(readerHome, first.url, "registry").replace(null, pair);
    const restored = await cli(readerHome, isolated, "install");
    assert.equal(restored.code, 0, restored.out);
    assert.match(readFileSync(join(isolated, ".spex/packages/private/hello/skills/en/greet/SKILL.md"), "utf8"), /Hello/);
    assert.deepEqual(parseLock(readFileSync(join(isolated, "spex.lock"), "utf8")).packages["private/hello"].source, resolution.source);
    assert.equal(unrelated.script.requests.length, 0);
  } finally {
    await first.close(); await unrelated.close();
    rmSync(scratch, { recursive: true, force: true });
  }
});
