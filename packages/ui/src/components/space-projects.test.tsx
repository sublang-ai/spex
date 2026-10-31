// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// space-113: the Space surface reads as projects in groups (DR-159,
// DR-172). A signed-in home whose instance lists a group `acme` holding
// a group `acme/research`, a project `alpha-spex` cloned here, one
// `beta-spex` not on this computer, `acme-spex` as the group's own, one
// server `lab-1` of `acme`, a repository under another login `bob`, and
// your namespace holding your own group's repository alone, with one
// seat open at `lab-1` holding `beta-spex` — a second instance signed in
// beside it. The test reads, through the surface, in English and in
// Chinese: the instance's heading and its registry line, the headings,
// the group's overflow and its server's line, the rows' names, marks,
// phrase and overflow, each Open and what it sends, a project in no
// group and its picker, the choices owed and records started
// separately, a repair named by its project, the same surface at the
// seat's place naming the server, and the new controls' budget.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type {
  GroupsState,
  InstanceGroupState,
  ProjectInfo,
  RegistryState,
  RepositoryState,
  SeatState,
  ServerListing,
  SpaceConflict,
  SpaceUnit,
} from "@sublang/spex-core/protocol";

import { SpaceSurface } from "./SpaceSurface.js";
import { groupsState, instanceState, namespace, placementState, repositoryRow } from "../fixtures/groups-state.js";
import { activateLanguage } from "../i18n.js";
import { PlaceStoreContext } from "../state/place-context.js";
import { usePlaces } from "../state/places.js";
import { useServerOpens } from "../state/server-opens.js";
import { createAppStore, deliverServerMessageForTests, setClientForTests, useAppStore, type AppStore } from "../state/store.js";

const NOW = Date.now();
const MIN = 60_000;
const ORIGIN = "https://spex.example";
const SECOND = "https://second.example";
const HOME = "/Users/ada/.spex";
const PLACE = `${ORIGIN}#1`;

const OWN_KEY = "ada/ada-spex";
const GAMMA_KEY = "ada/gamma-spex";
const ALPHA_KEY = "@spex.example/acme/alpha-spex";
const BETA_KEY = "@spex.example/acme/beta-spex";
const ACME_KEY = "@spex.example/acme/acme-spex";
const BOB_KEY = "@spex.example/bob/shared-spex";

/** What each language reads (localization-4): the catalog's words. */
const WORDS = {
  en: {
    personal: "Personal",
    thisComputer: "This computer",
    sharedByBob: "Shared by @bob",
    members: "4 members",
    research: "Research · acme/research",
    more: (name: string) => `More for ${name}`,
    groupActs: ["Members"],
    connected: "Connected",
    disconnect: "Disconnect",
    connect: "Connect",
    groupSessions: "Group sessions",
    yourSessions: "Your sessions",
    here: "Here",
    onLab: "On lab-1",
    synced: "Synced 5m ago",
    rowActs: ["Sync now", "Members", "Explore records"],
    show: "Show",
    openOnLab: "Open on lab-1",
    openHere: "Open here",
    showOnLab: "Show on lab-1",
    openingOnLab: "Opening on lab-1…",
    folderForSessions: "Folder its sessions run in on this computer",
    addToGroup: "Add to a group…",
    changed: "Changed here and at Spex Example",
    resolve: "Resolve",
    keepHere: "Keep this computer's",
    take: "Take Spex Example's",
    allHere: "All here",
    allTake: "All Spex Example's",
    apart: "Started separately at Spex Example",
    combine: "Combine…",
    combineConfirm: "Combine",
    repair: "delta · acme — Folder missing on this computer",
    repairFolder: "~/code/delta · 3 sessions ran there",
    chooseFolder: "Choose folder…",
    notHere: "Not on this computer",
    notOnLab: "Not on lab-1",
    keepOnLab: "Keep lab-1's",
    labFiles: "Spex keeps lab-1's files in ~/.spex",
    keepLabVersion: "Keep lab-1's version? Spex Example's stays in Git history",
    nothingFromLab: "Nothing to send from lab-1",
    signOutLab: "Signs lab-1 out of Spex Example; every record stays there",
    cancel: "Cancel",
    signInTitle: "Sign in to a Space",
    heading: "Spex Example · @ada",
    newGroup: "New group",
    signOut: "Sign out",
    removeFromList: "Remove from this list",
    registry: "Registry",
    signIn: "Sign in",
    registryTitle: "For publishing and private packages",
    registrySignedIn: "Registry · signed in as @ada",
    toSend: "1 to send",
    use: "Use ~/code/delta",
    exempt: ["Add to a group…"],
  },
  zh: {
    personal: "个人",
    thisComputer: "本机",
    sharedByBob: "@bob 共享的",
    members: "4 名成员",
    research: "Research · acme/research",
    more: (name: string) => `${name} 的更多操作`,
    groupActs: ["成员"],
    connected: "已连接",
    disconnect: "断开连接",
    connect: "连接",
    groupSessions: "群组会话",
    yourSessions: "你的会话",
    here: "这里",
    onLab: "在 lab-1 上",
    synced: "5 分钟前同步",
    rowActs: ["立即同步", "成员", "浏览记录"],
    show: "显示",
    openOnLab: "在 lab-1 上打开",
    openHere: "在这里打开",
    showOnLab: "在 lab-1 上显示",
    openingOnLab: "正在 lab-1 上打开…",
    folderForSessions: "本机上运行其会话的文件夹",
    addToGroup: "加入群组…",
    changed: "这里和 Spex Example 都有更改",
    resolve: "解决",
    keepHere: "保留本机的",
    take: "取 Spex Example 的",
    allHere: "全用这里的",
    allTake: "全用 Spex Example 的",
    apart: "在 Spex Example 上各自开始",
    combine: "合并…",
    combineConfirm: "合并",
    repair: "delta · acme — 本机缺少文件夹",
    repairFolder: "~/code/delta · 3 个会话曾在此运行",
    chooseFolder: "选择文件夹…",
    notHere: "不在本机上",
    notOnLab: "不在 lab-1 上",
    keepOnLab: "保留 lab-1 的",
    labFiles: "Spex 将 lab-1 的文件保存在 ~/.spex",
    keepLabVersion: "保留 lab-1 的 1 项版本？Spex Example 的版本仍保留在 Git 历史中",
    nothingFromLab: "lab-1 没有要发送的内容",
    signOutLab: "让 lab-1 退出 Spex Example；所有记录仍保留在那里",
    cancel: "取消",
    signInTitle: "登录到 Space",
    heading: "Spex Example · @ada",
    newGroup: "新建群组",
    signOut: "退出登录",
    removeFromList: "从列表中移除",
    registry: "注册中心",
    signIn: "登录",
    registryTitle: "用于发布和私有规约包",
    registrySignedIn: "注册中心 · 已登录为 @ada",
    toSend: "1 项待发送",
    use: "使用 ~/code/delta",
    exempt: ["加入群组…"],
  },
} as const;
type Language = keyof typeof WORDS;

