// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Groups and sharing through the Space surface over a mocked client
// (space-70, DR-114, DR-127, DR-159, DR-172): each act stands exactly
// where the Space's last read says the person may take it (space-1,
// space-62) — "New group" on the Space's heading, disabled and titled
// "Made by the people who run <display name>" where it may not, Members
// alone in a group's heading's one "More", Share and Remove in a members
// panel — the group editor (space-68), Share (space-69), Remove
// (space-72), and the label budget the fit rests on (space-28); no link
// to a page of the Space anywhere (DR-120); and renaming, deleting, a
// group inside a group and moving a project not offered (DR-172). A spex
// repository's Members, Share and Remove act on its placement at the
// fixtures' Space, named in each command (DR-128). Each act is checked
// by the command it sends.

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { GroupsState, HostMemberInfo, RepositoryState } from "@sublang/spex-core/protocol";

import { activateLanguage } from "../i18n.js";
import { SpexCommandError } from "../lib/client.js";
import { setClientForTests } from "../state/store.js";
import {
  BRANCH,
  ORIGIN,
  OWN_REPO,
  SECOND,
  answer,
  base,
  calls,
  commandMock,
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
  test("space-70, space-1: New group stands on the instance's heading; each group's heading carries Members alone, Personal's none", async () => {
    commandMock.mockImplementation(core);
    await renderGroups(sharingHome(), { open: false });
    const head = screen.getByTestId("space-new-group");
    expect(head.textContent).toBe("New group");
    expect(within(screen.getByTestId(`space-instance-${ORIGIN}`)).getByTestId("space-instance-heading").contains(head)).toBe(true);
    // acme: its heading's one "More", outside the heading, holds Members
    // alone, whatever else the Space lets the person do there (space-1,
    // DR-172).
    const acme = region("acme");
    const more = within(acme).getByTestId("space-group-more-acme");
    expect(more.getAttribute("aria-label")).toBe("More for acme");
    expect(within(acme).getByRole("heading", { level: 3 }).contains(more)).toBe(false);
    expect(groupAct("acme", "members")!.textContent).toBe("Members");
    closeMenus();
    expect(groupMenu("acme")).toEqual(["space-group-members-acme"]);
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
    // Share stands in a members panel only, never on a heading.
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();

    // acme's members panel: its own members, Share, and Remove on each.
    const acmeList = await openGroupMembers("acme");
    expect(calls("space.members")).toEqual([{ instance: ORIGIN, group: ACME }]);
    expect(within(acmeList).getByTestId("space-share-group:acme").textContent).toBe("Share");
    expect(within(acmeList).getAllByRole("button", { name: /^Remove @/ }).map((button) => button.getAttribute("aria-label"))).toEqual([
      "Remove @jane",
      "Remove @bob",
    ]);
    // No page of the host is linked (space-62, DR-120).
    expect(acmeList.querySelector("a")).toBeNull();

    // other's panel lists its members with no Share and no Remove.
    const otherList = await openGroupMembers("other");
    expect(calls("space.members")[1]).toEqual({ instance: ORIGIN, group: OTHER });
    expect(within(otherList).queryByRole("button", { name: "Share" })).toBeNull();
    expect(within(otherList).queryByRole("button", { name: /Remove/ })).toBeNull();
    expect(otherList.querySelector("a")).toBeNull();
  });

  test("a-spex's panel carries Share and Remove on its own members, an inherited one reading via its group; b-spex's carries neither", async () => {
    commandMock.mockImplementation(core);
    await renderGroups(sharingHome(), { open: false });
    const a = await openPlacementMembers(A_SPEX);
    expect(calls("space.members")).toEqual([{ repository: A_SPEX, instance: ORIGIN }]);
    expect(within(a).getByTestId(`space-share-${at(A_SPEX)}`).textContent).toBe("Share");
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
    expect(within(b).queryByRole("button", { name: "Share" })).toBeNull();
    expect(within(b).queryByRole("button", { name: /Remove/ })).toBeNull();

    // Your own group's repositories share what is there where the host
    // allows (DR-114).
    const own = await openPlacementMembers(OWN);
    expect(within(own).getByTestId(`space-share-${at(OWN)}`)).toBeTruthy();
  });

  test("space-70, space-1: where the instance's read says no group may be created, New group stands disabled, titled who makes groups, with no link; neither before a read is held", async () => {
    const refused = sharingHome({ canCreateGroup: false });
    await renderGroups(refused, { open: false });
    const create = screen.getByTestId("space-new-group") as HTMLButtonElement;
    // The reason is the control's title, no sentence beside it (DR-069,
    // DR-172).
    expect(create.disabled).toBe(true);
    expect(create.title).toBe("Made by the people who run Spex Example");
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
    expect(within(editor).getByLabelText("Login at Second Example")).toBeTruthy();
    expect(within(within(editor).getByRole("listbox", { name: "Role" })).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Viewer",
      "Editor",
    ]);
    // Its heading's More holds Members alone there too (DR-172).
    expect(groupMenu("acme", secondSection)).toEqual(["space-group-members-acme"]);
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
});

