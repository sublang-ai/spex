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
  waitFor,
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
  LANGUAGE_KEY,
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
import type { SessionInfo, TmuxPlayRecord } from "@sublang/spex-core/protocol";
import {
  applyRecords,
  initialSessionView,
  type SessionView,
} from "./state/reducer.js";

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

/** A spec tree the page holds for p1: a re-read replaces it in place. */
const SPEC_TREE = {
  present: false,
  legacy: false,
  files: [],
  decisions: [],
  intents: [],
  notices: [],
  readAt: 0,
};

const PLAYERS = [{ id: "dev.coder", adapter: "claude" as const }];

/** A conversation the core can continue: its tab shows the run view,
 * whose Captain and player carry the agents' chips. */
const SESSION: SessionInfo = {
  id: "s1",
  projectId: "p1",
  projectPath: "/tmp/alpha",
  createdAt: NOW - HOUR,
  live: false,
  endedAt: NOW - 30 * MINUTE,
  continuable: true,
  players: PLAYERS,
  initialVisible: ["dev.coder"],
  title: "fix the bug",
  turns: 1,
  failed: false,
};

/** Its stored records. The page phrases two of their lines as it folds
 * them (localization-4): an error the agent reported with no words of
 * its own reads "agent error", and a turn aborted with no reason reads
 * "◆ turn aborted" in the Captain's thread. */
const RECORDS = [
  {
    seq: 1,
    record: {
      type: "turn_started",
      turnId: 1,
      timestamp: NOW - HOUR,
      turn: { id: 1, prompt: "fix the bug", timestamp: NOW - HOUR },
    },
  },
  {
    seq: 2,
    record: {
      type: "player_prompt",
      turnId: 1,
      timestamp: NOW - HOUR + 1000,
      playerId: "dev.coder",
      prompt: "Fix the bug in auth.ts",
    },
  },
  {
    seq: 3,
    record: {
      type: "player_event",
      turnId: 1,
      timestamp: NOW - HOUR + 2000,
      playerId: "dev.coder",
      event: {
        type: "error",
        agent: "claude",
        timestamp: NOW - HOUR + 2000,
        sessionId: "a",
        payload: {},
      },
    },
  },
  {
    seq: 4,
    record: { type: "turn_aborted", turnId: 1, timestamp: NOW - HOUR + 3000 },
  },
] as unknown as { seq: number; record: TmuxPlayRecord }[];

/** The conversation as the page folded it, in the language active now. */
function foldedView(): SessionView {
  return applyRecords(initialSessionView(PLAYERS), RECORDS);
}

/** What the core serves of the sessions and their stored records; a
 * change of language re-reads both. */
let servedSessions: SessionInfo[] = [];
let servedHistory: Record<string, typeof RECORDS> = {};

/** Stand s1 in the store, loaded and folded, with its tab the one the
 * workspace shows when `shown`. */
function holdConversation(shown: boolean): SessionView {
  servedSessions = [SESSION];
  servedHistory = { s1: RECORDS };
  const view = foldedView();
  useAppStore.setState({
    sessions: [SESSION],
    views: { s1: view },
    ...(shown
      ? {
          activeSessionId: "s1",
          openTabs: { p1: ["s1"] },
          workspaceTabs: { p1: "s1" },
        }
      : {}),
  } as never);
  return view;
}

/** The Captain thread's lines and the coder's error, as folded. */
function foldedWords(): { captain: string[]; coder: string[] } {
  const view = useAppStore.getState().views.s1;
  return {
    captain: view.captain.map((line) => line.text),
    coder: view.players["dev.coder"].segments.flatMap((segment) =>
      segment.kind === "error" ? [segment.message] : [],
    ),
  };
}

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
    collapsedLanes: {},
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
      if (type === "session.list") return servedSessions;
      if (type === "history.get") {
        return { records: servedHistory[fields.sessionId as string] ?? [] };
      }
      if (type === "draft.list") return [];
      if (type === "specs.get") return SPEC_TREE;
      // The agent editor a form under edit opens asks what it offers.
      if (type === "agent.options") {
        return {
          adapter: fields.adapter,
          effortValues: ["high"],
          fastModeSupported: false,
          discovery: { status: "unavailable", reason: "Fixture" },
        };
      }
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
  servedSessions = [];
  servedHistory = {};
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

  test("the re-render keeps what the page holds: a form under edit survives the change", async () => {
    speak("en", null);
    render(<Root />);
    // The surface the reader stands on and the form below are both the
    // page's own React state — this environment keeps no storage to
    // restore either from, so only a re-render, never a remount, keeps
    // them.
    await goTo("Settings");
    await act(async () => {
      fireEvent.click(screen.getByTestId("player-add"));
    });
    const typed = "qa.keeps-its-words";
    await act(async () => {
      fireEvent.change(screen.getByTestId("player-add-id"), {
        target: { value: typed },
      });
    });
    await act(() => useAppStore.getState().setLanguage("zh"));
    expect(railLabels()).toContain("仪表盘");
    expect(within(screen.getByTestId("language-section")).getByLabelText("界面语言")).toBeTruthy();
    expect((screen.getByTestId("player-add-id") as HTMLInputElement).value).toBe(typed);
  });
});

