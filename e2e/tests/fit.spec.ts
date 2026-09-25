// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The fit journey (run-view-105, spec-view-56, dashboard-43,
// settings-30; DR-041 §9): every surface, both sidebar states, six
// widths, two heights — the page never scrolls sideways or
// vertically, nothing but a canvas is wider than its box, every
// scroll box ends inside the viewport and contains its own positioned
// content, no two siblings in a row overlap, every child stays inside
// its parent, and every control keeps its accessible name; a window
// made short and tall again re-fits without a reload. Simulated
// documents cannot measure layout, so this journey and the Space fit
// journey (space-43) are the home of that evidence; the measurement
// itself lives in ../src/fit.

import { join } from "node:path";
import {
  appendHistorySession,
  seedDemoProject,
} from "@sublang/spex-core/testing";
import type { Locator, Page } from "@playwright/test";

import { test, expect, open, nav, runTurn, send } from "../src/harness";
import {
  HEIGHTS,
  OPEN_RAIL_MIN_WIDTH,
  SHORT,
  TALL,
  WIDTHS,
  compareNames,
  measure,
  record,
  setRail,
} from "../src/fit";


// Long enough that a turn is still in flight while a surface is
// measured at eleven widths. The demo project carries closed work, so
// the Dashboard's History band draws rows — with their screen-reader
// marks — below the fold, where a box that fails to contain them
// stretches the page.
test.use({
  appOptions: {
    project: true,
    history: 25,
    agentDelayMs: 4000,
    // A draft compiled by the passing stub, measured idle at its
    // proposal (DR-058).
    authoring: { slc: "ok" },
  },
});

/** An unbroken token longer than any pane (run-view-3): it rides the
 * task into the Boss bubble, the coder's prompt, and the tab and row
 * titles, and must wrap or truncate everywhere rather than scroll a
 * pane sideways. */
const LONG_URL = `https://example.com/${"a".repeat(380)}`;
const TASK = `Fix the token refresh in auth.ts — see ${LONG_URL}`;

const QUEUE_FIT_TITLE =
  "Reconcile the authentication migration after the complete compatibility audit finishes";
const QUEUE_FIT_PATH =
  `packages/server/src/${"deeply-nested-authentication-migration/".repeat(4)}unfinished-refresh-handler.ts`;
const QUEUE_FIT_CAUSE = {
  code: "commit-residual",
  evidence: {
    commitOid: "1234567890abcdef",
    paths: { uncommitted: [QUEUE_FIT_PATH] },
  },
};
const QUEUE_FIT_CAUSE_PHRASE =
  `Committed 12345678 but left changes uncommitted: ${QUEUE_FIT_PATH}`;
const QUEUE_FIT_PARKED_PHRASE =
  `waiting — current work failed — ${QUEUE_FIT_CAUSE_PHRASE}`;
const QUEUE_FIT_FAILED_PHRASE =
  `waiting — previous work failed — ${QUEUE_FIT_CAUSE_PHRASE}`;

/** Stored turns that move one lane from a stable failure park to an
 * unparked failure, carrying the same structured long-path cause. The
 * browser still reads the result from the real core; these are only
 * the off-screen writer's arrangement records (dashboard-43,
 * run-view-105). */
function queueFitFailureRecords(
  turnId: number,
  at: number,
  kind: "park" | "unpark-and-fail",
): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [
    {
      type: "turn_started",
      turnId,
      turn: { id: turnId, prompt: `Arrange ${kind} queue fit` },
      timestamp: at,
    },
  ];
  if (kind === "unpark-and-fail") {
    records.push({
      type: "captain_telemetry",
      turnId,
      timestamp: at + 1,
      topic: "playbook.fsm.state",
      payload: { from: "failed", to: "working", event: "RETRY_CODE" },
    });
  }
  records.push({
    type: "runtime_error",
    turnId,
    timestamp: at + 2,
    message: "The queue-fit fixture failed after changing the repository",
    cause: QUEUE_FIT_CAUSE,
  });
  if (kind === "park") {
    records.push({
      type: "captain_telemetry",
      turnId,
      timestamp: at + 3,
      topic: "playbook.fsm.state",
      payload: { from: "working", to: "failed", event: "CODE_FAILED" },
    });
  }
  records.push({
    type: "turn_finished",
    turnId,
    timestamp: at + 4,
  });
  return records;
}

interface QueueFitTarget {
  row: Locator;
  rowSelector: string;
  textTestId: string;
  title: Locator;
  standing: Locator;
  queued: Locator;
  fixed: Locator[];
  count?: Locator;
}

/** Assert the responsive relationship that a DOM-shape test cannot:
 * one flexible text region, line sharing at @md, stacking below it,
 * actual ellipsis at the floor, and fixed chrome staying contained. */
