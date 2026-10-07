// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { builtinLaunchModules } from "./testing/launch-modules.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSessionStore } from "@sublang/playbook/session-store";
import { executionConfigFromPlan, loadLaunchPlan, openSessionHost } from "@sublang/playbook/session-host";
import { createTmuxPlayRuntime } from "@sublang/cligent/tmux-play";
import { Home } from "./home.js";
import { Store } from "./store.js";
import { selectStorageMerge } from "./storage-git.js";
import { fakeAdapterImports } from "./testing/fake-adapter.js";

/** The test's own Git: no user or system configuration, a fixed identity. */
const gitEnv: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Storage Test", GIT_AUTHOR_EMAIL: "storage@example.test",
  GIT_COMMITTER_NAME: "Storage Test", GIT_COMMITTER_EMAIL: "storage@example.test",
};
const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-C", cwd, ...args], {
  encoding: "utf8", env: gitEnv, stdio: ["ignore", "pipe", "pipe"],
}).trim();

// Seed durable boundaries through Playbook's real repository authority. Production
// uses the public host; this fixture reaches the owning package's write-ahead path.
const { createRepositoryEffectCapabilities, classifyRepositoryReceipt } = await import(
  new URL("./bin/repository-effects.js", import.meta.resolve("@sublang/playbook/session-host")).href
);

