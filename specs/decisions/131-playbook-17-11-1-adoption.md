<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-131: Playbook 17.11.1 Adoption

## Status

Accepted (2026-10-21) on the owner's direction, after independent review, to consume the classified-entry lifecycle correction after its verified public release.
Amends [DR-130](130-playbook-17-11-0-cligent-0-36-0-slc-0-19-0-adoption.md) only in the Playbook floor, lock resolution and built-in spec package version; its Cligent, slc, SDK and native-skill decisions stand.
Amended by [DR-132](132-bounded-session-storage.md) in the Playbook floor and built-in release, with a natural nested Playbook 17 permitted only for the unchanged compiler's APIs; its remaining dependency and SDK constraints stand.

## Context

- Playbook's patch preserves classified initial-event routing and exact Boss text when a finished workflow starts again, clearing earlier run exchanges only for a valid new entry [[1]].
- Before this adoption, Spex's lock selected Playbook 17.11.0, so publishing the correction alone did not deliver it to a fresh app installation.
- The app stages its built-in spec package from the installed Playbook; existing environment locks keep their selected release [[environments-11](../packages/environments.md#environments-11)].

## Decision

- **Floor.** The core requires `@sublang/playbook` `^17.11.1`.
- **Lock.** Resolve one public-registry Playbook 17.11.1 at the tree's root after its published artifact is verified, preserving Cligent 0.36.0, slc 0.19.0, xstate 5.33.3 and every existing agent SDK resolution, without links or overrides for these packages.
- **Built-ins.** Stage `sublang/playbooks` 17.11.1 from that installed release; seed it beside previously selected versions without changing an existing environment lock [[environments-11](../packages/environments.md#environments-11)].

## Consequences

- Fresh source installations and newly resolved built-in environments consume the corrected runtime and artifacts together.
- This adoption does not recompile user artifacts, migrate saved sessions or update an existing environment's selection.
- App release preparation retains the exact-commit CI and installed smoke gates, including the live smoke, required for a beta [[release-15](../packages/release.md#release-15)] [[release-20](../packages/release.md#release-20)] [[release-26](../packages/release.md#release-26)].

## References

[1]: https://github.com/sublang-ai/playbook/blob/970cec04d2567cd53c95e1ed33c113b26e3b7508/CHANGELOG.md "Playbook classified-entry lifecycle correction, prepared 17.11.1 changelog"