async function assertQueueFit(
  target: QueueFitTarget,
  expectedTitle: string,
  expectedStanding: string,
  where: string,
  mustTruncate: boolean,
): Promise<void> {
  await target.row.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(target.row, `${where}: row`).toBeVisible();
  await expect(target.title, `${where}: full title`).toHaveAttribute(
    "title",
    expectedTitle,
  );
  await expect(target.standing, `${where}: standing words`).toHaveText(
    expectedStanding,
  );
  await expect(target.standing, `${where}: full standing`).toHaveAttribute(
    "title",
    expectedStanding,
  );
  await expect(target.queued, `${where}: Queued`).toBeVisible();
  for (const control of target.fixed) {
    await expect(control, `${where}: fixed control`).toBeVisible();
  }
  if (target.count) {
    await expect(target.count, `${where}: remaining count`).toBeVisible();
    expect(
      await target.count.evaluate(
        (count, textTestId) =>
          count.closest(`[data-testid="${textTestId}"]`) !== null,
        target.textTestId,
      ),
      `${where}: remaining count belongs to the text region`,
    ).toBe(true);
  }

  const layout = await target.row.evaluate(
    (row, ids) => {
      const find = (id: string): HTMLElement => {
        const found = row.querySelector<HTMLElement>(`[data-testid="${id}"]`);
        if (!found) throw new Error(`queue-fit row has no ${id}`);
        return found;
      };
      const text = find(ids.text);
      const title = find(ids.title);
      const standing = find(ids.standing);
      const rowBox = row.getBoundingClientRect();
      const titleBox = title.getBoundingClientRect();
      const standingBox = standing.getBoundingClientRect();
      const fixed = [find(ids.queued), ...ids.fixed.map(find)].map((node) => {
        const box = node.getBoundingClientRect();
        return {
          shrink: Number.parseFloat(getComputedStyle(node).flexShrink),
          inside:
            box.left >= rowBox.left - 1 &&
            box.right <= rowBox.right + 1 &&
            box.top >= rowBox.top - 1 &&
            box.bottom <= rowBox.bottom + 1,
        };
      });
      return {
        rowWidth: rowBox.width,
        flexible: Array.from(row.children)
          .filter(
            (child) =>
              Number.parseFloat(getComputedStyle(child).flexGrow) > 0,
          )
          .map((child) => child.getAttribute("data-testid")),
        textMinWidth: getComputedStyle(text).minWidth,
        sharesLine:
          Math.min(titleBox.bottom, standingBox.bottom) -
            Math.max(titleBox.top, standingBox.top) >
          1,
        standingBelow: standingBox.top >= titleBox.bottom - 1,
        standingClient: standing.clientWidth,
        standingScroll: standing.scrollWidth,
        fixed,
      };
    },
    {
      text: target.textTestId,
      title: await target.title.getAttribute("data-testid"),
      standing: await target.standing.getAttribute("data-testid"),
      queued: await target.queued.getAttribute("data-testid"),
      fixed: await Promise.all(
        target.fixed.map((control) => control.getAttribute("data-testid")),
      ),
    } as {
      text: string;
      title: string;
      standing: string;
      queued: string;
      fixed: string[];
    },
  );
  expect(layout.flexible, `${where}: sole flexible child`).toEqual([
    target.textTestId,
  ]);
  expect(layout.textMinWidth, `${where}: text yields`).toBe("0px");
  if (layout.rowWidth >= 28 * 16) {
    expect(layout.sharesLine, `${where}: title and standing share a line`).toBe(
      true,
    );
  } else {
    expect(layout.standingBelow, `${where}: standing owns the next line`).toBe(
      true,
    );
  }
  if (mustTruncate) {
    expect(
      layout.standingScroll,
      `${where}: long standing actually truncates`,
    ).toBeGreaterThan(layout.standingClient + 1);
  }
  expect(
    layout.fixed.every(({ shrink, inside }) => shrink === 0 && inside),
    `${where}: Queued and controls stay fixed inside the row`,
  ).toBe(true);
}

async function sweepQueueFit(
  page: Page,
  name: string,
  target: QueueFitTarget,
  expectedTitle: string,
  expectedStanding: string,
  defects: string[],
): Promise<void> {
  for (const railOpen of [false, true]) {
    await setRail(page, railOpen);
    let names: string[] | undefined;
    for (const width of WIDTHS) {
      if (railOpen && width < OPEN_RAIL_MIN_WIDTH) continue;
      for (const height of HEIGHTS) {
        await page.setViewportSize({ width, height });
        const where = `${name} · sidebar ${railOpen ? "open" : "collapsed"} · ${width}×${height}`;
        await assertQueueFit(
          target,
          expectedTitle,
          expectedStanding,
          where,
          !railOpen && width === 320,
        );
        const found = await measure(page, [target.rowSelector]);
        record(where, found, defects);
        names = compareNames(where, found, names, defects);
      }
    }
  }
}

interface Surface {
  name: string;
  /** Bring the surface up once. */
  show: () => Promise<void>;
  /** Hold before each measurement: the surface is drawn and in the
   * state the journey measures. */
  ready: () => Promise<void>;
  /** Leave the surface with nothing that could change a later
   * surface's controls while it is measured. */
  settle?: () => Promise<void>;
}

