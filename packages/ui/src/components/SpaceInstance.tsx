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
// last read with "Sign in again", whose flow reads on it, and Forget,
// which removes the instance from the home (space-82), and, where the
// instance signed this device out, says so with the login to continue
// as (space-3). Below 20rem the heading stacks, its last control
// full-width. While the home lists any instance, "Add instance…" stands
// at the list's foot, bearing "Another instance" as its title and
// accessible name, and opens the sign-in card in its place (space-1,
// space-3). Every act is a command whose outcome arrives as state
// (space-29).

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { GroupsState, InstanceState } from "@sublang/spex-core/protocol";

import { usePlaceStore } from "../state/place-context.js";
import { i18n } from "../i18n.js";
import { hostNameOf, instanceName, instanceOf, originOf } from "../lib/instances.js";
import { absoluteTitle, relativeAge } from "../lib/time.js";
import { GroupNameEditor } from "./SpaceMembers.js";
import { InstanceField, signInAgainLabel, signInLines, signingInLabel, type SignInFlow } from "./SpaceSignIn.js";
import { PRIMARY, SECONDARY, type Note } from "./SpaceSurface.js";

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

/** An instance's heading (space-1, space-3, space-6, space-82,
 * space-28): what it carries signed in, or signed out, with the sign-in
 * that runs or failed here, or Forget's refusal, reading beneath it. */
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
  const store = usePlaceStore();
  const spaceSignOut = store((state) => state.spaceSignOut);
  const spaceForget = store((state) => state.spaceForget);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string>();
  const [forgetting, setForgetting] = useState(false);
  const [forgetError, setForgetError] = useState<string>();
  const [creating, setCreating] = useState(false);
  const againRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const newGroupRef = useRef<HTMLButtonElement>(null);
  const forgetRef = useRef<HTMLButtonElement>(null);
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

  // Forget's refusal speaks of this sign-out: signed in again, it goes.
  useEffect(() => {
    if (instance.signedIn) setForgetError(undefined);
  }, [instance.signedIn]);

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

  /** Forget this signed-out instance (space-82): the reply is the state,
   * which lists it no more, so its heading leaves the list — nothing at
   * the instance changes and every record stays, so nothing is asked
   * first. Focus, whose control is gone with the heading, moves to "Add
   * instance…" — the field of its card where the reader opened it — or,
   * where no instance remains and the header is the sign-in card again,
   * to that card's field (DR-010 §6). Refused — a spex repository still
   * kept under it, or a session refusing its follow — the core's words
   * stand beneath the heading, which stays. */
  const forget = async () => {
    if (!connected || forgetting || (here && flowing)) return;
    setForgetting(true);
    setForgetError(undefined);
    try {
      await spaceForget(origin);
      onNote(
        i18n._({
          id: "Forgot {host}",
          values: { host: name },
          comment: "the live note once Forget removed the instance from this home; {host} is its display name, or its host name before any read",
        }),
      );
      setTimeout(() => {
        if (!stranded()) return;
        document
          .querySelector<HTMLElement>(
            [
              '[data-testid="space-signin-card"] [data-testid="space-signin-instance"]',
              '[data-testid="space-add-instance"]',
              '[data-testid="space-add-card"] [data-testid="space-signin-instance"]',
            ].join(", "),
          )
          ?.focus();
      }, 0);
    } catch (cause) {
      const message = (cause as Error).message;
      setForgetError(message);
      onNote(message);
      // Forget, disabled while it ran, takes focus back.
      setTimeout(() => {
        if (stranded()) forgetRef.current?.focus();
      }, 0);
    } finally {
      setForgetting(false);
    }
  };

  /** Sign in again at this instance's origin (space-3), its flow reading
   * here. */
  const again = () => {
    if (!connected || flowing || forgetting) return;
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
        {/* Each control is keyed by what it is, so a heading changing
            state never hands one control's element, and the focus on it,
            to another. */}
        {instance.signedIn ? (
          <>
            {/* The read time is the first at-a-glance word to yield
                (space-28); its full moment rides the title. */}
            <span
              key="read-at"
              data-testid="space-read-at"
              title={readAt !== null ? absoluteTitle(readAt) : undefined}
              className="hidden min-w-0 shrink-0 truncate text-xs text-neutral-500 @2xl:inline"
            >
              {readAt !== null
                ? i18n._({
                    id: "Read {age}",
                    values: { age: relativeAge(readAt, now) },
                    comment: "on a signed-in instance's heading: when its last read was held; {age} is relative, such as '5m ago'",
                  })
                : i18n._("Not read yet")}
            </span>
            {instance.account.canCreateGroup ? (
              <button
                key="new-group"
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
              key="signout"
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
            {/* Forget removes the instance from the home, nothing at it
                changing (space-82): no busy form (space-28) and no
                confirm, the control disabled while it runs and while a
                sign-in runs here. */}
            <button
              key="forget"
              ref={forgetRef}
              type="button"
              data-testid="space-forget"
              className={`${SECONDARY} self-start whitespace-nowrap @xs:self-auto`}
              disabled={!connected || forgetting || (here && flowing)}
              title={i18n._({
                id: "Forgets {host} on this device; every record stays here",
                values: { host: name },
                comment: "Forget's title on a signed-out instance's heading; {host} is the instance's display name, or its host name before any read",
              })}
              onClick={() => void forget()}
            >
              {i18n._({
                id: "Forget",
                comment: "on a signed-out instance's heading: remove the instance from this home; nothing at it changes and every record stays",
              })}
            </button>
            {runningHere ? (
              <button
                key="cancel"
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
              key="again"
              ref={againRef}
              type="button"
              data-testid="space-signin-again"
              className={`${SECONDARY} w-full whitespace-nowrap @xs:w-auto`}
              disabled={!connected || flowing || forgetting}
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
      {forgetError && !instance.signedIn ? (
        <p data-testid="space-forget-refusal" role="alert" className={`${ALERT} break-words`}>
          {forgetError}
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

/** The name "Add instance…" bears as its title and accessible name, and
 * the card it opens (space-1, space-28). */
const anotherInstance = (): string =>
  i18n._({
    id: "Another instance",
    comment: "the title and accessible name of \"Add instance…\" at the groups list's foot, and the name of the sign-in card it opens",
  });

/** The groups list's foot while the home lists any instance (space-1,
 * space-3): "Add instance…", disabled while any sign-in starts or runs,
 * which opens the sign-in card in its place — its field captioned
 * "Instance" holding the default instance's origin, focused and
 * selected, with Sign in and Cancel, and saying that your own group's
 * records will be kept there too, as the sign-in places your own group
 * at every instance (space-4). The card's flow reads in it, as do
 * a start the core refuses, the field keeping its text, and a flow that
 * ended without an account, with "Sign in again"; a flow another client
 * runs at an instance the home does not list opens it too. Escape or
 * Cancel stops the flow the card runs and closes it, focus back on "Add
 * instance…"; the flow ending signed in closes it — at an instance
 * signed in already too, which signs its entry in again (git-host-2) —
 * focus landing on that instance heading's Sign out (DR-010 §6). */
export function AddInstance({
  groups,
  connected,
  signIn,
}: {
  groups: GroupsState;
  connected: boolean;
  signIn: SignInFlow;
}) {
  const [open, setOpen] = useState(false);
  // What the reader typed since the card opened; until then the field
  // holds the default instance's origin (space-3, storage-2).
  const [typed, setTyped] = useState<string>();
  // The instance the card's flow signs in to, and whether it was signed
  // in when the flow started: its sign-in landing closes the card.
  const [target, setTarget] = useState<{ origin: string; was: boolean }>();
  // The card's own flow ended with no failure: at an instance signed in
  // when it started, that is its landing.
  const [ended, setEnded] = useState(false);
  // A failure that already stood when the card opened belongs to an
  // earlier card: a fresh card reads none.
  const [stale, setStale] = useState<string>();
  // Closed by the reader while its flow still stops: the card stays shut.
  const [dismissed, setDismissed] = useState(false);
  const addRef = useRef<HTMLButtonElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const signInRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const focusField = useRef(false);
  const focusAdd = useRef(false);
  const titleId = useId();
  const ownId = useId();

  // At most one sign-in runs, whichever instance it names (git-host-2).
  const flowing = signIn.running !== null || signIn.starting;
  const here = signIn.at === "card";
  const runningHere = here && signIn.running !== null;
  const landed = target !== undefined && (!target.was || ended) && instanceOf(groups, target.origin)?.signedIn === true;
  // A flow reading on the card opens it, whoever started it — but not
  // one whose instance is signed in already: that flow has landed, the
  // header's card giving way as it does.
  const placed = runningHere && !dismissed && instanceOf(groups, signIn.instance)?.signedIn !== true;
  const show = (open || placed) && !landed;

  const remember = (origin: string) => {
    setTarget({ origin, was: instanceOf(groups, origin)?.signedIn === true });
    setEnded(false);
  };

  // The card a flow opened stays open through its outcome (space-3).
  useEffect(() => {
    if (!runningHere) setDismissed(false);
    if (!placed || open) return;
    setOpen(true);
    setStale(undefined);
    if (signIn.instance) remember(signIn.instance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed, runningHere]);

  // Signed in, the card's work is done: it closes, and focus, whose
  // control is gone with the card, lands on that instance heading's Sign
  // out (DR-010 §6) — useSignIn moves it there for an instance newly
  // signed in, and here for one signed in again.
  useEffect(() => {
    if (!landed || !target) return;
    const origin = target.origin;
    setOpen(false);
    setTarget(undefined);
    setTyped(undefined);
    setEnded(false);
    setTimeout(() => {
      if (!stranded()) return;
      document.querySelector<HTMLElement>(`[data-testid="space-instance-${origin}"] [data-testid="space-signout"]`)?.focus();
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landed]);

  // Focus follows what the reader did (DR-010 §6): opened, the field,
  // its text selected; closed, "Add instance…" again, once the flow the
  // card stopped has ended and it takes focus — unless the reader put
  // focus elsewhere meanwhile.
  const addDisabled = !connected || flowing;
  useEffect(() => {
    if (show && focusField.current) {
      focusField.current = false;
      fieldRef.current?.focus();
      fieldRef.current?.select();
    }
    if (show) focusAdd.current = false;
    if (!show && focusAdd.current && !addDisabled) {
      focusAdd.current = false;
      if (stranded()) addRef.current?.focus();
    }
  }, [show, addDisabled]);

  // Sign in, disabled while the card's flow runs, hands focus to Cancel,
  // which gives it back when the flow ends without an account; focus the
  // reader put elsewhere stays.
  const wasRunning = useRef(runningHere);
  useEffect(() => {
    if (wasRunning.current === runningHere) return;
    wasRunning.current = runningHere;
    // Its flow ended with no cause standing: a landing wherever its
    // instance reads signed in (space-3).
    if (!runningHere && signIn.failure === undefined) setEnded(true);
    if (!stranded(signInRef.current)) return;
    if (runningHere) cancelRef.current?.focus();
    else signInRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningHere]);

  // What the card's own flow reads (space-3): its lines while it runs, a
  // start refused or a flow ended without an account as its cause, none
  // of a flow reading elsewhere. Until the reader types, the field holds
  // the origin that flow names, else the default instance's.
  const failure = here && signIn.failure !== stale ? signIn.failure : undefined;
  const named = runningHere || failure !== undefined ? signIn.instance : undefined;
  const field = typed ?? named ?? groups.defaultInstance;
  const url = field.trim();

  const openCard = () => {
    if (!connected || flowing) return;
    focusField.current = true;
    setTyped(undefined);
    setTarget(undefined);
    setEnded(false);
    setStale(signIn.failure);
    setOpen(true);
  };

  /** Close the card (space-3): the flow it runs stopped, focus back on
   * "Add instance…". */
  const close = () => {
    if (runningHere) {
      signIn.cancel();
      setDismissed(true);
    }
    focusAdd.current = true;
    setOpen(false);
    setTarget(undefined);
    setTyped(undefined);
    setEnded(false);
  };

  const begin = () => {
    if (!connected || flowing || !url) return;
    setStale(undefined);
    remember(originOf(url));
    void signIn.start(url, "card").then((started) => {
      if (!started) fieldRef.current?.focus();
    });
  };

  if (!show) {
    return (
      <button
        ref={addRef}
        type="button"
        data-testid="space-add-instance"
        // The long name is its title and its accessible name; the label
        // keeps to the budget (space-28, DR-041).
        aria-label={anotherInstance()}
        title={anotherInstance()}
        className={`${SECONDARY} self-start whitespace-nowrap`}
        disabled={addDisabled}
        onClick={openCard}
      >
        {i18n._({
          id: "Add instance…",
          comment: "at the groups list's foot: opens the sign-in card for another instance; its title and accessible name are \"Another instance\"",
        })}
      </button>
    );
  }

  const lines = signInLines(
    { ...signIn, running: here ? signIn.running : null, failure },
    hostNameOf(signIn.instance ?? url),
  );
  const flowingHere = here && flowing;
  const label = flowingHere
    ? signingInLabel()
    : failure !== undefined && !signIn.refused
      ? signInAgainLabel()
      : i18n._({ id: "Sign in", comment: "sign in to an instance" });

  return (
    <div
      role="group"
      aria-labelledby={titleId}
      aria-describedby={ownId}
      data-testid="space-add-card"
      className="flex min-w-0 flex-col gap-2"
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        // Escape stops the card's flow and closes it (space-3).
        if (event.key !== "Escape") return;
        event.stopPropagation();
        close();
      }}
    >
      <h2 id={titleId} className="text-sm font-medium">
        {anotherInstance()}
      </h2>
      {/* Your own group is placed at every instance the home signs in
          to (space-4, DR-128): the card for another instance says so
          before its sign-in, whatever its flow reads (space-3). The
          header's card, the first sign-in, does not. */}
      <p
        id={ownId}
        data-testid="space-add-own"
        className="min-w-0 break-words text-sm text-neutral-600 dark:text-neutral-300"
      >
        {i18n._({
          id: "Your own group's records will be kept there too.",
          comment: "the sign-in card opened from \"Add instance…\": your own group's records are kept at every instance the home signs in to, this one included",
        })}
      </p>
      {lines ? (
        <div
          data-testid="space-signin-body"
          className="flex min-w-0 flex-col gap-1 break-words text-sm text-neutral-600 dark:text-neutral-300"
        >
          {lines}
        </div>
      ) : null}
      <InstanceField
        inputRef={fieldRef}
        value={field}
        onChange={setTyped}
        onEnter={begin}
        // The origin being signed in to stands while the card's flow
        // runs.
        readOnly={flowingHere}
      />
      <div className={ROW}>
        <button
          ref={cancelRef}
          type="button"
          data-testid="space-signin-cancel"
          className={`${SECONDARY} self-start @xs:self-auto`}
          onClick={close}
        >
          {i18n._({ id: "Cancel", comment: "leave the editor without changing anything" })}
        </button>
        <button
          ref={signInRef}
          type="button"
          data-testid="space-signin"
          className={`${PRIMARY} w-full @xs:w-auto`}
          disabled={!connected || flowing || !url}
          title={url ? i18n._("Signs in to {host}", { host: hostNameOf(url) }) : undefined}
          onClick={begin}
        >
          {label}
        </button>
      </div>
    </div>
  );
}
