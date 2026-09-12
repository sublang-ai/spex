// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// DR-058 authoring coverage over a simulated document: the Drafts
// section and the New playbook field (playbook-library-50/51), the
// workspace's header, tabs, and compile control by the state table
// (playbook-library-52/57/59/60), the conversation's bubbles, cards,
// and running mark (playbook-library-53), the composer's labels and
// queue (playbook-library-54), the agent picker (playbook-library-55),
// the Source tab's edit, conflict, and paste paths
// (playbook-library-56), the band's phases and failure
// (playbook-library-57/58), the Register tab's prefill precedence and
// mismatch (playbook-library-61), Delete's confirm (playbook-library-63),
// the example prefill (playbook-library-35), and the 14-character
// budget on every workspace control (DR-041).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type {
  BuiltinPlaybookInfo,
  ConfigState,
  DraftInfo,
  ReadinessEntry,
  TmuxPlayRecord,
} from "@sublang/spex-core/protocol";

afterEach(cleanup);

const { commandMock } = vi.hoisted(() => ({ commandMock: vi.fn() }));

vi.mock("../state/store.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../state/store.js")>();
  return { ...actual, getClient: () => ({ command: commandMock, subscribe: async () => null, unsubscribe: async () => null }) };
});

import { LibrarySurface } from "./LibrarySurface.js";
import { SLC_DEMO } from "../examples/slc-demo.js";
import { applyRecord, initialSessionView } from "../state/reducer.js";
import {
  AUTHOR_PLAYER,
  deliverServerMessageForTests,
  setClientForTests,
  useAppStore,
  type DraftView,
} from "../state/store.js";

const now = Date.now();
const HOUR = 3_600_000;

const CONFIG_STATE: ConfigState = {
  status: "valid",
  seeded: false,
  summary: {
    path: "/tmp/config.yaml",
    captain: { adapter: "claude", model: "claude-opus-5", effort: "high", permissions: { mode: "auto" } },
    players: [
      {
        id: "dev.coder",
        agent: { adapter: "claude", model: "claude-opus-5", effort: "high" },
        display: "claude-opus-5 @ high",
        boundBy: ["code.coder"],
      },
      {
        id: "dev.reviewer",
        agent: { adapter: "codex", model: "gpt-6-astra" },
        display: "gpt-6-astra",
        boundBy: ["code.reviewer"],
      },
    ],
    playbooks: [
      {
        id: "code",
        from: "@sublang/playbook/code/registry",
        command: "code",
        intent: "software development workflow",
        roles: {
          coder: { playerId: "dev.coder", display: "claude-opus-5 @ high" },
          reviewer: { playerId: "dev.reviewer", display: "gpt-6-astra" },
        },
      },
    ],
  },
};

const READINESS: ReadinessEntry[] = [
  { adapter: "claude", ready: true, usedBy: ["captain"], fastModeSupported: true },
  {
    adapter: "codex",
    ready: false,
    requirement: "set OPENAI_API_KEY or run `codex login`",
    usedBy: [],
    fastModeSupported: false,
  },
];

const BUILTINS: BuiltinPlaybookInfo[] = [
  {
    id: "review",
    command: "review",
    intent: "review of committed phases",
    from: "@sublang/playbook/review/registry",
    roles: ["host"],
    configured: false,
  },
];

const ARTIFACTS = {
  source: "# Triage",
  gears: "### TRIAGE-1\n\nCaptain shall prompt Triager.",
  gearsItems: {
    path: "specs/packages/triage.md",
    key: "triage",
    dir: "",
    basename: "triage",
    title: "Triage",
    items: [
      {
        id: "TRIAGE-1",
        group: "external",
        section: "Triager",
        firstLine: "Captain shall prompt Triager.",
        text: "Captain shall prompt Triager.",
        cites: [] as string[],
      },
    ],
    notices: [] as string[],
  },
  fsm: "import { setup } from 'xstate';",
  stateIds: ["ready", "triage", "done"],
  machine: null,
  missing: [] as string[],
};

const SOURCE = {
  markdown: "# Triage\n\nRoles:\n- Triager\n- Verifier\n\nWhen an issue arrives, Captain shall prompt Triager to **label** it.",
  version: "v1",
  mtime: now - 3 * 60_000,
  by: "agent" as const,
};

function draftInfo(overrides: Partial<DraftInfo> = {}): DraftInfo {
  return {
    id: "triage",
    createdAt: now - 10 * HOUR,
    touchedAt: now - 9 * HOUR,
    firstLine: "# Triage",
    activity: "idle",
    state: "draft",
    queued: [],
    player: null,
    agent: { adapter: "claude", model: "claude-opus-5", effort: "high" },
    ready: true,
    failures: 0,
    ...overrides,
  };
}

const COMPILED = draftInfo({
  state: "compiled",
  compile: { at: now - 2 * 60_000, by: "agent", outcome: "ok", roles: ["Triager", "Verifier"] },
});

function rec(seq: number, record: Record<string, unknown>): { seq: number; record: TmuxPlayRecord } {
  return { seq, record: record as unknown as TmuxPlayRecord };
}

function event(seq: number, at: number, event: Record<string, unknown>) {
  return rec(seq, {
    type: "player_event",
    turnId: 1,
    timestamp: at,
    playerId: AUTHOR_PLAYER,
    event: { agent: "fake", timestamp: at, sessionId: "a", ...event },
  });
}

const t0 = now - 20 * 60_000;

/** A Boss turn with a write, a compile block, and the compile's line. */
const THREAD = [
  rec(1, { type: "turn_started", turnId: 1, timestamp: t0, turn: { id: 1, prompt: "I want a playbook that triages issues", timestamp: t0 } }),
  rec(2, { type: "player_prompt", turnId: 1, timestamp: t0 + 1, playerId: AUTHOR_PLAYER, prompt: "Boss: I want a playbook that triages issues" }),
  event(3, t0 + 2, { type: "tool_use", payload: { toolName: "Write", toolUseId: "w1", input: { file_path: "triage.md", content: "# Triage" } } }),
  event(4, t0 + 3, { type: "tool_result", payload: { toolUseId: "w1", toolName: "Write", status: "success", output: "ok", durationMs: 40 } }),
  event(5, t0 + 4, { type: "text_delta", payload: { delta: "I wrote `triage.md`. Compiling now.\n```spex\nkind: compile\n```\n" } }),
  event(6, t0 + 5, { type: "done", payload: { result: "done", usage: { toolUses: 1, tokens: { totals: { input: { total: 1204 }, output: { total: 96 } } } } } }),
  rec(7, { type: "player_finished", turnId: 1, timestamp: t0 + 6, playerId: AUTHOR_PLAYER, result: { status: "ok" } }),
  rec(8, { type: "turn_finished", turnId: 1, timestamp: t0 + 7 }),
  rec(9, { type: "captain_status", turnId: null, timestamp: t0 + 8, message: "◇ Compiling — asked by the agent" }),
];

/** The success turn: a system-origin prompt and a register block, plus
 * a block Spex could not read. */
