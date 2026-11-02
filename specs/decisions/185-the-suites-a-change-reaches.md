<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-185: The Suites a Change Reaches

## Status

Accepted (2026-11-02) on the owner's direction to run no test a change cannot break and to make the merge gate faster.
Amends [DR-145](145-merge-on-green.md) and [DR-166](166-pull-requests-run-without-macos.md) in the pull request's matrix and in what the suites run: the Linux test job on Node 22 alone, the journeys in three shards, and the test job running the suites the change reaches, the classifier naming that reach beside documentation alone; and DR-166 in documentation alone, which a Markdown file inside a workspace no longer is.
Amends [DR-169](169-documentation-alone-reports-the-suites-names.md) in the stand-in's names, which follow this matrix.

Amended by [DR-199](199-release-gated-full-validation.md) in root tooling ownership, local untracked and documentation selection, validation timing and the merge gate: selected checks on pull requests, full channel checks at publication or on request, one required `checks` result, and no main or nightly run.

## Context

A pull request's run was bounded by its journeys job: thirty-five minutes for forty journey files on one worker, each booting a shell and a core.
The test job ran every suite on Linux twice, on Node 22 and on Node 24, twenty-seven minutes each, twenty-three of them the core's.
A change to the interface alone, to a shell or to the hub paid the core's suite, which nothing in the change could break; the classifier of DR-166 knew only documentation alone.
Locally the same: `npm test` or a whole workspace's suite was the only command, so a developer or an agent waited on the core's twenty-three minutes before pushing an interface change.
The workspaces declare their internal dependencies in their `package.json`, so what a change can reach is readable: the core depends on the CLI's library; the interface, the shells and the journeys on the core; the hub on nothing.
Some Markdown files are test inputs — the CLI's legacy scaffold fixtures, the interface's fixture readmes, the journeys' compiled fixtures — so DR-166's rule that any Markdown file is documentation would let a change to one of them skip the suite that reads it.

## Decision

- One script, `scripts/affected-tests.mjs`, reads the changed paths and the workspaces' internal dependency graph and names the reach of a change: a path under `docs/` or `specs/`, or a Markdown file outside every workspace, is documentation and reaches nothing; a path in a workspace, its Markdown included, reaches that workspace and, transitively, every workspace depending on it; any other path reaches everything; documentation alone is a change of documentation and nothing else.
- The classifier job names the reach on every pull request beside documentation alone; the test job runs the scripts' tests and the suites of the reached workspaces, and everything for a push to `main` and the nightly; the journeys and desktop-browser jobs run for any change past documentation alone, as before, since the journeys cross every workspace.
- A pull request's Linux test job runs on Node 22 alone; `main` and the nightly keep Node 24.
- The journeys run in three shards, each a job, on a pull request and on `main`.
- `npm run test:affected` runs the same selection for the working tree against `main`, so the developer and the agents run before a push only what their change reaches.
- The required checks follow the matrix: `changes`, `test (ubuntu-latest, 22)`, `test (windows-latest, 22)`, `journeys (ubuntu-latest, 1)`, `journeys (ubuntu-latest, 2)`, `journeys (ubuntu-latest, 3)` and `desktop-browser (ubuntu-latest)`; the stand-in reports these names.
- Not taken: sharding the core's suite, whose twenty-three minutes now bound a core change's run; a later decision when it hurts.

## Consequences

- An interface-only pull request's test job falls from twenty-seven minutes to about four, the journeys from thirty-five to about fifteen; a core change stays bounded by its own suite.
- The repository's required status checks drop `test (ubuntu-latest, 24)` and `journeys (ubuntu-latest)` and add the three shards; an open pull request reports the new names once its head moves after this lands.
- A Node 24-only difference is found on `main` and nightly, as DR-166 accepted for macOS.
- A dependency a workspace uses without declaring it in its `package.json` is unseen by the selection; the journeys, which import the server shell undeclared, run regardless; from here a workspace declares every workspace it imports.
- `release-34` names the reach, the one Node and the shards; `release-43` the local command; `release-33` the audit's assertions; the workflow audit and the script's own tests change in the same commit as the workflow.
