// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The groups list of the Groups surface (space-1, space-61, DR-103):
// your own group first, then every group the host lists, each with its
// spex repositories as rows. A row reads the repository's name, where
// its code lives, its reachability, its local changes, ahead and behind
// and its last sync, and carries the one control its state offers —
// Sync, Join, Pick a group, Retry — with Members on a
// reachable row. What a control opens stands in place beneath its row:
// the group picker (space-58), the folder a Join clones into
// (space-63), the members the host reports (space-62), the first-push
// notice (space-57) and the joining of unrelated histories (space-13).
// Signed in, "New group" heads the list where the host lets the person
// create one — inside the group the host names as its own, which stands
// after yours headed "<name> · this host's group", or at the top where
// it names none (DR-120) — and a group of the host carries Members and,
// where the host lets them, "New subgroup" on its heading (space-68,
// DR-114); your own group's heading carries neither.
// Every act is a command whose outcome arrives as state (space-29).

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { GroupsState, RepositoryState } from "@sublang/spex-core/protocol";

import { useAppStore } from "../state/store.js";
import { i18n } from "../i18n.js";
import { absoluteTitle, relativeAge } from "../lib/time.js";
import {
  STEP_LINES,
  STEP_NAMES,
  displayRemote,
  hostGroupOf,
  hostGroupPhrase,
  inHostGroup,
  isGroupRepository,
  lastSegment,
  lastSyncOf,
  openHostPage,
  pickDirectoryBridge,
  repositoryStatePhrase,
  sameRemote,
} from "../lib/space.js";
import { Icon } from "./Icon.js";
import { InlineConfirm } from "./InlineConfirm.js";
import { GroupNameEditor, MembersPanel, pageHost } from "./SpaceMembers.js";
import { SECONDARY, syncRefusal, type Note } from "./SpaceSurface.js";

type Group = GroupsState["groups"][number];

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

/** Why Sync is refused before its first step on this row (space-11):
 * the surface's own reasons, the account's first. */
export function rowSyncRefusal(groups: GroupsState, repo: RepositoryState): string | undefined {
  if (!groups.account && !isPathRemote(repo.remote)) return i18n._("Sign in first");
  return syncRefusal(groups, repo);
}

/** The control a row's state offers (space-61). */
type RowControl = "sync" | "unrelated" | "pick" | "retry" | "join" | "none";

function rowControl(groups: GroupsState, group: Group, repo: RepositoryState): RowControl {
  switch (repo.state) {
    case "absent":
      return "join";
    case "local-only":
      // Signing in is the header's alone (space-3).
      if (!groups.account) return "none";
      // A group's own spex repository is made by sign-in or its first
      // session (space-4, space-65); only a project's is picked for.
      return isGroupRepository(group, repo) ? "none" : "pick";
    case "unreachable":
      // Signed out, a repository the host holds waits for the header's
      // Sign in; a path or a refused read is read once more.
      return !groups.account && !isPathRemote(repo.remote) ? "none" : "retry";
    case "reachable":
    case "read-only":
      return repo.sync.phase === "unrelated" || repo.branch?.unrelated === true ? "unrelated" : "sync";
    default:
      return "none";
  }
}

/** The groups list (space-1): "New group" at its head where the host
 * lets the person create one, then each group with its full path and,
 * under it, one row per spex repository in the core's order. */
export function GroupsList({
  groups,
  now,
  selected,
  connected,
  refreshes,
  onSelect,
  onNote,
}: {
  groups: GroupsState;
  now: number;
  selected?: string;
  connected: boolean;
  /** How many times the reader's own Refresh has re-read the state. */
  refreshes: number;
  onSelect(key: string): void;
  onNote: Note;
}) {
  return (
    <section
      data-testid="space-groups"
      aria-label={i18n._({ id: "Your groups", comment: "the list of the home's groups and their spex repositories" })}
      className="flex flex-col gap-3"
    >
      {groups.account ? <ListHead groups={groups} connected={connected} onNote={onNote} /> : null}
      {groups.groups.map((group) => (
        <GroupSection
          key={group.fullPath}
          groups={groups}
          group={group}
          now={now}
          selected={selected}
          connected={connected}
          refreshes={refreshes}
          onSelect={onSelect}
          onNote={onNote}
        />
      ))}
    </section>
  );
}

