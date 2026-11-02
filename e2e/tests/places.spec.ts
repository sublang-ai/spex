// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// One desktop over several cores (run-view-173, DR-133): the served
// shell's core signed in at the stand-in instance, which lists two team
// servers, each a stand-in hub over TLS relaying to a further core
// standing as the person's seat — plain served cores on scratch roots of
// their own, not in seat mode, so each takes a project registered by
// folder, and signed in at the instance already, since a core not in
// seat mode takes no ticket to sign in on (git-host-27). This computer and the first seat each hold a finished turn
// nobody has read, the second seat a question, and the first seat a tool
// approval waiting. The team group holds two projects no core has.
// The journey opens both seats by "Open on <server>" on those projects'
// rows of the Space surface, where the servers' lines stand under their
// group with no control of their own, and reads, through the page
// alone: each place's projects under its own heading and the selector
// naming the three places; one queue carrying the three cores'
// attention in each band's order, the badge counting them, an entry
// opened at its own place; an approval answered at its seat; a seat
// whose hello carries another protocol version read as mismatched
// alone; no bearer in any frame the page received; and, after
// Disconnect, the seat's heading gone, its line reading its name alone
// and its relay path refused, a later "Open on <server>" sending at
// once. The stand-in seats are plain cores, not in seat mode: a join
// clones the records there and allocates no folder (space-103), so each
// seat lists the projects registered there alone.

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import WebSocket from "ws";
import { PROTOCOL_VERSION } from "@sublang/spex-core";
import { seedDemoProject } from "@sublang/spex-core/testing";

import {
  HOST_GROUP,
  expect,
  hostKey,
  instanceSection,
  nav,
  open,
  registerLocalProject,
  rowsOf,
  runTurn,
  surfaceEntry,
  tapSockets,
  test,
  type App,
  type TeamServer,
} from "../src/harness";

/** The tool approval the first seat's coder asks for (approvals-5). */
const APPROVAL = {
  toolName: "desktop.inspect",
  input: { app: "Lab Example", action: "read-window", target: "the lab window" },
  reason: "Inspect only the lab window",
  details: { title: "Read the lab window?", description: "The inspector wants to read the lab window." },
};
const APPROVAL_TURN = "Inspect the lab fixture";

test.use({
  appOptions: {
    project: true,
    host: true,
    signedIn: true,
    servers: [
      {
        name: "lab-1",
        seat: {
          host: true,
          signedIn: true,
          approvalRules: [
            {
              match: `Implement: ${APPROVAL_TURN}`,
              response: { approval: APPROVAL, result: "Inspected the lab window", writes: { "approval-effect.txt": "once" } },
            },
          ],
        },
      },
      { name: "lab-2", seat: { host: true, signedIn: true } },
    ],
  },
});

/** A session at a core with one finished turn nobody has read: its
 * review entry in the finished band (dashboard-54). */
async function unreadTurn(core: App, projectId: string, text: string): Promise<string> {
  const session = await core.core.command("session.create", { projectId });
  await runTurn(core, session.id, text);
  return session.id;
}

/** The `server.open` commands the page sent. */
function opensSent(sent: readonly string[]): { instance: string; serverId: string; consented?: boolean }[] {
  return sent.flatMap((frame) => {
    try {
      const message = JSON.parse(frame) as { type?: string; instance: string; serverId: string; consented?: boolean };
      return message.type === "server.open" ? [{ instance: message.instance, serverId: message.serverId, consented: message.consented }] : [];
    } catch {
      return [];
    }
  });
}

/** The menu beside a project's primary control on its Space row,
 * holding its other places (space-1, space-111), opened where it is not
 * standing. */
async function otherPlaces(page: Page, key: string): Promise<Locator> {
  const menu = page.getByTestId(`space-row-places-${key}-menu`);
  if ((await menu.count()) === 0) await page.getByTestId(`space-row-places-${key}`).click();
  await expect(menu).toBeVisible();
  return menu;
}

