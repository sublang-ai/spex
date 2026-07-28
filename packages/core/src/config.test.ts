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
    // Fail-closed like the real registry: only CODE's own option
    // keys pass, so the compose-time cwd probe reports false.
    validateOptions: (value: unknown) => {
      const slice = (value ?? {}) as Record<string, unknown>;
      for (const key of Object.keys(slice)) {
        if (key !== "committer") throw new Error(`unknown option "${key}"`);
      }
      return slice;
    },
    createRuntime: () => ({}),
    ...overrides,
  };
}

function discussEntry(overrides: Record<string, unknown> = {}) {
  return registryEntry({
    id: "discuss",
    command: "discuss",
    intent: "design discussion: two agents converge on records",
    requiredRoleIds: ["host", "participant"],
    ...overrides,
  });
}

const stubLoader: LoadModule = async (specifier) => {
  if (specifier === "@sublang/playbook/code/registry") {
    return { default: registryEntry() };
  }
  if (specifier === "@sublang/playbook/discuss/registry") {
    return { default: discussEntry() };
  }
  throw new Error(`no module ${specifier}`);
};

function baseConfig(): Record<string, unknown> {
  return parseYaml(readFileSync(templatePath(), "utf8")) as Record<
    string,
    unknown
  >;
}

function codeBlock(top: Record<string, unknown>): Record<string, unknown> {
  return (top.playbooks as Record<string, Record<string, unknown>>).code;
}

function codePlayers(top: Record<string, unknown>): Record<string, unknown> {
  return codeBlock(top).players as Record<string, unknown>;
}

test("bundled template composes with launcher-equivalent output", async () => {
  const composed = await composeConfig(baseConfig(), stubLoader);
  // The seeded lineup is fully-inline single-vendor Claude (DR-019).
  assert.deepEqual(composed.captainAgent, {
    adapter: "claude",
    model: "claude-opus-4-8",
    effort: "high",
    permissions: { mode: "auto" },
  });
  assert.equal(composed.captainOptions.captainAdapter, "claude");
  assert.deepEqual(
    composed.players.map((player) => player.id),
    ["code-coder", "code-reviewer", "discuss-host", "discuss-participant"],
  );
  assert.deepEqual(composed.initialVisible, [
    "code-coder",
    "code-reviewer",
    "discuss-host",
    "discuss-participant",
  ]);
  assert.deepEqual(composed.captainOptions.playbooks.code, {
    from: "@sublang/playbook/code/registry",
    options: { committer: "coder" },
  });
  assert.equal(composed.players[0].model, "claude-opus-4-8[1m]");
  assert.equal(composed.playbooks[0].command, "code");
});

