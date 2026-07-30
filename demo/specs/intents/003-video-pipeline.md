<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-003: Video Pipeline

## Status

In progress

## Intent

Videos flow from the admin's disk to a member's screen: upload, attach, publish, play.
Lands the video-library package, binds the catalog's media slot, and turns the full composition suite green — the release acceptance.

## Deliverables

- [ ] Video library: upload with limits and progress, listing, deletion (video-library)
- [ ] Private storage with short-lived access grants (video-library)
- [ ] Embedded player with signed-in gating (video-library)
- [ ] Media-slot binding: library picker in the lesson editor, dangling-reference handling (course-publishing)
- [ ] Header-slot and home-page bindings complete (site-navigation)
- [ ] Platform supply bindings audited on the deployed substrate (platform-services)
- [ ] Full composition acceptance green (admin-bootstrap, site-navigation, course-publishing, lesson-playback, protected-content, platform-services)

## Tasks

1. Provision the private storage bucket and the asset record migration.
2. Implement upload with format and size refusal, progress, and interruption safety.
3. Implement the library listing with editable titles and confirmed deletion.
4. Implement grant issuance behind session verification, and the embedded player with its sign-in-required state.
5. Bind the library picker into the lesson editor's media actions.
6. Handle dangling references: no-media fallback in the lesson view, marking in the course manager.
7. Stand up the video-library verification suite.
8. Stand up the course-publishing, lesson-playback, and protected-content acceptance tests and the platform-services substrate inspections as the release-acceptance run.

## Verification

- One closed gate: every package Verification item and every composition test item passes.
- Journey and sweep tests run against a seeded controlled-test installation; the platform-services substrate audits inspect the deployed environment. Both belong to the same gate.
