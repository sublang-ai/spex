// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Space surface over a home signed in to two Spaces, each holding a
// group `acme` under the same id (DR-127, DR-172): each Space under its
// own heading in the home's order, "<Space> · @<login>" with New group —
// disabled and titled where the Space says the person may not create one
// — its overflow's "Remove from this list" and Sign out, no read time,
// its read's failure on its heading alone (space-1, git-host-5); the
// registry line beneath each heading (space-119); "Sign in again" whose
// flow reads on its heading (space-3); the rows of a signed-out Space
// (space-61, space-11, space-120); the heading's fit (space-28); the
// card "Sign in to a Space" with its chooser of Spaces (space-3,
// space-115); "Add to a group…" offering each signed-in Space's Personal
// and groups under its display name, a choice naming its Space
// (space-58, space-29); "Open here" naming the Space its row stands
// under (space-63, space-111, space-29); "Add a Space…" at the list's
// foot opening the card in its place (space-1, space-3, space-28); and
// "Remove from this list" on a signed-out heading removing the Space
// from this list, a refusal standing beneath it (space-82, space-29,
// space-1). Each act is checked by the command it sends.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { GroupsState, InstanceGroupState, InstanceState, RegistryState, RepositoryState } from "@sublang/spex-core/protocol";

import { activateLanguage } from "../i18n.js";
import { repositoryRow } from "../fixtures/groups-state.js";
import { deliverServerMessageForTests, setClientForTests } from "../state/store.js";
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

/** Where gamma's code is, as the core phrases it for its row (space-1):
 * outside every Space's Git origin. */
const CODE = "Code: github.com";
/** A project's records on this computer only, in your own group's
 * folder: they have never been at a Space. */
const GAMMA = "jane/gamma-spex";
/** The second Space's records for the same code. */
const LISTED = "@second.example/acme/gamma-spex";

/** A group a Space lists, by its id there. */
function group(id: string, fullPath: string, name: string, repositories: RepositoryState[] = []): InstanceGroupState {
  return { id, login: null, mine: false, fullPath, name, can: NO_CAN, placed: [], repositories };
}

/** A home signed in to the fixtures' Space, as jane, and to the second
 * one, as jada, each listing the given entries, your own group holding
 * the given rows. */
function twoHome(first: InstanceGroupState[], second: InstanceGroupState[], own: RepositoryState[] = [OWN_REPO]): GroupsState {
  const home = twoInstances({ own: { name: "jane", named: false, repositories: own }, instance: { groups: first } });
  return {
    ...home,
    instances: home.instances.map((entry) => (entry.origin === SECOND ? { ...entry, groups: second } : entry)),
  };
}

/** Both Spaces hold `acme` under the id 3; the first also lists bob's
 * records, the second records under a login jane that is not yours
 * there, a group `lab`, and in its `acme` the records of gamma's code.
 * gamma is local only in your own group's folder, and the opened project
 * local only under the first Space's folder. */
