// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  realpathSync,
  rmSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSpecsStructure } from "./create-specs-structure.js";

const EXPECTED_DIRS = [
  "specs",
  "specs/decisions",
  "specs/iterations",
  "specs/items",
  "specs/items/user",
  "specs/items/dev",
  "specs/items/test",
];

describe("createSpecsStructure", () => {
  function makeTmp(): string {
    return realpathSync(mkdtempSync(join(tmpdir(), "spex-test-")));
  }

  // SCAF-7: creates all directories
  it("creates all specs subdirectories", () => {
    const dir = makeTmp();
    try {
      createSpecsStructure(dir);
      for (const d of EXPECTED_DIRS) {
        assert.ok(existsSync(join(dir, d)), `missing: ${d}`);
      }
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // SCAF-4: skips existing with "(already exists)"
  it("skips existing directories with indicator", () => {
    const dir = makeTmp();
    try {
      // Pre-create specs/ and specs/decisions/
      mkdirSync(join(dir, "specs"));
      mkdirSync(join(dir, "specs/decisions"));

      const output: string[] = [];
      const origLog = console.log;
      console.log = (msg: string) => output.push(msg);
      try {
        createSpecsStructure(dir);
      } finally {
        console.log = origLog;
      }

      // Pre-existing dirs should have "(already exists)"
      const specsLine = output.find((l) => l.match(/^\s+specs\//));
      assert.ok(specsLine, "should have a line for specs/");
      assert.ok(
        specsLine.includes("(already exists)"),
        `specs/ line should show (already exists): ${specsLine}`,
      );

      const decLine = output.find((l) => l.includes("specs/decisions/"));
      assert.ok(decLine, "should have a line for specs/decisions/");
      assert.ok(
        decLine.includes("(already exists)"),
        `specs/decisions/ line should show (already exists): ${decLine}`,
      );

      // Newly created dirs should NOT have "(already exists)"
      const iterLine = output.find((l) => l.includes("specs/iterations/"));
      assert.ok(iterLine, "should have a line for specs/iterations/");
      assert.ok(
        !iterLine.includes("(already exists)"),
        `specs/iterations/ should be newly created: ${iterLine}`,
      );

      // All dirs should still exist
      for (const d of EXPECTED_DIRS) {
        assert.ok(existsSync(join(dir, d)), `missing after rerun: ${d}`);
      }
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // SCAF-4: full idempotency — second run all "(already exists)"
  it("reports all dirs as already existing on second run", () => {
    const dir = makeTmp();
    try {
      createSpecsStructure(dir);

      const output: string[] = [];
      const origLog = console.log;
      console.log = (msg: string) => output.push(msg);
      try {
        createSpecsStructure(dir);
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
