<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-123: Run-Scoped Skills

## Status

Accepted (2026-10-16) on the owner's request to adopt cross-agent skill delivery through the released runtime and verify it at the host boundary and in a real playbook run.
Amends [DR-019](019-inline-agent-configuration.md) in the admitted agent configuration, [DR-121](121-playbook-17-9-0-cligent-0-33-5-adoption.md) in its Cligent and Playbook floors, now `^0.34.0` and `^17.10.1`, and [DR-116](116-playbook-17-8-0-slc-0-16-1-adoption.md) in its slc floor, now `^0.16.2`, whose dependencies admit both.

## Context

Spex exports environment artifacts persistently into native skill folders under [DR-104](104-spec-package-format-and-client-environments.md).
Cligent now delivers a supplied skill directory for a run across its built-in agents; Playbook carries that list from configuration through the session host to each role's complete call settings.
A dependency update alone would leave Spex rejecting the field and dropping it from its projection.
The transport descriptors describe temporary delivery, not persistent installation folders, so they do not replace the environment export table.

## Decision

- Your own group's shared configuration accepts top-level `skills` defaults and replacement lists on the Captain and players, including an empty list. Each path names a skill directory or its `SKILL.md`. Relative entries resolve against that configuration file's directory; saved strings and comments stay unchanged.
- The effective list reaches each playbook session's agent projection and the selected agent's authoring conversations. It changes at the next accepted turn, without changing session identity. A role binding and per-session tuning introduce no second skills setting. Compiler invocations retain slc's existing options.
- Legacy config relocation leaves a file in place when moving it would retarget any supplied skill, as it already does for other relative locators.
- Configuration checks the list shape. Cligent owns directory validation, native transport, permissions and cleanup, and Playbook owns forwarding and control-call restrictions.
- Existing Settings edits preserve this hand-written field; the protocol admits its merge patch. No additional UI editor is introduced.
- Persistent environment exports keep their own contract and folder table. No installed environment artifact is implicitly added to a run's supplied list.
- Adopt the published dependencies together and retain one registry-backed Cligent and Playbook in the lock, without links or overrides; keep the existing agent SDK locks.

## Consequences

Spex proves configuration, persistence and host forwarding with deterministic integration tests, and a focused live browser journey proves that a configured skill reaches a real playbook player by requiring a result obtainable only from that skill.
Cligent retains its native adapter matrix; Spex does not duplicate it through the GUI.
