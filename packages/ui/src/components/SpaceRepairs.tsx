// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// What needs fixing on the Space surface (space-1, space-46..space-56,
// DR-065, DR-172): the list "To fix (<n>) · <m> set aside" the header's
// "⚠ <n> to fix" opens, holding every repair the core folded and every
// problem no repair folds. A project whose folder is missing on this
// computer reads "<project> · <group> — Folder missing on this computer"
// with "Use <folder>" where the core found one, "Choose folder…" and
// "Not on this computer"; a project folder whose records are missing
// offers to remove the project, as the Overview tab's Remove does. An answered row keeps its place until the
// reader's own Refresh, so nothing reflows under the pointer, and focus
// and the live region move on. At a team server's place the server is
// named where this computer would be, and no folder is picked or typed:
// its core allocates every folder (space-112, space-103).

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { DiagnosticRepair, GroupsState } from "@sublang/spex-core/protocol";

import { usePlaceStore } from "../state/place-context.js";
import { isLocalPlace } from "../state/store.js";
import { i18n } from "../i18n.js";
import { projectName, seatName, tildify } from "../lib/space.js";
import { InlineConfirm } from "./InlineConfirm.js";
import { LINK, SECONDARY, type Note } from "./SpaceSurface.js";

/** The pending merge's file, which a row reads in plain words. */
const MERGE_HEAD_FILE = ".git/MERGE_HEAD";

/** "Not on this computer", or "Not on <server>" at a team server's place
 * (space-49, space-112): the answer that the project is not kept here. */
function notHereAnswer(seat?: string): string {
  return seat === undefined
    ? i18n._({
        id: "Not on this computer",
        comment: "on a repair: answer that this project is not kept on this computer, so it stops counting as something to fix",
      })
    : i18n._({
        id: "Not on {place}",
        values: { place: seat },
        comment: "on a repair at a team server's Space: answer that this project is not kept on the server; {place} is the server's name",
      });
}

/**
 * A repair the core folded (space-46, space-47). Records no project
 * folder here pairs ask the one question that follows: which folder on
 * this computer is the project? Pairing one is picking a folder, so the
 * row speaks of projects and folders (DR-065). A project folder whose
 * records are missing has nothing here to pair, so its row offers to
 * remove the project, its files staying (projects-9).
 *
 * Declining leaves the row standing and quiet, still offering what it
 * offered, so changing your mind needs no separate undo.
 */
