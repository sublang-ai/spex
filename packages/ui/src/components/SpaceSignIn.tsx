// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Signing in to an instance from the Groups surface (space-3, DR-103,
// DR-127): while the home lists no instance, the header is one card
// with the field captioned "Instance", holding the default instance's
// origin until the reader edits it, Sign in starting the sign-in at the
// origin it holds; while it lists any, "Add instance…" at the list's
// foot opens the same card in its place, and a signed-out instance's
// heading starts it again at its own origin (SpaceInstance). Wherever
// it started, the flow in flight reads there: on the desktop the
// browser flow opens the instance's page through the native bridge
// (app-shell-37), offering it again; where no bridge opened it, and on
// the served page's device flow, it links the page to finish at — the
// device flow's link carries the code, which is never shown — named by
// the host name of the origin being signed in to. The outcome is state:
// the surface reads `signIn` and the instances as the core sends them
// and keeps only the start's reply, which state does not carry.

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { CommandResults, GroupsState } from "@sublang/spex-core/protocol";

import { usePlaceStore } from "../state/place-context.js";
import { i18n } from "../i18n.js";
import { hostNameOf, instanceOf, originOf } from "../lib/instances.js";
import { openExternalBridge } from "../lib/space.js";
import { PRIMARY, SECONDARY, type Note } from "./SpaceSurface.js";

type StartReply = CommandResults["space.signin.start"];

/** Where a sign-in reads (space-3): the card, or the heading of the
 * instance at that origin. */
export type SignInAt = "card" | string;

/** The sign-in as the surface draws it: what the core's state says,
 * filled in with the start's reply. */
export interface SignInFlow {
  /** Where the flow starting, running or failed reads: where this page
   * started it; for one another client started, the heading of the
   * instance it names where the home lists it, else the card. Undefined
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
  /** Start the sign-in at the instance the URL names (space-29), its
   * flow reading at `at`; resolves whether a flow started. */
  start(url: string, at?: SignInAt): Promise<boolean>;
  cancel(): void;
}

/** The one sign-in of the surface (space-3, git-host-2): at most one
 * runs, whichever instance it names. */
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
  // An instance newly signed in ends the one flow there is; the flow's
  // controls are gone with it, so focus lands on that instance heading's
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
          throw new Error(i18n._("The sign-in did not start"));
        }
        if (reply.flow === "browser") {
          // The desktop opens the instance's page in the system
          // browser; a page with no bridge, or one the shell refused,
          // shows the URL as a link instead (app-shell-37).
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
        // A URL the origin rule refuses, or a sign-in already running,
        // starts no flow (space-3, git-host-2): its cause stands.
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
const FIELD =
  "min-w-0 flex-1 rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-sm read-only:text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900";

/** The words of "Sign in again" wherever it stands (space-3): a failed
 * flow's control, and a signed-out instance's heading's. */
export const signInAgainLabel = (): string =>
  i18n._({
    id: "Sign in again",
    comment: "the sign-in control on a signed-out instance's heading, and the card's after a sign-in failed",
  });

/** The words of a sign-in control while its flow runs (space-3). */
export const signingInLabel = (): string =>
  i18n._({ id: "Signing in…", comment: "the Sign in control, while the sign-in runs" });

/** What the sign-in reads where its flow stands (space-3): on the
 * desktop, that the browser is open at the host name, with "Open it
 * again" through the bridge; where no bridge opened it, and in the
 * device flow, the page to finish at as a link — the device flow's URL
 * carries the code, so nothing is typed (git-host-3); a flow that ended
 * without an account, or a start the core refused, its cause as one
 * sentence. Null while no flow starts, runs or stands failed. `site` is
 * the host name of the origin being signed in to. */
export function signInLines(signIn: SignInFlow, site: string): ReactNode {
  const running = signIn.running;
  const finish = i18n._("Sign in there and approve; you return here signed in.");
  if (running?.flow === "browser" && (running.opened || !running.url)) {
    const link = running.url;
    return (
      <p data-testid="space-signin-opened">
        {i18n._("Your browser is open at {site}: sign in there and approve; you return here signed in.", { site })}{" "}
        {link ? (
          <a
            data-testid="space-signin-link"
            href={link}
            target="_blank"
            rel="noreferrer"
            className={LINK_CLASS}
            onClick={(event) => {
              // The system browser again, as the start opened it
              // (app-shell-37); the link's own target where no bridge.
              const open = openExternalBridge();
              if (!open) return;
              event.preventDefault();
              void open(link);
            }}
          >
            {i18n._("Open it again")}
          </a>
        ) : null}
      </p>
    );
  }
  if (running) {
    const link = running.flow === "browser" ? running.url : running.verificationUri;
    return (
      <>
        <p data-testid="space-signin-finish">{i18n._("Continue in your browser:")}</p>
        {link ? (
          <a data-testid="space-signin-link" href={link} target="_blank" rel="noreferrer" className={LINK_CLASS}>
            {i18n._("Open {site} to sign in", { site })}
          </a>
        ) : null}
        <p>{finish}</p>
      </>
    );
  }
  if (signIn.failure !== undefined) {
    return (
      <p data-testid="space-signin-error" role="alert" className="text-red-600 dark:text-red-400">
        {i18n._({
          id: "{cause}.",
          values: { cause: signIn.failure.replace(/[.。]\s*$/, "") },
          comment: "the sign-in's cause, a phrase the core sends without its final stop, as one sentence",
        })}
      </p>
    );
  }
  return null;
}

/** The sign-in card's field captioned "Instance" (space-3): the URL of
 * the instance to sign in to, Enter starting the sign-in. Wherever the
 * card stands — the header, or the list's foot in place of "Add
 * instance…" — the field reads the same. */
export function InstanceField({
  inputRef,
  value,
  onChange,
  onEnter,
  readOnly,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange(value: string): void;
  onEnter(): void;
  readOnly: boolean;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm @xs:flex-row @xs:items-center @xs:gap-x-2">
      <span className="shrink-0 text-xs text-neutral-500">
        {i18n._({
          id: "Instance",
          comment: "the sign-in card's field caption: the URL of the instance to sign in to, held by its origin (https://spex.sublang.ai)",
        })}
      </span>
      <input
        ref={inputRef}
        data-testid="space-signin-instance"
        type="url"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onEnter();
        }}
        readOnly={readOnly}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        className={FIELD}
      />
    </label>
  );
}

