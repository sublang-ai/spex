// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Space surface's words and groupings (DR-057, DR-103, DR-172): the
// home's path in the reader's shorthand, a spex repository's clone, the
// one phrase its row reads (space-120) and the glyph naming where its
// code is (space-1), the kinds' order and labels (space-7), the sync
// steps' names (space-12), the catalog's sharing marks, each entry's
// family word, and the families that stay on this computer (space-23,
// space-25). Every phrase names a Space by its display name and this
// place "this computer" (space-27). Pure functions; the surface renders
// them.
//
// Every word here is a message of the catalog (localization-4), so a
// table of phrases holds thunks read at render — a table of strings
// would freeze the language this module was imported in.

import type {
  CodeKind,
  GroupsState,
  InstanceState,
  PlacementBranch,
  PlacementState,
  RepositoryState,
  SpaceEntry,
  SpaceUnit,
  SpaceUnitKind,
  SyncStep,
} from "@sublang/spex-core/protocol";

import { i18n } from "../i18n.js";
import { isLocalPlace, type Place } from "../state/store.js";
import { instanceNameAt, keyPlacement, placementLastSync, placementName, waitingOf } from "./placements.js";
import { absoluteTitle, relativeAge, shortMoment } from "./time.js";

/** The home's path with the user's home directory as `~` (space-1):
 * the full path rides the title. Only the two POSIX layouts the app
 * runs on are known (DR-049). */
export function tildify(path: string): string {
  return path.replace(/^(\/Users\/[^/]+|\/home\/[^/]+)(?=\/|$)/, "~");
}

/** Whether a spex repository's clone is on this computer (space-61): it
 * is local only or holds a placement; a row the host lists that this
 * computer lacks, or one in a group named like a login, which takes no
 * folder, holds none (space-30). */
export function cloneHere(repo: RepositoryState): boolean {
  return repo.state === "local-only" || repo.placements.some((placement) => placement.attached);
}

/** A spex repository's clone: its key is its path under `workspace/`
 * (storage-1). */
export function clonePath(home: string, key: string): string {
  return `${home.replace(/\/$/, "")}/workspace/${key}`;
}

/** The phrase a step waiting on someone else's rights reads on its
 * row (space-58, space-64): the step and the group, phrased here in the
 * reader's language; the host's own words ride the row's title. */
export function waitingPhrase(waiting: NonNullable<PlacementState["waiting"]>): string {
  return waiting.step === "create"
    ? i18n._("Waiting for a member who can create it in {group}", { group: waiting.group })
    : i18n._("Waiting for a member who can prepare its branch in {group}", { group: waiting.group });
}

/** A spex repository's last sync (space-61), its key placement's: this
 * computer's last completed sync with it, else the last one its clone
 * holds — current where the clone's `spex` is still that placement's —
 * else none. */
export function lastSyncOf(repo: RepositoryState): { at: number; current: boolean } | null {
  return placementLastSync(keyPlacement(repo));
}

/** What a last sync reads (space-61): "Synced <age>" while the clone's
 * `spex` is still the one it shared, "Not synced since <moment>" where
 * the two have differed since, "Never synced" where none is held. */
function lastSyncPhrase(last: { at: number; current: boolean } | null, now: number): string {
  if (!last) return i18n._("Never synced");
  return last.current
    ? i18n._({
        id: "Synced {age}",
        values: { age: relativeAge(last.at, now) },
        comment: "a project's row: when its records last synced",
      })
    : i18n._({
        id: "Not synced since {moment}",
        values: { moment: shortMoment(last.at) },
        comment: "a project's row: this computer and the Space have differed since that moment, when they last agreed",
      });
}

/** Ahead and behind a placement's `spex` as its last check counted them
 * (space-8): the row's counts' title, and each line's beside its own
 * phrase; none where it was never checked or shares no history. */
export function countsTitle(branch: PlacementBranch | null | undefined): string | null {
  if (!branch || branch.checkedAt === null || branch.unrelated) return null;
  return i18n._(
    "{ahead, plural, one {# commit} other {# commits}} ahead, {behind, plural, one {# commit} other {# commits}} behind · checked {at}",
    { ahead: branch.ahead ?? 0, behind: branch.behind ?? 0, at: absoluteTitle(branch.checkedAt) },
  );
}

/** What a read-only or unreachable repository or placement reads
 * (space-61): the state, with the host's words where it gave any. */
function hostStatePhrase(state: "read-only" | "unreachable", reason: string | null): string {
  if (state === "read-only") {
    return reason
      ? i18n._("Read-only: {reason}", { reason })
      : i18n._({ id: "Read-only", comment: "a project's records: the Space lets this account only read them" });
  }
  return reason
    ? i18n._("Unreachable: {reason}", { reason })
    : i18n._({ id: "Unreachable", comment: "a project's records: the Space cannot be read for them" });
}

/** "Signed out of <display name>" (space-3, space-6, space-61): records
 * at a Space this computer is signed out of, which no signed-in Space
 * listing them makes reachable. */
export function signedOutPhrase(name: string): string {
  return i18n._({
    id: "Signed out of {name}",
    values: { name },
    comment: "a project's row or placement line: this computer is signed out of the Space its records are at; {name} is the Space's display name",
  });
}

/** The server whose Space the surface shows at a seat's place, which
 * every phrase naming this computer names instead (space-112); none at
 * this computer. */
export function seatName(place: Place): string | undefined {
  return isLocalPlace(place) ? undefined : (place.name ?? place.key);
}

/** "Not on this computer", or at a seat's place "Not on <server>"
 * (space-87, space-112): `seat` names the server where the surface shows
 * a seat's place. */
