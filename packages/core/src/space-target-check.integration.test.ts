// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// git-host-23: actual core, complete stand-in catalogs and real Git
// transports. Only individual HTTP answers are held/refused.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Store } from "./store.js";
import { STANDIN_STORAGE } from "./testing/standin-host.js";
import { holdingFetch, settled } from "./testing/holding-fetch.js";
import { clonePath, createSpaceHarness, hostFolder, hostKey, repositoryOf } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
const { git, gitFolder, addFolder, startHost, startHome, signIn } = fixture;
test.after(() => fixture.dispose());
const OWN = "ada/ada-spex";
type Home = Awaited<ReturnType<typeof startHome>>;

function internals(home: Home) {
  const service = home.service as unknown as {
    space: {
      readHost(): Promise<unknown>;
      targets: Map<unknown, { facts: { id: string | null }; listing?: { repository: { id: string } } }>;
      instanceAt(origin: string): { client: { fetchImpl: typeof fetch } };
    };
    store: Store;
  };
  return {
    space: service.space,
    store: service.store,
    /** The client the core keeps for the home's one instance (DR-127). */
    get hostClient() { return service.space.instanceAt(service.store.home.defaultInstance().origin).client; },
  };
}

async function prepared(name: string) {
  const host = await startHost();
  const unrelated = host.script.addRepository({ group: "acme", name: "unrelated-spex" });
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
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", groupId: "2002", name } });
  const key = hostKey(ready.host, `acme/${name}-spex`);
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
  const fullReadFailure = (await home.client.expectOk("space.get", {})).read;
  assert.equal(fullReadFailure.phase, "failed");
  calls.length = 0;
  const done = await home.client.settle("space.sync", { repository: OWN });
  assert.deepEqual([done.sync.phase, done.state], ["done", "reachable"], JSON.stringify(done.sync));
  assert.ok(calls.includes("/api/v1/host/repositories") && calls.includes(`/api/v1/host/repositories/${id}`));
  assert.deepEqual(calls.filter((path) => /^\/api\/v1\/host\/repositories\/[^/]+(?:\/members)?$/.test(path)).sort(), [
    `/api/v1/host/repositories/${id}`, `/api/v1/host/repositories/${id}/members`,
  ].sort(), "no unrelated detail or members fanout");
  const afterTarget = await home.client.expectOk("space.get", {});
  assert.equal(afterTarget.readAt, before.readAt);
  assert.deepEqual(afterTarget.read, fullReadFailure, "target Check does not clear the full-read failure");
  assert.equal(git(host.bareOf(OWN), "rev-parse", "spex"), git(clonePath(home.dataDir, OWN), "rev-parse", "spex"));
});

