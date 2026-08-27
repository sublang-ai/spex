#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// CLI entry: parse argv, start the shell, print the one access URL
// (SERVER-SHELL-1), and stop the core before exiting on SIGINT or
// SIGTERM so no agent process is orphaned (SERVER-SHELL-6).

import { formatHost, isLoopback, parseArgs, startServer } from "./server.js";

/** A stop reports its disposal failures together; name each one, or
 * the operator learns a count and never the cause. */
function describeError(error: unknown): string {
  if (error instanceof AggregateError) {
    return [
      error.message,
      ...error.errors.map((cause) => `  - ${describeError(cause)}`),
    ].join("\n");
  }
  return error instanceof Error ? error.message : String(error);
}

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

  let stopping = false;
  const shutdown = (): void => {
    if (stopping) return;
    stopping = true;
    running
      .close()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error(describeError(error));
        process.exit(1);
      });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(describeError(error));
  process.exit(1);
});
