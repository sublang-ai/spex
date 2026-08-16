#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Flip native-module ABI between Electron and system Node
// (SHELL-13). better-sqlite3 lives once in the hoisted root
// node_modules, so running the app and running core tests need
// different builds:
//
//   node scripts/rebuild-native.mjs electron   # before electron .
//   node scripts/rebuild-native.mjs node       # before npm test

import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const target = process.argv[2];
if (target !== "electron" && target !== "node") {
  console.error("usage: rebuild-native.mjs <electron|node>");
  process.exit(2);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const require = createRequire(import.meta.url);

// node-gyp reads its build configuration from npm_config_* env vars.
// Passing them as CLI flags relied on npm forwarding unknown flags
// into the environment — a passthrough npm 11 deprecates — so they
// are set as environment variables directly.
const env = { ...process.env };
if (target === "electron") {
  const electronVersion = require(
    resolve(root, "node_modules", "electron", "package.json"),
  ).version;
  Object.assign(env, {
    npm_config_build_from_source: "true",
    npm_config_runtime: "electron",
    npm_config_target: electronVersion,
    npm_config_dist_url: "https://electronjs.org/headers",
  });
} else {
  // A leftover electron config in the environment must not leak into
  // the node build.
  for (const key of [
    "npm_config_build_from_source",
    "npm_config_runtime",
    "npm_config_target",
    "npm_config_dist_url",
  ]) {
    delete env[key];
  }
}

console.log(`[rebuild-native] npm rebuild better-sqlite3 (${target} ABI)`);
execSync("npm rebuild better-sqlite3", { cwd: root, stdio: "inherit", env });
