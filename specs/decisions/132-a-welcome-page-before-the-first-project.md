<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-132: A Welcome Page Before the First Project

## Status

Accepted (2026-10-22) on the owner's P0-0 direction.
Amends [DR-007](007-conversational-session-start.md) and [DR-010](010-interface-craft.md) only while no project is registered.
The own-project entry's label and palette layout are amended by [DR-133](133-the-first-project-picker-leads-with-a-folder.md).

## Context

- The empty workspace looks like a general-purpose Captain chat, exposing a composer, playbook commands, agent identity, and readiness warnings before the reader knows the product's task workflow.
- Workshop participants have heard Spex's positioning, but the first screen still needs one clear next action and a way to use their own repository.
- Today's Academy action seeds a specs example; it does not replay a completed task.

## Decision

- With no registered project, the workspace shows a welcome page explaining that Spex organizes AI development work into steps, review, and a traceable result.
- The page offers one primary Academy example action and one secondary own-project action; the Academy action names the specs example it actually creates until a recorded tutorial exists.
- The own-project action opens the existing project palette with its path field focused and without a duplicate Academy row.
- The zero-project page hides the Captain persona, composer, agent settings, quick-start commands, and adapter-readiness list; the sidebar retains its compact palette control without a second prominent add button.
- After registration, the workspace resumes its ordinary Captain home; an unready selected Captain is explained beside its composer and prevents dispatch while preserving the draft, with Settings, re-check, and a switch to another ready agent when one exists.
- Config or connection faults that block the whole app still surface on the welcome page.

## Consequences

- The first visit teaches the task workflow before introducing the Captain and playbook vocabulary.
- Academy's eventual recorded replay can replace the honest example-project copy without changing this page's two-path structure.
- A returning reader with projects does not revisit onboarding unless all projects are removed.
