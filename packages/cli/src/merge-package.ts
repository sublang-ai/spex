// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import type { Definition, Heading, Node, Root } from "mdast";
import {
  applyEdits,
  codeLineMap,
  endOffset,
  headingText,
  parseMarkdown,
  sliceNode,
  startOffset,
  visit,
  type TextEdit,
} from "./markdown.js";

export const GROUP_SECTIONS = {
  user: "External Behavior",
  dev: "Internal Behavior",
  test: "Verification",
} as const;

export type LegacyGroup = keyof typeof GROUP_SECTIONS;
export const LEGACY_GROUPS = Object.keys(GROUP_SECTIONS) as LegacyGroup[];

export type PackageSource = { text: string };
export type PackageSources = Partial<Record<LegacyGroup, PackageSource>>;

// Section names that merge at file level instead of moving into a
// behavior section. Localized names cover the bundled zh templates.
const INTENT_NAMES = new Set(["Intent", "意图"]);
const REFERENCE_NAMES = new Set(["References", "参考资料"]);

type Section = {
  heading: Heading | null;
  name: string;
  start: number;
  /** Content start (after the heading line). */
  contentStart: number;
  end: number;
};

type ParsedSource = {
  group: LegacyGroup;
  text: string;
  /** Leading HTML comment block (SPDX headers) before any content. */
  leading: string;
  shortForm?: string;
  title?: string;
  intentSections: Section[];
  referenceSections: Section[];
  bodySections: Section[];
  headings: Heading[];
  /** Numeric reference definitions in source order. */
  definitions: Definition[];
  /** Numeric link/image references (materialized by their definitions). */
  references: { node: Node; identifier: string }[];
};

function isHtmlComment(node: Node): boolean {
  return (
    node.type === "html" &&
    (node as unknown as { value: string }).value.trimStart().startsWith("<!--")
  );
}

function splitSections(text: string, tree: Root): {
  leading: string;
  h1: Heading | null;
  sections: Section[];
} {
  const children = tree.children as Node[];
  let leadingEnd = 0;
  let index = 0;
  while (index < children.length && isHtmlComment(children[index])) {
    leadingEnd = endOffset(children[index]);
    index += 1;
  }
  const leading = text.slice(0, leadingEnd).trim();

  let h1: Heading | null = null;
  if (
    index < children.length &&
    children[index].type === "heading" &&
    (children[index] as Heading).depth === 1
  ) {
    h1 = children[index] as Heading;
    index += 1;
  }

  const sections: Section[] = [];
  let current: Section | null = null;
  let preambleStart: number | null = null;
  const flush = (end: number) => {
    if (current !== null) {
      current.end = end;
      sections.push(current);
      current = null;
    }
    if (preambleStart !== null) {
      sections.push({
        heading: null,
        name: "",
        start: preambleStart,
        contentStart: preambleStart,
        end,
      });
      preambleStart = null;
    }
  };
  for (; index < children.length; index += 1) {
    const node = children[index];
    if (node.type === "heading" && (node as Heading).depth <= 2) {
      const heading = node as Heading;
      flush(startOffset(node));
      current = {
        heading,
        name: headingText(text, heading),
        start: startOffset(node),
        contentStart: endOffset(node),
        end: text.length,
      };
      continue;
    }
    if (current === null && preambleStart === null) {
      preambleStart = startOffset(node);
    }
  }
  flush(text.length);
  return { leading, h1, sections };
}

function parseShortFormAndTitle(
  text: string,
  h1: Heading | null,
): { shortForm?: string; title?: string } {
  if (h1 === null) return {};
  const heading = headingText(text, h1);
  const match = heading.match(/^([A-Z][A-Z0-9]+):\s*(.*)$/);
  if (match === null) return { title: heading };
  return { shortForm: match[1], title: match[2] || undefined };
}

