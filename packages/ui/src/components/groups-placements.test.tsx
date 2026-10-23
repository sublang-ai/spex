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
// at, each read at the instance governing it — the earliest signed-in
// one listing its row while its own is signed out (space-62, space-69,
// space-72, space-78, git-host-5). A placement owing its
// sharing notice waits with Continue, the notice naming its path at its
// instance; the row's Sync says it first only where no other placement
// can run (space-57); an unrelated placement joins from its line
// (space-13), a Retry joining only the placement this page joined; a
// stopped one retries from its line (space-15); focus after a line's
// act goes to the control that asked, or the row's name while it is
// busy (DR-010 §6); and the
// row's sign-in refusal and Retry follow every placement (space-11,
// space-61). The Sync tab lists each placement's incoming units under
// its instance's display name (space-8); choices stand for one
// placement, its incoming list above the picker and the caption and the
// host's side naming its instance, Apply naming it (space-9, space-14,
// space-17, space-18); a host-side diff names its placement (space-10);
// and the rail names the placement in flight (space-12). A placement a
// file of the clone names, not yet on this device, offers Attach on its
// line: the sharing notice whatever its members, then space.attach with
// the notice seen, a refusal standing on that line (space-90). A
// project's row whose members the person may manage at every placement
// offers "Place at…" for each signed-in instance it holds none at:
// that instance's picker, or the choice of them first, a pick sent as
// space.place, its notice in the picker, "Placing…" until the Place has
// run; a clone holding only its path placement picks a group beside its
// Sync instead (space-88, space-97, space-57, space-58, space-61,
// storage-35, space-28). "Leave…" on a project's row holding a
// placement at an instance asks about the one it holds, or the one
// chosen, inline — again, naming the count or what may be left behind,
// where that Leave stopped short, its Remove then confirmed — and reads
// "Leaving…" until the Leave has run; the live note says what was left
// — nothing where the placement only followed another instance — the
// opened row followed by its folder where the clone moved; the
// stopped card's Retry sends the Leave again as this page asked it
// (space-89, space-98, storage-38, space-15, space-28). Every other
// group or login whose listing holds a placement of a row shows one
// line naming the row and where it stands, with no control, and offers
// no Delete while it does (space-1, space-77). Last, space-95's home is
// walked whole — its lines, Place at… and Leave…, a Remove asked again
// with its count, Attach's notice, a waiting line, the placed lines,
// "also placed at" and the Add instance card — and every control on it
// read at most 14 characters, idle, opened and busy, its long name
// kept, in English and in Chinese (space-95, space-28).

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
  live,
  namespace,
  ownRepo,
  placement,
  placementState,
  renderGroups,
  repo,
  signedOutAt,
  twoInstances,
  twoPlacementsHome,
  type RowOver,
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
  test("space-62, space-78, git-host-5: a placement whose instance is signed out acts at the earliest signed-in instance listing its row, never at an earlier one that lists nothing of it", async () => {
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
    expect(within(within(panel).getByTestId(`space-share-${KEY}@${SECOND}-editor`)).getByLabelText("Login at fourth.example")).toBeTruthy();

    // Move… lists the fourth's entries — your login there first, the
    // workshop it stands in left out — and names the placement's
    // instance (space-78).
    fireEvent.click(within(lineOf(KEY, SECOND)).getByTestId("space-line-move"));
    const picker = screen.getByTestId(`space-move-${KEY}@${SECOND}`);
    expect(within(picker).getAllByTestId(/^space-move-group-/).map((option) => option.dataset.testid)).toEqual([
      "space-move-group-@finn",
      "space-move-group-studio",
    ]);
    fireEvent.click(within(picker).getByTestId("space-move-group-studio"));
    await waitFor(() => expect(calls("space.repository.move")).toEqual([{ repository: KEY, instance: SECOND, groupId: "92" }]));
    cleanup();

    // Where no signed-in instance lists the row, the placement's own
    // instance governs it, signed out: neither Members nor Move.
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

  test("space-13, space-15: a stopped sync's Retry joins no unrelated placement the reader has not joined, its line offering Join again; after the line's Join, both Retries join that placement alone, and a plain sync forgets it", async () => {
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
    expect(within(lineOf(KEY, SECOND)).getByTestId("space-line-join")).toBeTruthy();
    // The Sync tab's Retry syncs plainly: nobody here joined it.
    fireEvent.click(screen.getByTestId("space-retry"));
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY }]));
    // The placement stops as "Unrelated history" again, Join on its line.
    deliver(placedAtTwo({ second: { ...unrelated, outcome: { kind: "unrelated", sent: 0, received: 0 } } }, { sync: { phase: "unrelated", placement: SECOND } }));
    expect(reading(lineOf(KEY, SECOND)).state).toBe("Unrelated history");
    const join = within(lineOf(KEY, SECOND)).getByTestId("space-line-join");
    fireEvent.click(join);
    fireEvent.click(within(within(lineOf(KEY, SECOND)).getByTestId("space-line-join-confirm")).getByRole("button", { name: "Join" }));
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
    await waitFor(() => expect(rowSync().disabled).toBe(false));
    fireEvent.click(rowSync());
    await waitFor(() => expect(calls("space.sync")[4]).toEqual({ repository: KEY }));
    deliver(placedAtTwo({ second: unrelated }, { sync: running }));
    deliver(offline());
    await waitFor(() => expect((screen.getByTestId("space-retry") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId("space-retry"));
    await waitFor(() => expect(calls("space.sync")[5]).toEqual({ repository: KEY }));
    expect(calls("space.sync")).toHaveLength(6);
  });

  test("space-57, space-13, space-90: after a line's Continue, Join or Attach, and a row notice's Continue, focus goes to the row's name while the control that asked is busy (DR-010 §6)", async () => {
    const rowName = (key = KEY): HTMLElement => screen.getByTestId(`space-repo-${key}`);
    // A line's notice continued: its Continue busy until the machine
    // moves.
    const waiting = { ...OWING, outcome: { kind: "waiting" as const, sent: 0, received: 0 } };
    await renderGroups(placedAtTwo({ second: waiting }), { open: false });
    const go = within(lineOf(KEY, SECOND)).getByTestId("space-line-continue") as HTMLButtonElement;
    fireEvent.click(go);
    fireEvent.click(within(within(lineOf(KEY, SECOND)).getByTestId("space-line-notice")).getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY, placement: SECOND, noticed: true }]));
    await waitFor(() => expect(document.activeElement).toBe(rowName()));
    expect(go.disabled).toBe(true);
    cleanup();

    // A Join confirmed: Joining… until the machine moves.
    installClient();
    const unrelated = {
      outcome: { kind: "unrelated" as const, sent: 0, received: 0 },
      branch: { ...BRANCH, unrelated: true, ahead: null, behind: null },
    };
    await renderGroups(placedAtTwo({ second: unrelated }, { sync: { phase: "unrelated", placement: SECOND } }), { open: false });
    const join = within(lineOf(KEY, SECOND)).getByTestId("space-line-join") as HTMLButtonElement;
    fireEvent.click(join);
    fireEvent.click(within(within(lineOf(KEY, SECOND)).getByTestId("space-line-join-confirm")).getByRole("button", { name: "Join" }));
    await waitFor(() => expect(join.textContent).toBe("Joining…"));
    await waitFor(() => expect(document.activeElement).toBe(rowName()));
    cleanup();

    // An Attach continued: Attaching… until its attach has run.
    installClient();
    await renderGroups(twoPlacementsHome(), { open: false });
    const attach = within(lineOf(BETA, SECOND)).getByTestId("space-line-attach") as HTMLButtonElement;
    fireEvent.click(attach);
    fireEvent.click(within(within(lineOf(BETA, SECOND)).getByTestId("space-line-notice")).getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(calls("space.attach")).toEqual([{ repository: BETA, instance: SECOND, noticed: true }]));
    await waitFor(() => expect(document.activeElement).toBe(rowName(BETA)));
    expect(attach.disabled).toBe(true);
    cleanup();

    // The row's notice continued: its Sync busy until the machine moves.
    installClient();
    await renderGroups(base({}, [repo({ members: 3, noticed: false })]), { open: false });
    fireEvent.click(rowSync());
    fireEvent.click(within(screen.getByTestId("space-notice-confirm")).getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(calls("space.sync")).toEqual([{ repository: KEY, placement: ORIGIN, noticed: true }]));
    await waitFor(() => expect(document.activeElement).toBe(rowName()));
    expect(rowSync().disabled).toBe(true);
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

