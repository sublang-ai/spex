// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { readBundledMarkdown } from "./bundled-scaffold.js";

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
  execSync("git config commit.gpgsign false", { cwd: dir, stdio: "ignore" });
}

function gitCommit(dir: string, message: string): void {
  execSync("git add specs", { cwd: dir, stdio: "ignore" });
  execSync(`git commit -m "${message}"`, { cwd: dir, stdio: "ignore" });
}

function parseIndicators(stdout: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of stdout.split("\n")) {
    const m = line.match(/^\s+(\S+)\s+\((.+)\)\s*$/);
    if (m) map.set(m[1], m[2]);
  }
  return map;
}

function bundledPath(relPath: string): string {
  return join(ROOT, "scaffold", relPath);
}

function toCrlf(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
}

function readBundledMergePrompt(): string {
  return readBundledMarkdown("update-merge-prompt.md");
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
      assert.ok(existsSync(join(dir, "specs", "user")));
      assert.ok(existsSync(join(dir, "specs", "dev")));
      assert.ok(existsSync(join(dir, "specs", "test")));

      // Template files
      assert.ok(existsSync(join(dir, "specs", "map.md")));
      assert.ok(existsSync(join(dir, "specs", "meta.md")));
      assert.ok(existsSync(join(dir, "specs", "user", ".gitkeep")));
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

  // SCAF-24 cell: framework, hash equals bundled current.
  it("update: framework at bundled current → (unchanged), bytes unchanged", () => {
    const dir = makeTmp();
    try {
      initGit(dir);
      run(["scaffold"], { cwd: dir });
      gitCommit(dir, "initial specs");

      const target = join(dir, "specs", "meta.md");
      const before = readFileSync(target);

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(parseIndicators(result.stdout).get("specs/meta.md"), "unchanged");
      assert.deepEqual(readFileSync(target), before);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // SCAF-24 cell: framework, canonical hash equals bundled current.
  it("update: framework at bundled current with CRLF → (unchanged), bytes unchanged", () => {
    const dir = makeTmp();
    try {
      initGit(dir);
      run(["scaffold"], { cwd: dir });

      const target = join(dir, "specs", "meta.md");
      writeFileSync(target, toCrlf(readFileSync(target, "utf-8")));
      gitCommit(dir, "initial specs with crlf framework");
      const before = readFileSync(target);

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(parseIndicators(result.stdout).get("specs/meta.md"), "unchanged");
      assert.deepEqual(readFileSync(target), before);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // SCAF-24 cell: framework, hash differs from bundled current.
  it("update: framework diverged from bundled → (updated), bytes equal bundled", () => {
    const dir = makeTmp();
    try {
      initGit(dir);
      run(["scaffold"], { cwd: dir });
      gitCommit(dir, "initial specs");

      const target = join(dir, "specs", "meta.md");
      writeFileSync(target, "# locally extended\n");
      gitCommit(dir, "extend meta");

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(parseIndicators(result.stdout).get("specs/meta.md"), "updated");
      assert.deepEqual(readFileSync(target), readFileSync(bundledPath("specs/meta.md")));
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // SCAF-24 cell: seed, hash equals bundled current.
  it("update: seed at bundled current → (unchanged), bytes unchanged", () => {
    const dir = makeTmp();
    try {
      initGit(dir);
      run(["scaffold"], { cwd: dir });
      gitCommit(dir, "initial specs");

      const target = join(dir, "specs", "dev", "git.md");
      const before = readFileSync(target);

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(
        parseIndicators(result.stdout).get("specs/dev/git.md"),
        "unchanged",
      );
      assert.deepEqual(readFileSync(target), before);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // SCAF-24 cell: seed, canonical hash equals bundled current.
  it("update: seed at bundled current with CRLF → (unchanged), bytes unchanged", () => {
    const dir = makeTmp();
    try {
      initGit(dir);
      run(["scaffold"], { cwd: dir });

      const target = join(dir, "specs", "dev", "git.md");
      writeFileSync(target, toCrlf(readFileSync(target, "utf-8")));
      gitCommit(dir, "initial specs with crlf seed");
      const before = readFileSync(target);

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(
        parseIndicators(result.stdout).get("specs/dev/git.md"),
        "unchanged",
      );
      assert.deepEqual(readFileSync(target), before);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // SCAF-24 cell: seed, hash in history but not current. .gitkeep history is
  // [prior 1-byte "\n", current 0-byte ""] — set the working tree to the prior.
  it("update: seed at prior bundled version → (updated), bytes equal bundled current", () => {
    const dir = makeTmp();
    try {
      initGit(dir);
      run(["scaffold"], { cwd: dir });
      const target = join(dir, "specs", "user", ".gitkeep");
      writeFileSync(target, "\n");
      gitCommit(dir, "initial specs with prior gitkeep");

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(
        parseIndicators(result.stdout).get("specs/user/.gitkeep"),
        "updated",
      );
      assert.deepEqual(readFileSync(target), readFileSync(bundledPath("specs/user/.gitkeep")));
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // SCAF-24 cell: seed, hash not in history (user customized).
  it("update: seed customized → (kept — user-modified), bytes unchanged", () => {
    const dir = makeTmp();
    try {
      initGit(dir);
      run(["scaffold"], { cwd: dir });
      gitCommit(dir, "initial specs");

      const target = join(dir, "specs", "map.md");
      writeFileSync(target, "# Custom map\n");
      gitCommit(dir, "customize map");

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(
        parseIndicators(result.stdout).get("specs/map.md"),
        "kept — user-modified",
      );
      assert.equal(readFileSync(target, "utf-8"), "# Custom map\n");
      assert.match(result.stdout, /--update[^\n]*complet/i);
      assert.ok(result.stdout.includes("git diff -- specs"));
      assert.ok(result.stdout.includes(readBundledMergePrompt()));
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // SCAF-24 cell: seed, file absent.
  it("update: seed deleted → (updated), file recreated from bundled", () => {
    const dir = makeTmp();
    try {
      initGit(dir);
      run(["scaffold"], { cwd: dir });
      gitCommit(dir, "initial specs");

      const target = join(dir, "specs", "dev", "git.md");
      execSync("git rm specs/dev/git.md", { cwd: dir, stdio: "ignore" });
      execSync('git commit -m "remove seed"', { cwd: dir, stdio: "ignore" });

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(
        parseIndicators(result.stdout).get("specs/dev/git.md"),
        "updated",
      );
      assert.deepEqual(
        readFileSync(target),
        readFileSync(bundledPath("specs/dev/git.md")),
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("update: legacy specs/items layout migrates to flat item directories", () => {
    const dir = makeTmp();
    try {
      initGit(dir);
      mkdirSync(join(dir, "specs", "decisions"), { recursive: true });
      mkdirSync(join(dir, "specs", "iterations"), { recursive: true });
      mkdirSync(join(dir, "specs", "items", "dev"), { recursive: true });
      mkdirSync(join(dir, "specs", "items", "user", "custom"), {
        recursive: true,
      });

      writeFileSync(
        join(dir, "specs", "meta.md"),
        readFileSync(bundledPath("specs/meta.md")),
      );
      writeFileSync(
        join(dir, "specs", "decisions", "000-spec-structure-format.md"),
        readFileSync(
          bundledPath("specs/decisions/000-spec-structure-format.md"),
        ),
      );
      writeFileSync(
        join(dir, "specs", "items", "dev", "git.md"),
        readFileSync(bundledPath("specs/dev/git.md")),
      );
      writeFileSync(
        join(dir, "specs", "items", "user", "custom", "thing.md"),
        "# Custom thing\n",
      );
      gitCommit(dir, "legacy scaffold layout");

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(result.exitCode, 0, result.stderr);
      assert.ok(
        result.stdout.includes(
          "specs/dev/git.md (migrated from specs/items/dev/git.md)",
        ),
      );
      assert.ok(
        result.stdout.includes(
          "specs/user/custom/thing.md (migrated from specs/items/user/custom/thing.md)",
        ),
      );
      assert.equal(existsSync(join(dir, "specs", "items")), false);
      assert.deepEqual(
        readFileSync(join(dir, "specs", "dev", "git.md")),
        readFileSync(bundledPath("specs/dev/git.md")),
      );
      assert.equal(
        readFileSync(join(dir, "specs", "user", "custom", "thing.md"), "utf-8"),
        "# Custom thing\n",
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("update: legacy specs/items migration preserves conflicting flat targets", () => {
    const dir = makeTmp();
    try {
      initGit(dir);
      mkdirSync(join(dir, "specs", "decisions"), { recursive: true });
      mkdirSync(join(dir, "specs", "dev"), { recursive: true });
      mkdirSync(join(dir, "specs", "items", "dev"), { recursive: true });

      writeFileSync(
        join(dir, "specs", "meta.md"),
        readFileSync(bundledPath("specs/meta.md")),
      );
      writeFileSync(
        join(dir, "specs", "decisions", "000-spec-structure-format.md"),
        readFileSync(
          bundledPath("specs/decisions/000-spec-structure-format.md"),
        ),
      );
      writeFileSync(join(dir, "specs", "dev", "git.md"), "# Flat target\n");
      writeFileSync(
        join(dir, "specs", "items", "dev", "git.md"),
        "# Legacy source\n",
      );
      gitCommit(dir, "legacy and flat scaffold layout");

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(result.exitCode, 0, result.stderr);
      assert.ok(
        result.stdout.includes(
          "specs/items/dev/git.md (kept — target exists at specs/dev/git.md)",
        ),
      );
      assert.equal(
        readFileSync(join(dir, "specs", "dev", "git.md"), "utf-8"),
        "# Flat target\n",
      );
      assert.equal(
        readFileSync(join(dir, "specs", "items", "dev", "git.md"), "utf-8"),
        "# Legacy source\n",
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // SCAF-25: over-eager indicator regression guard.
  it("update: (updated) does not appear for any unchanged file", () => {
    const dir = makeTmp();
    try {
      initGit(dir);
      run(["scaffold"], { cwd: dir });
      gitCommit(dir, "initial specs");

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(result.exitCode, 0, result.stderr);
      const indicators = parseIndicators(result.stdout);
      for (const [path, indicator] of indicators) {
        assert.notEqual(
          indicator,
          "updated",
          `${path} reported (updated) on a freshly scaffolded repo`,
        );
      }
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

  it("scaffold --update creates framework files missing from older specs trees", () => {
    const dir = makeTmp();
    try {
      initGit(dir);
      mkdirSync(join(dir, "specs", "decisions"), { recursive: true });
      mkdirSync(join(dir, "specs", "user"), { recursive: true });
      writeFileSync(join(dir, "specs", "spec-map.md"), "# Old map\n");
      writeFileSync(join(dir, "specs", "user", "meta.md"), "# Old meta\n");
      writeFileSync(
        join(dir, "specs", "decisions", "000-initial-specs-structure.md"),
        "# Old decision\n",
      );
      gitCommit(dir, "old scaffold specs");

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(parseIndicators(result.stdout).get("specs/meta.md"), "updated");
      assert.equal(
        parseIndicators(result.stdout).get(
          "specs/decisions/000-spec-structure-format.md",
        ),
        "updated",
      );
      assert.deepEqual(
        readFileSync(join(dir, "specs", "meta.md")),
        readFileSync(bundledPath("specs/meta.md")),
      );
      assert.deepEqual(
        readFileSync(
          join(dir, "specs", "decisions", "000-spec-structure-format.md"),
        ),
        readFileSync(
          bundledPath("specs/decisions/000-spec-structure-format.md"),
        ),
      );
      assert.equal(readFileSync(join(dir, "specs", "spec-map.md"), "utf-8"), "# Old map\n");
      assert.equal(
        readFileSync(join(dir, "specs", "user", "meta.md"), "utf-8"),
        "# Old meta\n",
      );
      assert.equal(
        readFileSync(
          join(dir, "specs", "decisions", "000-initial-specs-structure.md"),
          "utf-8",
        ),
        "# Old decision\n",
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("scaffold --update creates missing framework parent directories", () => {
    const dir = makeTmp();
    try {
      initGit(dir);
      mkdirSync(join(dir, "specs", "user"), { recursive: true });
      writeFileSync(join(dir, "specs", "spec-map.md"), "# Old map\n");
      writeFileSync(join(dir, "specs", "user", "meta.md"), "# Old meta\n");
      gitCommit(dir, "old scaffold specs without decisions");

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(
        parseIndicators(result.stdout).get(
          "specs/decisions/000-spec-structure-format.md",
        ),
        "updated",
      );
      assert.deepEqual(
        readFileSync(
          join(dir, "specs", "decisions", "000-spec-structure-format.md"),
        ),
        readFileSync(
          bundledPath("specs/decisions/000-spec-structure-format.md"),
        ),
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
