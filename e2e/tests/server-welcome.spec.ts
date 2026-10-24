// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The server welcome page (run-view-175, DR-133): the served shell's
// core signed in at the stand-in instance, which lists one team server,
// a stand-in hub relaying to a further core standing for the person's
// seat — a plain served core signed in at the same instance as the same
// person, holding no project — while this computer shows an ordinary
// project start. The team group holds a spex repository the seat has
// not joined. In English and in Chinese, the journey opens the seat
// from the Groups surface and activates the server's heading in the
// sidebar, and reads through the page: the welcome page in its server
// form naming the server, with no local-folder action and no Academy
// action, fitting the desktop and the 320px sidebar floor; its primary
// action opening the palette, which lists the group's spex repository
// at that place, opening it there sending the seat's core a join with
// no folder; and its secondary action showing the Groups surface with
// the selector naming the server.

import { join, dirname } from "node:path";
import { seedDemoProject } from "@sublang/spex-core/testing";

import {
  HOST_GROUP,
  canonicalOrigin,
  expect,
  hostKey,
  instanceSection,
  openTranslated,
  rowsOf,
  surfaceEntry,
  tapSockets,
  test,
  type TeamServer,
} from "../src/harness";
import { expectOnboardingFit } from "../src/fit";

// Two cores sign in before the page opens — the seat's, then this
// computer's — and the seat's open may take thirty seconds: the budget
// covers the app's setup as well as the journey.
test.describe.configure({ timeout: 240_000 });

test.use({
  appOptions: {
    project: true,
    host: true,
    signedIn: true,
    servers: [{ name: "lab-3", seat: { host: true, signedIn: true } }],
  },
});

/** The `space.join` commands a socket carried. */
function joinsSent(sent: readonly string[]): Record<string, unknown>[] {
  return sent.flatMap((frame) => {
    try {
      const message = JSON.parse(frame) as Record<string, unknown>;
      if (message.type !== "space.join") return [];
      const { id: _id, ...fields } = message;
      return [fields];
    } catch {
      return [];
    }
  });
}

const COPY = [
  {
    locale: "en-US",
    lang: "en",
    close: "Close",
    headline: "Work on lab-3 from this computer.",
    openFromGroups: "Open a project from your groups",
    openGroups: "Open Groups",
  },
  {
    locale: "zh-CN",
    lang: "zh",
    close: "关闭",
    headline: "从本机在 lab-3 上工作。",
    openFromGroups: "从群组打开项目",
    openGroups: "打开群组",
  },
] as const;

for (const copy of COPY) {
  test.describe(`the server welcome page in ${copy.lang}`, () => {
    test.use({ locale: copy.locale, viewport: { width: 1440, height: 838 } });

    test("run-view-175: a seat holding no project greets the member with the server welcome page", async ({
      page,
      app,
    }) => {
      const host = app.host!;
      const [lab] = app.servers as [TeamServer];

      // The team group's spex repository, which the seat has not joined,
      // read by the seat's core before the page opens.
      const code = join(dirname(app.dataDir), "code-remote", "lab-notes");
      seedDemoProject(code);
      const repo = host.script.addRepository({
        group: HOST_GROUP,
        name: "lab-notes-spex",
        project: { format: 1, name: "lab-notes", remote: code },
      });
      const key = hostKey(host, `${HOST_GROUP}/lab-notes-spex`);
      const from = lab.seat.core.mark();
      await lab.seat.core.command("space.refresh", {});
      await lab.seat.core.waitSpace(from, (state) => rowsOf(state).some((row) => row.key === key), 60_000);

      const tap = tapSockets(page);
      await openTranslated(page, app);
      await expect(page.locator("html")).toHaveAttribute("lang", copy.lang);
      // This computer shows its ordinary project start.
      await expect(page.getByTestId("project-task-start")).toBeVisible();

      // The seat opened from the Groups surface (run-view-170).
      await surfaceEntry(page, "Space").click();
      const control = instanceSection(page, host)
        .getByTestId(`space-servers-${host.url}`)
        .getByTestId(`space-server-control-${lab.place}`);
      await control.click();
      await page.getByTestId(`space-server-consent-${lab.place}`).click();
      await expect(control).toHaveText(copy.close, { timeout: 30_000 });

      // [run-view-175] [run-view-168] the server's heading in the sidebar
      // shows that place on the Projects surface.
      await surfaceEntry(page, "Workspace").click();
      const sidebar = page.getByTestId("sidebar");
      const heading = sidebar.getByTestId("sidebar-place-heading").filter({ hasText: /^lab-3$/ });
      await expect(heading).toBeVisible({ timeout: 30_000 });
      await heading.click();

      // [run-view-175] [run-view-174] the welcome page in its server form,
      // naming the server, with no local-folder action and no Academy
      // action, nor the Captain's chrome.
      const welcome = page.getByTestId("welcome-home");
      await expect(welcome.getByRole("heading", { level: 1 })).toHaveText(copy.headline);
      await expect(welcome.getByTestId("home-add-project")).toHaveCount(0);
      await expect(welcome.getByTestId("home-academy")).toHaveCount(0);
      await expect(page.getByTestId("start-composer")).toHaveCount(0);
      await expect(page.getByTestId("captain-settings")).toHaveCount(0);
      const primary = welcome.getByTestId("home-open-from-groups");
      const secondary = welcome.getByTestId("home-open-groups");
      await expect(primary).toHaveText(copy.openFromGroups);
      await expect(secondary).toHaveText(copy.openGroups);
      await expect(heading).toHaveAttribute("aria-current", "location");

      // [run-view-175] it fits the desktop and the 320px sidebar floor.
      await expectOnboardingFit(page, `server welcome ${copy.lang}`);

      // [run-view-175] [run-view-174] the primary action opens the palette,
      // which lists the group's spex repository at that place; opening it
      // there sends the seat's core a join with no folder (run-view-169),
      // which it accepts.
      await primary.click();
      const palette = page.getByTestId("project-palette");
      await expect(palette).toBeVisible();
      const row = palette.getByTestId(`palette-join-${key}@${lab.place}`);
      await expect(row).toContainText("lab-notes-spex", { timeout: 30_000 });
      await row.click();
      const relay = `/seats/${encodeURIComponent(lab.place)}`;
      const sentToSeat = () =>
        tap.sockets.filter((socket) => new URL(socket.url).pathname === relay).flatMap((socket) => joinsSent(socket.sent));
      const sentHere = () =>
        tap.sockets.filter((socket) => new URL(socket.url).pathname !== relay).flatMap((socket) => joinsSent(socket.sent));
      await expect.poll(sentToSeat).toEqual([{ type: "space.join", instance: canonicalOrigin(host.url), hostId: repo.id }]);
      expect(sentHere()).toEqual([]);
      await expect(page.getByTestId("palette-error")).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(palette).toBeHidden();

      // [run-view-175] [run-view-168] the secondary action shows the Groups
      // surface, the selector naming the server.
      await secondary.click();
      await expect(surfaceEntry(page, "Space")).toHaveAttribute("aria-current", "page");
      await expect(page.getByTestId("space-surface")).toBeVisible();
      const selector = page.getByTestId("place-selector");
      await expect(selector).toHaveValue(lab.place);
      await expect(selector.locator("option:checked")).toHaveText("lab-3");
    });
  });
}
