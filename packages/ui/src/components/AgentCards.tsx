// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Agents section (settings-5, DR-174): a standing card for Claude
// and one for Codex whether or not a role uses them, then an entry per
// other adapter the config names. A card says its readiness and who
// uses it, Claude's model service and each card's default model; one
// not ready says what to do by its fault's kind (settings-61) and how
// to configure it on this computer, or on a seat where to set a
// credential. With a valid config a card gives every agent of its
// adapter one model (settings-57, settings-58), and Claude's behind a
// third-party service lists the roles still naming an official model
// and sets them to Provider default (settings-59, settings-60) — each
// change one `config.batch` against the revision shown.

import { useId, useState, type ReactNode } from "react";
import type {
  AdapterName,
  ConfigBatchOpInput,
  ConfigState,
  ReadinessEntry,
} from "@sublang/spex-core/protocol";

import { usePlaceStore } from "../state/place-context.js";
import { isLocalPlace } from "../state/store.js";
import { i18n } from "../i18n.js";
import { useAgentOptions, providerDefaultDisplay } from "../lib/agent-options.js";
import {
  faultGuidance,
  faultsOf,
  fixPlan,
  manualSteps,
  modelServiceText,
  officialRoles,
  roleLabel,
  unifyPlan,
  type OfficialRole,
} from "../lib/agent-cards.js";
import { WORKSHOP } from "../lib/workshop.js";
import type { SpexCommandError } from "../lib/client.js";
import { noCheckNote, readinessWord } from "./AgentChip.js";
import { ModelField } from "./ModelField.js";
import { Rich } from "./Rich.js";

const STANDING: readonly AdapterName[] = ["claude", "codex"];

/** A product's own name stands untranslated. */
const CARD_NAME: Partial<Record<AdapterName, string>> = { claude: "Claude", codex: "Codex" };

const cardClass = "flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900";
const mutedClass = "text-xs text-neutral-500 dark:text-neutral-400";
const buttonClass = "rounded-md border border-neutral-300 px-2 py-0.5 text-xs hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800";
const code = <code className="font-mono" key="code" />;

function Badge({ entry }: { entry: ReadinessEntry }) {
  if (entry.ready === true) {
    return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{readinessWord(true)}</span>;
  }
  if (entry.ready === false) {
    return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{readinessWord(false)}</span>;
  }
  return (
    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800" title={entry.requirement ?? noCheckNote()}>
      {i18n._({ id: "unverified", comment: "readiness badge: no automatic check exists for this adapter" })}
    </span>
  );
}

/** "captain", or a player id with the roles it answers. */
function positionLabel(position: string): string {
  if (position === "captain") return i18n._({ id: "Captain", comment: "the session's controlling agent, by name" });
  const paren = position.indexOf(" (");
  return paren === -1 ? position : position.slice(0, paren);
}

/** A refusal in the reader's words: a conflict asks for a retry over
 * the config shown, a violation names its rule and field. */
function refusalText(error: unknown): string {
  const refusal = error as Partial<SpexCommandError>;
  if (refusal?.code === "conflict") {
    return i18n._("The config changed meanwhile and nothing was written: check the list and try again.");
  }
  const violations = (refusal?.details?.violations ?? []) as { rule: string; field?: string }[];
  const named = violations.map((violation) => (violation.field ? `${violation.field} (${violation.rule})` : violation.rule)).join(", ");
  const message = refusal?.message ?? String(error);
  return named ? i18n._("Nothing was written: {message} — {named}", { message, named }) : message;
}

