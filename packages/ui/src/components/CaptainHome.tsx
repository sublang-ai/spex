// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Captain home (DR-007 revised, RUN-25..27): an IM-style thread
// the Captain opens with a greeting, a project chip menu with silent
// git init, a dismissible quick start card, and a "/" slash menu.
// Props-driven so RUN-29/31 exercise it without a live core.

import { useEffect, useRef, useState } from "react";
import type {
  PlaybookSummary,
  ProfileSummary,
  ProjectInfo,
  ReadinessEntry,
} from "@sublang/spex-core/protocol";

import { SlashMenuList, slashMatches } from "./SlashMenu.js";
import { ProfilePopover } from "./ProfilePopover.js";
import { Icon } from "./Icon.js";

export const QUICK_START_KEY = "spex.quickStartDismissed";

export interface PastSessionEntry {
  id: string;
  projectName: string;
  endedAt: number | null;
}

export interface CaptainHomeProps {
  projects: ProjectInfo[];
  playbooks: PlaybookSummary[];
  captainRef: string;
  profiles: ProfileSummary[];
  readiness: ReadinessEntry[];
  connected: boolean;
  pastSessions?: PastSessionEntry[];
  /** Invalid/missing config surfaces in the thread (DR-010 §5). */
  configStatus?: "valid" | "invalid" | "missing";
  configErrors?: string[];
  /** Draft lives in the store so surface switches keep it. */
  draft?: string;
  onDraftChange?: (draft: string) => void;
  /** Re-check agent readiness at hand (DR-009). */
  onRecheckReadiness?: () => Promise<unknown>;
  /** Native picker when the shell bridge exists (DR-008). */
  onPickFolder?: () => Promise<string | null>;
  onRegisterPath: (path: string) => Promise<ProjectInfo>;
  /** Silent git init + register for non-repo folders (RUN-27). */
  onInitProject: (path: string) => Promise<ProjectInfo>;
  onNavigate: (surface: "Settings" | "Playbooks") => void;
  onSelectCaptain: (ref: string) => Promise<unknown>;
  onSaveProfile: (
    profile: ProfileSummary,
    patch: { model?: string; reasoningEffort?: string },
  ) => Promise<unknown>;
  onOpenPast?: (sessionId: string) => void;
  onStart: (projectId: string, text: string) => Promise<void>;
  /** Storage for the quick-start dismissal (tests inject a stub). */
  storage?: Pick<Storage, "getItem" | "setItem">;
}

