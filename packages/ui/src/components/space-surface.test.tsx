// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// One project's records on the Space surface over a mocked client
// (DR-103, DR-172): what needs fixing — "⚠ <n> to fix" and "To fix (<n>)
// · <m> set aside" with its repairs (space-1, space-46..space-56); "To
// send" and each Space's incoming list with Open session and View diff
// (space-7, space-8, space-10); "Sync records" from the row's overflow with
// its rail, Stop, stopped, done and "Started separately" cards
// (space-11..space-16); the Space's line in the Sync tab (space-87); the
// picker — in the Sync tab and beneath the row by Resolve — its keyboard
// and the Apply confirm (space-9, space-14, space-17, space-18); "Explore
// records" and the explorer tree, its annotations and previews (space-1,
// space-23..space-25); reveal and copy (space-26); the copy law
// (space-27) and the roles assistive technology needs (space-44). Every
// `space.*` call names the records it acts on by their key. The header's
// sign-in, the headings and "Add a Space…" are groups-instances.test.tsx's.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { GroupsState, RepositoryState, SessionInfo } from "@sublang/spex-core/protocol";

import { SpaceSurface } from "./SpaceSurface.js";
import { activateLanguage, i18n } from "../i18n.js";
import { deliverServerMessageForTests, setClientForTests, useAppStore } from "../state/store.js";
import {
  BRANCH,
  CLONE,
  CONFLICTS,
  GIT_WORDS,
  HOME,
  INCOMING_INTENT,
  INCOMING_SESSION,
  INTENT_ID,
  KEY,
  MERGE_DIAGNOSTIC,
  NOW,
  ORIGIN,
  SESSION_UNIT,
  SETTINGS_UNIT,
  answer,
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
  type RowOver,
} from "../fixtures/groups.js";

/** The opened row's one overflow control, "More", opened where it
 * stands closed (space-1, DR-159). */
function openMore(key: string = KEY): HTMLElement {
  const id = `space-row-more-${key}`;
  if (!screen.queryByTestId(`${id}-menu`)) fireEvent.click(screen.getByTestId(id));
  return screen.getByTestId(`${id}-menu`);
}
/** "Sync records" in the row's "More" (space-1, space-11). */
const syncControl = (): HTMLButtonElement => within(openMore()).getByTestId(`space-row-sync-${KEY}`) as HTMLButtonElement;
/** Its words, apart from a refusal standing beside them (space-11). */
const syncWords = (): string => syncControl().firstElementChild?.textContent ?? "";
/** The opened repository's placement line at the fixtures' instance, in
 * its Sync tab (space-87). */
const lineAt = (): HTMLElement => within(screen.getByTestId(`space-lines-${KEY}`)).getByTestId(`space-line-${ORIGIN}`);

beforeEach(installClient);

afterEach(() => {
  cleanup();
  setClientForTests(undefined);
  vi.useRealTimers();
  activateLanguage("en");
});