function fallbackShortForm(text: string, basename: string): string {
  const idMatch = text.match(/^#{2,6}\s+([A-Z][A-Z0-9]+)-\d+\s*$/m);
  if (idMatch !== null) return idMatch[1];
  const letters = basename.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return letters === "" ? "SPEC" : letters;
}

export function humanizeBasename(basename: string): string {
  return basename
    .split("-")
    .filter((word) => word !== "")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Legacy titles carry group-role qualifiers ("User-Facing Scaffold
// Behavior") that stop describing a merged file; strip them.
const TITLE_ROLE_PREFIX = /^User-Facing\s+/;
const TITLE_ROLE_SUFFIX =
  /\s+(?:Behavior|Implementation Requirements|Acceptance Tests)$/;

function mergedTitle(parsed: ParsedSource[], basename: string): string {
  const titles = parsed
    .map((source) => source.title)
    .filter((title): title is string => title !== undefined);
  if (titles.length > 0 && new Set(titles).size === 1) return titles[0];
  for (const title of titles) {
    const stripped = title
      .replace(TITLE_ROLE_PREFIX, "")
      .replace(TITLE_ROLE_SUFFIX, "")
      .trim();
    if (stripped !== "") return stripped;
  }
  return humanizeBasename(basename);
}

function parseSource(group: LegacyGroup, text: string): ParsedSource {
  const tree = parseMarkdown(text);
  const { leading, h1, sections } = splitSections(text, tree);
  const { shortForm, title } = parseShortFormAndTitle(text, h1);

  const headings: Heading[] = [];
  const definitions: Definition[] = [];
  const references: { node: Node; identifier: string }[] = [];
  visit(tree, (node) => {
    if (node.type === "heading") headings.push(node as Heading);
    if (node.type === "definition") {
      const definition = node as Definition;
      if (/^\d+$/.test(definition.identifier)) definitions.push(definition);
    }
    if (node.type === "linkReference" || node.type === "imageReference") {
      const identifier = (node as unknown as { identifier: string }).identifier;
      if (/^\d+$/.test(identifier)) references.push({ node, identifier });
    }
  });

  const intentSections: Section[] = [];
  const referenceSections: Section[] = [];
  const bodySections: Section[] = [];
  for (const section of sections) {
    if (section.heading !== null && INTENT_NAMES.has(section.name)) {
      intentSections.push(section);
    } else if (section.heading !== null && REFERENCE_NAMES.has(section.name)) {
      referenceSections.push(section);
    } else {
      bodySections.push(section);
    }
  }

  return {
    group,
    text,
    leading,
    shortForm,
    title,
    intentSections,
    referenceSections,
    bodySections,
    headings,
    definitions,
    references,
  };
}

type MergedReferences = {
  /** (group, old identifier) → new identifier. */
  renumbering: Map<string, string>;
  /** Merged definition lines in final order. */
  lines: string[];
};

function mergeReferences(sources: ParsedSource[]): MergedReferences {
  const renumbering = new Map<string, string>();
  const byUrl = new Map<string, string>();
  const lines: string[] = [];
  let next = 1;
  for (const source of sources) {
    for (const definition of source.definitions) {
      const urlKey = `${definition.url} ${definition.title ?? ""}`;
      let assigned = byUrl.get(urlKey);
      if (assigned === undefined) {
        assigned = String(next);
        next += 1;
        byUrl.set(urlKey, assigned);
        lines.push(
          definition.title == null
            ? `[${assigned}]: ${definition.url}`
            : `[${assigned}]: ${definition.url} "${definition.title}"`,
        );
      }
      renumbering.set(`${source.group} ${definition.identifier}`, assigned);
    }
  }
  return { renumbering, lines };
}

/**
 * A setext heading rewritten as ATX one level deeper; an ATX heading
 * demoted by prefixing `#`. Depth is clamped at 6.
 */
function demotionEdit(text: string, heading: Heading): TextEdit | null {
  if (heading.depth >= 6) return null;
  const source = sliceNode(text, heading);
  if (source.startsWith("#")) {
    const start = startOffset(heading);
    return { start, end: start, replacement: "#" };
  }
  // Setext heading: replace the whole span (text + underline) with ATX.
  const inner = headingText(text, heading);
  return {
    start: startOffset(heading),
    end: endOffset(heading),
    replacement: `${"#".repeat(heading.depth + 1)} ${inner}`,
  };
}

/**
 * All full-text edits for one source: reference renumbering and
 * definition removal everywhere, heading demotion inside body
 * sections only. Computed against the original text so reference
 * nodes exist (they materialize only next to their definitions).
 */
function computeEdits(
  source: ParsedSource,
  renumbering: Map<string, string>,
): TextEdit[] {
  const edits: TextEdit[] = [];

  for (const { node, identifier } of source.references) {
    const replacement = renumbering.get(`${source.group} ${identifier}`);
    if (replacement === undefined || replacement === identifier) continue;
    const start = startOffset(node);
    const span = source.text.slice(start, endOffset(node));
    const labelMatch = span.match(/\[(\d+)\](\[\])?$/);
    if (labelMatch === null || labelMatch.index === undefined) continue;
    const labelStart = start + labelMatch.index + 1;
    edits.push({
      start: labelStart,
      end: labelStart + labelMatch[1].length,
      replacement,
    });
  }

  for (const definition of source.definitions) {
    edits.push({
      start: startOffset(definition),
      end: endOffset(definition),
      replacement: "",
    });
  }

  const setextRewrites = new Set<TextEdit>();
  for (const section of source.bodySections) {
    for (const heading of source.headings) {
      const offset = startOffset(heading);
      if (offset < section.start || offset >= section.end) continue;
      const edit = demotionEdit(source.text, heading);
      if (edit === null) continue;
      edits.push(edit);
      // A setext rewrite replaces the whole heading span; other
      // edits inside it would overlap and abort the merge.
      if (edit.end > edit.start) setextRewrites.add(edit);
    }
  }

  if (setextRewrites.size === 0) return edits;
  return edits.filter(
    (edit) =>
      setextRewrites.has(edit) ||
      ![...setextRewrites].some(
        (span) => edit.start >= span.start && edit.end <= span.end,
      ),
  );
}

/** Slice [start, end) of the text with the contained edits applied. */
function extractSpan(
  text: string,
  start: number,
  end: number,
  edits: TextEdit[],
): string {
  const contained = edits
    .filter(
      (edit) =>
        edit.start >= start &&
        edit.end <= end &&
        // An insertion sitting exactly on the end boundary belongs to
        // the next span (e.g. the demotion "#" of the next heading).
        !(edit.start === edit.end && edit.start === end && end > start),
    )
    .map((edit) => ({
      start: edit.start - start,
      end: edit.end - start,
      replacement: edit.replacement,
    }));
  return applyEdits(text.slice(start, end), contained).trim();
}

export type MergeResult = {
  content: string;
  shortForm: string;
  title: string;
};

const VERIFIES_LINE_RE = /^(\s*)Verifies:\s*(.+?)\s*$/;
// A wrapped continuation of a Verifies: block: citations and
// separators only, so prose lines are never swallowed.
const VERIFIES_CONTINUATION_RE =
  /^\s*(?:\[[^\]]+\]\([^)\s]*\)|,|and|\.|\s)+$/;

/**
 * Rewrite detached `Verifies:` metadata lines as inline
 * `Verifies …` sentences (META-20), leaving fenced code alone.
 * Returns the input unchanged when no line matches.
 */
export function convertVerifiesLines(text: string): string {
  const lines = text.split("\n");
  const inCode = codeLineMap(parseMarkdown(text), lines.length);
  const out: string[] = [];
  let changed = false;
  for (let index = 0; index < lines.length; index += 1) {
    if (inCode[index]) {
      out.push(lines[index]);
      continue;
    }
    const match = lines[index].match(VERIFIES_LINE_RE);
    if (match === null) {
      out.push(lines[index]);
      continue;
    }
    // A wrapped block collapses to one sentence: consume the
    // continuation lines that hold only citations and separators.
    const parts = [match[2]];
    while (
      index + 1 < lines.length &&
      !inCode[index + 1] &&
      lines[index + 1].trim() !== "" &&
      VERIFIES_CONTINUATION_RE.test(lines[index + 1])
    ) {
      index += 1;
      parts.push(lines[index]);
    }
    const list = parts
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[,.\s]+$/, "");
    out.push(`${match[1]}Verifies ${list}.`);
    changed = true;
  }
  return changed ? out.join("\n") : text;
}

