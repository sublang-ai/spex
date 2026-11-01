// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The registry a project's packages come from, apart from its Space
// (playbook-library-120, space-116, DR-168, DR-172): the "Packages"
// heading's "Registry: <registry>" chooser takes a Space's origin through
// "Other…", the account there signs in and out with the Space untouched,
// and New playbook's one Org field suggests that account's orgs; the
// Space surface's sign-in card lists the directory's Spaces.
import {
  HOST_LOGIN,
  test,
  expect,
  open,
  nav,
  chooseRegistry,
  chosenEntry,
  orgSuggestions,
  packagesSection,
  projectTab,
  registryAddress,
  registryChooser,
  registryEntries,
  signInCore,
  refreshProjectKey,
  spaceChooser,
  spaceAddress,
  chosenSpace,
  chooseSpace,
} from "../src/harness";

test.use({ appOptions: { project: true, host: { registry: true }, independentRegistry: true } });

test("playbook-library-120/space-116: independent same-origin registry account, org suggestions and Space directory", async ({ page, app }) => {
  const host = app.host!;
  host.script.deviceInterval = 0;
  app.registry!.script.setOrgs(host.url, [{ name: "acme", path: "acme", role: "Owner" }, { name: "other", path: "unrelated", role: "Owner" }]);
  await signInCore(app);
  const key = (await refreshProjectKey(app))!;
  await open(page, app);
  // The "Packages" heading carries its registry as "Registry:
  // <registry>", a chooser of the directory's registries by display name
  // whose last entry "Other…" reveals the field for an address, and the
  // account there, "Sign in" while none (playbook-library-119).
  await projectTab(page, "Packages");
  const packages = packagesSection(page, "project");
  const chooser = registryChooser(packages);
  await expect(chooser).toBeVisible();
  await expect(chooser).toContainText("Registry:");
  await expect.poll(async () => (await registryEntries(packages)).at(-1)).toBe("Other…");
  await expect(registryAddress(packages)).toBeHidden();
  const signIn = packages.getByTestId("registry-signin");
  await expect(signIn).toHaveText("Sign in");
  await expect(signIn).toHaveAttribute("title", "For publishing and private packages");
  // A registry the directory lists, chosen by its display name, is
  // written as the registry of the project's spex.yaml; the public
  // registry typed through "Other…" then takes its place.
  const initial = (await app.core.command("environment.get", { repository: key })).registry?.origin;
  expect(initial).not.toBe(host.url);
  // The public registry here answers as the stand-in, so two entries
  // read alike: the directory's is picked by its own origin.
  expect(await registryEntries(packages)).toContain("Stand-in Git host");
  const listed = packages.getByTestId(`registry-choice-${host.url}`);
  await expect(listed).toHaveText("Stand-in Git host");
  await expect(listed).toHaveAttribute("aria-checked", "false");
  await listed.click();
  await expect.poll(async () => (await app.core.command("environment.get", { repository: key })).registry?.origin).toBe(host.url);
  await expect.poll(() => chosenEntry(chooser)).toContain("Stand-in Git host");
  await chooseRegistry(packages, "Other…", initial);
  await expect.poll(async () => (await app.core.command("environment.get", { repository: key })).registry?.origin).toBe(initial);
  // The Space's origin chosen through "Other…" is written as the
  // registry of the project's spex.yaml, and the chooser reads its
  // display name.
  await chooseRegistry(packages, "Other…", host.url);
  await expect.poll(async () => (await app.core.command("environment.get", { repository: key })).registry?.origin).toBe(host.url);
  await expect.poll(() => chosenEntry(chooser)).toContain("Stand-in Git host");
  // Sign-in there runs in place, cancellable, and ends in the account's
  // login beside Sign out.
  await signIn.click();
  await expect(packages.getByTestId("registry-cancel")).toHaveText("Cancel");
  const state = await app.core.command("registry.get", { origin: host.url });
  expect(state.signIn.phase).toBe("running");
  if (state.signIn.phase !== "running" || state.signIn.flow !== "device") throw new Error("Expected a device registry sign-in");
  host.script.approveDevice(state.signIn.userCode);
  const signOut = packages.getByTestId("registry-signout");
  await expect(signOut).toHaveText("Sign out");
  await expect(packages.getByTestId("registry-login")).toHaveText(`@${HOST_LOGIN}`);
  // New playbook's one Org field on the Playbooks tab reads "Loading…"
  // while that account's orgs are read, a failed read says so with
  // Retry, and then suggests the orgs that account may publish to; a
  // typed org outside them wears "not yours to publish to", the typed
  // name standing as typed (playbook-library-121).
  app.registry!.script.delayOrgs(1_500);
  app.registry!.script.unavailable(1);
  await projectTab(page, "Playbooks");
  const form = page.getByTestId("new-playbook");
  const org = page.getByTestId("new-playbook-org");
  const note = page.getByTestId("new-playbook-org-note");
  const retry = page.getByTestId("new-playbook-orgs-retry");
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(note).toHaveText("Loading…");
  await expect.poll(() => orgSuggestions(page)).toEqual(["acme", "other"]);
  app.registry!.script.delayOrgs(0);
  await org.fill("other");
  await expect(form).not.toContainText("not yours to publish to");
  await org.fill("elsewhere");
  await expect(form).toContainText("not yours to publish to");
  await expect(org).toHaveValue("elsewhere");
  await org.fill("other");
  await expect(form).not.toContainText("not yours to publish to");
  await expect(org).toHaveValue("other");
  // Signing out of the registry leaves the Space signed in.
  await projectTab(page, "Packages");
  await signOut.click();
  await expect(signIn).toHaveText("Sign in");
  expect((await app.core.command("space.get", {})).instances.find((entry) => entry.origin === host.url)?.signedIn).toBe(true);
  await nav(page, "Space").click();
  await page.getByTestId("space-add-space").click();
  // The card's chooser lists the directory's Spaces by display name,
  // the stand-in preselected; "Other Space…" reveals the address field
  // (space-115).
  const card = page.getByTestId("space-add-card");
  await expect(spaceChooser(card)).toBeVisible();
  await expect.poll(() => chosenSpace(card)).toContain("Stand-in Git host");
  await expect(spaceAddress(card)).toBeHidden();
  await chooseSpace(card, "Other Space…");
  await expect(spaceAddress(card)).toBeVisible();
  await spaceAddress(card).fill("https://custom.example");
  await expect(spaceAddress(card)).toHaveValue("https://custom.example");
});
