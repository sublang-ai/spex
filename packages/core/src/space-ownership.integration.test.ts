// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { test } from "node:test";
import { clonePath, createSpaceHarness } from "./testing/space-harness.js";
import type { SpaceGit } from "./space-git.js";
import type { StandinHost } from "./testing/standin-host.js";

const fixture = createSpaceHarness();
test.after(() => fixture.dispose());
type Home = Awaited<ReturnType<typeof fixture.startHome>>;

function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

/** A seam reached within `ms`, or the test fails naming it. */
async function within(reached: Promise<void>, what: string, ms = 10_000): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([reached, new Promise<never>((_, fail) => { timer = setTimeout(() => fail(new Error(`timeout waiting for ${what}`)), ms); })]);
  } finally { clearTimeout(timer); }
}

interface Machine {
  git: SpaceGit;
  setRemote(url: string | null): Promise<void>;
  readRepository(): Promise<unknown>;
}

/** Scheduling seams only: commands still execute through the real core,
 * filesystem, Git and stand-in host. */
function manager(home: Home) {
  return (home.service as unknown as { space: {
    machine(key: string): Machine;
    holdRemoval(key: string): { refused(): void; removed(): void };
    joinGit(): SpaceGit;
    defer(key: string): "deferred";
    reask(key: string, view: unknown): Promise<void>;
    heldIds(view: unknown, except: string): Map<string, string>;
    stop(): Promise<void>;
    hostReservations: Map<string, unknown>;
    machines: Map<string, unknown>;
  } }).space;
}

/** The next deferral of a host assignment of `key`, as it happens. */
function deferral(home: Home, key: string): Promise<void> {
  const space = manager(home);
  const defer = space.defer.bind(space);
  return new Promise<void>((resolve) => {
    space.defer = (deferredKey) => {
      const outcome = defer(deferredKey);
      if (deferredKey === key) { space.defer = defer; resolve(); }
      return outcome;
    };
  });
}

/** Each Join's Git, its runs recorded; the clone into `destination`
 * held once, before it runs or after it ran. */
function holdJoinClone(home: Home, destination: string, when: "before" | "after") {
  const reached = deferred();
  const released = deferred();
  const runs: string[][] = [];
  const space = manager(home);
  const make = space.joinGit.bind(space);
  let held = false;
  space.joinGit = () => {
    const git = make();
    const run = git.run.bind(git);
    git.run = async (args, options) => {
      runs.push(args);
      const holds = !held && args[0] === "clone" && args.at(-1) === destination;
      if (holds) held = true;
      if (holds && when === "before") { reached.resolve(); await released.promise; }
      const result = await run(args, options);
      if (holds && when === "after") {
        assert.equal(result.code, 0);
        reached.resolve();
        await released.promise;
      }
      return result;
    };
    return git;
  };
  return { reached: reached.promise, release: released.resolve, runs };
}

/** `text` matched literally in a pattern. */
function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The deferred assignments asked again, counted from now. */
function reasks(home: Home): { count: number } {
  const space = manager(home);
  const reask = space.reask.bind(space);
  const counted = { count: 0 };
  space.reask = (key, view) => { counted.count++; return reask(key, view); };
  return counted;
}

/** The creations asked of the stand-in. */
function creations(host: StandinHost): number {
  return host.script.requests.filter((request) => request.method === "POST" && request.path === "/api/v1/host/repositories").length;
}

/** Whether the scratch filesystem reads two spellings differing only by
 * case as one folder. */
function caseInsensitive(): boolean {
  const probe = join(fixture.scratch, `Case-${randomUUID()}`);
  mkdirSync(probe);
  try { return existsSync(join(dirname(probe), basename(probe).toLowerCase())); }
  finally { rmSync(probe, { recursive: true, force: true }); }
}

/** The read a remote change makes under its own reservation, held: armed
 * as the change is called and taken by its first read, which it reaches
 * with nothing awaited between. */
