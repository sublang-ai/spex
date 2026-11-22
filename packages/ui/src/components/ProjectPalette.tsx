// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { useEffect, useRef, useState } from "react";
import type {
  SpaceState,
  ProjectInfo,
  RepositoryState,
  SessionInfo,
} from "@sublang/spex-core/protocol";

import {
  ATTENTION_MARK_CLASS,
  ATTENTION_RANK,
  type AttentionItem,
} from "../state/dashboard.js";
import { useAppStore } from "../state/store.js";
import { i18n } from "../i18n.js";
import { anySignedIn, instanceNameAt, instanceOf } from "../lib/instances.js";
import { projectName } from "../lib/space.js";
import { Icon } from "./Icon.js";
import { PanelCloseButton } from "./PanelCloseButton.js";

/** A refusal as the palette shows it: the core's words, and Git's own
 * output where the core relayed it beside them (projects-34). */
interface Refusal {
  message: string;
  detail?: string;
}

function refusalOf(cause: unknown): Refusal {
  const message = cause instanceof Error ? cause.message : String(cause);
  // The relayed output travels as the refusal's detail, apart from the
  // words (core-service-111), so nothing the tool said is lost.
  const output = (cause as { details?: { output?: unknown } } | undefined)?.details?.output;
  return typeof output === "string" && output.trim() ? { message, detail: output } : { message };
}

interface PaletteJoin {
  instance: string;
  repo: RepositoryState;
  opening: boolean;
  again: boolean;
}

function joinable(space: SpaceState | undefined): PaletteJoin[] {
  if (!space) return [];
  return space.repositories.flatMap((repo) => {
    if (repo.own || repo.id === null || !repo.instance || !instanceOf(space, repo.instance)?.signedIn) return [];
    const opening = repo.sync.phase === "running" && repo.sync.op === "join";
    const again = repo.sync.phase === "stopped" && repo.sync.op === "join";
    return repo.state === "absent" ? [{ instance: repo.instance, repo, opening, again }] : [];
  });
}

function joinKeyOf(entry: PaletteJoin): string {
  return entry.repo.key;
}

const openHereLabel = (): string => i18n._("Open here");

function projectNameOf(repo: RepositoryState): string {
  return projectName(repo.name);
}

export interface ProjectPaletteProps {
  projects: ProjectInfo[];
  sessions: SessionInfo[];
  /** The one ledger-fed attention map every surface shares
   * (dashboard-9, DR-066) — the palette derives no count of its own. */
  attention: Map<string, AttentionItem>;
  currentProjectId?: string;
  onPickFolder?: () => Promise<string | null>;
  onPick: (projectId: string) => void;
  onOpened?: (projectId: string) => void;
  /** Register an existing repository by path (store's addProjectByPath). */
  onAddPath: (path: string) => Promise<ProjectInfo>;
  onCreatePath: (path: string, scaffold: boolean) => Promise<ProjectInfo>;
  /** Opened from a project-add action: lead with folder selection,
   * keeping project switching and the Academy choice out of this form. */
  addProjectOnly?: boolean;
  spaceFirst?: boolean;
  onClose: () => void;
}

interface ProjectRowState {
  running: number;
  attention: number;
  worst?: AttentionItem["kind"];
}

/** Each project's running and attention counts at one place, from that
 * place's own sessions and attention. */
function rowStates(
  projects: readonly ProjectInfo[],
  sessions: readonly SessionInfo[],
  attentionMap: Map<string, AttentionItem>,
): Map<string, ProjectRowState> {
  const attention = [...attentionMap.values()];
  const byProject = new Map<string, ProjectRowState>();
  for (const project of projects) {
    byProject.set(project.id, { running: 0, attention: 0 });
  }
  for (const session of sessions) {
    if (!session.live) continue;
    const row = byProject.get(session.projectId);
    if (row) row.running += 1;
  }
  for (const item of attention) {
    const session = sessions.find((s) => s.id === item.sessionId);
    const row = session && byProject.get(session.projectId);
    if (!row) continue;
    row.attention += 1;
    if (!row.worst || ATTENTION_RANK[item.kind] < ATTENTION_RANK[row.worst]) {
      row.worst = item.kind;
    }
  }
  return byProject;
}

