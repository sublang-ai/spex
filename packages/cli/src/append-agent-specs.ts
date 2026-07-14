// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getScaffoldDir } from "./bundled-scaffold.js";

const SECTION_HEADING = "## Specs (Source of Truth)";
const AGENT_FILES = ["CLAUDE.md", "AGENTS.md"];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extract the specs section from content: from the heading to the
 * next h2 heading or end of file.
 * Returns [start, end] character offsets, or null if not found.
 */
function findSection(content: string): [number, number] | null {
  // Match only as a real H2 heading at start of a line (or start of file).
  // Handle both LF and CRLF line endings.
  const pattern = new RegExp(
    `(?:^|\\r?\\n)${escapeRegExp(SECTION_HEADING)}(?:\\r?\\n|$)`,
  );
  const match = pattern.exec(content);
  if (!match) return null;

  // Start at the heading itself, not the preceding line ending
  const matchText = match[0];
  let idx = match.index;
  if (matchText.startsWith("\r\n")) idx += 2;
  else if (matchText.startsWith("\n")) idx += 1;

  // Find the next ## heading after the section heading line
  const afterHeading = idx + SECTION_HEADING.length;
  const nextH2Match = content.slice(afterHeading).match(/\r?\n## /);
  const end =
    nextH2Match?.index !== undefined
      ? afterHeading + nextH2Match.index
      : content.length;

  return [idx, end];
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
 * exists, only that file is updated. Section replacement uses
 * case-sensitive match on "## Specs (Source of Truth)".
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
