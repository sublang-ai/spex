// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import GithubSlugger from "github-slugger";
import type { Heading, Node, Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

const processor = unified().use(remarkParse).use(remarkGfm);

/** Parse markdown into an mdast tree with position offsets. */
export function parseMarkdown(text: string): Root {
  return processor.parse(text) as Root;
}

/**
 * Per-line flag: the line lies inside a code block — a GFM fence of
 * any delimiter length (including its delimiter lines) or indented
 * code — per the parsed tree, so a literal fence inside a longer
 * fence is not mistaken for a closer.
 */
export function codeLineMap(tree: Root, lineCount: number): boolean[] {
  const inCode: boolean[] = new Array(lineCount).fill(false);
  visit(tree, (node: Node) => {
    if (node.type !== "code") return;
    const start = node.position?.start.line;
    const end = node.position?.end.line;
    if (start === undefined || end === undefined) return;
    for (let line = start; line <= end && line <= lineCount; line += 1) {
      inCode[line - 1] = true;
    }
  });
  return inCode;
}

/** Start offset of a node, throwing when position data is absent. */
export function startOffset(node: Node): number {
  const offset = node.position?.start.offset;
  if (offset === undefined) throw new Error(`node has no position: ${node.type}`);
  return offset;
}

/** End offset of a node, throwing when position data is absent. */
export function endOffset(node: Node): number {
  const offset = node.position?.end.offset;
  if (offset === undefined) throw new Error(`node has no position: ${node.type}`);
  return offset;
}

/** Raw source text covered by a node. */
export function sliceNode(text: string, node: Node): string {
  return text.slice(startOffset(node), endOffset(node));
}

/**
 * The inline source text of a heading (without ATX markers or a
 * setext underline), preserving inline markup verbatim.
 */
export function headingText(text: string, heading: Heading): string {
  const children = heading.children;
  if (children.length === 0) return "";
  return text
    .slice(startOffset(children[0]), endOffset(children[children.length - 1]))
    .trim();
}

export type TextEdit = { start: number; end: number; replacement: string };

/**
 * Apply non-overlapping offset edits to text. Edits are sorted and
 * applied back-to-front so recorded offsets stay valid.
 */
export function applyEdits(text: string, edits: TextEdit[]): string {
  const sorted = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].start < sorted[i - 1].end) {
      throw new Error(
        `overlapping markdown edits at offsets ${sorted[i - 1].start}..${sorted[i - 1].end} and ${sorted[i].start}..${sorted[i].end}`,
      );
    }
  }
  let result = text;
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const { start, end, replacement } = sorted[i];
    result = result.slice(0, start) + replacement + result.slice(end);
  }
  return result;
}

/** Walk every node in an mdast tree, depth first. */
export function visit(node: Node, fn: (node: Node) => void): void {
  fn(node);
  const children = (node as { children?: Node[] }).children;
  if (children === undefined) return;
  for (const child of children) visit(child, fn);
}

/**
 * GitHub-style anchor slugs for every heading in a document, in
 * order, with `-N` suffixes for repeats (matching GitHub rendering).
 */
export function headingSlugs(
  text: string,
  tree: Root = parseMarkdown(text),
): string[] {
  const slugger = new GithubSlugger();
  const slugs: string[] = [];
  visit(tree, (node) => {
    if (node.type !== "heading") return;
    slugs.push(slugger.slug(plainHeadingText(text, node as Heading)));
  });
  return slugs;
}

/**
 * Base slugs of every heading, each computed with a fresh slugger so
 * no `-N` dedupe counters are applied. Collisions show up as
 * repeated values.
 */
export function baseHeadingSlugs(
  text: string,
  tree: Root = parseMarkdown(text),
): string[] {
  const slugs: string[] = [];
  visit(tree, (node) => {
    if (node.type !== "heading") return;
    slugs.push(new GithubSlugger().slug(plainHeadingText(text, node as Heading)));
  });
  return slugs;
}

/** Heading text with inline markdown markers stripped for slugging. */
export function plainHeadingText(text: string, heading: Heading): string {
  let plain = "";
  visit(heading, (node) => {
    if (node.type === "text" || node.type === "inlineCode") {
      plain += (node as unknown as { value: string }).value;
    }
  });
  if (plain !== "") return plain;
  return headingText(text, heading);
}