describe("GROUPS: each placement's incoming units and choices (space-8, space-9, space-14, space-17, space-18, space-10, space-12)", () => {
  /** The Sync tab's incoming sections, in the order they stand. */
  const sectionsOf = (): HTMLElement[] =>
    screen.queryAllByTestId(/^space-incoming-/).filter((each) => each.dataset.testid !== "space-incoming-list");
  const sectionAt = (origin: string | null): HTMLElement => screen.getByTestId(`space-incoming-${origin ?? "path"}`);
  /** What a section is headed by. */
  const headOf = (section: HTMLElement): string => within(section).getByRole("heading", { level: 3 }).textContent ?? "";
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

  test("space-8: Check host lists each placement's incoming units under its instance's display name, marked to choose from that placement's conflicts; a placement holding no spex says Sync will send these; an unrelated placement lists nothing", async () => {
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
    // by its instance's display name, the path placement by its remote
    // (space-8, space-87).
    expect(sectionsOf().map(headOf)).toEqual(["Spex Example", "Second Example", "/srv/git/academy.git"]);
    expect(sectionsOf().map((each) => each.dataset.testid)).toEqual([
      `space-incoming-${ORIGIN}`,
      `space-incoming-${SECOND}`,
      "space-incoming-path",
    ]);
    // The count is every section's; the kinds stand beneath each
    // placement's heading.
    expect(screen.getByRole("heading", { level: 2, name: "From the host (4)" })).toBeTruthy();
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
    // Check host checks every placement at once.
    fireEvent.click(screen.getByTestId("space-check"));
    await waitFor(() => expect(calls("space.fetch")).toEqual([{ repository: KEY }]));

    // A placement holding no spex says Sync will send these.
    deliver(lines({ incoming: [], conflicts: [], branch: { ...BRANCH, hostEmpty: true, behind: 0 } }));
    expect(within(sectionAt(SECOND)).getByText("The host holds no records yet; Sync will send these")).toBeTruthy();
    expect(within(sectionAt(SECOND)).queryByTestId("space-incoming-list")).toBeNull();
    expect(within(sectionAt(ORIGIN)).getByTestId("space-incoming-list")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "From the host (2)" })).toBeTruthy();

    // An unrelated placement lists nothing; Join stands on its line
    // (space-13).
    deliver(lines({ incoming: [], conflicts: [], branch: { ...BRANCH, unrelated: true, ahead: null, behind: null } }));
    expect(within(sectionAt(SECOND)).getByText("Unrelated history")).toBeTruthy();
    expect(within(sectionAt(SECOND)).queryByTestId("space-incoming-list")).toBeNull();
    expect(within(lineOf(KEY, SECOND)).getByTestId("space-line-join")).toBeTruthy();

    // A check that stopped there reads its step and cause (space-15).
    deliver(
      lines({
        incoming: [],
        conflicts: [],
        branch: { ...BRANCH, checkedAt: null },
        outcome: { kind: "stopped", step: "check", cause: "unreachable", message: "Could not reach Second Example", guidance: "Check the network, then Retry.", retry: true },
      }),
    );
    expect(within(sectionAt(SECOND)).getByText("Check stopped — Could not reach Second Example")).toBeTruthy();
  });

  test("space-9, space-14: choices at the second placement show its incoming list above the picker and the caption naming its display name", async () => {
    await renderGroups(choicesAtSecond());
    expect(screen.getByTestId("space-step-line").textContent).toBe("Needs your choice");
    expect(screen.getByTestId("space-choices-note").textContent).toContain("Your changes are saved; nothing is pushed to Second Example yet");
    // That placement's units alone, above the picker for its conflicts.
    expect(sectionsOf().map((each) => each.dataset.testid)).toEqual([`space-incoming-${SECOND}`]);
    expect(headOf(sectionAt(SECOND))).toBe("Second Example");
    const incoming = within(sectionAt(SECOND)).getByTestId("space-incoming-list");
    expect(within(incoming).getByTestId("space-unit-remote-intents/1c2d3e4f-5a6b-4c7d-8e9f-a0b1c2d3e4f5")).toBeTruthy();
    expect(screen.queryByTestId("space-unit-remote-sessions/s2")).toBeNull();
    const picker = screen.getByTestId("space-picker");
    expect(incoming.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Choose for 2 conflicts" })).toBeTruthy();
    // The first placement's merge stands: its line reads synced.
    expect(reading(lineOf(KEY, ORIGIN)).state).toBe("Synced 5m ago");
  });

  test("space-17: the host's side names the instance the choices are for", async () => {
    await renderGroups(choicesAtSecond());
    const session = screen.getByRole("radiogroup", { name: "Fix the login redirect" });
    expect(within(session).getByLabelText(/Take host's/).parentElement?.textContent).toBe("Take host's Second Example · updated 5h ago · 9 turns");
    expect(within(session).getByLabelText(/Keep mine/).parentElement?.textContent).toBe("Keep mine updated 2h ago · 12 turns");
    // The label keeps its budget; the instance stands beside it.
    expect(within(session).getByRole("radio", { name: /^Take host's Second Example/ })).toBeTruthy();
  });

  test("space-18: Apply sends {placement, choices}, and join while that placement's history is unrelated", async () => {
    await renderGroups(choicesAtSecond());
    fireEvent.click(screen.getByRole("button", { name: "All mine" }));
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
    fireEvent.click(screen.getByRole("button", { name: "All host's" }));
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
    fireEvent.click(screen.getByRole("button", { name: "All mine" }));
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
    expect(screen.getByTestId("space-step-line").textContent).toBe("Pushing…");
    expect(screen.getByTestId("space-step-placement").textContent).toBe("Second Example");
    expect(screen.getByTestId("space-step-save").getAttribute("data-state")).toBe("done");
    deliver(running("sync", ORIGIN));
    expect(screen.getByTestId("space-step-placement").textContent).toBe("Spex Example");
    // Save is at no placement.
    deliver(placedAtTwo({}, { sync: { phase: "running", op: "sync", step: "save", since: NOW, cancelable: false } }));
    expect(screen.getByTestId("space-step-line").textContent).toBe("Saving changes…");
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
      expect(screen.getByTestId("space-step-line").textContent).toBe("Pushing…");
    }
    cleanup();

    // A clone holding one placement names none beside the step line.
    await renderGroups(base({}, [repo({ sync: { phase: "running", op: "sync", placement: ORIGIN, step: "push", since: NOW, cancelable: true } })]));
    expect(screen.getByTestId("space-step-line").textContent).toBe("Pushing…");
    expect(screen.queryByTestId("space-step-placement")).toBeNull();
  });
});

/** space-95's home with the project at the first alone changed as a
 * test says: its line at the second — the placement its file names —
 * and its row. */
function betaHome(second: Partial<PlacementState> = {}, row: Partial<RepositoryState> = {}): GroupsState {
  const home = twoPlacementsHome();
  const change = (entry: RepositoryState): RepositoryState =>
    entry.key !== BETA
      ? entry
      : {
          ...entry,
          ...row,
          placements: entry.placements.map((line) => (line.instance === SECOND ? { ...line, ...second } : line)),
        };
  return {
    ...home,
    instances: home.instances.map((at) => ({
      ...at,
      groups: at.groups.map((group) => ({ ...group, repositories: group.repositories.map(change) })),
    })),
  };
}

/** The placement at the second once attached: held, reachable, never
 * synced from here. */
const ATTACHED: Partial<PlacementState> = { attached: true, state: "reachable", branch: { ...BRANCH, ahead: 0, behind: 0 } };

/** The attach's sync running its step at a placement (space-99,
 * space-12). */
const attachRunning = (placement: string, step: "check" | "push"): RepositoryState["sync"] => ({
  phase: "running",
  op: "attach",
  placement,
  step,
  since: NOW,
  cancelable: step === "push",
});

describe("GROUPS: attaching a placement another device named (space-90, space-99, space-87, space-57, space-28)", () => {
  test("space-90: a 'Not on this device' line offers Attach, which shows the notice on its line naming the instance's display name and path whatever its members, Cancel focused; Cancel attaches nothing and Attach stands again; Continue sends space.attach {repository, instance, noticed: true} and reads 'Attaching…' until the attach ends", async () => {
    let settle: ((value: unknown) => void) | undefined;
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type !== "space.attach") return answer(type, fields);
      return new Promise((resolve) => {
        settle = resolve;
      });
    });
    await renderGroups(twoPlacementsHome(), { open: false });
    // The repository the project's file names at the second stands as
    // its line, not on this device, with Attach (space-87).
    const line = lineOf(BETA, SECOND);
    expect(reading(line).state).toBe("Not on this device");
    const attach = within(line).getByTestId("space-line-attach") as HTMLButtonElement;
    expect(attach.textContent).toBe("Attach");
    expect(attach.disabled).toBe(false);
    // Described by its line's instance (space-87).
    expect(describedAs(attach)).toBe("Second Example");
    // It acts nowhere else: no Members or Move on a placement not here,
    // and no Attach on one the clone holds.
    expect(within(line).queryByTestId("space-line-members")).toBeNull();
    expect(within(line).queryByTestId("space-line-move")).toBeNull();
    expect(within(lineOf(BETA, ORIGIN)).queryByTestId("space-line-attach")).toBeNull();
    expect(within(lineOf(KEY, SECOND)).queryByTestId("space-line-attach")).toBeNull();
    expect(within(lineOf(OWN, SECOND)).queryByTestId("space-line-attach")).toBeNull();

    // The notice stands beneath the line, naming where the records go,
    // Cancel focused; Escape attaches nothing, focus back on Attach
    // (space-57, DR-010 §4, §6).
    fireEvent.click(attach);
    expect(attach.getAttribute("aria-expanded")).toBe("true");
    let notice = within(line).getByTestId("space-line-notice");
    expect(notice.textContent).toContain("Records go to workshop/beta-spex at Second Example.");
    expect(notice.textContent).toContain("Every session goes there whole — hidden parts and attachments included");
    expect(notice.textContent).toContain("nothing recalls what others downloaded");
    expect(document.activeElement).toBe(within(notice).getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(within(line).queryByTestId("space-line-notice")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(attach));
    // Cancel attaches nothing either, and Attach stands again.
    fireEvent.click(attach);
    fireEvent.click(within(within(line).getByTestId("space-line-notice")).getByRole("button", { name: "Cancel" }));
    expect(within(line).queryByTestId("space-line-notice")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(attach));
    expect(attach.textContent).toBe("Attach");
    expect(attach.getAttribute("aria-expanded")).toBe("false");
    expect(calls("space.attach")).toHaveLength(0);

    // Continue attaches that placement with its notice seen, and Attach
    // reads "Attaching…" until the reply.
    fireEvent.click(attach);
    notice = within(line).getByTestId("space-line-notice");
    fireEvent.click(within(notice).getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(calls("space.attach")).toEqual([{ repository: BETA, instance: SECOND, noticed: true }]));
    expect(within(line).queryByTestId("space-line-notice")).toBeNull();
    expect(attach.textContent).toBe("Attaching…");
    expect(attach.disabled).toBe(true);
    expect(calls("space.sync")).toHaveLength(0);
    settle!({ accepted: true });

    // The placement added, the attach syncs the clone: the line is held
    // and each placement names its step in turn; Attach stays busy and
    // the row's Sync keeps its word, waiting (space-99, space-12).
    deliver(betaHome(ATTACHED, { sync: attachRunning(ORIGIN, "check") }));
    await waitFor(() => expect(lineOf(BETA, SECOND).dataset.attached).toBe("true"));
    expect(reading(lineOf(BETA, ORIGIN)).state).toBe("Checking host…");
    expect(reading(lineOf(BETA, SECOND)).state).toBe("Never synced");
    let busy = within(lineOf(BETA, SECOND)).getByTestId("space-line-attach") as HTMLButtonElement;
    expect(busy.textContent).toBe("Attaching…");
    expect(busy.disabled).toBe(true);
    expect(rowSync(BETA).textContent).toBe("Sync");
    expect(rowSync(BETA).disabled).toBe(true);
    deliver(betaHome(ATTACHED, { sync: attachRunning(SECOND, "push") }));
    await waitFor(() => expect(reading(lineOf(BETA, SECOND)).state).toBe("Pushing…"));
    busy = within(lineOf(BETA, SECOND)).getByTestId("space-line-attach") as HTMLButtonElement;
    expect(busy.textContent).toBe("Attaching…");

    // The attach ended: the placement is here, its line synced, and
    // Attach is gone.
    deliver(
      betaHome(
        { ...ATTACHED, lastSync: { at: NOW, sent: 0, received: 3 }, outcome: { kind: "synced", sent: 0, received: 3 } },
        { sync: { phase: "done", at: NOW, sent: 0, received: 3, pushed: true } },
      ),
    );
    await waitFor(() => expect(within(lineOf(BETA, SECOND)).queryByTestId("space-line-attach")).toBeNull());
    expect(reading(lineOf(BETA, SECOND)).state).toBe("Synced just now · 0 sent · 3 received");
    expect(rowSync(BETA).textContent).toBe("Sync");
    expect(rowSync(BETA).disabled).toBe(false);
    cleanup();

    // Whatever its members: a repository whose only member is the
    // account says the notice before an Attach too.
    commandMock.mockClear();
    commandMock.mockImplementation(answer);
    await renderGroups(betaHome({ members: 1 }), { open: false });
    fireEvent.click(within(lineOf(BETA, SECOND)).getByTestId("space-line-attach"));
    notice = within(lineOf(BETA, SECOND)).getByTestId("space-line-notice");
    expect(notice.textContent).toContain("Records go to workshop/beta-spex at Second Example.");
    fireEvent.click(within(notice).getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(calls("space.attach")).toEqual([{ repository: BETA, instance: SECOND, noticed: true }]));
    cleanup();

    // A public repository says its records are public.
    await renderGroups(betaHome({ visibility: "public" }), { open: false });
    fireEvent.click(within(lineOf(BETA, SECOND)).getByTestId("space-line-attach"));
    expect(within(lineOf(BETA, SECOND)).getByTestId("space-line-notice").textContent).toContain("its records are public");
    cleanup();

    // A creation waiting at an instance is no placement a file names: its
    // line offers no Attach (space-64).
    await renderGroups(
      betaHome({ waiting: { step: "create", group: "workshop", message: "403 Forbidden: you need at least the Maintainer role" } }),
      { open: false },
    );
    expect(reading(lineOf(BETA, SECOND)).state).toBe("Waiting for a member who can create it in workshop");
    expect(within(lineOf(BETA, SECOND)).queryByTestId("space-line-attach")).toBeNull();
  });

  test("space-90: a refusal stands on the line", async () => {
    const refusals = [
      new SpexCommandError("invalid_request", "beta-spex is on this device already, as a placement of academy-spex"),
      new SpexCommandError("conflict", "The remotes of beta-spex changed meanwhile; retry"),
    ];
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type === "space.attach") throw refusals.shift()!;
      return answer(type, fields);
    });
    await renderGroups(twoPlacementsHome(), { open: false });
    const line = lineOf(BETA, SECOND);
    const attach = within(line).getByTestId("space-line-attach") as HTMLButtonElement;
    const attachOnce = async () => {
      fireEvent.click(attach);
      fireEvent.click(within(within(line).getByTestId("space-line-notice")).getByRole("button", { name: "Continue" }));
    };

    // The core's words stand on that line as an alert, and are said
    // politely; Attach stands again, ready.
    await attachOnce();
    const error = await within(line).findByTestId("space-line-error");
    expect(error.getAttribute("role")).toBe("alert");
    expect(error.textContent).toBe("beta-spex is on this device already, as a placement of academy-spex");
    expect(live()).toContain("beta-spex is on this device already");
    expect(attach.textContent).toBe("Attach");
    expect(attach.disabled).toBe(false);
    // No other line carries it.
    expect(within(lineOf(BETA, ORIGIN)).queryByTestId("space-line-error")).toBeNull();

    // Asking again puts the refusal away; a remote set meanwhile stands
    // in its place.
    fireEvent.click(attach);
    expect(within(line).queryByTestId("space-line-error")).toBeNull();
    fireEvent.click(within(within(line).getByTestId("space-line-notice")).getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(within(line).getByTestId("space-line-error").textContent).toBe("The remotes of beta-spex changed meanwhile; retry"));
    expect(calls("space.attach")).toEqual([
      { repository: BETA, instance: SECOND, noticed: true },
      { repository: BETA, instance: SECOND, noticed: true },
    ]);
    expect(attach.textContent).toBe("Attach");
    expect(attach.disabled).toBe(false);
  });

  test.each(["en", "zh"] as const)("space-28: Attach and Attaching… within 14 characters (%s)", async (language) => {
    activateLanguage(language);
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) =>
      type === "space.attach" ? new Promise(() => {}) : answer(type, fields),
    );
    await renderGroups(twoPlacementsHome(), { open: false });
    const line = lineOf(BETA, SECOND);
    const attach = within(line).getByTestId("space-line-attach") as HTMLButtonElement;
    const idle = attach.textContent ?? "";
    expect(idle).toBe(language === "en" ? "Attach" : "接入");
    fireEvent.click(attach);
    fireEvent.click(within(within(line).getByTestId("space-line-notice")).getByRole("button", { name: language === "en" ? "Continue" : "继续" }));
    await waitFor(() => expect(attach.textContent).toBe(language === "en" ? "Attaching…" : "接入中…"));
    for (const label of [idle, attach.textContent ?? ""]) expect(label.length, `"${label}"`).toBeLessThanOrEqual(14);
    // Its words are its name, the line's instance describing it.
    expect(attach.getAttribute("aria-label")).toBeNull();
    expect(describedAs(attach)).toBe("Second Example");
    // The line's controls wrap beneath its name below @xs (space-28).
    const row = within(line).getByTestId("space-line-instance").parentElement!;
    for (const token of ["flex-wrap", "@xs:flex-nowrap"]) expect(row.className.split(/\s+/)).toContain(token);
    expect(attach.className.split(/\s+/)).toContain("whitespace-nowrap");
  });
});

/** What the person may do with a placement the view lists: manage its
 * members and move it. */
const MAY = { manageMembers: true, transfer: true };
/** The opened project's code as another spex repository for it names
 * it, without the user part the folder's remote carries. */
const ACADEMY_CODE = "https://github.com/jane/academy.git";
/** The spex repository the second's `workshop` lists for the opened
 * project's code, whose members the person may manage. */
const LISTED = "@second.example/workshop/academy-spex";

/** The opened project at the first alone, the person managing its
 * members there, as a test says otherwise of its row; the second's
 * `lab` listing a spex repository for the same code whose members the
 * person may not manage, its `workshop` one with two members whose
 * members the person may, as a test says otherwise of it, and another
 * for other code (space-88). */
