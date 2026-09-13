// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Space surface (DR-057): the Spex home at a glance in one header
// (space-1) ending with the state's primary control — Initialize, Join
// or Sync — over the Sync and Explore tabs. The surface renders the
// core's state and runs no Git itself: every action is a command whose
// outcome arrives as state (space-29), and the state is re-read only on
// an event, never on a timer (space-2).

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { SpaceState } from "@sublang/spex-core/protocol";

import { useAppStore } from "../state/store.js";
import { useClock } from "../lib/useClock.js";
import { absoluteTitle, relativeAge } from "../lib/time.js";
import {
  STEP_LINES,
  STEP_NAMES,
  displayRemote,
  plural,
  revealBridge,
  revealLabel,
  tildify,
} from "../lib/space.js";
import { Icon } from "./Icon.js";
import { InlineConfirm } from "./InlineConfirm.js";
import { SyncTab } from "./SpaceSync.js";
import { ExploreTab } from "./SpaceExplorer.js";

export interface SpaceSurfaceProps {
  /** Open a session as its tab (space-7, run-view-68). */
  onOpenSession(sessionId: string): void;
  /** An unbound project is pointed to the palette, which rebinds. */
  onOpenPalette(): void;
}

export type SpaceTab = "sync" | "explore";

/** A control's classes by the house taxonomy (DR-010 §8). */
export const PRIMARY =
  "min-h-7 rounded bg-brand-600 px-3 py-1 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-500 dark:hover:bg-brand-400";
export const SECONDARY =
  "min-h-6 rounded border border-neutral-300 px-1.5 py-0.5 text-xs hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800";
export const LINK =
  "text-xs text-brand-600 hover:underline disabled:opacity-50 dark:text-brand-300";

/** The one live note of the surface (DR-010 §7): steps, copies and
 * refusals land here as well as in place. */
export type Note = (text: string) => void;

/** Why Sync is refused before its first step (space-11), in the words
 * shown beside the disabled control; undefined when it may run. */
export function syncRefusal(space: SpaceState): string | undefined {
  if (!space.git.ok) return space.git.guidance;
  const repo = space.repository;
  if (!repo) return "Initialize the repository first";
  if (!repo.remote) return "Add a remote first";
  if (repo.branch !== "main") {
    return `On ${repo.branch ?? "no branch"}; check out main in a terminal`;
  }
  if (repo.mergePending) return "Finish or abort the merge in your terminal";
  const blocking = space.diagnostics.find((entry) => entry.blocking);
  if (blocking) return `${blocking.file}: ${blocking.reason}`;
  if (space.sync.phase === "running" && space.sync.op !== "sync") {
    return "Space is busy";
  }
  return undefined;
}

/** Reveal in the file manager where the bridge exists, Copy path
 * otherwise (space-26): the copy is acknowledged in words, and a page
 * with no clipboard falls back to a selectable read-only field. */
