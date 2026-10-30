<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-153: Playbook 18.0.1, Cligent 0.36.1 and slc 0.19.1 Adoption

## Status

Accepted (2026-10-25) on the owner's direction to consume the verified public patch releases.
Amends [DR-130](130-playbook-17-11-0-cligent-0-36-0-slc-0-19-0-adoption.md) in the Cligent and slc floors and lock resolutions alone; its native-skill decisions stand.
Amends [DR-144](144-bounded-session-storage.md) in the Playbook floor, compiler dependency and built-in release alone; its bounded-storage and shared dependency constraints stand.
Amended by [DR-154](154-the-seed-follows-playbooks-rule.md) in the Playbook floor and built-in release alone.
Amended by [DR-167](167-the-compiler-shares-the-apps-engine.md) in the slc floor and compiler dependency: slc's required Playbook peer shares the app's engine, and an automated gate forbids the former nested copy.

## Context

- Cligent 0.36.1 bounds the retry for Chromium's empty browser capture and pins its Zod dependency to 4.6.6 [[1]].
- Playbook 18.0.1 requires that Cligent patch and corrects CODE's treatment of standalone documentation or status work without an unfinished IR task [[2]].
- slc 0.19.1 adopts the same Cligent minimum while retaining its Playbook 17 compiler dependency [[3]].
- Updating an app dependency does not change an existing environment's selected built-in release [[environments-11](../packages/environments.md#environments-11)].

## Decision

- **Floors.** The core requires Playbook `^18.0.1` and Cligent `^0.36.1`; root acceptance tooling requires Playbook `^18.0.1`, and both shells require slc `^0.19.1`.
- **Lock.** Resolve the verified public artifacts through npm, preserving xstate 5.33.3 and every existing agent SDK resolution, with one shared Cligent and xstate and no overrides or links for these dependencies.
- **Compiler dependency.** slc's natural nested Playbook 17 remains compiler-only; the core's session writers use Playbook 18.
- **Built-ins.** Stage `sublang/playbooks` 18.0.1 from the installed Playbook release and seed it beside older selections; the ordinary environment Update resolves an admitted newer release [[environments-11](../packages/environments.md#environments-11)].

## Consequences

Fresh installations use the corrected runtime, and newly resolved built-in environments use the corrected CODE artifact.
An existing project uses the correction only after the environment supplying its effective CODE module is updated and the selected source and module are verified; an older project selection can still shadow your own group's selection.
Saved CODE deliveries retain their original outcome schema and must finish with their original Playbook version or be replaced by a new run; retained evidence is not rewritten.
This adoption does not recompile user artifacts or implement the proposed environment-location change.
The matching beta shell metadata prepares a source-app candidate, not a delivered desktop update; exact-main CI and the installed smoke with its live stage remain separate release gates [[release-15](../packages/release.md#release-15)] [[release-20](../packages/release.md#release-20)] [[release-26](../packages/release.md#release-26)].

## References

[1]: https://github.com/sublang-ai/cligent/blob/v0.36.1/CHANGELOG.md "Cligent 0.36.1 changelog"
[2]: https://github.com/sublang-ai/playbook/blob/v18.0.1/CHANGELOG.md "Playbook 18.0.1 changelog"
[3]: https://github.com/sublang-ai/slc/blob/v0.19.1/CHANGELOG.md "slc 0.19.1 changelog"