function placeHome(row: RowOver = {}, listed: RowOver = {}): GroupsState {
  const home = twoInstances({}, [repo({ can: MAY, ...row })]);
  const [first, second] = home.instances;
  const at = (key: string, group: string, id: string, over: RowOver = {}): RepositoryState =>
    repo({
      key,
      name: key.split("/").pop()!,
      id,
      instance: SECOND,
      governing: SECOND,
      remote: `${group}/${key.split("/").pop()!}`,
      code: ACADEMY_CODE,
      folder: null,
      state: "absent",
      branch: null,
      members: 2,
      noticed: false,
      can: MAY,
      ...over,
    });
  return {
    ...home,
    instances: [
      first!,
      {
        ...second!,
        groups: [
          {
            id: "82",
            login: null,
            mine: false,
            fullPath: "lab",
            name: "lab",
            can: NO_CAN,
            placed: [],
            repositories: [at("@second.example/lab/academy-spex", "lab", "92", { can: { manageMembers: false, transfer: false } })],
          },
          {
            id: "81",
            login: null,
            mine: false,
            fullPath: "workshop",
            name: "workshop",
            can: NO_CAN,
            placed: [],
            repositories: [
              at(LISTED, "workshop", "91", listed),
              at("@second.example/workshop/notes-spex", "workshop", "93", { code: "https://github.com/jane/notes.git" }),
            ],
          },
          namespace("jada"),
        ],
      },
    ],
  };
}

/** A home as placeHome's with a third instance after the second, no
 * read naming its display name yet, where you are signed in as jo. */
function withThird(home: GroupsState): GroupsState {
  return {
    ...home,
    instances: [
      ...home.instances,
      instance({
        origin: THIRD,
        host: "third.example",
        displayName: null,
        account: { id: "90", login: "jo", displayName: null, canCreateGroup: false },
        groups: [namespace("jo")],
      }),
    ],
  };
}

/** The Place's sync running its step at a placement (space-97,
 * space-12). */
const placeRunning = (placement: string, step: "check" | "push"): RepositoryState["sync"] => ({
  phase: "running",
  op: "place",
  placement,
  step,
  since: NOW,
  cancelable: step === "push",
});

const placeControl = (key = KEY): HTMLButtonElement => screen.getByTestId(`space-row-place-${key}`) as HTMLButtonElement;

describe("GROUPS: placing a project at another instance (space-88, space-97, space-57, space-58, space-61, storage-35, space-28)", () => {
  test("space-88: Place at… stands on the project at one instance, titled and named 'Also place at Second Example', opening that instance's picker — the spex repositories there for the same code whose members the person may manage, then your login and each group; a pick sends space.place with its choice; a join into one with other members says the notice in the picker first and sends noticed; a taken name is refused in the picker; Cancel changes nothing", async () => {
    let settle: ((value: unknown) => void) | undefined;
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type !== "space.place") return answer(type, fields);
      return new Promise((resolve) => {
        settle = resolve;
      });
    });
    await renderGroups(placeHome(), { open: false });
    const row = screen.getByTestId(`space-row-${KEY}`);
    const control = placeControl();
    // One instance offered: the control names it in full, as its title
    // and accessible name, its label within the row's budget (space-88).
    expect(control.textContent).toBe("Place at…");
    expect(control.getAttribute("title")).toBe("Also place at Second Example");
    expect(within(row).getByRole("button", { name: "Also place at Second Example" })).toBe(control);
    // On the row, never a line, before the state's control (DR-041).
    expect(within(screen.getByTestId(`space-lines-${KEY}`)).queryByTestId(`space-row-place-${KEY}`)).toBeNull();
    expect(control.compareDocumentPosition(rowSync()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // It opens that instance's picker beneath the row: the spex
    // repositories there for the same code whose members the person may
    // manage, each with its members, then your login there and each
    // group, the folder's name to create (space-88, space-58).
    fireEvent.click(control);
    expect(control.getAttribute("aria-expanded")).toBe("true");
    let picker = screen.getByRole("group", { name: "Also place at Second Example" });
    expect(picker.dataset.testid).toBe(`space-place-${KEY}`);
    expect(row.contains(picker)).toBe(true);
    const sections = within(picker).getAllByTestId(/^space-pick-instance-/);
    expect(sections.map((section) => section.dataset.testid)).toEqual([`space-pick-instance-${SECOND}`]);
    expect(within(sections[0]!).getByRole("heading", { level: 3 }).textContent).toBe("Second Example");
    const listed = within(picker).getAllByTestId(/^space-pick-repo-/);
    expect(listed.map((option) => option.dataset.testid)).toEqual([`space-pick-repo-${LISTED}`]);
    expect(listed[0]!.textContent).toContain("2 members");
    expect(document.activeElement).toBe(listed[0]);
    expect(within(picker).getAllByTestId(/^space-pick-group-/).map((option) => option.textContent)).toEqual(["jada", "lab", "workshop"]);
    expect((within(picker).getByTestId(`space-pick-name-${KEY}`) as HTMLInputElement).value).toBe("academy");

    // Cancel and Escape change nothing, focus back on Place at…
    // (DR-010 §6).
    fireEvent.click(within(picker).getByTestId(`space-pick-cancel-${KEY}`));
    expect(screen.queryByTestId(`space-place-${KEY}`)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(control));
    expect(control.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(control);
    fireEvent.keyDown(screen.getByTestId(`space-place-${KEY}`), { key: "Escape" });
    expect(screen.queryByTestId(`space-place-${KEY}`)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(control));
    expect(calls("space.place")).toHaveLength(0);

    // A group creates there: space.place names the choice at the second,
    // and Place at… reads "Placing…" from the pick, Sync keeping its
    // word, waiting (space-97, space-29).
    fireEvent.click(control);
    fireEvent.click(within(screen.getByTestId(`space-place-${KEY}`)).getByTestId("space-pick-group-workshop"));
    await waitFor(() =>
      expect(calls("space.place")).toEqual([{ repository: KEY, choice: { kind: "create", instance: SECOND, groupId: "81", name: "academy" } }]),
    );
    expect(calls("space.pick")).toHaveLength(0);
    expect(control.textContent).toBe("Placing…");
    expect(control.disabled).toBe(true);
    expect(control.getAttribute("aria-label")).toBeNull();
    expect(rowSync().textContent).toBe("Sync");
    expect(rowSync().disabled).toBe(true);
    settle!({ accepted: true });
    await waitFor(() => expect(screen.queryByTestId(`space-place-${KEY}`)).toBeNull());
    expect(control.textContent).toBe("Placing…");
    // Closing never strands focus: Place at… busy, it lands on the row
    // (DR-010 §6).
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId(`space-repo-${KEY}`)));

    // The placement added, the Place syncs the clone, its new line among
    // its placements: Place at… stays busy though no instance is left to
    // offer, and is gone once the Place has run (space-97, space-12).
    const placed = (sync: RepositoryState["sync"], second: Partial<PlacementState> = {}): GroupsState =>
      placeHome({
        placedAt: [ORIGIN, SECOND],
        sync,
        placements: [
          placement({ can: MAY }),
          placementState({
            instance: SECOND,
            path: "workshop/academy-spex",
            id: "94",
            members: 2,
            visibility: "private",
            can: MAY,
            branch: { ...BRANCH, ahead: 0, behind: 0 },
            ...second,
          }),
        ],
      });
    deliver(placed(placeRunning(SECOND, "push")));
    await waitFor(() => expect(reading(lineOf(KEY, SECOND)).state).toBe("Pushing…"));
    expect(placeControl().textContent).toBe("Placing…");
    expect(placeControl().disabled).toBe(true);
    expect(rowSync().textContent).toBe("Sync");
    deliver(
      placed(
        { phase: "done", at: NOW, sent: 1, received: 0, pushed: true },
        { lastSync: { at: NOW, sent: 1, received: 0 }, outcome: { kind: "synced", sent: 1, received: 0 } },
      ),
    );
    await waitFor(() => expect(screen.queryByTestId(`space-row-place-${KEY}`)).toBeNull());
    expect(rowSync().disabled).toBe(false);
    cleanup();

    // A join into a repository with other members says the notice in the
    // picker first, beneath the repository picked, naming where the
    // records go, Cancel focused and Escape keeping; Continue sends the
    // Place with noticed (space-57, space-88).
    commandMock.mockClear();
    commandMock.mockImplementation(answer);
    await renderGroups(placeHome(), { open: false });
    fireEvent.click(placeControl());
    const option = () => screen.getByTestId(`space-pick-repo-${LISTED}`);
    const notice = () => screen.getByTestId(`space-pick-notice-${KEY}`);
    fireEvent.click(option());
    picker = screen.getByTestId(`space-place-${KEY}`);
    expect(picker.contains(notice())).toBe(true);
    expect(option().closest("li")!.contains(notice())).toBe(true);
    expect(notice().textContent).toContain("Records go to workshop/academy-spex at Second Example.");
    expect(notice().textContent).toContain("Every session goes there whole — hidden parts and attachments included");
    expect(notice().textContent).not.toContain("public");
    expect(document.activeElement).toBe(within(notice()).getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByTestId(`space-pick-notice-${KEY}`)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(option()));
    expect(calls("space.place")).toHaveLength(0);
    fireEvent.click(option());
    fireEvent.click(within(notice()).getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(calls("space.place")).toEqual([{ repository: KEY, choice: { kind: "join", instance: SECOND, hostId: "91" }, noticed: true }]),
    );
    await waitFor(() => expect(screen.queryByTestId(`space-place-${KEY}`)).toBeNull());
    cleanup();

    // One whose only member is the account joins at once; where the core
    // still owes the notice, its refusal says it beneath the repository
    // picked instead of a refusal, and Continue sends noticed (space-57).
    commandMock.mockClear();
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type === "space.place" && fields?.noticed !== true) {
        throw new SpexCommandError("invalid_request", "Read the sharing notice before joining academy-spex", {
          notice: true,
          members: 1,
          visibility: "private",
          placement: SECOND,
        });
      }
      return answer(type, fields);
    });
    await renderGroups(placeHome({}, { members: 1 }), { open: false });
    fireEvent.click(placeControl());
    fireEvent.click(option());
    await waitFor(() => expect(calls("space.place")).toEqual([{ repository: KEY, choice: { kind: "join", instance: SECOND, hostId: "91" } }]));
    await screen.findByTestId(`space-pick-notice-${KEY}`);
    expect(within(screen.getByTestId(`space-place-${KEY}`)).queryByRole("alert")).toBeNull();
    expect(notice().textContent).toContain("Records go to workshop/academy-spex at Second Example.");
    fireEvent.click(within(notice()).getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(calls("space.place")[1]).toEqual({ repository: KEY, choice: { kind: "join", instance: SECOND, hostId: "91" }, noticed: true }),
    );
    await waitFor(() => expect(screen.queryByTestId(`space-place-${KEY}`)).toBeNull());
    cleanup();

    // A name the host reports taken is refused in the picker, the field
    // asking for another; Place at… stands again, ready (space-88).
    commandMock.mockClear();
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type === "space.place") throw new SpexCommandError("invalid_request", "academy-spex is taken in workshop; name another");
      return answer(type, fields);
    });
    await renderGroups(placeHome(), { open: false });
    fireEvent.click(placeControl());
    fireEvent.click(screen.getByTestId("space-pick-group-workshop"));
    await waitFor(() =>
      expect(within(screen.getByTestId(`space-place-${KEY}`)).getByRole("alert").textContent).toBe("academy-spex is taken in workshop; name another"),
    );
    expect(document.activeElement).toBe(screen.getByTestId(`space-pick-name-${KEY}`));
    expect(live()).toContain("academy-spex is taken in workshop");
    expect(placeControl().textContent).toBe("Place at…");
    expect(placeControl().disabled).toBe(false);
    cleanup();

    // A Place asked while a sync runs follows it (space-21): Place at…
    // stands ready beside "Syncing…"; another operation holds it.
    commandMock.mockImplementation(answer);
    await renderGroups(placeHome({ sync: { phase: "running", op: "sync", placement: ORIGIN, step: "push", since: NOW, cancelable: true } }), { open: false });
    expect(rowSync().textContent).toBe("Syncing…");
    expect(placeControl().textContent).toBe("Place at…");
    expect(placeControl().disabled).toBe(false);
    cleanup();
    await renderGroups(placeHome({ sync: { phase: "running", op: "check", placement: ORIGIN, step: "check", since: NOW, cancelable: true } }), { open: false });
    expect(placeControl().textContent).toBe("Place at…");
    expect(placeControl().disabled).toBe(true);
  });

  test("space-88: with two instances to offer it opens the choice, each named 'Also place at <display name>'", async () => {
    await renderGroups(withThird(placeHome()), { open: false });
    const control = placeControl();
    // Several offered: the control's words are its name.
    expect(control.textContent).toBe("Place at…");
    expect(control.getAttribute("aria-label")).toBeNull();
    expect(control.getAttribute("title")).toBeNull();
    fireEvent.click(control);
    expect(control.getAttribute("aria-expanded")).toBe("true");
    // The choice stands beneath the row, named by its control, each
    // instance by its display name — its host name before any read —
    // named "Also place at <display name>", focus on the first.
    const choice = screen.getByRole("group", { name: "Place at…" });
    expect(choice.dataset.testid).toBe(`space-place-choice-${KEY}`);
    expect(screen.getByTestId(`space-row-${KEY}`).contains(choice)).toBe(true);
    expect(screen.queryByTestId(`space-place-${KEY}`)).toBeNull();
    const options = within(choice).getAllByTestId(/^space-place-instance-/);
    expect(options.map((option) => option.dataset.testid)).toEqual([`space-place-instance-${SECOND}`, `space-place-instance-${THIRD}`]);
    expect(options.map((option) => option.textContent)).toEqual(["Second Example", "third.example"]);
    for (const attribute of ["aria-label", "title"]) {
      expect(options.map((option) => option.getAttribute(attribute))).toEqual(["Also place at Second Example", "Also place at third.example"]);
    }
    expect(document.activeElement).toBe(options[0]);
    // Escape and Cancel close it, focus back on Place at… (DR-010 §6).
    fireEvent.keyDown(options[0]!, { key: "Escape" });
    expect(screen.queryByTestId(`space-place-choice-${KEY}`)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(control));
    fireEvent.click(control);
    fireEvent.click(screen.getByTestId(`space-place-cancel-${KEY}`));
    expect(screen.queryByTestId(`space-place-choice-${KEY}`)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(control));

    // The instance chosen opens its picker alone, in the choice's place
    // (space-88, space-58).
    fireEvent.click(control);
    fireEvent.click(screen.getByRole("button", { name: "Also place at third.example" }));
    expect(screen.queryByTestId(`space-place-choice-${KEY}`)).toBeNull();
    const picker = screen.getByRole("group", { name: "Also place at third.example" });
    expect(picker.dataset.testid).toBe(`space-place-${KEY}`);
    expect(within(picker).getAllByTestId(/^space-pick-instance-/).map((section) => section.dataset.testid)).toEqual([`space-pick-instance-${THIRD}`]);
    expect(within(picker).queryAllByTestId(/^space-pick-repo-/)).toHaveLength(0);
    expect(within(picker).getAllByTestId(/^space-pick-group-/).map((option) => option.textContent)).toEqual(["jo"]);
    fireEvent.click(within(picker).getByTestId("space-pick-group-@jo"));
    await waitFor(() =>
      expect(calls("space.place")).toEqual([{ repository: KEY, choice: { kind: "create", instance: THIRD, groupId: null, name: "academy" } }]),
    );
    expect(calls("space.sync")).toHaveLength(0);
  });

  test("space-88: none on your own group's own repository, a group's own, a local-only project (Pick a group), a clone holding only its path placement (Pick a group beside Sync, space-61, storage-35), where any held placement's members the person may not manage, nor at an instance listing a held placement's repository", async () => {
    // Your own group's own repository, a group's own, a local-only
    // project and a clone holding only its path placement, beside the
    // project, at the first alone (space-88, space-4).
    const DELTA = "jane/delta-spex";
    const home = placeHome();
    const [first, second] = home.instances;
    const delta = repo({
      key: DELTA,
      name: "delta-spex",
      instance: null,
      governing: null,
      id: null,
      remote: "/Users/jane/backup/delta-spex.git",
      code: "https://github.com/jane/delta.git",
      folder: "/Users/jane/code/delta",
      branch: BRANCH,
      can: MAY,
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
    const acme = repo({ key: ACME, name: "acme-spex", id: "60", remote: "acme/acme-spex", code: null, folder: null, members: 3, can: MAY });
    await renderGroups(
      {
        ...home,
        own: { ...home.own, repositories: [ownRepo({ can: MAY, branch: BRANCH }), gamma, delta] },
        instances: [
          {
            ...first!,
            groups: [{ id: "3", login: null, mine: false, fullPath: "acme", name: "acme", can: NO_CAN, placed: [], repositories: [acme] }, ...first!.groups],
          },
          second!,
        ],
      },
      { open: false },
    );
    expect(placeControl().getAttribute("aria-label")).toBe("Also place at Second Example");
    for (const key of [OWN, ACME, GAMMA, DELTA]) expect(screen.queryByTestId(`space-row-place-${key}`), key).toBeNull();
    // The local-only project picks a group (space-61).
    expect(screen.getByTestId(`space-row-pick-${GAMMA}`).textContent).toBe("Pick a group");
    expect(screen.queryByTestId(`space-row-sync-${GAMMA}`)).toBeNull();
    // The clone holding only its path placement syncs it, and picks a
    // group beside its Sync, the state's control last (space-61,
    // storage-35); its pick offers every signed-in instance, and adds its
    // first placement with an instance.
    const pick = screen.getByTestId(`space-row-pick-${DELTA}`) as HTMLButtonElement;
    expect(pick.textContent).toBe("Pick a group");
    expect(rowSync(DELTA).textContent).toBe("Sync");
    expect(rowSync(DELTA).disabled).toBe(false);
    expect(pick.compareDocumentPosition(rowSync(DELTA)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(pick);
    expect(pick.getAttribute("aria-expanded")).toBe("true");
    let picker = screen.getByTestId(`space-picker-${DELTA}`);
    expect(within(picker).getAllByTestId(/^space-pick-instance-/).map((section) => section.dataset.testid)).toEqual([
      `space-pick-instance-${ORIGIN}`,
      `space-pick-instance-${SECOND}`,
    ]);
    fireEvent.keyDown(picker, { key: "Escape" });
    expect(screen.queryByTestId(`space-picker-${DELTA}`)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(pick));
    fireEvent.click(pick);
    picker = screen.getByTestId(`space-picker-${DELTA}`);
    fireEvent.click(within(within(picker).getByTestId(`space-pick-instance-${SECOND}`)).getByTestId("space-pick-group-workshop"));
    await waitFor(() =>
      expect(calls("space.pick")).toEqual([{ repository: DELTA, choice: { kind: "create", instance: SECOND, groupId: "81", name: "delta" } }]),
    );
    expect(calls("space.place")).toHaveLength(0);
    cleanup();

    // Members the person may not manage at a placement it holds — its
    // only one, or any one of several — offer none, whatever instance
    // stands free (space-88, git-host-5).
    await renderGroups(placeHome({ can: { manageMembers: false, transfer: true } }), { open: false });
    expect(screen.queryByTestId(`space-row-place-${KEY}`)).toBeNull();
    cleanup();
    await renderGroups(
      withThird(
        placeHome({
          placedAt: [ORIGIN, SECOND],
          placements: [
            placement({ can: MAY }),
            placementState({ instance: SECOND, path: "workshop/academy-spex", id: "94", members: 2, branch: BRANCH, can: { manageMembers: false, transfer: false } }),
          ],
        }),
      ),
      { open: false },
    );
    expect(screen.queryByTestId(`space-row-place-${KEY}`)).toBeNull();
    cleanup();

    // An instance whose listing names the row as placed there while the
    // row carries no line there lists a placement the clone holds — one
    // placement both list — and is not offered (space-1, DR-128).
    const shared = (state: GroupsState): GroupsState => ({
      ...state,
      instances: state.instances.map((at) =>
        at.origin !== SECOND
          ? at
          : { ...at, groups: at.groups.map((group) => (group.fullPath === "workshop" ? { ...group, placed: [{ key: KEY, name: "academy-spex" }] } : group)) },
      ),
    });
    await renderGroups(shared(placeHome()), { open: false });
    expect(screen.queryByTestId(`space-row-place-${KEY}`)).toBeNull();
    cleanup();
    await renderGroups(shared(withThird(placeHome())), { open: false });
    expect(placeControl().getAttribute("aria-label")).toBe("Also place at third.example");
    cleanup();

    // A placement a file names, not on this device, is no placement the
    // clone holds there: its instance is offered beside Attach (space-88,
    // space-87); a project placed at every signed-in instance offers none.
    await renderGroups(twoPlacementsHome(), { open: false });
    expect(placeControl(BETA).getAttribute("aria-label")).toBe("Also place at Second Example");
    expect(within(lineOf(BETA, SECOND)).getByTestId("space-line-attach")).toBeTruthy();
    expect(screen.queryByTestId(`space-row-place-${KEY}`)).toBeNull();
  });

  test("space-97, space-64: a creation the host leaves pending reads its waiting phrase on that instance's line", async () => {
    const waiting = { step: "create" as const, group: "workshop", message: "403 Forbidden: you need at least the Maintainer role" };
    const pending = (sync: RepositoryState["sync"]): GroupsState =>
      placeHome({
        sync,
        placements: [
          placement({ can: MAY }),
          placementState({ instance: SECOND, path: "workshop/academy-spex", attached: false, state: "absent", waiting }),
        ],
      });
    // The Place syncs the clone's other placements while its creation
    // waits at the second, its phrase on that line with the host's words
    // in its title, no Attach offered (space-97, space-64, space-87).
    await renderGroups(pending(placeRunning(ORIGIN, "push")), { open: false });
    const line = lineOf(KEY, SECOND);
    expect(line.dataset.attached).toBe("false");
    expect(reading(line)).toEqual({ name: "Second Example", at: "workshop/academy-spex", state: "Waiting for a member who can create it in workshop" });
    expect(phraseOf(KEY, SECOND).getAttribute("title")).toBe(waiting.message);
    expect(within(line).queryByTestId("space-line-attach")).toBeNull();
    expect(reading(lineOf(KEY, ORIGIN)).state).toBe("Pushing…");
    expect(placeControl().textContent).toBe("Placing…");
    // The Place has run: the wait stands on its line, the clone holding
    // no placement there, so Place at… offers the second again.
    deliver(pending({ phase: "done", at: NOW, sent: 1, received: 0, pushed: true }));
    await waitFor(() => expect(placeControl().textContent).toBe("Place at…"));
    expect(reading(lineOf(KEY, SECOND)).state).toBe("Waiting for a member who can create it in workshop");
    expect(placeControl().getAttribute("aria-label")).toBe("Also place at Second Example");
  });

  test.each(["en", "zh"] as const)("space-28: Place at… and Placing… within 14 characters (%s)", async (language) => {
    activateLanguage(language);
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) =>
      type === "space.place" ? new Promise(() => {}) : answer(type, fields),
    );
    await renderGroups(placeHome(), { open: false });
    const control = placeControl();
    const idle = control.textContent ?? "";
    expect(idle).toBe(language === "en" ? "Place at…" : "放到…");
    // Its long name is its title and accessible name (space-28).
    const long = language === "en" ? "Also place at Second Example" : "同时放到 Second Example";
    expect(control.getAttribute("aria-label")).toBe(long);
    expect(control.getAttribute("title")).toBe(long);
    fireEvent.click(control);
    expect(screen.getByTestId(`space-place-${KEY}`).getAttribute("aria-label")).toBe(long);
    fireEvent.click(screen.getByTestId("space-pick-group-workshop"));
    await waitFor(() => expect(control.textContent).toBe(language === "en" ? "Placing…" : "放置中…"));
    for (const label of [idle, control.textContent ?? ""]) expect(label.length, `"${label}"`).toBeLessThanOrEqual(14);
    // Busy, its words are its name.
    expect(control.getAttribute("aria-label")).toBeNull();
    expect(control.className.split(/\s+/)).toContain("whitespace-nowrap");
    // Below @xs the row's controls wrap beneath its name (space-28,
    // DR-041).
    const top = screen.getByTestId(`space-repo-${KEY}`).parentElement!;
    for (const token of ["flex-wrap", "@xs:flex-nowrap"]) expect(top.className.split(/\s+/)).toContain(token);
  });
});

