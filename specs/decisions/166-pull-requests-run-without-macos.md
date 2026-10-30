<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-166: Pull Requests Run Without macOS, and Documentation Alone Keeps the Spec Gates

## Status

Accepted (2026-10-29) on the owner's direction to make the merge gate faster without dropping a test.
Amends [DR-145](145-merge-on-green.md) in the pull request's matrix: the macOS smoke job leaves it, and a pull request changing documentation alone runs the spec gates and not the suites.

## Context

A pull request's run was bounded by its macOS test job: sixty minutes against thirty-one on Linux for the same suites, so every merge waited an hour for a job that repeats on `main` and nightly within the day.
A pull request changing only documentation — a release record, a guide, the specs — paid the same hour.
The core's test runner ran two test files at once on runners with four cores.
The suites use scratch homes and free ports, so files do not collide.

## Decision

- A pull request's `test` jobs run on Linux, Node 22 and 24, and Windows, Node 22; `journeys` and `desktop-browser` run on Linux; a push to `main` and the nightly run keep the full matrix with macOS, so a macOS-only difference is found on `main` within a day, as DR-145 already accepted for the other macOS jobs.
- A classifier job runs first on every pull request and reads the pull request's changed paths: where every one lies under `docs/` or `specs/` or is a Markdown file, the change is documentation alone, the classifier runs the CLI's own tests and the spec lint itself, and the suites are skipped and report skipped; otherwise the suites run as before; a push to `main` and the nightly never count as documentation alone.
- The classifier is a required check beside the suites, so a classifier that fails blocks the merge instead of skipping the suites past it; the required checks are exactly the jobs a pull request's run holds, the macOS job among them no longer.
- The core's test runner runs three test files at once at most.

## Consequences

- `release-34` names the new matrix and the documentation-alone rule; the workflow audit asserts the classifier, its condition on every suite and the required checks.
- The repository's required status checks drop `test (macos-latest, 22)` and add `changes`.
- A documentation-only pull request merges in minutes; any other saves the macOS half hour.
- A macOS-only regression now reaches `main` before it is seen; the nightly and the push run find it, and the owner's own machine runs the suites on macOS before a push.
