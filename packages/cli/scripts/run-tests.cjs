#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Cross-platform test runner that finds test files without
// relying on shell glob expansion.

const { readdirSync } = require("fs");
const { join } = require("path");
const { execFileSync } = require("child_process");

const pattern = process.argv[2] || "\\.test\\.js$";
const regex = new RegExp(pattern);

// Recurses into dist/, so the library's tests under dist/lib/ run too.
const files = readdirSync(join(__dirname, "..", "dist"), { recursive: true })
  .filter((f) => regex.test(f))
  .sort()
  .map((f) => join("dist", f));

if (files.length === 0) {
  console.error(`No test files matching ${pattern}`);
  process.exit(1);
}

// --test-timeout turns a hung test into a named failure; force-exit
// keeps a leaked handle from zombifying the run. The packed-command
// integration file starts many native CLI processes; Windows private-storage
// checks make its cumulative run exceed three minutes on native hosts.
const timeoutMs = process.platform === "win32" ? 600000 : 180000;
execFileSync(
  process.execPath,
  ["--test", `--test-timeout=${timeoutMs}`, "--test-force-exit", ...files],
  { stdio: "inherit" },
);