function holdRemoteChangeRead(home: Home, key: string) {
  const reached = deferred();
  const released = deferred();
  const machine = manager(home).machine(key);
  const setRemote = machine.setRemote.bind(machine);
  machine.setRemote = (url) => {
    machine.readRepository = async () => {
      delete (machine as Partial<Machine>).readRepository;
      reached.resolve();
      await released.promise;
      return machine.readRepository();
    };
    return setRemote(url);
  };
  return { reached: reached.promise, release: released.resolve };
}

function pauseGit(home: Home, key: string, match: (args: string[]) => boolean) {
  const reached = deferred();
  const released = deferred();
  const git = manager(home).machine(key).git;
  const run = git.run.bind(git);
  let held = false;
  git.run = async (args, options) => {
    if (!held && match(args)) { held = true; reached.resolve(); await released.promise; }
    return run(args, options);
  };
  return { reached: reached.promise, release: released.resolve };
}

async function signedHome(name: string) {
  const host = await fixture.startHost();
  const home = await fixture.startHome(name, { host, project: false, extra: { signIn: "browser" } });
  const from = home.client.mark();
  await fixture.signIn(home, host);
  await home.client.waitRepository(from, "ada/ada-spex", (row) => row.sync.phase === "done");
  return { host, home };
}

test("space-37 ownership: a remote change reserves before its read and removal owns the reverse ordering", async (t) => {
  const drain = deferred();
  const releaseDrain = deferred();
  const home = await fixture.startHome("ownership-remote", { project: false, extra: {
    mediaBeforeDrain: async (owner) => {
      if (owner.kind === "project") { drain.resolve(); await releaseDrain.promise; }
    },
  } });
  const { key, clone } = await fixture.addFolder(home, fixture.gitFolder("remote-work"));
  const remote = fixture.bareRepo();
  const held = holdRemoteChangeRead(home, key);
  t.after(async () => { held.release(); releaseDrain.resolve(); await home.stop(); });
  const changing = home.client.command("space.remote.set", { repository: key, url: remote });
  await within(held.reached, "the remote change's own read");
  // Refused naming the remote change, never a check of the host.
  const changingRemote = new RegExp(`^${escaped(key.split("/").at(-1)!)}'s remote is changing; wait for it to finish$`);
  await home.client.expectError("project.remove", { projectId: key, confirm: true }, "busy", changingRemote);
  await home.client.expectError("space.sync", { repository: key }, "busy", changingRemote);
  held.release();
  assert.ok((await changing).ok);
  assert.equal(fixture.git(clone, "remote", "get-url", "origin"), remote);
  const removing = home.client.command("project.remove", { projectId: key, confirm: true });
  await within(drain.promise, "the removal's media drain");
  await home.client.expectError("space.remote.set", { repository: key, url: fixture.bareRepo() }, "busy", /being removed/);
  await home.client.expectError("session.create", { projectId: key }, "busy", /being removed/);
  assert.equal(fixture.git(clone, "remote", "get-url", "origin"), remote);
  releaseDrain.resolve();
  assert.ok((await removing).ok);
  assert.ok(!existsSync(clone));
});

test("space-37 ownership: a retired removal cannot release its successor", async (t) => {
  const home = await fixture.startHome("ownership-release", { project: false });
  t.after(() => home.stop());
  const { key } = await fixture.addFolder(home, fixture.gitFolder("release-work"));
  const first = manager(home).holdRemoval(key);
  first.refused();
  const second = manager(home).holdRemoval(key);
  try {
    first.refused();
    await home.client.expectError("space.remote.set", { repository: key, url: fixture.bareRepo() }, "busy", /being removed/);
    await home.client.expectError("project.remove", { projectId: key, confirm: true }, "busy", /being removed/);
  } finally { second.refused(); }
  await home.client.expectOk("space.remote.set", { repository: key, url: fixture.bareRepo() });
});