/** The steps that configure an agent here (settings-5). */
function HowToConfigure({ entry, seat }: { entry: ReadinessEntry; seat: boolean }) {
  if (seat) {
    return (
      <details data-testid={`agent-howto-${entry.adapter}`} className={mutedClass}>
        <summary className="cursor-pointer">{i18n._("How to configure")}</summary>
        <p className="mt-1">{i18n._("Set your own credential for this agent in the Credentials section below.")}</p>
      </details>
    );
  }
  const steps = manualSteps(entry);
  return (
    <details data-testid={`agent-howto-${entry.adapter}`} className={mutedClass}>
      <summary className="cursor-pointer">{i18n._("How to configure")}</summary>
      <ol className="mt-1 flex list-decimal flex-col gap-1 pl-5">
        {WORKSHOP ? (
          <li data-testid="agent-howto-script">{i18n._("Run the Workshop setup script, as the Workshop materials describe.")}</li>
        ) : null}
        <li data-testid="agent-howto-manual">
          {WORKSHOP ? <span>{i18n._({ id: "Or set it by hand.", comment: "configuration step: the manual way, after the setup script" })} </span> : null}
          <Rich text={steps.where} components={[code]} />
          <pre className="mt-1 overflow-x-auto rounded bg-neutral-50 px-2 py-1 font-mono dark:bg-neutral-950">{steps.lines.join("\n")}</pre>
          {entry.adapter === "codex" ? <span>{i18n._("Codex needs an official OpenAI key.")} </span> : null}
          <span>{i18n._("Quit Spex completely and open it again.")}</span>
        </li>
      </ol>
    </details>
  );
}

