// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canonicalContentHash } from "./copy-templates.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCAFFOLD_ROOT = join(REPO_ROOT, "scaffold");
const SCAFFOLD_SPECS = join(SCAFFOLD_ROOT, "specs");

function listBundledSpecFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === ".DS_Store") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      files.push(...listBundledSpecFiles(path));
    } else {
      files.push(relative(SCAFFOLD_ROOT, path).replace(/\\/g, "/"));
    }
  }
  return files.sort();
}

describe("file-history manifest (SCAF-21)", () => {
  it("matches the bundled scaffold/specs file set", () => {
    const manifestPath = join(REPO_ROOT, "scaffold", ".file-history.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<
      string,
      string[]
    >;
    assert.deepEqual(
      Object.keys(manifest).sort(),
      listBundledSpecFiles(SCAFFOLD_SPECS),
    );
  });

  it("stores the current bundled hash as each file's final entry", () => {
    const manifestPath = join(REPO_ROOT, "scaffold", ".file-history.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<
      string,
      string[]
    >;
    const errors: string[] = [];
    for (const [relPath, hashes] of Object.entries(manifest)) {
      const uniqueHashes = new Set(hashes);
      if (hashes.length === 0) {
        errors.push(`${relPath}: empty history`);
        continue;
      }
      if (uniqueHashes.size !== hashes.length) {
        errors.push(`${relPath}: duplicate hash entries`);
      }
      const currentHash = canonicalContentHash(
        readFileSync(join(SCAFFOLD_ROOT, relPath)),
      );
      if (hashes[hashes.length - 1] !== currentHash) {
        errors.push(`${relPath}: final hash is not current ${currentHash}`);
      }
    }
    assert.deepEqual(errors, [], errors.join("\n"));
  });
});
