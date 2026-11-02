// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Projects shown where they are open (run-view-195, DR-175): the served
// shell's core signed in at the stand-in instance, which lists one team
// server of the member's group, a stand-in hub relaying to a further
// core standing for the person's seat — a plain served core signed in at
// the same instance as the same person, holding no project — while this
// computer holds no project either. The team group holds one project,
// its code at a path the harness serves. In English and in Chinese, the
// journey reads the sidebar and the palette, opens the project on the
// server from the palette and reads them again, through the page:
// before the open, no heading in the sidebar and no page of the server;
// the palette listing the project once under "From your groups" with
// "Open here" and "Open on <server>"; "Open on <server>" showing the
// terms once beneath the server's line and "I understand" sending
// `server.open`, the line reading "Connecting to <server>…" then
// "Connected"; the row reading "Opening on <server>…" and, once the seat
// lists the project, the server's heading in the sidebar with the
// project beneath it, "This computer" heading its rows; after
// Disconnect, no heading and the line reading the server's name with no
// control. Booted again with the group holding no project, the palette
// reads "No projects in your groups yet" under "From your groups". The
// stand-in seat is a plain core, not in seat mode, so it allocates no
// folder: once its join has cloned the records, the journey pairs them
// over that core's protocol with a folder of its own, as a seat's
// allocation would (space-103).

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
  openTranslated,
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
    host: true,
    signedIn: true,
    servers: [{ name: "lab-3", seat: { host: true, signedIn: true } }],
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

/** An entry of the menu beside a palette row's primary control, which
 * holds the row's other places (run-view-168), the menu opened where it
 * is not standing. */
async function paletteEntry(page: Page, key: string, testId: string): Promise<Locator> {
  const entry = page.getByTestId(testId);
  if ((await entry.count()) === 0) await page.getByTestId(`palette-join-places-${key}`).click();
  await expect(entry).toBeVisible();
  return entry;
}

const COPY = [
  {
    locale: "en-US",
    lang: "en",
    thisComputer: "This computer",
    openFromGroups: "Open a project from your groups",
    fromGroups: "From your groups",
    openHere: "Open here",
    openOn: "Open on lab-3",
    understand: "I understand",
    connecting: "Connecting to lab-3…",
    connected: "Connected",
    opening: "Opening on lab-3…",
    disconnect: "Disconnect",
    noProjects: "No projects in your groups yet",
  },
  {
    locale: "zh-CN",
    lang: "zh",
    thisComputer: "本机",
    openFromGroups: "从群组打开项目",
    fromGroups: "来自你的群组",
    openHere: "在这里打开",
    openOn: "在 lab-3 上打开",
    understand: "我已了解",
    connecting: "正在连接 lab-3…",
    connected: "已连接",
    opening: "正在 lab-3 上打开…",
    disconnect: "断开连接",
    noProjects: "你的群组还没有项目",
  },
] as const;

