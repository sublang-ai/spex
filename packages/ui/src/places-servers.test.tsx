// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// run-view-171: the place selector and the team servers (run-view-168,
// run-view-170, DR-133). The local store and two seat stores, each over
// a fake client of its own: the selector switches Settings, Playbooks —
// with its Environments — and Groups between this computer's store and
// a seat's, each surface reading and acting at the place it names; this
// computer's Space surface lists each server an instance lets the
// person open, one line under its group's heading, with Connect, or
// "Connected" and Disconnect in its overflow, by whether a seat is open
// there; "Open on <server>" on a row opens the seat where none is and
// sends that seat's core the join once it is signed in (space-111); the
// first Connect on this device shows the instance's contract and sends
// `server.open` with consent only on "I understand", a later Connect
// sending it at once; while the open runs the line says so, and past
// ten seconds that a seat's first start can take a minute; a seat whose
// sign-in runs reads the approval's link, the desktop asked to open it
// once per flow, and one whose sign-in failed reads its cause with
// "Sign in again", sending `server.signin`; Disconnect sends
// `server.close`; a refusal reads the core's cause in place; and the
// page waits for an open or a close as long as the admission may take.
// A new playbook asked for from a seat's Captain home opens Playbooks at
// that seat.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type {
  ConfigState,
  GroupsState,
  InstanceGroupState,
  ProjectInfo,
  RepositoryState,
  SeatState,
  ServerListing,
} from "@sublang/spex-core/protocol";

import { App } from "./App.js";
import { NO_CAN, groupsState, instanceState, namespace, repositoryRow } from "./fixtures/groups-state.js";
import { CONFIG_STATE, available, environment, specPackage } from "./fixtures/playbooks.js";
import { activateLanguage } from "./i18n.js";
import { SpexClient, SpexCommandError } from "./lib/client.js";
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

// jsdom has no layout, so the strip's keep-in-view call needs a stub.
Element.prototype.scrollIntoView = vi.fn();

const SPEX = "https://spex.pub";
const LAB = "https://lab.example";

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

/** A third server the instance lists, with no seat open at it. */
const LAB_BOX = `${SPEX}#43`;

/** This computer's servers listing: the two open seats' servers and
 * one more, and another instance whose read failed. */
function listing(open: { "43"?: boolean } = {}): ServerListing {
  return {
    servers: [
      { instance: SPEX, id: "41", name: "build-box", group: "acme/infra", open: true },
      { instance: SPEX, id: "42", name: "gpu-box", group: "acme/infra", open: true },
      { instance: SPEX, id: "43", name: "lab-box", group: "acme/lab", open: open["43"] ?? false },
    ],
    failures: [{ instance: LAB, message: "Lab refused the request" }],
  };
}

/** A project the instance lists in `acme/lab` that no place holds yet
 * (space-61): its row offers Open, here and on each server. */
const NOTES_KEY = "@spex.pub/acme/lab/notes-spex";
const NOTES = repositoryRow(NOTES_KEY, {
  instance: SPEX,
  governing: SPEX,
  id: "301",
  state: "absent",
  code: "https://git.example.com/acme/notes.git",
  branch: null,
});

/** A group of the instance, as its read lists it. */
function group(id: string, fullPath: string, repositories: RepositoryState[] = []): InstanceGroupState {
  return { id, login: null, mine: false, fullPath, name: fullPath.split("/").pop()!, can: NO_CAN, placed: [], repositories };
}

/** This computer's Groups: two signed-in instances, the first listing
 * the servers' groups, `acme/lab` holding a project no place holds. */
const LOCAL_GROUPS: GroupsState = groupsState({
  instances: [
    instanceState(SPEX, {
      displayName: "spex.pub",
      groups: [group("61", "acme/infra"), group("62", "acme/lab", [NOTES]), namespace("me")],
    }),
    instanceState(LAB, { displayName: "Lab" }),
  ],
});

/** A seat's own Groups: the instance its member signed in to there. */
const SEAT_GROUPS: GroupsState = groupsState({
  instances: [instanceState("https://seat.example", { displayName: "Seat Instance" })],
});

/** A seat's own config: a roster of its own. */
const SEAT_CONFIG: ConfigState = {
  status: "valid",
  seeded: false,
  summary: {
    ...(CONFIG_STATE as Extract<ConfigState, { status: "valid" }>).summary,
    path: "/home/member/.spex/config/playbook.config.yaml",
    players: [
      {
        id: "gpu.trainer",
        agent: { adapter: "claude", model: "claude-opus-5" },
        display: "claude-opus-5",
        boundBy: [],
      },
    ],
  },
} as ConfigState;

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
    case "environment.playbooks":
      return { project: [], own: [] };
    case "environment.get":
      return environment({ repository: String(fields?.repository) });
    case "server.list":
      return { servers: [], failures: [] };
    case "credential.list":
      return { hosts: [], agents: [] };
    case "draft.defaults":
      return { org: "me", license: "Apache-2.0" };
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
    repository: { key: id, name: `${name}-spex`, group: "me", own: true },
  } as unknown as ProjectInfo;
}

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
  store.setState({ connection: "open", everConnected: true, ledger: { intents: [], attention: [], badge: 0 } });
  store.setState(state);
  return store;
}

