<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-043: Browser Acceptance Journeys

## Status

Done

## Intent

Give Spex an automated acceptance suite that behaves like a user: the served interface in a real browser against a real core, walking the typical journeys hermetically on every push and with real agents on demand, per [DR-039](../decisions/039-browser-acceptance-journeys.md).

## Deliverables

- [x] The `e2e` workspace: Playwright on Chromium, a harness booting the real server shell on a scratch root with the core's agent seams substituted, and axe-core scans.
- [x] The server shell's programmatic core overrides, and the demo narration shared between the fake dev core and the harness.
- [x] Journeys as package test items — first run, project palette, Specs tab, first session, player question, ledger loop, Settings, Playbooks, remote token URL, unreachable core, keyboard, accessibility in both themes, config repair, and the live lane.
- [x] The CI job and the smoke stage; the release gate names the journeys.

## Tasks

1. Specs: the decision record, the server-shell seam, the journey items, the release gate.
2. Core and server: the shared demo narration; the shell's core overrides.
3. The harness and the journeys, fixing the defects they surface.
4. CI, smoke, and the pointers.

## Verification

`npm run e2e`: 15 hermetic journeys green on Chromium (first run, palette, Specs, session, question, ledger, Settings, Playbooks, token URL, wrong token, reconnect, keyboard, accessibility light and dark, config repair); the live journey runs under `SPEX_E2E_LIVE=1` with signed-in agents.
