// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canonicalContentHash } from "./copy-templates.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCAFFOLD_ROOT = join(REPO_ROOT, "scaffold");
const SCAFFOLD_SPECS = join(SCAFFOLD_ROOT, "specs");
const SCAFFOLD_I18N = join(SCAFFOLD_ROOT, "i18n");

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

function listBundledManifestFiles(): string[] {
  const files = listBundledSpecFiles(SCAFFOLD_SPECS);
  if (existsSync(SCAFFOLD_I18N)) {
    for (const entry of readdirSync(SCAFFOLD_I18N, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const overlaySpecs = join(SCAFFOLD_I18N, entry.name, "specs");
      if (existsSync(overlaySpecs)) {
        files.push(...listBundledSpecFiles(overlaySpecs));
      }
    }
  }
  return files.sort();
}

describe("legacy file-history manifest", () => {
  const manifestPath = join(REPO_ROOT, "scaffold", ".legacy-file-history.json");

  it("holds only paths that no longer ship, with non-empty histories", () => {
    const legacy = JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<
      string,
      string[]
    >;
    const bundled = new Set(listBundledManifestFiles());
    assert.ok(Object.keys(legacy).length > 0, "legacy manifest is empty");
    for (const [relPath, hashes] of Object.entries(legacy)) {
      assert.ok(!bundled.has(relPath), `${relPath} still ships in the bundle`);
      assert.equal(
        existsSync(join(SCAFFOLD_ROOT, relPath)),
        false,
        `${relPath} exists on disk but is in the legacy manifest`,
      );
      assert.ok(hashes.length > 0, `${relPath}: empty history`);
      assert.equal(
        new Set(hashes).size,
        hashes.length,
        `${relPath}: duplicate hash entries`,
      );
    }
  });

  it("is disjoint from the live manifest", () => {
    const legacy = JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<
      string,
      string[]
    >;
    const live = JSON.parse(
      readFileSync(join(REPO_ROOT, "scaffold", ".file-history.json"), "utf-8"),
    ) as Record<string, string[]>;
    for (const relPath of Object.keys(legacy)) {
      assert.ok(!(relPath in live), `${relPath} is in both manifests`);
    }
  });
});

describe("file-history manifest (SCAF-21)", () => {
  it("matches the bundled scaffold/specs file set", () => {
    const manifestPath = join(REPO_ROOT, "scaffold", ".file-history.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<
      string,
      string[]
    >;
    assert.deepEqual(
      Object.keys(manifest).sort(),
      listBundledManifestFiles(),
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
