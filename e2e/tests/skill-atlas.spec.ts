// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Skill Atlas's page in a browser (skill-atlas-26): the skill's own server
// (`atlas.mjs serve`) over skill folders built for the test in two agent
// folders. No Spex core or UI is involved.
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SKILL = join(REPO, "skills", "skill-atlas");
const CLI = join(SKILL, "scripts", "atlas.mjs");
const SERVER_START_TIMEOUT_MS = 15_000; // a scan of ten fixture skills takes well under a second

let tmp = "";
let project = "";
let state = "";
let url = "";
let server: ChildProcess | undefined;

function skill(project: string, folder: string, name: string, description: string, body: string, extra = "") {
  const dir = join(project, folder, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n${extra}---\n${body}`);
}

// Ten skills: `ship` calls `code`, which calls `review`; `decide` calls
// `review`; `guide`'s one step only mentions `review`, which is no dependency; tags of all four categories, a
// human one among them; `notes` has only sections; `lone` links nowhere;
// the skill in `markup` has markup in its name, description and a step.
function buildFixture(project: string) {
  const claude = ".claude/skills";
  const agents = ".agents/skills";
  skill(project, claude, "code", "Implements a requested change.",
    "# Code\n\n## Step 1: Plan\n\nAsk the user which branch to use.\n\n## Step 2: Write\n\nWrite the code files for the change.\n\n## Step 3: Review\n\nInvoke the `review` skill once the change is written.\n",
    "license: MIT\ncompatibility: Requires git.\n");
  skill(project, claude, "decide", "Decides on a design.",
    "# Decide\n\n## Step 1: Read\n\nRead the spec files of the area.\n\n## Step 2: Check\n\nInvoke the `review` skill on the decision.\n\n## Step 3: Record\n\nWait for the user's approval before recording the decision.\n");
  skill(project, claude, "review", "Reviews commits.",
    "# Review\n\n## Step 1: Diff\n\nRun git diff against the base branch.\n\n## Step 2: Report\n\nReport the findings to the user.\n");
  skill(project, claude, "notes", "Notes on house conventions.",
    "# Notes\n\n## Background\n\nSome context about the house.\n\n## Conventions\n\nSome conventions to keep.\n");
  skill(project, claude, "lone", "Stands alone.", "Just one paragraph of prose with no headings and no links.\n");
  skill(project, claude, "guide", "Points the way.", "# Guide\n\n## Step 1: Point\n\nSee also the `review` skill for checks.\n");
  const markup = join(project, claude, "markup");
  mkdirSync(markup, { recursive: true });
  writeFileSync(join(markup, "SKILL.md"), `---\nname: "${MARKUP}"\ndescription: Shows <script>window.__atlasXss = 2</script> as text.\n---\n# Markup\n\n## Step 1: Echo\n\nPrint it verbatim.\n\n## Step 2: Done\n\nNothing else.\n`);
  skill(project, agents, "ship", "Publishes a release.",
    "# Ship\n\n## Step 1: Build\n\nRun /code for the release notes.\n\n## Step 2: Tag\n\nRun git tag for the version.\n");
  skill(project, agents, "lint-docs", "Lints the documentation.", "# Lint docs\n\n## Step 1: Lint\n\nRun the command that lints every page.\n");
  skill(project, agents, "research", "Investigates a topic.", "# Research\n\n## Step 1: Search\n\nUse WebSearch for the topic.\n");
  // Chinese translations beside three skills: `code`'s made from its source
  // as it stands, `review`'s recording another digest, so it is behind its
  // source, `notes`'s recording another digest of its own, so it was edited
  // apart from its source; `decide` has none.
  translation(join(project, claude, "code"), sha256(join(project, claude, "code", "SKILL.md")), "code", CODE_ZH.description,
    `# 编码\n\n## 步骤 1：${CODE_ZH.steps[0]}\n\n询问用户使用哪个分支。\n\n## 步骤 2：${CODE_ZH.steps[1]}\n\n为这次更改编写代码文件。\n\n## 步骤 3：${CODE_ZH.steps[2]}\n\n更改写好后，调用 \`review\` 技能。\n`,
    `compatibility: ${CODE_ZH.compatibility}\n`);
  translation(join(project, claude, "review"), "0".repeat(64), "review", REVIEW_ZH,
    "# 评审\n\n## 步骤 1：对比\n\n对基础分支运行 git diff。\n\n## 步骤 2：报告\n\n向用户报告发现的问题。\n");
  const notes = join(project, claude, "notes");
  writeFileSync(join(notes, "SKILL.zh-CN.md"), `---\nname: notes\ndescription: ${NOTES_ZH}\n---\n<!-- skill-atlas:source sha256=${sha256(join(notes, "SKILL.md"))} own=${"1".repeat(64)} -->\n# 笔记\n\n## 背景\n\n关于团队的一些背景。\n\n## 约定\n\n要遵守的一些约定。\n`);
}

const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
function translation(dir: string, digest: string, name: string, description: string, body: string, extra = "") {
  writeFileSync(join(dir, "SKILL.zh-CN.md"), `---\nname: ${name}\ndescription: ${description}\n${extra}---\n<!-- skill-atlas:source sha256=${digest} -->\n${body}`);
}
// `code`'s translation gives its `compatibility` and leaves out its `license`.
const CODE_ZH = { description: "实现所请求的更改。", steps: ["规划", "编写", "评审"], file: "询问用户使用哪个分支。", compatibility: "需要 git。" };
const REVIEW_ZH = "评审提交。";
const NOTES_ZH = "团队约定笔记。";

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
  const started = await serve(project, state);
  server = started.child;
  url = started.url;
});

