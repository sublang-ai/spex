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
- A violation asks for no trust, since it replays on the reader's own code; a pass does, and a checker the reader has never heard of gives no reason for it.
- One agent's single reading of an item is the least defended step.
  A shipped product samples several formal readings of each requirement, groups the equivalent ones and asks its user where they disagree [[5]].
- A service's serious defects appeared only under particular timing of faults, found by running the production code under controlled faults [[6]].
- Agents now produce machine-checked proofs that compiled library entry points exit without memory-safety errors or failed assertions, for single-threaded programs and at hundreds of millions of tokens for a proof [[7]]; that work does not address the behavior of a running service.
- An agent's derivation is a judgment; a check that guards against agents cannot itself depend on one each time it runs.
- Considered and declined:
  - a model checker, solver or prover of Spex's own: none could earn the trust a pass asks for;
  - a model checker of communicating machines as the first engine: closer to how services are described and able to read logs with the same monitors, but a heavier toolchain and a name fewer readers know;
  - translating items into a temporal logic that people review: [DR-243](243-guards-protect-critical-behavior-on-every-change.md) leaves no such reading to a person;
  - proving the project's code as the core technique: such proofs reach single components at high cost [[7]], and the recorded defects sit where components meet;
  - taking over a project's clock, network and storage to simulate it: too much to ask of a project adopting one guard.

## Decision

- A project holds one **binding** for each interface its guards reach: how each event the items its guards depend on name is caused, and how each effect they name is observed, through the application's own API, command line or test harness.
  - An agent may draft a binding; a person approves it, what counts as the observation above all, and every change to it.
  - One binding serves every guard on its interface.
  - A binding observes effects and never computes an expected outcome by calling the application's own logic.
  - A binding declares what it controls beyond the order of requests: the clock, a crash and restart, a timeout, a duplicate or reordered delivery.
    Where a guard's assertion concerns an event or a timing its binding cannot cause, a run a check drives without observing that event is inconclusive, and a sampled result names what the binding did not control.
- What Spex derives from an item is drafted from the item and every item its meaning depends on ([DR-243](243-guards-protect-critical-behavior-on-every-change.md)) before the drafting agent reads the implementation, which it reads only to write the binding.
- Spex derives several readings of an item independently and compares them.
  - One sequence that readings judge differently is put to a person as an example to mark permitted or forbidden.
  - A reading that an approved example contradicts is dropped, and the comparison repeats while a disagreement remains.
  - A guard is refused while the readings left disagree, within the bounds compared, on any sequence.
  - The readings left are kept with the guard, and a result counts only where they agree on every sequence it rests on: each judges a single sequence a run or a log supplies, and their comparison within a search's bounds precedes that search.
  - A sequence they judge differently establishes no result, a violation included, until a person marks it; found by a check that is not required, it is reported and decides nothing until then.
- Each action of a derivation carries the name of the item's event, or of the fault its binding declares, that it stands for, so a sequence a tool reports is printed in those words by that naming and by no agent.
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

- Generating, searching, solving and proving run on established tools a reader can look up, and every result names its tool and version:

  | Technique | Tool |
  | --- | --- |
  | generated sequences | fast-check, run outside the application through the binding |
  | model search | TLA+ checked by TLC, needed only where a project requires that check |
  | solver | Z3 |
  | proof | any externally checked proof, with the prover and what it trusts named |

- Spex builds no model checker, solver or prover of its own: a result of checked within bounds, of a conflict in the items or of a proof comes only from a named tool.
- A technique joins Spex only after it has caught, in a real project, a past or held-out defect of the code or conflict in the items that the project's existing tests did not.
- Each requirement has one stored formal form, in a format of Spex's own, of states, events and conditions, whatever language the project is written in.
  - It is derived, never authoritative, and no surface asks a person to read it; a specialist may audit it and what is generated from it.
  - The model checker's input, the solver's question and the check of a generated sequence are generated from it by fixed rules and no agent.
  - Spex itself evaluates one given sequence against it: an approved example, a run a check drove, a recorded log.
- Where Spex generates a tool's input, that tool's result other than a violation or a conflict counts for a guard only where the input, run by that tool, admits each permitted example, reaching the behavior it shows, and rejects each forbidden one.
- Another established tool may replace one named above behind the same stored form; the replacement is a change to every guard it serves ([DR-243](243-guards-protect-critical-behavior-on-every-change.md)) and joins by the rule a technique joins by.
- A violation found in the model and not reproduced through the binding is reported as such and never as a defect of the code.
- Observed effects are a violation on the implementation only where they are what the assertion forbids; effects that differ from the model and that the assertion permits are a disagreement with the model, to be settled in the code, the derivation or the binding.
- A recorded log supports a result only for the events it identifies, orders and holds completely: a violation that depends on an event's absence needs a log complete for that event, and a log short of that is inconclusive.
- A result drawn from a recorded log or an external prover names the exact events or artifact it read and the revision of the code that produced them, and is a result for that revision alone, deciding nothing for another.
- An external prover's result counts for a guard only where the property it states, its assumptions and its target match the guard's assertion, the assumptions the guard rests on and the code its binding reaches; a proof about a model is a result on the model, and one that matches less is inconclusive.
  A person approves that match with the proof's source, since no example can be run against a proof.
- A change runs every guard one of whose inputs ([DR-243](243-guards-protect-critical-behavior-on-every-change.md)) it changes.
  Where Spex cannot tell what a change reaches, it runs every guard.
- A run made for a change keeps to bounds that fit a review; a deeper search runs apart from it and reports the same results.

## Consequences

- One mechanism serves a project in any language: the tools run outside the application, and only the binding is the project's.
- The binding is the cost of a first guard and the saving of every later one on its interface.
- A bounded search proves nothing beyond its bounds, and establishes that something is never done, not that something eventually is.
- A stronger engine, a prover included, can be added without a person learning a notation or a result changing its meaning.
- Spex's own rules from the stored form to a tool's input are trusted no further than the approved examples and the kept faults, which pass through the same rules, show.
- A guard that requires only sampled runs needs nothing installed beyond Spex; one that requires a model search needs the model checker's Java runtime.
- Generated sequences vary the order of requests and nothing inside the application's process, so a race within a service goes unexplored unless its binding controls the schedule.
- A project with no interface through which an effect can be observed cannot guard that effect until it has one.
- An agent's mistaken derivation is caught by a disagreement among readings, by the examples a person approved or by the planted faults, or not at all; no check reads the derivation for sense.

## References

[1]: https://arxiv.org/abs/2006.00915 "Davis et al. — eXtreme Modelling in Practice (PVLDB 2020)"
[2]: https://www.amazon.science/publications/using-lightweight-formal-methods-to-validate-a-key-value-storage-node-in-amazon-s3 "Bornholt et al. — Using Lightweight Formal Methods to Validate a Key-Value Storage Node in Amazon S3 (SOSP 2021)"
[3]: https://arxiv.org/abs/2507.00877 "VLTL-Bench — natural language to temporal logic, with and without grounding"
[4]: https://cs.stanford.edu/~trippel/pubs/mendoza_ICSE26.pdf "Mendoza et al. — Automating Requirements Formalization (ICSE 2026)"
[5]: https://kiro.dev/blog/deep-spec-analysis/ "Kiro — requirements analysis by sampled formalizations and a solver (2026)"
[6]: https://www.datadoghq.com/blog/ai/harness-first-agents/ "Datadog — an agent-built system checked by simulation on production code (2026)"
[7]: https://www.anthropic.com/research/formal-verification "Anthropic — machine-checked proofs of open-source library entry points (2026)"
