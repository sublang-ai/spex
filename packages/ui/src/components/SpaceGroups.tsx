// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The groups list of the Space surface (space-1, space-61, DR-103,
// DR-127, DR-159): your own records first under "Only you · @<login>" —
// your sessions, then each project here in no group — then each
// instance the home lists under its heading (SpaceInstance), its groups
// as a tree in the order of their paths, a subgroup within its group,
// your namespace there under "Only you" while it lists anything but your
// own group's repository, and every other account's login under "Shared
// by @<login>". A group's heading carries its name, its member count
// where read, and one overflow control, "More", holding Members, "New
// subgroup", "Rename" and "Delete" as the host lets the person act
// (space-68, space-76, space-77, DR-114); beneath it, one line per team
// server of that group (run-view-170), then its rows.
//
// A row is a project, never a spex repository by its name: the
// repository's with its `-spex` dropped, a group's own reading "Group
// sessions" and your own group's own "Your sessions" — where its code
// lives, the places it is open at ("Here", "On <server>"), one phrase
// for its records' standing (space-87), its local changes, one primary
// control and one overflow control (space-1). The primary control is
// Open (space-111): this place's entry — "Open here", "Show", or, for a
// clone whose code found no folder, "Choose folder…" (at a seat "Try
// again") — then each server of the instance the member may open, "Open
// on <server>" or "Show on <server>"; a menu where more than one stands,
// else that entry alone. A row whose state offers another control reads
// it instead: "Add to a group…" for a project in no group (space-58),
// Retry for one unreachable. Choices owed read "Changed here and at
// <display name>" with Resolve, the picker standing beneath the row
// (space-14); an unrelated history "Merge histories…" (space-13). The
// overflow holds "Sync now", Members, "Explore records", "Move…",
// "Place at…", "Leave…" and Attach as the row's state offers them
// (space-1, space-88, space-89, space-90). What an act opens stands
// beneath its row: the group picker (space-58), the folder an Open asks
// for on the served page (space-63), the first-push notice (space-57),
// a Place's picker, a Leave's confirm, the members panel, the move
// picker and Attach's notice. Activating a row's name opens its Sync and
// Explore tabs beneath the list, the Sync tab carrying its placements'
// lines (space-87). No part of the list links a page of the host, or
// names what stands behind the instance (space-1). At a remote place an
// Open names no folder, its core allocating one, and a clone whose code
// clone failed offers "Try again" with "Add a credential" where the
// failure names a code host wanting the member's credential (space-103,
// run-view-169). Every act is a command whose outcome arrives as state
// (space-29).

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
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
  pickInstances,
  signedInInstances,
  standingOf,
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
  leavePlacements,
  leaveStage,
  owesNotice,
  placeInstances,
  placementAt,
  placementName,
  rowPlacement,
  runnable,
  standingEntry,
} from "../lib/placements.js";
import {
  STEP_LINES,
  STEP_NAMES,
  awaitsFolder,
  cloneHere,
  displayRemote,
  isGroupRepository,
  lastSegment,
  pickDirectoryBridge,
  projectName,
  rowName,
  rowPhrase,
  sameRemote,
} from "../lib/space.js";
import { InlineConfirm } from "./InlineConfirm.js";
import { AddInstance, InstanceSection } from "./SpaceInstance.js";
import { GroupServers, InstanceServers } from "./SpaceServers.js";
import { GroupNameEditor, MembersPanel } from "./SpaceMembers.js";
import { MenuButton, MoreMenu, type MenuEntry } from "./SpaceMenu.js";
import { LeaveChoice, LeaveConfirm, PlaceChoice, alsoPlaceAt, leaveLabel, placeAtLabel, removeFrom } from "./SpacePlacementActs.js";
import { MergeConfirm, PlacementNotice, continueLabel, mergeHistoriesLabel, mergingLabel, sharingNotice } from "./SpacePlacements.js";
import type { SignInFlow } from "./SpaceSignIn.js";
import { ConflictsPicker } from "./SpaceSync.js";
import { SECONDARY, syncRefusal, type Note } from "./SpaceSurface.js";

/** An entry's identity under its instance's heading (space-1, DR-127):
 * a group by its id, a namespace by its login, a group no read lists by
 * its path. */
function entryKey(group: InstanceGroupState): string {
  return group.id !== null ? `id:${group.id}` : group.login !== null ? `@${group.login}` : `path:${group.fullPath}`;
}

/** Your own group as an entry of the list (space-1): its folder's name
 * and its rows, with nothing a read lets the person do there. */
function ownEntry(groups: GroupsState): InstanceGroupState {
  return {
    id: null,
    login: null,
    mine: false,
    fullPath: groups.own.name,
    name: groups.own.name,
    can: { createSubgroup: false, manageMembers: false, rename: false, delete: false },
    placed: [],
    repositories: groups.own.repositories,
  };
}

/** A repository's dot carries the status palette (DR-010 §8): neutral
 * idle, emerald running, amber choices and unrelated, red stopped. */
export function statusDot(repo: RepositoryState): { className: string; tone: string; word: string } {
  const sync = repo.sync;
  if (sync.phase === "running") {
    return { className: "bg-emerald-500 animate-pulse", tone: "running", word: STEP_LINES[sync.step]() };
  }
  if (sync.phase === "choices" || sync.phase === "unrelated") {
    return {
      className: "bg-amber-500",
      tone: "attention",
      word:
        sync.phase === "choices"
          ? i18n._({ id: "needs your choice", comment: "a spex repository's status, read in a title" })
          : i18n._({ id: "unrelated history", comment: "a spex repository's status, read in a title" }),
    };
  }
  if (sync.phase === "stopped") {
    const rejected = sync.cause === "rejected";
    return {
      className: rejected ? "bg-amber-500" : "bg-red-500",
      tone: rejected ? "attention" : "stopped",
      word: i18n._({
        id: "{step} stopped",
        values: { step: STEP_NAMES[sync.step]() },
        comment: "{step} is the sync step's name",
      }),
    };
  }
  return {
    className: "bg-neutral-400",
    tone: "idle",
    word: i18n._({ id: "idle", comment: "a spex repository's status: nothing is running" }),
  };
}

/** Whether a row waits for a sign-in (space-11, space-61): a clone
 * holding placements can run none of them — no path placement, which
 * this device reaches without an instance, and no instance governing
 * one signed in; a row holding none, while the instance governing it is
 * signed out, or while the home is signed in nowhere where none does. */
function signedOutFor(groups: GroupsState, repo: RepositoryState, governing: InstanceState | undefined): boolean {
  const held = heldPlacements(repo);
  if (held.length > 0) return !held.some((line) => canRun(groups, repo, line));
  return governing ? !governing.signedIn : !anySignedIn(groups);
}

/** Why Sync is refused before its first step on this row (space-11):
 * the surface's own reasons, the sign-in first where no placement can
 * run, naming the first placement's instance by its display name as
 * last read, else its host name. */
export function rowSyncRefusal(
  groups: GroupsState,
  repo: RepositoryState,
  governing: InstanceState | undefined,
): string | undefined {
  if (signedOutFor(groups, repo, governing)) {
    const first = keyPlacement(repo)?.instance ?? governing?.origin;
    if (first) {
      return i18n._({
        id: "Sign in to {host} first",
        values: { host: instanceNameAt(groups, first) },
        comment: "beside a disabled Sync: the row's instance is signed out; {host} its display name, or its host name before any read",
      });
    }
  }
  return syncRefusal(groups, repo);
}

/** The words of "Add to a group…" (space-58, space-61, DR-159). */
const addToGroupLabel = (): string =>
  i18n._({ id: "Add to a group…", comment: "on a project here in no group: opens the groups it may be put in, your own first" });

