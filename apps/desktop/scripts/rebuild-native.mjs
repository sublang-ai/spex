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

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const target = process.argv[2];
if (target !== "electron" && target !== "node") {
  console.error("usage: rebuild-native.mjs <electron|node>");
  process.exit(2);
}

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(appDir, "..", "..");
const require = createRequire(import.meta.url);
if (target === "electron") {
  const electronVersion = require(
    resolve(root, "node_modules", "electron", "package.json"),
  ).version;
  const { rebuild } = await import("@electron/rebuild");
  console.log(`[rebuild-native] rebuilding better-sqlite3 (Electron ABI)`);
  await rebuild({
    buildPath: appDir,
    projectRootPath: root,
    electronVersion,
    extraModules: ["better-sqlite3"],
    onlyModules: ["better-sqlite3"],
    force: true,
    buildFromSource: true,
  });
} else {
  const env = { ...process.env };
  for (const key of [
    "npm_config_build_from_source",
    "npm_config_runtime",
    "npm_config_target",
    "npm_config_dist_url",
  ]) {
    delete env[key];
  }
  console.log(`[rebuild-native] npm rebuild better-sqlite3 (Node ABI)`);
  execFileSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["rebuild", "better-sqlite3"],
    { cwd: root, stdio: "inherit", env },
  );
}
