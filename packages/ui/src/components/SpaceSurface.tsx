// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Space surface (DR-103, DR-127, DR-159, DR-172; DR-057 named it):
// one header — while the home lists no Space, the card "Sign in to a
// Space"; while any is signed in, Refresh, reading each, titled with when
// it last did; "⚠ <n> to fix"; and Git's presence (space-1, space-3) —
// over the groups list, each Space under its heading with its groups as
// a tree and their projects as rows, and "This computer" for what is in
// no group (space-61), and at this computer, under each group, the team
// servers it lists with Connect or "Connected" (run-view-170). The
// surface reads the store of the place the selector names (run-view-168),
// and at a seat's place names the server wherever it would name this
// computer (space-112). Activating a row's name opens its records' Sync
// and Explore tabs immediately beneath that row, "Explore records" its Explore tab,
// the row followed by its folder where its clone moves (storage-38). The
// surface renders the core's state and runs no Git and no call to a Space
// itself: every action is a command, records named by their key, whose
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
import type { GroupsState, RepositoryState } from "@sublang/spex-core/protocol";

import { usePlaceStore } from "../state/place-context.js";
import { isLocalPlace } from "../state/store.js";
import { i18n } from "../i18n.js";
import { useClock } from "../lib/useClock.js";
import { allRepositories, anySignedIn, standingOf, thisComputerRows } from "../lib/instances.js";
import { instanceNameAt } from "../lib/placements.js";
import { relativeAge } from "../lib/time.js";
import {
  STEP_LINES,
  STEP_NAMES,
  cloneHere,
  clonePath,
  notHerePhrase,
  phraseNames,
  revealBridge,
  revealLabel,
  rowName,
  rowPhrase,
  seatName,
  tildify,
} from "../lib/space.js";
import { Icon } from "./Icon.js";
import { PanelCloseButton } from "./PanelCloseButton.js";
import { ATTACHED_PANEL } from "./SpacePanel.js";
import { ChoicesContext, SyncTab, createChoices, forgetCompleted } from "./SpaceSync.js";
import { ExploreTab } from "./SpaceExplorer.js";
import { GroupsList } from "./SpaceGroups.js";
import { IssuesList } from "./SpaceRepairs.js";
import { SignInCard, useSignIn, type SignInFlow } from "./SpaceSignIn.js";
import { useServers } from "./SpaceServers.js";

export interface SpaceSurfaceProps {
  /** Open a session as its tab (space-7, run-view-68). */
  onOpenSession(sessionId: string): void;
  /** Show a project on the Projects surface: the repaired one, the one
   * control of a repair that leaves the surface (space-48), and a row's
   * "Show" or "Show on <server>", at the place named — the one shown
   * where none is (space-111). */
  onOpenProject(projectId: string, place?: string): void;
  /** Open this place's Credentials section at a code host whose clone
   * failed for want of the member's credential (space-103, settings-48). */
  onAddCredential?(host: string): void;
  /** A saved conversation returns to its folder choices, even if dismissed. */
  reviewRequest?: number;
  /** Consume the request so a later ordinary visit keeps its own open state. */
  onReviewOpened?(): void;
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

/** Why Sync is refused before its first step (space-11): the words
 * shown beside the disabled control. Undefined when the surface knows
 * no reason, the core deciding the rest at admission and its refusal
 * shown in the same place. */
export function syncRefusal(
  groups: GroupsState,
  repo: RepositoryState,
  /** The server whose Space is shown, named where this computer would
   * be (space-112). */
  seat?: string,
): string | undefined {
  if (!groups.git.ok) return groups.git.guidance;
  if (repo.state === "absent") return notHerePhrase(seat);
  if (repo.mergePending) {
    return i18n._("Finish or abort the merge in your terminal");
  }
  // A diagnostic shown under issues refuses nothing here: it may be
  // stale once its file is fixed, and Save validates the files as they
  // stand. An operation running here refuses nothing either (space-21):
  // its progress stands on the row instead.
  return undefined;
}

/** What the live note says where no clipboard copies (space-26). */
const copyUnavailable = (): string =>
  i18n._({ id: "Copy unavailable — select the path", comment: "the live note where the page has no clipboard access: the path stands in a field to select" });

/** Reveal in the file manager where the bridge exists, Copy path
 * otherwise (space-26): the copy is acknowledged in words, and a page
 * with no clipboard falls back to a selectable read-only field. A
 * remote place's path is on its server, so nothing reveals it there
 * (run-view-169). */
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
  const local = isLocalPlace(usePlaceStore().place);
  const reveal = local ? revealBridge() : undefined;
  const revealName = revealLabel();

