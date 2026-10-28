// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Groups surface over a home signed in to two instances, each
// holding a group `acme` under the same host id (DR-127): each instance
// under its own heading in the home's order, with its account, New
// group or the phrase, its read time and its read's failure, its
// entries beneath it (space-1, git-host-5); "Sign in again" whose flow
// reads on its heading (space-3); the rows of a signed-out instance
// (space-61, space-11); the heading's fit (space-28); "Add to a group…"
// offers each signed-in instance's namespace and groups under its
// display name, and a choice names its instance (space-58, space-29);
// Move… on a placement's line, in the row's Sync tab, offers the groups
// of its instance alone (space-78, space-87); "Open here" names the
// instance its row stands under (space-63, space-111, space-29);
// "Add instance…" at the list's foot opens the sign-in card in its place,
// saying your own group's records will be kept there too (space-1,
// space-3, space-28); Forget on a signed-out heading removes the
// instance from the home, a refusal standing beneath it, and with none
// left your own group reads as the core names it (space-82, space-29,
// space-1). Each act is checked by the command it sends.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { GroupsState, InstanceGroupState, InstanceState, RepositoryState } from "@sublang/spex-core/protocol";

import { activateLanguage } from "../i18n.js";
import { repositoryRow } from "../fixtures/groups-state.js";
import { setClientForTests } from "../state/store.js";
import { absoluteTitle } from "../lib/time.js";
import {
  BRANCH,
  KEY,
  MIN,
  NOW,
  NO_CAN,
  ORIGIN,
  OWN,
  OWN_REPO,
  SECOND,
  answer,
  base,
  calls,
  commandMock,
  deliver,
  installClient,
  instance,
  live,
  namespace,
  noInstance,
  renderGroups,
  ownRepo,
  repo,
  signedOutAt,
  twoInstances,
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
  return { id, login: null, mine: false, fullPath, name, can: NO_CAN, placed: [], repositories };
}

/** A home signed in to the fixtures' instance, as jane, and to the
 * second one, as jada, each listing the given entries, your own group
 * holding the given rows. */