export function notHerePhrase(seat?: string): string {
  return seat === undefined
    ? i18n._({ id: "Not on this computer", comment: "a project's records, or a copy of them at a Space, not on this computer" })
    : i18n._({
        id: "Not on {place}",
        values: { place: seat },
        comment: "a project's records, or a copy of them at a Space, not on the team server whose Space is shown; {place} is the server's name",
      });
}

/** What a spex repository's records read for their state (space-61): the
 * core's aggregate over its placements, a reachable one reading its key
 * placement's last sync, one local only reading nothing (space-120); a
 * waiting step reads on its placement's line instead (space-64,
 * space-87). `seat` names the server where the surface shows a seat's
 * place (space-112). */
export function repositoryStatePhrase(repo: RepositoryState, now: number, seat?: string): string {
  switch (repo.state) {
    case "local-only":
      return "";
    case "reachable":
      return lastSyncPhrase(lastSyncOf(repo), now);
    case "read-only":
    case "unreachable":
      return hostStatePhrase(repo.state, repo.reason);
    case "absent":
      return notHerePhrase(seat);
    default:
      // A state the page does not know: the raw value is data.
      return repo.state;
  }
}

/** What the project's records line reads (projects-4): a placement's
 * waiting step where one waits, which no row of the Space surface
 * carries but its line (space-64), else the records' own state. */
export function recordsStatePhrase(repo: RepositoryState, now: number): string {
  const waiting = waitingOf(repo)?.waiting;
  return waiting ? waitingPhrase(waiting) : repositoryStatePhrase(repo, now);
}

/** What a placement's line reads (space-87): its words, the fuller
 * reading for its title, and its tone — attention for an outcome that
 * asks for the reader, stopped for a stop. */
export interface LinePhrase {
  text: string;
  title: string;
  tone: "idle" | "running" | "attention" | "stopped";
}

/** How the phrases of one spex repository name its placements
 * (space-12, space-120): an instance by its display name, the path
 * placement by its remote; whether a line reads "Signed out of <display
 * name>"; and the server a seat's place shows (space-112). */
export interface PhraseNames {
  /** A placement by its instance's origin, null naming the path
   * placement. */
  nameAt(origin: string | null): string;
  /** Whether the line is unreachable because this computer is signed out
   * of its instance (space-61). */
  signedOut(line: PlacementState): boolean;
  seat?: string;
}

/** The names a spex repository's phrases read (space-12, space-61): a
 * line by its instance's display name as the home last read it, else its
 * host name, the path placement by its remote; a line signed out while it
 * reads unreachable and its instance is signed out. */
export function phraseNames(groups: GroupsState, repo: RepositoryState, seat?: string): PhraseNames {
  const instanceAt = (origin: string): InstanceState | undefined => groups.instances.find((instance) => instance.origin === origin);
  return {
    nameAt: (origin) => {
      const line = repo.placements.find((placement) => placement.instance === origin);
      if (line) return placementName(groups, line);
      return origin === null ? "" : instanceNameAt(groups, origin);
    },
    signedOut: (line) => line.state === "unreachable" && line.instance !== null && instanceAt(line.instance)?.signedIn === false,
    seat,
  };
}

/** The outcome a placement's line carries (space-87, space-12): the one
 * the last sync left there, until the next operation; those that need
 * nothing of the reader — synced, behind, stopped — put away while
 * `dismissed` is the sync phase the reader dismissed on the Sync tab. */
export function lineOutcome(
  repo: RepositoryState,
  line: PlacementState,
  dismissed?: string,
): PlacementState["outcome"] {
  const outcome = line.outcome;
  if (!outcome) return null;
  const putAway = dismissed !== undefined && dismissed === JSON.stringify(repo.sync);
  return putAway && (outcome.kind === "synced" || outcome.kind === "behind" || outcome.kind === "stopped") ? null : outcome;
}

/** "Waiting for you to continue" (space-57, space-87): a placement's
 * first send waiting on the sharing confirm. */
export function waitingForYouPhrase(): string {
  return i18n._({
    id: "Waiting for you to continue",
    comment: "a project's row or placement line: its first send to a Space waits for the sharing confirm; Continue stands beside it",
  });
}

/** A placement's line (space-87), the first that applies: the step in
 * flight at it (space-12); a waiting step at the host (space-64); the
 * outcome the last sync left there until the next operation, the ones
 * that need nothing of the reader put away by Dismiss — `dismissed`
 * being the sync phase the reader dismissed (space-12, space-15); else
 * its state, a reachable one reading its last sync (space-61), a
 * read-only one carrying it beside the host's reason, one at a Space
 * this computer is signed out of "Signed out of <display name>", one a
 * placement file names "Not on this computer" — at a seat's place "Not
 * on <server>" (space-112). Where its last check counted them, its own
 * ahead and behind ride the title of a sync's outcome and of its state
 * (space-8). */
