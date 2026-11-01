// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Comment-preserving config editing (DR-004, SET-11/12): every
// operation is applied to a yaml Document (keeping comments, key
// order, and formatting), then the candidate is composed with the
// same fail-closed validation as loading — an edit the playbook
// launcher would reject never reaches the file — and written under the
// version of the bytes it was applied to, so a file changed during the
// composition is refused as a conflict, never overwritten (DR-111).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseDocument, YAMLMap, isMap, isScalar } from "yaml";

import { composeConfig, validateProjectConfig, type LoadModule, type PlaybookModules } from "./config.js";
import { readVersioned, VersionConflictError, writeVersionedBytes, type FileVersion } from "@sublang/spex/files";
import { i18n } from "./i18n.js";

export interface AgentBlock {
  adapter: string;
  model?: string;
  /** The model the agent's subagents run on (DR-093): a model,
   * `inherit` for the agent's own, or `false` for none (DR-095). */
  subagentModel?: string | false;
  /** The effort every subagent runs at (DR-095). */
  subagentEffort?: string;
  effort?: string;
  fastMode?: boolean;
  browser?: boolean;
  instruction?: string;
  permissions?: {
    mode?: string;
    fileWrite?: string;
    shellExecute?: string;
    networkAccess?: string;
    writablePaths?: string[];
  };
}

/** Merge patch over an existing agent block (DR-019): provided keys
 * change, absent keys — including hand-written ones — survive. */
export type AgentPatch = {
  adapter?: string;
  model?: string | null;
  /** A string or `false` writes the key; null removes it (DR-095). */
  subagentModel?: string | false | null;
  subagentEffort?: string | null;
  effort?: string | null;
  /** `true`/`false` write the key; null removes it (DR-038). */
  fastMode?: boolean | null;
  browser?: boolean | null;
  instruction?: string | null;
  permissions?: AgentBlock["permissions"] | null;
};

export type ConfigEditOp =
  | { kind: "captain.set"; patch: AgentPatch }
  | { kind: "notifications.set"; prefs: Record<string, string> }
  | { kind: "theme.set"; theme: string | null }
  /** Edit a session player's envelope: identity and defaults. */
  | { kind: "player.set"; playerId: string; patch: AgentPatch }
  | { kind: "player.delete"; playerId: string }
  /** Bind a role to a player, with that role's own tuning. Adapter and
   * permissions are the player's and are not settable here (DR-032). */
  | {
      kind: "playbook.role.bind";
      playbookId: string;
      role: string;
      playerId: string;
      model?: string | false | null;
      subagentModel?: string | false | null;
      effort?: string | false | null;
      subagentEffort?: string | false | null;
      /** Omitted preserves the override; null inherits; false disables. */
      fastMode?: boolean | null;
    }
  | { kind: "playbook.option.set"; playbookId: string; key: string; value: unknown }
  | { kind: "playbook.delete"; playbookId: string }
  | {
      kind: "playbook.add";
      playbookId: string;
      /** Retired (DR-104): a module comes from the environment, so a
       * client's `from` is ignored and never written. */
      from?: string;
      roles: Record<string, string>;
      options?: Record<string, unknown>;
    };

function prune(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  );
}

