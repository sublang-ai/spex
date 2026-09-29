// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A CLI writer that dies mid-turn (core-service-84, DR-088). Run as a
// child process: it opens a shared session through Playbook's own host
// and starts a turn with a call held in flight, printing
// `READY <sessionId>` once that call is under way. The suite then kills
// the process, so the session is left exactly as a crash leaves it:
// uncertain, which no in-process stop can produce because Playbook
// settles every stop it sees.
//
// With no session id, it starts a new session whose parking script
// holds the coder's call once that call has made its commit — the
// step's start already saved. With one, it continues that session and
// holds the Captain's decision call instead, so the lost message
// records no step.
//
//   node dist/testing/stopped-writer.js <sessionsDir> <cwd> <configPath> <input> [sessionId]

import { createSessionStore } from "@sublang/playbook/session-store";
import { executionConfigFromPlan, loadLaunchPlan, openSessionHost } from "@sublang/playbook/session-host";
import { parkingScript } from "./demo.js";
import { fakeAdapterImports, type FakeScript } from "./fake-adapter.js";

const [sessionsDir, cwd, configPath, input, continued] = process.argv.slice(2);
if (!sessionsDir || !cwd || !configPath || !input) {
  throw new Error("usage: stopped-writer <sessionsDir> <cwd> <configPath> <input> [sessionId]");
}

let host: Awaited<ReturnType<typeof openSessionHost>> | undefined;
const ready = (): void => { process.stdout.write(`READY ${host?.sessionId ?? continued}\n`); };
const script = parkingScript({ held: true });
const held: FakeScript = continued
  ? {
      // The Captain's decision never answers: the message is lost
      // before any step of it is saved.
      rules: [{ match: /"action"/, response: { result: "", untilAborted: true } }],
      fallback: script.fallback,
    }
  : {
      ...script,
      rules: script.rules?.map((rule) => rule.response.effect
        ? {
            ...rule,
            response: {
              ...rule.response,
              effect: (dir: string) => {
                rule.response.effect?.(dir);
                ready();
              },
            },
          }
        : rule),
    };
const config = executionConfigFromPlan(await loadLaunchPlan({ userConfigPath: configPath }));
host = await openSessionHost({
  store: createSessionStore({ sessionsDir }),
  mode: continued ? "continue" : "new",
  ...(continued ? { sessionId: continued } : {}),
  cwd,
  config,
  adapterImports: fakeAdapterImports(held).imports,
  ...(continued
    ? {
        onStoredRecord: (entry: { record: { type?: unknown; topic?: unknown; payload?: { type?: unknown } } }) => {
          const record = entry.record;
          if (record.type === "captain_telemetry" && record.topic === "playbook.trace" &&
              record.payload?.type === "captain.call.started") ready();
        },
      }
    : {}),
});
// The turn never ends: the process is killed while the call is held.
void host.handleBossTurn(input).catch(() => {});
setInterval(() => {}, 1 << 30);
