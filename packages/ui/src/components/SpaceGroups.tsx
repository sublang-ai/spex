// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The groups list of the Space surface (space-1, space-61, DR-103,
// DR-127, DR-159, DR-172): each Space the home lists under its heading
// (SpaceInstance) — "Personal" first, your sessions and the projects in
// your namespace there, then its groups as a tree in the order of their
// paths, a group inside a group nested within it, then every other
// account's login under "Shared by @<login>" — and after them "This
// computer", what stands in no group: your sessions before any sign-in
// and each project not yet shared. A group's heading carries its name,
// its path where the two differ, its member count where read, and one
// overflow control, "More", holding Members alone; beneath it, one line
// per team server of that group (run-view-170), then its rows, then one
// quiet line, with no control, per row standing elsewhere a placement of
// which its listing holds, naming the row and where it stands (DR-128).
//
// A row is a project, never a spex repository by its name: the
// repository's with its `-spex` dropped, a group's own reading "Group
// sessions" and your own group's own "Your sessions" — a glyph titled by
// where its code is, the places it is open at ("Here", "On <server>"),
// one standing phrase (space-120), one primary control and one overflow
// control (space-1). The primary control is the first place it may be
// opened at (space-111): this place's entry — "Open here", titled as
// downloading the records and the code, "Show", or, for a clone whose
// code found no folder, "Choose folder…" (at a seat "Try again") — then
// each server of the Space the member may open, "Open on <server>" or
// "Show on <server>", the other places offered in a menu beside it. A
// row whose state offers another control reads it instead: "Add to a
// group…" for a project in no group, disabled and titled "Sign in to a
// Space first" while no Space it would offer is signed in (space-58),
// Retry for one unreachable. The phrase carries its way forward: Resolve
// with the picker beneath the row (space-14), "Combine…" confirmed
// inline (space-13), Continue saying the sharing confirm (space-57),
// Retry (space-15). The overflow holds "Sync now", Members, "Explore
// records" and, on a clone holding no placement at a Space, "Add to a
// group…". Moving a project to another group, placing its records at a
// second Space, leaving one and attaching a copy another computer added
// are not offered here (DR-172). What an act opens stands beneath its
// row: the group picker (space-58), the folder an Open asks for on the
// served page (space-63), the sharing confirm (space-57) and the members
// panel. Activating a row's name opens its Sync and Explore tabs beneath
// the list, the Sync tab carrying its placements' lines (space-87). No
// part of the list links a page of the Space, or names what stands
// behind it (space-1). At a remote place an Open names no folder, its
// core allocating one, and a clone whose code clone failed offers "Try
// again" with "Add a credential" where the failure names a code host
// wanting the member's credential (space-103, run-view-169). Every act
// is a command whose outcome arrives as state (space-29).