export function placementPhrase(
  repo: RepositoryState,
  line: PlacementState,
  now: number,
  dismissed: string | undefined,
  names: PhraseNames,
): LinePhrase {
  const counts = countsTitle(line.branch);
  const counted = (title: string): string => (counts ? `${title} · ${counts}` : title);
  const name = names.nameAt(line.instance);
  const sync = repo.sync;
  if (sync.phase === "running" && sync.placement === line.instance) {
    const text = STEP_LINES[sync.step](name);
    return { text, title: text, tone: "running" };
  }
  if (line.waiting) return { text: waitingPhrase(line.waiting), title: line.waiting.message, tone: "attention" };
  const outcome = lineOutcome(repo, line, dismissed);
  if (outcome) {
    switch (outcome.kind) {
      case "synced": {
        const at = line.lastSync?.at ?? (sync.phase === "done" ? sync.at : now);
        const text =
          line.state === "read-only"
            ? i18n._({
                id: "{received} received; nothing sent",
                values: { received: outcome.received },
                comment: "a read-only placement's line after a sync: how many records came back; nothing was sent, the Space letting this account only read",
              })
            : outcome.sent + outcome.received === 0
              ? i18n._("Everything is in sync")
              : i18n._("Synced {age} · {sent} sent · {received} received", {
                  age: relativeAge(at, now),
                  sent: outcome.sent,
                  received: outcome.received,
                });
        return { text, title: counted(absoluteTitle(at)), tone: "idle" };
      }
      case "behind": {
        const text = i18n._({
          id: "Behind — Sync again",
          comment: "a placement's line: the sync left the Space's copy behind this computer's; another Sync carries it",
        });
        return { text, title: counted(text), tone: "attention" };
      }
      case "choices": {
        const text = changedOnBoth(name);
        return { text, title: text, tone: "attention" };
      }
      case "unrelated": {
        const text = startedSeparately(name);
        return { text, title: text, tone: "attention" };
      }
      case "waiting": {
        const text = waitingForYouPhrase();
        return { text, title: text, tone: "attention" };
      }
      case "stopped": {
        const text = stoppedPhrase(outcome.step, outcome.message);
        return { text, title: counted(outcome.guidance || text), tone: outcome.cause === "rejected" ? "attention" : "stopped" };
      }
    }
  }
  const last = placementLastSync(line);
  switch (line.state) {
    case "reachable": {
      const text = lastSyncPhrase(last, now);
      return { text, title: counted(last ? absoluteTitle(last.at) : text), tone: "idle" };
    }
    case "read-only":
    case "unreachable": {
      if (names.signedOut(line)) {
        const text = signedOutPhrase(name);
        return { text, title: text, tone: "idle" };
      }
      const state = hostStatePhrase(line.state, line.reason);
      // A read-only line carries its last sync as a reachable one does —
      // its age while the clone's `spex` is still the one it shared, the
      // moment they last agreed otherwise — and an unreachable one in its
      // title alone (space-87, space-61).
      const text =
        line.state === "read-only" && last
          ? i18n._("{state} · last synced {at}", {
              state,
              at: last.current ? relativeAge(last.at, now) : shortMoment(last.at),
            })
          : state;
      return {
        text,
        title: counted(last ? i18n._("{state} · last synced {at}", { state, at: absoluteTitle(last.at) }) : state),
        tone: line.state === "unreachable" ? "attention" : "idle",
      };
    }
    case "absent": {
      const text = notHerePhrase(names.seat);
      return { text, title: text, tone: "idle" };
    }
    default:
      // A state the page does not know: the raw value is data.
      return { text: line.state, title: line.state, tone: "idle" };
  }
}

/** "Changed here and at <display name>" (space-14, space-87): records
 * changed on both sides, choices owed for the placement at the Space
 * named. */
export function changedOnBoth(name: string): string {
  return i18n._({
    id: "Changed here and at {name}",
    values: { name },
    comment: "a project's row or placement line: a sync found records changed both on this computer and at that Space, choices owed; {name} is the Space's display name; Resolve stands beside it",
  });
}

/** "Started separately at <display name>" (space-13, space-87): this
 * computer's records and the Space's share no history; "Combine…"
 * stands beside it. */
export function startedSeparately(name: string): string {
  return i18n._({
    id: "Started separately at {name}",
    values: { name },
    comment: "a project's row, placement line or card: this computer's records and the Space's were started apart and share no history; {name} is the Space's display name; Combine… stands beside it",
  });
}

/** "<step> stopped — <message>" (space-15). */
export function stoppedPhrase(step: SyncStep, message: string): string {
  return i18n._({
    id: "{step} stopped — {message}",
    values: { step: STEP_NAMES[step](), message },
    comment: "{step} is the sync step's name, as Sending; {message} is the cause, in the Space's words where it gave any",
  });
}

/** "<n> to send" (space-120): the records this computer changed that no
 * Space holds yet, its title naming them by kind. */
export function toSendPhrase(units: readonly SpaceUnit[]): { text: string; title: string } {
  return {
    text: i18n._({
      id: "{count} to send",
      values: { count: units.length },
      comment: "a project's row: how many of its records this computer changed that are not sent yet; Sync now in its overflow sends them",
    }),
    title: groupUnits(units)
      .map(({ kind, units: those }) =>
        i18n._({
          id: "{kind} ({count})",
          values: { kind: KIND_LABELS[kind](), count: those.length },
          comment: "one kind of records waiting to be sent, in a project's title: {kind} is the kind's heading, as Sessions; {count} how many",
        }),
      )
      .join(" · "),
  };
}

/** The phrase a row reads (space-120, DR-159): its words, the fuller
 * reading for its title, its tone, and the way forward beside it —
 * Resolve for choices owed, "Combine…" for records started separately,
 * Continue for a first send waiting on the sharing confirm, Retry for a
 * stop retrying can help — with the placement it is for. */
export interface RowPhrase extends LinePhrase {
  act?: { kind: "resolve" | "combine" | "continue" | "retry"; placement: string | null };
}

const NO_PHRASE: RowPhrase = { text: "", title: "", tone: "idle" };