/** A group of the instance as its read lists it (space-30). */
function group(id: string, fullPath: string, name: string, repositories: RepositoryState[], can = false): InstanceGroupState {
  return {
    id,
    login: null,
    mine: false,
    fullPath,
    name,
    can: { createSubgroup: can, manageMembers: can, rename: can, delete: can },
    placed: [],
    repositories,
  };
}

const SESSION: SpaceUnit = {
  unit: "sessions/s1",
  kind: "session",
  label: "Fix the login redirect",
  change: "updated",
  sessionId: "s1",
  paths: ["sessions/s1.json"],
  diff: false,
};
const CONFLICTS: SpaceConflict[] = [
  {
    unit: SESSION,
    mine: { change: "updated", at: NOW - 2 * 60 * MIN, diff: false },
    remote: { change: "updated", at: NOW - 5 * 60 * MIN, diff: false },
  },
];

/** `alpha-spex`, cloned here and paired, placed at the instance alone,
 * the view letting the person manage its members and move it. */
function alpha(over: Partial<RepositoryState> = {}, line: Parameters<typeof placementState>[0] = {}): RepositoryState {
  const may = { manageMembers: true, transfer: true };
  return {
    ...repositoryRow(ALPHA_KEY, {
      instance: ORIGIN,
      governing: ORIGIN,
      name: "alpha-spex",
      id: "21",
      code: "git@github.com:acme/alpha.git",
      folder: "/Users/ada/code/alpha",
      state: "reachable",
      placedAt: [ORIGIN],
    }),
    placements: [
      placementState({
        instance: ORIGIN,
        path: "acme/alpha-spex",
        id: "21",
        members: 4,
        noticed: true,
        can: may,
        branch: { ahead: 0, behind: 0, checkedAt: NOW - MIN, hostEmpty: false, unrelated: false, agreed: null },
        lastSync: { at: NOW - 5 * MIN, sent: 1, received: 0 },
        ...line,
      }),
    ],
    ...over,
  };
}

/** A row the instance lists that this device lacks (space-61). */
function absent(key: string, name: string, id: string, code: string | null, members: number | null = null): RepositoryState {
  return repositoryRow(key, { instance: ORIGIN, governing: ORIGIN, name, id, code, state: "absent", members });
}

/** This computer's home (space-113): your own records, `acme` with its
 * subgroup, bob's listing, and a second instance. */
