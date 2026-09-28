// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A new project developed through two intents (dashboard-63,
// run-view-150): the regression's second scenario (DR-086, release-25)
// on the machine's signed-in agents and the real Captain, run by
// `npm run regression` (SPEX_E2E_LIVE=1) and never in CI. A fresh
// repository with scaffolded specs is added from the palette; the
// first intent is captured on the Dashboard and started, the second
// queued behind it; the first runs the real /code with its review to a
// settled turn, the queue hands off to the second with nothing
// pressed, and the second settles. Both are confirmed, History lists
// them, and the repository's own tests pass with a commit from each
// cycle. The lane answers no question in this version: one fails the
// journey at once, its text attached.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";

import {
  test,
  expect,
  open,
  git,
  LIVE,
  attachRun,
  awaitCaptainLine,
  awaitRun,
  commitCount,
  commitIdentity,
  expectEngaged,
  surfaceEntry,
} from "../src/harness";

// The true first run: the core seeds its installed template, and the
// journey brings its own project.
test.use({ appOptions: { config: "none" } });

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const FIRST =
  '/code Add a sum(a, b) function in src/index.js returning a + b, with a test under test/. Keep the change minimal.';
const SECOND =
  '/code Add a product(a, b) function beside sum in src/index.js returning a * b, with a test under test/.';
/** A real /code cycle with its review (DR-086: twenty to forty-five minutes). */
const CYCLE = 60 * 60_000;
/** From a settled turn to the queued intent's dispatch (DR-077). */
const HANDOFF = 5 * 60_000;

/**
 * A repository as a user starts one: a package with one passing test,
 * its specs scaffolded by this repository's CLI, one commit, and its
 * own committer for the agents that commit there.
 */