test("run-view-105, dashboard-43/58: chrome fits at every width, in both sidebar states", async ({
  page,
  app,
}) => {
  test.setTimeout(120_000);
  const projectId = app.projectId!;

  // Arrange through the protocol: a queued intent with a second one
  // blocked behind it, and ten parked sessions in other projects so
  // the attention queue holds ten entries and the badge passes nine.
  const first = await app.core.command("intent.queue", {
    projectId,
    text: "Add a README badge",
  });
  await app.core.command("intent.queue", {
    projectId,
    text: "Tighten the expiry tests once the badge lands on the README",
    afterIntentId: first.id,
  });
  const parkedProjects: { id: string; name: string }[] = [];
  for (let index = 0; index < 10; index += 1) {
    const dir = join(app.projectDir, "..", `parked-${index}`);
    seedDemoProject(dir);
    const project = await app.core.command("project.register", { path: dir });
    parkedProjects.push({ id: project.id, name: project.name });
    const session = await app.core.command("session.create", {
      projectId: project.id,
    });
    await app.core.command("turn.submit", {
      sessionId: session.id,
      text: "ask before migrating",
    });
  }
  await expect
    .poll(async () => (await app.core.command("ledger.get", {})).badge, {
      timeout: 15_000,
    })
    .toBeGreaterThanOrEqual(10);

  page.on("pageerror", (error) => console.log(`[fit] page error: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") console.log(`[fit] console error: ${message.text()}`);
  });
  await open(page, app);
  // Several projects are registered, so the demo project is chosen
  // by hand from the sidebar.
  await page.getByTestId(`sidebar-project-${projectId}`).click();
  await expect(page.getByTestId("captain-home")).toContainText("demo-project");

  const abort = page.getByTestId("abort-button");
  const ensureTurnRunning = async () => {
    if (await abort.isVisible()) return;
    await page.getByTestId("boss-composer").fill(TASK);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(abort).toBeVisible();
  };

  const surfaces: Surface[] = [
    {
      name: "Captain home",
      show: async () => {},
      ready: () => expect(page.getByTestId("captain-home")).toBeVisible(),
    },
    {
      name: "Session (turn in flight)",
      show: async () => {
        await send(page, TASK);
        await expect(page.getByTestId("captain-pane")).toContainText("/code started");
        // Settle one complete run first, then keep the next in flight:
        // every viewport therefore carries both the folded resting
        // measure and the live replacement whose fit it exercises.
        await expect(abort).toHaveCount(0, { timeout: 20_000 });
        await send(page, "Continue measuring the token refresh work");
        await expect(abort).toBeVisible();
      },
      ready: async () => {
        await expect(page.getByTestId("captain-pane")).toBeVisible();
        await ensureTurnRunning();
      },
      // The turn kept in flight for this surface must not end under a
      // later one: its finish raises a review entry and moves the
      // Dashboard entry's attention count, which compareNames holds
      // to the first size. Let it end here, with the session shown so
      // its finish is viewed (DR-066), and wait for the count to stand
      // at the ten parked questions again.
      settle: async () => {
        await expect(abort).toHaveCount(0, { timeout: 20_000 });
        await expect
          .poll(async () => (await app.core.command("ledger.get", {})).badge, {
            timeout: 15_000,
          })
          .toBe(10);
      },
    },
    {
      name: "Dashboard",
      // The entry's name carries the attention count (run-view-34).
      show: () => page.getByRole("button", { name: /^Dashboard\b/ }).click(),
      ready: async () => {
        await expect(page.getByTestId(`project-group-${projectId}`)).toBeVisible();
        await expect(page.getByTestId(/^attention-/).first()).toBeVisible();
      },
    },
    {
      name: "Overview",
      show: async () => {
        await nav(page, "Projects").click();
        await page.getByRole("tab", { name: "Overview" }).click();
      },
      ready: () => expect(page.getByTestId("overview-tab")).toBeVisible(),
    },
    {
      name: "Specs (graph on)",
      show: async () => {
        await page.getByRole("tab", { name: "Specs" }).click();
        await expect(page.getByTestId("specv-live")).toBeVisible();
        const toggle = page.getByTestId("view-graph");
        if ((await toggle.getAttribute("aria-pressed")) !== "true") await toggle.click();
        await expect(toggle).toHaveAttribute("aria-pressed", "true");
        const file = page.getByTestId(/^file-toggle-/).first();
        if ((await file.getAttribute("aria-expanded")) !== "true") await file.click();
        await expect(page.getByTestId(/^item-toggle-/).first()).toBeVisible();
      },
      ready: async () => {
        await expect(page.getByTestId("specv-live")).toBeVisible();
        // The graph half fills the split's box beside the outline, or
        // its own floor where that is taller, and the drawing surface
        // fills the half less its legend (spec-view-59). A pane whose height
        // fails to resolve is exactly as tall as its legend plus the
        // 150px an svg falls back to, so the half is measured against
        // the box it owes its height to, never against itself.
        const fill = await page.getByTestId("spec-graph").evaluate((pane) => {
          const svg = pane.querySelector("svg");
          const others = Array.from(pane.children)
            .filter((child) => child !== svg)
            .reduce((sum, child) => sum + child.getBoundingClientRect().height, 0);
          const half = pane.parentElement!;
          const split = half.parentElement!;
          const box = split.parentElement!;
          const paneBox = pane.getBoundingClientRect();
          return {
            pane: paneBox.height,
            svg: svg?.getBoundingClientRect().height ?? 0,
            others,
            besideOutline: paneBox.width < split.getBoundingClientRect().width - 1,
            box: box.clientHeight,
            floor: Number.parseFloat(getComputedStyle(half).minHeight) || 0,
          };
        });
        const owed = Math.max(fill.floor, fill.besideOutline ? fill.box : 0);
        expect(
          fill.pane,
          `the graph half is ${fill.pane}px tall with a ${fill.floor}px floor ${
            fill.besideOutline ? `beside the outline in a ${fill.box}px box` : "below the outline"
          }`,
        ).toBeGreaterThanOrEqual(owed - 1);
        expect(
          fill.svg,
          `the graph's drawing surface is ${fill.svg}px tall in a ${fill.pane}px pane`,
        ).toBeGreaterThanOrEqual(fill.pane - fill.others - 1);
      },
    },
    {
      name: "Playbooks",
      show: () => nav(page, "Playbooks").click(),
      ready: () => expect(page.getByTestId("builtins-section")).toBeVisible(),
    },
    {
      // The authoring workspace at rest after a compile: the thread
      // with its cards, the band with every phase done, the source,
      // and the compiled tabs enabled (playbook-library-52).
      name: "Playbook draft",
      show: async () => {
        const idField = page.getByTestId("new-playbook-id");
        await idField.fill("triage");
        await idField.press("Enter");
        await expect(page.getByTestId("authoring-workspace")).toBeVisible();
        await page.getByTestId("draft-composer").fill("I want a playbook that triages new issues into labels.");
        await page.getByTestId("draft-send").click();
        await expect(
          page.locator('[data-testid="directive-card"][data-kind="register"]'),
        ).toBeVisible({ timeout: 45_000 });
        await expect(page.getByTestId("draft-working")).toHaveCount(0);
      },
      ready: async () => {
        await expect(page.getByTestId("authoring-workspace")).toBeVisible();
        await expect(page.getByTestId("draft-chip")).toContainText("Compiled");
      },
    },
    {
      name: "Settings",
      show: () => nav(page, "Settings").click(),
      ready: () => expect(page.getByTestId("captain-section")).toBeVisible(),
    },
  ];

  const defects: string[] = [];
  const started = Date.now();
  const log = (line: string) => {
    if (!process.env.SPEX_E2E_DEBUG) return;
    console.log(`[fit +${((Date.now() - started) / 1000).toFixed(1)}s] ${line}`);
  };
  for (const surface of surfaces) {
    await page.setViewportSize({ width: 1280, height: TALL });
    await surface.show();
    log(`${surface.name}: shown`);
    if (surface.name === "Dashboard") {
      // The full surface, not its centered content column, owns
      // scrolling (dashboard-43/47). Prove both empty margins are
      // wheel targets in a real browser; a DOM-shape assertion cannot
      // establish which box receives a pointer's wheel.
      await page.setViewportSize({ width: 1280, height: SHORT });
      await setRail(page, false);
      await surface.ready();
      const scroll = page.getByTestId("dashboard-scroll");
      const geometry = await scroll.evaluate((box) => {
        const content = box.querySelector<HTMLElement>(
          '[data-testid="dashboard-column"]',
        );
        if (!content) {
          throw new Error("Dashboard scroll box has no content column");
        }
        const outer = box.getBoundingClientRect();
        const inner = content.getBoundingClientRect();
        return {
          outer: {
            left: outer.left,
            right: outer.right,
            top: outer.top,
            height: outer.height,
          },
          inner: { left: inner.left, right: inner.right },
          overflows: box.scrollHeight > box.clientHeight,
        };
      });
      expect(
        geometry.overflows,
        "the Dashboard has enough content to scroll",
      ).toBe(true);
      const left = geometry.outer.left + 8;
      const right = geometry.outer.right - 8;
      const y = geometry.outer.top + Math.min(100, geometry.outer.height / 2);
      expect(
        left,
        "left wheel point lies outside the centered column",
      ).toBeLessThan(geometry.inner.left);
      expect(
        right,
        "right wheel point lies outside the centered column",
      ).toBeGreaterThan(geometry.inner.right);
      for (const x of [left, right]) {
        await scroll.evaluate((box) => {
          box.scrollTop = 0;
        });
        await page.mouse.move(x, y);
        await page.mouse.wheel(0, 360);
        await expect
          .poll(() => scroll.evaluate((box) => box.scrollTop))
          .toBeGreaterThan(0);
      }
      await scroll.evaluate((box) => {
        box.scrollTop = 0;
      });

      // A whole project group is reader-owned chrome (dashboard-58):
      // its attention survives the fold, new work cannot open it, and
      // the preference survives a reload without affecting a sibling
      // group or the project's full Overview.
      const collapsed = parkedProjects[0];
      const sibling = parkedProjects[1];
      if (!collapsed || !sibling) {
        throw new Error("Dashboard disclosure journey needs two parked projects");
      }
      const collapsedId = collapsed.id;
      const siblingId = sibling.id;
      const group = page.getByTestId(`project-group-${collapsedId}`);
      const toggle = page.getByTestId(`project-toggle-${collapsedId}`);
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(toggle).toHaveAccessibleDescription(
        "A session is waiting for your reply",
      );
      await expect(group.getByRole("heading", { level: 3 })).toHaveAccessibleName(
        collapsed.name,
      );
      await expect(
        page.getByTestId(`project-bands-${collapsedId}`),
      ).not.toBeVisible();
      const attentionMark = page.getByTestId(
        `project-attention-${collapsedId}`,
      );
      await expect(attentionMark).toBeVisible();
      await expect(attentionMark).toHaveClass(/bg-amber-500/);
      await expect(
        page.getByTestId(`project-toggle-${siblingId}`),
      ).toHaveAttribute("aria-expanded", "true");
      await app.core.command("intent.queue", {
        projectId: collapsedId,
        text: "Work that arrived behind the fold",
      });
      await expect(
        page
          .getByTestId(`project-bands-${collapsedId}`)
          .getByTestId(/^upnext-row-/)
          .filter({ hasText: "Work that arrived behind the fold" }),
      ).toHaveCount(1);
      await expect(toggle).toHaveAttribute("aria-expanded", "false");

      await page.reload();
      await expect(
        page.getByTestId(`project-toggle-${collapsedId}`),
      ).toHaveAttribute("aria-expanded", "false");
      await expect(
        page.getByTestId(`project-toggle-${siblingId}`),
      ).toHaveAttribute("aria-expanded", "true");
      await setRail(page, true);
      await page.getByTestId(`sidebar-project-${collapsedId}`).click();
      await page.getByRole("tab", { name: "Overview" }).click();
      const overview = page.getByTestId("overview-tab");
      for (const band of ["history", "now", "upnext", "sources"]) {
        await expect(overview.getByTestId(`${band}-${collapsedId}`)).toBeVisible();
      }
      await expect(
        overview.getByTestId(`project-toggle-${collapsedId}`),
      ).toHaveCount(0);
      await page.getByRole("button", { name: /^Dashboard\b/ }).click();
      await page.getByTestId(`project-toggle-${collapsedId}`).click();
      await expect(
        page.getByTestId(`project-bands-${collapsedId}`),
      ).toBeVisible();
      await page.getByTestId(`sidebar-project-${projectId}`).click();
      await page.getByRole("button", { name: /^Dashboard\b/ }).click();
    }
    for (const railOpen of [false, true]) {
      await setRail(page, railOpen);
      let reference: string[] | undefined;
      for (const width of WIDTHS) {
        if (railOpen && width < OPEN_RAIL_MIN_WIDTH) continue;
        for (const height of HEIGHTS) {
          await page.setViewportSize({ width, height });
          await surface.ready();
          const where = `${surface.name} · sidebar ${railOpen ? "open" : "collapsed"} · ${width}×${height}`;
          const found = await measure(page);
          log(`${where}: measured`);
          record(where, found, defects);
          // (iv) Names hold at every size: the first measurement of
          // this sidebar state is the reference.
          reference = compareNames(where, found, reference, defects);
        }
      }
    }
    // One page life, made tall, short, and tall again: a surface that
    // measured the window once would keep the stale height here.
    for (const height of [TALL, SHORT, TALL]) {
      await page.setViewportSize({ width: 1280, height });
      await surface.ready();
      const where = `${surface.name} · re-fit after resize · 1280×${height}`;
      record(where, await measure(page), defects);
      log(`${where}: measured`);
    }
    if (surface.settle) await surface.settle();
  }

  // The agent-local time slot has two deliberate yield points
  // (run-view-105/143): completed active time leaves first, while a
  // live call's elapsed reading survives to the next rung. Exercise
  // those thresholds against a real folded summary and the real
  // divider rather than inferring them from class names.
  await nav(page, "Projects").click();
  // The Dashboard step reloaded the page, and a launch opens only the
  // project's live session as a tab (run-view-57): the measured session
  // settled under the sweep, so the sidebar brings it back.
  const measured = (await app.core.command("session.list", {}))
    .filter((session) => session.projectId === projectId)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  await page.getByTestId(`sidebar-session-${measured.id}`).click();
  await expect(page.getByRole("tab", { name: /Fix the token refresh/i })).toBeVisible();
  await expect(page.getByTestId("captain-pane")).toBeVisible();
  await expect(abort).toHaveCount(0, { timeout: 20_000 });
  await setRail(page, false);
  await page.setViewportSize({ width: 1280, height: TALL });

  const reviewerCollapse = page.getByRole("button", {
    name: "Collapse dev.reviewer",
  });
  if (await reviewerCollapse.isVisible()) await reviewerCollapse.click();
  await expect(page.getByTestId("player-pane-dev.reviewer"))
    .toHaveAttribute("data-collapsed", "true");

  const divider = page.getByTestId("captain-divider");
  const coderPane = page.getByTestId("player-pane-dev.coder");
  const coderName = page.getByTestId("player-name-dev.coder");
  const coderCollapse = page.getByRole("button", { name: "Collapse dev.coder" });
  const coderRunning = coderPane.getByTestId("player-running");
  const active = page.getByTestId("agent-active-dev.coder");
  const activeDescription = page.getByTestId(
    "agent-active-description-dev.coder",
  );
  await divider.press("Home");
  await expect(active).toBeVisible();
  await expect(activeDescription).toContainText(
    /Completed active time this session: .+ · parallel calls overlap/,
  );

  const dragToFloor = async (
    target: Locator,
    phase: "resting active time" | "live elapsed",
    requireRunning: boolean,
  ): Promise<number> => {
    const geometry = await divider.evaluate((node) => {
      const container = node.parentElement?.parentElement;
      if (!(container instanceof HTMLElement)) {
        throw new Error("Captain divider has no split container");
      }
      const box = container.getBoundingClientRect();
      const style = getComputedStyle(container);
      const padLeft = Number.parseFloat(style.paddingLeft) || 0;
      const padRight = Number.parseFloat(style.paddingRight) || 0;
      const gap = Number.parseFloat(style.columnGap) || 0;
      return {
        left: box.left,
        y: node.getBoundingClientRect().y + node.getBoundingClientRect().height / 2,
        content: box.width - padLeft - padRight,
        padLeft,
        gap,
      };
    });
    let yieldedAt: number | undefined;
    await divider.hover();
    await page.mouse.down();
    try {
      for (const percent of [45, 47, 49, 51, 53, 55, 57, 59, 61, 63, 65, 67, 69, 70]) {
        const x = geometry.left + geometry.padLeft + geometry.gap +
          geometry.content * percent / 100;
        await page.mouse.move(x, geometry.y);
        await expect(divider).toHaveAttribute("aria-valuenow", String(percent));
        const paneWidth = (await coderPane.boundingBox())!.width;
        record(
          `${phase} · coder pane ${Math.round(paneWidth)}px`,
          await measure(page),
          defects,
        );
        if (yieldedAt === undefined && !(await target.isVisible())) {
          if (requireRunning && (
            await target.count() !== 1 ||
            !(await coderRunning.isVisible()) ||
            !(await abort.isVisible())
          )) {
            throw new Error(
              `${phase} call settled before its yield point was measured`,
            );
          }
          yieldedAt = paneWidth;
        }
      }
    } finally {
      await page.mouse.up();
    }
    if (yieldedAt === undefined) {
      throw new Error(`${phase} remained visible at the player-pane floor`);
    }
    return yieldedAt;
  };

  const activeYieldWidth = await dragToFloor(active, "resting active time", false);
  await expect(active).not.toBeVisible();
  await expect(activeDescription).toContainText("parallel calls overlap");
  await expect(coderName).toBeVisible();
  await expect(coderCollapse).toBeVisible();

  await divider.press("Home");
  await expect(active).toBeVisible();
  await send(page, "Measure the live elapsed yield point");
  const liveElapsed = coderPane.getByTestId("player-working");
  await expect(liveElapsed).toBeVisible({ timeout: 10_000 });
  const liveYieldWidth = await dragToFloor(liveElapsed, "live elapsed", true);
  expect(activeYieldWidth).toBeGreaterThan(liveYieldWidth);
  await expect(abort).toBeVisible();
  await expect(coderRunning).toBeVisible();
  await expect(liveElapsed).toHaveCount(1);
  await expect(liveElapsed).not.toBeVisible();
  await expect(activeDescription).toContainText("parallel calls overlap");
  await expect(coderName).toBeVisible();
  await expect(coderCollapse).toBeVisible();

  // The collapsed rail's badge caps at "9+", the count in the name
  // (run-view-108).
  await setRail(page, false);
  await expect(page.getByTestId("nav-attention-badge")).toHaveText("9+");
  await expect(
    page.getByRole("button", { name: /^Dashboard — 10 need your attention$/ }),
  ).toBeVisible();

  expect(defects, defects.join("\n")).toEqual([]);
});

