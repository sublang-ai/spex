// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The places of one desktop (core-service-128, DR-133): the local core
// opens, holds and closes the seats the person holds on team servers.
// `server.list` reads each signed-in instance's servers listing, each
// instance standing or failing on its own (git-host-29, git-host-11);
// `server.open`, with the person's consent to the contract, reads the
// instance's listing for the server's name, group and address — a
// server it does not name no longer shared, no ticket asked — then asks
// the instance for a ticket, presents it at that address over TLS for
// the admission (hub-2), keeps the seat's endpoint, bearer and lease
// expiry in `local/seats.yaml` (storage-45) and starts the seat's relay;
// `server.close` ends the relay and removes the entry, the lease going
// on at the server. Every change of the open seats is announced to every
// client as `server.state`. A seat's place is its key in the seats file,
// `<instance origin>#<server id>`, shown by the server's name.
//
// The relay (core-service-129): while a seat is open the core's own
// endpoint admits `/seats/<place>`, the place percent-encoded, as it
// admits `/`; each client connection there is piped, frames unread both
// ways, through a connection of its own to the seat's endpoint over TLS
// presenting the bearer in the `Authorization` header and no `Origin`
// (hub-3). Beside them one watch connection per seat relays nothing: it
// reconnects every second as a client does, reads the seat's hello — a
// protocol version other than this core's marks the place mismatched
// and stops its reconnecting — and reads the seat's ledger badge on
// every `intents.changed` there, which the shell's attention count adds
// to this core's own while the relay stands open or closed — a
// mismatched seat's counts no more. A close with the lease-end code, or
// the seat refusing the bearer, removes the seat as a close does.
//
// The seat's sign-in (core-service-142, DR-159): at a relay's first
// hello, and at `server.signin`, a connection of the core's own reads
// the seat's Groups state as any client does and, where the seat is not
// signed in at its instance, starts the seat's sign-in there — the
// device flow, the seat's request naming the server and the person and,
// at the first hello of an open this core made, the ticket that open
// presented, held in memory until then and no longer (DR-161) — carrying
// it as the seat's `signIn` in `server.state`: pending, running with the
// page where the person approves it — for a start carrying the ticket,
// only once the first poll interval passed with no grant — signed in, or
// failed with the seat's cause. Nothing starts a flow again on its own;
// the seat's app token stays on the server.
//
// The bearer and the endpoint never leave this module and the seats
// file: no reply, event, error message or log line carries either, nor
// the ticket.

import { request } from "node:https";
import { getCACertificates, rootCertificates, type TLSSocket } from "node:tls";
import { WebSocket, type RawData } from "ws";
import { BROWSER_SIGN_IN_TIMEOUT_MS, CredentialChanged, HostError, type GitHostClient, type HostServer, type HostTicket } from "./git-host.js";
import { i18n } from "./i18n.js";
import { canonicalOrigin } from "./instance.js";
import { PROTOCOL_VERSION, type SeatRelayState, type SeatSignIn, type SeatState, type ServerInfo, type ServerListing } from "./protocol.js";
import { fileSeatStore, placeOf, splitPlace, type SeatEntry, type SeatStore } from "./seats.js";
import { CoreError } from "./session.js";
import { noLongerShared } from "./space-git.js";
import { couldNotReach, relayHostError } from "./space-groups.js";

/** The longest an admission is awaited (core-service-128): the hub's
 * one bound covers the whole admission — the seat's account, its unit
 * and its socket — at sixty seconds (hub-2); this waits longer, so no
 * admission the hub still runs is one this core gave up on. */
const ADMIT_TIMEOUT_MS = 90_000;
/** The most of an admission's answer read. */
const ANSWER_MAX_BYTES = 64 * 1024;
/** The watch reconnects as a client does: every second (core-service-129). */
const WATCH_RECONNECT_MS = 1_000;
/** The longest a connection to a seat may take to open: the hub waits
 * for the seat's socket before it upgrades (hub-3). */
const SEAT_HANDSHAKE_MS = 30_000;
/** The close code a seat's lease ending closes its relays with (hub-3). */
const LEASE_END = 4401;
/** The ids of the watch's own `ledger.get` commands. */
const WATCH_ID = "spex-watch-ledger";
/** The ids of the sign-in connection's own commands (core-service-142). */
const SIGNIN_ID = "spex-seat-signin";
/** The poll interval a seat's start is read with where its reply names
 * none, in seconds, as the device flow polls (git-host-3). */
const DEFAULT_POLL_INTERVAL_S = 5;
/** The margin past a start's first poll interval within which a grant
 * on the ticket keeps the page unshown (core-service-142). */
const TICKET_GRANT_MARGIN_MS = 2_000;

