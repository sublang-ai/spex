// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalOrigin } from "./instance.js";
import type { StandinHost } from "./testing/standin-host.js";
import { bareOf, clonePath, createSpaceHarness, hostFolder, hostKey, placementOf, repositoryOf } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
const { startHost, startHome, signIn, addFolder, gitFolder, git, attachByHand, peerClone, peerPush, holdingGit } = fixture;
test.after(() => fixture.dispose());

function barrier() {
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  return { waiting, release };
}

/** One real clone held at two independent stand-ins, already synced. */
async function placed(name: string, match: (first: StandinHost, second: StandinHost, clone: string) => string, options: { after?: boolean; skipFirst?: boolean } = {}) {
  const first = await startHost();
  const second = await startHost({ person: { id: "1002", login: "bob", displayName: "Bob" } });
  const dataDir = mkdtempSync(join(fixture.scratch, `${name}-`));
  const key = hostKey(first, "acme/atlas-spex");
  const clone = clonePath(dataDir, key);
  const shim = holdingGit(match(first, second, clone), options);
  const home = await startHome(name, { host: first, dataDir, project: false, env: { PATH: shim.path } });
  let mark = home.client.mark();
  await signIn(home, first);
  await home.client.waitRepository(mark, "ada/ada-spex", (row) => row.sync.phase === "done", 30_000);
  mark = home.client.mark();
  await signIn(home, second);
  // Sign-in returns before own-group setup finishes. Drain its second
  // placement before atlas exists, so a later setup publication cannot
  // consume atlas's branch-count barrier. Its notice may remain owed.
  await home.client.waitSpace(mark, (state) => {
    const own = repositoryOf(state, "ada/ada-spex");
    return state.instances.find((instance) => instance.origin === canonicalOrigin(second.url))?.read.phase === "idle"
      && own.sync.phase !== "running"
      && own.placements.some((line) => line.instance === canonicalOrigin(second.url) && line.attached);
  }, 30_000);
  const { key: local } = await addFolder(home, gitFolder("atlas"));
  mark = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: first.url, groupId: "2002", name: "atlas" } });
  await home.client.waitRepository(mark, key, (row) => row.sync.phase === "done", 30_000);
  attachByHand(home, key, second);
  const synced = await home.client.settle("space.sync", { repository: key }, 30_000);
  assert.equal(synced.sync.phase, "done", JSON.stringify(synced.sync));
  const peer = peerClone(bareOf(first, key));
  await peerPush(peer, (dir) => { writeFileSync(join(dir, "from-first.md"), "from the first\n"); });
  return { first, second, home, key, clone, shim };
}

test("space-105: a read held between placement lines cannot pair a completed Check with the first line's earlier lists", async (t) => {
  const { first, home, key, shim } = await placed("coherent-ending", (_first, _second, clone) => `${clone} rev-list --left-right --count`, { skipFirst: true });
  const entered = barrier();
  const resume = barrier();
  t.after(() => { resume.release(); shim.release(); return home.stop(); });
  home.hooks.beforeStep = async (event) => {
    if (event.repository === key && event.op === "check" && event.step === "check" && event.placement === canonicalOrigin(first.url)) {
      entered.release();
      await resume.waiting;
    }
  };
  const mark = home.client.mark();
  await home.client.expectOk("space.fetch", { repository: key });
  await entered.waiting;
  shim.hold();
  const reading = home.client.expectOk("space.get", {});
  await shim.held();
  resume.release();
  await home.client.waitRepository(mark, key, (row) => row.sync.phase === "idle" && placementOf(row, first.url).incoming.some((unit) => unit.unit === "from-first.md"), 30_000);
  shim.release();
  const row = repositoryOf(await reading, key);
  const incoming = placementOf(row, first.url).incoming.map((unit) => unit.unit);
  assert.ok(row.sync.phase !== "idle" || incoming.includes("from-first.md"), JSON.stringify({ sync: row.sync, incoming }));
});

test("space-105: an older recomputing read cannot replace a completed Check's plan", async (t) => {
  const { first, home, key, shim } = await placed("coherent-plan", (first, _second, clone) => `${clone} rev-parse -q --verify refs/remotes/${hostFolder(first)}/spex^{commit}`, { after: true });
  t.after(() => { shim.release(); return home.stop(); });
  shim.hold();
  const reading = home.client.expectOk("space.get", {});
  await shim.held();
  const checked = await home.client.settle("space.fetch", { repository: key }, 30_000);
  assert.deepEqual(placementOf(checked, first.url).incoming.map((unit) => unit.unit), ["from-first.md"]);
  shim.release();
  await reading;
  // Diff consumes the retained plan without another recomputing get,
  // so a fresh read cannot hide an obsolete read overwriting that plan.
  const diff = await home.client.expectOk("space.diff", { repository: key, unit: "from-first.md", path: "from-first.md", side: "remote", placement: first.url });
  assert.match(diff.patch, /^\+from the first$/m);
});

test("space-105: branch counts and incoming units share captured commits when a tracking ref moves during a read", async (t) => {
  const { first, home, key, clone, shim } = await placed("coherent-refs", (first, _second, clone) => `${clone} rev-parse -q --verify refs/remotes/${hostFolder(first)}/spex^{commit}`, { after: true });
  t.after(() => { shim.release(); return home.stop(); });
  const checked = await home.client.settle("space.fetch", { repository: key }, 30_000);
  assert.deepEqual(placementOf(checked, first.url).incoming.map((unit) => unit.unit), ["from-first.md"]);
  const ref = `refs/remotes/${hostFolder(first)}/spex`;
  const before = git(clone, "rev-parse", ref);
  const head = git(clone, "rev-parse", "HEAD");
  shim.hold();
  const reading = home.client.expectOk("space.get", {});
  await shim.held();
  git(clone, "update-ref", ref, head, before);
  shim.release();
  const row = repositoryOf(await reading, key);
  const line = placementOf(row, first.url);
  const incoming = line.incoming.map((unit) => unit.unit);
  assert.deepEqual([line.branch?.behind, incoming], incoming.includes("from-first.md") ? [1, ["from-first.md"]] : [0, []]);
});

test("space-105: an older idle read cannot replace a newer idle read's completed plan", async (t) => {
  const { first, home, key, clone, shim } = await placed("coherent-idle-plan", (first, _second, clone) => `${clone} rev-parse -q --verify refs/remotes/${hostFolder(first)}/spex^{commit}`, { after: true });
  t.after(() => { shim.release(); return home.stop(); });
  shim.hold();
  const older = home.client.expectOk("space.get", {});
  await shim.held();
  // Only the fixture's Git advances this clone's tracking ref; there is
  // no core operation whose boundary could invalidate the older read.
  const ref = `refs/remotes/${hostFolder(first)}/spex`;
  git(clone, "fetch", "-q", "--no-tags", bareOf(first, key), `+refs/heads/spex:${ref}`);
  const newer = await home.client.repository(key);
  assert.deepEqual(placementOf(newer, first.url).incoming.map((unit) => unit.unit), ["from-first.md"]);
  shim.release();
  await older;
  const diff = await home.client.expectOk("space.diff", { repository: key, unit: "from-first.md", path: "from-first.md", side: "remote", placement: first.url });
  assert.match(diff.patch, /^\+from the first$/m);
});