/** The list's head while signed in (space-1). Where the host names a
 * group of its own, every group is made inside it (DR-120): "New group"
 * creates there where the read lists it and lets the person create a
 * subgroup in it, and where the read does not list it — the person is
 * no member — one line says who can let her in, with no door to the
 * host's site. Where the host names none: "New group" at the top where
 * the read says she may, else the host's own site (DR-118). */
function ListHead({ groups, connected, onNote }: { groups: GroupsState; connected: boolean; onNote: Note }) {
  const named = hostGroupOf(groups);
  if (named) {
    const row = groups.groups.find((group) => group.instance && !group.own);
    if (!row) {
      return (
        <p data-testid="space-host-group-ask" className="min-w-0 text-xs text-neutral-500">
          {i18n._({
            id: "Groups are made in {name}; ask its owner to share it with you",
            comment: "the groups list's head where the Git host names a group of its own that the person is not a member of; {name} is that group's name",
            values: { name: named.name },
          })}
        </p>
      );
    }
    return row.id !== null && row.can.createSubgroup ? <NewGroup parent={row.id} connected={connected} onNote={onNote} /> : null;
  }
  return groups.account?.canCreateGroup ? <NewGroup parent={null} connected={connected} onNote={onNote} /> : <NewGroupAtHost groups={groups} />;
}

/** "New group" at the list's head (space-1, space-68): a group named
 * in place, inside the host's own group where it names one (DR-120),
 * else at the top of the host. */
function NewGroup({ parent, connected, onNote }: { parent: string | null; connected: boolean; onNote: Note }) {
  const [open, setOpen] = useState(false);
  const controlRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <button
        ref={controlRef}
        type="button"
        data-testid="space-new-group"
        aria-expanded={open}
        className={`${SECONDARY} self-start whitespace-nowrap`}
        disabled={!connected}
        onClick={() => setOpen((was) => !was)}
      >
        {i18n._({ id: "New group", comment: "create a group on the Git host" })}
      </button>
      {open ? (
        <GroupNameEditor
          testId="space-new-group-editor"
          parent={parent}
          connected={connected}
          onClose={() => {
            setOpen(false);
            // Closing never strands focus (DR-010 §6).
            setTimeout(() => controlRef.current?.focus(), 0);
          }}
          onNote={onNote}
        />
      ) : null}
    </div>
  );
}

/** Where the host names no group of its own and its read says the
 * person may not create one, the host's own site, where a group at the
 * top is then made (space-1, DR-118): the origin of your own group's
 * page as the read gives it, named by its host. Nothing stands before a
 * read gives that page. */
function NewGroupAtHost({ groups }: { groups: GroupsState }) {
  const page = groups.groups.find((group) => group.own)?.url ?? null;
  let site: string | null = null;
  try {
    site = page ? new URL(page).origin : null;
  } catch {
    site = null;
  }
  if (!site || site === "null") return null;
  const label = i18n._({
    id: "New group at {site}",
    comment: "link to the Git host's own site, where a group at the top is made when Spex may not create one; {site} is that site's host name",
    values: { site: pageHost(site, groups) },
  });
  return (
    <a
      data-testid="space-new-group-at-host"
      href={site}
      target="_blank"
      rel="noreferrer"
      title={label}
      onClick={(event) => openHostPage(event, site)}
      className="min-w-0 max-w-full self-start truncate text-xs text-brand-600 hover:underline dark:text-brand-300"
    >
      {label}
    </a>
  );
}