function twoHome(first: InstanceGroupState[], second: InstanceGroupState[], own: RepositoryState[] = [OWN_REPO]): GroupsState {
  const home = twoInstances({ own: { name: "jane", named: false, repositories: own }, instance: { groups: first } });
  return {
    ...home,
    instances: home.instances.map((entry) => (entry.origin === SECOND ? { ...entry, groups: second } : entry)),
  };
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

/** A row's placement line at an instance, by its origin, in the row's
 * Sync tab, which the row's name opens where it is not open (space-87,
 * space-1). */
const lineAt = (key: string, origin: string): HTMLElement => {
  if (!screen.queryByTestId(`space-lines-${key}`)) fireEvent.click(screen.getByTestId(`space-repo-${key}`));
  return within(screen.getByTestId(`space-lines-${key}`)).getByTestId(`space-line-${origin}`);
};

/** A row's overflow menu, "More", opened where it is not open
 * (space-1). */
const moreOf = (key: string): HTMLElement => {
  if (!screen.queryByTestId(`space-row-more-${key}-menu`)) fireEvent.click(screen.getByTestId(`space-row-more-${key}`));
  return screen.getByTestId(`space-row-more-${key}-menu`);
};

/** An instance's section of the groups list, by its origin. */
const sectionOf = (origin: string): HTMLElement => screen.getByTestId(`space-instance-${origin}`);

/** Every instance's section, in the order the list stands them. */
const sections = (): HTMLElement[] => screen.getAllByTestId(/^space-instance-https?:/);

/** A home whose instances change as a test says, by origin. */
function changed(home: GroupsState, origin: string, over: Partial<InstanceState>): GroupsState {
  return { ...home, instances: home.instances.map((entry) => (entry.origin === origin ? { ...entry, ...over } : entry)) };
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
    expect(first.getByTestId("space-read-at").textContent).toBe("Read 1m ago");
    expect(second.getByTestId("space-read-at").textContent).toBe("Read 5m ago");
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
    // Beneath each heading its own entries: every group by its name in
    // the order of their paths, then your namespace as "Only you" while it
    // lists a project — none where it lists nothing — then another
    // account's login as "Shared by @<login>", whatever order the state
    // holds (space-1).
    expect(first.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["Acme", "Only you"]);
    expect(second.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "Acme Works",
      "lab",
      "Shared by @bob",
    ]);
    expect(second.getAllByTestId(/^space-group-[^-]+$/).map((entry) => entry.dataset.testid)).toEqual([
      "space-group-acme",
      "space-group-lab",
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
    expect(first.getByTestId("space-read-at").textContent).toBe("Read 1m ago");
    expect(first.getByTestId("space-row-@spex.example/acme/a-spex")).toBeTruthy();
    // The second's view, its time and its controls stand as they were.
    expect(second.queryByTestId("space-read-error")).toBeNull();
    expect(second.getByTestId("space-read-at").textContent).toBe("Read 5m ago");
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
    expect(second.getByTestId("space-read-at").textContent).toBe("Read just now");
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
      // Your own group's own repository, its clone here, which the
      // second lists too, is governed by the second once the first is
      // signed out (git-host-5).
      [ownRepo({ governing: SECOND, branch: BRANCH })],
    );
    await renderGroups(signedOutAt(ORIGIN, {}, home), { open: false });
    // Leave… stands in the overflow of a project's row holding a
    // placement at an instance, signed in or not (space-89, space-1): the
    // controls below are the state's, beside the row's "More".
    const controls = (key: string) =>
      within(screen.getByTestId(`space-row-${key}`))
        .getAllByRole("button")
        .filter((button) => !button.dataset.testid?.startsWith("space-repo-") && !button.dataset.testid?.startsWith("space-row-more-"));
    // Signed out, a row at the instance offers no Retry, and no row a
    // sign-in: its heading's Sign in again is the one (space-61, space-3).
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("Unreachable: Sign in again");
    expect(controls(KEY)).toEqual([]);
    expect(within(moreOf(KEY)).getByTestId(`space-row-leave-${KEY}`).getAttribute("aria-label")).toBe("Remove from Spex Example");
    // A row still read reachable there refuses "Sync now" naming the
    // instance, the reason beside the disabled entry, and its placement's
    // line offers no Members and no Move (space-11, space-87).
    const sync = within(moreOf(stale)).getByTestId(`space-row-sync-${stale}`) as HTMLButtonElement;
    expect(sync.disabled).toBe(true);
    expect(within(sync).getByText("Sign in to Spex Example first")).toBeTruthy();
    expect(within(lineAt(stale, ORIGIN)).queryByTestId("space-line-members")).toBeNull();
    expect(within(lineAt(stale, ORIGIN)).queryByTestId("space-line-move")).toBeNull();
    // A path remote is reached without the instance, so it retries.
    expect(controls(pathRemote).map((button) => button.textContent)).toEqual(["Retry"]);
    // The other instance, signed in, retries its own, which reads every
    // signed-in instance again (space-2).
    expect(controls("@second.example/acme/c-spex").map((button) => button.textContent)).toEqual(["Retry"]);
    expect(controls("@second.example/acme/c-spex")[0]!.title).toBe("Reads each signed-in instance again");
    // Your own group's own repository follows the signed-in instance
    // governing it: "Sync now" stands, and Members on its line (space-60,
    // space-1).
    expect((within(moreOf(OWN_REPO.key)).getByTestId(`space-row-sync-${OWN_REPO.key}`) as HTMLButtonElement).disabled).toBe(false);
    expect(within(lineAt(OWN_REPO.key, ORIGIN)).getByTestId("space-line-members")).toBeTruthy();
    cleanup();

    // Governed by none, with no signed-in instance to follow, it waits
    // for its own, named by its host name before any read (space-11,
    // space-1).
    await renderGroups(
      signedOutAt(SECOND, {}, signedOutAt(ORIGIN, {}, changed(home, ORIGIN, { displayName: null, readAt: null }))),
      { open: false },
    );
    const ownSync = within(moreOf(OWN_REPO.key)).getByTestId(`space-row-sync-${OWN_REPO.key}`) as HTMLButtonElement;
    expect(within(ownSync).getByText("Sign in to spex.example first")).toBeTruthy();
    expect(ownSync.disabled).toBe(true);
    expect(within(lineAt(OWN_REPO.key, ORIGIN)).queryByTestId("space-line-members")).toBeNull();
  });

  test("space-1, space-62: a row's members panel reads the roles and host name of the instance the core names as governing it, not of the first signed in", async () => {
    // Signed out of the first; the third, listed before the second and
    // signed in, does not list your own group's own repository, which the
    // second governs (git-host-5).
    const THIRD = "https://third.example";
    const home = twoHome([namespace("jane")], [namespace("jada")], [ownRepo({ governing: SECOND, can: { manageMembers: true, transfer: false }, branch: BRANCH })]);
    const roles = [
      { id: "1", name: "Viewer", mayPush: false },
      { id: "2", name: "Editor", mayPush: true },
    ];
    const state = signedOutAt(ORIGIN, {}, {
      ...home,
      instances: [
        home.instances[0]!,
        instance({ origin: THIRD, host: "third.example", displayName: "Third Example", account: { id: "90", login: "jen", displayName: null, canCreateGroup: false }, groups: [namespace("jen")] }),
        { ...home.instances[1]!, roles },
      ],
    });
    await renderGroups(state, { open: false });
    expect(sections().map((section) => section.dataset.testid)).toEqual([`space-instance-${ORIGIN}`, `space-instance-${THIRD}`, `space-instance-${SECOND}`]);
    // Members on its placement's line reads that placement from the
    // core, and Share offers the governing instance's login field and
    // roles (space-62, space-69).
    fireEvent.click(within(lineAt(OWN_REPO.key, ORIGIN)).getByTestId("space-line-members"));
    const panel = await screen.findByTestId(`space-members-${OWN_REPO.key}@${ORIGIN}`);
    await within(panel).findAllByTestId(/^space-member-/);
    expect(calls("space.members")).toEqual([{ repository: OWN_REPO.key, instance: ORIGIN }]);
    fireEvent.click(within(panel).getByTestId(`space-share-${OWN_REPO.key}@${ORIGIN}`));
    const editor = within(panel).getByTestId(`space-share-${OWN_REPO.key}@${ORIGIN}-editor`);
    expect(within(editor).getByLabelText("Login at second.example")).toBeTruthy();
    expect(within(within(editor).getByRole("listbox", { name: "Role" })).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Viewer",
      "Editor",
    ]);
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
    for (const label of ["New group", "Sign out", "Signing out…", "Forget", "Sign in again", "Signing in…", "Cancel"]) {
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

  test.each(["en", "zh"] as const)("space-28, space-6, space-82: the heading's controls and the notes of Sign out and Forget read the catalog's words (%s)", async (language) => {
    activateLanguage(language);
    const zh = language === "zh";
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) =>
      type === "space.signout"
        ? signedOutAt(SECOND, {}, headingsHome())
        : type === "space.forget"
          ? { ...headingsHome(), instances: headingsHome().instances.filter((entry) => entry.origin !== SECOND) }
          : answer(type, fields),
    );
    await renderGroups(headingsHome(), { open: false });
    const second = within(sectionOf(SECOND));
    fireEvent.click(second.getByTestId("space-signout"));
    const again = await second.findByTestId("space-signin-again");
    expect(again.textContent).toBe(zh ? "重新登录" : "Sign in again");
    expect(live()).toBe(zh ? "已退出 Second Example 的登录" : "Signed out of Second Example");
    expect((screen.getByTestId("space-refresh") as HTMLButtonElement).title).toBe(
      zh ? "重新读取每个已登录的实例" : "Reads each signed-in instance again",
    );
    // Forget reads the catalog's word and title, and its note (space-82).
    const forget = second.getByTestId("space-forget") as HTMLButtonElement;
    expect(forget.textContent).toBe(zh ? "忘记" : "Forget");
    expect(forget.title).toBe(
      zh ? "在此设备上忘记 Second Example；所有记录仍保留在此" : "Forgets Second Example on this device; every record stays here",
    );
    fireEvent.click(forget);
    await waitFor(() => expect(screen.queryByTestId(`space-instance-${SECOND}`)).toBeNull());
    expect(live()).toBe(zh ? "已忘记 Second Example" : "Forgot Second Example");
  });
});

