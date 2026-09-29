<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-089: Fresh-user scenarios

## Status

In progress on `fresh-user-scenarios-v2`, restacked onto the Playbook 17 adoption ([DR-088](../decisions/088-playbook-17-slc-0-12-cligent-0-27-adoption.md)) with its scratch-leak and restore fixes, whose question relay and slc 0.12 the live journeys need: parts 1 and 2 are built and verified hermetically (tasks 1–15, task 16's rewrites, and tasks 17–19).
What remains is the owner's: one run of `npm run smoke -- --live` and of `npm run regression` on signed-in agents, their outcomes recorded here, and the compiled fixture that the regression's example journey captures, committed; until then the hermetic compiled-fixture journey skips.
The branch merges to `main` once those runs are recorded.

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
- [x] The smoke's `live` stage (`npm run smoke -- --live`).
- [x] The regression's example journey: pasted, compiled for real, registered on the form's prefill, run to a finished turn; its capture switch.
- [x] The hermetic compiled-fixture journey, its fixture loader and the capture's README.
- [ ] The compiled fixture, captured by the regression's example journey and committed.
- [x] The regression's new project created from the palette, through `/decide` then `/code`, a player's question answered through the Captain.
- [x] The hermetic two-intent handoff journey.
- [x] The regression's observed-and-aborted `/code` removed.
- [x] The release checklist, the release playbook and the changelog's tiers entry rewritten for the walks as built.
- [ ] `npm run smoke -- --live` and `npm run regression` run once, their outcomes recorded.
- [x] The app's example settling the two limits slc 0.12 asks about, named as adapted from slc's demo wherever it is shown, placed or quoted.
- [x] The changelog carrying every decision since `app-v0.8.0` that `[Unreleased]` missed.
- [x] space-48 stating a repair's outcome as the Sync tab shows it, verified by space-56.

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
17. Settle the example's two limits in every copy, and name it adapted from slc's demo.
18. Note in the changelog every decision since `app-v0.8.0`, and the example's fix.
19. State the folder repair's outcome as it works, and test it.

## Verification

Part 1: `npm run build`, `npm test`, `npm run e2e`, `spex lint` and the catalog check pass.
Part 2: `npm run smoke -- --live` passes every stage, and `npm run regression` runs with every failure judged by DR-089's classes.

Part 1 verified on 2026-09-28: `npm run build`; `npm test` — 28 script, 133 CLI, 336 core, 704 interface, 16 desktop and 11 server tests; the 62 hermetic journeys; `spex lint` clean; the interface, core and desktop catalogs whole in English and Chinese.
Re-verified after the review on 2026-09-28 with task 15 landed: `npm run build`; `npm test` — 31 script, 133 CLI, 336 core, 704 interface, 16 desktop and 11 server tests; the 62 hermetic journeys; `spex lint` clean; the three catalogs whole.
The fresh install (`scripts/install-smoke.mjs`) at cdf44dd passed every stage in 1m19s with the server launched as the README does: the config seeded at the home's `config/playbook.config.yaml`, readiness for the one bound adapter, the desktop rendered by its English names.
The new release-notes script reproduces, byte for byte, the notes the workflow's inline bash assembled from this changelog for `app-v0.8.0` and for a beta, and since the review reads a CRLF changelog's headings and blank lines as the bash's grep did.
Two renumberings the audit proposed fail meta-12 and were not made: `dashboard-5` was released in the CLI's v1.0.0 through v3.0.0 trees, and `run-view-111` is assigned; `dashboard-63` and `run-view-150` skipped no free number, while `spec-view-63` skipped the free, never-released 58 and moved there.
The Specs tab's empty state names the scaffold command rather than offering an in-app Scaffold: the core scaffolds only while creating a repository, and writing into a registered one would need its own decision on committing over a user's history.

The fresh-user wording review read every interface message over about 120 characters in the English catalog where it renders, per [DR-069](../decisions/069-key-phrases-not-sentences.md):

| Surface | Before | After |
| --- | --- | --- |
| Specs, legacy layout | "Its specs/ tree still holds directories from an earlier layout — the user/, dev/, test/, or items/ groups, or an interactions/ or compositions/ collection. Run this to refresh the spec law and print a migration prompt; an AI agent applies it, and this view opens once the tree is migrated:" | "This command refreshes the spec law and prints a migration prompt for an AI agent to apply:"; the directories in the heading's title |
| Specs, no `specs/` | "This project has no specs/ directory yet — it holds the spec packages and the decision and intent records this view navigates." | "No specs/ directory yet — it holds spec packages and decision and intent records." |
| Space, unrelated history | "This device and the remote have separate histories. Join both into one space with Join above — anything present in both differently will ask you to choose. A wrong remote URL is the other explanation." | "Join both into one space, or check the remote URL."; the header's Join titled "Brings both spaces into one and asks about anything that differs", and its confirm, shared with the first-meeting card, reading "Anything that differs will ask you to choose." where it read "Anything in both" |
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

The changelog's tiers entry described the lane as built in part 1, the observed `/code` gone with task 15, until task 16 rewrote it with the lane.
[DR-039](../decisions/039-browser-acceptance-journeys.md)'s status still says the regression walks the three fresh-user scenarios: that line summarizes DR-086's extension, which DR-089 amends without rewriting.

Part 2, on the restacked branch, verified hermetically on 2026-09-28: `npm run build`; `npm test` — 34 script, 133 CLI, 346 core, 708 interface, 16 desktop and 11 server tests; the hermetic journeys, 64 passed and the compiled-fixture journey skipped for want of its fixture, the new handoff journey among the passed; `spex lint` clean; the interface, core and desktop catalogs whole; the journeys typecheck, and `npm run journeys:live -w e2e -- --list` lists the three live journeys.
The smoke's plan is read through its new `--dry-run` by a script test: `live` follows `cli-user` only with `--live`, and a live run resuming past the fresh install is refused.
The compiled-fixture journey passed against a local, uncommitted stand-in — the example as slc 0.10 compiled it in slc's own `demo/reference`, the identical text — under Playbook 17: the stub placed it, the app packaged and registered it on the defaults, and the real Captain shell ran it to its finish on substitute agents, the judge picking each straight outcome from the declared ones; given a capture of another runtime ABI and artifact schema it failed naming both, and with no fixture it skips.
The stand-in is not committed: it came from another compiler release than the one the app installs, and the fixture is only ever captured through the product path.
The live journeys and the smoke's `live` stage were not run: they need the owner's signed-in agents and hours of real model calls, and a Codex compile from this session is refused by its harness.

Part 2's review, answered on 2026-09-28 and re-verified with the same counts: `npm run build`; `npm test` — 34 script, 133 CLI, 346 core, 708 interface, 16 desktop and 11 server tests; 64 hermetic journeys passed and the compiled-fixture journey skipped; `spex lint` clean; the three catalogs whole; the journeys typecheck and list the three live ones.
The live lane's run watch had stopped on a question park's notice before it looked for the reply banner, so no question was ever answered; run-view-151's journey now answers from that hook, and it failed, as the review's probe had, with the former stop rule restored.
In the Captain-shell journey the hook's helpers were probed: the coder's and the reviewer's calls carry their role labels, and `/review returned to /code` stands in the thread, which the project journey's second cycle now requires past the first cycle's end.
The smoke's interrupt was probed with stand-in stages: a SIGTERM to the smoke reached the running `live` stage, and a SIGINT to the process group ended both, each run exiting 143 or 130 and printing the kept scratch; the driver, interrupted while its app launched, killed the app and kept its scratch profile.
Two rules were settled rather than built around: the example's first compile is the one judged, the relay being free to change the source after it; and the example runs on the command it registered, which a kept proposal may name otherwise than `/workflow`.

Restacked onto the fixed adoption and verified on 2026-09-28 after tasks 17–19: a fresh `npm ci`; `npm run build`; `npm test` — 34 script, 133 CLI, 352 core, 710 interface, 16 desktop and 11 server tests; 64 hermetic journeys passed and the compiled-fixture journey skipped, run-view-118's focus check having failed once in a full run and passed on the rerun and three runs alone; the journeys typecheck; `spex lint` clean; the three catalogs whole.
The example's displayed gears and state machine are still slc's compile of its former text, until the owner's live compile captures the fixture and refreshes them.
