// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Shared playbook config: location, seeding, validation, and
// composition into runtime options. Validation and composition keep
// behavioral parity with the playbook launcher (DR-004, CORE-16): any
// config the launcher accepts or rejects is treated identically here,
// with the same error messages wherever the rule exists upstream.

import { constants, copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";
import {
  AGENT_RUNTIME_TARGETS,
  classifyRuntime,
  describeRuntimeReadiness,
  isEffortSupported,
  readRuntimeVersion,
  supportedEffortValues,
} from "@sublang/cligent";
import { KNOWN_PLAYER_ADAPTERS } from "@sublang/cligent/tmux-play";
import { migrateConfigFileIfRetired } from "./config-migrate.js";

import type {
  AdapterName,
  AgentSummary,
  ConfigSummary,
} from "./protocol.js";

export const PLAYBOOK_CAPTAIN_MODULE = "@sublang/playbook/playbook-captain";

/** Marker export stamped into Spex-generated registry bundles
 * (DR-014); composition refuses file-path registries without it. */
export const REGISTRY_CONTRACT = 2;

// The adapter set is the embedded runtime's own (DR-019): an id
// outside it cannot start a session, so composition rejects it with
// the runtime's wording. Scalars are adapter shorthands normalizing
// to bare-adapter blocks; Spex itself writes only inline blocks.
const KNOWN_ADAPTERS = KNOWN_PLAYER_ADAPTERS;
const PLAYBOOK_LAUNCHER_KEYS = ["from", "command", "players"];
const RESERVED_CAPTAIN_ROLE_ID = "captain";

const AGENT_FIELDS = new Set([
  "adapter",
  "model",
  "instruction",
  "permissions",
  "effort",
  // Read-only legacy alias for `effort` (cligent 0.14 rename, DR-014);
  // composition normalizes it and Spex never writes it back.
  "reasoningEffort",
]);
const PERMISSION_FIELDS = new Set([
  "mode",
  "fileWrite",
  "shellExecute",
  "networkAccess",
  "writablePaths",
]);


export interface PermissionPolicyLike {
  mode?: "auto" | "bypass";
  fileWrite?: "allow" | "ask" | "deny";
  shellExecute?: "allow" | "ask" | "deny";
  networkAccess?: "allow" | "ask" | "deny";
  writablePaths?: string[];
}

export interface ResolvedAgent {
  adapter: AdapterName;
  model?: string;
  instruction?: string;
  permissions?: PermissionPolicyLike;
  /** Adapter-scoped vocabulary; validated during composition. */
  effort?: string;
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
  /** True when the entry takes a `cwd` option the config leaves
   * unset, so sessions may inject the project path (DR-014). */
  acceptsCwdOption: boolean;
}

export interface ComposedConfig {
  captainAgent: ResolvedAgent;
  /** The options object handed to createPlaybookCaptainShell. */
  captainOptions: {
    playbooks: Record<
      string,
      { from: string; command?: string; options: Record<string, unknown> }
    >;
    /** The Captain's adapter, so the shell picks provider-level vs
     * prompt-level control-call tool restriction (DR-019). */
    captainAdapter: string;
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

/**
 * Resolve a registry specifier to its file path, honoring the same
 * SPEX_MODULE_PATHS fallback as createModuleLoader. Absolute paths
 * and file URLs pass through; bare specifiers resolve from Spex's
 * dependencies first, then from configured checkouts.
 */
export function resolveModulePath(
  specifier: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (specifier.startsWith("file:")) return fileURLToPath(specifier);
  if (specifier.startsWith("/") || /^[A-Za-z]:[\\/]/.test(specifier)) {
    return specifier;
  }
  const dirs = [
    dirname(fileURLToPath(import.meta.url)),
    ...(env.SPEX_MODULE_PATHS ?? "")
      .split(":")
      .map((entry) => entry.trim())
      .filter(Boolean),
  ];
  for (const dir of dirs) {
    try {
      const requireFrom = createRequire(join(dir, "__spex_resolve__.js"));
      return requireFrom.resolve(specifier);
    } catch {
      // Try the next base.
    }
  }
  return undefined;
}

/**
 * Module loader with local-checkout fallback: when a bare specifier
 * fails to resolve from Spex's own dependencies (e.g. a registry
 * subpath that exists only in an unpublished build), try resolving
 * from each directory in SPEX_MODULE_PATHS (colon-separated package
 * checkouts; package self-reference resolves their exports).
 */
export function createModuleLoader(
  env: NodeJS.ProcessEnv = process.env,
): LoadModule {
  const extraDirs = (env.SPEX_MODULE_PATHS ?? "")
    .split(":")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return async (specifier: string): Promise<unknown> => {
    try {
      return await import(specifier);
    } catch (error) {
      for (const dir of extraDirs) {
        try {
          const requireFrom = createRequire(join(dir, "__spex_resolve__.js"));
          const resolved = requireFrom.resolve(specifier);
          return await import(pathToFileURL(resolved).href);
        } catch {
          // Try the next configured checkout.
        }
      }
      throw error;
    }
  };
}

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
    const permissions = block.permissions;
    for (const key of Object.keys(permissions)) {
      if (!PERMISSION_FIELDS.has(key)) {
        throw new Error(`Unknown config field ${path}.permissions.${key}`);
      }
    }
    if (
      permissions.mode !== undefined &&
      permissions.mode !== "auto" &&
      permissions.mode !== "bypass"
    ) {
      throw new Error(`${path}.permissions.mode must be auto or bypass`);
    }
    for (const policy of ["fileWrite", "shellExecute", "networkAccess"]) {
      const value = permissions[policy];
      if (value !== undefined && !["allow", "ask", "deny"].includes(String(value))) {
        throw new Error(
          `${path}.permissions.${policy} must be allow, ask, or deny`,
        );
      }
    }
    if (
      permissions.writablePaths !== undefined &&
      (!Array.isArray(permissions.writablePaths) ||
        permissions.writablePaths.some((p) => typeof p !== "string"))
    ) {
      throw new Error(`${path}.permissions.writablePaths must be a string list`);
    }
  }
  if (block.effort !== undefined && block.reasoningEffort !== undefined) {
    throw new Error(
      `${path} must not set both effort and its legacy alias reasoningEffort`,
    );
  }
  // Effort values are validated adapter-scoped in toResolvedAgent,
  // once the adapter is known (DR-019).
}

/**
 * True when a config reference string acts as an adapter shorthand
 * (launcher parity: a scalar agent value is an adapter shorthand,
 * accepted only for the embedded runtime's adapters).
 */
export function isKnownAdapter(value: string): value is AdapterName {
  return (KNOWN_ADAPTERS as readonly string[]).includes(value);
}

export function resolveAgent(
  value: unknown,
  path: string,
): Record<string, unknown> {
  if (typeof value === "string") {
    // A scalar is an adapter shorthand, normalizing to a bare-adapter
    // block (the launcher reads it the same way).
    return { adapter: value };
  }
  if (isPlainObject(value)) {
    if ("profile" in value) {
      // Retired with the profiles model (playbook 3.0); the load path
      // migrates old files, so a survivor here is a hand-typed edit.
      throw new Error(
        `${path}.profile is retired: agents carry their own adapter, model, effort, and permissions`,
      );
    }
    return { ...value };
  }
  throw new Error(
    `${path} must be an adapter shorthand or an agent block`,
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
  const { reasoningEffort, ...rest } = block;
  if (reasoningEffort !== undefined) rest.effort = reasoningEffort;
  if (rest.effort !== undefined) {
    // Adapter-scoped vocabularies (DR-019): Claude adds ultracode,
    // Codex adds ultra, Kimi accepts only off/on. cligent owns the
    // sets; a value it refuses would otherwise fail mid-turn.
    const effort = String(rest.effort);
    if (!isEffortSupported(adapter as never, effort as never)) {
      const values = (supportedEffortValues(adapter as never) ?? []).join(
        ", ",
      );
      throw new Error(
        `${path}.effort "${effort}" is not supported by the "${adapter}" adapter (valid: ${values})`,
      );
    }
  }
  return rest as unknown as ResolvedAgent;
}

// ---------------------------------------------------------------------------
// Registry entry structural check (parity with shell/launcher)
// ---------------------------------------------------------------------------

// The load contract mirrors the Playbook Captain shell's own
// `isValidRegistryEntry` (playbook-captain: PlaybookCaptainRegistryEntry):
// id, command, intent, requiredRoleIds, validateOptions, createRuntime,
// with an optional summaryPolicy. State ids (idle/final/park) are NOT part
// of the shell's load contract — the shell derives park/idle/final from
// runtime state tags (`playbook.parked`, quiescence), not per-entry fields.
// Requiring them here rejected the real `@sublang/playbook/code/registry`
// entry, which carries none. Spex's own compiler still derives state ids for
// its introspection preview (PBLIB-13), but they are optional metadata, not a
// gate.
export interface RegistryEntryLike {
  id: string;
  command: string;
  intent: string;
  requiredRoleIds: readonly string[];
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
    Array.isArray(entry.requiredRoleIds) &&
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

  if (top.profiles !== undefined) {
    // The load path migrates profiles-era files (DR-019); a map
    // arriving here came through an edit or a raw compose.
    throw new Error(
      "profiles is retired (playbook 3.0): agents carry their settings inline",
    );
  }

  if (!isPlainObject(top.playbooks)) {
    throw new Error("playbooks must be an object");
  }
  const playbookBlocks = top.playbooks;
  if (Object.keys(playbookBlocks).length === 0) {
    throw new Error("playbooks must enable at least one playbook");
  }

  const captainBlock = resolveAgent(top.captain, "captain");
  if (
    typeof captainBlock.adapter !== "string" ||
    captainBlock.adapter.length === 0
  ) {
    throw new Error("captain must resolve an adapter");
  }
  const captainAgent = toResolvedAgent(captainBlock, "captain");

  // The Captain shell restricts control-call tools per the captain's
  // adapter (playbook 3.0, DR-019): without this field it fail-closes
  // to an empty allowlist, which the Codex adapter rejects outright.
  const captainOptions: ComposedConfig["captainOptions"] = {
    playbooks: {},
    captainAdapter: captainAgent.adapter,
  };
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
    // File-path registries are Spex-generated bundles; one without the
    // DR-014 contract marker predates the playbook 2.0 runtime and
    // would fail mid-turn — refuse it at load with recompile guidance.
    // Package-specifier registries ship with their runtime and are
    // exempt.
    if (
      isAbsolute(from) &&
      (moduleValue as { spexRegistryContract?: unknown }).spexRegistryContract !==
        REGISTRY_CONTRACT
    ) {
      throw new Error(
        `playbooks.${id}.from "${from}" was generated by an older Spex toolchain; recompile "${id}" in the Playbooks surface to re-enable it`,
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
      const resolved = resolveAgent(playerBlocks[role], path);
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
    // Launcher parity: the default visible set is every player across
    // all playbooks (cligent resolveLayoutConfig); the previous
    // first-playbook-only assignment was a single-playbook latent bug.
    initialVisible.push(...generatedIds);

    const optionSlice: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(block)) {
      if (!PLAYBOOK_LAUNCHER_KEYS.includes(key)) optionSlice[key] = value;
    }
    // Probe whether the entry accepts a `cwd` option (DR-014): script
    // gears default to the host process cwd, so sessions inject the
    // project path for entries that take it and configs that leave it
    // unset. validateOptions is fail-closed, making the probe safe.
    let acceptsCwdOption = false;
    if (optionSlice.cwd === undefined) {
      try {
        entry.validateOptions({ ...optionSlice, cwd: "/" });
        acceptsCwdOption = true;
      } catch {
        acceptsCwdOption = false;
      }
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
      acceptsCwdOption,
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
  // A profiles-era file migrates in place first (DR-019, launcher
  // parity): the shared config composes whichever host loads it, and
  // whichever migrates first wins — the other's pass no-ops. The
  // watcher reload triggered by our own write re-reads the already-
  // migrated file harmlessly. The unresolvable-`profile` case throws
  // with edit-by-hand guidance and leaves the file untouched, which
  // surfaces as an invalid config.
  const migration = migrateConfigFileIfRetired(path);
  if (migration.migrated) {
    process.stderr.write(
      `spex: migrated ${path} to inline agent settings ` +
        `(the top-level "profiles" map was removed in playbook 3.0.0); ` +
        `the original is at ${migration.backupPath}\n`,
    );
  }
  const text = readFileSync(path, "utf8");
  const raw: unknown = parseYaml(text);
  const composed = await composeConfig(raw, loadModule);
  return { path, raw, composed };
}

export function summarizeConfig(loaded: LoadedConfig): ConfigSummary {
  const top = isPlainObject(loaded.raw) ? loaded.raw : {};
  const agentSummary = (agent: ResolvedAgent): AgentSummary => ({
    adapter: agent.adapter,
    ...(agent.model !== undefined ? { model: agent.model } : {}),
    ...(agent.effort !== undefined ? { effort: agent.effort } : {}),
    ...(agent.instruction !== undefined
      ? { instruction: agent.instruction }
      : {}),
    ...(agent.permissions !== undefined
      ? { permissions: agent.permissions as AgentSummary["permissions"] }
      : {}),
  });
  return {
    path: loaded.path,
    captain: agentSummary(loaded.composed.captainAgent),
    playbooks: loaded.composed.playbooks.map((playbook) => ({
      id: playbook.id,
      from: playbook.from,
      command: playbook.command,
      intent: playbook.intent,
      players: Object.fromEntries(
        Object.entries(playbook.players).map(([role, agent]) => [
          role,
          {
            agent: agentSummary(agent),
            display: agent.model ?? agent.adapter,
          },
        ]),
      ),
    })),
    ...(isPlainObject(top.notifications)
      ? { notifications: top.notifications as Record<string, string> }
      : {}),
    ...(typeof top.theme === "string" ? { theme: top.theme } : {}),
  };
}

// ---------------------------------------------------------------------------
// Readiness (launcher parity: runtime half + credential half, DR-024)
// ---------------------------------------------------------------------------

export interface AdapterReadiness {
  adapter: AdapterName;
  ready: boolean | null;
  requirement?: string;
}

/** The runtime half of readiness: usable, or a requirement naming why not. */
export interface AdapterRuntimeCheck {
  usable: boolean;
  requirement?: string;
}

// DR-024: readiness owns no version literal. cligent publishes each
// adapter's runtime targets and enforces their floors at load; readiness
// reads the same targets, so a missing or below-floor runtime is reported
// before a session start would fail on it, with cligent's own verdict
// wording and its pinned install command. `untested` and `unknown` stay
// usable — the load gate itself fails open on both.
export function checkAdapterRuntime(adapter: AdapterName): AdapterRuntimeCheck {
  const faults: string[] = [];
  for (const target of AGENT_RUNTIME_TARGETS[adapter] ?? []) {
    const installed = readRuntimeVersion(target);
    const verdict = classifyRuntime(target, installed !== undefined, installed);
    if (verdict.state === "missing" || verdict.state === "unsupported") {
      faults.push(
        `${describeRuntimeReadiness(verdict)} — install with: npm install -g ${verdict.repair.spec}`,
      );
    }
  }
  return faults.length > 0
    ? { usable: false, requirement: faults.join("; ") }
    : { usable: true };
}

export function checkAdapterReadiness(
  adapter: AdapterName,
  env: NodeJS.ProcessEnv = process.env,
  home: string = env.HOME ?? homedir(),
  // Injectable so tests need neither installed SDKs nor CLIs on PATH.
  runtime: (adapter: AdapterName) => AdapterRuntimeCheck = checkAdapterRuntime,
): AdapterReadiness {
  // Both halves are evaluated so an adapter missing both reports both —
  // reporting one at a time sends the user round the loop twice.
  const faults: string[] = [];
  const runtimeCheck = runtime(adapter);
  if (!runtimeCheck.usable && runtimeCheck.requirement) {
    faults.push(runtimeCheck.requirement);
  }
  let credentialReady: boolean | null = null;
  if (adapter === "claude") {
    credentialReady =
      Boolean(env.ANTHROPIC_API_KEY) || existsSync(join(home, ".claude"));
    if (!credentialReady) {
      faults.push(
        "set ANTHROPIC_API_KEY or sign in with Claude Code (creates ~/.claude)",
      );
    }
  } else if (adapter === "codex") {
    credentialReady =
      Boolean(env.OPENAI_API_KEY) || existsSync(join(home, ".codex"));
    if (!credentialReady) {
      faults.push(
        "set OPENAI_API_KEY or sign in with the Codex CLI (creates ~/.codex)",
      );
    }
  }
  if (faults.length > 0) {
    return { adapter, ready: false, requirement: faults.join("; ") };
  }
  // The null class survives only over a usable runtime (settings-14): no
  // credential rule exists, so the UI shows verify-yourself guidance.
  return { adapter, ready: credentialReady === null ? null : true };
}
