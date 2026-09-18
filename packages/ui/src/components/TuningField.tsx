// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The one tri-state tuning control (DR-032): inherit what the tier
// below resolves, take the provider's current default, or pin a value.
// The role-binding editor inherits a player; a session's own tuning
// inherits the configured value (DR-067). One grammar, two homes.

import type { AgentModelOption } from "@sublang/spex-core/protocol";

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
  efforts,
  additionalEfforts,
  testIdPrefix = "binding",
}: {
  label: "model" | "effort";
  models?: readonly AgentModelOption[];
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
  const mode = value === undefined ? "inherit" : value === false ? "provider" : "pin";
  // `label` names the field it edits and keys its test ids; what the
  // reader reads is the word for that field.
  const fieldWord =
    label === "model"
      ? i18n._({ id: "model", comment: "the model field of a tuning editor" })
      : i18n._({ id: "effort", comment: "the reasoning-effort field of a tuning editor" });
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-neutral-500 dark:text-neutral-400">{fieldWord}</span>
      <select
        data-testid={`${testIdPrefix}-${label}-mode`}
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
          {inheritLabel}{playerDefault ? ` (${playerDefault})` : ""}
        </option>
        <option value="provider">{i18n._({ id: "the provider's default", comment: "tuning choice: take the provider's own current default" })}</option>
        <option value="pin">{i18n._({ id: "pin a value…", comment: "tuning choice: set an explicit value here" })}</option>
      </select>
      {mode === "pin" && (label === "model" ? (
        <ModelField value={typeof value === "string" ? value : ""} models={models ?? []}
          onChange={onChange} allowDefault={false} testId={`${testIdPrefix}-model-value`} />
      ) : (
        <select data-testid={`${testIdPrefix}-effort-value`} value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          className="rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900">
          {/* An effort key is the adapter's wire word; only what stands
              beside it is ours. */}
          <option value="">{i18n._({ id: "Choose effort…", comment: "empty choice of the reasoning-effort select" })}</option>
          {typeof value === "string" && value && !efforts?.includes(value) && <option value={value}>{i18n._("{effort} (current)", { effort: value })}</option>}
          {(efforts ?? []).map((effort) => <option key={effort} value={effort}>{additionalEfforts?.includes(effort) ? i18n._("{effort} (adapter-wide)", { effort }) : effort}</option>)}
        </select>
      ))}
    </label>
  );
}
