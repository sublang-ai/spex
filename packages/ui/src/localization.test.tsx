// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// localization-9: the interface rendered in the reader's language.
// The app is driven whole — the rail's labels come from the catalog,
// the Dashboard and the Settings surface read theirs, the document
// says which language it speaks, the time vocabulary reads as
// messages and a moment formats for the resolved language — and a
// change of choice re-renders the root in the new language.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";

afterEach(cleanup);

const { commandMock } = vi.hoisted(() => ({ commandMock: vi.fn() }));

vi.mock("./state/store.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./state/store.js")>();
  return { ...actual, getClient: () => ({ command: commandMock }) };
});

import { Root } from "./Root.js";
import {
  SURFACE_KEY,
  deliverServerMessageForTests,
  safeStorageRemove,
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

/** Nothing owed: the fold every surface but the Dashboard's own tests
 * read, so no attention count ever joins a rail label. */
const EMPTY_LEDGER = { intents: [], attention: [], badge: 0 };

/** One finished intent owing a verdict, so the Dashboard's queue draws
 * a row whose stats carry counts. Both counts are one: English would
 * take its singular form, Chinese has only the one form. */
const LEDGER = {
  intents: [],
  attention: [
    {
      band: "finished",
      kind: "finish",
      intentId: "i1",
      title: "Ship docs",
      projectId: "p1",
      sessionId: "s1",
      turnId: 9,
      since: Date.now() - 30 * MINUTE,
      stats: { reviewRounds: 1, turns: 1, elapsedMs: 12 * MINUTE },
    },
  ],
  badge: 1,
};

/** A whole valid config, so the Settings surface draws every section. */
const CONFIG = {
  status: "valid",
  seeded: false,
  summary: {
    path: "/tmp/playbook.config.yaml",
    captain: {
      adapter: "claude",
      model: "claude-opus-5",
      effort: "high",
      permissions: { mode: "auto" },
    },
    players: [],
    playbooks: [],
  },
};

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
    ledger: undefined,
    ledgerError: undefined,
    foldedSources: {},
    dashboardGroupsCollapsed: {},
    configState: CONFIG,
  } as never);
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

/** Serve this fold to every read of it, from the first. */
function serveLedger(ledger: unknown): void {
  commandMock.mockImplementation(async (type: string) => {
    if (type === "ledger.get") return ledger;
    if (type === "ledger.history") return { intents: [], more: false };
    return {};
  });
}

/** Stand on a surface through the rail, which names each entry by
 * which surface it is, never by what it says (localization-4). */
async function goTo(surface: "Dashboard" | "Settings"): Promise<void> {
  const entry = screen
    .getByTestId("sidebar")
    .querySelector<HTMLButtonElement>(`[data-surface="${surface}"]`);
  if (!entry) throw new Error(`the rail has no ${surface} entry`);
  await act(async () => {
    fireEvent.click(entry);
  });
}

beforeEach(() => {
  commandMock.mockReset();
  serveLedger(EMPTY_LEDGER);
  // Store actions resolve the module-local client, which the module
  // mock cannot reach.
  setClientForTests({ command: commandMock } as never);
  seed();
});

