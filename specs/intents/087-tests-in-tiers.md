<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-087: Tests in tiers

## Status

In progress on `ir-087-tests-in-tiers`; not released.

## Intent

Implement [DR-086](../decisions/086-tests-in-tiers.md) and [DR-087](../decisions/087-beta-app-releases.md): smoke coverage of the three fresh-user scenarios, the gates by tier, beta app releases, the fresh-user review of the interface, and the removal of low-return tests.

## Deliverables

- [ ] The fresh-install smoke (`scripts/install-smoke.mjs`) and the smoke reduced to build, lint, fresh install, CLI user pass.
- [ ] The regression: the two-role playbook run after registration on a `gpt-6-astra` compile, the two-intent new-project journey, `npm run regression`.
- [ ] The hermetic paste-path journey (`playbook-library-85`).
- [ ] The beta app release workflow and CI's macOS journeys lane.
- [ ] The release checklist reduced to its residue; the changelog.
- [ ] CI green: the Up next row's overflow on Linux fonts.
- [ ] The fresh-user interface review and its fixes, in both catalogs.
- [ ] Redundant or low-return tests removed.

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
