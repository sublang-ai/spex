// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A Space's section of the groups list (space-1, DR-127, DR-172): its
// heading, then its groups, Personal and every other account's login
// beneath it. Signed in, the heading reads the Space's
// display name — its host name until a read names one — beside
// "@<login>", with "New group" where its read is held (space-68),
// disabled and titled "Made by the people who run <Space>" where the
// read says the person may not create one (DR-120), one overflow "More"
// holding "Remove from this list", disabled, and Sign out (space-6) as
// its last control; a failed read stands on this heading alone
// (git-host-5). Signed out, the heading keeps the name it last read —
// "<Space> · signed out · @<login>" where the Space signed this computer
// out (space-3) — with "Sign in again", whose flow reads on it, and the
// overflow's "Remove from this list", which removes the Space from this
// list (space-82). The heading carries nothing of packages or the
// registry (DR-173). Below 20rem the heading stacks, its last control
// full-width. While the home lists any Space, "Add a Space…" stands at
// the list's foot and opens the sign-in card in its place (space-1,
// space-3). Every act is a command whose outcome arrives as state
// (space-29).

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { GroupsState, InstanceState } from "@sublang/spex-core/protocol";

import { usePlaceStore } from "../state/place-context.js";
import { i18n } from "../i18n.js";
import { instanceName, instanceOf, originOf } from "../lib/instances.js";
import { seatName } from "../lib/space.js";
import { spaceNameOf, SpaceChooser } from "./SpaceDirectory.js";
import { MoreMenu } from "./SpaceMenu.js";
import { GroupNameEditor } from "./SpaceMembers.js";
import {
  causePhrase,
  focusCardField,
  opensInBrowser,
  signInAgainLabel,
  signInLabel,
  signInLines,
  signInTitle,
  signingInLabel,
  useChoice,
  type SignInFlow,
} from "./SpaceSignIn.js";
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

/** One Space the home lists (space-1): its heading over what it lists,
 * the caller's entries in the order the heading lists them. */
export function InstanceSection({
  instance,
  connected,
  signIn,
  onNote,
  children,
}: {
  instance: InstanceState;
  /** The clock the surface reads by; the heading carries no time. */
  now?: number;
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
      <InstanceHeading instance={instance} connected={connected} signIn={signIn} onNote={onNote} />
      {children}
    </div>
  );
}

/** A Space's heading (space-1, space-3, space-6, space-82, space-28):
 * what it carries signed in, or signed out, with the sign-in that runs or
 * failed here, or the refusal of "Remove from this list", reading beneath
 * it. */
