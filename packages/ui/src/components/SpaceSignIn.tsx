// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Signing in to a Space from the Space surface (space-3, space-115,
// DR-127, DR-172): while the home lists no Space, the header is one
// card titled by its act, "Sign in to a Space" — the chooser of the
// directory's Spaces with "Other Space…" revealing "Space address"
// (SpaceDirectory), Sign in its one primary control, and no sentence;
// while it lists any, "Add a Space…" at the list's foot opens the same
// card in its place, and a signed-out Space's heading starts it again at
// its own origin (SpaceInstance). Wherever it started, the flow in
// flight reads there as "Continue in your browser" with the link "Open
// <Space>" — the sign-in page on the desktop, which the bridge opened
// (app-shell-37), or the device flow's verification page, whose URL
// carries the code, which is never shown — and a flow that ended without
// an account reads the core's cause. The outcome is state: the surface
// reads `signIn` and the Spaces as the core sends them and keeps only
// the start's reply, which state does not carry. A team server's Space
// reads the same card.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { CommandResults, GroupsState } from "@sublang/spex-core/protocol";

import { usePlaceStore } from "../state/place-context.js";
import { i18n } from "../i18n.js";
import { instanceOf, originOf } from "../lib/instances.js";
import { openExternalBridge } from "../lib/space.js";
import {
  SpaceChooser,
  resolveChoice,
  spaceNameOf,
  useSpaceDirectory,
  type Directory,
  type ResolvedChoice,
  type SpaceChoice,
} from "./SpaceDirectory.js";
import { PRIMARY, SECONDARY, type Note } from "./SpaceSurface.js";

type StartReply = CommandResults["space.signin.start"];

/** Where a sign-in reads (space-3): the card, or the heading of the
 * Space at that origin. */
export type SignInAt = "card" | string;

/** The sign-in as the surface draws it: what the core's state says,
 * filled in with the start's reply. */
export interface SignInFlow {
  /** Where the flow starting, running or failed reads: where this page
   * started it; for one another client started, the heading of the
   * Space it names where the home lists it, else the card. Undefined
   * while none starts, runs or stands failed. */
  at: SignInAt | undefined;
  /** The origin being signed in to, or the one whose sign-in failed. */
  instance: string | undefined;
  /** The flow in flight, or null. */
  running:
    | { flow: "browser"; url?: string; opened: boolean }
    | { flow: "device"; verificationUri?: string }
    | null;
  /** The start command is in flight. */
  starting: boolean;
  /** Why the flow ended without an account, or the start was refused. */
  failure?: string;
  /** The failure is the start's refusal: no flow ran (space-3). */
  refused: boolean;
  /** Start the sign-in at the Space the URL names (space-29), its flow
   * reading at `at`; resolves whether a flow started. */
  start(url: string, at?: SignInAt): Promise<boolean>;
  cancel(): void;
}

/** The one sign-in of the surface (space-3, git-host-2): at most one
 * runs, whichever Space it names. */