const PROPOSAL_THREAD = [
  ...THREAD,
  rec(10, { type: "captain_status", turnId: null, timestamp: t0 + 9, message: "◇ Compiled — roles: Triager, Verifier" }),
  rec(11, { type: "turn_started", turnId: 2, timestamp: t0 + 10, turn: { id: 2, prompt: "Spex: The compile of triage succeeded; the roles are Triager, Verifier.\nPropose the registration in a register block.", timestamp: t0 + 10 } }),
  rec(12, { type: "player_prompt", turnId: 2, timestamp: t0 + 11, playerId: AUTHOR_PLAYER, prompt: "Spex: …" }),
  event(13, t0 + 12, { type: "text", payload: { content: "Registration proposal:\n```spex\nkind: register\ncommand: triage\nintent: Triage a new issue into labels\nplayers:\n  Triager: dev.triager\n  Verifier: dev.reviewer\n```\nAnd one I got wrong:\n```spex\nkind: deploy\n```" } }),
  rec(14, { type: "player_finished", turnId: 2, timestamp: t0 + 13, playerId: AUTHOR_PLAYER, result: { status: "ok" } }),
  rec(15, { type: "turn_finished", turnId: 2, timestamp: t0 + 14 }),
];

/** Fold records the way the store does: the reducer over a view whose
 * one player is the author, with the seq behind each Captain line. */
function foldView(entries: { seq: number; record: TmuxPlayRecord }[]): DraftView {
  const view = initialSessionView([{ id: AUTHOR_PLAYER }]);
  const lineSeqs: number[] = [];
  for (const entry of entries) {
    const before = view.captain.length;
    applyRecord(view, entry.seq, entry.record);
    if (view.captain.length > before) lineSeqs.push(entry.seq);
  }
  return { view, lineSeqs };
}

let artifactsAvailable = true;

function seed(overrides: Partial<ReturnType<typeof useAppStore.getState>> = {}) {
  useAppStore.setState({
    connection: "open",
    configState: CONFIG_STATE,
    readiness: READINESS,
    builtins: BUILTINS,
    loadBuiltins: vi.fn(async () => {}),
    drafts: {},
    draftsLoaded: true,
    draftViews: {},
    draftSources: {},
    draftArtifacts: {},
    draftComposers: {},
    draftSourceModes: {},
    draftEditors: {},
    draftForms: {},
    draftErrors: {},
    compileProgress: {},
    compileProgressAt: {},
    openDraftId: undefined,
    newPlaybookRequested: false,
    revealPlaybook: undefined,
    frameHeights: {},
    ...overrides,
  });
}

function renderWorkspace(
  draft: DraftInfo,
  options: {
    view?: DraftView;
    source?: typeof SOURCE | null;
    lines?: string[];
    times?: number[];
  } = {},
) {
  seed({
    drafts: { [draft.id]: draft },
    openDraftId: draft.id,
    draftViews: options.view ? { [draft.id]: options.view } : {},
    draftSources: { [draft.id]: options.source === undefined ? SOURCE : options.source },
    compileProgress: options.lines ? { [draft.id]: options.lines } : {},
    compileProgressAt: options.times ? { [draft.id]: options.times } : {},
  });
  return render(<LibrarySurface />);
}

function tab(name: string): HTMLButtonElement {
  return screen.getByRole("tab", { name }) as HTMLButtonElement;
}

beforeEach(() => {
  artifactsAvailable = true;
  useAppStore.setState({
    loadAgentOptions: async (adapter) => ({
      adapter,
      effortValues: ["high"],
      fastModeSupported: false,
      discovery: { status: "unavailable", reason: "Fixture" },
    }),
  });
  commandMock.mockReset();
  commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
    const state = useAppStore.getState();
    switch (type) {
      case "compile.check":
        return { node: { ok: true, version: "v23.6.0", command: "node" }, slc: { ok: true, command: ["npx", "@sublang/slc"] } };
      case "library.builtins":
        return { builtins: BUILTINS };
      case "config.edit":
        return CONFIG_STATE;
      case "draft.list":
        return Object.values(state.drafts);
      case "draft.open": {
        const id = String(params?.draftId);
        return { draft: state.drafts[id] ?? draftInfo({ id }), source: state.draftSources[id] ?? null, records: [] };
      }
      case "draft.create":
        return draftInfo({ id: String(params?.draftId), state: "no-source", firstLine: null, touchedAt: now, createdAt: now });
      case "draft.artifacts":
        if (!artifactsAvailable) throw new Error("no registry beside the draft");
        return ARTIFACTS;
      case "draft.send":
        return { accepted: true, queued: state.drafts[String(params?.draftId)]?.activity !== "idle" };
      case "draft.abort":
        return { aborted: true };
      case "draft.player.set":
        return { ...state.drafts[String(params?.draftId)], player: params?.playerId ?? null };
      case "draft.source.write":
        return { version: "v2", mtime: now };
      case "draft.register":
        return CONFIG_STATE;
      case "draft.delete":
      case "compile.abort":
      case "subscribe":
      case "unsubscribe":
        return null;
      default:
        return null;
    }
  });
  setClientForTests({
    command: commandMock,
    subscribe: async () => null,
    unsubscribe: async () => null,
  } as unknown as Parameters<typeof setClientForTests>[0]);
});

