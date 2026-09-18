// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// app-shell-30: the shell's own text speaks the home's language. The
// main process composes a notification exactly this way — resolve the
// home's stored choice against the operating system's preferred
// languages, activate, then map the record.

import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveLanguage } from "@sublang/spex-core/language";
import type { Language } from "@sublang/spex-core/language";
import type { RecordEnvelope } from "@sublang/spex-core";

import { speak } from "./i18n.js";
import { notificationFor } from "./notifications.js";

function finishedTurn(
  choice: Language | null,
  systemLanguages: readonly string[],
) {
  const envelope = {
    sessionId: "s1",
    seq: 1,
    hidden: false,
    record: { type: "turn_finished", turnId: 1 } as unknown,
  } as RecordEnvelope;
  return notificationFor(
    envelope,
    {},
    speak(resolveLanguage(choice, systemLanguages)),
  );
}

test("a finished turn reads Chinese where the home chose zh", () => {
  const notification = finishedTurn("zh", ["en-US"]);
  assert.equal(notification?.title, "本轮已完成");
  assert.equal(notification?.body, "Captain 已完成本轮。");
});

test("with no stored choice the shell follows the system's languages", () => {
  const chinese = finishedTurn(null, ["zh-Hans-CN", "en-US"]);
  assert.equal(chinese?.title, "本轮已完成");
  assert.equal(chinese?.body, "Captain 已完成本轮。");

  const english = finishedTurn(null, ["en-US"]);
  assert.equal(english?.title, "Turn finished");
  assert.equal(english?.body, "The Captain finished your turn.");
});
