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
- Bringing this repository's 247 DRs to that form, down to 190, showed where a rule alone was not enough:
  - Twenty-eight records only raised a dependency floor that a later record raised again; each left a "floor alone" line on the records before it.
  - Amended records were rarely rewritten in the change that amended them, so the fix-up fell to a later sweep.
  - Relation words beyond the two — extends, completes, applies, clarifies — crept into Statuses, and many relations were stated on one side only.
  - Wholly superseded records stayed in the tree with a Superseded status.

## Decision

- Proposed DRs may be revised in place; accepted DRs permit editorial corrections that leave the decision and rationale unchanged.
- Each DR states only decisions in force, and the change that amends a DR rewrites it in the same change [[meta-35](../meta.md#meta-35)]:
  - a change within one DR's concern, including a value it decides such as a version floor, a default or a limit, revises that DR in place, so a dependency upgrade adds no DR;
  - a change beyond one DR's concern is recorded in a new DR, and what it replaces is removed from the earlier DR;
  - a DR whose remainder would fit as a few bullets of its successor, or whose subject is retired, merges into its successor and is deleted.
- Deleting a DR repoints every citation and mention of it — specs, intents, code, documentation and changelogs — to the DR that now holds its decisions; the ID is retired, never reused.
- A Status holds at most three lines: state and date, the DRs amended, and the DRs amending, by ID [[meta-36](../meta.md#meta-36)]; each change's scope is stated in the amending DR's body.
- `Amends` and `Amended by` are the only relations, each stated on both sides, and only where a decision the other DR still states changes [[meta-38](../meta.md#meta-38)].
- A DR's `map.md` summary states its decisions in force in one line [[meta-37](../meta.md#meta-37)].
- `spex lint` fails a Status over three lines, a relation line carrying more than DR citations, a superseded DR kept, and a relation stated on one side, so the form holds without a sweep [[lint-15](../packages/lint.md#lint-15)] [[lint-16](../packages/lint.md#lint-16)].
- Acceptance records design agreement: update affected current spec items in the same change; implementation progress belongs in IRs [[meta-5](../meta.md#meta-5)].
- Framework DRs follow the same convention.

## Consequences

- A DR's first lines show its standing, and its body reads as the decision in force.
- The rationale of a removed decision is read from Git history, not the tree.
- A dependency upgrade edits the record that holds the floor; its rationale lives in the commit.
- A project updating its scaffold whose DRs predate the rule fails lint until its records are brought to the form, which is the cost of the rule holding.
