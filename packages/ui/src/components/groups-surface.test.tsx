// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Groups surface's header and groups list over a mocked client
// (DR-103): the header in both signed states with Refresh and the
// host's last read (space-1, space-2), signing in through the browser
// flow and the device flow, its failure, Cancel and Sign out (space-3,
// space-6), every row state with its control and phrase (space-61,
// space-64), Pick a group (space-58), Join (space-63), Members
// (space-62), the vocabulary (space-27) and the label budget and the
// container steps the fit rests on (space-28). Each act is checked by
// the command it sends; its outcome arrives as state.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { GroupsState, RepositoryState } from "@sublang/spex-core/protocol";

import { setClientForTests } from "../state/store.js";
import {
  BRANCH,
  GIT_WORDS,
  HOME,
  HOST_WORDS,
  KEY,
  MIN,
  NOW,
  OWN,
  OWN_REPO,
  SESSION_UNIT,
  answer,
  base,
  calls,
  commandMock,
  deliver,
  installClient,
  live,
  renderGroups,
  repo,
  strayRemote,
} from "../fixtures/groups.js";

beforeEach(installClient);

afterEach(() => {
  cleanup();
  setClientForTests(undefined);
  vi.useRealTimers();
});

const CODE = "git@github.com:jane/academy.git";

/** A team group the host lists: its own spex repository, the same
 * project's spex repository another member pushed, a project this
 * device lacks, and one it may only read. */
function teamGroup(repos?: RepositoryState[]): GroupsState["groups"][number] {
  return {
    id: "2",
    fullPath: "acme/team",
    name: "team",
    url: "https://gitlab.example/acme/team",
    own: false,
    repositories: repos ?? [
      repo({ key: "acme/team/team-spex", name: "team-spex", id: "50", code: null, folder: null, members: 4 }),
      repo({ key: "acme/team/academy-spex", name: "academy-spex", id: "51", code: CODE, folder: null, members: 3, state: "absent", branch: null }),
      repo({ key: "acme/team/docs-spex", name: "docs-spex", id: "52", code: "git@github.com:acme/docs.git", folder: null, state: "absent", branch: null }),
      repo({ key: "acme/team/old-spex", name: "old-spex", id: "53", code: "git@github.com:acme/old.git", state: "read-only", reason: "archived", lastSync: { at: NOW - 30 * MIN, sent: 0, received: 2 } }),
    ],
  };
}

/** A signed-in home whose project is still only on this device. */
function localProject(over: Partial<GroupsState> = {}): GroupsState {
  const state = base(over, [repo({ state: "local-only", remote: null, id: null, code: CODE, branch: null, members: null })]);
  return over.groups ? state : { ...state, groups: [...state.groups, teamGroup()] };
}

/** A home not signed in: your own group alone, its repositories local. */
function signedOut(over: Partial<GroupsState> = {}): GroupsState {
  const own = { ...OWN_REPO, state: "local-only" as const, remote: null, id: null, lastSync: null };
  const project = repo({ state: "local-only", remote: null, id: null, code: CODE, branch: null, members: null });
  return {
    ...base({ account: null, readAt: null, ...over }),
    groups: [{ id: null, fullPath: "jane", name: "jane", url: null, own: true, repositories: [own, project] }],
  };
}

