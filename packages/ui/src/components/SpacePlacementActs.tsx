// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// What a project's row does with its placements as a whole (space-88,
// DR-128): "Place at…" keeps its records at another signed-in instance
// too. It stands where the clone holds a placement with an instance,
// the view lets the person manage the members of every one it holds,
// and some signed-in instance holds none of them; titled and named
// "Also place at <display name>" where one instance is offered, it opens
// that instance's picker beneath the row (GroupPicker), and otherwise
// opens the choice of them in place, each so named. It reads "Placing…"
// from the pick until the operation it starts has run (space-97). Its
// label keeps to the row's 14-character budget, the long name its title
// and accessible name; a choice's options are a picker's rows, the
// instance's name their words (space-28, DR-041).

import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";
import type { InstanceState } from "@sublang/spex-core/protocol";

import { i18n } from "../i18n.js";
import { instanceName } from "../lib/instances.js";
import { SECONDARY } from "./SpaceSurface.js";

/** The long name of "Place at…" at one instance, and of that instance
 * in its choice (space-88). */
export function alsoPlaceAt(instance: InstanceState): string {
  return i18n._({
    id: "Also place at {name}",
    values: { name: instanceName(instance) },
    comment:
      "the title and accessible name of Place at… where one instance is offered, and of each instance in its choice; {name} is the instance's display name, or its host name before any read",
  });
}

/** "Place at…" on a project's row (space-88): its long name where one
 * instance is offered, its busy form while the Place runs. */
export function PlaceControl({
  repoKey,
  id,
  buttonRef,
  offered,
  placing,
  expanded,
  disabled,
  onClick,
}: {
  repoKey: string;
  /** The control's DOM id: its choice is named by it. */
  id: string;
  buttonRef: RefObject<HTMLButtonElement | null>;
  /** The instances it offers; none while only its Place runs. */
  offered: InstanceState[];
  placing: boolean;
  expanded: boolean;
  disabled: boolean;
  onClick(): void;
}) {
  // A running control's word says what it does (DR-069); one instance
  // offered names it in full, as its title and accessible name.
  const long = !placing && offered.length === 1 ? alsoPlaceAt(offered[0]!) : undefined;
  return (
    <button
      ref={buttonRef}
      id={id}
      type="button"
      data-testid={`space-row-place-${repoKey}`}
      className={`${SECONDARY} shrink-0 whitespace-nowrap`}
      title={long}
      aria-label={long}
      aria-expanded={expanded}
      disabled={disabled}
      onClick={onClick}
    >
      {placing
        ? i18n._({ id: "Placing…", comment: "the Place at… control while the placement is made and synced" })
        : i18n._({
            id: "Place at…",
            comment:
              "on a project's row: opens another instance's picker to keep its records there too; its title and accessible name are \"Also place at <display name>\" where one instance is offered",
          })}
    </button>
  );
}

/** The instances "Place at…" offers where it offers more than one
 * (space-88): each by its display name, named "Also place at <display
 * name>", with Cancel, Escape cancelling (DR-010 §6); focus lands on
 * the first. Choosing one opens its picker. */
export function PlaceChoice({
  repoKey,
  labelledBy,
  offered,
  connected,
  onChoose,
  onCancel,
}: {
  repoKey: string;
  /** The DOM id of the control that opened it, which names it. */
  labelledBy: string;
  offered: InstanceState[];
  connected: boolean;
  onChoose(instance: InstanceState): void;
  onCancel(): void;
}) {
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    firstRef.current?.focus();
  }, []);
  const option =
    "flex w-full min-w-0 items-center gap-2 rounded border border-neutral-200 px-2 py-1 text-left text-sm hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-800 dark:hover:bg-neutral-800";
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      data-testid={`space-place-choice-${repoKey}`}
      className="ml-6 flex min-w-0 flex-col gap-2 rounded border border-neutral-300 p-2 dark:border-neutral-700"
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <ul className="flex min-w-0 flex-col gap-1">
        {offered.map((instance, index) => {
          const long = alsoPlaceAt(instance);
          return (
            <li key={instance.origin} className="min-w-0">
              <button
                ref={index === 0 ? firstRef : undefined}
                type="button"
                data-testid={`space-place-instance-${instance.origin}`}
                className={option}
                title={long}
                aria-label={long}
                disabled={!connected}
                onClick={() => onChoose(instance)}
              >
                <span className="min-w-0 truncate">{instanceName(instance)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" data-testid={`space-place-cancel-${repoKey}`} className={SECONDARY} onClick={onCancel}>
          {i18n._({ id: "Cancel", comment: "leave the editor without changing anything" })}
        </button>
      </div>
    </div>
  );
}
