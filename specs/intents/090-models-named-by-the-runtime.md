<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-090: Models Named by the Runtime

## Status

In progress on `models-named-by-runtime`.

## Intent

Implement [DR-091](../decisions/091-models-named-by-the-runtime.md): wherever Spex names an agent's model, it names the specific model the runtime reports, for every adapter whose runtime reports one.
Alongside, every model Spex itself seeds, defaults to or gives as an example names the latest of its line.

## Deliverables

- [ ] Specs: DR-091 with its amendments recorded, and the settings, run-view, core-service and playbook-library items it names.
- [ ] Core: `description` and `defaultModel` carried through `agent.options`, and the per-agent reported-model fold in the session summary.
- [ ] UI: the shared display rule, the listbox model field, the full-width agent editor field, inherited models named by the rule, and pane chips reading the reported model.
- [ ] English and Chinese catalogs whole; browser journeys driving the listbox, scanning it for accessibility and measuring its fit.
- [ ] A new player lane's block, a new role assignment's neutral block and the demo configuration on `claude-opus-5-5` and `gpt-6-sol`, with the journeys that read them.
- [ ] The git package's trailer example naming a current model, in this repository's specs and in the scaffold with its file history.

## Tasks

1. Record DR-091, amend the items it names, and index it in the map.
2. Carry discovery's `description` and `defaultModel`, and fold each agent's reported model with the settings its call began under, with integration coverage over fixture streams and a live session.
3. Replace the model select with the listbox field under one display rule, name inherited models by it, and widen the agent editor's field, with editor coverage, catalogs, and the browser journeys moved onto the listbox and scanning it for accessibility and fit.
4. Read the reported model on the pane chips with fixture-summary coverage and catalogs.
5. Seed the app's defaults on the latest models, with the journeys that read them.
6. Name a current model in the git package's trailer example.
7. Record the change in the changelog and this record's completion.

## Verification

- `npm run build`, the root `npm test` under Node 22 as CI runs it, `npm run e2e`, and `npx spex lint`.
- Cligent's release that reports the three facts is not yet adopted, so the behavior is proven over fixture data: catalogs with descriptions and a default model, and streams whose `init` events carry `reportedModel`.
