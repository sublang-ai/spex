#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Serve one single-user IDE until SIGINT or SIGTERM.

import {
  describeError,
  exitOnSignals,
  formatHost,
  isLoopback,
  parseArgs,
  startServer,
  type ServerShellOptions,
} from "./server.js";



/** Start the shell the options name, printing what reaches it; the
 * stop it answers to. */
async function start(
  options: ServerShellOptions,
): Promise<{ close(): Promise<void> }> {
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
  return running;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2), process.env);
  const running = await start(options);

  exitOnSignals(running);
}

main().catch((error) => {
  console.error(describeError(error));
  process.exit(1);
});
