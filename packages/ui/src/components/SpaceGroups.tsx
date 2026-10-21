// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The groups list of the Groups surface (space-1, space-61, DR-103,
// DR-127): your own group first, then each instance the home lists
// under its heading (SpaceInstance) — every group it lists in the order
// of their paths, your namespace there headed by your login, and every
// other account's login under which it lists a spex repository — each
// with its spex repositories as rows. A row reads the repository's
// name, where its code lives, its reachability, its local changes,
// ahead and behind and its last sync, and carries the one control its
// state offers — Sync, Join, Pick a group, Retry — with Members on a
// reachable row whose instance is signed in, each read from the
// instance governing it. What a control opens stands in place beneath
// its row: the group picker, one section per instance it offers
// (space-58), the folder a Join clones into (space-63), the members the
// host reports (space-62), the first-push notice (space-57) and the
// joining of unrelated histories (space-13); a pick joining a
// repository others may share says the same notice in the picker first.
// A group an instance lists carries, while signed in there, Members and,
// where its read lets the person, "New subgroup", "Rename" and — while
// the list holds nothing under it — "Delete" on its heading (space-68,
// space-76, space-77, DR-114); your own group's heading carries none of
// these, nor does a namespace. A row the instance lets the person move
// carries "Move to another group", offering the groups of the instance
// the row stands under alone (space-78). While the home lists any
// instance, "Add instance…" at the list's foot opens the sign-in card in
// its place (space-1, space-3). No part of the list links a
// page of the host, or names what stands behind the instance (space-1).
// Every act is a command whose outcome arrives as state (space-29).

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { GroupsState, InstanceGroupState, InstanceState, RepositoryState } from "@sublang/spex-core/protocol";

import { useAppStore } from "../state/store.js";
import { i18n } from "../i18n.js";
import {
  anySignedIn,
  entriesOf,
  governingOf,
  groupTestKey,
  instanceName,
  instanceOf,
  namespaceOf,
  ownBeside,
  pickInstances,
  placementOf,
} from "../lib/instances.js";
import { absoluteTitle } from "../lib/time.js";
import {
  STEP_LINES,
  STEP_NAMES,
  displayRemote,
  isGroupRepository,
  lastSegment,
  cloneHere,
  lastSyncOf,
  pickDirectoryBridge,
  repositoryStatePhrase,
  sameRemote,
} from "../lib/space.js";
import { Icon } from "./Icon.js";
import { InlineConfirm } from "./InlineConfirm.js";
import { AddInstance, InstanceSection } from "./SpaceInstance.js";
import { GroupNameEditor, MembersPanel } from "./SpaceMembers.js";
import type { SignInFlow } from "./SpaceSignIn.js";
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

/** A remote a path names: reached on this device without the host
 * (space-11). */
const isPathRemote = (url: string | null): boolean => url !== null && url.startsWith("/");

/** Whether the instance governing a row is signed out (space-61): a
 * path remote is reached without one, and a row no instance governs
 * waits while the home is signed in nowhere. */
function signedOutFor(groups: GroupsState, repo: RepositoryState, governing: InstanceState | undefined): boolean {
  if (isPathRemote(repo.remote)) return false;
  return governing ? !governing.signedIn : !anySignedIn(groups);
}

/** Why Sync is refused before its first step on this row (space-11):
 * the surface's own reasons, its instance's sign-in first, named by its
 * display name as last read, else its host name. */
export function rowSyncRefusal(
  groups: GroupsState,
  repo: RepositoryState,
  governing: InstanceState | undefined,
): string | undefined {
  if (governing && signedOutFor(groups, repo, governing)) {
    return i18n._({
      id: "Sign in to {host} first",
      values: { host: instanceName(governing) },
      comment: "beside a disabled Sync: the row's instance is signed out; {host} its display name, or its host name before any read",
    });
  }
  return syncRefusal(groups, repo);
}

/** The sharing notice's words (space-57): what goes to a repository
 * others share, and that a public one's records are public. */
function sharingNotice(visibility: RepositoryState["visibility"]): string {
  return visibility === "public"
    ? i18n._(
        "Every session goes there whole — hidden parts and attachments included — and nothing recalls what others downloaded. This repository is public, so its records are public.",
      )
    : i18n._(
        "Every session goes there whole — hidden parts and attachments included — and nothing recalls what others downloaded.",
      );
}

/** The notice's acknowledging control (space-57). */
const continueLabel = (): string =>
  i18n._({ id: "Continue", comment: "confirm: go on with the first sync, or the pick joining a repository others share" });

/** The control a row's state offers (space-61). */
type RowControl = "sync" | "unrelated" | "pick" | "retry" | "join" | "none";

function rowControl(
  groups: GroupsState,
  group: InstanceGroupState,
  repo: RepositoryState,
  governing: InstanceState | undefined,
): RowControl {
  switch (repo.state) {
    case "absent":
      return "join";
    case "local-only":
      // A group's own spex repository is made by sign-in or its first
      // session (space-4, space-65); only a project's is picked for, and
      // only while an instance the pick would offer is signed in
      // (space-58).
      if (isGroupRepository(group, repo)) return "none";
      return pickInstances(groups, repo).length > 0 ? "pick" : "none";
    case "unreachable":
      // While its instance is signed out, a repository there waits for
      // that heading's "Sign in again" (space-3); a path or a refused
      // read is read once more.
      return signedOutFor(groups, repo, governing) ? "none" : "retry";
    case "reachable":
    case "read-only":
      return repo.sync.phase === "unrelated" || repo.branch?.unrelated === true ? "unrelated" : "sync";
    default:
      return "none";
  }
}

