<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-130: Playbook 17.11.0, Cligent 0.36.0 and slc 0.19.0 Adoption

## Status

Accepted (2026-10-20) on the owner's direction to adopt the native-skill releases and read the agent folders from Cligent.
Amends [DR-126](126-cligent-0-34-1-slc-0-18-1-adoption.md) and [DR-123](123-playbook-17-10-1-cligent-0-34-0-slc-0-18-0-adoption.md) in their floors and lock resolutions alone: Playbook `^17.11.0`, Cligent `^0.36.0` and slc `^0.19.0`; the skills decisions and every other constraint stand.
Amends [DR-124](124-skills-reach-every-agent.md) in where the agent table's folders come from and in which agents see the exports: the project-level and user-level folders are Cligent's published ones, and Captain control and compiler calls no longer read them except where an agent offers no switch.

## Context

- Cligent 0.35.0 publishes `NATIVE_SKILL_SUPPORT`: per adapter, the project-level and user-level folders where its runtime discovers a persistent skill, the folders DR-124 copied from Cligent's DR-036, and whether a per-run `nativeSkills: false` turns that discovery off [[1]].
- DR-124 declined waiting for those folders as data because DR-036 already named them; Cligent now publishes them.
- Cligent 0.36.0 carries `nativeSkills` in tmux-play's complete call settings [[2]].
- Playbook 17.11.0 turns native skill discovery off, as far as each agent allows, on Captain decision, Judge and reporting calls; a Kimi Code Captain, which has no per-run lever, keeps it, and a Captain conversation begun before that release keeps the listings already in it [[3]].
- slc 0.19.0 turns it off on every compiler call and requires Playbook `^17.11.0` and Cligent `^0.36.0` [[4]].
- Cligent 0.36.0 keeps the agent SDK peer ranges of 0.34.1 [[5]].

## Decision

- **Floors.** The core requires `@sublang/playbook` `^17.11.0` and `@sublang/cligent` `^0.36.0`; both shells require `@sublang/slc` `^0.19.0`.
- **The lock.** The public-registry lock resolves one Playbook 17.11.0, one Cligent 0.36.0 and one slc 0.19.0 at the tree's root, without links or overrides for these packages; every agent SDK stays at its locked version.
- **The built-in spec package** follows, at 17.11.0, as the core seeds it at Playbook's version.
- **The agent table reads Cligent.** Each agent's project-level and user-level folders come from Cligent's published native-skill support; the home folders that show the device has an agent and whether playbook skills go to it stay Spex's own facts.
- **Spex sends no switch of its own.** Captain control and compiler calls take it from Playbook and slc; working players and authoring sessions keep their native skills, which is how exported skills reach them.

## Consequences

- A Cligent release that moves a runtime's skill folders moves Spex's exports at its adoption, reviewed with it, rather than through a table Spex keeps in step by hand.
- Exported skills and specs no longer reach Captain decision, Judge or reporting calls on Claude Code, Codex, Gemini CLI or OpenCode, nor compiler calls, as far as each runtime's levers reach; a Kimi Code Captain still reads them.
- A Captain or compiler call whose agent offers the switch but cannot apply it where it runs, such as Gemini CLI under its native sandbox or Codex with an unreadable skill root, now fails rather than running with native skills.
- This dependency update does not recompile existing artifacts, update an environment lock or claim a session-store format migration.

## References

[1]: https://github.com/sublang-ai/cligent/blob/v0.36.0/specs/decisions/037-per-run-native-skill-switch.md "Cligent DR-037: Per-Run Native Skill Switch"
[2]: https://github.com/sublang-ai/cligent/blob/v0.36.0/specs/decisions/038-native-skills-in-tmux-play-call-settings.md "Cligent DR-038: Native Skills in tmux-play Call Settings"
[3]: https://github.com/sublang-ai/playbook/blob/v17.11.0/CHANGELOG.md "Playbook changelog: 17.11.0"
[4]: https://github.com/sublang-ai/slc/blob/v0.19.0/CHANGELOG.md "slc changelog: 0.19.0"
[5]: https://github.com/sublang-ai/cligent/blob/v0.36.0/package.json "Cligent 0.36.0 peer dependencies"
