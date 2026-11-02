// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A project's Playbooks tab (playbook-library-1, DR-176): what runs in
// the project, under two headings — the project's name, for the
// playbooks its packages place, and "Global", for those your global
// packages place, a playbook both place listed once, under Global. Each
// row reads its command, `from <package> <version>`, its intent and its
// roles grouped by the player that plays them; ✎ under the project's
// name edits the project's entry, under Global the project's override,
// "Same as global" first. Every act on the tab writes the project's
// config or environment, and no row names a config or scope. The
// project's authoring sessions follow the playbooks; the example closes
// the tab. An authoring session of the project opened here replaces the
// list with its workspace. The packages themselves stand on the
// project's Packages tab, which "Manage packages" opens.

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { DraftInfo, PlaybookAvailability, ProjectInfo } from "@sublang/spex-core/protocol";

import { usePlaceStore } from "../state/place-context.js";
import { SLC_DEMO } from "../examples/slc-demo.js";
import { NEUTRAL_BLOCK } from "../lib/config-ops.js";
import { draftPackagePath } from "../lib/drafts.js";
import { i18n } from "../i18n.js";
import { AuthoringWorkspace } from "./AuthoringWorkspace.js";
import { Markdown } from "./Markdown.js";
import { Rich } from "./Rich.js";
import { AddedNote, AuthoringSection, announcementFor, useNewPackageFields } from "./PlaybookAuthoring.js";
import { InvalidEntryRow, PlaybookCard, playbookHints, type CardScope } from "./PlaybookCard.js";
import { StageBox, StageRow } from "./PlaybookStages.js";

export { NEUTRAL_BLOCK };

const ERROR =
  "rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 [overflow-wrap:anywhere] dark:border-red-900 dark:bg-red-950 dark:text-red-300";

/** One row per playbook id (playbook-library-1): the placing a session
 * finds — one that runs first, then one present on this device — the
 * environment's order kept. */
export function rowsById(list: readonly PlaybookAvailability[]): PlaybookAvailability[] {
  const ids = [...new Set(list.map((entry) => entry.id))];
  return ids.map(
    (id) =>
      list.find((entry) => entry.id === id && entry.runs) ??
      list.find((entry) => entry.id === id && entry.present) ??
      list.find((entry) => entry.id === id)!,
  );
}

/** The ids and names the environments' playbooks hold, which a new
 * playbook's id may not take (playbook-library-51). */
export function takenIds(lists: readonly (readonly PlaybookAvailability[])[]): Map<string, PlaybookAvailability> {
  const taken = new Map<string, PlaybookAvailability>();
  for (const row of lists.flat()) {
    taken.set(row.id, row);
    taken.set(row.name, row);
  }
  return taken;
}

/** Bring a card an Add listed into view, highlighted until it fades,
 * its success line standing until the page is left
 * (playbook-library-61); the live region says it. */
export function useRevealedCard(rows: readonly PlaybookAvailability[], announce: (note: string) => void) {
  const store = usePlaceStore();
  const revealPlaybook = store((state) => state.revealPlaybook);
  const consumeRevealPlaybook = store((state) => state.consumeRevealPlaybook);
  const [revealed, setRevealed] = useState<string>();
  const [added, setAdded] = useState<string>();
  useEffect(() => {
    if (revealPlaybook === undefined) return;
    const reveal = consumeRevealPlaybook();
    if (reveal === undefined) return;
    setRevealed(reveal);
    setAdded(reveal);
    const listed = rows.find((entry) => entry.id === reveal);
    announce(i18n._({ id: "Added /{command}", comment: "said by the live region once an authored playbook is added", values: { command: listed?.command ?? reveal } }));
    document.getElementById(`playbook-card-${reveal}`)?.scrollIntoView?.({ block: "center" });
  }, [revealPlaybook, consumeRevealPlaybook, rows, announce]);
  useEffect(() => {
    if (revealed === undefined) return;
    const timer = setTimeout(() => setRevealed(undefined), 2400);
    return () => clearTimeout(timer);
  }, [revealed]);
  return { revealed, added };
}

/** The live region narrating the authoring sessions' transitions
 * (DR-010 §7), and anything else the page says. */
export function useLiveNote() {
  const drafts = usePlaceStore()((state) => state.drafts);
  const [note, setNote] = useState("");
  const previous = useRef<Record<string, DraftInfo>>({});
  useEffect(() => {
    let next: string | undefined;
    for (const draft of Object.values(drafts)) {
      next = announcementFor(previous.current[draft.id], draft) ?? next;
    }
    previous.current = drafts;
    if (next) setNote(next);
  }, [drafts]);
  const region = (
    <div aria-live="polite" role="status" className="sr-only" data-testid="library-live">
      {note}
    </div>
  );
  return { region, announce: setNote };
}

