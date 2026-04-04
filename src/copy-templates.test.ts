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
import { getScaffoldDir, copyTemplates } from "./copy-templates.js";
import { createSpecsStructure } from "./create-specs-structure.js";

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
        existsSync(join(dir, "specs", "items", "dev", "git.md")),
        "specs/items/dev/git.md should be copied",
      );
      // Tracked dotfiles must not be skipped (SCAF-8)
      assert.ok(
        existsSync(join(dir, "specs", "items", "user", ".gitkeep")),
        "specs/items/user/.gitkeep should be copied",
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
});
