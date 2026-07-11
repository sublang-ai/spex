// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The spec-view data plane (SPECV, DR-011): parse a project's specs/
// tree into the protocol's SpecTreeState in one pass, and confine
// specs.read fetches to the specs/ directory. Sync fs is deliberate —
// spec trees are small and reads happen on request (no watcher).

import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import type { Dirent } from "node:fs";
import { isAbsolute, join, sep } from "node:path";

import type {
  SpecGroupFile,
  SpecItemInfo,
  SpecPackageInfo,
  SpecRecordInfo,
  SpecTreeState,
} from "./protocol.js";

const GROUPS = ["user", "dev", "test"] as const;
type GroupName = (typeof GROUPS)[number];

/** `### <ALLCAPS>-<N>` item heading, tolerating a trailing {#anchor}. */
const ITEM_HEADING = /^###\s+([A-Z][A-Z0-9]*-\d+)\s*(?:\{#[^}]*\})?\s*$/;
const FENCE = /^\s*(?:```|~~~)/;
const KNOWN_TOP_LEVEL = new Set([
  "user",
  "dev",
  "test",
  "decisions",
  "iterations",
  "map.md",
  "meta.md",
]);

// ---------------------------------------------------------------------------
// Per-file parsing (pure text -> SpecGroupFile)
// ---------------------------------------------------------------------------

interface OpenItem {
  id: string;
  section: string | undefined;
  body: string[];
}

function stripAnchor(heading: string): string {
  return heading.replace(/\s*\{#[^}]*\}\s*$/, "").trim();
}

function finishItem(open: OpenItem, group: GroupName): SpecItemInfo {
  const body = [...open.body];
  while (body.length > 0 && body[0].trim() === "") body.shift();
  while (body.length > 0 && body[body.length - 1].trim() === "") body.pop();
  const text = body.join("\n");
  let verifies: string[] = [];
  let digestLines = body;
  if (body.length > 0 && body[0].trim().startsWith("Verifies:")) {
    verifies = body[0].match(/[A-Z][A-Z0-9]*-\d+/g) ?? [];
    digestLines = body.slice(1);
  }
  const firstText = digestLines.find((line) => line.trim() !== "")?.trim() ?? "";
  // First sentence, or the whole first line when no sentence end is
  // found before the line break. Raw markdown is kept as-is.
  const sentence = /^(.*?[.!?])(?=\s|$)/.exec(firstText);
  const firstLine = sentence ? sentence[1] : firstText;
  return {
    id: open.id,
    group,
    ...(open.section !== undefined ? { section: open.section } : {}),
    firstLine,
    text,
    verifies,
  };
}

/** Parse one group file's markdown text (exported for tests). */
export function parseSpecFileText(
  text: string,
  group: GroupName,
  path: string,
): SpecGroupFile {
  const items: SpecItemInfo[] = [];
  let intent: string | undefined;
  let section: string | undefined;
  let inFence = false;
  let open: OpenItem | undefined;
  let collectingIntent = false;
  let intentPara: string[] = [];

  const flushItem = (): void => {
    if (open) {
      items.push(finishItem(open, group));
      open = undefined;
    }
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
    const h2 = /^##(?!#)\s+(.*)$/.exec(line);
    if (h2) {
      flushItem();
      endIntent();
      const title = stripAnchor(h2[1]);
      if (title === "Intent") {
        section = undefined;
        collectingIntent = intent === undefined;
      } else {
        section = title === "References" ? undefined : title;
      }
      continue;
    }
    if (/^#(?!#)\s/.test(line)) {
      flushItem();
      endIntent();
      continue;
    }
    if (/^###(?!#)\s/.test(line)) {
      flushItem();
      endIntent();
      const match = ITEM_HEADING.exec(line);
      if (match) open = { id: match[1], section, body: [] };
      continue;
    }
    if (open) {
      open.body.push(line);
      continue;
    }
    if (collectingIntent) {
      if (line.trim() === "") {
        if (intentPara.length > 0) endIntent();
      } else {
        intentPara.push(line.trim());
      }
    }
  }
  flushItem();
  endIntent();

  return {
    path,
    ...(intent !== undefined ? { intent } : {}),
    items,
  };
}

/** Read + parse one group file; never throws (SPECV-15 degradation). */
export function parseSpecGroupFile(
  absPath: string,
  group: GroupName,
  path: string,
): SpecGroupFile {
  let text: string;
  try {
    text = readFileSync(absPath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { path, items: [], error: `cannot read file: ${message}` };
  }
  try {
    return parseSpecFileText(text, group, path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { path, items: [], error: `parse failed: ${message}` };
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
  /** Relative path from the group root, `/`-separated, minus `.md`. */
  keyRel: string;
  abs: string;
}

function walkGroup(
  groupDir: string,
  group: GroupName,
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
          `skipped symlink escaping the project: specs/${group}/${relPath}`,
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
  if (realInside(groupDir, baseReal) !== undefined) visit(groupDir, "");
  return out;
}

// ---------------------------------------------------------------------------
// Packages: short form + consistency notices
// ---------------------------------------------------------------------------

function deriveShortForm(pkg: SpecPackageInfo): void {
  const stats = new Map<string, { count: number; files: Set<string>; order: number }>();
  for (const group of GROUPS) {
    const file = pkg.groups[group];
    if (!file) continue;
    // Notice label per the DR examples: path relative to specs/.
    const label = file.path.replace(/^specs\//, "");
    for (const item of file.items) {
      const prefix = item.id.replace(/-\d+$/, "");
      let entry = stats.get(prefix);
      if (!entry) {
        entry = { count: 0, files: new Set(), order: stats.size };
        stats.set(prefix, entry);
      }
      entry.count += 1;
      entry.files.add(label);
    }
  }
  if (stats.size === 0) return;
  const ranked = [...stats.entries()].sort(
    (a, b) => b[1].count - a[1].count || a[1].order - b[1].order,
  );
  pkg.shortForm = ranked[0][0];
  if (ranked.length > 1) {
    const minorityFiles = new Set<string>();
    for (const [, info] of ranked.slice(1)) {
      for (const file of info.files) minorityFiles.add(file);
    }
    pkg.notices.push(
      `mixed item prefixes: ${ranked.map(([prefix]) => prefix).join(", ")} (${[
        ...minorityFiles,
      ]
        .sort()
        .join(", ")})`,
    );
  }
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
    packages: [],
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

  const notices: string[] = [];

  // Unknown entries directly under specs/ (dotfiles like .DS_Store are
  // ignored silently — they are OS noise, not spec content).
  const unknown = sortedEntries(specsDir)
    .map((entry) => entry.name)
    .filter((name) => !KNOWN_TOP_LEVEL.has(name) && !name.startsWith("."));
  if (unknown.length > 0) {
    notices.push(`unknown entries under specs/: ${unknown.join(", ")}`);
  }

  // Walk the three groups, merging files into packages by key.
  const packages = new Map<string, SpecPackageInfo>();
  for (const group of GROUPS) {
    for (const file of walkGroup(join(specsDir, group), group, baseReal, notices)) {
      const key = file.keyRel;
      let pkg = packages.get(key);
      if (!pkg) {
        const slash = key.lastIndexOf("/");
        pkg = {
          key,
          dir: slash === -1 ? "" : key.slice(0, slash),
          basename: slash === -1 ? key : key.slice(slash + 1),
          notices: [],
          groups: {},
        };
        packages.set(key, pkg);
      }
      pkg.groups[group] = parseSpecGroupFile(
        file.abs,
        group,
        `specs/${group}/${file.keyRel}.md`,
      );
    }
  }

  const list = [...packages.values()].sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
  );
  for (const pkg of list) deriveShortForm(pkg);

  // Same basename at different dirs: separate nodes, mutual notices.
  const byBasename = new Map<string, SpecPackageInfo[]>();
  for (const pkg of list) {
    const peers = byBasename.get(pkg.basename) ?? [];
    peers.push(pkg);
    byBasename.set(pkg.basename, peers);
  }
  for (const peers of byBasename.values()) {
    if (peers.length < 2) continue;
    for (const pkg of peers) {
      for (const other of peers) {
        if (other !== pkg) pkg.notices.push(`basename also exists at ${other.key}`);
      }
    }
  }

  return {
    present: true,
    packages: list,
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
