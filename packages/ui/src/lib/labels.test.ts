// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// DR-010 §2 coverage: status speaks human — known states map to
// plain phrases, unknown playbook-authored ids humanize, tones key
// off derived signals rather than open-ended state names.

import { describe, expect, test } from "vitest";

import { humanizeId, stateLabel } from "./labels.js";
import { timeSeparator } from "../components/CaptainPane.js";

describe("stateLabel", () => {
  test("a pending question always reads as waiting, amber", () => {
    expect(stateLabel("anyCustomState", { pendingQuestion: true })).toEqual({
      text: "waiting for your reply",
      tone: "amber",
    });
    expect(stateLabel("awaitBossReply")).toEqual({
      text: "waiting for your reply",
      tone: "amber",
    });
  });

  test("failed reads as needs attention, red", () => {
    expect(stateLabel("failed")).toEqual({
      text: "needs attention",
      tone: "red",
    });
  });

  test("unknown playbook-authored ids humanize with the raw id kept aside", () => {
    expect(stateLabel("collectUserStories").text).toBe(
      "collect user stories",
    );
    expect(stateLabel("fix_ci-loop").text).toBe("fix ci loop");
  });

  test("an active turn tints emerald; no state reads idle", () => {
    expect(stateLabel("coding", { turnActive: true }).tone).toBe("emerald");
    expect(stateLabel(undefined)).toEqual({ text: "idle", tone: "neutral" });
    expect(stateLabel(undefined, { turnActive: true }).text).toBe(
      "players working",
    );
  });
});

describe("humanizeId", () => {
  test("camelCase, snake_case, and kebab-case all read as words", () => {
    expect(humanizeId("awaitBossReply")).toBe("await boss reply");
    expect(humanizeId("player_finished")).toBe("player finished");
    expect(humanizeId("re-review")).toBe("re review");
  });
});

describe("timeSeparator (RUN-41)", () => {
  const base = new Date("2026-07-10T14:00:00").getTime();

  test("the first line always gets a separator", () => {
    expect(timeSeparator(undefined, base)).toBeTruthy();
  });

  test("small gaps stay quiet; >10 minute gaps separate", () => {
    expect(timeSeparator(base, base + 5 * 60 * 1000)).toBeUndefined();
    expect(timeSeparator(base, base + 11 * 60 * 1000)).toBeTruthy();
  });

  test("day boundaries always separate and carry the date", () => {
    const nextDay = new Date("2026-07-11T00:02:00").getTime();
    const separator = timeSeparator(base, nextDay);
    expect(separator).toBeTruthy();
  });
});
