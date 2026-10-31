// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A spex repository placed at several instances, on the Space surface
// over a mocked client (DR-128, DR-159, DR-172): a line per placement in
// its row's Sync tab — never on the row, whose acts stand in its one
// overflow, "More" — in the core's order, naming its Space and its path
// there (space-87, space-1); what each placement did — the step in
// flight, the outcome the last sync left, its own state and last sync —
// on its line, Dismiss putting away what needs nothing of the reader
// (space-12, space-15, space-61); the row reading one phrase in its
// precedence (space-120); and the line's fit (space-28). Members, Share
// and Remove act on one placement from its line, naming its Space, its
// members panel naming the other Spaces the records are placed at, each
// read at the Space governing it — the earliest signed-in one listing
// its row while its own is signed out (space-62, space-69, space-72,
// git-host-5). A placement owing its sharing confirm waits with
// Continue, the confirm "Share with <group> at <display name>?"; the
// row's "Sync now" asks it first only where no other placement can run
// (space-57); records started separately combine from the line's
// "Combine…", or the row's (space-13), a Retry joining only the
// placement this page combined; a stopped one retries from its line or
// its row (space-15); focus after a line's act goes to the control that
// asked, or the row's name while it is busy, and after a row's act to
// its "More" (DR-010 §6); and the row's sign-in refusal and Retry follow
// every placement (space-11, space-61). The Sync tab lists each
// placement's incoming units under "From <display name> (<n>)"
// (space-8); choices stand for one placement, its incoming list above
// the picker and the caption and the other side naming its Space, the
// row's Resolve showing the same picker beneath it (space-9, space-14,
// space-17, space-18); a Space-side diff names its placement (space-10);
// and the rail names the placement in flight (space-12). A placement a
// file of the clone names, not yet on this computer, reads "Not on this
// computer" and offers nothing: attaching it, placing the records at
// another Space, leaving one and moving them to another group are not
// offered here (DR-172). A group whose listing holds a placement of a
// row standing elsewhere shows no line for it, its More holding Members
// alone (space-1). Last, space-95's home is walked whole and every
// control on a row, a heading or a line read at most 14 characters,
// idle, opened and busy (space-95, space-28).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { GroupsState, PlacementState, RepositoryState, SpaceOp } from "@sublang/spex-core/protocol";

import { activateLanguage } from "../i18n.js";
import { SpexCommandError } from "../lib/client.js";
import { absoluteTitle, shortMoment } from "../lib/time.js";
import { setClientForTests } from "../state/store.js";
import {
  ACME,
  BETA,
  NO_CAN,
  BRANCH,
  CONFLICTS,
  GAMMA,
  HOUR,
  INCOMING_INTENT,
  INCOMING_SESSION,
  KEY,
  MIN,
  NOW,
  ORIGIN,
  OWN,
  SECOND,
  SETTINGS_UNIT,
  answer,
  base,
  calls,
  commandMock,
  deliver,
  installClient,
  instance,
  namespace,
  ownRepo,
  placement,
  placementState,
  renderGroups,
  repo,
  signedOutAt,
  twoInstances,
  twoPlacementsHome,
} from "../fixtures/groups.js";

beforeEach(installClient);

afterEach(() => {
  cleanup();
  activateLanguage("en");
  setClientForTests(undefined);
  vi.useRealTimers();
});

/** A third instance the home lists, no read naming its display name
 * yet. */
const THIRD = "https://third.example";

/** Open a row's tabs beneath the list on its Sync tab, where its
 * placement lines stand and no row carries them (space-1, space-87,
 * DR-159); a row already open stays so. */
function openRow(key: string): void {
  const name = screen.getByTestId(`space-repo-${key}`);
  if (name.getAttribute("aria-expanded") !== "true") fireEvent.click(name);
  const sync = screen.queryByTestId("space-tab-sync");
  if (sync && sync.getAttribute("aria-selected") !== "true") fireEvent.click(sync);
}

/** A row's placement lines, in the order they stand in its Sync tab. */
function linesOf(key: string): HTMLElement[] {
  openRow(key);
  return within(screen.getByTestId(`space-lines-${key}`))
    .getAllByRole("listitem")
    .filter((item) => /^space-line-(http|path)/.test(item.dataset.testid ?? ""));
}

/** One line of a row, scoped by its placement's origin, its row's Sync
 * tab opened. */
function lineOf(key: string, origin: string | null): HTMLElement {
  openRow(key);
  return within(screen.getByTestId(`space-lines-${key}`)).getByTestId(`space-line-${origin ?? "path"}`);
}

/** A row's "More" (space-1, DR-159). */
const moreOf = (key = KEY): HTMLButtonElement => screen.getByTestId(`space-row-more-${key}`) as HTMLButtonElement;

/** What an entry of a row's "More" reads: its words, the reason beside
 * them, its title and its accessible name, and whether it is offered
 * now; null where the menu holds none. The menu is opened to read it and
 * closed again. */
interface Entry {
  label: string;
  hint: string;
  title: string | null;
  name: string | null;
  disabled: boolean;
}
function entryOf(key: string, id: string): Entry | null {
  const more = moreOf(key);
  const open = more.getAttribute("aria-expanded") === "true";
  if (!open) fireEvent.click(more);
  const item = screen.queryByTestId(id) as HTMLButtonElement | null;
  const read = item
    ? {
        label: item.firstElementChild?.textContent ?? "",
        hint: item.children[1]?.textContent ?? "",
        title: item.getAttribute("title"),
        name: item.getAttribute("aria-label"),
        disabled: item.disabled,
      }
    : null;
  if (!open) fireEvent.click(more);
  return read;
}

/** The entries of a row's "More", in order, by test id. */
function menuIds(key: string): string[] {
  const more = moreOf(key);
  const open = more.getAttribute("aria-expanded") === "true";
  if (!open) fireEvent.click(more);
  const ids = within(screen.getByTestId(`space-row-more-${key}-menu`))
    .getAllByRole("menuitem")
    .map((item) => item.dataset.testid ?? "");
  if (!open) fireEvent.click(more);
  return ids;
}

/** Activate an entry of a row's "More". */
function choose(key: string, id: string): void {
  const more = moreOf(key);
  if (more.getAttribute("aria-expanded") !== "true") fireEvent.click(more);
  fireEvent.click(screen.getByTestId(id));
}

/** The row's "Sync now" (space-1). */
const syncEntry = (key = KEY): Entry => entryOf(key, `space-row-sync-${key}`)!;
const syncNow = (key = KEY): void => choose(key, `space-row-sync-${key}`);

/** What a line reads: its name, its path there, its phrase. */
function reading(line: HTMLElement): { name: string; at: string | null; state: string } {
  return {
    name: within(line).getByTestId("space-line-instance").textContent ?? "",
    at: within(line).queryByTestId("space-line-at")?.textContent ?? null,
    state: within(line).getByTestId("space-line-state").textContent ?? "",
  };
}

const phraseOf = (key: string, origin: string | null): HTMLElement =>
  within(lineOf(key, origin)).getByTestId("space-line-state");

/** A placement's own ahead and behind as its last check counted them. */
const countsOf = (ahead: number, behind: number): string =>
  `${ahead} ${ahead === 1 ? "commit" : "commits"} ahead, ${behind} ${behind === 1 ? "commit" : "commits"} behind · checked ${absoluteTitle(BRANCH.checkedAt!)}`;

/** The opened project placed at the first and the second, its key
 * placement synced 5m ago and its second an hour ago, as a test says
 * otherwise of each line and of the row. */
function placedAtTwo(
  lines: { first?: Partial<PlacementState>; second?: Partial<PlacementState> } = {},
  over: Partial<RepositoryState> = {},
): GroupsState {
  const row = repo({
    placedAt: [ORIGIN, SECOND],
    lastSync: { at: NOW - 5 * MIN, sent: 1, received: 0 },
    placements: [
      placement({ lastSync: { at: NOW - 5 * MIN, sent: 1, received: 0 }, ...lines.first }),
      placement({
        instance: SECOND,
        path: "workshop/academy-spex",
        id: "52",
        members: 2,
        branch: { ...BRANCH, ahead: 0, behind: 0 },
        lastSync: { at: NOW - HOUR, sent: 0, received: 1 },
        ...lines.second,
      }),
    ],
    ...over,
  });
  return twoInstances({}, [row]);
}

