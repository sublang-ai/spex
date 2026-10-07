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

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createSessionStore } from "@sublang/playbook/session-store";
import { executionConfigFromPlan, loadLaunchPlan, openSessionHost } from "@sublang/playbook/session-host";
import { parkingScript } from "./demo.js";
import { fakeAdapterImports, type FakeScript } from "./fake-adapter.js";
import { builtinLaunchModules } from "./launch-modules.js";

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
// Spex's config names no module (DR-105): each playbook's is supplied
// at launch — the one a continued session was launched on, else the
// built-in spec package's.
const stored = continued
  ? (JSON.parse(readFileSync(join(sessionsDir, `${continued}.json`), "utf8")) as { structuralProjection?: { catalog?: Record<string, { from?: string }> } }).structuralProjection?.catalog ?? {}
  : {};
const enabled = builtinLaunchModules(configPath);
const modules = { ...enabled,
  ...Object.fromEntries(Object.entries(stored).flatMap(([id, entry]) => (entry.from && id in enabled ? [[id, entry.from]] : []))) };
const config = executionConfigFromPlan(await loadLaunchPlan({ userConfigPath: configPath, modules }));
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
