// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The server shell (DR-033): one TCP port serves the staged UI
// bundle and the core's WebSocket endpoint to a remote browser,
// behind the core's token handshake, with optional TLS
// (SERVER-SHELL-1..4, 16). A non-loopback bind without TLS is refused
// unless --insecure makes the plaintext choice explicit
// (SERVER-SHELL-2). As a seat of a team server, the same shell listens
// on a Unix socket the hub alone reaches instead, its token read from a
// file and printed nowhere (SERVER-SHELL-25, DR-132).

import { randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  unlinkSync,
  type Stats,
} from "node:fs";
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type Server as HttpServer,
  type ServerResponse,
} from "node:http";
import {
  createServer as createHttpsServer,
  type Server as HttpsServer,
} from "node:https";
import { connect, type AddressInfo } from "node:net";
import { homedir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  brotliCompressSync,
  constants as zlibConstants,
  gzipSync,
} from "node:zlib";

import { CoreService, moduleDirectoriesAbove, suppliedScaffold, type CoreServiceOptions, type SeatOptions } from "@sublang/spex-core";

/**
 * A seat of a team server (server-shell-25, DR-132): the core's seat
 * facts — the server's id and name, the admitted person's permanent
 * account id and, optionally, the administrator's shared credential
 * file — and the Unix socket the shell listens on in place of a host
 * and port, which the hub alone reaches (hub-3).
 */
export interface ShellSeat extends SeatOptions {
  socket: string;
}

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
  /** Seat mode (server-shell-25): set, `token` is the one read from the
   * token file, and the shell starts with `startSeat`. */
  seat?: ShellSeat;
  /**
   * Core service overrides for a harness starting the shell from code
   * (server-shell-20, DR-039): the core's agent seams and its
   * environment. No command-line form exists, so a served deployment
   * never carries them; absent, the boot is exactly the command line's.
   */
  core?: Pick<
    CoreServiceOptions,
    | "adapterImports"
    | "adapterRuntime" | "discoverAgentModels"
    | "captainFactory"
    | "env"
    | "home"
    | "loadModule"
    | "runCommand"
    | "forgeAdapter"
    | "scaffoldCommand"
    | "systemLanguages"
    | "watchConfig"
    | "own"
  >;
}

export interface RunningServer {
  service: CoreService;
  server: HttpServer | HttpsServer;
  /** The one access URL: scheme, bound host, port, and token. */
  url: string;
  port: number;
  close(): Promise<void>;
}

/** A seat listening on its Unix socket (server-shell-25): no access
 * URL, since the token appears in no output. */
export interface RunningSeat {
  service: CoreService;
  server: HttpServer;
  /** The socket's absolute path. */
  socket: string;
  close(): Promise<void>;
}

export function defaultDataDir(env: NodeJS.ProcessEnv): string {
  return env.SPEX_HOME?.trim() ? env.SPEX_HOME : join(env.HOME ?? homedir(), ".spex");
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

/** The shell's own version, from its package manifest — what the
 * served page prints where the desktop prints its build's version
 * (SERVER-SHELL-4). */
export function shellVersion(): string {
  try {
    const manifest = JSON.parse(
      readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), "..", "package.json"),
        "utf8",
      ),
    ) as { version?: unknown };
    return typeof manifest.version === "string" && manifest.version
      ? manifest.version
      : "dev";
  } catch {
    return "dev";
  }
}

/** Stamp the shell's version into a page's head as a
 * `spex-version` meta element (SERVER-SHELL-4), so the served
 * Settings surface never prints a dev placeholder. A page with no
 * head element is left as it is. */
export function stampVersion(page: string, version: string): string {
  const safe = version.replace(/[^A-Za-z0-9.+-]/g, "");
  if (!safe) return page;
  return page.replace(
    /<head(\s[^>]*)?>/i,
    (head) => `${head}<meta name="spex-version" content="${safe}">`,
  );
}

/** The flags taking no value. */
const SWITCHES = new Set(["insecure", "seat"]);

