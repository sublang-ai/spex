// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// One spex repository on the Groups surface over a mocked client
// (DR-103): the issues list with its repairs (space-46..space-56), the
// local and incoming lists with Open session and View diff (space-7,
// space-8, space-10), Sync from the repository's row with its rail,
// Stop, stopped, done and unrelated cards (space-11..space-16), the
// picker, its keyboard and the Apply confirm (space-9, space-17,
// space-18), the explorer tree and previews (space-23..space-25),
// reveal and copy (space-26), the copy law (space-27) and the roles
// assistive technology needs (space-44). Every `space.*` call names
// the repository it acts on by its key. The header, the groups list,
// sign-in, pick, join and members are groups-surface.test.tsx's.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { GroupsState, RepositoryState, SessionInfo } from "@sublang/spex-core/protocol";

import { SpexCommandError } from "../lib/client.js";
import { deliverServerMessageForTests, setClientForTests, useAppStore } from "../state/store.js";
import {
  BRANCH,
  CLONE,
  CONFLICTS,
  GIT_WORDS,
  HOME,
  HOST_WORDS,
  INCOMING_INTENT,
  INCOMING_SESSION,
  INTENT_ID,
  KEY,
  MERGE_DIAGNOSTIC,
  NOW,
  OWN,
  OWN_REPO,
  SESSION_UNIT,
  SETTINGS_UNIT,
  base,
  calls,
  commandMock,
  deliver,
  home,
  installClient,
  live,
  renderGroups,
  repo,
  repoState,
  strayRemote,
} from "../fixtures/groups.js";

const syncControl = () => screen.getByTestId(`space-row-sync-${KEY}`) as HTMLButtonElement;

beforeEach(installClient);

afterEach(() => {
  cleanup();
  setClientForTests(undefined);
  vi.useRealTimers();
});

