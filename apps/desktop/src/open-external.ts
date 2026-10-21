// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The open-URL bridge's rule (app-shell-20, app-shell-37, DR-127): the
// main process opens a URL in the system browser only when it lies at
// the origin of an instance the home lists or is signing in to — over
// `https`, or over `http` where both are this device's loopback, as a
// stand-in instance for tests and journeys is — and carries no
// credential. Anything else is refused and opens nothing.

/** Loopback host names as `URL` spells them. */
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

function parse(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function transportAllowed(url: URL): boolean {
  return url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK.has(url.hostname));
}

/** The URL to open, normalized, or null when the request is not a URL
 * at one of `origins` — the instances the core lists and the one it is
 * signing in to. */
export function resolveInstanceUrl(origins: readonly string[], requested: unknown): string | null {
  if (typeof requested !== "string") return null;
  const target = parse(requested.trim());
  if (!target || !transportAllowed(target)) return null;
  // A credential in the URL is never handed on (DR-064).
  if (target.username !== "" || target.password !== "") return null;
  const listed = origins.some((origin) => {
    const instance = typeof origin === "string" ? parse(origin) : null;
    return instance !== null && transportAllowed(instance) && instance.origin === target.origin;
  });
  return listed ? target.href : null;
}

/** The open channel's answer: `open` hands an allowed URL to the system
 * browser and the answer is true; a refused URL calls nothing, and it
 * and a URL the OS fails to open answer false, so the page shows it as
 * a link instead. */
export async function openInstanceUrl(
  origins: readonly string[],
  requested: unknown,
  open: (url: string) => Promise<void>,
): Promise<boolean> {
  const target = resolveInstanceUrl(origins, requested);
  if (target === null) return false;
  try {
    await open(target);
    return true;
  } catch {
    return false;
  }
}
