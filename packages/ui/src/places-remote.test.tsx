// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// run-view-171: the remote rules (run-view-169, space-103, settings-48,
// DR-133, DR-175). The local store and two seat stores, each over a fake
// client of its own, with the shell's picker and reveal present: this
// computer's Space rows ask the picker for an "Open here"'s folder,
// offer "Choose folder…" for a clone whose code found none and reveal a
// clone's path, while a seat's offer none of these — its "Open here"
// and its "Try again" send `space.join` with no folder to that seat's core
// alone, and a code clone that failed for want of the member's
// credential offers "Add a credential", opening the seat's Settings at
// its Credentials section with that host. The project palette lists,
// under one "From your groups", each project of the member's groups this
// computer lacks, once, every row — an open project's or a group's —
// carrying its Space row's Open control: "Open on <server>" sends that
// seat's core a join with no folder, reads "Signing in to <Space>…",
// disabled, while that seat's sign-in runs, and asks the server's
// contract on this computer's Space where no seat is open there; "Show
// on <server>" shows a seat's project; "Open here" opens into the folder
// the shell's picker took or a path named in place; and this computer's
// welcome page opens the palette there while signed in and leads to the
// Space surface's sign-in while not (run-view-168, run-view-172). A seat
// holding no project adds no heading to the sidebar and no page of its
// own, the Projects surface showing this computer's (run-view-67). A
// remote place's repair row offers neither a folder nor its proposal's
// "Add project", its environment's folder request no picker — its
// folder named relative to its project alone — and its draft's source
// neither a picked file nor a pasted path; the Academy example is
// seeded on this computer alone. settings-51: the Credentials
// section says its fixed sentence, sends `credential.set` and
// `credential.remove`, lists what is set with no secret shown, refuses
// a blank name or value in place, shows the host a failed clone named
// and opens at that host.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type {
  ConfigState,
  CredentialList,
  DiagnosticRepair,
  DraftInfo,
  GroupsState,
  InstanceGroupState,
  PlacementState,
  ProjectInfo,
  RepositoryState,
  SeatState,
  ServerListing,
} from "@sublang/spex-core/protocol";

import { App } from "./App.js";
import { NO_CAN, groupsState, instanceState, repositoryRow } from "./fixtures/groups-state.js";
import { CONFIG_STATE, environment } from "./fixtures/playbooks.js";
import { activateLanguage } from "./i18n.js";
import { SpexCommandError, type SpexClient } from "./lib/client.js";
import { usePlaces } from "./state/places.js";
import { useServerOpens } from "./state/server-opens.js";
import {
  createAppStore,
  setClientForTests,
  useAppStore,
  type AppState,
  type AppStore,
} from "./state/store.js";

afterEach(cleanup);

// jsdom has no layout, so the keep-in-view calls need a stub.
Element.prototype.scrollIntoView = vi.fn();

const SPEX = "https://spex.pub";

/** Two seats on the instance, each keyed `<instance origin>#<server
 * id>` and shown by its server's name (core-service-128). */
const ALPHA: SeatState = {
  instance: SPEX,
  serverId: "41",
  name: "build-box",
  group: "acme/infra",
  place: `${SPEX}#41`,
  leaseExpiresAt: Date.now() + 3_600_000,
  relay: "open",
  signIn: { state: "signedIn" },
};
const BETA: SeatState = { ...ALPHA, serverId: "42", name: "gpu-box", place: `${SPEX}#42` };

/** This computer's servers listing (core-service-128): the two seats'
 * servers, open there, each at its seat's place, and any `more` — the
 * palette's server entries read it (space-111). */
function listing(...more: ServerListing["servers"]): ServerListing {
  return {
    servers: [
      { instance: SPEX, id: "41", name: "build-box", group: "acme/infra", open: true },
      { instance: SPEX, id: "42", name: "gpu-box", group: "acme/infra", open: true },
      ...more,
    ],
    failures: [],
  };
}

const BRANCH: NonNullable<PlacementState["branch"]> = {
  ahead: 0,
  behind: 0,
  checkedAt: 1,
  hostEmpty: false,
  unrelated: false,
  agreed: null,
};

/** A spex repository the instance lists in the member's group and no
 * clone of which is at the place: its row offers Join (space-61). */
const ABSENT_KEY = "@spex.pub/acme/alpha-spex";
const absent = repositoryRow(ABSENT_KEY, {
  instance: SPEX,
  governing: SPEX,
  id: "101",
  state: "absent",
  branch: null,
});

/** A spex repository joined at the place whose code clone failed: the
 * records are cloned, no folder pairs them (space-63, space-103). */
const FAILED_KEY = "@spex.pub/acme/beta-spex";
function failed(credential?: string): RepositoryState {
  return repositoryRow(FAILED_KEY, {
    instance: SPEX,
    governing: SPEX,
    id: "102",
    state: "reachable",
    code: "https://git.example.com/acme/beta.git",
    branch: BRANCH,
    sync: {
      phase: "stopped",
      op: "join",
      step: "code",
      cause: "git",
      message: credential
        ? `Code not cloned: ${credential} needs a credential of yours. Add one under Settings.`
        : "fatal: could not read from remote repository",
      guidance: "",
      retry: false,
      ...(credential !== undefined ? { credential } : {}),
    },
  });
}

const ACME = (repositories: RepositoryState[]): InstanceGroupState => ({
  id: "7",
  login: null,
  mine: false,
  placed: [],
  fullPath: "acme",
  name: "acme",
  can: NO_CAN,
  repositories,
});

/** A place's Groups: the instance signed in, the member's group `acme`
 * listing one repository not at the place and one whose code clone
 * failed there — for want of the member's credential at a seat. */
function placeGroups(credential?: string, diagnostics: GroupsState["diagnostics"] = []): GroupsState {
  return groupsState({
    instances: [
      instanceState(SPEX, {
        displayName: "spex.pub",
        groups: [ACME([absent, failed(credential)])],
      }),
    ],
    diagnostics,
  });
}

/** A spex repository no working folder pairs, the core proposing the
 * folder its sessions recorded (space-53). */
const REPAIR: DiagnosticRepair = {
  kind: "repository",
  repository: "acme/infra-spex",
  name: "infra-spex",
  group: "acme",
  directories: ["/code/infra"],
  sessions: 2,
  key: "acme/infra-spex|/code/infra",
  checked: [{ path: "/code/infra", here: true, repo: true }],
  proposal: { path: "/code/infra", from: "recorded" },
};
const REPAIR_ISSUE: GroupsState["diagnostics"][number] = {
  file: "workspace/acme/infra-spex",
  reason: "no working folder pairs it",
  blocking: false,
  repair: REPAIR,
};

/** The reply a command with no test-specific answer gets: one the
 * protocol allows, at the local core and at each seat alike. */
function defaultReply(type: string, fields?: Record<string, unknown>): unknown {
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
    case "space.join":
      return { accepted: true };
    case "server.list":
      return { servers: [], failures: [] };
    case "credential.list":
      return { hosts: [], agents: [] };
    case "environment.playbooks":
      return { project: [], own: [] };
    case "environment.get":
      return environment({ repository: String(fields?.repository) });
    case "draft.defaults":
      return { org: "acme", license: "Apache-2.0" };
    case "compile.check":
      return { node: { ok: true, version: "v23.6.0", command: "node" }, slc: { ok: true, command: ["npx"] } };
    case "specs.get":
      return { present: false, legacy: false, files: [], decisions: [], intents: [], notices: [], readAt: 0 };
    default:
      return {};
  }
}

/** A fake core: every command recorded, each answered from `answers`
 * where the test names one — a function of the fields, or a value —
 * and as the protocol allows otherwise. */
function fakeClient() {
  const answers: Record<string, unknown> = {};
  const command = vi.fn(async (type: string, fields?: Record<string, unknown>) => {
    if (!(type in answers)) return defaultReply(type, fields);
    const answer = answers[type];
    return typeof answer === "function" ? (answer as (fields?: Record<string, unknown>) => unknown)(fields) : answer;
  });
  const subscribe = vi.fn(async (_target?: unknown) => null);
  const unsubscribe = vi.fn(async () => null);
  const client = { command, subscribe, unsubscribe } as unknown as SpexClient;
  return { client, command, answers };
}
type Fake = ReturnType<typeof fakeClient>;

