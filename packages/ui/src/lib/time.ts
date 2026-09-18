// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// One vocabulary for time (DR-010 §2): an age always says "ago" and
// carries the absolute moment for the reader who wants it; a duration
// says how long something took. Every surface draws from here so a
// bare "3m" never means two different things on one screen.
//
// Each phrase is a message of the catalog and each moment formats in
// the interface language (localization-4, localization-5): the units
// translate, and a compact age keeps ids of its own because "3m" the
// age and "3m" the span are one English text with two translations.

import { currentLocale, i18n } from "../i18n.js";

/** A moment's age in words: "just now", "3m ago", "2h ago", "5d ago",
 * "3w ago". */
export function relativeAge(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return i18n._("just now");
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return i18n._("{minutes}m ago", { minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return i18n._("{hours}h ago", { hours });
  const days = Math.round(hours / 24);
  if (days < 7) return i18n._("{days}d ago", { days });
  return i18n._("{weeks}w ago", { weeks: Math.round(days / 7) });
}

/** The compact age for tight chrome (a sidebar row): "now", "3m",
 * "2h", "5d", "3w" — always paired with `absoluteTitle`. */
export function compactAge(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) {
    return i18n._({ id: "age.now", message: "now", comment: "compact age in tight chrome: under a minute old" });
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return i18n._("age.minutes", { minutes }, { message: "{minutes}m", comment: "compact age in tight chrome: that many minutes ago" });
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return i18n._("age.hours", { hours }, { message: "{hours}h", comment: "compact age in tight chrome: that many hours ago" });
  }
  const days = Math.round(hours / 24);
  if (days < 7) {
    return i18n._("age.days", { days }, { message: "{days}d", comment: "compact age in tight chrome: that many days ago" });
  }
  return i18n._("age.weeks", { weeks: Math.round(days / 7) }, { message: "{weeks}w", comment: "compact age in tight chrome: that many weeks ago" });
}

/** The same age for a phrase that already says it is an age — "since
 * {age}", "for {age}" — so a caller never strips "ago" back off a
 * translated text, which only English spells that way
 * (localization-4). */
export function ageSpan(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  return seconds < 60 ? i18n._("just now") : compactAge(at, now);
}

/** A span in words: "<1s", "12s", "3m 12s", "2h 5m" — every span the
 * app shows, a tool call's included, so milliseconds never reach the
 * reader. */
export function duration(ms: number): string {
  if (ms < 1000) return i18n._({ id: "<1s", comment: "a span shorter than one second" });
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return i18n._("{seconds}s", { seconds });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const rest = seconds % 60;
    return rest > 0
      ? i18n._("{minutes}m {seconds}s", { minutes, seconds: rest })
      : i18n._("{minutes}m", { minutes });
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0
    ? i18n._("{hours}h {minutes}m", { hours, minutes: rest })
    : i18n._("{hours}h", { hours });
}

/** The absolute moment for a tooltip, in the interface language. */
export function absoluteTitle(at: number): string {
  return new Date(at).toLocaleString(currentLocale());
}

/** A message's clock time for its stamp — "5:22 PM", or "17:22" where
 * the locale says so — always paired with `absoluteTitle` for the date. */
export function clockTime(at: number): string {
  return new Date(at).toLocaleTimeString(currentLocale(), {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** An age at the duration's own grain — "12s ago", "3m 12s ago" — for
 * the one place a coarse age would hide a life sign: the compile band's
 * "last output" clock, where a silent agent-driven phase must read as
 * alive rather than stuck (DR-010 §5, playbook-library-57). */
export function preciseAge(at: number, now: number): string {
  return i18n._("{span} ago", { span: duration(Math.max(0, now - at)) });
}
