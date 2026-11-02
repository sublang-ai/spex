// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Groups and sharing through the Space surface over a mocked client
// (space-70, DR-114, DR-127, DR-159, DR-172): each act stands exactly
// where the Space's last read says the person may take it (space-1,
// space-62) — "New group…" on the Space's heading, disabled and titled
// "Made by the people who run <display name>" where it may not, Members
// and permitted deletion in a group's heading's one "More", Invite members and Remove in a members
// panel — the group editor (space-68), Invite members (space-69), Remove
// (space-72), and the label budget the fit rests on (space-28); no link
// to a page of the Space anywhere (DR-120); and renaming, creating a
// group inside a group and moving a project not offered (DR-172, DR-190). A spex
// repository's Members, Invite members and Remove act on its placement at the
// fixtures' Space, named in each command (DR-128). Each act is checked
// by the command it sends.

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { GroupsState, HostMemberInfo, RepositoryState } from "@sublang/spex-core/protocol";

import { activateLanguage } from "../i18n.js";
import { SpexCommandError } from "../lib/client.js";
import { setClientForTests, useAppStore } from "../state/store.js";
import {
  BRANCH,
  ORIGIN,
  OWN_REPO,
  SECOND,
  answer,
  base,
  calls,
  commandMock,
  deliver,
  installClient,
  live,
  namespace,
  renderGroups,
  ownRepo,
  repo,
  withInstance,
} from "../fixtures/groups.js";

beforeEach(installClient);

afterEach(() => {
  cleanup();
  activateLanguage("en");
  setClientForTests(undefined);
});

const ACME = "3";
const OTHER = "4";
const EMPTY = "5";
const A_SPEX = "@spex.example/acme/a-spex";
const B_SPEX = "@spex.example/other/b-spex";
const OWN = OWN_REPO.key;
/** What a placement's panel and picker are named by: its row's key and
 * its instance's origin (space-87). */
const at = (key: string): string => `${key}@${ORIGIN}`;

const member = (login: string, role: string, via: string | null = null, displayName: string | null = null): HostMemberInfo => ({
  id: `u-${login}`,
  login,
  displayName,
  role,
  direct: via === null,
  via,
});

/** acme's own members, as the host lists them. */
const ACME_MEMBERS = [member("jane", "Owner", null, "Jane"), member("bob", "Developer")];
/** a-spex's: jane through acme, bob its own. */
const A_MEMBERS = [member("jane", "Owner", "acme", "Jane"), member("bob", "Developer")];

/** The host's read: the person may create a group, may create a
 * subgroup in acme, manage its members, rename it and delete it, may do
 * none of these in other, named "Other team" apart from its path, may
 * rename and delete the empty group empty,
 * and may manage a-spex's members and move it but do neither on b-spex.
 * Your own group's flags, and its own repository's, are set too, to
 * show its heading and that row ignore them. */
function sharingHome(over: { canCreateGroup?: boolean } = {}): GroupsState {
  const repository = (key: string, id: string, manage: boolean): RepositoryState =>
    repo({ key, name: key.split("/").pop()!, id, code: null, folder: null, can: { manageMembers: manage, transfer: manage } });
  // Your own group's own clone is here, holding its placement.
  const home = base({ own: { name: "jane", named: false, repositories: [ownRepo({ can: { manageMembers: true, transfer: true }, branch: BRANCH })] } });
  return withInstance(home, {
    account: { ...home.instances[0]!.account, canCreateGroup: over.canCreateGroup ?? true },
    groups: [
      { ...namespace("jane"), can: { createSubgroup: true, manageMembers: true, rename: true, delete: true } },
      {
        id: ACME,
        login: null,
        mine: false,
        fullPath: "acme",
        name: "acme",
        can: { createSubgroup: true, manageMembers: true, rename: true, delete: true },
        placed: [],
        repositories: [repository(A_SPEX, "60", true)],
      },
      {
        id: OTHER,
        login: null,
        mine: false,
        fullPath: "other",
        name: "Other team",
        can: { createSubgroup: false, manageMembers: false, rename: false, delete: false },
        placed: [],
        repositories: [repository(B_SPEX, "61", false)],
      },
      {
        id: EMPTY,
        login: null,
        mine: false,
        fullPath: "empty",
        name: "empty",
        can: { createSubgroup: true, manageMembers: true, rename: true, delete: true },
        placed: [],
        repositories: [],
      },
    ],
  });
}

/** The groups the fixtures' instance lists, in its order. */
const listedGroups = (state: GroupsState) => state.instances[0]!.groups;

/** The core's answers with each target's members. */
async function core(type: string, fields: Record<string, unknown> = {}): Promise<unknown> {
  if (type === "space.members") {
    if (fields.group === ACME) return { members: ACME_MEMBERS };
    if (fields.repository === A_SPEX) return { members: A_MEMBERS };
  }
  return answer(type, fields);
}

/** A reply the test settles itself, so a control's busy form shows. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const region = (name: string) => screen.getByRole("group", { name });

/** A heading's or a row's one overflow control, "More", opened where it
 * stands closed (space-1, DR-159), within `scope`. */
function openMore(testId: string, scope: HTMLElement = document.body): HTMLElement {
  const box = within(scope);
  if (!box.queryByTestId(`${testId}-menu`)) fireEvent.click(box.getByTestId(testId));
  return box.getByTestId(`${testId}-menu`);
}

/** Every menu standing open closes, as Escape closes it. */
const closeMenus = (): void => {
  fireEvent.keyDown(window, { key: "Escape" });
};

/** A heading's act in its "More" (space-1), where it stands. */
function groupAct(path: string, act: "members", scope: HTMLElement = document.body): HTMLButtonElement | null {
  return within(openMore(`space-group-more-${path}`, scope)).queryByTestId(`space-group-${act}-${path}`) as HTMLButtonElement | null;
}

/** The entries of a heading's "More", by test id, the menu closed after. */
function groupMenu(path: string, scope: HTMLElement = document.body): string[] {
  const ids = within(openMore(`space-group-more-${path}`, scope))
    .getAllByRole("menuitem")
    .map((item) => item.dataset.testid ?? "");
  closeMenus();
  return ids;
}

/** A row's act in its "More" (space-1), where it stands. */
function rowAct(key: string, act: "members"): HTMLButtonElement | null {
  return within(openMore(`space-row-more-${key}`)).queryByTestId(`space-row-${act}-${key}`) as HTMLButtonElement | null;
}

async function openGroupMembers(path: string): Promise<HTMLElement> {
  fireEvent.click(groupAct(path, "members")!);
  const list = await screen.findByTestId(`space-members-group:${path}`);
  await within(list).findAllByTestId(/^space-member-/);
  return list;
}

/** A row's placement line at the fixtures' instance, in its Sync tab,
 * which its name opens (space-87). */
function lineOf(key: string): HTMLElement {
  if (!screen.queryByTestId(`space-lines-${key}`)) fireEvent.click(screen.getByTestId(`space-repo-${key}`));
  return within(screen.getByTestId(`space-lines-${key}`)).getByTestId(`space-line-${ORIGIN}`);
}

/** Open the members panel of a row's key placement through its
 * overflow's Members (space-1, space-62). */
