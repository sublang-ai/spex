// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Personal Space catalog, repository identity matching and display text.
import {
  CredentialChanged,
  HostError,
  retryAfterSeconds,
  type GitHostClient,
  type HostAccount,
  type HostDescription,
  type HostRepository,
  type SignInCause,
} from "@sublang/spex/git-host";
import { kebab } from "./home.js";
import { i18n } from "./i18n.js";
import { INSTANCE_FOLDER_PATTERN, REPOSITORY_KEY_PATTERN } from "./protocol.js";
import { hostRefused, noLongerShared, signInAgain } from "./space-git.js";

/** One spex repository the host listed, with what its state needs. */
export interface HostListing {
  repository: HostRepository;
  /** The host's read-only answer: archived, or the account below the
   * role that may push, with the host's words (space-61). */
  readOnly: { reason: "archived" | "access"; message: string } | null;
  /** Whether the host holds its `spex` branch. */
  branchPresent: boolean;
}

/** A Space’s account and the catalog entries owned by that account. */
export interface HostCatalog {
  displayName: string;
  gitOrigin: string;
  account: HostAccount;
  repositories: HostRepository[];
}

export interface HostView extends Omit<HostCatalog, "repositories"> {
  readAt: number;
  listings: HostListing[];
}

const DETAIL_CONCURRENCY = 4;

/** Shared only by the work of one read. The wrapper also keeps an
 * undefined rejection distinguishable from no failure. */
interface ReadWork { failure?: { reason: unknown } }

/** Observe the first failure immediately, but settle only after every
 * started sibling has drained (git-host-5). */
async function drainRead<T extends readonly unknown[]>(work: { [K in keyof T]: Promise<T[K]> }): Promise<T> {
  const state: ReadWork = {};
  const answers = await Promise.all(work.map(async (promise) => {
    try { return await promise; }
    catch (reason) { state.failure ??= { reason }; }
  }));
  if (state.failure) throw state.failure.reason;
  // Every result is present when no work failed; map preserves tuple order.
  return answers as unknown as T;
}

