// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Library surface (PBLIB): configured playbooks with per-role inline
// agents (DR-019) and the pipeline stage row (Source → Gears →
// State machine), the drafts in progress with the way to a new one
// (DR-058), the built-ins catalog, and the slc demo example. A draft
// opened here replaces the list with its authoring workspace.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type {
  AgentBlockInput,
  AgentSummary,
  BuiltinPlaybookInfo,
  ConfigEditOpInput,
  DraftInfo,
  PlaybookArtifacts,
  ReadinessEntry,
  SessionPlayerSummary,
} from "@sublang/spex-core/protocol";

import { getClient, useAppStore } from "../state/store.js";
import { SLC_DEMO } from "../examples/slc-demo.js";
import {
  NEUTRAL_BLOCK,
  applyLocalPatch,
  bindRole,
} from "../lib/config-ops.js";
import {
  DRAFT_ID_CAPTION,
  DRAFT_ID_RULE,
  DRAFT_ID_RULE_TEXT,
} from "../lib/drafts.js";
import { phaseLabel } from "../lib/compile-log.js";
import { absoluteTitle, relativeAge } from "../lib/time.js";
import { useClock } from "../lib/useClock.js";
import { AuthoringWorkspace, DraftStateChip } from "./AuthoringWorkspace.js";
import { BindingEditorPopover } from "./BindingEditor.js";
import { Icon } from "./Icon.js";
import { InlineConfirm } from "./InlineConfirm.js";
import { Markdown } from "./Markdown.js";
import { AgentChip } from "./AgentChip.js";
import { AgentEditorPopover } from "./AgentEditor.js";
import {
  GearsItems,
  STAGES,
  StageBox,
  StageRow,
  StateList,
  type StageKey,
} from "./PlaybookStages.js";

export { NEUTRAL_BLOCK };

/** A configured playbook's pipeline (PBLIB-22/23): the stage row is
 * permanent, and the artifacts arrive on the card's first open —
 * one request, held for every later open. */
function PlaybookPipeline({ playbookId }: { playbookId: string }) {
  const [artifacts, setArtifacts] = useState<PlaybookArtifacts>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<StageKey>();

  function press(key: StageKey): void {
    setOpen((current) => (current === key ? undefined : key));
    // Lazy and once: what arrived stays; a failed request is asked
    // again by the next open (DR-010 §5).
    if (artifacts || loading) return;
    setLoading(true);
    setError(undefined);
    getClient()
      .command("playbook.artifacts", { playbookId })
      .then((loaded) => setArtifacts(loaded))
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }

  const content = open && artifacts ? artifacts[open] : null;
  const missingLabels = (artifacts?.missing ?? []).map(
    (key) => STAGES.find((entry) => entry.key === key)?.label ?? key,
  );

  return (
    <div className="flex flex-col gap-2">
      <StageRow
        stages={STAGES}
        open={open}
        absent={artifacts?.missing}
        onPress={press}
        testId={`stages-${playbookId}`}
      />
      {open ? (
        <StageBox
          id={playbookId}
          stage={STAGES.find((entry) => entry.key === open)?.label ?? open}
          // The state list is the State machine stage's header: it
          // names what the code below is made of, so it stands above
          // the frame rather than scrolling away with the module.
          header={
            open === "fsm" && artifacts?.stateIds ? (
              <StateList id={playbookId} states={artifacts.stateIds} />
            ) : undefined
          }
        >
          <div
            className="flex flex-col gap-2"
            data-testid={`pipeline-${playbookId}`}
          >
            {missingLabels.length > 0 ? (
              <div className="text-xs text-amber-600 dark:text-amber-400">
                missing stages: {missingLabels.join(", ")}
              </div>
            ) : null}
            {error ? (
              <div className="text-xs text-red-500">{error}</div>
            ) : !artifacts ? (
              <div className="text-xs text-neutral-500">loading…</div>
            ) : content === null ? (
              <div className="text-xs text-neutral-500">
                this stage was not found for this playbook
              </div>
            ) : open === "fsm" ? (
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-neutral-700 dark:text-neutral-300">
                {content}
              </pre>
            ) : open === "gears" && artifacts.gearsItems ? (
              <GearsItems id={playbookId} file={artifacts.gearsItems} />
            ) : (
              <Markdown text={content} />
            )}
          </div>
        </StageBox>
      ) : null}
    </div>
  );
}

