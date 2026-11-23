// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// git-host-23, space-142, storage-62: actual core, complete stand-in catalogs and real Git
// transports. Only individual HTTP answers are held/refused.
import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Store } from "./store.js";
import { STANDIN_STORAGE } from "./testing/standin-host.js";
import { holdingFetch, settled } from "./testing/holding-fetch.js";
import { bareOf, clonePath, createSpaceHarness, hostFolder, hostKey, instanceOf, placementOf, repositoryOf, rowsOf } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
const { git, gitFolder, addFolder, bareRepo, startHost, startHome, signIn } = fixture;
test.after(() => fixture.dispose());
const OWN = "ada/ada-spex";
type Home = Awaited<ReturnType<typeof startHome>>;

function internals(home: Home) {
  const service = home.service as unknown as {
    space: {
      readHost(): Promise<unknown>;
      instanceAt(origin: string): {
        client: { fetchImpl: typeof fetch };
        targets: Map<unknown, { facts: { id: string | null }; listing?: { repository: { id: string } } }>;
      };
    };
    store: Store;
  };
  return {
    space: service.space,
    store: service.store,
    /** The client the core keeps for the home's one instance (DR-127). */
    get hostClient() { return service.space.instanceAt(service.store.home.defaultInstance().origin).client; },
    /** The selected reads the core holds of the home's one instance
     * (git-host-22). */
    get targets() { return service.space.instanceAt(service.store.home.defaultInstance().origin).targets; },
  };
}

async function prepared(name: string) {
  const host = await startHost();
  const unrelated = host.script.addRepository({ group: "ada", name: "unrelated-spex" });
  const home = await startHome(name, { host, project: false, extra: { signIn: "browser" } });
  const mark = home.client.mark();
  await signIn(home, host);
  const own = await home.client.waitRepository(mark, OWN, (row) => row.sync.phase === "done", 30_000);
  assert.ok(own.id);
  return { host, unrelated, home, id: own.id, core: internals(home) };
}

async function preparedProject(name: string) {
  const ready = await prepared(name);
  const { home } = ready;
  const { key: local } = await addFolder(home, gitFolder(name));
  const mark = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: ready.host.url, name } });
  const key = hostKey(ready.host, `ada/${name}-spex`);
  const row = await home.client.waitRepository(mark, key, (candidate) => candidate.sync.phase === "done", 30_000);
  assert.ok(row.id);
  return { ...ready, key, id: row.id };
}

function unavailable(): Response {
  return Response.json({ error: { code: "provider_unavailable", message: "Temporary failure" } }, { status: 503 });
}
function pathOf(input: Parameters<typeof fetch>[0]): string {
  return new URL(input instanceof Request ? input.url : String(input)).pathname;
}

test("storage-62, space-142: a separate Git address stays classified after sign-out and restart without a Space read", async (t) => {
  const backend = await startHost();
  const host = await startHost({ gitBackend: backend });
  assert.notEqual(new URL(host.gitOrigin).origin, host.url);
  const home = await startHome("saved-record-origin", { host });
  t.after(() => home.stop());
  await signIn(home, host);
  await home.client.waitRepository(0, OWN, (row) => row.sync.phase === "done", 30_000);
  const { key, clone } = await addFolder(home, home.projectDir);
  assert.equal(internals(home).store.home.instance(host.url)?.gitOrigin, host.gitOrigin);
  assert.ok(!JSON.stringify(await home.client.expectOk("space.get", {})).includes(host.gitOrigin), "Space state keeps the backing Git address private");
  await home.client.expectOk("space.signout", { instance: host.url });
  await home.stop();

  const cold = await startHome("saved-record-origin-cold", { host, dataDir: home.dataDir, project: false });
  t.after(() => cold.stop());
  const url = `${host.gitOrigin}/unlisted/example-spex.git`;
  const client = internals(cold).hostClient;
  const reads: string[] = [];
  client.fetchImpl = async (input) => { reads.push(pathOf(input)); return unavailable(); };
  const gitAddress = new URL(url);
  for (const address of [
    url, url.replace("/git/", "/%67it/"),
    `git@${gitAddress.hostname}:${gitAddress.pathname.slice(1)}`,
    `ssh://git@${gitAddress.hostname}:2222${gitAddress.pathname.replace("/git/", "/%67it/")}`,
  ]) {
    await cold.client.expectError("space.remote.set", { repository: key, url: address }, "invalid_request", /^Choose that Space as a sync destination$/);
  }
  assert.equal(git(clone, "remote"), "", "the refused address was not persisted");
  await cold.client.expectOk("space.remote.set", { repository: key, url: `${backend.url}/external/example.git` });

  git(clone, "config", "remote.origin.url", url);
  await cold.client.expectError("space.fetch", { repository: key }, "invalid_request", /sign in/i);
  assert.deepEqual(reads, [], "routing and refusal use the same persisted address");
});

