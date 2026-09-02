// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// DR-010 §2 coverage: status speaks human — known states map to
// plain phrases, unknown playbook-authored ids humanize, tones key
// off derived signals rather than open-ended state names.

import { describe, expect, test } from "vitest";

import { humanizeId, plainFailure, stateLabel } from "./labels.js";
import { timeSeparator, withoutTrailingUrl } from "../components/CaptainPane.js";

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
    expect(stateLabel("hub")).toEqual({ text: "idle", tone: "neutral" });
  });

  test("a live turn with no leaf state is deciding or working, never idle", () => {
    expect(stateLabel(undefined, { turnActive: true })).toEqual({
      text: "deciding",
      tone: "emerald",
    });
    expect(stateLabel("hub", { turnActive: true, playersRunning: true })).toEqual({
      text: "working",
      tone: "emerald",
    });
    expect(stateLabel("idle", { turnActive: true, playersRunning: false }).text).toBe(
      "deciding",
    );
    // A real leaf state keeps its own words.
    expect(stateLabel("coding", { turnActive: true, playersRunning: true }).text).toBe(
      "coding",
    );
  });
});

describe("plainFailure (run-view-2)", () => {
  test("a leading Error: and doubled periods go; unchanged words keep no raw", () => {
    expect(plainFailure("Error: the disk is full..")).toEqual({
      text: "the disk is full.",
      raw: "Error: the disk is full..",
    });
    expect(plainFailure("the disk is full")).toEqual({ text: "the disk is full" });
    expect(plainFailure("  ")).toEqual({ text: "failed", raw: "  " });
  });

  test("known runtime messages map to plain phrases with the raw text kept", () => {
    expect(plainFailure("Timed out waiting for OpenCode server readiness (30000ms)").text).toBe(
      "The call timed out",
    );
    expect(plainFailure("HTTP 429 rate limit exceeded").text).toContain("rate-limited");
    expect(plainFailure("Kimi ACP process exited on signal SIGKILL").text).toBe(
      "The agent process exited unexpectedly (SIGKILL)",
    );
    expect(
      plainFailure("CodexAdapter could not resolve '@openai/codex', the Codex CLI").text,
    ).toBe("@openai/codex is not installed");
    expect(plainFailure('Unknown adapter "gemini" at players.dev.coder').text).toBe(
      'No adapter named "gemini" — check the config',
    );
    expect(plainFailure("Unknown player: dev.tester").text).toBe(
      'No player named "dev.tester" — check the config',
    );
    expect(plainFailure("The Captain's turn failed: request timeout")).toEqual({
      text: "The Captain's turn failed — The call timed out",
      raw: "The Captain's turn failed: request timeout",
    });
  });
});

describe("withoutTrailingUrl (run-view-89)", () => {
  test("only a last line equal to the source URL leaves; the rest stays whole", () => {
    const url = "https://github.com/acme/app/issues/7";
    expect(withoutTrailingUrl(`Address #7: fix login\n${url}\n`, url)).toBe(
      "Address #7: fix login",
    );
    expect(withoutTrailingUrl(`See ${url} first`, url)).toBe(`See ${url} first`);
    expect(withoutTrailingUrl(url, url)).toBe(url);
    expect(withoutTrailingUrl(`fix\n${url}`, undefined)).toBe(`fix\n${url}`);
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
