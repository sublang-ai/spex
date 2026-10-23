// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// run-view-171: the remote rules (run-view-169, space-103, settings-48,
// DR-133). The local store and two seat stores, each over a fake client
// of its own, with the shell's picker and reveal present: this
// computer's Groups rows ask the picker for a Join's folder, offer
// "Choose folder…" for a clone whose code found none and reveal a
// clone's path, while a seat's offer none of these — its Join and its
// "Join again" send `space.join` with no folder to that seat's core
// alone, and a code clone that failed for want of the member's
// credential offers "Add a credential", opening the seat's Settings at
// its Credentials section with that host. The project palette opens a
// seat's project by naming it among the member's groups there, sending
// that seat's core a join with no folder. The Credentials section sends
// `credential.set` and `credential.remove` and lists what is set with
// no secret shown.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type {
  ConfigState,
  CredentialList,
  GroupsState,
  InstanceGroupState,
  ProjectInfo,
  RepositoryState,
  SeatState,
} from "@sublang/spex-core/protocol";

import { App } from "./App.js";
import { NO_CAN, groupsState, instanceState, repositoryRow } from "./fixtures/groups-state.js";
import { CONFIG_STATE } from "./fixtures/playbooks.js";
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
};
const BETA: SeatState = { ...ALPHA, serverId: "42", name: "gpu-box", place: `${SPEX}#42` };

const BRANCH: NonNullable<RepositoryState["branch"]> = {
  ahead: 0,
  behind: 0,
  checkedAt: 1,
  hostEmpty: false,
  unrelated: false,
  mergePending: false,
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
  fullPath: "acme",
  name: "acme",
  can: NO_CAN,
  repositories,
});

/** A place's Groups: the instance signed in, the member's group `acme`
 * listing one repository not at the place and one whose code clone
 * failed there — for want of the member's credential at a seat. */