  const copy = () => {
    const write = navigator.clipboard?.writeText?.(path);
    if (!write) {
      setFallback(true);
      onNote(copyUnavailable());
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
        onNote(copyUnavailable());
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

export function SpaceSurface({ onOpenSession, onOpenProject, onAddCredential, reviewRequest, onReviewOpened }: SpaceSurfaceProps) {
  const store = usePlaceStore();
  const groups = store((state) => state.space);
  const spaceError = store((state) => state.spaceError);
  const spaceChangeSeq = store((state) => state.spaceChangeSeq);
  const connection = store((state) => state.connection);
  const loadSpace = store((state) => state.loadSpace);
  const spaceRefresh = store((state) => state.spaceRefresh);
  const seats = store((state) => state.seats);
  const connected = connection === "open";
  const seat = seatName(store.place);
  const now = useClock(true, 30_000);
  // The servers each signed-in instance lists (run-view-170), at this
  // computer alone, whose core holds the seats: read as the surface
  // opens, and again as the signed-in instances or the open seats
  // change.
  const signedIn = groups?.instances.filter((instance) => instance.signedIn).map((instance) => instance.origin) ?? [];
  const servers = useServers(
    connected && isLocalPlace(store.place) && signedIn.length > 0
      ? JSON.stringify([signedIn, seats.map((entry) => entry.place)])
      : undefined,
  );

  const [selected, setSelected] = useState<string>();
  const surfaceRef = useRef<HTMLElement>(null);
  const [repositoryPending, setRepositoryPending] = useState(false);
  const [repositoryFocus, setRepositoryFocus] = useState(0);
  const repositoryOpener = useRef<HTMLElement | null>(null);
  const closeRepository = () => {
    if (repositoryPending) return;
    setSelected(undefined);
    setTimeout(() => {
      const opener = repositoryOpener.current;
      if (opener?.isConnected && !(opener instanceof HTMLButtonElement && opener.disabled)) opener.focus();
      else {
        const row = Array.from(surfaceRef.current?.querySelectorAll<HTMLButtonElement>("button[data-testid]") ?? [])
          .find((button) => button.dataset.testid === `space-repo-${selected}` && !button.disabled);
        (row ?? surfaceRef.current)?.focus();
      }
    }, 0);
  };
  // The opened row's tab: its name opens Sync, "Explore records" Explore
  // (space-1).
  const [tab, setTab] = useState<SpaceTab>("sync");
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [issuesPending, setIssuesPending] = useState(false);
  const issuesOpener = useRef<HTMLElement | null>(null);
  const previousBlockers = useRef<ReadonlySet<string>>(new Set());
  const blockerKey = JSON.stringify(groups?.diagnostics.filter((entry) => entry.blocking)
    .map((entry) => JSON.stringify([entry.file, entry.reason])).sort() ?? []);
  useEffect(() => {
    const current = new Set<string>(JSON.parse(blockerKey));
    if ([...current].some((key) => !previousBlockers.current.has(key))) setIssuesOpen(true);
    previousBlockers.current = current;
  }, [blockerKey]);
  const closeIssues = () => {
    if (issuesPending) return;
    setIssuesOpen(false);
    setRevealDismissed(undefined);
    setTimeout(() => {
      const opener = issuesOpener.current;
      if (opener?.isConnected && opener !== document.body && opener !== document.documentElement &&
        !(opener instanceof HTMLButtonElement && opener.disabled)) opener.focus();
      if (!opener || document.activeElement !== opener || opener === document.body) {
        (surfaceRef.current?.querySelector<HTMLButtonElement>('[data-testid="space-issues"]') ?? surfaceRef.current)?.focus();
      }
    }, 0);
  };
  const [revealDismissed, setRevealDismissed] = useState<number>();
  useEffect(() => {
    if (reviewRequest === undefined) return;
    issuesOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setIssuesOpen(true);
    setRevealDismissed(reviewRequest);
    onReviewOpened?.();
  }, [reviewRequest, onReviewOpened]);
  const focusedReview = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!issuesOpen || revealDismissed === undefined || focusedReview.current === revealDismissed) return;
    // Back to Space removes the reader's button. Land on the named
    // toggle once its place's state has rendered, and keep it as the
    // review's return target. Ordinary background reads never move focus.
    const control = surfaceRef.current?.querySelector<HTMLButtonElement>('[data-testid="space-issues"]');
    if (!control || control.disabled) return;
    focusedReview.current = revealDismissed;
    issuesOpener.current = control;
    control.focus();
  }, [issuesOpen, revealDismissed, groups]);
  // The reader's own Refresh (space-2), counted: it lets the issues
  // list lay itself out afresh (space-48, space-55) and an open members
  // list read the host again (space-62).
  const [refreshes, setRefreshes] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string>();
  const [note, setNote] = useState("");
  // The sync phase the reader dismissed on each repository's Sync tab,
  // by its key: the outcome cards it put away, and the same outcomes on
  // its row's placement lines (space-15, space-87), stay away while the
  // surface stands, whichever row is open.
  const [dismissed, setDismissed] = useState<Readonly<Record<string, string>>>({});

