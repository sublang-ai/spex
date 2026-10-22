<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-138: Project Start Explains the Task and Slash Discovery

## Status

Accepted (2026-10-22) for the owner's P0-0 project-empty-state iteration.
Amended (2026-10-22) after the owner's review of the project start: the Captain identity and model control sit together immediately above the composer, and the slash hint moves below it.
Amended (2026-10-22) after the owner's empty-state review: separate the task introduction from the action group, add a quiet read-only explanation with examples from configured playbooks below the slash hint, and reduce the home composer's Up next action to a text treatment while preserving capture behavior.
Amended (2026-10-22) after reviewing the result: ask plainly what the owner wants to change; condense the playbook definition and configured examples into a quiet composer footer, then end that footer with the slash instruction and the live configured count.
Amended (2026-10-22) after the owner's copy review: explain playbooks through the familiar Skill analogy while distinguishing their compiled execution flow; prefer configured `/code` and `/review` examples, keep the definition and examples in one paragraph, and make the slash hint explicitly name the task field with the same type treatment and subdued color as the examples.
Amended (2026-10-22) after the owner's specs-first review: the project task guidance names specs as the place for goals and acceptance criteria, and a compact per-project status links to the existing Specs tab; the pinned tab shows the count of spec packages when known.
Amends [DR-007](007-conversational-session-start.md) in the project home before a session starts, [DR-019](019-inline-agent-configuration.md) and [DR-038](038-history-is-done-work.md) in that home's Captain identity, and [DR-041](041-chrome-that-fits.md) in that home's composer hint.

## Context

- After a project is added, a chat greeting and an unexplained Captain/model label make Spex look like a general agent.
- The quick-start card presents selected slash commands as the expected starting point, even though Captain can choose a configured playbook from a described project task.
- The hint below the text field looks like another place to type, while the list of four commands plus a remainder obscures the full set.

## Decision

- Before a session starts, the project home leads with a project-specific task heading and concise guidance to tell Captain what should change and how to judge completion; it names specs as the place to clarify goals and acceptance criteria, then explains that Captain selects a suitable playbook and arranges AI implementation and review, without promising that submitting a task automatically creates specs or claiming unrestricted agent capabilities. The guidance aligns with the full width of the composer.
- Below the guidance, a quiet project-specific status shows the known count of spec packages and items with a link to the pinned Specs tab. A project without `specs/`, an empty packages collection, a legacy tree, and a read failure each get accurate distinct wording and a link to the relevant Specs guidance; loading never masquerades as zero. This status remains secondary to the task composer.
- The pinned Specs tab stays in its current place and displays a plain package count when the current project's tree is known and contains packages; the count is spoken with its unit, is not an attention badge, and is omitted while loading, empty, legacy, or unreadable. The tab remains available throughout the project workspace.
- Immediately above the composer, a compact Captain identity uses the same avatar and name as the running Captain pane. Its current adapter, model, effort, fast-mode mark, and readiness appear in one clickable chip that opens the in-place editor; a missing Captain reads as unconfigured. Blocking readiness remains visible at the composer.
- The home separates the task introduction from the Captain identity and composer with a larger interval than the gaps inside either group. The heading asks in plain language what to change in the named project; the guidance asks for the goal and how to know it is done. Below the composer, a compact, borderless, low-emphasis paragraph explains a playbook as akin to a Skill compiled into an executable flow and previews at most two actually configured examples, preferring `/code` and `/review`. Its final line, at the same muted contrast, explicitly teaches the single discovery gesture: type `/` in the task field to see all configured playbooks and states their live count. Slash commands and the hint's `/` share code typography. The preview neither preselects a command nor offers a second route to run one. Slash selection remains optional, and an ordinary task can be sent without a command. The preview yields to the primary task when an Up next card is present.
- The home composer's "Add to Up next" keeps its queued-intent capture and inline acknowledgment, but reads visually as a secondary text action beside the primary Start task control.
- The project's task field has an accessible label but no separate visible label. The resting slash/Enter caption is absent inside the empty composer; submission keys remain in the primary control's tooltip, while staged-intent and acknowledgment captions still appear when needed.
- Once a task starts, the existing Captain conversation and runtime routing behavior take over; this decision changes no runtime routing or refusal contract.

## Consequences

- A new reader sees what kind of work to describe, who coordinates it, and what a playbook does, without having to read or choose commands first.
- The seven built-in playbooks remain discoverable when configured, through the same slash menu used by every composer.