async function openPlacementMembers(key: string): Promise<HTMLElement> {
  fireEvent.click(rowAct(key, "members")!);
  const list = await screen.findByTestId(`space-members-${at(key)}`);
  await within(list).findAllByTestId(/^space-member-/);
  return list;
}

describe("GROUPS: each act where the host's read says (space-1, space-62, space-29)", () => {
  test.each(["group", "project"] as const)("%s Members and invitation openers preserve the current draft and explicit Close returns focus", async (scope) => {
    commandMock.mockImplementation(core);
    await renderGroups(sharingHome(), { open: false });
    const groupScope = scope === "group";
    const id = groupScope ? "group:acme" : at(A_SPEX);
    const list = groupScope ? await openGroupMembers("acme") : await openPlacementMembers(A_SPEX);
    expect(document.activeElement).toBe(list);
    const owner = screen.getByTestId(groupScope ? "space-group-more-acme" : `space-row-more-${A_SPEX}`);
    if (groupScope) {
      const frame = screen.getByTestId("space-group-panel-frame-acme");
      expect(frame.contains(list)).toBe(true);
      expect(frame.contains(screen.getByTestId(`space-row-${A_SPEX}`))).toBe(false);
    }
    const invite = within(list).getByTestId(`space-share-${id}`) as HTMLButtonElement;
    fireEvent.click(invite);
    const editor = within(list).getByTestId(`space-share-${id}-editor`);
    const field = within(editor).getByLabelText("Usernames") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "carol" } });
    const role = within(editor).getByLabelText("Role") as HTMLSelectElement;
    fireEvent.change(role, { target: { value: "40" } });
    expect(invite.disabled).toBe(false);
    fireEvent.click(invite);
    expect(within(list).getByTestId(`space-share-${id}-editor`)).toBe(editor);
    expect(field.value).toBe("carol");
    expect(role.value).toBe("40");
    expect(document.activeElement).toBe(field);
    fireEvent.click(groupScope ? groupAct("acme", "members")! : rowAct(A_SPEX, "members")!);
    expect(screen.getByTestId(`space-members-${id}`)).toBe(list);
    expect(field.value).toBe("carol");
    expect(calls("space.members")).toHaveLength(1);
    expect(document.activeElement).toBe(list);
    fireEvent.keyDown(field, { key: "Escape" });
    expect(screen.getByTestId(`space-members-${id}`)).toBe(list);
    expect(within(list).queryByTestId(`space-share-${id}-editor`)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(invite));
    fireEvent.click(within(list).getByRole("button", { name: "Close" }));
    expect(screen.queryByTestId(`space-members-${id}`)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(owner));
    if (groupScope) await openGroupMembers("acme"); else await openPlacementMembers(A_SPEX);
    expect(calls("space.members")).toHaveLength(2);
    expect(calls("space.share")).toHaveLength(0);
  });

  test.each(["group", "project"] as const)("%s membership writes block the owner's controls and Close until they settle", async (scope) => {
    const pending = deferred<unknown>();
    commandMock.mockImplementation((type: string, fields?: Record<string, unknown>) => type === "space.share" ? pending.promise : core(type, fields));
    await renderGroups(sharingHome(), { open: false });
    const groupScope = scope === "group";
    const id = groupScope ? "group:acme" : at(A_SPEX);
    const list = groupScope ? await openGroupMembers("acme") : await openPlacementMembers(A_SPEX);
    const owner = screen.getByTestId(groupScope ? "space-group-more-acme" : `space-row-more-${A_SPEX}`) as HTMLButtonElement;
    const close = within(list).getByRole("button", { name: "Close" }) as HTMLButtonElement;
    fireEvent.click(within(list).getByTestId(`space-share-${id}`));
    const editor = within(list).getByTestId(`space-share-${id}-editor`);
    fireEvent.change(within(editor).getByLabelText("Usernames"), { target: { value: "carol" } });
    fireEvent.submit(editor);
    expect(owner.disabled).toBe(true);
    expect(close.disabled).toBe(true);
    fireEvent.click(owner);
    fireEvent.click(close);
    fireEvent.keyDown(list, { key: "Escape" });
    expect(screen.getByTestId(`space-members-${id}`)).toBe(list);
    expect(calls("space.share")).toHaveLength(1);
    pending.reject(new Error("Account could not be added"));
    await within(editor).findByRole("alert");
    await waitFor(() => {
      expect(owner.disabled).toBe(false);
      expect(close.disabled).toBe(false);
    });
    fireEvent.click(within(list).getByTestId(`space-share-${id}`));
    expect(within(editor).getByRole("alert").textContent).toBe("Account could not be added");
    fireEvent.click(groupScope ? groupAct("acme", "members")! : rowAct(A_SPEX, "members")!);
    expect(within(editor).getByRole("alert").textContent).toBe("Account could not be added");
    expect(calls("space.members")).toHaveLength(1);
  });

  test("space-70, space-1: New group stands on the instance's heading; each group's heading carries Members alone, Personal's none", async () => {
    commandMock.mockImplementation(core);
    await renderGroups(sharingHome(), { open: false });
    const head = screen.getByTestId("space-new-group");
    expect(head.textContent).toBe("New group…");
    expect(within(screen.getByTestId(`space-instance-${ORIGIN}`)).getByTestId("space-instance-heading").contains(head)).toBe(true);
    // acme: its heading's one "More", outside the heading, holds Members
    // and the permitted group deletion (space-1, DR-190).
    const acme = region("acme");
    const more = within(acme).getByTestId("space-group-more-acme");
    expect(more.getAttribute("aria-label")).toBe("More for acme");
    expect(within(acme).getByRole("heading", { level: 3 }).contains(more)).toBe(false);
    expect(groupAct("acme", "members")!.textContent).toBe("Members");
    closeMenus();
    expect(groupMenu("acme")).toEqual(["space-group-members-acme", "space-group-create-acme", "space-group-delete-acme"]);
    expect(within(acme).getByRole("heading", { level: 3 }).textContent).toBe("acme");
    // other: Members alone too, its path beside its name.
    const other = region("other");
    expect(within(other).getByRole("heading", { level: 3 }).textContent).toBe("Other team · other");
    expect(groupMenu("other")).toEqual(["space-group-members-other"]);
    // Personal — your sessions, placed at the Space — carries none,
    // whatever the flags say, and "This computer", holding nothing,
    // heads nothing (space-1).
    const own = region("Personal");
    expect(own).toBe(screen.getByTestId("space-group-@jane"));
    expect(within(own).getByTestId(`space-row-${OWN}`)).toBeTruthy();
    expect(screen.queryByTestId("space-group-more-jane")).toBeNull();
    expect(screen.queryByTestId("space-own")).toBeNull();
    // Invite members stands in a members panel only, never on a heading.
    expect(screen.queryByRole("button", { name: "Invite members…" })).toBeNull();

    // acme's members panel: its own members, Invite members, and Remove on each.
    const acmeList = await openGroupMembers("acme");
    expect(calls("space.members")).toEqual([{ instance: ORIGIN, group: ACME }]);
    expect(within(acmeList).getByTestId("space-share-group:acme").textContent).toBe("Invite members…");
    expect(within(acmeList).getAllByRole("button", { name: /^Remove @/ }).map((button) => button.getAttribute("aria-label"))).toEqual([
      "Remove @jane",
      "Remove @bob",
    ]);
    // No page of the host is linked (space-62, DR-120).
    expect(acmeList.querySelector("a")).toBeNull();

    // other's panel lists its members with no Invite members and no Remove.
    const otherList = await openGroupMembers("other");
    expect(calls("space.members")[1]).toEqual({ instance: ORIGIN, group: OTHER });
    expect(within(otherList).queryByRole("button", { name: "Invite members…" })).toBeNull();
    expect(within(otherList).queryByRole("button", { name: /Remove/ })).toBeNull();
    expect(otherList.querySelector("a")).toBeNull();
  });

  test("a-spex's panel carries Invite members and Remove on its own members, an inherited one reading via its group; b-spex's carries neither", async () => {
    commandMock.mockImplementation(core);
    await renderGroups(sharingHome(), { open: false });
    const a = await openPlacementMembers(A_SPEX);
    expect(calls("space.members")).toEqual([{ repository: A_SPEX, instance: ORIGIN }]);
    expect(within(a).getByTestId(`space-share-${at(A_SPEX)}`).textContent).toBe("Invite members…");
    // jane comes through acme: "via acme", and no Remove here.
    const jane = within(a).getByTestId("space-member-jane");
    expect(within(jane).getByText("jane").getAttribute("title")).toBe("jane");
    expect(within(jane).queryByText("Jane")).toBeNull();
    expect(within(jane).getAllByText("jane")).toHaveLength(1);
    expect(within(jane).getByTestId("space-member-via-jane").textContent).toBe("via acme");
    expect(jane.textContent).toContain("Owner");
    expect(within(jane).queryByRole("button")).toBeNull();
    const bob = within(a).getByTestId("space-member-bob");
    expect(within(bob).queryByTestId("space-member-via-bob")).toBeNull();
    expect(within(bob).getByRole("button", { name: "Remove @bob" }).textContent).toBe("Remove");

    const b = await openPlacementMembers(B_SPEX);
    expect(calls("space.members")[1]).toEqual({ repository: B_SPEX, instance: ORIGIN });
    expect(within(b).queryByRole("button", { name: "Invite members…" })).toBeNull();
    expect(within(b).queryByRole("button", { name: /Remove/ })).toBeNull();

    // Your own group's repositories share what is there where the host
    // allows (DR-114).
    const own = await openPlacementMembers(OWN);
    expect(within(own).getByTestId(`space-share-${at(OWN)}`)).toBeTruthy();
  });

  test.each(["en", "zh"] as const)("space-70, space-1: where the instance's read says no group may be created, New group stands disabled, titled who makes groups, with no link; neither before a read is held (%s)", async (language) => {
    activateLanguage(language);
    const refused = sharingHome({ canCreateGroup: false });
    await renderGroups(refused, { open: false });
    const create = screen.getByTestId("space-new-group") as HTMLButtonElement;
    // The reason is the control's title, no sentence beside it (DR-069,
    // DR-172).
    expect(create.disabled).toBe(true);
    expect(create.textContent).toBe(language === "zh" ? "新建群组…" : "New group…");
    expect(create.title).toBe(language === "zh" ? "由运营 Spex Example 的人创建" : "Made by the people who run Spex Example");
    expect(screen.queryByTestId("space-groups-made-by")).toBeNull();
    expect(screen.getByTestId("space-groups").querySelector("a")).toBeNull();
    cleanup();
    // Before a read is held, it does not stand.
    await renderGroups(withInstance(refused, { readAt: null }), { open: false });
    expect(screen.queryByTestId("space-new-group")).toBeNull();
  });

  test("space-70, space-29: a group's acts name the instance whose heading it stands under, and its panel reads that instance's roles and host", async () => {
    // A second instance holds its own acme under the same id, with roles
    // of its own; the person may manage its members and rename it.
    const home = sharingHome();
    const secondAcme = { ...listedGroups(home)[1]!, repositories: [] };
    const two: GroupsState = {
      ...home,
      instances: [
        ...home.instances,
        {
          ...home.instances[0]!,
          origin: SECOND,
          host: "second.example",
          displayName: "Second Example",
          account: { id: "70", login: "jada", displayName: "Jada", canCreateGroup: false },
          roles: [
            { id: "1", name: "Viewer", mayPush: false },
            { id: "2", name: "Editor", mayPush: true },
          ],
          groups: [namespace("jada"), secondAcme],
        },
      ],
    };
    commandMock.mockImplementation(core);
    await renderGroups(two, { open: false });
    const secondSection = screen.getByTestId(`space-instance-${SECOND}`);
    const second = within(secondSection);
    fireEvent.click(groupAct("acme", "members", secondSection)!);
    const list = await second.findByTestId("space-members-group:acme");
    await within(list).findAllByTestId(/^space-member-/);
    expect(calls("space.members")).toEqual([{ instance: SECOND, group: ACME }]);
    fireEvent.click(within(list).getByTestId("space-share-group:acme"));
    const editor = within(list).getByTestId("space-share-group:acme-editor");
    expect(within(editor).getByLabelText("Usernames")).toBeTruthy();
    expect(editor.textContent).toContain("Second Example");
    expect(within(within(editor).getByRole("combobox", { name: "Role" })).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Viewer",
      "Editor",
    ]);
    const role = within(editor).getByRole("combobox", { name: "Role" });
    expect(within(editor).getByText("Can sync changes to shared records.")).toBeTruthy();
    fireEvent.change(role, { target: { value: "1" } });
    expect(within(editor).getByText("Cannot sync changes to shared records.")).toBeTruthy();
    expect(editor.textContent).not.toContain("Full control");
    // The action remains tied to the second Space's own permission.
    expect(groupMenu("acme", secondSection)).toEqual(["space-group-members-acme", "space-group-create-acme", "space-group-delete-acme"]);
  });

  test("nothing stands for an act the host does not let the person take, nor before sign-in", async () => {
    await renderGroups(sharingHome({ canCreateGroup: false }), { open: false });
    expect((screen.getByTestId("space-new-group") as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    const out = sharingHome();
    await renderGroups(withInstance(out, { signedIn: false, readAt: null }), { open: false });
    expect(screen.queryByTestId("space-new-group")).toBeNull();
    expect(screen.queryByTestId("space-groups-made-by")).toBeNull();
    // No heading's "More" stands at an instance signed out: it would hold
    // nothing (space-1).
    expect(screen.queryByTestId("space-group-more-acme")).toBeNull();
    expect(screen.queryByTestId("space-group-members-acme")).toBeNull();
  });
});

