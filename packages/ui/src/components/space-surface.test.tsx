// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Space surface over a mocked client (DR-057, DR-103): the home's
// header and the groups list with each spex repository's row and state
// (space-1, space-61), the event-driven re-read (space-2), the issues
// list with its repairs (space-46..space-55), a repository's remote
// editor (space-5), the local and incoming lists with Open session and
// View diff (space-7, space-8, space-10), the running rail and Stop
// (space-12, space-16), the first-push notice (space-57), the picker,
// its keyboard and the Apply confirm (space-9, space-17, space-18),
// the stopped, done and unrelated cards (space-13, space-15), the
// explorer tree and previews (space-23, space-24), reveal and copy
// (space-26), the copy law (space-27) and the roles assistive
// technology needs (space-44). Every `space.*` call names the
// repository it acts on by its key.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type {
  GroupsState,
  RepositoryState,
  SessionInfo,
  SpaceConflict,
  SpaceEntry,
  SpaceReadResult,
  SpaceUnit,
} from "@sublang/spex-core/protocol";

import { SpaceSurface } from "./SpaceSurface.js";
import {
  deliverServerMessageForTests,
  setClientForTests,
  useAppStore,
} from "../state/store.js";
import { currentLocale } from "../i18n.js";

const NOW = Date.now();
const MIN = 60_000;
const HOUR = 60 * MIN;
const HOME = "/Users/jane/.spex";
/** The spex repository the tests open, by its key. */
const KEY = "jane/academy-spex";
const OWN = "jane/jane-spex";
const CLONE = `${HOME}/workspace/${KEY}`;

const commandMock = vi.fn();

let current: GroupsState;

function calls(type: string) {
  return commandMock.mock.calls
    .filter(([name]) => name === type)
    .map(([, fields]) => fields as Record<string, unknown>);
}

const INTENT_ID = "0b6f7c1e-2d3a-4b5c-8d9e-0f1a2b3c4d5e";

const SESSION_UNIT: SpaceUnit = {
  unit: "sessions/s1",
  kind: "session",
  label: "Fix the login redirect",
  detail: "12 turns",
  change: "updated",
  sessionId: "s1",
  paths: ["sessions/s1.json", "sessions/s1.records.jsonl"],
  diff: false,
};
const DELETED_SESSION: SpaceUnit = {
  ...SESSION_UNIT,
  unit: "sessions/s9",
  label: "An old thread",
  change: "deleted",
  sessionId: "s9",
  paths: ["sessions/s9.json", "sessions/s9.records.jsonl"],
};
const INTENT_UNIT: SpaceUnit = {
  unit: `intents/${INTENT_ID}`,
  kind: "intent",
  label: "Tighten the expiry tests",
  change: "new",
  intentId: INTENT_ID,
  paths: [`intents/${INTENT_ID}.json`],
  diff: false,
};
const AUTHORING_UNIT: SpaceUnit = {
  unit: "authoring/triage",
  kind: "authoring",
  label: "Triage incoming issues",
  detail: "4 turns",
  change: "updated",
  paths: ["authoring/triage.json", "authoring/triage.records.jsonl"],
  diff: false,
};
const ENVIRONMENT_UNIT: SpaceUnit = {
  unit: "environment",
  kind: "environment",
  label: "Spec packages changed",
  change: "updated",
  paths: ["spex.yaml", "spex.lock"],
  diff: true,
};
/** The pending merge the core folds into the diagnostics (space-1). */
const MERGE_DIAGNOSTIC = {
  file: `workspace/${KEY}/.git/MERGE_HEAD`,
  reason: "a Git merge is pending; finish or abort it in a terminal before syncing",
  blocking: false,
};
const SETTINGS_UNIT: SpaceUnit = {
  unit: "config/playbook.config.yaml",
  kind: "settings",
  label: "Settings changed",
  change: "updated",
  paths: ["config/playbook.config.yaml"],
  diff: true,
};
const CODE_UNIT: SpaceUnit = {
  unit: "project.json",
  kind: "code",
  label: "Code remote changed",
  change: "updated",
  paths: ["project.json"],
  diff: true,
};
const RULES_UNIT: SpaceUnit = {
  unit: ".gitignore",
  kind: "rules",
  label: "Sync rules updated",
  change: "updated",
  paths: [".gitignore"],
  diff: true,
};
const OTHER_UNIT: SpaceUnit = {
  unit: "notes.txt",
  kind: "other",
  label: "notes.txt",
  change: "new",
  paths: ["notes.txt"],
  diff: true,
};
const INCOMING_SESSION: SpaceUnit = {
  ...SESSION_UNIT,
  unit: "sessions/s2",
  label: "Draft the release notes",
  detail: "9 turns",
  sessionId: "s2",
  paths: ["sessions/s2.json", "sessions/s2.records.jsonl"],
};
const INCOMING_INTENT: SpaceUnit = {
  ...INTENT_UNIT,
  unit: "intents/1c2d3e4f-5a6b-4c7d-8e9f-a0b1c2d3e4f5",
  intentId: "1c2d3e4f-5a6b-4c7d-8e9f-a0b1c2d3e4f5",
  label: "Ship the docs",
  paths: ["intents/1c2d3e4f-5a6b-4c7d-8e9f-a0b1c2d3e4f5.json"],
};

