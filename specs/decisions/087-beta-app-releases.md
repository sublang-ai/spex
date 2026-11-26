<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-087: Beta App Releases

## Status

Accepted (2026-09-28).
Amends [DR-040](040-source-only-app-releases.md), [DR-056](056-release-naming.md).
Amended by [DR-199](199-release-gated-full-validation.md), [DR-220](220-tags-own-release-versions.md).

## Context

- The owner asked to distinguish beta app releases from regular ones, so a beta can ship without the hours-long regression.
- The regression that a regular app release runs costs hours of real agents ([DR-086](086-tests-in-tiers.md)); a build meant for early trial should not wait on it, yet it must still install, start and reach a real agent.
- Semantic Versioning already names the form: a pre-release version such as `0.9.0-beta.1` precedes `0.9.0` and can carry any identifier, so the channel needs to fix one.
- Keep a Changelog has no form for a pre-release; a version section per beta would repeat every note into the regular release's section, and a note that moves between sections is a note nobody trusts.
- GitHub marks a release as a pre-release by a flag.

## Decision

- A beta app release is tagged `app-vX.Y.Z-beta.N`, `N` counting from 1 within one version; no other pre-release identifier is accepted, and the workflow refuses a tag carrying one.
- The tag alone names the beta's version, which the release workflow prepares in both shells ([DR-220](220-tags-own-release-versions.md)).
- A beta's gates are full app validation of the tagged tree ([DR-199](199-release-gated-full-validation.md)) and the smoke with its live stage ([DR-089](089-every-fresh-user-scenario-walked-for-real.md)); the regression and the manual residue are not required.
- A beta's notes are prepared as any release's ([DR-220](220-tags-own-release-versions.md)), under a line naming the beta and its base version; the changelog gains no section for a beta.
- The GitHub release is created as a pre-release, titled `Spex App vX.Y.Z-beta.N`, carrying the same downloads and run-from-source instructions as a regular release.
- The CLI channel gains no beta form by this record.
- This gives [DR-040](040-source-only-app-releases.md)'s app channel a pre-release form with its own gates and notes, and [DR-056](056-release-naming.md)'s titles a beta's pre-release version.

## Consequences

- A beta ships once full validation passes: the smoke and the live smoke are the whole local cost, and the regular release still runs everything.
- The release package gains the beta tag, its gates and its notes; the app-release workflow learns the pre-release form; the release checklist names what a beta skips.
- A beta's notes live only in its GitHub release, which is what a transient version deserves; the changelog stays a record of releases proper.
