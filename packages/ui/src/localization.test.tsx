// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// localization-9: the interface rendered in the reader's language.
// The app is driven whole — the rail's labels come from the catalog,
// the document says which language it speaks, the time vocabulary
// reads as messages and a moment formats for the resolved language —
// and a change of choice re-renders the root in the new language.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";

afterEach(cleanup);

const { commandMock } = vi.hoisted(() => ({ commandMock: vi.fn() }));

vi.mock("./state/store.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./state/store.js")>();
  return { ...actual, getClient: () => ({ command: commandMock }) };
});

import { Root } from "./Root.js";
import {
  deliverServerMessageForTests,
  setClientForTests,
  useAppStore,
} from "./state/store.js";
import { activateLanguage, currentLocale } from "./i18n.js";
import {
  clockTime,
  compactAge,
  duration,
  preciseAge,
  relativeAge,
} from "./lib/time.js";
import type { Language } from "@sublang/spex-core/language";

// jsdom has no layout, so the strip's keep-in-view call needs a stub.
Element.prototype.scrollIntoView = vi.fn();

const NOW = Date.UTC(2026, 8, 18, 22, 22, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function seed(): void {
  useAppStore.setState({
    connection: "open",
    everConnected: true,
    projects: [
      { id: "p1", name: "alpha", path: "/tmp/alpha", registeredAt: 0 },
    ] as never,
    projectMeta: {},
    sessions: [],
    views: {},
    composers: {},
    runErrors: {},
    currentProjectId: "p1",
    workspaceTabs: {},
    openTabs: {},
    expandedProjects: {},
    railCollapsed: false,
    specTrees: {},
    specErrors: {},
    readiness: [],
    machineGraphs: {},
    stagedIntents: {},
    history: {},
    configState: {
      status: "valid",
      summary: { playbooks: [], captain: undefined },
    } as never,
  });
}

function speak(language: Language, choice: Language | null = language): void {
  useAppStore.setState({ language: { choice, resolved: language } });
  activateLanguage(language);
}

/** The rail's own surface entries, by their accessible names. */
function railLabels(): string[] {
  return within(screen.getByTestId("sidebar"))
    .getAllByRole("button")
    .map((button) => button.getAttribute("aria-label") ?? button.textContent)
    .filter((label): label is string => !!label);
}

beforeEach(() => {
  commandMock.mockReset();
  commandMock.mockResolvedValue({});
  // Store actions resolve the module-local client, which the module
  // mock cannot reach.
  setClientForTests({ command: commandMock } as never);
  seed();
});

afterEach(() => {
  setClientForTests(undefined);
  speak("en", null);
});

describe("localization-4: the rail reads the resolved language", () => {
  test("with zh resolved every surface entry reads its Chinese label", () => {
    speak("zh");
    render(<Root />);
    const labels = railLabels();
    for (const label of ["仪表盘", "项目", "剧本", "空间", "设置"]) {
      expect(labels).toContain(label);
    }
    for (const label of ["Dashboard", "Playbooks", "Space", "Settings"]) {
      expect(labels).not.toContain(label);
    }
  });

  test("with en resolved the same entries read their English labels", () => {
    speak("en", null);
    render(<Root />);
    const labels = railLabels();
    for (const label of ["Dashboard", "Projects", "Playbooks", "Space", "Settings"]) {
      expect(labels).toContain(label);
    }
  });
});

describe("localization-3: the document says its language", () => {
  test("activating a language sets the document's language attribute", () => {
    speak("zh");
    expect(document.documentElement.lang).toBe("zh");
    speak("en", null);
    expect(document.documentElement.lang).toBe("en");
  });
});

describe("localization-5: ages, durations and moments follow the language", () => {
  test("the time vocabulary reads as Chinese messages", () => {
    speak("zh");
    expect(relativeAge(NOW - 30_000, NOW)).toBe("刚刚");
    expect(relativeAge(NOW - 3 * MINUTE, NOW)).toBe("3 分钟前");
    expect(relativeAge(NOW - 2 * HOUR, NOW)).toBe("2 小时前");
    expect(relativeAge(NOW - 3 * DAY, NOW)).toBe("3 天前");
    expect(relativeAge(NOW - 21 * DAY, NOW)).toBe("3 周前");
    // The compact form drops 前, as the English drops "ago".
    expect(compactAge(NOW - 30_000, NOW)).toBe("刚刚");
    expect(compactAge(NOW - 3 * MINUTE, NOW)).toBe("3 分钟");
    expect(duration(500)).toBe("<1 秒");
    expect(duration(12_000)).toBe("12 秒");
    expect(duration(3 * MINUTE + 12_000)).toBe("3 分 12 秒");
    expect(duration(2 * HOUR + 5 * MINUTE)).toBe("2 小时 5 分");
    expect(preciseAge(NOW - 12_000, NOW)).toBe("12 秒前");
  });

  test("the English vocabulary is unchanged", () => {
    speak("en", null);
    expect(relativeAge(NOW - 30_000, NOW)).toBe("just now");
    expect(relativeAge(NOW - 3 * MINUTE, NOW)).toBe("3m ago");
    expect(compactAge(NOW - 30_000, NOW)).toBe("now");
    expect(compactAge(NOW - 3 * MINUTE, NOW)).toBe("3m");
    expect(duration(500)).toBe("<1s");
    expect(duration(3 * MINUTE + 12_000)).toBe("3m 12s");
    expect(duration(2 * HOUR + 5 * MINUTE)).toBe("2h 5m");
    expect(preciseAge(NOW - 12_000, NOW)).toBe("12s ago");
  });

  test("a clock time formats for the resolved language, not the browser's", () => {
    const stamp = { hour: "numeric", minute: "2-digit" } as const;
    speak("zh");
    expect(currentLocale()).toBe("zh");
    expect(clockTime(NOW)).toBe(new Date(NOW).toLocaleTimeString("zh", stamp));
    expect(clockTime(NOW)).not.toBe(
      new Date(NOW).toLocaleTimeString("en", stamp),
    );
    speak("en", null);
    expect(clockTime(NOW)).toBe(new Date(NOW).toLocaleTimeString("en", stamp));
  });
});

describe("localization-3: a change of choice re-renders the whole root", () => {
  test("setting the language through the store repaints the rail in it", async () => {
    speak("en", null);
    commandMock.mockResolvedValue({ language: "zh" });
    render(<Root />);
    expect(railLabels()).toContain("Dashboard");
    await act(async () => {
      await useAppStore.getState().setLanguage("zh");
    });
    expect(commandMock).toHaveBeenCalledWith("language.set", { language: "zh" });
    expect(railLabels()).toContain("仪表盘");
    expect(document.documentElement.lang).toBe("zh");
    // The broadcast that follows the write says the same thing; the
    // page that sent it applies both and nothing moves twice.
    act(() => {
      deliverServerMessageForTests({ type: "language.state", language: "zh" });
    });
    expect(railLabels()).toContain("仪表盘");
    // Another page choosing System returns this one to English.
    act(() => {
      deliverServerMessageForTests({ type: "language.state", language: null });
    });
    expect(railLabels()).toContain("Dashboard");
    expect(useAppStore.getState().language.choice).toBeNull();
  });
});

describe("localization-2: with no stored choice the client's own languages decide", () => {
  const CASES: [readonly string[], Language][] = [
    [["zh-CN"], "zh"],
    [["zh-Hans-SG"], "zh"],
    [["fr", "zh-CN"], "zh"],
    [["zh-TW"], "en"],
    [["fr"], "en"],
    [["en-GB", "zh-CN"], "en"],
  ];

  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.lang = "en";
  });

  for (const [languages, expected] of CASES) {
    test(`${JSON.stringify(languages)} resolves to ${expected}`, async () => {
      vi.stubGlobal("navigator", { languages });
      // The page settles its language as it loads, before the first
      // render: a fresh copy of the store module replays that moment
      // under this client's languages.
      vi.resetModules();
      const fresh = await vi.importActual<typeof import("./state/store.js")>(
        "./state/store.js",
      );
      expect(fresh.useAppStore.getState().language).toEqual({
        choice: null,
        resolved: expected,
      });
      expect(document.documentElement.lang).toBe(expected);
    });
  }
});