function home(over: { alpha?: RepositoryState; diagnostics?: GroupsState["diagnostics"]; gamma?: false } = {}): GroupsState {
  const own = repositoryRow(OWN_KEY, {
    instance: ORIGIN,
    governing: ORIGIN,
    name: "ada-spex",
    id: "7",
    own: true,
    remote: "ada/ada-spex",
    state: "reachable",
    branch: { ahead: 0, behind: 0, checkedAt: NOW - MIN, hostEmpty: false, unrelated: false, agreed: null },
    lastSync: { at: NOW - 60 * MIN, sent: 1, received: 0 },
  });
  const gamma = repositoryRow(GAMMA_KEY, { name: "gamma-spex", code: "git@github.com:ada/gamma.git", folder: "/Users/ada/code/gamma" });
  const diagnostics = over.diagnostics ?? [];
  return groupsState({
    home: HOME,
    defaultInstance: ORIGIN,
    own: { name: "ada", named: false, repositories: over.gamma === false ? [own] : [own, gamma] },
    instances: [
      instanceState(ORIGIN, {
        displayName: "Spex Example",
        account: { id: "7", login: "ada", displayName: "Ada", canCreateGroup: true },
        groups: [
          group("10", "acme", "acme", [absent(ACME_KEY, "acme-spex", "20", null, 4), over.alpha ?? alpha(), absent(BETA_KEY, "beta-spex", "22", "git@github.com:acme/beta.git")], true),
          group("11", "acme/research", "Research", []),
          { ...namespace("ada", []), placed: [{ key: OWN_KEY, name: "ada-spex" }] },
          namespace("bob", [absent(BOB_KEY, "shared-spex", "30", "git@github.com:bob/shared.git")], false),
        ],
      }),
      instanceState(SECOND, {
        displayName: "Second Example",
        account: { id: "70", login: "ada", displayName: "Ada", canCreateGroup: false },
        groups: [namespace("ada")],
      }),
    ],
    diagnostics,
    issues: diagnostics.filter((entry) => entry.repair?.declined === undefined).length,
  });
}

/** The servers listing this computer reads: `lab-1` of `acme`. */
function listing(open = true): ServerListing {
  return { servers: [{ instance: ORIGIN, id: "1", name: "lab-1", group: "acme", open }], failures: [] };
}

const SEAT: SeatState = {
  instance: ORIGIN,
  serverId: "1",
  name: "lab-1",
  group: "acme",
  place: PLACE,
  leaseExpiresAt: NOW + 3_600_000,
  relay: "open",
  signIn: { state: "signedIn" },
};

function project(key: string, name: string): ProjectInfo {
  return { id: key, name, path: `/home/ada/.spex/projects/${key}`, registeredAt: 0, repository: { key, name: `${name}-spex`, group: "acme", own: false } };
}

/** A fake core: each command recorded and answered from `answers`. */
function fakeClient(answers: Record<string, unknown>) {
  const command = vi.fn(async (type: string, fields?: Record<string, unknown>) => {
    if (type in answers) {
      const answer = answers[type];
      return typeof answer === "function" ? (answer as (fields?: Record<string, unknown>) => unknown)(fields) : answer;
    }
    if (type === "space.join" || type === "space.sync" || type === "space.refresh") return { accepted: true };
    return {};
  });
  return {
    client: { command, subscribe: vi.fn(async () => null), unsubscribe: vi.fn(async () => null), close: vi.fn() } as never,
    command,
  };
}
type Fake = ReturnType<typeof fakeClient>;
const callsOf = (fake: Fake, type: string): unknown[] => fake.command.mock.calls.filter(([name]) => name === type).map(([, fields]) => fields);

let local: Fake;
let seat: Fake;
let seatStore: AppStore;
let state: GroupsState;
const pristine = useAppStore.getState();

async function settle(): Promise<void> {
  await act(async () => {
    for (let tick = 0; tick < 20; tick += 1) await Promise.resolve();
  });
}

beforeEach(() => {
  state = home();
  local = fakeClient({
    "space.get": () => state,
    "space.repair.decline": () => state,
    "server.list": () => listing(),
  });
  seat = fakeClient({});
  setClientForTests(local.client);
  useAppStore.setState({ connection: "open", everConnected: true, space: undefined, projects: [], seats: [SEAT] } as never);
  seatStore = createAppStore({ key: PLACE, name: "lab-1" }, seat.client);
  seatStore.setState({ connection: "open", everConnected: true, projects: [project(BETA_KEY, "beta")] });
  usePlaces.setState({ seats: [{ seat: SEAT, store: seatStore }] });
  useServerOpens.setState({ lines: {}, pending: {}, landed: 0 });
  delete (window as { spexNative?: unknown }).spexNative;
});

afterEach(() => {
  cleanup();
  usePlaces.setState({ seats: [] });
  useServerOpens.setState({ lines: {}, pending: {}, landed: 0 });
  useAppStore.setState(pristine, true);
  setClientForTests(undefined);
  delete (window as { spexNative?: unknown }).spexNative;
  activateLanguage("en");
});

/** This computer's Space surface, its servers read. */
async function renderHere(): Promise<{ onOpenProject: ReturnType<typeof vi.fn> }> {
  const onOpenProject = vi.fn();
  render(<SpaceSurface onOpenSession={vi.fn()} onOpenProject={onOpenProject} />);
  await screen.findByTestId(`space-row-${ALPHA_KEY}`);
  await screen.findByTestId(`space-server-${PLACE}`);
  return { onOpenProject };
}

