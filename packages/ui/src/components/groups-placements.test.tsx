// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A spex repository placed at several instances, on the Groups surface
// over a mocked client (DR-128): a line per placement beneath its row,
// in the core's order, naming its instance and its path there (space-87);
// what each placement did — the step in flight, the outcome the last
// sync left, its own state and last sync — on its line, Dismiss putting
// away what needs nothing of the reader (space-12, space-15, space-61);
// the row reading the core's aggregate and its key placement's last
// sync (space-61); and the line's fit (space-28).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import type { GroupsState, PlacementState, RepositoryState } from "@sublang/spex-core/protocol";

import { activateLanguage } from "../i18n.js";
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
  deliver,
  installClient,
  instance,
  placement,
  placementState,
  renderGroups,
  repo,
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