/** A row's one standing phrase (space-120): the first of these its state
 * and its placements' lines hold, a placement's display name being that
 * of the first line, in the lines' order, holding the phrase —
 *
 * 1. the step in flight, or "Opening…" while its join runs (space-63);
 * 2. "<n> to send", its local units;
 * 3. "Changed here and at <display name>" with Resolve (space-14);
 * 4. "Started separately at <display name>" with "Combine…" (space-13);
 * 5. "Waiting for you to continue" with the sharing confirm (space-57),
 *    or a stopped step's cause with Retry (space-15);
 * 6. "Read-only: <the host's reason>", the records read-only;
 * 7. "Unreachable: <cause>", the records unreachable;
 * 8. "Signed out of <display name>", unreachable because this computer
 *    is signed out of every Space they are at;
 * 9. its last sync — "Synced <age>", "Not synced since <moment>" or
 *    "Never synced".
 *
 * A row under "This computer" (`quiet`), local only, or not on this
 * computer reads none but the join running on it. Outcomes the reader
 * dismissed and those that need nothing of him — synced, behind — leave
 * the state's phrase. */
export function rowPhrase(
  repo: RepositoryState,
  now: number,
  dismissed: string | undefined,
  names: PhraseNames,
  quiet = false,
): RowPhrase {
  const sync = repo.sync;
  if (sync.phase === "running") {
    if (sync.op === "join") {
      const text = i18n._({ id: "Opening…", comment: "a project's row while it is opened here: its records and code are downloaded" });
      return { text, title: text, tone: "running" };
    }
    if (quiet) return NO_PHRASE;
    const text = STEP_LINES[sync.step](sync.placement === undefined ? undefined : names.nameAt(sync.placement));
    return { text, title: text, tone: "running" };
  }
  if (quiet || repo.state === "local-only" || repo.state === "absent") return NO_PHRASE;
  if (repo.local.length > 0) {
    const { text, title } = toSendPhrase(repo.local);
    return { text, title, tone: "idle" };
  }
  const lines = repo.placements.filter((line) => line.attached);
  const outcomes = lines.map((line) => ({ line, outcome: lineOutcome(repo, line, dismissed) }));
  // A join of records started separately that ended in choices owes them
  // (space-13, space-14).
  const choices = outcomes.find(({ line, outcome }) => outcome?.kind === "choices" || (sync.phase === "choices" && sync.placement === line.instance));
  const choicesAt = choices ? choices.line.instance : sync.phase === "choices" ? sync.placement : undefined;
  if (choicesAt !== undefined) {
    const text = changedOnBoth(names.nameAt(choicesAt));
    return { text, title: text, tone: "attention", act: { kind: "resolve", placement: choicesAt } };
  }
  const apart = outcomes.find(({ line, outcome }) => outcome?.kind === "unrelated" || (outcome === null && line.branch?.unrelated === true));
  const apartAt = apart ? apart.line.instance : sync.phase === "unrelated" ? sync.placement : undefined;
  if (apartAt !== undefined) {
    const text = startedSeparately(names.nameAt(apartAt));
    return { text, title: text, tone: "attention", act: { kind: "combine", placement: apartAt } };
  }
  for (const { line, outcome } of outcomes) {
    if (outcome?.kind === "waiting") {
      const text = waitingForYouPhrase();
      return { text, title: text, tone: "attention", act: { kind: "continue", placement: line.instance } };
    }
    if (outcome?.kind === "stopped") {
      const text = stoppedPhrase(outcome.step, outcome.message);
      return {
        text,
        title: outcome.guidance || text,
        tone: outcome.cause === "rejected" ? "attention" : "stopped",
        ...(outcome.retry ? { act: { kind: "retry" as const, placement: line.instance } } : {}),
      };
    }
  }
  if (sync.phase === "stopped" && dismissed !== JSON.stringify(sync)) {
    const text = stoppedPhrase(sync.step, sync.message);
    return {
      text,
      title: sync.guidance || text,
      tone: sync.cause === "rejected" ? "attention" : "stopped",
      ...(sync.retry ? { act: { kind: "retry" as const, placement: null } } : {}),
    };
  }
  // The records' own state (space-61): read-only where no placement is
  // reachable and one is read-only, unreachable where every one is —
  // signed out where that is why, naming the first line's Space so.
  if (repo.state === "read-only") {
    const text = hostStatePhrase("read-only", repo.reason ?? lines.find((line) => line.state === "read-only")?.reason ?? null);
    const title =
      names.seat === undefined
        ? i18n._({
            id: "{state} · new sessions stay on this computer",
            values: { state: text },
            comment: "a read-only project's title: the sessions started from now on are not sent",
          })
        : i18n._({
            id: "{state} · new sessions stay on {place}",
            values: { state: text, place: names.seat },
            comment: "a read-only row's title on a team server's Space: new sessions stay on the server; {place} is the server's name",
          });
    return { text, title, tone: "idle" };
  }
  if (repo.state === "unreachable") {
    const signedOut = lines.find((line) => names.signedOut(line));
    if (signedOut && !lines.some((line) => line.state === "unreachable" && !names.signedOut(line))) {
      const text = signedOutPhrase(names.nameAt(signedOut.instance));
      return { text, title: text, tone: "idle" };
    }
    const text = hostStatePhrase("unreachable", repo.reason ?? lines.find((line) => line.state === "unreachable")?.reason ?? null);
    return { text, title: text, tone: "attention" };
  }
  const last = lastSyncOf(repo);
  const text = lastSyncPhrase(last, now);
  return { text, title: last ? absoluteTitle(last.at) : text, tone: "idle" };
}

