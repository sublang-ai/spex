// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The place selector (run-view-168, DR-133, DR-172): Settings and
// Space show one place at a time, and the selector names it — "This
// computer", or a seat's server's name. Picking a place switches which
// core's store those surfaces read, so a seat's Settings and Space are
// the seat's own; a project's tabs stand at the project's place.

import { i18n } from "../i18n.js";
import { placeLabel, type AppStore } from "../state/store.js";

export function PlaceSelector({
  stores,
  shown,
  onShow,
}: {
  /** Every place's store, this computer's first. */
  stores: readonly AppStore[];
  /** The store of the place shown. */
  shown: AppStore;
  onShow(store: AppStore): void;
}) {
  return (
    <div
      data-testid="place-selector-bar"
      className="flex shrink-0 items-center gap-2 border-b border-neutral-200 px-4 py-1.5 dark:border-neutral-800"
    >
      <select
        data-testid="place-selector"
        aria-label={i18n._({
          id: "Place",
          comment: "the selector of where Settings and Space are shown: This computer or a team server",
        })}
        value={shown.place.key}
        onChange={(event) => {
          const store = stores.find((entry) => entry.place.key === event.target.value);
          if (store) onShow(store);
        }}
        className="min-w-0 max-w-full truncate rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      >
        {stores.map((store) => (
          <option key={store.place.key} value={store.place.key}>
            {placeLabel(store.place)}
          </option>
        ))}
      </select>
    </div>
  );
}