/** A seat's flags (server-shell-25), each refused without `--seat`. */
const SEAT_FLAGS = ["server-id", "server-name", "person-id", "token-file", "socket", "shared-env"] as const;

/** The flags taking a value, as `--flag=value` or `--flag value`. */
const VALUED = new Set<string>([
  "host",
  "port",
  "token",
  "config",
  "data-dir",
  "tls-cert",
  "tls-key",
  ...SEAT_FLAGS,
]);

/** The seat's flags it cannot start without, with what each names. */
const SEAT_REQUIRED = [
  ["server-id", "the server's id at the instance"],
  ["server-name", "the server's name"],
  ["person-id", "the admitted person's permanent account id"],
  ["token-file", "the file holding the handshake token"],
  ["socket", "the Unix socket to listen on"],
] as const;

/** What `--socket` stands in for: the hub alone reaches a seat (hub-3). */
const SOCKET_EXCLUDES = ["host", "port", "tls-cert", "tls-key"] as const;

export function parseArgs(
  argv: string[],
  env: NodeJS.ProcessEnv,
): ServerShellOptions {
  const values = new Map<string, string>();
  const switches = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const match = /^--([a-z-]+)(?:=(.*))?$/s.exec(arg);
    const key = match?.[1];
    let value = match?.[2];
    if (key !== undefined && value === undefined && SWITCHES.has(key)) {
      switches.add(key);
      continue;
    }
    if (key === undefined || !VALUED.has(key)) {
      throw new Error(`unknown argument: ${arg}`);
    }
    if (value === undefined) {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new Error(`--${key} needs a value`);
      }
      value = next;
      index += 1;
    }
    values.set(key, value);
  }

  const options: ServerShellOptions = {
    host: "127.0.0.1",
    port: 8137,
    token: env.SPEX_TOKEN ?? randomUUID(),
    dataDir: defaultDataDir(env),
    legacyDb: legacyDbPath(env),
    insecure: switches.has("insecure"),
    uiDist: defaultUiDist(),
  };
  for (const [key, value] of values) {
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
    }
  }

  if (!switches.has("seat")) {
    const stray = SEAT_FLAGS.find((flag) => values.has(flag));
    if (stray) throw new Error(`--${stray} is a seat's flag: it needs --seat`);
    return options;
  }
  options.seat = parseSeat(values, switches);
  options.token = readTokenFile(values.get("token-file") as string);
  return options;
}

/** A seat's facts from its flags (server-shell-25), every refusal
 * naming the mistake before anything starts. */
function parseSeat(values: Map<string, string>, switches: Set<string>): ShellSeat {
  if (values.has("token") && values.has("token-file")) {
    throw new Error(
      "--token cannot stand beside --token-file: a seat reads its handshake token from the file alone",
    );
  }
  if (values.has("socket")) {
    const beside = [
      ...SOCKET_EXCLUDES.filter((flag) => values.has(flag)),
      ...(switches.has("insecure") ? ["insecure"] : []),
    ];
    if (beside.length > 0) {
      throw new Error(
        `${beside.map((flag) => `--${flag}`).join(", ")} cannot stand beside --socket: ` +
          "a seat listens on its Unix socket alone, which the hub alone reaches",
      );
    }
  }
  for (const [flag, what] of SEAT_REQUIRED) {
    if (!values.get(flag)?.trim()) {
      throw new Error(`--seat needs --${flag}, ${what}: it is missing or empty`);
    }
  }
  const shared = values.get("shared-env");
  if (shared !== undefined && !shared.trim()) {
    throw new Error("--shared-env names no file");
  }
  return {
    serverId: values.get("server-id") as string,
    serverName: values.get("server-name") as string,
    personId: values.get("person-id") as string,
    socket: resolve(values.get("socket") as string),
    ...(shared !== undefined ? { sharedCredentialFile: resolve(shared) } : {}),
  };
}

/** A seat's handshake token, read from its file and trimmed; an
 * unreadable file or an empty token refuses startup, naming the file and
 * never what it holds (server-shell-25). */