function pickHome(): GroupsState {
  const gamma = repositoryRow(GAMMA, { name: "gamma-spex", code: CODE, codeKind: "elsewhere", folder: "/Users/jane/code/gamma" });
  const local = repo({ state: "local-only", remote: null, id: null, code: CODE, codeKind: "elsewhere", branch: null, members: null });
  const listed = repo({ key: LISTED, instance: SECOND, name: "gamma-spex", id: "71", remote: null, code: CODE, codeKind: "elsewhere", folder: null, members: 1, state: "absent", branch: null });
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

/** A row's line at a Space, by its origin, in the row's Sync tab, which
 * the row's name opens where it is not open (space-87, space-1). */
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

/** A Space's section of the groups list, by its origin. */
const sectionOf = (origin: string): HTMLElement => screen.getByTestId(`space-instance-${origin}`);

/** A Space heading's overflow, "More", opened where it is not open
 * (space-1). */
const headingMore = (origin: string): HTMLElement => {
  const section = within(sectionOf(origin));
  if (!section.queryByTestId("space-instance-more-menu")) fireEvent.click(section.getByTestId("space-instance-more"));
  return section.getByTestId("space-instance-more-menu");
};

/** Every Space's section, in the order the list stands them. */
const sections = (): HTMLElement[] => screen.getAllByTestId(/^space-instance-https?:/);

/** A home whose Spaces change as a test says, by origin. */
function changed(home: GroupsState, origin: string, over: Partial<InstanceState>): GroupsState {
  return { ...home, instances: home.instances.map((entry) => (entry.origin === origin ? { ...entry, ...over } : entry)) };
}

/** The first Space lets the person create a group and lists acme holding
 * a-spex; the second, read five minutes ago, says not, and lists — in an
 * order of its own — your records there, bob's, lab and its own acme
 * holding its a-spex. */
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

/** The directory of Spaces the card chooses from (environments-39): both
 * fixtures' Spaces, the first with two sign-in providers. */
const DIRECTORY = {
  spaces: [
    { origin: ORIGIN, displayName: "Spex Example", signIn: ["github", "gitlab"] },
    { origin: SECOND, displayName: "Second Example", signIn: ["gitlab"] },
  ],
};

/** The core answering the directory as `directory` says, the device flow
 * at whatever origin a start names, and everything else as the fixtures
 * do. */
function answering(directory: unknown, extra: Record<string, (fields: Record<string, unknown>) => unknown> = {}): void {
  commandMock.mockImplementation(async (type: string, fields: Record<string, unknown> = {}) => {
    if (extra[type]) return extra[type]!(fields);
    if (type === "registry.directory") {
      if (directory === undefined) throw new Error("The registry could not be read. Try again.");
      return directory;
    }
    if (type === "space.signin.start") {
      return { flow: "device", userCode: "WDJB-MJHT", verificationUri: `${fields.url as string}/login/device?user_code=WDJB-MJHT`, expiresAt: NOW + 15 * MIN };
    }
    return answer(type, fields);
  });
}

describe("SPACE: each Space under its heading (space-1, git-host-5, space-3, space-61, space-11, space-28)", () => {
  test("space-1: headings in home order, each '<Space> · @<login>' with its overflow and Sign out, New group where a read is held — disabled and titled where the Space says not — and no read time", async () => {
    await renderGroups(headingsHome(), { open: false });
    expect(sections().map((section) => section.dataset.testid)).toEqual([`space-instance-${ORIGIN}`, `space-instance-${SECOND}`]);
    expect(screen.getByRole("group", { name: "Second Example" })).toBe(sectionOf(SECOND));
    const first = within(sectionOf(ORIGIN));
    const second = within(sectionOf(SECOND));
    // Each heading carries its display name and the login there, with
    // Sign out, its consequence in its title (space-1, DR-171).
    expect(first.getByRole("heading", { level: 2 }).textContent).toBe("Spex Example · @jane");
    expect(second.getByRole("heading", { level: 2 }).textContent).toBe("Second Example · @jada");
    expect(first.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(second.getByRole("button", { name: "Sign out" }).getAttribute("title")).toBe(
      "Signs this computer out of Second Example; every record stays here",
    );
    // No read time stands on a heading (space-1).
    expect(screen.queryByTestId("space-read-at")).toBeNull();
    expect(document.body.textContent).not.toMatch(/Read (just now|\d+m ago)|Not read yet/);
    // New group where the Space lets the person create one; disabled and
    // titled where it says not — no link, no sentence (space-1, DR-120).
    const firstNew = first.getByTestId("space-new-group") as HTMLButtonElement;
    expect(firstNew.textContent).toBe("New group");
    expect(firstNew.disabled).toBe(false);
    expect(firstNew.hasAttribute("title")).toBe(false);
    const secondNew = second.getByTestId("space-new-group") as HTMLButtonElement;
    expect(secondNew.disabled).toBe(true);
    expect(secondNew.title).toBe("Made by the people who run Second Example");
    expect(screen.queryByText(/Groups are made by/)).toBeNull();
    // One overflow, "More", holding "Remove from this list", disabled
    // while signed in (space-1, space-82).
    const menu = headingMore(SECOND);
    const remove = within(menu).getByTestId("space-instance-remove") as HTMLButtonElement;
    expect(within(remove).getByText("Remove from this list")).toBeTruthy();
    expect(within(remove).getByText("Sign out first")).toBeTruthy();
    expect(remove.disabled).toBe(true);
    expect(within(menu).getAllByRole("menuitem")).toEqual([remove]);
    // The heading's controls, the primary last (space-28).
    const row = second.getByTestId("space-instance-heading").firstElementChild!;
    expect([...row.querySelectorAll(":scope > button, :scope > span > button")].map((button) => button.getAttribute("data-testid"))).toEqual([
      "space-new-group",
      "space-instance-more",
      "space-signout",
    ]);
    // Beneath each heading its own entries: Personal while it holds a
    // row, then every group by its name in the order of their paths — its
    // path beside it where the two differ — then another account's login
    // as "Shared by @<login>" (space-1).
    expect(first.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["Personal", "Acme · acme"]);
    expect(second.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "Acme Works · acme",
      "lab",
      "Shared by @bob",
    ]);
    // Each acme stands beneath its own Space, holding its own rows.
    expect(first.getByTestId("space-row-@spex.example/acme/a-spex")).toBeTruthy();
    expect(second.getByTestId("space-row-@second.example/acme/a-spex")).toBeTruthy();
    expect(first.queryByTestId("space-row-@second.example/acme/a-spex")).toBeNull();
    // New group makes a root group at the Space whose heading carries it
    // (space-68).
    fireEvent.click(firstNew);
    const editor = first.getByTestId("space-new-group-editor");
    fireEvent.change(within(editor).getByLabelText("Group name"), { target: { value: "Workshop" } });
    fireEvent.click(within(editor).getByRole("button", { name: "Create" }));
    await waitFor(() => expect(calls("space.group.create")).toEqual([{ instance: ORIGIN, name: "Workshop", path: "workshop", parent: null }]));
    cleanup();

    // Before a read is held, no New group (space-1).
    await renderGroups(changed(headingsHome(), ORIGIN, { readAt: null }), { open: false });
    expect(within(sectionOf(ORIGIN)).queryByTestId("space-new-group")).toBeNull();
    expect(within(sectionOf(SECOND)).getByTestId("space-new-group")).toBeTruthy();
  });

  test("space-1, git-host-5: a failed read reads on its heading alone, the other's view kept, and Refresh, titled with the last read, reads until every read's outcome", async () => {
    const home = changed(headingsHome(), ORIGIN, { read: { phase: "failed", message: "Could not reach Spex Example" } });
    await renderGroups(home, { open: false });
    const first = within(sectionOf(ORIGIN));
    const second = within(sectionOf(SECOND));
    // The failure stands on the first's heading alone, its last view kept
    // (space-1).
    expect(first.getByTestId("space-read-error").textContent).toBe("Could not reach Spex Example");
    expect(first.getByRole("alert")).toBe(first.getByTestId("space-read-error"));
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(first.getByTestId("space-row-@spex.example/acme/a-spex")).toBeTruthy();
    // The second's view and its controls stand as they were.
    expect(second.queryByTestId("space-read-error")).toBeNull();
    expect(second.getByTestId("space-row-@second.example/acme/a-spex")).toBeTruthy();
    // Refresh offers the ordinary retry, titled with when the Spaces were
    // last read; while any read runs it reads "Reading…" until every
    // read's outcome (space-1).
    const refresh = screen.getByTestId("space-refresh") as HTMLButtonElement;
    expect(refresh.disabled).toBe(false);
    expect(refresh.title).toBe("Last refreshed 1m ago");
    deliver(changed(home, SECOND, { read: { phase: "running" } }));
    expect(refresh.textContent).toBe("Reading…");
    expect(refresh.disabled).toBe(true);
    deliver(changed(changed(home, SECOND, { readAt: NOW }), ORIGIN, { read: { phase: "idle" } }));
    expect(refresh.textContent).toBe("Refresh");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(refresh.title).toBe("Last refreshed just now");
  });

  test("space-3: Sign in again's flow reads on that heading as 'Continue in your browser' and 'Open <Space>'; every other sign-in control is disabled while it runs", async () => {
    answering(undefined);
    const out = signedOutAt(SECOND, {}, signedOutAt(ORIGIN, {}, headingsHome()));
    await renderGroups(out, { open: false });
    const first = within(sectionOf(ORIGIN));
    const second = within(sectionOf(SECOND));
    const firstAgain = first.getByTestId("space-signin-again") as HTMLButtonElement;
    const secondAgain = second.getByTestId("space-signin-again") as HTMLButtonElement;
    expect(firstAgain.title).toBe("Opens Spex Example in your browser");
    expect(screen.queryByTestId("space-signin-card")).toBeNull();
    // Signed out by the reader, the heading reads its name alone.
    expect(second.getByRole("heading", { level: 2 }).textContent).toBe("Second Example");

    // The second's Sign in again starts the sign-in at its origin, its
    // flow reading on its heading alone, the code never shown (space-3).
    fireEvent.click(secondAgain);
    const link = (await second.findByTestId("space-signin-link")) as HTMLAnchorElement;
    expect(calls("space.signin.start")).toEqual([{ url: SECOND }]);
    expect(link.textContent).toBe("Open Second Example");
    expect(link.href).toBe(`${SECOND}/login/device?user_code=WDJB-MJHT`);
    expect(link.target).toBe("_blank");
    expect(second.getByTestId("space-signin-finish").textContent).toBe("Continue in your browser·Open Second Example");
    expect(second.getByTestId("space-signin-body").textContent).not.toContain("WDJB-MJHT");
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

    // A failure reads on the heading whose flow it was, its cause as the
    // core's phrase (space-3, DR-069).
    fireEvent.click(secondAgain);
    await second.findByTestId("space-signin-link");
    deliver({ ...out, signIn: { phase: "running", instance: SECOND, flow: "device", since: NOW } });
    deliver({ ...out, signIn: { phase: "failed", instance: SECOND, cause: "denied", message: "The sign-in was denied at Second Example" } });
    expect(second.getByTestId("space-signin-error").textContent).toBe("The sign-in was denied at Second Example");
    expect(first.queryByTestId("space-signin-error")).toBeNull();
    expect(secondAgain.textContent).toBe("Sign in again");

    // Signed in there, focus lands on its heading's Sign out (DR-010 §6).
    firstAgain.focus();
    fireEvent.click(firstAgain);
    await first.findByTestId("space-signin-link");
    await waitFor(() => expect(document.activeElement).toBe(first.getByTestId("space-signin-cancel")));
    deliver(signedOutAt(SECOND, {}, headingsHome()));
    expect(first.getByRole("heading", { level: 2 }).textContent).toBe("Spex Example · @jane");
    await waitFor(() => expect(document.activeElement).toBe(first.getByRole("button", { name: "Sign out" })));
  });

  test.each(["en", "zh"] as const)("space-3, space-66: where the Space signed this computer out, its heading reads '<Space> · signed out · @<login>' beside Sign in again and its overflow's Remove from this list (%s)", async (language) => {
    activateLanguage(language);
    const zh = language === "zh";
    await renderGroups(signedOutAt(SECOND, { byHost: true }, headingsHome()), { open: false });
    const second = within(sectionOf(SECOND));
    expect(second.getByRole("heading", { level: 2 }).textContent).toBe(
      zh ? "Second Example · 已退出登录 · @jada" : "Second Example · signed out · @jada",
    );
    expect(second.getByTestId("space-signin-again").textContent).toBe(zh ? "重新登录" : "Sign in again");
    const remove = within(headingMore(SECOND)).getByTestId("space-instance-remove") as HTMLButtonElement;
    expect(remove.textContent).toBe(zh ? "从列表中移除" : "Remove from this list");
    expect(remove.disabled).toBe(false);
    // No sentence stands beneath the heading.
    expect(screen.queryByTestId("space-signed-out-by-host")).toBeNull();
    expect(second.getByTestId("space-instance-heading").querySelectorAll("p")).toHaveLength(0);
  });

  test("space-61, space-11, space-120: under a signed-out heading a row reads 'Signed out of <Space>' with no Retry and no Leave; a row still read reachable there refuses Sync now with 'Sign in to <Space> first'", async () => {
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
      // Your own group's own records, their clone here, which the second
      // lists too, are governed by the second once the first is signed
      // out (git-host-5).
      [ownRepo({ governing: SECOND, branch: BRANCH })],
    );
    await renderGroups(signedOutAt(ORIGIN, {}, home), { open: false });
    // The controls a row's state offers, beside its name and its "More".
    const controls = (key: string) =>
      within(screen.getByTestId(`space-row-${key}`))
        .getAllByRole("button")
        .filter((button) => !button.dataset.testid?.startsWith("space-repo-") && !button.dataset.testid?.startsWith("space-row-more-"));
    // Signed out, a row at the Space reads "Signed out of <Space>" and
    // offers no Retry, and no row a sign-in: its heading's Sign in again
    // is the one (space-61, space-120, space-3).
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("Signed out of Spex Example");
    expect(controls(KEY)).toEqual([]);
    // No row offers Leave…, Place at… or Move… (DR-172).
    expect(within(moreOf(KEY)).queryByTestId(`space-row-leave-${KEY}`)).toBeNull();
    expect(screen.queryByText(/^(Leave…|Place at…|Move…)$/)).toBeNull();
    // A row still read reachable there refuses "Sync now" naming the
    // Space, the reason beside the disabled entry, and its line offers no
    // Members (space-11, space-87).
    const sync = within(moreOf(stale)).getByTestId(`space-row-sync-${stale}`) as HTMLButtonElement;
    expect(sync.disabled).toBe(true);
    expect(within(sync).getByText("Sign in to Spex Example first")).toBeTruthy();
    expect(within(lineAt(stale, ORIGIN)).queryByTestId("space-line-members")).toBeNull();
    // A path remote is reached without the Space, so it retries.
    expect(controls(pathRemote).map((button) => button.textContent)).toEqual(["Retry"]);
    // The other Space, signed in, retries its own (space-2).
    expect(controls("@second.example/acme/c-spex").map((button) => button.textContent)).toEqual(["Retry"]);
    // Your own group's own records follow the signed-in Space governing
    // them: "Sync now" stands, and Members on its line (space-60, space-1).
    expect((within(moreOf(OWN_REPO.key)).getByTestId(`space-row-sync-${OWN_REPO.key}`) as HTMLButtonElement).disabled).toBe(false);
    expect(within(lineAt(OWN_REPO.key, ORIGIN)).getByTestId("space-line-members")).toBeTruthy();
    cleanup();

    // Governed by none, with no signed-in Space to follow, they wait for
    // their own, named by its host name before any read (space-11,
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

  test("space-62, space-69: a row's members panel reads the roles and the display name of the Space the core names as governing it, its Share field 'Login at <Space>'", async () => {
    // Signed out of the first; the third, listed before the second and
    // signed in, does not list your own group's own records, which the
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
    // Members on its line reads that copy from the core, and Share offers
    // the governing Space's login field and roles (space-62, space-69).
    fireEvent.click(within(lineAt(OWN_REPO.key, ORIGIN)).getByTestId("space-line-members"));
    const panel = await screen.findByTestId(`space-members-${OWN_REPO.key}@${ORIGIN}`);
    await within(panel).findAllByTestId(/^space-member-/);
    expect(calls("space.members")).toEqual([{ repository: OWN_REPO.key, instance: ORIGIN }]);
    fireEvent.click(within(panel).getByTestId(`space-share-${OWN_REPO.key}@${ORIGIN}`));
    const editor = within(panel).getByTestId(`space-share-${OWN_REPO.key}@${ORIGIN}-editor`);
    expect(within(editor).getByLabelText("Login at Second Example")).toBeTruthy();
    expect(within(within(editor).getByRole("listbox", { name: "Role" })).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Viewer",
      "Editor",
    ]);
  });

  test("space-28: every heading control reads at most 14 characters, busy forms included, and the heading stacks below 20rem, its primary control last and full-width", async () => {
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
    for (const label of ["New group", "Sign out", "Signing out…", "Sign in again", "Signing in…", "Cancel", "⋯More"]) {
      expect(seen, label).toContain(label);
    }
    // Each Space is a container; below 20rem its fields stack, the
    // primary control last and full-width.
    for (const section of sections()) {
      expect(section.className.split(/\s+/)).toContain("@container");
      const row = within(section).getByTestId("space-instance-heading").firstElementChild!;
      expect(row.className).toContain("flex-col");
      expect(row.className).toContain("@xs:flex-row");
      const last = [...row.querySelectorAll("button")].at(-1)!;
      expect(last.className).toContain("w-full");
      expect(last.className).toContain("@xs:w-auto");
    }
  });

  test.each(["en", "zh"] as const)("space-28, space-6, space-82: the heading's controls and the notes of Sign out and Remove from this list read the catalog's words (%s)", async (language) => {
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
    expect((screen.getByTestId("space-refresh") as HTMLButtonElement).title).toBe(zh ? "上次刷新：1 分钟前" : "Last refreshed 1m ago");
    // "Remove from this list" reads the catalog's words, and its note
    // (space-82).
    const remove = within(headingMore(SECOND)).getByTestId("space-instance-remove") as HTMLButtonElement;
    expect(remove.textContent).toBe(zh ? "从列表中移除" : "Remove from this list");
    expect(remove.title).toBe(zh ? "所有记录仍保留在本机" : "Every record stays on this computer");
    fireEvent.click(remove);
    await waitFor(() => expect(screen.queryByTestId(`space-instance-${SECOND}`)).toBeNull());
    expect(live()).toBe(zh ? "已从列表中移除 Second Example" : "Removed Second Example from this list");
  });
});

describe("SPACE: the registry line beneath each heading (space-119, DR-168)", () => {
  /** The registry at the first Space, as the core reports it
   * (core-service-143). */
  const registry = (over: Partial<RegistryState> = {}): RegistryState => ({
    origin: ORIGIN,
    displayName: "Spex Example",
    account: null,
    signIn: { phase: "idle" },
    error: null,
    ...over,
  });

  test("space-119: 'Registry' with Sign in, titled 'For publishing and private packages', starts that registry's sign-in at the Space's origin and reads on the line as the card's; signed in, 'Registry · signed in as @<login>', the heading unchanged; a Space the directory does not list carries none", async () => {
    answering(
      { spaces: [DIRECTORY.spaces[0]] },
      {
        "registry.get": () => registry(),
        "registry.signin.start": (fields) => ({
          flow: "device",
          userCode: "QRST-UVWX",
          verificationUri: `${fields.origin as string}/login/device?user_code=QRST-UVWX`,
          expiresAt: NOW + 15 * MIN,
          interval: 5,
        }),
        "registry.signin.cancel": () => ({ stopped: true }),
      },
    );
    await renderGroups(twoInstances(), { open: false });
    const first = within(sectionOf(ORIGIN));
    // The directory lists the first Space alone: its line stands, the
    // second carries none (space-119).
    const line = await first.findByTestId("space-registry");
    expect(within(sectionOf(SECOND)).queryByTestId("space-registry")).toBeNull();
    await waitFor(() => expect(calls("registry.get")).toEqual([{ origin: ORIGIN }]));
    expect(line.textContent).toBe("RegistrySign in");
    const signIn = within(line).getByTestId("space-registry-signin") as HTMLButtonElement;
    expect(signIn.title).toBe("For publishing and private packages");
    // Its sign-in starts at the Space's origin, reading on the line as the
    // card's does: "Continue in your browser" and "Open <Space>", the code
    // never shown, with Cancel (space-119, space-3).
    fireEvent.click(signIn);
    await waitFor(() => expect(calls("registry.signin.start")).toEqual([{ origin: ORIGIN }]));
    const link = (await within(line).findByTestId("space-registry-signin-link")) as HTMLAnchorElement;
    expect(link.textContent).toBe("Open Spex Example");
    expect(link.href).toBe(`${ORIGIN}/login/device?user_code=QRST-UVWX`);
    expect(line.textContent).not.toContain("QRST-UVWX");
    expect(signIn.textContent).toBe("Signing in…");
    expect(signIn.disabled).toBe(true);
    expect(calls("space.signin.start")).toEqual([]);
    // Cancel stops it.
    fireEvent.click(within(line).getByTestId("space-registry-cancel"));
    await waitFor(() => expect(calls("registry.signin.cancel")).toEqual([{ origin: ORIGIN }]));
    expect(within(line).queryByTestId("space-registry-signin-link")).toBeNull();
    // Signed in at the registry, the line says so; the Space's heading is
    // unchanged and the line holds no package control (space-119).
    deliverServerMessageForTests({ type: "registry.state", state: registry({ account: { id: "7", login: "jane" } }) });
    await waitFor(() => expect(first.getByTestId("space-registry").textContent).toBe("Registry · signed in as @jane"));
    expect(within(first.getByTestId("space-registry")).queryAllByRole("button")).toEqual([]);
    expect(first.getByRole("heading", { level: 2 }).textContent).toBe("Spex Example · @jane");
  });

  test("space-119: where the directory cannot be read, every Space's heading carries its registry line", async () => {
    answering(undefined, { "registry.get": (fields) => registry({ origin: fields.origin as string, displayName: "Registry there" }) });
    await renderGroups(twoInstances(), { open: false });
    await waitFor(() => expect(screen.getAllByTestId("space-registry")).toHaveLength(2));
    expect(within(sectionOf(SECOND)).getByTestId("space-registry").textContent).toBe("RegistrySign in");
  });
});

describe("SPACE: the card 'Sign in to a Space' (space-3, space-115, space-66)", () => {
  const card = (): HTMLElement => screen.getByTestId("space-signin-card");

  test("space-3, space-115: listing no Space, the header is the card titled by its act with no sentence; with no directory the field 'Space address' stands alone holding the default Space's origin", async () => {
    answering(undefined);
    await renderGroups(noInstance(), { open: false });
    const header = within(card());
    expect(header.getByRole("heading", { level: 2 }).textContent).toBe("Sign in to a Space");
    expect(screen.getByRole("group", { name: "Sign in to a Space" })).toBe(card());
    await waitFor(() => expect(calls("registry.directory")).toHaveLength(1));
    expect(header.queryByTestId("space-signin-chooser")).toBeNull();
    const field = header.getByRole("textbox", { name: "Space address" }) as HTMLInputElement;
    expect(field.value).toBe(ORIGIN);
    // One primary control, Sign in, its consequence as its title; no
    // sentence, no home path, Copy path or Refresh (space-3, space-66).
    const signIn = header.getByTestId("space-signin") as HTMLButtonElement;
    expect(signIn.textContent).toBe("Sign in");
    expect(signIn.title).toBe("Opens spex.example in your browser");
    expect([...card().querySelectorAll("button.bg-brand-600")]).toEqual([signIn]);
    expect(card().querySelectorAll("p")).toHaveLength(0);
    expect(card().textContent).toBe("Sign in to a SpaceSpace addressSign in");
    expect(screen.queryByTestId("space-refresh")).toBeNull();
    expect(screen.queryByTestId("space-home")).toBeNull();
    expect(screen.queryByTestId("space-add-space")).toBeNull();
    // Enter in the field starts the sign-in at the origin it holds.
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() => expect(calls("space.signin.start")).toEqual([{ url: ORIGIN }]));
  });

  test("space-115, space-3: with a directory, one chooser lists its Spaces by display name with the chosen one's providers as icons, preselecting the default Space; a choice starts at its origin, and the flow reads 'Continue in your browser' with 'Open <Space>' and Cancel", async () => {
    answering(DIRECTORY);
    await renderGroups(noInstance(), { open: false });
    const chooser = (await within(card()).findByTestId("space-signin-chooser")) as HTMLSelectElement;
    expect(within(card()).getByRole("combobox", { name: "Space" })).toBe(chooser);
    expect([...chooser.options].map((option) => option.textContent)).toEqual(["Spex Example", "Second Example", "Other Space…"]);
    expect(chooser.value).toBe(ORIGIN);
    // No field beside a chosen Space (space-115).
    expect(within(card()).queryByRole("textbox")).toBeNull();
    const icons = () => within(card()).getAllByRole("img").map((icon) => icon.getAttribute("title"));
    expect(icons()).toEqual(["Sign in with GitHub", "Sign in with GitLab"]);
    fireEvent.change(chooser, { target: { value: SECOND } });
    expect(icons()).toEqual(["Sign in with GitLab"]);
    const signIn = within(card()).getByTestId("space-signin") as HTMLButtonElement;
    expect(signIn.title).toBe("Opens Second Example in your browser");
    fireEvent.click(signIn);
    await waitFor(() => expect(calls("space.signin.start")).toEqual([{ url: SECOND }]));
    // The flow reads in the card: no code shown, Sign in busy beside
    // Cancel, the choice standing (space-3).
    const link = (await within(card()).findByTestId("space-signin-link")) as HTMLAnchorElement;
    expect(link.textContent).toBe("Open Second Example");
    expect(link.href).toBe(`${SECOND}/login/device?user_code=WDJB-MJHT`);
    expect(link.target).toBe("_blank");
    expect(within(card()).getByTestId("space-signin-finish").textContent).toBe("Continue in your browser·Open Second Example");
    expect(card().textContent).not.toContain("WDJB-MJHT");
    expect(signIn.textContent).toBe("Signing in…");
    expect(signIn.disabled).toBe(true);
    expect(chooser.disabled).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(within(card()).getByTestId("space-signin-cancel")));
    // Cancel brings back the chooser and Sign in (space-66).
    fireEvent.click(within(card()).getByTestId("space-signin-cancel"));
    await waitFor(() => expect(calls("space.signin.cancel")).toEqual([{}]));
    await waitFor(() => expect(signIn.textContent).toBe("Sign in"));
    expect(chooser.disabled).toBe(false);
    expect(within(card()).queryByTestId("space-signin-link")).toBeNull();
    // A denial reads the core's cause with "Sign in again" (space-3).
    deliver(noInstance({ signIn: { phase: "failed", instance: SECOND, cause: "denied", message: "The sign-in was denied at Second Example." } }));
    expect(within(card()).getByTestId("space-signin-error").textContent).toBe("The sign-in was denied at Second Example");
    expect(signIn.textContent).toBe("Sign in again");
  });

  test("space-115: 'Other Space…' reveals the field 'Space address', empty with its placeholder, whose typed origin starts the sign-in; a default the directory does not list preselects it, the field holding that origin", async () => {
    answering(DIRECTORY);
    await renderGroups(noInstance(), { open: false });
    const chooser = (await within(card()).findByTestId("space-signin-chooser")) as HTMLSelectElement;
    fireEvent.change(chooser, { target: { value: "other" } });
    const field = within(card()).getByRole("textbox", { name: "Space address" }) as HTMLInputElement;
    expect(field.value).toBe("");
    expect(field.placeholder).toBe("https://…");
    expect(within(card()).queryByRole("img")).toBeNull();
    const signIn = within(card()).getByTestId("space-signin") as HTMLButtonElement;
    expect(signIn.disabled).toBe(true);
    fireEvent.change(field, { target: { value: "https://third.example" } });
    expect(signIn.disabled).toBe(false);
    fireEvent.click(signIn);
    await waitFor(() => expect(calls("space.signin.start")).toEqual([{ url: "https://third.example" }]));
    cleanup();

    // The default Space unlisted: "Other Space…" stands chosen, its field
    // holding that origin (space-115). A new connection reads the
    // directory afresh.
    installClient();
    answering({ spaces: [DIRECTORY.spaces[1]] });
    await renderGroups(noInstance(), { open: false });
    const unlisted = (await within(card()).findByTestId("space-signin-chooser")) as HTMLSelectElement;
    expect(unlisted.value).toBe("other");
    expect((within(card()).getByRole("textbox", { name: "Space address" }) as HTMLInputElement).value).toBe(ORIGIN);
  });
});

