// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Open on a server from this computer's Space (space-114, DR-159,
// DR-172): the served shell's core signed in at the stand-in instance,
// which lists one team server of the member's group, a stand-in hub
// relaying to a further core standing for its seat — a plain served core
// signed in at the same instance as the same person, holding no project.
// The team group holds two projects neither core has. The journey
// activates "Open on lab-4", offered beside the first project's primary
// "Open here" on its row of this computer's Space, and reads, through the
// page: its first activation sends `server.open` immediately, with no
// acknowledgement panel; the server's line reading
// "Connecting to lab-4…" and then "Connected"; the row reading "Opening
// on lab-4…" and then "On lab-4"; that seat's core having received
// `space.join` with no folder; the project standing under the server's
// heading in the sidebar; and a second "Open on lab-4", of the other
// project, sending its join at once. The stand-in seat
// is a plain core, not in seat mode, so it allocates no folder: once
// its join has cloned the records, the journey pairs them over that
// core's protocol with a folder of its own, as a seat's allocation
// would (space-103), and the page reads the project the seat then
// lists.

import { join, dirname } from "node:path";
import { mkdirSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { seedDemoProject } from "@sublang/spex-core/testing";

import {
  HOST_GROUP,
  canonicalOrigin,
  expect,
  git,
  hostKey,
  instanceSection,
  open,
  rowsOf,
  surfaceEntry,
  tapSockets,
  test,
  type TeamServer,
} from "../src/harness";

// Two cores sign in before the page opens — the seat's, then this
// computer's — and the seat's open may take thirty seconds.
test.describe.configure({ timeout: 240_000 });

test.use({
  appOptions: {
    project: true,
    host: { displayName: "Workshop Space" },
    signedIn: true,
    servers: [{ name: "lab-4", seat: { host: true, signedIn: true } }],
  },
});

/** The commands of one type a socket carried, without their ids. */
function commandsSent(sent: readonly string[], type: string): Record<string, unknown>[] {
  return sent.flatMap((frame) => {
    try {
      const message = JSON.parse(frame) as Record<string, unknown>;
      if (message.type !== type) return [];
      const { id: _id, ...fields } = message;
      return [fields];
    } catch {
      return [];
    }
  });
}

/** The project's single actions menu holding its other places
 * (space-1, space-111), opened where it is not standing. */
async function otherPlaces(page: Page, key: string): Promise<Locator> {
  const menu = page.getByTestId(`space-row-more-${key}-menu`);
  if ((await menu.count()) === 0) await page.getByTestId(`space-row-more-${key}`).click();
  await expect(menu).toBeVisible();
  return menu;
}

test("space-114: Open on <server> opens the seat, sends that seat's core the join with no folder, and the row reads On <server>", async ({
  page,
  app,
}, testInfo) => {
  const host = app.host!;
  const [lab] = app.servers as [TeamServer];
  const origin = canonicalOrigin(host.url);

  // The team group's two projects, which neither core has, read by both
  // cores before the page opens.
  const seeded = ["lab-notes", "lab-tools"].map((name) => {
    const code = join(dirname(app.dataDir), "code-remote", name);
    seedDemoProject(code);
    const repo = host.script.addRepository({
      group: HOST_GROUP,
      name: `${name}-spex`,
      project: { format: 1, name, remote: code },
    });
    return { name, code, id: repo.id, key: hostKey(host, `${HOST_GROUP}/${name}-spex`) };
  });
  const [notes, tools] = seeded as [(typeof seeded)[number], (typeof seeded)[number]];
  for (const core of [lab.seat.core, app.core]) {
    const from = core.mark();
    await core.command("space.refresh", {});
    await core.waitSpace(from, (state) => seeded.every((project) => rowsOf(state).some((row) => row.key === project.key)), 60_000);
  }

  const tap = tapSockets(page);
  await open(page, app);
  await surfaceEntry(page, "Space").click();
  const section = instanceSection(page, host);
  const relay = `/seats/${encodeURIComponent(lab.place)}`;
  const toSeat = (type: string) =>
    tap.sockets.filter((socket) => new URL(socket.url).pathname === relay).flatMap((socket) => commandsSent(socket.sent, type));
  const toHere = (type: string) =>
    tap.sockets.filter((socket) => new URL(socket.url).pathname !== relay).flatMap((socket) => commandsSent(socket.sent, type));

  // [space-1] [run-view-170] the server stands as one line under its
  // group's heading, by its name, with no control while no seat is open
  // there: the seat opens on "Open on lab-4" alone (DR-175).
  const group = section.getByTestId(`space-group-${HOST_GROUP}`);
  const line = group.getByTestId(`space-server-${lab.place}`);
  await expect(line).toContainText("lab-4");
  await expect(line.getByTestId(`space-server-control-${lab.place}`)).toHaveCount(0);
  await expect(line.getByTestId(`space-server-more-${lab.place}`)).toHaveCount(0);

  // [space-1] [space-111] the project's row offers this computer as its
  // primary control, "Open here", and the server beside it.
  const row = group.getByTestId(`space-row-${notes.key}`);
  await expect(row.getByTestId(`space-repo-${notes.key}`)).toHaveText("lab-notes");
  const openNotes = row.getByTestId(`space-row-open-${notes.key}`);
  await expect(openNotes).toHaveText("Open here");
  const menu = await otherPlaces(page, notes.key);
  await expect(menu.getByRole("menuitem")).toHaveText(["Explore records", "Open on lab-4"]);
  // Observe before activating: even the first open starts immediately,
  // without a contract or a second acknowledgement (run-view-170).
  const phrases: string[] = [];
  await page.exposeFunction("__spaceLine", (text: string) => phrases.push(text));
  await page.evaluate((testId) => {
    const watch = () => {
      const node = document.querySelector(`[data-testid="${testId}"]`);
      (window as unknown as { __spaceLine(text: string): void }).__spaceLine(node?.textContent ?? "");
    };
    new MutationObserver(watch).observe(document.body, { subtree: true, childList: true, characterData: true });
  }, `space-server-${lab.place}`);
  await menu.getByTestId(`space-row-open-at-${lab.place}-${notes.key}`).click();
  await expect.poll(() => toHere("server.open")).toEqual([{ type: "server.open", instance: origin, serverId: lab.server.id, consented: true }]);
  const contract = page.getByTestId(`space-server-contract-${lab.place}`);
  await expect(contract).toHaveCount(0);
  await expect(page.getByTestId(`space-server-consent-${lab.place}`)).toHaveCount(0);
  await expect(row.getByTestId(`space-repo-state-${notes.key}`)).toHaveText("Opening on lab-4…");
  await expect(line.getByTestId(`space-server-connected-${lab.place}`)).toHaveText("Connected", { timeout: 60_000 });
  expect(phrases.some((text) => text.includes("Connecting to lab-4…"))).toBe(true);

  // [space-111] once the seat is signed in, that seat's core alone is
  // sent `space.join` with no folder; the row reads "Opening on lab-4…"
  // meanwhile.
  await expect.poll(() => toSeat("space.join"), { timeout: 60_000 }).toEqual([{ type: "space.join", instance: origin, hostId: notes.id }]);
  expect(toHere("space.join")).toEqual([]);
  // The stand-in seat clones the records; a seat allocates the folder
  // its project runs in (space-103), which the journey stands in for.
  const cloned = await lab.seat.core.waitSpace(0, (state) => rowsOf(state).some((each) => each.key === notes.key && each.placements.some((placement) => placement.attached)), 60_000);
  expect(rowsOf(cloned).find((each) => each.key === notes.key)?.folder).toBeNull();
  const folder = join(dirname(lab.seat.dataDir), "seat-projects", "lab-notes");
  mkdirSync(dirname(folder), { recursive: true });
  git(dirname(folder), "clone", "-q", notes.code, folder);
  await lab.seat.core.command("project.rebind", { projectId: notes.key, path: folder });

  // [space-1] the row reads "On lab-4", its primary still "Open here"
  // and the server beside it now showing it there.
  await expect(row.getByTestId(`space-row-on-${lab.place}-${notes.key}`)).toHaveText("On lab-4", { timeout: 30_000 });
  await expect(row.getByTestId(`space-repo-state-${notes.key}`)).not.toHaveText("Opening on lab-4…");
  await expect(openNotes).toHaveText("Open here");
  await expect((await otherPlaces(page, notes.key)).getByRole("menuitem", { name: "Open on lab-4", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  // [space-111] the project stands under the server's heading in the
  // sidebar.
  const sidebar = page.getByTestId("sidebar");
  await expect(sidebar.getByRole("group", { name: "lab-4", exact: true }).getByTestId(`sidebar-project-${notes.key}@${lab.place}`)).toBeVisible({ timeout: 30_000 });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: testInfo.outputPath("direct-server-open-connected.png"), fullPage: true });

  // [space-111] a second "Open on lab-4", of the other project, sends
  // its join at once, with no terms.
  const toolsRow = group.getByTestId(`space-row-${tools.key}`);
  await (await otherPlaces(page, tools.key)).getByTestId(`space-row-open-at-${lab.place}-${tools.key}`).click();
  await expect(contract).toHaveCount(0);
  await expect.poll(() => toSeat("space.join"), { timeout: 30_000 }).toEqual([
    { type: "space.join", instance: origin, hostId: notes.id },
    { type: "space.join", instance: origin, hostId: tools.id },
  ]);
  expect(toHere("server.open")).toHaveLength(1);
  await expect(toolsRow.getByTestId(`space-row-on-${lab.place}-${tools.key}`)).toHaveText("On lab-4", { timeout: 30_000 });
});
