// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The live lane — the regression of release-25 (DR-086, DR-089): the
// machine's signed-in agents and the real Captain, run by `npm run
// regression` (SPEX_E2E_LIVE=1) before a regular app release and never
// in CI. The live smoke observes a real /code to live output and aborts
// it (DR-089), so the lane does not repeat it. Both compiles run for
// real with the released slc on the compile player the journey picks —
// Codex's `gpt-6-astra` at `xhigh`, the only work the lane gives Codex
// — and the compiled playbooks run on the template's claude players.
// playbook-library-86 pastes the app's own example, a fixed source, so
// a refusal of its first compile is the app's; with
// SPEX_E2E_CAPTURE_COMPILED=<dir> it also
// copies the compiler's output there, the capture that renews the
// hermetic journey's committed fixture (playbook-library-87,
// e2e/fixtures/compiled/README.md). playbook-library-78 authors a
// two-role changelog playbook in chat, the harder case. A question a
// player asks in either run is answered through the Captain with one
// neutral reply, attached to the report (DR-089). The new-project
// scenario lives in live-project.spec.ts.

import { resolve } from "node:path";
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
  EXAMPLE_ID,
  answeringWith,
  attachRun,
  awaitCaptainLine,
  captureCompiled,
  commitCount,
  commitIdentity,
  expectEngaged,
  surfaceEntry,
} from "../src/harness";

test.use({ appOptions: { config: "none", project: true } });

/** The compile player (DR-086): a roster player on Codex's gpt-6-astra
 * at xhigh, bound to no role, which a journey alone picks as a draft's
 * agent; the Captain and every player a playbook runs stay on the
 * template's claude. */
const COMPILER = { adapter: "codex", model: "gpt-6-astra", effort: "xhigh" } as const;

/** The example's title, its derived intent (playbook-library-61). */
const EXAMPLE_TITLE = "Two-Agent Change-and-Review Workflow";

/** An agent block as the config writes it: a shorthand or a block. */
type Block = string | { adapter?: string } | undefined;
const adapterOf = (block: Block) => (typeof block === "string" ? block : block?.adapter);