const CONFLICTS: SpaceConflict[] = [
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

const BRANCH: NonNullable<RepositoryState["branch"]> = {
  ahead: 2,
  behind: 1,
  checkedAt: NOW - 5 * MIN,
  hostEmpty: false,
  unrelated: false,
  mergePending: false,
};

/** The opened spex repository, reachable, with nothing changed. */
function repo(over: Partial<RepositoryState> = {}): RepositoryState {
  return {
    key: KEY,
    name: "academy-spex",
    id: "42",
    own: false,
    remote: "/tmp/origin.git",
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
    sync: { phase: "idle" },
    ...over,
  };
}

/** Your own group's spex repository, still only on this device. */
const OWN_REPO: RepositoryState = repo({
  key: OWN,
  name: "jane-spex",
  id: null,
  own: true,
  code: null,
  folder: null,
  state: "local-only",
  branch: null,
});

function base(over: Partial<GroupsState> = {}, repos: RepositoryState[] = [repo()]): GroupsState {
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
function repoState(over: Partial<RepositoryState> = {}, home: Partial<GroupsState> = {}): GroupsState {
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

const TREE: Record<string, SpaceEntry[]> = {
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

const READS: Record<string, SpaceReadResult> = {
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

/** Render the surface; unless told otherwise, open the tested
 * repository's row, which brings its tabs beneath the list. */
async function renderSpace(state: GroupsState, options: { open?: boolean } = {}) {
  current = state;
  const onOpenSession = vi.fn<(sessionId: string) => void>();
  const onOpenProject = vi.fn<(projectId: string) => void>();
  render(<SpaceSurface onOpenSession={onOpenSession} onOpenProject={onOpenProject} />);
  await screen.findByTestId("space-header");
  if (options.open !== false && state.git.ok) {
    fireEvent.click(screen.getByTestId(`space-repo-${KEY}`));
    await screen.findByTestId("space-repository");
  }
  return { onOpenSession, onOpenProject };
}

function deliver(state: GroupsState) {
  act(() => deliverServerMessageForTests({ type: "space.state", state }));
}

const live = () => screen.getByTestId("space-live").textContent ?? "";

beforeEach(() => {
  commandMock.mockReset();
  commandMock.mockImplementation(async (type: string, fields: Record<string, unknown> = {}) => {
    switch (type) {
      case "space.get":
      case "space.repair.decline":
      case "space.remote.set":
        return current;
      case "space.fetch":
      case "space.sync":
        return { accepted: true };
      case "space.cancel":
        return { stopped: true };
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
  });
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
});

afterEach(() => {
  cleanup();
  setClientForTests(undefined);
  vi.useRealTimers();
});

describe("SPACE: the home at a glance (space-1), its groups (space-61) and its re-reads (space-2)", () => {
  test("the header reads the home and the account; each group lists its spex repositories by name, folder, code and state", async () => {
    await renderSpace(repoState(), { open: false });
    const path = screen.getByTestId("space-path");
    expect(path.textContent).toContain("~/.spex");
    expect(path.getAttribute("title")).toBe(HOME);
    expect(screen.getByTestId("space-account").textContent).toBe("Signed in as jane at GitLab");
    const group = screen.getByTestId("space-group-jane");
    expect(within(group).getByRole("heading", { level: 2 }).textContent).toContain("jane");
    // Your own group's spex repository first, as the core lists it.
    const rows = within(group).getAllByRole("button");
    expect(rows.map((row) => row.dataset.testid)).toEqual([`space-repo-${OWN}`, `space-repo-${KEY}`]);

    const own = screen.getByTestId(`space-repo-${OWN}`);
    expect(own.textContent).toContain("jane-spex");
    expect(screen.getByTestId(`space-repo-state-${OWN}`).textContent).toBe("Only on this device");
    expect(screen.getByTestId(`space-repo-code-${OWN}`).textContent).toBe("No code");
    expect(screen.getByTestId(`space-repo-folder-${OWN}`).textContent).toBe("No working folder here");

    // A reachable repository reads its last sync's time; its code
    // remote reads with no user in it, the stored URL in the title.
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("Synced 2h ago");
    expect(screen.getByTestId(`space-repo-folder-${KEY}`).textContent).toBe("~/code/academy");
    expect(screen.getByTestId(`space-repo-folder-${KEY}`).getAttribute("title")).toBe("/Users/jane/code/academy");
    expect(screen.getByTestId(`space-repo-code-${KEY}`).textContent).toBe("https://github.com/jane/academy.git");
    expect(screen.getByTestId(`space-repo-${KEY}`).textContent).toContain("9 changes");
    // The row is named by the repository alone, its folder, code and
    // state describing it, so the name holds while the age ticks.
    expect(screen.getByRole("button", { name: "academy-spex" })).toBe(screen.getByTestId(`space-repo-${KEY}`));
    expect(screen.getByTestId(`space-repo-${KEY}`).getAttribute("aria-describedby")).toBe(
      [`space-repo-folder-${KEY}`, `space-repo-code-${KEY}`, `space-repo-state-${KEY}`].join(" "),
    );

    // Nothing opens until a row is activated; activating it again folds it.
    expect(screen.queryByTestId("space-repository")).toBeNull();
    const row = screen.getByTestId(`space-repo-${KEY}`);
    expect(row.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("region", { name: "academy-spex" })).toBeTruthy();
    expect(screen.getByRole("tablist", { name: "Views of academy-spex" })).toBeTruthy();
    fireEvent.click(row);
    expect(screen.queryByTestId("space-repository")).toBeNull();
  });

  test("each state reads as its row says, a waiting step's phrase in its place (space-61, space-64)", async () => {
    const states: [Partial<RepositoryState>, string][] = [
      [{ state: "reachable", lastSync: null }, "Never synced"],
      [{ state: "read-only", reason: "archived" }, "Read-only: archived"],
      [{ state: "unreachable", reason: "the device is offline" }, "Unreachable: the device is offline"],
      [{ state: "absent", folder: null }, "Not on this device"],
      [
        { state: "local-only", waiting: { step: "create", group: "team", message: "Waiting for a member who can create it in team" } },
        "Waiting for a member who can create it in team",
      ],
    ];
    for (const [over, phrase] of states) {
      await renderSpace(base({}, [repo(over)]), { open: false });
      expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe(phrase);
      cleanup();
    }
    // An absent repository's folder reads as such, and its tab has
    // nothing to sync.
    await renderSpace(base({}, [repo({ state: "absent", folder: null })]));
    expect(screen.getByTestId(`space-repo-folder-${KEY}`).textContent).toBe("Not on this device");
    expect(screen.queryByTestId("space-primary")).toBeNull();
    expect(screen.getByTestId("space-sync-tab").textContent).toContain("Not on this device");
  });

  test("a home that is not signed in says so", async () => {
    await renderSpace(base({ account: null }), { open: false });
    expect(screen.getByTestId("space-account").textContent).toBe("Not signed in");
  });

  test("an opened repository reads ahead and behind, the last sync and its counts; issues open in place", async () => {
    await renderSpace(
      repoState(
        { branch: { ...BRANCH, mergePending: true } },
        {
          diagnostics: [
            { file: "workspace/jane/academy-spex/sessions/x.json", reason: "recorded at /Users/jane/code/infra", blocking: false },
            MERGE_DIAGNOSTIC,
          ],
        },
      ),
    );
    const counts = screen.getByTestId("space-ahead-behind");
    expect(counts.textContent).toContain("2");
    expect(counts.textContent).toContain("ahead");
    expect(counts.textContent).toContain("1");
    expect(counts.textContent).toContain("behind");
    expect(counts.textContent).toContain("checked 5m ago");
    expect(counts.getAttribute("title")).toContain("2 commits ahead, 1 commit behind");
    const lastSync = screen.getByTestId("space-last-sync");
    expect(lastSync.textContent).toContain("Synced");
    expect(lastSync.textContent).toContain("2h ago");
    expect(lastSync.getAttribute("title")).toBe(new Date(NOW - 2 * HOUR).toLocaleString(currentLocale()));
    expect(screen.getByTestId("space-local-count").textContent).toBe("9 changes");
    expect(screen.getByTestId("space-local-count").getAttribute("aria-label")).toBe("9 local changes");
    // Issues count the diagnostics — the pending merge among them, once —
    // and open in place; the merge reads in plain words (space-27).
    const issues = screen.getByTestId("space-issues");
    expect(issues.textContent).toContain("2 issues");
    expect(screen.queryByTestId("space-issues-list")).toBeNull();
    fireEvent.click(issues);
    const list = screen.getByTestId("space-issues-list");
    expect(list.textContent).toContain("Issues (2)");
    expect(list.textContent).toContain("A Git merge is pending");
    expect(list.textContent).not.toContain("MERGE_HEAD");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(list.textContent).toContain("sessions/x.json");
    expect(screen.getByTestId("space-merge-note").textContent).toContain("Finish or abort it there");
  });

  test("ahead and behind are absent until a check has run, and 'Never synced' stands with no sync", async () => {
    await renderSpace(repoState({ branch: { ...BRANCH, checkedAt: null, ahead: null, behind: null }, lastSync: null }));
    expect(screen.queryByTestId("space-ahead-behind")).toBeNull();
    expect(screen.getByTestId("space-last-sync").textContent).toContain("Never synced");
    expect(screen.getByText("Not checked yet")).toBeTruthy();
  });

  test("with no git the guidance replaces every other field and Copy path stays", async () => {
    await renderSpace(base({ git: { ok: false, guidance: "Install Git from git-scm.com, then reopen Space." } }));
    expect(screen.getByTestId("space-no-git").textContent).toContain("Git is not installed");
    expect(screen.getByTestId("space-no-git").textContent).toContain("git-scm.com");
    expect(screen.queryByTestId("space-account")).toBeNull();
    expect(screen.queryByTestId("space-groups")).toBeNull();
    expect(screen.queryByTestId("space-repository")).toBeNull();
    expect(screen.getByRole("button", { name: "Copy path" })).toBeTruthy();
  });

  test("Refresh re-reads and prints the time of the last read; window focus re-reads too", async () => {
    await renderSpace(repoState());
    expect(calls("space.get")).toHaveLength(1);
    expect(screen.getByTestId("space-read-at").textContent).toBe("Read just now");
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(calls("space.get")).toHaveLength(2));
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(calls("space.get")).toHaveLength(3));
  });

  test("a space.state broadcast replaces the state wholesale, the opened repository staying open", async () => {
    await renderSpace(base({}, [repo({ state: "local-only", branch: null })]));
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("Only on this device");
    deliver(repoState());
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("Synced 2h ago");
    expect(screen.getByTestId("space-repository")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sync" })).toBeTruthy();
    expect(useAppStore.getState().space?.groups[0].repositories[1].state).toBe("reachable");
  });

  test("session, ledger and configuration announcements re-read once, debounced by 300 ms, never on a timer", async () => {
    await renderSpace(repoState());
    const before = calls("space.get").length;
    vi.useFakeTimers();
    act(() => {
      deliverServerMessageForTests({
        type: "session.state",
        session: { id: "s1", projectId: KEY, projectPath: "/tmp/p1", createdAt: NOW, live: false, endedAt: NOW, players: [], initialVisible: [], turns: 1, failed: false } as SessionInfo,
      });
      deliverServerMessageForTests({ type: "session.removed", sessionId: "s9", projectId: KEY });
      deliverServerMessageForTests({ type: "intents.changed", projectIds: [KEY] });
      deliverServerMessageForTests({ type: "config.state", state: { status: "missing", seeded: false, path: "/x" } as never });
    });
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(calls("space.get")).toHaveLength(before);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(calls("space.get")).toHaveLength(before + 1);
    // Silence keeps it silent: a minute later, nothing has re-read.
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(calls("space.get")).toHaveLength(before + 1);
  });
});

describe("SPACE: repairs (space-46..space-55)", () => {
  const unpaired = (over: Record<string, unknown> = {}) => ({
    kind: "repository" as const,
    repository: "jane/infra-spex",
    name: "infra-spex",
    group: "jane",
    directories: ["/code/infra"],
    sessions: 5,
    key: "jane/infra-spex|/code/infra",
    checked: [{ path: "/code/infra", here: true, repo: true }],
    proposal: { path: "/code/infra", from: "recorded" as const },
    ...over,
  });

  test("a spex repository no folder pairs proposes the folder the core checked, and one gesture pairs it (space-53, space-47)", async () => {
    const answer = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, fields: Record<string, unknown> = {}) => {
      if (type === "project.rebind") return { id: "jane/infra-spex", name: "infra", path: fields.path, registeredAt: 1 };
      if (type === "project.list") return [];
      return answer(type, fields);
    });
    const { onOpenProject } = await renderSpace(
      repoState({}, { diagnostics: [{ file: "workspace/jane/infra-spex", reason: "no working folder pairs it", blocking: false, repair: unpaired() }] }),
      { open: false },
    );
    // Displaying it settles nothing: it still counts (space-54).
    expect(screen.getByTestId("space-issues").textContent).toContain("1 issue");
    fireEvent.click(screen.getByTestId("space-issues"));
    const row = screen.getByTestId("space-repair");
    expect(row.dataset.kind).toBe("repository");
    expect(row.textContent).toContain("infra-spex");
    expect(row.textContent).toContain("in jane");
    expect(row.textContent).toContain("5 sessions ran in /code/infra");
    expect(row.textContent).toContain("That folder is here and is a git repository. Add it as a project?");
    expect(within(row).getByRole("button", { name: "Choose folder…" })).toBeTruthy();
    expect(within(row).getByRole("button", { name: "Don't add" })).toBeTruthy();
    expect(screen.getByTestId("space-issues").textContent).toContain("1 issue");

    // One gesture pairs the spex repository with the folder, its key
    // naming the project, the recorded folders riding as aliases.
    fireEvent.click(within(row).getByRole("button", { name: "Add project" }));
    await waitFor(() =>
      expect(calls("project.rebind")).toEqual([
        { projectId: "jane/infra-spex", path: "/code/infra", aliases: ["/code/infra"] },
      ]),
    );
    const resolved = await screen.findByTestId("space-repair-resolved");
    expect(resolved.textContent).toContain("infra · now a project at /code/infra, 5 sessions listed");
    fireEvent.click(within(resolved).getByRole("button", { name: "Open project" }));
    expect(onOpenProject).toHaveBeenCalledWith("jane/infra-spex");
  });

  test("a working folder whose clone is missing offers to forget the folder, behind an inline confirm (space-46, projects-9)", async () => {
    const answer = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, fields: Record<string, unknown> = {}) => {
      if (type === "project.remove") return null;
      if (type === "project.list") return [];
      return answer(type, fields);
    });
    const repair = {
      kind: "folder" as const,
      repository: "jane/old-spex",
      directories: ["/code/old"],
      sessions: 0,
      key: "folder|/code/old",
    };
    await renderSpace(
      repoState({}, { diagnostics: [{ file: "home.yaml", reason: "/code/old names a clone that is missing", blocking: false, repair }] }),
      { open: false },
    );
    fireEvent.click(screen.getByTestId("space-issues"));
    const row = screen.getByTestId("space-repair");
    expect(row.dataset.kind).toBe("folder");
    expect(row.textContent).toContain("/code/old");
    expect(row.textContent).toContain("Its spex repository is not on this device.");
    expect(within(row).queryByRole("button", { name: "Add project" })).toBeNull();
    fireEvent.click(within(row).getByRole("button", { name: "Forget folder" }));
    expect(row.textContent).toContain("The folder stays on disk.");
    // Cancel is the safe default (DR-010 §4).
    expect(document.activeElement).toBe(within(row).getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(row).getByRole("button", { name: "Forget" }));
    await waitFor(() =>
      expect(calls("project.remove")).toEqual([{ projectId: "jane/old-spex", confirm: true }]),
    );
    const resolved = await screen.findByTestId("space-repair-resolved");
    expect(resolved.textContent).toContain("/code/old · forgotten on this device");
    expect(within(resolved).queryByRole("button", { name: "Open project" })).toBeNull();
  });

  test("a folder the core did not find proposes nothing and says so (space-53)", async () => {
    const repair = unpaired({
      directories: ["/gone/worktree"],
      sessions: 2,
      key: "jane/infra-spex|/gone/worktree",
      checked: [{ path: "/gone/worktree", here: false, repo: false }],
      proposal: undefined,
    });
    await renderSpace(repoState({}, { diagnostics: [{ file: "workspace/jane/infra-spex", reason: "no working folder pairs it", blocking: false, repair }] }), { open: false });
    fireEvent.click(screen.getByTestId("space-issues"));
    const row = screen.getByTestId("space-repair");
    expect(row.textContent).toContain("That folder is no longer on this device.");
    expect(within(row).queryByRole("button", { name: "Add project" })).toBeNull();
    expect(within(row).getByRole("button", { name: "Don't add" })).toBeTruthy();
  });

  test("a repair set aside stands in the list, marked, and counts no more (space-54, space-55)", async () => {
    const repair = unpaired({
      checked: [{ path: "/code/infra", here: false, repo: false }],
      proposal: undefined,
      declined: NOW - 60_000,
    });
    await renderSpace(repoState({}, { diagnostics: [{ file: "workspace/jane/infra-spex", reason: "no working folder pairs it", blocking: false, repair }] }), { open: false });
    // It counts as no issue, but the control stays reachable — and
    // with nothing unanswered it stops wearing attention's colour.
    const issues = screen.getByTestId("space-issues");
    expect(issues.textContent).not.toMatch(/\d/);
    expect(issues.className).not.toContain("amber");
    expect(issues.textContent).not.toContain("⚠");
    fireEvent.click(issues);
    expect(screen.getByTestId("space-issues-list").className).not.toContain("amber");
    const row = screen.getByTestId("space-repair-declined");
    expect(row.textContent).toContain("not added");
    expect(row.textContent).toContain("infra-spex");
    // Declining strips nothing: the row still offers what it offered.
    expect(within(row).getByRole("button", { name: "Choose folder…" })).toBeTruthy();
    expect(within(row).queryByRole("button", { name: "Don't add" })).toBeNull();
    expect(screen.getByTestId("space-issues-list").textContent).toContain("1 not added");
  });

  test("an outcome and a declined row hold their places until the reader's Refresh, as focus and the count move on (space-56)", async () => {
    const proposed = (path: string) => ({
      directories: [path],
      checked: [{ path, here: true, repo: true }],
      proposal: { path, from: "recorded" as const },
    });
    const pair = (name: string, sessions: number) => ({
      file: `workspace/jane/${name}-spex`,
      reason: `${name}-spex has no working folder here`,
      blocking: false,
      repair: {
        kind: "repository" as const,
        repository: `jane/${name}-spex`,
        name: `${name}-spex`,
        group: "jane",
        sessions,
        key: `jane/${name}-spex|/code/${name}`,
        ...proposed(`/code/${name}`),
      },
    });
    const rows = { infra: pair("infra", 5), slc: pair("slc", 2), docs: pair("docs", 1) };
    type Name = keyof typeof rows;
    // What the core still reports, in its own order: a pairing resolves
    // a repair, and a decline marks it.
    const standing = new Map<Name, "open" | "declined">([["infra", "open"], ["slc", "open"], ["docs", "open"]]);
    const report = () => repoState({}, {
      diagnostics: [...standing].map(([name, how]) =>
        how === "declined" ? { ...rows[name], repair: { ...rows[name].repair, declined: NOW } } : rows[name]),
    });
    const nameOf = (key: unknown) => (Object.keys(rows) as Name[]).find((name) => rows[name].repair.key === key)!;
    const answer = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, fields: Record<string, unknown> = {}) => {
      switch (type) {
        case "space.repair.decline":
          standing.set(nameOf(fields.repair), "declined");
          current = report();
          return current;
        case "project.rebind": {
          const name = (Object.keys(rows) as Name[]).find((entry) => rows[entry].repair.repository === fields.projectId)!;
          standing.delete(name);
          current = report();
          return { id: fields.projectId, name, path: fields.path, registeredAt: 1 };
        }
        case "project.list":
          return [];
        default:
          return answer(type, fields);
      }
    });
    const { onOpenProject } = await renderSpace(report(), { open: false });
    expect(screen.getByTestId("space-issues").textContent).toContain("3 issues");
    fireEvent.click(screen.getByTestId("space-issues"));
    const items = () => within(screen.getByTestId("space-issues-list")).getAllByRole("listitem");
    const at = (index: number) => items()[index]!;
    const [infra, , docs] = screen.getAllByTestId("space-repair");

    // A declined row keeps its place, and counts no more.
    fireEvent.click(within(infra!).getByRole("button", { name: "Don't add" }));
    await waitFor(() => expect(at(0).dataset.testid).toBe("space-repair-declined"));
    expect(at(0).textContent).toContain("infra");
    expect(screen.getByTestId("space-issues").textContent).toContain("2 issues");

    // The last row gives way to its outcome in its own place.
    fireEvent.click(within(docs!).getByRole("button", { name: "Add project" }));
    await waitFor(() => expect(at(2).dataset.testid).toBe("space-repair-resolved"));
    expect(at(2).textContent).toContain("docs · now a project at /code/docs, 1 session listed");
    // The count falls, the live region counts what the header does —
    // the declined row not among them — and focus wraps to the next
    // unanswered repair's first control.
    expect(screen.getByTestId("space-issues").textContent).toContain("1 issue");
    expect(live()).toBe("1 issue left.");
    await waitFor(() => expect(document.activeElement).toBe(within(at(1)).getByRole("button", { name: "Add project" })));
    expect(at(1).textContent).toContain("slc");

    // A re-read the core delivers moves nothing.
    deliver(current);
    expect(items().map((item) => item.dataset.testid)).toEqual(["space-repair-declined", "space-repair", "space-repair-resolved"]);

    // The reader's Refresh lays the list out afresh: the outcome leaves
    // and the declined row follows the unanswered one.
    fireEvent.click(screen.getByTestId("space-refresh"));
    await waitFor(() => expect(items().map((item) => item.dataset.testid)).toEqual(["space-repair", "space-repair-declined"]));
    expect(at(0).textContent).toContain("slc");

    // With no unanswered repair left, focus lands on the outcome's own
    // Open project, the one way off the surface.
    fireEvent.click(within(at(0)).getByRole("button", { name: "Add project" }));
    await waitFor(() => expect(at(0).dataset.testid).toBe("space-repair-resolved"));
    expect(live()).toBe("All issues resolved.");
    const openSlc = within(at(0)).getByRole("button", { name: "Open project" });
    await waitFor(() => expect(document.activeElement).toBe(openSlc));
    fireEvent.click(openSlc);
    expect(onOpenProject).toHaveBeenCalledWith("jane/slc-spex");

    // The last repair resolved, the list stands with every outcome
    // though the core reports nothing, until the reader's Refresh.
    fireEvent.click(within(at(1)).getByRole("button", { name: "Add project" }));
    await waitFor(() => expect(at(1).dataset.testid).toBe("space-repair-resolved"));
    expect(at(1).textContent).toContain("infra · now a project at /code/infra, 5 sessions listed");
    expect(live()).toBe("All issues resolved.");
    await waitFor(() => expect(document.activeElement).toBe(within(at(1)).getByRole("button", { name: "Open project" })));
    expect(current.diagnostics).toEqual([]);
    expect(items()).toHaveLength(2);
    fireEvent.click(screen.getByTestId("space-refresh"));
    await waitFor(() => expect(screen.queryByTestId("space-issues-list")).toBeNull());
  });
});

