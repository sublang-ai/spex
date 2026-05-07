// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, execSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const CLI = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "dist",
  "cli.js",
);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function run(
  args: string[],
  opts?: { cwd?: string },
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      encoding: "utf-8",
      cwd: opts?.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout: string; stderr: string; status: number };
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", exitCode: e.status };
  }
}

function makeTmp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), "spex-integ-")));
}

function initGit(dir: string): void {
  execSync("git init", { cwd: dir, stdio: "ignore" });
  execSync("git config user.email test@example.com", {
    cwd: dir,
    stdio: "ignore",
  });
  execSync("git config user.name Test", { cwd: dir, stdio: "ignore" });
}

function gitCommit(dir: string, message: string): void {
  execSync("git add specs", { cwd: dir, stdio: "ignore" });
  execSync(`git commit -m "${message}"`, { cwd: dir, stdio: "ignore" });
}

function readSpecMergePrompt(): string {
  const spec = readFileSync(
    join(ROOT, "specs", "items", "user", "scaffold.md"),
    "utf-8",
  );
  const match = spec.match(
    /Example merge prompt[^:]*:\r?\n\r?\n```text\r?\n([\s\S]*?)\r?\n```/,
  );
  assert.ok(match, "SCAF-11 example merge prompt should exist");
  return match[1].replace(/\r\n/g, "\n");
}

