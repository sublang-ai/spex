#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { runDesktop } from "./desktop-runner.mjs";

try {
  process.exitCode = await runDesktop({ launchArgs: process.argv.slice(2) });
} catch (error) {
  process.stderr.write(`desktop: ${error.message}\n`);
  process.exitCode = 1;
}