/** The Leave running its step at a placement (space-98). */
const leaveRunning = (placement: string): RepositoryState["sync"] => ({
  phase: "running",
  op: "leave",
  placement,
  step: "check",
  since: NOW,
  cancelable: false,
});

/** A Leave stopped before anything was removed (space-98): `unreceived`
 * naming the count of units no remaining placement received, else the
 * cause its read of the placement stopped in. */
const leaveStopped = (cause: "unreceived" | "unreachable" | "reauth" | "lease", count?: number): RepositoryState["sync"] => ({
  phase: "stopped",
  op: "leave",
  step: "check",
  cause,
  message:
    cause === "unreceived"
      ? `${count} records have reached no other placement`
      : cause === "lease"
        ? "“Fix the login redirect” is in use"
        : "Records pushed to Spex Example since the last sync may be left behind",
  guidance: cause === "lease" ? "Close it there, then Retry." : "Confirm to remove it anyway.",
  retry: true,
  ...(cause === "unreceived" ? { count } : {}),
});

const leaveControl = (key = KEY): HTMLButtonElement => screen.getByTestId(`space-row-leave-${key}`) as HTMLButtonElement;
const leaveConfirm = (key = KEY): HTMLElement => screen.getByTestId(`space-leave-confirm-${key}`);

/** The opened project, at the second alone in its `workshop` — where
 * the first placement's Leave moves its clone (storage-38) — or, with
 * no placement left, local only under your own group's folder; its
 * folder kept either way. */
const MOVED = "@second.example/workshop/academy-spex";
function movedHome(where: "second" | "own", sync: RepositoryState["sync"] = { phase: "idle" }): GroupsState {
  const home = twoInstances({}, []);
  const [first, second] = home.instances;
  if (where === "own") {
    const local = repo({
      key: "jane/academy-spex",
      instance: null,
      id: null,
      remote: null,
      state: "local-only",
      branch: null,
      members: null,
      visibility: null,
      placements: [],
      sync,
    });
    return { ...home, own: { ...home.own, repositories: [...home.own.repositories, local] } };
  }
  const moved = repo({
    key: MOVED,
    instance: SECOND,
    governing: SECOND,
    id: "52",
    remote: "workshop/academy-spex",
    placedAt: [SECOND],
    sync,
    placements: [placement({ instance: SECOND, path: "workshop/academy-spex", id: "52", members: 2, branch: { ...BRANCH, ahead: 0, behind: 0 } })],
  });
  return {
    ...home,
    instances: [
      first!,
      {
        ...second!,
        groups: [{ id: "81", login: null, mine: false, fullPath: "workshop", name: "Workshop", can: NO_CAN, placed: [], repositories: [moved] }, ...second!.groups],
      },
    ],
  };
}

