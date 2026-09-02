// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Captain home (DR-007 revised, RUN-25..27): an IM-style thread
// the Captain opens with a greeting, a project chip menu with silent
// git init, a dismissible quick start card, and a "/" slash menu.
// Props-driven so RUN-29/31 exercise it without a live core.

import { useRef, useState } from "react";
import type {
  AgentSummary,
  IntentInfo,
  PlaybookSummary,
  ReadinessEntry,
} from "@sublang/spex-core/protocol";

import type { AgentPatch } from "../lib/config-ops.js";
import { keyLabel } from "../lib/shortcuts.js";
import { useAppStore, type StagedIntent } from "../state/store.js";
import { SlashMenuList, slashMatches } from "./SlashMenu.js";
import { AgentChip } from "./AgentChip.js";
import { AgentEditorPopover } from "./AgentEditor.js";
import { Icon } from "./Icon.js";
import { NextCard } from "./NextCard.js";
import { ComposerBox, ComposerCaption, ComposerField } from "./Composer.js";

export const QUICK_START_KEY = "spex.quickStartDismissed";

/** Storage access that tolerates a browser that has none (private
 * mode, file://, a headless test): the home must render regardless. */
function safeRead(
  storage: Pick<Storage, "getItem" | "setItem">,
  key: string,
): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(
  storage: Pick<Storage, "getItem" | "setItem">,
  key: string,
  value: string,
): void {
  try {
    storage.setItem(key, value);
  } catch {
    // Dismissal is best-effort.
  }
}

export interface CaptainHomeProps {
  /** The workspace's project context (DR-011); the bar owns choice. */
  hasProject: boolean;
  /** Whether the workspace holds any project at all: with none, the
   * remedy is adding one, not picking one (run-view-25). */
  hasProjects?: boolean;
  projectName?: string;
  playbooks: PlaybookSummary[];
  /** The Captain's inline agent block (DR-019); absent while the
   * config is broken. */
  captain?: AgentSummary;
  /** Adapter-keyed, deduped readiness entries (DR-019). */
  readiness: ReadinessEntry[];
  connected: boolean;
  /** Invalid/missing config surfaces in the thread (DR-010 §5). */
  configStatus?: "valid" | "invalid" | "missing";
  configErrors?: string[];
  /** Draft lives in the store so surface switches keep it. */
  draft?: string;
  onDraftChange?: (draft: string) => void;
  /** Re-check agent readiness at hand (DR-009). */
  onRecheckReadiness?: () => Promise<unknown>;
  /** Enter with no project opens the palette (DR-011). */
  onOpenPalette: () => void;
  onNavigate: (surface: "Settings" | "Playbooks") => void;
  /** Apply a merge patch to the Captain's block (captain.set). */
  onSaveCaptain: (patch: AgentPatch) => Promise<unknown>;
  onStart: (text: string) => Promise<void>;
  /** The project's head unblocked queued intent with the count of the
   * rest — the home's next card (run-view-88, DR-035). */
  next?: { intent: IntentInfo; more: number };
  /** Stage the next intent into this composer (run-view-86/88). */
  onStartIntent?: (intent: IntentInfo) => Promise<void> | void;
  /** The staged dispatch this composer wears (key "home"). */
  staged?: StagedIntent;
  /** Detach the staged chip without sending (DR-035). */
  onDetachStaged?: () => void;
  /** Queue the typed text as an intent instead of starting a session
   * (DR-035); absent while no project is current — the control hides. */
  onQueueInstead?: (text: string) => Promise<void>;
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
      <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
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
  const { playbooks, captain, readiness, connected } = props;
  const storage = props.storage ?? window.localStorage;

