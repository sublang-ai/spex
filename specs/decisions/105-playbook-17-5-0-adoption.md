<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-105: Modules and Skills Come from Environments

## Status

Accepted (2026-10-06); revised (2026-11-26).
Amends [DR-104](104-spec-package-format-and-client-environments.md).
Amended by [DR-108](108-the-root-lease-names-the-machine.md), [DR-176](176-global-playbooks-and-a-placed-playbook-runs.md).

## Context

- Spex's configuration files name no `playbooks.<id>.from`: the core refuses one and takes each enabled playbook's module from the environment that installs it ([DR-104](104-spec-package-format-and-client-environments.md)).
- Playbook's shared launch-config loader takes an optional `modules` record from playbook id to module specifier, which wins over a configured `from`, makes `from` optional where a module is supplied, and writes no supplied module into any config [[1]] [[2]].
- An absolute path becomes a file URL and a file URL or package specifier is kept, while the loader refuses a relative path [[2]].
- The CLI has a repeatable `--module <id>=<specifier>` flag, and its record-backed reopen — `playbook --session` and `playbook run --session` — takes the module the session records when the config names no `from` [[2]] [[3]].
- Playbook's shared loader itself, on a reopen with selected members, still needs a supplied module or a `from`; only the CLI's record-backed reopen takes the module the session records [[2]].
- Without supplied modules, the launcher could open or continue a session Spex created only from a launcher config rewritten to name each module.
- Cligent has a run-scoped `skills` option that copies named skill folders into each run, and leaves installation into the folders each runtime reads to the host [[4]] [[5]].
- The launcher accepts `skills` path lists at the top of its config and on the Captain and each player, and sends an empty list on every call of an agent that has none [[6]] [[7]].
- The launcher reads `$SPEX_HOME/config/playbook.config.yaml` [[8]], while Spex reads the global configuration in the global records repository, which syncs between devices ([DR-080](080-the-config-directory-is-named-config.md)).
- A skill path in that file names a folder on one device, which DR-104 retired from shared files as it retired a playbook's `from`.

## Decision

- **Modules at launch, end to end.** Spex's configurations name no `from` anywhere: wherever Spex or its suites hand a configuration to Playbook's launcher, each enabled playbook's module is supplied at launch — the one the session's environment exports, or, in a suite that launches before any environment is installed, the one in the staged built-in spec package the core seeds; on a reopen through the shared loader, the one the session records — and a record-backed reopen through the CLI supplies none.
- **No rewritten launcher config.** No launcher config is written beside a Spex config to name each module.
- **Skills come from environments.** The core refuses a `skills` list at the top of the global configuration, on its Captain and on its players, naming the entry, as it refuses a `from`; a project's file holds only playbooks.
  Spex composes no supplied skills, so Playbook sends none and no session record carries a `skills` key.
- **The parity claim names its exceptions.** The core composes a configuration as the launcher does, except that it refuses a playbook's `from` and a `skills` list, which the launcher accepts, and composes default entries and players for placed playbooks ([DR-176](176-global-playbooks-and-a-placed-playbook-runs.md)).

Considered and declined:

- keeping the rewritten launcher config for the suites alone: it is the shared-file module location DR-104 declined, kept only where nothing checks it;
- having Spex's core accept `from` again for parity with the launcher: a module location in a shared file is what DR-104 retired;
- admitting `skills` paths in the global configuration for the launcher's parity: a path in a synced file names a folder on one device, and the two hosts no longer read one file;
- delivering an environment's skills per run through Cligent's option: a skill would arrive twice where the runtime also reads the exported folder, Kimi Code's run copy sits in the code's checkout, and session records would carry device paths.

## Consequences

- A session Spex created continues in the `playbook` CLI from the same configuration Spex runs, with no file rewritten and no flag; a fresh CLI launch on Spex's configuration names each playbook's module with `--module`.
- The parity item between the core and the launcher [[core-service-16](../packages/core-service.md#core-service-16)] states the rules on which they differ.
- A hand-written `skills` list fails the configuration load with its entry named and the reason given; the Playbook CLI's own file keeps whatever its user writes there.

## References

[1]: https://github.com/sublang-ai/playbook/blob/main/CHANGELOG.md "Playbook changelog: 17.5.0"
[2]: https://github.com/sublang-ai/playbook/blob/main/specs/decisions/083-module-locations-supplied-at-launch.md "Playbook DR-083: Module locations supplied at launch"
[3]: https://github.com/sublang-ai/playbook/blob/main/specs/packages/playbook-cli.md#playbook-cli-94 "Playbook playbook-cli-94: modules supplied at launch"
[4]: https://github.com/sublang-ai/cligent/blob/v0.34.0/CHANGELOG.md "Cligent changelog: 0.34.0"
[5]: https://github.com/sublang-ai/cligent/blob/v0.34.0/specs/decisions/036-cross-agent-skill-installation.md "Cligent DR-036: Cross-agent skill installation"
[6]: https://github.com/sublang-ai/playbook/blob/v17.10.1/CHANGELOG.md "Playbook changelog: 17.10.0 and 17.10.1"
[7]: https://github.com/sublang-ai/playbook/blob/v17.10.1/specs/decisions/092-skills-follow-working-agents.md "Playbook DR-092: Skills follow working agents"
[8]: https://github.com/sublang-ai/playbook/blob/v17.10.1/docs/configuration.md "Playbook configuration: the shared launcher config"
