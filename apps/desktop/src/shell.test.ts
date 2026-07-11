// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { mergeEnv, parseEnvOutput } from "./shell-env.js";
import { AttentionTracker, notificationFor } from "./notifications.js";
import type { RecordEnvelope } from "@sublang/spex-core";

function envelope(record: Record<string, unknown>, hidden = false): RecordEnvelope {
  return {
    sessionId: "s1",
    seq: 1,
    hidden,
    record: record as unknown as RecordEnvelope["record"],
  };
}

test("parseEnvOutput reads keys after the marker and multi-line values", () => {
  const parsed = parseEnvOutput(
    "zsh: noise before\n__SPEX_ENV_START__\nANTHROPIC_API_KEY=sk-test\nMULTI=line one\nline two\nPATH=/usr/bin\n",
  );
  assert.equal(parsed.ANTHROPIC_API_KEY, "sk-test");
  assert.equal(parsed.MULTI, "line one\nline two");
  assert.equal(parsed.PATH, "/usr/bin");
  assert.equal(parsed["zsh: noise before"], undefined);
});

test("mergeEnv never clobbers existing values", () => {
  const target: NodeJS.ProcessEnv = { PATH: "/original" };
  mergeEnv(target, { PATH: "/captured", NEW_KEY: "v" });
  assert.equal(target.PATH, "/original");
  assert.equal(target.NEW_KEY, "v");
});

test("notificationFor honors sink preferences and hidden records", () => {
  assert.equal(
    notificationFor(envelope({ type: "turn_finished", turnId: 1 }), {
      turn_finished: "off",
    }),
    null,
  );
  const shown = notificationFor(envelope({ type: "turn_finished", turnId: 1 }), {});
  assert.equal(shown?.event, "turn_finished");
  assert.equal(shown?.sink, "desktop");
  const belled = notificationFor(envelope({ type: "turn_finished", turnId: 1 }), {
    turn_finished: "bell",
  });
  assert.equal(belled?.sink, "bell");
  assert.equal(
    notificationFor(envelope({ type: "turn_finished", turnId: 1 }, true), {}),
    null,
  );
});

test("notificationFor maps player_finished behind its off-by-default pref", () => {
  const record = {
    type: "player_finished",
    playerId: "coder",
    result: { status: "succeeded" },
  };
  assert.equal(notificationFor(envelope(record), {}), null);
  const shown = notificationFor(envelope(record), {
    player_finished: "desktop",
  });
  assert.equal(shown?.event, "player_finished");
  assert.equal(shown?.sink, "desktop");
  assert.equal(shown?.title, "Player finished");
  assert.equal(shown?.body, "coder succeeded");
  const belled = notificationFor(envelope(record), { player_finished: "bell" });
  assert.equal(belled?.sink, "bell");
});

test("notificationFor surfaces boss questions with the question text", () => {
  const notification = notificationFor(
    envelope({
      type: "captain_telemetry",
      topic: "playbook.fsm.state",
      payload: { to: "awaitBossReply", pendingBossQuestion: "Which flow?" },
    }),
    {},
  );
  assert.equal(notification?.event, "boss_question");
  assert.equal(notification?.sink, "desktop");
  assert.equal(notification?.body, "Which flow?");
});

test("boss questions and failures are always desktop notifications", () => {
  const failure = notificationFor(
    envelope({ type: "runtime_error", message: "boom" }),
    { turn_finished: "off", turn_aborted: "off", player_finished: "off" },
  );
  assert.equal(failure?.event, "failure");
  assert.equal(failure?.sink, "desktop");
});

test("attention tracker counts parked sessions and clears on end", () => {
  const tracker = new AttentionTracker();
  assert.equal(
    tracker.apply(
      envelope({
        type: "captain_telemetry",
        topic: "playbook.fsm.state",
        payload: { to: "awaitBossReply" },
      }),
    ),
    1,
  );
  assert.equal(
    tracker.apply(
      envelope({
        type: "captain_telemetry",
        topic: "playbook.fsm.state",
        payload: { to: "review" },
      }),
    ),
    0,
  );
  tracker.apply(
    envelope({
      type: "captain_telemetry",
      topic: "playbook.fsm.state",
      payload: { to: "awaitBossReply" },
    }),
  );
  assert.equal(tracker.clear("s1"), 0);
});

test("attention tracker flags failures until the next turn starts", () => {
  const tracker = new AttentionTracker();
  assert.equal(tracker.apply(envelope({ type: "runtime_error", message: "boom" })), 1);
  assert.equal(tracker.apply(envelope({ type: "turn_started", turnId: 2 })), 0);
  assert.equal(
    tracker.apply(
      envelope({
        type: "captain_telemetry",
        topic: "playbook.fsm.state",
        payload: { to: "failed" },
      }),
    ),
    1,
  );
  // A failed session also awaiting a reply still counts once.
  assert.equal(
    tracker.apply(
      envelope({
        type: "captain_telemetry",
        topic: "playbook.fsm.state",
        payload: { to: "awaitBossReply" },
      }),
    ),
    1,
  );
  assert.equal(tracker.clear("s1"), 0);
});

test("main process installs external-navigation guards", () => {
  const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  assert.match(source, /setWindowOpenHandler/);
  assert.match(source, /will-navigate/);
});