describe("GROUPS: the header (space-1, space-2)", () => {
  test("signed in, it reads the account, the host's last read with Refresh, Sign out, and where the files are at the foot", async () => {
    await renderGroups(base(), { open: false });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Groups");
    // The home is one quiet line at the surface's foot: selectable, its
    // full path in its title, with no control (space-1).
    const home = screen.getByTestId("space-home");
    expect(home.textContent).toBe("Spex keeps this device's files in ~/.spex");
    expect(home.getAttribute("title")).toBe(HOME);
    expect(home.className).toContain("select-text");
    expect(home.querySelector("button")).toBeNull();
    expect(screen.getByTestId("space-surface").lastElementChild).toBe(home);
    expect(within(screen.getByTestId("space-header")).queryByRole("button", { name: "Copy path" })).toBeNull();
    // The host's name yields first below @md; the login stays.
    expect(screen.getByTestId("space-account-wide").textContent).toBe("Signed in as @jane at GitLab");
    expect(screen.getByTestId("space-account-wide").className).toContain("@md:inline");
    expect(screen.getByTestId("space-account-narrow").textContent).toBe("Signed in as @jane");
    expect(screen.getByTestId("space-account-narrow").className).toContain("@md:hidden");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(screen.queryByTestId("space-signin")).toBeNull();
    // The read time is the host's, from the core; it yields below @2xl.
    const readAt = screen.getByTestId("space-read-at");
    expect(readAt.textContent).toBe("Host read 1m ago");
    expect(readAt.className).toContain("@2xl:inline");
    expect(screen.getByTestId("space-refresh").title).toContain("last read");
  });

  test("Refresh asks the core to read the host and re-reads the state; signed out there is none", async () => {
    await renderGroups(base(), { open: false });
    expect(calls("space.get")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(calls("space.get")).toHaveLength(2));
    expect(calls("space.refresh")).toHaveLength(1);
    // The host's read lands as a broadcast, and its time with it.
    deliver(base({ readAt: NOW }));
    expect(screen.getByTestId("space-read-at").textContent).toBe("Host read just now");
    cleanup();
    commandMock.mockClear();
    await renderGroups(base({ readAt: null }), { open: false });
    expect(screen.getByTestId("space-read-at").textContent).toBe("Not read yet");
    cleanup();
    await renderGroups(signedOut(), { open: false });
    expect(screen.queryByTestId("space-read-at")).toBeNull();
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
  });

  test("a refused Refresh says why beside it", async () => {
    await renderGroups(base(), { open: false });
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type === "space.refresh") throw new Error("Could not reach GitLab");
      return answer(type, fields);
    });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Could not reach GitLab");
    expect(live()).toBe("Could not reach GitLab");
  });

  test("signed out, the header is one card with what signing in brings and Sign in, and the list holds your own group alone", async () => {
    await renderGroups(signedOut(), { open: false });
    const account = screen.getByTestId("space-account");
    expect(within(account).getByRole("heading", { level: 2 }).textContent).toBe("Not signed in");
    expect(screen.getByTestId("space-signin-body").textContent).toBe(
      "Sign in to see your groups and share each project's records with the people in them." +
        "Until you do, everything stays on this device and nothing is contacted.",
    );
    // No home path, Copy path, read time or Refresh while signed out
    // (space-3).
    const header = screen.getByTestId("space-header");
    expect(header.textContent).not.toContain("~/.spex");
    expect(screen.queryByTestId("space-home")).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy path" })).toBeNull();
    expect(screen.queryByTestId("space-read-at")).toBeNull();
    expect(screen.queryByTestId("space-refresh")).toBeNull();
    const signIn = screen.getByTestId("space-signin");
    expect(signIn.textContent).toBe("Sign in");
    expect(signIn.className).toContain("bg-brand-600");
    // The primary control stands last in the header, full-width below
    // @xs (space-28).
    const controls = within(header).getAllByRole("button");
    expect(controls.at(-1)).toBe(signIn);
    expect(signIn.className).toContain("w-full");
    expect(signIn.className).toContain("@xs:w-auto");
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    // Your own group alone, called so and never by this device's user
    // name, its repositories only on this device, no row with a control.
    const groups = within(screen.getByTestId("space-groups")).getAllByRole("group");
    expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual(["Your own group"]);
    expect(within(groups[0]!).getByRole("heading", { level: 2 }).textContent).toBe("Your own group");
    expect(screen.getByTestId(`space-repo-state-${OWN}`).textContent).toBe("On this device only — shared once you sign in");
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("On this device only");
    for (const key of [OWN, KEY]) {
      const rowControls = within(screen.getByTestId(`space-row-${key}`))
        .getAllByRole("button")
        .filter((button) => !button.dataset.testid?.startsWith("space-repo-"));
      expect(rowControls, key).toEqual([]);
    }
    // Nothing is sent to the host before the control is activated.
    expect(commandMock.mock.calls.map(([type]) => type)).toEqual(["space.get"]);
  });

  test("with no git the guidance replaces every other field", async () => {
    await renderGroups(base({ git: { ok: false, guidance: "Install Git from git-scm.com, then reopen Groups." } }));
    expect(screen.getByTestId("space-no-git").textContent).toContain("Git is not installed");
    expect(screen.getByTestId("space-no-git").textContent).toContain("git-scm.com");
    expect(screen.queryByTestId("space-account")).toBeNull();
    expect(screen.queryByTestId("space-refresh")).toBeNull();
    expect(screen.queryByTestId("space-groups")).toBeNull();
    expect(screen.queryByTestId("space-repository")).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy path" })).toBeNull();
  });
});