/** This page's storage, kept in memory for each test: the host's own
 * may answer no call. */
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
  activateLanguage("en");
  // The servers' flows are the page's own, one per server: each test
  // starts with none (state/server-opens).
  useServerOpens.setState({ lines: {}, pending: {}, landed: 0 });
  local = fakeClient();
  alpha = fakeClient();
  beta = fakeClient();
  local.answers["space.get"] = LOCAL_GROUPS;
  local.answers["server.list"] = listing();
  local.answers["environment.get"] = (fields?: Record<string, unknown>) =>
    environment({ repository: String(fields?.repository), packages: [specPackage({ name: "acme/home-tools" })] });
  alpha.answers["space.get"] = SEAT_GROUPS;
  alpha.answers["environment.playbooks"] = { project: [available({ id: "train", repository: "p2" })], own: [] };
  alpha.answers["environment.get"] = (fields?: Record<string, unknown>) =>
    environment({ repository: String(fields?.repository), packages: [specPackage({ name: "acme/gpu-tools" })] });
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
  alphaStore = seatStore(ALPHA, alpha, { projects: [GPU], currentProjectId: "p2", configState: SEAT_CONFIG });
  betaStore = seatStore(BETA, beta, { projects: [], configState: CONFIG_STATE });
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
  if (realStorage) Object.defineProperty(window, "localStorage", realStorage);
  activateLanguage("en");
});

/** Let replies and the work they set off land. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let tick = 0; tick < 20; tick += 1) await Promise.resolve();
  });
}

const commandsOf = (fake: Fake): string[] => fake.command.mock.calls.map(([type]) => type);
const callsOf = (fake: Fake, type: string): unknown[] =>
  fake.command.mock.calls.filter(([name]) => name === type).map(([, fields]) => fields);

function goTo(surface: "Settings" | "Playbooks" | "Space"): void {
  fireEvent.click(document.querySelector<HTMLElement>(`[data-surface="${surface}"]`)!);
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

describe("run-view-171: the selector switches Settings, Playbooks, Groups and Environments", () => {
  test("each surface reads and acts at the place the selector names", async () => {
    render(<App />);

    // Settings: this computer's roster, then the seat's own.
    goTo("Settings");
    const selector = screen.getByTestId("place-selector") as HTMLSelectElement;
    // [run-view-168] the selector reads "This computer" or a server's
    // name, every place offered.
    expect([...selector.options].map((option) => option.textContent)).toEqual([
      "This computer",
      "build-box",
      "gpu-box",
    ]);
    expect(shownPlace()).toBe("This computer");
    expect(screen.getByTestId("player-row-dev.coder")).toBeTruthy();
    expect(screen.queryByTestId("player-row-gpu.trainer")).toBeNull();
    pick("build-box");
    // [run-view-171] the selector switches Settings to the seat's own.
    expect(shownPlace()).toBe("build-box");
    expect(screen.getByTestId("player-row-gpu.trainer")).toBeTruthy();
    expect(screen.queryByTestId("player-row-dev.coder")).toBeNull();
    // [run-view-168] an edit there is the seat's own: its core alone is
    // asked.
    const [sink] = within(screen.getByTestId("notifications-section")).getAllByRole(
      "combobox",
    ) as HTMLSelectElement[];
    fireEvent.change(sink!, { target: { value: "bell" } });
    await settle();
    expect(commandsOf(alpha)).toContain("config.edit");
    expect(commandsOf(local)).not.toContain("config.edit");

    // Playbooks and its Environments: the place stays picked across the
    // four surfaces, each read from the seat's core alone.
    goTo("Playbooks");
    await settle();
    // [run-view-171] Playbooks reads the seat's lists for its project.
    expect(shownPlace()).toBe("build-box");
    expect(callsOf(alpha, "environment.playbooks")).toContainEqual({ projectId: "p2" });
    expect(callsOf(local, "environment.playbooks")).toEqual([]);
    // [run-view-171] Environments reads the seat's environment.
    expect(callsOf(alpha, "environment.get")).toContainEqual({ repository: "p2" });
    await waitFor(() => expect(screen.getByText("acme/gpu-tools")).toBeTruthy());
    expect(screen.queryByText("acme/home-tools")).toBeNull();
    pick("This computer");
    await settle();
    // [run-view-171] back at this computer, its own environment.
    expect(callsOf(local, "environment.get")).toContainEqual({ repository: "p1" });
    await waitFor(() => expect(screen.getByText("acme/home-tools")).toBeTruthy());
    expect(screen.queryByText("acme/gpu-tools")).toBeNull();

    // Groups: this computer's instances, then the seat's own.
    goTo("Space");
    await settle();
    expect(screen.getByRole("group", { name: "spex.pub" })).toBeTruthy();
    pick("build-box");
    await settle();
    // [run-view-171] the selector switches Groups to the seat's own,
    // read from its core.
    expect(commandsOf(alpha)).toContain("space.get");
    expect(screen.getByRole("group", { name: "Seat Instance" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "spex.pub" })).toBeNull();
    // [run-view-170] a seat lists no servers: the local core holds the
    // seats, and the seat is never asked.
    expect(commandsOf(alpha)).not.toContain("server.list");
    expect(document.querySelector('[data-testid^="space-servers-"]')).toBeNull();
    expect(document.querySelector('[data-testid^="space-server-"]')).toBeNull();
    // A seat's state touches no other place.
    expect(commandsOf(beta)).toEqual([]);
  });

  test("a seat that closes returns the selector to this computer, and with none open there is no selector", async () => {
    render(<App />);
    goTo("Settings");
    pick("gpu-box");
    expect(shownPlace()).toBe("gpu-box");
    // [run-view-168] the seat closed, its place goes and this
    // computer's stands.
    act(() => usePlaces.setState({ seats: [{ seat: ALPHA, store: alphaStore }] }));
    expect(shownPlace()).toBe("This computer");
    expect(screen.getByTestId("player-row-dev.coder")).toBeTruthy();
    // [run-view-168] with no seat open there is one place, none to pick.
    act(() => usePlaces.setState({ seats: [] }));
    expect(screen.queryByTestId("place-selector")).toBeNull();
    expect(screen.getByTestId("player-row-dev.coder")).toBeTruthy();
  });
});

/** Open this computer's Groups surface and wait for its servers. */
async function openGroups(): Promise<HTMLElement> {
  render(<App />);
  goTo("Space");
  await screen.findByTestId(`space-server-${ALPHA.place}`);
  return screen.getByRole("group", { name: "spex.pub" });
}

