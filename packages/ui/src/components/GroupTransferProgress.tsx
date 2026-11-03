// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { useId } from "react";
import { i18n } from "../i18n.js";
import { projectName } from "../lib/space.js";
import { usePlaceStore } from "../state/place-context.js";
import { dismissSharedOpen, retrySharedOpen, type SharedOpen } from "../state/server-opens.js";
import { Icon } from "./Icon.js";
import { PanelCloseButton } from "./PanelCloseButton.js";
import { SECONDARY } from "./SpaceSurface.js";

/** One requested Add continuing to its server; each check reflects an
 * observed result, rather than command acceptance (DR-215). */
export function GroupTransferProgress({ transfer, onDismiss }: { transfer: SharedOpen; onDismiss?: () => void }) {
  const store = usePlaceStore();
  const connected = store((state) => state.connection === "open");
  const titleId = useId();
  const name = transfer.folder?.split(/[\\/]/).filter(Boolean).at(-1)
    ?? projectName(transfer.repository.split("/").at(-1) ?? transfer.repository);
  const stages = ["adding", "syncing", "connecting", "opening"];
  const current = transfer.stage === "done" ? stages.length : stages.indexOf(transfer.failedAt ?? transfer.stage);
  const labels = [
    i18n._("Add to {group}", { group: transfer.groupName ?? transfer.group }),
    i18n._("Upload records"),
    i18n._("Connect to {server}", { server: transfer.server.name }),
    i18n._("Open project"),
  ];
  const finished = transfer.stage === "done" || transfer.stage === "failed";

  return (
    <section data-testid="group-transfer-progress" aria-labelledby={titleId}
      className="ml-6 mt-2 flex min-w-0 max-w-xl flex-col gap-2 pb-2 text-sm">
      <header className="flex min-w-0 items-start justify-between gap-3">
        <h4 id={titleId} className="min-w-0 break-words font-medium">
          {transfer.stage === "done"
            ? i18n._("{name} is ready on {server}", { name, server: transfer.server.name })
            : i18n._("Opening {name} on {server}", { name, server: transfer.server.name })}
        </h4>
        {finished ? <PanelCloseButton onClick={() => { dismissSharedOpen(transfer.key); onDismiss?.(); }} /> : null}
      </header>
      <ol className="space-y-1 text-xs" aria-live="polite" aria-atomic="true">
        {labels.map((label, index) => {
          const state = index < current ? "complete"
            : index === current ? (transfer.stage === "failed" ? "failed" : "current") : "pending";
          return (
            <li key={index} data-state={state} className={`flex min-w-0 items-center gap-2 ${state === "failed"
              ? "text-red-600 dark:text-red-400"
              : state === "current" ? "text-neutral-900 dark:text-neutral-100" : "text-neutral-500 dark:text-neutral-400"}`}>
              <span aria-hidden className="flex h-4 w-4 shrink-0 items-center justify-center">
                {state === "complete" ? <Icon name="check" />
                  : state === "current" ? <Icon name="refresh" className="animate-spin motion-reduce:animate-none" />
                    : state === "failed" ? <Icon name="alert" />
                      : <span className="h-2 w-2 rounded-full border border-current" />}
              </span>
              <span className="min-w-0 break-words">{label}</span>
              <span className="sr-only">{state === "complete" ? i18n._("Completed")
                : state === "current" ? i18n._("In progress")
                  : state === "failed" ? i18n._("Failed") : i18n._("Waiting")}</span>
            </li>
          );
        })}
      </ol>
      {transfer.stage === "failed" ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p role="alert" className="min-w-0 break-words text-xs text-red-600 dark:text-red-400">{transfer.error}</p>
          <button type="button" className={SECONDARY} disabled={!connected}
            onClick={() => void retrySharedOpen(store, transfer.key)}>{i18n._("Try again")}</button>
        </div>
      ) : null}
    </section>
  );
}
