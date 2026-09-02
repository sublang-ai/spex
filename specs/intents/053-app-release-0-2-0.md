<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-053: App Release 0.2.0

## Status

Done

## Intent

Ship the app's second source release with the round's work — sessions that continue, every session deletable, spec editing, intent controls, record rows, and chrome that fits — per [DR-040](../decisions/040-source-only-app-releases.md), with every gate recorded.

## Deliverables

- [x] Both shells at 0.2.0 and the changelog section dated.
- [x] The gates on the release tree: hermetic smoke with the desktop stage, live desktop smoke, the checklist's desktop pass, CI green.
- [x] The tag pushed and the GitHub release created by the workflow.

## Tasks

1. Versions and changelog.
2. Gates, tag, release.

## Verification

Gates on the release tree (2026-09-02): `npm run smoke -- --desktop` passed every stage — build, lint, unit, integration, browser, 23 journeys, core round-trip, packed-CLI user pass, Electron ABI flip, render screenshot on scratch user data and state root, restore; `npm run smoke:desktop` passed — config valid, Academy seeded, session, `/code` dispatched to the coder, live agent output, abort, teardown, restore.
Both gates first failed at launch because the desktop took Electron's single-instance lock before redirecting its user data while a source-run Spex was open — an app-side defect fixed in this intent (app-shell-24), not a provider flake.
The checklist's desktop pass: the served UI's composer, tab strip, and rows reviewed at 700px in the browser and the Electron render screenshot reviewed; continuing a session, dropping from the working line, the editor, and both theme scans covered by the journeys.
CI green for the tagged commit; the fit journey's name-stability check excludes the live Now row after one false failure on a slower runner.
