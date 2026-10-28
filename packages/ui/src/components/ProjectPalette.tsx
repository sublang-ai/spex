// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The project palette (DR-011): a centered command palette that is
// the one place projects are chosen, added, and created. Rows carry
// each project's live state so quiet runs in other projects stay one
// keystroke away. With nothing registered there is nothing to filter,
// so the palette opens as an add flow: the path field focused and the
// Academy example leading its ordinary list (projects-22). The welcome
// page and sidebar's add route lead with the native folder picker and
// keep creating a new project separate (projects-42). The palette owns
// focus while open — Tab wraps inside it and Escape closes from
// anywhere in it — and returns focus to the opener with any draft
// intact (run-view-42). Where any seat is open, the palette lists
// every place's projects, each naming its place, and names the place a
// project added here lands at (run-view-168). Every place lists the
// projects of the member's groups it lacks, under "From your groups" for
// this computer and "From your groups on <server>" for each seat
// (run-view-168, DR-159): one on this computer is opened into the
// folder the act's own picker takes — the shell's picker, else a path
// named in place — as its Space row's Join is (space-63); one at a seat
// with no folder picked or typed, its core allocating the folder
// (run-view-169, space-103).

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  GroupsState,
  InstanceGroupState,
  ProjectInfo,
  RepositoryState,
  SessionInfo,
} from "@sublang/spex-core/protocol";

import {
  ATTENTION_MARK_CLASS,
  ATTENTION_RANK,
  type AttentionItem,
} from "../state/dashboard.js";
import { LOCAL_PLACE, LOCAL_PLACE_KEY, placeLabel, useAppStore } from "../state/store.js";
import { i18n } from "../i18n.js";
import {
  allRepositories,
  anySignedIn,
  entriesOf,
  pickInstances,
  signedInInstances,
} from "../lib/instances.js";
import { waitingOf } from "../lib/placements.js";
import { awaitsFolder } from "../lib/space.js";
import { Icon } from "./Icon.js";
import { GroupPicker } from "./SpaceGroups.js";

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

/** A seat's projects as the palette lists them (run-view-168). */
export interface PalettePlace {
  key: string;
  /** The server's name. */
  label: string;
  projects: ProjectInfo[];
  sessions: SessionInfo[];
  attention: Map<string, AttentionItem>;
  /** The seat's current project, where the workspace is on it. */
  currentProjectId?: string;
  /** The member's groups at the seat, as its Groups state reads them;
   * absent until read (run-view-169). */
  groups?: GroupsState;
  /** Whether the seat's connection is open, so its groups can be read. */
  connected?: boolean;
  /** The instance's name while the seat's sign-in there has not
   * completed (run-view-168, core-service-142). */
  signingIn?: string;
  /** Open a spex repository of the member's groups at the seat:
   * `space.join` with no folder, the seat allocating one (space-103). */
  onJoin?: (instance: string, hostId: string) => Promise<void>;
  /** Read the seat's Groups state, where nothing has read it yet. */
  onReadGroups?: () => void;
}

/** A spex repository a place may open (run-view-168): one a signed-in
 * instance of that place lists in the member's groups, with no join of
 * it running — with no clone there, as its Join row stands (space-61),
 * or, at a seat, cloned there with its code clone failed, joined again
 * as its row's "Join again" is (space-103). This computer's clone whose
 * code found no folder is paired from its Space row instead (space-63),
 * a second join of it being refused there. */
interface PaletteJoin {
  /** The seat it opens at; absent on this computer. */
  seat?: PalettePlace;
  /** The origin of the instance whose heading lists it (space-29). */
  instance: string;
  group: InstanceGroupState;
  repo: RepositoryState;
  /** Joined there before, its code clone failed: joined again. */
  again: boolean;
}

function joinable(groups: GroupsState | undefined, seat?: PalettePlace): PaletteJoin[] {
  if (!groups) return [];
  return signedInInstances(groups).flatMap((instance) =>
    entriesOf(instance).flatMap((group) =>
      group.repositories
        .filter(
          (repo) =>
            repo.id !== null &&
            repo.sync.phase !== "running" &&
            (repo.state === "absent" || (seat !== undefined && awaitsFolder(group, repo))),
        )
        .map((repo) => ({ seat, instance: instance.origin, group, repo, again: repo.state !== "absent" })),
    ),
  );
}

/** A row's key: this computer's by its repository alone, a seat's
 * qualified by its place, as the project rows are (run-view-168). */
function joinKeyOf(entry: PaletteJoin): string {
  return entry.seat ? `${entry.repo.key}@${entry.seat.key}` : entry.repo.key;
}