describe("GROUPS: a line per placement (space-87, space-61, space-12, space-15, space-28)", () => {
  test("space-87: each row lists one line per placement in the state's order — held, file-named, waiting — each with its instance's display name, its path and its state; the path placement by its remote; no line on a row with no clone", async () => {
    await renderGroups(twoPlacementsHome(), { open: false });
    // The project placed at both: its key placement's line, then the
    // second's, each by its instance's display name and its path there.
    expect(linesOf(KEY).map((line) => line.dataset.testid)).toEqual([`space-line-${ORIGIN}`, `space-line-${SECOND}`]);
    expect(reading(lineOf(KEY, ORIGIN))).toEqual({ name: "Spex Example", at: "jane/academy-spex", state: "Synced 5m ago" });
    expect(reading(lineOf(KEY, SECOND))).toEqual({ name: "Second Example", at: "workshop/academy-spex", state: "Synced 1h ago" });
    expect(lineOf(KEY, SECOND).dataset.state).toBe("reachable");
    expect(lineOf(KEY, SECOND).dataset.attached).toBe("true");
    // The project at the first alone: the repository its placement file
    // names at the second stands as its line, not on this device, and
    // as no row of its own.
    expect(linesOf(BETA).map((line) => line.dataset.testid)).toEqual([`space-line-${ORIGIN}`, `space-line-${SECOND}`]);
    expect(reading(lineOf(BETA, SECOND))).toEqual({ name: "Second Example", at: "workshop/beta-spex", state: "Not on this computer" });
    // Attaching it is not offered here (DR-172).
    expect(within(lineOf(BETA, SECOND)).queryAllByRole("button")).toEqual([]);
    expect(lineOf(BETA, SECOND).dataset.state).toBe("absent");
    expect(lineOf(BETA, SECOND).dataset.attached).toBe("false");
    expect(screen.queryByTestId("space-row-@second.example/workshop/beta-spex")).toBeNull();
    // Your own group's own repository, placed at both, its lines in its
    // Sync tab and none on its row under Personal; a group's own at its
    // one instance (DR-159).
    expect(linesOf(OWN).map(reading)).toEqual([
      { name: "Spex Example", at: OWN, state: "Synced 3h ago" },
      { name: "Second Example", at: "jada/jada-spex", state: "Synced 3h ago" },
    ]);
    expect(screen.getByTestId("space-repository").contains(screen.getByTestId(`space-lines-${OWN}`))).toBe(true);
    expect(within(screen.getByTestId("space-group-@jane")).queryByTestId(`space-lines-${OWN}`)).toBeNull();
    expect(linesOf(ACME).map(reading)).toEqual([{ name: "Spex Example", at: "acme/acme-spex", state: "Synced 4h ago" }]);
    // A local-only project holds no placement and carries no line.
    expect(screen.getByTestId(`space-row-${GAMMA}`)).toBeTruthy();
    openRow(GAMMA);
    expect(screen.queryByTestId(`space-lines-${GAMMA}`)).toBeNull();
    cleanup();

    // Held in the order added, the path placement last, then a line a
    // placement file names, then an instance a creation waits at; the
    // path placement named by its remote with no path beside it, an
    // instance no read has named by its host name.
    const ordered = repo({
      placedAt: [ORIGIN, SECOND],
      placements: [
        placement({ lastSync: { at: NOW - 5 * MIN, sent: 0, received: 0 } }),
        placementState({ instance: null, path: "/srv/academy-spex.git", branch: { ...BRANCH, agreed: null } }),
        placementState({ instance: SECOND, path: "workshop/academy-spex", id: "52", attached: false, state: "absent", members: 2 }),
        placementState({
          instance: THIRD,
          path: "lab/academy-spex",
          attached: false,
          state: "absent",
          waiting: { step: "create", group: "lab", message: "403 Forbidden: you need at least the Maintainer role" },
        }),
      ],
    });
    const home = twoInstances({}, [ordered]);
    await renderGroups(
      { ...home, instances: [...home.instances, instance({ origin: THIRD, host: "third.example", displayName: null })] },
      { open: false },
    );
    expect(linesOf(KEY).map((line) => line.dataset.testid)).toEqual([
      `space-line-${ORIGIN}`,
      "space-line-path",
      `space-line-${SECOND}`,
      `space-line-${THIRD}`,
    ]);
    expect(linesOf(KEY).map(reading)).toEqual([
      { name: "Spex Example", at: "jane/academy-spex", state: "Synced 5m ago" },
      { name: "/srv/academy-spex.git", at: null, state: "Never synced" },
      { name: "Second Example", at: "workshop/academy-spex", state: "Not on this computer" },
      { name: "third.example", at: "lab/academy-spex", state: "Waiting for a member who can create it in lab" },
    ]);
    expect(linesOf(KEY).map((line) => [line.dataset.state, line.dataset.attached])).toEqual([
      ["reachable", "true"],
      ["reachable", "true"],
      ["absent", "false"],
      ["absent", "false"],
    ]);
    // The host's words for a waiting step ride its title (space-64).
    expect(phraseOf(KEY, THIRD).getAttribute("title")).toBe("403 Forbidden: you need at least the Maintainer role");
    cleanup();

    // A row with no clone here carries no line: one the instance lists,
    // and one in a group named like a login.
    const listed = repo({ state: "absent", folder: null, branch: null });
    const colliding = repo({ key: `${KEY}@9`, state: "unreachable", reason: "a group named like your login", folder: null, branch: null });
    await renderGroups(twoInstances({}, [listed, colliding]), { open: false });
    expect(screen.getByTestId(`space-row-${KEY}`)).toBeTruthy();
    openRow(KEY);
    expect(screen.queryByTestId(`space-lines-${KEY}`)).toBeNull();
    expect(screen.getByTestId(`space-row-${KEY}@9`)).toBeTruthy();
    openRow(`${KEY}@9`);
    expect(screen.queryByTestId(`space-lines-${KEY}@9`)).toBeNull();
  });

  test("space-87, space-12: the step in flight stands on its placement's line; synced reads 'Synced just now · N sent · M received' or 'Everything is in sync', a read-only line 'M received; nothing sent', 'Behind — Sync again'; 'Changed here and at <display name>', 'Started separately at <display name>' and 'Waiting for you to continue' stand until the next operation, and Dismiss puts away the synced and stopped ones", async () => {
    const synced = (sent: number, received: number) => ({ kind: "synced" as const, sent, received });
    const now = { at: NOW, sent: 0, received: 0 };

    // The first placement synced, the second's turn pushing: the step
    // stands on the line it runs at, the row's Sync busy.
    await renderGroups(
      placedAtTwo(
        { first: { outcome: synced(1, 0), lastSync: { ...now, sent: 1 } } },
        { sync: { phase: "running", op: "sync", placement: SECOND, step: "push", since: NOW, cancelable: true } },
      ),
      { open: false },
    );
    expect(phraseOf(KEY, ORIGIN).textContent).toBe("Synced just now · 1 sent · 0 received");
    expect(phraseOf(KEY, SECOND).textContent).toBe("Sending…");
    expect(phraseOf(KEY, SECOND).dataset.tone).toBe("running");
    // The row reads the same step (space-120).
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("Sending…");
    expect(syncEntry().label).toBe("Syncing…");
    cleanup();

    // Each outcome the last sync left, per placement.
    const cases: [Partial<PlacementState>, Partial<PlacementState>, RepositoryState["sync"], string, string][] = [
      [
        { outcome: synced(2, 1), lastSync: { at: NOW, sent: 2, received: 1 } },
        { outcome: synced(0, 0), lastSync: now },
        { phase: "done", at: NOW, sent: 2, received: 1, pushed: true },
        "Synced just now · 2 sent · 1 received",
        "Everything is in sync",
      ],
      [
        { outcome: synced(1, 0), lastSync: { ...now, sent: 1 } },
        { state: "read-only", reason: "archived", outcome: synced(0, 3), lastSync: { at: NOW, sent: 0, received: 3 } },
        { phase: "done", at: NOW, sent: 1, received: 3, pushed: true },
        "Synced just now · 1 sent · 0 received",
        "3 received; nothing sent",
      ],
      [
        { outcome: synced(1, 0), lastSync: { ...now, sent: 1 } },
        { outcome: { kind: "behind", sent: 1, received: 0 } },
        { phase: "done", at: NOW, sent: 1, received: 0, pushed: true },
        "Synced just now · 1 sent · 0 received",
        "Behind — Sync again",
      ],
      [
        { outcome: synced(1, 0), lastSync: { ...now, sent: 1 } },
        { outcome: { kind: "choices", sent: 0, received: 0 } },
        { phase: "choices", placement: SECOND, savedCommit: null },
        "Synced just now · 1 sent · 0 received",
        "Changed here and at Second Example",
      ],
      [
        { outcome: synced(1, 0), lastSync: { ...now, sent: 1 } },
        { outcome: { kind: "unrelated", sent: 0, received: 0 } },
        { phase: "unrelated", placement: SECOND },
        "Synced just now · 1 sent · 0 received",
        "Started separately at Second Example",
      ],
      [
        { outcome: synced(1, 0), lastSync: { ...now, sent: 1 } },
        { outcome: { kind: "waiting", sent: 0, received: 0 } },
        { phase: "done", at: NOW, sent: 1, received: 0, pushed: true },
        "Synced just now · 1 sent · 0 received",
        "Waiting for you to continue",
      ],
    ];
    for (const [first, second, sync, firstReads, secondReads] of cases) {
      await renderGroups(placedAtTwo({ first, second }, { sync }), { open: false });
      expect(phraseOf(KEY, ORIGIN).textContent, secondReads).toBe(firstReads);
      expect(phraseOf(KEY, SECOND).textContent, secondReads).toBe(secondReads);
      // What asks for the reader reads in the attention tone.
      expect(phraseOf(KEY, SECOND).dataset.tone, secondReads).toBe(
        ["Behind — Sync again", "Changed here and at Second Example", "Started separately at Second Example", "Waiting for you to continue"].includes(secondReads)
          ? "attention"
          : "idle",
      );
      cleanup();
    }

    // Dismiss on the Sync tab puts the synced outcome away on its line,
    // which reads its last sync again; the one waiting for the reader
    // stands. The dismissal outlives closing and reopening the row.
    const done: RepositoryState["sync"] = { phase: "done", at: NOW, sent: 1, received: 0, pushed: true };
    await renderGroups(
      placedAtTwo({ first: { outcome: synced(1, 0), lastSync: { ...now, sent: 1 } }, second: { outcome: { kind: "waiting", sent: 0, received: 0 } } }, { sync: done }),
    );
    fireEvent.click(screen.getByTestId("space-dismiss"));
    expect(phraseOf(KEY, ORIGIN).textContent).toBe("Synced just now");
    expect(phraseOf(KEY, SECOND).textContent).toBe("Waiting for you to continue");
    fireEvent.click(screen.getByTestId(`space-repo-${KEY}`));
    fireEvent.click(screen.getByTestId(`space-repo-${KEY}`));
    expect(screen.queryByTestId("space-done")).toBeNull();
    expect(phraseOf(KEY, ORIGIN).textContent).toBe("Synced just now");
    // The next sync's outcome is its own, not the one put away.
    deliver(
      placedAtTwo(
        { first: { outcome: synced(0, 2), lastSync: { at: NOW, sent: 0, received: 2 } } },
        { sync: { ...done, sent: 0, received: 2, at: NOW + 1 } },
      ),
    );
    expect(phraseOf(KEY, ORIGIN).textContent).toBe("Synced just now · 0 sent · 2 received");
    cleanup();

    // A stop put away by Dismiss reads the placement's state again; a
    // placement left behind, or with choices, unrelated history or the
    // notice owed, stands until the next operation.
    const stopped: RepositoryState["sync"] = {
      phase: "stopped",
      op: "sync",
      step: "push",
      cause: "unreachable",
      message: "Could not reach second.example",
      guidance: "Check the network, then Retry.",
      retry: true,
    };
    await renderGroups(
      placedAtTwo(
        {
          first: { outcome: { kind: "unrelated", sent: 0, received: 0 } },
          second: { outcome: { kind: "stopped", step: "push", cause: "unreachable", message: "Could not reach second.example", guidance: "Check the network, then Retry.", retry: true } },
        },
        { sync: stopped },
      ),
    );
    expect(phraseOf(KEY, SECOND).textContent).toBe("Sending stopped — Could not reach second.example");
    fireEvent.click(screen.getByTestId("space-dismiss"));
    expect(phraseOf(KEY, SECOND).textContent).toBe("Synced 1h ago");
    expect(phraseOf(KEY, ORIGIN).textContent).toBe("Started separately at Spex Example");
    cleanup();
    await renderGroups(
      placedAtTwo({ second: { outcome: { kind: "behind", sent: 1, received: 0 } } }, { sync: done }),
    );
    fireEvent.click(screen.getByTestId("space-dismiss"));
    expect(phraseOf(KEY, SECOND).textContent).toBe("Synced 1h ago");
  });

  test("space-15: a stopped placement's line reads its step and cause, the guidance in its title", async () => {
    await renderGroups(
      placedAtTwo(
        {
          second: {
            outcome: {
              kind: "stopped",
              step: "check",
              cause: "unreachable",
              message: "Could not reach Second Example",
              guidance: "Check the network, then Retry.",
              retry: true,
            },
          },
        },
        { sync: { phase: "done", at: NOW, sent: 0, received: 0, pushed: false } },
      ),
      { open: false },
    );
    const phrase = phraseOf(KEY, SECOND);
    expect(phrase.textContent).toBe("Checking stopped — Could not reach Second Example");
    // The guidance leads the title, the line's last counted ahead and
    // behind beside it (space-15, space-8).
    expect(phrase.getAttribute("title")).toMatch(/^Check the network, then Retry\. · 0 commits ahead, 0 commits behind · checked /);
    expect(phrase.dataset.tone).toBe("stopped");
    // The first placement, which ran, reads its own.
    expect(phraseOf(KEY, ORIGIN).textContent).toBe("Synced 5m ago");
    // The row reads the stop with Retry beside it (space-120).
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("Checking stopped — Could not reach Second Example");
    expect(screen.getByTestId(`space-row-retry-${KEY}`).textContent).toBe("Retry");
    cleanup();

    // The cause in the Space's words, a refusal retrying cannot help
    // offering no Retry.
    await renderGroups(
      placedAtTwo({
        second: {
          outcome: { kind: "stopped", step: "push", cause: "refused", message: "the repository is archived", guidance: "Ask a member who can share it", retry: false },
        },
      }),
      { open: false },
    );
    expect(phraseOf(KEY, SECOND).textContent).toBe("Sending stopped — the repository is archived");
    expect(phraseOf(KEY, SECOND).getAttribute("title")).toMatch(/^Ask a member who can share it · 0 commits ahead, 0 commits behind · checked /);
    expect(screen.queryByTestId(`space-row-retry-${KEY}`)).toBeNull();
    cleanup();

    // In the reader's language, the step's name and the Space's words.
    activateLanguage("zh");
    await renderGroups(
      placedAtTwo({
        second: {
          outcome: { kind: "stopped", step: "push", cause: "refused", message: "仓库已归档", guidance: "请联系能共享它的成员", retry: false },
        },
      }),
      { open: false },
    );
    expect(phraseOf(KEY, SECOND).textContent).toBe("发送已停止 — 仓库已归档");
    expect(phraseOf(KEY, SECOND).getAttribute("title")).toMatch(/^请联系能共享它的成员 · /);
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("发送已停止 — 仓库已归档");
  });

  test("space-61: a placement unreachable while the row reads reachable; every one unreachable makes the row unreachable; the row's last sync is its key placement's", async () => {
    const offline = { state: "unreachable" as const, reason: "the device is offline" };
    await renderGroups(placedAtTwo({ second: offline }), { open: false });
    expect(screen.getByTestId(`space-row-${KEY}`).dataset.state).toBe("reachable");
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("Synced 5m ago");
    expect(syncEntry().disabled).toBe(false);
    expect(lineOf(KEY, SECOND).dataset.state).toBe("unreachable");
    expect(phraseOf(KEY, SECOND).textContent).toBe("Unreachable: the device is offline");
    // Its own last sync, and its own ahead and behind as last counted,
    // ride its title (space-8).
    expect(phraseOf(KEY, SECOND).getAttribute("title")).toBe(
      `Unreachable: the device is offline · last synced ${absoluteTitle(NOW - HOUR)} · ${countsOf(0, 0)}`,
    );
    expect(phraseOf(KEY, ORIGIN).textContent).toBe("Synced 5m ago");
    cleanup();

    // A read-only placement reads so on its line alone.
    await renderGroups(placedAtTwo({ second: { state: "read-only", reason: "archived" } }), { open: false });
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("Synced 5m ago");
    expect(phraseOf(KEY, SECOND).textContent).toBe("Read-only: archived · last synced 1h ago");
    cleanup();

    // Every placement unreachable: the core reads the row unreachable,
    // and it offers Retry.
    await renderGroups(
      placedAtTwo({ first: offline, second: offline }, { state: "unreachable", reason: "the device is offline" }),
      { open: false },
    );
    expect(screen.getByTestId(`space-row-${KEY}`).dataset.state).toBe("unreachable");
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("Unreachable: the device is offline");
    expect(linesOf(KEY).map((line) => reading(line).state)).toEqual([
      "Unreachable: the device is offline",
      "Unreachable: the device is offline",
    ]);
    expect(screen.getByTestId(`space-row-retry-${KEY}`)).toBeTruthy();
    cleanup();

    // The row reads its key placement's last sync, never a later
    // placement's more recent one; ahead and behind ride each line's
    // title alone, the row carrying no counts (DR-159).
    await renderGroups(
      placedAtTwo({ second: { lastSync: { at: NOW - MIN, sent: 0, received: 1 }, branch: { ...BRANCH, ahead: 7, behind: 9 } } }),
      { open: false },
    );
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("Synced 5m ago");
    expect(screen.getByTestId(`space-repo-state-${KEY}`).getAttribute("title")).toBe(absoluteTitle(NOW - 5 * MIN));
    expect(phraseOf(KEY, SECOND).textContent).toBe("Synced 1m ago");
    expect(screen.queryByTestId(`space-repo-counts-${KEY}`)).toBeNull();
    expect(phraseOf(KEY, ORIGIN).getAttribute("title")).toBe(`${absoluteTitle(NOW - 5 * MIN)} · ${countsOf(2, 1)}`);
    expect(phraseOf(KEY, SECOND).getAttribute("title")).toBe(`${absoluteTitle(NOW - MIN)} · ${countsOf(7, 9)}`);
  });

  test.each(["en", "zh"] as const)(
    "space-87, space-61: a read-only line carries its last sync beside the host's reason — its age, or the moment the clone last agreed with it — truncating with its title; with none, the reason alone; an unreachable line carries it in its title alone (%s)",
    async (language) => {
      activateLanguage(language);
      const words =
        language === "en"
          ? {
              state: "Read-only: archived",
              last: (at: string) => ` · last synced ${at}`,
              hour: "1h ago",
              counts: countsOf(0, 0),
              gone: "Unreachable: the device is offline",
            }
          : {
              state: "只读：archived",
              last: (at: string) => ` · 上次同步于 ${at}`,
              hour: "1 小时前",
              counts: `领先 0 个提交，落后 0 个提交 · ${absoluteTitle(BRANCH.checkedAt!)} 检查过`,
              gone: "无法连接：the device is offline",
            };
      // This device's last sync with it, an hour ago.
      await renderGroups(placedAtTwo({ second: { state: "read-only", reason: "archived" } }), { open: false });
      const phrase = phraseOf(KEY, SECOND);
      expect(phrase.textContent).toBe(`${words.state}${words.last(words.hour)}`);
      // It truncates, its title holding the whole with the moment and
      // the counts (space-28, space-8).
      expect(phrase.className).toContain("truncate");
      expect(phrase.getAttribute("title")).toBe(`${words.state}${words.last(absoluteTitle(NOW - HOUR))} · ${words.counts}`);
      cleanup();

      // None recorded: the moment the clone last agreed with it.
      const agreedAt = NOW - 3 * HOUR;
      await renderGroups(
        placedAtTwo({ second: { state: "read-only", reason: "archived", lastSync: null, branch: { ...BRANCH, agreed: { at: agreedAt, current: false } } } }),
        { open: false },
      );
      expect(phraseOf(KEY, SECOND).textContent).toBe(`${words.state}${words.last(shortMoment(agreedAt))}`);
      cleanup();

      // None held: the reason alone.
      await renderGroups(placedAtTwo({ second: { state: "read-only", reason: "archived", lastSync: null, branch: null } }), { open: false });
      expect(phraseOf(KEY, SECOND).textContent).toBe(words.state);
      expect(phraseOf(KEY, SECOND).getAttribute("title")).toBe(words.state);
      cleanup();

      // An unreachable line keeps it to its title.
      await renderGroups(placedAtTwo({ second: { state: "unreachable", reason: "the device is offline" } }), { open: false });
      expect(phraseOf(KEY, SECOND).textContent).toBe(words.gone);
      expect(phraseOf(KEY, SECOND).getAttribute("title")).toContain(words.last(absoluteTitle(NOW - HOUR)));
    },
  );

  test("space-28: a line's name owns the slack and truncates with its title; its path hides below 28rem", async () => {
    await renderGroups(twoPlacementsHome(), { open: false });
    const line = lineOf(KEY, SECOND);
    expect(line.className).toContain("min-w-0");
    const name = within(line).getByTestId("space-line-instance");
    for (const token of ["min-w-0", "flex-1", "truncate"]) expect(name.className.split(/\s+/)).toContain(token);
    expect(name.getAttribute("title")).toBe("Second Example");
    // The path yields below @md (28rem), its title kept.
    const at = within(line).getByTestId("space-line-at");
    for (const token of ["hidden", "@md:inline", "truncate", "min-w-0"]) expect(at.className.split(/\s+/)).toContain(token);
    expect(at.getAttribute("title")).toBe("workshop/academy-spex");
    // The phrase shrinks and truncates, its title kept.
    const phrase = within(line).getByTestId("space-line-state");
    for (const token of ["truncate", "min-w-0", "shrink"]) expect(phrase.className.split(/\s+/)).toContain(token);
    expect(phrase.getAttribute("title")).toBe(`${absoluteTitle(NOW - HOUR)} · ${countsOf(0, 0)}`);
    // The row reads one phrase, its key placement's, on every row whether
    // its lines are shown or not (space-87, DR-159): it truncates with its
    // title and describes the row's name.
    const phraseOfRow = screen.getByTestId(`space-repo-state-${KEY}`);
    for (const token of ["truncate", "min-w-0"]) expect(phraseOfRow.className.split(/\s+/)).toContain(token);
    expect(phraseOfRow.className.split(/\s+/)).not.toContain("hidden");
    expect(screen.getByTestId(`space-repo-${KEY}`).getAttribute("aria-describedby")).toContain(`space-repo-state-${KEY}`);
    expect(screen.getByTestId(`space-repo-state-${GAMMA}`).className.split(/\s+/)).not.toContain("hidden");
    // Below @xs the row's controls wrap beneath its name, its overflow
    // last (space-28, DR-041).
    const head = screen.getByTestId(`space-repo-${KEY}`).parentElement!;
    expect(head.className.split(/\s+/)).toContain("flex-wrap");
    expect(screen.getByTestId(`space-repo-${KEY}`).className.split(/\s+/)).toContain("truncate");
    const controls = moreOf().parentElement!.parentElement!;
    expect(controls.lastElementChild).toBe(moreOf().parentElement);
    expect(controls.className.split(/\s+/)).toContain("ml-auto");
  });
});

