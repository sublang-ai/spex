// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Shared playbook config: location, seeding, validation, and
// composition into runtime options. Validation and composition keep
// behavioral parity with the playbook launcher (DR-004, CORE-16): any
// config the launcher accepts or rejects is treated identically here,
// with the same error messages wherever the rule exists upstream.

import { constants, copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

import type { AdapterName, ConfigSummary } from "./protocol.js";

export const PLAYBOOK_CAPTAIN_MODULE = "@sublang/playbook/playbook-captain";

const ADAPTER_SHORTHANDS = ["claude", "codex"];
const KNOWN_ADAPTERS = ["claude", "codex", "gemini", "opencode"] as const;
const PLAYBOOK_LAUNCHER_KEYS = ["from", "command", "players"];
const RESERVED_CAPTAIN_ROLE_ID = "captain";

const AGENT_FIELDS = new Set([
  "adapter",
  "model",
  "instruction",
  "permissions",
  "reasoningEffort",
]);
const PERMISSION_FIELDS = new Set([
  "mode",
  "fileWrite",
  "shellExecute",
  "networkAccess",
  "writablePaths",
]);
const REASONING_EFFORTS = new Set([
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

export interface ResolvedAgent {
  adapter: AdapterName;
  model?: string;
  instruction?: string;
  permissions?: Record<string, unknown>;
  reasoningEffort?: string;
}

export interface ComposedPlayer extends ResolvedAgent {
  id: string;
}

export interface ComposedPlaybook {
  id: string;
  command: string;
  intent: string;
  requiredRoleIds: readonly string[];
  from: string;
  /** role -> resolved agent (local role names, not namespaced ids). */
  players: Record<string, ResolvedAgent>;
}

export interface ComposedConfig {
  captainAgent: ResolvedAgent;
  /** The options object handed to createPlaybookCaptainShell. */
  captainOptions: {
    playbooks: Record<
      string,
      { from: string; command?: string; options: Record<string, unknown> }
    >;
  };
  /** Flat roster of namespaced `<id>-<role>` players, in config order. */
  players: ComposedPlayer[];
  initialVisible: string[];
  playbooks: ComposedPlaybook[];
  notifications?: unknown;
  theme?: unknown;
  layout?: Record<string, unknown>;
}

export type LoadModule = (specifier: string) => Promise<unknown>;

// ---------------------------------------------------------------------------
// Paths and seeding
// ---------------------------------------------------------------------------

export function resolveConfigPath(
  env: NodeJS.ProcessEnv = process.env,
  home: string = env.HOME ?? homedir(),
): string {
  const configHome = env.XDG_CONFIG_HOME || join(home, ".config");
  return join(configHome, "playbook", "playbook.config.yaml");
}

export function templatePath(): string {
  return fileURLToPath(
    new URL("../assets/playbook.config.template.yaml", import.meta.url),
  );
}

/**
 * Seed the shared config from the bundled starter when absent.
 * Returns true when a file was created; never overwrites (CORE-3).
 */
export function seedConfig(path: string): boolean {
  if (existsSync(path)) return false;
  mkdirSync(dirname(path), { recursive: true });
  copyFileSync(templatePath(), path, constants.COPYFILE_EXCL);
  return true;
}

// ---------------------------------------------------------------------------
// Agent resolution (launcher parity: resolveAgent)
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value)
  );
}

function validateAgentBlock(
  block: Record<string, unknown>,
  path: string,
): void {
  for (const key of Object.keys(block)) {
    if (!AGENT_FIELDS.has(key)) {
      throw new Error(`Unknown config field ${path}.${key}`);
    }
  }
  if (block.permissions !== undefined) {
    if (!isPlainObject(block.permissions)) {
      throw new Error(`${path}.permissions must be an object`);
    }
    for (const key of Object.keys(block.permissions)) {
      if (!PERMISSION_FIELDS.has(key)) {
        throw new Error(`Unknown config field ${path}.permissions.${key}`);
      }
    }
  }
  if (
    block.reasoningEffort !== undefined &&
    !REASONING_EFFORTS.has(String(block.reasoningEffort))
  ) {
    throw new Error(
      `${path}.reasoningEffort must be one of minimal, low, medium, high, xhigh, max`,
    );
  }
}

export function resolveAgent(
  value: unknown,
  profiles: Record<string, unknown>,
  path: string,
): Record<string, unknown> {
  if (typeof value === "string") {
    const profile = profiles[value];
    if (isPlainObject(profile)) return { ...profile };
    return { adapter: value };
  }
  if (isPlainObject(value)) {
    const { profile: profileRef, ...rest } = value;
    if (profileRef === undefined) return { ...rest };
    const base =
      typeof profileRef === "string" ? profiles[profileRef] : undefined;
    if (!isPlainObject(base)) {
      throw new Error(`${path}.profile must name a profiles entry`);
    }
    return { ...base, ...rest };
  }
  throw new Error(
    `${path} must be a profile id, an adapter shorthand, or an agent block`,
  );
}

