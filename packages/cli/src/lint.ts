// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, relative } from "node:path";
import type { Heading, Node, Root } from "mdast";
import {
  baseHeadingSlugs,
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
// matching the bundled zh templates.
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
const LEGACY_DIRS = ["user", "dev", "test", "items"];
const KNOWN_TOP_LEVEL = new Set([
  "decisions",
  "iterations",
  "packages",
  "interactions",
  "map.md",
  "meta.md",
]);

type HeadingInfo = {
  depth: number;
  text: string;
  plain: string;
  line: number;
};

type LinkInfo = {
  url: string;
  line: number;
  /** Line of the enclosing Verifies: metadata line, if this is one. */
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

  const headings: HeadingInfo[] = [];
  const links: LinkInfo[] = [];
  visit(tree, (node: Node) => {
    if (node.type === "heading") {
      const heading = node as Heading;
      headings.push({
        depth: heading.depth,
        text: headingText(text, heading),
        plain: plainHeadingText(text, heading),
        line: heading.position?.start.line ?? 1,
      });
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
        kind: node.type as LinkInfo["kind"],
      });
    }
  });

  const slugList = headingSlugs(text, tree);
  const h1 = headings.find((heading) => heading.depth === 1) ?? null;
  const h1Match = h1?.plain.match(H1_RE) ?? null;

  return {
    relPath,
    text,
    lines: text.split("\n"),
    tree,
    headings,
    slugs: new Set(slugList),
    slugList,
    links,
    h1,
    shortForm: h1Match === null ? null : h1Match[1],
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
  for (const dir of LEGACY_DIRS) {
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
  for (const entry of readdirSync(specsDir).sort()) {
    if (entry === ".DS_Store" || KNOWN_TOP_LEVEL.has(entry)) continue;
    if (LEGACY_DIRS.includes(entry)) continue;
    report(
      ctx,
      `specs/${entry}`,
      1,
      "warning",
      "structure/unknown-entry",
      `unexpected entry under specs/ (expected decisions/, iterations/, packages/, interactions/, map.md, meta.md)`,
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
    if (isUnder(relPath, "packages") || isUnder(relPath, "interactions")) {
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
// Package / interaction file rules
// ---------------------------------------------------------------

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

  const h2s = file.headings.filter((heading) => heading.depth === 2);
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
        `unexpected section "## ${heading.plain}"; package files use Intent, External Behavior, Internal Behavior, Verification, References`,
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
        `duplicate section "## ${heading.plain}"`,
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
        `section "## ${heading.plain}" is out of order (expected ${PACKAGE_SECTION_ORDER.join(
          ", ",
        )})`,
      );
    }
    present.push(canonical);
  }

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

function lintInteractionFile(ctx: LintContext, file: SpecFile): void {
  if (file.h1 === null || file.shortForm === null) {
    report(
      ctx,
      file.relPath,
      file.h1?.line ?? 1,
      "error",
      "interaction/heading",
      "interaction file needs a `# <SHORTFORM>: <Title>` heading",
    );
  }
  const hasIntent = file.headings.some(
    (heading) =>
      heading.depth === 2 &&
      SECTION_BY_NAME.get(heading.plain.trim()) === "Intent",
  );
  if (!hasIntent) {
    report(
      ctx,
      file.relPath,
      1,
      "error",
      "interaction/sections",
      'missing required "## Intent" section',
    );
  }
}

function lintInteractionNames(ctx: LintContext): void {
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
    if (!isUnder(file.relPath, "interactions")) continue;
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
        "interaction/name-composition",
        `"${name}" looks like a composition of package names (${matched.join(
          " + ",
        )}); name interaction files after the behavior or scenario instead`,
      );
    }
  }
}

// ---------------------------------------------------------------
// Item ID rules
// ---------------------------------------------------------------

type ItemInfo = {
  file: SpecFile;
  heading: HeadingInfo;
  id: string;
  prefix: string;
};

function collectItems(ctx: LintContext): ItemInfo[] {
  const items: ItemInfo[] = [];
  for (const file of ctx.files.values()) {
    const eligible =
      isUnder(file.relPath, "packages") ||
      isUnder(file.relPath, "interactions") ||
      file.relPath === "specs/meta.md";
    if (!eligible) continue;
    for (const heading of file.headings) {
      if (heading.depth < 2) continue;
      const match = heading.plain.trim().match(ITEM_RE);
      if (match === null) continue;
      items.push({
        file,
        heading,
        id: heading.plain.trim(),
        prefix: match[1],
      });
    }
  }
  return items;
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
        !isUnder(file.relPath, "interactions"))
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
// Verifies rules
// ---------------------------------------------------------------

