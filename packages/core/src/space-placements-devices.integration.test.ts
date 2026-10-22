// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A spex repository placed at two instances across devices (DR-128):
// real cores on three scratch homes against two stand-in instances on
// separate Git backends. A project placed at both syncs through a device
// holding both; a placement file whoever can push wrote is offered on
// every other device as a line "Not on this device" with Attach, no
// device carrying records there before its reader continues; Attach,
// that placement's notice, adds its remote and syncs it as an operation
// of the clone's machine, and gives a local-only clone its first
// placement, moving it as a pick does; a Leave deletes the file and every
// other device drops its remote there at its next sync; two devices
// placing at one instance at once meet as one choice of the file; and
// Members, Share and Move act on the placement each names (space-93,
// space-99, space-90, space-87, space-29, space-98, space-91, space-21,
// storage-35) — hermetic, on loopback alone, in a file budget of its
// own.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BUILTIN_PACKAGE_NAME, parseLock, type RegistrySourceLock } from "./environment/index.js";
import { Home } from "./home.js";
import { canonicalOrigin } from "./instance.js";
import { encodePlacementFile, PLACEMENTS_DIR } from "./placements.js";
import type { GroupsState, RepositoryState } from "./protocol.js";
import type { SpaceStepEvent } from "./space.js";
import type { StandinHost } from "./testing/standin-host.js";
import { bareOf, clonePath, createSpaceHarness, hostFolder, hostKey, instanceOf, placementOf, repositoryOf, rowsOf, syncRecordsOf } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
const { scratch, git, gitFolder, addFolder, peerClone, peerPush, runTurn, sleep, startHome, startHost, signIn, signOut } = fixture;
test.after(() => fixture.dispose());

type Device = Awaited<ReturnType<typeof startHome>>;

/** The first stand-in's person, and your own group's repository once
 * signed in as them. */
const LOGIN = "ada";
const HOST_OWN = `${LOGIN}/${LOGIN}-spex`;
const HOST_NAME = "Stand-in Git host";
const SECOND_NAME = "Second stand-in";
/** The second stand-in's person. */
const BOB = { id: "1002", login: "bob", displayName: "Bob" };

/** A Refresh of every signed-in instance, landed. */
async function refreshed(home: Device): Promise<GroupsState> {
  const before = await home.client.expectOk("space.get", {});
  const mark = home.client.mark();
  await home.client.expectOk("space.refresh", {});
  return home.client.waitSpace(mark, (state) => state.instances.every((instance) => !instance.signedIn
    || (instance.read.phase === "idle" && (instance.readAt ?? 0) > (instanceOf(before, instance.origin)?.readAt ?? 0))), 30_000);
}

/** One Git configuration value of a clone, or null where none stands. */
function configOf(clone: string, key: string): string | null {
  try { return git(clone, "config", "--get", key); } catch { return null; }
}

/** Each line of a row: its instance, whether its clone holds it, and its
 * state (space-87, space-61). */
const lines = (row: RepositoryState): [string | null, boolean, string][] => row.placements.map((line) => [line.instance, line.attached, line.state]);

/** Each line of a row with the outcome the last operation left there. */
const outcomes = (row: RepositoryState): [string | null, boolean, string | undefined][] => row.placements.map((line) => [line.instance, line.attached, line.outcome?.kind]);

/** The pushes an instance's Git transport accepted for a spex repository
 * at `path` there. */
const pushesTo = (host: StandinHost, path: string): number => host.script.transportCredentials.filter((entry) => entry.push && entry.path.includes(`/${path}.git/`)).length;

/** Whether a blob stands at `path` on a bare repository's `spex`. */
function holds(bare: string, path: string): boolean {
  try { return git(bare, "cat-file", "-t", `spex:${path}`) === "blob"; } catch { return false; }
}

