// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The one tri-state tuning control (DR-032): inherit what the tier
// below resolves, take the provider's current default, or pin a value.
// The role-binding editor inherits a player; a session's own tuning
// inherits the configured value (DR-067). One grammar, two homes; the
// subagent model takes it as the model does (DR-093).

import { useId } from "react";
import type { AgentModelOption } from "@sublang/spex-core/protocol";

import {
  modelDisplay,
  modelDisplayText,
  providerDefaultDisplay,
  providerDefaultLabel,
} from "../lib/agent-options.js";
import { i18n } from "../i18n.js";
import { ModelField } from "./ModelField.js";

/** A tuning field is tri-state: inherit, take the provider's current
 * default, or pin a value (DR-032). */
export function TuningField({
  label,
  value,
  playerDefault,
  inheritLabel = i18n._({
    id: "inherit the player",
    comment: "tuning choice: take whatever the player lane resolves",
  }),
  onChange,
  models,
  defaultModel,
  efforts,
  additionalEfforts,
  testIdPrefix = "binding",
}: {
  label: "model" | "subagent model" | "effort";
  models?: readonly AgentModelOption[];
  /** The model the runtime runs when none is configured, where it
   * reported one (settings-35). */
  defaultModel?: string;
  efforts?: readonly string[];
  additionalEfforts?: readonly string[];
  value: string | false | undefined;
  playerDefault: string | undefined;
  /** What inheriting means here, named so the reader can see what they
   * are departing from before they depart from it. */
  inheritLabel?: string;
  onChange(next: string | false | null): void;
  testIdPrefix?: string;
}) {
  const labelId = useId();
  const mode = value === undefined ? "inherit" : value === false ? "provider" : "pin";
  // A model's list serves both model fields; the test ids key on the
  // field, hyphenated.
  const picksModel = label !== "effort";
  const key = label.replace(" ", "-");
  // `label` names the field it edits and keys its test ids; what the
  // reader reads is the word for that field.
  const fieldWord =
    label === "model"
      ? i18n._({ id: "model", comment: "the model field of a tuning editor" })
      : label === "subagent model"
        ? i18n._({ id: "subagent model", comment: "the tuning editor's field for the model an agent's subagents run on" })
        : i18n._({ id: "effort", comment: "the reasoning-effort field of a tuning editor" });
  // An inherited model is named by the one display rule, so the value
  // the reader departs from reads as the model the runtime runs — one
  // left unset as the provider's default, with the model it runs by
  // default where the runtime reports one, as the model field reads it
  // (settings-38, DR-091); an effort is its adapter's own word, and one
  // left unset takes the same provider-default words, so no inherit
  // choice reads bare (run-view-138, DR-067).
  // A subagent model left unset follows the runtime's own order, which
  // names no one model, so it reads as the provider-default words alone.
  const inherited = label === "model"
    ? modelDisplayText(playerDefault === undefined
      ? providerDefaultDisplay(models ?? [], defaultModel)
      : modelDisplay(models ?? [], playerDefault))
    : label === "subagent model" && playerDefault !== undefined
      ? modelDisplayText(modelDisplay(models ?? [], playerDefault))
      : playerDefault ?? providerDefaultLabel();
  return (
    // Not a <label>: the model field's list sits inside it, and a label
    // would pass every press on the list to the field's first control.
    <div className="flex flex-col gap-1 text-xs">
      <span id={labelId} className="text-neutral-500 dark:text-neutral-400">{fieldWord}</span>
      <select
        data-testid={`${testIdPrefix}-${key}-mode`}
        aria-labelledby={labelId}
        value={mode}
        onChange={(event) => {
          const next = event.target.value;
          if (next === "inherit") onChange(null);
          else if (next === "provider") onChange(false);
          else onChange(playerDefault ?? "");
        }}
        className="rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
      >
        <option value="inherit">
          {/* The value in its brackets is a catalog message, so each
              language sets them as its own text does. */}
          {inherited
            ? i18n._({
                id: "{choice} ({value})",
                comment: "an inherit choice, then the value it inherits: a model, an effort, or the provider-default words",
                values: { choice: inheritLabel, value: inherited },
              })
            : inheritLabel}
        </option>
        <option value="provider">{i18n._({ id: "the provider's default", comment: "tuning choice: take the provider's own current default" })}</option>
        <option value="pin">{i18n._({ id: "pin a value…", comment: "tuning choice: set an explicit value here" })}</option>
      </select>
      {mode === "pin" && (picksModel ? (
        <ModelField value={typeof value === "string" ? value : ""} models={models ?? []}
          onChange={onChange} allowDefault={false} labelId={labelId} testId={`${testIdPrefix}-${key}-value`} />
      ) : (
        <select data-testid={`${testIdPrefix}-effort-value`} aria-labelledby={labelId} value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          className="rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900">
          {/* An effort key is the adapter's wire word; only what stands
              beside it is ours. */}
          <option value="">{i18n._({ id: "Choose effort…", comment: "empty choice of the reasoning-effort select" })}</option>
          {typeof value === "string" && value && !efforts?.includes(value) && <option value={value}>{i18n._("{effort} (current)", { effort: value })}</option>}
          {(efforts ?? []).map((effort) => <option key={effort} value={effort}>{additionalEfforts?.includes(effort) ? i18n._("{effort} (adapter-wide)", { effort }) : effort}</option>)}
        </select>
      ))}
    </div>
  );
}
