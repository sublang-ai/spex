// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// run-view-171, dashboard-9, approvals-5: the surfaces that join the
// places (run-view-168, DR-133). The local store and two seat stores,
// each over a fake client of its own: the sidebar lists each place's
// projects under a heading naming the place, this computer's rows as
// they always were; the attention queue joins every core's entries
// band by band, interleaved by onset with each core's own order kept
// and this computer's entry first on a tie, and the badge sums the
// badges of the cores whose fold is read — a mismatched place adding
// nothing, a reconnecting one keeping its last; the sidebar's marks
// leave a mismatched place out; the approvals inbox lists every core's
// requests; each entry is opened and answered at its own core alone;
// and a Dashboard link to a project opens it at its place. Ids are the
// cores' own: one repository cloned at two places is one project id at
// both.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type {
  ApprovalState,
  AttentionEntry,
  LedgerState,
  PendingApproval,
  ProjectInfo,
  SeatState,
  SessionInfo,
} from "@sublang/spex-core/protocol";

import { App } from "./App.js";
import { groupsState } from "./fixtures/groups-state.js";
import { activateLanguage } from "./i18n.js";
import type { SpexClient } from "./lib/client.js";
import { usePlaces } from "./state/places.js";
import { createAppStore, setClientForTests, useAppStore, type AppState, type AppStore } from "./state/store.js";

afterEach(cleanup);

// jsdom has no layout, so the strip's keep-in-view call needs a stub.
Element.prototype.scrollIntoView = vi.fn();

/** Two seats, each keyed `<instance origin>#<server id>` and shown by
 * its server's name (core-service-128). */
const ALPHA: SeatState = {
  instance: "https://spex.pub",
  serverId: "41",
  name: "build-box",
  group: "acme/infra",
  place: "https://spex.pub#41",
  leaseExpiresAt: Date.now() + 3_600_000,
  relay: "open",
};
const BETA: SeatState = { ...ALPHA, serverId: "42", name: "gpu-box", place: "https://spex.pub#42" };

/** The reply a command with no test-specific answer gets: one the
 * protocol allows, at the local core and at each seat alike. */
function defaultReply(type: string): unknown {
  switch (type) {
    case "session.list":
    case "project.list":
    case "readiness.get":
    case "draft.list":
      return [];
    case "config.get":
      return { status: "missing", path: "/home/playbook.config.yaml" };
    case "ledger.get":
      return { intents: [], attention: [], badge: 0 };
    case "history.get":
      return { records: [] };
    case "language.get":
    case "language.set":
      return { language: null };
    case "space.get":
      return groupsState();
    case "specs.get":
      return { present: false, legacy: false, files: [], decisions: [], intents: [], notices: [], readAt: 0 };
    default:
      return {};
  }
}

/** A fake core: every command and subscription recorded, each answered
 * from `answers` where the test names one — the core's ledger fold,
 * read again as the page asks — and as the protocol allows otherwise. */
function fakeClient() {
  const answers: Record<string, unknown> = {};
  const command = vi.fn(async (type: string, _fields?: unknown) =>
    type in answers ? answers[type] : defaultReply(type),
  );
  const subscribe = vi.fn(async (_target?: unknown) => null);
  const unsubscribe = vi.fn(async () => null);
  const client = { command, subscribe, unsubscribe } as unknown as SpexClient;
  return { client, command, subscribe, answers };
}
type Fake = ReturnType<typeof fakeClient>;

function project(id: string, name: string): ProjectInfo {
  return {
    id,
    name,
    path: `/work/${name}`,
    registeredAt: 0,
    repository: { key: id, name: `${name}-spex`, group: "me", own: true },
  } as unknown as ProjectInfo;
}

function session(id: string, projectId: string, title: string): SessionInfo {
  return {
    id,
    projectId,
    projectPath: `/work/${projectId}`,
    createdAt: Date.now() - 60_000,
    live: false,
    endedAt: Date.now() - 30_000,
    continuable: true,
    players: [{ id: "dev.coder", adapter: "claude" }],
    initialVisible: ["dev.coder"],
    turns: 1,
    failed: false,
    title,
  };
}

