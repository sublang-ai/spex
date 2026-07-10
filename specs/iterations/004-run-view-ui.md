<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-004: Run View UI

## Goal

Implement `packages/ui` — the Spex web UI — with the project session
run view per the RUN spec package, rendering exclusively from the
core WebSocket protocol.

## Deliverables

- [ ] `@sublang/spex-ui` workspace package (React + Vite + Tailwind)
  building in root CI
- [ ] Protocol client with reconnect and typed commands
- [ ] Record reducer folding the stream into per-session view state
- [ ] Run view: Captain pane, player transcripts, Boss composer,
  awaitBossReply banner, abort, pane visibility
- [ ] App shell with navigation and session tabs
- [ ] Dev harness: core service bootable with fake adapters for UI
  development
- [ ] Reducer/component tests against record fixtures (RUN-19..23)

## Tasks

1. **Package scaffolding** — Vite + React + TypeScript + Tailwind,
   vitest + testing-library, workspace dependency on
   `@sublang/spex-core` for protocol types
   ([RUN-13](../dev/run-view.md#run-13)).

2. **Protocol client** — WebSocket client with hello/version check,
   promise-based commands, subscription streams, reconnect.

3. **Record reducer** — fold records into captain lines, per-player
   transcript segments (text deltas, tool use, thinking, cost),
   visible panes, composer state
   ([RUN-14..18](../dev/run-view.md)).

4. **Run view components** — Captain pane with glyph stream, player
   panes as read-only transcripts, single Boss composer with queue
   indicator, awaitBossReply banner, abort control
   ([RUN-1..12](../user/run-view.md)).

5. **App shell** — navigation rail, session tabs, connection state,
   light/dark theme.

6. **Dev harness** — `packages/core` dev-server entry with `--fake`
   scripted mode for UI development and screenshots.

7. **Fixture tests** — reducer and component tests per
   [RUN-19..23](../test/run-view.md).

## Acceptance criteria

- `npm run build` and `npm test` green from the repo root including
  the UI workspace.
- Replaying the bundled record fixture renders the expected pane
  structure with no hidden records (RUN-19/20).
- awaitBossReply fixtures activate the banner and the next
  submission is visibly routed as the reply (RUN-21).
- The UI package contains no Node-only imports.