describe("GROUPS: New group (space-68, space-29)", () => {
  test("space-68: New group on the instance's heading creates at that instance's root", async () => {
    commandMock.mockImplementation(core);
    await renderGroups(sharingHome(), { open: false });
    const control = screen.getByTestId("space-new-group");
    fireEvent.click(control);
    const editor = screen.getByTestId("space-new-group-editor");
    fireEvent.change(within(editor).getByLabelText("Group name"), { target: { value: "Workshop" } });
    fireEvent.click(within(editor).getByRole("button", { name: "Create" }));
    await waitFor(() => expect(calls("space.group.create")).toEqual([{ instance: ORIGIN, name: "Workshop", path: "workshop", parent: null }]));
    await waitFor(() => expect(screen.queryByTestId("space-new-group-editor")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(control));
    // Cancel closes it too.
    fireEvent.click(control);
    fireEvent.click(within(screen.getByTestId("space-new-group-editor")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("space-new-group-editor")).toBeNull();
    expect(calls("space.group.create")).toHaveLength(1);
  });

  test("space-70: New group's editor in place — the path following the name until edited, Create disabled until both hold text, Escape closing, Creating… until the reply, a refusal kept, a success closing with the group listed", async () => {
    const replies: ReturnType<typeof deferred<unknown>>[] = [];
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type !== "space.group.create") return core(type, fields);
      const reply = deferred<unknown>();
      replies.push(reply);
      return reply.promise;
    });
    await renderGroups(sharingHome(), { open: false });
    // New group stands on the instance's heading; closing its editor
    // hands focus back to it (space-68, DR-010 §6).
    const control = screen.getByTestId("space-new-group");
    fireEvent.click(control);
    expect(control.getAttribute("aria-expanded")).toBe("true");
    const editor = screen.getByTestId("space-new-group-editor");
    const field = within(editor).getByLabelText("Group name") as HTMLInputElement;
    const pathField = within(editor).getByLabelText("Path") as HTMLInputElement;
    expect(document.activeElement).toBe(field);
    expect(pathField.value).toBe("");
    const create = within(editor).getByRole("button", { name: "Create" }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    fireEvent.change(field, { target: { value: "   " } });
    expect(pathField.value).toBe("");
    expect(create.disabled).toBe(true);
    // The path follows the name as the Space derives it.
    fireEvent.change(field, { target: { value: "Lumen Labs" } });
    expect(pathField.value).toBe("lumen-labs");
    expect(create.disabled).toBe(false);
    // A name that derives no path leaves it empty, and Create disabled.
    fireEvent.change(field, { target: { value: "华芯智造" } });
    expect(pathField.value).toBe("");
    expect(create.disabled).toBe(true);
    fireEvent.keyDown(field, { key: "Enter" });
    // Escape closes it, sending nothing, focus back on the control.
    fireEvent.keyDown(field, { key: "Escape" });
    expect(screen.queryByTestId("space-new-group-editor")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(control));
    expect(calls("space.group.create")).toEqual([]);

    fireEvent.click(control);
    const again = screen.getByTestId("space-new-group-editor");
    const name = within(again).getByLabelText("Group name") as HTMLInputElement;
    const path = within(again).getByLabelText("Path") as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Team 1" } });
    expect(path.value).toBe("team-1");
    const createAgain = within(again).getByTestId("space-new-group-editor-create") as HTMLButtonElement;
    expect(createAgain.disabled).toBe(false);
    fireEvent.click(createAgain);
    await waitFor(() => expect(createAgain.textContent).toBe("Creating…"));
    expect(createAgain.disabled).toBe(true);
    // A second submission while the command runs sends nothing.
    fireEvent.keyDown(name, { key: "Enter" });
    expect(calls("space.group.create")).toEqual([{ instance: ORIGIN, name: "Team 1", path: "team-1", parent: null }]);
    // The Space reports the name taken: in the editor, the name kept.
    replies[0]!.reject(new SpexCommandError("invalid_request", "Team 1 is taken; name another"));
    await waitFor(() => expect(within(again).getByRole("alert").textContent).toBe("Team 1 is taken; name another"));
    expect(name.value).toBe("Team 1");
    expect(path.value).toBe("team-1");
    expect(createAgain.textContent).toBe("Create");
    expect(document.activeElement).toBe(name);
    expect(live()).toBe("Team 1 is taken; name another");

    // A name in Chinese: the reader gives the path, which then no longer
    // follows the name; an empty path disables Create.
    fireEvent.change(name, { target: { value: "华芯智造" } });
    expect(path.value).toBe("");
    expect(createAgain.disabled).toBe(true);
    fireEvent.change(path, { target: { value: "huaxin-mfg" } });
    expect(createAgain.disabled).toBe(false);
    fireEvent.change(name, { target: { value: "华芯智造 Lab" } });
    expect(path.value).toBe("huaxin-mfg");
    fireEvent.change(path, { target: { value: "  " } });
    expect(createAgain.disabled).toBe(true);
    fireEvent.change(path, { target: { value: "huaxin-lab" } });
    fireEvent.keyDown(path, { key: "Enter" });
    await waitFor(() => expect(calls("space.group.create")).toHaveLength(2));
    expect(calls("space.group.create")[1]).toEqual({ instance: ORIGIN, name: "华芯智造 Lab", path: "huaxin-lab", parent: null });
    // The core holds the created group as listed and announces it before
    // its reply; the reply closes the editor with the group standing in
    // the list by its name, its full path beside it where the two differ.
    const listed = sharingHome();
    deliver(
      withInstance(listed, {
        groups: [
          ...listedGroups(listed),
          { id: "70", login: null, mine: false, fullPath: "huaxin-lab", name: "华芯智造 Lab", can: { createSubgroup: true, manageMembers: true, rename: false, delete: false }, placed: [], repositories: [] },
        ],
      }),
    );
    replies[1]!.resolve({ group: { id: "70", fullPath: "huaxin-lab", name: "华芯智造 Lab" } });
    await waitFor(() => expect(screen.queryByTestId("space-new-group-editor")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(control));
    const created = region("huaxin-lab");
    expect(within(created).getAllByRole("heading", { level: 3 })[0]!.textContent).toBe("华芯智造 Lab · huaxin-lab");
  });
});

describe("GROUPS: Invite members (space-69, space-29)", () => {
  test("the invitation names its group, explains username and role, preserves a failed entry and adds it once", async () => {
    const replies: ReturnType<typeof deferred<unknown>>[] = [];
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type !== "space.share") return core(type, fields);
      const reply = deferred<unknown>();
      replies.push(reply);
      return reply.promise;
    });
    await renderGroups(sharingHome(), { open: false });
    const list = await openGroupMembers("acme");
    const share = within(list).getByTestId("space-share-group:acme");
    const currentMember = within(list).getByTestId("space-member-jane");
    expect(within(currentMember).getByText("You")).toBeTruthy();
    expect(share.compareDocumentPosition(currentMember) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(share);
    expect(share.getAttribute("aria-expanded")).toBe("true");
    const editor = within(list).getByTestId("space-share-group:acme-editor");
    expect(within(editor).getByRole("heading", { name: "Invite to acme" })).toBeTruthy();
    expect(editor.compareDocumentPosition(currentMember) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const login = within(editor).getByLabelText("Usernames") as HTMLInputElement;
    expect(document.activeElement).toBe(login);
    expect(login.placeholder).toBe("e.g. alex, sam");
    const describedBy = (element: HTMLElement) => (element.getAttribute("aria-describedby") ?? "")
      .split(/\s+/).filter(Boolean).map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
    expect(describedBy(login)).toContain("Spex Example");
    expect(describedBy(login)).toMatch(/account/i);
    expect(describedBy(login)).toContain("Use Enter or commas between usernames.");
    const roles = within(editor).getByRole("combobox", { name: "Role" }) as HTMLSelectElement;
    expect(roles.multiple).toBe(false);
    expect(roles.size).toBeLessThanOrEqual(1);
    const defaultHint = describedBy(roles);
    expect(defaultHint.length).toBeGreaterThan(0);
    fireEvent.change(roles, { target: { value: "20" } });
    expect(describedBy(roles)).not.toBe(defaultHint);
    fireEvent.change(roles, { target: { value: "30" } });
    expect(within(roles).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Guest",
      "Reporter",
      "Developer",
      "Maintainer",
      "Owner",
    ]);
    // The least role that may push is chosen.
    expect(roles.value).toBe("30");
    expect((within(roles).getByRole("option", { name: "Developer" }) as HTMLOptionElement).selected).toBe(true);
    const add = within(editor).getByRole("button", { name: "Add member" }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.change(login, { target: { value: "carol" } });
    expect(add.disabled).toBe(false);
    fireEvent.click(add);
    await waitFor(() => expect(add.textContent).toBe("Adding…"));
    expect(add.disabled).toBe(true);
    fireEvent.submit(editor);
    fireEvent.click(share);
    fireEvent.keyDown(login, { key: "Escape" });
    fireEvent.keyDown(list, { key: "Escape" });
    expect(within(list).getByTestId("space-share-group:acme-editor")).toBe(editor);
    expect((within(editor).getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    expect(calls("space.share")).toEqual([{ instance: ORIGIN, group: ACME, login: "carol", role: "30" }]);
    // No account under that login: the host's words in the editor, the
    // login kept.
    replies[0]!.reject(new SpexCommandError("not_found", "Spex Example has no account named carol"));
    await waitFor(() => expect(within(editor).getByRole("alert").textContent).toBe("Spex Example has no account named carol"));
    expect(within(editor).getByRole("button", { name: "Remove @carol from invitation" })).toBeTruthy();
    expect(roles.value).toBe("30");
    expect(add.textContent).toBe("Add member");

    // At Maintainer this time: the reply's members are listed and one
    // line says who was added as what.
    fireEvent.change(roles, { target: { value: "40" } });
    fireEvent.click(add);
    await waitFor(() => expect(calls("space.share")).toHaveLength(2));
    expect(calls("space.share")[1]).toEqual({ instance: ORIGIN, group: ACME, login: "carol", role: "40" });
    replies[1]!.resolve({ members: [...ACME_MEMBERS, member("carol", "Maintainer")] });
    await waitFor(() => expect(within(list).queryByTestId("space-share-group:acme-editor")).toBeNull());
    expect(within(list).getByTestId("space-members-outcome-group:acme").textContent).toBe("@carol added as Maintainer");
    expect(live()).toBe("@carol added as Maintainer");
    expect(within(list).getByTestId("space-member-carol").textContent).toContain("Maintainer");
    await waitFor(() => expect(document.activeElement).toBe(share));
    // The reply is the list: nothing is read again for it.
    expect(calls("space.members")).toHaveLength(1);
  });

  test("a project's invitation names the project and lists the members the reply carries", async () => {
    commandMock.mockImplementation(core);
    await renderGroups(sharingHome(), { open: false });
    const list = await openPlacementMembers(A_SPEX);
    fireEvent.click(within(list).getByTestId(`space-share-${at(A_SPEX)}`));
    const editor = within(list).getByTestId(`space-share-${at(A_SPEX)}-editor`);
    expect(within(editor).getByRole("heading", { name: "Invite to a" })).toBeTruthy();
    fireEvent.change(within(editor).getByLabelText("Usernames"), { target: { value: "@dave" } });
    fireEvent.click(within(editor).getByRole("button", { name: "Add member" }));
    // The fixture's host lists the added account at the role it got.
    await waitFor(() => expect(calls("space.share")).toEqual([{ repository: A_SPEX, instance: ORIGIN, login: "dave", role: "30" }]));
    await waitFor(() => expect(within(list).getByTestId("space-member-dave").textContent).toContain("Developer"));
    expect(within(list).getByTestId(`space-members-outcome-${at(A_SPEX)}`).textContent).toBe("@dave added as Developer");
  });

  test("Escape and Cancel leave the editor, sending nothing, focus on Invite members", async () => {
    commandMock.mockImplementation(core);
    await renderGroups(sharingHome(), { open: false });
    const list = await openGroupMembers("acme");
    const share = within(list).getByTestId("space-share-group:acme");
    fireEvent.click(share);
    fireEvent.keyDown(within(list).getByLabelText("Usernames"), { key: "Escape" });
    expect(within(list).queryByTestId("space-share-group:acme-editor")).toBeNull();
    // The panel itself stays open.
    expect(screen.getByTestId("space-members-group:acme")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(share));
    fireEvent.click(share);
    fireEvent.click(within(list).getByRole("button", { name: "Cancel" }));
    expect(within(list).queryByTestId("space-share-group:acme-editor")).toBeNull();
    expect(calls("space.share")).toEqual([]);
  });

  test("a form submission after disconnection keeps the entry and sends no membership change", async () => {
    commandMock.mockImplementation(core);
    await renderGroups(sharingHome(), { open: false });
    const list = await openGroupMembers("acme");
    fireEvent.click(within(list).getByTestId("space-share-group:acme"));
    const editor = within(list).getByTestId("space-share-group:acme-editor");
    const login = within(editor).getByLabelText("Usernames") as HTMLInputElement;
    fireEvent.change(login, { target: { value: "carol" } });
    act(() => useAppStore.setState({ connection: "closed" }));
    expect((within(editor).getByRole("button", { name: "Add member" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(editor);
    expect(calls("space.share")).toEqual([]);
    expect(login.value).toBe("carol");
  });

  test("Enter, comma and pasted lists stage unique usernames without granting access; removing a chip returns focus", async () => {
    commandMock.mockImplementation(core);
    await renderGroups(sharingHome(), { open: false });
    const list = await openGroupMembers("acme");
    fireEvent.click(within(list).getByTestId("space-share-group:acme"));
    const editor = within(list).getByTestId("space-share-group:acme-editor");
    const login = within(editor).getByLabelText("Usernames") as HTMLInputElement;
    fireEvent.change(login, { target: { value: " @carol " } });
    fireEvent.keyDown(login, { key: "Enter" });
    expect(login.value).toBe("");
    expect(within(editor).getByRole("button", { name: "Remove @carol from invitation" })).toBeTruthy();
    fireEvent.change(login, { target: { value: "dave," } });
    fireEvent.paste(login, { clipboardData: { getData: () => "@carol,  erin\n dave\r\n@frank, erin" } });
    const removals = within(editor).getAllByRole("button", { name: /^Remove @.+ from invitation$/ });
    expect(removals.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Remove @carol from invitation", "Remove @dave from invitation", "Remove @erin from invitation", "Remove @frank from invitation",
    ]);
    expect(calls("space.share")).toEqual([]);
    expect(within(editor).getByRole("button", { name: "Add members" })).toBeTruthy();
    const remove = within(editor).getByRole("button", { name: "Remove @dave from invitation" });
    remove.focus();
    fireEvent.click(remove);
    await waitFor(() => expect(document.activeElement).toBe(login));
    expect(within(editor).queryByRole("button", { name: "Remove @dave from invitation" })).toBeNull();
    expect(calls("space.share")).toEqual([]);
  });

  test("a batch uses one role, includes the draft once, updates the roster sequentially, and retries only failed usernames", async () => {
    const replies: ReturnType<typeof deferred<unknown>>[] = [];
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type !== "space.share") return core(type, fields);
      const reply = deferred<unknown>();
      replies.push(reply);
      return reply.promise;
    });
    await renderGroups(sharingHome(), { open: false });
    const list = await openGroupMembers("acme");
    const share = within(list).getByTestId("space-share-group:acme");
    fireEvent.click(share);
    const editor = within(list).getByTestId("space-share-group:acme-editor");
    const login = within(editor).getByLabelText("Usernames") as HTMLInputElement;
    fireEvent.paste(login, { clipboardData: { getData: () => "carol,dave, @carol" } });
    // A final username need not be committed as a chip before Add.
    fireEvent.change(login, { target: { value: "@erin" } });
    fireEvent.change(within(editor).getByRole("combobox", { name: "Role" }), { target: { value: "40" } });
    fireEvent.click(within(editor).getByRole("button", { name: "Add members" }));
    expect(calls("space.share")).toEqual([{ instance: ORIGIN, group: ACME, login: "carol", role: "40" }]);
    expect(editor.getAttribute("aria-busy")).toBe("true");
    expect(within(editor).getByRole("status").textContent).toBe("Adding 1 of 3…");
    fireEvent.submit(editor);
    fireEvent.keyDown(login, { key: "Enter" });
    expect(calls("space.share")).toHaveLength(1);
    for (const button of within(editor).getAllByRole("button", { name: /^Remove @.+ from invitation$/ })) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
    replies[0]!.resolve({ members: [...ACME_MEMBERS, member("carol", "Maintainer")] });
    await waitFor(() => expect(calls("space.share")).toHaveLength(2));
    expect(within(editor).getByRole("status").textContent).toBe("Adding 2 of 3…");
    expect(within(list).getByTestId("space-member-carol").textContent).toContain("Maintainer");
    replies[1]!.reject(new SpexCommandError("not_found", "Spex Example has no account named dave"));
    await waitFor(() => expect(calls("space.share")).toHaveLength(3));
    expect(within(editor).getByRole("status").textContent).toBe("Adding 3 of 3…");
    replies[2]!.resolve({ members: [...ACME_MEMBERS, member("carol", "Maintainer"), member("erin", "Maintainer")] });
    await waitFor(() => expect(editor.getAttribute("aria-busy")).toBe("false"));
    expect(calls("space.share").map(({ login, role }) => [login, role])).toEqual([["carol", "40"], ["dave", "40"], ["erin", "40"]]);
    expect(within(editor).getAllByRole("button", { name: /^Remove @.+ from invitation$/ }).map((button) => button.getAttribute("aria-label"))).toEqual(["Remove @dave from invitation"]);
    expect(within(editor).getByRole("alert").textContent).toContain("Spex Example has no account named dave");
    expect(within(list).getByTestId("space-member-erin").textContent).toContain("Maintainer");
    expect(within(list).getByTestId("space-members-outcome-group:acme").textContent).toBe("2 members added; 1 still to add.");
    await waitFor(() => expect(document.activeElement).toBe(login));
    fireEvent.click(within(editor).getByRole("button", { name: "Add member" }));
    await waitFor(() => expect(calls("space.share")).toHaveLength(4));
    expect(calls("space.share")[3]).toEqual({ instance: ORIGIN, group: ACME, login: "dave", role: "40" });
    replies[3]!.resolve({ members: [...ACME_MEMBERS, member("carol", "Maintainer"), member("erin", "Maintainer"), member("dave", "Maintainer")] });
    await waitFor(() => expect(within(list).queryByTestId("space-share-group:acme-editor")).toBeNull());
    expect(within(list).getByTestId("space-member-dave")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(share));
  });

  test("losing the connection between additions preserves unsent usernames and resumes only on explicit retry", async () => {
    const replies: ReturnType<typeof deferred<unknown>>[] = [];
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type !== "space.share") return core(type, fields);
      const reply = deferred<unknown>();
      replies.push(reply);
      return reply.promise;
    });
    await renderGroups(sharingHome(), { open: false });
    const list = await openGroupMembers("acme");
    fireEvent.click(within(list).getByTestId("space-share-group:acme"));
    const editor = within(list).getByTestId("space-share-group:acme-editor");
    const login = within(editor).getByLabelText("Usernames") as HTMLInputElement;
    fireEvent.paste(login, { clipboardData: { getData: () => "carol,dave,erin" } });
    fireEvent.submit(editor);
    expect(calls("space.share")).toHaveLength(1);
    act(() => useAppStore.setState({ connection: "closed" }));
    replies[0]!.resolve({ members: [...ACME_MEMBERS, member("carol", "Developer")] });
    await waitFor(() => expect(editor.getAttribute("aria-busy")).toBe("false"));
    expect(calls("space.share")).toHaveLength(1);
    expect(within(list).getByTestId("space-member-carol")).toBeTruthy();
    expect(within(editor).getAllByRole("button", { name: /^Remove @.+ from invitation$/ }).map((button) => button.getAttribute("aria-label"))).toEqual(["Remove @dave from invitation", "Remove @erin from invitation"]);
    expect((within(editor).getByRole("button", { name: "Add members" }) as HTMLButtonElement).disabled).toBe(true);
    act(() => useAppStore.setState({ connection: "open" }));
    expect(calls("space.share")).toHaveLength(1);
    fireEvent.submit(editor);
    await waitFor(() => expect(calls("space.share")).toHaveLength(2));
    expect(calls("space.share")[1]?.login).toBe("dave");
    replies[1]!.resolve({ members: [...ACME_MEMBERS, member("carol", "Developer"), member("dave", "Developer")] });
    await waitFor(() => expect(calls("space.share")).toHaveLength(3));
    expect(calls("space.share")[2]?.login).toBe("erin");
    replies[2]!.resolve({ members: [...ACME_MEMBERS, member("carol", "Developer"), member("dave", "Developer"), member("erin", "Developer")] });
    await waitFor(() => expect(within(list).queryByTestId("space-share-group:acme-editor")).toBeNull());
    expect(within(list).getByTestId("space-members-outcome-group:acme").textContent).toBe("2 members added as Developer");
  });

  test("multiple failures identify each retained username and its own cause", async () => {
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type === "space.share") throw new SpexCommandError("invalid_request", fields?.login === "carol" ? "Access denied" : "No account found");
      return core(type, fields);
    });
    await renderGroups(sharingHome(), { open: false });
    const list = await openGroupMembers("acme");
    fireEvent.click(within(list).getByTestId("space-share-group:acme"));
    const editor = within(list).getByTestId("space-share-group:acme-editor");
    fireEvent.paste(within(editor).getByLabelText("Usernames"), { clipboardData: { getData: () => "carol,dave" } });
    fireEvent.submit(editor);
    const error = await within(editor).findByRole("alert");
    expect(error.textContent).toContain("@carol: Access denied");
    expect(error.textContent).toContain("@dave: No account found");
    expect(within(editor).getAllByRole("button", { name: /^Remove @.+ from invitation$/ })).toHaveLength(2);
    expect(calls("space.share").map(({ login }) => login)).toEqual(["carol", "dave"]);
    fireEvent.click(within(editor).getByRole("button", { name: "Cancel" }));
    expect(within(list).getByTestId("space-members-outcome-group:acme")).toBeTruthy();
    fireEvent.click(within(list).getByTestId("space-share-group:acme"));
    expect(within(list).queryByTestId("space-members-outcome-group:acme")).toBeNull();
    expect(within(list).queryByRole("alert")).toBeNull();
  });

  test("Refresh preserves the active invitation while reading members again", async () => {
    const reread = deferred<unknown>();
    let memberReads = 0;
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type === "space.members" && ++memberReads > 1) return reread.promise;
      return core(type, fields);
    });
    await renderGroups(sharingHome(), { open: false });
    const list = await openGroupMembers("acme");
    fireEvent.click(within(list).getByTestId("space-share-group:acme"));
    const editor = within(list).getByTestId("space-share-group:acme-editor");
    const login = within(editor).getByLabelText("Usernames") as HTMLInputElement;
    fireEvent.change(login, { target: { value: "carol," } });
    fireEvent.change(login, { target: { value: "dave" } });
    fireEvent.click(screen.getByTestId("space-refresh"));
    await waitFor(() => expect(calls("space.members")).toHaveLength(2));
    expect(within(list).getByTestId("space-share-group:acme-editor")).toBe(editor);
    expect(within(editor).getByRole("button", { name: "Remove @carol from invitation" })).toBeTruthy();
    expect(login.value).toBe("dave");
    // Cancel during the unresolved read returns to the still-mounted
    // invitation action, without stranding keyboard focus.
    fireEvent.click(within(editor).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(document.activeElement).toBe(within(list).getByTestId("space-share-group:acme")));
    fireEvent.click(within(list).getByTestId("space-share-group:acme"));
    const reopened = within(list).getByTestId("space-share-group:acme-editor");
    const freshLogin = within(reopened).getByLabelText("Usernames") as HTMLInputElement;
    fireEvent.change(freshLogin, { target: { value: "erin" } });
    reread.resolve({ members: ACME_MEMBERS });
    await within(list).findByTestId("space-member-jane");
    expect(within(list).getByTestId("space-share-group:acme-editor")).toBe(reopened);
    expect(freshLogin.value).toBe("erin");
    expect(calls("space.share")).toEqual([]);
  });

  test("an already-open removal confirmation cannot interrupt an invitation batch", async () => {
    const pending = deferred<unknown>();
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type === "space.share") return fields?.login === "carol" ? pending.promise : { members: [...ACME_MEMBERS, member("carol", "Developer"), member("dave", "Developer")] };
      return core(type, fields);
    });
    await renderGroups(sharingHome(), { open: false });
    const list = await openGroupMembers("acme");
    fireEvent.click(within(list).getByTestId("space-member-remove-bob"));
    const confirmation = within(list).getByTestId("space-member-confirm-bob");
    const remove = within(confirmation).getByRole("button", { name: "Remove" }) as HTMLButtonElement;
    fireEvent.click(within(list).getByTestId("space-share-group:acme"));
    const editor = within(list).getByTestId("space-share-group:acme-editor");
    fireEvent.paste(within(editor).getByLabelText("Usernames"), { clipboardData: { getData: () => "carol,dave" } });
    fireEvent.submit(editor);
    expect(remove.disabled).toBe(true);
    fireEvent.click(remove);
    expect(calls("space.unshare")).toEqual([]);
    pending.resolve({ members: [...ACME_MEMBERS, member("carol", "Developer")] });
    await waitFor(() => expect(within(list).queryByTestId("space-share-group:acme-editor")).toBeNull());
    expect(remove.disabled).toBe(false);
    expect(calls("space.unshare")).toEqual([]);
  });

  test("leaving the panel while an addition is pending sends no later usernames", async () => {
    const pending = deferred<unknown>();
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) =>
      type === "space.share" ? pending.promise : core(type, fields));
    const { view } = await renderGroups(sharingHome(), { open: false });
    const list = await openGroupMembers("acme");
    fireEvent.click(within(list).getByTestId("space-share-group:acme"));
    const editor = within(list).getByTestId("space-share-group:acme-editor");
    fireEvent.paste(within(editor).getByLabelText("Usernames"), { clipboardData: { getData: () => "carol,dave" } });
    fireEvent.submit(editor);
    expect(calls("space.share").map(({ login }) => login)).toEqual(["carol"]);
    view.unmount();
    await act(async () => {
      pending.resolve({ members: [...ACME_MEMBERS, member("carol", "Developer")] });
      await pending.promise;
    });
    expect(calls("space.share").map(({ login }) => login)).toEqual(["carol"]);
  });
});

