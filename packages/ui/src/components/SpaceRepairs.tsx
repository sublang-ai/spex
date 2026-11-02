// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Saved work is reviewed only when the reader wants to use it again.
// A folder choice is one task, with supporting evidence behind Details.
// Outcomes keep their rows and focus until Refresh.

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { DiagnosticRepair, GroupsState } from "@sublang/spex-core/protocol";

import { usePlaceStore } from "../state/place-context.js";
import { isLocalPlace } from "../state/store.js";
import { currentLocale, i18n } from "../i18n.js";
import { seatName, tildify } from "../lib/space.js";
import { InlineConfirm } from "./InlineConfirm.js";
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

/** One optional task: choose where saved conversations should continue.
 * Names from the storage layout never stand in for a user's project. */
function RepairRow({ repair, disabled, focusSeq, onResolved, onNote }: {
  repair: DiagnosticRepair;
  disabled: boolean;
  focusSeq?: number;
  onResolved(key: string, summary: string, projectId?: string): void;
  onNote: Note;
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
  const fieldRef = useRef<HTMLInputElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const fieldId = useId();
  const helpId = `${fieldId}-help`;
  const errorId = `${fieldId}-error`;
  const declined = repair.declined !== undefined;

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
    setBusy(true);
    try {
      await decline(repair.key, true);
      onNote(i18n._({ id: "Saved for later. Your conversations are kept.", comment: "confirmation after deferring an optional saved-work task" }));
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
  const refusalLine = refusal ? <p id={errorId} role="alert" className="text-xs text-red-600 dark:text-red-400">{refusal}</p> : null;
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
          {i18n._({ id: "Choose project…", comment: "choose an existing project folder for saved work; does not create a project" })}
        </button>
      ) : null}
      {!declined ? (
        <button ref={first === "defer" ? firstRef : undefined} type="button" data-testid="space-repair-decline" className={LINK} disabled={disabled || busy} title={i18n._({ id: "Leave this for later; saved conversations are kept", comment: "deferring this recovery task never deletes saved work" })} onClick={() => void defer()}>
          {i18n._({ id: "Not now", comment: "leave optional saved-work recovery for later" })}
        </button>
      ) : null}
      {refusalLine}
    </div>
  );

  const editor = (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-neutral-300 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-900">
      <h3 className="font-medium">{hasConversations
        ? i18n._({ id: "Where should these conversations continue?", comment: "the purpose of choosing an existing project folder" })
        : i18n._({ id: "Choose an existing project", comment: "choose a project folder for saved work" })}</h3>
      <p id={helpId} className="text-xs text-neutral-500">{i18n._({ id: "Select an existing project; this does not create one.", comment: "choosing a folder is not project creation or Git initialization" })}</p>
      <div className="flex min-w-0 flex-col gap-1 text-xs">
        <label htmlFor={fieldId}>{i18n._({ id: "Existing project folder", comment: "folder field for continuing saved conversations" })}</label>
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <input id={fieldId} ref={fieldRef} data-testid="space-repair-path" value={path} aria-describedby={refusal ? `${helpId} ${errorId}` : helpId} aria-invalid={refusal ? true : undefined} onChange={(event) => { setPath(event.target.value); setRefusal(undefined); }}
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
              if (busy) return;
              if (event.key === "Escape") { event.stopPropagation(); closeEditor(); }
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
      {hasConversations ? <p className="text-xs text-neutral-500">{i18n._({ id: "This choice applies to all these conversations.", comment: "the folder choice applies to this saved conversation group" })}</p> : null}
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
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h3 data-testid="space-repair-title" className="font-medium">{folderRepair
          ? i18n._({ id: "Saved work is missing", comment: "the project's saved conversations are no longer present" })
          : hasConversations
            ? i18n._({ id: "Continue {count, plural, one {# saved conversation} other {# saved conversations}}", values: { count: repair.sessions }, comment: "optional task naming how much saved work the folder choice applies to" })
            : i18n._({ id: "Use saved work", comment: "optional task to choose a project for saved work with no indexed conversations" })}</h3>
        {declined ? <span className="text-xs text-neutral-500">{i18n._({ id: "For later", comment: "this optional task has been deferred" })}</span> : null}
      </div>
      {!folderRepair && repair.projectName ? <p className="text-xs text-neutral-500">{i18n._({ id: "Project: {name}", values: { name: repair.projectName }, comment: "actual project name from its saved metadata, never a storage name" })}</p> : null}
      {!folderRepair && repair.conversations?.length ? <div data-testid="space-repair-conversations" className="flex min-w-0 flex-col gap-1 text-sm">
        {repair.conversations.slice(0, 3).map((conversation, index) => <p key={index} className="break-words">
          {conversation.title || (conversation.updatedAt !== undefined
            ? i18n._({ id: "Conversation saved {date}", values: { date: new Date(conversation.updatedAt).toLocaleDateString(currentLocale(), { dateStyle: "medium" }) }, comment: "an untitled conversation identified by its actual saved date" })
            : i18n._({ id: "Untitled conversation", comment: "no saved title or date is available" }))}
        </p>)}
        {repair.sessions > repair.conversations.slice(0, 3).length ? <p className="text-xs text-neutral-500">{i18n._({
          id: "and {count} more",
          values: { count: repair.sessions - repair.conversations.slice(0, 3).length },
          comment: "additional saved conversations beyond the preview; every conversation is included in the folder choice",
        })}</p> : null}
      </div> : null}
      {folderRepair ? <p className="text-xs text-neutral-500">{seat === undefined
        ? i18n._({ id: "The saved work for this folder is no longer on this computer.", comment: "a project whose saved records disappeared, without claiming its project files are gone" })
        : i18n._({ id: "The saved work for this folder is no longer on {place}.", values: { place: seat }, comment: "a server's saved project records are gone" })}</p>
        : !editing ? <p className="text-sm text-neutral-600 dark:text-neutral-400">{local
          ? hasConversations
            ? i18n._({ id: "Choose an existing project folder to continue these conversations there.", comment: "explains what the project-folder choice will accomplish" })
            : i18n._({ id: "Choose an existing project folder to use this saved work.", comment: "the purpose of choosing a folder when no conversation is indexed" })
          : i18n._({ id: "These conversations cannot be continued on {place} yet.", values: { place: seat }, comment: "a server allocates folders itself, so no local picker is offered" })}</p> : null}
      {recorded ? <div data-testid="space-repair-folder" className="flex min-w-0 flex-col gap-1 text-xs text-neutral-500">
        <span>{i18n._({ id: "Previously used folder", comment: "the historical folder below is evidence, not the new folder selection" })}</span>
        <span className="break-all font-mono" title={recorded}>{tildify(recorded)}</span>
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

/** Known operations supply the cause; error prose never selects a remedy. */
function DiagnosticRow({ entry }: { entry: IssueEntry }) {
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
  refreshes,
  onOpenProject,
  onNote,
}: {
  groups: GroupsState;
  connected: boolean;
  /** The header's control opened it. */
  open: boolean;
  /** How many times the reader's own Refresh has re-read the state. */
  refreshes: number;
  onOpenProject(projectId: string): void;
  onNote: Note;
}) {
  // A resolved repair's outcome stands in its row's place, and a
  // declined row keeps its place, until the reader's own Refresh or his
  // leaving the surface (space-48, space-55), so no list reflows under
  // the pointer. The layout is the order the list last drew, ids of
  // rows gone meanwhile kept so an outcome landing late finds its place.
  const [outcomes, setOutcomes] = useState<Record<string, RepairOutcome>>({});
  const layout = useRef<string[]>([]);
  const [focusTo, setFocusTo] = useState<{ id: string; seq: number }>();
  const seenRefreshes = useRef(refreshes);
  useEffect(() => {
    if (refreshes === seenRefreshes.current) return;
    seenRefreshes.current = refreshes;
    layout.current = [];
    setOutcomes({});
    setFocusTo(undefined);
  }, [refreshes]);

  // Optional recovery stays neutral; only a blocking diagnostic needs
  // immediate attention. Deferred tasks remain available.
  const blocking = groups.diagnostics.some((entry) => entry.blocking);
  // The rows as a fresh layout orders them: the core's order, a
  // declined repair after those still unanswered (space-46).
  const fresh = [...groups.diagnostics].sort(
    (a, b) => Number(a.repair?.declined !== undefined) - Number(b.repair?.declined !== undefined),
  );
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
  const nextLayout = [...layout.current, ...arrived];
  // What a resolution reads when its act lands: the store has often
  // re-read the state by then, the repair's row already gone.
  const latest = useRef({ groups, outcomes });
  useLayoutEffect(() => {
    layout.current = nextLayout;
    latest.current = { groups, outcomes };
  });
  const listOpen = rows.size > 0 && (open || blocking);

  /** The reader's act resolved a repair (space-48): its outcome takes
   * the row's place, and focus and the live region move on. */
  const onResolved = (key: string, summary: string, projectId?: string): void => {
    const { groups: state, outcomes: done } = latest.current;
    const unanswered = (entry: IssueEntry): boolean =>
      entry.repair !== undefined &&
      entry.repair.key !== key &&
      entry.repair.declined === undefined &&
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

  if (!listOpen) return null;
  const title = blocking
    ? i18n._({ id: "Needs attention", comment: "saved data currently blocks an operation" })
    : i18n._({ id: "Saved work", comment: "optional review of earlier work available on this computer" });
  return (
    <section data-testid="space-issues-list" aria-label={title}
      className={`flex min-w-0 flex-col gap-4 rounded-lg border p-4 text-sm ${blocking
        ? "border-amber-300 dark:border-amber-700"
        : "border-neutral-200 dark:border-neutral-800"}`}
    >
      <div className="flex flex-col gap-1">
        <h2 data-testid="space-issues-heading" className={`font-medium ${blocking ? "text-amber-800 dark:text-amber-200" : ""}`}>{title}</h2>
        {!blocking ? <p className="text-sm text-neutral-500">{i18n._({ id: "Choose what you want to use again. You can leave the rest for later.", comment: "older saved work is optional and does not block new work" })}</p> : null}
      </div>
      <ul className="flex min-w-0 flex-col divide-y divide-neutral-200 dark:divide-neutral-800">
        {placed.map((id) => {
          const row = rows.get(id)!;
          if ("outcomeKey" in row) {
            return (
              <RepairOutcomeRow
                key={id}
                outcome={outcomes[row.outcomeKey]!}
                focusSeq={focusSeq(id)}
                onOpenProject={onOpenProject}
              />
            );
          }
          const entry = row.entry;
          if (entry.file.endsWith(MERGE_HEAD_FILE)) {
            return (
              <li key={id} title={entry.file}>
                {i18n._({ id: "Finish or abort the merge in your terminal", comment: "a Git merge started in a terminal is pending in a project's records" })}
              </li>
            );
          }
          if (entry.repair) {
            return (
              <RepairRow
                key={id}
                repair={entry.repair}
                disabled={!connected}
                focusSeq={focusSeq(id)}
                onResolved={onResolved}
                onNote={onNote}
              />
            );
          }
          return <DiagnosticRow key={id} entry={entry} />;
        })}
      </ul>
    </section>
  );
}
