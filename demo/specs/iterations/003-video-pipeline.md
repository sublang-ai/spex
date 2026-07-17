<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-003: Video Pipeline

## Goal

Videos flow from the admin's disk to a member's screen: upload,
attach, publish, play.
Lands the VID package, binds the catalog's media slot, and turns
the full composition suite green — the release acceptance.

## Deliverables

- [ ] Video library: upload with limits and progress, listing, deletion (VID)
- [ ] Private storage with short-lived access grants (VID)
- [ ] Embedded player with signed-in gating (VID)
- [ ] Media-slot binding: library picker in the lesson editor, dangling-reference handling (PUB)
- [ ] Full composition acceptance green (PUB, PLAY, GUARD)

## Tasks

1. Provision the private storage bucket and the asset record migration.
2. Implement upload with format and size refusal, progress, and interruption safety.
3. Implement the library listing with editable titles and confirmed deletion.
4. Implement grant issuance behind session verification, and the embedded player with its sign-in-required state.
5. Bind the library picker into the lesson editor's media actions.
6. Handle dangling references: no-media fallback in the lesson view, marking in the course manager.
7. Stand up the VID verification suite.
8. Stand up the PUB, PLAY, and GUARD acceptance tests as the release-acceptance run.

## Acceptance criteria

- VID-11 through VID-13 pass.
- PUB-4, PUB-5, PLAY-3, PLAY-4, GUARD-3, and GUARD-4 pass
  against a fresh preview deployment — the product's release
  acceptance.
