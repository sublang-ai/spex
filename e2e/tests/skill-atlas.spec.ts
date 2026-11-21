// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Skill Atlas's page in a browser (skill-atlas-26): the skill's own server
// (`atlas.mjs serve`) over skill folders built for the test in two agent
// folders. No Spex core or UI is involved.
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CLI = join(REPO, "skills", "skill-atlas", "scripts", "atlas.mjs");
const SERVER_START_TIMEOUT_MS = 15_000; // a scan of ten fixture skills takes well under a second

let tmp = "";
let project = "";
let state = "";
let url = "";
let server: ChildProcess | undefined;

function skill(project: string, folder: string, name: string, description: string, body: string) {
  const dir = join(project, folder, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n${body}`);
}

// Ten skills: `ship` calls `code`, which calls `review`; `decide` calls
// `review`; `guide` only mentions `review`; tags of all four categories, a
// human one among them; `notes` has only sections; `lone` links nowhere;
// the skill in `markup` has markup in its name, description and a step.
function buildFixture(project: string) {
  const claude = ".claude/skills";
  const agents = ".agents/skills";
  skill(project, claude, "code", "Implements a requested change.",
    "# Code\n\n## Step 1: Plan\n\nAsk the user which branch to use.\n\n## Step 2: Write\n\nWrite the code files for the change.\n\n## Step 3: Review\n\nInvoke the `review` skill once the change is written.\n");
  skill(project, claude, "decide", "Decides on a design.",
    "# Decide\n\n## Step 1: Read\n\nRead the spec files of the area.\n\n## Step 2: Check\n\nInvoke the `review` skill on the decision.\n\n## Step 3: Record\n\nWait for the user's approval before recording the decision.\n");
  skill(project, claude, "review", "Reviews commits.",
    "# Review\n\n## Step 1: Diff\n\nRun git diff against the base branch.\n\n## Step 2: Report\n\nReport the findings to the user.\n");
  skill(project, claude, "notes", "Notes on house conventions.",
    "# Notes\n\n## Background\n\nSome context about the house.\n\n## Conventions\n\nSome conventions to keep.\n");
  skill(project, claude, "lone", "Stands alone.", "Just one paragraph of prose with no headings and no links.\n");
  skill(project, claude, "guide", "Points the way.", "# Guide\n\nSee also the `review` skill for checks.\n");
  const markup = join(project, claude, "markup");
  mkdirSync(markup, { recursive: true });
  writeFileSync(join(markup, "SKILL.md"), `---\nname: "${MARKUP}"\ndescription: Shows <script>window.__atlasXss = 2</script> as text.\n---\n# Markup\n\n## Step 1: Echo\n\nPrint it verbatim.\n\n## Step 2: Done\n\nNothing else.\n`);
  skill(project, agents, "ship", "Publishes a release.",
    "# Ship\n\n## Step 1: Build\n\nRun /code for the release notes.\n\n## Step 2: Tag\n\nRun git tag for the version.\n");
  skill(project, agents, "lint-docs", "Lints the documentation.", "# Lint docs\n\n## Step 1: Lint\n\nRun the command that lints every page.\n");
  skill(project, agents, "research", "Investigates a topic.", "# Research\n\n## Step 1: Search\n\nUse WebSearch for the topic.\n");
}

// A skill name that would run script if the page treated it as markup.
const MARKUP = "<img src=x onerror=window.__atlasXss=1>";
// The scan strips tags from a skill's own step text, so an annotation (kept
// as written) gives its first step a title and text holding markup.
const STEP_TITLE = 'Echo <img src=x onerror="window.__atlasXss = 3">';
const STEP_TEXT = "Print <b onmouseover=\"window.__atlasXss = 4\">bold</b> verbatim.";
const ANNOTATIONS = { version: 1, skills: { [MARKUP]: { steps: [{ title: STEP_TITLE, summary: STEP_TEXT }, { title: "Done", summary: "Nothing else." }] } } };
const WORKFLOWS = "workflows.json";
const FLOW = {
  version: 1,
  active: "flow",
  workflows: [{
    id: "flow",
    name: "Flow",
    phases: [
      { id: "p-plan", name: "Plan", note: "", skills: ["decide", "code"] },
      { id: "p-make", name: "Make", note: "", skills: ["review", "gone"] },
    ],
  }],
};

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), "skill-atlas-e2e-"));
  project = join(tmp, "project");
  state = join(tmp, "state");
  buildFixture(project);
  mkdirSync(state, { recursive: true });
  writeFileSync(join(state, "annotations.json"), JSON.stringify(ANNOTATIONS));
  const child = spawn(process.execPath, [CLI, "serve", "--no-open", "--port", "0", "--cwd", project, "--no-user", "--no-plugins", "--state", state], { stdio: ["ignore", "pipe", "pipe"] });
  server = child;
  const info = await new Promise<{ url: string }>((resolveInfo, reject) => {
    let buf = "";
    const timer = setTimeout(() => reject(new Error("the Skill Atlas server did not start in time")), SERVER_START_TIMEOUT_MS);
    child.stdout!.on("data", (d) => {
      buf += d;
      const nl = buf.indexOf("\n");
      if (nl >= 0) { clearTimeout(timer); resolveInfo(JSON.parse(buf.slice(0, nl))); }
    });
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`the Skill Atlas server exited with ${code}`)); });
  });
  url = info.url;
});

