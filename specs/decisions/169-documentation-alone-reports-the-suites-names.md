<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-169: Documentation Alone Reports the Suites' Names

## Status

Accepted (2026-10-31) on the owner's direction to fix the merge gate without adding verification.
Amends [DR-166](166-pull-requests-run-without-macos.md) in how a pull request changing documentation alone satisfies the required checks: a stand-in reports the suites' names; the classifier, the gates it runs and the suites' skip are unchanged.

## Context

DR-166 let a pull request changing documentation alone skip the suites and expected them to report skipped, which the merge rule takes as green.
GitHub skips a job whose job-level condition is false before its matrix expands, so the skipped suites report as `test`, `journeys` and `desktop-browser`, while `main` requires `test (ubuntu-latest, 22)`, `test (ubuntu-latest, 24)`, `test (windows-latest, 22)`, `journeys (ubuntu-latest)` and `desktop-browser (ubuntu-latest)`.
Those names are never reported for documentation alone, so GitHub blocked the first such pull request, 294, which merged only with administrator rights; its classifier had passed in under a minute.
Three other shapes were weighed: running the suites' jobs with every step guarded, which starts five runners for nothing and asks every future step for the guard; one gate job as the only required check, which changes the protection DR-145 and DR-166 set and keeps the required checks from naming the suites; and required checks named by the bare job ids, which a code change never reports.

## Decision

- A stand-in job, run only where the classifier succeeded and found documentation alone, reports success under each of the suites' required names and runs nothing of them.
- The suites keep their job-level condition and report skipped under their bare job ids.
- The required checks stay those of DR-166: the classifier and the suites' names.

## Consequences

- A pull request changing documentation alone merges in about a minute without administrator rights; the stand-in's rows take seconds each.
- A check named for a suite succeeds, for documentation alone only, without that suite running; the classifier's gates, the CLI's tests and the spec lint, stand for the suites there, as DR-166 accepted.
- `release-34` names the stand-in; the workflow audit asserts that its names are exactly the suites' required names and that it runs for documentation alone and under no other condition, so a change to the pull request matrix changes the stand-in's list in the same commit.