/** The name a line's control is described by: its line's instance
 * (space-87). */
const describedAs = (control: HTMLElement): string =>
  document.getElementById(control.getAttribute("aria-describedby") ?? "")?.textContent ?? "";

/** The placements of a row, as a test says otherwise of each, by its
 * instance's origin. */
function withLines(row: RepositoryState, over: Partial<PlacementState>): RepositoryState {
  return { ...row, placements: row.placements.map((line) => ({ ...line, ...over })) };
}

describe("GROUPS: a placement's members (space-62, space-69, space-72)", () => {
  test.each(["en", "zh"] as const)(
    "space-62: Members on each reachable placement line reads that placement's members, sending {repository, instance}; its panel says the records are also placed at every other instance the clone's files name, by display name, else host name; one placement says nothing more (%s)",
    async (language) => {
      activateLanguage(language);
      const words =
        language === "en"
          ? { members: "Members", also: (names: string) => `These records are also placed at ${names}`, and: " and " }
          : { members: "成员", also: (names: string) => `这些记录也放在 ${names}`, and: "和" };
      // The files name a third instance this home does not list.
      await renderGroups(placedAtTwo({}, { placedAt: [ORIGIN, SECOND, THIRD] }), { open: false });
      const first = within(lineOf(KEY, ORIGIN)).getByTestId("space-line-members");
      const second = within(lineOf(KEY, SECOND)).getByTestId("space-line-members");
      // One name for the act on every line, each described by its line's
      // instance, so the two are told apart.
      expect(first.getAttribute("aria-label")).toBe(words.members);
      expect(second.getAttribute("aria-label")).toBe(words.members);
      expect(describedAs(first)).toBe("Spex Example");
      expect(describedAs(second)).toBe("Second Example");

      // The second placement's members, read at its instance, its panel
      // beneath its line naming the others.
      fireEvent.click(second);
      expect(second.getAttribute("aria-expanded")).toBe("true");
      const panel = await screen.findByTestId(`space-members-${KEY}@${SECOND}`);
      expect(lineOf(KEY, SECOND).contains(panel)).toBe(true);
      await within(panel).findAllByTestId(/^space-member-/);
      expect(calls("space.members")).toEqual([{ repository: KEY, instance: SECOND }]);
      expect(within(panel).getByTestId("space-members-also").textContent).toBe(words.also(`Spex Example${words.and}third.example`));
      // It names the instances and links none (space-62, DR-120).
      expect(panel.querySelector("a")).toBeNull();

      // The key placement's, likewise.
      fireEvent.click(first);
      const keyPanel = await screen.findByTestId(`space-members-${KEY}@${ORIGIN}`);
      expect(lineOf(KEY, ORIGIN).contains(keyPanel)).toBe(true);
      await within(keyPanel).findAllByTestId(/^space-member-/);
      expect(calls("space.members")[1]).toEqual({ repository: KEY, instance: ORIGIN });
      expect(within(keyPanel).getByTestId("space-members-also").textContent).toBe(words.also(`Second Example${words.and}third.example`));
      // Escape closes it, focus back on its line's Members.
      fireEvent.keyDown(within(keyPanel).getByTestId("space-member-jane"), { key: "Escape" });
      expect(screen.queryByTestId(`space-members-${KEY}@${ORIGIN}`)).toBeNull();
      await waitFor(() => expect(document.activeElement).toBe(first));
      cleanup();

      // No Members on a placement unreachable, not on this device, or
      // with no instance (space-87).
      const pathRow = repo({
        placements: [placement(), placementState({ instance: null, path: "/srv/academy-spex.git", branch: { ...BRANCH, agreed: null } })],
      });
      await renderGroups(twoInstances({}, [withLines(pathRow, {})]), { open: false });
      expect(within(lineOf(KEY, null)).queryByTestId("space-line-members")).toBeNull();
      cleanup();
      await renderGroups(placedAtTwo({ second: { state: "unreachable", reason: "the device is offline" } }), { open: false });
      expect(within(lineOf(KEY, ORIGIN)).getByTestId("space-line-members")).toBeTruthy();
      expect(within(lineOf(KEY, SECOND)).queryByTestId("space-line-members")).toBeNull();
      cleanup();
      await renderGroups(twoPlacementsHome(), { open: false });
      expect(within(lineOf(BETA, SECOND)).queryByTestId("space-line-members")).toBeNull();
      cleanup();

      // One placement, or files naming only its own instance: nothing
      // more is said.
      for (const placedAt of [[], [ORIGIN]]) {
        await renderGroups(base({}, [repo({ placedAt })]), { open: false });
        fireEvent.click(within(lineOf(KEY, ORIGIN)).getByTestId("space-line-members"));
        const lone = await screen.findByTestId(`space-members-${KEY}@${ORIGIN}`);
        await within(lone).findAllByTestId(/^space-member-/);
        expect(within(lone).queryByTestId("space-members-also")).toBeNull();
        cleanup();
      }
    },
  );

  test("space-69, space-72: Share and Remove in a placement's panel name its instance", async () => {
    await renderGroups(placedAtTwo({ second: { can: { manageMembers: true, transfer: false } } }), { open: false });
    fireEvent.click(within(lineOf(KEY, SECOND)).getByTestId("space-line-members"));
    const panel = await screen.findByTestId(`space-members-${KEY}@${SECOND}`);
    await within(panel).findAllByTestId(/^space-member-/);
    // Share asks for a login at the placement's instance, among its
    // roles, and names the spex repository with that instance (space-69).
    fireEvent.click(within(panel).getByTestId(`space-share-${KEY}@${SECOND}`));
    const editor = within(panel).getByTestId(`space-share-${KEY}@${SECOND}-editor`);
    fireEvent.change(within(editor).getByLabelText("Login at Second Example"), { target: { value: "dave" } });
    fireEvent.click(within(editor).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(calls("space.share")).toEqual([{ repository: KEY, instance: SECOND, login: "dave", role: "30" }]));
    await waitFor(() => expect(within(panel).getByTestId(`space-members-outcome-${KEY}@${SECOND}`).textContent).toBe("@dave added as Developer"));
    // Remove names it likewise (space-72).
    fireEvent.click(within(panel).getByRole("button", { name: "Remove @bob" }));
    fireEvent.click(within(within(panel).getByTestId("space-member-confirm-bob")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(calls("space.unshare")).toEqual([{ repository: KEY, instance: SECOND, login: "bob" }]));
    // The key placement's panel, whose members the view says the person
    // may not manage, offers neither (space-62).
    fireEvent.click(within(lineOf(KEY, ORIGIN)).getByTestId("space-line-members"));
    const keyPanel = await screen.findByTestId(`space-members-${KEY}@${ORIGIN}`);
    await within(keyPanel).findAllByTestId(/^space-member-/);
    expect(within(keyPanel).queryByRole("button", { name: "Share" })).toBeNull();
    expect(within(keyPanel).queryByRole("button", { name: /^Remove @/ })).toBeNull();
  });

  test("space-62, git-host-5: a placement whose instance is signed out acts at the earliest signed-in instance listing its row, never at an earlier one that lists nothing of it; nothing moves it", async () => {
    // Listed first, second, third, fourth: the second, where the
    // placement is, signed out; the third, signed in, lists nothing of
    // the row; the fourth's workshop lists it as placed there.
    const FOURTH = "https://fourth.example";
    const may = { manageMembers: true, transfer: true };
    const out = signedOutAt(SECOND, {}, placedAtTwo({ second: { can: may } }));
    const group = (id: string, path: string, placed: { key: string; name: string }[] = []) => ({
      id,
      login: null,
      mine: false,
      fullPath: path,
      name: path,
      can: NO_CAN,
      placed,
      repositories: [],
    });
    const home: GroupsState = {
      ...out,
      instances: [
        ...out.instances,
        instance({
          origin: THIRD,
          host: "third.example",
          displayName: "Third Example",
          account: { id: "80", login: "tess", displayName: null, canCreateGroup: false },
          groups: [namespace("tess"), group("90", "labs")],
        }),
        instance({
          origin: FOURTH,
          host: "fourth.example",
          displayName: "Fourth Example",
          account: { id: "81", login: "finn", displayName: null, canCreateGroup: false },
          groups: [namespace("finn"), group("91", "workshop", [{ key: KEY, name: "academy-spex" }]), group("92", "studio")],
        }),
      ],
    };
    await renderGroups(home, { open: false });

    // Members reads at the placement's own instance, its Share asking
    // for a login at the fourth (space-62, space-69).
    fireEvent.click(within(lineOf(KEY, SECOND)).getByTestId("space-line-members"));
    const panel = await screen.findByTestId(`space-members-${KEY}@${SECOND}`);
    await within(panel).findAllByTestId(/^space-member-/);
    expect(calls("space.members")).toEqual([{ repository: KEY, instance: SECOND }]);
    fireEvent.click(within(panel).getByTestId(`space-share-${KEY}@${SECOND}`));
    expect(within(within(panel).getByTestId(`space-share-${KEY}@${SECOND}-editor`)).getByLabelText("Login at Fourth Example")).toBeTruthy();
    // Moving the records to another group is not offered here (DR-172).
    expect(within(lineOf(KEY, SECOND)).queryByTestId("space-line-move")).toBeNull();
    cleanup();

    // Where no signed-in instance lists the row, the placement's own
    // instance governs it, signed out: no Members.
    await renderGroups({ ...home, instances: home.instances.slice(0, 3) }, { open: false });
    expect(within(lineOf(KEY, SECOND)).queryByTestId("space-line-members")).toBeNull();
    expect(within(lineOf(KEY, SECOND)).queryByTestId("space-line-move")).toBeNull();
  });
});

/** What the core says when a placement's first push owes the notice
 * this device's reader has not seen (space-57): the refusal's facts
 * name that placement. */
const noticeRefusal = (placement: string): SpexCommandError =>
  new SpexCommandError("invalid_request", "Read the sharing notice before the first sync of academy-spex", {
    notice: true,
    members: 2,
    visibility: "private",
    placement,
  });

/** A placement the device is offline from. */
const OFFLINE = { state: "unreachable" as const, reason: "the device is offline" };
/** A placement whose repository has other members, never pushed from
 * this device, its notice unseen (space-57). */
const OWING = { members: 2, noticed: false, lastSync: null };
const DONE: RepositoryState["sync"] = { phase: "done", at: NOW, sent: 1, received: 0, pushed: true };

describe("GROUPS: a placement's sharing confirm, combining and retry (space-57, space-13, space-15, space-11, space-61)", () => {
  test("space-57: a placement owing its confirm reads 'Waiting for you to continue' with Continue; Continue shows 'Share with <group> at <display name>?' over three phrases, Cancel focused, Escape keeping; Share sends space.sync {repository, placement, noticed: true}", async () => {
    const waiting = { ...OWING, outcome: { kind: "waiting" as const, sent: 0, received: 0 } };
    await renderGroups(placedAtTwo({ second: waiting }, { sync: DONE }), { open: false });
    const line = lineOf(KEY, SECOND);
    expect(reading(line).state).toBe("Waiting for you to continue");
    const go = within(line).getByTestId("space-line-continue") as HTMLButtonElement;
    expect(go.textContent).toBe("Continue");
    // Described by its line's instance, so it reads apart from any other
    // line's (space-87).
    expect(describedAs(go)).toBe("Second Example");
    // The placement that synced carries none.
    expect(within(lineOf(KEY, ORIGIN)).queryByTestId("space-line-continue")).toBeNull();

    // The confirm stands beneath the line, titled by the group and the
    // Space the records go to, over its three phrases, Cancel focused;
    // Escape keeps the line waiting, focus back on Continue (DR-010 §4,
    // §6).
    fireEvent.click(go);
    let notice = within(line).getByTestId("space-line-notice");
    const confirm = within(notice).getByTestId("space-sharing-confirm");
    expect(confirm.firstElementChild?.textContent).toBe("Share with workshop at Second Example?");
    expect(within(confirm).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Every session, whole, attachments included",
      "Past and future records",
      "Members keep what they download",
    ]);
    expect(document.activeElement).toBe(within(notice).getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(within(line).queryByTestId("space-line-notice")).toBeNull();
    expect(calls("space.sync")).toHaveLength(0);
    await waitFor(() => expect(document.activeElement).toBe(go));
    expect(reading(line).state).toBe("Waiting for you to continue");
    // Cancel starts nothing either.
    fireEvent.click(go);
    fireEvent.click(within(within(line).getByTestId("space-line-notice")).getByRole("button", { name: "Cancel" }));
    expect(calls("space.sync")).toHaveLength(0);

    // Share syncs with that placement's confirm answered, and the line's
    // Continue waits for the machine.
    fireEvent.click(go);
    notice = within(line).getByTestId("space-line-notice");
    fireEvent.click(within(notice).getByRole("button", { name: "Share" }));
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY, placement: SECOND, noticed: true }]));
    expect(within(line).queryByTestId("space-line-notice")).toBeNull();
    await waitFor(() => expect(go.disabled).toBe(true));
    cleanup();

    // Public records say anyone can read them.
    await renderGroups(placedAtTwo({ second: { ...waiting, visibility: "public" } }, { sync: DONE }), { open: false });
    fireEvent.click(within(lineOf(KEY, SECOND)).getByTestId("space-line-continue"));
    expect(within(lineOf(KEY, SECOND)).getByTestId("space-line-notice").textContent).toContain("Public: anyone can read");
    cleanup();

    // In the reader's language, the line and its confirm (space-57).
    activateLanguage("zh");
    await renderGroups(placedAtTwo({ second: waiting }, { sync: DONE }), { open: false });
    expect(reading(lineOf(KEY, SECOND)).state).toBe("等待你继续");
    fireEvent.click(within(lineOf(KEY, SECOND)).getByTestId("space-line-continue"));
    const zhNotice = within(lineOf(KEY, SECOND)).getByTestId("space-line-notice");
    expect(within(zhNotice).getByTestId("space-sharing-confirm").firstElementChild?.textContent).toBe("与 Second Example 上的 workshop 共享？");
    expect(within(zhNotice).getByRole("button", { name: "共享" })).toBeTruthy();
  });

  test("space-57: Sync where the only runnable placement owes the confirm asks it first and sends that placement's noticed; where another can run, Sync asks nothing and the owing line waits; a read-only or path placement owes none", async () => {
    // The first placement offline, the second owing: the row's "Sync
    // now" asks the second's confirm first, beneath the row.
    await renderGroups(placedAtTwo({ first: OFFLINE, second: OWING }), { open: false });
    syncNow();
    const notice = screen.getByTestId("space-notice-confirm");
    expect(screen.getByTestId(`space-row-${KEY}`).contains(notice)).toBe(true);
    expect(notice.textContent).toContain("Share with workshop at Second Example?");
    expect(notice.textContent).toContain("Every session, whole, attachments included");
    expect(document.activeElement).toBe(within(notice).getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(notice).getByRole("button", { name: "Share" }));
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY, placement: SECOND, noticed: true }]));
    cleanup();

    // The first can run: Sync says nothing and goes; the owing placement
    // then waits on its line with Continue while the first synced.
    commandMock.mockClear();
    await renderGroups(placedAtTwo({ second: OWING }), { open: false });
    syncNow();
    expect(screen.queryByTestId("space-notice-confirm")).toBeNull();
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY }]));
    deliver(
      placedAtTwo(
        {
          first: { outcome: { kind: "synced", sent: 1, received: 0 }, lastSync: { at: NOW, sent: 1, received: 0 } },
          second: { ...OWING, outcome: { kind: "waiting", sent: 0, received: 0 } },
        },
        { sync: DONE },
      ),
    );
    expect(reading(lineOf(KEY, ORIGIN)).state).toBe("Synced just now · 1 sent · 0 received");
    expect(reading(lineOf(KEY, SECOND)).state).toBe("Waiting for you to continue");
    expect(within(lineOf(KEY, SECOND)).getByTestId("space-line-continue")).toBeTruthy();
    cleanup();

    // A read-only placement never pushes, so it owes none: the sync goes.
    commandMock.mockClear();
    await renderGroups(placedAtTwo({ first: OFFLINE, second: { ...OWING, state: "read-only", reason: "archived" } }), { open: false });
    syncNow();
    expect(screen.queryByTestId("space-notice-confirm")).toBeNull();
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY }]));
    cleanup();

    // The path placement owes none and can run beside an owing one.
    commandMock.mockClear();
    const withPath = repo({
      placements: [
        placement({ ...OWING, members: 3 }),
        placementState({ instance: null, path: "/srv/academy-spex.git", branch: { ...BRANCH, agreed: null } }),
      ],
    });
    await renderGroups(twoInstances({}, [withPath]), { open: false });
    syncNow();
    expect(screen.queryByTestId("space-notice-confirm")).toBeNull();
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY }]));
    cleanup();

    // Your own group's own repository owes it at an instance after its
    // first placement's even where the account is its only member
    // (space-4); its first placement says nothing.
    commandMock.mockClear();
    const ownAt = (placements: PlacementState[]): GroupsState => {
      const home = twoInstances({}, []);
      return { ...home, own: { ...home.own, repositories: [ownRepo({ placedAt: [ORIGIN, SECOND], placements })] } };
    };
    const ownFirst = placement({ path: OWN, id: "7", branch: null, members: 1, noticed: false, lastSync: { at: NOW - HOUR, sent: 1, received: 0 } });
    const ownSecond = placementState({ instance: SECOND, path: "jada/jada-spex", id: "71", members: 1, visibility: "private", branch: BRANCH });
    await renderGroups(ownAt([{ ...ownFirst, ...OFFLINE }, ownSecond]), { open: false });
    syncNow(OWN);
    expect(screen.getByTestId("space-notice-confirm").textContent).toContain("Share with Personal at Second Example?");
    fireEvent.click(within(screen.getByTestId("space-notice-confirm")).getByRole("button", { name: "Share" }));
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: OWN, placement: SECOND, noticed: true }]));
    cleanup();
    commandMock.mockClear();
    await renderGroups(ownAt([{ ...ownFirst, lastSync: null }]), { open: false });
    syncNow(OWN);
    expect(screen.queryByTestId("space-notice-confirm")).toBeNull();
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: OWN }]));
  });

  test("space-57: a refusal carrying the notice opens the confirm for the placement it names", async () => {
    // The page's read says the second's only member is the account; the
    // core's fresh read finds others, and no other placement can run.
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type === "space.sync" && fields?.noticed === undefined) throw noticeRefusal(SECOND);
      return answer(type, fields);
    });
    await renderGroups(placedAtTwo({ first: OFFLINE, second: { members: 1, noticed: false, lastSync: null } }), { open: false });
    syncNow();
    const notice = await screen.findByTestId("space-notice-confirm");
    expect(notice.textContent).toContain("Share with workshop at Second Example?");
    // The confirm stands in place of the refusal's words.
    expect(screen.queryByTestId(`space-row-caption-${KEY}`)).toBeNull();
    expect(document.activeElement).toBe(within(notice).getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(notice).getByRole("button", { name: "Share" }));
    await waitFor(() =>
      expect(calls("space.sync")).toEqual([{ repository: KEY }, { repository: KEY, placement: SECOND, noticed: true }]),
    );
    cleanup();

    // A placement's Combine refused for its confirm says it on that
    // line, its Share carrying the join.
    commandMock.mockClear();
    const unrelated = { outcome: { kind: "unrelated" as const, sent: 0, received: 0 }, branch: { ...BRANCH, unrelated: true } };
    await renderGroups(placedAtTwo({ first: OFFLINE, second: { members: 1, noticed: false, lastSync: null, ...unrelated } }, { sync: { phase: "unrelated", placement: SECOND } }), { open: false });
    const line = lineOf(KEY, SECOND);
    const combine = within(line).getByTestId("space-line-combine");
    fireEvent.click(combine);
    fireEvent.click(within(within(line).getByTestId("space-line-combine-confirm")).getByRole("button", { name: "Combine" }));
    const lineNotice = await within(line).findByTestId("space-line-notice");
    expect(lineNotice.textContent).toContain("Share with workshop at Second Example?");
    expect(within(line).queryByTestId("space-line-error")).toBeNull();
    // Cancel hands focus back to the Combine… that asked.
    fireEvent.click(within(lineNotice).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(document.activeElement).toBe(combine));
    fireEvent.click(combine);
    fireEvent.click(within(within(line).getByTestId("space-line-combine-confirm")).getByRole("button", { name: "Combine" }));
    fireEvent.click(within(await within(line).findByTestId("space-line-notice")).getByRole("button", { name: "Share" }));
    await waitFor(() =>
      expect(calls("space.sync")).toEqual([
        { repository: KEY, placement: SECOND, join: true },
        { repository: KEY, placement: SECOND, join: true },
        { repository: KEY, placement: SECOND, join: true, noticed: true },
      ]),
    );
  });

  test("space-13: a placement started separately offers \"Combine…\" on its line, confirmed inline with Cancel focused, sending {repository, placement, join: true}; the row reads \"Started separately at <display name>\" with its own \"Combine…\" and keeps Sync now", async () => {
    let settle: ((value: unknown) => void) | undefined;
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type !== "space.sync") return answer(type, fields);
      return new Promise((resolve) => {
        settle = resolve;
      });
    });
    const unrelated = {
      outcome: { kind: "unrelated" as const, sent: 0, received: 0 },
      branch: { ...BRANCH, unrelated: true, ahead: null, behind: null },
    };
    await renderGroups(placedAtTwo({ second: unrelated }, { sync: { phase: "unrelated", placement: SECOND } }), { open: false });
    // The row's one Sync now stands for every placement (DR-128).
    expect(syncEntry().label).toBe("Sync now");
    expect(syncEntry().disabled).toBe(false);
    expect(syncEntry().title).toBe("Sends what is here and brings back anything new");
    // The row reads the outcome with its way forward beside it
    // (space-120, space-13, DR-172).
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("Started separately at Second Example");
    expect(screen.getByTestId(`space-row-combine-${KEY}`).textContent).toBe("Combine…");
    // "Combine…" on the placement started separately alone.
    expect(within(lineOf(KEY, ORIGIN)).queryByTestId("space-line-combine")).toBeNull();
    const line = lineOf(KEY, SECOND);
    expect(reading(line).state).toBe("Started separately at Second Example");
    const join = within(line).getByTestId("space-line-combine") as HTMLButtonElement;
    expect(join.textContent).toBe("Combine…");
    expect(describedAs(join)).toBe("Second Example");

    // Confirmed inline beneath the line, Cancel focused, Escape keeping.
    fireEvent.click(join);
    const confirm = within(line).getByTestId("space-line-combine-confirm");
    expect(confirm.textContent).toContain("Combine both sets of records into one?");
    expect(confirm.textContent).toContain("Anything that differs asks you to choose");
    expect(document.activeElement).toBe(within(confirm).getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(within(line).queryByTestId("space-line-combine-confirm")).toBeNull();
    expect(calls("space.sync")).toHaveLength(0);
    await waitFor(() => expect(document.activeElement).toBe(join));

    // Combine names its placement and reads "Combining…" until the
    // reply.
    fireEvent.click(join);
    fireEvent.click(within(within(line).getByTestId("space-line-combine-confirm")).getByRole("button", { name: "Combine" }));
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY, placement: SECOND, join: true }]));
    await waitFor(() => expect(join.textContent).toBe("Combining…"));
    expect(join.disabled).toBe(true);
    settle!({ accepted: true });
    // The machine runs: the line names its step, its Join waits.
    deliver(
      placedAtTwo(
        { second: { branch: unrelated.branch } },
        { sync: { phase: "running", op: "sync", placement: SECOND, step: "compare", since: NOW, cancelable: false } },
      ),
    );
    expect(reading(lineOf(KEY, SECOND)).state).toBe("Comparing…");
    expect((within(lineOf(KEY, SECOND)).getByTestId("space-line-combine") as HTMLButtonElement).disabled).toBe(true);
    cleanup();

    // Records the last check found started separately offer it with no
    // outcome on the line.
    commandMock.mockImplementation(answer);
    await renderGroups(placedAtTwo({ second: { branch: unrelated.branch } }), { open: false });
    expect(within(lineOf(KEY, SECOND)).getByTestId("space-line-combine")).toBeTruthy();
    expect(within(lineOf(KEY, ORIGIN)).queryByTestId("space-line-combine")).toBeNull();
    cleanup();

    // The row's own "Combine…" confirms beneath the row, Cancel focused,
    // and sends the join of the placement its phrase names (space-13,
    // space-120).
    commandMock.mockClear();
    await renderGroups(placedAtTwo({ second: unrelated }, { sync: { phase: "unrelated", placement: SECOND } }), { open: false });
    fireEvent.click(screen.getByTestId(`space-row-combine-${KEY}`));
    const rowConfirm = screen.getByTestId(`space-row-combine-confirm-${KEY}`);
    expect(screen.getByTestId(`space-row-${KEY}`).contains(rowConfirm)).toBe(true);
    expect(rowConfirm.textContent).toContain("Combine both sets of records into one?");
    expect(document.activeElement).toBe(within(rowConfirm).getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(rowConfirm).getByRole("button", { name: "Combine" }));
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY, placement: SECOND, join: true }]));
  });

  test("space-13, space-15: a stopped sync's Retry combines no placement the reader has not combined, its line offering Combine… again; after the line's Combine, both Retries join that placement alone, and a plain sync forgets it", async () => {
    // Offline, every placement stopped at its check: the second's history
    // was found unrelated before.
    const atCheck = {
      outcome: { kind: "stopped" as const, step: "check" as const, cause: "unreachable" as const, message: "Could not reach the host", guidance: "Check the network, then Retry.", retry: true },
    };
    const unrelated = { branch: { ...BRANCH, unrelated: true, ahead: null, behind: null } };
    const stopped: RepositoryState["sync"] = {
      phase: "stopped",
      op: "sync",
      step: "check",
      cause: "unreachable",
      message: "Could not reach the host",
      guidance: "Check the network, then Retry.",
      retry: true,
    };
    const running: RepositoryState["sync"] = { phase: "running", op: "sync", placement: ORIGIN, step: "check", since: NOW, cancelable: true };
    const offline = (): GroupsState => placedAtTwo({ first: atCheck, second: { ...unrelated, ...atCheck } }, { sync: stopped });
    await renderGroups(offline());
    expect(within(lineOf(KEY, SECOND)).getByTestId("space-line-combine")).toBeTruthy();
    // The Sync tab's Retry syncs plainly: nobody here combined it.
    fireEvent.click(screen.getByTestId("space-retry"));
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY }]));
    // The placement stops as started separately again, Combine… on its
    // line.
    deliver(placedAtTwo({ second: { ...unrelated, outcome: { kind: "unrelated", sent: 0, received: 0 } } }, { sync: { phase: "unrelated", placement: SECOND } }));
    expect(reading(lineOf(KEY, SECOND)).state).toBe("Started separately at Second Example");
    const join = within(lineOf(KEY, SECOND)).getByTestId("space-line-combine");
    fireEvent.click(join);
    fireEvent.click(within(within(lineOf(KEY, SECOND)).getByTestId("space-line-combine-confirm")).getByRole("button", { name: "Combine" }));
    await waitFor(() => expect(calls("space.sync")[1]).toEqual({ repository: KEY, placement: SECOND, join: true }));

    // The join stops offline: the Sync tab's Retry joins that placement
    // alone.
    deliver(placedAtTwo({ second: unrelated }, { sync: running }));
    deliver(offline());
    await waitFor(() => expect((screen.getByTestId("space-retry") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId("space-retry"));
    await waitFor(() => expect(calls("space.sync")[2]).toEqual({ repository: KEY, placement: SECOND, join: true }));
    // So does a line's Retry, whichever line stopped.
    fireEvent.click(within(lineOf(KEY, ORIGIN)).getByTestId("space-line-retry"));
    await waitFor(() => expect(calls("space.sync")[3]).toEqual({ repository: KEY, placement: SECOND, join: true }));

    // The row's plain Sync forgets the join: the next Retry syncs
    // plainly.
    deliver(placedAtTwo({ second: unrelated }, { sync: running }));
    deliver(offline());
    await waitFor(() => expect(syncEntry().disabled).toBe(false));
    syncNow();
    await waitFor(() => expect(calls("space.sync")[4]).toEqual({ repository: KEY }));
    deliver(placedAtTwo({ second: unrelated }, { sync: running }));
    deliver(offline());
    await waitFor(() => expect((screen.getByTestId("space-retry") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId("space-retry"));
    await waitFor(() => expect(calls("space.sync")[5]).toEqual({ repository: KEY }));
    expect(calls("space.sync")).toHaveLength(6);
  });

  test("space-57, space-13: after a line's Share or Combine, and a row confirm's Share, focus goes to the row's name while the control that asked is busy (DR-010 §6)", async () => {
    const rowName = (key = KEY): HTMLElement => screen.getByTestId(`space-repo-${key}`);
    // A line's confirm shared: its Continue busy until the machine
    // moves.
    const waiting = { ...OWING, outcome: { kind: "waiting" as const, sent: 0, received: 0 } };
    await renderGroups(placedAtTwo({ second: waiting }), { open: false });
    const go = within(lineOf(KEY, SECOND)).getByTestId("space-line-continue") as HTMLButtonElement;
    fireEvent.click(go);
    fireEvent.click(within(within(lineOf(KEY, SECOND)).getByTestId("space-line-notice")).getByRole("button", { name: "Share" }));
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY, placement: SECOND, noticed: true }]));
    await waitFor(() => expect(document.activeElement).toBe(rowName()));
    expect(go.disabled).toBe(true);
    cleanup();

    // A Combine confirmed: Combining… until the machine moves.
    installClient();
    const unrelated = {
      outcome: { kind: "unrelated" as const, sent: 0, received: 0 },
      branch: { ...BRANCH, unrelated: true, ahead: null, behind: null },
    };
    await renderGroups(placedAtTwo({ second: unrelated }, { sync: { phase: "unrelated", placement: SECOND } }), { open: false });
    const join = within(lineOf(KEY, SECOND)).getByTestId("space-line-combine") as HTMLButtonElement;
    fireEvent.click(join);
    fireEvent.click(within(within(lineOf(KEY, SECOND)).getByTestId("space-line-combine-confirm")).getByRole("button", { name: "Combine" }));
    await waitFor(() => expect(join.textContent).toBe("Combining…"));
    await waitFor(() => expect(document.activeElement).toBe(rowName()));
    cleanup();

    // The row's confirm shared: its "Sync now" busy until the machine
    // moves, focus back on the row's "More" that held it (DR-159).
    installClient();
    await renderGroups(base({}, [repo({ members: 3, noticed: false })]), { open: false });
    syncNow();
    fireEvent.click(within(screen.getByTestId("space-notice-confirm")).getByRole("button", { name: "Share" }));
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY, placement: ORIGIN, noticed: true }]));
    await waitFor(() => expect(document.activeElement).toBe(moreOf()));
    expect(syncEntry().disabled).toBe(true);
  });

  test("space-15: a stopped placement's Retry runs the sync again, and a stopped check runs the check again", async () => {
    const stoppedAt = (step: "check" | "push", retry = true): Partial<PlacementState> => ({
      outcome: { kind: "stopped", step, cause: "unreachable", message: "Could not reach Second Example", guidance: "Check the network, then Retry.", retry },
    });
    // The first placement synced, the second stopped at its push.
    await renderGroups(placedAtTwo({ second: stoppedAt("push") }, { sync: DONE }), { open: false });
    expect(within(lineOf(KEY, ORIGIN)).queryByTestId("space-line-retry")).toBeNull();
    const retry = within(lineOf(KEY, SECOND)).getByTestId("space-line-retry") as HTMLButtonElement;
    expect(retry.textContent).toBe("Retry");
    expect(describedAs(retry)).toBe("Second Example");
    fireEvent.click(retry);
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY }]));
    // It waits for the machine to move.
    await waitFor(() => expect(retry.textContent).toBe("Retrying…"));
    expect(retry.disabled).toBe(true);
    cleanup();

    // A stopped check checks again.
    commandMock.mockClear();
    const check: RepositoryState["sync"] = {
      phase: "stopped",
      op: "check",
      step: "check",
      cause: "unreachable",
      message: "Could not reach Second Example",
      guidance: "Check the network, then Retry.",
      retry: true,
    };
    await renderGroups(placedAtTwo({ second: stoppedAt("check") }, { sync: check }), { open: false });
    fireEvent.click(within(lineOf(KEY, SECOND)).getByTestId("space-line-retry"));
    await waitFor(() => expect(calls("space.fetch")).toEqual([{ repository: KEY }]));
    expect(calls("space.sync")).toHaveLength(0);
    cleanup();

    // A stop retrying cannot help offers none.
    await renderGroups(placedAtTwo({ second: stoppedAt("push", false) }, { sync: DONE }), { open: false });
    expect(within(lineOf(KEY, SECOND)).queryByTestId("space-line-retry")).toBeNull();
    cleanup();

    // Dismiss puts the stop away, its Retry with it.
    await renderGroups(placedAtTwo({ second: stoppedAt("push") }, { sync: DONE }));
    fireEvent.click(screen.getByTestId("space-dismiss"));
    expect(reading(lineOf(KEY, SECOND)).state).toBe("Synced 1h ago");
    expect(within(lineOf(KEY, SECOND)).queryByTestId("space-line-retry")).toBeNull();
  });

  test("space-11, space-61: a row whose every placement's instance is signed out reads 'Sign in to <first placement's display name> first'; an unreachable line offers Retry only while its instance is signed in and the row offers none", async () => {
    // Both instances signed out: no placement can run, and the refusal
    // names the first placement's instance.
    // The reason stands beside the disabled "Sync now" in the row's
    // overflow (space-11, DR-159).
    await renderGroups(signedOutAt(SECOND, {}, signedOutAt(ORIGIN, {}, placedAtTwo())), { open: false });
    expect(syncEntry().disabled).toBe(true);
    expect(syncEntry().hint).toBe("Sign in to Spex Example first");
    cleanup();

    // The first signed out alone: the second placement can run, so the
    // sync is admitted.
    await renderGroups(signedOutAt(ORIGIN, {}, placedAtTwo()), { open: false });
    expect(syncEntry().disabled).toBe(false);
    expect(syncEntry().hint).toBe("");
    syncNow();
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY }]));
    cleanup();

    // A placement unreachable while the row reads reachable retries from
    // its line, reading every signed-in instance again (space-2).
    commandMock.mockClear();
    await renderGroups(placedAtTwo({ second: OFFLINE }), { open: false });
    expect(within(lineOf(KEY, ORIGIN)).queryByTestId("space-line-retry")).toBeNull();
    const retry = within(lineOf(KEY, SECOND)).getByTestId("space-line-retry");
    expect(retry.title).toBe("Reads every signed-in Space again");
    expect(describedAs(retry)).toBe("Second Example");
    fireEvent.click(retry);
    await waitFor(() => expect(calls("space.refresh")).toHaveLength(1));
    await waitFor(() => expect(retry.textContent).toBe("Retry"));
    cleanup();

    // None while its instance is signed out: that heading's Sign in again
    // is the way (space-3).
    await renderGroups(signedOutAt(SECOND, {}, placedAtTwo({ second: { state: "unreachable", reason: "Sign in again" } })), { open: false });
    expect(within(lineOf(KEY, SECOND)).queryByTestId("space-line-retry")).toBeNull();
    cleanup();

    // Every placement unreachable: the row offers Retry, its lines none.
    await renderGroups(placedAtTwo({ first: OFFLINE, second: OFFLINE }, { state: "unreachable", reason: "the device is offline" }), { open: false });
    expect(screen.getByTestId(`space-row-retry-${KEY}`)).toBeTruthy();
    expect(within(lineOf(KEY, ORIGIN)).queryByTestId("space-line-retry")).toBeNull();
    expect(within(lineOf(KEY, SECOND)).queryByTestId("space-line-retry")).toBeNull();
  });
});