/** Apply one operation to the YAML text; returns the new text. */
export function applyConfigOp(text: string, op: ConfigEditOp): string {
  const doc = parseDocument(text);
  if (doc.contents === null) {
    // Empty file: start a fresh mapping.
    doc.contents = doc.createNode({}) as unknown as typeof doc.contents;
  }

  const patchAgent = (
    basePath: (string | number)[],
    patch: Record<string, unknown>,
  ): void => {
    // A scalar shorthand becomes a block on first edit (DR-019): seed
    // the block with its adapter, then merge the patch — provided
    // keys change, hand-written ones survive.
    const current = doc.getIn(basePath);
    if (typeof current === "string") {
      doc.setIn(basePath, doc.createNode({ adapter: current }));
    } else if (current === undefined) {
      doc.setIn(basePath, doc.createNode({}));
    }
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      if (value === null) {
        // An explicit null unsets the key, so a pinned model or
        // effort can return to the adapter's default (DR-019).
        doc.deleteIn([...basePath, key]);
        continue;
      }
      doc.setIn(
        [...basePath, key],
        typeof value === "object" ? doc.createNode(value) : value,
      );
    }
    // Canonicalize on write (DR-014): setting effort retires the
    // legacy alias so the block never carries both keys.
    if (patch.effort !== undefined) {
      doc.deleteIn([...basePath, "reasoningEffort"]);
    }
    // The retired profiles indirection never survives an edit (DR-019).
    doc.deleteIn([...basePath, "profile"]);
  };

  switch (op.kind) {
    case "captain.set": {
      patchAgent(["captain"], op.patch as Record<string, unknown>);
      break;
    }
    case "notifications.set": {
      doc.setIn(["notifications"], doc.createNode(op.prefs));
      break;
    }
    case "theme.set": {
      if (op.theme === null) doc.deleteIn(["theme"]);
      else doc.setIn(["theme"], op.theme);
      break;
    }
    case "player.set": {
      patchAgent(["players", op.playerId], op.patch as Record<string, unknown>);
      break;
    }
    case "player.delete": {
      doc.deleteIn(["players", op.playerId]);
      break;
    }
    case "playbook.role.bind": {
      const path = ["playbooks", op.playbookId, "roles", op.role];
      const existing = doc.getIn(path, true);
      const keys = ["model", "subagentModel", "effort", "subagentEffort", "fastMode"] as const;
      if (!isMap(existing)) {
        if (!keys.some((key) => op[key] !== undefined && op[key] !== null)) {
          doc.setIn(path, op.playerId);
          break;
        }
        const block = doc.createNode({ player: op.playerId });
        if (isScalar(existing)) {
          block.commentBefore = existing.commentBefore;
          block.comment = existing.comment;
        }
        doc.setIn(path, block);
      }
      // Patch the existing node: rebuilding it loses omitted overrides
      // and comments, and can silently erase a key validation should reject.
      doc.setIn([...path, "player"], op.playerId);
      for (const key of keys) {
        const value = op[key];
        if (value === undefined) continue;
        if (value === null) doc.deleteIn([...path, key]);
        else doc.setIn([...path, key], value);
      }
      break;
    }
    case "playbook.option.set": {
      if (op.value === null || op.value === undefined) {
        doc.deleteIn(["playbooks", op.playbookId, op.key]);
      } else {
        doc.setIn(
          ["playbooks", op.playbookId, op.key],
          doc.createNode(op.value),
        );
      }
      break;
    }
    case "playbook.delete": {
      doc.deleteIn(["playbooks", op.playbookId]);
      break;
    }
    case "playbook.add": {
      // Enabling a playbook binds its roles to existing lanes; the
      // players themselves are edited in their own map (DR-032).
      // No `from`: the module comes from the environment that installs
      // the playbook's spec package (environments-9, core-service-2).
      const node = doc.createNode({
        roles: { ...op.roles },
        ...(op.options ?? {}),
      }) as YAMLMap;
      doc.setIn(["playbooks", op.playbookId], node);
      break;
    }
  }
  return doc.toString({ flowCollectionPadding: false });
}

export interface EditResult {
  ok: boolean;
  /** Composition error when the candidate failed validation, or the
   * conflict's words. */
  error?: string;
  /** The file changed between the read and the write: nothing was
   * written, and the caller reads again and retries. */
  conflict?: boolean;
}

/** Write a candidate under the version it was applied to (DR-111). */
function writeCandidate(path: string, candidate: string, version: FileVersion): EditResult {
  try {
    writeVersionedBytes(path, candidate, version);
  } catch (error) {
    if (error instanceof VersionConflictError) return { ok: false, conflict: true, error: error.message };
    throw error;
  }
  return { ok: true };
}

/**
 * Apply an operation to the config file: validate the candidate via
 * composition first; only write when it passes (SET-3).
 */
