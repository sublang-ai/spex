// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// One listed playbook (playbook-library-1, playbook-library-122,
// DR-176), as the project's Playbooks tab and the Playbooks surface both
// list it: its command, `from <package> <version>`, its intent, and its
// roles grouped by the player that plays them — "coder, reviewer:
// <player>, its mark, its agent and model, ✎" — or, for a playbook whose
// command another one takes, "Stands aside · /<command> is <org/pkg>'s".
// ✎ edits the binding on the page of its scope: on the surface the
// global entry with each role's tuning; on a project's tab, under the
// project's heading, the project's entry, the player alone; under the
// Global heading, the project's override, "Same as global" first, a role
// whose project player differs from the global one carrying a dot. The
// first edit of a playbook running on its default binding writes its
// entry whole. A written entry failing validation is listed with its
// failure and Remove. Beneath, the stage row opens the playbook's
// pipeline.

import { type ReactNode, useRef, useState } from "react";
import {
  defaultPlayerId,
  type InvalidPlaybookEntry,
  type PlaybookArtifacts,
  type PlaybookAvailability,
  type ReadinessEntry,
  type RoleBindingSummary,
  type SessionPlayerSummary,
} from "@sublang/spex-core/protocol";

import { usePlaceStore } from "../state/place-context.js";
import type { SpexClient } from "../lib/client.js";
import { bindRole } from "../lib/config-ops.js";
import { i18n } from "../i18n.js";
import { playbookIntent } from "../lib/playbook-intent.js";
import { playerNamer } from "../lib/player-names.js";
import { BindingEditorPopover, SAME_AS_GLOBAL, type BindingChange } from "./BindingEditor.js";
import { AgentChip } from "./AgentChip.js";
import { PlayerName } from "./AgentMark.js";
import { Icon } from "./Icon.js";
import { Markdown } from "./Markdown.js";
import { Rich } from "./Rich.js";
import { GearsItems, STAGES, StageBox, StageRow, StateList, type StageKey } from "./PlaybookStages.js";

const SECONDARY =
  "min-h-6 rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800";
const ERROR =
  "rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 [overflow-wrap:anywhere] dark:border-red-900 dark:bg-red-950 dark:text-red-300";
const GEAR =
  "flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200";

/** Where a card stands, which decides what its ✎ writes
 * (playbook-library-1, playbook-library-4, playbook-library-122):
 *
 * - `project`: under the project's heading on its tab — the project's
 *   entry, the player alone;
 * - `override`: under Global on a project's tab — the project's
 *   override of the global binding, "Same as global" first;
 * - `global`: on the Playbooks surface — the global entry, with each
 *   role's tuning. */
export type CardScope =
  | { kind: "project"; projectId: string }
  | { kind: "override"; projectId: string }
  | { kind: "global"; repository: string };

/** The player the global binding names for a role: the global entry's,
 * else the default `dev.<role>` (core-service-2). */
export function globalPlayer(entry: PlaybookAvailability, role: string): string {
  return entry.written?.own?.[role]?.playerId ?? defaultPlayerId(role);
}

/** Whether a project's entry plays a role on another player than the
 * global binding — the dot under Global (playbook-library-1). */
export function overridden(entry: PlaybookAvailability, role: string): boolean {
  const own = entry.written?.project?.[role]?.playerId;
  return own !== undefined && own !== globalPlayer(entry, role);
}

/** Each role's effective player, as the composition binds it. */
function effectivePlayers(entry: PlaybookAvailability): Record<string, string> {
  return Object.fromEntries(entry.roles.map((role) => [role, entry.bindings[role]?.playerId ?? defaultPlayerId(role)]));
}

/** The write behind ✎ (playbook-library-3, playbook-library-4): the
 * entry of the card's scope, written whole where only the default — or,
 * for a project's override, only the global binding — stood. */
