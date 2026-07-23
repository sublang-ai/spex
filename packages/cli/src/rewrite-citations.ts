// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import type { Node } from "mdast";
import { posix } from "node:path";
import {
  applyEdits,
  endOffset,
  parseMarkdown,
  startOffset,
  visit,
  type TextEdit,
} from "./markdown.js";

const LEGACY_ITEM_TARGET_RE =
  /^specs\/(?:user|dev|test|items\/(?:user|dev|test))\/(.+)$/;
const LEGACY_INTERACTIONS_RE = /^specs\/interactions\/(.+)$/;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

export type CitationRewriteOptions = {
  /**
   * Whether the pre-migration file at this specs-relative POSIX path
   * still exists. Links to surviving files (conflict-kept legacy
   * sources) are left alone so citations keep pointing at the file
   * that actually holds the cited items.
   */
  legacyTargetExists: (relPath: string) => boolean;
  /** Whether the migrated file at this specs-relative path exists. */
  newTargetExists: (relPath: string) => boolean;
};

function splitUrl(url: string): { path: string; suffix: string } {
  const hashIndex = url.indexOf("#");
  const queryIndex = url.indexOf("?");
  const cut =
    hashIndex === -1
      ? queryIndex
      : queryIndex === -1
        ? hashIndex
        : Math.min(hashIndex, queryIndex);
  if (cut === -1) return { path: url, suffix: "" };
  return { path: url.slice(0, cut), suffix: url.slice(cut) };
}

/**
 * Remap a relative URL found in `fileRelPath` (POSIX, repo-root
 * relative) when it resolves into the legacy specs layout. Returns
 * null when the link should stay as-is.
 */
export function remapLegacyUrl(
  fileRelPath: string,
  url: string,
  options: CitationRewriteOptions,
): string | null {
  if (url === "" || url.startsWith("#") || url.startsWith("/")) return null;
  if (SCHEME_RE.test(url) || url.startsWith("//")) return null;

  const { path, suffix } = splitUrl(url);
  if (path === "") return null;

  const fileDir = posix.dirname(fileRelPath);
  const resolved = posix.normalize(posix.join(fileDir, path));
  let newTarget: string | null = null;
  const itemMatch = resolved.match(LEGACY_ITEM_TARGET_RE);
  if (itemMatch !== null) {
    newTarget = posix.join("specs/packages", itemMatch[1]);
  } else {
    const interactionsMatch = resolved.match(LEGACY_INTERACTIONS_RE);
    if (interactionsMatch !== null) {
      newTarget = posix.join("specs/compositions", interactionsMatch[1]);
    }
  }
  if (newTarget === null) return null;
  // Only rewrite once the move actually happened: the old file must
  // be gone and the new one present. This keeps conflict-kept files'
  // citations intact and lets an interrupted run self-repair on rerun.
  if (options.legacyTargetExists(resolved)) return null;
  if (!options.newTargetExists(newTarget)) return null;

  if (newTarget === fileRelPath) {
    return suffix.startsWith("#") ? suffix : posix.basename(newTarget) + suffix;
  }
  return posix.relative(fileDir, newTarget) + suffix;
}

/**
 * Rewrite legacy-layout citations in one markdown file. Returns the
 * rewritten text, or null when nothing changed. Only link/image/
 * definition URLs are touched; all other bytes are preserved.
 */
export function rewriteLegacyCitations(
  fileRelPath: string,
  text: string,
  options: CitationRewriteOptions,
): string | null {
  const tree = parseMarkdown(text);
  const edits: TextEdit[] = [];

  visit(tree, (node) => {
    if (
      node.type !== "link" &&
      node.type !== "image" &&
      node.type !== "definition"
    ) {
      return;
    }
    const url = (node as unknown as { url: string }).url;
    const replacement = remapLegacyUrl(fileRelPath, url, options);
    if (replacement === null) return;

    const start = startOffset(node);
    const span = text.slice(start, endOffset(node));
    // Locate the raw URL inside the node span; skip on any encoding
    // mismatch rather than risk a bad edit (the linter reports
    // leftover legacy links). Both the preceding link text and a
    // trailing quoted title can repeat the URL, so search forward
    // from where the destination starts and take the first match.
    let urlIndex: number;
    if (node.type === "definition") {
      const label = span.match(/^\[[^\]]*\]:\s*/);
      urlIndex = label === null ? -1 : span.indexOf(url, label[0].length);
    } else {
      const children = (node as unknown as { children?: Node[] }).children;
      let searchFrom: number;
      if (children !== undefined && children.length > 0) {
        // Links: the destination follows the last text child.
        searchFrom = endOffset(children[children.length - 1]) - start;
      } else {
        // Images and empty link text: skip past the "](" opener.
        const opener = span.indexOf("](");
        searchFrom = opener === -1 ? 0 : opener + 1;
      }
      urlIndex = span.indexOf(url, Math.max(searchFrom, 0));
    }
    if (urlIndex === -1) return;
    edits.push({
      start: start + urlIndex,
      end: start + urlIndex + url.length,
      replacement,
    });
  });

  if (edits.length === 0) return null;
  return applyEdits(text, edits);
}