describe("GROUPS: re-reads on events, never on a timer (space-2)", () => {
  test("window focus re-reads; a space.state broadcast replaces the state wholesale, the opened repository staying open", async () => {
    await renderGroups(base({}, [repo({ state: "local-only", remote: null, branch: null })]));
    expect(calls("space.get")).toHaveLength(1);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(calls("space.get")).toHaveLength(2));
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("On this device only");
    deliver(repoState());
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("Synced 2h ago");
    expect(screen.getByTestId("space-repository")).toBeTruthy();
    expect(syncControl().textContent).toBe("Sync");
    expect(useAppStore.getState().space?.groups[0].repositories[1].state).toBe("reachable");
  });

  test("session, ledger and configuration announcements re-read once, debounced by 300 ms, never on a timer", async () => {
    await renderGroups(repoState());
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

describe("GROUPS: issues and repairs (space-1, space-46..space-56)", () => {
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

  test("issues open in place, a pending merge read in plain words and the merge noted in the Sync tab", async () => {
    await renderGroups(
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

  test("a spex repository no folder pairs proposes the folder the core checked, and one gesture pairs it (space-53, space-47)", async () => {
    commandMock.mockImplementation(async (type: string, fields: Record<string, unknown> = {}) => {
      if (type === "project.rebind") return { id: "jane/infra-spex", name: "infra", path: fields.path, registeredAt: 1 };
      if (type === "project.list") return [];
      return (await import("../fixtures/groups.js")).answer(type, fields);
    });
    const { onOpenProject } = await renderGroups(
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
    const { answer } = await import("../fixtures/groups.js");
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
    await renderGroups(
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
    await renderGroups(repoState({}, { diagnostics: [{ file: "workspace/jane/infra-spex", reason: "no working folder pairs it", blocking: false, repair }] }), { open: false });
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
    await renderGroups(repoState({}, { diagnostics: [{ file: "workspace/jane/infra-spex", reason: "no working folder pairs it", blocking: false, repair }] }), { open: false });
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

  test("space-56: an outcome and a declined row hold their places until the reader's Refresh, as focus and the count move on", async () => {
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
    const report = (): GroupsState => repoState({}, {
      diagnostics: [...standing].map(([name, how]) =>
        how === "declined" ? { ...rows[name], repair: { ...rows[name].repair, declined: NOW } } : rows[name]),
    });
    const nameOf = (key: unknown) => (Object.keys(rows) as Name[]).find((name) => rows[name].repair.key === key)!;
    const { answer } = await import("../fixtures/groups.js");
    commandMock.mockImplementation(async (type: string, fields: Record<string, unknown> = {}) => {
      switch (type) {
        case "space.repair.decline":
          standing.set(nameOf(fields.repair), "declined");
          home.current = report();
          return home.current;
        case "project.rebind": {
          const name = (Object.keys(rows) as Name[]).find((entry) => rows[entry].repair.repository === fields.projectId)!;
          standing.delete(name);
          home.current = report();
          return { id: fields.projectId, name, path: fields.path, registeredAt: 1 };
        }
        case "project.list":
          return [];
        default:
          return answer(type, fields);
      }
    });
    const { onOpenProject } = await renderGroups(report(), { open: false });
    expect(screen.getByTestId("space-issues").textContent).toContain("3 issues");
    fireEvent.click(screen.getByTestId("space-issues"));
    const items = () => within(screen.getByTestId("space-issues-list")).getAllByRole("listitem");
    const at = (index: number) => items()[index]!;
    const [infra, , docs] = screen.getAllByTestId("space-repair");

    // A declined row keeps its place, and counts no more.
    fireEvent.click(within(infra!).getByRole("button", { name: "Don't add" }));
    await waitFor(() => expect(at(0).dataset.testid).toBe("space-repair-declined"));
    expect(at(0).textContent).toContain("infra");
    expect(at(0).textContent).toContain("not added");
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
    deliver(home.current);
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
    expect(home.current.diagnostics).toEqual([]);
    expect(items()).toHaveLength(2);
    fireEvent.click(screen.getByTestId("space-refresh"));
    await waitFor(() => expect(screen.queryByTestId("space-issues-list")).toBeNull());
  });

  test("space-70: a standing choice counts in the header and the live region, never in the list's heading or its attention", async () => {
    const pair = (name: string, declined?: number) => ({
      file: `workspace/jane/${name}-spex`,
      reason: `${name}-spex has no working folder here`,
      blocking: false,
      repair: unpaired({
        repository: `jane/${name}-spex`,
        name: `${name}-spex`,
        directories: [`/code/${name}`],
        key: `jane/${name}-spex|/code/${name}`,
        checked: [{ path: `/code/${name}`, here: true, repo: true }],
        proposal: { path: `/code/${name}`, from: "recorded" as const },
        ...(declined === undefined ? {} : { declined }),
      }),
    });
    // Your own group's clone carries the choice between two candidates
    // (space-69); the core counts it until it is set aside (space-1).
    const own: RepositoryState = {
      ...OWN_REPO,
      state: "local-only",
      remote: null,
      id: null,
      lastSync: null,
      choice: {
        repair: `choice:${OWN}:61,62`,
        candidates: [
          { hostId: "61", name: "ada-spex", members: 1, visibility: "private" },
          { hostId: "62", name: "records-spex", members: 2, visibility: "private" },
        ],
        declined: false,
      },
    };
    let paired = false;
    const report = (): GroupsState => {
      const diagnostics = paired ? [pair("slc", NOW)] : [pair("infra"), pair("slc", NOW)];
      const state = base({ diagnostics, issues: (paired ? 0 : 1) + 1 });
      return { ...state, groups: [{ ...state.groups[0]!, repositories: [own, repo()] }] };
    };
    const { answer } = await import("../fixtures/groups.js");
    commandMock.mockImplementation(async (type: string, fields: Record<string, unknown> = {}) => {
      switch (type) {
        case "project.rebind":
          paired = true;
          home.current = report();
          return { id: fields.projectId, name: "infra", path: fields.path, registeredAt: 1 };
        case "project.list":
          return [];
        default:
          return answer(type, fields);
      }
    });
    await renderGroups(report(), { open: false });
    const issues = screen.getByTestId("space-issues");
    expect(issues.textContent).toBe("⚠2 issues");
    fireEvent.click(issues);
    const list = () => screen.getByTestId("space-issues-list");
    // The list counts the repairs it lists; the choice stands on its row.
    expect(list().querySelector("h2")!.textContent).toBe("Issues (1) · 1 not added");
    expect(list().className).toContain("amber");

    fireEvent.click(within(screen.getByTestId("space-repair")).getByRole("button", { name: "Add project" }));
    await screen.findByTestId("space-repair-resolved");
    // The header and the live region count the choice still standing;
    // the list, with no repair unanswered, reads as settled.
    await waitFor(() => expect(screen.getByTestId("space-issues").textContent).toBe("⚠1 issue"));
    expect(screen.getByTestId("space-issues").className).toContain("amber");
    expect(live()).toBe("1 issue left.");
    expect(list().querySelector("h2")!.textContent).toBe("Issues (0) · 1 not added");
    expect(list().className).not.toContain("amber");
  });
});

describe("GROUPS: changes (space-7, space-8, space-10)", () => {
  test("local units group by kind in order with their labels and details; a session row opens its session", async () => {
    const { onOpenSession } = await renderGroups(repoState());
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
    expect(within(screen.getByTestId("space-unit-mine-.gitignore")).getByRole("button", { name: "View diff" })).toBeTruthy();
    expect(within(screen.getByTestId("space-unit-mine-notes.txt")).getByRole("button", { name: "View diff" })).toBeTruthy();
  });

  test("with no local unit the list reads 'Nothing to send from this device'", async () => {
    await renderGroups(repoState({ local: [] }));
    expect(screen.getByText("Nothing to send from this device")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Local changes (0)" })).toBeTruthy();
  });

  test("View diff shows the line diff in place for the right side and Hide diff removes it", async () => {
    await renderGroups(repoState({ incoming: [{ ...SETTINGS_UNIT }] }));
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
    await renderGroups(repoState({ conflicts: [CONFLICTS[0]], incoming: [SESSION_UNIT, INCOMING_INTENT] }));
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
    expect(syncControl().disabled).toBe(true);
    // Ahead, behind and the check time update on the row (space-8).
    deliver(repoState({ branch: { ...BRANCH, ahead: 0, behind: 3, checkedAt: NOW } }));
    const counts = screen.getByTestId(`space-repo-counts-${KEY}`);
    expect(counts.textContent).toContain("↑0");
    expect(counts.textContent).toContain("↓3");
    expect(counts.getAttribute("title")).toContain("0 commits ahead, 3 commits behind");
  });

  test("a host holding no records and an unrelated history read as such; a local-only repository offers no Check host", async () => {
    await renderGroups(repoState({ branch: { ...BRANCH, hostEmpty: true, behind: 0 }, incoming: [] }));
    expect(screen.getByText("The host holds no records yet; Sync will send these")).toBeTruthy();
    cleanup();
    await renderGroups(repoState({ branch: { ...BRANCH, unrelated: true }, incoming: [], sync: { phase: "unrelated" } }));
    expect(screen.getByTestId("space-unrelated").textContent).toContain("Join both histories into one");
    expect(screen.queryByTestId(`space-repo-counts-${KEY}`)).toBeNull();
    expect(syncControl().textContent).toBe("Join");
    cleanup();
    await renderGroups(base({}, [repo({ state: "local-only", remote: null, branch: null })]));
    expect((screen.getByTestId("space-check") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Not checked yet")).toBeTruthy();
  });
});

describe("GROUPS: syncing from the row (space-11, space-12, space-15, space-16, space-57)", () => {
  test("Sync sends the command naming the repository and reads 'Syncing…' with the rail naming each step while it runs", async () => {
    await renderGroups(repoState());
    expect(syncControl().title).toBe("Sends what is here and brings back anything new");
    fireEvent.click(syncControl());
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY }]));
    deliver(repoState({ sync: { phase: "running", op: "sync", step: "compare", since: NOW, cancelable: false } }));
    expect(syncControl().textContent).toBe("Syncing…");
    expect(syncControl().disabled).toBe(true);
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
    await renderGroups(repoState({ branch: { ...BRANCH, mergePending: true } }));
    expect(syncControl().disabled).toBe(true);
    const caption = screen.getByTestId(`space-row-caption-${KEY}`);
    expect(caption.textContent).toBe("Finish or abort the merge in your terminal");
    expect(syncControl().getAttribute("aria-describedby")).toBe(caption.id);
    cleanup();
    // A blocking diagnostic beneath this clone refuses it, and the
    // issues list stands by itself.
    await renderGroups(repoState({}, { diagnostics: [{ file: `workspace/${KEY}/intents/x.json`, reason: "malformed intent", blocking: true }] }));
    expect(syncControl().disabled).toBe(true);
    expect(screen.getByTestId(`space-row-caption-${KEY}`).textContent).toBe(`workspace/${KEY}/intents/x.json: malformed intent`);
    expect(screen.getByTestId("space-issues-list")).toBeTruthy();
    cleanup();
    // Another repository's blocking diagnostic refuses nothing here.
    await renderGroups(repoState({}, { diagnostics: [{ file: "workspace/jane/other-spex/intents/x.json", reason: "malformed intent", blocking: true }] }));
    expect(syncControl().disabled).toBe(false);
  });

  test("a busy refusal from the core lands beside the control", async () => {
    await renderGroups(repoState());
    commandMock.mockImplementationOnce(async () => {
      throw new Error('Wait for "Fix the login redirect"');
    });
    fireEvent.click(syncControl());
    expect((await screen.findByRole("alert")).textContent).toContain("Wait for");
    expect(screen.getByTestId(`space-row-caption-${KEY}`).textContent).toContain("Wait for");
    expect(live()).toContain("Wait for");
  });

  test("a stopped sync shows the step, the host's words, its guidance, Retry and Dismiss", async () => {
    await renderGroups(
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

  test("each transport cause reads in the host's words as the core phrases them (space-15)", async () => {
    const stops: [string, string][] = [
      ["unreachable", "Could not reach GitLab"],
      ["reauth", "Sign in again"],
      ["refused", "GitLab refused: archived"],
      ["gone", "No longer shared with you"],
      ["timeout", "No answer from GitLab"],
    ];
    for (const [cause, message] of stops) {
      await renderGroups(
        repoState({
          sync: { phase: "stopped", op: "check", step: "check", cause: cause as never, message, guidance: "Then Retry.", retry: true },
        }),
      );
      expect(screen.getByTestId("space-stopped-title").textContent).toBe(`Check stopped — ${message}`);
      cleanup();
    }
  });

  test("Retry after a stopped check fetches again; a rejected push reads amber with 'changed again'", async () => {
    await renderGroups(
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
    await renderGroups(repoState({ sync: { phase: "done", at: NOW, sent: 5, received: 4, pushed: true } }));
    expect(screen.getByTestId("space-done-line").textContent).toBe("Synced just now · 5 sent · 4 received");
    fireEvent.click(within(screen.getByTestId("space-done")).getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByTestId("space-done")).toBeNull();
    deliver(repoState({ sync: { phase: "done", at: NOW, sent: 0, received: 0, pushed: true } }));
    expect(screen.getByTestId("space-done-line").textContent).toBe("Everything is in sync");
    expect(live()).toBe("Everything is in sync");
    deliver(repoState({ state: "read-only", reason: "archived", sync: { phase: "done", at: NOW + 1, sent: 0, received: 4, pushed: false } }));
    expect(screen.getByTestId("space-done-line").textContent).toBe("Brought 4; nothing sent");
    // A read-only repository's Sync only brings, and says so.
    expect(syncControl().title).toBe("Brings back anything new; sends nothing");
    expect(screen.getByTestId("space-read-only-note").textContent).toBe("New sessions stay on this device");
  });

  test("unrelated histories offer Join, confirmed inline with Cancel focused (space-13)", async () => {
    await renderGroups(repoState({ branch: { ...BRANCH, unrelated: true }, sync: { phase: "unrelated" } }));
    // Join in place of Sync says what it does in its title.
    expect(syncControl().title).toBe("Brings both histories into one and asks about anything that differs");
    fireEvent.click(syncControl());
    const confirm = screen.getByTestId("space-join-confirm");
    expect(confirm.textContent).toContain("Join both histories into one?");
    expect(confirm.textContent).toContain("Anything that differs will ask you to choose.");
    expect(document.activeElement).toBe(within(confirm).getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByTestId("space-join-confirm")).toBeNull();
    expect(calls("space.sync")).toHaveLength(0);
    await waitFor(() => expect(document.activeElement).toBe(syncControl()));
    fireEvent.click(syncControl());
    fireEvent.click(within(screen.getByTestId("space-join-confirm")).getByRole("button", { name: "Join" }));
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY, join: true }]));
  });

  test("space-57: the first sync of a repository others share says once what goes there; Continue records it", async () => {
    await renderGroups(repoState({ members: 3, noticed: false }));
    fireEvent.click(syncControl());
    let notice = screen.getByTestId("space-notice-confirm");
    expect(notice.textContent).toContain("Every session goes there whole");
    expect(notice.textContent).toContain("hidden parts and attachments included");
    expect(notice.textContent).toContain("nothing recalls what others downloaded");
    expect(notice.textContent).not.toContain("public");
    expect(document.activeElement).toBe(within(notice).getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByTestId("space-notice-confirm")).toBeNull();
    expect(calls("space.sync")).toHaveLength(0);
    fireEvent.click(syncControl());
    fireEvent.click(within(screen.getByTestId("space-notice-confirm")).getByRole("button", { name: "Cancel" }));
    expect(calls("space.sync")).toHaveLength(0);
    fireEvent.click(syncControl());
    notice = screen.getByTestId("space-notice-confirm");
    fireEvent.click(within(notice).getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY, noticed: true }]));
    cleanup();
    // A public repository says its records are public.
    await renderGroups(repoState({ members: 3, noticed: false, visibility: "public" }));
    fireEvent.click(syncControl());
    expect(screen.getByTestId("space-notice-confirm").textContent).toContain("its records are public");
    cleanup();
    // Once seen it is not said again, and a repository whose only
    // member is the account says nothing.
    for (const over of [{ members: 3, noticed: true }, { members: 1, noticed: false }]) {
      commandMock.mockClear();
      await renderGroups(repoState(over));
      fireEvent.click(syncControl());
      expect(screen.queryByTestId("space-notice-confirm")).toBeNull();
      await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY }]));
      cleanup();
    }
  });

  test("controls are disabled while disconnected", async () => {
    await renderGroups(repoState());
    act(() => useAppStore.setState({ connection: "closed" }));
    expect(syncControl().disabled).toBe(true);
    expect((screen.getByTestId("space-check") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId(`space-row-members-${KEY}`) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("space-refresh") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("GROUPS: choices (space-9, space-17, space-18)", () => {
  const choicesState = (over: Partial<RepositoryState> = {}) =>
    repoState({
      incoming: [SESSION_UNIT, SETTINGS_UNIT, INCOMING_INTENT],
      conflicts: CONFLICTS,
      sync: { phase: "choices", savedCommit: "abc123" },
      ...over,
    });

  test("choices needed shows the incoming list above the picker with the step line and caption", async () => {
    await renderGroups(choicesState());
    expect(screen.getByTestId("space-step-line").textContent).toBe("Needs your choice");
    expect(screen.getByText("Your changes are saved; nothing is pushed yet")).toBeTruthy();
    const incoming = screen.getByTestId("space-incoming-list");
    const picker = screen.getByTestId("space-picker");
    expect(incoming.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Choose for 2 conflicts" })).toBeTruthy();
    expect(screen.getByTestId("space-status-dot").getAttribute("data-tone")).toBe("attention");
  });

  test("each conflict is a radio group named by its label with nothing preselected; Apply waits for every choice", async () => {
    await renderGroups(choicesState());
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
    await renderGroups(choicesState());
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
    await renderGroups(choicesState());
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
    await renderGroups(
      choicesState({
        branch: { ...BRANCH, unrelated: true, ahead: null, behind: null },
        incoming: [INCOMING_SESSION, INCOMING_INTENT],
        conflicts: [CONFLICTS[1]],
      }),
    );
    // The incoming list stands above the picker (space-9); the histories
    // stay unrelated until the merge lands, so the row offers Join.
    expect(screen.getByTestId("space-incoming-list")).toBeTruthy();
    expect(screen.getByTestId("space-unit-remote-sessions/s2").textContent).toContain("Draft the release notes");
    expect(screen.queryByText("Unrelated history")).toBeNull();
    expect(syncControl().textContent).toBe("Join");
    expect(screen.queryByTestId(`space-repo-counts-${KEY}`)).toBeNull();
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Settings changed" })).getByLabelText(/Keep mine/));
    fireEvent.click(screen.getByTestId("space-apply"));
    fireEvent.click(within(screen.getByTestId("space-apply-confirm")).getByRole("button", { name: "Apply" }));
    // Apply carries the choices and the join (space-13, space-18).
    await waitFor(() =>
      expect(calls("space.sync")).toEqual([{ repository: KEY, choices: { "config/playbook.config.yaml": "mine" }, join: true }]),
    );
  });

  test("a deletion against a change reads 'deleted' on the deleting side", async () => {
    await renderGroups(
      choicesState({
        conflicts: [
          {
            unit: SESSION_UNIT,
            mine: { change: "deleted", diff: false },
            remote: { change: "updated", at: NOW - 60 * 60_000, detail: "13 turns", diff: false },
          },
        ],
      }),
    );
    const group = screen.getByRole("radiogroup", { name: "Fix the login redirect" });
    expect(within(group).getByLabelText(/Keep mine/).parentElement?.textContent).toContain("deleted");
    expect(within(group).getByLabelText(/Take host's/).parentElement?.textContent).toContain("updated 1h ago · 13 turns");
  });

  test("a sync stopped at Apply keeps the picker with the refused unit marked, and Retry carries the choices", async () => {
    await renderGroups(
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

describe("GROUPS: the sharing notice where the Sync tab starts a sync (space-67)", () => {
  const REFUSAL = "Read the sharing notice before syncing academy-spex";
  /** The core holds every sync not sent `noticed` for the notice, its
   * facts saying so apart from its words (core-service-111). */
  const holdForNotice = (visibility: string) =>
    commandMock.mockImplementation(async (type: string, fields: Record<string, unknown> = {}) => {
      if (type === "space.sync" && fields.noticed !== true) {
        throw new SpexCommandError("invalid_request", REFUSAL, { notice: true, members: 2, visibility });
      }
      return (await import("../fixtures/groups.js")).answer(type, fields);
    });
  /** No refusal's words stand as a plain note. */
  const noPlainNote = () =>
    expect(screen.queryAllByRole("alert").filter((alert) => alert.textContent?.includes(REFUSAL))).toEqual([]);

  test("space-67: a sync stopped at Check for the notice reads as attention; Retry the core holds says the notice in the tab, and Continue resends it noticed", async () => {
    holdForNotice("private");
    await renderGroups(
      repoState({
        members: 2,
        noticed: false,
        sync: { phase: "stopped", op: "sync", step: "check", cause: "notice", message: REFUSAL, guidance: "Sync says what goes there first.", retry: true },
      }),
    );
    // The stopped card and the row's dot read attention, not a fault.
    const card = screen.getByTestId("space-stopped");
    expect(card.className).toContain("bg-amber-50");
    expect(screen.getByTestId("space-stopped-title").textContent).toBe(`Check stopped — ${REFUSAL}`);
    expect(card.textContent).toContain("Sync says what goes there first.");
    expect(screen.getByTestId("space-status-dot").getAttribute("data-tone")).toBe("attention");
    const announced = live();
    fireEvent.click(within(card).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY }]));
    // The refusal opens the notice in the tab, Cancel focused, its words
    // never standing as a note.
    const notice = await screen.findByTestId("space-sync-notice");
    expect(notice.textContent).toContain("Every session goes there whole");
    expect(notice.textContent).toContain("hidden parts and attachments included");
    expect(notice.textContent).toContain("nothing recalls what others downloaded");
    expect(notice.textContent).not.toContain("public");
    expect(document.activeElement).toBe(within(notice).getByRole("button", { name: "Cancel" }));
    noPlainNote();
    expect(live()).toBe(announced);
    fireEvent.click(within(notice).getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY }, { repository: KEY, noticed: true }]));
    expect(screen.queryByTestId("space-sync-notice")).toBeNull();
    noPlainNote();
  });

  test("space-67: Apply the core holds for the notice says it in the tab, Escape keeping the choices, and Continue resends the same choices noticed", async () => {
    holdForNotice("public");
    await renderGroups(
      repoState({
        members: 2,
        noticed: false,
        incoming: [SESSION_UNIT, SETTINGS_UNIT, INCOMING_INTENT],
        conflicts: CONFLICTS,
        sync: { phase: "choices", savedCommit: "abc123" },
      }),
    );
    const choices = { "sessions/s1": "remote", "config/playbook.config.yaml": "mine" };
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Fix the login redirect" })).getByLabelText(/Take host's/));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Settings changed" })).getByLabelText(/Keep mine/));
    const apply = () => {
      fireEvent.click(screen.getByTestId("space-apply"));
      fireEvent.click(within(screen.getByTestId("space-apply-confirm")).getByRole("button", { name: "Apply" }));
    };
    apply();
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY, choices }]));
    // A public repository's notice says its records are public.
    let notice = await screen.findByTestId("space-sync-notice");
    expect(notice.textContent).toContain("Every session goes there whole");
    expect(notice.textContent).toContain("its records are public");
    expect(document.activeElement).toBe(within(notice).getByRole("button", { name: "Cancel" }));
    noPlainNote();
    expect(live()).toBe("Needs your choice");
    // Escape cancels, sending nothing and keeping the choices.
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByTestId("space-sync-notice")).toBeNull();
    expect(calls("space.sync")).toHaveLength(1);
    expect(screen.getByTestId("space-chosen").textContent).toBe("2 of 2 chosen");
    apply();
    notice = await screen.findByTestId("space-sync-notice");
    fireEvent.click(within(notice).getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(calls("space.sync")).toEqual([
        { repository: KEY, choices },
        { repository: KEY, choices },
        { repository: KEY, choices, noticed: true },
      ]),
    );
    expect(screen.queryByTestId("space-sync-notice")).toBeNull();
  });
});

describe("GROUPS: the explorer (space-23, space-24, space-25)", () => {
  async function openExplore(state: GroupsState = repoState()) {
    const rendered = await renderGroups(state);
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

  test("'Stays on this device' names the eight families with one reason each", async () => {
    await openExplore();
    const panel = screen.getByTestId("space-privacy");
    fireEvent.click(within(panel).getByRole("button"));
    const text = panel.textContent ?? "";
    for (const family of [
      "provider hints",
      "leases and locks",
      "installed spec packages and exported skills",
      "where projects live",
      "preferences",
      "credentials",
      "migration receipts and inputs",
      "temporary files",
    ]) {
      expect(text).toContain(family);
    }
    expect(text).toContain("this device's sign-in to the Git host");
    expect(text).toContain("Stays on this device (8 kinds)");
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

describe("GROUPS: reveal and copy (space-26)", () => {
  test("with the native bridge the clone reveals in the file manager; a path it refuses says so", async () => {
    const revealPath = vi.fn<(path: string) => Promise<boolean>>().mockResolvedValue(true);
    (window as { spexNative?: unknown }).spexNative = { pickDirectory: vi.fn(), revealPath };
    await renderGroups(repoState());
    // The header holds no path to reveal (space-1).
    expect(screen.queryByTestId("space-path-reveal")).toBeNull();
    const reveal = screen.getByTestId("space-clone-path-reveal");
    expect(reveal.getAttribute("aria-label")).toMatch(/^Show in (Finder|folder)$/);
    fireEvent.click(reveal);
    expect(revealPath).toHaveBeenLastCalledWith(CLONE);
    revealPath.mockResolvedValueOnce(false);
    fireEvent.click(reveal);
    await waitFor(() => expect(live()).toBe("Couldn't show it in the file manager"));
  });

  test("with no clipboard access Copy path falls back to a selectable read-only field", async () => {
    await renderGroups(repoState());
    expect(screen.queryByTestId("space-clone-path-reveal")).toBeNull();
    fireEvent.click(screen.getByTestId("space-clone-path-copy"));
    const field = screen.getByTestId("space-clone-path-field") as HTMLInputElement;
    expect(field.readOnly).toBe(true);
    expect(field.value).toBe(CLONE);
    expect(live()).toContain("shown to select");
  });

  test("with clipboard access Copy path acknowledges the copy in words", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await renderGroups(repoState());
    const copy = screen.getByTestId("space-clone-path-copy");
    expect(copy.getAttribute("aria-label")).toBe("Copy path");
    fireEvent.click(copy);
    await waitFor(() => expect(live()).toBe(`Copied ${CLONE}`));
    expect(writeText).toHaveBeenCalledWith(CLONE);
    expect(copy.parentElement?.textContent).toContain("Copied");
  });
});

describe("GROUPS: copy and roles (space-27, space-28, space-44)", () => {
  test("no visible text in a repository's tabs says ours, theirs, HEAD, origin/spex, MERGE_HEAD, space or namespace", async () => {
    const states: GroupsState[] = [
      base({}, [repo({ state: "local-only", remote: null, branch: null })]),
      repoState(),
      repoState({ incoming: [SESSION_UNIT, SETTINGS_UNIT], conflicts: CONFLICTS, sync: { phase: "choices", savedCommit: null } }),
      repoState({ sync: { phase: "running", op: "sync", step: "apply", since: NOW, cancelable: false } }),
      repoState({ branch: { ...BRANCH, unrelated: true, mergePending: true }, sync: { phase: "unrelated" } }, { diagnostics: [MERGE_DIAGNOSTIC] }),
      repoState({ sync: { phase: "stopped", op: "sync", step: "push", cause: "rejected", message: "The host changed again", guidance: "Sync again.", retry: true } }),
      repoState({ sync: { phase: "done", at: NOW, sent: 1, received: 2, pushed: true } }),
    ];
    for (const state of states) {
      await renderGroups(state);
      // The issues list, opened, counts too.
      const issues = screen.queryByTestId("space-issues");
      if (issues) fireEvent.click(issues);
      for (const text of [document.body.textContent ?? ""]) {
        expect(text).not.toMatch(GIT_WORDS);
        expect(text).not.toMatch(HOST_WORDS);
        expect(strayRemote(text)).toBe(false);
      }
      fireEvent.click(screen.getByRole("tab", { name: "Explore" }));
      await screen.findByTestId("space-tree");
      const text = document.body.textContent ?? "";
      expect(text).not.toMatch(GIT_WORDS);
      expect(text).not.toMatch(HOST_WORDS);
      expect(strayRemote(text)).toBe(false);
      cleanup();
    }
  });

  test("every control in a repository's tabs reads at most 14 characters, its busy form included", async () => {
    const states: GroupsState[] = [
      base({}, [repo({ state: "local-only", remote: null, branch: null })]),
      repoState({ incoming: [SESSION_UNIT, SETTINGS_UNIT], conflicts: CONFLICTS, sync: { phase: "choices", savedCommit: null } }),
      repoState({ sync: { phase: "running", op: "sync", step: "push", since: NOW, cancelable: true } }),
      repoState({ sync: { phase: "stopped", op: "sync", step: "push", cause: "git", message: "x", guidance: "y", retry: true } }),
    ];
    for (const state of states) {
      await renderGroups(state);
      for (const button of screen.getAllByRole("button")) {
        // A repository's row is a row, its words its own (space-28).
        if (button.dataset.testid?.startsWith("space-repo-")) continue;
        const text = (button.textContent ?? "").trim();
        expect(text.length, `"${text}"`).toBeLessThanOrEqual(14);
      }
      cleanup();
    }
  });

  test("the surface, the groups, the tabs, the tree, the picker's groups and the live region are named for assistive technology", async () => {
    await renderGroups(repoState({ incoming: [SESSION_UNIT], conflicts: [CONFLICTS[0]], sync: { phase: "choices", savedCommit: null } }));
    expect(screen.getByRole("region", { name: "Groups" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Your groups" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Your own group" })).toBeTruthy();
    expect(screen.getByRole("tablist", { name: "Views of academy-spex" })).toBeTruthy();
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