test("space-37 ownership: concurrent assignments share one host claim and keep unrelated clones writable", async (t) => {
  const { host, home } = await signedHome("ownership-picks");
  const remote = "https://example.test/shared-code.git";
  const listed = host.script.addRepository({ group: "acme", name: "shared-spex", project: { format: 1, name: "shared", remote } });
  await home.client.settle("space.sync", { repository: "ada/ada-spex" });
  const folders = [fixture.gitFolder("first-work"), fixture.gitFolder("second-work")];
  for (const folder of folders) fixture.git(folder, "remote", "add", "origin", remote);
  const first = await fixture.addFolder(home, folders[0]);
  const second = await fixture.addFolder(home, folders[1]);
  const held = pauseGit(home, first.key, (args) => args[0] === "remote" && args[1] === "add");
  t.after(async () => { held.release(); await home.stop(); });
  const from = home.client.mark();
  const picking = home.client.command("space.pick", { repository: first.key, choice: { kind: "join", hostId: listed.id } });
  await within(held.reached, "the pick's remote write");
  const holder = new RegExp(`^shared-spex is on this device already as ${first.key}$`);
  await home.client.expectError("space.pick", { repository: second.key, choice: { kind: "join", hostId: listed.id } }, "invalid_request", holder);
  await home.client.expectError("space.join", { hostId: listed.id, folder: fixture.gitFolder("third-work") }, "invalid_request", holder);
  await home.client.expectError("project.remove", { projectId: first.key, confirm: true }, "busy");
  const session = await home.client.expectOk("session.create", { projectId: second.key });
  assert.equal(session.projectId, second.key);
  held.release();
  assert.ok((await picking).ok);
  await home.client.waitRepository(from, "acme/shared-spex", (row) => row.sync.phase === "done" || row.sync.phase === "choices");
  const state = await home.client.expectOk("space.get", {});
  assert.deepEqual(state.groups.flatMap((group) => group.repositories.filter((row) => row.id === listed.id).map((row) => row.key)), ["acme/shared-spex"]);
  assert.equal((await home.client.repository(second.key)).remote, null);
});

test("space-37 ownership: a waiting project creation whose repository another clone here holds keeps waiting, naming that clone, until a read finds it free", async (t) => {
  const { host, home } = await signedHome("ownership-waiting");
  t.after(() => home.stop());
  const project = await fixture.addFolder(home, fixture.gitFolder("waiting-work"));
  host.script.refuseCreate("Waiting for a member who can create");
  await home.client.expectOk("space.pick", { repository: project.key, choice: { kind: "create", groupId: "2002", name: "shared" }, noticed: true });
  const listed = host.script.addRepository({ group: "acme", name: "shared-spex", project: { format: 1, name: "shared", remote: null } });
  await home.client.settle("space.sync", { repository: "ada/ada-spex" });
  const from = home.client.mark();
  await home.client.expectOk("space.join", { hostId: listed.id, folder: fixture.gitFolder("joined-work") });
  await home.client.waitRepository(from, "acme/shared-spex", (row) => row.state === "reachable" && row.folder !== null);
  // The retried creation finds the repository another clone holds: the
  // step stands, its words naming that clone by its key.
  const asked = reasks(home);
  const refreshed = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  const holder = "shared-spex is on this device already as acme/shared-spex";
  const row = await home.client.waitRepository(refreshed, project.key, (entry) => entry.waiting?.message === holder);
  assert.deepEqual([row.state, row.id, row.remote, row.reason, row.waiting], ["local-only", null, null, null, { step: "create", group: "acme", message: holder }]);
  const state = await home.client.expectOk("space.get", {});
  assert.deepEqual(state.groups.flatMap((group) => group.repositories.filter((entry) => entry.id === listed.id).map((entry) => entry.key)), ["acme/shared-spex"]);
  // A lasting holder is no work that ends: nothing asks it again by
  // itself, however many commands end meanwhile.
  for (let index = 0; index < 5; index++) await home.client.expectOk("space.get", {});
  assert.equal(asked.count, 0);
  // That clone gone, the next read joins the repository the step asked.
  await home.client.expectOk("project.remove", { projectId: "acme/shared-spex", confirm: true });
  const freed = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  const joined = await home.client.waitRepository(freed, "acme/shared-spex", (entry) => entry.sync.phase === "done" || entry.sync.phase === "choices");
  assert.deepEqual([joined.id, joined.waiting], [listed.id, null]);
  assert.ok(!existsSync(project.clone), "the clone left its former key");
});