test("storage-62: a successful Space description survives a failed account read", async (t) => {
  const { home, host } = await prepared("record-first-description");
  t.after(() => home.stop());
  await home.stop();
  const homeFile = join(home.dataDir, "home.yaml");
  const original = readFileSync(homeFile, "utf8");
  assert.match(original, /^format: 3$/m);
  const legacy = original.replace(/^format: 3$/m, "format: 2").replace(/^    gitOrigin: .*\r?\n/m, "");
  assert.notEqual(legacy, original);
  writeFileSync(homeFile, legacy);

  const cold = await startHome("record-first-description-cold", { host, dataDir: home.dataDir, project: false });
  t.after(() => cold.stop());
  const core = internals(cold);
  const inner = core.hostClient.fetchImpl;
  core.hostClient.fetchImpl = async (input, init) => pathOf(input) === "/api/v1/host/me" ? unavailable() : inner(input, init);
  assert.equal(core.store.home.instance(host.url)?.gitOrigin, undefined);
  await assert.rejects(core.space.readHost());
  assert.equal(core.store.home.instance(host.url)?.gitOrigin, host.gitOrigin);
  assert.match(readFileSync(homeFile, "utf8"), /^format: 3$/m);
});

test("git-host-23: a cold sync of a personal Git address checks its Space immediately", async (t) => {
  const { home, host } = await prepared("record-personal-cold");
  t.after(() => home.stop());
  const repository = host.script.addRepository({ group: "ada", name: "direct-spex" });
  const { key, clone } = await addFolder(home, gitFolder("direct"));
  git(clone, "remote", "add", "origin", `${host.gitOrigin}/ada/direct-spex.git`);
  await home.stop();

  const cold = await startHome("record-personal-restart", { host, dataDir: home.dataDir, project: false });
  t.after(() => cold.stop());
  const from = cold.client.mark();
  await cold.client.expectOk("space.sync", { repository: key });
  const placed = await cold.client.waitRepository(from, hostKey(host, "ada/direct-spex"), (row) => row.sync.phase === "done", 30_000);
  assert.equal(placed.id, repository.id);
});

test("space-142: an existing SSH origin at a known Space stops as a path placement", async (t) => {
  const { home, host } = await prepared("record-personal-ssh");
  t.after(() => home.stop());
  const repository = host.script.addRepository({ group: "ada", name: "direct-ssh-spex" });
  await home.client.expectOk("space.refresh", {});
  await home.client.waitRepository(0, hostKey(host, "ada/direct-ssh-spex"), (row) => row.id === repository.id);
  const { key, clone } = await addFolder(home, gitFolder("direct-ssh"));
  const address = new URL(`${host.gitOrigin}/ada/direct-ssh-spex.git`);
  const ssh = `ssh://git@${address.hostname}:1${address.pathname}`;
  git(clone, "remote", "add", "origin", ssh);
  const before = host.script.requests.length;
  for (const command of ["space.fetch", "space.sync"] as const) {
    const row = await home.client.settle(command, { repository: key });
    assert.ok(row.sync.phase === "stopped" && row.sync.step === "check" && row.sync.cause === "git" && row.sync.retry, JSON.stringify(row.sync));
    assert.match(row.sync.message, /^Git settings direct this external records transfer to a Space/);
    assert.equal(row.state, "reachable");
    assert.equal(row.governing, null);
    const placement = placementOf(row, null);
    assert.equal(placement.state, "reachable");
    assert.ok(!JSON.stringify(row).includes(ssh), "the local row keeps the transport address private");
  }
  assert.deepEqual(host.script.requests.slice(before), [], "neither operation asks the Space about this path placement");
  assert.equal(git(clone, "remote", "get-url", "origin"), ssh);
});

