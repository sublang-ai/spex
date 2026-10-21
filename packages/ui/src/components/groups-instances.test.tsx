// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Groups surface over a home signed in to two instances, each
// holding a group `acme` under the same host id (DR-127): Pick a group
// offers each signed-in instance's namespace and groups under its
// display name, and a choice names its instance (space-58, space-29);
// Move… offers the groups of the row's instance alone (space-78); Join
// names the instance its row stands under (space-63, space-29). Each
// act is checked by the command it sends.

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { GroupsState, InstanceGroupState, RepositoryState } from "@sublang/spex-core/protocol";

import { activateLanguage } from "../i18n.js";
import { repositoryRow } from "../fixtures/groups-state.js";
import { setClientForTests } from "../state/store.js";
import {
  KEY,
  NO_CAN,
  ORIGIN,
  OWN_REPO,
  SECOND,
  calls,
  commandMock,
  installClient,
  namespace,
  renderGroups,
  repo,
  signedOutAt,
  twoInstances,
  withMirrors,
} from "../fixtures/groups.js";

beforeEach(installClient);

afterEach(() => {
  cleanup();
  activateLanguage("en");
  setClientForTests(undefined);
});

const CODE = "git@github.com:jane/gamma.git";
/** A project's spex repository on this device only, in your own
 * group's folder: it has never been at an instance. */
const GAMMA = "jane/gamma-spex";
/** The second instance's spex repository for the same code. */
const LISTED = "@second.example/acme/gamma-spex";

/** A group an instance lists, by its host id. */
function group(id: string, fullPath: string, name: string, repositories: RepositoryState[] = []): InstanceGroupState {
  return { id, login: null, mine: false, fullPath, name, can: NO_CAN, repositories };
}

/** A home signed in to the fixtures' instance, as jane, and to the
 * second one, as jada, each listing the given entries, your own group
 * holding the given rows. */
function twoHome(first: InstanceGroupState[], second: InstanceGroupState[], own: RepositoryState[] = [OWN_REPO]): GroupsState {
  const home = twoInstances({ own: { name: "jane", repositories: own }, instance: { groups: first } });
  return withMirrors({
    ...home,
    instances: home.instances.map((entry) => (entry.origin === SECOND ? { ...entry, groups: second } : entry)),
  });
}

/** Both instances hold `acme` under the id 3; the first also lists
 * bob's namespace, the second a namespace named jane that is not yours
 * there, a group `lab`, and in its `acme` a spex repository for
 * gamma's code. gamma is local only in your own group's folder, and the
 * opened project local only under the first instance's folder. */
function pickHome(): GroupsState {
  const gamma = repositoryRow(GAMMA, { name: "gamma-spex", code: CODE, folder: "/Users/jane/code/gamma" });
  const local = repo({ state: "local-only", remote: null, id: null, code: CODE, branch: null, members: null });
  const listed = repo({ key: LISTED, instance: SECOND, name: "gamma-spex", id: "71", remote: null, code: CODE, folder: null, members: 1, state: "absent", branch: null });
  const notes = (key: string, id: string) => repo({ key, name: "notes-spex", id, remote: null, code: null, folder: null });
  return twoHome(
    [namespace("jane", [local]), group("3", "acme", "Acme"), namespace("bob", [notes("@spex.example/bob/notes-spex", "80")], false)],
    [
      group("3", "acme", "Acme Works", [listed]),
      namespace("jada"),
      namespace("jane", [notes("@second.example/jane/notes-spex", "81")], false),
      group("8", "lab", "lab"),
    ],
    [OWN_REPO, gamma],
  );
}

/** Each option of a picker's section: its test id and how it reads. */
const options = (section: HTMLElement, prefix: string): string[][] =>
  within(section)
    .getAllByTestId(new RegExp(`^${prefix}`))
    .map((option) => [option.dataset.testid!.slice(prefix.length), option.textContent ?? ""]);