describe("GROUPS: signing in (space-3, space-6)", () => {
  test("the browser flow opens the host's page through the bridge, reads 'Signing in…' with Cancel, and ends as the state says", async () => {
    const openExternal = vi.fn<(url: string) => Promise<boolean>>().mockResolvedValue(true);
    (window as { spexNative?: unknown }).spexNative = { pickDirectory: vi.fn(), openExternal };
    await renderGroups(signedOut(), { open: false });
    fireEvent.click(screen.getByTestId("space-signin"));
    await waitFor(() => expect(openExternal).toHaveBeenCalledWith("https://gitlab.example/login/app?client_id=spex&state=s"));
    expect(calls("space.signin.start")).toEqual([{}]);
    const control = screen.getByTestId("space-signin") as HTMLButtonElement;
    await waitFor(() => expect(control.textContent).toBe("Signing in…"));
    expect(control.disabled).toBe(true);
    // Where the browser is open and what to do there, with the page
    // offered again through the bridge (space-3).
    expect(screen.getByTestId("space-signin-opened").textContent).toBe(
      "Your browser is open at gitlab.example: sign in with your GitLab account there and approve; you return here signed in. Open it again",
    );
    const again = screen.getByTestId("space-signin-link") as HTMLAnchorElement;
    expect(again.textContent).toBe("Open it again");
    expect(again.href).toBe("https://gitlab.example/login/app?client_id=spex&state=s");
    fireEvent.click(again);
    expect(openExternal).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    // The core reports the flow running, then its end with the account.
    deliver(signedOut({ signIn: { phase: "running", flow: "browser", since: NOW } }));
    expect(control.textContent).toBe("Signing in…");
    deliver(base());
    expect(screen.getByTestId("space-account-wide").textContent).toBe("Signed in as @jane at GitLab");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  test("with no bridge, or one that refuses, the browser flow's page stands as a link to finish at", async () => {
    await renderGroups(signedOut(), { open: false });
    fireEvent.click(screen.getByTestId("space-signin"));
    const link = (await screen.findByTestId("space-signin-link")) as HTMLAnchorElement;
    expect(link.href).toBe("https://gitlab.example/login/app?client_id=spex&state=s");
    expect(link.textContent).toBe("Open GitLab to sign in");
    expect(screen.getByTestId("space-signin-finish").textContent).toBe("Finish signing in in your browser:");
    cleanup();
    const openExternal = vi.fn<(url: string) => Promise<boolean>>().mockResolvedValue(false);
    (window as { spexNative?: unknown }).spexNative = { pickDirectory: vi.fn(), openExternal };
    await renderGroups(signedOut(), { open: false });
    fireEvent.click(screen.getByTestId("space-signin"));
    expect(((await screen.findByTestId("space-signin-link")) as HTMLAnchorElement).href).toContain("/login/app");
  });

  test("Cancel stops the flow and Sign in stands again", async () => {
    await renderGroups(signedOut(), { open: false });
    fireEvent.click(screen.getByTestId("space-signin"));
    await screen.findByTestId("space-signin-link");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(calls("space.signin.cancel")).toEqual([{}]));
    await waitFor(() => expect(screen.getByTestId("space-signin").textContent).toBe("Sign in"));
    expect(screen.queryByTestId("space-signin-link")).toBeNull();
    expect(screen.getByTestId("space-signin-caption")).toBeTruthy();
  });

  test("the device flow links the page that carries the code, shows no code, and no row offers a sign-in", async () => {
    const complete = "https://spex.example/login/device?user_code=WDJB-MJHT";
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) =>
      type === "space.signin.start"
        ? { flow: "device", userCode: "WDJB-MJHT", verificationUri: complete, expiresAt: NOW + 15 * MIN }
        : answer(type, fields),
    );
    await renderGroups(signedOut({ host: { url: "https://spex.example", displayName: null } }), { open: false });
    fireEvent.click(screen.getByTestId("space-signin"));
    const link = (await screen.findByTestId("space-signin-link")) as HTMLAnchorElement;
    // Before the host's display name is known, its host name stands in.
    expect(link.textContent).toBe("Open spex.example to sign in");
    expect(link.href).toBe(complete);
    expect(link.target).toBe("_blank");
    expect(screen.getByTestId("space-signin-body").textContent).toBe(
      "Finish signing in in your browser:Open spex.example to sign in" +
        "Sign in with your spex.example account there and approve; you return here signed in.",
    );
    // The code is never shown, nor offered to copy.
    expect(document.body.textContent).not.toContain("WDJB-MJHT");
    expect(screen.queryByRole("textbox")).toBeNull();
    const control = screen.getByTestId("space-signin") as HTMLButtonElement;
    expect(control.textContent).toBe("Signing in…");
    expect(control.disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(screen.getAllByRole("button").filter((button) => /Sign/.test(button.textContent ?? ""))).toEqual([control]);
    // A page that opens mid-flow reads the link from the state alone,
    // the host named by its display name once the core knows it.
    cleanup();
    await renderGroups(
      signedOut({ signIn: { phase: "running", flow: "device", userCode: "ABCD-EFGH", verificationUri: complete, since: NOW } }),
      { open: false },
    );
    expect(screen.getByTestId("space-signin-link").textContent).toBe("Open GitLab to sign in");
    expect((screen.getByTestId("space-signin-link") as HTMLAnchorElement).href).toBe(complete);
    expect(screen.getByTestId("space-signin-body").textContent).toContain("Sign in with your GitLab account there and approve");
    expect(document.body.textContent).not.toContain("ABCD-EFGH");
    expect(screen.getByTestId("space-signin").textContent).toBe("Signing in…");
  });

  test("a denial, an expiry or a refusal ends the flow with its cause beside the control, which reads Sign in again", async () => {
    await renderGroups(signedOut({ signIn: { phase: "running", flow: "device", userCode: "ABCD-EFGH", verificationUri: "https://gitlab.example/oauth/device", since: NOW } }), { open: false });
    deliver(signedOut({ signIn: { phase: "failed", cause: "denied", message: "The sign-in was denied at GitLab" } }));
    expect(screen.getByTestId("space-signin-error").textContent).toBe("Sign-in did not complete: The sign-in was denied at GitLab.");
    expect(screen.getByTestId("space-signin").textContent).toBe("Sign in again");
    expect(screen.queryByTestId("space-signin-link")).toBeNull();
    // A start the core refuses says why in the same place.
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type === "space.signin.start") throw new Error("A sign-in is already running");
      return answer(type, fields);
    });
    fireEvent.click(screen.getByTestId("space-signin"));
    await waitFor(() => expect(screen.getByTestId("space-signin-error").textContent).toBe("Sign-in did not complete: A sign-in is already running."));
  });

  test("Sign out sends the command and every repository reads as the core then says", async () => {
    await renderGroups(base(), { open: false });
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) =>
      type === "space.signout" ? signedOut() : answer(type, fields),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(calls("space.signout")).toEqual([{}]));
    await waitFor(() => expect(screen.getByTestId("space-account").textContent).toContain("Not signed in"));
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("On this device only");
    expect(screen.getByTestId("space-signin").textContent).toBe("Sign in");
    // A refusal — a sync running — stays beside the control.
    cleanup();
    await renderGroups(base(), { open: false });
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type === "space.signout") throw new Error("Wait for the sync of academy-spex");
      return answer(type, fields);
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Wait for the sync of academy-spex");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });
});

