// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The page's remote places (run-view-168, DR-133): one store per seat
// the local core holds open, each connected at that seat's relay path
// on the local core's own endpoint (core-service-129), so a seat's
// connection, banner and mismatch are its own and one core failing
// leaves the others. The local core's `server.state` is the one list
// of seats; a seat it no longer names is closed and its store dropped.

import { create } from "zustand";
import type { GroupsState, SeatState } from "@sublang/spex-core/protocol";

import { instanceNameAt } from "../lib/instances.js";
import { openExternalBridge } from "../lib/space.js";
import { createAppStore, useAppStore, type AppStore } from "./store.js";

/** A seat the local core holds open and the store of its core. */
export interface SeatPlace {
  seat: SeatState;
  store: AppStore;
}

/** The seats' places, in the order `server.state` lists them. */
export const usePlaces = create<{ seats: SeatPlace[] }>(() => ({ seats: [] }));

/** A seat's relay path on the local core's endpoint (core-service-129):
 * `/seats/<place>` with the place percent-encoded, admitted as `/` is,
 * so the local connection's query — its token — goes with it. */
export function relayUrl(endpoint: string, place: string): string {
  const url = new URL(endpoint);
  return `${url.protocol}//${url.host}/seats/${encodeURIComponent(place)}${url.search}`;
}

/** Hold one store per seat `seats` names (run-view-168): a new seat's
 * store dials its relay path, unless its relay reads mismatched — a
 * seat speaking another protocol version, shown so and never dialed; a
 * seat turning mismatched is closed, one turning back is dialed afresh;
 * a seat no longer named is closed and its store dropped. */
export function syncPlaces(seats: readonly SeatState[], endpoint: string | undefined): void {
  const held = new Map(usePlaces.getState().seats.map((entry) => [entry.seat.place, entry]));
  const next: SeatPlace[] = [];
  for (const seat of seats) {
    const prior = held.get(seat.place);
    held.delete(seat.place);
    const mismatched = seat.relay === "mismatched";
    if (prior) {
      const was = prior.seat.relay === "mismatched";
      if (mismatched && !was) {
        prior.store.close();
        prior.store.setState({ connection: "mismatch" });
      } else if (!mismatched && was) {
        prior.store.getState().connect();
      }
      next.push({ seat, store: prior.store });
      continue;
    }
    // The local connection names the endpoint the relay paths are on;
    // a page that never dialed holds no seats to reach.
    if (endpoint === undefined) continue;
    const store = createAppStore(
      { key: seat.place, name: seat.name },
      undefined,
      { endpoint: relayUrl(endpoint, seat.place) },
    );
    if (mismatched) store.setState({ connection: "mismatch" });
    else store.getState().connect();
    next.push({ seat, store });
  }
  for (const gone of held.values()) gone.store.close();
  usePlaces.setState({ seats: next });
}

/** The instance a seat signs in at while its sign-in has not completed
 * — pending or running (core-service-142) — named as this computer's
 * Groups names it; undefined for a place holding no seat, and once its
 * sign-in completed or failed (run-view-168). */
export function signingInAt(seats: readonly SeatState[], groups: GroupsState | undefined, place: string): string | undefined {
  const seat = seats.find((entry) => entry.place === place);
  const state = seat?.signIn?.state;
  return seat && (state === "pending" || state === "running") ? instanceNameAt(groups, seat.instance) : undefined;
}

/** The approval pages this page asked the shell to open, by place and
 * page: each flow's once (core-service-142). */
const approvalsOpened = new Set<string>();

/** Open each seat's sign-in page where its flow started (core-service-142,
 * run-view-170): on the desktop the shell opens it in the person's
 * browser once per flow, as it opens the local browser flow's page
 * (app-shell-37); the served page, with no bridge, leaves it as the
 * server line's link. A flow this page first reads running — a page
 * loaded while it ran — is left as that link too. */
export function openSeatApprovals(seats: readonly SeatState[], previous: readonly SeatState[]): void {
  const open = openExternalBridge();
  if (!open) return;
  for (const seat of seats) {
    if (seat.signIn?.state !== "running") continue;
    const key = `${seat.place} ${seat.signIn.verificationUri}`;
    if (approvalsOpened.has(key)) continue;
    approvalsOpened.add(key);
    if (!previous.some((before) => before.place === seat.place)) continue;
    void open(seat.signIn.verificationUri).catch(() => false);
  }
}

// The local core's seats drive the places: every `server.state` it
// sends, and every reset of its store, lands here.
useAppStore.subscribe((state, previous) => {
  if (state.seats === previous.seats) return;
  syncPlaces(state.seats, state.coreUrl);
  openSeatApprovals(state.seats, previous.seats);
});