describe("GROUPS: Remove (space-72, space-29)", () => {
  test("Remove asks inline with Keep focused, Escape keeping; Removing… until the reply; a refusal on the row, the member kept; a success listing the reply", async () => {
    const replies: ReturnType<typeof deferred<unknown>>[] = [];
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type !== "space.unshare") return core(type, fields);
      const reply = deferred<unknown>();
      replies.push(reply);
      return reply.promise;
    });
    await renderGroups(sharingHome(), { open: false });
    const list = await openGroupMembers("acme");
    const bob = () => within(list).getByTestId("space-member-bob");
    const remove = () => within(bob()).getByTestId("space-member-remove-bob") as HTMLButtonElement;

    fireEvent.click(remove());
    const confirm = within(bob()).getByTestId("space-member-confirm-bob");
    expect(confirm.textContent).toContain("Remove @bob from acme?");
    expect(document.activeElement?.textContent).toBe("Keep");
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(within(bob()).queryByTestId("space-member-confirm-bob")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(remove()));
    fireEvent.click(remove());
    fireEvent.click(within(bob()).getByRole("button", { name: "Keep" }));
    expect(calls("space.unshare")).toEqual([]);

    fireEvent.click(remove());
    fireEvent.click(within(within(bob()).getByTestId("space-member-confirm-bob")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(remove().textContent).toBe("Removing…"));
    expect(remove().disabled).toBe(true);
    const ownerMore = screen.getByTestId("space-group-more-acme") as HTMLButtonElement;
    const close = within(list).getByRole("button", { name: "Close" }) as HTMLButtonElement;
    expect(ownerMore.disabled).toBe(true);
    expect(close.disabled).toBe(true);
    fireEvent.click(ownerMore);
    fireEvent.click(close);
    fireEvent.keyDown(list, { key: "Escape" });
    expect(screen.getByTestId("space-members-group:acme")).toBe(list);
    expect(calls("space.unshare")).toEqual([{ instance: ORIGIN, group: ACME, login: "bob" }]);
    replies[0]!.reject(new SpexCommandError("invalid_request", "Spex Example refused: 403 Forbidden"));
    await waitFor(() => expect(within(bob()).getByRole("alert").textContent).toBe("Spex Example refused: 403 Forbidden"));
    expect(remove().textContent).toBe("Remove");
    await waitFor(() => {
      expect(ownerMore.disabled).toBe(false);
      expect(close.disabled).toBe(false);
    });
    await waitFor(() => expect(document.activeElement).toBe(remove()));

    fireEvent.click(remove());
    fireEvent.click(within(within(bob()).getByTestId("space-member-confirm-bob")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(calls("space.unshare")).toHaveLength(2));
    replies[1]!.resolve({ members: [ACME_MEMBERS[0]!] });
    await waitFor(() => expect(within(list).queryByTestId("space-member-bob")).toBeNull());
    expect(within(list).getByTestId("space-members-outcome-group:acme").textContent).toBe("@bob removed");
    expect(live()).toBe("@bob removed");
    // The row is gone; focus stays in the panel.
    await waitFor(() => expect(document.activeElement).toBe(within(list).getByTestId("space-share-group:acme")));
  });

  test("a repository's Remove names the repository", async () => {
    commandMock.mockImplementation(core);
    await renderGroups(sharingHome(), { open: false });
    const list = await openPlacementMembers(A_SPEX);
    fireEvent.click(within(list).getByRole("button", { name: "Remove @bob" }));
    // The project is named as its row names it, its `-spex` dropped
    // (space-1, DR-159).
    expect(within(list).getByTestId("space-member-confirm-bob").textContent).toContain("Remove @bob from a?");
    fireEvent.click(within(within(list).getByTestId("space-member-confirm-bob")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(calls("space.unshare")).toEqual([{ repository: A_SPEX, instance: ORIGIN, login: "bob" }]));
  });
});