export async function writeBinding(
  client: Pick<SpexClient, "command">,
  scope: CardScope,
  entry: PlaybookAvailability,
  role: string,
  change: BindingChange,
): Promise<void> {
  // Where no entry of the scope stands, saving the player that already
  // plays the role, with nothing pinned, changes nothing and writes
  // nothing (playbook-library-3, playbook-library-4).
  const tuned = [change.model, change.subagentModel, change.effort, change.subagentEffort, change.fastMode].some(
    (value) => value !== undefined && value !== null,
  );
  const unchanged = change.playerId === effectivePlayers(entry)[role];
  if (scope.kind === "global") {
    if (!entry.entry.includes("own")) {
      if (unchanged && !tuned) return;
      // The first edit of a playbook on its default binding writes its
      // entry whole: this role as chosen, each other as the default
      // binds it.
      await client.command("config.edit", {
        repository: scope.repository,
        op: { kind: "playbook.add", playbookId: entry.id, roles: { ...effectivePlayers(entry), [role]: change.playerId } },
      });
      if (!tuned) return;
    }
    await bindRole(entry.id, role, change, scope.repository, client as SpexClient);
    return;
  }
  const repository = scope.projectId;
  const written = entry.written?.project;
  if (scope.kind === "project") {
    if (written) {
      await bindRole(entry.id, role, { playerId: change.playerId }, repository, client as SpexClient);
      return;
    }
    if (unchanged) return;
    await client.command("config.edit", {
      repository,
      op: { kind: "playbook.add", playbookId: entry.id, roles: { ...effectivePlayers(entry), [role]: change.playerId } },
    });
    return;
  }
  // An override of the global binding: the global player per role but
  // the one chosen; set back, the global player again, and the entry
  // gone once no role differs from the global binding.
  const target = change.playerId === SAME_AS_GLOBAL ? globalPlayer(entry, role) : change.playerId;
  const global = Object.fromEntries(entry.roles.map((name) => [name, globalPlayer(entry, name)]));
  const next = { ...global, ...Object.fromEntries(Object.entries(written ?? {}).map(([name, binding]) => [name, binding.playerId])), [role]: target };
  const differs = entry.roles.some((name) => next[name] !== global[name]);
  if (!differs) {
    if (written) {
      await client.command("config.edit", { repository, op: { kind: "playbook.delete", playbookId: entry.id } });
    }
    return;
  }
  if (written) {
    await bindRole(entry.id, role, { playerId: target }, repository, client as SpexClient);
    return;
  }
  await client.command("config.edit", {
    repository,
    op: { kind: "playbook.add", playbookId: entry.id, roles: next },
  });
}

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
    // The stage row hangs 8px into the card's padding so its first
    // label lines up with the card's text; the column takes those 8px
    // as its own padding, so no child leaves it inside a package's row
    // on the Playbooks surface (run-view-105).
    <div className="-ml-2 flex flex-col gap-2 pl-2">
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

/** A string with one value set apart, as code, wherever the language
 * places it, so no translation is assembled from pieces
 * (localization-4). */
export function withCode(phrase: (slot: string) => string, value: string): ReactNode {
  const slot = "\u0000";
  const [before = "", after = ""] = phrase(slot).split(slot);
  return (
    <>
      {before}
      <code className="font-mono">{value}</code>
      {after}
    </>
  );
}

/** Where a row's playbook comes from (playbook-library-29): "from
 * <package> <version>" for every package, the built-in one's as any
 * other's; the source and the installed folder in its tooltip — the
 * built-in package's by its folder alone, "built in" naming a source
 * only on the Packages tab's glyph (DR-176). */
function FromLabel({ entry }: { entry: PlaybookAvailability }) {
  // The source in the Packages tab's words (playbook-library-92).
  const source =
    entry.source === "builtin"
      ? entry.folder ?? i18n._({ id: "From the registry", comment: "tooltip: a package taken from the registry" })
      : entry.source === "path"
        ? i18n._({
            id: "From folder {path}",
            comment: "tooltip: a package taken from a folder; {path} is that folder",
            values: { path: entry.folder ?? entry.package },
          })
        : entry.source === "git"
          ? i18n._({ id: "From Git", comment: "tooltip: a package taken from a Git repository" })
          : i18n._({ id: "From the registry", comment: "tooltip: a package taken from the registry" });
  const title = entry.folder && entry.source !== "path" && entry.source !== "builtin" ? `${source} · ${entry.folder}` : source;
  return (
    <span className="flex min-w-0 items-center gap-1 text-xs text-neutral-500">
      <span data-testid={`playbook-from-${entry.id}`} title={title} className="min-w-0 truncate">
        {withCode(
          (slot) =>
            i18n._({
              id: "from {package}",
              comment: "a playbook row: the package and version it comes from, e.g. from acme/triage 1.2.0",
              values: { package: slot },
            }),
          `${entry.package} ${entry.version}`,
        )}
      </span>
    </span>
  );
}

