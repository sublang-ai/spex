// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The seats and their leases (hub-2, hub-4, hub-5, hub-6, hub-8): the
// lease table, kept on disk so a restarted hub continues every lease
// from its recorded expiry; admission, which records the lease, starts
// the seat through the helper and issues the bearer; renewal at the
// interval while a relay is open or a turn runs; and the end of a lease
// — at its expiry, at the instance's refusal, at `evict` or `retire` —
// closing the seat's relays with 4401 and stopping its unit, the seat's
// files standing, a stop that failed asked again at each renewal and at
// the next start, the debt recorded on the lease. One person's
// operations run one at a time; once `retire` begins, no admission
// starts a seat. An admission records its lease and starts the seat, and
// a renewal records its expiry, under the seat's lock, which the sweep
// holds while it reads that lease again and stops the seat; the book
// makes the locks' directory, which the sweep never does (DR-148).

import { runHelper, type HelperConfig } from "./helper.js";
import { readAdmission, redeemTicket, renewLease, type Admission } from "./instance.js";
import { probeSeat, readTurnActive, waitForSeat } from "./seat.js";
import {
  acquireSeatLock,
  ensureLocksDir,
  leaseActive,
  lockHolder,
  mintSecret,
  readLeases,
  sha256,
  writeLeases,
  writeState,
  type HubState,
  type Lease,
  type Leases,
  type SeatLock,
} from "./state.js";

/** The close code a relay ends with when its seat's lease ends (hub-3). */
export const LEASE_ENDED = 4401;

/** How long an admission waits for a seat's lock the sweep holds: past
 * the seat unit's stop timeout (hub-5). */
const ADMIT_LOCK_WAIT_MS = 60_000;
/** How long a renewal waits for it; one not recorded is renewed again at
 * the next round. */
const RENEW_LOCK_WAIT_MS = 35_000;

export interface SeatBookOptions {
  stateDir: string;
  runDir: string;
  helper: HelperConfig;
  /** How long a started seat may take to listen (hub-2). */
  seatTimeoutMs: number;
  log: (line: string) => void;
}

/** What the relays register with the book, so a lease's end closes
 * them. */
export interface RelayHandle {
  close(code: number, reason: string): void;
}

export interface AdmitAnswer {
  status: number;
  body: unknown;
}

export interface SeatStatus {
  id: string;
  login: string;
  running: boolean;
  expires_at: string;
  active: boolean;
  relay: boolean;
}

function refusal(code: string, message: string): { error: { code: string; message: string } } {
  return { error: { code, message } };
}

export class SeatBook {
  readonly leases: Leases;
  private readonly relays = new Map<string, Set<RelayHandle>>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private closed = false;
  /** Set as `retire` begins: no admission starts a seat past it (hub-2). */
  private retiring = false;

  constructor(
    private readonly options: SeatBookOptions,
    readonly state: HubState,
  ) {
    this.leases = readLeases(options.stateDir);
    // The locks' directory is the hub's to make, served or not (hub-8).
    ensureLocksDir(options.stateDir);
  }

  /** Take a seat's lock (hub-5), its directory made again where it went
   * missing (hub-8); one whose holder is gone is waited on until the
   * sweep clears it, for the hub breaks no lock. */
  private lock(id: string, waitMs: number): Promise<SeatLock | undefined> {
    ensureLocksDir(this.options.stateDir);
    return acquireSeatLock(this.options.stateDir, id, waitMs, (holder, gone) => {
      // A gone lock with no pid names no process still writing one.
      const by =
        holder === null && gone
          ? "left without a pid; the sweep clears it"
          : `held by ${lockHolder(holder)}${gone ? ", whose hold is stale; the sweep clears it" : ""}`;
      this.options.log(`waiting for the lock of ${id} ${by}`);
    });
  }

  private save(): void {
    writeLeases(this.options.stateDir, this.leases);
  }

