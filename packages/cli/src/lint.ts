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
// package and composition files.
const SECTION_ALIASES: Record<string, string[]> = {
  Intent: ["Intent", "意图"],
  "External Behavior": ["External Behavior", "外部行为"],
  "Internal Behavior": ["Internal Behavior", "内部行为"],
  Verification: ["Verification", "验证"],
  References: ["References", "参考资料"],
  Binding: ["Binding", "绑定"],
  Scenario: ["Scenario", "场景"],
  Tests: ["Tests", "测试"],
};

const PACKAGE_SECTION_ORDER = [
  "Intent",
  "External Behavior",
  "Internal Behavior",
  "Verification",
  "References",
];

// META-34 grammar for composition files.
const COMPOSITION_SECTION_ORDER = [
  "Intent",
  "Binding",
  "Scenario",
  "Tests",
  "References",
];

const DR_SECTIONS: Record<string, string[]> = {
  Status: ["Status", "状态"],
  Context: ["Context", "背景"],
  Decision: ["Decision", "决策"],
  Consequences: ["Consequences", "影响"],
};

const IR_SECTIONS: Record<string, string[]> = {
  Goal: ["Goal", "目标"],
  Deliverables: ["Deliverables", "交付项"],
  Tasks: ["Tasks", "任务"],
  "Acceptance criteria": ["Acceptance criteria", "验收标准"],
};

const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RECORD_NAME_RE = /^\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const H1_RE = /^([A-Z][A-Z0-9]+):\s+\S.*$/;
const ITEM_RE = /^([A-Z][A-Z0-9]*)-(\d+)$/;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
// Detached relationship metadata prohibited by META-20.
const METADATA_LINE_RE =
  /^(Verifies|Binds|Composes|Clients|Suppliers|Scope|Requires|Uses):(\s|$)/;
