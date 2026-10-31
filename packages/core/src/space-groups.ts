// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Space surface's view of the Git host (git-host-5, space-61,
// DR-103): one read of the person, every group and every spex
// repository the host lists, each with what decides its state — its
// archived flag and the account's role as the host reports them, its
// `spex` branch, with member counts unknown — held as the home's current
// view until the next read. A host repository is one by its instance's
// Git origin and its id (DR-127): clones are matched to listings by the id
// in their Git configuration beside a remote under that Git origin, else
// by their remote URL, never by name.
// The phrases the core composes for the host's answers live here too
// (git-host-11), each keeping the host's own words whole.

import {
  CredentialChanged,
  HostError,
  retryAfterSeconds,
  type GitHostClient,
  type HostAccount,
  type HostGroup,
  type HostRepository,
  type HostRole,
  type SignInCause,
} from "@sublang/spex/git-host";
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
  /** How many members a selected read reports; full views leave it unknown. */
  members: number | null;
}

/** The host's last answer (git-host-5): with the roles it grants, and
 * what it lets the person do — create a group (`account`), create a
 * subgroup and manage members in each group (`groups[].can`), manage
 * each spex repository's members (`repository.can`) — as it said. */
export interface HostCatalog {
  displayName: string;
  gitOrigin: string;
  roles: HostRole[];
  account: HostAccount;
  groups: HostGroup[];
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
async function drainRead<T extends readonly unknown[]>(work: { [K in keyof T]: Promise<T[K]> }, state: ReadWork = {}): Promise<T> {
  const answers = await Promise.all(work.map(async (promise) => {
    try { return await promise; }
    catch (reason) { state.failure ??= { reason }; }
  }));
  if (state.failure) throw state.failure.reason;
  // Every result is present when no work failed; map preserves tuple order.
  return answers as unknown as T;
}

/** Run `work` over `items`, at most `limit` at a time, in order. */
async function mapLimit<T, R>(items: T[], limit: number, work: (item: T, state: ReadWork) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const state: ReadWork = {};
  const lane = async (): Promise<void> => {
    while (!state.failure && next < items.length) {
      const index = next;
      next += 1;
      try { out[index] = await work(items[index], state); }
      catch (reason) { state.failure ??= { reason }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  if (state.failure) throw state.failure.reason;
  return out;
}

/**
 * Read the host in one pass (git-host-5): its name, Git origin and
 * roles, the person, every group, every spex repository across its
 * pages — each as the host says what the person may do there — and for
 * each repository its read-only and branch state. Member counts stay
 * unknown without enumerating members; a catalog or detail failure
 * fails the whole read, so a view is never half a host.
 */
export async function readHostView(client: GitHostClient, now: () => number = Date.now): Promise<HostView> {
  const { repositories, ...catalog } = await readHostCatalog(client, true);
  const listings = await mapLimit(repositories, DETAIL_CONCURRENCY, (repository, state) => readListing(client, repository, false, state, true));
  return { ...catalog, readAt: now(), listings };
}

/** Complete identity and namespace discovery, without unrelated detail
 * fanout (git-host-22). It is not a fresh full Groups view. */
export async function readHostCatalog(client: GitHostClient, retryRead = false): Promise<HostCatalog> {
  const wait = { wait: true };
  const essentials = { ...wait, retryRead };
  const [described, account, groups, repositories] = await drainRead([
    client.describe(wait), client.me(essentials), client.groups(essentials), client.repositories(essentials),
  ] as const);
  return { displayName: described.displayName, gitOrigin: described.gitOrigin, roles: described.roles, account, groups, repositories };
}

/** Enrich just one catalog entry; its detail is the latest target
 * authority. Full views retain their catalog's paths (git-host-5). */
export async function readHostListing(client: GitHostClient, repository: HostRepository, target = false): Promise<HostListing> {
  return readListing(client, repository, target, {});
}

/** Full views share the failure with their detail scheduler, so it
 * starts no queued repository while a failed detail drains. */
async function readListing(client: GitHostClient, repository: HostRepository, target: boolean, state: ReadWork, fullRead = false): Promise<HostListing> {
  const [detail, members] = await drainRead([
    client.repository(repository.id, { wait: true, retryRead: fullRead }),
    fullRead ? Promise.resolve(null) : memberCount(client, repository.id),
  ] as const, state);
  return {
    repository: target ? detail : repository,
    readOnly: detail.readOnly ?? (detail.archived ? { reason: "archived", message: "" } : null),
    branchPresent: detail.branch.present || detail.spexBranch,
    members,
  };
}

/** A spex repository's members' count, the account among them, or null
 * where the host fails to read its members — Spex Space fails every
 * members read while its service identity's does (git-host-22). An
 * answer that signs the device out, or a pair replaced meanwhile, fails
 * the whole read as any other failure does. */
async function memberCount(client: GitHostClient, id: string): Promise<number | null> {
  try {
    return (await client.members({ kind: "repository", id }, { wait: true })).members.length;
  } catch (error) {
    if (error instanceof HostError && error.kind !== "reauth") return null;
    throw error;
  }
}

/** The key a listed repository's clone takes under `workspace/`: its
 * group's path in the instance joined to its own, as the host answers
 * them (git-host-5, DR-120), under the instance's folder where one is
 * named (DR-127); null where those names cannot stand as a key — a path
 * beginning with `@` among them, which would read as an instance's
 * folder. A group held as colliding is the caller's to refuse
 * ([[collidingGroup]]). */
export function hostKey(repository: HostRepository, instance?: string): string | null {
  const path = `${repository.group.fullPath}/${repository.path}`;
  if (path.startsWith("@") || !REPOSITORY_KEY_PATTERN.test(path)) return null;
  if (instance === undefined) return path;
  return INSTANCE_FOLDER_PATTERN.test(instance) ? `${instance}/${path}` : null;
}

/** The logins a view of one instance names besides groups (git-host-5,
 * DR-127): the account's login there, and every other account's under
 * which that instance lists a spex repository — never your own group's
 * folder name, which lies outside every instance's folder. */
export function namedLogins(view: Pick<HostCatalog, "account"> & (Pick<HostView, "listings"> | Pick<HostCatalog, "repositories">)): string[] {
  const logins = new Set<string>([view.account.login]);
  const repositories = "repositories" in view ? view.repositories : view.listings.map((listing) => listing.repository);
  for (const repository of repositories) if (repository.group.kind === "user") logins.add(repository.group.fullPath);
  return [...logins];
}

/** Whether a listed group is held as colliding (git-host-5, DR-120): of
 * kind `group`, its path equal, ignoring case, to one of `logins` or
 * beneath one, so no folder of its own could stand apart from that
 * login's under `workspace/`. */
export function collidingGroup(group: Pick<HostGroup, "kind" | "fullPath">, logins: readonly string[]): boolean {
  if (group.kind !== "group") return false;
  const path = group.fullPath.toLowerCase();
  return logins.some((login) => {
    const name = login.toLowerCase();
    return path === name || path.startsWith(`${name}/`);
  });
}

/** Whether two logins or user paths name one account: the host's paths
 * fold case. */
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
    const byId = entries.find((entry) => repository(entry).id === id);
    if (byId) return byId;
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
  return i18n._({ id: "Could not reach {host}", values: { host }, comment: "A stopped transfer's message; {host} is the Space's display name, or the remote's host" });
}

/** A step at the host is waiting for a member with the rights, in the
 * host's own words (space-64). */
export function waitingPhrase(step: "create" | "branch", group: string, words: string): string {
  if (step === "create") {
    return words
      ? i18n._({
          id: "Waiting for a member who can create it in {group}: {words}",
          values: { group, words },
          comment: "A project's line while creating its records at a Space waits for a member with the right; {group} is the group's full path, {words} the Space's own words",
        })
      : i18n._({
          id: "Waiting for a member who can create it in {group}",
          values: { group },
          comment: "A project's line while creating its records at a Space waits for a member with the right; {group} is the group's full path",
        });
  }
  return words
    ? i18n._({
        id: "Waiting for a member who can prepare its branch in {group}: {words}",
        values: { group, words },
        comment: "A project's line while preparing its records' Git branch at a Space waits for a member with the right; {group} is the group's full path, {words} the Space's own words",
      })
    : i18n._({
        id: "Waiting for a member who can prepare its branch in {group}",
        values: { group },
        comment: "A project's line while preparing its records' Git branch at a Space waits for a member with the right; {group} is the group's full path",
      });
}

/** Why a spex repository in a group held as colliding is unreachable
 * (space-61), read after "Unreachable: ". */
export function namedLikeYourLogin(): string {
  return i18n._({
    id: "a group named like your login",
    comment: "Why a project's records are unreachable: their group's path is your login's, so they can have no folder of their own on this computer; read after 'Unreachable: '",
  });
}

/** Refusal of a join or a pick into a group held as colliding (space-29,
 * space-61). */
export function groupNamedLikeYourLogin(group: string): string {
  return i18n._({
    id: "{group} is a group named like your login",
    values: { group },
    comment: "Refusal of Open here or Add to a group…: the group's path is your login's, so its records can have no folder of their own on this computer; {group} is the group's path",
  });
}

/** A name the host reports taken (space-58). */
export function nameTaken(name: string, group: string): string {
  return i18n._({
    id: "{name} is taken in {group}; choose another name",
    values: { name, group },
    comment: "Refusal of a name in a group: the Space reports it taken there; {name} is the name, {group} the group's full path",
  });
}

/** A new group's name the host reports taken there (git-host-15): inside
 * its parent group, or at the top of the host. */
export function groupNameTaken(name: string, parent: string | null, host: string): string {
  return parent === null
    ? i18n._({
        id: "{name} is taken at {host}; choose another name",
        values: { name, host },
        comment: "Refusal of a new top-level group's name; {name} is the name typed, {host} the Space's display name",
      })
    : nameTaken(name, parent);
}

/** A `not_found` the host answered a group or member write with
 * (git-host-11, git-host-16, git-host-17): the host's own words, which
 * name what it found no trace of, kept whole. */
export function notFoundAt(host: string, words: string | null): string {
  return words
    ? i18n._({
        id: "Not found at {host}: {words}",
        values: { host, words },
        comment: "The Space found no account, membership or group a write named; {host} is its display name, {words} its own words, kept whole",
      })
    : i18n._({
        id: "Not found at {host}",
        values: { host },
        comment: "The Space found nothing a write named, and gave no words of its own; {host} is its display name",
      });
}

/** Refusal: a new group needs a name (git-host-15). */
export function nameTheGroup(): string {
  return i18n._({ id: "Name the group", comment: "Refusal of a new group whose name is blank" });
}

/** Refusal: a new group needs a path (git-host-15). */
export function pathTheGroup(): string {
  return i18n._({ id: "Give the group a path", comment: "Refusal of a new group whose path at the Space is blank; Path is the editor's field" });
}

/** Refusal: a rename that names neither a name nor a path
 * (git-host-18). */
export function renameNothing(): string {
  return i18n._({ id: "Give the group a new name or path", comment: "Refusal of a group's rename naming neither a new name nor a new path" });
}

/** Refusal: a group the view lists something under is not deleted, since
 * the host would delete what it holds with it (git-host-19). */
export function groupNotEmpty(group: string): string {
  return i18n._({
    id: "{group} is not empty",
    values: { group },
    comment: "Refusal of a group's deletion: it still holds a project's records or a group; {group} is the group's path at the Space",
  });
}

/** A spex repository's name the host reports taken in the group it was
 * to move into (git-host-20). */
export function takenIn(name: string, group: string): string {
  return i18n._({
    id: "{group} already holds {name}",
    values: { name, group },
    comment: "Refusal of moving a project's records into a group that holds records of that name; {group} is that group's path at the Space, {name} the name",
  });
}

/** Refusal: a share or an unshare names no account (git-host-16,
 * git-host-17). */
export function nameTheLogin(host: string): string {
  return i18n._({
    id: "Name the account's login at {host}",
    values: { host },
    comment: "Refusal of a share or a removal whose login is blank; {host} is the Space's display name",
  });
}

/** Refusal: a role the host's description in the current view does not
 * list (git-host-16). */
export function notARole(role: string, host: string): string {
  return i18n._({
    id: "{role} is not one of the roles {host} grants",
    values: { role, host },
    comment: "Refusal of a share at a role the Space does not list; {role} is the role named, {host} the Space's display name",
  });
}

/** Refusal: a command must name one group or one spex repository
 * (space-29). */
export function nameOneTarget(): string {
  return i18n._({
    id: "Name one group or one project",
    comment: "Refusal of a members, share or removal command naming neither or both a group and a project's records",
  });
}

/** Refusal: a group the home's current view does not list (git-host-8,
 * git-host-15, git-host-16, git-host-17). */
export function groupNotListed(group: string, host: string): string {
  return i18n._({
    id: "{host} listed no group {group}",
    values: { group, host },
    comment: "Refusal naming a group the Space's last read did not list; {group} is the group's id as sent, {host} the Space's display name",
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
    case "person":
      return { cause: "refused", message: i18n._({ id: "{host} signed you in as @{login} — sign in as this server's member", values: { host, login: words ?? "" },
        comment: "A sign-in on a team server refused, nothing stored: the account approved at the Space is not the member the server was opened for; {host} is the Space's display name, {login} the login of the account that signed in" }) };
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
    return i18n._({ id: "Spex records of the group {group}", values: { group: input.group }, comment: "The description a group's new records carry at the Space" });
  }
  return input.code
    ? i18n._({ id: "Spex records of {name}; its code is at {code}", values: { name: input.name, code: input.code }, comment: "The description a project's new records carry at the Space; {code} is the code's remote URL" })
    : i18n._({ id: "Spex records of {name}", values: { name: input.name }, comment: "The description a project's new records carry at the Space, its code on no remote" });
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
