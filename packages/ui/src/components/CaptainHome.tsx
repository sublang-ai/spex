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
  /** Native picker when the shell bridge exists (DR-008). */
  onPickFolder?: () => Promise<string | null>;
  onRegisterPath: (path: string) => Promise<ProjectInfo>;
  /** Silent git init + register for non-repo folders (RUN-27). */
  onInitProject: (path: string) => Promise<ProjectInfo>;
  onNavigate: (surface: "Settings" | "Library") => void;
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

function CaptainBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">
        C
      </span>
      <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-800">
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
  const [text, setText] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [pathDraft, setPathDraft] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const [quickStartHidden, setQuickStartHidden] = useState(
    () => storage.getItem(QUICK_START_KEY) === "1",
  );
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [captainPopover, setCaptainPopover] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selected = projects.find((project) => project.id === projectId);
  const captainProfile = profiles.find((profile) => profile.id === captainRef);
  const captainReadiness = readiness.find(
    (entry) => entry.profileId === captainRef,
  );
  const notReady = readiness.filter((entry) => entry.ready === false);
  const slash = slashMatches(text, playbooks);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
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

  async function start(): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || busy || !connected) return;
    if (!selected) {
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

  return (
    <div
      data-testid="captain-home"
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col p-6"
    >
      <div className="flex flex-1 flex-col justify-end gap-3 overflow-y-auto">
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
                onClick={() => {
                  storage.setItem(QUICK_START_KEY, "1");
                  setQuickStartHidden(true);
                }}
                className="ml-auto text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
              >
                ✕
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
            {props.pastSessions.slice(0, 5).map((entry) => (
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
              onClick={() => setMenuOpen((open) => !open)}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs ${
                selected
                  ? "border-neutral-300 text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
                  : "border-indigo-400 font-medium text-indigo-600 dark:border-indigo-600 dark:text-indigo-300"
              } hover:bg-neutral-100 dark:hover:bg-neutral-800`}
            >
              <span aria-hidden>📁</span>
              {selected ? selected.name : "Choose a project"}
              <span className="text-neutral-400">▾</span>
            </button>
            {menuOpen ? (
              <div
                data-testid="project-menu"
                className="absolute bottom-full left-0 z-10 mb-1 w-72 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
              >
                {projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    title={project.path}
                    onClick={() => {
                      setProjectId(project.id);
                      setMenuOpen(false);
                      composerRef.current?.focus();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800"
                  >
                    <span aria-hidden>📁</span>
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
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-neutral-600 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
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
                : captainRef}
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
              type="button"
              data-testid="captain-settings"
              title="Switch or tweak the captain profile"
              onClick={() => setCaptainPopover((open) => !open)}
              className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
            >
              ⚙
            </button>
            {captainPopover ? (
              <ProfilePopover
                title="Captain profile"
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
              onCompileNew={() => props.onNavigate("Library")}
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
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || event.keyCode === 229)
                  return;
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
                    setText("");
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
