<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# RELEASE: Release Workflow

## Intent

This spec defines release workflow rules for the project.

## Versioning

### RELEASE-1

The project shall follow Semantic Versioning [[1]]: `MAJOR.MINOR.PATCH` where MAJOR indicates breaking changes, MINOR indicates new features, and PATCH indicates bug fixes.

### RELEASE-2

The version in `package.json` shall match the git tag (without the `v` prefix). The release workflow shall verify this match before publishing.

## Changelog

### RELEASE-3

All notable changes shall be documented in `CHANGELOG.md` following the Keep a Changelog [[2]] format.

### RELEASE-4

When preparing a release, the developer/agent shall review all commits since the last release and ensure all notable changes are documented in the `[Unreleased]` section of `CHANGELOG.md`.

### RELEASE-5

When creating a release tag, the developer/agent shall move items from `[Unreleased]` to a new version section in `CHANGELOG.md` with the release date, and update the comparison links at the bottom of the file.

### RELEASE-6

Changelog entries shall be grouped under these headings (in order): `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.

## Release Process

### RELEASE-7

Releases shall be triggered by pushing a git tag matching the pattern `vMAJOR.MINOR.PATCH` (e.g., `v1.0.0`).

### RELEASE-8

When a release tag is pushed, the release workflow shall verify the tag version matches `package.json` version, build and validate the package, and extract release notes from `CHANGELOG.md`.

### RELEASE-9

When the release workflow publishes to npm, it shall use the `--provenance` flag for supply chain security, generating a signed attestation linking the package to its source repository and build. Authentication shall use npm OIDC trusted publishing — static npm tokens shall not be used.

### RELEASE-10

When the release workflow publishes a scoped package, it shall use `--access public` to ensure public availability.

### RELEASE-11

When the release workflow completes publishing, it shall create a GitHub release with the extracted changelog notes.

## Package Hygiene

### RELEASE-12

The `package.json` `files` field shall exclude test files and build artifacts not required at runtime from the published tarball. The `prepublishOnly` script shall build and run tests before publishing.

### RELEASE-13

Where the release workflow validates the package, it shall verify that the tarball contains no test files and no source files that are not required at runtime.

## Pre-release Checklist

### RELEASE-14

When preparing a release tag, the developer/agent shall verify that all tests pass and all changes are committed and pushed to `main`.

### RELEASE-15

When preparing a release tag, the developer/agent shall verify that `CHANGELOG.md` is updated with the new version and date, and `package.json` version is bumped.

### RELEASE-16

When preparing a release tag, the developer/agent shall verify that the tarball contains only production files (e.g., via `npm pack --dry-run`).

## References

[1]: https://semver.org/spec/v2.0.0.html "Semantic Versioning 2.0.0"
[2]: https://keepachangelog.com/en/1.1.0/ "Keep a Changelog 1.1.0"