function toResolvedAgent(
  block: Record<string, unknown>,
  path: string,
): ResolvedAgent {
  validateAgentBlock(block, path);
  const adapter = block.adapter;
  if (typeof adapter !== "string" || adapter.length === 0) {
    throw new Error(`${path} must resolve an adapter`);
  }
  if (!(KNOWN_ADAPTERS as readonly string[]).includes(adapter)) {
    throw new Error(
      `Unknown adapter "${adapter}" for ${path}. Valid adapters: ${KNOWN_ADAPTERS.join(", ")}`,
    );
  }
  return block as unknown as ResolvedAgent;
}

// ---------------------------------------------------------------------------
// Registry entry structural check (parity with shell/launcher)
// ---------------------------------------------------------------------------

export interface RegistryEntryLike {
  id: string;
  command: string;
  intent: string;
  requiredRoleIds: readonly string[];
  idleStateId: string;
  finalStateId: string;
  parkStateIds: readonly string[];
  validateOptions(captainOptions: unknown): unknown;
  createRuntime(options: unknown): unknown;
}

export function isValidRegistryEntry(
  value: unknown,
): value is RegistryEntryLike {
  if (!isPlainObject(value)) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    typeof entry.command === "string" &&
    typeof entry.intent === "string" &&
    typeof entry.idleStateId === "string" &&
    typeof entry.finalStateId === "string" &&
    Array.isArray(entry.requiredRoleIds) &&
    Array.isArray(entry.parkStateIds) &&
    typeof entry.validateOptions === "function" &&
    typeof entry.createRuntime === "function"
  );
}

// ---------------------------------------------------------------------------
// Composition (launcher parity: composeGenericConfig)
// ---------------------------------------------------------------------------

export async function composeConfig(
  top: unknown,
  loadModule: LoadModule = (specifier) => import(specifier),
): Promise<ComposedConfig> {
  if (!isPlainObject(top)) {
    throw new Error("config must be a YAML mapping");
  }

  const profiles = isPlainObject(top.profiles) ? top.profiles : {};
  for (const id of Object.keys(profiles)) {
    if (ADAPTER_SHORTHANDS.includes(id)) {
      throw new Error(
        `profiles.${id} collides with the "${id}" adapter shorthand`,
      );
    }
  }

  if (!isPlainObject(top.playbooks)) {
    throw new Error("playbooks must be an object");
  }
  const playbookBlocks = top.playbooks;
  if (Object.keys(playbookBlocks).length === 0) {
    throw new Error("playbooks must enable at least one playbook");
  }

  const captainBlock = resolveAgent(top.captain, profiles, "captain");
  if (
    typeof captainBlock.adapter !== "string" ||
    captainBlock.adapter.length === 0
  ) {
    throw new Error("captain must resolve an adapter");
  }
  const captainAgent = toResolvedAgent(captainBlock, "captain");

  const captainOptions: ComposedConfig["captainOptions"] = { playbooks: {} };
  const players: ComposedPlayer[] = [];
  const playbooks: ComposedPlaybook[] = [];
  const seenIds = new Set<string>();
  const seenCommands = new Set<string>();
  let initialVisible: string[] = [];

  for (const [id, blockValue] of Object.entries(playbookBlocks)) {
    if (!isPlainObject(blockValue)) {
      throw new Error(`playbooks.${id} must be an object`);
    }
    const block = blockValue;
    const from = block.from;
    if (typeof from !== "string" || from.length === 0) {
      throw new Error(`playbooks.${id}.from must be a module specifier`);
    }

    let moduleValue: unknown;
    try {
      moduleValue = await loadModule(from);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `playbooks.${id}.from "${from}" failed to import: ${message}`,
      );
    }
    const entry = (moduleValue as { default?: unknown } | undefined)?.default;
    if (!isValidRegistryEntry(entry)) {
      throw new Error(
        `playbooks.${id}.from "${from}" exposes no valid registry entry`,
      );
    }
    if (entry.id !== id) {
      throw new Error(
        `playbooks.${id} key must equal the module manifest id "${entry.id}"`,
      );
    }
    if (seenIds.has(entry.id)) {
      throw new Error(`duplicate playbook id "${entry.id}"`);
    }
    seenIds.add(entry.id);

    const commandOverride =
      typeof block.command === "string" && block.command.length > 0
        ? block.command
        : undefined;
    const command = commandOverride ?? entry.command;
    if (seenCommands.has(command)) {
      throw new Error(`duplicate effective command "${command}"`);
    }
    seenCommands.add(command);

    if (entry.requiredRoleIds.includes(RESERVED_CAPTAIN_ROLE_ID)) {
      throw new Error(
        `playbooks.${id} requires local role "captain", which is reserved for the tmux-play Captain`,
      );
    }

    if (!isPlainObject(block.players)) {
      throw new Error(`playbooks.${id}.players must be an object`);
    }
    const playerBlocks = block.players;
    if (RESERVED_CAPTAIN_ROLE_ID in playerBlocks) {
      throw new Error(
        `playbooks.${id}.players.captain binds local role "captain", which is reserved for the tmux-play Captain`,
      );
    }
    const roles = Object.keys(playerBlocks);
    if (roles.length === 0) {
      throw new Error(`playbooks.${id} resolves no visible local role`);
    }
    for (const required of entry.requiredRoleIds) {
      if (!(required in playerBlocks)) {
        throw new Error(
          `playbooks.${id} required role "${required}" has no players entry`,
        );
      }
    }

    const resolvedRolePlayers: Record<string, ResolvedAgent> = {};
    const generatedIds: string[] = [];
    for (const role of roles) {
      const path = `playbooks.${id}.players.${role}`;
      const resolved = resolveAgent(playerBlocks[role], profiles, path);
      if (
        typeof resolved.adapter !== "string" ||
        resolved.adapter.length === 0
      ) {
        throw new Error(`${path} must resolve an adapter`);
      }
      const agent = toResolvedAgent(resolved, path);
      resolvedRolePlayers[role] = agent;
      const hostId = `${id}-${role}`;
      players.push({ id: hostId, ...agent });
      generatedIds.push(hostId);
    }
    if (initialVisible.length === 0) initialVisible = generatedIds;

    const optionSlice: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(block)) {
      if (!PLAYBOOK_LAUNCHER_KEYS.includes(key)) optionSlice[key] = value;
    }
    captainOptions.playbooks[id] = {
      from,
      ...(commandOverride ? { command: commandOverride } : {}),
      options: optionSlice,
    };

    playbooks.push({
      id: entry.id,
      command,
      intent: entry.intent,
      requiredRoleIds: entry.requiredRoleIds,
      from,
      players: resolvedRolePlayers,
    });
  }

  return {
    captainAgent,
    captainOptions,
    players,
    initialVisible,
    playbooks,
    ...(top.notifications !== undefined
      ? { notifications: top.notifications }
      : {}),
    ...(top.theme !== undefined ? { theme: top.theme } : {}),
    ...(isPlainObject(top.layout) ? { layout: top.layout } : {}),
  };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export interface LoadedConfig {
  path: string;
  raw: unknown;
  composed: ComposedConfig;
}