/** One line of roles a player plays (playbook-library-1,
 * playbook-library-38): "coder, reviewer:", the player by its name and
 * mark, its id in the tooltip, what the binding runs, and ✎ per role —
 * the shared conversation drawn once, never badged. */
function RoleLine({
  entry,
  roles,
  binding,
  scope,
  roster,
  readiness,
  onChanged,
}: {
  entry: PlaybookAvailability;
  roles: string[];
  binding: RoleBindingSummary;
  scope: CardScope;
  roster: SessionPlayerSummary[];
  readiness: ReadinessEntry[];
  onChanged: () => void;
}) {
  const store = usePlaceStore();
  const [open, setOpen] = useState<string>();
  const anchors = useRef(new Map<string, HTMLButtonElement>());
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const lane = roster.find((player) => player.id === binding.playerId);
  const ready = lane ? readiness.find((item) => item.adapter === lane.agent.adapter) : undefined;
  // The players offered are your roster (playbook-library-4); one that
  // still waits to be set up is offered only where it plays already.
  const offered = roster.filter((player) => !player.toSetUp || player.id === binding.playerId);
  const tooltip = [binding.playerId, binding.display].filter(Boolean).join(" · ");
  const first = roles[0]!;
  return (
    <span
      data-testid={`role-line-${entry.id}-${first}`}
      data-roles={roles.join(" ")}
      // The binding wraps within itself in a narrow pane (DR-041): the
      // chip and its control drop under the roles rather than squeezing
      // to nothing.
      className="relative flex min-w-0 max-w-full flex-wrap items-center gap-1"
    >
      <span className="font-mono">
        {roles.map((role, index) => (
          <span key={role}>
            {role}
            {scope.kind === "override" && overridden(entry, role) ? (
              <span
                data-testid={`role-override-dot-${entry.id}-${role}`}
                role="img"
                aria-label={i18n._({ id: "differs from global", comment: "the dot on a role under a project's Global heading: the project plays it on another player than the global binding" })}
                title={i18n._({ id: "differs from global", comment: "the dot on a role under a project's Global heading: the project plays it on another player than the global binding" })}
                className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-brand-500 align-middle"
              />
            ) : null}
            {index < roles.length - 1 ? ", " : ":"}
          </span>
        ))}
      </span>
      <span
        data-testid={`role-binding-${entry.id}-${first}`}
        className="text-neutral-700 dark:text-neutral-200"
        title={tooltip}
      >
        {/* The player by its name and mark, its id in the tooltip
            (run-view-177). */}
        <PlayerName
          id={tooltip}
          name={playerNamer(roster.map((player) => player.id))(binding.playerId)}
          size="sm"
        />
      </span>
      {lane ? (
        <AgentChip
          // The row says what the role effectively runs: a binding's
          // own fast mode over the lane's.
          agent={binding.fastMode !== undefined ? { ...lane.agent, fastMode: binding.fastMode } : lane.agent}
          readiness={ready}
          label={lane.id}
        />
      ) : null}
      {roles.map((role) => (
        <button
          key={role}
          type="button"
          ref={(element) => {
            if (element) anchors.current.set(role, element);
            else anchors.current.delete(role);
          }}
          data-testid={`role-bind-${entry.id}-${role}`}
          title={i18n._({ id: "Choose who plays {role}", comment: "tooltip of a role's ✎ on a playbook row; {role} is the role", values: { role } })}
          aria-label={i18n._("Bind {role}", { role })}
          onClick={() => {
            anchorRef.current = anchors.current.get(role) ?? null;
            setOpen((current) => (current === role ? undefined : role));
          }}
          className={GEAR}
        >
          <Icon name="edit" />
        </button>
      ))}
      {open !== undefined ? (
        <BindingEditorPopover
          role={open}
          position={`${entry.id}.${open}`}
          binding={entry.bindings[open] ?? binding}
          players={offered}
          lanes={roster}
          playerOnly={scope.kind !== "global"}
          {...(scope.kind === "override" ? { sameAsGlobal: { selected: !overridden(entry, open), playerId: globalPlayer(entry, open) } } : {})}
          anchorRef={anchorRef}
          onSave={(next) =>
            writeBinding(store.getClient(), scope, entry, open, next).then(() => {
              setOpen(undefined);
              onChanged();
            })
          }
          onClose={() => setOpen(undefined)}
        />
      ) : null}
    </span>
  );
}

