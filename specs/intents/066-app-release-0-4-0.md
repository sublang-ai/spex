<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-066: App Release 0.4.0

## Status

In progress.

## Intent

Ship the app's fourth source release — the defect round the owner named (folding lanes, the History frame, Back to a record's origin, the page that never scrolls, Sources open by default, the pipeline stage row, resizable frames) and the layout hazards a systematic review confirmed — per [DR-040](../decisions/040-source-only-app-releases.md), with every gate recorded, and the remote demo instance brought to the same tag and state.

## Deliverables

- [x] Both shells at 0.4.0 and the changelog section dated.
- [ ] The gates on the release tree: hermetic smoke with the desktop stage, live desktop smoke, the served-UI pass over the owner's state root, CI green.
- [ ] The tag pushed and the GitHub release created by the workflow.
- [ ] The remote instance at the tag with the state root matching the local one file for file.

## Tasks

1. Versions and changelog.
2. Gates, tag, release.
3. Remote checkout and state sync, verified by checksum and over the protocol.

## Verification

Recorded on release.
