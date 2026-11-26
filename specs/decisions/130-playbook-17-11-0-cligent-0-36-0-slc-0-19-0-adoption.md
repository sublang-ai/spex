<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-130: Native Skills Off on Captain Control and Compiler Calls

## Status

Accepted (2026-10-20).
Amends [DR-124](124-skills-reach-every-agent.md).
Amended by [DR-165](165-one-package-manager-hosted-by-the-cli-and-the-app.md).

## Context

- Cligent publishes `NATIVE_SKILL_SUPPORT`: per adapter, the project-level and user-level folders where its runtime discovers a persistent skill, and whether a per-run `nativeSkills: false` turns that discovery off [[1]].
- Cligent carries `nativeSkills` in tmux-play's complete call settings [[2]].
- Playbook turns native skill discovery off, as far as each agent allows, on Captain decision, Judge and reporting calls; a Kimi Code Captain, which has no per-run lever, keeps it, and a Captain conversation begun before that release keeps the listings already in it [[3]].
- slc turns it off on every compiler call [[4]].

## Decision

- **The agent table is checked against Cligent.** Each agent's project-level and user-level folders agree with Cligent's published native-skill support; the home folders that show the device has an agent and whether playbook skills go to it stay Spex's own facts.
- **Spex sends no switch of its own.** Captain control and compiler calls take it from Playbook and slc; working players and authoring sessions keep their native skills, which is how exported skills reach them.

## Consequences

- A Cligent release that moves a runtime's skill folders fails that check at its adoption, so Spex's exports move with it, reviewed, rather than drifting.
- Exported skills and specs do not reach Captain decision, Judge or reporting calls on Claude Code, Codex, Gemini CLI or OpenCode, nor compiler calls, as far as each runtime's levers reach; a Kimi Code Captain still reads them.
- A Captain or compiler call whose agent offers the switch but cannot apply it where it runs, such as Gemini CLI under its native sandbox or Codex with an unreadable skill root, fails rather than running with native skills.

## References

[1]: https://github.com/sublang-ai/cligent/blob/v0.36.0/specs/decisions/037-per-run-native-skill-switch.md "Cligent DR-037: Per-Run Native Skill Switch"
[2]: https://github.com/sublang-ai/cligent/blob/v0.36.0/specs/decisions/038-native-skills-in-tmux-play-call-settings.md "Cligent DR-038: Native Skills in tmux-play Call Settings"
[3]: https://github.com/sublang-ai/playbook/blob/v17.11.0/CHANGELOG.md "Playbook changelog: 17.11.0"
[4]: https://github.com/sublang-ai/slc/blob/v0.19.0/CHANGELOG.md "slc changelog: 0.19.0"
