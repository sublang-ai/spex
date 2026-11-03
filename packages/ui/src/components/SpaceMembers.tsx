// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Groups and members on the Space surface (DR-114, DR-127, DR-172): a
// group created on a Space's heading (space-68), and a group's or a
// project's members panel (space-62) with Invite members (space-69) and Remove
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
import { PanelCloseButton } from "./PanelCloseButton.js";
import { ATTACHED_PANEL } from "./SpacePanel.js";
import { PRIMARY, SECONDARY, type Note } from "./SpaceSurface.js";

const FIELD =
  "min-w-0 flex-1 rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";
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
  canCreate = true,
  scope,
  onClose,
  onNote,
  focusRequest,
  onPendingChange,
}: {
  testId: string;
  /** The Space, by its origin, the group is made at (space-68). */
  instance: string;
  /** The parent group's id at the Space; null creates at its root. */
  parent: string | null;
  connected: boolean;
  canCreate?: boolean;
  /** The named destination, whether at a Space's root or inside a group. */
  scope: { space: string; parent?: { name: string; fullPath: string } };
  /** Close the editor; the caller returns focus to its control. */
  onClose(): void;
  onNote: Note;
  focusRequest?: number;
  onPendingChange?(pending: boolean): void;
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
  const titleId = useId();
  const inFlight = useRef(false);
  useEffect(() => {
    fieldRef.current?.focus();
  }, [focusRequest]);

  const chosen = name.trim();
  const chosenPath = path.trim();
  const Heading = scope.parent ? "h4" : "h3";
  const submit = async () => {
    if (!connected || !canCreate || !chosen || !chosenPath || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    onPendingChange?.(true);
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
      onPendingChange?.(false);
    }
  };

  return (
    <div
      data-testid={testId}
      role="group"
      aria-labelledby={titleId}
      aria-busy={busy}
      className={`flex max-w-xl min-w-0 flex-col gap-3 ${ATTACHED_PANEL}`}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        if (!busy) onClose();
      }}
    >
      <Heading id={titleId} className="break-words text-sm font-medium">{scope.parent
        ? i18n._("New group in {group}", { group: scope.parent.name })
        : i18n._("New group at {space}", { space: scope.space })}</Heading>
      {scope.parent ? <div className="flex min-w-0 flex-col gap-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
        <p className="break-words">{scope.parent.fullPath} <span aria-hidden>·</span> {scope.space}</p>
        <p>{i18n._("Members of {group} will also have access to this group.", { group: scope.parent.name })}</p>
      </div> : null}
      <label className="grid min-w-0 gap-1 text-xs @xs:grid-cols-[6rem_minmax(0,1fr)] @xs:items-center @xs:gap-2">
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
          className={`${FIELD} min-h-7`}
        />
      </label>
      <label className="grid min-w-0 gap-1 text-xs @xs:grid-cols-[6rem_minmax(0,1fr)] @xs:items-center @xs:gap-2">
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
          className={`${FIELD} min-h-7`}
        />
      </label>
      {refusal ? <p role="alert" className={REFUSAL}>{refusal}</p> : null}
      {!canCreate ? <p className="text-xs text-neutral-600 dark:text-neutral-400">{i18n._("You can no longer create a group here.")}</p> : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" data-testid={`${testId}-cancel`} className={SECONDARY} disabled={busy} onClick={onClose}>
          {i18n._({ id: "Cancel", comment: "leave the editor without changing anything" })}
        </button>
        <button
          type="button"
          data-testid={`${testId}-create`}
          className={PRIMARY}
          disabled={!connected || !canCreate || busy || !chosen || !chosenPath}
          onClick={() => void submit()}
        >
          {busy
            ? i18n._({ id: "Creating…", comment: "the Create control, while the Space creates the group" })
            : i18n._({ id: "Create", comment: "create the group named in the field at the Space" })}
        </button>
      </div>
    </div>
  );
}