/** One attention entry, raised at `since`. */
function entry(
  sessionId: string,
  projectId: string,
  band: AttentionEntry["band"],
  kind: AttentionEntry["kind"],
  since: number,
  intentId?: string,
): AttentionEntry {
  return {
    band,
    kind,
    title: `work in ${sessionId}`,
    projectId,
    sessionId,
    since,
    turnId: 1,
    ...(intentId ? { intentId } : {}),
  };
}

function ledger(attention: AttentionEntry[], badge: number): LedgerState {
  return { intents: [], attention, badge };
}

const VALID = { status: "valid", summary: { playbooks: [], captain: undefined } } as never;

/** This computer's project, and the same repository cloned on the
 * first seat: one project id at both places. */
const HOME = project("p1", "home-project");
const GPU = project("p2", "gpu-project");

const pristine = useAppStore.getState();
let local: Fake;
let alpha: Fake;
let beta: Fake;
let alphaStore: AppStore;
let betaStore: AppStore;

/** A seat's store over its own fake client, connected with its state
 * read, as the relay would leave it. */
function seatStore(seat: SeatState, fake: Fake, state: Partial<AppState>): AppStore {
  const store = createAppStore({ key: seat.place, name: seat.name }, fake.client);
  store.setState({ connection: "open", everConnected: true, configState: VALID, ledger: ledger([], 0) });
  store.setState(state);
  return store;
}

beforeEach(() => {
  activateLanguage("en");
  local = fakeClient();
  alpha = fakeClient();
  beta = fakeClient();
  setClientForTests(local.client);
  useAppStore.setState({
    connection: "open",
    everConnected: true,
    projects: [HOME],
    sessions: [session("s-home", "p1", "fix the home build")],
    currentProjectId: "p1",
    configState: VALID,
    ledger: ledger([], 0),
  });
  alphaStore = seatStore(ALPHA, alpha, {
    projects: [HOME],
    sessions: [session("s-alpha", "p1", "profile the build box")],
    currentProjectId: "p1",
  });
  betaStore = seatStore(BETA, beta, {
    projects: [GPU],
    sessions: [session("s-beta", "p2", "train the model")],
  });
  // The page holds both seats, as the local core's `server.state`
  // would have it.
  usePlaces.setState({
    seats: [
      { seat: ALPHA, store: alphaStore },
      { seat: BETA, store: betaStore },
    ],
  });
});

afterEach(() => {
  usePlaces.setState({ seats: [] });
  useAppStore.setState(pristine, true);
  setClientForTests(undefined);
});

