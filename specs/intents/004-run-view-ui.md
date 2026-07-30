<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-004: Run View UI

## Status

Done

## Intent

Implement `packages/ui` — the Spex web UI — with the project session run view per the run-view spec package, rendering exclusively from the core WebSocket protocol.

## Deliverables

- [x] `@sublang/spex-ui` workspace package (React + Vite + Tailwind) building in root CI
- [x] Protocol client with reconnect and typed commands
- [x] Record reducer folding the stream into per-session view state
- [x] Run view: Captain pane, player transcripts, Boss composer, awaitBossReply banner, abort, pane visibility
- [x] App shell with navigation and session tabs
- [x] Dev harness: core service bootable with fake adapters for UI development
- [x] Reducer/component tests against record fixtures (run-view-19..23)

## Tasks

1. **Package scaffolding** — Vite + React + TypeScript + Tailwind, vitest + testing-library, workspace dependency on `@sublang/spex-core` for protocol types [[run-view-13](../packages/run-view.md#run-view-13)].

2. **Protocol client** — WebSocket client with hello/version check, promise-based commands, subscription streams, reconnect.

3. **Record reducer** — fold records into captain lines, per-player transcript segments (text deltas, tool use, thinking, cost), visible panes, composer state [[run-view-14](../packages/run-view.md#run-view-14)]..[[run-view-18](../packages/run-view.md#run-view-18)].

4. **Run view components** — Captain pane with glyph stream, player panes as read-only transcripts, single Boss composer with queue indicator, awaitBossReply banner, abort control [[run-view-1](../packages/run-view.md#run-view-1)]..[[run-view-12](../packages/run-view.md#run-view-12)].

5. **App shell** — navigation rail, session tabs, connection state, light/dark theme.

6. **Dev harness** — `packages/core` dev-server entry with `--fake` scripted mode for UI development and screenshots.

7. **Fixture tests** — reducer and component tests per [[run-view-20](../packages/run-view.md#run-view-20)]..[[run-view-24](../packages/run-view.md#run-view-24)].

## Verification

- `npm run build` and `npm test` green from the repo root including the UI workspace.
- Replaying the bundled record fixture renders the expected pane structure with no hidden records (run-view-19/20).
- awaitBossReply fixtures activate the banner and the next submission is visibly routed as the reply (run-view-21).
- The UI package contains no Node-only imports.