export function PathControls({
  path,
  testId,
  onNote,
  compact = false,
}: {
  path: string;
  testId: string;
  onNote: Note;
  /** Icon-only forms with their accessible names (DR-041). */
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [revealFailed, setRevealFailed] = useState(false);
  const reveal = revealBridge();
  const revealName = revealLabel();

  const copy = () => {
    const write = navigator.clipboard?.writeText?.(path);
    if (!write) {
      setFallback(true);
      onNote("Copy is not available here; the path is shown to select.");
      return;
    }
    void write
      .then(() => {
        setCopied(true);
        setFallback(false);
        onNote(`Copied ${path}`);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        setFallback(true);
        onNote("Copy is not available here; the path is shown to select.");
      });
  };

  return (
    <span className="flex flex-wrap items-center gap-1">
      {reveal ? (
        <button
          type="button"
          data-testid={`${testId}-reveal`}
          aria-label={revealName}
          title={revealName}
          className={SECONDARY}
          onClick={() => {
            setRevealFailed(false);
            void reveal(path).then((shown) => {
              if (!shown) {
                setRevealFailed(true);
                onNote("Couldn't show it in the file manager");
              }
            });
          }}
        >
          {compact ? <Icon name="folder" className="h-3.5 w-3.5" /> : revealName}
        </button>
      ) : null}
      <button
        type="button"
        data-testid={`${testId}-copy`}
        aria-label="Copy path"
        title="Copy path"
        className={SECONDARY}
        onClick={copy}
      >
        {compact ? (
          <Icon name="copy" className="h-3.5 w-3.5" />
        ) : copied ? (
          "Copied"
        ) : (
          "Copy path"
        )}
      </button>
      {copied && compact ? (
        <span className="text-xs text-neutral-500">Copied</span>
      ) : null}
      {revealFailed ? (
        <span className="text-xs text-neutral-500">
          Couldn't show it in the file manager
        </span>
      ) : null}
      {fallback ? (
        <input
          readOnly
          aria-label="Path"
          data-testid={`${testId}-field`}
          value={path}
          onFocus={(event) => event.currentTarget.select()}
          className="min-w-0 max-w-full rounded border border-neutral-300 bg-transparent px-1.5 py-0.5 font-mono text-xs dark:border-neutral-700"
        />
      ) : null}
    </span>
  );
}

/** The header's remote row (space-5): the URL with its user removed, or
 * "No remote", and an in-place editor with Save and Cancel — Escape
 * cancelling — whose save the field follows. */
function RemoteRow({
  remote,
  disabled,
  editing,
  onEditing,
  focusField,
}: {
  remote: string | null;
  disabled: boolean;
  editing: boolean;
  onEditing(editing: boolean): void;
  /** A refusal pointed here (space-11): the field takes focus. */
  focusField: number;
}) {
  const spaceSetRemote = useAppStore((state) => state.spaceSetRemote);
  const [draft, setDraft] = useState(remote ?? "");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(remote ?? "");
      setError(undefined);
      inputRef.current?.focus();
    }
  }, [editing, remote, focusField]);

  const save = async () => {
    setSaving(true);
    setError(undefined);
    try {
      const url = draft.trim();
      await spaceSetRemote(url === "" ? null : url);
      onEditing(false);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onEditing(false);
    } else if (event.key === "Enter") {
      event.preventDefault();
      void save();
    }
  };

  return (
    <div
      data-testid="space-remote"
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"
    >
      {editing ? (
        <span
          data-testid="space-remote-editor"
          className="flex min-w-0 flex-1 flex-wrap items-center gap-1"
          onKeyDown={onKeyDown}
        >
          <label className="sr-only" htmlFor="space-remote-input">
            Remote URL
          </label>
          <input
            id="space-remote-input"
            ref={inputRef}
            data-testid="space-remote-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="git@host:path or https://…"
            spellCheck={false}
            disabled={saving}
            className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-1.5 py-0.5 font-mono text-xs focus:border-brand-500 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button
            type="button"
            className={SECONDARY}
            disabled={saving || disabled}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className={SECONDARY}
            disabled={saving}
            onClick={() => onEditing(false)}
          >
            Cancel
          </button>
          {error ? (
            <span role="alert" className="text-xs text-red-600 dark:text-red-400">
              {error}
            </span>
          ) : null}
        </span>
      ) : (
        <>
          {remote ? (
            <span className="flex min-w-0 items-baseline gap-1 text-sm" title={remote}>
              <span className="shrink-0 text-neutral-500">origin</span>
              {/* The URL truncates in its own box (DR-041): the text
                  lies directly in the truncating span. */}
              <span className="min-w-0 truncate font-mono text-xs" data-testid="space-remote-url">
                {displayRemote(remote)}
              </span>
            </span>
          ) : (
            <span className="text-sm text-neutral-500">No remote</span>
          )}
          <button
            type="button"
            data-testid="space-remote-edit"
            className={SECONDARY}
            disabled={disabled}
            onClick={() => onEditing(true)}
          >
            {remote ? "Change remote" : "Add remote"}
          </button>
        </>
      )}
    </div>
  );
}

/** Initialize and Join a space with a remote field between them
 * (space-3): the header's primary control while the home is not a
 * repository. */
