// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Agents section (settings-5, DR-189): a standing card for Claude
// and one for Codex whether or not a role uses them, then an entry per
// other adapter the config names. A card says its readiness and who
// uses it, Claude's model service and each card's default model; one
// not ready says what to do by its fault's kind (settings-61) — in the
// Workshop what is missing and its setup guide (settings-69) — and how
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
import { useAgentOptions, modelDisplay, modelDisplayText, providerDefaultDisplay } from "../lib/agent-options.js";
import {
  adapterModels,
  distinctRunModels,
  agentName,
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
import { WORKSHOP, workshopGuideUrl } from "../lib/workshop.js";
import type { SpexCommandError } from "../lib/client.js";
import { noCheckNote, readinessWord, unconfirmedNote, unconfirmedWord } from "./AgentChip.js";
import { Icon } from "./Icon.js";
import { ModelField } from "./ModelField.js";
import { Rich } from "./Rich.js";

const STANDING: readonly AdapterName[] = ["claude", "codex"];


const cardClass = "flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900";
const mutedClass = "text-xs text-neutral-500 dark:text-neutral-400";
const buttonClass = "rounded-md border border-neutral-300 px-2 py-0.5 text-xs hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800";
// The card's one primary action: the other controls' box, filled.
const primaryClass = "rounded-md border border-brand-600 bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:border-brand-500 hover:bg-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-brand-600 disabled:hover:bg-brand-600";
const code = <code className="font-mono" key="code" />;

function Badge({ entry }: { entry: ReadinessEntry }) {
  if (entry.ready === true) {
    return (
      <span data-testid={`agent-badge-${entry.adapter}`} title={i18n._("Found a sign-in or key; whether it works is checked on your first task.")} className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
        {readinessWord(true)}
      </span>
    );
  }
  if (entry.ready === false) {
    // One tone for every not-ready card, whoever uses it: a step still
    // to take, not an error (settings-5).
    return <span data-testid={`agent-badge-${entry.adapter}`} data-tone="attention" className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">{readinessWord(false)}</span>;
  }
  if (entry.unconfirmed !== undefined) {
    return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">{unconfirmedWord()}</span>;
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

/** The steps that configure an agent here (settings-5), where the
 * Workshop's routes stand not: on a seat a pointer to the Credentials
 * section; on this computer the manual steps. */
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
      <div data-testid="agent-howto-manual" className="mt-1 flex flex-col gap-1">
        <span><Rich text={steps.where} components={[code]} /></span>
        <pre className="overflow-x-auto rounded bg-neutral-50 px-2 py-1 font-mono dark:bg-neutral-950">{steps.lines.join("\n")}</pre>
        <span>
          {entry.adapter === "codex" ? `${i18n._("Codex needs an official OpenAI key.")} ` : ""}
          {i18n._("Quit Spex completely and open it again.")}
        </span>
      </div>
    </details>
  );
}

/** The Workshop's one route (settings-69): whom it is for over its
 * primary action, the configuration document opened at the reader's
 * platform, then how to see the result. The online service is told in
 * the room, not offered here (DR-191). */
function WorkshopRoute({ entry, local }: { entry: ReadinessEntry; local: string }) {
  return (
    <div data-testid={`agent-routes-${entry.adapter}`} className="flex flex-col gap-3">
      <div data-testid="agent-route-local" className="flex min-w-0 flex-col items-start gap-2">
        <span className="text-sm text-neutral-700 [overflow-wrap:anywhere] dark:text-neutral-300">{local}</span>
        <a
          data-testid="agent-guide"
          href={workshopGuideUrl(entry.adapter, entry.platform)}
          target="_blank"
          rel="noreferrer"
          className={`${primaryClass} inline-flex items-center gap-1`}
        >
          {i18n._({ id: "Open the setup guide", comment: "an agent card's primary action in the Workshop: the configuration document, opened in the browser" })}
          <Icon name="external" className="h-3 w-3 shrink-0" />
        </a>
      </div>
      <span data-testid={`agent-routes-closing-${entry.adapter}`} className="text-xs text-neutral-600 dark:text-neutral-300">
        {i18n._("Once connected, press Re-check; if nothing changes, quit Spex completely and open it again.")}
      </span>
    </div>
  );
}

/** Each fault in the reader's next step, the core's words in its
 * tooltip where the step is in other words (settings-61). */
function closingLine(closing: "re-check" | "restart"): string {
  return closing === "re-check"
    ? i18n._("After signing in, re-check; after setting the key, quit Spex completely and open it again — see How to configure.")
    : i18n._("Then quit Spex completely and open it again — see How to configure.");
}

function FaultLines({ entry, seat }: { entry: ReadinessEntry; seat: boolean }) {
  const faults = faultsOf(entry);
  if (faults.length === 0) return null;
  return (
    <ul data-testid={`agent-faults-${entry.adapter}`} className="flex flex-col gap-1">
      {faults.map((fault) => {
        const guidance = faultGuidance(entry, fault, { workshop: WORKSHOP, seat });
        return (
          <li key={`${fault.kind}:${fault.requirement}`} data-testid={`agent-fault-${fault.kind}`} className="flex flex-col">
            {guidance.local !== undefined ? (
              // Plain text: the badge carries the tone, and the section's
              // verdict the one warning (settings-69).
              <span data-testid="agent-fault-guidance" className="text-sm text-neutral-700 [overflow-wrap:anywhere] dark:text-neutral-300" title={guidance.core}>
                <Rich text={guidance.text ?? guidance.core} components={[code]} />
              </span>
            ) : guidance.text ? (
              <span data-testid="agent-fault-guidance" className="text-sm font-medium text-neutral-900 [overflow-wrap:anywhere] dark:text-neutral-100" title={guidance.core}>
                <Rich text={guidance.text} components={[code, <code className="font-mono" key="code-1" />]} />
                {guidance.closing ? ` ${closingLine(guidance.closing)}` : ""}
              </span>
            ) : (
              // The core's own requirement is the guidance, whole (settings-23).
              <span data-testid="agent-fault-core" className="text-sm break-words text-neutral-900 dark:text-neutral-100">{guidance.core}</span>
            )}
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
  // Held while a conflict reads again, and after it failed (settings-58).
  const stale = store((s) => s.configReread) !== undefined;
  const discovery = catalog.options?.discovery;
  const models = discovery?.status === "available" ? discovery.models : [];
  const defaultModel = discovery?.status === "available" ? discovery.defaultModel : undefined;
  const thirdParty = entry.baseUrl?.state === "third-party";
  // Behind a third party, nobody can say what Provider default runs
  // until the runtime reports it (settings-58).
  const blindDefault = thirdParty && value === "" && !defaultModel;
  const plan = unifyPlan(state.summary, entry.adapter, value);
  const name = agentName(entry.adapter);

  function apply(): void {
    setBusy(true);
    setOutcome(undefined);
    send(store, plan.ops, state.revision)
      .then(() => setOutcome({ done: true, left: plan.left }))
      .catch((error: unknown) => {
        // A failed reading again speaks once, for the whole section.
        if ((error as Partial<SpexCommandError>)?.code !== "conflict" || store.getState().configReread === undefined) setOutcome({ error: refusalText(error) });
      })
      .finally(() => { setBusy(false); setAsking(false); });
  }

  return (
    <div data-testid={`agent-unify-${entry.adapter}`} className="flex flex-col gap-1">
      {/* The field's label says it changes them all and where one is
          set alone, one line above it, in one message so each language
          joins its sentences its own way (settings-57). */}
      <span id={labelId} data-testid={`agent-unify-label-${entry.adapter}`} className={mutedClass}>
        {i18n._("This changes the model of every Captain and player on {name} at once. To change only the Captain's or one player's, edit its settings above.", { name })}
      </span>
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
          disabled={busy || stale || blindDefault || plan.ops.length === 0 || !state.revision}
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
        <Confirm testId={`agent-unify-confirm-${entry.adapter}`} busy={busy || stale} onConfirm={apply} onCancel={() => setAsking(false)}>
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
  try {
    const state = await store.getClient().command("config.batch", { ops, revision: revision ?? "" });
    store.setState({ configState: state });
  } catch (error) {
    if ((error as Partial<SpexCommandError>)?.code === "conflict") await store.getState().rereadConfig();
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
  // Held while a conflict reads again, and after it failed (settings-58).
  const stale = store((s) => s.configReread) !== undefined;
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
      .catch((error: unknown) => {
        // A failed reading again speaks once, for the whole section.
        if ((error as Partial<SpexCommandError>)?.code !== "conflict" || store.getState().configReread === undefined) setOutcome({ error: refusalText(error) });
      })
      .finally(() => { setBusy(false); setAsking(false); });
  }

  const host = entry.baseUrl?.state === "third-party" ? entry.baseUrl.host : "";
  return (
    <div data-testid="agent-official" className="flex flex-col gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      {done ? (
        <span role="status" data-testid="agent-official-done">
          {rows.length === 0
            ? i18n._("Every role now uses Provider default.")
            : i18n._("Written, but these roles still name an official model:")}
        </span>
      ) : (
        <span className="flex items-start gap-1.5 text-sm">
          <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{i18n._("Some roles still name a Claude model, which {host} may bill as another model or refuse.", { host })}</span>
        </span>
      )}
      {rows.length > 0 ? (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            type="button"
            data-testid="agent-official-fix"
            className={buttonClass}
            disabled={busy || stale || !defaultModel || ops.length === 0 || !state.revision}
            onClick={() => { setAsking(true); setOutcome(undefined); }}
          >
            {defaultModel
              ? i18n._({ id: "Use {model} for all", comment: "sets every role naming an official model to Provider default, named by the model it runs", values: { model: modelDisplayText(modelDisplay(models, defaultModel)) } })
              : i18n._("Set all to Provider default")}
          </button>
          {!defaultModel ? (
            <span data-testid="agent-official-blind">
              {i18n._("The default model can't be read right now.")}{" "}
              <button type="button" className={buttonClass} onClick={catalog.refresh}>{i18n._({ id: "Retry", comment: "try creating the config file again" })}</button>
            </span>
          ) : null}
          {!asking ? (
            <details data-testid="agent-official-roles">
              <summary className="cursor-pointer">{i18n._("Show which roles")}</summary>
              <ul data-testid="agent-official-list" className="mt-1 list-disc pl-5">
                {rows.map((row) => <li key={row.key}>{label(row)} · {row.model}</li>)}
              </ul>
            </details>
          ) : null}
        </span>
      ) : null}
      {asking ? (
        <Confirm testId="agent-official-confirm" busy={busy || stale} onConfirm={apply} onCancel={() => setAsking(false)}>
          <ul className="list-disc pl-5">
            {rows.map((row) => (
              <li key={row.key} data-testid="agent-official-confirm-row">
                {label(row)}: {row.model} →{" "}
                {target}
              </li>
            ))}
          </ul>
        </Confirm>
      ) : null}
      {outcome && "error" in outcome ? <div role="alert" data-testid="agent-official-error" className="text-red-700 dark:text-red-300">{outcome.error}</div> : null}
    </div>
  );
}

/** The Claude card's tag (settings-5) while it is not ready: once it
 * is, the recommendation has done its work. */
function RecommendedTag({ adapter, ready }: { adapter: AdapterName; ready: boolean | null }) {
  if (adapter !== "claude" || ready === true) return null;
  return <span data-testid={`agent-tag-${adapter}`} className="rounded border border-neutral-300 px-1.5 text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">{i18n._({ id: "Recommended", comment: "tag beside the Claude agent card's name" })}</span>;
}

function AgentCard({ entry, state, seat }: { entry: ReadinessEntry; state: ConfigState | undefined; seat: boolean }) {
  const catalog = useAgentOptions(entry.adapter);
  const name = agentName(entry.adapter);
  const discovery = catalog.options?.discovery;
  const models = discovery?.status === "available" ? discovery.models : [];
  const defaultModel = discovery?.status === "available" ? discovery.defaultModel : undefined;
  const service = entry.adapter === "claude" ? modelServiceText(entry.baseUrl) : undefined;
  const validState = state?.status === "valid" ? state : undefined;
  // Provider default and the model it runs, by the display rule
  // (settings-38), or unavailable where discovery named none.
  const shown = providerDefaultDisplay(models, defaultModel);
  const defaultText = shown.specific ?? i18n._({ id: "Unavailable", comment: "the runtime reported no default model" });
  // What its agents run: the one model, Provider default's by name, or
  // that they run several (settings-5).
  const running = validState ? distinctRunModels(adapterModels(validState.summary, entry.adapter), models, defaultModel) : [""];
  const runsText = running.length > 1
    ? i18n._({ id: "Several models", comment: "an agent card's agents run different models" })
    : running[0] ? modelDisplayText(modelDisplay(models, running[0])) : defaultText;
  const notReady = entry.ready === false;
  const [listed, setListed] = useState(false);
  const [changing, setChanging] = useState(false);
  const listId = useId();
  const changeId = useId();
  // A local credential with the Workshop switch on: what is missing
  // and the setup guide (settings-69), else the steps (settings-5).
  const routes = notReady && WORKSHOP && !seat
    ? faultsOf(entry).map((fault) => faultGuidance(entry, fault, { workshop: true, seat: false }).local).find((local) => local !== undefined)
    : undefined;
  const chips = (
    <span className="flex flex-wrap items-center gap-1">
      {notReady
        ? i18n._({ id: "Needed by", comment: "the positions a not-ready agent card's adapter is set for follow" })
        : i18n._({ id: "Used by", comment: "the positions an agent card's adapter serves follow" })}
      {entry.usedBy.map((position) => (
        <span key={position} title={position} className="max-w-full rounded [overflow-wrap:anywhere] bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">{positionLabel(position)}</span>
      ))}
    </span>
  );
  // One frame in every state (settings-5): the heading with who uses
  // it, a line saying what is missing or what runs, then what to do.
  return (
    <div data-testid={`agent-card-${entry.adapter}`} className={`${cardClass} gap-3 py-3`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{name}</span>
        <RecommendedTag adapter={entry.adapter} ready={entry.ready} />
        <Badge entry={entry} />
        {entry.usedBy.length > 0 ? (
          // Who uses it, in brief; the whole list opens beneath.
          <button
            type="button"
            data-testid={`agent-users-${entry.adapter}`}
            title={entry.usedBy.map(positionLabel).join(", ")}
            aria-expanded={listed}
            aria-controls={listId}
            onClick={() => setListed((open) => !open)}
            className={`${mutedClass} ml-auto rounded text-right hover:text-neutral-700 hover:underline dark:hover:text-neutral-200`}
          >
            {usersBrief(entry.usedBy, notReady)}
          </button>
        ) : (
          <span data-testid={`agent-users-${entry.adapter}`} className={`${mutedClass} ml-auto`}>{i18n._("No role uses {name} yet.", { name })}</span>
        )}
      </div>
      {listed ? <div id={listId} data-testid={`agent-users-list-${entry.adapter}`} className={mutedClass}>{chips}</div> : null}
      {entry.ready === null && entry.unconfirmed !== undefined ? (
        <div data-testid={`agent-unconfirmed-${entry.adapter}`} className="text-xs text-amber-800 dark:text-amber-300">
          {unconfirmedNote(entry.unconfirmed)}
        </div>
      ) : null}
      {notReady ? (
        // Its configuration alone: the model settings have nothing to
        // act on before the agent runs (settings-5).
        <div className="flex flex-col gap-2.5">
          <FaultLines entry={entry} seat={seat} />
          {routes !== undefined ? <WorkshopRoute entry={entry} local={routes} /> : <HowToConfigure entry={entry} seat={seat} />}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span data-testid={`agent-runs-${entry.adapter}`} className="min-w-0 text-sm text-neutral-700 [overflow-wrap:anywhere] dark:text-neutral-300">
              {service ? <span data-testid="agent-service">{service}</span> : null}
              {service ? " · " : ""}
              <span data-testid={`agent-default-${entry.adapter}`}>{runsText}</span>
            </span>
            {validState ? (
              <button
                type="button"
                data-testid={`agent-change-${entry.adapter}`}
                aria-expanded={changing}
                aria-controls={changeId}
                onClick={() => setChanging((open) => !open)}
                className="inline-flex items-center gap-1 rounded text-xs text-brand-600 hover:underline dark:text-brand-300"
              >
                <Icon name="edit" className="h-3 w-3" />
                {i18n._({ id: "Change model", comment: "opens an agent card's adapter-wide model setting" })}
              </button>
            ) : null}
          </div>
          {validState && changing ? (
            <div id={changeId}>
              <OneModel entry={entry} state={validState} catalog={catalog} />
            </div>
          ) : null}
          {validState && entry.adapter === "claude" && entry.baseUrl?.state === "third-party" ? (
            <OfficialNames entry={entry} state={validState} catalog={catalog} />
          ) : null}
        </>
      )}
    </div>
  );
}

/** A card's positions in brief: the first by name and how many more,
 * opening the whole list (settings-5); a not-ready card's need the
 * agent rather than use it, since none can run yet. */
function usersBrief(usedBy: readonly string[], notReady: boolean): string {
  const first = positionLabel(usedBy[0]!);
  const values = { first, count: usedBy.length - 1, total: usedBy.length };
  if (notReady) {
    if (usedBy.length === 1) return i18n._("Needed by {first}", { first });
    return i18n._({
      id: "Needed by {first} and {count, plural, one {# more role} other {# more roles}}",
      comment: "a not-ready agent card's positions in brief; {first} is a role such as Captain, {count} the roles beside it, {total} all of them",
      values,
    });
  }
  if (usedBy.length === 1) return i18n._("Used by {first}", { first });
  return i18n._({
    id: "Used by {first} and {count, plural, one {# more role} other {# more roles}}",
    comment: "an agent card's positions in brief; {first} is a role such as Captain, {count} the roles beside it, {total} all of them",
    values,
  });
}

/** The section's verdict (settings-70): a line where something needs
 * doing before a task can start or run whole, read from the Captain's
 * agent, since a task needs at least one agent and the Captain runs
 * first; none where nothing does, or once the core has not answered. */
function Verdict({ readiness }: { readiness: readonly ReadinessEntry[] }) {
  if (readiness.length === 0) return null;
  const captain = readiness.find((entry) => entry.usedBy.includes("captain"));
  // A Captain on an agent with no check, or one unconfirmed, says
  // nothing either way.
  if (captain && captain.ready === null) return null;
  const ready = readiness.filter((entry) => entry.ready === true);
  // A role on an agent not ready fails at its step, though a task
  // starts.
  const waiting = readiness.find((entry) => entry.ready === false && entry.usedBy.length > 0);
  let text: string;
  if (ready.length === 0) {
    text = i18n._("Set up at least one agent to start a task; Claude is recommended.");
  } else if (captain && captain.ready === false) {
    text = i18n._("The Captain uses {name}, which is not ready: set it up, or switch the Captain to {other}.", { name: agentName(captain.adapter), other: agentName(ready[0]!.adapter) });
  } else if (captain && captain.ready === true && waiting) {
    text = i18n._("Tasks can start, but {first} uses {other}, which is not ready, so its steps fail until it is set up.", { first: positionLabel(waiting.usedBy[0]!), other: agentName(waiting.adapter) });
  } else {
    return null;
  }
  return (
    <p data-testid="agents-verdict" className="flex items-start gap-1.5 text-sm text-amber-800 [overflow-wrap:anywhere] dark:text-amber-300">
      <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{text}</span>
    </p>
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
  const reread = store((state) => state.configReread);
  const [checking, setChecking] = useState(false);
  function recheck(): void {
    setChecking(true);
    void refreshReadiness().finally(() => setChecking(false));
  }
  return (
    <section data-testid="agents-section" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-neutral-500">{i18n._("Agents")}</h2>
        <button
          type="button"
          data-testid="agents-recheck"
          title={i18n._("Reads each agent's sign-in and Claude Code's settings again; a key set as an environment variable needs Spex quit and opened again.")}
          aria-busy={checking}
          disabled={checking}
          onClick={recheck}
          className="inline-flex items-center gap-1 rounded-md border border-neutral-300 px-2 py-0.5 text-xs text-neutral-500 hover:bg-neutral-100 disabled:opacity-70 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          <Icon name="refresh" className={`h-3 w-3 shrink-0${checking ? " animate-spin motion-reduce:animate-none" : ""}`} />
          {i18n._({ id: "Re-check", comment: "the Agents section's control: read each agent's readiness again" })}
        </button>
      </div>
      {reread && !reread.reading ? (
        <div role="alert" data-testid="agents-stale" className="text-xs text-red-700 dark:text-red-300">
          {i18n._("The config changed meanwhile and nothing was written, but it could not be read again: {message}", { message: reread.error })}{" "}
          <button type="button" className={buttonClass} onClick={() => void store.getState().rereadConfig()}>
            {i18n._({ id: "Read again", comment: "read the config and the projects' settings again after a failed read" })}
          </button>
        </div>
      ) : null}
      <Verdict readiness={readiness} />
      {standing.map((entry) => <AgentCard key={entry.adapter} entry={entry} state={configState} seat={seat} />)}
      {others.map((entry) => <OtherEntry key={entry.adapter} entry={entry} />)}
    </section>
  );
}
