// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// DR-058/DR-104 authoring coverage over a simulated document: the
// Authoring section and the New playbook field (playbook-library-50/51),
// the workspace's header, tabs, and compile control by the state table
// (playbook-library-52/57/59/60), the conversation's bubbles, cards,
// and running mark (playbook-library-53), the composer's labels and
// queue (playbook-library-54), the agent picker (playbook-library-55),
// the Source tab's path, edit, conflict, and paste paths
// (playbook-library-56), the band's phases, failure and Cancel
// (playbook-library-57/58, playbook-library-30), the Enable tab's
// prefill precedence, mismatch and spex repository
// (playbook-library-61) and its role defaults (playbook-library-88),
// Publish beneath it (playbook-library-93), Delete's confirm
// (playbook-library-63), the example prefill (playbook-library-35),
// an id another project's session takes (playbook-library-98), and
// the 14-character budget on every workspace control (DR-041).

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
  CommandResults,
  ConfigState,
  DraftInfo,
  ReadinessEntry,
  TmuxPlayRecord,
} from "@sublang/spex-core/protocol";
import { OWN_KEY, available, home } from "../fixtures/playbooks.js";

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
  { adapter: "claude", ready: true, usedBy: ["captain"], fastModeSupported: true, subagentModelSupported: true },
  {
    adapter: "codex",
    ready: false,
    requirement: "set OPENAI_API_KEY or run `codex login`",
    usedBy: [],
    fastModeSupported: false, subagentModelSupported: false,
  },
];

/** What the environments export: the project's own `code` playbook,
 * enabled there, and the built-in `review` no config enables. */
function playbookLists(extra: ReturnType<typeof available>[] = []): CommandResults["environment.playbooks"] {
  return {
    project: [
      available({
        id: "code",
        package: "acme/flows",
        version: "2.0.0",
        source: "registry",
        repository: PROJECT_ID,
        roles: ["coder", "reviewer"],
        enabled: ["project"],
        bindings: {
          project: {
            coder: { playerId: "dev.coder", display: "claude-opus-5 @ high" },
            reviewer: { playerId: "dev.reviewer", display: "gpt-6-astra" },
          },
        },
      }),
      available({ id: "review", repository: PROJECT_ID, roles: ["host"] }),
      ...extra,
    ],
    own: [available({ id: "review", roles: ["host"] })],
  };
}

let lists: CommandResults["environment.playbooks"];

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

/** The project whose spex repository holds the drafts (storage-23). */
const PROJECT_ID = "me/demo-spex";
/** The instance the drafts of these tests are held under (core-service-96). */
const INSTANCE = "inst-1";
const PROJECT = {
  id: PROJECT_ID,
  path: "/work/demo",
  name: "demo",
  registeredAt: now - 30 * HOUR,
  repository: { key: PROJECT_ID, name: "demo-spex", group: "me", own: true },
};