/**
 * Merge a spec package's legacy user/dev/test item files into one
 * package file with External Behavior / Internal Behavior /
 * Verification sections (DR-000). Content moves byte-faithfully
 * except that `Verifies:` metadata lines become inline sentences:
 * only those, heading depths, reference numbers, line endings
 * (normalized to LF), and the file frame change.
 */
export function mergePackageSources(
  basename: string,
  sources: PackageSources,
): MergeResult {
  const parsed = LEGACY_GROUPS.filter(
    (group) => sources[group] !== undefined,
  ).map((group) =>
    parseSource(
      group,
      (sources[group] as PackageSource).text.replace(/\r\n?/g, "\n"),
    ),
  );
  if (parsed.length === 0) {
    throw new Error(`no sources to merge for package ${basename}`);
  }

  const shortForm =
    parsed.find((source) => source.shortForm !== undefined)?.shortForm ??
    fallbackShortForm(parsed[0].text, basename);
  const title = mergedTitle(parsed, basename);

  const references = mergeReferences(parsed);
  const editsBySource = new Map<LegacyGroup, TextEdit[]>(
    parsed.map((source) => [
      source.group,
      computeEdits(source, references.renumbering),
    ]),
  );

  const pieces: string[] = [];
  const leadingBlocks: string[] = [];
  for (const source of parsed) {
    if (source.leading !== "" && !leadingBlocks.includes(source.leading)) {
      leadingBlocks.push(source.leading);
    }
  }
  if (leadingBlocks.length > 0) pieces.push(leadingBlocks.join("\n"));
  pieces.push(`# ${shortForm}: ${title}`);

  const intents: string[] = [];
  const referenceProse: string[] = [];
  const sectionBodies: { group: LegacyGroup; body: string }[] = [];
  for (const source of parsed) {
    const edits = editsBySource.get(source.group) as TextEdit[];
    for (const section of source.intentSections) {
      const body = extractSpan(
        source.text,
        section.contentStart,
        section.end,
        edits,
      );
      if (body !== "" && !intents.includes(body)) intents.push(body);
    }
    for (const section of source.referenceSections) {
      const prose = extractSpan(
        source.text,
        section.contentStart,
        section.end,
        edits,
      );
      if (prose !== "") referenceProse.push(prose);
    }
    const bodyPieces = source.bodySections
      .map((section) =>
        extractSpan(source.text, section.start, section.end, edits),
      )
      .filter((body) => body !== "");
    if (bodyPieces.length > 0) {
      sectionBodies.push({ group: source.group, body: bodyPieces.join("\n\n") });
    }
  }

  if (intents.length > 0) {
    pieces.push("## Intent");
    pieces.push(intents.join("\n\n"));
  }
  for (const { group, body } of sectionBodies) {
    pieces.push(`## ${GROUP_SECTIONS[group]}`);
    pieces.push(body);
  }
  if (references.lines.length > 0 || referenceProse.length > 0) {
    pieces.push("## References");
    pieces.push([...references.lines, ...referenceProse].join("\n"));
  }

  return { content: `${pieces.join("\n\n")}\n`, shortForm, title };
}
