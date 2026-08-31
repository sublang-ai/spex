// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const SIGNAL_EXIT_CODES = { SIGINT: 130, SIGTERM: 143 };

class StepFailure extends Error {
  constructor(step, result) {
    const outcome = result.error
      ? result.error.message
      : result.signal
        ? `terminated by ${result.signal}`
        : `exited ${result.code}`;
    super(`${step.label} ${outcome}`);
    this.exitCode = result.code || 1;
  }
}

function executeProcess(step, onChild, platform) {
  return new Promise((resolveResult) => {
    let child;
    try {
      child = spawn(step.command, step.args, {
        cwd: step.cwd,
        stdio: "inherit",
        detached: platform !== "win32",
      });
    } catch (error) {
      resolveResult({ code: null, signal: null, error });
      return;
    }

    onChild(child);
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      resolveResult(result);
    };
    child.once("error", (error) =>
      settle({ code: null, signal: null, error }),
    );
    child.once("exit", (code, signal) =>
      settle({ code, signal, error: undefined }),
    );
  });
}

function stopChild(child, signal, platform, killProcess) {
  if (!child || child.exitCode != null || child.signalCode != null) return;
  try {
    if (platform !== "win32" && child.pid) {
      killProcess(-child.pid, signal);
    } else {
      child.kill(signal);
    }
  } catch (error) {
    if (error?.code !== "ESRCH") return error;
  }
}

export async function runDesktop(options = {}) {
  const root = options.root ?? defaultRoot;
  const desktopDir = options.desktopDir ?? join(root, "apps", "desktop");
  const platform = options.platform ?? process.platform;
  const npm = options.npmCommand ?? (platform === "win32" ? "npm.cmd" : "npm");
  const electronBinary = options.electronBinary ?? require("electron");
  const execute =
    options.execute ??
    ((step, onChild) => executeProcess(step, onChild, platform));
  const signalSource = options.signalSource ?? process;
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const killProcess = options.killProcess ?? process.kill.bind(process);
  const launchArgs = options.launchArgs ?? [];

  const steps = {
    build: {
      id: "build",
      label: "workspace build",
      command: npm,
      args: ["run", "build"],
      cwd: root,
    },
    electronAbi: {
      id: "electron-abi",
      label: "Electron ABI rebuild",
      command: npm,
      args: ["run", "rebuild:electron", "-w", "apps/desktop"],
      cwd: root,
    },
    launch: {
      id: "launch",
      label: "Electron launch",
      command: electronBinary,
      args: [".", ...launchArgs],
      cwd: desktopDir,
    },
    nodeAbi: {
      id: "node-abi",
      label: "Node ABI restore",
      command: npm,
      args: ["run", "rebuild:node", "-w", "apps/desktop"],
      cwd: root,
    },
  };

  let activeChild;
  let failure;
  let restoreFailure;
  let restoreRequired = false;
  let restoring = false;
  let requestedSignal;
  let restoreSignalReported = false;

  const signalHandlers = new Map();
  for (const signal of Object.keys(SIGNAL_EXIT_CODES)) {
    const handler = () => {
      requestedSignal ??= signal;
      if (restoring) {
        if (!restoreSignalReported) {
          restoreSignalReported = true;
          stderr.write(
            `desktop: ${signal} received; waiting for the mandatory Node ABI restore\n`,
          );
        }
        return;
      }
      stderr.write(`desktop: ${signal} received; stopping the active stage\n`);
      const stopError = stopChild(activeChild, signal, platform, killProcess);
      if (stopError) {
        stderr.write(
          `desktop: could not signal the active stage: ${stopError.message}\n`,
        );
      }
    };
    signalHandlers.set(signal, handler);
    signalSource.on(signal, handler);
  }

  const runStep = async (step) => {
    stdout.write(`\n=== desktop: ${step.label} ===\n`);
    let result;
    try {
      result = await execute(step, (child) => {
        activeChild = child;
      });
    } finally {
      activeChild = undefined;
    }
    if (result.error || result.code !== 0) throw new StepFailure(step, result);
  };

  try {
    await runStep(steps.build);
    if (requestedSignal) throw new Error("source run interrupted");

    // npm rebuild can clean the Node build before the Electron build
    // succeeds, so restoration becomes mandatory before this step starts.
    restoreRequired = true;
    await runStep(steps.electronAbi);
    if (requestedSignal) throw new Error("source run interrupted");

    await runStep(steps.launch);
  } catch (error) {
    failure = error;
  } finally {
    if (restoreRequired) {
      restoring = true;
      try {
        await runStep(steps.nodeAbi);
      } catch (error) {
        restoreFailure = error;
      }
    }
    for (const [signal, handler] of signalHandlers) {
      signalSource.off(signal, handler);
    }
  }

  if (restoreFailure) {
    stderr.write(
      "WARNING: ABI restore failed — run `npm run rebuild:node -w apps/desktop` before using system-Node tooling\n",
    );
    stderr.write(`desktop: ${restoreFailure.message}\n`);
    return 1;
  }
  if (requestedSignal) return SIGNAL_EXIT_CODES[requestedSignal] ?? 1;
  if (failure) {
    stderr.write(`desktop: ${failure.message}\n`);
    return failure.exitCode ?? 1;
  }
  return 0;
}
