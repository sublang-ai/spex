// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Instances by their origin (DR-127): an instance is recorded by its
// origin — the scheme, the host in lowercase, and the port where it is
// not the scheme's default — so one instance never stands twice under
// two spellings, and every spex repository at it lies under its folder,
// `@<host>` with `_<port>` where the origin names a port or its scheme
// is `http`. A folder names no scheme, so it is never read back into an
// origin: a clone's instance is the listed instance whose folder its key
// begins with. This module composes no reader-facing prose: a refusal
// carries its reason, which the core phrases where it speaks.

/** The instance a new home records unless `SPEX_HOST_URL` names another
 * (git-host-1). */
export const DEFAULT_HOST_URL = "https://spex.pub";

/** An instance's folder under `workspace/`: `@`, the host in lowercase
 * as a key segment spells it, and `_<port>` where the origin names one
 * or its scheme is `http`. */
export const INSTANCE_FOLDER_PATTERN = /^@[a-z0-9.-]+(?:_[0-9]+)?$/;

const HOST = /^[a-z0-9.-]+$/;
const LOOPBACK_V4 = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/** Why a URL stands as no instance's origin:
 * - `invalid`: it does not parse as a URL;
 * - `scheme`: its scheme is neither `http` nor `https`;
 * - `user`: it carries a user or a password;
 * - `path`: it names a path other than `/`;
 * - `query`: it carries a query, even an empty one;
 * - `fragment`: it carries a fragment, even an empty one;
 * - `host`: its host holds `_` or a character outside `[a-z0-9.-]`, as
 *   an IPv6 literal does;
 * - `insecure`: it is `http` on a host that is not loopback —
 *   `localhost` or an address in 127.0.0.0/8. */
export type OriginRefusal = "invalid" | "scheme" | "user" | "path" | "query" | "fragment" | "host" | "insecure";

const REFUSALS: Record<OriginRefusal, string> = {
  invalid: "not a URL",
  scheme: "the scheme is neither http nor https",
  user: "the URL carries a user or a password",
  path: "the URL names a path",
  query: "the URL carries a query",
  fragment: "the URL carries a fragment",
  host: "the host holds a character outside [a-z0-9.-]",
  insecure: "http on a host that is not loopback",
};

/** A URL refused as an instance's origin, with its reason. The message
 * never repeats the URL, which may carry a secret in its user info. */
export class OriginRefused extends Error {
  readonly reason: OriginRefusal;
  constructor(reason: OriginRefusal) {
    super(`origin refused: ${REFUSALS[reason]}`);
    this.name = "OriginRefused";
    this.reason = reason;
  }
}

/** An instance's origin in its parts: `port` null where it is the
 * scheme's default. */
export interface InstanceOrigin {
  origin: string;
  scheme: "http" | "https";
  host: string;
  port: number | null;
}

/** The origin a URL names, canonical, or `OriginRefused` with the first
 * reason found among its scheme, user info, path, query, fragment and
 * host, in that order. */
export function parseOrigin(value: string): InstanceOrigin {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new OriginRefused("invalid"); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new OriginRefused("scheme");
  if (url.username !== "" || url.password !== "") throw new OriginRefused("user");
  if (url.pathname !== "/") throw new OriginRefused("path");
  // An empty query or fragment parses to an empty `search` or `hash`
  // but stays in `href`, after the path.
  const rest = url.href.slice(`${url.protocol}//${url.host}/`.length);
  if (rest.startsWith("?")) throw new OriginRefused("query");
  if (rest.startsWith("#")) throw new OriginRefused("fragment");
  // The parser has lowercased the host, mapped it to ASCII and dropped
  // a default port.
  const host = url.hostname;
  if (!HOST.test(host)) throw new OriginRefused("host");
  const scheme = url.protocol === "http:" ? "http" : "https";
  if (scheme === "http" && !isLoopback(host)) throw new OriginRefused("insecure");
  const port = url.port === "" ? null : Number(url.port);
  return { origin: `${scheme}://${host}${port === null ? "" : `:${port}`}`, scheme, host, port };
}

/** The canonical origin a URL names (`OriginRefused` where it names
 * none): `HTTPS://Spex.Pub:443/` is `https://spex.pub`. */
export function canonicalOrigin(value: string): string {
  return parseOrigin(value).origin;
}

/** The folder under `workspace/` of the instance a URL names
 * (`OriginRefused` where it names none): `@spex.pub` for
 * `https://spex.pub`, `@127.0.0.1_4100` for `http://127.0.0.1:4100`,
 * `@localhost_80` for `http://localhost`. */
export function instanceFolder(value: string): string {
  const { scheme, host, port } = parseOrigin(value);
  const named = port ?? (scheme === "http" ? 80 : null);
  return named === null ? `@${host}` : `@${host}_${named}`;
}

/** Whether a path segment stands as an instance's folder. */
export function isInstanceFolder(value: string): boolean {
  return INSTANCE_FOLDER_PATTERN.test(value);
}

/** The instance folder a key begins with — `@spex.pub` of
 * `@spex.pub/acme/a-spex` — or null for a key outside every instance's
 * folder, as your own group's and the local-only clones' are. */
export function instanceSegmentOf(key: string): string | null {
  const at = key.indexOf("/");
  if (at < 0) return null;
  const segment = key.slice(0, at);
  return isInstanceFolder(segment) ? segment : null;
}

/**
 * The instance a home names (git-host-1), as its canonical origin: a
 * home that already records one keeps it whatever the environment says;
 * a new home takes a nonempty `SPEX_HOST_URL`, else spex.pub. A URL the
 * origin rule refuses throws `OriginRefused`.
 */
export function hostUrlFor(env: NodeJS.ProcessEnv = process.env, existing?: string | null): string {
  if (typeof existing === "string" && existing.trim().length > 0) return canonicalOrigin(existing);
  const fromEnv = env.SPEX_HOST_URL?.trim();
  return canonicalOrigin(fromEnv ? fromEnv : DEFAULT_HOST_URL);
}

function isLoopback(host: string): boolean {
  return host === "localhost" || LOOPBACK_V4.test(host);
}
