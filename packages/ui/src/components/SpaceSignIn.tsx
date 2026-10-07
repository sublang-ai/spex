// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Signing in to the Git host from the Groups surface (space-3,
// space-6, DR-103): signed out, the header is one card with Sign in and
// the flow in flight; signed in, the account with Sign out. On the
// desktop the browser flow opens the host's page through the native
// bridge (app-shell-37), the card offering it again; where no bridge
// opened it, and on the served page's device flow, the card links the
// page to finish at — the device flow's link carries the code, which
// is never shown. The outcome is state: the surface reads `signIn` and
// `account` as the core sends them and keeps only the start's reply,
// which state does not carry.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { CommandResults, GroupsState } from "@sublang/spex-core/protocol";

import { useAppStore } from "../state/store.js";
import { i18n } from "../i18n.js";
import { openExternalBridge } from "../lib/space.js";
import { PRIMARY, SECONDARY, type Note } from "./SpaceSurface.js";

type StartReply = CommandResults["space.signin.start"];

/** The sign-in as the surface draws it: what the core's state says,
 * filled in with the start's reply. */
export interface SignInFlow {
  /** The flow in flight, or null. */
  running:
    | { flow: "browser"; url?: string; opened: boolean }
    | { flow: "device"; verificationUri?: string }
    | null;
  /** The start command is in flight. */
  starting: boolean;
  /** Why the flow ended without an account, or the start was refused. */
  failure?: string;
  start(): void;
  cancel(): void;
}

/** The one sign-in of the surface (space-3): the card's. */
export function useSignIn(groups: GroupsState | undefined, onNote: Note): SignInFlow {
  const spaceSignIn = useAppStore((state) => state.spaceSignIn);
  const spaceSignInCancel = useAppStore((state) => state.spaceSignInCancel);
  const [started, setStarted] = useState<StartReply & { opened?: boolean }>();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();

  const signIn = groups?.signIn;
  const phase = signIn?.phase;
  const signedIn = groups?.account != null;

  // The flow ends as the state says (space-3): running gives way to
  // idle, with the account, or to failed, with its cause.
  const lastPhase = useRef(phase);
  useEffect(() => {
    if (lastPhase.current === "running" && phase !== "running") setStarted(undefined);
    lastPhase.current = phase;
  }, [phase]);
  useEffect(() => {
    if (signedIn) setStarted(undefined);
  }, [signedIn]);

  const start = useCallback(() => {
    setStarting(true);
    setError(undefined);
    void (async () => {
      try {
        const reply = await spaceSignIn();
        if (reply?.flow !== "browser" && reply?.flow !== "device") {
          throw new Error(i18n._("The sign-in did not start"));
        }
        if (reply.flow === "browser") {
          // The desktop opens the host's page in the system browser;
          // a page with no bridge, or one the shell refused, shows the
          // URL as a link instead (app-shell-37).
          const open = openExternalBridge();
          let opened = false;
          if (open) {
            try {
              opened = await open(reply.url);
            } catch {
              opened = false;
            }
          }
          setStarted({ ...reply, opened });
        } else {
          setStarted(reply);
        }
      } catch (cause) {
        const message = (cause as Error).message;
        setError(message);
        onNote(message);
      } finally {
        setStarting(false);
      }
    })();
  }, [spaceSignIn, onNote]);

  const cancel = useCallback(() => {
    void (async () => {
      try {
        await spaceSignInCancel();
      } catch (cause) {
        onNote((cause as Error).message);
      } finally {
        setStarted(undefined);
      }
    })();
  }, [spaceSignInCancel, onNote]);

  let running: SignInFlow["running"] = null;
  if (started?.flow === "browser") {
    running = { flow: "browser", url: started.url, opened: started.opened ?? false };
  } else if (started?.flow === "device") {
    running = { flow: "device", verificationUri: started.verificationUri };
  } else if (signIn?.phase === "running") {
    running =
      signIn.flow === "device"
        ? { flow: "device", verificationUri: signIn.verificationUri }
        : { flow: "browser", opened: true };
  }
  const failure = running
    ? undefined
    : error ?? (signIn?.phase === "failed" ? signIn.message : undefined);
  return { running, starting, failure, start, cancel };
}

/** The host as the sign-in card names it (space-3): its URL's host
 * name, and the Git host behind it by its display name, else that host
 * name. */
export function hostNames(groups: GroupsState): { site: string; git: string } {
  let site: string;
  try {
    site = new URL(groups.host.url).hostname || groups.host.url;
  } catch {
    site = groups.host.url;
  }
  return { site, git: groups.host.displayName ?? site };
}

/** The header's account while signed in (space-1, space-6): who, at
 * which host, with Sign out. */
