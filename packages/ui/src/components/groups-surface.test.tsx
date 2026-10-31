// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Groups surface's header and groups list over a mocked client
// (DR-103, DR-127): the header with Refresh or the sign-in card, and the
// instance's heading with its account and last read (space-1, space-2),
// signing in through the browser flow and the device flow, its failure,
// Cancel, the instance's sign-out of this device and Sign out on its
// heading (space-3, space-6), every row state with its control, its
// overflow and its phrase (space-61, space-64), "Add to a group…"
// (space-58), "Open here" (space-63, space-111), Members (space-62), the
// vocabulary (space-27) and the label budget and the container steps the
// fit rests on (space-28). Each act is checked by the command it sends;
// its outcome arrives as state.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { GroupsState, InstanceGroupState, RepositoryState } from "@sublang/spex-core/protocol";

import { activateLanguage } from "../i18n.js";
import { absoluteTitle, shortMoment } from "../lib/time.js";
import { setClientForTests } from "../state/store.js";
import {
  BRANCH,
  GIT_WORDS,
  HOME,
  HOST_WORDS,
  HOUR,
  KEY,
  MIN,
  NOW,
  NO_CAN,
  OWN,
  OWN_REPO,
  ORIGIN,
  SECOND,
  SESSION_UNIT,
  answer,
  base,
  calls,
  commandMock,
  deliver,
  installClient,
  live,
  namespace,
  noInstance,
  renderGroups,
  repo,
  signedOutAt,
  strayRemote,
  withGroups,
  withInstance,
  type HomeOver,
  type RowOver,
} from "../fixtures/groups.js";

beforeEach(installClient);

/** A row's placement line at the fixtures' instance, in the row's Sync
 * tab, which the row's name opens where it is not open (space-87,
 * space-1). */
const lineAt = (key: string): HTMLElement => {
  if (!screen.queryByTestId(`space-lines-${key}`)) fireEvent.click(screen.getByTestId(`space-repo-${key}`));
  return within(screen.getByTestId(`space-lines-${key}`)).getByTestId(`space-line-${ORIGIN}`);
};

/** A row's overflow menu, "More", opened where it is not open
 * (space-1). */
const moreOf = (key: string): HTMLElement => {
  if (!screen.queryByTestId(`space-row-more-${key}-menu`)) fireEvent.click(screen.getByTestId(`space-row-more-${key}`));
  return screen.getByTestId(`space-row-more-${key}-menu`);
};

/** The entries of a row's overflow, each by its accessible name, the
 * menu closed again after. */
const moreEntries = (key: string): string[] => {
  const names = within(moreOf(key))
    .getAllByRole("menuitem")
    .map((item) => item.getAttribute("aria-label") ?? item.firstElementChild?.textContent ?? "");
  fireEvent.click(screen.getByTestId(`space-row-more-${key}`));
  return names;
};

/** A row's controls beside its name: every button but its name. */
const rowControls = (key: string): HTMLButtonElement[] =>
  within(screen.getByTestId(`space-row-${key}`))
    .getAllByRole("button")
    .filter((button) => !button.dataset.testid?.startsWith("space-repo-")) as HTMLButtonElement[];

afterEach(() => {
  cleanup();
  activateLanguage("en");
  setClientForTests(undefined);
  vi.useRealTimers();
});

/** Where the project's code is, as the core phrases it (space-1): the
 * core names the code's host, never its remote. */
const CODE = "Code: github.com";

/** A team group the host lists: its own spex repository, the same
 * project's spex repository another member pushed, a project this
 * device lacks, and one it may only read. */
function teamGroup(repos?: RepositoryState[]): InstanceGroupState {
  return {
    id: "2",
    login: null,
    mine: false,
    fullPath: "acme/team",
    name: "team",
    can: NO_CAN,
    placed: [],
    repositories: repos ?? [
      repo({ key: "@spex.example/acme/team/team-spex", name: "team-spex", id: "50", code: null, folder: null, members: 4 }),
      repo({ key: "@spex.example/acme/team/academy-spex", name: "academy-spex", id: "51", code: CODE, folder: null, members: 3, state: "absent", branch: null }),
      repo({ key: "@spex.example/acme/team/docs-spex", name: "docs-spex", id: "52", code: CODE, folder: null, state: "absent", branch: null }),
      repo({ key: "@spex.example/acme/team/old-spex", name: "old-spex", id: "53", code: CODE, state: "read-only", reason: "archived", lastSync: { at: NOW - 30 * MIN, sent: 0, received: 2 } }),
    ],
  };
}

/** A signed-in home whose project is still only on this device. */
function localProject(over: HomeOver = {}): GroupsState {
  const state = base(over, [repo({ state: "local-only", remote: null, id: null, code: CODE, branch: null, members: null })]);
  return over.instance?.groups ? state : withGroups(state, teamGroup());
}

/** A home that lists no instance: your own group alone, its
 * repositories local. */
function signedOut(over: HomeOver = {}): GroupsState {
  return noInstance(over, [repo({ state: "local-only", remote: null, id: null, code: CODE, branch: null, members: null })]);
}

