// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The registry a heading of the Packages tab uses, and the person's
// sign-in there (playbook-library-119, DR-168, DR-172): "Registry:
// <display name> ▾", a chooser of the directory's registries whose last
// entry, "Other…", reveals a field for a registry's address, the choice
// written as the `registry` of that heading's spex.yaml; beside it
// "@<login>" with Sign out, or "Sign in" titled "For publishing and
// private packages", its flow cancellable and continuing in the browser,
// a refusal in place. The registry account is its own grant: signing in
// or out here changes no Space sign-in, and a Space sign-in grants
// nothing here.

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import type { RegistryState } from "@sublang/spex-core/protocol";

import { usePlaceStore } from "../state/place-context.js";
import { openExternalBridge } from "../lib/space.js";
import { hostNameOf } from "../lib/instances.js";
import { usePopover } from "../lib/usePopover.js";
import { i18n } from "../i18n.js";
import { Icon } from "./Icon.js";
import { useSpaceDirectory, type Directory } from "./SpaceDirectory.js";
import { ContinueInBrowser, causePhrase, signInLabel, signingInLabel } from "./SpaceSignIn.js";

const BUTTON =
  "min-h-6 shrink-0 whitespace-nowrap rounded border border-neutral-300 px-1.5 py-0.5 text-xs hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800";
const QUIET =
  "min-h-6 shrink-0 whitespace-nowrap rounded px-1 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-neutral-800 dark:hover:text-neutral-300";
const ALERT =
  "rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 [overflow-wrap:anywhere] dark:border-red-900 dark:bg-red-950 dark:text-red-300";
const MENU_ITEM =
  "flex min-h-6 w-full min-w-0 items-center gap-1.5 rounded px-2 py-1 text-left text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800";

/** A registry sign-in in flight, as the start replied it. */
type RegistryFlow = { flow: "browser"; url: string } | { flow: "device"; verificationUri: string };

/** "For publishing and private packages": what signing in to a
 * registry is for, as its Sign in's title (playbook-library-119). */
export const registrySignInTitle = (): string =>
  i18n._({
    id: "For publishing and private packages",
    comment: "the title of Sign in on a registry: what signing in to the registry is for",
  });

/** A registry by the name the reader knows it by: the name its own
 * description gives, else the directory's, else its host name. */
export function registryNameOf(origin: string, state: RegistryState | undefined, directory: Directory): string {
  if (state?.displayName) return state.displayName;
  const listed = directory.status === "read" ? directory.spaces.find((space) => space.origin === origin) : undefined;
  return listed?.displayName ?? hostNameOf(origin);
}

/** The person's account at the registry of `origin` and its sign-in:
 * the state the core broadcasts, else the one `read` asked for once;
 * a flow this control started reads as running until the state says
 * otherwise. Each act reports a refusal as `error`. */