function RepairRow({
  repair,
  disabled,
  focusSeq,
  onResolved,
  onNote,
}: {
  repair: DiagnosticRepair;
  disabled: boolean;
  /** Set when focus moves here; a new value moves it again. */
  focusSeq?: number;
  onResolved(key: string, summary: string, projectId?: string): void;
  onNote: Note;
}) {
  const store = usePlaceStore();
  const rebindProject = store((state) => state.rebindProject);
  const removeProject = store((state) => state.removeProject);
  const decline = store((state) => state.spaceRepairDecline);
  // A remote place's core allocates every project's folder (space-103,
  // run-view-169): no folder is named there, picked or typed; its words
  // name the server where they would name this computer (space-112).
  const local = isLocalPlace(store.place);
  const seat = seatName(store.place);
  const proposal = repair.proposal;
  const recorded = repair.directories[0] ?? "";
  const folderRepair = repair.kind === "folder";
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [path, setPath] = useState(proposal?.path ?? recorded);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string>();
  const fieldRef = useRef<HTMLInputElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (focusSeq !== undefined) firstRef.current?.focus();
  }, [focusSeq]);

  useEffect(() => {
    if (!editing) return;
    fieldRef.current?.focus();
    fieldRef.current?.select();
  }, [editing]);

  const declined = repair.declined !== undefined;
  const lastSegment = (p: string): string => p.replace(/[/\\]+$/, "").split(/[/\\]/).pop() ?? p;
  // Records' repair is named by the project — their name with its
  // `-spex` dropped — and its group, the folder it last ran in
  // secondary; a folder's by the folder (space-46, DR-159).
  const named = repair.name ?? (repair.repository ? lastSegment(repair.repository) : undefined);
  const name = folderRepair
    ? recorded || repair.repository || ""
    : named !== undefined
      ? projectName(named)
      : recorded
        ? lastSegment(recorded)
        : i18n._({
            id: "these sessions",
            comment: "stands where a project name would, for sessions with no folder",
          });
  const group = folderRepair ? undefined : repair.group;

  /** Pairing is picking a folder: the records keep their key, and the
   * folders their sessions recorded ride as aliases so every session
   * under them resolves (space-47). The reader stays put. */
  const pair = async (chosen: string): Promise<void> => {
    if (!repair.repository) return;
    setBusy(true);
    setRefusal(undefined);
    try {
      const project = await rebindProject(repair.repository, chosen, repair.directories);
      const summary =
        repair.sessions > 0
          ? i18n._(
              "{name} · now a project at {path}, {count, plural, one {# session} other {# sessions}} listed",
              { name: project.name, path: project.path, count: repair.sessions },
            )
          : i18n._("{name} · now a project at {path}", {
              name: project.name,
              path: project.path,
            });
      onResolved(repair.key, summary, project.id);
    } catch (cause) {
      setRefusal((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** Remove a project whose records are missing (projects-9): there is
   * no record here to lose, so the core is told so at once. */
  const remove = async (): Promise<void> => {
    if (!repair.repository) return;
    setBusy(true);
    setRefusal(undefined);
    try {
      await removeProject(repair.repository, true);
      onResolved(
        repair.key,
        i18n._({
          id: "{path} · removed",
          values: { path: name },
          comment: "a folder repair's outcome: the project whose records were missing is removed, its folder's files kept; {path} is the folder",
        }),
      );
    } catch (cause) {
      setRefusal((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const setDeclined = async (next: boolean): Promise<void> => {
    setBusy(true);
    try {
      await decline(repair.key, next);
      if (next) {
        onNote(
          i18n._({
            id: "{name} set aside",
            values: { name },
            comment: "the live note once \"Not on this computer\" set a repair aside; {name} is the project",
          }),
        );
      }
    } catch (cause) {
      setRefusal((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // What the core found, said before any control can accept it
  // (space-53): a found folder rides "Use <folder>" itself; a missing one
  // the row's own words; what else it found as a phrase.
  const checkedRecorded = (repair.checked ?? []).find((entry) => entry.path === recorded);
  const evidence = folderRepair
    ? seat === undefined
      ? i18n._({ id: "Records not on this computer", comment: "a folder repair's evidence: the project's records are gone from this computer" })
      : i18n._({
          id: "Records not on {place}",
          values: { place: seat },
          comment: "a folder repair's evidence on a team server's Space; {place} is the server's name",
        })
    : proposal && local
      ? undefined
      : checkedRecorded?.claimedBy
        ? i18n._({
            id: "Already the project folder of {project}",
            values: { project: projectName(checkedRecorded.claimedBy) },
            comment: "a repair's evidence: the folder it last ran in is another project's; {project} is that project",
          })
        : checkedRecorded?.here && !checkedRecorded.repo
          ? i18n._({ id: "That folder is not a Git repository", comment: "a repair's evidence: the folder it last ran in is here but holds no Git repository" })
          : undefined;

  const refusalLine = refusal ? (
    <span role="alert" className="text-xs text-red-600 dark:text-red-400">
      {refusal}
    </span>
  ) : null;

  // The first control the row offers takes focus when it is next
  // (space-48): "Use <folder>", else "Choose folder…", else the answer.
  const showUse = proposal !== undefined && local;
  const first = showUse ? "use" : local ? "choose" : "decline";
  const controls = folderRepair ? (
    <div className="flex flex-wrap items-center gap-2">
      {removing ? (
        <InlineConfirm
          question={i18n._({ id: "Remove this project? Its files stay.", comment: "confirm removing a project whose records are gone from this computer; its folder and files stay" })}
          confirmLabel={i18n._({ id: "Remove", comment: "confirm: remove a project whose records are gone from this computer" })}
          disabled={busy}
          onConfirm={() => {
            setRemoving(false);
            void remove();
          }}
          onCancel={() => setRemoving(false)}
        />
      ) : (
        <button
          type="button"
          ref={firstRef}
          data-testid="space-repair-remove"
          className={SECONDARY}
          disabled={disabled || busy || !repair.repository}
          onClick={() => setRemoving(true)}
        >
          {i18n._({ id: "Remove project", comment: "on a repair: remove a project whose records are missing, as the Overview tab's Remove does; its files stay" })}
        </button>
      )}
      {refusalLine}
    </div>
  ) : (
    <div className="flex flex-wrap items-center gap-2">
      {showUse && proposal ? (
        <button
          type="button"
          ref={firstRef}
          data-testid="space-repair-use"
          className={`${SECONDARY} min-w-0 max-w-full break-all text-left`}
          disabled={disabled || busy || !repair.repository}
          title={proposal.path}
          onClick={() => void pair(proposal.path)}
        >
          {busy
            ? i18n._({ id: "Adding…", comment: "a repair's control while the folder is paired with the project" })
            : i18n._({
                id: "Use {folder}",
                values: { folder: tildify(proposal.path) },
                comment: "on a repair: make the folder the core found this project's folder; {folder} is its path",
              })}
        </button>
      ) : null}
      {local ? (
        <button
          type="button"
          ref={first === "choose" ? firstRef : undefined}
          data-testid="space-repair-choose"
          className={SECONDARY}
          disabled={disabled || busy || !repair.repository}
          onClick={() => setEditing(true)}
        >
          {i18n._({ id: "Choose folder…", comment: "on a repair: name the project's folder on this computer" })}
        </button>
      ) : null}
      {!declined ? (
        <button
          type="button"
          ref={first === "decline" ? firstRef : undefined}
          data-testid="space-repair-decline"
          className={SECONDARY}
          disabled={disabled || busy}
          onClick={() => void setDeclined(true)}
        >
          {notHereAnswer(seat)}
        </button>
      ) : null}
      {refusalLine}
    </div>
  );

  const editor = (
    <div className="flex min-w-0 flex-col gap-1 rounded border border-neutral-300 p-2 dark:border-neutral-700">
      <label className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
        <span className="shrink-0 text-neutral-500">
          {i18n._({
            id: "Project folder of {name}",
            values: { name },
            comment: "the repair editor's field caption: the folder on this computer that is this project; {name} is the project",
          })}
        </span>
        <input
          ref={fieldRef}
          data-testid="space-repair-path"
          value={path}
          onChange={(event) => setPath(event.target.value)}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setEditing(false);
            }
            if (event.key === "Enter") void submit();
          }}
          spellCheck={false}
          disabled={busy}
          className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-1.5 py-0.5 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-900"
        />
        {window.spexNative ? (
          <button
            type="button"
            className={SECONDARY}
            disabled={busy}
            onClick={async () => {
              const picked = await window.spexNative!.pickDirectory();
              if (picked) setPath(picked);
            }}
          >
            {i18n._({ id: "Open folder…", comment: "the repair editor's control: opens the system folder picker" })}
          </button>
        ) : null}
      </label>
      <p className="text-xs text-neutral-500">
        {i18n._({
          id: "Kept on this computer only; never synced",
          comment: "the repair editor's note: where a project's folder is, is recorded on this computer alone and never syncs",
        })}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" data-testid="space-repair-submit" className={SECONDARY} disabled={busy} onClick={() => void submit()}>
          {busy
            ? i18n._({ id: "Adding…", comment: "a repair's control while the folder is paired with the project" })
            : i18n._({ id: "Use this folder", comment: "the repair editor's control: make the folder named the project's folder" })}
        </button>
        <button type="button" className={SECONDARY} disabled={busy} onClick={() => setEditing(false)}>
          {i18n._({ id: "Cancel", comment: "leave the editor without changing anything" })}
        </button>
        {refusalLine}
      </div>
    </div>
  );

  // One whole message per case, "set aside" after the fact where the
  // reader declined it (space-55, localization-4).
  const state = declined ? "aside" : "open";
  const missing =
    seat === undefined
      ? group
        ? i18n._({
            id: "{state, select, aside {{project} · {group} — Folder missing on this computer · set aside} other {{project} · {group} — Folder missing on this computer}}",
            values: { project: name, group, state },
            comment: "a repair row: the project's records are here, its folder on this computer is not; {project} is the project, {group} the group holding its records; 'set aside' follows once the reader answered Not on this computer",
          })
        : i18n._({
            id: "{state, select, aside {{project} — Folder missing on this computer · set aside} other {{project} — Folder missing on this computer}}",
            values: { project: name, state },
            comment: "a repair row of a project in no group: its records are here, its folder on this computer is not; 'set aside' follows once the reader answered Not on this computer",
          })
      : group
        ? i18n._({
            id: "{state, select, aside {{project} · {group} — Folder missing on {place} · set aside} other {{project} · {group} — Folder missing on {place}}}",
            values: { project: name, group, place: seat, state },
            comment: "a repair row on a team server's Space; {project} is the project, {group} the group holding its records, {place} the server's name; 'set aside' follows once the reader answered Not on the server",
          })
        : i18n._({
            id: "{state, select, aside {{project} — Folder missing on {place} · set aside} other {{project} — Folder missing on {place}}}",
            values: { project: name, place: seat, state },
            comment: "a repair row of a project in no group on a team server's Space; {place} is the server's name; 'set aside' follows once the reader answered Not on the server",
          });

  return (
    <li
      data-testid={declined ? "space-repair-declined" : "space-repair"}
      data-kind={repair.kind}
      className={`flex min-w-0 flex-col gap-1${declined ? " text-neutral-500" : ""}`}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {/* The row's condition by mark, by word and by weight, named for
            assistive technology (space-55). */}
        <span>
          <span aria-hidden>{declined ? "○" : "●"}</span>
          <span className="sr-only">
            {declined
              ? i18n._({ id: "Set aside", comment: "a repair's condition, for assistive technology: the reader answered that it is not kept here" })
              : i18n._({ id: "To fix", comment: "a repair's condition, for assistive technology: it waits for an answer" })}
          </span>
        </span>
        <span data-testid="space-repair-title" className="min-w-0 flex-1">
          {folderRepair ? (
            <span className="font-mono text-xs">{name}</span>
          ) : (
            <span className={declined ? "" : "font-medium"}>{missing}</span>
          )}
        </span>
      </div>
      {!folderRepair && recorded ? (
        // The folder it last ran in, secondary (space-46).
        <p data-testid="space-repair-folder" className="min-w-0 truncate pl-5 text-xs text-neutral-500" title={recorded}>
          <span className="font-mono">{tildify(recorded)}</span>
          {repair.sessions > 0
            ? i18n._({
                id: " · {count, plural, one {# session ran there} other {# sessions ran there}}",
                values: { count: repair.sessions },
                comment: "follows the folder a repair remembers: how many sessions ran in it",
              })
            : ""}
        </p>
      ) : null}
      {!declined && evidence ? <p className="text-xs text-neutral-500">{evidence}</p> : null}
      {/* The editor opens from "Choose folder…" alone, which a remote
          place never offers. */}
      {editing ? editor : controls}
    </li>
  );

  function submit(): void {
    const chosen = path.trim();
    if (!chosen) {
      setRefusal(i18n._({ id: "Name a folder", comment: "the repair editor's refusal of an empty path" }));
      return;
    }
    void pair(chosen);
  }
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
    <li data-testid="space-repair-resolved" className="flex min-w-0 flex-wrap items-center gap-2">
      <span>
        <span aria-hidden>✓</span>
        <span className="sr-only">{i18n._({ id: "Fixed", comment: "a repair's condition, for assistive technology: answered and resolved" })}</span>
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

/** One row's place in the list: a repair keeps its place as it changes
 * condition, its outcome taking the same one. */
const issueRowId = (entry: IssueEntry): string =>
  entry.repair ? `repair:${entry.repair.key}` : `diagnostic:${entry.file}:${entry.reason}`;
const outcomeRowId = (key: string): string => `repair:${key}`;

/**
 * What needs fixing (space-1, space-46..space-55): every repair the core
 * folded and every problem no repair folds, under "To fix (<n>) · <m> set
 * aside". It opens from the header's "⚠ <n> to fix", and stands by
 * itself while a blocking problem does.
 */
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

  // The core carries the count (space-1): what the reader has not
  // answered. Rows he has set aside stand on, quietly.
  const issueCount = groups.issues;
  const declinedCount = groups.diagnostics.filter((entry) => entry.repair?.declined !== undefined).length;
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
    // What the header will count: the other unanswered repairs, and
    // every problem no repair folds (space-1).
    const left = state.diagnostics.filter((entry) => !entry.repair || unanswered(entry)).length;
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
    onNote(
      left
        ? i18n._({
            id: "{count} left to fix.",
            values: { count: left },
            comment: "the live note once a repair is fixed: how many still wait for an answer",
          })
        : i18n._({ id: "Nothing left to fix.", comment: "the live note once the last repair waiting for an answer is fixed" }),
    );
  };
  const focusSeq = (id: string): number | undefined => (focusTo?.id === id ? focusTo.seq : undefined);

  if (!listOpen) return null;
  const title = i18n._({ id: "To fix", comment: "the accessible name of the Space surface's list of what needs fixing" });
  return (
    <section
      data-testid="space-issues-list"
      aria-label={title}
      // Amber is attention. With nothing unanswered there is none to
      // pay, so the card stands neutral and the rows stay readable
      // (space-55).
      className={`flex flex-col gap-1 rounded-lg border p-3 text-sm ${
        issueCount > 0
          ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950"
          : "border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900"
      }`}
    >
      <h2
        data-testid="space-issues-heading"
        className={`text-xs font-medium ${issueCount > 0 ? "text-amber-800 dark:text-amber-200" : "text-neutral-500"}`}
      >
        {i18n._({
          id: "{declined, plural, =0 {To fix ({count})} other {To fix ({count}) · # set aside}}",
          values: { count: issueCount, declined: declinedCount },
          comment: "the heading of the list of what needs fixing: {count} wait for an answer; '# set aside' counts the repairs the reader answered Not on this computer",
        })}
      </h2>
      <ul className="flex flex-col gap-1">
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
          return (
            <li key={id} className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="min-w-0 truncate font-mono text-xs" title={entry.file}>
                {entry.file}
              </span>
              <span className="min-w-0 flex-1">— {entry.reason}</span>
              {entry.blocking ? (
                <span className="shrink-0 rounded-full border border-current px-1.5 text-xs">
                  {i18n._({ id: "blocking", comment: "mark on a problem that stops a sync" })}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