describe("SPACE: a repository's remote (space-5)", () => {
  test("Set remote edits in place with Save and Cancel, Escape cancelling, an empty field removing it", async () => {
    await renderSpace(repoState());
    fireEvent.click(screen.getByRole("button", { name: "Set remote" }));
    const input = screen.getByTestId("space-remote-input");
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByTestId("space-remote-editor")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Set remote" }));
    expect(calls("space.remote.set")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Set remote" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("space-remote-editor")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Set remote" }));
    fireEvent.change(screen.getByTestId("space-remote-input"), { target: { value: "/srv/academy-spex.git" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByTestId("space-remote-editor")).toBeNull());
    expect(calls("space.remote.set")).toEqual([{ repository: KEY, url: "/srv/academy-spex.git" }]);
    // An empty field removes the remote.
    fireEvent.click(screen.getByRole("button", { name: "Set remote" }));
    fireEvent.keyDown(screen.getByTestId("space-remote-input"), { key: "Enter" });
    await waitFor(() => expect(calls("space.remote.set")).toHaveLength(2));
    expect(calls("space.remote.set")[1]).toEqual({ repository: KEY, url: null });
  });

  test("a refused remote stays in the editor with its reason", async () => {
    await renderSpace(repoState());
    commandMock.mockImplementationOnce(async () => {
      throw new Error("the app stores no credential — use an SSH key or the machine's credential helper");
    });
    fireEvent.click(screen.getByRole("button", { name: "Set remote" }));
    fireEvent.change(screen.getByTestId("space-remote-input"), { target: { value: "https://u:secret@host/x" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toContain("stores no credential");
    expect(screen.getByTestId("space-remote-editor")).toBeTruthy();
  });
});

describe("SPACE: changes (space-7, space-8, space-10)", () => {
  test("local units group by kind in order with their labels and details; a session row opens its session", async () => {
    const { onOpenSession } = await renderSpace(repoState());
    const list = screen.getByTestId("space-local-list");
    const headings = within(list).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(["Sessions", "Intents", "Authoring", "Environment", "Settings", "Code", "Sync rules", "Other"]);
    const session = screen.getByTestId("space-unit-mine-sessions/s1");
    expect(session.textContent).toContain("Fix the login redirect");
    expect(session.textContent).toContain("12 turns");
    expect(session.textContent).toContain("updated");
    fireEvent.click(within(session).getByRole("button", { name: "Open session" }));
    expect(onOpenSession).toHaveBeenCalledWith("s1");
    // A deleted session offers nothing to open; an intent row offers no
    // diff, the environment one does (space-10).
    const deleted = screen.getByTestId("space-unit-mine-sessions/s9");
    expect(deleted.textContent).toContain("deleted");
    expect(within(deleted).queryByRole("button", { name: "Open session" })).toBeNull();
    const intent = screen.getByTestId(`space-unit-mine-intents/${INTENT_ID}`);
    expect(intent.textContent).toContain("Tighten the expiry tests");
    expect(within(intent).queryByRole("button", { name: "View diff" })).toBeNull();
    expect(screen.getByTestId("space-unit-mine-authoring/triage").textContent).toContain("Triage incoming issues");
    expect(within(screen.getByTestId("space-unit-mine-environment")).getByRole("button", { name: "View diff" })).toBeTruthy();
    expect(within(screen.getByTestId("space-unit-mine-project.json")).getByRole("button", { name: "View diff" })).toBeTruthy();
  });

  test("with no local unit the list reads 'Nothing to send from this device'", async () => {
    await renderSpace(repoState({ local: [] }));
    expect(screen.getByText("Nothing to send from this device")).toBeTruthy();
    expect(screen.getByTestId("space-local-count").getAttribute("aria-label")).toBe("0 local changes");
  });

  test("View diff shows the line diff in place for the right side and Hide diff removes it", async () => {
    await renderSpace(repoState({ incoming: [{ ...SETTINGS_UNIT }] }));
    const row = screen.getByTestId("space-unit-mine-config/playbook.config.yaml");
    fireEvent.click(within(row).getByRole("button", { name: "View diff" }));
    const diffId = "space-diff-mine-config/playbook.config.yaml";
    await waitFor(() => expect(screen.getByTestId(diffId).textContent).toContain("+new: 2"));
    const diff = screen.getByTestId(diffId);
    expect(diff.textContent).toContain("-old: 1");
    expect(diff.textContent).toContain("This device against the common ancestor");
    expect(calls("space.diff")).toEqual([{ repository: KEY, unit: "config/playbook.config.yaml", path: "config/playbook.config.yaml", side: "mine" }]);
    fireEvent.click(within(row).getByRole("button", { name: "Hide diff" }));
    expect(screen.queryByTestId("space-diff-mine-config/playbook.config.yaml")).toBeNull();
    const incoming = screen.getByTestId("space-unit-remote-config/playbook.config.yaml");
    fireEvent.click(within(incoming).getByRole("button", { name: "View diff" }));
    await waitFor(() => expect(calls("space.diff")).toHaveLength(2));
    expect(calls("space.diff")[1]).toEqual({ repository: KEY, unit: "config/playbook.config.yaml", path: "config/playbook.config.yaml", side: "remote" });
    await waitFor(() => expect(screen.getByTestId("space-diff-remote-config/playbook.config.yaml").textContent).toContain("The host's version against the common ancestor"));
  });

  test("Check host fetches, reads 'Checking…' with Stop while it runs, and marks the units this device changed too", async () => {
    await renderSpace(repoState({ conflicts: [CONFLICTS[0]], incoming: [SESSION_UNIT, INCOMING_INTENT] }));
    // The mark stands on the incoming row alone (space-8).
    expect(screen.getAllByTestId("space-choose-sessions/s1")).toHaveLength(1);
    expect(screen.getByTestId("space-unit-remote-sessions/s1").textContent).toContain("choose");
    expect(screen.getByTestId("space-unit-mine-sessions/s1").textContent).not.toContain("choose");
    fireEvent.click(screen.getByRole("button", { name: "Check host" }));
    await waitFor(() => expect(calls("space.fetch")).toEqual([{ repository: KEY }]));
    deliver(repoState({ sync: { phase: "running", op: "check", step: "check", since: NOW, cancelable: true } }));
    expect(screen.getByTestId("space-check").textContent).toBe("Checking…");
    expect(screen.getByTestId("space-step-line").textContent).toBe("Checking host…");
    expect(screen.queryByTestId("space-step-save")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Stop" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() => expect(calls("space.cancel")).toEqual([{ repository: KEY }]));
    // Sync waits while a check runs.
    expect((screen.getByTestId("space-primary") as HTMLButtonElement).disabled).toBe(true);
  });

  test("a host holding no records and an unrelated history read as such", async () => {
    await renderSpace(repoState({ branch: { ...BRANCH, hostEmpty: true, behind: 0 }, incoming: [] }));
    expect(screen.getByText("The host holds no records yet; Sync will send these")).toBeTruthy();
    cleanup();
    await renderSpace(repoState({ branch: { ...BRANCH, unrelated: true }, incoming: [], sync: { phase: "unrelated" } }));
    expect(screen.getByTestId("space-unrelated").textContent).toContain("Join both histories into one");
    expect(screen.queryByTestId("space-ahead-behind")).toBeNull();
    expect(screen.getByRole("button", { name: "Join" })).toBeTruthy();
  });
});

describe("SPACE: syncing (space-11, space-12, space-15, space-16, space-57)", () => {
  test("Sync sends the command naming the repository and reads 'Syncing…' with the rail naming each step while it runs", async () => {
    await renderSpace(repoState());
    fireEvent.click(screen.getByRole("button", { name: "Sync" }));
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY }]));
    deliver(repoState({ sync: { phase: "running", op: "sync", step: "compare", since: NOW, cancelable: false } }));
    expect(screen.getByTestId("space-primary").textContent).toBe("Syncing…");
    expect(screen.getByTestId("space-step-line").textContent).toBe("Comparing…");
    expect(screen.getByTestId("space-step-save").getAttribute("data-state")).toBe("done");
    expect(screen.getByTestId("space-step-check").getAttribute("data-state")).toBe("done");
    expect(screen.getByTestId("space-step-compare").getAttribute("data-state")).toBe("current");
    expect(screen.getByTestId("space-step-push").getAttribute("data-state")).toBe("upcoming");
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
    expect(live()).toBe("Comparing…");
    deliver(repoState({ sync: { phase: "running", op: "sync", step: "push", since: NOW, cancelable: true } }));
    expect(screen.getByRole("button", { name: "Stop" })).toBeTruthy();
    expect(live()).toBe("Pushing…");
    expect(screen.getByTestId("space-status-dot").getAttribute("data-tone")).toBe("running");
  });

  test("Sync is refused before the first step with the reason beside the disabled control", async () => {
    await renderSpace(repoState({ branch: { ...BRANCH, mergePending: true } }));
    let sync = screen.getByTestId("space-primary") as HTMLButtonElement;
    expect(sync.disabled).toBe(true);
    expect(screen.getByTestId("space-primary-caption").textContent).toBe("Finish or abort the merge in your terminal");
    cleanup();
    // A blocking diagnostic beneath this clone refuses it, and the
    // issues list stands by itself.
    await renderSpace(repoState({}, { diagnostics: [{ file: `workspace/${KEY}/intents/x.json`, reason: "malformed intent", blocking: true }] }));
    sync = screen.getByTestId("space-primary") as HTMLButtonElement;
    expect(sync.disabled).toBe(true);
    expect(screen.getByTestId("space-primary-caption").textContent).toBe(`workspace/${KEY}/intents/x.json: malformed intent`);
    expect(screen.getByTestId("space-issues-list")).toBeTruthy();
    cleanup();
    // Another repository's blocking diagnostic refuses nothing here.
    await renderSpace(repoState({}, { diagnostics: [{ file: "workspace/jane/other-spex/intents/x.json", reason: "malformed intent", blocking: true }] }));
    expect((screen.getByTestId("space-primary") as HTMLButtonElement).disabled).toBe(false);
  });

  test("a busy refusal from the core lands beside the control", async () => {
    await renderSpace(repoState());
    commandMock.mockImplementationOnce(async () => {
      throw new Error('Wait for "Fix the login redirect"');
    });
    fireEvent.click(screen.getByRole("button", { name: "Sync" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Wait for");
    expect(live()).toContain("Wait for");
  });

  test("a stopped sync shows the step, the cause, its guidance, Retry and Dismiss", async () => {
    await renderSpace(
      repoState({
        branch: { ...BRANCH, ahead: 3 },
        sync: {
          phase: "stopped",
          op: "sync",
          step: "push",
          cause: "refused",
          message: "GitLab refused: you are not allowed to push",
          guidance: "Ask a maintainer of jane on GitLab for a role that can push. Then Retry.",
          retry: true,
        },
      }),
    );
    const card = screen.getByTestId("space-stopped");
    expect(screen.getByTestId("space-stopped-title").textContent).toBe("Push stopped — GitLab refused: you are not allowed to push");
    expect(card.textContent).toContain("a role that can push");
    expect(card.textContent).toContain("saved locally (3 commits ahead)");
    expect(live()).toContain("Push stopped");
    expect(screen.getByTestId("space-status-dot").getAttribute("data-tone")).toBe("stopped");
    fireEvent.click(within(card).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY }]));
    fireEvent.click(within(card).getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByTestId("space-stopped")).toBeNull();
  });

  test("Retry after a stopped check fetches again; a rejected push reads amber with 'changed again'", async () => {
    await renderSpace(
      repoState({
        sync: { phase: "stopped", op: "check", step: "check", cause: "unreachable", message: "Could not reach GitLab", guidance: "Check the network.", retry: true },
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(calls("space.fetch")).toEqual([{ repository: KEY }]));
    deliver(
      repoState({
        sync: { phase: "stopped", op: "sync", step: "push", cause: "rejected", message: "The host changed again", guidance: "Sync again to take the new changes.", retry: true },
      }),
    );
    expect(screen.getByTestId("space-stopped-title").textContent).toContain("The host changed again");
    expect(screen.getByTestId("space-status-dot").getAttribute("data-tone")).toBe("attention");
  });

  test("a finished sync reads its counts, 'Everything is in sync' when nothing moved, and a read-only one what it brought", async () => {
    await renderSpace(repoState({ sync: { phase: "done", at: NOW, sent: 5, received: 4, pushed: true } }));
    expect(screen.getByTestId("space-done-line").textContent).toBe("Synced just now · 5 sent · 4 received");
    fireEvent.click(within(screen.getByTestId("space-done")).getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByTestId("space-done")).toBeNull();
    deliver(repoState({ sync: { phase: "done", at: NOW, sent: 0, received: 0, pushed: true } }));
    expect(screen.getByTestId("space-done-line").textContent).toBe("Everything is in sync");
    expect(live()).toBe("Everything is in sync");
    deliver(repoState({ state: "read-only", reason: "archived", sync: { phase: "done", at: NOW + 1, sent: 0, received: 4, pushed: false } }));
    expect(screen.getByTestId("space-done-line").textContent).toBe("Brought 4; nothing sent");
  });

  test("unrelated histories offer Join, confirmed inline with Cancel focused (space-13)", async () => {
    await renderSpace(repoState({ branch: { ...BRANCH, unrelated: true }, sync: { phase: "unrelated" } }));
    // Join in place of Sync says what it does in its title.
    expect(screen.getByTestId("space-primary").title).toBe(
      "Brings both histories into one and asks about anything that differs",
    );
    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    const confirm = screen.getByTestId("space-join-confirm");
    expect(confirm.textContent).toContain("Join both histories into one?");
    expect(confirm.textContent).toContain("Anything that differs will ask you to choose.");
    expect(document.activeElement).toBe(within(confirm).getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByTestId("space-join-confirm")).toBeNull();
    expect(calls("space.sync")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    fireEvent.click(within(screen.getByTestId("space-join-confirm")).getByRole("button", { name: "Join" }));
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY, join: true }]));
  });

  test("the first sync of a repository others share says once what goes there; Continue records it (space-57)", async () => {
    await renderSpace(repoState({ members: 3, noticed: false }));
    fireEvent.click(screen.getByRole("button", { name: "Sync" }));
    let notice = screen.getByTestId("space-notice-confirm");
    expect(notice.textContent).toContain("Every session goes there whole");
    expect(notice.textContent).toContain("nothing recalls what others downloaded");
    expect(notice.textContent).not.toContain("public");
    expect(document.activeElement).toBe(within(notice).getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByTestId("space-notice-confirm")).toBeNull();
    expect(calls("space.sync")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Sync" }));
    notice = screen.getByTestId("space-notice-confirm");
    fireEvent.click(within(notice).getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY, noticed: true }]));
    cleanup();
    // A public repository says its records are public.
    await renderSpace(repoState({ members: 3, noticed: false, visibility: "public" }));
    fireEvent.click(screen.getByRole("button", { name: "Sync" }));
    expect(screen.getByTestId("space-notice-confirm").textContent).toContain("its records are public");
    cleanup();
    // A repository whose only member is the account says nothing.
    commandMock.mockClear();
    await renderSpace(repoState({ members: 1, noticed: false }));
    fireEvent.click(screen.getByRole("button", { name: "Sync" }));
    expect(screen.queryByTestId("space-notice-confirm")).toBeNull();
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY }]));
  });

  test("controls are disabled while disconnected", async () => {
    await renderSpace(repoState());
    act(() => useAppStore.setState({ connection: "closed" }));
    expect((screen.getByTestId("space-primary") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("space-check") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Set remote" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("SPACE: choices (space-9, space-17, space-18)", () => {
  const choicesState = (over: Partial<RepositoryState> = {}) =>
    repoState({
      incoming: [SESSION_UNIT, SETTINGS_UNIT, INCOMING_INTENT],
      conflicts: CONFLICTS,
      sync: { phase: "choices", savedCommit: "abc123" },
      ...over,
    });

  test("choices needed shows the incoming list above the picker with the step line and caption", async () => {
    await renderSpace(choicesState());
    expect(screen.getByTestId("space-step-line").textContent).toBe("Needs your choice");
    expect(screen.getByText("Your changes are saved; nothing is pushed yet")).toBeTruthy();
    const incoming = screen.getByTestId("space-incoming-list");
    const picker = screen.getByTestId("space-picker");
    expect(incoming.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Choose for 2 conflicts" })).toBeTruthy();
    expect(screen.getByTestId("space-status-dot").getAttribute("data-tone")).toBe("attention");
  });

  test("each conflict is a radio group named by its label with nothing preselected; Apply waits for every choice", async () => {
    await renderSpace(choicesState());
    const session = screen.getByRole("radiogroup", { name: "Fix the login redirect" });
    const settings = screen.getByRole("radiogroup", { name: "Settings changed" });
    for (const group of [session, settings]) {
      for (const radio of within(group).getAllByRole("radio")) {
        expect((radio as HTMLInputElement).checked).toBe(false);
      }
    }
    expect(within(session).getByLabelText(/Keep mine/).parentElement?.textContent).toContain("updated 2h ago · 12 turns");
    expect(within(session).getByLabelText(/Take host's/).parentElement?.textContent).toContain("updated 5h ago · 9 turns");
    expect(within(settings).getAllByRole("button", { name: "View diff" })).toHaveLength(2);
    expect(within(session).queryByRole("button", { name: "View diff" })).toBeNull();
    const apply = screen.getByTestId("space-apply") as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    expect(screen.getByTestId("space-chosen").textContent).toBe("0 of 2 chosen");
    fireEvent.click(within(session).getByLabelText(/Take host's/));
    expect(screen.getByTestId("space-chosen").textContent).toBe("1 of 2 chosen");
    expect(apply.disabled).toBe(true);
    fireEvent.click(within(settings).getByLabelText(/Keep mine/));
    expect(screen.getByTestId("space-chosen").textContent).toBe("2 of 2 chosen");
    expect(apply.disabled).toBe(false);
  });

  test("arrow keys move within a group, and All mine / All host's fill every row", async () => {
    await renderSpace(choicesState());
    const session = screen.getByRole("radiogroup", { name: "Fix the login redirect" });
    const [mine, remote] = within(session).getAllByRole("radio") as HTMLInputElement[];
    mine.focus();
    fireEvent.keyDown(mine, { key: "ArrowDown" });
    expect(remote.checked).toBe(true);
    expect(document.activeElement).toBe(remote);
    fireEvent.keyDown(remote, { key: "ArrowUp" });
    expect(mine.checked).toBe(true);
    expect(document.activeElement).toBe(mine);
    expect(screen.getByTestId("space-chosen").textContent).toBe("1 of 2 chosen");
    fireEvent.click(screen.getByRole("button", { name: "All host's" }));
    expect(screen.getByTestId("space-chosen").textContent).toBe("2 of 2 chosen");
    for (const group of screen.getAllByRole("radiogroup")) {
      expect((within(group).getByLabelText(/Take host's/) as HTMLInputElement).checked).toBe(true);
    }
    fireEvent.click(screen.getByRole("button", { name: "All mine" }));
    for (const group of screen.getAllByRole("radiogroup")) {
      expect((within(group).getByLabelText(/Keep mine/) as HTMLInputElement).checked).toBe(true);
    }
  });

  test("Apply asks one inline confirm with Cancel focused; Escape keeps the choices; confirming syncs with them", async () => {
    await renderSpace(choicesState());
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Fix the login redirect" })).getByLabelText(/Take host's/));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Settings changed" })).getByLabelText(/Keep mine/));
    fireEvent.click(screen.getByTestId("space-apply"));
    const confirm = screen.getByTestId("space-apply-confirm");
    expect(confirm.textContent).toContain("Replace 1 unit with the host's version?");
    expect(confirm.textContent).toContain("stays in Git history");
    expect(confirm.textContent).toContain("loses its local resume hints");
    expect(document.activeElement).toBe(within(confirm).getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByTestId("space-apply-confirm")).toBeNull();
    expect(screen.getByTestId("space-chosen").textContent).toBe("2 of 2 chosen");
    expect(calls("space.sync")).toHaveLength(0);
    fireEvent.click(screen.getByTestId("space-apply"));
    fireEvent.click(within(screen.getByTestId("space-apply-confirm")).getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(calls("space.sync")).toEqual([
        { repository: KEY, choices: { "sessions/s1": "remote", "config/playbook.config.yaml": "mine" } },
      ]),
    );
  });

  test("a join waiting for choices lists the incoming units, offers Join, and applies with the join", async () => {
    await renderSpace(
      choicesState({
        branch: { ...BRANCH, unrelated: true, ahead: null, behind: null },
        incoming: [INCOMING_SESSION, INCOMING_INTENT],
        conflicts: [CONFLICTS[1]],
      }),
    );
    // The incoming list stands above the picker (space-9); the histories
    // stay unrelated until the merge lands, so the control offers Join.
    expect(screen.getByTestId("space-incoming-list")).toBeTruthy();
    expect(screen.getByTestId("space-unit-remote-sessions/s2").textContent).toContain("Draft the release notes");
    expect(screen.queryByText("Unrelated history")).toBeNull();
    expect(screen.getByTestId("space-primary").textContent).toBe("Join");
    expect(screen.queryByTestId("space-ahead-behind")).toBeNull();
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Settings changed" })).getByLabelText(/Keep mine/));
    fireEvent.click(screen.getByTestId("space-apply"));
    fireEvent.click(within(screen.getByTestId("space-apply-confirm")).getByRole("button", { name: "Apply" }));
    // Apply carries the choices and the join (space-13, space-18).
    await waitFor(() =>
      expect(calls("space.sync")).toEqual([{ repository: KEY, choices: { "config/playbook.config.yaml": "mine" }, join: true }]),
    );
  });

  test("a deletion against a change reads 'deleted' on the deleting side", async () => {
    await renderSpace(
      choicesState({
        conflicts: [
          {
            unit: SESSION_UNIT,
            mine: { change: "deleted", diff: false },
            remote: { change: "updated", at: NOW - HOUR, detail: "13 turns", diff: false },
          },
        ],
      }),
    );
    const group = screen.getByRole("radiogroup", { name: "Fix the login redirect" });
    expect(within(group).getByLabelText(/Keep mine/).parentElement?.textContent).toContain("deleted");
    expect(within(group).getByLabelText(/Take host's/).parentElement?.textContent).toContain("updated 1h ago · 13 turns");
  });

  test("a sync stopped at Apply keeps the picker with the refused unit marked, and Retry carries the choices", async () => {
    await renderSpace(
      repoState({
        conflicts: CONFLICTS,
        sync: {
          phase: "stopped",
          op: "sync",
          step: "apply",
          cause: "validation",
          message: "Settings changed: playbook.config.yaml is not valid YAML",
          guidance: "Choose the other version, or fix the file.",
          retry: true,
        },
      }),
    );
    expect(screen.getByTestId("space-conflict-config/playbook.config.yaml").getAttribute("data-marked")).toBe("1");
    expect(screen.getByTestId("space-conflict-sessions/s1").getAttribute("data-marked")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "All mine" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(calls("space.sync")).toEqual([
        { repository: KEY, choices: { "sessions/s1": "mine", "config/playbook.config.yaml": "mine" } },
      ]),
    );
  });
});

describe("SPACE: the explorer (space-23, space-24)", () => {
  async function openExplore(state: GroupsState = repoState()) {
    const rendered = await renderSpace(state);
    fireEvent.click(screen.getByRole("tab", { name: "Explore" }));
    await screen.findByTestId("space-tree");
    await screen.findByTestId("space-node-project.json");
    return rendered;
  }

  test("the tree is one ARIA tree over the repository's clone with a single focus stop, every entry annotated", async () => {
    await openExplore();
    expect(calls("space.tree")[0]).toEqual({ repository: KEY });
    const tree = screen.getByRole("tree", { name: "Files in academy-spex" });
    expect(screen.getByTestId("space-explore-tab").textContent).toContain(CLONE);
    const items = within(tree).getAllByRole("treeitem");
    expect(items.filter((item) => item.tabIndex === 0)).toHaveLength(1);
    expect(screen.getByTestId("space-node-project.json").textContent).toContain("code remote");
    expect(screen.getByTestId("space-node-project.json").textContent).toContain("Shared");
    expect(screen.getByTestId("space-node-spex.yaml").textContent).toContain("spec package requests");
    expect(screen.getByTestId("space-node-packages").textContent).toContain("installed spec packages");
    expect(screen.getByTestId("space-node-packages").textContent).toContain("Stays here");
    expect(screen.getByTestId("space-node-README.md").textContent).toContain("Not a Spex file");
    expect(screen.getByTestId("space-node-README.md").textContent).toContain("Not yet shared");
    expect(screen.getByTestId("space-node-sessions").textContent).toContain("4 entries");
    // An empty directory of a tracked kind reads not yet shared, never
    // "Stays here" (space-23).
    const intents = screen.getByTestId("space-node-intents");
    expect(intents.textContent).toContain("0 entries");
    expect(intents.textContent).toContain("Not yet shared");
    expect(intents.querySelector("[data-sync]")?.getAttribute("data-sync")).toBe("pending");
    const git = screen.getByTestId("space-node-.git");
    expect(git.textContent).toContain("Git data");
    expect(git.getAttribute("aria-expanded")).toBeNull();
    fireEvent.click(git);
    expect(calls("space.tree").some((fields) => fields.path === ".git")).toBe(false);
    expect(screen.getByTestId("space-preview").textContent).toContain("not shown");
  });

  test("arrow keys move, disclose and collapse; a session's files group under one node titled by the session", async () => {
    const { onOpenSession } = await openExplore();
    const tree = screen.getByRole("tree", { name: "Files in academy-spex" });
    const sessions = screen.getByTestId("space-node-sessions");
    sessions.focus();
    fireEvent.keyDown(tree, { key: "ArrowRight" });
    expect(sessions.getAttribute("aria-expanded")).toBe("true");
    const node = await screen.findByTestId("space-node-session:s1");
    expect(calls("space.tree").at(-1)).toEqual({ repository: KEY, path: "sessions" });
    expect(node.textContent).toContain("Fix the login redirect");
    expect(screen.getByTestId("space-node-session:s2").textContent).toContain("Draft the release notes");
    fireEvent.keyDown(tree, { key: "ArrowDown" });
    expect(document.activeElement).toBe(node);
    fireEvent.keyDown(tree, { key: "ArrowRight" });
    expect(node.getAttribute("aria-expanded")).toBe("true");
    const manifest = screen.getByTestId("space-node-sessions/s1.json");
    expect(manifest.textContent).toContain("manifest");
    expect(manifest.textContent).toContain("Shared");
    expect(screen.getByTestId("space-node-sessions/s1.hints.json").textContent).toContain("provider hints");
    expect(screen.getByTestId("space-node-sessions/s1.hints.json").textContent).toContain("Stays here");
    expect(screen.getByTestId("space-node-sessions/s1.records.jsonl").getAttribute("aria-level")).toBe("3");
    fireEvent.keyDown(tree, { key: "ArrowRight" });
    expect(document.activeElement).toBe(manifest);
    fireEvent.keyDown(tree, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(node);
    fireEvent.keyDown(tree, { key: "ArrowLeft" });
    expect(node.getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(tree, { key: "End" });
    expect(document.activeElement).toBe(screen.getByTestId("space-node-.git"));
    fireEvent.keyDown(tree, { key: "Home" });
    expect(document.activeElement).toBe(sessions);
    // The session node offers Open session.
    fireEvent.keyDown(tree, { key: "ArrowDown" });
    fireEvent.keyDown(tree, { key: "Enter" });
    fireEvent.click(within(screen.getByTestId("space-preview")).getByRole("button", { name: "Open session" }));
    expect(onOpenSession).toHaveBeenCalledWith("s1");
    expect(within(tree).getAllByRole("treeitem").filter((item) => item.tabIndex === 0)).toHaveLength(1);
  });

  test("the preview shows JSON pretty-printed, JSONL by records with Open session, Markdown rendered, a cut, a binary and a withheld file", async () => {
    const { onOpenSession } = await openExplore();
    fireEvent.click(screen.getByTestId("space-node-project.json"));
    const json = await screen.findByTestId("space-preview-text");
    expect(json.textContent).toContain('"remote": "git@github.com:jane/academy.git"');
    expect(calls("space.read").at(-1)).toEqual({ repository: KEY, path: "project.json" });
    expect(screen.getByTestId("space-preview").textContent).toContain("4.1 KB");
    fireEvent.click(screen.getByTestId("space-node-sessions"));
    await screen.findByTestId("space-node-session:s1");
    fireEvent.click(screen.getByTestId("space-node-session:s1"));
    fireEvent.click(screen.getByTestId("space-node-sessions/s1.records.jsonl"));
    const jsonl = await screen.findByTestId("space-preview-jsonl");
    expect(jsonl.textContent).toContain("3 records");
    expect(jsonl.textContent).toContain("reads better as a conversation");
    expect(screen.getByTestId("space-preview-owner").textContent).toBe('"Fix the login redirect"');
    fireEvent.click(within(jsonl).getByRole("button", { name: "Open session" }));
    expect(onOpenSession).toHaveBeenCalledWith("s1");
    const reads = calls("space.read").length;
    fireEvent.click(screen.getByTestId("space-node-sessions/s1.hints.json"));
    expect(screen.getByTestId("space-preview-withheld").textContent).toBe("May hold provider tokens — not shown");
    expect(calls("space.read")).toHaveLength(reads);
    fireEvent.click(screen.getByTestId("space-node-README.md"));
    await screen.findByTestId("space-preview-markdown");
    expect(screen.getByRole("heading", { name: "Hello" })).toBeTruthy();
    fireEvent.click(screen.getByTestId("space-node-spex.yaml"));
    await waitFor(() => expect(screen.getByTestId("space-preview").textContent).toContain("Showing the first 2,000 lines"));
    fireEvent.click(screen.getByTestId("space-node-notes.bin"));
    expect(screen.getByTestId("space-preview").textContent).toContain("binary file · 8.8 KB");
    fireEvent.click(screen.getByTestId("space-node-packages"));
    expect(screen.getByTestId("space-preview").textContent).toContain("installed spec packages · 1 entry");
  });

  test("a read the core withheld is known by its kind, whatever language its reason speaks", async () => {
    await openExplore();
    fireEvent.click(screen.getByTestId("space-node-sessions"));
    await screen.findByTestId("space-node-session:s2");
    fireEvent.click(screen.getByTestId("space-node-session:s2"));
    // The entry says text, so the read goes out and comes back
    // withheld with a reason in the home's language (space-24).
    fireEvent.click(screen.getByTestId("space-node-sessions/s2.json"));
    const withheld = await screen.findByTestId("space-preview-withheld");
    expect(withheld.textContent).toBe("May hold provider tokens — not shown");
    expect(screen.getByTestId("space-preview").textContent).not.toContain("可能包含提供方令牌");
  });

  test("the tree/preview divider is a separator nudged by arrow keys and remembered", async () => {
    await openExplore();
    const divider = screen.getByRole("separator", { name: "Resize the tree pane" });
    expect(divider.getAttribute("aria-valuenow")).toBe("40");
    fireEvent.keyDown(divider, { key: "ArrowRight" });
    expect(useAppStore.getState().spaceSplit).toBe(42);
    fireEvent.keyDown(divider, { key: "Home" });
    expect(useAppStore.getState().spaceSplit).toBe(40);
    fireEvent.keyDown(divider, { key: "ArrowLeft" });
    expect(divider.getAttribute("aria-valuenow")).toBe("38");
  });
});

describe("SPACE: reveal and copy (space-26)", () => {
  test("with the native bridge the home and the clone reveal in the file manager; a path it refuses says so", async () => {
    const revealPath = vi.fn<(path: string) => Promise<boolean>>().mockResolvedValue(true);
    (window as { spexNative?: unknown }).spexNative = { pickDirectory: vi.fn(), revealPath };
    await renderSpace(repoState());
    const reveal = screen.getByTestId("space-path-reveal");
    expect(reveal.textContent).toMatch(/^Show in (Finder|folder)$/);
    fireEvent.click(reveal);
    expect(revealPath).toHaveBeenCalledWith(HOME);
    fireEvent.click(screen.getByTestId("space-clone-path-reveal"));
    expect(revealPath).toHaveBeenLastCalledWith(CLONE);
    revealPath.mockResolvedValueOnce(false);
    fireEvent.click(reveal);
    await waitFor(() => expect(live()).toBe("Couldn't show it in the file manager"));
  });

  test("with no clipboard access Copy path falls back to a selectable read-only field", async () => {
    await renderSpace(repoState());
    fireEvent.click(screen.getByTestId("space-path-copy"));
    const field = screen.getByTestId("space-path-field") as HTMLInputElement;
    expect(field.readOnly).toBe(true);
    expect(field.value).toBe(HOME);
    expect(live()).toContain("shown to select");
  });
});

describe("SPACE: copy and roles (space-27, space-44)", () => {
  const GIT_WORDS = /\b(ours|theirs|HEAD|origin\/main|origin\/spex|MERGE_HEAD)\b/;

  test("no visible text says ours, theirs, HEAD, origin/spex or MERGE_HEAD in any state", async () => {
    const states: GroupsState[] = [
      base({}, [repo({ state: "local-only", branch: null })]),
      repoState(),
      repoState({ incoming: [SESSION_UNIT, SETTINGS_UNIT], conflicts: CONFLICTS, sync: { phase: "choices", savedCommit: null } }),
      repoState({ sync: { phase: "running", op: "sync", step: "apply", since: NOW, cancelable: false } }),
      repoState({ branch: { ...BRANCH, unrelated: true, mergePending: true }, sync: { phase: "unrelated" } }, { diagnostics: [MERGE_DIAGNOSTIC] }),
      repoState({ sync: { phase: "stopped", op: "sync", step: "push", cause: "rejected", message: "The host changed again", guidance: "Sync again.", retry: true } }),
      repoState({ sync: { phase: "done", at: NOW, sent: 1, received: 2, pushed: true } }),
    ];
    for (const state of states) {
      await renderSpace(state);
      // The issues list, opened, counts too.
      const issues = screen.queryByTestId("space-issues");
      if (issues) fireEvent.click(issues);
      expect(document.body.textContent ?? "").not.toMatch(GIT_WORDS);
      fireEvent.click(screen.getByRole("tab", { name: "Explore" }));
      await screen.findByTestId("space-tree");
      expect(document.body.textContent ?? "").not.toMatch(GIT_WORDS);
      cleanup();
    }
  });

  test("every control reads at most 14 characters, its busy form included (space-28)", async () => {
    const states: GroupsState[] = [
      base({}, [repo({ state: "local-only", branch: null })]),
      repoState({ incoming: [SESSION_UNIT, SETTINGS_UNIT], conflicts: CONFLICTS, sync: { phase: "choices", savedCommit: null } }),
      repoState({ sync: { phase: "running", op: "sync", step: "push", since: NOW, cancelable: true } }),
      repoState({ sync: { phase: "stopped", op: "sync", step: "push", cause: "git", message: "x", guidance: "y", retry: true } }),
    ];
    for (const state of states) {
      await renderSpace(state);
      for (const button of screen.getAllByRole("button")) {
        // A repository's row is a row, its words its own (space-28).
        if (button.dataset.testid?.startsWith("space-repo-")) continue;
        const text = (button.textContent ?? "").trim();
        expect(text.length, `"${text}"`).toBeLessThanOrEqual(14);
      }
      cleanup();
    }
  });

  test("the groups, the tabs, the tree, the picker's groups and the live region are named for assistive technology", async () => {
    await renderSpace(repoState({ incoming: [SESSION_UNIT], conflicts: [CONFLICTS[0]], sync: { phase: "choices", savedCommit: null } }));
    expect(screen.getByRole("region", { name: "Groups" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Your groups" })).toBeTruthy();
    const syncTab = screen.getByRole("tab", { name: "Sync" });
    const exploreTab = screen.getByRole("tab", { name: "Explore" });
    expect(syncTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel", { name: "Sync" })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Fix the login redirect" })).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
    syncTab.focus();
    fireEvent.keyDown(syncTab, { key: "ArrowRight" });
    expect(exploreTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(exploreTab);
    await screen.findByRole("tree", { name: "Files in academy-spex" });
    expect(screen.getByRole("tabpanel", { name: "Explore" })).toBeTruthy();
    expect(screen.getByRole("separator", { name: "Resize the tree pane" })).toBeTruthy();
  });
});
