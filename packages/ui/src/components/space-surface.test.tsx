// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Space surface over a mocked client (DR-057): the header's fields
// and primary control by state (space-1), the event-driven re-read
// (space-2), setup with Initialize, Join and the remote row
// (space-3..6), the local and incoming lists with Open session and View
// diff (space-7, space-8, space-10), the running rail and Stop
// (space-12, space-16), the picker, its keyboard and the Apply confirm
// (space-9, space-17, space-18), the stopped, done and unrelated cards
// (space-13, space-15), the explorer tree, previews and the privacy
// panel (space-23..25), reveal and copy (space-26), the copy law
// (space-27) and the roles assistive technology needs (space-44).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type {
  SessionInfo,
  SpaceConflict,
  SpaceEntry,
  SpaceReadResult,
  SpaceState,
  SpaceUnit,
} from "@sublang/spex-core/protocol";

import { SpaceSurface } from "./SpaceSurface.js";
import {
  deliverServerMessageForTests,
  setClientForTests,
  useAppStore,
} from "../state/store.js";

const NOW = Date.now();
const MIN = 60_000;
const HOUR = 60 * MIN;
const HOME = "/Users/jane/.spex";

const commandMock = vi.fn();

let current: SpaceState;
let initGate: Promise<void> | undefined;

function calls(type: string) {
  return commandMock.mock.calls
    .filter(([name]) => name === type)
    .map(([, fields]) => fields as Record<string, unknown>);
}

const REPO: NonNullable<SpaceState["repository"]> = {
  branch: "main",
  remote: "git@github.com:jane/spex-space.git",
  upstream: true,
  ahead: 2,
  behind: 1,
  checkedAt: NOW - 5 * MIN,
  remoteEmpty: false,
  unrelated: false,
  mergePending: false,
  identityFallback: false,
};

