<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-015: Interface Craft Round

## Goal

Apply DR-010's eight principles across the app: close the 51
adversarially-verified findings of the eight-lens design audit
(chat truthfulness, async honesty, keyboard/accessibility, visual
grammar, microcopy).

## Deliverables

- [ ] Conversation-first run view: player questions render as
  incoming bubbles from a named sender (one identity everywhere);
  a working indicator while a turn runs; queued messages as
  pending outline bubbles with honest placeholder copy; time
  separators; a jump-to-latest pill; humanized state labels with
  amber/red tinting and raw ids in tooltips
- [ ] Honest async: per-class command timeouts (compile never
  falsely fails); core rejects concurrent compiles busy-closed and
  supports compile.abort (cancel button); past-transcript loading
  and failure states with working retry; bootstrap refresh
  failures surface with retry; abort shows "Aborting…"; mid-turn
  disconnect disarms Abort
- [ ] Session lifecycle guardrails: inline confirm to end any live
  session (naming queued messages that would drop); dropped-queue
  notices render where the user can see them; attention dots on
  background tabs; tab-strip overflow, tablist semantics, and
  neighbor-focus on close
- [ ] First-run integrity: readiness entries for adapter-shorthand
  refs; re-check readiness at hand (bubble link + window-focus
  self-heal, honest env-var copy); invalid config surfaces in the
  home thread with the errors and a Settings link; centered
  first-canvas; keyboard-driven project menu; fresh repos show
  their real branch
- [ ] Keyboard & accessibility baseline: global shortcuts
  (Cmd/Ctrl+1..5, Cmd/Ctrl+,, Cmd/Ctrl+N, tab cycling, type-to-
  compose); aria-labels + 24px targets on icon buttons; one
  persistent polite live region; slash-menu listbox semantics with
  a non-destructive Escape; focus management in popovers and
  inline confirms; nav aria-current; WCAG-passing badge, icons,
  and dark-mode pairs
- [ ] One visual grammar: SVG icon component replacing color-emoji
  glyphs; status palette codified (indigo strictly interactive);
  button tier/casing sweep; type-scale cleanup (no 10px); single
  link accent; captain bubble separation on the home
- [ ] Microcopy: "Playbooks" nav; Projects add/create labels;
  humanized notification labels; pluralization; explained registry
  path and scaffold checkbox; de-jargoned empty states with real
  links; Dashboard welcome takeover removed
- [ ] Specs: DR-010 recorded; affected user/dev/test spec items
  amended (RUN, SHELL, SET, PBLIB, PROJ, DASH, CORE) with tests
  pinning question bubbles, drafts, compile busy/abort, readiness
  shorthands, tab confirms, and label maps

## Acceptance criteria

- Root build/test green with new regression tests for each
  deliverable cluster.
- Live walkthrough: question-bubble moment, draft survival across
  tab/surface switches, compile cancel, tab attention dot, and
  keyboard-only session start all verified in the running app.
- Electron acceptance passes with zero console errors.