/** Let replies and the work they set off land. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let tick = 0; tick < 20; tick += 1) await Promise.resolve();
  });
}

const groupOf = (place: string): HTMLElement =>
  document.querySelector<HTMLElement>(`[data-testid="sidebar"] [data-place-key="${place}"]`)!;

const commandsOf = (fake: Fake): string[] => fake.command.mock.calls.map(([type]) => type);

describe("run-view-171: the sidebar holds a heading per place", () => {
  test("each place's projects under its heading, this computer's rows' test ids unchanged", async () => {
    render(<App />);
    const sidebar = screen.getByTestId("sidebar");

    // [run-view-171] a heading per place, in order: this computer's,
    // then each seat's by its server's name.
    expect(
      within(sidebar).getAllByTestId("sidebar-place-heading").map((heading) => heading.textContent),
    ).toEqual(["This computer", "build-box", "gpu-box"]);
    // [run-view-168] each heading names the group of its place's projects.
    expect(within(sidebar).getByRole("group", { name: "build-box" })).toBe(groupOf(ALPHA.place));

    // [run-view-171] this computer's rows keep their test ids, under
    // its own heading.
    const home = groupOf("local");
    expect(within(home).getByTestId("sidebar-project-p1").textContent).toContain("home-project");
    expect(within(home).getByTestId("sidebar-session-s-home")).toBeTruthy();
    // [run-view-168] each seat lists its own projects: one repository
    // cloned at two places is one project shown under each, its rows
    // qualified by place.
    const alphaGroup = groupOf(ALPHA.place);
    expect(within(alphaGroup).getByTestId(`sidebar-project-p1@${ALPHA.place}`).textContent).toContain("home-project");
    expect(within(alphaGroup).getByTestId(`sidebar-session-s-alpha@${ALPHA.place}`)).toBeTruthy();
    expect(within(alphaGroup).queryByTestId("sidebar-session-s-home")).toBeNull();
    expect(within(groupOf(BETA.place)).getByTestId(`sidebar-project-p2@${BETA.place}`).textContent).toContain(
      "gpu-project",
    );

    // [run-view-168] a seat's session row opens at its own place: its
    // core alone is asked, and the Projects surface shows that place.
    fireEvent.click(within(alphaGroup).getByTestId(`sidebar-session-s-alpha@${ALPHA.place}`));
    await settle();
    expect(alpha.subscribe).toHaveBeenCalledWith({ kind: "session", sessionId: "s-alpha" });
    expect(commandsOf(alpha)).toContain("history.get");
    expect(local.subscribe).not.toHaveBeenCalled();
    expect(beta.subscribe).not.toHaveBeenCalled();
    expect(alphaStore.getState().activeSessionId).toBe("s-alpha");
    expect(useAppStore.getState().activeSessionId).toBeUndefined();
    expect(within(alphaGroup).getByTestId(`sidebar-session-s-alpha@${ALPHA.place}`).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(within(home).getByTestId("sidebar-project-p1").getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("tab", { name: "profile the build box" })).toBeTruthy();

    // [run-view-67] with no seat open, no heading stands and this
    // computer's rows read as they always have.
    act(() => usePlaces.setState({ seats: [] }));
    expect(within(sidebar).queryAllByTestId("sidebar-place-heading")).toEqual([]);
    expect(within(sidebar).getByTestId("sidebar-project-p1")).toBeTruthy();
    expect(within(sidebar).getByTestId("sidebar-session-s-home")).toBeTruthy();
    expect(within(sidebar).queryByTestId(`sidebar-project-p1@${ALPHA.place}`)).toBeNull();
  });

  test("the project palette names each project's place and the place of a new one", () => {
    render(<App />);
    fireEvent.keyDown(window, { key: "p", metaKey: true });
    const palette = screen.getByTestId("project-palette");

    // [run-view-168] every place's projects, each naming its place.
    const rows = [
      within(palette).getByTestId("palette-project-p1"),
      within(palette).getByTestId(`palette-project-p1@${ALPHA.place}`),
      within(palette).getByTestId(`palette-project-p2@${BETA.place}`),
    ];
    expect(rows.map((row) => within(row).getByTestId("palette-place").textContent)).toEqual([
      "This computer",
      "build-box",
      "gpu-box",
    ]);
    // [run-view-168] a project added here lands on this computer.
    expect(within(palette).getByTestId("palette-new-place").textContent).toBe(
      "A new project is added on This computer.",
    );

    // [run-view-168] picking a seat's project makes it current at that
    // place alone, and the Projects surface shows it there.
    fireEvent.click(rows[2]!);
    expect(betaStore.getState().currentProjectId).toBe("p2");
    expect(useAppStore.getState().currentProjectId).toBe("p1");
    expect(screen.getByTestId(`sidebar-project-p2@${BETA.place}`).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("sidebar-project-p1").getAttribute("aria-selected")).toBe("false");
  });
});

describe("dashboard-9: one attention queue across the places", () => {
  beforeEach(() => {
    // Each core's own fold, as its core serves it: within a band the
    // first seat's second question began before its first, and that
    // core lists it after.
    const folds: [Fake, AppStore, LedgerState][] = [
      [
        local,
        useAppStore,
        ledger(
          [
            entry("l1", "p1", "interrupted", "question", 100),
            entry("l2", "p1", "interrupted", "failure", 300),
            entry("l3", "p1", "finished", "review", 50),
          ],
          3,
        ),
      ],
      [
        alpha,
        alphaStore,
        ledger(
          [entry("a1", "p1", "interrupted", "question", 200), entry("a2", "p1", "interrupted", "question", 150)],
          2,
        ),
      ],
      [beta, betaStore, ledger([entry("b1", "p2", "finished", "finish", 10, "i-b1")], 1)],
    ];
    for (const [fake, store, fold] of folds) {
      fake.answers["ledger.get"] = fold;
      store.setState({ ledger: fold });
    }
    alphaStore.setState({
      sessions: [...alphaStore.getState().sessions, session("a1", "p1", "first at the box"), session("a2", "p1", "second at the box")],
    });
    betaStore.setState({ sessions: [...betaStore.getState().sessions, session("b1", "p2", "a model to judge")] });
  });

  test("the queue interleaves each band by onset, each core's order standing, and the badge sums", () => {
    render(<App />);
    // [dashboard-9] the count sums the cores' badges.
    expect(screen.getByTestId("nav-attention-badge").textContent).toBe("6");
    fireEvent.click(document.querySelector<HTMLElement>('[data-surface="Dashboard"]')!);

    const queue = screen.getByTestId("attention-queue");
    // [dashboard-9] band by band — interrupted, then finished — each
    // interleaved by onset across the places, and each core's own order
    // standing: the first seat's second question stays after its first.
    expect([...queue.querySelectorAll<HTMLElement>("[data-band]")].map((row) => row.dataset.testid)).toEqual([
      "attention-l1-question",
      "attention-a1-question",
      "attention-a2-question",
      "attention-l2-failure",
      "attention-i-b1-finish",
      "attention-l3-review",
    ]);
    // [dashboard-9] the count equals the queue's entries.
    expect(queue.querySelectorAll("[data-band]")).toHaveLength(6);

    // [dashboard-9] a place speaking another protocol version is no
    // connected core: its entries leave the queue and its badge the
    // count, the others' standing.
    act(() => betaStore.setState({ connection: "mismatch" }));
    expect(screen.getByTestId("nav-attention-badge").textContent).toBe("5");
    expect(screen.queryByTestId("attention-i-b1-finish")).toBeNull();
    expect(queue.querySelectorAll("[data-band]")).toHaveLength(5);
  });

  test("on a tie in onset this computer's entry goes first, whichever place lists it", () => {
    // Each core's first question began at the same moment.
    const tied = (sessionId: string) => entry(sessionId, "p1", "interrupted", "question", 100);
    alphaStore.setState({ ledger: ledger([tied("a1")], 1) });
    useAppStore.setState({ ledger: ledger([tied("l1")], 1) });
    betaStore.setState({ ledger: ledger([], 0) });
    render(<App />);
    fireEvent.click(document.querySelector<HTMLElement>('[data-surface="Dashboard"]')!);
    const queue = screen.getByTestId("attention-queue");
    // [dashboard-9] this computer's entry first where two share an onset.
    expect([...queue.querySelectorAll<HTMLElement>("[data-band]")].map((row) => row.dataset.testid)).toEqual([
      "attention-l1-question",
      "attention-a1-question",
    ]);
    expect(screen.getByTestId("nav-attention-badge").textContent).toBe("2");
  });

  test("a reconnecting place keeps its last fold; a place not read yet adds nothing", () => {
    render(<App />);
    fireEvent.click(document.querySelector<HTMLElement>('[data-surface="Dashboard"]')!);
    const rows = () =>
      [...screen.getByTestId("attention-queue").querySelectorAll<HTMLElement>("[data-band]")].map(
        (row) => row.dataset.testid,
      );
    const before = rows();
    // [dashboard-9] a place reconnecting keeps its last read fold: its
    // entries stand and its badge still counts.
    act(() => alphaStore.setState({ connection: "closed" }));
    expect(screen.getByTestId("nav-attention-badge").textContent).toBe("6");
    expect(rows()).toEqual(before);
    act(() => alphaStore.setState({ connection: "connecting" }));
    expect(screen.getByTestId("nav-attention-badge").textContent).toBe("6");
    expect(rows()).toEqual(before);
    // [dashboard-9] the count sums the cores whose fold is read: a place
    // whose fold is not read adds nothing.
    act(() => betaStore.setState({ ledger: undefined }));
    expect(screen.getByTestId("nav-attention-badge").textContent).toBe("5");
    expect(screen.queryByTestId("attention-i-b1-finish")).toBeNull();
  });

  test("the sidebar's attention marks leave out a place speaking another protocol version", () => {
    render(<App />);
    const mark = (id: string) => screen.queryByTestId(id);
    expect(mark(`sidebar-project-attention-p1@${ALPHA.place}`)).toBeTruthy();
    expect(mark(`sidebar-project-attention-p2@${BETA.place}`)).toBeTruthy();
    // [run-view-171] [run-view-168] a mismatched place marks nothing, as
    // it adds nothing to the queue and the badge; the others' marks stand.
    act(() => betaStore.setState({ connection: "mismatch" }));
    expect(mark(`sidebar-project-attention-p2@${BETA.place}`)).toBeNull();
    expect(screen.getByTestId(`sidebar-project-p2@${BETA.place}`)).toBeTruthy();
    expect(mark(`sidebar-project-attention-p1@${ALPHA.place}`)).toBeTruthy();
    expect(screen.getByTestId("nav-attention-badge").textContent).toBe("5");
  });

  test("an entry is answered and opened at its own core alone", async () => {
    render(<App />);
    fireEvent.click(document.querySelector<HTMLElement>('[data-surface="Dashboard"]')!);

    // [dashboard-9] the second seat's verdict goes to its core alone.
    fireEvent.click(screen.getByTestId("attention-confirm-i-b1"));
    await settle();
    expect(beta.command).toHaveBeenCalledWith("intent.close", { intentId: "i-b1", as: "done" });
    expect(commandsOf(local)).not.toContain("intent.close");
    expect(commandsOf(alpha)).not.toContain("intent.close");

    // [dashboard-9] this computer's review is marked at its own core.
    fireEvent.click(screen.getByTestId("attention-reviewed-l3"));
    await settle();
    expect(local.command).toHaveBeenCalledWith("session.viewed", { sessionId: "l3", turnId: 1 });
    expect(commandsOf(alpha)).not.toContain("session.viewed");
    expect(commandsOf(beta)).not.toContain("session.viewed");

    // [dashboard-9] opening the first seat's entry opens its session
    // at that seat, and the Projects surface shows that place.
    const row = screen.getByTestId("attention-a2-question");
    fireEvent.click(within(row).getByRole("button", { name: /^Open work in a2/ }));
    await settle();
    expect(alpha.subscribe).toHaveBeenCalledWith({ kind: "session", sessionId: "a2" });
    expect(local.subscribe).not.toHaveBeenCalled();
    expect(beta.subscribe).not.toHaveBeenCalled();
    expect(alphaStore.getState().activeSessionId).toBe("a2");
    expect(screen.getByTestId(`sidebar-session-a2@${ALPHA.place}`).getAttribute("aria-selected")).toBe("true");
  });
});

describe("run-view-96: an attention failure between turns focuses its line", () => {
  test.each(["local", "seat"])("opens at its onset on %s", async (place) => {
    const [fake, store, sessionId] = place === "local"
      ? [local, useAppStore, "s-home"] as const
      : [alpha, alphaStore, "s-alpha"] as const;
    const failure: AttentionEntry = {
      band: "interrupted", kind: "failure", title: "fix the build",
      projectId: "p1", sessionId, since: 300,
    };
    const fold = ledger([failure], 1);
    fake.answers["ledger.get"] = fold;
    fake.answers["history.get"] = { records: [
      { seq: 1, record: { type: "turn_started", turnId: 1, timestamp: 100,
        turn: { id: 1, prompt: "fix the build", timestamp: 100 } } },
      { seq: 2, record: { type: "turn_finished", turnId: 1, timestamp: 200 } },
      { seq: 3, record: { type: "runtime_error", turnId: null, timestamp: 300,
        message: "the input was refused" } },
      { seq: 4, record: { type: "runtime_error", turnId: null, timestamp: 400,
        message: "the later failure" } },
    ] };
    store.setState({ ledger: fold });

    render(<App />);
    fireEvent.click(document.querySelector<HTMLElement>('[data-surface="Dashboard"]')!);
    fireEvent.click(within(screen.getByTestId(`attention-${sessionId}-failure`))
      .getByRole("button", { name: /^Open fix the build/ }));
    await settle();

    expect(fake.command).toHaveBeenCalledWith("history.get", expect.objectContaining({ sessionId }));
    expect(screen.getByText("the input was refused").closest("[data-focus-key]")
      ?.getAttribute("data-focused")).toBe("1");
    expect(screen.getByText("the later failure").closest("[data-focus-key]")
      ?.getAttribute("data-focused")).not.toBe("1");
  });
});

describe("run-view-168: a Dashboard link opens a project at its place", () => {
  /** Show the first seat on the Projects surface, from its session. */
  async function showSeat(): Promise<void> {
    fireEvent.click(screen.getByTestId(`sidebar-session-s-alpha@${ALPHA.place}`));
    await settle();
    expect(screen.getByTestId(`sidebar-session-s-alpha@${ALPHA.place}`).getAttribute("aria-selected")).toBe("true");
  }

  test("the Sources guidance opens the project's Overview at its own place", async () => {
    render(<App />);
    await showSeat();
    fireEvent.click(document.querySelector<HTMLElement>('[data-surface="Dashboard"]')!);
    // The Dashboard's project groups are this computer's.
    const guidance = screen.getByTestId("sources-guidance-p1");
    fireEvent.click(within(guidance).getByRole("button", { name: "Open the project's Overview" }));
    await settle();
    // [run-view-168] the project opens at its place — this computer's,
    // though the seat holds a project of the same id — and the Projects
    // surface shows that place.
    expect(useAppStore.getState().currentProjectId).toBe("p1");
    expect(useAppStore.getState().workspaceTabs.p1).toBe("overview");
    expect(alphaStore.getState().workspaceTabs.p1).not.toBe("overview");
    expect(screen.getByTestId("overview-tab").textContent).toContain("home-project");
    expect(screen.getByTestId("sidebar-project-p1").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId(`sidebar-project-p1@${ALPHA.place}`).getAttribute("aria-selected")).toBe("false");
    expect(screen.getByTestId(`sidebar-session-s-alpha@${ALPHA.place}`).getAttribute("aria-selected")).toBe("false");
  });

  test("the empty state's Projects link shows this computer's place", async () => {
    useAppStore.setState({ projects: [], sessions: [], currentProjectId: undefined });
    render(<App />);
    await showSeat();
    fireEvent.click(document.querySelector<HTMLElement>('[data-surface="Dashboard"]')!);
    const empty = screen.getByTestId("projects-empty");
    fireEvent.click(within(empty).getByRole("button", { name: "Projects" }));
    await settle();
    // [run-view-168] the Projects surface shows the place whose
    // projects the Dashboard lists: this computer's, with none yet.
    expect(screen.getByTestId("home-add-project")).toBeTruthy();
    expect(screen.getByTestId(`sidebar-session-s-alpha@${ALPHA.place}`).getAttribute("aria-selected")).toBe("false");
    expect(screen.queryByRole("tab", { name: "profile the build box" })).toBeNull();
  });
});

