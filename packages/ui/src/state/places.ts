// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The page's remote places (run-view-168, DR-133): one store per seat
// the local core holds open, each connected at that seat's relay path
// on the local core's own endpoint (core-service-129), so a seat's
// connection, banner and mismatch are its own and one core failing
// leaves the others. The local core's `server.state` is the one list
// of seats; a seat it no longer names is closed and its store dropped.

import { create } from "zustand";
import type { SeatState } from "@sublang/spex-core/protocol";

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

// The local core's seats drive the places: every `server.state` it
// sends, and every reset of its store, lands here.
useAppStore.subscribe((state, previous) => {
  if (state.seats !== previous.seats) syncPlaces(state.seats, state.coreUrl);
});
