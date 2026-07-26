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
  // --update keeps it instead of refreshing. Every committed version
  // of the manifest — followed across renames, resolved from the
  // real repository toplevel, since this package's own root is not
  // the git root — must survive in the working manifests: a retired
  // bundled path may migrate to the legacy manifest, but no
  // recognized hash may disappear. Without git, or in a shallow
  // clone, the check covers what history is available.
  it("preserves every hash committed in history", () => {
    let gitRoot: string;
    try {
      gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
        cwd: REPO_ROOT,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      return; // not a git checkout (e.g. a packed install)
    }
    let log: string;
    try {
      log = execFileSync(
        "git",
        [
          "log",
          "--follow",
          "--name-only",
          "--format=%H",
          "--",
          "scaffold/.file-history.json",
        ],
        { cwd: gitRoot, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
      );
    } catch {
      return;
    }
    const versions: Array<[string, string]> = [];
    let rev: string | undefined;
    for (const line of log.split("\n")) {
      if (/^[0-9a-f]{40}$/.test(line)) rev = line;
      else if (rev !== undefined && line.endsWith(".json")) {
        versions.push([rev, line]);
        rev = undefined;
      }
    }
    assert.ok(versions.length > 0, "manifest history not found from the git root");
    // Read the source manifests at the git root, not this package's
    // staged copy: the staged bundle is a build-time snapshot, so
    // comparing history against it can miss an edit made since the
    // last staging.
    const working = JSON.parse(
      readFileSync(join(gitRoot, "scaffold", ".file-history.json"), "utf-8"),
    ) as Record<string, string[]>;
    const legacy = JSON.parse(
      readFileSync(
        join(gitRoot, "scaffold", ".legacy-file-history.json"),
        "utf-8",
      ),
    ) as Record<string, string[]>;
    const errors = new Set<string>();
    const seenVersions = new Set<string>();
    for (const [commit, path] of versions) {
      let text: string;
      try {
        text = execFileSync("git", ["show", `${commit}:${path}`], {
          cwd: gitRoot,
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "ignore"],
        });
      } catch {
        continue; // shallow-history boundary
      }
      if (seenVersions.has(text)) continue;
      seenVersions.add(text);
      const committed = JSON.parse(text) as Record<string, string[]>;
      for (const [relPath, hashes] of Object.entries(committed)) {
        const now = new Set([
          ...(working[relPath] ?? []),
          ...(legacy[relPath] ?? []),
        ]);
        if (now.size === 0) {
          errors.add(`${relPath}: dropped from both manifests`);
          continue;
        }
        for (const hash of hashes) {
          if (!now.has(hash)) {
            errors.add(
              `${relPath}: ${hash} is gone — a recognized version must be kept and new hashes appended`,
            );
          }
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
