// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The live lane (run-view-104): the machine's signed-in agents and the
// real Captain, a minimal no-change task observed to a player's live
// output, then aborted — under DR-020's budget. Runs only with
// SPEX_E2E_LIVE=1. The changelog acceptance (playbook-library-78) rides
// the same lane with the released slc: a real compile of 30 to 120
// minutes, so it is never a CI gate (DR-058).

import { parse } from "yaml";

import { test, expect, open, nav, send, LIVE } from "../src/harness";

test.use({ appOptions: { config: "none", project: true } });

test("run-view-104 @live: a real /code task shows live output and aborts cleanly", async ({
  page,
  app,
}) => {
  test.skip(!LIVE, "live lane only");
  await open(page, app);
  await expect(page.getByTestId("captain-home")).toContainText("demo-project");
  // The seeded template's agents must be ready on this machine, or the
  // lane proves nothing: fail early, naming what is not signed in.
  await expect(page.getByTestId("captain-home")).not.toContainText(/aren't ready/i);

  await send(
    page,
    "/code Append a single line reading `smoke ok` to the end of README.md. Change nothing else.",
  );
  const captain = page.getByTestId("captain-pane");
  await expect(captain).toBeVisible();
  const attach = async (label: string) => {
    await test.info().attach(label, {
      body: [
        "--- captain ---",
        await captain.innerText(),
        "--- players ---",
        await page.getByTestId("player-grid").innerText(),
      ].join("\n"),
      contentType: "text/plain",
    });
  };

  // A player is dispatched and its pane fills with live output: the
  // running mark first, then real text from the agent.
  const running = page.getByTestId("player-running").first();
  await expect(running).toBeVisible({ timeout: 8 * 60_000 });
  const pane = page
    .getByTestId(/^player-pane-/)
    .filter({ has: page.getByTestId("player-running") })
    .first();
  await expect
    .poll(async () => (await pane.innerText()).length, { timeout: 8 * 60_000 })
    .toBeGreaterThan(200);
  await attach("live output");
  await expect(captain).not.toContainText(/turn failed/i);

  // Abort acknowledges at once and the turn ends aborted.
  const abort = page.getByTestId("abort-button");
  await abort.click();
  await expect(abort).toContainText(/aborting/i);
  await expect(captain).toContainText(/abort/i, { timeout: 90_000 });
  await expect(page.getByTestId("boss-composer")).toBeEnabled({ timeout: 90_000 });
  await attach("after abort");

  // Nothing ends (DR-051): the session reads idle with its composer
  // ready for the next message.
  await expect(page.getByTestId("end-session")).toHaveCount(0);
  await expect(page.getByTestId("history-notice")).toHaveCount(0);
});

test("playbook-library-78 @live: a two-role changelog playbook is authored, compiled, and registered", async ({
  page,
  app,
}) => {
  test.skip(!LIVE, "live lane only");
  // A real compile runs 30 to 120 minutes (DR-058); the agent's own
  // turns take minutes each.
  test.setTimeout(150 * 60_000);
  const TURN = 10 * 60_000;
  await open(page, app);
  await nav(page, "Playbooks").click();
  await expect(page.getByTestId("builtins-section")).toBeVisible();
  const idField = page.getByTestId("new-playbook-id");
  await idField.fill("changelog");
  await idField.press("Enter");
  await expect(page.getByTestId("authoring-workspace")).toBeVisible();
  const thread = page.getByTestId("draft-thread");
  const attach = async (label: string) => {
    await test.info().attach(label, {
      body: [
        "--- thread ---",
        await thread.innerText(),
        "--- source ---",
        await page.getByTestId("panel-source").innerText(),
      ].join("\n"),
      contentType: "text/plain",
    });
  };
  const composer = page.getByTestId("draft-composer");
  const sendButton = page.getByTestId("draft-send");
  const working = page.getByTestId("draft-working");
  const compileCards = thread.locator('[data-testid="directive-card"][data-kind="compile"]');

  await composer.fill(
    "a two-role changelog playbook: Coder drafts release notes from the commits since the last tag and commits them; Reviewer checks them against the commits",
  );
  await sendButton.click();
  await expect(working).toBeVisible();
  // The agent may ask one question before it writes; the Boss answers
  // by confirming the two roles and asking for the compile, until the
  // reply carries the compile request (playbook-library-66).
  for (let round = 0; round < 3; round += 1) {
    await expect(working).toHaveCount(0, { timeout: TURN });
    await expect(page.getByTestId("draft-send")).toBeEnabled();
    if ((await compileCards.count()) > 0) break;
    await attach(`reply ${round + 1} without a compile request`);
    await composer.fill(
      "Two roles, Coder and Reviewer, exactly as described; the source is ready — please compile it.",
    );
    await sendButton.click();
  }
  await expect(compileCards.first()).toBeVisible();
  // A source declaring Coder and Reviewer was written (playbook-library-56).
  const source = page.getByTestId("source-markdown");
  await expect(source).toContainText("Coder");
  await expect(source).toContainText("Reviewer");
  await attach("the compile request");

  // The agent's compile runs to Link (playbook-library-57).
  const band = page.getByTestId("compile-band");
  await expect(band).toHaveAttribute("data-outcome", "running", { timeout: 60_000 });
  await expect(page.getByTestId("compile-by")).toHaveText("asked by the agent");
  await expect(page.getByTestId("phase-link")).toHaveAttribute("data-status", "done", {
    timeout: 130 * 60_000,
  });
  await expect(page.getByTestId("draft-chip")).toContainText("Compiled", { timeout: TURN });
  // The derived roles are the two (playbook-library-60).
  await expect(page.getByTestId("compile-roles")).toHaveText("roles: Coder, Reviewer");
  await expect(
    thread.getByTestId("system-line").filter({ hasText: "Compiled — roles: Coder, Reviewer" }),
  ).toBeVisible();
  const proposal = thread.locator('[data-testid="directive-card"][data-kind="register"]');
  await expect(proposal).toBeVisible({ timeout: TURN });
  await expect(working).toHaveCount(0, { timeout: TURN });
  await attach("the proposal");

  // /changelog registered with a player per role (playbook-library-61).
  const tabs = page.getByRole("tablist", { name: "Draft artifacts" });
  await tabs.getByRole("tab", { name: "Register", exact: true }).click();
  await expect(page.getByTestId("register-form")).toContainText("Prefilled from the agent's proposal");
  await expect(page.getByTestId("register-command")).toHaveValue("changelog");
  await expect(page.getByTestId("register-player-Coder")).not.toHaveValue("");
  await expect(page.getByTestId("register-player-Reviewer")).not.toHaveValue("");
  await page.getByTestId("register-submit").click();
  await expect(page.getByTestId("playbook-card-changelog")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("drafts-section")).toHaveCount(0);
  await expect.poll(() => app.readConfig()).toContain("changelog:");
  const config = parse(app.readConfig()) as {
    playbooks: Record<string, { roles: Record<string, unknown> }>;
  };
  const roles = config.playbooks.changelog.roles;
  expect(Object.keys(roles).map((role) => role.toLowerCase()).sort()).toEqual(["coder", "reviewer"]);
  for (const binding of Object.values(roles)) {
    const player = typeof binding === "string" ? binding : (binding as { player?: string }).player;
    expect(player, JSON.stringify(binding)).toBeTruthy();
  }

  // A new session's slash menu offers it.
  await page.getByRole("button", { name: "Workspace" }).click();
  const box = page.getByTestId("start-composer");
  await box.fill("/");
  await expect(page.getByRole("listbox")).toContainText("/changelog");
});