const row = (place: string): HTMLElement => screen.getByTestId(`space-server-${place}`);
/** A server's Connect, where no seat is open at it (run-view-170). */
const control = (place: string): HTMLButtonElement =>
  screen.getByTestId(`space-server-control-${place}`) as HTMLButtonElement;
/** A server's overflow, where a seat is open at it (run-view-170). */
const more = (place: string): HTMLButtonElement => screen.getByTestId(`space-server-more-${place}`) as HTMLButtonElement;
/** Whether the line reads its seat open: "Connected" with Disconnect in
 * its overflow, and no Connect. */
const connectedLine = (place: string): boolean =>
  screen.queryByTestId(`space-server-more-${place}`) !== null && screen.queryByTestId(`space-server-control-${place}`) === null;
/** Disconnect, from the line's overflow (run-view-170). */
function disconnect(place: string): void {
  fireEvent.click(more(place));
  fireEvent.click(screen.getByTestId(`space-server-disconnect-${place}`));
}

const CONTRACT =
  "Opening a seat places your sign-in on lab-box. Whoever runs lab-box can act as you: in your spaces, in your records, and with the account you sign in to spex.pub with, wherever it reaches. Agents on lab-box run on the sign-ins its administrator set up, unless you set your own. A credential you place on lab-box stays there until you remove it. Retiring the server or revoking the seat under Devices stops new use; a credential already on the server lasts until it expires.";

describe("run-view-168: a new playbook asked for at a seat", () => {
  test("the Captain home's New playbook opens Playbooks at the seat shown, its field focused", async () => {
    const summary = (SEAT_CONFIG as Extract<ConfigState, { status: "valid" }>).summary;
    alphaStore.setState({
      configState: {
        ...SEAT_CONFIG,
        summary: {
          ...summary,
          playbooks: [{ id: "train", from: "acme/gpu-tools", command: "train", intent: "train a model", roles: {} }],
        },
      } as ConfigState,
    });
    render(<App />);
    // The seat's project shown: its Captain home.
    fireEvent.click(screen.getByTestId(`sidebar-project-p2@${ALPHA.place}`));
    await settle();
    fireEvent.change(screen.getByTestId("start-composer"), { target: { value: "/" } });
    fireEvent.mouseDown(screen.getByTestId("slash-new-playbook"));
    await settle();
    // [run-view-168] asked at the place shown, Playbooks opens there with
    // the new playbook's field focused (playbook-library-51).
    expect(shownPlace()).toBe("build-box");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("new-playbook-id")));
    expect(alphaStore.getState().newPlaybookRequested).toBe(false);
    expect(useAppStore.getState().newPlaybookRequested).toBe(false);
    expect(callsOf(alpha, "environment.playbooks")).toContainEqual({ projectId: "p2" });
  });
});

