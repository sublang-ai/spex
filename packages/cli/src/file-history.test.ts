// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { execFileSync } from "node:child_process";
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

describe("file-history manifest is append-only (SCAF-21)", () => {
  // SCAF-21 requires a new hash to be *appended*: replacing an entry
  // makes an earlier pristine scaffold read as user-modified, so
  // --update keeps it instead of refreshing. Comparing only the
  // worktree against HEAD is vacuous once a deletion is committed,
  // so every committed version of the manifest in the available
  // history must survive as an in-order subsequence of the working
  // manifests — a path may migrate from the live manifest to the
  // legacy one (a retired bundled path), but its hashes must not
  // disappear. Shallow clones check the history they have.
  it("preserves every hash committed in history, in order", () => {
    let revs: string[];
    try {
      revs = execFileSync(
        "git",
        ["rev-list", "HEAD", "--", "scaffold/.file-history.json"],
        { cwd: REPO_ROOT, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
      )
        .trim()
        .split("\n")
        .filter(Boolean);
    } catch {
      return; // no git available
    }
    const working = JSON.parse(
      readFileSync(join(REPO_ROOT, "scaffold", ".file-history.json"), "utf-8"),
    ) as Record<string, string[]>;
    const legacy = JSON.parse(
      readFileSync(
        join(REPO_ROOT, "scaffold", ".legacy-file-history.json"),
        "utf-8",
      ),
    ) as Record<string, string[]>;
    const errors = new Set<string>();
    const seenVersions = new Set<string>();
    for (const rev of revs) {
      let text: string;
      try {
        text = execFileSync(
          "git",
          ["show", `${rev}:scaffold/.file-history.json`],
          { cwd: REPO_ROOT, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
        );
      } catch {
        continue; // shallow-history boundary
      }
      if (seenVersions.has(text)) continue;
      seenVersions.add(text);
      const committed = JSON.parse(text) as Record<string, string[]>;
      for (const [relPath, hashes] of Object.entries(committed)) {
        const now = working[relPath] ?? legacy[relPath];
        if (now === undefined) {
          errors.add(`${relPath}: dropped from both manifests`);
          continue;
        }
        let cursor = 0;
        for (const hash of hashes) {
          const at = now.indexOf(hash, cursor);
          if (at === -1) {
            errors.add(
              `${relPath}: ${hash} is gone — a recognized version must be kept and new hashes appended`,
            );
            break;
          }
          cursor = at + 1;
        }
      }
    }
    assert.deepEqual([...errors], [], [...errors].join("\n"));
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
