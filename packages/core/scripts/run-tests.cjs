#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Cross-platform test runner that finds test files without
// relying on shell glob expansion. Recurses into dist/ so tests
// may live in subdirectories.

const { readdirSync, statSync } = require("fs");
const { join, relative } = require("path");
const { execFileSync } = require("child_process");
const { availableParallelism } = require("os");

const pattern = process.argv[2] || "\\.test\\.js$";
const regex = new RegExp(pattern);
const root = join(__dirname, "..");
// Real-core cases also spawn Git; bound file workers to limit
// subprocess contention, keeping Node's default on 1/2-CPU hosts.
// Three files at once at most: the suites use scratch homes and free
// ports, the CI runners have four cores, and a fourth file slowed
// the whole run on a loaded runner more than it saved (DR-166).
const concurrency = Math.min(3, Math.max(1, availableParallelism() - 1));

function collect(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collect(path));
    // Only test modules: a filter naming a file also matches its
    // declarations and source map, which are no tests.
    else if (entry.name.endsWith(".test.js") && regex.test(entry.name)) out.push(relative(root, path));
  }
  return out;
}

const all = collect(join(root, "dist"));

if (all.length === 0) {
  console.error(`No test files matching ${pattern}`);
  process.exit(1);
}

// One part of the suite on a runner of its own (release-34, DR-229):
// SPEX_TEST_SHARD=<part>/<parts> sorts the files largest first, a rough
// measure of how long each runs, and deals them to the parts in turn,
// this run taking its part's. Every file lands in exactly one part.
const files = (() => {
  const shard = process.env.SPEX_TEST_SHARD;
  if (!shard) return all;
  const match = /^([1-9]\d*)\/([1-9]\d*)$/.exec(shard);
  if (!match || Number(match[1]) > Number(match[2])) {
    console.error(`SPEX_TEST_SHARD must be <part>/<parts>, as 2/3: ${shard}`);
    process.exit(2);
  }
  const [part, parts] = [Number(match[1]), Number(match[2])];
  const size = (file) => statSync(join(root, file)).size;
  const dealt = [...all]
    .sort((a, b) => size(b) - size(a) || (a < b ? -1 : a > b ? 1 : 0))
    .filter((_, index) => index % parts === part - 1);
  console.log(`run-tests: part ${part} of ${parts}, ${dealt.length} of ${all.length} files`);
  return dealt;
})();

if (files.length === 0) {
  console.log("run-tests: this part holds no file");
  process.exit(0);
}

// --test-timeout turns a hung test into a named failure; force-exit
// keeps a leaked handle from zombifying the run (observed on the
// Windows CI runners). Node 22 applies the timeout to each file as a
// whole as well as to each test (Node 24 to each test only), so the
// budget must hold the longest file on the slowest runner: the core
// integration file alone passed 180 s on the macOS runner, where this
// suite takes about five times what it takes on Linux, and the space-host
// file, whose creation cases hold 2 s re-reads by design, passed 600 s
// there once the restarted core's case joined it.
execFileSync(
  process.execPath,
  [
    "--test",
    "--test-timeout=1200000",
    "--test-force-exit",
    `--test-concurrency=${concurrency}`,
    ...files,
  ],
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
