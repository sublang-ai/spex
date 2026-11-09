<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-229: The Core's Suite in Four Parts

## Status

Accepted (2026-11-09) to shorten pull requests whose change reaches the core, running every test they ran before.
Extends [DR-185](185-the-suites-a-change-reaches.md) and [DR-199](199-release-gated-full-validation.md): the selected suites and gates are unchanged, a Linux or macOS row reaching the core spreads them over five runners.

## Context

- Across 37 recent pull requests reaching the core, the Linux test job took a median of 26 minutes, 23 of them the core's suite on one runner at three files at once, after the other suites' four minutes.
- A file runs its tests in sequence, so the heaviest file, about nine minutes on Linux and fourteen on macOS, bounds any split by files.
- Full validation's macOS rows ran 66 and 70 minutes, the core's suite at two files at once on their three cores.

## Decision

- A Linux or macOS row whose selection reaches the core runs as five jobs, each building: four run a part of the core's suite, and the fifth runs the script tests, every other selected suite and the type and spec gates.
- A part's files are the core's test files sorted by compiled size, largest first, dealt to the parts in turn.
  Size stands in for duration, so no recorded timing needs keeping current, and each file falls in exactly one part by construction.
- Windows rows, rows not reaching the core and local `npm run test:affected` keep one run; the `checks` gate is unchanged, the matrix job's result covering every part.
- Rejected: Node's own `--test-shard`, which deals files in name order and left the slowest part near twelve minutes on the recorded durations against size's nine; recorded per-file durations, within a minute of size's balance at the cost of a table to maintain.

## Consequences

- A pull request reaching the core takes about ten minutes, bounded by the heaviest file; splitting that file is the next lever.
- Each row reaching the core pays four more runners' setup, about a minute each; full validation's 21 test jobs queue behind the Free plan's five concurrent macOS jobs.
- A file whose duration departs far from its size unbalances its part until it is split or the measure revisited.
