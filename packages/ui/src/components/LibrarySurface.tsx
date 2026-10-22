// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Playbooks surface (playbook-library, DR-104): a view over the
// environments of the current project and your own group. A switch
// picks the side; each side shows that spex repository's environment —
// the spec packages it requests and what it got — above the playbooks
// it exports, each with its spec package and version, its roles bound
// to session players, and where it is enabled. Enabling writes that
// side's config with a player per role; a project's entry names
// players alone, your own group's may tune each role. On the
// project's side the authoring sessions follow the playbooks, then the
// ways to add a spec package; the example closes the surface. An
// authoring session opened here replaces the list with its workspace.

import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  playerIdSchema,
  type AgentBlockInput,
  type AgentSummary,
  type DraftInfo,
  type InvalidPlaybookEntry,
  type PlaybookArtifacts,
  type PlaybookAvailability,
  type ReadinessEntry,
  type RoleBindingSummary,
  type SessionPlayerSummary,
} from "@sublang/spex-core/protocol";

import {
  draftNeedsProject,
  type PlaybooksSide,
} from "../state/store.js";
import { usePlaceStore } from "../state/place-context.js";
import { SLC_DEMO } from "../examples/slc-demo.js";
import {
  NEUTRAL_BLOCK,
  applyLocalPatch,
  bindRole,
} from "../lib/config-ops.js";
import {
  draftIdCaption,
  draftIdRuleText,
  draftPackagePath,
  isDraftId,
  isPackageOrg,
  newPlayerId,
  packageOrgRuleText,
} from "../lib/drafts.js";
import {
  chosenProject,
  ownRepositoryKey,
  sourceKindWord,
} from "../lib/environments.js";
import { i18n } from "../i18n.js";
import { phaseLabel } from "../lib/compile-log.js";
import { playbookIntent } from "../lib/playbook-intent.js";
import { absoluteTitle, relativeAge } from "../lib/time.js";
import { useClock } from "../lib/useClock.js";
import { AuthoringWorkspace, DraftStateChip } from "./AuthoringWorkspace.js";
import { BindingEditorPopover } from "./BindingEditor.js";
import { AddSpecPackages, EnvironmentSection } from "./EnvironmentSection.js";
import { Icon } from "./Icon.js";
import { InlineConfirm } from "./InlineConfirm.js";
import { Markdown } from "./Markdown.js";
import { Rich } from "./Rich.js";
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

const SECONDARY =
  "min-h-6 rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800";
const PRIMARY =
  "min-h-6 rounded-md border border-brand-300 px-2.5 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-40 dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-950";
const ERROR =
  "rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 [overflow-wrap:anywhere] dark:border-red-900 dark:bg-red-950 dark:text-red-300";
const GEAR =
  "flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200";

/** A listed playbook's pipeline (playbook-library-22/23): the stage
 * row is permanent, and the artifacts arrive on the card's first open
 * — one request, held for every later open. */
