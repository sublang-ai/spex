// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Groups surface's header and groups list over a mocked client
// (DR-103, DR-127): the header with Refresh or the sign-in card, and the
// instance's heading with its account and last read (space-1, space-2),
// signing in through the browser flow and the device flow, its failure,
// Cancel, the instance's sign-out of this device and Sign out on its
// heading (space-3, space-6), every row state with its control and phrase (space-61,
// space-64), Pick a group (space-58), Join (space-63), Members
// (space-62), the vocabulary (space-27) and the label budget and the
// container steps the fit rests on (space-28). Each act is checked by
// the command it sends; its outcome arrives as state.

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

/** A row's placement line at the fixtures' instance (space-87). */
const lineAt = (key: string): HTMLElement => within(screen.getByTestId(`space-row-${key}`)).getByTestId(`space-line-${ORIGIN}`);

afterEach(() => {
  cleanup();
  activateLanguage("en");
  setClientForTests(undefined);
  vi.useRealTimers();
});

const CODE = "git@github.com:jane/academy.git";

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
      repo({ key: "@spex.example/acme/team/docs-spex", name: "docs-spex", id: "52", code: "git@github.com:acme/docs.git", folder: null, state: "absent", branch: null }),
      repo({ key: "@spex.example/acme/team/old-spex", name: "old-spex", id: "53", code: "git@github.com:acme/old.git", state: "read-only", reason: "archived", lastSync: { at: NOW - 30 * MIN, sent: 0, received: 2 } }),
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
  test("space-66, space-1: signed in, the instance's heading reads its host name until a read names its display name, then its display name, Signed in as @login with Sign out and its read time; the header holds Refresh, and the surface ends in where the files are", async () => {
    await renderGroups(base({ instance: { displayName: null } }), { open: false });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Groups");
    // Before a read names it, the instance is named by its host name
    // (space-1).
    const section = screen.getByTestId(`space-instance-${ORIGIN}`);
    expect(screen.getByRole("group", { name: "spex.example" })).toBe(section);
    const heading = within(section).getByRole("heading", { level: 2 });
    expect(heading.textContent).toBe("spex.example · Signed in as @jane");
    // A read names its display name.
    deliver(base());
    expect(screen.getByRole("group", { name: "Spex Example" })).toBe(section);
    expect(heading.textContent).toBe("Spex Example · Signed in as @jane");
    // The account stands beside the name after the separator, in the
    // secondary tone (space-1).
    const account = within(section).getByTestId("space-account");
    expect(heading.contains(account)).toBe(true);
    expect(account.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
    expect(account.className).toContain("text-neutral-500");
    const signOut = within(section).getByRole("button", { name: "Sign out" }) as HTMLButtonElement;
    expect(signOut.title).toBe("Signs this device out of Spex Example; every record stays here");
    // The read time is the instance's, from the core; it yields below
    // @2xl, its full moment in its title (space-28).
    const readAt = within(section).getByTestId("space-read-at");
    expect(readAt.textContent).toBe("Read 1m ago");
    expect(readAt.className).toContain("@2xl:inline");
    expect(readAt.getAttribute("title")).toBe(absoluteTitle(NOW - MIN));
    // The header holds Refresh, reading every signed-in instance, and
    // neither the account nor a read time nor the card (space-1).
    const header = screen.getByTestId("space-header");
    expect(within(header).getByRole("button", { name: "Refresh" }).title).toBe("Reads each signed-in instance again");
    expect(within(header).queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(within(header).queryByTestId("space-read-at")).toBeNull();
    expect(screen.queryByTestId("space-signin-card")).toBeNull();
    expect(screen.queryByTestId("space-signin")).toBeNull();
    // The home is one quiet line at the surface's foot: selectable, its
    // full path in its title, with no control (space-1).
    const home = screen.getByTestId("space-home");
    expect(home.textContent).toBe("Spex keeps this device's files in ~/.spex");
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
    // The host's read lands as a broadcast, and its time with it.
    deliver(base({ instance: { readAt: NOW } }));
    expect(screen.getByTestId("space-read-at").textContent).toBe("Read just now");
    cleanup();
    commandMock.mockClear();
    await renderGroups(base({ instance: { readAt: null } }), { open: false });
    expect(screen.getByTestId("space-read-at").textContent).toBe("Not read yet");
    cleanup();
    await renderGroups(signedOut(), { open: false });
    expect(screen.queryByTestId("space-read-at")).toBeNull();
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
    expect(screen.getByTestId("space-read-at").textContent).toBe("Not read yet");
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

  test("space-66, space-1: listing no instance, the header is one card with what signing in brings and Sign in, and the list holds your own group alone", async () => {
    await renderGroups(signedOut(), { open: false });
    const account = screen.getByTestId("space-signin-card");
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
    // The key phrase stands where its path will, which the sign-in
    // names after the login (space-1, space-59): no path before it.
    expect(within(groups[0]!).getByRole("heading", { level: 2 }).textContent).toBe(
      "Your own group · named after your login at sign-in",
    );
    expect(within(groups[0]!).getByRole("heading", { level: 2 }).textContent).not.toContain("jane");
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
    cleanup();
    // Listing no instance once its folder bears a login — the last
    // instance forgotten — your own group reads its path, as the core
    // says it no longer bears this device's user name (space-1).
    const forgotten = signedOut();
    await renderGroups({ ...forgotten, own: { ...forgotten.own, named: false } }, { open: false });
    expect(within(screen.getByTestId("space-own")).getByRole("heading", { level: 2 }).textContent).toBe("Your own group · jane");
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
    // Where the browser is open and what to do there, with the page
    // offered again through the bridge (space-3).
    expect(screen.getByTestId("space-signin-opened").textContent).toBe(
      "Your browser is open at spex.example: sign in there and approve; you return here signed in. Open it again",
    );
    const again = screen.getByTestId("space-signin-link") as HTMLAnchorElement;
    expect(again.textContent).toBe("Open it again");
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
    expect(within(section).getByTestId("space-account").textContent).toBe("· Signed in as @jane");
    expect(screen.queryByTestId("space-signin-card")).toBeNull();
    const signOut = within(section).getByRole("button", { name: "Sign out" });
    await waitFor(() => expect(document.activeElement).toBe(signOut));
  });

  test("with no bridge, or one that refuses, the browser flow's page stands as a link to finish at", async () => {
    await renderGroups(signedOut(), { open: false });
    fireEvent.click(screen.getByTestId("space-signin"));
    const link = (await screen.findByTestId("space-signin-link")) as HTMLAnchorElement;
    expect(link.href).toBe("https://spex.example/login/app?client_id=spex&state=s");
    expect(link.textContent).toBe("Open spex.example to sign in");
    expect(screen.getByTestId("space-signin-finish").textContent).toBe("Continue in your browser:");
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
    await renderGroups(signedOut(), { open: false });
    fireEvent.click(screen.getByTestId("space-signin"));
    const link = (await screen.findByTestId("space-signin-link")) as HTMLAnchorElement;
    // The link names the page it opens by its host name.
    expect(link.textContent).toBe("Open spex.example to sign in");
    expect(link.href).toBe(complete);
    expect(link.target).toBe("_blank");
    expect(screen.getByTestId("space-signin-body").textContent).toBe(
      "Continue in your browser:Open spex.example to sign in" +
        "Sign in there and approve; you return here signed in.",
    );
    // The code is never shown, nor offered to copy: the one field is
    // the Instance field, holding the origin.
    expect(document.body.textContent).not.toContain("WDJB-MJHT");
    expect(screen.getAllByRole("textbox")).toEqual([screen.getByTestId("space-signin-instance")]);
    expect((screen.getByTestId("space-signin-instance") as HTMLInputElement).value).toBe(ORIGIN);
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
    expect(screen.getByTestId("space-signin-link").textContent).toBe("Open spex.example to sign in");
    expect((screen.getByTestId("space-signin-link") as HTMLAnchorElement).href).toBe(complete);
    expect(screen.getByTestId("space-signin-body").textContent).toContain("Sign in there and approve");
    expect(document.body.textContent).not.toContain("ABCD-EFGH");
    expect(screen.getByTestId("space-signin").textContent).toBe("Signing in…");
  });

  test("a denial, an expiry or a refusal ends the flow with its cause beside the control, which reads Sign in again", async () => {
    await renderGroups(signedOut({ signIn: { phase: "running", instance: ORIGIN, flow: "device", userCode: "ABCD-EFGH", verificationUri: "https://spex.example/oauth/device", since: NOW } }), { open: false });
    deliver(signedOut({ signIn: { phase: "failed", instance: ORIGIN, cause: "denied", message: "The sign-in was denied at Spex Example" } }));
    expect(screen.getByTestId("space-signin-error").textContent).toBe("The sign-in was denied at Spex Example.");
    expect(screen.getByTestId("space-signin").textContent).toBe("Sign in again");
    expect(screen.queryByTestId("space-signin-link")).toBeNull();
    // A start the core refuses says why in the same place.
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type === "space.signin.start") throw new Error("A sign-in is already running");
      return answer(type, fields);
    });
    fireEvent.click(screen.getByTestId("space-signin"));
    await waitFor(() => expect(screen.getByTestId("space-signin-error").textContent).toBe("A sign-in is already running."));
  });

  test.each(["en", "zh"] as const)("space-66, space-3: where the core reports the instance signed this device out, its heading reads the sentence beside Sign in again and Forget; one signed out by the reader carries the two controls alone (%s)", async (language) => {
    activateLanguage(language);
    await renderGroups(signedOutAt(ORIGIN, { byHost: true }), { open: false });
    const section = screen.getByTestId(`space-instance-${ORIGIN}`);
    // Signed out, the heading keeps the display name it last read, with
    // no account beside it (space-1).
    expect(within(section).getByRole("heading", { level: 2 }).textContent).toBe("Spex Example");
    expect(within(section).queryByTestId("space-account")).toBeNull();
    // The host name is the instance's, with the login it bore there.
    expect(within(section).getByTestId("space-signed-out-by-host").textContent).toBe(
      language === "zh"
        ? "spex.example 已让此设备退出登录。重新登录即可以 @jane 继续。"
        : "spex.example signed this device out. Sign in again to continue as @jane.",
    );
    // Beside it, the heading's two controls: Forget and Sign in again
    // (space-1, space-82).
    const controls = (heading: HTMLElement) =>
      within(within(heading).getByTestId("space-instance-heading"))
        .getAllByRole("button")
        .map((button) => button.textContent);
    const both = language === "zh" ? ["忘记", "重新登录"] : ["Forget", "Sign in again"];
    expect(controls(section)).toEqual(both);
    expect(within(section).queryByRole("button", { name: language === "zh" ? "退出登录" : "Sign out" })).toBeNull();
    // The home lists an instance, so no card stands in the header.
    expect(screen.queryByTestId("space-signin-card")).toBeNull();
    cleanup();
    // Signed out by the reader: the two controls alone.
    await renderGroups(signedOutAt(ORIGIN), { open: false });
    const mine = screen.getByTestId(`space-instance-${ORIGIN}`);
    expect(within(mine).queryByTestId("space-signed-out-by-host")).toBeNull();
    expect(controls(mine)).toEqual(both);
  });

  test("space-3: from the instance's sign-out, Sign in again on its heading starts the flow there, Cancel brings the sentence back, and the next sign-in ends it", async () => {
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
    // the instance's host name, no code shown (space-3).
    const link = (await within(section).findByTestId("space-signin-link")) as HTMLAnchorElement;
    expect(calls("space.signin.start")).toEqual([{ url: ORIGIN }]);
    expect(link.textContent).toBe("Open spex.example to sign in");
    expect(link.href).toBe(complete);
    expect(document.body.textContent).not.toContain("WDJB-MJHT");
    expect(again.textContent).toBe("Signing in…");
    expect(again.disabled).toBe(true);
    expect(within(section).queryByTestId("space-signed-out-by-host")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(within(section).getByTestId("space-signin-cancel")));
    fireEvent.click(within(section).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(again.textContent).toBe("Sign in again"));
    expect(within(section).queryByTestId("space-signin-link")).toBeNull();
    expect(within(section).getByTestId("space-signed-out-by-host").textContent).toBe(
      "spex.example signed this device out. Sign in again to continue as @jane.",
    );
    await waitFor(() => expect(document.activeElement).toBe(again));
    // A sign-in that completes reads the account, the sentence gone.
    deliver(base());
    expect(within(section).getByTestId("space-account").textContent).toBe("· Signed in as @jane");
    expect(within(section).queryByTestId("space-signed-out-by-host")).toBeNull();
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
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("Unreachable: Sign in again");
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

describe("GROUPS: the sign-in card's Instance field (space-66, space-3, git-host-2, git-host-3)", () => {
  /** The card's field, by its caption. */
  const field = () => screen.getByRole("textbox", { name: "Instance" }) as HTMLInputElement;
  /** The start answered by the device flow at the origin it names. */
  const deviceAt = (origin: string) =>
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) =>
      type === "space.signin.start"
        ? { flow: "device", userCode: "WDJB-MJHT", verificationUri: `${origin}/login/device?user_code=WDJB-MJHT`, expiresAt: NOW + 15 * MIN }
        : answer(type, fields),
    );

  test("space-66, space-3: signed out, the card holds its two sentences, the Instance field holding the default instance's origin, and Sign in, with no home path, Copy path, read time or Refresh", async () => {
    await renderGroups(signedOut(), { open: false });
    const card = screen.getByTestId("space-signin-card");
    expect(within(card).getByRole("heading", { level: 2 }).textContent).toBe("Not signed in");
    expect(screen.getByTestId("space-signin-body").textContent).toBe(
      "Sign in to see your groups and share each project's records with the people in them." +
        "Until you do, everything stays on this device and nothing is contacted.",
    );
    // The field is captioned "Instance" and holds the default instance's
    // origin until the reader edits it (space-3, storage-2).
    expect(within(card).getByTestId("space-signin-instance")).toBe(field());
    expect(field().value).toBe(ORIGIN);
    expect(field().readOnly).toBe(false);
    const signIn = within(card).getByRole("button", { name: "Sign in" }) as HTMLButtonElement;
    expect(signIn.disabled).toBe(false);
    expect(signIn.title).toBe("Signs in to spex.example");
    // Sign in is the card's one primary control, after the field.
    expect(card.querySelectorAll("button.bg-brand-600")).toHaveLength(1);
    expect(field().compareDocumentPosition(signIn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const header = screen.getByTestId("space-header");
    expect(header.textContent).not.toContain("~/.spex");
    expect(screen.queryByTestId("space-home")).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy path" })).toBeNull();
    expect(screen.queryByTestId("space-read-at")).toBeNull();
    expect(screen.queryByTestId("space-refresh")).toBeNull();
  });

  test("space-3, git-host-3: an edited field starts the sign-in at the origin it holds, the flow's lines naming that origin's host name", async () => {
    deviceAt(SECOND);
    await renderGroups(signedOut(), { open: false });
    fireEvent.change(field(), { target: { value: `  ${SECOND}  ` } });
    expect(screen.getByTestId("space-signin").title).toBe("Signs in to second.example");
    fireEvent.click(screen.getByTestId("space-signin"));
    await waitFor(() => expect(calls("space.signin.start")).toEqual([{ url: SECOND }]));
    // The page the person opens is named by the host name of the origin
    // being signed in to, never the default instance's (space-3).
    const link = (await screen.findByTestId("space-signin-link")) as HTMLAnchorElement;
    expect(link.textContent).toBe("Open second.example to sign in");
    expect(link.href).toBe(`${SECOND}/login/device?user_code=WDJB-MJHT`);
    // The origin being signed in to stands in the field while it runs.
    expect(field().value).toBe(SECOND);
    expect(field().readOnly).toBe(true);
    expect(screen.getByTestId("space-signin").textContent).toBe("Signing in…");
    deliver(signedOut({ signIn: { phase: "running", instance: SECOND, flow: "device", userCode: "WDJB-MJHT", verificationUri: link.href, since: NOW } }));
    expect(screen.getByTestId("space-signin-link").textContent).toBe("Open second.example to sign in");
  });

  test("space-3, git-host-2: the browser flow at an edited origin reads that the browser is open at its host name", async () => {
    const openExternal = vi.fn<(url: string) => Promise<boolean>>().mockResolvedValue(true);
    (window as { spexNative?: unknown }).spexNative = { pickDirectory: vi.fn(), openExternal };
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) =>
      type === "space.signin.start" ? { flow: "browser", url: `${SECOND}/login/app?client_id=spex&state=s` } : answer(type, fields),
    );
    await renderGroups(signedOut(), { open: false });
    fireEvent.change(field(), { target: { value: SECOND } });
    fireEvent.click(screen.getByTestId("space-signin"));
    await waitFor(() => expect(openExternal).toHaveBeenCalledWith(`${SECOND}/login/app?client_id=spex&state=s`));
    expect(calls("space.signin.start")).toEqual([{ url: SECOND }]);
    expect((await screen.findByTestId("space-signin-opened")).textContent).toBe(
      "Your browser is open at second.example: sign in there and approve; you return here signed in. Open it again",
    );
  });

  test("space-3, git-host-2: a URL the core refuses by the origin rule starts no flow, its cause read as one sentence, the field kept and focused", async () => {
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type === "space.signin.start") throw new Error("An instance is named by its origin alone, with no path, query or user");
      return answer(type, fields);
    });
    await renderGroups(signedOut(), { open: false });
    fireEvent.change(field(), { target: { value: `${SECOND}/x` } });
    fireEvent.click(screen.getByTestId("space-signin"));
    await waitFor(() =>
      expect(screen.getByTestId("space-signin-error").textContent).toBe(
        "An instance is named by its origin alone, with no path, query or user.",
      ),
    );
    expect(calls("space.signin.start")).toEqual([{ url: `${SECOND}/x` }]);
    expect(live()).toBe("An instance is named by its origin alone, with no path, query or user");
    // No flow: no link, no Cancel, Sign in standing again with the field
    // keeping the reader's text and taking focus.
    expect(screen.queryByTestId("space-signin-link")).toBeNull();
    expect(screen.queryByTestId("space-signin-cancel")).toBeNull();
    expect(field().value).toBe(`${SECOND}/x`);
    expect(field().readOnly).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(field()));
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

  test("space-3: a blank field disables Sign in and sends nothing; Enter in a filled one starts the sign-in", async () => {
    await renderGroups(signedOut(), { open: false });
    fireEvent.change(field(), { target: { value: "   " } });
    const signIn = screen.getByTestId("space-signin") as HTMLButtonElement;
    expect(signIn.disabled).toBe(true);
    expect(signIn.getAttribute("title")).toBeNull();
    fireEvent.click(signIn);
    fireEvent.keyDown(field(), { key: "Enter" });
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
    expect(screen.getByTestId("space-signin-caption")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("space-signin")));
    // With no flow running, Escape cancels nothing.
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(calls("space.signin.cancel")).toHaveLength(1);
  });

  test("space-3: a page that opens on a flow another client runs names the host of the state's instance in its link", async () => {
    const complete = `${SECOND}/login/device?user_code=ABCD-EFGH`;
    await renderGroups(
      signedOut({ signIn: { phase: "running", instance: SECOND, flow: "device", userCode: "ABCD-EFGH", verificationUri: complete, since: NOW } }),
      { open: false },
    );
    const link = screen.getByTestId("space-signin-link") as HTMLAnchorElement;
    expect(link.textContent).toBe("Open second.example to sign in");
    expect(link.href).toBe(complete);
    expect(document.body.textContent).not.toContain("ABCD-EFGH");
    // The field still holds the default instance's origin, read only
    // while the flow runs.
    expect(field().value).toBe(ORIGIN);
    expect(field().readOnly).toBe(true);
  });

  test.each(["en", "zh"] as const)("space-3: the field's caption reads in the interface's language (%s)", async (language) => {
    activateLanguage(language);
    await renderGroups(signedOut(), { open: false });
    const caption = language === "zh" ? "实例" : "Instance";
    const input = screen.getByRole("textbox", { name: caption }) as HTMLInputElement;
    expect(input).toBe(screen.getByTestId("space-signin-instance"));
    expect(input.value).toBe(ORIGIN);
  });
});

