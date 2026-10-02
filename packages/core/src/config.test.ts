// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

import {
  AGENT_RUNTIME_TARGETS,
  classifyRuntime,
  type AgentExecutable,
} from "@sublang/cligent";

import {
  ARTIFACT_SCHEMAS,
  checkAdapterReadiness,
  checkAdapterRuntime,
  composeConfig,
  describeRuntimeFault,
  RegistryError,
  resolveConfigPath,
  seedConfig,
  summarizeConfig,
  templatePath,
  type LoadModule,
} from "./config.js";
import { executionConfig } from "./session.js";
import { scratchDir } from "./testing/scratch.js";

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
    artifactSchema: ARTIFACT_SCHEMAS[0],
    requiredRoleIds: ["coder"],
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
        throw new Error(`unknown option "${key}"`);
      }
      return slice;
    },
    createRuntime: () => ({}),
    ...overrides,
  };
}

function reviewEntry(overrides: Record<string, unknown> = {}) {
  return registryEntry({
    id: "review",
    command: "review",
    intent: "review committed phases: coder and reviewer converge",
    requiredRoleIds: ["coder", "reviewer"],
    ...overrides,
  });
}

function decideEntry(overrides: Record<string, unknown> = {}) {
  return registryEntry({
    id: "decide",
    command: "decide",
    intent: "decision workflow: records a reviewed decision",
    requiredRoleIds: ["coder", "reviewer"],
    ...overrides,
  });
}

function branchEntry(overrides: Record<string, unknown> = {}) {
  return registryEntry({
    id: "branch",
    command: "branch",
    intent: "branch workflow: name and open the working branch",
    requiredRoleIds: ["coder"],
    ...overrides,
  });
}

function prEntry(overrides: Record<string, unknown> = {}) {
  return registryEntry({
    id: "pr",
    command: "pr",
    intent: "pull-request workflow: describe the committed work",
    requiredRoleIds: ["coder"],
    ...overrides,
  });
}

