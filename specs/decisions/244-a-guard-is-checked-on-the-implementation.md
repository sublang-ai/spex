<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-244: A Guard Is Checked on the Implementation

## Status

Accepted (2026-11-25); revised (2026-11-27).
Amended by [DR-252](252-a-guard-is-kept-beside-the-code.md).

## Context

A guard's rule and its cases are plain words ([DR-243](243-guards-protect-critical-behavior-on-every-change.md)).
To check them on running code, Spex needs two more things from the guard's author.
One is the items in a form a tool can check.
The other is a way to drive the code and see what it did.
Either can be wrong while every check stays green.
Teams have found that the hard part is connecting a model's events to observations of running code [[1]] [[2]].
A check that tries some sequences of events says nothing about the ones it did not try.

A sequence that breaks a rule gives reviewers something to inspect, while a clean check asks them to trust the engine that made it.
Spex therefore has no checking engine of its own.
It rests on TLA+ and its model checker TLC [[4]].
Teams have used them on production systems, and one tested its code against every behavior of a model that TLC checked [[1]].

Considered and declined:

- a search and an expression language of Spex's own: they have no record others can trust;
- generated sampling, which draws sequences of events at random: a pass then depends on luck, and it establishes nothing about the sequences not drawn;
- a language of ours compiled to TLA+: a reader would have to trust the compiler, where every judgement on TLA+ itself is made by TLC on text a specialist can read and run with the standard tools;
- recorded runs checked against the rule: a log is a sample of what happened, and it holds no sequence that did not occur.

## Decision

This record decides how Spex checks a guard, whose results and pass rule are those of [DR-243](243-guards-protect-critical-behavior-on-every-change.md).
A guard's items are written in TLA+, and TLC makes every judgement on them.

### The binding drives the code

A **binding** connects Spex to the code through an interface the project already uses, such as an API, a command line or a test harness.
Its **declaration** lists each **event** it can cause, the event's **params**, which are the values it is caused with, and its **effect**, which is what is observed afterwards.
The declaration gives every param and effect a finite set of values, in a declared order.
Its **module** is code that causes each event on the real code and reports the effect.

The first guard's binding, `installs`, declares one event, `install`.
Its params say which packages are selected and which packages' releases provide a `kit` spec.
Its effect says whose copy stands at `specs/packages/kit.md` afterwards and which packages were reported blocked.
Packages are drawn from three declared names, listed in order of `<org>`.

A **step** is one event with its params and an effect.
The effect is stated in a case, given by the model, judged by the rule or observed on the code, and every text says which.
A **sequence** is steps in order from a fresh start.

One binding serves every guard on its interface.
An agent may read the code to write the module, but what the code should do comes from the items.
Each sequence starts fresh, and whatever a check depends on, such as a clock or a restart, is an event the binding causes.

### A translation is a TLA+ file

A **translation** is the guard's items written in TLA+, one file.
It is written over the **declaration in TLA+**, a file Spex generates from the binding's declaration: the values in their declared order, every event with its params, and every effect an event is declared to give.
It defines seven operators with fixed names.

| Operator | Says |
| --- | --- |
| `Start` | the model's starting state |
| `Legal(s, e)` | the event `e` can happen in state `s` at all |
| `Effect(s, e)` | the one effect the items require `e` to give in `s` |
| `After(s, e)` | the state after it |
| `When(e)`, `While(s, e)`, `Shall(s, e, f)` | the rule, clause by clause as its GEARS item reads |

The first four are the **model**: what the items say each event gives, which is a start and, for each legal event, one effect and the state after it.
A model's state is the translation's own.
The last three are the rule.
For any step a translation answers four questions, compared in this order.

| Question | Meaning |
| --- | --- |
| Is the event **legal**? | The event can happen in this state at all, as a refund cannot before a charge. An event that is not legal is not tried on the code; it is never a violation. |
| What is **the model's effect**? | The one effect the items require the event to give in this state. |
| Does the rule **apply**? | The rule has something to say about this step: `When` and `While` hold. |
| Is an effect **forbidden**? | The rule applies and `Shall` is false of the effect. |

A translation is limited so that TLC alone judges it, the same way every time.

- It loads only the declaration in TLA+ and four files that come with TLC: `Naturals`, `Integers`, `FiniteSets` and `Sequences`.
- It declares no constant and no variable, assumes nothing and instantiates no other TLA+ file.
- It speaks of the state it is given and never of the next one.
- It holds no `CHOOSE`: a choice among declared values goes by their declared order, so no effect depends on TLC's internal order.
- Above each branch, its drafter puts the ID of the item the branch translates in a comment, so the model maps to items as `When`, `While` and `Shall` map to the rule.