/** One place's "From your groups" (run-view-168): this computer's, or a
 * seat's. */
interface JoinSection {
  /** The place's key. */
  key: string;
  seat?: PalettePlace;
  /** The place's Groups state; absent until read. */
  groups?: GroupsState;
  rows: PaletteJoin[];
}

/** A project of the member's groups as the palette names it: as its
 * code is, never by its `<name>-spex` (DR-159). */
function projectNameOf(repo: RepositoryState): string {
  return repo.name.replace(/-spex$/, "") || repo.name;
}

export interface ProjectPaletteProps {
  projects: ProjectInfo[];
  sessions: SessionInfo[];
  /** The one ledger-fed attention map every surface shares
   * (dashboard-9, DR-066) — the palette derives no count of its own. */
  attention: Map<string, AttentionItem>;
  currentProjectId?: string;
  /** Each open seat's projects, after this computer's (run-view-168). */
  seats?: PalettePlace[];
  onPickFolder?: () => Promise<string | null>;
  onPick: (projectId: string) => void;
  /** Pick a seat's project, at its place. */
  onPickAt?: (place: string, projectId: string) => void;
  /** Register an existing repository by path (store's addProjectByPath). */
  onAddPath: (path: string) => Promise<ProjectInfo>;
  onCreatePath: (path: string, scaffold: boolean) => Promise<ProjectInfo>;
  /** Opened from a project-add action: lead with folder selection,
   * keeping project switching and the Academy choice out of this form. */
  addProjectOnly?: boolean;
  /** Opened at a place's "From your groups", by the place's key: the
   * welcome page's "Open a project from your groups" (run-view-172,
   * run-view-174). */
  groupsAt?: string;
  onClose: () => void;
}

interface ProjectRowState {
  running: number;
  attention: number;
  worst?: AttentionItem["kind"];
}

/** One row of the list: a project at its place — a seat's, or this
 * computer's where `seat` is absent. */