  const onNote = useCallback<Note>((text) => setNote(text), []);
  const signIn = useSignIn(groups, onNote);
  // The conflicts' choices the surface's pickers share — beneath a row
  // and in its Sync tab — until that repository's sync completes
  // (space-14, space-17).
  const [choices] = useState(createChoices);
  useEffect(() => {
    if (groups) forgetCompleted(choices, store.place.key, allRepositories(groups));
  }, [groups, choices, store]);

  // The state is read on events only (space-2): the surface opening,
  // the window regaining focus, and Refresh; the core's broadcasts —
  // a sync's end, a sign-in's end, a host read — land through the
  // store, and the announcements below re-read debounced — the store
  // counting only those that can move what Space shows (space-29).
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
    else if (sync.phase === "unrelated" && groups) {
      setNote(
        i18n._({
          id: "Started separately at {name}",
          // The path placement reads as its remote does (space-12).
          values: {
            name:
              sync.placement === null
                ? (repo?.placements.find((line) => line.instance === null)?.path ?? "")
                : instanceNameAt(groups, sync.placement),
          },
          comment: "the live note when a sync finds records started separately at a Space; {name} is its display name",
        }),
      );
    }
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

  // The state before this one: records whose clone moved — a sync
  // following its Space, or a command another client sent (storage-38) —
  // are the one new row holding their folder, and stay open as they
  // were, even where a row holding another folder or none stands under
  // the former key.
  const previous = useRef<GroupsState | undefined>(undefined);
  useEffect(() => {
    const before = previous.current;
    previous.current = groups;
    if (!groups || !before) return;
    const rows = allRepositories(groups);
    const was = allRepositories(before);
    const known = new Set(was.map((row) => row.key));
    for (const old of was) {
      const now = rows.find((row) => row.key === old.key);
      // The clone is known by its folder (storage-38): a row under its
      // former key holding another folder, or none, is another row.
      if (old.folder === null || now?.folder === old.folder) continue;
      const followers = rows.filter((row) => row.folder === old.folder && !known.has(row.key));
      if (followers.length !== 1) continue;
      const to = followers[0]!.key;
      setSelected((current) => (current === old.key ? to : current));
    }
  }, [groups]);