function readTokenFile(path: string): string {
  let token: string;
  try {
    token = readFileSync(path, "utf8").trim();
  } catch (error) {
    const cause = (error as NodeJS.ErrnoException).code ?? "unreadable";
    throw new Error(`cannot read the token file ${path} (${cause})`);
  }
  if (token === "") {
    throw new Error(
      `the token file ${path} holds no token — a blank secret would disable the handshake`,
    );
  }
  return token;
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

const COMPRESSIBLE_EXTENSIONS = new Set([
  ".html",
  ".js",
  ".css",
  ".json",
  ".map",
  ".svg",
  ".txt",
]);

type ContentCoding = "br" | "gzip" | "identity";

interface CachedEncodedBody {
  body: Buffer;
  mtimeMs: number;
  size: number;
}

type EncodedBodyCache = Map<string, CachedEncodedBody>;

function acceptsContentCoding(
  header: string | string[] | undefined,
  coding: Exclude<ContentCoding, "identity">,
): boolean {
  if (header === undefined) return false;
  const value = Array.isArray(header) ? header.join(",") : header;
  let explicitQuality: number | undefined;
  let wildcardQuality: number | undefined;
  for (const entry of value.split(",")) {
    const [namePart = "", ...parameters] = entry.split(";");
    const name = namePart.trim().toLowerCase();
    if (name !== coding && name !== "*") continue;
    const qualityParameter = parameters.find((parameter) =>
      /^\s*q\s*=/i.test(parameter),
    );
    const quality = qualityParameter
      ? Number(qualityParameter.replace(/^\s*q\s*=\s*/i, ""))
      : 1;
    const normalizedQuality =
      Number.isFinite(quality) && quality >= 0 && quality <= 1 ? quality : 0;
    if (name === coding) {
      explicitQuality = Math.max(explicitQuality ?? 0, normalizedQuality);
    } else {
      wildcardQuality = Math.max(wildcardQuality ?? 0, normalizedQuality);
    }
  }
  return (explicitQuality ?? wildcardQuality ?? 0) > 0;
}

function negotiateContentCoding(
  header: string | string[] | undefined,
): ContentCoding {
  if (acceptsContentCoding(header, "br")) return "br";
  if (acceptsContentCoding(header, "gzip")) return "gzip";
  return "identity";
}

function encodeBody(body: Buffer, coding: ContentCoding): Buffer {
  if (coding === "br") {
    return brotliCompressSync(body, {
      params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 },
    });
  }
  if (coding === "gzip") return gzipSync(body);
  return body;
}

function cachedEncodedBody(
  cache: EncodedBodyCache,
  filePath: string,
  coding: Exclude<ContentCoding, "identity">,
  fileStat: Stats,
): Buffer {
  const key = `${coding}\0${filePath}`;
  const cached = cache.get(key);
  if (
    cached &&
    cached.mtimeMs === fileStat.mtimeMs &&
    cached.size === fileStat.size
  ) {
    return cached.body;
  }
  const body = encodeBody(readFileSync(filePath), coding);
  cache.set(key, {
    body,
    mtimeMs: fileStat.mtimeMs,
    size: fileStat.size,
  });
  return body;
}

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
  encodedBodyCache: EncodedBodyCache,
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
  const requestedIndex = filePath === join(bundleDir, "index.html");
  try {
    filePath = realpathSync(filePath);
  } catch {
    res.writeHead(404).end();
    return;
  }
  if (!filePath.startsWith(bundleDir + sep)) {
    res.writeHead(404).end();
    return;
  }
  let fileStat: Stats;
  try {
    fileStat = statSync(filePath);
  } catch {
    res.writeHead(404).end();
    return;
  }
  if (!fileStat.isFile()) {
    res.writeHead(404).end();
    return;
  }
  const isIndex = requestedIndex || filePath === join(bundleDir, "index.html");
  const extension = extname(filePath);
  const type = CONTENT_TYPES[extension] ?? "application/octet-stream";
  const headers: OutgoingHttpHeaders = { "content-type": type };
  if (isIndex) headers["cache-control"] = "no-store";
  let coding: ContentCoding = "identity";
  if (COMPRESSIBLE_EXTENSIONS.has(extension)) {
    coding = negotiateContentCoding(req.headers["accept-encoding"]);
    headers.vary = "Accept-Encoding";
    if (coding !== "identity") headers["content-encoding"] = coding;
  }
  if (req.method === "HEAD") {
    res.writeHead(200, headers).end();
    return;
  }
  let responseBody: Buffer;
  try {
    if (isIndex) {
      const body =
        extension === ".html"
          ? Buffer.from(
              stampVersion(
                retargetCsp(readFileSync(filePath, "utf8"), req.headers.host),
                shellVersion(),
              ),
            )
          : readFileSync(filePath);
      responseBody = encodeBody(body, coding);
    } else if (coding === "identity") {
      responseBody = readFileSync(filePath);
    } else {
      responseBody = cachedEncodedBody(
        encodedBodyCache,
        filePath,
        coding,
        fileStat,
      );
    }
  } catch (error) {
    console.error(
      `[spex-server] bundle materialization failed: ${JSON.stringify({
        path: filePath,
        cause: error instanceof Error ? error.message : String(error),
      })}`,
    );
    res.writeHead(500).end();
    return;
  }
  res.writeHead(200, headers);
  res.end(responseBody);
}