function SetupCard({
  disabled,
  initLabel,
  joinLabel,
  busy,
  error,
  onInitialize,
  onJoin,
  onExplore,
}: {
  disabled: boolean;
  initLabel: string;
  joinLabel: string;
  busy: boolean;
  error?: string;
  onInitialize(remote: string): void;
  onJoin(remote: string): void;
  onExplore(): void;
}) {
  const [remote, setRemote] = useState("");
  const [required, setRequired] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      data-testid="space-setup"
      className="flex w-full flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900"
    >
      <p>Keep this space in Git to back it up and use it on another machine.</p>
      <label className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
        <span className="shrink-0 text-neutral-500">Remote (optional)</span>
        <input
          ref={inputRef}
          data-testid="space-setup-remote"
          value={remote}
          onChange={(event) => {
            setRemote(event.target.value);
            if (event.target.value.trim()) setRequired(false);
          }}
          aria-invalid={required || undefined}
          aria-describedby={required ? "space-setup-required" : undefined}
          placeholder="git@host:path or https://…"
          spellCheck={false}
          disabled={disabled || busy}
          className={`min-w-0 flex-1 rounded border bg-white px-1.5 py-0.5 font-mono text-xs dark:bg-neutral-900 ${
            required
              ? "border-red-400 dark:border-red-700"
              : "border-neutral-300 focus:border-brand-500 dark:border-neutral-700"
          }`}
        />
        {required ? (
          <span
            id="space-setup-required"
            role="alert"
            className="text-xs text-red-600 dark:text-red-400"
          >
            Required to join
          </span>
        ) : null}
      </label>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="space-initialize"
          className={PRIMARY}
          disabled={disabled || busy}
          onClick={() => onInitialize(remote.trim())}
        >
          {initLabel}
        </button>
        <span className="min-w-0 text-xs text-neutral-500">
          New space — a repository here, on branch main.
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="space-join-space"
          className={SECONDARY}
          disabled={disabled || busy}
          onClick={() => {
            if (!remote.trim()) {
              setRequired(true);
              inputRef.current?.focus();
              return;
            }
            onJoin(remote.trim());
          }}
        >
          {joinLabel}
        </button>
        <span className="min-w-0 text-xs text-neutral-500">
          Bring an existing space here, keeping what this device has.
        </span>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
      <p className="text-xs text-neutral-500">
        Sessions, queues, projects, Settings and playbook sources sync.
        Provider hints, leases, local paths and preferences stay on this
        device —{" "}
        <button type="button" className={LINK} onClick={onExplore}>
          see what stays
        </button>
        .
      </p>
    </div>
  );
}

/** One header field: a label for the screen reader, the words for
 * the eye. */
function Field({
  testId,
  title,
  children,
  className = "",
}: {
  testId: string;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      data-testid={testId}
      title={title}
      className={`flex min-w-0 items-center gap-1 text-sm ${className}`}
    >
      {children}
    </span>
  );
}

/** The repository dot carries the status palette (DR-010 §8): neutral
 * idle, emerald running, amber choices and unrelated, red stopped. */
function statusDot(space: SpaceState): { className: string; word: string } {
  const sync = space.sync;
  if (sync.phase === "running") {
    return { className: "bg-emerald-500 animate-pulse", word: STEP_LINES[sync.step] };
  }
  if (sync.phase === "choices" || sync.phase === "unrelated") {
    return {
      className: "bg-amber-500",
      word: sync.phase === "choices" ? "needs your choice" : "unrelated history",
    };
  }
  if (sync.phase === "stopped") {
    return {
      className: sync.cause === "rejected" ? "bg-amber-500" : "bg-red-500",
      word: `${STEP_NAMES[sync.step]} stopped`,
    };
  }
  if (!space.repository) {
    return { className: "border border-neutral-400 bg-transparent", word: "not a repository" };
  }
  return { className: "bg-neutral-400", word: "idle" };
}

