// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { composeConfig, templatePath } from "./config.js";
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { SessionManager, CoreError, type RecordEnvelope } from "./session.js";
import { Store } from "./store.js";
import { fakeAdapterImports } from "./testing/fake-adapter.js";
import { createScriptedCaptain } from "./testing/scripted-captain.js";

function registryEntry() {
  return {
    id: "code",
    command: "code",
    intent: "coding",
    requiredRoleIds: ["coder", "reviewer"],
    idleStateId: "ready",
    finalStateId: "done",
    parkStateIds: ["failed", "awaitBossReply"],
    validateOptions: () => ({}),
    createRuntime: () => ({}),
  };
}

async function setup(records: RecordEnvelope[]) {
  const top = parseYaml(readFileSync(templatePath(), "utf8"));
  const composed = await composeConfig(top, async (specifier) => ({
    default: specifier.includes("discuss")
      ? {
          ...registryEntry(),
          id: "discuss",
          command: "discuss",
          requiredRoleIds: ["host", "participant"],
        }
      : registryEntry(),
  }));
  const store = new Store(join(mkdtempSync(join(tmpdir(), "spex-sess-")), "s.db"));
  const { imports, stats } = fakeAdapterImports({
    rules: [
      {
        match: "route:",
        response: { result: '{"decision":"chat"}', usage: { totalCostUsd: 0.01 } },
      },
    ],
    fallback: { deltas: ["work ", "done"], result: "work done" },
  });
  const captain = createScriptedCaptain(async (turn, context, session) => {
    await session.emitStatus("◇ /code started");
    await context.callCaptain(`route: ${turn.prompt}`, { visibility: "hidden" });
    await context.callPlayer("code-coder", `do: ${turn.prompt}`);
    await session.emitTelemetry({
      topic: "playbook.fsm.state",
      payload: { to: "ready" },
    });
  });
  const manager = new SessionManager({
    store,
    adapterImports: imports,
    captainFactory: async () => captain,
  });
  manager.onRecord = (envelope) => records.push(envelope);
  const project = store.registerProject("/tmp/proj-a", "proj-a", 1);
  return { manager, store, project, composed, stats };
}

test("end-to-end turn produces ordered persisted records with visibility flags", async () => {
  const records: RecordEnvelope[] = [];
  const { manager, store, project, composed, stats } = await setup(records);

  const info = await manager.createSession(project, composed);
  assert.deepEqual(
    info.players.map((p) => p.id),
    ["code-coder", "code-reviewer", "discuss-host", "discuss-participant"],
  );
  assert.deepEqual(info.initialVisible, [
    "code-coder",
    "code-reviewer",
    "discuss-host",
    "discuss-participant",
  ]);

  manager.submitTurn(info.id, "fix the bug");
  assert.throws(
    () => manager.submitTurn(info.id, "second"),
    (error: CoreError) => error.code === "busy",
  );

  // Wait for the turn to complete via the turn_finished record.
  await waitFor(() => records.some((r) => r.record.type === "turn_finished"));

  const types = records.map((r) => r.record.type);
  assert.equal(types[0], "turn_started");
  assert.ok(types.includes("captain_status"));
  assert.ok(types.includes("captain_prompt"));
  assert.ok(types.includes("player_prompt"));
  assert.ok(types.includes("player_finished"));
  assert.ok(types.includes("captain_telemetry"));
  assert.equal(types[types.length - 1], "turn_finished");

  const hiddenTypes = records.filter((r) => r.hidden).map((r) => r.record.type);
  assert.deepEqual(
    [...new Set(hiddenTypes)].sort(),
    ["captain_event", "captain_finished", "captain_prompt"],
  );

  const seqs = records.map((r) => r.seq);
  assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b));

  const storedVisible = store.getRecords(info.id);
  const storedAll = store.getRecords(info.id, { includeHidden: true });
  assert.equal(storedAll.length, records.length);
  assert.ok(storedVisible.length < storedAll.length);

  const usage = store.sessionUsage(info.id);
  assert.ok(usage.inputTokens > 0);
  assert.equal(usage.totalCostUsd, 0.01);

  assert.ok(stats.constructed >= 2, "captain and player fakes constructed");
  assert.ok(stats.runs.some((run) => run.prompt.includes("route:")));

  const second = store.registerProject("/tmp/proj-b", "proj-b", 2);
  const other = await manager.createSession(second, composed);
  assert.notEqual(other.id, info.id);
  await assert.rejects(
    manager.createSession(project, composed),
    (error: CoreError) => error.code === "conflict",
  );

  await manager.disposeAll();
  const sessions = manager.listSessions();
  assert.ok(sessions.every((session) => !session.live));
});

async function waitFor(check: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("timeout");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
