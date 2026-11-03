// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// SpaceGit.run: a child that exits before reading its input is a
// failed command, never an unhandled pipe error.

import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import { SpaceGit } from "./space-git.js";
import { scratchDir } from "./testing/scratch.js";

test("a large input to a Git command that exits early returns its failure", async () => {
  const missing = join(scratchDir("space-git-epipe"), "gone");
  // Well past a pipe's buffer, so the write is still pending when Git exits.
  const input = Array.from({ length: 10_000 }, (_, i) => i.toString(16).padStart(40, "0")).join("\n") + "\n";
  const run = await new SpaceGit(missing, process.env).run(["cat-file", "--batch"], { input });
  assert.notEqual(run.code, 0);
  assert.match(run.stderr, /gone/);
});