test("storage-16: Git selection reconciles an omitted repository receipt before another agent can run", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "spex-git-effects-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, "home");
  const project = join(root, "project");
  mkdirSync(project);
  git(project, "init", "-q", "-b", "main");
  writeFileSync(join(project, "work.txt"), "baseline\n");
  git(project, "add", ".");
  git(project, "commit", "-q", "-m", "baseline");
  // The project's records live in its spex repository's clone, on `spex`.
  const registry = new Store({ dir: home, own: "tester", env: gitEnv });
  let key: string;
  try { key = registry.registerProject(project, "Project").id; } finally { registry.close(); }
  const clone = Home.load(home).clonePath(key);
  const configPath = join(root, "playbook.config.yaml");
  writeFileSync(configPath, `captain:
  adapter: claude
players:
  dev.coder:
    adapter: claude
playbooks:
  code:
    roles:
      coder: dev.coder
`);
  const config = executionConfigFromPlan(await loadLaunchPlan({ userConfigPath: configPath, modules: builtinLaunchModules(configPath) }));
  const { imports } = fakeAdapterImports({ fallback: { result: "Done" } });
  const sessionsDir = join(clone, "sessions");
  const store = createSessionStore({ sessionsDir });
  const host = await openSessionHost({ store, mode: "new", cwd: project, config, adapterImports: imports });
  const id = host.sessionId;
  try { await host.handleBossTurn("Establish the session"); } finally { await host.dispose(); }
  const manifest = join(sessionsDir, `${id}.json`);
  const replay = join(sessionsDir, `${id}.records.jsonl`);
  const commit = (message: string) => { git(clone, "add", "."); git(clone, "commit", "-q", "-m", message); };
  commit("base");
  git(clone, "branch", "other");

  const lease = await store.acquire(id);
  const settled = await lease.read();
  assert.ok(settled?.snapshot);
  const attemptId = randomUUID();
  let checkpoint: any;
  try {
    await lease.beginTurn({ input: "Prepare an effect", attemptId,
      attemptedExecutionProjection: settled.lastAppliedExecutionProjection });
    const pendingRecord = await lease.read();
    assert.ok(pendingRecord);
    let mirror = pendingRecord.effectLedger;
    const capabilities = await createRepositoryEffectCapabilities({ cwd: project, catalog: config.catalog,
      sessionId: id, sessionLease: lease, createWriteAhead: () => ({ snapshot: () => mirror,
        async writeAhead(authority: Parameters<typeof lease.writeEffectLedger>[0], commands: Parameters<typeof lease.writeEffectLedger>[1]) {
          return mirror = await lease.writeEffectLedger(authority, commands);
        },
      }),
    });
    await capabilities.code.effectLedger.writeAhead([{ kind: "start-boundaries", boundaries: [{
      boundaryId: randomUUID(), playbookId: "code", runtimeSessionId: randomUUID(), turnId: 1,
      callId: "coder:checkpoint", roleId: "coder", sourceStateId: "implementing",
      sourceOutcomeSchema: { type: "object" }, dispositions: ["one-descendant-commit"],
      canonicalWorktree: capabilities.code.authority.canonicalWorktree,
      baseline: await capabilities.code.repository.observe(), correctionBudget: { limit: 1, spent: false },
    }] }]);
    checkpoint = await lease.settle({ attemptId, unresolvedEffects: [],
      snapshot: { ...settled.snapshot, effectLedger: mirror } });
    await lease.beginTurn({ input: "Complete the effect", attemptId: randomUUID(),
      attemptedExecutionProjection: checkpoint.lastAppliedExecutionProjection });
  } finally { await lease.release(); }
  const selectedManifest = readFileSync(manifest);
  const selectedReplay = readFileSync(replay);
  commit("retain an incomplete effect boundary");

  git(clone, "checkout", "-q", "other");
  writeFileSync(manifest, selectedManifest);
  writeFileSync(replay, selectedReplay);
  await store.prepare();
  const completion = await store.acquire(id);
  try {
    const pendingRecord = await completion.read();
    assert.equal(pendingRecord?.state, "uncertain");
    assert.ok(pendingRecord?.uncertain);
    const completionId = pendingRecord.uncertain.attemptId;
    let mirror = pendingRecord.effectLedger;
    const capabilities = await createRepositoryEffectCapabilities({ cwd: project, catalog: config.catalog,
      sessionId: id, sessionLease: completion, createWriteAhead: () => ({ snapshot: () => mirror,
        async writeAhead(authority: Parameters<typeof completion.writeEffectLedger>[0], commands: Parameters<typeof completion.writeEffectLedger>[1]) {
          return mirror = await completion.writeEffectLedger(authority, commands);
        },
      }),
    });
    const pending = mirror.boundaries[0];
    writeFileSync(join(project, "work.txt"), "completed once\n");
    git(project, "add", ".");
    git(project, "commit", "-q", "-m", "perform the external action");
    const after = await capabilities.code.repository.observe();
    const physicalReceipt = await classifyRepositoryReceipt(pending.baseline, after, {
      allowedDispositions: pending.dispositions,
    });
    assert.equal(physicalReceipt.classification, "one-descendant-commit");
    await capabilities.code.effectLedger.writeAhead([{ kind: "replace-boundaries", replacements: [{
      expected: pending, next: { ...pending, after, physicalReceipt },
    }] }]);
    await completion.settle({ attemptId: completionId, unresolvedEffects: [],
      snapshot: { ...checkpoint.snapshot, effectLedger: mirror } });
  } finally { await completion.release(); }
  commit("record the completed effect");
  const completedHead = git(project, "rev-parse", "HEAD");

  git(clone, "checkout", "-q", "spex");
  try { git(clone, "merge", "--no-commit", "--no-ff", "other"); } catch { /* explicit selection follows */ }
  await selectStorageMerge(home, key, { [`sessions/${id}`]: "ours" });
  assert.deepEqual(readFileSync(manifest), selectedManifest);
  assert.equal(JSON.parse(readFileSync(manifest, "utf8")).effectLedger.boundaries[0].physicalReceipt, undefined);
  // Playbook 17 restores and reports the interrupted turn rather than
  // repeating it (DR-088): reconciliation recovers the omitted action's
  // receipt before the host starts, and the report calls no agent.
  let receiptAtHostStart: { classification?: string } | undefined;
  const { imports: restoreImports, stats } = fakeAdapterImports({ fallback: { result: "must not run another action" } });
  const restored = await openSessionHost({ store, sessionId: id, mode: "recover", cwd: project, config,
    adapterImports: restoreImports,
    createHostRuntime: async (input: Parameters<typeof createTmuxPlayRuntime>[0]) => {
      receiptAtHostStart = JSON.parse(readFileSync(manifest, "utf8")).effectLedger.boundaries[0].physicalReceipt;
      return createTmuxPlayRuntime(input);
    },
  });
  try { await restored.recover(); } finally { await restored.dispose(); }
  assert.equal(receiptAtHostStart?.classification, "one-descendant-commit", "reconciliation precedes the host");
  assert.equal(stats.runs.length, 0, "restoring runs no agent");
  assert.equal(JSON.parse(readFileSync(manifest, "utf8")).state, "settled");
  const recovered = JSON.parse(readFileSync(manifest, "utf8")).effectLedger.boundaries[0].physicalReceipt;
  assert.equal(recovered.classification, "one-descendant-commit");
  assert.equal(recovered.commitOid, completedHead, "the selected manifest now retains evidence of the omitted action");
  assert.equal(git(project, "rev-parse", "HEAD"), completedHead);
  assert.equal(git(project, "rev-list", "--count", "HEAD"), "2");
  assert.equal(readFileSync(join(project, "work.txt"), "utf8"), "completed once\n");
});