test("space-142: an external records placement checks its effective push destination", async (t) => {
  const backend = await startHost();
  const host = await startHost({ gitBackend: backend });
  const home = await startHome("record-push-destination", { host });
  t.after(() => home.stop());
  await signIn(home, host);
  await home.client.waitRepository(0, OWN, (row) => row.sync.phase === "done", 30_000);
  const { key, clone } = await addFolder(home, home.projectDir);
  const bare = bareRepo();
  await home.client.expectOk("space.remote.set", { repository: key, url: bare });
  const seeded = await home.client.settle("space.sync", { repository: key });
  assert.equal(seeded.sync.phase, "done", JSON.stringify(seeded.sync));
  const saved = git(bare, "rev-parse", "spex");

  git(clone, "config", "remote.origin.pushurl", `${host.gitOrigin}/unlisted/example-spex.git`);
  writeFileSync(join(clone, "notes.md"), "Local work\n");
  const blocked = await home.client.settle("space.sync", { repository: key });
  assert.equal(blocked.sync.phase, "stopped");
  assert.equal(blocked.sync.step, "push");
  assert.equal(blocked.sync.cause, "git");
  assert.match(blocked.sync.message, /Git settings.*push URL/);
  assert.equal(blocked.sync.retry, true);
  assert.ok(!backend.script.requests.some(request => request.path.includes("/unlisted/example-spex.git")));
  assert.equal(git(bare, "rev-parse", "spex"), saved, "the successful external Check did not publish the saved local work");
});

test("space-142: an external records Check refuses a fetch rewrite into a known Space", async (t) => {
  const { host, home } = await prepared("record-fetch-rewrite");
  t.after(() => home.stop());
  const { key, clone } = await addFolder(home, gitFolder("record-fetch-rewrite"));
  const bare = bareRepo();
  await home.client.expectOk("space.remote.set", { repository: key, url: bare });
  const url = `${host.gitOrigin}/unlisted/rewrite-spex.git`;
  const rewrite = `url.${url}.insteadOf`;
  git(clone, "config", rewrite, bare);

  const blocked = await home.client.settle("space.fetch", { repository: key });
  assert.equal(blocked.sync.phase, "stopped");
  assert.equal(blocked.sync.step, "check");
  assert.equal(blocked.sync.cause, "git");
  assert.match(blocked.sync.message, /Git settings.*URL rewrite/);
  assert.equal(blocked.sync.retry, true);
  assert.ok(!host.script.requests.some(request => request.path.startsWith(new URL(url).pathname)));
  assert.equal(git(clone, "config", "remote.origin.url"), bare);

  git(clone, "config", "--unset", rewrite);
  const checked = await home.client.settle("space.fetch", { repository: key });
  assert.equal(checked.sync.phase, "idle");
  assert.ok(placementOf(checked, null).branch?.checkedAt);
});