export function useSignIn(groups: GroupsState | undefined, onNote: Note): SignInFlow {
  const store = usePlaceStore();
  const spaceSignIn = store((state) => state.spaceSignIn);
  const spaceSignInCancel = store((state) => state.spaceSignInCancel);
  const [started, setStarted] = useState<StartReply & { opened?: boolean }>();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();
  // The flow this page started last: the origin it named and where it
  // reads, kept through its failure.
  const [mine, setMine] = useState<{ origin: string; at: SignInAt }>();
  const inFlight = useRef(false);

  const signIn = groups?.signIn;
  const phase = signIn?.phase;

  // The flow ends as the state says (space-3): running gives way to
  // idle, with the account, or to failed, with its cause. A flow this
  // page did not start leaves nothing of this page's own to place.
  const lastPhase = useRef(phase);
  useEffect(() => {
    const was = lastPhase.current;
    lastPhase.current = phase;
    if (was === "running" && phase !== "running") setStarted(undefined);
    if (was === "running" && phase === "idle") setMine(undefined);
    if (was !== "running" && phase === "running" && !inFlight.current && !started) {
      setMine(undefined);
      setError(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);
  // A Space newly signed in ends the one flow there is; the flow's
  // controls are gone with it, so focus lands on that Space heading's
  // Sign out rather than stranding (DR-010 §6). Nothing lands while the
  // state is first read.
  const signedInAt = groups?.instances.filter((entry) => entry.signedIn).map((entry) => entry.origin) ?? [];
  const signedInKey = signedInAt.join(" ");
  const loaded = groups !== undefined;
  const lastSignedIn = useRef<string[] | undefined>(loaded ? signedInAt : undefined);
  useEffect(() => {
    const before = lastSignedIn.current;
    lastSignedIn.current = loaded ? signedInAt : undefined;
    if (!before) return;
    const landed = signedInAt.find((origin) => !before.includes(origin));
    if (landed === undefined) return;
    setStarted(undefined);
    setMine(undefined);
    setTimeout(() => {
      const active = document.activeElement;
      if (active && active.isConnected && active !== document.body) return;
      document
        .querySelector<HTMLElement>(`[data-testid="space-instance-${landed}"] [data-testid="space-signout"]`)
        ?.focus();
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedInKey, loaded]);

  const start = useCallback(
    async (url: string, at: SignInAt = "card"): Promise<boolean> => {
      if (!url || inFlight.current) return false;
      inFlight.current = true;
      setStarting(true);
      setError(undefined);
      setStarted(undefined);
      setMine({ origin: originOf(url), at });
      try {
        const reply = await spaceSignIn(url);
        if (reply?.flow !== "browser" && reply?.flow !== "device") {
          throw new Error(i18n._({ id: "The sign-in did not start", comment: "the sign-in card: the core answered the start with no flow" }));
        }
        if (reply.flow === "browser") {
          // The desktop opens the Space's page in the system browser; a
          // page with no bridge, or one the shell refused, offers the
          // link alone (app-shell-37).
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
        return true;
      } catch (cause) {
        // An address the origin rule refuses, or a sign-in already
        // running, starts no flow (space-3, git-host-2): its cause stands.
        const message = (cause as Error).message;
        setError(message);
        onNote(message);
        return false;
      } finally {
        inFlight.current = false;
        setStarting(false);
      }
    },
    [spaceSignIn, onNote],
  );

  const cancel = useCallback(() => {
    void (async () => {
      try {
        await spaceSignInCancel();
      } catch (cause) {
        onNote((cause as Error).message);
      } finally {
        setStarted(undefined);
        setMine(undefined);
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
  // The origin being signed in to (space-3): this page's own while its
  // reply or refusal stands, else the one the state names.
  let instance: string | undefined;
  if (started || (!running && error !== undefined)) instance = mine?.origin;
  else if (signIn && signIn.phase !== "idle") instance = signIn.instance;
  let at: SignInAt | undefined;
  if (running || failure !== undefined || starting) {
    at = mine?.at ?? (groups && instanceOf(groups, instance) ? instance : "card");
  }
  const refused = !running && error !== undefined;
  return { at, instance, running, starting, failure, refused, start, cancel };
}

const LINK_CLASS = "text-brand-600 hover:underline dark:text-brand-300";

/** The card's title, which names its act (space-3). */
export const signInTitle = (): string =>
  i18n._({ id: "Sign in to a Space", comment: "the sign-in card's title: its act, wherever the card stands" });

/** The words of Sign in (space-3). */
export const signInLabel = (): string =>
  i18n._({ id: "Sign in", comment: "sign in to the Space chosen, or to a registry" });

/** The words of "Sign in again" wherever it stands (space-3): a failed
 * flow's control, and a signed-out Space's heading's. */
export const signInAgainLabel = (): string =>
  i18n._({
    id: "Sign in again",
    comment: "the sign-in control on a signed-out Space's heading, and the card's after a sign-in failed",
  });

/** The words of a sign-in control while its flow runs (space-3). */
export const signingInLabel = (): string =>
  i18n._({ id: "Signing in…", comment: "the Sign in control, while the sign-in runs" });

/** What a sign-in control's title says it does (space-3, DR-172): the
 * consequence, as a phrase. */
export const opensInBrowser = (space: string): string =>
  i18n._({
    id: "Opens {space} in your browser",
    values: { space },
    comment: "the title of Sign in and Sign in again: the sign-in continues in the browser; {space} is the Space's display name",
  });

/** A cause as a phrase (DR-069): the core's words, without a final
 * stop. */
export const causePhrase = (cause: string): string => cause.replace(/[.。]\s*$/, "");

/** "Continue in your browser" with the link "Open <Space>" (space-3):
 * the sign-in page on the desktop, opened through the bridge as the
 * start opened it (app-shell-37), or the device flow's verification page
 * in a new tab, whose URL carries the code — never shown. A flow another
 * client runs links nothing it does not know. */
export function ContinueInBrowser({
  link,
  space,
  bridge,
  testId = "space-signin",
}: {
  link: string | undefined;
  space: string;
  /** The link opens through the bridge where it exists (a browser
   * flow's page). */
  bridge: boolean;
  testId?: string;
}) {
  return (
    <p data-testid={`${testId}-finish`} className="flex min-w-0 flex-wrap items-baseline gap-x-2">
      <span>{i18n._({ id: "Continue in your browser", comment: "a sign-in in flight: it continues on the Space's page in the browser" })}</span>
      {link ? (
        <>
          <span aria-hidden>·</span>
          <a
            data-testid={`${testId}-link`}
            href={link}
            target="_blank"
            rel="noreferrer"
            className={LINK_CLASS}
            onClick={(event) => {
              if (!bridge) return;
              const open = openExternalBridge();
              if (!open) return;
              event.preventDefault();
              void open(link).catch(() => false);
            }}
          >
            {i18n._({
              id: "Open {space}",
              values: { space },
              comment: "a sign-in in flight: the link to the Space's page where the sign-in continues; {space} is the Space's display name",
            })}
          </a>
        </>
      ) : null}
    </p>
  );
}

/** What the sign-in reads where its flow stands (space-3): "Continue in
 * your browser" with "Open <Space>" while it runs; a flow that ended
 * without an account, or a start the core refused, its cause as a
 * phrase. Null while no flow starts, runs or stands failed. `space` is
 * the Space being signed in to, by its display name. */
export function signInLines(signIn: SignInFlow, space: string): ReactNode {
  const running = signIn.running;
  if (running) {
    const link = running.flow === "browser" ? running.url : running.verificationUri;
    return <ContinueInBrowser link={link} space={space} bridge={running.flow === "browser"} />;
  }
  if (signIn.failure !== undefined) {
    return (
      <p data-testid="space-signin-error" role="alert" className="text-red-600 dark:text-red-400">
        {causePhrase(signIn.failure)}
      </p>
    );
  }
  return null;
}

/** Focus the first field of the card standing at `card`: its chooser,
 * else its address. */
export function focusCardField(card: string): void {
  document
    .querySelector<HTMLElement>(
      `[data-testid="${card}"] [data-testid="space-signin-chooser"], [data-testid="${card}"] [data-testid="space-signin-address"]`,
    )
    ?.focus();
}

/** The card's chooser state (space-115): what the reader picked and
 * typed, read against the directory and the origin that stands until
 * they choose — the default Space's, or the one a flow names. */
export function useChoice(origin: string): {
  directory: Directory;
  resolved: ResolvedChoice;
  choice: SpaceChoice;
  pick(picked: string): void;
  type(typed: string): void;
  reset(): void;
} {
  const directory = useSpaceDirectory();
  const [choice, setChoice] = useState<SpaceChoice>({});
  const resolved = resolveChoice(choice, directory, origin);
  return {
    directory,
    resolved,
    choice,
    pick: (picked) => setChoice({ picked }),
    type: (typed) => setChoice((was) => ({ ...was, picked: resolved.picked, typed })),
    reset: () => setChoice({}),
  };
}

/** The header while the home lists no Space (space-3): the card "Sign
 * in to a Space" — the chooser (space-115), the flow in flight or why it
 * ended, and Sign in, with Cancel beside it and Escape cancelling while a
 * flow runs. A start the core refuses — an address the origin rule
 * refuses, or a sign-in already running — reads its cause, the field
 * keeping its text and focus. */
export function SignInCard({
  groups,
  signIn,
  connected,
}: {
  groups: GroupsState;
  signIn: SignInFlow;
  connected: boolean;
}) {
  const { directory, resolved, pick, type } = useChoice(groups.defaultInstance);
  const url = resolved.url;
  const fieldRef = useRef<HTMLInputElement>(null);
  const chooserRef = useRef<HTMLSelectElement>(null);
  const signInRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const running = signIn.running;
  const flowing = running !== null || signIn.starting;

  // Focus never strands (DR-010 §6): Sign in, disabled while the flow
  // runs, hands focus to Cancel, which gives it back when the flow
  // ends; focus the reader put elsewhere stays there.
  const isRunning = running !== null;
  const wasRunning = useRef(isRunning);
  useEffect(() => {
    if (wasRunning.current === isRunning) return;
    wasRunning.current = isRunning;
    const active = document.activeElement;
    const stranded = !active || !active.isConnected || active === document.body || active === signInRef.current;
    if (!stranded) return;
    if (isRunning) cancelRef.current?.focus();
    else signInRef.current?.focus();
  }, [isRunning]);

  const begin = () => {
    if (!connected || flowing || !url) return;
    void signIn.start(url, "card").then((started) => {
      if (!started) (fieldRef.current ?? chooserRef.current)?.focus();
    });
  };

  // The page the flow opens is named as the reader knows the Space being
  // signed in to (space-3).
  const space = spaceNameOf(signIn.instance ?? url, groups, directory);
  const lines = signInLines(signIn, space);

  // A flow that ended failed offers the sign-in again; a start the core
  // refused ran none (space-3).
  const label = flowing ? signingInLabel() : signIn.failure !== undefined && !signIn.refused ? signInAgainLabel() : signInLabel();

  return (
    <div
      data-testid="space-signin-card"
      role="group"
      aria-label={signInTitle()}
      className="flex min-w-0 flex-col gap-2"
      onKeyDown={(event) => {
        // Escape cancels the flow in flight (space-3).
        if (event.key !== "Escape" || !running) return;
        event.stopPropagation();
        signIn.cancel();
      }}
    >
      <h2 className="text-sm font-medium">{signInTitle()}</h2>
      <SpaceChooser
        resolved={resolved}
        onPick={pick}
        onType={type}
        onEnter={begin}
        // The Space being signed in to stands while the flow runs.
        locked={flowing}
        chooserRef={chooserRef}
        fieldRef={fieldRef}
      />
      {lines ? (
        <div data-testid="space-signin-body" className="flex min-w-0 flex-col gap-1 break-words text-sm text-neutral-600 dark:text-neutral-300">
          {lines}
        </div>
      ) : null}
      <div className="flex min-w-0 flex-col gap-1 @xs:flex-row @xs:items-center @xs:gap-x-3">
        {running ? (
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
