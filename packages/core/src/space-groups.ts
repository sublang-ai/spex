// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Groups surface's view of the Git host (git-host-5, space-61,
// DR-103): one read of the person, every group and every spex
// repository the host lists, each with what decides its state — its
// archived flag and the account's role as the host reports them, its
// `spex` branch, and its members' count — held as the home's current
// view until the next read. Clones are matched to listings by the id in
// their Git configuration, else by their remote URL, never by name.
// The phrases the core composes for the host's answers live here too
// (git-host-11), each keeping the host's own words whole.

import {
  CredentialChanged,
  HostError,
  type GitHostClient,
  type HostAccount,
  type HostGroup,
  type HostRepository,
  type SignInCause,
} from "./git-host.js";
import { i18n } from "./i18n.js";
import { REPOSITORY_KEY_PATTERN } from "./protocol.js";
import { hostRefused, noLongerShared, signInAgain } from "./space-git.js";

/** One spex repository the host listed, with what its state needs. */
export interface HostListing {
  repository: HostRepository;
  /** The host's read-only answer: archived, or the account below the
   * role that may push, with the host's words (space-61). */
  readOnly: { reason: "archived" | "access"; message: string } | null;
  /** Whether the host holds its `spex` branch. */
  branchPresent: boolean;
  /** How many members the host reports, the account among them. */
  members: number | null;
}

/** The host's last answer (git-host-5). */
export interface HostView {
  readAt: number;
  displayName: string;
  gitOrigin: string;
  account: HostAccount;
  groups: HostGroup[];
  listings: HostListing[];
}

const DETAIL_CONCURRENCY = 4;

/** Run `work` over `items`, at most `limit` at a time, in order. */
async function mapLimit<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await work(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return out;
}

/**
 * Read the host in one pass (git-host-5): its name and Git origin, the
 * person, every group, every spex repository across its pages, and for
 * each its read-only and branch state and its members' count. Any
 * failure fails the whole read, so a view is never half a host.
 */
export async function readHostView(client: GitHostClient, now: () => number = Date.now): Promise<HostView> {
  const [described, account, groups, repositories] = await Promise.all([
    client.describe(),
    client.me(),
    client.groups(),
    client.repositories(),
  ]);
  const listings = await mapLimit(repositories, DETAIL_CONCURRENCY, async (repository): Promise<HostListing> => {
    const [detail, members] = await Promise.all([client.repository(repository.id), client.members(repository.id)]);
    return {
      repository,
      readOnly: detail.readOnly ?? (detail.archived ? { reason: "archived", message: "" } : null),
      branchPresent: detail.branch.present || detail.spexBranch,
      members: members.members.length,
    };
  });
  return { readAt: now(), displayName: described.displayName, gitOrigin: described.gitOrigin, account, groups, listings };
}

/** The key a listed repository's clone takes under `workspace/`: its
 * group's full path and its path, as on the host; null where the host's
 * names cannot stand as a key. */
export function hostKey(repository: HostRepository): string | null {
  const key = `${repository.group.fullPath}/${repository.path}`;
  return REPOSITORY_KEY_PATTERN.test(key) ? key : null;
}

/** Two remote URLs naming the same repository: equal but for a
 * trailing slash. */
export function sameRemote(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return false;
  const trim = (url: string): string => url.trim().replace(/\/+$/, "");
  return trim(a) === trim(b);
}

/** Whether a remote URL lies under the host's Git origin, matched as a
 * string prefix ending at a path boundary (git-host-9). */
export function underOrigin(remote: string | null, origin: string | null | undefined): boolean {
  if (!remote || !origin) return false;
  const base = origin.replace(/\/+$/, "");
  return remote === base || remote.startsWith(`${base}/`);
}

/** The listing a clone stands for: by its recorded id, else by its
 * remote URL, never by name (git-host-5). */
export function listingFor(view: Pick<HostView, "listings"> | undefined, id: string | null, remote: string | null): HostListing | undefined {
  if (!view) return undefined;
  if (id !== null) {
    const byId = view.listings.find((listing) => listing.repository.id === id);
    if (byId) return byId;
  }
  return view.listings.find((listing) => sameRemote(listing.repository.remoteUrl, remote));
}

/** The person's own group as the host lists it. */
export function userGroup(view: HostView | undefined): HostGroup | undefined {
  return view?.groups.find((group) => group.kind === "user");
}

/** Your own group's folder name for an account: its login as the host
 * spells it where that is a key segment (storage-2, space-59), else the
 * login kebab-cased. */
export function ownNameFor(login: string): string {
  if (/^[A-Za-z0-9_][A-Za-z0-9._-]*$/.test(login) && !login.endsWith("-spex")) return login;
  return login.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "me";
}

// ---------------------------------------------------------------------------
// The host's answers in the reader's words (git-host-11)

/** The host could not be reached. */
export function couldNotReach(host: string): string {
  return i18n._({ id: "Could not reach {host}", values: { host }, comment: "A stopped transfer's message; {host} is the remote's host" });
}

/** A step at the host is waiting for a member with the rights, in the
 * host's own words (space-64). */
