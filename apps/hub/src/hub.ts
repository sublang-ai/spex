// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// `spex-hub serve` (hub-2, hub-3, hub-5): the server's one public
// process. Over TLS at the attached address it answers `POST /admit`
// and relays a WebSocket at `/seats/<person id>` to that person's seat,
// admitting the bearer in the `Authorization` header alone and no
// request carrying an `Origin`; at the interval it renews the leases of
// the seats in use; on its local control socket it answers `status`,
// `evict` and `retire` (hub-6).

import { chmodSync, readFileSync, rmSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer as createHttpsServer, type Server as HttpsServer } from "node:https";
import { createServer as createNetServer, connect, type Server as NetServer, type Socket } from "node:net";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";

import WebSocket, { WebSocketServer, type RawData } from "ws";

import { type HelperConfig } from "./helper.js";
import { connectSeat, readSeatToken } from "./seat.js";
import { SeatBook, type SeatStatus } from "./seats.js";
import {
  bearerMatches,
  controlPath,
  ensureStateDir,
  PERSON_ID,
  readState,
} from "./state.js";

export const RENEW_INTERVAL_MS = 30 * 60 * 1000;
export const SEAT_TIMEOUT_MS = 30 * 1000;
const MAX_ADMIT_BODY = 16 * 1024;

export interface HubOptions {
  stateDir: string;
  runDir: string;
  helper: HelperConfig;
  /** The interface to bind; all of them by default. */
  host?: string;
  /** The port to bind; the address's own by default. */
  port?: number;
  renewIntervalMs: number;
  seatTimeoutMs: number;
  log: (line: string) => void;
}

export interface RunningHub {
  port: number;
  book: SeatBook;
  /** Resolves once the hub has stopped, by `close` or after `retire`. */
  stopped: Promise<void>;
  close(): Promise<void>;
}

export type ControlRequest =
  | { op: "status" }
  | { op: "evict"; id: string }
  | { op: "retire" };

export type ControlAnswer =
  | { ok: true; seats: SeatStatus[]; server: { id: string; name: string | null; instance: string; address: string; attached: boolean } }
  | { ok: true; evicted: boolean }
  | { ok: true; retired: number; failures: string[] }
  | { ok: false; error: string };

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
    "cache-control": "no-store",
  });
  res.end(text);
}

function refuse(res: ServerResponse, status: number, code: string, message: string): void {
  sendJson(res, status, { error: { code, message } });
}

function readBody(req: IncomingMessage): Promise<string | undefined> {
  return new Promise((resolveBody) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let over = false;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_ADMIT_BODY) over = true;
      else chunks.push(chunk);
    });
    req.on("end", () => resolveBody(over ? undefined : Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolveBody(undefined));
  });
}

const STATUS_TEXT: Record<number, string> = {
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  502: "Bad Gateway",
  503: "Service Unavailable",
};

/** Answer an upgrade request without upgrading it. */
function refuseUpgrade(socket: Duplex, status: number): void {
  if (!socket.writable) {
    socket.destroy();
    return;
  }
  socket.end(
    `HTTP/1.1 ${status} ${STATUS_TEXT[status] ?? "Error"}\r\n` +
      "Connection: close\r\nContent-Length: 0\r\nCache-Control: no-store\r\n\r\n",
  );
  socket.once("finish", () => socket.destroy());
}

/** A close code one peer received, as the other may be sent it. */
function forwardable(code: number): number | undefined {
  if (code === 1005) return undefined;
  if (code === 1006 || code === 1015) return 1011;
  if ((code >= 1000 && code <= 1003) || (code >= 1007 && code <= 1014) || (code >= 3000 && code <= 4999)) {
    return code;
  }
  return 1011;
}

function closeSocket(socket: WebSocket, code?: number, reason?: Buffer | string): void {
  if (socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED) return;
  if (socket.readyState === WebSocket.CONNECTING) {
    socket.terminate();
    return;
  }
  const text = reason === undefined ? undefined : String(reason);
  if (code === undefined) socket.close();
  else socket.close(code, text !== undefined && Buffer.byteLength(text) <= 123 ? text : undefined);
}