/** What the places need of the core (DR-133). */
export interface PlacesHost {
  /** The Spex home, whose `local/seats.yaml` holds the seats. */
  homeDir: string;
  /** The origins of the instances the home lists and is signed in to,
   * in its order (storage-2). */
  signedInOrigins(): string[];
  /** A listed instance a command names, signed in there, by its
   * canonical origin; refused otherwise (space-29). */
  signedInInstance(named: string): string;
  /** The client this core keeps for an instance (git-host-4). */
  clientOf(origin: string): GitHostClient;
  /** An instance's name in what the core says of it (space-15). */
  instanceName(origin: string): string;
  /** Announce the open seats to every client. */
  broadcast(seats: SeatState[]): void;
  /** An open seat's badge read anew, or a seat with one gone or turned
   * mismatched: the shell's attention count moved (core-service-129). */
  attentionChanged?(): void;
  /** CA certificates, PEM, trusted beside the system's at a server's
   * address: a test's fixture CA. */
  certificateAuthorities?: readonly string[];
  /** A test's scale of the admission's wait, 1 by default: a suite
   * stands a fraction of a second in for each of its seconds. */
  admitTimeScale?: number;
}

/** An admission the server answered (hub-2), held by the seats file
 * alone. */
interface Admitted { endpoint: string; bearer: string; leaseExpiresAt: number }

/** An admission that did not admit (hub-2): the server not reached, its
 * certificate not verified, an answer that is no admission, or the
 * server's refusal with its status, its code and its words. Its message
 * names none of the secrets. */
class AdmissionFailed extends Error {
  constructor(
    readonly kind: "unreachable" | "untrusted" | "unanswered" | "refused",
    readonly status: number | null = null,
    readonly words: string | null = null,
  ) {
    super(`admission ${kind}${status !== null ? ` ${status}` : ""}`);
    this.name = "AdmissionFailed";
  }
}

// -- phrases (core-service-111) ----------------------------------------------

const consentFirst = (): string => i18n._({
  id: "Read and accept the server's contract before opening a seat",
  comment: "Refusal of a seat's opening sent without the person's consent to the contract the instance's record fixes for team servers",
});

const noSeatOpen = (): string => i18n._({
  id: "No seat is open on this server",
  comment: "Refusal of a seat's closing: this device holds no seat on the server named",
});

const seatsChanged = (): string => i18n._({
  id: "The seats changed meanwhile; try again",
  comment: "Refusal of a seat's opening or closing: the seats file changed between the core's read and its write",
});

const seatStopping = (): string => i18n._({
  id: "The core is stopping.",
  comment: "Refusal during core shutdown",
});

/** How an admission that did not admit reads (core-service-128): the
 * server's refusal with its words kept whole, nothing claimed it did not
 * say. */
function admissionFailure(error: AdmissionFailed, server: string, host: string): string {
  if (error.kind === "unreachable") return couldNotReach(server);
  if (error.kind === "untrusted") {
    return i18n._({
      id: "{server}'s certificate could not be verified",
      values: { server },
      comment: "A seat's opening failed: the team server's TLS certificate did not verify against the trusted certificate authorities, so nothing was sent to it; {server} is the server's name",
    });
  }
  if (error.kind === "unanswered") {
    return i18n._({
      id: "{server} answered no seat",
      values: { server },
      comment: "A seat's opening failed: the team server answered its admission with nothing that opens a seat; {server} is the server's name",
    });
  }
  if (error.status === 502) {
    return i18n._({
      id: "{server} could not reach {host}",
      values: { server, host },
      comment: "A seat's opening failed: the team server could not reach the instance to redeem the ticket; {server} is the server's name, {host} the instance's display name",
    });
  }
  if (error.status === 503) {
    return error.words
      ? i18n._({
          id: "{server} could not start your seat: {words}",
          values: { server, words: error.words },
          comment: "A seat's opening failed: the team server did not start the person's seat; {server} is the server's name, {words} its own words, kept whole",
        })
      : i18n._({
          id: "{server} could not start your seat",
          values: { server },
          comment: "A seat's opening failed: the team server did not start the person's seat and said no more; {server} is the server's name",
        });
  }
  return error.words
    ? i18n._({
        id: "{server} refused the seat: {words}",
        values: { server, words: error.words },
        comment: "A seat's opening refused by the team server, its refusal relayed from it or from the instance; {server} is the server's name, {words} its own words, kept whole",
      })
    : i18n._({
        id: "{server} refused the seat",
        values: { server },
        comment: "A seat's opening refused by the team server with no words of its own; {server} is the server's name",
      });
}

/** An instance's answer other than success as the command's error
 * (git-host-11): its `not_found` as no longer shared, a pair replaced
 * meanwhile as changed meanwhile, anything else a refusal in its words. */
