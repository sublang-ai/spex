<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-058: Collapsible Player Lanes

## Status

In progress.

## Intent

A player pane the reader does not need — a lane no call has reached, or one whose transcript they are done with — can be collapsed to a slim rail and reopened, so idle lanes stop taking a third of the run view each while the pane still stands for the session's life ([DR-032](../decisions/032-session-players.md)); a collapsed lane whose call opens comes back on its own, so the working player never hides.

## Deliverables

- [ ] Each player pane's header carries a collapse control; collapsed, the pane is a narrow rail naming the lane, with its running mark and a control to expand it, and the remaining panes share the freed width (run-view-7).
- [ ] The collapsed set is remembered per session while the app runs, and a collapsed lane expands itself when its call opens (run-view-7).
- [ ] Unit coverage of the toggle and the auto-expand, and one browser journey collapsing an idle lane and watching it return when called.

## Tasks

1. Pane rail, toggle, and the per-session collapsed set in the store.
2. Auto-expand on call open; tests and the journey; spec items amended.

## Verification

Recorded on completion.
