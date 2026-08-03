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
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { readBundledMarkdown } from "./bundled-scaffold.js";
import {
  canonicalContentHash,
  getFileHistory,
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

/** Files makeLegacyRepo() places under legacy directories (SCAF-27). */
const LEGACY_REPO_FILES = [
  "specs/dev/git.md",
  "specs/dev/licensing.md",
  "specs/test/licensing.md",
  "specs/iterations/000-spdx-headers.md",
  "specs/user/.gitkeep",
] as const;

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

// The always-printed merge prompt also names the skill, so guidance
// detection keys on a sentence only the SCAF-26 guidance prints.
const GUIDANCE_MARKER = "carries a legacy spec generation";

/** SCAF-26 guidance assertions: skill, guide, and lint gate named. */
function assertMigrationGuidance(stdout: string): void {
  const completedAt = stdout.indexOf("--update completed");
  const guidanceAt = stdout.indexOf(GUIDANCE_MARKER);
  assert.ok(guidanceAt >= 0, "the migration guidance must print");
  assert.ok(
    completedAt >= 0 && completedAt < guidanceAt,
    "guidance must print after the completion message",
  );
  const guidance = stdout.slice(guidanceAt);
  assert.ok(
    guidance.includes("spec-structure-migration") &&
      guidance.includes("skills/spec-structure-migration/"),
    "guidance must name the skill and its location in the spex repo",
  );
  assert.ok(
    guidance.includes("docs/spec-migration.md"),
    "guidance must name the migration guide",
  );
  assert.ok(
    guidance.includes("spex lint"),
    "guidance must name spex lint as the mechanical gate",
  );
}

describe("CLI integration", () => {
  // Acceptance: spex scaffold <path> creates full specs structure
  it("scaffold <path> creates specs structure and agent files", () => {
    const dir = makeTmp();
    try {
      const result = run(["scaffold", dir]);
      assert.equal(result.exitCode, 0, `should exit 0: ${result.stderr}`);

      // Directories: the meta-1 layout only, no legacy generation dirs.
      assert.ok(existsSync(join(dir, "specs")));
      assert.ok(existsSync(join(dir, "specs", "decisions")));
      assert.ok(existsSync(join(dir, "specs", "intents")));
      assert.ok(existsSync(join(dir, "specs", "packages")));
      for (const legacy of [
        "user",
        "dev",
        "test",
        "items",
        "interactions",
        "compositions",
        "iterations",
      ]) {
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
      assert.ok(
        existsSync(join(dir, "specs", "intents", "000-spdx-headers.md")),
      );
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
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // A freshly scaffolded tree satisfies the linter by construction.
  // KNOWN RED: the bundled DR-000 carries five old-form citations
  // (three with dead anchors) pending human approval to fix; this test
  // stays red on exactly those findings until then.
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
      writeFileSync(target, "# locally extended\n\nAuthoring language: en\n");
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

  // scaffold-53: a damaged marker on an unrecognized meta.md is
  // undeterminable, and guessing en would anglicize a localized tree,
  // so the update stops before writing anything.
  it("update: damaged marker stops the update and writes nothing", () => {
    const dir = makeTmp();
    try {
      initGit(dir);
      run(["scaffold", "--lang", "zh"], { cwd: dir });
      gitCommit(dir, "initial zh specs");

      const target = join(dir, "specs", "meta.md");
      const damaged = readFileSync(target, "utf-8").replace(
        /^Authoring language: zh$/m,
        "Authoring language",
      );
      writeFileSync(target, damaged);
      gitCommit(dir, "damage the marker");

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(result.exitCode, 1);
      assert.match(result.stderr, /matches no bundled version/);
      assert.match(result.stderr, /Authoring language: <code>/);
      // Nothing was written: the damaged file is still exactly as left.
      assert.equal(readFileSync(target, "utf-8"), damaged);

      // The printed recovery must actually work, run verbatim: restore
      // the line, commit (--update needs a clean specs/ tree), re-run.
      writeFileSync(
        target,
        damaged.replace(/^Authoring language$/m, "Authoring language: zh"),
      );
      gitCommit(dir, "restore the marker");
      const recovered = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(recovered.exitCode, 0, recovered.stderr);
      assert.deepEqual(
        readFileSync(target),
        readFileSync(overlayPath("zh", "specs/meta.md")),
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // scaffold-53: with no meta.md the language is unknown too, but
  // --update repairs older trees by creating missing framework files,
  // so it proceeds as en and says so rather than stopping.
  it("update: missing meta.md warns that it proceeds as en", () => {
    const dir = makeTmp();
    try {
      initGit(dir);
      run(["scaffold", "--lang", "zh"], { cwd: dir });
      gitCommit(dir, "initial zh specs");

      rmSync(join(dir, "specs", "meta.md"));
      gitCommit(dir, "delete meta");

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stderr, /authoring language is unknown/);
      const target = join(dir, "specs", "meta.md");
      assert.equal(existsSync(target), true);

      // The printed recovery must actually work, run verbatim: set the
      // line, commit (--update needs a clean specs/ tree), re-run.
      writeFileSync(
        target,
        readFileSync(target, "utf-8").replace(
          /^Authoring language: en$/m,
          "Authoring language: zh",
        ),
      );
      gitCommit(dir, "declare zh");
      const recovered = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(recovered.exitCode, 0, recovered.stderr);
      assert.deepEqual(
        readFileSync(target),
        readFileSync(overlayPath("zh", "specs/meta.md")),
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // SCAF-24 cell: framework, hash in history but not current (older pristine).
  // SCAF-35: a pre-localization specs tree updates cleanly without warning.
  // SCAF-26: a pre-packages bundled meta.md is an old-generation marker,
  // so the run also prints migration guidance — with no legacy directory.
  it("update: pre-localization framework (older pristine) → (updated), no warning, guidance", () => {
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

      // Updated cleanly: no warning of any kind — a bundled English
      // meta.md predating the marker is recognized, not ambiguous
      // (scaffold-53).
      assert.doesNotMatch(result.stderr, /warning/i);

      // Old-generation marker: the guidance prints without a legacy dir.
      assertMigrationGuidance(result.stdout);
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
  // history holds the legacy-layout versions. An older bundled map is
  // no old-generation marker on its own, so no guidance prints.
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
      assert.ok(!result.stdout.includes(GUIDANCE_MARKER));
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
      assert.ok(result.stdout.includes("spex lint"));
      assert.ok(result.stdout.includes(readBundledMergePrompt()));
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // SCAF-52: plain scaffold refuses a legacy tree, writes nothing, and
  // points at --update and its migration guidance.
  it("scaffold refuses a legacy tree and points at --update", () => {
    const dir = makeLegacyRepo();
    try {
      const result = run(["scaffold", dir]);
      assert.notEqual(result.exitCode, 0, result.stdout);
      assert.match(result.stderr, /legacy/);
      assert.match(result.stderr, /--update/);
      assert.match(result.stderr, /migration guidance/);
      // Nothing was written: the current seed target must not exist,
      // or the migration skill would face two entangled generations.
      assert.ok(!existsSync(join(dir, "specs", "packages", "git.md")));
      assert.ok(!existsSync(join(dir, "specs", "intents")));
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // SCAF-52: a legacy specs/compositions/ directory also refuses.
  it("scaffold refuses a tree with specs/compositions/", () => {
    const dir = makeTmp();
    try {
      mkdirSync(join(dir, "specs", "compositions"), { recursive: true });
      writeFileSync(
        join(dir, "specs", "compositions", "flow.md"),
        "# FLOW: Flow\n",
      );

      const result = run(["scaffold", dir]);
      assert.notEqual(result.exitCode, 0, result.stdout);
      assert.match(result.stderr, /specs\/compositions\//);
      assert.match(result.stderr, /--update/);
      assert.ok(!existsSync(join(dir, "specs", "packages")));
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // SCAF-24 cell: seed, file absent.
  it("update: sample intent seed deleted → (created)", () => {
    const dir = makeTmp();
    try {
      initGit(dir);
      run(["scaffold"], { cwd: dir });
      gitCommit(dir, "initial specs");

      const target = join(dir, "specs", "intents", "000-spdx-headers.md");
      execSync("git rm specs/intents/000-spdx-headers.md", {
        cwd: dir,
        stdio: "ignore",
      });
      execSync('git commit -m "remove seed"', { cwd: dir, stdio: "ignore" });

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(
        parseIndicators(result.stdout).get(
          "specs/intents/000-spdx-headers.md",
        ),
        "created",
      );
      assert.deepEqual(
        readFileSync(target),
        readFileSync(bundledPath("specs/intents/000-spdx-headers.md")),
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // SCAF-26 / SCAF-27: --update on a legacy tree completes the template
  // refresh, touches no legacy content, and prints migration guidance
  // naming the skill, the guide, and the lint gate.
  it("update: legacy tree gets a template refresh, untouched legacy files, and guidance", () => {
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
      const legacyBefore = new Map(
        LEGACY_REPO_FILES.map((relPath) => [
          relPath,
          readFileSync(join(dir, relPath)),
        ]),
      );

      const result = run(["scaffold", "--update"], { cwd: dir });
      assert.equal(result.exitCode, 0, result.stderr);

      // The template refresh completed: frameworks and seeds are at the
      // bundled current, absent seeds were created beside the legacy files.
      const indicators = parseIndicators(result.stdout);
      assert.equal(indicators.get("specs/meta.md"), "updated");
      assert.equal(indicators.get("specs/map.md"), "updated");
      assert.equal(
        indicators.get("specs/decisions/000-spec-structure-format.md"),
        "unchanged",
      );
      assert.equal(indicators.get("specs/packages/git.md"), "created");
      assert.equal(indicators.get("specs/packages/licensing.md"), "created");
      assert.equal(
        indicators.get("specs/intents/000-spdx-headers.md"),
        "created",
      );
      assert.deepEqual(
        readFileSync(join(dir, "specs", "meta.md")),
        readFileSync(bundledPath("specs/meta.md")),
      );
      assert.deepEqual(
        readFileSync(join(dir, "specs", "packages", "git.md")),
        readFileSync(bundledPath("specs/packages/git.md")),
      );

      // SCAF-27: every file under the legacy directories stays
      // byte-identical and in place — the run moves, merges, rewrites,
      // and deletes no legacy content.
      for (const [relPath, before] of legacyBefore) {
        assert.ok(existsSync(join(dir, relPath)), `${relPath} must remain`);
        assert.deepEqual(
          readFileSync(join(dir, relPath)),
          before,
          `${relPath} must stay byte-identical`,
        );
      }

      // The guidance prints after the completion message.
      assertMigrationGuidance(result.stdout);

      // SCAF-11: exactly one indicator line per path, none after the
      // merge prompt or the guidance.
      const metaIndicatorLines = result.stdout
        .split("\n")
        .filter((line) => /^\s+specs\/meta\.md \(/.test(line));
      assert.equal(metaIndicatorLines.length, 1);
      assert.ok(
        result.stdout.indexOf("specs/meta.md (") <
          result.stdout.indexOf("--update completed"),
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // SCAF-25: over-eager indicator regression guard; a current-generation
  // tree prints no migration guidance.
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
      assert.ok(
        !result.stdout.includes(GUIDANCE_MARKER),
        "no migration guidance on a current-generation tree",
      );
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

  // SCAF-17: missing framework files are created, and files outside
  // the framework and seed sets stay unmodified (SCAF-11 step 4).
  it("scaffold --update creates framework files missing from older specs trees", () => {
    const dir = makeTmp();
    try {
      initGit(dir);
      mkdirSync(join(dir, "specs", "decisions"), { recursive: true });
      writeFileSync(join(dir, "specs", "spec-map.md"), "# Old map\n");
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
      assert.match(result.stdout, /specs\/packages\/auth\.md:\d+: error /);
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
      assert.match(result.stdout, /legacy directory/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // LINT-3: printed paths use forward slashes from any cwd — on
  // Windows, neither the OS separator nor an 8.3 short-form cwd may
  // leak into the reported paths.
  it("lint prints forward-slash paths from any working directory", () => {
    const dir = makeTmp();
    try {
      run(["scaffold"], { cwd: dir });
      mkdirSync(join(dir, "specs", "user"));

      const result = run(["lint", basename(dir)], { cwd: dirname(dir) });
      assert.notEqual(result.exitCode, 0, result.stdout);
      const findingLines = result.stdout
        .split("\n")
        .filter((line) => line.includes(": error "));
      assert.ok(findingLines.length > 0, result.stdout);
      for (const line of findingLines) {
        assert.ok(!line.includes("\\"), line);
      }
      assert.ok(
        findingLines.some((line) =>
          line.startsWith(`${basename(dir)}/specs/user`),
        ),
        result.stdout,
      );
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

  // Packaging: the bundled assets ship with the npm package.
  it("npm pack ships the manifests, merge prompt, and seeds", () => {
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
      "scaffold/update-merge-prompt.md",
      "scaffold/specs/intents/000-spdx-headers.md",
      "scaffold/specs/packages/git.md",
      "scaffold/specs/packages/licensing.md",
    ]) {
      assert.ok(paths.has(required), `${required} missing from npm pack`);
    }
    assert.ok(
      !paths.has("scaffold/compositions-prompt.md"),
      "the retired compositions prompt must not ship",
    );
  });

  // Dogfood: this repository's own specs tree lints clean. Skipped
  // when the monorepo specs are absent (standalone package checkout).
  // KNOWN RED: the normative bundled DR-000 carries five old-form
  // citations (three with dead anchors) pending human approval to fix.
  it("repo specs lint clean", (t) => {
    const repoSpecs = resolve(ROOT, "..", "..", "specs");
    if (!existsSync(repoSpecs)) {
      t.skip("monorepo specs/ not present");
      return;
    }
    const result = run(["lint", resolve(ROOT, "..", "..")]);
    assert.equal(result.exitCode, 0, result.stdout);
  });
});