describe("playbook-library-50: the Drafts section", () => {
  test("rows carry the id, the chip, the age, Open, and Delete; the chip's title holds the phase", () => {
    seed({
      drafts: {
        changelog: { ...COMPILED, id: "changelog" },
        triage: draftInfo({
          state: "failed",
          compile: { at: now - 9 * HOUR, by: "agent", outcome: "failed", phase: "gears2fsm", output: "✗ gears2fsm failed" },
        }),
        gone: draftInfo({ id: "gone", sourceMissing: true, firstLine: null }),
      },
    });
    render(<LibrarySurface />);
    const section = screen.getByTestId("drafts-section");
    // Between the configured playbooks and the built-ins.
    expect(
      screen.getByTestId("playbook-card-code").compareDocumentPosition(section) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      section.compareDocumentPosition(screen.getByTestId("builtins-section")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const failed = within(section).getByTestId("draft-row-triage");
    const chip = within(failed).getByTestId("draft-chip");
    expect(chip.textContent).toBe("Failed");
    expect(chip.title).toBe("Failed at Machine (gears2fsm), 9h ago");
    expect(within(failed).getByTestId("draft-age-triage").textContent).toBe("9h ago");
    expect(within(failed).getByTestId("draft-open-triage").textContent).toBe("Open");
    expect(within(failed).getByTestId("draft-delete-triage").textContent).toBe("Delete");

    expect(within(within(section).getByTestId("draft-row-changelog")).getByTestId("draft-chip").textContent).toBe("Compiled");

    // A draft whose directory is gone offers only Delete.
    const missing = within(section).getByTestId("draft-row-gone");
    expect(within(missing).getByTestId("draft-chip").textContent).toBe("Source missing");
    expect(within(missing).queryByTestId("draft-open-gone")).toBeNull();
    expect(within(missing).getByTestId("draft-delete-gone")).toBeTruthy();

    // The way to a new one stands at the section's foot.
    expect(within(section).getByTestId("new-playbook")).toBeTruthy();
    expect(screen.queryByTestId("new-playbook-section")).toBeNull();
  });

  test("without a draft the section is absent, the empty state names New playbook, and the field stands below the built-ins", () => {
    seed({
      configState: { ...CONFIG_STATE, summary: { ...CONFIG_STATE.summary, playbooks: [] } },
    });
    render(<LibrarySurface />);
    expect(screen.queryByTestId("drafts-section")).toBeNull();
    expect(screen.getByTestId("playbooks-empty").textContent).toBe(
      "No playbooks enabled yet — enable a built-in below, or make your own with New playbook.",
    );
    const field = screen.getByTestId("new-playbook-section");
    expect(
      screen.getByTestId("builtins-section").compareDocumentPosition(field) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByTestId("new-playbook-button").textContent).toBe("New playbook");
    expect(screen.getByTestId("new-playbook").textContent).toContain(
      "Lowercase; it names the file and the /command — the command can change at registration",
    );
  });
});

describe("playbook-library-51: New playbook asks for the id", () => {
  test("an id outside the rule or one a playbook or built-in holds is refused in place", () => {
    seed();
    render(<LibrarySurface />);
    const input = screen.getByTestId("new-playbook-id");
    fireEvent.change(input, { target: { value: "Triage" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("new-playbook-error").textContent).toBe(
      "Lowercase letters, digits, - or _, starting with a letter",
    );
    fireEvent.change(input, { target: { value: "code" } });
    fireEvent.click(screen.getByTestId("new-playbook-button"));
    expect(screen.getByTestId("new-playbook-error").textContent).toBe(
      "/code is already a configured playbook",
    );
    fireEvent.change(input, { target: { value: "review" } });
    fireEvent.click(screen.getByTestId("new-playbook-button"));
    expect(screen.getByTestId("new-playbook-error").textContent).toContain("built-in");
    expect(commandMock).not.toHaveBeenCalledWith("draft.create", expect.anything());
  });

  test("Enter creates the draft and opens its workspace; an existing draft's id opens that draft", async () => {
    seed({ drafts: { changelog: { ...COMPILED, id: "changelog" } } });
    render(<LibrarySurface />);
    const input = screen.getByTestId("new-playbook-id");
    fireEvent.change(input, { target: { value: "triage" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("draft.create", { draftId: "triage" }),
    );
    await vi.waitFor(() => expect(screen.getByTestId("authoring-workspace")).toBeTruthy());
    const header = screen.getByTestId("authoring-workspace").querySelector("header")!;
    expect(header.textContent).toContain("triage");
    expect(within(header).getByTestId("draft-chip").textContent).toBe("No source");

    // Back to the list, and the existing draft's id opens it, creating nothing.
    fireEvent.click(screen.getByTestId("workspace-back"));
    commandMock.mockClear();
    const again = screen.getByTestId("new-playbook-id");
    fireEvent.change(again, { target: { value: "changelog" } });
    fireEvent.keyDown(again, { key: "Enter" });
    await vi.waitFor(() => expect(screen.getByTestId("authoring-workspace").textContent).toContain("changelog"));
    expect(commandMock).not.toHaveBeenCalledWith("draft.create", expect.anything());
    expect(commandMock).toHaveBeenCalledWith("draft.open", expect.objectContaining({ draftId: "changelog" }));
  });
});

describe("playbook-library-63: Delete behind the inline confirm", () => {
  test("Keep writes nothing; Delete removes the draft", async () => {
    seed({ drafts: { triage: draftInfo() } });
    render(<LibrarySurface />);
    fireEvent.click(screen.getByTestId("draft-delete-triage"));
    expect(screen.getByText("Delete this draft and its source?")).toBeTruthy();
    const keep = screen.getByRole("button", { name: "Keep" });
    // The safe default holds focus (DR-010 §4).
    expect(document.activeElement).toBe(keep);
    fireEvent.click(keep);
    expect(commandMock).not.toHaveBeenCalledWith("draft.delete", expect.anything());
    fireEvent.click(screen.getByTestId("draft-delete-triage"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("draft.delete", { draftId: "triage" }),
    );
    await vi.waitFor(() => expect(screen.queryByTestId("draft-row-triage")).toBeNull());
  });

  test("a removal broadcast drops the draft everywhere, closing an open workspace", () => {
    renderWorkspace(draftInfo(), { view: foldView(THREAD) });
    expect(screen.getByTestId("authoring-workspace")).toBeTruthy();
    act(() => {
      deliverServerMessageForTests({ type: "draft.removed", draftId: "triage" });
    });
    expect(screen.queryByTestId("authoring-workspace")).toBeNull();
    expect(screen.queryByTestId("drafts-section")).toBeNull();
    expect(useAppStore.getState().draftViews.triage).toBeUndefined();
    expect(useAppStore.getState().openDraftId).toBeUndefined();
  });

  test("a working draft refuses Delete, naming which activity runs", () => {
    seed({ drafts: { triage: draftInfo({ activity: "compiling", state: "compiling" }) } });
    render(<LibrarySurface />);
    fireEvent.click(screen.getByTestId("draft-delete-triage"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByTestId("draft-row-error-triage").textContent).toBe(
      "Delete waits: the draft's compile is running",
    );
    expect(commandMock).not.toHaveBeenCalledWith("draft.delete", expect.anything());
  });
});

describe("playbook-library-52: the workspace replaces the list", () => {
  test("the header carries the way back, the id, and the chip; returning ends nothing", () => {
    renderWorkspace(draftInfo(), { view: foldView(THREAD) });
    expect(screen.queryByTestId("playbook-card-code")).toBeNull();
    const header = screen.getByTestId("authoring-workspace").querySelector("header")!;
    expect(screen.getByTestId("workspace-back").textContent).toContain("Playbooks");
    expect(header.textContent).toContain("triage");
    expect(within(header).getByTestId("draft-chip").textContent).toBe("Draft");
    // Both forms of the divider stand: the rule beside the panes and
    // the grip between them once they stack (DR-030, DR-041 §9).
    const rule = screen.getByTestId("authoring-divider");
    expect(rule.getAttribute("aria-orientation")).toBe("vertical");
    const grip = screen.getByTestId("authoring-grip");
    expect(grip.getAttribute("aria-orientation")).toBe("horizontal");
    expect(grip.getAttribute("aria-label")).toBe("Resize the conversation pane");
    fireEvent.keyDown(rule, { key: "ArrowRight" });
    fireEvent.keyDown(grip, { key: "ArrowUp" });
    // Both are app preferences (playbook-library-52): the store keeps
    // them and hands them back on the next launch.
    expect(useAppStore.getState().draftSplit).toBe(47);
    expect(useAppStore.getState().draftStackSplit).toBe(53);
    // The tab strip in order, with Compile at its end.
    expect(screen.getAllByRole("tab").map((entry) => entry.getAttribute("aria-label"))).toEqual([
      "Source",
      "Gears",
      "Machine",
      "Register",
    ]);
    expect(screen.getByTestId("compile-button").textContent).toBe("Compile");

    fireEvent.click(screen.getByTestId("workspace-back"));
    expect(screen.getByTestId("playbook-card-code")).toBeTruthy();
    expect(commandMock).not.toHaveBeenCalledWith("unsubscribe", expect.anything());
    expect(commandMock).not.toHaveBeenCalledWith("draft.abort", expect.anything());
    // The transcript stays for the next open.
    expect(useAppStore.getState().draftViews.triage).toBeTruthy();
  });

  test("every control in the header, tab strip, band, and action row holds the 14-character budget", async () => {
    const states: [DraftInfo, string[] | undefined][] = [
      [draftInfo({ state: "no-source", firstLine: null }), undefined],
      [draftInfo({ activity: "turn", queued: ["later"] }), undefined],
      [
        draftInfo({ activity: "compiling", state: "compiling", compile: { at: now, by: "boss", outcome: "running" } }),
        ["→ normalize (writing a)"],
      ],
      [
        draftInfo({ state: "failed", compile: { at: now, by: "agent", outcome: "failed", phase: "gears2fsm", output: "boom" } }),
        undefined,
      ],
      [COMPILED, undefined],
    ];
    for (const [draft, lines] of states) {
      cleanup();
      renderWorkspace(draft, { view: foldView(THREAD), lines });
      const scopes = [
        screen.getByTestId("authoring-workspace").querySelector("header")!,
        screen.getByRole("tablist"),
        screen.queryByTestId("compile-band"),
        screen.getByTestId("composer-box"),
      ].filter((scope): scope is HTMLElement => scope !== null);
      for (const scope of scopes) {
        for (const control of Array.from(scope.querySelectorAll("button"))) {
          expect(control.textContent!.trim().length, `${draft.state}: ${control.textContent}`).toBeLessThanOrEqual(14);
        }
      }
    }
  });
});

describe("playbook-library-57/59/60: the right pane by the draft's state", () => {
  test("no source: the compiled tabs and Compile stand disabled with their reasons", () => {
    renderWorkspace(draftInfo({ state: "no-source", firstLine: null }), { source: null });
    for (const name of ["Gears", "Machine", "Register"]) {
      expect(tab(name).disabled).toBe(true);
      expect(tab(name).title).toBe("Compiles first");
    }
    const compile = screen.getByTestId("compile-button") as HTMLButtonElement;
    expect(compile.disabled).toBe(true);
    expect(compile.title).toBe("No source yet");
    expect(screen.getByTestId("source-empty").textContent).toContain("the agent writes triage.md here as you talk");
    expect(screen.getByTestId("source-paste").textContent).toBe("Paste");
    expect(screen.queryByTestId("compile-band")).toBeNull();
  });

  test("a draft with a source compiles; a turn and a compile hold it with their reasons", async () => {
    renderWorkspace(draftInfo());
    const compile = () => screen.getByTestId("compile-button") as HTMLButtonElement;
    expect(compile().disabled).toBe(false);
    expect(screen.getByTestId("tab-dot-source")).toBeTruthy();
    fireEvent.click(compile());
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("draft.compile", { draftId: "triage" }, { timeoutMs: 0 }),
    );

    act(() => {
      deliverServerMessageForTests({ type: "draft.state", draft: draftInfo({ activity: "turn" }) });
    });
    expect(compile().disabled).toBe(true);
    expect(compile().title).toBe("Waits for the reply");

    act(() => {
      deliverServerMessageForTests({
        type: "draft.state",
        draft: draftInfo({ activity: "compiling", state: "compiling", compile: { at: now, by: "agent", outcome: "running" } }),
      });
    });
    expect(compile().textContent).toBe("Compiling…");
    expect(compile().disabled).toBe(true);
    // The chip wears the running mark, whose word is read, not seen.
    expect(screen.getByTestId("draft-chip").textContent).toBe("runningCompiling");
    expect(screen.getByTestId("compile-band").getAttribute("data-outcome")).toBe("running");
  });

  test("a successful compile fills Gears and Machine, enables Register with a dot, and Changed captions the artifacts", async () => {
    renderWorkspace(COMPILED, { view: foldView(THREAD) });
    await vi.waitFor(() => expect(tab("Gears").disabled).toBe(false));
    expect(tab("Register").disabled).toBe(false);
    expect(screen.getByTestId("tab-dot-register")).toBeTruthy();
    expect(screen.queryByTestId("tab-dot-source")).toBeNull();
    expect(screen.getByTestId("compile-roles").textContent).toBe("roles: Triager, Verifier");

    fireEvent.click(tab("Gears"));
    expect(screen.getByTestId("item-TRIAGE-1")).toBeTruthy();
    expect(screen.getByTestId("stage-box-draft-triage")).toBeTruthy();
    fireEvent.click(tab("Machine"));
    expect(screen.getByTestId("stage-states-draft-triage").textContent).toContain("ready");
    expect(screen.getByTestId("panel-machine").textContent).toContain("xstate");
    expect(screen.queryByTestId("artifact-caption")).toBeNull();

    // Opening Register clears its dot.
    fireEvent.click(tab("Register"));
    expect(screen.queryByTestId("tab-dot-register")).toBeNull();

    // The source changed since: the chip says so and the artifacts are captioned.
    act(() => {
      deliverServerMessageForTests({ type: "draft.state", draft: { ...COMPILED, state: "changed" } });
    });
    expect(screen.getByTestId("draft-chip").textContent).toBe("Changed");
    fireEvent.click(tab("Gears"));
    expect(screen.getByTestId("artifact-caption").textContent).toBe("from the compile before this change");
    expect(screen.getByTestId("tab-dot-source")).toBeTruthy();
  });

  test("an interrupted compile says so with Compile enabled; a failure after a good compile keeps the last artifacts", async () => {
    renderWorkspace(
      draftInfo({ state: "interrupted", compile: { at: now - HOUR, by: "boss", outcome: "interrupted" } }),
    );
    expect(screen.getByTestId("draft-chip").textContent).toBe("Interrupted");
    expect(screen.getByTestId("compile-interrupted").textContent).toContain("Compile interrupted when Spex closed");
    expect((screen.getByTestId("compile-button") as HTMLButtonElement).disabled).toBe(false);
    expect(commandMock).not.toHaveBeenCalledWith("draft.send", expect.anything());

    cleanup();
    renderWorkspace(
      draftInfo({ state: "failed", failures: 1, compile: { at: now - 60_000, by: "agent", outcome: "failed", phase: "gears2fsm", output: "result 'labeled' declared twice" } }),
    );
    await vi.waitFor(() => expect(tab("Gears").disabled).toBe(false));
    expect(tab("Register").disabled).toBe(true);
    fireEvent.click(tab("Machine"));
    expect(screen.getByTestId("artifact-caption").textContent).toBe("from the last good compile");
  });

  test("a failure with no good compile behind it keeps the compiled tabs disabled", async () => {
    artifactsAvailable = false;
    renderWorkspace(
      draftInfo({ state: "failed", compile: { at: now - 60_000, by: "boss", outcome: "failed", phase: "text2gears", output: "bad" } }),
    );
    await vi.waitFor(() => expect(commandMock).toHaveBeenCalledWith("draft.artifacts", { draftId: "triage" }));
    expect(tab("Gears").disabled).toBe(true);
    expect(tab("Machine").title).toBe("Compiles first");
  });
});

describe("playbook-library-57/58: the compile band", () => {
  test("phases in human words with the compiler's ids in the tooltips, the last-output clock, the log, Cancel, and who asked", async () => {
    const t = now - 5 * 60_000;
    renderWorkspace(
      draftInfo({ activity: "compiling", state: "compiling", compile: { at: t, by: "agent", outcome: "running" } }),
      {
        lines: [
          "running: npx @sublang/slc playbook triage.md",
          "→ normalize (writing triage.playbook/triage.text.md)",
          "✓ normalize wrote triage.playbook/triage.text.md (2s)",
          "→ text2gears (writing triage.playbook/triage.gears.md)",
          "… text2gears still running (30s)",
        ],
        times: [t, t + 1000, t + 3000, t + 3500, t + 33_500],
      },
    );
    const phases = screen.getByTestId("compile-phases");
    // The status word is for the screen reader; the glyph, the label,
    // and the elapsed are what the eye gets. The running phase's span
    // and the last-output age tick from the real clock, so they are
    // read to the second they land on.
    const cells = within(phases)
      .getAllByTestId(/^phase-/)
      .map((entry) => `${entry.textContent!.replace(/running|done|waiting|failed/g, "").replace(/\s+/g, "")}:${entry.getAttribute("data-status")}`);
    expect(cells[0]).toBe("✓Normalize2s:done");
    expect(cells[1]).toMatch(/^Specitems4m5\ds:running$/);
    expect(cells.slice(2)).toEqual([
      "○Optimize:waiting",
      "○Machine:waiting",
      "○Link:waiting",
      "○Package:waiting",
    ]);
    expect(screen.getByTestId("phase-text2gears").title).toContain("text2gears");
    // The heartbeat moved the clock: silence reads as alive (DR-010 §5).
    expect(screen.getByTestId("last-output").textContent).toMatch(/^last output 4m 2\ds ago$/);
    expect(screen.getByTestId("compile-by").textContent).toBe("asked by the agent");
    expect(screen.getByTestId("compile-log").textContent).toContain("Show log");
    fireEvent.click(screen.getByTestId("compile-cancel"));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("compile.abort", { playbookId: "triage" }),
    );
  });

  test("a failed phase stands red with its output open and the thread's caption", () => {
    const view = foldView([
      ...THREAD,
      rec(10, { type: "captain_status", turnId: null, timestamp: t0 + 9, message: "◇ Compile failed at Machine — sent to the agent" }),
    ]);
    renderWorkspace(
      draftInfo({ state: "failed", failures: 1, compile: { at: now - 60_000, by: "agent", outcome: "failed", phase: "gears2fsm", output: "result 'labeled' declared twice in TRIAGE-2" } }),
      {
        view,
        lines: [
          "→ gears2fsm (writing triage.playbook/triage.fsm.ts)",
          "✗ gears2fsm failed at triage.playbook/triage.fsm.ts (6m40s)",
          "result 'labeled' declared twice in TRIAGE-2",
        ],
      },
    );
    const failed = screen.getByTestId("phase-gears2fsm");
    expect(failed.getAttribute("data-status")).toBe("failed");
    expect(failed.className).toContain("text-red-600");
    expect(failed.textContent).toContain("Machine");
    expect(failed.textContent).toContain("6m40s");
    expect(screen.getByTestId("compile-output").textContent).toContain("declared twice in TRIAGE-2");
    expect(screen.getByTestId("compile-caption").textContent).toBe("sent to the agent");
    expect(screen.getByTestId("draft-chip").textContent).toBe("Failed");
  });

  test("three failures in a row end the relay and the band says so; a restored failure draws its one phase", () => {
    renderWorkspace(
      draftInfo({ state: "failed", failures: 3, compile: { at: now - 60_000, by: "boss", outcome: "failed", phase: "text2gears", output: "✗ text2gears failed\nResults: bullet is not an identifier" } }),
    );
    expect(screen.getByTestId("phase-text2gears").textContent).toContain("Spec items");
    expect(screen.getByTestId("compile-output").textContent).toContain("not an identifier");
    expect(screen.getByTestId("compile-caption").textContent).toBe("three in a row — tell the agent how to proceed");
  });

  test("the compiler's questions open beneath the phase with their reasons and choices", () => {
    renderWorkspace(
      draftInfo({
        state: "failed",
        failures: 1,
        compile: {
          at: now - 60_000,
          by: "agent",
          outcome: "failed",
          phase: "text2gears",
          questions: [
            { id: "q1", question: "Does Verifier apply labels or only propose them?", reason: "The ending is ambiguous.", evidence: "TRIAGE-2: 'proposes' and 'applies'", choices: ["applies", "proposes"] },
          ],
        },
      }),
    );
    const questions = screen.getByTestId("compile-questions");
    expect(questions.textContent).toContain("Does Verifier apply labels");
    expect(questions.textContent).toContain("The ending is ambiguous.");
    expect(questions.textContent).toContain("proposes");
  });
});

describe("playbook-library-53: the conversation pane", () => {
  test("bubbles, tool cards, directive cards, system lines, and the system turn in record order", () => {
    renderWorkspace(COMPILED, { view: foldView(PROPOSAL_THREAD) });
    const thread = screen.getByTestId("draft-thread");
    expect(within(thread).getByTestId("boss-bubble").textContent).toBe("I want a playbook that triages issues");
    expect(within(thread).getByTestId("tool-subject-3").textContent).toBe("triage.md");
    const cards = within(thread).getAllByTestId("directive-card");
    expect(cards.map((card) => card.getAttribute("data-kind"))).toEqual(["compile", "register"]);
    expect(cards[0].textContent).toBe("Asked to compile");
    expect(cards[1].textContent).toContain("Proposed registration");
    expect(cards[1].textContent).toContain("/triage");
    expect(cards[1].textContent).toContain("Triager");
    expect(cards[1].textContent).toContain("dev.triager");
    // The fence itself never shows as text.
    expect(thread.textContent).not.toContain("```spex");
    expect(thread.textContent).not.toContain("kind: compile");
    // A block Spex could not read stays as code with the caption.
    const malformed = within(thread).getByTestId("directive-malformed");
    expect(malformed.textContent).toContain("kind: deploy");
    expect(malformed.textContent).toContain("Spex could not read this block");
    // The system turn reads as a ◇ line, its message behind a fold.
    const turn = within(thread).getByTestId("system-turn");
    expect(turn.textContent).toContain("◇ Spex: The compile of triage succeeded; the roles are Triager, Verifier.");
    expect(turn.textContent).toContain("Show the message");
    expect(within(thread).queryAllByTestId("boss-bubble")).toHaveLength(1);
    // The compile's line, in order after the reply.
    const lines = within(thread).getAllByTestId("system-line").map((line) => line.textContent);
    expect(lines).toContain("◇ Compiling — asked by the agent");
    expect(lines).toContain("◇ Compiled — roles: Triager, Verifier");
    const compileLine = within(thread).getAllByTestId("system-line").find((line) => line.textContent === "◇ Compiling — asked by the agent")!;
    expect(cards[0].compareDocumentPosition(compileLine) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(thread).getAllByTestId("player-result")[0].textContent).toBe("✓ finished");
    // Open Register lands on the tab.
    fireEvent.click(within(cards[1]).getByTestId("open-register"));
    expect(tab("Register").getAttribute("aria-selected")).toBe("true");
  });

  test("while a turn runs the header wears the running mark and the ticking span", () => {
    const view = foldView(THREAD.slice(0, 5));
    renderWorkspace(draftInfo({ activity: "turn" }), { view });
    expect(screen.getByTestId("draft-running").getAttribute("data-running")).toBe("true");
    expect(screen.getByTestId("draft-working").textContent).toMatch(/^working · \d+m/);
    expect(screen.queryByTestId("draft-starters")).toBeNull();
  });

  test("an unreadable transcript is a scoped diagnostic in place of the thread", () => {
    renderWorkspace(draftInfo(), {
      view: { ...foldView([]), loadError: "The conversation could not be loaded: records.jsonl is not JSON" },
    });
    expect(screen.getByTestId("draft-load-error").textContent).toContain("records.jsonl is not JSON");
    expect(screen.getByTestId("source-markdown")).toBeTruthy();
  });
});

describe("playbook-library-54: the composer", () => {
  test("idle: Send, the placeholder, the caption, the starter chips, and Enter sends", async () => {
    renderWorkspace(draftInfo({ state: "no-source", firstLine: null }), { source: null });
    const field = screen.getByTestId("draft-composer") as HTMLTextAreaElement;
    expect(field.placeholder).toBe("Describe the playbook…");
    expect(screen.getByTestId("composer-caption").textContent).toBe("Enter sends");
    expect(screen.getByTestId("draft-send").textContent).toBe("Send");
    expect(screen.queryByTestId("draft-abort")).toBeNull();
    const starters = screen.getByTestId("draft-starters");
    expect(starters.textContent).toContain("Tell the agent what the playbook does, who does what, and when it is done");
    const chips = within(starters).getAllByTestId("starter-chip");
    expect(chips.map((chip) => chip.textContent)).toEqual([
      "Describe a workflow",
      "Adapt a SKILL.md",
      "Show me an example",
    ]);
    fireEvent.click(chips[1]);
    expect(field.value).toBe("Adapt a SKILL.md");
    expect(commandMock).not.toHaveBeenCalledWith("draft.send", expect.anything());
    fireEvent.change(field, { target: { value: "Triage issues into labels" } });
    fireEvent.keyDown(field, { key: "Enter" });
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("draft.send", { draftId: "triage", text: "Triage issues into labels" }),
    );
    await vi.waitFor(() => expect(field.value).toBe(""));
  });

  test("a turn: Send next, its placeholder, Abort, and the queue frame", async () => {
    renderWorkspace(draftInfo({ activity: "turn", queued: ["Also cite the label definitions"] }), { view: foldView(THREAD.slice(0, 5)) });
    const field = screen.getByTestId("draft-composer") as HTMLTextAreaElement;
    expect(field.placeholder).toBe("Sends after the reply…");
    expect(screen.getByTestId("draft-send").textContent).toBe("Send next");
    const queue = screen.getByTestId("draft-queue");
    expect(queue.textContent).toContain("Also cite the label definitions");
    expect(queue.textContent).toContain("sends after the reply");
    fireEvent.click(screen.getByTestId("draft-abort"));
    expect(screen.getByTestId("draft-abort").textContent).toBe("Aborting…");
    await vi.waitFor(() => expect(commandMock).toHaveBeenCalledWith("draft.abort", { draftId: "triage" }));
    // A canceled turn leaves the queue standing.
    expect(screen.getByTestId("draft-queue").textContent).toContain("Also cite the label definitions");
  });

  test("a compile: the placeholder names it and the queue says so", () => {
    renderWorkspace(
      draftInfo({ activity: "compiling", state: "compiling", queued: ["one more thing"], compile: { at: now, by: "boss", outcome: "running" } }),
      { view: foldView(THREAD) },
    );
    expect((screen.getByTestId("draft-composer") as HTMLTextAreaElement).placeholder).toBe("Sends after the compile…");
    expect(screen.getByTestId("draft-send").textContent).toBe("Send next");
    expect(screen.getByTestId("draft-queue").textContent).toContain("sends after the compile");
    expect(screen.queryByTestId("draft-abort")).toBeNull();
  });

  test("a not-ready agent disables Send with the requirement in the caption", () => {
    renderWorkspace(
      draftInfo({ player: "dev.reviewer", agent: { adapter: "codex", model: "gpt-6-astra" }, ready: false }),
      { view: foldView(THREAD) },
    );
    fireEvent.change(screen.getByTestId("draft-composer"), { target: { value: "hello" } });
    expect((screen.getByTestId("draft-send") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("composer-caption").textContent).toBe("set OPENAI_API_KEY or run `codex login`");
  });

  test("a refused dispatch keeps the text and shows the refusal; the draft survives leaving", async () => {
    commandMock.mockImplementation(async (type: string) => {
      if (type === "draft.send") throw new Error("the draft is being deleted");
      if (type === "draft.list") return Object.values(useAppStore.getState().drafts);
      if (type === "compile.check") return { node: { ok: true, version: "v23.6.0", command: "node" }, slc: { ok: true, command: ["npx"] } };
      return null;
    });
    renderWorkspace(draftInfo(), { view: foldView(THREAD) });
    const field = screen.getByTestId("draft-composer") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "keep me" } });
    fireEvent.click(screen.getByTestId("draft-send"));
    await vi.waitFor(() => expect(screen.getByTestId("draft-error").textContent).toContain("the draft is being deleted"));
    expect(field.value).toBe("keep me");
    fireEvent.click(screen.getByTestId("workspace-back"));
    fireEvent.click(screen.getByTestId("draft-open-triage"));
    await vi.waitFor(() => expect(screen.getByTestId("draft-composer")).toBeTruthy());
    expect((screen.getByTestId("draft-composer") as HTMLTextAreaElement).value).toBe("keep me");
  });
});

describe("playbook-library-55: the agent picker", () => {
  test("the chip reads Captain, the picker offers the roster, and a choice is stored", async () => {
    renderWorkspace(draftInfo(), { view: foldView(THREAD) });
    const chip = screen.getByTestId("draft-agent") as HTMLButtonElement;
    expect(chip.textContent).toContain("Captain");
    expect(chip.disabled).toBe(false);
    fireEvent.click(chip);
    const picker = screen.getByTestId("agent-picker");
    expect(picker.getAttribute("role")).toBe("menu");
    expect(
      within(picker)
        .getAllByRole("menuitemradio")
        .map((option) => option.textContent!.split(/claude|codex/)[0].trim()),
    ).toEqual(["Captain", "dev.coder", "dev.reviewer"]);
    expect(within(picker).getByTestId("agent-option-captain").getAttribute("aria-checked")).toBe("true");
    // Readiness rides each option's chip.
    expect(within(picker).getByLabelText("dev.reviewer: codex · gpt-6-astra (not ready)")).toBeTruthy();
    fireEvent.click(within(picker).getByTestId("agent-option-dev.reviewer"));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("draft.player.set", { draftId: "triage", playerId: "dev.reviewer" }),
    );
    await vi.waitFor(() => expect(screen.queryByTestId("agent-picker")).toBeNull());
    expect(screen.getByTestId("draft-agent").textContent).toContain("dev.reviewer");
  });

  test("the picker is disabled while a turn runs, its tooltip saying so", () => {
    renderWorkspace(draftInfo({ activity: "turn" }), { view: foldView(THREAD.slice(0, 5)) });
    const chip = screen.getByTestId("draft-agent") as HTMLButtonElement;
    expect(chip.disabled).toBe(true);
    expect(chip.title).toBe("Waits for the reply — the agent switches on the next turn");
  });
});

describe("playbook-library-56: the Source tab", () => {
  test("renders the markdown with who changed it and when; Edit saves under the token", async () => {
    renderWorkspace(draftInfo());
    expect(screen.getByTestId("source-caption").textContent).toBe("Updated 3m ago by the agent");
    expect(within(screen.getByTestId("source-markdown")).getByText("label").tagName).toBe("STRONG");
    fireEvent.click(screen.getByTestId("source-edit"));
    const text = screen.getByTestId("editor-text") as HTMLTextAreaElement;
    expect(text.value).toBe(SOURCE.markdown);
    fireEvent.change(text, { target: { value: "# Triage\n\nRewritten." } });
    fireEvent.click(screen.getByTestId("editor-save"));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("draft.source.write", {
        draftId: "triage",
        content: "# Triage\n\nRewritten.",
        baseVersion: "v1",
      }),
    );
    await vi.waitFor(() => expect(screen.getByTestId("source-markdown").textContent).toContain("Rewritten."));
    expect(screen.getByTestId("source-caption").textContent).toBe("Updated just now by you");
  });

  test("a changed file is a conflict offering Reload or Overwrite", async () => {
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
      if (type === "draft.source.write" && params?.baseVersion !== undefined) {
        throw Object.assign(new Error("the source changed since it was read"), { code: "conflict" });
      }
      return base(type, params);
    });
    renderWorkspace(draftInfo());
    fireEvent.click(screen.getByTestId("source-edit"));
    fireEvent.change(screen.getByTestId("editor-text"), { target: { value: "# Triage\n\nMine." } });
    fireEvent.click(screen.getByTestId("editor-save"));
    const strip = await screen.findByTestId("editor-conflict");
    expect(within(strip).getByTestId("editor-reload")).toBeTruthy();
    fireEvent.click(within(strip).getByTestId("editor-overwrite"));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("draft.source.write", { draftId: "triage", content: "# Triage\n\nMine." }),
    );
  });

  test("Save waits for the reply while a turn runs; Edit and Paste wait while compiling", () => {
    renderWorkspace(draftInfo({ activity: "turn" }));
    fireEvent.click(screen.getByTestId("source-edit"));
    fireEvent.change(screen.getByTestId("editor-text"), { target: { value: "changed" } });
    const save = screen.getByTestId("editor-save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(save.title).toBe("Waits for the reply");

    cleanup();
    renderWorkspace(draftInfo({ activity: "compiling", state: "compiling", compile: { at: now, by: "boss", outcome: "running" } }));
    expect((screen.getByTestId("source-edit") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("source-edit") as HTMLButtonElement).title).toBe("Compiling");
    expect((screen.getByTestId("source-paste") as HTMLButtonElement).title).toBe("Compiling");
  });

  test("Paste writes the text, or the picked file's path over it", async () => {
    renderWorkspace(draftInfo({ state: "no-source", firstLine: null }), { source: null });
    fireEvent.click(screen.getByTestId("source-paste"));
    const use = () => screen.getByTestId("paste-use") as HTMLButtonElement;
    expect(use().disabled).toBe(true);
    expect(use().textContent).toBe("Use as source");
    fireEvent.change(screen.getByTestId("paste-text"), { target: { value: "# Secaudit\n\nRoles:\n- Auditor" } });
    fireEvent.click(use());
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("draft.source.write", { draftId: "triage", content: "# Secaudit\n\nRoles:\n- Auditor" }),
    );
    await vi.waitFor(() => expect(screen.getByTestId("source-view")).toBeTruthy());
    expect(screen.getByTestId("source-caption").textContent).toBe("Updated just now by you");

    fireEvent.click(screen.getByTestId("source-paste"));
    fireEvent.change(screen.getByTestId("paste-path"), { target: { value: "/tmp/skill.md" } });
    expect(screen.getByTestId("paste-caption").textContent).toBe("The file is copied in as the draft's source");
    fireEvent.click(use());
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("draft.source.write", { draftId: "triage", sourcePath: "/tmp/skill.md" }),
    );
  });

  test("Pick file stands only where the native bridge offers it", () => {
    const pickFile = vi.fn(async () => "/Users/dev/skill.md");
    window.spexNative = { pickDirectory: async () => null, pickFile };
    try {
      renderWorkspace(draftInfo({ state: "no-source", firstLine: null }), { source: null });
      fireEvent.click(screen.getByTestId("source-paste"));
      expect(screen.getByTestId("paste-pick").textContent).toBe("Pick file");
      fireEvent.click(screen.getByTestId("paste-pick"));
      return vi.waitFor(() =>
        expect((screen.getByTestId("paste-path") as HTMLInputElement).value).toBe("/Users/dev/skill.md"),
      );
    } finally {
      delete window.spexNative;
    }
  });
});

