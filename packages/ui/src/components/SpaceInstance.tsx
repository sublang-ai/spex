// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// An instance's section of the groups list (space-1, DR-127): its
// heading, then its groups, your namespace there and every other
// account's login beneath it. Signed in, the heading reads the
// instance's display name — its host name until a read names one —
// beside "Signed in as @<login>", with Sign out (space-6), "New group"
// where its read says the person may create one there (space-68) and
// the phrase naming who makes groups where it says not, with no link
// and no control (DR-120), and the time its last read was held, which
// yields first below 42rem (space-28); a failed read stands on this
// heading alone (git-host-5). Signed out, the heading keeps the name it
// last read with "Sign in again", whose flow reads on it, and, where the
// instance signed this device out, says so with the login to continue
// as (space-3). Below 20rem the heading stacks, its last control
// full-width. Every act is a command whose outcome arrives as state
// (space-29).

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { InstanceState } from "@sublang/spex-core/protocol";

import { useAppStore } from "../state/store.js";
import { i18n } from "../i18n.js";
import { hostNameOf, instanceName } from "../lib/instances.js";
import { absoluteTitle, relativeAge } from "../lib/time.js";
import { GroupNameEditor } from "./SpaceMembers.js";
import { signInAgainLabel, signInLines, signingInLabel, type SignInFlow } from "./SpaceSignIn.js";
import { SECONDARY, type Note } from "./SpaceSurface.js";

/** The heading's fields: stacked below 20rem, a wrapping row above it
 * (space-28). */
const ROW = "flex min-w-0 flex-col gap-1 @xs:flex-row @xs:flex-wrap @xs:items-center @xs:gap-x-3";
const ALERT = "min-w-0 text-xs text-red-600 dark:text-red-400";

/** Whether focus has nowhere to stand: the control it stood on is gone
 * or disabled (DR-010 §6). */
function stranded(disabledOn?: HTMLElement | null): boolean {
  const active = document.activeElement;
  return (
    !active ||
    !active.isConnected ||
    active === document.body ||
    (disabledOn != null && active === disabledOn) ||
    (active instanceof HTMLButtonElement && active.disabled)
  );
}

/** One instance the home lists (space-1): its heading over what it
 * lists, the caller's entries in the order the heading lists them. */
export function InstanceSection({
  instance,
  now,
  connected,
  signIn,
  onNote,
  children,
}: {
  instance: InstanceState;
  now: number;
  connected: boolean;
  signIn: SignInFlow;
  onNote: Note;
  children: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={instanceName(instance)}
      data-testid={`space-instance-${instance.origin}`}
      data-signed-in={instance.signedIn ? "1" : "0"}
      className="@container flex min-w-0 flex-col gap-3 border-t border-neutral-200 pt-3 dark:border-neutral-800"
    >
      <InstanceHeading instance={instance} now={now} connected={connected} signIn={signIn} onNote={onNote} />
      {children}
    </div>
  );
}

/** An instance's heading (space-1, space-3, space-6, space-28): what it
 * carries signed in, or signed out, with the sign-in that runs or
 * failed here reading beneath it. */