const ROW_ACTIVE = "bg-neutral-100 dark:bg-neutral-800";

/** The folder a personal project opens into on this computer, named in
 * place beneath its row where the shell offers no picker, as its Space
 * row asks it (space-63): the path, the act and Cancel, Escape
 * cancelling it alone, a refusal kept beside the path. */
function JoinFolder({
  testId,
  label,
  onSubmit,
  onCancel,
}: {
  testId: string;
  label: string;
  onSubmit(folder: string): Promise<void>;
  onCancel(): void;
}) {
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string>();
  const fieldRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    fieldRef.current?.focus();
  }, []);

  const submit = async (): Promise<void> => {
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
      setRefusal(cause instanceof Error ? cause.message : String(cause));
      fieldRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid={testId}
      className="mx-4 mb-1 flex flex-col gap-1.5 rounded border border-neutral-300 p-2 dark:border-neutral-700"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <label className="text-xs text-neutral-500 dark:text-neutral-400" htmlFor={`${testId}-path`}>
        {label}
      </label>
      <div className="flex gap-1.5">
        <input
          id={`${testId}-path`}
          ref={fieldRef}
          data-testid={`${testId}-path`}
          value={path}
          onChange={(event) => setPath(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
          }}
          spellCheck={false}
          disabled={busy}
          className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-2 py-1 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-950"
        />
        <button
          type="button"
          data-testid={`${testId}-open`}
          disabled={busy}
          onClick={() => void submit()}
          className="shrink-0 rounded border border-brand-300 px-2 py-1 text-xs text-brand-600 disabled:opacity-40 dark:border-brand-800 dark:text-brand-300"
        >
          {busy
            ? i18n._({ id: "Opening…", comment: "a project from a Space while it opens: its records and code are downloaded" })
            : i18n._({
                id: "Open here",
                comment: "project palette: open a personal project on this computer, downloading its records and code into the folder named beside",
              })}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="shrink-0 rounded border border-neutral-300 px-2 py-1 text-xs disabled:opacity-40 dark:border-neutral-700"
        >
          {i18n._({ id: "Cancel", comment: "leave the editor without changing anything" })}
        </button>
      </div>
      {refusal ? (
        <p role="alert" data-testid={`${testId}-error`} className="text-xs text-red-600 dark:text-red-400">
          {refusal}
        </p>
      ) : null}
    </div>
  );
}

/** The controls Tab walks inside the dialog, in document order. */
const FOCUSABLE = "button, input, select";

