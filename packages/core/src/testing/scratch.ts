// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Scratch directories for the core's own tests: each one made under
// the system temp directory and removed once the importing test file's
// tests end. Not re-exported from `./index.ts` — it registers a
// node:test hook, which only a node:test file may load.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after } from "node:test";

const scratchDirs: string[] = [];

// Registered as the module loads, which is at the top level of the
// test file importing it: node:test attaches a hook to the test that
// is running when it is registered, so one first registered inside a
// test would run when that test ends, before later tests make theirs.
after(() => {
  for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A fresh directory under the system temp directory, removed once
 * this test file's tests end. */
export function scratchDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratchDirs.push(dir);
  return dir;
}
