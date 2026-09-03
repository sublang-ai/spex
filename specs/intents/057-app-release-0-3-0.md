<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-057: App Release 0.3.0

## Status

In progress.

## Intent

Ship the app's third source release — playbook 12.2 with slc 0.7, the demo audience craft, and the real-root audience pass — per [DR-040](../decisions/040-source-only-app-releases.md), with every gate recorded, as the build the owner's demo depends on.

## Deliverables

- [x] Both shells at 0.3.0 and the changelog section dated.
- [x] The gates on the release tree: hermetic smoke with the desktop stage, live desktop smoke, the checklist's desktop pass, CI green.
- [ ] The tag pushed and the GitHub release created by the workflow.

## Tasks

1. Versions and changelog.
2. Gates, tag, release.

## Verification

Gates on the release tree (2026-09-02): `npm run smoke -- --desktop` passed every stage — build, lint, unit, integration, browser, 25 journeys, core round-trip, packed-CLI user pass, Electron ABI flip, render screenshot on scratch user data and state root, restore; `npm run smoke:desktop` passed — launch, connect, config valid, Academy seeded, session, `/code` dispatched to dev.coder, live agent output, abort, teardown, ABI restore.
The checklist's desktop pass took the form of the real-root audience pass: every surface walked in the served UI over the owner's own state root at 1280×800 in both themes, and two real playbook sessions — a `/decide`, a three-task `/code`, a `/review`, a `/dev` with its Boss reply, and a `/code` — run to completion with the owner's agents and reviewed as records, the defects found fixed under their own intent.
CI green for the release commit on every runner, Windows included, after two failures the local hosts had hidden: the compile.run test needed an injected Node probe, and a compiled registry's absolute path had to import as a file URL.