test("space-37 ownership: a group's first session gives its clone the group's own repository once the session no longer holds it", async (t) => {
  const { host, home: seed } = await signedHome("ownership-session-seed");
  await seed.stop();
  const key = "acme/acme-spex";
  const clone = clonePath(seed.dataDir, key);
  mkdirSync(clone, { recursive: true });
  fixture.git(clone, "init", "-q", "-b", "spex");
  fixture.git(clone, "commit", "-q", "--allow-empty", "-m", "Start");
  const notes = host.script.addRepository({ group: "acme", name: "notes-spex", records: { "notes.md": "Group records\n" } });
  const home = await fixture.startHome("ownership-session", { dataDir: seed.dataDir, project: false, extra: { signIn: "browser" } });
  t.after(() => home.stop());
  const started = home.client.mark();
  await home.client.expectOk("space.get", {});
  await home.client.waitSpace(started, (state) => state.readAt !== null);
  await home.client.expectOk("project.rebind", { projectId: key, path: fixture.gitFolder("group-work") });
  // The session's start asks once its creation ends; the session it
  // opened holds the clone, so the assignment defers, writing nothing
  // and reserving nothing.
  const atStart = deferral(home, key);
  const session = await home.client.expectOk("session.create", { projectId: key });
  assert.equal(session.projectId, key);
  await within(atStart, "the session start's lookup deferring");
  let row = await home.client.repository(key);
  assert.deepEqual([row.state, row.remote, row.id, row.sync.phase], ["local-only", null, null, "idle"]);
  // The reader's pick meanwhile is refused, naming the session, the
  // clone and the host unchanged (space-58, space-11).
  await home.client.expectError("space.pick", { repository: key, choice: { kind: "join", hostId: notes.id }, noticed: true }, "busy", /^Wait for a new session in /);
  row = await home.client.repository(key);
  assert.deepEqual([row.state, row.remote, row.id, row.sync.phase], ["local-only", null, null, "idle"]);
  assert.equal(fixture.git(clone, "remote"), "");
  // A Refresh while the session holds it defers too, never bypassing it.
  const atRefresh = deferral(home, key);
  const before = (await home.client.expectOk("space.get", {})).readAt ?? 0;
  const refreshed = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  await home.client.waitSpace(refreshed, (state) => (state.readAt ?? 0) > before);
  await within(atRefresh, "the Refresh's lookup deferring");
  row = await home.client.repository(key);
  assert.deepEqual([row.state, row.remote, row.sync.phase], ["local-only", null, "idle"]);
  assert.ok(existsSync(clone));
  // The session's first turn settles on its own, no command ending
  // with it, releasing the runtime: that release asks again, with no
  // Refresh — joined, the clone taking the repository's key on that sync.
  const ended = home.client.mark();
  await home.client.expectOk("turn.submit", { sessionId: session.id, text: "Group notes" });
  const joined = await home.client.waitRepository(ended, "acme/notes-spex", (entry) => entry.sync.phase === "done");
  assert.deepEqual([joined.state, joined.id, joined.records], ["reachable", notes.id, "group"]);
  assert.ok(!existsSync(clone), "the clone left the group's name");
});

