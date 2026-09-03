// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Library surface (PBLIB): configured playbooks with per-role inline
// agents (DR-019) and the pipeline stage row (Source → Gears →
// State machine), plus the compile flow driving slc through the
// core with streamed, persistent progress.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AgentBlockInput,
  AgentSummary,
  BuiltinPlaybookInfo,
  CommandResults,
  ConfigEditOpInput,
  PlaybookArtifacts,
  ReadinessEntry,
  SessionPlayerSummary,
  SpecFileInfo,
} from "@sublang/spex-core/protocol";

import { getClient, useAppStore } from "../state/store.js";
import { SLC_DEMO } from "../examples/slc-demo.js";
import { bindRole, type AgentPatch } from "../lib/config-ops.js";
import { BindingEditorPopover } from "./BindingEditor.js";
import { Icon } from "./Icon.js";
import { InlineConfirm } from "./InlineConfirm.js";
import { Markdown } from "./Markdown.js";
import { ResizableFrame } from "./ResizableFrame.js";
import { AgentChip } from "./AgentChip.js";
import { AgentEditorPopover } from "./AgentEditor.js";
import { CitationPreview, useCitationPreview } from "./CitationPreview.js";
import { GROUP_CHIP, itemDomId, SpecItemRows } from "./SpecItemRows.js";
import { buildItemIndex } from "../lib/spec-view-model.js";

type Toolchain = CommandResults["compile.check"];

/** Fixed neutral default for a new role assignment (DR-019); the
 * "Same as Captain" action in the editor copies the Captain's
 * adapter, model, effort, and permissions instead. */
export const NEUTRAL_BLOCK: AgentBlockInput = {
  adapter: "claude",
  model: "claude-opus-5",
  effort: "high",
  permissions: { mode: "auto" },
};

/** Apply an editor patch to a local (not yet registered) block with
 * the same semantics the core uses: provided keys change, absent
 * keys survive, an explicit null unsets, permissions replace
 * wholesale. */
function applyLocalPatch(
  base: AgentBlockInput,
  patch: AgentPatch,
): AgentBlockInput {
  const next: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return next as AgentBlockInput;
}

const STAGES = [
  { key: "source", label: "Source", hint: "The workflow markdown the playbook was compiled from" },
  { key: "gears", label: "Gears", hint: "One normative spec item per state behavior — the compiler's middle stage" },
  { key: "fsm", label: "State machine", hint: "The compiled XState machine that drives the players" },
] as const;
type StageKey = (typeof STAGES)[number]["key"];

/** The pipeline as a row (PBLIB-22): a card wears its stages joined
 * by arrows, each stage a toggle opening its artifact beneath. The
 * row is a control row on a card, so labels hold the 14-character
 * budget (DR-041) and every stage keeps a 24px target (DR-010 §7). */