The first guard's model follows the items on placing specs.
A standing copy stays while its package is still selected and its release still provides the spec; otherwise the first selected package by `<org>` whose release provides the spec is placed.
The rule applies to an install where a copy stands, its package is still selected and its release still provides the spec.
An effect is forbidden there unless that package's copy still stands afterwards and the packages reported blocked are exactly the other selected packages whose releases provide the spec.

### The cases are checked without the code

TLC evaluates every case's steps ([DR-252](252-a-guard-is-kept-beside-the-code.md)) under every translation, and each translation must allow each permitted case and forbid each forbidden case.

- A translation **allows** a permitted case where every step is legal, its model gives each effect field the step states, and no step is forbidden.
- It **forbids** a forbidden case where the steps before the last go so and, at the last step, the event is legal, the rule applies, some declared effect agrees with the stated fields, and every such effect is forbidden.
- Under every translation the rule must apply at some step of at least one permitted case, so the cases show the protected behavior happening.

### Translations are compared with each other

A translation is drafted before its drafter sees the code, from what [DR-252](252-a-guard-is-kept-beside-the-code.md) lists.
Two or more are drafted independently, and a guard with one does not pass ([DR-243](243-guards-protect-critical-behavior-on-every-change.md)).
TLC model-checks all of them side by side, each in its own state: at every step any of them reaches, they must give the same four answers, with forbidden compared for every declared effect.
The declared values are finite, so the comparison is complete when TLC ends with no state left.

TLC's shortest sequence to a difference is the **distinguishing sequence**.
All its earlier steps are steps every translation agrees on.
Spex prints it with the one question its last step puts and each translation's answer [[3]].
The sequence is not run on the code: the effects of its earlier steps are the model's, on which the translations agree, and each answer to the question is one translation's own.

A person answers the one question.
Where a case can show the answer, the answer becomes a case; where none can, the item is reworded to say it.

| Question | The person's answer becomes |
| --- | --- |
| Is step n legal? | Legal: a permitted case that holds the step. Not legal: no case can show it, so the item is reworded. |
| What must step n give? | A permitted case that states the effect. Where no item says it, the item is reworded too. |
| Does the rule apply at step n? | It applies: a forbidden case that ends at the step. It does not: no case can show it, so the rule's item is reworded. |
| Is this effect forbidden at step n? | Forbidden: a forbidden case. Permitted, and the model's effect: a permitted case. Permitted, and not the model's effect: no case can show it, so the rule's item is reworded. |

Either way an item has changed, and all the translations are then drafted again by fresh drafters, from the changed items.
No translation is edited to agree.
Where a case was added, Spex also finds a translation the answer contradicts without help: it fails the check of cases above.
This repeats until the translations give the same answers at every step, which is **agreement**.

Agreement shows that the drafters read the items alike, not that the reading is right.
The cases and the person's approval carry that.
Without agreement, or where the comparison does not end within the time limit, the code is not tested and the result is Inconclusive.

### TLC checks the model

TLC model-checks the first translation in name order.
In every state the model reaches, for every legal event, the model's effect must be a declared effect that the rule does not forbid.
TLC ends only when no state is left, so the check is complete for this model and the declared values.
TLC's own estimate of the chance it missed a state is printed with the result.

A sequence TLC finds is the result **Conflict in the items**: the items, as translated, require an effect the rule forbids.
A model in which the rule applies at no step is Inconclusive, and so is a check that does not end within the time limit.
The same run writes TLC's table of the model's steps: for each, its state, its event, the model's effect, the next state and whether the rule applies.

### The code is tested against the model

The code is then tested on a copy ([DR-252](252-a-guard-is-kept-beside-the-code.md)), and every text calls this half testing.

1. Each permitted case's steps are caused and each stated effect field is compared with what was observed. A case that does not go as stated is the result **Case failed**.
2. Every step of the model is caused once: a fresh start, a shortest sequence to its state from TLC's table, then its event. Shortest sequences go first, with ties in TLC's order. The observed effect must equal the model's.

An observed effect that differs from the model's at a step of the model is judged by TLC in one more run.
Where that run is stopped at the time limit, the steps it left are counted as not judged, and the result is Inconclusive unless a higher row was found without them.

| TLC says of the observed effect | Result |
| --- | --- |
| The rule forbids it | **Violated on the code** |
| The rule does not forbid it | **Code differs from the model**: the rule was not seen broken, and the check cannot go on from there |

The first of each kind is printed with its sequence, the model's effect and the observed effect.
An effect that fails a case is judged the same way, and one the rule forbids is a violation too.
A step whose sequence already differed at an earlier step is **not reached**: it is counted, not judged.
A sequence that gives another effect when it is caused again makes the result Inconclusive.