/** A menu's entries' words, opened from its trigger and closed again. */
function entries(trigger: string): string[] {
  fireEvent.click(screen.getByTestId(trigger));
  const words = within(screen.getByTestId(`${trigger}-menu`))
    .getAllByRole("menuitem")
    .map((item) => item.firstElementChild?.textContent ?? "");
  fireEvent.keyDown(window, { key: "Escape" });
  return words;
}

/** Activate a menu's entry by its test id. */
function pick(trigger: string, entry: string): void {
  fireEvent.click(screen.getByTestId(trigger));
  fireEvent.click(within(screen.getByTestId(`${trigger}-menu`)).getByTestId(entry));
}

const phrase = (key: string): string => screen.getByTestId(`space-repo-state-${key}`).textContent ?? "";

/** The registry at the instance, as the core reports it
 * (core-service-143). */
function registry(over: Partial<RegistryState> = {}): RegistryState {
  return { origin: ORIGIN, displayName: "Spex Example", account: null, signIn: { phase: "idle" }, error: null, ...over };
}

describe.each(["en", "zh"] as const)("space-113: the Space surface reads as projects in groups (%s)", (language: Language) => {
  const words = WORDS[language];
  beforeEach(() => activateLanguage(language));

  test("the instance's heading and its registry line; no This computer while no row is local only", async () => {
    state = home({ gamma: false });
    local = fakeClient({
      "space.get": () => state,
      "server.list": () => listing(),
      "registry.directory": () => {
        throw new Error("unreadable");
      },
      "registry.get": (fields?: Record<string, unknown>) => registry({ origin: fields?.origin as string }),
      "registry.signin.start": (fields?: Record<string, unknown>) => ({
        flow: "device",
        userCode: "QRST-UVWX",
        verificationUri: `${fields?.origin as string}/login/device?user_code=QRST-UVWX`,
        expiresAt: NOW + 15 * MIN,
        interval: 5,
      }),
    });
    setClientForTests(local.client);
    await renderHere();
    const instance = within(screen.getByTestId(`space-instance-${ORIGIN}`));
    // [space-1] its display name beside "@ada", New group, Sign out and
    // one More holding "Remove from this list" disabled.
    expect(instance.getByRole("heading", { level: 2 }).textContent).toBe(words.heading);
    expect(instance.getByTestId("space-new-group").textContent).toBe(words.newGroup);
    expect(instance.getByTestId("space-signout").textContent).toBe(words.signOut);
    const more = instance.getByTestId("space-instance-more");
    expect(more.getAttribute("aria-label")).toBe(words.more("Spex Example"));
    fireEvent.click(more);
    const remove = within(instance.getByTestId("space-instance-more-menu")).getByTestId("space-instance-remove") as HTMLButtonElement;
    expect(within(remove).getByText(words.removeFromList)).toBeTruthy();
    expect(remove.disabled).toBe(true);
    fireEvent.keyDown(window, { key: "Escape" });
    // [space-1] Personal holds "Your sessions"; with no row local only,
    // no "This computer" stands.
    expect(within(screen.getByTestId("space-group-@ada")).getByTestId(`space-repo-${OWN_KEY}`).textContent).toBe(words.yourSessions);
    expect(screen.queryByTestId("space-own")).toBeNull();
    // [space-119] beneath the heading, "Registry" with Sign in, titled
    // for what it is for, starting the registry's sign-in at the
    // instance's origin.
    const line = await instance.findByTestId("space-registry");
    await waitFor(() => expect(line.textContent).toBe(`${words.registry}${words.signIn}`));
    const signIn = within(line).getByTestId("space-registry-signin") as HTMLButtonElement;
    expect(signIn.title).toBe(words.registryTitle);
    fireEvent.click(signIn);
    await waitFor(() => expect(callsOf(local, "registry.signin.start")).toEqual([{ origin: ORIGIN }]));
    // Signed in there, "Registry · signed in as @ada", the heading
    // unchanged and no package control on the surface.
    act(() => deliverServerMessageForTests({ type: "registry.state", state: registry({ account: { id: "7", login: "ada" } }) }));
    await waitFor(() => expect(instance.getByTestId("space-registry").textContent).toBe(words.registrySignedIn));
    expect(within(instance.getByTestId("space-registry")).queryAllByRole("button")).toEqual([]);
    expect(instance.getByRole("heading", { level: 2 }).textContent).toBe(words.heading);
    expect(screen.queryAllByRole("button").filter((button) => /package|Publish|规约包|发布/i.test(button.textContent ?? ""))).toEqual([]);
  });

  test("the headings, the group's overflow and its server's line", async () => {
    await renderHere();
    const instance = screen.getByTestId(`space-instance-${ORIGIN}`);
    // [space-1] under the instance's heading, Personal first, holding
    // your sessions, placed there.
    const personal = screen.getByTestId("space-group-@ada");
    expect(instance.contains(personal)).toBe(true);
    expect(within(personal).getAllByRole("heading", { level: 3 })[0]!.textContent).toBe(words.personal);
    expect(screen.getByTestId(`space-repo-${OWN_KEY}`).textContent).toBe(words.yourSessions);
    expect(personal.contains(screen.getByTestId(`space-row-${OWN_KEY}`))).toBe(true);
    // [space-1] acme by its name beside its member count, Research
    // nested within it, its path beside its name; bob's listing "Shared
    // by @bob".
    const acme = screen.getByTestId("space-group-acme");
    const headings = within(acme).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);
    expect(headings).toEqual([`acme · ${words.members}`, words.research]);
    expect(acme.contains(screen.getByTestId("space-group-acme/research"))).toBe(true);
    expect(within(screen.getByTestId("space-group-@bob")).getByRole("heading").textContent).toBe(words.sharedByBob);
    // [space-1] "This computer", after every Space, holds the project in
    // no group.
    const computer = screen.getByTestId("space-own");
    expect(instance.contains(computer)).toBe(false);
    expect(within(computer).getByRole("heading", { level: 2 }).textContent).toBe(words.thisComputer);
    // [space-1] acme's heading carries one "More" holding Members alone.
    expect(screen.getByTestId("space-group-more-acme").getAttribute("aria-label")).toBe(words.more("acme"));
    expect(entries("space-group-more-acme")).toEqual(words.groupActs);
    // [space-1] [run-view-170] beneath acme's heading, before its rows,
    // one line "lab-1 · Connected" with Disconnect in its overflow.
    const server = screen.getByTestId(`space-server-${PLACE}`);
    expect(screen.getByTestId("space-group-servers-acme").contains(server)).toBe(true);
    expect(server.compareDocumentPosition(screen.getByTestId(`space-row-${ALPHA_KEY}`)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(server.textContent?.startsWith(`lab-1 · ${words.connected}`)).toBe(true);
    expect(screen.getByTestId(`space-server-connected-${PLACE}`).textContent).toBe(words.connected);
    expect(entries(`space-server-more-${PLACE}`)).toEqual([words.disconnect]);
    // [space-1] the seat closed, the line reads "lab-1" with Connect.
    local.command.mockImplementation(async (type: string) =>
      type === "server.list" ? listing(false) : type === "space.get" ? state : {},
    );
    act(() => useAppStore.setState({ seats: [] }));
    await waitFor(() => expect(screen.getByTestId(`space-server-control-${PLACE}`).textContent).toBe(words.connect));
    expect(screen.queryByTestId(`space-server-connected-${PLACE}`)).toBeNull();
  });

  test("the rows: names, marks, the one phrase and the overflow, the placements' lines in the Sync tab", async () => {
    await renderHere();
    // [space-1] alpha, beta and Group sessions — never `-spex`.
    expect(screen.getByTestId(`space-repo-${ALPHA_KEY}`).textContent).toBe("alpha");
    expect(screen.getByTestId(`space-repo-${BETA_KEY}`).textContent).toBe("beta");
    expect(screen.getByTestId(`space-repo-${ACME_KEY}`).textContent).toBe(words.groupSessions);
    expect(screen.getByTestId("space-groups").textContent).not.toContain("-spex");
    // [space-1] "Here" on alpha, "On lab-1" on beta.
    expect(screen.getByTestId(`space-row-here-${ALPHA_KEY}`).textContent).toBe(words.here);
    expect(screen.queryByTestId(`space-row-here-${BETA_KEY}`)).toBeNull();
    expect(screen.getByTestId(`space-row-on-${PLACE}-${BETA_KEY}`).textContent).toBe(words.onLab);
    // [space-120] alpha's one phrase is its last sync; beta, not on this
    // computer, reads none.
    expect(phrase(ALPHA_KEY)).toBe(words.synced);
    expect(phrase(BETA_KEY)).toBe("");
    // [space-1] alpha's "More": Sync now, Members and Explore records
    // alone.
    expect(entries(`space-row-more-${ALPHA_KEY}`)).toEqual(words.rowActs);
    // [space-87] no placement's line on the row; its lines in the Sync
    // tab the row's name opens.
    const row = screen.getByTestId(`space-row-${ALPHA_KEY}`);
    expect(within(row).queryByTestId(`space-line-${ORIGIN}`)).toBeNull();
    fireEvent.click(screen.getByTestId(`space-repo-${ALPHA_KEY}`));
    const panel = await screen.findByTestId("space-repository");
    expect(within(panel).getByRole("tab", { selected: true }).getAttribute("id")).toBe("space-tab-sync");
    expect(within(within(panel).getByTestId(`space-lines-${ALPHA_KEY}`)).getByTestId(`space-line-${ORIGIN}`).textContent).toContain("Spex Example");
  });

  test("each row's Open: this computer first, then the server beside it; what each entry sends", async () => {
    const { onOpenProject } = await renderHere();
    // [space-111] alpha: "Show", "Open on lab-1" beside it.
    expect(screen.getByTestId(`space-row-open-${ALPHA_KEY}`).textContent).toBe(words.show);
    expect(entries(`space-row-places-${ALPHA_KEY}`)).toEqual([words.openOnLab]);
    // beta: "Open here", "Show on lab-1" beside it.
    expect(screen.getByTestId(`space-row-open-${BETA_KEY}`).textContent).toBe(words.openHere);
    expect(entries(`space-row-places-${BETA_KEY}`)).toEqual([words.showOnLab]);
    // acme-spex: "Open here" asking for the folder its sessions run in.
    const acmeOpen = screen.getByTestId(`space-row-open-${ACME_KEY}`);
    expect(acmeOpen.textContent).toBe(words.openHere);
    fireEvent.click(acmeOpen);
    expect(within(screen.getByTestId(`space-join-${ACME_KEY}`)).getByText(words.folderForSessions)).toBeTruthy();
    fireEvent.keyDown(screen.getByTestId(`space-join-${ACME_KEY}-path`), { key: "Escape" });
    // [space-111] "Show" shows alpha here; "Show on lab-1" shows beta at
    // the seat's place.
    fireEvent.click(screen.getByTestId(`space-row-open-${ALPHA_KEY}`));
    expect(onOpenProject).toHaveBeenLastCalledWith(ALPHA_KEY);
    pick(`space-row-places-${BETA_KEY}`, `space-row-show-at-${PLACE}-${BETA_KEY}`);
    expect(onOpenProject).toHaveBeenLastCalledWith(BETA_KEY, PLACE);
    // [space-63] "Open here" on beta sends `space.join` with the folder
    // the picker the act opens returns.
    const pickDirectory = vi.fn(async () => "/Users/ada/code/beta");
    (window as { spexNative?: unknown }).spexNative = { pickDirectory };
    fireEvent.click(screen.getByTestId(`space-row-open-${BETA_KEY}`));
    await settle();
    expect(pickDirectory).toHaveBeenCalledTimes(1);
    expect(callsOf(local, "space.join")).toEqual([{ instance: ORIGIN, hostId: "22", folder: "/Users/ada/code/beta" }]);
    expect(callsOf(seat, "space.join")).toEqual([]);
  });

  test("Open on lab-1 sends the seat's join with no folder once it is signed in, nothing while it signs in", async () => {
    act(() => useAppStore.setState({ seats: [{ ...SEAT, signIn: { state: "running", verificationUri: `${ORIGIN}/login/device?user_code=X`, expiresAt: NOW + 600_000 } }] }));
    await renderHere();
    pick(`space-row-places-${ALPHA_KEY}`, `space-row-open-at-${PLACE}-${ALPHA_KEY}`);
    await settle();
    // [space-111] the seat signs in: nothing sent yet, the row reading
    // "Opening on lab-1…"; no seat opened, one is open there.
    expect(callsOf(seat, "space.join")).toEqual([]);
    expect(callsOf(local, "server.open")).toEqual([]);
    expect(phrase(ALPHA_KEY)).toBe(words.openingOnLab);
    // Signed in: that seat's core alone is sent the join, no folder.
    act(() => useAppStore.setState({ seats: [SEAT] }));
    await settle();
    expect(callsOf(seat, "space.join")).toEqual([{ instance: ORIGIN, hostId: "21" }]);
    expect(callsOf(local, "space.join")).toEqual([]);
    expect(phrase(ALPHA_KEY)).toBe(words.openingOnLab);
    // The seat lists the project: "On lab-1".
    act(() => seatStore.setState({ projects: [project(BETA_KEY, "beta"), project(ALPHA_KEY, "alpha")] }));
    await settle();
    expect(screen.getByTestId(`space-row-on-${PLACE}-${ALPHA_KEY}`).textContent).toBe(words.onLab);
    expect(phrase(ALPHA_KEY)).toBe(words.synced);
    expect(callsOf(seat, "space.join")).toHaveLength(1);
  });

  test("a project in no group stands under This computer reading nothing, with Add to a group…, Personal first in its picker", async () => {
    await renderHere();
    // [space-61] under "This computer", no phrase.
    const computer = screen.getByTestId("space-own");
    expect(computer.contains(screen.getByTestId(`space-row-${GAMMA_KEY}`))).toBe(true);
    expect(phrase(GAMMA_KEY)).toBe("");
    expect(screen.queryByTestId(`space-row-open-${GAMMA_KEY}`)).toBeNull();
    // [space-58] its picker lists "Personal" first, then acme and
    // Research.
    const add = screen.getByTestId(`space-row-pick-${GAMMA_KEY}`);
    expect(add.textContent).toBe(words.addToGroup);
    fireEvent.click(add);
    const section = within(screen.getByTestId(`space-picker-${GAMMA_KEY}`)).getByTestId(`space-pick-instance-${ORIGIN}`);
    const options = within(section).getAllByTestId(/^space-pick-group-/).map((option) => option.textContent ?? "");
    expect(options[0]).toBe(words.personal);
    expect(options[1]).toBe("acme");
    expect(options[2]?.startsWith("Research")).toBe(true);
  });

  test("choices owed read Changed here with Resolve beneath the row, or N to send while a unit waits; records started separately Combine…", async () => {
    // [space-120] a local unit comes first: "1 to send".
    state = home({
      alpha: alpha(
        { sync: { phase: "choices", placement: ORIGIN, savedCommit: null }, conflicts: CONFLICTS, local: [SESSION] },
        { outcome: { kind: "choices", sent: 0, received: 0 }, conflicts: CONFLICTS },
      ),
    });
    await renderHere();
    expect(phrase(ALPHA_KEY)).toBe(words.toSend);
    cleanup();

    state = home({
      alpha: alpha(
        { sync: { phase: "choices", placement: ORIGIN, savedCommit: null }, conflicts: CONFLICTS },
        { outcome: { kind: "choices", sent: 0, received: 0 }, conflicts: CONFLICTS },
      ),
    });
    await renderHere();
    // [space-14] the row reads "Changed here and at Spex Example" with
    // Resolve, which shows the picker beneath the row.
    expect(phrase(ALPHA_KEY)).toBe(words.changed);
    const resolve = screen.getByTestId(`space-row-resolve-${ALPHA_KEY}`);
    expect(resolve.textContent).toBe(words.resolve);
    fireEvent.click(resolve);
    const picker = screen.getByTestId(`space-row-resolve-picker-${ALPHA_KEY}`);
    expect(screen.getByTestId(`space-row-${ALPHA_KEY}`).contains(picker)).toBe(true);
    // [space-17] its choices and fills.
    expect(within(picker).getByLabelText(new RegExp(`^${words.keepHere}`))).toBeTruthy();
    expect(within(picker).getByLabelText(new RegExp(`^${words.take}`))).toBeTruthy();
    expect(within(picker).getByRole("button", { name: words.allHere })).toBeTruthy();
    expect(within(picker).getByRole("button", { name: words.allTake })).toBeTruthy();
    cleanup();

    // [space-13] records started separately read "Started separately at
    // Spex Example" with "Combine…", confirmed inline, the join of that
    // placement sent on Combine.
    state = home({ alpha: alpha({ sync: { phase: "unrelated", placement: ORIGIN } }, { outcome: { kind: "unrelated", sent: 0, received: 0 } }) });
    await renderHere();
    expect(phrase(ALPHA_KEY)).toBe(words.apart);
    const combine = screen.getByTestId(`space-row-combine-${ALPHA_KEY}`);
    expect(combine.textContent).toBe(words.combine);
    fireEvent.click(combine);
    const confirm = screen.getByTestId(`space-row-combine-confirm-${ALPHA_KEY}`);
    expect(callsOf(local, "space.sync")).toEqual([]);
    fireEvent.click(within(confirm).getByRole("button", { name: words.combineConfirm }));
    await settle();
    expect(callsOf(local, "space.sync")).toEqual([{ repository: ALPHA_KEY, placement: ORIGIN, join: true }]);
  });

  test("a repair names the project and its group, the folder beneath; Not on this computer declines it", async () => {
    state = home({
      diagnostics: [
        {
          file: "workspace/@spex.example/acme/delta-spex",
          reason: "no working folder",
          blocking: false,
          repair: {
            kind: "repository",
            repository: "@spex.example/acme/delta-spex",
            name: "delta-spex",
            group: "acme",
            directories: ["/Users/ada/code/delta"],
            sessions: 3,
            key: "repair-delta",
            checked: [{ path: "/Users/ada/code/delta", here: true, repo: true }],
            proposal: { path: "/Users/ada/code/delta", from: "recorded" },
          },
        },
      ],
    });
    await renderHere();
    fireEvent.click(screen.getByTestId("space-issues"));
    const repair = screen.getByTestId("space-repair");
    // [space-46] "<project> · acme — Folder missing on this computer",
    // the folder beneath it.
    expect(within(repair).getByTestId("space-repair-title").textContent).toBe(words.repair);
    expect(within(repair).getByTestId("space-repair-folder").textContent).toBe(words.repairFolder);
    // [space-47] "Use <folder>" where the core proposes one.
    expect(within(repair).getByTestId("space-repair-use").textContent).toBe(words.use);
    // [space-47] [space-49] "Choose folder…" and "Not on this computer",
    // declining sending `space.repair.decline`.
    expect(within(repair).getByTestId("space-repair-choose").textContent).toBe(words.chooseFolder);
    const decline = within(repair).getByTestId("space-repair-decline");
    expect(decline.textContent).toBe(words.notHere);
    fireEvent.click(decline);
    await settle();
    expect(callsOf(local, "space.repair.decline")).toEqual([{ repair: "repair-delta", declined: true }]);
  });

  test("at the seat's place the surface names the server", async () => {
    // The seat's Space: beta not there, alpha owing choices.
    const seatState = groupsState({
      home: HOME,
      defaultInstance: ORIGIN,
      own: { name: "ada", named: false, repositories: [] },
      instances: [
        instanceState(ORIGIN, {
          displayName: "Spex Example",
          account: { id: "7", login: "ada", displayName: "Ada", canCreateGroup: false },
          groups: [
            group("10", "acme", "acme", [
              alpha(
                { sync: { phase: "choices", placement: ORIGIN, savedCommit: null }, conflicts: CONFLICTS },
                { outcome: { kind: "choices", sent: 0, received: 0 }, conflicts: CONFLICTS },
              ),
              absent(BETA_KEY, "beta-spex", "22", "git@github.com:acme/beta.git"),
            ]),
          ],
        }),
      ],
    });
    seat.command.mockImplementation(async (type: string) => (type === "space.get" ? seatState : {}));
    render(
      <PlaceStoreContext.Provider value={seatStore}>
        <SpaceSurface onOpenSession={vi.fn()} onOpenProject={vi.fn()} />
      </PlaceStoreContext.Provider>,
    );
    await screen.findByTestId(`space-row-${BETA_KEY}`);
    // [space-112] "Not on lab-1".
    fireEvent.click(screen.getByTestId(`space-repo-${BETA_KEY}`));
    expect(within(await screen.findByTestId("space-repository")).getAllByText(words.notOnLab).length).toBeGreaterThan(0);
    // "Keep lab-1's".
    fireEvent.click(screen.getByTestId(`space-row-resolve-${ALPHA_KEY}`));
    const picker = screen.getByTestId(`space-row-resolve-picker-${ALPHA_KEY}`);
    expect(within(picker).getByLabelText(new RegExp(`^${words.keepOnLab}`))).toBeTruthy();
    // Apply's confirm, every choice keeping the seat's side, names it.
    fireEvent.click(within(picker).getByTestId("space-all-mine"));
    fireEvent.click(within(picker).getByTestId("space-apply"));
    expect(within(picker).getByTestId("space-apply-confirm").textContent).toContain(words.keepLabVersion);
    fireEvent.keyDown(within(picker).getByRole("button", { name: words.cancel }), { key: "Escape" });
    // The Sync tab's To send list names it.
    fireEvent.click(screen.getByTestId(`space-repo-${ALPHA_KEY}`));
    const panel = await screen.findByTestId("space-repository");
    expect(within(panel).getByText(words.nothingFromLab)).toBeTruthy();
    // The instance's Sign out names it in its title.
    expect(screen.getByTestId("space-signout").getAttribute("title")).toBe(words.signOutLab);
    // "Spex keeps lab-1's files in <home>".
    expect(screen.getByTestId("space-home").textContent).toBe(words.labFiles);
    // No server's line at a seat's place: the seats are this computer's.
    expect(document.querySelector('[data-testid^="space-server-"]')).toBeNull();
    cleanup();

    // Signed in nowhere there, the sign-in card reads its title and no
    // sentence (space-3).
    seat.command.mockImplementation(async (type: string) =>
      type === "space.get" ? groupsState({ home: HOME, defaultInstance: ORIGIN }) : {},
    );
    render(
      <PlaceStoreContext.Provider value={seatStore}>
        <SpaceSurface onOpenSession={vi.fn()} onOpenProject={vi.fn()} />
      </PlaceStoreContext.Provider>,
    );
    const card = await screen.findByTestId("space-signin-card");
    expect(within(card).getByRole("heading", { level: 2 }).textContent).toBe(words.signInTitle);
    expect(card.querySelector("p")).toBeNull();
  });

  test("every new control reads at most 14 characters", async () => {
    state = home({
      alpha: alpha(
        { sync: { phase: "choices", placement: ORIGIN, savedCommit: null }, conflicts: CONFLICTS },
        { outcome: { kind: "choices", sent: 0, received: 0 }, conflicts: CONFLICTS },
      ),
    });
    await renderHere();
    // [space-28] the controls a row, a heading or a server's line shows;
    // a menu's entries read in full within it, and "Add to a group…" is
    // a whole phrase a decision fixes.
    const controls = [...screen.getByTestId("space-groups").querySelectorAll("button")]
      .filter((button) => button.getAttribute("role") !== "menuitem")
      .map((button) => (button.getAttribute("aria-haspopup") ? (button.textContent ?? "").replace(/^⋯/, "") : button.textContent ?? ""))
      .filter((text) => !(words.exempt as readonly string[]).includes(text));
    for (const text of controls) expect([...text].length, text).toBeLessThanOrEqual(14);
    expect(controls).toContain(words.resolve);
  });
});
