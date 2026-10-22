// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A spex repository placed at several instances, on the Groups surface
// over a mocked client (DR-128): a line per placement beneath its row,
// in the core's order, naming its instance and its path there (space-87);
// what each placement did — the step in flight, the outcome the last
// sync left, its own state and last sync — on its line, Dismiss putting
// away what needs nothing of the reader (space-12, space-15, space-61);
// the row reading the core's aggregate and its key placement's last
// sync (space-61); and the line's fit (space-28). Members, Share, Remove
// and "Move…" act on one placement from its line, naming its instance,
// its members panel naming the other instances the records are placed
// at (space-62, space-69, space-72, space-78). A placement owing its
// sharing notice waits with Continue, the notice naming its path at its
// instance; the row's Sync says it first only where no other placement
// can run (space-57); an unrelated placement joins from its line
// (space-13); a stopped one retries from its line (space-15); and the
// row's sign-in refusal and Retry follow every placement (space-11,
// space-61).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { GroupsState, PlacementState, RepositoryState } from "@sublang/spex-core/protocol";

import { activateLanguage } from "../i18n.js";
import { SpexCommandError } from "../lib/client.js";
import { absoluteTitle } from "../lib/time.js";
import { setClientForTests } from "../state/store.js";
import {
  ACME,
  BETA,
  BRANCH,
  GAMMA,
  HOUR,
  KEY,
  MIN,
  NOW,
  ORIGIN,
  OWN,
  SECOND,
  answer,
  base,
  calls,
  commandMock,
  deliver,
  installClient,
  instance,
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

/** A row's placement lines, in the order they stand. */
function linesOf(key: string): HTMLElement[] {
  return within(screen.getByTestId(`space-lines-${key}`)).getAllByRole("listitem");
}

/** One line of a row, scoped by its placement's origin. */
function lineOf(key: string, origin: string | null): HTMLElement {
  return within(screen.getByTestId(`space-row-${key}`)).getByTestId(`space-line-${origin ?? "path"}`);
}

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
    expect(reading(lineOf(BETA, SECOND))).toEqual({ name: "Second Example", at: "workshop/beta-spex", state: "Not on this device" });
    expect(lineOf(BETA, SECOND).dataset.state).toBe("absent");
    expect(lineOf(BETA, SECOND).dataset.attached).toBe("false");
    expect(screen.queryByTestId("space-row-@second.example/workshop/beta-spex")).toBeNull();
    // Your own group's own repository, placed at both, under your own
    // group; a group's own at its one instance.
    expect(within(screen.getByTestId("space-own")).getByTestId(`space-lines-${OWN}`)).toBeTruthy();
    expect(linesOf(OWN).map(reading)).toEqual([
      { name: "Spex Example", at: OWN, state: "Synced 3h ago" },
      { name: "Second Example", at: "jada/jada-spex", state: "Synced 3h ago" },
    ]);
    expect(linesOf(ACME).map(reading)).toEqual([{ name: "Spex Example", at: "acme/acme-spex", state: "Synced 4h ago" }]);
    // A local-only project holds no placement and carries no line.
    expect(screen.getByTestId(`space-row-${GAMMA}`)).toBeTruthy();
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
      { name: "Second Example", at: "workshop/academy-spex", state: "Not on this device" },
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
    expect(screen.queryByTestId(`space-lines-${KEY}`)).toBeNull();
    expect(screen.getByTestId(`space-row-${KEY}@9`)).toBeTruthy();
    expect(screen.queryByTestId(`space-lines-${KEY}@9`)).toBeNull();
  });

  test("space-87, space-12: the step in flight stands on its placement's line; synced reads 'Synced just now · N sent · M received' or 'Everything is in sync', a read-only line 'Brought M; nothing sent', 'Behind — Sync again'; 'Needs your choice', 'Unrelated history' and 'Waiting for you to continue' stand until the next operation, and Dismiss puts away the synced and stopped ones", async () => {
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
    expect(phraseOf(KEY, SECOND).textContent).toBe("Pushing…");
    expect(phraseOf(KEY, SECOND).dataset.tone).toBe("running");
    expect(screen.getByTestId(`space-row-sync-${KEY}`).textContent).toBe("Syncing…");
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
        "Brought 3; nothing sent",
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
        "Needs your choice",
      ],
      [
        { outcome: synced(1, 0), lastSync: { ...now, sent: 1 } },
        { outcome: { kind: "unrelated", sent: 0, received: 0 } },
        { phase: "unrelated", placement: SECOND },
        "Synced just now · 1 sent · 0 received",
        "Unrelated history",
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
        ["Behind — Sync again", "Needs your choice", "Unrelated history", "Waiting for you to continue"].includes(secondReads)
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
    expect(phraseOf(KEY, SECOND).textContent).toBe("Push stopped — Could not reach second.example");
    fireEvent.click(screen.getByTestId("space-dismiss"));
    expect(phraseOf(KEY, SECOND).textContent).toBe("Synced 1h ago");
    expect(phraseOf(KEY, ORIGIN).textContent).toBe("Unrelated history");
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
    expect(phrase.textContent).toBe("Check stopped — Could not reach Second Example");
    expect(phrase.getAttribute("title")).toBe("Check the network, then Retry.");
    expect(phrase.dataset.tone).toBe("stopped");
    // The first placement, which ran, reads its own.
    expect(phraseOf(KEY, ORIGIN).textContent).toBe("Synced 5m ago");
    cleanup();

    // In the reader's language, the step's name and the host's words.
    activateLanguage("zh");
    await renderGroups(
      placedAtTwo({
        second: {
          outcome: { kind: "stopped", step: "push", cause: "refused", message: "仓库已归档", guidance: "请联系管理员。", retry: false },
        },
      }),
      { open: false },
    );
    expect(phraseOf(KEY, SECOND).textContent).toBe("推送已停止 — 仓库已归档");
    expect(phraseOf(KEY, SECOND).getAttribute("title")).toBe("请联系管理员。");
  });

  test("space-61: a placement unreachable while the row reads reachable; every one unreachable makes the row unreachable; the row's last sync is its key placement's", async () => {
    const offline = { state: "unreachable" as const, reason: "the device is offline" };
    await renderGroups(placedAtTwo({ second: offline }), { open: false });
    expect(screen.getByTestId(`space-row-${KEY}`).dataset.state).toBe("reachable");
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("Synced 5m ago");
    expect(screen.getByTestId(`space-row-sync-${KEY}`)).toBeTruthy();
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
    expect(phraseOf(KEY, SECOND).textContent).toBe("Read-only: archived");
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
    // placement's more recent one; ahead and behind are the key's too.
    await renderGroups(
      placedAtTwo({ second: { lastSync: { at: NOW - MIN, sent: 0, received: 1 }, branch: { ...BRANCH, ahead: 7, behind: 9 } } }),
      { open: false },
    );
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("Synced 5m ago");
    expect(screen.getByTestId(`space-repo-state-${KEY}`).getAttribute("title")).toBe(absoluteTitle(NOW - 5 * MIN));
    expect(phraseOf(KEY, SECOND).textContent).toBe("Synced 1m ago");
    expect(screen.getByTestId(`space-repo-counts-${KEY}`).textContent).toContain("↑2");
    expect(screen.getByTestId(`space-repo-counts-${KEY}`).textContent).toContain("↓1");
    expect(screen.getByTestId(`space-repo-counts-${KEY}`).getAttribute("title")).toBe(countsOf(2, 1));
    expect(phraseOf(KEY, SECOND).getAttribute("title")).toBe(`${absoluteTitle(NOW - MIN)} · ${countsOf(7, 9)}`);
  });

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
    // Where lines carry it, the row's phrase is an at-a-glance repeat of
    // its key placement's and yields below @md, describing the row still;
    // a row with no line keeps its own.
    const repeated = screen.getByTestId(`space-repo-state-${KEY}`);
    expect(repeated.className.split(/\s+/)).toEqual(expect.arrayContaining(["hidden", "@md:inline"]));
    expect(screen.getByTestId(`space-repo-${KEY}`).getAttribute("aria-describedby")).toContain(`space-repo-state-${KEY}`);
    expect(screen.getByTestId(`space-repo-state-${GAMMA}`).className.split(/\s+/)).not.toContain("hidden");
    // Below @xs the row's controls wrap beneath its name, the state's
    // control last.
    const head = screen.getByTestId(`space-repo-${KEY}`).parentElement!;
    for (const token of ["flex-wrap", "@xs:flex-nowrap"]) expect(head.className.split(/\s+/)).toContain(token);
    for (const token of ["basis-full", "@xs:basis-0"]) {
      expect(screen.getByTestId(`space-repo-${KEY}`).className.split(/\s+/)).toContain(token);
    }
    const controls = screen.getByTestId(`space-row-sync-${KEY}`).parentElement!;
    expect(controls.lastElementChild).toBe(screen.getByTestId(`space-row-sync-${KEY}`));
    expect(controls.className.split(/\s+/)).toContain("flex-wrap");
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