describe("GROUPS: what the IDE no longer offers (space-1, DR-172)", () => {
  test("headings expose permitted creation and deletion but no rename, and no row or line moves a project", async () => {
    commandMock.mockImplementation(core);
    await renderGroups(sharingHome(), { open: false });
    for (const path of ["acme", "other", "empty"]) {
      expect(groupMenu(path), path).toEqual([
        `space-group-members-${path}`,
        ...(path === "other" ? [] : [`space-group-create-${path}`]),
        ...(path === "other" ? [] : [`space-group-delete-${path}`]),
      ]);
    }
    expect(screen.queryByText("New subgroup")).toBeNull();
    // The row's More holds Sync now, Members and Explore records, its
    // line Members alone (space-1, space-87).
    expect(within(openMore(`space-row-more-${A_SPEX}`)).getAllByRole("menuitem").map((item) => item.dataset.testid)).toEqual([
      `space-row-sync-${A_SPEX}`,
      `space-row-members-${A_SPEX}`,
      `space-row-explore-${A_SPEX}`,
    ]);
    closeMenus();
    expect(within(lineOf(A_SPEX)).queryByTestId("space-line-move")).toBeNull();
    expect(calls("space.group.rename")).toEqual([]);
    expect(calls("space.group.delete")).toEqual([]);
    expect(calls("space.repository.move")).toEqual([]);
  });
});

