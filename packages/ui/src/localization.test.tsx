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
import { activateLanguage, currentLocale, i18n } from "./i18n.js";
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

const PROJECTS = [
  { id: "p1", name: "alpha", path: "/tmp/alpha", registeredAt: 0 },
];

function seed(): void {
  useAppStore.setState({
    connection: "open",
    everConnected: true,
    projects: PROJECTS as never,
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
    space: undefined,
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

/** The home's choice as the core holds it: a write moves it, and every
 * later read — the one a re-read makes — finds what was written. */
let homeLanguage: Language | null = null;

/** Serve this fold to every read of it, from the first — and the app
 * state the core answers with, since a change of language re-reads it
 * whole (localization-11). */
function serveLedger(ledger: unknown): void {
  commandMock.mockImplementation(
    async (type: string, fields: Record<string, unknown> = {}) => {
      if (type === "ledger.get") return ledger;
      if (type === "ledger.history") return { intents: [], more: false };
      if (type === "config.get") return CONFIG;
      if (type === "readiness.get") return [];
      if (type === "project.list") return PROJECTS;
      if (type === "session.list") return [];
      if (type === "draft.list") return [];
      if (type === "project.status") {
        return { branch: "main", dirty: false, ahead: 0, behind: 0 };
      }
      if (type === "forge.items") {
        return { adapter: "github", authenticated: null, issues: [], prs: [] };
      }
      if (type === "language.set") {
        homeLanguage = (fields.language as Language | null) ?? null;
        return { language: homeLanguage };
      }
      if (type === "language.get") return { language: homeLanguage };
      return {};
    },
  );
}

/** The core announcing the home's choice to every page (localization-3),
 * the core's own copy moving with it. */
async function broadcast(language: Language | null): Promise<void> {
  homeLanguage = language;
  await act(async () => {
    deliverServerMessageForTests({ type: "language.state", language });
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
  homeLanguage = null;
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
    for (const label of ["仪表盘", "项目", "规程", "空间", "设置"]) {
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
          "还没有 Player — 在库中启用规程会自动添加其角色所需的 Player。",
          "添加 Player", // Add a player
        ],
      ],
      [
        "agents-section",
        [
          "智能体", // Agents
          "重新检查就绪状态", // Re-check readiness
          "尚未使用任何适配器 — 为 Captain 或某个规程角色指定智能体后，其就绪状态会显示在这里。",
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
    await broadcast("zh");
    expect(railLabels()).toContain("仪表盘");
    // Another page choosing System returns this one to English.
    await broadcast(null);
    expect(railLabels()).toContain("Dashboard");
    expect(useAppStore.getState().language.choice).toBeNull();
  });
});

describe("settings-37: the Saved mark outlives the re-rendering", () => {
  // A page keeps the surface the reader stands on in its own storage,
  // which this environment does not provide: without one, the app that
  // the language change mounts anew would land on the Workspace and
  // there would be no section to tick.
  let realStorage: PropertyDescriptor | undefined;
  beforeEach(() => {
    realStorage = Object.getOwnPropertyDescriptor(window, "localStorage");
    const kept = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => kept.get(key) ?? null,
        setItem: (key: string, value: string) => {
          kept.set(key, value);
        },
        removeItem: (key: string) => {
          kept.delete(key);
        },
        key: (index: number) => [...kept.keys()][index] ?? null,
        get length() {
          return kept.size;
        },
      },
    });
  });
  afterEach(() => {
    if (realStorage) Object.defineProperty(window, "localStorage", realStorage);
  });

  test("choosing 简体中文 ticks in the section the new language painted", async () => {
    speak("en", null);
    render(<Root />);
    await goTo("Settings");
    const select = screen.getByTestId("language-select") as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(select, { target: { value: "zh" } });
    });
    // The whole app repainted in Chinese, so the section that ticks is
    // not the one the reader changed: the mark rides the store.
    const section = screen.getByTestId("language-section");
    expect(within(section).getByLabelText("界面语言")).toBeTruthy();
    expect(within(section).getByTestId("language-saved").textContent).toBe(
      i18n._("Saved ✓"),
    );
  });

  test("a change that leaves the page's language as it is ticks in place", async () => {
    // System already resolves to English here, so choosing English
    // moves the home's choice and leaves the page as it stands.
    speak("en", null);
    render(<Root />);
    await goTo("Settings");
    const select = screen.getByTestId("language-select") as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(select, { target: { value: "en" } });
    });
    expect(useAppStore.getState().language.choice).toBe("en");
    expect(screen.getByTestId("language-saved").textContent).toBe("Saved ✓");
  });
});

describe("localization-11: a change of choice re-reads the core's prose", () => {
  /** Stand where a Space the page already holds would (space-2): the
   * store re-reads one only when it holds one. */
  const SPACE = { diagnostics: [], units: [] } as never;

  /** Let the surfaces finish their own arrival reads and forget them:
   * what follows is the change's doing alone. */
  async function quiet(): Promise<void> {
    await act(async () => {});
    commandMock.mockClear();
  }

  test("a different resolution re-issues the live reads", async () => {
    speak("en", null);
    useAppStore.setState({ space: SPACE });
    render(<Root />);
    await quiet();
    await broadcast("zh");
    const asked = commandMock.mock.calls.map(([type]) => type as string);
    for (const command of [
      "config.get",
      "readiness.get",
      "project.list",
      "session.list",
      "space.get",
    ]) {
      expect(asked, `${command} re-read`).toContain(command);
    }
  });

  test("the same resolution re-reads nothing", async () => {
    speak("en", null);
    useAppStore.setState({ space: SPACE });
    render(<Root />);
    await quiet();
    // System to English: the home's choice moved, the language the core
    // composes in did not.
    await broadcast("en");
    expect(useAppStore.getState().language.choice).toBe("en");
    const asked = commandMock.mock.calls.map(([type]) => type as string);
    for (const command of [
      "config.get",
      "readiness.get",
      "project.list",
      "session.list",
      "space.get",
    ]) {
      expect(asked, `${command} left alone`).not.toContain(command);
    }
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
