// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The server shell (DR-033): one TCP port serves the staged UI
// bundle and the core's WebSocket endpoint to a remote browser,
// behind the core's token handshake, with optional TLS
// (SERVER-SHELL-1..4). A non-loopback bind without TLS is refused
// unless --insecure makes the plaintext choice explicit
// (SERVER-SHELL-2).

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from "node:http";
import {
  createServer as createHttpsServer,
  type Server as HttpsServer,
} from "node:https";
import type { AddressInfo } from "node:net";
import { homedir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { CoreService } from "@sublang/spex-core";

export interface ServerShellOptions {
  host: string;
  port: number;
  token: string;
  configPath?: string;
  dataDir: string;
  /** The pre-DR-036 store to hand over for the one-time import. */
  legacyDb: string;
  tlsCert?: string;
  tlsKey?: string;
  insecure: boolean;
  uiDist: string;
}

export interface RunningServer {
  service: CoreService;
  server: HttpServer | HttpsServer;
  /** The one access URL: scheme, bound host, port, and token. */
  url: string;
  port: number;
  close(): Promise<void>;
}

export function defaultDataDir(env: NodeJS.ProcessEnv): string {
  return env.SPEX_HOME || join(env.HOME ?? homedir(), ".spex");
}

/** The pre-DR-036 store this shell used, handed over for the one-time
 * import (core-service-64) when it exists. */
export function legacyDbPath(env: NodeJS.ProcessEnv): string {
  const dataHome =
    env.XDG_DATA_HOME || join(env.HOME ?? homedir(), ".local", "share");
  return join(dataHome, "spex", "server.db");
}

function defaultUiDist(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "ui-dist");
}

export function parseArgs(
  argv: string[],
  env: NodeJS.ProcessEnv,
): ServerShellOptions {
  const options: ServerShellOptions = {
    host: "127.0.0.1",
    port: 8137,
    token: env.SPEX_TOKEN ?? randomUUID(),
    dataDir: defaultDataDir(env),
    legacyDb: legacyDbPath(env),
    insecure: false,
    uiDist: defaultUiDist(),
  };
  for (const arg of argv) {
    if (arg === "--insecure") {
      options.insecure = true;
      continue;
    }
    const match = /^--([a-z-]+)=(.*)$/.exec(arg);
    const [, key, value] = match ?? [];
    switch (key) {
      case "host":
        options.host = value;
        break;
      case "port": {
        const port = Number(value);
        if (!Number.isInteger(port) || port < 0 || port > 65535) {
          throw new Error(`invalid --port: ${value}`);
        }
        options.port = port;
        break;
      }
      case "token":
        options.token = value;
        break;
      case "config":
        options.configPath = value;
        break;
      case "data-dir":
        options.dataDir = value;
        break;
      case "tls-cert":
        options.tlsCert = value;
        break;
      case "tls-key":
        options.tlsKey = value;
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

export function isLoopback(host: string): boolean {
  return (
    host === "localhost" ||
    host === "::1" ||
    /^127(\.\d{1,3}){3}$/.test(host)
  );
}

/** An IPv6 literal must be bracketed in URLs and ssh forwards. */
export function formatHost(host: string): string {
  return host.includes(":") ? `[${host}]` : host;
}

const CONTENT_TYPES: Record<string, string> = {
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

// The built page's CSP names only localhost connect targets — right
// for the desktop's file:// copy, wrong here. Retarget connect-src to
// the serving origin (SERVER-SHELL-4) so the page may open WebSockets
// to this origin and to no other host.
export function retargetCsp(
  page: string,
  hostHeader: string | undefined,
): string {
  const host =
    hostHeader && /^[A-Za-z0-9.\-[\]:]+$/.test(hostHeader)
      ? hostHeader
      : undefined;
  if (!host) return page;
  return page.replace(
    /connect-src [^;"]*/,
    `connect-src 'self' ws://${host} wss://${host}`,
  );
}

function serveBundle(
  bundleDir: string,
  req: IncomingMessage,
  res: ServerResponse,
): void {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405).end();
    return;
  }
  let pathname: string;
  try {
    pathname = decodeURIComponent(
      new URL(req.url ?? "/", "http://bundle").pathname,
    );
  } catch {
    res.writeHead(400).end();
    return;
  }
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  // Guard the lexical path, then the real one: a symlink staged into
  // the bundle must not serve what it points at outside it.
  let filePath = resolve(bundleDir, relative);
  if (!filePath.startsWith(bundleDir + sep)) {
    res.writeHead(404).end();
    return;
  }
  try {
    filePath = realpathSync(filePath);
  } catch {
    res.writeHead(404).end();
    return;
  }
  if (!filePath.startsWith(bundleDir + sep) || !statSync(filePath).isFile()) {
    res.writeHead(404).end();
    return;
  }
  const type = CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream";
  if (filePath === join(bundleDir, "index.html")) {
    const page = retargetCsp(readFileSync(filePath, "utf8"), req.headers.host);
    res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : page);
    return;
  }
  res.writeHead(200, { "content-type": type });
  res.end(req.method === "HEAD" ? undefined : readFileSync(filePath));
}

export async function startServer(
  options: ServerShellOptions,
): Promise<RunningServer> {
  if (options.token === "") {
    throw new Error(
      "the token must not be empty — a blank secret would disable the " +
        "handshake; unset SPEX_TOKEN/--token for a random one, or pass a secret",
    );
  }
  if ((options.tlsCert === undefined) !== (options.tlsKey === undefined)) {
    const missing = options.tlsCert === undefined ? "--tls-cert" : "--tls-key";
    throw new Error(`TLS needs both halves: ${missing} is missing`);
  }
  const tls = options.tlsCert !== undefined && options.tlsKey !== undefined;
  if (!isLoopback(options.host) && !tls && !options.insecure) {
    throw new Error(
      `refusing to bind ${options.host} without TLS: pass ` +
        `--tls-cert/--tls-key, or --insecure to accept a plaintext public bind`,
    );
  }
  const bundleDir = realpathSync(options.uiDist);
  const handler = (req: IncomingMessage, res: ServerResponse) =>
    serveBundle(bundleDir, req, res);
  const server = tls
    ? createHttpsServer(
        {
          cert: readFileSync(options.tlsCert as string),
          key: readFileSync(options.tlsKey as string),
        },
        handler,
      )
    : createHttpServer(handler);
  mkdirSync(options.dataDir, { recursive: true });
  const legacy = options.legacyDb;
  const service = await CoreService.start({
    httpServer: server,
    token: options.token,
    dataDir: options.dataDir,
    ...(existsSync(legacy) ? { legacyDbPath: legacy } : {}),
    ...(options.configPath ? { configPath: options.configPath } : {}),
  });
  try {
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once("error", rejectListen);
      server.listen(options.port, options.host, resolveListen);
    });
  } catch (error) {
    await service.stop();
    throw error;
  }
  const port = (server.address() as AddressInfo).port;
  const scheme = tls ? "https" : "http";
  const url = `${scheme}://${formatHost(options.host)}:${port}/?token=${encodeURIComponent(options.token)}`;
  return {
    service,
    server,
    url,
    port,
    close: async () => {
      // Sever transports first: a vanished peer's WebSocket would
      // otherwise hold the graceful stop until ws's close timeout.
      server.closeAllConnections();
      await service.stop();
      await new Promise<void>((resolveClose) =>
        server.close(() => resolveClose()),
      );
    },
  };
}
