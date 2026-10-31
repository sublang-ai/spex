// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>
import { test, expect, open, nav, signInCore, refreshProjectKey, spaceChooser, spaceAddress, chosenSpace, chooseSpace } from "../src/harness";

test.use({ appOptions: { project: true, host: { registry: true }, independentRegistry: true } });

test("playbook-library-120/space-116: independent same-origin registry account, namespace choices and Space directory", async ({ page, app }) => {
  const host = app.host!;
  const registry = app.registry!;
  host.script.deviceInterval = 0;
  registry.script.setOrgs(host.url, [{ name: "acme", path: "acme", role: "Owner" }, { name: "other", path: "unrelated", role: "Owner" }]);
  await signInCore(app);
  const key = (await refreshProjectKey(app))!;
  await open(page, app);
  await nav(page, "Playbooks").click();
  await page.getByTestId("side-project").click();
  const card = page.getByTestId("registry-account");
  await expect(card.getByLabel("Registry URL")).toHaveValue("https://spex.sublang.ai");
  await expect(card.getByRole("button", { name: "Sign in to registry", exact: true })).toBeVisible();
  await card.getByLabel("Registry URL").fill(host.url);
  await card.getByRole("button", { name: "Use registry", exact: true }).click();
  await expect(card.getByLabel("Registry URL")).toHaveValue(host.url);
  await expect.poll(async () => (await app.core.command("environment.get", { repository: key })).registry?.origin).toBe(host.url);
  await card.getByRole("button", { name: "Sign in to registry", exact: true }).click();
  await expect(card.getByRole("link", { name: "Continue registry sign-in" })).toBeVisible();
  const state = await app.core.command("registry.get", { origin: host.url });
  expect(state.signIn.phase).toBe("running");
  if (state.signIn.phase !== "running" || state.signIn.flow !== "device") throw new Error("Expected a device registry sign-in");
  host.script.approveDevice(state.signIn.userCode);
  await expect(card.getByRole("button", { name: "Sign out of registry", exact: true })).toBeVisible();
  const orgs = page.getByLabel("Registry namespaces");
  await expect(orgs.locator("option")).toHaveText(["Choose namespace", "acme", "other"]);
  await orgs.selectOption("other");
  await expect(page.getByTestId("new-playbook-org")).toHaveValue("other");
  await card.getByRole("button", { name: "Sign out of registry", exact: true }).click();
  await expect(card.getByRole("button", { name: "Sign in to registry", exact: true })).toBeVisible();
  expect((await app.core.command("space.get", {})).instances.find((entry) => entry.origin === host.url)?.signedIn).toBe(true);
  await nav(page, "Space").click();
  await page.getByTestId("space-add-space").click();
  // The card's chooser lists the directory's Spaces by display name,
  // the stand-in preselected; "Other Space…" reveals the address field
  // (space-115).
  const signIn = page.getByTestId("space-add-card");
  await expect(spaceChooser(signIn)).toBeVisible();
  await expect.poll(() => chosenSpace(signIn)).toContain("Stand-in Git host");
  await expect(spaceAddress(signIn)).toBeHidden();
  await chooseSpace(signIn, "Other Space…");
  await expect(spaceAddress(signIn)).toBeVisible();
  await spaceAddress(signIn).fill("https://custom.example");
  await expect(spaceAddress(signIn)).toHaveValue("https://custom.example");
});
