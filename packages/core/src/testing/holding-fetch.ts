// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import type { StoredCredential } from "../git-host.js";

/**
 * A fetch whose answers matching a hold are kept from the client until
 * released, the host having already acted on each request: an answer
 * that comes back after the stored pair changed (storage-19). A held
 * answer's body is buffered first, so once released the client finishes
 * with it within one turn of the event loop (`settled`). Waits are
 * bounded; nothing of a body is logged.
 */
export function holdingFetch(inner: typeof fetch = fetch) {
  let gate: { match: (path: string, status: number) => boolean; reached: () => void; open: Promise<void> } | null = null;
  const held: typeof fetch = async (input, init) => {
    const response = await inner(input, init);
    const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
    const current = gate;
    if (!current || !current.match(path, response.status)) return response;
    const body = await response.arrayBuffer();
    current.reached();
    await current.open;
    return new Response(body.byteLength > 0 ? body : null, { status: response.status, statusText: response.statusText, headers: response.headers });
  };
  return {
    fetch: held,
    /** Hold every matching answer until `release`; `reached` settles
     * once the first is held, or fails after 15 seconds. */
    hold(match: (path: string, status: number) => boolean): { reached: Promise<void>; release: () => void } {
      let reached!: () => void;
      let open!: () => void;
      const arrived = new Promise<void>((resolve) => { reached = resolve; });
      gate = { match, reached, open: new Promise<void>((resolve) => { open = resolve; }) };
      let timer: NodeJS.Timeout | undefined;
      const bounded = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("no answer was held")), 15_000); });
      return {
        reached: Promise.race([arrived, bounded]).finally(() => clearTimeout(timer)),
        release: () => {
          gate = null;
          open();
        },
      };
    },
  };
}

/** One turn of the event loop: what a released answer set going has ended. */
export function settled(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** Whether two pairs are one, compared without printing either. */
export function samePair(a: StoredCredential | null, b: StoredCredential | null): boolean {
  if (a === null || b === null) return a === b;
  return a.access === b.access && a.accessExpiresAt === b.accessExpiresAt && a.refresh === b.refresh;
}
