// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Comment-preserving config editing (DR-004, SET-11/12): every
// operation is applied to a yaml Document (keeping comments, key
// order, and formatting), then the candidate is composed with the
// same fail-closed validation as loading — an edit the playbook
// launcher would reject never reaches the file.

import { readFileSync, writeFileSync } from "node:fs";
import { parseDocument, YAMLMap } from "yaml";

import { composeConfig, type LoadModule } from "./config.js";

export interface AgentBlock {
  adapter: string;
  model?: string;
  effort?: string;
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
export type AgentPatch = Partial<AgentBlock>;

export type ConfigEditOp =
  | { kind: "captain.set"; patch: AgentPatch }
  | { kind: "notifications.set"; prefs: Record<string, string> }
  | { kind: "theme.set"; theme: string | null }
  | {
      kind: "playbook.player.set";
      playbookId: string;
      role: string;
      patch: AgentPatch;
    }
  | { kind: "playbook.option.set"; playbookId: string; key: string; value: unknown }
  | { kind: "playbook.delete"; playbookId: string }
  | {
      kind: "playbook.add";
      playbookId: string;
      from: string;
      players: Record<string, AgentBlock>;
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
      doc.setIn(
        [...basePath, key],
        typeof value === "object" && value !== null
          ? doc.createNode(value)
          : value,
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
    case "playbook.player.set": {
      patchAgent(
        ["playbooks", op.playbookId, "players", op.role],
        op.patch as Record<string, unknown>,
      );
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
      const players = Object.fromEntries(
        Object.entries(op.players).map(([role, block]) => [
          role,
          prune(block as unknown as Record<string, unknown>),
        ]),
      );
      const node = doc.createNode({
        from: op.from,
        players,
        ...(op.options ?? {}),
      }) as YAMLMap;
      doc.setIn(["playbooks", op.playbookId], node);
      break;
    }
  }
  return doc.toString();
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
): Promise<EditResult> {
  const text = readFileSync(path, "utf8");
  const candidate = applyConfigOp(text, op);
  try {
    const parsed = parseDocument(candidate).toJS() as unknown;
    await composeConfig(parsed, loadModule);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  writeFileSync(path, candidate);
  return { ok: true };
}