describe("GROUPS: the header (space-1, space-2)", () => {
  test("space-66, space-1: signed in, the instance's heading reads its host name until a read names its display name, then its display name, beside @login with Sign out; the header holds Refresh, and the surface ends in where the files are", async () => {
    await renderGroups(base({ instance: { displayName: null } }), { open: false });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Space");
    // Before a read names it, the instance is named by its host name
    // (space-1).
    const section = screen.getByTestId(`space-instance-${ORIGIN}`);
    expect(screen.getByRole("group", { name: "spex.example" })).toBe(section);
    const heading = within(section).getByRole("heading", { level: 2 });
    expect(heading.textContent).toBe("spex.example · @jane");
    // A read names its display name.
    deliver(base());
    expect(screen.getByRole("group", { name: "Spex Example" })).toBe(section);
    expect(heading.textContent).toBe("Spex Example · @jane");
    // The account stands beside the name after the separator, in the
    // secondary tone (space-1).
    const account = within(section).getByTestId("space-account");
    expect(heading.contains(account)).toBe(true);
    expect(account.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
    expect(account.className).toContain("text-neutral-500");
    const signOut = within(section).getByRole("button", { name: "Sign out" }) as HTMLButtonElement;
    expect(signOut.title).toBe("Signs this computer out of Spex Example; every record stays here");
    // No read time stands on the heading (space-1).
    expect(within(section).queryByTestId("space-read-at")).toBeNull();
    // The header holds Refresh, titled with the last read, and neither
    // the account nor the card (space-1).
    const header = screen.getByTestId("space-header");
    expect(within(header).getByRole("button", { name: "Refresh" }).title).toBe("Last refreshed 1m ago");
    expect(within(header).queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(within(header).queryByTestId("space-read-at")).toBeNull();
    expect(screen.queryByTestId("space-signin-card")).toBeNull();
    expect(screen.queryByTestId("space-signin")).toBeNull();
    // The home is one quiet line at the surface's foot: selectable, its
    // full path in its title, with no control (space-1).
    const home = screen.getByTestId("space-home");
    expect(home.textContent).toBe("Spex keeps this computer's files in ~/.spex");
    expect(home.getAttribute("title")).toBe(HOME);
    expect(home.className).toContain("select-text");
    expect(home.querySelector("button")).toBeNull();
    expect(screen.getByTestId("space-surface").lastElementChild).toBe(home);
    expect(within(header).queryByRole("button", { name: "Copy path" })).toBeNull();
    // Signed out there, the line and Refresh go; the heading stays.
    deliver(signedOutAt(ORIGIN));
    expect(screen.queryByTestId("space-home")).toBeNull();
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
    expect(within(section).getByRole("heading", { level: 2 }).textContent).toBe("Spex Example");
  });

  test("Refresh asks the core to read the host and re-reads the state; signed out there is none", async () => {
    await renderGroups(base(), { open: false });
    expect(calls("space.get")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(calls("space.get")).toHaveLength(2));
    expect(calls("space.refresh")).toHaveLength(1);
    // The Space's read lands as a broadcast, and Refresh's title with
    // it.
    deliver(base({ instance: { readAt: NOW } }));
    expect(screen.getByRole("button", { name: "Refresh" }).title).toBe("Last refreshed just now");
    cleanup();
    await renderGroups(signedOut(), { open: false });
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
  });

  test("accepted Refresh stays visibly running until its actual outcome, and asynchronous failure offers retry", async () => {
    await renderGroups(base(), { open: false });
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type === "space.refresh") { deliver(base({ instance: { read: { phase: "running" } } })); return { accepted: true }; }
      return answer(type, fields);
    });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(calls("space.refresh")).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Reading…" })).toHaveProperty("disabled", true));
    deliver(base({ instance: { read: { phase: "failed", message: "Could not reach Spex Example" } } }));
    expect(screen.getByRole("alert").textContent).toBe("Could not reach Spex Example");
    expect(screen.getByRole("button", { name: "Refresh" })).toHaveProperty("disabled", false);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(calls("space.refresh")).toHaveLength(2));
    deliver(base({ instance: { read: { phase: "idle" }, readAt: NOW } }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Refresh" })).toHaveProperty("disabled", false);
  });

  test("first-read failure is visible with local-only rows and no previous read", async () => {
    const row = repo({ state: "local-only", reason: null, remote: null, id: null });
    await renderGroups(base({ instance: { readAt: null, read: { phase: "failed", message: "Could not reach Spex Example" } } }, [row]), { open: false });
    expect(screen.getByRole("alert").textContent).toBe("Could not reach Spex Example");
    // The local-only row stands, reading nothing (space-120).
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("");
    deliver(base({ instance: { signedIn: false, read: { phase: "idle" }, readAt: null } }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("a refused Refresh says why beside it", async () => {
    await renderGroups(base(), { open: false });
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type === "space.refresh") throw new Error("Could not reach Spex Example");
      return answer(type, fields);
    });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Could not reach Spex Example");
    expect(live()).toBe("Could not reach Spex Example");
  });

  test("space-66, space-1: listing no instance, the header is the card titled by its act with Sign in and no sentence, and the list holds This computer alone", async () => {
    await renderGroups(signedOut(), { open: false });
    const account = screen.getByTestId("space-signin-card");
    expect(within(account).getByRole("heading", { level: 2 }).textContent).toBe("Sign in to a Space");
    // No sentence stands in the card (space-3, DR-069).
    expect(account.querySelector("p")).toBeNull();
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
    // "This computer" alone, never named after this computer's user:
    // "Your sessions" reads no phrase and carries no control; the
    // project reads none, its "Add to a group…" disabled and titled
    // "Sign in to a Space first" (space-1, space-61, space-66).
    const groups = within(screen.getByTestId("space-groups")).getAllByRole("group");
    expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual(["This computer"]);
    expect(within(groups[0]!).getByRole("heading", { level: 2 }).textContent).toBe("This computer");
    expect(screen.getByTestId("space-groups").textContent).not.toContain("jane");
    expect(screen.getByTestId(`space-repo-${OWN}`).textContent).toBe("Your sessions");
    expect(screen.getByTestId(`space-repo-state-${OWN}`).textContent).toBe("");
    expect(rowControls(OWN)).toEqual([]);
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("");
    const add = screen.getByTestId(`space-row-pick-${KEY}`) as HTMLButtonElement;
    expect(add.textContent).toBe("Add to a group…");
    expect(add.disabled).toBe(true);
    expect(add.title).toBe("Sign in to a Space first");
    expect(rowControls(KEY).map((button) => button.dataset.testid)).toEqual([`space-row-pick-${KEY}`, `space-row-more-${KEY}`]);
    expect(moreEntries(KEY)).toEqual(["Explore records"]);
    // Public discovery is independent of Space sign-in; it grants no access.
    expect(commandMock.mock.calls.map(([type]) => type)).toEqual(["space.get", "registry.directory"]);
  });

  test("with no git the guidance replaces every other field", async () => {
    await renderGroups(base({ git: { ok: false, guidance: "Install Git from git-scm.com, then reopen Groups." } }));
    expect(screen.getByTestId("space-no-git").textContent).toContain("Git is not installed");
    expect(screen.getByTestId("space-no-git").textContent).toContain("git-scm.com");
    expect(screen.queryByTestId("space-signin-card")).toBeNull();
    expect(screen.queryByTestId(`space-instance-${ORIGIN}`)).toBeNull();
    expect(screen.queryByTestId("space-refresh")).toBeNull();
    expect(screen.queryByTestId("space-groups")).toBeNull();
    expect(screen.queryByTestId("space-repository")).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy path" })).toBeNull();
  });
});

describe("GROUPS: signing in (space-3, space-6, space-29)", () => {
  test("the browser flow opens the host's page through the bridge, reads 'Signing in…' with Cancel, and ends as the state says", async () => {
    const openExternal = vi.fn<(url: string) => Promise<boolean>>().mockResolvedValue(true);
    (window as { spexNative?: unknown }).spexNative = { pickDirectory: vi.fn(), openExternal };
    await renderGroups(signedOut(), { open: false });
    fireEvent.click(screen.getByTestId("space-signin"));
    await waitFor(() => expect(openExternal).toHaveBeenCalledWith("https://spex.example/login/app?client_id=spex&state=s"));
    expect(calls("space.signin.start")).toEqual([{ url: ORIGIN }]);
    const control = screen.getByTestId("space-signin") as HTMLButtonElement;
    await waitFor(() => expect(control.textContent).toBe("Signing in…"));
    expect(control.disabled).toBe(true);
    // "Continue in your browser" with the page offered again through the
    // bridge, named by the Space (space-3).
    expect(screen.getByTestId("space-signin-finish").textContent).toBe("Continue in your browser·Open spex.example");
    const again = screen.getByTestId("space-signin-link") as HTMLAnchorElement;
    expect(again.textContent).toBe("Open spex.example");
    expect(again.href).toBe("https://spex.example/login/app?client_id=spex&state=s");
    fireEvent.click(again);
    expect(openExternal).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    // The core reports the flow running, then its end with the account.
    deliver(signedOut({ signIn: { phase: "running", instance: ORIGIN, flow: "browser", since: NOW } }));
    expect(control.textContent).toBe("Signing in…");
    // Signed in, the card gives way to the instance's heading, focus
    // landing on its Sign out (DR-010 §6).
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("space-signin-cancel")));
    deliver(base());
    const section = screen.getByTestId(`space-instance-${ORIGIN}`);
    expect(within(section).getByTestId("space-account").textContent).toBe("· @jane");
    expect(screen.queryByTestId("space-signin-card")).toBeNull();
    const signOut = within(section).getByRole("button", { name: "Sign out" });
    await waitFor(() => expect(document.activeElement).toBe(signOut));
  });

  test("with no bridge, or one that refuses, the browser flow's page stands as a link to finish at", async () => {
    await renderGroups(signedOut(), { open: false });
    fireEvent.click(screen.getByTestId("space-signin"));
    const link = (await screen.findByTestId("space-signin-link")) as HTMLAnchorElement;
    expect(link.href).toBe("https://spex.example/login/app?client_id=spex&state=s");
    expect(link.textContent).toBe("Open spex.example");
    expect(screen.getByTestId("space-signin-finish").textContent).toBe("Continue in your browser·Open spex.example");
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
    expect(screen.queryByTestId("space-signin-body")).toBeNull();
  });

  test("the device flow links the page that carries the code, shows no code, and no row offers a sign-in", async () => {
    const complete = "https://spex.example/login/device?user_code=WDJB-MJHT";
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) =>
      type === "space.signin.start"
        ? { flow: "device", userCode: "WDJB-MJHT", verificationUri: complete, expiresAt: NOW + 15 * MIN }
        : answer(type, fields),
    );
    await renderGroups(signedOut(), { open: false });
    fireEvent.click(screen.getByTestId("space-signin"));
    const link = (await screen.findByTestId("space-signin-link")) as HTMLAnchorElement;
    // The link names the page it opens by the Space being signed in to.
    expect(link.textContent).toBe("Open spex.example");
    expect(link.href).toBe(complete);
    expect(link.target).toBe("_blank");
    expect(screen.getByTestId("space-signin-body").textContent).toBe("Continue in your browser·Open spex.example");
    // The code is never shown, nor offered to copy: the one field is the
    // Space address, holding the origin.
    expect(document.body.textContent).not.toContain("WDJB-MJHT");
    expect(screen.getAllByRole("textbox")).toEqual([screen.getByTestId("space-signin-address")]);
    expect((screen.getByTestId("space-signin-address") as HTMLInputElement).value).toBe(ORIGIN);
    const control = screen.getByTestId("space-signin") as HTMLButtonElement;
    expect(control.textContent).toBe("Signing in…");
    expect(control.disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(screen.getAllByRole("button").filter((button) => /Sign/.test(button.textContent ?? ""))).toEqual([control]);
    // A page that opens mid-flow reads the link from the state alone.
    cleanup();
    await renderGroups(
      signedOut({ signIn: { phase: "running", instance: ORIGIN, flow: "device", userCode: "ABCD-EFGH", verificationUri: complete, since: NOW } }),
      { open: false },
    );
    expect(screen.getByTestId("space-signin-link").textContent).toBe("Open spex.example");
    expect((screen.getByTestId("space-signin-link") as HTMLAnchorElement).href).toBe(complete);
    expect(screen.getByTestId("space-signin-body").textContent).toContain("Continue in your browser");
    expect(document.body.textContent).not.toContain("ABCD-EFGH");
    expect(screen.getByTestId("space-signin").textContent).toBe("Signing in…");
  });

  test("a denial, an expiry or a refusal ends the flow with its cause beside the control, which reads Sign in again", async () => {
    await renderGroups(signedOut({ signIn: { phase: "running", instance: ORIGIN, flow: "device", userCode: "ABCD-EFGH", verificationUri: "https://spex.example/oauth/device", since: NOW } }), { open: false });
    deliver(signedOut({ signIn: { phase: "failed", instance: ORIGIN, cause: "denied", message: "The sign-in was denied at Spex Example" } }));
    expect(screen.getByTestId("space-signin-error").textContent).toBe("The sign-in was denied at Spex Example");
    expect(screen.getByTestId("space-signin").textContent).toBe("Sign in again");
    expect(screen.queryByTestId("space-signin-link")).toBeNull();
    // A start the core refuses says why in the same place.
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type === "space.signin.start") throw new Error("A sign-in is already running");
      return answer(type, fields);
    });
    fireEvent.click(screen.getByTestId("space-signin"));
    await waitFor(() => expect(screen.getByTestId("space-signin-error").textContent).toBe("A sign-in is already running"));
  });

  test("space-66, space-3: where the core reports the instance signed this computer out, its heading reads '<display name> · signed out · @<login>' beside Sign in again and its overflow; one signed out by the reader reads its display name with the same controls", async () => {
    await renderGroups(signedOutAt(ORIGIN, { byHost: true }), { open: false });
    const section = screen.getByTestId(`space-instance-${ORIGIN}`);
    expect(within(section).getByRole("heading", { level: 2 }).textContent).toBe("Spex Example · signed out · @jane");
    // Beside it, its overflow and Sign in again (space-1, space-82).
    const controls = (heading: HTMLElement) =>
      within(within(heading).getByTestId("space-instance-heading"))
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label") ?? button.textContent);
    const both = ["More for Spex Example", "Sign in again"];
    expect(controls(section)).toEqual(both);
    expect(within(section).queryByRole("button", { name: "Sign out" })).toBeNull();
    // The home lists an instance, so no card stands in the header.
    expect(screen.queryByTestId("space-signin-card")).toBeNull();
    cleanup();
    // Signed out by the reader: its display name with the same controls.
    await renderGroups(signedOutAt(ORIGIN), { open: false });
    const mine = screen.getByTestId(`space-instance-${ORIGIN}`);
    expect(within(mine).getByRole("heading", { level: 2 }).textContent).toBe("Spex Example");
    expect(controls(mine)).toEqual(both);
  });

  test("space-3: from the instance's sign-out, Sign in again on its heading starts the flow there, Cancel brings its phrase back, and the next sign-in ends it", async () => {
    const complete = `${ORIGIN}/login/device?user_code=WDJB-MJHT`;
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) =>
      type === "space.signin.start"
        ? { flow: "device", userCode: "WDJB-MJHT", verificationUri: complete, expiresAt: NOW + 15 * MIN }
        : answer(type, fields),
    );
    const out = signedOutAt(ORIGIN, { byHost: true });
    await renderGroups(out, { open: false });
    const section = screen.getByTestId(`space-instance-${ORIGIN}`);
    const again = within(section).getByTestId("space-signin-again") as HTMLButtonElement;
    fireEvent.click(again);
    // The flow reads on the heading: the link to finish at, named by
    // the Space, no code shown (space-3).
    const link = (await within(section).findByTestId("space-signin-link")) as HTMLAnchorElement;
    expect(calls("space.signin.start")).toEqual([{ url: ORIGIN }]);
    expect(link.textContent).toBe("Open Spex Example");
    expect(link.href).toBe(complete);
    expect(document.body.textContent).not.toContain("WDJB-MJHT");
    expect(again.textContent).toBe("Signing in…");
    expect(again.disabled).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(within(section).getByTestId("space-signin-cancel")));
    fireEvent.click(within(section).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(again.textContent).toBe("Sign in again"));
    expect(within(section).queryByTestId("space-signin-link")).toBeNull();
    expect(within(section).getByRole("heading", { level: 2 }).textContent).toBe("Spex Example · signed out · @jane");
    await waitFor(() => expect(document.activeElement).toBe(again));
    // A sign-in that completes reads the account.
    deliver(base());
    expect(within(section).getByTestId("space-account").textContent).toBe("· @jane");
  });

  test("space-6: Sign out on the instance's heading sends space.signout naming it, keeps the heading signed out with Sign in again, and every row reads as the core then says", async () => {
    await renderGroups(base(), { open: false });
    const after = signedOutAt(ORIGIN, {}, base({}, [repo({ state: "unreachable", reason: "Sign in again" })]));
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) =>
      type === "space.signout" ? after : answer(type, fields),
    );
    const section = screen.getByTestId(`space-instance-${ORIGIN}`);
    fireEvent.click(within(section).getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(calls("space.signout")).toEqual([{ instance: ORIGIN }]));
    // The reply is the state: the heading kept, signed out, with Sign in
    // again, which takes focus; the live region says so (space-6).
    const again = await within(section).findByTestId("space-signin-again");
    expect(again.textContent).toBe("Sign in again");
    expect(within(section).getByRole("heading", { level: 2 }).textContent).toBe("Spex Example");
    expect(live()).toBe("Signed out of Spex Example");
    await waitFor(() => expect(document.activeElement).toBe(again));
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("Signed out of Spex Example");
    expect(screen.queryByTestId("space-signin-card")).toBeNull();
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