export function SpaceSurface({ onOpenSession, onOpenPalette }: SpaceSurfaceProps) {
  const space = useAppStore((state) => state.space);
  const spaceError = useAppStore((state) => state.spaceError);
  const spaceReadAt = useAppStore((state) => state.spaceReadAt);
  const spaceChangeSeq = useAppStore((state) => state.spaceChangeSeq);
  const connection = useAppStore((state) => state.connection);
  const loadSpace = useAppStore((state) => state.loadSpace);
  const spaceInit = useAppStore((state) => state.spaceInit);
  const spaceSync = useAppStore((state) => state.spaceSync);
  const connected = connection === "open";
  const now = useClock(true, 30_000);

  const [tab, setTab] = useState<SpaceTab>("sync");
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [remoteEditing, setRemoteEditing] = useState(false);
  const [remoteFocus, setRemoteFocus] = useState(0);
  const [busy, setBusy] = useState<"init" | "join" | "sync">();
  const [joinAccepted, setJoinAccepted] = useState(false);
  const [joinConfirm, setJoinConfirm] = useState(false);
  const [actionError, setActionError] = useState<{ where: "setup" | "primary"; message: string }>();
  const [note, setNote] = useState("");

  const onNote = useCallback<Note>((text) => setNote(text), []);

  // The state is read on events only (space-2): the surface opening,
  // the window regaining focus, and Refresh; the core's broadcasts
  // land through the store, and the announcements below re-read
  // debounced.
  useEffect(() => {
    void loadSpace();
    const onFocus = () => void loadSpace();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadSpace]);

  const firstSeq = useRef(spaceChangeSeq);
  useEffect(() => {
    if (spaceChangeSeq === firstSeq.current) return;
    const timer = setTimeout(() => void loadSpace(), 300);
    return () => clearTimeout(timer);
  }, [spaceChangeSeq, loadSpace]);

  // A join reads "Joining…" until its sync ends (space-6): the flag
  // clears on the first outcome after the run was seen — or on an
  // outcome that landed before a running frame was drawn.
  const running = space?.sync.phase === "running";
  const joinRunSeen = useRef(false);
  useEffect(() => {
    if (!joinAccepted) {
      joinRunSeen.current = false;
      return;
    }
    if (running) joinRunSeen.current = true;
    else if (joinRunSeen.current || (space && space.sync.phase !== "idle")) {
      setJoinAccepted(false);
    }
  }, [joinAccepted, running, space]);

  // The polite live region narrates the steps (DR-010 §7).
  const sync = space?.sync;
  const syncKey = sync ? JSON.stringify(sync) : "";
  useEffect(() => {
    if (!sync) return;
    if (sync.phase === "running") setNote(STEP_LINES[sync.step]);
    else if (sync.phase === "choices") setNote("Needs your choice");
    else if (sync.phase === "unrelated") setNote("Unrelated history");
    else if (sync.phase === "stopped") setNote(`${STEP_NAMES[sync.step]} stopped — ${sync.message}`);
    else if (sync.phase === "done") {
      setNote(
        sync.sent + sync.received === 0
          ? "Everything is in sync"
          : `Synced · ${sync.sent} sent · ${sync.received} received`,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncKey]);

  const initialize = async (remote: string) => {
    setBusy("init");
    setActionError(undefined);
    try {
      await spaceInit(remote || undefined);
    } catch (cause) {
      setActionError({ where: "setup", message: (cause as Error).message });
    } finally {
      setBusy(undefined);
    }
  };

  const join = async (remote: string) => {
    setBusy("join");
    setActionError(undefined);
    try {
      await spaceInit(remote);
      await spaceSync({ join: true });
      setJoinAccepted(true);
    } catch (cause) {
      setActionError({ where: "setup", message: (cause as Error).message });
    } finally {
      setBusy(undefined);
    }
  };

  const startSync = async (input: { join?: boolean } = {}) => {
    setBusy("sync");
    setActionError(undefined);
    try {
      await spaceSync(input);
      if (input.join) setJoinAccepted(true);
    } catch (cause) {
      const message = (cause as Error).message;
      setActionError({ where: "primary", message });
      setNote(message);
    } finally {
      setBusy(undefined);
    }
  };

  const onTabKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next: SpaceTab = tab === "sync" ? "explore" : "sync";
    setTab(next);
    document.getElementById(`space-tab-${next}`)?.focus();
  };

  const tabButton = (which: SpaceTab, label: string) => (
    <button
      type="button"
      role="tab"
      id={`space-tab-${which}`}
      data-testid={`space-tab-${which}`}
      aria-selected={tab === which}
      aria-controls={`space-panel-${which}`}
      tabIndex={tab === which ? 0 : -1}
      onClick={() => setTab(which)}
      onKeyDown={onTabKey}
      className={`min-h-7 rounded px-3 py-1 text-sm ${
        tab === which
          ? "bg-brand-50 font-medium text-brand-700 dark:bg-brand-950 dark:text-brand-300"
          : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
      }`}
    >
      {label}
    </button>
  );

  const header = space ? (
    <Header
      space={space}
      now={now}
      connected={connected}
      busy={busy}
      joinAccepted={joinAccepted}
      joinConfirm={joinConfirm}
      onJoinConfirm={setJoinConfirm}
      actionError={actionError}
      issuesOpen={issuesOpen}
      onIssuesOpen={(open) => {
        setIssuesOpen(open);
        setTab("sync");
      }}
      onShowSync={() => setTab("sync")}
      onShowExplore={() => setTab("explore")}
      remoteEditing={remoteEditing}
      onRemoteEditing={setRemoteEditing}
      remoteFocus={remoteFocus}
      onFocusRemote={() => {
        setRemoteEditing(true);
        setRemoteFocus((count) => count + 1);
      }}
      onInitialize={(remote) => void initialize(remote)}
      onJoinSpace={(remote) => void join(remote)}
      onSync={() => void startSync()}
      onJoin={() => {
        setJoinConfirm(false);
        void startSync({ join: true });
      }}
      onNote={onNote}
    />
  ) : null;

  return (
    <section
      data-testid="space-surface"
      aria-label="Space"
      // The surface root is the box the surface scrolls in, positioned
      // so what it holds is contained by it (DR-041 §9); its width is
      // the container every step queries.
      className="@container relative flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
    >
      <div role="status" aria-live="polite" className="sr-only" data-testid="space-live">
        {note}
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold">Space</h1>
        <span className="flex items-center gap-2 text-xs text-neutral-500">
          {spaceReadAt ? (
            <span title={absoluteTitle(spaceReadAt)} data-testid="space-read-at">
              Read {relativeAge(spaceReadAt, now)}
            </span>
          ) : null}
          <button
            type="button"
            data-testid="space-refresh"
            className={SECONDARY}
            disabled={!connected}
            onClick={() => void loadSpace()}
          >
            Refresh
          </button>
        </span>
      </div>
      {spaceError ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          Couldn't read the space: {spaceError}
        </p>
      ) : null}
      {header}
      {space ? (
        <>
          <div
            role="tablist"
            aria-label="Space views"
            className="flex flex-wrap items-center gap-1 border-b border-neutral-200 pb-1 dark:border-neutral-800"
          >
            {tabButton("sync", "Sync")}
            {tabButton("explore", "Explore")}
          </div>
          <div
            role="tabpanel"
            id={`space-panel-${tab}`}
            aria-labelledby={`space-tab-${tab}`}
            className="flex min-h-0 flex-1 flex-col gap-3"
          >
            {tab === "sync" ? (
              <SyncTab
                space={space}
                now={now}
                connected={connected}
                issuesOpen={issuesOpen}
                onOpenSession={onOpenSession}
                onOpenPalette={onOpenPalette}
                onNote={onNote}
              />
            ) : (
              <ExploreTab
                space={space}
                connected={connected}
                onOpenSession={onOpenSession}
                onNote={onNote}
              />
            )}
          </div>
        </>
      ) : !spaceError ? (
        <p className="text-sm text-neutral-500">Reading the space…</p>
      ) : null}
    </section>
  );
}