test("space-37 ownership: a group's lookup meeting another clone's pick of its records waits for it, and is given them once that pick fails", async (t) => {
  const { host, home: seed } = await signedHome("ownership-claim-seed");
  await seed.stop();
  const key = "acme/acme-spex";
  const clone = clonePath(seed.dataDir, key);
  mkdirSync(clone, { recursive: true });
  fixture.git(clone, "init", "-q", "-b", "spex");
  fixture.git(clone, "commit", "-q", "--allow-empty", "-m", "Start");
  const notes = host.script.addRepository({ group: "acme", name: "notes-spex", records: { "notes.md": "Group records\n" } });
  const home = await fixture.startHome("ownership-claim", { dataDir: seed.dataDir, project: false, extra: { signIn: "browser" } });
  // A hold below is released before the core stops.
  let release = (): void => {};
  t.after(async () => { release(); await home.stop(); });
  const started = home.client.mark();
  await home.client.expectOk("space.get", {});
  await home.client.waitSpace(started, (state) => state.readAt !== null);
  await home.client.expectOk("project.rebind", { projectId: key, path: fixture.gitFolder("claim-group-work") });
  // Another clone's pick of the group's own repository holds its claim
  // at its remote write.
  const other = await fixture.addFolder(home, fixture.gitFolder("claim-work"));
  const held = pauseGit(home, other.key, (args) => args[0] === "remote" && args[1] === "add");
  release = held.release;
  const picking = home.client.command("space.pick", { repository: other.key, choice: { kind: "join", hostId: notes.id }, noticed: true });
  await within(held.reached, "the pick's remote write");
  // The group's lookup meanwhile holds nothing yet to name: it waits for
  // that pick, its row naming no clone.
  const waited = deferral(home, key);
  await home.client.expectOk("space.refresh", {});
  await within(waited, "the lookup deferring on the pick's claim");
  const row = await home.client.repository(key);
  assert.deepEqual([row.state, row.remote, row.reason], ["local-only", null, null]);
  // The pick fails at that write; the lookup is asked again with no
  // Refresh and given the group's records.
  fixture.git(other.clone, "remote", "add", "origin", fixture.bareRepo());
  const from = home.client.mark();
  held.release();
  assert.equal((await picking).ok, false);
  const joined = await home.client.waitRepository(from, "acme/notes-spex", (entry) => entry.sync.phase === "done");
  assert.deepEqual([joined.state, joined.id, joined.records], ["reachable", notes.id, "group"]);
  assert.ok(!existsSync(clone), "the clone left the group's name");
});

test("space-37 ownership: a group's lookup whose read of the clones here meets a failed pick's claim ending is given the records once it ends", async (t) => {
  const { host, home: seed } = await signedHome("ownership-claim-read-seed");
  await seed.stop();
  const key = "acme/acme-spex";
  const clone = clonePath(seed.dataDir, key);
  mkdirSync(clone, { recursive: true });
  fixture.git(clone, "init", "-q", "-b", "spex");
  fixture.git(clone, "commit", "-q", "--allow-empty", "-m", "Start");
  const notes = host.script.addRepository({ group: "acme", name: "notes-spex", records: { "notes.md": "Group records\n" } });
  const home = await fixture.startHome("ownership-claim-read", { dataDir: seed.dataDir, project: false, extra: { signIn: "browser" } });
  // A hold below is released before the core stops.
  let release = (): void => {};
  t.after(async () => { release(); await home.stop(); });
  const started = home.client.mark();
  await home.client.expectOk("space.get", {});
  await home.client.waitSpace(started, (state) => state.readAt !== null);
  await home.client.expectOk("project.rebind", { projectId: key, path: fixture.gitFolder("claim-read-group-work") });
  const other = await fixture.addFolder(home, fixture.gitFolder("claim-read-work"));
  const held = pauseGit(home, other.key, (args) => args[0] === "remote" && args[1] === "add");
  release = held.release;
  const picking = home.client.command("space.pick", { repository: other.key, choice: { kind: "join", hostId: notes.id }, noticed: true });
  await within(held.reached, "the pick's remote write");
  // The pick fails at that write; its claim's end is held back, delivered
  // exactly as the lookup has read who holds what here — or, failing
  // that, once the lookup defers on it.
  const space = manager(home);
  const claim = space.hostReservations.get(notes.id) as { release(): void };
  const end = claim.release;
  const ended = deferred();
  claim.release = () => ended.resolve();
  fixture.git(other.clone, "remote", "add", "origin", fixture.bareRepo());
  held.release();
  assert.equal((await picking).ok, false);
  await within(ended.promise, "the failed pick's claim ending");
  const heldIds = space.heldIds.bind(space);
  space.heldIds = (view, except) => {
    const ids = heldIds(view, except);
    if (except === key) { space.heldIds = heldIds; queueMicrotask(end); }
    return ids;
  };
  void deferral(home, key).then(end);
  // The lookup is asked again with no further Refresh and given the
  // group's records, never naming the failed pick's clone as their holder.
  const from = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  const joined = await home.client.waitRepository(from, "acme/notes-spex", (entry) => entry.sync.phase === "done");
  assert.deepEqual([joined.state, joined.id, joined.records], ["reachable", notes.id, "group"]);
  assert.ok(!existsSync(clone), "the clone left the group's name");
});