describe("GROUPS: leaving one placement (space-89, space-98, storage-38, space-28)", () => {
  test("space-89: Leave… on the project at one instance, titled and named 'Remove from Spex Example', asks inline with Keep focused, Escape keeping; Remove sends space.leave {repository, instance} and reads 'Leaving…'", async () => {
    let settle: ((value: unknown) => void) | undefined;
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type !== "space.leave") return answer(type, fields);
      return new Promise((resolve) => {
        settle = resolve;
      });
    });
    await renderGroups(base(), { open: false });
    const row = screen.getByTestId(`space-row-${KEY}`);
    const control = leaveControl();
    // One placement at an instance held: the control names it in full,
    // as its title and accessible name, its label within the row's
    // budget (space-89, space-28).
    expect(control.textContent).toBe("Leave…");
    expect(control.getAttribute("title")).toBe("Remove from Spex Example");
    expect(within(row).getByRole("button", { name: "Remove from Spex Example" })).toBe(control);
    // On the row, never a line, before the state's control (DR-041).
    expect(within(screen.getByTestId(`space-lines-${KEY}`)).queryByTestId(`space-row-leave-${KEY}`)).toBeNull();
    expect(control.compareDocumentPosition(rowSync()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // It asks inline beneath the row, Keep focused: nothing at the
    // instance changes (space-89, DR-010 §4).
    fireEvent.click(control);
    expect(control.getAttribute("aria-expanded")).toBe("true");
    expect(row.contains(leaveConfirm())).toBe(true);
    expect(leaveConfirm().dataset.stage).toBe("first");
    expect(leaveConfirm().textContent).toContain("Remove from Spex Example? Nothing at Spex Example changes; these records stop syncing there.");
    expect(document.activeElement).toBe(within(leaveConfirm()).getByRole("button", { name: "Keep" }));
    // Escape and Keep send nothing, focus back on Leave… (DR-010 §6).
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByTestId(`space-leave-confirm-${KEY}`)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(control));
    expect(control.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(control);
    fireEvent.click(within(leaveConfirm()).getByRole("button", { name: "Keep" }));
    expect(screen.queryByTestId(`space-leave-confirm-${KEY}`)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(control));
    expect(calls("space.leave")).toHaveLength(0);

    // Remove sends space.leave naming that placement's instance, and
    // Leave… reads "Leaving…" from then, Sync keeping its word, waiting
    // (space-89, space-98).
    fireEvent.click(control);
    fireEvent.click(within(leaveConfirm()).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(calls("space.leave")).toEqual([{ repository: KEY, instance: ORIGIN }]));
    expect(screen.queryByTestId(`space-leave-confirm-${KEY}`)).toBeNull();
    expect(control.textContent).toBe("Leaving…");
    expect(control.disabled).toBe(true);
    expect(control.getAttribute("aria-label")).toBeNull();
    expect(rowSync().textContent).toBe("Sync");
    expect(rowSync().disabled).toBe(true);
    // Closing never strands focus: Leave… busy, it lands on the row
    // (DR-010 §6).
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId(`space-repo-${KEY}`)));
    settle!({ accepted: true });
    // The Leave runs, its step on its placement's line, Leave… busy and
    // Sync keeping its word (space-12, space-21).
    deliver(base({}, [repo({ sync: leaveRunning(ORIGIN) })]));
    await waitFor(() => expect(reading(lineOf(KEY, ORIGIN)).state).toBe("Checking host…"));
    expect(leaveControl().textContent).toBe("Leaving…");
    expect(leaveControl().disabled).toBe(true);
    expect(rowSync().textContent).toBe("Sync");
    expect(rowSync().disabled).toBe(true);
    cleanup();

    // A Leave asked while a sync runs follows it (space-21): Leave…
    // stands ready beside "Syncing…"; another operation holds it.
    commandMock.mockImplementation(answer);
    await renderGroups(base({}, [repo({ sync: { phase: "running", op: "sync", placement: ORIGIN, step: "push", since: NOW, cancelable: true } })]), {
      open: false,
    });
    expect(rowSync().textContent).toBe("Syncing…");
    expect(leaveControl().textContent).toBe("Leave…");
    expect(leaveControl().disabled).toBe(false);
    cleanup();
    await renderGroups(base({}, [repo({ sync: { phase: "running", op: "check", placement: ORIGIN, step: "check", since: NOW, cancelable: true } })]), {
      open: false,
    });
    expect(leaveControl().disabled).toBe(true);
    cleanup();

    // A refusal stands beside the row, Leave… ready again.
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type === "space.leave") throw new SpexCommandError("invalid_request", "academy-spex holds no placement at Spex Example");
      return answer(type, fields);
    });
    await renderGroups(base(), { open: false });
    fireEvent.click(leaveControl());
    fireEvent.click(within(leaveConfirm()).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(screen.getByTestId(`space-row-caption-${KEY}`).textContent).toBe("academy-spex holds no placement at Spex Example"));
    expect(screen.getByTestId(`space-row-caption-${KEY}`).getAttribute("role")).toBe("alert");
    expect(live()).toBe("academy-spex holds no placement at Spex Example");
    expect(leaveControl().textContent).toBe("Leave…");
    expect(leaveControl().disabled).toBe(false);
  });

  test("space-89: on the placed project it opens the choice, each named 'Remove from <display name>'", async () => {
    await renderGroups(twoPlacementsHome(), { open: false });
    const control = leaveControl();
    // Several held: the control's words are its name.
    expect(control.textContent).toBe("Leave…");
    expect(control.getAttribute("aria-label")).toBeNull();
    expect(control.getAttribute("title")).toBeNull();
    fireEvent.click(control);
    expect(control.getAttribute("aria-expanded")).toBe("true");
    // The choice stands beneath the row, named by its control, each
    // placement by its instance's display name and its path there,
    // named "Remove from <display name>", focus on the first.
    const choice = screen.getByRole("group", { name: "Leave…" });
    expect(choice.dataset.testid).toBe(`space-leave-choice-${KEY}`);
    expect(screen.getByTestId(`space-row-${KEY}`).contains(choice)).toBe(true);
    expect(screen.queryByTestId(`space-leave-confirm-${KEY}`)).toBeNull();
    const options = within(choice).getAllByTestId(/^space-leave-instance-/);
    expect(options.map((option) => option.dataset.testid)).toEqual([`space-leave-instance-${ORIGIN}`, `space-leave-instance-${SECOND}`]);
    expect(options.map((option) => option.textContent)).toEqual(["Spex Examplejane/academy-spex", "Second Exampleworkshop/academy-spex"]);
    for (const attribute of ["aria-label", "title"]) {
      expect(options.map((option) => option.getAttribute(attribute))).toEqual(["Remove from Spex Example", "Remove from Second Example"]);
    }
    expect(document.activeElement).toBe(options[0]);
    // Escape and Cancel close it, focus back on Leave… (DR-010 §6).
    fireEvent.keyDown(options[0]!, { key: "Escape" });
    expect(screen.queryByTestId(`space-leave-choice-${KEY}`)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(control));
    fireEvent.click(control);
    fireEvent.click(screen.getByTestId(`space-leave-cancel-${KEY}`));
    expect(screen.queryByTestId(`space-leave-choice-${KEY}`)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(control));

    // The placement chosen is asked about in the choice's place, and
    // Remove names its instance (space-89).
    fireEvent.click(control);
    fireEvent.click(screen.getByRole("button", { name: "Remove from Second Example" }));
    expect(screen.queryByTestId(`space-leave-choice-${KEY}`)).toBeNull();
    expect(leaveConfirm().textContent).toContain("Remove from Second Example? Nothing at Second Example changes; these records stop syncing there.");
    expect(document.activeElement).toBe(within(leaveConfirm()).getByRole("button", { name: "Keep" }));
    fireEvent.click(within(leaveConfirm()).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(calls("space.leave")).toEqual([{ repository: KEY, instance: SECOND }]));
    expect(calls("space.sync")).toHaveLength(0);
  });

  test("space-89, space-98: a leave stopped for unreceived records asks again naming the count, its Remove sending confirmed; one stopped for a placement it could not read says records pushed there since the last sync may be left behind", async () => {
    await renderGroups(base(), { open: false });
    fireEvent.click(leaveControl());
    fireEvent.click(within(leaveConfirm()).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(calls("space.leave")).toEqual([{ repository: KEY, instance: ORIGIN }]));
    // The Leave runs, then stops for three units no remaining placement
    // received: it asks again in place, naming the count, Keep focused
    // (space-89, space-98).
    deliver(base({}, [repo({ sync: leaveRunning(ORIGIN) })]));
    await waitFor(() => expect(leaveControl().textContent).toBe("Leaving…"));
    deliver(base({}, [repo({ sync: leaveStopped("unreceived", 3) })]));
    await waitFor(() => expect(leaveConfirm().dataset.stage).toBe("unreceived"));
    expect(leaveConfirm().textContent).toContain("3 units have reached no other instance yet. Remove from Spex Example anyway?");
    expect(document.activeElement).toBe(within(leaveConfirm()).getByRole("button", { name: "Keep" }));
    expect(leaveControl().textContent).toBe("Leave…");
    expect(leaveControl().getAttribute("aria-expanded")).toBe("true");
    expect(screen.queryByTestId(`space-row-caption-${KEY}`)).toBeNull();
    // Keep keeps it, its stop standing on the row, the guidance in its
    // title, Leave… described by it (space-15); while the stop stands,
    // Leave… asks the same again.
    fireEvent.click(within(leaveConfirm()).getByRole("button", { name: "Keep" }));
    expect(screen.queryByTestId(`space-leave-confirm-${KEY}`)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(leaveControl()));
    const caption = screen.getByTestId(`space-row-caption-${KEY}`);
    expect(caption.textContent).toBe("Check stopped — 3 records have reached no other placement");
    expect(caption.getAttribute("title")).toBe("Confirm to remove it anyway.");
    expect(leaveControl().getAttribute("aria-describedby")).toBe(`space-row-caption-${KEY}`);
    expect(calls("space.leave")).toHaveLength(1);
    fireEvent.click(leaveControl());
    expect(leaveConfirm().dataset.stage).toBe("unreceived");
    // Its Remove sends the Leave confirmed (space-98).
    fireEvent.click(within(leaveConfirm()).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(calls("space.leave")[1]).toEqual({ repository: KEY, instance: ORIGIN, confirmed: true }));
    // A confirmed Leave stopped again reads as its own stop: nothing
    // asks again (space-15).
    deliver(base({}, [repo({ sync: leaveRunning(ORIGIN) })]));
    deliver(base({}, [repo({ sync: leaveStopped("lease") })]));
    await waitFor(() => expect(leaveControl().textContent).toBe("Leave…"));
    expect(screen.queryByTestId(`space-leave-confirm-${KEY}`)).toBeNull();
    fireEvent.click(leaveControl());
    expect(leaveConfirm().dataset.stage).toBe("first");
    cleanup();

    // One unit, in the singular.
    installClient();
    await renderGroups(base(), { open: false });
    fireEvent.click(leaveControl());
    fireEvent.click(within(leaveConfirm()).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(calls("space.leave")).toHaveLength(1));
    deliver(base({}, [repo({ sync: leaveRunning(ORIGIN) })]));
    deliver(base({}, [repo({ sync: leaveStopped("unreceived", 1) })]));
    await waitFor(() => expect(leaveConfirm().textContent).toContain("1 unit has reached no other instance yet. Remove from Spex Example anyway?"));
    cleanup();

    // One stopped at the read of a placement it could not read says that
    // records pushed there since the last sync may be left behind, its
    // Remove sending confirmed (space-89, space-98).
    installClient();
    await renderGroups(placedAtTwo(), { open: false });
    fireEvent.click(leaveControl());
    fireEvent.click(screen.getByRole("button", { name: "Remove from Spex Example" }));
    fireEvent.click(within(leaveConfirm()).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(calls("space.leave")).toEqual([{ repository: KEY, instance: ORIGIN }]));
    deliver(placedAtTwo({}, { sync: leaveRunning(ORIGIN) }));
    deliver(placedAtTwo({}, { sync: leaveStopped("unreachable") }));
    await waitFor(() => expect(leaveConfirm().dataset.stage).toBe("unread"));
    expect(leaveConfirm().textContent).toContain("Records pushed to Spex Example since the last sync may be left behind. Remove anyway?");
    expect(document.activeElement).toBe(within(leaveConfirm()).getByRole("button", { name: "Keep" }));
    fireEvent.click(within(leaveConfirm()).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(calls("space.leave")[1]).toEqual({ repository: KEY, instance: ORIGIN, confirmed: true }));
    cleanup();

    // The stop is that placement's alone: the other placement's Leave
    // asks the first confirm (space-89).
    installClient();
    await renderGroups(placedAtTwo(), { open: false });
    fireEvent.click(leaveControl());
    fireEvent.click(screen.getByRole("button", { name: "Remove from Spex Example" }));
    fireEvent.click(within(leaveConfirm()).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(calls("space.leave")).toHaveLength(1));
    deliver(placedAtTwo({}, { sync: leaveRunning(ORIGIN) }));
    deliver(placedAtTwo({}, { sync: leaveStopped("reauth") }));
    await waitFor(() => expect(leaveConfirm().dataset.stage).toBe("unread"));
    fireEvent.click(within(leaveConfirm()).getByRole("button", { name: "Keep" }));
    fireEvent.click(leaveControl());
    fireEvent.click(screen.getByRole("button", { name: "Remove from Second Example" }));
    expect(leaveConfirm().dataset.stage).toBe("first");
    cleanup();

    // A stopped Leave this page did not ask — another page's, or before
    // a reload — asks the first confirm (space-30).
    installClient();
    await renderGroups(base({}, [repo({ sync: leaveStopped("unreceived", 3) })]), { open: false });
    expect(screen.queryByTestId(`space-leave-confirm-${KEY}`)).toBeNull();
    fireEvent.click(leaveControl());
    expect(leaveConfirm().dataset.stage).toBe("first");
  });

  test("space-15, space-89: the stopped card's Retry sends a stopped Leave again as this page asked it, and offers none with no memory of it; a Place or an Attach stopped in its sync syncs again", async () => {
    await renderGroups(base());
    fireEvent.click(leaveControl());
    fireEvent.click(within(leaveConfirm()).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(calls("space.leave")).toHaveLength(1));
    deliver(base({}, [repo({ sync: leaveRunning(ORIGIN) })]));
    deliver(base({}, [repo({ sync: leaveStopped("unreceived", 2) })]));
    // The Sync tab's card reads the stop, its Retry sending the same
    // Leave again (space-15, space-89).
    await waitFor(() => expect(screen.getByTestId("space-stopped-title").textContent).toBe("Check stopped — 2 records have reached no other placement"));
    fireEvent.click(within(leaveConfirm()).getByRole("button", { name: "Keep" }));
    fireEvent.click(screen.getByTestId("space-retry"));
    await waitFor(() => expect(calls("space.leave")[1]).toEqual({ repository: KEY, instance: ORIGIN }));
    expect(calls("space.sync")).toHaveLength(0);
    // Confirmed, it is sent again confirmed.
    fireEvent.click(leaveControl());
    fireEvent.click(within(leaveConfirm()).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(calls("space.leave")[2]).toEqual({ repository: KEY, instance: ORIGIN, confirmed: true }));
    deliver(base({}, [repo({ sync: leaveRunning(ORIGIN) })]));
    deliver(base({}, [repo({ sync: leaveStopped("lease") })]));
    await waitFor(() => expect(screen.getByTestId("space-retry").textContent).toBe("Retry"));
    fireEvent.click(screen.getByTestId("space-retry"));
    await waitFor(() => expect(calls("space.leave")[3]).toEqual({ repository: KEY, instance: ORIGIN, confirmed: true }));
    cleanup();

    // With no memory of the Leave, no Retry: Leave… stands, the stop
    // read on its row until Dismiss (space-30, space-15).
    installClient();
    await renderGroups(base({}, [repo({ sync: leaveStopped("lease") })]));
    expect(screen.getByTestId("space-stopped").textContent).toContain("Check stopped — “Fix the login redirect” is in use");
    expect(screen.queryByTestId("space-retry")).toBeNull();
    expect(leaveControl().disabled).toBe(false);
    expect(screen.getByTestId(`space-row-caption-${KEY}`).textContent).toBe("Check stopped — “Fix the login redirect” is in use");
    fireEvent.click(screen.getByTestId("space-dismiss"));
    expect(screen.queryByTestId(`space-row-caption-${KEY}`)).toBeNull();
    expect(leaveControl().getAttribute("aria-describedby")).toBeNull();
    cleanup();

    // A Place or an Attach stops only in the sync after its add: Retry
    // syncs (space-97, space-99, space-15).
    for (const op of ["place", "attach"] as const) {
      installClient();
      await renderGroups(
        placedAtTwo({}, { sync: { phase: "stopped", op, step: "push", cause: "unreachable", message: "Could not reach Second Example", guidance: "Check the network, then Retry.", retry: true } }),
      );
      fireEvent.click(screen.getByTestId("space-retry"));
      await waitFor(() => expect(calls("space.sync"), op).toEqual([{ repository: KEY }]));
      expect(calls("space.place")).toHaveLength(0);
      expect(calls("space.attach")).toHaveLength(0);
      cleanup();
    }
  });

  test("space-89: none on your own group's own repository, a group's own, a local-only project, or a clone holding only its path placement", async () => {
    // The space-95 home: your own group's own placed at both, a group's
    // own, a local-only project; the project at the first alone whose
    // file names a repository the second lists holds one placement, so
    // Leave… names it (space-89, space-87).
    await renderGroups(twoPlacementsHome(), { open: false });
    for (const key of [OWN, ACME, GAMMA]) expect(screen.queryByTestId(`space-row-leave-${key}`), key).toBeNull();
    expect(leaveControl(BETA).getAttribute("aria-label")).toBe("Remove from Spex Example");
    expect(leaveControl().getAttribute("aria-label")).toBeNull();
    cleanup();

    // A clone holding only its path placement leaves it by naming no
    // remote, never here (space-89, space-5).
    await renderGroups(
      base({}, [repo({ instance: null, governing: null, id: null, remote: "/Users/jane/backup/academy-spex.git", branch: BRANCH })]),
      { open: false },
    );
    expect(rowSync().textContent).toBe("Sync");
    expect(screen.queryByTestId(`space-row-leave-${KEY}`)).toBeNull();
    cleanup();

    // Placed at an instance and a path, only the instance is offered.
    await renderGroups(
      base({}, [
        repo({
          placements: [placement(), placementState({ path: "/Users/jane/backup/academy-spex.git", branch: BRANCH })],
        }),
      ]),
      { open: false },
    );
    expect(leaveControl().getAttribute("aria-label")).toBe("Remove from Spex Example");
  });

  test("space-89: the live note says 'Removed from <display name>'; a first placement's leave keeps the opened row by its folder", async () => {
    // The second placement left: its line goes, the live note says so,
    // and focus goes back to Leave…, which still offers the first
    // (space-89, DR-010 §6, §7).
    await renderGroups(placedAtTwo());
    fireEvent.click(leaveControl());
    fireEvent.click(screen.getByRole("button", { name: "Remove from Second Example" }));
    fireEvent.click(within(leaveConfirm()).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(calls("space.leave")).toEqual([{ repository: KEY, instance: SECOND }]));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId(`space-repo-${KEY}`)));
    deliver(placedAtTwo({}, { sync: leaveRunning(SECOND) }));
    await waitFor(() => expect(live()).toBe("Checking host…"));
    deliver(twoInstances({}, [repo({ placedAt: [ORIGIN], lastSync: { at: NOW - 5 * MIN, sent: 1, received: 0 } })]));
    await waitFor(() => expect(live()).toBe("Removed from Second Example"));
    expect(screen.queryByTestId(`space-line-${SECOND}`)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(leaveControl()));
    expect(leaveControl().getAttribute("aria-label")).toBe("Remove from Spex Example");
    cleanup();

    // The first placement left: the clone moves to the second's path,
    // the opened row followed by its folder, its tabs still open
    // beneath the list, and focus on its Leave… (storage-38, space-89).
    installClient();
    await renderGroups(placedAtTwo());
    expect(screen.getByTestId("space-repository").getAttribute("aria-label")).toBe("academy-spex");
    fireEvent.click(leaveControl());
    fireEvent.click(screen.getByRole("button", { name: "Remove from Spex Example" }));
    fireEvent.click(within(leaveConfirm()).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(calls("space.leave")).toEqual([{ repository: KEY, instance: ORIGIN }]));
    deliver(placedAtTwo({}, { sync: leaveRunning(ORIGIN) }));
    deliver(movedHome("second"));
    await waitFor(() => expect(live()).toBe("Removed from Spex Example"));
    expect(screen.queryByTestId(`space-row-${KEY}`)).toBeNull();
    const moved = screen.getByTestId(`space-repo-${MOVED}`);
    expect(moved.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("space-repository").getAttribute("aria-label")).toBe("academy-spex");
    expect(screen.getByTestId("space-repository-folder").textContent).toBe("~/code/academy");
    await waitFor(() => expect(document.activeElement).toBe(leaveControl(MOVED)));
    expect(leaveControl(MOVED).getAttribute("aria-label")).toBe("Remove from Second Example");

    // The last one left: the clone stands under your own group, local
    // only, still open, with Pick a group (storage-38, space-61).
    fireEvent.click(leaveControl(MOVED));
    fireEvent.click(within(leaveConfirm(MOVED)).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(calls("space.leave")[1]).toEqual({ repository: MOVED, instance: SECOND }));
    deliver(movedHome("second", leaveRunning(SECOND)));
    deliver(movedHome("own"));
    await waitFor(() => expect(live()).toBe("Removed from Second Example"));
    expect(screen.getByTestId("space-repo-jane/academy-spex").getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("space-repo-state-jane/academy-spex").textContent).toBe("On this device only");
    expect(screen.queryByTestId("space-row-leave-jane/academy-spex")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("space-row-pick-jane/academy-spex")));
  });

  test("space-89, storage-38: a first placement's Leave while the left instance still lists that host repository keeps the opened row, its tabs and focus on the moved clone, not on the row of no clone the listing stands under the former key", async () => {
    // The left instance's listing, read again: a row of no clone under
    // the former key, in the namespace the clone stood in.
    const former = repo({ folder: null, state: "absent", branch: null, placedAt: [] });
    const withFormer = (home: GroupsState): GroupsState => ({
      ...home,
      instances: home.instances.map((at) =>
        at.origin !== ORIGIN
          ? at
          : { ...at, groups: at.groups.map((group) => (group.mine ? { ...group, repositories: [...group.repositories, former] } : group)) },
      ),
    });
    await renderGroups(placedAtTwo());
    expect(screen.getByTestId(`space-repo-${KEY}`).getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(leaveControl());
    fireEvent.click(screen.getByRole("button", { name: "Remove from Spex Example" }));
    fireEvent.click(within(leaveConfirm()).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(calls("space.leave")).toEqual([{ repository: KEY, instance: ORIGIN }]));
    deliver(placedAtTwo({}, { sync: leaveRunning(ORIGIN) }));
    deliver(withFormer(movedHome("second")));
    await waitFor(() => expect(live()).toBe("Removed from Spex Example"));
    // The former key's row stands, not on this device and closed; the
    // moved clone's row is the one open, its tabs beneath the list
    // reading its folder, and focus on its Leave… (storage-38, space-89).
    await waitFor(() => expect(screen.getByTestId(`space-repo-${MOVED}`).getAttribute("aria-expanded")).toBe("true"));
    expect(screen.getByTestId(`space-row-${KEY}`).dataset.state).toBe("absent");
    expect(screen.getByTestId(`space-repo-${KEY}`).getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByTestId("space-repository").getAttribute("aria-label")).toBe("academy-spex");
    expect(screen.getByTestId("space-repository-folder").textContent).toBe("~/code/academy");
    expect(screen.getByTestId("space-tab-sync").getAttribute("aria-selected")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(leaveControl(MOVED)));
  });

  test("space-98, space-89: a Leave that only followed its placement to another signed-in instance listing it says nothing was removed, focus going back to Leave…; a Leave dropping it says so", async () => {
    // The second signed out; the third, signed in, lists the placement's
    // host repository in its workshop.
    const third = instance({
      origin: THIRD,
      host: "third.example",
      displayName: "Third Example",
      account: { id: "80", login: "tess", displayName: null, canCreateGroup: false },
      groups: [
        namespace("tess"),
        { id: "93", login: null, mine: false, fullPath: "workshop", name: "workshop", can: NO_CAN, placed: [{ key: KEY, name: "academy-spex" }], repositories: [] },
      ],
    });
    const withThird = (state: GroupsState): GroupsState => ({ ...state, instances: [...state.instances, third] });
    await renderGroups(withThird(signedOutAt(SECOND, {}, placedAtTwo())));
    fireEvent.click(leaveControl());
    fireEvent.click(screen.getByRole("button", { name: "Remove from Second Example" }));
    fireEvent.click(within(leaveConfirm()).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(calls("space.leave")).toEqual([{ repository: KEY, instance: SECOND }]));
    deliver(withThird(signedOutAt(SECOND, {}, placedAtTwo({}, { sync: leaveRunning(SECOND) }))));
    await waitFor(() => expect(live()).toBe("Checking host…"));
    // Followed: the remote renamed to the third's, its file rewritten —
    // the same host repository, now on the third's line (space-98).
    const followed = repo({
      placedAt: [ORIGIN, THIRD],
      lastSync: { at: NOW - 5 * MIN, sent: 1, received: 0 },
      placements: [
        placement({ lastSync: { at: NOW - 5 * MIN, sent: 1, received: 0 } }),
        placementState({
          instance: THIRD,
          path: "workshop/academy-spex",
          id: "52",
          members: 2,
          visibility: "private",
          noticed: true,
          branch: { ...BRANCH, ahead: 0, behind: 0 },
          lastSync: { at: NOW - HOUR, sent: 0, received: 1 },
        }),
      ],
    });
    deliver(withThird(signedOutAt(SECOND, {}, twoInstances({}, [followed]))));
    await waitFor(() => expect(reading(lineOf(KEY, THIRD)).name).toBe("Third Example"));
    expect(screen.queryByTestId(`space-line-${SECOND}`)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(leaveControl()));
    expect(live()).not.toContain("Removed from");

    // Leaving the third drops it: the note says so.
    fireEvent.click(leaveControl());
    fireEvent.click(screen.getByRole("button", { name: "Remove from Third Example" }));
    fireEvent.click(within(leaveConfirm()).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(calls("space.leave")[1]).toEqual({ repository: KEY, instance: THIRD }));
    deliver(withThird(signedOutAt(SECOND, {}, twoInstances({}, [{ ...followed, sync: leaveRunning(THIRD) }]))));
    deliver(withThird(signedOutAt(SECOND, {}, twoInstances({}, [repo({ placedAt: [ORIGIN], lastSync: { at: NOW - 5 * MIN, sent: 1, received: 0 } })]))));
    await waitFor(() => expect(live()).toBe("Removed from Third Example"));
  });

  test.each(["en", "zh"] as const)("space-28: Leave… and Leaving… within 14 characters (%s)", async (language) => {
    activateLanguage(language);
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) =>
      type === "space.leave" ? new Promise(() => {}) : answer(type, fields),
    );
    await renderGroups(base(), { open: false });
    const control = leaveControl();
    const idle = control.textContent ?? "";
    expect(idle).toBe(language === "en" ? "Leave…" : "移除…");
    // Its long name is its title and accessible name (space-28).
    const long = language === "en" ? "Remove from Spex Example" : "从 Spex Example 移除";
    expect(control.getAttribute("aria-label")).toBe(long);
    expect(control.getAttribute("title")).toBe(long);
    fireEvent.click(control);
    expect(leaveConfirm().textContent).toContain(
      language === "en"
        ? "Remove from Spex Example? Nothing at Spex Example changes; these records stop syncing there."
        : "要从 Spex Example 移除吗？Spex Example 上的内容不会改变；这些记录将不再同步到那里。",
    );
    fireEvent.click(within(leaveConfirm()).getByRole("button", { name: language === "en" ? "Remove" : "移除" }));
    await waitFor(() => expect(control.textContent).toBe(language === "en" ? "Leaving…" : "移除中…"));
    for (const label of [idle, control.textContent ?? ""]) expect(label.length, `"${label}"`).toBeLessThanOrEqual(14);
    // Busy, its words are its name.
    expect(control.getAttribute("aria-label")).toBeNull();
    expect(control.className.split(/\s+/)).toContain("whitespace-nowrap");
  });
});

