// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Groups and sharing on the Groups surface (DR-114, DR-127): a group
// created on an instance's heading or a subgroup on a group's heading
// (space-68), or renamed there (space-76, DR-120), and a group's or a
// spex repository placement's members panel (space-62) with Share
// (space-69) and Remove (space-72), each at the instance that lists it
// or governs the placement (DR-128); a placement's panel names the other
// instances its records are kept at.
// An act stands exactly where the
// host's last read says the person may take it; the host is asked
// whatever the view said, and its refusal stands in place with its
// words. Nothing is retried, derived or cached: the members are read on
// opening, on Refresh, and come back with each share and removal.

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { HostMemberInfo, InstanceState } from "@sublang/spex-core/protocol";

import { useAppStore, type SpaceMembersReply, type SpaceMembersTarget } from "../state/store.js";
import { i18n } from "../i18n.js";
import { nameList } from "../lib/placements.js";
import { InlineConfirm } from "./InlineConfirm.js";
import { SECONDARY, type Note } from "./SpaceSurface.js";

const EDITOR = "flex min-w-0 flex-col gap-1 rounded border border-neutral-300 p-2 dark:border-neutral-700";
const FIELD =
  "min-w-0 flex-1 rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-xs dark:border-neutral-700 dark:bg-neutral-900";
const REFUSAL = "min-w-0 text-xs text-red-600 dark:text-red-400";

/** Focus a control once the editor or confirm that stood in its place
 * is gone: closing never strands focus (DR-010 §6). */
function focusLater(ref: { current: HTMLElement | null }): void {
  setTimeout(() => ref.current?.focus(), 0);
}

/** A group's path as the host derives it from its name (space-68):
 * lower-cased, each run outside letters, digits, `.`, `_` and `-` one
 * `-`, leading and trailing `-` and `.` dropped — empty for a name in
 * Chinese, say. */
function derivedGroupPath(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
}

/** A group's name and path, asked in place (space-68): "Group name",
 * "Path" following the name as the host derives it until the reader
 * edits it, Create and Cancel, Escape cancelling. Create stays disabled
 * while either is empty, reads "Creating…" while the host is asked and
 * takes no second submission; a refusal stands in the editor with the
 * name kept. The group already stands in the list when the reply closes
 * the editor: the core holds it as listed and announces it first.
 * Renaming (space-76), the fields hold the group's name and its own
 * path segment, the path no longer follows the name, and Save sends
 * only what differs, disabled while nothing does. */
