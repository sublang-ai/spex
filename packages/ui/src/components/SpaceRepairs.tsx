// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Saved work is reviewed only when the reader wants to use it again.
// A folder choice is one task, with supporting evidence behind Details.
// Outcomes keep their rows and focus until Refresh.

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { DiagnosticRepair, GroupsState } from "@sublang/spex-core/protocol";

import { usePlaceStore } from "../state/place-context.js";
import { isLocalPlace } from "../state/store.js";
import { currentLocale, i18n } from "../i18n.js";
import { seatName, tildify } from "../lib/space.js";
import { InlineConfirm } from "./InlineConfirm.js";
import { Icon } from "./Icon.js";
import { PanelCloseButton } from "./PanelCloseButton.js";
import { ALERT_INK } from "./SpacePanel.js";
import { LINK, PRIMARY, SECONDARY, type Note } from "./SpaceSurface.js";

/** The pending merge's file, which a row reads in plain words. */
const MERGE_HEAD_FILE = ".git/MERGE_HEAD";

/** Technical evidence stays available without becoming the recovery task. */
function TechnicalDetails({ entries, children }: {
  entries?: { file: string; reason: string }[];
  children?: ReactNode;
}) {
  return (
    <details className="min-w-0 text-xs text-neutral-500">
      <summary className="cursor-pointer">{i18n._({ id: "Technical details", comment: "expand the evidence behind a saved-work problem" })}</summary>
      <div className="mt-2 flex min-w-0 flex-col gap-3">
        {children}
        {entries?.map((entry, index) => (
          <div key={`${entry.file}:${index}`} className="flex min-w-0 flex-col gap-1">
            <span className="break-all font-mono">{entry.file}</span>
            <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{entry.reason}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

/** One saved-work group: read its conversations or locate its files.
 * Names from the storage layout never stand in for a user's project. */
function RepairRow({ repair, disabled, canDismiss, focusSeq, onResolved, onDismissalChanged, onOpenSession, onPendingChange }: {
  repair: DiagnosticRepair;
  disabled: boolean;
  canDismiss: boolean;
  focusSeq?: number;
  onResolved(key: string, summary: string, projectId?: string): void;
  onDismissalChanged(key: string, dismissed: boolean): void;
  onOpenSession(sessionId: string): void;
  onPendingChange(key: string, pending: boolean): void;
}) {
  const store = usePlaceStore();
  const rebindProject = store((state) => state.rebindProject);
  const removeProject = store((state) => state.removeProject);
  const decline = store((state) => state.spaceRepairDecline);
  const local = isLocalPlace(store.place);
  const seat = seatName(store.place);
  const proposal = repair.proposal;
  const recorded = repair.directories[0] ?? "";
  const folderRepair = repair.kind === "folder";
  const hasConversations = repair.sessions > 0;
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  // A historical path is evidence, not a suggestion. Only a folder the
  // core checked and proposed is safe to prefill.
  const [path, setPath] = useState(proposal?.path ?? "");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string>();
  const [readError, setReadError] = useState<string>();
  const fieldRef = useRef<HTMLInputElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const fieldId = useId();
  const helpId = `${fieldId}-help`;
  const errorId = `${fieldId}-error`;
  const declined = canDismiss && repair.declined !== undefined;

  useEffect(() => {
    onPendingChange(`repair:${repair.key}`, busy);
    return () => onPendingChange(`repair:${repair.key}`, false);
  }, [busy, repair.key, onPendingChange]);

  useEffect(() => {
    if (focusSeq !== undefined) firstRef.current?.focus();
  }, [focusSeq]);
  useEffect(() => {
    if (editing) {
      fieldRef.current?.focus();
      fieldRef.current?.select();
    } else if (wasEditing.current) firstRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  const readConversation = (sessionId: string): void => {
    setReadError(undefined);
    // A Space read may precede a session removal. A stale preview must
    // not navigate to whichever conversation is still selected.
    if (!store.getState().sessions.some((session) => session.id === sessionId)) {
      setReadError(i18n._({
        id: "This conversation is no longer listed. Refresh this list and try again.",
        comment: "the saved-work preview is older than the current session list; this does not assert that any file was deleted",
      }));
      return;
    }
    onOpenSession(sessionId);
  };

  const pair = async (chosen: string): Promise<void> => {
    if (!repair.repository || busy) return;
    setBusy(true);
    setRefusal(undefined);
    try {
      const project = await rebindProject(repair.repository, chosen, repair.directories);
      onResolved(repair.key, i18n._({
        id: "Project folder saved: {path}",
        values: { path: tildify(project.path) },
        comment: "the folder choice succeeded; an older conversation may still have a separate import problem",
      }), project.id);
    } catch (cause) {
      setRefusal((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (): Promise<void> => {
    if (!repair.repository || busy) return;
    setBusy(true);
    setRefusal(undefined);
    try {
      await removeProject(repair.repository, true);
      onResolved(repair.key, i18n._({ id: "{path} · removed", values: { path: recorded }, comment: "the project was removed from the list; its folder's files remain" }));
    } catch (cause) {
      setRefusal((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const defer = async (): Promise<void> => {
    if (busy || disabled || !canDismiss) return;
    setBusy(true);
    setRefusal(undefined);
    try {
      await decline(repair.key, !declined);
      onDismissalChanged(repair.key, !declined);
    } catch (cause) {
      setRefusal((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const submit = (): void => {
    if (busy || disabled) return;
    const chosen = path.trim();
    if (!chosen) {
      setRefusal(i18n._({ id: "Choose an existing project folder", comment: "the folder-choice form needs a path before it can save" }));
      fieldRef.current?.focus();
      return;
    }
    void pair(chosen);
  };
  const closeEditor = (): void => {
    setEditing(false);
    setRefusal(undefined);
    firstRef.current?.focus();
  };
  const refusalLine = refusal ? <p id={errorId} role="alert" className={`text-xs ${ALERT_INK}`}>{refusal}</p> : null;
  const showUse = proposal !== undefined && local;
  const first = showUse ? "use" : local ? "choose" : "defer";

  const controls = folderRepair ? (
    <div className="flex flex-wrap items-center gap-2">
      {removing ? (
        <InlineConfirm
          question={i18n._({ id: "Remove this project? Its files stay.", comment: "confirm removing a project whose saved work is missing" })}
          confirmLabel={i18n._({ id: "Remove", comment: "remove the project from the list" })}
          disabled={busy}
          onConfirm={() => { setRemoving(false); void remove(); }}
          onCancel={() => setRemoving(false)}
        />
      ) : (
        <button ref={firstRef} type="button" data-testid="space-repair-remove" className={SECONDARY} disabled={disabled || busy || !repair.repository} onClick={() => setRemoving(true)}>
          {i18n._({ id: "Remove project", comment: "remove a project whose saved work is missing; its project files stay" })}
        </button>
      )}
      {refusalLine}
    </div>
  ) : (
    <div className="flex flex-wrap items-center gap-2">
      {showUse && proposal ? (
        <button ref={firstRef} type="button" data-testid="space-repair-use" className={`${PRIMARY} min-w-0 max-w-full break-all text-left`} disabled={disabled || busy || !repair.repository} title={proposal.path} onClick={() => void pair(proposal.path)}>
          {busy ? i18n._({ id: "Saving…", comment: "saving the project folder for saved conversations" }) : i18n._({ id: "Use {folder}", values: { folder: tildify(proposal.path) }, comment: "use the existing project folder the core checked for these conversations" })}
        </button>
      ) : null}
      {local ? (
        <button ref={first === "choose" ? firstRef : undefined} type="button" data-testid="space-repair-choose" className={showUse ? SECONDARY : PRIMARY} disabled={disabled || busy || !repair.repository} onClick={() => { setRefusal(undefined); setEditing(true); }}>
          {i18n._({ id: "Locate folder…", comment: "locate the existing project files for this saved conversation group" })}
        </button>
      ) : null}
      {canDismiss ? <button ref={first === "defer" ? firstRef : undefined} type="button" data-testid="space-repair-decline" className={LINK} disabled={disabled || busy} onClick={() => void defer()}>
          {declined
            ? i18n._({ id: "Show again", comment: "restore a dismissed folder task or saved-file notice to active review" })
            : i18n._({ id: "Dismiss", comment: "move this folder task or saved-file notice to Dismissed without deleting saved work" })}
        </button> : null}
      {refusalLine}
    </div>
  );

  const editor = (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-neutral-300 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-900"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        if (!busy) closeEditor();
      }}>
      <h3 className="font-medium">{repair.projectName
        ? i18n._({ id: "Where are this project’s files?", comment: "locate the files belonging to the named project above" })
        : i18n._({ id: "Where are the files used in these conversations?", comment: "locate the original files for saved conversations without a known project name" })}</h3>
      <p id={helpId} className="text-xs text-neutral-500">{i18n._({ id: "Select the existing folder used for this work. This does not create or download a project.", comment: "folder selection uses files already present on this computer" })}</p>
      <div className="flex min-w-0 flex-col gap-1 text-xs">
        <label htmlFor={fieldId}>{i18n._({ id: "Project folder on this computer", comment: "the local folder containing the project files, separate from saved conversation history" })}</label>
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <input id={fieldId} ref={fieldRef} data-testid="space-repair-path" value={path} aria-describedby={refusal ? `${helpId} ${errorId}` : helpId} aria-invalid={refusal ? true : undefined} onChange={(event) => { setPath(event.target.value); setRefusal(undefined); }}
            onKeyDown={(event) => {
              if (busy) return;
              if (event.key === "Enter") void submit();
            }}
            spellCheck={false} disabled={busy} className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-2 py-1 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-950"
          />
          {window.spexNative ? <button type="button" className={SECONDARY} disabled={busy} onClick={async () => {
            try {
              const picked = await window.spexNative!.pickDirectory();
              if (picked) { setPath(picked); setRefusal(undefined); }
              fieldRef.current?.focus();
            } catch {
              setRefusal(i18n._({ id: "Could not open the folder picker. Enter the folder path instead.", comment: "the native picker failed; the typed-path alternative remains available" }));
              fieldRef.current?.focus();
            }
          }}>
            {i18n._({ id: "Browse…", comment: "open the system picker for an existing project folder" })}
          </button> : null}
        </span>
      </div>
      {hasConversations ? <p className="text-xs text-neutral-500">{i18n._({ id: "This folder will be used for {count, plural, one {the conversation} other {all # conversations}} listed here.", values: { count: repair.sessions }, comment: "the folder choice affects only this saved conversation group, including previews not shown" })}</p> : null}
      {refusalLine}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" data-testid="space-repair-submit" className={PRIMARY} disabled={busy || disabled} onClick={submit}>
          {busy ? i18n._({ id: "Saving…", comment: "saving the project folder for saved conversations" }) : i18n._({ id: "Use this folder", comment: "confirm the existing folder for this saved work" })}
        </button>
        <button type="button" className={SECONDARY} disabled={busy} onClick={closeEditor}>{i18n._({ id: "Cancel", comment: "cancel choosing a project folder" })}</button>
      </div>
    </div>
  );

  return (
    <li data-testid={declined ? "space-repair-declined" : "space-repair"} data-kind={repair.kind} className="flex min-w-0 flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {!folderRepair && repair.projectName ? <Icon name="folder" className="h-4 w-4 shrink-0 text-neutral-500" /> : null}
          <h3 data-testid="space-repair-title" className="min-w-0 break-words font-medium">{folderRepair
            ? i18n._({ id: "Saved work is missing", comment: "the project's saved conversations are no longer present" })
            : repair.projectName || (hasConversations
              ? i18n._({ id: "Earlier conversations", comment: "saved conversations whose actual project name is unknown" })
              : i18n._({ id: "Earlier saved work", comment: "saved work with no known project name or indexed conversations" }))}</h3>
        </div>
        {!folderRepair && hasConversations ? <p className="text-xs text-neutral-500">{i18n._({
          id: "{count, plural, one {# saved conversation} other {# saved conversations}}",
          values: { count: repair.sessions },
          comment: "number of conversations belonging to this project or unnamed saved-work group",
        })}</p> : null}
      </div>
      {!folderRepair && repair.conversations?.length ? <div data-testid="space-repair-conversations" className="flex min-w-0 flex-col gap-1">
        <ul className="flex min-w-0 flex-col gap-2" aria-label={i18n._({ id: "Saved conversations", comment: "preview list of conversations in this saved-work group" })}>
          {repair.conversations.slice(0, 3).map((conversation, index) => {
            const date = conversation.updatedAt !== undefined
              ? new Date(conversation.updatedAt).toLocaleDateString(currentLocale(), { dateStyle: "medium" }) : undefined;
            const label = conversation.title || (date
              ? i18n._({ id: "Conversation saved {date}", values: { date }, comment: "an untitled conversation identified by its actual saved date" })
              : i18n._({ id: "Untitled conversation", comment: "no saved title or date is available" }));
            return <li key={conversation.id ?? index} className="flex min-w-0 items-start gap-2">
              <Icon name="conversation" className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
              <div className="min-w-0">
                {conversation.id ? <button type="button" className="max-w-full break-words text-left text-sm text-brand-600 underline-offset-2 hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-brand-500 dark:text-brand-400" disabled={disabled} onClick={() => readConversation(conversation.id!)}>
                  {label}
                </button> : <p className="break-words text-sm">{label}</p>}
                {conversation.title && date ? <p className="text-xs text-neutral-500">{i18n._({ id: "Saved {date}", values: { date }, comment: "the conversation's actual saved date" })}</p> : null}
              </div>
            </li>;
          })}
        </ul>
        {repair.sessions > repair.conversations.slice(0, 3).length ? <p className="pl-6 text-xs text-neutral-500">{i18n._({
          id: "and {count} more",
          values: { count: repair.sessions - repair.conversations.slice(0, 3).length },
          comment: "additional saved conversations beyond the preview; every conversation is included in the folder choice",
        })}</p> : null}
      </div> : null}
      {readError ? <p role="alert" data-testid="space-conversation-error" className={`text-xs ${ALERT_INK}`}>{readError}</p> : null}
      {folderRepair ? <p className="text-xs text-neutral-500">{seat === undefined
        ? i18n._({ id: "The saved work for this folder is no longer on this computer.", comment: "a project whose saved records disappeared, without claiming its project files are gone" })
        : i18n._({ id: "The saved work for this folder is no longer on {place}.", values: { place: seat }, comment: "a server's saved project records are gone" })}</p>
        : null}
      {recorded ? <div data-testid="space-repair-folder" className="flex min-w-0 flex-col gap-1 text-xs text-neutral-500">
        <span>{repair.directories.length === 1
          ? i18n._({ id: "Previously used folder", comment: "the historical folder below is evidence, not the new folder selection" })
          : i18n._({ id: "Previously used folders", comment: "all historical working folders for this saved conversation group" })}</span>
        {repair.directories.map((directory) => <span key={directory} className="break-all font-mono" title={directory}>{tildify(directory)}</span>)}
      </div> : null}
      {editing ? editor : controls}
      {(repair.directories.length > 0 || repair.details?.length) && !folderRepair ? <TechnicalDetails entries={repair.details}>
        {repair.directories.map((directory) => {
          const finding = repair.checked?.find((entry) => entry.path === directory);
          const evidence = !finding || finding.unknown
            ? i18n._({ id: "This folder could not be checked.", comment: "the historical folder has no completed check" })
            : !finding.here
              ? i18n._({ id: "This folder was not found.", comment: "the exact historical path displayed above was checked and is absent" })
              : finding.claimedBy
                ? i18n._({ id: "This folder is already used by another project.", comment: "the exact historical path displayed above belongs to another saved project" })
                : !finding.repo
                  ? i18n._({ id: "This is not the main folder of a Git project.", comment: "the exact historical path displayed above is not a Git worktree root" })
                  : i18n._({ id: "An existing project was found in this folder.", comment: "the historical folder was checked as an existing Git project root" });
          return <div key={directory} className="flex min-w-0 flex-col gap-1"><span className="break-all font-mono">{tildify(directory)}</span><p>{evidence}</p></div>;
        })}
      </TechnicalDetails> : null}
    </li>
  );
}

/** What the reader's own act made of a repair (space-48): a pairing
 * names the project it made, a forgotten folder none. */
interface RepairOutcome {
  summary: string;
  projectId?: string;
}

/** A resolved repair's outcome, standing in the row it replaced
 * (space-48): Open project is the one way off the surface. */
function RepairOutcomeRow({
  outcome,
  focusSeq,
  onOpenProject,
}: {
  outcome: RepairOutcome;
  /** Set when focus moves here; a new value moves it again. */
  focusSeq?: number;
  onOpenProject(projectId: string): void;
}) {
  const openRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusSeq !== undefined) openRef.current?.focus();
  }, [focusSeq]);
  const projectId = outcome.projectId;
  return (
    <li data-testid="space-repair-resolved" className="flex min-w-0 flex-wrap items-center gap-2 py-4 first:pt-0 last:pb-0">
      <span>
        <span aria-hidden>✓</span>
        <span className="sr-only">{i18n._({ id: "Saved", comment: "the requested folder choice was saved" })}</span>
      </span>
      <span className="min-w-0 flex-1">{outcome.summary}</span>
      {projectId ? (
        <button ref={openRef} type="button" className={LINK} onClick={() => onOpenProject(projectId)}>
          {i18n._({ id: "Open project", comment: "a resolved repair's control: shows the project it made" })}
        </button>
      ) : null}
    </li>
  );
}

type IssueEntry = GroupsState["diagnostics"][number];

/** Only the core's explicit capability permits dismissing a notice. */
const dismissibleNotice = (entry: IssueEntry): boolean =>
  !entry.blocking && !entry.repair && entry.notice !== undefined &&
  (entry.code === "session-import" || entry.code === "session-upgrade");
const dismissedNotice = (entry: IssueEntry): boolean =>
  dismissibleNotice(entry) && entry.notice?.dismissed !== undefined;

/** Known operations supply the cause; error prose never selects a remedy. */
function DiagnosticRow({ entry, disabled, focusSeq, onNoticeChanged, onPendingChange }: {
  entry: IssueEntry;
  disabled: boolean;
  focusSeq?: number;
  onNoticeChanged(key: string, dismissed: boolean): void;
  onPendingChange(key: string, pending: boolean): void;
}) {
  const store = usePlaceStore();
  const dismiss = store((state) => state.spaceNoticeDismiss);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const actionRef = useRef<HTMLButtonElement>(null);
  const dismissed = dismissedNotice(entry);
  useEffect(() => {
    onPendingChange(`notice:${entry.file}`, busy);
    return () => onPendingChange(`notice:${entry.file}`, false);
  }, [busy, entry.file, onPendingChange]);
  useEffect(() => {
    if (focusSeq !== undefined) actionRef.current?.focus();
  }, [focusSeq]);
  const changeNotice = async (): Promise<void> => {
    if (!entry.notice || busy || disabled) return;
    setBusy(true);
    setError(undefined);
    try {
      await dismiss(entry.notice.key, !dismissed);
      onNoticeChanged(entry.notice.key, !dismissed);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const folderRequired = entry.code === "session-folder-required";
  const olderSession = folderRequired || entry.code === "session-import" || entry.code === "session-upgrade";
  const summary = folderRequired
    ? i18n._({ id: "A saved conversation needs a project folder", comment: "a folder requirement not associated with an actionable recovery card" })
    : olderSession
      ? i18n._({ id: "An older conversation can’t be opened", comment: "this version could not read an older saved conversation" })
      : i18n._({ id: "Saved data needs attention", comment: "a stored file could not be used; the technical cause is in Details" });
  return (
    <li data-testid="space-diagnostic" className="flex min-w-0 flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <h3 className="font-medium">{summary}</h3>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">{olderSession
        ? i18n._({ id: "Spex could not read this saved conversation. The original file is still saved.", comment: "the failed old-conversation import preserves its original file" })
        : i18n._({ id: "Spex could not use this saved file.", comment: "generic storage failure without guessing a remedy from technical text" })}</p>
      {entry.blocking ? <p data-testid="space-diagnostic-impact" className="text-xs text-amber-800 dark:text-amber-200">
        {i18n._({ id: "This must be resolved before using the affected data.", comment: "the problem blocks operations depending on this data, not all work" })}
      </p> : null}
      <TechnicalDetails entries={[entry]} />
      {dismissibleNotice(entry) ? <div className="flex flex-wrap items-center gap-2">
        <button ref={actionRef} type="button" data-testid="space-notice-dismiss" className={LINK} disabled={disabled || busy} onClick={() => void changeNotice()}>
          {dismissed
            ? i18n._({ id: "Show again", comment: "restore a dismissed folder task or saved-file notice to active review" })
            : i18n._({ id: "Dismiss", comment: "move this folder task or saved-file notice to Dismissed without deleting saved work" })}
        </button>
        {error ? <p role="alert" className={`text-xs ${ALERT_INK}`}>{error}</p> : null}
      </div> : null}
    </li>
  );
}

/** One row's place in the list: a repair keeps its place as it changes
 * condition, its outcome taking the same one. */
const issueRowId = (entry: IssueEntry): string =>
  entry.repair ? `repair:${entry.repair.key}` : `diagnostic:${entry.file}:${entry.reason}`;
const outcomeRowId = (key: string): string => `repair:${key}`;

/** Saved work stays behind the reader's review control. Only blocking
 * problems open automatically. Each card describes one useful action. */
export function IssuesList({
  groups,
  connected,
  open,
  revealDismissed,
  refreshes,
  onOpenProject,
  onOpenSession,
  onNote,
  onClose,
  onPendingChange,
}: {
  groups: GroupsState;
  connected: boolean;
  /** The header's control opened it. */
  open: boolean;
  /** A saved conversation's return reveals its dismissed folder tasks. */
  revealDismissed?: number;
  /** How many times the reader's own Refresh has re-read the state. */
  refreshes: number;
  onOpenProject(projectId: string): void;
  onOpenSession(sessionId: string): void;
  onNote: Note;
  onClose(): void;
  onPendingChange(pending: boolean): void;
}) {
  const store = usePlaceStore();
  const seat = seatName(store.place);
  // Outcomes keep the active task's position until Refresh. Dismissal
  // deliberately moves a task into the separate, collapsed section.
  const [outcomes, setOutcomes] = useState<Record<string, RepairOutcome>>({});
  const [dismissalNote, setDismissalNote] = useState<string>();
  const [dismissedOpen, setDismissedOpen] = useState(false);
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const pendingChange = useCallback((key: string, busy: boolean) => {
    setPending((current) => {
      if (current.has(key) === busy) return current;
      const next = new Set(current);
      if (busy) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  useEffect(() => { onPendingChange(pending.size > 0); }, [pending, onPendingChange]);
  useEffect(() => () => onPendingChange(false), [onPendingChange]);
  const seenReveal = useRef<number | undefined>(undefined);
  const [noticeFocus, setNoticeFocus] = useState<{ key: string; dismissed: boolean; seq: number }>();
  const dismissedSummaryRef = useRef<HTMLElement>(null);
  const layout = useRef<string[]>([]);
  const [focusTo, setFocusTo] = useState<{ id: string; seq: number }>();
  const seenRefreshes = useRef(refreshes);
  useEffect(() => {
    if (refreshes === seenRefreshes.current) return;
    seenRefreshes.current = refreshes;
    layout.current = [];
    setOutcomes({});
    setDismissalNote(undefined);
    setNoticeFocus(undefined);
    setFocusTo(undefined);
  }, [refreshes]);
  useEffect(() => {
    if (noticeFocus?.dismissed) dismissedSummaryRef.current?.focus();
  }, [noticeFocus]);
  const hasDismissedRepairs = groups.diagnostics.some((entry) => !entry.blocking && entry.repair?.declined !== undefined);
  useEffect(() => {
    if (!open) {
      setDismissedOpen(false);
      return;
    }
    if (revealDismissed === undefined || seenReveal.current === revealDismissed) return;
    seenReveal.current = revealDismissed;
    if (hasDismissedRepairs) setDismissedOpen(true);
  }, [open, revealDismissed, hasDismissedRepairs]);

  // Optional recovery stays neutral; only a blocking diagnostic needs
  // immediate attention. Deferred tasks remain available.
  const fresh = groups.diagnostics.filter((entry) => entry.repair);
  const notices = groups.diagnostics.filter((entry) => !entry.repair);
  const activeNotices = notices.filter((entry) => !dismissedNotice(entry));
  const dismissedNotices = notices.filter(dismissedNotice);
  const rows = new Map<string, { outcomeKey: string } | { entry: IssueEntry }>();
  for (const entry of fresh) {
    rows.set(
      issueRowId(entry),
      entry.repair && outcomes[entry.repair.key] ? { outcomeKey: entry.repair.key } : { entry },
    );
  }
  // An outcome outlives its repair's report (space-48).
  for (const key of Object.keys(outcomes)) {
    if (!rows.has(outcomeRowId(key))) rows.set(outcomeRowId(key), { outcomeKey: key });
  }
  // Each row keeps the place it last had; a row new since then follows.
  const arrived = [...rows.keys()].filter((id) => !layout.current.includes(id));
  const placed = [...layout.current.filter((id) => rows.has(id)), ...arrived];
  const activeRepairs = placed.filter((id) => {
    const row = rows.get(id)!;
    return "outcomeKey" in row || row.entry.blocking || row.entry.repair?.declined === undefined;
  });
  const dismissedRepairs = placed.filter((id) => !activeRepairs.includes(id));
  const dismissedCount = dismissedRepairs.length + dismissedNotices.length;
  const nextLayout = [...layout.current, ...arrived];
  // What a resolution reads when its act lands: the store has often
  // re-read the state by then, the repair's row already gone.
  const latest = useRef({ groups, outcomes });
  useLayoutEffect(() => {
    layout.current = nextLayout;
    latest.current = { groups, outcomes };
  });
  const listOpen = (rows.size > 0 || notices.length > 0) && open;

  /** The reader's act resolved a repair (space-48): its outcome takes
   * the row's place, and focus and the live region move on. */
  const onResolved = (key: string, summary: string, projectId?: string): void => {
    const { groups: state, outcomes: done } = latest.current;
    const unanswered = (entry: IssueEntry): boolean =>
      entry.repair !== undefined &&
      entry.repair.key !== key &&
      (entry.blocking || entry.repair.declined === undefined) &&
      !done[entry.repair.key];
    // Focus moves to the next unanswered repair below, wrapping to the
    // top, or else onto this outcome's Open project. The layout still
    // holds the row's place even where its report is gone.
    const id = outcomeRowId(key);
    const order = layout.current;
    const at = order.indexOf(id);
    const targets = new Set(state.diagnostics.filter(unanswered).map(issueRowId));
    const next = [...order.slice(at + 1), ...order.slice(0, Math.max(at, 0))].find((row) => targets.has(row));
    setOutcomes((was) => ({ ...was, [key]: { summary, projectId } }));
    setFocusTo((was) => ({ id: next ?? id, seq: (was?.seq ?? 0) + 1 }));
    onNote(summary);
  };
  const focusSeq = (id: string): number | undefined => (focusTo?.id === id ? focusTo.seq : undefined);
  const confirmDismissal = (message: string): void => {
    setDismissalNote(message);
    onNote(message);
  };
  const onRepairDismissalChanged = (key: string, dismissed: boolean): void => {
    if (dismissed) setNoticeFocus((was) => ({ key, dismissed: true, seq: (was?.seq ?? 0) + 1 }));
    else setFocusTo((was) => ({ id: outcomeRowId(key), seq: (was?.seq ?? 0) + 1 }));
    confirmDismissal(dismissed
      ? i18n._({ id: "Moved to Dismissed in Space → Files & history. Your conversations are kept.", comment: "confirms preservation and names the return path for a dismissed folder task" })
      : i18n._({ id: "Shown again.", comment: "a dismissed folder task or notice is active and counted again" }));
  };
  const onNoticeChanged = (key: string, dismissed: boolean): void => {
    setNoticeFocus((was) => ({ key, dismissed, seq: (was?.seq ?? 0) + 1 }));
    confirmDismissal(dismissed
      ? i18n._({ id: "Notice dismissed. The saved file is kept.", comment: "confirms only the warning was dismissed, never its original saved file" })
      : i18n._({ id: "Shown again.", comment: "a dismissed folder task or notice is active and counted again" }));
  };

  if (!listOpen) return null;
  const folderTasks = fresh.filter((entry) => entry.repair?.kind === "repository" && !outcomes[entry.repair.key]);
  const activeFolderTasks = folderTasks.filter((entry) => entry.blocking || entry.repair?.declined === undefined);
  const introTasks = activeFolderTasks.length > 0 ? activeFolderTasks : folderTasks;
  const hasHistory = introTasks.some((entry) => (entry.repair?.sessions ?? 0) > 0);
  const readable = introTasks.some((entry) => entry.repair?.conversations?.some((conversation) => conversation.id));
  const repairsBlocking = fresh.some((entry) => entry.blocking);
  const noticesBlocking = activeNotices.some((entry) => entry.blocking);
  const repairTitle = repairsBlocking
    ? i18n._({ id: "Needs attention", comment: "saved data currently blocks an operation" })
    : folderTasks.length > 0
      ? i18n._({ id: "Locate project files", comment: "review the project folders needed for saved conversations" })
      : i18n._({ id: "Review notices", comment: "stored-data notices that do not offer a project folder choice" });
  const noticeTitle = noticesBlocking
    ? i18n._({ id: "Needs attention", comment: "saved data currently blocks an operation" })
    : i18n._({ id: "Review notices", comment: "stored-data notices that do not offer a project folder choice" });
  const title = activeNotices.length > 0 || activeRepairs.length === 0 ? noticeTitle : repairTitle;
  const panelClass = (needsAttention: boolean): string =>
    `flex min-w-0 flex-col gap-4 rounded-lg border p-4 ${needsAttention
      ? "border-amber-300 dark:border-amber-700"
      : "border-neutral-200 dark:border-neutral-800"}`;
  const introduction = introTasks.length > 0 ? <p className="text-sm text-neutral-500">{!hasHistory
    ? seat === undefined
      ? i18n._({ id: "To work on a project, locate its files.", comment: "folder tasks contain no saved conversations, so explain only the need for project files" })
      : i18n._({ id: "To work on a project, its files must be available on {place}.", values: { place: seat }, comment: "folder tasks on the named server contain no saved conversations" })
    : seat === undefined
      ? readable
        ? i18n._({ id: "Conversation history is saved on this computer. You can read the conversations now. To work on a project again, locate its files.", comment: "one explanation for all project-folder choices, without claiming the files are absent" })
        : i18n._({ id: "Conversation history is saved on this computer. To work on a project again, locate its files.", comment: "older cores without readable conversation links still explain why project files are needed" })
      : readable
        ? i18n._({ id: "Conversation history is saved on {place}. You can read the conversations now. Project files must be available there for further work.", values: { place: seat }, comment: "saved history and required files belong to the named server, which allocates its folders" })
        : i18n._({ id: "Conversation history is saved on {place}. Project files must be available there for further work.", values: { place: seat }, comment: "server-side folder requirement where no readable conversation links are available" })}</p> : null;
  const renderRepair = (id: string) => {
    const row = rows.get(id)!;
    if ("outcomeKey" in row) return <RepairOutcomeRow key={id} outcome={outcomes[row.outcomeKey]!}
      focusSeq={focusSeq(id)} onOpenProject={onOpenProject} />;
    return row.entry.repair ? <RepairRow key={id} repair={row.entry.repair} disabled={!connected} canDismiss={!row.entry.blocking}
      focusSeq={focusSeq(id)} onResolved={onResolved} onDismissalChanged={onRepairDismissalChanged}
      onOpenSession={onOpenSession} onPendingChange={pendingChange} /> : null;
  };
  const renderNotice = (entry: IssueEntry) => entry.file.endsWith(MERGE_HEAD_FILE)
    ? <li key={issueRowId(entry)} title={entry.file}>
      {i18n._({ id: "Finish or abort the merge in your terminal", comment: "a Git merge started in a terminal is pending in a project's records" })}
    </li>
    : <DiagnosticRow key={entry.notice?.key ?? issueRowId(entry)} entry={entry} disabled={!connected}
      focusSeq={!noticeFocus?.dismissed && noticeFocus?.key === entry.notice?.key ? noticeFocus?.seq : undefined}
      onNoticeChanged={onNoticeChanged} onPendingChange={pendingChange} />;
  const listClass = "flex min-w-0 flex-col divide-y divide-neutral-200 dark:divide-neutral-800";
  const closeControl = <PanelCloseButton data-testid="space-issues-close" disabled={pending.size > 0} onClick={onClose} />;
  const onlyDismissed = activeRepairs.length === 0 && activeNotices.length === 0 && dismissedCount > 0;
  return (
    <section data-testid="space-issues-list" aria-label={title} className="flex min-w-0 flex-col gap-4 text-sm"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        if (pending.size === 0) onClose();
      }}>
      {activeRepairs.length > 0 ? <div data-testid="space-folder-review" className={panelClass(repairsBlocking)}>
        <div className="flex flex-col gap-1">
          <div className="flex items-start justify-between gap-3">
            <h2 data-testid="space-issues-heading" className={`min-w-0 break-words font-medium ${repairsBlocking ? "text-amber-800 dark:text-amber-200" : ""}`}>{repairTitle}</h2>
            {closeControl}
          </div>
          {activeFolderTasks.length > 0 ? introduction : null}
        </div>
        <ul className={listClass}>{activeRepairs.map(renderRepair)}</ul>
      </div> : null}
      {activeNotices.length > 0 ? <div data-testid="space-notice-review" className={panelClass(noticesBlocking)}>
        <div className="flex items-start justify-between gap-3">
          <h2 data-testid={activeRepairs.length > 0 ? undefined : "space-issues-heading"} className={`min-w-0 break-words font-medium ${noticesBlocking ? "text-amber-800 dark:text-amber-200" : ""}`}>{noticeTitle}</h2>
          {activeRepairs.length === 0 ? closeControl : null}
        </div>
        <ul data-testid="space-active-notices" className={listClass}>{activeNotices.map(renderNotice)}</ul>
      </div> : null}
      {dismissalNote ? <p data-testid="space-deferred-notice" className="text-sm text-neutral-500">{dismissalNote}</p> : null}
      {dismissedCount > 0 ? <div className="relative min-w-0">
        {onlyDismissed ? <div className="absolute right-4 top-4">{closeControl}</div> : null}
        <details data-testid="space-dismissed" className="min-w-0 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
        open={dismissedOpen} onToggle={(event) => setDismissedOpen(event.currentTarget.open)}>
        <summary ref={dismissedSummaryRef} className={`cursor-pointer font-medium text-neutral-500 ${onlyDismissed ? "pr-8" : ""}`}>{i18n._({
          id: "Dismissed ({count})", values: { count: dismissedCount },
          comment: "collapsed folder choices and saved-file notices that no longer contribute to the warning count",
        })}</summary>
        <div className="mt-4 flex min-w-0 flex-col gap-4">
          {dismissedRepairs.length > 0 ? <div data-testid="space-dismissed-folders" className="flex min-w-0 flex-col gap-4">
            {activeFolderTasks.length === 0 ? introduction : null}
            <ul className={listClass}>{dismissedRepairs.map(renderRepair)}</ul>
          </div> : null}
          {dismissedNotices.length > 0 ? <div data-testid="space-dismissed-notices" className="flex min-w-0 flex-col gap-4">
            {dismissedRepairs.length > 0 ? <h3 className="font-medium">{i18n._({ id: "Review notices", comment: "stored-data notices that do not offer a project folder choice" })}</h3> : null}
            <ul className={listClass}>{dismissedNotices.map(renderNotice)}</ul>
          </div> : null}
        </div>
        </details>
      </div> : null}
    </section>
  );
}