describe("GROUPS: the sign-in card's Space address, no directory read (space-66, space-115, space-3, git-host-2, git-host-3)", () => {
  /** The card's field, by its caption. */
  const field = () => screen.getByRole("textbox", { name: "Space address" }) as HTMLInputElement;
  /** The start answered by the device flow at the origin it names. */
  const deviceAt = (origin: string) =>
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) =>
      type === "space.signin.start"
        ? { flow: "device", userCode: "WDJB-MJHT", verificationUri: `${origin}/login/device?user_code=WDJB-MJHT`, expiresAt: NOW + 15 * MIN }
        : answer(type, fields),
    );

  test("space-115, space-3: with no directory the field stands alone, holding the default instance's origin, before Sign in, titled as opening the Space in the browser", async () => {
    await renderGroups(signedOut(), { open: false });
    const card = screen.getByTestId("space-signin-card");
    expect(within(card).queryByTestId("space-signin-chooser")).toBeNull();
    expect(within(card).getByTestId("space-signin-address")).toBe(field());
    expect(field().value).toBe(ORIGIN);
    expect(field().readOnly).toBe(false);
    const signIn = within(card).getByRole("button", { name: "Sign in" }) as HTMLButtonElement;
    expect(signIn.disabled).toBe(false);
    expect(signIn.title).toBe("Opens spex.example in your browser");
    // Sign in is the card's one primary control, after the field.
    expect(card.querySelectorAll("button.bg-brand-600")).toHaveLength(1);
    expect(field().compareDocumentPosition(signIn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test("space-3, git-host-3: an edited address starts the sign-in at the origin it holds, the flow's link naming that Space", async () => {
    deviceAt(SECOND);
    await renderGroups(signedOut(), { open: false });
    fireEvent.change(field(), { target: { value: `  ${SECOND}  ` } });
    expect(screen.getByTestId("space-signin").title).toBe("Opens second.example in your browser");
    fireEvent.click(screen.getByTestId("space-signin"));
    await waitFor(() => expect(calls("space.signin.start")).toEqual([{ url: SECOND }]));
    // The page the person opens is named by the Space being signed in
    // to, never the default instance (space-3).
    const link = (await screen.findByTestId("space-signin-link")) as HTMLAnchorElement;
    expect(link.textContent).toBe("Open second.example");
    expect(link.href).toBe(`${SECOND}/login/device?user_code=WDJB-MJHT`);
    // The origin being signed in to stands in the field while it runs.
    expect(field().readOnly).toBe(true);
    expect(screen.getByTestId("space-signin").textContent).toBe("Signing in…");
  });

  test("space-3, git-host-2: a URL the core refuses by the origin rule starts no flow, its cause read in the card, the field kept", async () => {
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type === "space.signin.start") throw new Error("Enter just the Space's address, like https://spex.sublang.ai");
      return answer(type, fields);
    });
    await renderGroups(signedOut(), { open: false });
    fireEvent.change(field(), { target: { value: `${SECOND}/x` } });
    fireEvent.click(screen.getByTestId("space-signin"));
    await waitFor(() =>
      expect(screen.getByTestId("space-signin-error").textContent).toBe("Enter just the Space's address, like https://spex.sublang.ai"),
    );
    expect(calls("space.signin.start")).toEqual([{ url: `${SECOND}/x` }]);
    // No flow: no link, no Cancel, Sign in standing again with the field
    // keeping the reader's text.
    expect(screen.queryByTestId("space-signin-link")).toBeNull();
    expect(screen.queryByTestId("space-signin-cancel")).toBeNull();
    expect(field().value).toBe(`${SECOND}/x`);
    expect(field().readOnly).toBe(false);
    const signIn = screen.getByTestId("space-signin") as HTMLButtonElement;
    expect(signIn.textContent).toBe("Sign in");
    expect(signIn.disabled).toBe(false);
    // The corrected origin starts the sign-in, the cause gone.
    commandMock.mockImplementation(answer);
    fireEvent.change(field(), { target: { value: SECOND } });
    fireEvent.keyDown(field(), { key: "Enter" });
    await waitFor(() => expect(calls("space.signin.start")).toEqual([{ url: `${SECOND}/x` }, { url: SECOND }]));
    await screen.findByTestId("space-signin-link");
    expect(screen.queryByTestId("space-signin-error")).toBeNull();
  });

  test("space-3: a blank address disables Sign in and sends nothing; Enter in a filled one starts the sign-in", async () => {
    await renderGroups(signedOut(), { open: false });
    fireEvent.change(field(), { target: { value: "   " } });
    const signIn = screen.getByTestId("space-signin") as HTMLButtonElement;
    expect(signIn.disabled).toBe(true);
    fireEvent.click(signIn);
    expect(calls("space.signin.start")).toEqual([]);
    fireEvent.change(field(), { target: { value: ORIGIN } });
    expect(signIn.disabled).toBe(false);
    fireEvent.keyDown(field(), { key: "Enter" });
    await waitFor(() => expect(calls("space.signin.start")).toEqual([{ url: ORIGIN }]));
  });

  test("space-3: Sign in hands focus to Cancel while the flow runs; Escape cancels it, focus back on Sign in", async () => {
    await renderGroups(signedOut(), { open: false });
    fireEvent.click(screen.getByTestId("space-signin"));
    await screen.findByTestId("space-signin-link");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("space-signin-cancel")));
    fireEvent.keyDown(field(), { key: "Escape" });
    await waitFor(() => expect(calls("space.signin.cancel")).toEqual([{}]));
    await waitFor(() => expect(screen.getByTestId("space-signin").textContent).toBe("Sign in"));
    expect(screen.queryByTestId("space-signin-link")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("space-signin")));
    // With no flow running, Escape cancels nothing.
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(calls("space.signin.cancel")).toHaveLength(1);
  });

  test("space-3: a page that opens on a flow another client runs names the state's Space in its link", async () => {
    const complete = `${SECOND}/login/device?user_code=ABCD-EFGH`;
    await renderGroups(
      signedOut({ signIn: { phase: "running", instance: SECOND, flow: "device", userCode: "ABCD-EFGH", verificationUri: complete, since: NOW } }),
      { open: false },
    );
    const link = screen.getByTestId("space-signin-link") as HTMLAnchorElement;
    expect(link.textContent).toBe("Open second.example");
    expect(link.href).toBe(complete);
    expect(document.body.textContent).not.toContain("ABCD-EFGH");
  });
});