test.describe("committed queue rows and cards", () => {
  test.use({
    appOptions: {
      project: true,
      history: 25,
      agentDelayMs: 50,
      authoring: { slc: "ok" },
    },
  });

  test("dashboard-43, run-view-105: queued work keeps one responsive text region", async ({
    page,
    app,
  }) => {
    test.setTimeout(180_000);
    const projectId = app.projectId!;

    // Keep the focused row/card assertions inside the same stressed
    // fixture as the full fit sweep: a long History band and ten
    // further projects summoning from parked questions.
    for (let index = 0; index < 10; index += 1) {
      const dir = join(app.projectDir, "..", `parked-${index}`);
      seedDemoProject(dir);
      const project = await app.core.command("project.register", { path: dir });
      const session = await app.core.command("session.create", {
        projectId: project.id,
      });
      await app.core.command("turn.submit", {
        sessionId: session.id,
        text: "ask before migrating",
      });
    }
    await expect
      .poll(async () => (await app.core.command("ledger.get", {})).badge, {
        timeout: 15_000,
      })
      .toBeGreaterThanOrEqual(10);

    // First create a delivered intent without a successor: settlement
    // must not consume the long queued rows this journey needs to see.
    const delivered = await app.core.command("intent.queue", {
      projectId,
      text: "Prepare the authentication migration",
    });
    const deliveredSession = await app.core.command("session.create", {
      projectId,
    });
    await app.core.command("turn.submit", {
      sessionId: deliveredSession.id,
      text: delivered.text,
      intentId: delivered.id,
    });
    await expect
      .poll(async () => {
        const ledger = await app.core.command("ledger.get", {});
        return ledger.intents.find((row) => row.intent.id === delivered.id)
          ?.state;
      })
      .toBe("finished");
    // "finished" is the intent's state; the conversation that ran it
    // settles a moment later, and the project admits no new session
    // while its runtime is still held (DR-051). Wait for the release.
    await expect
      .poll(
        async () =>
          (await app.core.command("session.list", {})).find(
            (session) => session.id === deliveredSession.id,
          )?.live,
        { timeout: 15_000 },
      )
      .toBe(false);

    // The project's current conversation carries the standing. Its
    // stored second turn parks a failed run with a real structured
    // cause before any successor exists, so no settlement race can
    // dispatch the fit fixture while it is being arranged.
    const lane = await app.core.command("session.create", { projectId });
    await runTurn(app, lane.id, "Establish the queue-fit lane");
    await app.stop();
    await appendHistorySession(
      app.sharedSessionsDir,
      lane.id,
      queueFitFailureRecords(2, Date.now(), "park"),
    );
    await app.start();

    const next = await app.core.command("intent.queue", {
      projectId,
      text: QUEUE_FIT_TITLE,
    });
    await app.core.command("intent.queue", {
      projectId,
      text: "Review the migration notes after the compatibility audit",
    });

    const nextSchedule = async () => {
      const ledger = await app.core.command("ledger.get", {});
      return ledger.intents.find((row) => row.intent.id === next.id)?.next;
    };
    await expect.poll(nextSchedule).toEqual({
      standing: "failure-park",
      manualStart: false,
      cause: QUEUE_FIT_CAUSE,
    });

    const defects: string[] = [];
    // Leaving the failed state clears the park; the same turn's
    // runtime_error remains the latest lane outcome, so Start becomes
    // available while the phrase keeps the failure visible.
    await app.stop();
    await appendHistorySession(
      app.sharedSessionsDir,
      lane.id,
      queueFitFailureRecords(3, Date.now(), "unpark-and-fail"),
    );
    await app.start();
    await expect.poll(nextSchedule).toEqual({
      standing: "failed",
      manualStart: true,
      cause: QUEUE_FIT_CAUSE,
    });

    await open(page, app);
    await page.getByTestId(`sidebar-session-${deliveredSession.id}`).click();
    const deliveryCard = page.getByTestId(`delivery-card-${delivered.id}`);
    await expect(deliveryCard.getByTestId("delivery-confirm")).toBeEnabled();
    await deliveryCard.getByTestId("delivery-confirm").click();
    await expect(deliveryCard).toHaveAttribute("data-settled", "1");

    const resolvedTarget = (): QueueFitTarget => ({
      row: deliveryCard.getByTestId("resolved-next-row"),
      rowSelector: `[data-testid="delivery-card-${delivered.id}"] [data-testid="resolved-next-row"]`,
      textTestId: "resolved-next-text",
      title: deliveryCard.getByTestId("resolved-next-title"),
      standing: deliveryCard.getByTestId("resolved-next-standing"),
      queued: deliveryCard.getByTestId("resolved-next-queued"),
      fixed: [deliveryCard.getByTestId("upnext-start")],
    });
    await expect(
      deliveryCard.getByRole("button", { name: `Start ${QUEUE_FIT_TITLE}` }),
    ).toBeVisible();
    await sweepQueueFit(
      page,
      "Resolved delivery next row",
      resolvedTarget(),
      QUEUE_FIT_TITLE,
      QUEUE_FIT_FAILED_PHRASE,
      defects,
    );

    // At a roomy window the Captain pane's own floor is a second
    // independent width constraint, beyond the viewport matrix.
    await setRail(page, false);
    await page.setViewportSize({ width: 1280, height: TALL });
    const divider = page.getByTestId("captain-divider");
    const floor = await divider.getAttribute("aria-valuemin");
    if (!floor) throw new Error("Captain divider has no minimum");
    for (let step = 0; step < 30; step += 1) {
      if ((await divider.getAttribute("aria-valuenow")) === floor) break;
      await divider.press("ArrowLeft");
    }
    await expect(divider).toHaveAttribute("aria-valuenow", floor);
    await assertQueueFit(
      resolvedTarget(),
      QUEUE_FIT_TITLE,
      QUEUE_FIT_FAILED_PHRASE,
      "Resolved delivery next row · Captain pane floor",
      true,
    );
    record(
      "Resolved delivery next row · Captain pane floor",
      await measure(page, [resolvedTarget().rowSelector]),
      defects,
    );

    await page.getByRole("tab", { name: "Start another session" }).click();
    const homeCard = page.getByTestId("next-card");
    const homeTarget = (): QueueFitTarget => ({
      row: homeCard.getByTestId("next-row"),
      rowSelector: `[data-testid="next-card"] [data-testid="next-row"]`,
      textTestId: "next-text",
      title: homeCard.getByTestId("next-title"),
      standing: homeCard.getByTestId("next-standing"),
      queued: homeCard.getByTestId("next-queued"),
      fixed: [
        homeCard.getByTestId("next-start"),
        homeCard.getByTestId("next-remove"),
      ],
      count: homeCard.getByText("+1 more queued", { exact: true }),
    });
    await expect(
      homeCard.getByRole("button", { name: `Start ${QUEUE_FIT_TITLE}` }),
    ).toBeVisible();
    await sweepQueueFit(
      page,
      "Captain home next row",
      homeTarget(),
      QUEUE_FIT_TITLE,
      QUEUE_FIT_FAILED_PHRASE,
      defects,
    );

    // Close out the Run View fixture before restoring the park that
    // dashboard-43 requires. The Dashboard therefore measures its
    // own failure summons, not the delivery verdict used above.
    await app.stop();
    await appendHistorySession(
      app.sharedSessionsDir,
      lane.id,
      queueFitFailureRecords(4, Date.now(), "park"),
    );
    await app.start();
    await expect.poll(nextSchedule).toEqual({
      standing: "failure-park",
      manualStart: false,
      cause: QUEUE_FIT_CAUSE,
    });

    await open(page, app);
    await page.getByRole("button", { name: /^Dashboard\b/ }).click();
    const dashboardTarget = (): QueueFitTarget => ({
      row: page.getByTestId(`upnext-row-${next.id}`),
      rowSelector: `[data-testid="upnext-row-${next.id}"]`,
      textTestId: `upnext-text-${next.id}`,
      title: page.getByTestId(`upnext-title-${next.id}`),
      standing: page.getByTestId(`upnext-standing-${next.id}`),
      queued: page.getByTestId(`upnext-queued-${next.id}`),
      fixed: [page.getByTestId(`upnext-menu-${next.id}`)],
    });
    await expect(
      dashboardTarget().row.getByRole("button", { name: /^Start\b/ }),
    ).toHaveCount(0);
    await sweepQueueFit(
      page,
      "Dashboard parked-failure row",
      dashboardTarget(),
      QUEUE_FIT_TITLE,
      QUEUE_FIT_PARKED_PHRASE,
      defects,
    );

    await nav(page, "Projects").click();
    await page.getByRole("tab", { name: "Overview" }).click();
    await expect(page.getByTestId("overview-tab")).toBeVisible();
    await sweepQueueFit(
      page,
      "Overview parked-failure row",
      dashboardTarget(),
      QUEUE_FIT_TITLE,
      QUEUE_FIT_PARKED_PHRASE,
      defects,
    );

    expect(defects, defects.join("\n")).toEqual([]);
  });
});

