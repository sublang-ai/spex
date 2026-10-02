// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { randomUUID } from "node:crypto";
import type { ApprovalDecision } from "@sublang/cligent";
import type { TmuxPlayApprovalHandler } from "@sublang/cligent/tmux-play";
import type { ApprovalAcknowledgement, ApprovalOwner, ApprovalState, PendingApproval } from "./protocol.js";
import { i18n } from "./i18n.js";
import { CoreError } from "./session.js";

interface Pending {
  value: PendingApproval;
  finish: (decision?: ApprovalDecision, error?: Error) => void;
}
const sameOwner = (a: ApprovalOwner, b: ApprovalOwner) => a.kind === b.kind && a.id === b.id;
const ACK_GRACE_MS = 30_000;
const MAX_ACKNOWLEDGEMENTS = 2048;
const cancelled = () => new DOMException(i18n._({id: "The tool approval is no longer pending.", comment: "Live tool approval refusal"}), "AbortError");

/** Preserve exactly reviewable JSON; do not silently drop getters, undefined,
 * non-finite numbers, prototypes, array holes, or cyclic custom payloads. */
function plainJson(value: unknown, ancestors = new Set<object>(), depth = 0): boolean {
  if (depth > 64) return false;
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || ancestors.has(value) || Object.getOwnPropertySymbols(value).length) return false;
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(value);
  if (array && (keys.length !== value.length || keys.some((key, index) => key !== String(index)))) return false;
  if (Object.entries(descriptors).some(([key, entry]) => (key !== "length" || !array) && (!entry.enumerable || !("value" in entry)))) return false;
  ancestors.add(value);
  const valid = keys.every((key) => plainJson(descriptors[key].value, ancestors, depth + 1));
  ancestors.delete(value);
  return valid;
}
const identity = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const plainObject = (value: unknown) => value !== null && typeof value === "object" && !Array.isArray(value);

/** Core lifetime only. Native event history deliberately cannot populate it. */
export class ApprovalBroker {
  private readonly generation = randomUUID();
  private revision = 0;
  private stopped = false;
  private readonly pending = new Map<string, Pending>();
  private readonly answered = new Map<string, {owner: ApprovalOwner; decision: ApprovalDecision; retainUntil: number}>();
  constructor(private readonly changed: (state: ApprovalState) => void) {}

  snapshot(): ApprovalState {
    return structuredClone({generation: this.generation, revision: this.revision,
      pending: [...this.pending.values()].map(({value}) => value)});
  }