test("git-host-23: catalog, target and auth failures refuse Check without a push or lost local files", async (t) => {
  const { host, home, id, core } = await prepared("target-failures");
  t.after(() => home.stop());
  const inner = core.hostClient.fetchImpl;
  const clone = clonePath(home.dataDir, OWN);
  const original = readFileSync(join(clone, "config/playbook.config.yaml"));
  const remoteHead = git(host.bareOf(OWN), "rev-parse", "spex");
  for (const failedPath of ["/api/v1/host/groups", "/api/v1/host/repositories", `/api/v1/host/repositories/${id}`]) {
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
  host.script.removeMember(id);
  const gone = await home.client.settle("space.sync", { repository: OWN });
  assert.equal(gone.sync.phase, "stopped");
  assert.match(gone.reason ?? "", /No longer shared/);
  assert.ok(existsSync(clone));
  host.script.revokeDevices();
  const denied = await home.client.settle("space.sync", { repository: OWN });
  assert.equal(denied.sync.phase, "stopped");
  assert.match(denied.reason ?? "", /Sign in again/);
  assert.equal((await home.client.expectOk("space.get", {})).account, null);
  assert.deepEqual(readFileSync(join(clone, "config/playbook.config.yaml")), original);
});

test("git-host-23: fresh unknown target members require notice despite a cached solo count", async (t) => {
  const { home, host, core } = await prepared("target-notice");
  t.after(() => home.stop());
  assert.equal((await home.client.repository(OWN)).members, 1);
  // Same joined clone, first push on this device: forget only this
  // scratch device's acknowledgments through the real preferences API.
  core.store.deletePref(`sync:${OWN}:last`);
  core.store.deletePref(`sync:${OWN}:noticed`);
  host.script.failMembers(true);
  await home.client.expectError("space.sync", { repository: OWN }, "invalid_request", /sharing notice/);
  assert.equal((await home.client.repository(OWN)).members, null);
  const row = await home.client.settle("space.sync", { repository: OWN, noticed: true });
  assert.deepEqual([row.sync.phase, row.state, row.noticed], ["done", "reachable", true]);
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
    assert.equal((await home.client.expectOk("space.get", {})).read.phase, "running");
    // Only hold the already-buffered answer, not the newer target read.
    core.hostClient.fetchImpl = fetch;
    host.script.rename(id, { name: "renamed-spex", group: "acme/research" });
    host.script.archive(id);
    const mark = home.client.mark();
    await home.client.expectOk("space.sync", { repository: key });
    const movedPath = "acme/research/renamed-spex";
    const moved = hostKey(host, movedPath);
    const row = await home.client.waitRepository(mark, moved, (candidate) => candidate.sync.phase !== "running", 30_000);
    assert.deepEqual([row.sync.phase, row.state, row.remote], ["done", "read-only", movedPath], JSON.stringify(row));
    assert.equal((await home.client.expectOk("space.get", {})).read.phase, "running", "target Check does not settle the full read");
    failOld = outcome === "failure";
    gate.release();
    if (outcome === "failure") await assert.rejects(full); else await full;
    await settled();
    const after = await home.client.repository(moved);
    assert.deepEqual([after.state, after.remote], ["read-only", movedPath]);
    const state = await home.client.expectOk("space.get", {});
    assert.equal(state.groups.flatMap((group) => group.repositories).filter((candidate) => candidate.id === id).length, 1);
    assert.ok(existsSync(clonePath(home.dataDir, moved)) && !existsSync(clonePath(home.dataDir, key)));
    // A full read begun AFTER the selected observation owns the row.
    host.script.archive(id, false);
    core.hostClient.fetchImpl = fetch;
    await core.space.readHost();
    assert.equal((await home.client.repository(moved)).state, "reachable");
  });
}

test("git-host-23: exact remote discovery records the id; every catalog page participates in fresh namespace collision refusal", async (t) => {
  const { host, home, core, id } = await prepared("target-collision");
  t.after(() => home.stop());
  const clone = clonePath(home.dataDir, OWN);
  git(clone, "config", "--unset", "spex.repositoryId");
  const restored = await home.client.settle("space.sync", { repository: OWN });
  assert.equal(restored.sync.phase, "done");
  assert.equal(git(clone, "config", "--get", "spex.repositoryId"), id);
  // Your own group's remote is named by the instance's folder (DR-127).
  const folder = hostFolder(host);
  const origin = git(clone, "remote", "get-url", folder);
  const collision = { id: "2300", fullPath: "bob", name: "Bob's team", kind: "group" as const };
  host.script.addRepository({ group: "acme", name: "page-two-spex" });
  host.script.addRepository({ group: "bob", name: "personal-spex" });
  host.script.groups.push(collision);
  host.script.rename(id, { group: collision.id });
  const calls: string[] = [];
  const inner = core.hostClient.fetchImpl;
  core.hostClient.fetchImpl = async (input, init) => { calls.push(String(input)); return inner(input, init); };
  const refused = await home.client.settle("space.sync", { repository: OWN });
  assert.equal(refused.sync.phase, "stopped");
  assert.match(refused.reason ?? "", /named like your login/);
  assert.ok(calls.some((url) => url.includes("?cursor=")), "later pages carry the newly listed user namespace");
  assert.equal(git(clone, "remote", "get-url", folder), origin);
  assert.ok(existsSync(clone) && !existsSync(clonePath(home.dataDir, "bob/ada-spex")) && !existsSync(clonePath(home.dataDir, hostKey(host, "bob/ada-spex"))));
});