function placeGroups(credential?: string): GroupsState {
  return groupsState({
    instances: [
      instanceState(SPEX, {
        displayName: "spex.pub",
        groups: [ACME([absent, failed(credential)])],
      }),
    ],
  });
}

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
    case "space.join":
      return { accepted: true };
    case "server.list":
      return { servers: [], failures: [] };
    case "credential.list":
      return { hosts: [], agents: [] };
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
    if (!(type in answers)) return defaultReply(type);
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
  local = fakeClient();
  alpha = fakeClient();
  beta = fakeClient();
  local.answers["space.get"] = placeGroups();
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

    // This computer: Join asks the shell's picker for the folder, and
    // sends it.
    fireEvent.click(screen.getByTestId(`space-row-join-${ABSENT_KEY}`));
    await settle();
    expect(pickDirectory).toHaveBeenCalledTimes(1);
    expect(callsOf(local, "space.join")).toEqual([{ instance: SPEX, hostId: "101", folder: "/work/alpha" }]);
    // A clone whose code found no folder offers "Choose folder…"
    // (space-63), and its clone's path is revealed.
    expect(screen.getByTestId(`space-row-folder-${FAILED_KEY}`).textContent).toBe("Choose folder…");
    expect(screen.queryByTestId(`space-row-join-again-${FAILED_KEY}`)).toBeNull();
    expect(screen.queryByTestId(`space-row-credential-${FAILED_KEY}`)).toBeNull();
    fireEvent.click(screen.getByTestId(`space-repo-${FAILED_KEY}`));
    expect(screen.getByTestId("space-clone-path-reveal")).toBeTruthy();

    // The seat: the same rows, at its own core.
    pick("build-box");
    await settle();
    expect(shownPlace()).toBe("build-box");
    fireEvent.click(screen.getByTestId(`space-row-join-${ABSENT_KEY}`));
    await settle();
    // [run-view-171] [run-view-169] a remote place's Join asks no
    // picker and opens no path entry; it sends `space.join` with no
    // folder to that place's core alone.
    expect(pickDirectory).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId(`space-join-${ABSENT_KEY}`)).toBeNull();
    expect(callsOf(alpha, "space.join")).toEqual([{ instance: SPEX, hostId: "101" }]);
    expect(callsOf(local, "space.join")).toHaveLength(1);
    expect(callsOf(beta, "space.join")).toEqual([]);
    // [run-view-169] no "Choose folder…" there (space-63, space-103).
    expect(screen.queryByTestId(`space-row-folder-${FAILED_KEY}`)).toBeNull();
    expect(screen.queryByText("Choose folder…")).toBeNull();
    // [run-view-169] no reveal of a path on the server; its copy stays.
    fireEvent.click(screen.getByTestId(`space-repo-${FAILED_KEY}`));
    expect(screen.getByTestId("space-repository")).toBeTruthy();
    expect(screen.queryByTestId("space-clone-path-reveal")).toBeNull();
    expect(screen.getByTestId("space-clone-path-copy")).toBeTruthy();
    expect(pathEntries(screen.getByTestId("space-groups"))).toEqual([]);
    expect(revealPath).not.toHaveBeenCalled();
  });

  test("the palette: this computer's path entry and picker, a seat's projects named among its groups", async () => {
    render(<App />);
    fireEvent.click(screen.getByTestId("sidebar-palette"));
    const palette = screen.getByTestId("project-palette");
    // This computer's add flow: the path entry and the picker.
    expect(within(palette).getByTestId("palette-path")).toBeTruthy();
    expect(within(palette).getByTestId("palette-open-folder")).toBeTruthy();
    expect(within(palette).getByTestId("palette-new-place").textContent).toBe(
      "A new project is added on This computer.",
    );
    await settle();
    // [run-view-169] a seat's add flow names the member's groups'
    // projects there, with no path entry and no picker of its own.
    const seat = within(palette).getByTestId(`palette-groups-${ALPHA.place}`);
    expect(screen.getByRole("group", { name: "From your groups on build-box" })).toBe(seat);
    expect(within(seat).getAllByRole("button").map((button) => button.getAttribute("data-testid"))).toEqual([
      `palette-join-${ABSENT_KEY}@${ALPHA.place}`,
    ]);
    expect(pathEntries(seat)).toEqual([]);
    expect(within(seat).queryByText("Open folder…")).toBeNull();
    // A seat whose groups nothing had read is read as the palette opens.
    expect(callsOf(beta, "space.get")).toHaveLength(1);
    const other = within(palette).getByTestId(`palette-groups-${BETA.place}`);
    expect(other.textContent).toContain("Nothing more to open from your groups");
  });

  test("a seat's Overview offers no picker, reveal or path entry", async () => {
    alphaStore.getState().setWorkspaceTab("p2", "overview");
    render(<App />);
    fireEvent.click(screen.getByTestId("sidebar-palette"));
    fireEvent.click(screen.getByTestId(`palette-project-p2@${ALPHA.place}`));
    await settle();
    const overview = screen.getByTestId("overview-tab");
    expect(overview.textContent).toContain("gpu-project");
    // [run-view-169] nothing there picks, reveals or takes a path.
    expect(pathEntries(overview)).toEqual([]);
    expect(overview.querySelector('[data-testid$="-reveal"]')).toBeNull();
    expect(within(overview).queryByText("Open folder…")).toBeNull();
  });
});

describe("run-view-171: opening a group's project at a seat", () => {
  test("sends space.join with no folder to that place's client alone", async () => {
    render(<App />);
    fireEvent.click(screen.getByTestId("sidebar-palette"));
    await settle();
    fireEvent.click(screen.getByTestId(`palette-join-${ABSENT_KEY}@${ALPHA.place}`));
    await settle();
    // [run-view-171] [run-view-169] the join names the instance and the
    // host id, and no folder: the seat allocates it (space-103).
    expect(callsOf(alpha, "space.join")).toEqual([{ instance: SPEX, hostId: "101" }]);
    expect(callsOf(local, "space.join")).toEqual([]);
    expect(callsOf(beta, "space.join")).toEqual([]);
    expect(pickDirectory).not.toHaveBeenCalled();
    // Accepted, the palette closes; the join reports on the seat's row.
    expect(screen.queryByTestId("project-palette")).toBeNull();
  });

  test("a refused join reads the core's words in the palette", async () => {
    alpha.answers["space.join"] = () => {
      throw new SpexCommandError("invalid_request", "No longer shared with you");
    };
    render(<App />);
    fireEvent.click(screen.getByTestId("sidebar-palette"));
    await settle();
    fireEvent.click(screen.getByTestId(`palette-join-${ABSENT_KEY}@${ALPHA.place}`));
    await settle();
    expect(callsOf(alpha, "space.join")).toEqual([{ instance: SPEX, hostId: "101" }]);
    expect(screen.getByTestId("palette-error").textContent).toBe("No longer shared with you");
  });
});

