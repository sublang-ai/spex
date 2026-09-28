<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-086: Tests in Tiers

## Status

Accepted (2026-09-28) on the owner's ask for smoke coverage of the three most basic fresh-user scenarios, a systematic selection of test sets for smoke, acceptance and regression, and the removal of redundant or low-return tests.
Extends [DR-020](020-desktop-live-smoke.md) (the live desktop smoke keeps its scope and becomes the live smoke every app release runs) and [DR-039](039-browser-acceptance-journeys.md) (the journeys' live lane becomes the regression, and the checks run the hermetic lane on the desktop's own platform too).
Amends [DR-040](040-source-only-app-releases.md) in how an app tag is prepared: the hermetic smoke installs the release from a fresh clone instead of re-running the checks, the regression joins the regular release's gates, and the manual checklist shrinks to what no automation sees.
[DR-087](087-beta-app-releases.md) decides which tiers a beta release runs.

## Context

- The owner named three scenarios every fresh user meets: compile a new simple playbook and run it, by chatting or by pasting its source; start from a new project and develop through a few typical cycles with the existing playbooks; install in a brand-new environment and see that everything works.
- Today's coverage of them: the hermetic journeys author, compile with a stub compiler, register and offer a playbook, but nothing anywhere runs a freshly compiled playbook; the journeys walk sessions and the ledger on the seeded example with a scripted Captain, and the two live smokes each dispatch one `/code` and abort at its first output, so no automated run completes a development cycle, none starts from a project the user made, and none reaches a second cycle; the CLI's tarball is installed into an isolated prefix and walked, but the app — released as source — is never cloned, installed and launched the way its README says.
- The hermetic smoke spends about fifteen of its twenty minutes re-running the unit, integration and journey suites that CI has already run on the same commit — a run the release rules do not even count as verification — and its desktop stage flips the developer tree's native ABI to render once, which is why it carries a warning against running it mid-development.
- The live journey that compiles a two-role playbook for real is specified and gates nothing; the release rules never name it.
- The manual checklist still lists steps the journeys have since automated: the first launch, the palette, the Specs tab, the Playbooks surface, Settings, the CLI-written session's deletion, Retry and Discard, and both themes' legibility.
- On the current compiler a minimal workflow compiles in three to seven minutes; a real `/code` cycle with reviewing takes twenty to forty-five minutes; the owner accepts hours-long runs before a regular release and asks that a beta release skip them.
- To spare the Claude budget, the owner allows compiles made for testing to run on Codex's `gpt-6-astra` at effort `xhigh`; every player and Captain binding stays on `claude`.
- The suites themselves are not the gate's cost: 734 interface tests run in ten seconds, 337 core tests in two minutes, 62 journeys in eight minutes on one worker.

## Decision

### Four tiers

| Tier | Runs | Agents | Budget | When |
| --- | --- | --- | --- | --- |
| Checks | `npm test`, `npm run e2e` | substitutes | ~10 min | every push and pull request, in CI |
| Smoke | `npm run smoke` | none | ~10 min | every release candidate, locally |
| Live smoke | `npm run smoke:desktop` | the machine's sign-in | ≤ 10 min | every app release candidate, locally |
| Regression | `npm run regression` | the machine's sign-in; `gpt-6-astra` for compiles | hours | regular app releases, locally |

### The checks run the journeys on the desktop's platform

- CI's journeys job runs on Linux and on macOS: the fit journeys measure real fonts, and the desktop ships on macOS first.
- The smoke stops re-running the checks: the release rules already require CI green for the exact commit, and a local repeat adds no evidence.

### The smoke installs the release fresh

- The smoke's stages are the build, the spec lint, a fresh install, and the packed-CLI user pass.
- The fresh install clones the committed tree into a scratch directory, installs it with `npm ci` on an empty npm cache, and launches both shells by the README's own commands on a scratch Spex home: `npm run start:server` is walked over its printed token URL — the page served, the seeded config valid with every template playbook, the built-in catalog and the `/code` artifacts served, adapter readiness reported for each adapter, the compiler check naming the installed copy, the Academy example seeded and parsed — and stopped by SIGTERM; `npm start` renders the desktop in acceptance mode with a screenshot and exits clean.
- The fresh install replaces the smoke's core round-trip (the same assertions now run over the installed tree) and its desktop render stage (the render happens in the clone, so the developer tree's ABI is never flipped by the smoke again).
- The scratch clone is removed on success and kept, with its path printed, on failure.

### The live smoke stays

The live desktop smoke keeps [DR-020](020-desktop-live-smoke.md)'s scope — the real Electron process, real config seeding, the example, one `/code` dispatched to a player's first live output, abort, teardown — and its retry-or-waive rule for provider-side failures.

### The regression walks the three scenarios with real agents

The regression is the journeys' live lane — the served shell on a scratch home, the machine's real adapters and Captain, assertions through the page — holding:

- A real `/code` observed to live output and aborted cleanly, as today.
- The chat-authored two-role playbook, compiled for real and registered, then **run**: a session invokes it and the turn finishes with both players engaged and the repository carrying its commit.
- A new project developed through two intents: a fresh repository with its scaffolded specs is added from the palette; the first intent is captured on the Dashboard and started, the second queued behind it; the first runs the real `/code` with its review to a settled turn, the queue hands off to the second without confirmation, the second settles; the repository's tests pass with both changes committed, and History lists both intents.
- The compile of the authored playbook runs on a roster player bound to `gpt-6-astra` at `xhigh` that the journey picks as the draft's agent, so the block-driven compile path is exercised on the agent the owner chose; the players that run playbooks and the Captain stay on `claude`.
- Each journey attaches the Captain's and the players' transcripts as evidence; a provider-side failure may be retried or waived with its reason recorded beside the tag, an app-side failure blocks the tag.

### What leaves

- From the smoke: the unit-and-integration, browser-install, journeys, core round-trip and desktop stages.
- From the manual checklist: every row a journey or suite now proves; what stays is the residue no automation sees — the native notification and the dock badge, and the packaged app as a local option.
- From the suites: a test kept only because it exists — one that repeats another test's assertion at a slower or more brittle level, or pins a shape no behavior needs — leaves when it is met; a test that is the only automated evidence of a behavior stays whatever its speed.

### Considered and declined

- Running the fresh install in CI: the desktop render needs a display and anything live needs a sign-in; CI keeps the checks and the smoke stays local.
- Running a stub-compiled playbook hermetically: the stub's runtime does nothing a session could show, so it would prove the slash menu twice.
- Compiling the pasted source for real as well: past "Use as source" the paste path and the chat path share every step, so the paste-specific part is proven hermetically and the shared part once, live.
- A playbook that reviews the interface as a fresh user, with an explorer and an editor role, instead of a checklist row: deferred.
- Where a playbook does beat a script — the release preparation itself, whose changelog review, waiver judgment and record-keeping are judgment work — the playbook's prose lives in the repository under `playbooks/`, compiled by each maintainer through Spex's own authoring workspace; compiled artifacts depend on the installed engine and are never committed.

## Consequences

- `npm run smoke` drops to about ten minutes, installs and launches the candidate exactly as a user would, and never touches the developer tree's native module.
- The regression costs hours and real model calls, so it belongs to regular releases; [DR-087](087-beta-app-releases.md) lets a beta ship on the smoke and the live smoke alone.
- The release package names the tiers and their gates; app-shell and server-shell gain the install-shape launch items; playbook-library's live compile item gains the run; dashboard and run-view gain the two-intent journey; the checklist document shrinks; CI gains a macOS journeys lane; the `e2e:live` script becomes `regression`.
