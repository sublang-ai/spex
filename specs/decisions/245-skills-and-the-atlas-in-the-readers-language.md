<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-245: Skills and the Atlas in the Reader's Language

## Status

Accepted (2026-11-21).
Extends [DR-242](242-skills-shipped-from-the-repository-and-an-atlas-of-them.md) in the atlas's scan, page and state folder and in the form of a shipped skill.

## Context

- The atlas's page and the skills shipped from `skills/` are written in English alone ([DR-242](242-skills-shipped-from-the-repository-and-an-atlas-of-them.md)).
  A reader of Chinese sees an English page over English sources.
- A page in one language over sources in another is half translated: the page's own words are few, and what a reader studies is the skill's text.
- An agent loads `SKILL.md` and nothing else by name [[1]]; a second file in a skill's folder changes nothing an agent does.
- Most installed skills are written by others, in one language.
  The agent that loads `skill-atlas` can translate a skill it reads, as it already writes annotations for one.
- Considered and declined:
  - a folder per language holding a second `SKILL.md`: a tool that finds skills by that file name would list the translation as a skill, the atlas included;
  - translating in the page through a service: a skill runs with nothing fetched and sends a reader's skills nowhere;
  - the page's Chinese text inside the page's file: a reader could not correct a word or add a language without editing the page;
  - matching tag rules against translated text: the rules are English expressions, and a translation's tags would differ from its source's.

## Decision

- Two languages are offered, named by their tags: `en-US`, the source of the page's text, and `zh-CN`.
- A translation of a file is a file beside it named with the language's tag before the extension: `SKILL.zh-CN.md` beside `SKILL.md`, `references/prompts.zh-CN.md` beside `references/prompts.md`.
  - `SKILL.md` stays the one file an agent loads; a translation is for readers and says so.
  - A translation records the digest of its source and its own as they stood when the two last matched, so a change to either since is known: the translation is behind its source, edited apart from it, or both.
  - A reader may edit either; the agent carries an edit across to the other on request, and the record is renewed only once the two match again.
  - A skill's original language is whatever its `SKILL.md` is written in: a skill written in Chinese is translated by `SKILL.en-US.md`.
- Every Markdown file of a skill shipped from `skills/`, and each file of labels under its `references/`, has a `zh-CN` translation: a Markdown one records its source's digest and its own, a label file its source's alone.
- A catalog and a label file are data the page reads: an edit to one takes effect as it stands.
- The atlas reads a skill's translations from the skill's own folder, else from `translations/<skill id>/` in the state folder, where the loading agent writes translations of skills others wrote, on the user's request.
  - The scan reports, per language, a skill's description, its steps' titles and text, and whether the translation is behind its source or edited apart from it.
  - Steps, links and tags are read from `SKILL.md` alone; a translation supplies words, never structure.
- The page shows everything in one language at a time: its own text, the labels of tags, presets and settings, and each skill's description, steps and files.
  - The language is the reader's choice on the page, else the one the command names, else the browser's, else `en-US`.
  - A skill with no translation in that language is shown in its original and marked; a translation behind its source or edited apart from it is shown and marked, the latter as text agents do not yet follow.
  - The page's text in a language is a catalog file keyed by the English text; the labels of the tunable files are files beside them.
- Names a reader typed — workflows and phases — are theirs and are never translated.

## Consequences

- A reader can correct the page's Chinese, or add a language, by editing a file in the installed skill.
- A change to a shipped skill's text or to its Markdown translation fails the repository's tests until the other is brought in line; a label file's own edit passes, as it takes effect as it stands.
- An edit to a translation changes nothing an agent does until it is carried into the source; the page says so where the reader would otherwise assume it had.
- Considered and declined: an agent loading the translation where its user writes Chinese — two loadable texts drift into two skills, and which one ran would depend on the language of a request.
- A tag's evidence quotes the line it was matched on, in the skill's original language.
- A skill written in Chinese is tagged only as far as the English rules match it.
- The command's own output — the digest, warnings, errors — stays in English: it is read by the agent.

## References

[1]: https://agentskills.io/specification "Agent Skills specification"
