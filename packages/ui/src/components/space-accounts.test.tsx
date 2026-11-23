// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Space account controls, personal project rows and sync destinations
// exercised through the renderer and its protocol client.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { SpaceState, RepositoryState } from "@sublang/spex-core/protocol";

import { activateLanguage } from "../i18n.js";
import { setClientForTests } from "../state/store.js";
import {
  HOME,
  KEY,
  MIN,
  NOW,
  OWN,
  ORIGIN,
  SECOND,
  answer,
  base,
  calls,
  commandMock,
  deliver,
  installClient,
  live,
  noInstance,
  placement,
  renderSpace,
  repo,
  signedOutAt,
  twoInstances,
  type HomeOver,
} from "../fixtures/space.js";

beforeEach(installClient);

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

/** A home with only the local projects section. */
function signedOut(over: HomeOver = {}, row: Partial<RepositoryState> = {}): SpaceState {
  return noInstance(over, [repo({ state: "local-only", remote: null, id: null, code: CODE, branch: null, ...row })]);
}

describe("SPACE: the header (space-1, space-2)", () => {
  test("space-66, space-1: signed in, the instance's heading reads its host name until a read names its display name, then its display name, beside @login with Sign out; the header holds Refresh without a storage-root footer", async () => {
    await renderSpace(base({ instance: { displayName: null } }), { open: false });
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
    // The storage root is absent from the signed-in overview (space-1).
    expect(screen.queryByTestId("space-home")).toBeNull();
    expect(screen.queryByTitle(HOME)).toBeNull();
    expect(screen.queryByText(/^Spex keeps this computer's files in /)).toBeNull();
    expect(within(header).queryByRole("button", { name: "Copy path" })).toBeNull();
    // Signed out there, Refresh goes and the heading stays.
    deliver(signedOutAt(ORIGIN));
    expect(screen.queryByTestId("space-home")).toBeNull();
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
    expect(within(section).getByRole("heading", { level: 2 }).textContent).toBe("Spex Example");
  });

  test("Refresh asks the core to read the host and re-reads the state; signed out there is none", async () => {
    await renderSpace(base(), { open: false });
    expect(calls("space.get")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(calls("space.get")).toHaveLength(2));
    expect(calls("space.refresh")).toHaveLength(1);
    // The Space's read lands as a broadcast, and Refresh's title with
    // it.
    deliver(base({ instance: { readAt: NOW } }));
    expect(screen.getByRole("button", { name: "Refresh" }).title).toBe("Last refreshed just now");
    cleanup();
    await renderSpace(signedOut(), { open: false });
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
  });

  test("accepted Refresh stays visibly running until its actual outcome, and asynchronous failure offers retry", async () => {
    await renderSpace(base(), { open: false });
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
    await renderSpace(base({ instance: { readAt: null, read: { phase: "failed", message: "Could not reach Spex Example" } } }, [row]), { open: false });
    expect(screen.getByRole("alert").textContent).toBe("Could not reach Spex Example");
    // The local-only row stands, reading nothing (space-120).
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("");
    deliver(base({ instance: { signedIn: false, read: { phase: "idle" }, readAt: null } }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("a refused Refresh says why beside it", async () => {
    await renderSpace(base(), { open: false });
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type === "space.refresh") throw new Error("Could not reach Spex Example");
      return answer(type, fields);
    });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Could not reach Spex Example");
    expect(live()).toBe("Could not reach Spex Example");
  });

  test("space-66, space-1: listing no instance, the header is the card titled by its act with Sign in and no sentence, and the list holds This computer alone", async () => {
    await renderSpace(signedOut(), { open: false });
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
    // project reads none and carries no code glyph, nobody sharing it
    // yet, its "Sync to a Space…" disabled and titled "Sign in to a Space
    // first" (space-1, space-61, space-66).
    const groups = within(screen.getByTestId("space-projects")).getAllByRole("group");
    expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual(["This computer"]);
    expect(within(groups[0]!).getByRole("heading", { level: 2 }).textContent).toBe("This computer");
    expect(screen.getByTestId("space-projects").textContent).not.toContain("jane");
    expect(screen.getByTestId(`space-repo-${OWN}`).textContent).toBe("Your sessions");
    expect(screen.getByTestId(`space-repo-state-${OWN}`).textContent).toBe("");
    expect(rowControls(OWN).map((button) => button.dataset.testid)).toEqual([`space-row-more-${OWN}`]);
    expect(screen.getByTestId(`space-repo-state-${KEY}`).textContent).toBe("");
    expect(screen.queryByTestId(`space-repo-code-${KEY}`)).toBeNull();
    expect(screen.getByTestId(`space-repo-${KEY}`).getAttribute("aria-describedby") ?? "").not.toContain(`space-repo-code-${KEY}`);
    expect(rowControls(KEY).map((button) => button.dataset.testid)).toEqual([`space-row-more-${KEY}`]);
    expect(moreEntries(KEY)).toEqual(["Sync to a Space…", "Explore records"]);
    // Public discovery is independent of Space sign-in; it grants no access.
    expect(commandMock.mock.calls.map(([type]) => type)).toEqual(["space.get", "registry.directory"]);
  });

  test("with no git the guidance replaces every other field", async () => {
    await renderSpace(base({ git: { ok: false, guidance: "Install Git from git-scm.com, then reopen Groups." } }));
    expect(screen.getByTestId("space-no-git").textContent).toContain("Git is not installed");
    expect(screen.getByTestId("space-no-git").textContent).toContain("git-scm.com");
    expect(screen.queryByTestId("space-signin-card")).toBeNull();
    expect(screen.queryByTestId(`space-instance-${ORIGIN}`)).toBeNull();
    expect(screen.queryByTestId("space-refresh")).toBeNull();
    expect(screen.queryByTestId("space-projects")).toBeNull();
    expect(screen.queryByTestId("space-repository")).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy path" })).toBeNull();
  });
});

describe("SPACE: signing in (space-3, space-6, space-29)", () => {
  test("the browser flow opens the host's page through the bridge, reads 'Signing in…' with Cancel, and ends as the state says", async () => {
    const openExternal = vi.fn<(url: string) => Promise<boolean>>().mockResolvedValue(true);
    (window as { spexNative?: unknown }).spexNative = { pickDirectory: vi.fn(), openExternal };
    await renderSpace(signedOut(), { open: false });
    fireEvent.click(screen.getByTestId("space-signin"));
    await waitFor(() => expect(openExternal).toHaveBeenCalledWith("https://spex.example/login/app?client_id=spex&state=s"));
    expect(calls("space.signin.start")).toEqual([{ url: ORIGIN }]);
    const control = screen.getByTestId("space-signin") as HTMLButtonElement;
    await waitFor(() => expect(control.textContent).toBe("Signing in…"));
    expect(control.disabled).toBe(true);
    // "Continue in your browser" with an ordinary link to the same page,
    // named by the Space (space-3, app-shell-21).
    expect(screen.getByTestId("space-signin-finish").textContent).toBe("Continue in your browser·Open spex.example");
    const again = screen.getByTestId("space-signin-link") as HTMLAnchorElement;
    expect(again.textContent).toBe("Open spex.example");
    expect(again.href).toBe("https://spex.example/login/app?client_id=spex&state=s");
    expect(fireEvent.click(again)).toBe(true);
    expect(openExternal).toHaveBeenCalledTimes(1);
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

  test.each(["absent", "opens", "refuses", "rejects"] as const)(
    "space-66: the browser sign-in link keeps its native action when the bridge %s",
    async (bridge) => {
      const openExternal = vi.fn<(url: string) => Promise<boolean>>().mockImplementation(async () => {
        if (bridge === "rejects") throw new Error("Could not open the browser");
        return bridge === "opens";
      });
      if (bridge !== "absent") (window as { spexNative?: unknown }).spexNative = { openExternal };
      await renderSpace(signedOut(), { open: false });
      fireEvent.click(screen.getByTestId("space-signin"));
      const link = (await screen.findByTestId("space-signin-link")) as HTMLAnchorElement;
      const url = "https://spex.example/login/app?client_id=spex&state=s";
      expect(link.href).toBe(url);
      expect(link.target).toBe("_blank");
      expect(link.rel).toBe("noreferrer");
      expect(link.textContent).toBe("Open spex.example");
      expect(screen.getByTestId("space-signin-finish").textContent).toBe("Continue in your browser·Open spex.example");
      if (bridge !== "absent") expect(openExternal).toHaveBeenCalledExactlyOnceWith(url);
      // A manual attempt must not be swallowed by another bridge call.
      expect(fireEvent.click(link)).toBe(true);
      expect(openExternal).toHaveBeenCalledTimes(bridge === "absent" ? 0 : 1);
      expect(calls("space.signin.start")).toEqual([{ url: ORIGIN }]);
    },
  );

  test("Cancel stops the flow and Sign in stands again", async () => {
    await renderSpace(signedOut(), { open: false });
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
    await renderSpace(signedOut(), { open: false });
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
    await renderSpace(
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
    await renderSpace(signedOut({ signIn: { phase: "running", instance: ORIGIN, flow: "device", userCode: "ABCD-EFGH", verificationUri: "https://spex.example/oauth/device", since: NOW } }), { open: false });
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
    await renderSpace(signedOutAt(ORIGIN, { byHost: true }), { open: false });
    const section = screen.getByTestId(`space-instance-${ORIGIN}`);
    expect(within(section).getByRole("heading", { level: 2 }).textContent).toBe("Spex Example · signed out · @jane");
    // Beside it, Sign in again and its overflow (space-1, space-82).
    const controls = (heading: HTMLElement) =>
      within(within(heading).getByTestId("space-instance-heading"))
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label") ?? button.textContent);
    const both = ["Sign in again", "More for Spex Example"];
    expect(controls(section)).toEqual(both);
    expect(within(section).queryByRole("button", { name: "Sign out" })).toBeNull();
    // The home lists an instance, so no card stands in the header.
    expect(screen.queryByTestId("space-signin-card")).toBeNull();
    cleanup();
    // Signed out by the reader: its display name with the same controls.
    await renderSpace(signedOutAt(ORIGIN), { open: false });
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
    await renderSpace(out, { open: false });
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
    await renderSpace(base(), { open: false });
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
    await renderSpace(base(), { open: false });
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      if (type === "space.signout") throw new Error("Wait for the sync of academy-spex");
      return answer(type, fields);
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Wait for the sync of academy-spex");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });
});

describe("SPACE: the sign-in card's Space address, no directory read (space-66, space-115, space-3, git-host-2, git-host-3)", () => {
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
    await renderSpace(signedOut(), { open: false });
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
    await renderSpace(signedOut(), { open: false });
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
    await renderSpace(signedOut(), { open: false });
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
    await renderSpace(signedOut(), { open: false });
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
    await renderSpace(signedOut(), { open: false });
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
    await renderSpace(
      signedOut({ signIn: { phase: "running", instance: SECOND, flow: "device", userCode: "ABCD-EFGH", verificationUri: complete, since: NOW } }),
      { open: false },
    );
    const link = screen.getByTestId("space-signin-link") as HTMLAnchorElement;
    expect(link.textContent).toBe("Open second.example");
    expect(link.href).toBe(complete);
    expect(document.body.textContent).not.toContain("ABCD-EFGH");
  });
});

describe("SPACE: personal project rows (space-1, space-61, space-64)", () => {
  test.each(["name", "phrase", "explore"] as const)("the records panel closes itself and restores focus to its %s opener", async (source) => {
    await renderSpace(base(), { open: false });
    const opener = screen.getByTestId(source === "name" ? `space-repo-${KEY}`
      : source === "phrase" ? `space-repo-state-${KEY}` : `space-row-more-${KEY}`);
    const open = () => fireEvent.click(source === "explore"
      ? within(moreOf(KEY)).getByTestId(`space-row-explore-${KEY}`) : opener);
    open();
    const panel = await screen.findByTestId("space-repository");
    expect(screen.getByRole("tab", { name: source === "explore" ? "Explore" : "Sync", selected: true })).toBeTruthy();
    const close = within(screen.getByTestId("space-repository-header")).getByRole("button", { name: "Close" });
    fireEvent.click(close);
    expect(screen.queryByTestId("space-repository")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(opener));
    open();
    const reopened = await screen.findByTestId("space-repository");
    expect(reopened).not.toBe(panel);
    fireEvent.keyDown(screen.getByRole("tab", { selected: true }), { key: "Escape" });
    expect(screen.queryByTestId("space-repository")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(opener));
    expect(calls("space.sync")).toEqual([]);
  });

  test("closing records during a background sync does not stop it", async () => {
    await renderSpace(base({}, [repo({ sync: { phase: "running", op: "sync", step: "push", since: NOW, cancelable: true } })]));
    const close = screen.getByTestId("space-repository-close") as HTMLButtonElement;
    expect(close.disabled).toBe(false);
    fireEvent.click(close);
    expect(screen.queryByTestId("space-repository")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId(`space-repo-${KEY}`)));
    expect(calls("space.cancel")).toEqual([]);
  });

  test("closing records follows a moved project's row when the original opener is gone", async () => {
    await renderSpace(base());
    const oldOpener = screen.getByTestId(`space-repo-${KEY}`);
    const movedKey = "@spex.example/jane/renamed-spex";
    deliver(base({}, [repo({ key: movedKey, name: "renamed-spex" })]));
    await waitFor(() => expect(screen.getByTestId("space-repository-name").textContent).toContain("renamed"));
    expect(oldOpener.isConnected).toBe(false);
    fireEvent.click(screen.getByTestId("space-repository-close"));
    expect(screen.queryByTestId("space-repository")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId(`space-repo-${movedKey}`)));
  });

});

describe("Personal Space destinations", () => {
  test("space-139: a project with an explicit records remote can select a new copy at its first Space", async () => {
    const project = repo({ instance: null, remote: "/records/academy.git" });
    await renderSpace(base({}, [project]), { open: false });
    const menu = moreOf(project.key);
    expect(within(menu).getByRole("menuitem", { name: "Sync records" })).toBeTruthy();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Sync to a Space…" }));
    const picker = screen.getByTestId(`space-destination-${project.key}`);
    expect(calls("space.pick")).toEqual([]);
    fireEvent.click(within(picker).getByRole("button", { name: "Sync records" }));
    await waitFor(() => expect(calls("space.pick")).toEqual([{
      repository: project.key,
      choice: { kind: "create", name: "academy", instance: ORIGIN },
    }]));
    expect(calls("space.place")).toEqual([]);
  });

  test("space-137, space-139: changing Space resets the matching records choice and only submission joins", async () => {
    const project = repo({ key: "jane/academy-spex", instance: null, state: "local-only", id: null, remote: null, branch: null });
    const firstCopy = repo({
      key: "@spex.example/jane/academy-spex", instance: ORIGIN, id: "101", state: "absent", branch: null, folder: null,
    });
    const secondCopy = repo({
      key: "@second.example/jada/academy-spex", instance: SECOND, id: "202", state: "absent", branch: null, folder: null,
    });
    await renderSpace(twoInstances({}, [project, firstCopy, secondCopy]), { open: false });
    fireEvent.click(within(moreOf(project.key)).getByRole("menuitem", { name: "Sync to a Space…" }));
    const picker = within(screen.getByTestId(`space-destination-${project.key}`));
    const destination = picker.getByRole("combobox", { name: "Space" }) as HTMLSelectElement;
    const records = picker.getByRole("combobox", { name: "Project records" }) as HTMLSelectElement;
    const sync = picker.getByRole("button", { name: "Sync records" }) as HTMLButtonElement;
    expect(document.activeElement).toBe(destination);
    expect(destination.value).toBe(ORIGIN);
    expect(records.selectedOptions[0]?.textContent).toBe("Create a new copy");
    fireEvent.change(records, { target: { value: firstCopy.id } });
    expect(records.value).toBe(firstCopy.id);
    expect(calls("space.pick")).toEqual([]);

    fireEvent.change(destination, { target: { value: SECOND } });
    expect(records.selectedOptions[0]?.textContent).toBe("Create a new copy");
    expect(sync.disabled).toBe(false);
    fireEvent.change(records, { target: { value: secondCopy.id } });
    expect(records.value).toBe(secondCopy.id);
    expect(calls("space.pick")).toEqual([]);

    fireEvent.click(sync);
    await waitFor(() => expect(calls("space.pick")).toEqual([{
      repository: project.key,
      choice: { kind: "join", instance: SECOND, hostId: secondCopy.id },
    }]));
    await waitFor(() => expect(screen.queryByTestId(`space-destination-${project.key}`)).toBeNull());
  });

  test("space-139: a pending submission holds the picker and refusal preserves the choice for retry", async () => {
    const project = repo({ key: "jane/academy-spex", instance: null, state: "local-only", id: null, remote: null, branch: null });
    const copy = repo({ instance: SECOND, key: "@second.example/jada/academy-spex", id: "202", state: "absent", branch: null, folder: null });
    await renderSpace(twoInstances({}, [project, copy]), { open: false });
    let refuse!: (reason: Error) => void;
    const submission = new Promise<never>((_, reject) => { refuse = reject; });
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) =>
      type === "space.pick" && calls(type).length === 1 ? submission : answer(type, fields));
    fireEvent.click(within(moreOf(project.key)).getByRole("menuitem", { name: "Sync to a Space…" }));
    const panel = screen.getByTestId(`space-destination-${project.key}`);
    const picker = within(panel);
    const destination = picker.getByRole("combobox", { name: "Space" });
    fireEvent.change(destination, { target: { value: SECOND } });
    const records = picker.getByRole("combobox", { name: "Project records" });
    fireEvent.change(records, { target: { value: copy.id } });
    const close = picker.getByRole("button", { name: "Close" });
    fireEvent.click(picker.getByRole("button", { name: "Sync records" }));
    const busy = picker.getByRole("button", { name: "Syncing…" });
    for (const control of [destination, records, close, busy]) {
      expect(control).toHaveProperty("disabled", true);
    }
    fireEvent.keyDown(destination, { key: "Escape" });
    fireEvent.click(close);
    fireEvent.click(busy);
    expect(panel.isConnected).toBe(true);
    expect(calls("space.pick")).toHaveLength(1);

    await act(async () => refuse(new Error("Second Example refused the request")));
    expect(picker.getByRole("alert").textContent).toBe("Second Example refused the request");
    expect(destination).toHaveProperty("value", SECOND);
    expect(records).toHaveProperty("value", copy.id);
    fireEvent.click(picker.getByRole("button", { name: "Sync records" }));
    await waitFor(() => expect(panel.isConnected).toBe(false));
    expect(calls("space.pick")).toEqual(Array.from({ length: 2 }, () => ({
      repository: project.key,
      choice: { kind: "join", instance: SECOND, hostId: copy.id },
    })));
  });

  test("a project synced to one Space keeps its sync action with another Space signed in", async () => {
    const project = repo();
    await renderSpace(twoInstances({}, [project]), { open: false });
    expect(moreEntries(project.key)).toEqual(["Sync records", "Explore records"]);
  });
});


describe("space-143: personal project row states", () => {
  test("Open here invokes the native picker and joins the selected row at its own Space", async () => {
    const first = repo({ state: "absent", branch: null, folder: null });
    const second = repo({ instance: SECOND, key: "@second.example/jada/academy-spex", id: "202", state: "absent", branch: null, folder: null });
    const pickDirectory = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce("/tmp/academy");
    (window as { spexNative?: unknown }).spexNative = { pickDirectory };
    await renderSpace(twoInstances({}, [first, second]), { open: false });
    expect(pickDirectory).not.toHaveBeenCalled();

    const row = within(screen.getByTestId(`space-instance-${SECOND}`)).getByTestId(`space-row-${second.key}`);
    const open = within(row).getByRole("button", { name: "Open here" });
    await act(async () => { fireEvent.click(open); });
    expect(pickDirectory).toHaveBeenCalledTimes(1);
    expect(calls("space.join")).toEqual([]);
    fireEvent.click(open);
    expect(pickDirectory).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(calls("space.join")).toEqual([
      { instance: SECOND, hostId: second.id, folder: "/tmp/academy" },
    ]));
  });

  test("Choose folder pairs the selected working folder with the local records", async () => {
    const project = repo({ folder: null });
    commandMock.mockImplementation(async (type: string, fields?: Record<string, unknown>) => {
      const bound = { id: project.key, name: "academy", path: "/tmp/academy", registeredAt: 0, repository: { key: project.key, name: project.name } };
      if (type === "project.rebind") return bound;
      if (type === "project.list") return [bound];
      return answer(type, fields);
    });
    await renderSpace(base({}, [project]), { open: false });
    fireEvent.click(screen.getByRole("button", { name: "Choose folder…" }));
    const editor = within(screen.getByTestId(`space-folder-${project.key}`));
    const useFolder = editor.getByRole("button", { name: "Use this folder" });
    fireEvent.change(editor.getByRole("textbox", { name: "Project folder on this computer" }), { target: { value: "/tmp/academy" } });
    fireEvent.click(useFolder);
    await screen.findByRole("button", { name: "Open project" });
    expect(calls("project.rebind")).toEqual([{ projectId: project.key, path: "/tmp/academy" }]);
    expect(calls("space.join")).toEqual([]);
  });

  test("an unreachable row shows the cause and Retry requests another Space read", async () => {
    const project = repo({ state: "unreachable", reason: "The network is offline" });
    await renderSpace(base({}, [project]), { open: false });
    const row = within(screen.getByTestId(`space-row-${project.key}`));
    expect(row.getByTestId(`space-repo-state-${project.key}`).textContent).toBe("Unreachable: The network is offline");
    fireEvent.click(row.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(calls("space.refresh")).toEqual([{}]));
  });

  test("a waiting placement shows its step and the Space's refusal", async () => {
    const project = repo({ placements: [
      placement(),
      placement({ instance: SECOND, attached: false, waiting: { step: "branch", message: "Second Example refused branch preparation" } }),
    ] });
    await renderSpace(twoInstances({}, [project]));
    const line = within(screen.getByTestId(`space-line-${SECOND}`));
    expect(line.getByTestId("space-line-instance").textContent).toBe("Second Example");
    const phrase = line.getByText("Waiting for the Space to prepare the records branch");
    expect(phrase.title).toBe("Second Example refused branch preparation");
  });
});
