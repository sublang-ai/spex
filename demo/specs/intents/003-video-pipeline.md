<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-003: Video Pipeline

## Status

In progress

## Intent

Videos flow from the admin's disk to a member's screen: upload, attach, publish, play.
Lands the video-library package, serves the catalog's media delegations through the video library (the course-publishing package), and turns the full acceptance gate green — the release acceptance.

## Deliverables

- [ ] Video library: upload with limits and progress, listing, deletion (video-library)
- [ ] Private storage with short-lived access grants (video-library)
- [ ] Embedded player with signed-in gating (video-library)
- [ ] Media delegations served by the library: picker in the lesson editor, dangling-reference handling (course-publishing)
- [ ] Header entries and home page named and wired (site-navigation)
- [ ] Platform supply seams audited on the deployed environment (platform-services)
- [ ] Full acceptance green across the composition packages (admin-bootstrap, site-navigation, course-publishing, lesson-playback, protected-content, platform-services)

## Tasks

1. Provision the private storage bucket and the asset record migration.
2. Implement upload with format and size refusal, progress, and interruption safety.
3. Implement the library listing with editable titles and confirmed deletion.
4. Implement grant issuance behind session verification, and the embedded player with its sign-in-required state.
5. Serve the lesson editor's media actions with the library picker.
6. Handle dangling references: no-media fallback in the lesson view, marking in the course manager.
7. Stand up the video-library verification suite.
8. Stand up the course-publishing, lesson-playback, and protected-content acceptance tests and the platform-services substrate inspections as the release-acceptance run.

## Verification

- One closed gate: every package Verification item passes.
- Journey and sweep tests run against a seeded controlled-test installation; the platform-services substrate audits inspect the deployed environment. Both belong to the same gate.