  const [localText, setLocalText] = useState("");
  // Draft lives in the store when the host wires it (DR-010: surface
  // switches never eat text); local state covers standalone renders.
  const text = props.onDraftChange ? (props.draft ?? "") : localText;
  const setText = props.onDraftChange ?? setLocalText;
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [quickStartHidden, setQuickStartHidden] = useState(
    () => safeRead(storage, QUICK_START_KEY) === "1",
  );
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [queueing, setQueueing] = useState(false);
  /** Transient queue-instead acknowledgment (run-view-85). */
  const [queueNote, setQueueNote] = useState<string>();
  const [captainPopover, setCaptainPopover] = useState(false);
  // With nothing registered the greeting itself carries the ways in
  // (run-view-25); seeding is the store action the palette uses.
  const openAcademyExample = useAppStore((state) => state.openAcademyExample);
  const [seeding, setSeeding] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const gearRef = useRef<HTMLButtonElement>(null);

  const captainReadiness = captain
    ? readiness.find((entry) => entry.adapter === captain.adapter)
    : undefined;
  const notReady = readiness.filter((entry) => entry.ready === false);
  const slashItems = slashMatches(text, playbooks);
  const slash = slashDismissed ? undefined : slashItems;
  const configBroken =
    props.configStatus === "invalid" || props.configStatus === "missing";

