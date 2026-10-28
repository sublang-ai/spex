// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Opening a seat when an act needs it (run-view-170, space-111, DR-159).
// A server's line on this computer's Space surface and "Open on
// <server>" on a row share one flow per server, held here by the
// server's place, so wherever it started the line reads the same: the
// contract on this device's first open, "Connecting to <server>…" while
// `server.open` runs, the core's relayed cause where it was refused.
// "Open on <server>" also holds a pending open by the server's place and
// the host repository's id: once that seat reads signed in at the
// instance (core-service-142) its own core is sent `space.join` with no
// folder (space-103), and the row reads "Opening on <server>…" until the
// seat lists the project, or reads the join's failure; a contract
// declined, an open refused, a seat whose sign-in failed or a seat
// closed drops it, the cause reading on the server's line. The flow is
// driven from the stores themselves, never from a mounted surface, so
// leaving Space while a seat signs in loses nothing.

import { create } from "zustand";
import type { GroupsState, RepositoryState, ServerInfo } from "@sublang/spex-core/protocol";

import { cloneHere } from "../lib/space.js";
import { usePlaces } from "./places.js";
import { safeStorageGet, safeStorageSet, useAppStore, type AppState, type AppStore } from "./store.js";

/** A server's place, `<instance origin>#<server id>` (core-service-128). */
export function serverPlace(server: { instance: string; id: string }): string {
  return `${server.instance}#${server.id}`;
}

/** Where this device remembers the contract was understood for a
 * server (run-view-170): this computer's own page storage, never a
 * seat's. */
function contractKey(place: string): string {
  return `spex.serverContract:${place}`;
}

/** What a server's line is doing (run-view-170). */
export interface ServerLineState {
  /** The contract stands, its answer awaited. */
  asking?: boolean;
  /** The line's own act in flight. */
  acting?: "open" | "close" | "signin";
  /** When the open started, for the line that says a seat's first start
   * can take a minute. */
  since?: number;
  /** The core's relayed cause of the last act refused. */
  refusal?: string;
}

/** A project opened on a server (space-111): the seat it waits for, the
 * join sent to that seat's core, or the join's failure. */
export interface PendingOpen {
  /** `<server place>|<host id>`. */
  key: string;
  place: string;
  /** The server's name, which the row's phrase reads. */
  server: string;
  instance: string;
  hostId: string;
  /** The row's key on this computer, which the seat's project bears. */
  repository: string;
  stage: "seat" | "joining" | "sent" | "failed";
  /** The seat was seen open: one gone since was closed. */
  seen?: boolean;
  error?: string;
}

interface ServerOpens {
  lines: Record<string, ServerLineState>;
  pending: Record<string, PendingOpen>;
  /** Counts each open or close that landed: the listing is read again. */
  landed: number;
}

export const useServerOpens = create<ServerOpens>(() => ({ lines: {}, pending: {}, landed: 0 }));

/** The pending open's key (space-111). */
export function pendingKey(place: string, hostId: string): string {
  return `${place}|${hostId}`;
}

function setLine(place: string, change: Partial<ServerLineState> | undefined): void {
  useServerOpens.setState((state) => {
    const lines = { ...state.lines };
    if (change === undefined) delete lines[place];
    else lines[place] = { ...lines[place], ...change };
    return { lines };
  });
}

function setPending(key: string, change: Partial<PendingOpen> | undefined): void {
  useServerOpens.setState((state) => {
    const pending = { ...state.pending };
    if (change === undefined) delete pending[key];
    else if (pending[key]) pending[key] = { ...pending[key]!, ...change };
    return { pending };
  });
}

/** Every pending open waiting on the seat at a place is dropped: its
 * cause reads on the server's line (space-111). */
function dropWaiting(place: string): void {
  useServerOpens.setState((state) => ({
    pending: Object.fromEntries(
      Object.entries(state.pending).filter(([, entry]) => entry.place !== place || entry.stage !== "seat"),
    ),
  }));
}

