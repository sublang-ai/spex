// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { join, posix, relative, sep } from "node:path";
import type { Heading, Node, Root } from "mdast";
import {
  baseHeadingSlugs,
  codeLineMap,
  headingSlugs,
  headingText,
  parseMarkdown,
  plainHeadingText,
  visit,
} from "./markdown.js";
import { resolveBase } from "./resolve-base.js";

export type LintSeverity = "error" | "warning";

export type LintFinding = {
  path: string;
  line: number;
  severity: LintSeverity;
  rule: string;
  message: string;
};

// Localized section names accepted alongside the English ones,
// matching the section names the bundled zh meta.md defines for
// package files (meta-15).
const SECTION_ALIASES: Record<string, string[]> = {
  Intent: ["Intent", "意图"],
  "External Behavior": ["External Behavior", "外部行为"],
  "Internal Behavior": ["Internal Behavior", "内部行为"],
  Verification: ["Verification", "验证"],
  References: ["References", "参考资料"],
};

const PACKAGE_SECTION_ORDER = [
  "Intent",
  "External Behavior",
  "Internal Behavior",
  "Verification",
  "References",
];

// Required record sections per meta-4 / meta-5, with the zh names
// of the bundled templates. A DR's References section is listed by
// meta-4 but holds no uncited entry (meta-27), so a DR without
// external sources legitimately omits it — it is not required here.
const DR_SECTIONS: Record<string, string[]> = {
  Status: ["Status", "状态"],
  Context: ["Context", "背景"],
  Decision: ["Decision", "决策"],
  Consequences: ["Consequences", "影响"],
};

const IR_SECTIONS: Record<string, string[]> = {
  Status: ["Status", "状态"],
  Intent: ["Intent", "意图"],
  Deliverables: ["Deliverables", "交付项"],
  Tasks: ["Tasks", "任务"],
  Verification: ["Verification", "验证"],
};

const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RECORD_NAME_RE = /^\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
// Package H1: `# <pack>: <Title>` with <pack> the lowercase
// kebab-case basename (meta-16).
const H1_RE = /^([a-z0-9]+(?:-[a-z0-9]+)*):\s+\S.*$/;
// Item headings: lowercase <pack>-<N> (meta-17). The loose form
// also catches case violations so they lint as items, not topics.
const ITEM_RE = /^([a-z0-9]+(?:-[a-z0-9]+)*)-([1-9][0-9]*)$/;
const ITEM_LOOSE_RE = /^([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)-([1-9][0-9]*)$/;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
// Relationship-metadata lines prohibited by meta-19: citations in
// an item's statement are the single relationship source.
const METADATA_LINE_RE =
  /^(Verifies|Binds|Composes|Clients|Suppliers|Scope|Requires|Uses):(\s|$)/;
// A relationship-only sentence left by mechanical migration:
// "Verifies" plus citations and separators. meta-25 wants each
// citation woven into the assertion it supports.
const HAS_CITATION_RE = /\[[^\]]*\]\([^)]*\)/;
const CITATION_SCAN_RE = /\[[^\]]*\]\([^)]*\)/g;
const DETACHED_VERIFIES_RE = /^Verifies\b(?:[\s,.;]|and\b)*$/;
// Legacy directories of retired spec generations (lint-4); their
// structural migration is agent-skill work, not CLI code (DR-021).
const LEGACY_DIRS = [
  "user",
  "dev",
  "test",
  "items",
  "interactions",
  "compositions",
];
const LEGACY_PATH_RE =
  /^specs\/(?:user|dev|test|items|interactions|compositions)\//;
const KNOWN_TOP_LEVEL = new Set([
  "decisions",
  "intents",
  "packages",
  "map.md",
  "meta.md",
]);
const BEHAVIOR_SECTIONS = new Set(["External Behavior", "Internal Behavior"]);

type HeadingInfo = {
  depth: number;
  text: string;
  plain: string;
  line: number;
  slug: string;
  /**
   * A direct child of the document root. Only root-level headings
   * carry structure — H1, sections, items; a heading nested in a
   * blockquote or list is content. Anchors cover every heading.
   */
  root: boolean;
};

type LinkInfo = {
  url: string;
  line: number;
  kind: "link" | "image" | "definition";
  /** Plain text of the link label (inline links only). */
  text: string;
  /**
   * The link is wrapped in an outer bracket pair — the enclosed
   * citation form `[[<id>](<path>#<id>)]` of meta-25.
   */
  enclosed: boolean;
};

type SpecFile = {
  /** POSIX path relative to the base (starts with "specs/"). */
  relPath: string;
  text: string;
  lines: string[];
  tree: Root;
  headings: HeadingInfo[];
  slugs: Set<string>;
  links: LinkInfo[];
  h1: HeadingInfo | null;
  /** Per-line flag: inside a fenced or indented code block. */
  fenced: boolean[];
  /** Inline text spans (mdast text nodes) with their start lines. */
  texts: { line: number; value: string }[];
  /** Reference-style links other than literal [[N]] markers. */
  referenceLinks: { line: number }[];
  /** Every reference-style use, [[N]] markers included. */
  referenceUses: { line: number }[];
};

type LintContext = {
  basePath: string;
  files: Map<string, SpecFile>;
  findings: LintFinding[];
};

function report(
  ctx: LintContext,
  path: string,
  line: number,
  severity: LintSeverity,
  rule: string,
  message: string,
): void {
  ctx.findings.push({ path, line, severity, rule, message });
}