test("space-142: external HTTP records Check follows Git redirects while the default Space is unavailable", async (t) => {
  const host = await startHost();
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url ?? "");
    if (request.url?.startsWith("/records.git/")) response.writeHead(302, { location: request.url.replace("/records.git/", "/redirected.git/") });
    else response.writeHead(200, { "content-type": "text/plain" });
    response.end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.close(); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/records.git`;
  const home = await startHome("external-records-redirect", { host });
  t.after(() => home.stop());
  const { key, clone } = await addFolder(home, home.projectDir);
  await home.client.expectOk("space.remote.set", { repository: key, url });
  git(clone, "config", `http.${url}.followRedirects`, "true");
  const reads: string[] = [];
  internals(home).hostClient.fetchImpl = async (input) => { reads.push(pathOf(input)); return unavailable(); };

  const fetched = await home.client.settle("space.fetch", { repository: key });
  assert.equal(fetched.sync.phase, "idle", "the redirected repository has no spex branch");
  assert.ok(placementOf(fetched, null).branch?.checkedAt, "the empty repository was checked successfully");
  assert.deepEqual(requests.slice(0, 2), ["/records.git/info/refs?service=git-upload-pack", "/redirected.git/info/refs?service=git-upload-pack"]);
  assert.deepEqual(reads, [], "the default Space is never consulted for an external records transfer");
});

test("space-142: Git URL rewrites cannot redirect a verified Space records check, push or join", async (t) => {
  const { home, host, key, id } = await preparedProject("records-rewrite");
  t.after(() => home.stop());
  const clone = clonePath(home.dataDir, key);
  const url = git(clone, "remote", "get-url", hostFolder(host));
  const elsewhere = `${host.gitOrigin}/unlisted/example-spex`;
  const prefix = url.slice(0, -4);
  const rewrite = `url.${elsewhere}.insteadOf`;
  git(clone, "config", rewrite, prefix);
  git(clone, "config", `url.${url}.insteadOf`, url);
  const unchanged = await home.client.settle("space.fetch", { repository: key });
  assert.equal(unchanged.sync.phase, "idle", JSON.stringify(unchanged.sync));
  git(clone, "config", "--unset", `url.${url}.insteadOf`);

  const checked = await home.client.settle("space.fetch", { repository: key });
  assert.equal(checked.sync.phase, "stopped");
  assert.match(checked.sync.message, /Check the URL rewrite rules/);
  git(clone, "config", "--unset", rewrite);

  git(clone, "config", "remote." + hostFolder(host) + ".pushurl", `${elsewhere}.git`);
  git(clone, "config", `url.${elsewhere}.pushInsteadOf`, prefix);
  git(clone, "config", `url.${url}.pushInsteadOf`, url);
  writeFileSync(join(clone, "notes.md"), "First change\n");
  const pushed = await home.client.settle("space.sync", { repository: key });
  assert.equal(pushed.sync.phase, "done", JSON.stringify(pushed.sync));

  git(clone, "config", "--unset", `url.${url}.pushInsteadOf`);
  writeFileSync(join(clone, "notes.md"), "Second change\n");
  const blocked = await home.client.settle("space.sync", { repository: key });
  assert.equal(blocked.sync.phase, "stopped");
  assert.equal(blocked.sync.step, "push");
  assert.match(blocked.sync.message, /Check the URL rewrite rules/);

  const hosted = bareOf(host, key);
  const hostedHead = git(hosted, "rev-parse", "spex");
  const external = bareRepo();
  await home.client.expectOk("space.remote.set", { repository: key, url: external });
  writeFileSync(join(clone, "notes.md"), "Third change\n");
  const continued = await home.client.settle("space.sync", { repository: key });
  const refusal = placementOf(continued, host.url).outcome;
  assert.ok(refusal?.kind === "stopped" && refusal.step === "push" && refusal.retry, JSON.stringify(refusal));
  assert.match(refusal.message, /Check the URL rewrite rules/);
  assert.equal(placementOf(continued, null).outcome?.kind, "synced");
  assert.equal(git(hosted, "rev-parse", "spex"), hostedHead);
  assert.equal(git(external, "show", "spex:notes.md"), "Third change");

  const second = await startHome("records-rewrite-join", {
    host, project: false, env: { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: rewrite, GIT_CONFIG_VALUE_0: prefix },
  });
  t.after(() => second.stop());
  await signIn(second, host);
  const mark = second.client.mark();
  await second.client.expectOk("space.join", { instance: host.url, hostId: id });
  const joined = await second.client.waitRepository(mark, key, (row) => row.sync.phase === "stopped", 30_000);
  assert.equal(joined.sync.phase, "stopped");
  assert.match(joined.sync.message, /Check the URL rewrite rules/);
  assert.ok(host.script.transportCredentials.every((request) => !request.path.includes("/unlisted/example-spex.git")));
  assert.equal(existsSync(clonePath(second.dataDir, key)), false);
});

// An unrelated enrichment is deliberately broken; all catalog pages
// and target reads are still served by the real stand-in.
test("git-host-23: an unrelated detail failure fails Refresh but not target sync, with no full-view freshness claim", async (t) => {
  const { host, home, unrelated, id, core } = await prepared("target-isolated");
  t.after(() => home.stop());
  const before = await home.client.expectOk("space.get", {});
  const inner = core.hostClient.fetchImpl;
  const calls: string[] = [];
  core.hostClient.fetchImpl = async (input, init) => {
    const path = pathOf(input); calls.push(path);
    return path === `/api/v1/host/repositories/${unrelated.id}` ? unavailable() : inner(input, init);
  };
  await assert.rejects(core.space.readHost());
  assert.equal((await home.client.repository(OWN)).state, "unreachable");
  const fullReadFailure = instanceOf(await home.client.expectOk("space.get", {}), host.url)?.read;
  assert.equal(fullReadFailure?.phase, "failed");
  calls.length = 0;
  const done = await home.client.settle("space.sync", { repository: OWN });
  assert.deepEqual([done.sync.phase, done.state], ["done", "reachable"], JSON.stringify(done.sync));
  assert.ok(calls.includes("/api/v1/host/repositories") && calls.includes(`/api/v1/host/repositories/${id}`));
  assert.deepEqual(calls.filter((path) => /^\/api\/v1\/host\/repositories\/[^/]+(?:\/members)?$/.test(path)).sort(), [
    `/api/v1/host/repositories/${id}`,
  ].sort(), "no unrelated detail or members fanout");
  const afterTarget = await home.client.expectOk("space.get", {});
  assert.equal(instanceOf(afterTarget, host.url)?.readAt, instanceOf(before, host.url)?.readAt);
  assert.deepEqual(instanceOf(afterTarget, host.url)?.read, fullReadFailure, "target Check does not clear the full-read failure");
  assert.equal(git(host.bareOf(OWN), "rev-parse", "spex"), git(clonePath(home.dataDir, OWN), "rev-parse", "spex"));
});

test("git-host-23: catalog, target and auth failures refuse Check without a push or lost local files", async (t) => {
  const { host, home, id, core } = await prepared("target-failures");
  t.after(() => home.stop());
  const inner = core.hostClient.fetchImpl;
  const clone = clonePath(home.dataDir, OWN);
  const original = readFileSync(join(clone, "config/playbook.config.yaml"));
  const remoteHead = git(host.bareOf(OWN), "rev-parse", "spex");
  for (const failedPath of ["/api/v1/host/me", "/api/v1/host/repositories", `/api/v1/host/repositories/${id}`]) {
    core.hostClient.fetchImpl = async (input, init) => pathOf(input) === failedPath ? unavailable() : inner(input, init);
    const from = host.script.requests.length;
    const row = await home.client.settle("space.sync", { repository: OWN });
    assert.equal(row.sync.phase, "stopped", JSON.stringify(row.sync));
    if (row.sync.phase === "stopped") assert.deepEqual([row.sync.step, row.sync.cause], ["check", "unreachable"]);
    assert.equal(row.state, "unreachable");
    assert.ok(!host.script.requests.slice(from).some((request) => request.path.endsWith("git-receive-pack")));
    assert.equal(git(host.bareOf(OWN), "rev-parse", "spex"), remoteHead);
    assert.deepEqual(readFileSync(join(clone, "config/playbook.config.yaml")), original);
  }
  core.hostClient.fetchImpl = inner;
  host.script.withdrawRepository(id);
  const gone = await home.client.settle("space.sync", { repository: OWN });
  assert.equal(gone.sync.phase, "stopped");
  assert.match(gone.reason ?? "", /no longer available/);
  assert.ok(existsSync(clone));
  host.script.revokeDevices();
  const denied = await home.client.settle("space.sync", { repository: OWN });
  assert.equal(denied.sync.phase, "stopped");
  assert.match(denied.reason ?? "", /Sign in again/);
  assert.equal(instanceOf(await home.client.expectOk("space.get", {}), host.url)?.signedIn, false);
  assert.deepEqual(readFileSync(join(clone, "config/playbook.config.yaml")), original);
});

for (const outcome of ["success", "failure"] as const) {
  test(`git-host-23: older full-read ${outcome} cannot restore target path or access; later Refresh supersedes it`, async (t) => {
    const { home, host, core, id, key } = await preparedProject(`target-race-${outcome}`);
    t.after(() => home.stop());
    const holds = holdingFetch(core.hostClient.fetchImpl);
    core.hostClient.fetchImpl = holds.fetch;
    // Buffer the complete OLD target detail before changing host facts.
    const gate = holds.hold((path) => path === `/api/v1/host/repositories/${id}`);
    t.after(() => gate.release());
    let failOld = false;
    if (outcome === "failure") {
      const held = core.hostClient.fetchImpl;
      core.hostClient.fetchImpl = async (input, init) => {
        const response = await held(input, init);
        if (pathOf(input) === `/api/v1/host/repositories/${id}` && failOld) { failOld = false; return unavailable(); }
        return response;
      };
    }
    const full = core.space.readHost(); full.catch(() => undefined);
    await gate.reached;
    assert.equal(instanceOf(await home.client.expectOk("space.get", {}), host.url)?.read.phase, "running");
    // Only hold the already-buffered answer, not the newer target read.
    core.hostClient.fetchImpl = fetch;
    host.script.rename(id, { name: "renamed-spex", group: "ada" });
    host.script.archive(id);
    const mark = home.client.mark();
    await home.client.expectOk("space.sync", { repository: key });
    const movedPath = "ada/renamed-spex";
    const moved = hostKey(host, movedPath);
    const row = await home.client.waitRepository(mark, moved, (candidate) => candidate.sync.phase !== "running", 30_000);
    assert.deepEqual([row.sync.phase, row.state, placementOf(row, host.url).path], ["done", "read-only", movedPath], JSON.stringify(row));
    assert.equal(instanceOf(await home.client.expectOk("space.get", {}), host.url)?.read.phase, "running", "target Check does not settle the full read");
    failOld = outcome === "failure";
    gate.release();
    if (outcome === "failure") await assert.rejects(full); else await full;
    await settled();
    const after = await home.client.repository(moved);
    assert.deepEqual([after.state, placementOf(after, host.url).path], ["read-only", movedPath]);
    const state = await home.client.expectOk("space.get", {});
    assert.equal(rowsOf(state).filter((candidate) => candidate.id === id).length, 1);
    assert.ok(existsSync(clonePath(home.dataDir, moved)) && !existsSync(clonePath(home.dataDir, key)));
    // A full read begun AFTER the selected observation owns the row.
    host.script.archive(id, false);
    core.hostClient.fetchImpl = fetch;
    await core.space.readHost();
    assert.equal((await home.client.repository(moved)).state, "reachable");
  });
}

test("git-host-23: a move out of the personal namespace during catalog reading is refused before transport", async (t) => {
  const { host, home, core, id, key } = await preparedProject("catalog-move");
  t.after(() => home.stop());
  const inner = core.hostClient.fetchImpl;
  const holds = holdingFetch(inner);
  core.hostClient.fetchImpl = holds.fetch;
  const gate = holds.hold((path) => path === "/api/v1/host/repositories");
  t.after(() => gate.release());
  const from = home.client.mark();
  const calls = host.script.requests.length;
  await home.client.expectOk("space.sync", { repository: key });
  await gate.reached;
  // Move the repository while Check holds its old catalog response.
  host.script.rename(id, { name: "catalog-move-spex", group: "acme" });
  core.hostClient.fetchImpl = inner;
  gate.release();
  const row = await home.client.waitRepository(from, key, (candidate) => candidate.sync.phase === "stopped", 30_000);
  assert.deepEqual([row.id, row.state], [id, "unreachable"]);
  assert.ok(!host.script.requests.slice(calls).some((request) => request.path.includes(".git/") || request.path.endsWith("/credential") || request.path.endsWith("/spex-branch")));
  assert.ok(existsSync(clonePath(home.dataDir, key)));

});

test("git-host-23: a newer completed full read fences an older target before it can use stale path or access", async (t) => {
  const { host, home, core, id, key } = await preparedProject("newer-full");
  t.after(() => home.stop());
  const inner = core.hostClient.fetchImpl;
  const holds = holdingFetch(inner);
  core.hostClient.fetchImpl = holds.fetch;
  const gate = holds.hold((path) => path === `/api/v1/host/repositories/${id}`);
  t.after(() => gate.release());
  const from = home.client.mark();
  await home.client.expectOk("space.sync", { repository: key });
  await gate.reached;
  host.script.rename(id, { name: "new-authority-spex", group: "ada" });
  host.script.archive(id);
  core.hostClient.fetchImpl = inner;
  await core.space.readHost();
  gate.release();
  const movedPath = "ada/new-authority-spex";
  const moved = hostKey(host, movedPath);
  const row = await home.client.waitRepository(from, moved, (candidate) => candidate.sync.phase === "done", 30_000);
  assert.deepEqual([row.state, placementOf(row, host.url).path], ["read-only", movedPath]);
  assert.ok(!existsSync(clonePath(home.dataDir, key)) && existsSync(clonePath(home.dataDir, moved)));
});

test("git-host-23: a target-only read does not spend the first full Space read after restart", async (t) => {
  const ready = await prepared("target-before-first-get");
  const { host, home: first, unrelated } = ready;
  await first.stop();
  const home = await startHome("target-before-first-get-again", { dataDir: first.dataDir, project: false });
  t.after(() => home.stop());
  const core = internals(home);
  const inner = core.hostClient.fetchImpl;
  const calls: string[] = [];
  core.hostClient.fetchImpl = async (input, init) => { calls.push(pathOf(input)); return inner(input, init); };
  // The command is sent before the first space.get, and can complete
  // without enriching unrelated repositories.
  const mark = home.client.mark();
  await home.client.expectOk("space.sync", { repository: OWN });
  await home.client.waitRepository(mark, OWN, (row) => row.sync.phase === "done", 30_000);
  assert.ok(!calls.includes(`/api/v1/host/repositories/${unrelated.id}`));
  const gate = holdingFetch(core.hostClient.fetchImpl);
  core.hostClient.fetchImpl = gate.fetch;
  const held = gate.hold((path) => path === `/api/v1/host/repositories/${unrelated.id}`);
  t.after(() => held.release());
  const from = home.client.mark();
  const initial = await home.client.expectOk("space.get", {});
  assert.equal(instanceOf(initial, host.url)?.readAt, null);
  await held.reached;
  held.release();
  const full = await home.client.waitSpace(from, (state) => typeof instanceOf(state, host.url)?.readAt === "number", 30_000);
  assert.equal(repositoryOf(full, OWN).state, "reachable");
});

for (const next of ["signed-out", "another-account"] as const) {
  test(`git-host-23: a held HTTP200 target crossing ${next} cannot repopulate authority or move its clone`, async (t) => {
    const { host, home, core, id, key } = await preparedProject(`account-fence-${next}`);
    t.after(() => home.stop());
    const clone = clonePath(home.dataDir, key);
    const origin = git(clone, "remote", "get-url", hostFolder(host));
    const config = readFileSync(join(clone, ".git", "config"));
    const head = git(clone, "rev-parse", "HEAD");
    host.script.rename(id, { name: "stale-answer-spex", group: "ada" });
    const inner = core.hostClient.fetchImpl;
    const holds = holdingFetch(inner);
    core.hostClient.fetchImpl = holds.fetch;
    const gate = holds.hold((path, status) => path === `/api/v1/host/repositories/${id}` && status === 200);
    t.after(() => gate.release());
    const from = home.client.mark();
    await home.client.expectOk("space.sync", { repository: key });
    await gate.reached;
    core.hostClient.fetchImpl = inner;
    await home.client.expectOk("space.signout", { instance: host.url });
    if (next === "another-account") {
      // A sign-in as another account at a listed instance is refused, so
      // the instance is forgotten first, as Forget does (DR-127).
      const instances = core.store.home;
      assert.equal(instances.forget(host.url), true);
      instances.save();
      host.script.person = { id: "1002", login: "bob", displayName: "Bob" };
      // The stand-in's current user's namespace follows the scripted
      // person; existing repositories retain their original group object.
      host.script.groups[0] = { id: "2004", fullPath: "bob", name: "bob", kind: "user" };
      // The sign-in ends once its set-up has run; the personal records folder
      // keeps the first login's name, which no later sign-in renames
      // (space-59).
      const signed = await signIn(home, host);
      }
    gate.release();
    const row = await home.client.waitRepository(from, key, (candidate) => candidate.sync.phase === "stopped", 30_000);
    assert.equal(row.sync.phase, "stopped");
    if (row.sync.phase === "stopped") assert.match(row.sync.message, /sign-in changed meanwhile/i);
    assert.ok(![...core.targets.values()].some((target) => target.facts.id === id || target.listing?.repository.id === id), "no stale target cache entry");
    assert.ok(existsSync(clone) && !existsSync(clonePath(home.dataDir, hostKey(host, "ada/stale-answer-spex"))));
    assert.deepEqual(readFileSync(join(clone, ".git", "config")), config);
    assert.equal(git(clone, "remote", "get-url", hostFolder(host)), origin);
    assert.equal(git(clone, "rev-parse", "HEAD"), head);
    const after = instanceOf(await home.client.expectOk("space.get", {}), host.url);
    assert.deepEqual([after?.signedIn, after?.account.login], next === "signed-out" ? [false, "ada"] : [true, "bob"]);
  });
}

test("space-2, git-host-23: Refresh leaves an unsynced placement alone, and a failed explicit Check stops before transport", async (t) => {
  const { host, home, core } = await prepared("first-check-failure");
  t.after(() => home.stop());
  core.store.deletePref(`sync:${OWN}:${hostFolder(host)}:last`);
  core.store.deletePref(`sync:${OWN}:${hostFolder(host)}:noticed`);
  const clone = clonePath(home.dataDir, OWN);
  const remoteHead = git(host.bareOf(OWN), "rev-parse", "spex");
  writeFileSync(join(clone, "notes.md"), "Keep the local record through a failed Check.\n");
  const before = instanceOf(await home.client.expectOk("space.get", {}), host.url)?.readAt ?? 0;
  const refresh = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  await home.client.waitSpace(refresh, (state) => {
    const instance = instanceOf(state, host.url);
    return instance?.read.phase === "idle" && (instance.readAt ?? 0) > before;
  }, 30_000);
  assert.equal(core.store.getPref(`sync:${OWN}:${hostFolder(host)}:last`), undefined);
  assert.equal(git(host.bareOf(OWN), "rev-parse", "spex"), remoteHead);
  const inner = core.hostClient.fetchImpl;
  let fail = true;
  let catalogReads = 0;
  core.hostClient.fetchImpl = async (input, init) => {
    if (pathOf(input) === "/api/v1/host/me") catalogReads += 1;
    if (pathOf(input) === "/api/v1/host/me" && fail) { fail = false; return unavailable(); }
    return inner(input, init);
  };
  const from = host.script.requests.length;
  const stopped = await home.client.settle("space.sync", { repository: OWN });
  assert.equal(stopped.sync.phase, "stopped", JSON.stringify(stopped.sync));
  if (stopped.sync.phase === "stopped") assert.deepEqual([stopped.sync.step, stopped.sync.cause], ["check", "unreachable"]);
  assert.equal(catalogReads, 1, "a failed Check does not silently start another sync");
  assert.equal(readFileSync(join(clone, "notes.md"), "utf8"), "Keep the local record through a failed Check.\n");
  assert.equal(git(host.bareOf(OWN), "rev-parse", "spex"), remoteHead);
  assert.ok(!host.script.requests.slice(from).some((request) => request.path.includes(".git/") || request.path.endsWith("/credential") || request.path.endsWith("/spex-branch")), "the failed Check starts no branch preparation or Git transport");
  assert.equal(core.store.getPref(`sync:${OWN}:${hostFolder(host)}:last`), undefined);
  // A new explicit Sync reads the now healthy target and sends directly.
  const retried = await home.client.settle("space.sync", { repository: OWN });
  assert.ok(retried.sync.phase === "done" && retried.sync.pushed && retried.sync.sent > 0, JSON.stringify(retried.sync));
  assert.equal(git(host.bareOf(OWN), "show", "spex:notes.md"), "Keep the local record through a failed Check.");
  assert.equal(core.store.getPref(`sync:${OWN}:${hostFolder(host)}:noticed`), undefined);
});