/** A project's code glyph (space-1, DR-172): the core's phrase, "Code:
 * <where>" or "Code: no remote", with what it says of the remote — at a
 * Space, elsewhere, or none, a warning; nothing while the core does not
 * know yet or the records hold no `project.json`. */
export function codeOf(repo: RepositoryState): { kind: Exclude<CodeKind, "unknown">; phrase: string } | null {
  if (repo.codeKind === "unknown" || repo.code === null) return null;
  return { kind: repo.codeKind, phrase: repo.code };
}

/** A project's name from its spex repository's (space-1, space-46):
 * `<name>-spex` with its `-spex` dropped. */
export function projectName(name: string): string {
  return name.replace(/-spex$/i, "") || name;
}

/** A project opening at a place (run-view-168, space-63): a spex
 * repository whose join runs there, named as its code is, with the step
 * in flight — or one whose join stopped, with its cause. Its id is the
 * row's key, which the project bears once that place's core lists it. */
export interface OpeningProject {
  id: string;
  name: string;
  step: SyncStep;
  /** The cause the join stopped with; absent while it runs. */
  stopped?: string;
}

/** What a row says of its open (run-view-168): the join running or
 * stopped on it; nothing for any other row. */
export function openingOf(repo: RepositoryState | undefined): OpeningProject | undefined {
  if (!repo) return undefined;
  const sync = repo.sync;
  if (sync.phase === "running" && sync.op === "join") return { id: repo.key, name: projectName(repo.name), step: sync.step };
  if (sync.phase === "stopped" && sync.op === "join") return { id: repo.key, name: projectName(repo.name), step: sync.step, stopped: sync.message };
  return undefined;
}

/** Every row a Groups state lists; a state read in part lists what it
 * holds. */
function rowsOf(state: GroupsState): RepositoryState[] {
  return [...(state.own?.repositories ?? []), ...(state.instances ?? []).flatMap((instance) => instance.groups.flatMap((group) => group.repositories))];
}

/** The projects opening at a place (run-view-168): every row of its
 * Groups state whose join runs, left out once its core lists the
 * project. */
export function openingProjects(state: GroupsState | undefined, projects: readonly { id: string }[]): OpeningProject[] {
  if (!state) return [];
  return rowsOf(state)
    .map((repo) => openingOf(repo))
    .filter((entry): entry is OpeningProject => entry !== undefined && entry.stopped === undefined && !projects.some((project) => project.id === entry.id));
}

/** What a place says of opening the project keyed `id` (run-view-168):
 * its join running or stopped, nothing otherwise. */
export function openingAt(state: GroupsState | undefined, id: string | undefined): OpeningProject | undefined {
  if (!state || id === undefined) return undefined;
  return openingOf(rowsOf(state).find((repo) => repo.key === id));
}

/** "Personal" (space-1, DR-172): your own records and your namespace
 * at a Space, as a heading, a picker's first choice and a group the
 * sharing confirm names. */
export const personalLabel = (): string =>
  i18n._({ id: "Personal", comment: "your own records at a Space, apart from any group: a heading, a picker's choice and where records are shared into" });

/** "This computer" (space-1, DR-172): the heading of what stands in no
 * group — your sessions before any sign-in, and each project not yet
 * shared. */
export const thisComputerLabel = (): string =>
  i18n._({ id: "This computer", comment: "the heading of the projects and sessions kept on this computer alone, in no group at any Space" });

/** A row's name (space-1, DR-159): the spex repository's with its
 * `-spex` dropped, a group's own reading "Group sessions" and your own
 * group's own "Your sessions". */
export function rowName(group: { fullPath: string }, repo: RepositoryState): string {
  if (repo.own) {
    return i18n._({ id: "Your sessions", comment: "the row of your own group's own records: your sessions outside any project" });
  }
  if (isGroupRepository(group, repo)) {
    return i18n._({ id: "Group sessions", comment: "the row of a group's own records: the group's sessions outside any project" });
  }
  return projectName(repo.name);
}

/** A group's own spex repository rather than a project's (DR-103):
 * your own group's, or the one named `<group>-spex` in its group, after
 * the last segment of the group's path as the core names it (space-65),
 * whatever the group's name — a project of that name is refused at
 * creation, the name being taken. */
export function isGroupRepository(group: { fullPath: string }, repo: RepositoryState): boolean {
  return repo.own || repo.name === `${lastSegment(group.fullPath)}-spex`;
}

/** A project's spex repository cloned at the place with no working
 * folder pairing it: a clone whose code found none here, paired later
 * (space-63) — or, at a remote place, one whose code clone failed,
 * joined again into the folder its core allocated (space-103). */
export function awaitsFolder(group: { fullPath: string }, repo: RepositoryState): boolean {
  return cloneHere(repo) && !isGroupRepository(group, repo) && repo.folder === null && repo.state !== "local-only";
}

/** Whether a spex repository a Space lists may hold the records of a
 * project here (space-58): its code read alike — the core names where a
 * project's code is, never its remote (space-1) — at a Space or
 * elsewhere, and the same project name, compared as the reader reads
 * them. */
export function sameCode(listed: RepositoryState, local: RepositoryState): boolean {
  const known = (repo: RepositoryState) => repo.code !== null && (repo.codeKind === "space" || repo.codeKind === "elsewhere");
  return (
    known(listed) &&
    known(local) &&
    listed.codeKind === local.codeKind &&
    listed.code === local.code &&
    projectName(listed.name).toLowerCase() === projectName(local.name).toLowerCase()
  );
}

/** A path's last segment: a working folder's name, the default name
 * of the spex repository made for it (space-58). */
export function lastSegment(path: string): string {
  return path.replace(/[/\\]+$/, "").split(/[/\\]/).pop() ?? path;
}

