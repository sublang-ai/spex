<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-007: Conversational Session Start

## Status

Accepted (2026-07-11).
Amended by [DR-019](019-inline-agent-configuration.md), [DR-029](029-session-history-home.md), [DR-135](135-a-welcome-page-before-the-first-project.md), [DR-141](141-project-start-explains-the-task-and-slash-discovery.md).

## Context

- v1 landed with Sessions empty until the user first visited Projects, registered a repo by typing an absolute path, and clicked "Open session" — three surfaces before the first conversation.
- The product owner's review (2026-07-10): a Captain conversation must be front and center, where the user can see and invoke playbooks, and see or change the Captain's agent and model.
- The first build (a composer with a form around it) drew a second review (2026-07-11): the Captain must show up like a human chatting in an IM app, and discovery belongs in a `/` menu in the composer rather than in chips that do not scale.
- All the needed capabilities already exist on the protocol; this is presentation only ([DR-003](003-runtime-reuse.md) semantics untouched).

## Decision

### A project's start tab is a conversation

- With a project registered, a project's start tab is where its next session begins: its first task opens the conversation, with no form in the way ([DR-141](141-project-start-explains-the-task-and-slash-discovery.md) sets what the start tab shows before then; [DR-135](135-a-welcome-page-before-the-first-project.md) what shows before any project is registered).
- With projects registered but none current, the home greets the reader with a client-rendered line directing them to pick a project.
- Playbook runs read as an IM conversation everywhere: the user's messages appear as their own chat bubbles, Captain speech as counterpart bubbles, and shell status lines as small system lines between them.

### Discovery

- Typing `/` at the start of any composer opens a **slash menu**: the configured playbooks filtered as the user types, each with its intent as the hint; selecting inserts the command.

### Captain identity

- The Captain's agent appears compactly near the composer as a chip that opens its in-place editor per [DR-009](009-at-hand-interaction.md), so the agent and its tuning change without leaving the conversation ([DR-019](019-inline-agent-configuration.md)).

## Consequences

- Zero-to-first-turn happens inside one conversation; Projects is a management view rather than a required doorway.
- The home's guidance is client-side (no LLM call), so it is instant and free; the Captain's first real reply comes from the runtime.
- tmux-play has no equivalent surface; the verification-twin property of [DR-003](003-runtime-reuse.md) is unaffected.
