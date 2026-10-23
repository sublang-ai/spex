// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Groups surface's test home (DR-103): a signed-in home with your
// own group holding its own spex repository and one project's, the
// units of every kind a Sync tab lists, an explorer tree and its reads,
// and a mocked protocol client answering every `space.*` command the
// surface sends — so the surface tests render it as the core would
// feed it, and read back exactly what it asked.

import { vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type {
  GroupsState,
  HostMemberInfo,
  InstanceGroupState,
  InstanceState,
  PlacementBranch,
  PlacementState,
  RepositoryState,
  SpaceConflict,
  SpaceEntry,
  SpaceReadResult,
  SpaceUnit,
} from "@sublang/spex-core/protocol";

import { SpaceSurface } from "../components/SpaceSurface.js";
import { deliverServerMessageForTests, setClientForTests, useAppStore } from "../state/store.js";
import { NO_CAN, namespace, placementState, rowOf, type RowOver } from "./groups-state.js";

export { NO_CAN, namespace, placementState, type RowOver } from "./groups-state.js";

export const NOW = Date.now();
export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const HOME = "/Users/jane/.spex";
/** The project's spex repository the tests open, by its key: its path
 * at the instance, under the instance's folder (DR-127). */
export const KEY = "@spex.example/jane/academy-spex";
/** The instance the fixtures' home lists first: its default. */
export const ORIGIN = "https://spex.example";
/** A second instance, which a home lists after the first. */
export const SECOND = "https://second.example";
/** Your own group's spex repository, in your own group's folder. */
export const OWN = "jane/jane-spex";
export const CLONE = `${HOME}/workspace/${KEY}`;

export const INTENT_ID = "0b6f7c1e-2d3a-4b5c-8d9e-0f1a2b3c4d5e";

export const SESSION_UNIT: SpaceUnit = {
  unit: "sessions/s1",
  kind: "session",
  label: "Fix the login redirect",
  detail: "12 turns",
  change: "updated",
  sessionId: "s1",
  paths: ["sessions/s1.json", "sessions/s1.records.jsonl"],
  diff: false,
};
export const DELETED_SESSION: SpaceUnit = {
  ...SESSION_UNIT,
  unit: "sessions/s9",
  label: "An old thread",
  change: "deleted",
  sessionId: "s9",
  paths: ["sessions/s9.json", "sessions/s9.records.jsonl"],
};
export const INTENT_UNIT: SpaceUnit = {
  unit: `intents/${INTENT_ID}`,
  kind: "intent",
  label: "Tighten the expiry tests",
  change: "new",
  intentId: INTENT_ID,
  paths: [`intents/${INTENT_ID}.json`],
  diff: false,
};
export const AUTHORING_UNIT: SpaceUnit = {
  unit: "authoring/triage",
  kind: "authoring",
  label: "Triage incoming issues",
  detail: "4 turns",
  change: "updated",
  paths: ["authoring/triage.json", "authoring/triage.records.jsonl"],
  diff: false,
};
export const ENVIRONMENT_UNIT: SpaceUnit = {
  unit: "environment",
  kind: "environment",
  label: "Spec packages changed",
  change: "updated",
  paths: ["spex.yaml", "spex.lock"],
  diff: true,
};
export const SETTINGS_UNIT: SpaceUnit = {
  unit: "config/playbook.config.yaml",
  kind: "settings",
  label: "Settings changed",
  change: "updated",
  paths: ["config/playbook.config.yaml"],
  diff: true,
};
export const CODE_UNIT: SpaceUnit = {
  unit: "project.json",
  kind: "code",
  label: "Code remote changed",
  change: "updated",
  paths: ["project.json"],
  diff: true,
};
export const RULES_UNIT: SpaceUnit = {
  unit: ".gitignore",
  kind: "rules",
  label: "Sync rules updated",
  change: "updated",
  paths: [".gitignore"],
  diff: true,
};
export const OTHER_UNIT: SpaceUnit = {
  unit: "notes.txt",
  kind: "other",
  label: "notes.txt",
  change: "new",
  paths: ["notes.txt"],
  diff: true,
};
export const INCOMING_SESSION: SpaceUnit = {
  ...SESSION_UNIT,
  unit: "sessions/s2",
  label: "Draft the release notes",
  detail: "9 turns",
  sessionId: "s2",
  paths: ["sessions/s2.json", "sessions/s2.records.jsonl"],
};
export const INCOMING_INTENT: SpaceUnit = {
  ...INTENT_UNIT,
  unit: "intents/1c2d3e4f-5a6b-4c7d-8e9f-a0b1c2d3e4f5",
  intentId: "1c2d3e4f-5a6b-4c7d-8e9f-a0b1c2d3e4f5",
  label: "Ship the docs",
  paths: ["intents/1c2d3e4f-5a6b-4c7d-8e9f-a0b1c2d3e4f5.json"],
};

/** The pending merge the core folds into the diagnostics (space-1). */
export const MERGE_DIAGNOSTIC = {
  file: `workspace/${KEY}/.git/MERGE_HEAD`,
  reason: "a Git merge is pending; finish or abort it in a terminal before syncing",
  blocking: false,
};

export const CONFLICTS: SpaceConflict[] = [
  {
    unit: SESSION_UNIT,
    mine: { change: "updated", at: NOW - 2 * HOUR, detail: "12 turns", diff: false },
    remote: { change: "updated", at: NOW - 5 * HOUR, detail: "9 turns", diff: false },
  },
  {
    unit: SETTINGS_UNIT,
    mine: { change: "updated", at: NOW - 24 * HOUR, diff: true },
    remote: { change: "updated", at: NOW - 3 * HOUR, diff: true },
  },
];

export const BRANCH: PlacementBranch = {
  ahead: 2,
  behind: 1,
  checkedAt: NOW - 5 * MIN,
  hostEmpty: false,
  unrelated: false,
  agreed: null,
};

/** The opened project's placement at the fixtures' instance, held and
 * reachable, its only member the account, nothing synced since its
 * check, unless a test says otherwise (space-30, space-87). */
export function placement(over: Partial<PlacementState> = {}): PlacementState {
  return placementState({
    instance: ORIGIN,
    path: "jane/academy-spex",
    id: "42",
    members: 1,
    visibility: "private",
    branch: BRANCH,
    noticed: true,
    ...over,
  });
}

/** The opened project's spex repository, reachable, nothing changed,
 * governed by its instance — by none while local only — unless a test
 * says otherwise (space-30): what a test says of its key placement is
 * that placement's line, as `rowOf` routes it. */
export function repo(over: RowOver = {}): RepositoryState {
  const instance = over.instance === undefined ? ORIGIN : over.instance;
  return rowOf({
    key: KEY,
    instance,
    governing: over.state === "local-only" ? null : instance,
    name: "academy-spex",
    id: "42",
    own: false,
    // A remote at the host reads as its path in the instance (space-30).
    remote: "jane/academy-spex",
    code: "https://jane@github.com/jane/academy.git",
    folder: "/Users/jane/code/academy",
    state: "reachable",
    reason: null,
    mergePending: false,
    placedAt: [],
    waiting: null,
    members: 1,
    visibility: "private",
    branch: BRANCH,
    local: [],
    incoming: [],
    conflicts: [],
    lastSync: null,
    noticed: true,
    sync: { phase: "idle" },
    can: { manageMembers: false, transfer: false },
    ...over,
  });
}

/** Your own group's spex repository, on the host, as a test says
 * otherwise of it. */
export function ownRepo(over: RowOver = {}): RepositoryState {
  return repo({
    key: OWN,
    name: "jane-spex",
    id: "7",
    own: true,
    remote: OWN,
    code: null,
    folder: null,
    branch: null,
    lastSync: { at: NOW - 3 * HOUR, sent: 1, received: 0 },
    ...over,
  });
}

/** Your own group's spex repository, on the host. */
export const OWN_REPO: RepositoryState = ownRepo();

/** The host's own roles in its order, Developer upward may push
 * (DR-114): what a host read brings. */
export const ROLES: InstanceState["roles"] = [
  { id: "10", name: "Guest", mayPush: false },
  { id: "20", name: "Reporter", mayPush: false },
  { id: "30", name: "Developer", mayPush: true },
  { id: "40", name: "Maintainer", mayPush: true },
  { id: "50", name: "Owner", mayPush: true },
];

/** The fixtures' instance: signed in as jane with a read held a minute
 * ago, your namespace there empty unless a test says otherwise. */
export function instance(over: Partial<InstanceState> = {}): InstanceState {
  return {
    origin: ORIGIN,
    host: "spex.example",
    displayName: "Spex Example",
    account: { id: "7", login: "jane", displayName: "Jane", canCreateGroup: false },
    signedIn: true,
    hostSignedOut: false,
    read: { phase: "idle" },
    readAt: NOW - MIN,
    roles: ROLES,
    groups: [namespace("jane")],
    ...over,
  };
}

/** What a test says of a home: its fields, and `instance`, merged into
 * the default instance. */
export type HomeOver = Partial<GroupsState> & { instance?: Partial<InstanceState> };

/** A signed-in home: your own group with its own spex repository, then
 * the instance with the given ones in your namespace there (space-30). */
export function base(over: HomeOver = {}, repos: RepositoryState[] = [repo()]): GroupsState {
  const { instance: at, ...rest } = over;
  return {
    home: HOME,
    git: { ok: true, version: "2.45.0" },
    defaultInstance: ORIGIN,
    signIn: { phase: "idle" },
    // Signed in, your own group's folder bears the login (space-59).
    own: { name: "jane", named: false, repositories: [OWN_REPO] },
    instances: [instance({ groups: [namespace("jane", repos)], ...at })],
    diagnostics: [],
    // The core carries the count (space-1); the fixture derives it the
    // same way, so a test state can never claim an impossible pair.
    issues: 0,
    ...rest,
    ...(rest.diagnostics
      ? { issues: rest.issues ?? rest.diagnostics.filter((d) => d.repair?.declined === undefined).length }
      : {}),
  };
}

/** A home with its default instance changed as a test says. */
export function withInstance(state: GroupsState, over: Partial<InstanceState>): GroupsState {
  return {
    ...state,
    instances: state.instances.map((entry) => (entry.origin === state.defaultInstance ? { ...entry, ...over } : entry)),
  };
}

/** A home whose default instance lists more groups after its own. */
export function withGroups(state: GroupsState, ...groups: InstanceGroupState[]): GroupsState {
  const served = state.instances.find((entry) => entry.origin === state.defaultInstance);
  return withInstance(state, { groups: [...(served?.groups ?? []), ...groups] });
}

/** A home that lists no instance: your own group alone, its folder
 * still bearing this device's user name, its own spex repository on this
 * device only, beside the given rows. */
export function noInstance(over: Partial<GroupsState> = {}, repos: RepositoryState[] = []): GroupsState {
  const own = ownRepo({ state: "local-only", remote: null, id: null, lastSync: null });
  return base({ instances: [], own: { name: "jane", named: true, repositories: [own, ...repos] }, ...over });
}

/** A home signed out of the instance at `origin`, its entry kept with
 * its account; `byHost` where that instance signed this device out
 * (space-3). A row that instance governed is governed by none, as the
 * core says while no signed-in instance lists it (space-30). */
export function signedOutAt(origin: string, options: { byHost?: boolean } = {}, state: GroupsState = base()): GroupsState {
  const ungoverned = (rows: RepositoryState[]): RepositoryState[] =>
    rows.map((row) => (row.governing === origin ? { ...row, governing: null } : row));
  return {
    ...state,
    own: { ...state.own, repositories: ungoverned(state.own.repositories) },
    instances: state.instances.map((entry) => ({
      ...entry,
      ...(entry.origin === origin ? { signedIn: false, hostSignedOut: options.byHost ?? false, read: { phase: "idle" as const } } : {}),
      groups: entry.groups.map((group) => ({ ...group, repositories: ungoverned(group.repositories) })),
    })),
  };
}

/** A home signed in to the fixtures' instance and to a second one after
 * it, displayed "Second Example", where you are signed in as jada. */
export function twoInstances(over: HomeOver = {}, repos: RepositoryState[] = [repo()]): GroupsState {
  const home = base(over, repos);
  return {
    ...home,
    instances: [
      ...home.instances,
      instance({
        origin: SECOND,
        host: "second.example",
        displayName: "Second Example",
        account: { id: "70", login: "jada", displayName: "Jada", canCreateGroup: false },
        groups: [namespace("jada")],
      }),
    ],
  };
}

/** The project at the first instance alone, whose placement file names
 * a repository the second lists (space-95). */
export const BETA = "@spex.example/jane/beta-spex";
/** A project on this device only, in your own group's folder. */
export const GAMMA = "jane/gamma-spex";
/** A group's own spex repository at the first instance. */
export const ACME = "@spex.example/acme/acme-spex";

/**
 * A home signed in to two instances, as space-95 arranges it (DR-128):
 * the opened project placed at both — its key placement at the first in
 * your namespace, its second in the second's `workshop`, whose listing
 * names it as placed there; a project at the first alone whose placement
 * file names a repository the second's `workshop` lists, with two
 * members; a local-only project; a group's own spex repository in the
 * first's `acme`; and your own group's own repository placed at both,
 * which each namespace lists. `placedAt` is what the files say.
 */
export function twoPlacementsHome(): GroupsState {
  const may = { manageMembers: true, transfer: true };
  const academy = repo({
    placedAt: [ORIGIN, SECOND],
    lastSync: { at: NOW - 5 * MIN, sent: 1, received: 0 },
    can: may,
    placements: [
      placement({ lastSync: { at: NOW - 5 * MIN, sent: 1, received: 0 }, can: may }),
      placementState({
        instance: SECOND,
        path: "workshop/academy-spex",
        id: "52",
        members: 2,
        visibility: "private",
        branch: { ...BRANCH, ahead: 0, behind: 0 },
        noticed: true,
        lastSync: { at: NOW - HOUR, sent: 0, received: 1 },
        can: may,
      }),
    ],
  });
  const beta = repo({
    key: BETA,
    name: "beta-spex",
    id: "43",
    remote: "jane/beta-spex",
    code: "https://github.com/jane/beta.git",
    folder: "/Users/jane/code/beta",
    placedAt: [ORIGIN, SECOND],
    lastSync: { at: NOW - 2 * HOUR, sent: 2, received: 0 },
    can: may,
    placements: [
      placement({ path: "jane/beta-spex", id: "43", lastSync: { at: NOW - 2 * HOUR, sent: 2, received: 0 }, can: may }),
      placementState({
        instance: SECOND,
        path: "workshop/beta-spex",
        id: "53",
        attached: false,
        state: "absent",
        members: 2,
        visibility: "private",
      }),
    ],
  });
  const gamma = repo({
    key: GAMMA,
    name: "gamma-spex",
    instance: null,
    id: null,
    remote: null,
    code: "https://github.com/jane/gamma.git",
    folder: "/Users/jane/code/gamma",
    state: "local-only",
    branch: null,
    members: null,
    visibility: null,
  });
  const acme = repo({
    key: ACME,
    name: "acme-spex",
    id: "60",
    remote: "acme/acme-spex",
    code: null,
    folder: null,
    members: 3,
    lastSync: { at: NOW - 4 * HOUR, sent: 0, received: 2 },
    placedAt: [ORIGIN],
  });
  const own = ownRepo({
    placedAt: [ORIGIN, SECOND],
    placements: [
      placement({ path: OWN, id: "7", branch: null, lastSync: { at: NOW - 3 * HOUR, sent: 1, received: 0 } }),
      placementState({
        instance: SECOND,
        path: "jada/jada-spex",
        id: "71",
        members: 1,
        visibility: "private",
        noticed: true,
        lastSync: { at: NOW - 3 * HOUR, sent: 1, received: 0 },
      }),
    ],
  });
  const home = twoInstances({}, [academy, beta]);
  const [first, second] = home.instances;
  const ownPlaced = [{ key: OWN, name: "jane-spex" }];
  return {
    ...home,
    own: { ...home.own, repositories: [own, gamma] },
    instances: [
      {
        ...first!,
        groups: [
          { id: "3", login: null, mine: false, fullPath: "acme", name: "Acme", can: NO_CAN, placed: [], repositories: [acme] },
          { ...namespace("jane", [academy, beta]), placed: ownPlaced },
        ],
      },
      {
        ...second!,
        groups: [
          {
            id: "81",
            login: null,
            mine: false,
            fullPath: "workshop",
            name: "Workshop",
            can: NO_CAN,
            placed: [
              { key: KEY, name: "academy-spex" },
              { key: BETA, name: "beta-spex" },
            ],
            repositories: [],
          },
          { ...namespace("jada"), placed: ownPlaced },
        ],
      },
    ],
  };
}

/** The opened repository with local changes of every kind, listed out
 * of order so the grouping is what orders them. */
export function repoState(over: RowOver = {}, home: HomeOver = {}): GroupsState {
  return base(home, [
    repo({
      local: [OTHER_UNIT, SETTINGS_UNIT, SESSION_UNIT, RULES_UNIT, INTENT_UNIT, CODE_UNIT, ENVIRONMENT_UNIT, AUTHORING_UNIT, DELETED_SESSION],
      incoming: [INCOMING_SESSION, INCOMING_INTENT],
      lastSync: { at: NOW - 2 * HOUR, sent: 3, received: 1 },
      ...over,
    }),
  ]);
}

const owner = (sessionId: string, title: string) => ({ sessionId, title });

export const TREE: Record<string, SpaceEntry[]> = {
  "": [
    { name: "sessions", path: "sessions", kind: "dir", family: "Not a Spex folder", sync: "shared", count: 4, preview: "none" },
    { name: "intents", path: "intents", kind: "dir", family: "Not a Spex folder", sync: "pending", count: 0, preview: "none" },
    { name: "packages", path: "packages", kind: "dir", family: "installed spec packages", sync: "local", count: 1, preview: "none" },
    { name: "placements", path: "placements", kind: "dir", family: "placement", sync: "shared", count: 1, preview: "none" },
    { name: "spex.yaml", path: "spex.yaml", kind: "file", family: "spec package requests", sync: "local", size: 512, preview: "text" },
    { name: "project.json", path: "project.json", kind: "file", family: "code remote", sync: "shared", size: 4200, preview: "text" },
    { name: "README.md", path: "README.md", kind: "file", family: "Not a Spex file", sync: "pending", size: 300, preview: "text" },
    { name: "notes.bin", path: "notes.bin", kind: "file", family: "Not a Spex file", sync: "pending", size: 9000, preview: "binary" },
    { name: ".git", path: ".git", kind: "git", family: "Git data", sync: "git", preview: "none" },
  ],
  sessions: [
    { name: "s1.json", path: "sessions/s1.json", kind: "file", family: "session manifest", sync: "shared", size: 4100, owner: owner("s1", "Fix the login redirect"), preview: "text" },
    { name: "s1.records.jsonl", path: "sessions/s1.records.jsonl", kind: "file", family: "session records", sync: "shared", size: 310_000, owner: owner("s1", "Fix the login redirect"), preview: "text" },
    { name: "s1.hints.json", path: "sessions/s1.hints.json", kind: "file", family: "provider hints", sync: "local", size: 100, owner: owner("s1", "Fix the login redirect"), preview: "withheld" },
    { name: "s1.chunks", path: "sessions/s1.chunks", kind: "dir", family: "session chunks", sync: "shared", count: 1, owner: owner("s1", "Fix the login redirect"), preview: "none" },
    { name: "s2.json", path: "sessions/s2.json", kind: "file", family: "session manifest", sync: "pending", size: 900, owner: owner("s2", "Draft the release notes"), preview: "text" },
  ],
  // The placement's file at the fixtures' instance (storage-36): its
  // folder is the instance's, and it names nothing of the Git system.
  placements: [
    { name: "@spex.example.yaml", path: "placements/@spex.example.yaml", kind: "file", family: "placement", sync: "shared", size: 52, preview: "text" },
  ],
  "sessions/s1.chunks": [
    { name: "a".repeat(64), path: `sessions/s1.chunks/${"a".repeat(64)}`, kind: "file", family: "session chunks", sync: "shared", size: 128, owner: owner("s1", "Fix the login redirect"), preview: "binary" },
  ],
};

export const READS: Record<string, SpaceReadResult> = {
  "project.json": { kind: "text", text: '{"format":1,"remote":"git@github.com:jane/academy.git"}', lines: 1, truncated: false },
  "sessions/s1.records.jsonl": {
    kind: "text",
    text: '{"type":"turn_started"}\n{"type":"player_prompt"}\n{"type":"turn_finished"}\n',
    lines: 3,
    truncated: false,
  },
  "sessions/s1.json": { kind: "text", text: '{"kind":"captain-session"}', lines: 1, truncated: false },
  "README.md": { kind: "text", text: "# Hello\n\nSome *text*", lines: 3, truncated: false },
  "spex.yaml": { kind: "text", text: "packages: {}", lines: 2000, truncated: true },
  // A read the core withheld, its reason composed in the home's
  // language (localization-11): the kind is what the page reads.
  "sessions/s2.json": { kind: "withheld", reason: "可能包含提供方令牌——不予显示" },
};

/** The members the host lists: the repository's own two. */
export const MEMBERS: HostMemberInfo[] = [
  { id: "7", login: "jane", displayName: "Jane", role: "Owner", direct: true, via: null },
  { id: "8", login: "bob", displayName: null, role: "Developer", direct: true, via: null },
];

/** What `space.get` answers: the tests set it, and a handler may move
 * it as the core would. */
export const home: { current: GroupsState } = { current: base() };

export const commandMock = vi.fn();

/** The fields of every call of one command, in order. */
export function calls(type: string): Record<string, unknown>[] {
  return commandMock.mock.calls
    .filter(([name]) => name === type)
    .map(([, fields]) => fields as Record<string, unknown>);
}

/** The core's answers to every command the surface sends. */
export async function answer(type: string, fields: Record<string, unknown> = {}): Promise<unknown> {
  switch (type) {
    case "space.get":
    case "space.repair.decline":
    case "space.signout":
    case "space.forget":
      return home.current;
    case "space.refresh":
    case "space.fetch":
    case "space.sync":
    case "space.pick":
    case "space.place":
    case "space.join":
    case "space.attach":
    case "space.leave":
      return { accepted: true };
    case "space.cancel":
    case "space.signin.cancel":
      return { stopped: true };
    case "space.signin.start":
      return { flow: "browser", url: "https://spex.example/login/app?client_id=spex&state=s" };
    case "space.members":
      return { members: MEMBERS };
    case "space.group.create":
      return { group: { id: "90", fullPath: fields.path as string, name: fields.name as string } };
    case "space.share": {
      // The host lists the account it added at the role it was given.
      const role = ROLES.find((entry) => entry.id === fields.role)?.name ?? (fields.role as string);
      const login = fields.login as string;
      return {
        members: [...MEMBERS, { id: "9", login, displayName: null, role, direct: true, via: null }],
      };
    }
    case "space.unshare":
      return { members: MEMBERS.filter((member) => member.login !== fields.login) };
    case "space.diff":
      return {
        patch: `--- a/${fields.path}\n+++ b/${fields.path}\n@@ -1 +1 @@\n-old: 1\n+new: 2\n`,
        truncated: false,
      };
    case "space.tree":
      return { path: (fields.path as string | undefined) ?? "", entries: TREE[(fields.path as string | undefined) ?? ""] ?? [] };
    case "space.read":
      return READS[fields.path as string] ?? { kind: "text", text: "x", lines: 1, truncated: false };
    default:
      return {};
  }
}

/** Before each test: the mocked client, the store's Groups slice
 * cleared, no clipboard and no native bridge. */
export function installClient(): void {
  commandMock.mockReset();
  commandMock.mockImplementation(answer);
  setClientForTests({ command: commandMock, subscribe: vi.fn(async () => null) } as never);
  useAppStore.setState({
    connection: "open",
    space: undefined,
    spaceError: undefined,
    spaceReadAt: undefined,
    spaceChangeSeq: 0,
    spacePrivacyCollapsed: true,
    spaceSplit: 40,
    sessions: [],
    views: {},
    projects: [],
  } as never);
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
  delete (window as { spexNative?: unknown }).spexNative;
}

/** Render the surface over a home; unless told otherwise, open the
 * tested repository's row, which brings its tabs beneath the list. */
export async function renderGroups(state: GroupsState, options: { open?: boolean } = {}) {
  home.current = state;
  const onOpenSession = vi.fn<(sessionId: string) => void>();
  const onOpenProject = vi.fn<(projectId: string) => void>();
  const view = render(<SpaceSurface onOpenSession={onOpenSession} onOpenProject={onOpenProject} />);
  await screen.findByTestId("space-header");
  if (options.open !== false && state.git.ok) {
    fireEvent.click(screen.getByTestId(`space-repo-${KEY}`));
    await screen.findByTestId("space-repository");
  }
  return { onOpenSession, onOpenProject, view };
}

/** The core's broadcast of a new state (space-29). */
export function deliver(state: GroupsState): void {
  home.current = state;
  act(() => deliverServerMessageForTests({ type: "space.state", state }));
}

/** The surface's polite live region. */
export const live = (): string => screen.getByTestId("space-live").textContent ?? "";

/** Words the surface never shows (space-27): Git's own for a sync's
 * sides, and "space" or "namespace" for the host's things. */
export const GIT_WORDS = /\b(ours|theirs|HEAD|origin\/main|origin\/spex|MERGE_HEAD)\b/;
export const HOST_WORDS = /\b(space|namespace)\b/i;
/** "remote" says only what space-7 and space-23 name it for: the
 * code's remote, never the host's things. */
export function strayRemote(text: string): boolean {
  return /\bremote\b/i.test(text.replace(/code remote|code not on a remote/gi, ""));
}
