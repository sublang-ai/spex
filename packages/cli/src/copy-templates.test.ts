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
import { getScaffoldDir } from "./bundled-scaffold.js";
import {
  canonicalContentHash,
  copyRootLicense,
  copyTemplates,
  isPristine,
} from "./copy-templates.js";
import { createSpecsStructure } from "./create-specs-structure.js";

// Canonical Apache License 2.0 hash (verbatim LICENSE-2.0.txt from
// https://www.apache.org/licenses/LICENSE-2.0.txt).
const APACHE_2_0_CANONICAL_HASH =
  "sha256-cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30";

describe("getScaffoldDir", () => {
  // SCAF-9: resolves from dist/ to package root scaffold/
  it("returns a path ending in scaffold/ that exists", () => {
    const dir = getScaffoldDir();
    assert.ok(dir.endsWith("scaffold"), `unexpected path: ${dir}`);
    assert.ok(existsSync(dir), `scaffold dir does not exist: ${dir}`);
    assert.ok(
      existsSync(join(dir, "specs", "map.md")),
      "scaffold/specs/map.md should exist",
    );
  });
});

describe("copyTemplates", () => {
  function makeTmp(): string {
    return realpathSync(mkdtempSync(join(tmpdir(), "spex-test-")));
  }

  // SCAF-8: copies bundled files into target
  it("copies template files to the target specs directory", () => {
    const dir = makeTmp();
    try {
      createSpecsStructure(dir);
      copyTemplates(dir);

      // Verify key template files exist
      assert.ok(
        existsSync(join(dir, "specs", "map.md")),
        "specs/map.md should be copied",
      );
      assert.ok(
        existsSync(join(dir, "specs", "meta.md")),
        "specs/meta.md should be copied",
      );
      assert.ok(
        existsSync(join(dir, "specs", "decisions", "000-spec-structure-format.md")),
        "specs/decisions/000-spec-structure-format.md should be copied",
      );
      assert.ok(
        existsSync(join(dir, "specs", "packages", "git.md")),
        "specs/packages/git.md should be copied",
      );
      // Tracked dotfiles must not be skipped (SCAF-8)
      assert.ok(
        existsSync(join(dir, "specs", "interactions", ".gitkeep")),
        "specs/interactions/.gitkeep should be copied",
      );

      // Verify content matches the source
      const srcMap = readFileSync(
        join(getScaffoldDir(), "specs", "map.md"),
        "utf-8",
      );
      const destMap = readFileSync(join(dir, "specs", "map.md"), "utf-8");
      assert.equal(destMap, srcMap, "copied file content should match source");
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // SCAF-8: does not overwrite existing files
  it("does not overwrite existing files", () => {
    const dir = makeTmp();
    try {
      createSpecsStructure(dir);

      // Pre-create map.md with custom content
      const customContent = "# Custom map\n";
      writeFileSync(join(dir, "specs", "map.md"), customContent);

      copyTemplates(dir);

      // Custom content should be preserved
      const content = readFileSync(join(dir, "specs", "map.md"), "utf-8");
      assert.equal(
        content,
        customContent,
        "existing file should not be overwritten",
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // SCAF-4: reports existing files with "(already exists)"
  it("reports existing files with indicator", () => {
    const dir = makeTmp();
    try {
      createSpecsStructure(dir);
      writeFileSync(join(dir, "specs", "map.md"), "custom");

      const output: string[] = [];
      const origLog = console.log;
      console.log = (msg: string) => output.push(msg);
      try {
        copyTemplates(dir);
      } finally {
        console.log = origLog;
      }

      const mapLine = output.find((l) => l.includes("specs/map.md"));
      assert.ok(mapLine, "should have a line for specs/map.md");
      assert.ok(
        mapLine.includes("(already exists)"),
        `existing file should show (already exists): ${mapLine}`,
      );

      // A file that didn't exist should NOT have the indicator
      const metaLine = output.find((l) => l.includes("specs/meta.md"));
      assert.ok(metaLine, "should have a line for specs/meta.md");
      assert.ok(
        !metaLine.includes("(already exists)"),
        `new file should not show (already exists): ${metaLine}`,
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // SCAF-4: full idempotency — second run all "(already exists)"
  it("reports all files as already existing on second run", () => {
    const dir = makeTmp();
    try {
      createSpecsStructure(dir);
      copyTemplates(dir);

      const output: string[] = [];
      const origLog = console.log;
      console.log = (msg: string) => output.push(msg);
      try {
        copyTemplates(dir);
      } finally {
        console.log = origLog;
      }

      for (const line of output) {
        assert.ok(
          line.includes("(already exists)"),
          `expected (already exists): ${line}`,
        );
      }
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("copies localized overlay files and falls back to English templates", () => {
    const dir = makeTmp();
    try {
      createSpecsStructure(dir);
      copyTemplates(dir, "zh");

      assert.equal(
        readFileSync(join(dir, "specs", "meta.md"), "utf-8"),
        readFileSync(
          join(getScaffoldDir(), "i18n", "zh", "specs", "meta.md"),
          "utf-8",
        ),
      );
      assert.equal(
        readFileSync(join(dir, "specs", "map.md"), "utf-8"),
        readFileSync(
          join(getScaffoldDir(), "i18n", "zh", "specs", "map.md"),
          "utf-8",
        ),
      );
      assert.equal(
        readFileSync(join(dir, "specs", "packages", "git.md"), "utf-8"),
        readFileSync(join(getScaffoldDir(), "specs", "packages", "git.md"), "utf-8"),
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("recognizes active-language overlay history as pristine", () => {
    const dir = makeTmp();
    try {
      createSpecsStructure(dir);
      writeFileSync(
        join(dir, "specs", "map.md"),
        readFileSync(join(getScaffoldDir(), "i18n", "zh", "specs", "map.md")),
      );

      assert.equal(isPristine(dir, "specs/map.md", "zh"), "pristine");
      assert.equal(isPristine(dir, "specs/map.md", "en"), "modified");
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});

describe("copyRootLicense", () => {
  function makeTmp(): string {
    return realpathSync(mkdtempSync(join(tmpdir(), "spex-test-")));
  }

  // SCAF-37: the bundled LICENSE is the verbatim Apache-2.0 text.
  it("bundles the verbatim Apache License 2.0 text", () => {
    const bundled = readFileSync(join(getScaffoldDir(), "LICENSE"));
    assert.equal(canonicalContentHash(bundled), APACHE_2_0_CANONICAL_HASH);
  });

  // SCAF-36 / SCAF-37: writes a top-level LICENSE identical to the bundle.
  it("writes a top-level LICENSE identical to the bundled Apache-2.0 text", () => {
    const dir = makeTmp();
    try {
      copyRootLicense(dir);

      const target = join(dir, "LICENSE");
      assert.ok(existsSync(target), "LICENSE should be written at target root");
      assert.deepEqual(
        readFileSync(target),
        readFileSync(join(getScaffoldDir(), "LICENSE")),
      );
      assert.equal(
        canonicalContentHash(readFileSync(target)),
        APACHE_2_0_CANONICAL_HASH,
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // SCAF-36 / SCAF-37: never overwrite an existing downstream LICENSE.
  it("does not overwrite an existing LICENSE and reports (already exists)", () => {
    const dir = makeTmp();
    try {
      const target = join(dir, "LICENSE");
      const custom = "Downstream project license\n";
      writeFileSync(target, custom);

      const output: string[] = [];
      const origLog = console.log;
      console.log = (msg: string) => output.push(msg);
      try {
        copyRootLicense(dir);
      } finally {
        console.log = origLog;
      }

      assert.equal(
        readFileSync(target, "utf-8"),
        custom,
        "existing LICENSE must not be overwritten",
      );
      const licenseLine = output.find((l) => l.includes("LICENSE"));
      assert.ok(licenseLine, "should report a LICENSE line");
      assert.ok(
        licenseLine.includes("(already exists)"),
        `existing LICENSE should show (already exists): ${licenseLine}`,
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
