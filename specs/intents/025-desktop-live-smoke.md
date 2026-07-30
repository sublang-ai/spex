<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-025: Desktop Live Smoke

## Status

Done

## Intent

Automate the release-critical desktop path per [DR-020](../decisions/020-desktop-live-smoke.md): a driver that boots the real Electron app against a scratch home, walks config → Academy → session → live `/code` dispatch → abort over the app's own socket, and a split release gate keeping the hermetic suite deterministic.

## Deliverables

- [x] Desktop smoke handshake: env-guarded user-data redirect + socket handshake file; mutual exclusion with acceptance mode; app-shell item and test.
- [x] `scripts/desktop-smoke.mjs` driving the critical path with agent-evidence gating (dispatch prompt, then first live output), bounded budget, abort, clean teardown, and ABI flip/restore on all exit paths; `npm run smoke:desktop`.
- [x] `npm run smoke -- --desktop` keeps the hermetic render pass; the live gate is separate; release items record the split with a retry-or-waive rule; `docs/release-smoke.md` updated with the reduced manual residue.

## Tasks

1. Add the handshake hook to the desktop main process with its mutual-exclusion guard and unit coverage.
2. Write the driver script with handshake wait, critical-path walk, evidence gating, abort assertions, teardown, and ABI management.
3. Split the release gates: smoke script wiring, release amendments, checklist rewrite; lint clean.

## Verification

- `npm run smoke` stays hermetic and green without sign-in; `npm run smoke -- --desktop` needs no provider either.
- A locally signed-in `npm run smoke:desktop` completes the walk and exits zero, restoring the Node ABI even when a stage fails.
- Setting both smoke and acceptance variables refuses to launch with a named error.
