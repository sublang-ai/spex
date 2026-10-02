// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { useId } from "react";

import { i18n } from "../i18n.js";

/** Presentation state from the host-facing owner; no runtime or protocol
 * discovery is performed in this component (settings-42). */
export interface BrowserControlProps {
  enabled: boolean;
  supported: boolean;
  unsupportedReason?: string;
  /** Known host transport limitation; omission leaves output support unknown. */
  outputNote?: string;
  approvalNote?: string;
  preparation: {
    status: "idle" | "preparing" | "ready" | "failed";
    /** Host-authored, already localized progress, diagnostic or repair. */
    detail?: string;
  };
  /** Omit for shared defaults; true inherits, false overrides them. */
  inherited?: boolean;
  disabled?: boolean;
  /** Read the configured choice while allowing a separate host check. */
  choiceDisabled?: boolean;
  onChange(enabled: boolean): void;
  onPrepare(): void;
  onCancel?(): void;
  onReset?(): void;
}

const ACTION_CLASS =
  "min-h-6 rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800";

export function BrowserControl({
  enabled,
  supported,
  unsupportedReason,
  outputNote,
  approvalNote,
  preparation,
  inherited,
  disabled,
  choiceDisabled,
  onChange,
  onPrepare,
  onCancel,
  onReset,
}: BrowserControlProps) {
  const descriptionId = useId();
  const detailId = useId();
  const status = preparation.status === "preparing"
    ? i18n._("Preparing browser…")
    : preparation.status === "ready"
      ? i18n._("Browser ready")
      : preparation.status === "failed"
        ? i18n._("Browser setup failed")
        : i18n._("Browser not prepared");
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-md border border-neutral-200 p-2 dark:border-neutral-700">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <label className="inline-flex min-h-6 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            disabled={disabled || choiceDisabled || (!supported && !enabled)}
            aria-describedby={`${descriptionId} ${detailId}`}
            onChange={(event) => {
              if (!disabled && !choiceDisabled && (supported || !event.target.checked)) onChange(event.target.checked);
            }}
          />
          {i18n._("Browser")}
        </label>
        {inherited !== undefined ? (
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {inherited ? i18n._("From Settings") : i18n._("Changed for this conversation")}
          </span>
        ) : null}
      </div>
      <p id={descriptionId} className="text-xs text-neutral-500 dark:text-neutral-400">
        {i18n._("Isolated browser on the computer running this session")}
      </p>
      {approvalNote ? <p className="text-xs text-neutral-500 dark:text-neutral-400">{approvalNote}</p> : null}
      {outputNote ? <p className="text-xs text-neutral-500 [overflow-wrap:anywhere] dark:text-neutral-400">{outputNote}</p> : null}
      <div id={detailId} role="status" aria-live="polite" className="text-xs [overflow-wrap:anywhere]">
        {supported ? (
          <>
            <p className={preparation.status === "failed" ? "text-red-600 dark:text-red-400" : "text-neutral-500 dark:text-neutral-400"}>{status}</p>
            {preparation.detail ? <p className="mt-0.5 text-neutral-600 dark:text-neutral-300">{preparation.detail}</p> : null}
          </>
        ) : (
          <p className="text-neutral-500 dark:text-neutral-400">{unsupportedReason ?? i18n._("This agent does not support browser tools")}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {supported && preparation.status !== "preparing" ? (
          <button type="button" disabled={disabled} onClick={onPrepare} className={ACTION_CLASS}>
            {preparation.status === "ready" ? i18n._("Check browser") : preparation.status === "failed" ? i18n._("Retry browser setup") : i18n._("Set up browser")}
          </button>
        ) : supported && onCancel ? (
          <button type="button" disabled={disabled} onClick={onCancel} className={ACTION_CLASS}>{i18n._("Cancel browser setup")}</button>
        ) : null}
        {inherited === false && onReset ? (
          <button type="button" disabled={disabled} onClick={onReset} className={ACTION_CLASS}>{i18n._("Use browser setting from Settings")}</button>
        ) : null}
      </div>
    </div>
  );
}
