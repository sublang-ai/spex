#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Cross-platform test runner that finds test files without
// relying on shell glob expansion. Recurses into dist/ so tests
// may live in subdirectories.

const { readdirSync } = require("fs");
const { join, relative } = require("path");
const { execFileSync } = require("child_process");

const pattern = process.argv[2] || "\\.test\\.js$";
const regex = new RegExp(pattern);
const root = join(__dirname, "..");

function collect(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collect(path));
    else if (regex.test(entry.name)) out.push(relative(root, path));
  }
  return out;
}

const files = collect(join(root, "dist"));

if (files.length === 0) {
  console.error(`No test files matching ${pattern}`);
  process.exit(1);
}

// --test-timeout turns a hung test into a named failure; force-exit
// keeps a leaked handle from zombifying the run (observed on the
// Windows CI runners).
execFileSync(
  process.execPath,
  ["--test", "--test-timeout=180000", "--test-force-exit", ...files],
  {
    stdio: "inherit",
    cwd: root,
    // Tests speak English (DR-079). A core started without system
    // languages reads its own process locale, which ICU takes from
    // these variables, so pinning them here makes every service the
    // suite starts — and every child process it spawns — speak the
    // one language the assertions are written in, whatever the host
    // reads. "C" is the one locale every POSIX host has.
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
  },
);
