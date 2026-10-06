// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Space surface (DR-057, DR-103): the home at a glance in one
// header (space-1) over its groups, each listing its spex repositories
// with where their code lives and the state each stands in (space-61).
// Activating a repository's row opens its Sync and Explore tabs
// beneath the list. The surface renders the core's state and runs no
// Git itself: every action is a command naming the repository by its
// key, whose outcome arrives as state (space-29), and the state is
// re-read only on an event, never on a timer (space-2).

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { GroupsState, RepositoryState } from "@sublang/spex-core/protocol";

import { useAppStore } from "../state/store.js";
import { i18n } from "../i18n.js";
import { useClock } from "../lib/useClock.js";
import { absoluteTitle, relativeAge } from "../lib/time.js";
import {
  STEP_LINES,
  STEP_NAMES,
  clonePath,
  displayRemote,
  repositoryStatePhrase,
  revealBridge,
  revealLabel,
  tildify,
} from "../lib/space.js";
import { Icon } from "./Icon.js";
import { InlineConfirm } from "./InlineConfirm.js";
import { IssuesList, SyncTab } from "./SpaceSync.js";
import { ExploreTab } from "./SpaceExplorer.js";

export interface SpaceSurfaceProps {
  /** Open a session as its tab (space-7, run-view-68). */
  onOpenSession(sessionId: string): void;
  /** Open the repaired project, the one control here that leaves the
   * surface (space-48). */
  onOpenProject(projectId: string): void;
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

/** Every spex repository of the home, in the groups list's order. */
export function allRepositories(groups: GroupsState): RepositoryState[] {
  return groups.groups.flatMap((group) => group.repositories);
}

/** Why Sync is refused before its first step (space-11): the words
 * shown beside the disabled control. Undefined when the surface knows
 * no reason, the core deciding the rest at admission and its refusal
 * shown in the same place. */
export function syncRefusal(
  groups: GroupsState,
  repo: RepositoryState,
): string | undefined {
  if (!groups.git.ok) return groups.git.guidance;
  if (repo.state === "absent") return i18n._("Not on this device");
  if (repo.branch?.mergePending) {
    return i18n._("Finish or abort the merge in your terminal");
  }
  // A blocking diagnostic of this clone: its file lies beneath it.
  const blocking = groups.diagnostics.find(
    (entry) =>
      entry.blocking &&
      (entry.repair?.repository === repo.key ||
        entry.file.includes(`workspace/${repo.key}/`) ||
        entry.file.startsWith(`${repo.key}/`)),
  );
  if (blocking) return `${blocking.file}: ${blocking.reason}`;
  if (repo.sync.phase === "running" && repo.sync.op !== "sync") {
    return i18n._("Another operation is running");
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
      onNote(i18n._("Copy is not available here; the path is shown to select."));
      return;
    }
    void write
      .then(() => {
        setCopied(true);
        setFallback(false);
        onNote(i18n._("Copied {what}", { what: path }));
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        setFallback(true);
        onNote(i18n._("Copy is not available here; the path is shown to select."));
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
                onNote(i18n._("Couldn't show it in the file manager"));
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
        aria-label={i18n._("Copy path")}
        title={i18n._("Copy path")}
        className={SECONDARY}
        onClick={copy}
      >
        {compact ? (
          <Icon name="copy" className="h-3.5 w-3.5" />
        ) : copied ? (
          i18n._({ id: "Copied", comment: "the copy control, just after it copied" })
        ) : (
          i18n._("Copy path")
        )}
      </button>
      {copied && compact ? (
        <span className="text-xs text-neutral-500">
          {i18n._({ id: "Copied", comment: "the copy control, just after it copied" })}
        </span>
      ) : null}
      {revealFailed ? (
        <span className="text-xs text-neutral-500">
          {i18n._("Couldn't show it in the file manager")}
        </span>
      ) : null}
      {fallback ? (
        <input
          readOnly
          aria-label={i18n._({ id: "Path", comment: "field holding a path to select and copy" })}
          data-testid={`${testId}-field`}
          value={path}
          onFocus={(event) => event.currentTarget.select()}
          className="min-w-0 max-w-full rounded border border-neutral-300 bg-transparent px-1.5 py-0.5 font-mono text-xs dark:border-neutral-700"
        />
      ) : null}
    </span>
  );
}

/** A spex repository's remote (space-5): the way a reader gives a
 * clone a remote until the Git host sets it up (DR-103) — an in-place
 * editor with Save and Cancel, Escape cancelling, an empty field
 * removing it. The host's own URLs are never edited here. */
function RemoteRow({
  repository,
  disabled,
}: {
  repository: string;
  disabled: boolean;
}) {
  const spaceSetRemote = useAppStore((state) => state.spaceSetRemote);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (editing) {
      setDraft("");
      setError(undefined);
      inputRef.current?.focus();
    } else if (returnFocus.current) {
      returnFocus.current = false;
      editRef.current?.focus();
    }
  }, [editing]);