function listMarkdownFiles(dir: string, prefix: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    if (entry === ".DS_Store") continue;
    const abs = join(dir, entry);
    const rel = posix.join(prefix, entry);
    if (statSync(abs).isDirectory()) {
      files.push(...listMarkdownFiles(abs, rel));
    } else if (entry.endsWith(".md")) {
      files.push(rel);
    }
  }
  return files;
}

function plainInlineText(node: Node): string {
  let plain = "";
  visit(node, (child) => {
    if (child.type === "text" || child.type === "inlineCode") {
      plain += (child as unknown as { value: string }).value;
    }
  });
  return plain;
}

function loadFile(basePath: string, relPath: string): SpecFile {
  const text = readFileSync(join(basePath, relPath), "utf-8");
  const tree = parseMarkdown(text);

  const rawHeadings: Omit<HeadingInfo, "slug" | "root">[] = [];
  const links: LinkInfo[] = [];
  const texts: { line: number; value: string }[] = [];
  const referenceLinks: { line: number }[] = [];
  const referenceUses: { line: number }[] = [];
  visit(tree, (node: Node) => {
    if (node.type === "heading") {
      const heading = node as Heading;
      rawHeadings.push({
        depth: heading.depth,
        text: headingText(text, heading),
        plain: plainHeadingText(text, heading),
        line: heading.position?.start.line ?? 1,
      });
      return;
    }
    if (node.type === "text") {
      texts.push({
        line: node.position?.start.line ?? 1,
        value: (node as unknown as { value: string }).value,
      });
      return;
    }
    if (node.type === "linkReference" || node.type === "imageReference") {
      const reference = node as unknown as {
        identifier: string;
        referenceType?: string;
      };
      const line = node.position?.start.line ?? 1;
      referenceUses.push({ line });
      // Only the literal [[N]] marker form of meta-27 is exempt: a
      // numeric shortcut reference wrapped in the outer brackets.
      // A bare [1], a collapsed [1][], and any full reference are
      // disguised citations even with numeric labels (lint-8).
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      const wrapped =
        start !== undefined &&
        end !== undefined &&
        text.charAt(start - 1) === "[" &&
        text.charAt(end) === "]";
      const isMarker =
        /^\d+$/.test(reference.identifier) &&
        reference.referenceType === "shortcut" &&
        wrapped;
      if (!isMarker) {
        referenceLinks.push({ line });
      }
      return;
    }
    if (
      node.type === "link" ||
      node.type === "image" ||
      node.type === "definition"
    ) {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      links.push({
        url: (node as unknown as { url: string }).url,
        line: node.position?.start.line ?? 1,
        kind: node.type as LinkInfo["kind"],
        text: node.type === "link" ? plainInlineText(node).trim() : "",
        enclosed:
          start !== undefined &&
          end !== undefined &&
          text.charAt(start - 1) === "[" &&
          text.charAt(end) === "]",
      });
    }
  });

  const slugList = headingSlugs(text, tree);
  const rootHeadingLines = new Set<number>();
  for (const child of tree.children) {
    if (child.type === "heading") {
      rootHeadingLines.add(child.position?.start.line ?? 1);
    }
  }
  const headings: HeadingInfo[] = rawHeadings.map((heading, index) => ({
    ...heading,
    slug: slugList[index] ?? "",
    root: rootHeadingLines.has(heading.line),
  }));
  const lines = text.split("\n");
  const h1 =
    headings.find((heading) => heading.depth === 1 && heading.root) ?? null;

  return {
    relPath,
    text,
    lines,
    tree,
    headings,
    slugs: new Set(slugList),
    links,
    h1,
    fenced: codeLineMap(tree, lines.length),
    texts,
    referenceLinks,
    referenceUses,
  };
}

function aliasSet(aliases: Record<string, string[]>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [canonical, names] of Object.entries(aliases)) {
    for (const name of names) map.set(name, canonical);
  }
  return map;
}

const SECTION_BY_NAME = aliasSet(SECTION_ALIASES);

function isUnder(relPath: string, dir: string): boolean {
  return relPath.startsWith(`specs/${dir}/`);
}

// The meta-26 prohibition binds DRs and spec items — decisions/,
// packages/, and meta.md. Intent records themselves and map.md sit
// outside it, so an IR (or the map) referencing an IR is legal.
function boundByIrProhibition(relPath: string): boolean {
  return (
    isUnder(relPath, "decisions") ||
    isUnder(relPath, "packages") ||
    relPath === "specs/meta.md"
  );
}

function basenameOf(relPath: string): string {
  return posix.basename(relPath, ".md");
}

// ---------------------------------------------------------------
// Structure rules (lint-4)
// ---------------------------------------------------------------

function lintStructure(ctx: LintContext): void {
  const specsDir = join(ctx.basePath, "specs");
  for (const dir of LEGACY_DIRS) {
    if (existsSync(join(specsDir, dir))) {
      report(
        ctx,
        `specs/${dir}`,
        1,
        "error",
        "structure/legacy-layout",
        `legacy directory specs/${dir}/ found; run the spec-structure-migration skill to migrate to the current layout (DR-021)`,
      );
    }
  }
  for (const entry of readdirSync(specsDir).sort()) {
    if (entry === ".DS_Store" || KNOWN_TOP_LEVEL.has(entry)) continue;
    // Legacy directories carry their own findings; a lone legacy
    // iterations/ still homes IRs (lint-4) and is not "unexpected".
    if (LEGACY_DIRS.includes(entry as (typeof LEGACY_DIRS)[number])) continue;
    if (entry === "iterations") continue;
    report(
      ctx,
      `specs/${entry}`,
      1,
      "warning",
      "structure/unknown-entry",
      `unexpected entry under specs/ (expected decisions/, intents/, packages/, map.md, meta.md)`,
    );
  }
  if (
    existsSync(join(specsDir, "intents")) &&
    existsSync(join(specsDir, "iterations"))
  ) {
    report(
      ctx,
      "specs/iterations",
      1,
      "warning",
      "structure/legacy-records",
      "legacy specs/iterations/ coexists with specs/intents/ (DR-017)",
    );
  }
  for (const required of ["specs/meta.md", "specs/map.md"]) {
    if (!existsSync(join(ctx.basePath, required))) {
      report(
        ctx,
        required,
        1,
        "error",
        "structure/missing-file",
        `${required} is missing`,
      );
    }
  }
}

