<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-244: A Guard Is Checked on the Implementation

## Status

Proposed (2026-11-21), with [DR-243](243-guards-protect-critical-behavior-on-every-change.md), whose guards it says how to check.

## Context

- A guarded project may be written in any language, so no check can assume the project's own.
- A model checked alone finds a sequence its model allows and says nothing of the code: a change to the code can break the rule while the unchanged model still passes.
  Where a team could not tie its model to observable events of the running system, the work was abandoned [[1]]; where the models lived in the build and drove tests of the code, it held [[2]].
- Turning a requirement's words into a formal property is two tasks of unequal difficulty.
  The sentence's structure translates well; naming which state and which event of the program a word means is where measured accuracy falls [[3]].
  Showing a person the sequences on which two readings disagree is the published answer to the second [[4]].
- The behaviors worth a model are small: a few actors, a few events, a crash.
  A plain search over such a model's reachable states, within stated bounds, already runs in this toolchain's own tests.
- An agent's derivation is a judgment; a check that guards against agents cannot itself depend on one each time it runs.
- Considered and declined:
  - an external model checker as the first engine: the link from an item to an observation in running software is the unproven part, and the search is not;
  - translating items into a temporal logic that people review: [DR-243](243-guards-protect-critical-behavior-on-every-change.md) leaves no such reading to a person;
  - proving the project's code as the core technique: provers are bound to single languages, and the recorded defects sit where components meet;
  - taking over a project's clock, network and storage to simulate it: too much to ask of a project adopting one guard.

## Decision

- A project holds one **binding** for each interface its guards reach: how each event the items its guards cite name is caused, and how each effect they name is observed, through the application's own API, command line or test harness.
  - An agent may draft a binding; a person approves it, what counts as the observation above all, and every change to it.
  - One binding serves every guard on its interface.
- What Spex derives from an item is drafted from the item and the items it cites before the drafting agent reads the implementation, which it reads only to write the binding.
- A derivation is stored with the project, recorded against the versions of the items and the binding it was derived from, and derived again only when one of them changes or a person approves its correction.
- No agent takes part in a check's run, and what a run generates is fixed by its recorded seed.
  - A violation records the concrete actions, the initial conditions and the effect observed.
  - Its replay is promised to reproduce it only where the binding controls the schedule and the state the violation depends on; elsewhere the replay repeats the attempt and reports whether the violation recurred.
- Spex checks a guard by these techniques, adopted in this order:

  | Order | Technique | Establishes |
  | --- | --- | --- |
  | 1 | generated inputs and sequences run through the binding, a failing case reduced to a smallest one | sampled on the implementation |
  | 2 | a small state model searched within stated bounds; each violating sequence and a sample of permitted ones run through the binding, their effects held to the assertion and compared with the model | checked within bounds, of the model; sampled or violated on the implementation, or a disagreement with the model, of the code, each reported apart |
  | 3 | a solver over the items themselves and over decision rules | conflict in the items; checked within bounds where it finds none |
  | 4 | the same properties read over recorded logs | sampled or violated on the implementation, in a run no check drove |
  | 5 | an external prover's result for one component | proved under assumptions |

- A technique joins Spex only after it has caught, in a real project, a past or held-out defect of the code or conflict in the items that the project's existing tests did not.
- The state model is in one format of Spex's own, of states, events and conditions, whatever language the project is written in.
  - It is derived, never authoritative, and no surface asks a person to read it.
  - Spex's own bounded search explores it.
  - Another engine may replace that search behind the same format and the same results, changing no surface.
- A violation found in the model and not reproduced through the binding is reported as such and never as a defect of the code.
- Observed effects are a violation on the implementation only where they are what the assertion forbids; effects that differ from the model and that the assertion permits are a disagreement with the model, to be settled in the code, the derivation or the binding.
- A recorded log supports a result only for the events it identifies, orders and holds completely: a violation that depends on an event's absence needs a log complete for that event, and a log short of that is inconclusive.
- A result drawn from a recorded log or an external prover names the exact events or artifact it read and the revision of the code that produced them, and is a result for that revision alone, deciding nothing for another.
- An external prover's result counts for a guard only where the property it states, its assumptions and its target match the guard's assertion, the assumptions the guard rests on and the code its binding reaches; a proof about a model is a result on the model, and one that matches less is inconclusive.
- A change runs every guard one of whose inputs ([DR-243](243-guards-protect-critical-behavior-on-every-change.md)) it changes.
  Where Spex cannot tell what a change reaches, it runs every guard.
- A run made for a change keeps to bounds that fit a review; a deeper search runs apart from it and reports the same results.

## Consequences

- One mechanism serves a project in any language: the model is Spex's, and only the binding is the project's.
- The binding is the cost of a first guard and the saving of every later one on its interface.
- A bounded search proves nothing beyond its bounds, and establishes that something is never done, not that something eventually is.
- A stronger engine, a prover included, can be added without a person learning a notation or a result changing its meaning.
- A project with no interface through which an effect can be observed cannot guard that effect until it has one.
- An agent's mistaken derivation is caught by the examples a person approved and the planted faults, or not at all; no check reads the derivation for sense.

## References

[1]: https://arxiv.org/abs/2006.00915 "Davis et al. — eXtreme Modelling in Practice (PVLDB 2020)"
[2]: https://www.amazon.science/publications/using-lightweight-formal-methods-to-validate-a-key-value-storage-node-in-amazon-s3 "Bornholt et al. — Using Lightweight Formal Methods to Validate a Key-Value Storage Node in Amazon S3 (SOSP 2021)"
[3]: https://arxiv.org/abs/2507.00877 "VLTL-Bench — natural language to temporal logic, with and without grounding"
[4]: https://cs.stanford.edu/~trippel/pubs/mendoza_ICSE26.pdf "Mendoza et al. — Automating Requirements Formalization (ICSE 2026)"
