// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const desktop = join(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(desktop, "..", "..");

// Use electron-builder's real loader in separate processes: its relative
// hook resolution follows cwd, even with --projectDir (app-shell-43).
for (const [entry, cwd] of [["repository --projectDir", root], ["desktop workspace", desktop]]) {
  test(`packaging hooks load through the official resolver from ${entry} (app-shell-43)`, () => {
    const result = spawnSync(process.execPath, ["-e", `
      const assert = require("node:assert/strict");
      const { join } = require("node:path");
      const { resolveFunction } = require("app-builder-lib/out/util/resolve.js");
      const config = require(join(process.argv[1], "package.json")).build;
      (async () => {
        const include = await resolveFunction("module", config.onNodeModuleFile, "onNodeModuleFile", process.argv[2]);
        const verify = await resolveFunction("module", config.afterPack, "afterPack", process.argv[2]);
        assert.equal(typeof include, "function");
        assert.equal(typeof verify, "function");
        for (const declaration of ["lib.d.ts", "types.d.mts", "types.d.cts"])
          assert.equal(include(declaration), true);
        assert.equal(include("ordinary.js"), undefined);
      })().catch(error => { console.error(error); process.exitCode = 1; });
    `, desktop, root], { cwd, encoding: "utf8", timeout: 30_000 });
    assert.equal(result.status, 0, result.stderr);
  });
}