describe("GROUPS: Add to a group… at each instance (space-58, space-29)", () => {
  test("space-58: the picker offers each signed-in instance's namespace, reading Only you, and its groups under its display name, never another login; a choice names its instance; a clone keyed under an instance is offered that instance alone", async () => {
    await renderGroups(pickHome(), { open: false });
    const openPicker = (key: string): HTMLElement => {
      fireEvent.click(screen.getByTestId(`space-row-pick-${key}`));
      return screen.getByTestId(`space-picker-${key}`);
    };
    const section = (origin: string): HTMLElement => screen.getByTestId(`space-pick-instance-${origin}`);

    // One section per signed-in instance in the home's order, each
    // under its display name (space-58).
    const picker = openPicker(GAMMA);
    expect(picker).toBe(screen.getByRole("group", { name: "Add gamma to a group" }));
    const sections = within(picker).getAllByTestId(/^space-pick-instance-/);
    expect(sections.map((each) => each.dataset.testid)).toEqual([`space-pick-instance-${ORIGIN}`, `space-pick-instance-${SECOND}`]);
    expect(sections.map((each) => within(each).getByRole("heading", { level: 3 }).textContent)).toEqual(["Spex Example", "Second Example"]);
    expect(within(picker).getByRole("group", { name: "Second Example" })).toBe(sections[1]);
    // Under each, your namespace first, reading "Only you", then every
    // group it lists by its name with its path after it where the two
    // differ; another account's login is never offered — bob's at the
    // first, nor a namespace named jane at the second, where your login
    // is jada (space-58).
    expect(options(sections[0]!, "space-pick-group-")).toEqual([
      ["@jane", "Only you"],
      ["acme", "Acme · acme"],
    ]);
    expect(options(sections[1]!, "space-pick-group-")).toEqual([
      ["@jada", "Only you"],
      ["acme", "Acme Works · acme"],
      ["lab", "lab"],
    ]);
    // The spex repository listed for the same code stands at its own
    // instance alone, with its group read as the list reads it.
    expect(within(sections[0]!).queryAllByTestId(/^space-pick-repo-/)).toEqual([]);
    expect(within(sections[1]!).getByTestId(`space-pick-listed-group-${LISTED}`).textContent).toBe("Acme Works · acme");
    // It stands under the instance's own words for what it lists, never
    // the host's (DR-120).
    expect(within(sections[1]!).getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent)[0]).toBe("On this instance for this code");
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
    cleanup();

    // Signed out of the first while the second is signed in, a clone
    // keyed under the first offers no pick — the one instance it would
    // offer is signed out — and a clone in your own group's folder is
    // offered the second alone (space-58, space-61).
    commandMock.mockClear();
    await renderGroups(signedOutAt(ORIGIN, {}, pickHome()), { open: false });
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("On this computer only");
    expect(screen.queryByTestId(`space-row-pick-${KEY}`)).toBeNull();
    const second = openPicker(GAMMA);
    expect(within(second).getAllByTestId(/^space-pick-instance-/).map((each) => each.dataset.testid)).toEqual([
      `space-pick-instance-${SECOND}`,
    ]);
    expect(within(section(SECOND)).getByTestId(`space-pick-repo-${LISTED}`)).toBeTruthy();
  });
});

describe("GROUPS: Move… within its placement's instance (space-78, space-87, space-29)", () => {
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

  test("space-78: Move… on a placement's line offers only that placement's instance, your login first, the row's group left out", async () => {
    await renderGroups(moveHome(), { open: false });

    // A row in acme: your namespace at its instance first, read by your
    // login, then every group there but acme; nothing of the second
    // instance (space-78).
    fireEvent.click(within(lineAt(A_SPEX, ORIGIN)).getByTestId("space-line-move"));
    const picker = screen.getByTestId(`space-move-${A_SPEX}@${ORIGIN}`);
    expect(options(picker, "space-move-group-")).toEqual([
      ["@jane", "jane"],
      ["other", "Other team · other"],
    ]);
    expect(within(picker).queryByTestId("space-move-group-@jada")).toBeNull();
    expect(within(picker).queryByTestId("space-move-group-lab")).toBeNull();
    expect(within(picker).queryByTestId("space-move-group-acme")).toBeNull();
    fireEvent.click(within(picker).getByTestId("space-move-group-other"));
    await waitFor(() => expect(calls("space.repository.move")).toEqual([{ repository: A_SPEX, instance: ORIGIN, groupId: "4" }]));
    await waitFor(() => expect(screen.queryByTestId(`space-move-${A_SPEX}@${ORIGIN}`)).toBeNull());

    // A row in your namespace: the namespace left out, the groups of its
    // instance alone offered, your namespace named by none elsewhere.
    fireEvent.click(within(lineAt(KEY, ORIGIN)).getByTestId("space-line-move"));
    const own = screen.getByTestId(`space-move-${KEY}@${ORIGIN}`);
    expect(options(own, "space-move-group-")).toEqual([
      ["acme", "Acme · acme"],
      ["other", "Other team · other"],
    ]);
    fireEvent.click(within(own).getByTestId("space-move-group-acme"));
    await waitFor(() => expect(calls("space.repository.move")[1]).toEqual({ repository: KEY, instance: ORIGIN, groupId: "3" }));
  });
});