interface PaletteRow {
  project: ProjectInfo;
  seat?: PalettePlace;
  state?: ProjectRowState;
  current: boolean;
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

/** The folder a group's project opens into on this computer, named in
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
      setRefusal(i18n._("Name the folder on this device."));
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
            ? i18n._({ id: "Joining…", comment: "the Join control, while the join runs" })
            : i18n._({
                id: "Open here",
                comment: "project palette: open a project of the member's groups on this computer, cloning it into the folder named beside",
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
const FOCUSABLE = "button:not([disabled]), input:not([disabled])";

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
  const sectionRefs = useRef(new Map<string, HTMLDivElement>());
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
  // A folder added while signed in asks where its records go, in the
  // one picker of matching spex repositories and groups (projects-1,
  // space-58): the key of its local-only spex repository while asked.
  const [picking, setPicking] = useState<string>();
  const space = useAppStore((state) => state.space);
  const loadSpace = useAppStore((state) => state.loadSpace);
  // This computer's join of a group's project is its Space row's
  // (space-63): the same command, with the folder the act picked.
  const spaceJoin = useAppStore((state) => state.spaceJoin);
  const connected = useAppStore((state) => state.connection === "open");
  const pickingRepo = picking && space
    ? allRepositories(space).find((repository) => repository.key === picking)
    : undefined;
  // A repository that left the Groups state while asked — moved after
  // its pick — has nothing left to ask.
  const { onClose } = props;
  useEffect(() => {
    if (picking && !pickingRepo) onClose();
  }, [picking, pickingRepo, onClose]);
  // With no project registered, the ordinary switcher has no filter;
  // the explicit add form works with or without registered projects.
  const empty = props.projects.length === 0 && (props.seats ?? []).every((seat) => seat.projects.length === 0);
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

  // This computer's projects first, then each seat's at its place.
  const listed = useMemo((): PaletteRow[] => {
    const local = rowStates(props.projects, props.sessions, props.attention);
    const rows: PaletteRow[] = props.projects.map((project) => ({
      project,
      state: local.get(project.id),
      current: project.id === props.currentProjectId,
    }));
    for (const seat of props.seats ?? []) {
      const states = rowStates(seat.projects, seat.sessions, seat.attention);
      for (const project of seat.projects) {
        rows.push({
          project,
          seat,
          state: states.get(project.id),
          current: project.id === seat.currentProjectId,
        });
      }
    }
    return rows;
  }, [props.projects, props.sessions, props.attention, props.currentProjectId, props.seats]);
  // Each project names its place where any seat is open (run-view-168).
  const placed = (props.seats?.length ?? 0) > 0;
  const here = placeLabel(LOCAL_PLACE);

  const filtered = listed.filter(
    ({ project }) =>
      project.name.toLowerCase().includes(query.toLowerCase()) ||
      project.path.toLowerCase().includes(query.toLowerCase()),
  );

  // Each seat's Groups state is read where nothing has read it yet, so
  // its groups' projects can be named (run-view-169): as the palette
  // opens, and as a seat connects while it is open. One read per
  // connection; the store keeps them fresh from there.
  const asked = useRef(new Set<string>());
  const unread = (props.seats ?? [])
    .map((seat) => `${seat.key}:${seat.connected === true}:${seat.groups !== undefined}`)
    .join("\n");
  useEffect(() => {
    for (const seat of props.seats ?? []) {
      if (seat.connected === false) {
        asked.current.delete(seat.key);
        continue;
      }
      if (seat.groups || asked.current.has(seat.key)) continue;
      asked.current.add(seat.key);
      seat.onReadGroups?.();
    }
    // The seats' keys, connections and reads are the inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread]);
  // This computer's Groups state is read where nothing has read it yet,
  // as a seat's is (run-view-168).
  useEffect(() => {
    if (connected && !useAppStore.getState().space) void loadSpace().catch(() => {});
  }, [connected, loadSpace]);
  // The spex repositories of the member's groups each place lacks:
  // this computer's once its Groups state reads it signed in somewhere,
  // then each seat's under the seat's name, filtered as the projects
  // are.
  const joinSections: JoinSection[] = [
    ...(anySignedIn(space) ? [{ key: LOCAL_PLACE_KEY, groups: space, rows: joinable(space) }] : []),
    ...(props.seats ?? [])
      .filter((seat) => seat.onJoin)
      .map((seat) => ({ key: seat.key, seat, groups: seat.groups, rows: joinable(seat.groups, seat) })),
  ];
  const matches = (entry: PaletteJoin): boolean =>
    entry.repo.name.toLowerCase().includes(query.toLowerCase()) ||
    entry.group.fullPath.toLowerCase().includes(query.toLowerCase());
  const joinShown = joinSections.map((section) => ({ ...section, rows: section.rows.filter(matches) }));
  const joinRows = joinShown.flatMap(({ rows }) => rows);

  // Entries the arrow keys traverse, in visual order: the Academy row
  // where it leads the list, then projects, then each seat's groups'
  // projects, then Open folder…
  const lead = empty && !addProjectOnly ? 1 : 0;
  const joinStart = lead + filtered.length;
  const entryCount = joinStart + joinRows.length + (props.onPickFolder ? 1 : 0);
  const clamped = Math.min(index, Math.max(0, entryCount - 1));
  const openFolderIndex = joinStart + joinRows.length;

  // Opened at a place's "From your groups" (run-view-172, run-view-174):
  // that section in view and, once it lists a project, its first one
  // highlighted and focused — until the reader moves elsewhere first.
  const landing = useRef(props.groupsAt);
  const landingRow = landing.current
    ? joinRows.find((entry) => (entry.seat?.key ?? LOCAL_PLACE_KEY) === landing.current)
    : undefined;
  const landingKey = landingRow ? joinKeyOf(landingRow) : undefined;
  useEffect(() => {
    const at = landing.current;
    if (!at) return;
    sectionRefs.current.get(at)?.scrollIntoView?.({ block: "nearest" });
    if (!landingRow || !landingKey) return;
    landing.current = undefined;
    setIndex(joinStart + joinRows.indexOf(landingRow));
    rowRefs.current.get(landingKey)?.focus();
    // The row that lands is the input; it is read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landingKey]);

  function pick(projectId: string): void {
    props.onPick(projectId);
    props.onClose();
  }

  /** Pick a listed row at its own place. */
  function pickRow(row: PaletteRow): void {
    if (row.seat) {
      props.onPickAt?.(row.seat.key, row.project.id);
      props.onClose();
    } else pick(row.project.id);
  }