/** The kinds in the order the lists group them (space-7). */
export const KIND_ORDER: readonly SpaceUnitKind[] = [
  "session",
  "intent",
  "authoring",
  "environment",
  "settings",
  "code",
  "rules",
  "other",
];

export const KIND_LABELS: Record<SpaceUnitKind, () => string> = {
  session: () => i18n._("Sessions"),
  intent: () => i18n._({ id: "Intents", comment: "heading over a project's changed intents" }),
  authoring: () => i18n._({ id: "Authoring", comment: "heading over a project's changed authoring sessions" }),
  environment: () => i18n._({ id: "Packages", comment: "heading over a project's changed spex.yaml and spex.lock: the packages it adds" }),
  settings: () => i18n._("Settings"),
  code: () => i18n._({ id: "Code", comment: "heading over the file naming where a project's code lives" }),
  rules: () => i18n._("Sync rules"),
  other: () => i18n._({ id: "Other", comment: "heading over units of no named kind" }),
};

/** One unit of a kind, for the row that names a single conflict
 * (space-17): the singular each language forms for itself. */
export const KIND_SINGULAR: Record<SpaceUnitKind, () => string> = {
  session: () => i18n._({ id: "Session", comment: "one unit's kind: a session" }),
  intent: () => i18n._({ id: "Intent", comment: "one unit's kind: an intent with its attachments" }),
  authoring: () => i18n._({ id: "Authoring session", comment: "one unit's kind: an authoring session" }),
  environment: () => i18n._({ id: "unit.packages", message: "Packages", comment: "one record's kind: the project's spex.yaml and spex.lock, the packages it adds" }),
  settings: () => i18n._({ id: "Setting", comment: "one unit's kind: the settings file" }),
  code: () => i18n._({ id: "unit.code", message: "Code", comment: "one unit's kind: the file naming where the code lives" }),
  rules: () => i18n._({ id: "Sync rule", comment: "one unit's kind: a sync rule file" }),
  other: () => i18n._({ id: "Other", comment: "heading over units of no named kind" }),
};

/** Units grouped by kind in the kinds' order, empty kinds omitted. */
export function groupUnits(
  units: readonly SpaceUnit[],
): { kind: SpaceUnitKind; units: SpaceUnit[] }[] {
  return KIND_ORDER.map((kind) => ({
    kind,
    units: units.filter((unit) => unit.kind === kind),
  })).filter((group) => group.units.length > 0);
}

/** The six steps in order (space-12). */
export const STEP_ORDER: readonly SyncStep[] = [
  "save",
  "check",
  "compare",
  "apply",
  "refresh",
  "push",
];

/** A step's name on the rail and in a stop, "Sending stopped — …"
 * (space-12, space-15). */
export const STEP_NAMES: Record<SyncStep, () => string> = {
  save: () => i18n._({ id: "Saving", comment: "sync step's name: saving this computer's changes to the records" }),
  check: () => i18n._({ id: "Checking", comment: "sync step's name: reading what the Space holds" }),
  compare: () => i18n._({ id: "Comparing", comment: "sync step's name: comparing both sides" }),
  apply: () => i18n._({ id: "Merging", comment: "sync step's name: bringing both sides' records together" }),
  refresh: () => i18n._({ id: "Reloading", comment: "sync step's name: reading the records again" }),
  push: () => i18n._({ id: "Sending", comment: "sync step's name: sending the records to the Space" }),
  // A join's step while its code clones (space-63).
  code: () => i18n._({ id: "Downloading code", comment: "a project's open, step's name: downloading the project's code into its folder" }),
};

/** What the step line reads while a step runs (space-12, space-63),
 * Check naming the Space it reads where `name` is given — the
 * placement's display name, or the path placement's remote. */
export const STEP_LINES: Record<SyncStep, (name?: string) => string> = {
  save: () => i18n._({ id: "Saving…", comment: "sync step running: saving this computer's changes to the records" }),
  check: (name) =>
    name
      ? i18n._({ id: "Checking {name}…", values: { name }, comment: "sync step running: reading what the Space holds; {name} is the Space's display name" })
      : i18n._({ id: "Checking…", comment: "sync step running: reading what the Space holds" }),
  compare: () => i18n._({ id: "Comparing…", comment: "sync step running: comparing both sides" }),
  apply: () => i18n._({ id: "Merging…", comment: "sync step running: bringing both sides' records together" }),
  refresh: () => i18n._({ id: "Reloading…", comment: "sync step running: reading the records again" }),
  push: () => i18n._({ id: "Sending…", comment: "sync step running: sending the records to the Space" }),
  code: () => i18n._({ id: "Downloading code…", comment: "a project's open, step running: downloading the project's code into its folder" }),
};

/** A byte count in the reader's units: "312 B", "4.1 KB", "2.3 MB". */
export function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return i18n._({ id: "{size} B", values: { size: bytes }, comment: "a file size in bytes" });
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    const size = kb < 10 ? kb.toFixed(1) : String(Math.round(kb));
    return i18n._({ id: "{size} KB", values: { size }, comment: "a file size in kilobytes" });
  }
  const mb = kb / 1024;
  if (mb < 1024) {
    const size = mb < 10 ? mb.toFixed(1) : String(Math.round(mb));
    return i18n._({ id: "{size} MB", values: { size }, comment: "a file size in megabytes" });
  }
  return i18n._({
    id: "{size} GB",
    values: { size: (mb / 1024).toFixed(1) },
    comment: "a file size in gigabytes",
  });
}

