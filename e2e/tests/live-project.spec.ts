// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A new project developed through two intents (dashboard-63,
// run-view-150): the regression's second scenario (DR-086, DR-089,
// release-25) on the machine's signed-in agents and the real Captain,
// run by `npm run regression` (SPEX_E2E_LIVE=1) and never in CI. The
// project starts where a fresh user starts one: created from the
// palette with its specs scaffolded. The first intent, a `/decide`, is
// captured on the Dashboard and started, and a `/code` implementing
// the decision is queued behind it; the decision runs with its review
// to a settled turn, the queue hands off to the `/code` with nothing
// pressed, and it settles in turn. A question a player asks on the way
// is answered through the Captain, as the Boss would. Both intents are
// confirmed, History lists them, and the repository carries a commit
// from each cycle and passes its own tests.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  test,
  expect,
  open,
  git,
  LIVE,
  NEUTRAL_ANSWER,
  attachRun,
  awaitCaptainLine,
  awaitRun,
  commitCount,
  commitIdentity,
  expectEngaged,
  surfaceEntry,
} from "../src/harness";

// The true first run: the core seeds its installed template, and the
// journey creates its project through the page.
test.use({ appOptions: { config: "none" } });

const FIRST =
  "/decide How should this repository lay out a small JavaScript package with a sum(a, b) function: its module format, where the source and its tests live, and how npm test runs them? Keep it to what such a package needs.";
const SECOND =
  "/code Implement the recorded decision for the sum(a, b) package: a package.json whose npm test runs the tests with node --test, sum(a, b) returning a + b, and one test for it. Keep the change minimal.";
/** A real cycle with its review (DR-086: twenty to forty-five minutes). */
const CYCLE = 60 * 60_000;
/** From a settled turn to the queued intent's dispatch (DR-077). */
const HANDOFF = 5 * 60_000;

/** The commits a repository holds: none before its first. */
function commits(dir: string): number {
  try {
    return commitCount(dir);
  } catch {
    return 0;
  }
}