test("git-host-23: a core move during catalog reading is reconciled before the selected answer is used", async (t) => {
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
  // An ordinary authorized host write must invalidate the older catalog,
  // not wait for its listing or move this running clone itself.
  await home.client.expectOk("space.repository.move", { repository: key, groupId: "2003" });
  core.hostClient.fetchImpl = inner;
  gate.release();
  const movedPath = "acme/research/catalog-move-spex";
  const moved = hostKey(host, movedPath);
  const row = await home.client.waitRepository(from, moved, (candidate) => candidate.sync.phase === "done", 30_000);
  assert.deepEqual([row.id, row.remote, row.state], [id, movedPath, "reachable"]);
  assert.ok(host.script.requests.slice(calls).filter((request) => request.path === "/api/v1/host/me").length >= 2, "catalog is reread after the host change");
  assert.equal(git(clonePath(home.dataDir, moved), "remote", "get-url", hostFolder(host)), `${host.gitOrigin}/${STANDIN_STORAGE}/acme/research/catalog-move-spex.git`);
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
  host.script.rename(id, { name: "new-authority-spex", group: "acme/research" });
  host.script.archive(id);
  core.hostClient.fetchImpl = inner;
  await core.space.readHost();
  gate.release();
  const movedPath = "acme/research/new-authority-spex";
  const moved = hostKey(host, movedPath);
  const row = await home.client.waitRepository(from, moved, (candidate) => candidate.sync.phase === "done", 30_000);
  assert.deepEqual([row.state, row.remote], ["read-only", movedPath]);
  assert.ok(!existsSync(clonePath(home.dataDir, key)) && existsSync(clonePath(home.dataDir, moved)));
});

test("git-host-23: a target-only read does not spend the first full Groups read after restart", async (t) => {
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
  assert.equal(initial.readAt, null);
  await held.reached;
  held.release();
  const full = await home.client.waitSpace(from, (state) => state.readAt !== null, 30_000);
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
    host.script.rename(id, { name: "stale-answer-spex", group: "acme/research" });
    const inner = core.hostClient.fetchImpl;
    const holds = holdingFetch(inner);
    core.hostClient.fetchImpl = holds.fetch;
    const gate = holds.hold((path, status) => path === `/api/v1/host/repositories/${id}` && status === 200);
    t.after(() => gate.release());
    const from = home.client.mark();
    await home.client.expectOk("space.sync", { repository: key });
    await gate.reached;
    core.hostClient.fetchImpl = inner;
    await home.client.expectOk("space.signout", {});
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
      // The sign-in ends once its set-up has run; your own group's folder
      // keeps the first login's name, which no later sign-in renames
      // (space-59).
      const signed = await signIn(home, host);
      assert.equal(signed.own.name, "ada");
    }
    gate.release();
    const row = await home.client.waitRepository(from, key, (candidate) => candidate.sync.phase === "stopped", 30_000);
    assert.equal(row.sync.phase, "stopped");
    if (row.sync.phase === "stopped") assert.match(row.sync.message, /sign-in changed meanwhile/i);
    assert.ok(![...core.space.targets.values()].some((target) => target.facts.id === id || target.listing?.repository.id === id), "no stale target cache entry");
    assert.ok(existsSync(clone) && !existsSync(clonePath(home.dataDir, hostKey(host, "acme/research/stale-answer-spex"))));
    assert.deepEqual(readFileSync(join(clone, ".git", "config")), config);
    assert.equal(git(clone, "remote", "get-url", hostFolder(host)), origin);
    assert.equal(git(clone, "rev-parse", "HEAD"), head);
    assert.equal((await home.client.expectOk("space.get", {})).account?.login ?? null, next === "signed-out" ? null : "bob");
  });
}

