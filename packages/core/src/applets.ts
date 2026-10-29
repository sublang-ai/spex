// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Applets on the core's endpoint (applets-3..5, DR-161): a capability —
// 256 random bits, minted once per applet and project and kept in
// memory alone — names the path an applet is served under, and the
// core answers `GET` and `HEAD` there from two read-only roots: the
// applet's folder, and the project's working folder under `~/`. Each
// request reads its roots afresh, so an edit shows at once and an
// applet whose package left answers 404. Every answer carries the
// policy confining the page to its capability's own paths; the
// endpoint's token admits nothing here.

import { randomBytes } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, realpathSync, statSync, type Stats } from "node:fs";
import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import type { TLSSocket } from "node:tls";
import { extname, join, relative, resolve, sep } from "node:path";

/** The content type each extension maps to, as the server shell maps
 * its bundle's (server-shell-4); any other is `application/octet-stream`. */
export const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

export function contentTypeOf(path: string): string {
  return CONTENT_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}

/** The path every applet's capability lies under. */
export const APPLETS_PATH = "/applets/";

/** Whether a request URL lies under `/applets/`. */
export function isAppletPath(url: string | undefined): boolean {
  return pathOf(url).startsWith(APPLETS_PATH);
}

/** One ask of `applet.open` (applets-3). */
export interface AppletAsk {
  /** The spex repository whose environment installs the applet. */
  repository: string;
  /** The applet's id. */
  applet: string;
  /** The spex repository of the project whose tab shows it. */
  project: string;
}

/** The two folders a capability reads, as they stand at a request. */
export interface AppletRoots {
  applet: string;
  workingFolder: string;
}

