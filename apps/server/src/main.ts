#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// CLI entry: parse argv, start the shell, print the one access URL
// (SERVER-SHELL-1) — or, as a seat, the socket it listens on and no URL,
// its token in no output (SERVER-SHELL-25) — and stop the core before
// exiting on SIGINT or SIGTERM, within twenty seconds, so no agent process is orphaned
// (SERVER-SHELL-6).

import {
  describeError,
  exitOnSignals,
  formatHost,
  isLoopback,
  parseArgs,
  startSeat,
  startServer,
  type ServerShellOptions,
} from "./server.js";



/** Start the shell the options name, printing what reaches it; the
 * stop it answers to. */
async function start(
  options: ServerShellOptions,
): Promise<{ close(): Promise<void> }> {
  if (options.seat) {
    const running = await startSeat(options);
    console.log(
      `[spex-server] seat of person ${options.seat.personId} on ${options.seat.serverName} listening at ${running.socket}`,
    );
    console.log(
      `[spex-server] config: ${JSON.stringify(running.service.configStateSnapshot().status)}`,
    );
    return running;
  }
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