test.afterAll(async () => {
  if (server && server.exitCode === null) {
    const exited = new Promise((r) => server!.once("exit", r));
    server.kill("SIGTERM");
    await exited;
  }
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

// Each journey starts from its own workflows document, or none, and no set-aside copies.
test.beforeEach(() => {
  rmSync(join(state, WORKFLOWS), { force: true });
  if (existsSync(state)) for (const f of readdirSync(state)) if (/^workflows\.invalid-\d+\.json$/.test(f)) rmSync(join(state, f));
});

function writeWorkflows(doc: unknown) {
  mkdirSync(state, { recursive: true });
  writeFileSync(join(state, WORKFLOWS), JSON.stringify(doc));
}

const groups = (page: Page) => page.locator("#board > section.col");
const groupLabels = (page: Page) => groups(page).evaluateAll((cols) => cols.map((c) => c.getAttribute("aria-label")));
const card = (page: Page, id: string) => page.locator(`#board .card[data-skill="${id}"]`);
const cardButton = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(`^/${name}\\b`) });
const shownSkills = (page: Page) => page.locator("#board .card[data-skill]").evaluateAll((cards) => cards.map((c) => c.getAttribute("data-skill")).sort());
const details = (page: Page) => page.getByRole("complementary", { name: "Details" });

async function groupBy(page: Page, grouping: "Workflow" | "Links" | "Source") {
  await page.getByRole("radio", { name: grouping }).click();
  await expect(page.getByRole("radio", { name: grouping })).toHaveAttribute("aria-checked", "true");
}

// Whether some drawn link ends on the element: each link's path ends at its target end.
function linkEndsOn(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const b = document.getElementById("board")!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return [...document.querySelectorAll("#link-layer path.ln")].some((p) => {
      const n = (p.getAttribute("d") ?? "").match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
      const x = n[n.length - 2]!, y = n[n.length - 1]!;
      return x >= r.left - b.left - 3 && x <= r.right - b.left + 3 && y >= r.top - b.top - 3 && y <= r.bottom - b.top + 3;
    });
  }, selector);
}

