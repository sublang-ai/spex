#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The local simulation's seat entry (scripts/team-server-local.mjs),
// started by the fake helper where the seat unit starts
// apps/server/dist/main.js: the server shell in seat mode
// (server-shell-25), parsed, started, announced and stopped on a signal
// exactly as main.js does it, with its agents chosen by --agents:
//
//   captain  (default) the real Captain over substitute adapters that
//            answer every call with a respond decision, on the config
//            Playbook seeds for the shared credentials
//   demo     the demo's scripted Captain and players (the CODE machine
//            with a nested review), on the demo config, written to
//            $HOME/demo.config.yaml unless --config names one
//   real     apps/server/dist/main.js itself: real agents, which need
//            real credentials in the shared credential file
//
// The substitutes come from the core's test seams
// (ServerShellOptions.core), which no command line reaches; model
// discovery is the browser journeys' fixture, so no installed agent is
// started.

import { existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SERVER_MAIN = join(ROOT, "apps/server/dist/main.js");
const SERVER = join(ROOT, "apps/server/dist/server.js");
const CORE_TESTING = join(ROOT, "packages/core/dist/testing/index.js");
const MODES = ["captain", "demo", "real"];

/** The browser journeys' model discovery (e2e/src/harness.ts): Claude
 * and Codex each report a short model list, so no installed agent runs
 * to answer it. */
function fixtureModelDiscovery(adapter) {
  return {
    status: "available",
    ...(adapter === "claude" ? { unreportedEffortValues: ["ultracode"], defaultModel: "opus" } : {}),
    models:
      adapter === "claude"
        ? [
            {
              id: "opus",
              name: "Opus",
              resolvedModel: "claude-opus-5-5",
              description: "Opus 5.5 · Best for everyday, complex tasks",
              effortValues: ["low", "high", "max"],
              fastModeSupported: true,
            },
            { id: "claude-fable-5-1", name: "Claude Fable 5.1", effortValues: ["high", "max"], fastModeSupported: false },
          ]
        : adapter === "codex"
          ? [
              {
                id: "gpt-6-astra",
                name: "GPT-6 Astra",
                description: "Workhorse model for coding and everyday work.",
                effortValues: ["high", "max"],
                fastModeSupported: true,
              },
            ]
          : [],
  };
}

let agents = "captain";
const args = [];
for (const arg of process.argv.slice(2)) {
  const match = /^--agents=(.*)$/.exec(arg);
  if (match) agents = match[1];
  else args.push(arg);
}
if (!MODES.includes(agents)) {
  console.error(`seat: --agents must be one of ${MODES.join(", ")}; got ${JSON.stringify(agents)}`);
  process.exit(64);
}

if (agents === "real") {
  // The seat unit's own command, run in this process.
  process.argv = [process.argv[0], SERVER_MAIN, ...args];
  await import(pathToFileURL(SERVER_MAIN).href);
} else {
  const server = await import(pathToFileURL(SERVER).href);
  try {
    const testing = await import(pathToFileURL(CORE_TESTING).href);
    if (agents === "demo" && !args.some((arg) => arg === "--config" || arg.startsWith("--config="))) {
      const config = join(process.env.HOME ?? process.cwd(), "demo.config.yaml");
      if (!existsSync(config)) writeFileSync(config, testing.DEMO_CONFIG, { mode: 0o600 });
      args.push(`--config=${config}`);
    }
    const options = server.parseArgs(args, process.env);
    if (!options.seat) throw new Error("seat.mjs starts a seat alone: pass --seat and its flags");
    options.core = {
      adapterImports:
        agents === "demo"
          ? testing.demoAdapterImports().imports
          : testing.fakeAdapterImports({
              fallback: {
                result: JSON.stringify({
                  action: "respond",
                  text: "Acknowledged by the Captain on the local team server's seat.",
                }),
              },
            }).imports,
      adapterRuntime: () => ({ usable: true }),
      discoverAgentModels: async (adapter) => fixtureModelDiscovery(adapter),
      ...(agents === "demo"
        ? { captainFactory: async (_composed, sessionId) => testing.demoCaptain(sessionId) }
        : {}),
    };
    const running = await server.startSeat(options);
    console.log(
      `[spex-server] seat of person ${options.seat.personId} on ${options.seat.serverName} listening at ${running.socket} (agents: ${agents})`,
    );
    console.log(`[spex-server] config: ${JSON.stringify(running.service.configStateSnapshot().status)}`);
    server.exitOnSignals(running);
  } catch (error) {
    console.error(server.describeError(error));
    process.exit(1);
  }
}