describe("GROUPS: Open here at the row's instance (space-63, space-111, space-29)", () => {
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
    // This computer the only place, Open reads "Open here" alone
    // (space-111).
    const open = screen.getByTestId(`space-row-open-${key}`);
    expect(open.textContent).toBe("Open here");
    fireEvent.click(open);
    fireEvent.change(screen.getByTestId(`space-join-${key}-path`), { target: { value: folder } });
    fireEvent.click(within(screen.getByTestId(`space-join-${key}`)).getByRole("button", { name: "Open here" }));
  }

  test("space-63, space-29: Open here sends the instance its row stands under", async () => {
    // The first instance's row joins at the first, with its id.
    await renderGroups(joinHome(), { open: false });
    await joinInto(FIRST_DOCS, "/Users/jane/code/docs");
    await waitFor(() => expect(calls("space.join")).toEqual([{ instance: ORIGIN, hostId: "52", folder: "/Users/jane/code/docs" }]));
    cleanup();

    // With the second listed first, its row stands under its heading and
    // joins there, with its own id.
    commandMock.mockClear();
    const home = joinHome();
    await renderGroups({ ...home, defaultInstance: SECOND, instances: [...home.instances].reverse() }, { open: false });
    await joinInto(SECOND_DOCS, "/Users/jane/code/docs-second");
    await waitFor(() =>
      expect(calls("space.join")).toEqual([{ instance: SECOND, hostId: "62", folder: "/Users/jane/code/docs-second" }]),
    );
  });
});