/** The sharing mark's words (space-23): color never carries it alone. */
export const SHARING_LABELS: Record<SpaceEntry["sync"], () => string> = {
  shared: () => i18n._({ id: "Shared", comment: "entry mark: this file syncs and is already sent" }),
  pending: () => i18n._("Not yet shared"),
  local: () => i18n._({ id: "Stays here", comment: "entry mark: this file never leaves this computer" }),
  git: () => i18n._({ id: "Git data", comment: "entry mark: the repository's own files" }),
};

/** The word this interface calls each catalog family by, keyed by the
 * family the core sends (space-23): the core names the family in one
 * closed English vocabulary the page holds against it (storage-1), so
 * every comparison stays on that raw value and only the reading passes
 * through here, whose English is the core's own word. Thunks, never
 * strings: a table read at module load would freeze the language it
 * was imported in. */
export const FAMILY_LABELS: Record<string, () => string> = {
  "Git data": () => i18n._({ id: "Git data", comment: "entry mark: the repository's own files" }),
  lease: () => i18n._({ id: "in-use file", comment: "what a file is, in the records' tree: it marks which Spex is writing the records right now" }),
  "temporary write": () => i18n._({ id: "temporary copy", comment: "what a file is, in the records' tree: a copy made while writing" }),
  "config backup": () => i18n._({ id: "Settings backup", comment: "what a file is, in the records' tree: a copy of the settings kept before a write" }),
  "sync repair marker": () => i18n._({ id: "interrupted sync", comment: "what a file is, in the records' tree: it marks a sync that stopped midway, which the next sync finishes" }),
  "session bundles": () => i18n._({ id: "sessions", comment: "what a folder is, in the records' tree: every session's files" }),
  "session manifest": () => i18n._({ id: "session file", comment: "what a file is, in the records' tree: one session's own file" }),
  "session records": () => i18n._({ id: "session transcript", comment: "what a file is, in the records' tree: one session's transcript, every turn as it happened" }),
  "session chunks": () => i18n._({ id: "session history", comment: "what a folder is, in the records' tree: the saved pieces of one session's history" }),
  "session attachments": () => i18n._({ id: "session attachments", comment: "what a folder is, in the records' tree: the files attached to one session's turns" }),
  "provider hints": () => i18n._({ id: "provider hints", comment: "a file family that stays on this computer" }),
  "legacy session sidecar": () => i18n._({ id: "older session file", comment: "what a file is, in the records' tree: a session file an earlier release wrote" }),
  intents: () => i18n._({ id: "intents", comment: "what a folder is, in the records' tree: every intent's file" }),
  intent: () => i18n._({ id: "intent", comment: "what a file is, in the records' tree: one intent's file" }),
  "intent attachments": () => i18n._({ id: "intent attachments", comment: "what a folder is, in the records' tree: the files attached to one intent" }),
  "authoring sessions": () => i18n._({ id: "authoring sessions", comment: "what a folder is, in the records' tree: every playbook being written" }),
  "authoring session": () => i18n._({ id: "authoring session", comment: "what a file is, in the records' tree: one playbook being written" }),
  "authoring records": () => i18n._({ id: "authoring transcript", comment: "what a file is, in the records' tree: the transcript of one playbook being written" }),
  "authoring attachments": () => i18n._({ id: "authoring attachments", comment: "what a folder is, in the records' tree: the files attached to one playbook being written" }),
  "spec package requests": () => "spex.yaml",
  "spec package lock": () => "spex.lock",
  "spec package": () => i18n._({ id: "package", comment: "what a folder or file is, in the records' tree: a package kept in the records, or a file in it" }),
  "upload staging": () => i18n._({ id: "uploads not yet attached", comment: "what a folder is, in the records' tree: files uploaded and not yet attached to a turn" }),
  Settings: () => i18n._({ id: "Settings", comment: "what a file is, in the records' tree: the shared settings the Settings surface edits" }),
  "code remote": () => i18n._({ id: "where the code is", comment: "what a file is, in the records' tree: it names where a project's code is" }),
  placement: () => i18n._({ id: "where the records sync", comment: "what a file is, in the records' tree: it names a Space these records sync with" }),
  "installed spec packages": () => i18n._({ id: "installed packages", comment: "what a folder is, in the records' tree: packages installed on this computer from spex.lock" }),
  "exported skills": () => i18n._({ id: "skills for agents", comment: "what a folder is, in the records' tree: the installed packages' skills, placed where the agents read them" }),
  "sync rules": () => i18n._({ id: "sync rules", comment: "what a file is, in the records' tree: it says what syncs" }),
  "Not a Spex folder": () => i18n._({ id: "Not a Spex folder", comment: "what a folder is, in the records' tree: Spex did not write it" }),
  "Not a Spex file": () => i18n._({ id: "Not a Spex file", comment: "what a file is, in the records' tree: Spex did not write it" }),
};

/** The word an entry's family reads as; a family this interface does
 * not know reads as the core sent it, so a family a later core adds is
 * never renamed into nonsense. */
export function familyName(family: string): string {
  return FAMILY_LABELS[family]?.() ?? family;
}

/** Every ignored family with its one plain reason (space-25), the
 * server named where this computer would be at a seat's place
 * (space-112); read at render, never at module load. */
