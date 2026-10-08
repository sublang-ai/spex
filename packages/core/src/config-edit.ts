// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Comment-preserving config editing (DR-004, SET-11/12): every
// operation is applied to a yaml Document (keeping comments, key
// order, and formatting), then the candidate is composed with the
// same fail-closed validation as loading — an edit the playbook
// launcher would reject never reaches the file.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseDocument, YAMLMap, isMap, isScalar } from "yaml";

import { composeConfig, validateProjectConfig, type LoadModule, type PlaybookModules } from "./config.js";
import { writeApplicationBytes } from "./app-storage.js";
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
  /** Composition error when the candidate failed validation. */
  error?: string;
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
  const text = readFileSync(path, "utf8");
  const candidate = applyConfigOp(text, op);
  try {
    const parsed = parseDocument(candidate).toJS() as unknown;
    await composeConfig(parsed, loadModule, path, options);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  writeApplicationBytes(path, candidate);
  return { ok: true };
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
  const text = existsSync(path) ? readFileSync(path, "utf8") : "";
  const candidate = applyConfigOp(text, op);
  try {
    const projectTop = parseDocument(candidate).toJS() as unknown;
    validateProjectConfig(projectTop, path);
    const ownTop = parseDocument(readFileSync(ownPath, "utf8")).toJS() as unknown;
    await composeConfig(ownTop, loadModule, ownPath, { modules, project: { top: projectTop, path } });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  // The config folder is made inside its spex repository's clone, never
  // the clone itself: a clone removed meanwhile stays removed (projects-10).
  const configDir = dirname(path);
  if (!existsSync(dirname(configDir))) {
    return {
      ok: false,
      error: i18n._({
        id: "the spex repository holding {path} is no longer on this device",
        values: { path },
        comment: "Refusal: a project's config write whose spex repository's clone was removed meanwhile",
      }),
    };
  }
  mkdirSync(configDir, { recursive: true });
  writeApplicationBytes(path, candidate);
  return { ok: true };
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