import { useContext, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type {
  GroupsState,
  InstanceGroupState,
  InstanceState,
  PlacementState,
  RepositoryState,
  ServerInfo,
  ServerListing,
} from "@sublang/spex-core/protocol";

import { useEachPlace, usePlaceStore } from "../state/place-context.js";
import { isLocalPlace, placeLabel, type AppState, type SpaceGroupChoice } from "../state/store.js";
import {
  dismissOpen,
  hostIdAt,
  openOnServer,
  pendingKey,
  seatHolding,
  serverPlace,
  useServerOpens,
} from "../state/server-opens.js";
import { i18n } from "../i18n.js";
import {
  anySignedIn,
  entriesOf,
  governingOf,
  groupTestKey,
  instanceName,
  namespaceOf,
  ownPersonalAt,
  pickInstances,
  standingOf,
  thisComputerRows,
} from "../lib/instances.js";
import type { SpexCommandError } from "../lib/client.js";
import {
  alsoPlacedAt,
  canRun,
  governingOfPlacement,
  heldPlacements,
  instanceNameAt,
  instancePlacements,
  keyPlacement,
  owesNotice,
  placementAt,
  placementName,
  rowPlacement,
  runnable,
} from "../lib/placements.js";
import {
  awaitsFolder,
  cloneHere,
  codeOf,
  isGroupRepository,
  lastSegment,
  personalLabel,
  phraseNames,
  pickDirectoryBridge,
  projectName,
  rowName,
  rowPhrase,
  sameCode,
  seatName,
  thisComputerLabel,
} from "../lib/space.js";
import { AddInstance, InstanceSection } from "./SpaceInstance.js";
import { GroupServers, InstanceServers } from "./SpaceServers.js";
import { MembersPanel } from "./SpaceMembers.js";
import { MenuButton, MoreMenu, type MenuEntry } from "./SpaceMenu.js";
import { CombineConfirm, SharingConfirm, combineLabel, combiningLabel, continueLabel, entryName, placementGroupName } from "./SpacePlacements.js";
import type { SignInFlow } from "./SpaceSignIn.js";
import { ChoicesContext, ConflictsPicker, stoppedRetryInput } from "./SpaceSync.js";
import { SECONDARY, syncRefusal, type Note } from "./SpaceSurface.js";

/** An entry's identity under its Space's heading (space-1, DR-127): a
 * group by its id, a namespace by its login, a group no read lists by
 * its path. */
function entryKey(group: InstanceGroupState): string {
  return group.id !== null ? `id:${group.id}` : group.login !== null ? `@${group.login}` : `path:${group.fullPath}`;
}

/** "This computer" as an entry of the list (space-1): its rows, with
 * nothing a read lets the person do there. */
function thisComputerEntry(groups: GroupsState): InstanceGroupState {
  return {
    id: null,
    login: null,
    mine: false,
    fullPath: groups.own.name,
    name: groups.own.name,
    can: { createSubgroup: false, manageMembers: false, rename: false, delete: false },
    placed: [],
    repositories: thisComputerRows(groups),
  };
}

/** "Personal" at a Space (space-1): your namespace there, with your own
 * group's own repository first where it stands there; none while it
 * holds no row and no line of a row standing elsewhere. */
function personalEntry(groups: GroupsState, instance: InstanceState, seat?: string): InstanceGroupState | undefined {
  const mine = namespaceOf(instance);
  const own = ownPersonalAt(groups) === instance ? groups.own.repositories.find((repo) => repo.own) : undefined;
  const rows = [...(own ? [own] : []), ...(mine?.repositories ?? []).filter((repo) => repo.key !== own?.key)];
  const login = instance.account.login;
  const entry: InstanceGroupState = {
    ...(mine ?? {
      id: null,
      login,
      mine: true,
      fullPath: login,
      name: login,
      can: { createSubgroup: false, manageMembers: false, rename: false, delete: false },
      placed: [],
    }),
    repositories: rows,
  };
  return rows.length > 0 || placedLines(groups, entry, seat).length > 0 ? entry : undefined;
}

/** How a row standing elsewhere reads as a line under an entry whose
 * listing holds one of its placements (space-1, DR-128): the row's name
 * and the heading it stands under — a group by its name, "Personal" and
 * its Space, another account's login, or this computer, the server at a
 * seat's place (space-112). None for a key the state does not stand. */
function placedReading(groups: GroupsState, line: InstanceGroupState["placed"][number], seat?: string): string | undefined {
  const stands = standingOf(groups, line.key);
  if (!stands) return undefined;
  if (stands.own) {
    const repo = groups.own.repositories.find((each) => each.key === line.key);
    if (!repo) return undefined;
    const name = rowName({ fullPath: groups.own.name }, repo);
    const personal = repo.own ? ownPersonalAt(groups) : undefined;
    if (personal) {
      return i18n._({
        id: "{name} · in Personal at {space}",
        values: { name, space: instanceName(personal) },
        comment: "a quiet line, with no control, under a group or Personal of a Space whose listing holds a copy of records standing under Personal at another Space; {name} is the row's name, as Your sessions, {space} that Personal's Space by its display name",
      });
    }
    return seat === undefined
      ? i18n._({
          id: "{name} · on this computer",
          values: { name },
          comment: "a quiet line, with no control, under a group or Personal of a Space whose listing holds a copy of records standing under This computer; {name} is the row's name",
        })
      : i18n._({
          id: "{name} · on {place}",
          values: { name, place: seat },
          comment: "a quiet line, with no control, on a team server's Space: a copy of records standing under the server's own heading; {name} is the row's name, {place} the server's name",
        });
  }
  const repo = stands.group.repositories.find((each) => each.key === line.key);
  if (!repo) return undefined;
  const name = rowName(stands.group, repo);
  const space = instanceName(stands.instance);
  if (stands.group.login !== null) {
    return stands.group.mine
      ? i18n._({
          id: "{name} · in Personal at {space}",
          values: { name, space },
          comment: "a quiet line, with no control, under a group or Personal of a Space whose listing holds a copy of records standing under Personal at another Space; {name} is the row's name, as Your sessions, {space} that Personal's Space by its display name",
        })
      : i18n._({
          id: "{name} · shared by @{login} at {space}",
          values: { name, login: stands.group.login, space },
          comment: "a quiet line, with no control, under a group of a Space whose listing holds a copy of records another account shares; {name} is the row's name, {login} that account's login, {space} the Space where the row stands, by its display name",
        });
  }
  return i18n._({
    id: "{name} · in {group} at {space}",
    values: { name, group: stands.group.name, space },
    comment: "a quiet line, with no control, under a group or Personal of a Space whose listing holds a copy of records standing in another group; {name} is the row's name, {group} the group it stands under, by its name, {space} that group's Space by its display name",
  });
}

/** The lines an entry shows (space-1, DR-128): one per row standing
 * elsewhere one of whose placements its listing holds, a row standing
 * in the entry itself drawing none. */
function placedLines(groups: GroupsState, group: InstanceGroupState, seat?: string): { key: string; reading: string; title: string }[] {
  return group.placed.flatMap((line) => {
    if (group.repositories.some((repo) => repo.key === line.key)) return [];
    const reading = placedReading(groups, line, seat);
    if (reading === undefined) return [];
    // A group's path rides the title where its name alone may repeat.
    const stands = standingOf(groups, line.key);
    const path = stands && !stands.own && stands.group.login === null && stands.group.fullPath !== stands.group.name ? stands.group.fullPath : null;
    return [{ key: line.key, reading, title: path === null ? reading : `${reading} · ${path}` }];
  });
}

/** Whether a row waits for a sign-in (space-11, space-61): a clone
 * holding placements can run none of them — no path placement, which
 * this computer reaches without a Space, and no Space governing one
 * signed in; a row holding none, while the Space governing it is signed
 * out, or while the home is signed in nowhere where none does. */
function signedOutFor(groups: GroupsState, repo: RepositoryState, governing: InstanceState | undefined): boolean {
  const held = heldPlacements(repo);
  if (held.length > 0) return !held.some((line) => canRun(groups, repo, line));
  return governing ? !governing.signedIn : !anySignedIn(groups);
}

/** Why Sync is refused before its first step on this row (space-11):
 * the surface's own reasons, the sign-in first where no placement can
 * run, naming the first placement's Space by its display name as last
 * read, else its host name. */
export function rowSyncRefusal(
  groups: GroupsState,
  repo: RepositoryState,
  governing: InstanceState | undefined,
): string | undefined {
  if (signedOutFor(groups, repo, governing)) {
    const first = keyPlacement(repo)?.instance ?? governing?.origin;
    if (first) {
      return i18n._({
        id: "Sign in to {name} first",
        values: { name: instanceNameAt(groups, first) },
        comment: "beside a disabled Sync now: the project's Space is signed out; {name} its display name, or its host name before any read",
      });
    }
  }
  return syncRefusal(groups, repo);
}

/** The words of "Add to a group…" (space-58, space-61, DR-159). */
const addToGroupLabel = (): string =>
  i18n._({ id: "Add to a group…", comment: "on a project in no group: opens the groups at each Space its records may be shared into, Personal first" });

/** The title of a disabled "Add to a group…" (space-61). */
const signInFirstLabel = (): string =>
  i18n._({ id: "Sign in to a Space first", comment: "the title of a disabled Add to a group…: no Space is signed in to share the project into" });

/** Each place's projects and Groups state, by its place's key: what a
 * row reads of every seat (space-1, space-111). */
type Holdings = ReadonlyMap<string, Pick<AppState, "projects" | "space">>;

/** The groups list (space-1): each Space the home lists under its
 * heading in the home's order — "Personal", its groups as a tree, other
 * accounts' logins, its servers under their group (run-view-170) — then
 * "This computer" while it holds any row, and while the home lists any
 * Space, "Add a Space…" at its foot. */
export function GroupsList({
  groups,
  now,
  selected,
  connected,
  refreshes,
  dismissed,
  signIn,
  servers,
  onAddCredential,
  onSelect,
  onExplore,
  onOpenProject,
  onNote,
}: {
  groups: GroupsState;
  now: number;
  selected?: string;
  connected: boolean;
  /** How many times the reader's own Refresh has re-read the state. */
  refreshes: number;
  /** The sync phase the reader dismissed on each row's Sync tab, by its
   * key: the outcomes it put away stay away on its row and lines. */
  dismissed: Readonly<Record<string, string>>;
  signIn: SignInFlow;
  /** The servers listing, read at this computer alone (run-view-170). */
  servers?: ServerListing;
  /** Open this place's Credentials section at a code host (space-103,
   * settings-48). */
  onAddCredential?: (host: string) => void;
  onSelect(key: string): void;
  /** Open a row's Explore tab (space-1). */
  onExplore(key: string): void;
  /** Show a project on the Projects surface at a place, this one where
   * none is named (space-111). */
  onOpenProject(projectId: string, place?: string): void;
  onNote: Note;
}) {
  // Every seat's projects and Groups state, each row reading where it is
  // open (space-1, space-111).
  const places = useEachPlace((state) => ({ projects: state.projects, space: state.space }));
  const holdings: Holdings = new Map(places.map(({ store, value }) => [store.place.key, value]));
  const shared = {
    groups,
    now,
    selected,
    connected,
    refreshes,
    dismissed,
    servers,
    holdings,
    onAddCredential,
    onSelect,
    onExplore,
    onOpenProject,
    onNote,
  };
  const local = thisComputerEntry(groups);
  const seat = seatName(usePlaceStore().place);
  return (
    <section
      data-testid="space-groups"
      aria-label={i18n._({ id: "Your groups", comment: "the list of each Space's groups and their projects, and what is on this computer alone" })}
      className="flex min-w-0 flex-col gap-4"
    >
      {groups.instances.map((instance) => {
        const entries = entriesOf(instance);
        const personal = personalEntry(groups, instance, seat);
        const tree = groupTree(entries.filter((entry) => entry.login === null));
        return (
          <InstanceSection
            key={instance.origin}
            instance={instance}
            now={now}
            connected={connected}
            signIn={signIn}
            onNote={onNote}
          >
            {personal ? <GroupSection key={entryKey(personal)} {...shared} instance={instance} group={personal} subgroups={[]} /> : null}
            {tree.map((node) => (
              <GroupSection key={entryKey(node.group)} {...shared} instance={instance} group={node.group} subgroups={node.children} />
            ))}
            {entries
              .filter((entry) => entry.login !== null && !entry.mine)
              .map((entry) => (
                <GroupSection key={entryKey(entry)} {...shared} instance={instance} group={entry} subgroups={[]} />
              ))}
            {instance.signedIn && servers ? (
              <InstanceServers
                instance={instance}
                listing={servers}
                groups={entries.filter((entry) => entry.login === null).map((entry) => entry.fullPath)}
                connected={connected}
                onNote={onNote}
              />
            ) : null}
          </InstanceSection>
        );
      })}
      {local.repositories.length > 0 ? <GroupSection {...shared} group={local} subgroups={[]} /> : null}
      {groups.instances.length > 0 ? (
        // The list's foot: another Space to sign in to (space-1, space-3),
        // its card stacking within its own width (space-28).
        <div className="@container flex min-w-0 flex-col border-t border-neutral-200 pt-3 dark:border-neutral-800">
          <AddInstance groups={groups} connected={connected} signIn={signIn} />
        </div>
      ) : null}
    </section>
  );
}

/** A group and the groups inside it (space-1). */
interface GroupNode {
  group: InstanceGroupState;
  children: GroupNode[];
}

/** A Space's groups as a tree in the order of their paths (space-1): a
 * group within the nearest group it lies inside. */
function groupTree(entries: InstanceGroupState[]): GroupNode[] {
  const sorted = [...entries].sort((a, b) => a.fullPath.localeCompare(b.fullPath));
  const nodes = new Map(sorted.map((group) => [group, { group, children: [] as GroupNode[] }]));
  const roots: GroupNode[] = [];
  for (const group of sorted) {
    const node = nodes.get(group)!;
    const path = group.fullPath.toLowerCase();
    const parent = sorted
      .filter((other) => other !== group && path.startsWith(`${other.fullPath.toLowerCase()}/`))
      .sort((a, b) => b.fullPath.length - a.fullPath.length)[0];
    if (parent) nodes.get(parent)!.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** How an entry reads on its heading (space-1): "This computer" outside
 * every Space; your namespace "Personal"; another account's login
 * "Shared by @<login>"; a group by its name, its path beside it where
 * the two differ. */
function groupReading(group: InstanceGroupState, instance: InstanceState | undefined): { name: string; beside: string | null } {
  if (!instance) return { name: thisComputerLabel(), beside: null };
  if (group.login !== null) {
    return group.mine
      ? { name: personalLabel(), beside: null }
      : {
          name: i18n._({
            id: "Shared by @{login}",
            values: { login: group.login },
            comment: "the heading of the projects another account at the Space shares with you; {login} is that account's login",
          }),
          beside: null,
        };
  }
  return { name: group.name, beside: group.fullPath !== group.name ? group.fullPath : null };
}

/** How a Space's entry reads in a picker (space-58), as the list reads
 * it (space-1): a group by its name with its path beside it where the
 * two differ; your namespace "Personal". */
function entryReading(entry: InstanceGroupState): { name: string; beside: string | null } {
  if (entry.login !== null) return { name: entryName(entry), beside: null };
  return { name: entry.name, beside: entry.fullPath !== entry.name ? entry.fullPath : null };
}

/** A Space's entry as a picker names it (space-58): its name, then its
 * path after the separator where the two differ — the separator the
 * eye's, so the option's name says the group's name first. */
function GroupOptionLabel({ entry }: { entry: InstanceGroupState }) {
  const { name, beside } = entryReading(entry);
  return (
    <>
      <span className="min-w-0 truncate" title={entry.login !== null ? name : entry.fullPath}>
        {name}
      </span>
      {beside !== null ? " " : null}
      {beside !== null ? (
        <span className="min-w-0 truncate text-xs text-neutral-500" title={beside}>
          <span aria-hidden>· </span>
          {beside}
        </span>
      ) : null}
    </>
  );
}

/** A group's member count where the last read holds one (space-1): its
 * own spex repository's members at its Space — the group's members and
 * any its repository adds — which the read carries; none otherwise. */
function memberCount(instance: InstanceState, group: InstanceGroupState): number | null {
  const own = group.repositories.find((repo) => !repo.own && isGroupRepository(group, repo));
  if (!own) return null;
  return (placementAt(own, instance.origin) ?? rowPlacement(own))?.members ?? null;
}

/** What every section and row reads from the list (space-1). */
interface Shared {
  groups: GroupsState;
  now: number;
  selected?: string;
  connected: boolean;
  refreshes: number;
  dismissed: Readonly<Record<string, string>>;
  servers?: ServerListing;
  holdings: Holdings;
  onAddCredential?: (host: string) => void;
  onSelect(key: string): void;
  onExplore(key: string): void;
  onOpenProject(projectId: string, place?: string): void;
  onNote: Note;
}

/** One entry of the list (space-1): "This computer", where `instance` is
 * none, or "Personal", a group or another account's login under a
 * Space's heading. Its heading — a group of a signed-in Space carrying
 * one "More" holding Members, the others none (DR-114, DR-172) — then
 * its servers' lines, its rows, and the groups inside it. */
function GroupSection({
  instance,
  group,
  subgroups,
  ...shared
}: Shared & {
  /** The Space whose heading the entry stands under; none for "This
   * computer". */
  instance?: InstanceState;
  group: InstanceGroupState;
  subgroups: GroupNode[];
}) {
  const { connected, refreshes, servers, onNote } = shared;
  const seat = seatName(usePlaceStore().place);
  const [opened, setOpened] = useState<"members">();
  const moreRef = useRef<HTMLButtonElement>(null);
  const { name, beside } = groupReading(group, instance);
  // A group a signed-in Space lists names its members; "Personal",
  // another account's login and "This computer" carry no act (DR-114,
  // DR-120).
  const hostGroup = instance?.signedIn && group.login === null && group.id !== null ? group.id : null;
  const local = instance === undefined;
  const testKey = local ? "own" : groupTestKey(group);
  const Heading = local ? "h2" : "h3";
  const members = instance && group.login === null ? memberCount(instance, group) : null;
  const close = () => {
    setOpened(undefined);
    // Closing never strands focus (DR-010 §6).
    setTimeout(() => moreRef.current?.focus(), 0);
  };

  const entries: MenuEntry[] =
    hostGroup === null
      ? []
      : [
          {
            label: i18n._({ id: "Members", comment: "list the people who read a project's records, or a group's members, at the Space" }),
            testId: `space-group-members-${group.fullPath}`,
            onSelect: () => setOpened((was) => (was === "members" ? undefined : "members")),
          },
        ];

  const rows = group.repositories;
  // Each row standing elsewhere one of whose placements this entry's
  // listing holds, named with where it stands (space-1, DR-128).
  const placed = instance ? placedLines(shared.groups, group, seat) : [];
  const lines = instance && servers ? (
    <GroupServers instance={instance} group={group.fullPath} listing={servers} connected={connected} onNote={onNote} />
  ) : null;
  const serverCount = instance
    ? (servers?.servers ?? []).filter((server) => server.instance === instance.origin && server.group.toLowerCase() === group.fullPath.toLowerCase()).length
    : 0;

  return (
    <div
      role="group"
      aria-label={group.login === null && !local ? group.fullPath : name}
      data-testid={local ? "space-own" : `space-group-${testKey}`}
      className="@container flex min-w-0 flex-col gap-2"
    >
      {/* The name owns the slack; what stands beside it follows the
          separator in the secondary tone (space-1). Below @md the
          heading keeps its own row above its act (space-28). */}
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <Heading className="flex min-w-0 flex-1 basis-40 items-baseline gap-2 text-sm font-medium">
          <span className="min-w-0 truncate" title={group.login === null && !local ? group.fullPath : name}>
            {name}
          </span>
          {beside !== null ? " " : null}
          {beside !== null ? (
            <span
              data-testid={`space-heading-beside-${testKey}`}
              className="min-w-0 truncate text-xs font-normal text-neutral-500"
              title={beside}
            >
              <span aria-hidden>· </span>
              {beside}
            </span>
          ) : null}
          {members !== null ? " " : null}
          {members !== null ? (
            <span data-testid={`space-group-count-${group.fullPath}`} className="shrink-0 text-xs font-normal text-neutral-500">
              <span aria-hidden>· </span>
              {i18n._("{count, plural, one {# member} other {# members}}", { count: members })}
            </span>
          ) : null}
        </Heading>
        <MoreMenu of={group.fullPath} testId={`space-group-more-${group.fullPath}`} buttonRef={moreRef} entries={entries} disabled={!connected} />
      </div>
      {opened === "members" && hostGroup !== null && instance ? (
        <MembersPanel
          instance={instance}
          target={{ instance: instance.origin, group: hostGroup }}
          id={`group:${group.fullPath}`}
          name={group.fullPath}
          canManage={group.can.manageMembers}
          connected={connected}
          refreshes={refreshes}
          onClose={close}
          onNote={onNote}
        />
      ) : null}
      {lines}
      {rows.length > 0 || placed.length > 0 ? (
        <ul className="flex min-w-0 flex-col gap-0.5">
          {rows.map((repo) => (
            <RepositoryRow key={repo.key} {...shared} instance={instance} group={group} repo={repo} />
          ))}
          {/* A row standing elsewhere reads here as one quiet line, in
              the secondary tone, with no control: it is acted on where
              it stands (space-1, DR-128). The line truncates, its title
              keeping the whole (space-28). */}
          {placed.map((line) => (
            <li
              key={`placed:${line.key}`}
              data-testid={`space-placed-${line.key}`}
              className="min-w-0 truncate pl-2 text-xs text-neutral-500"
              title={line.title}
            >
              {line.reading}
            </li>
          ))}
        </ul>
      ) : serverCount === 0 && subgroups.length === 0 ? (
        <p className="pl-2 text-xs text-neutral-500">{i18n._({ id: "No projects here yet", comment: "beneath a group holding no project yet" })}</p>
      ) : null}
      {subgroups.length > 0 ? (
        // A group inside a group stands within it, one step in (space-1).
        <div className="flex min-w-0 flex-col gap-3 border-l border-neutral-200 pl-3 dark:border-neutral-800">
          {subgroups.map((node) => (
            <GroupSection
              key={entryKey(node.group)}
              {...shared}
              instance={instance}
              group={node.group}
              subgroups={node.children}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

type Opened = "pick" | "join" | "folder" | "notice" | "members" | "resolve" | "combine";

/** The words of "Open here" (space-111). */
const openHereLabel = (): string =>
  i18n._({ id: "Open here", comment: "a project's primary control for the place shown: downloads its records and its code there" });

/** The glyph of a project's code (space-1): code brackets, its words
 * the title of the mark that carries it. */
function CodeGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4 2 8l4 4M10 4l4 4-4 4" />
    </svg>
  );
}

/** One spex repository's row (space-1, space-61, space-111,
 * space-120): the name owning the slack, its code glyph — hidden below
 * @md — the places it is open at, its one phrase with its way forward,
 * its primary control and its overflow, which keep their accessible
 * names at every width (space-28). */
function RepositoryRow({
  groups,
  instance,
  group,
  repo,
  now,
  selected,
  connected,
  refreshes,
  dismissed: dismissedByKey,
  servers,
  holdings,
  onAddCredential,
  onSelect,
  onExplore,
  onOpenProject,
  onNote,
}: Shared & {
  /** The Space whose heading the row stands under; none under "This
   * computer". */
  instance?: InstanceState;
  group: InstanceGroupState;
  repo: RepositoryState;
}) {
  const store = usePlaceStore();
  // A remote place's core allocates every project's folder (space-103,
  // run-view-169): its rows offer no folder picker and no path entry,
  // and an Open there names no folder.
  const remote = !isLocalPlace(store.place);
  const seat = seatName(store.place);
  const spaceSync = store((state) => state.spaceSync);
  const spaceFetch = store((state) => state.spaceFetch);
  const spaceJoin = store((state) => state.spaceJoin);
  const spaceRefresh = store((state) => state.spaceRefresh);
  const spaceLastAct = store((state) => state.spaceLastAct);
  const rebindProject = store((state) => state.rebindProject);
  const pending = useServerOpens((state) => state.pending);
  const useChoices = useContext(ChoicesContext);
  const dismissed = dismissedByKey[repo.key];
  const isSelected = selected === repo.key;
  const [opened, setOpened] = useState<Opened>();
  // What runs from this row: a sync — asked plainly, as a combining, or
  // as a retry — an open, or a read of the Spaces.
  const [busy, setBusy] = useState<"sync" | "combine" | "retry" | "join" | "refresh">();
  // A long command's reply is only "accepted": its control stays busy
  // until the machine's state moves, so nothing re-enables between the
  // reply and the state (DR-010 §3, space-29).
  const [accepted, setAccepted] = useState<{ op: "sync" | "combine" | "retry" | "join"; key: string }>();
  const [error, setError] = useState<string>();
  // The placement the row's sharing confirm names, by its Space's
  // origin, and what its Share sends beside `noticed` (space-57,
  // space-13).
  const [noticeAt, setNoticeAt] = useState<string | null>();
  const [carried, setCarried] = useState<{ join?: true }>({});
  const primaryRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLButtonElement>(null);
  const actRef = useRef<HTMLButtonElement>(null);

  const sync = repo.sync;
  const running = sync.phase === "running";
  const machineKey = `${repo.state}|${JSON.stringify(sync)}`;
  useEffect(() => {
    if (accepted && accepted.key !== machineKey) setAccepted(undefined);
  }, [accepted, machineKey]);

  // The Space governing the row, as the core names it, else its own
  // (space-1, space-61).
  const governing = governingOf(groups, repo);
  const groupRepository = isGroupRepository(group, repo);
  const name = rowName(group, repo);
  const close = (focus: "primary" | "more" | "act" = "more") => {
    setOpened(undefined);
    // Closing never strands focus (DR-010 §6): a control gone or busy
    // hands it to the row's name.
    setTimeout(() => {
      const active = document.activeElement;
      if (active && active !== document.body && active.isConnected) return;
      const target = { primary: primaryRef, more: moreRef, act: actRef }[focus].current ?? moreRef.current;
      (!target || target.disabled || !target.isConnected ? nameRef.current : target)?.focus();
    }, 0);
  };

  /** Say the sharing confirm of the placement at `origin` beneath the
   * row before its sync (space-57), its Share carrying `answer`. */
  const askNotice = (origin: string | null, answer: { join?: true } = {}) => {
    setNoticeAt(origin);
    setCarried(answer);
    setOpened("notice");
  };

  /** Sync every placement (space-12), with the confirm of the one
   * `placement` names answered (space-57) and the combining of records
   * started separately (space-13). A refusal for want of a confirm the
   * page's read missed says it for the placement the core names, else
   * the first that owes it; any other stands beneath the row. */
  const start = async (input: Parameters<typeof spaceSync>[1], op: "sync" | "combine" | "retry" = "sync") => {
    const key = machineKey;
    setBusy(op);
    setError(undefined);
    try {
      await spaceSync(repo.key, input);
      setAccepted({ op, key });
    } catch (cause) {
      const details = (cause as SpexCommandError).details;
      if (!input?.noticed && details?.notice === true) {
        const named = details.placement;
        const owing =
          (typeof named === "string" || named === null ? placementAt(repo, named) : undefined) ??
          heldPlacements(repo).find((line) => owesNotice(repo, line)) ??
          keyPlacement(repo);
        if (owing) {
          askNotice(owing.instance, input?.join ? { join: true } : {});
          return;
        }
      }
      const message = (cause as Error).message;
      setError(message);
      onNote(message);
    } finally {
      setBusy(undefined);
    }
  };

  /** Run again what stopped (space-15), as the Sync tab's Retry does: a
   * stopped check checks again, any other stop syncs again with the
   * choices made and the join this page asked. */
  const retryStopped = async () => {
    if (sync.phase === "stopped" && sync.op === "check") {
      const key = machineKey;
      setBusy("retry");
      setError(undefined);
      try {
        await spaceFetch(repo.key);
        setAccepted({ op: "retry", key });
      } catch (cause) {
        const message = (cause as Error).message;
        setError(message);
        onNote(message);
      } finally {
        setBusy(undefined);
      }
      return;
    }
    const choicesKey = `${store.place.key}|${repo.key}`;
    const { inputs, choices } = useChoices.getState();
    await start(stoppedRetryInput(groups, repo, inputs[choicesKey], choices[choicesKey], spaceLastAct(repo.key)), "retry");
  };

  /** Open here a repository a Space lists (space-63, space-111), at the
   * Space whose heading the row stands under (space-29), else the one
   * the row names: a row not on this computer stands under the Space
   * whose read lists it. At a remote place no folder is named: its core
   * allocates one (space-103). */
  const join = async (folder?: string): Promise<void> => {
    const at = instance?.origin ?? repo.instance;
    if (!repo.id || !at) return;
    const key = machineKey;
    setBusy("join");
    setError(undefined);
    try {
      await spaceJoin(at, repo.id, folder);
      setAccepted({ op: "join", key });
      setOpened(undefined);
    } catch (cause) {
      // The caller shows the refusal where the folder was asked for.
      onNote((cause as Error).message);
      throw cause;
    } finally {
      setBusy(undefined);
    }
  };

  /** Pair a clone with a folder on this computer (space-63, space-47):
   * the code clone that failed leaves the records here. */
  const pair = async (folder: string): Promise<void> => {
    setError(undefined);
    try {
      await rebindProject(repo.key, folder, []);
      setOpened(undefined);
    } catch (cause) {
      onNote((cause as Error).message);
      throw cause;
    }
  };

  /** Open at a remote place (space-103, run-view-169): `space.join` with
   * no folder — again, after a code clone that failed, cloning its code
   * into the folder that place allocated — the refusal standing beneath
   * the row. */
  const joinRemote = async (): Promise<void> => {
    try {
      await join();
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  /** Ask for a folder through the shell's picker, opened by the act
   * itself, where it offers one, else in place (space-63). */
  const askFolder = async (which: "join" | "folder") => {
    const pick = pickDirectoryBridge();
    if (!pick) {
      setOpened(which);
      return;
    }
    const folder = await pick();
    if (!folder) return;
    try {
      await (which === "join" ? join(folder) : pair(folder));
    } catch (cause) {
      // The refusal stands beneath the row (space-63).
      setError((cause as Error).message);
    }
  };

  /** Read every signed-in Space again, as Refresh does (space-2). */
  const refresh = async () => {
    setBusy("refresh");
    setError(undefined);
    try {
      await spaceRefresh();
    } catch (cause) {
      const message = (cause as Error).message;
      setError(message);
      onNote(message);
    } finally {
      setBusy(undefined);
    }
  };

  const disabled = !connected;
  const working = busy !== undefined || accepted !== undefined || running;
  const readOnly = repo.state === "read-only";
  const here = cloneHere(repo);
  const syncs = here && (repo.state === "reachable" || readOnly);
  const refusal = syncs ? rowSyncRefusal(groups, repo, governing) : undefined;
  // The first send to a placement others share asks once (space-57):
  // where every placement this sync would run owes it, the first owing
  // one's confirm comes first; where any other can run, the sync goes
  // and each owing one waits on its line for its Continue.
  const runs = heldPlacements(repo).filter((line) => runnable(groups, repo, line));
  const owing = runs.filter((line) => owesNotice(repo, line));
  const noticeFirst = runs.length > 0 && owing.length === runs.length ? owing[0] : undefined;
  const noticeLine = opened === "notice" && noticeAt !== undefined ? placementAt(repo, noticeAt) : undefined;
  const joining = busy === "join" || accepted?.op === "join" || (running && sync.op === "join");
  const syncing = busy === "sync" || accepted?.op === "sync" || (running && sync.op !== "join" && sync.op !== "check");
  const workingOn = (op: "combine" | "retry"): boolean => busy === op || accepted?.op === op;
  // The Spaces "Add to a group…" would offer (space-58, space-61): none
  // on a group's own records, your own group's among them.
  const offered = groupRepository ? [] : pickInstances(groups, repo);
  // A clone holding only its path placement adds itself to a group from
  // its overflow, the pick adding its first placement at a Space
  // (space-61, storage-35).
  const pickInMore =
    repo.state !== "local-only" && heldPlacements(repo).length > 0 && instancePlacements(repo).length === 0 && offered.length > 0;
  // The key placement's Members on one reachable at a signed-in Space
  // (space-62).
  const keyLine = here ? keyPlacement(repo) : undefined;
  const keyGoverning = keyLine ? governingOfPlacement(groups, repo, keyLine) : undefined;
  const showMembers = keyLine !== undefined && keyLine.instance !== null && keyGoverning?.signedIn === true && keyLine.state === "reachable";
  // A clone whose code found no folder here is paired later (space-63):
  // at a remote place it is opened again instead, its core cloning the
  // code into the folder it allocated (space-103).
  const needsFolder = awaitsFolder(group, repo) || (here && groupRepository && !repo.own && repo.folder === null && repo.state !== "local-only");
  // A code clone at a remote place that failed for want of the member's
  // credential names its host (space-103): the row opens that place's
  // Credentials section at it (settings-48).
  const credentialHost = remote && sync.phase === "stopped" ? sync.credential : undefined;

  // This place's entry of Open (space-111): "Open here" for a repository
  // not here; "Choose folder…" — at a seat "Try again" — for a clone
  // whose code found no folder; "Show" for one open here. Your own
  // records, always here, open nowhere else.
  const openHere = here && repo.folder !== null && repo.state !== "local-only";
  const openingLabel = (): string =>
    i18n._({ id: "Opening…", comment: "a project's row while it is opened here: its records and code are downloaded" });
  const hereEntries: MenuEntry[] = [];
  if (repo.state === "absent" && repo.id) {
    hereEntries.push({
      // The row's phrase reads "Opening…" while the join runs
      // (space-120): the control keeps its words, disabled.
      label: openHereLabel(),
      title: groupRepository
        ? seat === undefined
          ? i18n._({ id: "Downloads the records to this computer", comment: "the title of Open here on a group's own records, which hold no code" })
          : i18n._({
              id: "Downloads the records to {place}",
              values: { place: seat },
              comment: "the title of Open here on a group's own records at a team server: {place} is the server's name, which allocates the folder itself",
            })
        : seat === undefined
          ? i18n._({ id: "Downloads the records and the code to this computer", comment: "the title of a project's Open here" })
          : i18n._({
              id: "Downloads the records and the code to {place}",
              values: { place: seat },
              comment: "the title of a project's Open here at a team server: {place} is the server's name, which allocates the project's folder itself",
            }),
      testId: `space-row-open-here-${repo.key}`,
      disabled: joining,
      onSelect: () => void (remote ? joinRemote() : askFolder("join")),
    });
  } else if (needsFolder) {
    hereEntries.push(
      remote
        ? {
            label: i18n._({ id: "Try again", comment: "on a team server's project whose code download failed: open it again, downloading its code into the folder the server allocated" }),
            title: i18n._({
              id: "Downloads its code again into its folder on {place}",
              values: { place: placeLabel(store.place) },
              comment: "the title of 'Try again' on a team server's project whose code download failed: {place} is the server's name",
            }),
            testId: `space-row-join-again-${repo.key}`,
            disabled: running || !repo.id || joining,
            onSelect: () => void joinRemote(),
          }
        : {
            label: i18n._({ id: "Choose folder…", comment: "pick the project folder on this computer that a project's records pair with" }),
            title: i18n._({ id: "Pick the folder on this computer that holds its code", comment: "the title of Choose folder… on a project whose records are here without its folder" }),
            testId: `space-row-folder-${repo.key}`,
            disabled: running,
            onSelect: () => void askFolder("folder"),
          },
    );
  } else if (openHere) {
    hereEntries.push({
      label: i18n._({ id: "Show", comment: "a project's primary control where it is open at that place already: shows it on Projects" }),
      testId: `space-row-show-${repo.key}`,
      onSelect: () => onOpenProject(repo.key),
    });
  }

  // Each server of the row's Space the member may open (space-111):
  // "Show on <server>" where the project is open on its seat, else "Open
  // on <server>", the seat opened where none is and its join sent once
  // it is signed in. Your own records go to no server (space-102).
  const serverEntries: { server: ServerInfo; place: string; entry: MenuEntry; holds: boolean; waiting?: string; failed?: string; key: string }[] = [];
  const offersServers = !remote && !repo.own && instance !== undefined && repo.state !== "local-only" && repo.state !== "unreachable";
  for (const server of offersServers ? (servers?.servers ?? []).filter((each) => each.instance === instance!.origin) : []) {
    const hostId = hostIdAt(repo, server.instance);
    if (hostId === null) continue;
    const at = serverPlace(server);
    const holding = server.open ? (() => {
      const state = holdings.get(at);
      return state ? seatHolding(state, repo.key, server.instance, hostId) : undefined;
    })() : undefined;
    const key = pendingKey(at, hostId);
    const open = pending[key];
    const waiting = open && open.stage !== "failed" ? open.server : undefined;
    serverEntries.push({
      server,
      place: at,
      key,
      holds: holding !== undefined,
      waiting,
      failed: open?.stage === "failed" ? open.error : undefined,
      entry:
        holding?.projectId !== undefined
          ? {
              label: i18n._({
                id: "Show on {server}",
                values: { server: server.name },
                comment: "a project's Open entry where it is open on that team server already: shows it there on Projects; {server} is the server's name",
              }),
              testId: `space-row-show-at-${at}-${repo.key}`,
              onSelect: () => onOpenProject(holding.projectId!, at),
            }
          : {
              label: i18n._({
                id: "Open on {server}",
                values: { server: server.name },
                comment: "a project's Open entry for a team server: opens the member's seat there where none is, then the project on it; {server} is the server's name",
              }),
              testId: `space-row-open-at-${at}-${repo.key}`,
              disabled: waiting !== undefined || disabled,
              onSelect: () => openOnServer(store, server, { key: repo.key, hostId }),
            },
    });
  }
  const openEntries = [...hereEntries, ...serverEntries.map((each) => each.entry)];
  const waitingOn = serverEntries.find((each) => each.waiting !== undefined)?.waiting;
  const failedOpen = serverEntries.find((each) => each.failed !== undefined);

  // What the row's state offers in place of Open (space-61): "Add to a
  // group…" for a project in no group — disabled while no Space it would
  // offer is signed in, none on a group's own records — Retry for one
  // unreachable, none while its Space is signed out, and nothing for one
  // held as colliding.
  let primary: ReactNode = null;
  if (repo.state === "local-only") {
    if (!groupRepository) {
      const signedOut = offered.length === 0;
      primary = (
        <button
          ref={primaryRef}
          type="button"
          data-testid={`space-row-pick-${repo.key}`}
          className={`${SECONDARY} shrink-0 whitespace-nowrap`}
          aria-expanded={opened === "pick"}
          title={signedOut ? signInFirstLabel() : undefined}
          disabled={disabled || signedOut}
          onClick={() => setOpened((was) => (was === "pick" ? undefined : "pick"))}
        >
          {addToGroupLabel()}
        </button>
      );
    }
  } else if (repo.state === "unreachable") {
    if (!signedOutFor(groups, repo, governing)) {
      primary = (
        <button
          ref={primaryRef}
          type="button"
          data-testid={`space-row-retry-${repo.key}`}
          className={`${SECONDARY} shrink-0 whitespace-nowrap`}
          // Retry reads every signed-in Space again, as Refresh does
          // (space-2).
          title={i18n._({ id: "Reads every signed-in Space again", comment: "the title of Retry on records a Space could not be read for" })}
          disabled={disabled || busy === "refresh"}
          onClick={() => void refresh()}
        >
          {busy === "refresh"
            ? i18n._({ id: "Retrying…", comment: "the Retry control, while the retry is in flight" })
            : i18n._({ id: "Retry", comment: "run the stopped step again" })}
        </button>
      );
    }
  } else if (openEntries.length > 0) {
    // The first place as the primary control, the others beside it in
    // one menu (space-1, space-111).
    const [first, ...others] = openEntries as [MenuEntry, ...MenuEntry[]];
    primary = (
      <span className="inline-flex shrink-0 items-center gap-0.5">
        <button
          ref={primaryRef}
          type="button"
          data-testid={`space-row-open-${repo.key}`}
          // The one entry it stands for, as the menu would name it.
          data-entry={first.testId}
          className={`${SECONDARY} shrink-0 whitespace-nowrap`}
          title={first.title ?? first.name}
          aria-label={first.name}
          aria-expanded={opened === "join" || opened === "folder" ? true : undefined}
          disabled={disabled || first.disabled}
          onClick={first.onSelect}
        >
          {first.label}
        </button>
        {others.length > 0 ? (
          <MenuButton
            trigger={<span aria-hidden>▾</span>}
            name={i18n._({
              id: "More ways to open {name}",
              values: { name },
              comment: "the accessible name of the menu beside a project's primary control, listing the other servers, or this computer, it may be opened on; {name} is the project's name",
            })}
            testId={`space-row-places-${repo.key}`}
            entries={others}
            disabled={disabled}
          />
        ) : null}
      </span>
    );
  }

  // The row's one phrase (space-120): a server's open while it runs,
  // else the first its state and lines hold, a row under "This computer"
  // reading none.
  const phrase =
    waitingOn !== undefined
      ? {
          text: i18n._({
            id: "Opening on {server}…",
            values: { server: waitingOn },
            comment: "a project's row while it is opened on a team server: the seat opens, signs in, and downloads it; {server} is the server's name",
          }),
          title: "",
          tone: "running" as const,
          act: undefined,
        }
      : rowPhrase(repo, now, dismissed, phraseNames(groups, repo, seat), instance === undefined);
  // An unreachable row's own Retry, reading the Spaces again, stands for
  // a stop's too: one Retry on a row.
  const act = phrase.act?.kind === "retry" && repo.state === "unreachable" ? undefined : phrase.act;

  // Where its code is (space-1): a glyph titled by the core's phrase, a
  // warning in the attention tone where the project names no remote;
  // nothing for a group's own records, before the core knows, or on a
  // row under "This computer", which nobody shares yet.
  const code = groupRepository ? null : codeOf(repo, instance === undefined);

  const more: MenuEntry[] = [];
  if (syncs) {
    more.push({
      label: syncing
        ? i18n._({ id: "Syncing…", comment: "the Sync control, while the sync runs" })
        : i18n._({ id: "Sync now", comment: "send what is here and bring back anything new, now" }),
      // What it does is its own to say (DR-069).
      title: readOnly
        ? i18n._({ id: "Brings back anything new; sends nothing", comment: "the title of Sync now on records the Space lets this account only read" })
        : i18n._({ id: "Sends what is here and brings back anything new", comment: "the title of Sync now" }),
      hint: refusal,
      testId: `space-row-sync-${repo.key}`,
      disabled: refusal !== undefined || working,
      onSelect: () => {
        if (noticeFirst) askNotice(noticeFirst.instance);
        else void start({});
      },
    });
  }
  if (showMembers) {
    more.push({
      label: i18n._({ id: "Members", comment: "list the people who read a project's records, or a group's members, at the Space" }),
      testId: `space-row-members-${repo.key}`,
      onSelect: () => setOpened("members"),
    });
  }
  // Your own sessions on this computer alone carry no control (space-1).
  if (!(repo.own && repo.state === "local-only")) {
    more.push({
      label: i18n._({ id: "Explore records", comment: "open a project's records as an annotated tree, beneath the list" }),
      testId: `space-row-explore-${repo.key}`,
      onSelect: () => onExplore(repo.key),
    });
  }
  if (pickInMore) {
    more.push({
      label: addToGroupLabel(),
      testId: `space-row-pick-${repo.key}`,
      onSelect: () => setOpened("pick"),
    });
  }

  const captionId = `space-row-caption-${repo.key}`;
  const caption = error ?? failedOpen?.failed;
  const describe = (part: string) => `space-repo-${part}-${repo.key}`;
  const badges = [
    ...(openHere && !repo.own ? [{ testId: `space-row-here-${repo.key}`, text: i18n._({ id: "Here", comment: "a project's mark: it is open at the place shown" }) }] : []),
    ...serverEntries
      .filter((each) => each.holds)
      .map((each) => ({
        testId: `space-row-on-${each.place}-${repo.key}`,
        text: i18n._({
          id: "On {server}",
          values: { server: each.server.name },
          comment: "a project's mark: it is open on that team server; {server} is the server's name",
        }),
      })),
  ];
  const describedBy = [code !== null ? describe("code") : null, phrase.text ? describe("state") : null].filter(Boolean).join(" ");
  const TONES: Record<string, string> = {
    idle: "text-neutral-500",
    running: "text-neutral-500",
    attention: "text-amber-700 dark:text-amber-300",
    stopped: "text-red-600 dark:text-red-400",
  };

  /** The words of the phrase's way forward (space-120). */
  const actLabel = (kind: NonNullable<typeof act>["kind"]): string => {
    switch (kind) {
      case "resolve":
        return i18n._({ id: "Resolve", comment: "beside \"Changed here and at <display name>\": opens the choices beneath the row" });
      case "combine":
        return workingOn("combine") ? combiningLabel() : combineLabel();
      case "continue":
        return continueLabel();
      case "retry":
        return workingOn("retry")
          ? i18n._({ id: "Retrying…", comment: "the Retry control, while the retry is in flight" })
          : i18n._({ id: "Retry", comment: "run the stopped step again" });
    }
  };
  const onAct = () => {
    if (!act) return;
    switch (act.kind) {
      case "resolve":
        setOpened((was) => (was === "resolve" ? undefined : "resolve"));
        return;
      case "combine":
        setOpened((was) => (was === "combine" ? undefined : "combine"));
        return;
      case "continue":
        if (opened === "notice") close("act");
        else askNotice(act.placement);
        return;
      case "retry":
        void retryStopped();
    }
  };
  const actExpanded = act?.kind === "resolve" ? opened === "resolve" : act?.kind === "combine" ? opened === "combine" : act?.kind === "continue" ? opened === "notice" : undefined;

  return (
    <li data-testid={`space-row-${repo.key}`} data-state={repo.state} className="@container flex min-w-0 flex-col gap-1">
      {/* The name owns the slack; below @xs the row's controls wrap
          beneath it, its primary control and overflow last (space-28,
          DR-041). */}
      <div
        className={`flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded px-2 py-1 text-sm ${
          isSelected ? "bg-brand-50 dark:bg-brand-950" : ""
        }`}
      >
        <button
          ref={nameRef}
          type="button"
          data-testid={`space-repo-${repo.key}`}
          data-state={repo.state}
          aria-label={name}
          aria-describedby={describedBy || undefined}
          aria-expanded={isSelected}
          aria-controls={isSelected ? "space-repository" : undefined}
          onClick={() => onSelect(repo.key)}
          title={name}
          className={`min-w-12 flex-1 basis-24 truncate rounded text-left font-medium hover:underline ${
            isSelected ? "text-brand-800 dark:text-brand-200" : ""
          }`}
        >
          {name}
        </button>
        {code !== null ? (
          <span
            id={describe("code")}
            data-testid={`space-repo-code-${repo.key}`}
            data-kind={code.kind}
            data-tone={code.tone}
            title={code.phrase}
            className={`hidden min-w-0 max-w-[40%] shrink-0 items-center gap-1 text-xs @md:inline-flex ${TONES[code.tone]}`}
          >
            {code.kind === "none" ? (
              <span className="min-w-0 truncate">
                <span aria-hidden>⚠ </span>
                {code.phrase}
              </span>
            ) : (
              <>
                <CodeGlyph />
                <span className="sr-only">{code.phrase}</span>
              </>
            )}
          </span>
        ) : null}
        {badges.map((badge) => (
          <span
            key={badge.testId}
            data-testid={badge.testId}
            className="shrink-0 rounded border border-neutral-300 px-1 text-[11px] leading-4 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
          >
            {badge.text}
          </span>
        ))}
        <span
          id={describe("state")}
          data-testid={`space-repo-state-${repo.key}`}
          data-tone={phrase.tone}
          // Beside the name from @md; beneath it below, the whole line
          // its own where the controls leave it room (space-28); empty
          // where the row reads no phrase (space-120).
          className={`min-w-0 max-w-full shrink truncate text-xs @md:max-w-[45%] ${TONES[phrase.tone]}`}
          title={phrase.title || undefined}
        >
          {phrase.text}
        </span>
        {act ? (
          <button
            ref={actRef}
            type="button"
            data-testid={`space-row-${act.kind}-${repo.key}`}
            className={`${SECONDARY} shrink-0 whitespace-nowrap`}
            aria-expanded={actExpanded}
            disabled={disabled || ((act.kind === "combine" || act.kind === "retry" || act.kind === "continue") && working)}
            onClick={onAct}
          >
            {actLabel(act.kind)}
          </button>
        ) : null}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {credentialHost !== undefined && onAddCredential ? (
            <button
              type="button"
              data-testid={`space-row-credential-${repo.key}`}
              className={`${SECONDARY} shrink-0 whitespace-nowrap`}
              title={i18n._({
                id: "Opens Credentials in this server's Settings at {host}",
                values: { host: credentialHost },
                comment: "the title of 'Add a credential' on a team server's project whose code could not be cloned: {host} is the code host needing the member's credential",
              })}
              onClick={() => onAddCredential(credentialHost)}
            >
              {i18n._({
                id: "Add a credential",
                comment: "on a team server's project whose code could not be cloned for want of the member's credential: open the server's Credentials settings",
              })}
            </button>
          ) : null}
          {primary}
          <MoreMenu of={name} testId={`space-row-more-${repo.key}`} buttonRef={moreRef} entries={more} disabled={disabled} />
        </span>
      </div>
      {caption ? (
        <p id={captionId} data-testid={captionId} role="alert" className="flex flex-wrap items-center gap-2 pl-6 text-xs text-red-600 dark:text-red-400">
          <span className="min-w-0">{caption}</span>
          {failedOpen && !error ? (
            <button type="button" className={SECONDARY} onClick={() => dismissOpen(failedOpen.key)}>
              {i18n._({ id: "Dismiss", comment: "put this outcome card away" })}
            </button>
          ) : null}
        </p>
      ) : null}
      {opened === "resolve" && act?.kind === "resolve" ? (
        // The choices beneath the row (space-14): the same picker, and
        // the same choices, as the Sync tab's.
        <div data-testid={`space-row-resolve-picker-${repo.key}`} className="ml-6 min-w-0 rounded border border-neutral-300 p-2 dark:border-neutral-700">
          <ConflictsPicker groups={groups} repo={repo} now={now} connected={connected} scope={`space-row-${repo.key}`} onNote={onNote} />
        </div>
      ) : null}
      {opened === "combine" && act?.kind === "combine" ? (
        <div data-testid={`space-row-combine-confirm-${repo.key}`} className="pl-6">
          <CombineConfirm
            onConfirm={() => {
              const placement = act.placement;
              close("act");
              void start({ placement, join: true }, "combine");
            }}
            onCancel={() => close("act")}
          />
        </div>
      ) : null}
      {opened === "pick" ? (
        <GroupPicker groups={groups} repo={repo} connected={connected} onClose={() => close(pickInMore ? "more" : "primary")} onNote={onNote} />
      ) : null}
      {opened === "members" && showMembers && keyGoverning && keyLine?.instance ? (
        <MembersPanel
          instance={keyGoverning}
          target={{ repository: repo.key, instance: keyLine.instance }}
          id={`${repo.key}@${keyLine.instance}`}
          name={name}
          canManage={keyLine.can.manageMembers}
          alsoPlacedAt={alsoPlacedAt(groups, repo, keyLine)}
          connected={connected}
          refreshes={refreshes}
          onClose={() => close()}
          onNote={onNote}
        />
      ) : null}
      {opened === "join" ? (
        <FolderEditor
          testId={`space-join-${repo.key}`}
          label={folderLabel(groupRepository)}
          initial=""
          submitLabel={openHereLabel()}
          busyLabel={openingLabel()}
          onSubmit={join}
          onCancel={() => close("primary")}
        />
      ) : null}
      {opened === "folder" ? (
        <FolderEditor
          testId={`space-folder-${repo.key}`}
          label={folderLabel(groupRepository)}
          initial=""
          submitLabel={i18n._({ id: "Use this folder", comment: "pair a project's records with the folder named" })}
          busyLabel={i18n._({ id: "Adding…", comment: "the Use this folder control, while the folder is paired" })}
          onSubmit={pair}
          onCancel={() => close("primary")}
        />
      ) : null}
      {noticeLine && noticeLine.instance !== null ? (
        <div data-testid="space-notice-confirm" className="pl-6">
          <SharingConfirm
            group={placementGroupName(groups, repo, noticeLine)}
            name={placementName(groups, noticeLine)}
            visibility={noticeLine.visibility}
            disabled={disabled}
            onShare={() => {
              close(act?.kind === "continue" ? "act" : "more");
              void start({ placement: noticeLine.instance, noticed: true, ...carried });
            }}
            onCancel={() => close(act?.kind === "continue" ? "act" : "more")}
          />
        </div>
      ) : null}
    </li>
  );
}

/** The caption of the folder an Open or a pairing asks for (space-63):
 * a group's own records' sessions run in it, a project's code lies in
 * it. */
function folderLabel(groupRepository: boolean): string {
  return groupRepository
    ? i18n._({ id: "Folder its sessions run in on this computer", comment: "the field a group's own records ask for: the folder their sessions run in" })
    : i18n._({ id: "Project folder on this computer", comment: "the field a project's records ask for: the folder its code is in, or is downloaded to" });
}

/** A folder named in place where the shell offers no picker
 * (space-63): the path, the act and Cancel, Escape cancelling, a
 * refusal kept beside the path. */
function FolderEditor({
  testId,
  label,
  initial,
  submitLabel,
  busyLabel,
  onSubmit,
  onCancel,
}: {
  testId: string;
  label: string;
  initial: string;
  submitLabel: string;
  busyLabel: string;
  onSubmit(folder: string): Promise<void>;
  onCancel(): void;
}) {
  const [path, setPath] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string>();
  const fieldRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    fieldRef.current?.focus();
  }, []);

  const submit = async () => {
    const folder = path.trim();
    if (!folder) {
      setRefusal(i18n._({ id: "Name a folder", comment: "the folder field's refusal of an empty path" }));
      fieldRef.current?.focus();
      return;
    }
    setBusy(true);
    setRefusal(undefined);
    try {
      await onSubmit(folder);
    } catch (cause) {
      setRefusal((cause as Error).message);
      fieldRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid={testId}
      className="ml-6 flex min-w-0 flex-col gap-1 rounded border border-neutral-300 p-2 dark:border-neutral-700"
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <label className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
        <span className="shrink-0 text-neutral-500">{label}</span>
        <input
          ref={fieldRef}
          data-testid={`${testId}-path`}
          value={path}
          onChange={(event) => setPath(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
          spellCheck={false}
          disabled={busy}
          className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-1.5 py-0.5 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={SECONDARY} disabled={busy} onClick={() => void submit()}>
          {busy ? busyLabel : submitLabel}
        </button>
        <button type="button" className={SECONDARY} disabled={busy} onClick={onCancel}>
          {i18n._({ id: "Cancel", comment: "leave the editor without changing anything" })}
        </button>
        {refusal ? (
          <span role="alert" className="min-w-0 text-xs text-red-600 dark:text-red-400">
            {refusal}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** One Space a pick offers (space-58): the spex repositories it lists
 * for the same code, each with the entry it stands in, and where new
 * records may go — "Personal" first, then each group it lists, never
 * another account's login. */
interface PickSection {
  instance: InstanceState;
  listed: { group: InstanceGroupState; repo: RepositoryState; placement: PlacementState | undefined }[];
  creatable: InstanceGroupState[];
}

/** Where a project in no group goes (space-58): in one picker, one
 * section per signed-in Space under its display name — the clone's
 * Space alone where its key lies under one — each holding "Join the
 * records already in", the spex repositories that Space lists for the
 * same code, each with its group, read as the list reads it, and its
 * members' count, and "Share into", "Personal" first and then every
 * group it lists; the new records take the folder's name, no field
 * naming them. Picking a listed one that may have other members says
 * the sharing confirm beneath it first, and joins with `noticed` only on
 * Share (space-57). A choice names the Space of its section
 * (space-29). */
export function GroupPicker({
  groups,
  repo,
  connected,
  onClose,
  onNote,
}: {
  groups: GroupsState;
  repo: RepositoryState;
  connected: boolean;
  onClose(): void;
  onNote: Note;
}) {
  const store = usePlaceStore();
  const spacePick = store((state) => state.spacePick);
  const sections: PickSection[] = pickInstances(groups, repo).map((instance) => {
    // "Personal" is always offered: a Space lists your namespace only
    // once it holds something there.
    const mine = namespaceOf(instance) ?? {
      id: null,
      login: instance.account.login,
      mine: true,
      fullPath: instance.account.login,
      name: instance.account.login,
      can: { createSubgroup: false, manageMembers: false, rename: false, delete: false },
      placed: [],
      repositories: [],
    };
    return {
      instance,
      // The listed ones are the Space's: a host id, a state it read.
      listed: instance.groups.flatMap((group) =>
        group.repositories
          .filter((other) => other.key !== repo.key && other.id !== null && other.state !== "local-only" && sameCode(other, repo))
          // Its members and visibility are its placement's there
          // (space-30).
          .map((other) => ({ group, repo: other, placement: placementAt(other, instance.origin) ?? rowPlacement(other) })),
      ),
      // GroupsState names no right to create a repository, so every
      // group is offered and a refusal waits on the row (space-64).
      creatable: [mine, ...instance.groups.filter((group) => group.id !== null && group.login === null).sort((a, b) => a.fullPath.localeCompare(b.fullPath))],
    };
  });
  // The new records take the folder's name (space-58).
  const name = repo.folder ? lastSegment(repo.folder) : repo.name.replace(/-spex$/, "");
  const [busy, setBusy] = useState<string>();
  const [refusal, setRefusal] = useState<string>();
  // The listed spex repository whose sharing confirm stands (space-57).
  const [notice, setNotice] = useState<string>();
  // Each section's headings are named by ids no other picker shares.
  const ids = useId();
  const pickerRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  // Where focus goes once a refused pick re-enables the picker: its
  // controls are disabled while the pick is asked (DR-010 §6).
  const refocus = useRef<() => void>(undefined);
  useEffect(() => {
    firstRef.current?.focus();
  }, []);
  useLayoutEffect(() => {
    if (busy !== undefined || !refocus.current) return;
    const focus = refocus.current;
    refocus.current = undefined;
    focus();
  }, [busy]);

  const optionOf = (key: string) =>
    pickerRef.current?.querySelector<HTMLButtonElement>(`[data-testid="space-pick-repo-${key}"], [data-testid="space-pick-group-${key}"]`);

  /** Cancel starts nothing; focus returns to the option (DR-010 §6). */
  const closeNotice = (key: string) => {
    setNotice(undefined);
    setTimeout(() => optionOf(key)?.focus(), 0);
  };

  const pick = async (id: string, choice: SpaceGroupChoice, noticed = false, focusKey = id) => {
    setBusy(id);
    setRefusal(undefined);
    try {
      await (noticed ? spacePick(repo.key, choice, true) : spacePick(repo.key, choice));
      onClose();
    } catch (cause) {
      const message = (cause as Error).message;
      setRefusal(message);
      onNote(message);
      // A refused pick hands focus back to its option, its confirm
      // closed (space-58).
      setNotice(undefined);
      refocus.current = () => optionOf(focusKey)?.focus();
    } finally {
      setBusy(undefined);
    }
  };

  /** Join a listed spex repository at its Space (space-58): one whose
   * only member is the account joins at once; one with others, or whose
   * count the Space's last read lacks, says the sharing confirm first
   * unless this computer's reader has answered it for that placement
   * (space-57). */
  const join = (instance: InstanceState, other: RepositoryState) => {
    const listed = placementAt(other, instance.origin) ?? rowPlacement(other);
    const members = listed?.members ?? null;
    if (!listed?.noticed && (members === null || members > 1)) {
      setRefusal(undefined);
      setNotice(other.key);
      return;
    }
    void pick(other.key, { kind: "join", instance: instance.origin, hostId: other.id! });
  };

  /** Create `<name>-spex` in an entry at its Space (space-58): your
   * namespace named by none, a group by its host id. */
  const create = (instance: InstanceState, group: InstanceGroupState) => {
    setNotice(undefined);
    void pick(
      `${instance.origin} ${groupTestKey(group)}`,
      { kind: "create", instance: instance.origin, groupId: group.mine ? null : group.id, name },
      false,
      groupTestKey(group),
    );
  };

  const option =
    "flex w-full min-w-0 items-center gap-2 rounded border border-neutral-200 px-2 py-1 text-left text-sm hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-800 dark:hover:bg-neutral-800";
  const disabled = !connected || busy !== undefined;
  let first = true;
  const takeFirst = () => {
    if (!first) return undefined;
    first = false;
    return firstRef;
  };

  return (
    <div
      ref={pickerRef}
      role="group"
      aria-label={i18n._({
        id: "Add {name} to a group",
        values: { name: projectName(repo.name) },
        comment: "the name of the group picker \"Add to a group…\" opens; {name} is the project's name",
      })}
      data-testid={`space-picker-${repo.key}`}
      className="ml-6 flex min-w-0 flex-col gap-2 rounded border border-neutral-300 p-2 dark:border-neutral-700"
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      {sections.map(({ instance, listed, creatable }, index) => {
        const heading = `${ids}-${index}`;
        return (
          <div
            key={instance.origin}
            role="group"
            aria-labelledby={heading}
            data-testid={`space-pick-instance-${instance.origin}`}
            className="flex min-w-0 flex-col gap-2"
          >
            <h3
              id={heading}
              className="min-w-0 truncate text-xs font-semibold text-neutral-700 dark:text-neutral-300"
              title={instanceName(instance)}
            >
              {instanceName(instance)}
            </h3>
            {listed.length > 0 ? (
              <section aria-labelledby={`${heading}-listed`} className="flex min-w-0 flex-col gap-1">
                <h4 id={`${heading}-listed`} className="text-xs font-medium text-neutral-500">
                  {i18n._({
                    id: "Join the records already in",
                    comment: "the picker's heading, inside one Space's section, over the projects that Space already holds for the folder's code, each with its group",
                  })}
                </h4>
                <ul className="flex min-w-0 flex-col gap-1">
                  {listed.map(({ group, repo: other, placement }) => (
                    <li key={other.key} className="min-w-0">
                      <button
                        ref={takeFirst()}
                        type="button"
                        data-testid={`space-pick-repo-${other.key}`}
                        className={option}
                        disabled={disabled}
                        onClick={() => join(instance, other)}
                      >
                        <span className="min-w-0 flex-1 truncate font-medium" title={projectName(other.name)}>
                          {rowName(group, other)}
                        </span>
                        <span
                          data-testid={`space-pick-listed-group-${other.key}`}
                          className="flex min-w-0 max-w-[40%] items-baseline gap-1 text-xs text-neutral-500"
                        >
                          <GroupOptionLabel entry={group} />
                        </span>
                        {placement && placement.members !== null ? (
                          <span className="shrink-0 text-xs text-neutral-500">
                            {i18n._("{count, plural, one {# member} other {# members}}", { count: placement.members })}
                          </span>
                        ) : null}
                      </button>
                      {notice === other.key ? (
                        <div data-testid={`space-pick-notice-${repo.key}`} className="mt-1 pl-2">
                          <SharingConfirm
                            group={entryName(group)}
                            name={instanceName(instance)}
                            visibility={placement?.visibility ?? null}
                            disabled={disabled}
                            onShare={() => void pick(other.key, { kind: "join", instance: instance.origin, hostId: other.id! }, true)}
                            onCancel={() => closeNotice(other.key)}
                          />
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <section aria-labelledby={`${heading}-create`} className="flex min-w-0 flex-col gap-1">
              <h4 id={`${heading}-create`} className="text-xs font-medium text-neutral-500">
                {i18n._({
                  id: "Share into",
                  comment: "the picker's heading, inside one Space's section, over Personal and the groups the project's records may be shared into",
                })}
              </h4>
              <ul className="flex min-w-0 flex-col gap-1">
                {creatable.map((group) => (
                  <li key={groupTestKey(group)} className="min-w-0">
                    <button
                      ref={takeFirst()}
                      type="button"
                      data-testid={`space-pick-group-${groupTestKey(group)}`}
                      className={option}
                      disabled={disabled}
                      onClick={() => create(instance, group)}
                    >
                      <GroupOptionLabel entry={group} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" data-testid={`space-pick-cancel-${repo.key}`} className={SECONDARY} onClick={onClose}>
          {i18n._({ id: "Cancel", comment: "leave the editor without changing anything" })}
        </button>
        {refusal ? (
          <span role="alert" className="min-w-0 text-xs text-red-600 dark:text-red-400">
            {refusal}
          </span>
        ) : null}
      </div>
    </div>
  );
}