test.describe("the app's own example", () => {
  test.use({ appOptions: { config: "none", project: true, compiler: COMPILER } });

  test("playbook-library-86 @live: the pasted example compiles for real, registers on the form's prefill, and runs", async ({
    page,
    app,
  }) => {
    test.skip(!LIVE, "live lane only");
    // The compile has taken minutes to two hours (DR-058), the run of a
    // change and its review tens of minutes: the budget covers every
    // step's own bound.
    test.setTimeout(220 * 60_000);
    const TURN = 10 * 60_000;
    await open(page, app);
    await nav(page, "Playbooks").click();
    await page.getByTestId("example-prefill").click();
    await expect(page.getByTestId("authoring-workspace")).toBeVisible();
    const chip = page.getByTestId("draft-chip");
    await expect(chip).toContainText("No source");
    const thread = page.getByTestId("draft-thread");
    const attach = async (label: string) => {
      await test.info().attach(label, {
        body: [
          "--- thread ---",
          await thread.innerText(),
          "--- compile ---",
          await page.getByTestId("compile-band").innerText().catch(() => "(no band)"),
        ].join("\n"),
        contentType: "text/plain",
      });
    };

    // The compile player answers the draft, so the compile runs on its
    // block (playbook-library-55, playbook-library-42); nothing is sent.
    const agent = page.getByTestId("draft-agent");
    await agent.click();
    const picker = page.getByTestId("agent-picker");
    await picker.getByTestId(`agent-option-${COMPILER_PLAYER}`).click();
    await expect(picker).toHaveCount(0);
    await expect(agent).toContainText(COMPILER_PLAYER);
    await expect(
      thread.getByTestId("system-line").filter({ hasText: `Now answering: ${COMPILER_PLAYER}` }),
    ).toBeVisible();

    // The placed text, used as it stands, is the draft's source
    // (playbook-library-35, playbook-library-56).
    const pasted = page.getByTestId("paste-text");
    const text = await pasted.inputValue();
    expect(text).toContain("Roles:");
    await page.getByTestId("paste-use").click();
    await expect(pasted).toHaveCount(0);
    await expect(page.getByTestId("source-markdown")).toContainText(EXAMPLE_TITLE);
    const [draft] = await app.core.command("draft.list", {});
    expect(draft.id).toBe(EXAMPLE_ID);

    // Compiled for real from the workspace's own control, asked by the
    // Boss, to Link (playbook-library-57). The source is fixed and the
    // compiler the app's, so this first compile is the one DR-089
    // judges: once it fails, the relay hands the output to the agent,
    // which may change the source, and a later compile is no longer of
    // the app's example. The first failure stops the journey with the
    // compiler's output attached, for the Releaser to class.
    await page.getByTestId("compile-button").click();
    await expect(page.getByTestId("compile-by")).toHaveText("asked by you");
    const band = page.getByTestId("compile-band");
    await expect
      .poll(async () => band.getAttribute("data-outcome"), {
        timeout: 130 * 60_000,
        intervals: [10_000],
      })
      .not.toBe("running");
    const outcome = await band.getAttribute("data-outcome");
    if (outcome !== "ok") {
      await attach("the example's first compile");
      const failed = page.locator('[data-testid^="phase-"][data-status="failed"]');
      const phase =
        (await failed.count()) > 0
          ? (await failed.first().getAttribute("data-testid"))!.replace(/^phase-/, "")
          : undefined;
      throw new Error(
        `the example's first compile ended ${outcome}${phase ? ` at ${phase}` : ""}; ` +
          "class it by the compiler's output attached (DR-089): a provider-side cause in " +
          "the compile's agent — a refusal, a quota, an outage — is retried or waived, " +
          "and the compiler refusing the example blocks the tag",
      );
    }
    await expect(page.getByTestId("phase-link")).toHaveAttribute("data-status", "done");
    await expect(chip).toContainText("Compiled");
    // The example's two roles, in the casing the compiler emits
    // (playbook-library-60).
    await expect(page.getByTestId("compile-roles")).toHaveText(/^roles: coder, reviewer$/i);
    await attach("the compile");
    // The capture that renews playbook-library-87's fixture: the
    // compiler's own output, taken before anything else touches it.
    const captureDir = process.env.SPEX_E2E_CAPTURE_COMPILED;
    if (captureDir) {
      const capture = await captureCompiled(app, EXAMPLE_ID, resolve(captureDir), COMPILER);
      await test.info().attach("the capture", {
        body: JSON.stringify(capture, null, 2),
        contentType: "application/json",
      });
    }

    // Every passing compile is followed by the agent's turn, which may
    // propose an enabling (playbook-library-61); the form stands
    // once it ends.
    await expect(page.getByTestId("draft-working")).toHaveCount(0, { timeout: TURN });
    const tabs = page.getByRole("tablist", { name: "Draft artifacts" });
    await tabs.getByRole("tab", { name: "Enable", exact: true }).click();
    const form = page.getByTestId("register-form");
    await expect(form).toBeVisible();
    const playerFor = (role: string) => page.getByTestId(new RegExp(`^register-player-${role}$`, "i"));
    await expect(page.getByTestId(/^register-player-/)).toHaveCount(2);
    if (/Prefilled from the agent's proposal/.test(await form.innerText())) {
      // A proposal fills the form instead of the derived defaults: the
      // journey keeps it — its command included, which the agent may
      // name otherwise than the id — moving only a role it leaves off
      // claude — on the compile player, or on a new lane carrying the
      // compile player's block — to the roster's own lane for it.
      await attach("the proposal");
      const roster = (parse(app.readConfig()) as { players: Record<string, Block> }).players;
      for (const role of ["coder", "reviewer"]) {
        const select = playerFor(role);
        if (adapterOf(roster[await select.inputValue()]) !== "claude") {
          await select.selectOption(`dev.${role}`);
        }
      }
    } else {
      // The derived defaults, nothing typed or chosen: the draft's id
      // as the command, the example's title as the intent, and each
      // role on the roster's own lane for it, as that lane stands.
      await expect(form).toContainText("Prefilled from the source and the compiled roles");
      await expect(page.getByTestId("register-command")).toHaveValue(EXAMPLE_ID);
      await expect(page.getByTestId("register-intent")).toHaveValue(EXAMPLE_TITLE);
      await expect(playerFor("coder")).toHaveValue("dev.coder");
      await expect(playerFor("reviewer")).toHaveValue("dev.reviewer");
    }
    // The command the session invokes is the one enabled.
    const command = await page.getByTestId("register-command").inputValue();
    expect(command, "the form names a command").not.toBe("");
    await page.getByTestId("register-submit").click();

    // The surface lists it among the enabled, the authoring session
    // staying (playbook-library-10, playbook-library-61); the project's
    // config names its players, your own group's says what they run on,
    // and both roles run on claude.
    await expect(page.getByTestId("playbooks-enabled").getByTestId(`playbook-card-${EXAMPLE_ID}`)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(`draft-row-${EXAMPLE_ID}`).getByTestId("draft-chip")).toContainText("Enabled");
    const config = {
      players: (parse(app.readConfig()) as { players: Record<string, Block> }).players,
      playbooks: (parse(app.readProjectConfig()) as { playbooks: Record<string, { roles: Record<string, unknown> }> }).playbooks,
    };
    const roles = config.playbooks[EXAMPLE_ID].roles;
    expect(Object.keys(roles).map((role) => role.toLowerCase()).sort()).toEqual(["coder", "reviewer"]);
    const players = new Set<string>();
    for (const binding of Object.values(roles)) {
      const player = typeof binding === "string" ? binding : (binding as { player?: string }).player;
      expect(player, JSON.stringify(binding)).toBeTruthy();
      expect(adapterOf(config.players[player!]), `${player} runs on claude`).toBe("claude");
      players.add(player!);
    }

    // A new session's slash menu offers its command, and its turn runs
    // the enabled playbook to its finish with both role players
    // engaged and the change committed (playbook-library-14), any
    // player's question answered through the Captain.
    await surfaceEntry(page, "Workspace").click();
    await page.getByTestId("start-composer").fill("/");
    await expect(page.getByRole("listbox")).toContainText(`/${command}`);
    commitIdentity(app.projectDir);
    const head = git(app.projectDir, "rev-parse", "HEAD");
    const commits = commitCount(app.projectDir);
    await send(
      page,
      `/${command} Add a NOTES.md at the repository root with one line naming this repository's purpose, and commit it.`,
    );
    const captain = page.getByTestId("captain-pane");
    await expect(captain).toBeVisible();
    const answering = answeringWith(page);
    await awaitCaptainLine(page, `/${command} finished`, 60 * 60_000, 1, answering);
    await attachRun(page, "the run");
    await expect(captain).not.toContainText(/turn failed/i);
    for (const player of players) await expectEngaged(page, player);
    expect(commitCount(app.projectDir)).toBeGreaterThan(commits);
    await test.info().attach("the commits", {
      body: git(app.projectDir, "log", "--stat", `${head}..HEAD`),
      contentType: "text/plain",
    });
    await test.info().attach("questions answered", {
      body: String(answering.asked()),
      contentType: "text/plain",
    });
  });
});

