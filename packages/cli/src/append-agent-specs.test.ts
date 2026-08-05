// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
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
import {
  parseAgentNames,
  reconcileAgentSpecs,
  resolveAgentTargets,
  type AgentInteraction,
} from "./append-agent-specs.js";
import { getScaffoldDir } from "./bundled-scaffold.js";

function makeTmp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), "spex-test-")));
}

function getExpectedContent(): string {
  return readFileSync(join(getScaffoldDir(), "agent-specs.txt"), "utf-8");
}

describe("reconcileAgentSpecs", () => {
  // scaffold-5/scaffold-10: a fresh default covers every native target.
  it("creates all selected instruction targets", () => {
    const dir = makeTmp();
    try {
      reconcileAgentSpecs(dir, ["CLAUDE.md", "AGENTS.md", "GEMINI.md"]);
      const expected = getExpectedContent();
      assert.ok(existsSync(join(dir, "CLAUDE.md")), "CLAUDE.md should exist");
      assert.ok(existsSync(join(dir, "AGENTS.md")), "AGENTS.md should exist");
      assert.ok(existsSync(join(dir, "GEMINI.md")), "GEMINI.md should exist");
      assert.equal(readFileSync(join(dir, "CLAUDE.md"), "utf-8"), expected);
      assert.equal(readFileSync(join(dir, "AGENTS.md"), "utf-8"), expected);
      assert.equal(readFileSync(join(dir, "GEMINI.md"), "utf-8"), expected);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // SCAF-10: only CLAUDE.md exists → only it is updated
  it("updates only CLAUDE.md when only it exists", () => {
    const dir = makeTmp();
    try {
      writeFileSync(join(dir, "CLAUDE.md"), "# Existing\n");
      reconcileAgentSpecs(dir, ["CLAUDE.md"]);

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
      reconcileAgentSpecs(dir, ["AGENTS.md"]);

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
      reconcileAgentSpecs(dir, ["CLAUDE.md"]);

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
      reconcileAgentSpecs(dir, ["CLAUDE.md"]);

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
        reconcileAgentSpecs(dir, ["CLAUDE.md"]);
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
      reconcileAgentSpecs(dir, ["CLAUDE.md"]);

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

  it("ignores a managed heading inside a code fence", () => {
    const dir = makeTmp();
    try {
      const before =
        "# Project\n\n```markdown\n## Specs (Source of Truth)\nfenced example\n```\n";
      writeFileSync(join(dir, "CLAUDE.md"), before);
      reconcileAgentSpecs(dir, ["CLAUDE.md"]);

      const content = readFileSync(join(dir, "CLAUDE.md"), "utf-8");
      assert.ok(
        content.includes("fenced example\n```"),
        "fenced example should remain intact",
      );
      assert.ok(
        content.startsWith(before.slice(0, -1)),
        "section should be appended after the fence, not spliced into it",
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("replaces through a fenced h2 lookalike up to the real next heading", () => {
    const dir = makeTmp();
    try {
      const stale =
        "## Specs (Source of Truth)\n\nstale text\n\n```markdown\n## fenced lookalike\n```\n\nstale tail\n";
      const before = `${stale}\n## Next Section\n\nuser content\n`;
      writeFileSync(join(dir, "CLAUDE.md"), before);
      reconcileAgentSpecs(dir, ["CLAUDE.md"]);

      const content = readFileSync(join(dir, "CLAUDE.md"), "utf-8");
      assert.ok(
        !content.includes("stale tail"),
        "the whole stale section should be replaced, past the fenced lookalike",
      );
      assert.ok(
        content.includes("\n## Next Section\n\nuser content\n"),
        "user content after the section should survive",
      );
      assert.ok(
        content.startsWith(getExpectedContent()),
        "managed section should hold the current agent text",
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
      reconcileAgentSpecs(dir, ["CLAUDE.md"]);

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

  it("switches targets without removing unrelated file content", () => {
    const dir = makeTmp();
    try {
      writeFileSync(
        join(dir, "CLAUDE.md"),
        `# Claude\n\n${getExpectedContent()}\n## Project Notes\n\nKeep this.\n`,
      );

      reconcileAgentSpecs(dir, ["GEMINI.md"]);

      assert.equal(
        readFileSync(join(dir, "CLAUDE.md"), "utf-8"),
        "# Claude\n\n## Project Notes\n\nKeep this.\n",
      );
      assert.equal(
        readFileSync(join(dir, "GEMINI.md"), "utf-8"),
        getExpectedContent(),
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // The managed section's line endings are the bundle's, not the
  // file's: git checks agent-specs.txt out with CRLF on Windows. The
  // seam left behind must follow the content that survives, or
  // removing the section rewrites the user's own line endings.
  it("keeps surviving line endings when the removed section differs", () => {
    const dir = makeTmp();
    try {
      const crlfSection = getExpectedContent().replace(/\r?\n/g, "\r\n");
      writeFileSync(
        join(dir, "CLAUDE.md"),
        `# Claude\n\n${crlfSection}\n## Project Notes\n\nKeep this.\n`,
      );

      reconcileAgentSpecs(dir, ["GEMINI.md"]);

      assert.equal(
        readFileSync(join(dir, "CLAUDE.md"), "utf-8"),
        "# Claude\n\n## Project Notes\n\nKeep this.\n",
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("deletes a deselected file containing only the managed section", () => {
    const dir = makeTmp();
    try {
      writeFileSync(join(dir, "AGENTS.md"), getExpectedContent());
      reconcileAgentSpecs(dir, ["GEMINI.md"]);
      assert.equal(existsSync(join(dir, "AGENTS.md")), false);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});

function scriptedInteraction(responses: string[]): AgentInteraction {
  return {
    interactive: true,
    ask(): string | null {
      return responses.shift() ?? null;
    },
  };
}

describe("agent target selection", () => {
  it("maps every supported Cligent agent to its native target", () => {
    assert.deepEqual(
      resolveAgentTargets("/unused", parseAgentNames("all")),
      ["CLAUDE.md", "AGENTS.md", "GEMINI.md"],
    );
    assert.deepEqual(
      resolveAgentTargets("/unused", parseAgentNames("codex,kimi,opencode")),
      ["AGENTS.md"],
    );
    assert.deepEqual(
      resolveAgentTargets("/unused", parseAgentNames("gemini,claude")),
      ["CLAUDE.md", "GEMINI.md"],
    );
  });

  it("defaults a fresh non-interactive target to every file", () => {
    const dir = makeTmp();
    try {
      assert.deepEqual(
        resolveAgentTargets(dir, undefined, {
          interactive: false,
          ask: () => null,
        }),
        ["CLAUDE.md", "AGENTS.md", "GEMINI.md"],
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("keeps managed targets with one default-yes confirmation", () => {
    const dir = makeTmp();
    try {
      writeFileSync(join(dir, "CLAUDE.md"), getExpectedContent());
      const interaction = scriptedInteraction([""]);
      assert.deepEqual(
        resolveAgentTargets(dir, undefined, interaction),
        ["CLAUDE.md"],
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("opens the selector when the current targets changed", () => {
    const dir = makeTmp();
    try {
      writeFileSync(join(dir, "CLAUDE.md"), getExpectedContent());
      assert.deepEqual(
        resolveAgentTargets(
          dir,
          undefined,
          scriptedInteraction(["n", "3"]),
        ),
        ["GEMINI.md"],
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("uses existing supported files as the one-time suggestion", () => {
    const dir = makeTmp();
    try {
      writeFileSync(join(dir, "GEMINI.md"), "# Gemini\n");
      assert.deepEqual(
        resolveAgentTargets(
          dir,
          undefined,
          scriptedInteraction(["yes"]),
        ),
        ["GEMINI.md"],
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("rejects invalid names and canceled prompts", () => {
    assert.throws(() => parseAgentNames("cursor"), /Unknown agent/);
    const dir = makeTmp();
    try {
      assert.throws(
        () =>
          resolveAgentTargets(
            dir,
            undefined,
            scriptedInteraction([]),
          ),
        /canceled/,
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});

/**
 * Run the real terminalInteraction.ask in a child process and reply on
 * its stdin only after the prompt appears on stderr, so the reader is
 * observed waiting for input rather than consuming a pre-buffered
 * reply. Passing null ends stdin at the prompt instead of replying.
 */
function askInChild(
  reply: string | null,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const moduleUrl = new URL("./append-agent-specs.js", import.meta.url).href;
  const script =
    `const { terminalInteraction } = await import(${JSON.stringify(moduleUrl)});\n` +
    `const answer = terminalInteraction.ask("confirm? ");\n` +
    `process.stdout.write(JSON.stringify(` +
    `{ answer, interactive: terminalInteraction.interactive }));`;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", script]);
    let stdout = "";
    let stderr = "";
    let replied = false;
    child.stdin.on("error", () => {});
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (replied || !stderr.includes("confirm? ")) return;
      replied = true;
      setTimeout(() => {
        if (reply === null) child.stdin.end();
        else child.stdin.write(reply);
      }, 50);
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

describe("terminal interaction", () => {
  // scaffold-55: the real reader waits for a reply that arrives only
  // after the prompt is shown.
  it("delivers a reply given after the prompt is shown", async () => {
    const result = await askInChild("y\n");
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      answer: "y",
      interactive: false,
    });
  });

  // scaffold-55: end of input at the prompt cancels instead of crashing.
  it("returns null when input ends at the prompt", async () => {
    const result = await askInChild(null);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      answer: null,
      interactive: false,
    });
  });
});
