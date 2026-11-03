// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// DR-058/DR-104/DR-176 authoring coverage over a simulated document:
// the Authoring section and the New playbook field of the project's
// Playbooks tab and of the Playbooks surface, each listing and creating
// in its own environment (playbook-library-50/51), the workspace's
// header, tabs — Source, Gears, Machine, Add — and compile control by
// the state table (playbook-library-52/57/59/60), the conversation's
// bubbles, cards — "Proposed /<command>" with "Open Add" — and running
// mark (playbook-library-53), the composer's labels and queue
// (playbook-library-54), the agent picker (playbook-library-55), the
// Source tab's path, edit, conflict, and paste paths
// (playbook-library-56), the band's phases, failure and Cancel
// (playbook-library-57/58, playbook-library-30), the Add tab's prefill
// precedence and mismatch, asking no destination, and the card it lists
// with its success line (playbook-library-61, playbook-library-10) and
// its role defaults (playbook-library-88), Publish beneath it
// (playbook-library-93) or "Sign in to publish at <name>" by the
// project's instance and the home's (playbook-library-111), Delete's
// confirm (playbook-library-63), the example prefill
// (playbook-library-35), and the 14-character budget on every workspace
// control (DR-041).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type {
  CommandResults,
  ConfigState,
  DraftInfo,
  GroupsState,
  ReadinessEntry,
  TmuxPlayRecord,
} from "@sublang/spex-core/protocol";
import { groupsState, instanceState, namespace, repositoryRow } from "../fixtures/groups-state.js";
import { OWN_KEY, available, home } from "../fixtures/playbooks.js";

afterEach(cleanup);

const { commandMock } = vi.hoisted(() => ({ commandMock: vi.fn() }));

vi.mock("../state/store.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../state/store.js")>();
  return { ...actual, getClient: () => ({ command: commandMock, subscribe: async () => null, unsubscribe: async () => null }) };
});

import { PlaybooksTab } from "./PlaybooksTab.js";
import { PlaybooksSurface } from "./PlaybooksSurface.js";
import { SLC_DEMO } from "../examples/slc-demo.js";
import { activateLanguage } from "../i18n.js";
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
        origin: "project",
      },
    ],
    standsAside: [],
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

/** A playbook the project's environment alone places (playbook-library-1). */
function projectPlaybook(over: Parameters<typeof available>[0]): ReturnType<typeof available> {
  return available({ repository: PROJECT_ID, placedBy: ["project"], ...over });
}

/** What the environments place: the project's own `code` playbook, its
 * entry written there, and the built-in `review` both environments
 * place, listed once under Global on its default binding. */
function playbookLists(extra: ReturnType<typeof available>[] = []): CommandResults["environment.playbooks"] {
  return {
    project: [
      projectPlaybook({
        id: "code",
        package: "acme/flows",
        version: "2.0.0",
        source: "registry",
        roles: ["coder", "reviewer"],
        entry: ["project"],
        bindings: {
          coder: { playerId: "dev.coder", display: "claude-opus-5 @ high", from: "project" },
          reviewer: { playerId: "dev.reviewer", display: "gpt-6-astra", from: "project" },
        },
        written: {
          project: {
            coder: { playerId: "dev.coder", display: "claude-opus-5 @ high" },
            reviewer: { playerId: "dev.reviewer", display: "gpt-6-astra" },
          },
        },
      }),
      available({ id: "review", repository: PROJECT_ID, roles: ["host"], placedBy: ["project", "own"] }),
      ...extra,
    ],
    own: [available({ id: "review", roles: ["host"], placedBy: ["project", "own"] })],
  };
}

let lists: CommandResults["environment.playbooks"];
/** The license `draft.defaults` derives from the project's LICENSE. */
let defaultLicense: string | null;

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
const PROJECT = {
  id: PROJECT_ID,
  path: "/work/demo",
  name: "demo",
  registeredAt: now - 30 * HOUR,
  repository: { key: PROJECT_ID, name: "demo-spex", group: "me", own: true },
};

/** The session's recorded instance every command on it names. */
const INSTANCE = "72000000-0000-4000-8000-0000000000aa";