describe("run-view-170: the servers under each group's heading", () => {
  test("each server one line under its group by its name, Connect, or Connected and Disconnect in its overflow, by whether a seat is open there", async () => {
    const instance = await openGroups();
    // [run-view-170] the listing is the local core's, read as the
    // surface opens.
    expect(callsOf(local, "server.list")).toHaveLength(1);
    // [run-view-170] [space-1] one line per server under the heading of
    // its group, within the instance's section.
    const infra = within(instance).getByTestId("space-group-acme/infra");
    const lab = within(instance).getByTestId("space-group-acme/lab");
    expect(within(infra).getByRole("heading", { level: 3 }).textContent).toBe("infra");
    expect(
      within(within(infra).getByTestId("space-group-servers-acme/infra"))
        .getAllByRole("listitem")
        .map((item) => item.getAttribute("data-testid")),
    ).toEqual([`space-server-${ALPHA.place}`, `space-server-${BETA.place}`]);
    expect(
      within(within(lab).getByTestId("space-group-servers-acme/lab"))
        .getAllByRole("listitem")
        .map((item) => item.getAttribute("data-testid")),
    ).toEqual([`space-server-${LAB_BOX}`]);
    // [space-1] beneath the heading, before the group's rows.
    const labServers = within(lab).getByTestId("space-group-servers-acme/lab");
    const notes = within(lab).getByTestId(`space-row-${NOTES_KEY}`);
    expect(labServers.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // No flat list of servers stands at the instance's foot.
    expect(screen.queryByTestId(`space-servers-${SPEX}`)).toBeNull();
    // [run-view-170] by its name; "Connected" with Disconnect in its
    // overflow where a seat is open and signed in, Connect where none is.
    expect(row(ALPHA.place).textContent).toMatch(/^build-box · Connected/);
    expect(row(ALPHA.place).textContent).not.toContain("acme/infra");
    expect(screen.getByTestId(`space-server-connected-${ALPHA.place}`).textContent).toBe("Connected");
    expect(connectedLine(ALPHA.place)).toBe(true);
    expect(more(ALPHA.place).getAttribute("aria-label")).toBe("More for build-box");
    fireEvent.click(more(ALPHA.place));
    expect(within(screen.getByTestId(`space-server-more-${ALPHA.place}-menu`)).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Disconnect",
    ]);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId(`space-server-connected-${BETA.place}`).textContent).toBe("Connected");
    expect(connectedLine(BETA.place)).toBe(true);
    expect(row(LAB_BOX).textContent).toContain("lab-box");
    expect(control(LAB_BOX).textContent).toBe("Connect");
    expect(screen.queryByTestId(`space-server-more-${LAB_BOX}`)).toBeNull();
    expect(screen.queryByTestId(`space-server-connected-${LAB_BOX}`)).toBeNull();
    // [run-view-170] one instance's failure stands under its own
    // heading, hiding no other's servers.
    const other = screen.getByRole("group", { name: "Lab" });
    expect(within(other).getByRole("alert").textContent).toBe("Couldn't read the servers: Lab refused the request");
    expect(within(other).queryAllByRole("listitem")).toEqual([]);
    expect(within(instance).queryByRole("alert")).toBeNull();
  });

  test("a server whose group the instance's read does not list stands at the instance's foot with its group's path", async () => {
    local.answers["space.get"] = groupsState({
      instances: [instanceState(SPEX, { displayName: "spex.pub" }), instanceState(LAB, { displayName: "Lab" })],
    });
    render(<App />);
    goTo("Space");
    const servers = await screen.findByTestId(`space-servers-${SPEX}`);
    expect(screen.getByRole("group", { name: "spex.pub" }).contains(servers)).toBe(true);
    expect(within(servers).getAllByRole("listitem").map((item) => item.getAttribute("data-testid"))).toEqual([
      `space-server-${ALPHA.place}`,
      `space-server-${BETA.place}`,
      `space-server-${LAB_BOX}`,
    ]);
    expect(row(ALPHA.place).textContent).toContain("acme/infra");
    expect(row(LAB_BOX).textContent).toContain("acme/lab");
  });

  test("the first Connect shows the contract and sends server.open with consent only on I understand; a later Connect sends at once", async () => {
    await openGroups();

    fireEvent.click(control(LAB_BOX));
    // [run-view-171] the first Connect shows the instance's contract, in
    // the words its record fixes, and sends nothing.
    const contract = screen.getByTestId(`space-server-contract-${LAB_BOX}`);
    expect(within(contract).getByText(CONTRACT)).toBeTruthy();
    expect(callsOf(local, "server.open")).toEqual([]);
    // [run-view-171] Cancel sends nothing and remembers nothing.
    fireEvent.click(within(contract).getByRole("button", { name: "Cancel" }));
    await settle();
    expect(screen.queryByTestId(`space-server-contract-${LAB_BOX}`)).toBeNull();
    expect(callsOf(local, "server.open")).toEqual([]);
    expect([...kept.keys()].filter((key) => key.includes(LAB_BOX))).toEqual([]);
    fireEvent.click(control(LAB_BOX));
    const again = screen.getByTestId(`space-server-contract-${LAB_BOX}`);
    expect(within(again).getByText(CONTRACT)).toBeTruthy();
    expect(callsOf(local, "server.open")).toEqual([]);

    // [run-view-171] "I understand" sends server.open with consent, to
    // the local core alone.
    local.answers["server.open"] = { place: LAB_BOX, leaseExpiresAt: Date.now() + 3_600_000 };
    local.answers["server.list"] = listing({ "43": true });
    fireEvent.click(within(again).getByRole("button", { name: "I understand" }));
    await settle();
    expect(callsOf(local, "server.open")).toEqual([{ instance: SPEX, serverId: "43", consented: true }]);
    expect(commandsOf(alpha)).not.toContain("server.open");
    expect(commandsOf(beta)).not.toContain("server.open");
    expect(screen.queryByTestId(`space-server-contract-${LAB_BOX}`)).toBeNull();
    // [run-view-170] understood on this device, for this server alone,
    // under this computer's own key.
    expect([...kept.keys()].filter((key) => key.startsWith("spex.serverContract:"))).toEqual([
      `spex.serverContract:${LAB_BOX}`,
    ]);
    // [run-view-170] the listing is read again after the open, the
    // server now reading Connected with Disconnect in its overflow.
    expect(callsOf(local, "server.list")).toHaveLength(2);
    await waitFor(() => expect(connectedLine(LAB_BOX)).toBe(true));

    // [run-view-170] once its seat is closed, a later Connect on this
    // device sends server.open at once, with no contract.
    local.answers["server.close"] = { closed: true };
    local.answers["server.list"] = listing({ "43": false });
    disconnect(LAB_BOX);
    await settle();
    await waitFor(() => expect(control(LAB_BOX).textContent).toBe("Connect"));
    fireEvent.click(control(LAB_BOX));
    await settle();
    expect(screen.queryByTestId(`space-server-contract-${LAB_BOX}`)).toBeNull();
    expect(callsOf(local, "server.open")).toEqual([
      { instance: SPEX, serverId: "43", consented: true },
      { instance: SPEX, serverId: "43", consented: true },
    ]);
  });

  test("the contract is rendered in the page's language", async () => {
    activateLanguage("zh");
    await openGroups();
    fireEvent.click(control(LAB_BOX));
    const contract = screen.getByTestId(`space-server-contract-${LAB_BOX}`);
    // [run-view-170] the record's words, in the page's language.
    expect(contract.textContent).toContain("打开席位会把你的登录放到 lab-box 上。");
    expect(contract.textContent).toContain("凭你登录 spex.pub 所用的账号");
    fireEvent.click(within(contract).getByRole("button", { name: "我已了解" }));
    await settle();
    // [run-view-171] the consent is the same act in every language.
    expect(callsOf(local, "server.open")).toEqual([{ instance: SPEX, serverId: "43", consented: true }]);
  });

  test("Disconnect sends server.close for the server's seat and reads the listing again", async () => {
    await openGroups();
    local.answers["server.close"] = { closed: true };
    local.answers["server.list"] = {
      ...listing(),
      servers: listing().servers.map((server) => (server.id === "41" ? { ...server, open: false } : server)),
    };
    disconnect(ALPHA.place);
    await settle();
    // [run-view-170] Disconnect sends server.close, with no contract, to the
    // local core alone.
    expect(callsOf(local, "server.close")).toEqual([{ instance: SPEX, serverId: "41" }]);
    expect(commandsOf(alpha)).not.toContain("server.close");
    expect(screen.queryByTestId(`space-server-contract-${ALPHA.place}`)).toBeNull();
    expect(callsOf(local, "server.list")).toHaveLength(2);
    await waitFor(() => expect(control(ALPHA.place).textContent).toBe("Connect"));
  });

  test("a refusal reads the core's relayed cause beside its server", async () => {
    await openGroups();
    local.answers["server.open"] = () => {
      throw new SpexCommandError("not_found", "No longer shared with you");
    };
    fireEvent.click(control(LAB_BOX));
    fireEvent.click(screen.getByRole("button", { name: "I understand" }));
    await settle();
    expect(callsOf(local, "server.open")).toEqual([{ instance: SPEX, serverId: "43", consented: true }]);
    // [run-view-170] the refusal's cause, as the core relayed it, in
    // place by the server.
    const refusal = within(row(LAB_BOX)).getByRole("alert");
    expect(refusal.textContent).toBe("No longer shared with you");
    expect(within(row(ALPHA.place)).queryByRole("alert")).toBeNull();
    // A refused open leaves the server as it stood, the listing unread.
    expect(control(LAB_BOX).textContent).toBe("Connect");
    expect(callsOf(local, "server.list")).toHaveLength(1);
    // A refused close reads its cause in place as well.
    local.answers["server.close"] = () => {
      throw new SpexCommandError("not_found", "No seat is open on this server");
    };
    disconnect(ALPHA.place);
    await settle();
    expect(within(row(ALPHA.place)).getByRole("alert").textContent).toBe("No seat is open on this server");
  });
});