describe("GROUPS: a placement's members and move (space-62, space-69, space-72, space-78)", () => {
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
    fireEvent.change(within(editor).getByLabelText("Login at second.example"), { target: { value: "dave" } });
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

  test("space-78: Move… on a placement's line offers that placement's instance alone, your login first, the entry it stands in left out — the row's for the key placement, the one whose placed line names the row otherwise — and sends {repository, instance, groupId}", async () => {
    let settle: ((value: unknown) => void) | undefined;
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type !== "space.repository.move") return answer(type, fields);
      return new Promise((resolve) => {
        settle = resolve;
      });
    });
    // Your own group's own repository and a group's own, which the host
    // lets the person move, stay where they are (space-87, DR-103).
    const may = { manageMembers: true, transfer: true };
    const home = twoPlacementsHome();
    const [first] = home.instances;
    const placed: GroupsState = {
      ...home,
      own: { ...home.own, repositories: home.own.repositories.map((row) => withLines(row, { can: may })) },
      instances: [
        {
          ...first!,
          // acme's own records, named after its path as the core names
          // a group's own.
          groups: first!.groups.map((group) =>
            group.id === "3" ? { ...group, name: "acme", repositories: group.repositories.map((row) => withLines(row, { can: may })) } : group,
          ),
        },
        home.instances[1]!,
      ],
    };
    await renderGroups(placed, { open: false });
    const moveOn = (key: string, origin: string): HTMLElement | null => within(lineOf(key, origin)).queryByTestId("space-line-move");
    expect(moveOn(OWN, ORIGIN)).toBeNull();
    expect(moveOn(OWN, SECOND)).toBeNull();
    expect(moveOn(ACME, ORIGIN)).toBeNull();
    // A placement not on this device moves nothing.
    expect(moveOn(BETA, SECOND)).toBeNull();
    expect(moveOn(BETA, ORIGIN)).toBeTruthy();

    // The key placement, standing in your namespace at the first: that
    // instance's groups alone, your namespace left out.
    const keyMove = moveOn(KEY, ORIGIN)!;
    expect(keyMove.getAttribute("aria-label")).toBe("Move to another group");
    expect(describedAs(keyMove)).toBe("Spex Example");
    fireEvent.click(keyMove);
    const keyPicker = screen.getByTestId(`space-move-${KEY}@${ORIGIN}`);
    expect(lineOf(KEY, ORIGIN).contains(keyPicker)).toBe(true);
    expect(within(keyPicker).getAllByTestId(/^space-move-group-/).map((option) => [option.dataset.testid, option.textContent])).toEqual([
      ["space-move-group-acme", "acme"],
    ]);
    // Escape closes it, focus back on its line's Move.
    fireEvent.keyDown(within(keyPicker).getByTestId("space-move-group-acme"), { key: "Escape" });
    expect(screen.queryByTestId(`space-move-${KEY}@${ORIGIN}`)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(keyMove));

    // The second placement, which the second's workshop lists as placed
    // there: your login there first, workshop left out, nothing of the
    // first.
    const secondMove = moveOn(KEY, SECOND)!;
    expect(describedAs(secondMove)).toBe("Second Example");
    fireEvent.click(secondMove);
    const picker = screen.getByTestId(`space-move-${KEY}@${SECOND}`);
    expect(lineOf(KEY, SECOND).contains(picker)).toBe(true);
    expect(within(picker).getAllByTestId(/^space-move-group-/).map((option) => [option.dataset.testid, option.textContent])).toEqual([
      ["space-move-group-@jada", "jada"],
    ]);
    expect(document.activeElement).toBe(within(picker).getByTestId("space-move-group-@jada"));
    fireEvent.click(within(picker).getByTestId("space-move-group-@jada"));
    // It names the placement's instance, your namespace by none, and
    // reads "Moving…" until the reply.
    await waitFor(() => expect(calls("space.repository.move")).toEqual([{ repository: KEY, instance: SECOND, groupId: null }]));
    await waitFor(() => expect(moveOn(KEY, SECOND)!.textContent).toBe("Moving…"));
    expect(moveOn(KEY, ORIGIN)!.textContent).toBe("Move…");
    settle!({ repository: { id: "52", fullPath: "jada/academy-spex" } });
    await waitFor(() => expect(screen.queryByTestId(`space-move-${KEY}@${SECOND}`)).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(moveOn(KEY, SECOND)));
    expect(moveOn(KEY, SECOND)!.textContent).toBe("Move…");

    // The key placement into acme names the first.
    fireEvent.click(moveOn(KEY, ORIGIN)!);
    fireEvent.click(within(screen.getByTestId(`space-move-${KEY}@${ORIGIN}`)).getByTestId("space-move-group-acme"));
    await waitFor(() => expect(calls("space.repository.move")[1]).toEqual({ repository: KEY, instance: ORIGIN, groupId: "3" }));
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
const rowSync = (key = KEY): HTMLButtonElement => screen.getByTestId(`space-row-sync-${key}`) as HTMLButtonElement;

describe("GROUPS: a placement's notice, join and retry (space-57, space-13, space-15, space-11, space-61)", () => {
  test("space-57: a placement owing its notice reads 'Waiting for you to continue' with Continue; Continue shows the notice naming its instance and path, Cancel focused, Escape keeping; Continue sends space.sync {repository, placement, noticed: true}", async () => {
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

    // The notice stands beneath the line, leading with where the records
    // go, Cancel focused; Escape keeps the line waiting, focus back on
    // Continue (DR-010 §4, §6).
    fireEvent.click(go);
    let notice = within(line).getByTestId("space-line-notice");
    expect(notice.textContent).toContain("Records go to workshop/academy-spex at Second Example.");
    expect(notice.textContent).toContain("Every session goes there whole — hidden parts and attachments included");
    expect(notice.textContent).toContain("nothing recalls what others downloaded");
    expect(notice.textContent).not.toContain("public");
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

    // Continue syncs with that placement's notice seen, and the line's
    // Continue waits for the machine.
    fireEvent.click(go);
    notice = within(line).getByTestId("space-line-notice");
    fireEvent.click(within(notice).getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY, placement: SECOND, noticed: true }]));
    expect(within(line).queryByTestId("space-line-notice")).toBeNull();
    await waitFor(() => expect(go.disabled).toBe(true));
    cleanup();

    // A public repository says its records are public.
    await renderGroups(placedAtTwo({ second: { ...waiting, visibility: "public" } }, { sync: DONE }), { open: false });
    fireEvent.click(within(lineOf(KEY, SECOND)).getByTestId("space-line-continue"));
    expect(within(lineOf(KEY, SECOND)).getByTestId("space-line-notice").textContent).toContain("its records are public");
    cleanup();

    // In the reader's language.
    activateLanguage("zh");
    await renderGroups(placedAtTwo({ second: waiting }, { sync: DONE }), { open: false });
    expect(reading(lineOf(KEY, SECOND)).state).toBe("等待你继续");
    fireEvent.click(within(lineOf(KEY, SECOND)).getByTestId("space-line-continue"));
    expect(within(lineOf(KEY, SECOND)).getByTestId("space-line-notice").textContent).toContain(
      "记录将发往 Second Example 上的 workshop/academy-spex。",
    );
  });

  test("space-57: Sync where the only runnable placement owes the notice says it first and sends that placement's noticed; where another can run, Sync says nothing and the owing line waits; a read-only or path placement owes none", async () => {
    // The first placement offline, the second owing: the row's Sync says
    // the second's notice first, beneath the row.
    await renderGroups(placedAtTwo({ first: OFFLINE, second: OWING }), { open: false });
    fireEvent.click(rowSync());
    const notice = screen.getByTestId("space-notice-confirm");
    expect(notice.textContent).toContain("Records go to workshop/academy-spex at Second Example.");
    expect(notice.textContent).toContain("Every session goes there whole");
    expect(document.activeElement).toBe(within(notice).getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(notice).getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY, placement: SECOND, noticed: true }]));
    cleanup();

    // The first can run: Sync says nothing and goes; the owing placement
    // then waits on its line with Continue while the first synced.
    commandMock.mockClear();
    await renderGroups(placedAtTwo({ second: OWING }), { open: false });
    fireEvent.click(rowSync());
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
    fireEvent.click(rowSync());
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
    fireEvent.click(rowSync());
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
    fireEvent.click(rowSync(OWN));
    expect(screen.getByTestId("space-notice-confirm").textContent).toContain("Records go to jada/jada-spex at Second Example.");
    fireEvent.click(within(screen.getByTestId("space-notice-confirm")).getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: OWN, placement: SECOND, noticed: true }]));
    cleanup();
    commandMock.mockClear();
    await renderGroups(ownAt([{ ...ownFirst, lastSync: null }]), { open: false });
    fireEvent.click(rowSync(OWN));
    expect(screen.queryByTestId("space-notice-confirm")).toBeNull();
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: OWN }]));
  });

  test("space-57: a refusal carrying the notice opens it for the placement it names", async () => {
    // The page's read says the second's only member is the account; the
    // core's fresh read finds others, and no other placement can run.
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type === "space.sync" && fields?.noticed === undefined) throw noticeRefusal(SECOND);
      return answer(type, fields);
    });
    await renderGroups(placedAtTwo({ first: OFFLINE, second: { members: 1, noticed: false, lastSync: null } }), { open: false });
    fireEvent.click(rowSync());
    const notice = await screen.findByTestId("space-notice-confirm");
    expect(notice.textContent).toContain("Records go to workshop/academy-spex at Second Example.");
    // The notice stands in place of the refusal's words.
    expect(screen.queryByTestId(`space-row-caption-${KEY}`)).toBeNull();
    expect(document.activeElement).toBe(within(notice).getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(notice).getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(calls("space.sync")).toEqual([{ repository: KEY }, { repository: KEY, placement: SECOND, noticed: true }]),
    );
    cleanup();

    // A placement's Join refused for its notice says it on that line, its
    // Continue carrying the join.
    commandMock.mockClear();
    const unrelated = { outcome: { kind: "unrelated" as const, sent: 0, received: 0 }, branch: { ...BRANCH, unrelated: true } };
    await renderGroups(placedAtTwo({ first: OFFLINE, second: { members: 1, noticed: false, lastSync: null, ...unrelated } }, { sync: { phase: "unrelated", placement: SECOND } }), { open: false });
    const line = lineOf(KEY, SECOND);
    const join = within(line).getByTestId("space-line-join");
    fireEvent.click(join);
    fireEvent.click(within(within(line).getByTestId("space-line-join-confirm")).getByRole("button", { name: "Join" }));
    const lineNotice = await within(line).findByTestId("space-line-notice");
    expect(lineNotice.textContent).toContain("Records go to workshop/academy-spex at Second Example.");
    expect(within(line).queryByTestId("space-line-error")).toBeNull();
    // Cancel hands focus back to the Join that asked.
    fireEvent.click(within(lineNotice).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(document.activeElement).toBe(join));
    fireEvent.click(join);
    fireEvent.click(within(within(line).getByTestId("space-line-join-confirm")).getByRole("button", { name: "Join" }));
    fireEvent.click(within(await within(line).findByTestId("space-line-notice")).getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(calls("space.sync")).toEqual([
        { repository: KEY, placement: SECOND, join: true },
        { repository: KEY, placement: SECOND, join: true },
        { repository: KEY, placement: SECOND, join: true, noticed: true },
      ]),
    );
  });

  test("space-13: an unrelated placement's line offers Join, confirmed inline with Cancel focused, sending {repository, placement, join: true}; the row keeps Sync", async () => {
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
    // The row's one Sync stands for every placement (DR-128).
    expect(rowSync().textContent).toBe("Sync");
    expect(rowSync().disabled).toBe(false);
    expect(rowSync().title).toBe("Sends what is here and brings back anything new");
    // Join on the unrelated placement's line alone.
    expect(within(lineOf(KEY, ORIGIN)).queryByTestId("space-line-join")).toBeNull();
    const line = lineOf(KEY, SECOND);
    expect(reading(line).state).toBe("Unrelated history");
    const join = within(line).getByTestId("space-line-join") as HTMLButtonElement;
    expect(join.textContent).toBe("Join");
    expect(join.title).toBe("Brings both histories into one and asks about anything that differs");
    expect(describedAs(join)).toBe("Second Example");

    // Confirmed inline beneath the line, Cancel focused, Escape keeping.
    fireEvent.click(join);
    const confirm = within(line).getByTestId("space-line-join-confirm");
    expect(confirm.textContent).toContain("Join both histories into one? Anything that differs will ask you to choose.");
    expect(document.activeElement).toBe(within(confirm).getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(within(line).queryByTestId("space-line-join-confirm")).toBeNull();
    expect(calls("space.sync")).toHaveLength(0);
    await waitFor(() => expect(document.activeElement).toBe(join));

    // Join names its placement and reads "Joining…" until the reply.
    fireEvent.click(join);
    fireEvent.click(within(within(line).getByTestId("space-line-join-confirm")).getByRole("button", { name: "Join" }));
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY, placement: SECOND, join: true }]));
    await waitFor(() => expect(join.textContent).toBe("Joining…"));
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
    expect((within(lineOf(KEY, SECOND)).getByTestId("space-line-join") as HTMLButtonElement).disabled).toBe(true);
    cleanup();

    // A history the last check found unrelated offers Join with no
    // outcome on the line.
    commandMock.mockImplementation(answer);
    await renderGroups(placedAtTwo({ second: { branch: unrelated.branch } }), { open: false });
    expect(within(lineOf(KEY, SECOND)).getByTestId("space-line-join")).toBeTruthy();
    expect(within(lineOf(KEY, ORIGIN)).queryByTestId("space-line-join")).toBeNull();
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
    await renderGroups(signedOutAt(SECOND, {}, signedOutAt(ORIGIN, {}, placedAtTwo())), { open: false });
    expect(rowSync().disabled).toBe(true);
    expect(screen.getByTestId(`space-row-caption-${KEY}`).textContent).toBe("Sign in to Spex Example first");
    expect(rowSync().getAttribute("aria-describedby")).toBe(`space-row-caption-${KEY}`);
    cleanup();

    // The first signed out alone: the second placement can run, so the
    // sync is admitted.
    await renderGroups(signedOutAt(ORIGIN, {}, placedAtTwo()), { open: false });
    expect(rowSync().disabled).toBe(false);
    expect(screen.queryByTestId(`space-row-caption-${KEY}`)).toBeNull();
    fireEvent.click(rowSync());
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY }]));
    cleanup();

    // A placement unreachable while the row reads reachable retries from
    // its line, reading every signed-in instance again (space-2).
    commandMock.mockClear();
    await renderGroups(placedAtTwo({ second: OFFLINE }), { open: false });
    expect(within(lineOf(KEY, ORIGIN)).queryByTestId("space-line-retry")).toBeNull();
    const retry = within(lineOf(KEY, SECOND)).getByTestId("space-line-retry");
    expect(retry.title).toBe("Reads each signed-in instance again");
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