/**
 * What the shell boots its core with (server-shell-1, server-shell-7,
 * server-shell-20): attached to the shell's own HTTP server, this
 * shell's Node as the runtime of the compiler, the scaffold CLI and the
 * Git credential helper, and the device sign-in flow, since the browser
 * reading the page may sit on another machine than the core's loopback.
 * A harness's core overrides come last; none of them names the flow or
 * the helper's runtime. On a seat the core runs in seat mode with the
 * seat's facts (server-shell-25, core-service-125), and the shell sets
 * no label of its own: the core labels the device by the server's name.
 */
export function serverCoreOptions(
  options: ServerShellOptions,
  server: HttpServer | HttpsServer,
): CoreServiceOptions {
  const legacy = options.legacyDb;
  const runtime = {
    execPath: process.execPath,
    electron: false,
    modulePaths: moduleDirectoriesAbove(import.meta.url),
  };
  return {
    httpServer: server,
    token: options.token,
    dataDir: options.dataDir,
    ...(existsSync(legacy) ? { legacyDbPath: legacy } : {}),
    ...(options.configPath ? { configPath: options.configPath } : {}),
    // Compiles run on this shell's own Node, with the compiler and the
    // SDKs this package declares (server-shell-7, DR-081).
    compileRuntime: runtime,
    // The scaffold runs the checkout's own CLI on that Node too
    // (server-shell-7, projects-31); with none built, the create flow
    // falls back to the registry's and names it.
    ...(suppliedScaffold(runtime) ?? {}),
    // The device flow, and Git's credential helper on this Node
    // (server-shell-1, git-host-3, git-host-9).
    signIn: "device",
    hostRuntime: { execPath: process.execPath, electron: false },
    ...(options.seat ? { seat: coreSeat(options.seat) } : {}),
    ...(options.core ?? {}),
  };
}

/** The core's seat facts: the shell's seat without its socket. */
function coreSeat(seat: ShellSeat): SeatOptions {
  return {
    serverId: seat.serverId,
    serverName: seat.serverName,
    personId: seat.personId,
    ...(seat.sharedCredentialFile !== undefined
      ? { sharedCredentialFile: seat.sharedCredentialFile }
      : {}),
  };
}

function checkToken(token: string): void {
  if (token === "") {
    throw new Error(
      "the token must not be empty — a blank secret would disable the " +
        "handshake; unset SPEX_TOKEN/--token for a random one, or pass a secret",
    );
  }
}