test("skill-atlas-13: each grouping's groups, a skill opened to its steps, a link re-anchored to a closed group, mentions hidden", async ({ page }) => {
  writeWorkflows(FLOW);
  await page.goto(url);
  // Workflow: the active workflow's phases in order, then the skills in no phase.
  await expect.poll(() => groupLabels(page)).toEqual(["Plan, 2 skills", "Make, 1 skill", "Unassigned, 7 skills"]);
  // A phase entry no reported skill has is shown as missing (skill-atlas-19).
  await expect(page.getByRole("region", { name: /^Make,/ })).toContainText("Not installed — kept in this workflow");

  // Links: entry points, each further link depth, then skills with no link;
  // `guide`'s mention of `review` counts as a link while mentions are shown.
  await groupBy(page, "Links");
  await expect.poll(() => groupLabels(page)).toEqual(["Entry points, 3 skills", "Linked, 1 skill", "Linked · level 2, 1 skill", "Standalone, 5 skills"]);
  const entry = page.getByRole("region", { name: /^Entry points,/ });
  await expect(entry.getByRole("button", { name: /^\/ship\b/ })).toBeVisible();
  await expect(entry.getByRole("button", { name: /^\/decide\b/ })).toBeVisible();
  await expect(entry.getByRole("button", { name: /^\/guide\b/ })).toBeVisible();
  await expect(page.locator("#link-layer .lk.mentions")).toHaveCount(1);

  // Mentions hidden on the reader's choice: none drawn, and `guide` no longer linked.
  const mentions = page.getByRole("checkbox", { name: "Mentions" });
  await mentions.uncheck();
  await expect(page.locator("#link-layer .lk.mentions")).toHaveCount(0);
  await expect(page.locator("#link-layer .lk.calls")).not.toHaveCount(0);
  await expect.poll(() => groupLabels(page)).toEqual(["Entry points, 2 skills", "Linked, 1 skill", "Linked · level 2, 1 skill", "Standalone, 6 skills"]);
  await expect(page.getByRole("region", { name: /^Standalone,/ }).getByRole("button", { name: /^\/guide\b/ })).toBeVisible();
  await mentions.check();
  await expect(page.locator("#link-layer .lk.mentions")).toHaveCount(1);

  // Source: the scanned folders.
  await groupBy(page, "Source");
  await expect.poll(() => groupLabels(page)).toEqual(["Project · Claude Code, 7 skills", "Project · Universal, 3 skills"]);

  // A skill opened to its steps.
  await groupBy(page, "Links");
  await cardButton(page, "code").click();
  await expect(card(page, "code").locator(".steps-head")).toHaveText("Steps · 3");
  await expect(card(page, "code").locator(".step-title")).toHaveText(["Plan", "Write", "Review"]);

  // The link code → review ends on review's card, then on its closed group's card.
  await expect.poll(() => linkEndsOn(page, '.card[data-skill="review"]')).toBe(true);
  await page.getByRole("button", { name: "Collapse Linked · level 2" }).click();
  const closed = page.locator(".group-card", { hasText: "Linked · level 2" });
  await expect(closed).toHaveAttribute("aria-expanded", "false");
  await expect(card(page, "review")).toHaveCount(0);
  await expect.poll(() => linkEndsOn(page, '.group-card[data-key="links:level-2"]')).toBe(true);
});