export function staysHere(seat?: string): readonly { family: string; reason: string }[] {
  return [
    {
      family: i18n._({ id: "provider hints", comment: "a file family that stays on this computer" }),
      reason:
        seat === undefined
          ? i18n._("resume tokens for this computer's agent conversations; they work nowhere else")
          : i18n._({
              id: "resume tokens for {place}'s agent conversations; they work nowhere else",
              values: { place: seat },
              comment: "why provider hints stay on a team server's seat; {place} is the server's name",
            }),
    },
    {
      family: i18n._({ id: "in-use files", comment: "a file family that stays on this computer: the files marking which Spex is writing now" }),
      reason: i18n._("which process is writing right now"),
    },
    {
      family: i18n._({
        id: "installed packages and skills for agents",
        comment: "a file family that stays on this computer",
      }),
      reason:
        seat === undefined
          ? i18n._("copies installed from spex.lock; every computer installs its own")
          : i18n._({
              id: "copies installed from spex.lock; {place} installs its own",
              values: { place: seat },
              comment: "why installed packages stay on a team server's seat; {place} is the server's name",
            }),
    },
    {
      family: i18n._({ id: "where projects live", comment: "a file family that stays on this computer" }),
      reason:
        seat === undefined
          ? i18n._("where your project folders are on this computer, in the home file")
          : i18n._({
              id: "where your project folders are on {place}, in the home file",
              values: { place: seat },
              comment: "why where projects live stays on a team server's seat; {place} is the server's name",
            }),
    },
    {
      family: i18n._({ id: "preferences", comment: "a file family that stays on this computer" }),
      reason: i18n._("where you last stopped reading in each session"),
    },
    {
      family: i18n._({ id: "credentials", comment: "a file family that stays on this computer" }),
      reason:
        seat === undefined
          ? i18n._("this computer's sign-in to each Space")
          : i18n._({
              id: "{place}'s sign-in to each Space",
              values: { place: seat },
              comment: "why credentials stay on a team server's seat; {place} is the server's name",
            }),
    },
    {
      family: i18n._({
        id: "migration receipts and inputs",
        comment: "a file family that stays on this computer",
      }),
      reason: i18n._("original files kept from an upgrade"),
    },
    {
      family: i18n._({
        id: "temporary files",
        comment: "a file family that stays on this computer",
      }),
      reason: i18n._("copies made while writing"),
    },
  ];
}

/** A session's files under its node read by their part, not their
 * file name (space-23). The family the core sent names the part; the
 * word the row reads is this interface's own. */
export function sessionPartName(entry: SpaceEntry): string {
  switch (entry.family) {
    case "session manifest":
      return i18n._({ id: "file", comment: "a session's part, under its node in the records' tree: the session's own file" });
    case "session records":
      return i18n._({ id: "transcript", comment: "a session's part, under its node in the records' tree: its transcript, every turn as it happened" });
    case "provider hints":
      return i18n._({ id: "provider hints", comment: "a file family that stays on this computer" });
    default:
      return entry.name;
  }
}

/** How the preview renders a text entry (space-24), by its name. */
export function previewKindOf(
  name: string,
): "json" | "jsonl" | "markdown" | "text" {
  if (/\.jsonl$/i.test(name)) return "jsonl";
  if (/\.json$/i.test(name)) return "json";
  if (/\.(md|markdown)$/i.test(name)) return "markdown";
  return "text";
}

/** JSON pretty-printed for the preview; text that is not JSON stands. */
export function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** The phrase a withheld preview reads (space-24): the page's own
 * words for a read the core answered with the `withheld` kind, which
 * is what the page recognizes — never the reason's wording, which the
 * core composes in the home's language (localization-11). */
export function withheldPhrase(): string {
  return i18n._("May hold provider tokens — not shown");
}

/** Whether the page runs on a Mac, for the reveal control's name. */
export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform =
    (navigator as { userAgentData?: { platform?: string } }).userAgentData
      ?.platform ??
    navigator.platform ??
    "";
  return /mac/i.test(platform);
}

/** The reveal control's name (space-26): the file manager's own. */
export function revealLabel(): string {
  return isMacPlatform()
    ? i18n._({ id: "Show in Finder", comment: "reveal a path in macOS Finder" })
    : i18n._({ id: "Show in folder", comment: "reveal a path in the file manager" });
}

/** The native bridge's reveal capability, feature-detected
 * (app-shell-28, DR-008); absent on the served page. */
export function revealBridge(): ((path: string) => Promise<boolean>) | undefined {
  if (typeof window === "undefined") return undefined;
  const native = (window as { spexNative?: { revealPath?: unknown } }).spexNative;
  return typeof native?.revealPath === "function"
    ? (native.revealPath as (path: string) => Promise<boolean>)
    : undefined;
}

/** The native bridge's browser opener, feature-detected
 * (app-shell-37, DR-008); absent on the served page, where the
 * sign-in URL stands as a link instead (space-3). */
export function openExternalBridge(): ((url: string) => Promise<boolean>) | undefined {
  if (typeof window === "undefined") return undefined;
  const native = (window as { spexNative?: { openExternal?: unknown } }).spexNative;
  return typeof native?.openExternal === "function"
    ? (native.openExternal as (url: string) => Promise<boolean>)
    : undefined;
}

/** The native bridge's directory picker, where the shell offers one
 * (DR-008): Join and Choose folder… ask through it (space-63). */
export function pickDirectoryBridge(): (() => Promise<string | null>) | undefined {
  if (typeof window === "undefined") return undefined;
  const native = (window as { spexNative?: { pickDirectory?: unknown } }).spexNative;
  return typeof native?.pickDirectory === "function"
    ? (native.pickDirectory as () => Promise<string | null>)
    : undefined;
}

/** The absolute path of an entry under the home. */
export function absolutePath(home: string, relative: string): string {
  if (!relative || relative === ".") return home;
  return `${home.replace(/\/$/, "")}/${relative.replace(/^\.?\//, "")}`;
}
