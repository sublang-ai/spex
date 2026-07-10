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

const files = readdirSync(join(__dirname, "..", "dist"))
  .filter((f) => regex.test(f))
  .map((f) => join("dist", f));

if (files.length === 0) {
  console.error(`No test files matching ${pattern}`);
  process.exit(1);
}

execFileSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
