// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import { parse, stringify } from "yaml";
import type { ConfigEditOp } from "./config-edit.js";
import { scratchDir } from "./testing/scratch.js";

// Exercise Spex's side of the capable launcher contract with either dependency
// generation installed. Replace only the external capability queries and the
// launcher's projection receiver. The editing and projection code run as shipped.
const claudeCapability = 'export const isUltracodeSupported = adapter => adapter === "claude";';
const launcher: Record<string, string> = {
  "@sublang/cligent": `${claudeCapability}
    export const isSubagentModelSupported = adapter => adapter === "claude" || adapter === "codex";`,
  "@sublang/playbook/playbook-captain": claudeCapability,
  "@sublang/playbook/session-store": "export const validateCaptainSessionExecutionProjection = structuredClone;",
};
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    const actual = nextResolve(specifier, context);
    if (!Object.hasOwn(launcher, specifier)) return actual;
    const source = `export * from ${JSON.stringify(actual.url)};\n${launcher[specifier]}`;
    return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(source)}` };
  },
});
const { composeConfig } = await import("./config.js");
const { editConfigFile } = await import("./config-edit.js");
const { parseCommand } = await import("./protocol.js");
const { executionConfig } = await import("./session.js");
hooks.deregister();

const modules = {
  repository: "me/me-spex",
  find: (id: string) => ({ module: `@sublang/playbook/${id}/registry`, builtin: true }),
};

function configFile() {
  const path = join(scratchDir("spex-agent-tuning-"), "playbook.config.yaml");
  writeFileSync(path, stringify({
    captain: { adapter: "claude" },
    players: { writer: { adapter: "claude" }, reader: { adapter: "codex" } },
    playbooks: { review: { roles: { coder: "writer", reviewer: "reader" } } },
  }));
  return path;
}

async function edit(path: string, op: ConfigEditOp) {
  const parsed = parseCommand({ type: "config.edit", id: "edit", op });
  assert.ok(parsed.ok && parsed.command.type === "config.edit");
  const result = await editConfigFile(path, parsed.command.op as ConfigEditOp, undefined, { modules });
  assert.ok(result.ok, result.error ?? "edit refused");
}

function readConfig(path: string) {
  return composeConfig(parse(readFileSync(path, "utf8")), undefined, path, { modules });
}

test("Claude Ultracode values reach the launcher from edits, role overrides and session settings", async () => {
  const path = configFile();
  await edit(path, { kind: "captain.set", patch: { effort: "high", ultracode: false } });
  await edit(path, { kind: "player.set", playerId: "writer", patch: { ultracode: true } });
  const inherited = executionConfig(await readConfig(path), "/work");
  assert.equal(inherited.captain.ultracode, false);
  assert.deepEqual(inherited.captain.effort, { kind: "value", value: "high" });
  assert.equal(inherited.players.find(({ id }) => id === "writer")?.ultracode, true);
  assert.equal(inherited.catalog.review.roles.coder.ultracode, true);

  await edit(path, { kind: "playbook.role.bind", playbookId: "review", role: "coder", playerId: "writer", ultracode: false });
  const composed = await readConfig(path);
  assert.equal(executionConfig(composed, "/work").catalog.review.roles.coder.ultracode, false);
  const change = parseCommand({ type: "session.agent.set", id: "tune", sessionId: "session", agentId: "writer", ultracode: true });
  assert.ok(change.ok && change.command.type === "session.agent.set");
  assert.equal(change.command.ultracode, true);
  const tuned = executionConfig(composed, "/work", undefined, { [change.command.agentId]: { ultracode: change.command.ultracode } });
  assert.equal(tuned.catalog.review.roles.coder.ultracode, true);
  assert.equal(executionConfig(composed, "/work").catalog.review.roles.coder.ultracode, false);
});

test("Codex leaves delegation absent, inherits for a child effort, and forwards a named child", async () => {
  const path = configFile();
  const unconfigured = executionConfig(await readConfig(path), "/work");
  const reader = unconfigured.players.find(({ id }) => id === "reader");
  assert.ok(reader);
  assert.ok(!Object.hasOwn(reader, "subagentModel"));
  assert.ok(!Object.hasOwn(unconfigured.catalog.review.roles.reviewer, "subagentModel"));

  await edit(path, { kind: "player.set", playerId: "reader", patch: { subagentEffort: "high" } });
  const effort = executionConfig(await readConfig(path), "/work");
  assert.equal(effort.players.find(({ id }) => id === "reader")?.subagentModel, "inherit");
  assert.equal(effort.catalog.review.roles.reviewer.subagentModel, "inherit");
  assert.equal(effort.catalog.review.roles.reviewer.subagentEffort, "high");

  await edit(path, { kind: "player.set", playerId: "reader", patch: { subagentModel: "gpt-6.1-sol" } });
  const pinned = executionConfig(await readConfig(path), "/work");
  assert.equal(pinned.players.find(({ id }) => id === "reader")?.subagentModel, "gpt-6.1-sol");
  assert.equal(pinned.catalog.review.roles.reviewer.subagentModel, "gpt-6.1-sol");
  assert.equal(pinned.catalog.review.roles.reviewer.subagentEffort, "high");
});