export function useRegistrySignIn(origin: string | undefined, { read = false }: { read?: boolean } = {}) {
  const store = usePlaceStore();
  const broadcast = store((state) => (origin ? state.registryAccounts?.[origin] : undefined));
  const [answered, setAnswered] = useState<RegistryState>();
  const [started, setStarted] = useState<RegistryFlow>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  // The account there, read without credentials (core-service-143); the
  // core's broadcast keeps it current.
  useEffect(() => {
    if (!read || !origin) return;
    let active = true;
    void Promise.resolve()
      .then(() => store.getClient().command("registry.get", { origin }))
      .then((reply) => {
        if (active) setAnswered(reply as RegistryState);
      })
      .catch((cause: Error) => {
        if (active) setError(causePhrase(cause.message));
      });
    return () => {
      active = false;
    };
  }, [read, origin, store]);

  const state = broadcast ?? (answered?.origin === origin ? answered : undefined);
  const login = state?.account?.login;
  const phase = state?.signIn?.phase;
  // A flow the state stops — signed in, cancelled or failed — ends the
  // one this control started.
  const lastPhase = useRef(phase);
  useEffect(() => {
    if (lastPhase.current === "running" && phase !== "running") setStarted(undefined);
    lastPhase.current = phase;
  }, [phase]);
  useEffect(() => {
    if (login) setStarted(undefined);
  }, [login]);

  const fromState = state?.signIn?.phase === "running" ? state.signIn : undefined;
  const running: RegistryFlow | undefined = fromState
    ? fromState.flow === "browser"
      ? { flow: "browser", url: fromState.url }
      : { flow: "device", verificationUri: fromState.verificationUri }
    : login
      ? undefined
      : started;

  async function start(): Promise<void> {
    if (!origin || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const reply = (await store.getClient().command("registry.signin.start", { origin })) as
        | { flow: "browser"; url: string }
        | { flow: "device"; verificationUri: string };
      if (reply?.flow === "browser") {
        setStarted({ flow: "browser", url: reply.url });
        await openExternalBridge()?.(reply.url).catch(() => false);
      } else if (reply?.flow === "device") {
        setStarted({ flow: "device", verificationUri: reply.verificationUri });
      }
    } catch (cause) {
      setError(causePhrase((cause as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(): Promise<void> {
    if (!origin) return;
    setStarted(undefined);
    try {
      await store.getClient().command("registry.signin.cancel", { origin });
    } catch (cause) {
      setError(causePhrase((cause as Error).message));
    }
  }

  async function signOut(): Promise<void> {
    if (!origin || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await store.getClient().command("registry.signout", { origin });
    } catch (cause) {
      setError(causePhrase((cause as Error).message));
    } finally {
      setBusy(false);
    }
  }

  const failure = error ?? (state?.error && !login && !running ? causePhrase(state.error) : undefined);
  return { state, login, running, busy, error: failure, start, cancel, signOut };
}

/** "Continue in your browser · Open <registry>" while a registry
 * sign-in runs (playbook-library-119). */
export function RegistryFlowLine({ running, name, testId }: { running: RegistryFlow; name: string; testId: string }) {
  return (
    <div className="text-xs text-neutral-600 dark:text-neutral-300">
      <ContinueInBrowser
        testId={testId}
        link={running.flow === "browser" ? running.url : running.verificationUri}
        space={name}
        bridge={running.flow === "browser"}
      />
    </div>
  );
}

/** The registry and the account of one heading's spex.yaml
 * (playbook-library-119). Its parts join the heading's own line; what
 * a choice or a flow adds — the address field, the flow's line, a
 * refusal — wraps onto a line of its own beneath it. */
export function RegistryAccount({ repository }: { repository: string }) {
  const store = usePlaceStore();
  const registry = store((state) => state.environments[repository]?.registry);
  if (!registry) return null;
  return <RegistryHeading key={registry.origin} repository={repository} origin={registry.origin} legacy={registry.legacy} />;
}

function RegistryHeading({ repository, origin, legacy }: { repository: string; origin: string; legacy: boolean }) {
  const store = usePlaceStore();
  const directory = useSpaceDirectory();
  const account = useRegistrySignIn(origin, { read: true });
  const name = registryNameOf(origin, account.state, directory);
  const [other, setOther] = useState(false);
  const [address, setAddress] = useState("");
  const [choosing, setChoosing] = useState(false);
  const [refusal, setRefusal] = useState<string>();
  const addressRef = useRef<HTMLInputElement>(null);
  const chooserRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (other) addressRef.current?.focus();
  }, [other]);

  async function choose(next: string): Promise<void> {
    setRefusal(undefined);
    // A spex.yaml naming no registry keeps its former destination until
    // one is chosen, the one it reads included (environments-38).
    if (next === origin && !legacy) {
      setOther(false);
      return;
    }
    setChoosing(true);
    try {
      await store.getClient().command("environment.registry.set", { repository, origin: next });
      setOther(false);
      setAddress("");
    } catch (cause) {
      setRefusal(causePhrase((cause as Error).message));
    } finally {
      setChoosing(false);
    }
  }

  const registries =
    directory.status === "read"
      ? directory.spaces.map((space) => ({ origin: space.origin, name: space.displayName }))
      : [];
  if (!registries.some((entry) => entry.origin === origin)) registries.unshift({ origin, name });

  const failure = refusal ?? account.error;
  return (
    <span data-testid="registry-account" className="contents">
      <RegistryChooser
        label={i18n._({
          id: "Registry: {registry}",
          values: { registry: name },
          comment: "a Packages tab heading's registry chooser: the registry its spex.yaml names, by its display name; it opens the list of registries",
        })}
        current={origin}
        registries={registries}
        disabled={choosing}
        buttonRef={chooserRef}
        onChoose={(next) => void choose(next)}
        onOther={() => {
          setRefusal(undefined);
          setOther(true);
        }}
      />
      {account.login ? (
        <span className="flex shrink-0 items-center gap-1 text-xs text-neutral-600 dark:text-neutral-300">
          <span data-testid="registry-login" className="max-w-[12rem] truncate" title={`@${account.login}`}>
            @{account.login}
          </span>
          <span aria-hidden className="text-neutral-400">
            ·
          </span>
          <button
            type="button"
            data-testid="registry-signout"
            disabled={account.busy}
            onClick={() => void account.signOut()}
            className={QUIET}
          >
            {i18n._({ id: "Sign out", comment: "sign out of a Space or a registry" })}
          </button>
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            data-testid="registry-signin"
            disabled={account.busy || account.running !== undefined}
            title={registrySignInTitle()}
            onClick={() => void account.start()}
            className={BUTTON}
          >
            {account.running || account.busy ? signingInLabel() : signInLabel()}
          </button>
          {account.running ? (
            <button type="button" data-testid="registry-cancel" onClick={() => void account.cancel()} className={QUIET}>
              {i18n._({ id: "Cancel", comment: "leave the editor without changing anything" })}
            </button>
          ) : null}
        </span>
      )}
      {other || account.running || failure ? (
        <span className="order-last flex basis-full flex-col gap-1">
          {other ? (
            <form
              data-testid="registry-other"
              className="flex min-w-0 flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const typed = address.trim();
                if (typed) void choose(typed);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setOther(false);
                  chooserRef.current?.focus();
                }
              }}
            >
              <input
                ref={addressRef}
                data-testid="registry-address"
                type="url"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="https://…"
                aria-label={i18n._({
                  id: "Registry address",
                  comment: "the field Other… reveals in a Packages tab heading's registry chooser: a registry's address, such as https://spex.sublang.ai",
                })}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
              />
              <button type="submit" data-testid="registry-use" disabled={choosing || !address.trim()} className={BUTTON}>
                {i18n._({ id: "Use", comment: "use the registry at the address typed for this heading's spex.yaml" })}
              </button>
              <button
                type="button"
                data-testid="registry-other-cancel"
                onClick={() => {
                  setOther(false);
                  chooserRef.current?.focus();
                }}
                className={QUIET}
              >
                {i18n._({ id: "Cancel", comment: "leave the editor without changing anything" })}
              </button>
            </form>
          ) : null}
          {account.running ? <RegistryFlowLine running={account.running} name={name} testId="registry-signin" /> : null}
          {failure ? (
            <span role="alert" data-testid="registry-account-error" className={ALERT}>
              {failure}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

/** "Registry: <name> ▾": the directory's registries by display name,
 * the current one checked, then "Other…" (playbook-library-119), as a
 * menu in the house popover idiom. */
function RegistryChooser({
  label,
  current,
  registries,
  disabled,
  buttonRef,
  onChoose,
  onOther,
}: {
  label: string;
  current: string;
  registries: { origin: string; name: string }[];
  disabled: boolean;
  buttonRef: RefObject<HTMLButtonElement | null>;
  onChoose(origin: string): void;
  onOther(): void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const menuRef = usePopover<HTMLDivElement>(open, { anchorRef: buttonRef, onClose: () => setOpen(false), menu: true });
  return (
    <span className="relative inline-flex min-w-0 shrink">
      <button
        ref={buttonRef}
        type="button"
        data-testid="registry-chooser"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((was) => !was)}
        className="flex min-h-6 min-w-0 items-center gap-0.5 rounded px-1 text-xs text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        <span className="min-w-0 truncate">{label}</span>
        <Icon name="caretDown" className="h-3 w-3 shrink-0" />
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          data-testid="registry-chooser-menu"
          className="absolute left-0 top-full z-20 mt-0.5 flex w-max min-w-40 max-w-[16rem] flex-col rounded-md border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
        >
          {registries.map((entry) => (
            <button
              key={entry.origin}
              type="button"
              role="menuitemradio"
              aria-checked={entry.origin === current}
              data-testid={`registry-choice-${entry.origin}`}
              className={MENU_ITEM}
              onClick={() => {
                setOpen(false);
                onChoose(entry.origin);
              }}
            >
              <span aria-hidden className="w-3 shrink-0 text-brand-600 dark:text-brand-300">
                {entry.origin === current ? "✓" : ""}
              </span>
              <span className="min-w-0 truncate">{entry.name}</span>
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            data-testid="registry-choice-other"
            className={MENU_ITEM}
            onClick={() => {
              setOpen(false);
              onOther();
            }}
          >
            <span aria-hidden className="w-3 shrink-0" />
            <span className="min-w-0 truncate">
              {i18n._({ id: "Other…", comment: "a registry chooser's last entry: reveals a field for a registry the list does not hold" })}
            </span>
          </button>
        </div>
      ) : null}
    </span>
  );
}
