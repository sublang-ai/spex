#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// CLI entry: run one `spex-hub` command and exit with its status — 2
// for a mistaken command line, 1 for a failure, each named.

import { run, UsageError, USAGE } from "./cli.js";

run(process.argv.slice(2), {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
})
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(`spex-hub: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof UsageError) console.error(USAGE);
    process.exit(error instanceof UsageError ? 2 : 1);
  });