test("dashboard-63, run-view-150 @live: a project created from the palette develops through /decide and /code", async ({
  page,
  app,
}) => {
  test.skip(!LIVE, "live lane only");
  test.setTimeout(240 * 60_000);
  const projectDir = join(dirname(app.dataDir), "new-project");

  // ── The palette creates the repository with its specs scaffolded,
  //    the Captain home names it, and the Specs tab reads the
  //    scaffolded packages.
  await open(page, app);
  await page.getByRole("button", { name: "Switch or add a project" }).click();
  const palette = page.getByRole("dialog", { name: /Add a project|Choose a project/ });
  await palette.getByTestId("palette-path").fill(projectDir);
  await expect(palette.getByRole("checkbox", { name: "Scaffold specs when creating" })).toBeChecked();
  await palette.getByTestId("palette-create").click();
  // Scaffolding fetches the published CLI, as it does for a user.
  await expect(palette).toBeHidden({ timeout: 5 * 60_000 });
  const home = page.getByTestId("captain-home");
  await expect(home).toContainText("new-project");
  // The seeded template's agents must be ready on this machine, or the
  // lane proves nothing: fail early, naming what is not signed in.
  await expect(home).not.toContainText(/aren't ready/i);
  // The repository's own committer for the agents that commit there:
  // an unset identity makes the Captain ask, and the machine's signing
  // requirement can stall a commit — neither is the machine's to decide.
  commitIdentity(projectDir);
  const seeded = commits(projectDir);
  await page.getByRole("tab", { name: "Specs" }).click();
  await expect(page.getByTestId("specv-live")).toBeVisible();
  await expect(page.getByTestId("file-git")).toBeVisible();
  await expect(page.getByTestId("file-licensing")).toBeVisible();

  // ── The first intent: captured in the project's add field, started
  //    from its Up next row, sent from the staged composer.
  // Found by which surface it is: its name grows a count once work
  // waits for a verdict.
  const dashboard = surfaceEntry(page, "Dashboard");
  await dashboard.click();
  const add = page.getByRole("textbox", { name: /add an intent to new-project/i });
  const projectId = (await add.getAttribute("data-testid"))!.replace(/^add-intent-/, "");
  const capture = async (text: string, marker: string): Promise<string> => {
    await add.fill(text);
    await add.press("Enter");
    const row = page.getByTestId(/^upnext-row-/).filter({ hasText: marker });
    await expect(row).toBeVisible();
    return (await row.getAttribute("data-intent-id"))!;
  };
  const firstId = await capture(FIRST, "sum(a, b) function");
  await expect(page.getByTestId(`upnext-row-${firstId}`)).toHaveAttribute("data-next", "true");
  await page.getByTestId(`upnext-start-${firstId}`).click();
  await expect(page.getByTestId("start-composer")).toHaveValue(FIRST);
  await page.getByTestId("start-send").click();
  const captain = page.getByTestId("captain-pane");
  await expect(captain).toBeVisible();

  // ── While it runs: the Running band lists the session and the Now
  //    band shows it serving the first intent (dashboard-50, dashboard-28).
  await dashboard.click();
  const running = page.getByTestId(/^running-session-/);
  await expect(running).toHaveCount(1);
  await expect(running).toHaveAttribute("data-project-id", projectId);
  await expect(running).toContainText("new-project");
  const sessionId = (await running.getAttribute("data-testid"))!.replace(/^running-session-/, "");
  const now = page.getByTestId(`now-session-${projectId}`);
  await expect(now).toHaveAttribute("data-intent-id", firstId);
  await expect(now).toContainText("sum(a, b)");

  // ── The second intent queues behind it as the project's next
  //    (dashboard-29, DR-077): Queued, after the current work, no Start.
  const secondId = await capture(SECOND, "Implement the recorded decision");
  await expect(page.getByTestId(`upnext-row-${secondId}`)).toHaveAttribute("data-next", "true");
  await expect(page.getByTestId(`upnext-queued-${secondId}`)).toHaveText("Queued");
  await expect(page.getByTestId(`upnext-standing-${secondId}`)).toHaveText("after current work");
  await expect(page.getByTestId(`upnext-start-${secondId}`)).toHaveCount(0);

  // A question a player asks is answered through the Captain, as the
  // Boss would (DR-085, DR-089): it stands as the Captain's bubble with
  // the banner naming the asking player (run-view-9); the Dashboard
  // lists it in the attention queue (dashboard-1) and reads the queued
  // `/code` as waiting on the reply (dashboard-59); the answer goes
  // through the session's composer, and the wait clears only once the
  // runtime reports the question gone.
  let questions = 0;
  const box = page.getByTestId("boss-composer");
  const answering = {
    onQuestion: async (): Promise<void> => {
      questions += 1;
      const banner = page.getByTestId("boss-reply-banner");
      await expect(page.getByTestId("question-bubble").last()).toBeVisible();
      await expect(banner).toContainText("is waiting");
      await attachRun(page, `question ${questions}`);
      await dashboard.click();
      await expect(page.getByTestId(/^attention-.+-question$/).first()).toBeVisible();
      if ((await page.getByTestId(`upnext-row-${secondId}`).count()) > 0) {
        await expect(page.getByTestId(`upnext-standing-${secondId}`)).toHaveText("waiting — your reply");
      }
      await now.click();
      await expect(box).toBeEnabled();
      await box.fill(NEUTRAL_ANSWER);
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(banner).toHaveCount(0, { timeout: CYCLE });
    },
  };

  // ── The first cycle in its session (run-view-150): /decide started,
  //    the composer refusing input, both players' live proposals, the
  //    run settled with no failure after its review.
  await page.getByTestId(`running-session-${sessionId}`).click();
  await awaitCaptainLine(page, "/decide started", 10 * 60_000, 1, answering);
  await expect(box).toBeDisabled();
  await expect(box).toHaveAttribute("placeholder", "Captain is working…");
  const coder = page.getByTestId("player-pane-dev.coder");
  await awaitRun(
    page,
    "the coder's live output",
    async () => (await coder.innerText()).length > 200,
    CYCLE,
    answering,
  );
  await attachRun(page, "cycle 1: live output");
  await awaitCaptainLine(page, "/decide finished", CYCLE, 1, answering);
  await attachRun(page, "cycle 1: finished");
  await expect(captain).not.toContainText(/turn failed/i);
  await expectEngaged(page, "dev.coder", 200);
  await expectEngaged(page, "dev.reviewer");
  const afterFirst = commits(projectDir);
  expect(afterFirst).toBeGreaterThan(seeded);

  // ── The handoff (DR-077): with nothing pressed, the settled turn
  //    dispatches the queued /code into the same conversation; the
  //    Dashboard no longer lists it in Up next, Now shows it, and the
  //    first stands finished in the attention queue with Confirm.
  await awaitCaptainLine(page, "/code started", HANDOFF, 1, answering);
  await dashboard.click();
  await expect(page.getByTestId(`upnext-row-${secondId}`)).toHaveCount(0);
  await expect(now).toHaveAttribute("data-intent-id", secondId);
  await expect(page.getByTestId(`running-session-${sessionId}`)).toBeVisible();
  await expect(page.getByTestId(`attention-${firstId}-finish`)).toBeVisible();
  await expect(page.getByTestId(`attention-confirm-${firstId}`)).toBeVisible();

  // ── The second cycle, to its settlement: the composer refused input
  //    while it ran and reads ready after, and nothing ends (run-view-69).
  await page.getByTestId(`running-session-${sessionId}`).click();
  await expect(box).toBeDisabled();
  await expect(box).toHaveAttribute("placeholder", "Captain is working…");
  await awaitCaptainLine(page, "/code finished", CYCLE, 1, answering);
  await attachRun(page, "cycle 2: finished");
  await expect(captain).not.toContainText(/turn failed/i);
  await expectEngaged(page, "dev.coder", 200);
  await expectEngaged(page, "dev.reviewer");
  await expect(box).toBeEnabled();
  await expect(page.getByTestId("end-session")).toHaveCount(0);
  await expect(page.getByTestId("history-notice")).toHaveCount(0);
  await expect(page.getByTestId(`sidebar-mark-${sessionId}`)).not.toHaveAttribute("data-life", "running");
  const afterSecond = commits(projectDir);
  expect(afterSecond).toBeGreaterThan(afterFirst);

  // ── Both finished intents stand in the attention queue with Confirm
  //    and leave it on Confirm (dashboard-1, dashboard-4); History then
  //    lists both as done (dashboard-27).
  await dashboard.click();
  await expect(page.getByTestId(/^attention-.+-(question|failure)$/)).toHaveCount(0);
  for (const intentId of [firstId, secondId]) {
    const entry = page.getByTestId(`attention-${intentId}-finish`);
    await expect(entry).toBeVisible();
    await page.getByTestId(`attention-confirm-${intentId}`).click();
    await expect(entry).toHaveCount(0);
  }
  for (const intentId of [firstId, secondId]) {
    await expect(page.getByTestId(`history-row-${intentId}`)).toHaveAttribute("data-verdict", "done");
  }

  // The verdicts owed are given: the session reads idle, its composer
  // ready for the next message (run-view-69).
  await now.click();
  await expect(box).toBeEnabled();
  await expect(page.getByTestId(`sidebar-mark-${sessionId}`)).toHaveAttribute("data-life", "idle");

  // ── The repository: a commit from each cycle, the decision among
  //    its specs, and its own tests passing.
  await test.info().attach("the commits", {
    body: git(projectDir, "log", "--stat"),
    contentType: "text/plain",
  });
  await test.info().attach("questions answered", {
    body: String(questions),
    contentType: "text/plain",
  });
  expect(existsSync(join(projectDir, "package.json")), "the /code cycle wrote a package.json").toBe(true);
  expect(git(projectDir, "grep", "-l", "sum", "--", "*.js", "*.mjs", "*.cjs", "*.ts")).not.toBe("");
  let output = "";
  try {
    output = execFileSync("npm", ["test"], { cwd: projectDir, encoding: "utf8", stdio: "pipe" });
  } catch (error) {
    const failed = error as { stdout?: string; stderr?: string };
    output = `${failed.stdout ?? ""}${failed.stderr ?? ""}`;
    throw error;
  } finally {
    await test.info().attach("npm test", { body: output, contentType: "text/plain" });
  }
  expect(output, "npm test ran at least one passing test").toMatch(/\bpass\s+[1-9]/);
});
