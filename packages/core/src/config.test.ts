// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

import {
  checkAdapterReadiness,
  composeConfig,
  resolveConfigPath,
  seedConfig,
  templatePath,
  type LoadModule,
} from "./config.js";

// Mirrors the real @sublang/playbook/code/registry entry shape: the
// Playbook Captain shell load contract is id/command/intent/requiredRoleIds/
// validateOptions/createRuntime (+ optional summaryPolicy). It carries no
// idle/final/park state ids — the earlier stub fabricated them, which masked
// the fact that the real module fails a state-id-requiring validator.
function registryEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "code",
    command: "code",
    intent: "software development / SDLC coding workflow",
    requiredRoleIds: ["coder", "reviewer"],
    summaryPolicy: {
      stateCountLabels: {},
      copyPasteGuardNames: [],
      savedCountsLine: () => "",
    },
    validateOptions: () => ({}),
    createRuntime: () => ({}),
    ...overrides,
  };
}

const stubLoader: LoadModule = async (specifier) => {
  if (specifier === "@sublang/playbook/code/registry") {
    return { default: registryEntry() };
  }
  throw new Error(`no module ${specifier}`);
};

function baseConfig(): Record<string, unknown> {
  return parseYaml(readFileSync(templatePath(), "utf8")) as Record<
    string,
    unknown
  >;
}

test("bundled template composes with launcher-equivalent output", async () => {
  const composed = await composeConfig(baseConfig(), stubLoader);
  assert.equal(composed.captainAgent.adapter, "claude");
  assert.deepEqual(
    composed.players.map((player) => player.id),
    ["code-coder", "code-reviewer"],
  );
  assert.deepEqual(composed.initialVisible, ["code-coder", "code-reviewer"]);
  assert.deepEqual(composed.captainOptions.playbooks.code, {
    from: "@sublang/playbook/code/registry",
    options: { committer: "coder" },
  });
  assert.equal(composed.players[0].model, "claude-opus-4-8[1m]");
  assert.equal(composed.playbooks[0].command, "code");
});

async function expectError(
  top: Record<string, unknown>,
  pattern: RegExp,
  loader: LoadModule = stubLoader,
) {
  await assert.rejects(composeConfig(top, loader), (error: Error) => {
    assert.match(error.message, pattern);
    return true;
  });
}

test("profile id colliding with adapter shorthand is rejected", async () => {
  const top = baseConfig();
  (top.profiles as Record<string, unknown>).claude = { adapter: "claude" };
  await expectError(top, /^profiles\.claude collides with the "claude" adapter shorthand$/);
});

test("missing or empty playbooks are rejected", async () => {
  const top = baseConfig();
  delete top.playbooks;
  await expectError(top, /^playbooks must be an object$/);
  top.playbooks = {};
  await expectError(top, /^playbooks must enable at least one playbook$/);
});

test("captain must resolve an adapter", async () => {
  const top = baseConfig();
  delete top.captain;
  await expectError(
    top,
    /^captain must be a profile id, an adapter shorthand, or an agent block$/,
  );
});

test("from must be a module specifier and import failures carry the cause", async () => {
  const top = baseConfig();
  const code = (top.playbooks as Record<string, Record<string, unknown>>).code;
  delete code.from;
  await expectError(top, /^playbooks\.code\.from must be a module specifier$/);
  code.from = "@nope/missing";
  await expectError(
    top,
    /^playbooks\.code\.from "@nope\/missing" failed to import: no module @nope\/missing$/,
  );
});

test("invalid registry entries and id mismatches are rejected", async () => {
  const top = baseConfig();
  await expectError(
    top,
    /exposes no valid registry entry$/,
    async () => ({ default: { id: "code" } }),
  );
  await expectError(
    top,
    /^playbooks\.code key must equal the module manifest id "other"$/,
    async () => ({ default: registryEntry({ id: "other" }) }),
  );
});

test("reserved captain role is rejected in roles and players", async () => {
  const top = baseConfig();
  await expectError(
    top,
    /^playbooks\.code requires local role "captain", which is reserved/,
    async () => ({
      default: registryEntry({ requiredRoleIds: ["captain"] }),
    }),
  );
  const code = (top.playbooks as Record<string, Record<string, unknown>>).code;
  (code.players as Record<string, unknown>).captain = "claude";
  await expectError(
    top,
    /^playbooks\.code\.players\.captain binds local role "captain", which is reserved/,
  );
});