describe("GROUPS: re-reads on events, never on a timer (space-2)", () => {
  test.each([
    { command: "space.signout", invoke: () => useAppStore.getState().spaceSignOut(ORIGIN) },
    { command: "space.forget", invoke: () => useAppStore.getState().spaceForget(ORIGIN) },
    { command: "space.repair.decline", invoke: () => useAppStore.getState().spaceRepairDecline("repair", true) },
    { command: "space.notice.dismiss", invoke: () => useAppStore.getState().spaceNoticeDismiss("notice", true) },
  ])("space-106: $command keeps a newer broadcast over its delayed reply and applies a current reply", async ({ command, invoke }) => {
    const old = repoState({ sync: { phase: "running", op: "sync", step: "push", since: NOW, cancelable: true } });
    const done = repoState({ sync: { phase: "done", at: NOW, sent: 1, received: 0, pushed: true } });
    await renderGroups(old);
    expect(syncWords()).toBe("Syncing…");
    let resolve!: (state: GroupsState) => void;
    let response = new Promise<GroupsState>((settle) => { resolve = settle; });
    commandMock.mockImplementation((type: string, fields: Record<string, unknown> = {}) =>
      type === command ? response : answer(type, fields));
    let pending!: Promise<void>;
    act(() => { pending = invoke(); });
    deliver(done);
    await act(async () => {
      resolve(old);
      await pending;
    });
    expect(useAppStore.getState().space).toBe(done);
    expect(syncWords()).toBe("Sync records");
    expect(syncControl().disabled).toBe(false);

    // No announcement overtakes this request: its reply still applies.
    const current = repoState({ sync: { phase: "done", at: NOW + 1, sent: 2, received: 1, pushed: true } });
    response = new Promise<GroupsState>((settle) => { resolve = settle; });
    act(() => { pending = invoke(); });
    await act(async () => {
      resolve(current);
      await pending;
    });
    expect(useAppStore.getState().space).toBe(current);
    expect(syncWords()).toBe("Sync records");
  });

  test("window focus re-reads; a space.state broadcast replaces the state wholesale, the opened repository staying open", async () => {
    await renderGroups(base({}, [repo({ state: "local-only", remote: null, branch: null })]));
    expect(calls("space.get")).toHaveLength(1);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(calls("space.get")).toHaveLength(2));
    // Records in no group read no phrase (space-120).
    expect(screen.queryByTestId(`space-repo-state-${KEY}`)?.textContent ?? "").toBe("");
    // Nothing to send, its last sync is its phrase (space-120).
    deliver(repoState({ local: [] }));
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("Synced 2h ago");
    // Something to send outranks it (space-120).
    deliver(repoState());
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("9 records to sync");
    expect(screen.getByTestId("space-repository")).toBeTruthy();
    expect(syncWords()).toBe("Sync records");
    expect(useAppStore.getState().space?.instances[0]?.groups[0]?.repositories[0]?.state).toBe("reachable");
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

describe("SPACE: what needs fixing (space-1, space-46..space-56)", () => {
  const unpaired = (over: Record<string, unknown> = {}) => ({
    kind: "repository" as const,
    repository: "jane/infra-spex",
    name: "infra-spex",
    projectName: "Infra",
    group: "jane",
    directories: ["/code/infra"],
    sessions: 5,
    key: "jane/infra-spex|/code/infra",
    checked: [{ path: "/code/infra", here: true, repo: true }],
    proposal: { path: "/code/infra", from: "recorded" as const },
    ...over,
  });

  test("Review counts notices and opens a neutral review, with a pending merge read in plain words", async () => {
    await renderGroups(
      repoState(
        { mergePending: true },
        {
          diagnostics: [
            { file: "workspace/jane/academy-spex/sessions/x.json", reason: "recorded at /Users/jane/code/infra", blocking: false },
            MERGE_DIAGNOSTIC,
          ],
        },
      ),
    );
    const issues = screen.getByTestId("space-issues");
    expect(issues.textContent).toBe("⚠Review (2)");
    expect(issues.className).toContain("amber");
    expect(screen.queryByTestId("space-issues-list")).toBeNull();
    fireEvent.click(issues);
    const list = screen.getByTestId("space-issues-list");
    expect(screen.getByRole("region", { name: "Review notices" })).toBe(list);
    expect(list.className).not.toContain("amber");
    expect(screen.getByTestId("space-issues-heading").textContent).toBe("Review notices");
    expect(list.textContent).toContain("Finish or abort the merge in your terminal");
    expect(list.textContent).not.toContain("MERGE_HEAD");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(list.textContent).toContain("sessions/x.json");
    expect(screen.getByTestId("space-merge-note").textContent).toContain("Finish or abort the merge in your terminal");
    fireEvent.click(screen.getByTestId("space-issues-close"));
    expect(screen.queryByTestId("space-issues-list")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(issues));
    expect(issues.textContent).toBe("⚠Review (2)");
    fireEvent.click(issues);
    fireEvent.keyDown(screen.getByTestId("space-issues-close"), { key: "Escape" });
    expect(screen.queryByTestId("space-issues-list")).toBeNull();
    expect(calls("space.notice.dismiss")).toHaveLength(0);
  });

  test("closing blocking review preserves its warning and a new blocker reopens it", async () => {
    const diagnostic = { file: "/records/home.yaml", reason: "could not read saved data", blocking: true };
    const initial = repoState({}, { diagnostics: [diagnostic] });
    await renderGroups(initial, { open: false });
    expect(screen.getByTestId("space-issues-heading").textContent).toBe("Needs attention");
    fireEvent.click(screen.getByTestId("space-issues-close"));
    expect(screen.queryByTestId("space-issues-list")).toBeNull();
    const review = screen.getByTestId("space-issues");
    await waitFor(() => expect(document.activeElement).toBe(review));
    expect(review.textContent).toBe("⚠Review (1)");
    expect(review.getAttribute("aria-expanded")).toBe("false");
    deliver({ ...initial, diagnostics: [{ ...diagnostic }] });
    expect(screen.queryByTestId("space-issues-list")).toBeNull();
    deliver(repoState({}, { diagnostics: [diagnostic, { ...diagnostic, file: "/records/new.yaml" }] }));
    expect(screen.getByTestId("space-issues-heading").textContent).toBe("Needs attention");
    expect(review.textContent).toBe("⚠Review (2)");
    expect(calls("space.notice.dismiss")).toHaveLength(0);
    expect(calls("space.repair.decline")).toHaveLength(0);
  });

  test.each(["en", "zh"] as const)("storage diagnostics in %s explain the next step by code and disclose technical details only on request", async (language) => {
    activateLanguage(language);
    const words = {
      heading: `⚠${i18n._("Review ({count})", { count: 5 })}`,
      older: i18n._("An older conversation can’t be opened"),
      folder: i18n._("A saved conversation needs a project folder"),
      generic: i18n._("Saved data needs attention"),
      preserved: i18n._("Spex could not read this saved conversation. The original file is still saved."),
      repair: i18n._("Spex could not use this saved file."),
      blocking: i18n._("This must be resolved before using the affected data."),
      details: i18n._("Technical details"),
    };
    const diagnostics: GroupsState["diagnostics"] = [
      { code: "session-import", file: "/old/sessions/one.json", reason: "unsupported legacy schema 1", blocking: false },
      { code: "session-upgrade", file: "/records/sessions/two.spex.json", reason: "旧版会话无法转换", blocking: false },
      { code: "session-folder-required", file: "/records/sessions/three.spex.json", reason: "invalid sidecar or missing cwd", blocking: false },
      // The same technical text must not choose a session repair when
      // the producer supplied no known classification.
      { file: "/records/home.yaml", reason: "unsupported legacy schema 1", blocking: true },
      { code: "future-diagnostic" as GroupsState["diagnostics"][number]["code"], file: "/records/other.json", reason: "<script>diagnostic text</script>", blocking: false },
    ];
    await renderGroups(repoState({}, { diagnostics }), { open: false });
    expect(screen.getByTestId("space-issues").textContent).toBe(words.heading);
    expect(screen.getByTestId("space-issues").getAttribute("aria-expanded")).toBe("true");
    const rows = screen.getAllByTestId("space-diagnostic");
    expect(rows).toHaveLength(diagnostics.length);
    const summaries = [
      words.older,
      words.older,
      words.folder,
      words.generic,
      words.generic,
    ];
    const guidance = [
      words.preserved,
      words.preserved,
      words.preserved,
      words.repair,
      words.repair,
    ];
    for (const [index, row] of rows.entries()) {
      const entry = diagnostics[index]!;
      expect(within(row).getByText(summaries[index]!).closest("details")).toBeNull();
      expect(within(row).getByText(guidance[index]!).closest("details")).toBeNull();
      const impact = within(row).queryByTestId("space-diagnostic-impact");
      if (entry.blocking) expect(impact?.textContent).toBe(words.blocking);
      else expect(impact).toBeNull();
      const details = row.querySelector("details")!;
      expect(details.open).toBe(false);
      expect(within(row).getByText(entry.file).closest("details")).toBe(details);
      expect(within(row).getByText(entry.reason).closest("details")).toBe(details);
      fireEvent.click(within(row).getByText(words.details));
      expect(details.open).toBe(true);
      expect(details.textContent).toContain(entry.file);
      expect(details.textContent).toContain(entry.reason);
    }
    expect(screen.getByTestId("space-issues-list").querySelector("script")).toBeNull();
    expect(calls("project.rebind")).toHaveLength(0);
  });

  test("a named project groups saved work and proposes only the existing folder the core checked (space-46, space-53, space-47)", async () => {
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
    expect(screen.getByTestId("space-issues").textContent).toBe("⚠Review (1)");
    fireEvent.click(screen.getByTestId("space-issues"));
    const row = screen.getByTestId("space-repair");
    expect(row.dataset.kind).toBe("repository");
    // The actual project name heads its conversation group; the
    // historical folder is separate evidence (space-46).
    expect(within(row).getByTestId("space-repair-title").textContent).toBe("Infra");
    expect(row.textContent).not.toContain("infra-spex");
    expect(within(row).getByTestId("space-repair-folder").textContent).toBe("Previously used folder/code/infra");
    expect(screen.getByTestId("space-issues-list").textContent).toContain("Conversation history is saved on this computer. To work on a project again, locate its files.");
    expect(row.textContent).not.toContain("To work on");
    // Its controls, in their order (space-47).
    expect(within(row).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Use /code/infra",
      "Locate folder…",
      "Dismiss",
    ]);

    // One gesture pairs the records with the folder, their key naming the
    // project, the recorded folders riding as aliases.
    fireEvent.click(within(row).getByRole("button", { name: "Use /code/infra" }));
    await waitFor(() =>
      expect(calls("project.rebind")).toEqual([
        { projectId: "jane/infra-spex", path: "/code/infra", aliases: ["/code/infra"] },
      ]),
    );
    const resolved = await screen.findByTestId("space-repair-resolved");
    expect(resolved.textContent).toContain("Project folder saved: /code/infra");
    fireEvent.click(within(resolved).getByRole("button", { name: "Open project" }));
    expect(onOpenProject).toHaveBeenCalledWith("jane/infra-spex");
  });

  test("saved work is optional, recognizable, and one folder choice includes every conversation", async () => {
    const repair = unpaired({
      name: "slalph-spex", group: "slalph", projectName: undefined,
      sessions: 5, proposal: undefined,
      directories: ["/Users/jane/Projects", "/old/other"],
      checked: [{ path: "/Users/jane/Projects", here: true, repo: false }],
      conversations: [
        { id: "onboarding", title: "Plan the onboarding flow", updatedAt: NOW },
        { updatedAt: NOW - 86_400_000 },
        {},
      ],
      details: [{ file: "/records/older.spex.json", reason: "legacy session needs a cwd" }],
    });
    await renderGroups(repoState({}, { diagnostics: [{ file: "workspace/slalph/slalph-spex", reason: "no working folder", blocking: false, repair }] }), { open: false });
    const review = screen.getByRole("button", { name: "Review 1 notice" });
    expect(review.className).toContain("amber");
    expect(screen.queryByTestId("space-issues-list")).toBeNull();
    fireEvent.click(review);
    const row = screen.getByTestId("space-repair");
    expect(screen.getAllByTestId("space-repair")).toHaveLength(1);
    expect(row.textContent).not.toContain("slalph");
    expect(within(row).getByTestId("space-repair-title").textContent).toBe("Earlier conversations");
    expect(row.textContent).toContain("5 saved conversations");
    expect(screen.getByTestId("space-issues-list").textContent).toContain("Conversation history is saved on this computer. You can read the conversations now. To work on a project again, locate its files.");
    expect(screen.getByTestId("space-issues-list").className).not.toContain("amber");
    expect(row.textContent).not.toContain("You can read");
    expect(screen.getByTestId("space-issues-list").textContent).not.toContain("If you don’t have");
    expect(within(row).getByTestId("space-repair-folder").textContent).toBe("Previously used folders~/Projects/old/other");
    expect(row.textContent).toContain("Plan the onboarding flow");
    expect(row.textContent).toContain("Conversation saved");
    expect(row.textContent).toContain("Untitled conversation");
    expect(row.textContent).toContain("and 2 more");
    const conversations = within(row).getByRole("list", { name: "Saved conversations" });
    expect(within(conversations).getAllByRole("listitem")).toHaveLength(3);
    expect(conversations.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(3);
    expect(within(conversations).getAllByRole("button")).toHaveLength(1);
    const details = row.querySelector("details")!;
    expect(details.open).toBe(false);
    expect(within(row).getByText("This is not the main folder of a Git project.").closest("details")).toBe(details);
    expect(within(row).getByText("legacy session needs a cwd").closest("details")).toBe(details);
    fireEvent.click(within(row).getByRole("button", { name: "Locate folder…" }));
    const field = within(row).getByLabelText("Project folder on this computer") as HTMLInputElement;
    expect(field.value).toBe("");
    expect(row.textContent).toContain("Select the existing folder used for this work. This does not create or download a project.");
    expect(row.textContent).toContain("This folder will be used for all 5 conversations listed here.");
    fireEvent.keyDown(field, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(within(row).getByRole("button", { name: "Locate folder…" })));
    expect(calls("project.rebind")).toHaveLength(0);
  });

  test("each named project keeps its own conversation history and folder choice, even when names match", async () => {
    const first = unpaired({ repository: "one/atlas-spex", key: "one-atlas", projectName: "Atlas", proposal: undefined, directories: ["/code/first-atlas"], sessions: 1, conversations: [{ id: "first-chat", title: "Plan the Atlas release", updatedAt: NOW }] });
    const second = unpaired({ repository: "two/atlas-spex", key: "two-atlas", projectName: "Atlas", proposal: undefined, directories: ["/code/second-atlas"], sessions: 2, conversations: [{ id: "second-chat", title: "Review the project guide", updatedAt: NOW }] });
    const unknown = unpaired({ repository: "jane/jane-spex", key: "earlier-work", projectName: undefined, proposal: undefined, directories: ["/code/other"], sessions: 1, conversations: [{ id: "earlier-chat", title: "Explore an idea" }] });
    const diagnostics = [first, second, unknown].map((repair) => ({ file: `workspace/${repair.repository}`, reason: "no working folder", blocking: false, repair }));
    commandMock.mockImplementation(async (type: string, fields: Record<string, unknown> = {}) => {
      if (type === "project.rebind") return { id: fields.projectId, name: "Atlas", path: fields.path, registeredAt: 1 };
      if (type === "project.list") return [];
      return answer(type, fields);
    });
    const indexed: SessionInfo[] = ([[first, "first-chat"], [second, "second-chat"], [unknown, "earlier-chat"]] as const).map(([repair, id]) => ({
      id, projectId: repair.repository, projectPath: repair.directories[0]!,
      createdAt: NOW, live: false, endedAt: NOW, players: [], initialVisible: [], turns: 1, failed: false,
    }));
    useAppStore.setState({ sessions: indexed });
    const { onOpenSession } = await renderGroups(repoState({}, { diagnostics }), { open: false });
    fireEvent.click(screen.getByTestId("space-issues"));
    const rows = screen.getAllByTestId("space-repair");
    expect(rows.map((row) => within(row).getByTestId("space-repair-title").textContent)).toEqual(["Atlas", "Atlas", "Earlier conversations"]);
    expect(rows[0]!.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
    // Reading a conversation needs no folder selection, even when its project is unpaired.
    fireEvent.click(within(rows[1]!).getByRole("button", { name: "Review the project guide" }));
    expect(onOpenSession).toHaveBeenCalledWith("second-chat");
    expect(calls("project.rebind")).toHaveLength(0);
    expect(screen.queryByTestId("space-repair-path")).toBeNull();
    // A later removal leaves the old Space preview visible until Refresh.
    // It must stay on Space, never opening a previously selected conversation.
    act(() => deliverServerMessageForTests({ type: "session.removed", sessionId: "second-chat", projectId: "two/atlas-spex" }));
    fireEvent.click(within(rows[1]!).getByRole("button", { name: "Review the project guide" }));
    expect(onOpenSession).toHaveBeenCalledTimes(1);
    expect(within(rows[1]!).getByTestId("space-conversation-error").textContent).toBe("This conversation is no longer listed. Refresh this list and try again.");
    expect(calls("project.rebind")).toHaveLength(0);
    act(() => useAppStore.setState({ sessions: indexed }));
    fireEvent.click(within(rows[1]!).getByRole("button", { name: "Review the project guide" }));
    expect(onOpenSession).toHaveBeenCalledTimes(2);
    expect(within(rows[1]!).queryByTestId("space-conversation-error")).toBeNull();
    fireEvent.click(within(rows[1]!).getByRole("button", { name: "Locate folder…" }));
    expect(rows[1]!.textContent).toContain("Where are this project’s files?");
    expect(rows[1]!.textContent).toContain("This folder will be used for all 2 conversations listed here.");
    fireEvent.change(within(rows[1]!).getByLabelText("Project folder on this computer"), { target: { value: "/restored/atlas" } });
    fireEvent.click(within(rows[1]!).getByRole("button", { name: "Use this folder" }));
    await screen.findByTestId("space-repair-resolved");
    expect(calls("project.rebind")).toEqual([{ projectId: "two/atlas-spex", path: "/restored/atlas", aliases: ["/code/second-atlas"] }]);
    expect(screen.getAllByTestId("space-repair")).toEqual([rows[0], rows[2]]);
    expect(within(rows[0]!).getByRole("button", { name: "Plan the Atlas release" })).toBeTruthy();
    expect(within(rows[2]!).getByRole("button", { name: "Explore an idea" })).toBeTruthy();
    expect(calls("space.repair.decline")).toHaveLength(0);
  });

  test("a folder choice keeps validation beside that field, preserves the draft, and prevents duplicate submission", async () => {
    let resolve!: (value: unknown) => void;
    let reject!: (reason: Error) => void;
    commandMock.mockImplementation(async (type: string, fields: Record<string, unknown> = {}) => {
      if (type === "project.rebind") return new Promise((yes, no) => { resolve = yes; reject = no; });
      if (type === "project.list") return [];
      return answer(type, fields);
    });
    await renderGroups(repoState({}, { diagnostics: [{ file: "workspace/jane/infra-spex", reason: "no folder", blocking: false, repair: unpaired({ proposal: undefined }) }] }), { open: false });
    fireEvent.click(screen.getByTestId("space-issues"));
    const row = screen.getByTestId("space-repair");
    fireEvent.click(within(row).getByRole("button", { name: "Locate folder…" }));
    const field = within(row).getByLabelText("Project folder on this computer") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "/code/parent" } });
    fireEvent.keyDown(field, { key: "Enter" });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(calls("project.rebind")).toHaveLength(1);
    expect(field.disabled).toBe(true);
    expect((within(row).getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("space-issues-close") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("space-issues") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("space-issues-close"));
    fireEvent.keyDown(screen.getByTestId("space-issues-list"), { key: "Escape" });
    expect(screen.getByTestId("space-repair-path")).toBe(field);
    await act(async () => reject(new Error("/code/parent is not the main folder of a Git project. Choose an existing project folder.")));
    const error = within(row).getByRole("alert");
    expect(field.value).toBe("/code/parent");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(field.getAttribute("aria-describedby")).toContain(error.id);
    expect((screen.getByTestId("space-issues-close") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(field, { target: { value: "/code/parent/infra" } });
    expect(field.getAttribute("aria-invalid")).toBeNull();
    fireEvent.click(within(row).getByRole("button", { name: "Use this folder" }));
    await act(async () => resolve({ id: "jane/infra-spex", name: "infra", path: "/code/parent/infra", registeredAt: 1 }));
    expect((await screen.findByTestId("space-repair-resolved")).textContent).toContain("Project folder saved: /code/parent/infra");
    expect(calls("project.rebind")).toEqual([
      { projectId: "jane/infra-spex", path: "/code/parent", aliases: ["/code/infra"] },
      { projectId: "jane/infra-spex", path: "/code/parent/infra", aliases: ["/code/infra"] },
    ]);
  });

  test("a repair stays answerable while its spex repository syncs: the sync refuses nothing (space-47, space-21)", async () => {
    commandMock.mockImplementation(async (type: string, fields: Record<string, unknown> = {}) => {
      if (type === "project.rebind") return { id: KEY, name: "academy", path: fields.path, registeredAt: 1 };
      if (type === "project.list") return [];
      return (await import("../fixtures/groups.js")).answer(type, fields);
    });
    const repair = unpaired({ repository: KEY, name: KEY.split("/").pop(), key: `${KEY}|/code/infra` });
    await renderGroups(
      repoState(
        { sync: { phase: "running", op: "sync", step: "apply", since: NOW, cancelable: false } },
        { diagnostics: [{ file: `workspace/${KEY}`, reason: "no working folder pairs it", blocking: false, repair }] },
      ),
      { open: false },
    );
    fireEvent.click(screen.getByTestId("space-issues"));
    const row = screen.getByTestId("space-repair");
    const add = within(row).getByTestId("space-repair-use") as HTMLButtonElement;
    expect(add.disabled).toBe(false);
    expect((within(row).getByRole("button", { name: "Locate folder…" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(add);
    await waitFor(() => expect(calls("project.rebind")).toEqual([{ projectId: KEY, path: "/code/infra", aliases: ["/code/infra"] }]));
  });

  test("a project folder whose records are missing offers Remove project, behind an inline confirm (space-46, projects-9)", async () => {
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
    expect(row.textContent).toContain("The saved work for this folder is no longer on this computer.");
    expect(within(row).queryByTestId("space-repair-use")).toBeNull();
    // The Overview tab's word for the same act (projects-9, DR-172).
    expect(within(row).getByTestId("space-repair-remove").textContent).toBe("Remove project");
    fireEvent.click(within(row).getByRole("button", { name: "Remove project" }));
    expect(row.textContent).toContain("Remove this project? Its files stay.");
    // Cancel is the safe default (DR-010 §4).
    expect(document.activeElement).toBe(within(row).getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(row).getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(calls("project.remove")).toEqual([{ projectId: "jane/old-spex", confirm: true }]),
    );
    const resolved = await screen.findByTestId("space-repair-resolved");
    expect(resolved.textContent).toContain("/code/old · removed");
    expect(within(resolved).queryByRole("button", { name: "Open project" })).toBeNull();
  });

  test.each([
    { here: false, unknown: false, finding: "a missing folder" },
    { here: true, unknown: false, finding: "a parent folder that is not a Git project" },
    { here: true, unknown: true, finding: "a folder whose check timed out" },
  ])("$finding offers the folder editor without claiming that files were deleted (space-53)", async ({ here, unknown }) => {
    const repair = unpaired({
      directories: ["/gone/worktree"],
      sessions: 2,
      key: "jane/infra-spex|/gone/worktree",
      checked: [{ path: "/gone/worktree", here, repo: false, ...(unknown ? { unknown: true } : {}) }],
      proposal: undefined,
    });
    await renderGroups(repoState({}, { diagnostics: [{ file: "workspace/jane/infra-spex", reason: "no working folder pairs it", blocking: false, repair }] }), { open: false });
    fireEvent.click(screen.getByTestId("space-issues"));
    const row = screen.getByTestId("space-repair");
    expect(within(row).getByTestId("space-repair-title").textContent).toBe("Infra");
    expect(within(row).queryByText("This is not the main folder of a Git project.") !== null).toBe(here && !unknown);
    expect(within(row).queryByText("This folder was not found.") !== null).toBe(!here && !unknown);
    expect(within(row).queryByTestId("space-repair-use")).toBeNull();
    expect(within(row).getAllByRole("button").map((button) => button.textContent)).toEqual(["Locate folder…", "Dismiss"]);
    // "Locate folder…" opens the row as an editor over the recorded path:
    // "Use this folder" and Cancel, Escape cancelling, its note a phrase
    // (space-47).
    fireEvent.click(within(row).getByRole("button", { name: "Locate folder…" }));
    const path = within(row).getByLabelText("Project folder on this computer") as HTMLInputElement;
    expect(path.value).toBe("");
    expect(row.textContent).toContain("Select the existing folder used for this work. This does not create or download a project.");
    expect(within(row).getByTestId("space-repair-submit").textContent).toBe("Use this folder");
    fireEvent.change(path, { target: { value: "" } });
    fireEvent.click(within(row).getByTestId("space-repair-submit"));
    expect(within(row).getByRole("alert").textContent).toBe("Choose an existing project folder");
    fireEvent.keyDown(path, { key: "Escape" });
    expect(within(row).queryByTestId("space-repair-submit")).toBeNull();
    expect(screen.getByTestId("space-issues-list")).toBeTruthy();
    fireEvent.click(within(row).getByRole("button", { name: "Locate folder…" }));
    fireEvent.keyDown(within(row).getByRole("button", { name: "Cancel" }), { key: "Escape" });
    expect(within(row).queryByTestId("space-repair-submit")).toBeNull();
    expect(screen.getByTestId("space-issues-list")).toBeTruthy();
    expect(document.activeElement).toBe(within(row).getByRole("button", { name: "Locate folder…" }));
    expect(calls("project.rebind")).toHaveLength(0);
  });

  test("dismissed saved work stays in a collapsed neutral section with a way to show it again", async () => {
    const repair = unpaired({
      checked: [{ path: "/code/infra", here: false, repo: false }],
      proposal: undefined,
      declined: NOW - 60_000,
    });
    await renderGroups(repoState({}, { diagnostics: [{ file: "workspace/jane/infra-spex", reason: "no working folder pairs it", blocking: false, repair }] }), { open: false });
    // It counts as no issue, but the control stays reachable — and
    // with nothing unanswered it stops wearing attention's colour.
    const issues = screen.getByTestId("space-issues");
    expect(issues.textContent).toBe("Review");
    expect(issues.title).toBe("");
    expect(issues.getAttribute("aria-label")).toBe("Review");
    expect(issues.className).not.toContain("amber");
    expect(issues.className).not.toContain("amber");
    fireEvent.click(issues);
    expect(screen.getByTestId("space-issues-list").className).not.toContain("amber");
    const dismissed = screen.getByTestId("space-dismissed") as HTMLDetailsElement;
    expect(dismissed.open).toBe(false);
    expect(dismissed.querySelector("summary")?.textContent).toBe("Dismissed (1)");
    expect(screen.queryByTestId("space-folder-review")).toBeNull();
    fireEvent.click(dismissed.querySelector("summary")!);
    const row = screen.getByTestId("space-repair-declined");
    expect(within(row).getByTestId("space-repair-title").textContent).toBe("Infra");
    expect(row.textContent).not.toContain("For later");
    expect(within(row).getByRole("button", { name: "Locate folder…" })).toBeTruthy();
    expect(within(row).queryByRole("button", { name: "Dismiss" })).toBeNull();
    expect(within(row).getByRole("button", { name: "Show again" })).toBeTruthy();
  });

  test("Dismiss reduces the core count, keeps unrelated notices, and sidebar requests reopen deferred tasks", async () => {
    const repairs = [unpaired(), unpaired({ repository: "jane/docs-spex", key: "docs", projectName: "Docs" })];
    const deferred = new Set<string>();
    let otherNotice = true;
    const report = (): GroupsState => repoState({}, { diagnostics: [
      ...repairs.map((repair) => ({ file: `workspace/${repair.repository}`, reason: "no folder", blocking: false,
        repair: deferred.has(repair.key) ? { ...repair, declined: NOW } : repair })),
      ...(otherNotice ? [{ file: "/older.json", reason: "unsupported format", blocking: false }] : []),
    ] });
    commandMock.mockImplementation(async (type: string, fields: Record<string, unknown> = {}) => {
      if (type === "space.repair.decline") {
        deferred.add(String(fields.repair));
        home.current = report();
        return home.current;
      }
      return answer(type, fields);
    });
    const { view, onOpenSession, onOpenProject } = await renderGroups(report(), { open: false });
    expect(screen.getByTestId("space-issues").textContent).toBe("⚠Review (3)");
    fireEvent.click(screen.getByTestId("space-issues"));
    fireEvent.click(within(screen.getAllByTestId("space-repair")[0]!).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(screen.getByTestId("space-issues").textContent).toBe("⚠Review (2)"));
    const notice = screen.getByTestId("space-deferred-notice");
    expect(notice.textContent).toBe("Moved to Dismissed. Your conversations are kept.");
    expect(notice.closest(".sr-only")).toBeNull();
    fireEvent.click(within(screen.getByTestId("space-repair")).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(screen.getByTestId("space-issues").textContent).toBe("⚠Review (1)"));
    expect(screen.getByTestId("space-diagnostic")).toBeTruthy();
    expect(screen.getAllByTestId("space-deferred-notice")).toHaveLength(1);
    otherNotice = false;
    deliver(report());
    expect(screen.getByTestId("space-issues").textContent).toBe("Review");
    fireEvent.click(screen.getByTestId("space-issues"));
    expect(screen.queryByTestId("space-issues-list")).toBeNull();
    const consume = vi.fn();
    view.rerender(<SpaceSurface onOpenSession={onOpenSession} onOpenProject={onOpenProject} reviewRequest={1} onReviewOpened={consume} />);
    expect((screen.getByTestId("space-dismissed") as HTMLDetailsElement).open).toBe(true);
    expect(consume).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId("space-repair-declined")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Locate folder…" })).toHaveLength(2);
    view.rerender(<SpaceSurface onOpenSession={onOpenSession} onOpenProject={onOpenProject} onReviewOpened={consume} />);
    fireEvent.click(screen.getByTestId("space-issues"));
    expect(screen.queryByTestId("space-issues-list")).toBeNull();
    view.rerender(<SpaceSurface onOpenSession={onOpenSession} onOpenProject={onOpenProject} reviewRequest={2} onReviewOpened={consume} />);
    expect((screen.getByTestId("space-dismissed") as HTMLDetailsElement).open).toBe(true);
    expect(consume).toHaveBeenCalledTimes(2);
    expect(calls("project.rebind")).toHaveLength(0);
  });

  test("folder choices and supported notices share Dismissed, persist across visits, and show again independently", async () => {
    let folderDismissed = false;
    let noticeDismissed = false;
    let releaseNotice!: (state: GroupsState) => void;
    const firstNoticeReply = new Promise<GroupsState>((resolve) => { releaseNotice = resolve; });
    let holdNotice = true;
    const report = (): GroupsState => repoState({}, { diagnostics: [
      { file: "/records/infra", reason: "no working folder", blocking: false,
        repair: unpaired({ ...(folderDismissed ? { declined: NOW } : {}) }) },
      { file: "/older/session.json", reason: "unsupported legacy schema 1", code: "session-import", blocking: false,
        notice: { key: "old-file", ...(noticeDismissed ? { dismissed: NOW } : {}) } },
    ] });
    commandMock.mockImplementation(async (type: string, fields: Record<string, unknown> = {}) => {
      if (type === "space.notice.dismiss") {
        noticeDismissed = Boolean(fields.dismissed);
        if (holdNotice) { holdNotice = false; return firstNoticeReply; }
        return home.current = report();
      }
      if (type === "space.repair.decline") {
        folderDismissed = Boolean(fields.declined);
        return home.current = report();
      }
      return answer(type, fields);
    });
    const initial = await renderGroups(report(), { open: false });
    // A sidebar request made before anything is dismissed is consumed
    // once; a later dismissal must not expand the new section.
    initial.view.rerender(<SpaceSurface onOpenSession={initial.onOpenSession} onOpenProject={initial.onOpenProject} reviewRequest={10} />);
    expect(screen.getByTestId("space-issues").textContent).toBe("⚠Review (2)");
    expect(within(screen.getByTestId("space-folder-review")).queryByTestId("space-diagnostic")).toBeNull();
    expect(screen.getByTestId("space-notice-review").textContent).not.toContain("To work on a project");
    const dismissNotice = screen.getByTestId("space-notice-dismiss") as HTMLButtonElement;
    fireEvent.click(dismissNotice);
    expect(dismissNotice.disabled).toBe(true);
    expect(screen.getByTestId("space-issues").textContent).toBe("⚠Review (2)");
    expect(screen.queryByTestId("space-dismissed")).toBeNull();
    expect(live()).not.toContain("Notice dismissed");
    await act(async () => { home.current = report(); releaseNotice(home.current); });
    await waitFor(() => expect(screen.getByTestId("space-issues").textContent).toBe("⚠Review (1)"));
    expect(live()).toBe("Notice dismissed. The saved file is kept.");
    expect((screen.getByTestId("space-dismissed") as HTMLDetailsElement).open).toBe(false);
    expect(screen.queryByTestId("space-notice-review")).toBeNull();
    expect(screen.getByTestId("space-dismissed-notices").textContent).toContain("/older/session.json");

    initial.view.unmount();
    await renderGroups(report(), { open: false });
    expect(screen.queryByTestId("space-issues-list")).toBeNull();
    fireEvent.click(screen.getByTestId("space-issues"));
    expect((screen.getByTestId("space-dismissed") as HTMLDetailsElement).open).toBe(false);
    fireEvent.click(within(screen.getByTestId("space-folder-review")).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(screen.getByTestId("space-issues").textContent).toBe("Review"));
    const dismissed = screen.getByTestId("space-dismissed") as HTMLDetailsElement;
    const summary = dismissed.querySelector("summary")!;
    expect(summary.textContent).toBe("Dismissed (2)");
    expect(dismissed.open).toBe(false);
    expect(screen.queryByTestId("space-folder-review")).toBeNull();
    expect(screen.queryByTestId("space-active-notices")).toBeNull();
    expect(dismissed.textContent).not.toContain("For later");
    await waitFor(() => expect(document.activeElement).toBe(summary));
    fireEvent.click(summary);
    fireEvent.click(within(screen.getByTestId("space-dismissed-notices")).getByRole("button", { name: "Show again" }));
    await waitFor(() => expect(screen.getByTestId("space-issues").textContent).toBe("⚠Review (1)"));
    expect(summary.textContent).toBe("Dismissed (1)");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("space-notice-dismiss")));
    expect(live()).toBe("Shown again.");
    fireEvent.click(within(screen.getByTestId("space-dismissed-folders")).getByRole("button", { name: "Show again" }));
    await waitFor(() => expect(screen.queryByTestId("space-dismissed")).toBeNull());
    expect(screen.getByTestId("space-issues").textContent).toBe("⚠Review (2)");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("space-repair-use")));
    expect(calls("space.notice.dismiss")).toEqual([{ notice: "old-file", dismissed: true }, { notice: "old-file", dismissed: false }]);
    expect(calls("space.repair.decline")).toEqual([
      { repair: "jane/infra-spex|/code/infra", declined: true },
      { repair: "jane/infra-spex|/code/infra", declined: false },
    ]);
    expect(calls("project.rebind")).toHaveLength(0);
  });

  test.each([false, true])("a refused notice change keeps its original count and placement (dismissed: %s)", async (dismissed) => {
    commandMock.mockImplementation(async (type: string, fields: Record<string, unknown> = {}) => {
      if (type === "space.notice.dismiss") throw new Error("This notice has changed. Refresh to review it.");
      return answer(type, fields);
    });
    await renderGroups(repoState({}, { diagnostics: [{
      file: "/old/session.json", reason: "unsupported format", code: "session-upgrade", blocking: false,
      notice: { key: "notice", ...(dismissed ? { dismissed: NOW } : {}) },
    }] }), { open: false });
    fireEvent.click(screen.getByTestId("space-issues"));
    if (dismissed) fireEvent.click(screen.getByTestId("space-dismissed").querySelector("summary")!);
    const control = screen.getByTestId("space-notice-dismiss") as HTMLButtonElement;
    fireEvent.click(control);
    await screen.findByText("This notice has changed. Refresh to review it.");
    expect(control.disabled).toBe(false);
    expect(screen.getByTestId("space-issues").textContent).toBe(dismissed ? "Review" : "⚠Review (1)");
    expect(screen.queryByTestId("space-active-notices") === null).toBe(dismissed);
    expect(live()).toBe("");
    expect(screen.queryByTestId("space-deferred-notice")).toBeNull();
  });

  test("unknown, unsupported and blocking diagnostics have no dismissal control, including an old declined blocker", async () => {
    const diagnostics: GroupsState["diagnostics"] = [
      { file: "/old/no-capability.json", reason: "unsupported format", code: "session-import", blocking: false },
      { file: "/unknown.json", reason: "unsupported legacy schema 1", blocking: false, notice: { key: "unknown", dismissed: NOW } },
      { file: "/folder.json", reason: "missing folder", code: "session-folder-required", blocking: false, notice: { key: "folder" } },
      { file: "/blocked.json", reason: "blocked import", code: "session-upgrade", blocking: true, notice: { key: "blocked", dismissed: NOW } },
      { file: "/blocked-repair", reason: "blocked folder", blocking: true, repair: unpaired({ declined: NOW }) },
    ];
    await renderGroups(repoState({}, { diagnostics, issues: 5 }), { open: false });
    expect(screen.getByTestId("space-issues").textContent).toBe("⚠Review (5)");
    expect(screen.queryByTestId("space-dismissed")).toBeNull();
    expect(screen.getAllByTestId("space-diagnostic")).toHaveLength(4);
    expect(screen.queryByTestId("space-notice-dismiss")).toBeNull();
    expect(screen.queryByTestId("space-repair-decline")).toBeNull();
    expect(screen.getByTestId("space-repair")).toBeTruthy();
    expect(screen.getByTestId("space-folder-review").className).toContain("amber");
  });

  test("active outcomes keep their places and focus while dismissed repairs move into their own section", async () => {
    const pair = (name: string) => ({
      file: `workspace/jane/${name}-spex`, reason: "no working folder", blocking: false,
      repair: unpaired({ repository: `jane/${name}-spex`, projectName: name, key: name,
        directories: [`/code/${name}`], proposal: { path: `/code/${name}`, from: "recorded" as const } }),
    });
    const rows = { infra: pair("infra"), slc: pair("slc"), docs: pair("docs") };
    type Name = keyof typeof rows;
    const standing = new Map<Name, "open" | "declined">([["infra", "open"], ["slc", "open"], ["docs", "open"]]);
    const report = (): GroupsState => repoState({}, {
      diagnostics: [...standing].map(([name, how]) =>
        how === "declined" ? { ...rows[name], repair: { ...rows[name].repair, declined: NOW } } : rows[name]),
    });
    commandMock.mockImplementation(async (type: string, fields: Record<string, unknown> = {}) => {
      if (type === "space.repair.decline") {
        standing.set(fields.repair as Name, fields.declined ? "declined" : "open");
        return home.current = report();
      }
      if (type === "project.rebind") {
        const name = (Object.keys(rows) as Name[]).find((entry) => rows[entry].repair.repository === fields.projectId)!;
        standing.delete(name);
        home.current = report();
        return { id: fields.projectId, name, path: fields.path, registeredAt: 1 };
      }
      if (type === "project.list") return [];
      return answer(type, fields);
    });
    const { onOpenProject } = await renderGroups(report(), { open: false });
    fireEvent.click(screen.getByTestId("space-issues"));
    const items = () => within(screen.getByTestId("space-folder-review")).getAllByRole("listitem");
    const at = (index: number) => items()[index]!;
    fireEvent.click(within(at(0)).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(screen.getByTestId("space-issues").textContent).toBe("⚠Review (2)"));
    const dismissed = screen.getByTestId("space-dismissed") as HTMLDetailsElement;
    expect(dismissed.open).toBe(false);
    expect(items()).toHaveLength(2);
    expect(at(0).textContent).toContain("slc");
    expect(live()).toBe("Moved to Dismissed. Your conversations are kept.");
    await waitFor(() => expect(document.activeElement).toBe(dismissed.querySelector("summary")));

    fireEvent.click(within(at(1)).getByTestId("space-repair-use"));
    await waitFor(() => expect(at(1).dataset.testid).toBe("space-repair-resolved"));
    expect(at(1).textContent).toContain("Project folder saved: /code/docs");
    expect(screen.getByTestId("space-issues").textContent).toBe("⚠Review (1)");
    await waitFor(() => expect(document.activeElement).toBe(within(at(0)).getByTestId("space-repair-use")));
    deliver(home.current);
    expect(items().map((item) => item.dataset.testid)).toEqual(["space-repair", "space-repair-resolved"]);

    fireEvent.click(screen.getByTestId("space-refresh"));
    await waitFor(() => expect(items()).toHaveLength(1));
    expect(at(0).textContent).toContain("slc");
    fireEvent.click(within(at(0)).getByTestId("space-repair-use"));
    await waitFor(() => expect(at(0).dataset.testid).toBe("space-repair-resolved"));
    expect(screen.getByTestId("space-issues").textContent).toBe("Review");
    const openSlc = within(at(0)).getByRole("button", { name: "Open project" });
    await waitFor(() => expect(document.activeElement).toBe(openSlc));
    fireEvent.click(openSlc);
    expect(onOpenProject).toHaveBeenCalledWith("jane/slc-spex");

    fireEvent.click(dismissed.querySelector("summary")!);
    fireEvent.click(within(screen.getByTestId("space-repair-declined")).getByTestId("space-repair-use"));
    await waitFor(() => expect(screen.queryByTestId("space-dismissed")).toBeNull());
    const infraOutcome = items().find((row) => row.textContent?.includes("/code/infra"))!;
    expect(infraOutcome.dataset.testid).toBe("space-repair-resolved");
    await waitFor(() => expect(document.activeElement).toBe(within(infraOutcome).getByRole("button", { name: "Open project" })));
    expect(home.current.diagnostics).toEqual([]);
    expect(items()).toHaveLength(2);
    fireEvent.click(screen.getByTestId("space-refresh"));
    await waitFor(() => expect(screen.queryByTestId("space-issues-list")).toBeNull());
  });

});

describe("SPACE: changes (space-7, space-8, space-10)", () => {
  test("local units group by kind in order with their labels and details; a session row opens its session", async () => {
    const { onOpenSession } = await renderGroups(repoState());
    const list = screen.getByTestId("space-local-list");
    const headings = within(list).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(["Sessions", "Intents", "Authoring", "Packages", "Settings", "Code", "Sync rules", "Other"]);
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

  test("with nothing to send the list reads 'Nothing to send from this computer' under 'To send (0)'", async () => {
    await renderGroups(repoState({ local: [] }));
    expect(screen.getByText("Nothing to send from this computer")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "To send (0)" })).toBeTruthy();
  });

  test("View diff shows the line diff in place for the right side and Hide diff removes it", async () => {
    await renderGroups(repoState({ incoming: [{ ...SETTINGS_UNIT }] }));
    const row = screen.getByTestId("space-unit-mine-config/playbook.config.yaml");
    fireEvent.click(within(row).getByRole("button", { name: "View diff" }));
    const diffId = "space-diff-mine-config/playbook.config.yaml";
    await waitFor(() => expect(screen.getByTestId(diffId).textContent).toContain("+new: 2"));
    const diff = screen.getByTestId(diffId);
    expect(diff.textContent).toContain("-old: 1");
    expect(diff.textContent).toContain("Changes on this computer");
    expect(calls("space.diff")).toEqual([{ repository: KEY, unit: "config/playbook.config.yaml", path: "config/playbook.config.yaml", side: "mine" }]);
    fireEvent.click(within(row).getByRole("button", { name: "Hide diff" }));
    expect(screen.queryByTestId("space-diff-mine-config/playbook.config.yaml")).toBeNull();
    const incoming = screen.getByTestId("space-unit-remote-config/playbook.config.yaml");
    fireEvent.click(within(incoming).getByRole("button", { name: "View diff" }));
    await waitFor(() => expect(calls("space.diff")).toHaveLength(2));
    // The host's side is the placement's the incoming row came from
    // (space-10).
    expect(calls("space.diff")[1]).toEqual({ repository: KEY, unit: "config/playbook.config.yaml", path: "config/playbook.config.yaml", side: "remote", placement: ORIGIN });
    await waitFor(() => expect(screen.getByTestId("space-diff-remote-config/playbook.config.yaml").textContent).toContain("Changes at Spex Example"));
  });

  test("Check fetches, reads 'Checking…' with Stop while it runs, and marks what this computer changed too", async () => {
    await renderGroups(repoState({ conflicts: [CONFLICTS[0]], incoming: [SESSION_UNIT, INCOMING_INTENT] }));
    // The mark stands on the incoming row alone (space-8).
    expect(screen.getAllByTestId("space-choose-sessions/s1")).toHaveLength(1);
    expect(screen.getByTestId("space-unit-remote-sessions/s1").textContent).toContain("choose");
    expect(screen.getByTestId("space-unit-mine-sessions/s1").textContent).not.toContain("choose");
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    await waitFor(() => expect(calls("space.fetch")).toEqual([{ repository: KEY }]));
    deliver(repoState({ sync: { phase: "running", op: "check", step: "check", since: NOW, cancelable: true } }));
    expect(screen.getByTestId("space-check").textContent).toBe("Checking…");
    expect(screen.getByTestId("space-step-line").textContent).toBe("Checking…");
    expect(screen.queryByTestId("space-step-save")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Stop" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() => expect(calls("space.cancel")).toEqual([{ repository: KEY }]));
    // Sync waits while a check runs.
    expect(syncControl().disabled).toBe(true);
    // Ahead, behind and the check time update on the placement's line,
    // in the Sync tab; the row carries no count of the records' Git
    // (space-8, space-87, DR-159).
    deliver(repoState({ branch: { ...BRANCH, ahead: 0, behind: 3, checkedAt: NOW } }));
    expect(within(lineAt()).getByTestId("space-line-state").getAttribute("title")).toContain("0 commits ahead, 3 commits behind");
    expect(screen.queryByTestId(`space-repo-counts-${KEY}`)).toBeNull();
  });

  test("a Space holding no records and records started separately read as such; records in no group offer no Check", async () => {
    await renderGroups(repoState({ branch: { ...BRANCH, hostEmpty: true, behind: 0 }, incoming: [] }));
    expect(screen.getByText("Spex Example holds no records yet; Sync will send these")).toBeTruthy();
    cleanup();
    await renderGroups(repoState({ local: [], branch: { ...BRANCH, unrelated: true }, incoming: [], sync: { phase: "unrelated", placement: ORIGIN } }));
    expect(screen.getByTestId("space-unrelated").textContent).toContain("Started separately at Spex Example");
    expect(screen.queryByTestId(`space-repo-counts-${KEY}`)).toBeNull();
    // The row keeps its "Sync records"; "Combine…" stands on the Space's
    // line and beside the row's phrase, never Join or Merge (space-13,
    // space-87, space-120, DR-172).
    expect(syncWords()).toBe("Sync records");
    expect(within(lineAt()).getByTestId("space-line-combine").textContent).toBe("Combine…");
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("Started separately at Spex Example");
    expect(screen.getByTestId(`space-row-combine-${KEY}`).textContent).toBe("Combine…");
    expect(document.body.textContent).not.toMatch(/\b(Join|Merge histories|Unrelated history)\b/);
    cleanup();
    await renderGroups(base({}, [repo({ state: "local-only", remote: null, branch: null })]));
    expect((screen.getByTestId("space-check") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Not checked yet")).toBeTruthy();
  });
});

describe("SPACE: syncing from the row (space-11, space-12, space-15, space-16, space-57)", () => {
  test("Sync sends the command naming the repository and reads 'Syncing…' with the rail naming each step while it runs", async () => {
    await renderGroups(repoState());
    // "Sync records" stands in the row's overflow, titled as what it does
    // (space-1).
    expect(syncWords()).toBe("Sync records");
    expect(syncControl().title).toBe("Sends what is here and brings back anything new");
    expect(screen.queryByTestId(`space-row-sync-${KEY}`)?.closest("[role=menu]")).toBeTruthy();
    fireEvent.click(syncControl());
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY }]));
    deliver(repoState({ sync: { phase: "running", op: "sync", step: "compare", since: NOW, cancelable: false } }));
    expect(syncWords()).toBe("Syncing…");
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
    expect(live()).toBe("Sending…");
    // No dot carries the standing: the phrase does (DR-172).
    expect(screen.queryByTestId("space-status-dot")).toBeNull();
  });

  test("Sync is refused before the first step with the reason beside the disabled control", async () => {
    await renderGroups(repoState({ mergePending: true }));
    // The reason stands beside "Sync records" in the row's overflow.
    expect(syncControl().disabled).toBe(true);
    expect(syncWords()).toBe("Sync records");
    expect(syncControl().lastElementChild?.textContent).toBe("Finish or abort the merge in your terminal");
    cleanup();
    // A displayed blocking diagnostic beneath this clone, perhaps stale
    // once its file is fixed, still shows under issues but leaves Sync
    // usable: Save validates the files as they stand.
    await renderGroups(repoState({}, { diagnostics: [{ file: `workspace/${KEY}/intents/x.json`, reason: "malformed intent", blocking: true }] }));
    expect(screen.getByTestId("space-issues-list")).toBeTruthy();
    expect(syncControl().disabled).toBe(false);
    expect(syncControl().textContent).toBe("Sync records");
    fireEvent.click(syncControl());
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY }]));
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
          message: "Spex Example refused: you are not allowed to push",
          guidance: "Ask a maintainer of jane on Spex Example for a role that can push, then Retry",
          retry: true,
        },
      }),
    );
    const card = screen.getByTestId("space-stopped");
    expect(screen.getByTestId("space-stopped-title").textContent).toBe("Sending stopped — Spex Example refused: you are not allowed to push");
    expect(card.textContent).toContain("a role that can push");
    expect(card.textContent).toContain("Saved on this computer, not sent yet");
    expect(live()).toContain("Sending stopped");
    fireEvent.click(within(card).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY }]));
    fireEvent.click(within(card).getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByTestId("space-stopped")).toBeNull();
  });

  test("each transport cause reads in the host's words as the core phrases them (space-15)", async () => {
    const stops: [string, string][] = [
      ["unreachable", "Could not reach Spex Example"],
      ["reauth", "Sign in again"],
      ["refused", "Spex Example refused: archived"],
      ["gone", "No longer shared with you"],
      ["timeout", "No answer from Spex Example"],
    ];
    for (const [cause, message] of stops) {
      await renderGroups(
        repoState({
          sync: { phase: "stopped", op: "check", step: "check", cause: cause as never, message, guidance: "Then Retry", retry: true },
        }),
      );
      expect(screen.getByTestId("space-stopped-title").textContent).toBe(`Checking stopped — ${message}`);
      cleanup();
    }
  });

  test("Retry after a stopped check fetches again; a rejected push reads amber with 'changed again'", async () => {
    await renderGroups(
      repoState({
        sync: { phase: "stopped", op: "check", step: "check", cause: "unreachable", message: "Could not reach Spex Example", guidance: "Check the network.", retry: true },
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(calls("space.fetch")).toEqual([{ repository: KEY }]));
    deliver(
      repoState({
        sync: { phase: "stopped", op: "sync", step: "push", cause: "rejected", message: "Spex Example changed again", guidance: "Sync again to take the new changes.", retry: true },
      }),
    );
    expect(screen.getByTestId("space-stopped-title").textContent).toContain("Spex Example changed again");
    expect(screen.getByTestId("space-stopped").className).toContain("amber");
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
    expect(screen.getByTestId("space-done-line").textContent).toBe("4 received; nothing sent");
    // A read-only repository's Sync only brings, and says so.
    expect(syncControl().title).toBe("Brings back anything new; sends nothing");
    expect(screen.getByTestId("space-read-only-note").textContent).toBe("New sessions stay on this computer");
  });

  test("records started separately offer Combine… on the Space's line, confirmed inline with Cancel focused; the row keeps Sync (space-13)", async () => {
    await renderGroups(repoState({ branch: { ...BRANCH, unrelated: true }, sync: { phase: "unrelated", placement: ORIGIN } }));
    // The row's one "Sync records" stands as ever (DR-128); "Combine…" on the
    // Space's line, never named Join or Merge (DR-172).
    expect(syncWords()).toBe("Sync records");
    expect(syncControl().title).toBe("Sends what is here and brings back anything new");
    fireEvent.keyDown(window, { key: "Escape" });
    const line = lineAt();
    const join = within(line).getByTestId("space-line-combine");
    expect(join.textContent).toBe("Combine…");
    fireEvent.click(join);
    const confirm = within(line).getByTestId("space-line-combine-confirm");
    expect(confirm.textContent).toContain("Combine both sets of records into one?");
    expect(confirm.textContent).toContain("Anything that differs asks you to choose");
    expect(document.activeElement).toBe(within(confirm).getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByTestId("space-line-combine-confirm")).toBeNull();
    expect(calls("space.sync")).toHaveLength(0);
    await waitFor(() => expect(document.activeElement).toBe(join));
    fireEvent.click(join);
    fireEvent.click(within(within(line).getByTestId("space-line-combine-confirm")).getByRole("button", { name: "Combine" }));
    // The join names its placement (space-29).
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY, placement: ORIGIN, join: true }]));
    cleanup();
    commandMock.mockClear();
    // The row offers the same beside its phrase: "Combine…", confirmed
    // inline beneath the row, Cancel focused (space-13, space-120).
    await renderGroups(repoState({ local: [], branch: { ...BRANCH, unrelated: true }, sync: { phase: "unrelated", placement: ORIGIN } }), { open: false });
    const merge = screen.getByTestId(`space-row-combine-${KEY}`);
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("Started separately at Spex Example");
    fireEvent.click(merge);
    const rowConfirm = screen.getByTestId(`space-row-combine-confirm-${KEY}`);
    expect(rowConfirm.textContent).toContain("Combine both sets of records into one?");
    expect(document.activeElement).toBe(within(rowConfirm).getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(rowConfirm).getByRole("button", { name: "Combine" }));
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY, placement: ORIGIN, join: true }]));
  });

  test("space-57: the first sync of records others share asks 'Share with <group> at <Space>?' over its three phrases; Share records it", async () => {
    await renderGroups(repoState({ members: 3, noticed: false }));
    fireEvent.click(syncControl());
    let notice = screen.getByTestId("space-notice-confirm");
    // Titled by the group the records are in — "Personal" for your own —
    // and the Space, over three phrases, no sentence (space-57).
    expect(notice.textContent).toContain("Share with Personal at Spex Example?");
    expect(notice.textContent).toContain("All sessions: conversations, agent activity, and attachments");
    expect(notice.textContent).toContain("Existing and future project records");
    expect(notice.textContent).toContain("Removing access won’t erase copies members already saved");
    expect(notice.textContent).not.toContain("Public: anyone can read");
    expect(document.activeElement).toBe(within(notice).getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByTestId("space-notice-confirm")).toBeNull();
    expect(calls("space.sync")).toHaveLength(0);
    fireEvent.click(syncControl());
    fireEvent.click(within(screen.getByTestId("space-notice-confirm")).getByRole("button", { name: "Cancel" }));
    expect(calls("space.sync")).toHaveLength(0);
    fireEvent.click(syncControl());
    notice = screen.getByTestId("space-notice-confirm");
    fireEvent.click(within(notice).getByRole("button", { name: "Share" }));
    // The notice is seen for that placement (space-29).
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY, placement: ORIGIN, noticed: true }]));
    cleanup();
    // A public repository says its records are public.
    await renderGroups(repoState({ members: 3, noticed: false, visibility: "public" }));
    fireEvent.click(syncControl());
    expect(screen.getByTestId("space-notice-confirm").textContent).toContain("Public: anyone can read");
    cleanup();
    // Once seen it is not said again, and a repository whose only
    // member is the account says nothing.
    // One whose count the host's read lacks, never synced from here, may
    // have others: it says so too.
    await renderGroups(repoState({ members: null, noticed: false, lastSync: null }));
    fireEvent.click(syncControl());
    expect(screen.getByTestId("space-notice-confirm").textContent).toContain("All sessions: conversations, agent activity, and attachments");
    cleanup();
    for (const over of [{ members: 3, noticed: true }, { members: 1, noticed: false }, { members: null, noticed: false }]) {
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
    // The row's overflow, which holds "Sync records", and its Open.
    expect((screen.getByTestId(`space-row-more-${KEY}`) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId(`space-row-open-${KEY}`) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("space-check") as HTMLButtonElement).disabled).toBe(true);
    // The placement line's Members too, in the Sync tab (space-87).
    expect((within(lineAt()).getByTestId("space-line-members") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("space-refresh") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("SPACE: choices (space-9, space-17, space-18)", () => {
  // Nothing waits to be sent, so the row's phrase is the choices owed
  // (space-120).
  const choicesState = (over: RowOver = {}) =>
    repoState({
      local: [],
      incoming: [SESSION_UNIT, SETTINGS_UNIT, INCOMING_INTENT],
      conflicts: CONFLICTS,
      sync: { phase: "choices", placement: ORIGIN, savedCommit: "abc123" },
      ...over,
    });

  test("choices needed shows the incoming list above the picker with the step line and caption", async () => {
    await renderGroups(choicesState());
    expect(screen.getByTestId("space-step-line").textContent).toBe("Needs your choice");
    // The caption and the incoming section name the placement's
    // instance (space-8, space-9).
    expect(screen.getByText("Your changes are saved; nothing is sent to Spex Example yet")).toBeTruthy();
    expect(within(screen.getByTestId(`space-incoming-${ORIGIN}`)).getByRole("heading", { level: 2 }).textContent).toBe("From Spex Example (3)");
    const incoming = screen.getByTestId("space-incoming-list");
    const picker = screen.getByTestId("space-picker");
    expect(incoming.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Choose for 2 conflicts" })).toBeTruthy();
    // The row reads the placement's outcome, with Resolve showing the
    // same picker beneath the row, its choices the Sync tab's (space-14,
    // space-87, DR-159).
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("Changed here and at Spex Example");
    fireEvent.click(screen.getByTestId(`space-row-resolve-${KEY}`));
    const beneath = screen.getByTestId(`space-row-resolve-picker-${KEY}`);
    expect(screen.getByTestId(`space-row-${KEY}`).contains(beneath)).toBe(true);
    const tab = within(screen.getByTestId("space-repository")).getByTestId("space-picker");
    fireEvent.click(within(within(beneath).getByRole("radiogroup", { name: "Fix the login redirect" })).getByLabelText(/Take Spex Example's/));
    expect(within(beneath).getByTestId("space-chosen").textContent).toBe("1 of 2 chosen");
    expect(within(tab).getByTestId("space-chosen").textContent).toBe("1 of 2 chosen");
    expect((within(within(tab).getByRole("radiogroup", { name: "Fix the login redirect" })).getByLabelText(/Take Spex Example's/) as HTMLInputElement).checked).toBe(true);
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
    expect(within(session).getByLabelText(/Keep this computer's/).parentElement?.textContent).toContain("updated 2h ago · 12 turns");
    expect(within(session).getByLabelText(/Take Spex Example's/).parentElement?.textContent).toContain("updated 5h ago · 9 turns");
    expect(within(settings).getAllByRole("button", { name: "View diff" })).toHaveLength(2);
    expect(within(session).queryByRole("button", { name: "View diff" })).toBeNull();
    const apply = screen.getByTestId("space-apply") as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    expect(screen.getByTestId("space-chosen").textContent).toBe("0 of 2 chosen");
    fireEvent.click(within(session).getByLabelText(/Take Spex Example's/));
    expect(screen.getByTestId("space-chosen").textContent).toBe("1 of 2 chosen");
    expect(apply.disabled).toBe(true);
    fireEvent.click(within(settings).getByLabelText(/Keep this computer's/));
    expect(screen.getByTestId("space-chosen").textContent).toBe("2 of 2 chosen");
    expect(apply.disabled).toBe(false);
  });

  test("arrow keys move within a group, and All here / All <display name>'s fill every row", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "All Spex Example's" }));
    expect(screen.getByTestId("space-chosen").textContent).toBe("2 of 2 chosen");
    for (const group of screen.getAllByRole("radiogroup")) {
      expect((within(group).getByLabelText(/Take Spex Example's/) as HTMLInputElement).checked).toBe(true);
    }
    fireEvent.click(screen.getByRole("button", { name: "All here" }));
    for (const group of screen.getAllByRole("radiogroup")) {
      expect((within(group).getByLabelText(/Keep this computer's/) as HTMLInputElement).checked).toBe(true);
    }
  });

  test("Apply asks one inline confirm with Cancel focused; Escape keeps the choices; confirming syncs with them", async () => {
    await renderGroups(choicesState());
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Fix the login redirect" })).getByLabelText(/Take Spex Example's/));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Settings changed" })).getByLabelText(/Keep this computer's/));
    fireEvent.click(screen.getByTestId("space-apply"));
    const confirm = screen.getByTestId("space-apply-confirm");
    expect(confirm.textContent).toContain("Take Spex Example's version of 1 record?");
    expect(confirm.textContent).toContain("stays in Git history");
    expect(confirm.textContent).toContain("loses its resume hints");
    expect(confirm.textContent).not.toMatch(/\bunits?\b/);
    expect(document.activeElement).toBe(within(confirm).getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByTestId("space-apply-confirm")).toBeNull();
    expect(screen.getByTestId("space-chosen").textContent).toBe("2 of 2 chosen");
    expect(calls("space.sync")).toHaveLength(0);
    fireEvent.click(screen.getByTestId("space-apply"));
    fireEvent.click(within(screen.getByTestId("space-apply-confirm")).getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(calls("space.sync")).toEqual([
        { repository: KEY, placement: ORIGIN, choices: { "sessions/s1": "remote", "config/playbook.config.yaml": "mine" } },
      ]),
    );
  });

  test("a combine waiting for choices lists what is incoming, offers Combine…, and applies with the join", async () => {
    await renderGroups(
      choicesState({
        branch: { ...BRANCH, unrelated: true, ahead: null, behind: null },
        incoming: [INCOMING_SESSION, INCOMING_INTENT],
        conflicts: [CONFLICTS[1]],
      }),
    );
    // The incoming list stands above the picker (space-9); the histories
    // stay unrelated until the merge lands, so the placement's line
    // offers Combine… beside the row's Sync (space-13).
    expect(screen.getByTestId("space-incoming-list")).toBeTruthy();
    expect(screen.getByTestId("space-unit-remote-sessions/s2").textContent).toContain("Draft the release notes");
    // The row reads the choices it owes, not the history being merged
    // (space-87, space-14).
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("Changed here and at Spex Example");
    expect(screen.getByTestId(`space-row-resolve-${KEY}`)).toBeTruthy();
    expect(screen.queryByText("Started separately at Spex Example")).toBeNull();
    expect(syncWords()).toBe("Sync records");
    expect(within(lineAt()).getByTestId("space-line-combine").textContent).toBe("Combine…");
    expect(screen.queryByTestId(`space-repo-counts-${KEY}`)).toBeNull();
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Settings changed" })).getByLabelText(/Keep this computer's/));
    fireEvent.click(screen.getByTestId("space-apply"));
    fireEvent.click(within(screen.getByTestId("space-apply-confirm")).getByRole("button", { name: "Apply" }));
    // Apply carries the choices and the join, for that placement
    // (space-13, space-18).
    await waitFor(() =>
      expect(calls("space.sync")).toEqual([{ repository: KEY, placement: ORIGIN, choices: { "config/playbook.config.yaml": "mine" }, join: true }]),
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
    expect(within(group).getByLabelText(/Keep this computer's/).parentElement?.textContent).toContain("deleted");
    expect(within(group).getByLabelText(/Take Spex Example's/).parentElement?.textContent).toContain("updated 1h ago · 13 turns");
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
    fireEvent.click(screen.getByRole("button", { name: "All here" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(calls("space.sync")).toEqual([
        { repository: KEY, placement: ORIGIN, choices: { "sessions/s1": "mine", "config/playbook.config.yaml": "mine" } },
      ]),
    );
  });
});

describe("SPACE: the explorer (space-23, space-24, space-25)", () => {
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
    const tree = screen.getByRole("tree", { name: "Files in academy" });
    expect(screen.getByTestId("space-explore-tab").textContent).toContain(CLONE);
    const items = within(tree).getAllByRole("treeitem");
    expect(items.filter((item) => item.tabIndex === 0)).toHaveLength(1);
    expect(screen.getByTestId("space-node-project.json").textContent).toContain("where the code is");
    expect(screen.getByTestId("space-node-project.json").textContent).toContain("Shared");
    // The environment's files read by their file names, never the
    // catalog's nouns (space-23, DR-172).
    expect(screen.getByTestId("space-node-spex.yaml").textContent).not.toContain("spec package requests");
    expect(screen.getByTestId("space-node-spex.yaml").textContent?.match(/spex\.yaml/g)).toHaveLength(2);
    expect(screen.getByTestId("space-node-packages").textContent).toContain("installed packages");
    // No catalog noun stands in the tree: manifest, request, lock, lease
    // (DR-172).
    expect(tree.textContent).not.toMatch(/manifest|request|lease|spec package lock|sidecar|staging|marker/);
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

  test("space-1: Explore records in the row's overflow opens its Explore tab beneath the list, as its name opens its Sync tab", async () => {
    await renderGroups(repoState(), { open: false });
    fireEvent.click(within(openMore()).getByTestId(`space-row-explore-${KEY}`));
    expect(await screen.findByTestId("space-tree")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Explore" }).getAttribute("aria-selected")).toBe("true");
    expect(calls("space.tree")[0]).toEqual({ repository: KEY });
    cleanup();
    await renderGroups(repoState());
    expect(screen.getByRole("tab", { name: "Sync" }).getAttribute("aria-selected")).toBe("true");
  });

  test.each(["en", "zh"] as const)("space-23, space-27: `placements/<folder>.yaml` reads 'kept at <Space>' and its folder 'where these records are kept', Shared, never 'placement' (%s)", async (language) => {
    activateLanguage(language);
    const zh = language === "zh";
    const folderWord = zh ? "保存这些记录的位置" : "where these records are kept";
    const fileWord = zh ? "保存在 Spex Example" : "kept at Spex Example";
    const shared = zh ? "已共享" : "Shared";
    await renderGroups(repoState());
    fireEvent.click(screen.getByRole("tab", { name: zh ? "浏览" : "Explore" }));
    // The core names the folder and each file in it by one family
    // (space-35); the entry reads this interface's word for it, never
    // the raw family in another language (space-23).
    const folder = await screen.findByTestId("space-node-placements");
    expect(within(folder).getByText(folderWord).textContent).toBe(folderWord);
    expect(folder.textContent?.replace("placements/", "")).not.toMatch(/placement|放置/);
    expect(folder.querySelector("[data-sync]")?.getAttribute("data-sync")).toBe("shared");
    expect(folder.querySelector("[data-sync]")?.textContent).toBe(shared);
    fireEvent.click(folder);
    const file = await screen.findByTestId("space-node-placements/@spex.example.yaml");
    expect(calls("space.tree").at(-1)).toEqual({ repository: KEY, path: "placements" });
    expect(file.getAttribute("aria-level")).toBe("2");
    expect(within(file).getByText(fileWord).textContent).toBe(fileWord);
    expect(file.textContent?.replace("@spex.example.yaml", "")).not.toMatch(/placement|放置/);
    expect(file.querySelector("[data-sync]")?.getAttribute("data-sync")).toBe("shared");
    expect(file.querySelector("[data-sync]")?.textContent).toBe(shared);
  });

  test("'Stays on this computer' names the eight families with one reason each", async () => {
    await openExplore();
    const panel = screen.getByTestId("space-privacy");
    fireEvent.click(within(panel).getByRole("button"));
    const text = panel.textContent ?? "";
    for (const family of [
      "provider hints",
      "in-use files",
      "installed packages and skills for agents",
      "where projects live",
      "preferences",
      "credentials",
      "migration receipts and inputs",
      "temporary files",
    ]) {
      expect(text).toContain(family);
    }
    expect(text).toContain("this computer's sign-in to each Space");
    expect(text).toContain("resume tokens for this computer's agent conversations; they work nowhere else");
    expect(text).toContain("copies installed from spex.lock; every computer installs its own");
    expect(within(panel).getByTestId("space-privacy-toggle").textContent).toBe("Stays on this computer");
    expect(text).not.toMatch(/\b(device|machine|instance)\b/);
  });

  test("a session's chunk directory stays under its one session node", async () => {
    await openExplore();
    fireEvent.click(screen.getByTestId("space-node-sessions"));
    const session = await screen.findByTestId("space-node-session:s1");
    fireEvent.click(session);
    const chunks = screen.getByTestId("space-node-sessions/s1.chunks");
    expect(chunks.getAttribute("aria-level")).toBe("3");
    expect(chunks.textContent).toContain("session history");
    fireEvent.click(chunks);
    const chunk = await screen.findByTestId(`space-node-sessions/s1.chunks/${"a".repeat(64)}`);
    expect(chunk.getAttribute("aria-level")).toBe("4");
    expect(screen.getAllByTestId("space-node-session:s1")).toHaveLength(1);
  });

  test("arrow keys move, disclose and collapse; a session's files group under one node titled by the session", async () => {
    const { onOpenSession } = await openExplore();
    const tree = screen.getByRole("tree", { name: "Files in academy" });
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
    // A session's parts read by what they are: its file and its
    // transcript, never a manifest or records (DR-172).
    const manifest = screen.getByTestId("space-node-sessions/s1.json");
    expect(manifest.textContent).toContain("session file");
    expect(manifest.textContent).not.toContain("manifest");
    expect(screen.getByTestId("space-node-sessions/s1.records.jsonl").textContent).toContain("transcript");
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
    await waitFor(() => expect(screen.getByTestId("space-preview").textContent).toContain("First 2,000 lines shown"));
    fireEvent.click(screen.getByTestId("space-node-notes.bin"));
    expect(screen.getByTestId("space-preview").textContent).toContain("binary file · 8.8 KB");
    fireEvent.click(screen.getByTestId("space-node-packages"));
    expect(screen.getByTestId("space-preview").textContent).toContain("installed packages · 1 entry");
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
    expect(live()).toBe("Copy unavailable — select the path");
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

/** The words the surface never shows for its things (space-27, DR-172):
 * the Space is named by its display name and this computer as such. */
const BANNED_WORDS =
  /\b(instances?|hosts?|sites?|subgroups?|namespaces?|spex repositor(y|ies)|clones?|units?|placements?|devices?|machines?|seats?|tickets?)\b/i;

describe("SPACE: copy and roles (space-27, space-28, space-44)", () => {
  test("no visible text in the records' tabs says ours, theirs, HEAD, origin/spex, MERGE_HEAD, or names the Space or this computer by another word", async () => {
    const states: GroupsState[] = [
      base({}, [repo({ state: "local-only", remote: null, branch: null })]),
      repoState(),
      repoState({ incoming: [SESSION_UNIT, SETTINGS_UNIT], conflicts: CONFLICTS, sync: { phase: "choices", placement: ORIGIN, savedCommit: null } }),
      repoState({ sync: { phase: "running", op: "sync", step: "apply", since: NOW, cancelable: false } }),
      repoState({ branch: { ...BRANCH, unrelated: true }, mergePending: true, sync: { phase: "unrelated", placement: ORIGIN } }, { diagnostics: [MERGE_DIAGNOSTIC] }),
      repoState({ sync: { phase: "stopped", op: "sync", step: "push", cause: "rejected", message: "Spex Example changed again", guidance: "Sync again.", retry: true } }),
      repoState({ sync: { phase: "done", at: NOW, sent: 1, received: 2, pushed: true } }),
    ];
    for (const state of states) {
      await renderGroups(state);
      // The issues list, opened, counts too.
      const issues = screen.queryByTestId("space-issues");
      if (issues) fireEvent.click(issues);
      for (const text of [document.body.textContent ?? ""]) {
        expect(text).not.toMatch(GIT_WORDS);
        expect(text).not.toMatch(BANNED_WORDS);
        expect(strayRemote(text)).toBe(false);
      }
      fireEvent.click(screen.getByRole("tab", { name: "Explore" }));
      await screen.findByTestId("space-tree");
      const text = document.body.textContent ?? "";
      expect(text).not.toMatch(GIT_WORDS);
      expect(text).not.toMatch(BANNED_WORDS);
      expect(strayRemote(text)).toBe(false);
      cleanup();
    }
  });

  test("every control in the records' tabs reads at most 14 characters, its busy form included", async () => {
    const states: GroupsState[] = [
      base({}, [repo({ state: "local-only", remote: null, branch: null })]),
      repoState({ incoming: [SESSION_UNIT, SETTINGS_UNIT], conflicts: CONFLICTS, sync: { phase: "choices", placement: ORIGIN, savedCommit: null } }),
      repoState({ sync: { phase: "running", op: "sync", step: "push", since: NOW, cancelable: true } }),
      repoState({ sync: { phase: "stopped", op: "sync", step: "push", cause: "git", message: "x", guidance: "y", retry: true } }),
    ];
    // The acts a decision fixes as whole phrases stand past the budget:
    // "Add to a group…" and the fill naming the Space the choices are
    // for, "All <display name>'s" (space-17, space-28, space-58).
    const named = new Set(["Add to a group…", "All Spex Example's"]);
    for (const state of states) {
      await renderGroups(state);
      for (const button of screen.getAllByRole("button")) {
        // A repository's row is a row, its words its own (space-28).
        if (button.dataset.testid?.startsWith("space-repo-")) continue;
        const text = (button.textContent ?? "").trim();
        if (named.has(text)) continue;
        expect(text.length, `"${text}"`).toBeLessThanOrEqual(14);
      }
      cleanup();
    }
  });

  test("space-1: the surface ends in 'Spex keeps this computer's files in <home>', the full path in its title, with no control", async () => {
    await renderGroups(repoState(), { open: false });
    const foot = screen.getByTestId("space-home");
    expect(foot.textContent).toBe("Spex keeps this computer's files in ~/.spex");
    expect(foot.title).toBe(HOME);
    expect(foot.querySelector("button, a")).toBeNull();
  });

  test("the surface, the groups, the tabs, the tree, the picker's groups and the live region are named for assistive technology", async () => {
    await renderGroups(repoState({ incoming: [SESSION_UNIT], conflicts: [CONFLICTS[0]], sync: { phase: "choices", placement: ORIGIN, savedCommit: null } }));
    expect(screen.getByRole("region", { name: "Space" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Your groups" })).toBeTruthy();
    // Your records at the Space stand under "Personal" (space-1).
    expect(screen.getAllByRole("heading").map((heading) => heading.textContent)).toContain("Personal");
    // The panel is named by the row's name, its `-spex` dropped (space-1).
    expect(screen.getByRole("region", { name: "academy" })).toBe(screen.getByTestId("space-repository"));
    expect(screen.getByRole("tablist", { name: "Views of academy" })).toBeTruthy();
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
    await screen.findByRole("tree", { name: "Files in academy" });
    expect(screen.getByRole("tabpanel", { name: "Explore" })).toBeTruthy();
    expect(screen.getByRole("separator", { name: "Resize the tree pane" })).toBeTruthy();
  });
});
