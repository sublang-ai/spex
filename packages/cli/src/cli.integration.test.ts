// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync, spawnSync } from "node:child_process";
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
import {
  canonicalContentHash,
  getFileHistory,
  getFrameworkSpecFiles,
  getLegacyFileHistory,
} from "./copy-templates.js";

const CLI = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "dist",
  "cli.js",
);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PRE_LOCALIZATION_META = resolve(
  ROOT,
  "src",
  "__fixtures__",
  "pre-localization-meta.md",
);
const LEGACY_SCAFFOLD = resolve(ROOT, "src", "__fixtures__", "legacy-scaffold");

function run(
  args: string[],
  opts?: { cwd?: string },
): { stdout: string; stderr: string; exitCode: number } {
  // spawnSync captures stderr on success too, so warnings emitted on a
  // zero-exit run (e.g. replaced user-modified framework files) are visible.
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf-8",
    cwd: opts?.cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.status ?? 0,
  };
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

function overlayPath(language: string, relPath: string): string {
  return join(ROOT, "scaffold", "i18n", language, relPath);
}

function legacyFixture(relPath: string): string {
  return join(LEGACY_SCAFFOLD, relPath);
}

function write(dir: string, relPath: string, content: string | Buffer): void {
  const target = join(dir, relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function writeBundledFrameworkFileSet(dir: string): void {
  for (const relPath of getFrameworkSpecFiles()) {
    write(dir, relPath, readFileSync(bundledPath(relPath)));
  }
}

/** A committed repo on the legacy user/dev/test layout, from fixtures. */
function makeLegacyRepo(): string {
  const dir = makeTmp();
  initGit(dir);
  write(dir, "specs/meta.md", readFileSync(legacyFixture("specs/meta.md")));
  write(dir, "specs/map.md", readFileSync(legacyFixture("specs/map.md")));
  write(
    dir,
    "specs/iterations/000-spdx-headers.md",
    readFileSync(legacyFixture("specs/iterations/000-spdx-headers.md")),
  );
  write(
    dir,
    "specs/dev/git.md",
    readFileSync(legacyFixture("specs/dev/git.md")),
  );
  write(
    dir,
    "specs/dev/licensing.md",
    readFileSync(legacyFixture("specs/dev/licensing.md")),
  );
  write(
    dir,
    "specs/test/licensing.md",
    readFileSync(legacyFixture("specs/test/licensing.md")),
  );
  write(dir, "specs/user/.gitkeep", "");
  // Frameworks are refreshed unconditionally, so the current bundled
  // DR-000 stands in for whatever old version the repo carried.
  write(
    dir,
    "specs/decisions/000-spec-structure-format.md",
    readFileSync(bundledPath("specs/decisions/000-spec-structure-format.md")),
  );
  return dir;
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
      assert.ok(existsSync(join(dir, "specs", "packages")));
      assert.ok(existsSync(join(dir, "specs", "interactions")));
      for (const legacy of ["user", "dev", "test"]) {
        assert.ok(
          !existsSync(join(dir, "specs", legacy)),
          `legacy specs/${legacy} must not be created`,
        );
      }

      // Template files
      assert.ok(existsSync(join(dir, "specs", "map.md")));
      assert.ok(existsSync(join(dir, "specs", "meta.md")));
      assert.ok(existsSync(join(dir, "specs", "packages", "git.md")));
      assert.ok(existsSync(join(dir, "specs", "packages", "licensing.md")));
      assert.ok(existsSync(join(dir, "specs", "interactions", ".gitkeep")));
      assert.ok(
        existsSync(
          join(dir, "specs", "decisions", "000-spec-structure-format.md"),
        ),
      );

      // Agent files
      assert.ok(existsSync(join(dir, "CLAUDE.md")));
      assert.ok(existsSync(join(dir, "AGENTS.md")));
      const claude = readFileSync(join(dir, "CLAUDE.md"), "utf-8");
      assert.ok(claude.includes("## Specs (Source of Truth)"));
      assert.ok(claude.includes("@specs/packages"));
      assert.ok(claude.includes("@specs/interactions"));
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // A freshly scaffolded tree satisfies the linter by construction.
  it("scaffold output lints clean", () => {
    const dir = makeTmp();
    try {
      assert.equal(run(["scaffold", dir]).exitCode, 0);
      const result = run(["lint", dir]);
      assert.equal(result.exitCode, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /no problems found/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // SCAF-36 / SCAF-38: scaffold writes a top-level LICENSE and no NOTICE.
  it("scaffold <path> writes a verbatim Apache-2.0 LICENSE and no NOTICE", () => {
    const dir = makeTmp();
    try {
      const result = run(["scaffold", dir]);
      assert.equal(result.exitCode, 0, `should exit 0: ${result.stderr}`);

      const licensePath = join(dir, "LICENSE");
      assert.ok(existsSync(licensePath), "top-level LICENSE should be written");
      assert.deepEqual(
        readFileSync(licensePath),
        readFileSync(bundledPath("LICENSE")),
        "LICENSE should be byte-identical to the bundled Apache-2.0 text",
      );
      assert.equal(
        existsSync(join(dir, "NOTICE")),
        false,
        "no NOTICE file should be written",
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // SCAF-36 / SCAF-38: an existing downstream LICENSE is never overwritten.
  it("scaffold preserves an existing LICENSE with (already exists)", () => {
    const dir = makeTmp();
    try {
      const licensePath = join(dir, "LICENSE");
      const custom = "Downstream project license\n";
      writeFileSync(licensePath, custom);

      const result = run(["scaffold", dir]);
      assert.equal(result.exitCode, 0, `should exit 0: ${result.stderr}`);
      assert.equal(
        readFileSync(licensePath, "utf-8"),
        custom,
        "existing LICENSE must not be overwritten",
      );
      assert.match(result.stdout, /LICENSE \(already exists\)/);
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

  // Acceptance: --help exits zero and lists both commands
  it("--help prints usage and exits zero", () => {
    const result = run(["--help"]);
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes("scaffold"));
    assert.ok(result.stdout.includes("lint"));
  });

  // Acceptance: scaffold without path in git repo uses repo root
  it("scaffold without path resolves to git repo root", () => {
    const dir = makeTmp();
    try {
      initGit(dir);

      const result = run(["scaffold"], { cwd: dir });
      assert.equal(result.exitCode, 0, `should exit 0: ${result.stderr}`);
      assert.ok(existsSync(join(dir, "specs", "map.md")));
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("scaffold --lang zh applies localized overlays and English fallbacks", () => {
    const dir = makeTmp();
    try {
      const result = run(["scaffold", "--lang", "zh", dir]);
      assert.equal(result.exitCode, 0, `should exit 0: ${result.stderr}`);
      assert.deepEqual(
        readFileSync(join(dir, "specs", "meta.md")),
        readFileSync(overlayPath("zh", "specs/meta.md")),
      );
      assert.deepEqual(
        readFileSync(join(dir, "specs", "map.md")),
        readFileSync(overlayPath("zh", "specs/map.md")),
      );
      assert.deepEqual(
        readFileSync(join(dir, "specs", "packages", "git.md")),
        readFileSync(bundledPath("specs/packages/git.md")),
      );
      assert.ok(
        readFileSync(join(dir, "specs", "meta.md"), "utf-8").includes(
          "Authoring language: zh",
        ),
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("scaffold rejects unsupported language codes", () => {
    const dir = makeTmp();
    try {
      const result = run(["scaffold", "--lang", "fr", dir]);
      assert.notEqual(result.exitCode, 0);
      assert.ok(result.stderr.includes("Unsupported language code: fr"));
      assert.ok(result.stderr.includes("en, zh"));
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("scaffold rejects language mismatches on existing specs trees", () => {
    const dir = makeTmp();
    try {
      assert.equal(run(["scaffold", "--lang", "zh", dir]).exitCode, 0);
      const before = readFileSync(join(dir, "specs", "map.md"));

      const result = run(["scaffold", "--lang", "en", dir]);
      assert.notEqual(result.exitCode, 0);
      assert.ok(
        result.stderr.includes("does not match existing authoring language zh"),
      );
      assert.deepEqual(readFileSync(join(dir, "specs", "map.md")), before);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("scaffold --update rejects --lang", () => {
    const dir = makeTmp();
    try {
      const result = run(["scaffold", "--update", "--lang", "zh"], {
        cwd: dir,
      });
      assert.notEqual(result.exitCode, 0);
      assert.ok(result.stderr.includes("--update does not accept --lang"));
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("scaffold --update refreshes zh pristine files from active overlays", () => {
    const dir = makeTmp();
    try {
      initGit(dir);
      assert.equal(run(["scaffold", "--lang", "zh"], { cwd: dir }).exitCode, 0);
      writeFileSync(
        join(dir, "specs", "map.md"),
        readFileSync(bundledPath("specs/map.md")),
      );
      gitCommit(dir, "zh scaffold with english map");

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(
        parseIndicators(result.stdout).get("specs/map.md"),
        "updated",
      );
      assert.deepEqual(
        readFileSync(join(dir, "specs", "map.md")),
        readFileSync(overlayPath("zh", "specs/map.md")),
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // A zh legacy tree migrates to the zh overlays and new packages.
  it("update: zh legacy tree migrates to zh overlays and bundled packages", () => {
    const dir = makeTmp();
    try {
      initGit(dir);
      write(
        dir,
        "specs/meta.md",
        readFileSync(legacyFixture("i18n/zh/specs/meta.md")),
      );
      write(
        dir,
        "specs/map.md",
        readFileSync(legacyFixture("i18n/zh/specs/map.md")),
      );
      write(
        dir,
        "specs/dev/git.md",
        readFileSync(legacyFixture("specs/dev/git.md")),
      );
      gitCommit(dir, "zh legacy tree");

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(result.exitCode, 0, result.stderr);
      assert.deepEqual(
        readFileSync(join(dir, "specs", "meta.md")),
        readFileSync(overlayPath("zh", "specs/meta.md")),
      );
      assert.deepEqual(
        readFileSync(join(dir, "specs", "map.md")),
        readFileSync(overlayPath("zh", "specs/map.md")),
      );
      assert.deepEqual(
        readFileSync(join(dir, "specs", "packages", "git.md")),
        readFileSync(bundledPath("specs/packages/git.md")),
      );
      assert.equal(existsSync(join(dir, "specs", "dev")), false);

      const lint = run(["lint", dir]);
      assert.equal(lint.exitCode, 0, lint.stdout);
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
      assert.equal(
        parseIndicators(result.stdout).get("specs/meta.md"),
        "unchanged",
      );
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
      assert.equal(
        parseIndicators(result.stdout).get("specs/meta.md"),
        "unchanged",
      );
      assert.deepEqual(readFileSync(target), before);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // SCAF-24 cell: framework, hash not in history (user-modified).
  it("update: framework user-modified → (overwritten — user-modified), warns, bytes equal bundled", () => {
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
      assert.equal(
        parseIndicators(result.stdout).get("specs/meta.md"),
        "overwritten — user-modified",
      );
      assert.deepEqual(
        readFileSync(target),
        readFileSync(bundledPath("specs/meta.md")),
      );

      // SCAF-18: a warning names the replaced file and points to reconciliation.
      assert.match(result.stderr, /WARNING/);
      assert.match(result.stderr, /specs\/meta\.md/);
      assert.match(result.stderr, /git diff -- specs/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // SCAF-24 cell: framework, hash in history but not current (older pristine).
  // SCAF-35: a pre-localization specs tree updates cleanly without warning.
  it("update: pre-localization framework (older pristine) → (updated), no warning", () => {
    const dir = makeTmp();
    try {
      const fixture = readFileSync(PRE_LOCALIZATION_META);
      const fixtureHash = canonicalContentHash(fixture);
      const history = getFileHistory("specs/meta.md");
      assert.ok(
        history.includes(fixtureHash),
        "fixture must be a recognized bundled meta.md version",
      );
      assert.notEqual(
        fixtureHash,
        history[history.length - 1],
        "fixture must not be the current bundled meta.md",
      );
      assert.ok(
        !fixture.toString("utf-8").includes("Authoring language"),
        "fixture must predate the authoring-language declaration",
      );

      initGit(dir);
      run(["scaffold"], { cwd: dir });
      const target = join(dir, "specs", "meta.md");
      writeFileSync(target, fixture);
      gitCommit(dir, "pre-localization specs tree");

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(
        parseIndicators(result.stdout).get("specs/meta.md"),
        "updated",
      );
      assert.deepEqual(
        readFileSync(target),
        readFileSync(bundledPath("specs/meta.md")),
      );

      // Updated cleanly: no replaced-user-content warning.
      assert.doesNotMatch(result.stderr, /WARNING/);
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

      const target = join(dir, "specs", "packages", "git.md");
      const before = readFileSync(target);

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(
        parseIndicators(result.stdout).get("specs/packages/git.md"),
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

      const target = join(dir, "specs", "packages", "git.md");
      writeFileSync(target, toCrlf(readFileSync(target, "utf-8")));
      gitCommit(dir, "initial specs with crlf seed");
      const before = readFileSync(target);

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(
        parseIndicators(result.stdout).get("specs/packages/git.md"),
        "unchanged",
      );
      assert.deepEqual(readFileSync(target), before);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // SCAF-24 cell: seed, hash in history but not current. The map.md
  // history holds the legacy-layout versions.
  it("update: seed at prior bundled version → (updated), bytes equal bundled current", () => {
    const dir = makeTmp();
    try {
      initGit(dir);
      run(["scaffold"], { cwd: dir });
      const target = join(dir, "specs", "map.md");
      writeFileSync(target, readFileSync(legacyFixture("specs/map.md")));
      gitCommit(dir, "initial specs with prior map");

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(
        parseIndicators(result.stdout).get("specs/map.md"),
        "updated",
      );
      assert.deepEqual(
        readFileSync(target),
        readFileSync(bundledPath("specs/map.md")),
      );
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
  it("update: sample iteration seed deleted → (created)", () => {
    const dir = makeTmp();
    try {
      initGit(dir);
      run(["scaffold"], { cwd: dir });
      gitCommit(dir, "initial specs");

      const target = join(dir, "specs", "iterations", "000-spdx-headers.md");
      execSync("git rm specs/iterations/000-spdx-headers.md", {
        cwd: dir,
        stdio: "ignore",
      });
      execSync('git commit -m "remove seed"', { cwd: dir, stdio: "ignore" });

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(
        parseIndicators(result.stdout).get(
          "specs/iterations/000-spdx-headers.md",
        ),
        "created",
      );
      assert.deepEqual(
        readFileSync(target),
        readFileSync(bundledPath("specs/iterations/000-spdx-headers.md")),
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // The interactions .gitkeep is never resurrected into a filled dir.
  it("update: removed interactions/.gitkeep stays removed when files exist", () => {
    const dir = makeTmp();
    try {
      initGit(dir);
      run(["scaffold"], { cwd: dir });
      rmSync(join(dir, "specs", "interactions", ".gitkeep"));
      write(
        dir,
        "specs/interactions/login-flow.md",
        "# LF: Login Flow\n\n## Intent\n\nEnd-to-end login.\n",
      );
      gitCommit(dir, "filled interactions");

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(
        existsSync(join(dir, "specs", "interactions", ".gitkeep")),
        false,
        ".gitkeep must not be resurrected",
      );
      assert.equal(
        parseIndicators(result.stdout).has("specs/interactions/.gitkeep"),
        false,
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // Package-layout migration: pristine legacy seeds take the bundled
  // fast path with a combined indicator.
  it("update: pristine legacy seeds → bundled packages, combined indicator", () => {
    const dir = makeLegacyRepo();
    try {
      const gitHash = canonicalContentHash(
        readFileSync(legacyFixture("specs/dev/git.md")),
      );
      assert.ok(
        getLegacyFileHistory("specs/dev/git.md").includes(gitHash),
        "fixture must be a recognized legacy bundled version",
      );
      gitCommit(dir, "legacy tree");

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(result.exitCode, 0, result.stderr);

      const indicators = parseIndicators(result.stdout);
      assert.equal(
        indicators.get("specs/packages/git.md"),
        "migrated from specs/dev/git.md",
      );
      assert.equal(
        indicators.get("specs/packages/licensing.md"),
        "migrated from specs/dev/licensing.md, specs/test/licensing.md",
      );
      assert.deepEqual(
        readFileSync(join(dir, "specs", "packages", "git.md")),
        readFileSync(bundledPath("specs/packages/git.md")),
      );
      assert.deepEqual(
        readFileSync(join(dir, "specs", "packages", "licensing.md")),
        readFileSync(bundledPath("specs/packages/licensing.md")),
      );
      // Legacy dirs are gone, including the pristine .gitkeep.
      for (const legacy of ["user", "dev", "test"]) {
        assert.equal(existsSync(join(dir, "specs", legacy)), false, legacy);
      }

      const lint = run(["lint", dir]);
      assert.equal(lint.exitCode, 0, lint.stdout);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // Package-layout migration: customized legacy files merge into one
  // package file; citations and the map are rewritten.
  it("update: custom packages merge with citation rewrite and map restructure", () => {
    const dir = makeLegacyRepo();
    try {
      write(
        dir,
        "specs/user/auth.md",
        `# AUTH: User-Facing Auth Behavior

## Intent

User-visible auth behavior.

## Login

### AUTH-1

When credentials are valid, the system shall create a session.
`,
      );
      write(
        dir,
        "specs/dev/auth.md",
        `# AUTH: Auth Implementation Requirements

## Intent

Auth implementation requirements.

## Store

### AUTH-2

Where a session exists per [AUTH-1](../user/auth.md#auth-1), the store shall persist it.
`,
      );
      write(
        dir,
        "specs/test/auth.md",
        `# AUTH: Auth Acceptance Tests

## Intent

Auth acceptance coverage.

## Coverage

### AUTH-3
Verifies: [AUTH-1](../user/auth.md#auth-1), [AUTH-2](../dev/auth.md#auth-2)

The suite shall assert login persists a session.
`,
      );
      write(
        dir,
        "specs/decisions/001-auth.md",
        `# DR-001: Auth Approach

## Status

Accepted

## Context

See [AUTH-1](../user/auth.md#auth-1).

## Decision

Use sessions.

## Consequences

None.
`,
      );
      // A customized map on the legacy shape gets restructured in place.
      write(
        dir,
        "specs/map.md",
        `# Spec Map

## Layout

\`\`\`text
decisions/  Decision records (DRs)
iterations/ Iteration records (IRs)
user/       User-visible item files
dev/        Implementation item files
test/       Acceptance test item files
map.md      This index
meta.md     The spec of specs
\`\`\`

## Decisions

| ID | File | Summary |
| --- | --- | --- |
| DR-001 | [001-auth.md](decisions/001-auth.md) | Auth approach |

## Packages

### AUTH

| Group | File | Summary |
| --- | --- | --- |
| user | [auth.md](user/auth.md) | Login behavior |
| dev | [auth.md](dev/auth.md) | Session store |
| test | [auth.md](test/auth.md) | Login coverage |
`,
      );
      gitCommit(dir, "legacy tree with custom auth package");

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(result.exitCode, 0, result.stderr);

      const indicators = parseIndicators(result.stdout);
      assert.equal(
        indicators.get("specs/packages/auth.md"),
        "migrated from specs/user/auth.md, specs/dev/auth.md, specs/test/auth.md",
      );
      assert.equal(
        indicators.get("specs/decisions/001-auth.md"),
        "citations rewritten",
      );
      assert.equal(
        indicators.get("specs/map.md"),
        "restructured for the packages layout",
      );

      const merged = readFileSync(
        join(dir, "specs", "packages", "auth.md"),
        "utf-8",
      );
      // Sections in order with demoted topics and items.
      const sections = [...merged.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
      assert.deepEqual(sections, [
        "Intent",
        "External Behavior",
        "Internal Behavior",
        "Verification",
      ]);
      assert.match(merged, /\n#### AUTH-1\n/);
      // Citations collapsed to same-file anchors.
      assert.match(merged, /\[AUTH-1\]\(#auth-1\), \[AUTH-2\]\(#auth-2\)/);

      // The DR cites the new location.
      assert.match(
        readFileSync(join(dir, "specs", "decisions", "001-auth.md"), "utf-8"),
        /\(\.\.\/packages\/auth\.md#auth-1\)/,
      );

      // Map: layout block and package table reshaped, Interactions added.
      const map = readFileSync(join(dir, "specs", "map.md"), "utf-8");
      assert.match(map, /packages\/ {5}Spec packages/);
      assert.doesNotMatch(map, /^user\/ /m);
      assert.match(
        map,
        /\| \[auth\.md\]\(packages\/auth\.md\) \| Login behavior; Session store; Login coverage \|/,
      );
      assert.match(map, /^## Interactions$/m);

      // The interactions prompt is printed after a migration.
      assert.ok(
        result.stdout.includes(readBundledMarkdown("interactions-prompt.md")),
      );

      const lint = run(["lint", dir]);
      assert.equal(lint.exitCode, 0, lint.stdout);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // Conflicts: an existing target keeps the legacy sources untouched.
  it("update: package migration preserves conflicting targets", () => {
    const dir = makeLegacyRepo();
    try {
      write(dir, "specs/user/auth.md", "# AUTH: Auth\n\n## Intent\n\nA.\n");
      write(
        dir,
        "specs/packages/auth.md",
        "# AUTH: Auth\n\n## Intent\n\nExisting target.\n\n## External Behavior\n\n### AUTH-1\n\nX shall Y.\n",
      );
      gitCommit(dir, "conflicting target");

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(
        parseIndicators(result.stdout).get("specs/user/auth.md"),
        "kept — target exists at specs/packages/auth.md",
      );
      assert.equal(
        readFileSync(join(dir, "specs", "user", "auth.md"), "utf-8"),
        "# AUTH: Auth\n\n## Intent\n\nA.\n",
      );
      assert.match(
        readFileSync(join(dir, "specs", "packages", "auth.md"), "utf-8"),
        /Existing target/,
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // The chained migration: specs/items → flat → packages in one run.
  it("update: legacy specs/items chains through to packages with one indicator", () => {
    const dir = makeTmp();
    try {
      initGit(dir);
      writeBundledFrameworkFileSet(dir);
      write(
        dir,
        "specs/items/dev/git.md",
        readFileSync(legacyFixture("specs/dev/git.md")),
      );
      write(dir, "specs/items/user/custom/thing.md", "# Custom thing\n");
      gitCommit(dir, "items layout");

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(result.exitCode, 0, result.stderr);

      const indicators = parseIndicators(result.stdout);
      assert.equal(
        indicators.get("specs/packages/git.md"),
        "migrated from specs/items/dev/git.md",
      );
      assert.equal(
        indicators.get("specs/packages/custom/thing.md"),
        "migrated from specs/items/user/custom/thing.md",
      );
      assert.equal(existsSync(join(dir, "specs", "items")), false);
      assert.equal(existsSync(join(dir, "specs", "user")), false);
      assert.deepEqual(
        readFileSync(join(dir, "specs", "packages", "git.md")),
        readFileSync(bundledPath("specs/packages/git.md")),
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // Customized legacy seed content merges instead of being replaced.
  it("update: customized legacy seed merges and reports kept — user-modified", () => {
    const dir = makeTmp();
    try {
      initGit(dir);
      writeBundledFrameworkFileSet(dir);
      write(
        dir,
        "specs/dev/git.md",
        "# GIT: Git Workflow\n\n## Intent\n\nCustom git rules.\n\n## Commits\n\n### GIT-1\n\nCommits shall be signed.\n",
      );
      gitCommit(dir, "customized git seed");

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(
        parseIndicators(result.stdout).get("specs/packages/git.md"),
        "migrated from specs/dev/git.md; kept — user-modified",
      );
      const merged = readFileSync(
        join(dir, "specs", "packages", "git.md"),
        "utf-8",
      );
      assert.match(merged, /Custom git rules\./);
      assert.match(merged, /## Internal Behavior/);
      assert.match(merged, /#### GIT-1/);
      assert.match(merged, /Commits shall be signed\./);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // A second run after migration is a no-op.
  it("update: second run after migration reports no changes", () => {
    const dir = makeLegacyRepo();
    try {
      write(
        dir,
        "specs/user/auth.md",
        "# AUTH: Auth\n\n## Intent\n\nA.\n\n## Login\n\n### AUTH-1\n\nX shall Y.\n",
      );
      gitCommit(dir, "legacy tree");
      assert.equal(run(["scaffold", "--update"], { cwd: dir }).exitCode, 0);
      gitCommit(dir, "migrated");

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(result.exitCode, 0, result.stderr);
      const indicators = parseIndicators(result.stdout);
      for (const [path, indicator] of indicators) {
        assert.ok(
          indicator === "unchanged" || indicator === "skipped",
          `${path}: unexpected indicator (${indicator}) on a migrated tree`,
        );
      }
      assert.doesNotMatch(result.stdout, /migrated from/);
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

  // --update refreshes existing agent files but creates none.
  it("update: refreshes the managed section of an existing CLAUDE.md only", () => {
    const dir = makeTmp();
    try {
      initGit(dir);
      run(["scaffold"], { cwd: dir });
      writeFileSync(
        join(dir, "CLAUDE.md"),
        "# Project\n\n## Specs (Source of Truth)\n\nStale section.\n\n## Other\n\nKept.\n",
      );
      rmSync(join(dir, "AGENTS.md"));
      gitCommit(dir, "initial specs");

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(result.exitCode, 0, result.stderr);
      const claude = readFileSync(join(dir, "CLAUDE.md"), "utf-8");
      assert.ok(claude.includes("@specs/packages"));
      assert.ok(!claude.includes("Stale section."));
      assert.ok(claude.includes("## Other"));
      assert.equal(
        existsSync(join(dir, "AGENTS.md")),
        false,
        "--update must not create agent files",
      );
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
      assert.equal(
        parseIndicators(result.stdout).get("specs/meta.md"),
        "updated",
      );
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
      assert.equal(
        readFileSync(join(dir, "specs", "spec-map.md"), "utf-8"),
        "# Old map\n",
      );
      assert.equal(
        readFileSync(
          join(dir, "specs", "decisions", "000-initial-specs-structure.md"),
          "utf-8",
        ),
        "# Old decision\n",
      );
      // user/meta.md is an unrecognized .md under a legacy dir: it
      // migrates to packages/ rather than being lost.
      assert.ok(
        readFileSync(
          join(dir, "specs", "packages", "meta.md"),
          "utf-8",
        ).includes("Old meta"),
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // lint CLI: clean and failing trees, plus target resolution.
  it("lint reports errors with file:line and exits non-zero", () => {
    const dir = makeTmp();
    try {
      write(
        dir,
        "specs/packages/auth.md",
        "# AUTH: Auth\n\n## Intent\n\nSee [gone](missing.md).\n\n## External Behavior\n\n### OTHER-1\n\nX shall Y.\n",
      );
      write(
        dir,
        "specs/meta.md",
        "# META: Spec Definition\n\n## Intent\n\nX.\n",
      );
      write(dir, "specs/map.md", "# Spec Map\n");

      const result = run(["lint", dir]);
      assert.equal(result.exitCode, 1);
      assert.match(
        result.stdout,
        /specs\/packages\/auth\.md:\d+: error cite\/broken-link/,
      );
      assert.match(result.stdout, /error id\/prefix/);
      assert.match(result.stdout, /\d+ errors?, \d+ warnings?/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("lint flags legacy trees and exits non-zero", () => {
    const dir = makeLegacyRepo();
    try {
      const result = run(["lint", dir]);
      assert.equal(result.exitCode, 1);
      assert.match(result.stdout, /structure\/legacy-layout/);
      assert.match(result.stdout, /spex scaffold --update/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("lint exits non-zero without a specs tree", () => {
    const dir = makeTmp();
    try {
      const result = run(["lint", dir]);
      assert.equal(result.exitCode, 1);
      assert.match(result.stdout, /no specs\/ directory/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // Packaging: the new bundled assets ship with the npm package.
  it("npm pack ships the manifests, prompts, and interactions seed", () => {
    // execSync (a shell) so Windows resolves npm.cmd.
    const output = execSync("npm pack --dry-run --json", {
      cwd: ROOT,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const [{ files }] = JSON.parse(output) as [{ files: { path: string }[] }];
    const paths = new Set(files.map((f) => f.path));
    for (const required of [
      "scaffold/.file-history.json",
      "scaffold/.legacy-file-history.json",
      "scaffold/interactions-prompt.md",
      "scaffold/update-merge-prompt.md",
      "scaffold/specs/interactions/.gitkeep",
      "scaffold/specs/packages/git.md",
      "scaffold/specs/packages/licensing.md",
    ]) {
      assert.ok(paths.has(required), `${required} missing from npm pack`);
    }
  });

  // Dogfood: this repository's own specs tree lints clean. Skipped
  // when the monorepo specs are absent (standalone package checkout).
  it("repo specs lint clean", (t) => {
    const repoSpecs = resolve(ROOT, "..", "..", "specs");
    if (!existsSync(repoSpecs)) {
      t.skip("monorepo specs/ not present");
      return;
    }
    if (existsSync(join(repoSpecs, "user"))) {
      t.skip("repo specs not yet migrated to the packages layout");
      return;
    }
    const result = run(["lint", resolve(ROOT, "..", "..")]);
    assert.equal(result.exitCode, 0, result.stdout);
  });
});
