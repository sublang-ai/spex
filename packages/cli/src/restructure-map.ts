// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import type { Code, Heading, Node, Root, Table, TableRow } from "mdast";
import type { ScaffoldLanguage } from "./copy-templates.js";
import {
  applyEdits,
  endOffset,
  parseMarkdown,
  sliceNode,
  startOffset,
  visit,
  type TextEdit,
} from "./markdown.js";

// Localized fragments for the map transform, matching the bundled
// active-language map.md templates.
const MAP_STRINGS: Record<
  ScaffoldLanguage,
  {
    layoutLines: string[];
    compositionsHeading: string;
    compositionsEmpty: string;
  }
> = {
  en: {
    layoutLines: [
      "packages/     Spec packages (one file per package)",
      "compositions/ Cross-package compositions: scenarios, bindings, tests",
    ],
    compositionsHeading: "Compositions",
    compositionsEmpty:
      "None yet. Add files under `compositions/` as packages start working together.",
  },
  zh: {
    layoutLines: [
      "packages/     规约包（每包一个文件）",
      "compositions/ 跨包组合：场景、绑定与测试",
    ],
    compositionsHeading: "组合",
    compositionsEmpty:
      "暂无。当多个包开始协作时，在 `compositions/` 下添加文件。",
  },
};

const GROUP_NAMES = new Set(["user", "dev", "test"]);
const GROUP_ORDER = ["user", "dev", "test"];

function cellTexts(text: string, row: TableRow): string[] {
  return row.children.map((cell) =>
    cell.children.length === 0
      ? ""
      : text
          .slice(
            startOffset(cell.children[0]),
            endOffset(cell.children[cell.children.length - 1]),
          )
          .trim(),
  );
}

/**
 * Reshape a legacy per-package group table (`Group | File | Summary`
 * rows keyed user/dev/test) into a single-row `File | Summary` table.
 * Returns null when the table is not a group table.
 */
function reshapeGroupTable(text: string, table: Table): string | null {
  const [header, ...body] = table.children;
  if (header === undefined || body.length === 0) return null;
  if (header.children.length < 2) return null;

  const rows = body.map((row) => cellTexts(text, row));
  if (!rows.every((cells) => GROUP_NAMES.has(cells[0] ?? ""))) return null;

  const ordered = [...rows].sort(
    (a, b) => GROUP_ORDER.indexOf(a[0]) - GROUP_ORDER.indexOf(b[0]),
  );
  const primary = ordered[0];
  const file = primary[1] ?? "";
  const summaries: string[] = [];
  for (const cells of ordered) {
    const summary = (cells[2] ?? "").trim();
    if (summary !== "" && !summaries.includes(summary)) summaries.push(summary);
  }

  const headerCells = cellTexts(text, header).slice(1);
  const headerLine = `| ${headerCells.join(" | ")} |`;
  const delimiter = `| ${headerCells.map(() => "---").join(" | ")} |`;
  const rowLine = `| ${file} | ${summaries.join("; ")} |`;
  return [headerLine, delimiter, rowLine].join("\n");
}

/**
 * Replace the legacy user/dev/test lines of the layout fenced block
 * with the packages/interactions lines. Returns null when the block
 * has no legacy lines.
 */
function rewriteLayoutBlock(
  text: string,
  code: Code,
  layoutLines: string[],
): string | null {
  const lines = code.value.split("\n");
  const isLegacy = (line: string) => /^(user|dev|test)\//.test(line);
  if (!lines.some(isLegacy)) return null;

  const result: string[] = [];
  let replaced = false;
  for (const line of lines) {
    if (isLegacy(line)) {
      if (!replaced) {
        result.push(...layoutLines);
        replaced = true;
      }
      continue;
    }
    result.push(line);
  }

  const source = sliceNode(text, code);
  const fenceMatch = source.match(
    /^(\s*(?:```|~~~)[^\n]*\n)([\s\S]*?)(\n\s*(?:```|~~~)\s*)$/,
  );
  if (fenceMatch === null) return null;
  return fenceMatch[1] + result.join("\n") + fenceMatch[3];
}