  /** A folder added (projects-1): it becomes the current project, and
   * where the home is signed in to any instance and the folder newly
   * paired, its local-only spex repository asks for its group in place,
   * offering each signed-in instance it may go to (space-58); otherwise
   * the palette closes. */
  async function added(project: ProjectInfo, known: boolean): Promise<void> {
    props.onPick(project.id);
    const key = project.repository.key;
    const row = (): RepositoryState | undefined => {
      const groups = useAppStore.getState().space;
      return groups && anySignedIn(groups)
        ? allRepositories(groups).find((repository) => repository.key === key)
        : undefined;
    };
    if (!known && !row()) await loadSpace().catch(() => {});
    const repo = known ? undefined : row();
    const current = useAppStore.getState().space;
    if (repo && repo.state === "local-only" && !waitingOf(repo) && current && pickInstances(current, repo).length > 0) {
      setPicking(key);
      return;
    }
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
        const before = new Set(props.projects.map((project) => project.id));
        const project = await props.onAddPath(path);
        await added(project, before.has(project.id));
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

  /** Send a group's project's join to its place's core: `space.join`
   * naming its instance and host id — on this computer with `folder`,
   * as its Space row's Join sends it (space-63); at a seat with none,
   * again where its code clone failed, its core cloning the code into
   * the folder it allocated (space-103, run-view-169). Accepted, the
   * palette closes, the join reporting on the place's Space row
   * (space-63); a refusal is thrown to the caller. */
  async function sendJoin(entry: PaletteJoin, folder?: string): Promise<void> {
    if (entry.repo.id === null) return;
    setBusy(true);
    setJoining(joinKeyOf(entry));
    setError(undefined);
    try {
      if (entry.seat) await entry.seat.onJoin?.(entry.instance, entry.repo.id);
      else await spaceJoin(entry.instance, entry.repo.id, folder);
      props.onClose();
    } finally {
      setBusy(false);
      setJoining(undefined);
    }
  }

  /** Open a group's project at its place (run-view-168): on this
   * computer into the folder the act's own picker takes — the shell's
   * picker, else a path named in place beneath the row (space-63); at a
   * seat at once. A refusal stands in the palette. */
  async function runJoin(entry: PaletteJoin): Promise<void> {
    if (busy || entry.repo.id === null) return;
    let folder: string | undefined;
    if (!entry.seat) {
      if (!props.onPickFolder) {
        setError(undefined);
        setAsking(joinKeyOf(entry));
        return;
      }
      folder = (await props.onPickFolder()) ?? undefined;
      if (!folder) return;
    }
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
      const before = new Set(props.projects.map((project) => project.id));
      props
        .onAddPath(path)
        .then((project) => added(project, before.has(project.id)))
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
    if (row) pickRow(row);
    else if (join) void runJoin(join);
    else if (props.onPickFolder && at === openFolderIndex) openFolder();
  }

  /** Arrow keys move the highlight from either input. */
  function moveHighlight(event: React.KeyboardEvent): boolean {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") landing.current = undefined;
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

  /** The dialog's own keys: Escape closes from anywhere inside it,
   * and Tab wraps so focus never leaves it (DR-010 §6). */
  function dialogKeydown(event: React.KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      props.onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const nodes = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
    );
    if (nodes.length === 0) return;
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
        if (event.target === event.currentTarget) props.onClose();
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
        {space && pickingRepo ? (
          // The picker stands in place of the list (space-58): a pick or
          // Cancel — which leaves it local only — closes the palette.
          <div data-testid="palette-group-picker" className="min-h-0 flex-1 overflow-y-auto p-2">
            <GroupPicker
              groups={space}
              repo={pickingRepo}
              connected={connected}
              onClose={props.onClose}
              onNote={() => {}}
            />
          </div>
        ) : addProjectOnly ? (
          <div data-testid="palette-own-project" className="min-h-0 overflow-y-auto p-4">
            <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              {i18n._("Add a local project")}
            </h2>
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
            {refusal ? <div className="mt-4">{refusal}</div> : null}
          </div>
        ) : (
        <>
        {empty ? null : (
          <input
            ref={searchRef}
            data-testid="palette-search"
            aria-label={i18n._("Filter projects")}
            value={query}
            onChange={(event) => {
              landing.current = undefined;
              setQuery(event.target.value);
              setIndex(0);
            }}
            onKeyDown={searchKeydown}
            placeholder={i18n._("Switch to a project…")}
            className="border-b border-neutral-200 bg-transparent px-4 py-3 text-sm outline-none dark:border-neutral-800"
          />
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
            const { project, seat, state: row } = entry;
            // This computer's rows keep their keys and test ids; a
            // seat's are qualified by its place (run-view-168).
            const key = seat ? `${project.id}@${seat.key}` : project.id;
            return (
              <button
                key={key}
                type="button"
                data-testid={`palette-project-${key}`}
                title={project.path}
                onClick={() => pickRow(entry)}
                className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 ${
                  i + lead === clamped ? ROW_ACTIVE : ""
                }`}
              >
                <Icon name="folder" className="h-3.5 w-3.5 text-neutral-500" />
                <span className="truncate">{project.name}</span>
                {placed ? (
                  <span
                    data-testid="palette-place"
                    className="shrink-0 truncate text-xs text-neutral-500"
                  >
                    {seat ? seat.label : here}
                  </span>
                ) : null}
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
            );
          })}
          {filtered.length === 0 && query ? (
            <div className="px-4 py-2 text-sm text-neutral-500">
              {i18n._('No project matches "{query}"', { query })}
            </div>
          ) : null}
          {joinShown.map(({ key: place, seat, groups, rows }) => (
            // Each place's projects of the member's groups (run-view-168):
            // a seat's opened there with no folder (run-view-169), this
            // computer's into the folder the act picks (space-63).
            <div
              key={place}
              ref={(node) => {
                if (node) sectionRefs.current.set(place, node);
                else sectionRefs.current.delete(place);
              }}
              role="group"
              data-testid={`palette-groups-${place}`}
              aria-labelledby={`palette-groups-heading-${place}`}
              className="border-t border-neutral-100 py-1 dark:border-neutral-800"
            >
              <div
                id={`palette-groups-heading-${place}`}
                className="px-4 py-1 text-xs font-medium text-neutral-500"
              >
                {seat
                  ? i18n._({
                      id: "From your groups on {place}",
                      values: { place: seat.label },
                      comment: "project palette: heading over the spex repositories of the member's groups a team server can open; {place} is the server's name",
                    })
                  : i18n._({
                      id: "From your groups",
                      comment: "project palette: heading over the projects of the member's groups this computer can open",
                    })}
              </div>
              {rows.map((entry) => {
                const key = joinKeyOf(entry);
                const at = joinStart + joinRows.indexOf(entry);
                return (
                  <div key={key}>
                    <button
                      ref={(node) => {
                        if (node) rowRefs.current.set(key, node);
                        else rowRefs.current.delete(key);
                      }}
                      type="button"
                      data-testid={entry.again ? `palette-join-again-${key}` : `palette-join-${key}`}
                      disabled={busy}
                      title={entry.repo.key}
                      aria-expanded={seat || props.onPickFolder ? undefined : asking === key}
                      onClick={() => void runJoin(entry)}
                      className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-neutral-50 disabled:opacity-60 dark:hover:bg-neutral-800 ${
                        at === clamped ? ROW_ACTIVE : ""
                      }`}
                    >
                      <Icon name="plus" className="h-3.5 w-3.5 text-neutral-500" />
                      <span className="truncate">{projectNameOf(entry.repo)}</span>
                      <span className="min-w-0 shrink truncate text-xs text-neutral-500">
                        {entry.group.login ?? entry.group.fullPath}
                      </span>
                      {joining === key ? (
                        <span className="ml-auto shrink-0 text-xs text-neutral-500">
                          {i18n._({ id: "Joining…", comment: "the Join control, while the join runs" })}
                        </span>
                      ) : entry.again ? (
                        // Cloned there, its code clone failed: the seat's
                        // row offers the same (space-103).
                        <span className="ml-auto shrink-0 text-xs text-neutral-500">
                          {i18n._({
                            id: "Join again",
                            comment: "on a team server's project whose code clone failed: join it again, cloning its code into the folder the server allocated",
                          })}
                        </span>
                      ) : null}
                    </button>
                    {!seat && asking === key ? (
                      <JoinFolder
                        testId={`palette-join-folder-${key}`}
                        label={
                          entry.repo.code
                            ? i18n._("Folder for its code on this device")
                            : i18n._("Folder its sessions run in on this device")
                        }
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
              {rows.length === 0 && !query ? (
                <div data-testid={`palette-groups-note-${place}`} className="px-4 py-1 text-xs text-neutral-500">
                  {seat?.signingIn !== undefined
                    ? i18n._({
                        id: "Signing in to {instance}…",
                        values: { instance: seat.signingIn },
                        comment: "project palette: under a team server's groups while the seat signs in at the instance, before which it lists nothing; {instance} is the instance's name",
                      })
                    : groups
                      ? i18n._({
                          id: "Nothing more to open from your groups",
                          comment: "project palette: a place's groups list no spex repository it lacks",
                        })
                      : i18n._("Reading your groups…")}
                </div>
              ) : null}
            </div>
          ))}
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
          {placed ? (
            // A project added or created here is this computer's
            // (run-view-168): a seat's projects are opened among the
            // member's groups, with no path entry (run-view-169).
            <p data-testid="palette-new-place" className="px-0.5 text-xs text-neutral-500">
              {i18n._({
                id: "A new project is added on {place}.",
                comment: "project palette: where a project added or created by path lands; {place} is the place's name, \"This computer\"",
                values: { place: here },
              })}
            </p>
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