/** The header while the home lists no instance (space-3): one card
 * saying what signing in brings, or the flow in flight, or why it ended;
 * the field captioned "Instance", holding the default instance's origin
 * until the reader edits it, and Sign in, starting the sign-in at the
 * origin it holds, with Cancel beside it and Escape cancelling while a
 * flow runs. A start the core refuses — a URL the origin rule refuses,
 * or a sign-in already running — reads its cause as one sentence, the
 * field keeping its text and focus. */
export function SignInCard({
  groups,
  signIn,
  connected,
}: {
  groups: GroupsState;
  signIn: SignInFlow;
  connected: boolean;
}) {
  // What the reader typed; until then the field holds the default
  // instance's origin (space-3, storage-2).
  const [typed, setTyped] = useState<string>();
  const field = typed ?? groups.defaultInstance;
  const url = field.trim();
  const fieldRef = useRef<HTMLInputElement>(null);
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
      if (!started) fieldRef.current?.focus();
    });
  };

  // The page the flow opens is named by the host name of the origin
  // being signed in to (space-3).
  const body = signInLines(signIn, hostNameOf(signIn.instance ?? url)) ?? (
    <>
      <p data-testid="space-signin-caption">
        {i18n._("Sign in to see your groups and share each project's records with the people in them.")}
      </p>
      <p>{i18n._("Until you do, everything stays on this device and nothing is contacted.")}</p>
    </>
  );

  // A flow that ended failed offers the sign-in again; a start the core
  // refused ran none (space-3).
  const label = flowing
    ? signingInLabel()
    : signIn.failure !== undefined && !signIn.refused
      ? signInAgainLabel()
      : i18n._({ id: "Sign in", comment: "sign in to an instance" });

  return (
    <div
      data-testid="space-signin-card"
      className="flex min-w-0 flex-col gap-2"
      onKeyDown={(event) => {
        // Escape cancels the flow in flight (space-3).
        if (event.key !== "Escape" || !running) return;
        event.stopPropagation();
        signIn.cancel();
      }}
    >
      <h2 className="text-sm font-medium">{i18n._("Not signed in")}</h2>
      <div data-testid="space-signin-body" className="flex min-w-0 flex-col gap-1 break-words text-sm text-neutral-600 dark:text-neutral-300">
        {body}
      </div>
      <InstanceField
        inputRef={fieldRef}
        value={field}
        onChange={setTyped}
        onEnter={begin}
        // The origin being signed in to stands while the flow runs.
        readOnly={flowing}
      />
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
          title={url ? i18n._("Signs in to {host}", { host: hostNameOf(url) }) : undefined}
          onClick={begin}
        >
          {label}
        </button>
      </div>
    </div>
  );
}