describe("GROUPS: Pick a group at each instance (space-58, space-29)", () => {
  test("space-58: the picker offers each signed-in instance's namespace, read as the login, and its groups under its display name, never another login; a choice names its instance; a clone keyed under an instance is offered that instance alone", async () => {
    await renderGroups(pickHome(), { open: false });
    const openPicker = (key: string): HTMLElement => {
      fireEvent.click(screen.getByTestId(`space-row-pick-${key}`));
      return screen.getByTestId(`space-picker-${key}`);
    };
    const section = (origin: string): HTMLElement => screen.getByTestId(`space-pick-instance-${origin}`);

    // One section per signed-in instance in the home's order, each
    // under its display name (space-58).
    const picker = openPicker(GAMMA);
    expect(picker).toBe(screen.getByRole("group", { name: "Pick a group for gamma-spex" }));
    const sections = within(picker).getAllByTestId(/^space-pick-instance-/);
    expect(sections.map((each) => each.dataset.testid)).toEqual([`space-pick-instance-${ORIGIN}`, `space-pick-instance-${SECOND}`]);
    expect(sections.map((each) => within(each).getByRole("heading", { level: 3 }).textContent)).toEqual(["Spex Example", "Second Example"]);
    expect(within(picker).getByRole("group", { name: "Second Example" })).toBe(sections[1]);
    // Under each, your namespace first, read by your login there, then
    // every group it lists as the list reads it; another account's login
    // is never offered — bob's at the first, nor a namespace named jane
    // at the second, where your login is jada (space-58).
    expect(options(sections[0]!, "space-pick-group-")).toEqual([
      ["@jane", "jane"],
      ["acme", "Acme · acme"],
    ]);
    expect(options(sections[1]!, "space-pick-group-")).toEqual([
      ["@jada", "jada"],
      ["acme", "Acme Works · acme"],
      ["lab", "lab"],
    ]);
    // The spex repository listed for the same code stands at its own
    // instance alone, with its group read as the list reads it.
    expect(within(sections[0]!).queryAllByTestId(/^space-pick-repo-/)).toEqual([]);
    expect(within(sections[1]!).getByTestId(`space-pick-listed-group-${LISTED}`).textContent).toBe("Acme Works · acme");
    // One name field serves every section; focus rests on the first
    // option.
    expect(within(picker).getAllByTestId(`space-pick-name-${GAMMA}`)).toHaveLength(1);
    expect(document.activeElement).toBe(within(sections[0]!).getByTestId("space-pick-group-@jane"));

    // Each choice names the instance of its section: the second's acme,
    // the first's acme under the same id, your namespace at the second,
    // and the repository the second lists (space-58, space-29).
    fireEvent.change(screen.getByTestId(`space-pick-name-${GAMMA}`), { target: { value: "gamma-notes" } });
    fireEvent.click(within(section(SECOND)).getByTestId("space-pick-group-acme"));
    await waitFor(() =>
      expect(calls("space.pick")).toEqual([
        { repository: GAMMA, choice: { kind: "create", instance: SECOND, groupId: "3", name: "gamma-notes" } },
      ]),
    );
    await waitFor(() => expect(screen.queryByTestId(`space-picker-${GAMMA}`)).toBeNull());
    openPicker(GAMMA);
    fireEvent.click(within(section(ORIGIN)).getByTestId("space-pick-group-acme"));
    await waitFor(() =>
      expect(calls("space.pick")[1]).toEqual({ repository: GAMMA, choice: { kind: "create", instance: ORIGIN, groupId: "3", name: "gamma" } }),
    );
    await waitFor(() => expect(screen.queryByTestId(`space-picker-${GAMMA}`)).toBeNull());
    openPicker(GAMMA);
    fireEvent.click(within(section(SECOND)).getByTestId("space-pick-group-@jada"));
    await waitFor(() =>
      expect(calls("space.pick")[2]).toEqual({ repository: GAMMA, choice: { kind: "create", instance: SECOND, groupId: null, name: "gamma" } }),
    );
    await waitFor(() => expect(screen.queryByTestId(`space-picker-${GAMMA}`)).toBeNull());
    openPicker(GAMMA);
    fireEvent.click(within(section(SECOND)).getByTestId(`space-pick-repo-${LISTED}`));
    await waitFor(() =>
      expect(calls("space.pick")[3]).toEqual({ repository: GAMMA, choice: { kind: "join", instance: SECOND, hostId: "71" } }),
    );
    await waitFor(() => expect(screen.queryByTestId(`space-picker-${GAMMA}`)).toBeNull());

    // A clone keyed under the first instance is offered that instance
    // alone (space-58).
    const keyed = openPicker(KEY);
    expect(within(keyed).getAllByTestId(/^space-pick-instance-/).map((each) => each.dataset.testid)).toEqual([
      `space-pick-instance-${ORIGIN}`,
    ]);
    fireEvent.click(within(keyed).getByTestId("space-pick-group-acme"));
    await waitFor(() =>
      expect(calls("space.pick")[4]).toEqual({ repository: KEY, choice: { kind: "create", instance: ORIGIN, groupId: "3", name: "academy" } }),
    );
    cleanup();

    // Signed out of the second, the pick offers the first alone.
    commandMock.mockClear();
    await renderGroups(signedOutAt(SECOND, {}, pickHome()), { open: false });
    const alone = openPicker(GAMMA);
    expect(within(alone).getAllByTestId(/^space-pick-instance-/).map((each) => each.dataset.testid)).toEqual([
      `space-pick-instance-${ORIGIN}`,
    ]);
    expect(within(alone).queryByTestId(`space-pick-repo-${LISTED}`)).toBeNull();
  });
});