describe("GROUPS: the groups list and its rows (space-1, space-61, space-64)", () => {
  test("space-1, space-66: your own group first, then the instance's heading over every group it lists in the order of their paths, each by its name and its full path, then your namespace by your login, each repository a row", async () => {
    const mine = base({}, [repo({ local: [SESSION_UNIT], lastSync: { at: NOW - 2 * 60 * MIN, sent: 1, received: 0 } })]);
    // A personal group the host names after the login, its path apart
    // from its name, and a group whose name is its path (space-1).
    const personal = { ...teamGroup([]), id: "3", fullPath: "jane1", name: "jane" };
    const plain = { ...teamGroup([]), id: "4", fullPath: "lab", name: "lab" };
    await renderGroups(withGroups(mine, plain, teamGroup(), personal), { open: false });
    const groups = within(screen.getByTestId("space-groups")).getAllByRole("group");
    expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual([
      "Your own group",
      "Spex Example",
      "acme/team",
      "jane1",
      "lab",
      "jane",
    ]);
    // Your own group stands first, apart from every instance; signed in,
    // its path stands beside its heading after the separator (space-1).
    expect(groups[0]).toBe(screen.getByTestId("space-own"));
    expect(within(groups[0]!).getByRole("heading", { level: 2 }).textContent).toBe("Your own group · jane");
    // Under the instance's heading, each group a heading of its own: a
    // path apart from the name stands beside it, a path that is the name
    // reads once, and your namespace reads your login.
    const instance = screen.getByTestId(`space-instance-${ORIGIN}`);
    expect(groups[1]).toBe(instance);
    expect(within(instance).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "team · acme/team",
      "jane · jane1",
      "lab",
      "jane",
    ]);
    expect(groups[5]).toBe(screen.getByTestId("space-group-@jane"));
    // The separator is the eye's: the heading's name reads its words.
    expect(screen.getByTestId("space-heading-beside-jane1").firstElementChild?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByTestId("space-heading-beside-jane1").className).toContain("text-neutral-500");
    expect(screen.queryByTestId("space-heading-beside-lab")).toBeNull();
    expect(screen.queryByTestId("space-heading-beside-@jane")).toBeNull();
    // In each group the rows stand in the core's order, its own first;
    // a row's placement lines are items of its own list (space-87).
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

    // A project's row: its name, where its code lives with no user in
    // it, its local changes, ahead and behind, and its last sync.
    const row = screen.getByTestId(`space-repo-${KEY}`);
    expect(within(groups[5]!).getByRole("button", { name: "academy-spex", expanded: false })).toBe(row);
    expect(within(groups[0]!).getByTestId(`space-row-${OWN}`)).toBeTruthy();
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
    expect(screen.getByTestId("space-repo-code-@spex.example/acme/team/team-spex").textContent).toBe("Group records");

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

  test("each state reads its phrase and offers its control; Members stands on a reachable row's placement line alone; Leave… on a project's row holding a placement at an instance (space-89)", async () => {
    const cases: [RowOver, string, string | null, boolean, boolean][] = [
      [{ state: "reachable", lastSync: null }, "Never synced", "Sync", true, true],
      [{ state: "reachable", lastSync: { at: NOW - 5 * MIN, sent: 1, received: 1 } }, "Synced 5m ago", "Sync", true, true],
      [{ state: "read-only", reason: "archived" }, "Read-only: archived", "Sync", false, true],
      [{ state: "unreachable", reason: "the host stopped listing it" }, "Unreachable: the host stopped listing it", "Retry", false, true],
      [{ state: "absent", folder: null, branch: null }, "Not on this device", "Join", false, false],
      [{ state: "local-only", remote: null, id: null, branch: null }, "On this device only", "Pick a group", false, false],
    ];
    for (const [over, phrase, controlName, members, leave] of cases) {
      await renderGroups(base({}, [repo(over)]), { open: false });
      const rowItem = screen.getByTestId(`space-row-${KEY}`);
      expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent, phrase).toBe(phrase);
      const controls = within(rowItem)
        .getAllByRole("button")
        .filter((button) => !button.dataset.testid?.startsWith("space-repo-"))
        .map((button) => button.getAttribute("aria-label") ?? button.textContent);
      // Leave… named by the instance it leaves, then the row's control,
      // then the Members its placement's line carries (space-89,
      // space-87).
      expect(controls, phrase).toEqual([
        ...(leave ? ["Remove from Spex Example"] : []),
        ...(controlName ? [controlName] : []),
        ...(members ? ["Members"] : []),
      ]);
      cleanup();
    }
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
      // Its placement's line reads the same last sync, its own ahead and
      // behind beside it in the title (space-87, space-8).
      const line = within(within(screen.getByTestId(`space-row-${KEY}`)).getByTestId(`space-line-${ORIGIN}`)).getByTestId("space-line-state");
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

  test("a project's records naming no code remote read so", async () => {
    await renderGroups(base({}, [repo({ code: null })]), { open: false });
    expect(screen.getByTestId(`space-repo-code-${KEY}`).textContent).toBe("Code not on a remote");
  });

  test("space-61: signed out, no row offers a sign-in: a repository the instance holds waits for its heading's; a path remote retries", async () => {
    await renderGroups(base({ instance: { signedIn: false } }, [repo({ state: "unreachable", reason: "Sign in again" })]), { open: false });
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("Unreachable: Sign in again");
    // Leave… stands, signed in or not, so the placement can be left
    // before its instance is forgotten (space-89, space-82); nothing
    // else does.
    expect(
      within(screen.getByTestId(`space-row-${KEY}`))
        .getAllByRole("button")
        .filter((button) => !button.dataset.testid?.startsWith("space-repo-"))
        .map((button) => button.dataset.testid),
    ).toEqual([`space-row-leave-${KEY}`]);
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

  test("space-64, space-87: a waiting creation's phrase stands on its line, the host's words in its title, the row reading On this device only", async () => {
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
      // The row holds no placement: it reads local only (space-61).
      expect(screen.getByTestId("space-repo-state-@spex.example/acme/team/team-spex").textContent).toBe("On this device only");
      // The step waits on the line of the instance it waits at, the
      // group named, the host's words in its title.
      const line = within(screen.getByTestId("space-lines-@spex.example/acme/team/team-spex")).getByTestId(`space-line-${ORIGIN}`);
      expect(line.dataset.attached).toBe("false");
      expect(within(line).getByTestId("space-line-instance").textContent).toBe("Spex Example");
      expect(within(line).getByTestId("space-line-at").textContent).toBe("acme/team/team-spex");
      const state = within(line).getByTestId("space-line-state");
      expect(state.textContent).toBe(phrase);
      expect(state.getAttribute("title")).toBe("403 Forbidden: you need at least the Maintainer role");
      // A group's own repository is made at its first session, never
      // picked for; the row names no host page to change.
      expect(within(screen.getByTestId("space-row-@spex.example/acme/team/team-spex")).queryByRole("button", { name: "Pick a group" })).toBeNull();
      expect(screen.getByTestId("space-row-@spex.example/acme/team/team-spex").querySelector("a")).toBeNull();
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

describe("GROUPS: Pick a group (space-58, space-29)", () => {
  test("space-66, space-58: one picker offers, under the instance's display name, the spex repositories listed for the same code, each with its group and members, then your namespace by your login and every group", async () => {
    // Beside your namespace and the team, a group named apart from its
    // path, as a team named in Chinese is, and one whose name is its path.
    const home = localProject();
    const huaxin = { ...teamGroup([]), id: "5", fullPath: "acme/huaxin-mfg", name: "华芯智造" };
    const lab = { ...teamGroup([]), id: "6", fullPath: "lab", name: "lab" };
    const [mine, team] = home.instances[0]!.groups;
    await renderGroups(withInstance(home, { groups: [mine!, huaxin, team!, lab] }), { open: false });
    const control = screen.getByTestId(`space-row-pick-${KEY}`);
    expect(control.textContent).toBe("Pick a group");
    fireEvent.click(control);
    expect(control.getAttribute("aria-expanded")).toBe("true");
    const picker = screen.getByRole("group", { name: "Pick a group for academy-spex" });
    // Everything stands under the instance's display name, its heading
    // naming its section (space-58).
    const section = within(picker).getByRole("group", { name: "Spex Example" });
    expect(section).toBe(within(picker).getByTestId(`space-pick-instance-${ORIGIN}`));
    expect(within(section).getByRole("heading", { level: 3 }).textContent).toBe("Spex Example");
    // Only the one whose project.json names the folder's remote.
    const listed = within(section).getAllByTestId(/^space-pick-repo-/);
    expect(listed.map((option) => option.dataset.testid)).toEqual(["space-pick-repo-@spex.example/acme/team/academy-spex"]);
    expect(listed[0]!.textContent).toContain("academy-spex");
    // Its group reads as the group's heading reads: its name, then its
    // path where the two differ (space-58).
    expect(screen.getByTestId("space-pick-listed-group-@spex.example/acme/team/academy-spex").textContent).toBe("team · acme/team");
    expect(listed[0]!.textContent).toContain("3 members");
    expect(document.activeElement).toBe(listed[0]);
    // Below them, your namespace and every group, with the folder's
    // name to create, each read as the list reads it: your namespace by
    // your login alone, a group by its name with its path after the
    // separator where the two differ, and by its name alone where they
    // are equal (space-58).
    const offered = within(section).getAllByTestId(/^space-pick-group-/);
    expect(offered.map((option) => option.textContent)).toEqual([
      "jane",
      "华芯智造 · acme/huaxin-mfg",
      "team · acme/team",
      "lab",
    ]);
    expect(offered[0]!.dataset.testid).toBe("space-pick-group-@jane");
    // The separator is the eye's: the button's name says the group's
    // name first, then its path (space-58).
    expect(within(picker).getByRole("button", { name: "华芯智造 acme/huaxin-mfg" })).toBe(offered[1]);
    expect(within(picker).getByRole("button", { name: "lab" })).toBe(offered[3]);
    expect((screen.getByTestId(`space-pick-name-${KEY}`) as HTMLInputElement).value).toBe("academy");
    expect(picker.textContent).toContain("-spex");
  });

  test("picking a listed spex repository sends its host id; picking a group sends the group and the name", async () => {
    await renderGroups(localProject(), { open: false });
    fireEvent.click(screen.getByTestId(`space-row-pick-${KEY}`));
    fireEvent.click(screen.getByTestId("space-pick-repo-@spex.example/acme/team/academy-spex"));
    await waitFor(() =>
      expect(calls("space.pick")).toEqual([{ repository: KEY, choice: { kind: "join", instance: ORIGIN, hostId: "51" } }]),
    );
    await waitFor(() => expect(screen.queryByTestId(`space-picker-${KEY}`)).toBeNull());
    fireEvent.click(screen.getByTestId(`space-row-pick-${KEY}`));
    fireEvent.change(screen.getByTestId(`space-pick-name-${KEY}`), { target: { value: "academy-notes" } });
    fireEvent.click(screen.getByTestId("space-pick-group-acme/team"));
    await waitFor(() =>
      expect(calls("space.pick")[1]).toEqual({ repository: KEY, choice: { kind: "create", instance: ORIGIN, groupId: "2", name: "academy-notes" } }),
    );
    // Your namespace is named by none, never by an id.
    await waitFor(() => expect(screen.queryByTestId(`space-picker-${KEY}`)).toBeNull());
    fireEvent.click(screen.getByTestId(`space-row-pick-${KEY}`));
    fireEvent.click(screen.getByTestId("space-pick-group-@jane"));
    await waitFor(() =>
      expect(calls("space.pick")[2]).toEqual({ repository: KEY, choice: { kind: "create", instance: ORIGIN, groupId: null, name: "academy" } }),
    );
  });

  test("space-57: a pick joining a repository others may share says the sharing notice in the picker first; Continue joins with noticed", async () => {
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

    // With another member: the notice stands in the picker beneath the
    // repository picked, Cancel focused, and sends nothing until
    // Continue; Escape and Cancel close it alone, focus back on the
    // repository (space-57, space-58).
    await renderGroups(joining({}), { open: false });
    fireEvent.click(screen.getByTestId(`space-row-pick-${KEY}`));
    fireEvent.click(option());
    const picker = screen.getByTestId(`space-picker-${KEY}`);
    expect(picker.contains(notice())).toBe(true);
    expect(option().closest("li")!.contains(notice())).toBe(true);
    expect(notice().textContent).toContain("Every session goes there whole");
    expect(notice().textContent).toContain("hidden parts and attachments included");
    expect(notice().textContent).toContain("nothing recalls what others downloaded");
    expect(notice().textContent).not.toContain("public");
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
    fireEvent.click(within(notice()).getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(calls("space.pick")).toEqual([{ repository: KEY, choice: { kind: "join", instance: ORIGIN, hostId: "51" }, noticed: true }]),
    );
    await waitFor(() => expect(screen.queryByTestId(`space-picker-${KEY}`)).toBeNull());
    cleanup();

    // With a count the host's last read lacks: the same notice, and a
    // public repository says its records are public.
    commandMock.mockClear();
    await renderGroups(joining({ members: null, visibility: "public" }), { open: false });
    fireEvent.click(screen.getByTestId(`space-row-pick-${KEY}`));
    expect(option().textContent).not.toContain("member");
    fireEvent.click(option());
    expect(notice().textContent).toContain("Every session goes there whole");
    expect(notice().textContent).toContain("its records are public");
    fireEvent.click(within(notice()).getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(calls("space.pick")).toEqual([{ repository: KEY, choice: { kind: "join", instance: ORIGIN, hostId: "51" }, noticed: true }]),
    );
    cleanup();

    // A refused join closes the notice, the refusal standing in the
    // picker and focus back on the repository.
    commandMock.mockClear();
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type === "space.pick") throw new Error("No longer shared with you");
      return answer(type, fields);
    });
    await renderGroups(joining({}), { open: false });
    fireEvent.click(screen.getByTestId(`space-row-pick-${KEY}`));
    fireEvent.click(option());
    fireEvent.click(within(notice()).getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(within(screen.getByTestId(`space-picker-${KEY}`)).getByRole("alert").textContent).toBe("No longer shared with you"),
    );
    expect(screen.queryByTestId(`space-pick-notice-${KEY}`)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(option()));
    cleanup();
    commandMock.mockImplementation(answer);

    // The account its only member, or the notice seen already for that
    // placement: the pick joins at once, without noticed.
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

  test("a taken or malformed name is refused in place and the field asks for another; an empty one is never sent", async () => {
    await renderGroups(localProject(), { open: false });
    fireEvent.click(screen.getByTestId(`space-row-pick-${KEY}`));
    const name = screen.getByTestId(`space-pick-name-${KEY}`);
    fireEvent.change(name, { target: { value: "  " } });
    fireEvent.click(screen.getByTestId("space-pick-group-@jane"));
    expect(within(screen.getByTestId(`space-picker-${KEY}`)).getByRole("alert").textContent).toBe("Name the new spex repository.");
    expect(document.activeElement).toBe(name);
    expect(calls("space.pick")).toHaveLength(0);
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type === "space.pick") throw new Error("academy-spex is taken in jane; name another");
      return answer(type, fields);
    });
    fireEvent.change(name, { target: { value: "academy" } });
    fireEvent.click(screen.getByTestId("space-pick-group-@jane"));
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
    fireEvent.keyDown(screen.getByTestId("space-pick-group-@jane"), { key: "Escape" });
    expect(screen.queryByTestId(`space-picker-${KEY}`)).toBeNull();
    expect(calls("space.pick")).toHaveLength(0);
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("On this device only");
  });
});

describe("GROUPS: Join (space-63, space-29)", () => {
  const ABSENT = "@spex.example/acme/team/docs-spex";

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
    await waitFor(() => expect(calls("space.join")).toEqual([{ instance: ORIGIN, hostId: "52", folder: "/Users/jane/code/docs" }]));
    // Accepted, the control stays busy until the machine moves.
    await waitFor(() => expect(screen.getByTestId(`space-row-join-${ABSENT}`).textContent).toBe("Joining…"));
  });

  test("a group's own spex repository asks for the folder its sessions run in", async () => {
    await renderGroups(
      withGroups(base(), teamGroup([repo({ key: "@spex.example/acme/team/team-spex", name: "team-spex", id: "50", code: null, folder: null, state: "absent", branch: null })])),
      { open: false },
    );
    fireEvent.click(screen.getByTestId("space-row-join-@spex.example/acme/team/team-spex"));
    expect(screen.getByTestId("space-join-@spex.example/acme/team/team-spex").textContent).toContain("Folder its sessions run in on this device");
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
    await waitFor(() => expect(calls("space.join")).toEqual([{ instance: ORIGIN, hostId: "52", folder: "/Users/jane/code/docs" }]));
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

  test("another login's entry carries no control on its heading, its row's placement line its own Members; a group named like your login stands apart, unreachable with no Join and no Sync", async () => {
    await renderGroups(instanceHome(), { open: false });
    const own = screen.getByRole("group", { name: "Your own group" });
    expect(within(own).getByRole("heading", { level: 2 }).textContent).toBe("Your own group · jane");
    // Under the instance's heading, every group in the order of their
    // paths, then your namespace, then another account's login (space-1).
    const instance = screen.getByTestId(`space-instance-${ORIGIN}`);
    expect(within(instance).getAllByTestId(/^space-group-[^-]+$/).map((entry) => entry.dataset.testid)).toEqual([
      "space-group-acme",
      "space-group-jane",
      "space-group-@jane",
      "space-group-@bob",
    ]);
    // bob: headed by the login, nothing on its heading (space-1).
    const bob = screen.getByTestId("space-group-@bob");
    expect(bob).toBe(screen.getByRole("group", { name: "bob" }));
    expect(within(bob).getByRole("heading", { level: 3 }).textContent).toBe("bob");
    expect(screen.queryByTestId("space-group-members-bob")).toBeNull();
    expect(screen.queryByTestId("space-group-subgroup-bob")).toBeNull();
    // Its placement's line carries its own Members, Share where the host
    // says so (space-62, space-87).
    fireEvent.click(within(lineAt("@spex.example/bob/notes-spex")).getByTestId("space-line-members"));
    const members = await screen.findByTestId(`space-members-@spex.example/bob/notes-spex@${ORIGIN}`);
    await within(members).findByTestId("space-member-jane");
    expect(within(members).getByTestId(`space-share-@spex.example/bob/notes-spex@${ORIGIN}`).textContent).toBe("Share");
    // The group named like your login: its own entry, its row
    // unreachable with the cause, Retry its one control (space-61).
    const apart = screen.getByTestId("space-group-jane");
    expect(within(apart).getByRole("heading", { level: 3 }).textContent).toBe("Jane's team · jane");
    // Your namespace stands apart from it, headed by your login.
    expect(within(screen.getByTestId("space-group-@jane")).getByRole("heading", { level: 3 }).textContent).toBe("jane");
    const row = within(apart).getByTestId("space-row-@spex.example/jane/jane-spex@81");
    expect(within(row).getByTestId("space-repo-state-@spex.example/jane/jane-spex@81").textContent).toBe("Unreachable: a group named like your login");
    expect(within(row).queryByTestId("space-row-join-@spex.example/jane/jane-spex@81")).toBeNull();
    expect(within(row).queryByTestId("space-row-sync-@spex.example/jane/jane-spex@81")).toBeNull();
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
    expect(within(screen.getByTestId("space-sync-tab")).getByText("Not on this device")).toBeTruthy();
    // The pick offers your namespace by your login and the host's
    // groups, each read as the list reads it, the group named like your
    // login apart from your namespace, never another account's login
    // (space-58).
    fireEvent.click(screen.getByTestId(`space-row-pick-${KEY}`));
    const picker = await screen.findByTestId(`space-picker-${KEY}`);
    const options = within(picker).getAllByTestId(/^space-pick-group-/);
    expect(options.map((button) => button.textContent)).toEqual(["jane", "Acme · acme", "Jane's team · jane"]);
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
    const list = await screen.findByRole("region", { name: "Members of academy-spex" });
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(2));
    expect(screen.getByTestId("space-member-jane").textContent).toContain("Jane");
    expect(screen.getByTestId("space-member-jane").textContent).toContain("Owner");
    expect(screen.getByTestId("space-member-bob").textContent).toContain("bob");
    expect(screen.getByTestId("space-member-bob").textContent).toContain("Developer");
    // No link to a page of the host (space-62, DR-120).
    expect(list.querySelector("a")).toBeNull();
    // Refresh reads them again; nothing is cached across reads.
    fireEvent.click(screen.getByTestId("space-refresh"));
    await waitFor(() => expect(calls("space.members")).toHaveLength(2));
    fireEvent.keyDown(screen.getByTestId("space-member-jane"), { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Members of academy-spex" })).toBeNull();
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
      // What a row opens counts too.
      const pick = screen.queryByTestId(`space-row-pick-${KEY}`);
      if (pick) fireEvent.click(pick);
      const line = within(screen.getByTestId(`space-row-${KEY}`)).queryByTestId(`space-line-${ORIGIN}`);
      const members = line ? within(line).queryByTestId("space-line-members") : null;
      if (members) {
        fireEvent.click(members);
        await screen.findByTestId("space-member-jane");
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
    expect(screen.getByRole("region", { name: "Groups" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Groups");
    const { SURFACE_LABELS } = await import("./NavRail.js");
    expect(SURFACE_LABELS.Space()).toBe("Groups");
  });
});