function arrangeProject(dir: string): void {
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "test"), { recursive: true });
  execFileSync("git", ["init", "-q", "-b", "main", dir]);
  writeFileSync(join(dir, "README.md"), "# greetings\n");
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify(
      {
        name: "greetings",
        version: "0.1.0",
        type: "module",
        scripts: { test: "node --test" },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(join(dir, "src", "index.js"), "export {};\n");
  writeFileSync(
    join(dir, "test", "index.test.js"),
    [
      'import { test } from "node:test";',
      'import assert from "node:assert/strict";',
      "",
      'test("the package loads", async () => {',
      '  assert.equal(typeof (await import("../src/index.js")), "object");',
      "});",
      "",
    ].join("\n"),
  );
  execFileSync(
    process.execPath,
    [join(repoRoot, "packages", "cli", "dist", "cli.js"), "scaffold", "--agents=claude"],
    { cwd: dir, stdio: "pipe" },
  );
  execFileSync("git", ["-C", dir, "add", "-A"]);
  execFileSync("git", [
    "-C",
    dir,
    "-c",
    "user.name=Spex Test",
    "-c",
    "user.email=spex@example.test",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-q",
    "-m",
    "Start greetings",
  ]);
  commitIdentity(dir);
}

/** A run stopped on the Boss, read off the Dashboard: the lane answers
 * no question, so a summons fails the journey with its words. */
async function expectNoSummons(page: Page): Promise<void> {
  const summons = page.getByTestId(/^attention-.+-(question|failure)$/);
  if ((await summons.count()) > 0) {
    throw new Error(`the run stopped on the Boss: ${await summons.first().innerText()}`);
  }
}

/** The settled turn's handoff to a queued intent (DR-077), read off
 * the Dashboard: the row leaves Up next, or its standing says at once
 * what the work ahead stopped on ("waiting — …"). */
async function awaitHandoff(page: Page, intentId: string): Promise<void> {
  const row = page.getByTestId(`upnext-row-${intentId}`);
  const standing = page.getByTestId(`upnext-standing-${intentId}`);
  const deadline = Date.now() + HANDOFF;
  for (;;) {
    if ((await row.count()) === 0) return;
    await expectNoSummons(page);
    const phrase = (await standing.count()) > 0 ? await standing.innerText() : "";
    if (phrase.startsWith("waiting")) throw new Error(`the queue did not hand off: ${phrase}`);
    if (Date.now() > deadline) {
      throw new Error(`the queue did not hand off in ${HANDOFF / 60_000} minutes`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

test("dashboard-63, run-view-150 @live: a new project develops through two intents", async ({
  page,
  app,
}) => {
  test.skip(!LIVE, "live lane only");
  test.setTimeout(180 * 60_000);
  const projectDir = join(dirname(app.dataDir), "new-project");
  arrangeProject(projectDir);
  const seeded = commitCount(projectDir);

  // ── The palette adds the repository, the Captain home names it, and
  //    the Specs tab reads its scaffolded packages.
  await open(page, app);
  await page.getByRole("button", { name: "Switch or add a project" }).click();
  const palette = page.getByRole("dialog", { name: /Add a project|Choose a project/ });
  await palette.getByTestId("palette-path").fill(projectDir);
  await palette.getByTestId("palette-add").click();
  await expect(palette).toBeHidden();
  const home = page.getByTestId("captain-home");
  await expect(home).toContainText("new-project");
  // The seeded template's agents must be ready on this machine, or the
  // lane proves nothing: fail early, naming what is not signed in.
  await expect(home).not.toContainText(/aren't ready/i);
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
  const firstId = await capture(FIRST, "sum(a, b)");
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
  const secondId = await capture(SECOND, "product(a, b)");
  await expect(page.getByTestId(`upnext-row-${secondId}`)).toHaveAttribute("data-next", "true");
  await expect(page.getByTestId(`upnext-queued-${secondId}`)).toHaveText("Queued");
  await expect(page.getByTestId(`upnext-standing-${secondId}`)).toHaveText("after current work");
  await expect(page.getByTestId(`upnext-start-${secondId}`)).toHaveCount(0);
  await expectNoSummons(page);

  // ── The first cycle in its session (run-view-150): /code started,
  //    the composer refusing input, the coder's live output, the run
  //    settled with no failure, and the reviewer's output.
  await page.getByTestId(`running-session-${sessionId}`).click();
  await awaitCaptainLine(page, "/code started", 10 * 60_000);
  const box = page.getByTestId("boss-composer");
  await expect(box).toBeDisabled();
  await expect(box).toHaveAttribute("placeholder", "Captain is working…");
  const coder = page.getByTestId("player-pane-dev.coder");
  await awaitRun(page, "the coder's live output", async () => (await coder.innerText()).length > 200, CYCLE);
  await attachRun(page, "cycle 1: live output");
  await awaitCaptainLine(page, "/code finished", CYCLE);
  await attachRun(page, "cycle 1: finished");
  await expect(captain).not.toContainText(/turn failed/i);
  await expectEngaged(page, "dev.coder", 200);
  await expectEngaged(page, "dev.reviewer");
  const afterFirst = commitCount(projectDir);
  expect(afterFirst).toBeGreaterThan(seeded);

  // ── The handoff (DR-077): with nothing pressed, the settled turn
  //    dispatched the second intent into the same conversation, while
  //    the first stands finished in the attention queue with Confirm.
  await dashboard.click();
  await awaitHandoff(page, secondId);
  await expect(now).toHaveAttribute("data-intent-id", secondId);
  await expect(page.getByTestId(`running-session-${sessionId}`)).toBeVisible();
  await expect(page.getByTestId(`attention-${firstId}-finish`)).toBeVisible();
  await expect(page.getByTestId(`attention-confirm-${firstId}`)).toBeVisible();

  // ── The second cycle, to its settlement: the composer refused input
  //    while it ran and reads ready after, and nothing ends (run-view-69).
  await page.getByTestId(`running-session-${sessionId}`).click();
  await awaitCaptainLine(page, "/code started", 10 * 60_000, 2);
  await expect(box).toBeDisabled();
  await expect(box).toHaveAttribute("placeholder", "Captain is working…");
  await awaitCaptainLine(page, "/code finished", CYCLE, 2);
  await attachRun(page, "cycle 2: finished");
  await expect(captain).not.toContainText(/turn failed/i);
  await expect(box).toBeEnabled();
  await expect(page.getByTestId("end-session")).toHaveCount(0);
  await expect(page.getByTestId("history-notice")).toHaveCount(0);
  await expect(page.getByTestId(`sidebar-mark-${sessionId}`)).not.toHaveAttribute("data-life", "running");
  const afterSecond = commitCount(projectDir);
  expect(afterSecond).toBeGreaterThan(afterFirst);

  // ── Both finished intents stand in the attention queue with Confirm
  //    and leave it on Confirm (dashboard-1, dashboard-4); History then
  //    lists both as done (dashboard-27).
  await dashboard.click();
  await expectNoSummons(page);
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

  // ── The repository: both changes committed, and its own tests pass.
  await test.info().attach("the commits", {
    body: git(projectDir, "log", "--stat"),
    contentType: "text/plain",
  });
  const source = readFileSync(join(projectDir, "src", "index.js"), "utf8");
  expect(source).toContain("sum");
  expect(source).toContain("product");
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
});