describe("GROUPS: a row's line in each group placing it (space-1, space-77)", () => {
  /** The space-95 home with the opened project standing under the
   * first's `acme`, a group whose name and path differ, where the host
   * moved it, and the second's `workshop` letting the person delete it:
   * its listing holds that project's second placement and the
   * repository the other project's file names there, and no row of its
   * own (space-1). */
  function placingHome(workshopPlaced?: GroupsState["instances"][number]["groups"][number]["placed"]): GroupsState {
    const home = twoPlacementsHome();
    const [first, second] = home.instances;
    const academy = first!.groups.find((entry) => entry.mine)!.repositories.find((row) => row.key === KEY)!;
    return {
      ...home,
      instances: [
        {
          ...first!,
          groups: first!.groups.map((entry) =>
            entry.fullPath === "acme"
              ? { ...entry, repositories: [...entry.repositories, academy] }
              : entry.mine
                ? { ...entry, repositories: entry.repositories.filter((row) => row.key !== KEY) }
                : entry,
          ),
        },
        {
          ...second!,
          groups: second!.groups.map((entry) =>
            entry.fullPath === "workshop"
              ? { ...entry, can: { ...NO_CAN, delete: true }, placed: workshopPlaced ?? entry.placed }
              : entry,
          ),
        },
      ],
    };
  }

  /** What an entry lists, in order: its rows, then its placed lines. */
  const itemsOf = (entry: HTMLElement): string[] =>
    Array.from(entry.querySelector(":scope > ul")?.children ?? []).map((item) => (item as HTMLElement).dataset.testid ?? "");

  test.each(["en", "zh"] as const)(
    "space-1: the second's group holding a placement shows one line naming the row and the group it stands under, with no control, and carries no Delete; a namespace listing your own group's own repository names your own group (%s)",
    async (language) => {
      activateLanguage(language);
      const words =
        language === "en"
          ? {
              under: (name: string, group: string, at: string) => `${name} stands under ${group} at ${at}`,
              own: (name: string) => `${name} stands under your own group`,
              empty: "No spex repositories here yet",
              delete: "Delete",
              confirm: "Delete workshop?",
            }
          : {
              under: (name: string, group: string, at: string) => `${name} 位于 ${at} 的 ${group} 下`,
              own: (name: string) => `${name} 位于你自己的群组下`,
              empty: "这里还没有 spex 仓库",
              delete: "删除",
              confirm: "要删除 workshop 吗？",
            };
      await renderGroups(placingHome(), { open: false });
      const first = screen.getByTestId(`space-instance-${ORIGIN}`);
      const second = screen.getByTestId(`space-instance-${SECOND}`);
      const workshop = within(second).getByTestId("space-group-workshop");

      // The second's workshop lists one line per row one of whose
      // placements it holds, naming the row and the group it stands
      // under, as the list heads it — a group by its name, its path
      // beside it where the two differ, a login by itself — at that
      // group's instance by its display name.
      expect(itemsOf(workshop)).toEqual([`space-placed-${KEY}`, `space-placed-${BETA}`]);
      expect(within(workshop).getByTestId(`space-placed-${KEY}`).textContent).toBe(words.under("academy-spex", "Acme · acme", "Spex Example"));
      expect(within(workshop).getByTestId(`space-placed-${BETA}`).textContent).toBe(words.under("beta-spex", "jane", "Spex Example"));
      // Each in the secondary tone, whole in its title, with no control
      // and no link (space-1, DR-120).
      for (const id of itemsOf(workshop)) {
        const line = within(workshop).getByTestId(id);
        expect(line.className).toContain("text-neutral-500");
        expect(line.getAttribute("title")).toBe(line.textContent);
        expect(within(line).queryAllByRole("button")).toEqual([]);
        expect(line.querySelector("a")).toBeNull();
      }
      // The rows stand only where they stand: the opened project under
      // the first's acme, after the group's own.
      expect(within(second).queryByTestId(`space-row-${KEY}`)).toBeNull();
      expect(within(second).queryByTestId(`space-row-${BETA}`)).toBeNull();
      expect(itemsOf(within(first).getByTestId("space-group-acme"))).toEqual([`space-row-${ACME}`, `space-row-${KEY}`]);
      // The workshop holds a placement, so it carries no Delete though
      // the host lets the person delete it, and does not read empty.
      expect(within(workshop).queryByTestId("space-group-delete-workshop")).toBeNull();
      expect(within(workshop).queryByText(words.empty)).toBeNull();

      // A namespace listing your own group's own repository names your
      // own group, after that namespace's own rows.
      const jada = within(second).getByTestId("space-group-@jada");
      expect(itemsOf(jada)).toEqual([`space-placed-${OWN}`]);
      expect(within(jada).getByTestId(`space-placed-${OWN}`).textContent).toBe(words.own("jane-spex"));
      expect(within(jada).queryByText(words.empty)).toBeNull();
      const jane = within(first).getByTestId("space-group-@jane");
      expect(itemsOf(jane)).toEqual([`space-row-${BETA}`, `space-placed-${OWN}`]);
      expect(within(jane).getByTestId(`space-placed-${OWN}`).textContent).toBe(words.own("jane-spex"));
      // Your own group's section carries no such line: its rows stand
      // there.
      expect(within(screen.getByTestId("space-own")).queryAllByTestId(/^space-placed-/)).toEqual([]);

      // Once the workshop's listing holds no placement, it reads empty
      // and Delete stands, asking as space-77 has it.
      deliver(placingHome([]));
      await waitFor(() => expect(within(workshop).queryAllByTestId(/^space-placed-/)).toEqual([]));
      expect(within(workshop).getByText(words.empty)).toBeTruthy();
      const remove = within(workshop).getByTestId("space-group-delete-workshop");
      expect(remove.textContent).toBe(words.delete);
      fireEvent.click(remove);
      expect(within(workshop).getByTestId("space-group-confirm-workshop").textContent).toContain(words.confirm);
    },
  );

  test.each(["en", "zh"] as const)(
    "space-1: a placed line reads the group a row stands under by its name, its path beside it only where the two differ, so two groups of one name read apart (%s)",
    async (language) => {
      activateLanguage(language);
      const under =
        language === "en"
          ? (group: string) => `academy-spex stands under ${group} at Spex Example`
          : (group: string) => `academy-spex 位于 Spex Example 的 ${group} 下`;
      /** placingHome with the first's acme named `name`. */
      const named = (name: string): GroupsState => {
        const home = placingHome();
        const [first, ...rest] = home.instances;
        return { ...home, instances: [{ ...first!, groups: first!.groups.map((entry) => (entry.fullPath === "acme" ? { ...entry, name } : entry)) }, ...rest] };
      };
      await renderGroups(named("Research"), { open: false });
      const line = () => within(screen.getByTestId(`space-instance-${SECOND}`)).getByTestId(`space-placed-${KEY}`);
      // Named apart from its path, the group reads both, as its heading
      // does.
      expect(line().textContent).toBe(under("Research · acme"));
      // Named as its path, it reads its name alone.
      deliver(named("acme"));
      await waitFor(() => expect(line().textContent).toBe(under("acme")));
    },
  );

  test("space-1, space-77: a group whose listing names only rows the state stands nowhere reads empty and offers Delete, the empty phrase and Delete reading the lines it shows", async () => {
    activateLanguage("en");
    await renderGroups(placingHome([{ key: "@spex.example/nowhere/lost-spex", name: "lost-spex" }]), { open: false });
    const workshop = within(screen.getByTestId(`space-instance-${SECOND}`)).getByTestId("space-group-workshop");
    expect(within(workshop).queryAllByTestId(/^space-placed-/)).toEqual([]);
    expect(within(workshop).getByText("No spex repositories here yet")).toBeTruthy();
    expect(within(workshop).getByTestId("space-group-delete-workshop").textContent).toBe("Delete");
  });
});

