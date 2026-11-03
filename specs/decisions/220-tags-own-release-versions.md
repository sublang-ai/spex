<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-216: Tags Own Release Versions

## Status

Accepted (2026-11-03) on the owner's request for app and npm releases without version-only PRs.
Amends [DR-087](087-beta-app-releases.md) and [DR-184](184-native-desktop-tag-packages.md) in version and notes preparation, and [DR-199](199-release-gated-full-validation.md) only in deterministic metadata preparation before full validation.

## Context

Requiring source manifests and dated changelog headings to match each new tag creates a release-only PR even when no business code changes.
Tag workflows already own validation, native packaging and publication, but source/version mismatch currently prevents them from doing that work.

## Decision

- Keep disjoint `app-vX.Y.Z[-beta.N]` and stable `cli-vX.Y.Z` channels, deriving the released version exclusively from the tag.
- Before installation, prepare only that channel's workspace manifest and lockfile version fields in every validation/build checkout, including the hub's archived tree. Preserve dependencies and development defaults in Git; do not commit or push generated metadata.
- Validate and package the same tagged source plus that deterministic version metadata. Preserve full channel validation, OIDC/provenance, both native builds, strict packaged compilation and signed/notarized Mac distribution.
- Prefer existing exact-version curated notes; otherwise use commits since the most recent published same-channel ancestor with source and comparison links. Exclude drafts/unpublished tags and stale `[Unreleased]`; describe first or empty ranges explicitly.
- Inspect the actual npm tarball, archived app manifest and native installer/app metadata against the tag, publishing the exact checked tarball and downloads.
- Allow explicit branch dispatch to exercise the same build/validation jobs using a runner-local candidate tag, retaining artifacts without publishing or pushing tags; publication effects require an actual channel-tag push.
- Refuse existing releases/npm versions and failed registry lookups. Never overwrite published versions or mutate old tags.
- Remove the live beta.26 exception and merge-parent/PR-status guard from future release workflows; preserve its historical record and tag's workflow.
- Internal CI directory apps explicitly disable distribution signing; published Mac packages keep strict signing and notarization.

## Consequences

A maintainer selects an intended pushed revision and unused tag; no source version bump, version-only PR or merge-parent shape is needed.
Real feature changes retain the repository's review rules, and local smoke/release gates retain their existing scopes.
A fresh source checkout can reproduce the released version by running the preparation helper before installation.
A new npm version requires a new tag; a partially completed publication is diagnosed rather than silently overwritten.