test("space-37 ownership: a waiting project creation met by a working session keeps its waiting row and is created once the session and a remote change end", async (t) => {
  const { host, home } = await signedHome("ownership-waiting-busy");
  // A hold below is released before the core stops.
  let release = (): void => {};
  t.after(async () => { release(); await home.stop(); });
  const project = await fixture.addFolder(home, fixture.gitFolder("busy-work"));
  const words = "Waiting for a member who can create";
  host.script.refuseCreate(words);
  await home.client.expectOk("space.pick", { repository: project.key, choice: { kind: "create", groupId: "2002", name: "busy" }, noticed: true });
  const waiting = { step: "create", group: "acme", message: words };
  assert.deepEqual((await home.client.repository(project.key)).waiting, waiting);
  const session = await home.client.expectOk("session.create", { projectId: project.key });
  host.script.refuseCreate(null);
  const asked = creations(host);
  // The read's retry meets the session: the creation defers, its row
  // still waiting with the host's words, nothing asked of the host.
  const retried = deferral(home, project.key);
  await home.client.expectOk("space.refresh", {});
  await within(retried, "the retried creation deferring");
  const row = await home.client.repository(project.key);
  assert.deepEqual([row.state, row.remote, row.waiting, row.sync.phase], ["local-only", null, waiting, "idle"]);
  assert.equal(creations(host), asked);
  // The session ends while a remote change holds the clone: that change
  // still stands in the way, and its end asks again, with no Refresh —
  // created, joined and synced under the group's key.
  const changing = holdRemoteChangeRead(home, project.key);
  release = changing.release;
  const unchanged = home.client.command("space.remote.set", { repository: project.key, url: null });
  await within(changing.reached, "the remote change's own read");
  await home.client.expectOk("session.dispose", { sessionId: session.id });
  const meanwhile = await home.client.repository(project.key);
  assert.deepEqual([meanwhile.remote, meanwhile.waiting, creations(host)], [null, waiting, asked]);
  const ended = home.client.mark();
  changing.release();
  assert.ok((await unchanged).ok);
  const created = await home.client.waitRepository(ended, "acme/busy-spex", (entry) => entry.sync.phase === "done");
  assert.deepEqual([created.state, created.waiting], ["reachable", null]);
  assert.equal(creations(host), asked + 1);
});

test("space-37 ownership: a Join still reading the host claims its id under no clone key, a second Join and a pick meanwhile refused as joining", async (t) => {
  const { host, home: seed } = await signedHome("ownership-join-unread-seed");
  const listed = host.script.addRepository({ group: "acme", name: "unread-spex", project: { format: 1, name: "unread", remote: null } });
  const project = await fixture.addFolder(seed, fixture.gitFolder("unread-pick"));
  await seed.stop();
  // Restarted signed in and asked nothing yet: no view is held, and the
  // Join's own read is held at the host.
  const home = await fixture.startHome("ownership-join-unread", { dataDir: seed.dataDir, project: false, extra: { signIn: "browser" } });
  host.script.sleepListing(1_500);
  const cloning = holdJoinClone(home, clonePath(home.dataDir, "acme/unread-spex"), "before");
  t.after(async () => { cloning.release(); host.script.sleepListing(0); await home.stop(); });
  const from = home.client.mark();
  const first = home.client.command("space.join", { hostId: listed.id });
  // Until the read names its clone key, the claim fabricates none.
  await home.client.expectError("space.join", { hostId: listed.id }, "busy", new RegExp(`^${listed.id} is joining; wait for it to finish$`));
  // A pick of it, sharing that read, meets the Join's claim: refused as
  // joining, never as a clone on this device.
  const picking = home.client.expectError("space.pick", { repository: project.key, choice: { kind: "join", hostId: listed.id }, noticed: true }, "busy", /^unread-spex is joining; wait for it to finish$/);
  host.script.sleepListing(0);
  assert.ok((await first).ok);
  await within(cloning.reached, "the Join's clone");
  await picking;
  assert.equal((await home.client.repository(project.key)).remote, null);
  cloning.release();
  await home.client.waitRepository(from, "acme/unread-spex", (row) => row.state === "reachable" && row.sync.phase !== "running");
});