  const close = () => {
    returnFocus.current = true;
    setEditing(false);
  };

  const save = async () => {
    setSaving(true);
    setError(undefined);
    try {
      const url = draft.trim();
      await spaceSetRemote(repository, url === "" ? null : url);
      close();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
    } else if (event.key === "Enter") {
      event.preventDefault();
      void save();
    }
  };

  if (!editing) {
    return (
      <button
        ref={editRef}
        type="button"
        data-testid="space-remote-edit"
        className={SECONDARY}
        disabled={disabled}
        title={i18n._("Name where this spex repository's records are kept")}
        onClick={() => setEditing(true)}
      >
        {i18n._("Set remote")}
      </button>
    );
  }
  return (
    <span
      data-testid="space-remote-editor"
      className="flex min-w-0 flex-1 flex-wrap items-center gap-1"
      onKeyDown={onKeyDown}
    >
      <label className="sr-only" htmlFor="space-remote-input">
        {i18n._("Remote URL")}
      </label>
      <input
        id="space-remote-input"
        ref={inputRef}
        data-testid="space-remote-input"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={i18n._("git@host:path or https://…")}
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
        {saving
          ? i18n._({ id: "Saving…", comment: "the Save control, while the save is in flight" })
          : i18n._({ id: "Save", comment: "save the edited remote URL" })}
      </button>
      <button type="button" className={SECONDARY} disabled={saving} onClick={close}>
        {i18n._({ id: "Cancel", comment: "leave the editor without changing anything" })}
      </button>
      {error ? (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      ) : null}
    </span>
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

/** A repository's dot carries the status palette (DR-010 §8): neutral
 * idle, emerald running, amber choices and unrelated, red stopped. */
function statusDot(repo: RepositoryState): { className: string; word: string } {
  const sync = repo.sync;
  if (sync.phase === "running") {
    return { className: "bg-emerald-500 animate-pulse", word: STEP_LINES[sync.step]() };
  }
  if (sync.phase === "choices" || sync.phase === "unrelated") {
    return {
      className: "bg-amber-500",
      word:
        sync.phase === "choices"
          ? i18n._({ id: "needs your choice", comment: "the space's status, read in a title" })
          : i18n._({ id: "unrelated history", comment: "the space's status, read in a title" }),
    };
  }
  if (sync.phase === "stopped") {
    return {
      className: sync.cause === "rejected" ? "bg-amber-500" : "bg-red-500",
      word: i18n._({
        id: "{step} stopped",
        values: { step: STEP_NAMES[sync.step]() },
        comment: "{step} is the sync step's name",
      }),
    };
  }
  return {
    className: "bg-neutral-400",
    word: i18n._({ id: "idle", comment: "the space's status: nothing is running" }),
  };
}

export function SpaceSurface({ onOpenSession, onOpenProject }: SpaceSurfaceProps) {
  const groups = useAppStore((state) => state.space);
  const spaceError = useAppStore((state) => state.spaceError);
  const spaceReadAt = useAppStore((state) => state.spaceReadAt);
  const spaceChangeSeq = useAppStore((state) => state.spaceChangeSeq);
  const connection = useAppStore((state) => state.connection);
  const loadSpace = useAppStore((state) => state.loadSpace);
  const connected = connection === "open";
  const now = useClock(true, 30_000);

  const [selected, setSelected] = useState<string>();
  const [issuesOpen, setIssuesOpen] = useState(false);
  // The reader's own Refresh (space-2), counted: it lets the issues
  // list lay itself out afresh (space-48, space-55).
  const [refreshes, setRefreshes] = useState(0);
  const [note, setNote] = useState("");

  const onNote = useCallback<Note>((text) => setNote(text), []);

  // The state is read on events only (space-2): the surface opening,
  // the window regaining focus, and Refresh; the core's broadcasts
  // land through the store, and the announcements below re-read
  // debounced.
  // The surface can open before the core is reachable — a launch
  // restores the surface the reader left (run-view-67) — so the read
  // waits for the connection rather than reporting it as a failure.
  useEffect(() => {
    if (!connected) return;
    void loadSpace();
    const onFocus = () => void loadSpace();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadSpace, connected]);

  const firstSeq = useRef(spaceChangeSeq);
  useEffect(() => {
    if (spaceChangeSeq === firstSeq.current) return;
    const timer = setTimeout(() => void loadSpace(), 300);
    return () => clearTimeout(timer);
  }, [spaceChangeSeq, loadSpace]);

  const repo = groups ? allRepositories(groups).find((entry) => entry.key === selected) : undefined;

  // The polite live region narrates the open repository's steps
  // (DR-010 §7).
  const sync = repo?.sync;
  const syncKey = sync ? JSON.stringify(sync) : "";
  useEffect(() => {
    if (!sync) return;
    if (sync.phase === "running") setNote(STEP_LINES[sync.step]());
    else if (sync.phase === "choices") setNote(i18n._("Needs your choice"));
    else if (sync.phase === "unrelated") setNote(i18n._("Unrelated history"));
    else if (sync.phase === "stopped") {
      setNote(
        i18n._({
          id: "{step} stopped — {message}",
          values: { step: STEP_NAMES[sync.step](), message: sync.message },
          comment: "{step} is the sync step's name; {message} is the cause the host gave",
        }),
      );
    } else if (sync.phase === "done") {
      setNote(
        sync.sent + sync.received === 0
          ? i18n._("Everything is in sync")
          : i18n._("Synced · {sent} sent · {received} received", {
              sent: sync.sent,
              received: sync.received,
            }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncKey]);

  return (
    <section
      data-testid="space-surface"
      aria-label={i18n._("Space")}
      // The surface root is the box the surface scrolls in, positioned
      // so what it holds is contained by it (DR-041 §9); its width is
      // the container every step queries.
      className="@container relative flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
    >
      <div role="status" aria-live="polite" className="sr-only" data-testid="space-live">
        {note}
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold">{i18n._("Space")}</h1>
        <span className="flex items-center gap-2 text-xs text-neutral-500">
          {spaceReadAt ? (
            <span title={absoluteTitle(spaceReadAt)} data-testid="space-read-at">
              {i18n._("Read {age}", { age: relativeAge(spaceReadAt, now) })}
            </span>
          ) : null}
          <button
            type="button"
            data-testid="space-refresh"
            className={SECONDARY}
            disabled={!connected}
            onClick={() => void loadSpace().then(() => setRefreshes((count) => count + 1))}
          >
            {i18n._({ id: "Refresh", comment: "re-read the space's state" })}
          </button>
        </span>
      </div>
      {spaceError ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {i18n._("Couldn't read the space: {reason}", { reason: spaceError })}
        </p>
      ) : null}
      {groups ? (
        <>
          <HomeHeader
            groups={groups}
            connected={connected}
            issuesOpen={issuesOpen}
            onIssuesOpen={setIssuesOpen}
            onNote={onNote}
          />
          <IssuesList
            groups={groups}
            connected={connected}
            open={issuesOpen}
            refreshes={refreshes}
            onOpenProject={onOpenProject}
            onNote={onNote}
          />
          {groups.git.ok ? (
            <GroupsList
              groups={groups}
              now={now}
              selected={selected}
              onSelect={(key) => setSelected((current) => (current === key ? undefined : key))}
            />
          ) : null}
          {repo && groups.git.ok ? (
            <RepositoryPanel
              key={repo.key}
              groups={groups}
              repo={repo}
              now={now}
              connected={connected}
              onOpenSession={onOpenSession}
              onNote={onNote}
            />
          ) : null}
        </>
      ) : !spaceError ? (
        <p className="text-sm text-neutral-500">{i18n._("Reading the space…")}</p>
      ) : null}
    </section>
  );
}

/** The home at a glance (space-1): its path, the account, Git's
 * presence and the issues the core counts. */
function HomeHeader({
  groups,
  connected,
  issuesOpen,
  onIssuesOpen,
  onNote,
}: {
  groups: GroupsState;
  connected: boolean;
  issuesOpen: boolean;
  onIssuesOpen(open: boolean): void;
  onNote: Note;
}) {
  // The core carries the count (space-1), so the header and the list
  // beneath it cannot drift: what the reader has not answered.
  const issueCount = groups.issues;
  const host = groups.host.displayName ?? groups.host.url;
  return (
    <header
      data-testid="space-header"
      data-stale={connected ? undefined : "1"}
      // Below @xs the fields stack; above it they flow in rows
      // (space-28). While the core is unreachable the last known state
      // stands, muted.
      className={`flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900 ${
        connected ? "" : "opacity-70"
      }`}
    >
      <div className="flex min-w-0 flex-col gap-1 @xs:flex-row @xs:flex-wrap @xs:items-center @xs:gap-x-3">
        <Field testId="space-path" title={groups.home} className="min-w-0 flex-1">
          <span className="min-w-0 truncate font-mono text-sm">{tildify(groups.home)}</span>
        </Field>
        <PathControls path={groups.home} testId="space-path" onNote={onNote} />
      </div>
      {groups.git.ok ? (
        <div className="flex min-w-0 flex-col gap-1 @xs:flex-row @xs:flex-wrap @xs:items-center @xs:gap-x-3">
          <Field testId="space-account" title={groups.host.url}>
            {groups.account ? (
              <span className="min-w-0 truncate">
                {i18n._("Signed in as {login} at {host}", { login: groups.account.login, host })}
              </span>
            ) : (
              <span className="text-neutral-500">{i18n._("Not signed in")}</span>
            )}
          </Field>
          {groups.diagnostics.length > 0 ? (
            <button
              type="button"
              data-testid="space-issues"
              aria-expanded={issuesOpen}
              // Amber and the warning glyph say attention is owed.
              // With nothing unanswered none is, so the control
              // stays reachable while reading as settled.
              className={`flex items-center gap-1 text-sm hover:underline ${
                issueCount > 0
                  ? "text-amber-700 dark:text-amber-300"
                  : "text-neutral-500"
              }`}
              onClick={() => onIssuesOpen(!issuesOpen)}
            >
              {issueCount > 0 ? <span aria-hidden>⚠</span> : null}
              {issueCount > 0
                ? i18n._("{count, plural, one {# issue} other {# issues}}", {
                    count: issueCount,
                  })
                : i18n._({ id: "issues", comment: "the control's name when none are unanswered" })}
            </button>
          ) : null}
        </div>
      ) : (
        <div data-testid="space-no-git" className="text-sm">
          <p className="font-medium">{i18n._("Git is not installed")}</p>
          <p className="text-xs text-neutral-500">{groups.git.guidance}</p>
        </div>
      )}
    </header>
  );
}

/** The groups list (space-1): each group with its full path and, under
 * it, one row per spex repository — its name, its working folder here,
 * where its code lives and the state it stands in (space-61). A row
 * opens that repository's tabs beneath the list. */
function GroupsList({
  groups,
  now,
  selected,
  onSelect,
}: {
  groups: GroupsState;
  now: number;
  selected?: string;
  onSelect(key: string): void;
}) {
  return (
    <section
      data-testid="space-groups"
      aria-label={i18n._({ id: "Groups", comment: "the list of the home's groups and their spex repositories" })}
      className="flex flex-col gap-3"
    >
      {groups.groups.map((group) => (
        <div key={group.fullPath} data-testid={`space-group-${group.fullPath}`} className="flex flex-col gap-1">
          <h2 className="flex min-w-0 items-baseline gap-2 text-sm font-medium">
            <span className="min-w-0 truncate">{group.name}</span>
            <span className="min-w-0 truncate text-xs font-normal text-neutral-500" title={group.fullPath}>
              {group.fullPath}
            </span>
          </h2>
          {group.repositories.length === 0 ? (
            <p className="pl-2 text-xs text-neutral-500">{i18n._("No spex repositories here yet")}</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {group.repositories.map((repo) => (
                <RepositoryRow
                  key={repo.key}
                  repo={repo}
                  now={now}
                  selected={repo.key === selected}
                  onSelect={() => onSelect(repo.key)}
                />
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}

/** One spex repository's row (space-1, space-61): the name owns the
 * slack, the folder and code remote hide below @md (space-28). */
function RepositoryRow({
  repo,
  now,
  selected,
  onSelect,
}: {
  repo: RepositoryState;
  now: number;
  selected: boolean;
  onSelect(): void;
}) {
  const folder = repo.folder
    ? tildify(repo.folder)
    : repo.state === "absent"
      ? i18n._("Not on this device")
      : i18n._("No working folder here");
  const code = repo.code
    ? displayRemote(repo.code)
    : i18n._({ id: "No code", comment: "a spex repository whose records name no code remote" });
  const state = repositoryStatePhrase(repo, now);
  const dot = statusDot(repo);
  // The row is named by the repository alone, its folder, code and
  // state describing it: a name that holds still while the state's
  // age ticks on (DR-041).
  const describe = (part: string) => `space-repo-${part}-${repo.key}`;
  return (
    <li className="@container min-w-0">
      <button
        type="button"
        data-testid={`space-repo-${repo.key}`}
        data-state={repo.state}
        aria-label={repo.name}
        aria-describedby={[describe("folder"), describe("code"), describe("state")].join(" ")}
        aria-expanded={selected}
        aria-controls={selected ? "space-repository" : undefined}
        onClick={onSelect}
        className={`flex w-full min-w-0 items-center gap-2 rounded px-2 py-1 text-left text-sm ${
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
        <span
          id={describe("folder")}
          data-testid={`space-repo-folder-${repo.key}`}
          className="hidden min-w-0 max-w-[30%] truncate font-mono text-xs text-neutral-500 @md:inline"
          title={repo.folder ?? undefined}
        >
          {folder}
        </span>
        <span
          id={describe("code")}
          data-testid={`space-repo-code-${repo.key}`}
          className="hidden min-w-0 max-w-[30%] truncate font-mono text-xs text-neutral-500 @md:inline"
          title={repo.code ?? undefined}
        >
          {code}
        </span>
        {repo.local.length > 0 ? (
          <span className="shrink-0 text-xs text-neutral-500">
            {i18n._("{count, plural, one {# change} other {# changes}}", { count: repo.local.length })}
          </span>
        ) : null}
        <span
          id={describe("state")}
          data-testid={`space-repo-state-${repo.key}`}
          className="min-w-0 max-w-[40%] shrink-0 truncate text-xs text-neutral-500"
          title={repo.waiting ? repo.waiting.message : state}
        >
          {state}
        </span>
      </button>
    </li>
  );
}

/** An opened spex repository (space-1): its state at a glance with the
 * control its state offers, over its Sync and Explore tabs. */
function RepositoryPanel({
  groups,
  repo,
  now,
  connected,
  onOpenSession,
  onNote,
}: {
  groups: GroupsState;
  repo: RepositoryState;
  now: number;
  connected: boolean;
  onOpenSession(sessionId: string): void;
  onNote: Note;
}) {
  const spaceSync = useAppStore((state) => state.spaceSync);
  const [tab, setTab] = useState<SpaceTab>("sync");
  const [busy, setBusy] = useState<"join" | "sync">();
  // A long command's reply is only "accepted": its control stays busy
  // until the machine's state moves — the running frame, or an outcome
  // that landed first — so nothing re-enables between the reply and
  // the state (DR-010 §3, space-29).
  const [accepted, setAccepted] = useState<{ op: "join" | "sync"; key: string }>();
  const [confirm, setConfirm] = useState<"join" | "notice">();
  const [actionError, setActionError] = useState<string>();

  const sync = repo.sync;
  const branch = repo.branch;
  const running = sync.phase === "running";
  const syncKey = JSON.stringify(sync);
  useEffect(() => {
    if (accepted && accepted.key !== syncKey) setAccepted(undefined);
  }, [accepted, syncKey]);

  const start = async (input: { join?: boolean; noticed?: boolean }) => {
    const key = syncKey;
    const op = input.join ? "join" : "sync";
    setBusy(op);
    setActionError(undefined);
    try {
      await spaceSync(repo.key, input);
      setAccepted({ op, key });
    } catch (cause) {
      const message = (cause as Error).message;
      setActionError(message);
      onNote(message);
    } finally {
      setBusy(undefined);
    }
  };

  const disabled = !connected;
  const pending = busy !== undefined || accepted !== undefined || running;
  const unrelated = sync.phase === "unrelated" || branch?.unrelated === true;
  const refusal = syncRefusal(groups, repo);
  // The first push to a repository others share says once what goes
  // there (space-57); one whose only member is the account says nothing.
  const needsNotice = !repo.noticed && (repo.members ?? 0) > 1;
  const joining = busy === "join" || accepted?.op === "join" || (running && sync.op === "join");
  const syncing = busy === "sync" || accepted?.op === "sync" || (running && sync.op !== "join" && sync.op !== "check");

  let primary: ReactNode;
  if (confirm === "join") {
    primary = (
      <span data-testid="space-join-confirm">
        <InlineConfirm
          question={i18n._("Join both histories into one? Anything that differs will ask you to choose.")}
          confirmLabel={i18n._({ id: "Join", comment: "confirm: join both histories into one" })}
          onConfirm={() => {
            setConfirm(undefined);
            void start({ join: true });
          }}
          onCancel={() => setConfirm(undefined)}
        />
      </span>
    );
  } else if (confirm === "notice") {
    primary = (
      <span data-testid="space-notice-confirm">
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
            setConfirm(undefined);
            void start({ noticed: true });
          }}
          onCancel={() => setConfirm(undefined)}
        />
      </span>
    );
  } else {
    const label = unrelated
      ? joining
        ? i18n._({ id: "Joining…", comment: "the Join control, while the join runs" })
        : i18n._({ id: "Join", comment: "confirm: join both histories into one" })
      : syncing
        ? i18n._({ id: "Syncing…", comment: "the Sync control, while the sync runs" })
        : i18n._({ id: "Sync", comment: "tab and control: send and bring back changes" });
    primary = (
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="space-primary"
          className={`${PRIMARY} w-full @xs:w-auto`}
          disabled={disabled || refusal !== undefined || pending}
          aria-describedby={refusal || actionError ? "space-primary-caption" : undefined}
          // What the control does is its own to say (DR-069); a running
          // control's word says it already.
          title={
            pending
              ? undefined
              : unrelated
                ? i18n._("Brings both histories into one and asks about anything that differs")
                : i18n._("Sends what is here and brings back anything new")
          }
          onClick={() => {
            if (unrelated) setConfirm("join");
            else if (needsNotice) setConfirm("notice");
            else void start({});
          }}
        >
          {label}
        </button>
        {refusal && !running ? (
          <span
            id="space-primary-caption"
            data-testid="space-primary-caption"
            className="min-w-0 text-xs text-neutral-500"
          >
            {refusal}
          </span>
        ) : actionError ? (
          <span
            id="space-primary-caption"
            role="alert"
            className="min-w-0 text-xs text-red-600 dark:text-red-400"
          >
            {actionError}
          </span>
        ) : null}
      </span>
    );
  }

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

  const dot = statusDot(repo);
  const root = clonePath(groups.home, repo.key);
  return (
    <section
      id="space-repository"
      data-testid="space-repository"
      aria-label={repo.name}
      className="flex min-h-0 flex-1 flex-col gap-3"
    >
      <div
        data-testid="space-repository-header"
        className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="flex min-w-0 flex-col gap-1 @xs:flex-row @xs:flex-wrap @xs:items-center @xs:gap-x-3">
          <Field testId="space-repository-name" title={`${repo.key} · ${dot.word}`} className="min-w-0 flex-1">
            <span
              aria-hidden
              data-testid="space-status-dot"
              data-tone={dot.className.includes("emerald") ? "running" : dot.className.includes("amber") ? "attention" : dot.className.includes("red") ? "stopped" : "idle"}
              className={`inline-block h-2 w-2 shrink-0 rounded-full ${dot.className}`}
            />
            <span className="min-w-0 truncate font-medium">{repo.name}</span>
            <span className="min-w-0 truncate text-xs text-neutral-500">
              {repositoryStatePhrase(repo, now)}
            </span>
          </Field>
          <PathControls path={root} testId="space-clone-path" onNote={onNote} compact />
        </div>
        <div className="flex min-w-0 flex-col gap-1 @xs:flex-row @xs:flex-wrap @xs:items-center @xs:gap-x-3">
          {branch && branch.checkedAt !== null && !unrelated ? (
            <Field
              testId="space-ahead-behind"
              title={i18n._(
                "{ahead, plural, one {# commit} other {# commits}} ahead, {behind, plural, one {# commit} other {# commits}} behind · checked {at}",
                {
                  ahead: branch.ahead ?? 0,
                  behind: branch.behind ?? 0,
                  at: absoluteTitle(branch.checkedAt),
                },
              )}
            >
              {/* The words yield after the times (space-28): below
                  28rem the numbers stand with the arrows, the words
                  riding the accessible text. */}
              <span aria-hidden>↑</span>
              <span>
                {branch.ahead ?? 0}
                <span className="sr-only @md:not-sr-only">
                  {i18n._({
                    id: " ahead",
                    comment: "follows the count of commits this device is ahead by",
                  })}
                </span>
              </span>
              <span aria-hidden>↓</span>
              <span>
                {branch.behind ?? 0}
                <span className="sr-only @md:not-sr-only">
                  {i18n._({
                    id: " behind",
                    comment: "follows the count of commits this device is behind by",
                  })}
                </span>
              </span>
              <span className="hidden text-neutral-500 @2xl:inline">
                {i18n._("· checked {age}", { age: relativeAge(branch.checkedAt, now) })}
              </span>
            </Field>
          ) : null}
          <Field
            testId="space-last-sync"
            title={repo.lastSync ? absoluteTitle(repo.lastSync.at) : undefined}
          >
            {repo.lastSync ? (
              <span>
                {i18n._({ id: "Synced", comment: "header field: this space last synced" })}
                <span className="sr-only @2xl:not-sr-only">
                  {" "}
                  {relativeAge(repo.lastSync.at, now)}
                </span>
              </span>
            ) : (
              <span className="text-neutral-500">{i18n._("Never synced")}</span>
            )}
          </Field>
          <button
            type="button"
            data-testid="space-local-count"
            // The count links into the Sync tab; its words fit the
            // control budget and the whole phrase rides the name
            // (space-28, DR-041).
            aria-label={i18n._(
              "{count, plural, one {# local change} other {# local changes}}",
              { count: repo.local.length },
            )}
            title={i18n._("Units this device changed, listed under Sync")}
            className="text-sm hover:underline"
            onClick={() => setTab("sync")}
          >
            {i18n._("{count, plural, one {# change} other {# changes}}", {
              count: repo.local.length,
            })}
          </button>
          <RemoteRow repository={repo.key} disabled={disabled || running} />
        </div>
        {repo.state !== "absent" ? (
          <div className="flex min-w-0 flex-col @xs:flex-row @xs:justify-end">{primary}</div>
        ) : null}
      </div>
      <div
        role="tablist"
        aria-label={i18n._("Space views")}
        className="flex flex-wrap items-center gap-1 border-b border-neutral-200 pb-1 dark:border-neutral-800"
      >
        {tabButton(
          "sync",
          i18n._({ id: "Sync", comment: "tab and control: send and bring back changes" }),
        )}
        {tabButton(
          "explore",
          i18n._({ id: "Explore", comment: "tab: browse the files in the space" }),
        )}
      </div>
      <div
        role="tabpanel"
        id={`space-panel-${tab}`}
        aria-labelledby={`space-tab-${tab}`}
        className="flex min-h-0 flex-1 flex-col gap-3"
      >
        {tab === "sync" ? (
          <SyncTab
            groups={groups}
            repo={repo}
            now={now}
            connected={connected}
            onOpenSession={onOpenSession}
            onNote={onNote}
          />
        ) : (
          <ExploreTab
            repo={repo}
            root={root}
            connected={connected}
            onOpenSession={onOpenSession}
            onNote={onNote}
          />
        )}
      </div>
    </section>
  );
}
