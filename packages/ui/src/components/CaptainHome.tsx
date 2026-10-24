// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Captain home (DR-007, DR-135, DR-141): a welcome page until a
// project exists — at a team server, its server form (DR-133) — then a
// scoped task start with slash discovery. Props-driven so RUN-29/31
// exercise it without a live core.

import { useEffect, useRef, useState, type ReactNode } from "react";
import type {
  AgentSummary,
  IntentInfo,
  PlaybookSummary,
  ReadinessEntry,
  SpecTreeState,
} from "@sublang/spex-core/protocol";

import { i18n } from "../i18n.js";
import { canSubmitContent, type ComposerAttachmentControls } from "./ComposerAttachments.js";
import type { AgentPatch } from "../lib/config-ops.js";
import { keyLabel } from "../lib/shortcuts.js";
import { playbookIntent } from "../lib/playbook-intent.js";
import { treeCounts } from "../lib/spec-view-model.js";
import { isLocalPlace, placeLabel, type StagedIntent } from "../state/store.js";
import { usePlaceStore } from "../state/place-context.js";
import { SlashMenuList, slashMatches } from "./SlashMenu.js";
import { AgentChip, agentChipText, fastModeWord, readinessWord } from "./AgentChip.js";
import { AgentEditorPopover } from "./AgentEditor.js";
import { Icon } from "./Icon.js";
import { NextCard, type NextCardIntent } from "./NextCard.js";
import { Rich } from "./Rich.js";
import {
  ComposerBox,
  ComposerCaption,
  ComposerField,
  sendKeys,
} from "./Composer.js";

export interface CaptainHomeProps {
  /** The workspace's project context (DR-011); the bar owns choice. */
  hasProject: boolean;
  /** Whether the workspace holds any project at all: with none, the
   * remedy is adding one, not picking one (run-view-25). */
  hasProjects?: boolean;
  projectName?: string;
  projectId?: string;
  /** The current project's parsed specs tree; absent until read. */
  specTree?: SpecTreeState;
  specError?: string;
  onOpenSpecs?: () => void;
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
  /** The welcome page's own-project path opens the palette without
   * repeating the Academy choice. */
  onOpenOwnProject?: () => void;
  /** Go to a surface at the place this home shows (run-view-168):
   * the server form's "Open Groups" opens Groups there (run-view-174). */
  onNavigate: (surface: "Settings" | "Playbooks" | "Space") => void;
  /** Apply a merge patch to the Captain's block (captain.set). */
  onSaveCaptain: (patch: AgentPatch) => Promise<unknown>;
  onStart: (text: string) => Promise<void>;
  /** The project's core-published next intent with the count of the
   * rest — the home's next card (run-view-88, DR-077). */
  next?: NextCardIntent;
  /** Stage the next intent into this composer (run-view-86/88). */
  onStartIntent?: (intent: IntentInfo) => Promise<void> | void;
  /** The staged dispatch this composer wears (key "home"). */
  staged?: StagedIntent;
  /** Detach the staged chip without sending (DR-035). */
  onDetachStaged?: () => void;
  /** Queue the typed text as an intent instead of starting a session
   * (DR-035); absent while no project is current — the control hides. */
  onQueueInstead?: (text: string) => Promise<void>;
  attachments?: ComposerAttachmentControls;
}

/** Breathing room the popover leaves against the window's edge. */
const POPOVER_MARGIN = 8;

/** Where an anchored popover opens and how tall it may be (DR-009,
 * DR-041 §9). The chip that opens the Captain editor sits at the foot
 * of the home, so a dialog that always opened upward ran off the top
 * of a short window with nothing able to scroll it back. The anchor
 * grants the room instead: the roomier side wins, and the popover
 * takes at most what the window can show there — scrolling inside
 * that bound rather than outside the viewport. */
