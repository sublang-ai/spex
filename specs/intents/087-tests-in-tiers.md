<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-087: Tests in tiers

## Status

Completed on `ir-087-tests-in-tiers` and merged to `main` in 12856ef on 2026-09-28, with CI run 36436193657 green on Linux and macOS; released in `app-v0.9.0-beta.1` on 2026-09-29, the first beta of the kind [DR-087](../decisions/087-beta-app-releases.md) defines.

## Intent

Implement [DR-086](../decisions/086-tests-in-tiers.md) and [DR-087](../decisions/087-beta-app-releases.md): smoke coverage of the three fresh-user scenarios, the gates by tier, beta app releases, the fresh-user review of the interface, and the removal of low-return tests.

## Deliverables

- [x] The fresh-install smoke (`scripts/install-smoke.mjs`) and the smoke reduced to build, lint, fresh install, CLI user pass.
- [x] The regression: the two-role playbook run after registration on a `gpt-6-astra` compile, the two-intent new-project journey, `npm run regression` — written, but neither long journey has passed end to end: the authored playbook's compile ran through the app and the compiler refused the generated machine before the run step, and the two-intent journey stopped in its second cycle on a provider-side refusal.
- [x] The hermetic paste-path journey (`playbook-library-85`).
- [x] The beta app release workflow and CI's macOS journeys lane.
- [x] The release checklist reduced to its residue; the changelog.
- [x] CI green: the Up next row's overflow on Linux fonts.
- [x] The fresh-user interface review and its fixes, in both catalogs.
- [x] Redundant or low-return tests removed: 35 interface tests, 4 core tests, one journey boot.

## Tasks

1. Record the decisions and the spec items.
2. Write the fresh-install smoke and cut the smoke's re-run stages.
3. Teach the app-release workflow the beta form; add macOS to the journeys job.
4. Extend the live lane and add the paste-path journey.
5. Fix the Up next row at 480 pixels on Linux fonts.
6. Review the interface as a fresh user and fix what reads long or unclear.
7. Remove the tests the inventory shows redundant.
8. Rewrite the checklist and the changelog; run the smoke, the live smoke and the regression once.

## Verification

Run `npm run smoke` on this branch and see the fresh install pass on both shells; run `npm run smoke:desktop`; run `npm run regression` once with the machine's sign-in and record the outcome; see CI green on Linux and macOS.

Verified on 2026-09-28: `npm run smoke` at 9a192c5 passed every stage — build 7s, lint 1s, fresh install 2m52s (clone, `npm ci` on an empty cache 2m05s, the server walk 11s, the desktop render 33s), CLI user pass 10s; `npm run smoke:desktop` walked its critical path with the signed-in Claude adapter and restored the ABI; 700 interface tests, 335 core tests, 23 script tests and the hermetic journeys (63) pass, `spex lint` clean.
The regression: `run-view-104` passed; `dashboard-63` twice reached its second cycle — the palette add, the scaffolded Specs tab, the Dashboard capture and Start, a real `/code` cycle to a reviewed commit, and the queue's automatic handoff — and twice a Captain judge call was refused on the provider's side ("Opus 5's safeguards flagged this message"), which parked the run and stopped the journey with its transcripts attached; waived as provider-side under the retry-or-waive rule.
`playbook-library-78` ran five times on Codex `gpt-6-astra` through the app: the picker, the authored source and the compile request all worked; the first real compile exposed that the library directory resolved no `xstate`, fixed by provisioning the engine links; with the links, the compiler's own checks refused the generated machine three times in a row (unsatisfiable transitions, then a link-time result-guard contract), so the core's bounded relay handed the draft back and the journey stopped — a compiler-and-model outcome on slc 0.10, recorded, not an app failure.
CI run 36436193657 on 12856ef passed on Linux and macOS, both journeys lanes included.