/** The gate a list stands behind: playbooks need a valid config, the way
 * to Settings inside the one phrase. */
export function ConfigGate({ onNavigate }: { onNavigate?: (surface: "Settings" | "Space") => void }) {
  return (
    <div className="relative m-auto max-h-full max-w-md overflow-y-auto p-6 text-center text-sm text-neutral-500">
      {/* One phrase with the way to Settings inside it, so no
          translation is assembled from pieces. */}
      <p>
        <Rich
          text={i18n._("Playbooks need a valid config — fix it in <0>Settings</0>.")}
          components={[
            onNavigate ? (
              <button
                type="button"
                key="settings"
                onClick={() => onNavigate("Settings")}
                className="text-brand-600 hover:underline dark:text-brand-300"
              />
            ) : (
              <span className="font-medium" key="settings" />
            ),
          ]}
        />
      </p>
    </div>
  );
}

export function PlaybooksTab({
  project,
  onNavigate,
}: {
  /** The project whose tab this is, at the place it is shown. */
  project: ProjectInfo;
  onNavigate?: (surface: "Settings" | "Space") => void;
}) {
  const store = usePlaceStore();
  const configState = store((state) => state.configState);
  const readiness = store((state) => state.readiness);
  const connection = store((state) => state.connection);
  const drafts = store((state) => state.drafts);
  const openDraftId = store((state) => state.openDraftId);
  const listDrafts = store((state) => state.listDrafts);
  const createDraft = store((state) => state.createDraft);
  const openDraft = store((state) => state.openDraft);
  const closeDraft = store((state) => state.closeDraft);
  const setDraftSourceMode = store((state) => state.setDraftSourceMode);
  const consumeNewPlaybookRequest = store((state) => state.consumeNewPlaybookRequest);
  const newPlaybookRequested = store((state) => state.newPlaybookRequested);
  const readLists = store((state) => state.playbookLists);
  const composed = store((state) => state.projectConfigs[project.id]);
  const loadProjectConfig = store((state) => state.loadProjectConfig);
  const loadPlaybookLists = store((state) => state.loadPlaybookLists);

  const projectId = project.id;
  const connected = connection === "open";
  const [listError, setListError] = useState<string>();
  const [exampleError, setExampleError] = useState<string>();
  const [focusNew, setFocusNew] = useState(false);
  const fields = useNewPackageFields(projectId);
  const live = useLiveNote();

  // What the environments place, as read for this project: a read for
  // another project, or for the Playbooks surface, lists nothing here.
  const lists = readLists?.projectId === projectId ? readLists : undefined;

  const reloadLists = useCallback(() => {
    setListError(undefined);
    void loadPlaybookLists(projectId).catch((cause: Error) => setListError(cause.message));
  }, [loadPlaybookLists, projectId]);

  useEffect(() => {
    if (!connected) return;
    // The tab's activation reads the authoring sessions
    // (playbook-library-50) and what each environment places
    // (playbook-library-1).
    void listDrafts().catch(() => {});
    reloadLists();
    // The players a session in the project runs with, and the positions
    // each plays there (core-service-2).
    void loadProjectConfig(projectId).catch(() => {});
  }, [connected, listDrafts, reloadLists, loadProjectConfig, projectId]);

  // The slash menu's request lands on the id field (playbook-library-51).
  useEffect(() => {
    if (newPlaybookRequested && consumeNewPlaybookRequest()) setFocusNew(true);
  }, [newPlaybookRequested, consumeNewPlaybookRequest]);

  // The project's playbooks — those the global environment places too
  // list once, under Global — then the global ones (playbook-library-1).
  const globalRows = rowsById(lists?.own ?? []);
  const projectRows = rowsById((lists?.project ?? []).filter((entry) => !entry.placedBy.includes("own")));
  const everyRow = [...projectRows, ...globalRows];
  const { revealed, added } = useRevealedCard(everyRow, live.announce);

  const prefillFromExample = useCallback(async (): Promise<void> => {
    // The example opens an authoring session in paste mode with the
    // normalized text — never the raw prose, since the pipeline skips
    // slc's normalize phase — and writes nothing (playbook-library-35).
    setExampleError(undefined);
    const id = SLC_DEMO.playbookId;
    setDraftSourceMode(id, {
      mode: "paste",
      pasteText: SLC_DEMO.stages.normalized,
      pastePath: "",
    });
    try {
      if (store.getState().drafts[id]) await openDraft(id);
      // A new session takes New playbook's org and license
      // (playbook-library-35).
      else await createDraft(id, fields.fields, projectId);
    } catch (cause) {
      setExampleError((cause as Error).message);
    }
  }, [createDraft, openDraft, setDraftSourceMode, fields.fields.org, fields.fields.license, projectId, store]);

  if (!configState || configState.status !== "valid") return <ConfigGate onNavigate={onNavigate} />;
  // The players as a session in the project composes them: your roster,
  // each player a binding there names that it lacks, and the positions
  // each plays in the project — its overrides and its own playbooks
  // counted; the global composition while the project's is not read
  // (playbook-library-1, playbook-library-38).
  const roster = (composed?.status === "valid" ? composed.summary.players : configState.summary.players) ?? [];

  // An authoring session of this project replaces the list with its
  // workspace (playbook-library-52); it stays open in the core while the
  // list is shown.
  if (openDraftId && drafts[openDraftId]?.projectId === projectId) {
    return (
      <>
        {live.region}
        <AuthoringWorkspace draftId={openDraftId} onBack={closeDraft} onNavigate={onNavigate} />
      </>
    );
  }

  // The project's written entries failing validation, each on its row
  // or, where none lists it, on a row of its own (playbook-library-2);
  // a global entry's failures stand on the Playbooks surface.
  const invalid = (lists?.invalid ?? []).filter((entry) => entry.config === "project");
  const invalidOf = (id: string) => invalid.filter((entry) => entry.playbook === id).map((entry) => entry.reason);
  const strayInvalid = invalid.filter((entry) => !everyRow.some((row) => row.id === entry.playbook));
  // What runs, for the review and delivery hints (playbook-library-48,
  // playbook-library-89).
  const running = new Set(everyRow.filter((row) => row.runs).map((row) => row.id));
  const taken = takenIds([lists?.project ?? [], lists?.own ?? []]);

  const cardFor = (entry: PlaybookAvailability, scope: CardScope): ReactNode => (
    <PlaybookCard
      key={entry.id}
      entry={entry}
      scope={scope}
      invalid={invalidOf(entry.id)}
      roster={roster}
      readiness={readiness}
      revealed={revealed === entry.id}
      addedNote={
        added === entry.id ? (
          <AddedNote folder={drafts[entry.id]?.projectId === projectId ? draftPackagePath(drafts[entry.id]!) : undefined} />
        ) : undefined
      }
      hints={playbookHints(entry, running)}
      onChanged={reloadLists}
    />
  );

  const empty = lists !== undefined && everyRow.length === 0 && strayInvalid.length === 0;
  return (
    // The tab's root is the box Playbooks scrolls in (DR-041 §9):
    // height-constrained, and the containing block for its own
    // positioned content, so the page itself never scrolls.
    <div
      data-testid="playbooks-tab"
      className="@container relative mx-auto flex w-full min-h-0 max-w-3xl flex-1 flex-col gap-5 overflow-y-auto p-6"
    >
      {live.region}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-lg font-semibold">{i18n._({ id: "Playbooks", comment: "heading of the project's Playbooks tab" })}</h1>
        {/* The packages stand on their own tab (playbook-library-1). */}
        <button
          type="button"
          data-testid="manage-packages"
          onClick={() => store.getState().setWorkspaceTab(projectId, "packages")}
          className="ml-auto text-xs text-brand-600 hover:underline dark:text-brand-300"
        >
          {i18n._({ id: "Manage packages", comment: "link on the Playbooks tab: opens the project's Packages tab" })}
        </button>
      </div>
      {listError ? (
        <div role="alert" className={ERROR}>
          {listError}
        </div>
      ) : null}
      {!lists ? (
        <p className="text-xs text-neutral-500">{i18n._({ id: "loading…", comment: "a request for this pane's content is in flight" })}</p>
      ) : null}

      {/* A heading with no row is left out (playbook-library-1). */}
      {projectRows.length > 0 || strayInvalid.length > 0 ? (
        <section data-testid="playbooks-project" className="flex flex-col gap-2">
          <h2 className="truncate text-sm font-semibold text-neutral-500" title={project.name}>
            {project.name}
          </h2>
          {projectRows.map((entry) => cardFor(entry, { kind: "project", projectId }))}
          {strayInvalid.map((entry) => (
            <InvalidEntryRow key={entry.playbook} entry={entry} repository={projectId} onChanged={reloadLists} />
          ))}
        </section>
      ) : null}
      {globalRows.length > 0 ? (
        <section data-testid="playbooks-global" className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-neutral-500">
            {i18n._({ id: "Global", comment: "heading on a project's Playbooks tab: the playbooks of your global packages, which run in every project of yours" })}
          </h2>
          {globalRows.map((entry) => cardFor(entry, { kind: "override", projectId }))}
        </section>
      ) : null}
      {empty ? (
        <div
          data-testid="playbooks-empty"
          className="rounded-lg border border-dashed border-neutral-300 px-4 py-5 text-center text-sm text-neutral-500 dark:border-neutral-700"
        >
          {i18n._({ id: "No playbooks yet", comment: "a Playbooks list while no package places a playbook" })}
        </div>
      ) : null}

      <AuthoringSection
        repository={projectId}
        taken={taken}
        fields={fields}
        autoFocus={focusNew}
        onAutoFocused={() => setFocusNew(false)}
        onAnnounce={live.announce}
      />

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-neutral-500">{i18n._({ id: "Example", comment: "section heading: the demo playbook" })}</h2>
        <ExampleCard
          onPrefill={prefillFromExample}
          blockedReason={
            drafts[SLC_DEMO.playbookId] || fields.ready
              ? undefined
              : i18n._({ id: "Org and License first", comment: "the example's prefill waits for New playbook's Org and License" })
          }
          error={exampleError}
        />
      </section>
    </div>
  );
}