test("skill-atlas-14: a skill's, a step's and a phase's details with tags and evidence", async ({ page }) => {
  writeWorkflows(FLOW);
  await page.goto(url);
  await groupBy(page, "Links");

  // A skill: what it holds, its tags by category with evidence, its links out.
  await cardButton(page, "decide").click();
  const panel = details(page);
  await expect(panel.getByRole("heading", { name: "/decide" })).toBeVisible();
  const tags = panel.locator("section.d-sec", { has: page.getByRole("heading", { name: "Tags", exact: true }) });
  await expect(tags.getByRole("heading", { name: /Data in/ })).toBeVisible();
  await expect(tags.getByRole("heading", { name: /Human/ })).toBeVisible();
  const approval = tags.locator(".ev-tag", { hasText: "Needs approval" });
  await expect(approval.locator(".ev li")).toContainText("Wait for the user's approval before recording the decision.");
  await expect(tags.locator(".ev-tag", { hasText: "Reads files" }).locator(".ev li")).toContainText("Read the spec files of the area.");
  const steps = panel.locator("section.d-sec", { has: page.getByRole("heading", { name: "Steps · 3" }) });
  await expect(steps.getByRole("button")).toHaveCount(3);
  const calls = panel.locator("section.d-sec", { has: page.getByRole("heading", { name: "Links out · 1" }) });
  await expect(calls.getByRole("button", { name: "/review" })).toBeVisible();
  await expect(calls).toContainText("Invoke the `review` skill on the decision.");
  await expect(calls.locator(".kind")).toHaveText("calls");
  await expect(panel.locator("section.d-sec", { has: page.getByRole("heading", { name: "Links in · 0" }) })).toBeVisible();

  // A step: its lines, its text and its tags with evidence.
  await card(page, "decide").getByRole("button", { name: /Record/ }).click();
  const body = card(page, "decide").locator(".step[data-step='decide#3'] .step-body");
  await expect(body.locator(".lines")).toHaveText(/^Lines? \d+/);
  await expect(body.locator(".excerpt")).toContainText("Wait for the user's approval");
  await expect(body.locator(".ev-tag", { hasText: "Needs approval" }).locator(".ev li")).toContainText("Wait for the user's approval");

  // A phase: its skills and the union of their tags, each with the skills it comes from.
  await groupBy(page, "Workflow");
  await page.getByRole("region", { name: /^Plan,/ }).getByRole("button", { name: "Plan", exact: true }).click();
  await expect(panel.getByRole("heading", { name: "Plan", exact: true })).toBeVisible();
  await expect(panel).toContainText("Phase 1 of 2 · Flow");
  const phaseTags = panel.locator("section.d-sec", { has: page.getByRole("heading", { name: "Tags", exact: true }) });
  const asks = phaseTags.locator(".tag-row", { hasText: "Asks the user" });
  const approves = phaseTags.locator(".tag-row", { hasText: "Needs approval" });
  await expect(asks.getByRole("button", { name: "/code" })).toBeVisible();
  await expect(approves.getByRole("button", { name: "/decide" })).toBeVisible();
  await expect(phaseTags.locator(".tag-row", { hasText: "Reads files" }).getByRole("button", { name: "/decide" })).toBeVisible();
  await expect(phaseTags.locator(".tag-row", { hasText: "Writes files" }).getByRole("button", { name: "/code" })).toBeVisible();
});

test("skill-atlas-15: a followed link selects its target", async ({ page }) => {
  await page.goto(url);
  await groupBy(page, "Links");
  await page.getByRole("button", { name: "Collapse Linked · level 2" }).click();
  await expect(card(page, "review")).toHaveCount(0);

  // From a step's call chip: the closed group opens and the target is selected.
  await cardButton(page, "code").click();
  await card(page, "code").getByRole("button", { name: "→ review" }).click();
  await expect(card(page, "review")).toHaveClass(/\bselected\b/);
  await expect(card(page, "review")).toBeInViewport();
  await expect(details(page).getByRole("heading", { name: "/review" })).toBeVisible();

  // From a skill's details.
  await cardButton(page, "ship").click();
  await details(page).getByRole("button", { name: "/code", exact: true }).click();
  await expect(details(page).getByRole("heading", { name: "/code" })).toBeVisible();
  await expect(card(page, "code")).toHaveClass(/\bselected\b/);
});