describe("GROUPS: the groups list and its rows (space-1, space-61, space-64)", () => {
  test("space-1, space-66: the instance's heading over Personal, then every group it lists in the order of their paths, each by its name, its path where the two differ and its member count, each repository a row; This computer only while it holds one", async () => {
    const mine = base({}, [repo({ local: [SESSION_UNIT], lastSync: { at: NOW - 2 * 60 * MIN, sent: 1, received: 0 } })]);
    // A personal group the host names after the login, its path apart
    // from its name, and a group whose name is its path (space-1).
    const personal = { ...teamGroup([]), id: "3", fullPath: "jane1", name: "jane" };
    const plain = { ...teamGroup([]), id: "4", fullPath: "lab", name: "lab" };
    await renderGroups(withGroups(mine, plain, teamGroup(), personal), { open: false });
    const groups = within(screen.getByTestId("space-groups")).getAllByRole("group");
    expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual(["Spex Example", "Personal", "acme/team", "jane1", "lab"]);
    // Your sessions, placed at the instance, stand under Personal there,
    // and "This computer" stands only while it holds a row (space-1).
    expect(screen.queryByTestId("space-own")).toBeNull();
    const instance = screen.getByTestId(`space-instance-${ORIGIN}`);
    expect(groups[0]).toBe(instance);
    expect(groups[1]).toBe(screen.getByTestId("space-group-@jane"));
    // Under the instance's heading, Personal first, then each group a
    // heading of its own, by its name, its path beside it where the two
    // differ, and its member count where the last read holds one — its
    // own repository's members (space-1, space-66, DR-172).
    expect(within(instance).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "Personal",
      "team · acme/team · 4 members",
      "jane · jane1",
      "lab",
    ]);
    // The separator is the eye's: the heading's name reads its words.
    const count = screen.getByTestId("space-group-count-acme/team");
    expect(count.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
    expect(count.className).toContain("text-neutral-500");
    expect(screen.getByTestId("space-heading-beside-jane1").textContent).toBe("· jane1");
    expect(screen.queryByTestId("space-group-count-lab")).toBeNull();
    expect(screen.queryByTestId("space-heading-beside-lab")).toBeNull();
    expect(screen.queryByTestId("space-heading-beside-@jane")).toBeNull();
    // In each group the rows stand in the core's order, its own first;
    // a row's placement lines stand in its Sync tab alone (space-87).
    const rowsOf = (group: HTMLElement) =>
      within(group)
        .getAllByRole("listitem")
        .map((item) => item.dataset.testid)
        .filter((id) => id?.startsWith("space-row-"));
    expect(rowsOf(groups[2]!)).toEqual([
      "space-row-@spex.example/acme/team/team-spex",
      "space-row-@spex.example/acme/team/academy-spex",
      "space-row-@spex.example/acme/team/docs-spex",
      "space-row-@spex.example/acme/team/old-spex",
    ]);
    expect(rowsOf(groups[1]!)).toEqual([`space-row-${OWN}`, `space-row-${KEY}`]);

    // A project's row: its name with its `-spex` dropped, a glyph titled
    // by where its code is, and one phrase — its local changes as "<n>
    // to send", their kinds in its title — no dot, no change count, no
    // ahead and behind, which its placement's line carries in the Sync
    // tab (space-1, space-120, space-87).
    const row = screen.getByTestId(`space-repo-${KEY}`);
    expect(within(groups[1]!).getByRole("button", { name: "academy", expanded: false })).toBe(row);
    const code = screen.getByTestId(`space-repo-code-${KEY}`);
    expect(code.dataset.kind).toBe("elsewhere");
    expect(code.getAttribute("title")).toBe("Code: github.com");
    expect(code.textContent).toBe("Code: github.com");
    expect(code.querySelector("svg")).toBeTruthy();
    expect(screen.queryByTestId(`space-repo-changes-${KEY}`)).toBeNull();
    expect(screen.queryByTestId(`space-repo-dot-${KEY}`)).toBeNull();
    expect(screen.queryByTestId(`space-repo-counts-${KEY}`)).toBeNull();
    const state = screen.getByTestId(`space-repo-state-${KEY}`);
    expect(state.textContent).toBe("1 to send");
    expect(state.getAttribute("title")).toBe("Sessions (1)");
    // The row is named by its project alone, its code and phrase
    // describing it, so the name holds while the phrase changes.
    expect(row.getAttribute("aria-describedby")).toBe([`space-repo-code-${KEY}`, `space-repo-state-${KEY}`].join(" "));
    // A group's own spex repository reads as the group's sessions, your
    // own group's own as your sessions, neither carrying a code glyph
    // (space-1, DR-159).
    expect(screen.getByTestId(`space-repo-${OWN}`).textContent).toBe("Your sessions");
    expect(screen.getByTestId("space-repo-@spex.example/acme/team/team-spex").textContent).toBe("Group sessions");
    expect(screen.queryByTestId(`space-repo-code-${OWN}`)).toBeNull();
    expect(screen.queryByTestId("space-repo-code-@spex.example/acme/team/team-spex")).toBeNull();
    expect(screen.getByTestId("space-repo-@spex.example/acme/team/docs-spex").textContent).toBe("docs");

    // Activating a row opens its tabs beneath the list; again folds them.
    expect(screen.queryByTestId("space-repository")).toBeNull();
    fireEvent.click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("region", { name: "academy" })).toBeTruthy();
    // Its placements' lines stand in its Sync tab (space-87).
    expect(within(screen.getByTestId("space-repository")).getByTestId(`space-lines-${KEY}`)).toBeTruthy();
    expect(within(screen.getByTestId(`space-row-${KEY}`)).queryByTestId(`space-lines-${KEY}`)).toBeNull();
    expect(screen.getByRole("tab", { name: "Sync" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Explore" })).toBeTruthy();
    expect(screen.getByTestId("space-repository-folder").textContent).toBe("~/code/academy");
    fireEvent.click(row);
    expect(screen.queryByTestId("space-repository")).toBeNull();

    // A project in no group stands under "This computer" after every
    // instance, before "Add a Space…" (space-1).
    cleanup();
    const localRow = repo({ state: "local-only", remote: null, id: null, branch: null, members: null });
    await renderGroups(base({ own: { name: "jane", named: false, repositories: [OWN_REPO, localRow] } }, []), { open: false });
    const local = screen.getByTestId("space-own");
    expect(within(local).getByRole("heading", { level: 2 }).textContent).toBe("This computer");
    expect(local.getAttribute("aria-label")).toBe("This computer");
    const at = screen.getByTestId(`space-instance-${ORIGIN}`);
    expect(at.contains(local)).toBe(false);
    expect(at.compareDocumentPosition(local) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(local).getAllByRole("listitem").map((item) => item.dataset.testid)).toEqual([`space-row-${KEY}`]);
    // Its heading carries no control (space-1).
    expect(within(local).queryByTestId("space-group-more-jane")).toBeNull();
    expect(within(at).getByTestId(`space-row-${OWN}`)).toBeTruthy();
  });

  test("space-120, space-61: each state reads its one phrase and offers its control and its overflow; Members stands in a reachable row's overflow; nothing moves, places, leaves or attaches", async () => {
    // The phrase, the primary control, and the overflow's entries by
    // their names: "Sync now" where it can sync, Members on a reachable
    // placement, "Explore records" always (space-1, space-61, space-111,
    // space-120).
    const cases: [RowOver, string, string | null, string[]][] = [
      [{ state: "reachable", lastSync: null }, "Never synced", "Show", ["Sync now", "Members", "Explore records"]],
      [{ state: "reachable", lastSync: { at: NOW - 5 * MIN, sent: 1, received: 1 } }, "Synced 5m ago", "Show", ["Sync now", "Members", "Explore records"]],
      [{ state: "read-only", reason: "archived" }, "Read-only: archived", "Show", ["Sync now", "Explore records"]],
      [{ state: "unreachable", reason: "the host stopped listing it" }, "Unreachable: the host stopped listing it", "Retry", ["Explore records"]],
      // Not on this computer, the row reads nothing and offers Open here
      // (space-61, space-111).
      [{ state: "absent", folder: null, branch: null }, "", "Open here", ["Explore records"]],
      // Local only, it reads nothing (space-120).
      [{ state: "local-only", remote: null, id: null, branch: null }, "", "Add to a group…", ["Explore records"]],
    ];
    for (const [over, phrase, controlName, more] of cases) {
      await renderGroups(base({}, [repo(over)]), { open: false });
      expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent, phrase).toBe(phrase);
      // The row's control, then its one overflow, "More" (space-1).
      expect(
        rowControls(KEY).map((button) => button.getAttribute("aria-label") ?? button.textContent),
        phrase,
      ).toEqual([...(controlName ? [controlName] : []), "More for academy"]);
      expect(moreEntries(KEY), phrase).toEqual(more);
      cleanup();
    }
    // "Open here" says what it gets you (space-1, space-111).
    await renderGroups(base({}, [repo({ state: "absent", folder: null, branch: null })]), { open: false });
    expect(screen.getByTestId(`space-row-open-${KEY}`).getAttribute("title")).toBe("Downloads the records and the code to this computer");
  });

  test("space-61, space-66: a reachable row and its placement's line read its recorded sync, else the last one its clone holds", async () => {
    const held = (at: number, current: boolean) => ({ ...BRANCH, agreed: { at, current } });
    const recorded = NOW - 5 * MIN;
    const agreedAt = NOW - 3 * HOUR;
    const since = NOW - 26 * HOUR;
    const cases: [RowOver, string, number | null][] = [
      // This device's record stands over what the clone holds.
      [{ lastSync: { at: recorded, sent: 1, received: 0 }, branch: held(since, false) }, "Synced 5m ago", recorded],
      // None recorded — a core started afresh after a sync, a joined
      // clone — the clone's own commits say when it last agreed.
      [{ lastSync: null, branch: held(agreedAt, true) }, "Synced 3h ago", agreedAt],
      [{ lastSync: null, branch: held(since, false) }, `Not synced since ${shortMoment(since)}`, since],
      [{ lastSync: null, branch: { ...BRANCH, agreed: null } }, "Never synced", null],
    ];
    for (const [over, phrase, at] of cases) {
      await renderGroups(base({}, [repo(over)]), { open: false });
      const state = screen.getByTestId(`space-repo-state-${KEY}`);
      expect(state.textContent, phrase).toBe(phrase);
      // The full moment rides the title (DR-010 §2).
      expect(state.getAttribute("title"), phrase).toBe(at === null ? phrase : absoluteTitle(at));
      // Its placement's line, in its Sync tab, reads the same last sync,
      // its own ahead and behind beside it in the title (space-87,
      // space-8).
      const line = within(lineAt(KEY)).getByTestId("space-line-state");
      expect(line.textContent, phrase).toBe(phrase);
      expect(line.getAttribute("title"), phrase).toBe(
        `${at === null ? phrase : absoluteTitle(at)} · 2 commits ahead, 1 commit behind · checked ${absoluteTitle(BRANCH.checkedAt!)}`,
      );
      cleanup();
    }
    // In the reader's language, the moment as the locale writes it.
    activateLanguage("zh");
    await renderGroups(base({}, [repo({ lastSync: null, branch: held(since, false) })]), { open: false });
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe(`自 ${shortMoment(since)} 起未同步`);
    expect(shortMoment(since)).toMatch(/月/);
  });

  test("space-1: a project naming no code remote reads ⚠ Code: no remote; one at a Space a glyph titled by its display name; none before the core knows", async () => {
    await renderGroups(base({}, [repo({ code: "Code: no remote", codeKind: "none" })]), { open: false });
    const none = screen.getByTestId(`space-repo-code-${KEY}`);
    expect(none.textContent).toBe("⚠ Code: no remote");
    expect(none.dataset.kind).toBe("none");
    expect(none.getAttribute("title")).toBe("Code: no remote");
    cleanup();
    await renderGroups(base({}, [repo({ code: "Code: Spex Example", codeKind: "space" })]), { open: false });
    const space = screen.getByTestId(`space-repo-code-${KEY}`);
    expect(space.getAttribute("title")).toBe("Code: Spex Example");
    expect(space.querySelector("svg")).toBeTruthy();
    cleanup();
    await renderGroups(base({}, [repo({ code: null, codeKind: "unknown" })]), { open: false });
    expect(screen.queryByTestId(`space-repo-code-${KEY}`)).toBeNull();
  });

  test("space-61: signed out, no row offers a sign-in: a repository the instance holds waits for its heading's; a path remote retries", async () => {
    await renderGroups(base({ instance: { signedIn: false } }, [repo({ state: "unreachable", reason: "Sign in again" })]), { open: false });
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("Signed out of Spex Example");
    // No control stands beside it but its overflow, which holds
    // "Explore records" alone (space-61).
    expect(rowControls(KEY).map((button) => button.dataset.testid)).toEqual([`space-row-more-${KEY}`]);
    expect(within(moreOf(KEY)).getAllByRole("menuitem").map((item) => item.dataset.testid)).toEqual([`space-row-explore-${KEY}`]);
    cleanup();
    await renderGroups(base({ instance: { signedIn: false } }, [repo({ state: "unreachable", reason: "the folder is gone", remote: "/srv/academy-spex.git" })]), { open: false });
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

  test("space-64, space-87: a waiting creation's phrase stands on its line, the host's words in its title, the row reading nothing", async () => {
    const waiting = (step: "create" | "branch") =>
      repo({
        key: "@spex.example/acme/team/team-spex",
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
      await renderGroups(withGroups(base(), teamGroup([waiting(step)])), { open: false });
      // The row holds no placement: local only, it reads nothing
      // (space-61, space-120).
      expect(screen.getByTestId("space-repo-state-@spex.example/acme/team/team-spex").textContent).toBe("");
      // The step waits on the line of the instance it waits at, in the
      // row's Sync tab, the group named, the host's words in its title.
      fireEvent.click(screen.getByTestId("space-repo-@spex.example/acme/team/team-spex"));
      const line = within(screen.getByTestId("space-lines-@spex.example/acme/team/team-spex")).getByTestId(`space-line-${ORIGIN}`);
      expect(line.dataset.attached).toBe("false");
      expect(within(line).getByTestId("space-line-instance").textContent).toBe("Spex Example");
      expect(within(line).getByTestId("space-line-at").textContent).toBe("acme/team/team-spex");
      const state = within(line).getByTestId("space-line-state");
      expect(state.textContent).toBe(phrase);
      expect(state.getAttribute("title")).toBe("403 Forbidden: you need at least the Maintainer role");
      // A group's own repository is made at its first session, never
      // added to a group; the row names no host page to change.
      expect(within(screen.getByTestId("space-row-@spex.example/acme/team/team-spex")).queryByRole("button", { name: "Add to a group…" })).toBeNull();
      expect(screen.getByTestId("space-row-@spex.example/acme/team/team-spex").querySelector("a")).toBeNull();
      cleanup();
    }
  });

  test("a read-only row says new sessions stay on this computer, and a clone without its folder offers Choose folder…", async () => {
    await renderGroups(base({}, [repo({ state: "read-only", reason: "archived", lastSync: { at: NOW - MIN, sent: 0, received: 1 } })]), { open: false });
    expect(screen.getByTestId(`space-repo-state-${KEY}`).getAttribute("title")).toBe(
      "Read-only: archived · new sessions stay on this computer",
    );
    cleanup();
    const { answer: core } = await import("../fixtures/groups.js");
    commandMock.mockImplementation(async (type: string, fields: Record<string, unknown> = {}) => {
      if (type === "project.rebind") return { id: KEY, name: "academy", path: fields.path, registeredAt: 1 };
      if (type === "project.list") return [];
      return core(type, fields);
    });
    await renderGroups(base({}, [repo({ folder: null })]), { open: false });
    // This computer the only place, Open reads that one entry alone
    // (space-63, space-111).
    const open = screen.getByTestId(`space-row-open-${KEY}`);
    expect(open.textContent).toBe("Choose folder…");
    expect(open.dataset.entry).toBe(`space-row-folder-${KEY}`);
    fireEvent.click(open);
    const editor = screen.getByTestId(`space-folder-${KEY}`);
    const field = screen.getByTestId(`space-folder-${KEY}-path`);
    expect(document.activeElement).toBe(field);
    fireEvent.click(within(editor).getByRole("button", { name: "Use this folder" }));
    expect(within(editor).getByRole("alert").textContent).toBe("Name the folder on this computer");
    fireEvent.change(field, { target: { value: "/Users/jane/code/academy" } });
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() => expect(calls("project.rebind")).toEqual([{ projectId: KEY, path: "/Users/jane/code/academy" }]));
    await waitFor(() => expect(screen.queryByTestId(`space-folder-${KEY}`)).toBeNull());
  });
});

describe("GROUPS: Add to a group… (space-58, space-29)", () => {
  test("space-66, space-58: one picker offers, under the instance's display name, \"Join the records already in\" for the same code and project, each with its group and members, then \"Share into\" with Personal first and every group, no name field", async () => {
    // Beside your namespace and the team, a group named apart from its
    // path, as a team named in Chinese is, and one whose name is its path.
    const home = localProject();
    const huaxin = { ...teamGroup([]), id: "5", fullPath: "acme/huaxin-mfg", name: "华芯智造" };
    const lab = { ...teamGroup([]), id: "6", fullPath: "lab", name: "lab" };
    const [mine, team] = home.instances[0]!.groups;
    await renderGroups(withInstance(home, { groups: [mine!, huaxin, team!, lab] }), { open: false });
    const control = screen.getByTestId(`space-row-pick-${KEY}`);
    expect(control.textContent).toBe("Add to a group…");
    fireEvent.click(control);
    expect(control.getAttribute("aria-expanded")).toBe("true");
    const picker = screen.getByRole("group", { name: "Add academy to a group" });
    // Everything stands under the instance's display name, its heading
    // naming its section (space-58).
    const section = within(picker).getByRole("group", { name: "Spex Example" });
    expect(section).toBe(within(picker).getByTestId(`space-pick-instance-${ORIGIN}`));
    expect(within(section).getByRole("heading", { level: 3 }).textContent).toBe("Spex Example");
    // Under "Join the records already in", only the one whose code reads
    // as the folder's and whose project is the folder's — docs, its code
    // at the same host, is not (space-58).
    expect(within(section).getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent)).toEqual([
      "Join the records already in",
      "Share into",
    ]);
    const listed = within(section).getAllByTestId(/^space-pick-repo-/);
    expect(listed.map((option) => option.dataset.testid)).toEqual(["space-pick-repo-@spex.example/acme/team/academy-spex"]);
    // Named as its row is, its `-spex` dropped (space-1).
    expect(listed[0]!.textContent).toContain("academy");
    expect(listed[0]!.textContent).not.toContain("academy-spex");
    // Its group reads as the group's heading reads: its name, then its
    // path where the two differ (space-58).
    expect(screen.getByTestId("space-pick-listed-group-@spex.example/acme/team/academy-spex").textContent).toBe("team · acme/team");
    expect(listed[0]!.textContent).toContain("3 members");
    expect(document.activeElement).toBe(listed[0]);
    // Under "Share into", Personal first and every group: a group by its
    // name with its path after the separator where the two differ, and
    // by its name alone where they are equal (space-58).
    const offered = within(section).getAllByTestId(/^space-pick-group-/);
    expect(offered.map((option) => option.textContent)).toEqual([
      "Personal",
      "华芯智造 · acme/huaxin-mfg",
      "team · acme/team",
      "lab",
    ]);
    expect(offered[0]!.dataset.testid).toBe("space-pick-group-@jane");
    // The separator is the eye's: the button's name says the group's
    // name first, then its path (space-58).
    expect(within(picker).getByRole("button", { name: "华芯智造 acme/huaxin-mfg" })).toBe(offered[1]);
    expect(within(picker).getByRole("button", { name: "lab" })).toBe(offered[3]);
    // No field names the new records, nor does `-spex` stand anywhere
    // (space-58, DR-172).
    expect(screen.queryByTestId(`space-pick-name-${KEY}`)).toBeNull();
    expect(within(picker).queryByRole("textbox")).toBeNull();
    expect(picker.textContent).not.toContain("-spex");
  });

  test("picking a listed spex repository sends its host id; picking a group sends the group and the folder's name", async () => {
    await renderGroups(localProject(), { open: false });
    fireEvent.click(screen.getByTestId(`space-row-pick-${KEY}`));
    fireEvent.click(screen.getByTestId("space-pick-repo-@spex.example/acme/team/academy-spex"));
    await waitFor(() =>
      expect(calls("space.pick")).toEqual([{ repository: KEY, choice: { kind: "join", instance: ORIGIN, hostId: "51" } }]),
    );
    await waitFor(() => expect(screen.queryByTestId(`space-picker-${KEY}`)).toBeNull());
    fireEvent.click(screen.getByTestId(`space-row-pick-${KEY}`));
    fireEvent.click(screen.getByTestId("space-pick-group-acme/team"));
    await waitFor(() =>
      expect(calls("space.pick")[1]).toEqual({ repository: KEY, choice: { kind: "create", instance: ORIGIN, groupId: "2", name: "academy" } }),
    );
    // Your namespace is named by none, never by an id.
    await waitFor(() => expect(screen.queryByTestId(`space-picker-${KEY}`)).toBeNull());
    fireEvent.click(screen.getByTestId(`space-row-pick-${KEY}`));
    fireEvent.click(screen.getByTestId("space-pick-group-@jane"));
    await waitFor(() =>
      expect(calls("space.pick")[2]).toEqual({ repository: KEY, choice: { kind: "create", instance: ORIGIN, groupId: null, name: "academy" } }),
    );
  });

  test("space-57: a pick joining records others may share asks the sharing confirm in the picker first; Share joins with noticed", async () => {
    // A project this device's reader has not been told about, beside a
    // team's spex repository for the same code.
    const LISTED = "@spex.example/acme/team/academy-spex";
    const joining = (listed: RowOver, local: RowOver = {}): GroupsState => {
      const state = base({}, [repo({ state: "local-only", remote: null, id: null, code: CODE, branch: null, members: null, noticed: false, ...local })]);
      const team = repo({ key: LISTED, name: "academy-spex", id: "51", code: CODE, folder: null, members: 3, state: "absent", branch: null, noticed: false, ...listed });
      return withGroups(state, teamGroup([team]));
    };
    const option = () => screen.getByTestId(`space-pick-repo-${LISTED}`);
    const notice = () => screen.getByTestId(`space-pick-notice-${KEY}`);

    // With another member: the confirm stands in the picker beneath the
    // records picked — "Share with <group> at <display name>?" over its
    // three phrases — Cancel focused, and sends nothing until Share;
    // Escape and Cancel close it alone, focus back on the records
    // (space-57, space-58).
    await renderGroups(joining({}), { open: false });
    fireEvent.click(screen.getByTestId(`space-row-pick-${KEY}`));
    fireEvent.click(option());
    const picker = screen.getByTestId(`space-picker-${KEY}`);
    expect(picker.contains(notice())).toBe(true);
    expect(option().closest("li")!.contains(notice())).toBe(true);
    const confirm = within(notice()).getByTestId("space-sharing-confirm");
    expect(confirm.firstElementChild?.textContent).toBe("Share with team at Spex Example?");
    expect(within(confirm).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Every session, whole, attachments included",
      "Past and future records",
      "Members keep what they download",
    ]);
    expect(document.activeElement).toBe(within(notice()).getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByTestId(`space-pick-notice-${KEY}`)).toBeNull();
    expect(screen.getByTestId(`space-picker-${KEY}`)).toBe(picker);
    await waitFor(() => expect(document.activeElement).toBe(option()));
    fireEvent.click(option());
    fireEvent.click(within(notice()).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId(`space-pick-notice-${KEY}`)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(option()));
    expect(calls("space.pick")).toHaveLength(0);
    fireEvent.click(option());
    fireEvent.click(within(notice()).getByRole("button", { name: "Share" }));
    await waitFor(() =>
      expect(calls("space.pick")).toEqual([{ repository: KEY, choice: { kind: "join", instance: ORIGIN, hostId: "51" }, noticed: true }]),
    );
    await waitFor(() => expect(screen.queryByTestId(`space-picker-${KEY}`)).toBeNull());
    cleanup();

    // With a count the Space's last read lacks: the same confirm, and
    // public records say anyone can read them.
    commandMock.mockClear();
    await renderGroups(joining({ members: null, visibility: "public" }), { open: false });
    fireEvent.click(screen.getByTestId(`space-row-pick-${KEY}`));
    expect(option().textContent).not.toContain("member");
    fireEvent.click(option());
    expect(notice().textContent).toContain("Every session, whole, attachments included");
    expect(notice().textContent).toContain("Public: anyone can read");
    fireEvent.click(within(notice()).getByRole("button", { name: "Share" }));
    await waitFor(() =>
      expect(calls("space.pick")).toEqual([{ repository: KEY, choice: { kind: "join", instance: ORIGIN, hostId: "51" }, noticed: true }]),
    );
    cleanup();

    // A refused join closes the confirm, the refusal standing in the
    // picker and focus back on the records.
    commandMock.mockClear();
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type === "space.pick") throw new Error("No longer shared with you");
      return answer(type, fields);
    });
    await renderGroups(joining({}), { open: false });
    fireEvent.click(screen.getByTestId(`space-row-pick-${KEY}`));
    fireEvent.click(option());
    fireEvent.click(within(notice()).getByRole("button", { name: "Share" }));
    await waitFor(() =>
      expect(within(screen.getByTestId(`space-picker-${KEY}`)).getByRole("alert").textContent).toBe("No longer shared with you"),
    );
    expect(screen.queryByTestId(`space-pick-notice-${KEY}`)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(option()));
    cleanup();
    commandMock.mockImplementation(answer);

    // The account its only member, or the confirm answered already for
    // that placement: the pick joins at once, without noticed.
    for (const [listed, local] of [[{ members: 1 }, {}], [{ members: 3, noticed: true }, {}], [{ members: null, noticed: true }, {}]] as const) {
      commandMock.mockClear();
      await renderGroups(joining(listed, local), { open: false });
      fireEvent.click(screen.getByTestId(`space-row-pick-${KEY}`));
      fireEvent.click(option());
      expect(screen.queryByTestId(`space-pick-notice-${KEY}`)).toBeNull();
      await waitFor(() => expect(calls("space.pick")).toEqual([{ repository: KEY, choice: { kind: "join", instance: ORIGIN, hostId: "51" } }]));
      cleanup();
    }
  });

  test("a name the Space reports taken is refused in place, focus back on the choice picked", async () => {
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type === "space.pick") throw new Error("academy is taken in Personal");
      return answer(type, fields);
    });
    await renderGroups(localProject(), { open: false });
    fireEvent.click(screen.getByTestId(`space-row-pick-${KEY}`));
    fireEvent.click(screen.getByTestId("space-pick-group-@jane"));
    await waitFor(() =>
      expect(within(screen.getByTestId(`space-picker-${KEY}`)).getByRole("alert").textContent).toBe("academy is taken in Personal"),
    );
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("space-pick-group-@jane")));
    expect(calls("space.pick")).toEqual([{ repository: KEY, choice: { kind: "create", instance: ORIGIN, groupId: null, name: "academy" } }]);
  });

  test("Cancel and Escape leave the repository local only with Add to a group… offered again, focus on it", async () => {
    await renderGroups(localProject(), { open: false });
    const control = screen.getByTestId(`space-row-pick-${KEY}`);
    fireEvent.click(control);
    fireEvent.click(screen.getByTestId(`space-pick-cancel-${KEY}`));
    expect(screen.queryByTestId(`space-picker-${KEY}`)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(control));
    fireEvent.click(control);
    fireEvent.keyDown(screen.getByTestId("space-pick-group-@jane"), { key: "Escape" });
    expect(screen.queryByTestId(`space-picker-${KEY}`)).toBeNull();
    expect(calls("space.pick")).toHaveLength(0);
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("");
  });
});

