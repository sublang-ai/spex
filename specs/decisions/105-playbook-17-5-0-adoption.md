<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-105: Playbook 17.5.0 Adoption

## Status

Accepted (2026-10-06).
Amends [DR-102](102-playbook-17-4-1-adoption.md) in its Playbook floor alone, now `^17.5.0`; Cligent `^0.33.3`, slc `^0.15.1` and everything else DR-102 decided stand.
Completes [DR-104](104-spec-package-format-and-client-environments.md) in its ask that the launcher take each playbook's module location from Spex at launch instead of from the launcher config; nothing DR-104 decided changes.
Follows [DR-081](081-the-app-supplies-the-compiler.md)'s explicit-bump rule for the compiler and [DR-024](024-app-supplied-agent-runtimes.md)'s app-supplied agent runtimes; nothing either decided changes.

## Context

- Spex's configuration files name no `playbooks.<id>.from`: the core refuses one and takes each enabled playbook's module from the environment that installs it ([DR-104](104-spec-package-format-and-client-environments.md)).
- Before 17.5.0, Playbook's shared launch-config loader refused a playbook without `from` before import, so the `playbook` CLI could open or continue a session Spex created only from a launcher config rewritten to name each module, and Spex's own suites wrote one beside every Spex config they handed the launcher.
- Playbook 17.5.0's shared loader takes an optional `modules` record from playbook id to module specifier, which wins over a configured `from`, makes `from` optional where a module is supplied, and writes no supplied module into any config [[1]] [[2]].
- An absolute path becomes a file URL and a file URL or package specifier is kept, while the loader refuses a relative path [[2]].
- The CLI gains a repeatable `--module <id>=<specifier>` flag, and its record-backed reopen — `playbook --session` and `playbook run --session` — takes the module the session records when the config names no `from` [[2]] [[3]].
- Playbook's shared loader itself, on a reopen with selected members, still needs a supplied module or a `from`; only the CLI's record-backed reopen takes the module the session records [[2]].
- Playbook 17.5.0 keeps Cligent `^0.33.2`, which the core's `^0.33.3` meets [[1]], and slc 0.15.1's Playbook `^17.4.0` admits it [[4]].

## Decision

- **Floor.** The core requires `@sublang/playbook` `^17.5.0`; `@sublang/cligent` stays `^0.33.3`, and both shells keep `@sublang/slc` `^0.15.1`.
- **The lock.** The lockfile is regenerated from the public registry, with no links or overrides, and holds one Playbook, 17.5.0, at the tree's root, the compiler's Playbook range resolving to that copy; no other locked version changes.
- **Modules at launch, end to end.** Spex's configurations name no `from` anywhere: wherever Spex or its suites hand a configuration to Playbook's launcher, each enabled playbook's module is supplied at launch — the one the session's environment exports, or, in a suite that launches before any environment is installed, the one in the staged built-in spec package the core seeds; on a reopen through the shared loader, the one the session records — and a record-backed reopen through the CLI supplies none.
- **The workaround retires.** The launcher config rewritten beside a Spex config to name each module is deleted.
- **The parity claim names its one exception.** The core still refuses `from` while the launcher accepts one; the launcher takes each playbook's module supplied at launch ahead of it.
- **The built-in spec package follows.** Its staged version follows the installed Playbook's, so the build stages `sublang/playbooks` 17.5.0.

Considered and declined:

- keeping the rewritten launcher config for the suites alone: it is the shared-file module location DR-104 declined, kept only where nothing checks it.
- having Spex's core accept `from` again for parity with the launcher: a module location in a shared file is what DR-104 retired.

## Consequences

- A session Spex created continues in the `playbook` CLI from the same configuration Spex runs, with no file rewritten and no flag; a fresh CLI launch on Spex's configuration names each playbook's module with `--module`.
- The parity item between the core and the launcher [[core-service-16](../packages/core-service.md#core-service-16)] states the one rule on which they differ.
- A new environment pins the built-in spec package at 17.5.0; an existing lock keeps the version it pins until its environment updates.

## References

[1]: https://github.com/sublang-ai/playbook/blob/main/CHANGELOG.md "Playbook changelog: 17.5.0"
[2]: https://github.com/sublang-ai/playbook/blob/main/specs/decisions/083-module-locations-supplied-at-launch.md "Playbook DR-083: Module locations supplied at launch"
[3]: https://github.com/sublang-ai/playbook/blob/main/specs/packages/playbook-cli.md#playbook-cli-94 "Playbook playbook-cli-94: modules supplied at launch"
[4]: https://github.com/sublang-ai/slc/blob/main/package.json "slc package manifest: its Playbook range"