function draftInfo(overrides: Partial<DraftInfo> = {}): DraftInfo {
  return {
    id: "triage",
    instance: INSTANCE,
    projectId: PROJECT_ID,
    // The spec package under development, at spex-packages/acme/triage
    // (environments-10).
    package: "acme/triage",
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
    registryAccounts: { "https://spex.example": { origin: "https://spex.example", displayName: "Spex Example", account: { id: "registry", login: "me" }, signIn: { phase: "idle" }, error: null } },
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
  return render(<PlaybooksTab project={PROJECT} />);
}

function tab(name: string): HTMLButtonElement {
  return screen.getByRole("tab", { name }) as HTMLButtonElement;
}

/** The instance the scripted core reports for an environment
 * (environments-2): absent, the home's default instance is meant. */
let environmentInstance: string | undefined;
let missingRegistry = false;

beforeEach(() => {
  environmentInstance = undefined;
  missingRegistry = false;
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
  defaultLicense = "Apache-2.0";
  commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
    const state = useAppStore.getState();
    switch (type) {
      case "compile.check":
        return { node: { ok: true, version: "v23.6.0", command: "node" }, slc: { ok: true, command: ["npx", "@sublang/slc"] } };
      case "environment.playbooks":
        return lists;
      case "environment.get":
        return { repository: String(params?.repository), language: null, requests: {}, packages: [], stale: null, conflicts: null, busy: null, error: null,
          ...(missingRegistry ? {} : { registry: { origin: environmentInstance ?? "https://spex.example", legacy: false } }), ...(environmentInstance !== undefined ? { instance: environmentInstance } : {}) };
      case "registry.orgs":
        return { orgs: [{ name: "me", path: "me", role: "Owner" }] };
      case "registry.get": {
        const origin = String(params?.origin ?? "https://spex.example");
        return state.registryAccounts?.[origin] ?? { origin, displayName: new URL(origin).host, account: null, signIn: { phase: "idle" }, error: null };
      }
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
      case "draft.defaults":
        // The registry-only suggestion and the license this project names
        // (playbook-library-103); publication ignores older org defaults.
        return { org: "me", license: defaultLicense };
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
        intake: draftInfo({ id: "intake", state: "added", added: true, compile: { at: now - HOUR, by: "boss", outcome: "ok", roles: ["Triager"] } }),
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
    render(<PlaybooksTab project={PROJECT} />);
    const section = screen.getByTestId("drafts-section");
    expect(within(section).getByRole("heading").textContent).toBe("Authoring");
    // After the playbooks; the packages stand on their own tab
    // (playbook-library-1).
    const playbooks = await screen.findByTestId("playbooks-global");
    expect(
      playbooks.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByTestId("add-packages")).toBeNull();
    expect(within(section).queryByTestId("draft-row-elsewhere")).toBeNull();
    // An added playbook's session stays, its chip saying so.
    expect(within(within(section).getByTestId("draft-row-intake")).getByTestId("draft-chip").textContent).toBe("Added");

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
      "Package folder not in the project folder · only Delete remains",
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

  test("without a session the section is absent, the empty state a key phrase, and the field stands after the playbooks", async () => {
    lists = { project: [], own: [] };
    seed();
    render(<PlaybooksTab project={PROJECT} />);
    expect(screen.queryByTestId("drafts-section")).toBeNull();
    const empty = await screen.findByTestId("playbooks-empty");
    expect(empty.textContent).toBe("No playbooks yet");
    // A heading with no row is left out (playbook-library-1).
    expect(screen.queryByTestId("playbooks-project")).toBeNull();
    expect(screen.queryByTestId("playbooks-global")).toBeNull();
    const field = screen.getByTestId("new-playbook-section");
    expect(empty.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("new-playbook-button").textContent).toBe("Start writing");
    // The id's caption names the command it becomes: the example's
    // while none is typed, then the id as typed once it is one.
    const caption = screen.getByTestId("new-playbook-caption");
    expect(caption.textContent).toBe("Lowercase, becomes /triage");
    fireEvent.change(screen.getByTestId("new-playbook-id"), { target: { value: "sort-issues" } });
    expect(caption.textContent).toBe("Lowercase, becomes /sort-issues");
    fireEvent.change(screen.getByTestId("new-playbook-id"), { target: { value: "Sort" } });
    expect(caption.textContent).toBe("Lowercase, becomes /triage");
  });

  test("another project's sessions stand on that project's tab, its open workspace there alone", async () => {
    const other = draftInfo({ id: "elsewhere", projectId: "acme/tools-spex" });
    seed({ drafts: { elsewhere: other }, openDraftId: "elsewhere" });
    render(<PlaybooksTab project={PROJECT} />);
    await screen.findByTestId("playbooks-project");
    expect(screen.queryByTestId("authoring-workspace")).toBeNull();
    expect(screen.queryByTestId("drafts-section")).toBeNull();
    expect(screen.getByTestId("new-playbook-section")).toBeTruthy();
  });
});

describe("playbook-library-51: New playbook asks for the id", () => {
  test("an id outside the Agent Skills name rule, or one an environment's playbook holds, is refused in place", async () => {
    seed();
    render(<PlaybooksTab project={PROJECT} />);
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
    // A built-in's id is a playbook of its package as any other's.
    expect(screen.getByTestId("new-playbook-error").textContent).toBe("review is already a playbook of sublang/playbooks");
    expect(commandMock).not.toHaveBeenCalledWith("draft.create", expect.anything());
  });

  test("creation asks only for a command and never reads publishing defaults or rights", async () => {
    defaultLicense = null;
    seed({ registryAccounts: {} });
    render(<PlaybooksTab project={PROJECT} />);
    await screen.findByTestId("new-playbook");
    expect(screen.getByLabelText("Command")).toBe(screen.getByTestId("new-playbook-id"));
    expect(screen.queryByTestId("new-playbook-org")).toBeNull();
    expect(screen.queryByTestId("new-playbook-license")).toBeNull();
    expect(commandMock.mock.calls.filter(([type]) => type === "draft.defaults" || type === "registry.orgs")).toEqual([]);
    const input = screen.getByTestId("new-playbook-id");
    fireEvent.change(input, { target: { value: "triage" } });
    expect(screen.getByTestId("new-playbook-caption").textContent).toContain("/triage");
    expect((screen.getByTestId("new-playbook-button") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.keyDown(input, { key: "Enter" });
    await vi.waitFor(() => expect(commandMock).toHaveBeenCalledWith("draft.create", { projectId: PROJECT_ID, draftId: "triage" }));
    expect(await screen.findByTestId("authoring-workspace")).toBeTruthy();
  });

  test("Enter creates the draft and opens its workspace; an existing draft's id opens that draft", async () => {
    seed({ drafts: { changelog: { ...COMPILED, id: "changelog" } } });
    render(<PlaybooksTab project={PROJECT} />);
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

  test("a draft is made in the spex repository of the project whose tab it is", async () => {
    const other = { ...PROJECT, id: "acme/tools-spex", name: "tools", repository: { key: "acme/tools-spex", name: "tools-spex", group: "acme", own: false } };
    seed({ projects: [PROJECT, other], currentProjectId: "acme/tools-spex" });
    render(<PlaybooksTab project={other} />);
    const input = screen.getByTestId("new-playbook-id");
    fireEvent.change(input, { target: { value: "triage" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("draft.create", { projectId: "acme/tools-spex", draftId: "triage" }),
    );
  });
});

describe("playbook-library-105: creation and the commit line after an Add", () => {
  test("the example starts a local draft without asking for a license or publishing name", async () => {
    defaultLicense = null;
    seed({ registryAccounts: {} });
    render(<PlaybooksTab project={PROJECT} />);
    const prefill = screen.getByTestId("example-prefill") as HTMLButtonElement;
    expect(prefill.disabled).toBe(false);
    fireEvent.click(prefill);
    await vi.waitFor(() => expect(commandMock).toHaveBeenCalledWith("draft.create", {
      projectId: PROJECT_ID, draftId: SLC_DEMO.playbookId,
    }));
    expect(await screen.findByTestId("source-paste")).toBeTruthy();
    expect(commandMock.mock.calls.filter(([type]) => type === "draft.defaults" || type === "registry.orgs")).toEqual([]);
  });

  test.each(["en", "zh"] as const)("the added card's success line names the folder to commit, standing past its highlight (%s)", async (language) => {
    activateLanguage(language);
    try {
      lists = playbookLists([
        projectPlaybook({ id: "triage", package: "acme/triage", version: "0.1.0", source: "path", roles: ["Triager"] }),
      ]);
      seed({ drafts: { triage: draftInfo({ state: "added", added: true, packagePath: "spex-packages/acme/triage" }) }, revealPlaybook: "triage" });
      render(<PlaybooksTab project={PROJECT} />);
      const card = await screen.findByTestId("playbook-card-triage");
      // Under the project's name: its package is the project's.
      expect(within(screen.getByTestId("playbooks-project")).getByTestId("playbook-card-triage")).toBe(card);
      const line = await within(card).findByTestId("added-commit");
      expect(line.textContent).toBe(
        language === "zh" ? "把 spex-packages/acme/triage 和代码一起提交" : "Commit spex-packages/acme/triage with your code",
      );
      expect(line.querySelector("code")?.textContent).toBe("spex-packages/acme/triage");
      await vi.waitFor(() => expect(screen.getByTestId("playbook-card-triage").className).not.toContain("ring-2"), { timeout: 4000 });
      expect(within(screen.getByTestId("playbook-card-triage")).getByTestId("added-commit").textContent).toBe(line.textContent);
    } finally {
      activateLanguage("en");
    }
  });
});

describe("playbook-library-63: Delete behind the inline confirm", () => {
  test("Keep writes nothing; Delete removes the session, saying its spec package folder stays", async () => {
    seed({ drafts: { triage: draftInfo() } });
    render(<PlaybooksTab project={PROJECT} />);
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
      expect(commandMock).toHaveBeenCalledWith("draft.delete", { projectId: PROJECT_ID, draftId: "triage", instance: INSTANCE }),
    );
    await vi.waitFor(() => expect(screen.queryByTestId("draft-row-triage")).toBeNull());
    // The folder stays, and the surface says where.
    const note = "Deleted triage; its spec package folder stays at spex-packages/acme/triage";
    expect((await screen.findByTestId("deleted-note")).textContent).toBe(note);
    expect(screen.getByTestId("library-live").textContent).toBe(note);
  });

  test("a removal broadcast drops the draft everywhere, closing an open workspace", () => {
    renderWorkspace(draftInfo(), { view: foldView(THREAD) });
    expect(screen.getByTestId("authoring-workspace")).toBeTruthy();
    act(() => {
      deliverServerMessageForTests({ type: "draft.removed", projectId: PROJECT_ID, draftId: "triage" });
    });
    expect(screen.queryByTestId("authoring-workspace")).toBeNull();
    expect(screen.queryByTestId("drafts-section")).toBeNull();
    expect(useAppStore.getState().draftViews.triage).toBeUndefined();
    expect(useAppStore.getState().openDraftId).toBeUndefined();
  });

  test("a working draft is deleted all the same", async () => {
    seed({ drafts: { triage: draftInfo({ activity: "compiling", state: "compiling" }) } });
    render(<PlaybooksTab project={PROJECT} />);
    fireEvent.click(screen.getByTestId("draft-delete-triage"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("draft.delete", { projectId: PROJECT_ID, draftId: "triage", instance: INSTANCE }),
    );
  });
});

describe("playbook-library-52: the workspace replaces the list", () => {
  test("the header carries the way back, the id with its spec package, and the chip; returning ends nothing", async () => {
    renderWorkspace(draftInfo({ package: "acme/triage" }), { view: foldView(THREAD) });
    expect(screen.queryByTestId("playbook-card-code")).toBeNull();
    const header = screen.getByTestId("authoring-workspace").querySelector("header")!;
    expect(screen.getByTestId("workspace-back").textContent).toContain("Playbooks");
    expect(header.textContent).toContain("triage");
    expect(within(header).getByTestId("workspace-package").textContent).toBe("acme/triage");
    expect(within(header).getByTestId("workspace-package").title).toBe("spex-packages/acme/triage");
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
      "Add",
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
    for (const name of ["Gears", "Machine", "Add"]) {
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

  test("a draft with a source compiles beside a turn; a running compile holds it with its reason", async () => {
    renderWorkspace(draftInfo());
    const compile = () => screen.getByTestId("compile-button") as HTMLButtonElement;
    expect(compile().disabled).toBe(false);
    expect(screen.getByTestId("tab-dot-source")).toBeTruthy();
    fireEvent.click(compile());
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("draft.compile", { projectId: PROJECT_ID, draftId: "triage", instance: INSTANCE }, { timeoutMs: 0 }),
    );

    act(() => {
      deliverServerMessageForTests({ type: "draft.state", draft: draftInfo({ activity: "turn" }) });
    });
    expect(compile().disabled).toBe(false);

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

  test("playbook-library-101: a compile the core refuses because another job writes the folder shows that refusal, Compile staying enabled", async () => {
    commandMock.mockImplementation(async (type: string) => {
      if (type === "draft.compile") throw Object.assign(new Error("a compile is writing /work/spex-packages/acme/triage/playbooks/en/triage; retry once it ends"), { code: "busy" });
      if (type === "draft.list") return Object.values(useAppStore.getState().drafts);
      if (type === "compile.check") return { node: { ok: true, version: "v23.6.0", command: "node" }, slc: { ok: true, command: ["npx"] } };
      return null;
    });
    renderWorkspace(draftInfo(), { view: foldView(THREAD) });
    const compile = () => screen.getByTestId("compile-button") as HTMLButtonElement;
    fireEvent.click(compile());
    await vi.waitFor(() => expect(screen.getByTestId("draft-error").textContent).toContain("a compile is writing"));
    expect(compile().disabled).toBe(false);
    expect(compile().textContent).toBe("Compile");
  });

  test("a turn and a compile at once: Abort and the turn's clock stand beside Compiling… and Cancel", () => {
    renderWorkspace(
      draftInfo({ activity: "turn", compiling: true, state: "compiling", compile: { at: now, by: "boss", outcome: "running" } }),
      { view: foldView(THREAD.slice(0, 5)), lines: ["→ normalize (writing triage.playbook/triage.normalize)"], times: [now] },
    );
    expect(screen.getByTestId("draft-abort").textContent).toBe("Abort");
    expect(screen.getByTestId("draft-working").textContent).toMatch(/^working · /);
    expect((screen.getByTestId("draft-composer") as HTMLTextAreaElement).placeholder).toBe("Sends after the reply…");
    const compile = screen.getByTestId("compile-button") as HTMLButtonElement;
    expect(compile.textContent).toBe("Compiling…");
    expect(compile.disabled).toBe(true);
    expect(screen.getByTestId("compile-cancel")).toBeTruthy();
    expect(screen.getByTestId("draft-chip").textContent).toBe("runningCompiling");
  });

  test("a successful compile fills Gears and Machine, enables Add with a dot, and Changed captions the artifacts", async () => {
    renderWorkspace(COMPILED, { view: foldView(THREAD) });
    await vi.waitFor(() => expect(tab("Gears").disabled).toBe(false));
    expect(tab("Add").disabled).toBe(false);
    expect(tab("Add").title).toBe("Confirm the command, intent and players, then add it");
    expect(screen.getByTestId("tab-add")).toBe(tab("Add"));
    expect(screen.getByTestId("tab-dot-add")).toBeTruthy();
    expect(screen.queryByTestId("tab-dot-source")).toBeNull();
    expect(screen.getByTestId("compile-roles").textContent).toBe("roles: Triager, Verifier");

    fireEvent.click(tab("Gears"));
    expect(screen.getByTestId("item-TRIAGE-1")).toBeTruthy();
    expect(screen.getByTestId("stage-box-draft-triage")).toBeTruthy();
    fireEvent.click(tab("Machine"));
    expect(screen.getByTestId("stage-states-draft-triage").textContent).toContain("ready");
    expect(screen.getByTestId("panel-machine").textContent).toContain("xstate");
    expect(screen.queryByTestId("artifact-caption")).toBeNull();

    // Opening Add clears its dot.
    fireEvent.click(tab("Add"));
    expect(screen.queryByTestId("tab-dot-add")).toBeNull();

    // The source changed since: the chip says so and the artifacts are captioned.
    act(() => {
      deliverServerMessageForTests({ type: "draft.state", draft: { ...COMPILED, state: "changed" } });
    });
    expect(screen.getByTestId("draft-chip").textContent).toBe("Changed");
    fireEvent.click(tab("Gears"));
    expect(screen.getByTestId("artifact-caption").textContent).toBe("from the compile before this change");
    expect(screen.getByTestId("tab-dot-source")).toBeTruthy();
  });

  test("an interrupted compile says so with Compile enabled; a failure shows the outputs as the run left them, not compiled", async () => {
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
    expect(tab("Add").disabled).toBe(true);
    fireEvent.click(tab("Machine"));
    expect(screen.getByTestId("artifact-caption").textContent).toBe("as the last run left them, not compiled");
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
      expect(commandMock).toHaveBeenCalledWith("compile.abort", { playbookId: "triage", instance: INSTANCE }),
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
    expect(cards[1].textContent).toContain("Proposed /triage");
    expect(cards[1].textContent).toContain("Triager");
    expect(cards[1].textContent).toContain("dev.triager");
    // The fence itself never shows as text.
    expect(thread.textContent).not.toContain("```spex");
    expect(thread.textContent).not.toContain("kind: compile");
    // playbook-library-107: a block Spex could not read stays as code,
    // its caption saying why in its visible text, not behind a hover.
    const malformed = within(thread).getByTestId("directive-malformed");
    expect(malformed.textContent).toContain("kind: deploy");
    const caption = within(malformed).getByTestId("directive-malformed-caption");
    expect(caption.textContent).toBe("Spex could not read this block — unknown kind deploy");
    expect(caption.getAttribute("title")).toBeNull();
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
    expect(within(thread).getAllByTestId("player-result")[0].textContent).toBe("✓ done");
    // Open Add lands on the tab.
    expect(within(cards[1]).getByTestId("open-add").textContent).toBe("Open Add");
    fireEvent.click(within(cards[1]).getByTestId("open-add"));
    expect(tab("Add").getAttribute("aria-selected")).toBe("true");
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
      expect(commandMock).toHaveBeenCalledWith("draft.send", { projectId: PROJECT_ID, draftId: "triage", instance: INSTANCE, text: "Triage issues into labels" }),
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
    await vi.waitFor(() => expect(commandMock).toHaveBeenCalledWith("draft.abort", { projectId: PROJECT_ID, draftId: "triage", instance: INSTANCE }));
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
      expect(commandMock).toHaveBeenCalledWith("draft.player.set", { projectId: PROJECT_ID, draftId: "triage", instance: INSTANCE, playerId: "dev.reviewer" }),
    );
    await vi.waitFor(() => expect(screen.queryByTestId("agent-picker")).toBeNull());
    expect(screen.getByTestId("draft-agent").textContent).toContain("dev.reviewer");
  });

  test("the picker stays open while a turn runs; a choice applies to the next", () => {
    renderWorkspace(draftInfo({ activity: "turn" }), { view: foldView(THREAD.slice(0, 5)) });
    const chip = screen.getByTestId("draft-agent") as HTMLButtonElement;
    expect(chip.disabled).toBe(false);
    expect(chip.title).toBe("Choose which agent answers");
  });
});

describe("playbook-library-56: the Source tab", () => {
  test("renders the markdown captioned with its path in the working folder and who changed it and when; Edit saves under the token", async () => {
    renderWorkspace(draftInfo());
    expect(screen.getByTestId("source-path").textContent).toBe("spex-packages/acme/triage/playbooks/en/triage/triage.md");
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
        draftId: "triage",
        instance: INSTANCE,
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
      expect(commandMock).toHaveBeenCalledWith("draft.source.write", { projectId: PROJECT_ID, draftId: "triage", instance: INSTANCE, content: "# Triage\n\nMine." }),
    );
  });

  test("Save and Use as source write beside a turn or a compile", async () => {
    renderWorkspace(draftInfo({ activity: "turn" }));
    fireEvent.click(screen.getByTestId("source-edit"));
    fireEvent.change(screen.getByTestId("editor-text"), { target: { value: "changed" } });
    const save = screen.getByTestId("editor-save") as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("draft.source.write", expect.objectContaining({ draftId: "triage", instance: INSTANCE, content: "changed" })),
    );

    cleanup();
    renderWorkspace(draftInfo({ activity: "compiling", state: "compiling", compile: { at: now, by: "boss", outcome: "running" } }));
    fireEvent.click(screen.getByTestId("source-paste"));
    fireEvent.change(screen.getByTestId("paste-text"), { target: { value: "# Pasted" } });
    const use = screen.getByTestId("paste-use") as HTMLButtonElement;
    expect(use.disabled).toBe(false);
    expect(screen.getByTestId("paste-caption").textContent).toBe("Replaces the playbook's source");
    fireEvent.click(use);
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("draft.source.write", expect.objectContaining({ content: "# Pasted", instance: INSTANCE })),
    );
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
      expect(commandMock).toHaveBeenCalledWith("draft.source.write", { projectId: PROJECT_ID, draftId: "triage", instance: INSTANCE, content: "# Secaudit\n\nRoles:\n- Auditor" }),
    );
    await vi.waitFor(() => expect(screen.getByTestId("source-view")).toBeTruthy());
    expect(screen.getByTestId("source-caption").textContent).toBe("Updated just now by you");

    fireEvent.click(screen.getByTestId("source-paste"));
    fireEvent.change(screen.getByTestId("paste-path"), { target: { value: "/tmp/skill.md" } });
    expect(screen.getByTestId("paste-caption").textContent).toBe("The file is copied in as the playbook's source");
    fireEvent.click(use());
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("draft.source.write", { projectId: PROJECT_ID, draftId: "triage", instance: INSTANCE, sourcePath: "/tmp/skill.md" }),
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

describe("playbook-library-61: the Add tab", () => {
  test("prefills from the derived defaults, then the proposal, with the Boss's edits winning", async () => {
    renderWorkspace(COMPILED, { view: foldView(THREAD) });
    await vi.waitFor(() => expect(tab("Add").disabled).toBe(false));
    fireEvent.click(tab("Add"));
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
    // The player another playbook binds says which, never a position
    // (playbook-library-38).
    expect(screen.getByTestId("register-shared-Verifier").textContent).toBe("also in /code");
    expect(screen.getByTestId("register-shared-Verifier").title).toBe("Also plays in /code");
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
    await vi.waitFor(() => expect(tab("Add").disabled).toBe(false));
    fireEvent.click(tab("Add"));
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
    await vi.waitFor(() => expect(tab("Add").disabled).toBe(false));
    fireEvent.click(tab("Add"));
    const coder = () => screen.getByTestId("register-player-coder") as HTMLSelectElement;
    const offered = () => Array.from(coder().options).map((option) => option.textContent);
    expect(coder().value).toBe("dev.coder");
    expect(offered()).toContain("New player dev.coder-2");

    // With dev.coder-2 on the roster as well, the first free suffix
    // moves on, and the existing lane stays the choice.
    const valid = CONFIG_STATE as Extract<ConfigState, { status: "valid" }>;
    act(() => {
      useAppStore.setState({
        configState: {
          ...valid,
          summary: {
            ...valid.summary,
            players: [
              ...valid.summary.players,
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

  test("Add writes the bindings and the new players, naming no destination, then the list opens with the card in view and the session stays", async () => {
    renderWorkspace(
      { ...COMPILED, proposal: { command: "triage", intent: "Triage a new issue", players: { Triager: "dev.triager", Verifier: "dev.reviewer" } } },
      { view: foldView(THREAD) },
    );
    await vi.waitFor(() => expect(tab("Add").disabled).toBe(false));
    fireEvent.click(tab("Add"));
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
    expect(submit().textContent).not.toBe("Add");
    await vi.waitFor(() => expect(submit().textContent).toBe("Adding…"));
    // No destination is asked: the session's environment takes it
    // (playbook-library-7, playbook-library-61).
    expect(commandMock).toHaveBeenCalledWith("draft.register", {
      projectId: PROJECT_ID,
      draftId: "triage",
      instance: INSTANCE,
      command: "triage",
      intent: "Triage a new issue",
      bindings: { Triager: "dev.triager", Verifier: "dev.reviewer" },
      newPlayers: { "dev.triager": { adapter: "codex", model: "gpt-6-astra", permissions: { mode: "auto" } } },
    });
    // The core requested the package by path and wrote its entry: the
    // project's environment now places it, and it runs there.
    lists = playbookLists([
      projectPlaybook({
        id: "triage",
        intent: "Triage a new issue",
        package: "acme/triage",
        version: "0.1.0",
        source: "path",
        roles: ["Triager", "Verifier"],
        entry: ["project"],
        bindings: {
          Triager: { playerId: "dev.triager", display: "gpt-6-astra", from: "project" },
          Verifier: { playerId: "dev.reviewer", display: "gpt-6-astra", from: "project" },
        },
      }),
    ]);
    await act(async () => {
      resolve(CONFIG_STATE);
    });
    await vi.waitFor(() => expect(screen.getByTestId("playbook-card-triage")).toBeTruthy());
    const card = screen.getByTestId("playbook-card-triage");
    expect(card.className).toContain("ring-2");
    expect(within(card).getByTestId("playbook-from-triage").textContent).toBe("from acme/triage 0.1.0");
    // Under the project's name, the playbook it runs with its players.
    expect(within(screen.getByTestId("playbooks-project")).getByTestId("playbook-card-triage")).toBe(card);
    // [playbook-library-10] sessions already running must restart.
    expect(within(card).getByTestId("added-note").textContent).toContain("Added · restart running sessions to use it");
    // [playbook-library-61] and the package folder is committed with the code.
    expect(within(card).getByTestId("added-commit").textContent).toBe("Commit spex-packages/acme/triage with your code");
    expect(screen.getByTestId("library-live").textContent).toBe("Added /triage");
    // The session stays, to be worked on further and published; its
    // chip reads Added once the core says so.
    act(() => {
      deliverServerMessageForTests({ type: "draft.state", draft: { ...COMPILED, state: "added", added: true } });
    });
    expect(within(screen.getByTestId("draft-row-triage")).getByTestId("draft-chip").textContent).toBe("Added");
  });

  test("[DR-176] a session of the global environment lists, creates and adds on the Playbooks surface alone, with no commit line", async () => {
    const globalDraft = { ...COMPILED, projectId: OWN_KEY, proposal: { command: "triage", intent: "Triage a new issue", players: { Triager: "dev.coder", Verifier: "dev.reviewer" } } };
    // The global environment's records hold the session
    // (core-service-96): the surface lists it, the project's tab does not.
    seed({ drafts: { triage: globalDraft } });
    const tabView = render(<PlaybooksTab project={PROJECT} />);
    await screen.findByTestId("playbooks-global");
    expect(screen.queryByTestId("draft-row-triage")).toBeNull();
    tabView.unmount();

    lists = { project: null, own: [available({ id: "review", roles: ["host"] })] };
    render(<PlaybooksSurface />);
    const section = await screen.findByTestId("drafts-section");
    expect(within(section).getByTestId("draft-row-triage")).toBeTruthy();
    // New playbook creates in the global environment without publishing setup.
    const input = screen.getByTestId("new-playbook-id");
    fireEvent.change(input, { target: { value: "sorter" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("draft.create", { projectId: OWN_KEY, draftId: "sorter" }),
    );

    // The session's own workspace on the surface: Add asks no
    // destination and lists the card beneath its package's row.
    act(() => {
      useAppStore.setState({ drafts: { triage: globalDraft }, openDraftId: "triage", draftSources: { triage: SOURCE }, draftViews: { triage: foldView(THREAD) } });
    });
    await vi.waitFor(() => expect(tab("Add").disabled).toBe(false));
    fireEvent.click(tab("Add"));
    expect(screen.queryByTestId("register-repository")).toBeNull();
    // The core requests the package by path from the global environment
    // and writes its entry there.
    const triage = { id: "triage", intent: "Triage a new issue", package: "acme/triage", version: "0.1.0", source: "path" as const, roles: ["Triager", "Verifier"] };
    lists = { project: null, own: [available({ id: "review", roles: ["host"] }), available({ ...triage, entry: ["own"] })] };
    const ownState = {
      repository: OWN_KEY, registry: { origin: "https://spex.example", legacy: false }, language: null,
      requests: { "acme/triage": { kind: "path" as const, path: "spex-packages/acme/triage" } },
      packages: [{ name: "acme/triage", version: "0.1.0", source: { kind: "path" as const, detail: "spex-packages/acme/triage" }, direct: true, requiredBy: [], artifacts: [{ id: "triage", kind: "playbook" as const, language: "en", fallback: false, provided: true }], exports: [], installed: true, missingPath: null }],
      stale: null, conflicts: null, busy: null, error: null, pathRoot: "/home/me/.spex/workspace/me/me-spex",
    };
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) =>
      type === "environment.get" && params?.repository === OWN_KEY ? ownState : base(type, params));
    fireEvent.click(screen.getByTestId("register-submit"));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("draft.register", expect.objectContaining({ projectId: OWN_KEY, draftId: "triage" })),
    );
    expect(commandMock.mock.calls.find(([type]) => type === "draft.register")![1]).not.toHaveProperty("repository");
    await vi.waitFor(() => expect(screen.queryByTestId("authoring-workspace")).toBeNull());
    // The lists are read again for the surface, with no project.
    expect(commandMock).toHaveBeenCalledWith("environment.playbooks", {});
    const card = await screen.findByTestId("playbook-card-triage");
    expect(within(screen.getByTestId("surface-playbooks-acme/triage")).getByTestId("playbook-card-triage")).toBe(card);
    expect(screen.getAllByTestId("playbook-card-triage")).toHaveLength(1);
    await vi.waitFor(() => expect(within(card).getByTestId("added-note").textContent).toContain("Added · restart running sessions to use it"));
    // Its folder syncs with the global records: nothing to commit.
    expect(within(card).queryByTestId("added-commit")).toBeNull();
    expect(document.body.textContent).not.toContain("Personal");
  });

  test("a refusal names the rule inline and leaves the form standing; a working session adds all the same", async () => {
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
      if (type === "draft.register") throw new Error("player dev.triager collides with a reserved id");
      return base(type, params);
    });
    renderWorkspace(COMPILED, { view: foldView(THREAD) });
    await vi.waitFor(() => expect(tab("Add").disabled).toBe(false));
    fireEvent.click(tab("Add"));
    fireEvent.click(screen.getByTestId("register-submit"));
    await vi.waitFor(() => expect(screen.getByTestId("register-error").textContent).toContain("collides"));
    expect(screen.getByTestId("register-form")).toBeTruthy();
    expect((screen.getByTestId("register-command") as HTMLInputElement).value).toBe("triage");

    act(() => {
      deliverServerMessageForTests({ type: "draft.state", draft: { ...COMPILED, activity: "turn" } });
    });
    const submit = screen.getByTestId("register-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });

  test("with no prose paragraph the intent defaults to the source's title, so the app's own example adds on its defaults", async () => {
    // The example is a title over a roles list and numbered steps.
    renderWorkspace(COMPILED, { view: foldView(THREAD), source: { ...SOURCE, markdown: SLC_DEMO.stages.normalized } });
    await vi.waitFor(() => expect(tab("Add").disabled).toBe(false));
    fireEvent.click(tab("Add"));
    expect((screen.getByTestId("register-intent") as HTMLInputElement).value).toBe(
      "Two-Agent Change-and-Review Workflow",
    );
    expect((screen.getByTestId("register-submit") as HTMLButtonElement).disabled).toBe(false);
  });

  test("an empty intent holds Add until the Boss writes one", async () => {
    // Neither a prose paragraph nor a title to derive one from.
    renderWorkspace(COMPILED, { view: foldView(THREAD), source: { ...SOURCE, markdown: "Roles:\n- Triager\n- Verifier" } });
    await vi.waitFor(() => expect(tab("Add").disabled).toBe(false));
    fireEvent.click(tab("Add"));
    expect((screen.getByTestId("register-intent") as HTMLInputElement).value).toBe("");
    const submit = screen.getByTestId("register-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    // The held Add says what it waits for, in its tooltip alone: no
    // caption explains what Add writes (playbook-library-61).
    expect(submit.title).toBe("A player per role, a command and an intent");
    const form = screen.getByTestId("register-form").textContent ?? "";
    expect(form).not.toContain("Requests the spec package");
    expect(form).not.toContain("Every role needs a player");
    fireEvent.change(screen.getByTestId("register-intent"), { target: { value: "Sort issues" } });
    expect(submit.disabled).toBe(false);
    expect(submit.title).toBe("");
  });
});

describe("playbook-library-93: Publish beneath the Add form", () => {
  const PREVIEW = {
    instance: { origin: "https://spex.example", name: "Spex Example" },
    orgVerified: true,
    name: "acme/triage",
    version: "0.1.0",
    license: "Apache-2.0",
    checksum: "a".repeat(64),
    files: ["meta.yaml", "playbooks/en/triage/triage.md", "playbooks/en/triage/triage.playbook/triage.fsm.ts"],
  };
  const CURRENT = { repository: PROJECT_ID, registry: { origin: "https://spex.example", legacy: false }, language: null, requests: {}, packages: [], stale: null, conflicts: null, busy: null, error: null, pathRoot: null };

  async function openAdd(draft: DraftInfo = COMPILED) {
    renderWorkspace(draft, { view: foldView(THREAD) });
    await vi.waitFor(() => expect(tab("Add").disabled).toBe(false));
    fireEvent.click(tab("Add"));
    // The control stands once the environment's instance is read.
    await screen.findByTestId("publish");
  }

  async function reviewPublish(): Promise<void> {
    if (!screen.queryByTestId("publish-setup")) {
      fireEvent.click(screen.queryByTestId("publish-edit-details") ?? screen.getByTestId("publish-button"));
    }
    await screen.findByTestId("publish-setup");
    await vi.waitFor(() => expect((screen.getByTestId("publish-license") as HTMLInputElement).value).toBe("Apache-2.0"));
    fireEvent.change(screen.getByTestId("publish-org"), { target: { value: "acme" } });
    fireEvent.click(screen.getByTestId("publish-review"));
  }

  test("shows the inline summary, publishes as the account, and reads the published version with its page", async () => {
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) =>
      type === "environment.publish"
        ? params?.dryRun ? { accepted: true, preview: PREVIEW } : { accepted: true }
        : base(type, params),
    );
    await openAdd();
    const publish = screen.getByTestId("publish");
    // Beneath the form.
    expect(
      screen.getByTestId("register-submit").compareDocumentPosition(publish) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await reviewPublish();
    // The checks run first and upload nothing.
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("environment.publish", { repository: PROJECT_ID, name: "acme/triage", draft: { id: "triage", instance: INSTANCE }, publication: { org: "acme", license: "Apache-2.0" }, dryRun: true }, { timeoutMs: 35_000 }),
    );
    const summary = await screen.findByTestId("publish-summary");
    // The registry by its display name, its origin in the tooltip, over
    // the file count and the account and org it publishes as.
    const destination = within(summary).getByTestId("publish-target");
    expect(destination.textContent).toBe("Publish acme/triage 0.1.0 to Spex Example");
    expect(destination.title).toBe("https://spex.example");
    expect(summary.textContent).toContain("Apache-2.0");
    expect(within(summary).getByTestId("publish-count").textContent).toBe("3 files");
    expect([...within(summary).getByTestId("publish-files").querySelectorAll("li")].map((item) => item.textContent)).toEqual(PREVIEW.files);
    expect(within(summary).getByTestId("publish-account").textContent).toBe("as @me in acme");

    // Cancel uploads nothing.
    fireEvent.click(within(summary).getByTestId("publish-cancel"));
    expect(screen.queryByTestId("publish-summary")).toBeNull();
    expect(screen.getByTestId("publish-setup")).toBeTruthy();
    expect((screen.getByTestId("publish-org") as HTMLInputElement).value).toBe("acme");
    expect((screen.getByTestId("publish-license") as HTMLInputElement).value).toBe("Apache-2.0");
    expect(commandMock.mock.calls.filter(([type, params]) => type === "environment.publish" && !params.dryRun)).toHaveLength(0);
    await reviewPublish();
    fireEvent.click(await screen.findByTestId("publish-confirm"));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("environment.publish", { repository: PROJECT_ID, name: "acme/triage", draft: { id: "triage", instance: INSTANCE }, publication: { org: "acme", license: "Apache-2.0" }, expectedChecksum: PREVIEW.checksum }, { timeoutMs: 35_000 }),
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
        state: { ...CURRENT, published: { name: "acme/triage", version: "0.1.0", url: "https://spex.example/acme/triage/0.1.0" } },
      });
    });
    expect(screen.getByTestId("publish-done").textContent).toBe("Published 0.1.0");
    expect(screen.getByTestId("publish-link").getAttribute("href")).toBe("https://spex.example/acme/triage/0.1.0");
  });

  test("an unchecked preview explains the missing publishing check and cannot confirm", async () => {
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) =>
      type === "environment.publish" && params?.dryRun
        ? { accepted: true, preview: { ...PREVIEW, orgVerified: false } }
        : base(type, params),
    );
    await openAdd();
    await reviewPublish();
    expect((await screen.findByTestId("publish-org-unchecked")).textContent).toBe("Org not checked — sign in to Spex Example to check publishing rights");
    const confirm = screen.getByTestId("publish-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    expect(commandMock.mock.calls.filter(([type, params]) => type === "environment.publish" && !params.dryRun)).toHaveLength(0);
  });

  test("a refusal from the checks or the registry shows its issues in place", async () => {
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
      if (type === "environment.publish" && params?.dryRun) throw new Error("meta.yaml: description is required");
      return base(type, params);
    });
    await openAdd();
    await reviewPublish();
    expect((await screen.findByTestId("publish-error")).textContent).toBe("meta.yaml: description is required");
    expect(screen.queryByTestId("publish-summary")).toBeNull();

    // A registry refusal arrives as the environment's failure.
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) =>
      type === "environment.publish"
        ? params?.dryRun ? { accepted: true, preview: PREVIEW } : { accepted: true }
        : base(type, params),
    );
    await reviewPublish();
    fireEvent.click(await screen.findByTestId("publish-confirm"));
    await vi.waitFor(() => expect(screen.queryByTestId("publish-summary")).toBeNull());
    act(() => {
      deliverServerMessageForTests({
        type: "environment.state",
        repository: PROJECT_ID,
        state: { ...CURRENT, error: "the registry refused acme/triage 0.1.0: that version exists" },
      });
    });
    expect(screen.getByTestId("publish-error").textContent).toBe("the registry refused acme/triage 0.1.0: that version exists");
  });
  test("a failed preview can be retried or its publishing details edited without uploading", async () => {
    const base = commandMock.getMockImplementation()!;
    let previews = 0;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
      if (type !== "environment.publish") return base(type, params);
      if (!params?.dryRun) return { accepted: true };
      previews++;
      if (previews === 1) throw new Error("Registry unavailable — Retry");
      if (previews === 2) throw new Error("acme is not yours to publish to");
      const publication = params.publication as { org: string; license: string };
      return { accepted: true, preview: { ...PREVIEW, name: `${publication.org}/triage`, license: publication.license } };
    });
    await openAdd();
    await reviewPublish();
    expect((await screen.findByTestId("publish-error")).textContent).toBe("Registry unavailable — Retry");
    expect(screen.queryByTestId("publish-summary")).toBeNull();
    expect(screen.getByTestId("publish-button").textContent).toBe("Preview again");
    fireEvent.click(screen.getByTestId("publish-button"));
    await vi.waitFor(() => expect(screen.getByTestId("publish-error").textContent).toBe("acme is not yours to publish to"));
    expect(previews).toBe(2);
    expect(screen.queryByTestId("publish-setup")).toBeNull();
    fireEvent.click(screen.getByTestId("publish-edit-details"));
    expect((screen.getByTestId("publish-org") as HTMLInputElement).value).toBe("acme");
    expect((screen.getByTestId("publish-license") as HTMLInputElement).value).toBe("Apache-2.0");
    fireEvent.change(screen.getByTestId("publish-org"), { target: { value: "mine" } });
    fireEvent.change(screen.getByTestId("publish-license"), { target: { value: "MIT" } });
    fireEvent.click(screen.getByTestId("publish-review"));
    const summary = await screen.findByTestId("publish-summary");
    expect(summary.textContent).toContain("Publish mine/triage 0.1.0 to Spex Example");
    expect(screen.getByTestId("publish-license-summary").textContent).toBe("License: MIT");
    expect(screen.queryByTestId("publish-error")).toBeNull();
    expect(previews).toBe(3);
    expect(commandMock.mock.calls.filter(([type, params]) => type === "environment.publish" && !params.dryRun)).toEqual([]);
  });

  test("a checksum conflict discards the old confirmation and requires a fresh preview", async () => {
    const base = commandMock.getMockImplementation()!;
    let previews = 0;
    let uploads = 0;
    const freshChecksum = "b".repeat(64);
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
      if (type !== "environment.publish") return base(type, params);
      if (params?.dryRun) {
        previews++;
        return { accepted: true, preview: previews === 1 ? PREVIEW : {
          ...PREVIEW, checksum: freshChecksum, files: [...PREVIEW.files, "updated.md"],
        } };
      }
      uploads++;
      if (uploads === 1) throw new Error("Files changed since preview — preview again");
      return { accepted: true };
    });
    await openAdd();
    await reviewPublish();
    fireEvent.click(await screen.findByTestId("publish-confirm"));
    expect((await screen.findByTestId("publish-error")).textContent).toBe("Files changed since preview — preview again");
    expect(screen.queryByTestId("publish-summary")).toBeNull();
    expect(screen.queryByTestId("publish-confirm")).toBeNull();
    expect(previews).toBe(1);
    expect(uploads).toBe(1);
    fireEvent.click(screen.getByTestId("publish-button"));
    const summary = await screen.findByTestId("publish-summary");
    expect(within(summary).getByTestId("publish-count").textContent).toBe("4 files");
    expect(within(summary).getByTestId("publish-files").textContent).toContain("updated.md");
    expect(screen.queryByTestId("publish-error")).toBeNull();
    expect(previews).toBe(2);
    expect(uploads).toBe(1);
    fireEvent.click(screen.getByTestId("publish-confirm"));
    await vi.waitFor(() => expect(uploads).toBe(2));
    const confirmed = commandMock.mock.calls.filter(([type, params]) => type === "environment.publish" && !params.dryRun);
    expect(confirmed.map(([, params]) => params.expectedChecksum)).toEqual([PREVIEW.checksum, freshChecksum]);
  });
});

describe("playbook-library-93: Its package beside Publish", () => {
  test("once the project's spex.yaml lists the package, Its package opens its row on the Packages tab", async () => {
    renderWorkspace(COMPILED, { view: foldView(THREAD) });
    await vi.waitFor(() => expect(tab("Add").disabled).toBe(false));
    fireEvent.click(tab("Add"));
    await screen.findByTestId("publish");
    // No row yet, no link.
    expect(screen.queryByTestId("register-package-link")).toBeNull();
    act(() => {
      deliverServerMessageForTests({
        type: "environment.state",
        repository: PROJECT_ID,
        state: {
          repository: PROJECT_ID, registry: { origin: "https://spex.example", legacy: false }, language: null,
          requests: { "acme/triage": { kind: "path", path: "spex-packages/acme/triage" } },
          packages: [], stale: null, conflicts: null, busy: null, error: null, pathRoot: "/work/demo",
        },
      });
    });
    const link = await screen.findByTestId("register-package-link");
    expect(link.textContent).toBe("Its package");
    // Beneath the form, beside Publish.
    expect(
      screen.getByTestId("publish").compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.click(link);
    expect(useAppStore.getState().workspaceTabs[PROJECT_ID]).toBe("packages");
  });
});

describe("playbook-library-111: what stands beneath the Add form by the project's instance and the home's", () => {
  const ONE = "https://one.test";
  const TWO = "https://two.test";

  /** The Groups state the core would send: the home's instances in its
   * list's order, the first its default, else the origin it was created
   * with; the session's project in your namespace at Two, or local-only
   * under your own group. */
  function groups(project: "two" | "local", instances: { origin: string; name: string; signedIn: boolean }[], created = ONE): GroupsState {
    const row = repositoryRow(PROJECT_ID, project === "two" ? { instance: TWO, state: "reachable" } : {});
    const own = repositoryRow(OWN_KEY, { own: true, instance: instances[0]?.origin ?? null });
    return groupsState({
      defaultInstance: instances[0]?.origin ?? created,
      own: { name: "me", named: instances.length === 0, repositories: project === "local" ? [own, row] : [own] },
      instances: instances.map(({ origin, name, signedIn }) =>
        instanceState(origin, {
          displayName: name,
          signedIn,
          groups: [namespace("me", project === "two" && origin === TWO ? [row] : [])],
        }),
      ),
    });
  }

  test.each([
    {
      project: "at Two",
      instances: "One and Two, both signed in",
      space: groups("two", [{ origin: ONE, name: "One", signedIn: true }, { origin: TWO, name: "Two", signedIn: true }]),
      beneath: "Publish",
      // The environment's instance as the core reads it from spex.yaml:
      // its space, else the home's default (environments-2).
      instance: TWO,
    },
    {
      project: "at Two",
      instances: "One signed in, Two signed out",
      space: groups("two", [{ origin: ONE, name: "One", signedIn: true }, { origin: TWO, name: "Two", signedIn: false }]),
      beneath: "Sign in to publish",
      // The environment's instance as the core reads it from spex.yaml:
      // its space, else the home's default (environments-2).
      instance: TWO,
    },
    {
      project: "local-only",
      instances: "One signed in, Two signed out",
      space: groups("local", [{ origin: ONE, name: "One", signedIn: true }, { origin: TWO, name: "Two", signedIn: false }]),
      beneath: "Publish",
      // The environment's instance as the core reads it from spex.yaml:
      // its space, else the home's default (environments-2).
      instance: ONE,
    },
    {
      project: "local-only",
      instances: "One signed out, Two signed in",
      space: groups("local", [{ origin: ONE, name: "One", signedIn: false }, { origin: TWO, name: "Two", signedIn: true }]),
      beneath: "Sign in to publish",
      // The environment's instance as the core reads it from spex.yaml:
      // its space, else the home's default (environments-2).
      instance: ONE,
    },
    {
      project: "local-only",
      instances: "none, the home created with https://spex.pub",
      space: groups("local", [], "https://spex.pub"),
      beneath: "Sign in to publish",
      // The environment's instance as the core reads it from spex.yaml:
      // its space, else the home's default (environments-2).
      instance: "https://spex.pub",
    },
  ])("the session's project $project, the home's instances $instances: $beneath", async ({ space, beneath, instance }) => {
    environmentInstance = instance;
    const onNavigate = vi.fn();
    seed({
      space,
      registryAccounts: { [instance]: { origin: instance, displayName: instance === TWO ? "Two" : instance === ONE ? "One" : new URL(instance).host, account: beneath === "Publish" ? { id: "registry", login: "me" } : null, signIn: { phase: "idle" }, error: null } },
      drafts: { triage: COMPILED },
      openDraftId: "triage",
      draftViews: { triage: foldView(THREAD) },
      draftSources: { triage: SOURCE },
    });
    render(<PlaybooksTab project={PROJECT} onNavigate={onNavigate} />);
    await vi.waitFor(() => expect(tab("Add").disabled).toBe(false));
    fireEvent.click(tab("Add"));
    await screen.findByTestId(beneath === "Publish" ? "publish-button" : "publish-signin");
    const publish = screen.getByTestId("publish");
    // Beneath the form.
    expect(
      screen.getByTestId("register-submit").compareDocumentPosition(publish) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    if (beneath === "Publish") {
      expect(within(publish).getByTestId("publish-button").textContent).toBe("Publish");
      expect(within(publish).queryByTestId("publish-signin")).toBeNull();
      return;
    }
    // One button in the control's place, starting the registry sign-in
    // there.
    expect(within(publish).queryByTestId("publish-button")).toBeNull();
    const signIn = within(publish).getByTestId("publish-signin");
    expect(signIn.textContent).toBe(beneath);
    expect(signIn.title).toBe("For publishing and private packages");
    fireEvent.click(signIn);
    await vi.waitFor(() => expect(commandMock).toHaveBeenCalledWith("registry.signin.start", { origin: instance }));
    expect(onNavigate).not.toHaveBeenCalled();
  });

  test("missing registry state never borrows a signed-in Space account", async () => {
    missingRegistry = true;
    seed({ drafts: { triage: COMPILED }, openDraftId: "triage", draftViews: { triage: foldView(THREAD) }, draftSources: { triage: SOURCE } });
    render(<PlaybooksTab project={PROJECT} />);
    await vi.waitFor(() => expect(tab("Add").disabled).toBe(false));
    fireEvent.click(tab("Add"));
    expect((await screen.findByTestId("publish")).textContent).toBe("Loading registry…");
    expect(screen.queryByTestId("publish-button")).toBeNull();
    expect(commandMock).not.toHaveBeenCalledWith("space.signin.start", expect.anything());
  });

  test.each([
    { lands: "signed in", beneath: "Publish" },
    { lands: "as a failure", beneath: "Sign in to publish" },
  ])("until the account at the registry is read, Loading registry… stands beneath the form; the read landing $lands shows $beneath (playbook-library-93)", async ({ lands, beneath }) => {
    const origin = "https://spex.example";
    const signedIn = { origin, displayName: "Spex Example", account: { id: "registry", login: "me" }, signIn: { phase: "idle" as const }, error: null };
    // Each read of the account is held until released; the core
    // broadcasts the state it read, or the read fails.
    const held: (() => void)[] = [];
    const original = commandMock.getMockImplementation()!;
    commandMock.mockImplementation((type, ...args) =>
      type !== "registry.get"
        ? original(type, ...args)
        : new Promise((resolve, reject) =>
            held.push(() => {
              if (lands === "as a failure") return reject(new Error("Spex Example could not be reached."));
              deliverServerMessageForTests({ type: "registry.state", state: signedIn });
              resolve(signedIn);
            }),
          ));
    seed({ registryAccounts: {}, drafts: { triage: COMPILED }, openDraftId: "triage", draftViews: { triage: foldView(THREAD) }, draftSources: { triage: SOURCE } });
    render(<PlaybooksTab project={PROJECT} />);
    await vi.waitFor(() => expect(tab("Add").disabled).toBe(false));
    fireEvent.click(tab("Add"));
    expect((await screen.findByTestId("publish")).textContent).toBe("Loading registry…");
    expect(screen.queryByTestId("publish-button")).toBeNull();
    expect(screen.queryByTestId("publish-signin")).toBeNull();
    await vi.waitFor(() => expect(held.length).toBeGreaterThan(0));
    await act(async () => {
      for (const land of held.splice(0)) land();
    });
    if (lands === "signed in") {
      expect((await screen.findByTestId("publish-button")).textContent).toBe(beneath);
      expect(screen.queryByTestId("publish-signin")).toBeNull();
      return;
    }
    // A failed read stands as no grant, its cause beside the sign-in.
    expect((await screen.findByTestId("publish-signin")).textContent).toBe(beneath);
    expect(screen.getByTestId("publish-signin-error").textContent).toBe("Spex Example could not be reached");
    expect(screen.queryByTestId("publish-button")).toBeNull();
    expect(commandMock).not.toHaveBeenCalledWith("registry.signin.start", expect.anything());
  });

  test("the target is the environment's instance, not the repository's placement (playbook-library-93)", async () => {
    // Placed at Two, its spex.yaml naming no space, so the environment is
    // the default instance's, One's, where the home is signed in.
    environmentInstance = ONE;
    seed({
      space: groups("two", [{ origin: ONE, name: "One", signedIn: false }, { origin: TWO, name: "Two", signedIn: true }]),
      registryAccounts: { [ONE]: { origin: ONE, displayName: "One", account: { id: "registry", login: "me" }, signIn: { phase: "idle" }, error: null } },
      drafts: { triage: COMPILED },
      openDraftId: "triage",
      draftViews: { triage: foldView(THREAD) },
      draftSources: { triage: SOURCE },
    });
    render(<PlaybooksTab project={PROJECT} />);
    await vi.waitFor(() => expect(tab("Add").disabled).toBe(false));
    fireEvent.click(tab("Add"));
    await screen.findByTestId("publish-button");
    const publish = screen.getByTestId("publish");
    expect(within(publish).getByTestId("publish-button").textContent).toBe("Publish");
    expect(within(publish).queryByTestId("publish-signin")).toBeNull();
  });

  test("a page opened after the registry sign-in reads the account there and offers Publish, never Sign in to publish first (playbook-library-93)", async () => {
    const origin = "https://spex.example";
    const signedIn = { origin, displayName: "Spex Example", account: { id: "registry", login: "me" }, signIn: { phase: "idle" as const }, error: null };
    const original = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type, ...args) => {
      if (type !== "registry.get") return original(type, ...args);
      // The core answers the read and broadcasts the state it read.
      deliverServerMessageForTests({ type: "registry.state", state: signedIn });
      return signedIn;
    });
    seed({ registryAccounts: {}, drafts: { triage: COMPILED }, openDraftId: "triage", draftViews: { triage: foldView(THREAD) }, draftSources: { triage: SOURCE } });
    render(<PlaybooksTab project={PROJECT} />);
    await vi.waitFor(() => expect(tab("Add").disabled).toBe(false));
    fireEvent.click(tab("Add"));
    const button = await screen.findByTestId("publish-button");
    expect(button.textContent).toBe("Publish");
    expect(commandMock).toHaveBeenCalledWith("registry.get", { origin });
    expect(screen.queryByTestId("publish-signin")).toBeNull();
  });
});

describe("playbook-library-121: publication setup owns publishing names and licensing", () => {
  const note = () => screen.queryByTestId("publish-org-note");
  const suggestions = () =>
    [...screen.getByTestId("publish-orgs").querySelectorAll("option")].map((option) => option.value);

  async function openSetup(overrides: Partial<ReturnType<typeof useAppStore.getState>> = {}): Promise<void> {
    seed({ drafts: { triage: { ...COMPILED, package: "local/triage", packagePath: "spex-packages/local/triage" } }, openDraftId: "triage", draftSources: { triage: SOURCE }, ...overrides });
    render(<PlaybooksTab project={PROJECT} />);
    await vi.waitFor(() => expect((screen.getByTestId("tab-add") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId("tab-add"));
    fireEvent.click(await screen.findByTestId("publish-button"));
    await screen.findByTestId("publish-setup");
  }

  async function publicationDefaults(org = "me", license = "Apache-2.0"): Promise<void> {
    await vi.waitFor(() => {
      expect((screen.getByTestId("publish-org") as HTMLInputElement).value).toBe(org);
      expect((screen.getByTestId("publish-license") as HTMLInputElement).value).toBe(license);
    });
  }

  test("an older core's Space-derived default cannot replace the publishing registry's first authorized namespace", async () => {
    const registry = "https://spex.sublang.ai";
    const space = "https://spex.sublang.xyz";
    const original = commandMock.getMockImplementation()!;
    commandMock.mockImplementation((type, ...args) => {
      if (type === "environment.get") return Promise.resolve({ repository: PROJECT_ID, language: null, requests: {}, packages: [], stale: null, conflicts: null, busy: null, error: null, registry: { origin: registry, legacy: false }, instance: space });
      if (type === "registry.get") return Promise.resolve({ origin: registry, displayName: "Package Registry", account: { id: "registry-person", login: "registry-person" }, signIn: { phase: "idle" }, error: null });
      if (type === "registry.orgs") return Promise.resolve({ orgs: [{ name: "zeta", path: "zeta", role: "Owner" }, { name: "registry-owned", path: "registry-owned", role: "Owner" }] });
      if (type === "draft.defaults") return Promise.resolve({ org: "space-group", license: "MIT" });
      return original(type, ...args);
    });
    await openSetup({ space: groupsState({ defaultInstance: space, instances: [instanceState(space, { account: { id: "space-person", login: "space-person", displayName: null, canCreateGroup: false } })] }), registryAccounts: {} });
    await publicationDefaults("registry-owned", "MIT");
    expect(suggestions()).toEqual(["registry-owned", "zeta"]);
    expect(commandMock).toHaveBeenCalledWith("registry.get", { origin: registry });
    expect(commandMock).not.toHaveBeenCalledWith("registry.get", { origin: space });
    const dialog = screen.getByRole("dialog", { name: "Publish playbook" });
    expect(dialog.textContent).not.toContain(space);
    expect(dialog.textContent).not.toContain("space-person");
    expect(screen.getByTestId("publish-org")).not.toHaveProperty("value", "space-group");
  });

  test("without a registry grant, a Space-derived default supplies no creation or publishing identity", async () => {
    const registry = "https://spex.sublang.ai";
    const space = "https://spex.sublang.xyz";
    const original = commandMock.getMockImplementation()!;
    commandMock.mockImplementation((type, ...args) => {
      if (type === "environment.get") return Promise.resolve({ repository: PROJECT_ID, language: null, requests: {}, packages: [], stale: null, conflicts: null, busy: null, error: null, registry: { origin: registry, legacy: false }, instance: space });
      if (type === "draft.defaults") return Promise.resolve({ org: "space-group", license: "MIT" });
      return original(type, ...args);
    });
    seed({ space: groupsState({ defaultInstance: space, instances: [instanceState(space)] }), registryAccounts: { [registry]: { origin: registry, displayName: "Package Registry", account: null, signIn: { phase: "idle" }, error: null } } });
    render(<PlaybooksTab project={PROJECT} />);
    expect(screen.queryByTestId("new-playbook-org")).toBeNull();
    expect(screen.getByTestId("new-playbook").textContent).not.toContain(space);
    fireEvent.change(screen.getByTestId("new-playbook-id"), { target: { value: "local-tool" } });
    expect(screen.getByTestId("new-playbook-button")).toHaveProperty("disabled", false);
    expect(screen.getByTestId("example-prefill")).toHaveProperty("disabled", false);
    fireEvent.keyDown(screen.getByTestId("new-playbook-id"), { key: "Enter" });
    await vi.waitFor(() => expect(commandMock).toHaveBeenCalledWith("draft.create", { projectId: PROJECT_ID, draftId: "local-tool" }));
    expect(commandMock.mock.calls.filter(([type]) => type === "draft.defaults" || type === "registry.orgs" || type === "space.signin.start")).toEqual([]);
  });

  test("clearing an automatic registry publishing name remains explicitly empty through an account refresh", async () => {
    await openSetup();
    await publicationDefaults();
    fireEvent.change(screen.getByTestId("publish-org"), { target: { value: "" } });
    expect(screen.getByTestId("publish-org")).toHaveProperty("value", "");
    const registry = useAppStore.getState().registryAccounts!["https://spex.example"]!;
    act(() => useAppStore.setState({ registryAccounts: { "https://spex.example": { ...registry, account: { id: "refreshed", login: "refreshed" } } } }));
    await vi.waitFor(() => expect(suggestions()).toEqual(["me"]));
    await publicationDefaults("");
    expect(screen.getByTestId("publish-review")).toHaveProperty("disabled", true);
    expect(commandMock.mock.calls.filter(([type]) => type === "environment.publish")).toEqual([]);
  });

  test("loading, failure and retry remain visible without replacing a manually entered publishing name", async () => {
    const original = commandMock.getMockImplementation()!;
    const held: { resolve: (value: unknown) => void; reject: (cause: Error) => void }[] = [];
    commandMock.mockImplementation((type, ...args) => type === "registry.orgs"
      ? new Promise((resolve, reject) => held.push({ resolve, reject })) : original(type, ...args));
    await openSetup();
    await publicationDefaults("");
    await vi.waitFor(() => expect(note()?.textContent).toBe("Loading…"));
    expect(screen.getByTestId("publish-org").getAttribute("list")).toBe("publish-orgs");
    fireEvent.change(screen.getByTestId("publish-org"), { target: { value: "manual-org" } });
    await act(async () => held[0]!.reject(new Error("Registry unavailable")));
    expect((await screen.findByRole("alert")).textContent).toContain("Registry unavailable");
    expect(screen.getByRole("link", { name: "Claim an org" }).getAttribute("href")).toBe("https://spex.example/account/orgs?scope=registry");
    fireEvent.click(screen.getByTestId("publish-orgs-retry"));
    await vi.waitFor(() => expect(note()?.textContent).toBe("Loading…"));
    await act(async () => held[1]!.resolve({ orgs: [{ name: "alpha", path: "alpha", role: "Owner" }, { name: "zeta", path: "zeta", role: "Owner", provider: "github" }] }));
    await vi.waitFor(() => expect(suggestions()).toEqual(["alpha", "zeta"]));
    expect((screen.getByTestId("publish-org") as HTMLInputElement).value).toBe("manual-org");
    expect(note()?.textContent).toBe("not yours to publish to");
    expect(screen.getByTestId("publish-org-guidance").textContent).toContain("To publish, use an org you can claim at this registry.");
    fireEvent.change(screen.getByTestId("publish-org"), { target: { value: "zeta" } });
    expect(note()).toBeNull();
    expect(screen.queryByTestId("publish-org-guidance")).toBeNull();
    expect(commandMock.mock.calls.filter(([type]) => type === "environment.publish")).toEqual([]);
  });

  test("publishing defaults arriving after an edit fill only untouched fields, including after reconnect", async () => {
    const original = commandMock.getMockImplementation()!;
    const held: ((value: unknown) => void)[] = [];
    commandMock.mockImplementation((type, ...args) => type === "draft.defaults"
      ? new Promise((resolve) => held.push(resolve)) : original(type, ...args));
    await openSetup();
    await vi.waitFor(() => expect(held.length).toBeGreaterThan(0));
    fireEvent.change(screen.getByTestId("publish-org"), { target: { value: "typed" } });
    await act(async () => held.forEach((resolve) => resolve({ org: "default-name", license: "MIT" })));
    await publicationDefaults("typed", "MIT");
    const before = held.length;
    act(() => useAppStore.setState({ connection: "closed" }));
    act(() => useAppStore.setState({ connection: "open" }));
    await vi.waitFor(() => expect(held.length).toBeGreaterThan(before));
    await act(async () => held.slice(before).forEach((resolve) => resolve({ org: "another-default", license: "MIT" })));
    await publicationDefaults("typed", "MIT");
  });

  test.each(["Escape", "Close"] as const)("the publishing dialog enters focus and returns to Publish through %s", async (way) => {
    await openSetup();
    await publicationDefaults();
    const dialog = screen.getByRole("dialog", { name: "Publish playbook" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.contains(screen.getByTestId("publish-org"))).toBe(true);
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("publish-org")));
    if (way === "Escape") fireEvent.keyDown(screen.getByTestId("publish-org"), { key: "Escape" });
    else fireEvent.click(screen.getByTestId("publish-close"));
    expect(screen.queryByRole("dialog", { name: "Publish playbook" })).toBeNull();
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("publish-button")));
    expect(commandMock.mock.calls.filter(([type]) => type === "environment.publish")).toEqual([]);
  });

  test("Tab and Shift+Tab keep keyboard focus in the publishing dialog", async () => {
    await openSetup();
    await publicationDefaults();
    const close = screen.getByTestId("publish-close");
    const review = screen.getByTestId("publish-review");
    review.focus();
    fireEvent.keyDown(review, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(review);
    expect(commandMock.mock.calls.filter(([type]) => type === "environment.publish")).toEqual([]);
  });

  test("a review in flight keeps its dialog open, then Escape returns to the edited setup", async () => {
    const original = commandMock.getMockImplementation()!;
    let release!: (value: unknown) => void;
    commandMock.mockImplementation((type, params, ...args) => type === "environment.publish" && params?.dryRun
      ? new Promise((resolve) => { release = resolve; }) : original(type, params, ...args));
    await openSetup();
    await publicationDefaults();
    fireEvent.change(screen.getByTestId("publish-org"), { target: { value: "mine" } });
    fireEvent.change(screen.getByTestId("publish-license"), { target: { value: "MIT" } });
    fireEvent.click(screen.getByTestId("publish-review"));
    await vi.waitFor(() => expect(release).toBeDefined());
    const dialog = screen.getByRole("dialog", { name: "Publish playbook" });
    expect((screen.getByTestId("publish-close") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Publish playbook" })).toBe(dialog);
    await act(async () => release({ accepted: true, preview: {
      instance: { origin: "https://spex.example", name: "Spex Example" },
      name: "mine/triage", version: "0.1.0", license: "MIT", orgVerified: true, files: ["meta.yaml"],
    } }));
    await screen.findByTestId("publish-summary");
    fireEvent.keyDown(screen.getByTestId("publish-confirm"), { key: "Escape" });
    expect(screen.getByTestId("publish-setup")).toBeTruthy();
    expect((screen.getByTestId("publish-org") as HTMLInputElement).value).toBe("mine");
    expect((screen.getByTestId("publish-license") as HTMLInputElement).value).toBe("MIT");
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("publish-review")));
    expect(commandMock.mock.calls.filter(([type, params]) => type === "environment.publish" && !params.dryRun)).toEqual([]);
  });

  test.each(["account", "registry"] as const)("a %s change during an unresolved preview leaves the setup closable", async (change) => {
    const original = commandMock.getMockImplementation()!;
    let release!: (value: unknown) => void;
    commandMock.mockImplementation((type, params, ...args) => type === "environment.publish" && params?.dryRun
      ? new Promise((resolve) => { release = resolve; }) : original(type, params, ...args));
    await openSetup();
    await publicationDefaults();
    fireEvent.change(screen.getByTestId("publish-org"), { target: { value: "mine" } });
    fireEvent.change(screen.getByTestId("publish-license"), { target: { value: "MIT" } });
    fireEvent.click(screen.getByTestId("publish-review"));
    await vi.waitFor(() => expect(release).toBeDefined());
    expect((screen.getByTestId("publish-close") as HTMLButtonElement).disabled).toBe(true);
    const origin = change === "registry" ? "https://next-registry.example" : "https://spex.example";
    act(() => {
      const state = useAppStore.getState();
      useAppStore.setState({
        registryAccounts: { ...state.registryAccounts, [origin]: {
          origin, displayName: "Next Registry", account: { id: "next", login: "next" }, signIn: { phase: "idle" }, error: null,
        } },
        ...(change === "registry" ? { environments: { ...state.environments, [PROJECT_ID]: {
          ...state.environments[PROJECT_ID]!, registry: { origin, legacy: false },
        } } } : {}),
      });
    });
    await screen.findByTestId("publish-setup");
    await vi.waitFor(() => expect((screen.getByTestId("publish-close") as HTMLButtonElement).disabled).toBe(false));
    expect((screen.getByTestId("publish-org") as HTMLInputElement).value).toBe("mine");
    expect((screen.getByTestId("publish-license") as HTMLInputElement).value).toBe("MIT");
    fireEvent.click(screen.getByTestId("publish-close"));
    expect(screen.queryByRole("dialog", { name: "Publish playbook" })).toBeNull();
    await act(async () => release({ accepted: true, preview: {
      instance: { origin: "https://spex.example", name: "Spex Example" },
      name: "mine/triage", version: "0.1.0", license: "MIT", orgVerified: true, files: ["meta.yaml"],
    } }));
    expect(screen.queryByRole("dialog", { name: "Publish playbook" })).toBeNull();
    expect(commandMock.mock.calls.filter(([type, params]) => type === "environment.publish" && !params.dryRun)).toEqual([]);
  });

  test("an accepted upload keeps Close and Escape blocked until publishing settles", async () => {
    const original = commandMock.getMockImplementation()!;
    const preview = {
      instance: { origin: "https://spex.example", name: "Spex Example" },
      name: "mine/triage", version: "0.1.0", license: "MIT", orgVerified: true, files: ["meta.yaml"],
    };
    commandMock.mockImplementation(async (type, params, ...args) => {
      if (type !== "environment.publish") return original(type, params, ...args);
      if (params?.dryRun) return { accepted: true, preview };
      deliverServerMessageForTests({ type: "environment.state", repository: PROJECT_ID,
        state: { ...useAppStore.getState().environments[PROJECT_ID]!, busy: "publishing" },
      });
      return { accepted: true };
    });
    await openSetup();
    await publicationDefaults();
    fireEvent.change(screen.getByTestId("publish-org"), { target: { value: "mine" } });
    fireEvent.change(screen.getByTestId("publish-license"), { target: { value: "MIT" } });
    fireEvent.click(screen.getByTestId("publish-review"));
    fireEvent.click(await screen.findByTestId("publish-confirm"));
    // The command has returned and the preview has gone; the upload is
    // still running according to the core's environment state.
    await vi.waitFor(() => expect(screen.getByTestId("publish-button").textContent).toBe("Publishing…"));
    const dialog = screen.getByRole("dialog", { name: "Publish playbook" });
    const close = screen.getByTestId("publish-close") as HTMLButtonElement;
    expect(close.disabled).toBe(true);
    fireEvent.click(close);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Publish playbook" })).toBe(dialog);
    act(() => deliverServerMessageForTests({ type: "environment.state", repository: PROJECT_ID,
      state: { ...useAppStore.getState().environments[PROJECT_ID]!, busy: null,
        published: { name: "mine/triage", version: "0.1.0", url: "https://spex.example/mine/triage" },
      },
    }));
    await vi.waitFor(() => expect(close.disabled).toBe(false));
    expect(screen.getByTestId("publish-done").textContent).toBe("Published 0.1.0");
    fireEvent.click(close);
    expect(screen.queryByRole("dialog", { name: "Publish playbook" })).toBeNull();
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("publish-button")));
  });

  test("existing package metadata remains the publishing default", async () => {
    await openSetup({ drafts: { triage: { ...COMPILED, packageLicense: "MIT" } } });
    await publicationDefaults("acme", "MIT");
    expect(commandMock.mock.calls.filter(([type]) => type === "environment.publish")).toEqual([]);
  });

  test("an account change ignores old authorization replies and retains manually entered publishing values", async () => {
    const original = commandMock.getMockImplementation()!;
    const held: { account: string | undefined; resolve: (value: unknown) => void }[] = [];
    const origin = "https://spex.example";
    commandMock.mockImplementation((type, ...args) => type === "registry.orgs"
      ? new Promise((resolve) => held.push({ account: useAppStore.getState().registryAccounts?.[origin]?.account?.id, resolve }))
      : original(type, ...args));
    await openSetup();
    await publicationDefaults("");
    await vi.waitFor(() => expect(held.some((entry) => entry.account === "registry")).toBe(true));
    fireEvent.change(screen.getByTestId("publish-org"), { target: { value: "my-choice" } });
    fireEvent.change(screen.getByTestId("publish-license"), { target: { value: "MIT" } });
    act(() => useAppStore.setState({ registryAccounts: { [origin]: {
      origin, displayName: "Registry", account: { id: "next", login: "next" }, signIn: { phase: "idle" }, error: null,
    } } }));
    await vi.waitFor(() => expect(held.some((entry) => entry.account === "next")).toBe(true));
    await act(async () => held.find((entry) => entry.account === "next")!.resolve({ orgs: [{ name: "my-choice", path: "my-choice" }] }));
    await vi.waitFor(() => expect(suggestions()).toEqual(["my-choice"]));
    await act(async () => held.find((entry) => entry.account === "registry")!.resolve({ orgs: [{ name: "former-account", path: "former-account" }] }));
    expect(suggestions()).toEqual(["my-choice"]);
    await publicationDefaults("my-choice", "MIT");
    expect(commandMock.mock.calls.filter(([type]) => type === "environment.publish")).toEqual([]);
  });

  test("missing license and invalid publishing names prevent review without restricting local creation", async () => {
    defaultLicense = null;
    await openSetup();
    await publicationDefaults("me", "");
    const review = screen.getByTestId("publish-review") as HTMLButtonElement;
    expect(review.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("publish-license"), { target: { value: "MIT" } });
    for (const bad of ["Acme", "acme_co", "-acme", "a".repeat(65)]) {
      fireEvent.change(screen.getByTestId("publish-org"), { target: { value: bad } });
      expect(review.disabled).toBe(true);
    }
    fireEvent.change(screen.getByTestId("publish-org"), { target: { value: "mine" } });
    expect(review.disabled).toBe(false);
    fireEvent.click(screen.getByTestId("publish-setup-cancel"));
    expect(screen.queryByTestId("publish-setup")).toBeNull();
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("publish-button")));
    expect(commandMock.mock.calls.filter(([type]) => type === "environment.publish")).toEqual([]);
  });

  test.each(["absent", "opens", "refuses", "rejects"] as const)(
    "the claim link keeps its ordinary native action when the opener %s",
    async (bridge) => {
      const origin = "https://registry.example:8443";
      environmentInstance = origin;
      const nativeWindow = window as { spexNative?: unknown };
      const previous = nativeWindow.spexNative;
      const openExternal = vi.fn<(url: string) => Promise<boolean>>().mockImplementation(async () => {
        if (bridge === "rejects") throw new Error("Could not open the browser");
        return bridge === "opens";
      });
      if (bridge === "absent") delete nativeWindow.spexNative;
      else nativeWindow.spexNative = { openExternal };
      try {
        const original = commandMock.getMockImplementation()!;
        commandMock.mockImplementation((type, ...args) => type === "registry.orgs" ? Promise.resolve({ orgs: [] }) : original(type, ...args));
        await openSetup({
          space: groupsState({ instances: [] }),
          registryAccounts: { [origin]: { origin, displayName: "Registry", account: { id: "registry", login: "me" }, signIn: { phase: "idle" }, error: null } },
        });
        await publicationDefaults("");
        const link = screen.getByRole("link", { name: "Claim an org" }) as HTMLAnchorElement;
        expect(link.href).toBe(`${origin}/account/orgs?scope=registry`);
        expect(link.target).toBe("_blank");
        expect(link.rel).toBe("noreferrer");
        expect(fireEvent.click(link)).toBe(true);
        expect(openExternal).not.toHaveBeenCalled();
      } finally {
        if (previous === undefined) delete nativeWindow.spexNative;
        else nativeWindow.spexNative = previous;
      }
    },
  );

  test("guidance follows the interface language and publication setup does not create or upload anything", async () => {
    activateLanguage("zh");
    try {
      const original = commandMock.getMockImplementation()!;
      commandMock.mockImplementation((type, ...args) => type === "registry.orgs" ? Promise.resolve({ orgs: [] }) : original(type, ...args));
      await openSetup();
      await publicationDefaults("");
      await vi.waitFor(() => expect(note()?.textContent).toBe("没有可发布的组织"));
      expect(screen.getByTestId("publish-org-guidance").textContent).toContain("要发布规约包，请使用你能在此注册中心认领的组织名。");
      expect(screen.getByRole("link", { name: "认领组织名" }).getAttribute("href")).toBe("https://spex.example/account/orgs?scope=registry");
      expect(commandMock.mock.calls.filter(([type]) => type === "draft.create" || type === "environment.publish")).toEqual([]);
    } finally {
      activateLanguage("en");
    }
  });
});

describe("playbook-library-35: the example opens a draft in paste mode", () => {
  test("Prefill creates the demo draft and places the normalized text without writing", async () => {
    seed();
    render(<PlaybooksTab project={PROJECT} />);
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
    render(<PlaybooksTab project={PROJECT} />);
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


test("run-view-159: authoring queues an attachment-only message and clears only acknowledged files", async () => {
  const asset = { assetId: `sha256:${"c".repeat(64)}` as const, name: "flow.png", mimeType: "image/png", byteLength: 4 };
  renderWorkspace(draftInfo({ activity: "turn", queued: [{ text: "", attachments: [asset] }] }), { view: foldView(THREAD.slice(0, 5)) });
  expect(screen.getByTestId("draft-queue").textContent).toContain("flow.png");
  act(() => useAppStore.getState().stageAttachmentAssets("draft:triage", { kind: "draft", projectId: PROJECT_ID, id: "triage", instance: INSTANCE }, [asset]));
  fireEvent.click(screen.getByTestId("draft-send"));
  await vi.waitFor(() => expect(commandMock).toHaveBeenCalledWith("draft.send", { projectId: PROJECT_ID, draftId: "triage", instance: INSTANCE, text: "", attachments: [asset] }));
  await vi.waitFor(() => expect(useAppStore.getState().attachmentDrafts["draft:triage"]).toEqual([]));
});

describe("playbook-library-97: a history replaced on disk, and a session replaced under its id", () => {
  test("a reconnect and a record out of sequence reload the whole thread; another instance makes the former's late words inert", async () => {
    const OTHER = "72000000-0000-4000-8000-0000000000bb";
    const boss = (prompt: string) => rec(1, { type: "turn_started", turnId: 1, timestamp: t0, turn: { id: 1, prompt, timestamp: t0 } });
    let served = THREAD;
    let player: ((info: DraftInfo) => void) | undefined;
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
      switch (type) {
        case "draft.open":
          return { draft: useAppStore.getState().drafts.triage ?? draftInfo(), source: SOURCE, records: served };
        case "draft.player.set":
          return new Promise((resolve) => { player = resolve; });
        case "draft.list":
          return [useAppStore.getState().drafts.triage];
        case "config.get":
          return CONFIG_STATE;
        case "readiness.get":
          return READINESS;
        case "project.list":
          return [PROJECT];
        case "session.list":
          return [];
        default:
          return base(type, params);
      }
    });
    seed({ drafts: { triage: draftInfo() } });
    render(<PlaybooksTab project={PROJECT} />);
    fireEvent.click(screen.getByTestId("draft-open-triage"));
    await vi.waitFor(() => expect(screen.getByTestId("boss-bubble").textContent).toContain("I want a playbook that triages issues"));
    act(() => {
      useAppStore.getState().setDraftComposer("triage", "kept words");
      useAppStore.getState().setDraftSourceMode("triage", { mode: "paste", pasteText: "kept paste" });
      useAppStore.getState().setDraftForm("triage", { command: "kept", players: {}, newPlayers: {} });
    });
    const kept = () => {
      const state = useAppStore.getState();
      expect(state.draftComposers.triage?.draft).toBe("kept words");
      expect(state.draftSourceModes.triage?.pasteText).toBe("kept paste");
      expect(state.draftForms.triage?.command).toBe("kept");
    };

    // A reconnect: the same sequence numbers, another history.
    served = [boss("Rewritten elsewhere"), ...THREAD.slice(1)];
    await act(async () => { await useAppStore.getState().refresh(); });
    await vi.waitFor(() => expect(screen.getByTestId("boss-bubble").textContent).toContain("Rewritten elsewhere"));
    expect(screen.getAllByTestId("boss-bubble")).toHaveLength(1);
    kept();

    // A record not following the thread's last: the thread is read again.
    served = [boss("A third history"), rec(2, { type: "turn_finished", turnId: 1, timestamp: t0 + 1 })];
    act(() => {
      deliverServerMessageForTests({ type: "draft.record", draftId: "triage", instance: INSTANCE, seq: 3, record: { type: "captain_status", turnId: null, timestamp: now, message: "◇ out of sequence" } as unknown as TmuxPlayRecord });
    });
    await vi.waitFor(() => expect(screen.getByTestId("boss-bubble").textContent).toContain("A third history"));
    expect(useAppStore.getState().draftViews.triage?.view.lastSeq).toBe(2);
    kept();

    // A sync's announcement: the same length, another history again.
    served = [boss("Synced from elsewhere"), rec(2, { type: "turn_finished", turnId: 1, timestamp: t0 + 1 })];
    act(() => { deliverServerMessageForTests({ type: "draft.history-replaced", draftId: "triage", instance: INSTANCE }); });
    await vi.waitFor(() => expect(screen.getByTestId("boss-bubble").textContent).toContain("Synced from elsewhere"));
    kept();

    // Cancel names the instance shown.
    await act(async () => { await useAppStore.getState().abortDraftCompile("triage"); });
    expect(commandMock).toHaveBeenCalledWith("compile.abort", { playbookId: "triage", instance: INSTANCE });

    // Another instance under the id: the former's state goes, and its
    // late reply, record, source and removal change nothing.
    const late = useAppStore.getState().setDraftPlayer("triage", "dev.reviewer");
    act(() => {
      deliverServerMessageForTests({ type: "draft.state", draft: draftInfo({ instance: OTHER, firstLine: "# Successor" }) });
    });
    const state = useAppStore.getState();
    expect(state.drafts.triage?.instance).toBe(OTHER);
    expect(state.draftComposers.triage).toBeUndefined();
    expect(state.draftForms.triage).toBeUndefined();
    expect(state.draftViews.triage).toBeUndefined();
    expect(state.openDraftId).toBeUndefined();
    player!(draftInfo({ player: "dev.reviewer" }));
    await late;
    act(() => {
      deliverServerMessageForTests({ type: "draft.record", draftId: "triage", instance: INSTANCE, seq: 1, record: { type: "captain_status", turnId: null, timestamp: now, message: "◇ late" } as unknown as TmuxPlayRecord });
      deliverServerMessageForTests({ type: "draft.source", draftId: "triage", instance: INSTANCE, markdown: "# Former", version: "v0", mtime: now });
      deliverServerMessageForTests({ type: "draft.removed", projectId: PROJECT_ID, draftId: "triage", instance: INSTANCE });
    });
    const after = useAppStore.getState();
    expect(after.drafts.triage?.instance).toBe(OTHER);
    expect(after.drafts.triage?.player).toBeNull();
    expect(after.draftViews.triage).toBeUndefined();
    expect(after.draftSources.triage).toBeUndefined();
    // The former's compile lines are not the successor's.
    act(() => {
      deliverServerMessageForTests({ type: "compile.progress", playbookId: "triage", instance: INSTANCE, line: "→ gears2fsm (former)" });
      deliverServerMessageForTests({ type: "compile.progress", playbookId: "triage", instance: OTHER, line: "→ normalize (successor)" });
    });
    expect(useAppStore.getState().compileProgress.triage).toEqual(["→ normalize (successor)"]);
  });

  test("a record naming another instance than the thread shown changes nothing, live or buffered while the thread is read", async () => {
    const SHOWN = "72000000-0000-4000-8000-0000000000ee";
    const record = (instance: string, seq: number, message: string) => deliverServerMessageForTests({ type: "draft.record", draftId: "triage", instance, seq, record: { type: "captain_status", turnId: null, timestamp: now, message } as unknown as TmuxPlayRecord });
    let opening: ((value: unknown) => void) | undefined;
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
      switch (type) {
        case "draft.open":
          return new Promise((resolve) => { opening = resolve; });
        case "draft.list":
          return [useAppStore.getState().drafts.triage];
        case "config.get":
          return CONFIG_STATE;
        case "readiness.get":
          return READINESS;
        case "project.list":
          return [PROJECT];
        case "session.list":
          return [];
        default:
          return base(type, params);
      }
    });
    const shown = draftInfo({ instance: SHOWN });
    seed({ drafts: { triage: shown } });
    render(<PlaybooksTab project={PROJECT} />);
    fireEvent.click(screen.getByTestId("draft-open-triage"));
    await vi.waitFor(() => expect(opening).toBeDefined());
    // Buffered while the thread is read: the former's record, numbered
    // right after what the reply holds, goes; the shown session's lands.
    act(() => {
      record(INSTANCE, THREAD.length + 1, "◇ former, buffered");
      record(SHOWN, THREAD.length + 1, "◇ shown, buffered");
    });
    await act(async () => { opening!({ draft: shown, source: SOURCE, records: THREAD }); });
    await vi.waitFor(() => expect(useAppStore.getState().draftViews.triage?.loading).toBe(false));
    const thread = () => JSON.stringify(useAppStore.getState().draftViews.triage?.view.captain);
    expect(useAppStore.getState().draftViews.triage?.view.lastSeq).toBe(THREAD.length + 1);
    expect(thread()).toContain("◇ shown, buffered");
    expect(thread()).not.toContain("◇ former, buffered");

    // Live with the thread open: the former's record numbered right
    // after the thread's last changes nothing; the shown one's extends it.
    const before = thread();
    act(() => { record(INSTANCE, THREAD.length + 2, "◇ former, live"); });
    expect(useAppStore.getState().draftViews.triage?.view.lastSeq).toBe(THREAD.length + 1);
    expect(thread()).toBe(before);
    act(() => { record(SHOWN, THREAD.length + 2, "◇ shown, live"); });
    expect(useAppStore.getState().draftViews.triage?.view.lastSeq).toBe(THREAD.length + 2);
    expect(thread()).toContain("◇ shown, live");
  });

  test("replies late for a replaced session change nothing of the successor's; a record after removal makes no thread", async () => {
    const OTHER = "72000000-0000-4000-8000-0000000000dd";
    const settle: Record<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }> = {};
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) =>
      ["draft.open", "draft.artifacts", "draft.register", "draft.send"].includes(type)
        ? new Promise((resolve, reject) => { settle[type] = { resolve, reject }; })
        : base(type, params));
    seed({ drafts: { triage: COMPILED }, openDraftId: "triage" });
    const store = useAppStore.getState();
    const pending = [
      store.refreshDraftSource("triage"),
      store.loadDraftArtifacts("triage"),
      store.registerDraft("triage", { command: "triage", intent: "Triage", bindings: {} }),
      store.sendDraft("triage", "late").catch(() => undefined),
    ];
    // Another session is made under the id; the reader opens it and types.
    act(() => { deliverServerMessageForTests({ type: "draft.state", draft: draftInfo({ instance: OTHER, firstLine: "# Successor" }) }); });
    act(() => {
      useAppStore.setState({ openDraftId: "triage" });
      useAppStore.getState().setDraftComposer("triage", "successor words");
    });
    const added = { ...CONFIG_STATE };
    settle["draft.open"].resolve({ draft: COMPILED, source: { markdown: "# Former", version: "v0", mtime: now }, records: [] });
    settle["draft.artifacts"].resolve(ARTIFACTS);
    settle["draft.register"].resolve(added);
    settle["draft.send"].reject(new Error("conflict: triage changed meanwhile; retry"));
    await act(async () => { await Promise.all(pending); });
    const after = useAppStore.getState();
    expect(after.drafts.triage?.instance).toBe(OTHER);
    expect(after.draftSources.triage).toBeUndefined();
    expect(after.draftArtifacts.triage).toBeUndefined();
    expect(after.draftErrors.triage).toBeUndefined();
    expect(after.draftComposers.triage?.draft).toBe("successor words");
    expect(after.openDraftId).toBe("triage");
    expect(after.revealPlaybook).toBeUndefined();
    // The config the Add wrote is everyone's.
    expect(after.configState).toBe(added);

    // Removed, the session leaves no trace, and a record arriving after
    // makes no thread.
    act(() => {
      deliverServerMessageForTests({ type: "draft.removed", projectId: PROJECT_ID, draftId: "triage", instance: OTHER });
      deliverServerMessageForTests({ type: "draft.record", draftId: "triage", instance: OTHER, seq: 1, record: { type: "captain_status", turnId: null, timestamp: now, message: "◇ late" } as unknown as TmuxPlayRecord });
    });
    expect(useAppStore.getState().drafts.triage).toBeUndefined();
    expect(useAppStore.getState().draftViews.triage).toBeUndefined();
  });

  test("a list read before a state was heard leaves that state standing", async () => {
    const OTHER = "72000000-0000-4000-8000-0000000000cc";
    let answer!: (infos: DraftInfo[]) => void;
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) =>
      type === "draft.list" ? new Promise((resolve) => { answer = resolve; }) : base(type, params));
    seed({ drafts: { triage: draftInfo() } });
    const listing = useAppStore.getState().listDrafts();
    act(() => { deliverServerMessageForTests({ type: "draft.state", draft: draftInfo({ instance: OTHER }) }); });
    answer([draftInfo()]);
    await listing;
    expect(useAppStore.getState().drafts.triage?.instance).toBe(OTHER);
  });

  test("a list no longer naming a session forgets it, open workspace and all, unless something newer was heard", async () => {
    let answer!: (infos: DraftInfo[]) => void;
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) =>
      type === "draft.list" ? new Promise((resolve) => { answer = resolve; }) : base(type, params));
    const listedDraft = draftInfo({ id: "listed", projectId: "elsewhere" });
    seed({
      drafts: { triage: draftInfo(), listed: draftInfo({ id: "listed" }) },
      openDraftId: "triage",
      draftViews: { triage: foldView(THREAD) },
      draftComposers: { triage: { draft: "words" }, listed: { draft: "kept" } },
    });

    // Late: a session created and one opened after the list was asked
    // survive a reply that names neither.
    const late = useAppStore.getState().listDrafts();
    await act(async () => {
      await useAppStore.getState().createDraft("fresh", { org: "me", license: "MIT" }, PROJECT_ID);
    });
    answer([listedDraft]);
    await late;
    let state = useAppStore.getState();
    expect(state.drafts.fresh).toBeDefined();
    expect(state.openDraftId).toBe("fresh");
    // Unheard since and unnamed, the former open session went.
    expect(state.drafts.triage).toBeUndefined();
    expect(state.draftViews.triage).toBeUndefined();
    expect(state.draftComposers.triage).toBeUndefined();
    // Listed under the same instance, moved or not, its composer stands.
    expect(state.drafts.listed?.projectId).toBe("elsewhere");
    expect(state.draftComposers.listed?.draft).toBe("kept");

    // Authoritative: a list asked after the open that names it not
    // closes the workspace and drops what the page kept.
    act(() => { useAppStore.getState().setDraftComposer("fresh", "typed"); });
    const fresh = useAppStore.getState().listDrafts();
    answer([listedDraft]);
    await fresh;
    state = useAppStore.getState();
    expect(state.drafts.fresh).toBeUndefined();
    expect(state.draftViews.fresh).toBeUndefined();
    expect(state.draftComposers.fresh).toBeUndefined();
    expect(state.openDraftId).toBeUndefined();
    expect(state.draftComposers.listed?.draft).toBe("kept");
  });
});
