// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A playbook's intent as the reader reads it (localization-4). The
// built-in spec package `sublang/playbooks` ships its playbooks in
// English, each registry entry carrying its intent; the catalog holds
// each of those intents as a message keyed by that English text, byte
// for byte, so the intent itself is the lookup. Any other intent — a
// team's own playbook's — is the team's words and renders as given.
//
// Every surface that shows a playbook's intent — the quick-start card,
// the slash menu, the Playbooks surface — reads it through
// `playbookIntent`.
//
// Each key is written twice, as the table's key and inside its
// `i18n._` call, because the extractor reads only a literal. The
// localization test reads the installed Playbook's registry entries,
// so a Playbook whose intent moved fails the suite rather than
// falling back to English unnoticed.

import { i18n } from "../i18n.js";

const BUILTIN_INTENTS: ReadonlyMap<string, () => string> = new Map([
  [
    "implement a coding intent in reviewed, one-commit phases, using an intent record when needed",
    () =>
      i18n._({
        id: "implement a coding intent in reviewed, one-commit phases, using an intent record when needed",
        comment: "the built-in /code playbook's intent, as its registry entry states it",
      }),
  ],
  [
    "review a supplied scope of committed work until no unsettled findings remain",
    () =>
      i18n._({
        id: "review a supplied scope of committed work until no unsettled findings remain",
        comment: "the built-in /review playbook's intent, as its registry entry states it",
      }),
  ],
  [
    "synthesize independent Coder and Reviewer proposals into an approved spec-design commit",
    () =>
      i18n._({
        id: "synthesize independent Coder and Reviewer proposals into an approved spec-design commit",
        comment: "the built-in /decide playbook's intent, as its registry entry states it",
      }),
  ],
  [
    "plan the development path for a request: direct implementation, or a durable decision first, delivered through a pull request when the request names a GitHub issue or asks for one",
    () =>
      i18n._({
        id: "plan the development path for a request: direct implementation, or a durable decision first, delivered through a pull request when the request names a GitHub issue or asks for one",
        comment: "the built-in /dev playbook's intent, as its registry entry states it",
      }),
  ],
  [
    "create and check out a new branch for a GitHub issue or request before pull-request delivery",
    () =>
      i18n._({
        id: "create and check out a new branch for a GitHub issue or request before pull-request delivery",
        comment: "the built-in /branch playbook's intent, as its registry entry states it",
      }),
  ],
  [
    "publish a reviewed branch as a pull request, wait for its checks, fix red checks once through code, and merge it",
    () =>
      i18n._({
        id: "publish a reviewed branch as a pull request, wait for its checks, fix red checks once through code, and merge it",
        comment:
          "the built-in /pr playbook's intent, as its registry entry states it; `code` is the /code playbook",
      }),
  ],
  [
    "inspect supplied material or a running web interface and explain observed evidence without changing the repository",
    () =>
      i18n._({
        id: "inspect supplied material or a running web interface and explain observed evidence without changing the repository",
        comment: "the built-in /inspect playbook's intent, as its registry entry states it",
      }),
  ],
]);

/** A playbook's intent in the interface language: a built-in's from
 * the catalog, any other as its registry entry gives it. */
export function playbookIntent(intent: string): string;
export function playbookIntent(intent: string | null): string | null;
export function playbookIntent(intent: string | null): string | null {
  if (intent === null) return null;
  const phrase = BUILTIN_INTENTS.get(intent);
  return phrase ? phrase() : intent;
}
