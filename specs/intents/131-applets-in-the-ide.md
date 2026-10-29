<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-131: Applets in the IDE

## Status

Implemented on its branch; focused, suite and journey verification passed locally; CI, the desktop shell's framing on a packaged app, and review pending.

## Intent

Show an installed applet as a tab of the project's workspace, served by the core under a per-applet capability with a read-only window on the working folder, confined by policy and sandbox, as DR-161 decides.

## Deliverables

- [x] Refuse an applet without `index.html` at its folder's root wherever a release is read.
- [x] `applet.open` minting one in-memory capability per applet and project, with its refusals.
- [x] The core's endpoint answering `GET`/`HEAD` under `/applets/<capability>/` by the served-path table, with the policy and the refusals; the self-bound endpoint as an HTTP server of the core's own, the server shell handing those paths to its core.
- [x] A workspace tab per installed applet after Overview, its sandboxed frame, Reload and refusal; none on a seat; the UI page's `frame-src`.
- [x] The integration suite of applets-7, the browser journey of applets-8, and the server shell's hand-off check.

## Tasks

1. Format rule, `applet.open`, the core's applet serving and the shell's hand-off, with their integration coverage.
2. The workspace's applet tabs, the frame and the UI page's policy, with their catalogs.
3. The browser journey, this record and the changelog.

## Verification

Run on the branch after the merge of `main` (2026-10-29):

- `npm run build`: every workspace built, catalogs whole.
- `packages/core` `applets.integration.test.js`: 1/1; `environment.integration.test.js`: 20/20; the whole core suite 936/941, the five failing — two of `environments.integration`, three of `space-sync.integration` — failing on `main` alike in this environment.
- `apps/server` `server.integration.test.js`: 13/13, the `/applets/` hand-off among them.
- `packages/ui` under Node 22: 1280/1280 in 60 files.
- `e2e` `tests/applets.spec.ts`: 1/1; `tests/library.spec.ts`: 3/3; `npm run typecheck -w e2e` clean.
- `spex lint`: 0 errors; `npm run prepush`: clean.
