// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, posix, relative } from "node:path";
import {
  getBundledSpecFilePath,
  getSeedSpecFiles,
  isLegacyPristine,
  listFiles,
  type ScaffoldLanguage,
} from "./copy-templates.js";
import { baseHeadingSlugs } from "./markdown.js";
import {
  convertVerifiesLines,
  LEGACY_GROUPS,
  mergePackageSources,
  type LegacyGroup,
  type PackageSources,
} from "./merge-package.js";
import { rewriteLegacyCitations } from "./rewrite-citations.js";

export type PackageMigrationStatus = "merged" | "seeded" | "moved" | "conflict";

export type PackageMigrationResult = {
  status: PackageMigrationStatus;
  targetRelPath: string;
  /**
   * Pre-run paths as the user knows them (provenance-composed for
   * merges/moves; raw on-disk paths for conflicts, since those files
   * stay where they are).
   */
  sourceRelPaths: string[];
};

export type PackageMigrationOutcome = {
  results: PackageMigrationResult[];
  /** True when at least one package file was merged or seeded. */
  migratedPackages: boolean;
  /** Duplicate heading anchors created by merges, for a stderr note. */
  anchorCollisions: { targetRelPath: string; slugs: string[] }[];
};

type MigrateOptions = {
  language: ScaffoldLanguage;
  /**
   * Where a source file came from before an earlier migration step
   * this run (flat rel path → original rel path), so indicators name
   * the paths the user actually had.
   */
  provenance?: ReadonlyMap<string, string>;
};

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

function removeEmptyDirectories(dir: string): void {
  if (!isDirectory(dir)) return;
  for (const entry of readdirSync(dir)) {
    removeEmptyDirectories(join(dir, entry));
  }
  if (readdirSync(dir).length === 0) rmdirSync(dir);
}

function duplicateSlugs(content: string): string[] {
  // Base slugs (computed without the -N dedupe counter) that occur
  // more than once. Item IDs like AUTH-1 naturally end in -N, so
  // suffix stripping cannot be used to detect collisions.
  const counts = new Map<string, number>();
  for (const slug of baseHeadingSlugs(content)) {
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([slug]) => slug);
}

/**
 * Migrate the legacy specs/user|dev|test item layout into
 * specs/packages/: one merged file per package. Sources are deleted
 * only after their target is written, so an interrupted run leaves
 * every byte recoverable and a rerun picks up the remainder.
 */