function hostRefusal(error: unknown, host: string): CoreError {
  if (error instanceof HostError && error.kind === "not_found") return new CoreError("not_found", noLongerShared());
  if (error instanceof CredentialChanged) return new CoreError("conflict", relayHostError(error, host));
  return new CoreError("invalid_request", relayHostError(error, host));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The trust anchors an admission verifies the server against: the
 * system's CA certificates beside Node's own, and any a test names
 * (DR-133); never verification turned off. Undefined leaves Node's
 * default where it reads no certificate list.
 */
function trustAnchors(extra: readonly string[]): string[] | undefined {
  let base: string[] | undefined;
  try {
    base = [...new Set([...getCACertificates("default"), ...getCACertificates("system")])];
  } catch {
    base = undefined;
  }
  if (base === undefined) return extra.length === 0 ? undefined : [...rootCertificates, ...extra];
  return [...base, ...extra];
}

/** A bearer as it may travel in the `Authorization` header: the
 * token68 form of RFC 6750's `b64token`, visible ASCII alone. */
const BEARER_FORM = /^[A-Za-z0-9\-._~+/]+=*$/;

/**
 * A seat's endpoint and bearer a connection to the seat can present
 * (core-service-129, hub-3): the endpoint a `wss:` URL with no
 * credentials and no fragment, the bearer of the token68 form. The URL,
 * or null where either would not make a connection — read the same at
 * an admission, so nothing unusable is kept, and at every connection,
 * so no entry the file holds can throw.
 */
function seatTarget(endpoint: string, bearer: string): URL | null {
  if (!BEARER_FORM.test(bearer) || endpoint.includes("#")) return null;
  let at: URL;
  try { at = new URL(endpoint); } catch { return null; }
  if (at.protocol !== "wss:" || at.username !== "" || at.password !== "") return null;
  return at;
}

/** A successful admission's answer (hub-2): the seat's `wss:` endpoint
 * under the address the ticket named, a bearer, the lease's expiry. */
function admittedFrom(json: unknown, address: URL): Admitted {
  if (!isRecord(json)) throw new AdmissionFailed("unanswered");
  const { endpoint, bearer, lease_expires_at: expires } = json;
  if (typeof endpoint !== "string" || typeof bearer !== "string") throw new AdmissionFailed("unanswered");
  const at = seatTarget(endpoint, bearer);
  // The bearer goes to the server it came from alone.
  if (!at || at.host !== address.host) throw new AdmissionFailed("unanswered");
  const leaseExpiresAt = typeof expires === "string" ? Date.parse(expires) : Number.NaN;
  if (!Number.isFinite(leaseExpiresAt)) throw new AdmissionFailed("unanswered");
  return { endpoint, bearer, leaseExpiresAt };
}

/**
 * Present a ticket at a server's address for the admission (hub-2):
 * `POST <address>/admit` with `{ticket}` over TLS, verified against
 * `ca`, on a connection of its own. A refusal throws with its status and
 * the server's words; a certificate that does not verify throws
 * untrusted, the ticket never sent; no answer within `waitMs` throws
 * unreachable.
 */
function admitAt(address: string, ticket: string, ca: string[] | undefined, waitMs: number): Promise<Admitted> {
  let target: URL;
  try { target = new URL("/admit", address); } catch { return Promise.reject(new AdmissionFailed("unreachable")); }
  if (target.protocol !== "https:") return Promise.reject(new AdmissionFailed("unreachable"));
  const body = JSON.stringify({ ticket });
  return new Promise<Admitted>((resolveAdmit, rejectAdmit) => {
    let settled = false;
    const settle = (outcome: () => Admitted): void => {
      if (settled) return;
      settled = true;
      try { resolveAdmit(outcome()); } catch (error) { rejectAdmit(error); }
    };
    // The socket's authorization error is set where the server's
    // certificate, or the name it holds, did not verify: the connection
    // ends before the ticket is sent.
    let socket: TLSSocket | undefined;
    const fail = (): void => settle(() => { throw new AdmissionFailed(socket?.authorizationError ? "untrusted" : "unreachable"); });
    const req = request(target, {
      method: "POST",
      agent: false,
      timeout: waitMs,
      ...(ca ? { ca } : {}),
      headers: { "content-type": "application/json", accept: "application/json", "content-length": Buffer.byteLength(body) },
    }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > ANSWER_MAX_BYTES) { req.destroy(); return; }
        chunks.push(chunk);
      });
      res.on("end", () => settle(() => {
        const status = res.statusCode ?? 0;
        let json: unknown = null;
        try { json = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { json = null; }
        if (status === 200) return admittedFrom(json, target);
        const error = isRecord(json) && isRecord(json.error) ? json.error : {};
        throw new AdmissionFailed("refused", status, typeof error.message === "string" && error.message.length > 0 ? error.message : null);
      }));
      res.on("error", fail);
      res.on("close", fail);
    });
    req.on("socket", (opened) => { socket = opened as TLSSocket; });
    req.on("timeout", () => req.destroy());
    req.on("error", fail);
    req.end(body);
  });
}

/** One client connection piped to its own connection to the seat. */
interface Pipe { client: WebSocket; upstream: WebSocket }

/** An open seat's relay (core-service-129): the entry it connects with,
 * its state, its watch, the seat's last read badge and the client
 * connections piped to the seat; and the seat's sign-in at its instance
 * (core-service-142) — its state, held in memory alone, the connection
 * reading or running it, the id of the flow that connection started,
 * whether the relay's first hello asked it, the ticket the open presented
 * until that hello's start takes it, and the timer holding a running
 * flow's page while an instance may still grant on that ticket. */
interface Relay {
  entry: SeatEntry;
  state: SeatRelayState;
  watch?: WebSocket;
  timer?: NodeJS.Timeout;
  badge: number;
  pipes: Set<Pipe>;
  ended: boolean;
  signIn: SeatSignIn;
  signInSocket?: WebSocket;
  signInFlow?: string;
  signInAsked: boolean;
  ticket?: string;
  signInHold?: NodeJS.Timeout;
}

/** Whether a seat's Groups state lists the instance at `origin` signed
 * in (core-service-142). */