export function popoverRoom(
  anchor: HTMLElement | null | undefined,
): { direction: "up" | "down"; room?: number } {
  const height = typeof window === "undefined" ? 0 : window.innerHeight;
  const rect = anchor?.getBoundingClientRect();
  // An unpainted or simulated document measures nothing; the popover
  // then keeps its natural place and size.
  if (!rect || height === 0 || (rect.top === 0 && rect.bottom === 0)) {
    return { direction: "up" };
  }
  const above = rect.top - POPOVER_MARGIN;
  const below = height - rect.bottom - POPOVER_MARGIN;
  return above >= below
    ? { direction: "up", room: Math.max(above, 0) }
    : { direction: "down", room: Math.max(below, 0) };
}

function previewIntent(playbook: PlaybookSummary): string {
  if (playbook.command === "code" && playbook.intent === "implement a coding intent in reviewed, one-commit phases, using an intent record when needed") {
    return i18n._("build and review step by step");
  }
  if (playbook.command === "review" && playbook.intent === "review a supplied scope of committed work until no unsettled findings remain") {
    return i18n._("review committed changes");
  }
  return playbookIntent(playbook.intent);
}

function CaptainBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
        {i18n._({
          id: "C",
          comment: "the Captain's avatar: one letter standing for Captain",
        })}
      </span>
      <div
        className="max-w-[85%] rounded-2xl rounded-bl-md bg-neutral-200/60 px-3 py-2 text-sm dark:bg-neutral-800"
      >
        {children}
      </div>
    </div>
  );
}

/** One step of the welcome page's path (run-view-172). */
interface WelcomeStep {
  label: string;
  text: string;
}

const WELCOME_PRIMARY =
  "rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";
const WELCOME_SECONDARY =
  "rounded-lg border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800";

/** The welcome page's one layout (run-view-172), which the server
 * form wears with the server's words (run-view-174): the badge, the
 * headline, the three connected steps, the actions, and the notices
 * the page keeps beneath them. */
function WelcomeFrame({
  headline,
  steps,
  actions,
  children,
}: {
  headline: string;
  steps: WelcomeStep[];
  actions: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section
      data-testid="welcome-home"
      className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-y-auto px-6 py-10 sm:px-10"
    >
      <div className="my-auto max-w-xl">
        <span className="mb-5 inline-flex rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300">
          Spex
        </span>
        <h1 className="text-3xl font-semibold leading-tight tracking-tight text-neutral-900 dark:text-neutral-100 sm:text-4xl">
          {headline}
        </h1>
        <ol className="mt-5 max-w-lg border-l border-neutral-300 text-sm leading-6 dark:border-neutral-700">
          {steps.map((step, index) => (
            <li key={step.label} className={index < steps.length - 1 ? "relative pb-3 pl-5" : "relative pl-5"}>
              <span
                aria-hidden="true"
                className={`absolute -left-[5px] top-2 size-2 rounded-full ${
                  index === 0 ? "bg-brand-500" : "bg-neutral-400 dark:bg-neutral-500"
                }`}
              />
              <span className="font-semibold text-neutral-800 dark:text-neutral-100">{step.label}</span>
              <span className="ml-3 text-neutral-600 dark:text-neutral-300">{step.text}</span>
            </li>
          ))}
        </ol>
        <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          {actions}
        </div>
        {children}
      </div>
    </section>
  );
}