export function GroupNameEditor({
  testId,
  instance,
  parent,
  rename,
  connected,
  onClose,
  onNote,
}: {
  testId: string;
  /** The instance, by its origin, the group is made or renamed at
   * (space-68, space-76). */
  instance: string;
  /** The parent group's host id; null creates at the instance's root. */
  parent: string | null;
  /** The group renamed: its host id, its name and its own path segment. */
  rename?: { group: string; name: string; path: string };
  connected: boolean;
  /** Close the editor; the caller returns focus to its control. */
  onClose(): void;
  onNote: Note;
}) {
  const spaceGroupCreate = useAppStore((state) => state.spaceGroupCreate);
  const spaceGroupRename = useAppStore((state) => state.spaceGroupRename);
  const [name, setName] = useState(rename?.name ?? "");
  const [path, setPath] = useState(rename?.path ?? "");
  // The path follows the name until the reader edits it; a group's own
  // path never follows a new name.
  const [pathEdited, setPathEdited] = useState(rename !== undefined);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string>();
  const fieldRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    fieldRef.current?.focus();
  }, []);

  const chosen = name.trim();
  const chosenPath = path.trim();
  // What a rename changes: the name, the path, or both.
  const change = rename
    ? {
        ...(chosen !== rename.name ? { name: chosen } : {}),
        ...(chosenPath !== rename.path ? { path: chosenPath } : {}),
      }
    : {};
  const unchanged = rename !== undefined && Object.keys(change).length === 0;
  const submit = async () => {
    if (!chosen || !chosenPath || unchanged || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setRefusal(undefined);
    try {
      if (rename) await spaceGroupRename(instance, rename.group, change);
      else await spaceGroupCreate(instance, chosen, chosenPath, parent);
      onClose();
    } catch (cause) {
      const message = (cause as Error).message;
      setRefusal(message);
      onNote(message);
      fieldRef.current?.focus();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div
      data-testid={testId}
      className={EDITOR}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        if (!busy) onClose();
      }}
    >
      <label className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
        <span className="shrink-0 text-neutral-500">
          {i18n._({ id: "Group name", comment: "the field naming a new group on the Git host" })}
        </span>
        <input
          ref={fieldRef}
          data-testid={`${testId}-name`}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (!pathEdited) setPath(derivedGroupPath(event.target.value));
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
          // The field stays focusable while the host is asked, so a
          // refusal can bring the reader back to it.
          readOnly={busy}
          spellCheck={false}
          autoComplete="off"
          className={FIELD}
        />
      </label>
      <label className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
        <span className="shrink-0 text-neutral-500">
          {i18n._({ id: "Path", comment: "the field holding a new group's path on the Git host, the last segment of its address" })}
        </span>
        <input
          data-testid={`${testId}-path`}
          value={path}
          onChange={(event) => {
            setPath(event.target.value);
            setPathEdited(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
          readOnly={busy}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          className={FIELD}
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid={`${testId}-${rename ? "save" : "create"}`}
          className={SECONDARY}
          disabled={!connected || busy || !chosen || !chosenPath || unchanged}
          onClick={() => void submit()}
        >
          {rename
            ? busy
              ? i18n._({ id: "Saving…", comment: "the Save control, while the host renames the group" })
              : i18n._({ id: "Save", comment: "rename the group as the fields say on the Git host" })
            : busy
              ? i18n._({ id: "Creating…", comment: "the Create control, while the host creates the group" })
              : i18n._({ id: "Create", comment: "create the group named in the field on the Git host" })}
        </button>
        <button type="button" data-testid={`${testId}-cancel`} className={SECONDARY} disabled={busy} onClick={onClose}>
          {i18n._({ id: "Cancel", comment: "leave the editor without changing anything" })}
        </button>
        {refusal ? (
          <span role="alert" className={REFUSAL}>
            {refusal}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** A group's or a spex repository placement's members as its instance
 * lists them (space-62): read when the panel opens and on each Refresh,
 * and as each share and removal answers, held nowhere else. Each member
 * reads its name, the host's own role name and, where the membership
 * comes through a group, "via <group>"; where the host's last read says
 * the person may manage the members, Share stands in the panel and
 * Remove on each member held directly. A placement's panel says which
 * other instances the records are also placed at, linking none. */
export function MembersPanel({
  instance,
  target,
  id,
  name,
  canManage,
  alsoPlacedAt = [],
  connected,
  refreshes,
  onClose,
  onNote,
}: {
  /** The instance that lists the group or governs the placement: its
   * roles and its host name (space-69). */
  instance: InstanceState;
  target: SpaceMembersTarget;
  /** What the panel's test ids carry: a placement's
   * `<key>@<instance origin>`, or `group:<full path>`. */
  id: string;
  /** The group's full path or the repository's name. */
  name: string;
  /** What the host's last read says: the person may manage these
   * members. */
  canManage: boolean;
  /** The display names of the other instances the clone's placement
   * files name (space-62); none for a group or a lone placement. */
  alsoPlacedAt?: string[];
  connected: boolean;
  refreshes: number;
  onClose(): void;
  onNote: Note;
}) {
  const spaceMembers = useAppStore((state) => state.spaceMembers);
  const [result, setResult] = useState<SpaceMembersReply>();
  const [error, setError] = useState<string>();
  const [outcome, setOutcome] = useState<string>();
  const [sharing, setSharing] = useState(false);
  const shareRef = useRef<HTMLButtonElement>(null);
  // A read a share or a removal overtook is discarded: the reply after
  // the act is the newer list.
  const reads = useRef(0);
  const targetKey =
    "group" in target ? `group:${target.instance} ${target.group}` : `repository:${target.repository}@${target.instance ?? ""}`;

  useEffect(() => {
    const read = (reads.current += 1);
    setResult(undefined);
    setError(undefined);
    setOutcome(undefined);
    spaceMembers(target)
      .then((reply) => {
        if (read === reads.current) setResult(reply);
      })
      .catch((cause: Error) => {
        if (read === reads.current) setError(cause.message);
      });
    return () => {
      reads.current += 1;
    };
    // The target is read by its key: a new object for the same target
    // reads nothing again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey, refreshes, spaceMembers]);

  /** The members a share or a removal answers with, and its line. */
  const answered = (reply: SpaceMembersReply, line: string) => {
    reads.current += 1;
    setResult(reply);
    setError(undefined);
    setOutcome(line);
    onNote(line);
  };

  return (
    <section
      data-testid={`space-members-${id}`}
      aria-label={i18n._("Members of {name}", { name })}
      className="@container ml-6 flex min-w-0 flex-col gap-1 rounded border border-neutral-200 p-2 text-sm dark:border-neutral-800"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      {alsoPlacedAt.length > 0 ? (
        // Every placement's members see that the records are kept
        // elsewhere too (DR-128); the instances are named, never linked.
        <p data-testid="space-members-also" className="min-w-0 text-xs text-neutral-500">
          {i18n._({
            id: "These records are also placed at {names}",
            comment: "a placement's members panel; {names} lists the other instances the records are kept at, by display name",
            values: { names: nameList(alsoPlacedAt) },
          })}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className={REFUSAL}>
          {error}
        </p>
      ) : !result ? (
        <p className="text-xs text-neutral-500">{i18n._("Reading members…")}</p>
      ) : (
        <>
          <ul className="flex min-w-0 flex-col gap-0.5">
            {result.members.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                target={target}
                place={name}
                removable={canManage && member.direct}
                connected={connected}
                onRemoved={(reply) => {
                  answered(reply, i18n._("@{login} removed", { login: member.login }));
                  // The row is gone; focus stays in the panel.
                  focusLater(shareRef);
                }}
                onNote={onNote}
              />
            ))}
          </ul>
          {outcome ? (
            <p data-testid={`space-members-outcome-${id}`} className="text-xs text-neutral-500">
              {outcome}
            </p>
          ) : null}
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {canManage ? (
              <button
                ref={shareRef}
                type="button"
                data-testid={`space-share-${id}`}
                aria-expanded={sharing}
                className={`${SECONDARY} shrink-0 whitespace-nowrap`}
                disabled={!connected}
                onClick={() => setSharing((was) => !was)}
              >
                {i18n._({ id: "Share", comment: "add a person on the Git host to a group or a spex repository" })}
              </button>
            ) : null}
          </div>
          {sharing ? (
            <ShareEditor
              instance={instance}
              target={target}
              id={id}
              connected={connected}
              onShared={(reply, line) => {
                answered(reply, line);
                setSharing(false);
                focusLater(shareRef);
              }}
              onClose={() => {
                setSharing(false);
                focusLater(shareRef);
              }}
              onNote={onNote}
            />
          ) : null}
        </>
      )}
    </section>
  );
}

/** One member (space-62): name, login, "via <group>" where inherited,
 * the host's role name, and Remove on a member held directly where the
 * person may manage them (space-72) — asked with the inline confirm,
 * Keep focused, the row reading "Removing…" until the reply and a
 * refusal standing on it with the member kept. */
function MemberRow({
  member,
  target,
  place,
  removable,
  connected,
  onRemoved,
  onNote,
}: {
  member: HostMemberInfo;
  target: SpaceMembersTarget;
  /** The group's full path or the repository's name, as the confirm
   * names what the member leaves. */
  place: string;
  removable: boolean;
  connected: boolean;
  onRemoved(reply: SpaceMembersReply): void;
  onNote: Note;
}) {
  const spaceUnshare = useAppStore((state) => state.spaceUnshare);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string>();
  const removeRef = useRef<HTMLButtonElement>(null);
  const refusalId = useId();

  const remove = async () => {
    setConfirming(false);
    setBusy(true);
    setRefusal(undefined);
    try {
      onRemoved(await spaceUnshare(target, member.login));
    } catch (cause) {
      const message = (cause as Error).message;
      setRefusal(message);
      onNote(message);
      focusLater(removeRef);
    } finally {
      setBusy(false);
    }
  };

  const inherited = !member.direct && member.via !== null;
  return (
    <li data-testid={`space-member-${member.login}`} className="flex min-w-0 flex-col gap-0.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate font-medium" title={member.login}>
          {member.displayName ?? member.login}
        </span>
        {member.displayName ? (
          <span className="hidden min-w-0 truncate text-xs text-neutral-500 @md:inline">{member.login}</span>
        ) : null}
        {inherited ? (
          <span
            data-testid={`space-member-via-${member.login}`}
            className="min-w-0 truncate text-xs text-neutral-500"
            title={member.via ?? undefined}
          >
            {i18n._({
              id: "via {group}",
              comment: "a membership that comes through the named group, not the group's or repository's own",
              values: { group: member.via },
            })}
          </span>
        ) : null}
        <span className="ml-auto shrink-0 text-xs text-neutral-500">{member.role}</span>
        {removable && !confirming ? (
          <button
            ref={removeRef}
            type="button"
            data-testid={`space-member-remove-${member.login}`}
            aria-label={busy ? undefined : i18n._("Remove @{login}", { login: member.login })}
            aria-describedby={refusal ? refusalId : undefined}
            className={`${SECONDARY} shrink-0 whitespace-nowrap`}
            disabled={!connected || busy}
            onClick={() => setConfirming(true)}
          >
            {busy
              ? i18n._({ id: "Removing…", comment: "the removal is in flight" })
              : i18n._({ id: "Remove", comment: "take a member out of a group or a spex repository on the Git host" })}
          </button>
        ) : null}
      </div>
      {confirming ? (
        <div data-testid={`space-member-confirm-${member.login}`}>
          <InlineConfirm
            question={i18n._("Remove @{login} from {place}?", { login: member.login, place })}
            confirmLabel={i18n._({ id: "Remove", comment: "confirm: take the member out on the Git host" })}
            cancelLabel={i18n._({ id: "Keep", comment: "cancel a removal: leave it as it is" })}
            onConfirm={() => void remove()}
            onCancel={() => {
              setConfirming(false);
              focusLater(removeRef);
            }}
          />
        </div>
      ) : null}
      {refusal ? (
        <p id={refusalId} role="alert" className={REFUSAL}>
          {refusal}
        </p>
      ) : null}
    </li>
  );
}

/** Share, asked in place (space-69): the login at the host, a listbox
 * of the host's own roles in its order — the least that may push
 * chosen — Add and Cancel, Escape cancelling. Add stays disabled while
 * the login is empty, reads "Adding…" while the host is asked and
 * takes no second submission; a refusal stands in the editor with the
 * login kept. */
function ShareEditor({
  instance,
  target,
  id,
  connected,
  onShared,
  onClose,
  onNote,
}: {
  instance: InstanceState;
  target: SpaceMembersTarget;
  id: string;
  connected: boolean;
  onShared(reply: SpaceMembersReply, line: string): void;
  onClose(): void;
  onNote: Note;
}) {
  const spaceShare = useAppStore((state) => state.spaceShare);
  const roles = instance.roles;
  const [login, setLogin] = useState("");
  const [role, setRole] = useState(() => (roles.find((entry) => entry.mayPush) ?? roles[0])?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string>();
  const fieldRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    fieldRef.current?.focus();
  }, []);

  // A login is the host's, typed as the reader knows it; a leading "@"
  // is how the surface writes one, not part of it.
  const chosen = login.trim().replace(/^@/, "");
  const submit = async () => {
    if (!chosen || !role || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setRefusal(undefined);
    try {
      const reply = await spaceShare(target, chosen, role);
      const roleName = roles.find((entry) => entry.id === role)?.name ?? role;
      onShared(reply, i18n._("@{login} added as {role}", { login: chosen, role: roleName }));
    } catch (cause) {
      const message = (cause as Error).message;
      setRefusal(message);
      onNote(message);
      fieldRef.current?.focus();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div
      data-testid={`space-share-${id}-editor`}
      className={EDITOR}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        if (!busy) onClose();
      }}
    >
      <label className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
        <span className="shrink-0 text-neutral-500">
          {i18n._({
            id: "Login at {host}",
            comment: "the field for a person's login on the Git host, named by its host name",
            values: { host: instance.host },
          })}
        </span>
        <input
          ref={fieldRef}
          data-testid={`space-share-${id}-login`}
          value={login}
          onChange={(event) => setLogin(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
          readOnly={busy}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          className={FIELD}
        />
      </label>
      <select
        data-testid={`space-share-${id}-role`}
        aria-label={i18n._({ id: "Role", comment: "the host's role a person is added at" })}
        // A listbox: every role the host grants stands in view.
        size={Math.max(roles.length, 2)}
        value={role}
        onChange={(event) => setRole(event.target.value)}
        disabled={busy}
        className="max-w-full self-start rounded border border-neutral-300 bg-white px-1 py-0.5 text-xs dark:border-neutral-700 dark:bg-neutral-900"
      >
        {roles.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.name}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid={`space-share-${id}-add`}
          className={SECONDARY}
          disabled={!connected || busy || !chosen || !role}
          onClick={() => void submit()}
        >
          {busy
            ? i18n._({ id: "Adding…", comment: "the Add control, while the host adds the person" })
            : i18n._({ id: "Add", comment: "add the person at the chosen role on the Git host" })}
        </button>
        <button type="button" data-testid={`space-share-${id}-cancel`} className={SECONDARY} disabled={busy} onClick={onClose}>
          {i18n._({ id: "Cancel", comment: "leave the editor without changing anything" })}
        </button>
        {refusal ? (
          <span role="alert" className={REFUSAL}>
            {refusal}
          </span>
        ) : null}
      </div>
    </div>
  );
}