  const surfaceName = i18n._({
    id: "Space",
    comment: "the Space destination: groups, projects and their shared records",
  });
  return (
    <ChoicesContext.Provider value={choices}>
      <section
        ref={surfaceRef}
        tabIndex={-1}
        data-testid="space-surface"
        aria-label={surfaceName}
        // The surface root is the box the surface scrolls in, positioned
        // so its content and the empty side gutters share one scroll area.
        className="relative min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden"
      >
        <div data-testid="space-surface-content" className="@container mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-3 p-6">
          <div role="status" aria-live="polite" className="sr-only" data-testid="space-live">
            {note}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3">
            <h1 className="min-w-0 flex-1 text-lg font-semibold">{surfaceName}</h1>
            {groups ? (
              <HomeHeader
                groups={groups}
                now={now}
                connected={connected}
                signIn={signIn}
                refreshing={refreshing}
                refreshError={refreshError}
                onRefresh={() => void refresh()}
                issuesOpen={issuesOpen}
                issuesPending={issuesPending}
                onIssuesOpen={(open, opener) => {
                  if (issuesPending) return;
                  issuesOpener.current = opener;
                  setIssuesOpen(open);
                  setRevealDismissed(undefined);
                }}
              />
            ) : null}
          </div>
          {spaceError ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {i18n._("Couldn't read your groups: {reason}", { reason: spaceError })}
            </p>
          ) : null}
          {groups ? (
            <>
              <IssuesList
                groups={groups}
                connected={connected}
                open={issuesOpen}
                revealDismissed={revealDismissed}
                refreshes={refreshes}
                onOpenProject={onOpenProject}
                onOpenSession={onOpenSession}
                onNote={onNote}
                onClose={closeIssues}
                onPendingChange={setIssuesPending}
              />
              {groups.git.ok ? (
                <GroupsList
                  groups={groups}
                  now={now}
                  selected={selected}
                  selectionDisabled={repositoryPending}
                  connected={connected}
                  refreshes={refreshes}
                  dismissed={dismissed}
                  signIn={signIn}
                  servers={servers.listing}
                  onAddCredential={onAddCredential}
                  onSelect={(key, reveal, opener) => {
                    if (repositoryPending) return;
                    repositoryOpener.current = opener ?? null;
                    setTab("sync");
                    setSelected((current) => (!reveal && current === key ? undefined : key));
                    setRepositoryFocus((value) => value + 1);
                  }}
                  onExplore={(key, opener) => {
                    if (repositoryPending) return;
                    repositoryOpener.current = opener ?? null;
                    setTab("explore");
                    setSelected(key);
                    setTimeout(() => document.getElementById("space-tab-explore")?.focus(), 0);
                  }}
                  onOpenProject={onOpenProject}
                  onNote={onNote}
                  repositoryPanel={repo ? (
                    <RepositoryPanel
                      key={repo.key}
                      groups={groups}
                      repo={repo}
                      now={now}
                      tab={tab}
                      onTab={setTab}
                      connected={connected}
                      refreshes={refreshes}
                      dismissed={dismissed[repo.key]}
                      onDismiss={(phase) => setDismissed((was) => ({ ...was, [repo.key]: phase }))}
                      onOpenSession={onOpenSession}
                      onNote={onNote}
                      pending={repositoryPending}
                      onPendingChange={setRepositoryPending}
                      focusRequest={repositoryFocus}
                      onClose={closeRepository}
                    />
                  ) : undefined}
                />
              ) : null}
              {anySignedIn(groups) ? (
                // Where this place's files are, said once and quietly at the
                // foot (space-1), naming the server at a seat's (space-112):
                // selectable, the full path in its title.
                <p
                  data-testid="space-home"
                  title={groups.home}
                  className="min-w-0 select-text break-all text-xs text-neutral-500"
                >
                  {seat === undefined
                    ? i18n._({
                        id: "Spex keeps this computer's files in {path}",
                        values: { path: tildify(groups.home) },
                        comment: "the Space surface's foot: where Spex keeps this computer's files; {path} is that folder",
                      })
                    : i18n._({
                        id: "Spex keeps {place}'s files in {path}",
                        values: { place: seat, path: tildify(groups.home) },
                        comment: "the foot of a team server's Space: where the server keeps its files; {place} is the server's name, {path} that folder there",
                      })}
                </p>
              ) : null}
            </>
          ) : !spaceError ? (
            <p className="text-sm text-neutral-500">{i18n._("Reading your groups…")}</p>
          ) : null}
        </div>
      </section>
    </ChoicesContext.Provider>
  );
}

/** The header (space-1): while the home lists no Space, the card "Sign
 * in to a Space" (space-3); while any Space is signed in, Refresh, which
 * reads every signed-in Space and reads "Reading…" until each read's
 * outcome (git-host-5), titled with when it last read — each read's
 * failure standing on its Space's heading; Files & history, carrying
 * the core's pending-notice count, and Git's presence. Below 20rem the fields stack
 * (space-28). A header with nothing to say takes no room. */
