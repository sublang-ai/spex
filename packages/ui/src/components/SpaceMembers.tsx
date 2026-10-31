// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Groups and members on the Space surface (DR-114, DR-127, DR-172): a
// group created on a Space's heading (space-68), and a group's or a
// project's members panel (space-62) with Share (space-69) and Remove
// (space-72), each at the Space that lists the group or governs the
// records (DR-128); a project's panel names the other Spaces its records
// are kept at. An act stands exactly where the Space's last read says
// the person may take it; the Space is asked whatever the view said, and
// its refusal stands in place with its words. Members are named by their
// logins, the Space's own role names beside them (DR-171). Nothing is
// retried, derived or cached: the members are read on opening, on
// Refresh, and come back with each share and removal.

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { HostMemberInfo, InstanceState } from "@sublang/spex-core/protocol";

import { type SpaceMembersReply, type SpaceMembersTarget } from "../state/store.js";
import { usePlaceStore } from "../state/place-context.js";
import { i18n } from "../i18n.js";
import { instanceName } from "../lib/instances.js";
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

/** A group's path as the Space derives it from its name (space-68):
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
 * "Path" following the name as the Space derives it until the reader
 * edits it, Create and Cancel, Escape cancelling. Create stays disabled
 * while either is empty, reads "Creating…" while the Space is asked and
 * takes no second submission; a refusal stands in the editor with the
 * name kept. The group already stands in the list when the reply closes
 * the editor: the core holds it as listed and announces it first. */
export function GroupNameEditor({
  testId,
  instance,
  parent,
  connected,
  onClose,
  onNote,
}: {
  testId: string;
  /** The Space, by its origin, the group is made at (space-68). */
  instance: string;
  /** The parent group's id at the Space; null creates at its root. */
  parent: string | null;
  connected: boolean;
  /** Close the editor; the caller returns focus to its control. */
  onClose(): void;
  onNote: Note;
}) {
  const store = usePlaceStore();
  const spaceGroupCreate = store((state) => state.spaceGroupCreate);
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  // The path follows the name until the reader edits it.
  const [pathEdited, setPathEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string>();
  const fieldRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    fieldRef.current?.focus();
  }, []);

  const chosen = name.trim();
  const chosenPath = path.trim();
  const submit = async () => {
    if (!chosen || !chosenPath || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setRefusal(undefined);
    try {
      await spaceGroupCreate(instance, chosen, chosenPath, parent);
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
          {i18n._({ id: "Group name", comment: "the field naming a new group at the Space" })}
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
          // The field stays focusable while the Space is asked, so a
          // refusal can bring the reader back to it.
          readOnly={busy}
          spellCheck={false}
          autoComplete="off"
          className={FIELD}
        />
      </label>
      <label className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
        <span className="shrink-0 text-neutral-500">
          {i18n._({ id: "Path", comment: "the field holding a new group's path at the Space, the last segment of its address" })}
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
          data-testid={`${testId}-create`}
          className={SECONDARY}
          disabled={!connected || busy || !chosen || !chosenPath}
          onClick={() => void submit()}
        >
          {busy
            ? i18n._({ id: "Creating…", comment: "the Create control, while the Space creates the group" })
            : i18n._({ id: "Create", comment: "create the group named in the field at the Space" })}
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

/** A group's or a project's members as its Space lists them
 * (space-62): read when the panel opens and on each Refresh, and as each
 * share and removal answers, held nowhere else. Each member reads its
 * login, the Space's own role name and, where the membership comes
 * through a group, "via <group>"; where the Space's last read says the
 * person may manage the members, Share stands in the panel and Remove on
 * each member held directly. A project's panel says which other Spaces
 * its records are also kept at, linking none. */
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
  /** The Space that lists the group or governs the records: its roles
   * and its display name (space-69). */
  instance: InstanceState;
  target: SpaceMembersTarget;
  /** What the panel's test ids carry: a placement's
   * `<key>@<instance origin>`, or `group:<full path>`. */
  id: string;
  /** The group's full path or the repository's name. */
  name: string;
  /** What the Space's last read says: the person may manage these
   * members. */
  canManage: boolean;
  /** The display names of the other Spaces the records are kept at
   * (space-62); none for a group or records kept at one. */
  alsoPlacedAt?: string[];
  connected: boolean;
  refreshes: number;
  onClose(): void;
  onNote: Note;
}) {
  const store = usePlaceStore();
  const spaceMembers = store((state) => state.spaceMembers);
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
        // Every Space's members see that the records are kept elsewhere
        // too (DR-128); the Spaces are named, never linked.
        <p data-testid="space-members-also" className="min-w-0 text-xs text-neutral-500">
          {i18n._({
            id: "These records are also placed at {names}",
            comment: "a project's members panel; {names} lists the other Spaces the records are kept at, by display name",
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
                {i18n._({ id: "Share", comment: "add a person at the Space to a group or a project's records" })}
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
 * the Space's role name, and Remove on a member held directly where the
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
  const store = usePlaceStore();
  const spaceUnshare = store((state) => state.spaceUnshare);
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
          {member.login}
        </span>
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
              : i18n._({ id: "Remove", comment: "take a member out of a group or a project's records at the Space" })}
          </button>
        ) : null}
      </div>
      {confirming ? (
        <div data-testid={`space-member-confirm-${member.login}`}>
          <InlineConfirm
            question={i18n._("Remove @{login} from {place}?", { login: member.login, place })}
            confirmLabel={i18n._({ id: "Remove", comment: "confirm: take the member out at the Space" })}
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

/** Share, asked in place (space-69): "Login at <Space>", a listbox of
 * the Space's own roles in its order — the least that may push chosen —
 * Add and Cancel, Escape cancelling. Add stays disabled while the login
 * is empty, reads "Adding…" while the Space is asked and takes no second
 * submission; a refusal stands in the editor with the login kept. */
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
  const store = usePlaceStore();
  const spaceShare = store((state) => state.spaceShare);
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

  // A login is the Space's, typed as the reader knows it; a leading "@"
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
            id: "Login at {space}",
            comment: "the field for a person's login at the Space, named by the Space's display name",
            values: { space: instanceName(instance) },
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
        aria-label={i18n._({ id: "Role", comment: "the Space's role a person is added at" })}
        // A listbox: every role the Space grants stands in view.
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
            ? i18n._({ id: "Adding…", comment: "the Add control, while the Space adds the person" })
            : i18n._({ id: "Add", comment: "add the person at the chosen role at the Space" })}
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
