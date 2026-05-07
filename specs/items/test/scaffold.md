<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# SCAF: Scaffold Acceptance Tests

## Intent

This spec defines required integration coverage for the
`scaffold` subcommand, particularly for paths whose user-visible
behavior depends on combinations of working-tree state, manifest
history, and bundled content.

## Update Coverage

### SCAF-24
Verifies: [SCAF-11](../user/scaffold.md#scaf-11), [SCAF-14](../dev/scaffold.md#scaf-14), [SCAF-23](../dev/scaffold.md#scaf-23)

Where `--update` is exercised, the test suite shall cover each
row of the state matrix below and shall assert both (a) the
printed indicator for that path and (b) the post-run file-system
state, so that an over-eager indicator cannot pass while bytes
remain unchanged or vice versa.

| File class | Working-tree state vs manifest | Indicator | Post-run file-system state |
| --- | --- | --- | --- |
| framework | hash equals bundled current | `(unchanged)` | bytes unchanged |
| framework | hash differs from bundled current | `(updated)` | bytes equal bundled current |
| seed | hash equals bundled current | `(unchanged)` | bytes unchanged |
| seed | hash is in history but not current | `(updated)` | bytes equal bundled current |
| seed | hash is not in history | `(kept — user-modified)` | bytes unchanged |
| seed | file absent | `(kept — missing)` | file still absent |

### SCAF-25
Verifies: [SCAF-23](../dev/scaffold.md#scaf-23)

Where `--update` is exercised over any cell of the
[SCAF-24](#scaf-24) matrix, the test suite shall additionally
assert that `(updated)` does not appear in the output for any
path whose post-run content equals its pre-run content, so that
a regression to the prior over-eager indicator cannot pass.
