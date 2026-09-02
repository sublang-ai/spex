<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-054: Playbook 12.2 and slc 0.7 Adoption

## Status

Done

## Intent

Move the floor of [DR-037](../decisions/037-playbook-12-adoption.md) to playbook ^12.2.0 in lockstep with the global slc 0.7.0 — whose link contract imports the `renderGovernedOutcomeContract` export 12.2 introduces — with minimal change: no contract Spex binds to moved, so the work is the floor, the shipped-machine fixtures recaptured with `dev`, the slc demo re-vendored in its `Roles:` grammar, and a real compile through the protocol against the installed compiler, which CI never runs.

## Deliverables

- [x] DR-037 and DR-038 amended (floor ^12.2.0 with the slc 0.7.0 reason; the facade verdict over 12.1 and 12.2), the map row and the core's host-capabilities header following; lint-clean.
- [x] Core floor `@sublang/playbook` ^12.2.0 with the lock resolving 12.2.0; cligent ^0.24.0 unchanged; global `@sublang/slc` 0.7.0 with its nested playbook 12.2.0.
- [x] Machine fixtures for code, review, decide, and dev recaptured from the installed 12.2.0; the geometry law holds over all four.
- [x] The slc demo re-vendored from slc v0.7.0 (`Roles:` Coder/Reviewer change-and-review workflow) with the example's title and prefill intent following; playbook-library-35 reads unchanged.
- [x] The real compile check on a scratch state root, and the compile-flow fix it surfaced — bindings re-keyed onto the entry's derived role ids case-insensitively, as playbook-library-32 already required — with protocol-level coverage under playbook-library-17.
- [x] Every workspace suite, the core integration suite, and the browser journeys green; the app changelog carries the adoption.

## Tasks

1. Floor bump with the DR-037/DR-038 amendments, the map row, and the header comment.
2. Fixture recapture with `dev`, and the lateral port spread the dev machine demanded of the router.
3. Demo re-vendoring with the title and test assertions.
4. Changelog entry.
5. The re-keying fix with the shared stub `slc`, the playbook-library-17 amendment, and the integration test.
6. Full-suite verification, the real compile check, and this record.

## Verification

Facts checked against the installed 12.2.0 before coding: the exports map is 12.1's; `@sublang/playbook/host-capabilities` still lacks `acquire`, `runCohort`, and `authority`, so the by-path builder stands; the Captain snapshot stays schema 4; `slc/link.md` names `renderGovernedOutcomeContract` as a linked runtime import, and `xstate-playbook-runtime.d.ts` exports it.
`spex lint` clean; `npm install` moved only the playbook entry in the lock (12.1.0 → 12.2.0); `slc --version` prints 0.7.0 and its nested playbook is 12.2.0.
Every suite green on playbook 12.2.0 / cligent 0.24.0 (scripts 18, cli 133, core 179 of which 30 integration, ui 334, desktop 9, server 10, e2e journeys 23).
Recaptured fixtures: CODE's `runFirstPhase` now fans into six `done` branches (two to `reviewIrTask` new), review and decide differ only in descriptions, and dev is a ten-state machine whose `callCodeAfterDecide` names `reportedChildFailure` from both its `done` and `error` branches — the lateral pair that shared a port until the router spread lateral heads by port group.
Real compile check (2026-09-02, this machine): the core booted headlessly on a scratch state root with the demo config, `compile.check` found Node 25.5.0 and `slc` on PATH with `SPEX_SLC` unset, and `compile.run` was driven over the WebSocket with the re-vendored normalized text, roles Coder and Reviewer bound to `dev.coder` and `dev.reviewer`; slc compiled through the user's own slc config (claude-code, Opus, effort high) and needed three runs to finish:
- run 1 (18 min): text2gears 6m44s and optimize 1m07s succeeded, then slc's default 600 s stall watchdog aborted gears2fsm after ten minutes without agent activity — an agent-runtime limit, not a contract failure;
- run 2 (31 min, `SLC_STALL_TIMEOUT=1800`): text2gears 7m15s, optimize 54s, gears2fsm 14m56s, link, then Spex bundled the entry, validated it, and derived the roles `Coder, Reviewer` — and refused the registration because the handler lowercased the request's binding keys but compared them to the entry's case-preserved ids, a defect standing since the case-folding shim left the wrapper; playbook-library-32 already required a case-insensitive match, so the handler was fixed and covered;
- run 3 (2 s, fixed core): slc reused its recorded build history for all four phases, and the check passed whole — the generated registry passes `isValidRegistryEntry` at artifact schema 3 with contract marker 3, the config gained `workflow` with `Coder: dev.coder` and `Reviewer: dev.reviewer`, `playbook.artifacts` serves the source, the FSM, ten state ids (`idle=ready final=done park=[failed, awaitBossReply]`), and a 10-node, 36-edge machine, and `library.builtins` lists `code*, review*, decide, dev`.
Observed and left alone: slc 0.7.0 tries to emit verification tests beside its artifacts and reports "Cannot find package 'xstate'" from the library directory, where nothing installs one; the compile succeeds without them.
