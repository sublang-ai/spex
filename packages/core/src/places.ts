// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The places of one desktop (core-service-128, DR-133): the local core
// opens, holds and closes the seats the person holds on team servers.
// `server.list` reads each signed-in instance's servers listing, each
// instance standing or failing on its own (git-host-29, git-host-11);
// `server.open`, with the person's consent to the contract, asks the
// instance for a ticket, presents it at the server's address over TLS
// for the admission (hub-2), keeps the seat's endpoint, bearer and lease
// expiry in `local/seats.yaml` (storage-45) and starts the seat's relay;
// `server.close` ends the relay and removes the entry, the lease going
// on at the server. Every change of the open seats is announced to every
// client as `server.state`. A seat's place is its key in the seats file,
// `<instance origin>#<server id>`, shown by the server's name.
//
// The bearer and the endpoint never leave this module and the seats
// file: no reply, event, error message or log line carries either, nor
// the ticket.

import { request } from "node:https";
import { getCACertificates, rootCertificates } from "node:tls";
import { CredentialChanged, HostError, type GitHostClient, type HostServer, type HostTicket } from "./git-host.js";
import { i18n } from "./i18n.js";
import { canonicalOrigin } from "./instance.js";
import type { SeatRelayState, SeatState, ServerInfo, ServerListing } from "./protocol.js";
import { fileSeatStore, placeOf, splitPlace, type SeatEntry, type SeatStore } from "./seats.js";
import { CoreError } from "./session.js";
import { noLongerShared } from "./space-git.js";
import { couldNotReach, relayHostError } from "./space-groups.js";

/** The longest an admission may take: the hub waits up to thirty
 * seconds for a seat to start before it answers (hub-2). */
const ADMIT_TIMEOUT_MS = 45_000;
/** The most of an admission's answer read. */
const ANSWER_MAX_BYTES = 64 * 1024;

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
  /** CA certificates, PEM, trusted beside the system's at a server's
   * address: a test's fixture CA. */
  certificateAuthorities?: readonly string[];
}

/** An admission the server answered (hub-2), held by the seats file
 * alone. */
interface Admitted { endpoint: string; bearer: string; leaseExpiresAt: number }

/** An admission that did not admit (hub-2): the server not reached, an
 * answer that is no admission, or the server's refusal with its status,
 * its code and its words. Its message names none of the secrets. */
class AdmissionFailed extends Error {
  constructor(
    readonly kind: "unreachable" | "unanswered" | "refused",
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

/** A successful admission's answer (hub-2): the seat's `wss:` endpoint
 * under the address the ticket named, a bearer, the lease's expiry. */
function admittedFrom(json: unknown, address: URL): Admitted {
  if (!isRecord(json)) throw new AdmissionFailed("unanswered");
  const { endpoint, bearer, lease_expires_at: expires } = json;
  if (typeof endpoint !== "string" || typeof bearer !== "string" || bearer.length === 0) throw new AdmissionFailed("unanswered");
  let at: URL;
  try { at = new URL(endpoint); } catch { throw new AdmissionFailed("unanswered"); }
  // The bearer goes to the server it came from alone.
  if (at.protocol !== "wss:" || at.host !== address.host) throw new AdmissionFailed("unanswered");
  const leaseExpiresAt = typeof expires === "string" ? Date.parse(expires) : Number.NaN;
  if (!Number.isFinite(leaseExpiresAt)) throw new AdmissionFailed("unanswered");
  return { endpoint, bearer, leaseExpiresAt };
}

/**
 * Present a ticket at a server's address for the admission (hub-2):
 * `POST <address>/admit` with `{ticket}` over TLS, verified against
 * `ca`, on a connection of its own. A refusal throws with its status and
 * the server's words; no answer, or a certificate that does not verify,
 * throws unreachable.
 */
function admitAt(address: string, ticket: string, ca: string[] | undefined): Promise<Admitted> {
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
    const fail = (): void => settle(() => { throw new AdmissionFailed("unreachable"); });
    const req = request(target, {
      method: "POST",
      agent: false,
      timeout: ADMIT_TIMEOUT_MS,
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
    req.on("timeout", () => req.destroy());
    req.on("error", fail);
    req.end(body);
  });
}

/**
 * The seats this core holds on team servers, and the commands that open
 * and close them (core-service-128).
 */
export class Places {
  private readonly store: SeatStore;
  /** Each held seat's relay state, by place. */
  private readonly relays = new Map<string, SeatRelayState>();
  /** One open or close at a time per place. */
  private readonly queues = new Map<string, Promise<unknown>>();
  private anchors?: string[] | null;
  private stopping = false;

  constructor(private readonly host: PlacesHost) {
    this.store = fileSeatStore(host.homeDir);
  }

  /**
   * At the core's start (core-service-128): every seat the file holds is
   * read and its relay started, and the seats announced. Reconnecting to
   * each seat, and a refusal there removing its entry as a close does,
   * belong to the relay (core-service-129), which IR-115's task 3 starts
   * from {@link startRelay}.
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
        relay: this.relays.get(place) ?? "closed",
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
   * server's group read from the instance's listing — the ticket names
   * none — a ticket asked for, presented at the server's address, and the
   * seat kept, its relay started and announced; the reply carries the
   * place and the expiry alone. Without consent nothing is asked.
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
      let listed: HostServer | undefined;
      try {
        listed = (await client.servers()).find((server) => server.id === input.serverId);
      } catch (error) {
        throw hostRefusal(error, host);
      }
      // A server the listing leaves out is asked for its ticket all the
      // same: the instance's own answer is the cause relayed — a standing
      // below the role a seat needs refused in its words, a server it no
      // longer shares `not_found` (git-host-11) — never one the core
      // supposes from the listing.
      let ticket: HostTicket;
      try {
        ticket = await client.ticket(input.serverId);
      } catch (error) {
        throw hostRefusal(error, host);
      }
      // A ticket minted for a server the listing left out: the listing no
      // longer shares it, so the seat has no group to be kept under. The
      // ticket is never presented and lapses unspent (servers-6).
      if (!listed) throw new CoreError("not_found", noLongerShared());
      const name = ticket.server.name || listed.name;
      let admitted: Admitted;
      try {
        admitted = await admitAt(ticket.server.address, ticket.ticket, this.trust());
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
      if (!this.stopping) this.startRelay(place, entry);
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

  /** The core stops: every relay ends, every seat kept in its file to be
   * reopened at the next start (DR-133). */
  stop(): void {
    this.stopping = true;
    for (const place of [...this.relays.keys()]) this.stopRelay(place);
  }

  // -- the relay's seam (core-service-129) -----------------------------------

  /**
   * The relay of an open seat starts here: its loopback path, a
   * connection to the seat per client connection, and its watch
   * (core-service-129) — IR-115's task 3, which reads the endpoint and
   * the bearer from `entry` and reports its state. Until then an
   * admitted seat reads open.
   */
  private startRelay(place: string, _entry: SeatEntry): void {
    this.relays.set(place, "open");
  }

  /** The relay of a seat ends here: at its close, at a new admission of
   * the same place, and at the core's stop (core-service-129). */
  private stopRelay(place: string): void {
    this.relays.delete(place);
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
