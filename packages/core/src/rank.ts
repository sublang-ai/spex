// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Lexicographic order keys for the intent queue (DR-035): position is
// priority, and a reorder writes one row. Keys are strings over a
// base-36 digit set that never end in the lowest digit, so a key
// strictly between any two neighbours always exists.

const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

function digit(key: string, index: number): number {
  return index < key.length ? DIGITS.indexOf(key[index]) : 0;
}

/** A key strictly greater than `a` (`""` means before everything). */
function keyAbove(a: string): string {
  let i = 0;
  while (a[i] === DIGITS[DIGITS.length - 1]) i += 1;
  if (i === a.length) return a + DIGITS[18];
  const da = digit(a, i);
  return a.slice(0, i) + DIGITS[Math.ceil((da + DIGITS.length) / 2)];
}

/**
 * A key strictly between `a` and `b` in lexicographic order.
 * `a === null` means the head sentinel (before everything) and
 * `b === null` the tail sentinel (after everything); when both bound,
 * `a < b` is required.
 */
export function rankBetween(a: string | null, b: string | null): string {
  const low = a ?? "";
  if (b === null) return keyAbove(low);
  if (low >= b) throw new Error(`rank order violated: "${low}" >= "${b}"`);
  let i = 0;
  while (i < b.length && (low[i] ?? DIGITS[0]) === b[i]) i += 1;
  const prefix = b.slice(0, i);
  const da = digit(low, i);
  const db = digit(b, i);
  if (db - da > 1) return prefix + DIGITS[Math.round((da + db) / 2)];
  return prefix + DIGITS[da] + keyAbove(low.slice(i + 1));
}
