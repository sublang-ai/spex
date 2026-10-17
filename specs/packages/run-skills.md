<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# run-skills: Run-Scoped Skills

## Intent

This package defines supplied skills in Spex's shared agent configuration and their delivery to session and authoring calls under [DR-122](../decisions/122-run-scoped-skills.md). A supplied skill is a local skill directory or its `SKILL.md`; persistent environment exports keep their separate contract.

## External Behavior

### run-skills-1

The shared configuration shall admit `skills` at the top level of your own group's file and on its Captain and player blocks, selecting each agent's list as follows:

| Input | Outcome |
| --- | --- |
| top-level list | default for every agent |
| agent list | replaces the default; `[]` selects none |
| no list | no supplied skills |
| non-array or an entry that is not a non-blank, NUL-free string | configuration rejected, naming the field and entry where applicable |
| relative entry | resolved against the originating configuration file's directory for execution |
| file save | original path spelling and comments retained; a skills merge patch replaces the list, and `null` removes the override |
| top-level skills or agent blocks in a project's file | refused under its playbooks-and-bindings contract [[core-service-2](core-service.md#core-service-2)] |
| Settings edit without a skills patch | the existing skills spelling and comments survive [[shared-config-roundtrip-2](shared-config-roundtrip.md#shared-config-roundtrip-2)] |

### run-skills-2

The core shall carry each agent's effective list to its Playbook session projection and to authoring calls using that agent, taking the current configuration at the next accepted turn, retaining the accepted turn's list in Playbook's execution record, and allowing a changed list on continuation without structural drift [[core-service-92](core-service.md#core-service-92)].

| Call scope | Delivery |
| --- | --- |
| session agent | effective list, subject to Playbook's control-call restrictions |
| authoring conversation | selected agent's effective list |
| compiler | no skills option |

- Cligent owns directory validation at invocation, native delivery and cleanup.
- Environment exports supply no implicit entries.

## Verification

### run-skills-3

When an integration suite edits and loads a commented configuration through the real core, opens a real Playbook session over recording adapters, and continues it after changing its skills, it shall assert defaults, replacement, explicit clearing, origin-relative resolution independent of the project's cwd, preserved file spelling and comments, malformed-list refusal without a write or provider call, the lists reaching the agent calls and accepted-turn records, and continuation without structural drift [[run-skills-1](#run-skills-1)] [[run-skills-2](#run-skills-2)].

### run-skills-4

When the live browser lane configures a skill outside the project and runs a playbook through the served app with a real player, it shall assert successful settlement and an output containing a fresh marker held only in the skill, with native invocation evidence in the player's transcript [[run-skills-2](#run-skills-2)].

### run-skills-5

When an integration suite sends an authoring message through the real core using a configured agent and a recording adapter, it shall assert that the agent's effective list reaches that call with paths anchored at the configuration directory rather than the authored package's working directory [[run-skills-2](#run-skills-2)].
