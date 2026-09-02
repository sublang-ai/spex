<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-048: Source-Only App Release

## Status

In progress

## Intent

Ship the first app release — desktop and server shells as source on GitHub Releases, no binaries — per [DR-040](../decisions/040-source-only-app-releases.md), with every gate recorded.

## Deliverables

- [x] The app release workflow: CI-green gate, tag against both shells' versions, build and test, notes from the root changelog plus the run-from-source block, no artifacts.
- [x] The root changelog with the first version; README and the release checklist say what a release is.
- [ ] The gates run on the tagged commit: hermetic smoke with the desktop stage, live desktop smoke, the manual checklist's desktop pass.
- [ ] The tag pushed and the GitHub release created by the workflow.

## Tasks

1. Specs and workflow.
2. Changelog and docs.
3. Gates, tag, release.

## Verification

The GitHub release for the tag exists with the changelog notes and the run-from-source block and no attached build artifact; the tag message records each gate's outcome.
