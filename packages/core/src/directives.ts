// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The authoring agent speaks to Spex through fenced ```spex YAML blocks
// in its reply (DR-058, playbook-library-66): `kind: compile` asks for
// a compile, `kind: register` proposes the registration. The core acts
// on a reply through `parseDirectives`; the thread draws the same reply
// through `splitDirectives` (playbook-library-53), so a block the core
// refuses is exactly the block the pane shows as code with a caption,
// and a card never promises an act the core did not take. This module
// is free of Node-only imports so the UI loads it as it stands.
//
// Fences follow CommonMark: a fence opens on a line indented at most
// three spaces holding three or more backticks or tildes and an info
// string (a backtick fence's info string holds no backtick); it closes
// on a line of at least as many of the same marker and nothing else,
// indented at most three spaces; up to the opener's indentation is
// removed from each content line. A fence opened inside an open fence
// is content, never a block of its own; an unclosed fence is no block —
// the reply may still be streaming, and either way there is nothing to
// act on.

import { parse as parseYaml } from "yaml";
import { playerIdSchema } from "./protocol.js";

export interface RegisterDirective {
  command: string;
  intent: string;
  /** Role -> player id, as the agent proposed. */
  players: Record<string, string>;
}

/** A directive as one block declares it. */
export type Directive = { kind: "compile" } | ({ kind: "register" } & RegisterDirective);

/** A reply split into prose and its top-level spex blocks. */
export type TextPart =
  | { kind: "prose"; text: string }
  | {
      kind: "directive";
      /** The block's body, fence lines excluded and the fence's
       * indentation removed, for the code fallback. */
      body: string;
      directive?: Directive;
      /** Why the block could not be read, when it could not. */
      error?: string;
    };

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

const FENCE_OPEN = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})\s*$/;

interface Fence {
  /** The info string's first word, lowercased. */
  info: string;
  body: string;
  /** Line indices of the opening and closing fence lines. */
  start: number;
  end: number;
}

/** Every closed top-level fence of `lines`, in order. */
function scanFences(lines: readonly string[]): Fence[] {
  const out: Fence[] = [];
  let open: { marker: string; ticks: number; indent: number; info: string; start: number; body: string[] } | undefined;
  lines.forEach((line, index) => {
    if (open) {
      const close = FENCE_CLOSE.exec(line);
      if (close && close[1][0] === open.marker && close[1].length >= open.ticks) {
        out.push({ info: open.info, body: open.body.join("\n"), start: open.start, end: index });
        open = undefined;
      } else {
        // Up to the opener's indentation comes off each content line.
        let strip = 0;
        while (strip < open.indent && line[strip] === " ") strip += 1;
        open.body.push(line.slice(strip));
      }
      return;
    }
    const start = FENCE_OPEN.exec(line);
    if (!start) return;
    const marker = start[2][0];
    if (marker === "`" && start[3].includes("`")) return;
    const info = (start[3].trim().split(/\s+/)[0] ?? "").toLowerCase();
    open = { marker, ticks: start[2].length, indent: start[1].length, info, start: index, body: [] };
  });
  return out;
}

/** Every top-level fenced block of `text`: info string and body. */
export function topLevelFences(text: string): { info: string; body: string }[] {
  return scanFences(text.split(/\r?\n/)).map((fence) => ({ info: fence.info, body: fence.body }));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Read one spex block's body as the directive YAML: a mapping with one
 * `kind` — `compile` with nothing else, or `register` with `command`,
 * `intent`, and `players` (role -> player id) and nothing else. Anything
 * beyond that names why the block is left as code.
 */
export function parseSpexBlock(body: string): { directive: Directive } | { error: string } {
  let value: unknown;
  try {
    value = parseYaml(body, { logLevel: "error" });
  } catch (cause) {
    return { error: `not YAML: ${(cause as Error).message.split("\n")[0]}` };
  }
  if (!isPlainObject(value)) return { error: "not a mapping of keys to values" };
  const kind = value.kind;
  if (kind === undefined) return { error: "no kind" };
  const others = Object.keys(value).filter((key) => key !== "kind");
  if (kind === "compile") {
    if (others.length > 0) return { error: `compile takes no keys, got ${others.join(", ")}` };
    return { directive: { kind: "compile" } };
  }
  if (kind === "register") {
    const unknown = others.filter((key) => key !== "command" && key !== "intent" && key !== "players");
    if (unknown.length > 0) return { error: `unknown key ${unknown.join(", ")}` };
    const { command, intent, players } = value;
    if (command === undefined) return { error: "register needs a command" };
    if (typeof command !== "string" || command.trim() === "") return { error: "command must be a non-empty string" };
    if (intent === undefined) return { error: "register needs an intent" };
    if (typeof intent !== "string" || intent.trim() === "") return { error: "intent must be a non-empty string" };
    if (players === undefined) return { error: "register needs players" };
    if (!isPlainObject(players)) return { error: "players must be a mapping of role to player id" };
    const mapped: Record<string, string> = {};
    for (const [role, playerId] of Object.entries(players)) {
      if (role.trim() === "") return { error: "a player's role is empty" };
      if (!playerIdSchema.safeParse(playerId).success) {
        return { error: `${role} names an invalid player id: ${String(playerId)}` };
      }
      mapped[role] = playerId as string;
    }
    return { directive: { kind: "register", command: command.trim(), intent: intent.trim(), players: mapped } };
  }
  return { error: `unknown kind ${String(kind)}` };
}

/**
 * Split a reply into prose and its top-level spex blocks
 * (playbook-library-53): every other fence stays in the prose as the
 * code block it is; an unclosed fence is prose to the end.
 */
export function splitDirectives(text: string): TextPart[] {
  const lines = text.split(/\r?\n/);
  const parts: TextPart[] = [];
  let prose: string[] = [];
  const flush = (): void => {
    if (prose.length > 0) {
      parts.push({ kind: "prose", text: prose.join("\n") });
      prose = [];
    }
  };
  let index = 0;
  for (const fence of scanFences(lines)) {
    prose.push(...lines.slice(index, fence.start));
    if (fence.info === "spex") {
      flush();
      parts.push({ kind: "directive", body: fence.body, ...parseSpexBlock(fence.body) });
    } else {
      prose.push(...lines.slice(fence.start, fence.end + 1));
    }
    index = fence.end + 1;
  }
  prose.push(...lines.slice(index));
  flush();
  return parts;
}

/**
 * Parse the directives of one reply (playbook-library-66): every
 * top-level ```spex fence as YAML with a `kind` key; the last valid
 * block per kind wins; a block missing a key, carrying an unknown key
 * or kind, or failing to parse is malformed and stays visible as code.
 */
export function parseDirectives(text: string): ParsedDirectives {
  const parsed: ParsedDirectives = { compile: false, malformed: [], blocks: [] };
  for (const part of splitDirectives(text)) {
    if (part.kind !== "directive") continue;
    if (!part.directive) {
      parsed.malformed.push(part.body);
      parsed.blocks.push({ text: part.body, malformed: true });
      continue;
    }
    parsed.blocks.push({ text: part.body, kind: part.directive.kind, malformed: false });
    if (part.directive.kind === "compile") {
      parsed.compile = true;
    } else {
      const { kind: _kind, ...directive } = part.directive;
      parsed.register = directive;
    }
  }
  return parsed;
}
