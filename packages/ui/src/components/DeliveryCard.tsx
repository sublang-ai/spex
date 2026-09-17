// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The intent delivery card (run-view-87, DR-035): a first-class
// settled card at the intent's final finished turn — title, provenance
// chip, run stats, Confirm foremost with Drop beside — resolving in
// place into the project's queue reading once the verdict lands. The
// source chip (run-view-89) lives here too, shared with the Boss bubble
// that dispatched the intent.

import { useState } from "react";
import type {
  DerivedIntent,
  IntentInfo,
  IntentSource,
  IntentStats,
} from "@sublang/spex-core/protocol";

import { duration } from "../lib/time.js";
import {
  QueuedMark,
  QueueStandingPhrase,
} from "./QueuedIntentPresentation.js";

/** The first line of the intent's text is its display title (DR-035). */
export function intentTitle(intent: IntentInfo): string {
  return intent.text.split(/\r?\n/, 1)[0] ?? intent.text;
}

const SOURCE_LABEL: Record<IntentSource["kind"], (ref: string) => string> = {
  issue: (ref) => `#${ref}`,
  pr: (ref) => `PR ${ref}`,
  record: (ref) => ref,
  chat: () => "chat",
};

/** The intent's provenance chip: the source ref as the label, the raw
 * kind/ref/url in the tooltip. With a canonical URL it activates as a
 * link that opens outside the page — a new tab when served, the system
 * browser on the desktop — so the session never navigates away
 * (run-view-89); without one it is a plain marker — provenance is a
 * category, never a status hue. */
export function SourceChip({
  source,
  onDark,
}: {
  source?: IntentSource;
  /** Rendered on the brand-toned Boss bubble. */
  onDark?: boolean;
}) {
  if (!source) return null;
  const label = SOURCE_LABEL[source.kind](source.ref);
  const tooltip = `${source.kind} ${source.ref}${source.url ? ` — ${source.url}` : ""}`;
  const base =
    "inline-flex max-w-full items-center truncate rounded-full border px-1.5 text-xs font-medium";
  if (source.url) {
    // Interaction wears the brand hue (DR-013); on the Boss bubble the
    // bubble itself is brand, so the chip inverts.
    return (
      <a
        data-testid="intent-source-chip"
        href={source.url}
        target="_blank"
        rel="noreferrer"
        title={tooltip}
        className={`${base} ${
          onDark
            ? "border-white/40 text-white hover:bg-white/10"
            : "border-brand-300 text-brand-600 hover:bg-brand-50 dark:border-brand-700 dark:text-brand-300 dark:hover:bg-brand-950"
        }`}
      >
        {label}
      </a>
    );
  }
  return (
    <span
      data-testid="intent-source-chip"
      title={tooltip}
      className={`${base} ${
        onDark
          ? "border-white/40 text-white"
          : "border-neutral-300 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
      }`}
    >
      {label}
    </span>
  );
}

/** Review rounds foremost (omitted when zero), then turns, then
 * elapsed in the app's one duration vocabulary — the verdict is
 * informed before the click (run-view-87). */
export function statsLine(stats?: IntentStats): string | undefined {
  if (!stats) return undefined;
  const parts: string[] = [];
  if (stats.reviewRounds) {
    parts.push(
      `${stats.reviewRounds} review round${stats.reviewRounds === 1 ? "" : "s"}`,
    );
  }
  parts.push(`${stats.turns} turn${stats.turns === 1 ? "" : "s"}`);
  if (stats.elapsedMs !== undefined) parts.push(duration(stats.elapsedMs));
  return parts.join(" · ");
}