/** The groups list (space-1): your own group first, then each instance
 * the home lists under its heading in the home's order, its entries in
 * the order the heading lists them, under each one row per spex
 * repository in the core's order; while it lists any instance, "Add
 * instance…" at its foot. */
export function GroupsList({
  groups,
  now,
  selected,
  connected,
  refreshes,
  signIn,
  onSelect,
  onNote,
}: {
  groups: GroupsState;
  now: number;
  selected?: string;
  connected: boolean;
  /** How many times the reader's own Refresh has re-read the state. */
  refreshes: number;
  signIn: SignInFlow;
  onSelect(key: string): void;
  onNote: Note;
}) {
  const section = (group: InstanceGroupState, instance?: InstanceState) => (
    <GroupSection
      key={instance ? entryKey(group) : "own"}
      groups={groups}
      instance={instance}
      group={group}
      now={now}
      selected={selected}
      connected={connected}
      refreshes={refreshes}
      onSelect={onSelect}
      onNote={onNote}
    />
  );
  return (
    <section
      data-testid="space-groups"
      aria-label={i18n._({ id: "Your groups", comment: "the list of the home's groups and their spex repositories" })}
      className="flex flex-col gap-3"
    >
      {section(ownEntry(groups))}
      {groups.instances.map((instance) => (
        <InstanceSection
          key={instance.origin}
          instance={instance}
          now={now}
          connected={connected}
          signIn={signIn}
          onNote={onNote}
        >
          {entriesOf(instance).map((group) => section(group, instance))}
        </InstanceSection>
      ))}
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

/** How an entry reads on its heading (space-1). Your own group is called
 * so, never by a folder's or this device's user name; its path shows
 * once the home has been at an instance, and until then the key phrase
 * says it will. A namespace reads its login; a group's path stands
 * beside its name only where the two differ. */
function groupReading(
  groups: GroupsState,
  group: InstanceGroupState,
  instance: InstanceState | undefined,
): { name: string; beside: string | null } {
  if (!instance) {
    return {
      name: i18n._("Your own group"),
      beside: ownBeside(groups)
        ? i18n._({
            id: "named after your login at sign-in",
            comment: "beside the heading 'Your own group' before sign-in: its name and path come from the login",
          })
        : group.fullPath,
    };
  }
  if (group.login !== null) return { name: group.login, beside: null };
  return { name: group.name, beside: group.fullPath !== group.name ? group.fullPath : null };
}

/** How an instance's entry reads in a picker (space-58, space-78), as
 * the list reads it (space-1): a namespace by its login alone, a group
 * by its name with its path in the instance beside it where the two
 * differ. */
function entryReading(entry: InstanceGroupState): { name: string; beside: string | null } {
  const name = entry.login ?? entry.name;
  return { name, beside: entry.login === null && entry.fullPath !== name ? entry.fullPath : null };
}

/** An instance's entry as a picker names it (space-58, space-78): its
 * name, then its path after the separator where the two differ — the
 * separator the eye's, so the option's name says the group's name
 * first. */
function GroupOptionLabel({ entry }: { entry: InstanceGroupState }) {
  const { name, beside } = entryReading(entry);
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

/** Whether the list holds a spex repository under a group or a group
 * inside it at its instance (space-1): only an empty group offers
 * Delete. */
function holdsAnything(instance: InstanceState, group: InstanceGroupState): boolean {
  if (group.repositories.length > 0) return true;
  const inside = `${group.fullPath}/`.toLowerCase();
  return instance.groups.some((other) => other !== group && other.fullPath.toLowerCase().startsWith(inside));
}

/** One entry of the list (space-1): your own group, where `instance`
 * is none, or a group, your namespace or another account's login under
 * an instance's heading. Its heading — with Members and, where the
 * instance lets the person, "New subgroup", "Rename" and, on an empty
 * group, "Delete" on a group of a signed-in instance, your own group's
 * and a namespace's carrying none (DR-114, DR-120) — and its
 * repositories' rows. What a heading's control opens stands beneath the
 * heading; a group's command names its instance (space-29). */
function GroupSection({
  groups,
  instance,
  group,
  now,
  selected,
  connected,
  refreshes,
  onSelect,
  onNote,
}: {
  groups: GroupsState;
  /** The instance whose heading the entry stands under; none for your
   * own group. */
  instance?: InstanceState;
  group: InstanceGroupState;
  now: number;
  selected?: string;
  connected: boolean;
  refreshes: number;
  onSelect(key: string): void;
  onNote: Note;
}) {
  const spaceGroupDelete = useAppStore((state) => state.spaceGroupDelete);
  const [opened, setOpened] = useState<"members" | "subgroup" | "rename" | "delete">();
  const [deleting, setDeleting] = useState(false);
  const [refusal, setRefusal] = useState<string>();
  const refusalId = useId();
  const membersRef = useRef<HTMLButtonElement>(null);
  const subgroupRef = useRef<HTMLButtonElement>(null);
  const renameRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const { name, beside } = groupReading(groups, group, instance);
  // Your own group takes no subgroup and no member: what is there is
  // shared on its spex repositories (DR-114); a namespace, listed by no
  // id, takes nothing either (DR-120); nothing is offered at an instance
  // signed out.
  const hostGroup = instance?.signedIn && group.id !== null ? group.id : null;
  const own = instance === undefined;
  const testKey = own ? "own" : groupTestKey(group);
  // Your own group heads the list; an instance's entries stand under its
  // heading (space-1).
  const Heading = own ? "h2" : "h3";
  const close = (ref: { current: HTMLButtonElement | null }) => {
    setOpened(undefined);
    // Closing never strands focus (DR-010 §6).
    setTimeout(() => ref.current?.focus(), 0);
  };
  const toggle = (which: "members" | "subgroup" | "rename" | "delete") => {
    setRefusal(undefined);
    setOpened((was) => (was === which ? undefined : which));
  };
  const membersLabel = i18n._({ id: "Members", comment: "list the people the host lets read a spex repository" });
  // Delete stands only where the instance lets the person and the list
  // holds nothing under the group there (space-1).
  const deletable = hostGroup !== null && instance !== undefined && group.can.delete && !holdsAnything(instance, group);

  /** Delete the group (space-77): the heading's control reads
   * "Deleting…" until the reply; the group leaves the list as the core
   * holds it gone, and a refusal stands beneath the heading, the group
   * kept. */
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
      setTimeout(() => deleteRef.current?.focus(), 0);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      role="group"
      aria-label={own ? name : group.login ?? group.fullPath}
      data-testid={own ? "space-own" : `space-group-${testKey}`}
      className="@container flex min-w-0 flex-col gap-1"
    >
      {/* The name owns the slack; where the heading's controls leave it
          too little, they wrap beneath it (DR-041). */}
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <Heading className="flex min-w-24 flex-1 basis-0 items-baseline gap-2 text-sm font-medium">
          <span className="min-w-0 truncate" title={own && ownBeside(groups) ? undefined : group.fullPath}>
            {name}
          </span>
          {/* What stands beside the name follows a separator, so a
              name and a path never read as one (space-1). The space
              between the two is the flex gap's; this one keeps the
              heading's text in words. */}
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
        </Heading>
        {hostGroup !== null ? (
          <button
            ref={membersRef}
            type="button"
            data-testid={`space-group-members-${group.fullPath}`}
            aria-label={membersLabel}
            title={membersLabel}
            aria-expanded={opened === "members"}
            className={`${SECONDARY} shrink-0 whitespace-nowrap`}
            disabled={!connected}
            onClick={() => toggle("members")}
          >
            {/* Below @md the control keeps its name and shows its mark
                (DR-041). */}
            <span className="hidden @md:inline">{membersLabel}</span>
            <Icon name="list" className="h-3.5 w-3.5 @md:hidden" />
          </button>
        ) : null}
        {hostGroup !== null && group.can.createSubgroup ? (
          <button
            ref={subgroupRef}
            type="button"
            data-testid={`space-group-subgroup-${group.fullPath}`}
            aria-expanded={opened === "subgroup"}
            className={`${SECONDARY} shrink-0 whitespace-nowrap`}
            disabled={!connected}
            onClick={() => toggle("subgroup")}
          >
            {i18n._({ id: "New subgroup", comment: "create a group inside this group on the Git host" })}
          </button>
        ) : null}
        {hostGroup !== null && group.can.rename ? (
          <button
            ref={renameRef}
            type="button"
            data-testid={`space-group-rename-${group.fullPath}`}
            aria-expanded={opened === "rename"}
            className={`${SECONDARY} shrink-0 whitespace-nowrap`}
            disabled={!connected || deleting}
            onClick={() => toggle("rename")}
          >
            {i18n._({ id: "Rename", comment: "rename this group of the instance: its name and its path" })}
          </button>
        ) : null}
        {deletable ? (
          <button
            ref={deleteRef}
            type="button"
            data-testid={`space-group-delete-${group.fullPath}`}
            aria-expanded={opened === "delete"}
            aria-describedby={refusal ? refusalId : undefined}
            className={`${SECONDARY} shrink-0 whitespace-nowrap`}
            disabled={!connected || deleting}
            onClick={() => toggle("delete")}
          >
            {deleting
              ? i18n._({ id: "Deleting…", comment: "the Delete control, while the host deletes the group" })
              : i18n._({ id: "Delete", comment: "delete this empty group of the instance" })}
          </button>
        ) : null}
      </div>
      {opened === "delete" && hostGroup !== null ? (
        <div data-testid={`space-group-confirm-${group.fullPath}`} className="ml-6 min-w-0">
          <InlineConfirm
            question={i18n._("Delete {group}?", { group: group.fullPath })}
            confirmLabel={i18n._({ id: "Delete", comment: "confirm: delete the group on the Git host" })}
            cancelLabel={i18n._({ id: "Keep", comment: "cancel a deletion: leave it as it is" })}
            onConfirm={() => void remove()}
            onCancel={() => close(deleteRef)}
          />
        </div>
      ) : null}
      {refusal ? (
        <p
          id={refusalId}
          data-testid={`space-group-refusal-${group.fullPath}`}
          role="alert"
          className="ml-6 min-w-0 text-xs text-red-600 dark:text-red-400"
        >
          {refusal}
        </p>
      ) : null}
      {opened === "rename" && hostGroup !== null && instance ? (
        <div className="ml-6 min-w-0">
          <GroupNameEditor
            testId={`space-rename-${group.fullPath}`}
            instance={instance.origin}
            parent={null}
            rename={{ group: hostGroup, name: group.name, path: lastSegment(group.fullPath) }}
            connected={connected}
            onClose={() => close(renameRef)}
            onNote={onNote}
          />
        </div>
      ) : null}
      {opened === "subgroup" && hostGroup !== null && instance ? (
        <div className="ml-6 min-w-0">
          <GroupNameEditor
            testId={`space-subgroup-${group.fullPath}`}
            instance={instance.origin}
            parent={hostGroup}
            connected={connected}
            onClose={() => close(subgroupRef)}
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
          onClose={() => close(membersRef)}
          onNote={onNote}
        />
      ) : null}
      {group.repositories.length === 0 ? (
        <p className="pl-2 text-xs text-neutral-500">{i18n._("No spex repositories here yet")}</p>
      ) : (
        <ul className="flex min-w-0 flex-col gap-0.5">
          {group.repositories.map((repo) => (
            <RepositoryRow
              key={repo.key}
              groups={groups}
              instance={instance}
              group={group}
              repo={repo}
              now={now}
              selected={repo.key === selected}
              connected={connected}
              refreshes={refreshes}
              onSelect={() => onSelect(repo.key)}
              onNote={onNote}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

type Opened = "pick" | "join" | "folder" | "members" | "notice" | "unrelated" | "move";

/** One spex repository's row (space-1, space-61): the name owns the
 * slack, the code and the counts hide below @md (space-28), and the
 * row's control keeps its accessible name at every width. */
function RepositoryRow({
  groups,
  instance,
  group,
  repo,
  now,
  selected,
  connected,
  refreshes,
  onSelect,
  onNote,
}: {
  groups: GroupsState;
  /** The instance whose heading the row stands under; none under your
   * own group. */
  instance?: InstanceState;
  group: InstanceGroupState;
  repo: RepositoryState;
  now: number;
  selected: boolean;
  connected: boolean;
  refreshes: number;
  onSelect(): void;
  onNote: Note;
}) {
  const spaceSync = useAppStore((state) => state.spaceSync);
  const spaceJoin = useAppStore((state) => state.spaceJoin);
  const spaceRefresh = useAppStore((state) => state.spaceRefresh);
  const rebindProject = useAppStore((state) => state.rebindProject);
  const spaceRepositoryMove = useAppStore((state) => state.spaceRepositoryMove);
  const [opened, setOpened] = useState<Opened>();
  const [moving, setMoving] = useState(false);
  const [busy, setBusy] = useState<"sync" | "join" | "retry">();
  // A long command's reply is only "accepted": its control stays busy
  // until the machine's state moves, so nothing re-enables between the
  // reply and the state (DR-010 §3, space-29).
  const [accepted, setAccepted] = useState<{ op: "sync" | "join"; key: string }>();
  const [error, setError] = useState<string>();
  const controlRef = useRef<HTMLButtonElement>(null);
  const membersRef = useRef<HTMLButtonElement>(null);
  const folderRef = useRef<HTMLButtonElement>(null);
  const moveRef = useRef<HTMLButtonElement>(null);

  const sync = repo.sync;
  const running = sync.phase === "running";
  const machineKey = `${repo.state}|${JSON.stringify(sync)}`;
  useEffect(() => {
    if (accepted && accepted.key !== machineKey) setAccepted(undefined);
  }, [accepted, machineKey]);

  // The instance governing the row, as the core names it, else its own
  // (space-1, space-61).
  const governing = governingOf(groups, repo);
  const control = rowControl(groups, group, repo, governing);
  const groupRepository = isGroupRepository(group, repo);
  const close = (focus: "control" | "members" | "folder" | "move" = "control") => {
    setOpened(undefined);
    const ref = focus === "members" ? membersRef : focus === "folder" ? folderRef : focus === "move" ? moveRef : controlRef;
    // Closing never strands focus (DR-010 §6).
    setTimeout(() => ref.current?.focus(), 0);
  };

  const start = async (input: { join?: boolean; noticed?: boolean }) => {
    const key = machineKey;
    // Joining two histories is a sync started as a join (space-13).
    const op = input.join ? "join" : "sync";
    setBusy(op);
    setError(undefined);
    try {
      await spaceSync(repo.key, input);
      setAccepted({ op, key });
    } catch (cause) {
      const message = (cause as Error).message;
      setError(message);
      onNote(message);
    } finally {
      setBusy(undefined);
    }
  };

  /** Join a repository an instance lists into a folder (space-63), at
   * the instance whose heading the row stands under (space-29), else
   * the one the row names. */
  const join = async (folder: string): Promise<void> => {
    if (!repo.id) return;
    const key = machineKey;
    setBusy("join");
    setError(undefined);
    try {
      await spaceJoin(instance?.origin ?? repo.instance ?? groups.defaultInstance, repo.id, folder);
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
      const message = (cause as Error).message;
      onNote(message);
      throw cause;
    }
  };

  /** Ask for a folder through the shell's picker where it offers one,
   * else in place (space-63). */
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
      // The refusal stands beside the row (space-63).
      setError((cause as Error).message);
    }
  };

  /** Move the repository into a group, or your own where `groupId` is
   * null (space-78): the control reads "Moving…" until the reply, after
   * which the row stands under its new group as the core holds it; a
   * refusal is the picker's to show. */
  const move = async (groupId: string | null): Promise<void> => {
    setMoving(true);
    try {
      await spaceRepositoryMove(repo.key, groupId);
      setOpened(undefined);
      // The row stands under its new group now: focus follows it there
      // (DR-010 §6).
      setTimeout(() => (document.querySelector(`[data-testid="space-row-move-${repo.key}"]`) as HTMLElement | null)?.focus(), 0);
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
  const pending = busy !== undefined || accepted !== undefined || running;
  const refusal = control === "sync" || control === "unrelated" ? rowSyncRefusal(groups, repo, governing) : undefined;
  // The first push into a repository others share says once what goes
  // there (space-57); one whose only member is the account says nothing,
  // and one whose count the host's read lacks, never synced from here,
  // may have others.
  const needsNotice = !repo.noticed && (repo.members === null ? repo.lastSync === null : repo.members > 1);
  const joining = busy === "join" || accepted?.op === "join" || (running && sync.op === "join");
  const syncing =
    busy === "sync" || accepted?.op === "sync" || (running && sync.op !== "join" && sync.op !== "check");
  const readOnly = repo.state === "read-only";

  let controlButton: ReactNode = null;
  const button = (
    testId: string,
    label: string,
    options: { title?: string; disabled?: boolean; expanded?: boolean; onClick(): void; describedBy?: string },
  ) => (
    <button
      ref={controlRef}
      type="button"
      data-testid={testId}
      className={`${SECONDARY} shrink-0 whitespace-nowrap`}
      title={options.title}
      aria-describedby={options.describedBy}
      aria-expanded={options.expanded}
      disabled={disabled || options.disabled}
      onClick={options.onClick}
    >
      {label}
    </button>
  );
  const captionId = `space-row-caption-${repo.key}`;
  switch (control) {
    case "sync":
    case "unrelated":
      controlButton = button(
        `space-row-sync-${repo.key}`,
        control === "unrelated"
          ? joining
            ? i18n._({ id: "Joining…", comment: "the Join control, while the join runs" })
            : i18n._({ id: "Join", comment: "confirm: join both histories into one" })
          : syncing
            ? i18n._({ id: "Syncing…", comment: "the Sync control, while the sync runs" })
            : i18n._({ id: "Sync", comment: "tab and control: send and bring back changes" }),
        {
          // What the control does is its own to say (DR-069); a running
          // control's word says it already.
          title: pending
            ? undefined
            : control === "unrelated"
              ? i18n._("Brings both histories into one and asks about anything that differs")
              : readOnly
                ? i18n._("Brings back anything new; sends nothing")
                : i18n._("Sends what is here and brings back anything new"),
          disabled: refusal !== undefined || pending,
          describedBy: refusal || error ? captionId : undefined,
          onClick: () => {
            if (control === "unrelated") setOpened("unrelated");
            else if (needsNotice && !readOnly) setOpened("notice");
            else void start({});
          },
        },
      );
      break;
    case "pick":
      controlButton = button(
        `space-row-pick-${repo.key}`,
        i18n._({ id: "Pick a group", comment: "choose where on the Git host a project's records go" }),
        { expanded: opened === "pick", onClick: () => setOpened((was) => (was === "pick" ? undefined : "pick")) },
      );
      break;
    case "retry":
      controlButton = button(
        `space-row-retry-${repo.key}`,
        busy === "retry"
          ? i18n._({ id: "Retrying…", comment: "the Retry control, while the retry is in flight" })
          : i18n._({ id: "Retry", comment: "run the stopped step again" }),
        {
          title: i18n._("Reads the host again"),
          disabled: busy === "retry",
          describedBy: error ? captionId : undefined,
          onClick: () => void retry(),
        },
      );
      break;
    case "join":
      controlButton = button(
        `space-row-join-${repo.key}`,
        joining
          ? i18n._({ id: "Joining…", comment: "the Join control, while the join runs" })
          : i18n._({ id: "Join", comment: "confirm: join both histories into one" }),
        {
          title: i18n._("Brings it to this device"),
          disabled: !repo.id || joining,
          expanded: pickDirectoryBridge() ? undefined : opened === "join",
          describedBy: error ? captionId : undefined,
          onClick: () => void askFolder("join"),
        },
      );
      break;
    default:
      controlButton = null;
  }

  // A clone whose code found no folder here is paired later (space-63);
  // a row with no clone here has nothing to pair (space-61).
  const needsFolder = cloneHere(repo) && !groupRepository && repo.folder === null && repo.state !== "local-only";
  // Members while the instance governing it is signed in (space-62).
  const showMembers = repo.state === "reachable" && governing?.signedIn === true;
  // On a project's under a signed-in instance's heading, where its last
  // read lets the person move it; a group's own records stay in their
  // group, and your own group's in yours (space-1, DR-103).
  const showMove = instance?.signedIn === true && repo.can.transfer && !groupRepository;
  const moveName = i18n._({ id: "Move to another group", comment: "move a spex repository into another group of the instance, or your own" });

  const code = repo.code
    ? displayRemote(repo.code)
    : repo.state === "absent"
      ? i18n._("Not on this device")
      : groupRepository
        ? i18n._({ id: "Group records", comment: "where a group's own spex repository's code lives: it has none, holding the group's records" })
        : i18n._({ id: "Code not on a remote", comment: "a project's spex repository whose records name no code remote" });
  // Signed in nowhere, your own group's records wait for the sign-in
  // that shares them (space-3).
  const state =
    repo.own && repo.state === "local-only" && !anySignedIn(groups)
      ? i18n._("On this device only — shared once you sign in")
      : repositoryStatePhrase(repo, now);
  const dot = statusDot(repo);
  const branch = repo.branch;
  const counted = branch && branch.checkedAt !== null && !branch.unrelated;
  // The last sync recorded, else the one the clone holds (space-61).
  const last = lastSyncOf(repo);
  const stateTitle = repo.waiting
    ? repo.waiting.message
    : readOnly
      ? i18n._("{state} · new sessions stay on this device", { state })
      : last && repo.state !== "reachable"
        ? i18n._("{state} · last synced {at}", { state, at: absoluteTitle(last.at) })
        : last
          ? absoluteTitle(last.at)
          : state;
  // The row is named by the repository alone, its code, counts and
  // state describing it: a name that holds still while the state's age
  // ticks on (DR-041).
  const describe = (part: string) => `space-repo-${part}-${repo.key}`;
  const describedBy = [
    code !== null && code !== state ? describe("code") : null,
    repo.local.length > 0 ? describe("changes") : null,
    counted ? describe("counts") : null,
    describe("state"),
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li data-testid={`space-row-${repo.key}`} data-state={repo.state} className="@container flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          data-testid={`space-repo-${repo.key}`}
          data-state={repo.state}
          aria-label={repo.name}
          aria-describedby={describedBy}
          aria-expanded={selected}
          aria-controls={selected ? "space-repository" : undefined}
          onClick={onSelect}
          className={`flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1 text-left text-sm ${
            selected
              ? "bg-brand-50 text-brand-800 dark:bg-brand-950 dark:text-brand-200"
              : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
          }`}
        >
          <span
            aria-hidden
            data-testid={`space-repo-dot-${repo.key}`}
            title={dot.word}
            className={`inline-block h-2 w-2 shrink-0 rounded-full ${dot.className}`}
          />
          <span className="min-w-0 flex-1 truncate font-medium" title={repo.key}>
            {repo.name}
          </span>
          {code !== null && code !== state ? (
            <span
              id={describe("code")}
              data-testid={`space-repo-code-${repo.key}`}
              // A remote reads as code; the phrases for none read as
              // words.
              className={`hidden min-w-0 max-w-[30%] truncate text-xs text-neutral-500 @md:inline ${
                repo.code ? "font-mono" : ""
              }`}
              title={repo.code ?? undefined}
            >
              {code}
            </span>
          ) : null}
          {repo.local.length > 0 ? (
            <span
              data-testid={`space-repo-changes-${repo.key}`}
              className="shrink-0 text-xs text-neutral-500"
              title={i18n._("{count, plural, one {# local change} other {# local changes}}", {
                count: repo.local.length,
              })}
            >
              {/* The words beside a count yield first (DR-041): below
                  @md the number stands alone, the phrase describing
                  the row still. */}
              <span aria-hidden className="@md:hidden">
                {repo.local.length}
              </span>
              <span id={describe("changes")} className="hidden @md:inline">
                {i18n._("{count, plural, one {# change} other {# changes}}", { count: repo.local.length })}
              </span>
            </span>
          ) : null}
          {counted ? (
            <span
              id={describe("counts")}
              data-testid={`space-repo-counts-${repo.key}`}
              className="hidden shrink-0 text-xs text-neutral-500 @md:inline"
              title={i18n._(
                "{ahead, plural, one {# commit} other {# commits}} ahead, {behind, plural, one {# commit} other {# commits}} behind · checked {at}",
                { ahead: branch.ahead ?? 0, behind: branch.behind ?? 0, at: absoluteTitle(branch.checkedAt!) },
              )}
            >
              <span aria-hidden>↑</span>
              {branch.ahead ?? 0}
              <span className="sr-only">
                {i18n._({ id: " ahead", comment: "follows the count of commits this device is ahead by" })}
              </span>{" "}
              <span aria-hidden>↓</span>
              {branch.behind ?? 0}
              <span className="sr-only">
                {i18n._({ id: " behind", comment: "follows the count of commits this device is behind by" })}
              </span>
            </span>
          ) : null}
          <span
            id={describe("state")}
            data-testid={`space-repo-state-${repo.key}`}
            className="min-w-0 max-w-[45%] shrink truncate text-xs text-neutral-500"
            title={stateTitle}
          >
            {state}
          </span>
        </button>
        {needsFolder ? (
          <button
            ref={folderRef}
            type="button"
            data-testid={`space-row-folder-${repo.key}`}
            className={`${SECONDARY} shrink-0 whitespace-nowrap`}
            title={i18n._("Pairs it with its folder on this device")}
            disabled={disabled || running}
            onClick={() => void askFolder("folder")}
          >
            {i18n._("Choose folder…")}
          </button>
        ) : null}
        {showMembers ? (
          <button
            ref={membersRef}
            type="button"
            data-testid={`space-row-members-${repo.key}`}
            aria-label={i18n._({ id: "Members", comment: "list the people the host lets read a spex repository" })}
            title={i18n._({ id: "Members", comment: "list the people the host lets read a spex repository" })}
            aria-expanded={opened === "members"}
            className={`${SECONDARY} shrink-0 whitespace-nowrap`}
            disabled={disabled}
            onClick={() => setOpened((was) => (was === "members" ? undefined : "members"))}
          >
            {/* Below @md the control keeps its name and shows its mark
                (DR-041). */}
            <span className="hidden @md:inline">
              {i18n._({ id: "Members", comment: "list the people the host lets read a spex repository" })}
            </span>
            <Icon name="list" className="h-3.5 w-3.5 @md:hidden" />
          </button>
        ) : null}
        {showMove ? (
          <button
            ref={moveRef}
            type="button"
            data-testid={`space-row-move-${repo.key}`}
            // The long name is its title and its accessible name; the
            // label keeps to the row's budget (space-28, DR-041).
            aria-label={moving ? undefined : moveName}
            title={moveName}
            aria-expanded={opened === "move"}
            className={`${SECONDARY} shrink-0 whitespace-nowrap`}
            disabled={disabled || moving}
            onClick={() => setOpened((was) => (was === "move" ? undefined : "move"))}
          >
            {moving
              ? i18n._({ id: "Moving…", comment: "the Move control, while the host moves the spex repository" })
              : i18n._({ id: "Move…", comment: "open the groups a spex repository may move to; its full name is 'Move to another group'" })}
          </button>
        ) : null}
        {controlButton}
      </div>
      {refusal && !running ? (
        <p id={captionId} data-testid={captionId} className="pl-6 text-xs text-neutral-500">
          {refusal}
        </p>
      ) : error ? (
        <p id={captionId} data-testid={captionId} role="alert" className="pl-6 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
      {opened === "pick" ? (
        <GroupPicker groups={groups} repo={repo} connected={connected} onClose={() => close()} onNote={onNote} />
      ) : null}
      {opened === "move" ? (
        <MovePicker
          groups={groups}
          repo={repo}
          busy={moving}
          connected={connected}
          onMove={move}
          onClose={() => close("move")}
        />
      ) : null}
      {opened === "join" ? (
        <FolderEditor
          testId={`space-join-${repo.key}`}
          label={
            repo.code
              ? i18n._("Folder for its code on this device")
              : i18n._("Folder its sessions run in on this device")
          }
          initial=""
          submitLabel={i18n._({ id: "Join", comment: "confirm: join both histories into one" })}
          busyLabel={i18n._({ id: "Joining…", comment: "the Join control, while the join runs" })}
          onSubmit={join}
          onCancel={() => close()}
        />
      ) : null}
      {opened === "folder" ? (
        <FolderEditor
          testId={`space-folder-${repo.key}`}
          label={i18n._("Folder for its code on this device")}
          initial=""
          submitLabel={i18n._("Add project")}
          busyLabel={i18n._({ id: "Adding…", comment: "the Add project control, while the add is in flight" })}
          onSubmit={pair}
          onCancel={() => close("folder")}
        />
      ) : null}
      {opened === "members" && governing ? (
        <MembersPanel
          instance={governing}
          target={{ repository: repo.key }}
          id={repo.key}
          name={repo.name}
          canManage={repo.can.manageMembers}
          connected={connected}
          refreshes={refreshes}
          onClose={() => close("members")}
          onNote={onNote}
        />
      ) : null}
      {opened === "notice" ? (
        <div data-testid="space-notice-confirm" className="pl-6">
          <InlineConfirm
            question={sharingNotice(repo.visibility)}
            confirmLabel={continueLabel()}
            onConfirm={() => {
              setOpened(undefined);
              void start({ noticed: true });
            }}
            onCancel={() => close()}
          />
        </div>
      ) : null}
      {opened === "unrelated" ? (
        <div data-testid="space-join-confirm" className="pl-6">
          <InlineConfirm
            question={i18n._("Join both histories into one? Anything that differs will ask you to choose.")}
            confirmLabel={i18n._({ id: "Join", comment: "confirm: join both histories into one" })}
            onConfirm={() => {
              setOpened(undefined);
              void start({ join: true });
            }}
            onCancel={() => close()}
          />
        </div>
      ) : null}
    </li>
  );
}

/** Where a spex repository moves (space-78): a picker as space-58's,
 * of the instance the row stands under alone — your namespace there
 * first, read by your login, then each group it lists, each read as the
 * list reads it, never another account's login, never the entry the row
 * stands under — with Cancel, Escape cancelling. A pick asks the host;
 * a refusal stands in the picker, the row kept where it stood. */
function MovePicker({
  groups,
  repo,
  busy,
  connected,
  onMove,
  onClose,
}: {
  groups: GroupsState;
  repo: RepositoryState;
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
  // The instance whose heading the row stands under, and the entry it
  // stands in there; a row under your own group moves at its own
  // instance, leaving no entry out.
  const placement = placementOf(groups, repo.key);
  const instance = placement && !placement.own ? placement.instance : instanceOf(groups, repo.instance);
  const standing = placement && !placement.own ? placement.group : undefined;
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
      aria-label={i18n._("Move {name} to another group", { name: repo.name })}
      data-testid={`space-move-${repo.key}`}
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
        <button type="button" data-testid={`space-move-cancel-${repo.key}`} className={SECONDARY} disabled={busy} onClick={onClose}>
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
  listed: { group: InstanceGroupState; repo: RepositoryState }[];
  creatable: InstanceGroupState[];
}

/** Where a local-only project's records go (space-58): in one picker,
 * one section per signed-in instance under its display name — the
 * clone's instance alone where its key lies under one — each holding
 * the spex repositories that instance lists for the same code, each with
 * its group, read as the list reads it, and members' count, and, below
 * them, your namespace there read by your login and every group it
 * lists; the new repository's name in one editable field every section
 * shares. Picking a listed one that may have other members says the
 * sharing notice beneath it first, and joins with `noticed` only on
 * Continue (space-57). A choice names the instance of its section
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
  const spacePick = useAppStore((state) => state.spacePick);
  const code = repo.code;
  const sections: PickSection[] = pickInstances(groups, repo).map((instance) => {
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
          .map((other) => ({ group, repo: other })),
      ),
      // GroupsState names no right to create a repository, so every
      // group is offered and a refusal waits on the row (space-64).
      creatable: [...(mine ? [mine] : []), ...instance.groups.filter((group) => group.id !== null)],
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
  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  /** Cancel starts nothing; focus returns to the option (DR-010 §6). */
  const closeNotice = (key: string) => {
    setNotice(undefined);
    setTimeout(() => {
      const option = pickerRef.current?.querySelector<HTMLButtonElement>(`[data-testid="space-pick-repo-${key}"]`);
      option?.focus();
    }, 0);
  };

  const pick = async (
    id: string,
    choice:
      | { kind: "join"; instance: string; hostId: string }
      | { kind: "create"; instance: string; groupId: string | null; name: string },
    noticed = false,
  ) => {
    setBusy(id);
    setRefusal(undefined);
    try {
      await (noticed ? spacePick(repo.key, choice, true) : spacePick(repo.key, choice));
      onClose();
    } catch (cause) {
      const message = (cause as Error).message;
      setRefusal(message);
      onNote(message);
      // A name the host refuses asks for another in place (space-58); a
      // refused join hands focus back to its option, its notice closed.
      if (choice.kind === "create") nameRef.current?.focus();
      else closeNotice(id);
    } finally {
      setBusy(undefined);
    }
  };

  /** Join a listed spex repository at its instance (space-58): one
   * whose only member is the account joins at once; one with others, or
   * whose count the host's last read lacks, says the notice first
   * unless this device's reader has seen it for this repository
   * (space-57). */
  const join = (instance: InstanceState, other: RepositoryState) => {
    if (!repo.noticed && (other.members === null || other.members > 1)) {
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
      aria-label={i18n._("Pick a group for {name}", { name: repo.name })}
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
                  {i18n._("On the host for this code")}
                </h4>
                <ul className="flex min-w-0 flex-col gap-1">
                  {listed.map(({ group, repo: other }) => (
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
                          {other.name}
                        </span>
                        <span
                          data-testid={`space-pick-listed-group-${other.key}`}
                          className="flex min-w-0 max-w-[40%] items-baseline gap-1 text-xs text-neutral-500"
                        >
                          <GroupOptionLabel entry={group} />
                        </span>
                        {other.members !== null ? (
                          <span className="shrink-0 text-xs text-neutral-500">
                            {i18n._("{count, plural, one {# member} other {# members}}", { count: other.members })}
                          </span>
                        ) : null}
                      </button>
                      {notice === other.key ? (
                        <div data-testid={`space-pick-notice-${repo.key}`} className="mt-1 pl-2">
                          <InlineConfirm
                            question={sharingNotice(other.visibility)}
                            confirmLabel={continueLabel()}
                            disabled={disabled}
                            onConfirm={() =>
                              void pick(other.key, { kind: "join", instance: instance.origin, hostId: other.id! }, true)
                            }
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
                      <GroupOptionLabel entry={group} />
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