/** Each fault in the reader's next step, the core's words beneath. */
function FaultLines({ entry, seat }: { entry: ReadinessEntry; seat: boolean }) {
  const faults = faultsOf(entry);
  if (faults.length === 0) return null;
  return (
    <ul data-testid={`agent-faults-${entry.adapter}`} className="flex flex-col gap-1">
      {faults.map((fault) => {
        const guidance = faultGuidance(entry, fault, { workshop: WORKSHOP, seat });
        return (
          <li key={`${fault.kind}:${fault.requirement}`} data-testid={`agent-fault-${fault.kind}`} className="flex flex-col">
            {guidance.text ? (
              <span className="text-xs">
                <Rich text={guidance.text} components={[code, <code className="font-mono" key="code-1" />]} />
                {guidance.local ? ` ${i18n._("Then quit Spex completely and open it again — see How to configure.")}` : ""}
              </span>
            ) : null}
            {/* The core's own requirement, whole (settings-23). */}
            <span data-testid="agent-fault-core" className={guidance.text ? "text-[11px] text-neutral-500 break-words" : "text-xs break-words"}>{guidance.core}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** A confirmation listing what a batch changes before it is sent. */
function Confirm({ children, busy, onConfirm, onCancel, testId }: { children: ReactNode; busy: boolean; onConfirm(): void; onCancel(): void; testId: string }) {
  return (
    <div data-testid={testId} className="flex flex-col gap-1 rounded-md border border-brand-200 bg-brand-50/40 p-2 text-xs dark:border-brand-900 dark:bg-brand-950/30">
      {children}
      <span className="flex gap-1">
        <button type="button" className={buttonClass} disabled={busy} onClick={onConfirm} data-testid={`${testId}-confirm`}>
          {i18n._({ id: "Confirm", comment: "default confirm button: go ahead with the act" })}
        </button>
        <button type="button" className={buttonClass} disabled={busy} onClick={onCancel}>
          {i18n._({ id: "Cancel", comment: "default cancel button: back out of the act" })}
        </button>
      </span>
    </div>
  );
}

function RoleList({ roles, testId }: { roles: string[]; testId: string }) {
  if (roles.length === 0) return null;
  return (
    <ul data-testid={testId} className="list-disc pl-5">
      {roles.map((role) => <li key={role} className="font-mono">{roleLabel(role)}</li>)}
    </ul>
  );
}

/** One model for every agent on an adapter (settings-57, settings-58). */
function OneModel({ entry, state, catalog }: { entry: ReadinessEntry; state: Extract<ConfigState, { status: "valid" }>; catalog: ReturnType<typeof useAgentOptions> }) {
  const store = usePlaceStore();
  const labelId = useId();
  const [value, setValue] = useState("");
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ done: true; left: string[] } | { error: string }>();
  const discovery = catalog.options?.discovery;
  const models = discovery?.status === "available" ? discovery.models : [];
  const defaultModel = discovery?.status === "available" ? discovery.defaultModel : undefined;
  const thirdParty = entry.baseUrl?.state === "third-party";
  // Behind a third party, nobody can say what Provider default runs
  // until the runtime reports it (settings-58).
  const blindDefault = thirdParty && value === "" && !defaultModel;
  const plan = unifyPlan(state.summary, entry.adapter, value);
  const name = CARD_NAME[entry.adapter] ?? entry.adapter;

  function apply(): void {
    setBusy(true);
    setOutcome(undefined);
    send(store, plan.ops, state.revision)
      .then(() => setOutcome({ done: true, left: plan.left }))
      .catch((error: unknown) => setOutcome({ error: refusalText(error) }))
      .finally(() => { setBusy(false); setAsking(false); });
  }

  return (
    <div data-testid={`agent-unify-${entry.adapter}`} className="flex flex-col gap-1">
      <span id={labelId} className={mutedClass}>{i18n._("Every agent on {name} uses:", { name })}</span>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1 basis-56">
          <ModelField
            value={value}
            models={models}
            {...(defaultModel ? { defaultModel } : {})}
            recommended={thirdParty && Boolean(defaultModel)}
            onChange={(next) => { setValue(next); setAsking(false); setOutcome(undefined); }}
            labelId={labelId}
            testId={`agent-unify-model-${entry.adapter}`}
          />
        </div>
        <button
          type="button"
          data-testid={`agent-unify-apply-${entry.adapter}`}
          className={buttonClass}
          disabled={busy || blindDefault || plan.ops.length === 0 || !state.revision}
          onClick={() => { setAsking(true); setOutcome(undefined); }}
        >
          {i18n._({ id: "Apply", comment: "give every agent of the adapter the chosen model" })}
        </button>
      </div>
      {blindDefault ? (
        <span data-testid={`agent-unify-blind-${entry.adapter}`} className={mutedClass}>
          {i18n._("The default model can't be read right now: retry, or choose a specific model.")}{" "}
          <button type="button" className={buttonClass} onClick={catalog.refresh}>{i18n._({ id: "Retry", comment: "try creating the config file again" })}</button>
        </span>
      ) : null}
      {asking ? (
        <Confirm testId={`agent-unify-confirm-${entry.adapter}`} busy={busy} onConfirm={apply} onCancel={() => setAsking(false)}>
          <span>{i18n._("These agents change:")}</span>
          <RoleList roles={plan.changes} testId="agent-unify-changes" />
          {plan.left.length > 0 ? (
            <>
              <span>{i18n._("These roles name a model of their own and are left as they are:")}</span>
              <RoleList roles={plan.left} testId="agent-unify-left" />
            </>
          ) : null}
        </Confirm>
      ) : null}
      {outcome && "done" in outcome ? (
        <div role="status" data-testid={`agent-unify-done-${entry.adapter}`} className={mutedClass}>
          {i18n._("Done.")}
          {outcome.left.length > 0 ? (
            <>
              {" "}{i18n._("These roles still name a model of their own:")}
              <RoleList roles={outcome.left} testId="agent-unify-done-left" />
            </>
          ) : null}
        </div>
      ) : null}
      {outcome && "error" in outcome ? <div role="alert" data-testid={`agent-unify-error-${entry.adapter}`} className="text-xs text-red-700 dark:text-red-300">{outcome.error}</div> : null}
    </div>
  );
}

/** Send one batch against the revision shown, taking its reply as the
 * state shown at once (core-service-44). A conflict reads the config
 * and each project's composition shown again before it is reported, so
 * the reader confirms over what the files now hold, never the list the
 * refused batch was built from (settings-58, settings-60). */
async function send(store: ReturnType<typeof usePlaceStore>, ops: ConfigBatchOpInput[], revision: string | undefined): Promise<void> {
  const client = store.getClient();
  try {
    const state = await client.command("config.batch", { ops, revision: revision ?? "" });
    store.setState({ configState: state });
  } catch (error) {
    if ((error as Partial<SpexCommandError>)?.code === "conflict") {
      await Promise.all([
        client.command("config.get", {}).then((configState) => store.setState({ configState })),
        ...Object.keys(store.getState().projectConfigs).map((projectId) => store.getState().loadProjectConfig(projectId)),
      ]).catch(() => {});
    }
    throw error;
  }
}

/** Official names behind a third-party service (settings-59, -60). */
function OfficialNames({ entry, state, catalog }: { entry: ReadinessEntry; state: Extract<ConfigState, { status: "valid" }>; catalog: ReturnType<typeof useAgentOptions> }) {
  const store = usePlaceStore();
  const projectConfigs = store((s) => s.projectConfigs);
  const projects = store((s) => s.projects);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ done: true } | { error: string }>();
  // Recomputed from the newest state on every render (settings-59).
  const rows = officialRoles(state, projectConfigs);
  const discovery = catalog.options?.discovery;
  const models = discovery?.status === "available" ? discovery.models : [];
  const defaultModel = discovery?.status === "available" ? discovery.defaultModel : undefined;
  const done = outcome !== undefined && "done" in outcome;
  if (rows.length === 0 && !done) return null;
  const ops = fixPlan(rows);
  const target = (() => {
    const display = providerDefaultDisplay(models, defaultModel);
    return display.specific ? `${display.name} · ${display.specific}` : display.name;
  })();
  const label = (row: OfficialRole) => {
    const project = row.projectId ? projects.find((p) => p.id === row.projectId)?.name ?? row.projectId : undefined;
    return project ? `${roleLabel(row.role)} (${project})` : roleLabel(row.role);
  };

  function apply(): void {
    setBusy(true);
    setOutcome(undefined);
    send(store, ops, state.revision)
      .then(() => setOutcome({ done: true }))
      .catch((error: unknown) => setOutcome({ error: refusalText(error) }))
      .finally(() => { setBusy(false); setAsking(false); });
  }

  return (
    <div data-testid="agent-official" className="flex flex-col gap-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      {done ? (
        <span role="status" data-testid="agent-official-done">
          {rows.length === 0
            ? i18n._("Every role now uses Provider default.")
            : i18n._("Written, but these roles still name an official model:")}
        </span>
      ) : (
        <span>{i18n._("These roles still name an official model and may bypass the model you chose:")}</span>
      )}
      {rows.length > 0 ? (
        <ul data-testid="agent-official-list" className="list-disc pl-5">
          {rows.map((row) => <li key={row.key}><span className="font-mono">{label(row)}</span> · {row.model}</li>)}
        </ul>
      ) : null}
      {rows.length > 0 ? (
        <span className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="agent-official-fix"
            className={buttonClass}
            disabled={busy || !defaultModel || ops.length === 0 || !state.revision}
            onClick={() => { setAsking(true); setOutcome(undefined); }}
          >
            {i18n._("Set all to Provider default")}
          </button>
          {!defaultModel ? (
            <span data-testid="agent-official-blind">
              {i18n._("The default model can't be read right now.")}{" "}
              <button type="button" className={buttonClass} onClick={catalog.refresh}>{i18n._({ id: "Retry", comment: "try creating the config file again" })}</button>
            </span>
          ) : null}
        </span>
      ) : null}
      {asking ? (
        <Confirm testId="agent-official-confirm" busy={busy} onConfirm={apply} onCancel={() => setAsking(false)}>
          <ul className="list-disc pl-5">
            {rows.map((row) => (
              <li key={row.key} data-testid="agent-official-confirm-row">
                <span className="font-mono">{label(row)}</span>: {row.model} →{" "}
                {target}
              </li>
            ))}
          </ul>
        </Confirm>
      ) : null}
      {outcome && "error" in outcome ? <div role="alert" className="text-red-700 dark:text-red-300">{outcome.error}</div> : null}
    </div>
  );
}

function AgentCard({ entry, state, seat }: { entry: ReadinessEntry; state: ConfigState | undefined; seat: boolean }) {
  const catalog = useAgentOptions(entry.adapter);
  const name = CARD_NAME[entry.adapter] ?? entry.adapter;
  const discovery = catalog.options?.discovery;
  const models = discovery?.status === "available" ? discovery.models : [];
  const defaultModel = discovery?.status === "available" ? discovery.defaultModel : undefined;
  const service = entry.adapter === "claude" ? modelServiceText(entry.baseUrl) : undefined;
  const validState = state?.status === "valid" ? state : undefined;
  // Provider default and the model it runs, by the display rule
  // (settings-38), or unavailable where discovery named none.
  const shown = providerDefaultDisplay(models, defaultModel);
  const defaultText = shown.specific ? `${shown.name} · ${shown.specific}` : i18n._({ id: "Unavailable", comment: "the runtime reported no default model" });
  return (
    <div data-testid={`agent-card-${entry.adapter}`} className={cardClass}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{name}</span>
        <Badge entry={entry} />
        {entry.ready === true ? (
          <span data-testid={`agent-checked-later-${entry.adapter}`} className={mutedClass}>
            {i18n._("Whether the connection works is checked on your first task")}
          </span>
        ) : null}
      </div>
      <div className={mutedClass} data-testid={`agent-users-${entry.adapter}`}>
        {entry.usedBy.length === 0 ? (
          i18n._("No role uses {name} yet.", { name })
        ) : (
          <span className="flex flex-wrap items-center gap-1">
            {i18n._({ id: "Used by", comment: "the positions an agent card's adapter serves follow" })}
            {entry.usedBy.map((position) => (
              <span key={position} title={position} className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">{positionLabel(position)}</span>
            ))}
          </span>
        )}
      </div>
      {service ? (
        <div className={mutedClass} data-testid="agent-service">
          {i18n._("Model service: {service}", { service })}
        </div>
      ) : null}
      <div className={mutedClass} data-testid={`agent-default-${entry.adapter}`}>
        {i18n._("Default model: {model}", { model: defaultText })}
      </div>
      {entry.adapter === "codex" ? <div className={mutedClass}>{i18n._("Codex needs an official OpenAI key.")}</div> : null}
      {entry.ready === false ? <FaultLines entry={entry} seat={seat} /> : null}
      {entry.ready === false ? <HowToConfigure entry={entry} seat={seat} /> : null}
      {validState ? <OneModel entry={entry} state={validState} catalog={catalog} /> : null}
      {validState && entry.adapter === "claude" && entry.baseUrl?.state === "third-party" ? (
        <OfficialNames entry={entry} state={validState} catalog={catalog} />
      ) : null}
    </div>
  );
}

/** Another adapter the config names: its readiness, as before. */
function OtherEntry({ entry }: { entry: ReadinessEntry }) {
  return (
    <div data-testid={`agent-row-${entry.adapter}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900">
      <span className="font-mono font-medium">{entry.adapter}</span>
      <Badge entry={entry} />
      {entry.ready === false && entry.requirement ? <span className="min-w-0 flex-1 text-xs text-neutral-500">{entry.requirement}</span> : null}
      <span className="ml-auto flex flex-wrap gap-1">
        {entry.usedBy.map((position) => (
          <span key={position} title={position} className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">{positionLabel(position)}</span>
        ))}
      </span>
    </div>
  );
}

export function AgentCards() {
  const store = usePlaceStore();
  const readiness = store((state) => state.readiness);
  const refreshReadiness = store((state) => state.refreshReadiness);
  const configState = store((state) => state.configState);
  const seat = !isLocalPlace(store.place);
  const byAdapter = new Map(readiness.map((entry) => [entry.adapter, entry]));
  // A card stands before the core's first answer too, unknown until it
  // comes (settings-5).
  const standing = STANDING.map((adapter) => byAdapter.get(adapter) ?? { adapter, ready: null, usedBy: [], fastModeSupported: false, subagentModelSupported: false });
  const others = readiness.filter((entry) => !STANDING.includes(entry.adapter));
  return (
    <section data-testid="agents-section" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-neutral-500">{i18n._("Agents")}</h2>
        <button
          type="button"
          title={i18n._("Re-run adapter readiness checks (e.g. after signing in)")}
          onClick={() => void refreshReadiness()}
          className="rounded-md border border-neutral-300 px-2 py-0.5 text-xs text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          {i18n._("Re-check readiness")}
        </button>
        <span data-testid="agents-recheck-note" className={mutedClass}>
          {i18n._("Changed a key and still not ready? Quit Spex completely and open it again.")}
        </span>
      </div>
      {standing.map((entry) => <AgentCard key={entry.adapter} entry={entry} state={configState} seat={seat} />)}
      {others.map((entry) => <OtherEntry key={entry.adapter} entry={entry} />)}
    </section>
  );
}
