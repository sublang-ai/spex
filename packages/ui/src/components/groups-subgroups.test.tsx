// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Nested creation through the real Space surface and store, with a controlled command peer.
import { afterEach, beforeEach, expect, test } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { GroupsState, InstanceGroupState } from "@sublang/spex-core/protocol";
import { activateLanguage } from "../i18n.js";
import { setClientForTests, useAppStore } from "../state/store.js";
import { answer, calls, commandMock, deliver, installClient, namespace, NO_CAN, ORIGIN, renderGroups, SECOND, twoInstances } from "../fixtures/groups.js";

beforeEach(installClient);
afterEach(() => { cleanup(); activateLanguage("en"); setClientForTests(undefined); });

const parent = (over: Partial<InstanceGroupState> = {}): InstanceGroupState => ({
  id: "90", login: null, mine: false, fullPath: "workshop", name: "Workshop",
  can: { createSubgroup: true, manageMembers: true, rename: true, delete: true },
  repositories: [], placed: [], ...over,
});
function home(over: Partial<InstanceGroupState> = {}): GroupsState {
  const state = twoInstances();
  return { ...state, instances: state.instances.map((entry) => ({
    ...entry,
    account: { ...entry.account, canCreateGroup: false },
    groups: [namespace(entry.account.login), parent(over)],
  })) };
}
const section = (origin = SECOND) => within(screen.getByTestId(`space-instance-${origin}`));
function menu(origin = SECOND) {
  const scope = section(origin);
  fireEvent.click(scope.getByTestId("space-group-more-workshop"));
  return within(scope.getByTestId("space-group-more-workshop-menu"));
}
function openEditor(origin = SECOND) {
  fireEvent.click(menu(origin).getByRole("menuitem", { name: "New group…" }));
  return section(origin).getByTestId("space-group-create-editor-workshop");
}

test("nested creation follows the parent's right independently of root permission, and never treats a namespace as a parent", async () => {
  await renderGroups(home(), { open: false });
  expect(section().getByTestId("space-new-group")).toHaveProperty("disabled", true);
  expect(menu().getByRole("menuitem", { name: "New group…" })).toBeTruthy();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(section().queryByTestId("space-group-more-jada")).toBeNull();
  deliver(home({ can: NO_CAN }));
  expect(menu().queryByRole("menuitem", { name: "New group…" })).toBeNull();
  expect(calls("space.group.create")).toEqual([]);
});

test("the attached editor names its parent and Space; repeating preserves the draft, cancellation restores focus, and success sends the right parent at the right Space", async () => {
  await renderGroups(home(), { open: false });
  let editor = openEditor();
  expect(within(editor).getByRole("heading").textContent).toBe("New group in Workshop");
  expect(editor.textContent).toContain("workshop · Second Example");
  expect(editor.textContent).toContain("Members of Workshop will also have access to this group.");
  expect(section().getByTestId("space-group-panel-frame-workshop").contains(editor)).toBe(true);
  let name = within(editor).getByLabelText("Group name") as HTMLInputElement;
  const path = within(editor).getByLabelText("Path") as HTMLInputElement;
  fireEvent.change(name, { target: { value: "Research team" } });
  expect(path.value).toBe("research-team");
  fireEvent.change(path, { target: { value: "custom-path" } });
  expect(openEditor()).toBe(editor);
  expect(name.value).toBe("Research team");
  expect(path.value).toBe("custom-path");
  expect(document.activeElement).toBe(name);
  fireEvent.keyDown(name, { key: "Escape" });
  await waitFor(() => expect(document.activeElement).toBe(section().getByTestId("space-group-more-workshop")));
  expect(section().queryByTestId("space-group-create-editor-workshop")).toBeNull();
  expect(calls("space.group.create")).toEqual([]);
  editor = openEditor();
  name = within(editor).getByLabelText("Group name") as HTMLInputElement;
  expect(name.value).toBe("");
  fireEvent.change(name, { target: { value: "Research team" } });
  fireEvent.click(within(editor).getByRole("button", { name: "Create" }));
  await waitFor(() => expect(section().queryByTestId("space-group-create-editor-workshop")).toBeNull());
  expect(calls("space.group.create")).toEqual([{ instance: SECOND, name: "Research team", path: "research-team", parent: "90" }]);
  expect(section(ORIGIN).queryByTestId("space-group-create-editor-workshop")).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(section().getByTestId("space-group-more-workshop")));
});

test("pending creation keeps its editor, blocks replacements and duplicate keyboard submissions, and preserves a refusal for explicit retry", async () => {
  let reject!: (reason: Error) => void;
  commandMock.mockImplementation((type, fields) => type === "space.group.create"
    ? new Promise((_resolve, no) => { reject = no; }) : answer(type, fields));
  await renderGroups(home(), { open: false });
  const editor = openEditor();
  const name = within(editor).getByLabelText("Group name") as HTMLInputElement;
  fireEvent.change(name, { target: { value: "Research" } });
  fireEvent.keyDown(name, { key: "Enter" });
  expect(within(editor).getByRole("button", { name: "Creating…" })).toHaveProperty("disabled", true);
  expect(within(editor).getByRole("button", { name: "Cancel" })).toHaveProperty("disabled", true);
  const more = section().getByTestId("space-group-more-workshop");
  expect(more).toHaveProperty("disabled", true);
  fireEvent.click(more);
  fireEvent.keyDown(name, { key: "Escape" });
  fireEvent.keyDown(name, { key: "Enter" });
  expect(section().getByTestId("space-group-create-editor-workshop")).toBe(editor);
  expect(calls("space.group.create")).toHaveLength(1);
  await act(async () => reject(new Error("That path is taken.")));
  expect(within(editor).getByRole("alert").textContent).toBe("That path is taken.");
  expect(openEditor()).toBe(editor);
  expect(name.value).toBe("Research");
  expect(document.activeElement).toBe(name);
  expect(within(editor).getByRole("alert").textContent).toBe("That path is taken.");
});

test.each(["disconnected", "permission", "scheduled"])("an open editor cannot submit through Enter after %s, and its draft can still be cancelled", async (change) => {
  await renderGroups(home(), { open: false });
  const editor = openEditor();
  const name = within(editor).getByLabelText("Group name");
  fireEvent.change(name, { target: { value: "Research" } });
  if (change === "disconnected") act(() => useAppStore.setState({ connection: "closed" }));
  else deliver(home(change === "permission" ? { can: NO_CAN } : { pendingDeletion: true }));
  // Scheduling may move the group into the collapsed pending section,
  // unmounting the editor. A surviving editor must gate keyboard submission too.
  if (editor.isConnected) {
    expect(within(editor).getByRole("button", { name: "Create" })).toHaveProperty("disabled", true);
    fireEvent.keyDown(name, { key: "Enter" });
    fireEvent.click(within(editor).getByRole("button", { name: "Cancel" }));
  }
  expect(calls("space.group.create")).toEqual([]);
  expect(section().queryByTestId("space-group-create-editor-workshop")).toBeNull();
});
