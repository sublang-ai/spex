<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-135: A Welcome Page Before the First Project

## Status

Accepted (2026-10-22).
Amends [DR-010](010-interface-craft.md), [DR-141](141-project-start-explains-the-task-and-slash-discovery.md).
Amended by [DR-136](136-the-first-project-picker-leads-with-a-folder.md), [DR-137](137-specs-first-welcome-and-distinct-project-paths.md), [DR-172](172-surfaces-a-fresh-user-reads.md), [DR-246](246-remove-groups-and-team-servers-from-the-clients.md).

## Context

- The owner directed a first-visit page for the P0-0 workshop.
- The empty workspace looks like a general-purpose Captain chat, exposing a composer, playbook commands, agent identity, and readiness warnings before the reader knows the product's task workflow.
- Workshop participants have heard Spex's positioning, but the first screen still needs one clear next action and a way to use their own repository.
- Today's Academy action seeds a specs example; it does not replay a completed task.

## Decision

- Amends [DR-141](141-project-start-explains-the-task-and-slash-discovery.md) and [DR-010](010-interface-craft.md) only while no project is registered.
- With no registered project, the workspace shows a welcome page explaining Spex's specs-to-delivery workflow ([DR-137](137-specs-first-welcome-and-distinct-project-paths.md), [DR-139](139-quieter-welcome-flow-and-academy-choice.md)).
- The page offers a primary local-project action, a secondary Academy action naming the specs example it actually creates ([DR-137](137-specs-first-welcome-and-distinct-project-paths.md)), and an action opening Space to sign in or to discover and open personal projects ([DR-172](172-surfaces-a-fresh-user-reads.md), [DR-246](246-remove-groups-and-team-servers-from-the-clients.md)).
- The local-project action opens the local-project add form ([DR-136](136-the-first-project-picker-leads-with-a-folder.md)), without a duplicate Academy row.
- The zero-project page hides the Captain persona, composer, agent settings, quick-start commands, and adapter-readiness list; the sidebar retains its compact palette control without a second prominent add button.
- After registration, the workspace resumes its ordinary Captain home; an unready selected Captain is explained beside its composer and prevents dispatch while preserving the draft, with Settings, re-check, and a switch to another ready agent when one exists.
- Config or connection faults that block the whole app still surface on the welcome page.

## Consequences

- The first visit teaches the task workflow before introducing the Captain and playbook vocabulary.
- Academy's eventual recorded replay can replace the example-project copy without changing this page's structure.
- A returning reader with projects does not revisit onboarding unless all projects are removed.
