<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-234: Translation Source Pins Stay in the Overlay

## Status

Accepted (2026-11-14).
Amends the placement of translation source pins from [DR-001](001-scaffold-localization.md) and [DR-101](101-chinese-scaffolds-for-chinese-only-teams.md).

## Context

Readers of the generated Chinese `meta.md` encounter a source hash before each translated rule.
The hashes tell translation maintainers when to review an overlay after its English source changes.
Projects have no use for them.

## Decision

- Each language keeps its file and item source pins in a manifest beside its `specs/` directory for translation review.
- The localized Markdown is the project template. Scaffolding and updating write the translated specs without copying the manifest.

## Consequences

File history retains the hashes of previously released Markdown with inline pins, so an update recognizes a pristine older file and replaces it with the current translation.
Customized seeds keep their existing content.