function Header({
  space,
  now,
  connected,
  busy,
  joinAccepted,
  joinConfirm,
  onJoinConfirm,
  actionError,
  issuesOpen,
  onIssuesOpen,
  onShowSync,
  onShowExplore,
  remoteEditing,
  onRemoteEditing,
  remoteFocus,
  onFocusRemote,
  onInitialize,
  onJoinSpace,
  onSync,
  onJoin,
  onNote,
}: {
  space: SpaceState;
  now: number;
  connected: boolean;
  busy?: "init" | "join" | "sync";
  joinAccepted: boolean;
  joinConfirm: boolean;
  onJoinConfirm(open: boolean): void;
  actionError?: { where: "setup" | "primary"; message: string };
  issuesOpen: boolean;
  onIssuesOpen(open: boolean): void;
  onShowSync(): void;
  onShowExplore(): void;
  remoteEditing: boolean;
  onRemoteEditing(editing: boolean): void;
  remoteFocus: number;
  onFocusRemote(): void;
  onInitialize(remote: string): void;
  onJoinSpace(remote: string): void;
  onSync(): void;
  onJoin(): void;
  onNote: Note;
}) {
  const repo = space.repository;
  const sync = space.sync;
  const running = sync.phase === "running";
  const disabled = !connected;
  const dot = statusDot(space);
  const issueCount = space.diagnostics.length + (repo?.mergePending ? 1 : 0);
  const unrelated = sync.phase === "unrelated" || repo?.unrelated === true;

  const initLabel =
    busy === "init" || (running && sync.op === "init" && !joinAccepted && busy !== "join")
      ? "Initializing…"
      : "Initialize";
  const joinSpaceLabel =
    busy === "join" || (joinAccepted && running) ? "Joining…" : "Join a space";

  let primary: ReactNode = null;
  if (!space.git.ok) {
    primary = null;
  } else if (!repo) {
    primary = (
      <SetupCard
        disabled={disabled}
        busy={busy !== undefined || running}
        initLabel={initLabel}
        joinLabel={joinSpaceLabel}
        error={actionError?.where === "setup" ? actionError.message : undefined}
        onInitialize={onInitialize}
        onJoin={onJoinSpace}
        onExplore={onShowExplore}
      />
    );
  } else if (unrelated) {
    primary = joinConfirm ? (
      <span data-testid="space-join-confirm">
        <InlineConfirm
          question="Join both histories into one space? Anything present in both differently will ask you to choose."
          confirmLabel="Join"
          onConfirm={onJoin}
          onCancel={() => onJoinConfirm(false)}
        />
      </span>
    ) : (
      <span className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="space-primary"
          className={PRIMARY}
          disabled={disabled || busy !== undefined || running}
          onClick={() => onJoinConfirm(true)}
        >
          {joinAccepted && running ? "Joining…" : "Join"}
        </button>
        {actionError?.where === "primary" ? (
          <span role="alert" className="text-xs text-red-600 dark:text-red-400">
            {actionError.message}
          </span>
        ) : null}
      </span>
    );
  } else {
    const refusal = syncRefusal(space);
    // A join reads "Joining…" from its init through its sync (space-6).
    const label =
      busy === "join" || (joinAccepted && running)
        ? "Joining…"
        : busy === "sync" || (running && sync.op === "sync")
          ? "Syncing…"
          : running && sync.op === "init"
            ? "Initializing…"
            : "Sync";
    primary = (
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="space-primary"
          className={`${PRIMARY} w-full @xs:w-auto`}
          disabled={disabled || refusal !== undefined || busy !== undefined || running}
          aria-describedby={refusal || actionError ? "space-primary-caption" : undefined}
          onClick={onSync}
        >
          {label}
        </button>
        {refusal && !running ? (
          <span
            id="space-primary-caption"
            data-testid="space-primary-caption"
            className="min-w-0 text-xs text-neutral-500"
          >
            {refusal === "Add a remote first" ? (
              <button type="button" className={LINK} onClick={onFocusRemote}>
                {refusal}
              </button>
            ) : (
              refusal
            )}
          </span>
        ) : actionError?.where === "primary" ? (
          <span
            id="space-primary-caption"
            role="alert"
            className="min-w-0 text-xs text-red-600 dark:text-red-400"
          >
            {actionError.message}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <header
      data-testid="space-header"
      data-stale={connected ? undefined : "1"}
      // Below @xs the fields stack with the primary control last and
      // full-width; above it they flow in rows (space-28). While the
      // core is unreachable the last known state stands, muted.
      className={`flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900 ${
        connected ? "" : "opacity-70"
      }`}
    >
      <div className="flex min-w-0 flex-col gap-1 @xs:flex-row @xs:flex-wrap @xs:items-center @xs:gap-x-3">
        <Field testId="space-path" title={space.home} className="min-w-0 flex-1">
          <span className="min-w-0 truncate font-mono text-sm">{tildify(space.home)}</span>
        </Field>
        <PathControls path={space.home} testId="space-path" onNote={onNote} />
      </div>
      {space.git.ok ? (
        <>
          <div className="flex min-w-0 flex-col gap-1 @xs:flex-row @xs:flex-wrap @xs:items-center @xs:gap-x-3">
            <Field testId="space-repository" title={repo ? `branch ${repo.branch ?? "none"} · ${dot.word}` : dot.word}>
              <span
                aria-hidden
                data-testid="space-status-dot"
                data-tone={dot.className.includes("emerald") ? "running" : dot.className.includes("amber") ? "attention" : dot.className.includes("red") ? "stopped" : "idle"}
                className={`inline-block h-2 w-2 shrink-0 rounded-full ${dot.className}`}
              />
              {repo ? (
                <>
                  <span className="font-mono text-sm">{repo.branch ?? "no branch"}</span>
                  {repo.branch !== "main" ? (
                    <span className="rounded-full border border-amber-400 px-1.5 text-xs text-amber-700 dark:text-amber-300">
                      unsupported
                    </span>
                  ) : null}
                  {repo.identityFallback ? (
                    <span
                      className="text-xs text-neutral-500"
                      title="Git has no committer identity on this machine, so the app commits as Spex at the machine's host name"
                    >
                      · committed as Spex
                    </span>
                  ) : null}
                </>
              ) : (
                <span>Not a repository yet</span>
              )}
            </Field>
            {repo ? (
              <RemoteRow
                remote={repo.remote}
                disabled={disabled || running}
                editing={remoteEditing}
                onEditing={onRemoteEditing}
                focusField={remoteFocus}
              />
            ) : null}
          </div>
          {repo ? (
            <div className="flex min-w-0 flex-col gap-1 @xs:flex-row @xs:flex-wrap @xs:items-center @xs:gap-x-3">
              {repo.checkedAt !== null && !unrelated ? (
                <Field
                  testId="space-ahead-behind"
                  title={`${plural(repo.ahead ?? 0, "commit")} ahead, ${plural(repo.behind ?? 0, "commit")} behind · checked ${absoluteTitle(repo.checkedAt)}`}
                >
                  {/* The words yield after the times (space-28): below
                      28rem the numbers stand with the arrows, the words
                      riding the accessible text. */}
                  <span aria-hidden>↑</span>
                  <span>
                    {repo.ahead ?? 0}
                    <span className="sr-only @md:not-sr-only"> ahead</span>
                  </span>
                  <span aria-hidden>↓</span>
                  <span>
                    {repo.behind ?? 0}
                    <span className="sr-only @md:not-sr-only"> behind</span>
                  </span>
                  <span className="hidden text-neutral-500 @2xl:inline">
                    · checked {relativeAge(repo.checkedAt, now)}
                  </span>
                </Field>
              ) : null}
              <Field
                testId="space-last-sync"
                title={space.lastSync ? absoluteTitle(space.lastSync.at) : undefined}
              >
                {space.lastSync ? (
                  <span>
                    Synced
                    <span className="sr-only @2xl:not-sr-only">
                      {" "}
                      {relativeAge(space.lastSync.at, now)}
                    </span>
                  </span>
                ) : (
                  <span className="text-neutral-500">Never synced</span>
                )}
              </Field>
              <button
                type="button"
                data-testid="space-local-count"
                // The count links into the Sync tab; its words fit the
                // control budget and the whole phrase rides the name
                // (space-28, DR-041).
                aria-label={`${plural(space.local.length, "local change")}`}
                title="Units this device changed, listed under Sync"
                className="text-sm hover:underline"
                onClick={onShowSync}
              >
                {plural(space.local.length, "change")}
              </button>
              {issueCount > 0 ? (
                <button
                  type="button"
                  data-testid="space-issues"
                  aria-expanded={issuesOpen}
                  className="flex items-center gap-1 text-sm text-amber-700 hover:underline dark:text-amber-300"
                  onClick={() => onIssuesOpen(!issuesOpen)}
                >
                  <span aria-hidden>⚠</span>
                  {plural(issueCount, "issue")}
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <div data-testid="space-no-git" className="text-sm">
          <p className="font-medium">Git is not installed</p>
          <p className="text-xs text-neutral-500">{space.git.guidance}</p>
        </div>
      )}
      {space.outside.map((entry) => (
        <Field
          key={entry.what}
          testId={`space-outside-${entry.what}`}
          title={entry.path}
          className="text-xs text-neutral-500"
        >
          {entry.what === "config" ? "Configuration" : "Sessions directory"} outside
          the space; not shared
        </Field>
      ))}
      {primary ? (
        <div className="flex min-w-0 flex-col @xs:flex-row @xs:justify-end">{primary}</div>
      ) : null}
    </header>
  );
}
