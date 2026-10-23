// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The server shell as a real child process whose core runs a stubborn
// agent, with the stop's bounds shortened through the harness-only
// core overrides (SERVER-SHELL-12, SERVER-SHELL-20): the overrides
// have no command-line form, so this launcher starts the shell from
// code and hands it the shell's own signal handling.
//
//   node stubborn-server.mjs <dir> <settleMs> <killMs>
//
// <dir> holds playbook.config.yaml, state/, home/ and signals.log. A
// turn's Captain starts stubborn-agent.cjs, prints
// `AGENT <agentPid> <childPid>`, and then waits on it the way a wedged
// adapter does: no abort reaches it, so only the stop's bounds end it.

import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createScriptedCaptain, fakeAdapterImports } from "@sublang/spex-core/testing";

const { exitOnSignals, parseArgs, startServer } = await import(
  new URL("../../dist/server.js", import.meta.url).href
);

const [dir, settleMs, killMs] = process.argv.slice(2);
const agentScript = fileURLToPath(new URL("./stubborn-agent.cjs", import.meta.url));
const log = join(dir, "signals.log");

const captain = createScriptedCaptain(async () => {
  const agent = spawn(process.execPath, [agentScript, log, "agent"], {
    stdio: ["ignore", "pipe", "ignore"],
  });
  const child = await new Promise((resolve, reject) => {
    agent.stdout.once("data", (data) => resolve(Number(String(data).trim())));
    agent.once("error", reject);
  });
  process.stdout.write(`AGENT ${agent.pid} ${child}\n`);
  await new Promise(() => {});
});

const running = await startServer({
  ...parseArgs(
    [
      "--port=0",
      "--token=t12",
      `--config=${join(dir, "playbook.config.yaml")}`,
      `--data-dir=${join(dir, "state")}`,
    ],
    {},
  ),
  legacyDb: join(dir, "no-legacy.db"),
  core: {
    adapterImports: fakeAdapterImports({ rules: [], fallback: { result: "ok" } }).imports,
    adapterRuntime: () => ({ usable: true }),
    captainFactory: async () => captain,
    env: {},
    home: join(dir, "home"),
    watchConfig: false,
    stop: { settleMs: Number(settleMs), killMs: Number(killMs) },
  },
});
console.log(`[spex-server] serving at ${running.url}`);
exitOnSignals(running);