const stubLoader: LoadModule = async (specifier) => {
  if (specifier === "@sublang/playbook/code/registry") {
    return { default: registryEntry() };
  }
  if (specifier === "@sublang/playbook/review/registry") {
    return { default: reviewEntry() };
  }
  if (specifier === "@sublang/playbook/decide/registry") {
    return { default: decideEntry() };
  }
  if (specifier === "@sublang/playbook/inspect/registry") {
    return { default: registryEntry({
      id: "inspect",
      command: "inspect",
      intent: "inspect an app or supplied evidence without repository changes",
      requiredRoleIds: ["inspector"],
    }) };
  }
  if (specifier === "@sublang/playbook/dev/registry") {
    return {
      default: registryEntry({
        id: "dev",
        command: "dev",
        intent: "planning workflow: analyze before implementing",
        requiredRoleIds: ["analyst"],
      }),
    };
  }
  if (specifier === "@sublang/playbook/branch/registry") {
    return { default: branchEntry() };
  }
  if (specifier === "@sublang/playbook/pr/registry") {
    return { default: prEntry() };
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

function codeRoles(top: Record<string, unknown>): Record<string, unknown> {
  return codeBlock(top).roles as Record<string, unknown>;
}

function roster(top: Record<string, unknown>): Record<string, unknown> {
  return top.players as Record<string, unknown>;
}

function reviewBlock(top: Record<string, unknown>): Record<string, unknown> {
  return (top.playbooks as Record<string, Record<string, unknown>>).review;
}

function reviewRoles(top: Record<string, unknown>): Record<string, unknown> {
  return reviewBlock(top).roles as Record<string, unknown>;
}

test("bundled template composes with launcher-equivalent output", async () => {
  // The template is the installed playbook's own (core-service-3), so
  // every expectation derives from it rather than restating a roster.
  const top = baseConfig();
  const captain = top.captain as Record<string, unknown>;
  const players = roster(top) as Record<string, Record<string, unknown>>;
  const ids = Object.keys(players);
  const coder = players[String(codeRoles(top).coder)];
  const composed = await composeConfig(top, stubLoader);
  assert.deepEqual(composed.captainAgent, {
    adapter: captain.adapter,
    model: captain.model,
    effort: captain.effort,
    permissions: captain.permissions,
  });
  assert.equal(composed.captainOptions.captainAdapter, captain.adapter);
  assert.deepEqual(composed.players.map((player) => player.id), ids);
  assert.deepEqual(composed.initialVisible, ids);
  const binding = composed.captainOptions.playbooks.code.roles.coder;
  assert.equal(binding.playerId, codeRoles(top).coder);
  // Inheritance resolves in composition, so the shell is told the
  // outcome rather than left to infer it (DR-032).
  assert.deepEqual(binding.model, { kind: "value", value: coder.model });
  assert.deepEqual(binding.effort, { kind: "value", value: coder.effort });
  assert.equal(composed.captainOptions.playbooks.code.from, "@sublang/playbook/code/registry");
  // The session's agents travel as one block the shell reads.
  assert.deepEqual(
    Object.keys(composed.captainOptions.sessionAgents.players).sort(),
    [...ids].sort(),
  );
  assert.equal(composed.captainOptions.sessionAgents.captain.adapter, captain.adapter);
  assert.equal(composed.players[0].model, players[ids[0]].model);
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
  roster(withPlayer)["dev.reviewer"] = { profile: "codex-gpt", model: "gpt-6" };
  await expectError(
    withPlayer,
    /^players\.dev\.reviewer\.profile is retired: agents carry their own adapter, model, effort, and permissions$/,
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
  // The failure carries its kind, so callers never read the words.
  await assert.rejects(composeConfig(top, stubLoader), (error: Error) => {
    assert.ok(error instanceof RegistryError);
    assert.equal(error.kind, "unavailable");
    return true;
  });
});

test("a file-path registry without the current contract marker is refused as stale", async () => {
  const top = baseConfig();
  const registry = join(scratchDir("spex-stale-"), "registry.mjs");
  codeBlock(top).from = registry;
  const loader: LoadModule = async (specifier) =>
    specifier === registry ? { default: registryEntry() } : stubLoader(specifier);
  await assert.rejects(composeConfig(top, loader), (error: Error) => {
    assert.match(
      error.message,
      /^playbooks\.code\.from ".*registry\.mjs" was generated by an older Spex toolchain; recompile "code"/,
    );
    assert.ok(error instanceof RegistryError);
    assert.equal(error.kind, "stale");
    return true;
  });
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
  codeRoles(top).captain = "dev.coder";
  await expectError(
    top,
    /^playbooks\.code\.roles\.captain binds local role "captain", which is reserved/,
  );
});

test("role bindings cover the manifest exactly, as the launcher requires", async () => {
  // Bindings must cover requiredRoleIds exactly: a missing role has no
  // agent, an extra one names work the manifest never declares
  // (DR-032).
  const missing = baseConfig();
  reviewBlock(missing).roles = { coder: "dev.coder" };
  await expectError(
    missing,
    /^playbooks\.review\.roles must exactly cover requiredRoleIds; missing reviewer$/,
  );

  const extra = baseConfig();
  codeRoles(extra).reviewer = "dev.reviewer";
  await expectError(
    extra,
    /^playbooks\.code\.roles must exactly cover requiredRoleIds; unknown reviewer$/,
  );

  const absent = baseConfig();
  codeRoles(absent).coder = "dev.nobody";
  await expectError(
    absent,
    /^playbooks\.code\.roles\.coder names absent session player "dev\.nobody"$/,
  );

  // Adapter and permissions belong to the player envelope and are
  // refused inside a binding.
  const overreach = baseConfig();
  codeRoles(overreach).coder = { player: "dev.coder", adapter: "codex" };
  await expectError(
    overreach,
    /^playbooks\.code\.roles\.coder\.adapter is not a role binding key/,
  );

  // A roleless playbook is legal in v8 and contributes no player.
  const roleless = baseConfig();
  codeBlock(roleless).roles = {};
  const composed = await composeConfig(roleless, async (specifier) =>
    specifier.includes("code")
      ? { default: registryEntry({ id: "code", command: "code", requiredRoleIds: [] }) }
      : stubLoader(specifier),
  );
  assert.ok(!composed.players.some((player) => player.id === "code"));
});

test("scalar shorthands still compose as bare-adapter blocks", async () => {
  const top = baseConfig();
  roster(top)["dev.reviewer"] = "claude";
  const composed = await composeConfig(top, stubLoader);
  const reviewer = composed.players.find((p) => p.id === "dev.reviewer");
  assert.deepEqual(reviewer, { id: "dev.reviewer", adapter: "claude" });
});

test("fast mode composes on agents and roles; a non-boolean is refused", async () => {
  // The launcher that shares this file accepts adapter-scoped fast mode
  // (cligent 0.24), so a config it accepts must never be rejected here
  // (shared-config-roundtrip-1).
  const top = baseConfig();
  (top.captain as Record<string, unknown>).fastMode = true;
  roster(top)["dev.reviewer"] = { adapter: "codex", fastMode: false };
  codeRoles(top).coder = { player: "dev.coder", fastMode: false };
  const composed = await composeConfig(top, stubLoader);
  assert.equal(
    composed.captainAgent.fastMode,
    true,
    "an explicit true survives composition",
  );
  const reviewer = composed.players.find((p) => p.id === "dev.reviewer");
  assert.equal(
    reviewer?.fastMode,
    false,
    "an explicit false is a literal request, not omission",
  );

  // The summary carries it where an agent is named (DR-038): the
  // captain, each player, and a role's own override — absent otherwise.
  const summary = summarizeConfig({ path: "/cfg", raw: top, composed });
  assert.equal(summary.captain.fastMode, true);
  assert.equal(
    summary.players.find((p) => p.id === "dev.reviewer")?.agent.fastMode,
    false,
  );
  const code = summary.playbooks.find((p) => p.id === "code");
  assert.equal(code?.roles.coder.fastMode, false);
  const review = summary.playbooks.find((p) => p.id === "review");
  assert.ok(review && !("fastMode" in review.roles.reviewer));

  const bad = baseConfig();
  (bad.captain as Record<string, unknown>).fastMode = "yes";
  await expectError(bad, /^captain\.fastMode must be a boolean$/);
});

test("a subagent model composes on agents and bindings; blank or on an adapter cligent does not serve it is refused", async () => {
  // DR-093: a fourth tuning field — a pin, `false` for the provider's
  // default, omission to inherit the player's — validated in cligent's
  // words and resolved before the shell sees it.
  const top = baseConfig();
  (top.captain as Record<string, unknown>).subagentModel = "claude-sonnet-5-5";
  const coderId = String(codeRoles(top).coder);
  (roster(top)[coderId] as Record<string, unknown>).subagentModel = "claude-haiku-5";
  reviewRoles(top).coder = { player: coderId, subagentModel: false };
  reviewRoles(top).reviewer = { player: String(reviewRoles(top).reviewer), subagentModel: "claude-haiku-5" };
  const composed = await composeConfig(top, stubLoader);
  assert.equal(composed.captainAgent.subagentModel, "claude-sonnet-5-5");
  assert.equal(composed.captainOptions.sessionAgents.captain.subagentModel, "claude-sonnet-5-5");
  assert.equal(composed.captainOptions.sessionAgents.players[coderId]?.subagentModel, "claude-haiku-5");
  // An omitted binding inherits the player's; `false` is Off, carried
  // until the projection is built (DR-095); a pin stands.
  assert.equal(composed.captainOptions.playbooks.code.roles.coder.subagentModel, "claude-haiku-5");
  assert.equal(composed.captainOptions.playbooks.review.roles.coder.subagentModel, false);
  assert.equal(composed.captainOptions.playbooks.review.roles.reviewer.subagentModel, "claude-haiku-5");

  // The summary carries each agent's and each binding's own.
  const summary = summarizeConfig({ path: "/cfg", raw: top, composed });
  assert.equal(summary.captain.subagentModel, "claude-sonnet-5-5");
  assert.equal(summary.players.find((p) => p.id === coderId)?.agent.subagentModel, "claude-haiku-5");
  const review = summary.playbooks.find((p) => p.id === "review");
  assert.equal(review?.roles.coder.subagentModel, false);
  assert.equal(review?.roles.reviewer.subagentModel, "claude-haiku-5");
  assert.ok(!("subagentModel" in (summary.playbooks.find((p) => p.id === "code")?.roles.coder ?? {})));

  const blank = baseConfig();
  (blank.captain as Record<string, unknown>).subagentModel = "  ";
  await expectError(blank, /^captain\.subagentModel must be a nonblank string$/);

  const unsupported = baseConfig();
  roster(unsupported)[coderId] = { adapter: "codex", subagentModel: "gpt-6" };
  await expectError(unsupported, new RegExp(`^players\\.${coderId.replace(".", "\\.")}\\.subagentModel is not supported for adapter "codex"$`));

  // A binding's pin is checked against its player's adapter; `false`
  // asks nothing of it and composes.
  const onCodex = baseConfig();
  roster(onCodex)[coderId] = { adapter: "codex" };
  codeRoles(onCodex).coder = { player: coderId, subagentModel: "gpt-6" };
  await expectError(onCodex, /^playbooks\.code\.roles\.coder\.subagentModel is not supported for adapter "codex"$/);
  codeRoles(onCodex).coder = { player: coderId, subagentModel: false };
  reviewRoles(onCodex).coder = { player: coderId, subagentModel: false };
  await composeConfig(onCodex, stubLoader);
});

test("a subagent effort and the inherit literal compose; an effort outside the vocabulary, beside no model, or off its adapter is refused", async () => {
  // DR-095 (core-service-16): `inherit` names the agent's own model and
  // `false` sends none; a subagent effort is the adapter's effort less
  // its orchestration value, beside a subagent model — an unset one
  // composing as `inherit`, as Playbook's launcher resolves it.
  const top = baseConfig();
  const coderId = String(codeRoles(top).coder);
  const reviewerId = String(reviewRoles(top).reviewer);
  Object.assign(top.captain as Record<string, unknown>, { subagentModel: "inherit", subagentEffort: "high" });
  (roster(top)[coderId] as Record<string, unknown>).subagentEffort = "low";
  (roster(top)[reviewerId] as Record<string, unknown>).subagentModel = false;
  codeRoles(top).coder = { player: coderId, subagentEffort: "max" };
  reviewRoles(top).coder = { player: coderId, subagentEffort: false };
  reviewRoles(top).reviewer = { player: reviewerId, subagentModel: "claude-haiku-5", subagentEffort: "medium" };
  const composed = await composeConfig(top, stubLoader);
  const agents = composed.captainOptions.sessionAgents;
  assert.equal(agents.captain.subagentModel, "inherit");
  assert.equal(agents.captain.subagentEffort, "high");
  // An effort beside an unset model runs on the agent's own model.
  assert.equal(agents.players[coderId]?.subagentModel, "inherit");
  assert.equal(agents.players[coderId]?.subagentEffort, "low");
  // `false` is Off, carried as itself so an effort beside it is refused.
  assert.equal(agents.players[reviewerId]?.subagentModel, false);
  const analystId = String(((top.playbooks as Record<string, Record<string, unknown>>).dev.roles as Record<string, unknown>).analyst);
  assert.equal(agents.players[analystId]?.subagentModel, "inherit", "an untuned agent delegates on its own model");
  assert.ok(!("subagentEffort" in (agents.players[analystId] ?? {})), "at efforts of its own choosing");
  // A binding's effort wins over its player's; `false` leaves it to the
  // agent and keeps nothing else beside it.
  const roles = composed.captainOptions.playbooks;
  assert.deepEqual(
    { model: roles.code.roles.coder.subagentModel, effort: roles.code.roles.coder.subagentEffort },
    { model: "inherit", effort: "max" },
  );
  assert.ok(!("subagentEffort" in roles.review.roles.coder));
  assert.deepEqual(
    { model: roles.review.roles.reviewer.subagentModel, effort: roles.review.roles.reviewer.subagentEffort },
    { model: "claude-haiku-5", effort: "medium" },
  );

  // The summary keeps what the file says: the literal, `false`, the omission.
  const summary = summarizeConfig({ path: "/cfg", raw: top, composed });
  assert.equal(summary.captain.subagentModel, "inherit");
  assert.equal(summary.captain.subagentEffort, "high");
  const coder = summary.players.find((p) => p.id === coderId)?.agent;
  assert.ok(coder && !("subagentModel" in coder));
  assert.equal(coder?.subagentEffort, "low");
  assert.equal(summary.players.find((p) => p.id === reviewerId)?.agent.subagentModel, false);
  assert.equal(summary.playbooks.find((p) => p.id === "review")?.roles.coder.subagentEffort, false);
  assert.equal(summary.playbooks.find((p) => p.id === "code")?.roles.coder.subagentEffort, "max");

  // An orchestration effort is no subagent's.
  const orchestration = baseConfig();
  (orchestration.captain as Record<string, unknown>).subagentEffort = "ultracode";
  await expectError(orchestration, /^captain\.subagentEffort for adapter "claude" must be one of: minimal, low, medium, high, xhigh, max$/);

  // An effort beside a model switched off has no subagents to govern.
  const off = baseConfig();
  Object.assign(off.captain as Record<string, unknown>, { subagentModel: false, subagentEffort: "low" });
  await expectError(off, /^captain\.subagentEffort for adapter "claude" requires subagentModel$/);
  const offBinding = baseConfig();
  codeRoles(offBinding).coder = { player: coderId, subagentModel: false, subagentEffort: "low" };
  await expectError(offBinding, /^playbooks\.code\.roles\.coder\.subagentEffort for adapter "claude" requires subagentModel$/);
  // A player's effort reaching a binding that turns its model off is
  // refused at the binding.
  const inheritedOff = baseConfig();
  (roster(inheritedOff)[coderId] as Record<string, unknown>).subagentEffort = "low";
  codeRoles(inheritedOff).coder = { player: coderId, subagentModel: false };
  await expectError(inheritedOff, /^playbooks\.code\.roles\.coder\.subagentEffort for adapter "claude" requires subagentModel$/);
  // And a binding's effort over a player whose model is off: the
  // player's Off reaches the binding as itself, never the default.
  const overOff = baseConfig();
  (roster(overOff)[coderId] as Record<string, unknown>).subagentModel = false;
  codeRoles(overOff).coder = { player: coderId, subagentEffort: "low" };
  await expectError(overOff, /^playbooks\.code\.roles\.coder\.subagentEffort for adapter "claude" requires subagentModel$/);

  // An adapter cligent serves no subagent model for takes no effort.
  const onCodex = baseConfig();
  roster(onCodex)[coderId] = { adapter: "codex", subagentEffort: "low" };
  await expectError(onCodex, new RegExp(`^players\\.${coderId.replace(".", "\\.")}\\.subagentEffort is not supported for adapter "codex"$`));
  // `false` asks nothing of the adapter, so a codex lane may carry it.
  roster(onCodex)[coderId] = { adapter: "codex", subagentModel: false };
  await composeConfig(onCodex, stubLoader);

  // A binding's effort is one of its keys, its blank refused as the others are.
  const blank = baseConfig();
  codeRoles(blank).coder = { player: coderId, subagentEffort: "" };
  await expectError(blank, /^playbooks\.code\.roles\.coder\.subagentEffort must be a string or false/);
});

test("an unset subagent model delegates on the agent's own model wherever cligent serves one, as the launcher resolves it", async () => {
  // DR-095 (core-service-16): with or without an effort beside it, at
  // the Captain, each player and each binding; the summary keeps the
  // omission, and an adapter cligent serves none for composes none.
  const top = baseConfig();
  const coderId = String(codeRoles(top).coder);
  const reviewerId = String(reviewRoles(top).reviewer);
  roster(top)[reviewerId] = { adapter: "codex" };
  const composed = await composeConfig(top, stubLoader);
  const agents = composed.captainOptions.sessionAgents;
  assert.equal(agents.captain.subagentModel, "inherit");
  assert.equal(agents.players[coderId]?.subagentModel, "inherit");
  assert.ok(!("subagentEffort" in agents.players[coderId]!), "the agent chooses its subagents' efforts");
  assert.equal(composed.captainOptions.playbooks.code.roles.coder.subagentModel, "inherit");
  assert.ok(!("subagentModel" in agents.players[reviewerId]!), "an adapter serving none composes none");
  assert.ok(!("subagentModel" in composed.captainOptions.playbooks.review.roles.reviewer));
  const summary = summarizeConfig({ path: "/cfg", raw: top, composed });
  assert.ok(!("subagentModel" in summary.captain), "the summary keeps the omission");
  assert.ok(!("subagentModel" in summary.players.find((p) => p.id === coderId)!.agent));

  // The projection the shell opens on carries the default, and an Off
  // carried through composition is dropped only there.
  (roster(top)[coderId] as Record<string, unknown>).subagentModel = false;
  reviewRoles(top).coder = { player: coderId, subagentModel: "claude-haiku-5" };
  const off = await composeConfig(top, stubLoader);
  assert.equal(off.captainOptions.sessionAgents.players[coderId]?.subagentModel, false);
  assert.equal(off.captainOptions.playbooks.code.roles.coder.subagentModel, false);
  const projection = executionConfig(off, "/work") as unknown as {
    captain: { subagentModel?: string };
    players: { id: string; subagentModel?: string }[];
    catalog: Record<string, { roles: Record<string, { subagentModel?: string }> }>;
  };
  assert.equal(projection.captain.subagentModel, "inherit");
  assert.ok(!("subagentModel" in projection.players.find((p) => p.id === coderId)!), "Off sends none");
  assert.ok(!("subagentModel" in projection.catalog.code!.roles.coder!), "nor at the binding inheriting it");
  assert.equal(projection.catalog.review!.roles.coder!.subagentModel, "claude-haiku-5", "a binding's pin over an Off stands");
});

test("a player no binding names is listed as bound to no role and opens no session lane", async () => {
  // settings-26 and playbook-library-55: the summary lists every
  // declared player so Settings can show the unbound lane and a draft
  // can pick it as its agent; the session roster keeps only the
  // players a role binds (DR-032).
  const top = baseConfig();
  roster(top)["compiler"] = { adapter: "codex", model: "gpt-6-astra", effort: "xhigh" };
  const composed = await composeConfig(top, stubLoader);
  assert.ok(!composed.players.some((p) => p.id === "compiler"), "no session lane for an unbound player");
  assert.deepEqual(
    composed.roster.map((p) => p.id),
    Object.keys(roster(top)),
    "the roster holds every declared player in file order",
  );
  const summary = summarizeConfig({ path: "/cfg", raw: top, composed });
  const spare = summary.players.find((p) => p.id === "compiler");
  assert.deepEqual(spare?.boundBy, []);
  assert.equal(spare?.agent.adapter, "codex");
  assert.equal(spare?.agent.effort, "xhigh");
});

test("unknown agent fields and adapters are rejected; kimi is known", async () => {
  const top = baseConfig();
  (top.captain as Record<string, unknown>).typo = true;
  await expectError(top, /^Unknown config field captain\.typo$/);
  delete (top.captain as Record<string, unknown>).typo;

  roster(top)["dev.reviewer"] = "mystery";
  // The valid set is cligent's own (DR-019) and now includes kimi.
  await expectError(
    top,
    /^Unknown adapter "mystery" for players\.dev\.reviewer\. Valid adapters: claude, codex, gemini, kimi, opencode$/,
  );

  roster(top)["dev.reviewer"] = { adapter: "kimi" };
  const composed = await composeConfig(top, stubLoader);
  const reviewer = composed.players.find((p) => p.id === "dev.reviewer");
  assert.equal(reviewer?.adapter, "kimi");
});

test("effort vocabularies are adapter-scoped", async () => {
  // Kimi accepts only off/on.
  const top = baseConfig();
  roster(top)["dev.reviewer"] = { adapter: "kimi", effort: "off" };
  let composed = await composeConfig(top, stubLoader);
  assert.equal(
    composed.players.find((p) => p.id === "dev.reviewer")?.effort,
    "off",
  );
  roster(top)["dev.reviewer"] = { adapter: "kimi", effort: "on" };
  composed = await composeConfig(top, stubLoader);
  assert.equal(
    composed.players.find((p) => p.id === "dev.reviewer")?.effort,
    "on",
  );
  roster(top)["dev.reviewer"] = { adapter: "kimi", effort: "minimal" };
  await expectError(
    top,
    /^players\.dev\.reviewer\.effort "minimal" is not supported by the "kimi" adapter \(valid: off, on\)$/,
  );

  // Claude adds ultracode; Codex adds ultra.
  const claudeTop = baseConfig();
  (claudeTop.captain as Record<string, unknown>).effort = "ultracode";
  composed = await composeConfig(claudeTop, stubLoader);
  assert.equal(composed.captainAgent.effort, "ultracode");

  const codexTop = baseConfig();
  roster(codexTop)["dev.reviewer"] = { adapter: "codex", effort: "ultra" };
  composed = await composeConfig(codexTop, stubLoader);
  assert.equal(
    composed.players.find((p) => p.id === "dev.reviewer")?.effort,
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
  const coder = roster(top)["dev.coder"] as Record<string, unknown>;
  // The template writes canonical `effort`; swap in the legacy alias.
  const original = coder.effort;
  assert.equal(typeof original, "string");
  delete coder.effort;
  coder.reasoningEffort = original;
  const composed = await composeConfig(top, stubLoader);
  const player = composed.players.find((p) => p.id === "dev.coder");
  assert.equal(player?.effort, original);
  assert.ok(!("reasoningEffort" in (player ?? {})));

  coder.effort = "high";
  await expectError(
    top,
    /must not set both effort and its legacy alias reasoningEffort/,
  );
});

test("cwd acceptance probe marks entries that take a cwd option", async () => {
  const cwdLoader: LoadModule = async (specifier) => {
    if (specifier === "@sublang/playbook/review/registry") {
      return { default: reviewEntry() };
    }
    if (specifier === "@sublang/playbook/decide/registry") {
      return { default: decideEntry() };
    }
    if (specifier === "@sublang/playbook/code/registry") {
      return {
        default: registryEntry({
          validateOptions: (value: unknown) => {
            const slice = (value ?? {}) as Record<string, unknown>;
            for (const key of Object.keys(slice)) {
              if (key !== "cwd") {
                throw new Error(`unknown option "${key}"`);
              }
            }
            return slice;
          },
        }),
      };
    }
    return stubLoader(specifier);
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
  const dir = scratchDir("spex-config-");
  const path = join(dir, "config", "playbook.config.yaml");
  assert.equal(seedConfig(path), true);
  const seeded = readFileSync(path, "utf8");
  assert.match(seeded, /playbooks:/);
  writeFileSync(path, "captain: claude\n");
  assert.equal(seedConfig(path), false);
  assert.equal(readFileSync(path, "utf8"), "captain: claude\n");
});

test("resolveConfigPath honors SPEX_HOME and falls back to ~/.spex", () => {
  // The launcher resolves the same root, so both hosts open one file.
  assert.equal(
    resolveConfigPath({ SPEX_HOME: "/x" }, "/home/u"),
    join("/x", "config", "playbook.config.yaml"),
  );
  assert.equal(
    resolveConfigPath({}, "/home/u"),
    join("/home/u", ".spex", "config", "playbook.config.yaml"),
  );
  // A blank override is not a root; the home fallback still applies.
  assert.equal(
    resolveConfigPath({ SPEX_HOME: "  " }, "/home/u"),
    join("/home/u", ".spex", "config", "playbook.config.yaml"),
  );
});

// DR-024: readiness combines the runtime half with the credential half.
// Tests inject the runtime check so they depend on neither installed SDKs
// nor CLIs on PATH; the real check derives from cligent's targets.
const usableRuntime = () => ({ usable: true });

test("adapter readiness mirrors the launcher credential rules", async () => {
  const home = scratchDir("spex-home-");
  assert.equal(
    (await checkAdapterReadiness("claude", {}, home, usableRuntime)).ready,
    false,
  );
  assert.equal(
    (await checkAdapterReadiness("claude", { ANTHROPIC_API_KEY: "k" }, home, usableRuntime))
      .ready,
    true,
  );
  mkdirSync(join(home, ".codex"));
  assert.equal(
    (await checkAdapterReadiness("codex", {}, home, usableRuntime)).ready,
    true,
  );
  assert.equal(
    (await checkAdapterReadiness("gemini", {}, home, usableRuntime)).ready,
    null,
  );
  assert.equal(
    (await checkAdapterReadiness("kimi", {}, home, usableRuntime)).ready,
    null,
  );
});

test("a missing or stale runtime reports not ready, whatever the credential class", async () => {
  const home = scratchDir("spex-home-");
  const missing = () => ({
    usable: false,
    requirement:
      "@openai/codex is not installed (requires >=x) — install with: npm install -g @openai/codex-sdk@x",
  });
  // Credentials satisfied, runtime missing: not ready, runtime named.
  mkdirSync(join(home, ".codex"));
  const codex = await checkAdapterReadiness("codex", {}, home, missing);
  assert.equal(codex.ready, false);
  assert.match(codex.requirement ?? "", /npm install -g @openai\/codex-sdk/);
  // The null credential class does not survive an unusable runtime.
  const gemini = await checkAdapterReadiness("gemini", {}, home, missing);
  assert.equal(gemini.ready, false);
  // Both halves unmet report both, not the first alone.
  const both = await checkAdapterReadiness("claude", {}, scratchDir("spex-home-"), missing);
  assert.equal(both.ready, false);
  assert.match(both.requirement ?? "", /npm install -g/);
  assert.match(both.requirement ?? "", /ANTHROPIC_API_KEY/);
});

test("supplied SDKs probe available through cligent's own loaders", async () => {
  // DR-024: the desktop supplies these SDKs, so this repository's tree
  // carries them and cligent's probe — the same load a session start
  // performs — answers available on every machine, CI included.
  assert.equal((await checkAdapterRuntime("claude")).usable, true);
  assert.equal((await checkAdapterRuntime("codex")).usable, true);
});

test("core-service-113: an unavailable runtime names the executable cligent finds missing", async () => {
  // Availability and the executable lookup are cligent's; each outcome is
  // injected so every one is reached on any machine, while the published
  // targets and the credential half run for real over this checkout's
  // supplied SDKs, which classify healthy — so the lookup has the say.
  const home = scratchDir("spex-home-");
  const env = { ANTHROPIC_API_KEY: "k", OPENAI_API_KEY: "k" };
  const unavailable = async () => false;
  for (const adapter of ["claude", "codex"] as const) {
    const readiness = async (executable: AgentExecutable) => {
      const asked: string[] = [];
      const result = await checkAdapterReadiness(adapter, env, home, (name) =>
        checkAdapterRuntime(name, {
          available: unavailable,
          locateExecutable: (runtime) => {
            asked.push(runtime);
            return executable;
          },
        }),
      );
      assert.deepEqual(asked, [adapter]);
      return result;
    };

    // A dropped platform package: named, with its host and both repairs.
    const missing = await readiness({
      state: "missing",
      package: `@example/${adapter}-sdk-darwin-arm64`,
      platform: "darwin",
      arch: "arm64",
    });
    assert.equal(missing.ready, false);
    assert.equal(
      missing.requirement,
      `the ${adapter} executable is missing: @example/${adapter}-sdk-darwin-arm64 is not installed for darwin-arm64 — run npm ci in the checkout, or reinstall the app`,
    );

    // A host the SDK publishes nothing for: no install repairs it.
    const unsupported = await readiness({
      state: "unsupported",
      platform: "aix",
      arch: "ppc64",
    });
    assert.equal(unsupported.ready, false);
    assert.equal(
      unsupported.requirement,
      `the ${adapter} SDK publishes no executable for aix-ppc64`,
    );

    // No second fault to name: the load failure speaks for itself.
    const generic = `the ${adapter} runtime failed to load — reinstall the app, or run npm install in a checkout`;
    for (const executable of [
      { state: "no-sdk" },
      { state: "present", path: `/opt/${adapter}` },
    ] as const) {
      const quiet = await readiness(executable);
      assert.equal(quiet.ready, false);
      assert.equal(quiet.requirement, generic);
    }

    // An available adapter stays ready whatever the lookup would say.
    const available = await checkAdapterReadiness(adapter, env, home, (name) =>
      checkAdapterRuntime(name, {
        available: async () => true,
        locateExecutable: () => ({
          state: "missing",
          package: "@example/unused",
          platform: "darwin",
          arch: "arm64",
        }),
      }),
    );
    assert.equal(available.ready, true);
    assert.equal(available.requirement, undefined);
  }
});

test("a fault's repair is rendered for its install tree", () => {
  // Verdicts are built through cligent's own classifier over its real
  // published targets, with the installed version forced — so the shapes
  // are cligent's, while no version literal originates here.
  const [sdkTarget, cliTarget] = AGENT_RUNTIME_TARGETS.opencode;
  // A PATH runtime is repairable in place: pinned global install.
  const cliMissing = classifyRuntime(cliTarget, false, undefined);
  assert.match(
    describeRuntimeFault(cliMissing),
    new RegExp(`install with: npm install -g ${cliTarget.repairSpec.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}`),
  );
  // kimi's target carries a one-time step no install performs.
  const kimiTarget = AGENT_RUNTIME_TARGETS.kimi[0];
  const kimiMissing = classifyRuntime(kimiTarget, false, undefined);
  if (kimiTarget.steps && kimiTarget.steps.length > 0) {
    assert.match(describeRuntimeFault(kimiMissing), /; then: /);
  }
  // A bundled SDK is not repairable by any npm command — a global copy is
  // invisible to cligent's module walk — so the remedy is reinstalling.
  const sdkMissing = classifyRuntime(sdkTarget, false, undefined);
  const fault = describeRuntimeFault(sdkMissing);
  assert.doesNotMatch(fault, /npm install -g/);
  assert.match(fault, /reinstall the app/);
});

test("fast mode reaches the shell's agent blocks and role bindings", async () => {
  // The chip's mark would lie if the setting stayed a summary: the
  // shell must receive it on the captain, the lane, and the role
  // (DR-038; playbook 11 treats `false` as a literal disabled request).
  const top = baseConfig();
  (top.captain as Record<string, unknown>).fastMode = true;
  (roster(top)["dev.coder"] as Record<string, unknown>).fastMode = true;
  roster(top)["dev.reviewer"] = { adapter: "codex", fastMode: false };
  codeRoles(top).coder = { player: "dev.coder", fastMode: false };
  const composed = await composeConfig(top, stubLoader);
  assert.equal(composed.captainOptions.sessionAgents.captain.fastMode, true);
  assert.equal(
    composed.captainOptions.sessionAgents.players["dev.reviewer"]?.fastMode,
    false,
  );
  // Playbook builds a role's call from its binding alone, so the
  // binding carries the resolved choice, as the launcher resolves
  // `binding ?? player`: a binding's own override stands, a bare
  // binding takes its player's — `false` as literally as `true` —
  // and a player setting none leaves it to the provider.
  const { playbooks } = composed.captainOptions;
  assert.equal(playbooks.code.roles.coder.fastMode, false, "a binding's own override beats its player's");
  assert.equal(playbooks.review.roles.coder.fastMode, true, "a bare binding takes its player's fast mode");
  assert.equal(playbooks.review.roles.reviewer.fastMode, false, "a player's literal false reaches its bare binding");
  assert.ok(!("fastMode" in playbooks.dev.roles.analyst), "a player setting none leaves the binding without one");
  // The summary keeps each binding's own value, not the resolved one.
  const summary = summarizeConfig({ path: "/cfg", raw: top, composed });
  const review = summary.playbooks.find((p) => p.id === "review");
  assert.ok(review && !("fastMode" in review.roles.coder));
});
