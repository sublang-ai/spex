// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Groups surface (DR-103; DR-057 named it Space): the home at a
// glance in one header — signed out, the sign-in card; signed in, the
// account, the last read of the Git host with Refresh, the issues and
// Git's presence (space-1, space-3) — over the groups list, each group with
// its spex repositories as rows (space-61). Activating a row opens that
// repository's Sync and Explore tabs beneath the list. The surface
// renders the core's state and runs no Git and no call to the host
// itself: every action is a command, a repository named by its key,
// whose outcome arrives as state (space-29), and the state is re-read
// only on an event, never on a timer (space-2).

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
  repositoryStatePhrase,
  revealBridge,
  revealLabel,
  tildify,
} from "../lib/space.js";
import { Icon } from "./Icon.js";
import { IssuesList, SyncTab } from "./SpaceSync.js";
import { ExploreTab } from "./SpaceExplorer.js";
import { GroupsList, statusDot } from "./SpaceGroups.js";
import { AccountField, SignInCard, useSignIn, type SignInFlow } from "./SpaceSignIn.js";

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
  // A diagnostic shown under issues refuses nothing here: it may be
  // stale once its file is fixed, and Save validates the files as they
  // stand. An operation running here refuses nothing either (space-21):
  // its progress stands on the row instead.
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

export function SpaceSurface({ onOpenSession, onOpenProject }: SpaceSurfaceProps) {
  const groups = useAppStore((state) => state.space);
  const spaceError = useAppStore((state) => state.spaceError);
  const spaceChangeSeq = useAppStore((state) => state.spaceChangeSeq);
  const connection = useAppStore((state) => state.connection);
  const loadSpace = useAppStore((state) => state.loadSpace);
  const spaceRefresh = useAppStore((state) => state.spaceRefresh);
  const connected = connection === "open";
  const now = useClock(true, 30_000);

  const [selected, setSelected] = useState<string>();
  const [issuesOpen, setIssuesOpen] = useState(false);
  // The reader's own Refresh (space-2), counted: it lets the issues
  // list lay itself out afresh (space-48, space-55) and an open members
  // list read the host again (space-62).
  const [refreshes, setRefreshes] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string>();
  const [note, setNote] = useState("");

  const onNote = useCallback<Note>((text) => setNote(text), []);
  const signIn = useSignIn(groups, onNote);

  // The state is read on events only (space-2): the surface opening,
  // the window regaining focus, and Refresh; the core's broadcasts —
  // a sync's end, a sign-in's end, a host read — land through the
  // store, and the announcements below re-read debounced.
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

  const refresh = async () => {
    setRefreshing(true);
    setRefreshError(undefined);
    try {
      await spaceRefresh();
    } catch (cause) {
      const message = (cause as Error).message;
      setRefreshError(message);
      onNote(message);
    } finally {
      setRefreshing(false);
      setRefreshes((count) => count + 1);
    }
  };

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

  const surfaceName = i18n._({
    id: "Groups",
    comment: "the surface: your groups on the Git host and their spex repositories",
  });
  return (
    <section
      data-testid="space-surface"
      aria-label={surfaceName}
      // The surface root is the box the surface scrolls in, positioned
      // so what it holds is contained by it (DR-041 §9); its width is
      // the container every step queries.
      className="@container relative flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden p-4"
    >
      <div role="status" aria-live="polite" className="sr-only" data-testid="space-live">
        {note}
      </div>
      <h1 className="text-lg font-semibold">{surfaceName}</h1>
      {spaceError ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {i18n._("Couldn't read your groups: {reason}", { reason: spaceError })}
        </p>
      ) : null}
      {groups ? (
        <>
          <HomeHeader
            groups={groups}
            now={now}
            connected={connected}
            signIn={signIn}
            refreshing={refreshing}
            refreshError={refreshError}
            onRefresh={() => void refresh()}
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
              connected={connected}
              refreshes={refreshes}
              onSelect={(key) => setSelected((current) => (current === key ? undefined : key))}
              onNote={onNote}
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
          {groups.account ? (
            // Where this device's files are, said once and quietly at
            // the foot (space-1): selectable, the full path in its title.
            <p
              data-testid="space-home"
              title={groups.home}
              className="min-w-0 select-text break-all text-xs text-neutral-500"
            >
              {i18n._("Spex keeps this device's files in {path}", { path: tildify(groups.home) })}
            </p>
          ) : null}
        </>
      ) : !spaceError ? (
        <p className="text-sm text-neutral-500">{i18n._("Reading your groups…")}</p>
      ) : null}
    </section>
  );
}

/** The home at a glance (space-1): signed out, the sign-in card
 * (space-3); signed in, the account, the host's last read with Refresh;
 * the issues the core counts, and Git's presence. Below 42rem the read time yields, below
 * 28rem the host's name (space-28); below 20rem the fields stack, the
 * account's control last and full-width. */
