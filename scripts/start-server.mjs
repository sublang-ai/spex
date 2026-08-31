#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(fileURLToPath(new URL(".", import.meta.url)));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const signalExitCodes = { SIGINT: 130, SIGTERM: 143 };
let build;
let requestedSignal;

const stopBuild = (signal) => {
  requestedSignal ??= signal;
  if (!build || build.exitCode != null || build.signalCode != null) return;
  try {
    if (process.platform !== "win32" && build.pid) {
      process.kill(-build.pid, signal);
    } else {
      build.kill(signal);
    }
  } catch (error) {
    if (error?.code !== "ESRCH") {
      process.stderr.write(
        `server: could not signal the workspace build: ${error.message}\n`,
      );
    }
  }
};

const handlers = new Map(
  Object.keys(signalExitCodes).map((signal) => [
    signal,
    () => stopBuild(signal),
  ]),
);
for (const [signal, handler] of handlers) process.on(signal, handler);

const result = await new Promise((resolveResult) => {
  try {
    build = spawn(npm, ["run", "build"], {
      cwd: root,
      stdio: "inherit",
      detached: process.platform !== "win32",
    });
  } catch (error) {
    resolveResult({ code: null, signal: null, error });
    return;
  }
  build.once("error", (error) =>
    resolveResult({ code: null, signal: null, error }),
  );
  build.once("exit", (code, signal) =>
    resolveResult({ code, signal, error: undefined }),
  );
});

for (const [signal, handler] of handlers) process.off(signal, handler);

if (requestedSignal) {
  process.exitCode = signalExitCodes[requestedSignal] ?? 1;
} else if (result.error || result.code !== 0) {
  const outcome = result.error?.message ??
    (result.signal ? `terminated by ${result.signal}` : `exited ${result.code}`);
  process.stderr.write(`server: workspace build ${outcome}\n`);
  process.exitCode = result.code || 1;
} else {
  // Keep the server in this lifecycle process: its own SIGINT/SIGTERM
  // handlers can then finish core shutdown before npm returns.
  await import(pathToFileURL(join(root, "apps", "server", "dist", "main.js")));
}
