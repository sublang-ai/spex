<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DASH: Dashboard Acceptance Tests

## Intent

This spec defines required integration coverage for the Dashboard
surface of Spex
([DR-002](../decisions/002-desktop-app-architecture.md)), driving
fixture record streams
([DR-003](../decisions/003-runtime-reuse.md)), persisted app-store
state ([DR-004](../decisions/004-config-and-persistence.md)), and
stubbed forge adapters
([DR-006](../decisions/006-projects-and-forge.md)) through the core
and asserting the derived Dashboard state, so that attention
derivation, clearing, usage rollups, and forge lists are verified
end to end rather than per unit.

## Attention Coverage

### DASH-15
Verifies: [DASH-1](../user/dashboard.md#dash-1), [DASH-2](../user/dashboard.md#dash-2), [DASH-10](../dev/dashboard.md#dash-10)

Where a fixture record stream spans two project sessions and
contains a player `permission_request`, a captain `awaitBossReply`
question, a `runtime_error`, a `turn_finished`, and a
`hidden`-visibility record, when Dashboard state is derived, the
test suite shall assert that the attention queue contains exactly
one entry per
non-hidden condition, that each entry identifies its source project
and session, that entries follow the kind precedence of
[DASH-2](../user/dashboard.md#dash-2), and that the hidden record
produced no entry.

### DASH-16
Verifies: [DASH-4](../user/dashboard.md#dash-4), [DASH-9](../user/dashboard.md#dash-9), [DASH-10](../dev/dashboard.md#dash-10)

While the attention queue contains a pending Boss question among
other entries, when the fixture stream continues with a Boss turn
starting in that question's session, the test suite shall assert
that the question entry is removed, that all other entries remain,
and that the published attention count decreases by exactly one.

### DASH-17
Verifies: [DASH-11](../dev/dashboard.md#dash-11)

Where a fixture record stream and review state are persisted to the
app store, when attention derivation is re-run from persisted state
alone, as after a core restart, the test suite shall assert that
the resulting attention set equals the set derived live from the
same stream.

## Usage Coverage

### DASH-18
Verifies: [DASH-7](../user/dashboard.md#dash-7), [DASH-13](../dev/dashboard.md#dash-13)

Where fixture player `done` events carry usage payloads across two
sessions and two calendar days, including one on a
`hidden`-visibility record and one `done` event without usage, when
rollups are computed, the test suite shall assert that per-session
and per-day totals equal hand-computed sums of the fixture
payloads, that the hidden record's usage is included, and that the
usage-less `done` event contributes nothing.

## Forge Coverage

### DASH-19
Verifies: [DASH-6](../user/dashboard.md#dash-6), [DASH-14](../dev/dashboard.md#dash-14)

Where a stubbed forge adapter returns fixture open issues and pull
requests for a bound project, when the Dashboard is displayed,
the test suite shall assert that the next-work lists render the
fixture entries with titles and numbers, that a manual refresh
invokes the stub again, and that a stub failure on refresh leaves
the previously served lists in place with the failure and data age
surfaced.
