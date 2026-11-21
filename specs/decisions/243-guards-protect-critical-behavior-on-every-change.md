<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-243: Guards Protect Critical Behavior on Every Change

## Status

Proposed (2026-11-21), on the owner's direction that Spex become the tool for selective formal verification based on GEARS, easy for ordinary developers and useful to large projects, with GEARS the only language its users see.
Proposes to extend [DR-165](165-one-package-manager-hosted-by-the-cli-and-the-app.md) in the `spex` executable's commands: `spex verify` joins them.
How a guard is checked is [DR-244](244-a-guard-is-checked-on-the-implementation.md)'s.

## Context

- Agents write changes faster than people review them.
  A guarantee a person approves once, and every later change must still satisfy, is review effort that compounds; a check a person must decipher again at each change is not.
- Partial verification has a record: checking a few properties of a few components instead of proving a system [[1]].
  A storage team blocked sixteen defects with executable models and generated tests kept in the build [[2]]; an authorization language found defects both by proving properties of its model and by testing its code against that model [[3]].
- Its known failures are three:
  - a property too weak to fail, which a vendor of derived property tests states of its own product [[4]];
  - an agent that sees faulty code beside its requirement and writes a specification the fault satisfies [[5]];
  - a model that passes while the code it describes has moved [[6]].
- Others already derive property tests from structured requirements [[4]] and attach model-checking evidence to single acceptance criteria, stale after an edit [[7]].
  Natural-language requirements, traceability and a solver are therefore where a product starts, not what sets it apart.
- Spex has what a guard needs before any formula: one requirement per item, stable item IDs, citations between items, test items that cite the behavior they verify, and a linter over all of it.
  Its toolchain already re-checks agent-produced artifacts by deterministic checks and requires a bounded model's deliberately broken variants to fail.
- Considered and declined:
  - a formal language its users read or write: the people who own a behavior's meaning read GEARS, and few will learn another notation;
  - "verified" as a result: it says neither what was checked nor how far;
  - a new kind of spec item: nothing yet shows a guard that a behavior item and the test items citing it cannot express;
  - guards for wording and presentation: their tests already say what a reader sees, and a property adds nothing;
  - requiring a project's specs to be complete first: one behavior worth protecting is reason enough to start.

## Decision

- A **guard** is a machine check of one behavior item that runs on every change; the item is then **guarded**.
- Spex presents the capability as "protect critical behavior on every change".
  "Selective formal verification" is its technical description and no word of a surface.
- GEARS is the only language a person reads or writes to own a guard.
  Whatever Spex derives from an item to check it is never required reading.
- The item holds the meaning:
  - a guard is derived from its item and the items that item cites;
  - a choice that settles what the item means is written into the item before its guard stands;
  - an assumption a guard rests on is an item the guarded item cites.
- A person approves a guard by examples, never by its derived form: at least one permitted and one forbidden sequence of events, each as a GEARS test item, chosen where plausible readings of the item disagree.
  One permitted example shows the behavior happening, so that refusing everything cannot pass.
- A guard attaches to an existing behavior item and is recorded by test items that cite it; the spec of specs gains no item kind.
- A guard stands only after it has failed on a fault planted in the guarded behavior or on a recorded past defect.
- Every result states what was established, on which revision, within which bounds and under which assumptions, as exactly one of:

  | Result | Meaning |
  | --- | --- |
  | Violated on the implementation | a sequence the item forbids was reproduced on the project's code |
  | Violated in the model | the sequence was found in what Spex derived and not yet reproduced |
  | Sampled on the implementation | generated cases ran on the code and none violated the item |
  | Checked within bounds | every sequence within the stated bounds was explored |
  | Proved under assumptions | a prover established the property for the stated assumptions |
  | Inconclusive | the check ended, a timeout included, without one of the above |

- A violation names the item's ID, the sequence of events, the effect observed and a command that reproduces it on the reader's own machine.
- A result is stale once its item, an item that one cites, the guard, its link to the code or the checker changes, and a stale result is never shown as passing.
- A change that makes a guarded item or its guard permit what it forbade is shown as a weakening and waits for a person's approval, never an agent's.
  The item and the code may change in one change where the intended behavior changed.
- Adoption is one item at a time: a first guard in an existing project needs no other spec, no IDE, no running app and no account.
- `spex verify` runs a project's guards, on a developer's machine and in a change's checks alike, whichever agent or person wrote the change.
- The first use Spex leads with is a service whose behavior depends on retries, ownership, approvals or background work, entered from a past incident or an existing item.
- Spex measures itself by what a project's second guard costs: what a first guard built to reach the code serves the ones after it.

## Consequences

- A reviewer who reads no formal notation can own a guarantee and see when a change weakens it.
- Meaning cannot move into a hidden artifact: what Spex derives can be discarded and derived again from the items.
- Assurance rests on examples and planted faults, which is weaker than an expert's reading of a formal specification, and on the precision of the item's own text.
- A result reads longer than a badge; the six results keep a sampled run from passing as a proof.
- An item must be exact enough to derive from, so a project that guards a behavior tends to sharpen that item first.
- Most items of an application's interface stay outside guards and keep their tests.
- Spec packages carrying guards for behaviors many projects share are left to a later decision.

## References

[1]: https://people.csail.mit.edu/dnj/publications/ieee96-roundtable.html "Jackson and Wing — Lightweight Formal Methods (IEEE Computer, 1996)"
[2]: https://www.amazon.science/publications/using-lightweight-formal-methods-to-validate-a-key-value-storage-node-in-amazon-s3 "Bornholt et al. — Using Lightweight Formal Methods to Validate a Key-Value Storage Node in Amazon S3 (SOSP 2021)"
[3]: https://arxiv.org/abs/2407.01688 "How We Built Cedar: A Verification-Guided Approach"
[4]: https://kiro.dev/docs/specs/correctness/ "Kiro — correctness properties and property-based tests from requirements"
[5]: https://arxiv.org/abs/2610.32053 "Wang et al. — Are LLM-Generated Formal Specifications Faithful to Their Requirements?"
[6]: https://arxiv.org/abs/2006.00915 "Davis et al. — eXtreme Modelling in Practice (PVLDB 2020)"
[7]: https://karatelabs.io/formal-verification "Karate Labs — formal verification evidence on acceptance criteria"
