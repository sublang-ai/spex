<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-048: Source-Only App Release

## Status

Done

## Intent

Ship the first app release — desktop and server shells as source on GitHub Releases, no binaries — per [DR-040](../decisions/040-source-only-app-releases.md), with every gate recorded.

## Deliverables

- [x] The app release workflow: CI-green gate, tag against both shells' versions, build and test, notes from the root changelog plus the run-from-source block, no artifacts.
- [x] The root changelog with the first version; README and the release checklist say what a release is.
- [x] The gates run on the release tree: hermetic smoke with the desktop stage, live desktop smoke, the checklist's desktop pass.
- [x] The tag pushed and the GitHub release created by the workflow.

## Tasks

1. Specs and workflow.
2. Changelog and docs.
3. Gates, tag, release.

## Verification

Gates on the release tree (2026-09-02): `npm run smoke -- --desktop` passed every stage — build, lint, unit, integration, browser and 17 journeys, core round-trip, packed-CLI user pass, Electron ABI flip, render screenshot, restore; `npm run smoke:desktop` passed after its driver was corrected to the session-player lane names — config valid, Academy seeded, session, `/code` dispatched to the coder, live agent output, abort, teardown, ABI restore; the checklist's desktop pass walked the served UI's greeting, palette, Specs, Playbooks, Dashboard, and Settings in the browser and the Electron render screenshot, with the dark theme covered by the accessibility journey's scan; CI green for the tagged commit.
The GitHub release for `app-v0.1.0` carries the changelog notes and the run-from-source block and attaches no build artifact.
