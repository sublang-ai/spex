<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-135: Welcome Flow Copy and Scoped Academy Note

## Status

Accepted (2026-10-22) for the owner's P0-0 revision.
Amends [DR-134](134-specs-first-welcome-and-distinct-project-paths.md) in the welcome presentation and first-project picker.
The welcome value explanation and Academy caption are amended by [DR-136](136-quieter-welcome-flow-and-academy-choice.md).

## Context

- A sentence with ordinary punctuation reads as a description rather than the specs-to-playbook-to-delivery flow Spex teaches.
- The Academy explanation sits beneath both welcome actions and appears to qualify both, although it describes only the secondary Academy action.
- The creation form's bottom link back to adding an existing repository repeats the folder action that remains visible above the form.

## Decision

- The welcome explanation uses Spex as the common actor and presents three stacked, arrow-linked stages for specs, compiled playbooks, and coordinated implementation and review.
- The Academy explanation is placed with the Academy button, inside its own action group.
- The creation form has no bottom "add existing repository" link. The existing-folder action remains visible above it; where a native folder picker is unavailable, an alternative above the form reopens existing-path entry.

## Consequences

- Each welcome caption has an unambiguous target, and the value sequence is legible at a glance.
- Both desktop and browser readers can still choose an existing repository while the creation form is open.