describe("GROUPS: Open here (space-63, space-111, space-29)", () => {
  const ABSENT = "@spex.example/acme/team/docs-spex";

  test("with no directory picker Open here asks for the folder in place and sends the host id with it", async () => {
    await renderGroups(localProject(), { open: false });
    // This computer the only place, Open reads "Open here" alone
    // (space-111).
    const control = screen.getByTestId(`space-row-open-${ABSENT}`);
    expect(control.textContent).toBe("Open here");
    expect(control.dataset.entry).toBe(`space-row-open-here-${ABSENT}`);
    fireEvent.click(control);
    const editor = screen.getByTestId(`space-join-${ABSENT}`);
    expect(editor.textContent).toContain("Project folder on this computer");
    const field = screen.getByTestId(`space-join-${ABSENT}-path`);
    expect(document.activeElement).toBe(field);
    fireEvent.keyDown(field, { key: "Escape" });
    expect(screen.queryByTestId(`space-join-${ABSENT}`)).toBeNull();
    expect(calls("space.join")).toHaveLength(0);
    fireEvent.click(control);
    fireEvent.change(screen.getByTestId(`space-join-${ABSENT}-path`), { target: { value: "/Users/jane/code/docs" } });
    fireEvent.click(within(screen.getByTestId(`space-join-${ABSENT}`)).getByRole("button", { name: "Open here" }));
    await waitFor(() => expect(calls("space.join")).toEqual([{ instance: ORIGIN, hostId: "52", folder: "/Users/jane/code/docs" }]));
    // Accepted, the control stays busy until the machine moves.
    await waitFor(() => expect(screen.getByTestId(`space-row-open-${ABSENT}`).textContent).toBe("Opening…"));
  });

  test("a group's own spex repository asks for the folder its sessions run in", async () => {
    await renderGroups(
      withGroups(base(), teamGroup([repo({ key: "@spex.example/acme/team/team-spex", name: "team-spex", id: "50", code: null, folder: null, state: "absent", branch: null })])),
      { open: false },
    );
    fireEvent.click(screen.getByTestId("space-row-open-@spex.example/acme/team/team-spex"));
    expect(screen.getByTestId("space-join-@spex.example/acme/team/team-spex").textContent).toContain("Folder its sessions run in on this computer");
    // Its Open says it downloads the records alone (space-111).
    expect(screen.getByTestId("space-row-open-@spex.example/acme/team/team-spex").getAttribute("title")).toBe("Downloads the records to this computer");
  });

  test("with the directory picker Open here asks through it, opened by the act, and a cancelled pick sends nothing", async () => {
    const pickDirectory = vi.fn<() => Promise<string | null>>().mockResolvedValueOnce(null).mockResolvedValueOnce("/Users/jane/code/docs");
    (window as { spexNative?: unknown }).spexNative = { pickDirectory };
    await renderGroups(localProject(), { open: false });
    fireEvent.click(screen.getByTestId(`space-row-open-${ABSENT}`));
    await waitFor(() => expect(pickDirectory).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId(`space-join-${ABSENT}`)).toBeNull();
    expect(calls("space.join")).toHaveLength(0);
    fireEvent.click(screen.getByTestId(`space-row-open-${ABSENT}`));
    await waitFor(() => expect(calls("space.join")).toEqual([{ instance: ORIGIN, hostId: "52", folder: "/Users/jane/code/docs" }]));
  });

  test("a refused open keeps the folder in place with Git's words", async () => {
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type === "space.join") throw new Error("fatal: destination path '/Users/jane/code/docs' already exists and is not an empty directory.");
      return answer(type, fields);
    });
    await renderGroups(localProject(), { open: false });
    fireEvent.click(screen.getByTestId(`space-row-open-${ABSENT}`));
    fireEvent.change(screen.getByTestId(`space-join-${ABSENT}-path`), { target: { value: "/Users/jane/code/docs" } });
    fireEvent.keyDown(screen.getByTestId(`space-join-${ABSENT}-path`), { key: "Enter" });
    await waitFor(() =>
      expect(within(screen.getByTestId(`space-join-${ABSENT}`)).getByRole("alert").textContent).toContain("already exists"),
    );
    expect((screen.getByTestId(`space-join-${ABSENT}-path`) as HTMLInputElement).value).toBe("/Users/jane/code/docs");
  });
});

