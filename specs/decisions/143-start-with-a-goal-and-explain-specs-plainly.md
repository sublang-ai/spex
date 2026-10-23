<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-143: Start With a Goal and Explain Specs Plainly

## Status

Accepted (2026-10-22) on the owner's copy review.
Amends [DR-137](137-specs-first-welcome-and-distinct-project-paths.md) in the welcome explanation and [DR-141](141-project-start-explains-the-task-and-slash-discovery.md) in the project-start guidance and playbook definition.

## Context

- Specs chiefly describe how a system should behave; goals and acceptance criteria alone do not explain them.
- Asking for complete specs or acceptance criteria before starting adds a barrier the AI can help remove.
- The Skill analogy and compiler terms require prior knowledge to understand a playbook.

## Decision

- The welcome and project start explain that specs describe how the system should work and how to check it.
- The task prompt invites a goal; its guidance explains that AI helps develop the specs before implementing and reviewing changes.
- A playbook is explained as a workflow written in plain language that Spex can run to coordinate AI implementation and review.
- English and Chinese copy in the welcome, project start and project-add flow uses short, direct phrases and makes the next action clear.

## Consequences

- A person can begin with a goal and develop the details with AI.
- The introduction teaches specs and playbooks without requiring knowledge of Skills or compilation.
- Task submission keeps its existing behavior; the copy adds no automatic spec-writing guarantee.