/** A group's or a project's members as its Space lists them
 * (space-62): read when the panel opens and on each Refresh, and as each
 * share and removal answers, held nowhere else. Each member reads its
 * login, the Space's own role name and, where the membership comes
 * through a group, "via <group>"; where the Space's last read says the
 * person may manage the members, Invite members stands in the panel and Remove on
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
  embedded = false,
  focusRequest,
  onPendingChange,
}: {
  /** The Space that lists the group or governs the records: its roles
   * and its display name (space-69). */
  instance: InstanceState;
  target: SpaceMembersTarget;
  /** What the panel's test ids carry: a placement's
   * `<key>@<instance origin>`, or `group:<full path>`. */
  id: string;
  /** The group's or project's display name. */
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
  embedded?: boolean;
  focusRequest?: number;
  onPendingChange?(pending: boolean): void;
}) {
  const store = usePlaceStore();
  const spaceMembers = store((state) => state.spaceMembers);
  const [result, setResult] = useState<SpaceMembersReply>();
  const [error, setError] = useState<string>();
  const [outcome, setOutcome] = useState<string>();
  const [sharing, setSharing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [inviteFocus, setInviteFocus] = useState(0);
  const panelRef = useRef<HTMLElement>(null);
  const shareRef = useRef<HTMLButtonElement>(null);
  const editorId = useId();
  // A read a share or a removal overtook is discarded: the reply after
  // the act is the newer list.
  const reads = useRef(0);
  const targetKey =
    "group" in target ? `group:${target.instance} ${target.group}` : `repository:${target.repository}@${target.instance ?? ""}`;

  useEffect(() => { panelRef.current?.focus(); }, [focusRequest]);
  useEffect(() => { onPendingChange?.(adding || removing); }, [adding, removing, onPendingChange]);
  useEffect(() => () => { onPendingChange?.(false); }, [onPendingChange]);

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
      ref={panelRef}
      tabIndex={-1}
      data-testid={`space-members-${id}`}
      aria-label={i18n._("Members of {name}", { name })}
      className={`@container flex min-w-0 flex-col gap-3 text-sm ${embedded ? ATTACHED_PANEL : "max-w-xl p-3"}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          if (!adding && !removing) onClose();
        }
      }}
    >
      <header className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1 basis-36">
            <h4 className="break-words font-medium">{i18n._("Members of {name}", { name })}</h4>
            {result ? (
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                {i18n._("{count, plural, one {# member} other {# members}}", { count: result.members.length })}
              </p>
            ) : null}
          </div>
          {canManage ? (
            <button
              ref={shareRef}
              type="button"
              data-testid={`space-share-${id}`}
              aria-expanded={sharing}
              aria-controls={sharing ? editorId : undefined}
              className={`${SECONDARY} shrink-0`}
              disabled={!connected || adding || removing}
              onClick={() => {
                if (sharing) {
                  setInviteFocus((value) => value + 1);
                  return;
                }
                setOutcome(undefined);
                setSharing(true);
              }}
            >
              {i18n._({ id: "Invite members…", comment: "open the form to add people to this group or project's records" })}
            </button>
          ) : null}
        </div>
        <PanelCloseButton data-testid={`space-members-close-${id}`} disabled={adding || removing} onClick={onClose} />
      </header>
      <div className="flex min-w-0 max-w-xl flex-col gap-3">
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
        {sharing && canManage ? (
          <InviteEditor
            instance={instance}
            target={target}
            id={id}
            name={name}
            editorId={editorId}
            focusRequest={inviteFocus}
            connected={connected && !removing}
            onBusy={setAdding}
            onMembers={(reply) => {
              reads.current += 1;
              setResult(reply);
              setError(undefined);
            }}
            onFinished={(line, complete) => {
              setOutcome(line);
              onNote(line);
              if (complete) {
                setSharing(false);
                focusLater(shareRef);
              }
            }}
            onClose={() => {
              setSharing(false);
              focusLater(shareRef);
            }}
          />
        ) : null}
        {error ? (
          <p role="alert" className={REFUSAL}>
            {error}
          </p>
        ) : !result ? (
          <p className="text-xs text-neutral-500">{i18n._("Reading members…")}</p>
        ) : (
          <>
            {outcome ? (
              <p data-testid={`space-members-outcome-${id}`} className="text-xs text-neutral-600 dark:text-neutral-400">
                {outcome}
              </p>
            ) : null}
            <ul className="flex min-w-0 flex-col divide-y divide-neutral-200 dark:divide-neutral-800">
              {result.members.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  isYou={member.login === instance.account.login}
                  target={target}
                  place={name}
                  removable={canManage && member.direct}
                  connected={connected && !adding && !removing}
                  onBusy={setRemoving}
                  onRemoved={(reply) => {
                    answered(reply, i18n._("@{login} removed", { login: member.login }));
                    // The row is gone; focus stays in the panel.
                    setTimeout(() => (shareRef.current ?? panelRef.current)?.focus(), 0);
                  }}
                  onNote={onNote}
                />
              ))}
            </ul>
          </>
        )}
      </div>
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
  isYou,
  target,
  place,
  removable,
  connected,
  onBusy,
  onRemoved,
  onNote,
}: {
  member: HostMemberInfo;
  isYou: boolean;
  target: SpaceMembersTarget;
  /** The group's or project's display name, as the confirm
   * names what the member leaves. */
  place: string;
  removable: boolean;
  connected: boolean;
  onBusy(busy: boolean): void;
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
  const inFlight = useRef(false);

  const remove = async () => {
    if (!connected || !removable || inFlight.current) return;
    inFlight.current = true;
    setConfirming(false);
    setBusy(true);
    onBusy(true);
    setRefusal(undefined);
    try {
      onRemoved(await spaceUnshare(target, member.login));
    } catch (cause) {
      const message = (cause as Error).message;
      setRefusal(message);
      onNote(message);
      focusLater(removeRef);
    } finally {
      inFlight.current = false;
      setBusy(false);
      onBusy(false);
    }
  };

  const inherited = !member.direct && member.via !== null;
  return (
    <li data-testid={`space-member-${member.login}`} className="flex min-w-0 flex-col gap-1 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate font-medium" title={member.login}>
          {member.login}
        </span>
        {isYou ? <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">{i18n._("You")}</span> : null}
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
            disabled={!connected || busy || !removable}
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

/** Familiar role summaries explain the choice without supplying the role
 * list or authorizing anything. Unknown or inconsistent roles use only
 * the capability the Space actually reports (DR-190). */
function roleDescription(role: InstanceState["roles"][number], group: boolean): string {
  if (!role.mayPush) {
    if (role.name === "Guest") return i18n._("Limited access; cannot read or sync private shared records.");
    if (role.name === "Reporter") return i18n._("View and download shared records; cannot send changes.");
    return i18n._("Cannot sync changes to shared records.");
  }
  switch (role.name) {
    case "Developer": return i18n._("View, download, and contribute shared records.");
    case "Maintainer": return i18n._("Contribute shared records and manage projects and their members.");
    case "Owner": return group
      ? i18n._("Full control of this group, including its members and deletion.")
      : i18n._("Full control of this project, including its members and deletion.");
    default: return i18n._("Can sync changes to shared records.");
  }
}

/** Username entries stay separate from account lookup: normalization only
 * removes presentation and separators, never invents an identity. */
function usernames(text: string): string[] {
  return text.split(/[,\r\n]+/).map((value) => value.trim().replace(/^@/, "").trim()).filter(Boolean);
}

/** Several existing Space accounts, one role, independent outcomes
 * (space-69, DR-191). Successful additions are never retried here. */
function InviteEditor({
  instance,
  target,
  id,
  name,
  editorId,
  focusRequest,
  connected,
  onBusy,
  onMembers,
  onFinished,
  onClose,
}: {
  instance: InstanceState;
  target: SpaceMembersTarget;
  id: string;
  name: string;
  editorId: string;
  focusRequest?: number;
  connected: boolean;
  onBusy(busy: boolean): void;
  onMembers(reply: SpaceMembersReply): void;
  onFinished(line: string, complete: boolean): void;
  onClose(): void;
}) {
  const store = usePlaceStore();
  const spaceShare = store((state) => state.spaceShare);
  const roles = instance.roles;
  const [draft, setDraft] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [role, setRole] = useState(() => (roles.find((entry) => entry.mayPush) ?? roles[0])?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState<{ login: string; message: string }[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number }>();
  const fieldRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const fieldId = useId();
  const roleId = useId();
  const selectedRole = roles.find((entry) => entry.id === role);
  useEffect(() => {
    mounted.current = true;
    fieldRef.current?.focus();
    return () => {
      mounted.current = false;
      onBusy(false);
    };
  }, [onBusy]);
  useEffect(() => { fieldRef.current?.focus(); }, [focusRequest]);

  const chosen = [...new Set([...recipients, ...usernames(draft)])];
  const commit = (text: string) => {
    if (inFlight.current) return;
    setRecipients((previous) => [...new Set([...previous, ...usernames(text)])]);
    setDraft("");
  };
  const remove = (login: string) => {
    if (inFlight.current) return;
    setRecipients((previous) => previous.filter((entry) => entry !== login));
    setFailures((previous) => previous.filter((entry) => entry.login !== login));
    fieldRef.current?.focus();
  };
  const submit = async () => {
    if (!connected || chosen.length === 0 || !selectedRole || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    onBusy(true);
    setRecipients(chosen);
    setDraft("");
    setFailures([]);
    const failed: { login: string; message: string }[] = [];
    let added = 0;
    try {
      for (let index = 0; index < chosen.length; index += 1) {
        if (!mounted.current) return;
        if (store.getState().connection !== "open") {
          const message = i18n._("Connection lost. Reconnect to add the remaining members.");
          failed.push(...chosen.slice(index).map((login) => ({ login, message })));
          break;
        }
        const login = chosen[index]!;
        setProgress({ current: index + 1, total: chosen.length });
        try {
          const reply = await spaceShare(target, login, role);
          added += 1;
          if (!mounted.current) return;
          onMembers(reply);
          setRecipients((previous) => previous.filter((entry) => entry !== login));
        } catch (cause) {
          failed.push({ login, message: (cause as Error).message });
        }
      }
      if (!mounted.current) return;
      setFailures(failed);
      setRecipients(failed.map((entry) => entry.login));
      const line = failed.length > 0
        ? added > 0
          ? i18n._("{added, plural, one {# member added} other {# members added}}; {remaining} still to add.", { added, remaining: failed.length })
          : chosen.length === 1 ? failed[0]!.message : i18n._("No members added. Review the usernames below.")
        : chosen.length === 1
          ? i18n._("@{login} added as {role}", { login: chosen[0], role: selectedRole.name })
          : i18n._("{count, plural, one {# member added} other {# members added}} as {role}", { count: added, role: selectedRole.name });
      onFinished(line, failed.length === 0);
      if (failed.length > 0) fieldRef.current?.focus();
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setBusy(false);
        setProgress(undefined);
        onBusy(false);
      }
    }
  };

  return (
    <form
      id={editorId}
      data-testid={`space-share-${id}-editor`}
      aria-labelledby={`${editorId}-title`}
      aria-busy={busy}
      className="flex w-full min-w-0 max-w-xl flex-col gap-3 border-l-2 border-neutral-200 pl-3 dark:border-neutral-700"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        if (!busy) onClose();
      }}
    >
      <div className="min-w-0">
        <h5 id={`${editorId}-title`} className="break-words text-sm font-medium">
          {i18n._("Invite to {name}", { name })}
        </h5>
        <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
          {"group" in target
            ? i18n._("Membership applies to this group and the projects and groups inside it.")
            : i18n._("Membership applies to this project's records at {space}.", { space: instanceName(instance) })}
        </p>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={fieldId} className="text-xs font-medium">{i18n._("Usernames")}</label>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 rounded border border-neutral-300 bg-white p-2 focus-within:ring-2 focus-within:ring-brand-500 dark:border-neutral-700 dark:bg-neutral-900">
          {recipients.map((login) => (
            <span key={login} data-testid="space-invite-recipient" className={`inline-flex min-w-0 max-w-full items-center gap-1 rounded border px-2 py-0.5 text-sm ${failures.some((entry) => entry.login === login) ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950" : "border-neutral-200 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800"}`}>
              <span className="min-w-0 truncate" title={login}>{login}</span>
              <button
                type="button"
                aria-label={i18n._("Remove @{login} from invitation", { login })}
                className="flex size-6 shrink-0 items-center justify-center rounded text-neutral-500 hover:bg-neutral-200 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-neutral-700"
                disabled={busy}
                onClick={() => remove(login)}
              >
                <svg aria-hidden viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="m4 4 8 8M12 4l-8 8" /></svg>
              </button>
            </span>
          ))}
          <input
            id={fieldId}
            ref={fieldRef}
            data-testid={`space-share-${id}-login`}
            aria-describedby={`${fieldId}-hint${failures.length > 0 ? ` ${editorId}-error` : ""}`}
            placeholder={recipients.length ? i18n._("Add another username") : i18n._("e.g. alex, sam")}
            value={draft}
            onChange={(event) => {
              const value = event.target.value;
              if (/[,\r\n]/.test(value)) {
                const parts = value.split(/[,\r\n]+/);
                const tail = parts.pop() ?? "";
                commit(parts.join(","));
                setDraft(tail);
              } else setDraft(value);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
              event.preventDefault();
              if (!busy) commit(draft);
            }}
            onPaste={(event) => {
              const text = event.clipboardData.getData("text");
              if (!/[,\r\n]/.test(text) || busy) return;
              event.preventDefault();
              const input = event.currentTarget;
              commit(draft.slice(0, input.selectionStart ?? draft.length) + text + draft.slice(input.selectionEnd ?? draft.length));
            }}
            readOnly={busy}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            className="min-w-0 flex-1 basis-36 bg-transparent px-1 py-1 text-sm outline-none"
          />
        </div>
        <p id={`${fieldId}-hint`} className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
          {i18n._("Use Enter or commas between usernames.")}{" "}
          {i18n._("They need an account at {space}.", { space: instanceName(instance) })}
        </p>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={roleId} className="text-xs font-medium">{i18n._({ id: "Role", comment: "the access granted to every selected member" })}</label>
        <select
          id={roleId}
          data-testid={`space-share-${id}-role`}
          aria-describedby={`${roleId}-hint`}
          value={role}
          onChange={(event) => setRole(event.target.value)}
          disabled={busy || roles.length === 0}
          className={`${FIELD} w-full px-2 py-1`}
        >
          {!selectedRole ? <option value="">{i18n._("Choose a role")}</option> : null}
          {roles.map((entry) => (
            <option key={entry.id} value={entry.id}>{entry.name}</option>
          ))}
        </select>
        <div id={`${roleId}-hint`} className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
          <p>{selectedRole ? roleDescription(selectedRole, "group" in target) : roles.length > 0 ? i18n._("Choose a role") : i18n._("No role available. Refresh to check your access.")}</p>
          {chosen.length > 1 ? <p>{i18n._("This role applies to everyone you add.")}</p> : null}
        </div>
      </div>
      {failures.length > 0 ? (
        <div id={`${editorId}-error`} role="alert" className={`${REFUSAL} break-words`}>
          {failures.length === 1 ? failures[0]!.message : (
            <ul className="flex flex-col gap-1">
              {failures.map(({ login, message }) => <li key={login}>{i18n._("@{login}: {message}", { login, message })}</li>)}
            </ul>
          )}
        </div>
      ) : null}
      <div className="flex min-w-0 flex-col gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-700">
        <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">{i18n._("Access starts immediately when you add them.")}</p>
        {progress ? <p role="status" className="text-xs text-neutral-600 dark:text-neutral-400">{i18n._("Adding {current} of {total}…", progress)}</p> : null}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" data-testid={`space-share-${id}-cancel`} className={SECONDARY} disabled={busy} onClick={onClose}>
            {i18n._({ id: "Cancel", comment: "leave the editor without changing anything" })}
          </button>
          <button
            type="submit"
            data-testid={`space-share-${id}-add`}
            className={PRIMARY}
            disabled={!connected || busy || chosen.length === 0 || !selectedRole}
          >
            {busy ? i18n._({ id: "Adding…", comment: "the members are being added at the Space" }) : chosen.length > 1
              ? i18n._("Add members") : i18n._({ id: "Add member", comment: "immediately give this account the selected access" })}
          </button>
        </div>
      </div>
    </form>
  );
}
