<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-012: Captain Chat Home

## Goal

Rebuild the session start as the IM-style Captain conversation of
the revised [DR-007](../decisions/007-conversational-session-start.md)
after the owner's second review.

## Deliverables

- [x] Captain home chat: client-side greeting with hints, no
  instruction copy (RUN-25)
- [x] Project chip menu with Open folder…/path fallback and silent
  git init for non-repo folders (RUN-26/27)
- [x] Dismissible quick start card with persistent dismissal
  (RUN-27)
- [x] Slash menu with prefix filtering and intent hints in both
  composers (RUN-27)
- [x] IM presentation in the Captain thread: boss echo bubbles,
  speech bubbles, system status lines (RUN-30)
- [x] Captain identity beside the composer with a gear to Settings
- [x] Tests per RUN-29/31; live verification against the fake core
  (auto-init observed on disk) and Electron acceptance

## Acceptance criteria

- Root build/test green; RUN-29/31 pass.
- A plain folder chosen from the chip menu becomes a git repo and a
  registered project with no dialogs.
- Typing `/` filters playbooks with intents; selection inserts
  without dispatching.