describe("GROUPS: each placement's incoming units and choices (space-8, space-9, space-14, space-17, space-18, space-10, space-12)", () => {
  /** The Sync tab's incoming sections, in the order they stand. */
  const sectionsOf = (): HTMLElement[] =>
    screen.queryAllByTestId(/^space-incoming-/).filter((each) => each.dataset.testid !== "space-incoming-list");
  const sectionAt = (origin: string | null): HTMLElement => screen.getByTestId(`space-incoming-${origin ?? "path"}`);
  /** What a section is headed by. */
  const headOf = (section: HTMLElement): string => within(section).getByRole("heading", { level: 2 }).textContent ?? "";
  /** The path placement after both, a remote this device reaches. */
  const PATH = placementState({ path: "/srv/git/academy.git", branch: { ...BRANCH, checkedAt: null } });
  const CHOICES = { phase: "choices", placement: SECOND, savedCommit: "abc123" } as const;
  /** Choices at the second placement, the first's merge and push
   * standing (space-14): its incoming units and both conflicts. */
  const choicesAtSecond = (second: Partial<PlacementState> = {}, over: Partial<RepositoryState> = {}): GroupsState =>
    placedAtTwo(
      {
        first: { incoming: [INCOMING_SESSION] },
        second: { incoming: [INCOMING_INTENT, SETTINGS_UNIT], conflicts: CONFLICTS, ...second },
      },
      { conflicts: CONFLICTS, sync: CHOICES, ...over },
    );

  test("space-8: Check lists each placement's incoming units under \"From <display name> (<n>)\", marked to choose from that placement's conflicts; a placement holding no records says Sync will send these; one started separately lists nothing", async () => {
    const lines = (second: Partial<PlacementState>): GroupsState => {
      const state = placedAtTwo({
        first: { incoming: [INCOMING_SESSION], conflicts: [CONFLICTS[0]!] },
        second: { incoming: [INCOMING_INTENT, SETTINGS_UNIT], conflicts: [CONFLICTS[1]!], ...second },
      });
      const [row] = state.instances[0]!.groups[0]!.repositories;
      row!.placements = [...row!.placements, PATH];
      row!.conflicts = [CONFLICTS[0]!, CONFLICTS[1]!];
      return state;
    };
    await renderGroups(lines({}));
    // One section per placement the clone holds, in order, each headed
    // "From <display name> (<n>)", the path placement by its remote
    // (space-8, space-87).
    expect(sectionsOf().map(headOf)).toEqual(["From Spex Example (2)", "From Second Example (2)", "From /srv/git/academy.git (0)"]);
    expect(sectionsOf().map((each) => each.dataset.testid)).toEqual([
      `space-incoming-${ORIGIN}`,
      `space-incoming-${SECOND}`,
      "space-incoming-path",
    ]);
    // The kinds stand beneath each placement's heading.
    expect(within(sectionAt(ORIGIN)).getAllByRole("heading", { level: 4 }).map((h) => h.textContent)).toEqual(["Sessions"]);
    // Each placement's units, a unit changed on both sides marked to
    // choose from that placement's conflicts alone.
    const first = sectionAt(ORIGIN);
    expect(within(first).getByTestId("space-unit-remote-sessions/s2").textContent).toContain("Draft the release notes");
    expect(within(first).getByTestId("space-choose-sessions/s1")).toBeTruthy();
    expect(within(first).queryByTestId("space-choose-config/playbook.config.yaml")).toBeNull();
    const second = sectionAt(SECOND);
    expect(within(second).getByTestId("space-unit-remote-intents/1c2d3e4f-5a6b-4c7d-8e9f-a0b1c2d3e4f5").textContent).toContain("Ship the docs");
    expect(within(second).getAllByTestId("space-unit-remote-config/playbook.config.yaml")).toHaveLength(1);
    expect(within(second).getByTestId("space-choose-config/playbook.config.yaml")).toBeTruthy();
    expect(within(second).queryByTestId("space-unit-remote-sessions/s1")).toBeNull();
    expect(within(sectionAt(null)).getByText("Not checked yet")).toBeTruthy();
    // Check checks every placement at once.
    expect(screen.getByTestId("space-check").textContent).toBe("Check");
    fireEvent.click(screen.getByTestId("space-check"));
    await waitFor(() => expect(calls("space.fetch")).toEqual([{ repository: KEY }]));

    // A placement holding no records says Sync will send these.
    deliver(lines({ incoming: [], conflicts: [], branch: { ...BRANCH, hostEmpty: true, behind: 0 } }));
    expect(within(sectionAt(SECOND)).getByText("Second Example holds no records yet; Sync will send these")).toBeTruthy();
    expect(within(sectionAt(SECOND)).queryByTestId("space-incoming-list")).toBeNull();
    expect(within(sectionAt(ORIGIN)).getByTestId("space-incoming-list")).toBeTruthy();
    expect(headOf(sectionAt(SECOND))).toBe("From Second Example (0)");

    // A placement started separately lists nothing; Combine… stands on
    // its line (space-13).
    deliver(lines({ incoming: [], conflicts: [], branch: { ...BRANCH, unrelated: true, ahead: null, behind: null } }));
    expect(within(sectionAt(SECOND)).getByText("Started separately at Second Example")).toBeTruthy();
    expect(within(sectionAt(SECOND)).queryByTestId("space-incoming-list")).toBeNull();
    expect(within(lineOf(KEY, SECOND)).getByTestId("space-line-combine")).toBeTruthy();

    // A check that stopped there reads its step and cause (space-15).
    deliver(
      lines({
        incoming: [],
        conflicts: [],
        branch: { ...BRANCH, checkedAt: null },
        outcome: { kind: "stopped", step: "check", cause: "unreachable", message: "Could not reach Second Example", guidance: "Check the network, then Retry.", retry: true },
      }),
    );
    expect(within(sectionAt(SECOND)).getByText("Checking stopped — Could not reach Second Example")).toBeTruthy();
  });

  test("space-9, space-14: choices at the second placement show its incoming list above the picker and the caption naming its display name", async () => {
    await renderGroups(choicesAtSecond());
    expect(screen.getByTestId("space-step-line").textContent).toBe("Needs your choice");
    expect(screen.getByTestId("space-choices-note").textContent).toContain("Your changes are saved; nothing is sent to Second Example yet");
    // That placement's units alone, above the picker for its conflicts.
    expect(sectionsOf().map((each) => each.dataset.testid)).toEqual([`space-incoming-${SECOND}`]);
    // Its incoming units and the units changed on both sides there.
    expect(headOf(sectionAt(SECOND))).toBe("From Second Example (3)");
    const incoming = within(sectionAt(SECOND)).getByTestId("space-incoming-list");
    expect(within(incoming).getByTestId("space-unit-remote-intents/1c2d3e4f-5a6b-4c7d-8e9f-a0b1c2d3e4f5")).toBeTruthy();
    expect(screen.queryByTestId("space-unit-remote-sessions/s2")).toBeNull();
    const picker = screen.getByTestId("space-picker");
    expect(incoming.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Choose for 2 conflicts" })).toBeTruthy();
    // The first placement's merge stands: its line reads synced.
    expect(reading(lineOf(KEY, ORIGIN)).state).toBe("Synced 5m ago");

    // The row reads it with Resolve, which shows the same picker beneath
    // the row, its choices the Sync tab's (space-14, DR-159).
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("Changed here and at Second Example");
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Fix the login redirect" })).getByRole("radio", { name: /^Keep this computer's/ }));
    fireEvent.click(screen.getByTestId(`space-repo-${KEY}`));
    expect(screen.queryByTestId("space-picker")).toBeNull();
    const resolve = screen.getByTestId(`space-row-resolve-${KEY}`);
    expect(resolve.textContent).toBe("Resolve");
    fireEvent.click(resolve);
    expect(resolve.getAttribute("aria-expanded")).toBe("true");
    const beneath = screen.getByTestId(`space-row-resolve-picker-${KEY}`);
    expect(screen.getByTestId(`space-row-${KEY}`).contains(beneath)).toBe(true);
    expect(within(beneath).getByRole("heading", { name: "Choose for 2 conflicts" })).toBeTruthy();
    expect(within(beneath).getByTestId("space-chosen").textContent).toBe("1 of 2 chosen");
    fireEvent.click(within(beneath).getByRole("button", { name: "All Second Example's" }));
    fireEvent.click(within(beneath).getByTestId("space-apply"));
    fireEvent.click(within(within(beneath).getByTestId("space-apply-confirm")).getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(calls("space.sync")).toEqual([
        { repository: KEY, placement: SECOND, choices: { "sessions/s1": "remote", "config/playbook.config.yaml": "remote" } },
      ]),
    );
  });

  test("space-17: the other side names the instance the choices are for", async () => {
    await renderGroups(choicesAtSecond());
    const session = screen.getByRole("radiogroup", { name: "Fix the login redirect" });
    expect(within(session).getByLabelText(/Take Second Example's/).parentElement?.textContent).toBe("Take Second Example's updated 5h ago · 9 turns");
    expect(within(session).getByLabelText(/Keep this computer's/).parentElement?.textContent).toBe("Keep this computer's updated 2h ago · 12 turns");
    expect(within(session).getByRole("radio", { name: /^Take Second Example's/ })).toBeTruthy();
  });

  test("space-18: Apply sends {placement, choices}, and join while that placement's history is unrelated", async () => {
    await renderGroups(choicesAtSecond());
    fireEvent.click(screen.getByRole("button", { name: "All here" }));
    fireEvent.click(screen.getByTestId("space-apply"));
    fireEvent.click(within(screen.getByTestId("space-apply-confirm")).getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(calls("space.sync")).toEqual([
        { repository: KEY, placement: SECOND, choices: { "sessions/s1": "mine", "config/playbook.config.yaml": "mine" } },
      ]),
    );
    cleanup();

    // A join of the second waiting for its choices applies with the join.
    commandMock.mockClear();
    await renderGroups(choicesAtSecond({ branch: { ...BRANCH, unrelated: true, ahead: null, behind: null }, conflicts: [CONFLICTS[1]!] }));
    expect(within(sectionAt(SECOND)).getByTestId("space-incoming-list")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "All Second Example's" }));
    fireEvent.click(screen.getByTestId("space-apply"));
    fireEvent.click(within(screen.getByTestId("space-apply-confirm")).getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(calls("space.sync")).toEqual([
        { repository: KEY, placement: SECOND, choices: { "config/playbook.config.yaml": "remote" }, join: true },
      ]),
    );
    cleanup();

    // An Apply that stopped names no placement: the picker stands for
    // the first in order holding conflicts, and Retry carries them for
    // it — on a page that sent no join (space-13).
    installClient();
    await renderGroups(
      choicesAtSecond(
        {},
        {
          sync: {
            phase: "stopped",
            op: "sync",
            step: "apply",
            cause: "validation",
            message: "Settings changed: playbook.config.yaml is not valid YAML",
            guidance: "Choose the other version, or fix the file.",
            retry: true,
          },
        },
      ),
    );
    expect(screen.getByTestId("space-conflict-config/playbook.config.yaml").getAttribute("data-marked")).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "All here" }));
    fireEvent.click(within(screen.getByTestId("space-stopped")).getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(calls("space.sync")).toEqual([
        { repository: KEY, placement: SECOND, choices: { "sessions/s1": "mine", "config/playbook.config.yaml": "mine" } },
      ]),
    );
  });

  test("space-10: a remote side's diff names its placement", async () => {
    await renderGroups(placedAtTwo({ first: { incoming: [INCOMING_SESSION] }, second: { incoming: [SETTINGS_UNIT] } }, { local: [SETTINGS_UNIT] }));
    // The host's side of an incoming row is its placement's.
    const incoming = within(sectionAt(SECOND)).getByTestId("space-unit-remote-config/playbook.config.yaml");
    fireEvent.click(within(incoming).getByRole("button", { name: "View diff" }));
    await waitFor(() =>
      expect(calls("space.diff")).toEqual([
        { repository: KEY, unit: "config/playbook.config.yaml", path: "config/playbook.config.yaml", side: "remote", placement: SECOND },
      ]),
    );
    // This device's side is the clone's own, naming none.
    fireEvent.click(within(screen.getByTestId("space-unit-mine-config/playbook.config.yaml")).getByRole("button", { name: "View diff" }));
    await waitFor(() => expect(calls("space.diff")).toHaveLength(2));
    expect(calls("space.diff")[1]).toEqual({ repository: KEY, unit: "config/playbook.config.yaml", path: "config/playbook.config.yaml", side: "mine" });
    cleanup();

    // A conflict's host side is the placement the choices are for.
    commandMock.mockClear();
    await renderGroups(choicesAtSecond());
    const settings = screen.getByRole("radiogroup", { name: "Settings changed" });
    fireEvent.click(within(settings).getAllByRole("button", { name: "View diff" })[1]!);
    await waitFor(() =>
      expect(calls("space.diff")).toEqual([
        { repository: KEY, unit: "config/playbook.config.yaml", path: "config/playbook.config.yaml", side: "remote", placement: SECOND },
      ]),
    );
  });

  test("space-12: the rail names the placement in flight beside the step line", async () => {
    const running = (op: SpaceOp, placement?: string | null): GroupsState =>
      placedAtTwo({}, { sync: { phase: "running", op, step: "push", since: NOW, cancelable: true, ...(placement !== undefined ? { placement } : {}) } });
    await renderGroups(placedAtTwo());
    deliver(running("sync", SECOND));
    // The step line reads the step alone; the placement stands beside it.
    expect(screen.getByTestId("space-step-line").textContent).toBe("Sending…");
    expect(screen.getByTestId("space-step-placement").textContent).toBe("Second Example");
    expect(screen.getByTestId("space-step-save").getAttribute("data-state")).toBe("done");
    deliver(running("sync", ORIGIN));
    expect(screen.getByTestId("space-step-placement").textContent).toBe("Spex Example");
    // Save is at no placement.
    deliver(placedAtTwo({}, { sync: { phase: "running", op: "sync", step: "save", since: NOW, cancelable: false } }));
    expect(screen.getByTestId("space-step-line").textContent).toBe("Saving…");
    expect(screen.queryByTestId("space-step-placement")).toBeNull();
    // A Place and an Attach run the steps; a check and a Leave read
    // their step line alone.
    for (const op of ["place", "attach"] as const) {
      deliver(running(op, SECOND));
      expect(screen.getByTestId("space-step-push").getAttribute("data-state")).toBe("current");
    }
    for (const op of ["check", "leave"] as const) {
      deliver(running(op, SECOND));
      expect(screen.queryByTestId("space-step-push")).toBeNull();
      expect(screen.getByTestId("space-step-line").textContent).toBe("Sending…");
    }
    // The check names the Space it reads on the step line itself, nothing
    // beside it (space-12).
    deliver(placedAtTwo({}, { sync: { phase: "running", op: "sync", step: "check", placement: SECOND, since: NOW, cancelable: true } }));
    expect(screen.getByTestId("space-step-line").textContent).toBe("Checking Second Example…");
    expect(screen.queryByTestId("space-step-placement")).toBeNull();
    cleanup();

    // A clone holding one placement names none beside the step line.
    await renderGroups(base({}, [repo({ sync: { phase: "running", op: "sync", placement: ORIGIN, step: "push", since: NOW, cancelable: true } })]));
    expect(screen.getByTestId("space-step-line").textContent).toBe("Sending…");
    expect(screen.queryByTestId("space-step-placement")).toBeNull();
  });
});

/**
 * space-95's home as the walk reads it: `twoPlacementsHome`, each row a
 * step names changed as it says, wherever that row stands.
 */
function walkHome(change: Record<string, (row: RepositoryState) => RepositoryState> = {}): GroupsState {
  const home = twoPlacementsHome();
  const changed = (rows: RepositoryState[]) => rows.map((row) => change[row.key]?.(row) ?? row);
  return {
    ...home,
    own: { ...home.own, repositories: changed(home.own.repositories) },
    instances: home.instances.map((at) => ({
      ...at,
      groups: at.groups.map((group) => ({ ...group, repositories: changed(group.repositories) })),
    })),
  };
}

/** A row with its line at `origin` changed as a step says, and the row
 * itself. */
const atLine =
  (origin: string, over: Partial<PlacementState>, row: Partial<RepositoryState> = {}) =>
  (repo: RepositoryState): RepositoryState => ({
    ...repo,
    ...row,
    placements: repo.placements.map((line) => (line.instance === origin ? { ...line, ...over } : line)),
  });

/** The controls standing on a line, in order, by test id. */
const lineControls = (line: HTMLElement): string[] =>
  within(line)
    .queryAllByRole("button")
    .map((button) => button.dataset.testid ?? "");

/** The controls standing on a row itself, in order, by test id: neither
 * its name nor its lines'. */
function rowControls(key: string): string[] {
  const lines = screen.queryByTestId(`space-lines-${key}`);
  return within(screen.getByTestId(`space-row-${key}`))
    .queryAllByRole("button")
    .filter((button) => !lines?.contains(button) && button.dataset.testid !== `space-repo-${key}`)
    .map((button) => button.dataset.testid ?? "");
}

/** The placement's first send waits for the reader's Continue
 * (space-57). */
const WAITING = { kind: "waiting" as const, sent: 0, received: 0 };

describe("GROUPS: a group holding a placement of a row standing elsewhere (space-1, DR-128, DR-172)", () => {
  test("space-1: the second's group holding a placement shows one quiet line per row standing elsewhere, naming the row and where it stands, with no control; its More holds Members alone; Personal at the second stands for its one line", async () => {
    await renderGroups(walkHome(), { open: false });
    const first = screen.getByTestId(`space-instance-${ORIGIN}`);
    const second = screen.getByTestId(`space-instance-${SECOND}`);
    const workshop = within(second).getByTestId("space-group-workshop");
    // One line per row a placement of which its listing holds, each
    // naming the row and the heading it stands under, no control: the
    // row is acted on where it stands (space-1, DR-128).
    const lines = within(workshop).getAllByTestId(/^space-placed-/);
    expect(lines.map((line) => [line.dataset.testid, line.textContent])).toEqual([
      [`space-placed-${KEY}`, "academy · in Personal at Spex Example"],
      [`space-placed-${BETA}`, "beta · in Personal at Spex Example"],
    ]);
    for (const line of lines) {
      expect(within(line).queryAllByRole("button")).toEqual([]);
      expect(line.getAttribute("title")).toBe(line.textContent);
    }
    // The rows themselves stand where they stand, never twice.
    expect(within(second).queryByTestId(`space-row-${KEY}`)).toBeNull();
    expect(within(workshop).queryByText("No projects here yet")).toBeNull();
    // Its heading's More holds Members alone: no rename, delete or
    // group inside it is offered here (space-1, DR-172).
    fireEvent.click(screen.getByTestId("space-group-more-workshop"));
    expect(
      within(screen.getByTestId("space-group-more-workshop-menu"))
        .getAllByRole("menuitem")
        .map((item) => item.dataset.testid),
    ).toEqual(["space-group-members-workshop"]);
    fireEvent.keyDown(window, { key: "Escape" });
    // Your own group's own repository stands under Personal at the
    // instance governing it, the first, drawing no line there; at the
    // second, Personal stands for its one line (space-1).
    const jada = within(second).getByTestId("space-group-@jada");
    expect(within(jada).getByRole("heading", { level: 3 }).textContent).toBe("Personal");
    expect(within(jada).queryAllByTestId(/^space-row-/)).toEqual([]);
    expect(within(jada).getAllByTestId(/^space-placed-/).map((line) => line.textContent)).toEqual(["Your sessions · in Personal at Spex Example"]);
    const jane = within(first).getByTestId("space-group-@jane");
    expect(within(jane).queryAllByTestId(/^space-placed-/)).toEqual([]);
    expect(within(jane).getAllByRole("listitem").map((item) => item.dataset.testid)).toEqual([
      `space-row-${OWN}`,
      `space-row-${KEY}`,
      `space-row-${BETA}`,
    ]);
    // The project in no group stands under "This computer" (space-1).
    expect(within(screen.getByTestId("space-own")).getAllByRole("listitem").map((item) => item.dataset.testid)).toEqual([`space-row-${GAMMA}`]);
  });

  test("space-1: a line names a group by its name, another account's login, or this computer, in the reader's language", async () => {
    const home = twoPlacementsHome();
    const [atFirst, atSecond] = home.instances;
    // acme-spex stands in Acme at the first; the second's workshop lists
    // a placement of it and of gamma, which stands under This computer.
    const placedHome: GroupsState = {
      ...home,
      instances: [
        atFirst!,
        {
          ...atSecond!,
          groups: atSecond!.groups.map((group) =>
            group.fullPath === "workshop"
              ? { ...group, placed: [{ key: ACME, name: "acme-spex" }, { key: GAMMA, name: "gamma-spex" }] }
              : group,
          ),
        },
      ],
    };
    await renderGroups(placedHome, { open: false });
    const workshop = within(screen.getByTestId(`space-instance-${SECOND}`)).getByTestId("space-group-workshop");
    expect(within(workshop).getAllByTestId(/^space-placed-/).map((line) => line.textContent)).toEqual([
      "Group sessions · in Acme at Spex Example",
      "gamma · on this computer",
    ]);
    // The group's path rides the title where it differs from its name.
    expect(within(workshop).getByTestId(`space-placed-${ACME}`).getAttribute("title")).toBe("Group sessions · in Acme at Spex Example · acme");
    cleanup();

    activateLanguage("zh");
    await renderGroups(placedHome, { open: false });
    const zhWorkshop = within(screen.getByTestId(`space-instance-${SECOND}`)).getByTestId("space-group-workshop");
    expect(within(zhWorkshop).getAllByTestId(/^space-placed-/).map((line) => line.textContent)).toEqual([
      "群组会话 · 在 Spex Example 的 Acme 中",
      "gamma · 在本机上",
    ]);
  });
});

describe("GROUPS: the placements surface at the floor (space-95, space-28, DR-172)", () => {
  test("space-95: lines with Members, a line not on this computer offering nothing, rows of one primary and one overflow, the sharing confirm of your own group's second placement, the members' 'also placed at'", async () => {
    await renderGroups(walkHome(), { open: false });

    // The second's group holding a placement shows one line naming the
    // row, with no control; "Your sessions" stands under the first's
    // Personal and the second's Personal shows one line naming it
    // (space-1).
    const atSecond = within(screen.getByTestId(`space-instance-${SECOND}`));
    const workshopLine = within(atSecond.getByTestId("space-group-workshop")).getByTestId(`space-placed-${KEY}`);
    expect(workshopLine.textContent).toBe("academy · in Personal at Spex Example");
    expect(within(workshopLine).queryAllByRole("button")).toEqual([]);
    expect(within(within(screen.getByTestId(`space-instance-${ORIGIN}`)).getByTestId("space-group-@jane")).getByTestId(`space-repo-${OWN}`).textContent).toBe("Your sessions");
    const personalLine = within(atSecond.getByTestId("space-group-@jada")).getByTestId(`space-placed-${OWN}`);
    expect(personalLine.textContent).toBe("Your sessions · in Personal at Spex Example");
    expect(within(personalLine).queryAllByRole("button")).toEqual([]);

    // Each row lists one line per placement in its Sync tab, by its
    // Space's display name and its path there, its state, and its last
    // sync; the one its file names reads "Not on this computer" with no
    // control; Members stands on each reachable line (space-87).
    expect(linesOf(KEY).map(reading)).toEqual([
      { name: "Spex Example", at: "jane/academy-spex", state: "Synced 5m ago" },
      { name: "Second Example", at: "workshop/academy-spex", state: "Synced 1h ago" },
    ]);
    expect(lineControls(lineOf(KEY, ORIGIN))).toEqual(["space-line-members"]);
    expect(lineControls(lineOf(KEY, SECOND))).toEqual(["space-line-members"]);
    expect(describedAs(within(lineOf(KEY, SECOND)).getByTestId("space-line-members"))).toBe("Second Example");
    expect(linesOf(BETA).map((line) => [line.dataset.testid, line.dataset.state, line.dataset.attached])).toEqual([
      [`space-line-${ORIGIN}`, "reachable", "true"],
      [`space-line-${SECOND}`, "absent", "false"],
    ]);
    expect(linesOf(BETA).map(reading)).toEqual([
      { name: "Spex Example", at: "jane/beta-spex", state: "Synced 2h ago" },
      { name: "Second Example", at: "workshop/beta-spex", state: "Not on this computer" },
    ]);
    expect(lineControls(lineOf(BETA, SECOND))).toEqual([]);
    expect(linesOf(OWN).map(reading)).toEqual([
      { name: "Spex Example", at: OWN, state: "Synced 3h ago" },
      { name: "Second Example", at: "jada/jada-spex", state: "Synced 3h ago" },
    ]);
    expect(linesOf(ACME).map(reading)).toEqual([{ name: "Spex Example", at: "acme/acme-spex", state: "Synced 4h ago" }]);
    openRow(GAMMA);
    expect(screen.queryByTestId(`space-lines-${GAMMA}`)).toBeNull();

    // A row carries its primary control and one overflow holding "Sync
    // now", Members and "Explore records"; nothing moves, places, leaves
    // or attaches (space-1, DR-172); the project in no group offers "Add
    // to a group…" (space-61).
    expect(rowControls(BETA)).toEqual([`space-row-open-${BETA}`, `space-row-more-${BETA}`]);
    expect(rowControls(KEY)).toEqual([`space-row-open-${KEY}`, `space-row-more-${KEY}`]);
    expect(rowControls(OWN)).toEqual([`space-row-more-${OWN}`]);
    expect(rowControls(ACME)).toEqual([`space-row-open-${ACME}`, `space-row-more-${ACME}`]);
    expect(rowControls(GAMMA)).toEqual([`space-row-pick-${GAMMA}`, `space-row-more-${GAMMA}`]);
    expect(screen.getByTestId(`space-row-pick-${GAMMA}`).textContent).toBe("Add to a group…");
    for (const key of [BETA, KEY, OWN, ACME]) {
      expect(menuIds(key), key).toEqual([`space-row-sync-${key}`, `space-row-members-${key}`, `space-row-explore-${key}`]);
    }
    expect(menuIds(GAMMA)).toEqual([`space-row-explore-${GAMMA}`]);

    // Your own group's placement at the second owes its confirm there
    // (space-4): Sync now goes for the first, which owes none, and the
    // second waits with Continue on its line, which asks "Share with
    // Personal at Second Example?" and sends that placement's (space-57).
    const owing = { noticed: false, lastSync: null };
    deliver(walkHome({ [OWN]: atLine(SECOND, owing) }));
    syncNow(OWN);
    expect(screen.queryByTestId("space-notice-confirm")).toBeNull();
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: OWN }]));
    deliver(
      walkHome({
        [OWN]: (row) =>
          atLine(SECOND, { ...owing, outcome: WAITING })(
            atLine(ORIGIN, { outcome: { kind: "synced", sent: 1, received: 0 }, lastSync: { at: NOW, sent: 1, received: 0 } }, { sync: DONE })(row),
          ),
      }),
    );
    await waitFor(() => expect(reading(lineOf(OWN, SECOND)).state).toBe("Waiting for you to continue"));
    expect(reading(lineOf(OWN, ORIGIN)).state).toBe("Synced just now · 1 sent · 0 received");
    const go = within(lineOf(OWN, SECOND)).getByTestId("space-line-continue") as HTMLButtonElement;
    expect(go.textContent).toBe("Continue");
    expect(describedAs(go)).toBe("Second Example");
    expect(within(lineOf(OWN, ORIGIN)).queryByTestId("space-line-continue")).toBeNull();
    // The row reads the same, Continue beside it (space-120).
    expect(screen.getByTestId(`space-repo-state-${OWN}`).textContent).toBe("Waiting for you to continue");
    expect(screen.getByTestId(`space-row-continue-${OWN}`).textContent).toBe("Continue");
    fireEvent.click(go);
    const notice = within(lineOf(OWN, SECOND)).getByTestId("space-line-notice");
    expect(within(notice).getByTestId("space-sharing-confirm").firstElementChild?.textContent).toBe("Share with Personal at Second Example?");
    fireEvent.click(within(notice).getByRole("button", { name: "Share" }));
    await waitFor(() => expect(calls("space.sync")[1]).toEqual({ repository: OWN, placement: SECOND, noticed: true }));

    // Each placement's members panel says the records are also placed at
    // the other's display name (space-62).
    for (const [key, origin, other] of [
      [KEY, ORIGIN, "Second Example"],
      [KEY, SECOND, "Spex Example"],
      [OWN, ORIGIN, "Second Example"],
      [OWN, SECOND, "Spex Example"],
    ] as const) {
      fireEvent.click(within(lineOf(key, origin)).getByTestId("space-line-members"));
      const panel = await screen.findByTestId(`space-members-${key}@${origin}`);
      await within(panel).findAllByTestId(/^space-member-/);
      expect(within(panel).getByTestId("space-members-also").textContent).toContain(other);
    }
  });

  test("space-28, space-95: every control on a row, a heading or a line reads at most 14 characters, idle, opened and busy — space.sync held unanswered — its long name kept", async () => {
    // "Add to a group…" is a whole phrase a decision fixes (space-58),
    // past the budget by design (space-28).
    const ownWords = new Set(["Add to a group…"]);
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) =>
      type === "space.sync" ? new Promise(() => {}) : answer(type, fields),
    );
    // space-95's home, the outcomes its lines' last syncs left giving
    // Continue, "Combine…" and Retry their turn beside Members: your own
    // group's second placement waiting for its confirm, the opened
    // project's second started separately, and the group's own stopped
    // where retrying helps (space-87).
    await renderGroups(
      walkHome({
        [OWN]: atLine(SECOND, { noticed: false, lastSync: null, outcome: WAITING }),
        [KEY]: atLine(SECOND, { outcome: { kind: "unrelated", sent: 0, received: 0 } }),
        [ACME]: atLine(ORIGIN, {
          outcome: { kind: "stopped", step: "push", cause: "unreachable", message: "Could not reach Spex Example", guidance: "Check the network, then Retry", retry: true },
        }),
      }),
      { open: false },
    );

    const seen = new Set<string>();
    const measure = () => {
      // A menu's entries are role "menuitem", their words beside one
      // another in full: the budget is the visible controls' (space-28).
      for (const button of screen.getAllByRole("button")) {
        // A row's name, and a picker's option, is a list row whose words
        // are its own, its long name its accessible name.
        const id = button.dataset.testid ?? "";
        if (/^space-(repo|pick-repo|pick-group)-/.test(id)) continue;
        const text = (button.textContent ?? "").trim();
        if (text !== "") seen.add(text);
        if (!ownWords.has(text)) expect(text.length, `"${text}"`).toBeLessThanOrEqual(14);
        // A control whose words yield keeps its accessible name.
        expect((button.getAttribute("aria-label") ?? text).length, id).toBeGreaterThan(0);
      }
    };
    /** At the 320-pixel floor no line's control breaks its words: each
     * line's controls wrap beneath its name below @xs instead (space-28,
     * DR-041). */
    const linesWrap = (key: string) => {
      const top = screen.getByTestId(`space-repo-${key}`).parentElement!;
      expect(top.className.split(/\s+/)).toContain("flex-wrap");
      for (const line of linesOf(key)) {
        const row = within(line).getByTestId("space-line-instance").parentElement!;
        for (const token of ["flex-wrap", "@xs:flex-nowrap"]) expect(row.className.split(/\s+/)).toContain(token);
        for (const control of within(row).queryAllByRole("button")) {
          expect(control.className.split(/\s+/), control.dataset.testid).toContain("whitespace-nowrap");
        }
      }
    };

    // Idle: each row with its Sync tab open, its lines' controls beside
    // the rows' (space-28).
    for (const key of [KEY, BETA, OWN, ACME]) {
      openRow(key);
      measure();
    }
    expect(within(lineOf(OWN, ORIGIN)).getByTestId("space-line-members").getAttribute("aria-label")).toBe("Members");
    expect([...seen]).toEqual(expect.arrayContaining(["Show", "Add to a group…", "Combine…", "Continue", "Retry", "Members"]));

    // Opened: the waiting line's confirm and a members panel; the
    // records started separately's confirm; and Add to a group….
    fireEvent.click(within(lineOf(OWN, SECOND)).getByTestId("space-line-continue"));
    fireEvent.click(within(lineOf(OWN, ORIGIN)).getByTestId("space-line-members"));
    await within(await screen.findByTestId(`space-members-${OWN}@${ORIGIN}`)).findAllByTestId(/^space-member-/);
    measure();
    fireEvent.click(within(lineOf(KEY, SECOND)).getByTestId("space-line-combine"));
    fireEvent.click(screen.getByTestId(`space-row-pick-${GAMMA}`));
    measure();
    expect([...seen]).toEqual(expect.arrayContaining(["Cancel", "Share", "Combine"]));

    // Busy: each act sent and unanswered reads its busy form, within the
    // budget too (space-28).
    fireEvent.click(within(within(lineOf(KEY, SECOND)).getByTestId("space-line-combine-confirm")).getByRole("button", { name: "Combine" }));
    await waitFor(() => expect(within(lineOf(KEY, SECOND)).getByTestId("space-line-combine").textContent).toBe("Combining…"));
    openRow(KEY);
    measure();
    linesWrap(KEY);

    const own = lineOf(OWN, SECOND);
    if (!within(own).queryByTestId("space-line-notice")) fireEvent.click(within(own).getByTestId("space-line-continue"));
    fireEvent.click(within(within(own).getByTestId("space-line-notice")).getByRole("button", { name: "Share" }));
    await waitFor(() => expect((within(lineOf(OWN, SECOND)).getByTestId("space-line-continue") as HTMLButtonElement).disabled).toBe(true));
    measure();
    linesWrap(OWN);

    fireEvent.click(within(lineOf(ACME, ORIGIN)).getByTestId("space-line-retry"));
    await waitFor(() => expect(within(lineOf(ACME, ORIGIN)).getByTestId("space-line-retry").textContent).toBe("Retrying…"));
    measure();
    linesWrap(ACME);

    expect([...seen]).toEqual(expect.arrayContaining(["Combining…", "Retrying…"]));
    expect(calls("space.place")).toHaveLength(0);
    expect(calls("space.leave")).toHaveLength(0);
    expect(calls("space.attach")).toHaveLength(0);
  });
});
