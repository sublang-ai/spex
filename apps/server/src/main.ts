#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// CLI entry: parse argv, start the shell, print the one access URL
// (SERVER-SHELL-1), and stop the core before exiting on SIGINT or
// SIGTERM, within twenty seconds, so no agent process is orphaned
// (SERVER-SHELL-6).

import {
  describeError,
  exitOnSignals,
  formatHost,
  isLoopback,
  parseArgs,
  startServer,
} from "./server.js";

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2), process.env);
  const running = await startServer(options);
  console.log(`[spex-server] serving at ${running.url}`);
  if (isLoopback(options.host)) {
    console.log(
      `[spex-server] remote access: ssh -N -L ${running.port}:${formatHost(options.host)}:${running.port} <user>@<server>`,
    );
  }
  console.log(
    `[spex-server] config: ${JSON.stringify(running.service.configStateSnapshot().status)}`,
  );
  exitOnSignals(running);
}

main().catch((error) => {
  console.error(describeError(error));
  process.exit(1);
});