test("git-host-23: one failed fresh notice read refuses before Save and cannot fall through to a healthy unnoticed Check", async (t) => {
  const { host, home, core, id } = await prepared("notice-admission-failure");
  t.after(() => home.stop());
  core.store.deletePref(`sync:${OWN}:last`);
  core.store.deletePref(`sync:${OWN}:noticed`);
  const target = host.script.repositories.find((repository) => repository.id === id)!;
  target.members.push({ id: "1002", login: "bob", displayName: "Bob", role: "Developer" });
  const clone = clonePath(home.dataDir, OWN);
  const head = git(clone, "rev-parse", "HEAD");
  const steps: string[] = [];
  home.hooks.beforeStep = (event) => { steps.push(event.step); };
  const inner = core.hostClient.fetchImpl;
  let fail = true;
  let catalogReads = 0;
  core.hostClient.fetchImpl = async (input, init) => {
    if (pathOf(input) === "/api/v1/host/me") catalogReads += 1;
    if (pathOf(input) === "/api/v1/host/groups" && fail) { fail = false; return unavailable(); }
    return inner(input, init);
  };
  const from = host.script.requests.length;
  await home.client.expectError("space.sync", { repository: OWN }, "invalid_request", /Could not reach/);
  await settled();
  assert.deepEqual(steps, [], "not even Save started");
  assert.equal(catalogReads, 1, "no automatic healthy Check after admission failure");
  assert.equal(git(clone, "rev-parse", "HEAD"), head);
  assert.ok(!host.script.requests.slice(from).some((request) => request.path.endsWith("git-receive-pack")));
  // A new user gesture now gets the healthy sharing notice, never an
  // implicit acknowledgment inherited from the failed read.
  await home.client.expectError("space.sync", { repository: OWN }, "invalid_request", /sharing notice/);
  assert.equal((await home.client.repository(OWN)).noticed, false);
  assert.equal(core.store.getPref(`sync:${OWN}:last`), undefined);
});

test("git-host-23: solo membership becoming shared at Check stops before transport and leaves the notice owed", async (t) => {
  const { host, home, core, id } = await prepared("notice-membership-change");
  t.after(() => home.stop());
  core.store.deletePref(`sync:${OWN}:last`);
  core.store.deletePref(`sync:${OWN}:noticed`);
  const target = host.script.repositories.find((repository) => repository.id === id)!;
  let shared = false;
  home.hooks.beforeStep = (event) => {
    if (event.step === "check" && !shared) {
      shared = true;
      target.members.push({ id: "1002", login: "bob", displayName: "Bob", role: "Developer" });
    }
  };
  const from = host.script.requests.length;
  const row = await home.client.settle("space.sync", { repository: OWN });
  assert.equal(row.sync.phase, "stopped");
  if (row.sync.phase === "stopped") {
    assert.equal(row.sync.step, "check");
    assert.match(row.sync.message, /sharing notice/);
  }
  assert.deepEqual([row.members, row.noticed, row.lastSync], [2, false, null]);
  assert.ok(!host.script.requests.slice(from).some((request) => request.path.includes(".git/") || request.path.endsWith("/credential") || request.path.endsWith("/spex-branch")), "no branch preparation or Git transport");
  await home.client.expectError("space.sync", { repository: OWN }, "invalid_request", /sharing notice/);
  assert.equal(core.store.getPref(`sync:${OWN}:noticed`), undefined);
  const seen = await home.client.settle("space.sync", { repository: OWN, noticed: true });
  assert.deepEqual([seen.sync.phase, seen.noticed], ["done", true]);
});
