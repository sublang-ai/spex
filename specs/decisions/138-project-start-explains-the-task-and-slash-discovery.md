<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-138: Project Start Explains the Task and Slash Discovery

## Status

Accepted (2026-10-22) for the owner's P0-0 project-empty-state iteration.
Amends [DR-007](007-conversational-session-start.md) in the project home before a session starts, [DR-019](019-inline-agent-configuration.md) and [DR-038](038-history-is-done-work.md) in that home's Captain identity, and [DR-041](041-chrome-that-fits.md) in that home's composer hint.

## Context

- After a project is added, a chat greeting and an unexplained Captain/model label make Spex look like a general agent.
- The quick-start card presents selected slash commands as the expected starting point, even though Captain can choose a configured playbook from a described project task.
- The hint below the text field looks like another place to type, while the list of four commands plus a remainder obscures the full set.

## Decision

- Before a session starts, the project home leads with a project-specific task heading and concise guidance to describe a change and its acceptance criteria; it explains that Spex works through available playbooks, without claiming unrestricted agent capabilities.
- The home names Captain as the task coordinator who chooses a suitable playbook and arranges execution and review; its model settings remain available through a secondary control, with blocking readiness still visible at the composer.
- The home does not preselect or prominently list playbook commands. It teaches the single discovery gesture beside the input: type `/` in that input to see every configured playbook and its intent. Slash selection remains optional, and an ordinary task can be sent without a command.
- The resting slash/Enter caption is absent inside the project's empty composer. Its task field is the only text-entry affordance; submission keys remain in the submit control's tooltip, while staged-intent and acknowledgment captions still appear when needed.
- Once a task starts, the existing Captain conversation and runtime routing behavior take over; this decision changes no runtime routing or refusal contract.

## Consequences

- A new reader sees what kind of work to describe, who coordinates it, and how to inspect available playbooks without reading or choosing commands first.
- The seven built-in playbooks remain discoverable when configured, through the same slash menu used by every composer.
