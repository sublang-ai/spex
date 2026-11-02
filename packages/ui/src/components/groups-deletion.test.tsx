// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Real surface/store over a controlled command peer: a fresh contents
// review, explicit empty-only deletion, and the Space's scheduled lifecycle.
import { afterEach, beforeEach, expect, test } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { GroupsState, InstanceGroupState } from "@sublang/spex-core/protocol";
import { activateLanguage } from "../i18n.js";
import { SpexCommandError } from "../lib/client.js";
import { setClientForTests, useAppStore } from "../state/store.js";
import { ORIGIN, answer, base, calls, commandMock, deliver, installClient, live, namespace, renderGroups, repo, withInstance } from "../fixtures/groups.js";

const emptyReview = { group: { id: "90", fullPath: "scratch", name: "Scratch team" }, contents: [] };
const respond = (type: string, fields: Record<string, unknown> = {}) => type === "space.group.deletionCheck" ? Promise.resolve(emptyReview) : answer(type, fields);
beforeEach(() => { installClient(); commandMock.mockImplementation(respond); });
afterEach(() => { cleanup(); activateLanguage("en"); setClientForTests(undefined); });
const emptyGroup = (over: Partial<InstanceGroupState> = {}): InstanceGroupState => ({
  id: "90", login: null, mine: false, fullPath: "scratch", name: "Scratch team",
  can: { createSubgroup: true, manageMembers: true, rename: true, delete: true },
  repositories: [], placed: [], ...over,
});
function home(...groups: InstanceGroupState[]): GroupsState {
  return withInstance(base(), { account: { id: "7", login: "jane", displayName: null, canCreateGroup: true }, groups: [namespace("jane"), ...groups] });
}
function menu(path = "scratch") {
  fireEvent.click(screen.getByTestId(`space-group-more-${path}`));
  return within(screen.getByTestId(`space-group-more-${path}-menu`));
}
async function confirm() {
  fireEvent.click(menu().getByRole("menuitem", { name: "Delete group" }));
  const panel = await screen.findByTestId("space-group-delete-confirm-scratch");
  await waitFor(() => expect(within(panel).queryByText("Checking group contents…")).toBeNull());
  return panel;
}

test("permission controls the action, and a personal namespace never offers it", async () => {
  await renderGroups(withInstance(home(emptyGroup()), { groups: [{ ...namespace("jane"), can: emptyGroup().can }, emptyGroup({ can: { ...emptyGroup().can, delete: false } })] }), { open: false });
  expect(menu().queryByRole("menuitem", { name: "Delete group" })).toBeNull();
  expect(screen.queryByTestId("space-group-more-jane")).toBeNull();
  expect(calls("space.group.deletionCheck")).toEqual([]);
});

test("fresh review gates deletion; Owner membership and stale cached rows do not make a group nonempty", async () => {
  let resolve!: (value: unknown) => void;
  commandMock.mockImplementation((type, fields) => type === "space.group.deletionCheck" ? new Promise((yes) => { resolve = yes; }) : respond(type, fields));
  await renderGroups(home(emptyGroup({ repositories: [repo({ key: "@spex.example/scratch/old-spex", name: "old-spex" })], placed: [{ key: "@old.example/scratch/old-spex", name: "old-spex" }] })), { open: false });
  fireEvent.click(menu().getByRole("menuitem", { name: "Delete group" }));
  const panel = screen.getByTestId("space-group-delete-confirm-scratch");
  expect(panel.textContent).toContain("Checking group contents…");
  expect((within(panel).getByRole("button", { name: "Delete group" }) as HTMLButtonElement).disabled).toBe(true);
  expect(calls("space.group.deletionCheck")).toEqual([{ instance: ORIGIN, group: "90" }]);
  resolve(emptyReview);
  await waitFor(() => expect(panel.textContent).toContain("This group is empty."));
  expect((within(panel).getByRole("button", { name: "Delete group" }) as HTMLButtonElement).disabled).toBe(false);
  expect(within(panel).queryByRole("textbox")).toBeNull();
  expect(calls("space.group.delete")).toEqual([]);
});

test("every fresh blocker is named, even if absent from the cached project listing; Check again can clear them", async () => {
  let contents = [{ kind: "project", name: "Apollo" }, { kind: "group", name: "Research" }, { kind: "records", name: "Group sessions" }, { kind: "server", name: "Workshop server" }];
  commandMock.mockImplementation((type, fields) => type === "space.group.deletionCheck" ? Promise.resolve({ ...emptyReview, contents }) : respond(type, fields));
  await renderGroups(home(emptyGroup()), { open: false });
  const panel = await confirm();
  for (const label of ["Project: Apollo", "Group: Research", "Group sessions", "Server: Workshop server"]) expect(within(panel).getByText(label)).toBeTruthy();
  expect((within(panel).getByRole("button", { name: "Delete group" }) as HTMLButtonElement).disabled).toBe(true);
  expect(calls("space.group.delete")).toEqual([]);
  contents = [];
  fireEvent.click(within(panel).getByRole("button", { name: "Check again" }));
  await waitFor(() => expect(panel.textContent).toContain("This group is empty."));
  expect((within(panel).getByRole("button", { name: "Delete group" }) as HTMLButtonElement).disabled).toBe(false);
});