/** Run `work` over `items`, at most `limit` at a time, in order. */
async function mapLimit<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const state: ReadWork = {};
  const lane = async (): Promise<void> => {
    while (!state.failure && next < items.length) {
      const index = next;
      next += 1;
      try { out[index] = await work(items[index]); }
      catch (reason) { state.failure ??= { reason }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  if (state.failure) throw state.failure.reason;
  return out;
}

/** Read the catalog and enrich only personal repositories. */
export async function readHostView(client: GitHostClient, onDescription: (description: HostDescription) => void): Promise<HostView> {
  const { repositories, ...catalog } = await readHostCatalog(client, onDescription, true);
  const listings = await mapLimit(repositories, DETAIL_CONCURRENCY, (repository) =>
    readHostListing(client, repository.id, catalog.account, { retryRead: true }));
  return { ...catalog, readAt: Date.now(), listings: listings.filter((listing) => listing !== undefined) };
}

/** Read identity and the projects the Space attributes to that account. */
export async function readHostCatalog(
  client: GitHostClient,
  onDescription: (description: HostDescription) => void,
  retryRead = false,
): Promise<HostCatalog> {
  const wait = { wait: true };
  const essentials = { ...wait, retryRead };
  const description = client.describe(wait).then((value) => { onDescription(value); return value; });
  const [described, account, repositories] = await drainRead([
    description, client.me(essentials), client.repositories(essentials),
  ] as const);
  return { ...described, account, repositories: repositories.filter((repository) => ownsHostRepository(account, repository)) };
}

/** An account's namespace is distinct from a group with the same path. */
export function ownsHostRepository(account: Pick<HostAccount, "login">, repository: HostRepository): boolean {
  return repository.group.kind === "user" && sameLogin(repository.group.fullPath, account.login);
}

/** Details are authoritative when a repository moved during discovery. */
export async function readHostListing(
  client: GitHostClient,
  id: string,
  account: Pick<HostAccount, "login">,
  options: { retryRead?: boolean; signal?: AbortSignal } = {},
): Promise<HostListing | undefined> {
  const detail = await client.repository(id, { wait: true, ...options }).catch((error: unknown) => {
    if (error instanceof HostError && error.kind === "not_found") return undefined;
    throw error;
  });
  if (!detail) return undefined;
  if (detail.id !== id || !ownsHostRepository(account, detail)) return undefined;
  return {
    repository: detail,
    readOnly: detail.readOnly ?? (detail.archived ? { reason: "archived", message: "" } : null),
    branchPresent: detail.branch.present || detail.spexBranch,
  };
}

/** The workspace key for a Space repository’s namespace and path. */
export function hostKey(repository: HostRepository, instance?: string): string | null {
  const path = `${repository.group.fullPath}/${repository.path}`;
  if (path.startsWith("@") || !REPOSITORY_KEY_PATTERN.test(path)) return null;
  if (instance === undefined) return path;
  return INSTANCE_FOLDER_PATTERN.test(instance) ? `${instance}/${path}` : null;
}

/** Namespaces use the account login, case-insensitively. */
export function sameLogin(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
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

/** Whether two Git origins are one: equal but for a trailing slash. */
export function sameOrigin(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.replace(/\/+$/, "") === b.replace(/\/+$/, "");
}

/** The host repository a clone stands for among those one instance
 * answered (git-host-5, DR-127): one by that instance's Git origin and
 * its id — the id the clone records beside a remote under that Git
 * origin — else the one whose remote URL is the clone's, never by name;
 * so ids two Git systems both mint stay two repositories, and instances
 * sharing one Git origin list one. */
export function repositoryFor<T>(entries: readonly T[], repository: (entry: T) => HostRepository, gitOrigin: string | null | undefined, id: string | null, remote: string | null): T | undefined {
  if (id !== null && underOrigin(remote, gitOrigin)) {
    return entries.find((entry) => repository(entry).id === id);
  }
  return entries.find((entry) => sameRemote(repository(entry).remoteUrl, remote));
}

/** The listing a clone stands for in a view of one instance, by that
 * instance's Git origin and the clone's recorded id, else by its remote
 * URL (repositoryFor). */
export function listingFor(view: Pick<HostView, "listings" | "gitOrigin"> | undefined, id: string | null, remote: string | null): HostListing | undefined {
  if (!view) return undefined;
  return repositoryFor(view.listings, (listing) => listing.repository, view.gitOrigin, id, remote);
}

/** The name of the personal settings repository for this login. */
export function ownNameFor(login: string): string {
  return kebab(login).replace(/(?:-spex)+$/, "") || "me";
}

// ---------------------------------------------------------------------------
// The host's answers in the reader's words (git-host-11)

/** The host could not be reached. */
export function couldNotReach(host: string): string {
  return i18n._({ id: "Could not reach {host}", values: { host }, comment: "A stopped transfer's message; {host} is the Space's display name, or the remote's host" });
}

/** The Space has yet to prepare the records branch. */
export function waitingPhrase(words: string): string {
  return words
    ? i18n._({ id: "Waiting for the records branch: {words}", values: { words }, comment: "A Space has yet to prepare the records branch. {words} is its answer." })
    : i18n._({ id: "Waiting for the records branch", comment: "A Space has yet to prepare the records branch." });
}

/** A name the host reports taken (space-97). */
export function nameTaken(name: string, space: string): string {
  return i18n._({
    id: "{name} is already used at {space}. Choose another name.",
    values: { name, space },
    comment: "Refusal of a project name already used in the account at this Space",
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
        ? i18n._({ id: "Waiting: {words}", values: { words: error.words }, comment: "A step the Space left waiting; {words} are its own words" })
        : i18n._({ id: "Waiting", comment: "A step the Space left waiting, with no words of its own" });
    case "name_taken":
      return i18n._({ id: "The name is taken", comment: "The Space reports the name of new records taken" });
    case "host_refused":
    case "bad_request":
      return hostRefused(host, error.words);
    case "not_found":
      return noLongerShared();
    case "rate_limited": {
      const seconds = retryAfterSeconds(error.retryAfter);
      return seconds !== null
        ? i18n._({ id: "{host} asks to wait {seconds, plural, one {# second} other {# seconds}}", values: { host, seconds }, comment: "The Space's rate limit; {host} is its display name, {seconds} how long it asks to wait, read from its Retry-After" })
        : i18n._({ id: "{host} asks to wait a moment", values: { host }, comment: "The Space's rate limit, with no time of its own to wait; {host} is its display name" });
    }
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
      return { cause, message: i18n._({ id: "The sign-in was denied at {host}", values: { host }, comment: "A sign-in that ended because the person denied it at the Space; {host} is its display name" }) };
    case "expired":
      return { cause, message: i18n._({ id: "The sign-in expired before it was approved", comment: "A sign-in that ended because nobody approved it in time" }) };
    case "unreachable":
      return { cause, message: couldNotReach(host) };
    case "account":
      return { cause: "refused", message: i18n._({ id: "{host} signed you in as another account — sign in as @{login}", values: { host, login: words ?? "" },
        comment: "A sign-in refused, nothing stored: the person signed in at a Space this computer already signs in to as another account; {host} is the Space's display name, {login} the login this computer signs in with there" }) };
    case "state":
    case "refused":
    default:
      return { cause: "refused", message: hostRefused(host, words) };
  }
}

/** The description a new records repository carries in the Space. */
export function repositoryDescription(input: { kind: "project"; name: string } | { kind: "personal" }): string {
  if (input.kind === "personal") {
    return i18n._({ id: "Personal settings and conversation records", comment: "The description of the personal records repository created at sign-in" });
  }
  return i18n._({ id: "Spex records of {name}", values: { name: input.name }, comment: "The description of the project's records at the Space" });
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
