// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The spec-view data plane (SPECV; DR-011, DR-015): parse a project's
// specs/ tree — the DR-012 packages layout — into the protocol's
// SpecTreeState in one pass, and confine specs.read fetches to the
// specs/ directory. Sync fs is deliberate — spec trees are small and
// reads happen on request (no watcher).

import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import type { Dirent } from "node:fs";
import { isAbsolute, join, sep } from "node:path";

import type {
  SpecFileInfo,
  SpecGroup,
  SpecRecordInfo,
  SpecTreeState,
} from "./protocol.js";

type SpecFileKind = SpecFileInfo["kind"];

/** Collection directory -> file kind (DR-012 layout). */
const COLLECTIONS: readonly {
  dir: "packages" | "compositions";
  kind: SpecFileKind;
}[] = [
  { dir: "packages", kind: "package" },
  { dir: "compositions", kind: "composition" },
];

/** Pre-DR-012 group directories: any of them marks a legacy tree. */
const LEGACY_DIRS = ["user", "dev", "test"] as const;

const KNOWN_TOP_LEVEL = new Set([
  "packages",
  "compositions",
  "decisions",
  "iterations",
  "map.md",
  "meta.md",
]);

/** `### PACK-N` / `#### PACK-N` item heading (META-11). */
const ITEM_HEADING = /^(#{3,4})\s+([A-Z][A-Z0-9]*-\d+)\s*$/;
/** A bare item ID, as used in citation link text (META-16, META-20). */
const ITEM_ID = /^[A-Z][A-Z0-9]*-\d+$/;
/** A link fragment that targets an item heading's anchor. */
const ITEM_ANCHOR = /^[A-Za-z][A-Za-z0-9]*-\d+$/;
/** `# <SHORT>: <Title>` H1 (META-10). */
const H1_SHORT_FORM = /^([A-Z][A-Z0-9]*):\s*(.+)$/;
const FENCE = /^\s*(?:```|~~~)/;
const INLINE_LINK = /\[([^\]]+)\]\(([^()\s]+)\)/g;

/** Known `##` sections -> filter group (DR-015; META-28, META-34). */
const SECTION_GROUPS: Record<SpecFileKind, ReadonlyMap<string, SpecGroup>> = {
  package: new Map([
    ["External Behavior", "external"],
    ["Internal Behavior", "internal"],
    ["Verification", "test"],
  ]),
  composition: new Map([
    ["Binding", "internal"],
    ["Scenario", "external"],
    ["Tests", "test"],
  ]),
};

// ---------------------------------------------------------------------------
// Per-file parsing (pure text -> SpecFileInfo)
// ---------------------------------------------------------------------------

interface OpenItem {
  id: string;
  /** Heading level: 3 or 4. */
  level: number;
  section: string | undefined;
  topic: string | undefined;
  body: string[];
}

function stripAnchor(heading: string): string {
  return heading.replace(/\s*\{#[^}]*\}\s*$/, "").trim();
}

/** Empty file shell carrying identity fields derived from kind + key. */
function fileShell(kind: SpecFileKind, key: string): SpecFileInfo {
  const collection = COLLECTIONS.find((entry) => entry.kind === kind)?.dir;
  const slash = key.lastIndexOf("/");
  return {
    path: `specs/${collection}/${key}.md`,
    kind,
    key,
    dir: slash === -1 ? "" : key.slice(0, slash),
    basename: slash === -1 ? key : key.slice(slash + 1),
    items: [],
    notices: [],
  };
}

/** Ordered unique item IDs cited by inline links whose anchor targets
 * an item (META-16/META-20); fenced lines never cite. */
function extractCites(body: string[]): string[] {
  const cites: string[] = [];
  const seen = new Set<string>();
  let inFence = false;
  for (const line of body) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    for (const match of line.matchAll(INLINE_LINK)) {
      const text = match[1];
      if (!ITEM_ID.test(text)) continue;
      const hash = match[2].indexOf("#");
      if (hash === -1) continue;
      if (!ITEM_ANCHOR.test(match[2].slice(hash + 1))) continue;
      if (!seen.has(text)) {
        seen.add(text);
        cites.push(text);
      }
    }
  }
  return cites;
}

/** First sentence of the body, or the whole first non-empty line when
 * no sentence end is found before the line break. Raw markdown kept. */
function firstSentence(body: string[]): string {
  const firstText = body.find((line) => line.trim() !== "")?.trim() ?? "";
  const sentence = /^(.*?[.!?])(?=\s|$)/.exec(firstText);
  return sentence ? sentence[1] : firstText;
}

/** Parse one spec file's markdown text (exported for tests). */
export function parseSpecFileText(
  text: string,
  kind: SpecFileKind,
  key: string,
): SpecFileInfo {
  const file = fileShell(kind, key);
  const sectionGroups = SECTION_GROUPS[kind];
  const unexpectedSections = new Set<string>();

  let h1: string | undefined;
  let section: string | undefined;
  let topic: string | undefined;
  let intent: string | undefined;
  let inFence = false;
  let open: OpenItem | undefined;
  let collectingIntent = false;
  let intentPara: string[] = [];

  const closeItem = (): void => {
    if (!open) return;
    const body = [...open.body];
    while (body.length > 0 && body[0].trim() === "") body.shift();
    while (body.length > 0 && body[body.length - 1].trim() === "") body.pop();
    let group = open.section === undefined ? undefined : sectionGroups.get(open.section);
    if (group === undefined) {
      // Best-guess group for items outside the known behavior and
      // verification sections; the file notice flags the surprise.
      group = "external";
      if (open.section === undefined) {
        file.notices.push(`item ${open.id} appears before any ## section`);
      } else if (!unexpectedSections.has(open.section)) {
        unexpectedSections.add(open.section);
        file.notices.push(`items under unexpected section "${open.section}"`);
      }
    }
    file.items.push({
      id: open.id,
      group,
      section: open.section ?? "",
      ...(open.topic !== undefined ? { topic: open.topic } : {}),
      firstLine: firstSentence(body),
      text: body.join("\n"),
      cites: extractCites(body),
    });
    open = undefined;
  };
  const endIntent = (): void => {
    if (collectingIntent && intentPara.length > 0 && intent === undefined) {
      intent = intentPara.join(" ");
    }
    collectingIntent = false;
    intentPara = [];
  };

  for (const line of text.split(/\r?\n/)) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      if (open) open.body.push(line);
      continue;
    }
    if (inFence) {
      if (open) open.body.push(line);
      continue;
    }
    const heading = /^(#{1,6})(?!#)\s+(.*)$/.exec(line);
    if (!heading) {
      if (open) {
        open.body.push(line);
      } else if (collectingIntent) {
        if (line.trim() === "") {
          if (intentPara.length > 0) endIntent();
        } else {
          intentPara.push(line.trim());
        }
      }
      continue;
    }
    const level = heading[1].length;
    const item = ITEM_HEADING.exec(line);
    if (item) {
      // Any item heading starts a new item, closing the open one.
      closeItem();
      endIntent();
      if (level === 3) topic = undefined;
      open = {
        id: item[2],
        level,
        section,
        // A ### heading between the section start and a #### item is
        // its topic; a ### item in between clears it (nearest wins).
        topic: level === 4 ? topic : undefined,
        body: [],
      };
      continue;
    }
    // A non-item heading at the open item's level or above closes it;
    // deeper headings stay inside the item body.
    if (open && level <= open.level) closeItem();
    if (open) {
      open.body.push(line);
      continue;
    }
    endIntent();
    const title = stripAnchor(heading[2]);
    if (level === 1) {
      if (h1 === undefined) h1 = title;
      section = undefined;
      topic = undefined;
    } else if (level === 2) {
      section = title;
      topic = undefined;
      if (title === "Intent") collectingIntent = intent === undefined;
    } else if (level === 3) {
      topic = title;
    }
  }
  closeItem();
  endIntent();

  if (intent !== undefined) file.intent = intent;

  // Majority item-ID prefix, ties broken by first appearance.
  const prefixes = new Map<string, { count: number; order: number }>();
  for (const item of file.items) {
    const prefix = item.id.replace(/-\d+$/, "");
    const entry = prefixes.get(prefix);
    if (entry) entry.count += 1;
    else prefixes.set(prefix, { count: 1, order: prefixes.size });
  }
  const ranked = [...prefixes.entries()].sort(
    (a, b) => b[1].count - a[1].count || a[1].order - b[1].order,
  );
  const majority = ranked[0]?.[0];

  const headed = h1 === undefined ? null : H1_SHORT_FORM.exec(h1);
  if (headed) {
    file.shortForm = headed[1];
    file.title = headed[2].trim();
    if (majority !== undefined && majority !== headed[1]) {
      file.notices.push(
        `short form ${headed[1]} disagrees with the majority item prefix ${majority}`,
      );
    }
  } else {
    if (h1 !== undefined) file.title = h1;
    if (majority !== undefined) file.shortForm = majority;
  }
  if (ranked.length > 1) {
    file.notices.push(
      `mixed item prefixes: ${ranked.map(([prefix]) => prefix).join(", ")}`,
    );
  }

  return file;
}

/** Read + parse one spec file; never throws (SPECV degradation). */
export function parseSpecFile(
  absPath: string,
  kind: SpecFileKind,
  key: string,
): SpecFileInfo {
  let text: string;
  try {
    text = readFileSync(absPath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ...fileShell(kind, key), error: `cannot read file: ${message}` };
  }
  try {
    return parseSpecFileText(text, kind, key);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ...fileShell(kind, key), error: `parse failed: ${message}` };
  }
}

// ---------------------------------------------------------------------------
// Tree walking
// ---------------------------------------------------------------------------

/** Realpath of `path` when it stays inside the project, else undefined. */
function realInside(path: string, baseReal: string): string | undefined {
  try {
    const real = realpathSync(path);
    return real === baseReal || real.startsWith(baseReal + sep)
      ? real
      : undefined;
  } catch {
    return undefined;
  }
}

function sortedEntries(dir: string): Dirent[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

interface WalkedFile {
  /** Relative path from the collection root, `/`-separated, minus `.md`. */
  keyRel: string;
  abs: string;
}

function walkCollection(
  collectionDir: string,
  collection: "packages" | "compositions",
  baseReal: string,
  notices: string[],
): WalkedFile[] {
  const out: WalkedFile[] = [];
  const visit = (dir: string, rel: string): void => {
    for (const entry of sortedEntries(dir)) {
      const abs = join(dir, entry.name);
      const relPath = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isSymbolicLink() && realInside(abs, baseReal) === undefined) {
        notices.push(
          `skipped symlink escaping the project: specs/${collection}/${relPath}`,
        );
        continue;
      }
      let stats;
      try {
        stats = statSync(abs);
      } catch {
        continue;
      }
      if (stats.isDirectory()) visit(abs, relPath);
      else if (entry.name.endsWith(".md")) {
        out.push({ keyRel: relPath.slice(0, -".md".length), abs });
      }
    }
  };
  if (realInside(collectionDir, baseReal) !== undefined) visit(collectionDir, "");
  return out;
}

// ---------------------------------------------------------------------------
// Records (decisions/, iterations/)
// ---------------------------------------------------------------------------

function parseRecords(
  specsDir: string,
  sub: "decisions" | "iterations",
  baseReal: string,
  notices: string[],
): SpecRecordInfo[] {
  const dir = join(specsDir, sub);
  if (realInside(dir, baseReal) === undefined) return [];
  const idPrefix = sub === "decisions" ? "DR" : "IR";
  const out: SpecRecordInfo[] = [];
  for (const entry of sortedEntries(dir)) {
    if (!entry.name.endsWith(".md")) continue;
    const numbered = /^(\d+)/.exec(entry.name);
    if (!numbered) continue;
    const abs = join(dir, entry.name);
    if (entry.isSymbolicLink() && realInside(abs, baseReal) === undefined) {
      notices.push(
        `skipped symlink escaping the project: specs/${sub}/${entry.name}`,
      );
      continue;
    }
    try {
      if (!statSync(abs).isFile()) continue;
    } catch {
      continue;
    }
    let title = entry.name.replace(/\.md$/, "");
    try {
      const heading = /^#\s+(.+?)\s*$/m.exec(readFileSync(abs, "utf8"));
      if (heading) title = heading[1].replace(/^(?:DR|IR)-\d+\s*:\s*/, "");
    } catch {
      // Keep the filename fallback; the reader will surface the error.
    }
    out.push({
      id: `${idPrefix}-${numbered[1]}`,
      title,
      path: `${sub}/${entry.name}`,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The tree parse (specs.get)
// ---------------------------------------------------------------------------

export function parseSpecTree(projectPath: string): SpecTreeState {
  const readAt = Date.now();
  const absent: SpecTreeState = {
    present: false,
    legacy: false,
    files: [],
    decisions: [],
    iterations: [],
    notices: [],
    readAt,
  };
  let baseReal: string;
  try {
    baseReal = realpathSync(projectPath);
  } catch {
    return absent;
  }
  const specsDir = join(projectPath, "specs");
  try {
    if (!statSync(specsDir).isDirectory()) return absent;
  } catch {
    return absent;
  }
  if (realInside(specsDir, baseReal) === undefined) return absent;

  // Legacy layout (pre-DR-012 user/dev/test groups): report the flag
  // so the UI can render migration guidance; records still parse.
  const legacy = LEGACY_DIRS.some((name) => {
    try {
      return statSync(join(specsDir, name)).isDirectory();
    } catch {
      return false;
    }
  });
  if (legacy) {
    const discarded: string[] = [];
    return {
      present: true,
      legacy: true,
      files: [],
      decisions: parseRecords(specsDir, "decisions", baseReal, discarded),
      iterations: parseRecords(specsDir, "iterations", baseReal, discarded),
      notices: [],
      readAt,
    };
  }

  const notices: string[] = [];

  // Unknown entries directly under specs/ (dotfiles like .DS_Store are
  // ignored silently — they are OS noise, not spec content).
  const unknown = sortedEntries(specsDir)
    .map((entry) => entry.name)
    .filter((name) => !KNOWN_TOP_LEVEL.has(name) && !name.startsWith("."));
  if (unknown.length > 0) {
    notices.push(`unknown entries under specs/: ${unknown.join(", ")}`);
  }

  // Walk both collections; collection subdirectories are navigation
  // only (META-32), so files stay flat, keyed by relative path.
  const files: SpecFileInfo[] = [];
  for (const { dir, kind } of COLLECTIONS) {
    const walked = walkCollection(join(specsDir, dir), dir, baseReal, notices)
      .sort((a, b) => (a.keyRel < b.keyRel ? -1 : a.keyRel > b.keyRel ? 1 : 0));
    for (const entry of walked) {
      files.push(parseSpecFile(entry.abs, kind, entry.keyRel));
    }
  }

  return {
    present: true,
    legacy: false,
    files,
    decisions: parseRecords(specsDir, "decisions", baseReal, notices),
    iterations: parseRecords(specsDir, "iterations", baseReal, notices),
    notices,
    readAt,
  };
}

// ---------------------------------------------------------------------------
// specs.read confinement
// ---------------------------------------------------------------------------

export type ResolvedSpecPath =
  | { ok: true; path: string }
  | { ok: false; code: "invalid_request" | "not_found"; message: string };

/**
 * Resolve `<project>/specs/<relPath>` with confinement: relative
 * `.md` paths only, no `..`, and no symlink escape from the project.
 */
export function resolveSpecPath(
  projectPath: string,
  relPath: string,
): ResolvedSpecPath {
  if (isAbsolute(relPath) || /^[\\/]/.test(relPath) || /^[A-Za-z]:/.test(relPath)) {
    return {
      ok: false,
      code: "invalid_request",
      message: "path must be relative to specs/",
    };
  }
  const segments = relPath.split(/[\\/]+/).filter((segment) => segment !== "");
  if (segments.length === 0 || segments.some((segment) => segment === "..")) {
    return {
      ok: false,
      code: "invalid_request",
      message: "path may not escape specs/",
    };
  }
  if (!relPath.endsWith(".md")) {
    return {
      ok: false,
      code: "invalid_request",
      message: "only .md files under specs/ can be read",
    };
  }
  let baseReal: string;
  try {
    baseReal = realpathSync(projectPath);
  } catch {
    return { ok: false, code: "not_found", message: "project directory is missing" };
  }
  const abs = join(projectPath, "specs", ...segments);
  let stats;
  try {
    stats = statSync(abs);
  } catch {
    return { ok: false, code: "not_found", message: `no spec file at specs/${relPath}` };
  }
  if (!stats.isFile()) {
    return { ok: false, code: "not_found", message: `no spec file at specs/${relPath}` };
  }
  if (realInside(abs, baseReal) === undefined) {
    return {
      ok: false,
      code: "invalid_request",
      message: "path resolves outside the project",
    };
  }
  return { ok: true, path: abs };
}