/** A seat's clone of a group project's records once the join the page
 * sent it landed (space-111): the stand-in seat allocates no folder
 * (space-103), so it lists no project of it. */
async function joinLanded(seat: App, key: string): Promise<void> {
  await seat.core.waitSpace(
    0,
    (state) => rowsOf(state).some((row) => row.key === key && row.sync.phase === "idle" && row.placements.some((placement) => placement.attached)),
    60_000,
  );
}

/** A WebSocket at a path of the local core's endpoint with its token:
 * the status it was refused with, or "open". */
function dial(app: App, path: string): Promise<number | "open"> {
  const url = `${app.origin.replace(/^http/, "ws")}${path}?token=${encodeURIComponent(app.token)}`;
  return new Promise((resolve) => {
    const socket = new WebSocket(url);
    socket.on("unexpected-response", (_request, response) => {
      response.resume();
      socket.terminate();
      resolve(response.statusCode ?? 0);
    });
    socket.on("error", () => resolve(0));
    socket.once("open", () => {
      socket.close();
      resolve("open");
    });
  });
}

test("run-view-173: one desktop opens two seats and reads its places, its joined queue and its relays through the page", async ({
  page,
  app,
}) => {
  test.setTimeout(240_000);
  const host = app.host!;
  const [one, two] = app.servers as [TeamServer, TeamServer];

  // Each core's project and attention: the first seat's unread turn
  // oldest, then this computer's, then the second seat's question —
  // the scripted Captain parks a turn opening with "Ask" on one — so
  // neither band's order is the places' order; and at the first seat,
  // in a project of its own so the unread session keeps its lane, a
  // tool approval waiting.
  const projectOne = await registerLocalProject(one.seat, "lab-one-work");
  const toolsOne = await registerLocalProject(one.seat, "lab-one-tools");
  const projectTwo = await registerLocalProject(two.seat, "lab-two-work");
  const localProject = app.projectId!;
  const sessionOne = await unreadTurn(one.seat, projectOne.key, "Summarize the lab-one notes");
  const sessionLocal = await unreadTurn(app, localProject, "Summarize this computer's notes");
  const sessionTwo = await unreadTurn(two.seat, projectTwo.key, "Ask whether the lab-two archive moves too");
  const asking = await one.seat.core.command("session.create", { projectId: toolsOne.key });
  await one.seat.core.command("turn.submit", { sessionId: asking.id, text: APPROVAL_TURN });
  await expect.poll(async () => (await one.seat.core.command("approval.list", {})).pending.length, { timeout: 30_000 }).toBe(1);

  // The team group's two projects, which no core has, read by every
  // core before the page opens: each seat opens on "Open on <server>" of
  // one of them (run-view-170).
  const seeded = ["lab-notes", "lab-tools"].map((name) => {
    const code = join(dirname(app.dataDir), "code-remote", name);
    seedDemoProject(code);
    host.script.addRepository({ group: HOST_GROUP, name: `${name}-spex`, project: { format: 1, name, remote: code } });
    return hostKey(host, `${HOST_GROUP}/${name}-spex`);
  });
  const [notes, tools] = seeded as [string, string];
  for (const core of [one.seat.core, two.seat.core, app.core]) {
    const from = core.mark();
    await core.command("space.refresh", {});
    await core.waitSpace(from, (state) => seeded.every((key) => rowsOf(state).some((row) => row.key === key)), 60_000);
  }

  const tap = tapSockets(page);
  await open(page, app);

  // [run-view-173] [run-view-170] the Space surface lists both servers
  // as lines under their group's heading, each by its name alone, with
  // no control while no seat is open there: a seat opens on "Open on
  // <server>" alone.
  await nav(page, "Space").click();
  const group = instanceSection(page, host).getByTestId(`space-group-${HOST_GROUP}`);
  const servers = group.getByTestId(`space-group-servers-${HOST_GROUP}`);
  const rowOne = servers.getByTestId(`space-server-${one.place}`);
  const rowTwo = servers.getByTestId(`space-server-${two.place}`);
  await expect(rowOne).toHaveText("lab-1");
  await expect(rowTwo).toHaveText("lab-2");
  const controlOne = page.getByTestId(`space-server-control-${one.place}`);
  const controlTwo = page.getByTestId(`space-server-control-${two.place}`);
  const moreOne = page.getByTestId(`space-server-more-${one.place}`);
  const moreTwo = page.getByTestId(`space-server-more-${two.place}`);
  await expect(controlOne).toHaveCount(0);
  await expect(controlTwo).toHaveCount(0);
  await expect(moreOne).toHaveCount(0);
  await expect(moreTwo).toHaveCount(0);

  // [run-view-173] [run-view-170] the first "Open on lab-1", on a group
  // project's row, shows the terms as bullets — the Space sign-in placed
  // on the server, private packages needing a separate registry sign-in
  // there — naming neither seat nor ticket (DR-172), and asks nothing
  // yet; "I understand" sends `server.open` with consent.
  await expect(group.getByTestId(`space-row-${notes}`)).toBeVisible();
  await (await otherPlaces(page, notes)).getByTestId(`space-row-open-at-${one.place}-${notes}`).click();
  const contract = page.getByTestId(`space-server-contract-${one.place}`);
  await expect(contract.getByRole("listitem").first()).toBeVisible();
  await expect(contract).toContainText("Space sign-in on lab-1");
  await expect(contract).toContainText("separate registry sign-in on lab-1");
  await expect(contract).not.toContainText(/\b(seats?|tickets?)\b/i);
  expect(opensSent(tap.sent)).toEqual([]);
  expect(one.hub.admissions).toEqual([]);
  await page.getByTestId(`space-server-consent-${one.place}`).getByText("I understand").click();
  // Open, the line holds its overflow, which holds Disconnect, and still
  // no control of its own (run-view-170).
  await expect(moreOne).toBeVisible({ timeout: 30_000 });
  await expect(controlOne).toHaveCount(0);
  await expect.poll(() => opensSent(tap.sent)).toEqual([{ instance: host.url, serverId: one.server.id, consented: true }]);
  expect(one.hub.admissions.map((admission) => admission.status)).toEqual([200]);
  // [run-view-170] the seat, signed in at the instance, reads Connected
  // with no page to approve (core-service-142).
  await expect(page.getByTestId(`space-server-connected-${one.place}`)).toHaveText("Connected", { timeout: 30_000 });
  await expect(page.getByTestId(`space-server-approve-${one.place}`)).toHaveCount(0);
  await joinLanded(one.seat, notes);

  // The second server's first "Open on lab-2" on this computer, of the
  // other project, shows its own terms (run-view-170): understood, it
  // opens too, reading Connected with its overflow.
  await (await otherPlaces(page, tools)).getByTestId(`space-row-open-at-${two.place}-${tools}`).click();
  await expect(page.getByTestId(`space-server-contract-${two.place}`)).toContainText("Space sign-in on lab-2");
  await expect(page.getByTestId(`space-server-contract-${two.place}`)).toContainText("separate registry sign-in on lab-2");
  await page.getByTestId(`space-server-consent-${two.place}`).click();
  await expect(moreTwo).toBeVisible({ timeout: 30_000 });
  await expect(controlTwo).toHaveCount(0);
  await expect.poll(() => opensSent(tap.sent).at(-1)).toEqual({ instance: host.url, serverId: two.server.id, consented: true });
  await expect(page.getByTestId(`space-server-connected-${two.place}`)).toHaveText("Connected", { timeout: 30_000 });
  await joinLanded(two.seat, tools);

  // [run-view-173] [run-view-168] the selector names the three places.
  await expect(page.getByTestId("place-selector").locator("option")).toHaveText(["This computer", "lab-1", "lab-2"]);

  // [run-view-173] [run-view-168] the sidebar lists each place's
  // projects under a heading naming the place, this computer's rows
  // keeping their ids.
  const sidebar = page.getByTestId("sidebar");
  await expect(sidebar.getByTestId("sidebar-place-heading")).toHaveText(["This computer", "lab-1", "lab-2"]);
  const groupOf = (name: string) => sidebar.getByRole("group", { name, exact: true });
  await expect(groupOf("This computer").getByTestId(`sidebar-project-${localProject}`)).toBeVisible();
  await expect(groupOf("lab-1").getByTestId(`sidebar-project-${projectOne.key}@${one.place}`)).toContainText("lab-one-work");
  await expect(groupOf("lab-1").getByTestId(`sidebar-project-${toolsOne.key}@${one.place}`)).toContainText("lab-one-tools");
  await expect(groupOf("lab-2").getByTestId(`sidebar-project-${projectTwo.key}@${two.place}`)).toContainText("lab-two-work");
  await expect(groupOf("This computer")).not.toContainText("lab-one-work");
  await expect(groupOf("lab-1")).not.toContainText("lab-two-work");

  // [run-view-173] [run-view-168] one queue carries the three cores'
  // attention in each band's order — the interrupted band first, each
  // band by onset across the places, not by place — and the badge counts
  // them (dashboard-9). The rail's entry is found by what it is: its
  // name carries the badge's count.
  await surfaceEntry(page, "Dashboard").click();
  const queue = page.getByTestId("attention-queue");
  await expect(queue.locator("[data-band]")).toHaveCount(3, { timeout: 30_000 });
  expect(await queue.locator("[data-band]").evaluateAll((rows) => rows.map((row) => [row.getAttribute("data-testid"), row.getAttribute("data-band")]))).toEqual([
    [`attention-${sessionTwo}-question`, "interrupted"],
    [`attention-${sessionOne}-review`, "finished"],
    [`attention-${sessionLocal}-review`, "finished"],
  ]);
  await expect(page.getByTestId("nav-attention-badge")).toHaveText("3");

  // [run-view-173] [run-view-168] an entry opened from the queue opens
  // at its own place: the first seat's session, shown from its store.
  await queue.getByTestId(`attention-${sessionOne}-review`).getByRole("button", { name: /^Open Summarize the lab-one notes/ }).click();
  await expect(page.getByTestId("captain-pane")).toContainText("Summarize the lab-one notes");
  await expect(page.getByTestId(`sidebar-session-${sessionOne}@${one.place}`)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("nav-attention-badge")).toHaveText("2");

  // [run-view-173] [run-view-168] the approval waiting at the first seat
  // stands in the one inbox, named by its place, and is answered at that
  // seat: its core's request clears and the approved effect lands there.
  await page.getByRole("button", { name: "Tool approvals (1)", exact: true }).click();
  const inbox = page.getByRole("region", { name: "Tool approvals", exact: true });
  const card = inbox.locator(`[data-approval-place="${one.place}"]`);
  await expect(card.getByTestId("approval-place")).toHaveText("lab-1");
  await expect(card).toContainText("Read the lab window?");
  await card.getByRole("button", { name: "Approve once", exact: true }).click();
  await expect(inbox).toHaveCount(0);
  await expect.poll(async () => (await one.seat.core.command("approval.list", {})).pending).toEqual([]);
  await expect.poll(() => existsSync(join(toolsOne.dir, "approval-effect.txt"))).toBe(true);
  expect(existsSync(join(app.projectDir, "approval-effect.txt"))).toBe(false);
  expect(existsSync(join(projectTwo.dir, "approval-effect.txt"))).toBe(false);
  // The approved turn settles at its seat and waits there unread,
  // counted beside this computer's and the second seat's.
  await expect
    .poll(async () => (await one.seat.core.command("session.list", {})).find((session) => session.id === asking.id)?.turnActive, { timeout: 30_000 })
    .toBe(false);
  await surfaceEntry(page, "Dashboard").click();
  await expect(queue.getByTestId(`attention-${asking.id}-review`)).toBeVisible();
  await expect(page.getByTestId("nav-attention-badge")).toHaveText("3");

  // [run-view-173] [run-view-168] the second seat restarts and the hub
  // answers its hello with another protocol version: that place reads
  // mismatched alone, the first seat and this computer standing open.
  two.hub.helloVersion(PROTOCOL_VERSION + 1);
  await two.seat.stop();
  await two.seat.start();
  const banner = (place: string) => page.locator(`[data-place="${place}"]`);
  await expect(banner(two.place)).toHaveText(
    "lab-2 speaks a different protocol version than this window — it needs the same Spex release as this app.",
    { timeout: 30_000 },
  );
  await expect(banner(one.place)).toHaveCount(0);
  await expect(banner("local")).toHaveCount(0);
  await expect(page.getByText(/Reconnecting to the Spex core/)).toHaveCount(0);
  await expect(groupOf("lab-1").getByTestId(`sidebar-project-${projectOne.key}@${one.place}`)).toBeVisible();
  // A mismatched place adds nothing to the badge (dashboard-9).
  await expect(page.getByTestId("nav-attention-badge")).toHaveText("2");

  // [run-view-173] [run-view-169] [run-view-170] after Disconnect the
  // seat's heading is gone, its line reads its name with no control,
  // and its relay path is refused.
  await nav(page, "Space").click();
  await moreOne.click();
  await page.getByTestId(`space-server-disconnect-${one.place}`).click();
  await expect(moreOne).toHaveCount(0, { timeout: 30_000 });
  await expect(rowOne).toHaveText("lab-1");
  await expect(controlOne).toHaveCount(0);
  await expect(sidebar.getByTestId("sidebar-place-heading")).toHaveText(["This computer", "lab-2"]);
  await expect(groupOf("lab-1")).toHaveCount(0);
  expect(await dial(app, `/seats/${encodeURIComponent(one.place)}`)).toBe(401);
  // [run-view-173] [run-view-170] a later "Open on lab-1" on this
  // computer, of the project that seat lacks, sends `server.open` at
  // once, with no terms shown.
  const opens = opensSent(tap.sent).length;
  await (await otherPlaces(page, tools)).getByTestId(`space-row-open-at-${one.place}-${tools}`).click();
  await expect(page.getByTestId(`space-server-contract-${one.place}`)).toHaveCount(0);
  await expect(moreOne).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => opensSent(tap.sent).slice(opens)).toEqual([{ instance: host.url, serverId: one.server.id, consented: true }]);
  // The seat's heading is back, after the seat still open, as the core
  // now lists the seats (run-view-168).
  await expect(sidebar.getByTestId("sidebar-place-heading")).toHaveText(["This computer", "lab-2", "lab-1"]);
  await expect(groupOf("lab-1").getByTestId(`sidebar-project-${projectOne.key}@${one.place}`)).toBeVisible();
  await joinLanded(one.seat, tools);

  // [run-view-173] [run-view-168] no frame the page received, nor any
  // URL it dialed, carries a bearer a hub minted or the seat's endpoint:
  // the page reaches each seat at its relay path alone.
  const local = app.origin.replace(/^http/, "ws");
  expect(tap.urls.filter((url) => !url.startsWith(`${local}/`))).toEqual([]);
  // Nor any ticket the instance minted (core-service-128).
  expect(host.script.tickets).toHaveLength(3);
  for (const { ticket } of host.script.tickets) expect(tap.received.filter((frame) => frame.includes(ticket))).toEqual([]);
  const issued = [...one.hub.admissions, ...two.hub.admissions].filter((admission) => admission.status === 200);
  expect(issued).toHaveLength(3);
  expect(tap.received.length).toBeGreaterThan(0);
  for (const { bearer, endpoint } of issued) {
    expect(bearer).toBeTruthy();
    expect(tap.received.filter((frame) => frame.includes(bearer!))).toEqual([]);
    expect(tap.received.filter((frame) => frame.includes(endpoint!))).toEqual([]);
    expect(tap.urls.filter((url) => url.includes(bearer!))).toEqual([]);
  }
});