/** The approval page of a seat's running sign-in (core-service-142). */
const APPROVE = `${SPEX}/login/device?user_code=WDJB-MJHT`;
const running = (uri = APPROVE): SeatState["signIn"] => ({ state: "running", verificationUri: uri, expiresAt: Date.now() + 600_000 });

/** The local core's `server.state`, as its store lands it. */
function serverState(...seats: SeatState[]): void {
  act(() => useAppStore.setState({ seats }));
}

describe("run-view-170: a server's line while its seat opens and signs in", () => {
  test("while server.open runs the line reads Connecting to <server>…, and past ten seconds that the seat's first start can take a minute", async () => {
    await openGroups();
    // Understood on this device before: Connect sends at once.
    kept.set(`spex.serverContract:${LAB_BOX}`, "1");
    let answer: (value: unknown) => void = () => {};
    local.answers["server.open"] = () => new Promise((resolve) => (answer = resolve));
    local.answers["server.list"] = listing({ "43": true });
    vi.useFakeTimers();
    try {
      fireEvent.click(control(LAB_BOX));
      await act(async () => {
        await Promise.resolve();
      });
      // [run-view-170] the open runs: the line says so, Connect waits.
      const line = (): string => screen.getByTestId(`space-server-connecting-${LAB_BOX}`).textContent ?? "";
      expect(line()).toBe("Connecting to lab-box…");
      expect(control(LAB_BOX).disabled).toBe(true);
      act(() => vi.advanceTimersByTime(9_999));
      expect(line()).toBe("Connecting to lab-box…");
      // [run-view-170] past ten seconds, a seat's first start can take a
      // minute.
      act(() => vi.advanceTimersByTime(1));
      expect(line()).toBe("Connecting to lab-box… the first start of your seat can take a minute");
      answer({ place: LAB_BOX, leaseExpiresAt: Date.now() + 3_600_000 });
      await act(async () => {
        for (let tick = 0; tick < 20; tick += 1) await Promise.resolve();
      });
    } finally {
      vi.useRealTimers();
    }
    // The open landed: the line no longer says it runs.
    await waitFor(() => expect(connectedLine(LAB_BOX)).toBe(true));
    expect(screen.queryByTestId(`space-server-connecting-${LAB_BOX}`)).toBeNull();
    expect(callsOf(local, "server.open")).toEqual([{ instance: SPEX, serverId: "43", consented: true }]);
  });

  test("a seat whose sign-in runs reads Approve Spex on <server> in your browser with the approval's link, one pending reads Signing in to <instance>…, until it completes", async () => {
    await openGroups();
    serverState({ ...ALPHA, signIn: running() }, BETA);
    // [run-view-170] the approval's link on the server's line, in place
    // of Connected, Disconnect offered in its overflow.
    const link = screen.getByTestId(`space-server-approve-${ALPHA.place}`) as HTMLAnchorElement;
    expect(link.textContent).toBe("Approve Spex on build-box in your browser");
    expect(link.getAttribute("href")).toBe(APPROVE);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.queryByTestId(`space-server-connected-${ALPHA.place}`)).toBeNull();
    expect(screen.queryByTestId(`space-server-control-${ALPHA.place}`)).toBeNull();
    fireEvent.click(more(ALPHA.place));
    expect(screen.getByTestId(`space-server-disconnect-${ALPHA.place}`).textContent).toBe("Disconnect");
    fireEvent.keyDown(window, { key: "Escape" });
    // The other seat, signed in, reads Connected.
    expect(screen.getByTestId(`space-server-connected-${BETA.place}`).textContent).toBe("Connected");
    // [run-view-170] pending — the instance not asking for its page —
    // reads Signing in to <instance>… with no link and no Connected;
    // signed in, Connected.
    serverState({ ...ALPHA, signIn: { state: "pending" } }, BETA);
    expect(screen.getByTestId(`space-server-signing-${ALPHA.place}`).textContent).toBe("Signing in to spex.pub…");
    expect(screen.queryByTestId(`space-server-approve-${ALPHA.place}`)).toBeNull();
    expect(screen.queryByTestId(`space-server-connected-${ALPHA.place}`)).toBeNull();
    serverState({ ...ALPHA, signIn: { state: "signedIn" } }, BETA);
    expect(screen.queryByTestId(`space-server-signing-${ALPHA.place}`)).toBeNull();
    expect(screen.queryByTestId(`space-server-approve-${ALPHA.place}`)).toBeNull();
    expect(screen.getByTestId(`space-server-connected-${ALPHA.place}`).textContent).toBe("Connected");
  });

  test("on the desktop the shell is asked to open each flow's page once; the served page leaves it as the link", async () => {
    const openExternal = vi.fn(async (_url: string) => true);
    (window as unknown as { spexNative?: unknown }).spexNative = { openExternal };
    try {
      await openGroups();
      serverState({ ...ALPHA, signIn: { state: "pending" } }, BETA);
      // [run-view-170] the flow starts: the shell opens its page once.
      serverState({ ...ALPHA, signIn: running() }, BETA);
      expect(openExternal.mock.calls).toEqual([[APPROVE]]);
      serverState({ ...ALPHA, signIn: running() }, BETA);
      serverState({ ...ALPHA, relay: "closed", signIn: running() }, BETA);
      expect(openExternal).toHaveBeenCalledTimes(1);
      // The link opens it again through the shell.
      fireEvent.click(screen.getByTestId(`space-server-approve-${ALPHA.place}`));
      expect(openExternal.mock.calls).toEqual([[APPROVE], [APPROVE]]);
      // A second flow, after a failure: its own page, once.
      const again = `${SPEX}/login/device?user_code=KQXF-ZPLN`;
      serverState({ ...ALPHA, signIn: { state: "failed", cause: "The sign-in expired before it was approved" } }, BETA);
      serverState({ ...ALPHA, signIn: running(again) }, BETA);
      expect(openExternal.mock.calls).toEqual([[APPROVE], [APPROVE], [again]]);
    } finally {
      delete (window as unknown as { spexNative?: unknown }).spexNative;
    }
    // The served page, with no bridge, opens nothing: the link stands.
    cleanup();
    const third = `${SPEX}/login/device?user_code=MNBV-CXZL`;
    await openGroups();
    serverState({ ...BETA, signIn: { state: "pending" } }, ALPHA);
    serverState({ ...BETA, signIn: running(third) }, ALPHA);
    expect(openExternal.mock.calls.map(([uri]) => uri)).not.toContain(third);
    expect(screen.getByTestId(`space-server-approve-${BETA.place}`).getAttribute("href")).toBe(third);
  });

  test("a seat whose sign-in failed reads its cause with Sign in again, which sends server.signin to the local core alone", async () => {
    await openGroups();
    serverState({ ...ALPHA, signIn: { state: "failed", cause: "The sign-in was denied at spex.pub" } }, BETA);
    // [run-view-170] the seat's cause, as one sentence, beside Sign in again.
    expect(screen.getByTestId(`space-server-signin-error-${ALPHA.place}`).textContent).toBe("The sign-in was denied at spex.pub.");
    expect(screen.queryByTestId(`space-server-connected-${ALPHA.place}`)).toBeNull();
    const again = screen.getByTestId(`space-server-signin-${ALPHA.place}`);
    expect(again.textContent).toBe("Sign in again");
    local.answers["server.signin"] = { started: true };
    fireEvent.click(again);
    await settle();
    // [run-view-171] the seat's sign-in started afresh, at the local core.
    expect(callsOf(local, "server.signin")).toEqual([{ instance: SPEX, serverId: "41" }]);
    expect(commandsOf(alpha)).not.toContain("server.signin");
    // Its outcome follows as state: the flow runs, its link shown.
    serverState({ ...ALPHA, signIn: running() }, BETA);
    expect(screen.queryByTestId(`space-server-signin-${ALPHA.place}`)).toBeNull();
    expect(screen.getByTestId(`space-server-approve-${ALPHA.place}`)).toBeTruthy();
  });
});