  /** Run one person's operation after their earlier ones. */
  private serial<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(id) ?? Promise.resolve();
    const next = previous.then(operation, operation);
    const settled = next.then(
      () => undefined,
      () => undefined,
    );
    this.queues.set(id, settled);
    void settled.then(() => {
      if (this.queues.get(id) === settled) this.queues.delete(id);
    });
    return next;
  }

  private schedule(id: string): void {
    const previous = this.timers.get(id);
    if (previous) clearTimeout(previous);
    this.timers.delete(id);
    const lease = this.leases[id];
    if (!lease || this.closed || !leaseActive(lease)) return;
    const wait = Math.min(Date.parse(lease.expires_at) - Date.now(), 2 ** 31 - 1);
    const timer = setTimeout(() => {
      this.timers.delete(id);
      void this.serial(id, async () => {
        const current = this.leases[id];
        if (!current || this.closed) return;
        if (leaseActive(current)) {
          this.schedule(id);
          return;
        }
        await this.endLocked(id, "it expired");
      });
    }, Math.max(wait, 0));
    timer.unref();
    this.timers.set(id, timer);
  }

  /** Continue the recorded leases (hub-5): schedule each one's end, and
   * ask the stop of every lease that ended while no hub ran — its stop
   * still owed, its bearer never voided, or its seat found running. */
  async resume(): Promise<void> {
    for (const id of Object.keys(this.leases)) {
      const lease = this.leases[id];
      if (leaseActive(lease)) {
        this.schedule(id);
        this.options.log(`continuing the lease of ${lease.login} (${id}) until ${lease.expires_at}`);
        continue;
      }
      await this.serial(id, async () => {
        const current = this.leases[id];
        if (!current || leaseActive(current) || this.closed) return;
        if (current.stop_owed || current.bearer_hash !== null || (await probeSeat(this.options.runDir, id))) {
          await this.endLocked(id, "its stop was still owed when the hub started");
        }
      });
    }
  }

  addRelay(id: string, relay: RelayHandle): () => void {
    let set = this.relays.get(id);
    if (!set) {
      set = new Set();
      this.relays.set(id, set);
    }
    set.add(relay);
    return () => {
      const current = this.relays.get(id);
      current?.delete(relay);
      if (current?.size === 0) this.relays.delete(id);
    };
  }

  relayOpen(id: string): boolean {
    return (this.relays.get(id)?.size ?? 0) > 0;
  }

  /** The lease a presented bearer opens, where it holds. */
  lease(id: string): Lease | undefined {
    const lease = this.leases[id];
    return lease && leaseActive(lease) ? lease : undefined;
  }

  /** Redeem a ticket and open its person's seat (hub-2, hub-4). */
  async admit(ticket: string): Promise<AdmitAnswer> {
    // Refused before the ticket is redeemed while `retire` runs (hub-2).
    if (this.retiring) {
      return { status: 503, body: refusal("server_retiring", "this hub is retiring its server") };
    }
    const token = this.state.token;
    if (!token) {
      return { status: 503, body: refusal("not_attached", "this hub is attached to no server; run spex-hub attach") };
    }
    const answer = await redeemTicket(this.state.instance, token, ticket);
    if (answer.kind === "unreachable") {
      this.options.log(`the instance did not answer an admission (${answer.reason})`);
      return { status: 502, body: refusal("instance_unreachable", "the instance did not answer") };
    }
    if (answer.kind === "refused") {
      return {
        status: answer.status,
        body: refusal(answer.code, answer.message ?? "the instance refused the ticket"),
      };
    }
    const admission = readAdmission(answer.body);
    if (!admission) {
      return { status: 502, body: refusal("bad_instance_answer", "the instance answered no admission") };
    }
    if (admission.server.name !== this.state.name) {
      this.state.name = admission.server.name;
      writeState(this.options.stateDir, this.state);
    }
    const { person } = admission;
    return this.serial(person.id, async () => {
      if (this.closed) {
        return { status: 503, body: refusal("hub_stopping", "the hub is stopping") };
      }
      // An admission the instance answered after `retire` began starts no
      // seat; one past this check and the same check once the lock is
      // held is in retire's snapshot, its lease recorded before any other
      // wait (hub-2, hub-6).
      if (this.retiring) {
        return { status: 503, body: refusal("server_retiring", "this hub is retiring its server") };
      }
      // The lease is recorded and the seat started under the seat's lock,
      // so the sweep stops no seat admitted meanwhile (hub-5).
      const lock = await this.lock(person.id, ADMIT_LOCK_WAIT_MS);
      if (!lock) {
        this.options.log(`seat ${person.id} was not admitted: its lock stayed held for ${ADMIT_LOCK_WAIT_MS / 1000} seconds`);
        return {
          status: 503,
          body: refusal("seat_unavailable", `seat ${person.id} is held by a stop in progress`),
        };
      }
      try {
        return await this.admitLocked(person, admission.lease_expires_at);
      } finally {
        lock.release();
      }
    });
  }

  /** An admission's lease recorded and its seat started, the seat's lock
   * held (hub-2, hub-4, hub-5). */
  private async admitLocked(
    person: Admission["person"],
    leaseExpiresAt: string,
  ): Promise<AdmitAnswer> {
    // Checked again past the lock's wait, for `retire` or the hub's close
    // may have begun meanwhile; from here the lease is recorded before
    // any other wait (hub-2, hub-6).
    if (this.closed) {
      return { status: 503, body: refusal("hub_stopping", "the hub is stopping") };
    }
    if (this.retiring) {
      return { status: 503, body: refusal("server_retiring", "this hub is retiring its server") };
    }
    const prior = this.leases[person.id];
    // The lease is recorded before the seat starts, so a seat that
    // starts late still stops at the lease's end (hub-2).
    // A seat is wanted running: its stop is owed from here until one
    // succeeds after the lease's end, whether or not it starts (hub-8).
    this.leases[person.id] = {
      login: person.login,
      expires_at: leaseExpiresAt,
      bearer_hash: prior && leaseActive(prior) ? prior.bearer_hash : null,
      stop_owed: true,
    };
    this.save();
    this.schedule(person.id);
    const { runDir } = this.options;
    if (!(await probeSeat(runDir, person.id))) {
      try {
        // `create` is idempotent (hub-4): asked before every start, so a
        // creation that failed is asked again.
        await runHelper(this.options.helper, "create", person.id);
        await runHelper(this.options.helper, "start", person.id, mintSecret());
      } catch (error) {
        this.options.log(`seat ${person.id} did not start: ${(error as Error).message}`);
        return {
          status: 503,
          body: refusal("seat_unavailable", `seat ${person.id} could not be started`),
        };
      }
      if (!(await waitForSeat(runDir, person.id, this.options.seatTimeoutMs))) {
        this.options.log(`seat ${person.id} did not listen within ${this.options.seatTimeoutMs} ms`);
        return {
          status: 503,
          body: refusal(
            "seat_unavailable",
            `seat ${person.id} did not start within ${Math.round(this.options.seatTimeoutMs / 1000)} seconds`,
          ),
        };
      }
    }
    const bearer = mintSecret();
    this.leases[person.id].bearer_hash = sha256(bearer);
    this.save();
    this.options.log(`admitted ${person.login} (${person.id}) until ${leaseExpiresAt}`);
    return {
      status: 200,
      body: {
        endpoint: `wss://${new URL(this.state.address).host}/seats/${person.id}`,
        bearer,
        lease_expires_at: leaseExpiresAt,
        person,
      },
    };
  }

  /** Renew every lease whose seat is in use, and ask again for every
   * stop that failed (hub-5). */
  async renewDue(): Promise<void> {
    const ids = Object.keys(this.leases).filter((id) => leaseActive(this.leases[id]));
    const owed = Object.keys(this.leases).filter(
      (id) => this.leases[id].stop_owed && !leaseActive(this.leases[id]),
    );
    await Promise.all([
      ...ids.map((id) => this.serial(id, () => this.renewLocked(id))),
      ...owed.map((id) => this.serial(id, () => this.stopOwedLocked(id))),
    ]);
  }

  /** Ask the helper again to stop a seat whose lease ended (hub-5). */
  private async stopOwedLocked(id: string): Promise<void> {
    const lease = this.leases[id];
    if (this.closed || !lease || !lease.stop_owed || leaseActive(lease)) return;
    try {
      await runHelper(this.options.helper, "stop", id);
      delete lease.stop_owed;
      this.save();
      this.options.log(`the seat of ${lease.login} (${id}) stopped at the retry`);
    } catch (error) {
      this.options.log(
        `the seat of ${lease.login} (${id}) did not stop: ${(error as Error).message}; asked again at the next renewal and at the hub's next start`,
      );
    }
  }

  private async renewLocked(id: string): Promise<void> {
    const lease = this.leases[id];
    const token = this.state.token;
    if (!lease || !leaseActive(lease) || !token || this.closed) return;
    const inUse = this.relayOpen(id) || (await readTurnActive(this.options.runDir, id));
    if (!inUse) return;
    const answer = await renewLease(this.state.instance, token, id);
    if (this.closed || this.leases[id] !== lease || !leaseActive(lease)) return;
    if (answer.kind === "renewed") {
      // Recorded under the seat's lock, the instance's answer awaited
      // outside it, so the sweep stops no seat renewed meanwhile (hub-5).
      const lock = await this.lock(id, RENEW_LOCK_WAIT_MS);
      if (!lock) {
        this.options.log(`the renewal of ${lease.login} (${id}) was not recorded: the seat's lock is held`);
        return;
      }
      try {
        if (this.closed || this.leases[id] !== lease || !leaseActive(lease)) return;
        lease.expires_at = answer.expiresAt;
        this.save();
        this.schedule(id);
        this.options.log(`renewed the lease of ${lease.login} (${id}) until ${lease.expires_at}`);
      } finally {
        lock.release();
      }
      return;
    }
    if (answer.kind === "refused" && (answer.status === 403 || answer.status === 404)) {
      await this.endLocked(id, `the instance refused its renewal (${answer.status} ${answer.code})`);
      return;
    }
    const why = answer.kind === "unreachable" ? "no answer" : `${answer.status} ${answer.code}`;
    this.options.log(
      `the renewal of ${lease.login} (${id}) failed (${why}); retrying at the next interval until ${lease.expires_at}`,
    );
  }

  /** End a lease at once: close its relays, stop its unit (hub-5).
   * Answers undefined where the seat stopped, else the stop's cause, the
   * stop recorded as owed from the lease's end until one succeeds, so a
   * hub that dies mid-stop owes it at its next start (hub-8). */
  private async endLocked(id: string, why: string): Promise<string | undefined> {
    const lease = this.leases[id];
    if (!lease) return undefined;
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
    const now = new Date();
    if (Date.parse(lease.expires_at) > now.getTime()) lease.expires_at = now.toISOString();
    lease.bearer_hash = null;
    lease.stop_owed = true;
    this.save();
    for (const relay of this.relays.get(id) ?? []) relay.close(LEASE_ENDED, "lease ended");
    try {
      await runHelper(this.options.helper, "stop", id);
      delete lease.stop_owed;
      this.save();
      this.options.log(`the lease of ${lease.login} (${id}) ended: ${why}; seat stopped`);
      return undefined;
    } catch (error) {
      const cause = (error as Error).message;
      this.options.log(
        `the lease of ${lease.login} (${id}) ended: ${why}; the seat did not stop: ${cause}; asked again at the next renewal and at the hub's next start`,
      );
      return cause;
    }
  }

  /** `evict <id>` (hub-6): found false where no seat bears that id;
   * failure the stop's cause where the seat did not stop. */
  evict(id: string): Promise<{ found: boolean; failure?: string }> {
    return this.serial(id, async () => {
      if (!this.leases[id]) return { found: false };
      const failure = await this.endLocked(id, "evicted");
      return failure === undefined ? { found: true } : { found: true, failure };
    });
  }

  /** `retire` (hub-6): end every lease, stop every seat, wipe each
   * seat's credentials, and forget the server token. */
  async retire(): Promise<{ seats: number; failures: string[] }> {
    // Set before the snapshot, so every seat an admission may start is in
    // it or refused (hub-2).
    this.retiring = true;
    const failures: string[] = [];
    const ids = Object.keys(this.leases);
    for (const id of ids) {
      await this.serial(id, async () => {
        if (leaseActive(this.leases[id])) {
          const failure = await this.endLocked(id, "the server retired");
          if (failure !== undefined) failures.push(failure);
        } else {
          // An inactive lease's stop is asked again; one that fails stays
          // owed, so `retire` run again or a start asks it (hub-5, hub-6).
          const lease = this.leases[id];
          try {
            await runHelper(this.options.helper, "stop", id);
            if (lease.stop_owed) {
              delete lease.stop_owed;
              this.save();
            }
          } catch (error) {
            lease.stop_owed = true;
            this.save();
            failures.push((error as Error).message);
          }
        }
        try {
          await runHelper(this.options.helper, "wipe", id);
        } catch (error) {
          failures.push((error as Error).message);
        }
      });
    }
    this.state.token = null;
    writeState(this.options.stateDir, this.state);
    this.options.log(`retired: ${ids.length} seat(s) stopped and wiped; the server token is forgotten`);
    return { seats: ids.length, failures };
  }

  async status(): Promise<SeatStatus[]> {
    const ids = Object.keys(this.leases).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
    return Promise.all(
      ids.map(async (id) => {
        const lease = this.leases[id];
        return {
          id,
          login: lease.login,
          running: await probeSeat(this.options.runDir, id),
          expires_at: lease.expires_at,
          active: leaseActive(lease),
          relay: this.relayOpen(id),
        };
      }),
    );
  }

  /** Stop the book's timers; the leases stand on disk and the seats
   * keep running, so a restarted hub continues them. */
  async close(): Promise<void> {
    this.closed = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    await Promise.all([...this.queues.values()]);
  }
}