export function migratePackageLayout(
  basePath: string,
  options: MigrateOptions,
): PackageMigrationOutcome {
  const outcome: PackageMigrationOutcome = {
    results: [],
    migratedPackages: false,
    anchorCollisions: [],
  };

  const groupRoots = LEGACY_GROUPS.filter((group) =>
    isDirectory(join(basePath, "specs", group)),
  );
  if (groupRoots.length === 0) return outcome;

  const packages = new Map<string, Partial<Record<LegacyGroup, string>>>();
  const assets: { group: LegacyGroup; rel: string; abs: string }[] = [];
  for (const group of groupRoots) {
    const root = join(basePath, "specs", group);
    for (const abs of listFiles(root)) {
      const rel = relative(root, abs).replace(/\\/g, "/");
      if (rel.endsWith(".md")) {
        const entry = packages.get(rel) ?? {};
        entry[group] = abs;
        packages.set(rel, entry);
      } else {
        assets.push({ group, rel, abs });
      }
    }
  }

  const provenance = options.provenance ?? new Map<string, string>();
  const sourceRel = (group: LegacyGroup, rel: string): string => {
    const flat = posix.join("specs", group, rel);
    return provenance.get(flat) ?? flat;
  };
  const seedPaths = new Set(getSeedSpecFiles());

  for (const [rel, sources] of [...packages.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const targetRelPath = posix.join("specs/packages", rel);
    const target = join(basePath, targetRelPath);
    const groups = LEGACY_GROUPS.filter(
      (group) => sources[group] !== undefined,
    );

    if (existsSync(target)) {
      outcome.results.push({
        status: "conflict",
        targetRelPath,
        sourceRelPaths: groups.map((group) => posix.join("specs", group, rel)),
      });
      continue;
    }

    const sourceRelPaths = groups.map((group) => sourceRel(group, rel));
    const allPristine = groups.every(
      (group) =>
        isLegacyPristine(basePath, posix.join("specs", group, rel)) ===
        "pristine",
    );

    mkdirSync(dirname(target), { recursive: true });
    if (allPristine && seedPaths.has(targetRelPath)) {
      // Untouched old bundled seeds jump straight to the current
      // bundled package file; refreshPristineSeeds reports them.
      writeFileSync(
        target,
        readFileSync(getBundledSpecFilePath(targetRelPath, options.language)),
      );
      outcome.results.push({ status: "seeded", targetRelPath, sourceRelPaths });
    } else {
      const merge: PackageSources = {};
      for (const group of groups) {
        merge[group] = {
          text: readFileSync(sources[group] as string, "utf-8"),
        };
      }
      const basename = posix.basename(rel, ".md");
      const { content } = mergePackageSources(basename, merge);
      const converted = convertVerifiesLines(content);
      writeFileSync(target, converted);
      const slugs = duplicateSlugs(converted);
      if (slugs.length > 0) {
        outcome.anchorCollisions.push({ targetRelPath, slugs });
      }
      outcome.results.push({ status: "merged", targetRelPath, sourceRelPaths });
    }
    outcome.migratedPackages = true;
    for (const group of groups) {
      rmSync(sources[group] as string);
    }
  }

  for (const { group, rel, abs } of assets) {
    const flatRelPath = posix.join("specs", group, rel);
    if (
      posix.basename(rel) === ".gitkeep" &&
      isLegacyPristine(basePath, flatRelPath) === "pristine"
    ) {
      rmSync(abs);
      continue;
    }
    const targetRelPath = posix.join("specs/packages", rel);
    const target = join(basePath, targetRelPath);
    if (existsSync(target)) {
      outcome.results.push({
        status: "conflict",
        targetRelPath,
        sourceRelPaths: [flatRelPath],
      });
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    renameSync(abs, target);
    outcome.results.push({
      status: "moved",
      targetRelPath,
      sourceRelPaths: [sourceRel(group, rel)],
    });
  }

  for (const group of groupRoots) {
    removeEmptyDirectories(join(basePath, "specs", group));
  }

  return outcome;
}

export type InteractionsMigrationResult = {
  status: "moved" | "conflict";
  targetRelPath: string;
  sourceRelPath: string;
};

/**
 * SCAF-50: move specs/interactions/ entries to specs/compositions/,
 * keeping conflict targets in place. A pristine bundled .gitkeep is
 * dropped via the legacy manifest. Sources are moved one at a time,
 * so an interrupted run resumes cleanly.
 */
export function migrateInteractionsLayout(
  basePath: string,
): InteractionsMigrationResult[] {
  const results: InteractionsMigrationResult[] = [];
  const root = join(basePath, "specs", "interactions");
  if (!isDirectory(root)) return results;

  for (const abs of listFiles(root)) {
    const rel = relative(root, abs).replace(/\\/g, "/");
    const sourceRelPath = posix.join("specs/interactions", rel);
    if (
      posix.basename(rel) === ".gitkeep" &&
      isLegacyPristine(basePath, sourceRelPath) === "pristine"
    ) {
      rmSync(abs);
      continue;
    }
    const targetRelPath = posix.join("specs/compositions", rel);
    const target = join(basePath, targetRelPath);
    if (existsSync(target)) {
      results.push({ status: "conflict", targetRelPath, sourceRelPath });
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    if (rel.endsWith(".md")) {
      const converted = convertVerifiesLines(readFileSync(abs, "utf-8"));
      writeFileSync(target, converted);
      rmSync(abs);
    } else {
      renameSync(abs, target);
    }
    results.push({ status: "moved", targetRelPath, sourceRelPath });
  }

  removeEmptyDirectories(root);
  return results;
}

/**
 * Rewrite citations that resolve into the legacy layout across every
 * markdown file under specs/, skipping the given specs-relative
 * paths (pristine framework/seed files that a later step replaces
 * wholesale). Returns the rewritten file paths. Safe to run on every
 * update: only links whose old target is gone and whose new target
 * exists are touched, so it is a no-op on migrated trees and
 * self-repairs interrupted runs.
 */
export function rewriteAllSpecCitations(
  basePath: string,
  skipRelPaths: ReadonlySet<string>,
): string[] {
  const specsDir = join(basePath, "specs");
  if (!isDirectory(specsDir)) return [];

  const rewritten: string[] = [];
  for (const abs of listFiles(specsDir)) {
    if (!abs.endsWith(".md")) continue;
    const relPath = posix.join(
      "specs",
      relative(specsDir, abs).replace(/\\/g, "/"),
    );
    if (skipRelPaths.has(relPath)) continue;
    const text = readFileSync(abs, "utf-8");
    const result = rewriteLegacyCitations(relPath, text, {
      legacyTargetExists: (rel) => existsSync(join(basePath, rel)),
      newTargetExists: (rel) => existsSync(join(basePath, rel)),
    });
    if (result !== null) {
      writeFileSync(abs, result);
      rewritten.push(relPath);
    }
  }
  return rewritten;
}
