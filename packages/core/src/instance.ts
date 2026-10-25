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

import { INSTANCE_FOLDER_PATTERN } from "./protocol.js";

/** The instance a new home records unless `SPEX_HOST_URL` names another
 * (git-host-1). */
export const DEFAULT_HOST_URL = "https://spex.sublang.ai";

/** An instance's folder under `workspace/`, defined beside the key whose
 * first segment it may be. */
export { INSTANCE_FOLDER_PATTERN };

const LOOPBACK_V4 = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/** Why a URL stands as no instance's origin:
 * - `invalid`: it does not parse as a URL;
 * - `scheme`: its scheme is neither `http` nor `https`;
 * - `user`: it carries a user or a password;
 * - `path`: it names a path other than `/`;
 * - `query`: it carries a query, even an empty one;
 * - `fragment`: it carries a fragment, even an empty one;
 * - `host`: its host is not DNS labels of `[a-z0-9-]`, none starting
 *   or ending with `-`, joined by single dots with none leading or
 *   trailing — a host holding `_` or an IPv6 literal among them;
 * - `port`: it names port 0;
 * - `insecure`: it is `http` on a host that is not loopback —
 *   `localhost` or an address in 127.0.0.0/8. */
export type OriginRefusal = "invalid" | "scheme" | "user" | "path" | "query" | "fragment" | "host" | "port" | "insecure";

const REFUSALS: Record<OriginRefusal, string> = {
  invalid: "not a URL",
  scheme: "the scheme is neither http nor https",
  user: "the URL carries a user or a password",
  path: "the URL names a path",
  query: "the URL carries a query",
  fragment: "the URL carries a fragment",
  host: "the host is not DNS labels of [a-z0-9-] joined by single dots",
  port: "the port is not from 1 to 65535",
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
 * reason found among its scheme, user info, path, query, fragment, host
 * and port, in that order. */
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
  // The parser has lowercased the host, mapped it to ASCII, and read the
  // port as a number up to 65535, dropping a default one and any leading
  // zero; the host's folder is then the instance's folder's own spelling.
  const host = url.hostname;
  if (!INSTANCE_FOLDER_PATTERN.test(`@${host}`)) throw new OriginRefused("host");
  const port = url.port === "" ? null : Number(url.port);
  if (port === 0) throw new OriginRefused("port");
  const scheme = url.protocol === "http:" ? "http" : "https";
  if (scheme === "http" && !isLoopback(host)) throw new OriginRefused("insecure");
  return { origin: `${scheme}://${host}${port === null ? "" : `:${port}`}`, scheme, host, port };
}

/** The canonical origin a URL names (`OriginRefused` where it names
 * none): `HTTPS://Spex.Sublang.Ai:443/` is `https://spex.sublang.ai`. */
export function canonicalOrigin(value: string): string {
  return parseOrigin(value).origin;
}

/** The folder under `workspace/` of the instance a URL names
 * (`OriginRefused` where it names none): `@spex.sublang.ai` for
 * `https://spex.sublang.ai`, `@127.0.0.1_4100` for `http://127.0.0.1:4100`,
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

/** The instance folder a key begins with — `@spex.sublang.ai` of
 * `@spex.sublang.ai/acme/a-spex` — or null for a key outside every instance's
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
 * a new home takes a nonempty `SPEX_HOST_URL`, else spex.sublang.ai. A URL the
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