describe("GROUPS: the instance's entries (space-1, space-58, space-61, DR-120)", () => {
  /** Your own group; acme; another account's login under which the host
   * lists a repository; and a group named like your login. */
  function instanceHome(): GroupsState {
    const home = base({}, [repo({ state: "local-only", remote: null, id: null, branch: null, members: null })]);
    return withGroups(
      home,
      { id: "3", login: null, mine: false, fullPath: "acme", name: "Acme", can: { createSubgroup: true, manageMembers: true, rename: false, delete: false }, placed: [], repositories: [] },
      namespace(
        "bob",
        [repo({ key: "@spex.example/bob/notes-spex", name: "notes-spex", id: "80", remote: "bob/notes-spex", code: null, folder: null, members: 2, can: { manageMembers: true, transfer: false } })],
        false,
      ),
      {
        id: "9",
        login: null,
        mine: false,
        fullPath: "jane",
        name: "Jane's team",
        can: { createSubgroup: true, manageMembers: true, rename: false, delete: false },
        placed: [],
        repositories: [
          repo({ key: "@spex.example/jane/jane-spex@81", name: "jane-spex", id: "81", remote: "jane/jane-spex", code: null, folder: null, state: "unreachable", reason: "a group named like your login", branch: null }),
        ],
      },
    );
  }

  test("another login's entry carries no control on its heading, its row's placement line its own Members; a group named like your login stands apart, unreachable with no Open and no Sync", async () => {
    await renderGroups(instanceHome(), { open: false });
    // Your sessions and your namespace there stand under "Personal",
    // nothing under "This computer" (space-1).
    expect(screen.getAllByRole("group", { name: "Personal" })).toEqual([screen.getByTestId("space-group-@jane")]);
    expect(screen.queryByTestId("space-own")).toBeNull();
    // Under the instance's heading, Personal, then every group in the
    // order of their paths, then another account's login (space-1).
    const instance = screen.getByTestId(`space-instance-${ORIGIN}`);
    expect(within(instance).getAllByTestId(/^space-group-[^-]+$/).map((entry) => entry.dataset.testid)).toEqual([
      "space-group-@jane",
      "space-group-acme",
      "space-group-jane",
      "space-group-@bob",
    ]);
    // bob: headed "Shared by @bob", nothing on its heading — no "More"
    // (space-1).
    const bob = screen.getByTestId("space-group-@bob");
    expect(bob).toBe(screen.getByRole("group", { name: "Shared by @bob" }));
    expect(within(bob).getByRole("heading", { level: 3 }).textContent).toBe("Shared by @bob");
    expect(screen.queryByTestId("space-group-more-bob")).toBeNull();
    expect(screen.queryByTestId("space-group-members-bob")).toBeNull();
    expect(screen.queryByTestId("space-group-subgroup-bob")).toBeNull();
    // Its placement's line, in its Sync tab, carries its own Members,
    // Share where the host says so (space-62, space-87).
    fireEvent.click(within(lineAt("@spex.example/bob/notes-spex")).getByTestId("space-line-members"));
    const members = await screen.findByTestId(`space-members-@spex.example/bob/notes-spex@${ORIGIN}`);
    await within(members).findByTestId("space-member-jane");
    expect(within(members).getByTestId(`space-share-@spex.example/bob/notes-spex@${ORIGIN}`).textContent).toBe("Share");
    // The group named like your login: its own entry, its row
    // unreachable with the cause, Retry its one control (space-61).
    const apart = screen.getByTestId("space-group-jane");
    // By its name, its path beside it, and its member count, which its
    // own repository's listing carries (space-1).
    expect(within(apart).getByRole("heading", { level: 3 }).textContent).toBe("Jane's team · jane · 1 member");
    // Your namespace stands apart from it, headed "Personal".
    expect(within(screen.getByTestId("space-group-@jane")).getByRole("heading", { level: 3 }).textContent).toBe("Personal");
    const row = within(apart).getByTestId("space-row-@spex.example/jane/jane-spex@81");
    expect(within(row).getByTestId("space-repo-state-@spex.example/jane/jane-spex@81").textContent).toBe("Unreachable: a group named like your login");
    // No Open, no "Sync now" in its overflow; Retry its one control
    // (space-61, space-111).
    expect(within(row).queryByTestId("space-row-open-@spex.example/jane/jane-spex@81")).toBeNull();
    expect(within(moreOf("@spex.example/jane/jane-spex@81")).queryByTestId("space-row-sync-@spex.example/jane/jane-spex@81")).toBeNull();
    fireEvent.click(screen.getByTestId("space-row-more-@spex.example/jane/jane-spex@81"));
    expect(within(row).getByTestId("space-row-retry-@spex.example/jane/jane-spex@81").textContent).toBe("Retry");
    // No link anywhere, and no URL but a code remote as the reader set
    // it (space-1).
    const list = screen.getByTestId("space-groups");
    expect(list.querySelector("a")).toBeNull();
    expect(list.textContent ?? "").not.toMatch(/spex\.example\//);
    expect(within(row).queryByTestId("space-row-folder-@spex.example/jane/jane-spex@81")).toBeNull();
  });

  test("a row with no clone here opens with no clone's path or tree, and the pick offers no login's entry", async () => {
    await renderGroups(instanceHome(), { open: false });
    fireEvent.click(screen.getByTestId("space-repo-@spex.example/jane/jane-spex@81"));
    const panel = await screen.findByTestId("space-repository");
    expect(within(panel).queryByTestId("space-clone-path")).toBeNull();
    expect(within(screen.getByTestId("space-sync-tab")).getByText("Not on this computer")).toBeTruthy();
    // The pick offers "Personal" and the Space's groups, each by its
    // name with its path after it where the two differ, the group named
    // like your login apart from Personal, never another account's login
    // (space-58).
    fireEvent.click(screen.getByTestId(`space-row-pick-${KEY}`));
    const picker = await screen.findByTestId(`space-picker-${KEY}`);
    const options = within(picker).getAllByTestId(/^space-pick-group-/);
    expect(options.map((button) => button.textContent)).toEqual(["Personal", "Acme · acme", "Jane's team · jane"]);
    expect(options.map((button) => button.dataset.testid)).toEqual(["space-pick-group-@jane", "space-pick-group-acme", "space-pick-group-jane"]);
    expect(within(picker).queryByTestId("space-pick-group-bob")).toBeNull();
    expect(within(picker).queryByTestId("space-pick-group-@bob")).toBeNull();
  });
});

describe("GROUPS: Members (space-62)", () => {
  test("Members on the placement's line lists the host's members with their role names and no page of the host, read on every opening and Refresh", async () => {
    await renderGroups(base(), { open: false });
    const control = within(lineAt(KEY)).getByTestId("space-line-members");
    expect(control.getAttribute("aria-label")).toBe("Members");
    fireEvent.click(control);
    await waitFor(() => expect(calls("space.members")).toEqual([{ repository: KEY, instance: ORIGIN }]));
    const list = await screen.findByRole("region", { name: "Members of academy" });
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(2));
    expect(screen.getByTestId("space-member-jane").textContent).toContain("jane");
    expect(screen.getByTestId("space-member-jane").textContent).toContain("Owner");
    expect(screen.getByTestId("space-member-bob").textContent).toContain("bob");
    expect(screen.getByTestId("space-member-bob").textContent).toContain("Developer");
    // No link to a page of the host (space-62, DR-120).
    expect(list.querySelector("a")).toBeNull();
    // Refresh reads them again; nothing is cached across reads.
    fireEvent.click(screen.getByTestId("space-refresh"));
    await waitFor(() => expect(calls("space.members")).toHaveLength(2));
    fireEvent.keyDown(screen.getByTestId("space-member-jane"), { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Members of academy" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(control));
    fireEvent.click(control);
    await waitFor(() => expect(calls("space.members")).toHaveLength(3));
  });

  test("a read the host refuses says so in place", async () => {
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type === "space.members") throw new Error("Spex Example refused: 404 Project Not Found");
      return answer(type, fields);
    });
    await renderGroups(base(), { open: false });
    fireEvent.click(within(lineAt(KEY)).getByTestId("space-line-members"));
    expect((await screen.findByRole("alert")).textContent).toBe("Spex Example refused: 404 Project Not Found");
  });
});

