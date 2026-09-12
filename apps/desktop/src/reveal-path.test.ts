// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The reveal bridge's containment (app-shell-28, space-36): a path is
// shown only when its real path lies inside the state root's real
// path; traversal, symlinks out of the root, absent files and non-
// string requests reveal nothing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveRevealTarget } from "./reveal-path.js";

function scratch(): { root: string; outside: string } {
  const base = mkdtempSync(join(tmpdir(), "spex-reveal-"));
  const root = join(base, "home");
  const outside = join(base, "elsewhere");
  mkdirSync(join(root, "sessions"), { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(root, "sessions", "a.json"), "{}");
  writeFileSync(join(root, "prefs.json"), "{}");
  writeFileSync(join(outside, "secret.txt"), "x");
  return { root, outside };
}

test("a path inside the root resolves to its real path", () => {
  const { root } = scratch();
  const target = resolveRevealTarget(root, join(root, "sessions", "a.json"));
  assert.equal(target, realpathSync(join(root, "sessions", "a.json")));
  // The root itself is inside the root.
  assert.equal(resolveRevealTarget(root, root), realpathSync(root));
  // A relative request resolves against the root.
  assert.equal(resolveRevealTarget(root, "prefs.json"), realpathSync(join(root, "prefs.json")));
});

test("traversal, symlinks out of the root, absent files and bad requests reveal nothing", () => {
  const { root, outside } = scratch();
  assert.equal(resolveRevealTarget(root, join(root, "..", "elsewhere", "secret.txt")), null);
  assert.equal(resolveRevealTarget(root, join(outside, "secret.txt")), null);
  symlinkSync(join(outside, "secret.txt"), join(root, "link.txt"));
  assert.equal(resolveRevealTarget(root, join(root, "link.txt")), null);
  assert.equal(resolveRevealTarget(root, join(root, "missing.json")), null);
  assert.equal(resolveRevealTarget(root, ""), null);
  assert.equal(resolveRevealTarget(root, 42), null);
  assert.equal(resolveRevealTarget(root, undefined), null);
  // A sibling whose name merely starts with the root's is outside it.
  mkdirSync(`${root}-twin`, { recursive: true });
  writeFileSync(join(`${root}-twin`, "x"), "x");
  assert.equal(resolveRevealTarget(root, join(`${root}-twin`, "x")), null);
});

test("the main process serves the reveal channel behind the containment rule", () => {
  const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  assert.match(source, /ipcMain\.handle\("spex:reveal-path"/);
  assert.match(source, /resolveRevealTarget\(dataDir/);
  assert.match(source, /shell\.showItemInFolder/);
  const preload = readFileSync(new URL("../preload.cjs", import.meta.url), "utf8");
  assert.match(preload, /revealPath: \(path\) => ipcRenderer\.invoke\("spex:reveal-path", path\)/);
});
