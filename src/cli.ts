#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { scaffold } from "./scaffold.js";

const USAGE = `Usage: spex <command> [options]

Commands:
  scaffold [<path>]   Create specs directory structure`;

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    console.log(USAGE);
    process.exit(0);
  }

  switch (command) {
    case "scaffold":
      scaffold(args[1]);
      break;
    default:
      console.error(`Unknown command: ${command}\n`);
      console.error(USAGE);
      process.exit(1);
  }
}

main();