/** Send the line's act to the local core (run-view-170): the open always
 * with consent, the contract having been shown on this device; a
 * refusal's cause stands on the line, a landed open or close reading the
 * listing again. */
export async function sendServerAct(store: AppStore, server: ServerInfo, act: "open" | "close" | "signin"): Promise<void> {
  const place = serverPlace(server);
  setLine(place, { acting: act, since: Date.now(), refusal: undefined });
  try {
    const target = { instance: server.instance, serverId: server.id };
    const client = store.getClient();
    if (act === "open") await client.command("server.open", { ...target, consented: true });
    else if (act === "close") await client.command("server.close", target);
    // The seat's sign-in's outcome follows as its `signIn`
    // (core-service-142).
    else await client.command("server.signin", target);
    if (act !== "signin") useServerOpens.setState((state) => ({ landed: state.landed + 1 }));
    setLine(place, { acting: undefined, since: undefined });
    drive();
  } catch (cause) {
    setLine(place, { acting: undefined, since: undefined, refusal: (cause as Error).message });
    // An open refused leaves the projects waiting on it undone, their
    // cause read on the line (space-111).
    if (act === "open") dropWaiting(place);
  }
}

/** Connect a server (run-view-170): the first open on this device shows
 * the contract; a later one sends at once. */
export function connectServer(store: AppStore, server: ServerInfo): void {
  const place = serverPlace(server);
  const line = useServerOpens.getState().lines[place];
  if (line?.acting === "open" || line?.asking) return;
  if (safeStorageGet(contractKey(place)) === "1") void sendServerAct(store, server, "open");
  else setLine(place, { asking: true, refusal: undefined });
}

/** The contract answered (run-view-170): understood, remembered on this
 * device and the open sent with consent; declined, nothing sent and the
 * projects waiting on it dropped. */
export function answerContract(store: AppStore, server: ServerInfo, understood: boolean): void {
  const place = serverPlace(server);
  setLine(place, { asking: false });
  if (!understood) {
    dropWaiting(place);
    return;
  }
  safeStorageSet(contractKey(place), "1");
  void sendServerAct(store, server, "open");
}

/** Open a project on a server (space-111): the seat opened where none
 * is, then, once it reads signed in, its core sent `space.join` with no
 * folder. */
export function openOnServer(store: AppStore, server: ServerInfo, repo: { key: string; hostId: string }): void {
  const place = serverPlace(server);
  const key = pendingKey(place, repo.hostId);
  useServerOpens.setState((state) => ({
    pending: {
      ...state.pending,
      [key]: { key, place, server: server.name, instance: server.instance, hostId: repo.hostId, repository: repo.key, stage: "seat" },
    },
  }));
  if (!store.getState().seats.some((seat) => seat.place === place)) connectServer(store, server);
  drive();
}

/** Put a failed open away: the row offers its Open again. */
export function dismissOpen(key: string): void {
  setPending(key, undefined);
}

/** The host id a row's spex repository has at an instance (space-111):
 * its placement's there, else, at its own instance, its own; none
 * where it holds nothing there. */
export function hostIdAt(repo: RepositoryState, instance: string): string | null {
  const line = repo.placements.find((placement) => placement.instance === instance);
  if (line?.id) return line.id;
  return repo.instance === instance ? repo.id : null;
}

/** Every repository a Groups state lists. */
function rowsOf(state: GroupsState | undefined): RepositoryState[] {
  if (!state) return [];
  return [...state.own.repositories, ...state.instances.flatMap((instance) => instance.groups.flatMap((group) => group.repositories))];
}

/** What a seat holds of a spex repository (space-1, space-111): the
 * project it is open as there — a project its core lists under the
 * key, or a clone its Groups state lists by the host id at the instance
 * with a working folder — or a clone alone; nothing where it holds
 * none. */