/** The joins a fake core was sent (space-29). */
const joinsOf = (fake: Fake): unknown[] => callsOf(fake, "space.join");

/** The notes row's phrase on this computer's Space (space-87). */
const notesPhrase = (): string => screen.getByTestId(`space-repo-state-${NOTES_KEY}`).textContent ?? "";

/** Open the notes row's Open menu and read its entries (space-111). */
function openMenu(): HTMLElement {
  fireEvent.click(screen.getByTestId(`space-row-open-${NOTES_KEY}`));
  return screen.getByTestId(`space-row-open-${NOTES_KEY}-menu`);
}

describe("run-view-171: Open on <server> on a row of this computer's Space", () => {
  test("a seat open and signed in: no seat is opened, that seat's core is sent the join with no folder, and the row reads Opening on <server>… until the seat lists the project", async () => {
    await openGroups();
    // [space-111] the row's Open offers this computer first, then each
    // server of the instance the member may open.
    const open = screen.getByTestId(`space-row-open-${NOTES_KEY}`);
    expect(open.getAttribute("aria-label")).toBe("Open notes");
    const menu = openMenu();
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Open here",
      "Open on build-box",
      "Open on gpu-box",
      "Open on lab-box",
    ]);
    fireEvent.click(within(menu).getByTestId(`space-row-open-at-${ALPHA.place}-${NOTES_KEY}`));
    await settle();
    // [run-view-171] [space-111] no seat opened — one is open there —
    // and that seat's core alone sent `space.join` with no folder.
    expect(callsOf(local, "server.open")).toEqual([]);
    expect(joinsOf(alpha)).toEqual([{ instance: SPEX, hostId: "301" }]);
    expect(joinsOf(local)).toEqual([]);
    expect(joinsOf(beta)).toEqual([]);
    // [space-111] the row reads "Opening on <server>…" meanwhile, its
    // entry not offered twice.
    expect(notesPhrase()).toBe("Opening on build-box…");
    expect((within(openMenu()).getByTestId(`space-row-open-at-${ALPHA.place}-${NOTES_KEY}`) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId(`space-row-on-${ALPHA.place}-${NOTES_KEY}`)).toBeNull();

    // [space-1] [space-111] the seat lists the project: the row reads
    // "On <server>", and its entry "Show on <server>".
    act(() => alphaStore.setState({ projects: [GPU, project(NOTES_KEY, "notes")] }));
    await settle();
    expect(notesPhrase()).toBe("");
    expect(screen.getByTestId(`space-row-on-${ALPHA.place}-${NOTES_KEY}`).textContent).toBe("On build-box");
    expect(screen.queryByTestId(`space-row-here-${NOTES_KEY}`)).toBeNull();
    const shown = within(openMenu()).getByTestId(`space-row-show-at-${ALPHA.place}-${NOTES_KEY}`);
    expect(shown.textContent).toBe("Show on build-box");
    // [space-111] "Show on <server>" shows the project at that place.
    fireEvent.click(shown);
    await settle();
    expect(alphaStore.getState().currentProjectId).toBe(NOTES_KEY);
    expect(joinsOf(alpha)).toHaveLength(1);
  });

  test("a seat still signing in is sent nothing until it reads signed in", async () => {
    useAppStore.setState({ seats: [{ ...ALPHA, signIn: running() }, BETA] });
    await openGroups();
    fireEvent.click(within(openMenu()).getByTestId(`space-row-open-at-${ALPHA.place}-${NOTES_KEY}`));
    await settle();
    // [run-view-171] [space-111] while the seat's sign-in runs, nothing
    // is sent, the row saying it opens there, the server's line linking
    // the approval (run-view-170).
    expect(joinsOf(alpha)).toEqual([]);
    expect(callsOf(local, "server.open")).toEqual([]);
    expect(notesPhrase()).toBe("Opening on build-box…");
    expect(screen.getByTestId(`space-server-approve-${ALPHA.place}`)).toBeTruthy();
    serverState({ ...ALPHA, signIn: { state: "pending" } }, BETA);
    await settle();
    expect(joinsOf(alpha)).toEqual([]);
    // Signed in, the join goes, once, to that seat alone.
    serverState({ ...ALPHA, signIn: { state: "signedIn" } }, BETA);
    await settle();
    expect(joinsOf(alpha)).toEqual([{ instance: SPEX, hostId: "301" }]);
    serverState({ ...ALPHA, signIn: { state: "signedIn" } }, BETA);
    await settle();
    expect(joinsOf(alpha)).toHaveLength(1);
    expect(joinsOf(beta)).toEqual([]);
    expect(joinsOf(local)).toEqual([]);
  });

  test("a seat whose sign-in fails leaves the open undone, its cause on the server's line", async () => {
    useAppStore.setState({ seats: [{ ...ALPHA, signIn: running() }, BETA] });
    await openGroups();
    fireEvent.click(within(openMenu()).getByTestId(`space-row-open-at-${ALPHA.place}-${NOTES_KEY}`));
    await settle();
    serverState({ ...ALPHA, signIn: { state: "failed", cause: "The sign-in was denied at spex.pub" } }, BETA);
    await settle();
    // [space-111] the open is undone, the cause read on the line.
    expect(screen.getByTestId(`space-server-signin-error-${ALPHA.place}`).textContent).toBe("The sign-in was denied at spex.pub.");
    expect(notesPhrase()).toBe("");
    serverState({ ...ALPHA, signIn: { state: "signedIn" } }, BETA);
    await settle();
    expect(joinsOf(alpha)).toEqual([]);
  });

  test("no seat open: the server's line shows the contract first, I understand sends server.open with consent, and the join goes to the seat once it is signed in", async () => {
    const labSeat: SeatState = { ...ALPHA, serverId: "43", name: "lab-box", group: "acme/lab", place: LAB_BOX };
    const lab = fakeClient();
    await openGroups();
    // [run-view-171] [run-view-170] the first open of a seat on this
    // device shows the contract on the server's line, and sends nothing;
    // declined, the open is undone.
    fireEvent.click(within(openMenu()).getByTestId(`space-row-open-at-${LAB_BOX}-${NOTES_KEY}`));
    await settle();
    const contract = screen.getByTestId(`space-server-contract-${LAB_BOX}`);
    expect(row(LAB_BOX).contains(contract)).toBe(true);
    expect(within(contract).getByText(CONTRACT)).toBeTruthy();
    expect(callsOf(local, "server.open")).toEqual([]);
    expect(notesPhrase()).toBe("Opening on lab-box…");
    fireEvent.click(within(contract).getByRole("button", { name: "Cancel" }));
    await settle();
    expect(screen.queryByTestId(`space-server-contract-${LAB_BOX}`)).toBeNull();
    expect(notesPhrase()).toBe("");
    expect(callsOf(local, "server.open")).toEqual([]);

    // Asked again, "I understand" sends `server.open` with consent to the
    // local core.
    local.answers["server.open"] = { place: LAB_BOX, leaseExpiresAt: Date.now() + 3_600_000 };
    local.answers["server.list"] = listing({ "43": true });
    fireEvent.click(within(openMenu()).getByTestId(`space-row-open-at-${LAB_BOX}-${NOTES_KEY}`));
    await settle();
    fireEvent.click(screen.getByTestId(`space-server-consent-${LAB_BOX}`));
    await settle();
    expect(callsOf(local, "server.open")).toEqual([{ instance: SPEX, serverId: "43", consented: true }]);
    expect(notesPhrase()).toBe("Opening on lab-box…");
    expect([...kept.keys()]).toContain(`spex.serverContract:${LAB_BOX}`);

    // The seat appears, its sign-in running: nothing goes yet.
    serverState(ALPHA, BETA, { ...labSeat, signIn: running() });
    const labStore = seatStore(labSeat, lab, { projects: [] });
    act(() =>
      usePlaces.setState({
        seats: [
          { seat: ALPHA, store: alphaStore },
          { seat: BETA, store: betaStore },
          { seat: labSeat, store: labStore },
        ],
      }),
    );
    await settle();
    expect(joinsOf(lab)).toEqual([]);
    // Signed in, the join goes to that seat alone, with no folder.
    serverState(ALPHA, BETA, labSeat);
    await settle();
    expect(joinsOf(lab)).toEqual([{ instance: SPEX, hostId: "301" }]);
    expect(joinsOf(local)).toEqual([]);
    expect(joinsOf(alpha)).toEqual([]);
    expect(joinsOf(beta)).toEqual([]);
    // The seat was opened once, by the act that needed it.
    expect(callsOf(local, "server.open")).toHaveLength(1);
  });

  test("a join the seat refuses reads on the row's caption", async () => {
    alpha.answers["space.join"] = () => {
      throw new SpexCommandError("invalid_request", "No longer shared with you");
    };
    await openGroups();
    fireEvent.click(within(openMenu()).getByTestId(`space-row-open-at-${ALPHA.place}-${NOTES_KEY}`));
    await settle();
    // [space-111] the join failed: its cause on the row, the open
    // offered again.
    expect(screen.getByTestId(`space-row-caption-${NOTES_KEY}`).textContent).toContain("No longer shared with you");
    expect(notesPhrase()).toBe("");
    expect((within(openMenu()).getByTestId(`space-row-open-at-${ALPHA.place}-${NOTES_KEY}`) as HTMLButtonElement).disabled).toBe(false);
  });
});