describe("GROUPS: the groups list and its rows (space-1, space-61, space-64)", () => {
  test("your own group first, then each group the host lists with its full path, each repository a row", async () => {
    const mine = base({}, [repo({ local: [SESSION_UNIT], lastSync: { at: NOW - 2 * 60 * MIN, sent: 1, received: 0 } })]);
    await renderGroups({ ...mine, groups: [...mine.groups, teamGroup()] }, { open: false });
    const groups = within(screen.getByTestId("space-groups")).getAllByRole("group");
    expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual(["Your own group", "acme/team"]);
    // Signed in, your own group's path stands beside its heading.
    expect(within(groups[0]!).getByRole("heading", { level: 2 }).textContent).toBe("Your own groupjane");
    expect(within(groups[1]!).getByRole("heading", { level: 2 }).textContent).toBe("teamacme/team");
    // In each group the rows stand in the core's order, its own first.
    expect(within(groups[1]!).getAllByRole("listitem").map((item) => item.dataset.testid)).toEqual([
      "space-row-acme/team/team-spex",
      "space-row-acme/team/academy-spex",
      "space-row-acme/team/docs-spex",
      "space-row-acme/team/old-spex",
    ]);

    // A project's row: its name, where its code lives with no user in
    // it, its local changes, ahead and behind, and its last sync.
    const row = screen.getByTestId(`space-repo-${KEY}`);
    expect(within(groups[0]!).getByRole("button", { name: "academy-spex", expanded: false })).toBe(row);
    expect(screen.getByTestId(`space-repo-code-${KEY}`).textContent).toBe("https://github.com/jane/academy.git");
    expect(screen.getByTestId(`space-repo-code-${KEY}`).getAttribute("title")).toBe("https://jane@github.com/jane/academy.git");
    expect(screen.getByTestId(`space-repo-changes-${KEY}`).getAttribute("title")).toBe("1 local change");
    expect(screen.getByTestId(`space-repo-counts-${KEY}`).textContent).toContain("↑2");
    expect(screen.getByTestId(`space-repo-counts-${KEY}`).textContent).toContain("↓1");
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("Synced 2h ago");
    // The row is named by the repository alone, its code, counts and
    // state describing it, so the name holds while the age ticks.
    expect(row.getAttribute("aria-describedby")).toBe(
      [`space-repo-code-${KEY}`, `space-repo-changes-${KEY}`, `space-repo-counts-${KEY}`, `space-repo-state-${KEY}`].join(" "),
    );
    // A group's own spex repository holds the group's records.
    expect(screen.getByTestId(`space-repo-code-${OWN}`).textContent).toBe("Group records");
    expect(screen.getByTestId("space-repo-code-acme/team/team-spex").textContent).toBe("Group records");

    // Activating a row opens its tabs beneath the list; again folds them.
    expect(screen.queryByTestId("space-repository")).toBeNull();
    fireEvent.click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("region", { name: "academy-spex" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Sync" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Explore" })).toBeTruthy();
    expect(screen.getByTestId("space-repository-folder").textContent).toBe("~/code/academy");
    fireEvent.click(row);
    expect(screen.queryByTestId("space-repository")).toBeNull();
  });

  test("each state reads its phrase and offers its control; Members stands on a reachable row alone", async () => {
    const cases: [Partial<RepositoryState>, string, string | null, boolean][] = [
      [{ state: "reachable", lastSync: null }, "Never synced", "Sync", true],
      [{ state: "reachable", lastSync: { at: NOW - 5 * MIN, sent: 1, received: 1 } }, "Synced 5m ago", "Sync", true],
      [{ state: "read-only", reason: "archived" }, "Read-only: archived", "Sync", false],
      [{ state: "unreachable", reason: "the host stopped listing it" }, "Unreachable: the host stopped listing it", "Retry", false],
      [{ state: "absent", folder: null, branch: null }, "Not on this device", "Join", false],
      [{ state: "local-only", remote: null, id: null, branch: null }, "On this device only", "Pick a group", false],
    ];
    for (const [over, phrase, controlName, members] of cases) {
      await renderGroups(base({}, [repo(over)]), { open: false });
      const rowItem = screen.getByTestId(`space-row-${KEY}`);
      expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent, phrase).toBe(phrase);
      const controls = within(rowItem)
        .getAllByRole("button")
        .filter((button) => !button.dataset.testid?.startsWith("space-repo-"))
        .map((button) => button.getAttribute("aria-label") ?? button.textContent);
      expect(controls, phrase).toEqual([...(members ? ["Members"] : []), ...(controlName ? [controlName] : [])]);
      cleanup();
    }
  });

  test("a project's records naming no code remote read so", async () => {
    await renderGroups(base({}, [repo({ code: null })]), { open: false });
    expect(screen.getByTestId(`space-repo-code-${KEY}`).textContent).toBe("Code not on a remote");
  });

  test("signed out, no row offers a sign-in: a repository the host holds waits for the header's; a path remote retries", async () => {
    await renderGroups(base({ account: null }, [repo({ state: "unreachable", reason: "Sign in again" })]), { open: false });
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("Unreachable: Sign in again");
    expect(
      within(screen.getByTestId(`space-row-${KEY}`))
        .getAllByRole("button")
        .filter((button) => !button.dataset.testid?.startsWith("space-repo-")),
    ).toEqual([]);
    cleanup();
    await renderGroups(base({ account: null }, [repo({ state: "unreachable", reason: "the folder is gone", remote: "/srv/academy-spex.git" })]), { open: false });
    const reads = calls("space.get").length;
    fireEvent.click(screen.getByTestId(`space-row-retry-${KEY}`));
    // Signed out, a retry re-reads the state and contacts no host.
    await waitFor(() => expect(calls("space.get")).toHaveLength(reads + 1));
    expect(calls("space.refresh")).toHaveLength(0);
  });

  test("Retry on an unreachable row reads the host again", async () => {
    await renderGroups(base({}, [repo({ state: "unreachable", reason: "the device is offline" })]), { open: false });
    fireEvent.click(screen.getByTestId(`space-row-retry-${KEY}`));
    await waitFor(() => expect(calls("space.refresh")).toEqual([{}]));
    await waitFor(() => expect(calls("space.get")).toHaveLength(2));
  });

  test("a group's own repository waiting on someone's rights reads the step and group, the host's words in the title (space-64)", async () => {
    const waiting = (step: "create" | "branch") =>
      repo({
        key: "acme/team/team-spex",
        name: "team-spex",
        id: null,
        code: null,
        folder: null,
        state: "local-only",
        remote: null,
        branch: null,
        waiting: { step, group: "acme/team", message: "403 Forbidden: you need at least the Maintainer role" },
      });
    for (const [step, phrase] of [
      ["create", "Waiting for a member who can create it in acme/team"],
      ["branch", "Waiting for a member who can prepare its branch in acme/team"],
    ] as const) {
      await renderGroups({ ...base(), groups: [...base().groups, teamGroup([waiting(step)])] }, { open: false });
      const state = screen.getByTestId("space-repo-state-acme/team/team-spex");
      expect(state.textContent).toBe(phrase);
      expect(state.getAttribute("title")).toBe("403 Forbidden: you need at least the Maintainer role");
      // A group's own repository is made at its first session, never
      // picked for; the row names no host page to change.
      expect(within(screen.getByTestId("space-row-acme/team/team-spex")).queryByRole("button", { name: "Pick a group" })).toBeNull();
      expect(screen.getByTestId("space-row-acme/team/team-spex").querySelector("a")).toBeNull();
      cleanup();
    }
  });

  test("a read-only row says new sessions stay on this device, and a clone without its folder offers Choose folder…", async () => {
    await renderGroups(base({}, [repo({ state: "read-only", reason: "archived", lastSync: { at: NOW - MIN, sent: 0, received: 1 } })]), { open: false });
    expect(screen.getByTestId(`space-repo-state-${KEY}`).getAttribute("title")).toBe(
      "Read-only: archived · new sessions stay on this device",
    );
    cleanup();
    const { answer: core } = await import("../fixtures/groups.js");
    commandMock.mockImplementation(async (type: string, fields: Record<string, unknown> = {}) => {
      if (type === "project.rebind") return { id: KEY, name: "academy", path: fields.path, registeredAt: 1 };
      if (type === "project.list") return [];
      return core(type, fields);
    });
    await renderGroups(base({}, [repo({ folder: null })]), { open: false });
    fireEvent.click(screen.getByTestId(`space-row-folder-${KEY}`));
    const editor = screen.getByTestId(`space-folder-${KEY}`);
    const field = screen.getByTestId(`space-folder-${KEY}-path`);
    expect(document.activeElement).toBe(field);
    fireEvent.click(within(editor).getByRole("button", { name: "Add project" }));
    expect(within(editor).getByRole("alert").textContent).toBe("Name the folder on this device.");
    fireEvent.change(field, { target: { value: "/Users/jane/code/academy" } });
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() => expect(calls("project.rebind")).toEqual([{ projectId: KEY, path: "/Users/jane/code/academy" }]));
    await waitFor(() => expect(screen.queryByTestId(`space-folder-${KEY}`)).toBeNull());
  });
});