function HomeHeader({
  groups,
  now,
  connected,
  signIn,
  refreshing,
  refreshError,
  onRefresh,
  issuesOpen,
  issuesPending,
  onIssuesOpen,
}: {
  groups: GroupsState;
  now: number;
  connected: boolean;
  signIn: SignInFlow;
  refreshing: boolean;
  refreshError?: string;
  onRefresh(): void;
  issuesOpen: boolean;
  issuesPending: boolean;
  onIssuesOpen(open: boolean, opener: HTMLButtonElement): void;
}) {
  // Count notices the reader has not set aside, using the core's fold.
  // A zero-count review remains reachable while postponed tasks stand.
  const noticeCount = groups.issues;
  const reading = refreshing || groups.instances.some((instance) => instance.read.phase === "running");
  const listed = groups.instances.length > 0;
  const refresh = anySignedIn(groups);
  // When the signed-in Spaces were last read, as Refresh's title says
  // (space-1): the latest complete read.
  const readAt = groups.instances
    .filter((instance) => instance.signedIn && instance.readAt !== null)
    .reduce<number | null>((latest, instance) => Math.max(latest ?? 0, instance.readAt!), null);
  const row = "flex min-w-0 flex-col gap-1 @xs:flex-row @xs:flex-wrap @xs:items-center @xs:gap-x-3";
  const issuesLabel = noticeCount > 0
    ? i18n._({ id: "Files & history ({count})", values: { count: noticeCount }, comment: "project-folder choices and saved-file notices; dismissed items do not count" })
    : i18n._({ id: "Files & history", comment: "project-folder choices and saved-file notices, including dismissed reminders" });
  const issuesName = noticeCount > 0
    ? i18n._({ id: "Files & history — {count, plural, one {# notice} other {# notices}}", values: { count: noticeCount }, comment: "accessible name for project-folder choices and saved-file notices" })
    : issuesLabel;
  const issues = groups.diagnostics.length > 0 ? (
    <button type="button" data-testid="space-issues" aria-expanded={issuesOpen} aria-label={issuesName} disabled={issuesPending}
      className={`flex min-w-0 max-w-full items-center gap-1 text-sm hover:underline ${noticeCount > 0 ? "text-amber-700 dark:text-amber-300" : "text-neutral-500"}`}
      onClick={(event) => onIssuesOpen(!issuesOpen, event.currentTarget)}
    >
      {noticeCount > 0 ? <span aria-hidden>⚠</span> : null}
      <span className="min-w-0 text-left">{issuesLabel}</span>
    </button>
  ) : null;
  const empty = groups.git.ok && listed && !refresh && !issues;
  return (
    <header
      data-testid="space-header"
      data-stale={connected ? undefined : "1"}
      // While the core is unreachable the last known state stands,
      // muted.
      className={
        empty
          ? "hidden"
          : `flex min-w-0 max-w-full flex-col gap-2 ${
              groups.git.ok && listed
                ? "ml-auto"
                : "basis-full rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
            } ${
              connected ? "" : "opacity-70"
            }`
      }
    >
      {!groups.git.ok ? null : !listed ? (
        <>
          <SignInCard groups={groups} signIn={signIn} connected={connected} />
          {issues ? <div className={row}>{issues}</div> : null}
        </>
      ) : refresh || issues ? (
        <div className={row}>
          {issues}
          {refreshError ? (
            <span role="alert" className="min-w-0 text-xs text-red-600 dark:text-red-400">
              {refreshError}
            </span>
          ) : null}
          {refresh ? (
            <button
              type="button"
              data-testid="space-refresh"
              // Only the primary control spans the width when the
              // fields stack (space-28).
              className={`${SECONDARY} self-start @xs:ml-auto @xs:self-auto`}
              disabled={!connected || reading}
              title={
                readAt !== null
                  ? i18n._({
                      id: "Last refreshed {age}",
                      values: { age: relativeAge(readAt, now) },
                      comment: "Refresh's title: when the signed-in Spaces were last read; {age} is relative, such as '5m ago'",
                    })
                  : undefined
              }
              onClick={onRefresh}
            >
              {reading
                ? i18n._({ id: "Reading…", comment: "Refresh while a read of the Spaces still runs" })
                : i18n._({ id: "Refresh", comment: "read the signed-in Spaces again" })}
            </button>
          ) : null}
        </div>
      ) : null}
      {groups.git.ok ? null : (
        <div data-testid="space-no-git" className="text-sm">
          <p className="font-medium">{i18n._("Git is not installed")}</p>
          <p className="text-xs text-neutral-500">{groups.git.guidance}</p>
        </div>
      )}
    </header>
  );
}

/** Opened records (space-1): their row's name and standing phrase with
 * their folder and the project's, over their Sync and Explore tabs. Their
 * Sync control is the row's own. */