describe("GROUPS: the new controls fit (space-28)", () => {
  test("every new control reads at most 14 characters, its busy form included, and a heading's controls keep their names", async () => {
    const addition = deferred<unknown>();
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) =>
      type === "space.share" ? addition.promise : type === "space.group.create" || type === "space.unshare" ? new Promise(() => {}) : core(type, fields),
    );
    await renderGroups(sharingHome(), { open: false });
    const seen = new Set<string>();
    const measure = () => {
      for (const button of screen.getAllByRole("button")) {
        // A row is a list row whose words are its own (space-28).
        const id = button.dataset.testid ?? "";
        if (id.startsWith("space-repo-")) continue;
        const text = (button.textContent ?? "").trim();
        seen.add(text);
        if (text !== "Invite members…") expect(text.length, `"${text}"`).toBeLessThanOrEqual(14);
        expect((button.getAttribute("aria-label") ?? text).length, id).toBeGreaterThan(0);
      }
    };
    // A menu's entries carry their full words, the budget being the
    // row's and the heading's (space-28, DR-159): what a "More" holds
    // is read apart, by its own names.
    const entries = new Set<string>();
    const hold = (menu: HTMLElement) => {
      for (const item of within(menu).getAllByRole("menuitem")) entries.add((item.firstElementChild?.textContent ?? "").trim());
    };
    // Idle forms, then each editor and confirm open, then busy forms.
    fireEvent.click(screen.getByTestId("space-new-group"));
    hold(openMore("space-group-more-acme"));
    closeMenus();
    hold(openMore(`space-row-more-${A_SPEX}`));
    closeMenus();
    const list = await openGroupMembers("acme");
    fireEvent.click(within(list).getByTestId("space-share-group:acme"));
    fireEvent.click(within(list).getByTestId("space-member-remove-bob"));
    measure();
    fireEvent.change(within(screen.getByTestId("space-new-group-editor")).getByLabelText("Group name"), { target: { value: "Workshop" } });
    fireEvent.click(within(screen.getByTestId("space-new-group-editor")).getByRole("button", { name: "Create" }));
    fireEvent.change(within(list).getByLabelText("Usernames"), { target: { value: "carol" } });
    fireEvent.click(within(list).getByRole("button", { name: "Add member" }));
    await within(list).findByRole("button", { name: "Adding…" });
    measure();
    // Membership writes are serialized; measure removal only after the
    // invitation has completed.
    addition.resolve({ members: [...ACME_MEMBERS, member("carol", "Developer")] });
    await waitFor(() => expect(within(list).queryByTestId("space-share-group:acme-editor")).toBeNull());
    fireEvent.click(within(within(list).getByTestId("space-member-confirm-bob")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(within(list).getByTestId("space-member-remove-bob").textContent).toBe("Removing…"));
    measure();
    for (const label of ["New group…", "Invite members…", "Create", "Creating…", "Add member", "Adding…", "Cancel", "Remove", "Removing…", "Keep", "⋯More"]) {
      expect(seen, label).toContain(label);
    }
    for (const label of ["Members", "Sync now", "Explore records"]) {
      expect(entries, label).toContain(label);
    }

    // A group is a container; its "More" keeps its name at every width,
    // as a placement line's Members shows its mark below @md and keeps
    // its name; the panel's names truncate (DR-041).
    const acme = screen.getByTestId("space-group-acme");
    expect(acme.className.split(/\s+/)).toContain("@container");
    expect(screen.getByTestId("space-group-more-acme").getAttribute("aria-label")).toBe("More for acme");
    const members = within(lineOf(A_SPEX)).getByTestId("space-line-members");
    expect(members.getAttribute("aria-label")).toBe("Members");
    expect(members.querySelector("svg")?.getAttribute("class")).toContain("@md:hidden");
    expect(members.querySelector("span")?.className).toContain("@md:inline");
    expect(list.className.split(/\s+/)).toContain("@container");
    const name = within(within(list).getByTestId("space-member-jane")).getByText("jane");
    expect(name.className).toContain("min-w-0");
    expect(name.className).toContain("truncate");
  });

  test("in Chinese the controls kept read the catalog's words", async () => {
    activateLanguage("zh");
    commandMock.mockImplementation(core);
    await renderGroups(sharingHome(), { open: false });
    expect(screen.getByTestId("space-new-group").textContent).toBe("新建群组…");
    expect(screen.getByTestId("space-group-more-acme").getAttribute("aria-label")).toBe("acme 的更多操作");
    expect(groupAct("acme", "members")!.textContent).toBe("成员");
    closeMenus();
    const list = await openGroupMembers("acme");
    const share = within(list).getByTestId("space-share-group:acme");
    expect(share.textContent).toBe("邀请成员…");
    expect(list.querySelector("a")).toBeNull();
  });
});
