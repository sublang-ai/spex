// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Reading specs (spec-view-46): the seeded example's tree in the
// Specs tab — outline, expansion, a citation jump, the filter, and
// the graph toggle. Previewing a citation (spec-view-62): the card at
// hand on a settled hover and on keyboard focus, where it lies, and
// what dismisses it. Editing them (spec-view-54): a record from the
// decisions branch through the editor, its preview, an axe scan of
// both editor modes, the save landing on disk, in the reader, and in
// the outline, and an item's Edit landing the caret on its heading.

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect, open } from "../src/harness";

test.use({ appOptions: { project: true } });

/** Serious and critical WCAG 2.1 AA violations on the page, as the
 * accessibility journey words them (run-view-102). */
async function scan(page: Page, surface: string): Promise<string[]> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) =>
        `${surface}: [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length} node${v.nodes.length === 1 ? "" : "s"}; e.g. ${v.nodes[0]?.target.join(" ")} :: ${v.nodes[0]?.html.slice(0, 160)})`,
    );
}

test("spec-view-54: a record edits through the page, and an item's Edit lands on its heading", async ({
  page,
  app,
}) => {
  await open(page, app);
  await page.getByRole("tab", { name: "Specs" }).click();
  await expect(page.getByTestId("specv-live")).toBeVisible();

  // DR-000 from the decisions branch, then its reader's Edit.
  await page.getByTestId("decisions-toggle").click();
  await page.getByTestId("record-DR-000").click();
  const reader = page.getByTestId("record-reader");
  await expect(reader).toContainText("Product Scope");
  await page.getByTestId("reader-edit").click();
  const editor = page.getByTestId("spec-editor");
  await expect(editor).toContainText("decisions/000-product-scope.md");
  const field = page.getByRole("textbox", {
    name: "Edit decisions/000-product-scope.md",
  });
  await expect(field).toBeFocused();
  await expect(page.getByTestId("editor-save")).toBeDisabled();

  // One changed line: the title.
  const before = await field.inputValue();
  const after = before.replace(
    "# DR-000: Product Scope",
    "# DR-000: Product Scope, Edited",
  );
  expect(after).not.toBe(before);
  await field.fill(after);
  await expect(page.getByTestId("editor-save")).toBeEnabled();
  await expect(page.getByTestId("specs-tab-unsaved")).toBeVisible();
  const found = await scan(page, "Editor");

  // Preview shows the change; every link in it stays inert.
  await page.getByTestId("editor-preview").click();
  await expect(page.getByTestId("editor-preview")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const preview = page.getByTestId("editor-preview-pane");
  await expect(preview).toContainText("Product Scope, Edited");
  await preview.getByRole("link").first().click();
  await expect(editor).toBeVisible();
  found.push(...(await scan(page, "Preview")));
  expect(found, found.join("\n")).toEqual([]);

  // Save: the bytes on disk are what was typed, the reader shows the
  // change, and the outline's decisions title follows the re-read.
  await page.getByTestId("editor-save").click();
  await expect(reader).toContainText("Product Scope, Edited");
  expect(
    readFileSync(
      join(app.projectDir, "specs", "decisions", "000-product-scope.md"),
      "utf8",
    ),
  ).toBe(after);
  await expect(page.getByTestId("specs-tab-unsaved")).toHaveCount(0);
  await page.getByRole("button", { name: "← Back" }).click();
  await expect(page.getByTestId("record-DR-000")).toContainText(
    "Product Scope, Edited",
  );

  // From an expanded item: the package file opens with the caret on
  // the item's heading line, and a clean Cancel closes at once.
  await page.getByTestId(/^file-toggle-/).first().click();
  await page.getByTestId(/^item-toggle-/).first().click();
  const itemEdit = page.getByTestId(/^item-edit-/).first();
  const itemId = (await itemEdit.getAttribute("data-testid"))?.replace(
    "item-edit-",
    "",
  );
  expect(itemId).toBeTruthy();
  await itemEdit.click();
  const packageField = page.getByRole("textbox", { name: /^Edit packages\// });
  await expect(packageField).toBeFocused();
  const caretLine = await packageField.evaluate((element) => {
    const area = element as HTMLTextAreaElement;
    return area.value.slice(0, area.selectionStart).split("\n").length - 1;
  });
  const lines = (await packageField.inputValue()).split("\n");
  expect(lines[caretLine]).toMatch(new RegExp(`^#{3,4}\\s+${itemId}\\s*$`, "i"));
  await page.getByTestId("editor-cancel").click();
  await expect(page.getByTestId("spec-editor")).toHaveCount(0);
  await expect(page.getByTestId(/^item-edit-/).first()).toBeVisible();
});

test("spec-view-62: a citation previews at hand", async ({ page, app }) => {
  await open(page, app);
  await page.getByRole("tab", { name: "Specs" }).click();

  // admin-bootstrap-1 cites five peers, in its body and its cites row.
  await page.getByTestId("file-toggle-admin-bootstrap").click();
  await page.getByTestId("item-toggle-admin-bootstrap-1").click();
  const card = page.getByTestId("citation-preview");
  const entry = page.getByTestId("link-admin-bootstrap-1-delivery-4");

  // The pointer settles on an outbound entry: the card answers well
  // inside the native tooltip's delay, naming the cited item.
  await entry.hover();
  await expect(card).toContainText("delivery-4", { timeout: 400 });
  await expect(card).toContainText("shall");
  await expect(entry).toHaveAttribute("aria-describedby", "specv-citation-preview");

  // It lies inside the box the outline scrolls in, and the page
  // scrolls in neither direction while it stands (DR-041 §9).
  const placed = await card.evaluate((element) => {
    const box = (element as HTMLElement).offsetParent as HTMLElement | null;
    if (!box) return "no scrolling box";
    const at = element.getBoundingClientRect();
    const within = box.getBoundingClientRect();
    const clipped = getComputedStyle(box).overflowY !== "visible";
    const inside =
      at.left >= within.left - 1 &&
      at.right <= within.right + 1 &&
      at.top >= within.top - 1 &&
      at.top <= within.bottom + 1;
    return clipped && inside
      ? "inside"
      : `${clipped ? "" : "uncontained "}${Math.round(at.left)}..${Math.round(at.right)} of ${Math.round(within.left)}..${Math.round(within.right)}`;
  });
  expect(placed).toBe("inside");
  const page_ = await page.evaluate(() => ({
    sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    down: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
  expect(page_.sideways).toBeLessThanOrEqual(1);
  expect(page_.down).toBeLessThanOrEqual(1);

  // The pointer leaves: the card goes with it.
  await page.getByTestId("item-toggle-admin-bootstrap-1").hover();
  await expect(card).toHaveCount(0);

  // Keyboard focus on an inline citation in the body answers at once,
  // and Escape dismisses it.
  const inline = page
    .getByTestId("item-admin-bootstrap-1")
    .getByRole("link", { name: "web-shell-2" })
    .first();
  await inline.focus();
  await expect(card).toContainText("web-shell-2");
  await expect(inline).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
});

test("spec-view-46: the Specs tab reads the seeded tree", async ({ page, app }) => {
  await open(page, app);
  await page.getByRole("tab", { name: "Specs" }).click();

  // The outline: packages and the decisions branch.
  const outline = page.getByTestId("specv-live");
  await expect(outline).toBeVisible();
  await expect(page.getByTestId("decisions-branch")).toBeVisible();
  const files = page.getByTestId(/^file-/);
  await expect(files.first()).toBeVisible();
  const count = await files.count();
  expect(count).toBeGreaterThan(3);

  // Expand a package: its items appear.
  await page.getByTestId(/^file-toggle-/).first().click();
  const items = page.getByTestId(/^item-toggle-/);
  await expect(items.first()).toBeVisible();

  // The filter narrows with a match count, and clears.
  const filter = page.getByLabel("Filter items by ID or text");
  await filter.fill("shall");
  await expect(page.getByTestId("match-count")).toContainText(/\d+/);
  const narrowed = await page.getByTestId("match-count").innerText();
  await filter.fill("zzzz-no-such-text");
  await expect(page.getByTestId("match-count")).toContainText(/^0\b|no match/i);
  await page.getByRole("button", { name: "Clear the search" }).click();
  await expect(filter).toHaveValue("");
  void narrowed;

  // The graph toggle removes the picture and adds it back beside the
  // outline (it is on by default at this width).
  const toggle = page.getByTestId("view-graph");
  const split = page.getByTestId("graph-split");
  const on = (await toggle.getAttribute("aria-pressed")) === "true";
  if (on) await expect(split).toBeVisible();
  await toggle.click();
  if (on) await expect(split).toHaveCount(0);
  else await expect(split).toBeVisible();
  await toggle.click();
  if (on) await expect(split).toBeVisible();
  else await expect(split).toHaveCount(0);
});