function project(id: string, name: string): ProjectInfo {
  return {
    id,
    name,
    path: `/work/${name}`,
    registeredAt: 0,
    repository: { key: id, name: `${name}-spex`, group: "acme", own: false },
  } as unknown as ProjectInfo;
}

const HOME = project("p1", "home-project");
const GPU = project("p2", "gpu-project");

/** The recorded instance every command on a draft session names. */
const DRAFT_INSTANCE = "72000000-0000-4000-8000-0000000000aa";

/** A draft with no source yet in a place's project (storage-23). */
function draftAt(projectId: string): DraftInfo {
  return {
    id: "triage",
    instance: DRAFT_INSTANCE,
    projectId,
    createdAt: Date.now() - 3_600_000,
    touchedAt: Date.now() - 3_000_000,
    firstLine: null,
    activity: "idle",
    state: "no-source",
    queued: [],
    player: null,
    agent: { adapter: "claude", model: "claude-opus-5", effort: "high" },
    ready: true,
    failures: 0,
  };
}

/** A seat's own config. */
const SEAT_CONFIG: ConfigState = {
  ...(CONFIG_STATE as Extract<ConfigState, { status: "valid" }>),
  summary: {
    ...(CONFIG_STATE as Extract<ConfigState, { status: "valid" }>).summary,
    path: "/home/member/.spex/config/playbook.config.yaml",
  },
} as ConfigState;

const pristine = useAppStore.getState();
let local: Fake;
let alpha: Fake;
let beta: Fake;
let alphaStore: AppStore;
let betaStore: AppStore;
let pickDirectory: ReturnType<typeof vi.fn>;
let revealPath: ReturnType<typeof vi.fn>;

/** A seat's store over its own fake client, connected with its state
 * read, as the relay would leave it. */
function seatStore(seat: SeatState, fake: Fake, state: Partial<AppState>): AppStore {
  const store = createAppStore({ key: seat.place, name: seat.name }, fake.client);
  store.setState({ connection: "open", everConnected: true, ledger: { intents: [], attention: [], badge: 0 } });
  store.setState(state);
  return store;
}

/** This page's storage, kept in memory for each test. */
let kept: Map<string, string>;
let realStorage: PropertyDescriptor | undefined;

beforeEach(() => {
  kept = new Map();
  realStorage = Object.getOwnPropertyDescriptor(window, "localStorage");
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => kept.get(key) ?? null,
      setItem: (key: string, value: string) => kept.set(key, value),
      removeItem: (key: string) => kept.delete(key),
      clear: () => kept.clear(),
      key: (index: number) => [...kept.keys()][index] ?? null,
      get length() {
        return kept.size;
      },
    },
  });
  // The shell's picker and reveal (DR-008): this computer's to offer.
  pickDirectory = vi.fn(async () => "/work/alpha");
  revealPath = vi.fn(async () => true);
  (window as unknown as { spexNative?: unknown }).spexNative = { pickDirectory, revealPath };
  activateLanguage("en");
  // The servers' flows are the page's own, one per server: each test
  // starts with none (state/server-opens).
  useServerOpens.setState({ lines: {}, pending: {}, landed: 0 });
  local = fakeClient();
  alpha = fakeClient();
  beta = fakeClient();
  local.answers["space.get"] = placeGroups();
  local.answers["server.list"] = listing();
  alpha.answers["space.get"] = placeGroups("git.example.com");
  setClientForTests(local.client);
  useAppStore.setState({
    connection: "open",
    everConnected: true,
    projects: [HOME],
    currentProjectId: "p1",
    configState: CONFIG_STATE,
    ledger: { intents: [], attention: [], badge: 0 },
    seats: [ALPHA, BETA],
  });
  alphaStore = seatStore(ALPHA, alpha, {
    projects: [GPU],
    configState: SEAT_CONFIG,
    space: placeGroups("git.example.com"),
  });
  betaStore = seatStore(BETA, beta, { projects: [], configState: CONFIG_STATE });
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
  delete (window as unknown as { spexNative?: unknown }).spexNative;
  if (realStorage) Object.defineProperty(window, "localStorage", realStorage);
  activateLanguage("en");
});

/** Let replies and the work they set off land. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let tick = 0; tick < 20; tick += 1) await Promise.resolve();
  });
}

const callsOf = (fake: Fake, type: string): unknown[] =>
  fake.command.mock.calls.filter(([name]) => name === type).map(([, fields]) => fields);
const credentialCommands = (fake: Fake): string[] =>
  fake.command.mock.calls.map(([type]) => type).filter((type) => type.startsWith("credential."));

function goTo(surface: "Settings" | "Space"): void {
  fireEvent.click(document.querySelector<HTMLElement>(`[data-surface="${surface}"]`)!);
}

/** Show a place's project with one of its pinned tabs: the tabs stand
 * at the project's place (run-view-168, DR-172). */
async function projectTab(rowTestId: string, tab: "playbooks" | "packages"): Promise<void> {
  fireEvent.click(screen.getByTestId(rowTestId));
  await settle();
  fireEvent.click(screen.getByTestId(`workspace-tab-${tab}`));
  await settle();
}

function pick(label: string): void {
  const selector = screen.getByTestId("place-selector") as HTMLSelectElement;
  const option = [...selector.options].find((entry) => entry.textContent === label)!;
  fireEvent.change(selector, { target: { value: option.value } });
}

const shownPlace = (): string => {
  const selector = screen.getByTestId("place-selector") as HTMLSelectElement;
  return selector.selectedOptions[0]!.textContent ?? "";
};

/** What a path entry would be: a one-line field taking text — an
 * intent's capture box is no path. */
const pathEntries = (root: HTMLElement): HTMLInputElement[] =>
  within(root)
    .queryAllByRole("textbox")
    .filter((field): field is HTMLInputElement => field instanceof HTMLInputElement);