function signedInThere(groups: unknown, origin: string): boolean {
  if (!isRecord(groups) || !Array.isArray(groups.instances)) return false;
  return groups.instances.some((instance: unknown) => {
    if (!isRecord(instance) || instance.signedIn !== true || typeof instance.origin !== "string") return false;
    try {
      return canonicalOrigin(instance.origin) === origin;
    } catch {
      return false;
    }
  });
}

/** A started sign-in's reply as the seat's `signIn` reads it
 * (core-service-142): the device flow's page with the code carried in
 * it and its expiry; a browser flow's page, which lasts as long as such
 * a flow does; null for anything else. */
function runningOf(result: unknown): SeatSignIn | null {
  if (!isRecord(result)) return null;
  if (result.flow === "device" && typeof result.verificationUri === "string" && typeof result.expiresAt === "number") {
    return { state: "running", verificationUri: result.verificationUri, expiresAt: result.expiresAt };
  }
  if (result.flow === "browser" && typeof result.url === "string") {
    return { state: "running", verificationUri: result.url, expiresAt: Date.now() + BROWSER_SIGN_IN_TIMEOUT_MS };
  }
  return null;
}

/** The seconds between polls a started sign-in's reply names
 * (git-host-3), five where it names none (core-service-142). */
function intervalOf(result: unknown): number {
  const interval = isRecord(result) ? result.interval : undefined;
  return typeof interval === "number" && Number.isFinite(interval) && interval > 0 ? interval : DEFAULT_POLL_INTERVAL_S;
}

/** A refusal's words from the seat — a reply's or a completion's error —
 * as the seat's one-sentence cause; null where it carries none. */
function causeOf(message: Record<string, unknown>): string | null {
  const error = message.error;
  return isRecord(error) && typeof error.message === "string" && error.message.length > 0 ? error.message : null;
}

/** The badge a relay adds to the attention count: the seat's last read
 * badge while its relay stands open or closed, none for a mismatched
 * seat (core-service-129). */
function counted(relay: Relay): number {
  return relay.state === "mismatched" ? 0 : relay.badge;
}

/** A relay path, `/seats/<place>` with the place percent-encoded: the
 * place it names, or null. */