/** Your own records' heading word, and your namespace's (space-1). */
const onlyYouLabel = (): string =>
  i18n._({ id: "Only you", comment: "the heading of your own records, and of your namespace at an instance: what no one else reads" });

/** Each place's projects and Groups state, by its place's key: what a
 * row reads of every seat (space-1, space-111). */
type Holdings = ReadonlyMap<string, Pick<AppState, "projects" | "space">>;

/** The groups list (space-1): your own records first, then each
 * instance the home lists under its heading in the home's order, its
 * groups as a tree, its servers under their group (run-view-170), and
 * while it lists any instance, "Add instance…" at its foot. */
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
  return (
    <section
      data-testid="space-groups"
      aria-label={i18n._({ id: "Your groups", comment: "the list of the home's groups and their spex repositories" })}
      className="flex min-w-0 flex-col gap-4"
    >
      <GroupSection {...shared} group={ownEntry(groups)} subgroups={[]} />
      {groups.instances.map((instance) => {
        const entries = entriesOf(instance);
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
            {tree.map((node) => (
              <GroupSection key={entryKey(node.group)} {...shared} instance={instance} group={node.group} subgroups={node.children} />
            ))}
            {entries
              .filter((entry) => entry.login !== null && (!entry.mine || entry.repositories.length > 0))
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
      {groups.instances.length > 0 ? (
        // The list's foot: another instance to sign in to (space-1,
        // space-3), its card stacking within its own width (space-28).
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

/** An instance's groups as a tree in the order of their paths (space-1):
 * a subgroup within the nearest group it lies inside. */
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

/** How an entry reads on its heading (space-1): your own records "Only
 * you" beside your login, or, before any sign-in, beside "named after
 * your login at sign-in"; your namespace "Only you"; another account's
 * login "Shared by @<login>"; a group by its name. */
function groupReading(
  groups: GroupsState,
  group: InstanceGroupState,
  instance: InstanceState | undefined,
): { name: string; beside: string | null } {
  if (!instance) {
    return {
      name: onlyYouLabel(),
      beside:
        groups.instances.length === 0 && groups.own.named
          ? i18n._({
              id: "named after your login at sign-in",
              comment: "beside the heading 'Only you' before sign-in: its name and path come from the login",
            })
          : `@${groups.own.name}`,
    };
  }
  if (group.login !== null) {
    return group.mine
      ? { name: onlyYouLabel(), beside: null }
      : {
          name: i18n._({
            id: "Shared by @{login}",
            values: { login: group.login },
            comment: "the heading of the projects another account at the instance shares with you; {login} is that account's login",
          }),
          beside: null,
        };
  }
  return { name: group.name, beside: null };
}

/** How an instance's entry reads in a picker (space-58, space-78), as
 * the list reads it (space-1): a group by its name with its path in the
 * instance beside it where the two differ; your namespace by your login
 * there, or, where `ownAs` says, "Only you". */
function entryReading(entry: InstanceGroupState, ownAs: "login" | "only-you"): { name: string; beside: string | null } {
  if (entry.login !== null) return { name: ownAs === "only-you" && entry.mine ? onlyYouLabel() : entry.login, beside: null };
  return { name: entry.name, beside: entry.fullPath !== entry.name ? entry.fullPath : null };
}

/** An instance's entry as a picker names it (space-58, space-78): its
 * name, then its path after the separator where the two differ — the
 * separator the eye's, so the option's name says the group's name
 * first. */
function GroupOptionLabel({ entry, ownAs = "login" }: { entry: InstanceGroupState; ownAs?: "login" | "only-you" }) {
  const { name, beside } = entryReading(entry, ownAs);
  return (
    <>
      <span className="min-w-0 truncate" title={entry.fullPath}>
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

/** Whether the list holds a spex repository or a placement of one under
 * a group, or a group inside it, at its instance (space-1, DR-128): only
 * an empty group offers Delete. */
function holdsAnything(groups: GroupsState, instance: InstanceState, group: InstanceGroupState): boolean {
  if (group.repositories.length > 0) return true;
  if (group.placed.some((line) => standingOf(groups, line.key) !== undefined)) return true;
  const inside = `${group.fullPath}/`.toLowerCase();
  return instance.groups.some((other) => other !== group && other.fullPath.toLowerCase().startsWith(inside));
}

/** A group's member count where the last read holds one (space-1): its
 * own spex repository's members at its instance — the group's members
 * and any its repository adds — which the read carries; none
 * otherwise. */
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

/** One entry of the list (space-1): your own records, where `instance`
 * is none, or a group, your namespace or another account's login under
 * an instance's heading. Its heading — with one "More" holding Members
 * and, where the instance lets the person, "New subgroup", "Rename" and,
 * on an empty group, "Delete" on a group of a signed-in instance, your
 * own records' and a namespace's carrying none (DR-114, DR-120) — then
 * its servers' lines, its rows, and the groups inside it. What a
 * heading's act opens stands beneath the heading; a group's command
 * names its instance (space-29). */
function GroupSection({
  instance,
  group,
  subgroups,
  ...shared
}: Shared & {
  /** The instance whose heading the entry stands under; none for your
   * own records. */
  instance?: InstanceState;
  group: InstanceGroupState;
  subgroups: GroupNode[];
}) {
  const { groups, connected, refreshes, servers, onNote } = shared;
  const store = usePlaceStore();
  const spaceGroupDelete = store((state) => state.spaceGroupDelete);
  const [opened, setOpened] = useState<"members" | "subgroup" | "rename" | "delete">();
  const [deleting, setDeleting] = useState(false);
  const [refusal, setRefusal] = useState<string>();
  const refusalId = useId();
  const moreRef = useRef<HTMLButtonElement>(null);
  const { name, beside } = groupReading(groups, group, instance);
  // Your own records take no subgroup and no member: what is there is
  // shared on its projects (DR-114); a namespace, listed by no id, takes
  // nothing either (DR-120); nothing is offered at an instance signed
  // out.
  const hostGroup = instance?.signedIn && group.id !== null ? group.id : null;
  const own = instance === undefined;
  const testKey = own ? "own" : groupTestKey(group);
  const Heading = own ? "h2" : "h3";
  const members = instance && group.login === null ? memberCount(instance, group) : null;
  const close = () => {
    setOpened(undefined);
    // Closing never strands focus (DR-010 §6).
    setTimeout(() => moreRef.current?.focus(), 0);
  };
  const toggle = (which: "members" | "subgroup" | "rename" | "delete") => {
    setRefusal(undefined);
    setOpened((was) => (was === which ? undefined : which));
  };
  // Delete stands only where the instance lets the person and the list
  // holds nothing under the group there, not even a placement (space-1).
  const deletable = hostGroup !== null && instance !== undefined && group.can.delete && !holdsAnything(groups, instance, group);

  /** Delete the group (space-77): the heading reads "Deleting…" until
   * the reply; the group leaves the list as the core holds it gone, and
   * a refusal stands beneath the heading, the group kept. */
  const remove = async () => {
    if (hostGroup === null || !instance) return;
    setOpened(undefined);
    setDeleting(true);
    setRefusal(undefined);
    try {
      await spaceGroupDelete(instance.origin, hostGroup);
    } catch (cause) {
      const message = (cause as Error).message;
      setRefusal(message);
      onNote(message);
      setTimeout(() => moreRef.current?.focus(), 0);
    } finally {
      setDeleting(false);
    }
  };

  const entries: MenuEntry[] =
    hostGroup === null
      ? []
      : [
          {
            label: i18n._({ id: "Members", comment: "list the people the host lets read a spex repository" }),
            testId: `space-group-members-${group.fullPath}`,
            onSelect: () => toggle("members"),
          },
          ...(group.can.createSubgroup
            ? [
                {
                  label: i18n._({ id: "New subgroup", comment: "create a group inside this group on the Git host" }),
                  testId: `space-group-subgroup-${group.fullPath}`,
                  onSelect: () => toggle("subgroup"),
                },
              ]
            : []),
          ...(group.can.rename
            ? [
                {
                  label: i18n._({ id: "Rename", comment: "rename this group of the instance: its name and its path" }),
                  testId: `space-group-rename-${group.fullPath}`,
                  disabled: deleting,
                  onSelect: () => toggle("rename"),
                },
              ]
            : []),
          ...(deletable
            ? [
                {
                  label: i18n._({ id: "Delete", comment: "delete this empty group of the instance" }),
                  testId: `space-group-delete-${group.fullPath}`,
                  disabled: deleting,
                  onSelect: () => toggle("delete"),
                },
              ]
            : []),
        ];

  const rows = group.repositories;
  const lines = instance && servers ? (
    <GroupServers instance={instance} group={group.fullPath} listing={servers} connected={connected} onNote={onNote} />
  ) : null;
  const serverCount = instance
    ? (servers?.servers ?? []).filter((server) => server.instance === instance.origin && server.group.toLowerCase() === group.fullPath.toLowerCase()).length
    : 0;

  return (
    <div
      role="group"
      aria-label={own ? name : group.login !== null ? name : group.fullPath}
      data-testid={own ? "space-own" : `space-group-${testKey}`}
      className="@container flex min-w-0 flex-col gap-2"
    >
      {/* The name owns the slack; what stands beside it follows the
          separator in the secondary tone (space-1). */}
      <div className="flex min-w-0 items-center gap-1">
        <Heading className="flex min-w-0 flex-1 items-baseline gap-2 text-sm font-medium">
          <span className="min-w-0 truncate" title={own ? undefined : group.fullPath}>
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
        {deleting ? (
          <span role="status" className="shrink-0 text-xs text-neutral-500">
            {i18n._({ id: "Deleting…", comment: "the Delete control, while the host deletes the group" })}
          </span>
        ) : null}
        <MoreMenu
          of={group.fullPath}
          testId={`space-group-more-${group.fullPath}`}
          buttonRef={moreRef}
          entries={entries}
          disabled={!connected}
        />
      </div>
      {opened === "delete" && hostGroup !== null ? (
        <div data-testid={`space-group-confirm-${group.fullPath}`} className="ml-4 min-w-0">
          <InlineConfirm
            question={i18n._("Delete {group}?", { group: group.fullPath })}
            confirmLabel={i18n._({ id: "Delete", comment: "confirm: delete the group on the Git host" })}
            cancelLabel={i18n._({ id: "Keep", comment: "cancel a deletion: leave it as it is" })}
            onConfirm={() => void remove()}
            onCancel={close}
          />
        </div>
      ) : null}
      {refusal ? (
        <p
          id={refusalId}
          data-testid={`space-group-refusal-${group.fullPath}`}
          role="alert"
          className="ml-4 min-w-0 text-xs text-red-600 dark:text-red-400"
        >
          {refusal}
        </p>
      ) : null}
      {opened === "rename" && hostGroup !== null && instance ? (
        <div className="ml-4 min-w-0">
          <GroupNameEditor
            testId={`space-rename-${group.fullPath}`}
            instance={instance.origin}
            parent={null}
            rename={{ group: hostGroup, name: group.name, path: lastSegment(group.fullPath) }}
            connected={connected}
            onClose={close}
            onNote={onNote}
          />
        </div>
      ) : null}
      {opened === "subgroup" && hostGroup !== null && instance ? (
        <div className="ml-4 min-w-0">
          <GroupNameEditor
            testId={`space-subgroup-${group.fullPath}`}
            instance={instance.origin}
            parent={hostGroup}
            connected={connected}
            onClose={close}
            onNote={onNote}
          />
        </div>
      ) : null}
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
      {rows.length > 0 ? (
        <ul className="flex min-w-0 flex-col gap-0.5">
          {rows.map((repo) => (
            <RepositoryRow key={repo.key} {...shared} instance={instance} group={group} repo={repo} />
          ))}
        </ul>
      ) : serverCount === 0 && subgroups.length === 0 ? (
        <p className="pl-2 text-xs text-neutral-500">{i18n._("No projects here yet")}</p>
      ) : null}
      {subgroups.length > 0 ? (
        // A subgroup stands within its group, one step in (space-1).
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

type Opened =
  | "pick"
  | "join"
  | "folder"
  | "notice"
  | "place-choice"
  | "place"
  | "leave-choice"
  | "leave"
  | "members"
  | "move"
  | "attach"
  | "resolve"
  | "merge";

/** The words of "Open here" (space-111). */
const openHereLabel = (): string =>
  i18n._({ id: "Open here", comment: "a project's Open entry for the place shown: clones its records and code here" });

/** One spex repository's row (space-1, space-61, space-111): the dot,
 * the name owning the slack, where its code lives — hidden below @md —
 * the places it is open at, its phrase, its local changes, its primary
 * control and its overflow, which keep their accessible names at every
 * width (space-28). */
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
  /** The instance whose heading the row stands under; none under your
   * own records. */
  instance?: InstanceState;
  group: InstanceGroupState;
  repo: RepositoryState;
}) {
  const store = usePlaceStore();
  // A remote place's core allocates every project's folder (space-103,
  // run-view-169): its rows offer no folder picker and no path entry,
  // and an Open there names no folder.
  const remote = !isLocalPlace(store.place);
  const spaceSync = store((state) => state.spaceSync);
  const spaceJoin = store((state) => state.spaceJoin);
  const spaceRefresh = store((state) => state.spaceRefresh);
  const spacePlace = store((state) => state.spacePlace);
  const spaceLeave = store((state) => state.spaceLeave);
  const spaceAttach = store((state) => state.spaceAttach);
  const spaceRepositoryMove = store((state) => state.spaceRepositoryMove);
  const spaceLastAct = store((state) => state.spaceLastAct);
  const rebindProject = store((state) => state.rebindProject);
  const pending = useServerOpens((state) => state.pending);
  const dismissed = dismissedByKey[repo.key];
  const isSelected = selected === repo.key;
  const [opened, setOpened] = useState<Opened>();
  const [busy, setBusy] = useState<"sync" | "join" | "retry" | "place" | "leave" | "attach">();
  // A long command's reply is only "accepted": its control stays busy
  // until the machine's state moves, so nothing re-enables between the
  // reply and the state (DR-010 §3, space-29).
  const [accepted, setAccepted] = useState<{ op: "sync" | "join" | "place" | "leave" | "attach"; key: string }>();
  const [error, setError] = useState<string>();
  // The placement the row's notice names, by its instance's origin, and
  // what its Continue sends beside `noticed` (space-57, space-13).
  const [noticeAt, setNoticeAt] = useState<string | null>();
  const [carried, setCarried] = useState<{ join?: true }>({});
  // The instance a Place's picker is for, by its origin (space-88).
  const [placeAt, setPlaceAt] = useState<string>();
  // The placement a Leave's confirm asks about, by its instance's origin
  // (space-89).
  const [leaveAt, setLeaveAt] = useState<string>();
  // The placement an Attach's notice names (space-90).
  const [attachAt, setAttachAt] = useState<string>();
  const [moving, setMoving] = useState(false);
  // The Leave this row sent, until its outcome arrives: the placement,
  // and the machine's state when it was sent (space-98).
  const leaveSent = useRef<{ instance: string; key: string }>(undefined);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const pickRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLButtonElement>(null);
  const actRef = useRef<HTMLButtonElement>(null);

  const sync = repo.sync;
  const running = sync.phase === "running";
  const machineKey = `${repo.state}|${JSON.stringify(sync)}`;
  useEffect(() => {
    if (accepted && accepted.key !== machineKey) setAccepted(undefined);
  }, [accepted, machineKey]);

  // The instance governing the row, as the core names it, else its own
  // (space-1, space-61).
  const governing = governingOf(groups, repo);
  const groupRepository = isGroupRepository(group, repo);
  const name = rowName(group, repo);
  const close = (focus: "primary" | "pick" | "more" | "act" = "more") => {
    setOpened(undefined);
    // Closing never strands focus (DR-010 §6): a control gone or busy
    // hands it to the row's name.
    setTimeout(() => {
      const active = document.activeElement;
      if (active && active !== document.body && active.isConnected) return;
      const target = { primary: primaryRef, pick: pickRef, more: moreRef, act: actRef }[focus].current ?? moreRef.current;
      (!target || target.disabled || !target.isConnected ? nameRef.current : target)?.focus();
    }, 0);
  };

  /** Say the sharing notice of the placement at `origin` beneath the
   * row before its sync (space-57), its Continue carrying `answer`. */
  const askNotice = (origin: string | null, answer: { join?: true } = {}) => {
    setNoticeAt(origin);
    setCarried(answer);
    setOpened("notice");
  };

  /** Sync every placement (space-12), with the notice of the one
   * `placement` names seen (space-57) and the join of an unrelated one
   * (space-13). A refusal for want of a notice the page's read missed
   * says it for the placement the core names, else the first that owes
   * it; any other stands beneath the row. */
  const start = async (input: { placement?: string | null; noticed?: boolean; join?: boolean }) => {
    const key = machineKey;
    setBusy("sync");
    setError(undefined);
    try {
      await spaceSync(repo.key, input);
      setAccepted({ op: "sync", key });
    } catch (cause) {
      const details = (cause as SpexCommandError).details;
      if (!input.noticed && details?.notice === true) {
        const named = details.placement;
        const owing =
          (typeof named === "string" || named === null ? placementAt(repo, named) : undefined) ??
          heldPlacements(repo).find((line) => owesNotice(repo, line)) ??
          keyPlacement(repo);
        if (owing) {
          askNotice(owing.instance, input.join ? { join: true } : {});
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

  /** Open here a repository an instance lists (space-63, space-111), at
   * the instance whose heading the row stands under (space-29), else the
   * one the row names: a row not on this device stands under the
   * instance whose read lists it. At a remote place no folder is named:
   * its core allocates one (space-103). */
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

  /** Pair a clone with a folder on this device (space-63, space-47):
   * the code clone that failed leaves the spex repository here. */
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

  /** Place the project at another instance as its picker chose
   * (space-88, space-97): accepted once the host's step and the
   * placement's add are done, "Placing…" until the operation it starts
   * has run; a refusal is the picker's to show. */
  const place = async (choice: SpaceGroupChoice, noticed?: boolean): Promise<void> => {
    const key = machineKey;
    setBusy("place");
    setError(undefined);
    try {
      await spacePlace(repo.key, choice, noticed);
      setAccepted({ op: "place", key });
    } finally {
      setBusy(undefined);
    }
  };

  /** Stop keeping the records at the placement at `origin` (space-89,
   * space-98), `confirmed` on the second Remove: accepted at once,
   * "Leaving…" until the Leave has run; a refusal stands beneath the
   * row. */
  const leave = async (origin: string, confirmed: boolean): Promise<void> => {
    const key = machineKey;
    setBusy("leave");
    setError(undefined);
    // Its outcome may land before the reply (space-29).
    leaveSent.current = { instance: origin, key };
    try {
      await spaceLeave(repo.key, origin, confirmed);
      setAccepted({ op: "leave", key });
    } catch (cause) {
      leaveSent.current = undefined;
      const message = (cause as Error).message;
      setError(message);
      onNote(message);
    } finally {
      setBusy(undefined);
    }
  };

  /** Attach the placement at `origin` with its notice seen (space-90,
   * space-99): a refusal stands beneath the row. */
  const attach = async (origin: string): Promise<void> => {
    const key = machineKey;
    setBusy("attach");
    setError(undefined);
    try {
      await spaceAttach(repo.key, origin);
      setAccepted({ op: "attach", key });
    } catch (cause) {
      const message = (cause as Error).message;
      setError(message);
      onNote(message);
    } finally {
      setBusy(undefined);
    }
  };

  /** Move the key placement into a group of its instance, or your
   * namespace there where `groupId` is null (space-78): a refusal is the
   * picker's to show. */
  const move = async (groupId: string | null): Promise<void> => {
    const line = keyPlacement(repo);
    if (!line || line.instance === null) return;
    setMoving(true);
    try {
      await spaceRepositoryMove(repo.key, line.instance, groupId);
      setOpened(undefined);
    } catch (cause) {
      onNote((cause as Error).message);
      throw cause;
    } finally {
      setMoving(false);
    }
  };

  const retry = async () => {
    setBusy("retry");
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
  // The first push to a placement others share says once what goes there
  // (space-57): where every placement this sync would run owes it, the
  // first owing one's notice comes first; where any other can run, the
  // sync goes and each owing one waits on its line for its Continue.
  const runs = heldPlacements(repo).filter((line) => runnable(groups, repo, line));
  const owing = runs.filter((line) => owesNotice(repo, line));
  const noticeFirst = runs.length > 0 && owing.length === runs.length ? owing[0] : undefined;
  const noticeLine = opened === "notice" && noticeAt !== undefined ? placementAt(repo, noticeAt) : undefined;
  const joining = busy === "join" || accepted?.op === "join" || (running && sync.op === "join");
  const syncing =
    busy === "sync" ||
    accepted?.op === "sync" ||
    (running && sync.op !== "join" && sync.op !== "check" && sync.op !== "attach" && sync.op !== "place" && sync.op !== "leave");
  // "Place at…" on a project's row (space-88): busy from the pick until
  // the operation it starts has run; a Place asked while a sync runs
  // follows that sync (space-21), so only another operation holds it.
  const offered = groupRepository ? [] : placeInstances(groups, repo);
  const placing = busy === "place" || accepted?.op === "place" || (running && sync.op === "place");
  const showPlace = !groupRepository && (offered.length > 0 || placing);
  const placeTo = opened === "place" ? signedInInstances(groups).find((entry) => entry.origin === placeAt) : undefined;
  // "Leave…" on a project's row (space-89): busy from Remove until the
  // Leave has run.
  const leaveOffered = groupRepository ? [] : leavePlacements(repo);
  const leaving = busy === "leave" || accepted?.op === "leave" || (running && sync.op === "leave");
  const showLeave = !groupRepository && (leaveOffered.length > 0 || leaving);
  const leaveLine = opened === "leave" && leaveAt !== undefined ? leaveOffered.find((line) => line.instance === leaveAt) : undefined;
  // A clone holding only its path placement adds itself to a group beside
  // its Open, the pick adding its first placement with an instance
  // (space-61, space-88, storage-35).
  const pickBeside =
    repo.state !== "local-only" &&
    !groupRepository &&
    heldPlacements(repo).length > 0 &&
    instancePlacements(repo).length === 0 &&
    pickInstances(groups, repo).length > 0;
  // The key placement's acts, as its line's (space-87): Members on one
  // reachable at a signed-in instance, "Move…" on a project's the view
  // lets the person move (space-62, space-78).
  const keyLine = here ? keyPlacement(repo) : undefined;
  const keyGoverning = keyLine ? governingOfPlacement(groups, repo, keyLine) : undefined;
  const keyGoverned = keyLine !== undefined && keyLine.instance !== null && keyGoverning?.signedIn === true;
  const showMembers = keyGoverned && keyLine!.state === "reachable";
  const showMove = keyGoverned && !groupRepository && keyLine!.can.transfer;
  // Each placement a file of the clone names that no remote here holds,
  // no creation waiting there: Attach brings it here (space-90).
  const attachable = here
    ? repo.placements.filter((line) => !line.attached && line.waiting === null && line.state === "absent" && line.instance !== null)
    : [];
  const attachLine = opened === "attach" && attachAt !== undefined ? placementAt(repo, attachAt) : undefined;
  // A clone whose code found no folder here is paired later (space-63):
  // at a remote place it is opened again instead, its core cloning the
  // code into the folder it allocated (space-103).
  const needsFolder = awaitsFolder(group, repo) || (here && groupRepository && !repo.own && repo.folder === null && repo.state !== "local-only");
  // A code clone at a remote place that failed for want of the member's
  // credential names its host (space-103): the row opens that place's
  // Credentials section at it (settings-48).
  const credentialHost = remote && sync.phase === "stopped" ? sync.credential : undefined;

  // A Leave this row sent that stopped for records no remaining
  // placement received, or at a read of its placement it could not make,
  // asks again in place, Keep focused (space-89, space-98); once that
  // placement is gone, nothing is left to ask.
  const heldKey = heldPlacements(repo)
    .map((line) => line.instance)
    .join(" ");
  useEffect(() => {
    const sent = leaveSent.current;
    if (!sent) return;
    if (sync.phase === "stopped" && sync.op === "leave" && machineKey !== sent.key) {
      leaveSent.current = undefined;
      if (leaveStage(repo, spaceLastAct(repo.key), sent.instance).stage !== "first") {
        setLeaveAt(sent.instance);
        setOpened("leave");
      }
      return;
    }
    // Gone, it was left — the live note says so (SpaceSurface) — and
    // "Leaving…" ends even where no state between moved the machine.
    if (placementAt(repo, sent.instance)?.attached !== true) {
      leaveSent.current = undefined;
      setAccepted((was) => (was?.op === "leave" ? undefined : was));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machineKey, heldKey]);

  // This place's entry of Open (space-111): "Open here" for a repository
  // not here; "Choose folder…" — at a seat "Try again" — for a clone
  // whose code found no folder; "Show" for one open here. Your own
  // records, always here, open nowhere else.
  const openHere = here && repo.folder !== null && repo.state !== "local-only";
  const hereEntries: MenuEntry[] = [];
  if (repo.state === "absent" && repo.id) {
    hereEntries.push({
      label: joining ? i18n._({ id: "Opening…", comment: "a project's row while it is opened here: its records and code clone" }) : openHereLabel(),
      title: remote
        ? i18n._({
            id: "Brings it to {place}",
            values: { place: placeLabel(store.place) },
            comment: "the title of a project's Open here at a team server's seat: {place} is the server's name, which allocates the project's folder itself",
          })
        : i18n._("Brings it to this device"),
      testId: `space-row-open-here-${repo.key}`,
      disabled: joining,
      onSelect: () => void (remote ? joinRemote() : askFolder("join")),
    });
  } else if (needsFolder) {
    hereEntries.push(
      remote
        ? {
            label: joining
              ? i18n._({ id: "Opening…", comment: "a project's row while it is opened here: its records and code clone" })
              : i18n._({ id: "Try again", comment: "on a team server's project whose code clone failed: open it again, cloning its code into the folder the server allocated" }),
            title: i18n._({
              id: "Clones its code again into its folder on {place}",
              values: { place: placeLabel(store.place) },
              comment: "the title of 'Try again' on a team server's project whose code clone failed: {place} is the server's name",
            }),
            testId: `space-row-join-again-${repo.key}`,
            disabled: running || !repo.id || joining,
            onSelect: () => void joinRemote(),
          }
        : {
            label: i18n._("Choose folder…"),
            title: i18n._("Pairs it with its folder on this device"),
            testId: `space-row-folder-${repo.key}`,
            disabled: running,
            onSelect: () => void askFolder("folder"),
          },
    );
  } else if (openHere) {
    hereEntries.push({
      label: i18n._({ id: "Show", comment: "a project's Open entry where it is open at that place already: shows it on Projects" }),
      testId: `space-row-show-${repo.key}`,
      onSelect: () => onOpenProject(repo.key),
    });
  }

  // Each server of the row's instance the member may open (space-111):
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
  // group…" for a project in no group, Retry for one unreachable — none
  // while its instance is signed out — and nothing for one held as
  // colliding.
  let primary: ReactNode = null;
  if (repo.state === "local-only") {
    if (!groupRepository && pickInstances(groups, repo).length > 0) {
      primary = (
        <button
          ref={primaryRef}
          type="button"
          data-testid={`space-row-pick-${repo.key}`}
          className={`${SECONDARY} shrink-0 whitespace-nowrap`}
          aria-expanded={opened === "pick"}
          disabled={disabled}
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
          // Retry reads every signed-in instance again, as Refresh does
          // (space-2).
          title={i18n._("Reads each signed-in instance again")}
          disabled={disabled || busy === "retry"}
          onClick={() => void retry()}
        >
          {busy === "retry"
            ? i18n._({ id: "Retrying…", comment: "the Retry control, while the retry is in flight" })
            : i18n._({ id: "Retry", comment: "run the stopped step again" })}
        </button>
      );
    }
  } else if (openEntries.length === 1) {
    const only = openEntries[0]!;
    primary = (
      <button
        ref={primaryRef}
        type="button"
        data-testid={`space-row-open-${repo.key}`}
        // The one entry it stands for, as the menu would name it.
        data-entry={only.testId}
        className={`${SECONDARY} shrink-0 whitespace-nowrap`}
        title={only.title ?? only.name}
        aria-label={only.name}
        aria-expanded={opened === "join" || opened === "folder" ? true : undefined}
        disabled={disabled || only.disabled}
        onClick={only.onSelect}
      >
        {only.label}
      </button>
    );
  } else if (openEntries.length > 1) {
    primary = (
      <MenuButton
        trigger={i18n._({ id: "Open", comment: "a project's primary control: opens the places it may be opened at" })}
        name={i18n._({
          id: "Open {name}",
          values: { name },
          comment: "the accessible name of a project's Open control, which lists the places to open it at; {name} is the project's name",
        })}
        testId={`space-row-open-${repo.key}`}
        buttonRef={primaryRef}
        entries={openEntries}
        disabled={disabled}
      />
    );
  }

  // The row's phrase (space-87): a server's open while it runs, else the
  // first its placements hold, your own records signed in nowhere
  // waiting for the sign-in that syncs them (space-61).
  const nameOf = (origin: string | null): string => {
    const line = placementAt(repo, origin);
    return line ? placementName(groups, line) : origin === null ? "" : instanceNameAt(groups, origin);
  };
  const phrase =
    waitingOn !== undefined
      ? {
          text: i18n._({
            id: "Opening on {server}…",
            values: { server: waitingOn },
            comment: "a project's row while it is opened on a team server: the seat opens, signs in, and joins it; {server} is the server's name",
          }),
          title: "",
          tone: "running" as const,
          act: undefined,
        }
      : repo.own && repo.state === "local-only" && !anySignedIn(groups)
        ? {
            text: i18n._({
              id: "On this computer only — synced once you sign in",
              comment: "your own records' row before any sign-in: kept here alone until a sign-in syncs them",
            }),
            title: "",
            tone: "idle" as const,
            act: undefined,
          }
        : rowPhrase(repo, now, dismissed, nameOf);

  // Where its code lives (space-1, space-40): a project's code remote as
  // read, "Code not on a remote" where `project.json` names none, nothing
  // for a group's own or your own records.
  const code = repo.code
    ? displayRemote(repo.code)
    : groupRepository || repo.state === "absent"
      ? null
      : i18n._({ id: "Code not on a remote", comment: "a project's spex repository whose records name no code remote" });

  const more: MenuEntry[] = [];
  if (syncs) {
    more.push({
      label: syncing
        ? i18n._({ id: "Syncing…", comment: "the Sync control, while the sync runs" })
        : i18n._({ id: "Sync now", comment: "send what is here and bring back anything new, now" }),
      // What it does is its own to say (DR-069).
      title: readOnly ? i18n._("Brings back anything new; sends nothing") : i18n._("Sends what is here and brings back anything new"),
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
      label: i18n._({ id: "Members", comment: "list the people the host lets read a spex repository" }),
      testId: `space-row-members-${repo.key}`,
      onSelect: () => setOpened("members"),
    });
  }
  more.push({
    label: i18n._({ id: "Explore records", comment: "open a project's records as an annotated tree, beneath the list" }),
    testId: `space-row-explore-${repo.key}`,
    onSelect: () => onExplore(repo.key),
  });
  if (showMove) {
    more.push({
      label: moving
        ? i18n._({ id: "Moving…", comment: "the Move control, while the host moves the spex repository" })
        : i18n._({ id: "Move…", comment: "open the groups a spex repository may move to; its full name is 'Move to another group'" }),
      name: moving ? undefined : i18n._({ id: "Move to another group", comment: "move a spex repository into another group of the instance, or your own" }),
      testId: `space-row-move-${repo.key}`,
      disabled: moving,
      onSelect: () => setOpened("move"),
    });
  }
  if (showPlace) {
    const long = !placing && offered.length === 1 ? alsoPlaceAt(offered[0]!) : undefined;
    more.push({
      label: placing
        ? i18n._({ id: "Placing…", comment: "the Place at… control while the placement is made and synced" })
        : placeAtLabel(),
      name: long,
      testId: `space-row-place-${repo.key}`,
      disabled: placing || (running && sync.op !== "sync"),
      onSelect: () => {
        // One instance offered opens its picker; several, the choice of
        // them (space-88).
        if (offered.length === 1) {
          setPlaceAt(offered[0]!.origin);
          setOpened("place");
        } else {
          setOpened("place-choice");
        }
      },
    });
  }
  if (showLeave) {
    const only = !leaving && leaveOffered.length === 1 ? leaveOffered[0]!.instance : null;
    more.push({
      label: leaving
        ? i18n._({ id: "Leaving…", comment: "the Leave… control while that placement is checked and removed" })
        : leaveLabel(),
      name: only !== null ? removeFrom(instanceNameAt(groups, only)) : undefined,
      testId: `space-row-leave-${repo.key}`,
      disabled: leaving || (running && sync.op !== "sync"),
      onSelect: () => {
        // One placement held asks about it; several open the choice of
        // them (space-89).
        if (leaveOffered.length === 1) {
          setLeaveAt(leaveOffered[0]!.instance!);
          setOpened("leave");
        } else {
          setOpened("leave-choice");
        }
      },
    });
  }
  for (const line of attachable) {
    const at = line.instance!;
    more.push({
      label:
        (busy === "attach" || accepted?.op === "attach" || (running && sync.op === "attach")) && attachAt === at
          ? i18n._({ id: "Attaching…", comment: "the Attach control while the placement is added and synced" })
          : i18n._({
              id: "Attach from {name}",
              values: { name: instanceNameAt(groups, at) },
              comment: "in a project's overflow: brings here its placement another device named at that instance, after the sharing notice; {name} is the instance's display name",
            }),
      testId: `space-row-attach-${repo.key}@${at}`,
      disabled: working,
      onSelect: () => {
        setAttachAt(at);
        setOpened("attach");
      },
    });
  }

  // A stopped Leave stands on its row until the next operation or
  // Dismiss (space-15): its phase names no placement, so the row's phrase
  // reads its step and cause.
  const captionId = `space-row-caption-${repo.key}`;
  const caption = error ?? failedOpen?.failed;
  const describe = (part: string) => `space-repo-${part}-${repo.key}`;
  const dot = statusDot(repo);
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
  const describedBy = [code !== null ? describe("code") : null, repo.local.length > 0 ? describe("changes") : null, phrase.text ? describe("state") : null]
    .filter(Boolean)
    .join(" ");
  const TONES: Record<string, string> = {
    idle: "text-neutral-500",
    running: "text-neutral-500",
    attention: "text-amber-700 dark:text-amber-300",
    stopped: "text-red-600 dark:text-red-400",
  };

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
        <span
          aria-hidden
          data-testid={`space-repo-dot-${repo.key}`}
          title={dot.word}
          className={`inline-block h-2 w-2 shrink-0 rounded-full ${dot.className}`}
        />
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
            // A remote reads as code; the phrases for none read as words.
            className={`hidden min-w-0 max-w-[30%] truncate text-xs text-neutral-500 @md:inline ${repo.code ? "font-mono" : ""}`}
            title={repo.code ?? undefined}
          >
            {code}
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
          // its own where the controls leave it room (space-28).
          className={`min-w-0 max-w-full shrink truncate text-xs @md:max-w-[45%] ${TONES[phrase.tone]}`}
          title={phrase.title || undefined}
        >
          {phrase.text}
        </span>
        {phrase.act ? (
          <button
            ref={actRef}
            type="button"
            data-testid={phrase.act.kind === "resolve" ? `space-row-resolve-${repo.key}` : `space-row-merge-${repo.key}`}
            className={`${SECONDARY} shrink-0 whitespace-nowrap`}
            aria-expanded={opened === phrase.act.kind}
            title={
              phrase.act.kind === "merge" && !joining ? i18n._("Brings both histories into one and asks about anything that differs") : undefined
            }
            disabled={disabled || (phrase.act.kind === "merge" && working)}
            onClick={() => setOpened((was) => (was === phrase.act!.kind ? undefined : phrase.act!.kind))}
          >
            {phrase.act.kind === "resolve"
              ? i18n._({ id: "Resolve", comment: "beside \"Changed here and at <display name>\": opens the choices beneath the row" })
              : busy === "sync" || accepted?.op === "sync"
                ? mergingLabel()
                : mergeHistoriesLabel()}
          </button>
        ) : null}
        {repo.local.length > 0 ? (
          <span
            data-testid={`space-repo-changes-${repo.key}`}
            className="shrink-0 text-xs text-neutral-500"
            title={i18n._("{count, plural, one {# local change} other {# local changes}}", { count: repo.local.length })}
          >
            {/* The words beside a count yield first (DR-041): below @md
                the number stands alone, the phrase describing the row
                still. */}
            <span aria-hidden className="@md:hidden">
              {repo.local.length}
            </span>
            <span id={describe("changes")} className="hidden @md:inline">
              {i18n._("{count, plural, one {# change} other {# changes}}", { count: repo.local.length })}
            </span>
          </span>
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
          {pickBeside ? (
            <button
              ref={pickRef}
              type="button"
              data-testid={`space-row-pick-${repo.key}`}
              className={`${SECONDARY} shrink-0 whitespace-nowrap`}
              aria-expanded={opened === "pick"}
              disabled={disabled}
              onClick={() => setOpened((was) => (was === "pick" ? undefined : "pick"))}
            >
              {addToGroupLabel()}
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
      {opened === "resolve" && phrase.act?.kind === "resolve" ? (
        // The choices beneath the row (space-14): the same picker, and
        // the same choices, as the Sync tab's.
        <div data-testid={`space-row-resolve-picker-${repo.key}`} className="ml-6 min-w-0 rounded border border-neutral-300 p-2 dark:border-neutral-700">
          <ConflictsPicker groups={groups} repo={repo} now={now} connected={connected} scope={`space-row-${repo.key}`} onNote={onNote} />
        </div>
      ) : null}
      {opened === "merge" && phrase.act?.kind === "merge" ? (
        <div data-testid={`space-row-merge-confirm-${repo.key}`} className="pl-6">
          <MergeConfirm
            onConfirm={() => {
              const placement = phrase.act!.placement;
              close("act");
              void start({ placement, join: true });
            }}
            onCancel={() => close("act")}
          />
        </div>
      ) : null}
      {opened === "pick" ? (
        <GroupPicker groups={groups} repo={repo} connected={connected} onClose={() => close(pickBeside ? "pick" : "primary")} onNote={onNote} />
      ) : null}
      {opened === "place-choice" && showPlace ? (
        <PlaceChoice
          repoKey={repo.key}
          offered={offered}
          connected={connected}
          onChoose={(chosen) => {
            setPlaceAt(chosen.origin);
            setOpened("place");
          }}
          onCancel={() => close()}
        />
      ) : null}
      {placeTo ? (
        <GroupPicker
          key={placeTo.origin}
          groups={groups}
          repo={repo}
          place={{ instance: placeTo, send: place }}
          connected={connected}
          onClose={() => close()}
          onNote={onNote}
        />
      ) : null}
      {opened === "leave-choice" && showLeave ? (
        <LeaveChoice
          groups={groups}
          repoKey={repo.key}
          held={leaveOffered}
          connected={connected}
          onChoose={(chosen) => {
            setLeaveAt(chosen.instance!);
            setOpened("leave");
          }}
          onCancel={() => close()}
        />
      ) : null}
      {leaveLine ? (
        <LeaveConfirm
          // Asked again, it asks afresh, Keep focused (DR-010 §4).
          key={`${leaveLine.instance}|${leaveStage(repo, spaceLastAct(repo.key), leaveLine.instance!).stage}`}
          repoKey={repo.key}
          stage={leaveStage(repo, spaceLastAct(repo.key), leaveLine.instance!)}
          name={instanceNameAt(groups, leaveLine.instance!)}
          disabled={disabled || leaving}
          onRemove={() => {
            const confirmed = leaveStage(repo, spaceLastAct(repo.key), leaveLine.instance!).stage !== "first";
            close();
            void leave(leaveLine.instance!, confirmed);
          }}
          onKeep={() => close()}
        />
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
      {opened === "move" && showMove && keyLine ? (
        <MovePicker
          groups={groups}
          repo={repo}
          name={name}
          line={keyLine}
          busy={moving}
          connected={connected}
          onMove={move}
          onClose={() => close()}
        />
      ) : null}
      {opened === "join" ? (
        <FolderEditor
          testId={`space-join-${repo.key}`}
          label={repo.code ? i18n._("Folder for its code on this device") : i18n._("Folder its sessions run in on this device")}
          initial=""
          submitLabel={openHereLabel()}
          busyLabel={i18n._({ id: "Opening…", comment: "a project's row while it is opened here: its records and code clone" })}
          onSubmit={join}
          onCancel={() => close("primary")}
        />
      ) : null}
      {opened === "folder" ? (
        <FolderEditor
          testId={`space-folder-${repo.key}`}
          label={groupRepository ? i18n._("Folder its sessions run in on this device") : i18n._("Folder for its code on this device")}
          initial=""
          submitLabel={i18n._("Add project")}
          busyLabel={i18n._({ id: "Adding…", comment: "the Add project control, while the add is in flight" })}
          onSubmit={pair}
          onCancel={() => close("primary")}
        />
      ) : null}
      {noticeLine ? (
        <div data-testid="space-notice-confirm" className="pl-6">
          <PlacementNotice
            groups={groups}
            line={noticeLine}
            disabled={disabled}
            onContinue={() => {
              close();
              void start({ placement: noticeLine.instance, noticed: true, ...carried });
            }}
            onCancel={() => close()}
          />
        </div>
      ) : null}
      {attachLine && attachLine.instance !== null ? (
        <div data-testid={`space-row-attach-notice-${repo.key}`} className="pl-6">
          <PlacementNotice
            groups={groups}
            line={attachLine}
            disabled={disabled}
            onContinue={() => {
              const at = attachLine.instance!;
              close();
              void attach(at);
            }}
            onCancel={() => close()}
          />
        </div>
      ) : null}
    </li>
  );
}

/** Where one placement of a spex repository moves (space-78): a picker
 * as space-58's, of the instance governing that placement alone — your
 * namespace there first, read by your login, then each group it lists,
 * each read as the list reads it, never another account's login, never
 * the entry that placement stands in — with Cancel, Escape cancelling.
 * A pick asks the host; a refusal stands in the picker, the placement
 * kept where it stood. */
export function MovePicker({
  groups,
  repo,
  name,
  line,
  busy,
  connected,
  onMove,
  onClose,
}: {
  groups: GroupsState;
  repo: RepositoryState;
  /** The row's name (space-1). */
  name: string;
  /** The placement moved: one with an instance. */
  line: PlacementState;
  busy: boolean;
  connected: boolean;
  onMove(groupId: string | null): Promise<void>;
  onClose(): void;
}) {
  const [refusal, setRefusal] = useState<string>();
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    firstRef.current?.focus();
  }, []);
  // The instance the placement is moved at, and the entry it stands in
  // there, left out: the row's for its key placement, the one whose
  // listing names the row as placed for any other.
  const instance = governingOfPlacement(groups, repo, line);
  const standing = standingEntry(groups, repo, line);
  const mine = instance ? namespaceOf(instance) : undefined;
  // Your namespace is named by none, a group by its host id (space-29).
  const targets: { entry: InstanceGroupState; groupId: string | null }[] = instance
    ? [
        ...(mine && mine !== standing ? [{ entry: mine, groupId: null }] : []),
        ...instance.groups
          .filter((entry) => entry.id !== null && entry !== standing)
          .map((entry) => ({ entry, groupId: entry.id })),
      ]
    : [];
  const id = `${repo.key}@${line.instance}`;
  const pick = async (groupId: string | null) => {
    if (busy) return;
    setRefusal(undefined);
    try {
      await onMove(groupId);
    } catch (cause) {
      setRefusal((cause as Error).message);
      firstRef.current?.focus();
    }
  };
  const option =
    "flex w-full min-w-0 items-center gap-2 rounded border border-neutral-200 px-2 py-1 text-left text-sm hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-800 dark:hover:bg-neutral-800";
  return (
    <div
      role="group"
      aria-label={i18n._("Move {name} to another group", { name })}
      data-testid={`space-move-${id}`}
      className="ml-6 flex min-w-0 flex-col gap-2 rounded border border-neutral-300 p-2 dark:border-neutral-700"
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          if (!busy) onClose();
        }
      }}
    >
      <ul className="flex min-w-0 flex-col gap-1">
        {targets.map((target, index) => (
          <li key={groupTestKey(target.entry)} className="min-w-0">
            <button
              ref={index === 0 ? firstRef : undefined}
              type="button"
              data-testid={`space-move-group-${groupTestKey(target.entry)}`}
              className={option}
              disabled={!connected || busy}
              onClick={() => void pick(target.groupId)}
            >
              <GroupOptionLabel entry={target.entry} />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" data-testid={`space-move-cancel-${id}`} className={SECONDARY} disabled={busy} onClick={onClose}>
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
      setRefusal(i18n._("Name the folder on this device."));
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

/** One instance a pick offers (space-58): the spex repositories it
 * lists for the same code, each with the entry it stands in, and where
 * a new one may go — your namespace there first, then each group it
 * lists, never another account's login. */
interface PickSection {
  instance: InstanceState;
  listed: { group: InstanceGroupState; repo: RepositoryState; placement: PlacementState | undefined }[];
  creatable: InstanceGroupState[];
}

/** Where a project in no group goes (space-58): in one picker, one
 * section per signed-in instance under its display name — the clone's
 * instance alone where its key lies under one — each holding the spex
 * repositories that instance lists for the same code, each with its
 * group, read as the list reads it, and members' count, and, below them,
 * your namespace there reading "Only you" and every group it lists; the
 * new repository's name in one editable field every section shares.
 * Picking a listed one that may have other members says the sharing
 * notice beneath it first, and joins with `noticed` only on Continue
 * (space-57). A choice names the instance of its section (space-29).
 * With `place`, it is "Place at…"'s picker for one instance (space-88):
 * that instance's section alone, listing only the spex repositories
 * whose members the view lets the person manage, its notice naming where
 * the records go, and a pick sent as a Place — a refusal for the notice
 * the page's read missed saying it beneath the repository picked
 * (space-57). */
export function GroupPicker({
  groups,
  repo,
  place,
  connected,
  onClose,
  onNote,
}: {
  groups: GroupsState;
  repo: RepositoryState;
  /** The instance a Place is for, and how its pick is sent. */
  place?: { instance: InstanceState; send(choice: SpaceGroupChoice, noticed?: boolean): Promise<void> };
  connected: boolean;
  onClose(): void;
  onNote: Note;
}) {
  const store = usePlaceStore();
  const spacePick = store((state) => state.spacePick);
  const code = repo.code;
  const sections: PickSection[] = (place ? [place.instance] : pickInstances(groups, repo)).map((instance) => {
    const mine = namespaceOf(instance);
    return {
      instance,
      // The listed ones are the host's: a host id, a state the host read.
      listed: instance.groups.flatMap((group) =>
        group.repositories
          .filter(
            (other) =>
              other.key !== repo.key &&
              other.id !== null &&
              other.state !== "local-only" &&
              code !== null &&
              other.code !== null &&
              sameRemote(other.code, code),
          )
          // Its members, visibility and rights are its placement's there
          // (space-30).
          .map((other) => ({ group, repo: other, placement: placementAt(other, instance.origin) ?? rowPlacement(other) }))
          // A Place offers only those whose members the view lets the
          // person manage (space-88).
          .filter((listed) => !place || listed.placement?.can.manageMembers === true),
      ),
      // GroupsState names no right to create a repository, so every
      // group is offered and a refusal waits on the row (space-64).
      creatable: [
        ...(mine ? [mine] : []),
        ...instance.groups.filter((group) => group.id !== null).sort((a, b) => a.fullPath.localeCompare(b.fullPath)),
      ],
    };
  });
  const defaultName = repo.folder ? lastSegment(repo.folder) : repo.name.replace(/-spex$/, "");
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState<string>();
  const [refusal, setRefusal] = useState<string>();
  // The listed spex repository whose sharing notice stands (space-57).
  const [notice, setNotice] = useState<string>();
  // Each section's headings are named by ids no other picker shares.
  const ids = useId();
  const pickerRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
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
    pickerRef.current?.querySelector<HTMLButtonElement>(`[data-testid="space-pick-repo-${key}"]`);

  /** Cancel starts nothing; focus returns to the option (DR-010 §6). */
  const closeNotice = (key: string) => {
    setNotice(undefined);
    setTimeout(() => optionOf(key)?.focus(), 0);
  };

  const pick = async (id: string, choice: SpaceGroupChoice, noticed = false) => {
    setBusy(id);
    setRefusal(undefined);
    try {
      if (place) await (noticed ? place.send(choice, true) : place.send(choice));
      else await (noticed ? spacePick(repo.key, choice, true) : spacePick(repo.key, choice));
      onClose();
    } catch (cause) {
      // A Place refused for the notice the page's read missed says it
      // beneath the repository picked (space-57).
      if (place && choice.kind === "join" && !noticed && (cause as SpexCommandError).details?.notice === true) {
        setNotice(id);
        return;
      }
      const message = (cause as Error).message;
      setRefusal(message);
      onNote(message);
      // A name the host refuses asks for another in place (space-58); a
      // refused join hands focus back to its option, its notice closed.
      if (choice.kind === "create") refocus.current = () => nameRef.current?.focus();
      else {
        setNotice(undefined);
        refocus.current = () => optionOf(id)?.focus();
      }
    } finally {
      setBusy(undefined);
    }
  };

  /** Join a listed spex repository at its instance (space-58): one
   * whose only member is the account joins at once; one with others, or
   * whose count the host's last read lacks, says the notice first
   * unless this device's reader has seen it for that placement
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

  /** Create `<name>-spex` in an entry at its instance (space-58): your
   * namespace named by none, a group by its host id. */
  const create = (instance: InstanceState, group: InstanceGroupState) => {
    setNotice(undefined);
    const chosen = name.trim();
    if (!chosen) {
      setRefusal(i18n._("Name the new spex repository."));
      nameRef.current?.focus();
      return;
    }
    void pick(`${instance.origin} ${groupTestKey(group)}`, {
      kind: "create",
      instance: instance.origin,
      groupId: group.mine ? null : group.id,
      name: chosen,
    });
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
      aria-label={
        place
          ? alsoPlaceAt(place.instance)
          : i18n._({
              id: "Add {name} to a group",
              values: { name: projectName(repo.name) },
              comment: "the name of the group picker \"Add to a group…\" opens; {name} is the project's name",
            })
      }
      data-testid={place ? `space-place-${repo.key}` : `space-picker-${repo.key}`}
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
                    id: "On this instance for this code",
                    comment: "the picker's heading, inside one instance's section, over the spex repositories that instance lists for the folder's code",
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
                        <span className="min-w-0 flex-1 truncate font-medium" title={other.name}>
                          {rowName(group, other)}
                        </span>
                        <span
                          data-testid={`space-pick-listed-group-${other.key}`}
                          className="flex min-w-0 max-w-[40%] items-baseline gap-1 text-xs text-neutral-500"
                        >
                          <GroupOptionLabel entry={group} ownAs="only-you" />
                        </span>
                        {placement && placement.members !== null ? (
                          <span className="shrink-0 text-xs text-neutral-500">
                            {i18n._("{count, plural, one {# member} other {# members}}", { count: placement.members })}
                          </span>
                        ) : null}
                      </button>
                      {notice === other.key ? (
                        <div data-testid={`space-pick-notice-${repo.key}`} className="mt-1 pl-2">
                          {place && placement ? (
                            // A Place's notice names where the records go
                            // (space-57, space-88).
                            <PlacementNotice
                              groups={groups}
                              line={placement}
                              disabled={disabled}
                              onContinue={() =>
                                void pick(other.key, { kind: "join", instance: instance.origin, hostId: other.id! }, true)
                              }
                              onCancel={() => closeNotice(other.key)}
                            />
                          ) : (
                            <InlineConfirm
                              question={sharingNotice(placement?.visibility ?? null)}
                              confirmLabel={continueLabel()}
                              disabled={disabled}
                              onConfirm={() =>
                                void pick(other.key, { kind: "join", instance: instance.origin, hostId: other.id! }, true)
                              }
                              onCancel={() => closeNotice(other.key)}
                            />
                          )}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <section aria-labelledby={`${heading}-create`} className="flex min-w-0 flex-col gap-1">
              <h4 id={`${heading}-create`} className="text-xs font-medium text-neutral-500">
                {i18n._("New in a group")}
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
                      <GroupOptionLabel entry={group} ownAs="only-you" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        );
      })}
      {sections.length > 0 ? (
        // One name for the new repository, whichever entry it goes to
        // (space-58).
        <label className="flex min-w-0 items-center gap-1 text-xs">
          <span className="shrink-0 text-neutral-500">{i18n._({ id: "Name", comment: "the new spex repository's name" })}</span>
          <input
            ref={nameRef}
            data-testid={`space-pick-name-${repo.key}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            spellCheck={false}
            disabled={busy !== undefined}
            className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-1.5 py-0.5 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-900"
          />
          <span className="shrink-0 font-mono text-neutral-500">-spex</span>
        </label>
      ) : null}
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
