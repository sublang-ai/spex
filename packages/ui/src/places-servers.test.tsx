// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// run-view-171: the place selector and the team servers (run-view-168,
// run-view-170, DR-133). The local store and two seat stores, each over
// a fake client of its own: the selector switches Settings, Playbooks —
// with its Environments — and Groups between this computer's store and
// a seat's, each surface reading and acting at the place it names; this
// computer's Groups surface lists each server an instance lets the
// person open, under that instance's heading, with Open or Close by
// whether a seat is open there; the first Open on this device shows the
// instance's contract and sends `server.open` with consent only on "I
// understand", a later Open sending it at once; Close sends
// `server.close`; and a refusal reads the core's cause in place.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type {
  ConfigState,
  GroupsState,
  ProjectInfo,
  SeatState,
  ServerListing,
} from "@sublang/spex-core/protocol";

import { App } from "./App.js";
import { groupsState, instanceState } from "./fixtures/groups-state.js";
import { CONFIG_STATE, available, environment, specPackage } from "./fixtures/playbooks.js";
import { activateLanguage } from "./i18n.js";
import { SpexCommandError, type SpexClient } from "./lib/client.js";
import { usePlaces } from "./state/places.js";
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

/** This computer's Groups: two signed-in instances. */
const LOCAL_GROUPS: GroupsState = groupsState({
  instances: [
    instanceState(SPEX, { displayName: "spex.pub" }),
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
  return await screen.findByTestId(`space-servers-${SPEX}`);
}

const row = (place: string): HTMLElement => screen.getByTestId(`space-server-${place}`);
const control = (place: string): HTMLButtonElement =>
  screen.getByTestId(`space-server-control-${place}`) as HTMLButtonElement;

const CONTRACT =
  "Opening a seat places your sign-in on lab-box. Whoever runs lab-box can act as you: in your spaces, in your records, and with the account you sign in to spex.pub with, wherever it reaches. Agents on lab-box run on the sign-ins its administrator set up, unless you set your own. A credential you place on lab-box stays there until you remove it. Retiring the server or revoking the seat under Devices stops new use; a credential already on the server lasts until it expires.";

describe("run-view-170: the servers under each instance's heading", () => {
  test("each server by its name and group, Open or Close by whether a seat is open there", async () => {
    const servers = await openGroups();
    // [run-view-170] the listing is the local core's, read as the
    // surface opens.
    expect(callsOf(local, "server.list")).toHaveLength(1);
    // [run-view-170] under the instance's heading.
    const instance = screen.getByRole("group", { name: "spex.pub" });
    expect(instance.contains(servers)).toBe(true);
    expect(within(servers).getAllByRole("listitem").map((item) => item.getAttribute("data-testid"))).toEqual([
      `space-server-${ALPHA.place}`,
      `space-server-${BETA.place}`,
      `space-server-${LAB_BOX}`,
    ]);
    // [run-view-170] by name and group; "Close" where a seat is open,
    // "Open" where none is.
    expect(row(ALPHA.place).textContent).toContain("build-box");
    expect(row(ALPHA.place).textContent).toContain("acme/infra");
    expect(control(ALPHA.place).textContent).toBe("Close");
    expect(control(BETA.place).textContent).toBe("Close");
    expect(row(LAB_BOX).textContent).toContain("lab-box");
    expect(row(LAB_BOX).textContent).toContain("acme/lab");
    expect(control(LAB_BOX).textContent).toBe("Open");
    // [run-view-170] one instance's failure stands under its own
    // heading, hiding no other's servers.
    const lab = screen.getByRole("group", { name: "Lab" });
    expect(within(lab).getByRole("alert").textContent).toBe("Couldn't read the servers: Lab refused the request");
    expect(within(lab).queryAllByRole("listitem")).toEqual([]);
    expect(within(instance).queryByRole("alert")).toBeNull();
  });

  test("the first Open shows the contract and sends server.open with consent only on I understand; a later Open sends at once", async () => {
    await openGroups();

    fireEvent.click(control(LAB_BOX));
    // [run-view-171] the first Open shows the instance's contract, in
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
    // server now reading Close.
    expect(callsOf(local, "server.list")).toHaveLength(2);
    await waitFor(() => expect(control(LAB_BOX).textContent).toBe("Close"));

    // [run-view-170] once its seat is closed, a later Open on this
    // device sends server.open at once, with no contract.
    local.answers["server.close"] = { closed: true };
    local.answers["server.list"] = listing({ "43": false });
    fireEvent.click(control(LAB_BOX));
    await settle();
    await waitFor(() => expect(control(LAB_BOX).textContent).toBe("Open"));
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

  test("Close sends server.close for the server's seat and reads the listing again", async () => {
    await openGroups();
    local.answers["server.close"] = { closed: true };
    local.answers["server.list"] = {
      ...listing(),
      servers: listing().servers.map((server) => (server.id === "41" ? { ...server, open: false } : server)),
    };
    fireEvent.click(control(ALPHA.place));
    await settle();
    // [run-view-170] Close sends server.close, with no contract, to the
    // local core alone.
    expect(callsOf(local, "server.close")).toEqual([{ instance: SPEX, serverId: "41" }]);
    expect(commandsOf(alpha)).not.toContain("server.close");
    expect(screen.queryByTestId(`space-server-contract-${ALPHA.place}`)).toBeNull();
    expect(callsOf(local, "server.list")).toHaveLength(2);
    await waitFor(() => expect(control(ALPHA.place).textContent).toBe("Open"));
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
    expect(control(LAB_BOX).textContent).toBe("Open");
    expect(callsOf(local, "server.list")).toHaveLength(1);
    // A refused close reads its cause in place as well.
    local.answers["server.close"] = () => {
      throw new SpexCommandError("not_found", "No seat is open on this server");
    };
    fireEvent.click(control(ALPHA.place));
    await settle();
    expect(within(row(ALPHA.place)).getByRole("alert").textContent).toBe("No seat is open on this server");
  });
});
