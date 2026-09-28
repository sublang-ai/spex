// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A CLI writer that dies mid-step (core-service-84, DR-088). Run as a
// child process: it opens a shared session through Playbook's own host,
// starts the parking script's turn with the coder's call held in flight,
// and prints `READY <sessionId>` once that call has made its commit —
// the step's start already saved. The suite then kills the process, so
// the session is left exactly as a crash leaves it: uncertain, with
// recorded work and a saved position, which no in-process stop can
// produce because Playbook settles every stop it sees.
//
//   node dist/testing/stopped-writer.js <sessionsDir> <cwd> <configPath> <input>

import { createSessionStore } from "@sublang/playbook/session-store";
import { executionConfigFromPlan, loadLaunchPlan, openSessionHost } from "@sublang/playbook/session-host";
import { parkingScript } from "./demo.js";
import { fakeAdapterImports, type FakeScript } from "./fake-adapter.js";

const [sessionsDir, cwd, configPath, input] = process.argv.slice(2);
if (!sessionsDir || !cwd || !configPath || !input) {
  throw new Error("usage: stopped-writer <sessionsDir> <cwd> <configPath> <input>");
}

let host: Awaited<ReturnType<typeof openSessionHost>> | undefined;
const script = parkingScript({ held: true });
const held: FakeScript = {
  ...script,
  rules: script.rules?.map((rule) => rule.response.effect
    ? {
        ...rule,
        response: {
          ...rule.response,
          effect: (dir: string) => {
            rule.response.effect?.(dir);
            process.stdout.write(`READY ${host?.sessionId}\n`);
          },
        },
      }
    : rule),
};
const config = executionConfigFromPlan(await loadLaunchPlan({ userConfigPath: configPath }));
host = await openSessionHost({
  store: createSessionStore({ sessionsDir }),
  mode: "new",
  cwd,
  config,
  adapterImports: fakeAdapterImports(held).imports,
});
// The turn never ends: the process is killed while the call is held.
void host.handleBossTurn(input).catch(() => {});
setInterval(() => {}, 1 << 30);
