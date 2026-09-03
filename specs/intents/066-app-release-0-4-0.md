<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-066: App Release 0.4.0

## Status

Done.

## Intent

Ship the app's fourth source release — the defect round the owner named (folding lanes, the History frame, Back to a record's origin, the page that never scrolls, Sources open by default, the pipeline stage row, resizable frames) and the layout hazards a systematic review confirmed — per [DR-040](../decisions/040-source-only-app-releases.md), with every gate recorded, and the remote demo instance brought to the same tag and state.

## Deliverables

- [x] Both shells at 0.4.0 and the changelog section dated.
- [x] The gates on the release tree: hermetic smoke with the desktop stage, live desktop smoke, the served-UI pass over the owner's state root, CI green.
- [x] The tag pushed and the GitHub release created by the workflow.
- [x] The remote instance at the tag with the state root matching the local one file for file.

## Tasks

1. Versions and changelog.
2. Gates, tag, release.
3. Remote checkout and state sync, verified by checksum and over the protocol.

## Verification

Gates on the release tree 2fb22b7 (2026-09-02): `npm run smoke -- --desktop` passed every stage — build, lint, unit, integration, browser, 39 journeys, core round-trip, packed-CLI user pass, Electron ABI flip, render screenshot on scratch user data and state root, restore; `npm run smoke:desktop` passed — launch, connect, config valid, Academy seeded, session, `/code` dispatched to dev.coder, live agent output, abort, teardown, ABI restore.
The served-UI pass over the owner's state root verified every intent of the round on the served build as it merged — folding lanes, the History frame and its grip, Back to a record's origin, the page that never scrolls at 800 and 400 pixels tall, Sources open, the pipeline stage row, the Running band, a done intent removed from History through the confirm (the remove act in the log), the sidebar's selection off the Workspace, Gears as item rows with the pinned state list, and the citation preview's anchors.
CI green for the release commit on every runner, Windows included.
Tag `app-v0.4.0` on 2fb22b7; the App Release workflow published <https://github.com/sublang-ai/spex/releases/tag/app-v0.4.0> with the changelog section as its notes and no artifacts.
The remote instance was checked out at the tag, rebuilt, and restarted with the state root re-synced; every file Spex writes — both demo sessions' streams and sidecars, the July session, all three intent logs, the preferences — matches the local root by sha256 (the remote additionally holds the playbook CLI's own manifests and one CLI stream, by design), and a browser smoke that opened both pages in Chromium read the same version, the same projects and sessions, the same attention entries, identical History rows per group, a page that fits the viewport on both, and no page errors.
