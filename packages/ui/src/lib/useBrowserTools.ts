// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { useEffect, useRef, useState } from "react";
import type { AgentSummary, CommandResults, MediaUploadOwner } from "@sublang/spex-core/protocol";
import { getClient, useAppStore } from "../state/store.js";
import { i18n } from "../i18n.js";
import { subscribeBrowserProgress } from "./browser-progress.js";
import type { BrowserControlProps } from "../components/BrowserControl.js";

type AgentCapabilities = CommandResults["agent.capabilities"];
type Preparation = BrowserControlProps["preparation"];

/** Contextual facts belong to the core, never adapter-name heuristics in
 * the renderer. Preparing grants no tools and does not write a choice. */
export function useBrowserTools(agent: AgentSummary, context?: MediaUploadOwner) {
  const connection = useAppStore((state) => state.connection);
  const [attempt, setAttempt] = useState(0);
  // A checkbox's value does not affect hypothetical browser admission.
  const { browser: _browser, ...settings } = agent;
  const key = JSON.stringify({ agent: settings, context });
  const [capability, setCapability] = useState<{ key: string; value: AgentCapabilities }>();
  const [failure, setFailure] = useState<{ key: string; message: string }>();
  const [setup, setSetup] = useState<{ key: string; value: Preparation }>();
  const operation = useRef<{ id: string; release(): void } | undefined>(undefined);
  const currentKey = useRef(key);
  currentKey.current = key;

  function stop(): void {
    const active = operation.current;
    if (!active) return;
    operation.current = undefined;
    active.release();
    // Closing an editor must still work after the socket has closed. The
    // host also owns disconnect cancellation; no rejected promise escapes.
    try { void getClient().command("browser.cancel", { operationId: active.id }).catch(() => {}); } catch { /* disconnected */ }
  }

  useEffect(() => {
    let active = true;
    setCapability(undefined);
    setFailure(undefined);
    setSetup(undefined);
    const request = JSON.parse(key) as {agent: AgentSummary; context?: MediaUploadOwner};
    void (async () => {
      try {
        const result = await getClient().command("agent.capabilities", request);
        if (active) setCapability({ key, value: result });
      } catch (cause) {
        if (active) setFailure({ key, message: cause instanceof Error ? cause.message : String(cause) });
      }
    })();
    return () => { active = false; stop(); };
  }, [key, connection, attempt]);

  const facts = capability?.key === key ? capability.value : undefined;
  const fact = facts?.browser;
  const error = failure?.key === key ? failure.message : undefined;
  const supported = fact?.status === "supported";
  const preparation = setup?.key === key ? setup.value : { status: "idle" as const };

  async function prepare(): Promise<void> {
    if (!supported || operation.current) return;
    const request = JSON.parse(key) as {agent: AgentSummary; context?: MediaUploadOwner};
    const id = crypto.randomUUID();
    const release = subscribeBrowserProgress(id, ({ stage }) => {
      if (operation.current?.id !== id || currentKey.current !== key) return;
      setSetup({ key, value: { status: "preparing", detail: stage === "installing"
        ? i18n._("Installing browser…") : stage === "launching"
          ? i18n._("Checking browser launch and screenshot…") : i18n._("Checking browser runtime…") } });
    });
    operation.current = { id, release };
    setSetup({ key, value: { status: "preparing" } });
    try {
      // Cligent bounds setup on the host. The generic 30-second command
      // timeout must not falsely fail a legitimate Chromium download.
      const result = await getClient().command("browser.prepare", { ...request, operationId: id }, { timeoutMs: 0 });
      if (operation.current?.id !== id || currentKey.current !== key) return;
      setSetup({ key, value: result.status === "ready" ? { status: "ready" }
        : result.status === "cancelled" ? { status: "idle", detail: i18n._("Browser setup cancelled") }
          : { status: "failed", detail: result.message } });
    } catch (cause) {
      if (operation.current?.id === id && currentKey.current === key) {
        setSetup({ key, value: { status: "failed", detail: cause instanceof Error ? cause.message : String(cause) } });
      }
    } finally {
      release();
      if (operation.current?.id === id) operation.current = undefined;
    }
  }

  async function cancel(): Promise<void> {
    const active = operation.current;
    if (!active) return;
    setSetup({ key, value: { status: "preparing", detail: i18n._("Cancelling browser setup…") } });
    try {
      const result = await getClient().command("browser.cancel", { operationId: active.id });
      if (result.canceled && operation.current?.id === active.id) {
        operation.current = undefined;
        active.release();
        setSetup({ key, value: { status: "idle", detail: i18n._("Browser setup cancelled") } });
      }
    } catch (cause) {
      if (operation.current?.id === active.id) {
        setSetup({ key, value: { status: "preparing", detail: cause instanceof Error ? cause.message : String(cause) } });
      }
    }
  }

  return {
    supported,
    approvalNote: facts?.approvals?.status === "unsupported"
      ? i18n._("This agent cannot ask for tool approval in this conversation.")
      : facts?.approvals?.status === "supported" ? i18n._("Tool requests can ask for approval; existing agent policies still apply.")
        : i18n._("Tool approval support is unverified."),
    outputNote: facts?.media?.sources.length === 0
      ? i18n._("This agent cannot return screenshot files to this conversation.") : undefined,
    unsupportedReason: error ?? (fact && fact.status !== "supported" ? fact.message ?? i18n._("Browser support is unverified") : undefined)
      ?? i18n._("Checking browser support…"),
    preparation,
    capabilityError: error,
    refresh: () => setAttempt((value) => value + 1),
    prepare: () => { void prepare(); },
    cancel: () => { void cancel(); },
  };
}