/**
 * Restructure a user-maintained map.md for the packages/interactions
 * layout: layout block lines, group tables reshaped to one row per
 * package, and an Interactions section appended when absent. All
 * other content is preserved. Returns null when nothing changed.
 */
export function restructureMap(
  text: string,
  language: ScaffoldLanguage,
): string | null {
  const strings = MAP_STRINGS[language];
  const tree: Root = parseMarkdown(text);
  const edits: TextEdit[] = [];

  let layoutPending = true;
  visit(tree, (node: Node) => {
    if (node.type === "code" && layoutPending) {
      const replacement = rewriteLayoutBlock(
        text,
        node as Code,
        strings.layoutLines,
      );
      if (replacement !== null) {
        layoutPending = false;
        edits.push({
          start: startOffset(node),
          end: endOffset(node),
          replacement,
        });
      }
      return;
    }
    if (node.type === "table") {
      const replacement = reshapeGroupTable(text, node as Table);
      if (replacement !== null) {
        edits.push({
          start: startOffset(node),
          end: endOffset(node),
          replacement,
        });
      }
    }
  });

  let result = edits.length > 0 ? applyEdits(text, edits) : text;

  const renamed = renameInteractionsHeading(result, language);
  if (renamed !== null) result = renamed;

  const hasCompositions = new RegExp(
    `^##\\s+(${strings.compositionsHeading}|Compositions)\\s*$`,
    "m",
  ).test(result);
  if (!hasCompositions) {
    result =
      result.trimEnd() +
      `\n\n## ${strings.compositionsHeading}\n\n${strings.compositionsEmpty}\n`;
  }

  return result === text ? null : result;
}

// Heading names of the map's layout section in the bundled
// templates, past and present.
const LAYOUT_HEADINGS = new Set(["Layout", "目录结构", "布局"]);

/**
 * SCAF-50: rename legacy interactions entries of a map — a
 * `## Interactions` (or `## 交互`) heading and an `interactions/`
 * line inside the code block under the map's Layout heading — to
 * the active-language Compositions forms. Only the block
 * structurally under the Layout heading is rewritten, so a
 * lookalike example elsewhere in the map is never touched.
 * Returns null when the map has neither entry.
 */
export function renameInteractionsHeading(
  text: string,
  language: ScaffoldLanguage,
): string | null {
  const strings = MAP_STRINGS[language];
  let result = text.replace(
    /^##(\s+)(Interactions|交互)(\s*)$/m,
    `##$1${strings.compositionsHeading}$3`,
  );

  const tree: Root = parseMarkdown(result);
  let layoutDepth: number | null = null;
  let inLayout = false;
  let edit: TextEdit | null = null;
  visit(tree, (node: Node) => {
    if (edit !== null) return;
    if (node.type === "heading") {
      const heading = node as Heading;
      const title = sliceNode(result, heading).replace(/^#+\s*/, "").trim();
      if (LAYOUT_HEADINGS.has(title)) {
        layoutDepth = heading.depth;
        inLayout = true;
      } else if (layoutDepth !== null && heading.depth <= layoutDepth) {
        inLayout = false;
      }
      return;
    }
    if (!inLayout || node.type !== "code") return;
    const code = node as Code;
    const lines = code.value.split("\n");
    const isInteractions = (line: string) => /^interactions\/[ \t]/.test(line);
    if (!lines.some(isInteractions)) return;
    const replaced = lines
      .map((line) => (isInteractions(line) ? strings.layoutLines[1] : line))
      .join("\n");
    const source = sliceNode(result, code);
    const fenceMatch = source.match(
      /^(\s*(?:```|~~~)[^\n]*\n)([\s\S]*?)(\n\s*(?:```|~~~)\s*)$/,
    );
    if (fenceMatch === null) return;
    edit = {
      start: startOffset(code),
      end: endOffset(code),
      replacement: fenceMatch[1] + replaced + fenceMatch[3],
    };
  });
  if (edit !== null) result = applyEdits(result, [edit]);

  return result === text ? null : result;
}