export function seatHolding(
  state: Pick<AppState, "projects" | "space">,
  key: string,
  instance: string,
  hostId: string | null,
): { projectId?: string; row?: RepositoryState } | undefined {
  const project = state.projects.find((entry) => entry.id === key);
  if (project) return { projectId: project.id };
  if (hostId === null) return undefined;
  const row = rowsOf(state.space).find((entry) => cloneHere(entry) && hostIdAt(entry, instance) === hostId);
  if (!row) return undefined;
  return row.folder !== null ? { projectId: row.key, row } : { row };
}

/** Whether the work is already scheduled. */
let scheduled = false;

/** Move each pending open on as the stores say (space-111): a seat
 * signed in has its join sent once; a join landed, as the seat listing
 * the project, ends it; a seat whose sign-in failed, or one closed after
 * it was seen, drops it. Runs after the change that called it. */
export function drive(): void {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    step();
  });
}

function step(): void {
  const { pending, lines } = useServerOpens.getState();
  const entries = Object.values(pending);
  if (entries.length === 0) return;
  const seats = useAppStore.getState().seats;
  const places = usePlaces.getState().seats;
  for (const entry of entries) {
    if (entry.stage === "failed" || entry.stage === "joining") continue;
    const seat = seats.find((each) => each.place === entry.place);
    const held = places.find((each) => each.seat.place === entry.place);
    if (!seat) {
      // Closed after it was seen; or never opened, nothing asking or
      // opening it now — a refusal or a decline dropped it already.
      const line = lines[entry.place];
      if (entry.seen || (!line?.asking && line?.acting !== "open" && entry.stage === "sent")) setPending(entry.key, undefined);
      continue;
    }
    if (!entry.seen) setPending(entry.key, { seen: true });
    if (entry.stage === "seat") {
      if (seat.signIn.state === "failed") {
        // Its cause reads on the server's line (space-111).
        setPending(entry.key, undefined);
        continue;
      }
      if (seat.signIn.state !== "signedIn") continue;
      if (!held || held.store.getState().connection !== "open") continue;
      const store = held.store;
      setPending(entry.key, { stage: "joining" });
      void store
        .getState()
        .spaceJoin(entry.instance, entry.hostId)
        .then(
          () => {
            setPending(entry.key, { stage: "sent" });
            drive();
          },
          (cause: Error) => setPending(entry.key, { stage: "failed", error: cause.message }),
        );
      continue;
    }
    // Sent: the seat listing the project, or its clone, ends the wait;
    // a join stopped there reads its cause.
    if (!held) continue;
    const state = held.store.getState();
    const holding = seatHolding(state, entry.repository, entry.instance, entry.hostId);
    const row = holding?.row ?? rowsOf(state.space).find((each) => hostIdAt(each, entry.instance) === entry.hostId);
    const sync = row?.sync;
    if (sync?.phase === "stopped" && sync.op === "join") {
      setPending(entry.key, { stage: "failed", error: sync.message });
      continue;
    }
    if (holding && !(sync?.phase === "running" && sync.op === "join")) setPending(entry.key, undefined);
  }
}

// The stores drive the pending opens: the local core's seats, each
// seat's store as the places hold them, and the pending opens
// themselves.
const watched = new Map<AppStore, () => void>();
function watchPlaces(): void {
  const stores = new Set(usePlaces.getState().seats.map((entry) => entry.store));
  for (const [store, off] of watched) {
    if (stores.has(store)) continue;
    off();
    watched.delete(store);
  }
  for (const store of stores) {
    if (watched.has(store)) continue;
    watched.set(
      store,
      store.subscribe((state, previous) => {
        if (state.connection !== previous.connection || state.space !== previous.space || state.projects !== previous.projects) drive();
      }),
    );
  }
  drive();
}
useAppStore.subscribe((state, previous) => {
  if (state.seats !== previous.seats) drive();
});
usePlaces.subscribe(watchPlaces);
watchPlaces();