test("confirmation names the reviewed group and Space; Cancel and Escape return focus without deleting", async () => {
  await renderGroups(home(emptyGroup()), { open: false });
  let panel = await confirm();
  expect(within(panel).getByRole("heading").textContent).toBe("Delete Scratch team at Spex Example?");
  expect(document.activeElement).toBe(within(panel).getByRole("button", { name: "Cancel" }));
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("space-group-more-scratch")));
  panel = await confirm();
  fireEvent.click(within(panel).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByTestId("space-group-delete-confirm-scratch")).toBeNull();
  expect(calls("space.group.delete")).toEqual([]);
});

test.each([false, true])("repeating Delete focuses the same review without clearing its result or error (refused: %s)", async (refused) => {
  commandMock.mockImplementation((type, fields) => type === "space.group.deletionCheck"
    ? refused ? Promise.reject(new Error("Contents could not be checked")) : Promise.resolve(emptyReview)
    : respond(type, fields));
  await renderGroups(home(emptyGroup()), { open: false });
  const panel = await confirm();
  const before = panel.textContent;
  fireEvent.click(menu().getByRole("menuitem", { name: "Delete group" }));
  expect(screen.getByTestId("space-group-delete-confirm-scratch")).toBe(panel);
  expect(panel.textContent).toBe(before);
  expect(calls("space.group.deletionCheck")).toHaveLength(1);
  expect(document.activeElement).toBe(within(panel).getByRole("button", { name: "Cancel" }));
  fireEvent.click(within(panel).getByRole("button", { name: "Cancel" }));
  await confirm();
  expect(calls("space.group.deletionCheck")).toHaveLength(2);
  expect(calls("space.group.delete")).toHaveLength(0);
});

