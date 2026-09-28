<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-089: Every Fresh-User Scenario Walked for Real

## Status

Accepted (2026-09-28) on an audit of [DR-086](086-tests-in-tiers.md)'s delivery, which found each of the three fresh-user scenarios short of a real walk.
Amends [DR-086](086-tests-in-tiers.md), which remains accepted, in what the smoke and the regression walk and how their failures are judged: the live smoke also runs in the installed shape, the regression compiles the app's own example and starts its project where a fresh user does, the regression's observed-and-aborted `/code` leaves, and CI runs a compiled playbook on substitute agents.

## Context

- The owner's scenarios ([DR-086](086-tests-in-tiers.md)): (a) compile a new simple playbook and run it, by chatting or by pasting its source; (b) start from a new project and develop through a few typical cycles with the existing playbooks; (c) install in a brand-new environment and check that all is working.
- (c): the fresh install launches both shells from a fresh clone but calls no agent; the live smoke calls one, but only from the developer tree, whose modules, build outputs and native module a fresh user never has.
- (a): the only real compile is of a source a model authored in chat; on the first regression the bundled compiler refused that machine three times after the bounded relay, a model outcome that says nothing of the app's compile, registration or run, and no run of a compiled playbook has passed anywhere, live or hermetic.
- (a): the app's own example, placed by the authoring workspace's Prefill, is a fixed source the app ships beside the compiler it ships; the compiler refusing it is the app failing.
- (b): the regression's project is a repository the harness built and added with Add, while a fresh user creates one from the palette with specs scaffolded; it runs `/code` twice, never the `/decide` the README pairs with `/code`, and fails outright when a player asks the Boss a question, which real cycles do.
- The regression's observed-and-aborted `/code` asserts what the live smoke asserts, at a slower tier — the kind of test DR-086 itself retires.
- DR-086 waives provider-side failures and blocks on app-side ones; a compiler refusal is neither, and went unclassified.

## Decision

### (c) The live smoke in the installed shape

- `npm run smoke -- --live` appends a `live` stage to the smoke: the live desktop smoke ([DR-020](020-desktop-live-smoke.md)) run inside the fresh install's clone on the machine's signed-in agents.
- An app tag, beta or regular, runs `npm run smoke -- --live`, which stands for both the smoke and the live smoke; a CLI tag runs the smoke without it.
- `npm run smoke:desktop` stays the developer tree's live smoke, for development.

### (a) A deterministic compile, and a compiled run in CI

- The regression pastes the app's own example source, compiles it for real on the compile player, registers it on the Register form's defaults, and runs one turn of it to its finish with both players engaged.
- The chat-authored two-role changelog journey stays, as the harder case.
- CI proves the run path of a compiled playbook on every commit: a fixture compiled by the real `slc` is committed, regenerated whenever the playbook engine changes generation, and registered and run on substitute agents in the hermetic journeys.

### (b) The project a fresh user starts

- The regression creates its project from the palette with specs scaffolded, captures a first intent `/decide` and a `/code` queued behind it, and sees each settle after its review, the queue hand off between them, and History list both.
- A player's question, if one is asked, is answered through the Captain, as the Boss would.
- CI proves the handoff on every commit: a hermetic journey settles one intent on substitute agents and sees the queued second dispatched.

### What leaves

The regression drops its observed-and-aborted `/code`: the live smoke asserts the same, at the tier every app tag runs.

### Failure classes

For the live smoke and the regression:

| Failure | Outcome |
| --- | --- |
| Provider-side: a refusal, a quota, an outage | retried, or waived with its reason recorded beside the tag |
| The bundled compiler refusing the app's own example after the bounded relay | blocks the tag |
| The compiler refusing the chat-authored source after the bounded relay — a model outcome | may be waived, the compiler's output attached and an issue filed against `slc` |
| Any other app-side failure | blocks the tag |

### Considered and declined

- Keeping the chat-authored compile as the only live compile: DR-086 declined compiling the pasted source as well, since past "Use as source" both paths share every step; they do, but only a fixed source separates the app's failures from the model's.
- Never committing compiled output ([DR-086](086-tests-in-tiers.md)): the rule stands for the playbooks maintainers compile, whose output must follow the engine each one installs; a test fixture is pinned to the engine the repository installs, and regenerating it with each engine generation keeps the two together.
- A hermetic run of a stub-compiled playbook: declined by DR-086 and still declined — only a real compile's machine proves the run path.

## Consequences

- An app tag's local gates are `npm run smoke -- --live` and, for a regular tag, the regression and the manual residue.
- The release package gains the smoke's `live` stage, the live smoke run through it, the regression's journeys, and the failure classes.
- The playbook library gains the example's live journey and the hermetic compiled-fixture journey; the dashboard and run view's live journey starts from Create with `/decide` then `/code`, a hermetic handoff journey joins it, and the run view's observed `/code` journey leaves; the release checklist and the release playbook follow.