test("skill-atlas-16: search, a tag filter and a focus narrow the skills shown", async ({ page }) => {
  await page.goto(url);
  await groupBy(page, "Links");
  const all = [MARKUP, "code", "decide", "guide", "lint-docs", "lone", "notes", "research", "review", "ship"];
  await expect.poll(() => shownSkills(page)).toEqual(all);

  // Search matches names, descriptions and step titles.
  const search = page.getByRole("searchbox", { name: /Search skills/ });
  await search.fill("review");
  await expect.poll(() => shownSkills(page)).toEqual(["code", "review"]);
  await expect(page.getByRole("region", { name: /^Entry points,/ })).toHaveAttribute("aria-label", "Entry points, 0 of 3 skills shown");

  // A tag filter, together with the search, then alone.
  await page.getByRole("button", { name: "Filter by tags" }).click();
  await page.getByRole("checkbox", { name: /^Asks the user/ }).check();
  await expect.poll(() => shownSkills(page)).toEqual(["code"]);
  await page.getByRole("checkbox", { name: /^Asks the user/ }).uncheck();
  await expect.poll(() => shownSkills(page)).toEqual(["code", "review"]);
  await page.keyboard.press("Escape");
  await search.fill("");
  await expect.poll(() => shownSkills(page)).toEqual(all);
  await page.getByRole("button", { name: "Filter by tags" }).click();
  await page.getByRole("checkbox", { name: /^Needs approval/ }).check();
  await expect.poll(() => shownSkills(page)).toEqual(["decide"]);
  await page.getByRole("checkbox", { name: /^Needs approval/ }).uncheck();
  await page.keyboard.press("Escape");
  await expect.poll(() => shownSkills(page)).toEqual(all);

  // A focus: the skill and every skill linked to or from it, through any number of links.
  await cardButton(page, "ship").click();
  await details(page).getByRole("button", { name: "Focus on linked" }).click();
  await expect.poll(() => shownSkills(page)).toEqual(["code", "review", "ship"]);
  await expect(page.getByRole("button", { name: "Clear focus on /ship" })).toBeVisible();
  await page.getByRole("button", { name: "Clear focus on /ship" }).click();
  await expect.poll(() => shownSkills(page)).toEqual(all);
});

test("skill-atlas-17: an insight's choice selects its skills", async ({ page }) => {
  await page.goto(url);
  await groupBy(page, "Links");
  await page.getByRole("button", { name: /^Insights/ }).click();
  const insights = page.getByRole("group", { name: "Insights" });
  await expect(insights.getByRole("heading", { name: /^Name differs from its folder/ })).toBeVisible();
  await insights.getByRole("button", { name: /frontmatter name/ }).click();
  await expect(card(page, MARKUP)).toHaveClass(/\bselected\b/);
  await expect(details(page).getByRole("heading", { name: "/" + MARKUP })).toBeVisible();
});

test("skill-atlas-18: a skill whose name and step hold markup is shown as text", async ({ page }) => {
  await page.goto(url);
  await groupBy(page, "Links");
  const markup = card(page, MARKUP);
  await expect(markup.locator(".card-name")).toHaveText("/" + MARKUP);
  await expect(markup.locator(".card-desc")).toContainText("<script>window.__atlasXss = 2</script>");
  await markup.locator(".card-main").click();
  await expect(markup.locator(".step-title").first()).toHaveText(STEP_TITLE);
  await markup.getByRole("button", { name: /Echo/ }).click();
  await expect(markup.locator(".step-body .excerpt")).toHaveText(STEP_TEXT);
  await expect(details(page).getByRole("heading", { name: "/" + MARKUP })).toBeVisible();
  // Nothing from the skill became an element or ran.
  await expect(page.locator("#board img, #details img, #board script, #details script, #board b, #details b[onmouseover]")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __atlasXss?: number }).__atlasXss)).toBeUndefined();
});