test("one deletion sends the reviewed path; a race refusal keeps the group and lets the owner recheck", async () => {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: unknown) => void;
  commandMock.mockImplementation((type, fields) => type === "space.group.delete" ? new Promise((yes, no) => { resolve = yes; reject = no; }) : respond(type, fields));
  await renderGroups(home(emptyGroup()), { open: false });
  const panel = await confirm();
  const submit = within(panel).getByRole("button", { name: "Delete group" });
  fireEvent.click(submit); fireEvent.click(submit);
  expect(calls("space.group.delete")).toEqual([{ instance: ORIGIN, group: "90", confirmPath: "scratch" }]);
  expect((within(panel).getByRole("button", { name: "Deleting…" }) as HTMLButtonElement).disabled).toBe(true);
  expect((within(panel).getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.keyDown(panel, { key: "Escape" });
  expect(screen.getByTestId("space-group-delete-confirm-scratch")).toBe(panel);
  reject(new SpexCommandError("invalid_request", "This group contains Apollo."));
  await waitFor(() => expect(within(panel).getByRole("alert").textContent).toBe("This group contains Apollo."));
  await waitFor(() => expect(document.activeElement).toBe(within(panel).getByRole("button", { name: "Cancel" })));
  expect(screen.getByTestId("space-group-scratch")).toBeTruthy();
  fireEvent.click(within(panel).getByRole("button", { name: "Check again" }));
  await waitFor(() => expect(calls("space.group.deletionCheck")).toHaveLength(2));
  await waitFor(() => expect((within(panel).getByRole("button", { name: "Delete group" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(within(panel).getByRole("button", { name: "Delete group" }));
  deliver(home()); resolve({ status: "deleted" });
  await waitFor(() => expect(live()).toBe("Scratch team deleted."));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("space-new-group")));
});

test.each(["permission", "connection", "pending"] as const)("a %s change disables an open confirmation", async (changed) => {
  await renderGroups(home(emptyGroup()), { open: false });
  const panel = await confirm();
  if (changed === "permission") deliver(home(emptyGroup({ can: { ...emptyGroup().can, delete: false } })));
  if (changed === "connection") useAppStore.setState({ connection: "closed" });
  if (changed === "pending") deliver(home(emptyGroup({ pendingDeletion: true })));
  await waitFor(() => expect((within(panel).getByRole("button", { name: "Delete group" }) as HTMLButtonElement).disabled).toBe(true));
  fireEvent.click(within(panel).getByRole("button", { name: "Delete group" }));
  expect(calls("space.group.delete")).toEqual([]);
});

test("a failed review can be retried; cancelling discards a late review", async () => {
  let reject!: (reason: unknown) => void;
  let resolve!: (value: unknown) => void;
  commandMock.mockImplementation((type, fields) => type === "space.group.deletionCheck" ? new Promise((yes, no) => { resolve = yes; reject = no; }) : respond(type, fields));
  await renderGroups(home(emptyGroup()), { open: false });
  fireEvent.click(menu().getByRole("menuitem", { name: "Delete group" }));
  const panel = screen.getByTestId("space-group-delete-confirm-scratch");
  reject(new Error("The Space could not be reached."));
  await waitFor(() => expect(within(panel).getByRole("alert").textContent).toBe("The Space could not be reached."));
  expect((within(panel).getByRole("button", { name: "Delete group" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(within(panel).getByRole("button", { name: "Check again" }));
  fireEvent.click(within(panel).getByRole("button", { name: "Cancel" }));
  resolve(emptyReview);
  await waitFor(() => expect(screen.queryByTestId("space-group-delete-confirm-scratch")).toBeNull());
  expect(calls("space.group.delete")).toEqual([]);
});

test("an empty group's scheduled deletion stays visible and can be restored without repeated submissions", async () => {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: unknown) => void;
  commandMock.mockImplementation((type, fields) => type === "space.group.delete" || type === "space.group.restore" ? new Promise((yes, no) => { resolve = yes; reject = no; }) : respond(type, fields));
  await renderGroups(home(emptyGroup()), { open: false });
  const panel = await confirm();
  within(panel).getByRole("button", { name: "Delete group" }).focus();
  fireEvent.click(within(panel).getByRole("button", { name: "Delete group" }));
  deliver(home(emptyGroup({ pendingDeletion: true, deletionRoot: "scratch", can: { createSubgroup: false, manageMembers: false, rename: false, delete: false, restore: true } })));
  await waitFor(() => expect((screen.getByRole("button", { name: "Restore group" }) as HTMLButtonElement).disabled).toBe(true));
  resolve({ status: "scheduled" });
  await waitFor(() => expect(screen.queryByTestId("space-group-delete-confirm-scratch")).toBeNull());
  const banner = screen.getByTestId("space-group-pending-scratch");
  expect(banner.textContent).toContain("Scheduled for deletion");
  await waitFor(() => expect(document.activeElement).toBe(within(banner).getByRole("button", { name: "Restore group" })));
  expect(menu().queryByRole("menuitem", { name: "Delete group" })).toBeNull();
  fireEvent.keyDown(window, { key: "Escape" });
  const restore = within(banner).getByRole("button", { name: "Restore group" });
  restore.focus();
  fireEvent.click(restore); fireEvent.click(restore);
  expect(calls("space.group.restore")).toEqual([{ instance: ORIGIN, group: "90" }]);
  expect((within(banner).getByRole("button", { name: "Restoring…" }) as HTMLButtonElement).disabled).toBe(true);
  reject(new SpexCommandError("invalid_request", "Restoration refused"));
  await waitFor(() => expect(within(banner).getByRole("alert").textContent).toBe("Restoration refused"));
  await waitFor(() => expect(document.activeElement).toBe(within(banner).getByRole("button", { name: "Restore group" })));
  within(banner).getByRole("button", { name: "Restore group" }).focus();
  fireEvent.click(within(banner).getByRole("button", { name: "Restore group" }));
  deliver(home(emptyGroup()));
  await waitFor(() => expect((screen.getByTestId("space-group-more-scratch") as HTMLButtonElement).disabled).toBe(true));
  resolve({ group: emptyReview.group });
  await waitFor(() => expect(screen.queryByTestId("space-group-pending-scratch")).toBeNull());
  await waitFor(() => expect(live()).toBe("Scratch team restored."));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("space-group-more-scratch")));
});

test("scheduled deletion and restoration preserve focus moved to another control while pending", async () => {
  let resolve!: (value: unknown) => void;
  commandMock.mockImplementation((type, fields) => type === "space.group.delete" || type === "space.group.restore" ? new Promise((yes) => { resolve = yes; }) : respond(type, fields));
  await renderGroups(home(emptyGroup()), { open: false });
  const panel = await confirm();
  fireEvent.click(within(panel).getByRole("button", { name: "Delete group" }));
  const elsewhere = screen.getByTestId("space-new-group");
  elsewhere.focus();
  deliver(home(emptyGroup({ pendingDeletion: true, can: { ...emptyGroup().can, delete: false, restore: true } })));
  resolve({ status: "scheduled" });
  await waitFor(() => expect(screen.queryByTestId("space-group-delete-confirm-scratch")).toBeNull());
  expect(document.activeElement).toBe(elsewhere);

  const restore = screen.getByRole("button", { name: "Restore group" });
  restore.focus();
  fireEvent.click(restore);
  elsewhere.focus();
  deliver(home(emptyGroup()));
  resolve({ group: emptyReview.group });
  await waitFor(() => expect(live()).toBe("Scratch team restored."));
  expect(document.activeElement).toBe(elsewhere);
});