describe("GROUPS: Pick a group (space-58)", () => {
  test("one picker offers the spex repositories listed for the same code, each with its group and members, then every group", async () => {
    await renderGroups(localProject(), { open: false });
    const control = screen.getByTestId(`space-row-pick-${KEY}`);
    expect(control.textContent).toBe("Pick a group");
    fireEvent.click(control);
    expect(control.getAttribute("aria-expanded")).toBe("true");
    const picker = screen.getByRole("group", { name: "Pick a group for academy-spex" });
    // Only the one whose project.json names the folder's remote.
    const listed = within(picker).getAllByTestId(/^space-pick-repo-/);
    expect(listed.map((option) => option.dataset.testid)).toEqual(["space-pick-repo-acme/team/academy-spex"]);
    expect(listed[0]!.textContent).toContain("academy-spex");
    expect(listed[0]!.textContent).toContain("acme/team");
    expect(listed[0]!.textContent).toContain("3 members");
    expect(document.activeElement).toBe(listed[0]);
    // Below them, every group, with the folder's name to create.
    expect(within(picker).getAllByTestId(/^space-pick-group-/).map((option) => option.textContent)).toEqual(["jane", "acme/team"]);
    expect((screen.getByTestId(`space-pick-name-${KEY}`) as HTMLInputElement).value).toBe("academy");
    expect(picker.textContent).toContain("-spex");
  });

  test("picking a listed spex repository sends its host id; picking a group sends the group and the name", async () => {
    await renderGroups(localProject(), { open: false });
    fireEvent.click(screen.getByTestId(`space-row-pick-${KEY}`));
    fireEvent.click(screen.getByTestId("space-pick-repo-acme/team/academy-spex"));
    await waitFor(() =>
      expect(calls("space.pick")).toEqual([{ repository: KEY, choice: { kind: "join", hostId: "51" } }]),
    );
    await waitFor(() => expect(screen.queryByTestId(`space-picker-${KEY}`)).toBeNull());
    fireEvent.click(screen.getByTestId(`space-row-pick-${KEY}`));
    fireEvent.change(screen.getByTestId(`space-pick-name-${KEY}`), { target: { value: "academy-notes" } });
    fireEvent.click(screen.getByTestId("space-pick-group-acme/team"));
    await waitFor(() =>
      expect(calls("space.pick")[1]).toEqual({ repository: KEY, choice: { kind: "create", groupId: "2", name: "academy-notes" } }),
    );
  });

  test("a taken or malformed name is refused in place and the field asks for another; an empty one is never sent", async () => {
    await renderGroups(localProject(), { open: false });
    fireEvent.click(screen.getByTestId(`space-row-pick-${KEY}`));
    const name = screen.getByTestId(`space-pick-name-${KEY}`);
    fireEvent.change(name, { target: { value: "  " } });
    fireEvent.click(screen.getByTestId("space-pick-group-jane"));
    expect(within(screen.getByTestId(`space-picker-${KEY}`)).getByRole("alert").textContent).toBe("Name the new spex repository.");
    expect(document.activeElement).toBe(name);
    expect(calls("space.pick")).toHaveLength(0);
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type === "space.pick") throw new Error("academy-spex is taken in jane; name another");
      return answer(type, fields);
    });
    fireEvent.change(name, { target: { value: "academy" } });
    fireEvent.click(screen.getByTestId("space-pick-group-jane"));
    await waitFor(() =>
      expect(within(screen.getByTestId(`space-picker-${KEY}`)).getByRole("alert").textContent).toBe("academy-spex is taken in jane; name another"),
    );
    expect(document.activeElement).toBe(name);
    expect((name as HTMLInputElement).value).toBe("academy");
  });

  test("Cancel and Escape leave the repository local only with Pick a group offered again, focus on it", async () => {
    await renderGroups(localProject(), { open: false });
    const control = screen.getByTestId(`space-row-pick-${KEY}`);
    fireEvent.click(control);
    fireEvent.click(screen.getByTestId(`space-pick-cancel-${KEY}`));
    expect(screen.queryByTestId(`space-picker-${KEY}`)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(control));
    fireEvent.click(control);
    fireEvent.keyDown(screen.getByTestId("space-pick-group-jane"), { key: "Escape" });
    expect(screen.queryByTestId(`space-picker-${KEY}`)).toBeNull();
    expect(calls("space.pick")).toHaveLength(0);
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("On this device only");
  });
});

