// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Groups surface over a home signed in to two instances, each
// holding a group `acme` under the same host id (DR-127): each instance
// under its own heading in the home's order, with its account, New
// group or the phrase, its read time and its read's failure, its
// entries beneath it (space-1, git-host-5); "Sign in again" whose flow
// reads on its heading (space-3); the rows of a signed-out instance
// (space-61, space-11); the heading's fit (space-28); Pick a group
// offers each signed-in instance's namespace and groups under its
// display name, and a choice names its instance (space-58, space-29);
// Move… offers the groups of the row's instance alone (space-78); Join
// names the instance its row stands under (space-63, space-29). Each
// act is checked by the command it sends.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { GroupsState, InstanceGroupState, InstanceState, RepositoryState } from "@sublang/spex-core/protocol";

import { activateLanguage } from "../i18n.js";
import { repositoryRow } from "../fixtures/groups-state.js";
import { setClientForTests } from "../state/store.js";
import { absoluteTitle } from "../lib/time.js";
import {
  KEY,
  MIN,
  NOW,
  NO_CAN,
  ORIGIN,
  OWN_REPO,
  SECOND,
  answer,
  calls,
  commandMock,
  deliver,
  installClient,
  live,
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
  vi.useRealTimers();
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

/** An instance's section of the groups list, by its origin. */
const sectionOf = (origin: string): HTMLElement => screen.getByTestId(`space-instance-${origin}`);

/** Every instance's section, in the order the list stands them. */
const sections = (): HTMLElement[] => screen.getAllByTestId(/^space-instance-https?:/);

/** A home whose instances change as a test says, by origin. */
function changed(home: GroupsState, origin: string, over: Partial<InstanceState>): GroupsState {
  return withMirrors({ ...home, instances: home.instances.map((entry) => (entry.origin === origin ? { ...entry, ...over } : entry)) });
}

/** The first instance lets the person create a group and lists acme
 * holding a-spex; the second, read five minutes ago, says not, and
 * lists — in an order of its own — your namespace there, bob's, lab and
 * its own acme holding its a-spex. */
function headingsHome(): GroupsState {
  const aSpex = (key: string, instance: string, id: string) =>
    repo({ key, instance, name: "a-spex", id, remote: null, code: null, folder: null });
  const home = twoHome(
    [namespace("jane", [repo()]), group("3", "acme", "Acme", [aSpex("@spex.example/acme/a-spex", ORIGIN, "60")])],
    [
      namespace("jada"),
      namespace("bob", [aSpex("@second.example/bob/notes-spex", SECOND, "82")], false),
      group("8", "lab", "lab"),
      group("3", "acme", "Acme Works", [aSpex("@second.example/acme/a-spex", SECOND, "61")]),
    ],
  );
  return changed(changed(home, ORIGIN, { account: { ...home.instances[0]!.account, canCreateGroup: true } }), SECOND, {
    readAt: NOW - 5 * MIN,
  });
}

describe("GROUPS: each instance under its heading (space-1, git-host-5, space-3, space-61, space-11, space-28)", () => {
  test("space-1: headings in home order, each with its own account, New group or the phrase, its read time, each acme beneath its own instance", async () => {
    await renderGroups(headingsHome(), { open: false });
    // Your own group first, then each instance in the home's order, each
    // under its display name (space-1).
    expect(sections().map((section) => section.dataset.testid)).toEqual([`space-instance-${ORIGIN}`, `space-instance-${SECOND}`]);
    const own = screen.getByTestId("space-own");
    expect(own.compareDocumentPosition(sections()[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("group", { name: "Second Example" })).toBe(sectionOf(SECOND));
    const first = within(sectionOf(ORIGIN));
    const second = within(sectionOf(SECOND));
    // Each heading carries its own account with Sign out, and its own
    // read's time, its full moment in the title.
    expect(first.getByRole("heading", { level: 2 }).textContent).toBe("Spex Example · Signed in as @jane");
    expect(second.getByRole("heading", { level: 2 }).textContent).toBe("Second Example · Signed in as @jada");
    expect(first.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(second.getByRole("button", { name: "Sign out" }).getAttribute("title")).toBe(
      "Signs this device out of Second Example; every record stays here",
    );
    expect(first.getByTestId("space-read-at").textContent).toBe("Host read 1m ago");
    expect(second.getByTestId("space-read-at").textContent).toBe("Host read 5m ago");
    expect(second.getByTestId("space-read-at").getAttribute("title")).toBe(absoluteTitle(NOW - 5 * MIN));
    // New group where the instance's read lets the person create one, the
    // phrase naming who makes groups there where it says not — no link,
    // no control (space-1, DR-120).
    expect(first.getByTestId("space-new-group").textContent).toBe("New group");
    expect(first.queryByTestId("space-groups-made-by")).toBeNull();
    expect(second.queryByTestId("space-new-group")).toBeNull();
    const phrase = second.getByTestId("space-groups-made-by");
    expect(phrase.textContent).toBe("Groups are made by the people who run Second Example");
    expect(phrase.querySelector("a, button")).toBeNull();
    // Beneath each heading its own entries: every group in the order of
    // their paths, then your namespace by your login, then another
    // account's login, whatever order the state holds (space-1).
    expect(first.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["Acme · acme", "jane"]);
    expect(second.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "Acme Works · acme",
      "lab",
      "jada",
      "bob",
    ]);
    expect(second.getAllByTestId(/^space-group-[^-]+$/).map((entry) => entry.dataset.testid)).toEqual([
      "space-group-acme",
      "space-group-lab",
      "space-group-@jada",
      "space-group-@bob",
    ]);
    // Each acme stands beneath its own instance, holding its own rows.
    expect(within(first.getByTestId("space-group-acme")).getByTestId("space-row-@spex.example/acme/a-spex")).toBeTruthy();
    expect(within(second.getByTestId("space-group-acme")).getByTestId("space-row-@second.example/acme/a-spex")).toBeTruthy();
    expect(first.queryByTestId("space-row-@second.example/acme/a-spex")).toBeNull();
    // Your own group's own repository stands under your own group alone.
    expect(within(own).getByTestId(`space-row-${OWN_REPO.key}`)).toBeTruthy();
    // New group makes a root group at the instance whose heading carries
    // it (space-68).
    fireEvent.click(first.getByTestId("space-new-group"));
    const editor = first.getByTestId("space-new-group-editor");
    fireEvent.change(within(editor).getByLabelText("Group name"), { target: { value: "Workshop" } });
    fireEvent.click(within(editor).getByRole("button", { name: "Create" }));
    await waitFor(() => expect(calls("space.group.create")).toEqual([{ instance: ORIGIN, name: "Workshop", path: "workshop", parent: null }]));
  });

  test("space-1, git-host-5: a failed read reads on its heading alone, the other's view and time kept, and Refresh reads until every read's outcome", async () => {
    const home = changed(headingsHome(), ORIGIN, { read: { phase: "failed", message: "Could not reach Spex Example" } });
    await renderGroups(home, { open: false });
    const first = within(sectionOf(ORIGIN));
    const second = within(sectionOf(SECOND));
    // The failure stands on the first's heading alone, its last view and
    // its time kept (space-1).
    expect(first.getByTestId("space-read-error").textContent).toBe("Could not reach Spex Example");
    expect(first.getByRole("alert")).toBe(first.getByTestId("space-read-error"));
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(first.getByTestId("space-read-at").textContent).toBe("Host read 1m ago");
    expect(first.getByTestId("space-row-@spex.example/acme/a-spex")).toBeTruthy();
    // The second's view, its time and its controls stand as they were.
    expect(second.queryByTestId("space-read-error")).toBeNull();
    expect(second.getByTestId("space-read-at").textContent).toBe("Host read 5m ago");
    expect(second.getByTestId("space-row-@second.example/acme/a-spex")).toBeTruthy();
    // Refresh offers the ordinary retry; while any read runs it reads
    // "Reading…" until every read's outcome (space-1).
    const refresh = screen.getByTestId("space-refresh") as HTMLButtonElement;
    expect(refresh.disabled).toBe(false);
    deliver(changed(home, SECOND, { read: { phase: "running" } }));
    expect(refresh.textContent).toBe("Reading…");
    expect(refresh.disabled).toBe(true);
    deliver(changed(changed(home, SECOND, { readAt: NOW }), ORIGIN, { read: { phase: "idle" } }));
    expect(refresh.textContent).toBe("Refresh");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(second.getByTestId("space-read-at").textContent).toBe("Host read just now");
  });

  test("space-3: Sign in again's flow reads on that heading; every other sign-in control is disabled while it runs", async () => {
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) =>
      type === "space.signin.start"
        ? { flow: "device", userCode: "WDJB-MJHT", verificationUri: `${fields?.url as string}/login/device?user_code=WDJB-MJHT`, expiresAt: NOW + 15 * MIN }
        : answer(type, fields),
    );
    const out = signedOutAt(SECOND, {}, signedOutAt(ORIGIN, {}, headingsHome()));
    await renderGroups(out, { open: false });
    const first = within(sectionOf(ORIGIN));
    const second = within(sectionOf(SECOND));
    const firstAgain = first.getByTestId("space-signin-again") as HTMLButtonElement;
    const secondAgain = second.getByTestId("space-signin-again") as HTMLButtonElement;
    expect(firstAgain.title).toBe("Signs in to spex.example");
    expect(screen.queryByTestId("space-signin-card")).toBeNull();

    // The second's Sign in again starts the sign-in at its origin, its
    // flow reading on its heading alone (space-3).
    fireEvent.click(secondAgain);
    const link = (await second.findByTestId("space-signin-link")) as HTMLAnchorElement;
    expect(calls("space.signin.start")).toEqual([{ url: SECOND }]);
    expect(link.textContent).toBe("Open second.example to sign in");
    expect(link.href).toBe(`${SECOND}/login/device?user_code=WDJB-MJHT`);
    expect(second.getByTestId("space-signin-body").textContent).toContain("Sign in there and approve");
    expect(secondAgain.textContent).toBe("Signing in…");
    expect(secondAgain.disabled).toBe(true);
    // No other heading offers its own while it runs.
    expect(first.queryByTestId("space-signin-link")).toBeNull();
    expect(first.queryByTestId("space-signin-body")).toBeNull();
    expect(firstAgain.textContent).toBe("Sign in again");
    expect(firstAgain.disabled).toBe(true);
    fireEvent.click(firstAgain);
    expect(calls("space.signin.start")).toHaveLength(1);
    // Focus moves to Cancel; Escape cancels the flow, focus back.
    await waitFor(() => expect(document.activeElement).toBe(second.getByTestId("space-signin-cancel")));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(calls("space.signin.cancel")).toEqual([{}]));
    await waitFor(() => expect(secondAgain.textContent).toBe("Sign in again"));
    expect(second.queryByTestId("space-signin-link")).toBeNull();
    expect(firstAgain.disabled).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(secondAgain));

    // A failure reads on the heading whose flow it was, its cause as one
    // sentence (space-3).
    fireEvent.click(secondAgain);
    await second.findByTestId("space-signin-link");
    deliver({ ...out, signIn: { phase: "running", instance: SECOND, flow: "device", since: NOW } });
    deliver({ ...out, signIn: { phase: "failed", instance: SECOND, cause: "denied", message: "The sign-in was denied at Second Example" } });
    expect(second.getByTestId("space-signin-error").textContent).toBe("The sign-in was denied at Second Example.");
    expect(first.queryByTestId("space-signin-error")).toBeNull();
    expect(secondAgain.textContent).toBe("Sign in again");

    // Signed in there, focus lands on its heading's Sign out (DR-010 §6).
    firstAgain.focus();
    fireEvent.click(firstAgain);
    await first.findByTestId("space-signin-link");
    await waitFor(() => expect(document.activeElement).toBe(first.getByTestId("space-signin-cancel")));
    deliver(signedOutAt(SECOND, {}, headingsHome()));
    expect(first.getByRole("heading", { level: 2 }).textContent).toBe("Spex Example · Signed in as @jane");
    await waitFor(() => expect(document.activeElement).toBe(first.getByRole("button", { name: "Sign out" })));
  });

  test("space-61, space-11: under a signed-out heading an unreachable row offers no Retry; a reachable row whose instance is signed out reads 'Sign in to {host} first'", async () => {
    const stale = "@spex.example/acme/a-spex";
    const pathRemote = "@spex.example/acme/b-spex";
    const home = twoHome(
      [
        namespace("jane", [repo({ state: "unreachable", reason: "Sign in again" })]),
        group("3", "acme", "Acme", [
          repo({ key: stale, name: "a-spex", id: "60", code: null, folder: null }),
          repo({ key: pathRemote, name: "b-spex", id: null, code: null, remote: "/srv/b-spex.git", state: "unreachable", reason: "the folder is gone" }),
        ]),
      ],
      [group("3", "acme", "Acme Works", [repo({ key: "@second.example/acme/c-spex", instance: SECOND, name: "c-spex", id: "62", state: "unreachable", reason: "the device is offline" })]), namespace("jada")],
    );
    await renderGroups(signedOutAt(ORIGIN, {}, home), { open: false });
    const controls = (key: string) =>
      within(screen.getByTestId(`space-row-${key}`))
        .getAllByRole("button")
        .filter((button) => !button.dataset.testid?.startsWith("space-repo-"));
    // Signed out, a row at the instance offers no Retry, and no row a
    // sign-in: its heading's Sign in again is the one (space-61, space-3).
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("Unreachable: Sign in again");
    expect(controls(KEY)).toEqual([]);
    // A row still read reachable there refuses Sync naming the instance,
    // and offers no Members (space-11).
    const sync = screen.getByTestId(`space-row-sync-${stale}`) as HTMLButtonElement;
    expect(sync.disabled).toBe(true);
    expect(screen.getByTestId(`space-row-caption-${stale}`).textContent).toBe("Sign in to Spex Example first");
    expect(sync.getAttribute("aria-describedby")).toBe(`space-row-caption-${stale}`);
    expect(screen.queryByTestId(`space-row-members-${stale}`)).toBeNull();
    expect(screen.queryByTestId(`space-row-move-${stale}`)).toBeNull();
    // A path remote is reached without the instance, so it retries.
    expect(controls(pathRemote).map((button) => button.textContent)).toEqual(["Retry"]);
    // The other instance, signed in, retries its own.
    expect(controls("@second.example/acme/c-spex").map((button) => button.textContent)).toEqual(["Retry"]);
    // Your own group's own repository follows the signed-in instance that
    // lists it: Sync and Members stand (space-60).
    expect((screen.getByTestId(`space-row-sync-${OWN_REPO.key}`) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByTestId(`space-row-members-${OWN_REPO.key}`)).toBeTruthy();
    cleanup();

    // With no signed-in instance to follow, it waits for its own, named
    // by its host name before any read (space-11).
    await renderGroups(
      signedOutAt(SECOND, {}, signedOutAt(ORIGIN, {}, changed(home, ORIGIN, { displayName: null, readAt: null }))),
      { open: false },
    );
    expect(screen.getByTestId(`space-row-caption-${OWN_REPO.key}`).textContent).toBe("Sign in to spex.example first");
    expect((screen.getByTestId(`space-row-sync-${OWN_REPO.key}`) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId(`space-row-members-${OWN_REPO.key}`)).toBeNull();
  });

  test("space-28: every heading control reads at most 14 characters, busy forms included, the read time yields and the heading stacks below 20rem", async () => {
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) =>
      type === "space.signout"
        ? new Promise(() => {})
        : type === "space.signin.start"
          ? { flow: "device", userCode: "WDJB-MJHT", verificationUri: `${SECOND}/login/device?user_code=WDJB-MJHT`, expiresAt: NOW + 15 * MIN }
          : answer(type, fields),
    );
    await renderGroups(signedOutAt(SECOND, { byHost: true }, headingsHome()), { open: false });
    const seen = new Set<string>();
    const measure = () => {
      for (const heading of screen.getAllByTestId("space-instance-heading")) {
        for (const button of within(heading).getAllByRole("button")) {
          const text = (button.textContent ?? "").trim();
          seen.add(text);
          expect(text.length, `"${text}"`).toBeLessThanOrEqual(14);
          expect((button.getAttribute("aria-label") ?? text).length).toBeGreaterThan(0);
        }
      }
    };
    measure();
    fireEvent.click(within(sectionOf(SECOND)).getByTestId("space-signin-again"));
    await within(sectionOf(SECOND)).findByTestId("space-signin-link");
    fireEvent.click(within(sectionOf(ORIGIN)).getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(within(sectionOf(ORIGIN)).getByTestId("space-signout").textContent).toBe("Signing out…"));
    measure();
    for (const label of ["New group", "Sign out", "Signing out…", "Sign in again", "Signing in…", "Cancel"]) {
      expect(seen, label).toContain(label);
    }
    // Each instance is a container; its read time yields below 42rem;
    // below 20rem its fields stack, the last control full-width.
    for (const section of sections()) {
      expect(section.className.split(/\s+/)).toContain("@container");
      const row = within(section).getByTestId("space-instance-heading").firstElementChild!;
      expect(row.className).toContain("flex-col");
      expect(row.className).toContain("@xs:flex-row");
      const last = [...row.querySelectorAll("button")].at(-1)!;
      expect(last.className).toContain("w-full");
      expect(last.className).toContain("@xs:w-auto");
    }
    expect(within(sectionOf(ORIGIN)).getByTestId("space-read-at").className).toContain("hidden");
    expect(within(sectionOf(ORIGIN)).getByTestId("space-read-at").className).toContain("@2xl:inline");
  });

  test.each(["en", "zh"] as const)("space-28, space-6: the heading's controls and Sign out's note read the catalog's words (%s)", async (language) => {
    activateLanguage(language);
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) =>
      type === "space.signout" ? signedOutAt(SECOND, {}, headingsHome()) : answer(type, fields),
    );
    await renderGroups(headingsHome(), { open: false });
    const second = within(sectionOf(SECOND));
    fireEvent.click(second.getByTestId("space-signout"));
    const again = await second.findByTestId("space-signin-again");
    expect(again.textContent).toBe(language === "zh" ? "重新登录" : "Sign in again");
    expect(live()).toBe(language === "zh" ? "已退出 Second Example" : "Signed out of Second Example");
    expect((screen.getByTestId("space-refresh") as HTMLButtonElement).title).toBe(
      language === "zh" ? "重新读取每个已登录的实例" : "Reads each signed-in instance again",
    );
  });
});

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
