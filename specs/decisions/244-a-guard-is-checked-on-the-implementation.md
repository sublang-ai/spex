<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-244: A Guard Is Checked on the Implementation

## Status

Proposed (2026-11-21), together with [DR-243](243-guards-protect-critical-behavior-on-every-change.md), which defines a guard and its pass rule.

## Context

A correct model can describe a faulty service.
Teams have found that the hard part is connecting model events to observations of running code [[1]] [[2]].
Spex therefore checks the code through an interface the project already uses.

## Decision

### From GEARS to a check

Spex derives several independent readings from the guard and the items that give it meaning, before the drafting agent sees the implementation.
When readings disagree, a person marks one distinguishing sequence at a time as permitted or forbidden [[3]].
Spex drops contradicted readings and repeats while they disagree.
If none survive, the items or derivation need correction before the guard can stand.

Spex retains the surviving readings in one internal format for states, events and conditions, tied to the approved items and binding.
It derives them again when those inputs change or a person approves a correction.
The items remain authoritative, and a specialist can inspect the derivation and generated tool inputs.
Fixed rules translate the stored form for each tool and map its findings back to GEARS events and declared faults.
Spex can evaluate a single trace directly, including an example or log.
No agent takes part in a verification run.

A result requires agreement among the surviving readings across the scope it claims.
For a search, Spex establishes agreement within the bounds before searching.
For a run or log, every selected case must receive a verdict before the check can count as clean.
An undecided case goes to a person and makes the check inconclusive.
An observed effect all readings forbid still establishes a violation even if another case is undecided.

### Connecting to the code

A **binding** tells Spex how to cause each event and observe each effect through an API, command line or test harness.
One approved binding serves the guards on that interface.
An agent may read the code to draft it, but the expected outcome comes from the items.
The binding declares which conditions it controls, such as the clock, delivery order or a restart.
A sample identifies uncontrolled conditions and is inconclusive if it misses an event or timing the assertion depends on and the binding cannot cause.
The recorded seed fixes the generated actions.
Replay reproduces the failure when the binding controls the relevant schedule and state, and otherwise reports whether it recurred.

### Which tools to use

Adopt the techniques in this order, using established tools for generation, model search, rule analysis and proof.
Only a named checker, solver or prover can establish a bounded result, an item conflict or a proof.

| Technique | What Spex checks |
| --- | --- |
| Generated runs with fast-check | Drive the real code through the binding and shrink a failing sequence for replay. |
| Finite model search with TLA+ and TLC | Explore the model within the chosen bounds. Run each counterexample and a sample of permitted sequences on the code and compare their effects with the assertion and model. |
| Rule analysis with Z3 | Look for contradictory outcomes or a missing decision where the items require one. |
| Recorded runs | Check the same assertion against observed events. A claim about a missing event requires a log complete for that event. |
| External proofs | Import a checked proof for a component. Record its prover, target and assumptions, including what the prover trusts. |

### Checking the evidence

When Spex translates a guard for a tool, a clean result counts only if that tool correctly classifies every approved example using the same definitions, assertion, assumptions and bounds as the actual check.
A permitted example must reach its stated effect.
A forbidden example must reach the legal steps preceding the forbidden action or effect under its stated conditions, and the assertion must reject the offending step.
For example, an author can request approval of their own submission, but a grant to that author must fail the assertion.
If the items require a response, the model must also admit a permitted response to that request.
A search may neither assume its conclusion nor use the assertion under test to prune the behavior it explores.
For a solver, examples are separate queries over the same rules as the conflict query.
Failure to validate the translation is inconclusive unless the underlying evidence independently establishes a violation or an item conflict.

Recorded evidence identifies the events checked, their order and the code revision that produced them.
An incomplete record is inconclusive wherever the missing information matters.
An imported proof identifies its exact artifact and revision.
A person approves the source and how the proof's property, assumptions and target match the guard.
Fresh evidence can reuse that approval only while the match holds.
A proof about a model counts only for that model, and a partial match is inconclusive.
A log or proof counts only for its own revision, even when a later change skips that guard.

## Consequences

Sampled checks need only Spex, while projects opting into TLC also need Java.
The binding is reusable, but effects outside its reach cannot be guarded through it.
A finite safety check says how far Spex searched and cannot establish eventual progress.
Change checks stay small enough for review, with deeper searches reported separately.
A new technique or replacement tool qualifies only by catching a past or held-out defect or item conflict missed by a real project's tests.
Replacing a tool changes every guard that uses it.

## References

[1]: https://arxiv.org/abs/2006.00915 "Davis et al. — eXtreme Modelling in Practice"
[2]: https://www.amazon.science/publications/using-lightweight-formal-methods-to-validate-a-key-value-storage-node-in-amazon-s3 "Bornholt et al. — Using Lightweight Formal Methods to Validate a Key-Value Storage Node in Amazon S3"
[3]: https://cs.stanford.edu/~trippel/pubs/mendoza_ICSE26.pdf "Mendoza et al. — Automating Requirements Formalization"
