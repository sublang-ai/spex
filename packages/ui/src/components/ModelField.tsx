// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { useState } from "react";
import type { AgentModelOption } from "@sublang/spex-core/protocol";
import { findModel } from "../lib/agent-options.js";
import { i18n } from "../i18n.js";

const CUSTOM = "__spex_custom__";
const fieldClass = "w-full min-w-0 rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900";

/** A real selector prevents misspellings; explicit custom input retains
 * provider aliases and configurations missing from today's catalog. */
export function ModelField({ value, models, onChange, testId, allowDefault = true }: {
  value: string;
  models: readonly AgentModelOption[];
  onChange(value: string): void;
  testId: string;
  allowDefault?: boolean;
}) {
  const [custom, setCustom] = useState(false);
  const selected = findModel(models, value);
  const unlisted = Boolean(value) && !selected;
  const manual = custom || unlisted || models.length === 0 || (!allowDefault && !value);
  return <>
    {models.length > 0 && <select
      aria-label={i18n._({ id: "Model", comment: "the model field of an agent editor" })}
      data-testid={`${testId}-select`}
      value={manual ? CUSTOM : value}
      onChange={(event) => {
        if (event.target.value === CUSTOM) setCustom(true);
        else { setCustom(false); onChange(event.target.value); }
      }}
      className={fieldClass}
    >
      {/* A model's own name and id are the runtime's words, not ours. */}
      {allowDefault && <option value="">{i18n._({ id: "Provider default", comment: "model choice: let the provider pick its own default model" })}</option>}
      {selected && selected.id !== value && <option value={value}>{selected.name} · {value}</option>}
      {models.map((entry) => <option key={entry.id} value={entry.id}>{entry.name === entry.id ? entry.id : `${entry.name} · ${entry.id}`}</option>)}
      <option value={CUSTOM}>{i18n._({ id: "Custom model…", comment: "model choice: type a model id by hand" })}</option>
    </select>}
    {manual && <input
      aria-label={i18n._({ id: "Custom model", comment: "the hand-typed model id field" })}
      data-testid={testId}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={allowDefault ? i18n._({ id: "Provider default", comment: "model choice: let the provider pick its own default model" }) : i18n._({ id: "Model ID", comment: "placeholder of the hand-typed model id field" })}
      className={fieldClass}
    />}
    {unlisted && models.length > 0 && <span className="text-xs text-neutral-500">{i18n._("Not in this runtime's list. Check the model ID.")}</span>}
  </>;
}