/** One group (space-1): its heading — with Members and, where the
 * host lets the person, "New subgroup" on a group of the host, your
 * own group's carrying neither (DR-114) — and its repositories' rows.
 * What a heading's control opens stands beneath the heading. */
function GroupSection({
  groups,
  group,
  now,
  selected,
  connected,
  refreshes,
  onSelect,
  onNote,
}: {
  groups: GroupsState;
  group: Group;
  now: number;
  selected?: string;
  connected: boolean;
  refreshes: number;
  onSelect(key: string): void;
  onNote: Note;
}) {
  const [opened, setOpened] = useState<"members" | "subgroup">();
  const membersRef = useRef<HTMLButtonElement>(null);
  const subgroupRef = useRef<HTMLButtonElement>(null);
  // Your own group is called so, never by a folder's or this device's
  // user name; its path shows once the host names it, and until then
  // the key phrase says it will (space-1). A group's path stands beside
  // its name only where the two differ.
  const name = group.own ? i18n._("Your own group") : group.name;
  // The host's own group is headed by the key phrase saying so, where
  // every group is made (DR-120); its full path rides the name's title.
  const beside =
    group.own && !groups.account
      ? i18n._({
          id: "named after your login at sign-in",
          comment: "beside the heading 'Your own group' before sign-in: its name and path come from the login",
        })
      : group.instance && !group.own
        ? hostGroupPhrase()
        : group.fullPath !== name
          ? group.fullPath
          : null;
  // Your own group takes no subgroup and no member: what is there is
  // shared on its spex repositories (DR-114).
  const hostGroup = groups.account !== null && !group.own && group.id !== null ? group.id : null;
  const close = (ref: { current: HTMLButtonElement | null }) => {
    setOpened(undefined);
    // Closing never strands focus (DR-010 §6).
    setTimeout(() => ref.current?.focus(), 0);
  };
  const toggle = (which: "members" | "subgroup") => setOpened((was) => (was === which ? undefined : which));
  const membersLabel = i18n._({ id: "Members", comment: "list the people the host lets read a spex repository" });

  return (
    <div
      role="group"
      aria-label={group.own ? name : group.fullPath}
      data-testid={`space-group-${group.fullPath}`}
      className="@container flex min-w-0 flex-col gap-1"
    >
      <div className="flex min-w-0 items-center gap-1">
        <h2 className="flex min-w-0 flex-1 items-baseline gap-2 text-sm font-medium">
          <span className="min-w-0 truncate" title={group.own && !groups.account ? undefined : group.fullPath}>
            {name}
          </span>
          {/* What stands beside the name follows a separator, so a
              name and a path never read as one (space-1). The space
              between the two is the flex gap's; this one keeps the
              heading's text in words. */}
          {beside !== null ? " " : null}
          {beside !== null ? (
            <span
              data-testid={`space-heading-beside-${group.fullPath}`}
              className="min-w-0 truncate text-xs font-normal text-neutral-500"
              title={beside}
            >
              <span aria-hidden>· </span>
              {beside}
            </span>
          ) : null}
        </h2>
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
        {/* The host's own group takes its subgroups from the list's
            head, whose "New group" is that act (DR-120). */}
        {hostGroup !== null && group.can.createSubgroup && !group.instance ? (
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
      </div>
      {opened === "subgroup" && hostGroup !== null ? (
        <div className="ml-6 min-w-0">
          <GroupNameEditor
            testId={`space-subgroup-${group.fullPath}`}
            parent={hostGroup}
            connected={connected}
            onClose={() => close(subgroupRef)}
            onNote={onNote}
          />
        </div>
      ) : null}
      {opened === "members" && hostGroup !== null ? (
        <MembersPanel
          groups={groups}
          target={{ group: hostGroup }}
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

type Opened = "pick" | "join" | "folder" | "members" | "notice" | "unrelated";

/** One spex repository's row (space-1, space-61): the name owns the
 * slack, the code and the counts hide below @md (space-28), and the
 * row's control keeps its accessible name at every width. */
function RepositoryRow({
  groups,
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
  group: Group;
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
  const [opened, setOpened] = useState<Opened>();
  const [busy, setBusy] = useState<"sync" | "join" | "retry">();
  // A long command's reply is only "accepted": its control stays busy
  // until the machine's state moves, so nothing re-enables between the
  // reply and the state (DR-010 §3, space-29).
  const [accepted, setAccepted] = useState<{ op: "sync" | "join"; key: string }>();
  const [error, setError] = useState<string>();
  const controlRef = useRef<HTMLButtonElement>(null);
  const membersRef = useRef<HTMLButtonElement>(null);
  const folderRef = useRef<HTMLButtonElement>(null);

  const sync = repo.sync;
  const running = sync.phase === "running";
  const machineKey = `${repo.state}|${JSON.stringify(sync)}`;
  useEffect(() => {
    if (accepted && accepted.key !== machineKey) setAccepted(undefined);
  }, [accepted, machineKey]);

  const control = rowControl(groups, group, repo);
  const groupRepository = isGroupRepository(group, repo);
  const close = (focus: "control" | "members" | "folder" = "control") => {
    setOpened(undefined);
    const ref = focus === "members" ? membersRef : focus === "folder" ? folderRef : controlRef;
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

  /** Join a repository the host lists into a folder (space-63). */
  const join = async (folder: string): Promise<void> => {
    if (!repo.id) return;
    const key = machineKey;
    setBusy("join");
    setError(undefined);
    try {
      await spaceJoin(repo.id, folder);
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
  const refusal = control === "sync" || control === "unrelated" ? rowSyncRefusal(groups, repo) : undefined;
  // The first push into a repository others share says once what goes
  // there (space-57); one whose only member is the account says nothing.
  const needsNotice = !repo.noticed && (repo.members ?? 0) > 1;
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

  // A clone whose code found no folder here is paired later (space-63).
  const needsFolder =
    !groupRepository && repo.folder === null && repo.state !== "absent" && repo.state !== "local-only";
  const showMembers = repo.state === "reachable" && groups.account !== null;

  const code = repo.code
    ? displayRemote(repo.code)
    : repo.state === "absent"
      ? i18n._("Not on this device")
      : groupRepository
        ? i18n._({ id: "Group records", comment: "where a group's own spex repository's code lives: it has none, holding the group's records" })
        : i18n._({ id: "Code not on a remote", comment: "a project's spex repository whose records name no code remote" });
  // Signed out, your own group's records wait for the sign-in that
  // shares them (space-3).
  const state =
    repo.own && repo.state === "local-only" && !groups.account
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
      {opened === "members" ? (
        <MembersPanel
          groups={groups}
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
            question={
              repo.visibility === "public"
                ? i18n._(
                    "Every session goes there whole — hidden parts and attachments included — and nothing recalls what others downloaded. This repository is public, so its records are public.",
                  )
                : i18n._(
                    "Every session goes there whole — hidden parts and attachments included — and nothing recalls what others downloaded.",
                  )
            }
            confirmLabel={i18n._({ id: "Continue", comment: "confirm: go on with the first sync" })}
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

/** Where a local-only project's records go on the host (space-58): in
 * one picker, the spex repositories the host lists for the same code —
 * each with its group and members' count — and, below them, every
 * group, the new repository's name in an editable field. */
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
  // The listed ones are the host's: a host id, a state the host read.
  const listed = groups.groups.flatMap((group) =>
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
  );
  // The host's own groups; GroupsState names no right to create, so
  // every group is offered and a refusal waits on the row (space-64).
  // Those inside the group the host names as its own come first, under
  // the phrase its heading reads (space-58, DR-120).
  const creatable = groups.groups.filter((group) => group.id !== null || group.own);
  const named = hostGroupOf(groups);
  const inside = creatable.filter((group) => inHostGroup(groups, group));
  const others = creatable.filter((group) => !inHostGroup(groups, group));
  const defaultName = repo.folder ? lastSegment(repo.folder) : repo.name.replace(/-spex$/, "");
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState<string>();
  const [refusal, setRefusal] = useState<string>();
  const nameRef = useRef<HTMLInputElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  const pick = async (
    id: string,
    choice: { kind: "join"; hostId: string } | { kind: "create"; groupId: string | null; name: string },
  ) => {
    setBusy(id);
    setRefusal(undefined);
    try {
      await spacePick(repo.key, choice);
      onClose();
    } catch (cause) {
      const message = (cause as Error).message;
      setRefusal(message);
      onNote(message);
      // A name the host refuses asks for another in place (space-58).
      if (choice.kind === "create") nameRef.current?.focus();
    } finally {
      setBusy(undefined);
    }
  };

  const create = (group: GroupsState["groups"][number]) => {
    const chosen = name.trim();
    if (!chosen) {
      setRefusal(i18n._("Name the new spex repository."));
      nameRef.current?.focus();
      return;
    }
    void pick(`group:${group.fullPath}`, { kind: "create", groupId: group.id, name: chosen });
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
  const groupOption = (group: GroupsState["groups"][number]) => (
    <li key={group.fullPath} className="min-w-0">
      <button
        ref={takeFirst()}
        type="button"
        data-testid={`space-pick-group-${group.fullPath}`}
        className={option}
        disabled={disabled}
        onClick={() => create(group)}
      >
        <span className="min-w-0 flex-1 truncate" title={group.fullPath}>
          {group.fullPath}
        </span>
      </button>
    </li>
  );

  return (
    <div
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
      {listed.length > 0 ? (
        <section aria-labelledby={`space-pick-listed-${repo.key}`} className="flex min-w-0 flex-col gap-1">
          <h3 id={`space-pick-listed-${repo.key}`} className="text-xs font-medium text-neutral-500">
            {i18n._("On the host for this code")}
          </h3>
          <ul className="flex min-w-0 flex-col gap-1">
            {listed.map(({ group, repo: other }) => (
              <li key={other.key} className="min-w-0">
                <button
                  ref={takeFirst()}
                  type="button"
                  data-testid={`space-pick-repo-${other.key}`}
                  className={option}
                  disabled={disabled}
                  onClick={() => void pick(other.key, { kind: "join", hostId: other.id! })}
                >
                  <span className="min-w-0 flex-1 truncate font-medium" title={other.name}>
                    {other.name}
                  </span>
                  <span className="min-w-0 max-w-[40%] truncate text-xs text-neutral-500" title={group.fullPath}>
                    {group.fullPath}
                  </span>
                  {other.members !== null ? (
                    <span className="shrink-0 text-xs text-neutral-500">
                      {i18n._("{count, plural, one {# member} other {# members}}", { count: other.members })}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section aria-labelledby={`space-pick-create-${repo.key}`} className="flex min-w-0 flex-col gap-1">
        <h3 id={`space-pick-create-${repo.key}`} className="text-xs font-medium text-neutral-500">
          {i18n._("New in a group")}
        </h3>
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
        {named && inside.length > 0 ? (
          <div
            role="group"
            aria-label={`${named.name} · ${hostGroupPhrase()}`}
            data-testid={`space-pick-host-group-${repo.key}`}
            className="flex min-w-0 flex-col gap-1"
          >
            <h4 className="flex min-w-0 items-baseline gap-1 text-xs">
              <span className="min-w-0 truncate font-medium" title={named.fullPath}>
                {named.name}
              </span>{" "}
              <span className="min-w-0 truncate text-neutral-500">
                <span aria-hidden>· </span>
                {hostGroupPhrase()}
              </span>
            </h4>
            <ul className="flex min-w-0 flex-col gap-1">{inside.map((group) => groupOption(group))}</ul>
          </div>
        ) : null}
        <ul className="flex min-w-0 flex-col gap-1">{others.map((group) => groupOption(group))}</ul>
      </section>
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
