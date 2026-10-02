// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { useRef, useState, type RefObject } from "react";
import type { AgentSummary, MediaUploadOwner } from "@sublang/spex-core/protocol";
import { i18n } from "../i18n.js";
import { useBrowserTools } from "../lib/useBrowserTools.js";
import { usePopover } from "../lib/usePopover.js";
import { useFitInBox } from "../lib/popover-fit.js";
import { BrowserControl } from "./BrowserControl.js";

type Props = { agent: AgentSummary; context: MediaUploadOwner; disabled?: boolean };

function PreparationPopover({ agent, context, anchorRef, onClose }: Props & {
  anchorRef: RefObject<HTMLButtonElement | null>; onClose(): void;
}) {
  const tools = useBrowserTools(agent, context);
  const boxRef = usePopover<HTMLDivElement>(true, { anchorRef, onClose });
  useFitInBox(boxRef);
  return <div ref={boxRef} role="dialog" aria-label={i18n._("Browser setup")}
    className="absolute left-0 top-full z-20 mt-1 flex max-h-[min(24rem,calc(100vh-4rem))] w-72 max-w-[calc(100vw-1rem)] flex-col gap-2 overflow-y-auto rounded-lg border border-neutral-300 bg-white p-2 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
    <BrowserControl enabled={agent.browser ?? false} supported={tools.supported}
      unsupportedReason={tools.unsupportedReason} outputNote={tools.outputNote} approvalNote={tools.approvalNote} preparation={tools.preparation}
      choiceDisabled inherited onChange={() => {}} onPrepare={tools.prepare} onCancel={tools.cancel} />
    <p className="text-xs text-neutral-500">{i18n._("Browser access follows the selected agent in Settings")}</p>
    {tools.capabilityError && <button type="button" onClick={tools.refresh} className="self-start text-xs underline">{i18n._("Retry browser support check")}</button>}
  </div>;
}

/** Authoring selects an existing configured agent. Preparation belongs
 * here; changing that shared agent still requires an explicit Settings save. */
export function ConfiguredBrowserTools(props: Props) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  return <span className="relative min-w-0">
    <button ref={anchorRef} type="button" data-testid="draft-browser" aria-haspopup="dialog"
      aria-expanded={open} disabled={props.disabled} onClick={() => setOpen((value) => !value)}
      className="min-h-6 rounded px-1.5 py-0.5 text-xs text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 dark:text-neutral-300 dark:hover:bg-neutral-800">
      {i18n._("Browser")}
    </button>
    {open && <PreparationPopover {...props} anchorRef={anchorRef} onClose={() => setOpen(false)} />}
  </span>;
}
