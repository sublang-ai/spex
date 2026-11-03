// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The registry a project's packages come from, apart from its Space
// (playbook-library-120, space-116, DR-168, DR-172, DR-173): the
// "Packages" heading's "Registry: <registry>" chooser offers the public
// registry and the one spex.yaml names, and takes a Space's origin
// through "Other…", the account there signs in and out with the Space untouched,
// and New playbook's one Org field suggests that account's orgs; the
// Space surface's sign-in card lists the directory's Spaces.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
  // A local name is not proof that the registry account owns it.
  await projectTab(page, "Playbooks");
  await expect(page.getByTestId("new-playbook-org-note")).toHaveText("Publishing rights not checked");
  await expect(page.getByTestId("new-playbook-org-guidance")).toContainText("To publish, use an org you can claim at this registry.");
  const unsignedRegistry = (await app.core.command("environment.get", { repository: key })).registry!.origin;
  await expect(page.getByRole("link", { name: "Claim an org" })).toHaveAttribute("href", `${unsignedRegistry}/account/orgs?scope=registry`);
  // The "Packages" heading carries its registry as "Registry:
  // <registry>", a chooser offering the public registry by its display
  // name, the registry the project's spex.yaml names where that is
  // another, and a last entry "Other…" revealing the field for an
  // address, and the account there, "Sign in" while none
  // (playbook-library-119).
  await projectTab(page, "Packages");
  const packages = packagesSection(page, "project");
  const chooser = registryChooser(packages);
  await expect(chooser).toBeVisible();
  await expect(chooser).toContainText("Registry:");
  const signIn = packages.getByTestId("registry-signin");
  await expect(signIn).toHaveText("Sign in");
  await expect(signIn).toHaveAttribute("title", "For publishing and private packages");
  // The project's spex.yaml names the public registry, which answers
  // here as the stand-in: it stands alone, checked, before "Other…", and
  // no Space of the directory is offered as a registry.
  const initial = (await app.core.command("environment.get", { repository: key })).registry?.origin;
  expect(initial).not.toBe(host.url);
  await expect.poll(() => registryEntries(packages)).toEqual(["Stand-in Git host", "Other…"]);
  const publicEntry = packages.getByTestId(`registry-choice-${initial}`);
  await expect(publicEntry).toHaveAttribute("aria-checked", "true");
  await expect(registryAddress(packages)).toBeHidden();
  // The Space's origin chosen through "Other…" is written as the
  // registry of the project's spex.yaml; the chooser reads its display
  // name and lists it, checked, after the public registry — the two read
  // alike here, so each is picked by its own origin.
  await chooseRegistry(packages, "Other…", host.url);
  await expect.poll(async () => (await app.core.command("environment.get", { repository: key })).registry?.origin).toBe(host.url);
  await expect.poll(() => chosenEntry(chooser)).toContain("Stand-in Git host");
  await expect.poll(() => registryEntries(packages)).toEqual(["Stand-in Git host", "Stand-in Git host", "Other…"]);
  const listed = packages.getByTestId(`registry-choice-${host.url}`);
  await expect(listed).toHaveAttribute("aria-checked", "true");
  await expect(publicEntry).toHaveAttribute("aria-checked", "false");
  // The public registry picked takes its place again, and the Space's
  // origin, named by the spex.yaml no longer, leaves the list.
  await publicEntry.click();
  await expect.poll(async () => (await app.core.command("environment.get", { repository: key })).registry?.origin).toBe(initial);
  await expect.poll(() => registryEntries(packages)).toEqual(["Stand-in Git host", "Other…"]);
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
  await expect(page.getByRole("link", { name: "Claim an org" })).toHaveAttribute("href", `${host.url}/account/orgs?scope=registry`);
  await retry.click();
  await expect(note).toHaveText("Loading…");
  await expect.poll(() => orgSuggestions(page)).toEqual(["acme", "other"]);
  app.registry!.script.delayOrgs(0);
  await org.fill("other");
  await expect(form).not.toContainText("not yours to publish to");
  await expect(page.getByTestId("new-playbook-org-guidance")).toBeHidden();
  await org.fill("elsewhere");
  await expect(form).toContainText("not yours to publish to");
  await expect(page.getByRole("link", { name: "Claim an org" })).toHaveAttribute("href", `${host.url}/account/orgs?scope=registry`);
  await expect(org).toHaveValue("elsewhere");
  await org.fill("other");
  await expect(form).not.toContainText("not yours to publish to");
  await expect(org).toHaveValue("other");
  // A successful empty read still explains where to claim a name.
  app.registry!.script.setOrgs(host.url, []);
  await projectTab(page, "Packages");
  await projectTab(page, "Playbooks");
  await expect(note).toHaveText("No orgs to publish to");
  await expect(page.getByRole("link", { name: "Claim an org" })).toHaveAttribute("href", `${host.url}/account/orgs?scope=registry`);
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


