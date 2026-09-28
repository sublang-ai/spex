<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-087: Beta App Releases

## Status

Accepted (2026-09-28) on the owner's ask to distinguish beta app releases from regular ones, so a beta can ship without the hours-long regression.
Amends [DR-040](040-source-only-app-releases.md) (the app channel gains a pre-release form with its own gates and notes) and [DR-056](056-release-naming.md) (a beta's release title carries its pre-release version).
Rests on the tiers of [DR-086](086-tests-in-tiers.md).

## Context

- The regression that a regular app release runs costs hours of real agents; a build meant for early trial should not wait on it, yet it must still install, start and reach a real agent.
- Semantic Versioning already names the form: a pre-release version such as `0.9.0-beta.1` precedes `0.9.0` and can carry any identifier, so the channel needs to fix one.
- Keep a Changelog has no form for a pre-release; a version section per beta would repeat every note into the regular release's section, and a note that moves between sections is a note nobody trusts.
- The release workflow builds a release's notes from the changelog section matching the tag's version and refuses empty notes; GitHub marks a release as a pre-release by a flag.

## Decision

- A beta app release is tagged `app-vX.Y.Z-beta.N`, `N` counting from 1 within one version; no other pre-release identifier is accepted, and the workflow refuses a tag carrying one.
- Both shell manifests carry the beta version verbatim (`X.Y.Z-beta.N`), bumped together as for any app release, and the workflow refuses a tag matching neither.
- A beta's gates are CI green for the tagged commit, the smoke, and the live smoke; the regression and the manual residue are not required, and the release says so.
- A beta's notes are the changelog's `[Unreleased]` section as it stands at the tag, under a line naming the beta and the release it leads to; the changelog gains no section for a beta, and the regular release that follows moves `[Unreleased]` into its version section as before, so the betas' notes fold into it by construction.
- The GitHub release is created as a pre-release, titled `Spex App vX.Y.Z-beta.N`, carrying the same run-from-source instructions as a regular release plus a line stating which gates a beta skipped.
- The CLI channel gains no beta form by this record.

## Consequences

- A beta ships within the hour after CI: the smoke and the live smoke are the whole local cost, and the regular release still runs everything.
- The release package gains the beta tag, its gates and its notes; the app-release workflow learns the pre-release form; the release checklist names what a beta skips.
- A beta's notes live only in its GitHub release, which is what a transient version deserves; the changelog stays a record of releases proper.
