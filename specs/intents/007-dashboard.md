<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-007: Dashboard

## Status

Done

## Intent

Implement the Dashboard surface per the dashboard spec package: ranked attention queue, running-sessions overview, next-work lists from the forge adapter, and usage/cost rollups.

## Deliverables

- [x] Deterministic attention derivation from protocol data with ranked ordering (questions, failures, idle sessions)
- [x] Running sessions overview with state and elapsed time
- [x] Next-work lists (issues to do, PRs to review) across bound projects
- [x] Usage rollups per session and per day (new usage.days command)
- [x] Attention count published for the shell badge
- [x] Tests per dashboard test items (fixture-derived attention, ordering, clearing, rollups)

## Tasks

1. **Core usage rollup** — store.usageByDay + `usage.days` protocol command ([[dashboard-6](../packages/dashboard.md#dashboard-6)]).
2. **Attention derivation** — pure UI selector over sessions and views, ranked question > failure > idle review ([[dashboard-1..3](../packages/dashboard.md#dashboard-1)], [[dashboard-11](../packages/dashboard.md#dashboard-11)]).
3. **Dashboard surface** — attention queue linking into sessions, running overview, next-work lists, usage cards ([[dashboard-4..9](../packages/dashboard.md#dashboard-4)]).
4. **Tests** — attention fixtures incl. ordering and clearing; day-rollup store test ([[dashboard-15..18](../packages/dashboard.md#dashboard-15)]).

## Verification

- Root build/test green; attention fixtures produce the specified ordering and clear on reply.
- Dashboard renders next-work lists from the stubbed forge adapter.
