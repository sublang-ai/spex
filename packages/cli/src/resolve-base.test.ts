// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { resolveBase } from "./resolve-base.js";

describe("resolveBase", () => {
  // SCAF-1: explicit path must exist and be a directory
  it("returns absolute path for an existing directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "spex-test-"));
    try {
      const result = resolveBase(dir);
      assert.equal(result, dir);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("throws when path does not exist", () => {
    assert.throws(
      () => resolveBase("/nonexistent-spex-path-xyz"),
      /Path does not exist/,
    );
  });

  it("throws when path is a file, not a directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "spex-test-"));
    const file = join(dir, "file.txt");
    writeFileSync(file, "");
    try {
      assert.throws(() => resolveBase(file), /Path is not a directory/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // SCAF-2: no path, inside git repo → repo root
  it("resolves to git repo root when no path given inside a repo", () => {
    const root = execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
    }).trim();
    const result = resolveBase();
    assert.equal(result, root);
  });

  // SCAF-3: no path, outside git repo → cwd
  it("resolves to cwd when no path given outside a repo", () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "spex-test-nogit-")));
    const origCwd = process.cwd();
    try {
      process.chdir(dir);
      const result = resolveBase();
      assert.equal(result, dir);
    } finally {
      process.chdir(origCwd);
      rmSync(dir, { recursive: true });
    }
  });
});
