<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-199: Full Validation Gates Publication

## Status

Accepted (2026-11-02) on the owner's direction to accelerate CI and local checks, remove nightly runs, and keep broad validation at release.
Amends [DR-040](040-source-only-app-releases.md) in the publication gate, [DR-086](086-tests-in-tiers.md) and [DR-087](087-beta-app-releases.md) in the timing of hermetic checks and release evidence, [DR-145](145-merge-on-green.md), [DR-166](166-pull-requests-run-without-macos.md) and [DR-185](185-the-suites-a-change-reaches.md) in validation selection and the merge gate, and [DR-149](149-the-privileged-lane-runs-on-ci.md) in the privileged lane's triggers.
Supersedes [DR-169](169-documentation-alone-reports-the-suites-names.md): one result gate replaces stand-ins for skipped suite names.

Amended by [DR-218](218-tags-own-release-versions.md) for TAG-owned versions, deterministic pre-validation metadata preparation and optional curated notes; release channel scopes and full validation gates remain.

## Context

- Every code change still runs all browser journeys and native browser acceptance despite affected-workspace selection, and a merge repeats the full matrix on `main` before a nightly repeats it again.
- The selected workspace suites already provide direct behavior coverage; exhaustive per-behavior journey ownership would add a fragile second dependency model.
- Release workflows currently poll for a successful CI run before publishing, so removing automatic `main` CI requires an explicit replacement at the exact release commit.

## Decision

- Pull requests run fast build, type, catalog and spec gates plus the conservatively selected workspace suites on Linux Node 22; Windows Node 22 runs only when the selection reaches the CLI, UI or core, retaining those Windows suites.
  Documentation alone keeps its CLI tests and spec lint.
  Journeys, native browser acceptance and the privileged hub lane are full-validation work.
- Full validation runs only by explicit request or as a reusable dependency of a release workflow, on that invocation's exact tree.
  App validation runs the full existing platform and Node matrix, all journeys, native browser acceptance and the privileged hub lane.
  CLI validation runs CLI tests across the supported platform matrix and script tests on Linux and macOS, preserving the existing Windows exception, with no app journeys, native browser acceptance or hub lane.
- Neither CI nor the hub lane runs on a schedule or automatically after a push to `main`.
- Both release channels call full validation directly and cannot publish unless it succeeds.
  A prior reduced pull-request run is no substitute; preparation no longer requires a pre-existing CI run for the commit being tagged.
  Downstream release jobs do not repeat the completed test suites.
- One required `checks` job evaluates every selected job's result, succeeding only after successful classification and validation, with unselected jobs skipped.
  Failed, cancelled or unexpectedly skipped selected work blocks it; documentation uses the same gate, without stand-in jobs.
- The existing workspace dependency closure remains the selection rule, with an exact audited list of root tooling owned by the scripts' tests or named runtime workspaces.
  Unknown paths and dependency configuration select all workspaces.
  Local selection uses the same plan, includes untracked files and keeps the documentation gates.

## Consequences

- Pull requests and local runs avoid unrelated whole-application acceptance work; no per-pull-request waiver is needed.
- Cross-feature and deferred platform regressions may reach `main`; full validation catches them before publication, rather than promising a nightly detection deadline.
- Workspace selection is a conservative testing scope, not proof that omitted journeys cannot reveal a regression.
- Smoke, live smoke, manual and live-regression release requirements keep their existing scopes.