test("a codex captain composes and stamps captainAdapter", async () => {
  // The Captain shell picks provider-level vs prompt-level control-call
  // restriction from this field (DR-019); a Codex captain without it
  // fail-closes to an empty allowlist and fails every turn.
  const top = baseConfig();
  top.captain = { adapter: "codex", model: "gpt-5.5" };
  const composed = await composeConfig(top, stubLoader);
  assert.equal(composed.captainAgent.adapter, "codex");
  assert.equal(composed.captainAgent.model, "gpt-5.5");
  assert.equal(composed.captainOptions.captainAdapter, "codex");
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

test("a top-level profiles map is retired and rejected", async () => {
  const top = baseConfig();
  top.profiles = { "claude-opus": { adapter: "claude" } };
  await expectError(
    top,
    /^profiles is retired \(playbook 3\.0\): agents carry their settings inline$/,
  );
});

test("the retired profile key is rejected on captain and player blocks", async () => {
  const top = baseConfig();
  top.captain = { profile: "claude-opus" };
  await expectError(
    top,
    /^captain\.profile is retired: agents carry their own adapter, model, effort, and permissions$/,
  );

  const withPlayer = baseConfig();
  codePlayers(withPlayer).reviewer = { profile: "codex-gpt", model: "gpt-6" };
  await expectError(
    withPlayer,
    /^playbooks\.code\.players\.reviewer\.profile is retired: agents carry their own adapter, model, effort, and permissions$/,
  );
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
    /^captain must be an adapter shorthand or an agent block$/,
  );
});

test("from must be a module specifier and import failures carry the cause", async () => {
  const top = baseConfig();
  const code = codeBlock(top);
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
  codePlayers(top).captain = "claude";
  await expectError(
    top,
    /^playbooks\.code\.players\.captain binds local role "captain", which is reserved/,
  );
});

test("player coverage and resolution rules match the launcher", async () => {
  const top = baseConfig();
  const code = codeBlock(top);
  code.players = {};
  await expectError(top, /^playbooks\.code resolves no visible local role$/);
  code.players = { coder: { adapter: "claude" } };
  await expectError(
    top,
    /^playbooks\.code required role "reviewer" has no players entry$/,
  );
  code.players = { coder: { adapter: "claude" }, reviewer: 42 };
  await expectError(
    top,
    /^playbooks\.code\.players\.reviewer must be an adapter shorthand or an agent block$/,
  );
});

test("scalar shorthands still compose as bare-adapter blocks", async () => {
  const top = baseConfig();
  codePlayers(top).reviewer = "claude";
  const composed = await composeConfig(top, stubLoader);
  const reviewer = composed.players.find((p) => p.id === "code-reviewer");
  assert.deepEqual(reviewer, { id: "code-reviewer", adapter: "claude" });
});

test("unknown agent fields and adapters are rejected; kimi is known", async () => {
  const top = baseConfig();
  (top.captain as Record<string, unknown>).typo = true;
  await expectError(top, /^Unknown config field captain\.typo$/);
  delete (top.captain as Record<string, unknown>).typo;

  codePlayers(top).reviewer = "mystery";
  // The valid set is cligent's own (DR-019) and now includes kimi.
  await expectError(
    top,
    /^Unknown adapter "mystery" for playbooks\.code\.players\.reviewer\. Valid adapters: claude, codex, gemini, kimi, opencode$/,
  );

  codePlayers(top).reviewer = { adapter: "kimi" };
  const composed = await composeConfig(top, stubLoader);
  const reviewer = composed.players.find((p) => p.id === "code-reviewer");
  assert.equal(reviewer?.adapter, "kimi");
});

test("effort vocabularies are adapter-scoped", async () => {
  // Kimi accepts only off/on.
  const top = baseConfig();
  codePlayers(top).reviewer = { adapter: "kimi", effort: "off" };
  let composed = await composeConfig(top, stubLoader);
  assert.equal(
    composed.players.find((p) => p.id === "code-reviewer")?.effort,
    "off",
  );
  codePlayers(top).reviewer = { adapter: "kimi", effort: "on" };
  composed = await composeConfig(top, stubLoader);
  assert.equal(
    composed.players.find((p) => p.id === "code-reviewer")?.effort,
    "on",
  );
  codePlayers(top).reviewer = { adapter: "kimi", effort: "minimal" };
  await expectError(
    top,
    /^playbooks\.code\.players\.reviewer\.effort "minimal" is not supported by the "kimi" adapter \(valid: off, on\)$/,
  );

  // Claude adds ultracode; Codex adds ultra.
  const claudeTop = baseConfig();
  (claudeTop.captain as Record<string, unknown>).effort = "ultracode";
  composed = await composeConfig(claudeTop, stubLoader);
  assert.equal(composed.captainAgent.effort, "ultracode");

  const codexTop = baseConfig();
  codePlayers(codexTop).reviewer = { adapter: "codex", effort: "ultra" };
  composed = await composeConfig(codexTop, stubLoader);
  assert.equal(
    composed.players.find((p) => p.id === "code-reviewer")?.effort,
    "ultra",
  );

  // A value outside the adapter's vocabulary names the adapter and
  // its valid set.
  const bogusTop = baseConfig();
  (bogusTop.captain as Record<string, unknown>).effort = "bogus";
  await expectError(
    bogusTop,
    /^captain\.effort "bogus" is not supported by the "claude" adapter \(valid: minimal, low, medium, high, xhigh, max, ultracode\)$/,
  );
});

test("legacy reasoningEffort composes as effort; both keys are invalid", async () => {
  const top = baseConfig();
  const coder = codePlayers(top).coder as Record<string, unknown>;
  // The template writes canonical `effort`; swap in the legacy alias.
  assert.equal(coder.effort, "xhigh");
  delete coder.effort;
  coder.reasoningEffort = "xhigh";
  const composed = await composeConfig(top, stubLoader);
  const player = composed.players.find((p) => p.id === "code-coder");
  assert.equal(player?.effort, "xhigh");
  assert.ok(!("reasoningEffort" in (player ?? {})));

  coder.effort = "high";
  await expectError(
    top,
    /must not set both effort and its legacy alias reasoningEffort/,
  );
});

test("cwd acceptance probe marks entries that take a cwd option", async () => {
  const cwdLoader: LoadModule = async (specifier) => {
    if (specifier === "@sublang/playbook/discuss/registry") {
      return { default: discussEntry() };
    }
    if (specifier === "@sublang/playbook/code/registry") {
      return {
        default: registryEntry({
          validateOptions: (value: unknown) => {
            const slice = (value ?? {}) as Record<string, unknown>;
            for (const key of Object.keys(slice)) {
              if (key !== "cwd" && key !== "committer") {
                throw new Error(`unknown option "${key}"`);
              }
            }
            return slice;
          },
        }),
      };
    }
    throw new Error(`no module ${specifier}`);
  };
  const accepting = await composeConfig(baseConfig(), cwdLoader);
  assert.equal(accepting.playbooks[0]?.acceptsCwdOption, true);

  // The real CODE registry rejects unknown options, so the probe
  // reports false and sessions must not inject.
  const rejecting = await composeConfig(baseConfig(), stubLoader);
  assert.equal(rejecting.playbooks[0]?.acceptsCwdOption, false);

  // A config-set cwd wins: no injection even for accepting entries.
  const top = baseConfig();
  codeBlock(top).cwd = "/x";
  const preset = await composeConfig(top, cwdLoader);
  assert.equal(preset.playbooks[0]?.acceptsCwdOption, false);
  assert.equal(
    (preset.captainOptions.playbooks.code?.options as { cwd?: string }).cwd,
    "/x",
  );
});

test("command overrides land in captain options and duplicates are rejected", async () => {
  const top = baseConfig();
  codeBlock(top).command = "build";
  const composed = await composeConfig(top, stubLoader);
  assert.equal(composed.captainOptions.playbooks.code.command, "build");
  assert.equal(composed.playbooks[0].command, "build");

  const dupes = baseConfig();
  (dupes.playbooks as Record<string, unknown>).other = {
    from: "@stub/other",
    players: {
      coder: { adapter: "claude" },
      reviewer: { adapter: "codex" },
    },
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
  assert.equal(checkAdapterReadiness("kimi", {}, home).ready, null);
});