test.describe("the changelog playbook", () => {
  test.use({ appOptions: { config: "none", project: true, compiler: COMPILER } });

  test("playbook-library-78 @live: a two-role changelog playbook is authored, compiled, enabled, and run", async ({
    page,
    app,
  }) => {
    test.skip(!LIVE, "live lane only");
    // A compile has taken from minutes (DR-086) to two hours (DR-058),
    // the agent's own turns minutes each, and the run tens of minutes:
    // the budget covers every step's own bound.
    test.setTimeout(250 * 60_000);
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
      // The reply landed; the composer is the Boss's again (Send itself
      // stays held while the field is empty, and a compile the reply
      // asked for may already be running).
      await expect(composer).toBeEnabled();
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
    // …unless the core's bounded relay gives up (playbook-library-58:
    // three failed compiles in a row hand the draft back to the Boss),
    // in which case the journey stops with the thread attached rather
    // than waiting out the compile budget.
    await expect
      .poll(
        async () => {
          if (/three in a row/i.test(await band.innerText())) return "stopped";
          return page.getByTestId("phase-link").getAttribute("data-status");
        },
        { timeout: 130 * 60_000, intervals: [10_000] },
      )
      .toMatch(/^(done|stopped)$/);
    if (/three in a row/i.test(await band.innerText())) {
      await attach("the compile stopped");
      throw new Error("the compile failed three times in a row; the compiler's output is attached");
    }
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

    // /changelog enabled with a player per role (playbook-library-61).
    const tabs = page.getByRole("tablist", { name: "Draft artifacts" });
    await tabs.getByRole("tab", { name: "Enable", exact: true }).click();
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
    await expect(page.getByTestId("playbooks-enabled").getByTestId("playbook-card-changelog")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("draft-row-changelog").getByTestId("draft-chip")).toContainText("Enabled");
    await expect.poll(() => app.readProjectConfig()).toContain("changelog:");
    // The project's config names the players, your own group's says
    // what each runs on.
    const config = {
      players: (parse(app.readConfig()) as { players: Record<string, Block> }).players,
      playbooks: (parse(app.readProjectConfig()) as { playbooks: Record<string, { roles: Record<string, unknown> }> }).playbooks,
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

    // The enabled playbook runs (DR-086): a session's /changelog
    // turn finishes with both role players engaged and the repository
    // carrying a commit of its notes (playbook-library-14), any
    // player's question answered through the Captain.
    commitIdentity(app.projectDir);
    const head = git(app.projectDir, "rev-parse", "HEAD");
    const commits = commitCount(app.projectDir);
    await send(page, "/changelog Draft release notes for the commits so far into CHANGELOG.md and commit them.");
    const captain = page.getByTestId("captain-pane");
    await expect(captain).toBeVisible();
    const answering = answeringWith(page);
    await awaitCaptainLine(page, "/changelog finished", 45 * 60_000, 1, answering);
    await attachRun(page, "the run");
    await expect(captain).not.toContainText(/turn failed/i);
    for (const player of players) await expectEngaged(page, player);
    expect(commitCount(app.projectDir)).toBeGreaterThan(commits);
    await test.info().attach("the commits", {
      body: git(app.projectDir, "log", "--stat", `${head}..HEAD`),
      contentType: "text/plain",
    });
    await test.info().attach("questions answered", {
      body: String(answering.asked()),
      contentType: "text/plain",
    });
  });
});