test.describe("a legacy project with distinct registry and Space identities", () => {
  test.use({ appOptions: {
    project: true,
    independentRegistry: true,
    host: { registry: true, displayName: "Public package registry", second: { displayName: "spex.sublang.xyz" } },
  } });

  test("package views never inherit the Space account, address or group", async ({ page, app }) => {
    const registryOrigin = "https://spex.sublang.ai";
    const registryHost = app.host!;
    const spaceHost = app.hosts[1]!;
    registryHost.script.deviceInterval = 0;
    spaceHost.script.deviceInterval = 0;
    app.registry!.script.setOrgs(registryHost.url, [{ name: "publisher", path: "publisher", role: "Owner" }]);
    await signInCore(app, spaceHost);
    const key = (await refreshProjectKey(app))!;
    // This is the old project shape that incorrectly selected the Space
    // as its package registry. Reading it must not rewrite the manifest.
    const legacy = `format: 1\nspace: ${spaceHost.url}\npackages: {}\n`;
    writeFileSync(join(app.projectDir, "spex.yaml"), legacy);
    await open(page, app);
    await projectTab(page, "Playbooks");
    await expect(page.getByTestId("new-playbook-org")).toHaveValue("");
    await expect(page.getByRole("link", { name: "Claim an org" })).toHaveAttribute("href", `${registryOrigin}/account/orgs?scope=registry`);
    await expect(page.getByTestId("new-playbook")).not.toContainText("spex.sublang.xyz");
    expect((await app.core.command("environment.get", { repository: key })).registry?.origin).toBe(registryOrigin);
    expect(readFileSync(join(app.projectDir, "spex.yaml"), "utf8")).toBe(legacy);
    expect((await app.core.command("registry.get", { repository: key })).account).toBeNull();
    expect((await app.core.command("space.get", {})).instances.find((entry) => entry.origin === spaceHost.url)?.signedIn).toBe(true);

    await projectTab(page, "Packages");
    const packages = packagesSection(page, "project");
    await expect(packages).not.toContainText("spex.sublang.xyz");
    await expect(packages.getByTestId("registry-signin")).toBeVisible();
    // Cancelling the registry flow cannot cancel or clear Space access.
    await packages.getByTestId("registry-signin").click();
    await packages.getByTestId("registry-cancel").click();
    expect((await app.core.command("space.get", {})).instances.find((entry) => entry.origin === spaceHost.url)?.signedIn).toBe(true);
    await packages.getByTestId("registry-signin").click();
    const pending = await app.core.command("registry.get", { origin: registryOrigin });
    if (pending.signIn.phase !== "running" || pending.signIn.flow !== "device") throw new Error("Expected registry sign-in");
    registryHost.script.approveDevice(pending.signIn.userCode);
    await expect(packages.getByTestId("registry-login")).toHaveText(`@${HOST_LOGIN}`);
    await projectTab(page, "Playbooks");
    await expect.poll(() => orgSuggestions(page)).toEqual(["publisher"]);
    await expect(page.getByTestId("new-playbook-org")).toHaveValue("publisher");
    await expect(page.getByTestId("new-playbook")).not.toContainText("spex.sublang.xyz");

    // Space sign-out leaves the package account and its namespace usable.
    await app.core.command("space.signout", { instance: spaceHost.url });
    expect((await app.core.command("registry.get", { origin: registryOrigin })).account?.login).toBe(HOST_LOGIN);
    await projectTab(page, "Packages");
    await expect(packages.getByTestId("registry-login")).toHaveText(`@${HOST_LOGIN}`);
    await packages.getByTestId("registry-signout").click();
    await expect(packages.getByTestId("registry-signin")).toBeVisible();
    await projectTab(page, "Playbooks");
    await expect(page.getByTestId("new-playbook-org")).toHaveValue("");
  });
});
