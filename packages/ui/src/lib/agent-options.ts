// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { useEffect, useState } from "react";
import type { AdapterName, AgentModelOption, AgentOptions } from "@sublang/spex-core/protocol";
import { i18n } from "../i18n.js";
import { useAppStore } from "../state/store.js";

/** Discovery belongs to an open editor, never application startup. */
export function useAgentOptions(adapter: AdapterName) {
  const load = useAppStore((state) => state.loadAgentOptions);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ adapter: AdapterName; attempt: number; options?: AgentOptions; error?: string }>();
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => load(adapter)).then(
      (options) => { if (active) setResult({ adapter, attempt, options }); },
      (cause: unknown) => { if (active) setResult({ adapter, attempt, error: cause instanceof Error ? cause.message : String(cause) }); },
    );
    return () => { active = false; };
  }, [adapter, attempt, load]);
  const current = result?.adapter === adapter && result.attempt === attempt ? result : undefined;
  return {
    options: current?.options,
    loading: !current,
    error: current?.error,
    refresh: () => setAttempt((value) => value + 1),
  };
}

export function findModel(models: readonly AgentModelOption[], model: string) {
  return models.find((entry) => entry.id === model)
    ?? models.find((entry) => entry.resolvedModel === model);
}

/** How a model value reads: a name, and the specific model the runtime
 * reports behind it where that differs from the name. Both are the
 * runtime's words, never translated (settings-38, DR-091). */
export interface ModelDisplay {
  name: string;
  specific?: string;
}

/** The specific model a catalog row stands for: its resolved model when
 * the id is an alias of it — differing from it and not beginning with
 * it — else the id when it says more than the name, else nothing. */
function specificModel(row: AgentModelOption, name: string): string | undefined {
  const resolved = row.resolvedModel;
  if (resolved && resolved !== row.id && !row.id.startsWith(resolved)) return resolved;
  if (row.id.toLowerCase() !== name.toLowerCase()) return row.id;
  return undefined;
}

/** The one display rule (settings-38): a value that is a row's id reads
 * as the row's name then its specific model; a value matching only a
 * row's resolution — a canonical pin, recognized without rewriting
 * (DR-052) — and a value no row lists both read as themselves. */
export function modelDisplay(models: readonly AgentModelOption[], value: string): ModelDisplay {
  const row = models.find((entry) => entry.id === value);
  if (!row) return { name: value };
  // A row the runtime left unnamed is named by its id: nothing reads blank.
  const name = row.name.trim() ? row.name : row.id;
  const specific = specificModel(row, name);
  return specific === undefined ? { name } : { name, specific };
}

/** The display in one line of text: the name and the specific model
 * joined by " · ", as a title, an option label or an inherited value
 * reads it. */
export function modelDisplayText(display: ModelDisplay): string {
  return display.specific === undefined ? display.name : `${display.name} · ${display.specific}`;
}

/** The words for the empty value — a model's, and an inherited
 * effort's — read on each render, never at module load, so they follow
 * the reader's language (localization-4). */
export function providerDefaultLabel(): string {
  return i18n._({ id: "Provider default", comment: "a model or effort left to the provider's own default" });
}

/** How the empty value reads under the same rule (settings-38): the
 * provider-default words, then the model the runtime runs by default,
 * itself read by the rule, where the runtime reports one — alike in the
 * model field and wherever an editor inherits it. */
export function providerDefaultDisplay(models: readonly AgentModelOption[], defaultModel: string | undefined): ModelDisplay {
  const name = providerDefaultLabel();
  return defaultModel ? { name, specific: modelDisplayText(modelDisplay(models, defaultModel)) } : { name };
}

export function modelTuning(options: AgentOptions | undefined, model: string) {
  // A reply without a discovery report narrows nothing rather than
  // throwing: discovery informs an editor, it never gates one (DR-052).
  const available = options?.discovery?.status === "available" ? options.discovery : undefined;
  const selected = available ? findModel(available.models ?? [], model) : undefined;
  const efforts = selected?.effortValues ?? options?.effortValues ?? [];
  const additionalEfforts = (available?.unreportedEffortValues ?? []).filter((effort) => !efforts.includes(effort));
  return {
    efforts: [...new Set([...efforts, ...additionalEfforts])],
    additionalEfforts,
    effortKnown: selected?.effortValues !== undefined,
    fastModeSupported: selected?.fastModeSupported ?? options?.fastModeSupported,
    fastModeKnown: selected?.fastModeSupported !== undefined,
    /** Whether the adapter serves a subagent model — the adapter's, never
     * a model's (DR-093). */
    subagentModelSupported: options?.subagentModelSupported,
  };
}