export function ProjectPalette(props: ProjectPaletteProps) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [pathDraft, setPathDraft] = useState("");
  const [newPathDraft, setNewPathDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [scaffold, setScaffold] = useState(true);
  const [busy, setBusy] = useState(false);
  /** The group's project being opened, by its row's key. */
  const [joining, setJoining] = useState<string>();
  /** This computer's row asking for its folder in place, by its key,
   * where the shell offers no picker (space-63). */
  const [asking, setAsking] = useState<string>();
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const sectionRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<Refusal>();
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const pathRef = useRef<HTMLInputElement>(null);
  const newPathRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<Element | null>(null);
  // Academy seeding (DR-015) lives on the store: registration and
  // project selection happen there, the palette only offers the row.
  const openAcademyExample = useAppStore((state) => state.openAcademyExample);
  const space = useAppStore((state) => state.space);
  const loadSpace = useAppStore((state) => state.loadSpace);
  const spaceJoin = useAppStore((state) => state.spaceJoin);
  const connected = useAppStore((state) => state.connection === "open");
  useEffect(() => {
    if (connected && !props.addProjectOnly) void loadSpace();
  }, [connected, loadSpace, props.addProjectOnly]);
  // With no project registered, the ordinary switcher has no filter;
  // the explicit add form works with or without registered projects.
  const empty = props.projects.length === 0;
  const addProjectOnly = props.addProjectOnly === true;
  const hasFolderPicker = Boolean(props.onPickFolder);

  // The palette owns focus while open and hands it back on close.
  useEffect(() => {
    openerRef.current = document.activeElement;
    ((addProjectOnly || empty) && hasFolderPicker
      ? folderRef.current
      : empty
        ? pathRef.current
        : searchRef.current)?.focus();
    return () => {
      (openerRef.current as HTMLElement | null)?.focus?.();
    };
    // The opening state decides where focus lands; later renders
    // must not steal it back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (creating) newPathRef.current?.focus();
    else if (addProjectOnly && hasFolderPicker) folderRef.current?.focus();
    else if (addProjectOnly) pathRef.current?.focus();
  }, [creating, addProjectOnly, hasFolderPicker]);

  const states = rowStates(props.projects, props.sessions, props.attention);
  const search = query.trim().toLowerCase();
  const filtered = props.projects
    .filter((project) => project.name.toLowerCase().includes(search) || project.path.toLowerCase().includes(search))
    .map((project) => ({ project, state: states.get(project.id), current: project.id === props.currentProjectId }));
  const signedIn = anySignedIn(space);
  const joinRows = joinable(space).filter((entry) =>
    projectNameOf(entry.repo).toLowerCase().includes(search) ||
    instanceNameAt(space, entry.instance).toLowerCase().includes(search));
  const lead = empty && !addProjectOnly ? 1 : 0;
  const joinStart = lead + filtered.length;
  const entryCount = joinStart + joinRows.length + (props.onPickFolder ? 1 : 0);
  const clamped = Math.min(index, Math.max(0, entryCount - 1));
  const openFolderIndex = joinStart + joinRows.length;

  // Opened at "From your Spaces" (run-view-172): the section in view
  // and, once it lists a project, its first one highlighted and focused
  // — until the reader moves elsewhere first.
  const landing = useRef(props.spaceFirst);
  const landingRow = landing.current ? joinRows[0] : undefined;
  const landingKey = landingRow ? joinKeyOf(landingRow) : undefined;
  useEffect(() => {
    const at = landing.current;
    if (!at) return;
    sectionRef.current?.scrollIntoView?.({ block: "nearest" });
    if (!landingRow || !landingKey) return;
    landing.current = false;
    setIndex(joinStart + joinRows.indexOf(landingRow));
    rowRefs.current.get(landingKey)?.focus();
    // The row that lands is the input; it is read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landingKey]);

  function pick(projectId: string): void {
    props.onPick(projectId);
    props.onClose();
  }

  async function runAdd(create: boolean): Promise<void> {
    const path = (create && addProjectOnly ? newPathDraft : pathDraft).trim();
    if (!path || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      if (create) {
        pick((await props.onCreatePath(path, scaffold)).id);
      } else {
        pick((await props.onAddPath(path)).id);
      }
    } catch (cause) {
      setError(refusalOf(cause));
    } finally {
      setBusy(false);
    }
  }

  async function runAcademy(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      // A typed path becomes the example's target; else the store's
      // default. The core expands ~ like any typed path.
      const project = await openAcademyExample(pathDraft.trim() || undefined);
      pick(project.id);
    } catch (cause) {
      setError(refusalOf(cause));
    } finally {
      setBusy(false);
    }
  }

  /** Send a personal project's join to this computer's core: `space.join`
   * naming its instance and host id with `folder`, as its Space row's
   * Join sends it (space-63). Accepted, the project becomes this
   * computer's current one and the palette closes, the join reporting
   * on its Space row (space-63); a refusal is thrown to the caller. */
  async function sendJoin(entry: PaletteJoin, folder: string): Promise<void> {
    if (entry.repo.id === null) return;
    setBusy(true);
    setJoining(joinKeyOf(entry));
    setError(undefined);
    try {
      await spaceJoin(entry.instance, entry.repo.id, folder);
      props.onOpened?.(entry.repo.key);
      props.onClose();
    } finally {
      setBusy(false);
      setJoining(undefined);
    }
  }

  /** Open a personal project on this computer (run-view-168): into the
   * folder the act's own picker takes — the shell's picker, else a path
   * named in place beneath the row (space-63). A refusal stands in the
   * palette. */
  async function runJoin(entry: PaletteJoin): Promise<void> {
    if (busy || entry.opening || entry.repo.id === null) return;
    if (!props.onPickFolder) {
      setError(undefined);
      setAsking(joinKeyOf(entry));
      return;
    }
    const folder = await props.onPickFolder();
    if (!folder) return;
    try {
      await sendJoin(entry, folder);
    } catch (cause) {
      setError(refusalOf(cause));
    }
  }

  function openFolder(): void {
    void props.onPickFolder?.().then((path) => {
      if (!path) return;
      setBusy(true);
      setError(undefined);
      props
        .onAddPath(path)
        .then((project) => pick(project.id))
        .catch((cause: unknown) => setError(refusalOf(cause)))
        .finally(() => setBusy(false));
    });
  }

  /** Enter on the highlighted entry. */
  function activate(at: number): void {
    if (lead === 1 && at === 0) {
      void runAcademy();
      return;
    }
    const row = filtered[at - lead];
    const join = at >= joinStart ? joinRows[at - joinStart] : undefined;
    if (row) pick(row.project.id);
    else if (join) void runJoin(join);
    else if (props.onPickFolder && at === openFolderIndex) openFolder();
  }

  /** Arrow keys move the highlight from either input. */
  function moveHighlight(event: React.KeyboardEvent): boolean {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") landing.current = false;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIndex((i) => (entryCount === 0 ? 0 : (i + 1) % entryCount));
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIndex((i) =>
        entryCount === 0 ? 0 : (i - 1 + entryCount) % entryCount,
      );
      return true;
    }
    return false;
  }

  function searchKeydown(event: React.KeyboardEvent): void {
    if (moveHighlight(event)) return;
    if (event.key === "Enter") {
      event.preventDefault();
      activate(clamped);
    }
  }

  function pathKeydown(event: React.KeyboardEvent): void {
    if (!addProjectOnly && moveHighlight(event)) return;
    if (event.key === "Enter") {
      event.preventDefault();
      // A typed path adds; an empty field hands Enter to the
      // highlighted row, so the zero-state is one keystroke deep.
      if (pathDraft.trim()) void runAdd(false);
      else if (!addProjectOnly) activate(clamped);
    }
  }

  const close = props.onClose;
  const closeButton = <PanelCloseButton data-testid="palette-close" onClick={close} />;

  /** The dialog's own keys: Escape closes from anywhere inside it,
   * and Tab wraps so focus never leaves it (DR-010 §6). */
  function dialogKeydown(event: React.KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const nodes = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
    ).filter((node) => !node.matches(":disabled"));
    if (nodes.length === 0) {
      event.preventDefault();
      return;
    }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    } else if (!dialogRef.current?.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  }

  const academyHint = pathDraft.trim()
    ? i18n._("— seeds {path}", { path: pathDraft.trim() })
    : empty
      ? i18n._("— a sample project with specs, ready to run")
      : i18n._("— seeds a sample project");

  const refusal = error ? (
    <div
      data-testid="palette-error"
      className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
    >
      {error.message}
      {error.detail ? (
        <pre
          data-testid="palette-error-detail"
          className="mt-1 max-h-[min(6rem,12vh)] overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] text-red-800/80 dark:text-red-300/80"
        >
          {error.detail}
        </pre>
      ) : null}
    </div>
  ) : null;

  return (
    <div
      data-testid="project-palette"
      // The gap above the dialog is a proportion of a tall window and
      // a fixed inch of a short one, and the overlay's padding is the
      // dialog's height budget (DR-041 §9): a fixed overlay grows past
      // the window with nothing able to scroll to what it hides.
      className="fixed inset-0 z-30 flex items-start justify-center bg-black/20 p-4 pt-[min(18vh,4rem)]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={
          addProjectOnly || empty ? i18n._("Add a project") : i18n._("Choose a project")
        }
        onKeyDown={dialogKeydown}
        className="flex max-h-full w-[28rem] max-w-[90vw] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
      >
        {addProjectOnly ? (
          <>
          <header className="flex shrink-0 items-start justify-between gap-3 px-4 pt-4">
            <h2 className="min-w-0 flex-1 text-base font-semibold text-neutral-900 dark:text-neutral-100">
              {i18n._("Add a local project")}
            </h2>
            {closeButton}
          </header>
          <div data-testid="palette-own-project" className="min-h-0 overflow-y-auto p-4 pt-0">
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {i18n._("Add an existing Git repository or create a new project.")}
            </p>

            <div className="mt-5">
              <h3 className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">
                {i18n._("Existing project")}
              </h3>
              {props.onPickFolder ? (
                <button
                  ref={folderRef}
                  type="button"
                  data-testid="palette-open-folder"
                  disabled={busy}
                  onClick={openFolder}
                  className="mt-2 flex w-full items-center gap-2 rounded-lg border border-neutral-300 bg-neutral-50 px-4 py-3 text-left text-sm font-medium text-neutral-900 hover:border-brand-400 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
                >
                  <Icon name="folder" className="h-4 w-4" />
                  {i18n._("Choose a project folder…")}
                </button>
              ) : null}
              {!props.onPickFolder && creating ? (
                <button
                  type="button"
                  data-testid="palette-manual-path-start"
                  onClick={() => {
                    setCreating(false);
                    setError(undefined);
                  }}
                  className="mt-3 text-left text-xs font-medium text-neutral-600 hover:text-brand-700 hover:underline dark:text-neutral-300"
                >
                  {i18n._("Or enter an existing Git repository path")}
                </button>
              ) : null}
              {!props.onPickFolder && !creating ? (
                <div className="mt-3">
                  <label className="block text-xs text-neutral-500 dark:text-neutral-400" htmlFor="palette-own-path">
                    {i18n._("Path to an existing Git repository")}
                  </label>
                  <div className="mt-1.5 flex gap-2">
                    <input
                      id="palette-own-path"
                      ref={pathRef}
                      data-testid="palette-path"
                      aria-label={i18n._("Project path")}
                      value={pathDraft}
                      onChange={(event) => setPathDraft(event.target.value)}
                      onKeyDown={pathKeydown}
                      placeholder={i18n._("/path/to/existing-project")}
                      className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-neutral-700 dark:bg-neutral-950"
                    />
                    <button
                      type="button"
                      data-testid="palette-add"
                      disabled={!pathDraft.trim() || busy}
                      onClick={() => void runAdd(false)}
                      title={i18n._("Add this project")}
                      className="rounded-md border border-brand-300 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-40 dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-950"
                    >
                      {i18n._({ id: "Add", comment: "register the typed path as an existing repository" })}
                    </button>
                  </div>
                  {i18n._("No other projects in your Spaces") }
                </div>
              ) : null}
            </div>

            <div className="mt-5 border-t border-neutral-200 pt-4 dark:border-neutral-800">
              <h3 className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">
                {i18n._("New project")}
              </h3>
              {!creating ? (
                <button
                  type="button"
                  data-testid="palette-create-start"
                  onClick={() => {
                    setError(undefined);
                    setCreating(true);
                  }}
                  className="mt-2 text-left text-sm font-medium text-brand-700 hover:underline dark:text-brand-300"
                >
                  {i18n._("Create a new project…")}
                </button>
              ) : (
                <div className="mt-2 flex flex-col gap-2">
                  <label className="text-xs text-neutral-500 dark:text-neutral-400" htmlFor="palette-new-path">
                    {i18n._("New folder path")}
                  </label>
                  <input
                    id="palette-new-path"
                    ref={newPathRef}
                    data-testid="palette-new-path"
                    aria-label={i18n._("New project path")}
                    value={newPathDraft}
                    onChange={(event) => setNewPathDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        if (newPathDraft.trim()) void runAdd(true);
                      }
                    }}
                    placeholder={i18n._("/path/to/new-project")}
                    className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-neutral-700 dark:bg-neutral-950"
                  />
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {i18n._("Spex will create this folder and set up Git.")}
                  </p>
                  <label className="flex items-center gap-1.5 text-xs text-neutral-500">
                    <input type="checkbox" checked={scaffold} onChange={(event) => setScaffold(event.target.checked)} />
                    {i18n._("Add starter specs when creating")}
                  </label>
                  <button
                    type="button"
                    data-testid="palette-create"
                    disabled={!newPathDraft.trim() || busy}
                    onClick={() => void runAdd(true)}
                    title={i18n._("Create a new repository at this path")}
                    className="self-start rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800"
                  >
                    {i18n._("Create project")}
                  </button>
                </div>
              )}
            </div>
          </div>
          {refusal ? (
            <div className="shrink-0 border-t border-neutral-200 p-4 dark:border-neutral-800">
              {refusal}
            </div>
          ) : null}
          </>
        ) : (
        <>
        {empty ? (
          <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-2">
            <h2 className="min-w-0 flex-1 text-sm font-medium">{i18n._("Add a project")}</h2>
            {closeButton}
          </header>
        ) : (
          <header className="flex shrink-0 items-center gap-2 border-b border-neutral-200 pr-2 dark:border-neutral-800">
          <input
            ref={searchRef}
            data-testid="palette-search"
            aria-label={i18n._("Filter projects")}
            value={query}
            onChange={(event) => {
              landing.current = false;
              setQuery(event.target.value);
              setIndex(0);
            }}
            onKeyDown={searchKeydown}
            placeholder={i18n._("Switch to a project…")}
            className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm outline-none"
          />
          {closeButton}
          </header>
        )}
        {/* The list is what yields inside the dialog's bound: the
            path row, its options, and a failure message keep their
            place at every window height (projects-30). */}
        <div className="relative min-h-0 flex-1 overflow-y-auto py-1">
          {empty && !addProjectOnly ? (
            <button
              type="button"
              data-testid="palette-academy"
              disabled={busy}
              onClick={() => void runAcademy()}
              className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-brand-600 hover:bg-neutral-50 disabled:opacity-40 dark:text-brand-300 dark:hover:bg-neutral-800 ${
                clamped === 0 ? ROW_ACTIVE : ""
              }`}
            >
              <Icon name="book" className="h-3.5 w-3.5" />
              {busy
                ? i18n._({
                    id: "Seeding…",
                    comment: "busy: the Academy example is being written to disk",
                  })
                : i18n._("Try the Academy example")}
              <span className="text-xs text-neutral-500">{academyHint}</span>
            </button>
          ) : null}
          {filtered.map((entry, i) => {
            const { project, state: row } = entry;
            const key = project.id;
            return (
              <div key={key} className="flex items-center pr-2">
              <button
                type="button"
                data-testid={`palette-project-${key}`}
                title={project.path}
                onClick={() => pick(project.id)}
                className={`flex min-w-0 flex-1 items-center gap-2 px-4 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 ${
                  i + lead === clamped ? ROW_ACTIVE : ""
                }`}
              >
                <Icon name="folder" className="h-3.5 w-3.5 text-neutral-500" />
                <span className="truncate">{project.name}</span>
                {entry.current ? (
                  <span className="text-xs text-neutral-500">
                    {i18n._({
                      id: "current",
                      comment: "tag on the project row the workspace is on",
                    })}
                  </span>
                ) : null}
                <span className="ml-auto flex items-center gap-2 text-xs text-neutral-500">
                  {row && row.attention > 0 ? (
                    <span
                      className={`flex items-center gap-1 font-medium ${
                        row.worst === "failure"
                          ? "text-red-600 dark:text-red-400"
                          : "text-amber-700 dark:text-amber-300"
                      }`}
                      title={i18n._(
                        "{count, plural, one {# session needs you} other {# sessions need you}}",
                        { count: row.attention },
                      )}
                    >
                      <span
                        aria-hidden
                        className={`h-2 w-2 rounded-full ${ATTENTION_MARK_CLASS[row.worst!]}`}
                      />
                      {i18n._(
                        "{count, plural, one {# needs you} other {# need you}}",
                        { count: row.attention },
                      )}
                    </span>
                  ) : null}
                  {row && row.running > 0 ? (
                    <span
                      className="flex items-center gap-1"
                      title={i18n._(
                        "{count, plural, one {# running session} other {# running sessions}}",
                        { count: row.running },
                      )}
                    >
                      <span
                        aria-hidden
                        className="h-2 w-2 animate-pulse rounded-full bg-emerald-500"
                      />
                      {i18n._("{count} running", { count: row.running })}
                    </span>
                  ) : null}
                </span>
              </button>
              </div>
            );
          })}
          {filtered.length === 0 && query ? (
            <div className="px-4 py-2 text-sm text-neutral-500">
              {i18n._('No project matches "{query}"', { query })}
            </div>
          ) : null}
          {signedIn ? (
            <div
              ref={sectionRef}
              role="group"
              data-testid="palette-spaces"
              aria-labelledby="palette-spaces-heading"
              className="border-t border-neutral-100 py-1 dark:border-neutral-800"
            >
              <div
                id="palette-spaces-heading"
                data-testid="palette-spaces-heading"
                className="px-4 py-1 text-xs font-medium text-neutral-500"
              >
                {i18n._("From your Spaces")}
              </div>
              {joinRows.map((entry) => {
                const key = joinKeyOf(entry);
                const at = joinStart + joinRows.indexOf(entry);
                return (
                  <div key={key}>
                    <div className="flex items-center pr-2">
                    <button
                      ref={(node) => {
                        if (node) rowRefs.current.set(key, node);
                        else rowRefs.current.delete(key);
                      }}
                      type="button"
                      data-testid={entry.again ? `palette-join-again-${key}` : `palette-join-${key}`}
                      disabled={busy || entry.opening}
                      aria-expanded={props.onPickFolder ? undefined : asking === key}
                      onClick={() => void runJoin(entry)}
                      className={`flex min-w-0 flex-1 items-center gap-2 px-4 py-2 text-left text-sm hover:bg-neutral-50 disabled:opacity-60 dark:hover:bg-neutral-800 ${
                        at === clamped ? ROW_ACTIVE : ""
                      }`}
                    >
                      <Icon name="plus" className="h-3.5 w-3.5 text-neutral-500" />
                      <span className="truncate">{projectNameOf(entry.repo)}</span>
                      <span className="min-w-0 shrink truncate text-xs text-neutral-500">
                        {instanceNameAt(space, entry.instance)}
                      </span>
                      {joining === key || entry.opening ? (
                        <span className="ml-auto shrink-0 text-xs text-neutral-500">
                          {i18n._({ id: "Opening…", comment: "a project from a Space while it opens: its records and code are downloaded" })}
                        </span>
                      ) : entry.again ? (
                        // Its open stopped: the row sends it again.
                        <span className="ml-auto shrink-0 text-xs text-neutral-500">
                          {i18n._({
                            id: "Try again",
                            comment: "on a project from a Space whose open stopped: open it again",
                          })}
                        </span>
                      ) : (
                        // The row is this computer's entry of its Open
                        // (space-111, run-view-168): it reads "Open here".
                        <span className="ml-auto shrink-0 text-xs text-neutral-500">{openHereLabel()}</span>
                      )}
                    </button>
                    </div>
                    {asking === key ? (
                      <JoinFolder
                        testId={`palette-join-folder-${key}`}
                        label={i18n._("Project folder")}
                        onSubmit={(folder) => sendJoin(entry, folder)}
                        onCancel={() => {
                          setAsking(undefined);
                          rowRefs.current.get(key)?.focus();
                        }}
                      />
                    ) : null}
                  </div>
                );
              })}
              {joinRows.length === 0 && !query ? (
                <div data-testid="palette-spaces-note" className="px-4 py-1 text-xs text-neutral-500">
                </div>
              ) : null}
            </div>
          ) : null}
          {props.onPickFolder ? (
            <button
              type="button"
              data-testid="palette-open-folder"
              ref={folderRef}
              onClick={openFolder}
              disabled={busy}
              className={`flex w-full items-center gap-2 border-t border-neutral-100 px-4 py-2 text-left text-sm text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800 ${
                clamped === openFolderIndex ? ROW_ACTIVE : ""
              }`}
            >
              {i18n._("Open folder…")}
            </button>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5 border-t border-neutral-200 p-2 dark:border-neutral-800">
          {!hasFolderPicker ? (
          <>
          <div className="flex gap-1.5">
            <input
              ref={pathRef}
              data-testid="palette-path"
              aria-label={i18n._("Project path")}
              value={pathDraft}
              onChange={(event) => setPathDraft(event.target.value)}
              onKeyDown={pathKeydown}
              placeholder={
                empty
                  ? i18n._("Add a project by path…")
                  : i18n._("~/path — add an existing repo or create new")
              }
              className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-950"
            />
            <button
              type="button"
              data-testid="palette-add"
              disabled={!pathDraft.trim() || busy}
              onClick={() => void runAdd(false)}
              title={i18n._("Add this project")}
              className="rounded border border-brand-300 px-2 py-1 text-xs text-brand-600 disabled:opacity-40 dark:border-brand-800 dark:text-brand-300"
            >
              {i18n._({
                id: "Add",
                comment: "register the typed path as an existing repository",
              })}
            </button>
            <button
              type="button"
              data-testid="palette-create"
              disabled={!pathDraft.trim() || busy}
              onClick={() => void runAdd(true)}
              title={i18n._("Create a new repository at this path")}
              className="rounded border border-neutral-300 px-2 py-1 text-xs disabled:opacity-40 dark:border-neutral-700"
            >
              {i18n._({
                id: "Create",
                comment: "start a new repository at the typed path",
              })}
            </button>
          </div>
          {pathDraft.trim() ? (
            <label className="flex items-center gap-1.5 px-0.5 text-xs text-neutral-500">
              <input
                type="checkbox"
                checked={scaffold}
                onChange={(event) => setScaffold(event.target.checked)}
              />
              {i18n._("Add starter specs when creating")}
            </label>
          ) : null}
          </>
          ) : null}
          {empty ? null : (
            <button
              type="button"
              data-testid="palette-academy"
              disabled={busy}
              onClick={() => void runAcademy()}
              className="flex items-center gap-1.5 rounded px-0.5 py-0.5 text-left text-xs text-brand-600 hover:underline disabled:opacity-40 dark:text-brand-300"
            >
              {i18n._("Try the Academy example")}
              <span className="text-xs text-neutral-500">{academyHint}</span>
            </button>
          )}
          {refusal}
        </div>
        </>
        )}
      </div>
    </div>
  );
}