/** The roles grouped by the player that plays them, in the playbook's
 * order: one line per player and what it runs (playbook-library-38). */
function roleGroups(entry: PlaybookAvailability): { roles: string[]; binding: RoleBindingSummary }[] {
  const groups: { key: string; roles: string[]; binding: RoleBindingSummary }[] = [];
  for (const role of entry.roles) {
    const binding = entry.bindings[role] ?? { playerId: defaultPlayerId(role), display: "" };
    const key = [binding.playerId, binding.display, String(binding.fastMode)].join("\u0000");
    const group = groups.find((candidate) => candidate.key === key);
    if (group) group.roles.push(role);
    else groups.push({ key, roles: [role], binding });
  }
  return groups;
}

/** Remove on a written entry that failed validation (playbook-library-2,
 * playbook-library-3): it deletes that entry alone. */
function RemoveEntry({
  playbook,
  repository,
  onChanged,
}: {
  playbook: string;
  repository: string;
  onChanged: () => void;
}) {
  const store = usePlaceStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <>
      <button
        type="button"
        data-testid={`playbook-remove-${playbook}`}
        disabled={busy}
        aria-label={i18n._({ id: "Remove the entry for {id}", comment: "accessible name of Remove on a playbook entry that failed: it deletes the entry; {id} is the playbook", values: { id: playbook } })}
        onClick={() => {
          setBusy(true);
          setError(undefined);
          void store.getClient()
            .command("config.edit", { repository, op: { kind: "playbook.delete", playbookId: playbook } })
            .then(onChanged)
            .catch((cause: Error) => setError(cause.message))
            .finally(() => setBusy(false));
        }}
        className={SECONDARY}
      >
        {busy
          ? i18n._({ id: "Removing…", comment: "the removal is in flight" })
          : i18n._({ id: "Remove", comment: "a playbook entry that failed: delete it" })}
      </button>
      {error ? (
        <span role="alert" className={`${ERROR} basis-full`}>
          {error}
        </span>
      ) : null}
    </>
  );
}

/** A written entry no listed row carries, marked with its failure
 * rather than hidden, with Remove (playbook-library-2). */
export function InvalidEntryRow({
  entry,
  repository,
  onChanged,
}: {
  entry: InvalidPlaybookEntry;
  /** The spex repository whose config holds the entry. */
  repository: string;
  onChanged: () => void;
}) {
  return (
    <div
      data-testid={`playbook-card-${entry.playbook}`}
      className="flex flex-col gap-1 rounded-lg border border-red-300 bg-white px-4 py-3 dark:border-red-900 dark:bg-neutral-900"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold">{entry.playbook}</span>
        <span className="ml-auto" />
        <RemoveEntry playbook={entry.playbook} repository={repository} onChanged={onChanged} />
      </div>
      <p data-testid={`playbook-invalid-${entry.playbook}`} className="text-xs text-red-600 [overflow-wrap:anywhere] dark:text-red-400">
        {i18n._("Invalid: {reason}", { reason: entry.reason })}
      </p>
    </div>
  );
}