describe("GROUPS: Join (space-63)", () => {
  const ABSENT = "acme/team/docs-spex";

  test("with no directory picker Join asks for the folder in place and sends the host id with it", async () => {
    await renderGroups(localProject(), { open: false });
    const control = screen.getByTestId(`space-row-join-${ABSENT}`);
    expect(control.textContent).toBe("Join");
    fireEvent.click(control);
    const editor = screen.getByTestId(`space-join-${ABSENT}`);
    expect(editor.textContent).toContain("Folder for its code on this device");
    const field = screen.getByTestId(`space-join-${ABSENT}-path`);
    expect(document.activeElement).toBe(field);
    fireEvent.keyDown(field, { key: "Escape" });
    expect(screen.queryByTestId(`space-join-${ABSENT}`)).toBeNull();
    expect(calls("space.join")).toHaveLength(0);
    fireEvent.click(control);
    fireEvent.change(screen.getByTestId(`space-join-${ABSENT}-path`), { target: { value: "/Users/jane/code/docs" } });
    fireEvent.click(within(screen.getByTestId(`space-join-${ABSENT}`)).getByRole("button", { name: "Join" }));
    await waitFor(() => expect(calls("space.join")).toEqual([{ hostId: "52", folder: "/Users/jane/code/docs" }]));
    // Accepted, the control stays busy until the machine moves.
    await waitFor(() => expect(screen.getByTestId(`space-row-join-${ABSENT}`).textContent).toBe("Joining…"));
  });

  test("a group's own spex repository asks for the folder its sessions run in", async () => {
    await renderGroups(
      { ...base(), groups: [...base().groups, teamGroup([repo({ key: "acme/team/team-spex", name: "team-spex", id: "50", code: null, folder: null, state: "absent", branch: null })])] },
      { open: false },
    );
    fireEvent.click(screen.getByTestId("space-row-join-acme/team/team-spex"));
    expect(screen.getByTestId("space-join-acme/team/team-spex").textContent).toContain("Folder its sessions run in on this device");
  });

  test("with the directory picker Join asks through it, and a cancelled pick sends nothing", async () => {
    const pickDirectory = vi.fn<() => Promise<string | null>>().mockResolvedValueOnce(null).mockResolvedValueOnce("/Users/jane/code/docs");
    (window as { spexNative?: unknown }).spexNative = { pickDirectory };
    await renderGroups(localProject(), { open: false });
    fireEvent.click(screen.getByTestId(`space-row-join-${ABSENT}`));
    await waitFor(() => expect(pickDirectory).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId(`space-join-${ABSENT}`)).toBeNull();
    expect(calls("space.join")).toHaveLength(0);
    fireEvent.click(screen.getByTestId(`space-row-join-${ABSENT}`));
    await waitFor(() => expect(calls("space.join")).toEqual([{ hostId: "52", folder: "/Users/jane/code/docs" }]));
  });

  test("a refused join keeps the folder in place with Git's words", async () => {
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type === "space.join") throw new Error("fatal: destination path '/Users/jane/code/docs' already exists and is not an empty directory.");
      return answer(type, fields);
    });
    await renderGroups(localProject(), { open: false });
    fireEvent.click(screen.getByTestId(`space-row-join-${ABSENT}`));
    fireEvent.change(screen.getByTestId(`space-join-${ABSENT}-path`), { target: { value: "/Users/jane/code/docs" } });
    fireEvent.keyDown(screen.getByTestId(`space-join-${ABSENT}-path`), { key: "Enter" });
    await waitFor(() =>
      expect(within(screen.getByTestId(`space-join-${ABSENT}`)).getByRole("alert").textContent).toContain("already exists"),
    );
    expect((screen.getByTestId(`space-join-${ABSENT}-path`) as HTMLInputElement).value).toBe("/Users/jane/code/docs");
  });
});

