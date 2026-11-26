<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-253: A Test File That Outlives Its Tests Fails by Name

## Status

Accepted (2026-11-26) on the owner's request.

## Context

- The owner asked that the CLI's and the core's test runners stop dropping results, after measurements on Node 22.23.5 and 24.22.3.
- Both runners passed `--test-force-exit` beside a per-test timeout, so that a test file holding a server, a timer or a child process open could not keep a run alive.
- With the flag a file's process exits while results are still queued for the parent, which then never reports them:
  - the CLI's suite reported between 163 and 221 of its 222 tests on Linux, and the core's unit files between 313 and 330 of their 330;
  - a failing test at the end of 300 passing ones lost its name and assertion in 8 of 10 runs on Node 22 and 1 of 10 on Node 24, its file reported only as failed.
- The exit status survived every such run, so a failure was never read as a pass; what a run executed and what failed could not be read from its output.
- With the flag a file that holds something open passes unnoticed.
- Without the flag the two supported Node versions differ: Node 22 applies the per-test timeout to a file as a whole and ends such a file there, by name; Node 24 applies it to each test only and waits for the file for good.
- No test file of either suite outlived its tests when measured without the flag: the CLI's on Linux, macOS and Windows, the core's on Linux.

## Decision

- Neither runner passes `--test-force-exit`.
- Each runner preloads one exit guard into every test file's process.
  Where a file's process still runs 60 seconds after its tests finished, the guard writes the file's name and the kinds of resource holding it open and exits with failure, so the file fails by name on Node 22 and 24 alike.
  A file that holds nothing exits by itself and never meets the guard.
- The wait starts when the file's tests finish, so its own closing hooks have those 60 seconds.
- The per-test timeout stands as it is: a test that does not finish fails by its name.
- The guard is kept with the CLI's runner and the core's runner preloads the same file.
- The Windows core suites that CI runs without the core's runner are unchanged.

## Consequences

- A run reports every result its files produced, so its count is the same from run to run and a failing test keeps its name and assertion.
- A file that holds something open, which passed unnoticed, now fails 60 seconds after its tests; the fix belongs in that test.
- The guard names kinds of resource, as the runtime lists them, not where they were opened.
- A closing hook that takes more than 60 seconds is ended as a file that outlived its tests.