describe("run-view-171: a remote place offers no picker, reveal or path entry", () => {
  test("Groups rows: this computer's ask the picker and reveal; a seat's join with no folder and reveal nothing", async () => {
    render(<App />);
    goTo("Space");
    await settle();

    // This computer: "Open here" asks the shell's picker for the folder,
    // the picker opened by the act itself, and sends it (space-111,
    // space-63).
    const openHere = screen.getByTestId(`space-row-open-${ABSENT_KEY}`);
    expect(openHere.textContent).toBe("Open here");
    expect(openHere.getAttribute("data-entry")).toBe(`space-row-open-here-${ABSENT_KEY}`);
    fireEvent.click(openHere);
    await settle();
    expect(pickDirectory).toHaveBeenCalledTimes(1);
    expect(callsOf(local, "space.join")).toEqual([{ instance: SPEX, hostId: "101", folder: "/work/alpha" }]);
    // A clone whose code found no folder offers "Choose folder…"
    // (space-63), and its clone's path is revealed.
    const folder = screen.getByTestId(`space-row-open-${FAILED_KEY}`);
    expect(folder.textContent).toBe("Choose folder…");
    expect(folder.getAttribute("data-entry")).toBe(`space-row-folder-${FAILED_KEY}`);
    expect(screen.queryByText("Try again")).toBeNull();
    expect(screen.queryByTestId(`space-row-credential-${FAILED_KEY}`)).toBeNull();
    fireEvent.click(screen.getByTestId(`space-repo-${FAILED_KEY}`));
    expect(screen.getByTestId("space-clone-path-reveal")).toBeTruthy();

    // The seat: the same rows, at its own core.
    pick("build-box");
    await settle();
    expect(shownPlace()).toBe("build-box");
    fireEvent.click(screen.getByTestId(`space-row-open-${ABSENT_KEY}`));
    await settle();
    // [run-view-171] [run-view-169] a remote place's "Open here" asks
    // no picker and opens no path entry; it sends `space.join` with no
    // folder to that place's core alone.
    expect(pickDirectory).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId(`space-join-${ABSENT_KEY}`)).toBeNull();
    expect(callsOf(alpha, "space.join")).toEqual([{ instance: SPEX, hostId: "101" }]);
    expect(callsOf(local, "space.join")).toHaveLength(1);
    expect(callsOf(beta, "space.join")).toEqual([]);
    // [run-view-169] no "Choose folder…" there (space-63, space-103):
    // "Try again" instead.
    expect(screen.getByTestId(`space-row-open-${FAILED_KEY}`).getAttribute("data-entry")).toBe(
      `space-row-join-again-${FAILED_KEY}`,
    );
    expect(screen.queryByText("Choose folder…")).toBeNull();
    // [run-view-169] no reveal of a path on the server; its copy stays.
    fireEvent.click(screen.getByTestId(`space-repo-${FAILED_KEY}`));
    expect(screen.getByTestId("space-repository")).toBeTruthy();
    expect(screen.queryByTestId("space-clone-path-reveal")).toBeNull();
    expect(screen.getByTestId("space-clone-path-copy")).toBeTruthy();
    expect(pathEntries(screen.getByTestId("space-groups"))).toEqual([]);
    expect(revealPath).not.toHaveBeenCalled();
  });

  test("the palette: this computer's folder picker, one From your groups of what this computer lacks", async () => {
    render(<App />);
    fireEvent.keyDown(window, { key: "p", metaKey: true });
    const palette = screen.getByTestId("project-palette");
    // Desktop adds this computer's project through its folder picker; a
    // new project is always this computer's, so no footnote names where
    // it lands.
    expect(within(palette).queryByTestId("palette-path")).toBeNull();
    expect(within(palette).getByTestId("palette-open-folder")).toBeTruthy();
    expect(within(palette).queryByTestId("palette-new-place")).toBeNull();
    expect(within(palette).queryByText(/^A new project is added on/)).toBeNull();
    await settle();
    // [run-view-171] [run-view-168] one "From your groups", no section
    // per seat: each project of the groups this computer lacks, once —
    // its own clone whose code found no folder is paired from its Space
    // row (space-63) — with no path entry and no picker of a seat's.
    const groups = within(palette).getByTestId("palette-groups");
    expect(screen.getByRole("group", { name: "From your groups" })).toBe(groups);
    expect(within(palette).getAllByRole("group")).toEqual([groups]);
    expect(within(palette).queryByTestId(`palette-groups-${ALPHA.place}`)).toBeNull();
    expect(within(palette).queryByText(/^From your groups on /)).toBeNull();
    expect(within(groups).getAllByRole("button").map((button) => button.getAttribute("data-testid"))).toEqual([
      `palette-join-${ABSENT_KEY}`,
      `palette-join-places-${ABSENT_KEY}`,
    ]);
    expect(within(groups).queryByTestId(`palette-join-again-${FAILED_KEY}`)).toBeNull();
    expect(pathEntries(groups)).toEqual([]);
    // [run-view-168] a seat's project names its place; this computer's
    // groups list nothing of its records this computer lacks, so its row
    // carries no Open control of another place, nor does this computer's
    // project, which its groups list nowhere.
    expect(within(palette).getByTestId(`palette-project-p2@${ALPHA.place}`).textContent).toContain("build-box");
    expect(within(palette).queryByTestId(`palette-project-places-p2@${ALPHA.place}`)).toBeNull();
    expect(within(palette).queryByTestId("palette-project-places-p1")).toBeNull();
    // [run-view-168] the palette reads no seat's groups.
    expect(callsOf(beta, "space.get")).toEqual([]);

    // [run-view-171] [run-view-168] with every project of the groups
    // open here, the list says so; with the groups listing none, that
    // they list none.
    const here = { ...absent, state: "reachable" as const, folder: "/work/alpha", branch: BRANCH };
    act(() =>
      useAppStore.setState({
        space: groupsState({ instances: [instanceState(SPEX, { displayName: "spex.pub", groups: [ACME([here])] })] }),
      }),
    );
    expect(within(groups).getByTestId("palette-groups-note").textContent).toBe("All your groups' projects are open here");
    act(() =>
      useAppStore.setState({
        space: groupsState({ instances: [instanceState(SPEX, { displayName: "spex.pub", groups: [ACME([])] })] }),
      }),
    );
    expect(within(groups).getByTestId("palette-groups-note").textContent).toBe("No projects in your groups yet");
  });

  test("a seat's Overview offers no picker, reveal or path entry", async () => {
    alphaStore.getState().setWorkspaceTab("p2", "overview");
    render(<App />);
    fireEvent.keyDown(window, { key: "p", metaKey: true });
    fireEvent.click(screen.getByTestId(`palette-project-p2@${ALPHA.place}`));
    await settle();
    const overview = screen.getByTestId("overview-tab");
    expect(overview.textContent).toContain("gpu-project");
    // [run-view-169] nothing there picks, reveals or takes a path.
    expect(pathEntries(overview)).toEqual([]);
    expect(overview.querySelector('[data-testid$="-reveal"]')).toBeNull();
    expect(within(overview).queryByText("Open folder…")).toBeNull();
  });

  test("a repair row: this computer's offers the proposed folder and a path, a seat's neither", async () => {
    local.answers["space.get"] = placeGroups(undefined, [REPAIR_ISSUE]);
    alpha.answers["space.get"] = placeGroups("git.example.com", [REPAIR_ISSUE]);
    alphaStore.setState({ space: placeGroups("git.example.com", [REPAIR_ISSUE]) });
    render(<App />);
    goTo("Space");
    await settle();

    // This computer: the proposal's "Use <folder>", and Choose folder…
    // opening the path editor with the shell's picker (space-47).
    fireEvent.click(screen.getByTestId("space-issues"));
    const here = screen.getByTestId("space-repair");
    expect(within(here).getByTestId("space-repair-use").textContent).toBe("Use /code/infra");
    fireEvent.click(within(here).getByTestId("space-repair-choose"));
    expect(within(here).getByTestId("space-repair-path")).toBeTruthy();
    expect(within(here).getByRole("button", { name: "Open folder…" })).toBeTruthy();

    // The seat: the same repair, at its own core.
    pick("build-box");
    await settle();
    fireEvent.click(screen.getByTestId("space-issues"));
    const there = screen.getByTestId("space-repair");
    // Named by the project and its group, the folder it remembers
    // secondary, the server named where this computer would be
    // (space-46, space-112).
    expect(within(there).getByTestId("space-repair-title").textContent).toBe(
      "infra · acme — Folder missing on build-box",
    );
    expect(within(there).getByTestId("space-repair-folder").textContent).toBe("/code/infra · 2 sessions ran there");
    // [run-view-171] [run-view-169] a remote place's repair row offers
    // no folder: neither its proposal's "Use <folder>" nor "Choose
    // folder…", no path editor and no picker (space-47, space-103).
    expect(within(there).queryByTestId("space-repair-use")).toBeNull();
    expect(within(there).queryByText(/^Use /)).toBeNull();
    expect(within(there).queryByTestId("space-repair-choose")).toBeNull();
    expect(within(there).queryByText("Choose folder…")).toBeNull();
    expect(within(there).queryByTestId("space-repair-path")).toBeNull();
    expect(within(there).queryByText("Open folder…")).toBeNull();
    expect(pathEntries(there)).toEqual([]);
    // Declining names no folder, and stands, naming the server
    // (space-112).
    expect(within(there).getByTestId("space-repair-decline").textContent).toBe("Not on build-box");
    expect(pickDirectory).not.toHaveBeenCalled();
    expect(callsOf(alpha, "project.rebind")).toEqual([]);
  });

  test("an environment's folder request: this computer's offers the picker, a seat's a folder named relative to its project alone", async () => {
    local.answers["environment.get"] = (fields?: Record<string, unknown>) =>
      environment({ repository: String(fields?.repository), pathRoot: "/work/home-project" });
    alpha.answers["environment.get"] = (fields?: Record<string, unknown>) =>
      environment({ repository: String(fields?.repository), pathRoot: "/home/member/projects/gpu" });
    alphaStore.setState({ currentProjectId: "p2" });
    render(<App />);
    await projectTab("sidebar-project-p1", "packages");
    const section = () => within(screen.getByTestId("packages-project"));

    // This computer: the folder request offers the shell's picker.
    fireEvent.click(await section().findByTestId("add-open"));
    fireEvent.click(section().getByTestId("add-from-folder"));
    const here = section().getByTestId("folder-request");
    expect(here.textContent).toContain("Folder inside /work/home-project");
    expect(within(here).getByTestId("folder-request-pick").textContent).toBe("Choose folder…");

    // The seat's project, its Packages tab at the seat.
    await projectTab(`sidebar-project-p2@${ALPHA.place}`, "packages");
    fireEvent.click(await section().findByTestId("add-open"));
    await waitFor(() =>
      expect((section().getByTestId("add-from-folder") as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(section().getByTestId("add-from-folder"));
    const there = section().getByTestId("folder-request");
    expect(there.textContent).toContain("Folder inside /home/member/projects/gpu");
    // [run-view-171] [run-view-169] a remote place's environment folder
    // request offers no folder picker: the shell's reads this
    // computer's disk.
    expect(within(there).queryByTestId("folder-request-pick")).toBeNull();
    expect(within(there).queryByText("Choose folder…")).toBeNull();
    expect(pickDirectory).not.toHaveBeenCalled();
    // [run-view-171] no path on this computer: the one folder field
    // names the folder relative to its project, and the request sent to
    // the seat's core alone carries that relative name.
    fireEvent.change(within(there).getByTestId("folder-request-path"), { target: { value: "spex-packages/triage" } });
    // The seat's core reads the folder's meta.yaml, here naming no
    // package, so the name is asked for (playbook-library-92).
    await within(there).findByTestId("folder-request-name");
    const fields = pathEntries(there).map((field) => field.getAttribute("data-testid"));
    expect(fields).toEqual(["folder-request-path", "folder-request-name"]);
    expect(there.textContent).not.toContain("/work/");
    fireEvent.change(within(there).getByTestId("folder-request-name"), { target: { value: "acme/triage" } });
    fireEvent.click(within(there).getByTestId("folder-request-submit"));
    await settle();
    expect(callsOf(alpha, "environment.request")).toEqual([
      { repository: expect.any(String), request: { kind: "path", path: "spex-packages/triage" }, dryRun: true },
      { repository: expect.any(String), name: "acme/triage", request: { kind: "path", path: "spex-packages/triage" } },
    ]);
    expect(callsOf(local, "environment.request")).toEqual([]);
    expect(callsOf(beta, "environment.request")).toEqual([]);
  });

  test("a draft's source: this computer's offers a picked file and a pasted path, a seat's text alone", async () => {
    const pickFile = vi.fn(async () => "/Users/me/skill/SKILL.md");
    (window as unknown as { spexNative?: unknown }).spexNative = { pickDirectory, revealPath, pickFile };
    const here = draftAt("p1");
    const there = draftAt("p2");
    local.answers["draft.list"] = [here];
    alpha.answers["draft.list"] = [there];
    useAppStore.setState({
      drafts: { triage: here },
      draftsLoaded: true,
      openDraftId: "triage",
      draftSources: { triage: null },
    });
    alphaStore.setState({
      currentProjectId: "p2",
      drafts: { triage: there },
      draftsLoaded: true,
      openDraftId: "triage",
      draftSources: { triage: null },
    });
    render(<App />);
    await projectTab("sidebar-project-p1", "playbooks");

    // This computer: Paste takes text, a path, or a picked file.
    fireEvent.click(within(screen.getByTestId("source-empty")).getByTestId("source-paste"));
    expect(screen.getByTestId("paste-path")).toBeTruthy();
    expect(screen.getByTestId("paste-pick").textContent).toBe("Pick file");

    // The seat's project, its Playbooks tab at the seat.
    await projectTab(`sidebar-project-p2@${ALPHA.place}`, "playbooks");
    // [run-view-171] [run-view-169] a remote place's draft source offers
    // no picked file and no pasted path: pasted text alone.
    fireEvent.click(within(screen.getByTestId("source-empty")).getByTestId("source-paste"));
    expect(screen.getByTestId("paste-text")).toBeTruthy();
    expect(screen.queryByTestId("paste-path")).toBeNull();
    expect(screen.queryByTestId("paste-pick")).toBeNull();
    expect(screen.queryByText("Source file path (overrides the text)")).toBeNull();
    fireEvent.click(screen.getByTestId("paste-cancel"));
    // [run-view-169] "Use a SKILL.md…" picks no file there: it opens
    // the paste, text alone.
    fireEvent.click(screen.getByTestId("opener-skill"));
    await settle();
    expect(pickFile).not.toHaveBeenCalled();
    expect(screen.getByTestId("paste-text")).toBeTruthy();
    expect(screen.queryByTestId("paste-path")).toBeNull();
    // A pasted text is the seat's source, written at its core alone.
    fireEvent.change(screen.getByTestId("paste-text"), { target: { value: "# Train" } });
    fireEvent.click(screen.getByTestId("paste-use"));
    await settle();
    expect(callsOf(alpha, "draft.source.write")).toEqual([
      { projectId: "p2", draftId: "triage", instance: DRAFT_INSTANCE, content: "# Train" },
    ]);
    expect(callsOf(local, "draft.source.write")).toEqual([]);
  });

  test("the Academy example is seeded on this computer alone", async () => {
    useAppStore.setState({ projects: [], currentProjectId: undefined });
    local.answers["project.create"] = project("p9", "spex-academy");
    render(<App />);
    // This computer's Captain home, with no project, offers the example.
    expect(screen.getByTestId("home-academy")).toBeTruthy();

    // The seat's project shown, which then leaves it.
    fireEvent.click(screen.getByTestId(`sidebar-project-p2@${ALPHA.place}`));
    await settle();
    expect(screen.queryByTestId("welcome-home")).toBeNull();
    act(() => alphaStore.setState({ projects: [], currentProjectId: undefined }));
    // [run-view-169] [run-view-168] a seat's projects are opened among the
    // member's groups, its core allocating every folder, and a seat
    // holding none has no page of its own: the welcome page is this
    // computer's, its example seeded here alone.
    const welcome = screen.getByTestId("welcome-home");
    expect(within(welcome).getByTestId("home-add-project")).toBeTruthy();
    // The way in to a project on a server is the palette's "From your
    // groups", never the add form.
    fireEvent.click(within(welcome).getByTestId("home-open-from-groups"));
    await settle();
    expect(screen.queryByTestId("palette-own-project")).toBeNull();
    expect(screen.getByTestId("palette-groups")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByTestId("project-palette")).toBeNull();
    fireEvent.click(within(welcome).getByTestId("home-academy"));
    await settle();
    expect(callsOf(local, "project.create")).toEqual([{ path: "~/spex-academy", example: true }]);
    expect(callsOf(alpha, "project.create")).toEqual([]);
    expect(callsOf(beta, "project.create")).toEqual([]);
  });

  test("a seat's project with no specs offers no Academy example in its Specs tab", async () => {
    useAppStore.getState().setWorkspaceTab("p1", "specs");
    alphaStore.getState().setWorkspaceTab("p2", "specs");
    render(<App />);
    await settle();
    // This computer's project offers the example where it has no specs.
    expect(within(await screen.findByTestId("specs-empty")).getByTestId("specs-empty-academy")).toBeTruthy();
    fireEvent.click(screen.getByTestId(`sidebar-project-p2@${ALPHA.place}`));
    await settle();
    const empty = await screen.findByTestId("specs-empty");
    // [run-view-169] a seat's offers none: it would seed a folder named
    // on the server, where the seat's core allocates every folder.
    expect(within(empty).queryByTestId("specs-empty-academy")).toBeNull();
    expect(callsOf(alpha, "specs.get")).toContainEqual({ projectId: "p2" });
  });
});

/** The sidebar's heading of the place shown by `label`. */
function headingOf(label: string): HTMLElement {
  const headings = within(screen.getByTestId("sidebar")).getAllByTestId("sidebar-place-heading");
  return headings.find((heading) => heading.textContent === label)!;
}

/** The sidebar's place headings, in the order they stand. */
const headings = (): string[] =>
  within(screen.getByTestId("sidebar"))
    .queryAllByTestId("sidebar-place-heading")
    .map((heading) => heading.textContent ?? "");

describe("run-view-171: a seat holding no project adds no heading and no page of its own", () => {
  test("its heading stands once it holds or is opening a project, this computer's welcome page showing meanwhile", async () => {
    useAppStore.setState({ projects: [], currentProjectId: undefined });
    render(<App />);
    await settle();
    // [run-view-171] [run-view-67] the seat holding no project (gpu-box)
    // adds no heading, while the other seat's stands beside this
    // computer's.
    expect(headings()).toEqual(["This computer", "build-box"]);
    // [run-view-171] [run-view-168] the Projects surface shows this
    // computer's welcome page, in its local form alone.
    const welcome = screen.getByTestId("welcome-home");
    expect(within(welcome).getByTestId("home-add-project")).toBeTruthy();
    expect(within(welcome).getByRole("heading", { level: 1 }).textContent).toBe("Write clear specs. Build with playbooks.");
    expect(welcome.textContent).not.toMatch(/gpu-box|build-box/);

    // [run-view-171] [run-view-168] the seat's project shown, then gone
    // from it: no seat holds a project, so no heading stands, and the seat
    // has no page of its own — this computer's welcome page shows.
    fireEvent.click(screen.getByTestId(`sidebar-project-p2@${ALPHA.place}`));
    await settle();
    expect(screen.queryByTestId("welcome-home")).toBeNull();
    act(() => alphaStore.setState({ projects: [], currentProjectId: undefined }));
    await settle();
    expect(headings()).toEqual([]);
    expect(within(screen.getByTestId("welcome-home")).getByTestId("home-add-project")).toBeTruthy();

    // [run-view-171] [run-view-67] a seat opening a project, then holding
    // one, has its heading stand, "This computer" heading its rows again.
    const opening = groupsState({
      instances: [
        instanceState(SPEX, {
          displayName: "spex.pub",
          groups: [ACME([{ ...absent, sync: { phase: "running", op: "join", step: "code", since: Date.now(), cancelable: false } }])],
        }),
      ],
    });
    act(() => betaStore.setState({ space: opening }));
    expect(headings()).toEqual(["This computer", "gpu-box"]);
    act(() => betaStore.setState({ space: undefined, projects: [GPU] }));
    expect(headings()).toEqual(["This computer", "gpu-box"]);
    expect(screen.getByTestId(`sidebar-project-p2@${BETA.place}`)).toBeTruthy();
  });
});

describe("run-view-171: a seat whose sign-in at its instance runs", () => {
  /** The approval page of the seat's running sign-in (core-service-142). */
  const APPROVE = `${SPEX}/login/device?user_code=WDJB-MJHT`;
  const signingIn: SeatState = {
    ...BETA,
    signIn: { state: "running", verificationUri: APPROVE, expiresAt: Date.now() + 600_000 },
  };

  test("a row's entry for that seat reads Signing in to <Space>…, disabled, until its sign-in completes", async () => {
    useAppStore.setState({ seats: [ALPHA, signingIn] });
    alphaStore.setState({ projects: [GPU, project(ABSENT_KEY, "alpha")] });
    render(<App />);
    fireEvent.keyDown(window, { key: "p", metaKey: true });
    await settle();
    fireEvent.click(screen.getByTestId(`palette-join-places-${ABSENT_KEY}`));
    const menu = screen.getByTestId(`palette-join-places-${ABSENT_KEY}-menu`);
    const entries = (): string[] => within(menu).getAllByRole("menuitem").map((item) => item.textContent ?? "");
    const there = (): HTMLButtonElement =>
      within(menu).getByTestId(`palette-open-at-${BETA.place}-${ABSENT_KEY}`) as HTMLButtonElement;
    // [run-view-171] [run-view-168] where the seat's sign-in runs, and
    // where it is not yet read, its entry says it signs in at the Space,
    // disabled; the other seat, signed in and holding the project, shows
    // it there.
    expect(entries()).toEqual(["Show on build-box", "Signing in to spex.pub…"]);
    expect(there().disabled).toBe(true);
    act(() => useAppStore.setState({ seats: [ALPHA, { ...BETA, signIn: { state: "pending" } }] }));
    expect(there().textContent).toBe("Signing in to spex.pub…");
    expect(there().disabled).toBe(true);
    // [run-view-168] signed in, the entry opens the project there.
    act(() => useAppStore.setState({ seats: [ALPHA, BETA] }));
    expect(entries()).toEqual(["Show on build-box", "Open on gpu-box"]);
    expect(there().disabled).toBe(false);
    expect(callsOf(beta, "space.join")).toEqual([]);
  });
});

describe("run-view-171: activating a place's heading in the sidebar shows that place", () => {
  test("a seat's heading shows its project start, and this computer's brings this computer's back", async () => {
    alphaStore.setState({ currentProjectId: "p2" });
    render(<App />);
    await settle();
    const home = headingOf("This computer");
    const seat = headingOf("build-box");
    // [run-view-168] each heading is a row of the projects tree, inside
    // the group its place names.
    expect(home.getAttribute("role")).toBe("treeitem");
    expect(screen.getByRole("group", { name: "build-box" }).contains(seat)).toBe(true);
    expect(home.getAttribute("aria-current")).toBe("location");
    expect(seat.getAttribute("aria-current")).toBeNull();

    // [run-view-171] [run-view-168] from another surface, a seat's heading
    // shows that place on the Projects surface: its project start.
    fireEvent.click(document.querySelector<HTMLElement>('[data-surface="Dashboard"]')!);
    fireEvent.click(seat);
    await settle();
    expect(screen.getByTestId("project-task-start").textContent).toContain("What would you change in gpu-project?");
    expect(seat.getAttribute("aria-current")).toBe("location");
    expect(home.getAttribute("aria-current")).toBeNull();

    // [run-view-171] [run-view-168] this computer's heading, reached by
    // the tree's keys and activated by Enter, brings this computer's back.
    const row = screen.getByTestId("sidebar-project-p1");
    row.focus();
    fireEvent.keyDown(row, { key: "ArrowUp" });
    expect(document.activeElement).toBe(home);
    expect(home.tabIndex).toBe(0);
    fireEvent.keyDown(home, { key: "Enter" });
    await settle();
    expect(screen.getByTestId("project-task-start").textContent).toContain("What would you change in home-project?");
    expect(home.getAttribute("aria-current")).toBe("location");

    // [run-view-168] Space activates a heading too: the seat's shows its
    // project start again.
    seat.focus();
    fireEvent.keyDown(seat, { key: " " });
    await settle();
    expect(screen.getByTestId("project-task-start").textContent).toContain("What would you change in gpu-project?");
    expect(seat.getAttribute("aria-current")).toBe("location");
  });
});

/** Open the menu of a group's row's other places in the palette, beside
 * its own control, and hand it back (run-view-168, space-111). */
function rowPlaces(key: string): HTMLElement {
  fireEvent.click(screen.getByTestId(`palette-join-places-${key}`));
  return screen.getByTestId(`palette-join-places-${key}-menu`);
}

const entriesOf = (menu: HTMLElement): string[] =>
  within(menu)
    .getAllByRole("menuitem")
    .map((item) => item.textContent ?? "");

describe("run-view-171: opening a group's project on a seat", () => {
  test("Open on <server> sends space.join with no folder to that place's client alone; once the seat lists it, Show on <server> shows it there", async () => {
    render(<App />);
    fireEvent.keyDown(window, { key: "p", metaKey: true });
    await settle();
    // [run-view-171] [run-view-168] the group's row carries its Space
    // row's Open control: each server of its Space.
    const menu = rowPlaces(ABSENT_KEY);
    expect(entriesOf(menu)).toEqual(["Open on build-box", "Open on gpu-box"]);
    const entry = within(menu).getByTestId(`palette-open-at-${ALPHA.place}-${ABSENT_KEY}`) as HTMLButtonElement;
    expect(entry.disabled).toBe(false);
    fireEvent.click(entry);
    await settle();
    // [run-view-171] [run-view-169] the seat open and signed in, none is
    // opened: the join names the instance and the host id, and no
    // folder, the seat allocating it (space-103).
    expect(callsOf(local, "server.open")).toEqual([]);
    expect(callsOf(alpha, "space.join")).toEqual([{ instance: SPEX, hostId: "101" }]);
    expect(callsOf(local, "space.join")).toEqual([]);
    expect(callsOf(beta, "space.join")).toEqual([]);
    expect(pickDirectory).not.toHaveBeenCalled();
    // Accepted, the palette closes; the open reports on the Space row.
    expect(screen.queryByTestId("project-palette")).toBeNull();

    // [run-view-168] while that open runs, its entry is not offered
    // twice.
    fireEvent.keyDown(window, { key: "p", metaKey: true });
    await settle();
    expect((within(rowPlaces(ABSENT_KEY)).getByTestId(`palette-open-at-${ALPHA.place}-${ABSENT_KEY}`) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(window, { key: "Escape" });

    // [run-view-171] [run-view-168] the seat lists the project: the
    // group's row shows it there, and the seat's own row, which this
    // computer lacks, offers Open here.
    act(() => alphaStore.setState({ projects: [GPU, project(ABSENT_KEY, "alpha")] }));
    await settle();
    expect(screen.getByTestId(`palette-project-places-${ABSENT_KEY}@${ALPHA.place}`)).toBeTruthy();
    const shown = rowPlaces(ABSENT_KEY);
    expect(entriesOf(shown)).toEqual(["Show on build-box", "Open on gpu-box"]);
    fireEvent.click(within(shown).getByTestId(`palette-show-at-${ALPHA.place}-${ABSENT_KEY}`));
    await settle();
    // [run-view-168] "Show on <server>" shows it at that place, sending
    // nothing.
    expect(screen.queryByTestId("project-palette")).toBeNull();
    expect(alphaStore.getState().currentProjectId).toBe(ABSENT_KEY);
    expect(headingOf("build-box").getAttribute("aria-current")).toBe("location");
    expect(callsOf(alpha, "space.join")).toHaveLength(1);
  });

  test("with no seat open at the server, Open on <server> asks its contract on this computer's Space, the palette closing", async () => {
    const LAB = `${SPEX}#43`;
    local.answers["server.list"] = listing({ instance: SPEX, id: "43", name: "lab-box", group: "acme/lab", open: false });
    local.answers["server.open"] = { place: LAB, leaseExpiresAt: Date.now() + 3_600_000 };
    render(<App />);
    // From a seat's Space surface.
    goTo("Space");
    pick("build-box");
    await settle();
    fireEvent.keyDown(window, { key: "p", metaKey: true });
    await settle();
    const menu = rowPlaces(ABSENT_KEY);
    expect(entriesOf(menu)).toEqual(["Open on build-box", "Open on gpu-box", "Open on lab-box"]);
    fireEvent.click(within(menu).getByTestId(`palette-open-at-${LAB}-${ABSENT_KEY}`));
    await settle();
    // [run-view-171] [run-view-170] this device's first open of a seat
    // there: the palette closes on this computer's Space, the server's
    // contract beneath its line, nothing sent yet.
    expect(screen.queryByTestId("project-palette")).toBeNull();
    expect(document.querySelector('[data-surface="Space"]')!.getAttribute("aria-current")).toBe("page");
    expect(shownPlace()).toBe("This computer");
    const contract = screen.getByTestId(`space-server-contract-${LAB}`);
    expect(screen.getByTestId(`space-server-${LAB}`).contains(contract)).toBe(true);
    expect(callsOf(local, "server.open")).toEqual([]);
    // [run-view-171] "I understand" sends `server.open` with consent to
    // the local core alone.
    fireEvent.click(within(contract).getByTestId(`space-server-consent-${LAB}`));
    await settle();
    expect(callsOf(local, "server.open")).toEqual([{ instance: SPEX, serverId: "43", consented: true }]);
    expect(callsOf(alpha, "server.open")).toEqual([]);
    expect(callsOf(beta, "server.open")).toEqual([]);
    expect(callsOf(alpha, "space.join")).toEqual([]);
  });
});

describe("run-view-171: opening a group's project on this computer", () => {
  /** The palette's "From your groups" sections, by their test ids, in
   * the order they stand. */
  const sectionsOf = (palette: HTMLElement): (string | null)[] =>
    within(palette)
      .getAllByRole("group")
      .map((group) => group.getAttribute("data-testid"));

  test("the palette lists the groups' projects this computer lacks under one From your groups, one opening into the folder the shell's picker takes", async () => {
    render(<App />);
    fireEvent.keyDown(window, { key: "p", metaKey: true });
    await settle();
    const palette = screen.getByTestId("project-palette");
    // [run-view-168] one "From your groups", and no section per seat.
    const here = within(palette).getByTestId("palette-groups");
    expect(screen.getByRole("group", { name: "From your groups" })).toBe(here);
    expect(within(here).getByTestId("palette-groups-heading").textContent).toBe("From your groups");
    expect(sectionsOf(palette)).toEqual(["palette-groups"]);
    // [run-view-168] what this computer lacks, named as its code is with
    // its group, its Space row's Open control beside it: a clone here
    // whose code found no folder is paired from its Space row instead
    // (space-63).
    expect(within(here).getAllByRole("button").map((button) => button.getAttribute("data-testid"))).toEqual([
      `palette-join-${ABSENT_KEY}`,
      `palette-join-places-${ABSENT_KEY}`,
    ]);
    const row = within(here).getByTestId(`palette-join-${ABSENT_KEY}`);
    expect(row.textContent).toContain("alpha");
    expect(row.textContent).not.toContain("alpha-spex");
    expect(row.textContent).toContain("acme");
    fireEvent.click(row);
    await settle();
    // [run-view-171] [run-view-168] the act opens the shell's picker and
    // sends `space.join` with the folder it took to this computer's core
    // alone, as the Space row's Join does (space-63).
    expect(pickDirectory).toHaveBeenCalledTimes(1);
    expect(callsOf(local, "space.join")).toEqual([{ instance: SPEX, hostId: "101", folder: "/work/alpha" }]);
    expect(callsOf(alpha, "space.join")).toEqual([]);
    expect(callsOf(beta, "space.join")).toEqual([]);
    // Accepted, the palette closes; the join reports on the Space row.
    expect(screen.queryByTestId("project-palette")).toBeNull();
    // [run-view-171] the project is this computer's current one at once,
    // by its row's key, which it bears once the core lists it.
    expect(useAppStore.getState().currentProjectId).toBe(ABSENT_KEY);
    expect(alphaStore.getState().currentProjectId).not.toBe(ABSENT_KEY);
  });

  test("a seat's project this computer lacks carries Open here on its row, opening it here into the folder the shell's picker takes", async () => {
    alphaStore.setState({ projects: [GPU, project(ABSENT_KEY, "alpha")] });
    render(<App />);
    fireEvent.keyDown(window, { key: "p", metaKey: true });
    await settle();
    // [run-view-171] [run-view-168] an open project's row carries its
    // Space row's Open control too: on the seat's, "Open here" while this
    // computer lacks it.
    expect(screen.queryByTestId(`palette-project-places-p2@${ALPHA.place}`)).toBeNull();
    fireEvent.click(screen.getByTestId(`palette-project-places-${ABSENT_KEY}@${ALPHA.place}`));
    const menu = screen.getByTestId(`palette-project-places-${ABSENT_KEY}@${ALPHA.place}-menu`);
    expect(entriesOf(menu)).toEqual(["Open here"]);
    fireEvent.click(within(menu).getByTestId(`palette-open-here-${ABSENT_KEY}@${ALPHA.place}`));
    await settle();
    // [run-view-171] [run-view-168] the shell's picker takes the folder,
    // and the join goes to this computer's core alone.
    expect(pickDirectory).toHaveBeenCalledTimes(1);
    expect(callsOf(local, "space.join")).toEqual([{ instance: SPEX, hostId: "101", folder: "/work/alpha" }]);
    expect(callsOf(alpha, "space.join")).toEqual([]);
    expect(callsOf(beta, "space.join")).toEqual([]);
    expect(screen.queryByTestId("project-palette")).toBeNull();
    expect(useAppStore.getState().currentProjectId).toBe(ABSENT_KEY);
  });

  test("a picker closed with no folder sends nothing; a refusal reads the core's words in the palette", async () => {
    pickDirectory.mockResolvedValueOnce(null);
    local.answers["space.join"] = () => {
      throw new SpexCommandError("invalid_request", "/work/alpha is a project already");
    };
    render(<App />);
    fireEvent.keyDown(window, { key: "p", metaKey: true });
    await settle();
    fireEvent.click(screen.getByTestId(`palette-join-${ABSENT_KEY}`));
    await settle();
    expect(pickDirectory).toHaveBeenCalledTimes(1);
    expect(callsOf(local, "space.join")).toEqual([]);
    expect(screen.getByTestId("project-palette")).toBeTruthy();
    fireEvent.click(screen.getByTestId(`palette-join-${ABSENT_KEY}`));
    await settle();
    expect(callsOf(local, "space.join")).toEqual([{ instance: SPEX, hostId: "101", folder: "/work/alpha" }]);
    expect(screen.getByTestId("palette-error").textContent).toBe("/work/alpha is a project already");
  });

  test("with no picker, the folder is named in place beneath the row, a refusal kept beside it", async () => {
    delete (window as unknown as { spexNative?: unknown }).spexNative;
    local.answers["space.join"] = (fields?: Record<string, unknown>) => {
      if (fields?.folder === "/taken") throw new SpexCommandError("invalid_request", "/taken is a project already");
      return { accepted: true };
    };
    render(<App />);
    fireEvent.keyDown(window, { key: "p", metaKey: true });
    await settle();
    const row = screen.getByTestId(`palette-join-${ABSENT_KEY}`);
    expect(row.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(row);
    // [run-view-168] the act asks for the folder in place (space-63).
    const field = screen.getByTestId(`palette-join-folder-${ABSENT_KEY}-path`);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(field);
    expect(screen.getByLabelText("Project folder")).toBe(field);
    // Escape leaves the field alone, the palette standing.
    fireEvent.keyDown(field, { key: "Escape" });
    expect(screen.queryByTestId(`palette-join-folder-${ABSENT_KEY}`)).toBeNull();
    expect(screen.getByTestId("project-palette")).toBeTruthy();
    expect(document.activeElement).toBe(row);
    fireEvent.click(row);
    const again = screen.getByTestId(`palette-join-folder-${ABSENT_KEY}-path`);
    fireEvent.keyDown(again, { key: "Enter" });
    expect(screen.getByTestId(`palette-join-folder-${ABSENT_KEY}-error`).textContent).toBe("Name a folder");
    expect(callsOf(local, "space.join")).toEqual([]);
    fireEvent.change(again, { target: { value: "/taken" } });
    fireEvent.keyDown(again, { key: "Enter" });
    await settle();
    expect(screen.getByTestId(`palette-join-folder-${ABSENT_KEY}-error`).textContent).toBe("/taken is a project already");
    expect(screen.getByTestId("project-palette")).toBeTruthy();
    fireEvent.change(again, { target: { value: "~/work/alpha" } });
    fireEvent.click(screen.getByTestId(`palette-join-folder-${ABSENT_KEY}-open`));
    await settle();
    // [run-view-171] [run-view-168] the join carries the folder named, to
    // this computer's core alone.
    expect(callsOf(local, "space.join")).toEqual([
      { instance: SPEX, hostId: "101", folder: "/taken" },
      { instance: SPEX, hostId: "101", folder: "~/work/alpha" },
    ]);
    expect(callsOf(alpha, "space.join")).toEqual([]);
    expect(screen.queryByTestId("project-palette")).toBeNull();
  });

  test("this computer's welcome page opens the palette at its groups' projects while signed in", async () => {
    useAppStore.setState({ projects: [], currentProjectId: undefined });
    render(<App />);
    await settle();
    const welcome = screen.getByTestId("welcome-home");
    // [run-view-172] beside the local-project and Academy actions.
    const open = within(welcome).getByTestId("home-open-from-groups");
    expect(open.textContent).toBe("Open a project from your groups");
    expect(within(welcome).getAllByRole("button").map((button) => button.getAttribute("data-testid"))).toEqual([
      "home-add-project",
      "home-academy",
      "home-open-from-groups",
    ]);
    expect(within(welcome).queryByTestId("home-sign-in")).toBeNull();
    vi.mocked(Element.prototype.scrollIntoView).mockClear();
    fireEvent.click(open);
    await settle();
    // [run-view-172] [run-view-168] the palette opens at this computer's
    // "From your groups": in view, its first project highlighted and
    // focused, so Enter opens it.
    const palette = screen.getByTestId("project-palette");
    expect(within(palette).queryByTestId("palette-own-project")).toBeNull();
    const row = within(palette).getByTestId(`palette-join-${ABSENT_KEY}`);
    expect(document.activeElement).toBe(row);
    expect(row.className).toContain("bg-neutral-100");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    fireEvent.click(row);
    await settle();
    expect(callsOf(local, "space.join")).toEqual([{ instance: SPEX, hostId: "101", folder: "/work/alpha" }]);
  });

  test("this computer's welcome page leads to the Space surface's sign-in while signed in nowhere", async () => {
    local.answers["space.get"] = groupsState();
    useAppStore.setState({ projects: [], currentProjectId: undefined });
    render(<App />);
    await settle();
    const welcome = screen.getByTestId("welcome-home");
    // [run-view-172] signed in nowhere, "Sign in to your Space" in place
    // of the groups' projects.
    const signIn = within(welcome).getByTestId("home-sign-in");
    expect(signIn.textContent).toBe("Sign in to your Space");
    expect(within(welcome).queryByTestId("home-open-from-groups")).toBeNull();
    fireEvent.click(signIn);
    await settle();
    // [run-view-172] the Space surface at this computer, its sign-in card
    // standing (space-3).
    expect(document.querySelector('[data-surface="Space"]')!.getAttribute("aria-current")).toBe("page");
    expect(shownPlace()).toBe("This computer");
    const card = screen.getByTestId("space-signin-card");
    expect(within(card).getByRole("heading", { level: 2 }).textContent).toBe("Sign in to a Space");
  });
});

describe("run-view-169: a seat's code clone that failed for want of a credential", () => {
  test("the row offers Try again and Add a credential, and they act", async () => {
    render(<App />);
    goTo("Space");
    pick("build-box");
    await settle();

    // [run-view-171] [run-view-169] the row offers "Try again" in place
    // of "Choose folder…", and Add a credential (space-63, space-103).
    const again = screen.getByTestId(`space-row-open-${FAILED_KEY}`);
    expect(again.textContent).toBe("Try again");
    expect(again.getAttribute("data-entry")).toBe(`space-row-join-again-${FAILED_KEY}`);
    const add = screen.getByTestId(`space-row-credential-${FAILED_KEY}`);
    expect(add.textContent).toBe("Add a credential");
    // [run-view-171] [run-view-169] "Try again" sends the join again,
    // with no folder, to the seat alone.
    fireEvent.click(again);
    await settle();
    expect(callsOf(alpha, "space.join")).toEqual([{ instance: SPEX, hostId: "102" }]);
    expect(callsOf(local, "space.join")).toEqual([]);
    expect(pickDirectory).not.toHaveBeenCalled();

    // [run-view-171] [run-view-169] Add a credential opens the seat's
    // Settings at its Credentials section, at the host the failure
    // names (settings-48).
    fireEvent.click(add);
    await settle();
    expect(shownPlace()).toBe("build-box");
    const section = screen.getByTestId("credentials-section");
    // [settings-51] the section opened at the host a failed clone named.
    expect((within(section).getByTestId("credential-host-name") as HTMLInputElement).value).toBe("git.example.com");
    expect(document.activeElement).toBe(within(section).getByTestId("credential-host-token"));
    expect(within(section).getByTestId("credentials-needed-git.example.com").textContent).toBe(
      "git.example.com needs a credential of yours to clone a project's code",
    );
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    // The ask is taken once: Settings opened again opens nowhere in
    // particular.
    goTo("Space");
    await settle();
    goTo("Settings");
    await settle();
    expect((screen.getByTestId("credential-host-name") as HTMLInputElement).value).toBe("");
  });

  test("this computer's row offers neither control", async () => {
    local.answers["space.get"] = placeGroups("git.example.com");
    render(<App />);
    goTo("Space");
    await settle();
    // This computer pairs a folder instead (space-63): "Choose folder…",
    // no "Try again" and no "Add a credential".
    const open = screen.getByTestId(`space-row-open-${FAILED_KEY}`);
    expect(open.textContent).toBe("Choose folder…");
    expect(open.getAttribute("data-entry")).toBe(`space-row-folder-${FAILED_KEY}`);
    expect(screen.queryByText("Try again")).toBeNull();
    expect(screen.queryByTestId(`space-row-credential-${FAILED_KEY}`)).toBeNull();
  });
});

describe("settings-51: the Credentials section of a seat's Settings", () => {
  test("credential.set and credential.remove are sent to the seat, and what is set is listed with no secret", async () => {
    let held: CredentialList = {
      hosts: [{ name: "git.example.com" }],
      agents: [{ name: "claude", names: ["ANTHROPIC_API_KEY"] }],
    };
    alpha.answers["credential.list"] = () => held;
    alpha.answers["credential.set"] = (fields?: Record<string, unknown>) => {
      const { kind, name, values } = fields as { kind: string; name: string; values: Record<string, string> };
      held =
        kind === "host"
          ? { ...held, hosts: [...held.hosts, { name }] }
          : { ...held, agents: [...held.agents, { name: name as "kimi", names: Object.keys(values) }] };
      return held;
    };
    alpha.answers["credential.remove"] = (fields?: Record<string, unknown>) => {
      const { kind, name } = fields as { kind: string; name: string };
      held =
        kind === "host"
          ? { ...held, hosts: held.hosts.filter((entry) => entry.name !== name) }
          : { ...held, agents: held.agents.filter((entry) => entry.name !== name) };
      return held;
    };
    render(<App />);
    goTo("Settings");
    await settle();
    // This computer's Settings hold no Credentials section, and its core
    // is never asked.
    expect(screen.queryByTestId("credentials-section")).toBeNull();

    pick("build-box");
    await settle();
    const section = screen.getByTestId("credentials-section");
    // [settings-51] its fixed sentence.
    expect(within(section).getByTestId("credentials-note").textContent).toBe(
      "A credential you place here stays on this server until you remove it.",
    );
    // [settings-51] the listing names the hosts and agents set, read
    // with credential.list, no secret among them.
    expect(callsOf(alpha, "credential.list")).toEqual([{}]);
    expect(within(section).getByTestId("credential-host-git.example.com").textContent).toContain("git.example.com");
    expect(within(section).getByTestId("credential-agent-claude").textContent).toContain("ANTHROPIC_API_KEY");

    // [settings-51] the host form sends credential.set with the host and
    // the token.
    fireEvent.change(within(section).getByTestId("credential-host-name"), { target: { value: "code.example.org" } });
    const token = within(section).getByTestId("credential-host-token") as HTMLInputElement;
    expect(token.type).toBe("password");
    fireEvent.change(token, { target: { value: "tok-secret-1" } });
    fireEvent.click(within(section).getByTestId("credential-host-save"));
    await settle();
    expect(callsOf(alpha, "credential.set")).toEqual([
      { kind: "host", name: "code.example.org", values: { token: "tok-secret-1" } },
    ]);
    // [settings-51] listed after the write with no secret shown: the
    // token leaves its field and the page.
    expect(within(section).getByTestId("credential-host-code.example.org")).toBeTruthy();
    expect(token.value).toBe("");
    expect(document.body.textContent).not.toContain("tok-secret-1");

    // [settings-51] an agent's forms send credential.set with the
    // agent's names (settings-49).
    fireEvent.change(within(section).getByTestId("credential-agent"), { target: { value: "kimi" } });
    const key = within(section).getByTestId("credential-agent-value-KIMI_MODEL_API_KEY") as HTMLInputElement;
    const model = within(section).getByTestId("credential-agent-value-KIMI_MODEL_NAME") as HTMLInputElement;
    expect(key.type).toBe("password");
    expect(model.type).toBe("text");
    expect(within(section).getByTestId("credential-agent-value-KIMI_MODEL_BASE_URL")).toBeTruthy();
    expect(within(section).getByTestId("credential-agent-value-KIMI_MODEL_PROVIDER_TYPE")).toBeTruthy();
    fireEvent.change(key, { target: { value: "kimi-secret" } });
    fireEvent.change(model, { target: { value: "kimi-k2" } });
    fireEvent.click(within(section).getByTestId("credential-agent-save"));
    await settle();
    expect(callsOf(alpha, "credential.set")).toContainEqual({
      kind: "agent",
      name: "kimi",
      values: { KIMI_MODEL_API_KEY: "kimi-secret", KIMI_MODEL_NAME: "kimi-k2" },
    });
    expect(within(section).getByTestId("credential-agent-kimi").textContent).toContain("KIMI_MODEL_API_KEY");
    expect(key.value).toBe("");
    expect(document.body.textContent).not.toContain("kimi-secret");

    // [settings-51] a remove sends credential.remove.
    fireEvent.click(within(section).getByTestId("credential-host-remove-git.example.com"));
    await settle();
    expect(callsOf(alpha, "credential.remove")).toEqual([{ kind: "host", name: "git.example.com" }]);
    expect(within(section).queryByTestId("credential-host-git.example.com")).toBeNull();
    fireEvent.click(within(section).getByTestId("credential-agent-remove-claude"));
    await settle();
    expect(callsOf(alpha, "credential.remove")).toContainEqual({ kind: "agent", name: "claude" });
    expect(within(section).queryByTestId("credential-agent-claude")).toBeNull();

    // Each act is the seat's own: no other core hears of it.
    expect(credentialCommands(local)).toEqual([]);
    expect(credentialCommands(beta)).toEqual([]);
  });
});

describe("settings-51: a seat's Credentials section refuses in place", () => {
  test("a blank name or value is refused in place, and a refusal reads the core's words in the section", async () => {
    render(<App />);
    goTo("Settings");
    pick("build-box");
    await settle();
    const section = screen.getByTestId("credentials-section");
    const hostName = within(section).getByTestId("credential-host-name");
    const hostToken = within(section).getByTestId("credential-host-token");
    const hostSave = within(section).getByTestId("credential-host-save") as HTMLButtonElement;
    const agentSave = within(section).getByTestId("credential-agent-save") as HTMLButtonElement;

    // [settings-51] [settings-48] a blank host name or token is refused
    // in place: the form will not save, and submitting it writes nothing.
    fireEvent.change(hostName, { target: { value: "   " } });
    fireEvent.change(hostToken, { target: { value: "tok" } });
    expect(hostSave.disabled).toBe(true);
    fireEvent.submit(within(section).getByTestId("credential-host-form"));
    fireEvent.change(hostName, { target: { value: "git.example.com" } });
    fireEvent.change(hostToken, { target: { value: "  " } });
    expect(hostSave.disabled).toBe(true);
    fireEvent.submit(within(section).getByTestId("credential-host-form"));
    // [settings-51] [settings-48] so is an agent's form with no value.
    fireEvent.change(within(section).getByTestId("credential-agent"), { target: { value: "kimi" } });
    fireEvent.change(within(section).getByTestId("credential-agent-value-KIMI_MODEL_API_KEY"), { target: { value: " " } });
    expect(agentSave.disabled).toBe(true);
    fireEvent.submit(within(section).getByTestId("credential-agent-form"));
    await settle();
    expect(callsOf(alpha, "credential.set")).toEqual([]);
    expect(credentialCommands(local)).toEqual([]);

    // [settings-51] [settings-48] a name the core refuses reads its words
    // in the section.
    alpha.answers["credential.set"] = () => {
      throw new SpexCommandError("invalid_request", "git example is no host name");
    };
    fireEvent.change(hostName, { target: { value: "git example" } });
    fireEvent.change(hostToken, { target: { value: "t" } });
    fireEvent.click(hostSave);
    await settle();
    expect(within(section).getByTestId("credentials-error").textContent).toBe("git example is no host name");
  });

  test("the host a failed clone named is shown, and no longer once a credential is set for it", async () => {
    render(<App />);
    goTo("Settings");
    pick("build-box");
    await settle();
    const section = screen.getByTestId("credentials-section");
    // [settings-51] [settings-48] the host whose code clone failed is
    // named.
    expect(within(section).getByTestId("credentials-needed-git.example.com").textContent).toBe(
      "git.example.com needs a credential of yours to clone a project's code",
    );

    alpha.answers["credential.set"] = () => ({ hosts: [{ name: "git.example.com" }], agents: [] });
    fireEvent.change(within(section).getByTestId("credential-host-name"), { target: { value: "git.example.com" } });
    fireEvent.change(within(section).getByTestId("credential-host-token"), { target: { value: "t" } });
    fireEvent.click(within(section).getByTestId("credential-host-save"));
    await settle();
    await waitFor(() => expect(within(section).queryByTestId("credentials-needed-git.example.com")).toBeNull());
    expect(within(section).queryByTestId("credentials-error")).toBeNull();
  });
});