function draftInfo(overrides: Partial<DraftInfo> = {}): DraftInfo {
  return {
    id: "triage",
    projectId: PROJECT_ID,
    instance: INSTANCE,
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

/** What "Use a SKILL.md…" places in the composer (playbook-library-84). */
const ADAPT_ASK =
  "Adapt this file into a playbook: keep what it does, name who does what, and say when it is done";

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

function seed(overrides: Partial<ReturnType<typeof useAppStore.getState>> = {}) {
  useAppStore.setState({
    connection: "open",
    configState: CONFIG_STATE,
    readiness: READINESS,
    space: home(),
    playbooksSide: "project",
    playbookLists: undefined,
    environments: {},
    environmentErrors: {},
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
    projects: [PROJECT],
    currentProjectId: PROJECT_ID,
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
  useAppStore.setState({
    loadAgentOptions: async (adapter) => ({
      adapter,
      effortValues: ["high"],
      fastModeSupported: false, subagentModelSupported: adapter === "claude", subagentEffortValues: adapter === "claude" ? ["low", "high"] : [],
      discovery: { status: "unavailable", reason: "Fixture" },
    }),
  });
  commandMock.mockReset();
  lists = playbookLists();
  commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
    const state = useAppStore.getState();
    switch (type) {
      case "compile.check":
        return { node: { ok: true, version: "v23.6.0", command: "node" }, slc: { ok: true, command: ["npx", "@sublang/slc"] } };
      case "environment.playbooks":
        return lists;
      case "environment.get":
        return { repository: String(params?.repository), language: null, requests: {}, packages: [], stale: null, conflicts: null, busy: null, error: null };
      case "playbook.artifacts":
        return { source: null, gears: null, fsm: null, stateIds: null, machine: null, missing: [] };
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

describe("playbook-library-50: the Authoring section", () => {
  test("rows carry the id, the chip, the age, Open, and Delete; the chip's title holds the phase", async () => {
    seed({
      drafts: {
        changelog: { ...COMPILED, id: "changelog" },
        intake: draftInfo({ id: "intake", state: "enabled", compile: { at: now - HOUR, by: "boss", outcome: "ok", roles: ["Triager"] } }),
        triage: draftInfo({
          state: "failed",
          compile: { at: now - 9 * HOUR, by: "agent", outcome: "failed", phase: "gears2fsm", output: "✗ gears2fsm failed" },
        }),
        gone: draftInfo({ id: "gone", sourceMissing: true, firstLine: null }),
        broken: draftInfo({ id: "broken", diagnostic: "/home/local/drafts/broken/draft.json: expected fields v, id, createdAt, touchedAt, queued, failures" }),
        // Another project's session is that project's.
        elsewhere: draftInfo({ id: "elsewhere", projectId: "acme/tools-spex" }),
      },
    });
    render(<LibrarySurface />);
    const section = screen.getByTestId("drafts-section");
    expect(within(section).getByRole("heading").textContent).toBe("Authoring");
    // Between the playbooks and the ways to add a spec package.
    const playbooks = await screen.findByTestId("playbooks-available");
    expect(
      playbooks.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      section.compareDocumentPosition(screen.getByTestId("add-packages")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(section).queryByTestId("draft-row-elsewhere")).toBeNull();
    // An enabled playbook's session stays, its chip saying so.
    expect(within(within(section).getByTestId("draft-row-intake")).getByTestId("draft-chip").textContent).toBe("Enabled");

    const failed = within(section).getByTestId("draft-row-triage");
    const chip = within(failed).getByTestId("draft-chip");
    expect(chip.textContent).toBe("Failed");
    expect(chip.title).toBe("Failed at Machine (gears2fsm), 9h ago");
    expect(within(failed).getByTestId("draft-age-triage").textContent).toBe("9h ago");
    expect(within(failed).getByTestId("draft-open-triage").textContent).toBe("Open");
    expect(within(failed).getByTestId("draft-delete-triage").textContent).toBe("Delete");

    expect(within(within(section).getByTestId("draft-row-changelog")).getByTestId("draft-chip").textContent).toBe("Compiled");

    // A session whose spec package folder is gone offers only Delete.
    const missing = within(section).getByTestId("draft-row-gone");
    expect(within(missing).getByTestId("draft-chip").textContent).toBe("Source missing");
    expect(within(missing).getByTestId("draft-chip").title).toBe(
      "The spec package folder is gone from the working folder; only Delete remains",
    );
    expect(within(missing).queryByTestId("draft-open-gone")).toBeNull();
    expect(within(missing).getByTestId("draft-delete-gone")).toBeTruthy();

    // A draft whose record the core cannot read lists with its
    // diagnostic and offers only Delete (playbook-library-70).
    const damaged = within(section).getByTestId("draft-row-broken");
    expect(within(damaged).getByTestId("draft-row-diagnostic-broken").textContent).toContain("draft.json: expected fields");
    expect(within(damaged).queryByTestId("draft-open-broken")).toBeNull();
    expect(within(damaged).getByTestId("draft-delete-broken")).toBeTruthy();

    // The way to a new one stands at the section's foot.
    expect(within(section).getByTestId("new-playbook")).toBeTruthy();
    expect(screen.queryByTestId("new-playbook-section")).toBeNull();
  });

  test("without a session the section is absent, the empty state names New playbook, and the field stands after the playbooks", async () => {
    lists = { project: [available({ id: "review", repository: PROJECT_ID, roles: ["host"] })], own: [] };
    seed();
    render(<LibrarySurface />);
    expect(screen.queryByTestId("drafts-section")).toBeNull();
    expect((await screen.findByTestId("playbooks-empty")).textContent).toBe(
      "No playbooks enabled yet — enable a built-in below, or make your own with New playbook.",
    );
    const field = screen.getByTestId("new-playbook-section");
    expect(
      screen.getByTestId("playbooks-available").compareDocumentPosition(field) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByTestId("new-playbook-button").textContent).toBe("New playbook");
    expect(screen.getByTestId("new-playbook").textContent).toContain(
      "Lowercase; it names the spec package, the file and the /command — the command can change when you enable it",
    );
  });

  test("your own group's side carries no Authoring section", async () => {
    seed({ drafts: { triage: draftInfo() }, playbooksSide: "own" });
    render(<LibrarySurface />);
    await screen.findByTestId("playbook-card-review");
    expect(screen.queryByTestId("drafts-section")).toBeNull();
    expect(screen.queryByTestId("new-playbook")).toBeNull();
  });
});

describe("playbook-library-51: New playbook asks for the id", () => {
  test("an id outside the Agent Skills name rule, or one an environment's playbook holds, is refused in place", async () => {
    seed();
    render(<LibrarySurface />);
    await screen.findByTestId("playbook-card-code");
    const input = screen.getByTestId("new-playbook-id");
    for (const bad of ["Triage", "tri_age", "-triage", "tri--age", "a".repeat(65)]) {
      fireEvent.change(input, { target: { value: bad } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(screen.getByTestId("new-playbook-error").textContent, bad).toBe(
        "Lowercase letters and digits in words joined by single hyphens, at most 64 characters",
      );
    }
    fireEvent.change(input, { target: { value: "code" } });
    fireEvent.click(screen.getByTestId("new-playbook-button"));
    expect(screen.getByTestId("new-playbook-error").textContent).toBe(
      "code is already a playbook of acme/flows",
    );
    fireEvent.change(input, { target: { value: "review" } });
    fireEvent.click(screen.getByTestId("new-playbook-button"));
    expect(screen.getByTestId("new-playbook-error").textContent).toBe("review is a built-in — enable it instead");
    expect(commandMock).not.toHaveBeenCalledWith("draft.create", expect.anything());
  });

  test("Enter creates the draft and opens its workspace; an existing draft's id opens that draft", async () => {
    seed({ drafts: { changelog: { ...COMPILED, id: "changelog" } } });
    render(<LibrarySurface />);
    const input = screen.getByTestId("new-playbook-id");
    fireEvent.change(input, { target: { value: "triage" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("draft.create", { projectId: PROJECT_ID, draftId: "triage" }),
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
    expect(commandMock).toHaveBeenCalledWith("draft.open", expect.objectContaining({ projectId: PROJECT_ID, draftId: "changelog" }));
  });

  test("a draft is made in the current project's spex repository, else the first registered one's", async () => {
    const other = { ...PROJECT, id: "acme/tools-spex", name: "tools", repository: { key: "acme/tools-spex", name: "tools-spex", group: "acme", own: false } };
    seed({ projects: [PROJECT, other], currentProjectId: "acme/tools-spex" });
    render(<LibrarySurface />);
    const input = screen.getByTestId("new-playbook-id");
    fireEvent.change(input, { target: { value: "triage" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("draft.create", { projectId: "acme/tools-spex", draftId: "triage" }),
    );
    cleanup();

    commandMock.mockClear();
    seed({ projects: [other, PROJECT], currentProjectId: undefined });
    render(<LibrarySurface />);
    const field = screen.getByTestId("new-playbook-id");
    fireEvent.change(field, { target: { value: "intake" } });
    fireEvent.keyDown(field, { key: "Enter" });
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("draft.create", { projectId: "acme/tools-spex", draftId: "intake" }),
    );
  });

  test("with no project registered the field stands disabled and says why", () => {
    seed({ projects: [], currentProjectId: undefined });
    render(<LibrarySurface />);
    const input = screen.getByTestId("new-playbook-id") as HTMLInputElement;
    const button = screen.getByTestId("new-playbook-button") as HTMLButtonElement;
    expect(input.disabled).toBe(true);
    expect(button.disabled).toBe(true);
    expect(screen.getByTestId("new-playbook-caption").textContent).toBe("Add a project first");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(commandMock).not.toHaveBeenCalledWith("draft.create", expect.anything());
  });
});

describe("playbook-library-63: Delete behind the inline confirm", () => {
  test("Keep writes nothing; Delete removes the session, saying its spec package folder stays", async () => {
    seed({ drafts: { triage: draftInfo() } });
    render(<LibrarySurface />);
    fireEvent.click(screen.getByTestId("draft-delete-triage"));
    expect(screen.getByText("Delete this authoring session? Its spec package folder stays.")).toBeTruthy();
    const keep = screen.getByRole("button", { name: "Keep" });
    // The safe default holds focus (DR-010 §4).
    expect(document.activeElement).toBe(keep);
    fireEvent.click(keep);
    expect(commandMock).not.toHaveBeenCalledWith("draft.delete", expect.anything());
    fireEvent.click(screen.getByTestId("draft-delete-triage"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("draft.delete", { projectId: PROJECT_ID, instance: INSTANCE, draftId: "triage" }),
    );
    await vi.waitFor(() => expect(screen.queryByTestId("draft-row-triage")).toBeNull());
    // The folder stays, and the surface says where.
    const note = "Deleted triage; its spec package folder stays at spex-packages/triage";
    expect((await screen.findByTestId("deleted-note")).textContent).toBe(note);
    expect(screen.getByTestId("library-live").textContent).toBe(note);
  });

  test("a removal broadcast drops the draft everywhere, closing an open workspace", () => {
    renderWorkspace(draftInfo(), { view: foldView(THREAD) });
    expect(screen.getByTestId("authoring-workspace")).toBeTruthy();
    act(() => {
      deliverServerMessageForTests({ type: "draft.removed", projectId: PROJECT_ID, draftId: "triage", instance: INSTANCE });
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
      "Delete waits: the session's compile is running",
    );
    expect(commandMock).not.toHaveBeenCalledWith("draft.delete", expect.anything());
  });
});

describe("playbook-library-52: the workspace replaces the list", () => {
  test("the header carries the way back, the id with its spec package, and the chip; returning ends nothing", async () => {
    renderWorkspace(draftInfo({ package: "me/triage" }), { view: foldView(THREAD) });
    expect(screen.queryByTestId("playbook-card-code")).toBeNull();
    const header = screen.getByTestId("authoring-workspace").querySelector("header")!;
    expect(screen.getByTestId("workspace-back").textContent).toContain("Playbooks");
    expect(header.textContent).toContain("triage");
    expect(within(header).getByTestId("workspace-package").textContent).toBe("me/triage");
    expect(within(header).getByTestId("workspace-package").title).toBe("spex-packages/triage");
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
      "Enable",
    ]);
    expect(screen.getByTestId("compile-button").textContent).toBe("Compile");

    fireEvent.click(screen.getByTestId("workspace-back"));
    expect(await screen.findByTestId("playbook-card-code")).toBeTruthy();
    expect(commandMock).not.toHaveBeenCalledWith("unsubscribe", expect.anything());
    expect(commandMock).not.toHaveBeenCalledWith("draft.abort", expect.anything());
    // The transcript stays for the next open.
    expect(useAppStore.getState().draftViews.triage).toBeTruthy();
  });

  test("every control in the header, tab strip, band, and action row holds the 14-character budget", async () => {
    const states: [DraftInfo, string[] | undefined][] = [
      [draftInfo({ state: "no-source", firstLine: null }), undefined],
      [draftInfo({ activity: "turn", queued: [{ text: "later" }] }), undefined],
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
    for (const name of ["Gears", "Machine", "Enable"]) {
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
      expect(commandMock).toHaveBeenCalledWith("draft.compile", { projectId: PROJECT_ID, instance: INSTANCE, draftId: "triage" }, { timeoutMs: 0 }),
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

  test("a successful compile fills Gears and Machine, enables Enable with a dot, and Changed captions the artifacts", async () => {
    renderWorkspace(COMPILED, { view: foldView(THREAD) });
    await vi.waitFor(() => expect(tab("Gears").disabled).toBe(false));
    expect(tab("Enable").disabled).toBe(false);
    expect(screen.getByTestId("tab-dot-enable")).toBeTruthy();
    expect(screen.queryByTestId("tab-dot-source")).toBeNull();
    expect(screen.getByTestId("compile-roles").textContent).toBe("roles: Triager, Verifier");

    fireEvent.click(tab("Gears"));
    expect(screen.getByTestId("item-TRIAGE-1")).toBeTruthy();
    expect(screen.getByTestId("stage-box-draft-triage")).toBeTruthy();
    fireEvent.click(tab("Machine"));
    expect(screen.getByTestId("stage-states-draft-triage").textContent).toContain("ready");
    expect(screen.getByTestId("panel-machine").textContent).toContain("xstate");
    expect(screen.queryByTestId("artifact-caption")).toBeNull();

    // Opening Enable clears its dot.
    fireEvent.click(tab("Enable"));
    expect(screen.queryByTestId("tab-dot-enable")).toBeNull();

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
    expect(tab("Enable").disabled).toBe(true);
    fireEvent.click(tab("Machine"));
    expect(screen.getByTestId("artifact-caption").textContent).toBe("from the last good compile");
  });
});

describe("playbook-library-57/58: the compile band", () => {
  test("phases in human words with the compiler's ids in the tooltips, the last-output clock, the log, Cancel, and who asked", async () => {
    // Fresh from the real clock, not the module-level `now`: this file
    // runs 41 tests before reaching here, so a shared origin is already
    // seconds stale by now. The offsets put both clocks mid-minute —
    // `duration` drops the seconds entirely on a whole minute
    // (time.ts), so a fixture parked just under one reads `5m` instead
    // of `4m 56s` the moment a slow runner catches up. That is what
    // reddened Windows CI on f19f46e.
    const t = Date.now() - 4 * 60_000 - 48_500;
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
    expect(cells[1]).toMatch(/^Specitems4m\d\ds:running$/);
    expect(cells.slice(2)).toEqual([
      "○Optimize:waiting",
      "○Prefix:waiting",
      "○Machine:waiting",
      "○Link:waiting",
      "○Package:waiting",
    ]);
    expect(screen.getByTestId("phase-text2gears").title).toContain("text2gears");
    // The heartbeat moved the clock: silence reads as alive (DR-010 §5).
    expect(screen.getByTestId("last-output").textContent).toMatch(/^last output 4m \d\ds ago$/);
    expect(screen.getByTestId("compile-by").textContent).toBe("asked by the agent");
    expect(screen.getByTestId("compile-log").textContent).toContain("Show log");
    // [playbook-library-30] the start control stays disabled for the
    // whole compile; Cancel asks the core to abort this playbook's.
    expect((screen.getByTestId("compile-button") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("compile-cancel"));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("compile.abort", { playbookId: "triage", projectId: PROJECT_ID, instance: INSTANCE }),
    );
    expect((screen.getByTestId("compile-button") as HTMLButtonElement).disabled).toBe(true);
    // The recorded cancellation lands in the log, and the compile
    // settles: the start control returns.
    act(() => {
      deliverServerMessageForTests({ type: "compile.progress", playbookId: "triage", line: "◇ compile canceled" });
      deliverServerMessageForTests({
        type: "draft.state",
        draft: draftInfo({ state: "draft", compile: { at: t, by: "agent", outcome: "canceled" } }),
      });
    });
    expect(screen.getByTestId("compile-canceled").textContent).toBe("Compile canceled");
    expect(useAppStore.getState().compileProgress.triage).toContain("◇ compile canceled");
    expect((screen.getByTestId("compile-button") as HTMLButtonElement).disabled).toBe(false);
  });

  test("a failed phase stands red with its output open and the relay's caption", () => {
    // No thread line says what became of the failure: the caption is
    // the draft's own relay, phrased by the page.
    const view = foldView(THREAD);
    renderWorkspace(
      draftInfo({ state: "failed", failures: 1, compile: { at: now - 60_000, by: "agent", outcome: "failed", phase: "gears2fsm", output: "result 'labeled' declared twice in TRIAGE-2", relay: "sent" } }),
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
    expect(failed.textContent).toContain("Machine");
    expect(failed.textContent).toContain("6m40s");
    expect(screen.getByTestId("compile-output").textContent).toContain("declared twice in TRIAGE-2");
    expect(screen.getByTestId("compile-caption").textContent).toBe("sent to the agent");
    expect(screen.getByTestId("draft-chip").textContent).toBe("Failed");
  });

  test("three failures in a row end the relay and the band says so; a restored failure draws its one phase", () => {
    renderWorkspace(
      draftInfo({ state: "failed", failures: 3, compile: { at: now - 60_000, by: "boss", outcome: "failed", phase: "text2gears", output: "✗ text2gears failed\nResults: bullet is not an identifier", relay: "stopped" } }),
    );
    expect(screen.getByTestId("phase-text2gears").textContent).toContain("Spec items");
    expect(screen.getByTestId("compile-output").textContent).toContain("not an identifier");
    expect(screen.getByTestId("compile-caption").textContent).toBe("three in a row — tell the agent how to proceed");
  });

  test("a failure the Boss's queued message carries waits for that message", () => {
    renderWorkspace(
      draftInfo({ state: "failed", failures: 1, compile: { at: now - 60_000, by: "agent", outcome: "failed", phase: "gears2fsm", output: "result 'labeled' declared twice in TRIAGE-2", relay: "queued" } }),
      { view: foldView(THREAD) },
    );
    expect(screen.getByTestId("compile-output").textContent).toContain("declared twice in TRIAGE-2");
    expect(screen.getByTestId("compile-caption").textContent).toBe("waiting for your queued message");
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
    expect(cards[1].textContent).toContain("Proposed enabling");
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
    // Open Enable lands on the tab.
    expect(within(cards[1]).getByTestId("open-enable").textContent).toBe("Open Enable");
    fireEvent.click(within(cards[1]).getByTestId("open-enable"));
    expect(tab("Enable").getAttribute("aria-selected")).toBe("true");
  });

  test("while a turn runs the header wears the running mark and the ticking span", () => {
    const view = foldView(THREAD.slice(0, 5));
    renderWorkspace(draftInfo({ activity: "turn" }), { view });
    expect(screen.getByTestId("draft-running").getAttribute("data-running")).toBe("true");
    expect(screen.getByTestId("draft-working").textContent).toMatch(/^working · \d+m/);
    expect(screen.queryByTestId("draft-openers")).toBeNull();
  });

  test("an unreadable transcript is a scoped diagnostic in place of the thread", () => {
    renderWorkspace(draftInfo(), {
      view: { ...foldView([]), loadError: "The conversation could not be loaded: records.jsonl is not JSON" },
    });
    expect(screen.getByTestId("draft-load-error").textContent).toContain("records.jsonl is not JSON");
    expect(screen.getByTestId("source-markdown")).toBeTruthy();
  });

  test("the core's diagnostic for a damaged draft stands in the thread's place and holds Send and Compile", () => {
    const diagnostic = "/home/local/drafts/triage/records.jsonl: damaged transcript after record 4";
    renderWorkspace(draftInfo({ diagnostic }), { view: foldView([]) });
    expect(screen.getByTestId("draft-load-error").textContent).toBe(diagnostic);
    expect(screen.queryByTestId("draft-openers")).toBeNull();
    expect(screen.getByTestId("source-markdown")).toBeTruthy();
    fireEvent.change(screen.getByTestId("draft-composer"), { target: { value: "hello?" } });
    const send = screen.getByTestId("draft-send") as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    expect(send.title).toContain("Unreadable draft");
    const compile = screen.getByTestId("compile-button") as HTMLButtonElement;
    expect(compile.disabled).toBe(true);
    expect(compile.title).toBe(diagnostic);
  });

  test("a permission request the runner answers nothing to reads as a failure line", () => {
    renderWorkspace(draftInfo({ activity: "turn" }), { view: foldView(THREAD.slice(0, 2)) });
    act(() => {
      deliverServerMessageForTests({
        type: "draft.record",
        draftId: "triage",
        instance: INSTANCE,
        seq: 3,
        record: event(3, t0 + 2, {
          type: "permission_request",
          payload: { toolName: "Bash", toolUseId: "p1", input: { command: "git push" }, reason: "runs outside the sandbox" },
        }).record,
      });
    });
    const failure = within(screen.getByTestId("draft-thread")).getByTestId("player-failure");
    expect(failure.textContent).toContain("Asked permission to use Bash — runs outside the sandbox");
    expect(failure.textContent).toContain("historical permission event; no live answer is available");
  });
});

describe("playbook-library-54: the composer", () => {
  test("idle: Send, the placeholder, the caption, the two openers, and Enter sends", async () => {
    renderWorkspace(draftInfo({ state: "no-source", firstLine: null }), { source: null });
    const field = screen.getByTestId("draft-composer") as HTMLTextAreaElement;
    expect(field.placeholder).toBe("Describe the playbook…");
    expect(screen.getByTestId("composer-caption").textContent).toBe("Enter sends");
    expect(screen.getByTestId("draft-send").textContent).toBe("Send");
    expect(screen.queryByTestId("draft-abort")).toBeNull();
    const openers = screen.getByTestId("draft-openers");
    expect(openers.textContent).toContain("Tell the agent what the playbook does, who does what, and when it is done");
    expect(within(openers).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Use a SKILL.md…",
      "Try the example",
    ]);
    // "Try the example" places the demo's six lines, focused, without
    // sending (playbook-library-84).
    fireEvent.click(screen.getByTestId("opener-example"));
    expect(field.value).toMatch(/^Before work begins, ensure the current directory/);
    expect(field.value.split("\n")).toHaveLength(6);
    expect(document.activeElement).toBe(field);
    expect(commandMock).not.toHaveBeenCalledWith("draft.send", expect.anything());
    // "Use a SKILL.md…" with no bridge: the paste mode opens with its
    // text focused and the ask is placed, nothing written.
    fireEvent.click(screen.getByTestId("opener-skill"));
    await vi.waitFor(() => expect(field.value).toBe(ADAPT_ASK));
    expect(document.activeElement).toBe(screen.getByTestId("paste-text"));
    expect(commandMock).not.toHaveBeenCalledWith("draft.source.write", expect.anything());
    fireEvent.change(field, { target: { value: "Triage issues into labels" } });
    fireEvent.keyDown(field, { key: "Enter" });
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("draft.send", { projectId: PROJECT_ID, instance: INSTANCE, draftId: "triage", text: "Triage issues into labels" }),
    );
    await vi.waitFor(() => expect(field.value).toBe(""));
  });

  test("a turn: Send next, its placeholder, Abort, and the queue frame", async () => {
    renderWorkspace(draftInfo({ activity: "turn", queued: [{ text: "Also cite the label definitions" }] }), { view: foldView(THREAD.slice(0, 5)) });
    const field = screen.getByTestId("draft-composer") as HTMLTextAreaElement;
    expect(field.placeholder).toBe("Sends after the reply…");
    expect(screen.getByTestId("draft-send").textContent).toBe("Send next");
    const queue = screen.getByTestId("draft-queue");
    expect(queue.textContent).toContain("Also cite the label definitions");
    expect(queue.textContent).toContain("sends after the reply");
    fireEvent.click(screen.getByTestId("draft-abort"));
    expect(screen.getByTestId("draft-abort").textContent).toBe("Aborting…");
    await vi.waitFor(() => expect(commandMock).toHaveBeenCalledWith("draft.abort", { projectId: PROJECT_ID, instance: INSTANCE, draftId: "triage" }));
    // A canceled turn leaves the queue standing.
    expect(screen.getByTestId("draft-queue").textContent).toContain("Also cite the label definitions");
  });

  test("a compile: the placeholder names it and the queue says so", () => {
    renderWorkspace(
      draftInfo({ activity: "compiling", state: "compiling", queued: [{ text: "one more thing" }], compile: { at: now, by: "boss", outcome: "running" } }),
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
      expect(commandMock).toHaveBeenCalledWith("draft.player.set", { projectId: PROJECT_ID, instance: INSTANCE, draftId: "triage", playerId: "dev.reviewer" }),
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
  test("renders the markdown captioned with its path in the working folder and who changed it and when; Edit saves under the token", async () => {
    renderWorkspace(draftInfo());
    expect(screen.getByTestId("source-path").textContent).toBe("spex-packages/triage/playbooks/en/triage/triage.md");
    expect(screen.getByTestId("source-caption").textContent).toBe("Updated 3m ago by the agent");
    expect(within(screen.getByTestId("source-markdown")).getByText("label").tagName).toBe("STRONG");
    fireEvent.click(screen.getByTestId("source-edit"));
    const text = screen.getByTestId("editor-text") as HTMLTextAreaElement;
    expect(text.value).toBe(SOURCE.markdown);
    fireEvent.change(text, { target: { value: "# Triage\n\nRewritten." } });
    fireEvent.click(screen.getByTestId("editor-save"));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("draft.source.write", {
        projectId: PROJECT_ID,
        instance: INSTANCE,
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
      expect(commandMock).toHaveBeenCalledWith("draft.source.write", { projectId: PROJECT_ID, instance: INSTANCE, draftId: "triage", content: "# Triage\n\nMine." }),
    );
  });

  test("Save waits for the reply while a turn runs; Edit and Paste stay open while compiling, their writes waiting", () => {
    renderWorkspace(draftInfo({ activity: "turn" }));
    fireEvent.click(screen.getByTestId("source-edit"));
    fireEvent.change(screen.getByTestId("editor-text"), { target: { value: "changed" } });
    const save = screen.getByTestId("editor-save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(save.title).toBe("Waits for the reply");

    // A compile reads the file: the Boss may prepare an edit through it
    // and paste a replacement, but neither writes until it ends.
    cleanup();
    renderWorkspace(draftInfo({ activity: "compiling", state: "compiling", compile: { at: now, by: "boss", outcome: "running" } }));
    const edit = screen.getByTestId("source-edit") as HTMLButtonElement;
    expect(edit.disabled).toBe(false);
    fireEvent.click(edit);
    fireEvent.change(screen.getByTestId("editor-text"), { target: { value: "changed while compiling" } });
    const saveWhileCompiling = screen.getByTestId("editor-save") as HTMLButtonElement;
    expect(saveWhileCompiling.disabled).toBe(true);
    expect(saveWhileCompiling.title).toBe("Compiling");

    cleanup();
    renderWorkspace(draftInfo({ activity: "compiling", state: "compiling", compile: { at: now, by: "boss", outcome: "running" } }));
    fireEvent.click(screen.getByTestId("source-paste"));
    fireEvent.change(screen.getByTestId("paste-text"), { target: { value: "# Pasted" } });
    const use = screen.getByTestId("paste-use") as HTMLButtonElement;
    expect(use.disabled).toBe(true);
    expect(use.title).toBe("Compiling");
    expect(screen.getByTestId("paste-caption").textContent).toBe("Compiling");
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
      expect(commandMock).toHaveBeenCalledWith("draft.source.write", { projectId: PROJECT_ID, instance: INSTANCE, draftId: "triage", content: "# Secaudit\n\nRoles:\n- Auditor" }),
    );
    await vi.waitFor(() => expect(screen.getByTestId("source-view")).toBeTruthy());
    expect(screen.getByTestId("source-caption").textContent).toBe("Updated just now by you");

    fireEvent.click(screen.getByTestId("source-paste"));
    fireEvent.change(screen.getByTestId("paste-path"), { target: { value: "/tmp/skill.md" } });
    expect(screen.getByTestId("paste-caption").textContent).toBe("The file is copied in as the playbook's source");
    fireEvent.click(use());
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("draft.source.write", { projectId: PROJECT_ID, instance: INSTANCE, draftId: "triage", sourcePath: "/tmp/skill.md" }),
    );
  });

  test("Use a SKILL.md… with the bridge: a draft with a source gets the path placed to confirm; a canceled pick changes nothing", async () => {
    let picked: string | null = null;
    const pickFile = vi.fn(async () => picked);
    window.spexNative = { pickDirectory: async () => null, pickFile };
    try {
      renderWorkspace(draftInfo(), { view: foldView([]) });
      const field = screen.getByTestId("draft-composer") as HTMLTextAreaElement;
      fireEvent.click(screen.getByTestId("opener-skill"));
      await vi.waitFor(() => expect(pickFile).toHaveBeenCalledTimes(1));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(field.value).toBe("");
      expect(screen.queryByTestId("paste-text")).toBeNull();
      picked = "/Users/dev/skill/SKILL.md";
      fireEvent.click(screen.getByTestId("opener-skill"));
      await vi.waitFor(() => expect(field.value).toBe(ADAPT_ASK));
      expect((screen.getByTestId("paste-path") as HTMLInputElement).value).toBe("/Users/dev/skill/SKILL.md");
      expect(document.activeElement).toBe(screen.getByTestId("paste-text"));
      expect(commandMock).not.toHaveBeenCalledWith("draft.source.write", expect.anything());
    } finally {
      delete window.spexNative;
    }
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

describe("playbook-library-61: the Enable tab", () => {
  test("prefills from the derived defaults, then the proposal, with the Boss's edits winning", async () => {
    renderWorkspace(COMPILED, { view: foldView(THREAD) });
    await vi.waitFor(() => expect(tab("Enable").disabled).toBe(false));
    fireEvent.click(tab("Enable"));
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

  test("playbook-library-88: a proposal matches roles case-insensitively, a role's existing lane is selected as it stands, and a minted id is never one the roster holds", async () => {
    // The compiled entry keys roles as it derived them (lowercase from
    // a `Roles:` source); the agent proposes "Coder". And `coder`'s own
    // lane, dev.coder, already exists, so the form selects it and its
    // New player option offers a free id instead of overwriting.
    const compiled = draftInfo({
      state: "compiled",
      compile: { at: now - 2 * 60_000, by: "agent", outcome: "ok", roles: ["coder", "verifier"] },
      proposal: { command: "triage", intent: "Triage a new issue", players: { Coder: "dev.coder", Verifier: "dev.reviewer" } },
    });
    renderWorkspace(compiled, { view: foldView(THREAD) });
    await vi.waitFor(() => expect(tab("Enable").disabled).toBe(false));
    fireEvent.click(tab("Enable"));
    expect((screen.getByTestId("register-player-coder") as HTMLSelectElement).value).toBe("dev.coder");
    expect((screen.getByTestId("register-player-verifier") as HTMLSelectElement).value).toBe("dev.reviewer");
    expect(screen.queryByTestId("register-mismatch")).toBeNull();

    // Without a proposal the existing lane is still the choice, and the
    // mintable id sidesteps it.
    cleanup();
    renderWorkspace(
      draftInfo({
        state: "compiled",
        compile: { at: now - 2 * 60_000, by: "agent", outcome: "ok", roles: ["coder"] },
      }),
      { view: foldView(THREAD) },
    );
    await vi.waitFor(() => expect(tab("Enable").disabled).toBe(false));
    fireEvent.click(tab("Enable"));
    const coder = () => screen.getByTestId("register-player-coder") as HTMLSelectElement;
    const offered = () => Array.from(coder().options).map((option) => option.textContent);
    expect(coder().value).toBe("dev.coder");
    expect(offered()).toContain("New player dev.coder-2");

    // With dev.coder-2 on the roster as well, the first free suffix
    // moves on, and the existing lane stays the choice.
    act(() => {
      useAppStore.setState({
        configState: {
          ...CONFIG_STATE,
          summary: {
            ...CONFIG_STATE.summary,
            players: [
              ...CONFIG_STATE.summary.players,
              {
                id: "dev.coder-2",
                agent: { adapter: "claude", model: "claude-opus-5", effort: "high" },
                display: "claude-opus-5 @ high",
                boundBy: [],
              },
            ],
          },
        },
      });
    });
    expect(coder().value).toBe("dev.coder");
    expect(offered()).toContain("New player dev.coder-3");
    expect(offered()).not.toContain("New player dev.coder-2");
  });

  test("Enable writes the bindings and the new players in the project, then the list opens with the card in view and the session stays", async () => {
    renderWorkspace(
      { ...COMPILED, proposal: { command: "triage", intent: "Triage a new issue", players: { Triager: "dev.triager", Verifier: "dev.reviewer" } } },
      { view: foldView(THREAD) },
    );
    await vi.waitFor(() => expect(tab("Enable").disabled).toBe(false));
    fireEvent.click(tab("Enable"));
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
    await vi.waitFor(() => expect(submit().textContent).toBe("Enabling…"));
    // The spex repository defaults to the project (playbook-library-7).
    expect(commandMock).toHaveBeenCalledWith("draft.register", {
      projectId: PROJECT_ID,
      instance: INSTANCE,
      draftId: "triage",
      command: "triage",
      intent: "Triage a new issue",
      bindings: { Triager: "dev.triager", Verifier: "dev.reviewer" },
      newPlayers: { "dev.triager": { adapter: "codex", model: "gpt-6-astra", permissions: { mode: "auto" } } },
      repository: PROJECT_ID,
    });
    // The core requested the package by path and enabled it: the
    // project's environment now exports it, enabled there.
    lists = playbookLists([
      available({
        id: "triage",
        intent: "Triage a new issue",
        package: "me/triage",
        version: "0.1.0",
        source: "path",
        repository: PROJECT_ID,
        roles: ["Triager", "Verifier"],
        enabled: ["project"],
        bindings: { project: { Triager: { playerId: "dev.triager", display: "gpt-6-astra" }, Verifier: { playerId: "dev.reviewer", display: "gpt-6-astra" } } },
      }),
    ]);
    await act(async () => {
      resolve(CONFIG_STATE);
    });
    await vi.waitFor(() => expect(screen.getByTestId("playbook-card-triage")).toBeTruthy());
    const card = screen.getByTestId("playbook-card-triage");
    expect(card.className).toContain("ring-2");
    expect(within(card).getByTestId("playbook-from-triage").textContent).toBe("fromme/triage 0.1.0· path");
    // [playbook-library-10] sessions started before must restart.
    expect(screen.getByTestId("enabled-note").textContent).toContain("restarted to use it");
    expect(screen.getByTestId("library-live").textContent).toBe("Enabled /triage");
    // The session stays, to be worked on further and published; its
    // chip reads Enabled once the core says so.
    act(() => {
      deliverServerMessageForTests({ type: "draft.state", draft: { ...COMPILED, state: "enabled" } });
    });
    expect(within(screen.getByTestId("draft-row-triage")).getByTestId("draft-chip").textContent).toBe("Enabled");
  });

  test("[playbook-library-88] the spex repository defaults to the project and offers your own group, the list opening on the side enabled in", async () => {
    renderWorkspace(
      { ...COMPILED, proposal: { command: "triage", intent: "Triage a new issue", players: { Triager: "dev.coder", Verifier: "dev.reviewer" } } },
      { view: foldView(THREAD) },
    );
    await vi.waitFor(() => expect(tab("Enable").disabled).toBe(false));
    fireEvent.click(tab("Enable"));
    const field = screen.getByTestId("register-repository") as HTMLSelectElement;
    expect(field.value).toBe(PROJECT_ID);
    expect([...field.options].map((option) => [option.value, option.textContent])).toEqual([
      [PROJECT_ID, "demo — the project"],
      [OWN_KEY, "Your own group"],
    ]);
    fireEvent.change(field, { target: { value: OWN_KEY } });
    fireEvent.click(screen.getByTestId("register-submit"));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("draft.register", expect.objectContaining({ repository: OWN_KEY })),
    );
    await vi.waitFor(() => expect(screen.queryByTestId("authoring-workspace")).toBeNull());
    expect(useAppStore.getState().playbooksSide).toBe("own");
    expect(screen.getByTestId("side-own").getAttribute("aria-pressed")).toBe("true");
  });

  test("a refusal names the rule inline and leaves the form standing; a busy session holds Enable", async () => {
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
      if (type === "draft.register") throw new Error("player dev.triager collides with a reserved id");
      return base(type, params);
    });
    renderWorkspace(COMPILED, { view: foldView(THREAD) });
    await vi.waitFor(() => expect(tab("Enable").disabled).toBe(false));
    fireEvent.click(tab("Enable"));
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

  test("with no prose paragraph the intent defaults to the source's title, so the app's own example enables on its defaults", async () => {
    // The example is a title over a roles list and numbered steps.
    renderWorkspace(COMPILED, { view: foldView(THREAD), source: { ...SOURCE, markdown: SLC_DEMO.stages.normalized } });
    await vi.waitFor(() => expect(tab("Enable").disabled).toBe(false));
    fireEvent.click(tab("Enable"));
    expect((screen.getByTestId("register-intent") as HTMLInputElement).value).toBe(
      "Two-Agent Change-and-Review Workflow",
    );
    expect((screen.getByTestId("register-submit") as HTMLButtonElement).disabled).toBe(false);
  });

  test("an empty intent holds Enable until the Boss writes one", async () => {
    // Neither a prose paragraph nor a title to derive one from.
    renderWorkspace(COMPILED, { view: foldView(THREAD), source: { ...SOURCE, markdown: "Roles:\n- Triager\n- Verifier" } });
    await vi.waitFor(() => expect(tab("Enable").disabled).toBe(false));
    fireEvent.click(tab("Enable"));
    expect((screen.getByTestId("register-intent") as HTMLInputElement).value).toBe("");
    expect((screen.getByTestId("register-submit") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("register-intent"), { target: { value: "Sort issues" } });
    expect((screen.getByTestId("register-submit") as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("playbook-library-93: Publish beneath the Enable form", () => {
  const PREVIEW = {
    name: "me/triage",
    version: "0.1.0",
    files: ["meta.yaml", "playbooks/en/triage/triage.md", "playbooks/en/triage/triage.playbook/triage.fsm.ts"],
  };
  const CURRENT = { repository: PROJECT_ID, language: null, requests: {}, packages: [], stale: null, conflicts: null, busy: null, error: null };

  async function openEnable(draft: DraftInfo = COMPILED) {
    renderWorkspace(draft, { view: foldView(THREAD) });
    await vi.waitFor(() => expect(tab("Enable").disabled).toBe(false));
    fireEvent.click(tab("Enable"));
  }

  test("shows the inline summary, publishes as the account, and reads the published version with its page", async () => {
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) =>
      type === "environment.publish"
        ? params?.dryRun ? { accepted: true, preview: PREVIEW } : { accepted: true }
        : base(type, params),
    );
    await openEnable();
    const publish = screen.getByTestId("publish");
    // Beneath the form.
    expect(
      screen.getByTestId("register-submit").compareDocumentPosition(publish) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.click(within(publish).getByTestId("publish-button"));
    // The checks run first and upload nothing.
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("environment.publish", { repository: PROJECT_ID, path: "spex-packages/triage", dryRun: true }),
    );
    const summary = await screen.findByTestId("publish-summary");
    expect(summary.textContent).toContain("me/triage 0.1.0");
    expect(summary.textContent).toContain("3 files upload:");
    expect([...within(summary).getByTestId("publish-files").querySelectorAll("li")].map((item) => item.textContent)).toEqual(PREVIEW.files);

    // Cancel uploads nothing.
    fireEvent.click(within(summary).getByTestId("publish-cancel"));
    expect(screen.queryByTestId("publish-summary")).toBeNull();
    fireEvent.click(screen.getByTestId("publish-button"));
    fireEvent.click(await screen.findByTestId("publish-confirm"));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("environment.publish", { repository: PROJECT_ID, path: "spex-packages/triage" }),
    );
    expect(commandMock.mock.calls.filter(([type, params]) => type === "environment.publish" && !params.dryRun)).toHaveLength(1);

    // The outcome reads from the environment's state.
    act(() => {
      deliverServerMessageForTests({ type: "environment.state", repository: PROJECT_ID, state: { ...CURRENT, busy: "publishing" } });
    });
    expect((await screen.findByTestId("publish-button")).textContent).toBe("Publishing…");
    act(() => {
      deliverServerMessageForTests({
        type: "environment.state",
        repository: PROJECT_ID,
        state: { ...CURRENT, published: { name: "me/triage", version: "0.1.0", url: "https://spex.pub/me/triage/0.1.0" } },
      });
    });
    expect(screen.getByTestId("publish-done").textContent).toContain("Published me/triage 0.1.0");
    expect(screen.getByTestId("publish-link").getAttribute("href")).toBe("https://spex.pub/me/triage/0.1.0");
  });

  test("a refusal from the checks or the registry shows its issues in place", async () => {
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
      if (type === "environment.publish" && params?.dryRun) throw new Error("meta.yaml: description is required");
      return base(type, params);
    });
    await openEnable();
    fireEvent.click(screen.getByTestId("publish-button"));
    expect((await screen.findByTestId("publish-error")).textContent).toBe("meta.yaml: description is required");
    expect(screen.queryByTestId("publish-summary")).toBeNull();

    // A registry refusal arrives as the environment's failure.
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) =>
      type === "environment.publish"
        ? params?.dryRun ? { accepted: true, preview: PREVIEW } : { accepted: true }
        : base(type, params),
    );
    fireEvent.click(screen.getByTestId("publish-button"));
    fireEvent.click(await screen.findByTestId("publish-confirm"));
    await vi.waitFor(() => expect(screen.queryByTestId("publish-summary")).toBeNull());
    act(() => {
      deliverServerMessageForTests({
        type: "environment.state",
        repository: PROJECT_ID,
        state: { ...CURRENT, error: "the registry refused me/triage 0.1.0: that version exists" },
      });
    });
    expect(screen.getByTestId("publish-error").textContent).toBe("the registry refused me/triage 0.1.0: that version exists");
  });

  test("a signed-out home shows Sign in to publish in the control's place", async () => {
    useAppStore.setState({ space: home({ account: null }) });
    const onNavigate = vi.fn();
    seed({
      space: home({ account: null }),
      drafts: { triage: COMPILED },
      openDraftId: "triage",
      draftViews: { triage: foldView(THREAD) },
      draftSources: { triage: SOURCE },
    });
    render(<LibrarySurface onNavigate={onNavigate} />);
    await vi.waitFor(() => expect(tab("Enable").disabled).toBe(false));
    fireEvent.click(tab("Enable"));
    expect(screen.queryByTestId("publish-button")).toBeNull();
    const signIn = screen.getByTestId("publish-signin");
    expect(signIn.textContent).toBe("Sign in to publish");
    fireEvent.click(signIn);
    expect(onNavigate).toHaveBeenCalledWith("Space");
  });
});

describe("playbook-library-35: the example opens a draft in paste mode", () => {
  test("Prefill creates the demo draft and places the normalized text without writing", async () => {
    seed();
    render(<LibrarySurface />);
    expect(screen.getByTestId("example-prefill").textContent).toBe("Prefill");
    fireEvent.click(screen.getByTestId("example-prefill"));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("draft.create", { projectId: PROJECT_ID, draftId: SLC_DEMO.playbookId }),
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
    const restored = draftInfo({ state: "failed", failures: 1, compile: { at: now - HOUR, by: "agent", outcome: "failed", phase: "gears2fsm", output: "boom", relay: "sent" } });
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
    expect(commandMock).toHaveBeenCalledWith("draft.open", { projectId: PROJECT_ID, draftId: "triage", afterSeq: 0 });
    expect(screen.getByTestId("source-markdown").textContent).toContain("Triage restored");
    // A restored source says only when it changed.
    expect(screen.getByTestId("source-caption").textContent).toBe("Updated 1h ago");
    expect(screen.getByTestId("compile-output").textContent).toContain("boom");
    expect(screen.getAllByTestId("directive-card")).toHaveLength(1);

    act(() => {
      deliverServerMessageForTests({
        type: "draft.record",
        draftId: "triage",
        instance: INSTANCE,
        seq: 10,
        record: { type: "captain_status", turnId: null, timestamp: now, message: "◇ Compile failed at Machine — sent to the agent" } as unknown as TmuxPlayRecord,
      });
      deliverServerMessageForTests({ type: "draft.source", draftId: "triage", instance: INSTANCE, markdown: "# Triage\n\nFixed.", version: "v10", mtime: now });
    });
    expect(screen.getAllByTestId("system-line").map((line) => line.textContent)).toContain(
      "◇ Compile failed at Machine — sent to the agent",
    );
    expect(screen.getByTestId("compile-caption").textContent).toBe("sent to the agent");
    expect(screen.getByTestId("source-markdown").textContent).toContain("Fixed.");
  });
});

describe("playbook-library-98: the instance held under an id", () => {
  /** Another project's session of the same id (storage-12), its own instance. */
  const OTHER_ID = "acme/tools-spex";
  const OTHER_PROJECT = {
    id: OTHER_ID,
    path: "/work/tools",
    name: "tools",
    registeredAt: now - 20 * HOUR,
    repository: { key: OTHER_ID, name: "tools-spex", group: "acme", own: false },
  };
  const promoted = draftInfo({ projectId: OTHER_ID, instance: "inst-2", firstLine: "# Triage elsewhere", touchedAt: now });
  /** The session made again under the id in the same project after a deletion. */
  const recreated = draftInfo({ instance: "inst-3", state: "no-source", firstLine: null, touchedAt: now, createdAt: now });

  /** The former instance opened with everything the workspace holds,
   * the surface's own reads on mount answered before the core speaks
   * again, as one connection delivers them. */
  async function holdFormer(): Promise<void> {
    renderWorkspace(COMPILED, { view: foldView(THREAD) });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    act(() => {
      useAppStore.setState({
        projects: [PROJECT, OTHER_PROJECT],
        draftArtifacts: { triage: ARTIFACTS } as ReturnType<typeof useAppStore.getState>["draftArtifacts"],
        draftComposers: { triage: { draft: "half a thought" } },
        draftEditors: { triage: { path: "spex-packages/triage/triage.md", original: "# Triage", draft: "# Triage, edited", preview: false } },
        draftForms: { triage: { command: "triage", players: { Triager: "dev.coder" }, newPlayers: {} } },
      });
    });
    expect(screen.getByTestId("authoring-workspace")).toBeTruthy();
  }

  /** The core ends the held instance and names another under the id:
   * the removal, then the state of the one now holding it. */
  function departTo(named: DraftInfo): void {
    deliverServerMessageForTests({ type: "draft.removed", projectId: PROJECT_ID, draftId: "triage", instance: INSTANCE });
    deliverServerMessageForTests({ type: "draft.state", draft: named });
  }

  function expectNothingOfFormer(named: DraftInfo): void {
    const state = useAppStore.getState();
    expect(state.drafts.triage).toEqual(named);
    expect(state.draftViews.triage).toBeUndefined();
    expect(state.draftSources.triage).toBeUndefined();
    expect(state.draftArtifacts.triage).toBeUndefined();
    expect(state.draftComposers.triage).toBeUndefined();
    expect(state.draftEditors.triage).toBeUndefined();
    expect(state.draftForms.triage).toBeUndefined();
  }

  test.each([
    ["its removal then another project's instance in its state", () => departTo(promoted)],
    ["a listing naming another instance", async () => {
      const base = commandMock.getMockImplementation()!;
      commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) =>
        type === "draft.list" ? [promoted] : base(type, params),
      );
      await useAppStore.getState().listDrafts();
    }],
  ])("%s: the former's state goes, its workspace returns to the list, and the id opens from the first record under the new instance", async (_case, announce) => {
    await holdFormer();
    await act(async () => {
      await announce();
    });
    expectNothingOfFormer(promoted);
    expect(useAppStore.getState().openDraftId).toBeUndefined();
    expect(screen.queryByTestId("authoring-workspace")).toBeNull();
    // A live record of the instance now holding the id folds into no view.
    act(() => {
      deliverServerMessageForTests({
        type: "draft.record",
        draftId: "triage",
        instance: "inst-2",
        seq: 12,
        record: { type: "captain_status", turnId: null, timestamp: now, message: "◇ Compiling — asked by you" } as unknown as TmuxPlayRecord,
      });
    });
    expect(useAppStore.getState().draftViews.triage).toBeUndefined();
    commandMock.mockClear();
    await act(() => useAppStore.getState().openDraft("triage"));
    expect(commandMock).toHaveBeenCalledWith("draft.open", { projectId: OTHER_ID, draftId: "triage", afterSeq: 0 });
    // Every later command names the new instance.
    await act(() => useAppStore.getState().abortDraft("triage"));
    expect(commandMock).toHaveBeenCalledWith("draft.abort", { projectId: OTHER_ID, instance: "inst-2", draftId: "triage" });
  });

  test("deleted and created again under its id in the same project: the former's state goes, and its records, source, replacement and late replies change nothing", async () => {
    await holdFormer();
    const pendingWrite = deferred<unknown>();
    const pendingPlayer = deferred<unknown>();
    const pendingCompile = deferred<unknown>();
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
      if (type === "draft.source.write") return pendingWrite.promise;
      if (type === "draft.player.set") return pendingPlayer.promise;
      if (type === "draft.compile") return pendingCompile.promise;
      return base(type, params);
    });
    // Three acts of the former instance await their replies.
    const write = useAppStore.getState().writeDraftSource("triage", { content: "# Triage, mine", baseVersion: "v1" });
    const player = useAppStore.getState().setDraftPlayer("triage", "dev.coder");
    const compile = useAppStore.getState().compileDraft("triage");
    await vi.waitFor(() => expect(commandMock).toHaveBeenCalledWith("draft.compile", { projectId: PROJECT_ID, instance: INSTANCE, draftId: "triage" }, { timeoutMs: 0 }));
    act(() => departTo(recreated));
    expectNothingOfFormer(recreated);
    expect(screen.queryByTestId("authoring-workspace")).toBeNull();
    // The recreated session opens; what the former's instance then
    // sends under the id is dropped at the boundary.
    await act(() => useAppStore.getState().openDraft("triage"));
    expect(commandMock).toHaveBeenCalledWith("draft.open", { projectId: PROJECT_ID, draftId: "triage", afterSeq: 0 });
    expect(useAppStore.getState().draftViews.triage?.view.lastSeq).toBe(0);
    act(() => {
      deliverServerMessageForTests({
        type: "draft.record", draftId: "triage", instance: INSTANCE, seq: 10,
        record: { type: "captain_status", turnId: null, timestamp: now, message: "◇ Of the former" } as unknown as TmuxPlayRecord,
      });
      deliverServerMessageForTests({ type: "draft.source", draftId: "triage", instance: INSTANCE, markdown: "# Former", version: "vF", mtime: now });
      deliverServerMessageForTests({ type: "draft.history-replaced", draftId: "triage", instance: INSTANCE, projectId: PROJECT_ID, records: THREAD });
    });
    expect(useAppStore.getState().draftViews.triage?.view.lastSeq).toBe(0);
    expect(useAppStore.getState().draftSources.triage).toBeNull();
    // The former's replies and refusal land: each act is told it
    // retired and writes nothing over the recreated session.
    await act(async () => {
      pendingWrite.resolve({ version: "v2", mtime: now });
      pendingPlayer.resolve({ ...draftInfo(), player: "dev.coder" });
      pendingCompile.reject(new Error("no draft triage"));
      await expect(write).rejects.toMatchObject({ code: "retired" });
      await expect(player).rejects.toMatchObject({ code: "retired" });
      await compile;
    });
    const state = useAppStore.getState();
    expect(state.drafts.triage).toEqual(recreated);
    expect(state.draftSources.triage).toBeNull();
    expect(state.draftErrors.triage).toBeUndefined();
    // A record of the recreated instance folds.
    act(() => {
      deliverServerMessageForTests({
        type: "draft.record", draftId: "triage", instance: "inst-3", seq: 1,
        record: { type: "captain_status", turnId: null, timestamp: now, message: "◇ Of the new" } as unknown as TmuxPlayRecord,
      });
    });
    expect(useAppStore.getState().draftViews.triage?.view.lastSeq).toBe(1);
  });

  test("a listing leaving the id out drops the former's state, and another project's instance named under it opens from the first record", async () => {
    await holdFormer();
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) =>
      type === "draft.list" ? [] : base(type, params),
    );
    await act(async () => {
      await useAppStore.getState().listDrafts();
    });
    const state = useAppStore.getState();
    expect(state.drafts.triage).toBeUndefined();
    expect(state.draftViews.triage).toBeUndefined();
    expect(state.draftSources.triage).toBeUndefined();
    expect(state.draftArtifacts.triage).toBeUndefined();
    expect(state.draftComposers.triage).toBeUndefined();
    expect(state.draftEditors.triage).toBeUndefined();
    expect(state.draftForms.triage).toBeUndefined();
    expect(state.openDraftId).toBeUndefined();
    expect(screen.queryByTestId("authoring-workspace")).toBeNull();
    act(() => {
      deliverServerMessageForTests({ type: "draft.state", draft: promoted });
    });
    expectNothingOfFormer(promoted);
    expect(screen.queryByTestId("authoring-workspace")).toBeNull();
    commandMock.mockClear();
    await act(() => useAppStore.getState().openDraft("triage"));
    expect(commandMock).toHaveBeenCalledWith("draft.open", { projectId: OTHER_ID, draftId: "triage", afterSeq: 0 });
  });

  test("a creation's reply naming another instance under a held id drops the former's state before the new one is held", async () => {
    await holdFormer();
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) =>
      type === "draft.create" && params?.draftId === "triage" ? recreated : base(type, params),
    );
    await act(() => useAppStore.getState().createDraft("triage"));
    const state = useAppStore.getState();
    expect(state.drafts.triage).toEqual(recreated);
    expect(state.draftComposers.triage).toBeUndefined();
    expect(state.draftEditors.triage).toBeUndefined();
    expect(state.draftForms.triage).toBeUndefined();
    expect(state.draftArtifacts.triage).toBeUndefined();
    // The open that follows the creation asks for the new session's records from the first.
    expect(commandMock).toHaveBeenCalledWith("draft.open", { projectId: PROJECT_ID, draftId: "triage", afterSeq: 0 });
    expect(state.draftViews.triage?.view.lastSeq).toBe(0);
  });

  test("an open's reply naming another instance than the held one, with no removal announced, is told it retired and applies nothing", async () => {
    await holdFormer();
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) =>
      type === "draft.open" ? { draft: draftInfo({ instance: "inst-9" }), source: { markdown: "# Theirs", version: "v9", mtime: now }, records: [] } : base(type, params),
    );
    await act(async () => {
      await expect(useAppStore.getState().refreshDraftSource("triage")).rejects.toMatchObject({ code: "retired" });
    });
    const state = useAppStore.getState();
    expect(state.drafts.triage).toEqual(COMPILED);
    expect(state.draftSources.triage).toEqual(SOURCE);
  });

  test("a late refused Cancel of the former instance's compile names the held address and writes nothing over the newcomer's error", async () => {
    const t0c = Date.now() - 60_000;
    renderWorkspace(
      draftInfo({ activity: "compiling", state: "compiling", compile: { at: t0c, by: "boss", outcome: "running" } }),
      { lines: ["running: npx @sublang/slc playbook triage.md", "→ normalize (writing triage.playbook/triage.text.md)"], times: [t0c, t0c + 1000] },
    );
    act(() => {
      useAppStore.setState({ projects: [PROJECT, OTHER_PROJECT] });
    });
    const pending = deferred<unknown>();
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) =>
      type === "compile.abort" ? pending.promise : base(type, params),
    );
    fireEvent.click(screen.getByTestId("compile-cancel"));
    await vi.waitFor(() => expect(commandMock).toHaveBeenCalledWith("compile.abort", { playbookId: "triage", projectId: PROJECT_ID, instance: INSTANCE }));
    act(() => {
      departTo(promoted);
      useAppStore.getState().reportDraftError("triage", THEIR_ERROR);
    });
    await act(async () => {
      pending.reject(new Error("triage now names another authoring session"));
      await settle();
    });
    expect(useAppStore.getState().draftErrors.triage).toBe(THEIR_ERROR);
  });

  test("a progress line naming an instance not held under the id is not folded into the band", () => {
    const t0c = Date.now() - 60_000;
    renderWorkspace(
      draftInfo({ activity: "compiling", state: "compiling", compile: { at: t0c, by: "boss", outcome: "running" } }),
      { lines: ["running: npx @sublang/slc playbook triage.md"], times: [t0c] },
    );
    act(() => {
      deliverServerMessageForTests({ type: "compile.progress", playbookId: "triage", instance: "inst-2", line: "→ normalize (writing triage.playbook/triage.text.md)" });
    });
    expect(useAppStore.getState().compileProgress.triage).toEqual(["running: npx @sublang/slc playbook triage.md"]);
    act(() => {
      deliverServerMessageForTests({ type: "compile.progress", playbookId: "triage", instance: INSTANCE, line: "→ normalize (writing triage.playbook/triage.text.md)" });
    });
    expect(useAppStore.getState().compileProgress.triage).toHaveLength(2);
  });

  test("a state naming another instance while the held one was never announced gone is dropped", async () => {
    await holdFormer();
    act(() => {
      deliverServerMessageForTests({ type: "draft.state", draft: promoted });
    });
    const state = useAppStore.getState();
    expect(state.drafts.triage).toEqual(COMPILED);
    expect(state.draftViews.triage?.view.lastSeq).toBe(9);
    expect(state.draftComposers.triage).toEqual({ draft: "half a thought" });
    expect(screen.getByTestId("authoring-workspace")).toBeTruthy();
  });

  test("the deletion's own reply leaves the session named in the id's place standing and unsubscribes the deleted instance alone", async () => {
    seed({ drafts: { triage: draftInfo() }, projects: [PROJECT, OTHER_PROJECT] });
    const unsubscribe = vi.fn(async () => null);
    setClientForTests({ command: commandMock, subscribe: async () => null, unsubscribe } as unknown as Parameters<typeof setClientForTests>[0]);
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
      if (type !== "draft.delete") return base(type, params);
      // The core announces the removal and the session it names in its
      // place before it replies.
      departTo(promoted);
      return null;
    });
    await act(() => useAppStore.getState().deleteDraft("triage"));
    expect(commandMock).toHaveBeenCalledWith("draft.delete", { projectId: PROJECT_ID, instance: INSTANCE, draftId: "triage" });
    expect(useAppStore.getState().drafts.triage).toEqual(promoted);
    expect(unsubscribe).toHaveBeenCalledWith({ kind: "draft", draftId: "triage", instance: INSTANCE });
    commandMock.mockClear();
    await act(() => useAppStore.getState().openDraft("triage"));
    expect(commandMock).toHaveBeenCalledWith("draft.open", { projectId: OTHER_ID, draftId: "triage", afterSeq: 0 });
  });

  test.each([
    ["a draft.open reply", "draft.open", { draft: draftInfo(), source: SOURCE, records: [] }, undefined, () => useAppStore.getState().refreshDraftSource("triage")],
    ["a draft.source.write reply", "draft.source.write", { version: "v2", mtime: now }, undefined, () => useAppStore.getState().writeDraftSource("triage", { content: "# Triage, mine", baseVersion: "v1" })],
    ["a draft.player.set reply", "draft.player.set", { ...draftInfo(), player: "dev.coder" }, undefined, () => useAppStore.getState().setDraftPlayer("triage", "dev.coder")],
    ["a draft.artifacts reply", "draft.artifacts", ARTIFACTS, undefined, () => useAppStore.getState().loadDraftArtifacts("triage")],
    ["a draft.register reply", "draft.register", CONFIG_STATE, undefined, () => useAppStore.getState().registerDraft("triage", { command: "triage", intent: "Label", bindings: { Triager: "dev.coder" } })],
    ["a draft.compile refusal", "draft.compile", undefined, new Error("triage now names another authoring session"), () => useAppStore.getState().compileDraft("triage")],
    ["a draft.abort refusal", "draft.abort", undefined, new Error("triage now names another authoring session"), () => useAppStore.getState().abortDraft("triage")],
  ])("%s for the former instance writes nothing over the instance now holding the id", async (_case, command, reply, refusal, run) => {
    await holdFormer();
    /** Another session the Boss opened meanwhile. */
    const elsewhere = draftInfo({ id: "labels", instance: "inst-labels", firstLine: "# Labels" });
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
      if (type !== command || params?.draftId !== "triage") return base(type, params);
      // The held instance leaves and another project's takes the id,
      // which reports its own error, while the Boss opens another
      // session on the other side.
      departTo(promoted);
      useAppStore.getState().reportDraftError("triage", THEIR_ERROR);
      useAppStore.setState({ drafts: { ...useAppStore.getState().drafts, labels: elsewhere }, openDraftId: "labels", playbooksSide: "own" });
      if (refusal) throw refusal;
      return reply;
    });
    await act(async () => {
      // An act that throws is told it retired; a refused compile or
      // abort settles quietly.
      if (refusal) await run();
      else await expect(run()).rejects.toMatchObject({ code: "retired" });
    });
    expect(commandMock.mock.calls.some(([type, params]) =>
      type === command && (params as Record<string, unknown>).projectId === PROJECT_ID && (params as Record<string, unknown>).draftId === "triage")).toBe(true);
    if (command !== "draft.open") {
      expect(commandMock.mock.calls.some(([type, params]) => type === command && (params as Record<string, unknown>).instance === INSTANCE)).toBe(true);
    }
    expectNothingOfFormer(promoted);
    const state = useAppStore.getState();
    expect(state.draftErrors.triage).toBe(THEIR_ERROR);
    expect(state.openDraftId).toBe("labels");
    expect(state.playbooksSide).toBe("own");
    expect(state.revealPlaybook).toBeUndefined();
  });

  /** A reply the test hands over when it chooses. */
  function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (cause: unknown) => void } {
    let resolve!: (value: T) => void;
    let reject!: (cause: unknown) => void;
    const promise = new Promise<T>((done, fail) => {
      resolve = done;
      reject = fail;
    });
    return { promise, resolve, reject };
  }

  async function settle(): Promise<void> {
    for (let tick = 0; tick < 5; tick += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  }

  /** What the instance now holding the id set for itself. */
  const THEIR_EDITOR = { path: "spex-packages/triage/triage.md", original: "# Theirs", draft: "# Theirs, edited", preview: false };
  const THEIR_MODE = { mode: "edit" as const, pasteText: "# Their paste", pastePath: "/their/skill.md" };
  const THEIR_COMPOSER = { draft: "their own thought" };
  const THEIR_ERROR = "their own refusal";
  const EDITING = { path: "spex-packages/triage/triage.md", original: "# Triage", draft: "# Triage, edited", version: "v1", preview: false };

  test.each([
    ["Save", "draft.source.write", { triage: { mode: "edit" as const, pasteText: "", pastePath: "" } }, async () => {
      fireEvent.click(screen.getByTestId("editor-save"));
    }, { version: "v2", mtime: now }, undefined],
    ["Reload", "draft.open", { triage: { mode: "edit" as const, pasteText: "", pastePath: "" } }, async () => {
      fireEvent.click(screen.getByTestId("editor-save"));
      fireEvent.click(within(await screen.findByTestId("editor-conflict")).getByTestId("editor-reload"));
      fireEvent.click(within(screen.getByTestId("editor-confirm")).getByRole("button", { name: "Reload" }));
    }, { draft: COMPILED, source: { markdown: "# FORMER PROJECT SOURCE", version: "vF", mtime: now }, records: [] }, undefined],
    ["Paste", "draft.source.write", { triage: { mode: "paste" as const, pasteText: "# Former paste", pastePath: "" } }, async () => {
      fireEvent.click(screen.getByTestId("paste-use"));
    }, { version: "v2", mtime: now }, undefined],
    ["Send", "draft.send", {}, async () => {
      fireEvent.click(screen.getByTestId("draft-send"));
    }, { accepted: true, queued: false }, undefined],
    ["a refused Send", "draft.send", {}, async () => {
      fireEvent.click(screen.getByTestId("draft-send"));
    }, undefined, new Error("triage now names another authoring session")],
  ])("a late %s started for the former instance writes nothing over what the instance now holding the id set", async (_case, command, modes, start, reply, refusal) => {
    await holdFormer();
    const pending = deferred<unknown>();
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
      if (type === "draft.source.write" && command === "draft.open" && params?.baseVersion !== undefined) {
        throw Object.assign(new Error("the source changed since it was read"), { code: "conflict" });
      }
      return type === command ? pending.promise : base(type, params);
    });
    act(() => {
      useAppStore.setState({ draftSourceModes: modes, draftEditors: { triage: EDITING } });
    });
    await start();
    await vi.waitFor(() => expect(commandMock).toHaveBeenCalledWith(command, expect.objectContaining({ projectId: PROJECT_ID, draftId: "triage" })));
    // The held instance leaves and another project's takes the id,
    // setting its own state.
    act(() => {
      departTo(promoted);
      useAppStore.getState().setDraftEditor("triage", THEIR_EDITOR);
      useAppStore.getState().setDraftSourceMode("triage", THEIR_MODE);
      useAppStore.getState().setDraftComposer("triage", THEIR_COMPOSER.draft);
      useAppStore.getState().reportDraftError("triage", THEIR_ERROR);
    });
    await act(async () => {
      if (refusal) pending.reject(refusal);
      else pending.resolve(reply);
      await settle();
    });
    const state = useAppStore.getState();
    expect(state.drafts.triage).toEqual(promoted);
    expect(state.draftEditors.triage).toEqual(THEIR_EDITOR);
    expect(state.draftSourceModes.triage).toEqual(THEIR_MODE);
    expect(state.draftComposers.triage).toEqual(THEIR_COMPOSER);
    expect(state.draftErrors.triage).toBe(THEIR_ERROR);
    expect(state.draftSources.triage).toBeUndefined();
  });

  test.each([
    ["Use a SKILL.md…", async () => {
      fireEvent.click(screen.getByTestId("opener-skill"));
    }],
    ["Pick file", async () => {
      fireEvent.click(screen.getByTestId("source-paste"));
      fireEvent.click(screen.getByTestId("paste-pick"));
    }],
  ])("a file %s picks after the held instance left is written and placed nowhere", async (_case, start) => {
    const pick = deferred<string | null>();
    const pickFile = vi.fn(() => pick.promise);
    window.spexNative = { pickDirectory: async () => null, pickFile };
    try {
      renderWorkspace(draftInfo({ state: "no-source", firstLine: null }), { view: foldView([]), source: null });
      act(() => {
        useAppStore.setState({ projects: [PROJECT, OTHER_PROJECT] });
      });
      await start();
      await vi.waitFor(() => expect(pickFile).toHaveBeenCalledTimes(1));
      const noSource = draftInfo({ projectId: OTHER_ID, instance: "inst-2", state: "no-source", firstLine: null, touchedAt: now });
      act(() => {
        departTo(noSource);
        useAppStore.getState().setDraftSourceMode("triage", THEIR_MODE);
        useAppStore.getState().setDraftComposer("triage", THEIR_COMPOSER.draft);
      });
      await act(async () => {
        pick.resolve("/Users/dev/skill/SKILL.md");
        await settle();
      });
      expect(commandMock).not.toHaveBeenCalledWith("draft.source.write", expect.anything());
      const state = useAppStore.getState();
      expect(state.draftSourceModes.triage).toEqual(THEIR_MODE);
      expect(state.draftComposers.triage).toEqual(THEIR_COMPOSER);
      expect(state.draftErrors.triage).toBeUndefined();
    } finally {
      delete window.spexNative;
    }
  });

  test("playbook-library-105: a state naming the held instance under another project is the session moved: everything stays and the next command names the new project", async () => {
    await holdFormer();
    act(() => {
      deliverServerMessageForTests({ type: "draft.state", draft: { ...COMPILED, projectId: OTHER_ID } });
    });
    const state = useAppStore.getState();
    expect(state.drafts.triage).toEqual({ ...COMPILED, projectId: OTHER_ID });
    expect(state.draftViews.triage?.view.lastSeq).toBe(9);
    expect(state.draftComposers.triage).toEqual({ draft: "half a thought" });
    expect(state.draftEditors.triage?.draft).toBe("# Triage, edited");
    expect(state.draftForms.triage).toEqual({ command: "triage", players: { Triager: "dev.coder" }, newPlayers: {} });
    expect(state.openDraftId).toBe("triage");
    expect(screen.getByTestId("authoring-workspace")).toBeTruthy();
    await act(() => useAppStore.getState().sendDraft("triage", "carry on"));
    expect(commandMock).toHaveBeenCalledWith("draft.send", { projectId: OTHER_ID, instance: INSTANCE, draftId: "triage", text: "carry on" });
  });
});

describe("playbook-library-101: the transcript the core now serves", () => {
  /** Two records of a transcript the core read back changed. */
  const REPLACED = [
    rec(1, { type: "captain_status", turnId: null, timestamp: now, message: "◇ Recreated on another device" }),
    rec(2, { type: "captain_status", turnId: null, timestamp: now + 1, message: "◇ Recreated, second line" }),
  ];
  const EDITING = { path: "spex-packages/triage/triage.md", original: "# Triage", draft: "# Triage, edited", preview: false };

  function holdWithEdits(): void {
    renderWorkspace(COMPILED, { view: foldView(THREAD) });
    act(() => {
      useAppStore.setState({
        draftComposers: { triage: { draft: "half a thought" } },
        draftSourceModes: { triage: { mode: "edit", pasteText: "", pastePath: "" } },
        draftEditors: { triage: EDITING },
        draftForms: { triage: { command: "triage", players: { Triager: "dev.coder" }, newPlayers: {} } },
      });
    });
    expect(useAppStore.getState().draftViews.triage?.view.lastSeq).toBe(9);
  }

  function expectEditsKept(): void {
    const state = useAppStore.getState();
    expect(state.draftComposers.triage).toEqual({ draft: "half a thought" });
    expect(state.draftEditors.triage).toEqual(EDITING);
    expect(state.draftSourceModes.triage).toEqual({ mode: "edit", pasteText: "", pastePath: "" });
    expect(state.draftForms.triage).toEqual({ command: "triage", players: { Triager: "dev.coder" }, newPlayers: {} });
    expect((screen.getByTestId("draft-composer") as HTMLTextAreaElement).value).toBe("half a thought");
  }

  test("a replaced transcript under the held instance is drawn from the records it carries, the composer, Source edit and Enable form kept, and a live record then folds", () => {
    holdWithEdits();
    act(() => {
      deliverServerMessageForTests({ type: "draft.history-replaced", draftId: "triage", instance: INSTANCE, projectId: PROJECT_ID, records: REPLACED });
    });
    expect(useAppStore.getState().draftViews.triage?.view.lastSeq).toBe(2);
    expect(screen.getAllByTestId("system-line").map((line) => line.textContent)).toEqual([
      "◇ Recreated on another device",
      "◇ Recreated, second line",
    ]);
    expectEditsKept();
    // A replacement ends no instance: the held one stands.
    expect(useAppStore.getState().drafts.triage.instance).toBe(INSTANCE);
    act(() => {
      deliverServerMessageForTests({ type: "draft.record", ...rec(3, { type: "captain_status", turnId: null, timestamp: now + 2, message: "◇ Next on this device" }), draftId: "triage", instance: INSTANCE });
    });
    expect(useAppStore.getState().draftViews.triage?.view.lastSeq).toBe(3);
    expect(screen.getAllByTestId("system-line").map((line) => line.textContent)).toContain("◇ Next on this device");
  });

  /** The hello a connection opens with (core-service-1): the run it
   * names decides nothing about a held session (playbook-library-101). */
  function hello(bootId: string): void {
    deliverServerMessageForTests({ type: "hello", protocolVersion: 25, coreVersion: "test", bootId });
  }

  test("a reconnect to a restarted core whose listing names the held instance reloads its transcript from the first record and keeps the composer, Source edit and Enable form", async () => {
    act(() => hello("run-1"));
    holdWithEdits();
    /** The core restarted: the same session under the instance it
     * recorded. */
    const restarted = { ...COMPILED, instance: INSTANCE };
    act(() => hello("run-2"));
    const subscribe = vi.fn(async () => null);
    setClientForTests({ command: commandMock, subscribe, unsubscribe: async () => null } as unknown as Parameters<typeof setClientForTests>[0]);
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
      switch (type) {
        case "config.get":
          return CONFIG_STATE;
        case "readiness.get":
          return READINESS;
        case "project.list":
        case "session.list":
          return [];
        case "draft.list":
          return [restarted];
        case "draft.open":
          return { draft: restarted, source: SOURCE, records: REPLACED };
        default:
          return base(type, params);
      }
    });
    await act(async () => {
      await useAppStore.getState().refresh();
    });
    expect(subscribe).toHaveBeenCalledWith({ kind: "draft", draftId: "triage", instance: INSTANCE });
    expect(commandMock).toHaveBeenCalledWith("draft.open", { projectId: PROJECT_ID, draftId: "triage", afterSeq: 0 });
    expect(useAppStore.getState().drafts.triage.instance).toBe(INSTANCE);
    expect(useAppStore.getState().draftViews.triage?.view.lastSeq).toBe(2);
    expect(screen.getAllByTestId("system-line").map((line) => line.textContent)).toEqual([
      "◇ Recreated on another device",
      "◇ Recreated, second line",
    ]);
    expectEditsKept();
    // Later commands name the held instance.
    await act(() => useAppStore.getState().abortDraft("triage"));
    expect(commandMock).toHaveBeenCalledWith("draft.abort", { projectId: PROJECT_ID, instance: INSTANCE, draftId: "triage" });
  });

  test("a reconnect to a restarted core whose listing names another instance in the same project is the former's departure", async () => {
    act(() => hello("run-1"));
    holdWithEdits();
    /** The session deleted and made again while the socket was down,
     * the core restarting after. */
    const remade = { ...draftInfo({ instance: "inst-3", state: "no-source", firstLine: null, touchedAt: now }) };
    act(() => hello("run-2"));
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
      switch (type) {
        case "config.get":
          return CONFIG_STATE;
        case "readiness.get":
          return READINESS;
        case "project.list":
        case "session.list":
          return [];
        case "draft.list":
          return [remade];
        case "draft.open":
          return { draft: remade, source: null, records: [] };
        default:
          return base(type, params);
      }
    });
    await act(async () => {
      await useAppStore.getState().refresh();
    });
    const state = useAppStore.getState();
    expect(state.drafts.triage).toEqual(remade);
    expect(state.draftComposers.triage).toBeUndefined();
    expect(state.draftEditors.triage).toBeUndefined();
    expect(state.draftSourceModes.triage).toBeUndefined();
    expect(state.draftForms.triage).toBeUndefined();
    expect(state.draftViews.triage).toBeUndefined();
    expect(state.openDraftId).toBeUndefined();
    commandMock.mockClear();
    await act(() => useAppStore.getState().openDraft("triage"));
    expect(commandMock).toHaveBeenCalledWith("draft.open", { projectId: PROJECT_ID, draftId: "triage", afterSeq: 0 });
    await act(() => useAppStore.getState().abortDraft("triage"));
    expect(commandMock).toHaveBeenCalledWith("draft.abort", { projectId: PROJECT_ID, instance: "inst-3", draftId: "triage" });
  });
});


test("run-view-159: authoring queues an attachment-only message and clears only acknowledged files", async () => {
  const asset = { assetId: `sha256:${"c".repeat(64)}` as const, name: "flow.png", mimeType: "image/png", byteLength: 4 };
  renderWorkspace(draftInfo({ activity: "turn", queued: [{ text: "", attachments: [asset] }] }), { view: foldView(THREAD.slice(0, 5)) });
  expect(screen.getByTestId("draft-queue").textContent).toContain("flow.png");
  act(() => useAppStore.getState().stageAttachmentAssets("draft:triage", { kind: "draft", projectId: PROJECT_ID, id: "triage" }, [asset]));
  fireEvent.click(screen.getByTestId("draft-send"));
  await vi.waitFor(() => expect(commandMock).toHaveBeenCalledWith("draft.send", { projectId: PROJECT_ID, instance: INSTANCE, draftId: "triage", text: "", attachments: [asset] }));
  await vi.waitFor(() => expect(useAppStore.getState().attachmentDrafts["draft:triage"]).toEqual([]));
});