export async function loadConfig(
  path: string,
  loadModule?: LoadModule,
): Promise<LoadedConfig> {
  const text = readFileSync(path, "utf8");
  const raw: unknown = parseYaml(text);
  const composed = await composeConfig(raw, loadModule);
  return { path, raw, composed };
}

export function summarizeConfig(loaded: LoadedConfig): ConfigSummary {
  const top = isPlainObject(loaded.raw) ? loaded.raw : {};
  const profiles = isPlainObject(top.profiles) ? top.profiles : {};
  return {
    path: loaded.path,
    profiles: Object.entries(profiles).flatMap(([id, value]) =>
      isPlainObject(value) && typeof value.adapter === "string"
        ? [
            {
              id,
              adapter: value.adapter as AdapterName,
              ...(typeof value.model === "string"
                ? { model: value.model }
                : {}),
              ...(typeof value.reasoningEffort === "string"
                ? { reasoningEffort: value.reasoningEffort }
                : {}),
            },
          ]
        : [],
    ),
    captain:
      typeof top.captain === "string"
        ? top.captain
        : loaded.composed.captainAgent.adapter,
    playbooks: loaded.composed.playbooks.map((playbook) => ({
      id: playbook.id,
      from: playbook.from,
      command: playbook.command,
      players: Object.fromEntries(
        Object.entries(playbook.players).map(([role, agent]) => [
          role,
          agent.model ?? agent.adapter,
        ]),
      ),
    })),
  };
}

// ---------------------------------------------------------------------------
// Readiness (launcher parity: checkReadiness)
// ---------------------------------------------------------------------------

export interface AdapterReadiness {
  adapter: AdapterName;
  ready: boolean | null;
  requirement?: string;
}

export function checkAdapterReadiness(
  adapter: AdapterName,
  env: NodeJS.ProcessEnv = process.env,
  home: string = env.HOME ?? homedir(),
): AdapterReadiness {
  if (adapter === "claude") {
    const ready =
      Boolean(env.ANTHROPIC_API_KEY) || existsSync(join(home, ".claude"));
    return ready
      ? { adapter, ready: true }
      : {
          adapter,
          ready: false,
          requirement:
            "set ANTHROPIC_API_KEY or sign in with Claude Code (creates ~/.claude)",
        };
  }
  if (adapter === "codex") {
    const ready =
      Boolean(env.OPENAI_API_KEY) || existsSync(join(home, ".codex"));
    return ready
      ? { adapter, ready: true }
      : {
          adapter,
          ready: false,
          requirement:
            "set OPENAI_API_KEY or sign in with the Codex CLI (creates ~/.codex)",
        };
  }
  return { adapter, ready: null };
}