function lintNaming(ctx: LintContext): void {
  for (const file of ctx.files.values()) {
    const { relPath } = file;
    if (isUnder(relPath, "packages")) {
      const segments = relPath.split("/").slice(2);
      const basename = segments.pop() as string;
      if (!KEBAB_RE.test(basename.replace(/\.md$/, ""))) {
        report(
          ctx,
          relPath,
          1,
          "error",
          "naming/kebab",
          `file name should be <kebab-case>.md (meta-1)`,
        );
      }
      for (const segment of segments) {
        if (!KEBAB_RE.test(segment)) {
          report(
            ctx,
            relPath,
            1,
            "error",
            "naming/kebab",
            `directory "${segment}" should be kebab-case (meta-1)`,
          );
        }
      }
    }
    if (
      isUnder(relPath, "decisions") ||
      isUnder(relPath, "intents") ||
      isUnder(relPath, "iterations")
    ) {
      const basename = posix.basename(relPath);
      if (!RECORD_NAME_RE.test(basename)) {
        report(
          ctx,
          relPath,
          1,
          "error",
          "naming/record",
          `record file name should be <NNN>-<kebab-case>.md (meta-1)`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------
// Package file rules (lint-5)
// ---------------------------------------------------------------

function lintPackageFile(ctx: LintContext, file: SpecFile): void {
  const basename = basenameOf(file.relPath);
  if (file.h1 === null) {
    report(
      ctx,
      file.relPath,
      1,
      "error",
      "package/heading",
      "package file needs a `# <pack>: <Title>` heading (meta-15)",
    );
  } else {
    const match = file.h1.plain.trim().match(H1_RE);
    if (match === null) {
      report(
        ctx,
        file.relPath,
        file.h1.line,
        "error",
        "package/heading",
        "H1 should be `# <pack>: <Title>` with <pack> the lowercase kebab-case basename (meta-16)",
      );
    } else if (match[1] !== basename) {
      report(
        ctx,
        file.relPath,
        file.h1.line,
        "error",
        "package/heading",
        `H1 identifier "${match[1]}" does not match the file's basename "${basename}" (meta-16)`,
      );
    }
  }

  const h2s = file.headings.filter(
    (heading) => heading.depth === 2 && heading.root,
  );
  const present: string[] = [];
  for (const heading of h2s) {
    const canonical = SECTION_BY_NAME.get(heading.plain.trim());
    if (canonical === undefined) {
      report(
        ctx,
        file.relPath,
        heading.line,
        "error",
        "package/sections",
        `unexpected section "## ${heading.plain}"; package files use ${PACKAGE_SECTION_ORDER.join(", ")} (meta-15)`,
      );
      continue;
    }
    if (present.includes(canonical)) {
      report(
        ctx,
        file.relPath,
        heading.line,
        "error",
        "package/sections",
        `duplicate section "## ${heading.plain}" (meta-15)`,
      );
      continue;
    }
    if (
      present.length > 0 &&
      PACKAGE_SECTION_ORDER.indexOf(canonical) <
        PACKAGE_SECTION_ORDER.indexOf(present[present.length - 1])
    ) {
      report(
        ctx,
        file.relPath,
        heading.line,
        "error",
        "package/sections",
        `section "## ${heading.plain}" is out of order (expected ${PACKAGE_SECTION_ORDER.join(", ")}) (meta-15)`,
      );
    }
    present.push(canonical);
  }

  for (const requiredSection of ["Intent", "External Behavior"]) {
    if (!present.includes(requiredSection)) {
      report(
        ctx,
        file.relPath,
        1,
        "error",
        "package/sections",
        `missing required "## ${requiredSection}" section (meta-15)`,
      );
    }
  }
  if (!present.includes("Verification")) {
    report(
      ctx,
      file.relPath,
      1,
      "warning",
      "package/verification",
      'missing "## Verification" section; verification is required unless irrelevant (meta-24)',
    );
  }
}

// ---------------------------------------------------------------
// Item rules (lint-6)
// ---------------------------------------------------------------

type ItemInfo = {
  file: SpecFile;
  heading: HeadingInfo;
  id: string;
  prefix: string;
  /** Canonical section of the containing ## heading, if known. */
  section: string | null;
  /** 1-based line after the heading where the body starts. */
  bodyStart: number;
  /** 1-based line after the body's last line. */
  bodyEnd: number;
};

function collectItems(ctx: LintContext): ItemInfo[] {
  const items: ItemInfo[] = [];
  for (const file of ctx.files.values()) {
    const eligible =
      isUnder(file.relPath, "packages") || file.relPath === "specs/meta.md";
    if (!eligible) continue;
    for (const [index, heading] of file.headings.entries()) {
      if (heading.depth < 2 || !heading.root) continue;
      const match = heading.plain.trim().match(ITEM_LOOSE_RE);
      if (match === null) continue;
      // lint-10: the body runs to the next root-level heading of
      // the same or shallower depth, so nested subsections stay in
      // the item and a quoted heading never truncates its body.
      let bodyEnd = file.lines.length + 1;
      for (let after = index + 1; after < file.headings.length; after += 1) {
        if (!file.headings[after].root) continue;
        if (file.headings[after].depth <= heading.depth) {
          bodyEnd = file.headings[after].line;
          break;
        }
      }
      items.push({
        file,
        heading,
        id: heading.plain.trim(),
        prefix: match[1],
        section: sectionOf(file, heading),
        bodyStart: heading.line + 1,
        bodyEnd,
      });
    }
  }
  return items;
}

function sectionOf(file: SpecFile, heading: HeadingInfo): string | null {
  let current: string | null = null;
  for (const candidate of file.headings) {
    if (candidate.line > heading.line) break;
    if (candidate.depth === 2 && candidate.root) {
      current = SECTION_BY_NAME.get(candidate.plain.trim()) ?? candidate.plain;
    }
  }
  return current;
}

function lintItems(ctx: LintContext, items: ItemInfo[]): void {
  const byId = new Map<string, ItemInfo[]>();
  for (const item of items) {
    const key = item.id.toLowerCase();
    const list = byId.get(key) ?? [];
    list.push(item);
    byId.set(key, list);

    if (!ITEM_RE.test(item.id)) {
      report(
        ctx,
        item.file.relPath,
        item.heading.line,
        "error",
        "id/form",
        `item heading ${item.id} is not of the lowercase <pack>-<N> form (meta-17)`,
      );
    }
    const basename = basenameOf(item.file.relPath);
    if (item.prefix.toLowerCase() !== basename) {
      report(
        ctx,
        item.file.relPath,
        item.heading.line,
        "error",
        "id/prefix",
        `item ${item.id} does not match the file's basename "${basename}" (meta-17)`,
      );
    }
    if (
      isUnder(item.file.relPath, "packages") &&
      (item.section === "Intent" || item.section === "References")
    ) {
      report(
        ctx,
        item.file.relPath,
        item.heading.line,
        "warning",
        "id/misplaced",
        `item ${item.id} sits inside the ${item.section} section; items belong in the Behavior and Verification sections (meta-15)`,
      );
    }
  }
  for (const list of byId.values()) {
    if (list.length < 2) continue;
    for (const item of list) {
      report(
        ctx,
        item.file.relPath,
        item.heading.line,
        "error",
        "id/duplicate",
        `item ID ${item.id} is defined ${list.length} times across specs/ (meta-17)`,
      );
    }
  }

  // A package's identity is its basename (meta-16); one basename
  // used by two files collides even across subdirectories.
  const byBasename = new Map<string, SpecFile[]>();
  for (const file of ctx.files.values()) {
    if (!isUnder(file.relPath, "packages")) continue;
    const basename = basenameOf(file.relPath);
    const list = byBasename.get(basename) ?? [];
    list.push(file);
    byBasename.set(basename, list);
  }
  for (const [basename, list] of byBasename) {
    if (list.length < 2) continue;
    for (const file of list) {
      report(
        ctx,
        file.relPath,
        1,
        "error",
        "id/basename",
        `package basename "${basename}" is used by ${list
          .map((other) => other.relPath)
          .join(", ")} (meta-16)`,
      );
    }
  }
}

// ---------------------------------------------------------------
// Item relationships (lint-7) and citation discipline (lint-13,
// lint-14)
// ---------------------------------------------------------------

/**
 * Resolve a relative citation URL against its file, or null for
 * scheme/absolute/empty URLs that cannot target a spec file.
 */
function resolveCitation(file: SpecFile, url: string): string | null {
  const path = url.split("#")[0];
  if (path === "" || SCHEME_RE.test(path)) return null;
  if (path.startsWith("/") || path.startsWith("//")) return null;
  return posix.normalize(posix.join(posix.dirname(file.relPath), path));
}

/** Links whose source line falls inside the item's body. */
function bodyLinks(item: ItemInfo): LinkInfo[] {
  return item.file.links.filter(
    (link) =>
      link.kind === "link" &&
      link.line >= item.bodyStart &&
      link.line < item.bodyEnd,
  );
}

/** The link's target file and fragment, self-links resolved. */
function linkTarget(
  file: SpecFile,
  link: LinkInfo,
): { relPath: string; fragment: string } | null {
  const [path, ...fragmentParts] = link.url.split("#");
  const fragment = fragmentParts.join("#");
  if (path === "") {
    return link.url.startsWith("#") ? { relPath: file.relPath, fragment } : null;
  }
  const resolved = resolveCitation(file, link.url);
  if (resolved === null) return null;
  return { relPath: resolved, fragment };
}

function itemsBySlug(items: ItemInfo[]): Map<string, Map<string, ItemInfo>> {
  const bySlug = new Map<string, Map<string, ItemInfo>>();
  for (const item of items) {
    const map = bySlug.get(item.file.relPath) ?? new Map<string, ItemInfo>();
    map.set(item.heading.slug, item);
    bySlug.set(item.file.relPath, map);
  }
  return bySlug;
}

function lintItemRelationships(ctx: LintContext, items: ItemInfo[]): void {
  const bySlug = itemsBySlug(items);

  for (const item of items) {
    if (!isUnder(item.file.relPath, "packages")) continue;

    // Relationship-metadata lines are prohibited (lint-7): inline
    // citations are the single relationship source (meta-19). A
    // relationship-only "Verifies …" sentence is an error too
    // (lint-13): weave each citation into the assertion it
    // supports (meta-25).
    for (let line = item.bodyStart; line < item.bodyEnd; line += 1) {
      if (item.file.fenced[line - 1]) continue;
      const content = item.file.lines[line - 1];
      if (content === undefined) continue;
      const trimmed = content.trimStart();
      if (METADATA_LINE_RE.test(trimmed)) {
        report(
          ctx,
          item.file.relPath,
          line,
          "error",
          "item/metadata-line",
          `item ${item.id} carries a relationship-metadata line; inline citations are the single source of relationships (meta-19)`,
        );
        continue;
      }
      if (
        trimmed.startsWith("Verifies") &&
        HAS_CITATION_RE.test(trimmed) &&
        DETACHED_VERIFIES_RE.test(trimmed.replace(CITATION_SCAN_RE, ""))
      ) {
        report(
          ctx,
          item.file.relPath,
          line,
          "error",
          "cite/detached",
          `item ${item.id} carries a detached "Verifies …" sentence; weave each citation into the assertion it supports (meta-25)`,
        );
      }
    }

    // A Verification item cites every behavior it verifies inline
    // (meta-28): at least one same-file behavior item anchor.
    if (item.section === "Verification") {
      let citesBehavior = false;
      for (const link of bodyLinks(item)) {
        const target = linkTarget(item.file, link);
        if (target === null || target.relPath !== item.file.relPath) continue;
        const cited = bySlug.get(item.file.relPath)?.get(target.fragment);
        if (
          cited !== undefined &&
          cited !== item &&
          cited.section !== null &&
          BEHAVIOR_SECTIONS.has(cited.section)
        ) {
          citesBehavior = true;
          break;
        }
      }
      if (!citesBehavior) {
        report(
          ctx,
          item.file.relPath,
          item.heading.line,
          "error",
          "verify/uncited",
          `Verification item ${item.id} cites no same-file behavior item; cite each behavior it verifies inline at the assertion (meta-28)`,
        );
      }
    }

    // Peer citations resolve against the peer's sections: a
    // behavior item may rely on External Behavior alone (lint-7,
    // meta-19); a Verification item cites behavior items (meta-28),
    // and the law is silent on it reaching a peer's Internal
    // Behavior, so lint tolerates that reach (lint-13).
    const isBehavior =
      item.section !== null && BEHAVIOR_SECTIONS.has(item.section);
    const isVerification = item.section === "Verification";
    if (isBehavior || isVerification) {
      for (const link of bodyLinks(item)) {
        const target = linkTarget(item.file, link);
        if (
          target === null ||
          target.relPath === item.file.relPath ||
          !target.relPath.startsWith("specs/packages/") ||
          !ctx.files.has(target.relPath)
        ) {
          continue;
        }
        const cited = bySlug.get(target.relPath)?.get(target.fragment);
        if (isBehavior) {
          if (cited !== undefined && cited.section !== "External Behavior") {
            report(
              ctx,
              item.file.relPath,
              link.line,
              "error",
              "cite/internal",
              `item ${item.id} cites ${cited.id} in ${target.relPath}'s ${cited.section ?? "front matter"}; a peer behavior is relied on through External Behavior alone (meta-19)`,
            );
          }
        } else if (target.fragment !== "") {
          // Verification: the cited peer anchor must be an External
          // or Internal Behavior item.
          if (
            cited === undefined ||
            cited.section === null ||
            !BEHAVIOR_SECTIONS.has(cited.section)
          ) {
            report(
              ctx,
              item.file.relPath,
              link.line,
              "error",
              "cite/internal",
              `Verification item ${item.id} cites ${target.relPath}#${target.fragment} outside the peer's External and Internal Behavior items (meta-28)`,
            );
          }
        }
      }
    }
  }

  // One governing statement per item (meta-12), sentence count as
  // its advisory proxy (lint-14) — a conformant item may carry
  // several sentences of one contract's cases, so this only
  // prompts a read: prose outside fenced blocks, lists, tables,
  // blockquotes, and headings carries at most one sentence.
  // Terminators: ASCII before whitespace or line end, fullwidth
  // anywhere, e.g./i.e. exempt.
  for (const item of items) {
    let terminators = 0;
    let extraLine = -1;
    for (let line = item.bodyStart; line < item.bodyEnd; line += 1) {
      if (item.file.fenced[line - 1]) continue;
      const content = item.file.lines[line - 1];
      if (content === undefined) continue;
      const trimmed = content.trimStart();
      if (trimmed === "" || /^(?:[-*+>|#]|\d+[.)]\s)/.test(trimmed)) {
        continue;
      }
      const bare = trimmed.replace(/`[^`]*`/g, " ");
      const spoken = bare.replace(/\b[ei]\.(?:g|e)\./gi, "eg");
      const found = [...spoken.matchAll(/[.!?](?=\s|$)|[。！？]/g)].length;
      if (found === 0) continue;
      if (terminators < 2 && terminators + found >= 2 && extraLine === -1) {
        extraLine = line;
      }
      terminators += found;
    }
    if (terminators > 1) {
      report(
        ctx,
        item.file.relPath,
        extraLine,
        "warning",
        "item/sentence",
        `item ${item.id} carries more than one sentence; review it for a second governing statement (meta-12)`,
      );
    }
  }
}

function lintCitationDiscipline(ctx: LintContext, items: ItemInfo[]): void {
  for (const file of ctx.files.values()) {
    if (!isUnder(file.relPath, "packages")) continue;

    // A package Intent is self-contained prose (meta-20): no
    // citation links, no reference markers (lint-13).
    const h2s = file.headings.filter(
      (heading) => heading.depth === 2 && heading.root,
    );
    const intentRanges: { start: number; end: number }[] = [];
    for (const [index, heading] of h2s.entries()) {
      if (SECTION_BY_NAME.get(heading.plain.trim()) !== "Intent") continue;
      intentRanges.push({
        start: heading.line,
        end: h2s[index + 1]?.line ?? file.lines.length + 1,
      });
    }
    for (const range of intentRanges) {
      for (const link of file.links) {
        if (link.kind !== "link") continue;
        if (link.line > range.start && link.line < range.end) {
          report(
            ctx,
            file.relPath,
            link.line,
            "error",
            "intent/cited",
            "the Intent section carries a citation; a package reads standalone (meta-20)",
          );
        }
      }
      for (const use of file.referenceUses) {
        if (use.line > range.start && use.line < range.end) {
          report(
            ctx,
            file.relPath,
            use.line,
            "error",
            "intent/cited",
            "the Intent section carries a reference marker; a package reads standalone (meta-20)",
          );
        }
      }
    }

    // Item statements are the single relationship source (meta-19):
    // a peer-package link from section prose outside every item
    // body declares no dependency (lint-13). Intent links are
    // skipped here — they carry intent/cited already.
    const itemRanges = items
      .filter((item) => item.file === file)
      .map((item) => ({ start: item.heading.line, end: item.bodyEnd }));
    for (const link of file.links) {
      if (link.kind !== "link") continue;
      const within = (range: { start: number; end: number }) =>
        link.line >= range.start && link.line < range.end;
      if (itemRanges.some(within) || intentRanges.some(within)) continue;
      const resolved = resolveCitation(file, link.url);
      if (
        resolved === null ||
        resolved === file.relPath ||
        !resolved.startsWith("specs/packages/")
      ) {
        continue;
      }
      report(
        ctx,
        file.relPath,
        link.line,
        "error",
        "cite/prose",
        "section prose cites a peer package; item statements are the single relationship source (meta-19)",
      );
    }

    // Reference-style links dodge the citation rules, so package
    // files use inline citations only (meta-25); literal [[N]]
    // markers stay reserved for ## References (meta-27, lint-8).
    for (const reference of file.referenceLinks) {
      report(
        ctx,
        file.relPath,
        reference.line,
        "error",
        "cite/reference-style",
        "reference-style links are not citations; use an inline link (meta-25)",
      );
    }
  }
}

// ---------------------------------------------------------------
// Citation rules (lint-8)
// ---------------------------------------------------------------

function lintCitations(ctx: LintContext, items: ItemInfo[]): void {
  const bySlug = itemsBySlug(items);
  for (const file of ctx.files.values()) {
    // Naming an IR in prose is citing it, and no DR or spec item
    // does either (meta-26) — so the check binds decisions/,
    // packages/, and meta.md alone; intent records and map.md sit
    // outside the prohibition. Matched over parsed inline text, so
    // inline code and code blocks cannot trip it (lint-10).
    if (boundByIrProhibition(file.relPath)) {
      for (const span of file.texts) {
        for (const [offset, value] of span.value.split("\n").entries()) {
          for (const match of value.matchAll(/\bIR-\d+\b/g)) {
            report(
              ctx,
              file.relPath,
              span.line + offset,
              "error",
              "cite/intent",
              `no DR or spec item names an IR in prose (meta-26): ${match[0]}`,
            );
          }
        }
      }
    }

    const fileDir = posix.dirname(file.relPath);
    for (const link of file.links) {
      const url = link.url;
      // Scheme, protocol-relative, and absolute URLs are unchecked.
      if (url === "" || SCHEME_RE.test(url) || url.startsWith("//")) continue;
      if (url.startsWith("/")) continue;

      const [path, ...fragmentParts] = url.split("#");
      const fragment = fragmentParts.join("#");

      if (path === "") {
        if (fragment !== "" && !file.slugs.has(fragment)) {
          report(
            ctx,
            file.relPath,
            link.line,
            "error",
            "cite/broken-anchor",
            `anchor #${fragment} not found in this file`,
          );
        } else {
          lintItemCitationForm(ctx, file, link, file.relPath, fragment, bySlug);
        }
        continue;
      }

      const resolved = posix.normalize(posix.join(fileDir, path));
      if (!resolved.startsWith("specs/")) {
        // Links out of specs/ (e.g. ../README.md): existence only.
        if (!existsSync(join(ctx.basePath, resolved))) {
          report(
            ctx,
            file.relPath,
            link.line,
            "error",
            "cite/broken-link",
            `link target ${resolved} does not exist`,
          );
        }
        continue;
      }

      if (LEGACY_PATH_RE.test(resolved)) {
        report(
          ctx,
          file.relPath,
          link.line,
          "error",
          "cite/legacy-path",
          `link points into the legacy layout (${resolved}); cite the current layout of meta-1 instead`,
        );
        continue;
      }

      if (
        (resolved.startsWith("specs/intents/") ||
          resolved.startsWith("specs/iterations/")) &&
        boundByIrProhibition(file.relPath)
      ) {
        report(
          ctx,
          file.relPath,
          link.line,
          "error",
          "cite/intent",
          `no DR or spec item cites an IR (meta-26)`,
        );
      }

      if (!existsSync(join(ctx.basePath, resolved))) {
        report(
          ctx,
          file.relPath,
          link.line,
          "error",
          "cite/broken-link",
          `link target ${resolved} does not exist`,
        );
        continue;
      }

      if (fragment !== "" && resolved.endsWith(".md")) {
        const target = ctx.files.get(resolved);
        if (target !== undefined && !target.slugs.has(fragment)) {
          report(
            ctx,
            file.relPath,
            link.line,
            "error",
            "cite/broken-anchor",
            `anchor #${fragment} not found in ${resolved}`,
          );
          continue;
        }
        lintItemCitationForm(ctx, file, link, resolved, fragment, bySlug);
      }
    }
  }
}

/**
 * An item citation is an enclosed inline link whose link text is
 * the target item ID — `[[<pack>-<N>](<path>#<pack>-<N>)]`
 * (meta-25, meta-17, lint-8).
 */
function lintItemCitationForm(
  ctx: LintContext,
  file: SpecFile,
  link: LinkInfo,
  targetPath: string,
  fragment: string,
  bySlug: Map<string, Map<string, ItemInfo>>,
): void {
  if (link.kind !== "link" || fragment === "") return;
  const target = bySlug.get(targetPath)?.get(fragment);
  if (target === undefined) return;
  if (!link.enclosed) {
    report(
      ctx,
      file.relPath,
      link.line,
      "error",
      "cite/item-link",
      `citation of ${target.id} is not an enclosed inline link; write it as [[${target.id}](<path>#${target.heading.slug})] (meta-25)`,
    );
  }
  if (link.text !== target.id) {
    report(
      ctx,
      file.relPath,
      link.line,
      "error",
      "cite/item-link",
      `citation text "${link.text}" is not the target item ID ${target.id} (meta-17)`,
    );
  }
}

// ---------------------------------------------------------------
// Reference-marker rules (lint-9, meta-27)
// ---------------------------------------------------------------

function lintReferences(ctx: LintContext): void {
  for (const file of ctx.files.values()) {
    // The ## References ranges: numbered definitions live there and
    // nowhere else, pointing outward (meta-27).
    const h2s = file.headings.filter(
      (heading) => heading.depth === 2 && heading.root,
    );
    const referencesRanges = h2s
      .map((heading, index) => ({ heading, next: h2s[index + 1] }))
      .filter(
        ({ heading }) =>
          SECTION_BY_NAME.get(heading.plain.trim()) === "References",
      )
      .map(({ heading, next }) => ({
        start: heading.line,
        end: next?.line ?? file.lines.length + 1,
      }));

    const defined = new Set<string>();
    const used = new Set<string>();
    const definitionLines = new Map<string, number>();
    visit(file.tree, (node: Node) => {
      if (node.type === "definition") {
        const definition = node as unknown as {
          identifier: string;
          url: string;
        };
        if (/^\d+$/.test(definition.identifier)) {
          const line = node.position?.start.line ?? 1;
          defined.add(definition.identifier);
          definitionLines.set(definition.identifier, line);
          if (
            !referencesRanges.some(
              (range) => line > range.start && line < range.end,
            )
          ) {
            report(
              ctx,
              file.relPath,
              line,
              "error",
              "refs/definition",
              `numbered definition [${definition.identifier}] sits outside ## References (meta-27)`,
            );
          }
          if (
            !SCHEME_RE.test(definition.url) &&
            !definition.url.startsWith("//")
          ) {
            report(
              ctx,
              file.relPath,
              line,
              "error",
              "refs/definition",
              `numbered definition [${definition.identifier}] targets "${definition.url}"; reference markers point at external URLs — item citations are inline links (meta-27, meta-25)`,
            );
          }
        }
      }
      if (node.type === "linkReference" || node.type === "imageReference") {
        const identifier = (node as unknown as { identifier: string })
          .identifier;
        if (/^\d+$/.test(identifier)) used.add(identifier);
      }
    });

    // Undefined [[N]] markers stay literal text (no linkReference is
    // materialized without a matching definition).
    visit(file.tree, (node: Node) => {
      if (node.type !== "text") return;
      const value = (node as unknown as { value: string }).value;
      for (const match of value.matchAll(/\[\[(\d+)\]\]/g)) {
        if (!defined.has(match[1])) {
          report(
            ctx,
            file.relPath,
            node.position?.start.line ?? 1,
            "error",
            "refs/undefined",
            `reference marker [[${match[1]}]] has no definition in ## References (meta-27)`,
          );
        }
      }
    });

    for (const identifier of defined) {
      if (!used.has(identifier)) {
        report(
          ctx,
          file.relPath,
          definitionLines.get(identifier) ?? 1,
          "warning",
          "refs/unused",
          `reference [${identifier}] is defined but never cited (meta-27)`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------
// Record rules (lint-4, lint-9)
// ---------------------------------------------------------------

function lintRecords(ctx: LintContext): void {
  // A record's ID is its filename's leading number (meta-6), so
  // two differently named files on the same number are one ID —
  // decisions/ for DRs, intents/ with legacy iterations/ for IRs.
  const firstById = new Map<string, string>();
  for (const file of ctx.files.values()) {
    const isDr = isUnder(file.relPath, "decisions");
    const isIr =
      isUnder(file.relPath, "intents") || isUnder(file.relPath, "iterations");
    if (!isDr && !isIr) continue;

    const digits = /^(\d+)/.exec(posix.basename(file.relPath))?.[1];
    if (digits !== undefined) {
      const id = `${isDr ? "DR" : "IR"}-${digits}`;
      const first = firstById.get(id);
      if (first === undefined) {
        firstById.set(id, file.relPath);
      } else {
        report(
          ctx,
          file.relPath,
          1,
          "error",
          "record/duplicate-id",
          `record ID ${id} is already defined by ${first} (meta-6)`,
        );
      }
    }

    const sections = isDr ? DR_SECTIONS : IR_SECTIONS;
    const h2s = new Set(
      file.headings
        .filter((heading) => heading.depth === 2 && heading.root)
        .map((heading) => heading.plain.trim()),
    );
    for (const [canonical, names] of Object.entries(sections)) {
      if (!names.some((name) => h2s.has(name))) {
        report(
          ctx,
          file.relPath,
          1,
          "warning",
          "record/sections",
          `${isDr ? "DR" : "IR"} is missing a "## ${canonical}" section (${
            isDr ? "meta-4" : "meta-5"
          })`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------
// Map + anchor rules (lint-8, lint-9)
// ---------------------------------------------------------------

function lintMap(ctx: LintContext): void {
  const map = ctx.files.get("specs/map.md");
  if (map === undefined) return;

  const listed = new Set<string>();
  for (const link of map.links) {
    const url = link.url;
    if (url === "" || SCHEME_RE.test(url) || url.startsWith("/")) continue;
    listed.add(posix.normalize(posix.join("specs", url.split("#")[0])));
  }

  for (const file of ctx.files.values()) {
    if (!isUnder(file.relPath, "packages")) continue;
    if (!listed.has(file.relPath)) {
      report(
        ctx,
        file.relPath,
        1,
        "warning",
        "map/unlisted",
        `${file.relPath} is not linked from specs/map.md`,
      );
    }
  }
}

function lintAnchors(ctx: LintContext): void {
  for (const file of ctx.files.values()) {
    // Base slugs are computed without -N dedupe counters, so a
    // repeated value is a genuine heading collision (item IDs ending
    // in -N cannot false-positive).
    const counts = new Map<string, number>();
    for (const slug of baseHeadingSlugs(file.text, file.tree)) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
    for (const [slug, count] of counts) {
      if (count > 1) {
        report(
          ctx,
          file.relPath,
          1,
          "warning",
          "anchors/duplicate",
          `duplicate heading anchor #${slug}; citations to it are ambiguous`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------

/** Lint the specs tree under basePath (lint-10). */
export function lintSpecs(basePath: string): LintFinding[] {
  const specsDir = join(basePath, "specs");
  if (!existsSync(specsDir) || !statSync(specsDir).isDirectory()) {
    return [
      {
        path: "specs",
        line: 1,
        severity: "error",
        rule: "structure/missing-file",
        message: `no specs/ directory found at ${basePath}`,
      },
    ];
  }

  const ctx: LintContext = {
    basePath,
    files: new Map(),
    findings: [],
  };

  for (const relPath of listMarkdownFiles(specsDir, "specs")) {
    ctx.files.set(relPath, loadFile(basePath, relPath));
  }

  lintStructure(ctx);
  lintNaming(ctx);
  for (const file of ctx.files.values()) {
    // specs/meta.md and specs/map.md live outside packages/ and are
    // exempt from the package-file rules (lint-5).
    if (isUnder(file.relPath, "packages")) lintPackageFile(ctx, file);
  }
  const items = collectItems(ctx);
  lintItems(ctx, items);
  lintItemRelationships(ctx, items);
  lintCitationDiscipline(ctx, items);
  lintCitations(ctx, items);
  lintReferences(ctx);
  lintRecords(ctx);
  lintMap(ctx);
  lintAnchors(ctx);

  ctx.findings.sort(
    (a, b) =>
      a.path.localeCompare(b.path) ||
      a.line - b.line ||
      a.rule.localeCompare(b.rule),
  );
  return ctx.findings;
}

/**
 * The path prefix findings are printed under: the base path
 * relative to the working directory, canonicalized on both sides
 * so Windows 8.3 short names and symlinks cannot fake a
 * difference, and always in forward slashes (lint-3).
 */
function relativeToCwd(basePath: string): string {
  const canonical = (path: string): string => {
    try {
      return realpathSync.native(path);
    } catch {
      return path;
    }
  };
  const rel = relative(canonical(process.cwd()), canonical(basePath));
  if (rel === "") return ".";
  return rel.split(sep).join("/");
}

/**
 * Entry point for the lint subcommand. Prints findings and exits
 * non-zero when any error-severity finding exists (lint-1..3).
 */
export function lint(args: string[] = []): void {
  try {
    if (args.some((arg) => arg.startsWith("-"))) {
      throw new Error(`Unknown option: ${args.find((a) => a.startsWith("-"))}`);
    }
    if (args.length > 1) {
      throw new Error(`Unexpected arguments: ${args.slice(1).join(" ")}`);
    }
    // Same resolution as scaffold create: explicit path, else git
    // root, else cwd.
    const basePath = resolveBase(args[0]);
    const findings = lintSpecs(basePath);

    const prefix = relativeToCwd(basePath);
    for (const finding of findings) {
      const path =
        prefix === "." ? finding.path : posix.join(prefix, finding.path);
      console.log(
        `${path}:${finding.line}: ${finding.severity} ${finding.rule}: ${finding.message}`,
      );
    }

    const errors = findings.filter((f) => f.severity === "error").length;
    const warnings = findings.length - errors;
    if (findings.length === 0) {
      console.log("spex lint: no problems found");
    } else {
      console.log("");
      console.log(
        `spex lint: ${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${
          warnings === 1 ? "" : "s"
        }`,
      );
    }
    if (errors > 0) process.exit(1);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`spex lint: ${msg}`);
    process.exit(1);
  }
}