export async function startHub(options: HubOptions): Promise<RunningHub> {
  const state = readState(options.stateDir);
  if (!state) throw new Error(`no server is attached in ${options.stateDir}: run spex-hub attach first`);
  if (!state.token) {
    throw new Error("this hub retired its server and forgot the token: run spex-hub attach again");
  }
  ensureStateDir(options.stateDir);
  const control = controlPath(options.stateDir);
  if (await controlAnswers(control)) {
    throw new Error(`another hub already serves ${options.stateDir}`);
  }
  rmSync(control, { force: true });

  let cert: Buffer;
  let key: Buffer;
  try {
    cert = readFileSync(state.tls_cert);
    key = readFileSync(state.tls_key);
  } catch (error) {
    throw new Error(`the TLS pair is unreadable: ${(error as Error).message}`);
  }

  const book = new SeatBook(
    {
      stateDir: options.stateDir,
      runDir: options.runDir,
      helper: options.helper,
      seatTimeoutMs: options.seatTimeoutMs,
      log: options.log,
    },
    state,
  );
  await book.resume();

  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  const relays = new Set<{ client?: WebSocket; upstream: WebSocket; socket: Duplex }>();

  const handleRequest = (req: IncomingMessage, res: ServerResponse): void => {
    const path = new URL(req.url ?? "/", "https://hub").pathname;
    if (path !== "/admit") {
      refuse(res, 404, "not_found", "no such route");
      return;
    }
    if (req.method !== "POST") {
      res.setHeader("allow", "POST");
      refuse(res, 405, "method_not_allowed", "POST /admit alone");
      return;
    }
    void (async () => {
      const text = await readBody(req);
      let body: unknown;
      try {
        body = text === undefined ? undefined : JSON.parse(text);
      } catch {
        body = undefined;
      }
      const ticket =
        typeof body === "object" && body !== null && !Array.isArray(body)
          ? (body as { ticket?: unknown }).ticket
          : undefined;
      if (typeof ticket !== "string") {
        refuse(res, 400, "bad_request", "the body must be a JSON object {ticket} with a string ticket");
        return;
      }
      const answer = await book.admit(ticket);
      sendJson(res, answer.status, answer.body);
    })().catch((error: unknown) => {
      options.log(`an admission failed: ${(error as Error).message}`);
      if (!res.headersSent) refuse(res, 500, "internal", "the admission failed");
    });
  };

  const handleUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer): void => {
    socket.on("error", () => socket.destroy());
    const match = /^\/seats\/([^/]+)$/.exec(new URL(req.url ?? "/", "https://hub").pathname);
    const id = match?.[1];
    if (!id || !PERSON_ID.test(id)) {
      refuseUpgrade(socket, 404);
      return;
    }
    if (req.headers.origin !== undefined) {
      refuseUpgrade(socket, 403);
      return;
    }
    const presented = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization ?? "")?.[1];
    const lease = book.lease(id);
    if (!presented || !lease?.bearer_hash || !bearerMatches(presented, lease.bearer_hash)) {
      refuseUpgrade(socket, 401);
      return;
    }
    const token = readSeatToken(options.runDir, id);
    if (!token) {
      refuseUpgrade(socket, 503);
      return;
    }
    const upstream = connectSeat(options.runDir, id, token);
    const relay: { client?: WebSocket; upstream: WebSocket; socket: Duplex } = { upstream, socket };
    relays.add(relay);
    const pending: [RawData, boolean][] = [];
    let unregister: (() => void) | undefined;
    const finish = () => {
      relays.delete(relay);
      unregister?.();
      unregister = undefined;
    };
    socket.once("close", () => {
      if (!relay.client) {
        finish();
        upstream.terminate();
      }
    });
    upstream.on("message", (data, isBinary) => {
      if (!relay.client) pending.push([data, isBinary]);
      else if (relay.client.readyState === WebSocket.OPEN) relay.client.send(data, { binary: isBinary });
    });
    upstream.on("error", () => {
      if (!relay.client) {
        finish();
        refuseUpgrade(socket, 502);
      }
    });
    upstream.on("close", (code, reason) => {
      if (!relay.client) {
        finish();
        if (!socket.destroyed) refuseUpgrade(socket, 502);
        return;
      }
      finish();
      closeSocket(relay.client, forwardable(code), reason);
    });
    upstream.once("open", () => {
      if (socket.destroyed) {
        finish();
        closeSocket(upstream, 1001);
        return;
      }
      wss.handleUpgrade(req, socket, head, (client) => {
        relay.client = client;
        // A lease's end closes the member's side with 4401 and the
        // seat's side as an ordinary close (hub-3).
        unregister = book.addRelay(id, {
          close: (code, reason) => {
            closeSocket(client, code, reason);
            closeSocket(upstream, 1000);
          },
        });
        client.on("error", () => {});
        client.on("message", (data, isBinary) => {
          if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
        });
        client.on("close", (code, reason) => {
          finish();
          closeSocket(upstream, forwardable(code), reason);
        });
        for (const [data, isBinary] of pending.splice(0)) client.send(data, { binary: isBinary });
      });
    });
  };

  const server: HttpsServer = createHttpsServer({ cert, key }, handleRequest);
  server.on("upgrade", handleUpgrade);
  server.on("tlsClientError", () => {});

  let resolveStopped!: () => void;
  const stopped = new Promise<void>((resolveStop) => {
    resolveStopped = resolveStop;
  });
  let closing: Promise<void> | undefined;
  let ticker: NodeJS.Timeout | undefined;
  let controlServer: NetServer | undefined;

  const close = (): Promise<void> => {
    closing ??= (async () => {
      if (ticker) clearInterval(ticker);
      for (const relay of relays) {
        if (relay.client) closeSocket(relay.client, 1001, "hub stopping");
        closeSocket(relay.upstream, 1001);
        relay.socket.destroy();
      }
      relays.clear();
      server.closeAllConnections();
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
      if (controlServer) {
        await new Promise<void>((resolveClose) => controlServer?.close(() => resolveClose()));
      }
      rmSync(control, { force: true });
      await book.close();
      resolveStopped();
    })();
    return closing;
  };

  const answerControl = async (request: ControlRequest): Promise<ControlAnswer> => {
    switch (request.op) {
      case "status":
        return {
          ok: true,
          seats: await book.status(),
          server: {
            id: state.server_id,
            name: state.name,
            instance: state.instance,
            address: state.address,
            attached: state.token !== null,
          },
        };
      case "evict":
        if (!PERSON_ID.test(request.id)) return { ok: false, error: `no seat id: ${request.id}` };
        return { ok: true, evicted: await book.evict(request.id) };
      case "retire": {
        const result = await book.retire();
        return { ok: true, retired: result.seats, failures: result.failures };
      }
      default:
        return { ok: false, error: "unknown operation" };
    }
  };

  controlServer = createNetServer((connection: Socket) => {
    let buffer = "";
    connection.setEncoding("utf8");
    connection.on("error", () => connection.destroy());
    connection.on("data", (chunk: string) => {
      buffer += chunk;
      if (buffer.length > 4096) {
        connection.destroy();
        return;
      }
      const end = buffer.indexOf("\n");
      if (end < 0) return;
      let request: ControlRequest;
      try {
        request = JSON.parse(buffer.slice(0, end)) as ControlRequest;
      } catch {
        connection.end(`${JSON.stringify({ ok: false, error: "bad request" })}\n`);
        return;
      }
      connection.removeAllListeners("data");
      void answerControl(request)
        .catch((error: unknown): ControlAnswer => ({ ok: false, error: (error as Error).message }))
        .then((answer) => {
          connection.end(`${JSON.stringify(answer)}\n`);
          // A retired hub holds no token: it stops serving.
          if (request.op === "retire" && answer.ok) setImmediate(() => void close());
        });
    });
  });

  try {
    await new Promise<void>((resolveListen, rejectListen) => {
      controlServer?.once("error", rejectListen);
      controlServer?.listen(control, () => resolveListen());
    });
    chmodSync(control, 0o600);
    const port = options.port ?? (Number(new URL(state.address).port) || 443);
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once("error", rejectListen);
      server.listen(port, options.host, () => resolveListen());
    });
  } catch (error) {
    await close();
    throw error;
  }

  let ticking = false;
  ticker = setInterval(() => {
    if (ticking) return;
    ticking = true;
    void book
      .renewDue()
      .catch((error: unknown) => options.log(`the renewal round failed: ${(error as Error).message}`))
      .finally(() => {
        ticking = false;
      });
  }, options.renewIntervalMs);

  return {
    port: (server.address() as AddressInfo).port,
    book,
    stopped,
    close,
  };
}