function placeAtPath(path: string): string | null {
  const match = /^\/seats\/([^/]+)$/.exec(path);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/** A close code one peer received, as the other may be sent it: none
 * where none was sent, an abnormal end as an internal error. */
function forwardable(code: number): number | undefined {
  if (code === 1005) return undefined;
  if ((code >= 1000 && code <= 1003) || (code >= 1007 && code <= 1014) || (code >= 3000 && code <= 4999)) return code;
  return 1011;
}

/** Close a socket with a code, ending one still connecting. */
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

/**
 * A connection of the core's own to a seat's endpoint (core-service-129,
 * hub-3): TLS verified against `ca`, the bearer in the `Authorization`
 * header, no `Origin`. `refused` hears the status of an upgrade the
 * server answered without upgrading, before the socket closes. None
 * where the entry would make no connection — an endpoint other than a
 * plain `wss:` URL, the bearer going nowhere else, or a bearer no
 * header carries — and none where the connection could not be made:
 * never a throw, so no entry stops the core's start, an open or a
 * client's connection.
 */
function connectSeat(entry: SeatEntry, ca: string[] | undefined, refused: (status: number) => void): WebSocket | null {
  const target = seatTarget(entry.endpoint, entry.bearer);
  if (!target) return null;
  let socket: WebSocket;
  try {
    socket = new WebSocket(target, {
      headers: { authorization: `Bearer ${entry.bearer}` },
      perMessageDeflate: false,
      followRedirects: false,
      handshakeTimeout: SEAT_HANDSHAKE_MS,
      ...(ca ? { ca } : {}),
    });
  } catch {
    // A throw's message may name the endpoint: none is read or kept.
    return null;
  }
  // An error's message may name the endpoint: none is read or kept.
  socket.on("error", () => undefined);
  socket.on("unexpected-response", (_req, res) => {
    refused(res.statusCode ?? 0);
    res.resume();
    socket.terminate();
  });
  return socket;
}

/** A message's JSON object, or null. */
function messageOf(data: RawData, isBinary: boolean): Record<string, unknown> | null {
  if (isBinary) return null;
  try {
    const value: unknown = JSON.parse(String(data));
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * The seats this core holds on team servers, and the commands that open
 * and close them (core-service-128).
 */
export class Places {
  private readonly store: SeatStore;
  /** Each held seat's relay, by place (core-service-129). */
  private readonly relays = new Map<string, Relay>();
  /** One open or close at a time per place. */
  private readonly queues = new Map<string, Promise<unknown>>();
  private anchors?: string[] | null;
  private stopping = false;
  /** The sign-ins the core read or started, numbering their commands. */
  private signIns = 0;

  constructor(private readonly host: PlacesHost) {
    this.store = fileSeatStore(host.homeDir);
  }

  /**
   * At the core's start (core-service-128): every seat the file holds is
   * read and reopened through its relay's watch, and the seats
   * announced; a refusal there removes the entry as a close does
   * (core-service-129).
   */
  start(): void {
    let seats: Map<string, SeatEntry>;
    try {
      seats = this.store.list();
    } catch (error) {
      // The file's own refusal names the file alone, never a field.
      console.error(`spex: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    for (const [place, entry] of seats) this.startRelay(place, entry);
    this.announce();
  }

  /** The open seats as `server.state` carries them, read from their file
   * as it stands; none where it will not read. */
  state(): SeatState[] {
    let seats: Map<string, SeatEntry>;
    try { seats = this.store.list(); } catch { return []; }
    const out: SeatState[] = [];
    for (const [place, entry] of seats) {
      const at = splitPlace(place);
      if (!at) continue;
      out.push({
        instance: at.origin,
        serverId: at.serverId,
        name: entry.name,
        group: entry.group,
        place,
        leaseExpiresAt: entry.leaseExpiresAt,
        relay: this.relays.get(place)?.state ?? "closed",
        signIn: this.relays.get(place)?.signIn ?? { state: "pending" },
      });
    }
    return out;
  }

  /** `server.list` (core-service-128): every signed-in instance's
   * servers, each instance's read standing or failing on its own. */
  async list(): Promise<ServerListing> {
    type Read = { origin: string; servers: HostServer[] } | { origin: string; failure: string };
    const reads = await Promise.all(this.host.signedInOrigins().map(async (origin): Promise<Read> => {
      try {
        return { origin, servers: await this.host.clientOf(origin).servers() };
      } catch (error) {
        return { origin, failure: relayHostError(error, this.host.instanceName(origin)) };
      }
    }));
    let open: Set<string>;
    try { open = new Set(this.store.list().keys()); } catch { open = new Set(); }
    const servers: ServerInfo[] = [];
    const failures: ServerListing["failures"] = [];
    for (const read of reads) {
      if ("failure" in read) {
        failures.push({ instance: read.origin, message: read.failure });
        continue;
      }
      for (const server of read.servers) {
        servers.push({ instance: read.origin, id: server.id, name: server.name, group: server.group.fullPath, open: open.has(placeOf(read.origin, server.id)) });
      }
    }
    return { servers, failures };
  }

  /**
   * `server.open` (core-service-128): with the person's consent, the
   * server's name, group and address read from the instance's listing —
   * a server it does not name no longer shared, no ticket asked — a
   * ticket asked for, presented at that address, the admission awaited
   * ninety seconds, and the seat kept, its relay started and announced,
   * the relay's first hello starting the seat's sign-in with the ticket
   * (core-service-142); the reply carries the place and the expiry
   * alone. Without consent nothing is asked. A seat opens none: the
   * service refuses it before this (core-service-125).
   */
  async open(input: { instance: string; serverId: string; consented?: boolean }): Promise<{ place: string; leaseExpiresAt: number }> {
    if (input.consented !== true) throw new CoreError("invalid_request", consentFirst());
    if (this.stopping) throw new CoreError("busy", seatStopping());
    const origin = this.host.signedInInstance(input.instance);
    const place = placeOf(origin, input.serverId);
    return this.serial(place, async () => {
      const expected = this.store.read(place);
      const client = this.host.clientOf(origin);
      const host = this.host.instanceName(origin);
      // The listing names the server's name, group and address — the
      // ticket's answer names no group; the listing's own refusal is
      // relayed with its cause (git-host-11).
      let listed: HostServer | undefined;
      try {
        listed = (await client.servers()).find((server) => server.id === input.serverId);
      } catch (error) {
        throw hostRefusal(error, host);
      }
      // A server the listing does not name is no longer shared with the
      // person: no ticket is asked for it (core-service-128).
      if (!listed) throw new CoreError("not_found", noLongerShared());
      // The ticket's refusal is relayed with its cause: `host_refused` as
      // refused, `not_found` as no longer shared, a 429 as the instance
      // asking to wait (git-host-11).
      let ticket: HostTicket;
      try {
        ticket = await client.ticket(input.serverId);
      } catch (error) {
        throw hostRefusal(error, host);
      }
      const name = listed.name;
      let admitted: Admitted;
      try {
        admitted = await admitAt(listed.address, ticket.ticket, this.trust(), ADMIT_TIMEOUT_MS * (this.host.admitTimeScale ?? 1));
      } catch (error) {
        if (error instanceof AdmissionFailed) throw new CoreError("invalid_request", admissionFailure(error, name, host));
        throw error;
      }
      const entry: SeatEntry = { name, group: listed.group.fullPath, ...admitted };
      if (!this.store.replace(place, expected, entry)) throw new CoreError("conflict", seatsChanged());
      // A seat opened again has a new bearer: its former relay ends.
      if (expected) this.stopRelay(place);
      // An admission answered while the core stops keeps its seat in the
      // file for the next start, its relay not started (DR-133).
      if (!this.stopping) this.startRelay(place, entry, ticket.ticket);
      this.announce();
      return { place, leaseExpiresAt: entry.leaseExpiresAt };
    });
  }

  /** `server.close` (core-service-128): the seat's entry removed and its
   * relay ended, announced; the lease goes on at the server while work
   * runs there. */
  async close(input: { instance: string; serverId: string }): Promise<{ closed: true }> {
    let place: string;
    try { place = placeOf(canonicalOrigin(input.instance), input.serverId); } catch { throw new CoreError("not_found", noSeatOpen()); }
    return this.serial(place, async () => {
      const entry = this.store.read(place);
      if (!entry) throw new CoreError("not_found", noSeatOpen());
      if (!this.store.replace(place, entry, null)) throw new CoreError("conflict", seatsChanged());
      this.stopRelay(place);
      this.announce();
      return { closed: true as const };
    });
  }

  /**
   * `server.signin` (core-service-128, core-service-142): the seat's
   * Groups state read anew, its sign-in started where it is not signed
   * in; none while a read or a flow of this core's own runs there. A
   * place with no seat open is refused.
   */
  signIn(input: { instance: string; serverId: string }): { started: boolean } {
    let place: string;
    try { place = placeOf(canonicalOrigin(input.instance), input.serverId); } catch { throw new CoreError("not_found", noSeatOpen()); }
    const relay = this.relays.get(place);
    if (!relay || relay.ended) throw new CoreError("not_found", noSeatOpen());
    if (relay.signInSocket) return { started: false };
    this.seatSignIn(place, relay);
    return { started: true };
  }

  /** The core stops: every relay ends, every seat kept in its file to be
   * reopened at the next start (DR-133). */
  stop(): void {
    this.stopping = true;
    for (const place of [...this.relays.keys()]) this.stopRelay(place, 1001);
  }

  // -- the relay (core-service-129) ------------------------------------------

  /**
   * Whether a request path is an open seat's relay path, `/seats/<place>`
   * with the place percent-encoded — the seats key `<instance
   * origin>#<server id>` as `encodeURIComponent(place)`, so the origin's
   * `:` and `/` and the `#` stay inside one path segment. Admitted as
   * the path `/` is (core-service-24) while the seat is open.
   */
  relaying(path: string): boolean {
    const place = placeAtPath(path);
    return place !== null && this.relays.has(place);
  }

  /**
   * Pipe a client connection admitted at a relay path to the seat: a
   * connection of its own to the seat's endpoint, frames unread both
   * ways — the client's held until the seat's side opens — and either
   * side closing closing the other with its code where the protocol
   * allows (core-service-129). A close with the lease-end code, or the
   * seat refusing the bearer, removes the seat. A path whose seat closed
   * meanwhile is closed.
   */
  pipe(path: string, client: WebSocket): void {
    client.on("error", () => undefined);
    const place = placeAtPath(path);
    const relay = place === null ? undefined : this.relays.get(place);
    if (place === null || !relay || relay.ended) {
      closeSocket(client, 1011);
      return;
    }
    let refused = 0;
    const upstream = connectSeat(relay.entry, this.trust(), (status) => { refused = status; });
    if (!upstream) {
      closeSocket(client, 1011);
      return;
    }
    const pipe: Pipe = { client, upstream };
    relay.pipes.add(pipe);
    const held: [RawData, boolean][] = [];
    client.on("message", (data, isBinary) => {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
      else if (upstream.readyState === WebSocket.CONNECTING) held.push([data, isBinary]);
    });
    upstream.on("open", () => {
      for (const [data, isBinary] of held.splice(0)) upstream.send(data, { binary: isBinary });
    });
    upstream.on("message", (data, isBinary) => {
      if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
    });
    // A close the client began comes back as its own code: never the
    // seat's lease ending.
    let clientClosed = false;
    upstream.on("close", (code, reason) => {
      relay.pipes.delete(pipe);
      const ended = !clientClosed && (code === LEASE_END || refused === 401);
      closeSocket(client, ended ? LEASE_END : forwardable(code), ended ? undefined : reason);
      if (ended) this.ended(place, relay);
    });
    client.on("close", (code, reason) => {
      clientClosed = true;
      relay.pipes.delete(pipe);
      closeSocket(upstream, forwardable(code), reason);
    });
  }

  /** The seats' badges the watches last read, summed, a mismatched
   * seat's left out: what the shell adds to this core's own badge
   * (core-service-129). */
  badges(): number {
    let sum = 0;
    for (const relay of this.relays.values()) sum += counted(relay);
    return sum;
  }

  /**
   * The relay of an open seat starts here: its path is admitted, and its
   * watch connects, the place reading connecting until the watch reads
   * the seat's hello (core-service-129). An open's ticket is kept on it,
   * in memory alone, for the sign-in that hello starts (core-service-142);
   * a seat reopened at start has none.
   */
  private startRelay(place: string, entry: SeatEntry, ticket?: string): void {
    this.stopRelay(place);
    const relay: Relay = { entry, state: "connecting", badge: 0, pipes: new Set(), ended: false, signIn: { state: "pending" }, signInAsked: false, ...(ticket ? { ticket } : {}) };
    this.relays.set(place, relay);
    this.watch(place, relay);
  }

  /** The relay of a seat ends here: at its close, at a new admission of
   * the same place, at its lease's end and at the core's stop — its
   * watch and every piped connection closed with `code`
   * (core-service-129), and its sign-in's connection with them, a flow
   * it started still running at the seat cancelled there, so a later
   * open finds none in its way (core-service-142). */
  private stopRelay(place: string, code = 1000): void {
    const relay = this.relays.get(place);
    if (!relay) return;
    relay.ended = true;
    relay.ticket = undefined;
    this.relays.delete(place);
    if (relay.timer) clearTimeout(relay.timer);
    clearTimeout(relay.signInHold);
    if (relay.watch) closeSocket(relay.watch, 1000);
    const signIn = relay.signInSocket;
    if (signIn) {
      if (relay.signInFlow && signIn.readyState === WebSocket.OPEN) {
        signIn.send(JSON.stringify({ type: "space.signin.cancel", id: `${relay.signInFlow}-cancel`, startId: relay.signInFlow }));
      }
      closeSocket(signIn, 1000);
    }
    for (const pipe of [...relay.pipes]) {
      closeSocket(pipe.client, code);
      closeSocket(pipe.upstream, 1000);
    }
    relay.pipes.clear();
    if (counted(relay) !== 0) this.host.attentionChanged?.();
  }

  /**
   * The watch of an open seat (core-service-129): one connection that
   * relays nothing, reads the seat's hello — another protocol version
   * marks the place mismatched and stops its reconnecting — then reads
   * the seat's ledger badge, again on every `intents.changed` the seat
   * sends. Down, it reads closed and reconnects every second; a close
   * with the lease-end code, or the seat refusing the bearer, removes
   * the seat.
   */
  private watch(place: string, relay: Relay): void {
    if (relay.ended) return;
    let refused = 0;
    const socket = connectSeat(relay.entry, this.trust(), (status) => { refused = status; });
    if (!socket) {
      // An entry no connection can be made with — an endpoint the bearer
      // may not go to, a bearer no header carries — is never reached and
      // never retried: the seat reads closed until it is closed or
      // opened again.
      this.relayState(relay, "closed");
      return;
    }
    relay.watch = socket;
    let greeted = false;
    let asked = 0;
    const askBadge = (): void => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "ledger.get", id: `${WATCH_ID}-${(asked += 1)}` }));
    };
    socket.on("message", (data, isBinary) => {
      if (relay.ended || relay.watch !== socket) return;
      // Past the hello the watch reads two kinds of frame alone; the
      // seat's other broadcasts are not parsed.
      if (greeted && !isBinary) {
        const text = String(data);
        if (!text.includes("\"intents.changed\"") && !text.includes(WATCH_ID)) return;
      }
      const message = messageOf(data, isBinary);
      if (!message) return;
      if (!greeted) {
        if (message.type !== "hello") return;
        greeted = true;
        if (message.protocolVersion !== PROTOCOL_VERSION) {
          this.relayState(relay, "mismatched");
          closeSocket(socket, 1000);
          return;
        }
        this.relayState(relay, "open");
        askBadge();
        // The relay's first hello starts the seat's sign-in, with the
        // open's ticket where one is kept; a watch reconnecting starts
        // none (core-service-142).
        if (!relay.signInAsked) this.seatSignIn(place, relay, relay.ticket);
        return;
      }
      if (message.type === "intents.changed") {
        askBadge();
        return;
      }
      if (message.type === "reply" && typeof message.id === "string" && message.id.startsWith(WATCH_ID) && message.ok === true) {
        const result = message.result;
        const badge = isRecord(result) ? result.badge : undefined;
        if (typeof badge === "number" && Number.isInteger(badge) && badge >= 0 && badge !== relay.badge) {
          relay.badge = badge;
          this.host.attentionChanged?.();
        }
      }
    });
    socket.on("close", (code) => {
      if (relay.watch !== socket) return;
      relay.watch = undefined;
      if (relay.ended) return;
      if (code === LEASE_END || refused === 401) {
        this.ended(place, relay);
        return;
      }
      if (relay.state === "mismatched") return;
      this.relayState(relay, "closed");
      relay.timer = setTimeout(() => {
        relay.timer = undefined;
        this.watch(place, relay);
      }, WATCH_RECONNECT_MS);
    });
  }

  /** A relay's state moved: announced (core-service-128), and the
   * shell told where the badge it counts moved with it — a seat turned
   * mismatched counts its last read badge no more (core-service-129). */
  private relayState(relay: Relay, state: SeatRelayState): void {
    if (relay.ended || relay.state === state) return;
    const before = counted(relay);
    relay.state = state;
    this.announce();
    if (counted(relay) !== before) this.host.attentionChanged?.();
  }

  // -- the seat's sign-in (core-service-142) ----------------------------------

  /**
   * The seat's sign-in at its instance: a connection of the core's own
   * to the seat, as any client's, reads the seat's Groups state and,
   * where the seat's instance is not signed in there, starts the seat's
   * sign-in at the instance's origin over that connection — the device
   * flow, the seat's request naming the server and the person and the
   * `ticket` where the relay's first hello passes the open's
   * (git-host-27) — and hears its end there. The relay holds its ticket
   * no longer, whoever calls. A start carrying the ticket reads pending
   * through its first poll interval and the margin, when an instance
   * granting on it answers, and running only past them; one with none
   * reads running at once. Every state is announced; the connection
   * closes with the outcome, and one that closes before it reads the
   * seat out of reach. Nothing here starts a flow again on its own: only
   * a relay's first hello and `server.signin` call this.
   */
  private seatSignIn(place: string, relay: Relay, ticket?: string): void {
    relay.ticket = undefined;
    const at = splitPlace(place);
    if (relay.ended || relay.signInSocket || !at) return;
    relay.signInAsked = true;
    const unreachable: SeatSignIn = { state: "failed", cause: couldNotReach(relay.entry.name) };
    const failed = (message: Record<string, unknown>): SeatSignIn => {
      const cause = causeOf(message);
      return cause === null ? unreachable : { state: "failed", cause };
    };
    this.signInState(relay, { state: "pending" });
    const socket = connectSeat(relay.entry, this.trust(), () => undefined);
    if (!socket) {
      this.signInState(relay, unreachable);
      return;
    }
    relay.signInSocket = socket;
    this.signIns += 1;
    const readId = `${SIGNIN_ID}-read-${this.signIns}`;
    const startId = `${SIGNIN_ID}-start-${this.signIns}`;
    let greeted = false;
    let settled = false;
    const settle = (state: SeatSignIn | null): void => {
      settled = true;
      clearTimeout(relay.signInHold);
      if (relay.signInSocket === socket) relay.signInSocket = undefined;
      relay.signInFlow = undefined;
      if (state) this.signInState(relay, state);
      closeSocket(socket, 1000);
    };
    socket.on("message", (data, isBinary) => {
      if (settled || relay.ended || relay.signInSocket !== socket) return;
      // Past the hello the connection reads its own replies alone; the
      // seat's broadcasts are not parsed.
      if (greeted && (isBinary || !String(data).includes(SIGNIN_ID))) return;
      const message = messageOf(data, isBinary);
      if (!message) return;
      if (!greeted) {
        if (message.type !== "hello") return;
        greeted = true;
        // A seat speaking another protocol version is the watch's to
        // mark (core-service-129); nothing is asked of it.
        if (message.protocolVersion !== PROTOCOL_VERSION) {
          settle(null);
          return;
        }
        socket.send(JSON.stringify({ type: "space.get", id: readId }));
        return;
      }
      if (message.type === "reply" && message.id === readId) {
        if (message.ok !== true) settle(failed(message));
        else if (signedInThere(message.result, at.origin)) settle({ state: "signedIn" });
        else {
          relay.signInFlow = startId;
          socket.send(JSON.stringify({ type: "space.signin.start", id: startId, url: at.origin, reportCompletion: true, ...(ticket ? { ticket } : {}) }));
        }
        return;
      }
      if (message.type === "reply" && message.id === startId) {
        if (message.ok !== true) {
          settle(failed(message));
          return;
        }
        const running = runningOf(message.result);
        if (running && !ticket) this.signInState(relay, running);
        else if (running) {
          // Started on the ticket: pending still, the page shown only
          // where no grant came by the first poll and the margin
          // (core-service-142, DR-161).
          relay.signInHold = setTimeout(() => {
            if (!settled && !relay.ended && relay.signInSocket === socket) this.signInState(relay, running);
          }, intervalOf(message.result) * 1000 + TICKET_GRANT_MARGIN_MS);
        } else {
          // A start no page answers: the flow is cancelled at the seat.
          socket.send(JSON.stringify({ type: "space.signin.cancel", id: `${startId}-cancel`, startId }));
          settle(unreachable);
        }
        return;
      }
      if (message.type === "space.signin.completed" && message.id === startId) {
        settle(message.ok === true ? { state: "signedIn" } : failed(message));
      }
    });
    socket.on("close", () => {
      if (relay.signInSocket === socket) relay.signInSocket = undefined;
      if (settled || relay.ended) return;
      clearTimeout(relay.signInHold);
      // Closed before the outcome: the seat's answer is out of reach,
      // and the person may start the sign-in again (core-service-142).
      relay.signInFlow = undefined;
      this.signInState(relay, unreachable);
    });
  }

  /** The seat's sign-in moved: kept on its relay and announced
   * (core-service-128). */
  private signInState(relay: Relay, state: SeatSignIn): void {
    if (relay.ended || JSON.stringify(relay.signIn) === JSON.stringify(state)) return;
    relay.signIn = state;
    this.announce();
  }

  /**
   * A seat's lease ended or the seat refused its bearer
   * (core-service-129): the seat removed as a close removes it — its
   * entry, unless a new admission replaced it meanwhile, and its relay
   * — and announced.
   */
  private ended(place: string, relay: Relay): void {
    void this.serial(place, async () => {
      if (this.relays.get(place) !== relay) return;
      try {
        const entry = this.store.read(place);
        if (entry && entry.endpoint === relay.entry.endpoint && entry.bearer === relay.entry.bearer) this.store.replace(place, entry, null);
      } catch {
        // A file that will not read is left as it is (storage-45).
      }
      this.stopRelay(place, LEASE_END);
      this.announce();
    }).catch(() => undefined);
  }

  // ---------------------------------------------------------------------------

  private announce(): void {
    this.host.broadcast(this.state());
  }

  private trust(): string[] | undefined {
    if (this.anchors === undefined) this.anchors = trustAnchors(this.host.certificateAuthorities ?? []) ?? null;
    return this.anchors ?? undefined;
  }

  private serial<T>(place: string, work: () => Promise<T>): Promise<T> {
    const prior = this.queues.get(place) ?? Promise.resolve();
    const next = prior.catch(() => undefined).then(work);
    const tail = next.catch(() => undefined);
    this.queues.set(place, tail);
    void tail.then(() => {
      if (this.queues.get(place) === tail) this.queues.delete(place);
    });
    return next;
  }
}
