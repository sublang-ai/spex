// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The full real sync-conflict/recovery matrix owns one file budget.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { seedHistorySession } from "./testing/demo.js";
import type { SpaceState } from "./protocol.js";
import { createSpaceHarness } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
const { scratch, git, bareRepo, joinRemote, startHome, runTurn, snapshot, peerClone, peerPush, turnRecords } = fixture;
test.after(() => fixture.dispose());

test("space-38: playbook directories, validation at Apply, a slipped writer, a rejected push and a fast-forward", async (t) => {
  const bare = bareRepo();
  const a = await startHome("a3");
  t.after(() => a.stop());
  const b = await startHome("b3", { project: false });
  t.after(() => b.stop());
  const projectA = await a.client.expectOk("project.register", { path: a.projectDir });
  await runTurn(a, projectA.id, "Seed");
  await a.client.expectOk("space.init", {});
  await a.client.expectOk("space.remote.set", { url: bare });
  assert.equal((await a.client.settle("space.sync", {})).sync.phase, "done");
  await b.client.expectOk("space.init", { remote: bare });
  await joinRemote(b);
  const checkout = join(scratch, "b3-checkout");
  mkdirSync(checkout);
  git(checkout, "init", "-q");
  await b.client.expectOk("project.rebind", { projectId: projectA.id, path: checkout, aliases: [a.projectDir] });
  // A playbook source changed differently on both sides is one whole-directory conflict.
  for (const [home, text] of [[a, "# Demo from A\n"], [b, "# Demo from B\n"]] as const) {
    mkdirSync(join(home.dataDir, "playbooks", "demo"), { recursive: true });
    writeFileSync(join(home.dataDir, "playbooks", "demo", "demo.md"), text);
  }
  assert.equal((await a.client.settle("space.sync", {})).sync.phase, "done");
  const playbook = await b.client.settle("space.sync", {});
  assert.equal(playbook.sync.phase, "choices", JSON.stringify(playbook.sync));
  assert.deepEqual(playbook.conflicts.map((c) => c.unit.unit), ["playbooks/demo"]);
  assert.equal(playbook.conflicts[0].unit.label, "Playbook demo");
  assert.equal(playbook.conflicts[0].unit.detail, "demo.md");
  const kept = await b.client.settle("space.sync", { choices: { "playbooks/demo": "mine" } });
  assert.equal(kept.sync.phase, "done", JSON.stringify(kept.sync));
  assert.equal(readFileSync(join(b.dataDir, "playbooks", "demo", "demo.md"), "utf8"), "# Demo from B\n");
  assert.equal((await a.client.settle("space.sync", {})).sync.phase, "done");
  assert.equal(readFileSync(join(a.dataDir, "playbooks", "demo", "demo.md"), "utf8"), "# Demo from B\n");
  for (const home of [a, b]) {
    assert.equal(existsSync(join(home.dataDir, ".git", "MERGE_HEAD")), false);
    for (const [file, bytes] of snapshot(home.dataDir)) assert.ok(!bytes.includes("<<<<<<<"), `conflict marker in ${file}`);
  }
  // A chosen unit refused by validation stops at Apply naming the file, files untouched.
  const peer = peerClone(bare);
  const intentId = randomUUID();
  const badLog = `intents/${projectA.id}.jsonl`;
  const act = JSON.stringify({ v: 1, act: "queue", intent: { id: intentId, projectId: projectA.id, text: "twice", rank: "a", createdAt: 1 } });
  await peerPush(peer, (dir) => { mkdirSync(join(dir, "intents"), { recursive: true }); writeFileSync(join(dir, badLog), `${act}\n${act}\n`); });
  const before = snapshot(b.dataDir);
  const refused = await b.client.settle("space.sync", {});
  assert.ok(refused.sync.phase === "stopped" && refused.sync.step === "apply" && refused.sync.cause === "validation", JSON.stringify(refused.sync));
  assert.ok(refused.sync.phase === "stopped" && refused.sync.message.includes(`${projectA.id}.jsonl`) && refused.sync.retry);
  const after = snapshot(b.dataDir);
  assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort());
  for (const [file, bytes] of before) assert.deepEqual(after.get(file), bytes, `${file} changed`);
  assert.equal(existsSync(join(b.dataDir, "local", "space-apply.json")), false);
  await peerPush(peer, (dir) => { writeFileSync(join(dir, badLog), `${act}\n`); });
  assert.equal((await b.client.settle("space.sync", {})).sync.phase, "done");
  assert.equal((await a.client.settle("space.sync", {})).sync.phase, "done");
  // A records file appended between Save and Apply restarts once from Save; a second append stops it.
  const bSession = await seedHistorySession(join(b.dataDir, "sessions"), a.projectDir, turnRecords("B's session", 1));
  await b.client.expectOk("project.register", { path: checkout });
  await runTurn(a, projectA.id, "Something incoming for B");
  assert.equal((await a.client.settle("space.sync", {})).sync.phase, "done");
  let slips = 1;
  let applies = 0;
  b.hooks.beforeStep = async ({ step }) => {
    if (step !== "apply") return;
    applies += 1;
    if (slips > 0) { slips -= 1; await seedHistorySession(join(b.dataDir, "sessions"), a.projectDir, turnRecords(`slip ${applies}`, applies + 1), bSession); }
  };
  const restarted = await b.client.settle("space.sync", {});
  assert.equal(restarted.sync.phase, "done", JSON.stringify(restarted.sync));
  assert.equal(applies, 2, "one restart from Save");
  assert.match(git(b.dataDir, "show", `HEAD:sessions/${bSession}.records.jsonl`), /slip 1/);
  await runTurn(a, projectA.id, "More incoming for B");
  assert.equal((await a.client.settle("space.sync", {})).sync.phase, "done");
  slips = 2;
  applies = 0;
  const twice = await b.client.settle("space.sync", {});
  assert.ok(twice.sync.phase === "stopped" && twice.sync.step === "apply" && twice.sync.cause === "writer", JSON.stringify(twice.sync));
  b.hooks.beforeStep = undefined;
  assert.equal((await b.client.settle("space.sync", {})).sync.phase, "done");
  // A push rejected because the peer advanced after the check re-checks once; advanced again, it stops.
  let pushes = 0;
  let pushesToReject = 1;
  let notes = 0;
  b.hooks.beforeStep = async ({ step }) => {
    if (step !== "push") return;
    pushes += 1;
    if (pushesToReject > 0) { pushesToReject -= 1; notes += 1; await peerPush(peer, (dir) => writeFileSync(join(dir, "notes.txt"), `note ${notes}\n`)); }
  };
  await b.client.expectOk("intent.queue", { projectId: projectA.id, text: "B queues work" });
  const rechecked = await b.client.settle("space.sync", {});
  assert.equal(rechecked.sync.phase, "done", JSON.stringify(rechecked.sync));
  assert.equal(pushes, 2);
  assert.equal(readFileSync(join(b.dataDir, "notes.txt"), "utf8"), "note 1\n");
  assert.equal(git(bare, "rev-parse", "main"), git(b.dataDir, "rev-parse", "main"));
  pushes = 0;
  pushesToReject = 2;
  await b.client.expectOk("intent.queue", { projectId: projectA.id, text: "B queues more" });
  const changedAgain = await b.client.settle("space.sync", {});
  assert.ok(changedAgain.sync.phase === "stopped" && changedAgain.sync.step === "push" && changedAgain.sync.cause === "rejected", JSON.stringify(changedAgain.sync));
  assert.ok(changedAgain.sync.phase === "stopped" && /changed again/.test(changedAgain.sync.message));
  assert.ok((changedAgain.repository?.ahead ?? 0) >= 1, JSON.stringify(changedAgain.repository));
  assert.equal(git(b.dataDir, "rev-list", "--count", "origin/main..main"), String(changedAgain.repository?.ahead));
  b.hooks.beforeStep = undefined;
  assert.equal((await b.client.settle("space.sync", {})).sync.phase, "done");
  // A fast-forward: main equals the remote's with no merge commit, hints cleared, private modes under umask 022.
  assert.equal((await a.client.settle("space.sync", {})).sync.phase, "done");
  const ffSession = await runTurn(a, projectA.id, "Fast forward me");
  assert.equal((await a.client.settle("space.sync", {})).sync.phase, "done");
  writeFileSync(join(b.dataDir, "sessions", `${ffSession}.hints.json`), "{}");
  const previousUmask = process.umask(0o022);
  let forwarded: SpaceState;
  try { forwarded = await b.client.settle("space.sync", {}); } finally { process.umask(previousUmask); }
  assert.equal(forwarded.sync.phase, "done", JSON.stringify(forwarded.sync));
  assert.equal(git(b.dataDir, "rev-parse", "main"), git(b.dataDir, "rev-parse", "origin/main"));
  assert.equal(git(b.dataDir, "log", "-1", "--format=%P").split(" ").length, 1, "no merge commit");
  assert.equal(existsSync(join(b.dataDir, "sessions", `${ffSession}.hints.json`)), false);
  assert.equal(statSync(join(b.dataDir, "sessions")).mode & 0o777, 0o700);
  for (const entry of readdirSync(join(b.dataDir, "sessions"))) {
    const mode = statSync(join(b.dataDir, "sessions", entry)).mode & 0o777;
    assert.ok((mode & 0o077) === 0, `${entry} is ${mode.toString(8)}`);
  }
  assert.ok((await b.client.expectOk("session.list", {})).some((s) => s.id === ffSession && s.title === "Fast forward me"));
});
