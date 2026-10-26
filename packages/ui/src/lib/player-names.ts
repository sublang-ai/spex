// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A player's name (run-view-177, DR-154): the last dot-separated
// segment of its id — a dot is a naming habit, so no prefix is
// assumed — and its full id where another player of the same roster
// ends in the same segment. The full id is the tooltip's.

/** The id's last segment, or the id itself where that is empty. */
function lastSegment(id: string): string {
  const segment = id.slice(id.lastIndexOf(".") + 1);
  return segment || id;
}

/** Each roster player's name, keyed by id. */
export function playerNames(ids: Iterable<string>): Map<string, string> {
  const roster = [...new Set(ids)];
  const counts = new Map<string, number>();
  for (const id of roster) {
    const segment = lastSegment(id);
    counts.set(segment, (counts.get(segment) ?? 0) + 1);
  }
  return new Map(roster.map((id) => {
    const segment = lastSegment(id);
    return [id, (counts.get(segment) ?? 0) > 1 ? id : segment];
  }));
}

/** A namer over one roster: a player it does not hold reads by its own
 * last segment, as a lone player would. */
export function playerNamer(ids: Iterable<string>): (id: string) => string {
  const names = playerNames(ids);
  return (id) => names.get(id) ?? lastSegment(id);
}

/** The letter a player's mark holds: its name's first, uppercased. */
export function markLetter(name: string): string {
  return ([...name][0] ?? "?").toLocaleUpperCase();
}
