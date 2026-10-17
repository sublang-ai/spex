<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-106: Instance Package Source Presentation

## Status

Done (2026-10-17).

## Intent

Keep internal transport locations out of generated package-source labels and reports while preserving installation inputs.

## Deliverables

- [x] Distinguish authored Git requests from display summaries.
- [x] Apply the instance naming rule to environment labels, failures and conflicts.
- [x] Verify real-core installation and the rendered source label and tooltip.

## Tasks

1. Project environment sources and reports through the known instance boundary and verify transport preservation.

## Verification

Verified the real-core regression against the old disclosure, then the corrected behavior through installation, replies and broadcasts, locked commit and path details, failure and conflict reports, unknown-origin discovery, and unchanged transport inputs. The external transport case includes quoted HTTP userinfo.

The affected environment suites passed 25 tests, existing code-join transport checks passed six, and the environment UI suite passed 13. The final extended regression passed separately after its added external-error case. Core and UI builds, focused type checks and the UI translation check passed. Independent review found no remaining actionable issue.
