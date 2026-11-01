// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Citations across a release's boundary (environments-41,
// environments-42, DR-174). An address `spex:<org>/<pkg>#<id>` cites
// another release's spec item and stands only inside a release; a
// project's `specs/` holds plain relative links. Building a release's
// spec from a project's file turns a relative citation into that file
// into a same-file citation and one into a package's spec into that
// package's address, keeps one of `meta.md` at the specs root, which
// the scaffold puts in every tree, removes one into a spec of no
// package or into a file two packages claim, and reduces a decision
// record's link to its text, each removal and reduction reported as a
// warning naming the citing item. Placing a release's spec in a tree
// turns each address whose package's spec stands there into the
// relative link to it and removes the rest, counted per package they
// wait for, a plain link to one keeping its text, so `specs/` holds no
// address; a relative link, `meta.md`'s among them, stays. A removal
// takes the citation's brackets and one space directly before them, the
// phrase kept; the text outside each edit is left byte for byte.

import { posix } from "node:path";
import type { Heading, Link, Node } from "mdast";

import {
  applyEdits,
  endOffset,
  parseMarkdown,
  plainHeadingText,
  startOffset,
  visit,
  type TextEdit,
} from "../../markdown.js";
import { isPackageName } from "./format.js";

/** A release's spec item cited by address: the package and the item's anchor. */
export type Address = { name: string; anchor: string };

/**
 * What building a release's spec could not carry: a citation of a spec
 * of no package, or of a file two packages claim, removed, or a decision
 * record's link, reduced to its text — with the item citing it, or
 * "intent" before any item.
 */
export type CitationWarning = {
  kind: "citation" | "record";
  item: string;
  /** The cited file's specs-relative path and anchor, or the record's id. */
  target: string;
  /** For a citation of a file two or more packages claim, those packages, in name order. */
  claims?: string[];
};

export type ReleaseContext = {
  /** The specs-relative path of the file being built, e.g. "packages/tools.md". */
  selfPath: string;
  /**
   * The package `<org>/<pkg>` whose provided spec that specs-relative
   * file is; the packages claiming it alike, where two or more do; or
   * null.
   */
  packageOf: (specsRelativePath: string) => string | { claims: string[] } | null;
};

export type TreeContext = {
  /** The specs-relative path of that package's placed spec, or null where none stands. */
  placedPathOf: (name: string) => string | null;
  /** The specs-relative path this file is placed at, e.g. "packages/tools.md". */
  selfPath: string;
};

const ADDRESS_SCHEME = "spex:";
// The spec of specs at the specs root, which the scaffold puts in every
// tree (meta-1).
const META_PATH = "meta.md";
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
// Item headings: lowercase <pack>-<N> (meta-11).
const ITEM_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*-[1-9][0-9]*$/;
// A decision record's link: its id as text, its file under decisions/
// named <NNN>-<kebab-case>.md (meta-1, meta-16, meta-22).
const RECORD_TEXT_RE = /^DR-\d+$/;
const RECORD_PATH_RE = /(?:^|\/)decisions\/\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

/** The package and anchor of a `spex:<org>/<pkg>#<anchor>` url, or null. */
export function parseAddress(url: string): Address | null {
  if (!url.startsWith(ADDRESS_SCHEME)) return null;
  const hash = url.indexOf("#");
  if (hash < 0) return null;
  const name = url.slice(ADDRESS_SCHEME.length, hash);
  const anchor = url.slice(hash + 1);
  if (!isPackageName(name) || anchor === "") return null;
  return { name, anchor };
}

/** The address citing `anchor` in the spec `name` provides. */
export function formatAddress(name: string, anchor: string): string {
  return `${ADDRESS_SCHEME}${name}#${anchor}`;
}

/**
 * A citation's url: `#<anchor>`, a relative `<path>#<anchor>`, or an
 * address `spex:<org>/<pkg>#<anchor>`.
 */
export function isCitationUrl(url: string): boolean {
  return parseAddress(url) !== null || relativeTarget(url) !== null;
}

/**
 * Rewrite a project's spec file for a release (environments-42): a
 * relative citation into `selfPath` becomes a same-file citation, one
 * into a package's spec that package's address, and one into a spec of
 * no package or into a file two packages claim is removed; a decision
 * record's link keeps its text alone. A citation of `meta.md` at the
 * specs root, a same-file citation, an address and every other link
 * stay.
 */
export function rewriteForRelease(
  text: string,
  ctx: ReleaseContext,
): { text: string; warnings: CitationWarning[] } {
  const selfPath = posix.normalize(ctx.selfPath);
  const folder = posix.dirname(selfPath);
  const edits: TextEdit[] = [];
  const warnings: CitationWarning[] = [];
  for (const site of linkSites(text)) {
    if (!site.enclosed) {
      if (!isRecordLink(site)) continue;
      edits.push(labelOnly(text, site));
      warnings.push({ kind: "record", item: site.item, target: site.text });
      continue;
    }
    const target = relativeTarget(site.url);
    if (target === null || target.path === "") continue;
    const resolved = posix.normalize(posix.join(folder, target.path));
    if (resolved === selfPath) {
      edits.push(destinationEdit(text, site, `#${target.anchor}`));
      continue;
    }
    if (resolved === META_PATH) continue;
    const owner = ctx.packageOf(resolved);
    if (typeof owner === "string") {
      edits.push(destinationEdit(text, site, formatAddress(owner, target.anchor)));
      continue;
    }
    edits.push(removal(text, site));
    warnings.push({
      kind: "citation",
      item: site.item,
      target: `${resolved}#${target.anchor}`,
      ...(owner !== null ? { claims: owner.claims } : {}),
    });
  }
  return { text: applyEdits(text, edits), warnings };
}