describe("GROUPS: Members (space-62)", () => {
  test("Members lists the host's members with their role names and the host's members page, read on every opening and Refresh", async () => {
    await renderGroups(base(), { open: false });
    const control = screen.getByTestId(`space-row-members-${KEY}`);
    expect(control.getAttribute("aria-label")).toBe("Members");
    fireEvent.click(control);
    await waitFor(() => expect(calls("space.members")).toEqual([{ repository: KEY }]));
    const list = await screen.findByRole("region", { name: "Members of academy-spex" });
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(2));
    expect(screen.getByTestId("space-member-jane").textContent).toContain("Jane");
    expect(screen.getByTestId("space-member-jane").textContent).toContain("Owner");
    expect(screen.getByTestId("space-member-bob").textContent).toContain("bob");
    expect(screen.getByTestId("space-member-bob").textContent).toContain("Developer");
    const link = screen.getByTestId(`space-members-link-${KEY}`) as HTMLAnchorElement;
    expect(link.textContent).toBe("Members change on GitLab");
    expect(link.href).toBe("https://gitlab.example/jane/academy-spex/-/project_members");
    // Refresh reads them again; nothing is cached across reads.
    fireEvent.click(screen.getByTestId("space-refresh"));
    await waitFor(() => expect(calls("space.members")).toHaveLength(2));
    fireEvent.keyDown(link, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Members of academy-spex" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(control));
    fireEvent.click(control);
    await waitFor(() => expect(calls("space.members")).toHaveLength(3));
  });

  test("with the bridge the members page opens in the system browser", async () => {
    const openExternal = vi.fn<(url: string) => Promise<boolean>>().mockResolvedValue(true);
    (window as { spexNative?: unknown }).spexNative = { pickDirectory: vi.fn(), openExternal };
    await renderGroups(base(), { open: false });
    fireEvent.click(screen.getByTestId(`space-row-members-${KEY}`));
    fireEvent.click(await screen.findByTestId(`space-members-link-${KEY}`));
    expect(openExternal).toHaveBeenCalledWith("https://gitlab.example/jane/academy-spex/-/project_members");
  });

  test("a read the host refuses says so in place", async () => {
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type === "space.members") throw new Error("GitLab refused: 404 Project Not Found");
      return answer(type, fields);
    });
    await renderGroups(base(), { open: false });
    fireEvent.click(screen.getByTestId(`space-row-members-${KEY}`));
    expect((await screen.findByRole("alert")).textContent).toBe("GitLab refused: 404 Project Not Found");
  });
});

