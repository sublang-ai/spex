// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import {
  existsSync,
  readFileSync,
  readSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { isatty } from "node:tty";
import type { Heading } from "mdast";
import { getScaffoldDir } from "./bundled-scaffold.js";
import { headingText, parseMarkdown, startOffset } from "./markdown.js";

const SECTION_TITLE = "Specs (Source of Truth)";

export const AGENT_TARGETS = [
  {
    file: "CLAUDE.md",
    agents: ["claude"],
    label: "Claude Code",
  },
  {
    file: "AGENTS.md",
    agents: ["codex", "kimi", "opencode"],
    label: "Codex / Kimi Code / OpenCode",
  },
  {
    file: "GEMINI.md",
    agents: ["gemini"],
    label: "Gemini CLI",
  },
] as const;

export type AgentName = (typeof AGENT_TARGETS)[number]["agents"][number];
export type AgentTargetFile = (typeof AGENT_TARGETS)[number]["file"];

const AGENT_NAMES = AGENT_TARGETS.flatMap((target) => target.agents);
const AGENT_FILES = AGENT_TARGETS.map((target) => target.file);

export interface AgentInteraction {
  interactive: boolean;
  ask(prompt: string): string | null;
}

// fd-level probes and a raw fd read, never process.stdin: materializing
// the stdin stream (even just reading .isTTY) switches fd 0 to
// non-blocking behind this reader's back.
export const terminalInteraction: AgentInteraction = {
  interactive: isatty(0) && isatty(2),
  ask(prompt: string): string | null {
    process.stderr.write(prompt);
    const buffer = Buffer.alloc(1024);
    for (;;) {
      let bytes: number;
      try {
        bytes = readSync(0, buffer, 0, buffer.length, null);
      } catch (error) {
        // A non-blocking fd 0 — inherited from the spawning process, or
        // a side effect of an import materializing process.stdin —
        // reports EAGAIN instead of waiting for the reply.
        if ((error as NodeJS.ErrnoException).code === "EAGAIN") {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
          continue;
        }
        throw error;
      }
      if (bytes === 0) return null;
      return buffer.toString("utf-8", 0, bytes).trim();
    }
  },
};

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

function hasManagedSection(filePath: string): boolean {
  return (
    existsSync(filePath) &&
    findSection(readFileSync(filePath, "utf-8")) !== null
  );
}

function targetsForAgents(agents: readonly AgentName[]): AgentTargetFile[] {
  const selected = new Set(agents);
  return AGENT_TARGETS.filter((target) =>
    target.agents.some((agent) => selected.has(agent)),
  ).map((target) => target.file);
}

export function parseAgentNames(value: string): AgentName[] {
  const tokens = value
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) {
    throw new Error("--agents requires a comma-separated agent list");
  }
  if (tokens.includes("all")) {
    if (tokens.length !== 1) {
      throw new Error("--agents=all cannot be combined with other agents");
    }
    return [...AGENT_NAMES];
  }

  const unknown = tokens.filter(
    (token): token is string => !AGENT_NAMES.includes(token as AgentName),
  );
  if (unknown.length > 0) {
    throw new Error(
      `Unknown agent${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}. Supported agents: ${AGENT_NAMES.join(", ")}, all`,
    );
  }
  return [...new Set(tokens as AgentName[])];
}

function detectCurrentTargets(basePath: string): AgentTargetFile[] {
  const managed = AGENT_FILES.filter((file) =>
    hasManagedSection(join(basePath, file)),
  );
  if (managed.length > 0) return managed;
  return AGENT_FILES.filter((file) => existsSync(join(basePath, file)));
}

function targetSummary(files: readonly AgentTargetFile[]): string {
  const selected = new Set(files);
  return AGENT_TARGETS.filter((target) => selected.has(target.file))
    .map(
      (target) =>
        `  ${AGENT_TARGETS.indexOf(target) + 1}. ${target.label} (${target.file})`,
    )
    .join("\n");
}