/** One listed playbook (playbook-library-1, playbook-library-122). */
export function PlaybookCard({
  entry,
  scope,
  invalid,
  roster,
  readiness,
  revealed,
  addedNote,
  hints,
  onChanged,
}: {
  entry: PlaybookAvailability;
  scope: CardScope;
  /** The failures of the written entry this card's scope holds, each
   * with Remove (playbook-library-2). */
  invalid: readonly string[];
  roster: SessionPlayerSummary[];
  readiness: ReadinessEntry[];
  /** An Add just brought this card into view: it is highlighted. */
  revealed: boolean;
  /** An authoring session's Add listed this card: its success line
   * stands, with what it says beside (playbook-library-61). */
  addedNote?: ReactNode;
  hints: ReactNode;
  onChanged: () => void;
}) {
  const command = entry.command ?? entry.id;
  // A built-in's intent in the reader's language (localization-4).
  const intent = playbookIntent(entry.intent);
  const aside = !entry.runs && entry.standsAside ? entry.standsAside : undefined;
  const repository = scope.kind === "global" ? scope.repository : scope.projectId;
  return (
    <div
      id={`playbook-card-${entry.id}`}
      data-testid={`playbook-card-${entry.id}`}
      className={`flex flex-col gap-2 rounded-lg border bg-white px-4 py-3 dark:bg-neutral-900 ${
        aside ? "border-dashed border-neutral-300 dark:border-neutral-700" : "border-neutral-200 dark:border-neutral-800"
      } ${revealed ? "ring-2 ring-brand-400 dark:ring-brand-500" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold">/{command}</span>
        <FromLabel entry={entry} />
        <span className="min-w-0 flex-1 basis-24 truncate text-xs text-neutral-500" title={intent ?? undefined}>
          {intent}
        </span>
      </div>
      {invalid.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <p data-testid={`playbook-invalid-${entry.id}`} className="min-w-0 flex-1 text-xs text-red-600 [overflow-wrap:anywhere] dark:text-red-400">
            {invalid.map((reason) => (
              <span key={reason} className="block">
                {i18n._("Invalid: {reason}", { reason })}
              </span>
            ))}
          </p>
          <RemoveEntry playbook={entry.id} repository={repository} onChanged={onChanged} />
        </div>
      ) : null}
      {!entry.present ? (
        <p data-testid={`playbook-absent-${entry.id}`} className="text-xs text-amber-700 dark:text-amber-300">
          {i18n._({ id: "Its files are not on this computer", comment: "a playbook whose package folder is missing here" })}
        </p>
      ) : null}
      {addedNote}
      {aside ? (
        <p data-testid={`playbook-aside-${entry.id}`} className="text-xs text-neutral-500 [overflow-wrap:anywhere]">
          {aside.winner
            ? i18n._({
                id: "Stands aside · /{command} is {package}'s",
                comment: "a playbook row in place of its roles: another package's playbook takes its command, so this one does not run; {package} names that package, such as acme/triage",
                values: { command, package: aside.winner },
              })
            : i18n._({
                id: "Stands aside · {reason}",
                comment: "a playbook row in place of its roles: it does not run, and why",
                values: { reason: aside.reason },
              })}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-600 dark:text-neutral-400">
          {roleGroups(entry).map((group) => (
            <RoleLine
              key={group.roles.join(" ")}
              entry={entry}
              roles={group.roles}
              binding={group.binding}
              scope={scope}
              roster={roster}
              readiness={readiness}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
      {hints}
      <PlaybookPipeline playbookId={entry.id} repository={entry.repository} />
    </div>
  );
}

/** The hints a card carries beside its roles (playbook-library-48,
 * playbook-library-89): a built-in `code` or `decide` that runs while no
 * `review` runs points at `/review`'s row; `dev` running without
 * `branch` and `pr` names each, a plain `/dev` still running. Neither
 * marks the entry invalid nor writes anything. */
export function playbookHints(entry: PlaybookAvailability, running: ReadonlySet<string>): ReactNode {
  const notes: ReactNode[] = [];
  if (entry.runs && entry.source === "builtin" && (entry.id === "code" || entry.id === "decide") && !running.has("review")) {
    notes.push(
      <p
        key="review"
        data-testid={`review-required-hint-${entry.id}`}
        className="text-xs text-amber-700 dark:text-amber-300"
      >
        <Rich
          text={i18n._({
            id: "{command} needs <0>/review</0> to run",
            comment: "a hint on a built-in playbook's card: it runs only once /review runs too; the tagged /review shows /review's row; {command} is its command, such as /code",
            values: { command: `/${entry.command ?? entry.id}` },
          })}
          components={[
            <button
              type="button"
              key="review"
              data-testid={`review-required-show-${entry.id}`}
              onClick={() => document.getElementById("playbook-card-review")?.scrollIntoView?.({ block: "center" })}
              className="font-mono underline"
            />,
          ]}
        />
      </p>,
    );
  }
  // dev delivers issues through branch and pr (DR-059); without them a
  // plain /dev still runs, so the card carries a hint, never an
  // invalid mark (playbook-library-48).
  const missingDelivery = ["branch", "pr"].filter((id) => !running.has(id));
  if (entry.id === "dev" && entry.runs && missingDelivery.length > 0) {
    notes.push(
      <p key="delivery" data-testid="dev-delivery-hint" className="text-xs text-amber-700 dark:text-amber-300">
        {/* One key phrase naming each missing playbook (playbook-library-48). */}
        {i18n._({
          id: "Pull requests need {names} · /dev still runs",
          comment: "a hint on the /dev card: delivering through a pull request needs these playbooks to run, while a plain /dev runs; {names} names them, such as /branch and /pr",
          values: {
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
        })}
      </p>,
    );
  }
  return notes.length > 0 ? <>{notes}</> : null;
}