describe("run-view-169: a seat's code clone that failed for want of a credential", () => {
  test("the row offers Join again and Add a credential, and they act", async () => {
    render(<App />);
    goTo("Space");
    pick("build-box");
    await settle();

    // [run-view-169] the row offers Join again in place of "Choose
    // folder…" (space-63, space-103).
    const again = screen.getByTestId(`space-row-join-again-${FAILED_KEY}`);
    expect(again.textContent).toBe("Join again");
    const add = screen.getByTestId(`space-row-credential-${FAILED_KEY}`);
    expect(add.textContent).toBe("Add a credential");
    // [run-view-169] Join again sends the join again, with no folder,
    // to the seat alone.
    fireEvent.click(again);
    await settle();
    expect(callsOf(alpha, "space.join")).toEqual([{ instance: SPEX, hostId: "102" }]);
    expect(callsOf(local, "space.join")).toEqual([]);
    expect(pickDirectory).not.toHaveBeenCalled();

    // [run-view-169] Add a credential opens the seat's Settings at its
    // Credentials section, at the host the failure names (settings-48).
    fireEvent.click(add);
    await settle();
    expect(shownPlace()).toBe("build-box");
    const section = screen.getByTestId("credentials-section");
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
    expect(screen.queryByTestId(`space-row-join-again-${FAILED_KEY}`)).toBeNull();
    expect(screen.queryByTestId(`space-row-credential-${FAILED_KEY}`)).toBeNull();
    expect(screen.getByTestId(`space-row-folder-${FAILED_KEY}`)).toBeTruthy();
  });
});

describe("settings-48: the Credentials section of a seat's Settings", () => {
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
    // [settings-50] the seat lists what is set: the hosts and the
    // agents' form names, no secret among them.
    expect(callsOf(alpha, "credential.list")).toEqual([{}]);
    expect(within(section).getByTestId("credentials-note").textContent).toBe(
      "A credential you place here stays on this server until you remove it.",
    );
    expect(within(section).getByTestId("credential-host-git.example.com").textContent).toContain("git.example.com");
    expect(within(section).getByTestId("credential-agent-claude").textContent).toContain("ANTHROPIC_API_KEY");

    // [settings-50] a code host's token is set with credential.set.
    fireEvent.change(within(section).getByTestId("credential-host-name"), { target: { value: "code.example.org" } });
    const token = within(section).getByTestId("credential-host-token") as HTMLInputElement;
    expect(token.type).toBe("password");
    fireEvent.change(token, { target: { value: "tok-secret-1" } });
    fireEvent.click(within(section).getByTestId("credential-host-save"));
    await settle();
    expect(callsOf(alpha, "credential.set")).toEqual([
      { kind: "host", name: "code.example.org", values: { token: "tok-secret-1" } },
    ]);
    // [settings-50] listed after the write with no secret shown: the
    // token leaves its field and the page.
    expect(within(section).getByTestId("credential-host-code.example.org")).toBeTruthy();
    expect(token.value).toBe("");
    expect(document.body.textContent).not.toContain("tok-secret-1");

    // [settings-50] an agent's credential by its forms (settings-49).
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

    // [settings-50] removal with credential.remove.
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

  test("a refusal reads the core's words in the section, and a set host is no longer named as needed", async () => {
    alpha.answers["credential.set"] = () => {
      throw new SpexCommandError("invalid_request", "git example is no host name");
    };
    render(<App />);
    goTo("Settings");
    pick("build-box");
    await settle();
    const section = screen.getByTestId("credentials-section");
    // [settings-48] the host whose code clone failed is named.
    expect(within(section).getByTestId("credentials-needed-git.example.com")).toBeTruthy();
    fireEvent.change(within(section).getByTestId("credential-host-name"), { target: { value: "git example" } });
    fireEvent.change(within(section).getByTestId("credential-host-token"), { target: { value: "t" } });
    fireEvent.click(within(section).getByTestId("credential-host-save"));
    await settle();
    expect(within(section).getByTestId("credentials-error").textContent).toBe("git example is no host name");

    alpha.answers["credential.set"] = () => ({ hosts: [{ name: "git.example.com" }], agents: [] });
    fireEvent.change(within(section).getByTestId("credential-host-name"), { target: { value: "git.example.com" } });
    fireEvent.click(within(section).getByTestId("credential-host-save"));
    await settle();
    await waitFor(() => expect(within(section).queryByTestId("credentials-needed-git.example.com")).toBeNull());
    expect(within(section).queryByTestId("credentials-error")).toBeNull();
  });
});
