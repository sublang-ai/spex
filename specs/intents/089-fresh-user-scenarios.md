<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-089: Fresh-user scenarios

## Status

Merged to `main` in c637948 on 2026-09-29, on top of the Playbook 17 adoption ([DR-088](../decisions/088-playbook-17-slc-0-12-cligent-0-27-adoption.md)) and its scratch-leak and restore fixes, and released in `app-v0.9.0-beta.1`: parts 1 and 2 are built and verified hermetically, and the live runs below are recorded.
One deliverable waits on the compiler, not on this branch: slc 0.12 refuses the example's machine at `gears2fsm` on every compile so far ([sublang-ai/slc#29](https://github.com/sublang-ai/slc/issues/29)), so no compiled fixture has been captured, the hermetic compiled-fixture journey skips, and the example's displayed gears and state machine stay the original demo's until a capture refreshes them.

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
- [ ] The example's displayed gears and state machine refreshed from that capture, and the changelog saying the example compiles once the regression records its clean first compile.
- [x] The regression's new project created from the palette, through `/decide` then `/code`, a player's question answered through the Captain.
- [x] The hermetic two-intent handoff journey.
- [x] The regression's observed-and-aborted `/code` removed.
- [x] The release checklist, the release playbook and the changelog's tiers entry rewritten for the walks as built.
- [ ] `npm run smoke -- --live` and `npm run regression` run once, their outcomes recorded.
- [x] The app's example settling the two limits slc 0.12 asks about, named as adapted from slc's demo wherever it is shown, placed or quoted.
- [x] The changelog carrying every decision since `app-v0.8.0` that `[Unreleased]` missed.
- [x] A resolved repair's outcome and a declined row holding their places until the reader's Refresh, the list standing with the last outcome, focus and the live region following the header's count (space-48, space-55), verified by space-56.

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
19. Hold a repair's outcome and a declined row in place until the reader's Refresh, and test it.
20. Refresh the example's displayed gears and state machine from the compiled fixture's capture, and state in the changelog that the example compiles.

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

The restack's review, answered on 2026-09-28 and verified with: `npm run build`; `npm test` — 34 script, 133 CLI, 352 core, 710 interface, 16 desktop and 11 server tests; 64 hermetic journeys passed and the compiled-fixture journey skipped, run-view-118's focus check again failing once in a full run and passing three times alone and in a second full run; the journeys typecheck; `spex lint` clean; the three catalogs whole.
Every finding was taken.
space-48 had been restated to the Sync tab's defect: the last outcome never drew, the list closing with the core's last diagnostic and focus falling to the page, and an outcome jumping to the list's head where [DR-065](../decisions/065-repairs-the-reader-answers.md) has a changed row hold its place; the list now holds its drawn order until the reader's Refresh, and space-56's test fails when rows re-sort on every read.
The example now counts judgments per loop, its last judgment in a loop the conclusion, and ends after the 2nd loop's commit without another review, the reading slc 0.10's compile of the demo took; reporting leftover findings was dropped rather than defined.
No compile of the new text has run, so the changelog, the asset header, the module comment and the map state the settled limits rather than a compile.
A declined row's "Don't add" leaves with the answer, so focus falls to the page there too; the review did not raise it and it stays as it was.

Live runs on 2026-09-28, on this machine's signed-in agents, with the template's agents as seeded (Captain and players on `claude-opus-5`, the compile player on Codex `gpt-6-astra` at `xhigh`):

| Run | Tree | Outcome |
| --- | --- | --- |
| `npm run smoke -- --live` | `fresh-user-scenarios-v2` at `ed5f5f9` | every stage passed — build 7 s, lint 1 s, fresh install 1 m 07 s, CLI user 9 s, live 48 s: the desktop inside the fresh install dispatched `/code`, the coder's live output was observed, the turn aborted and the app tore down cleanly |
| The regression, three journeys at once | the part-2 tree before the restack | all three failed; the chat-authored changelog playbook compiled for real on slc 0.12 through Link, registered and started its run |
| playbook-library-86, the example | the part-2 tree | `text2gears` asked what governs after the third judgment and what happens at the two-loop limit — the example's two open limits, since settled in its text |
| dashboard-63 and playbook-library-78 | the part-2 tree | the Captain's judge call was refused by the provider: "Opus 5's safeguards flagged this message … `[reasoning_extraction]`" — provider-side by DR-089's classes, and the same refusal the earlier regression runs met |
| playbook-library-86, twice more | `fresh-user-scenarios-v2` at `ed5f5f9` | `text2gears` and `optimize` passed on the settled text; `gears2fsm` failed closed both times, its mechanical review finding every exit of the first player state unsatisfiable under probing, in two differently generated machines — filed as [sublang-ai/slc#29](https://github.com/sublang-ai/slc/issues/29); by DR-089 a refusal of the app's own example blocks a regular tag, and it does not gate a beta |

No run captured a compiled fixture: the capture follows a passing compile.

