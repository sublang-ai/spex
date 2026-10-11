// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Groups and sharing through the Groups surface over a mocked client
// (space-70, DR-114): each act stands exactly where the host's last
// read says the person may take it (space-1, space-62) — "New group"
// at the list's head, Members and "New subgroup" on a group's heading,
// Share and Remove in a members panel — the group editor (space-68),
// Share (space-69), Remove (space-72), and the label budget the fit
// rests on (space-28). Each act is checked by the command it sends.

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { GroupsState, HostMemberInfo, RepositoryState } from "@sublang/spex-core/protocol";

import { activateLanguage } from "../i18n.js";
import { SpexCommandError } from "../lib/client.js";
import { setClientForTests } from "../state/store.js";
import {
  OWN_REPO,
  answer,
  base,
  calls,
  commandMock,
  deliver,
  installClient,
  live,
  renderGroups,
  repo,
} from "../fixtures/groups.js";

beforeEach(installClient);

afterEach(() => {
  cleanup();
  activateLanguage("en");
  setClientForTests(undefined);
});

const ACME = "3";
const OTHER = "4";
const A_SPEX = "acme/a-spex";
const B_SPEX = "other/b-spex";
const OWN = OWN_REPO.key;

const member = (login: string, role: string, via: string | null = null, displayName: string | null = null): HostMemberInfo => ({
  id: `u-${login}`,
  login,
  displayName,
  role,
  url: null,
  direct: via === null,
  via,
});

/** acme's own members, as the host lists them. */
const ACME_MEMBERS = [member("jane", "Owner", null, "Jane"), member("bob", "Developer")];
/** a-spex's: jane through acme, bob its own. */
const A_MEMBERS = [member("jane", "Owner", "acme", "Jane"), member("bob", "Developer")];
const ACME_URL = "https://gitlab.example/groups/acme/-/group_members";
const A_URL = "https://gitlab.example/acme/a-spex/-/project_members";

/** The host's read: the person may create a group, may create a
 * subgroup in acme and manage its members, may do neither in other,
 * and may manage a-spex's members but not b-spex's. Your own group's
 * flags are set too, to show its heading ignores them. */
function sharingHome(over: { canCreateGroup?: boolean } = {}): GroupsState {
  const home = base();
  const repository = (key: string, id: string, manage: boolean): RepositoryState =>
    repo({ key, name: key.split("/").pop()!, id, code: null, folder: null, can: { manageMembers: manage } });
  return {
    ...home,
    account: { ...home.account!, canCreateGroup: over.canCreateGroup ?? true },
    groups: [
      {
        ...home.groups[0]!,
        can: { createSubgroup: true, manageMembers: true },
        repositories: [{ ...OWN_REPO, can: { manageMembers: true } }],
      },
      {
        id: ACME,
        fullPath: "acme",
        name: "acme",
        url: "https://gitlab.example/acme",
        own: false,
        can: { createSubgroup: true, manageMembers: true },
        repositories: [repository(A_SPEX, "60", true)],
      },
      {
        id: OTHER,
        fullPath: "other",
        name: "other",
        url: "https://gitlab.example/other",
        own: false,
        can: { createSubgroup: false, manageMembers: false },
        repositories: [repository(B_SPEX, "61", false)],
      },
    ],
  };
}

