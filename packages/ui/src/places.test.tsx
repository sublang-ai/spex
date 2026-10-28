// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// run-view-171: one place's banner and one place's mismatch show alone
// (run-view-168, run-view-50). The local store runs over a fake client;
// each seat's store over the real protocol client, dialing a fake
// socket the test answers for the seat's core. The local core's
// `server.state` names the seats: each gets a store of its own, dialed
// at its relay path on the local endpoint with the local token, and its
// connection, its banner and its mismatch are its own.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { PROTOCOL_VERSION, type SeatState, type ServerMessage } from "@sublang/spex-core/protocol";

import { App } from "./App.js";
import { groupsState } from "./fixtures/groups-state.js";
import { activateLanguage } from "./i18n.js";
import { usePlaces } from "./state/places.js";
import { deliverServerMessageForTests, setClientForTests, useAppStore } from "./state/store.js";
import type { SpexClient } from "./lib/client.js";

afterEach(cleanup);

// jsdom has no layout, so the strip's keep-in-view call needs a stub.
Element.prototype.scrollIntoView = vi.fn();

/** The local core's endpoint and the token it admits. */
const LOCAL_URL = "ws://127.0.0.1:8137/?token=secret";

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
  signIn: { state: "signedIn" },
};
const BETA: SeatState = { ...ALPHA, serverId: "42", name: "gpu-box", place: "https://spex.pub#42" };

/** Each seat's relay path on the local endpoint, the place
 * percent-encoded and the local token kept (core-service-129). */
const ALPHA_URL = "ws://127.0.0.1:8137/seats/https%3A%2F%2Fspex.pub%2341?token=secret";
const BETA_URL = "ws://127.0.0.1:8137/seats/https%3A%2F%2Fspex.pub%2342?token=secret";

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

/** A seat's core as the relay path reaches it: every dial recorded by
 * its URL; the test says when the core's hello arrives, and with which
 * protocol version; a command is answered as the core would. */
class FakeSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static made: FakeSocket[] = [];

  readyState = FakeSocket.CONNECTING;
  readonly sent: string[] = [];

  constructor(readonly url: string) {
    super();
    FakeSocket.made.push(this);
  }

  send(data: string): void {
    const { type, id } = JSON.parse(data) as { type: string; id: string };
    this.sent.push(type);
    void Promise.resolve().then(() =>
      this.receive({ type: "reply", id, ok: true, result: defaultReply(type) } as ServerMessage),
    );
  }

  close(): void {
    if (this.readyState === FakeSocket.CLOSED) return;
    this.readyState = FakeSocket.CLOSED;
    this.dispatchEvent(new Event("close"));
  }

  /** The seat's hello, relayed: this core's protocol version unless a
   * test names another. */
  hello(protocolVersion = PROTOCOL_VERSION): void {
    this.readyState = FakeSocket.OPEN;
    this.receive({ type: "hello", protocolVersion, coreVersion: "0.0.0-test" } as ServerMessage);
  }

  private receive(message: ServerMessage): void {
    if (this.readyState !== FakeSocket.OPEN) return;
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(message) }));
  }
}

/** The sockets dialed at `url`, oldest first. */
const dialed = (url: string): FakeSocket[] => FakeSocket.made.filter((socket) => socket.url === url);
/** The newest socket dialed at `url`. */
const latest = (url: string): FakeSocket => dialed(url).at(-1)!;

/** The page's banners, each naming its place by `data-place`. */
const banners = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>("[data-place]")];
const bannerOf = (place: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(`[data-place="${place}"]`);

/** The stores the page holds for its seats, by place. */
const seatStore = (place: string) =>
  usePlaces.getState().seats.find((entry) => entry.seat.place === place)?.store;

/** Let replies and the work they set off land. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let tick = 0; tick < 50; tick += 1) await Promise.resolve();
  });
}

/** The local core announces the seats it holds open (core-service-128). */
function serverState(...seats: SeatState[]): void {
  act(() => deliverServerMessageForTests({ type: "server.state", seats }));
}

/** Both seats announced, each seat's hello relayed, all settled. */
async function twoSeatsOpen(): Promise<void> {
  serverState(ALPHA, BETA);
  act(() => latest(ALPHA_URL).hello());
  act(() => latest(BETA_URL).hello());
  await settle();
}

/** The local store as every surface reads it, before this file's tests. */
const pristine = useAppStore.getState();
let localCommand: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeSocket);
  FakeSocket.made = [];
  activateLanguage("en");
  localCommand = vi.fn(async (type: string) => defaultReply(type));
  setClientForTests({ command: localCommand, subscribe: vi.fn(async () => null) } as unknown as SpexClient);
  // The local core is reached and its state is read.
  useAppStore.setState({
    connection: "open",
    everConnected: true,
    coreUrl: LOCAL_URL,
    projects: [
      { id: "p1", name: "home-project", path: "/tmp/home", registeredAt: 0, repository: { key: "p1", name: "home-spex", group: "me", own: true } },
    ] as never,
    currentProjectId: "p1",
    configState: { status: "valid", summary: { playbooks: [], captain: undefined } } as never,
    ledger: { intents: [], attention: [], badge: 0 },
  });
});