/** Whether a hub answers on the control socket. */
function controlAnswers(path: string): Promise<boolean> {
  return new Promise((resolveProbe) => {
    const socket = connect(path);
    socket.once("connect", () => {
      socket.destroy();
      resolveProbe(true);
    });
    socket.once("error", () => resolveProbe(false));
  });
}

/** Ask the running hub; undefined where none runs. */
export function askHub(stateDir: string, request: ControlRequest): Promise<ControlAnswer | undefined> {
  return new Promise((resolveAsk, rejectAsk) => {
    const socket = connect(controlPath(stateDir));
    let connected = false;
    let text = "";
    socket.setEncoding("utf8");
    socket.once("connect", () => {
      connected = true;
      socket.write(`${JSON.stringify(request)}\n`);
    });
    socket.on("data", (chunk: string) => {
      text += chunk;
    });
    socket.once("error", (error: NodeJS.ErrnoException) => {
      if (!connected && (error.code === "ENOENT" || error.code === "ECONNREFUSED")) resolveAsk(undefined);
      else rejectAsk(new Error(`the running hub did not answer: ${error.message}`));
    });
    socket.once("end", () => {
      try {
        resolveAsk(JSON.parse(text) as ControlAnswer);
      } catch {
        rejectAsk(new Error("the running hub answered nothing readable"));
      }
    });
  });
}
