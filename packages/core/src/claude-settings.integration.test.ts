// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Claude Code's user settings in every run (core-service-150,
// core-service-151, DR-175), on a real core over the fixture adapter,
// which records the environment each run starts with: the `env` of
// `settings.json` reaches the Captain's control calls, which read no
// settings file, as it reaches a player's; a variable the file no
// longer sets leaves the next run; `agent.options` names its
// `ANTHROPIC_MODEL` where the runtime names no default; a stop puts the
// environment back.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentOptions } from "./protocol.js";
import { fakeAdapterImports, type FakeAdapterStats } from "./testing/fake-adapter.js";
import { createSpaceHarness } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
const { scratch, startHome, runTurn, gitFolder } = fixture;

// The runs inherit this process's environment: the names the settings
// set here are cleared for the suite, whatever the machine running it
// exports, and put back after it.
const NAMES = ["ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL"];
const saved = new Map(NAMES.map((name) => [name, process.env[name]]));
for (const name of NAMES) delete process.env[name];
test.after(async () => {
  await fixture.dispose();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("core-service-151, settings-36: Claude's user settings reach the Captain's control calls and every other run, follow the file, and leave at stop", async (t) => {
  const home = mkdtempSync(join(scratch, "claude-settings-home-"));
  mkdirSync(join(home, ".claude"));
  const settings = join(home, ".claude", "settings.json");
  writeFileSync(settings, JSON.stringify({ env: {
    ANTHROPIC_AUTH_TOKEN: "sk-settings",
    ANTHROPIC_BASE_URL: "https://api.deepseek.com/anthropic",
    ANTHROPIC_MODEL: "deepseek-flash",
  } }));
  const stats: FakeAdapterStats = { constructed: 0, runs: [] };
  const { imports } = fakeAdapterImports({
    rules: [{ match: "route:", response: { result: '{"decision":"dispatch"}' } }],
    fallback: { deltas: ["hello ", "world"], result: "hello world" },
  }, stats);
  const core = await startHome("claude-settings", {
    env: { HOME: home },
    extra: {
      home,
      adapterImports: imports,
      // The runtime names no default where the settings set the model.
      discoverAgentModels: async () => ({ status: "available", models: [{ id: "deepseek-flash", name: "deepseek-flash" }] }),
    },
  });
  t.after(() => core.stop());
  const project = (await core.client.expectOk("project.register", { path: gitFolder("claude-settings-work") })).id;

  await runTurn(core, project, "first");
  const first = stats.runs.filter((run) => run.prompt.includes("first"));
  // The Captain's control call routes the turn; a player answers it.
  assert.ok(first.some((run) => run.prompt.startsWith("route:")), "the Captain's control call ran");
  assert.ok(first.some((run) => !run.prompt.startsWith("route:")), "a player ran");
  for (const run of first) {
    assert.equal(run.env.ANTHROPIC_AUTH_TOKEN, "sk-settings", `${run.prompt}: the key`);
    assert.equal(run.env.ANTHROPIC_BASE_URL, "https://api.deepseek.com/anthropic", `${run.prompt}: the base URL`);
    assert.equal(run.env.ANTHROPIC_MODEL, "deepseek-flash", `${run.prompt}: the model`);
  }

  // settings-36: the model a run selects is the default.
  const options = await core.client.expectOk("agent.options", { adapter: "claude" }) as AgentOptions;
  assert.equal(options.discovery.status === "available" ? options.discovery.defaultModel : undefined, "deepseek-flash");

  // The file no longer sets the model: the next run goes without it.
  writeFileSync(settings, JSON.stringify({ env: { ANTHROPIC_AUTH_TOKEN: "sk-settings-two" } }));
  await runTurn(core, project, "second");
  const second = stats.runs.filter((run) => run.prompt.includes("second"));
  assert.ok(second.length > 0);
  for (const run of second) {
    assert.equal(run.env.ANTHROPIC_AUTH_TOKEN, "sk-settings-two", `${run.prompt}: the replaced key`);
    assert.equal(run.env.ANTHROPIC_BASE_URL, undefined, `${run.prompt}: no base URL`);
    assert.equal(run.env.ANTHROPIC_MODEL, undefined, `${run.prompt}: no model`);
  }

  // A stop puts every name back as the process held it.
  await core.stop();
  for (const name of NAMES) assert.equal(process.env[name], undefined, `${name} after stop`);
});