export function waitingPhrase(step: "create" | "branch", group: string, words: string): string {
  if (step === "create") {
    return words
      ? i18n._({
          id: "Waiting for a member who can create it in {group}: {words}",
          values: { group, words },
          comment: "A spex repository's row while its creation waits; {group} is the group's full path, {words} the host's own words",
        })
      : i18n._({
          id: "Waiting for a member who can create it in {group}",
          values: { group },
          comment: "A spex repository's row while its creation waits; {group} is the group's full path",
        });
  }
  return words
    ? i18n._({
        id: "Waiting for a member who can prepare its branch in {group}: {words}",
        values: { group, words },
        comment: "A spex repository's row while its branch preparation waits; {group} is the group's full path, {words} the host's own words",
      })
    : i18n._({
        id: "Waiting for a member who can prepare its branch in {group}",
        values: { group },
        comment: "A spex repository's row while its branch preparation waits; {group} is the group's full path",
      });
}

/** A name the host reports taken (space-58). */
export function nameTaken(name: string, group: string): string {
  return i18n._({
    id: "{name} is taken in {group}; choose another name",
    values: { name, group },
    comment: "Refusal of a new spex repository's name; {name} is the whole name, {group} the group's full path",
  });
}

/** One answer of the host as the reader reads it (git-host-11): the
 * host's words kept whole wherever it carried them, nothing claimed it
 * did not say. */
export function relayHostError(error: unknown, host: string): string {
  if (error instanceof CredentialChanged) {
    return i18n._({
      id: "The sign-in changed meanwhile; try again",
      comment: "A step refused because a sign-in, a token refresh or a sign-out replaced the stored credential while it ran",
    });
  }
  if (!(error instanceof HostError)) return error instanceof Error ? error.message : String(error);
  switch (error.kind) {
    case "pending":
      return error.words
        ? i18n._({ id: "Waiting: {words}", values: { words: error.words }, comment: "A step the Git host left waiting; {words} are its own words" })
        : i18n._({ id: "Waiting", comment: "A step the Git host left waiting, with no words of its own" });
    case "name_taken":
      return i18n._({ id: "The name is taken", comment: "The Git host reports the name of a new spex repository taken" });
    case "host_refused":
    case "bad_request":
      return hostRefused(host, error.words);
    case "not_found":
      return noLongerShared();
    case "rate_limited":
      return error.retryAfter
        ? i18n._({ id: "{host} asks to wait; try again after {retry}", values: { host, retry: error.retryAfter }, comment: "The Git host's rate limit; {retry} is its own Retry-After value, kept as given" })
        : i18n._({ id: "{host} asks to wait; try again later", values: { host }, comment: "The Git host's rate limit, with no retry time of its own" });
    case "reauth":
      return signInAgain();
    case "unreachable":
    default:
      return couldNotReach(host);
  }
}

/** How a sign-in that ended without an account reads (space-3,
 * space-30); a stop the reader made reads as nothing. */
export function signInFailure(error: unknown, host: string): { cause: "denied" | "expired" | "refused" | "unreachable"; message: string } | null {
  const cause: SignInCause = error instanceof HostError && error.cause ? error.cause : error instanceof HostError && error.kind === "unreachable" ? "unreachable" : "refused";
  const words = error instanceof HostError ? error.words : null;
  switch (cause) {
    case "stopped":
      return null;
    case "denied":
      return { cause, message: i18n._({ id: "The sign-in was denied at {host}", values: { host }, comment: "A sign-in that ended because the person denied it at the Git host" }) };
    case "expired":
      return { cause, message: i18n._({ id: "The sign-in expired before it was approved", comment: "A sign-in that ended because nobody approved it in time" }) };
    case "unreachable":
      return { cause, message: couldNotReach(host) };
    case "state":
    case "refused":
    default:
      return { cause: "refused", message: hostRefused(host, words) };
  }
}

/** The description a new spex repository carries on the host
 * (git-host-6): whose records it holds and, for a project, where its
 * code lives. */
export function repositoryDescription(input: { kind: "project"; name: string; code: string | null } | { kind: "group"; group: string }): string {
  if (input.kind === "group") {
    return i18n._({ id: "Spex records of the group {group}", values: { group: input.group }, comment: "A group's new spex repository's description on the Git host" });
  }
  return input.code
    ? i18n._({ id: "Spex records of {name}; its code is at {code}", values: { name: input.name, code: input.code }, comment: "A project's new spex repository's description on the Git host; {code} is the code's remote URL" })
    : i18n._({ id: "Spex records of {name}", values: { name: input.name }, comment: "A project's new spex repository's description on the Git host, its code on no remote" });
}

/** The page the loopback answers the browser with (git-host-2), in the
 * reader's language. */
export function callbackPage(title: string, text: string): string {
  const escape = (value: string): string => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c] ?? c);
  return `<!doctype html><html lang="${escape(i18n.locale || "en")}"><head><meta charset="utf-8"><title>${escape(title)}</title></head><body><h1>${escape(title)}</h1><p>${escape(text)}</p></body></html>`;
}

/** Both callback pages, composed when a sign-in starts. */
export function callbackPages(): { complete: string; failed: string } {
  return {
    complete: callbackPage(
      i18n._({ id: "Signed in", comment: "The browser page's title once a sign-in completed" }),
      i18n._({ id: "Spex is signed in. You may close this browser window.", comment: "The browser page once a sign-in completed" }),
    ),
    failed: callbackPage(
      i18n._({ id: "Not signed in", comment: "The browser page's title once a sign-in failed" }),
      i18n._({ id: "Spex did not sign in. You may close this browser window and return to Spex.", comment: "The browser page once a sign-in failed" }),
    ),
  };
}