/**
 * Rewrite a release's spec for the tree it is placed in
 * (environments-41): an address whose package's spec stands there
 * becomes the relative link to that file's anchor, and one whose
 * package's does not is removed, counted under that package in
 * `waiting`. So `specs/` holds no address, a plain link to one is
 * treated alike, keeping its text where it waits. A same-file citation,
 * a relative one — `meta.md`'s among them — and every other link stay.
 */
export function rewriteForTree(
  text: string,
  ctx: TreeContext,
): { text: string; waiting: Record<string, number> } {
  const selfPath = posix.normalize(ctx.selfPath);
  const folder = posix.dirname(selfPath);
  const edits: TextEdit[] = [];
  const waiting: Record<string, number> = {};
  for (const site of linkSites(text)) {
    const address = parseAddress(site.url);
    if (address === null) continue;
    const placed = ctx.placedPathOf(address.name);
    if (placed === null) {
      edits.push(site.enclosed ? removal(text, site) : labelOnly(text, site));
      waiting[address.name] = (waiting[address.name] ?? 0) + 1;
      continue;
    }
    const path = posix.normalize(placed);
    const link = path === selfPath ? "" : posix.relative(folder, path);
    edits.push(destinationEdit(text, site, `${link}#${address.anchor}`));
  }
  return { text: applyEdits(text, edits), waiting };
}

// ---------------------------------------------------------------
// Link sites
// ---------------------------------------------------------------

type LinkSite = {
  /** The link's own offsets, `[` to `)`. */
  start: number;
  end: number;
  /** Offset of the `]` closing the link's label. */
  labelEnd: number;
  url: string;
  title: string | null;
  /** Plain text of the label. */
  text: string;
  /** Wrapped in an outer bracket pair, the citation form of meta-16. */
  enclosed: boolean;
  /** The nearest preceding item heading's id, or "intent". */
  item: string;
};

/** Every inline link of the text in document order, as the linter reads them. */
function linkSites(text: string): LinkSite[] {
  const tree = parseMarkdown(text);
  // Only a root-level heading carries structure; one quoted in a
  // blockquote or a list is content.
  const rootHeadings = new Set<Node>(tree.children.filter((child) => child.type === "heading"));
  const sites: LinkSite[] = [];
  let item = "intent";
  visit(tree, (node: Node) => {
    if (node.type === "heading" && rootHeadings.has(node)) {
      const heading = node as Heading;
      const id = plainHeadingText(text, heading).trim();
      if ((heading.depth === 3 || heading.depth === 4) && ITEM_RE.test(id)) item = id;
      return;
    }
    if (node.type !== "link") return;
    const link = node as Link;
    const start = startOffset(link);
    const end = endOffset(link);
    sites.push({
      start,
      end,
      labelEnd: labelEndOf(text, link, start, end),
      url: link.url,
      title: link.title ?? null,
      text: plainText(link).trim(),
      enclosed: text.charAt(start - 1) === "[" && text.charAt(end) === "]",
      item,
    });
  });
  return sites;
}

function plainText(node: Node): string {
  let plain = "";
  visit(node, (child) => {
    if (child.type === "text" || child.type === "inlineCode") {
      plain += (child as unknown as { value: string }).value;
    }
  });
  return plain;
}

/** Offset of the `]` before the link's `(`: past its last label child. */
function labelEndOf(text: string, link: Link, start: number, end: number): number {
  const last = link.children[link.children.length - 1];
  const from = last === undefined ? start + 1 : endOffset(last);
  const close = text.indexOf("](", from);
  return close >= 0 && close < end ? close : from;
}

/** The path and anchor of a relative `<path>#<anchor>` or `#<anchor>` url, or null. */
function relativeTarget(url: string): { path: string; anchor: string } | null {
  const hash = url.indexOf("#");
  if (hash < 0) return null;
  const path = url.slice(0, hash);
  const anchor = url.slice(hash + 1);
  if (anchor === "" || SCHEME_RE.test(path) || path.startsWith("/")) return null;
  return { path, anchor };
}

function isRecordLink(site: LinkSite): boolean {
  if (!RECORD_TEXT_RE.test(site.text)) return false;
  const path = site.url.split("#")[0] ?? "";
  if (SCHEME_RE.test(path) || path.startsWith("/")) return false;
  return RECORD_PATH_RE.test(path);
}

/** Reduce a plain link to its label as written. */
function labelOnly(text: string, site: LinkSite): TextEdit {
  return { start: site.start, end: site.end, replacement: text.slice(site.start + 1, site.labelEnd) };
}

/** Remove an enclosed citation's `[[…](…)]` with one space directly before it. */
function removal(text: string, site: LinkSite): TextEdit {
  const open = site.start - 1;
  const start = text.charAt(open - 1) === " " ? open - 1 : open;
  return { start, end: site.end + 1, replacement: "" };
}

/**
 * Replace the link's destination alone, so its label and any title
 * stay as written; a destination in `<…>` is replaced brackets and all.
 */
function destinationEdit(text: string, site: LinkSite, url: string): TextEdit {
  const close = site.end - 1;
  let from = site.labelEnd + 2;
  while (from < close && /\s/.test(text.charAt(from))) from += 1;
  let to: number;
  if (text.charAt(from) === "<") {
    const gt = text.indexOf(">", from);
    to = gt >= 0 && gt < close ? gt + 1 : close;
  } else if (site.title === null) {
    to = close;
    while (to > from && /\s/.test(text.charAt(to - 1))) to -= 1;
  } else {
    to = from;
    while (to < close && !/\s/.test(text.charAt(to))) to += 1;
  }
  return { start: from, end: to, replacement: url };
}
