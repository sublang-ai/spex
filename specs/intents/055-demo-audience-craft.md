<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-055: Demo Audience Craft

## Status

Done

## Intent

Fix what an audience review of the live demo found — Dashboard, History and Sources, an intent started, a session with the Captain's machine cards and two player panes streaming, the delivery card, the Specs tab — so the interface reads from a projector, per [DR-010](../decisions/010-interface-craft.md) and [DR-041](../decisions/041-chrome-that-fits.md).

## Deliverables

- [x] The type scale bottoms out at 12px: every chip, age, caption, badge, and prompt body that wore 10–11px reads at the small step; the Captain thread's narration lines are left-aligned system lines with the glyph as an icon.
- [x] Machine cards legible: names 13px, captions 12px, exits 11px; boxes as wide as their column's longest label with role-only fallback; unwalked rest-state exits fold to "+N" until walked or hovered; the only root stays drawn while it delegates.
- [x] A drawing scales into a column it exceeds by under a quarter and scrolls behind the fade past that; the default split is 45%, held whether or not a drawing is up; the split's row form queries its wrapper, so sessions no longer stack at every width.
- [x] Player panes tell the call: tool bodies print string fields verbatim and wrap; spans in the duration vocabulary; "coder · dev.coder" headers; "Idle until the playbook calls dev.reviewer"; "coder working · 2m 13s" ticking in the pane header and the Captain thread.
- [x] Failures speak plain with the runtime's words in the tooltip; agent text, prompts, bubbles, and code blocks wrap unbroken tokens; a Boss bubble drops a trailing line repeating its source URL.
- [x] The Dashboard never reads empty while loading: History "Loading…" until its first page, newest eight rows under "Older…", records dated by their status line; Sources loading rather than not connected; the Now band names a playbook only once drawn and reads "deciding" or "working", never "idle", mid-turn.
- [x] The never-connected banner waits eight seconds; the served page carries the shell's version so Settings never prints "Spex dev".

## Tasks

1. Type-scale sweep and narration lines.
2. Machine card legibility, folding, scaling, the split default, the row-form fix.
3. Player pane bodies, durations, headers, working cue.
4. Plain failures, wrapping, the bubble's URL line.
5. Dashboard loading, History paging, Now band words.
6. Server version stamp and the banner grace.
7. Code blocks wrap; the journeys re-run.

## Verification

ui 369 green (from 333); server-shell 10 green; the journeys 23 green on the staged bundle, `fit.spec.ts` with a 400-character URL riding the task and `a11y.spec.ts` in both themes included.
Verified in the browser against the fake core at 1280px: the panes sit side by side, the code drawing scrolls behind its fade at the 45% default and scales to a 694px column at 70%, unwalked rest-state exits read "+3"/"+1", the pane headers read "coder · dev.coder", and the working cue ticks.