The same test runs on a copy with each kept fault.
The fault is caught only where TLC says the rule forbids an observed effect, never at a mere difference from the model.

### Which half is formal

The check of the model is formal: TLC visits every state the model reaches, and its answer is complete for the model and the declared values.
The check of the code is testing: every step of the model is caused on the code once, with nothing drawn at random, and it shows only that the code gave the model's effect at those steps.
Spex does not explore the code's own states, because no trusted tool model-checks arbitrary code through a binding.
A result therefore says “model checked, code tested” and never that the code was checked in every state.

### What a result assumes

A result rests on what follows, and the first three are printed with it.

| Assumption | How it is held |
| --- | --- |
| The declared values are the ones that matter. | Not checked. A person approves the declaration. |
| What the code does next depends only on the model's state. | Not checked. Each step is tried from one sequence, so code that keeps more state than the model can differ after another sequence. A sequence caused again must give the same effects. |
| The binding causes and observes truly. | Each permitted case is carried out on the code, and each kept fault must be caught through the same binding. |
| The translation says what the items say. | Every translation allows each permitted case and forbids each forbidden case, two or more translations drafted independently are compared, and a person approves the cases. A guard with one translation has no comparison and does not pass. |
| TLC missed no state of the model. | TLC ends only with no state left and prints its estimate of the chance of a miss. |

A result says nothing about events the binding cannot cause or effects it cannot observe.
It is a safety check: it finds a forbidden effect, and it cannot establish that something eventually happens.

### What remains Spex's own

Spex evaluates no TLA+ and answers none of the four questions.
What follows is Spex's own, and a reader must still trust it.

- It generates the declaration in TLA+ and the fixed TLA+ files that put each question to TLC.
- It runs TLC and reads the values TLC prints.
- It counts the model's states and steps from TLC's table.
- It compares an observed effect with the model's for equality.
- It compares each effect field a permitted case states with the observed effect.
- It chooses a shortest sequence to each step from TLC's table.
- Where translations differ on which effects are forbidden, it picks the effect to ask about: the model's where they differ on it, else the first in declared order.
- It drives the binding.

`spex verify --keep <folder>` leaves every file Spex generated and the exact command line of each TLC run in a folder outside the project's tracked files.
Anyone can then run each TLC step again without Spex.

### Later engines

Two later engines add what TLC and a test of the code cannot, and neither is built.

| Engine | What it adds |
| --- | --- |
| A symbolic checker for TLA+, such as Apalache [[5]] on Z3 [[6]] | The check of a model that TLC cannot finish. |
| An imported proof about the code itself | A checked proof for a component, recorded with its prover, its exact artifact and revision, its target and its assumptions, reported as Proved under assumptions. |

Each engine is named with its version in every result it gives.
A person approves the source of a proof and how its property, assumptions and target match the guard's rule.
A proof counts only for its own revision, a proof about a model counts only for that model, and a partial match is Inconclusive.
A new engine qualifies only by catching a past or held-out defect or item conflict that a real project's tests missed.

## Consequences

`spex verify` needs Java and one pinned TLC beside Node ([DR-252](252-a-guard-is-kept-beside-the-code.md)), and the rest of the command line does not.
Trust in a result rests on TLC and on the part that is Spex's own; the kept files let anyone run TLC's part again.
A translation must give the model for every legal event, not only where the rule applies, so the items must say what each event gives.
The model must reach finitely many states, or TLC is stopped at the time limit and the result is Inconclusive.
The cost grows with the model's steps, because each is caused on the code from a fresh start.
A rule over many values or deep state needs smaller declared sets, or waits for a symbolic checker.
A defect in a state of the code that the model does not tell apart can be missed, because the code's own states are not explored.
Effects outside a binding's reach cannot be guarded through it.

## References

[1]: https://arxiv.org/abs/2006.00915 "Davis et al. — eXtreme Modelling in Practice"
[2]: https://www.amazon.science/publications/using-lightweight-formal-methods-to-validate-a-key-value-storage-node-in-amazon-s3 "Bornholt et al. — Using Lightweight Formal Methods to Validate a Key-Value Storage Node in Amazon S3"
[3]: https://cs.stanford.edu/~trippel/pubs/mendoza_ICSE26.pdf "Mendoza et al. — Automating Requirements Formalization"
[4]: https://docs.tlapl.us/using:tlc:start "TLA+ — TLC Model Checker"
[5]: https://apalache-mc.org/ "Apalache — Symbolic Model Checker for TLA+"
[6]: https://github.com/Z3Prover/z3 "Z3 — Theorem Prover"