/** The core's answers with each target's members. */
async function core(type: string, fields: Record<string, unknown> = {}): Promise<unknown> {
  if (type === "space.members") {
    if (fields.group === ACME) return { members: ACME_MEMBERS, membersUrl: ACME_URL };
    if (fields.repository === A_SPEX) return { members: A_MEMBERS, membersUrl: A_URL };
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
const panel = (id: string) => screen.getByTestId(`space-members-${id}`);

async function openGroupMembers(path: string): Promise<HTMLElement> {
  fireEvent.click(screen.getByTestId(`space-group-members-${path}`));
  const list = await screen.findByTestId(`space-members-group:${path}`);
  await within(list).findByTestId(`space-members-link-group:${path}`);
  return list;
}

async function openRowMembers(key: string): Promise<HTMLElement> {
  fireEvent.click(screen.getByTestId(`space-row-members-${key}`));
  const list = await screen.findByTestId(`space-members-${key}`);
  await within(list).findByTestId(`space-members-link-${key}`);
  return list;
}

describe("GROUPS: each act where the host's read says (space-1, space-62)", () => {
  test("New group heads the list; acme's heading carries Members and New subgroup, other's Members alone, your own group's neither", async () => {
    commandMock.mockImplementation(core);
    await renderGroups(sharingHome(), { open: false });
    const list = screen.getByTestId("space-groups");
    const head = screen.getByTestId("space-new-group");
    expect(head.textContent).toBe("New group");
    expect(list.firstElementChild?.contains(head)).toBe(true);
    // acme: Members and New subgroup beside its heading, outside it.
    const acme = region("acme");
    expect(within(acme).getByTestId("space-group-members-acme").getAttribute("aria-label")).toBe("Members");
    expect(within(acme).getByTestId("space-group-subgroup-acme").textContent).toBe("New subgroup");
    expect(within(acme).getByRole("heading", { level: 2 }).textContent).toBe("acme");
    // other: the host lets the person do neither, so nothing but Members.
    const other = region("other");
    expect(within(other).getByTestId("space-group-members-other")).toBeTruthy();
    expect(within(other).queryByTestId("space-group-subgroup-other")).toBeNull();
    // Your own group's heading carries neither, whatever the flags say.
    const own = region("Your own group");
    expect(within(own).queryByTestId("space-group-members-jane")).toBeNull();
    expect(within(own).queryByTestId("space-group-subgroup-jane")).toBeNull();
    // Share stands in a members panel only, never on a heading.
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();

    // acme's members panel: its own members, Share, and Remove on each.
    const acmeList = await openGroupMembers("acme");
    expect(calls("space.members")).toEqual([{ group: ACME }]);
    expect(within(acmeList).getByTestId("space-share-group:acme").textContent).toBe("Share");
    expect(within(acmeList).getAllByRole("button", { name: /^Remove @/ }).map((button) => button.getAttribute("aria-label"))).toEqual([
      "Remove @jane",
      "Remove @bob",
    ]);
    const link = within(acmeList).getByTestId("space-members-link-group:acme") as HTMLAnchorElement;
    expect(link.textContent).toBe("Open at gitlab.example");
    expect(link.href).toBe(ACME_URL);

    // other's panel lists its members with no Share and no Remove.
    const otherList = await openGroupMembers("other");
    expect(calls("space.members")[1]).toEqual({ group: OTHER });
    expect(within(otherList).queryByRole("button", { name: "Share" })).toBeNull();
    expect(within(otherList).queryByRole("button", { name: /Remove/ })).toBeNull();
    expect(within(otherList).getByTestId("space-members-link-group:other").textContent).toBe("Open at gitlab.example");
  });

  test("a-spex's panel carries Share and Remove on its own members, an inherited one reading via its group; b-spex's carries neither", async () => {
    commandMock.mockImplementation(core);
    await renderGroups(sharingHome(), { open: false });
    const a = await openRowMembers(A_SPEX);
    expect(calls("space.members")).toEqual([{ repository: A_SPEX }]);
    expect(within(a).getByTestId(`space-share-${A_SPEX}`).textContent).toBe("Share");
    // jane comes through acme: "via acme", and no Remove here.
    const jane = within(a).getByTestId("space-member-jane");
    expect(within(jane).getByTestId("space-member-via-jane").textContent).toBe("via acme");
    expect(jane.textContent).toContain("Owner");
    expect(within(jane).queryByRole("button")).toBeNull();
    const bob = within(a).getByTestId("space-member-bob");
    expect(within(bob).queryByTestId("space-member-via-bob")).toBeNull();
    expect(within(bob).getByRole("button", { name: "Remove @bob" }).textContent).toBe("Remove");

    const b = await openRowMembers(B_SPEX);
    expect(calls("space.members")[1]).toEqual({ repository: B_SPEX });
    expect(within(b).queryByRole("button", { name: "Share" })).toBeNull();
    expect(within(b).queryByRole("button", { name: /Remove/ })).toBeNull();

    // Your own group's repositories share what is there where the host
    // allows (DR-114).
    const own = await openRowMembers(OWN);
    expect(within(own).getByTestId(`space-share-${OWN}`)).toBeTruthy();
  });

  test("nothing stands for an act the host does not let the person take, nor before sign-in", async () => {
    await renderGroups(sharingHome({ canCreateGroup: false }), { open: false });
    expect(screen.queryByTestId("space-new-group")).toBeNull();
    cleanup();
    const out = sharingHome();
    await renderGroups({ ...out, account: null, readAt: null }, { open: false });
    expect(screen.queryByTestId("space-new-group")).toBeNull();
    expect(screen.queryByTestId("space-group-members-acme")).toBeNull();
    expect(screen.queryByTestId("space-group-subgroup-acme")).toBeNull();
  });
});

describe("GROUPS: New group and New subgroup (space-68)", () => {
  test("New subgroup opens the editor in place: the path following the name until edited, Create disabled until both hold text, Escape closing, Creating… until the reply, a refusal kept, a success closing", async () => {
    const replies: ReturnType<typeof deferred<unknown>>[] = [];
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type !== "space.group.create") return core(type, fields);
      const reply = deferred<unknown>();
      replies.push(reply);
      return reply.promise;
    });
    await renderGroups(sharingHome(), { open: false });
    const control = screen.getByTestId("space-group-subgroup-acme");
    fireEvent.click(control);
    expect(control.getAttribute("aria-expanded")).toBe("true");
    const editor = screen.getByTestId("space-subgroup-acme");
    const field = within(editor).getByLabelText("Group name") as HTMLInputElement;
    const pathField = within(editor).getByLabelText("Path") as HTMLInputElement;
    expect(document.activeElement).toBe(field);
    expect(pathField.value).toBe("");
    const create = within(editor).getByRole("button", { name: "Create" }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    fireEvent.change(field, { target: { value: "   " } });
    expect(pathField.value).toBe("");
    expect(create.disabled).toBe(true);
    // The path follows the name as the host derives it.
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
    expect(screen.queryByTestId("space-subgroup-acme")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(control));
    expect(calls("space.group.create")).toEqual([]);

    fireEvent.click(control);
    const again = screen.getByTestId("space-subgroup-acme");
    const name = within(again).getByLabelText("Group name") as HTMLInputElement;
    const path = within(again).getByLabelText("Path") as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Team 1" } });
    expect(path.value).toBe("team-1");
    const createAgain = within(again).getByTestId("space-subgroup-acme-create") as HTMLButtonElement;
    expect(createAgain.disabled).toBe(false);
    fireEvent.click(createAgain);
    await waitFor(() => expect(createAgain.textContent).toBe("Creating…"));
    expect(createAgain.disabled).toBe(true);
    // A second submission while the command runs sends nothing.
    fireEvent.keyDown(name, { key: "Enter" });
    expect(calls("space.group.create")).toEqual([{ name: "Team 1", path: "team-1", parent: ACME }]);
    // The host reports the name taken: in the editor, the name kept.
    replies[0]!.reject(new SpexCommandError("invalid_request", "Team 1 is taken in acme; name another"));
    await waitFor(() => expect(within(again).getByRole("alert").textContent).toBe("Team 1 is taken in acme; name another"));
    expect(name.value).toBe("Team 1");
    expect(path.value).toBe("team-1");
    expect(createAgain.textContent).toBe("Create");
    expect(document.activeElement).toBe(name);
    expect(live()).toBe("Team 1 is taken in acme; name another");

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
    expect(calls("space.group.create")[1]).toEqual({ name: "华芯智造 Lab", path: "huaxin-lab", parent: ACME });
    // The core holds the created group as listed and announces it before
    // its reply; the reply closes the editor with the group standing
    // after acme, its full path beside its name.
    const listed = sharingHome();
    const [own, acme, other] = listed.groups;
    deliver({
      ...listed,
      groups: [
        own!,
        acme!,
        { id: "70", fullPath: "acme/huaxin-lab", name: "华芯智造 Lab", url: null, own: false, can: { createSubgroup: true, manageMembers: true }, repositories: [] },
        other!,
      ],
    });
    replies[1]!.resolve({ group: { id: "70", fullPath: "acme/huaxin-lab", name: "华芯智造 Lab" } });
    await waitFor(() => expect(screen.queryByTestId("space-subgroup-acme")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(control));
    expect(within(region("acme/huaxin-lab")).getByRole("heading", { level: 2 }).textContent).toBe("华芯智造 Labacme/huaxin-lab");
    const headings = [...screen.getByTestId("space-groups").querySelectorAll("[data-testid^='space-group-']")]
      .map((element) => element.getAttribute("data-testid"))
      .filter((id) => id === "space-group-acme" || id === "space-group-acme/huaxin-lab" || id === "space-group-other");
    expect(headings).toEqual(["space-group-acme", "space-group-acme/huaxin-lab", "space-group-other"]);
  });

  test("New group at the list's head creates at the top", async () => {
    commandMock.mockImplementation(core);
    await renderGroups(sharingHome(), { open: false });
    const control = screen.getByTestId("space-new-group");
    fireEvent.click(control);
    const editor = screen.getByTestId("space-new-group-editor");
    fireEvent.change(within(editor).getByLabelText("Group name"), { target: { value: "Workshop" } });
    fireEvent.click(within(editor).getByRole("button", { name: "Create" }));
    await waitFor(() => expect(calls("space.group.create")).toEqual([{ name: "Workshop", path: "workshop", parent: null }]));
    await waitFor(() => expect(screen.queryByTestId("space-new-group-editor")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(control));
    // Cancel closes it too.
    fireEvent.click(control);
    fireEvent.click(within(screen.getByTestId("space-new-group-editor")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("space-new-group-editor")).toBeNull();
    expect(calls("space.group.create")).toHaveLength(1);
  });
});

describe("GROUPS: Share (space-69)", () => {
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
    const login = within(editor).getByLabelText("Login at gitlab.example") as HTMLInputElement;
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
    expect(calls("space.share")).toEqual([{ group: ACME, login: "carol", role: "30" }]);
    // No account under that login: the host's words in the editor, the
    // login kept.
    replies[0]!.reject(new SpexCommandError("not_found", "GitLab has no account named carol"));
    await waitFor(() => expect(within(editor).getByRole("alert").textContent).toBe("GitLab has no account named carol"));
    expect(login.value).toBe("carol");
    expect(add.textContent).toBe("Add");

    // At Maintainer this time: the reply's members are listed and one
    // line says who was added as what.
    fireEvent.change(roles, { target: { value: "40" } });
    fireEvent.click(add);
    await waitFor(() => expect(calls("space.share")).toHaveLength(2));
    expect(calls("space.share")[1]).toEqual({ group: ACME, login: "carol", role: "40" });
    replies[1]!.resolve({ members: [...ACME_MEMBERS, member("carol", "Maintainer")], membersUrl: ACME_URL });
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
    const list = await openRowMembers(A_SPEX);
    fireEvent.click(within(list).getByTestId(`space-share-${A_SPEX}`));
    const editor = within(list).getByTestId(`space-share-${A_SPEX}-editor`);
    fireEvent.change(within(editor).getByLabelText("Login at gitlab.example"), { target: { value: "@dave" } });
    fireEvent.click(within(editor).getByRole("button", { name: "Add" }));
    // The fixture's host lists the added account at the role it got.
    await waitFor(() => expect(calls("space.share")).toEqual([{ repository: A_SPEX, login: "dave", role: "30" }]));
    await waitFor(() => expect(within(list).getByTestId("space-member-dave").textContent).toContain("Developer"));
    expect(within(list).getByTestId(`space-members-outcome-${A_SPEX}`).textContent).toBe("@dave added as Developer");
  });

  test("Escape and Cancel leave the editor, sending nothing, focus on Share", async () => {
    commandMock.mockImplementation(core);
    await renderGroups(sharingHome(), { open: false });
    const list = await openGroupMembers("acme");
    const share = within(list).getByTestId("space-share-group:acme");
    fireEvent.click(share);
    fireEvent.keyDown(within(list).getByLabelText("Login at gitlab.example"), { key: "Escape" });
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

describe("GROUPS: Remove (space-72)", () => {
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
    expect(calls("space.unshare")).toEqual([{ group: ACME, login: "bob" }]);
    replies[0]!.reject(new SpexCommandError("invalid_request", "GitLab refused: 403 Forbidden"));
    await waitFor(() => expect(within(bob()).getByRole("alert").textContent).toBe("GitLab refused: 403 Forbidden"));
    expect(remove().textContent).toBe("Remove");
    await waitFor(() => expect(document.activeElement).toBe(remove()));

    fireEvent.click(remove());
    fireEvent.click(within(within(bob()).getByTestId("space-member-confirm-bob")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(calls("space.unshare")).toHaveLength(2));
    replies[1]!.resolve({ members: [ACME_MEMBERS[0]!], membersUrl: ACME_URL });
    await waitFor(() => expect(within(list).queryByTestId("space-member-bob")).toBeNull());
    expect(within(list).getByTestId("space-members-outcome-group:acme").textContent).toBe("@bob removed");
    expect(live()).toBe("@bob removed");
    // The row is gone; focus stays in the panel.
    await waitFor(() => expect(document.activeElement).toBe(within(list).getByTestId("space-share-group:acme")));
  });

  test("a repository's Remove names the repository", async () => {
    commandMock.mockImplementation(core);
    await renderGroups(sharingHome(), { open: false });
    const list = await openRowMembers(A_SPEX);
    fireEvent.click(within(list).getByRole("button", { name: "Remove @bob" }));
    expect(within(list).getByTestId("space-member-confirm-bob").textContent).toContain("Remove @bob from a-spex?");
    fireEvent.click(within(within(list).getByTestId("space-member-confirm-bob")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(calls("space.unshare")).toEqual([{ repository: A_SPEX, login: "bob" }]));
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
        const id = button.dataset.testid ?? "";
        if (id.startsWith("space-repo-")) continue;
        const text = (button.textContent ?? "").trim();
        seen.add(text);
        expect(text.length, `"${text}"`).toBeLessThanOrEqual(14);
        expect((button.getAttribute("aria-label") ?? text).length, id).toBeGreaterThan(0);
      }
    };
    // Idle forms, then each editor and confirm open, then busy forms.
    fireEvent.click(screen.getByTestId("space-new-group"));
    fireEvent.click(screen.getByTestId("space-group-subgroup-acme"));
    const list = await openGroupMembers("acme");
    fireEvent.click(within(list).getByTestId("space-share-group:acme"));
    fireEvent.click(within(list).getByTestId("space-member-remove-bob"));
    measure();
    fireEvent.change(within(screen.getByTestId("space-new-group-editor")).getByLabelText("Group name"), { target: { value: "Workshop" } });
    fireEvent.click(within(screen.getByTestId("space-new-group-editor")).getByRole("button", { name: "Create" }));
    fireEvent.change(within(list).getByLabelText("Login at gitlab.example"), { target: { value: "carol" } });
    fireEvent.click(within(list).getByRole("button", { name: "Add" }));
    fireEvent.click(within(within(list).getByTestId("space-member-confirm-bob")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(within(list).getByTestId("space-member-remove-bob").textContent).toBe("Removing…"));
    measure();
    for (const label of ["New group", "New subgroup", "Members", "Share", "Create", "Creating…", "Add", "Adding…", "Cancel", "Remove", "Removing…", "Keep"]) {
      expect(seen, label).toContain(label);
    }

    // A group is a container; below @md its Members shows its mark and
    // keeps its name; the panel's names truncate (DR-041).
    const acme = screen.getByTestId("space-group-acme");
    expect(acme.className.split(/\s+/)).toContain("@container");
    const members = screen.getByTestId("space-group-members-acme");
    expect(members.getAttribute("aria-label")).toBe("Members");
    expect(members.querySelector("svg")?.getAttribute("class")).toContain("@md:hidden");
    expect(members.querySelector("span")?.className).toContain("@md:inline");
    expect(list.className.split(/\s+/)).toContain("@container");
    const name = within(within(list).getByTestId("space-member-jane")).getByText("Jane");
    expect(name.className).toContain("min-w-0");
    expect(name.className).toContain("truncate");
  });

  test("in Chinese the new controls and lines read the catalog's words", async () => {
    activateLanguage("zh");
    commandMock.mockImplementation(core);
    await renderGroups(sharingHome(), { open: false });
    expect(screen.getByTestId("space-new-group").textContent).toBe("新建群组");
    expect(screen.getByTestId("space-group-subgroup-acme").textContent).toBe("新建子群组");
    const list = await openGroupMembers("acme");
    const share = within(list).getByTestId("space-share-group:acme");
    expect(share.textContent).toBe("共享");
    expect(within(list).getByTestId("space-members-link-group:acme").textContent).toBe("在 gitlab.example 打开");
    fireEvent.click(share);
    const editor = within(list).getByTestId("space-share-group:acme-editor");
    fireEvent.change(within(editor).getByLabelText("gitlab.example 上的用户名"), { target: { value: "carol" } });
    fireEvent.click(within(editor).getByRole("button", { name: "添加" }));
    await waitFor(() => expect(within(list).getByTestId("space-members-outcome-group:acme").textContent).toBe("已添加 @carol，角色为 Developer"));
  });
});
