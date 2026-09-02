// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// One vocabulary for time (DR-010 §2): ages say "ago", spans say how
// long, and nothing prints milliseconds.

import { describe, expect, test } from "vitest";

import { compactAge, duration, relativeAge } from "./time.js";

describe("duration", () => {
  test("a span under a second reads as under a second, never as 0s or ms", () => {
    expect(duration(0)).toBe("<1s");
    expect(duration(12)).toBe("<1s");
    expect(duration(999)).toBe("<1s");
  });

  test("seconds, then minutes with seconds, then hours with minutes", () => {
    expect(duration(1_000)).toBe("1s");
    expect(duration(12_400)).toBe("12s");
    expect(duration(60_000)).toBe("1m");
    expect(duration(133_000)).toBe("2m 13s");
    expect(duration(2 * 3_600_000 + 5 * 60_000)).toBe("2h 5m");
    expect(duration(3 * 3_600_000)).toBe("3h");
  });
});

describe("ages", () => {
  test("an age says ago and the compact form drops it", () => {
    const now = 1_700_000_000_000;
    expect(relativeAge(now - 30_000, now)).toBe("just now");
    expect(relativeAge(now - 3 * 60_000, now)).toBe("3m ago");
    expect(compactAge(now - 3 * 60_000, now)).toBe("3m");
    expect(compactAge(now, now)).toBe("now");
  });
});