describe("GROUPS: copy and fit (space-27, space-28)", () => {
  const states = (): GroupsState[] => [
    signedOut(),
    signedOut({ signIn: { phase: "running", flow: "device", userCode: "ABCD-EFGH", verificationUri: "https://gitlab.example/oauth/device", since: NOW } }),
    signedOut({ signIn: { phase: "failed", cause: "expired", message: "The code expired" } }),
    localProject(),
    base({}, [
      repo({ state: "read-only", reason: "archived" }),
    ]),
    base({}, [repo({ state: "unreachable", reason: "the device is offline", folder: null })]),
    base({}, [repo({ sync: { phase: "running", op: "sync", step: "push", since: NOW, cancelable: true }, branch: { ...BRANCH, ahead: 1 } })]),
    base({}, [repo({ sync: { phase: "unrelated" }, branch: { ...BRANCH, unrelated: true } })]),
  ];

  test("no visible text says ours, theirs, HEAD, origin/spex, space or namespace, and remote only for the code's", async () => {
    for (const state of states()) {
      await renderGroups(state, { open: false });
      // What a row opens counts too.
      const pick = screen.queryByTestId(`space-row-pick-${KEY}`);
      if (pick) fireEvent.click(pick);
      const members = screen.queryByTestId(`space-row-members-${KEY}`);
      if (members) {
        fireEvent.click(members);
        await screen.findByTestId(`space-members-link-${KEY}`);
      }
      const text = document.body.textContent ?? "";
      expect(text).not.toMatch(GIT_WORDS);
      expect(text).not.toMatch(HOST_WORDS);
      expect(strayRemote(text)).toBe(false);
      cleanup();
    }
  });

  test("every control of the header and the rows reads at most 14 characters, its busy form included", async () => {
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) =>
      type === "space.sync" || type === "space.join" ? new Promise(() => {}) : answer(type, fields),
    );
    for (const state of states()) {
      await renderGroups(state, { open: false });
      // Busy forms: a sync and a sign-in in flight.
      const sync = screen.queryByTestId(`space-row-sync-${KEY}`) as HTMLButtonElement | null;
      if (sync && !sync.disabled) fireEvent.click(sync);
      const signIn = screen.queryByTestId("space-signin") as HTMLButtonElement | null;
      if (signIn && !signIn.disabled) fireEvent.click(signIn);
      const pick = screen.queryByTestId(`space-row-pick-${KEY}`);
      if (pick) fireEvent.click(pick);
      await waitFor(() => expect(screen.getByTestId("space-header")).toBeTruthy());
      for (const button of screen.getAllByRole("button")) {
        // A row, and a picker's option, is a list row whose words are
        // its own (space-28).
        const id = button.dataset.testid ?? "";
        if (id.startsWith("space-repo-") || id.startsWith("space-pick-repo-") || id.startsWith("space-pick-group-")) continue;
        const text = (button.textContent ?? "").trim();
        expect(text.length, `"${text}"`).toBeLessThanOrEqual(14);
        // A control whose words yield keeps its accessible name.
        expect((button.getAttribute("aria-label") ?? text).length, id).toBeGreaterThan(0);
      }
      cleanup();
    }
  });

  test("the surface scrolls in its own box, and the yield ladder rides the container steps", async () => {
    await renderGroups(base({}, [repo({ local: [SESSION_UNIT] })]), { open: false });
    // The surface root is the box its content scrolls in, positioned,
    // and the container every step queries; the page never scrolls.
    const surface = screen.getByTestId("space-surface");
    for (const name of ["@container", "relative", "overflow-y-auto", "overflow-x-hidden", "min-h-0", "min-w-0"]) {
      expect(surface.className.split(/\s+/)).toContain(name);
    }
    // Each row is a container; its label owns the slack and truncates
    // with its title, the code and the counts hiding below @md.
    const item = screen.getByTestId(`space-row-${KEY}`);
    expect(item.className.split(/\s+/)).toContain("@container");
    const name = within(screen.getByTestId(`space-repo-${KEY}`)).getByText("academy-spex");
    expect(name.className).toContain("min-w-0");
    expect(name.className).toContain("flex-1");
    expect(name.className).toContain("truncate");
    expect(name.getAttribute("title")).toBe(KEY);
    expect(screen.getByTestId(`space-repo-code-${KEY}`).className).toContain("hidden");
    expect(screen.getByTestId(`space-repo-code-${KEY}`).className).toContain("@md:inline");
    expect(screen.getByTestId(`space-repo-counts-${KEY}`).className).toContain("@md:inline");
    // Below @md a count's words yield and the number stands alone.
    const changes = screen.getByTestId(`space-repo-changes-${KEY}`);
    expect(changes.textContent).toContain("1");
    expect(changes.querySelector(".hidden")?.className).toContain("@md:inline");
    // Members keeps its name in its icon form.
    const members = screen.getByTestId(`space-row-members-${KEY}`);
    expect(members.getAttribute("aria-label")).toBe("Members");
    expect(members.querySelector("svg")?.getAttribute("class")).toContain("@md:hidden");
    // The header's fields stack below @xs.
    for (const row of screen.getByTestId("space-header").children) {
      expect(row.className).toContain("flex-col");
      expect(row.className).toContain("@xs:flex-row");
    }
  });

  test("the sidebar entry and the surface read Groups", async () => {
    await renderGroups(base(), { open: false });
    expect(screen.getByRole("region", { name: "Groups" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Groups");
    const { SURFACE_LABELS } = await import("./NavRail.js");
    expect(SURFACE_LABELS.Space()).toBe("Groups");
  });
});
