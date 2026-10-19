<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-123: Playbook 17.10.1, Cligent 0.34.0 and slc 0.18.0 Adoption

## Status

Accepted (2026-10-19) on the owner's direction that skills reach agents through the spec packages environments install.
Amends [DR-121](121-playbook-17-9-0-cligent-0-33-5-adoption.md) in its floors alone: the core requires `@sublang/playbook` `^17.10.1` and `@sublang/cligent` `^0.34.0`.
Amends [DR-116](116-playbook-17-8-0-slc-0-16-1-adoption.md) in its slc floor alone: both shells require `@sublang/slc` `^0.18.0`.
Amends [DR-105](105-playbook-17-5-0-adoption.md) in its parity claim alone: the core refuses a `skills` list beside a playbook's `from`.
Amended by [DR-125](125-cligent-0-34-1-slc-0-18-1-adoption.md) in its Cligent and slc floors and lock resolutions alone: Cligent `^0.34.1` and slc `^0.18.1`; Playbook and the skills decisions stand.
Follows [DR-081](081-the-app-supplies-the-compiler.md)'s explicit-bump rule for the compiler and [DR-024](024-app-supplied-agent-runtimes.md)'s app-supplied agent runtimes; nothing either decided changes.

## Context

- Every slc release from 0.16.2 requires Cligent `^0.34.0` and Playbook `^17.10.1`, so no compiler fix after 0.16.1 lands without both [[1]] [[2]].
- slc 0.16.4 makes a generated schema-3 entry validate the option slice Playbook's Captain hands it, where an entry slc 0.16.1 generated reads a `captainOptions` member that call never carries [[2]].
- slc 0.17.0 and 0.18.0 let a caller bound coverage by invocations, attempts and duration, keeping the five-minute default deadline earlier releases already apply [[2]].
- Playbook 17.10.0 shows a judge a field of unrecorded shape as `<value>`, not `<string>`, and Playbook 17.10.1 removes framework-owned Boss-question results from the published CODE GEARS [[3]].
- Cligent 0.34.0 adds a run-scoped `skills` option that copies named skill folders into each run, and leaves installation into the folders each runtime reads — `.claude/skills` for Claude Code, `.agents/skills` for Codex, Gemini CLI, Kimi Code and OpenCode — to the host [[4]] [[5]].
- Playbook 17.10.0's launcher accepts `skills` path lists at the top of its config and on the Captain and each player, and sends an empty list on every call of an agent that has none [[3]] [[6]].
- The launcher reads `$SPEX_HOME/config/playbook.config.yaml` [[7]], while Spex reads your own group's file in its spex repository, which syncs to each of your devices ([DR-103](103-the-home-and-its-groups.md)).
- A skill path in that file names a folder on one device, which [DR-104](104-spec-package-format-and-client-environments.md) retired from shared files as it retired a playbook's `from` ([DR-105](105-playbook-17-5-0-adoption.md)).

## Decision

- **Floors.** The core requires `@sublang/playbook` `^17.10.1` and `@sublang/cligent` `^0.34.0`; both shells require `@sublang/slc` `^0.18.0`.
- **The lock.** The lockfile is regenerated from the public registry, with no links or overrides, and holds one Playbook, 17.10.1, one Cligent, 0.34.0, and one slc, 0.18.0, at the tree's root, the compiler's ranges resolving to those copies; the agent SDK locks stay where they are.
- **The built-in spec package** follows, at 17.10.1, as the core seeds it at Playbook's version.
- **Skills come from environments.** The core refuses a `skills` list at the top of your own group's file, on its Captain and on its players, naming the entry, as it refuses a `from`; a project's file already holds only playbooks. Spex composes no supplied skills, so Playbook sends none and no session record carries a `skills` key.
- **The fixture follows the compiler.** The linked-artifact fixture writes the schema-3 entry slc 0.16.4 and later emit.

Considered and declined:

- Admitting `skills` paths in your own group's file for the launcher's parity: a path in a synced file names a folder on one device, which DR-104 retired and DR-103 declined as a second personal place for skills, and the two hosts no longer read one file.
- Delivering an environment's skills per run through Cligent's option: a skill would arrive twice where the runtime also reads the exported folder, Kimi Code's run copy sits in the code's checkout, and session records would carry device paths.

## Consequences

- A hand-written `skills` list fails the configuration load with its entry named and the reason given; the Playbook CLI's own file keeps whatever its user writes there.
- A playbook whose schema-3 entry slc 0.16.1 generated and whose options are required reads them only once recompiled.
- Playbook 17.10.1 and slc 0.18.0 run on Cligent 0.34.0 in one install, while no session record Spex writes gains a key an earlier Playbook refuses.

## References

[1]: https://github.com/sublang-ai/slc/blob/v0.18.0/package.json "slc 0.18.0 package manifest: its Playbook and Cligent ranges"
[2]: https://github.com/sublang-ai/slc/blob/v0.18.0/CHANGELOG.md "slc changelog: 0.16.2 to 0.18.0"
[3]: https://github.com/sublang-ai/playbook/blob/v17.10.1/CHANGELOG.md "Playbook changelog: 17.10.0 and 17.10.1"
[4]: https://github.com/sublang-ai/cligent/blob/v0.34.0/CHANGELOG.md "Cligent changelog: 0.34.0"
[5]: https://github.com/sublang-ai/cligent/blob/v0.34.0/specs/decisions/036-cross-agent-skill-installation.md "Cligent DR-036: Cross-agent skill installation"
[6]: https://github.com/sublang-ai/playbook/blob/v17.10.1/specs/decisions/092-skills-follow-working-agents.md "Playbook DR-092: Skills follow working agents"
[7]: https://github.com/sublang-ai/playbook/blob/v17.10.1/docs/configuration.md "Playbook configuration: the shared launcher config"
