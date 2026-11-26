<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-046: Decision Record Evolution

## Status

Accepted (2026-09-04); revised (2026-11-26) on the owner's request.
Amends [DR-000](000-spec-structure-format.md), [DR-012](012-spec-package-files.md).

## Context

- Packages describe current intended behavior; DRs record the decisions and rationale behind it.
- Keeping every replaced decision in place grew Status sections to dozens of lines of scoped amendments, and left many DRs mostly or wholly superseded.
- An agent reading a DR's first lines could not see its standing, and had to reconstruct a decision chain to learn what still holds.
- Git history already keeps every earlier text and its rationale.

## Decision

- Proposed DRs may be revised in place; accepted DRs permit editorial corrections that leave the decision and rationale unchanged.
- Each DR states only decisions in force [[meta-35](../meta.md#meta-35)]:
  - a substantive change is recorded in a new DR, or in place where it stays within one DR's concern;
  - what it replaces is removed from the earlier DR;
  - a DR left with little or nothing in force merges into its successor and is deleted.
- Deleting a DR repoints every citation and mention of it — specs, intents, code, documentation and changelogs — to the DR that now holds its decisions; the ID is retired, never reused.
- A Status holds at most three lines: state and date, the DRs amended, and the DRs amending, by ID [[meta-36](../meta.md#meta-36)]; each change's scope is stated in the amending DR's body.
- A DR's `map.md` summary states its decisions in force in one line [[meta-37](../meta.md#meta-37)].
- Acceptance records design agreement: update affected current spec items in the same change; implementation progress belongs in IRs [[meta-5](../meta.md#meta-5)].
- Framework DRs follow the same convention.

## Consequences

- A DR's first lines show its standing, and its body reads as the decision in force.
- The rationale of a removed decision is read from Git history, not the tree.
- Existing DRs are brought to this form over several changes; until each is, its longer Status remains accurate history.