test("space-93, space-99, space-90, space-87, space-29, space-61, space-62, space-63, space-12, space-57, space-98, space-91, space-21, space-97, space-14, space-69, space-72, space-78, space-60, space-5, space-4, storage-34, storage-36, storage-38, storage-5: a project placed at two instances syncs through a device holding both, and a second device attaches from the placement's file — a file pushed by plain Git standing unattached on every home, nothing carried there, until its reader continues; the second home's Join at the second writing nothing to the placement files and naming the first it does not list; a session crossing from the second home and an intent from the first; Attach refused without its notice, signed out, with no file, at a placement held — your own group's own repository's at the second, placed there by the sign-in, among them — and for a repository another clone holds, and with its notice attaching and syncing; a Leave asked while a sync runs following it and every other home dropping that remote at its next sync; two homes placing at once meeting as one choice, the side not chosen dropped and offered Attach; and Members, Share and Move acting on the placement each names", async (t) => {
  const first = await startHost();
  const second = await startHost({ displayName: SECOND_NAME, person: BOB });
  const firstOrigin = canonicalOrigin(first.url);
  const secondOrigin = canonicalOrigin(second.url);
  const firstFolder = hostFolder(first);
  const secondFolder = hostFolder(second);
  const file = `${PLACEMENTS_DIR}/${secondFolder}.yaml`;

  // The first home: signed in to both, its project in the first's acme.
  const one = await startHome("devices-one", { host: first, project: false });
  t.after(() => one.stop());
  let mark = one.client.mark();
  await signIn(one, first);
  await one.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  await signIn(one, second);
  const { key: local } = await addFolder(one, gitFolder("atlas"));
  mark = one.client.mark();
  await one.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: first.url, groupId: "2002", name: "atlas" } });
  const key = hostKey(first, "acme/atlas-spex");
  const picked = await one.client.waitRepository(mark, key, (repository) => repository.sync.phase === "done", 30_000);
  const firstId = picked.id as string;
  const oneClone = clonePath(one.dataDir, key);
  const firstBare = bareOf(first, key);

  // A member of a repository in the second's acme who may not manage
  // its members places the records there by plain Git, which no Spex act
  // gates: the records pushed there, and the placement's file pushed to
  // the first (space-90, storage-36).
  const there = second.script.addRepository({ group: "acme", name: "atlas-spex", members: [{ id: "1003", login: "grace", displayName: "Grace Hopper", role: "Developer" }] });
  const peer = peerClone(firstBare);
  git(peer, "push", "-q", there.bare, "HEAD:spex");
  const peerHead = git(there.bare, "rev-parse", "spex");
  const bytes = encodePlacementFile(secondOrigin, there.id);
  await peerPush(peer, (dir) => {
    mkdirSync(join(dir, PLACEMENTS_DIR), { recursive: true });
    writeFileSync(join(dir, file), bytes);
  });

  // The first home's next Sync brings that file: the second's listing is
  // its row's line, not on this device, and nothing is carried there
  // (space-87, space-90).
  await refreshed(one);
  assert.equal((await one.client.settle("space.sync", { repository: key }, 30_000)).sync.phase, "done");
  let row = await one.client.repository(key);
  assert.deepEqual(lines(row), [[firstOrigin, true, "reachable"], [secondOrigin, false, "absent"]]);
  assert.deepEqual([placementOf(row, second.url).id, placementOf(row, second.url).path, placementOf(row, second.url).members], [there.id, "acme/atlas-spex", 2]);
  assert.equal(git(there.bare, "rev-parse", "spex"), peerHead, "nothing carried to the second");
  assert.equal(pushesTo(second, "acme/atlas-spex"), 0);
  assert.equal(configOf(oneClone, `remote.${secondFolder}.url`), null);

  // The third home, signed in to both as a member at each — the same
  // accounts, a device of theirs — joins at the first: the second's
  // placement stands from its file as its line "Not on this device"
  // with no row of its own, and Join of it is refused (space-87,
  // space-29, space-90).
  const three = await startHome("devices-three", { host: first, project: false });
  t.after(() => three.stop());
  mark = three.client.mark();
  await signIn(three, first);
  const threeOwn = await three.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase !== "running" && repository.sync.phase !== "idle", 30_000);
  assert.equal(threeOwn.sync.phase, "done", JSON.stringify(threeOwn.sync));
  await signIn(three, second);
  mark = three.client.mark();
  await three.client.expectOk("space.join", { instance: first.url, hostId: firstId });
  await three.client.waitRepository(mark, key, (repository) => repository.state === "reachable" && repository.sync.phase === "idle", 30_000);
  const threeClone = clonePath(three.dataDir, key);
  let state = await refreshed(three);
  row = repositoryOf(state, key);
  assert.deepEqual(lines(row), [[firstOrigin, true, "reachable"], [secondOrigin, false, "absent"]]);
  assert.equal(placementOf(row, second.url).id, there.id);
  assert.ok(!rowsOf(state).some((repository) => repository.key === hostKey(second, "acme/atlas-spex")), "no row of its own");
  await three.client.expectError("space.join", { instance: second.url, hostId: there.id }, "invalid_request", /^atlas-spex is a placement of atlas-spex not on this device yet$/);

  // The first home's reader continues past Attach: its first step adds
  // the remote, named by the second's folder with the id in its own
  // section, the notice recorded for it, and the same operation syncs
  // the clone, each placement in turn, both lines synced, the file's
  // bytes as they were (space-99, space-90, space-31, storage-34,
  // storage-5).
  const steps: string[] = [];
  one.hooks.beforeStep = (event: SpaceStepEvent) => {
    // The Save's own commit seam aside: the steps entered alone.
    if (event.repository !== key || event.at === "commit") return;
    steps.push(`${event.op}:${event.step}:${event.placement === secondOrigin ? "second" : event.placement === firstOrigin ? "first" : "-"}`);
  };
  const attached = await one.client.settle("space.attach", { repository: key, instance: second.url, noticed: true }, 30_000);
  one.hooks.beforeStep = undefined;
  assert.deepEqual(steps.slice(0, 3), ["attach:check:second", "attach:save:-", "attach:check:first"], steps.join(" "));
  assert.ok(steps.includes("attach:push:second"), steps.join(" "));
  assert.equal(attached.sync.phase, "done", JSON.stringify(attached.sync));
  assert.deepEqual(outcomes(attached), [[firstOrigin, true, "synced"], [secondOrigin, true, "synced"]]);
  assert.match(configOf(oneClone, `remote.${secondFolder}.url`) ?? "", /\/acme\/atlas-spex\.git$/);
  assert.equal(configOf(oneClone, `remote.${secondFolder}.spexId`), there.id);
  assert.equal(configOf(oneClone, "spex.repositoryId"), null);
  assert.equal(git(there.bare, "rev-parse", "spex"), git(oneClone, "rev-parse", "HEAD"));
  assert.equal(readFileSync(join(oneClone, file), "utf8"), bytes);
  assert.equal(syncRecordsOf(one.dataDir, key)[`sync:${key}:${secondFolder}:noticed`], true);

  // On the third home it stays unattached, its sync carrying nothing to
  // the second, until its own reader continues (space-90).
  const carried = pushesTo(second, "acme/atlas-spex");
  const unattached = await three.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(unattached.sync.phase, "done", JSON.stringify(unattached.sync));
  assert.deepEqual(lines(unattached), [[firstOrigin, true, "reachable"], [secondOrigin, false, "absent"]]);
  assert.deepEqual(git(threeClone, "remote").split("\n"), [firstFolder]);
  assert.equal(pushesTo(second, "acme/atlas-spex"), carried);

  // The second home, signed in at the second alone, joins the second's
  // placement, pairing a folder: it writes nothing new to the placement
  // files, its row naming the one placement it can reach, and the row
  // says the records are also placed at the first, an instance this home
  // does not list (space-63, space-87, space-62, storage-36).
  const two = await startHome("devices-two", { host: second, project: false });
  t.after(() => two.stop());
  mark = two.client.mark();
  await signIn(two, second);
  await two.client.waitRepository(mark, `${BOB.login}/${BOB.login}-spex`, (repository) => repository.sync.phase === "done", 30_000);
  const twoKey = hostKey(second, "acme/atlas-spex");
  mark = two.client.mark();
  await two.client.expectOk("space.join", { instance: second.url, hostId: there.id, folder: join(mkdtempSync(join(scratch, "two-")), "atlas") });
  await two.client.waitRepository(mark, twoKey, (repository) => repository.state === "reachable" && repository.sync.phase === "idle" && repository.folder !== null, 30_000);
  const twoClone = clonePath(two.dataDir, twoKey);
  assert.deepEqual(readdirSync(join(twoClone, PLACEMENTS_DIR)).sort(), [`${firstFolder}.yaml`, `${secondFolder}.yaml`].sort());
  assert.equal(readFileSync(join(twoClone, file), "utf8"), bytes);
  assert.equal(git(twoClone, "status", "--porcelain", "--", PLACEMENTS_DIR), "");
  const joinedHead = git(twoClone, "rev-parse", "HEAD");
  state = await two.client.expectOk("space.get", {});
  assert.equal(instanceOf(state, first.url), undefined, "the second home lists no first");
  row = repositoryOf(state, twoKey);
  assert.deepEqual(lines(row), [[secondOrigin, true, "reachable"]]);
  assert.deepEqual([...row.placedAt].sort(), [firstOrigin, secondOrigin].sort());

  // A session the second home syncs to the second — its first push into
  // a repository with another member past the sharing notice — reaches
  // the first's spex once the first home syncs; an intent the first home
  // queues reaches the second home (space-12, space-57).
  const sessionId = await runTurn(two, twoKey, "Work from the second");
  assert.equal((await two.client.settle("space.sync", { repository: twoKey, placement: second.url, noticed: true }, 30_000)).sync.phase, "done");
  assert.equal(git(twoClone, "diff", "--name-only", joinedHead, "HEAD", "--", PLACEMENTS_DIR), "", "its sync writes nothing new to the placement files");
  assert.ok(holds(there.bare, `sessions/${sessionId}.json`), "the session reached the second");
  assert.ok(!holds(firstBare, `sessions/${sessionId}.json`));
  const crossed = await one.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(crossed.sync.phase, "done", JSON.stringify(crossed.sync));
  assert.deepEqual(outcomes(crossed), [[firstOrigin, true, "synced"], [secondOrigin, true, "synced"]]);
  assert.ok(holds(firstBare, `sessions/${sessionId}.json`), "the session reached the first");
  const intent = await one.client.expectOk("intent.queue", { projectId: key, text: "Ship the parser" });
  assert.equal((await one.client.settle("space.sync", { repository: key }, 30_000)).sync.phase, "done");
  const listening = two.client.mark();
  assert.equal((await two.client.settle("space.sync", { repository: twoKey }, 30_000)).sync.phase, "done");
  assert.ok(existsSync(join(twoClone, "intents", `${intent.id}.json`)), "the intent reached the second home");
  await two.client.waitFor((message) => two.client.messages.indexOf(message) >= listening && message.type === "intents.changed" && message.projectIds.includes(twoKey));

  // Attach is refused without its notice; at an instance the clone holds
  // a placement at; where no file of the clone names a repository the
  // instance lists; for a repository another clone here holds; at an
  // instance the home does not list, or for no clone, not found; and
  // signed out there (space-29, space-90).
  await three.client.expectError("space.attach", { repository: key, instance: second.url, noticed: false }, "invalid_request", /^Read the sharing notice before attaching atlas-spex$/);
  await three.client.expectError("space.attach", { repository: key, instance: first.url, noticed: true }, "invalid_request", new RegExp(`^atlas-spex is placed at ${HOST_NAME} already$`));
  // Your own group's own repository, which the third home's sign-in at
  // the second placed there, is placed there already (space-4).
  await three.client.expectError("space.attach", { repository: HOST_OWN, instance: second.url, noticed: true }, "invalid_request", new RegExp(`^${LOGIN}-spex is placed at ${SECOND_NAME} already$`));
  const { key: other, clone: otherClone } = await addFolder(two, gitFolder("other"));
  await two.client.expectError("space.attach", { repository: other, instance: second.url, noticed: true }, "invalid_request", new RegExp(`^No placement file of other-spex names a spex repository ${SECOND_NAME} lists$`));
  mkdirSync(join(otherClone, PLACEMENTS_DIR), { recursive: true });
  writeFileSync(join(otherClone, file), bytes);
  await two.client.expectError("space.attach", { repository: other, instance: second.url, noticed: true }, "invalid_request", /^atlas-spex is on this device already, as a placement of atlas-spex$/);
  await two.client.expectError("space.attach", { repository: twoKey, instance: first.url, noticed: true }, "not_found");
  await three.client.expectError("space.attach", { repository: hostKey(first, "acme/nowhere-spex"), instance: second.url, noticed: true }, "not_found");
  await signOut(three, second);
  await three.client.expectError("space.attach", { repository: key, instance: second.url, noticed: true }, "invalid_request", /^Sign in first$/);
  await signIn(three, second);
  await refreshed(three);

  // With its notice, the third home's Attach adds the remote and syncs
  // that placement, its line synced; a second Attach there is refused
  // (space-99, space-61, space-29).
  const threeAttached = await three.client.settle("space.attach", { repository: key, instance: second.url, noticed: true }, 30_000);
  assert.equal(threeAttached.sync.phase, "done", JSON.stringify(threeAttached.sync));
  assert.deepEqual(threeAttached.placements.map((line) => [line.instance, line.attached, line.state, line.outcome?.kind]), [[firstOrigin, true, "reachable", "synced"], [secondOrigin, true, "reachable", "synced"]]);
  assert.equal(configOf(threeClone, `remote.${secondFolder}.spexId`), there.id);
  assert.equal(syncRecordsOf(three.dataDir, key)[`sync:${key}:${secondFolder}:noticed`], true);
  assert.equal(git(there.bare, "rev-parse", "spex"), git(threeClone, "rev-parse", "HEAD"));
  await three.client.expectError("space.attach", { repository: key, instance: second.url, noticed: true }, "invalid_request", new RegExp(`^atlas-spex is placed at ${SECOND_NAME} already$`));

  // The first home's Leave of the second, asked while its Sync runs,
  // follows that sync, then deletes the file and drops the remote
  // (space-98, space-21, space-31).
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let reached!: () => void;
  const held = new Promise<void>((resolve) => { reached = resolve; });
  const order: string[] = [];
  one.hooks.beforeStep = async (event: SpaceStepEvent) => {
    if (event.repository !== key || event.at === "commit") return;
    order.push(`${event.op}:${event.step}`);
    if (event.op === "sync" && event.step === "check" && order.filter((step) => step === "sync:check").length === 1) {
      reached();
      await gate;
    }
  };
  mark = one.client.mark();
  assert.deepEqual(await one.client.expectOk("space.sync", { repository: key }), { accepted: true });
  await held;
  assert.deepEqual(await one.client.expectOk("space.leave", { repository: key, instance: second.url }), { accepted: true });
  await sleep(100);
  assert.ok(!order.some((step) => step.startsWith("leave:")), `the leave waits for the sync: ${order.join(" ")}`);
  release();
  const left = await one.client.waitRepository(mark, key, (repository) => repository.sync.phase === "idle" && repository.placements.length === 1, 30_000);
  one.hooks.beforeStep = undefined;
  const leaveAt = order.indexOf("leave:check");
  assert.ok(leaveAt > order.lastIndexOf("sync:push") && order.slice(leaveAt).every((step) => step.startsWith("leave:")), order.join(" "));
  assert.deepEqual(lines(left), [[firstOrigin, true, "reachable"]]);
  assert.ok(!existsSync(join(oneClone, file)), "the leave deleted the file");
  assert.equal(configOf(oneClone, `remote.${secondFolder}.url`), null);
  assert.equal((await one.client.settle("space.sync", { repository: key }, 30_000)).sync.phase, "done");
  assert.ok(!holds(firstBare, file), "the deletion reached the first");

  // The third home's next Sync drops its remote there, with this
  // device's records of it, the clone's records kept (space-91,
  // storage-38, space-5).
  const dropped = await three.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(dropped.sync.phase, "done", JSON.stringify(dropped.sync));
  assert.deepEqual(lines(dropped), [[firstOrigin, true, "reachable"]]);
  assert.deepEqual(git(threeClone, "remote").split("\n"), [firstFolder]);
  assert.ok(existsSync(join(threeClone, "sessions", `${sessionId}.json`)) && existsSync(join(threeClone, "intents", `${intent.id}.json`)), "the clone's records kept");
  assert.deepEqual(Object.keys(syncRecordsOf(three.dataDir, key)).filter((name) => name.startsWith(`sync:${key}:${secondFolder}:`)), []);

  // The first and third homes each place at the second at once — the
  // first joining the repository it left, the third creating another —
  // and their files meet as one choice at the third, its own creation
  // pushed meanwhile (space-97, space-91, space-14).
  const rejoined = await one.client.settle("space.place", { repository: key, choice: { kind: "join", instance: second.url, hostId: there.id }, noticed: true }, 30_000);
  assert.equal(rejoined.sync.phase, "done", JSON.stringify(rejoined.sync));
  assert.deepEqual(outcomes(rejoined), [[firstOrigin, true, "synced"], [secondOrigin, true, "synced"]]);
  const acme = second.script.groups.find((group) => group.fullPath === "acme");
  assert.ok(acme);
  const meeting = await three.client.settle("space.place", { repository: key, choice: { kind: "create", instance: second.url, groupId: acme.id, name: "atlas-two" }, noticed: true }, 30_000);
  const created = second.script.repositories.find((repository) => repository.path === "atlas-two-spex");
  assert.ok(created, "the third created atlas-two-spex at the second");
  assert.ok(meeting.sync.phase === "choices" && meeting.sync.placement === firstOrigin, JSON.stringify(meeting.sync));
  assert.deepEqual(meeting.conflicts.map((conflict) => conflict.unit.unit), [file]);
  assert.deepEqual(outcomes(meeting), [[firstOrigin, true, "choices"], [secondOrigin, true, "synced"]]);
  assert.equal(git(created.bare, "rev-parse", "spex"), git(threeClone, "rev-parse", "HEAD"));

  // The third keeps its own; the first's next Sync drops its remote
  // there, the clone's records kept, and, once a read of the second
  // lists the chosen repository, offers Attach for it; the one it joined
  // stands at the stand-in (space-91, space-90, git-host-5).
  const kept = await three.client.settle("space.sync", { repository: key, placement: first.url, choices: { [file]: "mine" } }, 30_000);
  assert.equal(kept.sync.phase, "done", JSON.stringify(kept.sync));
  assert.equal(`${git(firstBare, "show", `spex:${file}`)}\n`, encodePlacementFile(secondOrigin, created.id));
  const offered = await one.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(offered.sync.phase, "done", JSON.stringify(offered.sync));
  assert.deepEqual(lines(offered), [[firstOrigin, true, "reachable"]]);
  row = repositoryOf(await refreshed(one), key);
  assert.deepEqual(lines(row), [[firstOrigin, true, "reachable"], [secondOrigin, false, "absent"]]);
  assert.deepEqual([placementOf(row, second.url).id, placementOf(row, second.url).path], [created.id, "acme/atlas-two-spex"]);
  assert.equal(configOf(oneClone, `remote.${secondFolder}.url`), null);
  assert.ok(existsSync(join(oneClone, "sessions", `${sessionId}.json`)), "the clone's records kept");
  assert.ok(second.script.repositories.some((repository) => repository.id === there.id), "the unchosen repository stands at the stand-in");

  // Members, Share, removing a member and Move naming the second
  // placement act at the second alone, the move leaving the clone's key;
  // a move of the first stands the row under its new group and moves
  // the clone at its next sync (space-62, space-69, space-72, space-78,
  // space-60, space-29).
  const logins = (reply: { members: { login: string }[] }): string[] => reply.members.map((member) => member.login).sort();
  const acts = (host: StandinHost, from: number): string[] => host.script.requests.slice(from)
    .filter((request) => /^\/api\/v1\/host\/repositories\//.test(request.path))
    .map((request) => `${request.method} ${request.path}`);
  const fromFirst = first.script.requests.length;
  assert.deepEqual(logins(await three.client.expectOk("space.members", { repository: key, instance: second.url })), [BOB.login]);
  assert.deepEqual(logins(await three.client.expectOk("space.share", { repository: key, instance: second.url, login: "grace", role: "developer" })), [BOB.login, "grace"]);
  assert.deepEqual(logins(await three.client.expectOk("space.unshare", { repository: key, instance: second.url, login: "grace" })), [BOB.login]);
  assert.deepEqual(await three.client.expectOk("space.repository.move", { repository: key, instance: second.url, groupId: null }), { repository: { id: created.id, fullPath: `${BOB.login}/atlas-two-spex` } });
  assert.deepEqual(acts(first, fromFirst), []);
  assert.ok(existsSync(threeClone), "a move of the second moves no clone");
  assert.equal(placementOf(await three.client.repository(key), second.url).path, `${BOB.login}/atlas-two-spex`);
  const fromSecond = second.script.requests.length;
  assert.deepEqual(await three.client.expectOk("space.repository.move", { repository: key, groupId: "2003" }), { repository: { id: firstId, fullPath: "acme/research/atlas-spex" } });
  assert.deepEqual(acts(second, fromSecond), []);
  const research = (await three.client.expectOk("space.get", {})).instances.find((instance) => instance.origin === firstOrigin)?.groups.find((group) => group.fullPath === "acme/research");
  assert.deepEqual(research?.repositories.map((repository) => repository.key), [key]);
  assert.ok(existsSync(threeClone), "the move moves no clone of its own");
  const movedKey = hostKey(first, "acme/research/atlas-spex");
  mark = three.client.mark();
  await three.client.expectOk("space.sync", { repository: key });
  const moved = await three.client.waitRepository(mark, movedKey, (repository) => repository.sync.phase !== "running", 30_000);
  assert.equal(moved.sync.phase, "done", JSON.stringify(moved.sync));
  assert.deepEqual(moved.placements.map((line) => [line.instance, line.path, line.outcome?.kind]), [[firstOrigin, "acme/research/atlas-spex", "synced"], [secondOrigin, `${BOB.login}/atlas-two-spex`, "synced"]]);
  assert.ok(existsSync(clonePath(three.dataDir, movedKey)) && !existsSync(threeClone), "the clone moved under the first's new group");
});

