<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-061: The Page Never Scrolls

## Status

In progress.

## Intent

The app shell fills the window at every size and every surface scrolls inside its own box, vertically as well as sideways, so the page as a whole never scrolls and a short or resized window never cuts the shell off ([DR-041](../decisions/041-chrome-that-fits.md)); the fit journey measures it at two heights on every surface, so this class of defect is caught in CI rather than in a demo.

## Deliverables

- [ ] Every surface root — the Captain home, the run view, the Dashboard, a project's Overview, the Specs tab, Playbooks, Settings — is a height-constrained box that scrolls its own content; the document's scroll height never exceeds the viewport on any surface at 400 and 800 pixels tall, with the sidebar open and collapsed.
- [ ] The fit journey measures height as it measures width: at 400 and 800 pixels tall, on every surface, the document does not scroll vertically, no scroll container's box extends past the viewport, and a window resized taller or shorter after load re-fits without a reload.
- [ ] The chrome-that-fits decision and the fit test items name the vertical law.

## Tasks

1. The vertical fit measurement in the journey, naming every offender.
2. Surface roots fixed until the journey is green; specs amended.

## Verification

Recorded on completion.
