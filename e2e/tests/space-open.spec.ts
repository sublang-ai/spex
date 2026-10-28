// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Open on a server from this computer's Space (space-114, DR-159): the
// served shell's core signed in at the stand-in instance, which lists
// one team server of the member's group, a stand-in hub relaying to a
// further core standing for its seat — a plain served core signed in at
// the same instance as the same person, holding no project. The team
// group holds two projects neither core has. The journey activates
// "Open on lab-4" on the first project's row of this computer's Space
// and reads, through the page: the contract shown once and "I
// understand" sending `server.open`; the server's line reading
// "Connecting to lab-4…" and then "Connected"; the row reading "Opening
// on lab-4…" and then "On lab-4"; that seat's core having received
// `space.join` with no folder; the project standing under the server's
// heading in the sidebar; and a second "Open on lab-4", of the other
// project, sending its join at once with no contract. The stand-in seat
// is a plain core, not in seat mode, so it allocates no folder: once
// its join has cloned the records, the journey pairs them over that
// core's protocol with a folder of its own, as a seat's allocation
// would (space-103), and the page reads the project the seat then
// lists.

import { join, dirname } from "node:path";
import { mkdirSync } from "node:fs";
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
    host: true,
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

test("space-114: Open on <server> opens the seat, sends that seat's core the join with no folder, and the row reads On <server>", async ({
  page,
  app,
}) => {
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
  // group's heading, with Connect, no seat open there yet.
  const group = section.getByTestId(`space-group-${HOST_GROUP}`);
  const line = group.getByTestId(`space-server-${lab.place}`);
  await expect(line).toContainText("lab-4");
  await expect(line.getByTestId(`space-server-control-${lab.place}`)).toHaveText("Connect");

  // [space-111] the project's row offers this computer, then the server.
  const row = group.getByTestId(`space-row-${notes.key}`);
  await expect(row.getByTestId(`space-repo-${notes.key}`)).toHaveText("lab-notes");
  const openNotes = row.getByTestId(`space-row-open-${notes.key}`);
  await openNotes.click();
  const menu = page.getByTestId(`space-row-open-${notes.key}-menu`);
  await expect(menu.getByRole("menuitem")).toHaveText(["Open here", "Open on lab-4"]);
  await menu.getByTestId(`space-row-open-at-${lab.place}-${notes.key}`).click();

  // [space-111] [run-view-170] the first open of the seat on this device
  // shows the contract and sends nothing; "I understand" sends
  // `server.open` with consent.
  const contract = page.getByTestId(`space-server-contract-${lab.place}`);
  await expect(contract).toContainText("Opening a seat places your sign-in on lab-4.");
  expect(toHere("server.open")).toEqual([]);
  await expect(row.getByTestId(`space-repo-state-${notes.key}`)).toHaveText("Opening on lab-4…");
  // The line says the open runs, then that the seat is connected.
  const phrases: string[] = [];
  await page.exposeFunction("__spaceLine", (text: string) => phrases.push(text));
  await page.evaluate((testId) => {
    const watch = () => {
      const node = document.querySelector(`[data-testid="${testId}"]`);
      (window as unknown as { __spaceLine(text: string): void }).__spaceLine(node?.textContent ?? "");
    };
    new MutationObserver(watch).observe(document.body, { subtree: true, childList: true, characterData: true });
  }, `space-server-${lab.place}`);
  await page.getByTestId(`space-server-consent-${lab.place}`).click();
  await expect.poll(() => toHere("server.open")).toEqual([{ type: "server.open", instance: origin, serverId: lab.server.id, consented: true }]);
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

  // [space-1] the row reads "On lab-4", its Open now showing it there.
  await expect(row.getByTestId(`space-row-on-${lab.place}-${notes.key}`)).toHaveText("On lab-4", { timeout: 30_000 });
  await expect(row.getByTestId(`space-repo-state-${notes.key}`)).not.toHaveText("Opening on lab-4…");
  await openNotes.click();
  await expect(page.getByTestId(`space-row-open-${notes.key}-menu`).getByRole("menuitem")).toHaveText(["Open here", "Show on lab-4"]);
  await page.keyboard.press("Escape");

  // [space-111] the project stands under the server's heading in the
  // sidebar.
  const sidebar = page.getByTestId("sidebar");
  await expect(sidebar.getByRole("group", { name: "lab-4", exact: true }).getByTestId(`sidebar-project-${notes.key}@${lab.place}`)).toBeVisible({ timeout: 30_000 });

  // [space-111] a second "Open on lab-4", of the other project, sends
  // its join at once, with no contract.
  const toolsRow = group.getByTestId(`space-row-${tools.key}`);
  await toolsRow.getByTestId(`space-row-open-${tools.key}`).click();
  await page.getByTestId(`space-row-open-${tools.key}-menu`).getByTestId(`space-row-open-at-${lab.place}-${tools.key}`).click();
  await expect(contract).toHaveCount(0);
  await expect.poll(() => toSeat("space.join"), { timeout: 30_000 }).toEqual([
    { type: "space.join", instance: origin, hostId: notes.id },
    { type: "space.join", instance: origin, hostId: tools.id },
  ]);
  expect(toHere("server.open")).toHaveLength(1);
  await expect(toolsRow.getByTestId(`space-row-on-${lab.place}-${tools.key}`)).toHaveText("On lab-4", { timeout: 30_000 });
});
