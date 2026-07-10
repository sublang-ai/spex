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

export type ConfigEditOp =
  | {
      kind: "profile.save";
      id: string;
      profile: {
        adapter: string;
        model?: string;
        reasoningEffort?: string;
        permissions?: {
          mode?: string;
          writablePaths?: string[];
        };
      };
    }
  | { kind: "profile.delete"; id: string }
  | { kind: "captain.set"; ref: string }
  | { kind: "notifications.set"; prefs: Record<string, string> }
  | { kind: "theme.set"; theme: string | null }
  | { kind: "playbook.player.set"; playbookId: string; role: string; ref: string }
  | { kind: "playbook.option.set"; playbookId: string; key: string; value: unknown }
  | { kind: "playbook.delete"; playbookId: string }
  | {
      kind: "playbook.add";
      playbookId: string;
      from: string;
      players: Record<string, string>;
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

  switch (op.kind) {
    case "profile.save": {
      doc.setIn(["profiles", op.id], doc.createNode(prune(op.profile)));
      break;
    }
    case "profile.delete": {
      doc.deleteIn(["profiles", op.id]);
      break;
    }
    case "captain.set": {
      doc.setIn(["captain"], op.ref);
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
      doc.setIn(["playbooks", op.playbookId, "players", op.role], op.ref);
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
      const node = doc.createNode({
        from: op.from,
        players: op.players,
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

/** Guard for profile deletion: refuse while the profile is referenced. */
export function profileReferences(text: string, profileId: string): string[] {
  const doc = parseDocument(text);
  const top = doc.toJS() as {
    captain?: unknown;
    playbooks?: Record<string, { players?: Record<string, unknown> }>;
  } | null;
  const references: string[] = [];
  if (top?.captain === profileId) references.push("captain");
  for (const [playbookId, block] of Object.entries(top?.playbooks ?? {})) {
    for (const [role, ref] of Object.entries(block?.players ?? {})) {
      if (ref === profileId) references.push(`playbooks.${playbookId}.players.${role}`);
    }
  }
  return references;
}