function HomeHeader({
  groups,
  now,
  connected,
  signIn,
  refreshing,
  refreshError,
  onRefresh,
  issuesOpen,
  onIssuesOpen,
  onNote,
}: {
  groups: GroupsState;
  now: number;
  connected: boolean;
  signIn: SignInFlow;
  refreshing: boolean;
  refreshError?: string;
  onRefresh(): void;
  issuesOpen: boolean;
  onIssuesOpen(open: boolean): void;
  onNote: Note;
}) {
  // The core carries the count (space-1), so the header and the list
  // beneath it cannot drift: what the reader has not answered.
  const issueCount = groups.issues;
  const readAt = groups.readAt;
  const row = "flex min-w-0 flex-col gap-1 @xs:flex-row @xs:flex-wrap @xs:items-center @xs:gap-x-3";
  const issues =
    groups.diagnostics.length > 0 ? (
      <button
        type="button"
        data-testid="space-issues"
        aria-expanded={issuesOpen}
        // Amber and the warning glyph say attention is owed. With
        // nothing unanswered none is, so the control stays reachable
        // while reading as settled.
        className={`flex items-center gap-1 text-sm hover:underline ${
          issueCount > 0 ? "text-amber-700 dark:text-amber-300" : "text-neutral-500"
        }`}
        onClick={() => onIssuesOpen(!issuesOpen)}
      >
        {issueCount > 0 ? <span aria-hidden>⚠</span> : null}
        {issueCount > 0
          ? i18n._("{count, plural, one {# issue} other {# issues}}", { count: issueCount })
          : i18n._({ id: "issues", comment: "the control's name when none are unanswered" })}
      </button>
    ) : null;
  return (
    <header
      data-testid="space-header"
      data-stale={connected ? undefined : "1"}
      // While the core is unreachable the last known state stands,
      // muted.
      className={`flex min-w-0 flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900 ${
        connected ? "" : "opacity-70"
      }`}
    >
      {!groups.git.ok ? null : groups.account ? (
        <>
          <AccountField groups={groups} connected={connected} onNote={onNote} />
          <div className={row}>
            <Field
              testId="space-read"
              title={readAt !== null ? absoluteTitle(readAt) : undefined}
              className="min-w-0 flex-1 text-neutral-500"
            >
              {/* The read time is the first at-a-glance word to yield
                  (space-28); Refresh's title still prints it. */}
              <span data-testid="space-read-at" className="hidden min-w-0 truncate text-xs @2xl:inline">
                {readAt !== null
                  ? i18n._("Host read {age}", { age: relativeAge(readAt, now) })
                  : i18n._("Not read yet")}
              </span>
            </Field>
            {issues}
            {refreshError ? (
              <span role="alert" className="min-w-0 text-xs text-red-600 dark:text-red-400">
                {refreshError}
              </span>
            ) : null}
            <button
              type="button"
              data-testid="space-refresh"
              // Only the primary control spans the width when the
              // fields stack (space-28).
              className={`${SECONDARY} self-start @xs:self-auto`}
              disabled={!connected || refreshing}
              title={
                readAt !== null
                  ? i18n._("Reads the host again · last read {at}", { at: absoluteTitle(readAt) })
                  : i18n._("Reads the host again")
              }
              onClick={onRefresh}
            >
              {i18n._({ id: "Refresh", comment: "re-read the groups and the Git host" })}
            </button>
          </div>
        </>
      ) : (
        <>
          <SignInCard groups={groups} signIn={signIn} connected={connected} />
          {issues ? <div className={row}>{issues}</div> : null}
        </>
      )}
      {groups.git.ok ? null : (
        <div data-testid="space-no-git" className="text-sm">
          <p className="font-medium">{i18n._("Git is not installed")}</p>
          <p className="text-xs text-neutral-500">{groups.git.guidance}</p>
        </div>
      )}
    </header>
  );
}

/** An opened spex repository (space-1): its name and state with its
 * clone's path and working folder, over its Sync and Explore tabs. Its
 * Sync control is the row's own. */
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
  const [tab, setTab] = useState<SpaceTab>("sync");

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
  const absent = repo.state === "absent";
  return (
    <section
      id="space-repository"
      data-testid="space-repository"
      aria-label={repo.name}
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-3"
    >
      <div
        data-testid="space-repository-header"
        className="flex min-w-0 flex-col gap-1 rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="flex min-w-0 flex-col gap-1 @xs:flex-row @xs:flex-wrap @xs:items-center @xs:gap-x-3">
          <Field testId="space-repository-name" title={`${repo.key} · ${dot.word}`} className="min-w-0 flex-1">
            <span
              aria-hidden
              data-testid="space-status-dot"
              data-tone={dot.tone}
              className={`inline-block h-2 w-2 shrink-0 rounded-full ${dot.className}`}
            />
            <span className="min-w-0 truncate font-medium">{repo.name}</span>
            <span className="min-w-0 truncate text-xs text-neutral-500">{repositoryStatePhrase(repo, now)}</span>
          </Field>
          {absent ? null : <PathControls path={root} testId="space-clone-path" onNote={onNote} compact />}
        </div>
        {repo.folder ? (
          <span
            data-testid="space-repository-folder"
            className="min-w-0 truncate font-mono text-xs text-neutral-500"
            title={repo.folder}
          >
            {tildify(repo.folder)}
          </span>
        ) : null}
        {repo.state === "read-only" ? (
          <span data-testid="space-read-only-note" className="text-xs text-neutral-500">
            {i18n._("New sessions stay on this device")}
          </span>
        ) : null}
      </div>
      <div
        role="tablist"
        aria-label={i18n._("Views of {name}", { name: repo.name })}
        className="flex flex-wrap items-center gap-1 border-b border-neutral-200 pb-1 dark:border-neutral-800"
      >
        {tabButton("sync", i18n._({ id: "Sync", comment: "tab and control: send and bring back changes" }))}
        {tabButton("explore", i18n._({ id: "Explore", comment: "tab: browse the files of a spex repository" }))}
      </div>
      <div
        role="tabpanel"
        id={`space-panel-${tab}`}
        aria-labelledby={`space-tab-${tab}`}
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-3"
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
        ) : absent ? (
          <p className="text-sm text-neutral-500">{i18n._("Not on this device")}</p>
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