function pathOf(url: string | undefined): string {
  const raw = url ?? "/";
  const end = raw.search(/[?#]/);
  return end < 0 ? raw : raw.slice(0, end);
}

/** A Host header fit to name an origin in a policy. */
const HOST_RE = /^[A-Za-z0-9.\-[\]:]+$/;

/** The policy confining a page to its capability's own origin
 * (applets-5): the scheme the request arrived by and the host it
 * addressed. */
export function appletPolicy(origin: string): string {
  return [
    `default-src ${origin}`,
    `script-src ${origin} 'unsafe-inline'`,
    `style-src ${origin} 'unsafe-inline'`,
    `img-src ${origin} data: blob:`,
    `media-src ${origin} blob:`,
    `font-src ${origin} data:`,
    `connect-src ${origin}`,
    `form-action ${origin}`,
    "base-uri 'none'",
  ].join("; ");
}

/** Whether `path` is `root` or lies below it. */
function within(root: string, path: string): boolean {
  return path === root || path.startsWith(root.endsWith(sep) ? root : root + sep);
}

/** A `.git` entry at any depth, in any case (applets-4): a folder that
 * ignores case reads `.GIT` as `.git`. */
function namesGit(path: string): boolean {
  return path.split(/[\\/]/).some((segment) => segment.toLowerCase() === ".git");
}

export class AppletServer {
  /** `repository \0 applet \0 project` to its capability. */
  private readonly minted = new Map<string, string>();
  private readonly asks = new Map<string, AppletAsk>();

  constructor(private readonly rootsOf: (ask: AppletAsk) => AppletRoots | null) {}

  /** The path of an applet's capability for one project (applets-3):
   * minted on the first ask, the same on every later one. */
  path(ask: AppletAsk): string {
    const key = [ask.repository, ask.applet, ask.project].join("\u0000");
    let capability = this.minted.get(key);
    if (capability === undefined) {
      capability = randomBytes(32).toString("base64url");
      this.minted.set(key, capability);
      this.asks.set(capability, { ...ask });
    }
    return `${APPLETS_PATH}${capability}/`;
  }

  /** Refuse a WebSocket handshake under `/applets/` (applets-4): `404`
   * with an empty body. */
  refuseUpgrade(socket: Duplex): void {
    socket.on("error", () => socket.destroy());
    socket.once("finish", () => socket.destroy());
    socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
  }

  /** Answer an HTTP request under `/applets/` (applets-4, applets-5);
   * false, answering nothing, for any other path. */
  handle(req: IncomingMessage, res: ServerResponse): boolean {
    const path = pathOf(req.url);
    if (!path.startsWith(APPLETS_PATH)) return false;
    const base: OutgoingHttpHeaders = {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      // The sandboxed page's origin is opaque, so each read of its own
      // paths is a cross-origin read, a refusal read as one too
      // (applets-4).
      "access-control-allow-origin": "*",
    };
    const refuse = (status: 404 | 405): void => {
      res.writeHead(status, { ...base, ...(status === 405 ? { allow: "GET, HEAD" } : {}), "content-length": 0 }).end();
    };
    if (req.method !== "GET" && req.method !== "HEAD") { refuse(405); return true; }
    const host = req.headers.host;
    if (!host || !HOST_RE.test(host)) { refuse(404); return true; }
    const rest = path.slice(APPLETS_PATH.length);
    const slash = rest.indexOf("/");
    const ask = slash > 0 ? this.asks.get(rest.slice(0, slash)) : undefined;
    if (!ask) { refuse(404); return true; }
    let wanted: string;
    try {
      wanted = decodeURIComponent(rest.slice(slash + 1));
    } catch {
      refuse(404);
      return true;
    }
    if (wanted.includes("\u0000") || namesGit(wanted)) { refuse(404); return true; }
    const roots = this.rootsOf(ask);
    if (!roots) { refuse(404); return true; }
    // `/` is the entry; `~/…` the working folder, its folders listed
    // with their slash; anything else a file of the applet's folder.
    let root: string;
    let inner: string;
    let listing = false;
    if (wanted === "") {
      root = roots.applet;
      inner = "index.html";
    } else if (wanted === "~") {
      refuse(404);
      return true;
    } else if (wanted.startsWith("~/")) {
      root = roots.workingFolder;
      inner = wanted.slice(2);
      listing = inner === "" || inner.endsWith("/");
    } else {
      root = roots.applet;
      inner = wanted;
      if (inner.endsWith("/")) { refuse(404); return true; }
    }
    // The lexical path first, then the real one: a link leading out of
    // either root serves nothing.
    const lexicalRoot = resolve(root);
    const target = resolve(lexicalRoot, inner);
    if (!within(lexicalRoot, target)) { refuse(404); return true; }
    let real: string;
    let realRoot: string;
    let stat: Stats;
    try {
      realRoot = realpathSync(lexicalRoot);
      real = realpathSync(target);
      stat = statSync(real);
    } catch {
      refuse(404);
      return true;
    }
    if (!within(realRoot, real) || namesGit(relative(realRoot, real))) { refuse(404); return true; }
    let body: Buffer;
    let type: string;
    try {
      if (listing) {
        if (!stat.isDirectory()) { refuse(404); return true; }
        body = Buffer.from(JSON.stringify({ entries: listEntries(real) }));
        type = "application/json";
      } else {
        if (!stat.isFile()) { refuse(404); return true; }
        body = readFileSync(real);
        type = contentTypeOf(real);
      }
    } catch {
      refuse(404);
      return true;
    }
    const scheme = (req.socket as Partial<TLSSocket>).encrypted ? "https" : "http";
    res.writeHead(200, {
      ...base,
      "content-type": type,
      "content-length": body.length,
      "content-security-policy": appletPolicy(`${scheme}://${host}`),
    });
    res.end(req.method === "HEAD" ? undefined : body);
    return true;
  }
}

/** A folder's entries (applets-4): its regular files and folders, by
 * name; links and special files left out. */
function listEntries(folder: string): { name: string; kind: "file" | "folder"; size: number; modified: number }[] {
  const entries: { name: string; kind: "file" | "folder"; size: number; modified: number }[] = [];
  for (const name of readdirSync(folder).sort()) {
    let stat: Stats;
    try { stat = lstatSync(join(folder, name)); } catch { continue; }
    if (stat.isFile()) entries.push({ name, kind: "file", size: stat.size, modified: Math.floor(stat.mtimeMs) });
    else if (stat.isDirectory()) entries.push({ name, kind: "folder", size: 0, modified: Math.floor(stat.mtimeMs) });
  }
  return entries;
}
