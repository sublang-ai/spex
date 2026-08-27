<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-034: Playbook 9 Adoption

## Status

Accepted.
Raises the [DR-032](032-session-players.md) playbook floor to 9, amending [DR-023](023-runtime-compatibility-from-cligent.md); the cligent floor is unchanged.

## Context

- Core consumed `@sublang/playbook` ^8.0.0 while the released toolchain reached playbook 9.0.0.
- Playbook 9.0.0 depends on `@sublang/cligent` ^0.22.0 — the floor [DR-032](032-session-players.md) already set — so this adoption moves no runtime floor and needs no readiness change ([DR-024](024-app-supplied-agent-runtimes.md)).
- The contracts Spex binds to are unchanged between 8.0.0 and 9.0.0: the captain shell's and the built-in registries' type declarations are byte-identical, and the export map is the same, so the shell instantiation of [[core-service-17](../packages/core-service.md#core-service-17)] and the `from:` specifiers of [DR-015](015-reference-content.md) carry over untouched.
- What 9.0.0 changes that reaches Spex is data, not API: the CODE machine gains a `reportedReviewFailure` final state, a terminal outcome may carry an optional `stateDescription`, and the DECIDE playbook exports `pendingQuestionsForState`.
  The observer-interface changes in playbook's own xstate runtime sit below cligent and never surface at Spex's seam.

## Decision

- Core's floor rises to `@sublang/playbook` ^9.0.0; `@sublang/cligent` stays ^0.22.0.
- No product code changes: state ids were never part of Spex's load contract — the shell derives park, idle, and final states from runtime tags and quiescence, and the run view humanizes an unknown state id rather than matching a closed set ([DR-028](028-run-machine-view.md)).
- The shipped-machine fixtures are recaptured from the installed playbook, so the drawing's geometry law [[run-view-77](../packages/run-view.md#run-view-77)] is checked against the nine-state CODE machine that now ships rather than the eight-state shape it replaced.

## Consequences

- CODE now declares two final states, `done` and `reportedReviewFailure`; the compiler's final-state derivation already prefers `done` when it is among the finals, so the added final changes no artifact.
- A CODE run settling in `reportedReviewFailure` draws as an ordinary completion: the run view keys its failure tone to the `failed` state id and to a reported failure outcome, and this state is neither.
  Whether a failure-named final deserves its own tone in the aliveness grammar ([DR-031](031-machine-call-tree.md)) is left open here — it is a question about the grammar, not about this floor move.
- The dev harness's scripted CODE trace still narrates the eight-state shape; it gates nothing, and it drifts further from the machine it imitates.