/** The example's four stages. Each label and hint is read when the row
 * draws, never when this module loads, so the table never freezes the
 * language it was imported in (localization-4). */
const EXAMPLE_STAGES = [
  {
    key: "source",
    get label() {
      return i18n._({ id: "Source", comment: "pipeline stage: the authored workflow" });
    },
    get hint() {
      return i18n._("The raw prose the example starts from");
    },
  },
  {
    key: "normalized",
    // The row is card chrome, so the label holds the 14-character
    // budget and the full truth lives in the title (DR-041).
    get label() {
      return i18n._({ id: "Normalized", comment: "pipeline stage: slc's normalized workflow markdown" });
    },
    get hint() {
      return i18n._("Normalized text: the prose as workflow markdown, in slc's normalized form");
    },
  },
  {
    key: "gears",
    get label() {
      return i18n._({
        id: "Gears",
        comment: "pipeline stage: the compiler's normative spec items (a proper name)",
      });
    },
    get hint() {
      return i18n._("One normative spec item per state behavior — the compiler's middle stage");
    },
  },
  {
    key: "fsm",
    get label() {
      return i18n._({ id: "State machine", comment: "pipeline stage: the compiled machine" });
    },
    get hint() {
      return i18n._("The compiled XState machine that drives the players");
    },
  },
] as const;
type ExampleStageKey = (typeof EXAMPLE_STAGES)[number]["key"];