describe("CLI integration", () => {
  // Acceptance: spex scaffold <path> creates full specs structure
  it("scaffold <path> creates specs structure and agent files", () => {
    const dir = makeTmp();
    try {
      const result = run(["scaffold", dir]);
      assert.equal(result.exitCode, 0, `should exit 0: ${result.stderr}`);

      // Directories
      assert.ok(existsSync(join(dir, "specs")));
      assert.ok(existsSync(join(dir, "specs", "decisions")));
      assert.ok(existsSync(join(dir, "specs", "iterations")));
      assert.ok(existsSync(join(dir, "specs", "items", "user")));
      assert.ok(existsSync(join(dir, "specs", "items", "dev")));
      assert.ok(existsSync(join(dir, "specs", "items", "test")));

      // Template files
      assert.ok(existsSync(join(dir, "specs", "map.md")));
      assert.ok(existsSync(join(dir, "specs", "meta.md")));
      assert.ok(existsSync(join(dir, "specs", "items", "user", ".gitkeep")));
      assert.ok(
        existsSync(join(dir, "specs", "decisions", "000-spec-structure-format.md")),
      );

      // Agent files
      assert.ok(existsSync(join(dir, "CLAUDE.md")));
      assert.ok(existsSync(join(dir, "AGENTS.md")));
      const claude = readFileSync(join(dir, "CLAUDE.md"), "utf-8");
      assert.ok(claude.includes("## Specs (Source of Truth)"));
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // Acceptance: re-running scaffold skips existing entries
  it("scaffold rerun is idempotent", () => {
    const dir = makeTmp();
    try {
      run(["scaffold", dir]);

      // Modify a template file to verify it is not overwritten
      const mapPath = join(dir, "specs", "map.md");
      writeFileSync(mapPath, "# Custom\n");

      const result = run(["scaffold", dir]);
      assert.equal(result.exitCode, 0);
      assert.ok(result.stdout.includes("(already exists)"));

      // Custom content preserved
      assert.equal(readFileSync(mapPath, "utf-8"), "# Custom\n");

      // Agent files skipped
      assert.ok(result.stdout.includes("(skipped)"));
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // Acceptance: invalid path exits non-zero with error on stderr
  it("scaffold with nonexistent path exits non-zero", () => {
    const result = run(["scaffold", "/nonexistent-spex-path-xyz"]);
    assert.notEqual(result.exitCode, 0);
    assert.ok(result.stderr.includes("Path does not exist"));
  });

  // Acceptance: unknown command exits non-zero
  it("unknown command exits non-zero", () => {
    const result = run(["bogus"]);
    assert.notEqual(result.exitCode, 0);
    assert.ok(result.stderr.includes("Unknown command"));
  });

  // Acceptance: --help exits zero
  it("--help prints usage and exits zero", () => {
    const result = run(["--help"]);
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes("scaffold"));
  });

  // Acceptance: scaffold without path in git repo uses repo root
  it("scaffold without path resolves to git repo root", () => {
    const dir = makeTmp();
    try {
      // Init a git repo in the temp dir
      initGit(dir);

      const result = run(["scaffold"], { cwd: dir });
      assert.equal(result.exitCode, 0, `should exit 0: ${result.stderr}`);
      assert.ok(existsSync(join(dir, "specs", "map.md")));
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("scaffold --update refreshes framework, keeps customized seeds, and prints merge prompt", () => {
    const dir = makeTmp();
    try {
      initGit(dir);
      assert.equal(run(["scaffold"], { cwd: dir }).exitCode, 0);
      writeFileSync(join(dir, "specs", "items", "user", "project.md"), "# Project\n");
      gitCommit(dir, "initial specs");

      const mapPath = join(dir, "specs", "map.md");
      const projectPath = join(dir, "specs", "items", "user", "project.md");
      writeFileSync(mapPath, "# Custom map\n");
      gitCommit(dir, "customize map");

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(result.exitCode, 0, `should exit 0: ${result.stderr}`);

      // Framework files: working tree matches bundled, so unchanged.
      assert.ok(result.stdout.includes("specs/meta.md (unchanged)"));
      assert.ok(
        result.stdout.includes(
          "specs/decisions/000-spec-structure-format.md (unchanged)",
        ),
      );

      // Customized seed kept.
      assert.ok(result.stdout.includes("specs/map.md (kept — user-modified)"));
      assert.equal(readFileSync(mapPath, "utf-8"), "# Custom map\n");

      // Pristine seed already at current bundled hash → unchanged.
      assert.ok(
        result.stdout.includes(
          "specs/iterations/000-spdx-headers.md (unchanged)",
        ),
      );

      // User-added file untouched.
      assert.equal(readFileSync(projectPath, "utf-8"), "# Project\n");

      // Merge prompt printed.
      assert.ok(result.stdout.includes(readSpecMergePrompt()));
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("scaffold --update rejects a path argument", () => {
    const dir = makeTmp();
    try {
      const result = run(["scaffold", "--update", dir]);
      assert.notEqual(result.exitCode, 0);
      assert.ok(result.stderr.includes("--update does not accept a <path>"));
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("scaffold --update rejects outside git repositories", () => {
    const dir = makeTmp();
    try {
      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.notEqual(result.exitCode, 0);
      assert.ok(result.stderr.includes("requires cwd inside a git repository"));
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("scaffold --update rejects dirty specs trees", () => {
    const dir = makeTmp();
    try {
      initGit(dir);
      assert.equal(run(["scaffold"], { cwd: dir }).exitCode, 0);
      gitCommit(dir, "initial specs");

      writeFileSync(join(dir, "specs", "map.md"), "# Dirty\n");

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.notEqual(result.exitCode, 0);
      assert.ok(result.stderr.includes("requires a clean specs/ working tree"));
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("scaffold --update rejects framework files missing from HEAD", () => {
    const dir = makeTmp();
    try {
      initGit(dir);
      assert.equal(run(["scaffold"], { cwd: dir }).exitCode, 0);
      gitCommit(dir, "initial specs");
      execSync("git rm specs/meta.md", { cwd: dir, stdio: "ignore" });
      execSync('git commit -m "remove framework file"', {
        cwd: dir,
        stdio: "ignore",
      });

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.notEqual(result.exitCode, 0);
      assert.ok(result.stderr.includes("framework files tracked in HEAD"));
      assert.ok(result.stderr.includes("specs/meta.md"));
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