test("skill-atlas-19: a workflow from a preset, a phase added and renamed, a skill moved by the menu, an edit undone, standing after a reload", async ({ page }) => {
  await page.goto(url);
  // No workflow yet: the presets are offered.
  await expect(page.getByRole("heading", { name: "Organize your skills into a workflow" })).toBeVisible();
  await page.getByRole("button", { name: /^Software delivery/ }).click();
  // Each skill goes to the one phase whose keyword its name, else its description, holds earliest.
  await expect.poll(() => groupLabels(page)).toEqual([
    "Discover, 1 skill", "Decide, 1 skill", "Build, 1 skill", "Verify, 2 skills", "Ship, 1 skill", "Operate, 0 skills", "Unassigned, 4 skills",
  ]);
  await expect(page.locator(".toast", { hasText: "Placed 6 skills by keyword" })).toBeVisible();
  const verify = page.getByRole("region", { name: /^Verify,/ });
  await expect(verify.getByRole("button", { name: /^\/lint-docs\b/ })).toBeVisible();
  await expect(verify.getByRole("button", { name: /^\/review\b/ })).toBeVisible();
  const placed = (phase: string) => page.getByRole("region", { name: new RegExp(`^${phase},`) }).locator(".card[data-skill]").evaluateAll((cs) => cs.map((c) => c.getAttribute("data-skill")));
  expect(await placed("Discover")).toEqual(["research"]);
  expect(await placed("Decide")).toEqual(["decide"]);
  expect(await placed("Build")).toEqual(["code"]);
  expect(await placed("Ship")).toEqual(["ship"]);

  // A phase added, then renamed in place.
  await page.getByRole("button", { name: "Add phase" }).click();
  const name = page.getByRole("textbox", { name: "Phase name" });
  await expect(name).toBeFocused();
  await name.fill("Hardening");
  await name.press("Enter");
  const hardening = page.getByRole("region", { name: /^Hardening,/ });
  await expect(hardening).toBeVisible();

  // A skill moved by its card's menu.
  await verify.getByRole("button", { name: "Actions for /lint-docs" }).click();
  // "Move to…" lists the phases before "Also add to…" does.
  await page.getByRole("menuitem", { name: "Hardening", exact: true }).first().click();
  await expect(hardening.getByRole("button", { name: /^\/lint-docs\b/ })).toBeVisible();
  await expect(verify.getByRole("button", { name: /^\/lint-docs\b/ })).toHaveCount(0);

  // A second move, undone: only the latest edit can be undone, and the first stands.
  await page.getByRole("region", { name: /^Unassigned,/ }).getByRole("button", { name: "Actions for /lone" }).click();
  await page.getByRole("menuitem", { name: "Hardening", exact: true }).first().click();
  await expect(hardening.getByRole("button", { name: /^\/lone\b/ })).toBeVisible();
  await expect(page.locator(".toast").getByRole("button", { name: "Undo" })).toHaveCount(1);
  await page.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await expect(hardening.getByRole("button", { name: /^\/lone\b/ })).toHaveCount(0);
  await expect(hardening.getByRole("button", { name: /^\/lint-docs\b/ })).toBeVisible();
  await expect(page.locator("#save-status")).toHaveText("Saved");

  // The workflows file in the state folder holds the change.
  const file = join(state, WORKFLOWS);
  expect(existsSync(file)).toBe(true);
  const doc = JSON.parse(readFileSync(file, "utf8"));
  const wf = doc.workflows.find((w: { id: string }) => w.id === doc.active);
  expect(wf.name).toBe("Software delivery");
  const phase = (n: string) => wf.phases.find((p: { name: string }) => p.name === n);
  expect(wf.phases.map((p: { name: string }) => p.name)).toEqual(["Discover", "Decide", "Build", "Verify", "Ship", "Operate", "Hardening"]);
  expect(phase("Hardening").skills).toEqual(["lint-docs"]);
  expect(phase("Verify").skills).toEqual(["review"]);

  // And the page shows it again after a reload.
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Active workflow" })).toHaveValue(wf.id);
  await expect.poll(() => groupLabels(page)).toEqual([
    "Discover, 1 skill", "Decide, 1 skill", "Build, 1 skill", "Verify, 1 skill", "Ship, 1 skill", "Operate, 0 skills", "Hardening, 1 skill", "Unassigned, 4 skills",
  ]);
  await expect(page.getByRole("region", { name: /^Hardening,/ }).getByRole("button", { name: /^\/lint-docs\b/ })).toBeVisible();
});

