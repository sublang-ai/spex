// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Preloaded by the CLI's and the core's test runners into every test
// file's process (DR-253). A file still running long after its tests
// finished holds something open: a server, a timer, a child process.
// Node 22 ends such a file only at --test-timeout and Node 24 waits for
// it for good. This ends it on both, naming the file and what it holds,
// once its results have long been reported; --test-force-exit ended it
// at once and lost the results still queued.

import { writeSync } from "node:fs";

const file = process.argv[1] ?? "";
// A test file run by `node --test` alone: not the runner's own process,
// and no process a test starts.
if (process.env.NODE_TEST_CONTEXT && /\.test\.[cm]?js$/.test(file)) {
  const { after } = await import("node:test");
  const graceMs = Number(process.env.SPEX_TEST_EXIT_GRACE_MS) || 60000;
  after(() => {
    // Unreferenced: a file that holds nothing exits before this fires.
    setTimeout(() => {
      const held = [...new Set(process.getActiveResourcesInfo())].sort().join(", ");
      writeSync(2, `test-exit-guard: ${file} was still running ${graceMs} ms after its tests finished, holding: ${held}\n`);
      process.exit(1);
    }, graceMs).unref();
  });
}
