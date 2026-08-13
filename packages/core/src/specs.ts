// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The spec-view data plane (SPECV; DR-011, DR-015): parse a project's
// specs/ tree — the packages collection of meta-1 — into the
// protocol's SpecTreeState in one pass, and confine specs.read
// fetches to the specs/ directory. Sync fs is deliberate — spec
// trees are small and reads happen on request (no watcher).

import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import type { Dirent } from "node:fs";
import { isAbsolute, join, posix, sep } from "node:path";

import type {
  SpecFileInfo,
  SpecGroup,
  SpecRecordInfo,
  SpecTreeState,
} from "./protocol.js";

/** Directories marking a legacy tree, per the scaffold package's
 * legacy-generation classification: the pre-DR-012 user/dev/test/items
 * groups and the interactions/compositions collections retired by
 * DR-000. `iterations` is absent by design — intent records there
 * still list (spec-view-14). */
const LEGACY_DIRS = [
  "user",
  "dev",
  "test",
  "items",
  "interactions",
  "compositions",
] as const;

const KNOWN_TOP_LEVEL = new Set([
  "packages",
  "decisions",
  "intents",
  // Tolerated while a tree migrates to intent records (DR-017).
  "iterations",
  "map.md",
  "meta.md",
]);

/** `### <pack>-<N>` / `#### <pack>-<N>` item heading (meta-11) —
 * lowercase kebab-case, with the pre-DR-000 ALLCAPS form kept so
 * old-generation trees still parse, degraded to notices. */
const ITEM_HEADING =
  /^(#{3,4})\s+((?:[a-z0-9]+(?:-[a-z0-9]+)*|[A-Z][A-Z0-9]*)-\d+)\s*$/;
/** A bare item ID, as used in citation link text (meta-16, meta-20). */
const ITEM_ID = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*|[A-Z][A-Z0-9]*)-\d+$/;
/** A link fragment that targets an item heading's anchor. */
const ITEM_ANCHOR = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*-\d+$/;
/** `# <pack>: <Title>` H1 (meta-10); the ALLCAPS short form kept so
 * old-generation trees still parse, degraded to notices. */