function RepositoryPanel({
  groups,
  repo,
  now,
  tab,
  onTab: setTab,
  connected,
  refreshes,
  dismissed,
  onDismiss,
  onOpenSession,
  onNote,
  pending,
  onPendingChange,
  focusRequest,
  onClose,
}: {
  groups: GroupsState;
  repo: RepositoryState;
  now: number;
  tab: SpaceTab;
  onTab(tab: SpaceTab): void;
  connected: boolean;
  refreshes: number;
  /** The sync phase the reader dismissed on its Sync tab. */
  dismissed?: string;
  onDismiss(phase: string): void;
  onOpenSession(sessionId: string): void;
  onNote: Note;
  pending: boolean;
  onPendingChange(pending: boolean): void;
  focusRequest: number;
  onClose(): void;
}) {
  const store = usePlaceStore();
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const panel = panelRef.current;
    panel?.focus({ preventScroll: true });
    panel?.querySelector<HTMLElement>('[data-testid="space-repository-header"]')?.scrollIntoView?.({ block: "nearest" });
  }, [focusRequest]);
  const seat = seatName(store.place);
  // The row's name and whether it is a project's, as its group reads it
  // (space-1).
  const standing = standingOf(groups, repo.key);
  const group = standing && !standing.own ? standing.group : { fullPath: groups.own.name };
  const name = rowName(group, repo);

  const onTabKey = (event: KeyboardEvent<HTMLElement>) => {
    if (pending) return;
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
      disabled={pending}
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

  const root = clonePath(groups.home, repo.key);
  // No clone here: records a Space lists that this computer lacks, or
  // ones in a group named like a login (space-61).
  const absent = !cloneHere(repo);
  // The row's own phrase reads beside its name, the same words the row
  // reads; a row under "This computer" reads none (space-120).
  const quiet = thisComputerRows(groups).some((row) => row.key === repo.key);
  const standingPhrase = rowPhrase(repo, now, dismissed, phraseNames(groups, repo, seat), quiet).text;
  return (
    <section
      ref={panelRef}
      tabIndex={-1}
      id="space-repository"
      data-testid="space-repository"
      aria-label={name}
      className={`flex min-w-0 flex-col gap-3 ${ATTACHED_PANEL}`}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        if (!pending) onClose();
      }}
    >
      <div
        data-testid="space-repository-header"
        className="flex min-w-0 flex-col gap-1"
      >
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1 @xs:flex-row @xs:flex-wrap @xs:items-center @xs:gap-x-3">
            <Field testId="space-repository-name" title={standingPhrase ? `${name} · ${standingPhrase}` : name} className="min-w-0 flex-1">
              <span className="min-w-0 truncate font-medium">{name}</span>
              {standingPhrase ? (
                <span className="min-w-0 truncate text-xs text-neutral-500">{standingPhrase}</span>
              ) : null}
            </Field>
            {absent ? null : <PathControls path={root} testId="space-clone-path" onNote={onNote} compact />}
          </div>
          <PanelCloseButton data-testid="space-repository-close" disabled={pending} onClick={onClose} />
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
            {seat === undefined
              ? i18n._({ id: "New sessions stay on this computer", comment: "read-only records' note: sessions started now are not sent to that Space" })
              : i18n._({
                  id: "New sessions stay on {place}",
                  values: { place: seat },
                  comment: "a read-only repository's note on a team server's Space: new sessions stay on the server; {place} is the server's name",
                })}
          </span>
        ) : null}
      </div>
      <div
        role="tablist"
        aria-label={i18n._("Views of {name}", { name })}
        className="flex flex-wrap items-center gap-1 border-b border-neutral-200 pb-1 dark:border-neutral-800"
      >
        {tabButton("sync", i18n._({ id: "Sync", comment: "tab and control: send and bring back changes" }))}
        {tabButton("explore", i18n._({ id: "Explore", comment: "tab: browse the files of a project's or a group's records" }))}
      </div>
      <div
        role="tabpanel"
        id={`space-panel-${tab}`}
        aria-labelledby={`space-tab-${tab}`}
        className="flex min-h-0 min-w-0 flex-col gap-3"
      >
        {tab === "sync" ? (
          <SyncTab
            groups={groups}
            repo={repo}
            now={now}
            connected={connected}
            dismissed={dismissed}
            rowName={name}
            refreshes={refreshes}
            onDismiss={onDismiss}
            onOpenSession={onOpenSession}
            onNote={onNote}
            onPendingChange={onPendingChange}
          />
        ) : absent ? (
          <p className="text-sm text-neutral-500">{notHerePhrase(seat)}</p>
        ) : (
          <ExploreTab
            repo={repo}
            name={name}
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