// A relationship-only sentence left by mechanical migration:
// "Verifies" plus citations and separators. META-20 wants each
// citation woven into the assertion it supports.
const HAS_CITATION_RE = /\[[^\]]*\]\([^)]*\)/;
const CITATION_SCAN_RE = /\[[^\]]*\]\([^)]*\)/g;
const DETACHED_VERIFIES_RE = /^Verifies\b(?:[\s,.;]|and\b)*$/;
// Clause keywords a static Binding item must not carry (META-36):
// English When/While, plus the zh trigger keywords of the bundled
// templates at a clause start (当 not in 当前/当中/当下/当然).
const TRIGGER_RE =
  /\b(When|While)\b|(^|[，。；：、（("'「])\s*(当(?![前中下然])|如果)/;
const LEGACY_ITEM_DIRS = ["user", "dev", "test", "items"];
const KNOWN_TOP_LEVEL = new Set([
  "decisions",
  "iterations",
  "packages",
  "compositions",
  "map.md",
  "meta.md",
]);

type HeadingInfo = {
  depth: number;
  text: string;
  plain: string;
  line: number;
  slug: string;
};

type LinkInfo = {
  url: string;
  line: number;
  /** 1-based start column, for clause-position checks. */
  column: number;
  kind: "link" | "image" | "definition";
};

type SpecFile = {
  /** POSIX path relative to the base (starts with "specs/"). */
  relPath: string;
  text: string;
  lines: string[];
  tree: Root;
  headings: HeadingInfo[];
  slugs: Set<string>;
  slugList: string[];
  links: LinkInfo[];
  h1: HeadingInfo | null;
  shortForm: string | null;
  /** Per-line flag: inside a fenced code block. */
  fenced: boolean[];
  /** Inline text spans (mdast text nodes) with their start lines. */
  texts: { line: number; value: string }[];
  /** Reference-style links other than literal [[N]] markers. */
  referenceLinks: { line: number }[];
  /** Every reference-style use, [[N]] markers included. */
  referenceUses: { line: number }[];
  /** Inline prose outside links and code, for clause checks. */
  clauseTexts: { line: number; column: number; value: string }[];
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

function loadFile(basePath: string, relPath: string): SpecFile {
  const text = readFileSync(join(basePath, relPath), "utf-8");
  const tree = parseMarkdown(text);

  const rawHeadings: Omit<HeadingInfo, "slug">[] = [];
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
      // Only the literal [[N]] marker form of META-19 is exempt: a
      // numeric shortcut reference wrapped in the outer brackets.
      // A bare [1], a collapsed [1][], and any full reference are
      // disguised citations even with numeric labels.
      const startColumn = node.position?.start.column;
      const endColumn = node.position?.end.column;
      const sameLine = node.position?.start.line === node.position?.end.line;
      const source = sameLine ? (text.split("\n")[line - 1] ?? "") : "";
      const wrapped =
        sameLine &&
        startColumn !== undefined &&
        endColumn !== undefined &&
        source.charAt(startColumn - 2) === "[" &&
        source.charAt(endColumn - 1) === "]";
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
      links.push({
        url: (node as unknown as { url: string }).url,
        line: node.position?.start.line ?? 1,
        column: node.position?.start.column ?? 1,
        kind: node.type as LinkInfo["kind"],
      });
    }
  });

  // Inline prose for clause checks: text nodes outside links,
  // images, references, and code, so a keyword in inline code or a
  // separator inside a link label cannot fool clause detection.
  const clauseTexts: { line: number; column: number; value: string }[] = [];
  const collectClauseTexts = (node: Node): void => {
    if (
      node.type === "link" ||
      node.type === "linkReference" ||
      node.type === "image" ||
      node.type === "imageReference" ||
      node.type === "inlineCode" ||
      node.type === "code"
    ) {
      return;
    }
    if (node.type === "text") {
      clauseTexts.push({
        line: node.position?.start.line ?? 1,
        column: node.position?.start.column ?? 1,
        value: (node as unknown as { value: string }).value,
      });
      return;
    }
    const children = (node as unknown as { children?: Node[] }).children;
    for (const child of children ?? []) collectClauseTexts(child);
  };
  collectClauseTexts(tree);

  const slugList = headingSlugs(text, tree);
  const headings: HeadingInfo[] = rawHeadings.map((heading, index) => ({
    ...heading,
    slug: slugList[index] ?? "",
  }));
  const lines = text.split("\n");
  const h1 = headings.find((heading) => heading.depth === 1) ?? null;
  const h1Match = h1?.plain.match(H1_RE) ?? null;

  return {
    relPath,
    text,
    lines,
    tree,
    headings,
    slugs: new Set(slugList),
    slugList,
    links,
    h1,
    shortForm: h1Match === null ? null : h1Match[1],
    fenced: codeLineMap(tree, lines.length),
    texts,
    referenceLinks,
    referenceUses,
    clauseTexts,
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

// ---------------------------------------------------------------
// Structure rules
// ---------------------------------------------------------------

function lintStructure(ctx: LintContext): void {
  const specsDir = join(ctx.basePath, "specs");
  for (const dir of LEGACY_ITEM_DIRS) {
    if (existsSync(join(specsDir, dir))) {
      report(
        ctx,
        `specs/${dir}`,
        1,
        "error",
        "structure/legacy-layout",
        `legacy item directory specs/${dir}/ found; run \`spex scaffold --update\` to migrate to specs/packages/`,
      );
    }
  }
  if (existsSync(join(specsDir, "interactions"))) {
    report(
      ctx,
      "specs/interactions",
      1,
      "error",
      "structure/legacy-layout",
      "legacy directory specs/interactions/ found; run `spex scaffold --update` to migrate to specs/compositions/",
    );
  }
  for (const entry of readdirSync(specsDir).sort()) {
    if (entry === ".DS_Store" || KNOWN_TOP_LEVEL.has(entry)) continue;
    if (LEGACY_ITEM_DIRS.includes(entry) || entry === "interactions") continue;
    report(
      ctx,
      `specs/${entry}`,
      1,
      "warning",
      "structure/unknown-entry",
      `unexpected entry under specs/ (expected decisions/, iterations/, packages/, compositions/, map.md, meta.md)`,
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
    if (isUnder(relPath, "packages") || isUnder(relPath, "compositions")) {
      const segments = relPath.split("/").slice(2);
      const basename = segments.pop() as string;
      if (!KEBAB_RE.test(basename.replace(/\.md$/, ""))) {
        report(
          ctx,
          relPath,
          1,
          "error",
          "naming/kebab",
          `file name should be <kebab-case>.md`,
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
            `directory "${segment}" should be kebab-case`,
          );
        }
      }
    }
    if (isUnder(relPath, "decisions") || isUnder(relPath, "iterations")) {
      const basename = posix.basename(relPath);
      if (!RECORD_NAME_RE.test(basename)) {
        report(
          ctx,
          relPath,
          1,
          "error",
          "naming/record",
          `record file name should be <NNN>-<kebab-case>.md`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------
// Package / composition file rules
// ---------------------------------------------------------------

function lintSections(
  ctx: LintContext,
  file: SpecFile,
  order: string[],
  ruleId: string,
  kind: string,
): string[] {
  const h2s = file.headings.filter((heading) => heading.depth === 2);
  const present: string[] = [];
  for (const heading of h2s) {
    const canonical = SECTION_BY_NAME.get(heading.plain.trim());
    if (canonical === undefined || !order.includes(canonical)) {
      report(
        ctx,
        file.relPath,
        heading.line,
        "error",
        ruleId,
        `unexpected section "## ${heading.plain}"; ${kind} files use ${order.join(
          ", ",
        )}`,
      );
      continue;
    }
    if (present.includes(canonical)) {
      report(
        ctx,
        file.relPath,
        heading.line,
        "error",
        ruleId,
        `duplicate section "## ${heading.plain}"`,
      );
      continue;
    }
    if (
      present.length > 0 &&
      order.indexOf(canonical) < order.indexOf(present[present.length - 1])
    ) {
      report(
        ctx,
        file.relPath,
        heading.line,
        "error",
        ruleId,
        `section "## ${heading.plain}" is out of order (expected ${order.join(
          ", ",
        )})`,
      );
    }
    present.push(canonical);
  }
  return present;
}

function lintPackageFile(ctx: LintContext, file: SpecFile): void {
  if (file.h1 === null || file.shortForm === null) {
    report(
      ctx,
      file.relPath,
      file.h1?.line ?? 1,
      "error",
      "package/heading",
      "package file needs a `# <SHORTFORM>: <Title>` heading",
    );
  }

  const present = lintSections(
    ctx,
    file,
    PACKAGE_SECTION_ORDER,
    "package/sections",
    "package",
  );

  if (!present.includes("Intent")) {
    report(
      ctx,
      file.relPath,
      1,
      "error",
      "package/sections",
      'missing required "## Intent" section',
    );
  }
  if (
    !present.includes("External Behavior") &&
    !present.includes("Internal Behavior")
  ) {
    report(
      ctx,
      file.relPath,
      1,
      "error",
      "package/sections",
      'package file needs "## External Behavior" and/or "## Internal Behavior"',
    );
  }
}

function lintCompositionFile(ctx: LintContext, file: SpecFile): void {
  if (file.h1 === null || file.shortForm === null) {
    report(
      ctx,
      file.relPath,
      file.h1?.line ?? 1,
      "error",
      "composition/heading",
      "composition file needs a `# <SHORTFORM>: <Title>` heading",
    );
  }

  const present = lintSections(
    ctx,
    file,
    COMPOSITION_SECTION_ORDER,
    "composition/sections",
    "composition",
  );

  if (!present.includes("Intent")) {
    report(
      ctx,
      file.relPath,
      1,
      "error",
      "composition/sections",
      'missing required "## Intent" section',
    );
  }
  if (!present.includes("Tests")) {
    report(
      ctx,
      file.relPath,
      1,
      "error",
      "composition/sections",
      'missing required "## Tests" section (META-34)',
    );
  }
  if (!present.includes("Binding") && !present.includes("Scenario")) {
    report(
      ctx,
      file.relPath,
      1,
      "error",
      "composition/sections",
      'composition file needs "## Binding" and/or "## Scenario" (META-34)',
    );
  }
}

function lintCompositionNames(ctx: LintContext): void {
  const packageNames = new Set<string>();
  for (const file of ctx.files.values()) {
    if (!isUnder(file.relPath, "packages")) continue;
    packageNames.add(posix.basename(file.relPath, ".md"));
    if (file.shortForm !== null) {
      packageNames.add(file.shortForm.toLowerCase());
    }
  }
  if (packageNames.size === 0) return;

  for (const file of ctx.files.values()) {
    if (!isUnder(file.relPath, "compositions")) continue;
    const name = posix.basename(file.relPath, ".md");
    const tokens = name.split("-");
    // Can the token list be partitioned into >= 2 package names?
    const matched: string[] = [];
    let index = 0;
    while (index < tokens.length) {
      let found = false;
      for (let end = tokens.length; end > index; end -= 1) {
        const candidate = tokens.slice(index, end).join("-");
        if (packageNames.has(candidate)) {
          matched.push(candidate);
          index = end;
          found = true;
          break;
        }
      }
      if (!found) break;
    }
    if (index === tokens.length && matched.length >= 2) {
      report(
        ctx,
        file.relPath,
        1,
        "warning",
        "composition/name-composition",
        `"${name}" looks like a composition of package names (${matched.join(
          " + ",
        )}); name composition files after the concern instead`,
      );
    }
  }
}

// ---------------------------------------------------------------
// Item rules
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
      isUnder(file.relPath, "packages") ||
      isUnder(file.relPath, "compositions") ||
      file.relPath === "specs/meta.md";
    if (!eligible) continue;
    for (const [index, heading] of file.headings.entries()) {
      if (heading.depth < 2) continue;
      const match = heading.plain.trim().match(ITEM_RE);
      if (match === null) continue;
      // LINT-10: the body runs to the next heading of the same or
      // shallower depth, so nested subsections stay in the item.
      let bodyEnd = file.lines.length + 1;
      for (let after = index + 1; after < file.headings.length; after += 1) {
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
    if (candidate.depth === 2) {
      current = SECTION_BY_NAME.get(candidate.plain.trim()) ?? candidate.plain;
    }
  }
  return current;
}

function lintItems(ctx: LintContext, items: ItemInfo[]): void {
  const byId = new Map<string, ItemInfo[]>();
  for (const item of items) {
    const list = byId.get(item.id) ?? [];
    list.push(item);
    byId.set(item.id, list);

    if (item.file.shortForm !== null && item.prefix !== item.file.shortForm) {
      report(
        ctx,
        item.file.relPath,
        item.heading.line,
        "error",
        "id/prefix",
        `item ${item.id} does not match the file's short form ${item.file.shortForm}`,
      );
    }
    if (
      item.file.relPath !== "specs/meta.md" &&
      (item.section === "Intent" || item.section === "References")
    ) {
      report(
        ctx,
        item.file.relPath,
        item.heading.line,
        "warning",
        "id/misplaced",
        `item ${item.id} sits inside the ${item.section} section; items belong in the behavior, Binding, Scenario, Verification, or Tests sections`,
      );
    }
  }
  for (const [id, list] of byId) {
    if (list.length < 2) continue;
    for (const item of list) {
      report(
        ctx,
        item.file.relPath,
        item.heading.line,
        "error",
        "id/duplicate",
        `item ID ${id} is defined ${list.length} times across specs/`,
      );
    }
  }

  const byShortForm = new Map<string, SpecFile[]>();
  for (const file of ctx.files.values()) {
    if (
      file.shortForm === null ||
      (!isUnder(file.relPath, "packages") &&
        !isUnder(file.relPath, "compositions"))
    ) {
      continue;
    }
    const list = byShortForm.get(file.shortForm) ?? [];
    list.push(file);
    byShortForm.set(file.shortForm, list);
  }
  for (const [shortForm, list] of byShortForm) {
    if (list.length < 2) continue;
    for (const file of list) {
      report(
        ctx,
        file.relPath,
        file.h1?.line ?? 1,
        "error",
        "id/short-form-collision",
        `short form ${shortForm} is used by ${list
          .map((other) => other.relPath)
          .join(", ")}`,
      );
    }
  }
}

// ---------------------------------------------------------------
// Item relationship rules (META-20, META-21, META-36)
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

/** Same-file item anchors cited from the item's body. */
function citedSameFileItems(
  item: ItemInfo,
  itemsBySlug: Map<string, ItemInfo>,
): ItemInfo[] {
  const cited: ItemInfo[] = [];
  for (const link of bodyLinks(item)) {
    let fragment: string | null = null;
    if (link.url.startsWith("#")) {
      fragment = link.url.slice(1);
    } else {
      // A same-file citation may spell out the file name.
      const [path, ...fragmentParts] = link.url.split("#");
      if (
        fragmentParts.length > 0 &&
        resolveCitation(item.file, path) === item.file.relPath
      ) {
        fragment = fragmentParts.join("#");
      }
    }
    if (fragment === null) continue;
    const target = itemsBySlug.get(fragment);
    if (target !== undefined && target !== item) cited.push(target);
  }
  return cited;
}

/** Distinct specs/packages/ files cited from the item's body. */
function citedPackageFiles(item: ItemInfo): Set<string> {
  const cited = new Set<string>();
  for (const link of bodyLinks(item)) {
    const resolved = resolveCitation(item.file, link.url);
    if (resolved !== null && resolved.startsWith("specs/packages/")) {
      cited.add(resolved);
    }
  }
  return cited;
}

/**
 * Distinct specs/packages/ files whose items the body cites. A file
 * link without an item anchor counts toward no package (META-21).
 */
function citedPackageItems(
  item: ItemInfo,
  bySlug: Map<string, Map<string, ItemInfo>>,
): Set<string> {
  const cited = new Set<string>();
  for (const link of bodyLinks(item)) {
    const [, ...fragmentParts] = link.url.split("#");
    const fragment = fragmentParts.join("#");
    if (fragment === "") continue;
    const resolved = resolveCitation(item.file, link.url);
    if (resolved === null || !resolved.startsWith("specs/packages/")) continue;
    if (bySlug.get(resolved)?.has(fragment)) cited.add(resolved);
  }
  return cited;
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

  // Same-file Tests coverage of Binding/Scenario items (META-21).
  const coveredByTests = new Set<ItemInfo>();

  for (const item of items) {
    const inPackages = isUnder(item.file.relPath, "packages");
    const inCompositions = isUnder(item.file.relPath, "compositions");
    if (!inPackages && !inCompositions) continue;

    // Relationship-metadata lines are prohibited (META-20), and a
    // relationship-only "Verifies …" sentence is flagged for
    // weaving into the assertions it belongs to.
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
          "meta/metadata-line",
          `item ${item.id} carries a relationship-metadata line; inline citations are the single source of relationships (META-20)`,
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
          `item ${item.id} carries a detached "Verifies …" sentence; weave each citation into the assertion it supports (META-20)`,
        );
      }
    }

    const fileItems = bySlug.get(item.file.relPath) ?? new Map();
    const sameFileCited = citedSameFileItems(item, fileItems);

    if (inPackages && item.section === "Verification") {
      if (sameFileCited.length === 0) {
        report(
          ctx,
          item.file.relPath,
          item.heading.line,
          "error",
          "verify/uncited",
          `Verification item ${item.id} cites no same-file item; cite each behavior it checks inline at the assertion (META-20)`,
        );
      }
      const crossCited = [...citedPackageFiles(item)].filter(
        (relPath) => relPath !== item.file.relPath,
      );
      for (const relPath of crossCited) {
        report(
          ctx,
          item.file.relPath,
          item.heading.line,
          "warning",
          "verify/cross-package",
          `Verification item ${item.id} cites another package (${relPath}); cross-package tests belong in specs/compositions/`,
        );
      }
    }

    if (inCompositions && item.section === "Tests") {
      const bindingOrScenario = sameFileCited.filter(
        (cited) => cited.section === "Binding" || cited.section === "Scenario",
      );
      if (bindingOrScenario.length === 0) {
        report(
          ctx,
          item.file.relPath,
          item.heading.line,
          "error",
          "tests/uncited",
          `Tests item ${item.id} cites no same-file Binding or Scenario item (META-21)`,
        );
      }
      for (const cited of bindingOrScenario) coveredByTests.add(cited);

      const citesScenario = bindingOrScenario.some(
        (cited) => cited.section === "Scenario",
      );
      if (citesScenario && citedPackageItems(item, bySlug).size < 2) {
        report(
          ctx,
          item.file.relPath,
          item.heading.line,
          "error",
          "tests/scenario-two-packages",
          `Tests item ${item.id} exercises a scenario but cites items in fewer than two distinct package files (META-21)`,
        );
      }
    }

    // A binding is static: no trigger or stateful clause (META-36).
    // Keywords are matched over parsed inline text, so list markers,
    // blockquotes, and emphasis cannot hide a trigger and inline
    // code cannot fake one.
    if (inCompositions && item.section === "Binding") {
      let reported = false;
      for (const span of item.file.texts) {
        if (reported) break;
        if (span.line < item.bodyStart || span.line >= item.bodyEnd) continue;
        for (const [offset, valueLine] of span.value.split("\n").entries()) {
          if (TRIGGER_RE.test(valueLine)) {
            report(
              ctx,
              item.file.relPath,
              span.line + offset,
              "error",
              "binding/trigger",
              `Binding item ${item.id} carries a When/While clause; a binding is static (META-36)`,
            );
            reported = true;
            break;
          }
        }
      }
    }
  }

  for (const item of items) {
    if (!isUnder(item.file.relPath, "compositions")) continue;
    if (item.section !== "Binding" && item.section !== "Scenario") continue;
    if (!coveredByTests.has(item)) {
      report(
        ctx,
        item.file.relPath,
        item.heading.line,
        "error",
        "tests/uncovered",
        `${item.section} item ${item.id} is cited by no same-file Tests item (META-21)`,
      );
    }
  }

  // META-34: in a file holding both kinds, every Binding item is
  // depended on by at least one same-file Scenario item.
  const compositionItems = new Map<string, ItemInfo[]>();
  for (const item of items) {
    if (!isUnder(item.file.relPath, "compositions")) continue;
    const list = compositionItems.get(item.file.relPath) ?? [];
    list.push(item);
    compositionItems.set(item.file.relPath, list);
  }
  for (const [relPath, fileItems] of compositionItems) {
    const bindings = fileItems.filter((entry) => entry.section === "Binding");
    const scenarios = fileItems.filter(
      (entry) => entry.section === "Scenario",
    );
    if (bindings.length === 0 || scenarios.length === 0) continue;
    const slugMap = bySlug.get(relPath) ?? new Map<string, ItemInfo>();
    const citedByScenario = new Set<ItemInfo>();
    for (const scenario of scenarios) {
      for (const cited of citedSameFileItems(scenario, slugMap)) {
        citedByScenario.add(cited);
      }
    }
    for (const binding of bindings) {
      if (!citedByScenario.has(binding)) {
        report(
          ctx,
          relPath,
          binding.heading.line,
          "error",
          "binding/no-scenario",
          `Binding item ${binding.id} is cited by no same-file Scenario item; a binding no scenario here depends on belongs in a bindings-only file (META-34)`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------
// Citation discipline (META-14, META-15) — LINT-13
// ---------------------------------------------------------------

// Clause keywords deciding a citation's clause (META-6), in both
// bundled languages, matched over parsed inline text. zh 当 counts
// at clause starts only (excluding 当前-class words), and zh 应
// excludes common non-shall compounds like 应用 and 反应.
const PRECONDITION_KEYWORD_RE =
  /\b(Where|While|When)\b|(^|[,，、;；]\s*)(where|while|when)\b|给定|如果|(^|[，。；：、（("'「]|\s)\s*当(?![前中下然])/g;
const SHALL_KEYWORD_RE =
  /\bshall\b|(?<![反相对适响供效回报感一])应(?![用对答邀酬])/g;
function lastMatchIndex(text: string, re: RegExp): number {
  let last = -1;
  re.lastIndex = 0;
  for (const match of text.matchAll(re)) last = match.index ?? -1;
  return last;
}

// A clause boundary after a citation: a separator that does not
// merely introduce a further citation of the same group. Other
// links appear in the clause window as a placeholder.
const LINK_PLACEHOLDER = "\uE000";
const CLAUSE_SEPARATOR_RE = /[,\uFF0C\u3001;\uFF1B](?!\s*\uE000)/;
const CLAUSE_SEPARATOR_GLOBAL_RE = new RegExp(CLAUSE_SEPARATOR_RE.source, "g");
// Sentence ends that let a later clause open a fresh precondition
// (a multi-sentence item, or parallel arms joined by semicolons).
const SENTENCE_BOUNDARY_RE = /[.\u3002;\uFF1B!?\uFF01\uFF1F]/;

/**
 * The clause window around a link: the paragraph's inline prose
 * before and after it, built from parsed text nodes — inline code
 * and link labels excluded, other links reduced to a placeholder —
 * with a list or table attached to a lead-in ending in a colon.
 */
function clauseWindow(
  item: ItemInfo,
  link: LinkInfo,
): { prefix: string; suffix: string } {
  const lines = item.file.lines;
  let start = link.line;
  while (start - 1 > item.heading.line) {
    const previous = lines[start - 2].trim();
    if (previous !== "") {
      start -= 1;
      continue;
    }
    // Blank line: attach a list or table to its lead-in sentence.
    let above = start - 2;
    while (above > item.heading.line && lines[above - 1].trim() === "") {
      above -= 1;
    }
    if (above > item.heading.line && /[:\uFF1A]$/.test(lines[above - 1].trim())) {
      start = above;
      continue;
    }
    break;
  }
  let end = link.line;
  while (
    end < item.bodyEnd - 1 &&
    end < lines.length &&
    lines[end].trim() !== ""
  ) {
    end += 1;
  }

  const tokens = [
    ...item.file.clauseTexts,
    ...item.file.links
      .filter((other) => other.kind === "link")
      .map((other) => ({
        line: other.line,
        column: other.column,
        value: LINK_PLACEHOLDER,
      })),
  ]
    .filter((token) => token.line >= start && token.line <= end)
    .sort((a, b) => a.line - b.line || a.column - b.column);

  const before: string[] = [];
  const after: string[] = [];
  for (const token of tokens) {
    if (
      token.line < link.line ||
      (token.line === link.line && token.column < link.column)
    ) {
      before.push(token.value);
    } else if (token.line === link.line && token.column === link.column) {
      // The citation itself closes the prefix as a placeholder, so
      // a separator that merely introduces it — "(A), ([B-1])" — is
      // not read as a clause boundary before it.
      before.push(LINK_PLACEHOLDER);
    } else {
      after.push(token.value);
    }
  }
  return { prefix: before.join(" "), suffix: after.join(" ") };
}

function lintCitationDiscipline(ctx: LintContext, items: ItemInfo[]): void {
  const bySlug = itemsBySlug(items);
  for (const file of ctx.files.values()) {
    if (!isUnder(file.relPath, "packages")) continue;

    // A package Intent is self-contained prose (META-15).
    const h2s = file.headings.filter((heading) => heading.depth === 2);
    for (const [index, heading] of h2s.entries()) {
      if (SECTION_BY_NAME.get(heading.plain.trim()) !== "Intent") continue;
      const end = h2s[index + 1]?.line ?? file.lines.length + 1;
      for (const link of file.links) {
        if (link.kind !== "link") continue;
        if (link.line > heading.line && link.line < end) {
          report(
            ctx,
            file.relPath,
            link.line,
            "error",
            "intent/cited",
            "the Intent section carries a citation; keep Intent self-contained prose (META-15)",
          );
        }
      }
      // Reference markers included — [[N]] is a citation too.
      for (const use of file.referenceUses) {
        if (use.line > heading.line && use.line < end) {
          report(
            ctx,
            file.relPath,
            use.line,
            "error",
            "intent/cited",
            "the Intent section carries a reference marker; keep Intent self-contained prose (META-15)",
          );
        }
      }
    }

    // Package citations never target a peer's Internal Behavior
    // (META-14) — definitions included, so a reference-style
    // definition cannot smuggle the target either.
    for (const link of file.links) {
      if (link.kind !== "link" && link.kind !== "definition") continue;
      const [path, ...fragmentParts] = link.url.split("#");
      const fragment = fragmentParts.join("#");
      if (path === "" || fragment === "") continue;
      const resolved = resolveCitation(file, link.url);
      if (
        resolved === null ||
        resolved === file.relPath ||
        !resolved.startsWith("specs/packages/")
      ) {
        continue;
      }
      const target = bySlug.get(resolved)?.get(fragment);
      if (target !== undefined && target.section !== "External Behavior") {
        report(
          ctx,
          file.relPath,
          link.line,
          "error",
          "cite/internal",
          `citation targets ${target.id} in ${resolved}'s ${target.section ?? "front matter"}; a peer may rely only on External Behavior (META-14, META-28)`,
        );
      }
    }
  }

  // The positive rule: in a behavior item, a peer citation is legal
  // only inside a precondition or trigger clause — its nearest
  // preceding clause keyword is Where/While/When (给定/如果/当) with
  // no shall (应) after it — and only naming a peer item. Anything
  // else is an error (META-13, META-14).
  for (const item of items) {
    if (!isUnder(item.file.relPath, "packages")) continue;
    if (
      item.section !== "External Behavior" &&
      item.section !== "Internal Behavior"
    ) {
      continue;
    }
    for (const link of bodyLinks(item)) {
      const resolved = resolveCitation(item.file, link.url);
      if (
        resolved === null ||
        resolved === item.file.relPath ||
        !resolved.startsWith("specs/packages/")
      ) {
        continue;
      }
      const fragment = link.url.split("#").slice(1).join("#");
      if (fragment === "") {
        report(
          ctx,
          item.file.relPath,
          link.line,
          "error",
          "cite/internal",
          `item ${item.id} cites ${resolved} without an item anchor; cite a specific External Behavior item (META-14)`,
        );
        continue;
      }
      if (
        ctx.files.has(resolved) &&
        bySlug.get(resolved)?.get(fragment) === undefined
      ) {
        report(
          ctx,
          item.file.relPath,
          link.line,
          "error",
          "cite/internal",
          `item ${item.id} cites ${resolved}#${fragment}, which is no item anchor; cite a specific External Behavior item (META-14, META-16)`,
        );
        continue;
      }
      const { prefix, suffix } = clauseWindow(item, link);
      const preconditionIndex = lastMatchIndex(
        prefix,
        PRECONDITION_KEYWORD_RE,
      );
      const shallBehind = lastMatchIndex(prefix, SHALL_KEYWORD_RE);
      // The keyword must govern the citation: they share one
      // separator-free span — an appositive comma after a
      // shall-clause subject opens a new span — and no shall stands
      // before the keyword within its own sentence, so a trailing
      // "…, where …" clause after a shall cannot pose as a
      // precondition.
      if (
        preconditionIndex === -1 ||
        shallBehind > preconditionIndex ||
        (shallBehind !== -1 &&
          !SENTENCE_BOUNDARY_RE.test(
            prefix.slice(shallBehind, preconditionIndex),
          )) ||
        lastMatchIndex(prefix, CLAUSE_SEPARATOR_GLOBAL_RE) > preconditionIndex
      ) {
        report(
          ctx,
          item.file.relPath,
          link.line,
          "error",
          "cite/outcome",
          `item ${item.id} cites a peer package outside a precondition clause; peers are cited from Where/While/When preconditions and triggers only (META-13, META-14)`,
        );
        continue;
      }
      // Clause membership, forward: a citation still inside the
      // precondition clause is separated from the following shall
      // by a clause boundary; a subject-position citation is not.
      SHALL_KEYWORD_RE.lastIndex = 0;
      const shallAhead = SHALL_KEYWORD_RE.exec(suffix);
      if (
        shallAhead !== null &&
        !CLAUSE_SEPARATOR_RE.test(suffix.slice(0, shallAhead.index))
      ) {
        report(
          ctx,
          item.file.relPath,
          link.line,
          "error",
          "cite/outcome",
          `item ${item.id} cites a peer package in the clause that carries its shall; peers are cited from Where/While/When preconditions and triggers only (META-13, META-14)`,
        );
      }
    }
  }

  // Reference-style links dodge every citation rule above, so item
  // files use inline citations only (META-16); numbered markers
  // stay reserved for ## References (META-19).
  for (const file of ctx.files.values()) {
    if (
      !isUnder(file.relPath, "packages") &&
      !isUnder(file.relPath, "compositions")
    ) {
      continue;
    }
    for (const reference of file.referenceLinks) {
      report(
        ctx,
        file.relPath,
        reference.line,
        "error",
        "cite/reference-style",
        "reference-style links are not citations; use an inline link (META-16)",
      );
    }
  }
}

// ---------------------------------------------------------------
// Citation rules
// ---------------------------------------------------------------

function lintCitations(ctx: LintContext): void {
  for (const file of ctx.files.values()) {
    // Textual IR references are citations too (META-18). An
    // iteration record is exempt only for its own ID.
    if (file.relPath !== "specs/map.md") {
      const ownIteration = isUnder(file.relPath, "iterations")
        ? Number.parseInt(posix.basename(file.relPath), 10)
        : null;
      for (const [index, line] of file.lines.entries()) {
        if (file.fenced[index]) continue;
        for (const match of line.matchAll(/\bIR-(\d+)\b/g)) {
          if (
            ownIteration !== null &&
            Number.parseInt(match[1], 10) === ownIteration
          ) {
            continue;
          }
          report(
            ctx,
            file.relPath,
            index + 1,
            "error",
            "cite/iteration",
            "iteration records are cited only from specs/map.md — naming an IR is citing it (META-18)",
          );
        }
      }
    }

    const fileDir = posix.dirname(file.relPath);
    for (const link of file.links) {
      const url = link.url;
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

      if (/^specs\/(?:user|dev|test|items|interactions)\//.test(resolved)) {
        report(
          ctx,
          file.relPath,
          link.line,
          "error",
          "cite/legacy-path",
          `link points into the legacy layout (${resolved}); cite specs/packages/ or specs/compositions/ instead`,
        );
        continue;
      }

      if (
        isUnder(file.relPath, "packages") &&
        resolved.startsWith("specs/compositions/")
      ) {
        report(
          ctx,
          file.relPath,
          link.line,
          "error",
          "cite/composition",
          `package file cites ${resolved}; files under packages/ shall not cite compositions/ (META-33)`,
        );
      }

      if (
        resolved.startsWith("specs/iterations/") &&
        file.relPath !== "specs/map.md"
      ) {
        report(
          ctx,
          file.relPath,
          link.line,
          "error",
          "cite/iteration",
          `iteration records are cited only from specs/map.md (META-18)`,
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
        }
      }
    }
  }
}

// ---------------------------------------------------------------
// References rules (META-19)
// ---------------------------------------------------------------

function lintReferences(ctx: LintContext): void {
  for (const file of ctx.files.values()) {
    // The ## References ranges: numbered definitions live there and
    // nowhere else, pointing outward (META-19).
    const h2s = file.headings.filter((heading) => heading.depth === 2);
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
              `numbered definition [${definition.identifier}] sits outside ## References (META-19)`,
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
              `numbered definition [${definition.identifier}] targets "${definition.url}"; reference markers point at external URLs — item citations are inline links (META-19, META-16)`,
            );
          }
        }
      }
      if (node.type === "linkReference" || node.type === "imageReference") {
        const identifier = (node as unknown as { identifier: string }).identifier;
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
            `reference marker [[${match[1]}]] has no definition in ## References (META-19)`,
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
          `reference [${identifier}] is defined but never cited (META-19)`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------
// Record rules
// ---------------------------------------------------------------

function lintRecords(ctx: LintContext): void {
  for (const file of ctx.files.values()) {
    const isDr = isUnder(file.relPath, "decisions");
    const isIr = isUnder(file.relPath, "iterations");
    if (!isDr && !isIr) continue;

    const sections = isDr ? DR_SECTIONS : IR_SECTIONS;
    const h2s = new Set(
      file.headings
        .filter((heading) => heading.depth === 2)
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
            isDr ? "META-4" : "META-5"
          })`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------
// Map + anchor rules
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
    if (
      !isUnder(file.relPath, "packages") &&
      !isUnder(file.relPath, "compositions")
    ) {
      continue;
    }
    if (!listed.has(file.relPath)) {
      report(
        ctx,
        file.relPath,
        1,
        "warning",
        "map/unlisted",
        `${file.relPath} is not listed in specs/map.md`,
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

/** Lint the specs tree under basePath. */
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
    if (isUnder(file.relPath, "packages")) lintPackageFile(ctx, file);
    if (isUnder(file.relPath, "compositions")) lintCompositionFile(ctx, file);
  }
  lintCompositionNames(ctx);
  const items = collectItems(ctx);
  lintItems(ctx, items);
  lintItemRelationships(ctx, items);
  lintCitationDiscipline(ctx, items);
  lintCitations(ctx);
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
 * difference, and always in forward slashes (LINT-3).
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
 * non-zero when any error-severity finding exists.
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