function promptForTargets(interaction: AgentInteraction): AgentTargetFile[] {
  const response = interaction.ask(
    "Select the coding agents that should receive Spex instructions:\n" +
      targetSummary(AGENT_FILES) +
      "\nEnter numbers separated by commas [all]: ",
  );
  if (response === null) throw new Error("agent selection canceled");
  if (response === "" || response.toLowerCase() === "all") {
    return [...AGENT_FILES];
  }

  const numbers = response.split(",").map((token) => token.trim());
  if (
    numbers.some((token) => !/^[1-3]$/.test(token)) ||
    numbers.length === 0
  ) {
    throw new Error(
      "agent selection must be all or comma-separated numbers 1-3",
    );
  }
  return [
    ...new Set(numbers.map((number) => AGENT_FILES[Number(number) - 1])),
  ];
}

/** Resolve the desired instruction targets without writing the project. */
export function resolveAgentTargets(
  basePath: string,
  explicitAgents?: readonly AgentName[],
  interaction: AgentInteraction = terminalInteraction,
): AgentTargetFile[] {
  if (explicitAgents !== undefined) return targetsForAgents(explicitAgents);

  const current = detectCurrentTargets(basePath);
  if (!interaction.interactive) {
    return current.length > 0 ? current : [...AGENT_FILES];
  }
  if (current.length === 0) return promptForTargets(interaction);

  const response = interaction.ask(
    "Spex agent instructions currently target:\n" +
      targetSummary(current) +
      "\nKeep this selection? [Y/n] ",
  );
  if (response === null) throw new Error("agent selection canceled");
  if (response === "" || /^y(?:es)?$/i.test(response)) return current;
  if (/^n(?:o)?$/i.test(response)) return promptForTargets(interaction);
  throw new Error("answer y or n when confirming agent instructions");
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

function removeManagedSection(filePath: string): "removed" | null {
  if (!existsSync(filePath)) return null;
  const existing = readFileSync(filePath, "utf-8");
  const section = findSection(existing);
  if (section === null) return null;

  const [start, end] = section;
  const before = existing.slice(0, start).trimEnd();
  const after = existing.slice(end).trimStart();
  if (before === "" && after === "") {
    unlinkSync(filePath);
    return "removed";
  }

  // Infer the seam from the content that survives, never from the
  // whole file: the managed section carries the bundle's line endings
  // (CRLF where git checked agent-specs.txt out on Windows), and a
  // section being deleted must not impose them on what remains.
  const surviving = before !== "" ? before : after;
  const lineEnding = surviving.includes("\r\n") ? "\r\n" : "\n";
  const updated =
    before !== "" && after !== ""
      ? `${before}${lineEnding}${lineEnding}${after}`
      : before !== ""
        ? `${before}${lineEnding}`
        : after;
  writeFileSync(filePath, updated);
  return "removed";
}

/**
 * Reconcile the selected native agent files with the managed section
 * from scaffold/agent-specs.txt. Unselected files lose only that
 * section; unrelated content is never removed.
 */
export function reconcileAgentSpecs(
  basePath: string,
  selectedTargets: readonly AgentTargetFile[],
): void {
  if (selectedTargets.length === 0) {
    throw new Error("at least one agent instruction target must be selected");
  }
  const scaffoldDir = getScaffoldDir();
  const specsContent = readFileSync(
    join(scaffoldDir, "agent-specs.txt"),
    "utf-8",
  );
  const selected = new Set(selectedTargets);

  for (const fileName of AGENT_FILES) {
    const filePath = join(basePath, fileName);
    const fileExists = existsSync(filePath);
    const result = selected.has(fileName)
      ? processFile(filePath, specsContent, fileExists, true)
      : removeManagedSection(filePath);

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
      case "removed":
        console.log(`  ${fileName} (removed)`);
        break;
      case null:
        // Unselected and unmanaged — no output.
        break;
    }
  }
}
