<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-089: Fresh-user scenarios

## Status

In progress on `fresh-user-scenarios`: part 1 (tasks 1–9) under way; part 2 (tasks 10–16) follows once the Playbook 17 adoption merges, on this branch.

## Intent

Implement [DR-089](../decisions/089-every-fresh-user-scenario-walked-for-real.md), and close the gaps an audit of [DR-086](../decisions/086-tests-in-tiers.md)'s delivery found: release rules and records that drifted from what shipped, a release workflow whose tag and notes logic had no test, a fresh install that departed from the README, spec items asserting what no test asserts, and interface text that explains where it should name.

## Deliverables

- [x] DR-089 and the release rules it changes, with release-5 and release-16 scoped to the regular and beta forms.
- [x] The app release's tag check and notes assembly in `scripts/release-notes.mjs`, tested (release-28).
- [x] The fresh install launching the server shell the README's way, reading readiness for bound players only, rendering in English on any system; the smoke refusing a dirty tree.
- [x] Node.js 22.19 stated as the app's floor wherever the floor is stated; the tests-in-tiers record's status and regression outcome stated as they are.
- [x] The Specs tab's empty state naming a command that scaffolds.
- [ ] The Register tab's intent defaulting to the source's title, so the app's own example registers on its defaults.
- [ ] Spec items matching what is built and tested: the palette, the Overview's GitHub line, the live journeys, spec-view's lowest free number.
- [ ] Inline explanations shortened to key phrases, in both catalogs.
- [ ] The changelog carrying what shipped unnoted.
- [ ] The smoke's `live` stage (`npm run smoke -- --live`).
- [ ] The regression's example journey: pasted, compiled for real, registered on the defaults, run to a finished turn.
- [ ] The hermetic compiled-fixture journey.
- [ ] The regression's new project created from the palette, through `/decide` then `/code`, a player's question answered through the Captain.
- [ ] The hermetic two-intent handoff journey.
- [ ] The regression's observed-and-aborted `/code` removed.

## Tasks

1. Record DR-089, the release rules it changes, and this intent.
2. Move the app release's tag check and notes assembly into a tested script.
3. Launch the fresh install's server the README's way, pin its render to English, and refuse a dirty tree.
4. State the Node.js 22.19 floor and the tests-in-tiers record's standing.
5. Name a scaffolding command in the Specs tab's empty state.
6. Default the Register tab's intent to the source's title.
7. Bring the palette, Overview and live-journey items in line with what is built and tested.
8. Shorten the interface's inline explanations to key phrases.
9. Note in the changelog what shipped unnoted.
10. Add the smoke's `live` stage: the live desktop smoke inside the fresh install's clone.
11. Add the regression's example journey.
12. Add the hermetic compiled-fixture journey with its committed fixture and its regeneration command.
13. Move the regression's new project to the palette's Create with `/decide` then `/code`, answering a player's question through the Captain.
14. Add the hermetic two-intent handoff journey.
15. Drop the regression's observed-and-aborted `/code`.
16. Rewrite the release checklist, the release playbook and the changelog's tiers entry for the walks as built; run `npm run smoke -- --live` and `npm run regression` once and record the outcomes.

## Verification

Part 1: `npm run build`, `npm test`, `npm run e2e`, `spex lint` and the catalog check pass.
Part 2: `npm run smoke -- --live` passes every stage, and `npm run regression` runs with every failure judged by DR-089's classes.

The changelog's tiers entry and [DR-039](../decisions/039-browser-acceptance-journeys.md)'s status still say the regression walks the three fresh-user scenarios.
Both stay until task 16: the changelog entry describes the lane as it is built today and is rewritten when the lane changes, and DR-039's line summarizes DR-086's extension, which DR-089 amends without rewriting.