/** The local core's socket, answering nothing until the test says. */
class SilentSocket extends EventTarget {
  readyState = 1;
  readonly sent: { type: string; id: string }[] = [];

  send(data: string): void {
    this.sent.push(JSON.parse(data) as { type: string; id: string });
  }

  close(): void {
    this.readyState = 3;
    this.dispatchEvent(new Event("close"));
  }

  reply(id: string, result: unknown): void {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "reply", id, ok: true, result }) }));
  }
}

describe("run-view-170: the page waits for an open as long as the admission may take", () => {
  test("server.open and server.close outwait the core's ninety-second wait on the admission, where another command times out", async () => {
    vi.useFakeTimers();
    try {
      const socket = new SilentSocket();
      const client = new SpexClient({
        url: "ws://127.0.0.1:8137/?token=secret",
        onMessage: () => {},
        onStatus: () => {},
        reconnectMs: 0,
        webSocketFactory: () => socket as unknown as WebSocket,
      });
      client.connect();
      const watch = (promise: Promise<unknown>) => {
        const seen = { state: "pending" };
        promise.then(
          () => (seen.state = "answered"),
          (cause: SpexCommandError) => (seen.state = cause.code),
        );
        return seen;
      };
      const read = watch(client.command("config.get", {}));
      const open = watch(client.command("server.open", { instance: SPEX, serverId: "43", consented: true }));
      const close = watch(client.command("server.close", { instance: SPEX, serverId: "41" }));
      await vi.advanceTimersByTimeAsync(30_000);
      // A reply the core composes itself is awaited thirty seconds.
      expect(read.state).toBe("timeout");
      // [run-view-170] an open waits on the server's admission, which the
      // core awaits ninety seconds (core-service-128): still awaited at a
      // hundred, and so is a close queued behind it.
      await vi.advanceTimersByTimeAsync(70_000);
      expect(open.state).toBe("pending");
      expect(close.state).toBe("pending");
      const [, opened, closed] = socket.sent;
      expect([opened!.type, closed!.type]).toEqual(["server.open", "server.close"]);
      socket.reply(opened!.id, { place: LAB_BOX, leaseExpiresAt: Date.now() + 3_600_000 });
      socket.reply(closed!.id, { closed: true });
      await vi.advanceTimersByTimeAsync(0);
      expect(open.state).toBe("answered");
      expect(close.state).toBe("answered");
      client.close();
    } finally {
      vi.useRealTimers();
    }
  });
});