test("space-37 ownership: a read records the host's id beside a clone matched by its remote, reserving nothing", async (t) => {
  const { host, home } = await signedHome("ownership-record-id");
  t.after(() => home.stop());
  const key = "ada/ada-spex";
  const clone = clonePath(home.dataDir, key);
  const id = fixture.git(clone, "config", "--get", "spex.repositoryId");
  // The clone keeps its remote and loses its id; a state read learns so.
  fixture.git(clone, "config", "--unset", "spex.repositoryId");
  assert.equal((await home.client.repository(key)).id, null);
  const before = (await home.client.expectOk("space.get", {})).readAt ?? 0;
  const from = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  const read = await home.client.waitSpace(from, (state) => (state.readAt ?? 0) > before);
  // Recorded at that read, in one step: never a running row.
  assert.equal(fixture.git(clone, "config", "--get", "spex.repositoryId"), id);
  assert.equal(read.groups.flatMap((group) => group.repositories).find((row) => row.key === key)?.id, id);
  assert.ok(home.client.readings(from, [key]).every((row) => row.sync.phase !== "running"));
  assert.equal(host.script.repositories.find((repository) => repository.id === id)?.path, "ada-spex");
});

test("space-37 ownership: a core stopping during two Joins' clones ends both at once, nothing half-indexed or claimed", async (t) => {
  const { host, home } = await signedHome("ownership-join-stop");
  const listed = ["slow", "slower"].map((name) => host.script.addRepository({ group: "acme", name: `${name}-spex`, project: { format: 1, name, remote: `https://example.test/${name}-code.git` } }));
  await home.client.settle("space.sync", { repository: "ada/ada-spex" });
  const keys = ["acme/slow-spex", "acme/slower-spex"];
  const cloning = deferred();
  let clones = 0;
  const space = manager(home);
  const make = space.joinGit.bind(space);
  const runs: string[][] = [];
  space.joinGit = () => {
    const git = make();
    const run = git.run.bind(git);
    git.run = (args, options) => {
      runs.push(args);
      // The child is spawned before this returns: nothing is held.
      const running = run(args, options);
      if (args[0] === "clone" && ++clones === 2) cloning.resolve();
      return running;
    };
    return git;
  };
  // The host answers the clone only after this, past any prompt stop.
  host.script.sleepTransport(15_000);
  t.after(async () => { host.script.sleepTransport(0); await home.stop(); });
  for (const entry of listed) await home.client.expectOk("space.join", { hostId: entry.id, folder: join(fixture.scratch, `slow-code-${randomUUID()}`) });
  await within(cloning.promise, "both Joins' clones");
  const begun = Date.now();
  await home.stop();
  const took = Date.now() - begun;
  assert.ok(took < 5_000, `the stop waited ${took} ms for the Joins`);
  // The clones they began are gone, no store entry or machine names
  // either, their claims are released, and no later step started.
  for (const key of keys) {
    assert.equal(existsSync(clonePath(home.dataDir, key)), false);
    assert.equal(space.machines.has(key), false);
  }
  assert.equal(space.hostReservations.size, 0);
  assert.deepEqual(runs.map((args) => args[0]), ["clone", "clone"]);
});

