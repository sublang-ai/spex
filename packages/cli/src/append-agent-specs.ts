// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Heading } from "mdast";
import { getScaffoldDir } from "./bundled-scaffold.js";
import { headingText, parseMarkdown, startOffset } from "./markdown.js";

const SECTION_TITLE = "Specs (Source of Truth)";
const AGENT_FILES = ["CLAUDE.md", "AGENTS.md"];

/**
 * Extract the specs section from content: from the managed heading to
 * the next h2 heading or end of file. The content is parsed as
 * Markdown, so only a real heading matches — a lookalike line inside a
 * fenced code block neither starts the section nor terminates it.
 * Returns [start, end] character offsets, or null if not found.
 */
function findSection(content: string): [number, number] | null {
  const headings = parseMarkdown(content).children.filter(
    (node): node is Heading => node.type === "heading" && node.depth === 2,
  );
  const managed = headings.find(
    (heading) => headingText(content, heading) === SECTION_TITLE,
  );
  if (managed === undefined) return null;

  const next = headings.find(
    (heading) => startOffset(heading) > startOffset(managed),
  );
  if (next === undefined) return [startOffset(managed), content.length];

  // End before the line ending that precedes the next heading, so the
  // separator between sections stays outside the replaced range.
  let end = startOffset(next);
  if (content[end - 1] === "\n") end -= content[end - 2] === "\r" ? 2 : 1;
  return [startOffset(managed), end];
}

/**
 * Process a single agent file: replace section in place, append,
 * or create.
 *
 * Returns: "created" | "updated" | "skipped" | null (file absent)
 */
function processFile(
  filePath: string,
  specsContent: string,
  fileExists: boolean,
  shouldCreate: boolean,
): "created" | "updated" | "skipped" | null {
  if (!fileExists) {
    if (shouldCreate) {
      writeFileSync(filePath, specsContent);
      return "created";
    }
    return null;
  }

  const existing = readFileSync(filePath, "utf-8");
  const section = findSection(existing);

  if (section !== null) {
    const [start, end] = section;
    const currentSection = existing.slice(start, end);
    // Trim trailing whitespace for comparison
    if (currentSection.trimEnd() === specsContent.trimEnd()) {
      return "skipped";
    }
    const updated = existing.slice(0, start) + specsContent + existing.slice(end);
    writeFileSync(filePath, updated);
    return "updated";
  }

  // Heading absent — append
  const separator = existing.endsWith("\n") ? "\n" : "\n\n";
  writeFileSync(filePath, existing + separator + specsContent);
  return "updated";
}

/**
 * Read scaffold/agent-specs.txt and process CLAUDE.md and AGENTS.md
 * at basePath.
 *
 * SCAF-10: when neither exists, both are created; when only one
 * exists, only that file is updated. Section replacement parses
 * Markdown and matches the H2 heading "Specs (Source of Truth)"
 * case-sensitively, immune to lookalikes inside code fences.
 * SCAF-5: replace in place or skip when identical.
 *
 * With `createMissing: false` (the --update flow), absent files stay
 * absent; only existing agent files get their managed section
 * refreshed.
 */
export function appendAgentSpecs(
  basePath: string,
  options: { createMissing?: boolean } = {},
): void {
  const createMissing = options.createMissing ?? true;
  const scaffoldDir = getScaffoldDir();
  const specsContent = readFileSync(
    join(scaffoldDir, "agent-specs.txt"),
    "utf-8",
  );

  const presence = AGENT_FILES.map((f) => existsSync(join(basePath, f)));
  const neitherExists = presence.every((p) => !p);

  for (let i = 0; i < AGENT_FILES.length; i++) {
    const fileName = AGENT_FILES[i];
    const filePath = join(basePath, fileName);
    const fileExists = presence[i];
    const shouldCreate = createMissing && neitherExists;

    const result = processFile(filePath, specsContent, fileExists, shouldCreate);

    switch (result) {
      case "created":
        console.log(`  ${fileName} (created)`);
        break;
      case "updated":
        console.log(`  ${fileName} (updated)`);
        break;
      case "skipped":
        console.log(`  ${fileName} (skipped)`);
        break;
      case null:
        // File absent and not creating — no output
        break;
    }
  }
}
