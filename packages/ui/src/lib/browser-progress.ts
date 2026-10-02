// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import type { BrowserProgressMessage } from "@sublang/spex-core/protocol";

// Only the mounted owner of an operation receives its progress. Completed
// operations leave no persistent setup facts that another host could inherit.
const listeners = new Map<string, (progress: BrowserProgressMessage["progress"]) => void>();

export function subscribeBrowserProgress(operationId: string, listener: (progress: BrowserProgressMessage["progress"]) => void): () => void {
  listeners.set(operationId, listener);
  return () => { listeners.delete(operationId); };
}

export function deliverBrowserProgress(message: BrowserProgressMessage): void {
  listeners.get(message.operationId)?.(message.progress);
}
