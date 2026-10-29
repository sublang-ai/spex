<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-131: Applets in the IDE

## Status

Implemented on its branch; review found the frame's own navigation unconfined and the `~/` window reaching a home held by the working folder, both closed spec-first; focused, suite and journey verification passed locally; CI and the desktop shell's frame guard in a running Electron pending.

## Intent

Show an installed applet as a tab of the project's workspace, served by the core under a per-applet capability with a read-only window on the working folder, confined by policy and sandbox, as DR-161 decides.

## Deliverables

- [x] Refuse an applet without `index.html` at its folder's root wherever a release is read.
- [x] `applet.open` minting one in-memory capability per applet and project, with its refusals.
- [x] The core's endpoint answering `GET`/`HEAD` under `/applets/<capability>/` by the served-path table, with the policy and the refusals; the self-bound endpoint as an HTTP server of the core's own, the server shell handing those paths to its core.
- [x] A workspace tab per installed applet after Overview, its sandboxed frame, Reload and refusal; none on a seat; the UI page's `frame-src`.
- [x] The frame confined to the endpoint's origin: the served page's `frame-src` retargeted to `'self'`, the desktop's `will-frame-navigate` guard; the home refused through `~/` where the working folder holds it.
- [x] The integration suite of applets-7, the browser journey of applets-8, the server shell's hand-off check, and the desktop's frame-guard check.
- [x] The frame sent no referrer; every answer under a capability, a refusal included, turning DNS prefetching off and carrying the policy.
- [x] The getting-started guide's section on applets.

## Tasks

1. Format rule, `applet.open`, the core's applet serving and the shell's hand-off, with their integration coverage.
2. The workspace's applet tabs, the frame and the UI page's policy, with their catalogs.
3. The browser journey, this record and the changelog.
4. The review's findings: the home refused through `~/`, the frame's navigation confined on both shells, their coverage, the records corrected.
5. The frame's referrer, DNS prefetching and the policy on refusals, with their coverage.
6. The getting-started guide's section on applets.

## Verification

Run on the branch after the merge of `main` (2026-10-29):

- `npm run build`: every workspace built, catalogs whole.
- `packages/core` `applets.integration.test.js`: 1/1; `environment.integration.test.js`: 20/20; the whole core suite 936/941, the five failing — two of `environments.integration`, three of `space-sync.integration` — failing on `main` alike in this environment.
- `apps/server` `server.integration.test.js`: 13/13, the `/applets/` hand-off among them.
- `packages/ui` under Node 22: 1280/1280 in 60 files.
- `e2e` `tests/applets.spec.ts`: 1/1; `tests/library.spec.ts`: 3/3; `npm run typecheck -w e2e` clean.
- `spex lint`: 0 errors; `npm run prepush`: clean.

Run again after the review's fixes (2026-10-29):

- `npm run build`: every workspace built.
- `packages/core` `applets.integration.test.js`: 1/1 with the home case; the whole core suite: 936/941, the five failing — two of `environments.integration`, three of `space-sync.integration` — the same five as before these fixes.
- `apps/server` `server.integration.test.js`: 13/13, the served page's `frame-src 'self'` among them.
- `apps/desktop`: 24/24 across the suite's files but `compiler-runtime.test.js`, which downloads Electron and did not finish in this environment; `frame-navigation.test.js` 1/1 among the 24.
- `e2e` `tests/applets.spec.ts`: 1/1 with the sink probe; `npm run typecheck -w e2e` clean.
- `spex lint`: 0 errors; `npm run prepush`: clean.

Run again after the merge of `main` with the CLI's package init and endpoint file, and the referrer and DNS hardenings (2026-10-29):

- `npm run build`: every workspace built, catalogs whole.
- `packages/core` `applets.integration.test.js`: 1/1, DNS prefetching off on every answer, the policy on every refusal, the handshake's among them, and `'none'` for a `Host` holding `_`; `environment.integration.test.js`: 20/20; the whole core suite: 938/943, the five failing — two of `environments.integration`, three of `space-sync.integration` — the same five as before.
- `apps/server` `server.integration.test.js`: 14/14.
- `apps/desktop`: 24/24 across the suite's files but `compiler-runtime.test.js`, not run; `frame-navigation.test.js` 1/1 among the 24.
- `packages/ui` under Node 22: `src/lib/applets.test.ts` and `src/places-servers.test.tsx`, 21/21 in 2 files.
- `e2e` `tests/applets.spec.ts`: 1/1, the frame's `referrerpolicy` and its empty `document.referrer` among it; `tests/library.spec.ts`: 3/3; `npm run typecheck -w e2e` clean.
- `spex lint`: 0 errors, 1 warning on `core-service-41`, a file this branch leaves as `main` has it; `npm run prepush`: clean.

After the getting-started guide's section on applets (2026-10-29):

- `npm run prepush`: clean, `spex lint` 0 errors and the one `core-service-41` warning.