export async function editConfigFile(
  path: string,
  op: ConfigEditOp,
  loadModule?: LoadModule,
  options: { modules?: PlaybookModules } = {},
): Promise<EditResult> {
  const { bytes, version } = readVersioned(path);
  if (bytes === null) return { ok: false, conflict: true, error: new VersionConflictError(path).message };
  const candidate = applyConfigOp(bytes.toString("utf8"), op);
  try {
    const parsed = parseDocument(candidate).toJS() as unknown;
    await composeConfig(parsed, loadModule, path, options);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  return writeCandidate(path, candidate, version);
}

/** The operations a `config.batch` takes (core-service-44). */
export type ConfigBatchOp = Extract<ConfigEditOp, { kind: "captain.set" | "player.set" | "playbook.role.bind" }>;

/** One violation of a batch as a whole: its rule, the field it names
 * where it names one, and every operation touching what it covers —
 * operations valid one by one can violate a rule together. */
export interface BatchViolation {
  rule: string;
  field?: string;
  message: string;
  ops: number[];
}

export interface BatchResult extends EditResult {
  violations?: BatchViolation[];
}

/** A config path a composition error names, in whichever language its
 * words are: the paths themselves are the file's own. */
const FIELD_PATTERN = /\b(?:captain|players|playbooks)(?:\.[A-Za-z0-9_[\]-]+)*/;

/** The rule a composition error violates, as core-service-16's table
 * names the rules, read from the field it names. */
function ruleOf(field: string | undefined, message: string): string {
  const last = field?.split(".").at(-1) ?? "";
  if (last === "subagentEffort") return "subagent-effort";
  if (last === "subagentModel") return "delegation";
  if (last === "effort" || last === "reasoningEffort") return "effort";
  if (last === "model" || last === "fastMode") return "tuning";
  if (last === "adapter" || /adapter/.test(field ?? "")) return "adapter";
  if (field?.includes(".permissions")) return "writable-paths";
  if (field?.includes(".roles")) return "bindings";
  if (/concurrent/i.test(message)) return "concurrency";
  if (field?.startsWith("players")) return "roster";
  return "config";
}

/** The fields an operation touches: the block it edits and, through a
 * player it edits, every binding naming that player — whose tuning is
 * read against the player's (core-service-16). */
function touched(op: ConfigBatchOp, top: unknown): string[] {
  if (op.kind === "captain.set") return ["captain"];
  if (op.kind === "playbook.role.bind") return [`playbooks.${op.playbookId}.roles.${op.role}`];
  const fields = [`players.${op.playerId}`];
  const playbooks = (top as { playbooks?: Record<string, { roles?: Record<string, unknown> } | null> } | null)?.playbooks ?? {};
  for (const [id, entry] of Object.entries(playbooks)) {
    for (const [role, binding] of Object.entries(entry?.roles ?? {})) {
      const player = typeof binding === "string" ? binding : (binding as { player?: unknown } | null)?.player;
      if (player === op.playerId) fields.push(`playbooks.${id}.roles.${role}`);
    }
  }
  return fields;
}

function violationOf(message: string, ops: readonly ConfigBatchOp[], top: unknown): BatchViolation {
  const field = FIELD_PATTERN.exec(message)?.[0];
  const related = (path: string): boolean => field !== undefined
    && (field === path || field.startsWith(`${path}.`) || path.startsWith(`${field}.`));
  return {
    rule: ruleOf(field, message),
    ...(field !== undefined ? { field } : {}),
    message,
    ops: ops.flatMap((op, index) => (touched(op, top).some(related) ? [index] : [])),
  };
}

/**
 * Apply a batch to your own group's file all or none (core-service-44):
 * refused as a conflict where the file no longer stands at `revision`,
 * the operations applied in order and the result validated once, as a
 * whole, then written under the version read — a file changed
 * meanwhile is a conflict too (DR-111).
 */
export async function editConfigBatch(
  path: string,
  ops: readonly ConfigBatchOp[],
  revision: string,
  loadModule?: LoadModule,
  options: { modules?: PlaybookModules } = {},
): Promise<BatchResult> {
  const { bytes, version } = readVersioned(path);
  if (bytes === null || version !== revision) return { ok: false, conflict: true, error: new VersionConflictError(path).message };
  let candidate = bytes.toString("utf8");
  for (const op of ops) candidate = applyConfigOp(candidate, op);
  let top: unknown;
  try {
    top = parseDocument(candidate).toJS() as unknown;
    await composeConfig(top, loadModule, path, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message, violations: [violationOf(message, ops, top)] };
  }
  return writeCandidate(path, candidate, version);
}

/** The operations a project's or another group's file takes: only its
 * playbook entries, each naming its roles' players (core-service-2). */
const PROJECT_OPS = new Set<ConfigEditOp["kind"]>(["playbook.add", "playbook.delete", "playbook.role.bind", "playbook.option.set"]);

/**
 * Edit a project's or another group's config file (playbook-library-3,
 * playbook-library-16): the operation applied comment-preservingly, the
 * candidate checked as a project's file and composed on top of your own
 * group's, written only when both pass. A missing file starts empty.
 */
export async function editProjectConfigFile(
  path: string,
  ownPath: string,
  op: ConfigEditOp,
  loadModule: LoadModule | undefined,
  modules: PlaybookModules,
  context: { cwd?: string; assertCurrent?: () => void } = {},
): Promise<EditResult> {
  if (!PROJECT_OPS.has(op.kind)) {
    return {
      ok: false,
      error: i18n._({
        id: "a project's settings name only the playbooks they enable and the player each role uses; edit the rest in your own settings",
        comment: "Refusal: an edit to a project's config file that only your own group's file may take",
      }),
    };
  }
  const { bytes, version } = readVersioned(path);
  const candidate = applyConfigOp(bytes === null ? "" : bytes.toString("utf8"), op);
  let failure: { error: unknown } | undefined;
  try {
    const projectTop = parseDocument(candidate).toJS() as unknown;
    validateProjectConfig(projectTop, path);
    const ownTop = parseDocument(readFileSync(ownPath, "utf8")).toJS() as unknown;
    await composeConfig(ownTop, loadModule, ownPath, { modules, project: { top: projectTop, path }, cwd: context.cwd });
  } catch (error) { failure = { error }; }
  // A changed pairing invalidates a failed validation too. No await
  // separates this check from publication of a successful candidate.
  try { context.assertCurrent?.(); }
  catch (error) { failure = { error }; }
  if (failure) {
    const { error } = failure;
    return { ok: false, ...(error instanceof VersionConflictError ? { conflict: true } : {}), error: error instanceof Error ? error.message : String(error) };
  }
  // The file's folder is made inside its clone, never the clone itself.
  if (!existsSync(dirname(path))) {
    try { mkdirSync(dirname(path)); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ok: false, conflict: true, error: new VersionConflictError(path).message };
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  return writeCandidate(path, candidate, version);
}

/**
 * The one-time library relocation's config half (CORE-64, DR-036):
 * every `playbooks.<id>.from` path inside the legacy library prefix
 * moves to the new one, comments and formatting kept. A mechanical
 * migration edit, like the profiles migration before it: it does not
 * fail closed on unrelated config invalidity.
 */
export function rewriteLibraryPaths(
  configPath: string,
  fromPrefix: string,
  toPrefix: string,
): void {
  if (!existsSync(configPath)) return;
  const doc = parseDocument(readFileSync(configPath, "utf8"));
  const playbooks = doc.get("playbooks");
  if (!isMap(playbooks)) return;
  let changed = false;
  for (const item of playbooks.items) {
    const entry = item.value;
    if (!isMap(entry)) continue;
    const from = entry.get("from", true);
    if (!isScalar(from) || typeof from.value !== "string") continue;
    if (!from.value.startsWith(fromPrefix)) continue;
    from.value = toPrefix + from.value.slice(fromPrefix.length);
    changed = true;
  }
  if (changed) writeFileSync(configPath, doc.toString({ flowCollectionPadding: false }));
}