test("space-37 ownership: a core stopping once a Join's clone finished starts none of its later steps", async (t) => {
  const { host, home } = await signedHome("ownership-join-stop-after");
  const listed = host.script.addRepository({ group: "acme", name: "later-spex", project: { format: 1, name: "later", remote: "https://example.test/later-code.git" } });
  await home.client.settle("space.sync", { repository: "ada/ada-spex" });
  const key = "acme/later-spex";
  const destination = clonePath(home.dataDir, key);
  const held = holdJoinClone(home, destination, "after");
  t.after(async () => { held.release(); await home.stop(); });
  await home.client.expectOk("space.join", { hostId: listed.id, folder: join(fixture.scratch, `later-code-${randomUUID()}`) });
  await within(held.reached, "the Join's finished clone");
  const space = manager(home);
  const stop = space.stop.bind(space);
  const asked = deferred();
  space.stop = () => { const stopped = stop(); asked.resolve(); return stopped; };
  const stopping = home.stop();
  await within(asked.promise, "the space's stop");
  held.release();
  await within(stopping, "the core's stop");
  // Its finished clone goes with it, unindexed and unclaimed: no id
  // written, no code cloned.
  assert.deepEqual(held.runs.map((args) => args[0]), ["clone"]);
  assert.equal(existsSync(destination), false);
  assert.equal(space.machines.has(key), false);
  assert.equal(space.hostReservations.size, 0);
});

test("space-37 ownership: a namespace move cannot carry an unindexed Join", async (t) => {
  // Only a filesystem reading both spellings as one renames the group's
  // folder in place, carrying a Join's clone beneath it; elsewhere each
  // clone moves alone and no Join's clone lies in its way.
  if (!caseInsensitive()) { t.skip("the scratch filesystem is case-sensitive: a case-only move renames no shared folder"); return; }
  const { host, home } = await signedHome("ownership-join-move");
  const alpha = host.script.addRepository({ group: "acme", name: "alpha-spex", project: { format: 1, name: "alpha", remote: null } });
  const beta = host.script.addRepository({ group: "acme", name: "beta-spex", project: { format: 1, name: "beta", remote: null } });
  await home.client.settle("space.sync", { repository: "ada/ada-spex" });
  const first = home.client.mark();
  await home.client.expectOk("space.join", { hostId: alpha.id, folder: fixture.gitFolder("moving-alpha") });
  await home.client.waitRepository(first, "acme/alpha-spex", (row) => row.state === "reachable" && row.folder !== null);
  const held = holdJoinClone(home, clonePath(home.dataDir, "acme/beta-spex"), "after");
  t.after(async () => { held.release(); await home.stop(); });
  const workspace = join(home.dataDir, "workspace");
  const joined = home.client.mark();
  await home.client.expectOk("space.join", { hostId: beta.id, folder: fixture.gitFolder("joining-beta") });
  await within(held.reached, "the Join's finished clone");
  host.script.groups.push({ id: "2004", fullPath: "Acme", name: "Acme", kind: "group" });
  host.script.rename(alpha.id, { group: "Acme" });
  // The rename in place would carry the unindexed clone: alpha's sync
  // defers it, the folder keeping its spelling and alpha its key.
  const syncing = home.client.mark();
  await home.client.expectOk("space.sync", { repository: "acme/alpha-spex", noticed: true });
  await home.client.waitRepository(syncing, "acme/alpha-spex", (row) => row.sync.phase === "done");
  assert.ok(readdirSync(workspace).includes("acme") && !readdirSync(workspace).includes("Acme"), JSON.stringify(readdirSync(workspace)));
  assert.ok(existsSync(join(workspace, "acme", "beta-spex")));
  held.release();
  await home.client.waitRepository(joined, "acme/beta-spex", (row) => row.state === "reachable" && row.folder !== null);
  // Indexed, beta moves with the folder at the next sync.
  host.script.rename(beta.id, { group: "Acme" });
  const next = home.client.mark();
  await home.client.expectOk("space.sync", { repository: "acme/alpha-spex", noticed: true });
  await home.client.waitRepository(next, "Acme/alpha-spex", (row) => row.sync.phase === "done");
  assert.ok(readdirSync(workspace).includes("Acme") && !readdirSync(workspace).includes("acme"), JSON.stringify(readdirSync(workspace)));
  const last = home.client.mark();
  await home.client.expectOk("space.sync", { repository: "Acme/beta-spex", noticed: true });
  const row = await home.client.waitRepository(last, "Acme/beta-spex", (entry) => entry.sync.phase === "done");
  assert.ok(row.folder);
  assert.ok(existsSync(clonePath(home.dataDir, row.key)));
});