/** A clone's `spex.lock`, as written, the registry it records for the
 * built-in spec package (environments-11). */
function builtinRegistryOf(home: Device, key: string): string | null {
  try {
    const lock = parseLock(readFileSync(join(clonePath(home.dataDir, key), "spex.lock"), "utf8"));
    const source = lock.packages[BUILTIN_PACKAGE_NAME]?.source as RegistrySourceLock | undefined;
    return source && "registry" in source ? source.registry : null;
  } catch { return null; }
}

/** The registry a clone's lock records for the built-in spec package,
 * once it reads `expected`. */
async function builtinRegistry(home: Device, key: string, expected: string): Promise<string | null> {
  let found = builtinRegistryOf(home, key);
  for (let i = 0; i < 400 && found !== expected; i += 1) {
    await sleep(25);
    found = builtinRegistryOf(home, key);
  }
  return found;
}

test("storage-35, space-99, space-90, space-87, space-29, environments-11, storage-34, storage-5: a local-only project under your own group's folder, holding a placement file that names a spex repository the second lists, shows it as a line not on this device; its Attach takes that placement as its first, moving the clone under the second's folder at the repository's path there with its working folder's pair, its built-in spec package's lock taking the second's registry, and syncs it there", async (t) => {
  const first = await startHost();
  const second = await startHost({ displayName: SECOND_NAME, person: BOB });
  const secondOrigin = canonicalOrigin(second.url);
  const secondFolder = hostFolder(second);
  const home = await startHome("attach-first", { host: first, project: false });
  t.after(() => home.stop());
  let mark = home.client.mark();
  await signIn(home, first);
  await home.client.waitRepository(mark, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);
  await signIn(home, second);

  // A project added on this device is local only, its pairing locking
  // the built-in at the default instance's registry, the first's
  // (environments-11).
  const code = gitFolder("delta");
  const { key: local, clone } = await addFolder(home, code);
  assert.equal(await builtinRegistry(home, local, first.url), first.url);

  // A device that held its records at the second left them there: the
  // repository holding its spex, and its file in this clone, which
  // names that placement (storage-36).
  const there = second.script.addRepository({ group: "acme", name: "delta-spex" });
  git(clone, "push", "-q", there.bare, "spex:spex");
  mkdirSync(join(clone, PLACEMENTS_DIR), { recursive: true, mode: 0o700 });
  writeFileSync(join(clone, PLACEMENTS_DIR, `${secondFolder}.yaml`), encodePlacementFile(secondOrigin, there.id));
  const before = repositoryOf(await refreshed(home), local);
  assert.equal(before.state, "local-only");
  assert.deepEqual(lines(before), [[secondOrigin, false, "absent"]]);

  // Its Attach, with its notice: the reply once the remote is added and
  // the clone moved under the second's folder at the repository's path
  // there, with its pair; then the same operation syncs it there
  // (storage-35, space-99, storage-34).
  mark = home.client.mark();
  assert.deepEqual(await home.client.expectOk("space.attach", { repository: local, instance: second.url, noticed: true }), { accepted: true });
  const key = hostKey(second, "acme/delta-spex");
  const movedClone = clonePath(home.dataDir, key);
  assert.ok(existsSync(join(movedClone, ".git")) && !existsSync(clone), "moved under the second's folder as the reply came");
  assert.equal(Home.load(home.dataDir).keyForFolder(code), key, "its pair follows it");
  const synced = await home.client.waitRepository(mark, key, (repository) => repository.sync.phase !== "running" && repository.sync.phase !== "idle", 30_000);
  assert.equal(synced.sync.phase, "done", JSON.stringify(synced.sync));
  assert.deepEqual([synced.state, synced.instance], ["reachable", second.url]);
  assert.deepEqual(outcomes(synced), [[secondOrigin, true, "synced"]]);
  assert.deepEqual(git(movedClone, "remote").split("\n"), [secondFolder]);
  assert.equal(configOf(movedClone, `remote.${secondFolder}.spexId`), there.id);
  assert.equal(git(there.bare, "rev-parse", "spex"), git(movedClone, "rev-parse", "HEAD"));
  const records = syncRecordsOf(home.dataDir, key);
  assert.equal(records[`sync:${key}:${secondFolder}:noticed`], true);
  assert.equal(typeof (records[`sync:${key}:${secondFolder}:last`] as { at?: unknown } | undefined)?.at, "number");
  assert.deepEqual(Object.keys(syncRecordsOf(home.dataDir, local)), []);
  // Its built-in spec package's lock takes the second's registry
  // (storage-35, environments-11).
  assert.equal(await builtinRegistry(home, key, second.url), second.url);
});