  handler(owner: ApprovalOwner, describe: () => {ownerLabel: string; projectName?: string}): TmuxPlayApprovalHandler {
    return (envelope, {signal}) => {
      const now = Date.now();
      if (this.stopped || signal.aborted) return Promise.reject(cancelled());
      const {request} = envelope;
      if (!plainObject(request) || !plainJson(request) || !identity(envelope.actorId) || !identity(envelope.invocationId) ||
          !Number.isSafeInteger(envelope.turnId) || envelope.turnId < 1 ||
          ![request.id, request.agent, request.sessionId, request.toolUseId, request.toolName].every(identity) ||
          !plainObject(request.input) || (request.details !== undefined && !plainObject(request.details)) ||
          (request.reason !== undefined && typeof request.reason !== "string") ||
          !Number.isFinite(request.createdAt) || !Number.isFinite(request.expiresAt) ||
          request.createdAt < 0 || request.createdAt > request.expiresAt || request.expiresAt <= now ||
          request.kind !== "tool" || !Array.isArray(request.choices) || !request.choices.length ||
          new Set(request.choices).size !== request.choices.length ||
          request.choices.some((choice) => choice !== "allow_once" && choice !== "deny")) {
        return Promise.reject(new Error(i18n._({id: "The native tool approval is invalid or expired.", comment: "Live tool approval refusal"})));
      }
      // Inputs cross a JSON protocol. An unserializable/oversized action must
      // fail closed rather than presenting a different or incomplete action.
      const serialized = JSON.stringify(request);
      if (Buffer.byteLength(serialized) > 256 * 1024) return Promise.reject(new Error(i18n._({id: "The tool approval is too large to present safely.", comment: "Live tool approval refusal"})));
      const value: PendingApproval = {
        id: randomUUID(), owner: {...owner}, ...describe(),
        turnId: envelope.turnId, actorId: envelope.actorId, invocationId: envelope.invocationId,
        request: {...JSON.parse(serialized), expiresAt: Math.min(request.expiresAt, now + 10 * 60_000)},
      };
      return new Promise<ApprovalDecision>((resolve, reject) => {
        const finish = (decision?: ApprovalDecision, error?: Error) => {
          if (!this.pending.delete(value.id)) return;
          clearTimeout(timer);
          signal.removeEventListener("abort", abort);
          this.publish();
          if (error) reject(error);
          else resolve(decision!);
        };
        const abort = () => finish(undefined, cancelled());
        const timer = setTimeout(() => finish(undefined, new DOMException(i18n._({id: "The tool approval expired.", comment: "Live tool approval refusal"}), "TimeoutError")), value.request.expiresAt - now);
        timer.unref();
        this.pending.set(value.id, {value, finish});
        signal.addEventListener("abort", abort, {once: true});
        if (signal.aborted) abort();
        else this.publish();
      });
    };
  }

  respond(generation: string, requestId: string, owner: ApprovalOwner, decision: ApprovalDecision): ApprovalAcknowledgement {
    if (generation !== this.generation) throw new CoreError("conflict", i18n._({id: "This approval belongs to a previous core connection.", comment: "Live tool approval refusal"}));
    this.pruneAnswers();
    const answered = this.answered.get(requestId);
    if (answered) {
      if (!sameOwner(answered.owner, owner) || answered.decision !== decision) throw new CoreError("conflict", i18n._({id: "This approval has already received a different answer.", comment: "Live tool approval refusal"}));
      return {decision};
    }
    const entry = this.pending.get(requestId);
    if (!entry || !sameOwner(entry.value.owner, owner)) throw new CoreError("not_found", i18n._({id: "This tool approval is no longer pending for this conversation.", comment: "Live tool approval refusal"}));
    if (Date.now() >= entry.value.request.expiresAt) {
      entry.finish(undefined, new DOMException(i18n._({id: "The tool approval expired.", comment: "Live tool approval refusal"}), "TimeoutError"));
      throw new CoreError("conflict", i18n._({id: "This tool approval has expired.", comment: "Live tool approval refusal"}));
    }
    if (!entry.value.request.choices.includes(decision)) throw new CoreError("invalid_request", i18n._({id: "This decision was not offered by the agent.", comment: "Live tool approval refusal"}));
    this.answered.set(requestId, {owner: {...owner}, decision, retainUntil: entry.value.request.expiresAt + ACK_GRACE_MS});
    this.pruneAnswers();
    entry.finish(decision);
    return {decision};
  }

  cancel(owner: ApprovalOwner, invocationId?: string): void {
    for (const entry of this.pending.values()) {
      if (sameOwner(entry.value.owner, owner) && (invocationId === undefined || entry.value.invocationId === invocationId)) entry.finish(undefined, cancelled());
    }
  }

  stop(): void {
    this.stopped = true;
    for (const entry of this.pending.values()) entry.finish(undefined, cancelled());
  }

  private pruneAnswers(): void {
    const now = Date.now();
    for (const [id, entry] of this.answered) if (entry.retainUntil <= now) this.answered.delete(id);
    while (this.answered.size > MAX_ACKNOWLEDGEMENTS) this.answered.delete(this.answered.keys().next().value!);
  }

  private publish(): void { this.revision += 1; this.changed(this.snapshot()); }
}
