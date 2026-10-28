// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// What a project's row does with its placements as a whole (space-88,
// space-89, DR-128), from its overflow (space-1, DR-159): "Place at…"
// keeps its records at another signed-in instance too. It stands where
// the clone holds a placement with an instance, the view lets the person
// manage the members of every one it holds, and some signed-in instance
// holds none of them; named "Also place at <display name>" where one
// instance is offered, it opens that instance's picker beneath the row
// (GroupPicker), and otherwise opens the choice of them in place, each
// so named. "Leave…" stops keeping the records at one instance: it
// stands while the clone holds a placement with an instance, named
// "Remove from <display name>" where it holds one, and otherwise opening
// the choice of them, each so named; the placement chosen is asked about
// inline, Remove or Keep, Keep focused — again, naming the count, where
// its Leave stopped for records no remaining placement received, or
// saying what may be left behind where it could not read that placement
// (space-98). A choice is named by the act that opened it, its options a
// picker's rows, the instance's name their words (space-28, DR-041).

import { useEffect, useRef, type KeyboardEvent } from "react";
import type { GroupsState, InstanceState, PlacementState } from "@sublang/spex-core/protocol";

import { i18n } from "../i18n.js";
import { instanceName } from "../lib/instances.js";
import { instanceNameAt, type LeaveStage } from "../lib/placements.js";
import { InlineConfirm } from "./InlineConfirm.js";
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

/** The words of "Place at…" (space-88). */
export const placeAtLabel = (): string =>
  i18n._({
    id: "Place at…",
    comment:
      "on a project's row: opens another instance's picker to keep its records there too; its title and accessible name are \"Also place at <display name>\" where one instance is offered",
  });

/** The words of "Leave…" (space-89). */
export const leaveLabel = (): string =>
  i18n._({
    id: "Leave…",
    comment:
      "on a project's row: stop keeping its records at one instance; its title and accessible name are \"Remove from <display name>\" where one is held",
  });

/** The instances "Place at…" offers where it offers more than one
 * (space-88): each by its display name, named "Also place at <display
 * name>", with Cancel, Escape cancelling (DR-010 §6); focus lands on
 * the first. Choosing one opens its picker. */
export function PlaceChoice({
  repoKey,
  offered,
  connected,
  onChoose,
  onCancel,
}: {
  repoKey: string;
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
      aria-label={placeAtLabel()}
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

/** The long name of "Leave…" where one placement with an instance is
 * held, and of that placement in its choice (space-89). */
export function removeFrom(name: string): string {
  return i18n._({
    id: "Remove from {name}",
    values: { name },
    comment:
      "the title and accessible name of Leave… where one instance is held, and of each instance in its choice; {name} is the instance's display name, or its host name before any read",
  });
}

/** The live note once a placement is left (space-89, DR-010 §7). */
export function removedFrom(name: string): string {
  return i18n._({ id: "Removed from {name}", values: { name }, comment: "the live note once a placement is left; {name} is the instance's display name" });
}

/** The placements "Leave…" offers where the clone holds more than one
 * with an instance (space-89): each by its instance's display name and
 * its path there, named "Remove from <display name>", with Cancel,
 * Escape cancelling (DR-010 §6); focus lands on the first. Choosing one
 * asks about it. */
export function LeaveChoice({
  groups,
  repoKey,
  held,
  connected,
  onChoose,
  onCancel,
}: {
  groups: GroupsState;
  repoKey: string;
  held: PlacementState[];
  connected: boolean;
  onChoose(line: PlacementState): void;
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
      aria-label={leaveLabel()}
      data-testid={`space-leave-choice-${repoKey}`}
      className="ml-6 flex min-w-0 flex-col gap-2 rounded border border-neutral-300 p-2 dark:border-neutral-700"
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <ul className="flex min-w-0 flex-col gap-1">
        {held.map((line, index) => {
          const name = instanceNameAt(groups, line.instance!);
          const long = removeFrom(name);
          return (
            <li key={line.instance} className="min-w-0">
              <button
                ref={index === 0 ? firstRef : undefined}
                type="button"
                data-testid={`space-leave-instance-${line.instance}`}
                className={option}
                title={long}
                aria-label={long}
                disabled={!connected}
                onClick={() => onChoose(line)}
              >
                <span className="min-w-0 flex-1 truncate">{name}</span>
                {/* Its path there yields first (DR-041). */}
                <span className="hidden min-w-0 max-w-[50%] truncate text-xs text-neutral-500 @md:inline" title={line.path}>
                  {line.path}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" data-testid={`space-leave-cancel-${repoKey}`} className={SECONDARY} onClick={onCancel}>
          {i18n._({ id: "Cancel", comment: "leave the editor without changing anything" })}
        </button>
      </div>
    </div>
  );
}

/** A Leave's inline confirm (space-89, DR-010 §4): Remove and Keep,
 * Keep focused, Escape keeping — first saying that nothing at the
 * instance changes; where that placement's Leave stopped for records no
 * remaining placement received, again with their count; where it could
 * not read that placement, that records pushed there since the last
 * sync may be left behind (space-98). */
export function LeaveConfirm({
  repoKey,
  stage,
  name,
  disabled,
  onRemove,
  onKeep,
}: {
  repoKey: string;
  stage: LeaveStage;
  /** The display name of the placement's instance. */
  name: string;
  disabled: boolean;
  onRemove(): void;
  onKeep(): void;
}) {
  const question =
    stage.stage === "unreceived"
      ? i18n._({
          id: "{count, plural, one {# unit has} other {# units have}} reached no other instance yet. Remove from {name} anyway?",
          values: { count: stage.count, name },
          comment: "Leave…'s second confirm: units no remaining placement holds; {name} is the instance's display name",
        })
      : stage.stage === "unread"
        ? i18n._({
            id: "Records pushed to {name} since the last sync may be left behind. Remove anyway?",
            values: { name },
            comment: "Leave…'s second confirm where that placement could not be read; {name} is the instance's display name",
          })
        : i18n._({
            id: "Remove from {name}? Nothing at {name} changes; these records stop syncing there.",
            values: { name },
            comment: "Leave…'s inline confirm, answered Remove or Keep; {name} is the instance's display name",
          });
  return (
    <div data-testid={`space-leave-confirm-${repoKey}`} data-stage={stage.stage} className="pl-6">
      <InlineConfirm
        question={<span>{question}</span>}
        confirmLabel={i18n._({ id: "Remove", comment: "confirm: stop keeping the records at that instance; nothing there changes" })}
        cancelLabel={i18n._({ id: "Keep", comment: "cancel a removal: leave it as it is" })}
        disabled={disabled}
        onConfirm={onRemove}
        onCancel={onKeep}
      />
    </div>
  );
}
