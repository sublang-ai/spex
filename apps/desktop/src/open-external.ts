// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The open-URL bridge's rule (app-shell-20, app-shell-37, DR-103): the
// main process opens a URL in the system browser only when it lies at
// the Git host the home records — its origin, under its path — over
// `https`, or over `http` where both are this device's loopback, as a
// stand-in host for tests and journeys is. Anything else is refused.

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
 * at the recorded host. */
export function resolveHostUrl(hostUrl: string | null | undefined, requested: unknown): string | null {
  if (typeof hostUrl !== "string" || typeof requested !== "string") return null;
  const host = parse(hostUrl);
  const target = parse(requested.trim());
  if (!host || !target) return null;
  if (!transportAllowed(host) || !transportAllowed(target)) return null;
  // A credential in the URL is never handed on (DR-064).
  if (target.username !== "" || target.password !== "") return null;
  if (target.origin !== host.origin) return null;
  const base = host.pathname.replace(/\/+$/, "");
  if (base !== "" && target.pathname !== base && !target.pathname.startsWith(`${base}/`)) return null;
  return target.href;
}