/** The shell's own HTTP(S) server, serving the staged bundle. */
function createShellServer(
  options: ServerShellOptions,
  tls: boolean,
): HttpServer | HttpsServer {
  const bundleDir = realpathSync(options.uiDist);
  const encodedBodyCache: EncodedBodyCache = new Map();
  const handler = (req: IncomingMessage, res: ServerResponse) =>
    serveBundle(bundleDir, encodedBodyCache, req, res);
  return tls
    ? createHttpsServer(
        {
          cert: readFileSync(options.tlsCert as string),
          key: readFileSync(options.tlsKey as string),
        },
        handler,
      )
    : createHttpServer(handler);
}

/** Boot the core attached to the shell's server, then listen; a failed
 * listen stops the core again and refuses startup with its cause. While
 * the server binds, the shell's listener alone hears its errors: the
 * core's WebSocket server forwards the server's errors and, having no
 * listener of its own, would throw a bind failure past that refusal. */
async function bootCore(
  options: ServerShellOptions,
  server: HttpServer | HttpsServer,
  listen: () => Promise<void>,
): Promise<CoreService> {
  mkdirSync(options.dataDir, { recursive: true });
  const service = await CoreService.start(serverCoreOptions(options, server));
  const forwarded = server.rawListeners("error") as ((error: Error) => void)[];
  server.removeAllListeners("error");
  const restore = () => {
    for (const listener of forwarded) server.on("error", listener);
  };
  try {
    await listen();
  } catch (error) {
    restore();
    await service.stop();
    throw error;
  }
  restore();
  return service;
}

function stopper(
  server: HttpServer | HttpsServer,
  service: CoreService,
): () => Promise<void> {
  return async () => {
    // Sever transports first: a vanished peer's WebSocket would
    // otherwise hold the graceful stop until ws's close timeout.
    server.closeAllConnections();
    await service.stop();
    await new Promise<void>((resolveClose) =>
      server.close(() => resolveClose()),
    );
  };
}

export async function startServer(
  options: ServerShellOptions,
): Promise<RunningServer> {
  if (options.seat) {
    throw new Error("a seat listens on its Unix socket: start it with startSeat");
  }
  checkToken(options.token);
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
  const server = createShellServer(options, tls);
  const service = await bootCore(
    options,
    server,
    () =>
      new Promise<void>((resolveListen, rejectListen) => {
        server.once("error", rejectListen);
        server.listen(options.port, options.host, resolveListen);
      }),
  );
  const port = (server.address() as AddressInfo).port;
  const scheme = tls ? "https" : "http";
  const url = `${scheme}://${formatHost(options.host)}:${port}/?token=${encodeURIComponent(options.token)}`;
  return { service, server, url, port, close: stopper(server, service) };
}

/** How long a probe of a socket file waits before calling it hung. */
const SOCKET_PROBE_MS = 2_000;

/** What a connection to a Unix socket meets: an answer, a refusal, or
 * another failure named by its code — a hung probe's ETIMEDOUT. */
function probeSocket(path: string): Promise<"answers" | "refused" | { failed: string }> {
  return new Promise((resolveProbe) => {
    const probe = connect(path);
    const timer = setTimeout(() => {
      probe.destroy();
      resolveProbe({ failed: "ETIMEDOUT" });
    }, SOCKET_PROBE_MS);
    probe.once("connect", () => {
      clearTimeout(timer);
      probe.destroy();
      resolveProbe("answers");
    });
    probe.once("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      resolveProbe(
        error.code === "ECONNREFUSED" ? "refused" : { failed: error.code ?? "an unknown error" },
      );
    });
  });
}

/** Remove a stale socket at a seat's path before listening
 * (server-shell-25): only a socket that refuses a connection. A socket
 * that answers, or whose probe fails any other way — EACCES, EAGAIN, a
 * hung probe — is in use, and another kind of file is never a socket;
 * each is left as it is and refused, naming the path. */