/**
 * space-95's home as the walk reads it: `twoPlacementsHome`, the
 * second's `workshop` letting the person delete it — so that it stands
 * without Delete for the placements it holds, not for want of the right
 * (space-1) — and each row a step names changed as it says, wherever
 * that row stands.
 */
function walkHome(change: Record<string, (row: RepositoryState) => RepositoryState> = {}): GroupsState {
  const home = twoPlacementsHome();
  const changed = (rows: RepositoryState[]) => rows.map((row) => change[row.key]?.(row) ?? row);
  return {
    ...home,
    own: { ...home.own, repositories: changed(home.own.repositories) },
    instances: home.instances.map((at) => ({
      ...at,
      groups: at.groups.map((group) => ({
        ...group,
        ...(at.origin === SECOND && group.fullPath === "workshop" ? { can: { ...NO_CAN, delete: true } } : {}),
        repositories: changed(group.repositories),
      })),
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

/** The placement's first push waits for the reader's Continue
 * (space-57). */
const WAITING = { kind: "waiting" as const, sent: 0, received: 0 };

describe("GROUPS: the placements surface at the floor (space-95, space-28)", () => {
  test("space-95: lines, Place at…, Leave…, Remove with its count, Attach's notice, the waiting line, the placed line, the members' 'also placed at', the Add instance card", async () => {
    await renderGroups(walkHome(), { open: false });

    // Each row lists one line per placement, by its instance's display
    // name and its path there, its state, and its last sync; the one its
    // file names reads "Not on this device" with Attach; Members and
    // "Move…" stand on the lines the view allows — Move on no group's
    // own records, nor your own group's (space-87).
    expect(linesOf(KEY).map((line) => [line.dataset.testid, line.dataset.state, line.dataset.attached])).toEqual([
      [`space-line-${ORIGIN}`, "reachable", "true"],
      [`space-line-${SECOND}`, "reachable", "true"],
    ]);
    expect(linesOf(KEY).map(reading)).toEqual([
      { name: "Spex Example", at: "jane/academy-spex", state: "Synced 5m ago" },
      { name: "Second Example", at: "workshop/academy-spex", state: "Synced 1h ago" },
    ]);
    expect(linesOf(BETA).map((line) => [line.dataset.testid, line.dataset.state, line.dataset.attached])).toEqual([
      [`space-line-${ORIGIN}`, "reachable", "true"],
      [`space-line-${SECOND}`, "absent", "false"],
    ]);
    expect(linesOf(BETA).map(reading)).toEqual([
      { name: "Spex Example", at: "jane/beta-spex", state: "Synced 2h ago" },
      { name: "Second Example", at: "workshop/beta-spex", state: "Not on this device" },
    ]);
    expect(linesOf(OWN).map(reading)).toEqual([
      { name: "Spex Example", at: OWN, state: "Synced 3h ago" },
      { name: "Second Example", at: "jada/jada-spex", state: "Synced 3h ago" },
    ]);
    expect(linesOf(ACME).map(reading)).toEqual([{ name: "Spex Example", at: "acme/acme-spex", state: "Synced 4h ago" }]);
    expect(screen.queryByTestId(`space-lines-${GAMMA}`)).toBeNull();
    expect(lineControls(lineOf(KEY, ORIGIN))).toEqual(["space-line-members", "space-line-move"]);
    expect(lineControls(lineOf(KEY, SECOND))).toEqual(["space-line-members", "space-line-move"]);
    expect(lineControls(lineOf(BETA, ORIGIN))).toEqual(["space-line-members", "space-line-move"]);
    expect(lineControls(lineOf(BETA, SECOND))).toEqual(["space-line-attach"]);
    expect(within(lineOf(BETA, SECOND)).getByTestId("space-line-attach").textContent).toBe("Attach");
    expect(lineControls(lineOf(OWN, ORIGIN))).toEqual(["space-line-members"]);
    expect(lineControls(lineOf(OWN, SECOND))).toEqual(["space-line-members"]);
    expect(lineControls(lineOf(ACME, ORIGIN))).toEqual(["space-line-members"]);
    // Each act on a line is told apart by its line's instance.
    expect(describedAs(within(lineOf(KEY, SECOND)).getByTestId("space-line-move"))).toBe("Second Example");

    // "Place at…" stands on the project at one instance, named for the
    // instance it would add; on neither the placed project, your own
    // group's, a group's own nor the local-only project, which offers
    // "Pick a group" (space-88).
    const place = placeControl(BETA);
    expect(place.textContent).toBe("Place at…");
    expect(place.getAttribute("title")).toBe("Also place at Second Example");
    expect(within(screen.getByTestId(`space-row-${BETA}`)).getByRole("button", { name: "Also place at Second Example" })).toBe(place);
    // "Leave…" is named for the placement it would remove on that
    // project, and asks which on the placed one (space-89).
    const leave = leaveControl(BETA);
    expect(leave.textContent).toBe("Leave…");
    expect(leave.getAttribute("title")).toBe("Remove from Spex Example");
    expect(within(screen.getByTestId(`space-row-${BETA}`)).getByRole("button", { name: "Remove from Spex Example" })).toBe(leave);
    expect(rowControls(BETA)).toEqual([`space-row-place-${BETA}`, `space-row-leave-${BETA}`, `space-row-sync-${BETA}`]);
    expect(rowControls(KEY)).toEqual([`space-row-leave-${KEY}`, `space-row-sync-${KEY}`]);
    expect(rowControls(OWN)).toEqual([`space-row-sync-${OWN}`]);
    expect(rowControls(ACME)).toEqual([`space-row-sync-${ACME}`]);
    expect(rowControls(GAMMA)).toEqual([`space-row-pick-${GAMMA}`]);
    expect(screen.getByTestId(`space-row-pick-${GAMMA}`).textContent).toBe("Pick a group");
    expect(leaveControl(KEY).getAttribute("title")).toBeNull();
    fireEvent.click(leaveControl(KEY));
    const choice = screen.getByTestId(`space-leave-choice-${KEY}`);
    expect(within(choice).getAllByTestId(/^space-leave-instance-/).map((option) => option.getAttribute("aria-label"))).toEqual([
      "Remove from Spex Example",
      "Remove from Second Example",
    ]);

    // Remove sends space.leave naming that placement's instance; a Leave
    // stopped for units no other placement received asks again naming
    // their count, its Remove sending it confirmed (space-89, space-98).
    fireEvent.click(within(choice).getByRole("button", { name: "Remove from Second Example" }));
    expect(leaveConfirm(KEY).dataset.stage).toBe("first");
    fireEvent.click(within(leaveConfirm(KEY)).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(calls("space.leave")).toEqual([{ repository: KEY, instance: SECOND }]));
    deliver(walkHome({ [KEY]: (row) => ({ ...row, sync: leaveRunning(SECOND) }) }));
    await waitFor(() => expect(reading(lineOf(KEY, SECOND)).state).toBe("Checking host…"));
    deliver(walkHome({ [KEY]: (row) => ({ ...row, sync: leaveStopped("unreceived", 2) }) }));
    await waitFor(() => expect(leaveConfirm(KEY).dataset.stage).toBe("unreceived"));
    expect(leaveConfirm(KEY).textContent).toContain("2 units have reached no other instance yet. Remove from Second Example anyway?");
    expect(document.activeElement).toBe(within(leaveConfirm(KEY)).getByRole("button", { name: "Keep" }));
    fireEvent.click(within(leaveConfirm(KEY)).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(calls("space.leave")[1]).toEqual({ repository: KEY, instance: SECOND, confirmed: true }));
    expect(calls("space.leave")).toHaveLength(2);
    cleanup();

    // The Leave sent, the walk goes on over the home as space-95 has it.
    installClient();
    await renderGroups(walkHome(), { open: false });

    // Attach says the notice on its line, naming where the records go at
    // the second, Cancel focused; Cancel attaches nothing, and Continue
    // sends space.attach with the notice seen (space-90).
    const named = lineOf(BETA, SECOND);
    const attach = within(named).getByTestId("space-line-attach") as HTMLButtonElement;
    fireEvent.click(attach);
    let notice = within(named).getByTestId("space-line-notice");
    expect(notice.textContent).toContain("Records go to workshop/beta-spex at Second Example.");
    expect(document.activeElement).toBe(within(notice).getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(notice).getByRole("button", { name: "Cancel" }));
    expect(within(named).queryByTestId("space-line-notice")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(attach));
    expect(calls("space.attach")).toHaveLength(0);
    fireEvent.click(attach);
    fireEvent.click(within(within(named).getByTestId("space-line-notice")).getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(calls("space.attach")).toEqual([{ repository: BETA, instance: SECOND, noticed: true }]));

    // Your own group's placement at the second owes its notice there
    // (space-4): Sync goes for the first, which owes none, and the second
    // waits with Continue on its line, which says the notice and sends
    // that placement's (space-57).
    const owing = { noticed: false, lastSync: null };
    deliver(walkHome({ [OWN]: atLine(SECOND, owing) }));
    fireEvent.click(rowSync(OWN));
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
    fireEvent.click(go);
    notice = within(lineOf(OWN, SECOND)).getByTestId("space-line-notice");
    expect(notice.textContent).toContain("Records go to jada/jada-spex at Second Example.");
    fireEvent.click(within(notice).getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(calls("space.sync")[1]).toEqual({ repository: OWN, placement: SECOND, noticed: true }));

    // The second's workshop, holding a placement of each project, shows
    // one line naming each where it stands, with no control, and no
    // Delete though the host lets the person delete it (space-1).
    const workshop = within(screen.getByTestId(`space-instance-${SECOND}`)).getByTestId("space-group-workshop");
    const placed = within(workshop).getAllByTestId(/^space-placed-/);
    expect(placed.map((line) => line.dataset.testid)).toEqual([`space-placed-${KEY}`, `space-placed-${BETA}`]);
    expect(placed.map((line) => line.textContent)).toEqual([
      "academy-spex stands under jane at Spex Example",
      "beta-spex stands under jane at Spex Example",
    ]);
    for (const line of placed) expect(within(line).queryAllByRole("button")).toEqual([]);
    expect(within(workshop).queryByTestId("space-group-delete-workshop")).toBeNull();
    expect(within(workshop).queryByTestId(`space-row-${KEY}`)).toBeNull();

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
      expect(within(panel).getByTestId("space-members-also").textContent).toBe(`These records are also placed at ${other}`);
    }

    // The card opened from "Add instance…" says your own group's records
    // follow the sign-in there (space-3).
    fireEvent.click(screen.getByTestId("space-add-instance"));
    expect(within(screen.getByTestId("space-add-card")).getByTestId("space-add-own").textContent).toBe(
      "Your own group's records will be kept there too.",
    );
  });

  test.each(["en", "zh"] as const)(
    "space-28, space-95: every new control reads at most 14 characters, idle and busy — space.place, space.leave and space.attach held unanswered — its long name kept (%s)",
    async (language) => {
      activateLanguage(language);
      const zh = language === "zh";
      const words = zh
        ? {
            alsoSecond: "同时放到 Second Example",
            removeFirst: "从 Spex Example 移除",
            removeSecond: "从 Second Example 移除",
            move: "移到另一个群组",
            members: "成员",
            another: "另一个实例",
            continue: "继续",
            join: "加入",
            remove: "移除",
            keep: "保留",
            idle: ["放到…", "移除…", "接入", "继续", "加入", "重试", "成员", "移动…", "同步", "选择群组", "添加实例…"],
            opened: ["取消", "保留", "移除", "继续", "加入"],
            busy: ["放置中…", "移除中…", "接入中…", "加入中…", "重试中…", "移动中…"],
          }
        : {
            alsoSecond: "Also place at Second Example",
            removeFirst: "Remove from Spex Example",
            removeSecond: "Remove from Second Example",
            move: "Move to another group",
            members: "Members",
            another: "Another instance",
            continue: "Continue",
            join: "Join",
            remove: "Remove",
            keep: "Keep",
            idle: ["Place at…", "Leave…", "Attach", "Continue", "Join", "Retry", "Members", "Move…", "Sync", "Pick a group", "Add instance…"],
            opened: ["Cancel", "Keep", "Remove", "Continue", "Join"],
            busy: ["Placing…", "Leaving…", "Attaching…", "Joining…", "Retrying…", "Moving…"],
          };
      // Every act a line or a row starts is held unanswered, so each
      // reads its busy form (space-28).
      const held = new Set(["space.place", "space.leave", "space.attach", "space.sync", "space.repository.move"]);
      commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) =>
        held.has(type) ? new Promise(() => {}) : answer(type, fields),
      );
      // space-95's home, the outcomes its lines' last syncs left giving
      // Continue, Join and Retry their turn beside Members, "Move…" and
      // Attach: your own group's second placement waiting for its notice,
      // the opened project's second unrelated, and the group's own
      // stopped where retrying helps (space-87).
      await renderGroups(
        walkHome({
          [OWN]: atLine(SECOND, { noticed: false, lastSync: null, outcome: WAITING }),
          [KEY]: atLine(SECOND, { outcome: { kind: "unrelated", sent: 0, received: 0 } }),
          [ACME]: atLine(ORIGIN, {
            outcome: { kind: "stopped", step: "push", cause: "unreachable", message: "Could not reach Spex Example", guidance: "Check the network, then Retry.", retry: true },
          }),
        }),
        { open: false },
      );

      const seen = new Set<string>();
      const measure = () => {
        for (const button of screen.getAllByRole("button")) {
          // A row, and a picker's or a choice's option, is a list row whose
          // words are its own, its long name its accessible name (space-28).
          const id = button.dataset.testid ?? "";
          if (/^space-(repo|pick-repo|pick-group|move-group|place-instance|leave-instance)-/.test(id)) continue;
          const text = (button.textContent ?? "").trim();
          if (text !== "") seen.add(text);
          expect(text.length, `"${text}"`).toBeLessThanOrEqual(14);
          // A control whose words yield keeps its accessible name.
          expect((button.getAttribute("aria-label") ?? text).length, id).toBeGreaterThan(0);
        }
      };

      // Idle: each control whose words name one instance of several keeps
      // that long name as its title and accessible name (space-28).
      measure();
      const place = placeControl(BETA);
      const leave = leaveControl(BETA);
      for (const attribute of ["title", "aria-label"]) {
        expect(place.getAttribute(attribute)).toBe(words.alsoSecond);
        expect(leave.getAttribute(attribute)).toBe(words.removeFirst);
      }
      const move = within(lineOf(KEY, ORIGIN)).getByTestId("space-line-move");
      expect(move.getAttribute("aria-label")).toBe(words.move);
      expect(move.getAttribute("title")).toBe(words.move);
      const members = within(lineOf(OWN, ORIGIN)).getByTestId("space-line-members");
      expect(members.getAttribute("aria-label")).toBe(words.members);
      expect(screen.getByTestId("space-add-instance").getAttribute("aria-label")).toBe(words.another);
      expect([...seen]).toEqual(expect.arrayContaining(words.idle));

      // Opened: Leave…'s choice on the placed project, each option named
      // for the placement it removes; Place at…'s picker and Leave…'s
      // confirm on the project at one instance; Attach's notice; the
      // waiting line's notice; the unrelated line's Join confirm; a
      // members panel and Move's picker on their lines; and Pick a group.
      fireEvent.click(leaveControl(KEY));
      expect(
        within(screen.getByTestId(`space-leave-choice-${KEY}`))
          .getAllByTestId(/^space-leave-instance-/)
          .map((option) => option.getAttribute("aria-label")),
      ).toEqual([words.removeFirst, words.removeSecond]);
      fireEvent.click(place);
      expect(screen.getByTestId(`space-place-${BETA}`).getAttribute("aria-label")).toBe(words.alsoSecond);
      fireEvent.click(within(lineOf(BETA, SECOND)).getByTestId("space-line-attach"));
      fireEvent.click(within(lineOf(OWN, SECOND)).getByTestId("space-line-continue"));
      fireEvent.click(within(lineOf(KEY, SECOND)).getByTestId("space-line-join"));
      fireEvent.click(within(lineOf(OWN, ORIGIN)).getByTestId("space-line-members"));
      await within(await screen.findByTestId(`space-members-${OWN}@${ORIGIN}`)).findAllByTestId(/^space-member-/);
      fireEvent.click(move);
      fireEvent.click(screen.getByTestId(`space-row-pick-${GAMMA}`));
      measure();
      // A row asks one thing at a time: Leave…'s confirm in the picker's
      // place, then Keep, and the picker again.
      fireEvent.click(leave);
      expect(screen.queryByTestId(`space-place-${BETA}`)).toBeNull();
      measure();
      expect([...seen]).toEqual(expect.arrayContaining(words.opened));
      fireEvent.click(within(leaveConfirm(BETA)).getByRole("button", { name: words.keep }));
      fireEvent.click(place);

      // Busy: each act sent and unanswered reads its busy form, within the
      // budget too (space-28).
      fireEvent.click(within(screen.getByTestId(`space-place-${BETA}`)).getByTestId("space-pick-group-@jada"));
      fireEvent.click(within(screen.getByTestId(`space-leave-choice-${KEY}`)).getByRole("button", { name: words.removeSecond }));
      fireEvent.click(within(leaveConfirm(KEY)).getByRole("button", { name: words.remove }));
      fireEvent.click(within(within(lineOf(BETA, SECOND)).getByTestId("space-line-notice")).getByRole("button", { name: words.continue }));
      fireEvent.click(within(within(lineOf(OWN, SECOND)).getByTestId("space-line-notice")).getByRole("button", { name: words.continue }));
      fireEvent.click(within(within(lineOf(KEY, SECOND)).getByTestId("space-line-join-confirm")).getByRole("button", { name: words.join }));
      fireEvent.click(within(lineOf(ACME, ORIGIN)).getByTestId("space-line-retry"));
      fireEvent.click(within(screen.getByTestId(`space-move-${KEY}@${ORIGIN}`)).getByTestId("space-move-group-acme"));
      await waitFor(() => {
        expect(placeControl(BETA).textContent).toBe(words.busy[0]);
        expect(leaveControl(KEY).textContent).toBe(words.busy[1]);
        expect(within(lineOf(BETA, SECOND)).getByTestId("space-line-attach").textContent).toBe(words.busy[2]);
        expect(within(lineOf(KEY, SECOND)).getByTestId("space-line-join").textContent).toBe(words.busy[3]);
        expect(within(lineOf(ACME, ORIGIN)).getByTestId("space-line-retry").textContent).toBe(words.busy[4]);
        expect(within(lineOf(KEY, ORIGIN)).getByTestId("space-line-move").textContent).toBe(words.busy[5]);
      });
      expect((within(lineOf(OWN, SECOND)).getByTestId("space-line-continue") as HTMLButtonElement).disabled).toBe(true);
      measure();
      expect([...seen]).toEqual(expect.arrayContaining(words.busy));
      expect(calls("space.place")).toHaveLength(1);
      expect(calls("space.leave")).toEqual([{ repository: KEY, instance: SECOND }]);
      expect(calls("space.attach")).toEqual([{ repository: BETA, instance: SECOND, noticed: true }]);

      // At the 320-pixel floor no control breaks its words: each row's and
      // each line's controls wrap beneath its name below @xs instead
      // (space-28, DR-041).
      for (const id of [`space-row-place-${BETA}`, `space-row-leave-${BETA}`, `space-row-leave-${KEY}`]) {
        expect(screen.getByTestId(id).className.split(/\s+/)).toContain("whitespace-nowrap");
      }
      for (const key of [KEY, BETA, OWN, ACME]) {
        const top = screen.getByTestId(`space-repo-${key}`).parentElement!;
        for (const token of ["flex-wrap", "@xs:flex-nowrap"]) expect(top.className.split(/\s+/)).toContain(token);
        for (const line of within(screen.getByTestId(`space-lines-${key}`)).getAllByTestId(/^space-line-(http|path)/)) {
          const row = within(line).getByTestId("space-line-instance").parentElement!;
          for (const token of ["flex-wrap", "@xs:flex-nowrap"]) expect(row.className.split(/\s+/)).toContain(token);
          for (const control of within(row).queryAllByRole("button")) {
            expect(control.className.split(/\s+/), control.dataset.testid).toContain("whitespace-nowrap");
          }
        }
      }
    },
  );
});
