// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveSessionsDir } from "./config.js";

test("home defaults agree and only explicit session paths replace the shared default", () => {
  const scratch = mkdtempSync(join(tmpdir(), "spex-locations-")); const home = join(scratch, "home"); const config = join(scratch, "elsewhere", "config.yaml"); mkdirSync(join(scratch, "elsewhere"));
  assert.equal(resolveSessionsDir(config, { SPEX_HOME: home, XDG_STATE_HOME: "/ignored" }, scratch), join(home, "sessions"));
  assert.equal(resolveSessionsDir(config, { SPEX_HOME: "  " }, scratch), join(scratch, ".spex", "sessions"));
  writeFileSync(config, "sessions: ./records\n"); assert.equal(resolveSessionsDir(config, { SPEX_HOME: home }, scratch), join(scratch, "elsewhere", "records"));
  writeFileSync(config, "sessions: ~/records\n"); assert.equal(resolveSessionsDir(config, {}, scratch), join(scratch, "records"));
  rmSync(scratch, { recursive: true, force: true });
});