export function DeliveryCard({
  derived,
  closed,
  live,
  ownsConversation,
  next,
  blocked,
  blockedProjectName,
  onClose,
  onStartNext,
  onQueueNext,
}: {
  /** The finished intent as the ledger last derived it. */
  derived: DerivedIntent;
  /** True once the verdict landed and the intent left the open fold:
   * the card resolves in place into the project's queue reading. */
  closed: boolean;
  /** False in an ended session's replay: the card renders inert. */
  live: boolean;
  /** Only the latest dispatch owns subsequent Boss messages. */
  ownsConversation: boolean;
  /** The project's core-published next queued intent, for the pull. */
  next?: DerivedIntent;
  /** The first ranked after-linked row when the project has no next. */
  blocked?: DerivedIntent;
  /** A foreign predecessor project's display name, with id fallback. */
  blockedProjectName?: string;
  onClose(as: "done" | "dropped"): Promise<void>;
  onStartNext(intent: IntentInfo): void | Promise<void>;
  onQueueNext(text: string): Promise<void>;
}) {
  const [busy, setBusy] = useState<"done" | "dropped">();
  const [starting, setStarting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addText, setAddText] = useState("");
  const title = intentTitle(derived.intent);
  const stats = statsLine(derived.stats);
  const inertTitle = live
    ? undefined
    : "This session has ended — the replay is read-only";
  const publishedNext = next?.next ? next : undefined;
  const blockedQueued = !publishedNext && blocked?.blockedBy ? blocked : undefined;
  const queued = publishedNext ?? blockedQueued;
  const blockedPhrase = blockedQueued?.blockedBy
    ? `after ${blockedQueued.blockedBy.title}${
        blockedQueued.blockedBy.projectId !== blockedQueued.intent.projectId
          ? ` (${blockedProjectName ?? blockedQueued.blockedBy.projectId})`
          : ""
      }`
    : undefined;

  // A verdict rules on the intent, not on the session: it is legal on
  // any open intent and reads no runtime state, so it stays takeable
  // in a conversation the core cannot continue — the Dashboard row
  // takes the very same act (dashboard-53, run-view-87).
  function verdict(as: "done" | "dropped"): void {
    if (busy) return;
    setBusy(as);
    void onClose(as)
      .catch(() => {})
      .finally(() => setBusy(undefined));
  }

  if (closed) {
    // The verdict landed: the pull, in place (run-view-87).
    return (
      <div
        data-testid={`delivery-card-${derived.intent.id}`}
        data-settled="1"
        className="mx-auto flex w-full max-w-[95%] flex-col gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          <span className="min-w-0 truncate" title={derived.intent.text}>
            Settled — {title}
          </span>
          <SourceChip source={derived.intent.source} />
        </div>
        {queued ? (
          <div
            data-testid="resolved-next-row"
            className="@container flex items-center gap-2"
          >
            <div
              data-testid="resolved-next-text"
              className="flex min-w-0 flex-1 flex-col @md:flex-row @md:items-baseline @md:gap-2"
            >
              <span
                data-testid="resolved-next-title"
                className="min-w-0 truncate text-sm @md:flex-1"
                title={queued.intent.text}
              >
                {publishedNext ? "Up next: " : null}
                <span className="font-medium">{intentTitle(queued.intent)}</span>
              </span>
              {publishedNext?.next ? (
                <QueueStandingPhrase
                  schedule={publishedNext.next}
                  testId="resolved-next-standing"
                  className="min-w-0 truncate text-xs text-neutral-500 dark:text-neutral-400 @md:max-w-[45%]"
                />
              ) : blockedPhrase ? (
                <span
                  data-testid="resolved-next-blocked"
                  title={blockedPhrase}
                  className="min-w-0 truncate text-xs text-neutral-500 dark:text-neutral-400 @md:max-w-[45%]"
                >
                  {blockedPhrase}
                </span>
              ) : null}
            </div>
            <QueuedMark testId="resolved-next-queued" />
            {publishedNext?.next?.manualStart ? (
              <button
                type="button"
                data-testid="upnext-start"
                aria-label={`Start ${intentTitle(publishedNext.intent)}`}
                disabled={starting || !live}
                title={inertTitle}
                onClick={() => {
                  setStarting(true);
                  void Promise.resolve(onStartNext(publishedNext.intent))
                    .catch(() => {})
                    .finally(() => setStarting(false));
                }}
                className="shrink-0 rounded-md bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-40"
              >
                {starting ? "Starting…" : "Start"}
              </button>
            ) : null}
          </div>
        ) : (
          // Only a truly empty queue becomes capture guidance. A queue
          // with no eligible next shows its first after-linked row above.
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = addText.trim();
              if (!trimmed || adding || !live) return;
              setAdding(true);
              void onQueueNext(trimmed)
                .then(() => setAddText(""))
                .catch(() => {})
                .finally(() => setAdding(false));
            }}
          >
            <input
              data-testid="upnext-add-input"
              value={addText}
              disabled={!live}
              title={inertTitle}
              onChange={(event) => setAddText(event.target.value)}
              placeholder="Nothing queued — name the next intent…"
              className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm outline-none focus:border-neutral-500 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-950 dark:focus:border-neutral-400"
            />
            <button
              type="submit"
              data-testid="upnext-add"
              disabled={addText.trim().length === 0 || adding || !live}
              title={inertTitle}
              className="shrink-0 rounded-md border border-neutral-300 px-3 py-1 text-xs text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              {adding ? "Queuing…" : "Queue"}
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid={`delivery-card-${derived.intent.id}`}
      data-settled="0"
      className="mx-auto flex w-full max-w-[95%] flex-col gap-1.5 rounded-lg border border-neutral-200 border-l-4 border-l-amber-400 bg-white px-3 py-2 dark:border-neutral-800 dark:border-l-amber-500 dark:bg-neutral-900"
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
          Finished
        </span>
        <SourceChip source={derived.intent.source} />
      </div>
      <div
        className="min-w-0 truncate text-sm font-medium"
        title={derived.intent.text}
      >
        {title}
      </div>
      {stats ? (
        <div
          data-testid="delivery-stats"
          className="text-xs text-neutral-500 dark:text-neutral-400"
        >
          {stats}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="delivery-confirm"
          disabled={Boolean(busy)}
          onClick={() => verdict("done")}
          className="rounded-md bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-40"
        >
          {busy === "done" ? "Confirming…" : "Confirm"}
        </button>
        <button
          type="button"
          data-testid="delivery-drop"
          disabled={Boolean(busy)}
          onClick={() => verdict("dropped")}
          className="rounded-md border border-neutral-300 px-3 py-1 text-xs text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          {busy === "dropped" ? "Dropping…" : "Drop"}
        </button>
        {ownsConversation ? (
          <span className="min-w-0 truncate text-xs text-neutral-500 dark:text-neutral-500">
            A follow-up message continues this intent.
          </span>
        ) : null}
      </div>
    </div>
  );
}