describe("SPACE: Add to a group… at each Space (space-58, space-29)", () => {
  test("space-58: the picker offers each signed-in Space's Personal and groups under its display name, never another login, with no name field; a choice names its Space; records keyed under a Space are offered that Space alone", async () => {
    await renderGroups(pickHome(), { open: false });
    const openPicker = (key: string): HTMLElement => {
      fireEvent.click(screen.getByTestId(`space-row-pick-${key}`));
      return screen.getByTestId(`space-picker-${key}`);
    };
    const section = (origin: string): HTMLElement => screen.getByTestId(`space-pick-instance-${origin}`);
    // One section per signed-in Space in the home's order, each under its
    // display name (space-58).
    const picker = openPicker(GAMMA);
    expect(picker).toBe(screen.getByRole("group", { name: "Add gamma to a group" }));
    const sections = within(picker).getAllByTestId(/^space-pick-instance-/);
    expect(sections.map((each) => each.dataset.testid)).toEqual([`space-pick-instance-${ORIGIN}`, `space-pick-instance-${SECOND}`]);
    expect(sections.map((each) => within(each).getByRole("heading", { level: 3 }).textContent)).toEqual(["Spex Example", "Second Example"]);
    expect(within(picker).getByRole("group", { name: "Second Example" })).toBe(sections[1]);
    // Under each, "Personal" first, then every group it lists by its name
    // with its path after it where the two differ; another account's
    // login is never offered (space-58).
    expect(options(sections[0]!, "space-pick-group-")).toEqual([
      ["@jane", "Personal"],
      ["acme", "Acme · acme"],
    ]);
    expect(options(sections[1]!, "space-pick-group-")).toEqual([
      ["@jada", "Personal"],
      ["acme", "Acme Works · acme"],
      ["lab", "lab"],
    ]);
    // The records listed for the same code stand at their own Space
    // alone, under "Join the records already in", their group read as
    // the list reads it; the groups under "Share into" (space-58).
    expect(within(sections[0]!).queryAllByTestId(/^space-pick-repo-/)).toEqual([]);
    expect(within(sections[1]!).getByTestId(`space-pick-listed-group-${LISTED}`).textContent).toBe("Acme Works · acme");
    expect(within(sections[1]!).getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent)).toEqual([
      "Join the records already in",
      "Share into",
    ]);
    // No field names the new records (space-58, DR-172).
    expect(within(picker).queryByTestId(`space-pick-name-${GAMMA}`)).toBeNull();
    expect(within(picker).queryByRole("textbox")).toBeNull();
    expect(document.activeElement).toBe(within(sections[0]!).getByTestId("space-pick-group-@jane"));

    // Each choice names the Space of its section: the second's acme, the
    // first's acme under the same id, Personal at the second, and the
    // records the second lists (space-58, space-29).
    fireEvent.click(within(section(SECOND)).getByTestId("space-pick-group-acme"));
    await waitFor(() =>
      expect(calls("space.pick")).toEqual([
        { repository: GAMMA, choice: { kind: "create", instance: SECOND, groupId: "3", name: "gamma" } },
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

    // Records keyed under the first Space are offered that Space alone
    // (space-58).
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

    // Signed out of the first while the second is signed in, records keyed
    // under the first read no phrase and offer "Add to a group…" disabled,
    // titled "Sign in to a Space first" — the one Space it would offer is
    // signed out — and records in your own group's folder are offered the
    // second alone (space-58, space-61).
    commandMock.mockClear();
    await renderGroups(signedOutAt(ORIGIN, {}, pickHome()), { open: false });
    expect(screen.queryByTestId(`space-repo-state-${KEY}`)?.textContent ?? "").toBe("");
    const blocked = screen.getByTestId(`space-row-pick-${KEY}`) as HTMLButtonElement;
    expect(blocked.disabled).toBe(true);
    expect(blocked.title).toBe("Sign in to a Space first");
    const second = openPicker(GAMMA);
    expect(within(second).getAllByTestId(/^space-pick-instance-/).map((each) => each.dataset.testid)).toEqual([
      `space-pick-instance-${SECOND}`,
    ]);
    expect(within(section(SECOND)).getByTestId(`space-pick-repo-${LISTED}`)).toBeTruthy();
  });
});

describe("SPACE: Open here at the row's Space (space-63, space-111, space-29)", () => {
  const FIRST_DOCS = "@spex.example/acme/team/docs-spex";
  const SECOND_DOCS = "@second.example/acme/team/docs-spex";

  /** Each Space lists a project this computer lacks at the same path,
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

  test("space-63, space-29: Open here sends the Space its row stands under", async () => {
    // The first Space's row opens at the first, with its id.
    await renderGroups(joinHome(), { open: false });
    await joinInto(FIRST_DOCS, "/Users/jane/code/docs");
    await waitFor(() => expect(calls("space.join")).toEqual([{ instance: ORIGIN, hostId: "52", folder: "/Users/jane/code/docs" }]));
    cleanup();

    // With the second listed first, its row stands under its heading and
    // opens there, with its own id.
    commandMock.mockClear();
    const home = joinHome();
    await renderGroups({ ...home, defaultInstance: SECOND, instances: [...home.instances].reverse() }, { open: false });
    await joinInto(SECOND_DOCS, "/Users/jane/code/docs-second");
    await waitFor(() =>
      expect(calls("space.join")).toEqual([{ instance: SECOND, hostId: "62", folder: "/Users/jane/code/docs-second" }]),
    );
  });
});

describe("SPACE: Add a Space… at the list's foot (space-1, space-3, space-28, space-115)", () => {
  /** The core's one refusal of an address with more than an origin
   * (core-service-145). */
  const REFUSED = "Enter just the Space's address, like https://spex.sublang.ai";
  const DEVICE = (code: string) => `${SECOND}/login/device?user_code=${code}`;

  /** The start answered by the device flow at the second Space, and
   * refused by the origin rule for any other URL than an origin; the
   * directory unreadable. */
  function startsAtSecond(): void {
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type === "registry.directory") throw new Error("The registry could not be read. Try again.");
      if (type !== "space.signin.start") return answer(type, fields);
      if (!/^https:\/\/[^/]+$/.test(fields?.url as string)) throw new Error(REFUSED);
      return { flow: "device", userCode: "WDJB-MJHT", verificationUri: `${fields?.url as string}/login/device?user_code=WDJB-MJHT`, expiresAt: NOW + 15 * MIN };
    });
  }

  /** The sign-in the core reports running at the second Space. */
  const runningAtSecond = (code = "WDJB-MJHT"): GroupsState => ({
    ...base(),
    signIn: { phase: "running", instance: SECOND, flow: "device", userCode: code, verificationUri: DEVICE(code), since: NOW },
  });

  const add = (): HTMLButtonElement => screen.getByTestId("space-add-space") as HTMLButtonElement;
  const card = (): HTMLElement => screen.getByTestId("space-add-card");
  const field = (): HTMLInputElement => within(card()).getByRole("textbox", { name: "Space address" }) as HTMLInputElement;

  test("space-1: Add a Space… stands at the list's foot, absent while the home lists none", async () => {
    await renderGroups(headingsHome(), { open: false });
    expect(add().textContent).toBe("Add a Space…");
    expect(add().disabled).toBe(false);
    // At the list's foot: inside the list, after every Space's section.
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

    // Signed out of the one Space it lists, the home still lists it, and
    // the foot stands beneath its heading.
    await renderGroups(signedOutAt(ORIGIN), { open: false });
    expect(sectionOf(ORIGIN).compareDocumentPosition(add()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    cleanup();

    // Listing none, the header is the card and no foot stands (space-1,
    // space-3).
    await renderGroups(noInstance(), { open: false });
    expect(screen.getByTestId("space-signin-card")).toBeTruthy();
    expect(screen.queryByTestId("space-add-space")).toBeNull();
  });

  test("space-3: it opens the card 'Sign in to a Space' in its place, the field alone holding the default Space's origin where no directory reads; Escape closes it, focus back; an origin the core refuses reads in the card with the field kept; a second origin starts the flow there; Add a Space… is disabled while any flow runs", async () => {
    startsAtSecond();
    await renderGroups(base(), { open: false });
    fireEvent.click(add());
    // The card stands in its place, titled by its act, its field holding
    // the default Space's origin, focused and selected, with Sign in its
    // one primary control and Cancel beside it, and no sentence (space-3).
    expect(screen.queryByTestId("space-add-space")).toBeNull();
    expect(screen.getByRole("group", { name: "Sign in to a Space" })).toBe(card());
    expect(screen.getByTestId("space-groups").lastElementChild!.contains(card())).toBe(true);
    expect(screen.queryByTestId("space-signin-card")).toBeNull();
    expect(field().value).toBe(ORIGIN);
    await waitFor(() => expect(document.activeElement).toBe(field()));
    expect([field().selectionStart, field().selectionEnd]).toEqual([0, ORIGIN.length]);
    const signIn = () => within(card()).getByTestId("space-signin") as HTMLButtonElement;
    expect(signIn().textContent).toBe("Sign in");
    expect(signIn().title).toBe("Opens Spex Example in your browser");
    expect([...card().querySelectorAll("button.bg-brand-600")]).toEqual([signIn()]);
    expect(within(card()).getByTestId("space-signin-cancel").textContent).toBe("Cancel");
    expect(within(card()).queryByTestId("space-signin-body")).toBeNull();
    expect(card().querySelectorAll("p")).toHaveLength(0);

    // Escape closes it, starting and stopping nothing, and Add a Space…
    // stands again with focus (space-3).
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(screen.queryByTestId("space-add-card")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(add()));
    expect(calls("space.signin.start")).toEqual([]);
    expect(calls("space.signin.cancel")).toEqual([]);

    // An origin with a path is refused: the card reads the core's cause,
    // the field keeping its text and focus, no flow started (space-3,
    // git-host-2).
    fireEvent.click(add());
    fireEvent.change(field(), { target: { value: `${SECOND}/x` } });
    fireEvent.click(signIn());
    await waitFor(() => expect(within(card()).getByTestId("space-signin-error").textContent).toBe(REFUSED));
    expect(calls("space.signin.start")).toEqual([{ url: `${SECOND}/x` }]);
    expect(field().value).toBe(`${SECOND}/x`);
    expect(field().readOnly).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(field()));
    expect(within(card()).queryByTestId("space-signin-link")).toBeNull();
    expect(signIn().textContent).toBe("Sign in");
    expect(within(sectionOf(ORIGIN)).queryByTestId("space-signin-error")).toBeNull();

    // The second's origin starts the sign-in there, its flow reading in
    // the card, named by the second's host name before any read (space-3,
    // git-host-3).
    fireEvent.change(field(), { target: { value: SECOND } });
    fireEvent.keyDown(field(), { key: "Enter" });
    const link = (await within(card()).findByTestId("space-signin-link")) as HTMLAnchorElement;
    expect(calls("space.signin.start")).toEqual([{ url: `${SECOND}/x` }, { url: SECOND }]);
    expect(link.textContent).toBe("Open second.example");
    expect(link.href).toBe(DEVICE("WDJB-MJHT"));
    expect(link.target).toBe("_blank");
    expect(within(card()).getByTestId("space-signin-finish").textContent).toBe("Continue in your browser·Open second.example");
    expect(within(card()).queryByTestId("space-signin-error")).toBeNull();
    expect(signIn().textContent).toBe("Signing in…");
    expect(signIn().disabled).toBe(true);
    expect(field().readOnly).toBe(true);
    // Focus the reader put in the field stays there.
    expect(document.activeElement).toBe(field());
    // No heading reads it, and no heading offers a sign-in.
    expect(within(sectionOf(ORIGIN)).queryByTestId("space-signin-body")).toBeNull();
    deliver(runningAtSecond());
    expect(within(card()).getByTestId("space-signin-link").textContent).toBe("Open second.example");

    // Signed in there, the card gives way to Add a Space… and the new
    // heading, focus landing on its Sign out (DR-010 §6).
    deliver(twoInstances());
    expect(screen.queryByTestId("space-add-card")).toBeNull();
    expect(within(sectionOf(SECOND)).getByRole("heading", { level: 2 }).textContent).toBe("Second Example · @jada");
    await waitFor(() => expect(document.activeElement).toBe(within(sectionOf(SECOND)).getByTestId("space-signout")));
    await waitFor(() => expect(add().disabled).toBe(false));
    cleanup();

    // While a heading's flow runs, Add a Space… is disabled, and opens
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

  test("space-115: with a directory the card's chooser preselects the default Space, focused, and its choice starts there", async () => {
    answering(DIRECTORY);
    await renderGroups(base(), { open: false });
    // The directory is read once the surface stands.
    await waitFor(() => expect(calls("registry.directory")).toHaveLength(1));
    fireEvent.click(add());
    const chooser = within(card()).getByTestId("space-signin-chooser") as HTMLSelectElement;
    expect(chooser.value).toBe(ORIGIN);
    await waitFor(() => expect(document.activeElement).toBe(chooser));
    fireEvent.change(chooser, { target: { value: SECOND } });
    fireEvent.click(within(card()).getByTestId("space-signin"));
    await waitFor(() => expect(calls("space.signin.start")).toEqual([{ url: SECOND }]));
    expect((await within(card()).findByTestId("space-signin-link")).textContent).toBe("Open Second Example");
  });

  test("space-3: Cancel stops the flow the card runs and closes it; a flow ended without an account reads in the card with Sign in again, a card opened afresh reading none; a flow another client runs at an unlisted Space reads in the card at the foot", async () => {
    startsAtSecond();
    await renderGroups(base(), { open: false });
    // A denial ends the card's flow: its cause with "Sign in again", the
    // field keeping the origin (space-3).
    fireEvent.click(add());
    fireEvent.change(field(), { target: { value: SECOND } });
    within(card()).getByTestId("space-signin").focus();
    fireEvent.click(within(card()).getByTestId("space-signin"));
    await within(card()).findByTestId("space-signin-link");
    // Sign in, disabled while the flow runs, hands focus to Cancel.
    await waitFor(() => expect(document.activeElement).toBe(within(card()).getByTestId("space-signin-cancel")));
    deliver(runningAtSecond());
    deliver({ ...base(), signIn: { phase: "failed", instance: SECOND, cause: "denied", message: "The sign-in was denied at second.example" } });
    expect(within(card()).getByTestId("space-signin-error").textContent).toBe("The sign-in was denied at second.example");
    expect(within(card()).queryByTestId("space-signin-link")).toBeNull();
    expect(within(card()).getByTestId("space-signin").textContent).toBe("Sign in again");
    expect(field().value).toBe(SECOND);
    expect(field().readOnly).toBe(false);
    // Cancel closes it, with no flow to stop, focus back.
    fireEvent.click(within(card()).getByTestId("space-signin-cancel"));
    expect(screen.queryByTestId("space-add-card")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(add()));
    expect(calls("space.signin.cancel")).toEqual([]);
    // Opened again, the card is afresh: the default origin and no cause.
    fireEvent.click(add());
    expect(field().value).toBe(ORIGIN);
    expect(within(card()).queryByTestId("space-signin-error")).toBeNull();
    expect(within(card()).getByTestId("space-signin").textContent).toBe("Sign in");

    // Cancel while the card's flow runs stops it and closes the card,
    // focus back on Add a Space… (space-3).
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

    // A flow another client runs at a Space the home does not list reads
    // in the card, opened at the foot, the field holding its origin.
    deliver(runningAtSecond("ABCD-EFGH"));
    const link = (await within(card()).findByTestId("space-signin-link")) as HTMLAnchorElement;
    expect(link.textContent).toBe("Open second.example");
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

  test("space-3: Sign in at the default Space's origin, the field unedited, signs that Space in again, and its flow landing closes the card, focus on that heading's Sign out", async () => {
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type !== "space.signin.start") return answer(type, fields);
      return { flow: "device", userCode: "QRST-UVWX", verificationUri: `${ORIGIN}/login/device?user_code=QRST-UVWX`, expiresAt: NOW + 15 * MIN };
    });
    await renderGroups(twoInstances(), { open: false });
    fireEvent.click(add());
    // The field holds the default Space's origin, signed in already; Sign
    // in starts there as it stands (space-3, git-host-2).
    expect(field().value).toBe(ORIGIN);
    within(card()).getByTestId("space-signin").focus();
    fireEvent.click(within(card()).getByTestId("space-signin"));
    const link = (await within(card()).findByTestId("space-signin-link")) as HTMLAnchorElement;
    expect(calls("space.signin.start")).toEqual([{ url: ORIGIN }]);
    expect(link.textContent).toBe("Open Spex Example");
    deliver({
      ...twoInstances(),
      signIn: { phase: "running", instance: ORIGIN, flow: "device", userCode: "QRST-UVWX", verificationUri: `${ORIGIN}/login/device?user_code=QRST-UVWX`, since: NOW },
    });
    // While it runs, the card stays with its flow.
    expect(within(card()).getByTestId("space-signin").textContent).toBe("Signing in…");
    // Signed in there again, the card gives way to Add a Space…, and
    // focus lands on that Space heading's Sign out (DR-010 §6).
    deliver(twoInstances());
    await waitFor(() => expect(screen.queryByTestId("space-add-card")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(within(sectionOf(ORIGIN)).getByTestId("space-signout")));
    expect(add().disabled).toBe(false);
    expect(calls("space.signin.cancel")).toEqual([]);
  });

  test.each(["en", "zh"] as const)("space-28, space-1: Add a Space… and its card read the catalog's words, every control at most 14 characters, busy forms included, the card stacking below 20rem (%s)", async (language) => {
    activateLanguage(language);
    startsAtSecond();
    const zh = language === "zh";
    await renderGroups(base(), { open: false });
    expect(add().textContent).toBe(zh ? "添加 Space…" : "Add a Space…");
    const seen: string[] = [add().textContent ?? ""];
    fireEvent.click(add());
    const title = zh ? "登录到 Space" : "Sign in to a Space";
    const opened = screen.getByRole("group", { name: title });
    expect(within(opened).getByRole("heading", { level: 2 }).textContent).toBe(title);
    expect(within(opened).getByRole("textbox", { name: zh ? "Space 地址" : "Space address" })).toBeTruthy();
    const labels = () => within(card()).getAllByRole("button").map((button) => (button.textContent ?? "").trim());
    seen.push(...labels());
    fireEvent.change(within(opened).getByRole("textbox"), { target: { value: SECOND } });
    fireEvent.click(within(card()).getByTestId("space-signin"));
    await within(card()).findByTestId("space-signin-link");
    expect(within(card()).getByTestId("space-signin-finish").textContent).toBe(
      zh ? "在浏览器中继续·打开 second.example" : "Continue in your browser·Open second.example",
    );
    seen.push(...labels());
    expect(seen).toEqual(
      zh
        ? ["添加 Space…", "取消", "登录", "取消", "登录中…"]
        : ["Add a Space…", "Cancel", "Sign in", "Cancel", "Signing in…"],
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

describe("SPACE: Remove a signed-out Space from this list (space-82, space-29, space-66, space-1)", () => {
  /** The core's refusal while a project still syncs with the second
   * Space (space-82), in its own words. */
  const KEPT = "Still syncing: a — stop them first";

  /** A home that lists the Spaces but the one at `origin`. */
  const without = (home: GroupsState, origin: string): GroupsState => {
    const instances = home.instances.filter((entry) => entry.origin !== origin);
    return { ...home, instances, defaultInstance: instances[0]?.origin ?? home.defaultInstance };
  };

  /** The heading's "Remove from this list", its overflow opened. */
  const removeOf = (origin: string): HTMLButtonElement =>
    within(headingMore(origin)).getByTestId("space-instance-remove") as HTMLButtonElement;

  test("space-82, space-29: 'Remove from this list' is offered on a signed-out heading only, sends space.forget { instance } asking nothing first, a refusal standing beneath the heading with the heading kept; success removes the heading, and with none left the header is the card again", async () => {
    // Signed in at both, every heading's entry stands disabled (space-1).
    await renderGroups(headingsHome(), { open: false });
    expect(removeOf(ORIGIN).disabled).toBe(true);
    expect(removeOf(SECOND).disabled).toBe(true);
    cleanup();

    const out = signedOutAt(SECOND, {}, headingsHome());
    let release: (() => void) | undefined;
    let refuse = true;
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type === "space.signin.start") {
        return { flow: "device", userCode: "WDJB-MJHT", verificationUri: `${SECOND}/login/device?user_code=WDJB-MJHT`, expiresAt: NOW + 15 * MIN };
      }
      if (type !== "space.forget") return answer(type, fields);
      // The core answers once the test lets it: refused while a project
      // still syncs with the Space, then the home without it.
      await new Promise<void>((resolve) => (release = resolve));
      if (refuse) throw new Error(KEPT);
      return without(out, SECOND);
    });
    await renderGroups(out, { open: false });
    const first = within(sectionOf(ORIGIN));
    const second = within(sectionOf(SECOND));
    // On the signed-out heading its overflow stands beside Sign in again,
    // which stays the last control (space-1, space-28).
    expect(removeOf(ORIGIN).disabled).toBe(true);
    const remove = removeOf(SECOND);
    expect(remove.disabled).toBe(false);
    expect(remove.title).toBe("Every record stays on this computer");
    const row = second.getByTestId("space-instance-heading").firstElementChild!;
    expect([...row.querySelectorAll(":scope > button, :scope > span > button")].map((button) => button.getAttribute("data-testid"))).toEqual([
      "space-instance-more",
      "space-signin-again",
    ]);

    // It sends the Space's origin and asks nothing first; while it runs
    // the entry stands disabled, and no sign-in starts here (space-29).
    fireEvent.click(remove);
    expect(calls("space.forget")).toEqual([{ instance: SECOND }]);
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(removeOf(SECOND).disabled).toBe(true));
    expect((second.getByTestId("space-signin-again") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(removeOf(SECOND));
    expect(calls("space.forget")).toHaveLength(1);

    // Refused, the core's words stand beneath the heading, which stays
    // with its controls; the live region says them too, and the overflow
    // takes focus again (space-82).
    release!();
    const refusal = await second.findByTestId("space-remove-refusal");
    expect(refusal.textContent).toBe(KEPT);
    expect(refusal.getAttribute("role")).toBe("alert");
    expect(second.getByTestId("space-instance-heading").contains(refusal)).toBe(true);
    expect(live()).toBe(KEPT);
    expect(sectionOf(SECOND)).toBeTruthy();
    await waitFor(() => expect((second.getByTestId("space-signin-again") as HTMLButtonElement).disabled).toBe(false));
    await waitFor(() => expect(document.activeElement).toBe(second.getByTestId("space-instance-more")));
    expect(first.queryByTestId("space-remove-refusal")).toBeNull();

    // While a sign-in runs at this Space, the entry waits for its end.
    fireEvent.click(second.getByTestId("space-signin-again"));
    await second.findByTestId("space-signin-link");
    expect(removeOf(SECOND).disabled).toBe(true);
    fireEvent.click(second.getByTestId("space-signin-cancel"));
    await waitFor(() => expect(calls("space.signin.cancel")).toEqual([{}]));
    await waitFor(() => expect(removeOf(SECOND).disabled).toBe(false));

    // Accepted, the reply is the state: the heading leaves the list, the
    // other kept, the live region says so, and focus moves to Add a Space…
    // (space-82, DR-010 §6).
    refuse = false;
    release = undefined;
    fireEvent.click(removeOf(SECOND));
    await waitFor(() => expect(release).toBeDefined());
    release!();
    await waitFor(() => expect(screen.queryByTestId(`space-instance-${SECOND}`)).toBeNull());
    expect(calls("space.forget")).toEqual([{ instance: SECOND }, { instance: SECOND }]);
    expect(sections().map((section) => section.dataset.testid)).toEqual([`space-instance-${ORIGIN}`]);
    expect(live()).toBe("Removed Second Example from this list");
    expect(screen.queryByTestId("space-remove-refusal")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("space-add-space")));
    cleanup();

    // Removing the one Space the home lists leaves it as before any
    // sign-in: the header is the card again, its field holding the
    // default Space's origin and taking focus, and no Add a Space…
    // (space-82, space-1, space-3).
    commandMock.mockReset();
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) =>
      type === "space.forget" ? noInstance() : answer(type, fields),
    );
    await renderGroups(signedOutAt(ORIGIN), { open: false });
    expect(screen.queryByTestId("space-signin-card")).toBeNull();
    fireEvent.click(removeOf(ORIGIN));
    await screen.findByTestId("space-signin-card");
    expect(calls("space.forget")).toEqual([{ instance: ORIGIN }]);
    expect(screen.queryAllByTestId(/^space-instance-https?:/)).toEqual([]);
    expect(screen.queryByTestId("space-add-space")).toBeNull();
    expect(live()).toBe("Removed Spex Example from this list");
    const header = within(screen.getByTestId("space-signin-card"));
    expect((header.getByTestId("space-signin-address") as HTMLInputElement).value).toBe(ORIGIN);
    await waitFor(() => expect(document.activeElement).toBe(header.getByTestId("space-signin-address")));
  });

  test("space-1: with no Space left after a removal, the list holds 'This computer' alone, 'Your sessions' reading no phrase and no key phrase about sign-in", async () => {
    // The last Space removed: your own group's own records' remote and id
    // dropped while their files stand (space-82, storage-36).
    const forgotten = ownRepo({ state: "local-only", remote: null, id: null, lastSync: null, placedAt: [ORIGIN, SECOND] });
    await renderGroups(noInstance({ own: { name: "jane", named: false, repositories: [forgotten] } }), { open: false });
    expect(screen.getAllByRole("heading").map((heading) => heading.textContent)).toContain("This computer");
    expect(screen.queryByText(/named after your login|synced once you sign in|On this computer only|Only you/)).toBeNull();
    expect(screen.queryByTestId(`space-repo-state-${OWN}`)?.textContent ?? "").toBe("");
  });

  test("space-82: a refusal speaks of the sign-out it met: signed in again it goes, and a later sign-out reads none", async () => {
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type === "space.forget") throw new Error(KEPT);
      return answer(type, fields);
    });
    const out = signedOutAt(SECOND, {}, headingsHome());
    await renderGroups(out, { open: false });
    fireEvent.click(removeOf(SECOND));
    expect((await within(sectionOf(SECOND)).findByTestId("space-remove-refusal")).textContent).toBe(KEPT);
    // Signed in there again, the heading's entry stands disabled and no
    // refusal reads.
    deliver(headingsHome());
    expect(removeOf(SECOND).disabled).toBe(true);
    expect(within(sectionOf(SECOND)).queryByTestId("space-remove-refusal")).toBeNull();
    // Signed out again, the entry stands with nothing beneath the heading.
    deliver(out);
    expect(removeOf(SECOND).disabled).toBe(false);
    expect(within(sectionOf(SECOND)).queryByTestId("space-remove-refusal")).toBeNull();
  });
});
