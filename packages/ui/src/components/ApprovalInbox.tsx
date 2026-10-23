// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The live approval inbox (approvals-5): one global inbox over every
// place's pending requests (run-view-168), each request naming its
// place where the page holds several and answered at its own core with
// that core's generation (DR-133).

import { useEffect, useMemo, useRef, useState } from "react";
import type { ApprovalDecision, ApprovalOwner, PendingApproval } from "@sublang/spex-core/protocol";
import { useEachPlace, usePlaceStore } from "../state/place-context.js";
import { placeKey, placeLabel, useAppStore, type AppStore } from "../state/store.js";
import { i18n } from "../i18n.js";

const buttonClass = "min-h-8 rounded border border-brand-300 px-3 py-1 text-sm hover:bg-brand-50 disabled:opacity-50 dark:border-brand-700 dark:hover:bg-brand-950";

/** One request, answered at `store`'s core — the core that raised it —
 * with that core's generation; `place` names the place where the page
 * holds several. */
function ApprovalCard({approval, generation, connected, store, place}: {approval: PendingApproval; generation: string; connected: boolean; store: AppStore; place?: string}) {
  const [answering, setAnswering] = useState(false);
  const request = approval.request;
  const title = [request.details?.title, request.details?.displayName].find((value): value is string => typeof value === "string" && value.trim().length > 0);
  const description = typeof request.details?.description === "string" ? request.details.description : undefined;
  async function answer(decision: ApprovalDecision) {
    setAnswering(true);
    try {
      await store.getClient().command("approval.respond", {generation, requestId: approval.id, owner: approval.owner, decision});
      // Only the core's snapshot removes authority. A reply alone cannot
      // manufacture an executed tool result or remove a different request.
    } catch (cause) {
      store.setState({approvalError: i18n._("Could not answer {tool} for {actor}: {reason}", {tool: request.toolName, actor: approval.actorId, reason: cause instanceof Error ? cause.message : String(cause)})});
    } finally { setAnswering(false); }
  }
  // This computer's ids as they were; a seat's qualified by its place.
  const headingId = placeKey(store.place, `approval-${approval.id}`);
  return <article tabIndex={-1} data-approval-id={approval.id} data-approval-place={store.place.key} aria-labelledby={headingId} className="min-w-0 rounded border border-neutral-300 p-3 dark:border-neutral-700">
    {place ? <p data-testid="approval-place" className="text-xs font-medium text-neutral-500 [overflow-wrap:anywhere]">{place}</p> : null}
    <h3 id={headingId} className="font-medium [overflow-wrap:anywhere]">{title ?? i18n._("Allow this tool operation?")}</h3>
    {description ? <p className="mt-1 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{description}</p> : null}
    <p className="text-sm [overflow-wrap:anywhere]">{i18n._("Tool: {tool}", {tool: request.toolName})}</p>
    <p className="text-sm [overflow-wrap:anywhere]">{approval.projectName ? `${approval.projectName} · ` : ""}{approval.owner.kind === "draft" ? i18n._("Draft: {name}", {name: approval.ownerLabel}) : i18n._("Conversation: {name}", {name: approval.ownerLabel})}</p>
    <p className="text-xs text-neutral-500 [overflow-wrap:anywhere]">{i18n._("{actor} · Turn {turn}", {actor: approval.actorId, turn: approval.turnId})}</p>
    {request.reason ? <p className="mt-1 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{request.reason}</p> : null}
    <pre aria-label={i18n._("Requested action")} className="my-2 max-h-36 overflow-auto whitespace-pre-wrap rounded bg-neutral-100 p-2 text-xs [overflow-wrap:anywhere] dark:bg-neutral-900">{JSON.stringify(request.input, null, 2)}</pre>
    <details className="mb-2 text-xs">
      <summary className="cursor-pointer py-1">{i18n._("More details")}</summary>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-neutral-100 p-2 [overflow-wrap:anywhere] dark:bg-neutral-900">{JSON.stringify({owner: approval.owner, invocationId: approval.invocationId, toolUseId: request.toolUseId, ...(request.details ? {permission: request.details} : {})}, null, 2)}</pre>
    </details>
    <div className="flex flex-wrap gap-2">
      {request.choices.includes("allow_once") ? <button className={buttonClass} disabled={!connected || answering} onClick={() => void answer("allow_once")}>{i18n._("Approve once")}</button> : null}
      {request.choices.includes("deny") ? <button data-deny className={buttonClass} disabled={!connected || answering} onClick={() => void answer("deny")}>{i18n._("Deny")}</button> : null}
    </div>
  </article>;
}

/** A conflicting answer can arrive after another client removed the card.
 * Keep the refusal visible without recreating any live authority — each
 * place's own, dismissed at that place. */
export function ApprovalFeedback() {
  const errors = useEachPlace((state) => state.approvalError);
  return errors.map(({store, value: error}) => error ? <div key={store.place.key} role="alert" className="flex shrink-0 flex-wrap items-center gap-2 border-b border-red-200 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:text-red-300">
    <p className="min-w-0 flex-1 [overflow-wrap:anywhere]">{error}</p>
    <button className="min-h-8 underline" onClick={() => store.setState({approvalError: undefined})}>{i18n._("Dismiss")}</button>
  </div> : null);
}

const sameOwner = (a: ApprovalOwner, b: ApprovalOwner): boolean =>
  a.kind === b.kind && a.id === b.id && (a.kind !== "draft" || (b.kind === "draft" && a.instance === b.instance));

/** This notice names only real core requests belonging to this
 * conversation, at the place the conversation is shown at. */
export function ApprovalNotice({owner}: {owner: ApprovalOwner}) {
  const store = usePlaceStore();
  const pending = store((state) => state.approvals?.pending);
  const show = store((state) => state.showApprovals);
  // A draft's calls are its instance's: a session made again under the
  // id never shows the former's (core-service-96).
  const own = pending?.filter((item) => sameOwner(item.owner, owner)) ?? [];
  if (!own.length) return null;
  return <div className="shrink-0 border-t border-brand-200 px-3 py-2 text-sm dark:border-brand-800">
    <button className="text-left text-brand-700 underline [overflow-wrap:anywhere] dark:text-brand-300" onClick={() => show(own[0].id)}>{i18n._("Tool approval needed ({count})", {count: own.length})}</button>
  </div>;
}

/** Global because authoring drafts are deliberately not session ledger
 * rows, and joined across the places (approvals-5): each place's
 * requests after the one before's, this computer's first. */
export function ApprovalInbox() {
  const places = useEachPlace((state) => ({
    approvals: state.approvals,
    open: state.approvalInboxOpen,
    focusId: state.approvalFocusId,
    connected: state.connection === "open",
  }));
  const region = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const focusedRequest = useRef<string | undefined>(undefined);
  const several = places.length > 1;
  const pending = useMemo(() => places.flatMap(({store, value}) =>
    value.approvals ? value.approvals.pending.map((approval) => ({store, approval, generation: value.approvals!.generation, connected: value.connected})) : [],
  ), [places]);
  // The inbox is one: open wherever a place opened it, its focus the
  // request that place named.
  const opener = places.find(({value}) => value.open);
  const open = opener !== undefined;
  const focus = opener?.value.focusId ? {place: opener.store.place.key, id: opener.value.focusId} : undefined;
  const show = () => useAppStore.getState().showApprovals();
  const hide = () => places.forEach(({store}) => store.getState().hideApprovals());
  const keyOf = (place: string, id: string) => `${place}\n${id}`;
  useEffect(() => {
    if (open && focus) {
      const card = region.current?.querySelector<HTMLElement>(`[data-approval-place="${focus.place}"][data-approval-id="${focus.id}"]`);
      (card?.querySelector<HTMLElement>("button[data-deny]") ?? card)?.focus();
    }
  }, [open, focus?.place, focus?.id]);
  useEffect(() => {
    if (focusedRequest.current && !pending.some(({store, approval}) => keyOf(store.place.key, approval.id) === focusedRequest.current)) {
      const next = region.current?.querySelector<HTMLElement>("article button[data-deny]") ?? region.current?.querySelector<HTMLElement>("article") ?? toggle.current ?? document.querySelector<HTMLElement>("main");
      next?.focus();
      focusedRequest.current = undefined;
    }
  }, [pending]);
  if (!pending.length) return null;
  return <section aria-label={i18n._("Tool approvals")} className="shrink-0 border-b border-brand-300 bg-brand-50 px-3 py-2 dark:border-brand-800 dark:bg-neutral-950">
    <button ref={toggle} aria-expanded={open} aria-controls="live-approval-inbox" className="min-h-8 text-left font-medium text-brand-700 dark:text-brand-300" onClick={() => open ? hide() : show()}>{i18n._("Tool approvals ({count})", {count: pending.length})}</button>
    {open ? <div id="live-approval-inbox" ref={region} className="grid max-h-[45vh] min-w-0 gap-2 overflow-y-auto" onBlurCapture={(event) => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) focusedRequest.current = undefined; }} onFocusCapture={(event) => { const card = (event.target as HTMLElement).closest<HTMLElement>("[data-approval-id]"); focusedRequest.current = card ? keyOf(card.dataset.approvalPlace ?? "", card.dataset.approvalId ?? "") : undefined; }}>
      {pending.some((item) => !item.connected) ? <p role="status" className="text-sm">{i18n._("Reconnect to answer these requests.")}</p> : null}
      {pending.map(({store, approval, generation, connected}) => <ApprovalCard key={`${store.place.key}:${generation}:${approval.id}`} approval={approval} generation={generation} connected={connected} store={store} place={several ? placeLabel(store.place) : undefined} />)}
    </div> : null}
  </section>;
}
