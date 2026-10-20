<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-126: Cligent 0.34.1 and slc 0.18.1 Adoption

## Status

Accepted (2026-10-19).
Amends [DR-123](123-playbook-17-10-1-cligent-0-34-0-slc-0-18-0-adoption.md) in its Cligent and slc floors and lock resolutions alone; Playbook `^17.10.1`, the skills decisions and every other constraint stand.
Amended by [DR-130](130-playbook-17-11-0-cligent-0-36-0-slc-0-19-0-adoption.md) in its floors and lock resolutions alone: Playbook `^17.11.0`, Cligent `^0.36.0` and slc `^0.19.0`.

## Context

- Cligent 0.34.1 preserves raw Unicode line and paragraph separators in Codex JSON output on POSIX, where Node 25's line reader would otherwise split a valid JSON item before parsing it [[1]].
- The adapter retains the SDK-owned native executable, arguments and configuration; Windows keeps its existing direct no-policy path and policy rejection, without the POSIX separator protection [[1]].
- slc 0.18.1 verifies deterministic JSON renderings of typed arrays and records in linked prompts without coercing their input shapes, and keeps repeated placeholders bound consistently [[2]].
- Both released packages admit the Playbook 17.10.1 and agent SDK versions already locked by DR-123; their adoption requires no SDK upgrade or host-owned transport workaround [[3]] [[4]].

## Decision

- **Floors.** The core requires `@sublang/cligent` `^0.34.1` and keeps `@sublang/playbook` `^17.10.1`; both shells require `@sublang/slc` `^0.18.1`.
- **The lock.** The public-registry lock resolves one Cligent 0.34.1, one Playbook 17.10.1 and one slc 0.18.1, without links or overrides for these packages; every agent SDK remains at its previously locked version ([DR-094](094-the-compiler-adopts-the-apps-cligent.md)).
- **Ownership stays upstream.** Spex keeps the supplied-runtime, engine ABI and artifact-schema admission, and compiler configuration contracts of [DR-081](081-the-app-supplies-the-compiler.md); it adds no output sanitizer or alternate transport.
- **Existing installations stay explicit.** The built-in spec package remains 17.10.1, and existing environment locks and session-store migration rules remain unchanged from DR-123; homes sharing a store continue to coordinate their writers under the installed Playbook's contract.

## Consequences

- Codex sessions and compiler roles on POSIX retain valid Unicode JSON content instead of failing at the SDK's line parser; genuine malformed output and child failures remain failures.
- The app's compiler gains typed-JSON prompt fidelity checks while sharing the app's one Cligent and Playbook installation.
- This dependency update does not recompile existing artifacts, update an environment lock or claim a session-store format migration.

## References

[1]: https://github.com/sublang-ai/cligent/blob/v0.34.1/CHANGELOG.md "Cligent changelog: 0.34.1"
[2]: https://github.com/sublang-ai/slc/blob/v0.18.1/CHANGELOG.md "slc changelog: 0.18.1"
[3]: https://github.com/sublang-ai/cligent/blob/v0.34.1/package.json "Cligent 0.34.1 peer dependencies"
[4]: https://github.com/sublang-ai/slc/blob/v0.18.1/package.json "slc 0.18.1 dependency ranges"