describe("GROUPS: Move… within its instance (space-78, space-29)", () => {
  const A_SPEX = "@spex.example/acme/a-spex";

  /** a-spex in the first's acme, and the opened project in your
   * namespace there, both of which the host lets the person move; the
   * second lists its own acme under the same id, your namespace there and
   * lab. */
  function moveHome(): GroupsState {
    const movable = { manageMembers: false, transfer: true };
    return twoHome(
      [
        namespace("jane", [repo({ can: movable })]),
        group("3", "acme", "Acme", [repo({ key: A_SPEX, name: "a-spex", id: "60", remote: "acme/a-spex", code: null, folder: null, can: movable })]),
        group("4", "other", "Other team"),
      ],
      [group("3", "acme", "Acme Works"), namespace("jada"), group("8", "lab", "lab")],
    );
  }

  test("space-78: Move… offers only the row's instance, your login first, the row's group left out", async () => {
    await renderGroups(moveHome(), { open: false });

    // A row in acme: your namespace at its instance first, read by your
    // login, then every group there but acme; nothing of the second
    // instance (space-78).
    fireEvent.click(screen.getByTestId(`space-row-move-${A_SPEX}`));
    const picker = screen.getByTestId(`space-move-${A_SPEX}`);
    expect(options(picker, "space-move-group-")).toEqual([
      ["@jane", "jane"],
      ["other", "Other team · other"],
    ]);
    expect(within(picker).queryByTestId("space-move-group-@jada")).toBeNull();
    expect(within(picker).queryByTestId("space-move-group-lab")).toBeNull();
    expect(within(picker).queryByTestId("space-move-group-acme")).toBeNull();
    fireEvent.click(within(picker).getByTestId("space-move-group-other"));
    await waitFor(() => expect(calls("space.repository.move")).toEqual([{ repository: A_SPEX, groupId: "4" }]));
    await waitFor(() => expect(screen.queryByTestId(`space-move-${A_SPEX}`)).toBeNull());

    // A row in your namespace: the namespace left out, the groups of its
    // instance alone offered, your namespace named by none elsewhere.
    fireEvent.click(screen.getByTestId(`space-row-move-${KEY}`));
    const own = screen.getByTestId(`space-move-${KEY}`);
    expect(options(own, "space-move-group-")).toEqual([
      ["acme", "Acme · acme"],
      ["other", "Other team · other"],
    ]);
    fireEvent.click(within(own).getByTestId("space-move-group-acme"));
    await waitFor(() => expect(calls("space.repository.move")[1]).toEqual({ repository: KEY, groupId: "3" }));
  });
});

describe("GROUPS: Join at the row's instance (space-63, space-29)", () => {
  const FIRST_DOCS = "@spex.example/acme/team/docs-spex";
  const SECOND_DOCS = "@second.example/acme/team/docs-spex";

  /** Each instance lists a project this device lacks at the same path,
   * under its own id. */
  function joinHome(): GroupsState {
    const absent = (key: string, instance: string, id: string) =>
      repo({ key, instance, name: "docs-spex", id, remote: null, code: "git@github.com:acme/docs.git", folder: null, state: "absent", branch: null });
    return twoHome(
      [namespace("jane"), group("2", "acme/team", "team", [absent(FIRST_DOCS, ORIGIN, "52")])],
      [group("2", "acme/team", "team", [absent(SECOND_DOCS, SECOND, "62")]), namespace("jada")],
    );
  }

  async function joinInto(key: string, folder: string): Promise<void> {
    fireEvent.click(screen.getByTestId(`space-row-join-${key}`));
    fireEvent.change(screen.getByTestId(`space-join-${key}-path`), { target: { value: folder } });
    fireEvent.click(within(screen.getByTestId(`space-join-${key}`)).getByRole("button", { name: "Join" }));
  }

  test("space-63, space-29: Join sends the instance its row stands under", async () => {
    // The first instance's row joins at the first, with its id.
    await renderGroups(joinHome(), { open: false });
    await joinInto(FIRST_DOCS, "/Users/jane/code/docs");
    await waitFor(() => expect(calls("space.join")).toEqual([{ instance: ORIGIN, hostId: "52", folder: "/Users/jane/code/docs" }]));
    cleanup();

    // With the second listed first, its row stands under its heading and
    // joins there, with its own id.
    commandMock.mockClear();
    const home = joinHome();
    await renderGroups(withMirrors({ ...home, defaultInstance: SECOND, instances: [...home.instances].reverse() }), { open: false });
    await joinInto(SECOND_DOCS, "/Users/jane/code/docs-second");
    await waitFor(() =>
      expect(calls("space.join")).toEqual([{ instance: SECOND, hostId: "62", folder: "/Users/jane/code/docs-second" }]),
    );
  });
});
