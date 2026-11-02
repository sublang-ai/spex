// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// What the agent cards decide (settings-57 to settings-61, DR-174),
// apart from how they draw it: the batch that gives every agent of an
// adapter one model, the roles still naming an official Claude model
// behind a third-party service and the batch setting them to Provider
// default, and the words each fault and each computer is answered in.

import type {
  AdapterName,
  AgentModelOption,
  BaseUrlState,
  ConfigBatchOpInput,
  ConfigState,
  ConfigSummary,
  ReadinessEntry,
  ReadinessFault,
} from "@sublang/spex-core/protocol";

import { i18n } from "../i18n.js";

/** Anthropic's own naming (settings-59): a `claude-` model, or one of
 * its aliases, with or without the 1M-context suffix. No provider's
 * mapping table is kept: a third party maps these by its own rule. */
export function isOfficialModel(value: string | false | undefined): boolean {
  if (typeof value !== "string") return false;
  return /^claude-/i.test(value) || /^(opus|sonnet|haiku|fable)(\[1m\])?$/i.test(value);
}

// ---------------------------------------------------------------------------
// One model for every agent of an adapter (settings-57, settings-58)
// ---------------------------------------------------------------------------

export interface UnifyPlan {
  /** The agents the batch changes, by their config key. */
  changes: string[];
  /** `<playbook>.<role>` whose binding names a model of its own: left. */
  left: string[];
  ops: ConfigBatchOpInput[];
}

/** The batch giving the Captain, where it runs on `adapter`, and every
 * player on `adapter` the model `value` — "" for Provider default,
 * written as the key's removal. An agent already there is no change. */
export function unifyPlan(summary: ConfigSummary, adapter: AdapterName, value: string): UnifyPlan {
  const model = value === "" ? null : value;
  const differs = (current: string | undefined) => (current ?? "") !== value;
  const changes: string[] = [];
  const ops: ConfigBatchOpInput[] = [];
  if (summary.captain.adapter === adapter && differs(summary.captain.model)) {
    changes.push("captain");
    ops.push({ kind: "captain.set", patch: { model } });
  }
  const players = new Set<string>();
  for (const player of summary.players) {
    if (player.agent.adapter !== adapter) continue;
    players.add(player.id);
    if (!differs(player.agent.model)) continue;
    changes.push(player.id);
    ops.push({ kind: "player.set", playerId: player.id, patch: { model } });
  }
  const left: string[] = [];
  for (const playbook of summary.playbooks) {
    for (const [role, binding] of Object.entries(playbook.roles)) {
      if (players.has(binding.playerId) && binding.model !== undefined) left.push(`${playbook.id}.${role}`);
    }
  }
  return { changes, left, ops };
}

/** The models an adapter's agents run in your own group's file, after
 * inheritance (settings-5): each distinct one, `""` for Provider
 * default, so a card can name the one model or say there are several. */
export function adapterModels(summary: ConfigSummary, adapter: AdapterName): string[] {
  const models = new Set<string>();
  const players = new Map<string, string>();
  if (summary.captain.adapter === adapter) models.add(summary.captain.model ?? "");
  for (const player of summary.players) {
    if (player.agent.adapter !== adapter) continue;
    players.set(player.id, player.agent.model ?? "");
    models.add(player.agent.model ?? "");
  }
  for (const playbook of summary.playbooks) {
    for (const binding of Object.values(playbook.roles)) {
      if (!players.has(binding.playerId) || binding.model === undefined) continue;
      models.add(binding.model === false ? "" : binding.model);
    }
  }
  return [...models];
}

/** The model a value runs (settings-5): Provider default's model where
 * the runtime names one, a catalog row's resolution where the value is
 * its id or alias, else the value itself. */
function runModel(value: string, models: readonly AgentModelOption[], defaultModel: string | undefined): string {
  const model = value || defaultModel;
  if (!model) return "";
  const row = models.find((entry) => entry.id === model);
  return row?.resolvedModel ?? model;
}

/** The values of {@link adapterModels} one per model they run, so an
 * alias, its model and Provider default naming one model read as one
 * (settings-5): the first value of each, Provider default first. */
export function distinctRunModels(values: readonly string[], models: readonly AgentModelOption[], defaultModel: string | undefined): string[] {
  const kept = new Map<string, string>();
  for (const value of [...values].sort((a, b) => Number(a !== "") - Number(b !== ""))) {
    const model = runModel(value, models, defaultModel);
    if (!kept.has(model)) kept.set(model, value);
  }
  return [...kept.values()];
}

// ---------------------------------------------------------------------------
// Official names behind a third-party service (settings-59, settings-60)
// ---------------------------------------------------------------------------

/** Where an effective official name stands, which says what fixes it. */
export type OfficialSource =
  | { kind: "captain" }
  | { kind: "player"; playerId: string }
  | { kind: "own-binding"; playbookId: string; role: string; playerId: string };

