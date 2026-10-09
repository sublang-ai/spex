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
  RepositoryState,
  SpaceConflict,
  SpaceEntry,
  SpaceReadResult,
  SpaceUnit,
} from "@sublang/spex-core/protocol";

import { SpaceSurface } from "../components/SpaceSurface.js";
import { deliverServerMessageForTests, setClientForTests, useAppStore } from "../state/store.js";

export const NOW = Date.now();
export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const HOME = "/Users/jane/.spex";
/** The project's spex repository the tests open, by its key. */
export const KEY = "jane/academy-spex";
/** Your own group's spex repository. */
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

export const BRANCH: NonNullable<RepositoryState["branch"]> = {
  ahead: 2,
  behind: 1,
  checkedAt: NOW - 5 * MIN,
  hostEmpty: false,
  unrelated: false,
  mergePending: false,
};

/** The opened project's spex repository, reachable, nothing changed. */
export function repo(over: Partial<RepositoryState> = {}): RepositoryState {
  return {
    key: KEY,
    name: "academy-spex",
    id: "42",
    own: false,
    remote: "https://gitlab.example/jane/academy-spex.git",
    code: "https://jane@github.com/jane/academy.git",
    folder: "/Users/jane/code/academy",
    state: "reachable",
    reason: null,
    waiting: null,
    members: 1,
    visibility: "private",
    branch: BRANCH,
    local: [],
    incoming: [],
    conflicts: [],
    lastSync: null,
    noticed: true,
    records: "project",
    choice: null,
    sync: { phase: "idle" },
    ...over,
  };
}

/** Your own group's spex repository, on the host. */
export const OWN_REPO: RepositoryState = repo({
  key: OWN,
  name: "jane-spex",
  id: "7",
  own: true,
  records: "group",
  remote: "https://gitlab.example/jane/jane-spex.git",
  code: null,
  folder: null,
  branch: null,
  lastSync: { at: NOW - 3 * HOUR, sent: 1, received: 0 },
});

/** A signed-in home: your own group with its own spex repository
 * first, then the given ones. */
export function base(over: Partial<GroupsState> = {}, repos: RepositoryState[] = [repo()]): GroupsState {
  return {
    home: HOME,
    git: { ok: true, version: "2.45.0" },
    host: { url: "https://gitlab.example", displayName: "GitLab" },
    account: { id: "7", login: "jane", displayName: "Jane" },
    signIn: { phase: "idle" },
    readAt: NOW - MIN,
    groups: [
      { id: "1", fullPath: "jane", name: "jane", url: null, own: true, repositories: [OWN_REPO, ...repos] },
    ],
    diagnostics: [],
    // The core carries the count (space-1); the fixture derives it the
    // same way, so a test state can never claim an impossible pair.
    issues: 0,
    ...over,
    ...(over.diagnostics
      ? { issues: over.issues ?? over.diagnostics.filter((d) => d.repair?.declined === undefined).length }
      : {}),
  };
}

/** The opened repository with local changes of every kind, listed out
 * of order so the grouping is what orders them. */
export function repoState(over: Partial<RepositoryState> = {}, home: Partial<GroupsState> = {}): GroupsState {
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
    { name: "s2.json", path: "sessions/s2.json", kind: "file", family: "session manifest", sync: "pending", size: 900, owner: owner("s2", "Draft the release notes"), preview: "text" },
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
      return home.current;
    case "space.refresh":
    case "space.fetch":
    case "space.sync":
    case "space.pick":
    case "space.join":
      return { accepted: true };
    case "space.cancel":
    case "space.signin.cancel":
      return { stopped: true };
    case "space.signin.start":
      return { flow: "browser", url: "https://gitlab.example/login/app?client_id=spex&state=s" };
    case "space.members":
      return {
        members: [
          { id: "7", login: "jane", displayName: "Jane", role: "Owner", url: null },
          { id: "8", login: "bob", displayName: null, role: "Developer", url: null },
        ],
        membersUrl: "https://gitlab.example/jane/academy-spex/-/project_members",
      };
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