describe("GROUPS: Share (space-69, space-29)", () => {
  test("Share on acme: the login at the host, the host's roles in its order with Developer chosen, Adding… until the reply, a not-found kept in place, a success saying who was added", async () => {
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
    expect(share.getAttribute("aria-expanded")).toBe("true");
    const editor = within(list).getByTestId("space-share-group:acme-editor");
    const login = within(editor).getByLabelText("Login at Spex Example") as HTMLInputElement;
    expect(document.activeElement).toBe(login);
    const roles = within(editor).getByRole("listbox", { name: "Role" }) as HTMLSelectElement;
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
    const add = within(editor).getByRole("button", { name: "Add" }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.change(login, { target: { value: "carol" } });
    expect(add.disabled).toBe(false);
    fireEvent.click(add);
    await waitFor(() => expect(add.textContent).toBe("Adding…"));
    expect(add.disabled).toBe(true);
    fireEvent.keyDown(login, { key: "Enter" });
    expect(calls("space.share")).toEqual([{ instance: ORIGIN, group: ACME, login: "carol", role: "30" }]);
    // No account under that login: the host's words in the editor, the
    // login kept.
    replies[0]!.reject(new SpexCommandError("not_found", "Spex Example has no account named carol"));
    await waitFor(() => expect(within(editor).getByRole("alert").textContent).toBe("Spex Example has no account named carol"));
    expect(login.value).toBe("carol");
    expect(add.textContent).toBe("Add");

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

  test("Share in a-spex's members panel names the repository and lists the members the reply carries", async () => {
    commandMock.mockImplementation(core);
    await renderGroups(sharingHome(), { open: false });
    const list = await openPlacementMembers(A_SPEX);
    fireEvent.click(within(list).getByTestId(`space-share-${at(A_SPEX)}`));
    const editor = within(list).getByTestId(`space-share-${at(A_SPEX)}-editor`);
    fireEvent.change(within(editor).getByLabelText("Login at Spex Example"), { target: { value: "@dave" } });
    fireEvent.click(within(editor).getByRole("button", { name: "Add" }));
    // The fixture's host lists the added account at the role it got.
    await waitFor(() => expect(calls("space.share")).toEqual([{ repository: A_SPEX, instance: ORIGIN, login: "dave", role: "30" }]));
    await waitFor(() => expect(within(list).getByTestId("space-member-dave").textContent).toContain("Developer"));
    expect(within(list).getByTestId(`space-members-outcome-${at(A_SPEX)}`).textContent).toBe("@dave added as Developer");
  });

  test("Escape and Cancel leave the editor, sending nothing, focus on Share", async () => {
    commandMock.mockImplementation(core);
    await renderGroups(sharingHome(), { open: false });
    const list = await openGroupMembers("acme");
    const share = within(list).getByTestId("space-share-group:acme");
    fireEvent.click(share);
    fireEvent.keyDown(within(list).getByLabelText("Login at Spex Example"), { key: "Escape" });
    expect(within(list).queryByTestId("space-share-group:acme-editor")).toBeNull();
    // The panel itself stays open.
    expect(screen.getByTestId("space-members-group:acme")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(share));
    fireEvent.click(share);
    fireEvent.click(within(list).getByRole("button", { name: "Cancel" }));
    expect(within(list).queryByTestId("space-share-group:acme-editor")).toBeNull();
    expect(calls("space.share")).toEqual([]);
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
    expect(calls("space.unshare")).toEqual([{ instance: ORIGIN, group: ACME, login: "bob" }]);
    replies[0]!.reject(new SpexCommandError("invalid_request", "Spex Example refused: 403 Forbidden"));
    await waitFor(() => expect(within(bob()).getByRole("alert").textContent).toBe("Spex Example refused: 403 Forbidden"));
    expect(remove().textContent).toBe("Remove");
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
  test("no heading offers a group inside it, a rename or a delete, and no row or line moves a project to another group", async () => {
    commandMock.mockImplementation(core);
    await renderGroups(sharingHome(), { open: false });
    for (const path of ["acme", "other", "empty"]) {
      expect(groupMenu(path), path).toEqual([`space-group-members-${path}`]);
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
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) =>
      type === "space.group.create" || type === "space.share" || type === "space.unshare" ? new Promise(() => {}) : core(type, fields),
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
        expect(text.length, `"${text}"`).toBeLessThanOrEqual(14);
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
    fireEvent.change(within(list).getByLabelText("Login at Spex Example"), { target: { value: "carol" } });
    fireEvent.click(within(list).getByRole("button", { name: "Add" }));
    fireEvent.click(within(within(list).getByTestId("space-member-confirm-bob")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(within(list).getByTestId("space-member-remove-bob").textContent).toBe("Removing…"));
    measure();
    for (const label of ["New group", "Share", "Create", "Creating…", "Add", "Adding…", "Cancel", "Remove", "Removing…", "Keep", "⋯More"]) {
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
    expect(screen.getByTestId("space-new-group").textContent).toBe("新建群组");
    expect(screen.getByTestId("space-group-more-acme").getAttribute("aria-label")).toBe("acme 的更多操作");
    expect(groupAct("acme", "members")!.textContent).toBe("成员");
    closeMenus();
    const list = await openGroupMembers("acme");
    const share = within(list).getByTestId("space-share-group:acme");
    expect(share.textContent).toBe("共享");
    expect(list.querySelector("a")).toBeNull();
  });
});
