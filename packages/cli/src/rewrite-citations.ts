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

const LEGACY_TARGET_RE =
  /^specs\/(?:user|dev|test|items\/(?:user|dev|test))\/(.+)$/;
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
  const match = resolved.match(LEGACY_TARGET_RE);
  if (match === null) return null;

  const newTarget = posix.join("specs/packages", match[1]);
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
    // leftover legacy links). Definitions search forward from the
    // label (a quoted title could repeat the URL); links/images
    // search backward (the link text could repeat the URL).
    let urlIndex: number;
    if (node.type === "definition") {
      const label = span.match(/^\[[^\]]*\]:\s*/);
      urlIndex = label === null ? -1 : span.indexOf(url, label[0].length);
    } else {
      urlIndex = span.lastIndexOf(url);
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