describe("approvals-5: one inbox across the places", () => {
  const REQUEST: PendingApproval = {
    id: "request-1",
    owner: { kind: "session", id: "s-home" },
    ownerLabel: "fix the home build",
    projectName: "home-project",
    actorId: "inspector",
    invocationId: "invocation-1",
    turnId: 3,
    request: {
      id: "native-id",
      kind: "tool",
      agent: "claude-code",
      sessionId: "native-session",
      toolUseId: "tool-1",
      toolName: "desktop.inspect",
      input: { app: "Example" },
      choices: ["allow_once", "deny"],
      createdAt: 1,
      expiresAt: Date.now() + 600_000,
    },
  } as PendingApproval;
  /** The same request id at the second seat: each core's ids are its own. */
  const SEAT_REQUEST: PendingApproval = {
    ...REQUEST,
    owner: { kind: "session", id: "s-beta" },
    ownerLabel: "train the model",
    projectName: "gpu-project",
  };
  const snapshot = (generation: string, pending: PendingApproval[], revision = 1): ApprovalState => ({
    generation,
    revision,
    pending,
  });

  test("the inbox lists every place's requests, each named by its place and approved at its own core", async () => {
    useAppStore.setState({ approvals: snapshot("generation-local", [REQUEST]) });
    betaStore.setState({ approvals: snapshot("generation-beta", [SEAT_REQUEST]) });
    render(<App />);

    // [approvals-5] one inbox holds both places' requests.
    fireEvent.click(screen.getByRole("button", { name: "Tool approvals (2)" }));
    const cards = [...screen.getByRole("region", { name: "Tool approvals" }).querySelectorAll("article")];
    expect(cards).toHaveLength(2);
    // [approvals-5] each request names its place where the page holds
    // several.
    expect(cards.map((card) => within(card).getByTestId("approval-place").textContent)).toEqual([
      "This computer",
      "gpu-box",
    ]);
    expect(cards[1]!.textContent).toContain("train the model");

    // [approvals-5] the seat's request is answered at its own core,
    // with that core's generation.
    fireEvent.click(within(cards[1]!).getByRole("button", { name: "Approve once" }));
    await settle();
    expect(beta.command).toHaveBeenCalledWith("approval.respond", {
      generation: "generation-beta",
      requestId: "request-1",
      owner: SEAT_REQUEST.owner,
      decision: "allow_once",
    });
    expect(commandsOf(local)).not.toContain("approval.respond");
    expect(commandsOf(alpha)).not.toContain("approval.respond");

    // [approvals-5] the seat's own snapshot removes its request alone.
    act(() => betaStore.deliver({ type: "approval.state", state: snapshot("generation-beta", [], 2) }));
    expect(screen.getByRole("button", { name: "Tool approvals (1)" })).toBeTruthy();
    const left = [...screen.getByRole("region", { name: "Tool approvals" }).querySelectorAll("article")];
    expect(left.map((card) => within(card).getByTestId("approval-place").textContent)).toEqual(["This computer"]);

    // [approvals-5] this computer's request is answered at its own core.
    fireEvent.click(within(left[0]!).getByRole("button", { name: "Deny" }));
    await settle();
    expect(local.command).toHaveBeenCalledWith("approval.respond", {
      generation: "generation-local",
      requestId: "request-1",
      owner: REQUEST.owner,
      decision: "deny",
    });
    expect(commandsOf(beta).filter((type) => type === "approval.respond")).toHaveLength(1);
  });

  test("a disconnected place disables its own requests' controls alone", () => {
    useAppStore.setState({ approvals: snapshot("generation-local", [REQUEST]) });
    betaStore.setState({ approvals: snapshot("generation-beta", [SEAT_REQUEST]), connection: "closed" });
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Tool approvals (2)" }));
    const cards = [...screen.getByRole("region", { name: "Tool approvals" }).querySelectorAll("article")];
    // [approvals-5] a disconnected client disables its controls.
    expect((within(cards[1]!).getByRole("button", { name: "Approve once" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(cards[0]!).getByRole("button", { name: "Approve once" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("Reconnect to answer these requests.")).toBeTruthy();
  });
});