describe("settings-37: the Saved mark outlives the re-rendering", () => {
  // A page keeps the surface the reader stands on in its own storage,
  // which this environment does not provide: this stands in for it, as
  // a reload between the write and its tick would read it.
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
    // The whole app repainted in Chinese, the section the reader
    // changed among it: the mark rides the store, so it ticks there.
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

  test("a change of language folds each loaded conversation again in the new words", async () => {
    speak("en", null);
    holdConversation(true);
    render(<Root />);
    await quiet();
    // Folded in English: the words are the fold's, not the render's.
    expect(foldedWords()).toEqual({
      captain: ["fix the bug", "◆ turn aborted"],
      coder: ["agent error"],
    });
    const systemLines = () =>
      screen
        .getAllByTestId("system-line")
        .map((line) => line.textContent ?? "");
    expect(systemLines()).toContain("◆ turn aborted");
    await broadcast("zh");
    // The catalog's words for the same records (zh/messages.po).
    await waitFor(() =>
      expect(foldedWords()).toEqual({
        captain: ["fix the bug", "◆ 本轮已中止"],
        coder: ["智能体错误"],
      }),
    );
    expect(systemLines()).toContain("◆ 本轮已中止");
    expect(systemLines()).not.toContain("◆ turn aborted");
    const coder = screen.getByTestId("player-pane-dev.coder").textContent ?? "";
    expect(coder).toContain("智能体错误");
    expect(coder).not.toContain("agent error");
  });

  test("the conversation shown keeps its mount, and an editor open in it keeps its edit", async () => {
    speak("en", null);
    holdConversation(true);
    render(<Root />);
    await quiet();
    const pane = screen.getByTestId("captain-pane");
    const composer = screen.getByTestId("boss-composer");
    // The Captain's own editor, open from its chip, with a field moved
    // and not saved: its draft is the editor's React state alone.
    await act(async () => {
      fireEvent.click(screen.getByTestId("agent-chip-captain"));
    });
    const editor = await screen.findByTestId("agent-settings-captain");
    const mode = within(editor).getByTestId<HTMLSelectElement>(
      "agent-captain-model-mode",
    );
    await act(async () => {
      fireEvent.change(mode, { target: { value: "provider" } });
    });
    expect(mode.value).toBe("provider");

    await broadcast("zh");
    // The re-fold landed and the page speaks Chinese …
    await waitFor(() =>
      expect(foldedWords().captain).toContain("◆ 本轮已中止"),
    );
    expect(railLabels()).toContain("仪表盘");
    // … over the very nodes it had: a remount would have replaced them.
    expect(document.contains(pane)).toBe(true);
    expect(screen.getByTestId("captain-pane")).toBe(pane);
    expect(screen.getByTestId("boss-composer")).toBe(composer);
    expect(screen.getByTestId("agent-settings-captain")).toBe(editor);
    expect(
      within(editor).getByTestId<HTMLSelectElement>("agent-captain-model-mode"),
    ).toBe(mode);
    expect(mode.value).toBe("provider");
    expect(commandMock).not.toHaveBeenCalledWith(
      "session.agent.set",
      expect.anything(),
    );
  });

  /** Hold the re-fold's read of the history until the test answers or
   * fails it; every other command is served as before. */
  function holdHistory(): {
    answer(records: typeof RECORDS): Promise<void>;
    fail(cause: Error): Promise<void>;
  } {
    let answer!: (history: { records: typeof RECORDS }) => void;
    let fail!: (cause: Error) => void;
    const read = new Promise<{ records: typeof RECORDS }>((resolve, reject) => {
      answer = resolve;
      fail = reject;
    });
    const serve = commandMock.getMockImplementation()!;
    commandMock.mockImplementation((type: string, fields?: Record<string, unknown>) =>
      type === "history.get" ? read : serve(type, fields),
    );
    return {
      answer: async (records) => {
        await act(async () => answer({ records }));
      },
      fail: async (cause) => {
        await act(async () => fail(cause));
      },
    };
  }

  /** The core pushing one of s1's records as it lands. */
  async function push(
    entry: { seq: number; record: Record<string, unknown> },
    role?: string,
  ): Promise<void> {
    await act(async () => {
      deliverServerMessageForTests({
        type: "record",
        channel: "session",
        sessionId: "s1",
        seq: entry.seq,
        record: entry.record as unknown as TmuxPlayRecord,
        ...(role !== undefined ? { role } : {}),
      });
    });
  }

  /** Move the home's choice to 简体中文 and wait until the re-fold asks
   * for the conversation from its first record. */
  async function changeLanguageUntilRead(): Promise<void> {
    await broadcast("zh");
    await waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("history.get", {
        sessionId: "s1",
        afterSeq: 0,
      }),
    );
  }

  /** The coder lane's prompts, in the order it received them. */
  function coderPrompts(view: SessionView): { text: string; role?: string }[] {
    return view.players["dev.coder"].segments.flatMap((segment) =>
      segment.kind === "prompt"
        ? [{ text: segment.text, ...(segment.role !== undefined ? { role: segment.role } : {}) }]
        : [],
    );
  }

  test("live records keep acting on the shown view while its history is read", async () => {
    speak("en", null);
    holdConversation(true);
    // The runtime holds the session for a turn, and the Boss has a
    // message queued behind it.
    const running: SessionInfo = { ...SESSION, live: true, endedAt: null };
    servedSessions = [running];
    useAppStore.setState({
      sessions: [running],
      composers: { s1: { queued: [{ text: "then write the docs" }] } },
    } as never);
    render(<Root />);
    await quiet();
    const read = holdHistory();
    await changeLanguageUntilRead();

    // While the history is read the Captain parks a question …
    const park = {
      seq: 5,
      record: {
        type: "captain_telemetry",
        turnId: 1,
        timestamp: NOW,
        topic: "playbook.fsm.state",
        payload: {
          to: "awaitBossReply",
          pendingBossQuestions: [{ question: "Which target?" }],
        },
      },
    };
    const ask = {
      seq: 6,
      record: { type: "captain_reply", turnId: 1, timestamp: NOW + 1, text: "Which target?" },
    };
    await push(park);
    await push(ask);
    // … and the view shown holds it at once.
    const shown = useAppStore.getState().views.s1;
    expect(shown.pendingQuestion).toBe("Which target?");
    expect(shown.lastSeq).toBe(6);
    expect(shown.captain.filter((line) => line.text === "Which target?")).toEqual([
      expect.objectContaining({ kind: "question" }),
    ]);

    // The turn settles with the question open: the view shown carries
    // it, so the queued message stays queued.
    await act(async () => {
      deliverServerMessageForTests({
        type: "session.state",
        session: { ...running, live: false, endedAt: NOW + 2 },
      });
    });
    expect(commandMock).not.toHaveBeenCalledWith("turn.submit", expect.anything());
    expect(useAppStore.getState().composers.s1.queued).toEqual([
      { text: "then write the docs" },
    ]);

    // The read answers with what the core had stored by then, the two
    // live records among them.
    await read.answer([...RECORDS, park, ask] as unknown as typeof RECORDS);
    await waitFor(() => expect(foldedWords().captain).toContain("◆ 本轮已中止"));
    const refolded = useAppStore.getState().views.s1;
    expect(refolded.pendingQuestion).toBe("Which target?");
    expect(refolded.lastSeq).toBe(6);
    // Once, though both the read and the live stream carried it.
    expect(refolded.captain.map((line) => line.text)).toEqual([
      "fix the bug",
      "◆ 本轮已中止",
      "Which target?",
    ]);
    expect(refolded.turnActive).toBe(false);
    // The swap releases nothing either.
    expect(commandMock).not.toHaveBeenCalledWith("turn.submit", expect.anything());
    expect(useAppStore.getState().composers.s1.queued).toHaveLength(1);
  });

  test("a record received during the read keeps its effects and reaches the replacement once", async () => {
    speak("en", null);
    holdConversation(true);
    useAppStore.setState({ collapsedLanes: { s1: ["dev.coder"] } });
    render(<Root />);
    await quiet();
    const lane = () => screen.getByTestId("player-pane-dev.coder");
    expect(lane().dataset.collapsed).toBe("true");
    const read = holdHistory();
    await changeLanguageUntilRead();

    // The coder's next call opens while the history is read …
    await push(
      {
        seq: 5,
        record: {
          type: "player_prompt",
          turnId: 2,
          timestamp: NOW,
          playerId: "dev.coder",
          prompt: "Cover the fix with a test",
        },
      },
      "code",
    );
    // … and its folded lane opens at once (run-view-117).
    expect(useAppStore.getState().collapsedLanes.s1).toEqual([]);
    expect(lane().dataset.collapsed).toBeUndefined();
    expect(coderPrompts(useAppStore.getState().views.s1)).toEqual([
      { text: "Fix the bug in auth.ts" },
      { text: "Cover the fix with a test", role: "code" },
    ]);

    // The read answers with what the core had stored before the call
    // opened: the replacement takes the call from the live stream.
    await read.answer(RECORDS);
    await waitFor(() => expect(foldedWords().coder).toEqual(["智能体错误"]));
    const refolded = useAppStore.getState().views.s1;
    expect(refolded.lastSeq).toBe(5);
    expect(coderPrompts(refolded)).toEqual([
      { text: "Fix the bug in auth.ts" },
      { text: "Cover the fix with a test", role: "code" },
    ]);
    expect(refolded.players["dev.coder"].running).toBe(true);
    expect(useAppStore.getState().collapsedLanes.s1).toEqual([]);
    expect(lane().dataset.collapsed).toBeUndefined();
  });

  test("a failed history read leaves the shown view with everything it received", async () => {
    speak("en", null);
    holdConversation(true);
    render(<Root />);
    await quiet();
    const read = holdHistory();
    await changeLanguageUntilRead();

    const reply = {
      seq: 5,
      record: {
        type: "captain_reply",
        turnId: 1,
        timestamp: NOW,
        text: "The fix is in auth.ts.",
      },
    };
    await push(reply);
    const shown = useAppStore.getState().views.s1;
    await read.fail(new Error("history unreadable"));

    // The view shown stands as it was, the reply and all: its earlier
    // lines keep the words they were folded in.
    const view = useAppStore.getState().views.s1;
    expect(view).toBe(shown);
    expect(view.lastSeq).toBe(5);
    expect(view.captain.map((line) => line.text)).toEqual([
      "fix the bug",
      "◆ turn aborted",
      "The fix is in auth.ts.",
    ]);
    expect(
      within(screen.getByTestId("captain-pane")).getByText("The fix is in auth.ts."),
    ).toBeTruthy();
    // No failure surfaces: the change of language swallowed it.
    expect(view.loadError).toBeUndefined();
    expect(view.loading).toBeFalsy();
    expect(useAppStore.getState().runErrors.s1).toBeUndefined();

    // Nor does the failed read stand in the way of the next change.
    servedHistory = { s1: [...RECORDS, reply] as unknown as typeof RECORDS };
    serveLedger(EMPTY_LEDGER);
    commandMock.mockClear();
    await broadcast("en");
    await waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("history.get", {
        sessionId: "s1",
        afterSeq: 0,
      }),
    );
    await waitFor(() => expect(useAppStore.getState().views.s1).not.toBe(shown));
    expect(useAppStore.getState().views.s1.captain.map((line) => line.text)).toEqual([
      "fix the bug",
      "◆ turn aborted",
      "The fix is in auth.ts.",
    ]);
  });

  /** Hold every read of s1's history until the test answers it, each
   * by where it starts: a re-fold reads from the first record
   * (afterSeq 0), a backfill after the view's last (afterSeq > 0), so
   * both can be held at once and answered in either order. Every other
   * command is served as before. */
  function holdHistoryReads(): {
    issued(afterSeq: number): number;
    answer(afterSeq: number, records: typeof RECORDS): Promise<void>;
  } {
    const held = new Map<number, ((history: { records: typeof RECORDS }) => void)[]>();
    const issued = new Map<number, number>();
    const serve = commandMock.getMockImplementation()!;
    commandMock.mockImplementation((type: string, fields?: Record<string, unknown>) => {
      if (type !== "history.get") return serve(type, fields);
      const afterSeq = fields?.afterSeq as number;
      issued.set(afterSeq, (issued.get(afterSeq) ?? 0) + 1);
      return new Promise<{ records: typeof RECORDS }>((resolve) => {
        held.set(afterSeq, [...(held.get(afterSeq) ?? []), resolve]);
      });
    });
    return {
      issued: (afterSeq) => issued.get(afterSeq) ?? 0,
      answer: async (afterSeq, records) => {
        const resolve = held.get(afterSeq)?.shift();
        if (!resolve) throw new Error(`no history read after ${afterSeq} is held`);
        await act(async () => resolve({ records }));
      },
    };
  }

  /** The Boss writing to s1 while it is paused: the message opens the
   * session again, and its subscription backfills the loaded view from
   * after its last record before the turn is submitted. */
  function continueConversation(): Promise<void> {
    return useAppStore.getState().submitBossText("s1", "now write the docs");
  }

  /** The backfill subscribes before it reads: the fake client takes it. */
  function acceptSubscriptions(): void {
    setClientForTests({ command: commandMock, subscribe: async () => {} } as never);
  }

  test("a language change met by a backfill in flight re-folds once the backfill settles", async () => {
    speak("en", null);
    const loaded = holdConversation(true);
    acceptSubscriptions();
    render(<Root />);
    await quiet();
    const reads = holdHistoryReads();
    const sent = continueConversation();
    await waitFor(() => expect(reads.issued(loaded.lastSeq)).toBe(1));
    expect(commandMock).toHaveBeenCalledWith("history.get", {
      sessionId: "s1",
      afterSeq: RECORDS.length,
    });

    await broadcast("zh");
    // The re-read reached the loaded conversations …
    await waitFor(() => expect(commandMock).toHaveBeenCalledWith("draft.list", {}));
    // … and held the re-fold behind the backfill: nothing is read from
    // the first record, and the line keeps the words it was folded in.
    expect(reads.issued(0)).toBe(0);
    expect(foldedWords().captain).toEqual(["fix the bug", "◆ turn aborted"]);
    expect(screen.getByTestId("captain-pane").textContent).toContain("◆ turn aborted");

    // The backfill settles, and the held re-fold runs.
    await reads.answer(loaded.lastSeq, []);
    await waitFor(() => expect(reads.issued(0)).toBe(1));
    expect(commandMock).toHaveBeenCalledWith("history.get", {
      sessionId: "s1",
      afterSeq: 0,
    });
    const backfilled = useAppStore.getState().views.s1;
    expect(backfilled.captain.map((line) => line.text)).toContain("◆ turn aborted");
    await reads.answer(0, RECORDS);
    await waitFor(() => expect(useAppStore.getState().views.s1).not.toBe(backfilled));
    expect(foldedWords()).toEqual({
      captain: ["fix the bug", "◆ 本轮已中止"],
      coder: ["智能体错误"],
    });
    const captain = screen.getByTestId("captain-pane").textContent ?? "";
    expect(captain).toContain("◆ 本轮已中止");
    expect(captain).not.toContain("◆ turn aborted");
    expect(useAppStore.getState().views.s1.lastSeq).toBe(RECORDS.length);

    // The message the backfill preceded goes out as before.
    await act(async () => {
      await sent;
    });
    expect(commandMock).toHaveBeenCalledWith("turn.submit", {
      sessionId: "s1",
      text: "now write the docs",
    });
  });

  test("a backfill starting during the re-fold's read holds the re-fold until it settles", async () => {
    speak("en", null);
    const loaded = holdConversation(true);
    acceptSubscriptions();
    render(<Root />);
    await quiet();
    const reads = holdHistoryReads();
    await broadcast("zh");
    await waitFor(() => expect(reads.issued(0)).toBe(1));
    const sent = continueConversation();
    await waitFor(() => expect(reads.issued(loaded.lastSeq)).toBe(1));

    // The re-fold's read answers first: the backfill owns the records,
    // so nothing is swapped in and the line keeps its English words.
    await reads.answer(0, RECORDS);
    expect(useAppStore.getState().views.s1).toBe(loaded);
    expect(foldedWords().captain).toEqual(["fix the bug", "◆ turn aborted"]);
    expect(reads.issued(0)).toBe(1);

    // The backfill settles, and the held re-fold reads again.
    await reads.answer(loaded.lastSeq, []);
    await waitFor(() => expect(reads.issued(0)).toBe(2));
    const backfilled = useAppStore.getState().views.s1;
    expect(backfilled.captain.map((line) => line.text)).toContain("◆ turn aborted");
    await reads.answer(0, RECORDS);
    await waitFor(() => expect(useAppStore.getState().views.s1).not.toBe(backfilled));
    expect(foldedWords()).toEqual({
      captain: ["fix the bug", "◆ 本轮已中止"],
      coder: ["智能体错误"],
    });
    const captain = screen.getByTestId("captain-pane").textContent ?? "";
    expect(captain).toContain("◆ 本轮已中止");
    expect(captain).not.toContain("◆ turn aborted");

    await act(async () => {
      await sent;
    });
    expect(commandMock).toHaveBeenCalledWith("turn.submit", {
      sessionId: "s1",
      text: "now write the docs",
    });
  });

  describe("a page whose browser asks for Chinese", () => {
    // The page resolves zh from its own browser with nothing stored, so
    // the home's choice can move to zh while this page's language stays.
    beforeEach(() => {
      Object.defineProperty(navigator, "languages", {
        configurable: true,
        get: () => ["zh-CN"],
      });
    });
    afterEach(() => {
      delete (navigator as { languages?: readonly string[] }).languages;
    });

    test("a choice that moves while the resolution stays re-reads the live state and the cached spec trees", async () => {
      speak("zh", null);
      useAppStore.setState({ space: SPACE, specTrees: { p1: SPEC_TREE } as never });
      const loaded = holdConversation(false);
      render(<Root />);
      await quiet();
      // Every state the store passes through from here on, as a
      // subscriber sees it.
      const held: boolean[] = [];
      const unsubscribe = useAppStore.subscribe((state) => {
        held.push(state.views.s1 !== undefined);
      });
      try {
        // System to 简体中文: this page already speaks Chinese, but the
        // core composed its prose for a home that chose nothing.
        await broadcast("zh");
        expect(useAppStore.getState().language).toMatchObject({ choice: "zh", resolved: "zh" });
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
        expect(commandMock).toHaveBeenCalledWith("specs.get", { projectId: "p1" });
        // Re-read in place: the cached tree never blanks on the way.
        expect(useAppStore.getState().specTrees.p1).toBeDefined();
        // The loaded conversation is folded again from its first record
        // and swapped in whole.
        await waitFor(() => {
          expect(commandMock).toHaveBeenCalledWith("history.get", {
            sessionId: "s1",
            afterSeq: 0,
          });
          expect(useAppStore.getState().views.s1).not.toBe(loaded);
        });
      } finally {
        unsubscribe();
      }
      // In place: no state on the way lacked the conversation.
      expect(held.length).toBeGreaterThan(0);
      expect(held.every(Boolean)).toBe(true);
      // The re-fold holds every record the first fold held.
      const refolded = useAppStore.getState().views.s1;
      expect(refolded.lastSeq).toBe(loaded.lastSeq);
      expect(refolded.lastSeq).toBe(RECORDS.length);
      expect(refolded.loading).toBeFalsy();
      expect(refolded.captain.map((line) => line.kind)).toEqual(
        loaded.captain.map((line) => line.kind),
      );
    });

    test("a broadcast that moves neither the choice nor the resolution sends nothing", async () => {
      speak("zh", "zh");
      homeLanguage = "zh";
      useAppStore.setState({ space: SPACE, specTrees: { p1: SPEC_TREE } as never });
      render(<Root />);
      await quiet();
      await broadcast("zh");
      expect(commandMock).not.toHaveBeenCalled();
    });
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

  // The case is a first load with no stored choice: whatever an earlier
  // test chose must not stand in the mirror the fresh store reads.
  beforeEach(() => {
    safeStorageRemove(LANGUAGE_KEY);
  });

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