test("skill-atlas-20: a file changed behind the page refuses the next edit and stands", async ({ page }) => {
  writeWorkflows(FLOW);
  await page.goto(url);
  await expect.poll(() => groupLabels(page)).toEqual(["Plan, 2 skills", "Make, 1 skill", "Unassigned, 7 skills"]);

  // Someone else (another tab, the agent) rewrites the file.
  const changed = { ...FLOW, workflows: [{ ...FLOW.workflows[0], name: "Flow, changed elsewhere" }] };
  writeWorkflows(changed);
  const stored = readFileSync(join(state, WORKFLOWS), "utf8");

  await page.getByRole("region", { name: /^Unassigned,/ }).getByRole("button", { name: "Actions for /lone" }).click();
  await page.getByRole("menuitem", { name: "Make", exact: true }).first().click();
  const banner = page.getByRole("alert");
  await expect(banner).toHaveText(/Workflows were changed elsewhere — your last edit was not saved\./);
  expect(readFileSync(join(state, WORKFLOWS), "utf8")).toBe(stored);
  // No further edit is offered until the stored workflows are loaded.
  await expect(page.getByRole("button", { name: "Add phase" })).toHaveCount(0);

  await banner.getByRole("button", { name: "Reload" }).click();
  await expect(banner).toBeHidden();
  await expect(page.getByRole("combobox", { name: "Active workflow" }).locator("option:checked")).toHaveText("Flow, changed elsewhere");
  await expect.poll(() => groupLabels(page)).toEqual(["Plan, 2 skills", "Make, 1 skill", "Unassigned, 7 skills"]);
  expect(readFileSync(join(state, WORKFLOWS), "utf8")).toBe(stored);
});

test("skill-atlas-21: an unreadable workflows file is named, and started fresh with the file kept", async ({ page }) => {
  const broken = '{ "version": 1, "workflows": [ }';
  mkdirSync(state, { recursive: true });
  writeFileSync(join(state, WORKFLOWS), broken);
  await page.goto(url);
  const notice = page.getByRole("region", { name: "Workflows file unreadable" });
  await expect(notice).toContainText(join(state, WORKFLOWS));
  // No workflow edit is offered, here or from a card in another grouping.
  await expect(page.getByRole("combobox", { name: "Active workflow" })).toBeDisabled();
  await groupBy(page, "Links");
  await page.getByRole("button", { name: "Actions for /lone" }).click();
  await expect(page.getByRole("menuitem")).toHaveText(["Open details", "Show steps", "Focus on linked"]);
  await page.keyboard.press("Escape");
  await groupBy(page, "Workflow");

  await notice.getByRole("button", { name: /^Start fresh/ }).click();
  await expect(page.getByRole("heading", { name: "Organize your skills into a workflow" })).toBeVisible();
  expect(readFileSync(join(state, "workflows.invalid-1.json"), "utf8")).toBe(broken);
  expect(JSON.parse(readFileSync(join(state, WORKFLOWS), "utf8")).workflows).toEqual([]);
});

test("skill-atlas-22: an exported file opened from disk keeps a workflow edit after a reload", async ({ page }) => {
  writeWorkflows(FLOW);
  const out = join(tmp, "atlas.html");
  execFileSync(process.execPath, [CLI, "export", "--out", out, "--cwd", project, "--no-user", "--no-plugins", "--state", state]);
  await page.goto(pathToFileURL(out).href);
  await expect.poll(() => groupLabels(page)).toEqual(["Plan, 2 skills", "Make, 1 skill", "Unassigned, 7 skills"]);
  await expect(page.getByRole("button", { name: "Rescan" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Download workflows.json" })).toBeVisible();

  await page.getByRole("region", { name: /^Unassigned,/ }).getByRole("button", { name: "Actions for /lone" }).click();
  await page.getByRole("menuitem", { name: "Make", exact: true }).first().click();
  await expect(page.getByRole("region", { name: /^Make,/ }).getByRole("button", { name: /^\/lone\b/ })).toBeVisible();
  await expect(page.locator("#save-status")).toHaveText("Saved in this browser");

  await page.reload();
  await expect.poll(() => groupLabels(page)).toEqual(["Plan, 2 skills", "Make, 2 skills", "Unassigned, 6 skills"]);
  await expect(page.getByRole("region", { name: /^Make,/ }).getByRole("button", { name: /^\/lone\b/ })).toBeVisible();
});