afterEach(() => {
  // The local store's reset names no seats: every seat's store is
  // closed and dropped.
  useAppStore.setState(pristine, true);
  setClientForTests(undefined);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("run-view-171: a store and a connection per place", () => {
  test("a server.state with two seats dials each at its relay path with the local token", async () => {
    render(<App />);
    serverState(ALPHA, BETA);

    // [run-view-168] one store per seat, each the place `server.state`
    // names, shown by its server's name.
    const seats = usePlaces.getState().seats;
    expect(seats.map((entry) => entry.store.place)).toEqual([
      { key: ALPHA.place, name: "build-box" },
      { key: BETA.place, name: "gpu-box" },
    ]);
    expect(seats[0]!.store).not.toBe(seats[1]!.store);
    expect(seats.some((entry) => entry.store === useAppStore)).toBe(false);
    // [run-view-168] each reached at its relay path on the local
    // endpoint, with the token the local connection uses.
    expect(FakeSocket.made.map((socket) => socket.url)).toEqual([ALPHA_URL, BETA_URL]);
    expect(seatStore(ALPHA.place)!.getState().coreUrl).toBe(ALPHA_URL);
    expect(seatStore(BETA.place)!.getState().coreUrl).toBe(BETA_URL);

    act(() => latest(ALPHA_URL).hello());
    act(() => latest(BETA_URL).hello());
    await settle();
    // [run-view-168] each seat's state is read from its own core.
    expect(seatStore(ALPHA.place)!.getState().connection).toBe("open");
    expect(seatStore(BETA.place)!.getState().connection).toBe("open");
    expect(latest(ALPHA_URL).sent).toEqual(expect.arrayContaining(["config.get", "project.list", "session.list"]));
    expect(latest(BETA_URL).sent).toEqual(expect.arrayContaining(["config.get", "project.list", "session.list"]));
    expect(localCommand).not.toHaveBeenCalledWith("project.list", expect.anything());
    // Every place reached: no banner anywhere.
    expect(banners()).toEqual([]);

    // A repeated announcement keeps each store and its connection.
    const before = usePlaces.getState().seats.map((entry) => entry.store);
    serverState(ALPHA, BETA);
    expect(usePlaces.getState().seats.map((entry) => entry.store)).toEqual(before);
    expect(FakeSocket.made).toHaveLength(2);
  });

  test("one seat's connection failing shows its banner alone, and it reconnects alone", async () => {
    render(<App />);
    await twoSeatsOpen();

    act(() => latest(ALPHA_URL).close());
    // [run-view-171] the failing seat's banner shows alone, naming its
    // server.
    expect(banners()).toHaveLength(1);
    expect(bannerOf(ALPHA.place)!.textContent).toBe(
      "Reconnecting to build-box… actions there are paused until the connection returns.",
    );
    expect(bannerOf("local")).toBeNull();
    expect(bannerOf(BETA.place)).toBeNull();
    // [run-view-168] one core failing leaves the others: this computer
    // and the other seat stay connected, the local UI as it was.
    expect(useAppStore.getState().connection).toBe("open");
    expect(seatStore(BETA.place)!.getState().connection).toBe("open");
    expect(latest(BETA_URL).readyState).toBe(FakeSocket.OPEN);
    expect(screen.queryByText(/Reconnecting to the Spex core/)).toBeNull();
    expect(screen.getAllByText("home-project").length).toBeGreaterThan(0);

    // [run-view-168] the seat redials as the local connection does,
    // a second later, and that place alone.
    act(() => vi.advanceTimersByTime(1_000));
    expect(dialed(ALPHA_URL)).toHaveLength(2);
    expect(dialed(BETA_URL)).toHaveLength(1);
    act(() => latest(ALPHA_URL).hello());
    await settle();
    // [run-view-171] restored, its banner gone.
    expect(seatStore(ALPHA.place)!.getState().connection).toBe("open");
    expect(banners()).toEqual([]);
  });

  test("a seat never reached is named after its grace, and Retry redials that place alone", async () => {
    render(<App />);
    serverState(ALPHA, BETA);
    act(() => latest(BETA_URL).hello());
    await settle();

    // A first connect is "Connecting": the seat gets the same grace as
    // the local core before the alarm.
    act(() => vi.advanceTimersByTime(7_900));
    expect(screen.queryByRole("alert")).toBeNull();
    act(() => vi.advanceTimersByTime(200));
    // [run-view-171] the seat never reached shows its banner alone,
    // naming its server, not an endpoint.
    const alert = screen.getByRole("alert");
    expect(alert.dataset.place).toBe(ALPHA.place);
    expect(alert.textContent).toContain("Can't reach build-box — retrying every second.");
    expect(alert.textContent).not.toContain("ws://");
    expect(alert.textContent).not.toContain("secret");
    expect(banners()).toEqual([alert]);

    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    // [run-view-168] Retry redials that place alone: its own connection
    // let go and dialed afresh; the other seat's and this computer's
    // untouched.
    expect(dialed(ALPHA_URL)).toHaveLength(2);
    expect(dialed(ALPHA_URL)[0]!.readyState).toBe(FakeSocket.CLOSED);
    expect(dialed(BETA_URL)).toHaveLength(1);
    expect(latest(BETA_URL).readyState).toBe(FakeSocket.OPEN);
    expect(useAppStore.getState().connection).toBe("open");

    act(() => latest(ALPHA_URL).hello());
    await settle();
    expect(seatStore(ALPHA.place)!.getState().connection).toBe("open");
    expect(banners()).toEqual([]);
  });
});

describe("run-view-171: one place's mismatch shows alone", () => {
  test("a seat whose relay reads mismatched shows its mismatch alone and is never dialed", async () => {
    render(<App />);
    serverState({ ...ALPHA, relay: "mismatched" }, BETA);
    act(() => latest(BETA_URL).hello());
    await settle();

    // [run-view-168] the mismatched seat keeps a store in the
    // mismatched state, without connecting.
    expect(seatStore(ALPHA.place)!.getState().connection).toBe("mismatch");
    expect(dialed(ALPHA_URL)).toEqual([]);
    // [run-view-171] its mismatch shows alone, naming its server.
    expect(banners()).toHaveLength(1);
    expect(bannerOf(ALPHA.place)!.textContent).toBe(
      "build-box speaks a different protocol version than this window — it needs the same Spex release as this app.",
    );
    expect(screen.queryByText(/The Spex window and its core speak different protocol versions/)).toBeNull();
    expect(useAppStore.getState().connection).toBe("open");
    expect(seatStore(BETA.place)!.getState().connection).toBe("open");

    act(() => vi.advanceTimersByTime(10_000));
    expect(dialed(ALPHA_URL)).toEqual([]);
  });

  test("a seat whose relayed hello carries another version shows its mismatch alone and stops", async () => {
    render(<App />);
    serverState(ALPHA, BETA);
    act(() => latest(ALPHA_URL).hello(PROTOCOL_VERSION + 1));
    act(() => latest(BETA_URL).hello());
    await settle();

    // [run-view-171] the seat's mismatch shows alone.
    expect(seatStore(ALPHA.place)!.getState().connection).toBe("mismatch");
    expect(banners()).toHaveLength(1);
    expect(bannerOf(ALPHA.place)!.textContent).toContain("build-box speaks a different protocol version");
    // [run-view-168] the others stay connected.
    expect(useAppStore.getState().connection).toBe("open");
    expect(seatStore(BETA.place)!.getState().connection).toBe("open");
    // A version skew never heals by redialing.
    act(() => vi.advanceTimersByTime(10_000));
    expect(dialed(ALPHA_URL)).toHaveLength(1);
  });
});

describe("run-view-171: a seat leaving server.state", () => {
  test("drops its store and its banner, and is never dialed again", async () => {
    render(<App />);
    await twoSeatsOpen();
    const beta = seatStore(BETA.place);
    act(() => latest(ALPHA_URL).close());
    expect(bannerOf(ALPHA.place)).not.toBeNull();

    serverState(BETA);
    // [run-view-168] the seat no longer open is no place: its store
    // dropped and its banner gone.
    expect(usePlaces.getState().seats.map((entry) => entry.seat.place)).toEqual([BETA.place]);
    expect(seatStore(ALPHA.place)).toBeUndefined();
    expect(bannerOf(ALPHA.place)).toBeNull();
    expect(banners()).toEqual([]);
    // [run-view-168] its connection is closed for good: the redial its
    // drop had set off is called off.
    act(() => vi.advanceTimersByTime(10_000));
    expect(dialed(ALPHA_URL)).toHaveLength(1);
    // The other seat keeps its store and its connection.
    expect(seatStore(BETA.place)).toBe(beta);
    expect(dialed(BETA_URL)).toHaveLength(1);
    expect(latest(BETA_URL).readyState).toBe(FakeSocket.OPEN);

    // A seat still connected closes as it leaves.
    serverState();
    expect(usePlaces.getState().seats).toEqual([]);
    expect(latest(BETA_URL).readyState).toBe(FakeSocket.CLOSED);
    act(() => vi.advanceTimersByTime(10_000));
    expect(dialed(BETA_URL)).toHaveLength(1);
  });
});
