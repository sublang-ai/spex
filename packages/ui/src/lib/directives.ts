// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The agent's directive blocks as the thread reads them (DR-058,
// playbook-library-53): a fenced ```spex block in a reply is YAML with
// one `kind` — `compile` with nothing else, or `register` with
// `command`, `intent`, and `players` — and the conversation pane draws
// it as a card, never as fence text. The core parses the same blocks
// when the turn ends and acts on them; this module only reads them for
// display, by the same rules, so a block the core would refuse shows
// as code with a caption rather than as a card that promises an act.
//
// A fence opened inside another fence is content: the scan walks
// top-level fences only, the way CommonMark closes them — a bare ```
// line ends the open fence, whatever its info string was.

export type Directive =
  | { kind: "compile" }
  | {
      kind: "register";
      command: string;
      intent: string;
      /** Role → player id, as the agent proposed it. */
      players: Record<string, string>;
    };

export type TextPart =
  | { kind: "prose"; text: string }
  | {
      kind: "directive";
      /** The block's body, fence lines excluded, for the code fallback. */
      body: string;
      directive?: Directive;
      /** Why the block could not be read, when it could not. */
      error?: string;
    };

/** A fence opens with three or more backticks and an info string that
 * holds no backtick; it closes on a line of at least as many backticks
 * and nothing else (CommonMark), so a four-backtick fence encloses a
 * three-backtick one as content. */
const OPEN_FENCE = /^(`{3,})([^`]*)$/u;

function closesFence(line: string, fence: string): boolean {
  const trimmed = line.trim();
  return /^`{3,}$/u.test(trimmed) && trimmed.length >= fence.length;
}

/** Split an agent's text into prose and its top-level spex blocks. An
 * unclosed fence is prose: the reply is still streaming, or the agent
 * never closed it, and either way there is no block to act on. */
export function splitDirectives(text: string): TextPart[] {
  const parts: TextPart[] = [];
  const lines = text.split("\n");
  let prose: string[] = [];
  const flush = (): void => {
    if (prose.length > 0) {
      parts.push({ kind: "prose", text: prose.join("\n") });
      prose = [];
    }
  };
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const open = OPEN_FENCE.exec(line);
    if (!open) {
      prose.push(line);
      index += 1;
      continue;
    }
    const info = open[2].trim().split(/\s+/u)[0] ?? "";
    // Find the fence's close; the lines between are its body.
    let close = index + 1;
    while (close < lines.length && !closesFence(lines[close], open[1])) close += 1;
    if (close >= lines.length) {
      // Unclosed: everything from here on is prose.
      prose.push(...lines.slice(index));
      break;
    }
    const body = lines.slice(index + 1, close);
    if (info === "spex") {
      flush();
      const parsed = parseSpexBlock(body.join("\n"));
      parts.push({
        kind: "directive",
        body: body.join("\n"),
        ...("directive" in parsed ? { directive: parsed.directive } : { error: parsed.error }),
      });
    } else {
      // Any other fence is the prose's own code block.
      prose.push(...lines.slice(index, close + 1));
    }
    index = close + 1;
  }
  flush();
  return parts;
}

/** Whether a text carries at least one top-level spex block. */
export function hasDirective(text: string): boolean {
  return splitDirectives(text).some((part) => part.kind === "directive");
}

const PLAYER_ID = /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)*$/u;

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** Read one `Key: value` line; undefined when the line is not one. */
function keyValue(line: string): { key: string; value: string } | undefined {
  const match = /^([^\s:#][^:]*?)\s*:(?:\s+(.*))?$/u.exec(line.trim());
  if (!match) return undefined;
  return { key: match[1].trim(), value: (match[2] ?? "").trim() };
}

/** Read a flow mapping `{A: b, C: d}` into its entries. */
function flowMapping(value: string): Record<string, string> | undefined {
  const inner = value.trim();
  if (!inner.startsWith("{") || !inner.endsWith("}")) return undefined;
  const entries: Record<string, string> = {};
  const content = inner.slice(1, -1).trim();
  if (!content) return entries;
  for (const piece of content.split(",")) {
    const entry = keyValue(piece);
    if (!entry || !entry.value) return undefined;
    entries[unquote(entry.key)] = unquote(entry.value);
  }
  return entries;
}

/** Parse a spex block's body as the directive YAML the core reads:
 * a flat mapping with one nested `players` mapping. Anything beyond
 * that — an unknown key, an unknown kind, a missing field, a shape
 * that is not a mapping — is a block the core leaves as code. */
export function parseSpexBlock(
  body: string,
): { directive: Directive } | { error: string } {
  const fields: Record<string, string> = {};
  let players: Record<string, string> | undefined;
  const lines = body.split("\n");
  let index = 0;
  while (index < lines.length) {
    const raw = lines[index];
    const line = raw.replace(/\s+#.*$/u, "");
    index += 1;
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (/^\s/u.test(line)) return { error: "an indented line outside players" };
    const entry = keyValue(line);
    if (!entry) return { error: `not a key: value line: ${line.trim()}` };
    if (entry.key in fields || (entry.key === "players" && players)) {
      return { error: `${entry.key} appears twice` };
    }
    if (entry.key === "players") {
      if (entry.value) {
        const flow = flowMapping(entry.value);
        if (!flow) return { error: "players must be a mapping of role to player id" };
        players = flow;
        continue;
      }
      players = {};
      while (index < lines.length) {
        const nested = lines[index].replace(/\s+#.*$/u, "");
        if (!nested.trim()) {
          index += 1;
          continue;
        }
        if (!/^\s/u.test(nested)) break;
        const pair = keyValue(nested);
        if (!pair || !pair.value) {
          return { error: `players entry is not role: player id: ${nested.trim()}` };
        }
        players[unquote(pair.key)] = unquote(pair.value);
        index += 1;
      }
      continue;
    }
    fields[entry.key] = unquote(entry.value);
  }
  const kind = fields.kind;
  if (kind === undefined) return { error: "no kind" };
  const others = Object.keys(fields).filter((key) => key !== "kind");
  if (kind === "compile") {
    if (others.length > 0 || players) {
      return { error: `compile takes no keys, got ${[...others, ...(players ? ["players"] : [])].join(", ")}` };
    }
    return { directive: { kind: "compile" } };
  }
  if (kind === "register") {
    const allowed = new Set(["command", "intent"]);
    const unknown = others.filter((key) => !allowed.has(key));
    if (unknown.length > 0) return { error: `unknown key ${unknown.join(", ")}` };
    if (!fields.command) return { error: "register needs a command" };
    if (!fields.intent) return { error: "register needs an intent" };
    if (!players) return { error: "register needs players" };
    for (const [role, playerId] of Object.entries(players)) {
      if (!PLAYER_ID.test(playerId)) {
        return { error: `${role} names an invalid player id: ${playerId}` };
      }
    }
    return {
      directive: {
        kind: "register",
        command: fields.command,
        intent: fields.intent,
        players,
      },
    };
  }
  return { error: `unknown kind ${kind}` };
}