  async function start(): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || busy || !connected) return;
    if (!props.hasProject) {
      // The palette owns project choice (DR-011); the draft stays.
      props.onOpenPalette();
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      await props.onStart(trimmed);
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

  async function runAcademy(): Promise<void> {
    if (seeding) return;
    setSeeding(true);
    setError(undefined);
    try {
      // Registration and selection happen in the store; the greeting
      // then names the project and the draft is ready to send.
      await openAcademyExample();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSeeding(false);
      composerRef.current?.focus();
    }
  }

  // A fresh canvas centers the whole cluster — greeting, quick start,
  // project chip, composer — instead of hugging the bottom fifth of
  // an empty window (DR-010 §8). Any real content reverts to the IM
  // bottom-docked layout.
  const emptyCanvas = notReady.length === 0 && !configBroken && !error;

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
            {props.hasProject ? (
              <>
                Hello! This is {props.projectName ?? "your project"} — tell
                me what to do with it and I'll route it to a playbook, a
                scripted workflow the AI players run.
              </>
            ) : props.hasProjects ? (
              <>
                Hello! I'm your Captain. Pick a project in the sidebar,
                then tell me what to do with it and I'll route it to a
                playbook, a scripted workflow the AI players run.
              </>
            ) : (
              <>
                Hello! I'm your Captain. Add a project — any local git
                repo — and tell me what to do with it; I'll route it to a
                playbook, a scripted workflow the AI players run.
              </>
            )}
          </p>
          {!props.hasProject && !props.hasProjects ? (
            // The two ways in, in the greeting itself: nothing in the
            // sidebar to pick means nothing to send the reader to.
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="home-add-project"
                onClick={props.onOpenPalette}
                className="rounded-md bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-500"
              >
                Add a project…
              </button>
              <button
                type="button"
                data-testid="home-academy"
                disabled={seeding || !connected}
                title="Seeds a sample project with specs, ready to run"
                onClick={() => void runAcademy()}
                className="rounded-md border border-brand-300 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-40 dark:border-brand-700 dark:text-brand-300 dark:hover:bg-brand-950"
              >
                {seeding ? "Seeding…" : "Try the Academy example"}
              </button>
            </div>
          ) : null}
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
            Tip: type <span className="font-mono">/</span> to browse
            playbooks, or just describe the task in your own words.
          </p>
        </CaptainBubble>

        {configBroken ? (
          <CaptainBubble tone="error">
            <p className="text-xs font-semibold">
              {props.configStatus === "missing"
                ? "Spex has no config file yet — playbooks are unavailable."
                : "Your config file has errors — playbooks are unavailable."}
            </p>
            {props.configErrors && props.configErrors.length > 0 ? (
              <ul className="mt-1 flex flex-col gap-0.5 font-mono text-xs">
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
              className="mt-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-300"
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
                <li key={entry.adapter}>
                  <span className="font-mono font-semibold">
                    {entry.adapter}
                  </span>{" "}
                  — {entry.requirement}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
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
                className="mt-1 text-xs font-medium text-brand-600 hover:underline disabled:opacity-50 dark:text-brand-300"
              >
                {rechecking ? "Checking…" : "Re-check"}
              </button>
            ) : null}
          </CaptainBubble>
        ) : null}

        {/* The project's plan, one Enter away (run-view-88): the head
         * unblocked intent with Start and Remove (run-view-114),
         * beside the quick start card. */}
        <NextCard
          next={props.next}
          connected={connected}
          composerRef={composerRef}
          onStartIntent={props.onStartIntent}
        />

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
                  safeWrite(storage, QUICK_START_KEY, "1");
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
              <span className="px-2 text-xs text-neutral-500">
                +{playbooks.length - 4} more under{" "}
                <span className="font-mono">/</span>
              </span>
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
          <span className="relative ml-auto flex min-w-0 items-center gap-1 text-xs text-neutral-500">
            Captain:{" "}
            {captain ? (
              <AgentChip
                agent={captain}
                readiness={captainReadiness}
                label="Captain"
              />
            ) : (
              <span className="font-mono">not set</span>
            )}
            <button
              ref={gearRef}
              type="button"
              data-testid="captain-settings"
              title="Tweak the Captain agent in place"
              aria-label="Configure the Captain agent"
              disabled={!captain}
              onClick={() => setCaptainPopover((open) => !open)}
              className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-40 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              <Icon name="edit" className="h-3.5 w-3.5" />
            </button>
            {captainPopover && captain ? (
              <AgentEditorPopover
                title="Captain agent"
                anchorRef={gearRef}
                initial={captain}
                readiness={readiness}
                onSave={(patch) =>
                  Promise.resolve(props.onSaveCaptain(patch)).then(
                    (result) => {
                      setCaptainPopover(false);
                      return result;
                    },
                  )
                }
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
          {/* The one composer shape (run-view-106): the field on top,
              the caption line the note and the staged chip share, and
              the wrapping action row beneath. */}
          <ComposerBox
            field={
              <ComposerField
                fieldRef={composerRef}
                data-testid="start-composer"
                autoFocus
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  setSlashIndex(0);
                  setSlashDismissed(false);
                  setQueueNote(undefined);
                  // Emptying the composer detaches the staged intent
                  // (run-view-86): sending something else stamps nothing.
                  if (props.staged && event.target.value.trim().length === 0) {
                    props.onDetachStaged?.();
                  }
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
                placeholder={connected ? "Message the Captain…" : "Connecting…"}
                disabled={!connected}
              />
            }
            caption={
              <ComposerCaption
                staged={props.staged}
                onDetachStaged={props.onDetachStaged}
                note={queueNote}
              />
            }
            secondary={
              props.onQueueInstead && !props.staged ? (
                <button
                  type="button"
                  data-testid="queue-intent-button"
                  title="Add this to the project's Up next without sending it"
                  disabled={
                    text.trim().length === 0 || busy || queueing || !connected
                  }
                  onClick={() => {
                    const trimmed = text.trim();
                    if (!trimmed || queueing) return;
                    setQueueing(true);
                    props
                      .onQueueInstead!(trimmed)
                      .then(() => {
                        setText("");
                        setQueueNote("Added to Up next — see the project's Overview.");
                      })
                      .catch((cause: Error) => setError(cause.message))
                      .finally(() => {
                        setQueueing(false);
                        composerRef.current?.focus();
                      });
                  }}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  Add to Up next
                </button>
              ) : null
            }
            actions={
              <button
                type="button"
                data-testid="start-send"
                disabled={busy || !connected || text.trim().length === 0}
                onClick={() => void start()}
                title={
                  props.hasProject
                    ? "Enter to send · Shift+Enter for a new line"
                    : props.hasProjects
                      ? `Pick a project first (${keyLabel("P")})`
                      : `Add a project first (${keyLabel("P")})`
                }
                className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-40"
              >
                {busy ? "Starting…" : "Send"}
              </button>
            }
          />
        </div>
      </div>
    </div>
  );
}