test.afterAll(async () => {
  await stop(server);
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

// The skill's server over `cwd`'s folders alone, and the URL its first line names.
async function serve(cwd: string, stateDir: string) {
  const child = spawn(process.execPath, [CLI, "serve", "--no-open", "--port", "0", "--cwd", cwd, "--no-user", "--no-plugins", "--state", stateDir], { stdio: ["ignore", "pipe", "pipe"] });
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
  return { child, url: info.url };
}
async function stop(child: ChildProcess | undefined) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((r) => child.once("exit", r));
  child.kill("SIGTERM");
  await exited;
}

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

// `grouping` is the radio's name in the page's language.
async function groupBy(page: Page, grouping: string) {
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

test("skill-atlas-13: each grouping's groups, a skill opened to its steps, a dependency re-anchored to a closed group, a mention neither drawn nor counted", async ({ page }) => {
  writeWorkflows(FLOW);
  await page.goto(url);
  // Workflow: the active workflow's phases in order, then the skills in no phase.
  await expect.poll(() => groupLabels(page)).toEqual(["Plan, 2 skills", "Make, 1 skill", "Unassigned, 7 skills"]);
  // A phase entry no reported skill has is shown as missing (skill-atlas-19).
  await expect(page.getByRole("region", { name: /^Make,/ })).toContainText("Not installed — kept in this workflow");

  // Dependencies: entry points, each further call depth, then skills with none;
  // `guide`, which only mentions `review`, depends on nothing.
  await groupBy(page, "Dependencies");
  await expect.poll(() => groupLabels(page)).toEqual(["Entry points, 2 skills", "Called, 1 skill", "Called · level 2, 1 skill", "Standalone, 6 skills"]);
  const entry = page.getByRole("region", { name: /^Entry points,/ });
  await expect(entry.getByRole("button", { name: /^\/ship\b/ })).toBeVisible();
  await expect(entry.getByRole("button", { name: /^\/decide\b/ })).toBeVisible();
  await expect(page.getByRole("region", { name: /^Standalone,/ }).getByRole("button", { name: /^\/guide\b/ })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Mentions" })).toHaveCount(0);
  await expect(page.locator("#summary")).toContainText("3 dependencies");

  // Source: the scanned folders.
  await groupBy(page, "Source");
  await expect.poll(() => groupLabels(page)).toEqual(["Project · Claude Code, 7 skills", "Project · Universal, 3 skills"]);

  // A skill opened to its steps.
  await groupBy(page, "Dependencies");
  await cardButton(page, "code").click();
  await expect(card(page, "code").locator(".steps-head")).toHaveText("Steps · 3");
  await expect(card(page, "code").locator(".step-title")).toHaveText(["Plan", "Write", "Review"]);

  // The call code → review ends on review's card, then on its closed group's card.
  await expect.poll(() => linkEndsOn(page, '.card[data-skill="review"]')).toBe(true);
  await page.getByRole("button", { name: "Collapse Called · level 2" }).click();
  const closed = page.locator(".group-card", { hasText: "Called · level 2" });
  await expect(closed).toHaveAttribute("aria-expanded", "false");
  await expect(card(page, "review")).toHaveCount(0);
  await expect.poll(() => linkEndsOn(page, '.group-card[data-key="dependencies:level-2"]')).toBe(true);
});

test("skill-atlas-13: a card reads what it depends on and what uses it, and a step that only mentions a skill shows no chip and no dependency", async ({ page }) => {
  await page.goto(url);
  await groupBy(page, "Dependencies");
  // Only the counts that are not zero, and a step count only where the skill has steps.
  await expect(card(page, "code").locator(".card-meta span")).toHaveText(["3 steps", "Depends on 1 · Used by 1"]);
  await expect(card(page, "review").locator(".card-deps")).toHaveText("Used by 2");
  await expect(card(page, "ship").locator(".card-deps")).toHaveText("Depends on 1");
  await expect(card(page, "lone").locator(".card-meta span")).toHaveCount(0);
  await cardButton(page, "guide").click();
  const panel = details(page);
  const section = (heading: string) => panel.locator("section.d-sec", { has: page.getByRole("heading", { name: heading }) });
  // The mention is nothing on the step, the card or the details.
  await expect(card(page, "guide").locator(".step[data-step='guide#1'] .call-chip")).toHaveCount(0);
  await expect(card(page, "guide").locator(".card-deps")).toHaveCount(0);
  await expect(section("Depends on · 0")).toContainText("Depends on no other skill.");
  await expect(panel.getByRole("button", { name: "Focus on dependencies" })).toBeDisabled();
  await cardButton(page, "review").click();
  const usedBy = section("Used by · 2");
  await expect(usedBy.getByRole("button")).toHaveCount(2);
  await expect(usedBy.getByRole("button", { name: "/guide" })).toHaveCount(0);
});

test("skill-atlas-13: a card's tag categories show only those it has, each named with its count", async ({ page }) => {
  await page.goto(url);
  await groupBy(page, "Dependencies");
  const counts = (id: string) => card(page, id).locator(".card-foot .pill");
  await expect(counts("decide")).toHaveCount(2);
  for (const name of ["Data in: 1", "Human: 1"]) {
    await expect(card(page, "decide").getByRole("img", { name, exact: true })).toHaveAttribute("title", name);
  }
  await expect(counts("decide")).toHaveText(["1", "1"]);
  await expect(counts("lone")).toHaveCount(0);
});

test("skill-atlas-13: a skill installed in several folders says in how many and names them, by its tooltip and its name alike", async ({ page }) => {
  const copy = join(project, ".claude", "skills", "research");
  mkdirSync(copy, { recursive: true });
  writeFileSync(join(copy, "SKILL.md"), readFileSync(join(project, ".agents", "skills", "research", "SKILL.md")));
  try {
    await rescan();
    await page.goto(url);
    await groupBy(page, "Dependencies");
    // Its folders by their sources' titles and the words it shows, alike in its tooltip, its own name and its card's.
    const named = /^Installed in 2 places: Project · (Universal|Claude Code), Project · (Universal|Claude Code)$/;
    const places = card(page, "research").getByRole("img", { name: named });
    await expect(places).toHaveText("2 places");
    const label = (await places.getAttribute("aria-label"))!;
    expect(label).toContain("Universal");
    expect(label).toContain("Claude Code");
    await expect(places).toHaveAttribute("title", label);
    await expect(cardButton(page, "research")).toHaveAccessibleName(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    await expect(card(page, "code").locator(".card-copies")).toHaveCount(0);
  } finally {
    rmSync(copy, { recursive: true, force: true });
    await rescan();
  }
});

test("skill-atlas-37: one control opens or closes the shown cards' steps, never the groups", async ({ page }) => {
  await page.goto(url);
  await groupBy(page, "Dependencies");
  const control = page.locator("#btn-steps");
  const open = () => page.locator("#board .card.expanded").evaluateAll((cs) => cs.map((c) => c.getAttribute("data-skill")).sort());
  await page.getByRole("button", { name: "Collapse Called · level 2" }).click();
  await expect(control).toHaveText("Expand steps");
  await control.click();
  // Every shown card with steps opened; `lone` has none, the closed group stays closed.
  await expect.poll(open).toEqual([MARKUP, "code", "decide", "guide", "lint-docs", "notes", "research", "ship"]);
  await expect(card(page, "review")).toHaveCount(0);
  await expect(control).toHaveText("Collapse steps");
  await control.click();
  await expect.poll(open).toEqual([]);
  // One card opened by hand: the control closes it.
  await cardButton(page, "code").click();
  await expect(control).toHaveText("Collapse steps");
  await control.click();
  await expect.poll(open).toEqual([]);
  await expect(control).toHaveText("Expand steps");
  // A card with no steps, opened by hand, is open too: the control closes it.
  await cardButton(page, "lone").click();
  await expect.poll(open).toEqual(["lone"]);
  await expect(control).toHaveText("Collapse steps");
  await control.click();
  await expect.poll(open).toEqual([]);
  // With no shown card having steps, there is nothing to open.
  await page.getByRole("searchbox", { name: /Search skills/ }).fill("Stands alone");
  await expect.poll(() => shownSkills(page)).toEqual(["lone"]);
  await expect(control).toBeDisabled();
});

test("skill-atlas-13, skill-atlas-14, skill-atlas-17: problems mark their skills and are counted, notes listed after them and marking none", async ({ page }) => {
  const atlas = await (await fetch(new URL("/api/atlas", url))).json() as { insights: { kind: string; level: string; skills: string[] }[] };
  const problems = atlas.insights.filter((i) => i.level === "problem");
  const notes = atlas.insights.filter((i) => i.level === "note");
  expect(problems.length && notes.length).toBeTruthy();
  await page.goto(url);
  await groupBy(page, "Dependencies");
  const opener = page.getByRole("button", { name: /^Insights/ });
  await expect(page.locator("#insights-n")).toHaveText(String(problems.length));
  await expect(opener).toHaveAccessibleName(`Insights, ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  // A skill with a problem is marked; one with only a note is not, its details still telling it.
  const noted = notes.flatMap((i) => i.skills).find((id) => !problems.some((p) => p.skills.includes(id)))!;
  const flagged = problems.flatMap((i) => i.skills)[0]!;
  await expect(card(page, flagged).locator(".issue-dot")).toHaveCount(1);
  await expect(card(page, noted).locator(".issue-dot")).toHaveCount(0);
  await card(page, noted).locator(".card-main").click();
  await expect(details(page).getByRole("list", { name: "Notes" }).getByRole("listitem")).not.toHaveCount(0);
  // The problems by kind first, then the notes under a heading of their own.
  await opener.click();
  const headings = await page.getByRole("group", { name: "Insights" }).getByRole("heading").allTextContents();
  const at = headings.indexOf("Notes");
  expect(at).toBeGreaterThan(0);
  expect(headings.slice(0, at).some((h) => h.startsWith("Name differs from its folder"))).toBe(false);
  expect(headings.slice(at).some((h) => h.startsWith("Name differs from its folder"))).toBe(true);
  expect(headings.slice(0, at).some((h) => h.startsWith("Translations behind their source"))).toBe(true);

  // With notes alone, nothing is counted and the notes lead the panel, no divider above them.
  await page.route((u) => u.pathname === "/api/atlas", async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    body.insights = body.insights.filter((i: { level: string }) => i.level === "note");
    await route.fulfill({ response: res, json: body });
  });
  await page.reload();
  await expect(page.locator("#insights-n")).toBeHidden();
  await expect(opener).toHaveAccessibleName("Insights");
  await opener.click();
  const lead = page.getByRole("group", { name: "Insights" }).locator(":scope > :first-child");
  await expect(lead).toHaveText("Notes");
  await expect(lead).toHaveCSS("border-top-width", "0px");
});

test("skill-atlas-35: a selected or focused skill's dependencies drawn at full strength and the others dimmed, hovering changing nothing, in both themes", async ({ page }) => {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto(url);
    await groupBy(page, "Dependencies");
    const lines = page.locator("#link-layer .lk");
    const hot = page.locator("#link-layer .lk.hot");
    const dim = page.locator("#links.emph .lk:not(.hot)");
    await expect(lines).toHaveCount(3);
    // Nothing selected: every line as drawn.
    await expect(page.locator("#links")).not.toHaveClass(/\bemph\b/);
    await card(page, "decide").hover();
    await expect(page.locator("#links")).not.toHaveClass(/\bemph\b/);
    // Selected: its two dependencies at full strength, the third dimmed.
    await cardButton(page, "code").click();
    await expect(hot).toHaveCount(2);
    await expect(dim).toHaveCount(1);
    expect(await dim.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeLessThan(1);
    expect(await hot.first().evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(1);
    // Nothing selected, a card holding focus: its one dependency alone.
    await page.keyboard.press("Escape");
    await page.locator("#canvas").focus();
    await expect(page.locator("#links")).not.toHaveClass(/\bemph\b/);
    await card(page, "decide").locator(".card-main").focus();
    await expect(hot).toHaveCount(1);
    await expect(dim).toHaveCount(2);
  }
});

test("skill-atlas-14: a property holding fields shows each on a row of its own, never as JSON", async ({ page }) => {
  skill(project, ".claude/skills", "owned", "Has an owner.", "# Owned\n\n## Step 1: Own\n\nKeep it.\n", "metadata:\n  owner: team\n  tags: [a, b]\n");
  try {
    await rescan();
    await page.goto(url);
    await groupBy(page, "Dependencies");
    await card(page, "owned").locator(".card-main").click();
    const props = details(page).locator("section.d-sec", { has: page.getByRole("heading", { name: "Properties", exact: true }) });
    await expect(props.locator(":scope > dl > dt")).toHaveText(["metadata"]);
    await expect(props.locator(":scope > dl > dd > dl > dt")).toHaveText(["owner", "tags"]);
    await expect(props.locator(":scope > dl > dd > dl > dd")).toHaveText(["team", "a, b"]);
    await expect(props).not.toContainText("{");
  } finally {
    rmSync(join(project, ".claude", "skills", "owned"), { recursive: true, force: true });
    await rescan();
  }
});

test("skill-atlas-14: the details open on a selection alone and close by their Close and by Escape, focus back on what was selected", async ({ page }) => {
  writeWorkflows(FLOW);
  await page.goto(url);
  // No control opens the details: with nothing selected they are closed.
  await expect(page.getByRole("button", { name: "Details", exact: true })).toHaveCount(0);
  await expect(details(page)).toBeHidden();
  // A skill selected opens them; their Close closes them, focus back on its card.
  await groupBy(page, "Dependencies");
  const main = card(page, "code").locator(".card-main");
  await main.click();
  await expect(details(page).getByRole("heading", { name: "/code" })).toBeVisible();
  await details(page).getByRole("button", { name: "Close details" }).click();
  await expect(details(page)).toBeHidden();
  await expect(main).toBeFocused();
  // F6 moves between the canvas and the open details, and does nothing with none open.
  await page.keyboard.press("F6");
  await expect(main).toBeFocused();
  await main.click();
  await page.keyboard.press("F6");
  await expect(details(page).getByRole("heading", { name: "/code" })).toBeFocused();
  // Escape from inside them closes them, focus back on the card.
  await page.keyboard.press("Escape");
  await expect(details(page)).toBeHidden();
  await expect(main).toBeFocused();
  // A phase selected opens them; Escape closes them, focus back on its name.
  await groupBy(page, "Workflow");
  const plan = page.getByRole("region", { name: /^Plan,/ }).getByRole("button", { name: "Plan", exact: true });
  await plan.click();
  await expect(details(page).getByRole("heading", { name: "Plan", exact: true })).toBeVisible();
  await details(page).getByRole("button", { name: "Close details" }).focus();
  await page.keyboard.press("Escape");
  await expect(details(page)).toBeHidden();
  await expect(plan).toBeFocused();
  // An insight's skills open them.
  await page.getByRole("button", { name: /^Insights/ }).click();
  await page.locator(".inspop > button").first().click();
  await expect(details(page)).toBeVisible();
});

test("skill-atlas-14: a skill in two phases gets focus back on the card its details were opened from, by Close, Escape and F6", async ({ page }) => {
  writeWorkflows({ ...FLOW, workflows: [{ ...FLOW.workflows[0], phases: [{ id: "p-plan", name: "Plan", note: "", skills: ["decide", "code"] }, { id: "p-make", name: "Make", note: "", skills: ["code", "review"] }] }] });
  await page.goto(url);
  const inMake = page.getByRole("region", { name: /^Make,/ }).locator('.card[data-skill="code"] .card-main');
  await inMake.click();
  await expect(details(page).getByRole("heading", { name: "/code" })).toBeVisible();
  await details(page).getByRole("button", { name: "Close details" }).click();
  await expect(inMake).toBeFocused();
  await inMake.click();
  await page.keyboard.press("F6");
  await expect(details(page).getByRole("heading", { name: "/code" })).toBeFocused();
  await page.keyboard.press("F6");
  await expect(inMake).toBeFocused();
  await page.keyboard.press("F6");
  await page.keyboard.press("Escape");
  await expect(details(page)).toBeHidden();
  await expect(inMake).toBeFocused();
});

test("skill-atlas-35: an insight naming several skills draws the dependencies among all of them at full strength", async ({ page }) => {
  const claude = join(project, ".claude", "skills");
  skill(project, ".claude/skills", "loop-a", "Loops.", "# A\n\n## Step 1: Go\n\nInvoke the `loop-b` skill.\n");
  skill(project, ".claude/skills", "loop-b", "Loops.", "# B\n\n## Step 1: Go\n\nInvoke the `loop-c` skill.\n");
  skill(project, ".claude/skills", "loop-c", "Loops.", "# C\n\n## Step 1: Go\n\nInvoke the `loop-a` skill.\n");
  try {
    await rescan();
    await page.goto(url);
    await groupBy(page, "Dependencies");
    await expect(page.locator("#link-layer .lk")).toHaveCount(6);
    await page.getByRole("button", { name: /^Insights/ }).click();
    await page.getByRole("group", { name: "Insights" }).getByRole("button", { name: /call each other in a loop/ }).click();
    await expect(details(page).getByRole("heading", { name: "/loop-a" })).toBeVisible();
    // The loop's three dependencies, not only the two touching the skill its details show.
    await expect(page.locator("#link-layer .lk.hot")).toHaveCount(3);
    await expect(page.locator("#links.emph .lk:not(.hot)")).toHaveCount(3);
  } finally {
    for (const n of ["loop-a", "loop-b", "loop-c"]) rmSync(join(claude, n), { recursive: true, force: true });
    await rescan();
  }
});

test("skill-atlas-36, skill-atlas-38: Help shows the legend and the keys, closed by Escape and by its Close with focus back on Help, and by a click elsewhere", async ({ page }) => {
  await page.goto(url);
  const help = page.getByRole("button", { name: "Help", exact: true });
  await expect(help).toHaveAttribute("title", "Help");
  await expect(help).toHaveAttribute("aria-haspopup", "dialog");
  await help.click();
  const panel = page.getByRole("dialog", { name: "Help" });
  await expect(panel.getByRole("heading", { name: "Legend" })).toBeVisible();
  await expect(panel.locator(".legend .row")).toHaveCount(6);
  await expect(panel.locator(".legend")).toContainText("Dependency — one skill calls another");
  await expect(panel.locator(".legend")).toContainText("Has a problem to act on");
  await expect(panel.getByRole("heading", { name: "Keys" })).toBeVisible();
  await expect(panel.locator("kbd")).toHaveText(["/", "Esc", "F6", "Ctrl/⌘ Z"]);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(help).toBeFocused();
  await expect(help).toHaveAttribute("aria-expanded", "false");
  await help.click();
  await panel.getByRole("button", { name: "Close" }).click();
  await expect(panel).toHaveCount(0);
  await expect(help).toBeFocused();
  await help.click();
  await page.locator("#canvas").click({ position: { x: 5, y: 5 } });
  await expect(panel).toHaveCount(0);
});

test("skill-atlas-38: the toolbar's Rescan is an icon named Rescan and busy while it scans", async ({ page }) => {
  await page.goto(url);
  // Held until the test lets the scan answer, so its busy state can be seen.
  let release = () => {};
  const held = new Promise<void>((r) => { release = r; });
  await page.route((u) => u.pathname === "/api/rescan", async (route) => { await held; await route.continue(); });
  const rescanButton = page.getByRole("button", { name: "Rescan", exact: true });
  await expect(rescanButton).toHaveAttribute("title", "Rescan");
  await expect(rescanButton).toHaveText("");
  await rescanButton.click();
  const busy = page.getByRole("button", { name: "Rescanning…", exact: true });
  await expect(busy).toHaveAttribute("aria-busy", "true");
  release();
  await expect(page.locator(".toast", { hasText: /^Rescanned/ })).toBeVisible();
  await expect(rescanButton).toHaveAttribute("aria-busy", "false");
});

test("skill-atlas-39: at a phone's width the toolbar wraps, every control at least 24 pixels, and the page never scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(url);
  await groupBy(page, "Dependencies");
  for (const id of ["btn-insights", "btn-rescan", "btn-help", "btn-lang", "btn-tags", "btn-steps"]) {
    const box = (await page.locator(`#${id}`).boundingBox())!;
    expect(box.x >= 0 && box.x + box.width <= 375, id).toBe(true);
    expect(Math.min(box.width, box.height), id).toBeGreaterThanOrEqual(24);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("skill-atlas-14: a skill's, a step's and a phase's details with tags and evidence", async ({ page }) => {
  writeWorkflows(FLOW);
  await page.goto(url);
  await groupBy(page, "Dependencies");

  // A skill: what it holds, its tags by category with evidence, what it depends on.
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
  const calls = panel.locator("section.d-sec", { has: page.getByRole("heading", { name: "Depends on · 1" }) });
  await expect(calls.getByRole("button", { name: "/review" })).toBeVisible();
  await expect(calls).toContainText("Invoke the `review` skill on the decision.");
  await expect(panel.locator("section.d-sec", { has: page.getByRole("heading", { name: "Used by · 0" }) })).toBeVisible();

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

test("skill-atlas-15: a followed dependency selects its target", async ({ page }) => {
  await page.goto(url);
  await groupBy(page, "Dependencies");
  await page.getByRole("button", { name: "Collapse Called · level 2" }).click();
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
  await groupBy(page, "Dependencies");
  const all = [MARKUP, "code", "decide", "guide", "lint-docs", "lone", "notes", "research", "review", "ship"];
  await expect.poll(() => shownSkills(page)).toEqual(all);

  // Search matches names, descriptions, step titles and each step's text.
  const search = page.getByRole("searchbox", { name: /Search skills/ });
  await search.fill("which");
  await expect.poll(() => shownSkills(page)).toEqual(["code"]);
  // `decide` by its step's text "Invoke the `review` skill on the decision.", `guide` by its step's words.
  await search.fill("review");
  await expect.poll(() => shownSkills(page)).toEqual(["code", "decide", "guide", "review"]);
  await expect(page.getByRole("region", { name: /^Entry points,/ })).toHaveAttribute("aria-label", "Entry points, 1 of 2 skills shown");

  // A tag filter, together with the search, then alone.
  await page.getByRole("button", { name: "Filter by tags" }).click();
  await page.getByRole("checkbox", { name: /^Asks the user/ }).check();
  await expect.poll(() => shownSkills(page)).toEqual(["code"]);
  await page.getByRole("checkbox", { name: /^Asks the user/ }).uncheck();
  await expect.poll(() => shownSkills(page)).toEqual(["code", "decide", "guide", "review"]);
  await page.keyboard.press("Escape");
  await search.fill("");
  await expect.poll(() => shownSkills(page)).toEqual(all);
  await page.getByRole("button", { name: "Filter by tags" }).click();
  await page.getByRole("checkbox", { name: /^Needs approval/ }).check();
  await expect.poll(() => shownSkills(page)).toEqual(["decide"]);
  await page.getByRole("checkbox", { name: /^Needs approval/ }).uncheck();
  await page.keyboard.press("Escape");
  await expect.poll(() => shownSkills(page)).toEqual(all);

  // A focus: the skill and every skill it depends on or that depends on it, through any number of calls.
  await cardButton(page, "ship").click();
  await details(page).getByRole("button", { name: "Focus on dependencies" }).click();
  await expect.poll(() => shownSkills(page)).toEqual(["code", "review", "ship"]);
  await expect(page.getByRole("button", { name: "Clear focus on /ship" })).toBeVisible();
  await page.getByRole("button", { name: "Clear focus on /ship" }).click();
  await expect.poll(() => shownSkills(page)).toEqual(all);
});

test("skill-atlas-17: an insight's choice selects its skills", async ({ page }) => {
  await page.goto(url);
  await groupBy(page, "Dependencies");
  await page.getByRole("button", { name: /^Insights/ }).click();
  const insights = page.getByRole("group", { name: "Insights" });
  await expect(insights.getByRole("heading", { name: /^Name differs from its folder/ })).toBeVisible();
  await insights.getByRole("button", { name: /frontmatter name/ }).click();
  await expect(card(page, MARKUP)).toHaveClass(/\bselected\b/);
  await expect(details(page).getByRole("heading", { name: "/" + MARKUP })).toBeVisible();
});

test("skill-atlas-17: frontmatter in error is said to keep the fields that read, the folder naming the skill only where its name does not", async ({ page }) => {
  const claude = join(project, ".claude", "skills");
  const kept = join(claude, "kept");
  const unnamed = join(claude, "unnamed");
  mkdirSync(kept, { recursive: true });
  mkdirSync(unnamed, { recursive: true });
  writeFileSync(join(kept, "SKILL.md"), "---\nname: kept\ndescription: Keeps its name.\nother: \"unclosed\n---\nText.\n");
  writeFileSync(join(unnamed, "SKILL.md"), "---\nname: \"unclosed\ndescription: Loses its name.\n---\nText.\n");
  try {
    await rescan();
    await page.goto(url);
    await groupBy(page, "Dependencies");
    await page.getByRole("button", { name: /^Insights/ }).click();
    const insights = page.getByRole("group", { name: "Insights" });
    await expect(insights.getByRole("button", { name: /^\/kept\b/ }).filter({ hasText: "Part of its frontmatter could not be read; the fields that read are used" })).toHaveCount(1);
    await expect(insights.getByRole("button", { name: /^\/unnamed\b/ }).filter({ hasText: "Its frontmatter could not be read; the folder name is used as its name" })).toHaveCount(1);
  } finally {
    rmSync(kept, { recursive: true, force: true });
    rmSync(unnamed, { recursive: true, force: true });
    await rescan();
  }
});

// Two differing skills of one name: one note naming both folders, each version comparable with the other.
const WHAT_TO_DO = "An agent that reads more than one of these folders picks one by its own rules.";
const TWIN = {
  one: "# Twin\n\n## Step 1: First\n\nDo the first thing.\n\n## Step 2: Second\n\nDo the second thing.\n",
  two: "# Twin\n\n## Step 1: First\n\nDo another thing.\n\n## Step 2: Second\n\nDo the second thing.\n",
};

test("skill-atlas-17, skill-atlas-34: a name with different versions is a note naming each folder and what to do, and compares them", async ({ page }) => {
  const one = join(project, ".claude", "skills", "twin");
  const two = join(project, ".claude", "skills", "more", "twin");
  skill(project, ".claude/skills", "twin", "Twin.", TWIN.one);
  skill(project, ".claude/skills/more", "twin", "Twin.", TWIN.two);
  try {
    await rescan();
    await page.goto(url);
    await groupBy(page, "Dependencies");
    const opener = page.getByRole("button", { name: /^Insights/ });
    await opener.click();
    const insights = page.getByRole("group", { name: "Insights" });
    // A fact listed among the notes, naming no agent: one insight for the name.
    const headings = await insights.getByRole("heading").allTextContents();
    expect(headings.findIndex((h) => h.startsWith("Names with different versions"))).toBeGreaterThan(headings.indexOf("Notes"));
    await expect(insights.getByRole("button", { name: /^\/twin\b/ })).toHaveCount(1);
    await expect(insights.getByRole("button", { name: /^\/twin\b/ })).toContainText("“twin” has 2 different versions:");
    const repair = insights.locator(".ins-repair", { has: page.locator("code", { hasText: two }) });
    expect((await repair.locator("li code").allTextContents()).sort()).toEqual([one, two].sort());
    await expect(repair.getByRole("button", { name: "Copy folder path" })).toHaveCount(2);
    await expect(repair.locator("p")).toHaveText(WHAT_TO_DO);

    // Compare: the two SKILL.md side by side, the differing line marked, closed by Escape.
    await repair.getByRole("button", { name: /^Compare / }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator(".cmp-cell.changed", { hasText: "Do another thing." })).toHaveCount(1);
    await expect(dialog.locator(".cmp-cell.changed", { hasText: "Do the second thing." })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();

    // The exported copy says what to do alike, and offers no Compare.
    const out = join(tmp, "twin.html");
    execFileSync(process.execPath, [CLI, "export", "--out", out, "--cwd", project, "--no-user", "--no-plugins", "--state", state]);
    await page.goto(pathToFileURL(out).href);
    await page.getByRole("button", { name: /^Insights/ }).click();
    const exported = page.getByRole("group", { name: "Insights" }).locator(".ins-repair", { has: page.locator("code", { hasText: two }) });
    await expect(exported.locator("p")).toHaveText(WHAT_TO_DO);
    await expect(exported.getByRole("button", { name: /^Compare / })).toHaveCount(0);
  } finally {
    rmSync(one, { recursive: true, force: true });
    rmSync(join(project, ".claude", "skills", "more"), { recursive: true, force: true });
    await rescan();
  }
});

test("skill-atlas-14, skill-atlas-34: any two of three versions of a name compare, each noting the other two by folder and each side choosing among them all", async ({ page }) => {
  const claude = join(project, ".claude", "skills");
  const text = (what: string) => `# Tri\n\n## Step 1: Do\n\nDo ${what}.\n\n## Step 2: End\n\nStop.\n`;
  skill(project, ".claude/skills", "tri", "Tri.", text("one thing"));
  skill(project, ".claude/skills/x", "tri", "Tri.", text("two things"));
  skill(project, ".claude/skills/y", "tri", "Tri.", text("three things"));
  try {
    await rescan();
    await page.goto(url);
    await groupBy(page, "Dependencies");
    const ids = await page.locator('#board .card[data-skill^="tri"]').evaluateAll((cs) => cs.map((c) => c.getAttribute("data-skill")!));
    expect(ids).toHaveLength(3);
    const panel = details(page);
    // Each version's note names the other two by folder, each with its own Compare; its file tells what it does.
    const does = new Map<string, string>();
    for (const id of ids) {
      await card(page, id).locator(".card-main").click();
      await expect(panel).toHaveAttribute("data-sel", `skill:${id}`);
      const file = await panel.locator(".d-path code").first().innerText();
      does.set(id, file.includes(join("x", "tri")) ? "Do two things." : file.includes(join("y", "tri")) ? "Do three things." : "Do one thing.");
      await expect(panel.locator(".same-note p")).toHaveText("2 other versions of this name");
      await expect(panel.locator(".same-note li")).toHaveCount(2);
      for (const line of await panel.locator(".same-note li").allInnerTexts()) expect(line).toMatch(/^Project · Claude Code \/\S*\/tri\s*Compare$/);
      await expect(panel.locator(".same-note").getByRole("button", { name: /^Compare / })).toHaveCount(2);
    }
    // A version's second Compare, then the third chosen on the right: every pair is reached.
    const compare = panel.locator(".same-note").getByRole("button", { name: /^Compare / }).nth(1);
    const [a, b] = [(await compare.getAttribute("data-a"))!, (await compare.getAttribute("data-b"))!];
    const c = ids.find((id) => id !== a && id !== b)!;
    await compare.click();
    const dialog = page.getByRole("dialog");
    const left = dialog.getByRole("combobox", { name: "Version on the left" });
    const right = dialog.getByRole("combobox", { name: "Version on the right" });
    await expect(left).toHaveValue(a);
    await expect(right).toHaveValue(b);
    await expect(dialog.locator(".cmp-cell.changed")).toContainText([`${does.get(a)}`, `${does.get(b)}`]);
    await expect(dialog.locator(".cmp-cell.changed")).toHaveCount(2);
    // Each side chooses among all three versions, never the one the other side shows.
    await expect(left.locator("option")).toHaveCount(3);
    await expect(left.locator(`option[value="${b}"]`)).toBeDisabled();
    await right.selectOption(c);
    await expect(dialog.locator(".cmp-cell.changed")).toContainText([`${does.get(a)}`, `${does.get(c)}`]);
    await expect(left.locator(`option[value="${c}"]`)).toBeDisabled();
    await expect(left.locator(`option[value="${b}"]`)).toBeEnabled();
    await left.selectOption(b);
    await expect(dialog.locator(".cmp-cell.changed")).toContainText([`${does.get(b)}`, `${does.get(c)}`]);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(compare).toBeFocused();
    // The insight compares each later version with the first, its dialog choosing among all three too.
    await page.getByRole("button", { name: /^Insights/ }).click();
    const repair = page.getByRole("group", { name: "Insights" }).locator(".ins-repair", { has: page.locator("code", { hasText: join(claude, "y", "tri") }) });
    await expect(repair.getByRole("button", { name: /^Compare / })).toHaveCount(2);
    await repair.getByRole("button", { name: /^Compare / }).first().click();
    await expect(dialog.getByRole("combobox", { name: "Version on the right" }).locator("option")).toHaveCount(3);
    await page.keyboard.press("Escape");
  } finally {
    rmSync(join(claude, "tri"), { recursive: true, force: true });
    rmSync(join(claude, "x"), { recursive: true, force: true });
    rmSync(join(claude, "y"), { recursive: true, force: true });
    await rescan();
  }
});

test("skill-atlas-14, skill-atlas-34: versions of a name in any folders carry one note alike, naming no agent and marking no problem", async ({ page }) => {
  const repo = join(tmp, "versions");
  const sub = join(repo, "sub");
  mkdirSync(sub, { recursive: true });
  execFileSync("git", ["init", "-q", repo]);
  const body = (what: string) => `# Solo\n\n## Step 1: Read\n\nRead the ${what}.\n\n## Step 2: Report\n\nReport what was read.\n`;
  // One agent's folder at two depths, two agents' folders, and the project's source beside an installed version.
  skill(repo, ".github/skills", "solo", "Reads the notes.", body("root's notes"));
  skill(sub, ".github/skills", "solo", "Reads the notes.", body("working folder's notes"));
  skill(sub, ".windsurf/skills", "pal", "Pairs.", body("Windsurf's notes"));
  skill(sub, ".gemini/skills", "pal", "Pairs.", body("Gemini CLI's notes"));
  skill(sub, ".gemini/skills", "src", "Ships.", body("installed notes"));
  skill(sub, "skills", "src", "Ships.", body("source notes"));
  const started = await serve(sub, join(tmp, "versions-state"));
  try {
    await page.goto(started.url);
    await groupBy(page, "Dependencies");
    await expect(page.locator("#insights-n")).toBeHidden();
    await expect(page.locator("#board .issue-dot")).toHaveCount(0);
    const panel = details(page);
    for (const prefix of ["solo", "pal", "src"]) {
      const ids = await page.locator(`#board .card[data-skill^="${prefix}"]`).evaluateAll((cs) => cs.map((c) => c.getAttribute("data-skill")!));
      expect(ids).toHaveLength(2);
      for (const id of ids) {
        await card(page, id).locator(".card-main").click();
        await expect(panel).toHaveAttribute("data-sel", `skill:${id}`);
        await expect(panel.getByRole("list", { name: "Issues" })).toHaveCount(0);
        await expect(panel.locator(".same-note p")).toHaveText("1 other version of this name");
        await expect(panel.locator(".same-note li")).toHaveCount(1);
        await expect(panel.locator(".same-note")).not.toContainText(/overrid|conflict|wins|loads|may load/i);
      }
    }
    await page.getByRole("button", { name: /^Insights/ }).click();
    await expect(page.getByRole("group", { name: "Insights" }).getByRole("button", { name: /different versions:/ })).toHaveCount(3);
    await page.keyboard.press("Escape");
    await card(page, (await page.locator('#board .card[data-skill^="solo"]').first().getAttribute("data-skill"))!).locator(".card-main").click();

    // Compare from the note: the line that differs marked, Escape closing it and returning focus to the note.
    const compare = panel.locator(".same-note").getByRole("button", { name: /^Compare / });
    await compare.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator(".cmp-head")).toHaveCount(2);
    await expect(dialog.locator(".cmp-cell.changed", { hasText: "Read the working folder's notes." })).toHaveCount(1);
    await expect(dialog.locator(".cmp-cell.changed", { hasText: "Report what was read." })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(compare).toBeFocused();
  } finally {
    await stop(started.child);
    rmSync(repo, { recursive: true, force: true });
  }
});

test("skill-atlas-34: a comparison shows what differs at a line's end, and says where SKILL.md is the same", async ({ page }) => {
  const repo = join(tmp, "compare");
  const sub = join(repo, "sub");
  mkdirSync(sub, { recursive: true });
  execFileSync("git", ["init", "-q", repo]);
  // Two versions of each name, one in each project folder's `.github/skills`.
  const text = "# Ends\n\n## Step 1: Read\n\nRead the notes.\n";
  skill(repo, ".github/skills", "ends", "Ends lines.", text);
  skill(sub, ".github/skills", "ends", "Ends lines.", text);
  const crlf = join(sub, ".github", "skills", "ends", "SKILL.md");
  writeFileSync(crlf, readFileSync(crlf, "utf8").replace(/\n/g, "\r\n"));
  skill(repo, ".github/skills", "kit", "Bundles.", text);
  skill(sub, ".github/skills", "kit", "Bundles.", text);
  for (const [dir, what] of [[repo, "one"], [sub, "two"]]) {
    mkdirSync(join(dir, ".github", "skills", "kit", "references"), { recursive: true });
    writeFileSync(join(dir, ".github", "skills", "kit", "references", "x.md"), `${what}\n`);
  }
  // Two texts of 2,002 lines differing in their first and last line, every line between alike;
  // and two whose 2,500 lines all differ, too far apart to pair.
  const lines = (first: string, last: string) => [first, ...Array.from({ length: 2000 }, (_, i) => `Line ${i + 2}.`), last].join("\n");
  const far = (what: string) => Array.from({ length: 2500 }, (_, i) => `${what} ${i}.`).join("\n");
  for (const [dir, what] of [[repo, "one"], [sub, "two"]] as const) {
    for (const [name, text] of [["long", lines(`# Long ${what}`, `End ${what}.`)], ["far", far(what)]]) {
      mkdirSync(join(dir, ".github", "skills", name!), { recursive: true });
      writeFileSync(join(dir, ".github", "skills", name!, "SKILL.md"), text!);
    }
  }
  const started = await serve(sub, join(tmp, "compare-state"));
  try {
    await page.goto(started.url);
    await groupBy(page, "Dependencies");
    const panel = details(page);
    const dialog = page.getByRole("dialog");
    const compare = async (name: string) => {
      await card(page, name).locator(".card-main").click();
      await expect(panel).toHaveAttribute("data-sel", `skill:${name}`);
      await panel.locator(".same-note").getByRole("button", { name: /^Compare / }).click();
      await expect(dialog.locator(".cmp-sum")).not.toHaveText("Loading…");
    };
    // Lines differing in a carriage return alone are marked, the return shown.
    await compare("ends");
    await expect(dialog.locator(".cmp-sum")).toHaveText(/lines differ$/);
    await expect(dialog.locator(".cmp-cell.changed .ws", { hasText: "\u240D" }).first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    // Versions differing in another file alone say so.
    await compare("kit");
    await expect(dialog.locator(".cmp-sum")).toHaveText("SKILL.md is the same in both; the versions differ in their other files.");
    await expect(dialog.locator(".cmp-cell.changed")).toHaveCount(0);
    await page.keyboard.press("Escape");
    // Of 2,002 lines, the first and the last differ and no other is marked.
    await compare("long");
    await expect(dialog.locator(".cmp-sum")).toHaveText("2 lines differ");
    await expect(dialog.locator(".cmp-cell.changed")).toHaveCount(4);
    for (const line of ["# Long one", "# Long two", "End one.", "End two."]) await expect(dialog.locator(".cmp-cell.changed", { hasText: line })).toHaveCount(1);
    await page.keyboard.press("Escape");
    // Too far apart to pair: nothing marked, and said so.
    await compare("far");
    await expect(dialog.locator(".cmp-sum")).toHaveText(/^Too many lines differ to compare them line by line/);
    await expect(dialog.locator(".cmp-cell.changed")).toHaveCount(0);
    await expect(dialog.locator(".cmp-cell:not(.empty)")).toHaveCount(5000);
    await page.keyboard.press("Escape");
  } finally {
    await stop(started.child);
    rmSync(repo, { recursive: true, force: true });
  }
});

test("skill-atlas-17: an unresolved call is an insight, and an unresolved name the skill steers away from is not", async ({ page }) => {
  const dir = join(project, ".claude", "skills", "asker");
  skill(project, ".claude/skills", "asker", "Asks.", "# Asker\n\n## Step 1: Ask\n\nDo not run the `/vanished` command.\n\nInvoke the `away` skill.\n");
  try {
    await rescan();
    await page.goto(url);
    await page.getByRole("button", { name: /^Insights/ }).click();
    const insights = page.getByRole("group", { name: "Insights" });
    await expect(insights).toContainText("asker calls “away”, which is not installed");
    await expect(insights).not.toContainText("vanished");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    await rescan();
  }
});

test("skill-atlas-18: a skill whose name and step hold markup is shown as text", async ({ page }) => {
  await page.goto(url);
  await groupBy(page, "Dependencies");
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

  // A menu's edit undone by the keyboard after its notice has gone.
  await page.getByRole("region", { name: /^Unassigned,/ }).getByRole("button", { name: "Actions for /lone" }).click();
  await page.getByRole("menuitem", { name: "Hardening", exact: true }).first().click();
  await expect(hardening.getByRole("button", { name: /^\/lone\b/ })).toBeVisible();
  await page.locator(".toast").getByRole("button", { name: "Dismiss" }).click();
  await expect(page.locator(".toast")).toHaveCount(0);
  await page.keyboard.press("Control+z");
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

test("skill-atlas-19: an edit saved as the page is hidden, then a further edit saved, not refused", async ({ page }) => {
  writeWorkflows(FLOW);
  await page.goto(url);
  await expect.poll(() => groupLabels(page)).toEqual(["Plan, 2 skills", "Make, 1 skill", "Unassigned, 7 skills"]);
  const make = page.getByRole("region", { name: /^Make,/ });
  const stored = () => JSON.parse(readFileSync(join(state, WORKFLOWS), "utf8")).workflows[0].phases[1].skills as string[];

  // The edit and the page being hidden in one task, so the save as the page is hidden writes it.
  await page.getByRole("region", { name: /^Unassigned,/ }).getByRole("button", { name: "Actions for /lone" }).click();
  await page.evaluate(() => {
    const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((el) => el.textContent?.trim() === "Make")!;
    item.click();
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    Reflect.deleteProperty(document, "visibilityState");
  });
  await expect(make.getByRole("button", { name: /^\/lone\b/ })).toBeVisible();
  await expect(page.locator("#save-status")).toHaveText("Saved");
  expect(stored()).toContain("lone");

  // A further edit is saved over it, not refused as a change made elsewhere.
  await page.getByRole("region", { name: /^Unassigned,/ }).getByRole("button", { name: "Actions for /guide" }).click();
  await page.getByRole("menuitem", { name: "Make", exact: true }).first().click();
  await expect(make.getByRole("button", { name: /^\/guide\b/ })).toBeVisible();
  await expect(page.locator("#save-status")).toHaveText("Saved");
  await expect(page.getByRole("alert")).toBeHidden();
  expect(stored()).toEqual(expect.arrayContaining(["lone", "guide"]));
});

test("skill-atlas-19: notes typed in two workflows from one preset undo apart, the reader staying on the workflow shown", async ({ page }) => {
  await page.goto(url);
  await page.getByRole("button", { name: /^Software delivery/ }).click();
  const active = page.getByRole("combobox", { name: "Active workflow" });
  await expect(active).toHaveValue("wf-software-delivery");
  // A second workflow from the same preset: its phases take the same ids.
  await active.selectOption("__new");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Name" }).fill("Second delivery");
  await dialog.getByRole("radio", { name: /^Software delivery/ }).check();
  await dialog.getByRole("button", { name: "Create workflow" }).click();
  await expect(active).toHaveValue("wf-second-delivery");

  const note = details(page).getByRole("textbox", { name: "Note" });
  const typeNote = async (text: string) => {
    await page.getByRole("region", { name: /^Discover,/ }).getByRole("button", { name: "Discover", exact: true }).click();
    await note.click();
    await note.pressSequentially(text);
    await note.press("Escape");
  };
  // Typed in the first workflow's Discover, then, after a switch, in the second's.
  await active.selectOption("wf-software-delivery");
  await typeNote("first");
  await active.selectOption("wf-second-delivery");
  await typeNote("second");

  // Undo reverts the latest typing alone and leaves the reader on the workflow shown.
  await page.keyboard.press("Control+z");
  await expect(note).toHaveValue("");
  await expect(active).toHaveValue("wf-second-delivery");
  await expect(page.locator("#save-status")).toHaveText("Saved");
  const notes = () => JSON.parse(readFileSync(join(state, WORKFLOWS), "utf8")).workflows.map((w: { phases: { note: string }[] }) => w.phases[0]!.note);
  expect(notes()).toEqual(["first", ""]);
  // Nothing more to undo: the first workflow's note stands.
  await page.keyboard.press("Control+z");
  await active.selectOption("wf-software-delivery");
  await page.getByRole("region", { name: /^Discover,/ }).getByRole("button", { name: "Discover", exact: true }).click();
  await expect(note).toHaveValue("first");
  expect(notes()).toEqual(["first", ""]);
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

test("skill-atlas-13: with no workflow left by a deletion refused as the file changed, the served page offers its presets, never the exported copy's words", async ({ page }) => {
  writeWorkflows(FLOW);
  await page.goto(url);
  await expect.poll(() => groupLabels(page)).toEqual(["Plan, 2 skills", "Make, 1 skill", "Unassigned, 7 skills"]);
  writeWorkflows({ ...FLOW, workflows: [{ ...FLOW.workflows[0], name: "Flow, changed elsewhere" }] });
  await page.getByRole("button", { name: "Workflow actions" }).click();
  await page.getByRole("menuitem", { name: "Delete workflow…" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete workflow" }).click();
  await expect(page.getByRole("alert")).toHaveText(/Workflows were changed elsewhere/);
  await expect(page.getByRole("heading", { name: "Organize your skills into a workflow" })).toBeVisible();
  await expect(page.locator("#board")).not.toContainText("exported copy");
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
  await groupBy(page, "Dependencies");
  await page.getByRole("button", { name: "Actions for /lone" }).click();
  await expect(page.getByRole("menuitem")).toHaveText(["Open details", "Show steps", "Focus on dependencies"]);
  await page.keyboard.press("Escape");
  await groupBy(page, "Workflow");

  await notice.getByRole("button", { name: /^Start fresh/ }).click();
  await expect(page.getByRole("heading", { name: "Organize your skills into a workflow" })).toBeVisible();
  expect(readFileSync(join(state, "workflows.invalid-1.json"), "utf8")).toBe(broken);
  expect(JSON.parse(readFileSync(join(state, WORKFLOWS), "utf8")).workflows).toEqual([]);
});

test("skill-atlas-22: an exported file opened from disk is read-only: its workflows shown with no control editing them, and saying so", async ({ page }) => {
  writeWorkflows(FLOW);
  const out = join(tmp, "atlas.html");
  execFileSync(process.execPath, [CLI, "export", "--out", out, "--cwd", project, "--no-user", "--no-plugins", "--state", state]);
  await page.goto(pathToFileURL(out).href);
  await expect.poll(() => groupLabels(page)).toEqual(["Plan, 2 skills", "Make, 1 skill", "Unassigned, 7 skills"]);
  await expect(page.locator("#save-status")).toHaveText("Exported copy, read-only");
  await expect(page.getByRole("button", { name: "Rescan" })).toBeHidden();
  await expect(page.getByRole("button", { name: /Download/ })).toHaveCount(0);

  // No control creating, renaming, reordering, duplicating or deleting a workflow or a phase, or moving a skill.
  await expect(page.getByRole("button", { name: "Workflow actions" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Active workflow" }).locator("option")).toHaveText(["Flow"]);
  await expect(page.getByRole("button", { name: "Add phase" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Rename phase|^Actions for phase|^Remove / })).toHaveCount(0);
  await expect(page.locator("#board [draggable]")).toHaveCount(0);
  await page.getByRole("region", { name: /^Unassigned,/ }).getByRole("button", { name: "Actions for /lone" }).click();
  await expect(page.getByRole("menuitem")).toHaveText(["Open details", "Show steps", "Focus on dependencies"]);
  await page.keyboard.press("Escape");
  await cardButton(page, "decide").click();
  const panel = details(page);
  await expect(panel.locator("section.d-sec", { has: page.getByRole("heading", { name: "Phases in Flow" }) })).toHaveText(/Plan$/);
  await expect(panel.getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("region", { name: /^Plan,/ }).getByRole("button", { name: "Plan", exact: true }).click();
  await expect(panel.getByRole("heading", { name: "Plan", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: /Rename|Move|Delete/ })).toHaveCount(0);
  await expect(panel.getByRole("textbox")).toHaveCount(0);

  // Viewing still works: grouping, steps, search and details.
  await groupBy(page, "Dependencies");
  const steps = page.locator("#btn-steps");
  await expect(steps).toHaveText("Collapse steps");
  await steps.click();
  await expect(steps).toHaveText("Expand steps");
  await steps.click();
  await expect(card(page, "code")).toHaveClass(/\bexpanded\b/);
  await page.getByRole("searchbox", { name: /Search skills/ }).fill("which");
  await expect.poll(() => shownSkills(page)).toEqual(["code"]);

  // Its help names no key and no gesture that edits.
  await page.getByRole("button", { name: "Help", exact: true }).click();
  const help = page.getByRole("dialog", { name: "Help" });
  await expect(help.locator("kbd")).toHaveText(["/", "Esc", "F6"]);
  await expect(help).not.toContainText("Undo");
  await expect(help).not.toContainText("Drag");
});

// A skill written in Cyrillic, with a reference written in English.
const RU = { folder: ".claude/skills", name: "proverka", description: "Проверяет изменения перед слиянием." };

test("skill-atlas-29: a skill in another script than Latin or CJK is marked as in its original on the English page, each file by its own words", async ({ page }) => {
  skill(project, RU.folder, RU.name, RU.description, "# Проверка\n\n## Шаг 1: Чтение\n\nПрочитать изменения и составить отчёт.\n");
  const dir = join(project, RU.folder, RU.name);
  mkdirSync(join(dir, "references"), { recursive: true });
  writeFileSync(join(dir, "references", "usage.md"), "# Usage\n\nHow the check is run, written in English.\n");
  writeFileSync(join(dir, "references", "notes.md"), "# Заметки\n\nКак читать отчёт о проверке.\n");
  try {
    await rescan();
    await page.goto(url);
    await groupBy(page, "Dependencies");
    await card(page, RU.name).locator(".card-main").click();
    const panel = details(page);
    await expect(panel.locator(".d-desc")).toHaveText(RU.description);
    await expect(panel.getByRole("note")).toHaveText("Shown in its original language: there is no English translation.");
    const dialog = page.getByRole("dialog");
    await panel.getByRole("button", { name: "View SKILL.md" }).click();
    await expect(dialog.locator(".file-pre")).toContainText(RU.description);
    await expect(dialog.getByRole("note")).toHaveText("Shown in its original language: there is no English translation of this file.");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    // Its English reference needs no translation on the English page.
    await panel.getByRole("button", { name: "references/usage.md" }).click();
    await expect(dialog.locator(".file-pre")).toContainText("written in English");
    await expect(dialog.getByRole("note")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    // Its Russian reference is marked, by the language the server reports for it.
    await panel.getByRole("button", { name: "references/notes.md" }).click();
    await expect(dialog.locator(".file-pre")).toContainText("Как читать");
    await expect(dialog.getByRole("note")).toHaveText("Shown in its original language: there is no English translation of this file.");
    await page.keyboard.press("Escape");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    await rescan();
  }
});

// A skill described in English whose body, with no steps, is written in Arabic.
const AR = {
  folder: ".claude/skills",
  name: "muraja",
  description: "Reviews a change before it is merged.",
  body: "راجع التغييرات في هذا الفرع قبل دمجها، واقرأ كل ملف تغير فيه، ثم اكتب تقريرا قصيرا عما وجدته من أخطاء وما يجب إصلاحه قبل الدمج.\n",
};

test("skill-atlas-29: a skill described in English and written in Arabic with no steps is marked as in its original alike in its details and its file", async ({ page }) => {
  skill(project, AR.folder, AR.name, AR.description, AR.body);
  const dir = join(project, AR.folder, AR.name);
  try {
    await rescan();
    // The scan reports the skill's language, the one its details and its file dialog both read.
    const atlas = await (await fetch(new URL("/api/atlas", url))).json() as { skills: { name: string; language?: unknown; steps: unknown[] }[] };
    const reported = atlas.skills.find((s) => s.name === AR.name)!;
    expect(reported.steps).toHaveLength(0);
    expect(typeof reported.language).toBe("string");
    await page.goto(url);
    await groupBy(page, "Dependencies");
    await card(page, AR.name).locator(".card-main").click();
    await expect(card(page, AR.name).locator(".card-desc")).toHaveText(AR.description);
    const panel = details(page);
    await expect(panel.locator(".d-desc")).toHaveText(AR.description);
    await expect(panel.getByRole("note")).toHaveText("Shown in its original language: there is no English translation.");
    const dialog = page.getByRole("dialog");
    await panel.getByRole("button", { name: "View SKILL.md" }).click();
    await expect(dialog.locator(".file-pre")).toContainText("راجع التغييرات");
    await expect(dialog.getByRole("note")).toHaveText("Shown in its original language: there is no English translation of this file.");
    await page.keyboard.press("Escape");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    await rescan();
  }
});

test("skill-atlas-13: a project's folder above the working folder is a source of its own, told apart from the working folder's", async ({ page }) => {
  const repo = join(tmp, "repo");
  const sub = join(repo, "sub");
  mkdirSync(sub, { recursive: true });
  execFileSync("git", ["init", "-q", repo]);
  skill(repo, ".agents/skills", "above", "Found above the working folder.", "Just prose.\n");
  skill(sub, ".agents/skills", "here", "Found in the working folder.", "Just prose.\n");
  const started = await serve(sub, join(tmp, "repo-state"));
  try {
    await page.goto(started.url);
    await groupBy(page, "Source");
    await expect.poll(() => groupLabels(page)).toHaveLength(2);
    const labels = (await groupLabels(page)).map((l) => l!.replace(/, \d+ skills?$/, ""));
    expect(labels[0]).not.toBe(labels[1]);
    // Each folder's group holds its own skill alone, and the skill's details name that group's folder.
    for (const id of ["above", "here"]) {
      const group = groups(page).filter({ has: page.locator(`.card[data-skill="${id}"]`) });
      await expect(group).toHaveCount(1);
      await expect(group.locator(".card[data-skill]")).toHaveCount(1);
      const title = (await group.getAttribute("aria-label"))!.replace(/, \d+ skills?$/, "");
      await card(page, id).locator(".card-main").click();
      await expect(details(page).locator("section.d-sec", { has: page.getByRole("heading", { name: "Source", exact: true }) })).toContainText(title);
    }
    // Each folder is named by its place in the repository: the root's by its scope alone, the working
    // folder's with its path from the root; in Chinese, the words in Chinese and the place kept.
    await expect(groups(page).filter({ has: page.locator('.card[data-skill="here"]') })).toHaveAttribute("aria-label", startsWith("Project (sub) · Universal"));
    await chooseLanguage(page, "EN, Language", ZH.name);
    const where = zh("Universal");
    const here = zh("{scope} ({place}) · {where}", { scope: zh("Project"), place: "sub", where });
    await expect(groups(page).filter({ has: page.locator('.card[data-skill="here"]') })).toHaveAttribute("aria-label", startsWith(here));
    await expect(groups(page).filter({ has: page.locator('.card[data-skill="above"]') })).toHaveAttribute("aria-label", startsWith(zh("{scope} · {where}", { scope: zh("Project"), where })));
  } finally {
    await stop(started.child);
    rmSync(repo, { recursive: true, force: true });
  }
});

// The page's Chinese, read from the files a reader edits: the catalog for
// the page's own text, the label files beside the tunable references.
const ZH = JSON.parse(readFileSync(join(SKILL, "assets", "locales", "zh-CN.json"), "utf8")) as { name: string; short: string; messages: Record<string, string> };
const zh = (en: string, params: Record<string, string> = {}) => {
  const text = ZH.messages[en];
  expect(text, `the zh-CN catalog has "${en}"`).toBeTruthy();
  return text!.replace(/\{(\w+)\}/g, (m, k: string) => params[k] ?? m);
};
const zhLabels = (file: string) => JSON.parse(readFileSync(join(SKILL, "references", file), "utf8"));
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const startsWith = (s: string) => new RegExp(`^${esc(s)}`);
// A card's own button, whatever language its accessible name is in.
const cardMain = (page: Page, id: string) => card(page, id).locator(".card-main");

// Choose a language from the page's language menu, its control named `control` in the page's language.
async function chooseLanguage(page: Page, control: string, language: string) {
  await page.getByRole("button", { name: control, exact: true }).click();
  await page.getByRole("menuitemradio", { name: language }).click();
}

// Ask the running server to scan again, as the page's Rescan does.
async function rescan() {
  const res = await fetch(new URL("/api/rescan", url), { method: "POST", headers: { "Content-Type": "application/json", "X-Skill-Atlas": "1" }, body: "{}" });
  expect(res.ok).toBe(true);
}
// A skill written in Japanese with no translation: kana and kanji in its words.
const JA = { folder: ".claude/skills", name: "kakunin", description: "設計を確認します。" };
// Skills whose language is read past a single character: English quoting Chinese in a step,
// Chinese using the katakana middle dot, and one declaring Traditional Chinese.
const MIXED = [
  { name: "quoting", description: "Explains how the scan reads step headings.", body: "# Quoting\n\n## Read\n\nA heading such as `步骤 2：扫描` is read as a step.\n", extra: "", marked: true },
  { name: "dianhao", description: "检查技能・清单并列出结果。", body: "# 检查\n\n## 读取\n\n读取每个技能・文件。\n", extra: "", marked: false },
  { name: "fanti", description: "檢查技能清單。", body: "# 檢查\n\n## 讀取\n\n讀取每個技能。\n", extra: "metadata:\n  language: zh-Hant\n", marked: true },
];

// A skill whose one translation is under `zh`, a tag of the page's language and script.
const ZH_ONLY = { folder: ".claude/skills", name: "survey", description: "Surveys the findings.", zh: "汇总各项调查结果。", step: "汇总" };

test.describe("in a browser of Chinese", () => {
  test.use({ locale: "zh-CN" });
  test.afterEach(async () => {
    for (const n of [JA.name, ZH_ONLY.name, ...MIXED.map((m) => m.name)]) rmSync(join(project, JA.folder, n), { recursive: true, force: true });
    await rescan();
  });

  test("skill-atlas-29: the page, tags, presets and skills shown in Chinese, untranslated, stale and edited skills marked, search in either language", async ({ page }) => {
    skill(project, JA.folder, JA.name, JA.description, "# 確認\n\n## 読む\n\n仕様のファイルを読みます。\n");
    for (const m of MIXED) skill(project, JA.folder, m.name, m.description, m.body, m.extra);
    await rescan();
    await page.goto(url);
    // The page's own text and the presets, in Chinese.
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.getByRole("button", { name: zh("Rescan"), exact: true })).toBeVisible();
    await expect(page.getByRole("radio", { name: zh("Dependencies") })).toBeVisible();
    await expect(page.getByRole("button", { name: zh("{language}, Language", { language: ZH.short }), exact: true })).toHaveText(ZH.short);
    await expect(page.getByRole("heading", { name: zh("Organize your skills into a workflow") })).toBeVisible();
    const sdlc = zhLabels("workflow-presets.zh-CN.json").presets.find((p: { id: string }) => p.id === "sdlc");
    const phases: string[] = sdlc.phases.map((p: { name: string }) => p.name);
    // A preset used in Chinese makes phases with its Chinese names, its skills placed by the source's keywords.
    await page.getByRole("button", { name: startsWith(sdlc.name) }).click();
    const verify = page.getByRole("region", { name: startsWith(phases[3]!) });
    await expect(verify.locator('.card[data-skill="lint-docs"]')).toBeVisible();
    await expect(verify.locator('.card[data-skill="review"]')).toBeVisible();
    await expect(page.locator("#save-status")).toHaveText(zh("Saved"));
    const doc = JSON.parse(readFileSync(join(state, WORKFLOWS), "utf8"));
    expect(doc.workflows[0].name).toBe(sdlc.name);
    expect(doc.workflows[0].phases.map((p: { name: string }) => p.name)).toEqual(phases);

    // Tags and their categories labelled in Chinese; the evidence quotes SKILL.md's own line.
    const tagZh = (id: string) => zhLabels("tag-rules.zh-CN.json").tags.find((tg: { id: string }) => tg.id === id).label as string;
    const humanZh = zhLabels("view-settings.zh-CN.json").categories.human.label as string;
    await groupBy(page, zh("Dependencies"));
    await page.getByRole("button", { name: zh("Filter by tags") }).click();
    await page.getByRole("checkbox", { name: startsWith(tagZh("human.approval")) }).check();
    await expect.poll(() => shownSkills(page)).toEqual(["decide"]);
    await page.getByRole("checkbox", { name: startsWith(tagZh("human.approval")) }).uncheck();
    await page.keyboard.press("Escape");

    // A translated skill: its description, steps and file in Chinese, with no mark.
    await cardMain(page, "code").click();
    await expect(card(page, "code").locator(".card-desc")).toHaveText(CODE_ZH.description);
    await expect(card(page, "code").locator(".step-title")).toHaveText(CODE_ZH.steps.map((s) => new RegExp(esc(s))));
    const panel = page.getByRole("complementary", { name: zh("Details") });
    await expect(panel.locator(".d-desc")).toHaveText(CODE_ZH.description);
    await expect(panel.getByRole("note")).toHaveCount(0);
    const tags = panel.locator("section.d-sec", { has: page.getByRole("heading", { name: zh("Tags"), exact: true }) });
    await expect(tags.getByRole("heading", { name: new RegExp(esc(humanZh)) })).toBeVisible();
    await expect(tags.locator(".ev-tag", { hasText: tagZh("human.question") }).locator(".ev li")).toContainText("Ask the user which branch to use.");
    // Frontmatter keys as they stand, each value the translation's where it gives one, else the original's.
    const frontmatter = panel.locator("section.d-sec", { has: page.getByRole("heading", { name: zh("Properties"), exact: true }) });
    await expect(frontmatter.locator("dt")).toHaveText(["license", "compatibility"]);
    await expect(frontmatter.locator("dd")).toHaveText(["MIT", CODE_ZH.compatibility]);
    await panel.getByRole("button", { name: zh("View SKILL.md") }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator(".file-pre")).toContainText(CODE_ZH.file);
    await expect(dialog.getByRole("heading")).toHaveText("/code · SKILL.zh-CN.md");
    await expect(dialog.getByRole("note")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    // An untranslated skill: shown in its original and marked, in its details and its file.
    const original = zh("Shown in its original language: there is no {language} translation.", { language: ZH.name });
    await cardMain(page, "decide").click();
    await expect(panel.locator(".d-desc")).toHaveText("Decides on a design.");
    await expect(panel.getByRole("note")).toHaveText(original);
    await panel.getByRole("button", { name: zh("View SKILL.md") }).click();
    await expect(dialog.locator(".file-pre")).toContainText("Read the spec files of the area.");
    await expect(dialog.getByRole("heading")).toHaveText("/decide · SKILL.md");
    await expect(dialog.getByRole("note")).toHaveText(zh("Shown in its original language: there is no {language} translation of this file.", { language: ZH.name }));
    await page.keyboard.press("Escape");

    // A skill written in Japanese is shown in its original and marked, though its kanji are Han script.
    await cardMain(page, JA.name).click();
    await expect(panel.locator(".d-desc")).toHaveText(JA.description);
    await expect(panel.getByRole("note")).toHaveText(original);
    await panel.getByRole("button", { name: zh("View SKILL.md") }).click();
    await expect(dialog.getByRole("note")).toHaveText(zh("Shown in its original language: there is no {language} translation of this file.", { language: ZH.name }));
    await page.keyboard.press("Escape");

    // A skill's language is the script most of its words are in, or the one it declares with its script.
    for (const m of MIXED) {
      await cardMain(page, m.name).click();
      await expect(panel.locator(".d-desc")).toHaveText(m.description);
      if (m.marked) await expect(panel.getByRole("note"), m.name).toHaveText(original);
      else await expect(panel.getByRole("note"), m.name).toHaveCount(0);
      await panel.getByRole("button", { name: zh("View SKILL.md") }).click();
      await expect(dialog.locator(".file-pre")).toContainText(m.description);
      await expect(dialog.getByRole("note"), m.name).toHaveCount(m.marked ? 1 : 0);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
    }

    // A translation behind its source: shown, and marked.
    await cardMain(page, "review").click();
    await expect(panel.locator(".d-desc")).toHaveText(REVIEW_ZH);
    await expect(panel.getByRole("note")).toHaveText(zh("The {language} translation may be behind its source.", { language: ZH.name }));

    // A translation edited apart from its source: shown, and marked as text agents do not follow.
    await cardMain(page, "notes").click();
    await expect(panel.locator(".d-desc")).toHaveText(NOTES_ZH);
    await expect(panel.getByRole("note")).toHaveText(zh("The {language} translation was edited apart from its source; agents follow SKILL.md, not this text.", { language: ZH.name }));
    await panel.getByRole("button", { name: zh("View SKILL.md") }).click();
    await expect(dialog.locator(".file-pre")).toContainText("关于团队的一些背景。");
    await expect(dialog.getByRole("note")).toHaveText(zh("The {language} translation was edited apart from its source; agents follow the original, not this text.", { language: ZH.name }));
    await page.keyboard.press("Escape");

    // The insights say where each refresh is written, what may be brought in line instead, and the command pinning it.
    await page.getByRole("button", { name: startsWith(zh("Insights")) }).click();
    const insights = page.getByRole("group", { name: zh("Insights") });
    const pinCommand = /^node <skill-dir>\/scripts\/atlas\.mjs pin --state <state> .*SKILL\.zh-CN\.md$/;
    // The words around each placeholder, as the catalog gives them.
    const words = (en: string) => new RegExp(zh(en).split(/\{\w+\}/).map((part) => esc(part.trim())).filter(Boolean).join(".*"));
    const stale = insights.locator(".ins-repair").filter({ has: page.locator("li", { hasText: words("Write {file}, brought up to date, to {target}.") }) }).first();
    await expect(stale.locator("li").first()).toContainText("<state>/translations/");
    await expect(stale.locator("p")).toHaveText(words("Then run {command}"));
    await expect(stale.locator("p code")).toHaveText(pinCommand);
    const edited = insights.locator(".ins-repair").filter({ has: page.locator("p", { hasText: words("Carry each edit across, then run {command}") }) }).first();
    await expect(edited.locator("p code")).toHaveText(pinCommand);
    await page.keyboard.press("Escape");

    // A search finds the skill by its Chinese words and by its original ones.
    const search = page.getByRole("searchbox", { name: zh("Search skills by name, description or step") });
    await search.fill("实现");
    await expect.poll(() => shownSkills(page)).toEqual(["code"]);
    await search.fill("Implements");
    await expect.poll(() => shownSkills(page)).toEqual(["code"]);
    // And by a step's text, in Chinese and in the original.
    await search.fill("哪个");
    await expect.poll(() => shownSkills(page)).toEqual(["code"]);
    await search.fill("which");
    await expect.poll(() => shownSkills(page)).toEqual(["code"]);
  });

  test("skill-atlas-29: an annotation written from another text of its skill is reported in Chinese and not applied", async ({ page }) => {
    const file = join(state, "annotations.json");
    writeFileSync(file, JSON.stringify({ ...ANNOTATIONS, skills: { ...ANNOTATIONS.skills, lone: { source: { sha256: "0".repeat(64) }, summary: "Written for another text." } } }));
    try {
      await rescan();
      await page.goto(url);
      await groupBy(page, zh("Dependencies"));
      await expect(card(page, "lone").locator(".card-desc")).toHaveText("Stands alone.");
      await page.getByRole("button", { name: startsWith(zh("Insights")) }).click();
      const insights = page.getByRole("group", { name: zh("Insights") });
      await expect(insights.getByRole("heading", { name: startsWith(zh("Annotations written from another text")) })).toBeVisible();
      // The insight names the entry to update; the skill's issue line says what is wrong.
      const message = zh("An annotation was written from another text of this skill; read the skill again and update or remove its entry in annotations.json.");
      await insights.getByRole("button", { name: startsWith("/lone") }).filter({ hasText: message }).click();
      await expect(card(page, "lone")).toHaveClass(/\bselected\b/);
      const issue = zh("An annotation was written from another text of this skill; read the skill again and update or remove it.");
      await expect(page.getByRole("complementary", { name: zh("Details") }).getByRole("list", { name: zh("Issues") }).getByRole("listitem").filter({ hasText: issue })).toHaveCount(1);
    } finally {
      writeFileSync(file, JSON.stringify(ANNOTATIONS));
      await rescan();
    }
  });

  test("skill-atlas-29: an atlas whose scan reported no languages marks no skill and no file as in its original", async ({ page }) => {
    // As from an older scan: no skill's language and no file's.
    await page.route((u) => u.pathname === "/api/atlas", async (route) => {
      const res = await route.fetch();
      const atlas = await res.json();
      for (const s of atlas.skills) delete s.language;
      await route.fulfill({ response: res, json: atlas });
    });
    await page.route((u) => u.pathname === "/api/file", async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      delete body.sourceLanguage;
      await route.fulfill({ response: res, json: body });
    });
    await page.goto(url);
    await groupBy(page, zh("Dependencies"));
    await cardMain(page, "decide").click();
    const panel = page.getByRole("complementary", { name: zh("Details") });
    await expect(panel.locator(".d-desc")).toHaveText("Decides on a design.");
    await expect(panel.getByRole("note")).toHaveCount(0);
    await panel.getByRole("button", { name: zh("View SKILL.md") }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator(".file-pre")).toContainText("Read the spec files of the area.");
    await expect(dialog.getByRole("note")).toHaveCount(0);
  });

  test("skill-atlas-29: a skill translated only under zh is shown in Chinese on the zh-CN page and found by its Chinese words", async ({ page }) => {
    skill(project, ZH_ONLY.folder, ZH_ONLY.name, ZH_ONLY.description, "# Survey\n\n## Step 1: Gather\n\nGather the findings.\n");
    const dir = join(project, ZH_ONLY.folder, ZH_ONLY.name);
    writeFileSync(join(dir, "SKILL.zh.md"), `---\nname: ${ZH_ONLY.name}\ndescription: ${ZH_ONLY.zh}\n---\n<!-- skill-atlas:source sha256=${sha256(join(dir, "SKILL.md"))} -->\n# 调查\n\n## 步骤 1：${ZH_ONLY.step}\n\n${ZH_ONLY.zh}\n`);
    await rescan();
    await page.goto(url);
    await groupBy(page, zh("Dependencies"));
    await cardMain(page, ZH_ONLY.name).click();
    await expect(card(page, ZH_ONLY.name).locator(".card-desc")).toHaveText(ZH_ONLY.zh);
    await expect(card(page, ZH_ONLY.name).locator(".step-title")).toHaveText([new RegExp(esc(ZH_ONLY.step))]);
    const panel = page.getByRole("complementary", { name: zh("Details") });
    await expect(panel.locator(".d-desc")).toHaveText(ZH_ONLY.zh);
    await expect(panel.getByRole("note")).toHaveCount(0);
    const search = page.getByRole("searchbox", { name: zh("Search skills by name, description or step") });
    await search.fill("调查结果");
    await expect.poll(() => shownSkills(page)).toEqual([ZH_ONLY.name]);
  });

  // A translation of `survey` into `file` giving `words`, recording `source` as its source's digest.
  const surveyZh = (file: string, source: string, words: string) =>
    writeFileSync(file, `---\nname: ${ZH_ONLY.name}\ndescription: ${words}\n---\n<!-- skill-atlas:source sha256=${source} -->\n# 调查\n\n## 步骤 1：${ZH_ONLY.step}\n\n${words}\n`);
  // After a rescan, on the zh-CN page: the card and the details show `words` with `notes`, and the
  // file opened from them is `file`, holding `words`, with `fileNotes`.
  async function expectSurveyShows(page: Page, words: string, file: string, notes: string[], fileNotes: string[]) {
    await rescan();
    await page.goto(url);
    await groupBy(page, zh("Dependencies"));
    await cardMain(page, ZH_ONLY.name).click();
    await expect(card(page, ZH_ONLY.name).locator(".card-desc")).toHaveText(words);
    const panel = page.getByRole("complementary", { name: zh("Details") });
    await expect(panel.locator(".d-desc")).toHaveText(words);
    await expect(panel.getByRole("note")).toHaveText(notes);
    await panel.getByRole("button", { name: zh("View SKILL.md") }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading")).toHaveText(`/${ZH_ONLY.name} · ${file}`);
    await expect(dialog.locator(".file-pre")).toContainText(words);
    await expect(dialog.getByRole("note")).toHaveText(fileNotes);
  }

  test("skill-atlas-29: of a skill folder's zh behind its source and the state folder's current zh-Hans, the zh-CN page reads the first tag, zh, and marks it behind", async ({ page }) => {
    skill(project, ZH_ONLY.folder, ZH_ONLY.name, ZH_ONLY.description, "# Survey\n\n## Step 1: Gather\n\nGather the findings.\n");
    const dir = join(project, ZH_ONLY.folder, ZH_ONLY.name);
    const theirs = join(state, "translations", ZH_ONLY.name);
    surveyZh(join(dir, "SKILL.zh.md"), "0".repeat(64), ZH_ONLY.zh);
    mkdirSync(theirs, { recursive: true });
    surveyZh(join(theirs, "SKILL.zh-Hans.md"), sha256(join(dir, "SKILL.md")), "从状态文件夹汇总结果。");
    const behind = zh("The {language} translation may be behind its source.", { language: ZH.name });
    try {
      // The tag is chosen before the folder: a current translation under a later tag is passed over.
      await expectSurveyShows(page, ZH_ONLY.zh, "SKILL.zh.md", [behind], [behind]);
    } finally {
      rmSync(theirs, { recursive: true, force: true });
    }
  });

  test("skill-atlas-29: of a skill folder's zh behind its source beside a current zh-Hans, and the state folder's current zh, the zh-CN page and its file read the state folder's zh", async ({ page }) => {
    skill(project, ZH_ONLY.folder, ZH_ONLY.name, ZH_ONLY.description, "# Survey\n\n## Step 1: Gather\n\nGather the findings.\n");
    const dir = join(project, ZH_ONLY.folder, ZH_ONLY.name);
    const theirs = join(state, "translations", ZH_ONLY.name);
    const source = sha256(join(dir, "SKILL.md"));
    const refreshed = "从状态文件夹汇总结果。";
    surveyZh(join(dir, "SKILL.zh.md"), "0".repeat(64), ZH_ONLY.zh);
    surveyZh(join(dir, "SKILL.zh-Hans.md"), source, "以简体汇总各项结果。");
    mkdirSync(theirs, { recursive: true });
    surveyZh(join(theirs, "SKILL.zh.md"), source, refreshed);
    try {
      // Under zh, the first tag, the state folder's pinned translation stands in for the skill's behind one.
      await expectSurveyShows(page, refreshed, "SKILL.zh.md", [], []);
    } finally {
      rmSync(theirs, { recursive: true, force: true });
    }
  });

  test("skill-atlas-29: annotation words under zh-CN over a skill's zh translation are read as one entry, the file's words where the annotation gives none", async ({ page }) => {
    skill(project, ZH_ONLY.folder, ZH_ONLY.name, ZH_ONLY.description, "# Survey\n\n## Step 1: Gather\n\nGather the findings.\n");
    const dir = join(project, ZH_ONLY.folder, ZH_ONLY.name);
    surveyZh(join(dir, "SKILL.zh.md"), sha256(join(dir, "SKILL.md")), ZH_ONLY.zh);
    const file = join(state, "annotations.json");
    const step = "收集各项发现";
    writeFileSync(file, JSON.stringify({ ...ANNOTATIONS, skills: { ...ANNOTATIONS.skills, [ZH_ONLY.name]: { translations: { "zh-CN": { steps: [{ title: step }] } } } } }));
    try {
      await rescan();
      await page.goto(url);
      await groupBy(page, zh("Dependencies"));
      await cardMain(page, ZH_ONLY.name).click();
      // The description from the zh file, the step's title from the annotation.
      await expect(card(page, ZH_ONLY.name).locator(".card-desc")).toHaveText(ZH_ONLY.zh);
      await expect(card(page, ZH_ONLY.name).locator(".step-title")).toHaveText([new RegExp(esc(step))]);
      const panel = page.getByRole("complementary", { name: zh("Details") });
      await expect(panel.locator(".d-desc")).toHaveText(ZH_ONLY.zh);
      await expect(panel.getByRole("note")).toHaveCount(0);
    } finally {
      writeFileSync(file, JSON.stringify(ANNOTATIONS));
    }
  });
});

test("skill-atlas-30, skill-atlas-38: a language chosen on the page applies at once, keeping the open skill, the selection and the filter, and stands after a reload", async ({ page }) => {
  await page.goto(url);
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
  await groupBy(page, "Dependencies");
  await cardButton(page, "code").click();
  await expect(card(page, "code").locator(".step-title")).toHaveText(["Plan", "Write", "Review"]);
  const search = page.getByRole("searchbox", { name: /Search skills/ });
  await search.fill("Implements");
  await expect.poll(() => shownSkills(page)).toEqual(["code"]);

  // The language control: a menu of every offered language in its own name, the shown one checked,
  // worked by the keyboard, Escape and a click elsewhere closing it.
  // Its name begins with the short name it shows, so it can be spoken as seen.
  const control = page.getByRole("button", { name: "EN, Language", exact: true });
  await expect(control).toHaveText("EN");
  await expect(control).toHaveAttribute("title", "Language");
  await control.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitemradio")).toHaveText(["English", ZH.name]);
  await expect(menu.getByRole("menuitemradio", { name: "English" })).toHaveAttribute("aria-checked", "true");
  await expect(menu.getByRole("menuitemradio", { name: ZH.name })).toHaveAttribute("aria-checked", "false");
  await expect(menu.getByRole("menuitemradio", { name: "English" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(control).toBeFocused();
  await control.click();
  await page.locator("#board").click({ position: { x: 5, y: 5 } });
  await expect(menu).toHaveCount(0);
  await control.click();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitemradio", { name: ZH.name })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.getByRole("button", { name: zh("{language}, Language", { language: ZH.short }), exact: true })).toHaveText(ZH.short);
  await expect(page.getByRole("button", { name: zh("Rescan"), exact: true })).toBeVisible();
  // What was open, selected and filtered stands, now in Chinese.
  await expect(card(page, "code").locator(".step-title")).toHaveText(CODE_ZH.steps.map((s) => new RegExp(esc(s))));
  await expect(card(page, "code")).toHaveClass(/\bselected\b/);
  const panel = page.getByRole("complementary", { name: zh("Details") });
  await expect(panel.getByRole("heading", { name: "/code" })).toBeVisible();
  await expect(panel.locator(".d-desc")).toHaveText(CODE_ZH.description);
  await expect(page.getByRole("searchbox", { name: zh("Search skills by name, description or step") })).toHaveValue("Implements");
  await expect.poll(() => shownSkills(page)).toEqual(["code"]);
  await expect(page.getByRole("radio", { name: zh("Dependencies") })).toHaveAttribute("aria-checked", "true");

  // The choice is kept in the browser.
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await page.getByRole("button", { name: zh("{language}, Language", { language: ZH.short }), exact: true }).click();
  await expect(page.getByRole("menuitemradio", { name: ZH.name })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("button", { name: zh("Rescan"), exact: true })).toBeVisible();
});