export function AccountField({
  groups,
  connected,
  onNote,
}: {
  groups: GroupsState;
  connected: boolean;
  onNote: Note;
}) {
  const spaceSignOut = useAppStore((state) => state.spaceSignOut);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string>();
  const host = groups.host.displayName ?? groups.host.url;
  const login = groups.account?.login ?? "";

  const signOut = async () => {
    setSigningOut(true);
    setSignOutError(undefined);
    try {
      await spaceSignOut();
      onNote(i18n._("Not signed in"));
    } catch (cause) {
      const message = (cause as Error).message;
      setSignOutError(message);
      onNote(message);
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div
      data-testid="space-account"
      className="flex min-w-0 flex-col gap-1 @xs:flex-row @xs:flex-wrap @xs:items-center @xs:gap-x-3"
    >
      <span className="flex min-w-0 flex-1 items-center gap-1 text-sm" title={groups.host.url}>
        {/* The host's name yields below @md (space-28); the login
            stays, and the whole phrase rides the title. */}
        <span data-testid="space-account-wide" className="hidden min-w-0 truncate @md:inline">
          {i18n._("Signed in as @{login} at {host}", { login, host })}
        </span>
        <span data-testid="space-account-narrow" className="min-w-0 truncate @md:hidden">
          {i18n._("Signed in as @{login}", { login })}
        </span>
      </span>
      {signOutError ? (
        <span role="alert" className="min-w-0 text-xs text-red-600 dark:text-red-400">
          {signOutError}
        </span>
      ) : null}
      <button
        type="button"
        data-testid="space-signout"
        className={`${SECONDARY} self-start @xs:self-auto`}
        disabled={!connected || signingOut}
        title={i18n._("Signs this device out of {host}; every record stays here", { host })}
        onClick={() => void signOut()}
      >
        {signingOut
          ? i18n._({ id: "Signing out…", comment: "the Sign out control, while signing out" })
          : i18n._({ id: "Sign out", comment: "sign this device out of the Git host" })}
      </button>
    </div>
  );
}

const LINK_CLASS = "text-brand-600 hover:underline dark:text-brand-300";

/** The header while signed out (space-3): one card saying what signing
 * in brings, or the flow in flight, or why it ended, with Sign in. */
export function SignInCard({
  groups,
  signIn,
  connected,
}: {
  groups: GroupsState;
  signIn: SignInFlow;
  connected: boolean;
}) {
  const { site, git } = hostNames(groups);
  const running = signIn.running;
  const finish = i18n._("Sign in with your {host} account there and approve; you return here signed in.", { host: git });

  // The page to finish at, as a link: the device flow's URL carries the
  // code, so nothing is typed (git-host-3).
  const finishAt = (url: string | undefined) => (
    <>
      <p data-testid="space-signin-finish">{i18n._("Finish signing in in your browser:")}</p>
      {url ? (
        <a data-testid="space-signin-link" href={url} target="_blank" rel="noreferrer" className={LINK_CLASS}>
          {i18n._("Open {host} to sign in", { host: git })}
        </a>
      ) : null}
      <p>{finish}</p>
    </>
  );

  let body: ReactNode;
  if (running?.flow === "browser" && (running.opened || !running.url)) {
    const url = running.url;
    body = (
      <p data-testid="space-signin-opened">
        {i18n._("Your browser is open at {site}: sign in with your {host} account there and approve; you return here signed in.", {
          site,
          host: git,
        })}{" "}
        {url ? (
          <a
            data-testid="space-signin-link"
            href={url}
            target="_blank"
            rel="noreferrer"
            className={LINK_CLASS}
            onClick={(event) => {
              // The system browser again, as the start opened it
              // (app-shell-37); the link's own target where no bridge.
              const open = openExternalBridge();
              if (!open) return;
              event.preventDefault();
              void open(url);
            }}
          >
            {i18n._("Open it again")}
          </a>
        ) : null}
      </p>
    );
  } else if (running) {
    body = finishAt(running.flow === "browser" ? running.url : running.verificationUri);
  } else if (signIn.failure !== undefined) {
    body = (
      <p data-testid="space-signin-error" role="alert" className="text-red-600 dark:text-red-400">
        {i18n._("Sign-in did not complete: {cause}.", { cause: signIn.failure.replace(/[.。]\s*$/, "") })}
      </p>
    );
  } else {
    body = (
      <>
        <p data-testid="space-signin-caption">
          {i18n._("Sign in to see your groups and share each project's records with the people in them.")}
        </p>
        <p>{i18n._("Until you do, everything stays on this device and nothing is contacted.")}</p>
      </>
    );
  }

  const label =
    running || signIn.starting
      ? i18n._({ id: "Signing in…", comment: "the Sign in control, while the sign-in runs" })
      : signIn.failure !== undefined
        ? i18n._({ id: "Sign in again", comment: "the Sign in control after a sign-in failed" })
        : i18n._({ id: "Sign in", comment: "sign in to the Git host" });

  return (
    <div data-testid="space-account" className="flex min-w-0 flex-col gap-2">
      <h2 className="text-sm font-medium">{i18n._("Not signed in")}</h2>
      <div data-testid="space-signin-body" className="flex min-w-0 flex-col gap-1 break-words text-sm text-neutral-600 dark:text-neutral-300">
        {body}
      </div>
      <div className="flex min-w-0 flex-col gap-1 @xs:flex-row @xs:items-center @xs:gap-x-3">
        {running ? (
          <button
            type="button"
            data-testid="space-signin-cancel"
            className={`${SECONDARY} self-start @xs:self-auto`}
            onClick={signIn.cancel}
          >
            {i18n._({ id: "Cancel", comment: "leave the editor without changing anything" })}
          </button>
        ) : null}
        <button
          type="button"
          data-testid="space-signin"
          className={`${PRIMARY} w-full @xs:w-auto`}
          disabled={!connected || running !== null || signIn.starting}
          title={i18n._("Signs in to {host}", { host: git })}
          onClick={signIn.start}
        >
          {label}
        </button>
      </div>
    </div>
  );
}