for (const copy of COPY) {
  test.describe(`the panel and the palette in ${copy.lang}`, () => {
    test.use({ locale: copy.locale });

    test("run-view-195: a group's project stands once in the palette, and a server heads the sidebar only while it holds the project", async ({
      page,
      app,
    }) => {
      const host = app.host!;
      const [lab] = app.servers as [TeamServer];
      const origin = canonicalOrigin(host.url);

      // The team group's one project, its code at a path the harness
      // serves, which neither core has, read by both cores before the
      // page opens.
      const code = join(dirname(app.dataDir), "code-remote", "lab-notes");
      seedDemoProject(code);
      const repo = host.script.addRepository({
        group: HOST_GROUP,
        name: "lab-notes-spex",
        project: { format: 1, name: "lab-notes", remote: code },
      });
      const key = hostKey(host, `${HOST_GROUP}/lab-notes-spex`);
      for (const core of [lab.seat.core, app.core]) {
        const from = core.mark();
        await core.command("space.refresh", {});
        await core.waitSpace(from, (state) => rowsOf(state).some((row) => row.key === key), 60_000);
      }

      const tap = tapSockets(page);
      await openTranslated(page, app);
      await expect(page.locator("html")).toHaveAttribute("lang", copy.lang);
      const relay = `/seats/${encodeURIComponent(lab.place)}`;
      const toSeat = (type: string) =>
        tap.sockets.filter((socket) => new URL(socket.url).pathname === relay).flatMap((socket) => commandsSent(socket.sent, type));
      const toHere = (type: string) =>
        tap.sockets.filter((socket) => new URL(socket.url).pathname !== relay).flatMap((socket) => commandsSent(socket.sent, type));

      // [run-view-195] [run-view-67] before the open, the sidebar shows
      // no heading, "This computer" none either, and no page of the
      // server: the welcome page is this computer's, its local-project
      // form standing and no server named on it.
      const sidebar = page.getByTestId("sidebar");
      const headings = sidebar.getByTestId("sidebar-place-heading");
      const welcome = page.getByTestId("welcome-home");
      await expect(welcome.getByTestId("home-add-project")).toBeVisible();
      await expect(headings).toHaveCount(0);
      await expect(welcome).not.toContainText("lab-3");
      await expect(page.getByTestId("home-open-groups")).toHaveCount(0);
      await expect(page.getByTestId("home-seat-signin")).toHaveCount(0);

      // [run-view-195] [run-view-168] the palette, opened at "From your
      // groups" from the welcome page, lists the project once — one row
      // in the whole palette, no section per place — by its name, never
      // its records', its row carrying "Open here" and, beside it,
      // "Open on lab-3".
      const openFromGroups = welcome.getByTestId("home-open-from-groups");
      await expect(openFromGroups).toHaveText(copy.openFromGroups);
      await openFromGroups.click();
      const palette = page.getByTestId("project-palette");
      await expect(palette).toBeVisible();
      await expect(palette.getByTestId("palette-groups-heading")).toHaveText(copy.fromGroups);
      const groups = palette.getByTestId("palette-groups");
      const row = groups.getByTestId(`palette-join-${key}`);
      await expect(row).toHaveCount(1, { timeout: 30_000 });
      await expect(palette.getByTestId(/^palette-join-(?!places-)/)).toHaveCount(1);
      await expect(groups).toContainText("lab-notes");
      await expect(groups).not.toContainText("lab-notes-spex");
      await expect(row).toContainText(copy.openHere);
      const openOn = await paletteEntry(page, key, `palette-open-at-${lab.place}-${key}`);
      await expect(openOn).toHaveText(copy.openOn);

      // The server's line, recorded as it changes.
      const lineId = `space-server-${lab.place}`;
      const phrases: string[] = [];
      await page.exposeFunction("__serverLine", (text: string) => phrases.push(text));
      await page.evaluate((testId) => {
        let last: string | undefined;
        const watch = () => {
          const text = document.querySelector(`[data-testid="${testId}"]`)?.textContent ?? undefined;
          if (text === undefined || text === last) return;
          last = text;
          (window as unknown as { __serverLine(text: string): void }).__serverLine(text);
        };
        new MutationObserver(watch).observe(document.body, { subtree: true, childList: true, characterData: true });
      }, lineId);

      // [run-view-195] [run-view-170] "Open on lab-3", no seat open
      // there, closes the palette and shows the Space surface with the
      // terms asked beneath the server's line under its group, as
      // bullets, sending nothing yet; the row reads "Opening on lab-3…"
      // meanwhile.
      await openOn.click();
      await expect(palette).toBeHidden();
      await expect(surfaceEntry(page, "Space")).toHaveAttribute("aria-current", "page");
      const group = instanceSection(page, host).getByTestId(`space-group-${HOST_GROUP}`);
      const line = group.getByTestId(lineId);
      await expect(line).toBeVisible();
      const contract = page.getByTestId(`space-server-contract-${lab.place}`);
      await expect(contract.getByRole("listitem").first()).toBeVisible();
      expect(toHere("server.open")).toEqual([]);
      await expect(group.getByTestId(`space-repo-state-${key}`)).toHaveText(copy.opening);

      // [run-view-195] [run-view-170] "I understand" sends `server.open`
      // with consent, once, the terms then gone; the line reads
      // "Connecting to lab-3…" and then "Connected".
      const consent = page.getByTestId(`space-server-consent-${lab.place}`);
      await expect(consent).toHaveText(copy.understand);
      await consent.click();
      await expect.poll(() => toHere("server.open")).toEqual([{ type: "server.open", instance: origin, serverId: lab.server.id, consented: true }]);
      await expect(contract).toHaveCount(0);
      await expect(page.getByTestId(`space-server-connected-${lab.place}`)).toHaveText(copy.connected, { timeout: 60_000 });
      expect(phrases.some((text) => text.includes(copy.connecting))).toBe(true);

      // [run-view-195] [run-view-168] once the seat is signed in, that
      // seat's core alone is sent `space.join` with no folder.
      await expect.poll(() => toSeat("space.join"), { timeout: 60_000 }).toEqual([{ type: "space.join", instance: origin, hostId: repo.id }]);
      expect(toHere("space.join")).toEqual([]);
      // The stand-in seat clones the records; a seat allocates the folder
      // its code runs in (space-103), which the journey stands in for.
      const cloned = await lab.seat.core.waitSpace(
        0,
        (state) => rowsOf(state).some((each) => each.key === key && each.placements.some((placement) => placement.attached)),
        60_000,
      );
      expect(rowsOf(cloned).find((each) => each.key === key)?.folder).toBeNull();
      const folder = join(dirname(lab.seat.dataDir), "seat-projects", "lab-notes");
      mkdirSync(dirname(folder), { recursive: true });
      git(dirname(folder), "clone", "-q", code, folder);
      await lab.seat.core.command("project.rebind", { projectId: key, path: folder });

      // [run-view-195] [run-view-67] [run-view-168] the server's heading
      // appears in the sidebar with the project beneath it, "This
      // computer" heading its rows from then on.
      await expect(
        sidebar.getByRole("group", { name: "lab-3", exact: true }).getByTestId(`sidebar-project-${key}@${lab.place}`),
      ).toContainText("lab-notes", { timeout: 30_000 });
      await expect(headings).toHaveText([copy.thisComputer, "lab-3"]);
      expect(toHere("server.open")).toHaveLength(1);

      // [run-view-195] [run-view-170] after Disconnect, in the server's
      // line's overflow, the heading is gone — no heading stands, the
      // seat closed — and the line reads the server's name with no
      // control.
      await surfaceEntry(page, "Space").click();
      await line.getByTestId(`space-server-more-${lab.place}`).click();
      const disconnect = page.getByTestId(`space-server-disconnect-${lab.place}`);
      await expect(disconnect).toHaveText(copy.disconnect);
      await disconnect.click();
      await expect(headings).toHaveCount(0, { timeout: 30_000 });
      await expect(sidebar.getByTestId(`sidebar-project-${key}@${lab.place}`)).toHaveCount(0);
      await expect(line).toHaveText("lab-3");
      await expect(page.getByTestId(`space-server-control-${lab.place}`)).toHaveCount(0);
      await expect(page.getByTestId(`space-server-more-${lab.place}`)).toHaveCount(0);
    });

    test("run-view-195: a group holding no project reads No projects in your groups yet in the palette", async ({ page, app }) => {
      await openTranslated(page, app);
      await expect(page.locator("html")).toHaveAttribute("lang", copy.lang);

      // [run-view-195] [run-view-168] booted again with the group holding
      // no project, the palette reads "No projects in your groups yet"
      // under "From your groups", listing nothing to open.
      await page.getByTestId("welcome-home").getByTestId("home-open-from-groups").click();
      const palette = page.getByTestId("project-palette");
      await expect(palette).toBeVisible();
      await expect(palette.getByTestId("palette-groups-heading")).toHaveText(copy.fromGroups);
      await expect(palette.getByTestId("palette-groups-note")).toHaveText(copy.noProjects, { timeout: 30_000 });
      await expect(palette.getByTestId(/^palette-join-/)).toHaveCount(0);
    });
  });
}