export interface OfficialRole {
  /** Stable across renders: the scope, then the role. */
  key: string;
  /** "captain", or `<playbook>.<role>`. */
  role: string;
  /** The project whose composition the role is read in, where not
   * your own group's. */
  projectId?: string;
  model: string;
  source: OfficialSource;
}

/** Every role whose effective model is an official Claude name — the
 * Captain by its own `model`; each role by its binding's own model,
 * else its player's — over your own group's config and each project's
 * composition. A role a project reads exactly as your own config does
 * is listed once. */
export function officialRoles(state: ConfigState | undefined, projects: Record<string, ConfigState>): OfficialRole[] {
  if (state?.status !== "valid") return [];
  const own = state.summary;
  const rows: OfficialRole[] = [];
  const seen = new Set<string>();
  if (own.captain.adapter === "claude" && isOfficialModel(own.captain.model)) {
    rows.push({ key: "captain", role: "captain", model: own.captain.model!, source: { kind: "captain" } });
  }
  const read = (summary: ConfigSummary, projectId?: string) => {
    for (const playbook of summary.playbooks) {
      for (const [role, binding] of Object.entries(playbook.roles)) {
        const player = summary.players.find((p) => p.id === binding.playerId) ?? own.players.find((p) => p.id === binding.playerId);
        if (player?.agent.adapter !== "claude") continue;
        let model: string | false | undefined;
        let source: OfficialSource;
        if (binding.model !== undefined) {
          model = binding.model;
          // A project's file binds players by name alone (core-service-2),
          // so a binding's own model is your own group's in every
          // composition.
          source = { kind: "own-binding", playbookId: playbook.id, role, playerId: binding.playerId };
        } else {
          model = player.agent.model;
          source = { kind: "player", playerId: player.id };
        }
        if (!isOfficialModel(model)) continue;
        const name = `${playbook.id}.${role}`;
        // A project's role standing exactly as yours is one row.
        const same = `${name}:${JSON.stringify(source)}`;
        if (seen.has(same)) continue;
        seen.add(same);
        rows.push({ key: `${projectId ?? ""}:${name}`, role: name, ...(projectId !== undefined ? { projectId } : {}), model: model as string, source });
      }
    }
  };
  read(own);
  for (const [projectId, composed] of Object.entries(projects)) {
    if (composed.status === "valid") read(composed.summary, projectId);
  }
  return rows;
}

/** The batch setting each official name to Provider default where it
 * stands (settings-60): the Captain's and a player's `model` removed,
 * your own group's binding set to `false`. */
export function fixPlan(rows: readonly OfficialRole[]): ConfigBatchOpInput[] {
  const ops: ConfigBatchOpInput[] = [];
  const done = new Set<string>();
  for (const { source } of rows) {
    const key = JSON.stringify(source);
    if (done.has(key)) continue;
    done.add(key);
    if (source.kind === "captain") ops.push({ kind: "captain.set", patch: { model: null } });
    else if (source.kind === "player") ops.push({ kind: "player.set", playerId: source.playerId, patch: { model: null } });
    else ops.push({ kind: "playbook.role.bind", playbookId: source.playbookId, role: source.role, playerId: source.playerId, model: false });
  }
  return ops;
}

// ---------------------------------------------------------------------------
// Words (settings-5, settings-61)
// ---------------------------------------------------------------------------

/** An agent card's name: a product's own name stands untranslated,
 * any other adapter by its config name. */
export function agentName(adapter: string): string {
  return adapter === "claude" ? "Claude" : adapter === "codex" ? "Codex" : adapter;
}

/** The model service a `claude` card names, or nothing on a seat. */
export function modelServiceText(baseUrl: BaseUrlState | undefined): string | undefined {
  if (baseUrl?.state === "third-party") {
    return i18n._({ id: "Third party {host}", comment: "Claude's requests go to another provider; the host name stays as it is", values: { host: baseUrl.host } });
  }
  if (baseUrl?.state === "unset") return i18n._({ id: "Anthropic official", comment: "Claude's requests go to Anthropic's own service" });
  if (baseUrl?.state === "unknown") return i18n._({ id: "Unrecognized", comment: "ANTHROPIC_BASE_URL holds no address Spex can read" });
  return undefined;
}

/** The faults an entry reports, by kind; one from an older shape's
 * joined requirement reads as a credential's. */
export function faultsOf(entry: ReadinessEntry): ReadinessFault[] {
  if (entry.faults) return entry.faults;
  return entry.ready === false && entry.requirement ? [{ kind: "credential", requirement: entry.requirement }] : [];
}

export interface Guidance {
  /** Our words, where the fault has any; else the core's alone. In the
   * Workshop, what is missing (settings-69). */
  text?: string;
  /** The core's own requirement: the guidance's tooltip where the
   * guidance is in other words (settings-61). */
  core: string;
  /** The local closing line that follows: re-checking after a
   * sign-in or restarting after a variable, or restarting alone. */
  closing?: "re-check" | "restart";
  /** In the Workshop, the local route's line beside the online
   * service's (settings-69); the routes' own line closes it. */
  local?: string;
}

