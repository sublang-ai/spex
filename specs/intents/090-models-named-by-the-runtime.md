<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-090: Models Named by the Runtime

## Status

Completed on `models-named-by-runtime`, merged to `main` in 5379860 on 2026-09-29, and released in `app-v0.9.0-beta.3`.

## Intent

Implement [DR-091](../decisions/091-models-named-by-the-runtime.md): wherever Spex names an agent's model, it names the specific model the runtime reports, for every adapter whose runtime reports one.
Alongside, every model Spex itself seeds, defaults to or gives as an example names the latest of its line.

## Deliverables

- [x] Specs: DR-091 with its amendments recorded, and the settings, run-view, core-service and playbook-library items it names.
- [x] Core: `description` and `defaultModel` carried through `agent.options`, and the per-agent reported-model fold in the session summary.
- [x] UI: the shared display rule, the listbox model field, the full-width agent editor field, inherited models named by the rule, and pane chips reading the reported model.
- [x] English and Chinese catalogs whole; browser journeys driving the listbox, scanning it for accessibility and measuring its fit.
- [x] A new player lane's block, a new role assignment's neutral block and the demo configuration on `claude-opus-5-5` and `gpt-6-sol`, with the journeys that read them.
- [x] The git package's trailer example naming current models, in this repository's specs and in the scaffold with its file history.

## Tasks

1. Record DR-091, amend the items it names, and index it in the map.
2. Carry discovery's `description` and `defaultModel`, and fold each agent's reported model with the settings its call began under, with integration coverage over fixture streams and a live session.
3. Replace the model select with the listbox field under one display rule, name inherited models by it, and widen the agent editor's field, with editor coverage, catalogs, and the browser journeys moved onto the listbox and scanning it for accessibility and fit.
4. Read the reported model on the pane chips with fixture-summary coverage and catalogs.
5. Keep a reported model through effort and fast-mode changes: the fold keeps a call's adapter and model setting, and the chip compares those alone.
6. Seed the app's defaults on the latest models, with the journeys that read them.
7. Name current models in the git package's trailer example.
8. Record the change in the changelog and this record's completion.

## Verification

- `npm run build`, the root `npm test` under Node 22 as CI runs it, `npm run e2e`, and `npx spex lint`.
- The hermetic gates prove the behavior over fixture data: catalogs with descriptions and a default model, and streams whose `init` events carry `reportedModel`; Cligent 0.28, adopted with [DR-092](../decisions/092-playbook-17-1-slc-0-13-cligent-0-28-adoption.md), reports all three where the runtime does.

Verified on 2026-09-29 on the branch's final tree, over `main` at b9da36e with Playbook 17.0.0, slc 0.12.0 and Cligent 0.27.1: the root build passed under Node 22; the root test gate passed 1,275/1,275 under Node 22 (34 script, 133 CLI, 355 core, 726 UI, 16 desktop and 11 server tests); the hermetic journeys passed 65 of 66 in Chromium on Node 25, the compiled example skipping as on `main` for want of its captured fixture; the journeys typecheck; the core, UI and desktop catalogs are whole; `spex lint` passed.
Verified again on 2026-09-29 on the toolchain [DR-092](../decisions/092-playbook-17-1-slc-0-13-cligent-0-28-adoption.md) adopts, Playbook 17.1.0, slc 0.13.0, Cligent 0.28.0 and the agent SDKs Cligent 0.28 tests, from a fresh `npm ci`: the root build passed under Node 22; the root test gate passed 1,275/1,275 under Node 22 (34 script, 133 CLI, 355 core, 726 UI, 16 desktop and 11 server tests); the hermetic journeys passed 65 of 66 in Chromium on Node 25, the compiled example skipping for want of its captured fixture; the journeys typecheck; the core, UI and desktop catalogs are whole; `spex lint` passed.
Verified live on 2026-09-29 with the server shell from this branch on a scratch Spex home, Cligent 0.28.0 and the locked Claude Agent SDK 0.3.284 and Codex SDK 0.159.0, with the machine's signed-in agents:
the Captain's model listbox read Claude's rows by name and specific model with the runtime's descriptions ("Opus 5.5 · claude-opus-5-5", "Most capable for ambitious work"), its Provider default row named the default the user's Claude settings select (`opus[1m]`), and Codex's rows carried their descriptions under a Provider default of `GPT-6-Astra`, the model Codex's own configuration sets;
with the Captain on the provider's default, one real turn ran, and the Captain's chip then read `claude-opus-5-5 @ high`, its title and accessible name keeping "set to provider default @ high, runtime reports claude-opus-5-5".