/** An unconfigured built-in from the catalog (DR-015): browsable
 * source plus an add flow assigning an inline agent block per role
 * (DR-019), seeded from the fixed neutral default. */
function BuiltinCard({
  info,
  captain,
  readiness,
  summaryPlayers,
}: {
  info: BuiltinPlaybookInfo;
  captain?: AgentSummary;
  readiness: ReadinessEntry[];
  /** The session roster, so a binding can name a lane that exists. */
  summaryPlayers: SessionPlayerSummary[];
}) {
  const [showSource, setShowSource] = useState(false);
  // role -> lane id, and the lane blocks to mint for ids the roster
  // does not yet hold (DR-032).
  const [bindings, setBindings] = useState<Record<string, string>>({});
  const [players, setPlayers] = useState<Record<string, AgentBlockInput>>({});
  const [openRole, setOpenRole] = useState<string>();
  // Anchor for the open popover: without it the gear's own mousedown
  // reads as an outside click, so the trigger could never close it.
  const roleGearRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const readinessByAdapter = new Map<string, ReadinessEntry>(
    readiness.map((entry) => [entry.adapter as string, entry]),
  );

  function add(): void {
    setBusy(true);
    setError(undefined);
    // Each role binds to a lane; a lane the roster lacks is minted
    // first, so the binding never dangles (DR-032). The proposed id is
    // dev.<role>, which is what makes two playbooks share a coder.
    const laneFor = (role: string): string => bindings[role] ?? `dev.${role}`;
    const existing = new Set(summaryPlayers.map((player) => player.id));
    // A lane carries the block chosen for the role it was minted for;
    // two roles landing on one lane mint it once, from the first.
    const mint = info.roles
      .map((role) => [laneFor(role), role] as const)
      .filter(([id], index, all) => all.findIndex(([other]) => other === id) === index)
      .filter(([id]) => !existing.has(id));
    void mint
      .reduce(
        (chain, [playerId, role]) =>
          chain.then(() =>
            getClient().command("config.edit", {
              op: {
                kind: "player.set",
                playerId,
                patch: players[role] ?? NEUTRAL_BLOCK,
              },
            }),
          ),
        Promise.resolve() as Promise<unknown>,
      )
      .then(() =>
        getClient().command("config.edit", {
          op: {
            kind: "playbook.add",
            playbookId: info.id,
            from: info.from,
            roles: Object.fromEntries(
              info.roles.map((role) => [role, laneFor(role)]),
            ),
          },
        }),
      )
      // Success arrives as a config.state broadcast: the entry moves
      // to the configured list and this card unmounts.
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setBusy(false));
  }

  return (
    <div
      data-testid={`builtin-${info.id}`}
      className="flex flex-col gap-2 rounded-lg border border-dashed border-neutral-300 bg-white px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold">/{info.command}</span>
        <span
          className="min-w-0 flex-1 truncate text-xs text-neutral-500"
          title={info.intent}
        >
          {info.intent}
        </span>
        <span className="ml-auto rounded bg-neutral-100 px-1.5 py-0.5 text-xs whitespace-nowrap text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          available built-in
        </span>
        {info.source ? (
          <button
            type="button"
            data-testid={`builtin-source-toggle-${info.id}`}
            onClick={() => setShowSource((current) => !current)}
            className="rounded-md border border-neutral-300 px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {showSource ? "Hide source" : "View source"}
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-600 dark:text-neutral-400">
        {info.roles.map((role) => {
          const block = players[role] ?? NEUTRAL_BLOCK;
          return (
            <span
              key={role}
              className="relative flex min-w-0 max-w-full flex-wrap items-center gap-1"
            >
              <span className="font-mono">{role}:</span>
              <AgentChip
                agent={block}
                readiness={readinessByAdapter.get(block.adapter)}
                label={role}
              />
              <button
                type="button"
                ref={openRole === role ? roleGearRef : undefined}
                data-testid={`builtin-player-${role}`}
                title={`Tweak the ${role} agent in place`}
                aria-label={`Configure ${role}`}
                onClick={() =>
                  setOpenRole((current) =>
                    current === role ? undefined : role,
                  )
                }
                className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              >
                <Icon name="edit" />
              </button>
              {openRole === role ? (
                <AgentEditorPopover
                  title={`${role} agent`}
                  direction="down"
                  initial={block}
                  readiness={readiness}
                  captain={captain}
                  anchorRef={roleGearRef}
                  onSave={(patch) => {
                    setPlayers((current) => ({
                      ...current,
                      [role]: applyLocalPatch(
                        current[role] ?? NEUTRAL_BLOCK,
                        patch,
                      ),
                    }));
                    setOpenRole(undefined);
                  }}
                  onClose={() => setOpenRole(undefined)}
                />
              ) : null}
            </span>
          );
        })}
        <button
          type="button"
          data-testid={`builtin-add-${info.id}`}
          disabled={busy}
          onClick={add}
          title="Enable this playbook — it is written to the shared config"
          className="ml-auto rounded-md border border-brand-300 px-2.5 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-40 dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-950"
        >
          {busy ? "Enabling…" : "Enable"}
        </button>
      </div>
      {error ? (
        <div className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      ) : null}
      {showSource && info.source ? (
        <div className="relative max-h-96 overflow-auto rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950">
          <Markdown text={info.source} />
        </div>
      ) : null}
    </div>
  );
}

const EXAMPLE_STAGES = [
  { key: "source", label: "Source", hint: "The raw prose the demo starts from" },
  {
    key: "normalized",
    // The row is card chrome, so the label holds the 14-character
    // budget and the full truth lives in the title (DR-041).
    label: "Normalized",
    hint: "Normalized text: slc's normalize phase turns the prose into workflow markdown",
  },
  {
    key: "gears",
    label: "Gears",
    hint: "One normative spec item per state behavior — the compiler's middle stage",
  },
  {
    key: "fsm",
    label: "State machine",
    hint: "The compiled XState machine that drives the players",
  },
] as const;
type ExampleStageKey = (typeof EXAMPLE_STAGES)[number]["key"];

/** Read-only slc demo card (PBLIB-35, DR-015): the same stage row as
 * a configured playbook wears, over four in-memory stages, with a
 * prefill that opens a draft workspace in paste mode. */
function ExampleCard({
  onPrefill,
  error,
}: {
  onPrefill: () => Promise<void>;
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
        <span className="min-w-0 truncate text-sm font-semibold">
          Example: {SLC_DEMO.title}
        </span>
        <span className="min-w-0 truncate text-xs text-neutral-500">
          from {SLC_DEMO.credit}
        </span>
        <span className="ml-auto" />
        <button
          type="button"
          data-testid="example-prefill"
          disabled={busy}
          title={`Opens a draft named ${SLC_DEMO.playbookId} with the normalized text ready to paste — nothing is written or compiled`}
          onClick={() => {
            setBusy(true);
            void onPrefill().finally(() => setBusy(false));
          }}
          className="rounded-md border border-brand-300 px-2 py-0.5 text-xs text-brand-600 hover:bg-brand-50 disabled:opacity-40 dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-950"
        >
          {busy ? "Opening…" : "Prefill"}
        </button>
      </div>
      {error ? (
        <div
          data-testid="example-error"
          className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
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

/** One draft's row (playbook-library-50): its id, state chip, the
 * age of its last activity, Open, and Delete behind the inline
 * confirm (playbook-library-63). A draft whose directory is gone, or
 * whose record the core cannot read, offers only Delete — the latter
 * with the core's diagnostic beneath (playbook-library-70). */
function DraftRow({
  draft,
  onOpen,
  onDelete,
}: {
  draft: DraftInfo;
  onOpen: () => void;
  onDelete: () => Promise<void>;
}) {
  const now = useClock(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const deleteRef = useRef<HTMLButtonElement>(null);
  const busyWith =
    draft.activity === "turn"
      ? "Delete waits: the draft's turn is running"
      : draft.activity === "compiling"
        ? "Delete waits: the draft's compile is running"
        : undefined;

  async function remove(): Promise<void> {
    setConfirming(false);
    // Refused while the draft works, naming which (DR-010 §4).
    if (busyWith) {
      setError(busyWith);
      deleteRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await onDelete();
    } catch (cause) {
      setError((cause as Error).message);
      setBusy(false);
      deleteRef.current?.focus();
    }
  }

  return (
    <div
      data-testid={`draft-row-${draft.id}`}
      className="flex flex-col gap-1 rounded-lg border border-neutral-200 bg-white px-4 py-2 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold">{draft.id}</span>
        <DraftStateChip draft={draft} />
        {draft.firstLine ? (
          <span className="min-w-0 flex-1 truncate text-xs text-neutral-500" title={draft.firstLine}>
            {draft.firstLine}
          </span>
        ) : null}
        <span
          data-testid={`draft-age-${draft.id}`}
          title={absoluteTitle(draft.touchedAt)}
          className="ml-auto shrink-0 text-xs text-neutral-500"
        >
          {relativeAge(draft.touchedAt, now)}
        </span>
        {!draft.sourceMissing && !draft.diagnostic ? (
          <button
            type="button"
            data-testid={`draft-open-${draft.id}`}
            onClick={onOpen}
            className="rounded-md border border-brand-300 px-2.5 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-950"
          >
            Open
          </button>
        ) : null}
        {confirming ? (
          <InlineConfirm
            question="Delete this draft and its source?"
            confirmLabel="Delete"
            cancelLabel="Keep"
            onConfirm={() => void remove()}
            onCancel={() => {
              setConfirming(false);
              deleteRef.current?.focus();
            }}
          />
        ) : (
          <button
            ref={deleteRef}
            type="button"
            data-testid={`draft-delete-${draft.id}`}
            disabled={busy}
            aria-label={`Delete draft ${draft.id}`}
            title="Remove the draft, its conversation, and its source"
            onClick={() => setConfirming(true)}
            className="rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-red-600 disabled:opacity-40 dark:hover:bg-neutral-800"
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        )}
      </div>
      {draft.diagnostic ? (
        <div
          data-testid={`draft-row-diagnostic-${draft.id}`}
          className="text-xs text-red-600 [overflow-wrap:anywhere] dark:text-red-400"
        >
          {draft.diagnostic} — delete the draft, or repair the file and restart Spex
        </div>
      ) : null}
      {error ? (
        <div
          role="alert"
          data-testid={`draft-row-error-${draft.id}`}
          className="text-xs text-red-600 dark:text-red-400"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}

/** The New playbook field (playbook-library-51): one thing, the id,
 * checked in place against the rule and the names already taken;
 * Enter creates the draft and opens its workspace. */
function NewPlaybookField({
  takenPlaybooks,
  takenBuiltins,
  drafts,
  onCreate,
  onOpenExisting,
  autoFocus,
  onAutoFocused,
}: {
  /** Configured playbook ids. */
  takenPlaybooks: ReadonlySet<string>;
  /** Built-in ids the catalog offers. */
  takenBuiltins: ReadonlySet<string>;
  drafts: Record<string, DraftInfo>;
  onCreate: (id: string) => Promise<unknown>;
  onOpenExisting: (id: string) => void;
  /** The Captain home's slash menu asked for this field. */
  autoFocus: boolean;
  /** The request was honored: focus lands here once, not on every return. */
  onAutoFocused: () => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoFocus) return;
    rootRef.current?.scrollIntoView?.({ block: "center" });
    inputRef.current?.focus();
    onAutoFocused();
  }, [autoFocus, onAutoFocused]);

  async function submit(): Promise<void> {
    const id = value.trim();
    if (!id || busy) return;
    if (!DRAFT_ID_RULE.test(id)) {
      setError(DRAFT_ID_RULE_TEXT);
      return;
    }
    if (takenPlaybooks.has(id)) {
      setError(`/${id} is already a configured playbook`);
      return;
    }
    if (takenBuiltins.has(id)) {
      setError(`${id} is a built-in — enable it below instead`);
      return;
    }
    if (drafts[id]) {
      // An id naming an existing draft opens that draft.
      setError(undefined);
      onOpenExisting(id);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await onCreate(id);
      setValue("");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <div
      ref={rootRef}
      data-testid="new-playbook"
      className="flex flex-col gap-1 rounded-lg border border-dashed border-neutral-300 bg-white px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900"
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5 text-sm">
          <span className="text-xs text-neutral-500">Playbook id</span>
          <input
            ref={inputRef}
            data-testid="new-playbook-id"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError(undefined);
            }}
            onKeyDown={onKeyDown}
            placeholder="e.g. triage"
            spellCheck={false}
            aria-invalid={error !== undefined}
            aria-describedby="new-playbook-caption"
            className="rounded border border-neutral-300 bg-white px-2 py-1 font-mono dark:border-neutral-700 dark:bg-neutral-950"
          />
        </label>
        <button
          type="button"
          data-testid="new-playbook-button"
          disabled={busy || value.trim().length === 0}
          onClick={() => void submit()}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-40"
        >
          {busy ? "Opening…" : "New playbook"}
        </button>
      </div>
      <span id="new-playbook-caption" className="text-xs text-neutral-500">
        {DRAFT_ID_CAPTION}
      </span>
      {error ? (
        <span
          role="alert"
          data-testid="new-playbook-error"
          className="text-xs text-red-600 dark:text-red-400"
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}

/** What the live region says as drafts move (playbook-library-57/58/60). */
function announcementFor(previous: DraftInfo | undefined, next: DraftInfo): string | undefined {
  if (previous?.state === next.state) return undefined;
  switch (next.state) {
    case "compiling":
      return `Compiling ${next.id}`;
    case "failed":
      return `Compile failed at ${next.compile?.phase ? phaseLabel(next.compile.phase) : "an unknown phase"}`;
    case "compiled":
      return `Compiled ${next.id}`;
    default:
      return undefined;
  }
}

export function LibrarySurface({
  onNavigate,
}: {
  onNavigate?: (surface: "Settings") => void;
}) {
  const configState = useAppStore((state) => state.configState);
  const readiness = useAppStore((state) => state.readiness);
  const connection = useAppStore((state) => state.connection);
  const builtins = useAppStore((state) => state.builtins);
  const loadBuiltins = useAppStore((state) => state.loadBuiltins);
  const drafts = useAppStore((state) => state.drafts);
  const draftsLoaded = useAppStore((state) => state.draftsLoaded);
  const openDraftId = useAppStore((state) => state.openDraftId);
  const listDrafts = useAppStore((state) => state.listDrafts);
  const createDraft = useAppStore((state) => state.createDraft);
  const openDraft = useAppStore((state) => state.openDraft);
  const closeDraft = useAppStore((state) => state.closeDraft);
  const deleteDraft = useAppStore((state) => state.deleteDraft);
  const setDraftSourceMode = useAppStore((state) => state.setDraftSourceMode);
  const consumeNewPlaybookRequest = useAppStore((state) => state.consumeNewPlaybookRequest);
  const consumeRevealPlaybook = useAppStore((state) => state.consumeRevealPlaybook);
  const newPlaybookRequested = useAppStore((state) => state.newPlaybookRequested);
  const revealPlaybook = useAppStore((state) => state.revealPlaybook);

  const [error, setError] = useState<string>();
  const [exampleError, setExampleError] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState<string>();
  const [rolePopover, setRolePopover] = useState<{
    playbookId: string;
    role: string;
  }>();
  const [focusNew, setFocusNew] = useState(false);
  const [revealed, setRevealed] = useState<string>();
  const [liveNote, setLiveNote] = useState("");
  const previousDrafts = useRef<Record<string, DraftInfo>>({});
  const playerGearRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (connection === "open") {
      // Surface activation refreshes the catalog (DR-015) and the
      // drafts (playbook-library-50); config edits refresh the catalog
      // again via the config.state broadcast.
      void loadBuiltins().catch(() => {});
      void listDrafts().catch(() => {});
    }
  }, [connection, loadBuiltins, listDrafts]);

  // The slash menu's request lands on the id field (playbook-library-51).
  useEffect(() => {
    if (newPlaybookRequested && consumeNewPlaybookRequest()) setFocusNew(true);
  }, [newPlaybookRequested, consumeNewPlaybookRequest]);

  // A registration brings its card into view (playbook-library-61).
  useEffect(() => {
    if (revealPlaybook === undefined) return;
    const id = consumeRevealPlaybook();
    if (!id) return;
    setRevealed(id);
    setLiveNote(`Registered /${configState?.status === "valid" ? (configState.summary.playbooks.find((entry) => entry.id === id)?.command ?? id) : id}`);
    document.getElementById(`playbook-card-${id}`)?.scrollIntoView?.({ block: "center" });
  }, [revealPlaybook, consumeRevealPlaybook, configState]);
  useEffect(() => {
    if (revealed === undefined) return;
    const timer = setTimeout(() => setRevealed(undefined), 2400);
    return () => clearTimeout(timer);
  }, [revealed]);

  // The live region narrates the drafts' transitions (DR-010 §7).
  useEffect(() => {
    let note: string | undefined;
    for (const draft of Object.values(drafts)) {
      note = announcementFor(previousDrafts.current[draft.id], draft) ?? note;
    }
    previousDrafts.current = drafts;
    if (note) setLiveNote(note);
  }, [drafts]);

  const prefillFromExample = useCallback(async (): Promise<void> => {
    // The example opens a draft in paste mode with the normalized
    // text — never the raw prose, since the pipeline skips slc's
    // normalize phase — and writes nothing (playbook-library-35).
    setExampleError(undefined);
    const id = SLC_DEMO.playbookId;
    setDraftSourceMode(id, {
      mode: "paste",
      pasteText: SLC_DEMO.stages.normalized,
      pastePath: "",
    });
    try {
      if (useAppStore.getState().drafts[id]) await openDraft(id);
      else await createDraft(id);
    } catch (cause) {
      setExampleError((cause as Error).message);
    }
  }, [createDraft, openDraft, setDraftSourceMode]);

  const liveRegion = (
    <div aria-live="polite" role="status" className="sr-only" data-testid="library-live">
      {liveNote}
    </div>
  );

  if (!configState || configState.status !== "valid") {
    return (
      <div className="relative m-auto max-h-full max-w-md overflow-y-auto p-6 text-center text-sm text-neutral-500">
        <p>The Captain can only run playbooks listed here.</p>
        <p className="mt-1">
          Playbooks need a valid config — fix it in{" "}
          {onNavigate ? (
            <button
              type="button"
              onClick={() => onNavigate("Settings")}
              className="text-brand-600 hover:underline dark:text-brand-300"
            >
              Settings
            </button>
          ) : (
            <span className="font-medium">Settings</span>
          )}
          .
        </p>
      </div>
    );
  }
  const summary = configState.summary;

  // A draft's workspace replaces the list (playbook-library-52); the
  // draft stays open in the core while the list is shown.
  if (openDraftId && drafts[openDraftId]) {
    return (
      <>
        {liveRegion}
        <AuthoringWorkspace draftId={openDraftId} onBack={closeDraft} />
      </>
    );
  }

  const readinessByAdapter = new Map<string, ReadinessEntry>(
    readiness.map((entry) => [entry.adapter as string, entry]),
  );

  function edit(op: ConfigEditOpInput) {
    setError(undefined);
    getClient()
      .command("config.edit", { op })
      .catch((cause: Error) => setError(cause.message));
  }

  // dev delivers issues through branch and pr (DR-059); a config that
  // enables dev without them can still run a plain /dev, so the card
  // carries a hint, never an invalid mark (playbook-library-48).
  const configuredIds = new Set(summary.playbooks.map((playbook) => playbook.id));
  const missingDelivery = ["branch", "pr"].filter((id) => !configuredIds.has(id));
  const availableBuiltins = (builtins ?? []).filter(
    (entry) => !entry.configured,
  );
  const builtinIds = new Set((builtins ?? []).map((entry) => entry.id));
  const draftList = Object.values(drafts).sort((a, b) => b.touchedAt - a.touchedAt);
  const newPlaybook = (
    <NewPlaybookField
      takenPlaybooks={configuredIds}
      takenBuiltins={builtinIds}
      drafts={drafts}
      onCreate={createDraft}
      onOpenExisting={(id) => void openDraft(id)}
      autoFocus={focusNew}
      onAutoFocused={() => setFocusNew(false)}
    />
  );

  return (
    // The surface root is the box Playbooks scrolls in (DR-041 §9):
    // height-constrained, and the containing block for its own
    // positioned content, so the page itself never scrolls.
    <div className="relative mx-auto flex w-full min-h-0 max-w-3xl flex-1 flex-col gap-5 overflow-y-auto p-6">
      {liveRegion}
      <h1 className="text-lg font-semibold">Playbooks</h1>
      {error ? (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-neutral-500">
          Configured playbooks
        </h2>
        {summary.playbooks.map((playbook) => (
          <div
            key={playbook.id}
            id={`playbook-card-${playbook.id}`}
            data-testid={`playbook-card-${playbook.id}`}
            className={`flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900 ${
              revealed === playbook.id ? "ring-2 ring-brand-400 dark:ring-brand-500" : ""
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold">
                /{playbook.command}
              </span>
              <span
                className="truncate text-xs text-neutral-500"
                title={playbook.intent}
              >
                {playbook.intent}
              </span>
              <span className="ml-auto" />
              {confirmDelete === playbook.id ? (
                <InlineConfirm
                  question="Remove this playbook from the config?"
                  confirmLabel="Remove"
                  cancelLabel="Keep"
                  onConfirm={() => {
                    setConfirmDelete(undefined);
                    edit({ kind: "playbook.delete", playbookId: playbook.id });
                  }}
                  onCancel={() => setConfirmDelete(undefined)}
                />
              ) : (
                <button
                  type="button"
                  title="Remove from the config (compiled artifacts stay in the library)"
                  aria-label={`Remove /${playbook.command} from the config`}
                  onClick={() => setConfirmDelete(playbook.id)}
                  className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-red-500 dark:hover:bg-neutral-800"
                >
                  <Icon name="close" />
                </button>
              )}
            </div>
            {revealed === playbook.id ? (
              <p data-testid="registered-note" className="text-xs text-neutral-500">
                Registered. Sessions started before this registration must be
                restarted to use it.
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-600 dark:text-neutral-400">
              {Object.entries(playbook.roles).map(([role, binding]) => {
                const lane = summary.players.find(
                  (player) => player.id === binding.playerId,
                );
                // A lane bound by more than one playbook is a shared
                // conversation, and the binding says so (DR-032).
                const sharedWith = (lane?.boundBy ?? []).filter(
                  (position) => !position.startsWith(`${playbook.id}.`),
                );
                return (
                  <span
                    key={role}
                    // The binding wraps within itself in a narrow pane
                    // (DR-041): the chip and its control drop under
                    // the role rather than squeezing to nothing.
                    className="relative flex min-w-0 max-w-full flex-wrap items-center gap-1"
                  >
                    <span className="font-mono">{role}:</span>
                    <span
                      data-testid={`role-binding-${playbook.id}-${role}`}
                      className="font-mono text-neutral-700 dark:text-neutral-200"
                    >
                      {binding.playerId}
                    </span>
                    {lane ? (
                      <AgentChip
                        // The row says what the role effectively runs:
                        // a binding's own fast mode over the lane's.
                        agent={
                          binding.fastMode !== undefined
                            ? { ...lane.agent, fastMode: binding.fastMode }
                            : lane.agent
                        }
                        readiness={readinessByAdapter.get(lane.agent.adapter)}
                        label={binding.playerId}
                      />
                    ) : null}
                    {sharedWith.length > 0 ? (
                      <span
                        data-testid={`role-shared-${playbook.id}-${role}`}
                        title={`This lane also answers ${sharedWith.join(", ")} — one conversation across them`}
                        className="rounded-full bg-brand-50 px-1.5 py-0.5 text-xs text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                      >
                        shared
                      </span>
                    ) : null}
                    <button
                      type="button"
                      ref={
                        rolePopover?.playbookId === playbook.id &&
                        rolePopover.role === role
                          ? playerGearRef
                          : undefined
                      }
                      data-testid={`role-bind-${playbook.id}-${role}`}
                      title={`Choose which session player answers ${role}`}
                      aria-label={`Bind ${role}`}
                      onClick={() =>
                        setRolePopover((current) =>
                          current?.playbookId === playbook.id &&
                          current.role === role
                            ? undefined
                            : { playbookId: playbook.id, role },
                        )
                      }
                      className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                    >
                      <Icon name="edit" />
                    </button>
                    {rolePopover?.playbookId === playbook.id &&
                    rolePopover.role === role ? (
                      <BindingEditorPopover
                        role={role}
                        position={`${playbook.id}.${role}`}
                        binding={binding}
                        players={summary.players}
                        anchorRef={playerGearRef}
                        onSave={(next) =>
                          bindRole(playbook.id, role, next).then((result) => {
                            setRolePopover(undefined);
                            return result;
                          })
                        }
                        onClose={() => setRolePopover(undefined)}
                      />
                    ) : null}
                  </span>
                );
              })}
              <span
                className="ml-auto flex min-w-0 items-center gap-1 text-xs text-neutral-500"
                title={`Source this playbook was loaded from: ${playbook.from}`}
              >
                <span>from</span>
                <span className="max-w-[16rem] truncate font-mono">
                  {playbook.from}
                </span>
              </span>
            </div>
            {playbook.id === "dev" && missingDelivery.length > 0 ? (
              <p
                data-testid="dev-delivery-hint"
                className="text-xs text-amber-700 dark:text-amber-300"
              >
                Pull-request delivery is unavailable until{" "}
                {missingDelivery.map((id) => `/${id}`).join(" and ")}{" "}
                {missingDelivery.length === 1 ? "is" : "are"} enabled below; a
                plain /dev request still runs.
              </p>
            ) : null}
            <PlaybookPipeline playbookId={playbook.id} />
          </div>
        ))}
        {summary.playbooks.length === 0 ? (
          <div
            data-testid="playbooks-empty"
            className="rounded-lg border border-dashed border-neutral-300 px-4 py-5 text-center text-sm text-neutral-500 dark:border-neutral-700"
          >
            No playbooks enabled yet — enable a built-in below, or make your
            own with New playbook.
          </div>
        ) : null}
      </section>

      {draftList.length > 0 ? (
        // Drafts stand between the configured playbooks and the
        // built-ins, the way to a new one at the section's foot
        // (playbook-library-50/51).
        <section data-testid="drafts-section" className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-neutral-500">Drafts</h2>
          {draftList.map((draft) => (
            <DraftRow
              key={draft.id}
              draft={draft}
              onOpen={() => void openDraft(draft.id)}
              onDelete={() => deleteDraft(draft.id)}
            />
          ))}
          {newPlaybook}
        </section>
      ) : null}

      {availableBuiltins.length > 0 ? (
        <section
          data-testid="builtins-section"
          className="flex flex-col gap-2"
        >
          <h2 className="text-sm font-semibold text-neutral-500">
            Available built-ins
          </h2>
          {availableBuiltins.map((entry) => (
            <BuiltinCard
              key={entry.id}
              info={entry}
              captain={summary.captain}
              readiness={readiness}
              summaryPlayers={summary.players}
            />
          ))}
        </section>
      ) : null}

      {draftList.length === 0 && draftsLoaded ? (
        // With no draft the section is absent, and the way to a new
        // playbook stands below the built-ins (playbook-library-50).
        <section data-testid="new-playbook-section" className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-neutral-500">New playbook</h2>
          {newPlaybook}
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-neutral-500">Example</h2>
        <ExampleCard onPrefill={prefillFromExample} error={exampleError} />
      </section>
    </div>
  );
}
