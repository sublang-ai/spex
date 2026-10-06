// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Signing in to the Git host from the Groups surface (space-3,
// space-6, DR-103): the account field of the header with its one
// control — Sign in while signed out, Sign out while signed in — and
// the flow in flight. On the desktop the browser flow opens the host's
// page through the native bridge (app-shell-37), or shows it as a link
// where no bridge opens it; on the served page the device flow shows
// its user code to copy and the page to enter it at. The outcome is
// state: the surface reads `signIn` and `account` as the core sends
// them and keeps only the start's reply, which state does not carry.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { CommandResults, GroupsState } from "@sublang/spex-core/protocol";

import { useAppStore } from "../state/store.js";
import { i18n } from "../i18n.js";
import { openExternalBridge } from "../lib/space.js";
import { Icon } from "./Icon.js";
import { PRIMARY, SECONDARY, type Note } from "./SpaceSurface.js";

type StartReply = CommandResults["space.signin.start"];

/** The sign-in as the surface draws it: what the core's state says,
 * filled in with the start's reply. */
export interface SignInFlow {
  /** The flow in flight, or null. */
  running:
    | { flow: "browser"; url?: string; opened: boolean }
    | { flow: "device"; userCode?: string; verificationUri?: string }
    | null;
  /** The start command is in flight. */
  starting: boolean;
  /** Why the flow ended without an account, or the start was refused. */
  failure?: string;
  start(): void;
  cancel(): void;
}

/** The one sign-in of the surface (space-3), shared by the header's
 * control, a local-only row's Sign in and an unreachable row's. */
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
    running = { flow: "device", userCode: started.userCode, verificationUri: started.verificationUri };
  } else if (signIn?.phase === "running") {
    running =
      signIn.flow === "device"
        ? { flow: "device", userCode: signIn.userCode, verificationUri: signIn.verificationUri }
        : { flow: "browser", opened: true };
  }
  const failure = running
    ? undefined
    : error ?? (signIn?.phase === "failed" ? signIn.message : undefined);
  return { running, starting, failure, start, cancel };
}

/** A phrase with a link standing for its `{link}` placeholder: the
 * phrase is one catalog message, so each language places the link
 * where its own order puts it. */
function withLink(phrase: (link: string) => string, link: ReactNode): ReactNode {
  const marker = "\u0000";
  const [before = "", after = ""] = phrase(marker).split(marker);
  return (
    <>
      {before}
      {link}
      {after}
    </>
  );
}

/** The header's account field and its sign-in (space-1, space-3,
 * space-6). The control stands last: below @xs the fields stack and
 * Sign in spans the width (space-28). */
export function AccountField({
  groups,
  signIn,
  connected,
  onNote,
}: {
  groups: GroupsState;
  signIn: SignInFlow;
  connected: boolean;
  onNote: Note;
}) {
  const spaceSignOut = useAppStore((state) => state.spaceSignOut);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const host = groups.host.displayName ?? groups.host.url;
  const account = groups.account;
  const running = signIn.running;

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

  const copyCode = (code: string) => {
    const write = navigator.clipboard?.writeText?.(code);
    if (!write) {
      onNote(i18n._("Copy is not available here; select the code to copy it."));
      return;
    }
    void write
      .then(() => {
        setCopied(true);
        onNote(i18n._("Copied {what}", { what: code }));
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => onNote(i18n._("Copy is not available here; select the code to copy it.")));
  };

  if (account) {
    const login = account.login;
    return (
      <div
        data-testid="space-account"
        className="flex min-w-0 flex-col gap-1 @xs:flex-row @xs:flex-wrap @xs:items-center @xs:gap-x-3"
      >
        <span className="flex min-w-0 flex-1 items-center gap-1 text-sm" title={groups.host.url}>
          {/* The host's name yields below @md (space-28); the login
              stays, and the whole phrase rides the title. */}
          <span data-testid="space-account-wide" className="hidden min-w-0 truncate @md:inline">
            {i18n._("Signed in as {login} at {host}", { login, host })}
          </span>
          <span data-testid="space-account-narrow" className="min-w-0 truncate @md:hidden">
            {i18n._("Signed in as {login}", { login })}
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

  const failed = signIn.failure !== undefined;
  const signInLabel = running || signIn.starting
    ? i18n._({ id: "Signing in…", comment: "the Sign in control, while the sign-in runs" })
    : failed
      ? i18n._({ id: "Sign in again", comment: "the Sign in control after a sign-in failed" })
      : i18n._({ id: "Sign in", comment: "sign in to the Git host" });

  let flow: ReactNode = null;
  if (running?.flow === "browser") {
    flow =
      running.opened || !running.url ? (
        <span data-testid="space-signin-opened" className="text-xs text-neutral-500">
          {i18n._("Browser opened at {host}", { host })}
        </span>
      ) : (
        <span data-testid="space-signin-link-line" className="text-xs">
          {withLink(
            (link) => i18n._("Continue at {link}", { link }),
            <a
              data-testid="space-signin-link"
              href={running.url}
              target="_blank"
              rel="noreferrer"
              className="text-brand-600 hover:underline dark:text-brand-300"
            >
              {i18n._("{host}'s sign-in page", { host })}
            </a>,
          )}
        </span>
      );
  } else if (running?.flow === "device") {
    flow = (
      <span data-testid="space-signin-device" className="flex min-w-0 flex-wrap items-center gap-1 text-xs">
        {running.userCode ? (
          <span className="flex items-center gap-1">
            <input
              readOnly
              data-testid="space-signin-code"
              aria-label={i18n._("Sign-in code")}
              value={running.userCode}
              size={Math.max(running.userCode.length, 4)}
              onFocus={(event) => event.currentTarget.select()}
              className="rounded border border-neutral-300 bg-transparent px-1.5 py-0.5 font-mono text-sm tracking-wider dark:border-neutral-700"
            />
            <button
              type="button"
              data-testid="space-signin-copy"
              aria-label={i18n._("Copy code")}
              title={i18n._("Copy code")}
              className={SECONDARY}
              onClick={() => copyCode(running.userCode!)}
            >
              {copied ? <Icon name="check" className="h-3.5 w-3.5" /> : <Icon name="copy" className="h-3.5 w-3.5" />}
            </button>
          </span>
        ) : null}
        {running.verificationUri ? (
          <span className="min-w-0">
            {withLink(
              (link) => i18n._("Enter it at {link}", { link }),
              <a
                data-testid="space-signin-link"
                href={running.verificationUri}
                target="_blank"
                rel="noreferrer"
                className="break-all text-brand-600 hover:underline dark:text-brand-300"
              >
                {running.verificationUri}
              </a>,
            )}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <div
      data-testid="space-account"
      className="flex min-w-0 flex-col gap-1 @xs:flex-row @xs:flex-wrap @xs:items-center @xs:gap-x-3"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
        <span className="text-neutral-500">{i18n._("Not signed in")}</span>
        {flow ?? (
          // What signing in brings, and that nothing is contacted
          // before it (space-3): one phrase under the field (DR-069).
          <span data-testid="space-signin-caption" className="text-xs text-neutral-500">
            {i18n._("Your groups and each project's records shared with its members · nothing contacted until you sign in")}
          </span>
        )}
        {signIn.failure ? (
          <span data-testid="space-signin-error" role="alert" className="text-xs text-red-600 dark:text-red-400">
            {signIn.failure}
          </span>
        ) : null}
      </span>
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
        title={i18n._("Signs in to {host}", { host })}
        onClick={signIn.start}
      >
        {signInLabel}
      </button>
    </div>
  );
}
