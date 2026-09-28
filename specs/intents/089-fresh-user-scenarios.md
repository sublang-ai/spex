<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-089: Fresh-user scenarios

## Status

In progress on `fresh-user-scenarios`: part 1 (tasks 1–9) done and verified; part 2 (tasks 10–16) follows on this branch once the Playbook 17 adoption merges.

## Intent

Implement [DR-089](../decisions/089-every-fresh-user-scenario-walked-for-real.md), and close the gaps an audit of [DR-086](../decisions/086-tests-in-tiers.md)'s delivery found: release rules and records that drifted from what shipped, a release workflow whose tag and notes logic had no test, a fresh install that departed from the README, spec items asserting what no test asserts, and interface text that explains where it should name.

## Deliverables

- [x] DR-089 and the release rules it changes, with release-5 and release-16 scoped to the regular and beta forms.
- [x] The app release's tag check and notes assembly in `scripts/release-notes.mjs`, tested (release-28).
- [x] The fresh install launching the server shell the README's way, reading readiness for bound players only, rendering in English on any system; the smoke refusing a dirty tree.
- [x] Node.js 22.19 stated as the app's floor wherever the floor is stated; the tests-in-tiers record's status and regression outcome stated as they are.
- [x] The Specs tab's empty state naming a command that scaffolds.
- [x] The Register tab's intent defaulting to the source's title, so the app's own example registers on its defaults.
- [x] Spec items matching what is built and tested: the palette, the Overview's GitHub line, the live journeys, spec-view's lowest free number.
- [x] Inline explanations shortened to key phrases, in both catalogs.
- [x] The changelog carrying what shipped unnoted.
- [ ] The smoke's `live` stage (`npm run smoke -- --live`).
- [ ] The regression's example journey: pasted, compiled for real, registered on the defaults, run to a finished turn.
- [ ] The hermetic compiled-fixture journey.
- [ ] The regression's new project created from the palette, through `/decide` then `/code`, a player's question answered through the Captain.
- [ ] The hermetic two-intent handoff journey.
- [x] The regression's observed-and-aborted `/code` removed.

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

Part 1 verified on 2026-09-28: `npm run build`; `npm test` — 28 script, 133 CLI, 336 core, 704 interface, 16 desktop and 11 server tests; the 62 hermetic journeys; `spex lint` clean; the interface, core and desktop catalogs whole in English and Chinese.
The fresh install (`scripts/install-smoke.mjs`) at cdf44dd passed every stage in 1m19s with the server launched as the README does: the config seeded at the home's `config/playbook.config.yaml`, readiness for the one bound adapter, the desktop rendered by its English names.
The new release-notes script reproduces, byte for byte, the notes the workflow's inline bash assembled from this changelog for `app-v0.8.0` and for a beta.
Two renumberings the audit proposed fail meta-12 and were not made: `dashboard-5` was released in the CLI's v1.0.0 through v3.0.0 trees, and `run-view-111` is assigned; `dashboard-63` and `run-view-150` skipped no free number, while `spec-view-63` skipped the free, never-released 58 and moved there.
The Specs tab's empty state names the scaffold command rather than offering an in-app Scaffold: the core scaffolds only while creating a repository, and writing into a registered one would need its own decision on committing over a user's history.

The fresh-user wording review read every interface message over about 120 characters in the English catalog where it renders, per [DR-069](../decisions/069-key-phrases-not-sentences.md):

| Surface | Before | After |
| --- | --- | --- |
| Specs, legacy layout | "Its specs/ tree still holds directories from an earlier layout — the user/, dev/, test/, or items/ groups, or an interactions/ or compositions/ collection. Run this to refresh the spec law and print a migration prompt; an AI agent applies it, and this view opens once the tree is migrated:" | "This refreshes the spec law and prints a migration prompt for an AI agent to apply:"; the directories in the heading's title |
| Specs, no `specs/` | "This project has no specs/ directory yet — it holds the spec packages and the decision and intent records this view navigates." | "No specs/ directory yet — it holds spec packages and decision and intent records." |
| Space, unrelated history | "This device and the remote have separate histories. Join both into one space with Join above — anything present in both differently will ask you to choose. A wrong remote URL is the other explanation." | "Join both into one space, or check the remote URL."; the choice on differences stays in Join's confirm |
| Space, a remote not yet met | "Sync sends what is here and brings back anything new. If that address already holds a space from another machine, Join first — it brings both into one and asks about anything that differs." | "Another machine's space already there? Join first."; Join titled "Brings both spaces into one and asks about anything that differs", Sync titled "Sends what is here and brings back anything new" |
| Settings, terminal pane theme | "Only sessions run from the playbook CLI use it — the tmux pane theme (e.g. a catppuccin flavor, or auto); Spex itself follows your OS theme." | "Spex itself follows your OS theme."; the field titled "The tmux pane theme of sessions run from the playbook CLI — e.g. a catppuccin flavor, or auto" |
| Playbooks, `/dev` card | "Pull-request delivery is unavailable until {names} is enabled below; a plain /dev request still runs." | kept: a state, its remedy and its boundary, one sentence per case |
| Captain home, three greetings | "Hello! I'm your Captain. … a playbook, a scripted workflow the AI players run." | kept: the Captain's own words, and where a new reader first meets what a playbook is |
| Connection banner | "Can't reach the Spex core at {endpoint} — retrying every second. …" | kept: a failure saying what and what now |
| Space, Apply and Keep confirms | "Replace {count} units with the remote's version? …" | kept: an inline confirm names its consequences (space-18) |
| Space setup line | "Syncs sessions, queues, projects, Settings and playbook sources — see what stays. Nothing is contacted until you set up." | kept: a scope and a boundary, each a phrase where it applies |
| Space explorer, a session | "{count} files — the manifest, the records and, where this device ran it, its provider hints." | kept: the explorer says what each thing is |
| Sources summary, Space ahead/behind | counts | kept: they name and count |
| Session recovery | "Discard this attempt? …" | not reviewed: the Playbook 17 adoption owns recovery |

The changelog's tiers entry describes the lane as it is built today, the observed `/code` gone with task 15, and is rewritten with the lane in task 16.
[DR-039](../decisions/039-browser-acceptance-journeys.md)'s status still says the regression walks the three fresh-user scenarios: that line summarizes DR-086's extension, which DR-089 amends without rewriting.
