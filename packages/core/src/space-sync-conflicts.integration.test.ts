// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The full real sync-conflict/recovery matrix (space-38) owns one file
// budget: two homes syncing one project's spex repository through one
// bare remote, a peer clone advancing it between steps.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { seedHistorySession } from "./testing/demo.js";
import type { RepositoryState } from "./protocol.js";
import { clonePath, createSpaceHarness } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
const { scratch, git, bareRepo, joinRemote, startHome, runTurn, snapshot, peerClone, peerPush, turnRecords } = fixture;
test.after(() => fixture.dispose());

/** A project's own settings: the player each role uses, no model (core-service-2). */
const projectConfig = (side: string): string => `# Settings from ${side}\nplaybooks:\n  code:\n    roles:\n      coder: dev.coder\n`;

test("space-38: a Settings conflict, validation at Apply, a slipped writer, a rejected push and a fast-forward", async (t) => {
  const bare = bareRepo();
  const a = await startHome("a3");
  t.after(() => a.stop());
  const b = await startHome("b3", { project: false });
  t.after(() => b.stop());
  const projectA = await a.client.expectOk("project.register", { path: a.projectDir });
  const key = projectA.id;
  const aClone = clonePath(a.dataDir, key);
  await runTurn(a, key, "Seed");
  await a.client.expectOk("space.remote.set", { repository: key, url: bare });
  assert.equal((await a.client.settle("space.sync", { repository: key })).sync.phase, "done");
  // B adds a folder of the same name, so its spex repository bears the
  // same key, and joins the one A pushed.
  const bFolder = join(mkdtempSync(join(scratch, "b3-")), basename(a.projectDir));
  mkdirSync(bFolder);
  git(bFolder, "init", "-q");
  const projectB = await b.client.expectOk("project.register", { path: bFolder });
  assert.equal(projectB.id, key);
  const bClone = clonePath(b.dataDir, key);
  await b.client.expectOk("space.remote.set", { repository: key, url: bare });
  await joinRemote(b, key);
  // The project's settings changed differently on both sides are one
  // Settings conflict, and no conflict marker or MERGE_HEAD ever appears.
  for (const [dir, side] of [[aClone, "A"], [bClone, "B"]] as const) {
    mkdirSync(join(dir, "config"), { recursive: true });
    writeFileSync(join(dir, "config", "playbook.config.yaml"), projectConfig(side));
  }
  assert.equal((await a.client.settle("space.sync", { repository: key })).sync.phase, "done");
  const settings = await b.client.settle("space.sync", { repository: key });
  assert.equal(settings.sync.phase, "choices", JSON.stringify(settings.sync));
  assert.deepEqual(settings.conflicts.map((c) => c.unit.unit), ["config/playbook.config.yaml"]);
  assert.equal(settings.conflicts[0].unit.kind, "settings");
  assert.equal(settings.conflicts[0].unit.label, "Settings changed");
  assert.ok(settings.conflicts[0].mine.change === "new" && settings.conflicts[0].remote.change === "new");
  const kept = await b.client.settle("space.sync", { repository: key, choices: { "config/playbook.config.yaml": "mine" } });
  assert.equal(kept.sync.phase, "done", JSON.stringify(kept.sync));
  assert.equal(readFileSync(join(bClone, "config", "playbook.config.yaml"), "utf8"), projectConfig("B"));
  assert.equal((await a.client.settle("space.sync", { repository: key })).sync.phase, "done");
  assert.equal(readFileSync(join(aClone, "config", "playbook.config.yaml"), "utf8"), projectConfig("B"));
  for (const dir of [aClone, bClone]) {
    assert.equal(existsSync(join(dir, ".git", "MERGE_HEAD")), false);
    for (const [file, bytes] of snapshot(dir)) assert.ok(!bytes.includes("<<<<<<<"), `conflict marker in ${file}`);
  }
  // A chosen unit refused by validation stops at Apply naming the file,
  // every clone file byte-identical: two open intents from one issue.
  const peer = peerClone(bare);
  const first = randomUUID();
  const second = randomUUID();
  const fromIssue = (id: string, text: string) => JSON.stringify({ format: 1, id, text, createdAt: 1, source: { kind: "issue", ref: "#7" } });
  await peerPush(peer, (dir) => {
    mkdirSync(join(dir, "intents"), { recursive: true });
    writeFileSync(join(dir, "intents", `${first}.json`), fromIssue(first, "Fix issue 7"));
    writeFileSync(join(dir, "intents", `${second}.json`), fromIssue(second, "Fix issue 7 again"));
  });
  const before = snapshot(bClone);
  const refused = await b.client.settle("space.sync", { repository: key });
  assert.ok(refused.sync.phase === "stopped" && refused.sync.step === "apply" && refused.sync.cause === "validation", JSON.stringify(refused.sync));
  assert.ok(refused.sync.phase === "stopped" && /duplicate open source #7/.test(refused.sync.message) && refused.sync.retry, JSON.stringify(refused.sync));
  assert.ok(refused.sync.phase === "stopped" && (refused.sync.message.includes(`${first}.json`) || refused.sync.message.includes(`${second}.json`)), "the message names the file");
  const after = snapshot(bClone);
  assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort());
  for (const [file, bytes] of before) assert.deepEqual(after.get(file), bytes, `${file} changed`);
  assert.equal(existsSync(join(bClone, ".spex-apply.json")), false);
  await peerPush(peer, (dir) => {
    writeFileSync(join(dir, "intents", `${second}.json`), JSON.stringify({ ...JSON.parse(fromIssue(second, "Fix issue 7 again")), closed: { as: "dropped", at: 2 } }));
  });
  assert.equal((await b.client.settle("space.sync", { repository: key })).sync.phase, "done");
  assert.equal((await a.client.settle("space.sync", { repository: key })).sync.phase, "done");
  // A records file appended between Save and Apply restarts once from Save; a second append stops it.
  const bSession = await seedHistorySession(join(bClone, "sessions"), bFolder, turnRecords("B's session", 1));
  await b.client.expectOk("project.register", { path: bFolder });
  await runTurn(a, key, "Something incoming for B");
  assert.equal((await a.client.settle("space.sync", { repository: key })).sync.phase, "done");
  let slips = 1;
  let applies = 0;
  b.hooks.beforeStep = async ({ step, repository }) => {
    if (step !== "apply" || repository !== key) return;
    applies += 1;
    if (slips > 0) { slips -= 1; await seedHistorySession(join(bClone, "sessions"), bFolder, turnRecords(`slip ${applies}`, applies + 1), bSession); }
  };
  const restarted = await b.client.settle("space.sync", { repository: key });
  assert.equal(restarted.sync.phase, "done", JSON.stringify(restarted.sync));
  assert.equal(applies, 2, "one restart from Save");
  assert.match(git(bClone, "show", `HEAD:sessions/${bSession}.records.jsonl`), /slip 1/);
  await runTurn(a, key, "More incoming for B");
  assert.equal((await a.client.settle("space.sync", { repository: key })).sync.phase, "done");
  slips = 2;
  applies = 0;
  const twice = await b.client.settle("space.sync", { repository: key });
  assert.ok(twice.sync.phase === "stopped" && twice.sync.step === "apply" && twice.sync.cause === "writer", JSON.stringify(twice.sync));
  b.hooks.beforeStep = undefined;
  assert.equal((await b.client.settle("space.sync", { repository: key })).sync.phase, "done");
  // A push rejected because the peer advanced after the check re-checks once; advanced again, it stops.
  let pushes = 0;
  let pushesToReject = 1;
  let notes = 0;
  b.hooks.beforeStep = async ({ step, repository }) => {
    if (step !== "push" || repository !== key) return;
    pushes += 1;
    if (pushesToReject > 0) { pushesToReject -= 1; notes += 1; await peerPush(peer, (dir) => writeFileSync(join(dir, "notes.txt"), `note ${notes}\n`)); }
  };
  await b.client.expectOk("intent.queue", { projectId: key, text: "B queues work" });
  const rechecked = await b.client.settle("space.sync", { repository: key });
  assert.equal(rechecked.sync.phase, "done", JSON.stringify(rechecked.sync));
  assert.equal(pushes, 2);
  assert.equal(readFileSync(join(bClone, "notes.txt"), "utf8"), "note 1\n");
  assert.equal(git(bare, "rev-parse", "spex"), git(bClone, "rev-parse", "spex"));
  pushes = 0;
  pushesToReject = 2;
  await b.client.expectOk("intent.queue", { projectId: key, text: "B queues more" });
  const changedAgain = await b.client.settle("space.sync", { repository: key });
  assert.ok(changedAgain.sync.phase === "stopped" && changedAgain.sync.step === "push" && changedAgain.sync.cause === "rejected", JSON.stringify(changedAgain.sync));
  assert.ok(changedAgain.sync.phase === "stopped" && /changed again/.test(changedAgain.sync.message));
  assert.ok((changedAgain.branch?.ahead ?? 0) >= 1, JSON.stringify(changedAgain.branch));
  assert.equal(git(bClone, "rev-list", "--count", "origin/spex..spex"), String(changedAgain.branch?.ahead));
  b.hooks.beforeStep = undefined;
  assert.equal((await b.client.settle("space.sync", { repository: key })).sync.phase, "done");
  // A fast-forward: spex equals the host's with no merge commit, hints cleared, private modes under umask 022.
  assert.equal((await a.client.settle("space.sync", { repository: key })).sync.phase, "done");
  const ffSession = await runTurn(a, key, "Fast forward me");
  assert.equal((await a.client.settle("space.sync", { repository: key })).sync.phase, "done");
  writeFileSync(join(bClone, "sessions", `${ffSession}.hints.json`), "{}");
  const previousUmask = process.umask(0o022);
  let forwarded: RepositoryState;
  try { forwarded = await b.client.settle("space.sync", { repository: key }); } finally { process.umask(previousUmask); }
  assert.equal(forwarded.sync.phase, "done", JSON.stringify(forwarded.sync));
  assert.equal(git(bClone, "rev-parse", "spex"), git(bClone, "rev-parse", "origin/spex"));
  assert.equal(git(bClone, "log", "-1", "--format=%P").split(" ").length, 1, "no merge commit");
  assert.equal(existsSync(join(bClone, "sessions", `${ffSession}.hints.json`)), false);
  assert.equal(statSync(join(bClone, "sessions")).mode & 0o777, 0o700);
  for (const entry of readdirSync(join(bClone, "sessions"))) {
    const mode = statSync(join(bClone, "sessions", entry)).mode & 0o777;
    assert.ok((mode & 0o077) === 0, `${entry} is ${mode.toString(8)}`);
  }
  assert.ok((await b.client.expectOk("session.list", {})).some((s) => s.id === ffSession && s.title === "Fast forward me"));
});