async function clearStaleSocket(path: string): Promise<void> {
  let stats: Stats;
  try {
    stats = lstatSync(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return;
    throw new Error(`cannot inspect --socket ${path} (${code ?? "unreadable"})`);
  }
  if (!stats.isSocket()) {
    throw new Error(`--socket ${path} names a file that is not a socket; it is left as it is`);
  }
  const probe = await probeSocket(path);
  if (probe === "answers") {
    throw new Error(`--socket ${path} is in use: something listens on it`);
  }
  if (probe !== "refused") {
    throw new Error(
      `--socket ${path} is in use: a connection to it failed with ${probe.failed}, not a refusal; it is left as it is`,
    );
  }
  unlinkSync(path);
}

/** The longest path a Unix socket binds, in bytes: the size of its
 * address's sun_path, 108 on Linux and 104 on macOS and the BSDs. */
const SOCKET_PATH_MAX = process.platform === "linux" ? 108 : 104;

/** A seat's socket that cannot be bound, refused naming the cause as a
 * flag mistake is (server-shell-25). */
function unbindable(path: string, reason: string, code: string): Error {
  return new Error(`--socket ${path} cannot be bound: ${reason} (${code})`);
}

/** A failed bind's refusal. The bind reports a missing directory as
 * EACCES, so the directory is checked. */
function bindRefusal(path: string, error: unknown): Error {
  const code = (error as NodeJS.ErrnoException).code ?? "an unknown error";
  const reason = !existsSync(dirname(path))
    ? `its directory ${dirname(path)} does not exist`
    : code === "EADDRINUSE"
      ? "another socket took the path"
      : code === "EACCES" || code === "EPERM"
        ? "permission denied"
        : "the bind failed";
  return unbindable(path, reason, code);
}

/** Refuse a path longer than a Unix socket binds before anything
 * starts: Node 22 and 24 bind such a path cut short, a socket at
 * another path, where Node 25 refuses it, so the length is checked
 * alike on every version. */
function checkSocketPath(path: string): void {
  if (process.platform !== "win32" && Buffer.byteLength(path) > SOCKET_PATH_MAX) {
    throw unbindable(path, `the path is longer than a Unix socket's ${SOCKET_PATH_MAX} bytes`, "ENAMETOOLONG");
  }
}

/**
 * Start the shell as a seat (server-shell-25, DR-132): the core in seat
 * mode, attached to an HTTP server listening on the seat's Unix socket
 * in the directory whoever starts the shell made (hub-4), after a stale
 * socket there is removed. The socket is made readable and writable by
 * its owner and its group alone — the directory's group, the hub's — so
 * the hub reaches it and nobody else does.
 */
export async function startSeat(options: ServerShellOptions): Promise<RunningSeat> {
  const seat = options.seat;
  if (!seat) throw new Error("startSeat needs a seat");
  checkToken(options.token);
  const beside = [
    ...(options.tlsCert !== undefined ? ["--tls-cert"] : []),
    ...(options.tlsKey !== undefined ? ["--tls-key"] : []),
    ...(options.insecure ? ["--insecure"] : []),
  ];
  if (beside.length > 0) {
    throw new Error(
      `${beside.join(", ")} cannot stand beside --socket: ` +
        "a seat listens on its Unix socket alone, which the hub alone reaches",
    );
  }
  checkSocketPath(seat.socket);
  await clearStaleSocket(seat.socket);
  const server = createShellServer(options, false) as HttpServer;
  const service = await bootCore(
    options,
    server,
    () =>
      new Promise<void>((resolveListen, rejectListen) => {
        const refuse = (error: unknown) => rejectListen(bindRefusal(seat.socket, error));
        server.once("error", refuse);
        server.listen({ path: seat.socket }, () => {
          server.removeListener("error", refuse);
          try {
            chmodSync(seat.socket, 0o660);
            resolveListen();
          } catch (error) {
            // A socket the hub cannot reach is one that cannot be
            // bound: closing the server removes the file it made.
            const code = (error as NodeJS.ErrnoException).code ?? "an unknown error";
            server.close(() =>
              rejectListen(unbindable(seat.socket, "it cannot be made group-accessible", code)),
            );
          }
        });
      }),
  );
  return { service, server, socket: seat.socket, close: stopper(server, service) };
}