const SESSION_UNIT: SpaceUnit = {
  unit: "sessions/s1",
  kind: "session",
  label: "Fix the login redirect",
  detail: "12 turns",
  change: "updated",
  project: { id: "p1", name: "spex-academy" },
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
const QUEUE_UNIT: SpaceUnit = {
  unit: "intents/p1.jsonl",
  kind: "queue",
  label: "3 changes in spex-academy's queue",
  change: "updated",
  project: { id: "p1", name: "spex-academy" },
  paths: ["intents/p1.jsonl"],
  diff: false,
};
const PROJECTS_UNIT: SpaceUnit = {
  unit: "projects.json",
  kind: "projects",
  label: 'Registered "docs-site"',
  change: "updated",
  paths: ["projects.json"],
  diff: false,
};
const SETTINGS_UNIT: SpaceUnit = {
  unit: "playbook/playbook.config.yaml",
  kind: "settings",
  label: "Settings changed",
  change: "updated",
  paths: ["playbook/playbook.config.yaml"],
  diff: true,
};
const PLAYBOOK_UNIT: SpaceUnit = {
  unit: "playbooks/code",
  kind: "playbook",
  label: "Playbook code",
  detail: "code.md",
  change: "updated",
  paths: ["playbooks/code/code.md"],
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
  label: "Tighten the expiry tests",
  detail: "9 turns",
  sessionId: "s2",
  project: { id: "p2", name: "spex" },
  paths: ["sessions/s2.json", "sessions/s2.records.jsonl"],
};
const INCOMING_QUEUE: SpaceUnit = {
  ...QUEUE_UNIT,
  unit: "intents/p2.jsonl",
  label: "1 change in spex's queue",
  project: { id: "p2", name: "spex" },
  paths: ["intents/p2.jsonl"],
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

function base(over: Partial<SpaceState> = {}): SpaceState {
  return {
    home: HOME,
    outside: [],
    git: { ok: true, version: "2.45.0" },
    repository: null,
    local: [],
    incoming: [],
    conflicts: [],
    lastSync: null,
    diagnostics: [],
    sync: { phase: "idle" },
    ...over,
  };
}

/** A repository with local changes of every kind, listed out of order
 * so the grouping is what orders them. */
function repoState(over: Partial<SpaceState> = {}): SpaceState {
  return base({
    repository: REPO,
    local: [OTHER_UNIT, SETTINGS_UNIT, SESSION_UNIT, RULES_UNIT, QUEUE_UNIT, PLAYBOOK_UNIT, PROJECTS_UNIT, DELETED_SESSION],
    incoming: [INCOMING_SESSION, INCOMING_QUEUE],
    lastSync: { at: NOW - 2 * HOUR, sent: 3, received: 1 },
    ...over,
  });
}

const owner = (sessionId: string, title: string) => ({
  sessionId,
  title,
  projectId: "p1",
  name: "spex-academy",
});

const TREE: Record<string, SpaceEntry[]> = {
  "": [
    { name: "sessions", path: "sessions", kind: "dir", family: "session bundles", sync: "shared", count: 4, preview: "none" },
    { name: "local", path: "local", kind: "dir", family: "local project paths", sync: "local", count: 1, preview: "none" },
    { name: "prefs.json", path: "prefs.json", kind: "file", family: "preferences", sync: "local", size: 512, preview: "text" },
    { name: "projects.json", path: "projects.json", kind: "file", family: "project registry", sync: "shared", size: 4200, preview: "text" },
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
  "projects.json": { kind: "text", text: '{"projects":[{"id":"p1"}]}', lines: 1, truncated: false },
  "sessions/s1.records.jsonl": {
    kind: "text",
    text: '{"type":"turn_started"}\n{"type":"player_prompt"}\n{"type":"turn_finished"}\n',
    lines: 3,
    truncated: false,
  },
  "sessions/s1.json": { kind: "text", text: '{"kind":"captain-session"}', lines: 1, truncated: false },
  "README.md": { kind: "text", text: "# Hello\n\nSome *text*", lines: 3, truncated: false },
  "prefs.json": { kind: "text", text: "{}", lines: 2000, truncated: true },
};

async function renderSpace(state: SpaceState) {
  current = state;
  const onOpenSession = vi.fn<(sessionId: string) => void>();
  const onOpenPalette = vi.fn<() => void>();
  render(<SpaceSurface onOpenSession={onOpenSession} onOpenPalette={onOpenPalette} />);
  await screen.findByTestId("space-header");
  return { onOpenSession, onOpenPalette };
}

function deliver(state: SpaceState) {
  act(() => deliverServerMessageForTests({ type: "space.state", state }));
}

const live = () => screen.getByTestId("space-live").textContent ?? "";

beforeEach(() => {
  commandMock.mockReset();
  initGate = undefined;
  commandMock.mockImplementation(async (type: string, fields: Record<string, unknown> = {}) => {
    switch (type) {
      case "space.get":
        return current;
      case "space.init":
        if (initGate) await initGate;
        return {
          ...current,
          repository: { ...REPO, remote: (fields.remote as string | undefined) ?? null, checkedAt: null, ahead: null, behind: null },
        };
      case "space.remote.set":
        return { ...current, repository: { ...current.repository!, remote: fields.url as string | null, checkedAt: null } };
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

describe("SPACE: the header at a glance (space-1) and its re-reads (space-2)", () => {
  test("a home that is not a repository reads its path, 'Not a repository yet' and the setup card", async () => {
    await renderSpace(base({ outside: [{ what: "config", path: "/etc/spex/playbook.config.yaml" }] }));
    const path = screen.getByTestId("space-path");
    expect(path.textContent).toContain("~/.spex");
    expect(path.getAttribute("title")).toBe(HOME);
    expect(screen.getByTestId("space-repository").textContent).toContain("Not a repository yet");
    expect(screen.queryByTestId("space-remote")).toBeNull();
    // The header ends with the state's primary control: the setup card
    // with Initialize and Join a space around the remote field (space-3).
    const setup = screen.getByTestId("space-setup");
    expect(within(setup).getByRole("button", { name: "Initialize" })).toBeTruthy();
    expect(within(setup).getByRole("button", { name: "Join a space" })).toBeTruthy();
    expect(within(setup).getByText("Remote (optional)")).toBeTruthy();
    expect(setup.textContent).toContain("stay on this device");
    // No changes list stands (space-3).
    expect(screen.queryByText(/^Local changes/)).toBeNull();
    expect(screen.queryByTestId("space-local-list")).toBeNull();
    const outside = screen.getByTestId("space-outside-config");
    expect(outside.textContent).toContain("outside the space; not shared");
    expect(outside.getAttribute("title")).toBe("/etc/spex/playbook.config.yaml");
    expect(screen.getByRole("tablist", { name: "Space views" })).toBeTruthy();
  });

  test("a repository reads its branch, its remote with the user removed, ahead and behind, the last sync and the counts", async () => {
    await renderSpace(
      repoState({
        diagnostics: [{ file: "sessions/x.json", reason: "recorded at /Users/jane/code/infra — bind that folder to a project", blocking: false }],
        repository: { ...REPO, mergePending: true, identityFallback: true },
      }),
    );
    expect(screen.getByTestId("space-repository").textContent).toContain("main");
    expect(screen.getByTestId("space-repository").textContent).toContain("committed as Spex");
    expect(screen.getByTestId("space-remote-url").textContent).toBe("github.com:jane/spex-space.git");
    expect(screen.getByRole("button", { name: "Change remote" })).toBeTruthy();
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
    expect(lastSync.getAttribute("title")).toBe(new Date(NOW - 2 * HOUR).toLocaleString());
    expect(screen.getByTestId("space-local-count").textContent).toBe("8 changes");
    expect(screen.getByTestId("space-local-count").getAttribute("aria-label")).toBe("8 local changes");
    // Issues count the diagnostics plus the pending merge, and open in place.
    const issues = screen.getByTestId("space-issues");
    expect(issues.textContent).toContain("2 issues");
    expect(screen.queryByTestId("space-issues-list")).toBeNull();
    fireEvent.click(issues);
    const list = screen.getByTestId("space-issues-list");
    expect(list.textContent).toContain("A Git merge is pending");
    expect(list.textContent).toContain("sessions/x.json");
    expect(within(list).getByRole("button", { name: "Open palette" })).toBeTruthy();
    expect(screen.getByTestId("space-merge-note").textContent).toContain("Finish or abort it there");
  });

  test("ahead and behind are absent until a check has run, and 'Never synced' stands with no sync", async () => {
    await renderSpace(repoState({ repository: { ...REPO, checkedAt: null, ahead: null, behind: null }, lastSync: null }));
    expect(screen.queryByTestId("space-ahead-behind")).toBeNull();
    expect(screen.getByTestId("space-last-sync").textContent).toContain("Never synced");
    expect(screen.getByText("Not checked yet")).toBeTruthy();
  });

  test("with no git the guidance replaces every other field and Copy path stays", async () => {
    await renderSpace(base({ git: { ok: false, guidance: "Install Git from git-scm.com, then reopen Space." } }));
    expect(screen.getByTestId("space-no-git").textContent).toContain("Git is not installed");
    expect(screen.getByTestId("space-no-git").textContent).toContain("git-scm.com");
    expect(screen.queryByTestId("space-repository")).toBeNull();
    expect(screen.queryByTestId("space-setup")).toBeNull();
    expect(screen.getByRole("button", { name: "Copy path" })).toBeTruthy();
    expect(screen.getByTestId("space-sync-tab").textContent).toContain("Install Git, then reopen Space");
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

  test("a space.state broadcast replaces the state wholesale", async () => {
    await renderSpace(base());
    expect(screen.getByTestId("space-repository").textContent).toContain("Not a repository yet");
    deliver(repoState());
    expect(screen.getByTestId("space-repository").textContent).toContain("main");
    expect(screen.getByRole("button", { name: "Sync" })).toBeTruthy();
    expect(useAppStore.getState().space?.repository?.branch).toBe("main");
  });

  test("session, ledger and configuration announcements re-read once, debounced by 300 ms, never on a timer", async () => {
    await renderSpace(repoState());
    const before = calls("space.get").length;
    vi.useFakeTimers();
    act(() => {
      deliverServerMessageForTests({
        type: "session.state",
        session: { id: "s1", projectId: "p1", projectPath: "/tmp/p1", createdAt: NOW, live: false, endedAt: NOW, players: [], initialVisible: [], turns: 1, failed: false } as SessionInfo,
      });
      deliverServerMessageForTests({ type: "session.removed", sessionId: "s9", projectId: "p1" });
      deliverServerMessageForTests({ type: "intents.changed", projectIds: ["p1"] });
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

describe("SPACE: setting up (space-3..6)", () => {
  test("Initialize reads 'Initializing…' in flight and sends the remote typed beside it", async () => {
    await renderSpace(base());
    let release!: () => void;
    initGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    fireEvent.change(screen.getByTestId("space-setup-remote"), { target: { value: "git@github.com:jane/spex-space.git" } });
    fireEvent.click(screen.getByRole("button", { name: "Initialize" }));
    expect(await screen.findByRole("button", { name: "Initializing…" })).toBeTruthy();
    release();
    await waitFor(() => expect(screen.getByTestId("space-repository").textContent).toContain("main"));
    expect(calls("space.init")).toEqual([{ remote: "git@github.com:jane/spex-space.git" }]);
    // The reply is the new state: the header reads main, the remote and Never synced (space-4).
    expect(screen.getByTestId("space-remote-url").textContent).toBe("github.com:jane/spex-space.git");
    expect(screen.getByTestId("space-last-sync").textContent).toContain("Never synced");
  });

  test("Initialize with no remote sends none, and a refusal lands on the card", async () => {
    await renderSpace(base());
    fireEvent.click(screen.getByRole("button", { name: "Initialize" }));
    await waitFor(() => expect(calls("space.init")).toEqual([{}]));
    cleanup();
    commandMock.mockImplementation(async (type: string) => {
      if (type === "space.init") throw new Error("intents/p1.jsonl: malformed act on line 3");
      return current;
    });
    await renderSpace(base());
    fireEvent.click(screen.getByRole("button", { name: "Initialize" }));
    expect((await screen.findByRole("alert")).textContent).toContain("intents/p1.jsonl");
  });

  test("Join a space needs a URL, then initializes, sets the remote and starts a joining sync reading 'Joining…'", async () => {
    await renderSpace(base());
    fireEvent.click(screen.getByRole("button", { name: "Join a space" }));
    expect(screen.getByRole("alert").textContent).toBe("Required to join");
    expect(document.activeElement).toBe(screen.getByTestId("space-setup-remote"));
    expect(calls("space.init")).toHaveLength(0);
    fireEvent.change(screen.getByTestId("space-setup-remote"), { target: { value: "/srv/spex-space.git" } });
    fireEvent.click(screen.getByRole("button", { name: "Join a space" }));
    await waitFor(() => expect(calls("space.sync")).toEqual([{ join: true }]));
    expect(calls("space.init")).toEqual([{ remote: "/srv/spex-space.git" }]);
    deliver(repoState({ sync: { phase: "running", op: "sync", step: "save", since: NOW, cancelable: false } }));
    expect(screen.getByTestId("space-primary").textContent).toBe("Joining…");
    deliver(repoState({ sync: { phase: "done", at: NOW, sent: 1, received: 3, pushed: true } }));
    expect(screen.getByTestId("space-primary").textContent).toBe("Sync");
  });

  test("the remote row edits in place with Save and Cancel, Escape cancelling, the field following the save (space-5)", async () => {
    await renderSpace(repoState({ repository: { ...REPO, remote: null } }));
    expect(screen.getByTestId("space-remote").textContent).toContain("No remote");
    fireEvent.click(screen.getByRole("button", { name: "Add remote" }));
    const input = screen.getByTestId("space-remote-input");
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByTestId("space-remote-editor")).toBeNull();
    expect(calls("space.remote.set")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Add remote" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("space-remote-editor")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add remote" }));
    fireEvent.change(screen.getByTestId("space-remote-input"), { target: { value: "https://jane@github.com/jane/spex-space.git" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByTestId("space-remote-editor")).toBeNull());
    expect(calls("space.remote.set")).toEqual([{ url: "https://jane@github.com/jane/spex-space.git" }]);
    expect(screen.getByTestId("space-remote-url").textContent).toBe("https://github.com/jane/spex-space.git");
    // Clearing the field removes the remote.
    fireEvent.click(screen.getByRole("button", { name: "Change remote" }));
    fireEvent.change(screen.getByTestId("space-remote-input"), { target: { value: "" } });
    fireEvent.keyDown(screen.getByTestId("space-remote-input"), { key: "Enter" });
    await waitFor(() => expect(calls("space.remote.set")).toHaveLength(2));
    expect(calls("space.remote.set")[1]).toEqual({ url: null });
  });

  test("a refused remote stays in the editor with its reason", async () => {
    await renderSpace(repoState());
    commandMock.mockImplementationOnce(async () => {
      throw new Error("the app stores no credential — use an SSH key or the machine's credential helper");
    });
    fireEvent.click(screen.getByRole("button", { name: "Change remote" }));
    fireEvent.change(screen.getByTestId("space-remote-input"), { target: { value: "https://u:secret@host/x" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toContain("stores no credential");
    expect(screen.getByTestId("space-remote-editor")).toBeTruthy();
  });
});

describe("SPACE: changes (space-7, space-8, space-10)", () => {
  test("local units group by kind in order with their labels, chips and details; a session row opens its session", async () => {
    const { onOpenSession } = await renderSpace(repoState());
    const list = screen.getByTestId("space-local-list");
    const headings = within(list).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(["Sessions", "Queues", "Projects", "Settings", "Playbooks", "Sync rules", "Other"]);
    const session = screen.getByTestId("space-unit-mine-sessions/s1");
    expect(session.textContent).toContain("Fix the login redirect");
    expect(session.textContent).toContain("spex-academy");
    expect(session.textContent).toContain("12 turns");
    expect(session.textContent).toContain("updated");
    fireEvent.click(within(session).getByRole("button", { name: "Open session" }));
    expect(onOpenSession).toHaveBeenCalledWith("s1");
    // A deleted session offers nothing to open; a queue row offers no diff.
    const deleted = screen.getByTestId("space-unit-mine-sessions/s9");
    expect(deleted.textContent).toContain("deleted");
    expect(within(deleted).queryByRole("button", { name: "Open session" })).toBeNull();
    expect(within(screen.getByTestId("space-unit-mine-intents/p1.jsonl")).queryByRole("button", { name: "View diff" })).toBeNull();
    expect(screen.getByTestId("space-unit-mine-playbooks/code").textContent).toContain("code.md");
    expect(screen.getByTestId("space-unit-mine-projects.json").textContent).toContain('Registered "docs-site"');
  });

  test("with no local unit the list reads 'Nothing to send from this device'", async () => {
    await renderSpace(repoState({ local: [] }));
    expect(screen.getByText("Nothing to send from this device")).toBeTruthy();
    expect(screen.getByTestId("space-local-count").getAttribute("aria-label")).toBe("0 local changes");
  });

  test("View diff shows the line diff in place for the right side and Hide diff removes it", async () => {
    await renderSpace(repoState({ incoming: [{ ...SETTINGS_UNIT }] }));
    const row = screen.getByTestId("space-unit-mine-playbook/playbook.config.yaml");
    fireEvent.click(within(row).getByRole("button", { name: "View diff" }));
    const diffId = "space-diff-mine-playbook/playbook.config.yaml";
    await waitFor(() => expect(screen.getByTestId(diffId).textContent).toContain("+new: 2"));
    const diff = screen.getByTestId(diffId);
    expect(diff.textContent).toContain("-old: 1");
    expect(diff.textContent).toContain("This device against the common ancestor");
    expect(calls("space.diff")).toEqual([{ unit: "playbook/playbook.config.yaml", path: "playbook/playbook.config.yaml", side: "mine" }]);
    fireEvent.click(within(row).getByRole("button", { name: "Hide diff" }));
    expect(screen.queryByTestId("space-diff-mine-playbook/playbook.config.yaml")).toBeNull();
    const incoming = screen.getByTestId("space-unit-remote-playbook/playbook.config.yaml");
    fireEvent.click(within(incoming).getByRole("button", { name: "View diff" }));
    await waitFor(() => expect(calls("space.diff")).toHaveLength(2));
    expect(calls("space.diff")[1]).toEqual({ unit: "playbook/playbook.config.yaml", path: "playbook/playbook.config.yaml", side: "remote" });
  });

  test("Check remote fetches, reads 'Checking…' with Stop while it runs, and marks the units this device changed too", async () => {
    await renderSpace(repoState({ conflicts: [CONFLICTS[0]], incoming: [SESSION_UNIT, INCOMING_QUEUE] }));
    // The mark stands on the incoming row alone (space-8).
    expect(screen.getAllByTestId("space-choose-sessions/s1")).toHaveLength(1);
    expect(screen.getByTestId("space-unit-remote-sessions/s1").textContent).toContain("choose");
    expect(screen.getByTestId("space-unit-mine-sessions/s1").textContent).not.toContain("choose");
    fireEvent.click(screen.getByRole("button", { name: "Check remote" }));
    await waitFor(() => expect(calls("space.fetch")).toHaveLength(1));
    deliver(repoState({ sync: { phase: "running", op: "check", step: "check", since: NOW, cancelable: true } }));
    expect(screen.getByTestId("space-check").textContent).toBe("Checking…");
    expect(screen.getByTestId("space-step-line").textContent).toBe("Checking remote…");
    expect(screen.queryByTestId("space-step-save")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Stop" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() => expect(calls("space.cancel")).toHaveLength(1));
    // Sync waits while a check runs.
    expect((screen.getByTestId("space-primary") as HTMLButtonElement).disabled).toBe(true);
  });

  test("an empty remote and an unrelated one read as such", async () => {
    await renderSpace(repoState({ repository: { ...REPO, remoteEmpty: true, behind: 0 }, incoming: [] }));
    expect(screen.getByText("The remote is empty; Sync will send this space")).toBeTruthy();
    cleanup();
    await renderSpace(repoState({ repository: { ...REPO, unrelated: true }, incoming: [], sync: { phase: "unrelated" } }));
    expect(screen.getByTestId("space-unrelated").textContent).toContain("separate histories");
    expect(screen.queryByTestId("space-ahead-behind")).toBeNull();
    expect(screen.getByRole("button", { name: "Join" })).toBeTruthy();
  });
});

describe("SPACE: syncing (space-11, space-12, space-15, space-16)", () => {
  test("Sync sends the command and reads 'Syncing…' with the rail naming each step while it runs", async () => {
    await renderSpace(repoState());
    fireEvent.click(screen.getByRole("button", { name: "Sync" }));
    await waitFor(() => expect(calls("space.sync")).toEqual([{}]));
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
    await renderSpace(repoState({ repository: { ...REPO, remote: null } }));
    let sync = screen.getByTestId("space-primary") as HTMLButtonElement;
    expect(sync.disabled).toBe(true);
    expect(screen.getByTestId("space-primary-caption").textContent).toBe("Add a remote first");
    fireEvent.click(screen.getByRole("button", { name: "Add a remote first" }));
    expect(document.activeElement).toBe(screen.getByTestId("space-remote-input"));
    cleanup();
    await renderSpace(repoState({ repository: { ...REPO, branch: "laptop" } }));
    sync = screen.getByTestId("space-primary") as HTMLButtonElement;
    expect(sync.disabled).toBe(true);
    expect(screen.getByTestId("space-primary-caption").textContent).toBe("On laptop; check out main in a terminal");
    expect(screen.getByTestId("space-repository").textContent).toContain("unsupported");
    expect(screen.getByTestId("space-branch-note").textContent).toContain("check it out in a terminal");
    cleanup();
    await renderSpace(repoState({ repository: { ...REPO, mergePending: true } }));
    expect(screen.getByTestId("space-primary-caption").textContent).toBe("Finish or abort the merge in your terminal");
    cleanup();
    await renderSpace(repoState({ diagnostics: [{ file: "intents/p1.jsonl", reason: "malformed act on line 3", blocking: true }] }));
    expect(screen.getByTestId("space-primary-caption").textContent).toBe("intents/p1.jsonl: malformed act on line 3");
    // A blocking diagnostic lists first, before the changes.
    const tab = screen.getByTestId("space-sync-tab");
    expect(tab.firstElementChild?.getAttribute("data-testid")).toBe("space-issues-list");
  });

  test("a busy refusal from the core lands beside the control", async () => {
    await renderSpace(repoState());
    commandMock.mockImplementationOnce(async () => {
      throw new Error('Wait for "Fix the login redirect" in spex-academy');
    });
    fireEvent.click(screen.getByRole("button", { name: "Sync" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Wait for");
    expect(live()).toContain("Wait for");
  });

  test("a stopped sync shows the step, the cause, its guidance, Retry and Dismiss", async () => {
    await renderSpace(
      repoState({
        repository: { ...REPO, ahead: 3 },
        sync: {
          phase: "stopped",
          op: "sync",
          step: "push",
          cause: "unauthorized",
          message: "github.com did not accept this machine's key",
          guidance: "Set up an SSH key or credential helper for this machine and accept the host key once in a terminal; the app never asks for a password.",
          retry: true,
        },
      }),
    );
    const card = screen.getByTestId("space-stopped");
    expect(screen.getByTestId("space-stopped-title").textContent).toBe("Push stopped — github.com did not accept this machine's key");
    expect(card.textContent).toContain("never asks for a password");
    expect(card.textContent).toContain("saved locally (3 commits ahead)");
    expect(live()).toContain("Push stopped");
    expect(screen.getByTestId("space-status-dot").getAttribute("data-tone")).toBe("stopped");
    fireEvent.click(within(card).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(calls("space.sync")).toEqual([{}]));
    fireEvent.click(within(card).getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByTestId("space-stopped")).toBeNull();
  });

  test("Retry after a stopped check fetches again; a rejected push reads amber with 'changed again'", async () => {
    await renderSpace(
      repoState({
        sync: { phase: "stopped", op: "check", step: "check", cause: "unreachable", message: "Could not reach github.com", guidance: "Check the network or the URL.", retry: true },
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(calls("space.fetch")).toHaveLength(1));
    deliver(
      repoState({
        sync: { phase: "stopped", op: "sync", step: "push", cause: "rejected", message: "The remote changed again", guidance: "Sync again to take the new changes.", retry: true },
      }),
    );
    expect(screen.getByTestId("space-stopped-title").textContent).toContain("The remote changed again");
    expect(screen.getByTestId("space-status-dot").getAttribute("data-tone")).toBe("attention");
  });

  test("a finished sync reads its counts, or 'Everything is in sync' when nothing moved", async () => {
    await renderSpace(repoState({ sync: { phase: "done", at: NOW, sent: 5, received: 4, pushed: true } }));
    expect(screen.getByTestId("space-done-line").textContent).toBe("Synced just now · 5 sent · 4 received");
    fireEvent.click(within(screen.getByTestId("space-done")).getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByTestId("space-done")).toBeNull();
    deliver(repoState({ sync: { phase: "done", at: NOW, sent: 0, received: 0, pushed: true } }));
    expect(screen.getByTestId("space-done-line").textContent).toBe("Everything is in sync");
    expect(live()).toBe("Everything is in sync");
  });

  test("unrelated histories offer Join, confirmed inline with Cancel focused (space-13)", async () => {
    await renderSpace(repoState({ repository: { ...REPO, unrelated: true }, sync: { phase: "unrelated" } }));
    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    const confirm = screen.getByTestId("space-join-confirm");
    expect(confirm.textContent).toContain("Join both histories into one space?");
    expect(confirm.textContent).toContain("will ask you to choose");
    expect(document.activeElement).toBe(within(confirm).getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByTestId("space-join-confirm")).toBeNull();
    expect(calls("space.sync")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    fireEvent.click(within(screen.getByTestId("space-join-confirm")).getByRole("button", { name: "Join" }));
    await waitFor(() => expect(calls("space.sync")).toEqual([{ join: true }]));
  });

  test("controls are disabled while disconnected", async () => {
    await renderSpace(repoState());
    act(() => useAppStore.setState({ connection: "closed" }));
    expect((screen.getByTestId("space-primary") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("space-check") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Change remote" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("SPACE: choices (space-9, space-17, space-18)", () => {
  const choicesState = (over: Partial<SpaceState> = {}) =>
    repoState({
      incoming: [SESSION_UNIT, SETTINGS_UNIT, INCOMING_QUEUE],
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
    expect(within(session).getByLabelText(/Take remote/).parentElement?.textContent).toContain("updated 5h ago · 9 turns");
    expect(within(settings).getAllByRole("button", { name: "View diff" })).toHaveLength(2);
    expect(within(session).queryByRole("button", { name: "View diff" })).toBeNull();
    const apply = screen.getByTestId("space-apply") as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    expect(screen.getByTestId("space-chosen").textContent).toBe("0 of 2 chosen");
    fireEvent.click(within(session).getByLabelText(/Take remote/));
    expect(screen.getByTestId("space-chosen").textContent).toBe("1 of 2 chosen");
    expect(apply.disabled).toBe(true);
    fireEvent.click(within(settings).getByLabelText(/Keep mine/));
    expect(screen.getByTestId("space-chosen").textContent).toBe("2 of 2 chosen");
    expect(apply.disabled).toBe(false);
  });

  test("arrow keys move within a group, and All mine / All remote fill every row", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "All remote" }));
    expect(screen.getByTestId("space-chosen").textContent).toBe("2 of 2 chosen");
    for (const group of screen.getAllByRole("radiogroup")) {
      expect((within(group).getByLabelText(/Take remote/) as HTMLInputElement).checked).toBe(true);
    }
    fireEvent.click(screen.getByRole("button", { name: "All mine" }));
    for (const group of screen.getAllByRole("radiogroup")) {
      expect((within(group).getByLabelText(/Keep mine/) as HTMLInputElement).checked).toBe(true);
    }
  });

  test("Apply asks one inline confirm with Cancel focused; Escape keeps the choices; confirming syncs with them", async () => {
    await renderSpace(choicesState());
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Fix the login redirect" })).getByLabelText(/Take remote/));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Settings changed" })).getByLabelText(/Keep mine/));
    fireEvent.click(screen.getByTestId("space-apply"));
    const confirm = screen.getByTestId("space-apply-confirm");
    expect(confirm.textContent).toContain("Replace 1 unit with the remote's version?");
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
        { choices: { "sessions/s1": "remote", "playbook/playbook.config.yaml": "mine" } },
      ]),
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
    expect(within(group).getByLabelText(/Take remote/).parentElement?.textContent).toContain("updated 1h ago · 13 turns");
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
    expect(screen.getByTestId("space-conflict-playbook/playbook.config.yaml").getAttribute("data-marked")).toBe("1");
    expect(screen.getByTestId("space-conflict-sessions/s1").getAttribute("data-marked")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "All mine" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(calls("space.sync")).toEqual([
        { choices: { "sessions/s1": "mine", "playbook/playbook.config.yaml": "mine" } },
      ]),
    );
  });
});

describe("SPACE: the explorer (space-23, space-24, space-25)", () => {
  async function openExplore(state: SpaceState = repoState()) {
    const rendered = await renderSpace(state);
    fireEvent.click(screen.getByRole("tab", { name: "Explore" }));
    await screen.findByTestId("space-tree");
    await screen.findByTestId("space-node-projects.json");
    return rendered;
  }

  test("the tree is one ARIA tree with a single focus stop, every entry annotated with its family and sharing mark", async () => {
    await openExplore();
    const tree = screen.getByRole("tree", { name: "Files in the space" });
    const items = within(tree).getAllByRole("treeitem");
    expect(items.filter((item) => item.tabIndex === 0)).toHaveLength(1);
    expect(screen.getByTestId("space-node-projects.json").textContent).toContain("project registry");
    expect(screen.getByTestId("space-node-projects.json").textContent).toContain("Shared");
    expect(screen.getByTestId("space-node-prefs.json").textContent).toContain("Stays here");
    expect(screen.getByTestId("space-node-README.md").textContent).toContain("Not a Spex file");
    expect(screen.getByTestId("space-node-README.md").textContent).toContain("Not yet shared");
    expect(screen.getByTestId("space-node-sessions").textContent).toContain("4 entries");
    const git = screen.getByTestId("space-node-.git");
    expect(git.textContent).toContain("Git data");
    expect(git.getAttribute("aria-expanded")).toBeNull();
    fireEvent.click(git);
    expect(calls("space.tree").some((fields) => fields.path === ".git")).toBe(false);
    expect(screen.getByTestId("space-preview").textContent).toContain("not shown");
  });

  test("arrow keys move, disclose and collapse; a session's files group under one node titled by the session", async () => {
    const { onOpenSession } = await openExplore();
    const tree = screen.getByRole("tree", { name: "Files in the space" });
    const sessions = screen.getByTestId("space-node-sessions");
    sessions.focus();
    fireEvent.keyDown(tree, { key: "ArrowRight" });
    expect(sessions.getAttribute("aria-expanded")).toBe("true");
    const node = await screen.findByTestId("space-node-session:s1");
    expect(calls("space.tree").at(-1)).toEqual({ path: "sessions" });
    expect(node.textContent).toContain("Fix the login redirect");
    expect(node.textContent).toContain("spex-academy");
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
    fireEvent.click(screen.getByTestId("space-node-projects.json"));
    const json = await screen.findByTestId("space-preview-text");
    expect(json.textContent).toContain('"projects": [');
    expect(screen.getByTestId("space-preview").textContent).toContain("4.1 KB");
    fireEvent.click(screen.getByTestId("space-node-sessions"));
    await screen.findByTestId("space-node-session:s1");
    fireEvent.click(screen.getByTestId("space-node-session:s1"));
    fireEvent.click(screen.getByTestId("space-node-sessions/s1.records.jsonl"));
    const jsonl = await screen.findByTestId("space-preview-jsonl");
    expect(jsonl.textContent).toContain("3 records");
    expect(jsonl.textContent).toContain("reads better as a conversation");
    expect(screen.getByTestId("space-preview-owner").textContent).toContain('"Fix the login redirect" — spex-academy');
    fireEvent.click(within(jsonl).getByRole("button", { name: "Open session" }));
    expect(onOpenSession).toHaveBeenCalledWith("s1");
    const reads = calls("space.read").length;
    fireEvent.click(screen.getByTestId("space-node-sessions/s1.hints.json"));
    expect(screen.getByTestId("space-preview-withheld").textContent).toBe("May hold provider tokens — not shown");
    expect(calls("space.read")).toHaveLength(reads);
    fireEvent.click(screen.getByTestId("space-node-README.md"));
    await screen.findByTestId("space-preview-markdown");
    expect(screen.getByRole("heading", { name: "Hello" })).toBeTruthy();
    fireEvent.click(screen.getByTestId("space-node-prefs.json"));
    await waitFor(() => expect(screen.getByTestId("space-preview").textContent).toContain("Showing the first 2,000 lines"));
    fireEvent.click(screen.getByTestId("space-node-notes.bin"));
    expect(screen.getByTestId("space-preview").textContent).toContain("binary file · 8.8 KB");
    fireEvent.click(screen.getByTestId("space-node-local"));
    expect(screen.getByTestId("space-preview").textContent).toContain("local project paths · 1 entry");
  });

  test("'Stays on this device' lists the seven families with their reasons and remembers its fold", async () => {
    await openExplore();
    const toggle = screen.getByTestId("space-privacy-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toContain("7 kinds");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const panel = screen.getByTestId("space-privacy");
    for (const family of [
      "provider hints",
      "leases and locks",
      "local project paths",
      "preferences",
      "forge cache",
      "migration receipts and inputs",
      "config backups and temporary files",
    ]) {
      expect(within(panel).getByText(family)).toBeTruthy();
    }
    expect(panel.textContent).toContain("they work nowhere else");
    expect(panel.textContent).toContain("where you last stopped reading in each session");
    expect(useAppStore.getState().spacePrivacyCollapsed).toBe(false);
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(useAppStore.getState().spacePrivacyCollapsed).toBe(true);
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
  test("with the native bridge the path reveals in the file manager; a path it refuses says so", async () => {
    const revealPath = vi.fn<(path: string) => Promise<boolean>>().mockResolvedValue(true);
    (window as { spexNative?: unknown }).spexNative = { pickDirectory: vi.fn(), revealPath };
    await renderSpace(repoState());
    const reveal = screen.getByTestId("space-path-reveal");
    expect(reveal.textContent).toMatch(/^Show in (Finder|folder)$/);
    fireEvent.click(reveal);
    expect(revealPath).toHaveBeenCalledWith(HOME);
    revealPath.mockResolvedValueOnce(false);
    fireEvent.click(reveal);
    await waitFor(() => expect(live()).toBe("Couldn't show it in the file manager"));
  });

  test("without the bridge Copy path stands instead, acknowledging the copy in words", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await renderSpace(repoState());
    expect(screen.queryByTestId("space-path-reveal")).toBeNull();
    const copy = screen.getByTestId("space-path-copy");
    fireEvent.click(copy);
    expect(writeText).toHaveBeenCalledWith(HOME);
    await waitFor(() => expect(copy.textContent).toBe("Copied"));
    expect(live()).toBe(`Copied ${HOME}`);
    expect(copy.getAttribute("aria-label")).toBe("Copy path");
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
  const GIT_WORDS = /\b(ours|theirs|HEAD|origin\/main|MERGE_HEAD)\b/;

  test("no visible text says ours, theirs, HEAD, origin/main or MERGE_HEAD in any state", async () => {
    const states: SpaceState[] = [
      base(),
      repoState(),
      repoState({ incoming: [SESSION_UNIT, SETTINGS_UNIT], conflicts: CONFLICTS, sync: { phase: "choices", savedCommit: null } }),
      repoState({ sync: { phase: "running", op: "sync", step: "apply", since: NOW, cancelable: false } }),
      repoState({ repository: { ...REPO, unrelated: true, mergePending: true }, sync: { phase: "unrelated" } }),
      repoState({ sync: { phase: "stopped", op: "sync", step: "push", cause: "rejected", message: "The remote changed again", guidance: "Sync again.", retry: true } }),
      repoState({ sync: { phase: "done", at: NOW, sent: 1, received: 2, pushed: true } }),
    ];
    for (const state of states) {
      await renderSpace(state);
      expect(document.body.textContent ?? "").not.toMatch(GIT_WORDS);
      fireEvent.click(screen.getByRole("tab", { name: "Explore" }));
      await screen.findByTestId("space-tree");
      expect(document.body.textContent ?? "").not.toMatch(GIT_WORDS);
      cleanup();
    }
  });

  test("every control reads at most 14 characters, its busy form included (space-28)", async () => {
    const states: SpaceState[] = [
      base(),
      repoState({ incoming: [SESSION_UNIT, SETTINGS_UNIT], conflicts: CONFLICTS, sync: { phase: "choices", savedCommit: null } }),
      repoState({ sync: { phase: "running", op: "sync", step: "push", since: NOW, cancelable: true } }),
      repoState({ sync: { phase: "stopped", op: "sync", step: "push", cause: "git", message: "x", guidance: "y", retry: true } }),
    ];
    for (const state of states) {
      await renderSpace(state);
      for (const button of screen.getAllByRole("button")) {
        const text = (button.textContent ?? "").trim();
        if (button.closest('[data-testid="space-setup"]') && !/^(Initialize|Join a space|Initializing…|Joining…)$/.test(text)) continue;
        expect(text.length, `"${text}"`).toBeLessThanOrEqual(14);
      }
      cleanup();
    }
  });

  test("the tabs, the tree, the picker's groups and the live region are named for assistive technology", async () => {
    await renderSpace(repoState({ incoming: [SESSION_UNIT], conflicts: [CONFLICTS[0]], sync: { phase: "choices", savedCommit: null } }));
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
    await screen.findByRole("tree", { name: "Files in the space" });
    expect(screen.getByRole("tabpanel", { name: "Explore" })).toBeTruthy();
    expect(screen.getByRole("separator", { name: "Resize the tree pane" })).toBeTruthy();
  });
});
