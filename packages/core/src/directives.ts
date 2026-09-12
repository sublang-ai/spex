// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The authoring agent speaks to Spex through fenced ```spex YAML blocks
// in its reply (DR-058, playbook-library-66): `kind: compile` asks for
// a compile, `kind: register` proposes the registration. This module
// is free of Node-only imports so the UI may parse a reply the same way
// the core does when it draws the blocks as cards.

import { parse as parseYaml } from "yaml";
import { playerIdSchema } from "./protocol.js";

export interface RegisterDirective {
  command: string;
  intent: string;
  /** Role -> player id, as the agent proposed. */
  players: Record<string, string>;
}

export interface ParsedDirectives {
  /** The reply carried a valid compile block. */
  compile: boolean;
  /** The last valid register block, when any. */
  register?: RegisterDirective;
  /** The raw text of every spex block the core could not read. */
  malformed: string[];
  /** Every top-level spex block in order, valid or not. */
  blocks: { text: string; kind?: "compile" | "register"; malformed: boolean }[];
}

const FENCE_OPEN = /^(`{3,})([^`\s]*)\s*$/;
const FENCE_CLOSE = /^(`{3,})\s*$/;

/** Every top-level fenced block of `text`: info string and body. A
 * closing fence carries no info string, so a fence opened inside an
 * open fence is content (CommonMark), never a block of its own. */
export function topLevelFences(text: string): { info: string; body: string }[] {
  const out: { info: string; body: string }[] = [];
  let open: { ticks: number; info: string; lines: string[] } | undefined;
  for (const line of text.split(/\r?\n/)) {
    if (open) {
      const close = FENCE_CLOSE.exec(line);
      if (close && close[1].length >= open.ticks) {
        out.push({ info: open.info, body: open.lines.join("\n") });
        open = undefined;
      } else {
        open.lines.push(line);
      }
      continue;
    }
    const start = FENCE_OPEN.exec(line);
    if (start) open = { ticks: start[1].length, info: start[2], lines: [] };
  }
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBlock(body: string): { kind: "compile" } | { kind: "register"; directive: RegisterDirective } | undefined {
  let value: unknown;
  try {
    value = parseYaml(body);
  } catch {
    return undefined;
  }
  if (!isPlainObject(value)) return undefined;
  const keys = Object.keys(value);
  if (value.kind === "compile") {
    return keys.length === 1 ? { kind: "compile" } : undefined;
  }
  if (value.kind === "register") {
    const allowed = ["kind", "command", "intent", "players"];
    if (keys.length !== 4 || keys.some((key) => !allowed.includes(key))) return undefined;
    const { command, intent, players } = value;
    if (typeof command !== "string" || command.trim() === "") return undefined;
    if (typeof intent !== "string" || intent.trim() === "") return undefined;
    if (!isPlainObject(players)) return undefined;
    const mapped: Record<string, string> = {};
    for (const [role, playerId] of Object.entries(players)) {
      if (role.trim() === "" || !playerIdSchema.safeParse(playerId).success) return undefined;
      mapped[role] = playerId as string;
    }
    return { kind: "register", directive: { command: command.trim(), intent: intent.trim(), players: mapped } };
  }
  return undefined;
}

/**
 * Parse the directives of one reply (playbook-library-66): every
 * top-level ```spex fence as YAML with a `kind` key; the last valid
 * block per kind wins; a block missing a key, carrying an unknown key
 * or kind, or failing to parse is malformed and stays visible as code.
 */
export function parseDirectives(text: string): ParsedDirectives {
  const parsed: ParsedDirectives = { compile: false, malformed: [], blocks: [] };
  for (const fence of topLevelFences(text)) {
    if (fence.info !== "spex") continue;
    const read = readBlock(fence.body);
    if (!read) {
      parsed.malformed.push(fence.body);
      parsed.blocks.push({ text: fence.body, malformed: true });
      continue;
    }
    parsed.blocks.push({ text: fence.body, kind: read.kind, malformed: false });
    if (read.kind === "compile") parsed.compile = true;
    else parsed.register = read.directive;
  }
  return parsed;
}
