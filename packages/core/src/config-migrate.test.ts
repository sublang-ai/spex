// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// DR-019 migration parity: the enumerated launcher cases — scalar
// profile refs inline (comment carried), unmatched scalars stay,
// block `profile` inlines with the block's fields winning, a missing
// reference hard-errors leaving the file untouched, the profiles map
// leaves with its header preserved, and migration is idempotent.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  migrateConfigFileIfRetired,
  migrateRetiredProfiles,
} from "./config-migrate.js";

const PROFILES_ERA = `# Spex / playbook shared configuration.
# Header paragraph that must survive.

# profiles: reusable agent settings.
profiles:
  claude-opus:
    adapter: claude
    model: claude-opus-4-8
    effort: high

captain: claude-opus # routing captain
playbooks:
  code:
    from: "@sublang/playbook/code/registry"
    players:
      coder: claude-opus
      reviewer:
        profile: claude-opus
        effort: xhigh # block's own field wins
    committer: coder
`;

test("scalar refs inline, block profile merges with block fields winning", () => {
  const migrated = migrateRetiredProfiles(PROFILES_ERA);
  assert.ok(migrated !== undefined);
  assert.doesNotMatch(migrated, /^profiles:/m);
  assert.doesNotMatch(migrated, /profile:/);
  // Captain scalar inlined with its comment carried.
  assert.match(migrated, /captain:\n\s+# routing captain\n\s+adapter: claude/);
  // Block's own effort wins over the profile's high.
  assert.match(migrated, /reviewer:\n(?:.*\n)*?\s+effort: xhigh/);
  assert.doesNotMatch(
    migrated,
    /reviewer:(?:.*\n)*?\s+effort: high\b/,
  );
  // Absent keys copied from the profile.
  assert.match(migrated, /reviewer:\n(?:.*\n)*?\s+model: claude-opus-4-8/);
  // File header survives; migration note leads the file.
  assert.match(migrated, /Migrated by playbook 3\.0\.0/);
  assert.match(migrated, /Header paragraph that must survive/);
});

test("unmatched scalars stay as written; block-only configs no-op", () => {
  const text = `captain: claude\nplaybooks:\n  code:\n    from: "x"\n    players:\n      coder: claude\n`;
  assert.equal(migrateRetiredProfiles(text), undefined);
  const stale = `profiles:\n  a:\n    adapter: claude\ncaptain: fast-opus\nplaybooks:\n  code:\n    from: "x"\n    players:\n      coder: a\n`;
  const migrated = migrateRetiredProfiles(stale);
  assert.ok(migrated !== undefined);
  // The dangling scalar is kept silently (launcher parity); it will
  // fail composition as an unknown adapter with an actionable error.
  assert.match(migrated, /captain: fast-opus/);
});

test("a block profile naming a missing entry hard-errors, file untouched", () => {
  const dir = mkdtempSync(join(tmpdir(), "spex-migrate-"));
  const path = join(dir, "playbook.config.yaml");
  const text = `captain:\n  profile: ghost\nplaybooks:\n  code:\n    from: "x"\n    players:\n      coder: claude\n`;
  writeFileSync(path, text);
  assert.throws(
    () => migrateConfigFileIfRetired(path),
    /captain\.profile names "ghost".*edit it by hand/s,
  );
  assert.equal(readFileSync(path, "utf8"), text);
  assert.equal(existsSync(`${path}.bak`), false);
});

test("file migration writes a numbered backup and is idempotent", () => {
  const dir = mkdtempSync(join(tmpdir(), "spex-migrate-"));
  const path = join(dir, "playbook.config.yaml");
  writeFileSync(path, PROFILES_ERA);
  const first = migrateConfigFileIfRetired(path);
  assert.equal(first.migrated, true);
  assert.equal(first.backupPath, `${path}.bak`);
  assert.equal(readFileSync(`${path}.bak`, "utf8"), PROFILES_ERA);
  // Second pass (e.g. the launcher raced us, or the watcher re-read)
  // no-ops.
  const second = migrateConfigFileIfRetired(path);
  assert.equal(second.migrated, false);
  // A fresh profiles-era write gets .bak.2, never clobbering .bak.
  writeFileSync(path, PROFILES_ERA);
  const third = migrateConfigFileIfRetired(path);
  assert.equal(third.backupPath, `${path}.bak.2`);
});