function InstanceHeading({
  instance,
  now,
  connected,
  signIn,
  onNote,
}: {
  instance: InstanceState;
  now: number;
  connected: boolean;
  signIn: SignInFlow;
  onNote: Note;
}) {
  const spaceSignOut = useAppStore((state) => state.spaceSignOut);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string>();
  const [creating, setCreating] = useState(false);
  const againRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const newGroupRef = useRef<HTMLButtonElement>(null);
  const origin = instance.origin;
  const name = instanceName(instance);
  // At most one sign-in runs, whichever instance it names (git-host-2):
  // while one starts or runs, no other heading offers its own.
  const flowing = signIn.running !== null || signIn.starting;
  const here = signIn.at === origin;
  const runningHere = here && signIn.running !== null;

  // Focus never strands (DR-010 §6): "Sign in again", disabled while its
  // flow runs, hands focus to Cancel, which gives it back when the flow
  // ends without an account; focus the reader put elsewhere stays.
  const wasRunning = useRef(runningHere);
  useEffect(() => {
    if (wasRunning.current === runningHere) return;
    wasRunning.current = runningHere;
    if (!stranded(againRef.current)) return;
    if (runningHere) cancelRef.current?.focus();
    else againRef.current?.focus();
  }, [runningHere]);

  /** Sign out of this instance (space-6): the reply is the state, the
   * heading kept, signed out, and focus moves to its "Sign in again". */
  const signOut = async () => {
    setSigningOut(true);
    setSignOutError(undefined);
    try {
      await spaceSignOut(origin);
      onNote(
        i18n._({
          id: "Signed out of {host}",
          values: { host: name },
          comment: "the live note once Sign out signed this device out of one instance; {host} is its display name, or its host name before any read",
        }),
      );
      setTimeout(() => {
        if (stranded()) againRef.current?.focus();
      }, 0);
    } catch (cause) {
      const message = (cause as Error).message;
      setSignOutError(message);
      onNote(message);
    } finally {
      setSigningOut(false);
    }
  };

  /** Sign in again at this instance's origin (space-3), its flow reading
   * here. */
  const again = () => {
    if (!connected || flowing) return;
    void signIn.start(origin, origin);
  };

  // The flow that runs, or failed, here: named by the host name of the
  // origin being signed in to (space-3).
  const lines = here ? signInLines(signIn, hostNameOf(signIn.instance ?? origin)) : null;
  // The instance signed this device out (git-host-4): said while no flow
  // runs or stands failed (space-3).
  const byHost = !instance.signedIn && instance.hostSignedOut && !flowing && signIn.failure === undefined;
  const readAt = instance.readAt;
  const signedInAs = i18n._("Signed in as @{login}", { login: instance.account.login });

  return (
    <div
      data-testid="space-instance-heading"
      className="flex min-w-0 flex-col gap-1"
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        // Escape cancels the flow in flight here (space-3).
        if (event.key !== "Escape" || !runningHere) return;
        event.stopPropagation();
        signIn.cancel();
      }}
    >
      <div className={ROW}>
        {/* The name owns the slack and truncates with its title; what
            stands beside it follows the separator in the secondary tone
            (space-1). */}
        <h2 className="flex min-w-0 items-baseline gap-2 text-sm font-semibold @xs:flex-1">
          <span className="min-w-0 truncate" title={name}>
            {name}
          </span>
          {instance.signedIn ? " " : null}
          {instance.signedIn ? (
            <span data-testid="space-account" className="min-w-0 truncate text-xs font-normal text-neutral-500" title={signedInAs}>
              <span aria-hidden>· </span>
              {signedInAs}
            </span>
          ) : null}
        </h2>
        {instance.signedIn ? (
          <>
            {/* The read time is the first at-a-glance word to yield
                (space-28); its full moment rides the title. */}
            <span
              data-testid="space-read-at"
              title={readAt !== null ? absoluteTitle(readAt) : undefined}
              className="hidden min-w-0 shrink-0 truncate text-xs text-neutral-500 @2xl:inline"
            >
              {readAt !== null
                ? i18n._("Host read {age}", { age: relativeAge(readAt, now) })
                : i18n._("Not read yet")}
            </span>
            {instance.account.canCreateGroup ? (
              <button
                ref={newGroupRef}
                type="button"
                data-testid="space-new-group"
                aria-expanded={creating}
                className={`${SECONDARY} self-start whitespace-nowrap @xs:self-auto`}
                disabled={!connected}
                onClick={() => setCreating((was) => !was)}
              >
                {i18n._({ id: "New group", comment: "create a group at the root of the instance whose heading carries it" })}
              </button>
            ) : null}
            <button
              type="button"
              data-testid="space-signout"
              className={`${SECONDARY} w-full whitespace-nowrap @xs:w-auto`}
              disabled={!connected || signingOut}
              title={i18n._("Signs this device out of {host}; every record stays here", { host: name })}
              onClick={() => void signOut()}
            >
              {signingOut
                ? i18n._({ id: "Signing out…", comment: "the Sign out control, while signing out" })
                : i18n._({ id: "Sign out", comment: "sign this device out of the instance whose heading carries it" })}
            </button>
          </>
        ) : (
          <>
            {runningHere ? (
              <button
                ref={cancelRef}
                type="button"
                data-testid="space-signin-cancel"
                className={`${SECONDARY} self-start @xs:self-auto`}
                onClick={signIn.cancel}
              >
                {i18n._({ id: "Cancel", comment: "leave the editor without changing anything" })}
              </button>
            ) : null}
            <button
              ref={againRef}
              type="button"
              data-testid="space-signin-again"
              className={`${SECONDARY} w-full whitespace-nowrap @xs:w-auto`}
              disabled={!connected || flowing}
              title={i18n._("Signs in to {host}", { host: instance.host })}
              onClick={again}
            >
              {here && flowing ? signingInLabel() : signInAgainLabel()}
            </button>
          </>
        )}
      </div>
      {instance.signedIn && !instance.account.canCreateGroup && readAt !== null ? (
        <p data-testid="space-groups-made-by" className="min-w-0 text-xs text-neutral-500">
          {i18n._({
            id: "Groups are made by the people who run {name}",
            comment: "on an instance's heading where the person may not create a group there; {name} is the instance's display name; no link, no control",
            values: { name },
          })}
        </p>
      ) : null}
      {instance.signedIn && instance.read.phase === "failed" ? (
        <p data-testid="space-read-error" role="alert" className={ALERT}>
          {instance.read.message}
        </p>
      ) : null}
      {signOutError ? (
        <p role="alert" className={ALERT}>
          {signOutError}
        </p>
      ) : null}
      {lines ? (
        <div
          data-testid="space-signin-body"
          className="flex min-w-0 flex-col gap-1 break-words text-sm text-neutral-600 dark:text-neutral-300"
        >
          {lines}
        </div>
      ) : null}
      {byHost ? (
        <p data-testid="space-signed-out-by-host" className="min-w-0 break-words text-sm text-neutral-600 dark:text-neutral-300">
          {i18n._("{site} signed this device out. Sign in again to continue as @{login}.", {
            site: instance.host,
            login: instance.account.login,
          })}
        </p>
      ) : null}
      {creating && instance.signedIn ? (
        <GroupNameEditor
          testId="space-new-group-editor"
          instance={origin}
          parent={null}
          connected={connected}
          onClose={() => {
            setCreating(false);
            // Closing never strands focus (DR-010 §6).
            setTimeout(() => newGroupRef.current?.focus(), 0);
          }}
          onNote={onNote}
        />
      ) : null}
    </div>
  );
}