export function CaptainHome(props: CaptainHomeProps) {
  const store = usePlaceStore();
  const { playbooks, captain, readiness, connected } = props;
  const [localText, setLocalText] = useState("");
  // Draft lives in the store when the host wires it (DR-010: surface
  // switches never eat text); local state covers standalone renders.
  const text = props.onDraftChange ? (props.draft ?? "") : localText;
  const setText = props.onDraftChange ?? setLocalText;
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [queueing, setQueueing] = useState(false);
  /** Transient queue-instead acknowledgment (run-view-85). */
  const [queueNote, setQueueNote] = useState<string>();
  const [captainPopover, setCaptainPopover] =
    useState<ReturnType<typeof popoverRoom>>();
  // With nothing registered the greeting itself carries the ways in
  // (run-view-25); seeding is the store action the palette uses. The
  // example is seeded at a folder this page names, so it is this
  // computer's alone: a seat greets the member with the server form,
  // its projects opened among the member's groups and its core
  // allocating every folder (run-view-169, run-view-174).
  const openAcademyExample = store((state) => state.openAcademyExample);
  const local = isLocalPlace(store.place);
  const [seeding, setSeeding] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);

  // A window resized under an open popover re-decides its side and
  // its room, so it never ends up outside a window it once fitted.
  const popoverOpen = captainPopover !== undefined;
  useEffect(() => {
    if (!popoverOpen) return;
    const remeasure = (): void => setCaptainPopover(popoverRoom(chipRef.current));
    window.addEventListener("resize", remeasure);
    return () => window.removeEventListener("resize", remeasure);
  }, [popoverOpen]);

  const captainReadiness = captain
    ? readiness.find((entry) => entry.adapter === captain.adapter)
    : undefined;
  const captainControlName = captain
    ? [
        i18n._("Configure the Captain agent"),
        agentChipText({ ...captain, fastMode: false }),
        captain.fastMode ? fastModeWord() : undefined,
        captainReadiness ? readinessWord(captainReadiness.ready) : undefined,
      ].filter(Boolean).join(", ")
    : i18n._("Configure the Captain agent");
  const captainUnavailable = captainReadiness?.ready === false;
  const readyAlternative = captainUnavailable && readiness.some(
    (entry) => entry.ready && entry.adapter !== captain?.adapter,
  );
  const slashItems = slashMatches(text, playbooks);
  const slash = slashDismissed ? undefined : slashItems;
  const configBroken =
    props.configStatus === "invalid" || props.configStatus === "missing";
  const previewPlaybooks = [
    ...["code", "review"].map((command) => playbooks.find((entry) => entry.command === command)),
    ...playbooks,
  ].filter((entry, index, entries): entry is PlaybookSummary =>
    entry !== undefined && entries.findIndex((candidate) => candidate?.id === entry.id) === index,
  ).slice(0, 2);
  const specCounts = props.specTree?.present && !props.specTree.legacy
    ? treeCounts(props.specTree.files)
    : undefined;
  const specState = props.specError
    ? "error"
    : !props.specTree
      ? connected ? "loading" : "disconnected"
      : props.specTree.legacy
        ? "legacy"
        : !props.specTree.present
          ? "missing"
          : specCounts?.packages
            ? "ready"
            : "empty";

  async function start(): Promise<void> {
    if (!canSubmitContent(text, props.attachments?.files) || busy || !connected) {
      return;
    }
    if (!props.hasProject) {
      // The palette owns project choice (DR-011); the draft stays.
      props.onOpenPalette();
      return;
    }
    if (captainUnavailable) return;
    setError(undefined);
    setBusy(true);
    try {
      await props.onStart(text);
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
      // Registration and selection happen in the store; the project
      // home then takes over this welcome page.
      await openAcademyExample();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSeeding(false);
      composerRef.current?.focus();
    }
  }

  // A fresh Captain canvas centers the task guidance and composer.
  // Any real content reverts to the IM bottom-docked layout (DR-010 §8).
  const emptyCanvas = !configBroken && !error;

  if (!props.hasProject && !props.hasProjects) {
    // The third step reads the same at every place.
    const delivery: WelcomeStep = {
      label: i18n._("Delivery"),
      text: i18n._("AI builds and reviews changes, with a record of each step"),
    };
    const server = placeLabel(store.place);
    return (
      <WelcomeFrame
        headline={
          local
            ? i18n._("Write clear specs. Build with playbooks.")
            : i18n._({
                id: "Work on {server} from this computer.",
                values: { server },
                comment: "headline of the welcome page at a team server where you have no project yet; {server} is the server's name",
              })
        }
        steps={
          local
            ? [
                { label: i18n._("Specs"), text: i18n._("Describe how the system should work and how to check it") },
                { label: i18n._("Playbooks"), text: i18n._("Turn workflows written in plain language into steps AI can run") },
                delivery,
              ]
            : [
                {
                  label: i18n._({
                    id: "Groups",
                    comment: "label of the first step on the welcome page at a team server: your groups on the Git host, whose spex repositories are the projects there",
                  }),
                  text: i18n._({
                    id: "Your projects here come from the spex repositories of your groups",
                    comment: "the first step on the welcome page at a team server, beside its label Groups; \"here\" is that server",
                  }),
                },
                {
                  label: i18n._({
                    id: "Seat",
                    comment: "label of the second step on the welcome page at a team server: your seat, the place your agents run on that server",
                  }),
                  text: i18n._({
                    id: "Agents run on {server} as you, in folders the server allocates",
                    values: { server },
                    comment: "the second step on the welcome page at a team server, beside its label Seat; {server} is the server's name",
                  }),
                },
                delivery,
              ]
        }
        actions={
          local ? (
            <>
              <button
                type="button"
                data-testid="home-add-project"
                onClick={props.onOpenOwnProject ?? props.onOpenPalette}
                className={WELCOME_PRIMARY}
              >
                {i18n._("Add a local project")}
              </button>
              <button
                type="button"
                data-testid="home-academy"
                disabled={seeding || !connected}
                onClick={() => void runAcademy()}
                className={WELCOME_SECONDARY}
              >
                {seeding
                  ? i18n._("Opening…")
                  : i18n._("Open the Academy example")}
              </button>
            </>
          ) : (
            // A seat's projects are its member's groups' spex
            // repositories, opened from the palette with no folder
            // (run-view-169), or from that place's Groups.
            <>
              <button
                type="button"
                data-testid="home-open-from-groups"
                onClick={props.onOpenPalette}
                className={WELCOME_PRIMARY}
              >
                {i18n._({
                  id: "Open a project from your groups",
                  comment: "primary action of the welcome page at a team server: opens the project palette listing your groups' projects there",
                })}
              </button>
              <button
                type="button"
                data-testid="home-open-groups"
                onClick={() => props.onNavigate("Space")}
                className={WELCOME_SECONDARY}
              >
                {i18n._({
                  id: "Open Groups",
                  comment: "secondary action of the welcome page at a team server: shows the Groups surface at that server",
                })}
              </button>
            </>
          )
        }
      >
        {configBroken ? (
          <div
            role="alert"
            className="mt-6 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          >
            <p>
              {props.configStatus === "missing"
                ? i18n._("Spex has no config file yet — playbooks are unavailable.")
                : i18n._("Your config file has errors — playbooks are unavailable.")}
            </p>
            {props.configErrors?.slice(0, 3).map((entry, index) => (
              <p key={index} className="mt-1 font-mono text-xs">
                {entry}
              </p>
            ))}
            <button
              type="button"
              onClick={() => props.onNavigate("Settings")}
              className="mt-2 font-medium text-brand-600 hover:underline dark:text-brand-300"
            >
              {i18n._("Open Settings →")}
            </button>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="mt-6 text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        ) : null}
      </WelcomeFrame>
    );
  }

  return (
    // The surface root is height-constrained (DR-041 §9): the shell
    // fills the window. The greeting yields first; when the task controls
    // need more room, the home scrolls instead of growing the page.
    <div
      data-testid="captain-home"
      className={`mx-auto flex w-full min-h-0 max-w-2xl flex-1 flex-col overflow-y-auto p-6 ${
        emptyCanvas ? "justify-center-safe" : ""
      }`}
    >
      <div
        className={`relative flex min-h-0 flex-col gap-3 overflow-y-auto ${
          emptyCanvas ? "" : "flex-1 justify-end"
        }`}
      >
        {props.hasProject ? (
          <div data-testid="project-task-start" className="w-full">
            <h1 className="text-2xl font-semibold leading-tight tracking-tight text-neutral-900 dark:text-neutral-100">
              {i18n._("What would you change in {project}?", {
                project: props.projectName ?? i18n._("your project"),
              })}
            </h1>
            <p className="mt-3 text-sm leading-6 text-neutral-600 dark:text-neutral-300">
              {i18n._("Describe your goal. AI helps write specs for how the system should work and how to check it, then follows playbooks to build and review changes.")}
            </p>
            {props.onOpenSpecs ? (
              <div data-testid="project-spec-status" className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
                <span>
                  {specState === "ready" && specCounts
                    ? i18n._("Existing specs: {packages, plural, one {# package} other {# packages}} · {items, plural, one {# item} other {# items}}", { packages: specCounts.packages, items: specCounts.items })
                    : specState === "missing"
                      ? i18n._("No project specs yet")
                      : specState === "empty"
                        ? i18n._("No spec packages yet")
                        : specState === "legacy"
                          ? i18n._("Specs use an older format")
                          : specState === "error"
                            ? i18n._("Couldn't read project specs")
                            : specState === "disconnected"
                              ? i18n._("Connect to read project specs")
                              : i18n._("Reading project specs…")}
                </span>
                {specState !== "loading" && specState !== "disconnected" ? (
                  <button type="button" onClick={props.onOpenSpecs} className="font-medium text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 dark:text-brand-300">
                    {specState === "missing"
                      ? i18n._("See how to start")
                      : specState === "legacy"
                        ? i18n._("See how to update")
                        : specState === "error"
                          ? i18n._("View details")
                          : i18n._("View specs")}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <CaptainBubble>
            <p>
              {i18n._(
                "Pick a project in the sidebar, then describe your goal.",
              )}
            </p>
          </CaptainBubble>
        )}

        {configBroken ? (
          <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            <p className="text-xs font-semibold">
              {props.configStatus === "missing"
                ? i18n._("Spex has no config file yet — playbooks are unavailable.")
                : i18n._("Your config file has errors — playbooks are unavailable.")}
            </p>
            {props.configErrors && props.configErrors.length > 0 ? (
              <ul className="mt-1 flex flex-col gap-0.5 font-mono text-xs">
                {props.configErrors.slice(0, 3).map((entry, index) => (
                  <li key={index}>{entry}</li>
                ))}
                {props.configErrors.length > 3 ? (
                  <li>
                    {i18n._({
                      id: "… and {count} more",
                      values: { count: props.configErrors.length - 3 },
                      comment: "tail of a list the interface cut short",
                    })}
                  </li>
                ) : null}
              </ul>
            ) : null}
            <button
              type="button"
              onClick={() => props.onNavigate("Settings")}
              className="mt-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-300"
            >
              {i18n._("Open Settings →")}
            </button>
          </div>
        ) : null}

        {/* The project's plan (run-view-88): the core-published next
         * intent with its standing and available actions. */}
        <NextCard
          next={props.next}
          connected={connected}
          composerRef={composerRef}
          onStartIntent={props.onStartIntent}
        />

        {error ? (
          <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex flex-col gap-2">
        {props.hasProject && captainUnavailable ? (
          <div
            role="status"
            data-testid="captain-readiness"
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
          >
            <span>
              {i18n._("Set up an agent before starting a task.")}
            </span>{" "}
            <button
              type="button"
              onClick={() => props.onNavigate("Settings")}
              className="font-medium underline"
            >
              {i18n._("Set up an agent")}
            </button>
            {readyAlternative ? (
              <button
                type="button"
                onClick={() => setCaptainPopover(popoverRoom(chipRef.current))}
                className="ml-3 font-medium underline"
              >
                {i18n._("Switch to a ready agent")}
              </button>
            ) : null}
            {props.onRecheckReadiness ? (
              <button
                type="button"
                data-testid="recheck-readiness"
                disabled={rechecking}
                onClick={() => {
                  setRechecking(true);
                  void props.onRecheckReadiness?.().finally(() => setRechecking(false));
                }}
                className="ml-3 font-medium underline disabled:opacity-50"
              >
                {rechecking
                  ? i18n._("Checking…")
                  : i18n._({
                      id: "Re-check",
                      comment: "act: ask the agents whether they are ready now",
                    })}
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
            {i18n._({ id: "C", comment: "the Captain's avatar: one letter standing for Captain" })}
          </span>
          <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Captain</span>
          {/* The anchor grants the popover its room (run-view-32):
              the dialog it holds is capped to what the window can
              show on the side it opened, and scrolls inside that. */}
          <span
            style={
              captainPopover?.room !== undefined
                ? ({
                    "--popover-room": `${captainPopover.room}px`,
                  } as React.CSSProperties)
                : undefined
            }
            className="relative ml-auto flex min-w-0 items-center gap-1 [&>[data-testid=agent-popover]]:max-h-(--popover-room) [&>[data-testid=agent-popover]]:overflow-y-auto"
          >
            <button
              ref={chipRef}
              type="button"
              data-testid="captain-settings"
              title={i18n._("Tweak the Captain agent in place")}
              aria-label={captainControlName}
              aria-expanded={captainPopover !== undefined}
              disabled={!captain}
              onClick={() => {
                const placed = popoverRoom(chipRef.current);
                setCaptainPopover((open) => (open ? undefined : placed));
              }}
              className="group flex min-h-7 min-w-0 max-w-full items-center gap-1 rounded-md px-1 py-0.5 hover:ring-1 hover:ring-neutral-300 focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-60 dark:hover:ring-neutral-700"
            >
              {captain ? <AgentChip agent={captain} readiness={captainReadiness} label="Captain" /> : <span className="text-xs text-neutral-500">{i18n._("not set")}</span>}
              <Icon name="caretDown" className="h-3 w-3 shrink-0 text-neutral-500 group-hover:text-brand-700 dark:group-hover:text-brand-300" />
            </button>
            {captainPopover && captain ? (
              <AgentEditorPopover
                title={i18n._("Captain agent")}
                anchorRef={chipRef}
                direction={captainPopover.direction}
                initial={captain}
                context={props.projectId ? { kind: "project", id: props.projectId } : undefined}
                readiness={readiness}
                onSave={(patch) =>
                  Promise.resolve(props.onSaveCaptain(patch)).then(
                    (result) => {
                      setCaptainPopover(undefined);
                      return result;
                    },
                  )
                }
                onClose={() => setCaptainPopover(undefined)}
              />
            ) : null}
          </span>
        </div>

        {props.hasProject ? <label htmlFor="start-composer" className="sr-only">{i18n._("Describe a project task")}</label> : null}

        <div className="relative">
          {slash ? (
            <SlashMenuList
              items={slash}
              activeIndex={Math.min(slashIndex, slash.length - 1)}
              onPick={insertCommand}
              onCompileNew={() => {
                // The Library lands on its id field (playbook-library-51),
                // at the place shown here: the navigation opens Playbooks
                // there (run-view-168).
                store.getState().requestNewPlaybook();
                props.onNavigate("Playbooks");
              }}
            />
          ) : null}
          {/* The one composer shape (run-view-106): the field on top,
              the caption line the note and the staged chip share, and
              the wrapping action row beneath. */}
          <ComposerBox
            attachments={props.attachments ? { ...props.attachments, disabled: props.attachments.disabled || busy || queueing || !connected } : undefined}
            field={
              <ComposerField
                fieldRef={composerRef}
                id="start-composer"
                data-testid="start-composer"
                aria-describedby={props.hasProject && playbooks.length > 0 ? "start-playbook-hint" : undefined}
                autoFocus
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  setSlashIndex(0);
                  setSlashDismissed(false);
                  setQueueNote(undefined);
                  // Emptying the composer detaches the staged intent
                  // (run-view-86): sending something else stamps nothing.
                  if (props.staged && event.target.value.trim().length === 0 && !props.attachments?.files.length) {
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
                placeholder={
                  connected
                    ? props.hasProject
                      ? i18n._("What should change?")
                      : i18n._("Message the Captain…")
                    : i18n._("Connecting…")
                }
                disabled={!connected}
              />
            }
            caption={props.hasProject && !props.staged && !queueNote ? null :
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
                  title={i18n._("Add this to the project's Up next without sending it")}
                  disabled={
                    !canSubmitContent(text, props.attachments?.files) || busy || queueing || !connected
                  }
                  onClick={() => {
                    if (!canSubmitContent(text, props.attachments?.files) || queueing) return;
                    setQueueing(true);
                    props
                      .onQueueInstead!(text)
                      .then(() => {
                        setText("");
                        setQueueNote(
                          i18n._("Added to Up next — see the project's Overview."),
                        );
                      })
                      .catch((cause: Error) => setError(cause.message))
                      .finally(() => {
                        setQueueing(false);
                        composerRef.current?.focus();
                      });
                  }}
                  className="min-h-8 rounded px-1 text-xs font-medium text-neutral-500 hover:text-neutral-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-40 dark:text-neutral-400 dark:hover:text-neutral-100"
                >
                  {i18n._("Add to Up next")}
                </button>
              ) : null
            }
            actions={
              <button
                type="button"
                data-testid="start-send"
                disabled={busy || !connected || (props.hasProject && captainUnavailable) || !canSubmitContent(text, props.attachments?.files)}
                onClick={() => void start()}
                title={
                  props.hasProject
                    ? sendKeys()
                    : props.hasProjects
                      ? i18n._("Pick a project first ({keys})", {
                          keys: keyLabel("P"),
                        })
                      : i18n._("Add a project first ({keys})", {
                          keys: keyLabel("P"),
                        })
                }
                className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-40"
              >
                {busy
                  ? i18n._("Starting…")
                  : props.hasProject
                    ? i18n._("Start task")
                    : i18n._({ id: "Send", comment: "act: send the typed message" })}
              </button>
            }
          />
        </div>
        {props.hasProject ? (
          <div className="mt-1 space-y-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
            {!configBroken && !props.next && previewPlaybooks.length > 0 ? (
              <div data-testid="playbook-preview">
                <p>
                  {i18n._("A playbook is a workflow written in plain language. Spex turns it into steps for AI to follow.")}{" "}
                  {i18n._("For example:")}{" "}
                  {previewPlaybooks.map((playbook, index) => (
                    <span key={playbook.id}>
                      {index > 0 ? " · " : null}
                      <code className="font-mono">/{playbook.command}</code>{" "}
                      <span className="inline-block max-w-44 truncate align-bottom" title={playbookIntent(playbook.intent)}>{previewIntent(playbook)}</span>
                    </span>
                  ))}
                </p>
              </div>
            ) : null}
            <div className="min-h-5">
              {playbooks.length > 0 ? (
                <span id="start-playbook-hint">
                  <Rich
                    text={i18n._("Type <0>/</0> in the task box to see {count, plural, one {# playbook} other {# playbooks}}", { count: playbooks.length })}
                    components={[<code key="slash" className="font-mono" />]}
                  />
                </span>
              ) : (
                <button type="button" onClick={() => props.onNavigate("Playbooks")} className="font-medium text-brand-700 hover:underline dark:text-brand-300">
                  {i18n._("No playbooks available — open Playbooks")}
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
