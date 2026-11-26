<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-185: The Suites a Change Reaches

## Status

Accepted (2026-11-02).
Amends [DR-145](145-merge-on-green.md).
Amended by [DR-199](199-release-gated-full-validation.md), [DR-229](229-the-cores-suite-in-four-parts.md).

## Context

- The owner directed that no test a change cannot break should run, to make the merge gate faster without dropping a test.
- A pull request's run was bounded by its slowest jobs: a macOS test job took sixty minutes against thirty-one on Linux for the same suites, and the journeys thirty-five minutes for forty journey files on one worker, each booting a shell and a core.
- The test job ran every suite on Linux twice, on Node 22 and on Node 24, twenty-seven minutes each, twenty-three of them the core's.
- A change to the interface alone or to a shell paid the core's suite, which nothing in the change could break, and a change to documentation alone paid the same as any other.
- Locally the same: `npm test` or a whole workspace's suite was the only command, so a developer or an agent waited on the core's twenty-three minutes before pushing an interface change.
- The workspaces declare their internal dependencies in their `package.json`, so what a change can reach is readable: the core depends on the CLI's library; the interface, the shells and the journeys on the core.
- Some Markdown files are test inputs — the CLI's legacy scaffold fixtures, the interface's fixture readmes, the journeys' compiled fixtures — so a rule counting any Markdown file as documentation would let a change to one of them skip the suite that reads it.
- The core's test runner ran two test files at once on runners with four cores; the suites use scratch homes and free ports, so files do not collide.

## Decision

- Amends [DR-145](145-merge-on-green.md) in what a pull request's suites run: the suites its change reaches, on one Linux Node and no macOS row.
- One script, `scripts/affected-tests.mjs`, reads the changed paths and the workspaces' internal dependency graph and names the reach of a change: a path under `docs/` or `specs/`, or a Markdown file outside every workspace, is documentation and reaches nothing; a path in a workspace, its Markdown included, reaches that workspace and, transitively, every workspace depending on it; any other path reaches everything; documentation alone is a change of documentation and nothing else.
- A classifier job names the reach on every pull request beside documentation alone: documentation alone runs the CLI's own tests and the spec lint and no suite; otherwise the test job runs the scripts' tests and the suites of the reached workspaces.
- A pull request's Linux test job runs on Node 22 alone.
- The journeys run in three shards, each a job.
- `npm run test:affected` runs the same selection for the working tree against `main`, so the developer and the agents run before a push only what their change reaches.
- The core's test runner runs three test files at once at most.

## Consequences

- An interface-only pull request's test job falls from twenty-seven minutes to about four, and a documentation-only pull request merges in minutes; a core change stays bounded by its own suite.
- A Node 24-only or macOS-only difference is found by full validation before publication ([DR-199](199-release-gated-full-validation.md)), and the owner's own machine runs the suites on macOS before a push.
- A dependency a workspace uses without declaring it in its `package.json` is unseen by the selection; from here a workspace declares every workspace it imports.
- `release-34` names the reach, the one Node and the shards; `release-43` the local command; `release-33` the audit's assertions; the workflow audit and the script's own tests change in the same commit as the workflow.
