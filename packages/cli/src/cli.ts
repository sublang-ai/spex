#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { lint } from "./lint.js";
import { scaffold } from "./scaffold.js";

const USAGE = `Usage: spex <command> [options]

Commands:
  scaffold [--lang <code>] [--agents <names>] [<path>]
                                     Create specs directory structure
  scaffold --update [--lang <code>] [--agents <names>]
                                     Refresh scaffold-provided specs templates
  lint [<path>]                      Check the specs tree structure, item IDs,
                                     and citations

Agent names: claude, codex, gemini, kimi, opencode, or all`;

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    console.log(USAGE);
    process.exit(0);
  }

  switch (command) {
    case "scaffold":
      scaffold(args.slice(1));
      break;
    case "lint":
      lint(args.slice(1));
      break;
    default:
      console.error(`Unknown command: ${command}\n`);
      console.error(USAGE);
      process.exit(1);
  }
}

main();
