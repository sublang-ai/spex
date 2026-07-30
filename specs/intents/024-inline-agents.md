<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-024: Inline Agents Adaptation

## Status

Done

## Intent

Adopt playbook 3.1.0 and slc 0.2.0 per [DR-019](../decisions/019-inline-agent-configuration.md): profile-less inline agent configuration end to end — core migration and composition, protocol v4, the shared agent editor UX, the single-vendor block template, retired vendored sources, and the slc 0.2 compile path.

## Deliverables

- [x] `packages/core` on `@sublang/playbook` ^3.1.0; captain options carry the captain's adapter; profiles-era configs migrate at load per the launcher semantics with backup and hard-error case.
- [x] Validation: inline blocks + scalar normalization, runtime-bounded adapter set (kimi included), adapter-scoped efforts from the embedded runtime's vocabulary; profile keys rejected in edits.
- [x] Protocol v4: agent summaries and block-taking ops replace the profile surface; adapter-keyed readiness entries with positions; merge-patch captain/player edits preserving hand-written fields.
- [x] Template rewritten to explicit single-vendor inline blocks (commented second-vendor example); dev-core fake config follows.
- [x] Shared AgentEditor/AgentChip; Settings Captain editor + adapter readiness panel; Library role rows, compile form, and builtin add-flow on the editor with neutral defaults and "same as Captain"; Captain-home popover carries the full editor; no shorthand concept anywhere in the UI.
- [x] Vendored playbook sources deleted; sources resolve from the installed package; compile drops the explicit link target and refuses empty derived roles with slc 0.2 guidance.
- [x] Stale copy fixed (playbook 2.0 wording, player-ref comments); spec amendments across settings/core-service/playbook-library/run-view/app-shell plus DR-002/004/007/009/011/014/15 pointers, desktop-session composition, and map rows.

## Tasks

1. Bump the playbook dependency, add the captain-adapter emission with its Codex-captain test, and drop the profiles-collision rule.
2. Implement load-time migration with the enumerated cases and backup naming; unit-test parity including the untouched-file hard error.
3. Rework validation to runtime-bounded adapters and adapter-scoped efforts; normalize scalars; reject retired keys in edits.
4. Cut protocol v4: agent summaries, block ops, adapter-keyed readiness, renamed readiness payload; rewrite config-edit as merge patches with round-trip tests.
5. Rewrite the template and dev-core config as inline blocks; update the seeding tests.
6. Retire vendored sources and their staging; point builtins and artifacts at the installed package.
7. Update the compile path for slc 0.2: bare invocation, empty-roles refusal, reworded stale copy.
8. Build the shared AgentEditor/AgentChip and sweep Settings, Captain home, Library, compile, and add flows; rewrite the affected UI suites re-establishing their coverage intents.
9. Amend the spec packages and decision pointers; update map rows; lint clean.

## Verification

- Root build, tests, and `spex lint` pass.
- A profiles-era config file composes after one load, with a backup written beside it and comments intact; a `profile` naming a missing entry fails composition with the file untouched.
- A Codex captain's composed options carry the captain adapter, and a fake-shell test shows control calls without a tool list.
- A kimi player validates only `off`/`on` efforts; an unknown adapter id fails composition with the runtime's wording.
- The seeded first run reaches a valid config whose every agent is an explicit Claude block; no UI surface renders the word "shorthand".
