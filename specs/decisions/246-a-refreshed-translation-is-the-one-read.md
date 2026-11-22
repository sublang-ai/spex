<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-246: A Refreshed Translation Is the One Read

## Status

Accepted (2026-11-22).
Amends [DR-245](245-skills-and-the-atlas-in-the-readers-language.md) in which of a skill's own and the state folder's translation the atlas reads.

## Context

- [DR-245](245-skills-and-the-atlas-in-the-readers-language.md) reads a skill's translations from the skill's own folder, else from the state folder, and tells the agent never to write into a skill someone else installed.
- A skill may ship a translation that is behind its source.
  The agent then refreshes it in the state folder, and by that order the refreshed one is never read.
- A reader's language may match several tags a skill is translated under: `zh` and `zh-Hans` for a `zh-CN` reader.
  A rule comparing folders across tags gave the scan, the page and the served file different answers.

## Decision

- For one file and one tag, the atlas reads the skill's own translation, except where it is behind its source and the state folder's records the source's digest: then the state folder's.
  - A state folder's translation recording no digest never displaces the skill's own.
- For a reader's language, the tag read is the reader's own, else the first in order among the tags of the same language and script.
  - The tag is chosen before the folder, by the scan, the page and the served file alike.

## Consequences

- A translation the agent refreshes is shown once it is pinned, without touching the installed skill.
- A current translation under a later tag is passed over for a behind one under an earlier tag; the behind one is marked.