afterEach(() => {
  setClientForTests(undefined);
  // The rail remembers the surface it was left on; no later test
  // inherits one it did not ask for.
  safeStorageRemove(SURFACE_KEY);
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

describe("localization-4: the Dashboard reads the resolved language", () => {
  test("with zh resolved its bands, its filter and a counted phrase read Chinese", async () => {
    speak("zh");
    serveLedger(LEDGER);
    render(<Root />);
    await goTo("Dashboard");
    const dashboard = screen.getByTestId("dashboard-scroll");
    // Needs attention · Running · Projects — the three bands, whole.
    expect(
      within(dashboard)
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(["需要关注", "运行中", "项目"]);
    const text = dashboard.textContent ?? "";
    for (const phrase of [
      "所有项目", // All projects — the filter's first option
      "已完成 — 确认？", // finished — confirm?
      "没有正在运行的工作。", // Nothing running.
    ]) {
      expect(text).toContain(phrase);
    }
    // A count takes the language's own plural form (localization-4):
    // Chinese has the one, where English would read "1 review round ·
    // 1 turn", and the duration beside them is a message too.
    expect(text).toContain("1 轮审阅 · 1 个轮次 · 12 分");
    for (const english of [
      "Needs attention",
      "All projects",
      "finished — confirm?",
      "Nothing running.",
      "1 review round",
      "1 turn",
    ]) {
      expect(text).not.toContain(english);
    }
  });

  test("with en resolved the same bands read their English labels", async () => {
    speak("en", null);
    serveLedger(LEDGER);
    render(<Root />);
    await goTo("Dashboard");
    const dashboard = screen.getByTestId("dashboard-scroll");
    expect(
      within(dashboard)
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(["Needs attention", "Running", "Projects"]);
    const text = dashboard.textContent ?? "";
    for (const phrase of [
      "All projects",
      "finished — confirm?",
      "Nothing running.",
      "1 review round · 1 turn · 12m",
    ]) {
      expect(text).toContain(phrase);
    }
  });
});

describe("localization-4: the Settings surface reads the resolved language", () => {
  test("with zh resolved every section and the language control read Chinese", async () => {
    speak("zh");
    render(<Root />);
    await goTo("Settings");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("设置");

    // Each section by what it is, never by what it says: the heading
    // and the words inside it are the catalog's.
    const sections: [string, string[]][] = [
      // The Captain's row keeps the config's own key and the name
      // Playbook gives the agent; only the acts around it translate.
      ["captain-section", ["Captain", "编辑 Captain"]],
      [
        "players-section",
        [
          "会话 Player", // Session players
          "还没有 Player — 在库中启用剧本会自动添加其角色所需的 Player。",
          "添加 Player", // Add a player
        ],
      ],
      [
        "agents-section",
        [
          "智能体", // Agents
          "重新检查就绪状态", // Re-check readiness
          "尚未使用任何适配器 — 为 Captain 或某个剧本角色指定智能体后，其就绪状态会显示在这里。",
        ],
      ],
      [
        "notifications-section",
        [
          "通知", // Notifications
          "轮次完成", // A turn finishes
          "关闭", // off
          "响铃", // bell
          "桌面通知", // desktop
        ],
      ],
      [
        "language-section",
        [
          "语言", // Language
          "跟随系统：设备的语言", // System follows your device
        ],
      ],
      [
        "shortcuts-section",
        [
          "键盘快捷键", // Keyboard shortcuts
          "按键", // Keys
          "功能", // Does
        ],
      ],
      ["theme-section", ["终端窗格主题（仅 CLI）"]],
    ];
    let whole = "";
    for (const [testId, phrases] of sections) {
      const section = screen.getByTestId(testId);
      const labels = Array.from(section.querySelectorAll("[aria-label]"))
        .map((node) => node.getAttribute("aria-label"))
        .join(" ");
      const text = `${section.textContent ?? ""} ${labels}`;
      for (const phrase of phrases) {
        expect(text, `${testId} reads ${phrase}`).toContain(phrase);
      }
      whole += ` ${text}`;
    }

    // A language stands in its own words; System is a text like any
    // other (settings-37).
    const language = within(screen.getByTestId("language-section"));
    const select = language.getByLabelText<HTMLSelectElement>("界面语言");
    expect(
      Array.from(select.options).map((option) => option.textContent),
    ).toEqual(["跟随系统", "English", "简体中文"]);
    expect(select.value).toBe("zh");

    for (const english of [
      "Session players",
      "Agents",
      "Notifications",
      "Language",
      "Keyboard shortcuts",
      "Add a player",
      "Re-check readiness",
    ]) {
      expect(whole).not.toContain(english);
    }
  });

  test("with en resolved the same sections read their English labels", async () => {
    speak("en", null);
    render(<Root />);
    await goTo("Settings");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Settings",
    );
    for (const [testId, phrase] of [
      ["players-section", "Session players"],
      ["agents-section", "Re-check readiness"],
      ["notifications-section", "A turn finishes"],
      ["language-section", "System follows your device"],
      ["shortcuts-section", "Keyboard shortcuts"],
      ["theme-section", "Terminal pane theme (CLI only)"],
    ] as const) {
      expect(screen.getByTestId(testId).textContent).toContain(phrase);
    }
    const select = within(screen.getByTestId("language-section"))
      .getByLabelText<HTMLSelectElement>("Interface language");
    expect(
      Array.from(select.options).map((option) => option.textContent),
    ).toEqual(["System", "English", "简体中文"]);
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
