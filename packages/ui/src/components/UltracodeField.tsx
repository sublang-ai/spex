// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { i18n } from "../i18n.js";
import { providerDefaultLabel } from "../lib/agent-options.js";

/** Omission inherits the setting. Both booleans are deliberate choices. */
export function UltracodeField({ supported, value, inherited, source, disabled, resetOnly, invalid, onChange, testId }: {
  supported?: boolean;
  invalid: boolean;
  value?: boolean;
  inherited?: boolean;
  source: "provider" | "player" | "settings";
  disabled?: boolean;
  resetOnly?: boolean;
  onChange(value: boolean | undefined): void;
  testId: string;
}) {
  if (!supported && value === undefined && inherited !== true) return null;
  const on = i18n._("On");
  const off = i18n._("Off");
  const inherit = source === "provider" ? providerDefaultLabel()
    : source === "player" ? i18n._("inherit the player") : i18n._("from Settings");
  const defaultLabel = inherited === undefined ? inherit : i18n._("{choice} ({value})", {
    choice: inherit, value: inherited ? on : off,
  });
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-neutral-500 dark:text-neutral-400">{i18n._("Ultracode")}</span>
      <select data-testid={testId} disabled={disabled}
        value={value === undefined ? "inherit" : value ? "on" : "off"}
        onChange={(event) => onChange(event.target.value === "inherit" ? undefined : event.target.value === "on")}
        className="rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900">
        <option value="inherit">{defaultLabel}</option>
        {(supported || value === true) && <option value="on">{supported === false ? i18n._("On (unsupported)") : on}</option>}
        {(!resetOnly || value === false) && <option value="off">{resetOnly ? i18n._("Off (unsupported)") : off}</option>}
      </select>
      {invalid && <span role="alert" className="text-red-600">{i18n._("Ultracode is unavailable for this selection.")}</span>}
    </label>
  );
}