function CaptainBubble({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "error";
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">
        C
      </span>
      <div
        className={`max-w-[85%] rounded-2xl rounded-bl-md px-3 py-2 text-sm ${
          tone === "error"
            ? "border border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
            : "bg-neutral-200/60 dark:bg-neutral-800"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export function CaptainHome(props: CaptainHomeProps) {
  const { projects, playbooks, captainRef, profiles, readiness, connected } =
    props;
  const storage = props.storage ?? window.localStorage;

  const [projectId, setProjectId] = useState<string>();
  const [localText, setLocalText] = useState("");
  // Draft lives in the store when the host wires it (DR-010: surface
  // switches never eat text); local state covers standalone renders.
  const text = props.onDraftChange ? (props.draft ?? "") : localText;
  const setText = props.onDraftChange ?? setLocalText;
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuIndex, setMenuIndex] = useState(0);
  const [pathDraft, setPathDraft] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [quickStartHidden, setQuickStartHidden] = useState(
    () => storage.getItem(QUICK_START_KEY) === "1",
  );
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [captainPopover, setCaptainPopover] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const gearRef = useRef<HTMLButtonElement>(null);
  const [showAllPast, setShowAllPast] = useState(false);

  const selected = projects.find((project) => project.id === projectId);
  const captainProfile = profiles.find((profile) => profile.id === captainRef);
  const captainReadiness = readiness.find(
    (entry) => entry.profileId === captainRef,
  );
  const notReady = readiness.filter((entry) => entry.ready === false);
  const slashItems = slashMatches(text, playbooks);
  const slash = slashDismissed ? undefined : slashItems;
  const configBroken =
    props.configStatus === "invalid" || props.configStatus === "missing";

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    // Escape closes the menu even when it was opened by mouse and
    // focus never left the composer (DR-010 §6).
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);

  async function addFolder(path: string): Promise<void> {
    setError(undefined);
    setBusy(true);
    try {
      let project: ProjectInfo;
      try {
        project = await props.onRegisterPath(path);
      } catch (cause) {
        if (/not the root of a git work tree/.test((cause as Error).message)) {
          // Not a repo yet: initialize one, no questions asked (RUN-27).
          project = await props.onInitProject(path);
        } else {
          throw cause;
        }
      }
      setProjectId(project.id);
      setMenuOpen(false);
      setPathDraft("");
      composerRef.current?.focus();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** Keyboard model for the project menu (DR-010 §6): focus stays in
   * the composer; arrows drive a highlight over the entries, Enter
   * picks, Escape closes — the slash-menu idiom. */
  const menuActions: { label: string; run: () => void }[] = [
    ...projects.map((project) => ({
      label: project.name,
      run: () => {
        setProjectId(project.id);
        setMenuOpen(false);
        composerRef.current?.focus();
      },
    })),
    ...(props.onPickFolder
      ? [
          {
            label: "Open folder…",
            run: () => {
              void props.onPickFolder?.().then((path) => {
                if (path) return addFolder(path);
              });
            },
          },
        ]
      : []),
  ];

  function menuKeydown(event: React.KeyboardEvent): boolean {
    if (!menuOpen || menuActions.length === 0) return false;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setMenuIndex((index) => (index + 1) % menuActions.length);
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setMenuIndex(
        (index) => (index - 1 + menuActions.length) % menuActions.length,
      );
      return true;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      menuActions[Math.min(menuIndex, menuActions.length - 1)]?.run();
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setMenuOpen(false);
      return true;
    }
    return false;
  }

  async function start(): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || busy || !connected) return;
    if (!selected) {
      setMenuIndex(0);
      setMenuOpen(true);
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      await props.onStart(selected.id, trimmed);
      setText("");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function insertCommand(playbook: PlaybookSummary) {
    setText(`/${playbook.command} `);
    setSlashIndex(0);
    composerRef.current?.focus();
  }

  // A fresh canvas centers the whole cluster — greeting, quick start,
  // project chip, composer — instead of hugging the bottom fifth of
  // an empty window (DR-010 §8). Any real content reverts to the IM
  // bottom-docked layout.
  const emptyCanvas =
    (props.pastSessions?.length ?? 0) === 0 &&
    notReady.length === 0 &&
    !configBroken &&
    !error;

  return (
    <div
      data-testid="captain-home"
      className={`mx-auto flex w-full max-w-2xl flex-1 flex-col p-6 ${
        emptyCanvas ? "justify-center" : ""
      }`}
    >
      <div
        className={`flex flex-col gap-3 overflow-y-auto ${
          emptyCanvas ? "" : "flex-1 justify-end"
        }`}
      >
        <CaptainBubble>
          <p>
            Hello! I'm your Captain. Pick a project below, then tell me what
            to do — I'll route it to a playbook and drive the players.
          </p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Tip: type <span className="font-mono">/</span> to browse
            playbooks, or just describe the task in your own words.
          </p>
        </CaptainBubble>

        {configBroken ? (
          <CaptainBubble tone="error">
            <p className="text-xs font-semibold">
              Your config file has errors — playbooks are unavailable.
            </p>
            {props.configErrors && props.configErrors.length > 0 ? (
              <ul className="mt-1 flex flex-col gap-0.5 font-mono text-[11px]">
                {props.configErrors.slice(0, 3).map((entry, index) => (
                  <li key={index}>{entry}</li>
                ))}
                {props.configErrors.length > 3 ? (
                  <li>… and {props.configErrors.length - 3} more</li>
                ) : null}
              </ul>
            ) : null}
            <button
              type="button"
              onClick={() => props.onNavigate("Settings")}
              className="mt-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-300"
            >
              Open Settings →
            </button>
          </CaptainBubble>
        ) : null}

        {notReady.length > 0 ? (
          <CaptainBubble>
            <p className="text-xs">
              Heads up — some agents aren't ready yet:
            </p>
            <ul className="mt-1 flex flex-col gap-0.5 text-xs text-neutral-600 dark:text-neutral-300">
              {notReady.map((entry) => (
                <li key={entry.profileId}>
                  <span className="font-mono font-semibold">
                    {entry.profileId}
                  </span>{" "}
                  — {entry.requirement}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
              Signing in from a terminal is picked up on re-check; a
              newly exported env var needs a Spex restart.
            </p>
            {props.onRecheckReadiness ? (
              <button
                type="button"
                data-testid="recheck-readiness"
                disabled={rechecking}
                onClick={() => {
                  setRechecking(true);
                  void props
                    .onRecheckReadiness?.()
                    .finally(() => setRechecking(false));
                }}
                className="mt-1 text-xs font-medium text-indigo-600 hover:underline disabled:opacity-50 dark:text-indigo-300"
              >
                {rechecking ? "Checking…" : "I've set this up — re-check"}
              </button>
            ) : null}
          </CaptainBubble>
        ) : null}

        {!quickStartHidden && playbooks.length > 0 ? (
          <div
            data-testid="quick-start"
            className="ml-8 flex max-w-[85%] flex-col gap-1 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="flex items-center">
              <span className="text-xs font-semibold text-neutral-500">
                Quick start
              </span>
              <button
                type="button"
                data-testid="quick-start-dismiss"
                title="Hide quick start (playbooks stay under / in the composer)"
                aria-label="Hide the quick-start card"
                onClick={() => {
                  storage.setItem(QUICK_START_KEY, "1");
                  setQuickStartHidden(true);
                }}
                className="ml-auto flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              >
                <Icon name="close" className="h-3.5 w-3.5" />
              </button>
            </div>
            {playbooks.slice(0, 4).map((playbook) => (
              <button
                key={playbook.id}
                type="button"
                data-testid={`playbook-chip-${playbook.id}`}
                onClick={() => insertCommand(playbook)}
                className="flex items-baseline gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800"
              >
                <span className="font-mono font-semibold">
                  /{playbook.command}
                </span>
                <span className="truncate text-xs text-neutral-500">
                  {playbook.intent}
                </span>
              </button>
            ))}
            {playbooks.length > 4 ? (
              <span className="px-2 text-[11px] text-neutral-400">
                +{playbooks.length - 4} more under{" "}
                <span className="font-mono">/</span>
              </span>
            ) : null}
          </div>
        ) : null}

        {props.pastSessions && props.pastSessions.length > 0 ? (
          <div
            data-testid="past-sessions"
            className="ml-8 flex max-w-[85%] flex-col gap-0.5"
          >
            <span className="px-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              Past sessions
            </span>
            {(showAllPast
              ? props.pastSessions
              : props.pastSessions.slice(0, 5)
            ).map((entry) => (
              <button
                key={entry.id}
                type="button"
                data-testid={`past-session-${entry.id}`}
                onClick={() => props.onOpenPast?.(entry.id)}
                className="flex items-baseline gap-2 rounded-md px-2 py-1 text-left text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
              >
                <span className="font-medium">{entry.projectName}</span>
                <span className="text-neutral-400">
                  {entry.endedAt
                    ? new Date(entry.endedAt).toLocaleString()
                    : "ended"}
                </span>
              </button>
            ))}
            {!showAllPast && props.pastSessions.length > 5 ? (
              <button
                type="button"
                onClick={() => setShowAllPast(true)}
                className="px-2 py-1 text-left text-[11px] text-indigo-600 hover:underline dark:text-indigo-300"
              >
                show all {props.pastSessions.length}
              </button>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div className="ml-8 max-w-[85%] rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              data-testid="project-chip"
              onClick={() => {
                setMenuIndex(0);
                setMenuOpen((open) => !open);
              }}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs ${
                selected
                  ? "border-neutral-300 text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
                  : "border-indigo-400 font-medium text-indigo-600 dark:border-indigo-600 dark:text-indigo-300"
              } hover:bg-neutral-100 dark:hover:bg-neutral-800`}
            >
              <Icon name="folder" className="h-3.5 w-3.5" />
              {selected ? selected.name : "Choose a project"}
              <Icon name="caretDown" className="h-3 w-3 text-neutral-400" />
            </button>
            {menuOpen ? (
              <div
                data-testid="project-menu"
                className="absolute bottom-full left-0 z-10 mb-1 w-72 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
              >
                {projects.map((project, index) => (
                  <button
                    key={project.id}
                    type="button"
                    title={project.path}
                    onClick={() => {
                      setProjectId(project.id);
                      setMenuOpen(false);
                      composerRef.current?.focus();
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 ${
                      menuIndex === index
                        ? "bg-neutral-100 dark:bg-neutral-800"
                        : ""
                    }`}
                  >
                    <Icon
                      name="folder"
                      className="h-3.5 w-3.5 text-neutral-500"
                    />
                    <span className="truncate">{project.name}</span>
                    {project.id === selected?.id ? (
                      <span className="ml-auto text-indigo-500">✓</span>
                    ) : null}
                  </button>
                ))}
                {projects.length > 0 ? (
                  <div className="border-t border-neutral-100 dark:border-neutral-800" />
                ) : null}
                {props.onPickFolder ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void props.onPickFolder?.().then((path) => {
                        if (path) return addFolder(path);
                      });
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-neutral-600 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800 ${
                      menuIndex === projects.length
                        ? "bg-neutral-100 dark:bg-neutral-800"
                        : ""
                    }`}
                  >
                    Open folder…
                  </button>
                ) : (
                  <div className="flex gap-1 p-2">
                    <input
                      value={pathDraft}
                      onChange={(event) => setPathDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (
                          event.nativeEvent.isComposing ||
                          event.keyCode === 229
                        )
                          return;
                        if (
                          event.key === "Enter" &&
                          pathDraft.trim() &&
                          !busy
                        ) {
                          void addFolder(pathDraft.trim());
                        }
                      }}
                      placeholder="~/path/to/a/folder"
                      className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-950"
                    />
                    <button
                      type="button"
                      disabled={!pathDraft.trim() || busy}
                      onClick={() => void addFolder(pathDraft.trim())}
                      className="rounded border border-indigo-300 px-2 py-1 text-xs text-indigo-600 disabled:opacity-40 dark:border-indigo-800 dark:text-indigo-300"
                    >
                      Add
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <span className="relative ml-auto flex items-center gap-1 text-xs text-neutral-500">
            Captain:{" "}
            <span className="font-mono">
              {captainProfile
                ? `${captainProfile.id}${captainProfile.model ? ` (${captainProfile.model})` : ""}`
                : captainRef || "not set"}
            </span>
            {captainReadiness?.ready === false ? (
              <span
                className="text-red-500 dark:text-red-400"
                title={captainReadiness.requirement}
              >
                ●
              </span>
            ) : null}
            <button
              ref={gearRef}
              type="button"
              data-testid="captain-settings"
              title="Switch or tweak the captain profile"
              aria-label="Configure the Captain profile"
              onClick={() => setCaptainPopover((open) => !open)}
              className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              <Icon name="gear" className="h-3.5 w-3.5" />
            </button>
            {captainPopover ? (
              <ProfilePopover
                title="Captain profile"
                anchorRef={gearRef}
                profiles={profiles}
                readiness={readiness}
                currentRef={captainRef}
                onSelect={props.onSelectCaptain}
                onSaveProfile={props.onSaveProfile}
                onOpenSettings={() => {
                  setCaptainPopover(false);
                  props.onNavigate("Settings");
                }}
                onClose={() => setCaptainPopover(false)}
              />
            ) : null}
          </span>
        </div>

        <div className="relative">
          {slash ? (
            <SlashMenuList
              items={slash}
              activeIndex={Math.min(slashIndex, slash.length - 1)}
              onPick={insertCommand}
              onCompileNew={() => props.onNavigate("Playbooks")}
            />
          ) : null}
          <div className="flex items-end gap-2 rounded-xl border border-neutral-300 bg-white p-2 focus-within:border-indigo-400 dark:border-neutral-700 dark:bg-neutral-900">
            <textarea
              ref={composerRef}
              data-testid="start-composer"
              autoFocus
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setSlashIndex(0);
                setSlashDismissed(false);
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || event.keyCode === 229)
                  return;
                if (menuKeydown(event)) return;
                if (slash) {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setSlashIndex((index) => (index + 1) % slash.length);
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setSlashIndex(
                      (index) => (index - 1 + slash.length) % slash.length,
                    );
                    return;
                  }
                  if (event.key === "Tab" || event.key === "Enter") {
                    event.preventDefault();
                    insertCommand(slash[Math.min(slashIndex, slash.length - 1)]);
                    return;
                  }
                  if (event.key === "Escape") {
                    // Hide the menu, never the draft (DR-010 §4).
                    event.preventDefault();
                    setSlashDismissed(true);
                    return;
                  }
                }
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void start();
                }
              }}
              rows={2}
              placeholder={
                connected
                  ? "Message the Captain…"
                  : "Reconnecting to the Spex core…"
              }
              disabled={!connected}
              className="max-h-[40vh] min-h-[2.5rem] flex-1 resize-y border-0 bg-transparent px-1 py-1 text-sm outline-none disabled:opacity-60"
            />
            <button
              type="button"
              data-testid="start-send"
              disabled={busy || !connected || text.trim().length === 0}
              onClick={() => void start()}
              title={selected ? undefined : "Pick a project first"}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              {busy ? "Starting…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
