<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-058: Collapsible Player Lanes

## Status

Done.

## Intent

A player pane the reader does not need — a lane no call has reached, or one whose transcript they are done with — can be collapsed to a slim rail and reopened, so idle lanes stop taking a third of the run view each while the pane still stands for the session's life ([DR-032](../decisions/032-session-players.md)); a collapsed lane whose call opens comes back on its own, so the working player never hides.

## Deliverables

- [x] Each player pane's header carries a collapse control; collapsed, the pane is a narrow rail naming the lane, with its running mark and a control to expand it, and the remaining panes share the freed width (run-view-7, run-view-116).
- [x] The collapsed set is remembered per session while the app runs, and a collapsed lane expands itself when its call opens (run-view-116, run-view-117).
- [x] Unit coverage of the toggle and the auto-expand, and one browser journey collapsing an idle lane and watching it return when called (run-view-118).

## Tasks

1. Spec items: run-view-7 amended, run-view-116 (the toggle and the rail), run-view-117 (self-opening on a call), run-view-118 (the journey).
2. Pane rail, toggle with focus hand-off, the per-session collapsed set in the store, auto-expand on call open; unit tests.
3. The browser journey.

## Verification

- `npx tsc --noEmit -p packages/ui` and `npx tsc --noEmit` in `e2e`: clean.
- `spex lint`: no problems found.
- `cd packages/ui && npx vitest run`: 23 files, 381 tests passing — four new in `run-view.test.tsx` under "run-view-116/117": the toggle folds to a rail with focus handed on and back, the rail wears the running mark, a collapsed lane opens itself per session without taking focus, and a self-opening lane carries focus from the rail's control it removes.
- `cd e2e && npx playwright test`: 26 passing, including the new `run-view-118: a collapsed lane unfolds when its call opens` in `session.spec.ts` (rail ≤ 40px wide with the lane's name inside its box, the expand control focused, the coder's pane widened, the coder in view while working, the reviewer's lane unfolded by the nested review) and the fit journey `run-view-105` unchanged and green.
