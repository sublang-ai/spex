// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Which core's store a surface reads (run-view-168, DR-133). The
// places are the local core's store and one per seat; a surface that
// shows one place at a time reads that place's store from context —
// the local store wherever none is named — and the surfaces that join
// the places read every store at once.

import { createContext, useContext, useMemo, useRef, useSyncExternalStore } from "react";

import { joinAttention, type JoinedAttention } from "./dashboard.js";
import { usePlaces } from "./places.js";
import { useAppStore, type AppState, type AppStore } from "./store.js";

/** The store of the place a surface shows: the local core's unless an
 * ancestor names another. */
export const PlaceStoreContext = createContext<AppStore>(useAppStore);

/** The store of the place this surface shows (run-view-168). */
export function usePlaceStore(): AppStore {
  return useContext(PlaceStoreContext);
}

/** Every place's store, the local core's first, then each seat's in
 * the order `server.state` names them (run-view-168). */
export function usePlaceStores(): readonly AppStore[] {
  const seats = usePlaces((state) => state.seats);
  return useMemo(() => [useAppStore, ...seats.map((entry) => entry.store)], [seats]);
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.is(left[key], right[key]));
}

/** One selection per place, in the places' order: each value read from
 * its own store, the whole re-read whenever any place's selection
 * changes. A selection is compared shallowly, so a selector may return
 * a fresh object of slices. */
export function useEachPlace<T>(
  selector: (state: AppState) => T,
): readonly { store: AppStore; value: T }[] {
  const stores = usePlaceStores();
  const cache = useRef<{ stores: readonly AppStore[]; result: { store: AppStore; value: T }[] } | undefined>(
    undefined,
  );
  const subscribe = useMemo(
    () => (notify: () => void) => {
      const offs = stores.map((store) => store.subscribe(notify));
      return () => offs.forEach((off) => off());
    },
    [stores],
  );
  const snapshot = (): { store: AppStore; value: T }[] => {
    const values = stores.map((store) => selector(store.getState()));
    const prior = cache.current;
    if (
      prior &&
      prior.stores === stores &&
      prior.result.every((entry, index) => shallowEqual(entry.value, values[index]))
    ) {
      return prior.result;
    }
    const result = stores.map((store, index) => ({ store, value: values[index] as T }));
    cache.current = { stores, result };
    return result;
  };
  return useSyncExternalStore(subscribe, snapshot);
}

/** The attention queue joined across the places (dashboard-9): every
 * place's ledger fold, band by band, each entry kept with the store of
 * the core it is answered at. A place speaking another protocol version
 * is no connected core and adds nothing, as the core's own count leaves
 * a mismatched seat out (core-service-129); one reconnecting keeps its
 * last read fold. */
export function useJoinedAttention(): JoinedAttention<AppStore> {
  const ledgers = useEachPlace((state) => (state.connection === "mismatch" ? undefined : state.ledger));
  return useMemo(
    () => joinAttention(ledgers.map(({ store, value }) => ({ place: store, ledger: value }))),
    [ledgers],
  );
}
