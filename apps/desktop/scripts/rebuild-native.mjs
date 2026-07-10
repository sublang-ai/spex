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

let command = "npm rebuild better-sqlite3";
if (target === "electron") {
  const electronVersion = require(
    resolve(root, "node_modules", "electron", "package.json"),
  ).version;
  command +=
    ` --build-from-source --runtime=electron --target=${electronVersion}` +
    " --dist-url=https://electronjs.org/headers";
}

console.log(`[rebuild-native] ${command}`);
execSync(command, { cwd: root, stdio: "inherit" });