function InstanceHeading({
  instance,
  connected,
  signIn,
  onNote,
}: {
  instance: InstanceState;
  connected: boolean;
  signIn: SignInFlow;
  onNote: Note;
}) {
  const store = usePlaceStore();
  const spaceSignOut = store((state) => state.spaceSignOut);
  const spaceForget = store((state) => state.spaceForget);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string>();
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string>();
  const [creating, setCreating] = useState(false);
  const againRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const newGroupRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const origin = instance.origin;
  const name = instanceName(instance);
  // At most one sign-in runs, whichever Space it names (git-host-2):
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

  // The refusal speaks of this sign-out: signed in again, it goes.
  useEffect(() => {
    if (instance.signedIn) setRemoveError(undefined);
  }, [instance.signedIn]);

  // At a seat's place the server is named where this computer would be
  // (space-112).
  const seat = seatName(store.place);

  /** Sign out of this Space (space-6): the reply is the state, the
   * heading kept, signed out, and focus moves to its "Sign in again". */
  const signOut = async () => {
    setSigningOut(true);
    setSignOutError(undefined);
    try {
      await spaceSignOut(origin);
      onNote(
        i18n._({
          id: "Signed out of {name}",
          values: { name },
          comment: "the live note once Sign out signed this computer out of one Space; {name} is its display name, or its host name before any read",
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

  /** Remove this signed-out Space from this list (space-82): the reply is
   * the state, which lists it no more, so its heading leaves the list —
   * nothing at the Space changes and every record stays, so nothing is
   * asked first. Focus, whose control is gone with the heading, moves to
   * "Add a Space…" — the chooser of its card where the reader opened it —
   * or, where no Space remains and the header is the sign-in card again,
   * to that card's chooser (DR-010 §6). Refused — "Still syncing:
   * <projects> — stop them first" — the core's words stand beneath the
   * heading, which stays. */
  const remove = async () => {
    if (!connected || removing || instance.signedIn || (here && flowing)) return;
    setRemoving(true);
    setRemoveError(undefined);
    try {
      await spaceForget(origin);
      onNote(
        i18n._({
          id: "Removed {space} from this list",
          values: { space: name },
          comment: "the live note once \"Remove from this list\" removed a signed-out Space; {space} is its display name, or its host name before any read",
        }),
      );
      setTimeout(() => {
        if (!stranded()) return;
        const add = document.querySelector<HTMLElement>('[data-testid="space-add-space"]');
        if (add) add.focus();
        else {
          focusCardField("space-signin-card");
          if (stranded()) focusCardField("space-add-card");
        }
      }, 0);
    } catch (cause) {
      const message = causePhrase((cause as Error).message);
      setRemoveError(message);
      onNote(message);
      setTimeout(() => {
        if (stranded()) moreRef.current?.focus();
      }, 0);
    } finally {
      setRemoving(false);
    }
  };

  /** Sign in again at this Space's origin (space-3), its flow reading
   * here. */
  const again = () => {
    if (!connected || flowing || removing) return;
    void signIn.start(origin, origin);
  };

  // The flow that runs, or failed, here: named as the reader knows the
  // Space (space-3).
  const lines = here ? signInLines(signIn, name) : null;
  // The Space signed this computer out (git-host-4): said on the heading
  // while no flow runs or stands failed (space-3).
  const byHost = !instance.signedIn && instance.hostSignedOut && !flowing && signIn.failure === undefined;
  const login = instance.account.login;
  const account = instance.signedIn
    ? `@${login}`
    : byHost
      ? i18n._({
          id: "signed out · @{login}",
          values: { login },
          comment: "on a Space's heading, after its name: the Space signed this computer out; {login} is the account to sign in again as",
        })
      : undefined;
  // The read the heading's New group follows (space-1): held, the Space
  // says whether the person may create a group there.
  const readHeld = instance.readAt !== null;
  const madeBy = i18n._({
    id: "Made by the people who run {space}",
    values: { space: name },
    comment: "the title of a disabled New group where the Space says the person may not create a group there; {space} is its display name",
  });
  const removeEntry = {
    label: i18n._({
      id: "Remove from this list",
      comment: "a Space heading's overflow entry: removes a signed-out Space from this list; nothing at the Space changes and every record stays",
    }),
    testId: "space-instance-remove",
    disabled: instance.signedIn || removing || (here && flowing) || !connected,
    hint: instance.signedIn
      ? i18n._({ id: "Sign out first", comment: "why \"Remove from this list\" is not offered while signed in to that Space" })
      : undefined,
    title: !instance.signedIn
      ? seat === undefined
        ? i18n._({
            id: "Every record stays on this computer",
            comment: "the title of \"Remove from this list\": nothing is deleted",
          })
        : i18n._({
            id: "Every record stays on {place}",
            values: { place: seat },
            comment: "the title of \"Remove from this list\" on a team server's Space; {place} is the server's name",
          })
      : undefined,
    onSelect: () => void remove(),
  };
  const more = (
    <MoreMenu key="more" of={name} testId="space-instance-more" buttonRef={moreRef} entries={[removeEntry]} />
  );

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
          {account ? " " : null}
          {account ? (
            <span data-testid="space-account" className="min-w-0 truncate text-xs font-normal text-neutral-500" title={account}>
              <span aria-hidden>· </span>
              {account}
            </span>
          ) : null}
        </h2>
        {/* Each control is keyed by what it is, so a heading changing
            state never hands one control's element, and the focus on it,
            to another. */}
        {instance.signedIn ? (
          <>
            {readHeld ? (
              <button
                key="new-group"
                ref={newGroupRef}
                type="button"
                data-testid="space-new-group"
                aria-expanded={creating}
                className={`${SECONDARY} self-start whitespace-nowrap @xs:self-auto`}
                disabled={!connected || !instance.account.canCreateGroup}
                title={instance.account.canCreateGroup ? undefined : madeBy}
                onClick={() => setCreating((was) => !was)}
              >
                {i18n._({ id: "New group", comment: "create a group at the root of the Space whose heading carries it" })}
              </button>
            ) : null}
            <button
              key="signout"
              type="button"
              data-testid="space-signout"
              className={`${SECONDARY} w-full whitespace-nowrap @xs:w-auto`}
              disabled={!connected || signingOut}
              title={
                seat === undefined
                  ? i18n._({
                      id: "Signs this computer out of {space}; every record stays here",
                      values: { space: name },
                      comment: "Sign out's title on a Space's heading; {space} is its display name",
                    })
                  : i18n._({
                      id: "Signs {place} out of {space}; every record stays there",
                      values: { place: seat, space: name },
                      comment: "Sign out's title on a team server's Space; {place} is the server's name, {space} the Space's display name",
                    })
              }
              onClick={() => void signOut()}
            >
              {signingOut
                ? i18n._({ id: "Signing out…", comment: "the Sign out control, while signing out" })
                : i18n._({ id: "Sign out", comment: "sign this computer out of the Space whose heading carries it" })}
            </button>
            {/* The overflow comes last, after Sign out (space-1). */}
            {more}
          </>
        ) : (
          <>
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
              disabled={!connected || flowing || removing}
              title={opensInBrowser(name)}
              onClick={again}
            >
              {here && flowing ? signingInLabel() : signInAgainLabel()}
            </button>
            {more}
          </>
        )}
      </div>
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
      {removeError && !instance.signedIn ? (
        <p data-testid="space-remove-refusal" role="alert" className={`${ALERT} break-words`}>
          {removeError}
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

/** The groups list's foot while the home lists any Space (space-1,
 * space-3): "Add a Space…", disabled while any sign-in starts or runs,
 * which opens the sign-in card "Sign in to a Space" in its place — its
 * chooser preselecting the default Space (space-115), focused, with Sign
 * in and Cancel. The card's flow reads in it, as do a start the core
 * refuses, the field keeping its text, and a flow that ended without an
 * account, with "Sign in again"; a flow another client runs at a Space
 * the home does not list opens it too. Escape or Cancel stops the flow
 * the card runs and closes it, focus back on "Add a Space…"; the flow
 * ending signed in closes it — at a Space signed in already too, which
 * signs its entry in again (git-host-2) — focus landing on that Space
 * heading's Sign out (DR-010 §6). */
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
  // The Space the card's flow signs in to, and whether it was signed in
  // when the flow started: its sign-in landing closes the card.
  const [target, setTarget] = useState<{ origin: string; was: boolean }>();
  // The card's own flow ended with no failure: at a Space signed in when
  // it started, that is its landing.
  const [ended, setEnded] = useState(false);
  // A failure that already stood when the card opened belongs to an
  // earlier card: a fresh card reads none.
  const [stale, setStale] = useState<string>();
  // Closed by the reader while its flow still stops: the card stays shut.
  const [dismissed, setDismissed] = useState(false);
  const addRef = useRef<HTMLButtonElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const chooserRef = useRef<HTMLSelectElement>(null);
  const signInRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const focusField = useRef(false);
  const focusAdd = useRef(false);
  const titleId = useId();

  // At most one sign-in runs, whichever Space it names (git-host-2).
  const flowing = signIn.running !== null || signIn.starting;
  const here = signIn.at === "card";
  const runningHere = here && signIn.running !== null;
  const landed = target !== undefined && (!target.was || ended) && instanceOf(groups, target.origin)?.signedIn === true;
  // A flow reading on the card opens it, whoever started it — but not
  // one whose Space is signed in already: that flow has landed, the
  // header's card giving way as it does.
  const placed = runningHere && !dismissed && instanceOf(groups, signIn.instance)?.signedIn !== true;
  const show = (open || placed) && !landed;

  // What the card's own flow reads (space-3): its lines while it runs, a
  // start refused or a flow ended without an account as its cause, none
  // of a flow reading elsewhere. Until the reader chooses, the chooser
  // holds the origin that flow names, else the default Space's.
  const failure = here && signIn.failure !== stale ? signIn.failure : undefined;
  const named = runningHere || failure !== undefined ? signIn.instance : undefined;
  const { directory, resolved, pick, type, reset } = useChoice(named ?? groups.defaultInstance);
  const url = resolved.url;

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
    reset();
    if (signIn.instance) remember(signIn.instance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed, runningHere]);

  // Signed in, the card's work is done: it closes, and focus, whose
  // control is gone with the card, lands on that Space heading's Sign
  // out (DR-010 §6) — useSignIn moves it there for a Space newly signed
  // in, and here for one signed in again.
  useEffect(() => {
    if (!landed || !target) return;
    const origin = target.origin;
    setOpen(false);
    setTarget(undefined);
    reset();
    setEnded(false);
    setTimeout(() => {
      if (!stranded()) return;
      document.querySelector<HTMLElement>(`[data-testid="space-instance-${origin}"] [data-testid="space-signout"]`)?.focus();
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landed]);

  // Focus follows what the reader did (DR-010 §6): opened, the chooser
  // — the field where it stands alone, its text selected; closed, "Add a
  // Space…" again, once the flow the card stopped has ended and it takes
  // focus — unless the reader put focus elsewhere meanwhile.
  const addDisabled = !connected || flowing;
  useEffect(() => {
    if (show && focusField.current) {
      focusField.current = false;
      if (chooserRef.current) chooserRef.current.focus();
      else {
        fieldRef.current?.focus();
        fieldRef.current?.select();
      }
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
    // Space reads signed in (space-3).
    if (!runningHere && signIn.failure === undefined) setEnded(true);
    if (!stranded(signInRef.current)) return;
    if (runningHere) cancelRef.current?.focus();
    else signInRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningHere]);

  const openCard = () => {
    if (!connected || flowing) return;
    focusField.current = true;
    reset();
    setTarget(undefined);
    setEnded(false);
    setStale(signIn.failure);
    setOpen(true);
  };

  /** Close the card (space-3): the flow it runs stopped, focus back on
   * "Add a Space…". */
  const close = () => {
    if (runningHere) {
      signIn.cancel();
      setDismissed(true);
    }
    focusAdd.current = true;
    setOpen(false);
    setTarget(undefined);
    reset();
    setEnded(false);
  };

  const begin = () => {
    if (!connected || flowing || !url) return;
    setStale(undefined);
    remember(originOf(url));
    void signIn.start(url, "card").then((started) => {
      if (!started) (fieldRef.current ?? chooserRef.current)?.focus();
    });
  };

  if (!show) {
    return (
      <button
        ref={addRef}
        type="button"
        data-testid="space-add-space"
        className={`${SECONDARY} self-start whitespace-nowrap`}
        disabled={addDisabled}
        onClick={openCard}
      >
        {i18n._({
          id: "Add a Space…",
          comment: "at the groups list's foot: opens the card \"Sign in to a Space\" for another Space",
        })}
      </button>
    );
  }

  const space = spaceNameOf(signIn.instance ?? url, groups, directory);
  const lines = signInLines({ ...signIn, running: here ? signIn.running : null, failure }, space);
  const flowingHere = here && flowing;
  const label = flowingHere ? signingInLabel() : failure !== undefined && !signIn.refused ? signInAgainLabel() : signInLabel();

  return (
    <div
      role="group"
      aria-labelledby={titleId}
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
        {signInTitle()}
      </h2>
      <SpaceChooser
        resolved={resolved}
        onPick={pick}
        onType={type}
        onEnter={begin}
        // The Space being signed in to stands while the card's flow runs.
        locked={flowingHere}
        chooserRef={chooserRef}
        fieldRef={fieldRef}
      />
      {lines ? (
        <div
          data-testid="space-signin-body"
          className="flex min-w-0 flex-col gap-1 break-words text-sm text-neutral-600 dark:text-neutral-300"
        >
          {lines}
        </div>
      ) : null}
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
          title={url ? opensInBrowser(spaceNameOf(url, groups, directory)) : undefined}
          onClick={begin}
        >
          {label}
        </button>
      </div>
    </div>
  );
}