// The at-hand popovers and the composer's queue are chrome the sweep
// above never opens, and both used to leave the window: the Captain's
// agent editor above the top edge with nothing able to scroll it back,
// the queue below the bottom with the page growing behind it. They are
// measured here at the same widths and heights (run-view-105).
test.describe("chrome the sweep does not open", () => {
  let releaseDiscovery: (() => void) | undefined;
  test.use({ appOptions: {
    project: true,
    agentDelayMs: 120_000,
    discoverAgentModels: async () => {
      await new Promise<void>((resolve) => { releaseDiscovery = resolve; });
      return { status: "available", models: [{ id: "fixture-model", name: "Fixture model" }] };
    },
  } });
  test.afterEach(() => releaseDiscovery?.());

  // An agent's settings editor hangs from a chip inside the player
  // grid, which scrolls sideways and is therefore the box that must show
  // it — the hardest anchor in the product (run-view-105, run-view-138).
  test("run-view-105: an agent's settings editor stays inside the box that must show it", async ({
    page,
    app,
  }) => {
    test.setTimeout(120_000);
    const defects: string[] = [];
    await page.setViewportSize({ width: 1280, height: TALL });
    await open(page, app);
    await setRail(page, false);
    await send(page, TASK);
    await expect(page.getByTestId("player-pane-dev.reviewer")).toBeVisible();
    const panel = page.getByTestId("agent-settings-dev.reviewer");

    for (const height of HEIGHTS) {
      for (const width of [320, 900]) {
        await page.setViewportSize({ width, height });
        // The last lane of the grid, reached by scrolling it to its end:
        // its chip is the anchor furthest from the window's edge.
        const grid = page.getByTestId("player-grid");
        await grid.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
        await page.getByTestId("agent-chip-dev.reviewer").click();
        await expect(panel).toBeVisible();
        if (releaseDiscovery) { releaseDiscovery(); releaseDiscovery = undefined; }
        const where = `agent settings editor · ${width}×${height}`;
        await expect(async () => {
          const fitDefects: string[] = [];
          const box = (await panel.boundingBox())!;
          if (box.x < -1) fitDefects.push(`${where}: left at ${Math.round(box.x)}`);
          if (box.x + box.width > width + 1) fitDefects.push(`${where}: right at ${Math.round(box.x + box.width)} of ${width}`);
          if (box.y < -1) fitDefects.push(`${where}: top at ${Math.round(box.y)}`);
          if (box.y + box.height > height + 1) fitDefects.push(`${where}: bottom at ${Math.round(box.y + box.height)} of ${height}`);
          // Its first control must be reachable, not merely inside.
          const first = (await panel.getByTestId("agent-dev.reviewer-model-mode").boundingBox())!;
          if (first.y < -1 || first.y + first.height > height + 1) {
            fitDefects.push(`${where}: the first field is outside the window`);
          }
          const grew = await page.evaluate(() => [
            document.documentElement.scrollWidth,
            document.documentElement.clientWidth,
            document.documentElement.scrollHeight,
            document.documentElement.clientHeight,
          ]);
          if (grew[0] > grew[1] + 1) fitDefects.push(`${where}: the page grew sideways to ${grew[0]} of ${grew[1]}`);
          if (grew[2] > grew[3] + 1) fitDefects.push(`${where}: the page grew to ${grew[2]} of ${grew[3]}`);
          expect(fitDefects, fitDefects.join("\n")).toEqual([]);
        }).toPass({ timeout: 2_000 }).catch((cause: unknown) => {
          defects.push(`${where}: ${cause instanceof Error ? cause.message : String(cause)}`);
        });
        await page.keyboard.press("Escape");
        await expect(panel).toHaveCount(0);
      }
    }
    expect(defects, defects.join("\n\n")).toEqual([]);
  });

  test("run-view-105: the home's agent popover and the queue stay in the window", async ({
    page,
    app,
  }) => {
    test.setTimeout(120_000);
    const defects: string[] = [];
    await page.setViewportSize({ width: 1280, height: TALL });
    await open(page, app);
    await expect(page.getByTestId("captain-home")).toBeVisible();
    // The 320px floor is stated with the sidebar collapsed (DR-041).
    await setRail(page, false);

    // (i) The gear sits at the foot of the home, so the room above it
    // shrinks with the window (run-view-32).
    const popover = page.getByTestId("agent-popover");
    for (const height of HEIGHTS) {
      for (const width of [320, 900]) {
        await page.setViewportSize({ width, height });
        await page.getByTestId("captain-settings").click();
        await expect(popover).toBeVisible();
        for (const phase of ["on opening", "after discovery"]) {
          if (phase === "on opening") {
            await expect(popover).toContainText("Loading model options…");
          } else {
            await expect.poll(() => Boolean(releaseDiscovery)).toBe(true);
            releaseDiscovery!();
            releaseDiscovery = undefined;
            await expect(popover).toContainText("Models reported by the installed runtime.");
          }
          const where = `agent popover · ${width}×${height} · ${phase}`;
          // Discovery can grow the visible editor before ResizeObserver
          // refits it. Retain a bounded poll's final failure so the other
          // viewports and the queue still contribute to the report.
          await expect(async () => {
            const fitDefects: string[] = [];
            const box = (await popover.boundingBox())!;
            if (box.y < -1) fitDefects.push(`${where}: top at ${Math.round(box.y)}`);
            if (box.y + box.height > height + 1) {
              fitDefects.push(`${where}: bottom at ${Math.round(box.y + box.height)} of ${height}`);
            }
            // The adapter picker is the first thing the dialog offers, and
            // was the first thing to go off the top edge.
            const adapter = (await page
              .getByTestId("agent-adapter-claude")
              .boundingBox())!;
            if (adapter.y < -1 || adapter.y + adapter.height > height + 1) {
              fitDefects.push(`${where}: the adapter picker is outside the window`);
            }
            const page_ = await page.evaluate(() => [
              document.documentElement.scrollHeight,
              document.documentElement.clientHeight,
            ]);
            if (page_[0] > page_[1] + 1) {
              fitDefects.push(`${where}: the page grew to ${page_[0]} of ${page_[1]}`);
            }
            expect(fitDefects, fitDefects.join("\n")).toEqual([]);
          }).toPass({ timeout: 2_000 }).catch((cause: unknown) => {
            defects.push(`${where}: ${cause instanceof Error ? cause.message : String(cause)}`);
          });
        }
        await page.keyboard.press("Escape");
        await expect(popover).toHaveCount(0);
      }
    }

    // (ii) A queue standing behind a long turn, measured at every
    // width and height (run-view-106).
    await page.setViewportSize({ width: 1280, height: TALL });
    await send(page, TASK);
    await expect(page.getByTestId("abort-button")).toBeVisible();
    const queue = page.getByTestId("queue-indicator");
    const field = page.getByTestId("boss-composer");
    for (let index = 1; index <= 6; index += 1) {
      await field.fill(`Queued ${index}: ${TASK}`);
      await page.getByRole("button", { name: "Send next", exact: true }).click();
      await expect(queue).toContainText(`Queued ${index}:`);
    }
    for (const width of WIDTHS) {
      for (const height of HEIGHTS) {
        await page.setViewportSize({ width, height });
        const where = `queue · ${width}×${height}`;
        // The frame stays a few entries tall however much is queued;
        // in a window too short for the composer alone it yields the
        // rest of the way, which is the ladder, not a defect.
        const frame = await queue.boundingBox();
        if (frame && frame.height > 200) {
          defects.push(`${where}: the queue frame is ${Math.round(frame.height)} tall`);
        }
        const primary = (await page.getByTestId("send-button").boundingBox())!;
        if (primary.y + primary.height > height + 1) {
          defects.push(
            `${where}: the send control ends at ${Math.round(primary.y + primary.height)} of ${height}`,
          );
        }
        record(where, await measure(page), defects);
      }
    }
    expect(defects, defects.join("\n")).toEqual([]);
  });
});

// A window laid out before it is shown reports no viewport height; the
// field keeps one row through that first paint and refits once the
// viewport has a size (run-view-106).
test("run-view-106: the field keeps one row without viewport height and refits on resize", async ({
  page,
  app,
}) => {
  await page.setViewportSize({ width: 1024, height: 1 });
  await open(page, app);
  const field = page.getByTestId("start-composer");
  const line = await field.evaluate((el) =>
    parseFloat(getComputedStyle(el).lineHeight),
  );
  const height = async (): Promise<number> =>
    (await field.boundingBox())?.height ?? 0;
  expect(await height()).toBeGreaterThanOrEqual(line);
  await field.fill("one\ntwo\nthree");
  expect(await height()).toBeGreaterThanOrEqual(line);
  await page.setViewportSize({ width: 1024, height: 800 });
  await expect.poll(height).toBeGreaterThanOrEqual(line * 3);
});