describe("GROUPS: Add instance… at the list's foot (space-1, space-3, space-28, space-66)", () => {
  const REFUSED = "An instance is named by its origin alone, with no path, query or user";
  const DEVICE = (code: string) => `${SECOND}/login/device?user_code=${code}`;

  /** The start answered by the device flow at the second instance, and
   * refused by the origin rule for any other URL than an origin. */
  function startsAtSecond(): void {
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type !== "space.signin.start") return answer(type, fields);
      if (!/^https:\/\/[^/]+$/.test(fields?.url as string)) throw new Error(REFUSED);
      return { flow: "device", userCode: "WDJB-MJHT", verificationUri: `${fields?.url as string}/login/device?user_code=WDJB-MJHT`, expiresAt: NOW + 15 * MIN };
    });
  }

  /** The sign-in the core reports running at the second instance. */
  const runningAtSecond = (code = "WDJB-MJHT"): GroupsState => ({
    ...base(),
    signIn: { phase: "running", instance: SECOND, flow: "device", userCode: code, verificationUri: DEVICE(code), since: NOW },
  });

  const add = (): HTMLButtonElement => screen.getByTestId("space-add-instance") as HTMLButtonElement;
  const card = (): HTMLElement => screen.getByTestId("space-add-card");
  const field = (): HTMLInputElement => within(card()).getByRole("textbox", { name: "Instance" }) as HTMLInputElement;

  test("space-66, space-1: Add instance… stands at the list's foot named Another instance, absent while the home lists none", async () => {
    await renderGroups(headingsHome(), { open: false });
    // Its label keeps to the budget; "Another instance" is its title and
    // its accessible name (space-1, space-28).
    expect(add().textContent).toBe("Add instance…");
    expect(screen.getByRole("button", { name: "Another instance" })).toBe(add());
    expect(add().title).toBe("Another instance");
    expect(add().disabled).toBe(false);
    // At the list's foot: inside the list, after every instance's section.
    const list = screen.getByTestId("space-groups");
    expect(list.lastElementChild!.contains(add())).toBe(true);
    for (const section of sections()) {
      expect(section.compareDocumentPosition(add()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(section.contains(add())).toBe(false);
    }
    // Nothing opens until the reader asks.
    expect(screen.queryByTestId("space-add-card")).toBeNull();
    expect(within(list).queryByRole("textbox")).toBeNull();
    cleanup();

    // Signed out of the one instance it lists, the home still lists it,
    // and the foot stands beneath its heading.
    await renderGroups(signedOutAt(ORIGIN), { open: false });
    expect(screen.getByRole("button", { name: "Another instance" })).toBe(add());
    expect(sectionOf(ORIGIN).compareDocumentPosition(add()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    cleanup();

    // Listing none, the header is the card and the list holds your own
    // group alone (space-1, space-3).
    await renderGroups(noInstance(), { open: false });
    expect(screen.getByTestId("space-signin-card")).toBeTruthy();
    expect(screen.queryByTestId("space-add-instance")).toBeNull();
    expect(screen.queryByRole("button", { name: "Another instance" })).toBeNull();
  });

  test("space-3: it opens the card in its place with Instance holding the first's origin; Escape closes it, focus back; an origin the core refuses reads in the card with the field kept; a second origin starts the flow there; Add instance… is disabled while any flow runs", async () => {
    startsAtSecond();
    await renderGroups(base(), { open: false });
    fireEvent.click(add());
    // The card stands in its place, named "Another instance", its field
    // holding the first instance's origin, focused and selected, with
    // Sign in its one primary control and Cancel beside it (space-3).
    expect(screen.queryByTestId("space-add-instance")).toBeNull();
    expect(screen.getByRole("group", { name: "Another instance" })).toBe(card());
    expect(screen.getByTestId("space-groups").lastElementChild!.contains(card())).toBe(true);
    expect(screen.queryByTestId("space-signin-card")).toBeNull();
    expect(field().value).toBe(ORIGIN);
    await waitFor(() => expect(document.activeElement).toBe(field()));
    expect([field().selectionStart, field().selectionEnd]).toEqual([0, ORIGIN.length]);
    const signIn = () => within(card()).getByTestId("space-signin") as HTMLButtonElement;
    expect(signIn().textContent).toBe("Sign in");
    expect(signIn().title).toBe("Signs in to spex.example");
    expect([...card().querySelectorAll("button.bg-brand-600")]).toEqual([signIn()]);
    expect(within(card()).getByTestId("space-signin-cancel").textContent).toBe("Cancel");
    expect(within(card()).queryByTestId("space-signin-body")).toBeNull();

    // Escape closes it, starting and stopping nothing, and Add instance…
    // stands again with focus (space-3).
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(screen.queryByTestId("space-add-card")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(add()));
    expect(calls("space.signin.start")).toEqual([]);
    expect(calls("space.signin.cancel")).toEqual([]);

    // An origin with a path is refused: the card reads the core's cause
    // as one sentence, the field keeping its text and focus, no flow
    // started (space-3, git-host-2).
    fireEvent.click(add());
    fireEvent.change(field(), { target: { value: `${SECOND}/x` } });
    fireEvent.click(signIn());
    await waitFor(() => expect(within(card()).getByTestId("space-signin-error").textContent).toBe(`${REFUSED}.`));
    expect(calls("space.signin.start")).toEqual([{ url: `${SECOND}/x` }]);
    expect(field().value).toBe(`${SECOND}/x`);
    expect(field().readOnly).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(field()));
    expect(within(card()).queryByTestId("space-signin-link")).toBeNull();
    expect(signIn().textContent).toBe("Sign in");
    expect(within(sectionOf(ORIGIN)).queryByTestId("space-signin-error")).toBeNull();

    // The second's origin starts the sign-in there, its flow reading in
    // the card, named by the second's host name (space-3, git-host-3).
    fireEvent.change(field(), { target: { value: SECOND } });
    fireEvent.keyDown(field(), { key: "Enter" });
    const link = (await within(card()).findByTestId("space-signin-link")) as HTMLAnchorElement;
    expect(calls("space.signin.start")).toEqual([{ url: `${SECOND}/x` }, { url: SECOND }]);
    expect(link.textContent).toBe("Open second.example to sign in");
    expect(link.href).toBe(DEVICE("WDJB-MJHT"));
    expect(link.target).toBe("_blank");
    expect(within(card()).getByTestId("space-signin-body").textContent).toContain("Sign in there and approve");
    expect(within(card()).queryByTestId("space-signin-error")).toBeNull();
    expect(signIn().textContent).toBe("Signing in…");
    expect(signIn().disabled).toBe(true);
    expect(field().readOnly).toBe(true);
    // Focus the reader put in the field stays there.
    expect(document.activeElement).toBe(field());
    // No heading reads it, and no heading offers a sign-in.
    expect(within(sectionOf(ORIGIN)).queryByTestId("space-signin-body")).toBeNull();
    deliver(runningAtSecond());
    expect(within(card()).getByTestId("space-signin-link").textContent).toBe("Open second.example to sign in");

    // Signed in there, the card gives way to Add instance… and the new
    // heading, focus landing on its Sign out (DR-010 §6).
    deliver(twoInstances());
    expect(screen.queryByTestId("space-add-card")).toBeNull();
    expect(within(sectionOf(SECOND)).getByRole("heading", { level: 2 }).textContent).toBe("Second Example · Signed in as @jada");
    await waitFor(() => expect(document.activeElement).toBe(within(sectionOf(SECOND)).getByTestId("space-signout")));
    await waitFor(() => expect(add().disabled).toBe(false));
    cleanup();

    // While a heading's flow runs, Add instance… is disabled, and opens
    // nothing; its end enables it again (space-3).
    commandMock.mockClear();
    await renderGroups(signedOutAt(SECOND, {}, twoInstances()), { open: false });
    const again = within(sectionOf(SECOND)).getByTestId("space-signin-again");
    fireEvent.click(again);
    await within(sectionOf(SECOND)).findByTestId("space-signin-link");
    expect(add().disabled).toBe(true);
    fireEvent.click(add());
    expect(screen.queryByTestId("space-add-card")).toBeNull();
    fireEvent.click(within(sectionOf(SECOND)).getByTestId("space-signin-cancel"));
    await waitFor(() => expect(calls("space.signin.cancel")).toEqual([{}]));
    await waitFor(() => expect(add().disabled).toBe(false));
  });

  test("space-3: Cancel stops the flow the card runs and closes it; a flow ended without an account reads in the card with Sign in again, a card opened afresh reading none; a flow another client runs at an unlisted instance reads in the card at the foot", async () => {
    startsAtSecond();
    await renderGroups(base(), { open: false });
    // A denial ends the card's flow: its cause as one sentence, with
    // "Sign in again", the field keeping the origin (space-3).
    fireEvent.click(add());
    fireEvent.change(field(), { target: { value: SECOND } });
    within(card()).getByTestId("space-signin").focus();
    fireEvent.click(within(card()).getByTestId("space-signin"));
    await within(card()).findByTestId("space-signin-link");
    // Sign in, disabled while the flow runs, hands focus to Cancel.
    await waitFor(() => expect(document.activeElement).toBe(within(card()).getByTestId("space-signin-cancel")));
    deliver(runningAtSecond());
    deliver({ ...base(), signIn: { phase: "failed", instance: SECOND, cause: "denied", message: "The sign-in was denied at second.example" } });
    expect(within(card()).getByTestId("space-signin-error").textContent).toBe("The sign-in was denied at second.example.");
    expect(within(card()).queryByTestId("space-signin-link")).toBeNull();
    expect(within(card()).getByTestId("space-signin").textContent).toBe("Sign in again");
    expect(field().value).toBe(SECOND);
    expect(field().readOnly).toBe(false);
    // Cancel closes it, with no flow to stop, focus back.
    fireEvent.click(within(card()).getByTestId("space-signin-cancel"));
    expect(screen.queryByTestId("space-add-card")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(add()));
    expect(calls("space.signin.cancel")).toEqual([]);
    // Opened again, the card is afresh: the first's origin and no cause.
    fireEvent.click(add());
    expect(field().value).toBe(ORIGIN);
    expect(within(card()).queryByTestId("space-signin-error")).toBeNull();
    expect(within(card()).getByTestId("space-signin").textContent).toBe("Sign in");

    // Cancel while the card's flow runs stops it and closes the card,
    // focus back on Add instance… (space-3).
    fireEvent.change(field(), { target: { value: SECOND } });
    fireEvent.click(within(card()).getByTestId("space-signin"));
    await within(card()).findByTestId("space-signin-link");
    deliver(runningAtSecond());
    fireEvent.click(within(card()).getByTestId("space-signin-cancel"));
    expect(screen.queryByTestId("space-add-card")).toBeNull();
    await waitFor(() => expect(calls("space.signin.cancel")).toEqual([{}]));
    deliver(base());
    await waitFor(() => expect(add().disabled).toBe(false));
    expect(document.activeElement).toBe(add());

    // Escape while it runs stops it too.
    fireEvent.click(add());
    fireEvent.change(field(), { target: { value: SECOND } });
    fireEvent.click(within(card()).getByTestId("space-signin"));
    await within(card()).findByTestId("space-signin-link");
    fireEvent.keyDown(within(card()).getByTestId("space-signin-cancel"), { key: "Escape" });
    expect(screen.queryByTestId("space-add-card")).toBeNull();
    await waitFor(() => expect(calls("space.signin.cancel")).toEqual([{}, {}]));
    await waitFor(() => expect(add().disabled).toBe(false));

    // A flow another client runs at an instance the home does not list
    // reads in the card, opened at the foot, the field holding its origin.
    deliver(runningAtSecond("ABCD-EFGH"));
    const link = (await within(card()).findByTestId("space-signin-link")) as HTMLAnchorElement;
    expect(link.textContent).toBe("Open second.example to sign in");
    expect(link.href).toBe(DEVICE("ABCD-EFGH"));
    expect(field().value).toBe(SECOND);
    expect(field().readOnly).toBe(true);
    expect(within(card()).getByTestId("space-signin").textContent).toBe("Signing in…");
    expect(within(sectionOf(ORIGIN)).queryByTestId("space-signin-link")).toBeNull();
    // Its end with the account closes the card.
    deliver(twoInstances());
    expect(screen.queryByTestId("space-add-card")).toBeNull();
    await waitFor(() => expect(add().disabled).toBe(false));
    expect(calls("space.signin.start")).toHaveLength(3);
  });

  test("space-3: Sign in at the default instance's origin, the field unedited, signs that instance in again, and its flow landing closes the card, focus on that heading's Sign out", async () => {
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type !== "space.signin.start") return answer(type, fields);
      return { flow: "device", userCode: "QRST-UVWX", verificationUri: `${ORIGIN}/login/device?user_code=QRST-UVWX`, expiresAt: NOW + 15 * MIN };
    });
    await renderGroups(twoInstances(), { open: false });
    fireEvent.click(add());
    // The field holds the default instance's origin, signed in already;
    // Sign in starts there as it stands (space-3, git-host-2).
    expect(field().value).toBe(ORIGIN);
    within(card()).getByTestId("space-signin").focus();
    fireEvent.click(within(card()).getByTestId("space-signin"));
    const link = (await within(card()).findByTestId("space-signin-link")) as HTMLAnchorElement;
    expect(calls("space.signin.start")).toEqual([{ url: ORIGIN }]);
    expect(link.textContent).toBe("Open spex.example to sign in");
    deliver({
      ...twoInstances(),
      signIn: { phase: "running", instance: ORIGIN, flow: "device", userCode: "QRST-UVWX", verificationUri: `${ORIGIN}/login/device?user_code=QRST-UVWX`, since: NOW },
    });
    // While it runs, the card stays with its flow.
    expect(within(card()).getByTestId("space-signin").textContent).toBe("Signing in…");
    // Signed in there again, the card gives way to Add instance…, and
    // focus lands on that instance heading's Sign out (DR-010 §6).
    deliver(twoInstances());
    await waitFor(() => expect(screen.queryByTestId("space-add-card")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(within(sectionOf(ORIGIN)).getByTestId("space-signout")));
    expect(add().disabled).toBe(false);
    expect(calls("space.signin.cancel")).toEqual([]);
  });

  test.each(["en", "zh"] as const)("space-3: the card opened from Add instance… reads 'Your own group's records will be kept there too.', its flow running or not; the header card does not (%s)", async (language) => {
    activateLanguage(language);
    startsAtSecond();
    const zh = language === "zh";
    const own = zh ? "你自己的群组的记录也会保存在那里。" : "Your own group's records will be kept there too.";
    await renderGroups(base(), { open: false });
    // Nothing says it until the card opens.
    expect(screen.queryByTestId("space-add-own")).toBeNull();
    expect(document.body.textContent).not.toContain(own);
    fireEvent.click(add());
    // The card says it beneath its name, before its field, and it
    // describes the card for assistive technology (space-3).
    const sentence = within(card()).getByTestId("space-add-own");
    expect(sentence.textContent).toBe(own);
    expect(sentence.id).not.toBe("");
    expect(card().getAttribute("aria-describedby")).toBe(sentence.id);
    const textbox = within(card()).getByRole("textbox", { name: zh ? "实例" : "Instance" });
    expect(sentence.compareDocumentPosition(textbox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(card()).getByRole("heading", { level: 2 }).compareDocumentPosition(sentence) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // While the card's flow runs, it still says it, once.
    fireEvent.change(textbox, { target: { value: SECOND } });
    fireEvent.click(within(card()).getByTestId("space-signin"));
    await within(card()).findByTestId("space-signin-link");
    expect(within(card()).getAllByTestId("space-add-own").map((line) => line.textContent)).toEqual([own]);
    expect(within(card()).getByTestId("space-signin-body").textContent).not.toContain(own);
    cleanup();

    // The header's card, the first sign-in while the home lists no
    // instance, does not say it (space-3).
    await renderGroups(noInstance(), { open: false });
    expect(screen.getByTestId("space-signin-card")).toBeTruthy();
    expect(screen.queryByTestId("space-add-own")).toBeNull();
    expect(document.body.textContent).not.toContain(own);
  });

  test.each(["en", "zh"] as const)("space-28, space-1: Add instance… and its card read the catalog's words, every control at most 14 characters, busy forms included, the card stacking below 20rem (%s)", async (language) => {
    activateLanguage(language);
    startsAtSecond();
    const zh = language === "zh";
    await renderGroups(base(), { open: false });
    const name = zh ? "另一个实例" : "Another instance";
    expect(add().textContent).toBe(zh ? "添加实例…" : "Add instance…");
    expect(add().getAttribute("aria-label")).toBe(name);
    expect(add().title).toBe(name);
    const seen: string[] = [add().textContent ?? ""];
    fireEvent.click(add());
    const opened = screen.getByRole("group", { name });
    expect(within(opened).getByRole("heading", { level: 2 }).textContent).toBe(name);
    expect(within(opened).getByRole("textbox", { name: zh ? "实例" : "Instance" })).toBeTruthy();
    const labels = () => within(card()).getAllByRole("button").map((button) => (button.textContent ?? "").trim());
    seen.push(...labels());
    fireEvent.change(within(opened).getByRole("textbox"), { target: { value: SECOND } });
    fireEvent.click(within(card()).getByTestId("space-signin"));
    await within(card()).findByTestId("space-signin-link");
    seen.push(...labels());
    expect(seen).toEqual(
      zh
        ? ["添加实例…", "取消", "登录", "取消", "登录中…"]
        : ["Add instance…", "Cancel", "Sign in", "Cancel", "Signing in…"],
    );
    for (const label of seen) expect(label.length, `"${label}"`).toBeLessThanOrEqual(14);
    // The foot is a container: below 20rem the card's controls stack,
    // Sign in last and full-width (space-28).
    expect(card().parentElement!.className.split(/\s+/)).toContain("@container");
    const row = within(card()).getByTestId("space-signin").parentElement!;
    expect(row.className).toContain("flex-col");
    expect(row.className).toContain("@xs:flex-row");
    const last = [...row.querySelectorAll("button")].at(-1)!;
    expect(last).toBe(within(card()).getByTestId("space-signin"));
    expect(last.className).toContain("w-full");
    expect(last.className).toContain("@xs:w-auto");
  });
});

describe("GROUPS: Forget a signed-out instance (space-82, space-29, space-66, space-1)", () => {
  /** The core's refusal while a clone is still kept under the second
   * instance (space-82), in its own words. */
  const KEPT = "Still kept under Second Example: a-spex";

  /** A home that lists the instances but the one at `origin`. */
  const without = (home: GroupsState, origin: string): GroupsState => {
    const instances = home.instances.filter((entry) => entry.origin !== origin);
    return { ...home, instances, defaultInstance: instances[0]?.origin ?? home.defaultInstance };
  };

  test("space-82, space-29: Forget stands on a signed-out heading only, sends space.forget { instance }, a refusal naming the kept repositories standing beneath the heading with the heading kept; success removes the heading, and with none left the header is the card again", async () => {
    // Signed in at both, no heading offers Forget (space-1).
    await renderGroups(headingsHome(), { open: false });
    expect(screen.queryByTestId("space-forget")).toBeNull();
    cleanup();

    const out = signedOutAt(SECOND, {}, headingsHome());
    let release: (() => void) | undefined;
    let refuse = true;
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type === "space.signin.start") {
        return { flow: "device", userCode: "WDJB-MJHT", verificationUri: `${SECOND}/login/device?user_code=WDJB-MJHT`, expiresAt: NOW + 15 * MIN };
      }
      if (type !== "space.forget") return answer(type, fields);
      // The core answers once the test lets it: refused while a-spex is
      // still kept under the instance, then the home without it.
      await new Promise<void>((resolve) => (release = resolve));
      if (refuse) throw new Error(KEPT);
      return without(out, SECOND);
    });
    await renderGroups(out, { open: false });
    const first = within(sectionOf(ORIGIN));
    const second = within(sectionOf(SECOND));
    // On the signed-out heading alone, beside Sign in again, which stays
    // the last control; its title names the instance and what stays
    // (space-1, space-28).
    expect(first.queryByTestId("space-forget")).toBeNull();
    const forget = second.getByTestId("space-forget") as HTMLButtonElement;
    expect(forget.textContent).toBe("Forget");
    expect(forget.title).toBe("Forgets Second Example on this device; every record stays here");
    const row = second.getByTestId("space-instance-heading").firstElementChild!;
    expect([...row.querySelectorAll("button")].map((button) => button.dataset.testid)).toEqual(["space-forget", "space-signin-again"]);

    // Forget sends the instance's origin and asks nothing first; while it
    // runs it keeps its label, disabled, and no sign-in starts here
    // (space-29, space-28).
    forget.focus();
    fireEvent.click(forget);
    expect(calls("space.forget")).toEqual([{ instance: SECOND }]);
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(forget.disabled).toBe(true));
    expect(forget.textContent).toBe("Forget");
    expect((second.getByTestId("space-signin-again") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(forget);
    expect(calls("space.forget")).toHaveLength(1);

    // Refused, the core's words naming what is still kept stand beneath
    // the heading, which stays with both its controls; the live region
    // says them too, and Forget takes focus again (space-82).
    release!();
    const refusal = await second.findByTestId("space-forget-refusal");
    expect(refusal.textContent).toBe(KEPT);
    expect(refusal.getAttribute("role")).toBe("alert");
    expect(second.getByTestId("space-instance-heading").contains(refusal)).toBe(true);
    expect(live()).toBe(KEPT);
    expect(sectionOf(SECOND)).toBeTruthy();
    await waitFor(() => expect(forget.disabled).toBe(false));
    expect((second.getByTestId("space-signin-again") as HTMLButtonElement).disabled).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(forget));
    expect(first.queryByTestId("space-forget-refusal")).toBeNull();

    // While a sign-in runs at this instance, Forget waits for its end.
    fireEvent.click(second.getByTestId("space-signin-again"));
    await second.findByTestId("space-signin-link");
    expect(forget.disabled).toBe(true);
    fireEvent.click(second.getByTestId("space-signin-cancel"));
    await waitFor(() => expect(calls("space.signin.cancel")).toEqual([{}]));
    await waitFor(() => expect(forget.disabled).toBe(false));

    // Accepted, the reply is the state: the heading leaves the list, the
    // other kept, the live region says so, and focus moves to Add
    // instance… (space-82, DR-010 §6).
    refuse = false;
    release = undefined;
    forget.focus();
    fireEvent.click(forget);
    await waitFor(() => expect(release).toBeDefined());
    release!();
    await waitFor(() => expect(screen.queryByTestId(`space-instance-${SECOND}`)).toBeNull());
    expect(calls("space.forget")).toEqual([{ instance: SECOND }, { instance: SECOND }]);
    expect(sections().map((section) => section.dataset.testid)).toEqual([`space-instance-${ORIGIN}`]);
    expect(live()).toBe("Forgot Second Example");
    expect(screen.queryByTestId("space-forget-refusal")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("space-add-instance")));
    cleanup();

    // Forgetting the one instance the home lists leaves it as before any
    // sign-in: the header is the card again, its field holding the
    // default instance's origin and taking focus, the list holding your
    // own group alone and no Add instance… (space-82, space-1, space-3).
    commandMock.mockReset();
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) =>
      type === "space.forget" ? noInstance() : answer(type, fields),
    );
    await renderGroups(signedOutAt(ORIGIN), { open: false });
    expect(screen.queryByTestId("space-signin-card")).toBeNull();
    const only = within(sectionOf(ORIGIN)).getByTestId("space-forget");
    only.focus();
    fireEvent.click(only);
    await screen.findByTestId("space-signin-card");
    expect(calls("space.forget")).toEqual([{ instance: ORIGIN }]);
    expect(screen.queryAllByTestId(/^space-instance-https?:/)).toEqual([]);
    expect(screen.queryByTestId("space-add-instance")).toBeNull();
    expect(screen.getByTestId("space-own")).toBeTruthy();
    expect(live()).toBe("Forgot Spex Example");
    const card = within(screen.getByTestId("space-signin-card"));
    expect((card.getByTestId("space-signin-instance") as HTMLInputElement).value).toBe(ORIGIN);
    await waitFor(() => expect(document.activeElement).toBe(card.getByTestId("space-signin-instance")));
  });

  test("space-1: with no instance left after a Forget, your own group's heading reads its path while its own repository's placement file stands", async () => {
    // The last instance forgotten: your own group's folder bears the
    // login a sign-in named it after, its own repository's remote and id
    // dropped while its placement files stand (space-82, storage-36).
    const forgotten = ownRepo({ state: "local-only", remote: null, id: null, lastSync: null, placedAt: [ORIGIN, SECOND] });
    const home = noInstance({ own: { name: "jane", named: false, repositories: [forgotten] } });
    await renderGroups(home, { open: false });
    const heading = () => within(screen.getByTestId("space-own")).getByRole("heading", { level: 2 });
    // The heading reads its path, as the core says the folder no longer
    // bears this device's user name — the files standing or not (space-1,
    // space-30).
    expect(heading().textContent).toBe("Only you · @jane");
    expect(screen.queryByText(/named after your login at sign-in/)).toBeNull();
    expect(screen.getByTestId(`space-repo-state-${OWN}`).textContent).toBe("On this computer only — synced once you sign in");
    // Where the core says the folder still bears it — an account named
    // like this device's user, which names nothing — the key phrase
    // stands, those files standing too (space-1, space-30).
    deliver({ ...home, own: { ...home.own, named: true } });
    expect(heading().textContent).toBe("Only you · named after your login at sign-in");
  });

  test("space-82: a refusal speaks of the sign-out it met: signed in again it goes, and a later sign-out reads none", async () => {
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type === "space.forget") throw new Error(KEPT);
      return answer(type, fields);
    });
    const out = signedOutAt(SECOND, {}, headingsHome());
    await renderGroups(out, { open: false });
    fireEvent.click(within(sectionOf(SECOND)).getByTestId("space-forget"));
    expect((await within(sectionOf(SECOND)).findByTestId("space-forget-refusal")).textContent).toBe(KEPT);
    // Signed in there again, the heading carries no Forget and no refusal.
    deliver(headingsHome());
    expect(within(sectionOf(SECOND)).queryByTestId("space-forget")).toBeNull();
    expect(within(sectionOf(SECOND)).queryByTestId("space-forget-refusal")).toBeNull();
    // Signed out again, Forget stands with nothing beneath it.
    deliver(out);
    expect(within(sectionOf(SECOND)).getByTestId("space-forget")).toBeTruthy();
    expect(within(sectionOf(SECOND)).queryByTestId("space-forget-refusal")).toBeNull();
  });
});
