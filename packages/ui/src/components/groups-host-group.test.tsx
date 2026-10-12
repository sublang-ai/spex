// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The host's own group on the Groups surface over a mocked client
// (space-74, DR-120): where the host names a group of its own, it
// stands after yours headed by its name beside "this host's group"
// with the groups inside it next (space-1); the list's head creates
// inside it (space-68), or, where the person is no member of it, says
// who can let her in with no door to the host's site; and the pick
// lists the groups inside it first under the same phrase (space-58).

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { GroupsState } from "@sublang/spex-core/protocol";

import { activateLanguage } from "../i18n.js";
import { setClientForTests } from "../state/store.js";
import { KEY, NO_CAN, base, calls, installClient, renderGroups, repo } from "../fixtures/groups.js";

beforeEach(installClient);

afterEach(() => {
  cleanup();
  activateLanguage("en");
  setClientForTests(undefined);
});

const INTERNAL = "2000";
const WORKSHOP = "2010";
const HOST_GROUP = { id: INTERNAL, fullPath: "spex-internal", name: "Spex Internal", url: "https://gitlab.example/spex-internal" };

/** A signed-in home whose host names "Spex Internal" at `spex-internal`
 * as its own group, with a workshop's group inside it and acme beside
 * it, and a project's spex repository still only on this device. The
 * host's group is listed, marked, where the person is a member. */
function hostGroupHome(over: { member?: boolean; createSubgroup?: boolean } = {}): GroupsState {
  const home = base({}, [repo({ state: "local-only", remote: null, id: null, code: "git@github.com:jane/academy.git", branch: null, members: null })]);
  const group = (id: string, fullPath: string, name: string, can: GroupsState["groups"][number]["can"], instance = false) => ({
    id,
    fullPath,
    name,
    url: `https://gitlab.example/${fullPath}`,
    own: false,
    instance,
    can,
    repositories: [],
  });
  // Your own group's page is known, so a link to the host's site would
  // stand if the head offered one.
  const own = { ...home.groups[0]!, url: "https://gitlab.example/jane" };
  return {
    ...home,
    host: { ...home.host, group: HOST_GROUP },
    groups: [
      own,
      ...(over.member === false
        ? []
        : [group(INTERNAL, "spex-internal", "Spex Internal", { createSubgroup: over.createSubgroup ?? true, manageMembers: true }, true)]),
      group(WORKSHOP, "spex-internal/workshop", "Workshop", { createSubgroup: true, manageMembers: true }),
      group("3", "acme", "acme", NO_CAN),
    ],
  };
}

const headings = (): string[] => screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent ?? "");

describe("GROUPS: the host's own group (space-74)", () => {
  test("it stands after your own headed by the key phrase, the groups inside it next; the head's New group creates inside it, its own heading carrying no New subgroup", async () => {
    await renderGroups(hostGroupHome(), { open: false });
    expect(headings()).toEqual([
      "Your own group · jane",
      "Spex Internal · this host's group",
      "Workshop · spex-internal/workshop",
      "acme",
    ]);
    // The head holds New group and no link to the host's site (space-1).
    const head = screen.getByTestId("space-new-group");
    expect(head.textContent).toBe("New group");
    expect(screen.getByTestId("space-groups").firstElementChild?.contains(head)).toBe(true);
    expect(screen.queryByTestId("space-new-group-at-host")).toBeNull();
    expect(screen.queryByTestId("space-host-group-ask")).toBeNull();
    // The host's group takes its subgroups from the head; a group inside
    // it carries its own New subgroup (space-1).
    expect(screen.queryByTestId("space-group-subgroup-spex-internal")).toBeNull();
    expect(screen.getByTestId("space-group-subgroup-spex-internal/workshop").textContent).toBe("New subgroup");
    expect(screen.getByTestId("space-group-members-spex-internal")).toBeTruthy();

    // New group creates inside the host's group (space-68).
    fireEvent.click(head);
    const editor = screen.getByTestId("space-new-group-editor");
    fireEvent.change(within(editor).getByLabelText("Group name"), { target: { value: "Workshop 261011" } });
    fireEvent.click(within(editor).getByRole("button", { name: "Create" }));
    await waitFor(() => expect(calls("space.group.create")).toEqual([{ name: "Workshop 261011", path: "workshop-261011", parent: INTERNAL }]));
    await waitFor(() => expect(screen.queryByTestId("space-new-group-editor")).toBeNull());
  });

  test("a member who may not create a subgroup in it finds neither New group nor a link at the head", async () => {
    await renderGroups(hostGroupHome({ createSubgroup: false }), { open: false });
    expect(headings()[1]).toBe("Spex Internal · this host's group");
    expect(screen.queryByTestId("space-new-group")).toBeNull();
    expect(screen.queryByTestId("space-new-group-at-host")).toBeNull();
    expect(screen.queryByTestId("space-host-group-ask")).toBeNull();
  });

  test("a person who is no member of it reads who can let her in, with no door to the host's site, in English and in Chinese", async () => {
    await renderGroups(hostGroupHome({ member: false }), { open: false });
    const ask = screen.getByTestId("space-host-group-ask");
    expect(ask.textContent).toBe("Groups are made in Spex Internal; ask its owner to share it with you");
    expect(screen.getByTestId("space-groups").firstElementChild).toBe(ask);
    expect(ask.querySelector("a")).toBeNull();
    expect(screen.queryByTestId("space-new-group")).toBeNull();
    expect(screen.queryByTestId("space-new-group-at-host")).toBeNull();
    // The groups inside it she belongs to still come before the others.
    expect(headings()).toEqual(["Your own group · jane", "Workshop · spex-internal/workshop", "acme"]);
    cleanup();
    activateLanguage("zh");
    await renderGroups(hostGroupHome({ member: false }), { open: false });
    expect(screen.getByTestId("space-host-group-ask").textContent).toBe("群组都建在 Spex Internal 中；请让它的所有者与你共享");
  });

  test("the pick lists the groups inside it first under the same phrase, then your own group and the others; picking one creates there", async () => {
    await renderGroups(hostGroupHome(), { open: false });
    fireEvent.click(screen.getByTestId(`space-row-pick-${KEY}`));
    const picker = screen.getByRole("group", { name: "Pick a group for academy-spex" });
    const inside = within(picker).getByRole("group", { name: "Spex Internal · this host's group" });
    expect(within(inside).getAllByTestId(/^space-pick-group-/).map((option) => option.textContent)).toEqual(["spex-internal", "spex-internal/workshop"]);
    expect(within(picker).getAllByTestId(/^space-pick-group-/).map((option) => option.textContent)).toEqual([
      "spex-internal",
      "spex-internal/workshop",
      "jane",
      "acme",
    ]);
    // The first option takes focus, as the picker's first always does.
    expect(document.activeElement).toBe(within(inside).getByTestId("space-pick-group-spex-internal"));
    fireEvent.click(within(inside).getByTestId("space-pick-group-spex-internal/workshop"));
    await waitFor(() =>
      expect(calls("space.pick")).toEqual([{ repository: KEY, choice: { kind: "create", groupId: WORKSHOP, name: "academy" } }]),
    );
  });
});
