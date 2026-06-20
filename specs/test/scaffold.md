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

Hash comparisons shall use the canonical content hash from
[SCAF-21](../dev/scaffold.md#scaf-21). A text file with CRLF
line endings and otherwise bundled-current content shall remain
in the bundled-current cell and preserve its existing bytes.

| File class | Working-tree state vs manifest | Indicator | Post-run file-system state |
| --- | --- | --- | --- |
| framework | hash equals bundled current | `(unchanged)` | bytes unchanged |
| framework | hash differs from bundled current | `(updated)` | bytes equal bundled current |
| framework | file absent (including missing parent directories) | `(updated)` | bytes equal bundled current |
| seed | hash is in history and equals bundled current | `(unchanged)` | bytes unchanged |
| seed | hash is in history but not current | `(updated)` | bytes equal bundled current |
| seed | hash is not in history | `(kept — user-modified)` | bytes unchanged |
| seed | file absent (including missing parent directories) | `(created)` | bytes equal bundled current |

### SCAF-25
Verifies: [SCAF-23](../dev/scaffold.md#scaf-23)

Where `--update` is exercised over any cell of the
[SCAF-24](#scaf-24) matrix, the test suite shall additionally
assert that `(updated)` does not appear in the output for any
path whose post-run content equals its pre-run content, so that
a regression to the prior over-eager indicator cannot pass.

### SCAF-27
Verifies: [SCAF-26](../dev/scaffold.md#scaf-26)

Where `--update` is exercised on a repository using the legacy
`specs/items/user/`, `specs/items/dev/`, or `specs/items/test/`
layout, the test suite shall assert that legacy item files are
moved to the corresponding flat `specs/user/`, `specs/dev/`, or
`specs/test/` path, preserving custom content and removing empty
legacy directories.
It shall also cover a conflicting flat target and assert that the
legacy file remains, the flat target remains unchanged, and the
conflict is reported.
It shall assert that conflict and non-seed migration indicator lines
precede framework and seed indicator lines.
When a migrated file is also a seed path, the test suite shall cover
current, prior, and customized seed content and assert that migration
and seed refresh status are reported in one indicator line.

## Localization Coverage

### SCAF-33
Verifies: [SCAF-14](../dev/scaffold.md#scaf-14), [SCAF-18](../dev/scaffold.md#scaf-18), [SCAF-23](../dev/scaffold.md#scaf-23), [SCAF-28](../user/scaffold.md#scaf-28), [SCAF-29](../user/scaffold.md#scaf-29), [SCAF-30](../user/scaffold.md#scaf-30), [SCAF-31](../dev/scaffold.md#scaf-31)

Where the `scaffold` subcommand is exercised with language selection,
the test suite shall cover a Chinese fresh scaffold, an unsupported
language code, a mismatched language on an existing scaffold, and
`--update` with `--lang`.

The Chinese fresh scaffold case shall assert that localized overlay
files are written for paths that have overlays and that fallback files
remain byte-identical to their English bundled templates.

The localized update case shall assert that `--update` on a Chinese
specs tree refreshes a pristine framework or seed file from the active
Chinese overlay rather than the English base template.

### SCAF-34
Verifies: [SCAF-32](../dev/scaffold.md#scaf-32)

For each localized `meta.md` overlay, the test suite shall enforce
completeness, kept-English parity, and translated-item source hashes.