const H1_IDENTIFIER = /^((?:[a-z0-9]+(?:-[a-z0-9]+)*|[A-Z][A-Z0-9]*)):\s*(.+)$/;
const FENCE = /^\s*(?:```|~~~)/;
/** Innermost inline link, so the enclosed citation form
 * `[[<id>](<path>#<id>)]` (meta-16) captures the bare id. */
const INLINE_LINK = /\[([^[\]]+)\]\(([^()\s]+)\)/g;

/** Known `##` sections -> filter group (DR-015; meta-30).
 * Localized scaffolds translate the section headings; the zh names
 * mirror the scaffold/linter vocabulary. */
const SECTION_GROUPS: ReadonlyMap<string, SpecGroup> = new Map([
  ["External Behavior", "external"],
  ["外部行为", "external"],
  ["Internal Behavior", "internal"],
  ["内部行为", "internal"],
  ["Verification", "test"],
  ["验证", "test"],
]);

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

/** Empty file shell carrying identity fields derived from the key;
 * the basename is the package identifier (meta-10). */
function fileShell(key: string): SpecFileInfo {
  const slash = key.lastIndexOf("/");
  return {
    path: `specs/packages/${key}.md`,
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
/** Enclosed citation `[[id](target)]` (meta-16), dropped whole from
 * digests — the citation is navigation, not prose, and a truncated
 * `[[…` leaks markup into the one-line row. */
const DIGEST_CITE = /\[\[[^[\]]+\]\([^()\s]+\)\]/g;
/** Plain inline link, kept as its text in digests. */
const DIGEST_LINK = /\[([^[\]]+)\]\([^()\s]+\)/g;
/** Inline code span, kept as its content in digests — the backreference
 * pairs equal-length fences, so a literal backtick inside a
 * double-backtick span survives; the bare-backtick alternative drops
 * only unmatched markers ("$2" is empty when it fires). */
const DIGEST_CODE = /(`+)(.+?)\1|`+/g;

function firstSentence(body: string[]): string {
  const firstText = (body.find((line) => line.trim() !== "") ?? "")
    .replace(DIGEST_CITE, "")
    .replace(DIGEST_LINK, "$1")
    .replace(DIGEST_CODE, "$2")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  const sentence = /^(.*?[.!?])(?=\s|$)/.exec(firstText);
  return sentence ? sentence[1] : firstText;
}

/** Parse one spec file's markdown text (exported for tests). */
export function parseSpecFileText(text: string, key: string): SpecFileInfo {
  const file = fileShell(key);
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
    let group = open.section === undefined ? undefined : SECTION_GROUPS.get(open.section);
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
      if (title === "Intent" || title === "意图") {
        collectingIntent = intent === undefined;
      }
    } else if (level === 3) {
      topic = title;
    }
  }
  closeItem();
  endIntent();

  if (intent !== undefined) file.intent = intent;

  // The basename is the package identifier (meta-10); an H1
  // identifier or item-ID prefix disagreeing with it is noticed —
  // once per distinct prefix — never adopted (spec-view-11). An H1
  // without the `<pack>: <Title>` pattern is a plain title.
  const headed = h1 === undefined ? null : H1_IDENTIFIER.exec(h1);
  if (headed) {
    file.title = headed[2].trim();
    if (headed[1] !== file.basename) {
      file.notices.push(
        `H1 identifier "${headed[1]}" disagrees with basename "${file.basename}"`,
      );
    }
  } else if (h1 !== undefined) {
    file.title = h1;
  }
  const noticedPrefixes = new Set<string>();
  for (const item of file.items) {
    const prefix = item.id.replace(/-\d+$/, "");
    if (prefix === file.basename || noticedPrefixes.has(prefix)) continue;
    noticedPrefixes.add(prefix);
    file.notices.push(
      `item-ID prefix "${prefix}" disagrees with basename "${file.basename}"`,
    );
  }

  return file;
}

/** Read + parse one spec file; never throws (SPECV degradation). */
export function parseSpecFile(absPath: string, key: string): SpecFileInfo {
  let text: string;
  try {
    text = readFileSync(absPath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ...fileShell(key), error: `cannot read file: ${message}` };
  }
  try {
    return parseSpecFileText(text, key);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ...fileShell(key), error: `parse failed: ${message}` };
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
          `skipped symlink escaping the project: specs/packages/${relPath}`,
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
// Records (decisions/, intents/)
// ---------------------------------------------------------------------------

// Record ids form from the filename's leading number, so two
// differently named files can carry the same id. Keep both so
// nothing is hidden — the view keys records by path and lint
// reports the collision — but notice each duplicate.
function noticeDuplicateRecordIds(
  records: SpecRecordInfo[],
  notices: string[],
): SpecRecordInfo[] {
  const firstById = new Map<string, string>();
  for (const record of records) {
    const first = firstById.get(record.id);
    if (first === undefined) {
      firstById.set(record.id, record.path);
    } else {
      notices.push(
        `duplicate record id ${record.id}: ${first} and ${record.path}`,
      );
    }
  }
  return records;
}

// Intent records live in intents/; a tree not yet migrated keeps
// them in the legacy iterations/ directory, and a partially
// migrated tree — a scaffold --update conflict, or an agent run
// under an older toolchain — can hold both (DR-017). Read the two
// together so no record is hidden: a legacy file whose basename
// reappears under intents/ is shadowed with a notice, and the
// coexistence itself is noticed for reconciliation.
function parseIntentRecords(
  specsDir: string,
  baseReal: string,
  notices: string[],
): SpecRecordInfo[] {
  const current = parseRecords(specsDir, "intents", baseReal, notices);
  const legacy = parseRecords(specsDir, "iterations", baseReal, notices);
  if (legacy.length === 0) return noticeDuplicateRecordIds(current, notices);
  if (current.length === 0) return noticeDuplicateRecordIds(legacy, notices);
  notices.push(
    "legacy specs/iterations/ records coexist with specs/intents/; run `spex scaffold --update` for the migration prompt an agent applies",
  );
  const currentNames = new Set(
    current.map((record) => posix.basename(record.path)),
  );
  const kept = legacy.filter((record) => {
    if (!currentNames.has(posix.basename(record.path))) return true;
    notices.push(
      `${record.path} is shadowed by the same-named file under intents/`,
    );
    return false;
  });
  const merged = [...current, ...kept].sort((a, b) => {
    const nameA = posix.basename(a.path);
    const nameB = posix.basename(b.path);
    return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
  });
  return noticeDuplicateRecordIds(merged, notices);
}

function parseRecords(
  specsDir: string,
  sub: "decisions" | "intents" | "iterations",
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
    intents: [],
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

  // Legacy layout — the pre-DR-012 user/dev/test groups or the
  // compositions collection retired by DR-000: report the flag so the
  // UI can render migration guidance with nothing parsed from any
  // collection; records still parse.
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
      decisions: noticeDuplicateRecordIds(
        parseRecords(specsDir, "decisions", baseReal, discarded),
        discarded,
      ),
      intents: parseIntentRecords(specsDir, baseReal, discarded),
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

  // Walk the packages collection; subdirectories are navigation only
  // (meta-31), so files stay flat, keyed by collection-relative path.
  const files = walkCollection(join(specsDir, "packages"), baseReal, notices)
    .sort((a, b) => (a.keyRel < b.keyRel ? -1 : a.keyRel > b.keyRel ? 1 : 0))
    .map((entry) => parseSpecFile(entry.abs, entry.keyRel));

  return {
    present: true,
    legacy: false,
    files,
    decisions: noticeDuplicateRecordIds(
      parseRecords(specsDir, "decisions", baseReal, notices),
      notices,
    ),
    intents: parseIntentRecords(specsDir, baseReal, notices),
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