test("player coverage and resolution rules match the launcher", async () => {
  const top = baseConfig();
  const code = (top.playbooks as Record<string, Record<string, unknown>>).code;
  code.players = {};
  await expectError(top, /^playbooks\.code resolves no visible local role$/);
  code.players = { coder: "claude-opus-1m" };
  await expectError(
    top,
    /^playbooks\.code required role "reviewer" has no players entry$/,
  );
  code.players = { coder: "claude-opus-1m", reviewer: 42 };
  await expectError(
    top,
    /^playbooks\.code\.players\.reviewer must be a profile id, an adapter shorthand, or an agent block$/,
  );
  code.players = { coder: "claude-opus-1m", reviewer: { profile: "nope" } };
  await expectError(
    top,
    /^playbooks\.code\.players\.reviewer\.profile must name a profiles entry$/,
  );
});

test("unknown agent fields and adapters are rejected", async () => {
  const top = baseConfig();
  const profiles = top.profiles as Record<string, Record<string, unknown>>;
  profiles["claude-opus"].typo = true;
  await expectError(top, /^Unknown config field captain\.typo$/);
  delete profiles["claude-opus"].typo;
  const code = (top.playbooks as Record<string, Record<string, unknown>>).code;
  (code.players as Record<string, unknown>).reviewer = "mystery";
  await expectError(
    top,
    /^Unknown adapter "mystery" for playbooks\.code\.players\.reviewer\./,
  );
});

test("inline agent blocks extend a profile and drop the profile key", async () => {
  const top = baseConfig();
  (top.profiles as Record<string, unknown>)["codex-gpt"] = {
    adapter: "codex",
    model: "gpt-5.5",
  };
  const code = (top.playbooks as Record<string, Record<string, unknown>>).code;
  (code.players as Record<string, unknown>).reviewer = {
    profile: "codex-gpt",
    model: "gpt-6",
  };
  const composed = await composeConfig(top, stubLoader);
  const reviewer = composed.players.find((p) => p.id === "code-reviewer");
  assert.equal(reviewer?.adapter, "codex");
  assert.equal(reviewer?.model, "gpt-6");
  assert.ok(!("profile" in (reviewer ?? {})));
});

test("command overrides land in captain options and duplicates are rejected", async () => {
  const top = baseConfig();
  const code = (top.playbooks as Record<string, Record<string, unknown>>).code;
  code.command = "build";
  const composed = await composeConfig(top, stubLoader);
  assert.equal(composed.captainOptions.playbooks.code.command, "build");
  assert.equal(composed.playbooks[0].command, "build");

  const dupes = baseConfig();
  (dupes.playbooks as Record<string, unknown>).other = {
    from: "@stub/other",
    players: { coder: "claude-opus-1m", reviewer: "codex-gpt" },
  };
  const loader: LoadModule = async (specifier) =>
    specifier === "@stub/other"
      ? { default: registryEntry({ id: "other", command: "code" }) }
      : stubLoader(specifier);
  await expectError(dupes, /^duplicate effective command "code"$/, loader);
});

test("seedConfig creates once and never overwrites", () => {
  const dir = mkdtempSync(join(tmpdir(), "spex-config-"));
  const path = join(dir, "playbook", "playbook.config.yaml");
  assert.equal(seedConfig(path), true);
  const seeded = readFileSync(path, "utf8");
  assert.match(seeded, /playbooks:/);
  writeFileSync(path, "captain: claude\n");
  assert.equal(seedConfig(path), false);
  assert.equal(readFileSync(path, "utf8"), "captain: claude\n");
});

test("resolveConfigPath honors XDG_CONFIG_HOME", () => {
  assert.equal(
    resolveConfigPath({ XDG_CONFIG_HOME: "/x" }, "/home/u"),
    join("/x", "playbook", "playbook.config.yaml"),
  );
  assert.equal(
    resolveConfigPath({}, "/home/u"),
    join("/home/u", ".config", "playbook", "playbook.config.yaml"),
  );
});

test("adapter readiness mirrors the launcher rules", () => {
  const home = mkdtempSync(join(tmpdir(), "spex-home-"));
  assert.equal(
    checkAdapterReadiness("claude", {}, home).ready,
    false,
  );
  assert.equal(
    checkAdapterReadiness("claude", { ANTHROPIC_API_KEY: "k" }, home).ready,
    true,
  );
  mkdirSync(join(home, ".codex"));
  assert.equal(checkAdapterReadiness("codex", {}, home).ready, true);
  assert.equal(checkAdapterReadiness("gemini", {}, home).ready, null);
});