function verifiesLine(file: SpecFile, heading: HeadingInfo): number | null {
  for (let line = heading.line; line < file.lines.length; line += 1) {
    const content = file.lines[line];
    if (content === undefined) break;
    if (content.trim() === "") continue;
    return content.trimStart().startsWith("Verifies:") ? line + 1 : null;
  }
  return null;
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

function lintVerifies(ctx: LintContext, items: ItemInfo[]): void {
  for (const item of items) {
    const inPackages = isUnder(item.file.relPath, "packages");
    const inInteractions = isUnder(item.file.relPath, "interactions");
    if (!inPackages && !inInteractions) continue;

    const section = sectionOf(item.file, item.heading);
    const verifies = verifiesLine(item.file, item.heading);

    if (inPackages && section === "Verification" && verifies === null) {
      report(
        ctx,
        item.file.relPath,
        item.heading.line,
        "error",
        "verify/missing",
        `Verification item ${item.id} needs a "Verifies:" line citing the items it checks (META-20)`,
      );
    }
    if (
      inPackages &&
      (section === "Intent" || section === "References")
    ) {
      report(
        ctx,
        item.file.relPath,
        item.heading.line,
        "warning",
        "id/misplaced",
        `item ${item.id} sits inside the ${section} section; items belong in the behavior or Verification sections`,
      );
    }
    if (inPackages && section !== "Verification" && verifies !== null) {
      report(
        ctx,
        item.file.relPath,
        verifies,
        "warning",
        "verify/outside",
        `item ${item.id} carries a "Verifies:" line outside the Verification section`,
      );
    }
    if (inPackages && verifies !== null) {
      // A Verification item that checks another package's claims
      // belongs in interactions/ (META-21).
      for (const link of item.file.links) {
        if (link.line !== verifies) continue;
        const path = link.url.split("#")[0];
        if (path === "") continue;
        const resolved = posix.normalize(
          posix.join(posix.dirname(item.file.relPath), path),
        );
        if (
          resolved.startsWith("specs/packages/") &&
          resolved !== item.file.relPath
        ) {
          report(
            ctx,
            item.file.relPath,
            verifies,
            "warning",
            "verify/cross-package",
            `item ${item.id} verifies another package (${resolved}); cross-package tests belong in specs/interactions/`,
          );
        }
      }
    }
    if (inInteractions && verifies !== null) {
      // Interaction test items should span packages; a single-package
      // test belongs in that package's Verification section.
      const cited = new Set<string>();
      for (const link of item.file.links) {
        if (link.line !== verifies) continue;
        const resolved = posix.normalize(
          posix.join(posix.dirname(item.file.relPath), link.url.split("#")[0]),
        );
        if (resolved.startsWith("specs/packages/")) cited.add(resolved);
      }
      if (cited.size === 1) {
        report(
          ctx,
          item.file.relPath,
          verifies,
          "warning",
          "interaction/single-package",
          `test item ${item.id} verifies a single package; consider moving it into that package's Verification section`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------
// Citation rules
// ---------------------------------------------------------------

function lintCitations(ctx: LintContext): void {
  for (const file of ctx.files.values()) {
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

      if (/^specs\/(?:user|dev|test|items)\//.test(resolved)) {
        report(
          ctx,
          file.relPath,
          link.line,
          "error",
          "cite/legacy-path",
          `link points into the legacy layout (${resolved}); cite specs/packages/ instead`,
        );
        continue;
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
    const defined = new Set<string>();
    const used = new Set<string>();
    const definitionLines = new Map<string, number>();
    visit(file.tree, (node: Node) => {
      if (node.type === "definition") {
        const identifier = (node as unknown as { identifier: string }).identifier;
        if (/^\d+$/.test(identifier)) {
          defined.add(identifier);
          definitionLines.set(identifier, node.position?.start.line ?? 1);
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
      !isUnder(file.relPath, "interactions")
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
    if (isUnder(file.relPath, "interactions")) lintInteractionFile(ctx, file);
  }
  lintInteractionNames(ctx);
  const items = collectItems(ctx);
  lintItems(ctx, items);
  lintVerifies(ctx, items);
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

function relativeToCwd(basePath: string): string {
  const rel = relative(process.cwd(), basePath);
  return rel === "" ? "." : rel;
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
