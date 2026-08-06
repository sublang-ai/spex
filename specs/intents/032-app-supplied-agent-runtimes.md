<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-032: App-Supplied Agent Runtimes

## Status

Done

## Intent

Close the two gaps [DR-023](../decisions/023-runtime-compatibility-from-cligent.md) left open before a desktop/core release: no application layer supplied the agent SDKs the core no longer installs, and adapter readiness stayed credential-only while the playbook launcher it mirrors gained a runtime gate. [DR-024](../decisions/024-app-supplied-agent-runtimes.md) records both settlements.

## Deliverables

- [x] DR-024 recorded; the readiness items and DR-023's open consequence carry the amendment; the spec map lists the new records
- [x] `checkAdapterReadiness` combines a cligent-derived runtime half with the credential half: missing or below-floor runtimes report not ready with cligent's verdict and pinned install, both halves report together, and the null-readiness class survives only over a usable runtime
- [x] `apps/desktop` declares the `claude` and `codex` SDKs at `*`, packaged builds unpack both SDK trees from the asar, and the lockfile carries the resolution

## Tasks

1. Record DR-024 and amend settings-14, core-service-9, DR-023, and the map.
2. Derive the readiness runtime half from cligent's targets, injectable for tests.
3. Supply the SDKs from the desktop manifest and unpack them in packaging.

## Verification

Root gates (`npm run build`, `npm test`, `npm run test:integration`, `npm run smoke`, `spex lint`) on a clean `npm ci` tree; a packaged build inspected for both SDK trees under `app.asar.unpacked`.