/** Read-only example card (PBLIB-35, DR-015, DR-089): the same stage
 * row as a listed playbook wears, over four in-memory stages, with a
 * prefill that opens an authoring workspace in paste mode — offered
 * only with a project chosen, where an authoring session lives. */
function ExampleCard({
  onPrefill,
  blockedReason,
  error,
}: {
  onPrefill: () => Promise<void>;
  blockedReason?: string;
  error?: string;
}) {
  const [stage, setStage] = useState<ExampleStageKey>();
  const [busy, setBusy] = useState(false);
  const content = stage ? SLC_DEMO.stages[stage] : undefined;

  return (
    <div
      data-testid="example-card"
      className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* The demo's own name and credit are the example's content,
            not words of ours; only the phrases around them are. */}
        <span className="min-w-0 truncate text-sm font-semibold">
          {i18n._("Example: {title}", { title: SLC_DEMO.title })}
        </span>
        <span className="min-w-0 truncate text-xs text-neutral-500">
          {i18n._("from {credit}", { credit: SLC_DEMO.credit })}
        </span>
        <span className="ml-auto" />
        <button
          type="button"
          data-testid="example-prefill"
          disabled={busy || blockedReason !== undefined}
          title={
            blockedReason ??
            i18n._(
              "Opens a playbook named {id} with the normalized text ready to paste — nothing is written or compiled",
              { id: SLC_DEMO.playbookId },
            )
          }
          onClick={() => {
            setBusy(true);
            void onPrefill().finally(() => setBusy(false));
          }}
          className="rounded-md border border-brand-300 px-2 py-0.5 text-xs text-brand-600 hover:bg-brand-50 disabled:opacity-40 dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-950"
        >
          {busy ? i18n._({ id: "Opening…", comment: "an authoring session is being opened" }) : i18n._({ id: "Prefill", comment: "open an authoring session carrying the example's text" })}
        </button>
      </div>
      {error ? (
        <div
          data-testid="example-error"
          className={ERROR}
        >
          {error}
        </div>
      ) : null}
      <StageRow
        stages={EXAMPLE_STAGES}
        open={stage}
        onPress={(key) =>
          setStage((current) => (current === key ? undefined : key))
        }
        testId="example-stages"
      />
      {content !== undefined ? (
        <StageBox
          id="example"
          stage={EXAMPLE_STAGES.find((entry) => entry.key === stage)?.label ?? ""}
        >
          {stage === "fsm" || stage === "source" ? (
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-neutral-700 dark:text-neutral-300">
              {content}
            </pre>
          ) : (
            <Markdown text={content} />
          )}
        </StageBox>
      ) : null}
    </div>
  );
}