function PlaybookPipeline({ playbookId, repository }: { playbookId: string; repository: string }) {
  const store = usePlaceStore();
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
    store.getClient()
      .command("playbook.artifacts", { playbookId, repository })
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
                {i18n._("missing stages: {stages}", { stages: missingLabels.join(", ") })}
              </div>
            ) : null}
            {error ? (
              <div className="text-xs text-red-500">{error}</div>
            ) : !artifacts ? (
              <div className="text-xs text-neutral-500">{i18n._({ id: "loading…", comment: "a request for this pane's content is in flight" })}</div>
            ) : content === null ? (
              <div className="text-xs text-neutral-500">
                {i18n._("this stage was not found for this playbook")}
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

/** Where a playbook is enabled, in one phrase (playbook-library-1). */
function enabledPhrase(enabled: readonly ("project" | "own")[]): string {
  const project = enabled.includes("project");
  const own = enabled.includes("own");
  if (project && own) return i18n._("Enabled in the project and your own group");
  if (project) return i18n._("Enabled in the project");
  if (own) return i18n._("Enabled in your own group");
  return i18n._({ id: "Not enabled", comment: "a listed playbook no config enables" });
}

/** The `from` label (playbook-library-29): the spec package and its
 * version, with the source's kind for a path or Git request. */
function FromLabel({ entry }: { entry: PlaybookAvailability }) {
  const kind = entry.source === "path" || entry.source === "git" ? sourceKindWord(entry.source) : undefined;
  return (
    <span
      data-testid={`playbook-from-${entry.id}`}
      title={entry.folder ?? `${entry.package} ${entry.version}`}
      className="ml-auto flex min-w-0 items-center gap-1 text-xs text-neutral-500"
    >
      {/* The prefix and the kind stand outside the truncation. */}
      <span className="shrink-0">{i18n._({ id: "from", comment: "label before the spec package a playbook comes from" })}</span>
      <span className="min-w-0 truncate font-mono">
        {entry.package} {entry.version}
      </span>
      {kind ? <span className="shrink-0">· {kind}</span> : null}
    </span>
  );
}

/** One role of a playbook enabled on this side: the player bound to
 * it, what that binding runs, whether the lane is shared, and the
 * binding editor (playbook-library-1, playbook-library-4,
 * playbook-library-38). */
function BoundRole({
  entry,
  role,
  binding,
  roster,
  readiness,
  side,
  repository,
}: {
  entry: PlaybookAvailability;
  role: string;
  binding: RoleBindingSummary | undefined;
  roster: SessionPlayerSummary[];
  readiness: ReadinessEntry[];
  side: PlaybooksSide;
  repository: string;
}) {
  const store = usePlaceStore();
  const [open, setOpen] = useState(false);
  const gearRef = useRef<HTMLButtonElement>(null);
  const lane = binding ? roster.find((player) => player.id === binding.playerId) : undefined;
  // A lane bound by more than one position is a shared conversation,
  // and the binding says so (DR-032).
  const sharedWith = (lane?.boundBy ?? []).filter(
    (position) => !position.startsWith(`${entry.id}.`),
  );
  const ready = lane ? readiness.find((item) => item.adapter === lane.agent.adapter) : undefined;
  return (
    <span
      // The binding wraps within itself in a narrow pane (DR-041): the
      // chip and its control drop under the role rather than squeezing
      // to nothing.
      className="relative flex min-w-0 max-w-full flex-wrap items-center gap-1"
    >
      <span className="font-mono">{role}:</span>
      <span
        data-testid={`role-binding-${entry.id}-${role}`}
        className="font-mono text-neutral-700 dark:text-neutral-200"
        title={binding?.display}
      >
        {binding?.playerId ?? i18n._({ id: "unbound", comment: "a required role no player answers yet" })}
      </span>
      {lane ? (
        <AgentChip
          // The row says what the role effectively runs: a binding's
          // own fast mode over the lane's.
          agent={binding?.fastMode !== undefined ? { ...lane.agent, fastMode: binding.fastMode } : lane.agent}
          readiness={ready}
          label={lane.id}
        />
      ) : null}
      {sharedWith.length > 0 ? (
        <span
          data-testid={`role-shared-${entry.id}-${role}`}
          title={i18n._("This lane also answers {positions} — one conversation across them", { positions: sharedWith.join(", ") })}
          className="rounded-full bg-brand-50 px-1.5 py-0.5 text-xs text-brand-700 dark:bg-brand-950 dark:text-brand-300"
        >
          {i18n._({ id: "shared", comment: "badge: this lane answers more than one role" })}
        </span>
      ) : null}
      <button
        type="button"
        ref={gearRef}
        data-testid={`role-bind-${entry.id}-${role}`}
        title={i18n._("Choose which session player answers {role}", { role })}
        aria-label={i18n._("Bind {role}", { role })}
        onClick={() => setOpen((current) => !current)}
        className={GEAR}
      >
        <Icon name="edit" />
      </button>
      {open ? (
        <BindingEditorPopover
          role={role}
          position={`${entry.id}.${role}`}
          binding={binding ?? { playerId: roster[0]?.id ?? "", display: "" }}
          players={roster}
          playerOnly={side === "project"}
          anchorRef={gearRef}
          onSave={(next) =>
            bindRole(entry.id, role, next, repository, store.getClient()).then((result) => {
              setOpen(false);
              return result;
            })
          }
          onClose={() => setOpen(false)}
        />
      ) : null}
    </span>
  );
}

/** One role of a playbook this side does not enable yet: the player
 * the enabling would name, `dev.<role>` by default and editable, and —
 * for a player your own roster lacks — the agent block it is written
 * with (playbook-library-34). */
function ProposedRole({
  entry,
  role,
  playerId,
  block,
  roster,
  readiness,
  captain,
  onPlayer,
  onBlock,
}: {
  entry: PlaybookAvailability;
  role: string;
  playerId: string;
  block: AgentBlockInput;
  roster: SessionPlayerSummary[];
  readiness: ReadinessEntry[];
  captain?: AgentSummary;
  onPlayer: (id: string) => void;
  onBlock: (block: AgentBlockInput) => void;
}) {
  const [open, setOpen] = useState(false);
  const gearRef = useRef<HTMLButtonElement>(null);
  const lane = roster.find((player) => player.id === playerId);
  const agent = lane?.agent ?? block;
  return (
    <span className="relative flex min-w-0 max-w-full flex-wrap items-center gap-1">
      <span className="font-mono">{role}:</span>
      <input
        data-testid={`enable-player-${entry.id}-${role}`}
        aria-label={i18n._("Player for {role}", { role })}
        value={playerId}
        list="playbooks-roster"
        spellCheck={false}
        onChange={(event) => onPlayer(event.target.value)}
        className="w-36 min-w-0 rounded border border-neutral-300 bg-white px-1.5 py-0.5 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-950"
      />
      <AgentChip
        agent={agent}
        readiness={readiness.find((item) => item.adapter === agent.adapter)}
        label={role}
      />
      {!lane ? (
        <>
          <button
            type="button"
            ref={gearRef}
            data-testid={`enable-configure-${entry.id}-${role}`}
            title={i18n._("Tweak the {name} agent in place", { name: playerId })}
            aria-label={i18n._("Configure {name}", { name: playerId })}
            onClick={() => setOpen((current) => !current)}
            className={GEAR}
          >
            <Icon name="edit" />
          </button>
          {open ? (
            <AgentEditorPopover
              title={i18n._("{name} agent", { name: playerId })}
              direction="down"
              initial={block}
              readiness={readiness}
              captain={captain}
              anchorRef={gearRef}
              onSave={(patch) => {
                onBlock(applyLocalPatch(block, patch));
                setOpen(false);
              }}
              onClose={() => setOpen(false)}
            />
          ) : null}
        </>
      ) : null}
    </span>
  );
}

/** "Commit ⟨folder⟩ with your code", the folder set as code wherever
 * the language places it (playbook-library-61, DR-069). */
function commitPhrase(folder: string): ReactNode {
  const slot = "\u0000";
  const phrase = i18n._({
    id: "Commit {folder} with your code",
    comment: "after enabling an authored playbook: {folder} is its spec package's folder in the working folder, e.g. spex-packages/triage",
    values: { folder: slot },
  });
  const [before = "", after = ""] = phrase.split(slot);
  return (
    <>
      {before}
      <code className="font-mono">{folder}</code>
      {after}
    </>
  );
}

/** One listed playbook (playbook-library-1): its command and intent,
 * where it is enabled, its spec package, its roles — bound where this
 * side enables it, proposed where it does not — Enable or Disable for
 * this side's config, its hints, and its stage row. */
function PlaybookRow({
  entry,
  side,
  repository,
  invalid,
  bindings,
  roster,
  readiness,
  captain,
  revealed,
  enabledFolder,
  hints,
  onChanged,
}: {
  entry: PlaybookAvailability;
  side: PlaybooksSide;
  /** The spex repository whose config this side writes. */
  repository: string;
  invalid?: string;
  bindings: Record<string, RoleBindingSummary> | undefined;
  roster: SessionPlayerSummary[];
  readiness: ReadinessEntry[];
  captain?: AgentSummary;
  /** An enabling just brought this card into view: it is highlighted. */
  revealed: boolean;
  /** An authoring session's enabling listed this card: its success line
   * stands, naming the spec package folder to commit with the code
   * (playbook-library-61). */
  enabledFolder?: string;
  hints: ReactNode;
  onChanged: () => void;
}) {
  const store = usePlaceStore();
  const enabledHere = entry.enabled.includes(side);
  const [players, setPlayers] = useState<Record<string, string>>({});
  const [blocks, setBlocks] = useState<Record<string, AgentBlockInput>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const command = entry.command ?? entry.id;
  // A built-in's intent in the reader's language (localization-4).
  const intent = playbookIntent(entry.intent);
  const laneFor = (role: string): string => (players[role] ?? newPlayerId(role)).trim();
  const badLane = entry.roles.find((role) => !playerIdSchema.safeParse(laneFor(role)).success);

  async function enable(): Promise<void> {
    if (badLane !== undefined) return;
    setBusy(true);
    setError(undefined);
    // A player the roster lacks is written to your own roster first,
    // carrying the block chosen for its role, so no binding is written
    // dangling (playbook-library-3); two roles naming one player write
    // it once, from the first.
    const existing = new Set(roster.map((player) => player.id));
    const mint = entry.roles
      .map((role) => [laneFor(role), role] as const)
      .filter(([id], index, all) => all.findIndex(([other]) => other === id) === index)
      .filter(([id]) => !existing.has(id));
    try {
      for (const [playerId, role] of mint) {
        await store.getClient().command("config.edit", {
          op: { kind: "player.set", playerId, patch: blocks[role] ?? NEUTRAL_BLOCK },
        });
      }
      await store.getClient().command("config.edit", {
        repository,
        op: {
          kind: "playbook.add",
          playbookId: entry.id,
          roles: Object.fromEntries(entry.roles.map((role) => [role, laneFor(role)])),
        },
      });
      onChanged();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disable(): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      await store.getClient().command("config.edit", {
        repository,
        op: { kind: "playbook.delete", playbookId: entry.id },
      });
      onChanged();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      id={`playbook-card-${entry.id}`}
      data-testid={`playbook-card-${entry.id}`}
      className={`flex flex-col gap-2 rounded-lg border bg-white px-4 py-3 dark:bg-neutral-900 ${
        enabledHere ? "border-neutral-200 dark:border-neutral-800" : "border-dashed border-neutral-300 dark:border-neutral-700"
      } ${revealed ? "ring-2 ring-brand-400 dark:ring-brand-500" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold">/{command}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-neutral-500" title={intent ?? undefined}>
          {intent}
        </span>
        <span
          data-testid={`playbook-enabled-${entry.id}`}
          className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${
            entry.enabled.length > 0
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
          }`}
        >
          {enabledPhrase(entry.enabled)}
        </span>
        {enabledHere ? (
          <button
            type="button"
            data-testid={`playbook-disable-${entry.id}`}
            disabled={busy}
            title={i18n._("/{command} stops being offered; the spec package stays", { command })}
            aria-label={i18n._("Disable /{command}", { command })}
            onClick={() => void disable()}
            className={SECONDARY}
          >
            {busy
              ? i18n._({ id: "Disabling…", comment: "the disable request is in flight" })
              : i18n._({ id: "Disable", comment: "stop offering this playbook in this config" })}
          </button>
        ) : (
          <button
            type="button"
            data-testid={`playbook-enable-${entry.id}`}
            disabled={busy || badLane !== undefined}
            title={
              badLane !== undefined
                ? i18n._("{role} needs a player id: lowercase segments joined by dots", { role: badLane })
                : i18n._("Enable /{command} with a player per role", { command })
            }
            aria-label={i18n._("Enable /{command}", { command })}
            onClick={() => void enable()}
            className={PRIMARY}
          >
            {busy
              ? i18n._({ id: "Enabling…", comment: "the enable request is in flight" })
              : i18n._({ id: "Enable", comment: "enable this playbook in this config" })}
          </button>
        )}
      </div>
      {invalid ? (
        <p data-testid={`playbook-invalid-${entry.id}`} className="text-xs text-red-600 [overflow-wrap:anywhere] dark:text-red-400">
          {i18n._("Invalid: {reason}", { reason: invalid })}
        </p>
      ) : null}
      {!entry.present ? (
        <p data-testid={`playbook-absent-${entry.id}`} className="text-xs text-amber-700 dark:text-amber-300">
          {i18n._("Its files are not on this device")}
        </p>
      ) : null}
      {enabledFolder !== undefined ? (
        <p data-testid="enabled-note" className="text-xs text-neutral-500 [overflow-wrap:anywhere]">
          {i18n._("Enabled. Sessions started before must be restarted to use it.")}{" "}
          <span data-testid="enabled-commit">{commitPhrase(enabledFolder)}</span>
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-600 dark:text-neutral-400">
        {entry.roles.map((role) =>
          enabledHere ? (
            <BoundRole
              key={role}
              entry={entry}
              role={role}
              binding={bindings?.[role]}
              roster={roster}
              readiness={readiness}
              side={side}
              repository={repository}
            />
          ) : (
            <ProposedRole
              key={role}
              entry={entry}
              role={role}
              playerId={players[role] ?? newPlayerId(role)}
              block={blocks[role] ?? NEUTRAL_BLOCK}
              roster={roster}
              readiness={readiness}
              captain={captain}
              onPlayer={(id) => setPlayers((current) => ({ ...current, [role]: id }))}
              onBlock={(block) => setBlocks((current) => ({ ...current, [role]: block }))}
            />
          ),
        )}
        <FromLabel entry={entry} />
      </div>
      {error ? (
        <div role="alert" data-testid={`playbook-error-${entry.id}`} className={ERROR}>
          {error}
        </div>
      ) : null}
      {hints}
      <PlaybookPipeline playbookId={entry.id} repository={entry.repository} />
    </div>
  );
}

/** An enabled entry no environment lists, or whose listing failed
 * validation, marked invalid with the failure rather than hidden
 * (playbook-library-2); Disable takes the entry out. */
function InvalidEntryRow({
  entry,
  repository,
  onChanged,
}: {
  entry: InvalidPlaybookEntry;
  repository: string;
  onChanged: () => void;
}) {
  const store = usePlaceStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <div
      data-testid={`playbook-card-${entry.playbook}`}
      className="flex flex-col gap-1 rounded-lg border border-red-300 bg-white px-4 py-3 dark:border-red-900 dark:bg-neutral-900"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold">{entry.playbook}</span>
        <span className="ml-auto" />
        <button
          type="button"
          data-testid={`playbook-disable-${entry.playbook}`}
          disabled={busy}
          aria-label={i18n._("Disable {id}", { id: entry.playbook })}
          onClick={() => {
            setBusy(true);
            setError(undefined);
            void store.getClient()
              .command("config.edit", { repository, op: { kind: "playbook.delete", playbookId: entry.playbook } })
              .then(onChanged)
              .catch((cause: Error) => setError(cause.message))
              .finally(() => setBusy(false));
          }}
          className={SECONDARY}
        >
          {busy
            ? i18n._({ id: "Disabling…", comment: "the disable request is in flight" })
            : i18n._({ id: "Disable", comment: "stop offering this playbook in this config" })}
        </button>
      </div>
      <p data-testid={`playbook-invalid-${entry.playbook}`} className="text-xs text-red-600 [overflow-wrap:anywhere] dark:text-red-400">
        {i18n._("Invalid: {reason}", { reason: entry.reason })}
      </p>
      {error ? (
        <div role="alert" className={ERROR}>
          {error}
        </div>
      ) : null}
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

/** One authoring session's row (playbook-library-50): its id, state
 * chip, the age of its last activity, Open, and Delete behind the
 * inline confirm (playbook-library-63). A session whose spec package
 * folder is gone, or whose record the core cannot read, offers only
 * Delete — the latter with the core's diagnostic beneath
 * (playbook-library-70). */
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
  async function remove(): Promise<void> {
    setConfirming(false);
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
            className={PRIMARY}
          >
            {i18n._({ id: "Open", comment: "open this authoring session's workspace" })}
          </button>
        ) : null}
        {confirming ? (
          <InlineConfirm
            question={i18n._("Delete this authoring session? Its spec package folder stays.")}
            confirmLabel={i18n._({ id: "Delete", comment: "confirm: remove the authoring session for good" })}
            cancelLabel={i18n._({ id: "Keep", comment: "cancel a removal: leave it as it is" })}
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
            aria-label={i18n._("Delete authoring session {id}", { id: draft.id })}
            title={i18n._("Remove the session and its conversation; the spec package folder stays")}
            onClick={() => setConfirming(true)}
            className="rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-red-600 disabled:opacity-40 dark:hover:bg-neutral-800"
          >
            {busy ? i18n._({ id: "Deleting…", comment: "the delete request is in flight" }) : i18n._({ id: "Delete", comment: "remove the authoring session for good" })}
          </button>
        )}
      </div>
      {draft.diagnostic ? (
        <div
          data-testid={`draft-row-diagnostic-${draft.id}`}
          className="text-xs text-red-600 [overflow-wrap:anywhere] dark:text-red-400"
        >
          {/* The core's own reading of the record, and what to do. */}
          {i18n._("{diagnostic} — delete the session, or repair the file and restart Spex", {
            diagnostic: draft.diagnostic,
          })}
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

/** The New playbook field (playbook-library-51): the id, checked in
 * place against the Agent Skills name rule and the ids the
 * environments already hold, beside "Org" and "License" for the new
 * spec package's manifest, filled with the project's defaults; Enter
 * creates the authoring session and opens its workspace. */
function NewPlaybookField({
  taken,
  drafts,
  org,
  license,
  onOrgChange,
  onLicenseChange,
  onCreate,
  onOpenExisting,
  autoFocus,
  onAutoFocused,
  blockedReason,
}: {
  /** Why no session can be made here, the field disabled meanwhile:
   * an authoring session lives in a project's spex repository. */
  blockedReason?: string;
  /** The playbooks either environment exports, by id. */
  taken: ReadonlyMap<string, PlaybookAvailability>;
  drafts: Record<string, DraftInfo>;
  /** The new spec package's org and license, as the person left them. */
  org: string;
  license: string;
  onOrgChange: (org: string) => void;
  onLicenseChange: (license: string) => void;
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
  const empty = value.trim().length === 0 || org.trim().length === 0 || license.trim().length === 0;

  useEffect(() => {
    if (!autoFocus) return;
    rootRef.current?.scrollIntoView?.({ block: "center" });
    inputRef.current?.focus();
    onAutoFocused();
  }, [autoFocus, onAutoFocused]);

  async function submit(): Promise<void> {
    const id = value.trim();
    if (!id || busy || blockedReason) return;
    if (!isDraftId(id)) {
      setError(draftIdRuleText());
      return;
    }
    if (drafts[id]) {
      // An id naming an existing authoring session opens that session.
      setError(undefined);
      onOpenExisting(id);
      return;
    }
    const holder = taken.get(id);
    if (holder) {
      setError(
        holder.source === "builtin"
          ? i18n._("{id} is a built-in — enable it instead", { id })
          : i18n._("{id} is already a playbook of {package}", { id, package: holder.package }),
      );
      return;
    }
    // A new spec package names its org and license: both are asked,
    // the org by the manifest's name rule.
    if (empty) return;
    if (!isPackageOrg(org.trim())) {
      setError(packageOrgRuleText());
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
  const field = "rounded border border-neutral-300 bg-white px-2 py-1 font-mono dark:border-neutral-700 dark:bg-neutral-950";

  return (
    <div
      ref={rootRef}
      data-testid="new-playbook"
      className="flex flex-col gap-1 rounded-lg border border-dashed border-neutral-300 bg-white px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900"
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5 text-sm">
          <span className="text-xs text-neutral-500">{i18n._("Playbook id")}</span>
          <input
            ref={inputRef}
            data-testid="new-playbook-id"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError(undefined);
            }}
            onKeyDown={onKeyDown}
            placeholder={i18n._({ id: "e.g. triage", comment: "placeholder of the new-playbook id field; triage is an example id" })}
            spellCheck={false}
            disabled={blockedReason !== undefined}
            aria-invalid={error !== undefined}
            aria-describedby="new-playbook-caption"
            className={field}
          />
        </label>
        <label className="flex min-w-0 flex-1 basis-28 flex-col gap-0.5 text-sm">
          <span className="text-xs text-neutral-500">{i18n._({ id: "Org", comment: "field of New playbook: the registry org its spec package is published under" })}</span>
          <input
            data-testid="new-playbook-org"
            value={org}
            onChange={(event) => {
              onOrgChange(event.target.value);
              setError(undefined);
            }}
            onKeyDown={onKeyDown}
            spellCheck={false}
            disabled={blockedReason !== undefined}
            className={field}
          />
        </label>
        <label className="flex min-w-0 flex-1 basis-28 flex-col gap-0.5 text-sm">
          <span className="text-xs text-neutral-500">{i18n._({ id: "License", comment: "field of New playbook: the SPDX license its spec package is published under" })}</span>
          <input
            data-testid="new-playbook-license"
            value={license}
            onChange={(event) => {
              onLicenseChange(event.target.value);
              setError(undefined);
            }}
            onKeyDown={onKeyDown}
            placeholder={i18n._({ id: "e.g. Apache-2.0", comment: "placeholder of the new-playbook license field; an SPDX license id" })}
            spellCheck={false}
            disabled={blockedReason !== undefined}
            className={field}
          />
        </label>
        <button
          type="button"
          data-testid="new-playbook-button"
          disabled={busy || empty || blockedReason !== undefined}
          title={blockedReason}
          onClick={() => void submit()}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-40"
        >
          {busy ? i18n._({ id: "Opening…", comment: "an authoring session is being opened" }) : i18n._({ id: "New playbook", comment: "start writing a playbook of one's own" })}
        </button>
      </div>
      <span id="new-playbook-caption" data-testid="new-playbook-caption" className="text-xs text-neutral-500">
        {blockedReason ?? draftIdCaption()}
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

/** What the live region says as authoring sessions move
 * (playbook-library-57/58/60/61). */
function announcementFor(previous: DraftInfo | undefined, next: DraftInfo): string | undefined {
  if (previous?.state === next.state) return undefined;
  switch (next.state) {
    case "compiling":
      return i18n._("Compiling {id}", { id: next.id });
    case "failed":
      // The pipeline names the phase; where it cannot, the line says so.
      return next.compile?.phase
        ? i18n._("Compile failed at {phase}", { phase: phaseLabel(next.compile.phase) })
        : i18n._("Compile failed at an unknown phase");
    case "compiled":
      return i18n._("Compiled {id}", { id: next.id });
    default:
      return undefined;
  }
}

/** The playbooks a side lists, sectioned by what a session there
 * effectively runs: enabled in the project's config or your own
 * group's, each row naming which, then enabled in neither
 * (playbook-library-1, playbook-library-34). */
function splitByEnablement(rows: readonly PlaybookAvailability[]) {
  const enabled = rows.filter((row) => row.enabled.length > 0);
  const rest = rows.filter((row) => row.enabled.length === 0);
  return { enabled, rest };
}

export function LibrarySurface({
  onNavigate,
}: {
  onNavigate?: (surface: "Settings" | "Space") => void;
}) {
  const store = usePlaceStore();
  const configState = store((state) => state.configState);
  const readiness = store((state) => state.readiness);
  const connection = store((state) => state.connection);
  const drafts = store((state) => state.drafts);
  const draftsLoaded = store((state) => state.draftsLoaded);
  const openDraftId = store((state) => state.openDraftId);
  const listDrafts = store((state) => state.listDrafts);
  const createDraft = store((state) => state.createDraft);
  const loadDraftDefaults = store((state) => state.loadDraftDefaults);
  const openDraft = store((state) => state.openDraft);
  const closeDraft = store((state) => state.closeDraft);
  const projects = store((state) => state.projects);
  const currentProjectId = store((state) => state.currentProjectId);
  const deleteDraft = store((state) => state.deleteDraft);
  const setDraftSourceMode = store((state) => state.setDraftSourceMode);
  const consumeNewPlaybookRequest = store((state) => state.consumeNewPlaybookRequest);
  const consumeRevealPlaybook = store((state) => state.consumeRevealPlaybook);
  const newPlaybookRequested = store((state) => state.newPlaybookRequested);
  const revealPlaybook = store((state) => state.revealPlaybook);
  const space = store((state) => state.space);
  const loadSpace = store((state) => state.loadSpace);
  const lists = store((state) => state.playbookLists);
  const loadPlaybookLists = store((state) => state.loadPlaybookLists);
  const loadEnvironment = store((state) => state.loadEnvironment);
  const storedSide = store((state) => state.playbooksSide);
  const setSide = store((state) => state.setPlaybooksSide);

  const [listError, setListError] = useState<string>();
  const [exampleError, setExampleError] = useState<string>();
  const [focusNew, setFocusNew] = useState(false);
  // New playbook's Org and License (playbook-library-51), filled with
  // the project's defaults as the core reads them, then the person's.
  const [newOrg, setNewOrg] = useState("");
  const [newLicense, setNewLicense] = useState("");
  const [revealed, setRevealed] = useState<string>();
  // The card an enabling revealed keeps its success line until the
  // surface is left, its highlight fading sooner (playbook-library-61).
  const [enabledNote, setEnabledNote] = useState<string>();
  const [liveNote, setLiveNote] = useState("");
  const [deletedNote, setDeletedNote] = useState<string>();
  const previousDrafts = useRef<Record<string, DraftInfo>>({});

  const project = chosenProject(projects, currentProjectId);
  const projectId = project?.id;
  const ownKey = ownRepositoryKey(space, lists?.own);
  // With no project chosen, your own group's side alone stands
  // (playbook-library-1).
  const side: PlaybooksSide = project ? storedSide : "own";
  const repository = side === "project" ? projectId : ownKey;
  const connected = connection === "open";

  const reloadLists = useCallback(() => {
    setListError(undefined);
    void loadPlaybookLists(projectId).catch((cause: Error) => setListError(cause.message));
  }, [loadPlaybookLists, projectId]);

  useEffect(() => {
    if (!connected) return;
    // Surface activation reads the authoring sessions
    // (playbook-library-50), what each environment exports
    // (playbook-library-1) and, for the sync and the account, Space.
    void listDrafts().catch(() => {});
    reloadLists();
    if (!store.getState().space) void loadSpace().catch(() => {});
  }, [connected, listDrafts, reloadLists, loadSpace]);

  useEffect(() => {
    if (connected && repository) void loadEnvironment(repository).catch(() => {});
  }, [connected, repository, loadEnvironment]);

  // New playbook's Org and License start from the project's defaults,
  // read as the field is shown for it (playbook-library-51, -103): a
  // project change clears both and forgets what the person typed; a
  // default that arrives later, or is read again on a reconnect, fills
  // only a field the person has not edited since.
  const touched = useRef({ org: false, license: false });
  useEffect(() => {
    touched.current = { org: false, license: false };
    setNewOrg("");
    setNewLicense("");
  }, [projectId]);
  useEffect(() => {
    if (!connected || !projectId) return;
    let current = true;
    void loadDraftDefaults(projectId)
      .then((defaults) => {
        if (!current || !defaults) return;
        if (!touched.current.org) setNewOrg(defaults.org);
        if (!touched.current.license) setNewLicense(defaults.license ?? "");
      })
      .catch(() => {
        // The fields stand empty for the person to fill.
      });
    return () => {
      current = false;
    };
  }, [connected, projectId, loadDraftDefaults]);
  const editOrg = useCallback((value: string) => {
    touched.current.org = true;
    setNewOrg(value);
  }, []);
  const editLicense = useCallback((value: string) => {
    touched.current.license = true;
    setNewLicense(value);
  }, []);
  const newPackage = { org: newOrg.trim(), license: newLicense.trim() };
  const newPackageReady = isPackageOrg(newPackage.org) && newPackage.license.length > 0;

  // The slash menu's request lands on the id field (playbook-library-51),
  // which stands on the project's side.
  useEffect(() => {
    if (newPlaybookRequested && consumeNewPlaybookRequest()) {
      setSide("project");
      setFocusNew(true);
    }
  }, [newPlaybookRequested, consumeNewPlaybookRequest, setSide]);

  // An enabling brings its card into view (playbook-library-61).
  useEffect(() => {
    if (revealPlaybook === undefined) return;
    const id = consumeRevealPlaybook();
    if (!id) return;
    setRevealed(id);
    setEnabledNote(id);
    const listed = [...(lists?.project ?? []), ...(lists?.own ?? [])].find((entry) => entry.id === id);
    setLiveNote(i18n._("Enabled /{command}", { command: listed?.command ?? id }));
    document.getElementById(`playbook-card-${id}`)?.scrollIntoView?.({ block: "center" });
  }, [revealPlaybook, consumeRevealPlaybook, lists]);
  useEffect(() => {
    if (revealed === undefined) return;
    const timer = setTimeout(() => setRevealed(undefined), 2400);
    return () => clearTimeout(timer);
  }, [revealed]);

  // The live region narrates the sessions' transitions (DR-010 §7).
  useEffect(() => {
    let note: string | undefined;
    for (const draft of Object.values(drafts)) {
      note = announcementFor(previousDrafts.current[draft.id], draft) ?? note;
    }
    previousDrafts.current = drafts;
    if (note) setLiveNote(note);
  }, [drafts]);

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
      else await createDraft(id, { org: newOrg.trim(), license: newLicense.trim() });
    } catch (cause) {
      setExampleError((cause as Error).message);
    }
  }, [createDraft, openDraft, setDraftSourceMode, newOrg, newLicense]);

  const liveRegion = (
    <div aria-live="polite" role="status" className="sr-only" data-testid="library-live">
      {liveNote}
    </div>
  );

  if (!configState || configState.status !== "valid") {
    return (
      <div className="relative m-auto max-h-full max-w-md overflow-y-auto p-6 text-center text-sm text-neutral-500">
        <p>{i18n._("The Captain can only run playbooks listed here.")}</p>
        {/* One sentence with the way to Settings inside it, so no
            translation is assembled from pieces. */}
        <p className="mt-1">
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
  const summary = configState.summary;
  // Your own group's roster: every side's bindings name its players.
  const roster = summary.players ?? [];

  // An authoring session's workspace replaces the list
  // (playbook-library-52); it stays open in the core while the list is
  // shown.
  if (openDraftId && drafts[openDraftId]) {
    return (
      <>
        {liveRegion}
        <AuthoringWorkspace draftId={openDraftId} onBack={closeDraft} onNavigate={onNavigate} />
      </>
    );
  }

  const rows = (side === "project" ? lists?.project : lists?.own) ?? [];
  const invalid = (lists?.invalid ?? []).filter((entry) => entry.config === side);
  const invalidFor = new Map(invalid.map((entry) => [entry.playbook, entry.reason]));
  const strayInvalid = invalid.filter((entry) => !rows.some((row) => row.id === entry.playbook));
  const { enabled, rest } = splitByEnablement(rows);
  const everyRow = [...(lists?.project ?? []), ...(lists?.own ?? [])];
  const invalidIds = new Set((lists?.invalid ?? []).map((entry) => entry.playbook));
  // Neither config enables anything: only then does the list read as
  // having no playbook (playbook-library-1).
  const noneEnabled = !everyRow.some((row) => row.enabled.length > 0) && (lists?.invalid ?? []).length === 0;
  // The validated catalog a session composes: what either config
  // enables and validation kept (playbook-library-48/89).
  const enabledIds = new Set(
    everyRow.filter((row) => row.enabled.length > 0 && !invalidIds.has(row.id)).map((row) => row.id),
  );
  const missingDelivery = ["branch", "pr"].filter((id) => !enabledIds.has(id));
  const taken = new Map<string, PlaybookAvailability>();
  for (const row of everyRow) {
    taken.set(row.id, row);
    taken.set(row.name, row);
  }
  const projectDrafts = Object.values(drafts)
    .filter((draft) => draft.projectId === projectId)
    .sort((a, b) => b.touchedAt - a.touchedAt);

  const hintsFor = (entry: PlaybookAvailability): ReactNode => {
    const notes: ReactNode[] = [];
    if (
      entry.enabled.length > 0 &&
      entry.source === "builtin" &&
      (entry.id === "code" || entry.id === "decide") &&
      !enabledIds.has("review")
    ) {
      notes.push(
        <p
          key="review"
          data-testid={`review-required-hint-${entry.id}`}
          className="text-xs text-amber-700 dark:text-amber-300"
        >
          {i18n._("{command} is unavailable until /review is enabled below.", {
            command: `/${entry.command ?? entry.id}`,
          })}
        </p>,
      );
    }
    // dev delivers issues through branch and pr (DR-059); a config
    // that enables dev without them can still run a plain /dev, so the
    // card carries a hint, never an invalid mark (playbook-library-48).
    if (entry.id === "dev" && entry.enabled.length > 0 && missingDelivery.length > 0) {
      notes.push(
        <p key="delivery" data-testid="dev-delivery-hint" className="text-xs text-amber-700 dark:text-amber-300">
          {/* One sentence, its verb chosen by how many playbooks are
              missing — never an "is"/"are" switch spliced in. */}
          {i18n._(
            "{count, plural, one {Pull-request delivery is unavailable until {names} is enabled below; a plain /dev request still runs.} other {Pull-request delivery is unavailable until {names} are enabled below; a plain /dev request still runs.}}",
            {
              count: missingDelivery.length,
              // Two names at most, and the word between them is a text
              // of its own language, never English glue.
              names:
                missingDelivery.length > 1
                  ? i18n._({
                      id: "{first} and {second}",
                      values: {
                        first: `/${missingDelivery[0]}`,
                        second: `/${missingDelivery[1]}`,
                      },
                      comment: "joins the two playbook names the /dev hint asks for",
                    })
                  : `/${missingDelivery[0]}`,
            },
          )}
        </p>,
      );
    }
    return notes.length > 0 ? <>{notes}</> : null;
  };

  const rowFor = (entry: PlaybookAvailability) => (
    <PlaybookRow
      key={`${entry.repository}:${entry.name}`}
      entry={entry}
      side={side}
      repository={repository ?? entry.repository}
      invalid={invalidFor.get(entry.id)}
      bindings={
        entry.bindings?.[side] ??
        (side === "own" ? (summary.playbooks ?? []).find((playbook) => playbook.id === entry.id)?.roles : undefined)
      }
      roster={roster}
      readiness={readiness}
      captain={summary.captain}
      revealed={revealed === entry.id}
      enabledFolder={
        enabledNote === entry.id
          ? drafts[entry.id] ? draftPackagePath(drafts[entry.id]!) : `spex-packages/${entry.id}`
          : undefined
      }
      hints={hintsFor(entry)}
      onChanged={reloadLists}
    />
  );

  const newPlaybook = (
    <NewPlaybookField
      taken={taken}
      drafts={drafts}
      org={newOrg}
      license={newLicense}
      onOrgChange={editOrg}
      onLicenseChange={editLicense}
      onCreate={(id) => createDraft(id, newPackage)}
      onOpenExisting={(id) => void openDraft(id)}
      autoFocus={focusNew}
      onAutoFocused={() => setFocusNew(false)}
      blockedReason={project ? undefined : draftNeedsProject()}
    />
  );

  return (
    // The surface root is the box Playbooks scrolls in (DR-041 §9):
    // height-constrained, and the containing block for its own
    // positioned content, so the page itself never scrolls.
    <div className="@container relative mx-auto flex w-full min-h-0 max-w-3xl flex-1 flex-col gap-5 overflow-y-auto p-6">
      {liveRegion}
      <datalist id="playbooks-roster">
        {roster.map((player) => (
          <option key={player.id} value={player.id} />
        ))}
      </datalist>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">{i18n._({ id: "Playbooks", comment: "the surface listing every playbook" })}</h1>
        {project ? (
          <div
            role="group"
            aria-label={i18n._("Spex repository shown")}
            data-testid="playbooks-switch"
            className="ml-auto flex min-w-0 flex-wrap items-center gap-1 rounded-md border border-neutral-200 p-0.5 dark:border-neutral-800"
          >
            {(
              [
                ["project", project.name, i18n._("The project's spex repository: {repository}", { repository: project.id })],
                ["own", i18n._({ id: "Your own group", comment: "switch: show your own group's playbooks" }), ownKey ?? ""],
              ] as const
            ).map(([key, label, title]) => (
              <button
                key={key}
                type="button"
                data-testid={`side-${key}`}
                aria-pressed={side === key}
                title={title || undefined}
                onClick={() => setSide(key)}
                className={`min-h-6 max-w-[14rem] truncate rounded px-2 py-0.5 text-xs ${
                  side === key
                    ? "bg-brand-100 font-medium text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                    : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {listError ? (
        <div role="alert" className={ERROR}>
          {listError}
        </div>
      ) : null}

      {repository ? <EnvironmentSection repository={repository} /> : null}

      <section data-testid="playbooks-enabled" className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-neutral-500">
          {i18n._({ id: "Enabled", comment: "section heading: the playbooks the project's config or your own group's enables" })}
        </h2>
        {enabled.map(rowFor)}
        {strayInvalid.map((entry) => (
          <InvalidEntryRow
            key={entry.playbook}
            entry={entry}
            repository={repository ?? ""}
            onChanged={reloadLists}
          />
        ))}
        {!lists ? (
          <p className="text-xs text-neutral-500">{i18n._({ id: "loading…", comment: "a request for this pane's content is in flight" })}</p>
        ) : noneEnabled ? (
          <div
            data-testid="playbooks-empty"
            className="rounded-lg border border-dashed border-neutral-300 px-4 py-5 text-center text-sm text-neutral-500 dark:border-neutral-700"
          >
            {i18n._("No playbooks enabled yet — enable a built-in below, or make your own with New playbook.")}
          </div>
        ) : null}
      </section>

      {rest.length > 0 ? (
        <section data-testid="playbooks-available" className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-neutral-500">
            {i18n._({ id: "Not enabled", comment: "section heading: playbooks neither the project's config nor your own group's enables" })}
          </h2>
          {rest.map(rowFor)}
        </section>
      ) : null}

      {side === "project" && project ? (
        // Authoring stands between the playbooks and the ways to add a
        // spec package, the way to a new playbook at its foot
        // (playbook-library-50/51); with no session the section is
        // absent and the field stands alone.
        projectDrafts.length > 0 ? (
          <section data-testid="drafts-section" className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-neutral-500">{i18n._({ id: "Authoring", comment: "section heading: playbooks being written in this project" })}</h2>
            {deletedNote ? (
              <p data-testid="deleted-note" className="text-xs text-neutral-500">
                {deletedNote}
              </p>
            ) : null}
            {projectDrafts.map((draft) => (
              <DraftRow
                key={draft.id}
                draft={draft}
                onOpen={() => void openDraft(draft.id)}
                onDelete={async () => {
                  await deleteDraft(draft.id);
                  const note = i18n._("Deleted {id}; its spec package folder stays at {path}", {
                    id: draft.id,
                    path: draftPackagePath(draft),
                  });
                  setDeletedNote(note);
                  setLiveNote(note);
                }}
              />
            ))}
            {newPlaybook}
          </section>
        ) : draftsLoaded ? (
          <section data-testid="new-playbook-section" className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-neutral-500">{i18n._({ id: "New playbook", comment: "start writing a playbook of one's own" })}</h2>
            {deletedNote ? (
              <p data-testid="deleted-note" className="text-xs text-neutral-500">
                {deletedNote}
              </p>
            ) : null}
            {newPlaybook}
          </section>
        ) : null
      ) : !project && draftsLoaded ? (
        <section data-testid="new-playbook-section" className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-neutral-500">{i18n._({ id: "New playbook", comment: "start writing a playbook of one's own" })}</h2>
          {newPlaybook}
        </section>
      ) : null}

      {repository ? (
        <AddSpecPackages repository={repository} />
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-neutral-500">{i18n._({ id: "Example", comment: "section heading: the demo playbook" })}</h2>
        <ExampleCard
          onPrefill={prefillFromExample}
          blockedReason={
            !project
              ? draftNeedsProject()
              : drafts[SLC_DEMO.playbookId] || newPackageReady
                ? undefined
                : i18n._({ id: "Org and License first", comment: "the example's prefill waits for New playbook's Org and License" })
          }
          error={exampleError}
        />
      </section>
    </div>
  );
}
