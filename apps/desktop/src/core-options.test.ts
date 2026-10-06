// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// What the desktop starts its core with (app-shell-15, app-shell-29,
// app-shell-33): the shared state root and the legacy store beside
// userData, the system's languages, this Electron as the runtime of
// the compiler, the scaffold CLI and the Git credential helper, and
// the browser sign-in flow; and main.ts starts the core with exactly
// these, its smoke redirect (app-shell-24) unchanged.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { moduleDirectoriesAbove } from "@sublang/spex-core";

import { desktopCoreOptions } from "./core-options.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("the desktop's core signs in through the browser and runs Git's helper on the app's Electron", () => {
  const electron = "/Applications/Spex.app/Contents/MacOS/Spex";
  const options = desktopCoreOptions({
    dataDir: "/home/ada/.spex",
    userData: "/home/ada/Library/Application Support/Spex",
    systemLanguages: ["zh-Hans-CN", "en-US"],
    execPath: electron,
    moduleUrl: import.meta.url,
  });
  // app-shell-15: the browser flow and this Electron as the helper's runtime.
  assert.equal(options.signIn, "browser");
  assert.deepEqual(options.hostRuntime, { execPath: electron, electron: true });
  // The shared state root, the legacy store handed over, an OS port.
  assert.equal(options.dataDir, "/home/ada/.spex");
  assert.equal(options.legacyDbPath, join("/home/ada/Library/Application Support/Spex", "spex.db"));
  assert.equal(options.port, 0);
  // app-shell-29: the system's languages reach the core.
  assert.deepEqual(options.systemLanguages, ["zh-Hans-CN", "en-US"]);
  // app-shell-33: the compiler's runtime is the same Electron, over the
  // module directories above the shell's own module, and the scaffold
  // is the checkout's own CLI on it.
  assert.deepEqual(options.compileRuntime, {
    execPath: electron,
    electron: true,
    modulePaths: moduleDirectoriesAbove(import.meta.url),
  });
  assert.deepEqual(options.scaffoldCommand, [electron, join(packageRoot, "..", "..", "packages", "cli", "dist", "cli.js")]);
  assert.deepEqual(options.scaffoldEnv, { ELECTRON_RUN_AS_NODE: "1" });
});

test("main.ts starts the core with those options, the smoke redirect unchanged", () => {
  const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  assert.match(source, /CoreService\.start\(\s*desktopCoreOptions\(\{/);
  assert.match(source, /execPath: process\.execPath,/);
  assert.match(source, /userData: app\.getPath\("userData"\),/);
  assert.match(source, /systemLanguages: app\.getPreferredSystemLanguages\(\),/);
  // app-shell-24: the handshake or acceptance variable with the smoke
  // user-data variable redirects user data and the state root.
  assert.match(source, /process\.env\.SPEX_SMOKE_HANDSHAKE \|\| process\.env\.SPEX_ACCEPTANCE\s*\?\s*process\.env\.SPEX_SMOKE_USERDATA/);
  assert.match(source, /join\(isolatedUserData, "spex-home"\)/);
});