describe("playbook-library-61: the Register tab", () => {
  test("prefills from the derived defaults, then the proposal, with the Boss's edits winning", async () => {
    renderWorkspace(COMPILED, { view: foldView(THREAD) });
    await vi.waitFor(() => expect(tab("Register").disabled).toBe(false));
    fireEvent.click(tab("Register"));
    expect((screen.getByTestId("register-command") as HTMLInputElement).value).toBe("triage");
    expect((screen.getByTestId("register-intent") as HTMLInputElement).value).toBe(
      "When an issue arrives, Captain shall prompt Triager to **label** it.",
    );
    const triager = screen.getByTestId("register-player-Triager") as HTMLSelectElement;
    expect(triager.value).toBe("new:dev.triager");
    expect(Array.from(triager.options).map((option) => option.textContent)).toEqual([
      "dev.coder — claude-opus-5 @ high",
      "dev.reviewer — gpt-6-astra",
      "New player dev.triager",
    ]);
    expect(screen.getByTestId("register-form").textContent).toContain("Prefilled from the source and the compiled roles");

    // The Boss edits the intent, then the proposal lands: it fills what
    // the Boss left alone and never the edit.
    fireEvent.change(screen.getByTestId("register-intent"), { target: { value: "My own intent" } });
    act(() => {
      deliverServerMessageForTests({
        type: "draft.state",
        draft: {
          ...COMPILED,
          proposal: { command: "sort", intent: "Triage a new issue into labels", players: { Triager: "dev.triager", Verifier: "dev.reviewer", Auditor: "dev.qa" } },
        },
      });
    });
    expect((screen.getByTestId("register-intent") as HTMLInputElement).value).toBe("My own intent");
    expect((screen.getByTestId("register-command") as HTMLInputElement).value).toBe("sort");
    expect((screen.getByTestId("register-player-Verifier") as HTMLSelectElement).value).toBe("dev.reviewer");
    expect(screen.getByTestId("register-shared-Verifier").textContent).toBe("also code.reviewer");
    expect(screen.getByTestId("register-form").textContent).toContain("Prefilled from the agent's proposal — edit anything");
    // A role the entry lacks stands as a mismatch, the derived roles authoritative.
    expect(screen.getByTestId("register-mismatch").textContent).toContain("Auditor");
    expect(screen.getByTestId("register-mismatch").textContent).toContain("The compiled roles stand: Triager, Verifier.");
    expect(screen.queryByTestId("register-role-Auditor")).toBeNull();
  });

  test("Register writes the bindings and the new players, then the list opens with the card in view", async () => {
    renderWorkspace(
      { ...COMPILED, proposal: { command: "triage", intent: "Triage a new issue", players: { Triager: "dev.triager", Verifier: "dev.reviewer" } } },
      { view: foldView(THREAD) },
    );
    await vi.waitFor(() => expect(tab("Register").disabled).toBe(false));
    fireEvent.click(tab("Register"));
    // The new lane's block is the draft's agent, tunable in place.
    const row = screen.getByTestId("register-role-Triager");
    expect(within(row).getByLabelText("Triager: claude · claude-opus-5 @ high (ready)")).toBeTruthy();
    fireEvent.click(within(row).getByTestId("register-configure-Triager"));
    const popover = screen.getByTestId("agent-popover");
    fireEvent.click(within(popover).getByTestId("agent-adapter-codex"));
    await within(popover).findByText("Model list unavailable: Fixture");
    fireEvent.change(within(popover).getByTestId("agent-model"), { target: { value: "gpt-6-astra" } });
    fireEvent.click(within(popover).getByTestId("agent-save"));
    await vi.waitFor(() => expect(screen.queryByTestId("agent-popover")).toBeNull());

    const submit = () => screen.getByTestId("register-submit") as HTMLButtonElement;
    expect(submit().disabled).toBe(false);
    let resolve!: (value: ConfigState) => void;
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) =>
      type === "draft.register" ? new Promise<ConfigState>((r) => (resolve = r)) : base(type, params),
    );
    fireEvent.click(submit());
    await vi.waitFor(() => expect(submit().textContent).toBe("Registering…"));
    expect(commandMock).toHaveBeenCalledWith("draft.register", {
      draftId: "triage",
      command: "triage",
      intent: "Triage a new issue",
      bindings: { Triager: "dev.triager", Verifier: "dev.reviewer" },
      newPlayers: { "dev.triager": { adapter: "codex", model: "gpt-6-astra", permissions: { mode: "auto" } } },
    });
    const registered: ConfigState = {
      ...CONFIG_STATE,
      summary: {
        ...CONFIG_STATE.summary,
        playbooks: [
          ...CONFIG_STATE.summary.playbooks,
          { id: "triage", from: "./playbooks/triage/triage.registry.mjs", command: "triage", intent: "Triage a new issue", roles: { Triager: { playerId: "dev.triager", display: "gpt-6-astra" } } },
        ],
      },
    };
    await act(async () => {
      resolve(registered);
    });
    await vi.waitFor(() => expect(screen.getByTestId("playbook-card-triage")).toBeTruthy());
    expect(screen.queryByTestId("drafts-section")).toBeNull();
    expect(screen.getByTestId("playbook-card-triage").className).toContain("ring-2");
    expect(screen.getByTestId("registered-note").textContent).toContain("restarted to use it");
    expect(screen.getByTestId("library-live").textContent).toBe("Registered /triage");
  });

  test("a refusal names the rule inline and leaves the form standing; a busy draft holds Register", async () => {
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
      if (type === "draft.register") throw new Error("player dev.triager collides with a reserved id");
      return base(type, params);
    });
    renderWorkspace(COMPILED, { view: foldView(THREAD) });
    await vi.waitFor(() => expect(tab("Register").disabled).toBe(false));
    fireEvent.click(tab("Register"));
    fireEvent.click(screen.getByTestId("register-submit"));
    await vi.waitFor(() => expect(screen.getByTestId("register-error").textContent).toContain("collides"));
    expect(screen.getByTestId("register-form")).toBeTruthy();
    expect((screen.getByTestId("register-command") as HTMLInputElement).value).toBe("triage");

    act(() => {
      deliverServerMessageForTests({ type: "draft.state", draft: { ...COMPILED, activity: "turn" } });
    });
    const submit = screen.getByTestId("register-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(submit.title).toBe("Waits for the reply");
  });

  test("an empty intent holds Register until the Boss writes one", async () => {
    renderWorkspace(COMPILED, { view: foldView(THREAD), source: { ...SOURCE, markdown: "# Triage\n\nRoles:\n- Triager\n- Verifier" } });
    await vi.waitFor(() => expect(tab("Register").disabled).toBe(false));
    fireEvent.click(tab("Register"));
    expect((screen.getByTestId("register-intent") as HTMLInputElement).value).toBe("");
    expect((screen.getByTestId("register-submit") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("register-intent"), { target: { value: "Sort issues" } });
    expect((screen.getByTestId("register-submit") as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("playbook-library-35: the example opens a draft in paste mode", () => {
  test("Prefill creates the demo draft and places the normalized text without writing", async () => {
    seed();
    render(<LibrarySurface />);
    expect(screen.getByTestId("example-prefill").textContent).toBe("Prefill");
    fireEvent.click(screen.getByTestId("example-prefill"));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("draft.create", { draftId: SLC_DEMO.playbookId }),
    );
    await vi.waitFor(() => expect(screen.getByTestId("source-paste")).toBeTruthy());
    expect((screen.getByTestId("paste-text") as HTMLTextAreaElement).value).toBe(SLC_DEMO.stages.normalized);
    expect((screen.getByTestId("paste-path") as HTMLInputElement).value).toBe("");
    expect(commandMock).not.toHaveBeenCalledWith("draft.source.write", expect.anything());
    expect(commandMock).not.toHaveBeenCalledWith("draft.compile", expect.anything(), expect.anything());
  });
});

describe("playbook-library-62: restore on open", () => {
  test("opening a draft replays its records and source, and the live stream continues", async () => {
    const restored = draftInfo({ state: "failed", failures: 1, compile: { at: now - HOUR, by: "agent", outcome: "failed", phase: "gears2fsm", output: "boom" } });
    seed({ drafts: { triage: restored } });
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) =>
      type === "draft.open"
        ? { draft: restored, source: { markdown: "# Triage restored", version: "v9", mtime: now - HOUR }, records: THREAD }
        : base(type, params),
    );
    render(<LibrarySurface />);
    fireEvent.click(screen.getByTestId("draft-open-triage"));
    await vi.waitFor(() => expect(screen.getByTestId("boss-bubble")).toBeTruthy());
    expect(commandMock).toHaveBeenCalledWith("draft.open", { draftId: "triage", afterSeq: 0 });
    expect(screen.getByTestId("source-markdown").textContent).toContain("Triage restored");
    // A restored source says only when it changed.
    expect(screen.getByTestId("source-caption").textContent).toBe("Updated 1h ago");
    expect(screen.getByTestId("compile-output").textContent).toContain("boom");
    expect(screen.getAllByTestId("directive-card")).toHaveLength(1);

    act(() => {
      deliverServerMessageForTests({
        type: "draft.record",
        draftId: "triage",
        seq: 10,
        record: { type: "captain_status", turnId: null, timestamp: now, message: "◇ Compile failed at Machine — sent to the agent" } as unknown as TmuxPlayRecord,
      });
      deliverServerMessageForTests({ type: "draft.source", draftId: "triage", markdown: "# Triage\n\nFixed.", version: "v10", mtime: now });
    });
    expect(screen.getAllByTestId("system-line").map((line) => line.textContent)).toContain(
      "◇ Compile failed at Machine — sent to the agent",
    );
    expect(screen.getByTestId("compile-caption").textContent).toBe("sent to the agent");
    expect(screen.getByTestId("source-markdown").textContent).toContain("Fixed.");
  });
});
