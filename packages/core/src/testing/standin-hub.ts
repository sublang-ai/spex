// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The stand-in hub (hub-2, DR-132, DR-133): an in-process HTTPS server
// on 127.0.0.1 answering `POST /admit` as a team server's hub does, over
// a fixture certificate a test CA signs — a core under test trusts that
// CA through its own option, never by turning verification off. A
// ticket is redeemed through `redeem`, a stand-in instance's
// `redeemTicket` as a hub redeems it at the instance with its server
// token; an admission answers the seat's `wss:` endpoint under the
// address, a fresh bearer and the lease's expiry, and a test scripts the
// hub's own refusals: the instance's refusal relayed with its status and
// code, `502` for an instance it could not reach, `503` for a seat that
// did not start — and an answer no client can present, an endpoint or a
// bearer it alters.
//
// The relay (hub-3): a WebSocket upgrade at `/seats/<person id>`
// presenting `Authorization: Bearer <bearer>` and no `Origin` is
// admitted where the bearer is one this hub minted for that person and
// its lease neither expired nor ended; any `Origin` is refused `403`, a
// missing, unknown or expired bearer `401`, both without upgrading. An
// admitted relay pipes frames both ways, unread, to the seat a test
// names — a second core's endpoint with its token — and either side
// closing closes the other; ending the leases closes every relay with
// `4401`. In one mode alone the hub rewrites the seat's hello to carry
// another protocol version. Not re-exported from `./index.ts`.

import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:https";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer, type RawData } from "ws";

import type { StandinPerson, StandinRedemption } from "./standin-host.js";

/** The test CA, PEM: the one a core under test is told to trust beside
 * the system's (DR-133). A fixture of this suite alone. */
export const STANDIN_HUB_CA = `-----BEGIN CERTIFICATE-----
MIIBrDCCAVOgAwIBAgIUN6S5Xdct3oApw66ZsbZ4Y/io9rIwCgYIKoZIzj0EAwIw
JDEiMCAGA1UEAwwZU3BleCBzdGFuZC1pbiBodWIgdGVzdCBDQTAeFw0yNTAxMDEw
MDAwMDBaFw00NTAxMDEwMDAwMDBaMCQxIjAgBgNVBAMMGVNwZXggc3RhbmQtaW4g
aHViIHRlc3QgQ0EwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAATXQiBamZPWSCwX
0whIxeX+RKjE0t59SBrwmXMjmdM4Mblf1Bwjd/Rwn9JPOEBwZfcEdCcxkgYrVnYs
0TLdFF3Wo2MwYTAdBgNVHQ4EFgQUaGaN+biVCi2dcZtjcen//uGUsxAwHwYDVR0j
BBgwFoAUaGaN+biVCi2dcZtjcen//uGUsxAwDwYDVR0TAQH/BAUwAwEB/zAOBgNV
HQ8BAf8EBAMCAQYwCgYIKoZIzj0EAwIDRwAwRAIgBRGhjrkQpC08D2EmpW7PXaM9
i5dviMkRx/pV5DysVBACID7Gnl/vHS7O27ktSJ8ctehjozPBomVt/VPR9olViu9S
-----END CERTIFICATE-----
`;

/** The hub's certificate, for `localhost` and `127.0.0.1`, signed by
 * the test CA, and its key: fixtures, valid 2025 to 2045. */
