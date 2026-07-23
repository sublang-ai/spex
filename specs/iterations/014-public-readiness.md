<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-014: Public Readiness Fixes

## Goal

Close the blockers and majors from the adversarial public-readiness
review (four angles over the preceding iteration's code), so a
stranger's first hour holds.

## Deliverables

- [x] Truthful question handling: the runtime's structured
  `pendingBossQuestion` (player + question object) parsed and
  rendered; fixtures use the real shape; a top-level error boundary
  so no render bug can blank the window
- [x] Non-destructive in-place edits: a merging `profile.patch`
  config op used by the popover; profile summaries carry every
  config field; playbook player summaries carry the raw ref and a
  display string so popovers and selects reference reality
- [x] Safe project creation: initialization never runs `git add -A`;
  the initial commit covers only scaffold outputs when scaffolding
- [x] No record loss: live records buffered during history backfill;
  queued messages dequeue after backfill; queue dropped with notice
  when the session ends
- [x] Shell safety: window-open and will-navigate guards route
  external links to the OS browser; CSP for the file:// renderer;
  remote images stripped from transcripts; WS handshake requires a
  token and rejects foreign origins
- [x] Honest signals: attention failure scoped to the latest turn;
  dock and nav badges share the derivation; notification sinks
  honored (bell vs desktop, player_finished implemented)
- [x] First-hour polish: single-vendor seeded default, Spex
  application menu and About, version visible in Settings, initial
  connect without the reconnect banner, session-ending feedback,
  jargon sweep, past-sessions expander, popover anchoring fixes
- [x] Release path: app-v* workflow producing a zip artifact and a
  README install section with Gatekeeper guidance (signing deferred:
  needs the owner's Apple Developer ID)

## Acceptance criteria

- Root build/test green; new regression tests cover the question
  shape, the patch op round-trip, backfill buffering, and attention
  clearing.
- Electron acceptance passes; live check shows the parked-question
  banner naming the player, with no crash.