describe("GROUPS: copy and fit (space-27, space-28)", () => {
  const states = (): GroupsState[] => [
    signedOut(),
    signedOut({ signIn: { phase: "running", instance: ORIGIN, flow: "device", userCode: "ABCD-EFGH", verificationUri: "https://spex.example/oauth/device", since: NOW } }),
    signedOut({ signIn: { phase: "failed", instance: ORIGIN, cause: "expired", message: "The code expired" } }),
    localProject(),
    base({}, [
      repo({ state: "read-only", reason: "archived" }),
    ]),
    base({}, [repo({ state: "unreachable", reason: "the device is offline", folder: null })]),
    base({}, [repo({ sync: { phase: "running", op: "sync", step: "push", since: NOW, cancelable: true }, branch: { ...BRANCH, ahead: 1 } })]),
    base({}, [repo({ sync: { phase: "unrelated", placement: ORIGIN }, branch: { ...BRANCH, unrelated: true } })]),
  ];

  test("no visible text says ours, theirs, HEAD, origin/spex, space or namespace, and remote only for the code's", async () => {
    for (const state of states()) {
      await renderGroups(state, { open: false });
      // What a row opens counts too: its group picker, its overflow, and
      // its Sync tab with its placement's line and members.
      const pick = screen.queryByTestId(`space-row-pick-${KEY}`);
      if (pick) fireEvent.click(pick);
      fireEvent.click(screen.getByTestId(`space-row-more-${KEY}`));
      fireEvent.click(screen.getByTestId(`space-repo-${KEY}`));
      const lines = screen.queryByTestId(`space-lines-${KEY}`);
      const line = lines ? within(lines).queryByTestId(`space-line-${ORIGIN}`) : null;
      const members = line ? within(line).queryByTestId("space-line-members") : null;
      if (members) {
        fireEvent.click(members);
        await screen.findByTestId("space-member-jane");
      }
      const text = document.body.textContent ?? "";
      expect(text).not.toMatch(GIT_WORDS);
      // Space names the product and its public directory, never a backend object.
      expect(text.replaceAll("Space", "")).not.toMatch(HOST_WORDS);
      expect(strayRemote(text)).toBe(false);
      cleanup();
    }
  });

  test("every control of the header and the rows reads at most 14 characters, its busy form included", async () => {
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) =>
      type === "space.sync" || type === "space.join" ? new Promise(() => {}) : answer(type, fields),
    );
    // "Add to a group…" is a whole phrase a decision fixes (space-58),
    // past the budget by design; a menu's entries are a list's rows, not
    // controls of the row, so the budget reads the visible buttons alone
    // (space-28, DR-159, DR-172).
    const named = new Set(["Add to a group…"]);
    for (const state of states()) {
      await renderGroups(state, { open: false });
      // Busy forms: a sync and a sign-in in flight.
      const more = screen.queryByTestId(`space-row-more-${KEY}`);
      if (more) {
        fireEvent.click(more);
        const sync = screen.queryByTestId(`space-row-sync-${KEY}`) as HTMLButtonElement | null;
        if (sync && !sync.disabled) fireEvent.click(sync);
        else fireEvent.click(more);
      }
      const signIn = screen.queryByTestId("space-signin") as HTMLButtonElement | null;
      if (signIn && !signIn.disabled) fireEvent.click(signIn);
      const pick = screen.queryByTestId(`space-row-pick-${KEY}`);
      if (pick) fireEvent.click(pick);
      await waitFor(() => expect(screen.getByTestId("space-header")).toBeTruthy());
      for (const button of screen.getAllByRole("button")) {
        // A row's name, and a picker's option, is a list row whose words
        // are its own (space-28).
        const id = button.dataset.testid ?? "";
        if (id.startsWith("space-repo-") || id.startsWith("space-pick-repo-") || id.startsWith("space-pick-group-")) continue;
        const text = (button.textContent ?? "").trim();
        if (named.has(text)) continue;
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
    // Each row is a container; its name owns the slack and truncates
    // with its title, its phrase truncating with its own, the code
    // hiding below @md; the row wraps its controls beneath it where it
    // must (space-28).
    const item = screen.getByTestId(`space-row-${KEY}`);
    expect(item.className.split(/\s+/)).toContain("@container");
    const name = screen.getByTestId(`space-repo-${KEY}`);
    expect(name.textContent).toBe("academy");
    for (const token of ["flex-1", "truncate"]) expect(name.className.split(/\s+/)).toContain(token);
    expect(name.getAttribute("title")).toBe("academy");
    const phrase = screen.getByTestId(`space-repo-state-${KEY}`);
    for (const token of ["min-w-0", "truncate"]) expect(phrase.className.split(/\s+/)).toContain(token);
    expect(name.parentElement!.className.split(/\s+/)).toContain("flex-wrap");
    expect(screen.getByTestId(`space-repo-code-${KEY}`).className).toContain("hidden");
    expect(screen.getByTestId(`space-repo-code-${KEY}`).className).toContain("@md:inline-flex");
    // The local changes read as the one phrase, no count beside it
    // (space-120).
    expect(phrase.textContent).toBe("1 to send");
    expect(screen.queryByTestId(`space-repo-changes-${KEY}`)).toBeNull();
    // The overflow keeps its name in its mark's form (space-1).
    expect(screen.getByTestId(`space-row-more-${KEY}`).getAttribute("aria-label")).toBe("More for academy");
    // Members on the placement's line keeps its name in its icon form.
    const members = within(lineAt(KEY)).getByTestId("space-line-members");
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
    expect(screen.getByRole("region", { name: "Space" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Space");
    const { SURFACE_LABELS } = await import("./NavRail.js");
    expect(SURFACE_LABELS.Space()).toBe("Space");
  });
});
