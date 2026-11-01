// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Spaces the sign-in card chooses from (space-115, environments-39,
// DR-168, DR-172): the public registry's directory, read once per core
// connection. A choice stands before a field: one chooser lists each
// Space by its display name, the chosen one's sign-in providers beside
// it as icons titled with their names, and a last entry "Other Space…"
// reveals the field "Space address"; where no directory can be read the
// field stands alone. A directory entry only offers an address — every
// choice still runs its own sign-in, and no entry confers trust.

import { useCallback, useEffect, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import type { GroupsState } from "@sublang/spex-core/protocol";

import { usePlaceStore } from "../state/place-context.js";
import { i18n } from "../i18n.js";
import { hostNameOf, instanceOf } from "../lib/instances.js";

/** One Space the directory lists (environments-39). */
export interface DirectorySpace {
  origin: string;
  displayName: string;
  /** Its sign-in providers, as the directory names them (`github`,
   * `gitlab`). */
  signIn: string[];
}

/** The directory as the surface knows it: still being read, read, or
 * not readable. */
export type Directory =
  | { status: "reading" }
  | { status: "read"; spaces: DirectorySpace[] }
  | { status: "failed" };

interface DirectoryRead {
  value: Directory;
  inFlight: boolean;
  listeners: Set<() => void>;
}

/** One read per core connection: the place's client keys it, so a new
 * connection — and each test's own client — reads afresh. */
const READS = new WeakMap<object, DirectoryRead>();
const NONE: DirectoryRead = { value: { status: "failed" }, inFlight: false, listeners: new Set() };

function readOf(client: object | undefined): DirectoryRead {
  if (!client) return NONE;
  let entry = READS.get(client);
  if (!entry) {
    entry = { value: { status: "reading" }, inFlight: false, listeners: new Set() };
    READS.set(client, entry);
  }
  return entry;
}

function settle(entry: DirectoryRead, value: Directory): void {
  entry.value = value;
  for (const listener of entry.listeners) listener();
}

function validSpaces(reply: unknown): DirectorySpace[] | undefined {
  const spaces = (reply as { spaces?: unknown } | undefined)?.spaces;
  if (!Array.isArray(spaces)) return undefined;
  const valid = spaces.every(
    (space) =>
      typeof space?.origin === "string" &&
      typeof space?.displayName === "string" &&
      Array.isArray(space?.signIn) &&
      space.signIn.every((provider: unknown) => typeof provider === "string"),
  );
  return valid ? (spaces as DirectorySpace[]) : undefined;
}

/** The place's client, where one is set. */
type DirectoryClient = { command(type: "registry.directory", fields: Record<string, never>): Promise<unknown> };
function clientOf(store: { getClient(): unknown }): DirectoryClient | undefined {
  try {
    return store.getClient() as DirectoryClient;
  } catch {
    return undefined;
  }
}

/** The directory of Spaces (environments-39), read where it has not been
 * — again on a later mount where the last read failed, a failure
 * standing until a read succeeds, so nothing flickers. */
export function useSpaceDirectory(): Directory {
  const store = usePlaceStore();
  const client = clientOf(store);
  const entry = readOf(client);
  const subscribe = useCallback(
    (listener: () => void) => {
      entry.listeners.add(listener);
      return () => {
        entry.listeners.delete(listener);
      };
    },
    [entry],
  );
  const value = useSyncExternalStore(subscribe, () => entry.value);
  useEffect(() => {
    if (!client || entry === NONE || entry.inFlight || entry.value.status === "read") return;
    entry.inFlight = true;
    void Promise.resolve()
      .then(() => client.command("registry.directory", {}))
      .then((reply) => {
        const spaces = validSpaces(reply);
        settle(entry, spaces ? { status: "read", spaces } : { status: "failed" });
      })
      .catch(() => settle(entry, { status: "failed" }))
      .finally(() => {
        entry.inFlight = false;
      });
  }, [client, entry]);
  return value;
}

/** A Space by the name the reader knows it by (space-3): the display name
 * the home or the directory gives its origin, else its host name. */
export function spaceNameOf(origin: string, groups?: GroupsState, directory?: Directory): string {
  const listed = groups ? instanceOf(groups, origin) : undefined;
  if (listed?.displayName) return listed.displayName;
  const entry = directory?.status === "read" ? directory.spaces.find((space) => space.origin === origin) : undefined;
  return entry?.displayName ?? listed?.host ?? hostNameOf(origin);
}

/** The chooser's last entry, revealing the field (space-115). */
export const OTHER = "other";

/** What the reader did with the chooser: an entry picked by its origin,
 * or "Other Space…", and what they typed in the field. */
export interface SpaceChoice {
  picked?: string;
  typed?: string;
}

/** What the chooser shows (space-115): the entries, the one chosen, the
 * field's text, and the URL Sign in starts at. */
export interface ResolvedChoice {
  spaces: DirectorySpace[];
  /** No directory to choose from: the field stands alone. */
  alone: boolean;
  /** The entry chosen: an origin, or OTHER. */
  picked: string;
  /** The field's text, while it shows. */
  field: string;
  /** Whether the field holds what the reader picked "Other Space…" for,
   * empty, with its placeholder. */
  fresh: boolean;
  /** The URL the sign-in starts at, trimmed; empty while none. */
  url: string;
}

/** The chooser's reading of a choice (space-115): the entry of `origin` —
 * the default instance's, or the origin a flow names — preselected where
 * the directory lists it, else "Other Space…" with the field holding that
 * origin; the field alone, holding it, where no directory can be read;
 * the reader's own pick of "Other Space…" showing the field empty. */
export function resolveChoice(choice: SpaceChoice, directory: Directory, origin: string): ResolvedChoice {
  const spaces = directory.status === "read" ? directory.spaces : [];
  if (spaces.length === 0) {
    const field = choice.typed ?? origin;
    return { spaces, alone: true, picked: OTHER, field, fresh: false, url: field.trim() };
  }
  const known = (candidate: string | undefined): candidate is string =>
    candidate === OTHER || spaces.some((space) => space.origin === candidate);
  const picked = known(choice.picked) ? choice.picked : spaces.some((space) => space.origin === origin) ? origin : OTHER;
  if (picked !== OTHER) return { spaces, alone: false, picked, field: "", fresh: false, url: picked };
  const own = choice.picked === OTHER;
  const field = choice.typed ?? (own ? "" : origin);
  return { spaces, alone: false, picked, field, fresh: own, url: field.trim() };
}

/** A provider's name as its icon's title reads it (space-115). */
function providerName(provider: string): string {
  const known: Record<string, string> = { github: "GitHub", gitlab: "GitLab" };
  return known[provider.toLowerCase()] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
}

function providerGlyph(provider: string): ReactNode {
  switch (provider.toLowerCase()) {
    case "github":
      return (
        <path
          fill="currentColor"
          stroke="none"
          d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
        />
      );
    case "gitlab":
      return <path fill="currentColor" stroke="none" d="M8 14.6 1 9.5l1.3-6.8 2.2 5.2h7l2.2-5.2L15 9.5Z" />;
    default:
      return <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />;
  }
}

/** A Space's sign-in providers as icons, each titled with the accounts
 * it takes (space-115): "Accepts GitHub accounts"; no icon is a control. */
export function ProviderIcons({ providers }: { providers: readonly string[] }) {
  if (providers.length === 0) return null;
  return (
    <span data-testid="space-signin-providers" className="flex shrink-0 items-center gap-1 text-neutral-500">
      {providers.map((provider) => {
        const label = i18n._({
          id: "Accepts {provider} accounts",
          values: { provider: providerName(provider) },
          comment: "the title of a sign-in provider's icon beside a Space in the sign-in card's chooser, an icon and not a button: the Space takes accounts of that provider; {provider} is its name, such as GitHub",
        });
        return (
          <span key={provider} role="img" aria-label={label} title={label} data-provider={provider} className="inline-flex">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
              {providerGlyph(provider)}
            </svg>
          </span>
        );
      })}
    </span>
  );
}

const FIELD =
  "min-w-0 flex-1 rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-sm read-only:text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900";
const SELECT =
  "min-w-0 max-w-full flex-1 rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-sm disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900";

/** The sign-in card's chooser (space-115): the directory's Spaces by
 * display name with the chosen one's providers beside it, then "Other
 * Space…", which reveals the field "Space address"; the field alone where
 * no directory can be read. Enter in the field starts the sign-in. While
 * a flow runs, the choice stands. */
export function SpaceChooser({
  resolved,
  onPick,
  onType,
  onEnter,
  locked,
  chooserRef,
  fieldRef,
}: {
  resolved: ResolvedChoice;
  onPick(picked: string): void;
  onType(typed: string): void;
  onEnter(): void;
  /** A flow runs: the choice stands. */
  locked: boolean;
  chooserRef?: RefObject<HTMLSelectElement | null>;
  fieldRef?: RefObject<HTMLInputElement | null>;
}) {
  const chosen = resolved.spaces.find((space) => space.origin === resolved.picked);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {resolved.alone ? null : (
        <div className="flex min-w-0 items-center gap-2">
          <select
            ref={chooserRef}
            data-testid="space-signin-chooser"
            aria-label={i18n._({ id: "Space", comment: "the accessible name of the sign-in card's chooser of Spaces" })}
            value={resolved.picked}
            disabled={locked}
            onChange={(event) => onPick(event.target.value)}
            className={SELECT}
          >
            {resolved.spaces.map((space) => (
              <option key={space.origin} value={space.origin}>
                {space.displayName}
              </option>
            ))}
            <option value={OTHER}>
              {i18n._({ id: "Other Space…", comment: "the sign-in card chooser's last entry: reveals the field for a Space the directory does not list" })}
            </option>
          </select>
          {chosen ? <ProviderIcons providers={chosen.signIn} /> : null}
        </div>
      )}
      {resolved.picked === OTHER ? (
        <label className="flex min-w-0 flex-col gap-1 text-sm @xs:flex-row @xs:items-center @xs:gap-x-2">
          <span className="shrink-0 text-xs text-neutral-500">
            {i18n._({ id: "Space address", comment: "the sign-in card's field caption: the address of the Space to sign in to, such as https://spex.sublang.ai" })}
          </span>
          <input
            ref={fieldRef}
            data-testid="space-signin-address"
            type="url"
            value={resolved.field}
            placeholder="https://…"
            onChange={(event) => onType(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onEnter();
            }}
            readOnly={locked}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            className={FIELD}
          />
        </label>
      ) : null}
    </div>
  );
}
