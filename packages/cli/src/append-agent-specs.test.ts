// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  realpathSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendAgentSpecs } from "./append-agent-specs.js";
import { getScaffoldDir } from "./bundled-scaffold.js";

function makeTmp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), "spex-test-")));
}

function getExpectedContent(): string {
  return readFileSync(join(getScaffoldDir(), "agent-specs.txt"), "utf-8");
}

describe("appendAgentSpecs", () => {
  // SCAF-10: neither file exists → both created
  it("creates both CLAUDE.md and AGENTS.md when neither exists", () => {
    const dir = makeTmp();
    try {
      appendAgentSpecs(dir);
      const expected = getExpectedContent();
      assert.ok(existsSync(join(dir, "CLAUDE.md")), "CLAUDE.md should exist");
      assert.ok(existsSync(join(dir, "AGENTS.md")), "AGENTS.md should exist");
      assert.equal(readFileSync(join(dir, "CLAUDE.md"), "utf-8"), expected);
      assert.equal(readFileSync(join(dir, "AGENTS.md"), "utf-8"), expected);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // SCAF-10: only CLAUDE.md exists → only it is updated
  it("updates only CLAUDE.md when only it exists", () => {
    const dir = makeTmp();
    try {
      writeFileSync(join(dir, "CLAUDE.md"), "# Existing\n");
      appendAgentSpecs(dir);

      const content = readFileSync(join(dir, "CLAUDE.md"), "utf-8");
      assert.ok(
        content.includes("## Specs (Source of Truth)"),
        "CLAUDE.md should have specs section",
      );
      assert.ok(
        content.startsWith("# Existing\n"),
        "CLAUDE.md should preserve original content",
      );
      assert.ok(
        !existsSync(join(dir, "AGENTS.md")),
        "AGENTS.md should not be created",
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // SCAF-10: only AGENTS.md exists → only it is updated
  it("updates only AGENTS.md when only it exists", () => {
    const dir = makeTmp();
    try {
      writeFileSync(join(dir, "AGENTS.md"), "# Agents\n");
      appendAgentSpecs(dir);

      const content = readFileSync(join(dir, "AGENTS.md"), "utf-8");
      assert.ok(
        content.includes("## Specs (Source of Truth)"),
        "AGENTS.md should have specs section",
      );
      assert.ok(
        !existsSync(join(dir, "CLAUDE.md")),
        "CLAUDE.md should not be created",
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // SCAF-10: section exists → replace in place
  it("replaces existing specs section in place", () => {
    const dir = makeTmp();
    try {
      const before = "# Project\n\n## Specs (Source of Truth)\n\nOld content.\n\n## Other\n\nKeep this.\n";
      writeFileSync(join(dir, "CLAUDE.md"), before);
      appendAgentSpecs(dir);

      const content = readFileSync(join(dir, "CLAUDE.md"), "utf-8");
      assert.ok(
        content.startsWith("# Project\n\n"),
        "content before section should be preserved",
      );
      assert.ok(
        content.includes("## Specs (Source of Truth)"),
        "section heading should remain",
      );
      assert.ok(
        content.includes("specs/map.md"),
        "new section content should be present",
      );
      assert.ok(
        content.includes("## Other\n\nKeep this.\n"),
        "content after section should be preserved",
      );
      assert.ok(
        !content.includes("Old content"),
        "old section content should be replaced",
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // SCAF-10: replace section in CRLF file
  it("replaces existing specs section in a CRLF file", () => {
    const dir = makeTmp();
    try {
      const before =
        "# Project\r\n\r\n## Specs (Source of Truth)\r\n\r\nOld content.\r\n\r\n## Other\r\n\r\nKeep this.\r\n";
      writeFileSync(join(dir, "CLAUDE.md"), before);
      appendAgentSpecs(dir);

      const content = readFileSync(join(dir, "CLAUDE.md"), "utf-8");
      assert.ok(
        content.startsWith("# Project\r\n\r\n"),
        "content before section should be preserved",
      );
      assert.ok(
        content.includes("## Specs (Source of Truth)"),
        "section heading should remain",
      );
      assert.ok(
        content.includes("specs/map.md"),
        "new section content should be present",
      );
      assert.ok(
        content.includes("## Other\r\n\r\nKeep this.\r\n"),
        "content after section should be preserved",
      );
      assert.ok(
        !content.includes("Old content"),
        "old section content should be replaced",
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // SCAF-5/SCAF-10: section identical → skip
  it("skips file when replacement is identical", () => {
    const dir = makeTmp();
    try {
      const expected = getExpectedContent();
      writeFileSync(join(dir, "CLAUDE.md"), expected);

      const output: string[] = [];
      const origLog = console.log;
      console.log = (msg: string) => output.push(msg);
      try {
        appendAgentSpecs(dir);
      } finally {
        console.log = origLog;
      }

      const claudeLine = output.find((l) => l.includes("CLAUDE.md"));
      assert.ok(claudeLine, "should have output for CLAUDE.md");
      assert.ok(
        claudeLine.includes("(skipped)"),
        `should show (skipped): ${claudeLine}`,
      );

      // Content should be unchanged
      assert.equal(readFileSync(join(dir, "CLAUDE.md"), "utf-8"), expected);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // SCAF-10: prose mention of heading text should not match
  it("appends when heading text appears only in prose", () => {
    const dir = makeTmp();
    try {
      const before =
        "# Project\n\nSee `## Specs (Source of Truth)` for details.\n";
      writeFileSync(join(dir, "CLAUDE.md"), before);
      appendAgentSpecs(dir);

      const content = readFileSync(join(dir, "CLAUDE.md"), "utf-8");
      // Original prose preserved
      assert.ok(
        content.includes("See `## Specs (Source of Truth)` for details."),
        "prose line should remain intact",
      );
      // Section appended at end, not spliced into prose
      const lastIdx = content.lastIndexOf("## Specs (Source of Truth)");
      assert.ok(
        lastIdx > before.length - 1,
        "section should be appended, not matched mid-prose",
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // SCAF-10: heading absent (case mismatch) → append
  it("appends when heading has case mismatch", () => {
    const dir = makeTmp();
    try {
      const before = "# Project\n\n## specs (source of truth)\n\nWrong case.\n";
      writeFileSync(join(dir, "CLAUDE.md"), before);
      appendAgentSpecs(dir);

      const content = readFileSync(join(dir, "CLAUDE.md"), "utf-8");
      // Original case-mismatched section preserved
      assert.ok(
        content.includes("## specs (source of truth)"),
        "original heading should remain",
      );
      // New section appended
      const lastIdx = content.lastIndexOf("## Specs (Source of Truth)");
      assert.ok(lastIdx > 0, "correct heading should be appended");
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
