// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import type { useAgentOptions } from "../lib/agent-options.js";
import { i18n } from "../i18n.js";

export function ModelDiscoveryStatus({ state }: { state: ReturnType<typeof useAgentOptions> }) {
  const reason = state.error ?? (state.options?.discovery.status === "unavailable" ? state.options.discovery.reason : undefined);
  return <div className="flex flex-wrap items-center gap-1 text-xs text-neutral-500" role="status">
    {/* The runtime's own words for why it could not list its models
        are data the line quotes, never a text of ours. */}
    <span>{state.loading ? i18n._("Loading model options…") : reason ? i18n._("Model list unavailable: {reason}", { reason }) : i18n._("Models reported by the installed runtime.")}</span>
    <button type="button" disabled={state.loading} onClick={state.refresh} className="underline disabled:opacity-40">{i18n._("Refresh models")}</button>
  </div>;
}