const HUB_CERT = `-----BEGIN CERTIFICATE-----
MIIBzTCCAXOgAwIBAgIUA6W30Kt/vbNC2eBZaEH0kwXsQywwCgYIKoZIzj0EAwIw
JDEiMCAGA1UEAwwZU3BleCBzdGFuZC1pbiBodWIgdGVzdCBDQTAeFw0yNTAxMDEw
MDAwMDBaFw00NTAxMDEwMDAwMDBaMBQxEjAQBgNVBAMMCWxvY2FsaG9zdDBZMBMG
ByqGSM49AgEGCCqGSM49AwEHA0IABLvNJsQ6OcYsxZyjoHn9ML7jBbM71tMikxRJ
UerWuFPZ5J3i3u3CYuyI345O3IpoMLaw+Q3supGB8aL6Xb2h0GajgZIwgY8wDAYD
VR0TAQH/BAIwADAOBgNVHQ8BAf8EBAMCB4AwEwYDVR0lBAwwCgYIKwYBBQUHAwEw
GgYDVR0RBBMwEYIJbG9jYWxob3N0hwR/AAABMB0GA1UdDgQWBBS5O61/oCuGhRrj
wYzPwA7K4dAQjjAfBgNVHSMEGDAWgBRoZo35uJUKLZ1xm2Nx6f/+4ZSzEDAKBggq
hkjOPQQDAgNIADBFAiAdwwXQ0nNTW9kods37wL52hKFve6GdDxXUAuQN9cJHiAIh
AN2CcBFqbCqqPP3TY9HLpFwRZoWh2qIIFSLfryr3CJ7f
-----END CERTIFICATE-----
`;
const HUB_KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgO1laQJ6TIloL03QN
eYcU5ipNvOgUbgXWCAX926mbqi6hRANCAAS7zSbEOjnGLMWco6B5/TC+4wWzO9bT
IpMUSVHq1rhT2eSd4t7twmLsiN+OTtyKaDC2sPkN7LqRgfGi+l29odBm
-----END PRIVATE KEY-----
`;

/** One `POST /admit`, as the hub answered it: the ticket the body
 * carried — null where it carried none — the status, and, for an
 * admission, the endpoint and the bearer it issued. */
export interface StandinAdmission { ticket: string | null; status: number; endpoint: string | null; bearer: string | null }

/** One relay upgrade asked (hub-3): its path, whether it carried an
 * `Origin` header or an `Authorization` header, and the status it was
 * answered with — `101` where it was upgraded. */
export interface StandinUpgrade { path: string; origin: boolean; authorization: boolean; status: number }

export interface StandinHub {
  /** The hub's address, `https://127.0.0.1:<port>`: the origin a
   * server's record holds (servers-1). */
  url: string;
  /** The CA its certificate chains to, PEM. */
  ca: string;
  /** Every admission asked, in order. */
  admissions: StandinAdmission[];
  /** Every relay upgrade asked, in order (hub-3). */
  upgrades: StandinUpgrade[];
  /** The relays open now. */
  relays(): number;
  /** Answer the next `count` admissions with `status` and the envelope
   * `{error: {code, message}}`, the ticket left unspent: a hub relaying
   * the instance's refusal, `502` for the instance unreachable, `503`
   * for a seat that did not start (hub-2). */
  refuse(count: number, status: number, code: string, message: string): void;
  /** The seat every admitted relay pipes to: a WebSocket URL with its
   * token, a second core's endpoint; null answers relays `502`. */
  relayTo(seat: string | null): void;
  /** Rewrite the seat's hello to carry `version` as its protocol
   * version, every other frame unread; null relays it as it is. */
  helloVersion(version: number | null): void;
  /** Answer the next `count` admissions with the endpoint and the
   * bearer `alter` makes of the ones minted — an answer a client cannot
   * present — the ticket spent and the lease kept under the bearer
   * minted. */
  misanswer(count: number, alter: (answer: SeatAnswer) => SeatAnswer): void;
  /** Answer the next `count` admissions `ms` after their ticket's
   * redemption, as a hub starting a seat answers once it stands. */
  delay(count: number, ms: number): void;
  /** Close every relay as a restarting hub does, each lease kept: the
   * member's side with `1001`, so a watch reconnects. */
  drop(): void;
  /** End every lease minted so far: each relay closed with `4401`, each
   * bearer refused `401` from here on (hub-3, hub-5). */
  endLeases(): void;
  close(): Promise<void>;
}

/** An admission's endpoint and bearer. */
export interface SeatAnswer { endpoint: string; bearer: string }

export interface StandinHubOptions {
  /** The redemption of a ticket at the instance (servers-7); by default
   * every ticket admits `ada`. */
  redeem?: (ticket: string) => StandinRedemption | Promise<StandinRedemption>;
}

const DEFAULT_PERSON: StandinPerson = { id: "1001", login: "ada", displayName: "Ada Lovelace" };

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(text), "cache-control": "no-store" });
  res.end(text);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

const STATUS_TEXT: Record<number, string> = { 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 502: "Bad Gateway" };

