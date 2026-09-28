// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The live lane — the regression of release-25 (DR-086): the machine's
// signed-in agents and the real Captain, run by `npm run regression`
// (SPEX_E2E_LIVE=1) before a regular app release and never in CI.
// run-view-104 observes a minimal no-change task to a player's live
// output and aborts it, under DR-020's budget. playbook-library-78
// authors a two-role changelog playbook, compiles it for real with the
// released slc on the compile player the journey picks — Codex's
// `gpt-6-astra` at `xhigh`, the only work the lane gives Codex — then
// registers it and runs it on the template's claude players. The
// new-project scenario lives in live-project.spec.ts.

import { parse } from "yaml";

import {
  test,
  expect,
  open,
  nav,
  send,
  git,
  LIVE,
  COMPILER_PLAYER,
  attachRun,
  awaitCaptainLine,
  commitCount,
  commitIdentity,
  expectEngaged,
  surfaceEntry,
} from "../src/harness";

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

test.describe("the changelog playbook", () => {
  // The compile player (DR-086): a roster player on Codex's
  // gpt-6-astra at xhigh, bound to no role, which this journey alone
  // picks as the draft's agent; the Captain and every player a
  // playbook runs stay on the template's claude.
  test.use({
    appOptions: {
      config: "none",
      project: true,
      compiler: { adapter: "codex", model: "gpt-6-astra", effort: "xhigh" },
    },
  });

  test("playbook-library-78 @live: a two-role changelog playbook is authored, compiled, registered, and run", async ({
    page,
    app,
  }) => {
    test.skip(!LIVE, "live lane only");
    // A compile has taken from minutes (DR-086) to two hours (DR-058),
    // the agent's own turns minutes each, and the run tens of minutes.
    test.setTimeout(200 * 60_000);
    const TURN = 10 * 60_000;
    await open(page, app);
    await nav(page, "Playbooks").click();
    // The seeded template configures every built-in, so no built-ins
    // section stands here; the New playbook field proves the surface.
    const idField = page.getByTestId("new-playbook-id");
    await expect(idField).toBeVisible();
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

    // The compile player answers from the first message on, so the
    // conversation and the compile run on its block (playbook-library-55,
    // playbook-library-42).
    const agent = page.getByTestId("draft-agent");
    await expect(agent).toContainText("Captain");
    await agent.click();
    const picker = page.getByTestId("agent-picker");
    const option = picker.getByTestId(`agent-option-${COMPILER_PLAYER}`);
    await expect(option, "the picker offers every roster player, one bound to no role included").toBeVisible();
    await option.click();
    await expect(picker).toHaveCount(0);
    await expect(agent).toContainText(COMPILER_PLAYER);
    await expect(
      thread.getByTestId("system-line").filter({
        hasText: `Now answering: ${COMPILER_PLAYER} — the conversation so far was replayed to it`,
      }),
    ).toBeVisible();

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
      // The reply landed and the composer is the Boss's again; Send
      // itself stays held while the field is empty.
      await expect(composer).toBeEnabled();
      await expect(composer).toHaveAttribute("placeholder", "Describe the playbook…");
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
    // The derived roles are the two (playbook-library-60), in the
    // casing the compiler emits: the released slc derives canonical
    // lowercase ids from a `Roles:` source.
    await expect(page.getByTestId("compile-roles")).toHaveText(/^roles: coder, reviewer$/i);
    await expect(
      thread.getByTestId("system-line").filter({ hasText: /Compiled — roles: coder, reviewer/i }),
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
    const playerFor = (role: string) => page.getByTestId(new RegExp(`^register-player-${role}$`, "i"));
    await expect(playerFor("coder")).not.toHaveValue("");
    await expect(playerFor("reviewer")).not.toHaveValue("");
    // The players that run the playbook stay on claude (DR-086): a role
    // left on a lane that is not claude's — the compile player, or a
    // new player, which carries the answering agent's block
    // (playbook-library-61), even one named like a roster lane it would
    // then overwrite — takes the template's player of its name.
    type Block = string | { adapter?: string } | undefined;
    const adapterOf = (block: Block) => (typeof block === "string" ? block : block?.adapter);
    const roster = (parse(app.readConfig()) as { players: Record<string, Block> }).players;
    for (const [role, fallback] of [
      ["coder", "dev.coder"],
      ["reviewer", "dev.reviewer"],
    ] as const) {
      const select = playerFor(role);
      if (adapterOf(roster[await select.inputValue()]) !== "claude") {
        await select.selectOption(fallback);
      }
    }
    await page.getByTestId("register-submit").click();
    await expect(page.getByTestId("playbook-card-changelog")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("drafts-section")).toHaveCount(0);
    await expect.poll(() => app.readConfig()).toContain("changelog:");
    const config = parse(app.readConfig()) as {
      players: Record<string, Block>;
      playbooks: Record<string, { roles: Record<string, unknown> }>;
    };
    const roles = config.playbooks.changelog.roles;
    expect(Object.keys(roles).map((role) => role.toLowerCase()).sort()).toEqual(["coder", "reviewer"]);
    const players = new Set<string>();
    for (const binding of Object.values(roles)) {
      const player = typeof binding === "string" ? binding : (binding as { player?: string }).player;
      expect(player, JSON.stringify(binding)).toBeTruthy();
      expect(adapterOf(config.players[player!]), `${player} runs on claude`).toBe("claude");
      players.add(player!);
    }

    // A new session's slash menu offers it.
    await surfaceEntry(page, "Workspace").click();
    const box = page.getByTestId("start-composer");
    await box.fill("/");
    await expect(page.getByRole("listbox")).toContainText("/changelog");

    // The registered playbook runs (DR-086): a session's /changelog
    // turn finishes with both role players engaged and the repository
    // carrying a commit of its notes (playbook-library-14).
    commitIdentity(app.projectDir);
    const head = git(app.projectDir, "rev-parse", "HEAD");
    const commits = commitCount(app.projectDir);
    await send(page, "/changelog Draft release notes for the commits so far into CHANGELOG.md and commit them.");
    const captain = page.getByTestId("captain-pane");
    await expect(captain).toBeVisible();
    await awaitCaptainLine(page, "/changelog finished", 45 * 60_000);
    await attachRun(page, "the run");
    await expect(captain).not.toContainText(/turn failed/i);
    for (const player of players) await expectEngaged(page, player);
    expect(commitCount(app.projectDir)).toBeGreaterThan(commits);
    await test.info().attach("the commits", {
      body: git(app.projectDir, "log", "--stat", `${head}..HEAD`),
      contentType: "text/plain",
    });
  });
});