function StageRow<Key extends string>({
  stages,
  open,
  absent,
  onPress,
  testId,
}: {
  stages: readonly { key: Key; label: string; hint: string }[];
  /** The stage standing open, if any — one at a time per card. */
  open?: Key;
  /** Stages the load reported missing; empty until it lands. */
  absent?: readonly string[];
  onPress: (key: Key) => void;
  testId: string;
}) {
  return (
    // The row is flush with the card's content: the first label's
    // own padding is pulled back, and each arrow travels with the
    // stage before it so a wrapped line starts on a label.
    <div className="-ml-2 flex flex-wrap items-center gap-1" data-testid={testId}>
      {stages.map((entry, index) => {
        const missing = absent?.includes(entry.key) ?? false;
        return (
          <span key={entry.key} className="flex items-center gap-1">
            <button
              type="button"
              aria-pressed={open === entry.key}
              disabled={missing}
              title={
                missing
                  ? `${entry.label} not found next to this playbook's registry`
                  : entry.hint
              }
              onClick={() => onPress(entry.key)}
              className={`inline-flex min-h-6 items-center rounded-md px-2 text-xs ${
                open === entry.key
                  ? "bg-brand-100 font-medium text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                  : missing
                    ? "text-neutral-400 line-through dark:text-neutral-500"
                    : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              {entry.label}
            </button>
            {index < stages.length - 1 ? (
              <span
                aria-hidden="true"
                className="text-neutral-400 dark:text-neutral-500"
              >
                →
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

/** The open stage's box, in rem steps (playbook-library-22): 24rem
 * standing, 8rem to 48rem once the reader has pulled its bottom edge,
 * one height serving a card's stages (DR-030). */
const STAGE_UNIT = 16;
const STAGE_DEFAULT = 24;
const STAGE_MIN = 8;
const STAGE_MAX = 48;

/** The open stage's artifact, in the capped frame beneath the row —
 * with what the stage pins standing above the frame, so it holds its
 * place at every scroll position and every height the reader sets. */
function StageBox({
  id,
  stage,
  header,
  children,
}: {
  id: string;
  /** The open stage's label, so the grip names what it resizes. */
  stage: string;
  /** The stage's pinned header, outside the scrolling frame. */
  header?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {header}
      <ResizableFrame
        frameId={`stage:${id}`}
        label={`Resize the ${stage} stage`}
        unit={STAGE_UNIT}
        defaultSteps={STAGE_DEFAULT}
        minSteps={STAGE_MIN}
        maxSteps={STAGE_MAX}
        data-testid={`stage-box-${id}`}
        className="overflow-x-auto rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950"
      >
        {children}
      </ResizableFrame>
    </div>
  );
}

/** The State machine stage's derived state list (PBLIB-22), pinned
 * above the frame: the chips wrap rather than overflow (DR-041 §9), so
 * the states stay in view at any scroll position and any height. */
function StateList({ id, states }: { id: string; states: string[] }) {
  return (
    <div
      data-testid={`stage-states-${id}`}
      className="flex flex-wrap items-center gap-1"
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        states
      </span>
      {states.map((state) => (
        <span
          key={state}
          className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
        >
          {state}
        </span>
      ))}
    </div>
  );
}

/** The Gears stage as the outline's own item rows (PBLIB-22): the
 * artifact is a GEARS package file, so the card draws the parse the
 * core serves — rows collapsed, each expanding to its body, a citation
 * of a sibling landing on it inside the box — never a wall of
 * markdown. Read-only: no filters, no edit, no tree beyond this file. */
function GearsItems({ id, file }: { id: string; file: SpecFileInfo }) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [pendingJump, setPendingJump] = useState<string>();
  const [flashId, setFlashId] = useState<string>();
  const [notFoundKey, setNotFoundKey] = useState<string>();
  // One artifact, one index: a citation resolves within this file or
  // it resolves nowhere — the card holds no spec tree.
  const itemIndex = useMemo(() => buildItemIndex([file]), [file]);
  const prefix = `gears-${id}`;
  // The same card the outline's entries raise (spec-view-61), laid in
  // this list's own box so the stage frame contains it.
  const boxRef = useRef<HTMLDivElement | null>(null);
  const preview = useCitationPreview(useCallback(() => boxRef.current, []));
  const previewed = preview.open
    ? itemIndex.get(preview.open.target)
    : undefined;

  // The landing waits for the expansion to commit, then scrolls the
  // row into the box, takes focus (DR-010 §6), and flashes it.
  useEffect(() => {
    if (!pendingJump) return;
    const element = document.getElementById(itemDomId(pendingJump, prefix));
    if (element && typeof element.scrollIntoView === "function") {
      element.scrollIntoView({ block: "center" });
    }
    element?.focus({ preventScroll: true });
    setFlashId(pendingJump);
    setPendingJump(undefined);
  }, [pendingJump, prefix]);

  useEffect(() => {
    if (!flashId) return;
    const timer = setTimeout(() => setFlashId(undefined), 1200);
    return () => clearTimeout(timer);
  }, [flashId]);

  return (
    <div ref={boxRef} className="relative">
      <SpecItemRows
        items={file.items}
        idPrefix={prefix}
        itemIndex={itemIndex}
        expandedItems={expanded}
        flashId={flashId}
        notFoundKey={notFoundKey}
        preview={preview}
        onToggleItem={(itemId) =>
          setExpanded((current) => {
            const next = new Set(current);
            if (!next.delete(itemId)) next.add(itemId);
            return next;
          })
        }
        onJump={(linkKey, targetId) => {
          preview.close();
          if (!itemIndex.has(targetId)) {
            setNotFoundKey(linkKey);
            return;
          }
          setNotFoundKey(undefined);
          setExpanded((current) => new Set(current).add(targetId));
          setPendingJump(targetId);
        }}
      />
      {preview.open ? (
        <CitationPreview
          open={preview.open}
          item={previewed?.item}
          chipClass={previewed ? GROUP_CHIP[previewed.group] : undefined}
        />
      ) : null}
    </div>
  );
}

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
 * compile-form prefill. */
function ExampleCard({ onPrefill }: { onPrefill: () => void }) {
  const [stage, setStage] = useState<ExampleStageKey>();
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
          onClick={onPrefill}
          className="rounded-md border border-brand-300 px-2 py-0.5 text-xs text-brand-600 hover:bg-brand-50 dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-950"
        >
          Prefill form
        </button>
      </div>
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

export function LibrarySurface({
  onNavigate,
}: {
  onNavigate?: (surface: "Settings") => void;
}) {
  const configState = useAppStore((state) => state.configState);
  const compileProgress = useAppStore((state) => state.compileProgress);
  const readiness = useAppStore((state) => state.readiness);
  const activeCompile = useAppStore((state) => state.activeCompile);
  const runCompile = useAppStore((state) => state.runCompile);
  const abortCompile = useAppStore((state) => state.abortCompile);
  const connection = useAppStore((state) => state.connection);
  const builtins = useAppStore((state) => state.builtins);
  const loadBuiltins = useAppStore((state) => state.loadBuiltins);

  const [toolchain, setToolchain] = useState<Toolchain>();
  const [error, setError] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState<string>();
  const [rolePopover, setRolePopover] = useState<{
    playbookId: string;
    role: string;
  }>();

  // Compile form state.
  const [playbookId, setPlaybookId] = useState("");
  const [command, setCommand] = useState("");
  const [intent, setIntent] = useState("");
  const [rolesText, setRolesText] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [sourcePath, setSourcePath] = useState("");
  const [playerBlocks, setPlayerBlocks] = useState<
    Record<string, AgentBlockInput>
  >({});
  const [compileRolePopover, setCompileRolePopover] = useState<string>();
  const compileFormRef = useRef<HTMLElement>(null);
  const playerGearRef = useRef<HTMLButtonElement>(null);
  const compileGearRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (connection === "open") {
      getClient().command("compile.check", {}).then(setToolchain).catch(() => {});
      // Surface activation refreshes the catalog (DR-015); config
      // edits refresh it again via the config.state broadcast.
      void loadBuiltins().catch(() => {});
    }
  }, [connection, loadBuiltins]);

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
  const readinessByAdapter = new Map<string, ReadinessEntry>(
    readiness.map((entry) => [entry.adapter as string, entry]),
  );
  const roles = rolesText
    .split(",")
    .map((role) => role.trim())
    .filter(Boolean);

  function edit(op: ConfigEditOpInput) {
    setError(undefined);
    getClient()
      .command("config.edit", { op })
      .catch((cause: Error) => setError(cause.message));
  }

  const compiling = activeCompile?.running === true;
  const missingRequirement = !playbookId.trim()
    ? "give the playbook an id"
    : !intent.trim()
      ? "describe the intent — the Captain routes free text with it"
      : roles.length === 0
        ? "declare at least one player role"
        : !sourceText.trim() && !sourcePath.trim()
          ? "provide the workflow source (text or file path)"
          : toolchain && !toolchain.node.ok
            ? "install Node >= 23.6 for the compile toolchain"
            : undefined;

  function startCompile() {
    setError(undefined);
    runCompile({
      playbookId: playbookId.trim(),
      ...(sourcePath.trim()
        ? { sourcePath: sourcePath.trim() }
        : { sourceText }),
      roles,
      command: command.trim() || playbookId.trim(),
      intent: intent.trim(),
      // Each derived role binds to a proposed lane; the lane blocks
      // the form collected are what mints them (DR-032).
      bindings: Object.fromEntries(roles.map((role) => [role, `dev.${role}`])),
      newPlayers: Object.fromEntries(
        roles.map((role) => [`dev.${role}`, playerBlocks[role] ?? NEUTRAL_BLOCK]),
      ),
    })
      .then(() => {
        setPlaybookId("");
        setSourceText("");
        setSourcePath("");
        setRolesText("");
        setIntent("");
        setCommand("");
      })
      .catch(() => {
        // The progress log carries the failure line.
      });
  }

  /** Prefill the compile form from the slc demo (DR-015): the
   * normalized text, never the raw prose — the compile pipeline
   * skips slc's normalize phase. */
  function prefillFromExample(): void {
    setPlaybookId(SLC_DEMO.playbookId);
    setCommand(SLC_DEMO.command);
    setIntent(SLC_DEMO.intent);
    setRolesText(SLC_DEMO.roles);
    setSourceText(SLC_DEMO.stages.normalized);
    setSourcePath("");
    // Seed the demo roles with the fixed neutral block (DR-019) so
    // the chips show a deliberate choice, not an implicit fallback.
    setPlayerBlocks((current) => {
      const next = { ...current };
      for (const role of SLC_DEMO.roles.split(",")) {
        const id = role.trim();
        if (id && !next[id]) next[id] = NEUTRAL_BLOCK;
      }
      return next;
    });
    compileFormRef.current?.scrollIntoView?.({
      behavior: "smooth",
      block: "start",
    });
  }

  const availableBuiltins = (builtins ?? []).filter(
    (entry) => !entry.configured,
  );

  const progressId = activeCompile?.playbookId;
  const progressLines = progressId ? (compileProgress[progressId] ?? []) : [];

  return (
    // The surface root is the box Playbooks scrolls in (DR-041 §9):
    // height-constrained, and the containing block for its own
    // positioned content, so the page itself never scrolls.
    <div className="relative mx-auto flex w-full min-h-0 max-w-3xl flex-1 flex-col gap-5 overflow-y-auto p-6">
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
            className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900"
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
            <PlaybookPipeline playbookId={playbook.id} />
          </div>
        ))}
        {summary.playbooks.length === 0 ? (
          <div
            data-testid="playbooks-empty"
            className="rounded-lg border border-dashed border-neutral-300 px-4 py-5 text-center text-sm text-neutral-500 dark:border-neutral-700"
          >
            No playbooks enabled yet — enable a built-in below, or compile
            your own.
          </div>
        ) : null}
      </section>

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

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-neutral-500">Example</h2>
        <ExampleCard onPrefill={prefillFromExample} />
      </section>

      <section ref={compileFormRef} className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-neutral-500">
          Compile a new playbook
        </h2>
        {toolchain && (!toolchain.node.ok || toolchain.slc.guidance) ? (
          <div
            className={`rounded-lg border px-3 py-2 text-xs ${
              toolchain.node.ok
                ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                : "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
            }`}
          >
            {toolchain.node.guidance ?? toolchain.slc.guidance}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-neutral-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900">
          <label className="flex flex-col gap-0.5">
            <span className="text-xs text-neutral-500">Playbook id</span>
            <input
              data-testid="compile-playbook-id"
              value={playbookId}
              onChange={(event) => setPlaybookId(event.target.value)}
              placeholder="e.g. triage"
              className="rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-950"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-xs text-neutral-500">
              Slash command (default: id)
            </span>
            <input
              data-testid="compile-command"
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              placeholder="e.g. triage"
              className="rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-950"
            />
          </label>
          <label className="col-span-2 flex flex-col gap-0.5">
            <span className="text-xs text-neutral-500">
              Intent (one line; the Captain routes free text with it)
            </span>
            <input
              data-testid="compile-intent"
              value={intent}
              onChange={(event) => setIntent(event.target.value)}
              placeholder="e.g. triage new bug reports into labeled issues"
              className="rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-950"
            />
          </label>
          <label className="col-span-2 flex flex-col gap-0.5">
            <span className="text-xs text-neutral-500">
              Player roles (comma-separated local role ids)
            </span>
            <input
              data-testid="compile-roles"
              value={rolesText}
              onChange={(event) => setRolesText(event.target.value)}
              placeholder="e.g. triager, verifier"
              className="rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-950"
            />
          </label>
          {roles.length > 0 ? (
            <div className="col-span-2 flex flex-wrap gap-3 text-xs">
              {roles.map((role) => {
                const block = playerBlocks[role] ?? NEUTRAL_BLOCK;
                return (
                  <span
                    key={role}
                    className="relative flex items-center gap-1"
                  >
                    <span className="font-mono">{role}:</span>
                    <AgentChip
                      agent={block}
                      readiness={readinessByAdapter.get(block.adapter)}
                      label={role}
                    />
                    <button
                      type="button"
                      ref={
                        compileRolePopover === role ? compileGearRef : undefined
                      }
                      data-testid={`compile-player-${role}`}
                      title={`Choose the ${role} agent`}
                      aria-label={`Configure ${role}`}
                      onClick={() =>
                        setCompileRolePopover((current) =>
                          current === role ? undefined : role,
                        )
                      }
                      className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                    >
                      <Icon name="edit" />
                    </button>
                    {compileRolePopover === role ? (
                      <AgentEditorPopover
                        title={`${role} agent`}
                        direction="down"
                        initial={block}
                        readiness={readiness}
                        captain={summary.captain}
                        anchorRef={compileGearRef}
                        saveLabel="Use"
                        onSave={(patch) => {
                          setPlayerBlocks((current) => ({
                            ...current,
                            [role]: {
                              ...(current[role] ?? NEUTRAL_BLOCK),
                              ...patch,
                            } as AgentBlockInput,
                          }));
                          setCompileRolePopover(undefined);
                        }}
                        onClose={() => setCompileRolePopover(undefined)}
                      />
                    ) : null}
                  </span>
                );
              })}
            </div>
          ) : null}
          <label className="col-span-2 flex flex-col gap-0.5">
            <span className="text-xs text-neutral-500">
              Workflow source (or give a source file path below)
            </span>
            <textarea
              data-testid="compile-source-text"
              value={sourceText}
              onChange={(event) => setSourceText(event.target.value)}
              rows={6}
              placeholder="Describe the workflow — prose or a pasted skill…"
              className="rounded border border-neutral-300 bg-white px-2 py-1 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-950"
            />
          </label>
          <label className="col-span-2 flex flex-col gap-0.5">
            <span className="text-xs text-neutral-500">
              Source file path (optional, overrides the text)
            </span>
            <input
              data-testid="compile-source-path"
              value={sourcePath}
              onChange={(event) => setSourcePath(event.target.value)}
              placeholder="/path/to/workflow.md"
              className="rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-950"
            />
          </label>
          <div className="col-span-2 flex items-center gap-2">
            <button
              type="button"
              disabled={compiling || missingRequirement !== undefined}
              onClick={startCompile}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-40"
            >
              {compiling ? "Compiling…" : "Compile & register"}
            </button>
            <span className="text-xs text-neutral-500">
              {compiling
                ? "agent-driven, this takes a while — progress streams below"
                : (missingRequirement ??
                  "runs slc with your configured coding agent")}
            </span>
          </div>
          {compiling || progressLines.length > 0 ? (
            <div className="col-span-2 flex flex-col items-start gap-1.5">
              {progressLines.length > 0 ? (
                <pre
                  data-testid="compile-progress"
                  className="relative max-h-48 w-full overflow-y-auto rounded bg-neutral-100 p-2 font-mono text-xs text-neutral-600 dark:bg-neutral-950 dark:text-neutral-400"
                >
                  {progressLines.join("\n")}
                </pre>
              ) : null}
              {compiling ? (
                <button
                  type="button"
                  onClick={() => void abortCompile()}
                  className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