/** What a missing local credential leaves, in the Workshop's words. */
function noService(): string {
  return i18n._({ id: "Not signed in on this computer, and no key set.", comment: "What an agent card in the Workshop says is missing, beneath its Not ready badge" });
}

/** The Workshop's guidance for a local credential (settings-69): what
 * is missing, and the local route's line, by the agent. */
function workshopGuidance(entry: ReadinessEntry, core: string): Guidance {
  const local = entry.adapter === "codex"
    ? i18n._({ id: "Connect Codex with a ChatGPT subscription or an official OpenAI API key: the setup guide walks you through it.", comment: "The route on the Codex card in the Workshop, over the button opening the setup guide" })
    : i18n._({ id: "Connect Claude with a Claude subscription, or an Anthropic-compatible API key such as DeepSeek's: the setup guide walks you through it.", comment: "The route on the Claude card in the Workshop, over the button opening the setup guide" });
  const baseUrl = entry.adapter === "claude" ? entry.baseUrl : undefined;
  if (baseUrl?.state === "third-party") {
    return { text: i18n._({ id: "The third-party service {host} is set, but its key is not.", comment: "What the Claude card says is missing; {host} is a host name, kept as it is", values: { host: baseUrl.host } }), core, local };
  }
  if (baseUrl?.state === "unknown") {
    return { text: i18n._({ id: "<0>ANTHROPIC_BASE_URL</0> is not an address Spex recognizes.", comment: "What the Claude card says is missing; the variable name stays as it is" }), core, local };
  }
  return { text: noService(), core, local };
}

/** One fault in the reader's next step (settings-61). */
export function faultGuidance(entry: ReadinessEntry, fault: ReadinessFault, options: { workshop: boolean; seat: boolean }): Guidance {
  const core = fault.requirement;
  if (fault.kind === "runtime") return { core };
  if (options.seat) return { text: entry.credential?.phrase ?? core, core };
  if (options.workshop && (entry.adapter === "claude" || entry.adapter === "codex")) return workshopGuidance(entry, core);
  if (entry.adapter === "claude") {
    const state = entry.baseUrl?.state ?? "unset";
    if (state === "third-party") {
      return { text: i18n._({ id: "Set <0>ANTHROPIC_AUTH_TOKEN</0> and <1>ANTHROPIC_BASE_URL</1>.", comment: "Readiness guidance; the variable names stay as they are" }), core, closing: "restart" };
    }
    if (state === "unknown") {
      return { text: i18n._({ id: "<0>ANTHROPIC_BASE_URL</0> is not recognized: check the address, then set its credential.", comment: "Readiness guidance; the variable name stays as it is" }), core, closing: "restart" };
    }
    return { text: i18n._({ id: "Sign in by running claude in a terminal, or set <0>ANTHROPIC_API_KEY</0>.", comment: "Readiness guidance; `claude` is the command and the variable name stays as it is" }), core, closing: "re-check" };
  }
  if (entry.adapter === "codex") {
    return { text: i18n._({ id: "Run codex login, or set <0>OPENAI_API_KEY</0> (an official OpenAI key).", comment: "Readiness guidance; `codex login` is the command and the variable name stays as it is" }), core, closing: "re-check" };
  }
  return { core };
}

/** The variables a manual step sets, by the agent and its service. */
function manualVariables(adapter: AdapterName, baseUrl: BaseUrlState | undefined): string[] {
  if (adapter === "codex") return ["OPENAI_API_KEY"];
  if (baseUrl?.state === "third-party" || baseUrl?.state === "unknown") return ["ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_MODEL"];
  return ["ANTHROPIC_API_KEY"];
}

export interface ManualSteps {
  /** Where the lines go, in the reader's words. */
  where: string;
  /** The lines to write or run, as they are typed. */
  lines: string[];
}

/** Manual steps for the computer the core runs on (settings-5): a user
 * environment variable on Windows; elsewhere an `export` line in the
 * login file of the user's shell. */
export function manualSteps(entry: ReadinessEntry): ManualSteps {
  const names = manualVariables(entry.adapter, entry.baseUrl);
  if (entry.platform === "win32") {
    return {
      where: i18n._({ id: "Set each as a user environment variable — in a terminal with setx, or in the system settings:", comment: "Manual step on Windows; `setx` is the command's name" }),
      lines: names.map((name) => `setx ${name} "<${name}>"`),
    };
  }
  const lines = names.map((name) => `export ${name}="<${name}>"`);
  if (entry.shell === "zsh") return { where: i18n._({ id: "Add these lines to <0>~/.zshrc</0>:", comment: "Manual step for zsh; the file name stays as it is" }), lines };
  if (entry.shell === "bash") return { where: i18n._({ id: "Add these lines to <0>~/.bash_profile</0>:", comment: "Manual step for bash; the file name stays as it is" }), lines };
  return { where: i18n._("Add these lines to your shell's login configuration file:"), lines };
}

/** The roles a row reads in, for a list: the Captain by name. */
export function roleLabel(role: string): string {
  return role === "captain" ? i18n._({ id: "Captain", comment: "the session's controlling agent, by name" }) : role;
}