/** Answer an upgrade request without upgrading it. */
function refuseUpgrade(socket: Duplex, status: number): void {
  if (!socket.writable) {
    socket.destroy();
    return;
  }
  socket.end(`HTTP/1.1 ${status} ${STATUS_TEXT[status] ?? "Error"}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.once("finish", () => socket.destroy());
}

/** A close code one peer received, as the other may be sent it. */
function forwardable(code: number): number | undefined {
  if (code === 1005) return undefined;
  if ((code >= 1000 && code <= 1003) || (code >= 1007 && code <= 1014) || (code >= 3000 && code <= 4999)) return code;
  return 1011;
}

function closeSocket(socket: WebSocket, code?: number): void {
  if (socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED) return;
  if (socket.readyState === WebSocket.CONNECTING) {
    socket.terminate();
    return;
  }
  if (code === undefined) socket.close();
  else socket.close(code);
}

/** A lease this hub minted a bearer for. */
interface Lease { person: string; expiresAt: number; ended: boolean }

/** One admitted relay: the member's side and the seat's. */
interface Relay { client?: WebSocket; upstream: WebSocket }

/** Start a stand-in hub on an OS-assigned loopback port. */
export async function startStandinHub(options: StandinHubOptions = {}): Promise<StandinHub> {
  const redeem = options.redeem ?? ((): StandinRedemption => ({
    person: DEFAULT_PERSON,
    server: { id: "standin-server", name: "Stand-in server" },
    leaseExpiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  }));
  const admissions: StandinAdmission[] = [];
  const upgrades: StandinUpgrade[] = [];
  const refusals: { status: number; code: string; message: string }[] = [];
  const misanswers: ((answer: SeatAnswer) => SeatAnswer)[] = [];
  const delays: number[] = [];
  /** Each bearer minted, by itself. */
  const leases = new Map<string, Lease>();
  const relays = new Set<Relay>();
  let seat: string | null = null;
  let rewriteHello: number | null = null;
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  const server = createServer({ cert: HUB_CERT, key: HUB_KEY });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  const url = `https://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const host = new URL(url).host;

  server.on("request", (req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const path = new URL(req.url ?? "/", url).pathname;
      if (path !== "/admit") return json(res, 404, { error: { code: "not_found", message: "no such route" } });
      if (req.method !== "POST") return json(res, 405, { error: { code: "method_not_allowed", message: "POST /admit alone" } });
      let body: unknown;
      try { body = JSON.parse(await readBody(req)); } catch { body = undefined; }
      const ticket = typeof body === "object" && body !== null && !Array.isArray(body) ? (body as { ticket?: unknown }).ticket : undefined;
      if (typeof ticket !== "string") {
        admissions.push({ ticket: null, status: 400, endpoint: null, bearer: null });
        return json(res, 400, { error: { code: "bad_request", message: "the body must be a JSON object {ticket} with a string ticket" } });
      }
      const refusal = refusals.shift();
      if (refusal) {
        admissions.push({ ticket, status: refusal.status, endpoint: null, bearer: null });
        return json(res, refusal.status, { error: { code: refusal.code, message: refusal.message } });
      }
      const answer = await redeem(ticket);
      if ("status" in answer) {
        // The instance's refusal, relayed with its status and code (hub-2).
        admissions.push({ ticket, status: answer.status, endpoint: null, bearer: null });
        return json(res, answer.status, { error: { code: answer.code, message: answer.message } });
      }
      // A seat starting: the answer waits as the test scripted it.
      const wait = delays.shift();
      if (wait !== undefined) await new Promise((resolveWait) => setTimeout(resolveWait, wait));
      const minted = randomBytes(32).toString("base64url");
      leases.set(minted, { person: answer.person.id, expiresAt: Date.parse(answer.leaseExpiresAt), ended: false });
      const seatAnswer = { endpoint: `wss://${host}/seats/${answer.person.id}`, bearer: minted };
      const { endpoint, bearer } = misanswers.shift()?.(seatAnswer) ?? seatAnswer;
      admissions.push({ ticket, status: 200, endpoint, bearer });
      return json(res, 200, {
        endpoint,
        bearer,
        lease_expires_at: answer.leaseExpiresAt,
        person: { id: answer.person.id, login: answer.person.login, display_name: answer.person.displayName },
      });
    })().catch(() => {
      if (!res.headersSent) json(res, 500, { error: { code: "internal", message: "the admission failed" } });
    });
  });

  /** The seat's hello as this hub's mode relays it: rewritten to
   * another protocol version in that mode alone. */
  const relayed = (data: RawData, isBinary: boolean, first: boolean): RawData | string => {
    if (!first || isBinary || rewriteHello === null) return data;
    try {
      const message = JSON.parse(String(data)) as Record<string, unknown>;
      if (message.type === "hello") return JSON.stringify({ ...message, protocolVersion: rewriteHello });
    } catch {
      // Not the hello: relayed as it is.
    }
    return data;
  };

  // The relay (hub-3).
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    socket.on("error", () => socket.destroy());
    const path = new URL(req.url ?? "/", url).pathname;
    const answer = (status: number): void => {
      upgrades.push({ path, origin: req.headers.origin !== undefined, authorization: req.headers.authorization !== undefined, status });
      if (status !== 101) refuseUpgrade(socket, status);
    };
    const person = /^\/seats\/([^/]+)$/.exec(path)?.[1];
    if (!person) return answer(404);
    if (req.headers.origin !== undefined) return answer(403);
    const presented = /^Bearer (\S+)$/.exec(req.headers.authorization ?? "")?.[1];
    const lease = presented === undefined ? undefined : leases.get(presented);
    if (!lease || lease.person !== person || lease.ended || lease.expiresAt <= Date.now()) return answer(401);
    if (seat === null) return answer(502);
    const upstream = new WebSocket(seat, { perMessageDeflate: false });
    const relay: Relay = { upstream };
    relays.add(relay);
    const pending: [RawData | string, boolean][] = [];
    let first = true;
    upstream.on("error", () => undefined);
    upstream.on("message", (data, isBinary) => {
      const frame = relayed(data, isBinary, first);
      first = false;
      if (!relay.client) pending.push([frame, isBinary]);
      else if (relay.client.readyState === WebSocket.OPEN) relay.client.send(frame, { binary: isBinary });
    });
    upstream.on("close", (code) => {
      relays.delete(relay);
      if (!relay.client) {
        if (!socket.destroyed) answer(502);
        return;
      }
      closeSocket(relay.client, forwardable(code));
    });
    upstream.once("open", () => {
      if (socket.destroyed) {
        relays.delete(relay);
        closeSocket(upstream, 1001);
        return;
      }
      wss.handleUpgrade(req, socket, head, (client) => {
        answer(101);
        relay.client = client;
        client.on("error", () => undefined);
        client.on("message", (data, isBinary) => {
          if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
        });
        client.on("close", (code) => {
          relays.delete(relay);
          closeSocket(upstream, forwardable(code));
        });
        for (const [data, isBinary] of pending.splice(0)) client.send(data, { binary: isBinary });
      });
    });
  });

  return {
    url,
    ca: STANDIN_HUB_CA,
    admissions,
    upgrades,
    relays: () => relays.size,
    refuse: (count, status, code, message) => {
      for (let i = 0; i < count; i += 1) refusals.push({ status, code, message });
    },
    relayTo: (target) => { seat = target; },
    helloVersion: (version) => { rewriteHello = version; },
    misanswer: (count, alter) => {
      for (let i = 0; i < count; i += 1) misanswers.push(alter);
    },
    delay: (count, ms) => {
      for (let i = 0; i < count; i += 1) delays.push(ms);
    },
    drop: () => {
      for (const relay of [...relays]) {
        relays.delete(relay);
        if (relay.client) closeSocket(relay.client, 1001);
        closeSocket(relay.upstream, 1000);
      }
    },
    endLeases: () => {
      for (const lease of leases.values()) lease.ended = true;
      // A lease's end closes the member's side with 4401 and the seat's
      // as an ordinary close (hub-3).
      for (const relay of [...relays]) {
        relays.delete(relay);
        if (relay.client) closeSocket(relay.client, 4401);
        closeSocket(relay.upstream, 1000);
      }
    },
    close: () => new Promise<void>((resolveClose) => {
      for (const relay of [...relays]) {
        relay.client?.terminate();
        relay.upstream.terminate();
      }
      relays.clear();
      wss.close();
      server.close(() => resolveClose());
      server.closeAllConnections();
    }),
  };
}
