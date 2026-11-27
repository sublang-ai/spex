<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-243: Guards Protect Critical Behavior on Every Change

## Status

Accepted (2026-11-25); revised (2026-11-27).
Amends [DR-165](165-one-package-manager-hosted-by-the-cli-and-the-app.md).
Amended by [DR-252](252-a-guard-is-kept-beside-the-code.md).

## Context

Agents can change code faster than people can review it.
Teams have caught defects by checking production code against a few important properties [[1]] [[2]].
A weak property can pass every check, especially when the agent writing it has already seen the faulty code [[3]].
Tools such as Kiro already use a solver and concrete examples to help people settle requirements before coding [[4]].

A project's specs already hold the two things a guard needs.
A behavior item states one requirement.
A test item, in the same package's Verification section, says how that requirement is tested.

This record and the two beside it follow one guard throughout, the first guard, which is on Spex itself.
Two installed packages may each provide a spec named `kit`, and only one copy can stand at `specs/packages/kit.md`.
The rule is that the copy already standing there keeps the path.
Until 2026-11-01 the path went to the package that came first by organization name, even over a standing copy.
The requirement of that day said so, and the tests never tried the one arrangement that showed the harm.

Considered and declined:

- a new kind of item for a rule or for a case: a reader of the specs already knows behavior items and test items, and a guard's cases are read in one test item;
- the typed form of a case in its item: events and their effects are for the guard's author, and a reader of the spec judges a case in plain words;
- several rules under one guard: a failure would not say which rule broke, and a person would approve cases without knowing which rule each belongs to;
- a one-word verdict such as “verified”: it hides what was checked and how far the check reached.

## Decision

`spex verify` extends the command line of [DR-165](165-one-package-manager-hosted-by-the-cli-and-the-app.md).
This record decides what a guard is, what a person approves, and what a result and a pass mean.
[DR-244](244-a-guard-is-checked-on-the-implementation.md) decides how a guard is checked, and [DR-252](252-a-guard-is-kept-beside-the-code.md) where one is kept.

### What a guard is

A **guard** is a test item that `spex verify` carries out, together with the files under `guards/<its ID>/` that say how.
The item is the **guard item**.
It stands in a package's Verification section, beside the test items that hand-written tests carry out.
It cites one behavior item of the same package, the **rule**, which is what the guard checks.
A guard is named by its guard item's ID.

The guard item holds a list of **cases**.
A case is one short story in plain words, marked `permitted` or `forbidden`: something the code does and the rule allows, or something the code must never do.
A permitted case may show where the rule stops applying; what the code does there is still checked as the case states it.
Every guard has at least one permitted case and one forbidden case.
The item holds no typed notation.

The first guard is the item `environments-56`, and its rule is the item `environments-55`.
It has six cases, three permitted and three forbidden.

```markdown
#### environments-56

When `spex verify` checks installs into a project in which several packages provide a spec of one name, it shall find that the code keeps the rule that a standing copy keeps its path [[environments-55](#environments-55)] at every step it tries, reading the rule by these cases:

- permitted — a later arrival is blocked: an install selects `zeta/kit` alone and its copy stands, and a second selects `acme/kit` too, both releases providing a `kit` spec; `zeta/kit`'s copy still stands and `acme/kit` alone is reported blocked;
- forbidden — a later arrival takes the path: the same two installs, ending with `acme/kit`'s copy standing and `zeta/kit` reported blocked;
- forbidden — the standing package is reported blocked: the same two installs, ending with `zeta/kit`'s copy still standing and both packages reported blocked;
- forbidden — a package not selected is reported blocked: the same two installs, ending with `zeta/kit`'s copy still standing and `acme/kit` and `mid/kit` reported blocked;
- permitted — a copy no longer selected leaves: an install selects `zeta/kit` alone and its copy stands, and a second selects `acme/kit` alone, each release providing a `kit` spec; `acme/kit`'s copy stands and no package is reported blocked;
- permitted — a copy no longer provided leaves: an install selects `zeta/kit` alone and its copy stands, and a second selects `acme/kit` too, when only `acme/kit`'s release still provides a `kit` spec; `acme/kit`'s copy stands and no package is reported blocked.
```

A rule is one behavior item.
An item that holds several requirements is split before it is guarded, so that the guard's one citation says exactly what is protected.
The first guard's rule was a clause of a longer item on placing specs, and it became an item of its own.

A guard's binding, its translations with their model, and each case's steps are kept under `guards/` and defined in [DR-244](244-a-guard-is-checked-on-the-implementation.md).
A model may say only what the guard item, the rule and the items those cite say.
TLC, the model checker of the TLA+ tools, makes every judgement on a translation.

### What a person approves

A person approves a guard's meaning by reading its cases, and `spex approve` records the approval ([DR-252](252-a-guard-is-kept-beside-the-code.md)).
The items' words can be read in more than one way.
Where the translations show that, Spex prints a sequence of events with the one question its last step puts, and the person answers it ([DR-244](244-a-guard-is-checked-on-the-implementation.md)).
A person also approves the removal of a guard.

### A guard must catch a fault

A guard that cannot fail protects nothing.
Each guard therefore has at least one **kept fault**: a small change to the code that plants a defect, or restores a past one, that breaks the rule.
On every run Spex applies each kept fault to a copy of the code, and the guard must find the rule broken there.
A kept fault is evidence only that the guard can catch that fault.
A kept fault that no longer applies to the code needs an approved replacement.

### What runs on a change

`spex verify` checks every guard on every change, locally and in CI.
No agent or language model takes part and nothing is random, so the same approved items and files, code and versions give the same run.
It keeps no result, so no result can be out of date.

Four things decide a guard's result.

| What | Who approves a change to it |
| --- | --- |
| The guard item, the rule and the items those cite | A person |
| The guard's folder and its binding: each case's steps, the translations, the time limit, the kept faults and the binding's own files | A person |
| The project's code | No one |
| The versions of Spex, Node, TLC and Java | No one |

A guard cannot pass while a change that needs approval has none.
A change to the code or to a version needs none, because every run checks every case, the model and every kept fault again with what it has.

### What a result means

Spex gives no one-word verdict on the code and never prints “verified” or “valid”; “proved” appears only with a named prover and its assumptions.
It presents guards as “protect critical behavior on every change”, names each guard with the rule it checks, and reports what the check established.
Each result names the versions of Spex, Node, TLC and Java, whether TLC is the copy Spex pins, the code revision and the time limit.
The result Model checked, code tested also names the model's states and steps, counted from TLC's table, and what the result assumes.

| Result | What it establishes |
| --- | --- |
| Conflict in the items | TLC found a sequence after which the items, as translated, require an effect the rule forbids. |
| Violated on the code | The code did what the rule forbids. |
| Code differs from the model | The code gave an effect the model does not give and the rule does not forbid. |
| Case failed | A permitted case did not go on the code as its steps state. |
| Inconclusive | The check could not settle, as when time ran out, the translations differ, the rule applied at no step or a sequence did not repeat. |
| Model checked, code tested | TLC checked every state the model reaches, complete for the declared values, and the model never gives an effect the rule forbids. Every step of the model was then caused on the code once, and the code gave the model's effect each time. |
| Proved under assumptions | A named prover established the rule for the code. |

Spex reports one result for a guard: the highest row of the table that it found.
The last row waits for a later engine in [DR-244](244-a-guard-is-checked-on-the-implementation.md), and no guard reports it in the first stage.

A guard passes only when all of these hold.

- Its approval is current.
- Every translation allows each permitted case and forbids each forbidden case, checked without the code ([DR-244](244-a-guard-is-checked-on-the-implementation.md)).
- It has two translations or more, and they agree, checked without the code too.
- Its result is **Model checked, code tested**.
- It has at least one kept fault, and it catches every one.

One translation is not enough to pass.
The cases catch a translation that misreads what they show, and only the comparison of translations drafted independently finds a misreading that no case shows.
A guard with one translation is still checked and tested in full and gets its result; its report says that there is nothing to compare the translation with.

A conflict, a violation or a difference is printed with the sequence of events that reaches it, and one found in a permitted case with that case's steps.
The same command prints it again while nothing changes.

## Consequences

A project can start with one approval, billing or entitlement rule through one interface, without complete specs, an IDE, a running Spex app or an account.
A reader of the specs meets nothing new: a guard item is a test item and a case is an entry in its list.
A rule buried in a longer item has to be split out before it can be guarded.
Cases and kept faults give reviewers evidence of what a guard catches, within the limits of the rule they approved.
The adoption measure is the effort to add a second guard through the same interface.
Rules about retries and competing owners follow once a binding can control the timing they depend on.
A record of each violation, and a way to close one, follow later.

## References

[1]: https://www.amazon.science/publications/using-lightweight-formal-methods-to-validate-a-key-value-storage-node-in-amazon-s3 "Bornholt et al. — Using Lightweight Formal Methods to Validate a Key-Value Storage Node in Amazon S3"
[2]: https://arxiv.org/abs/2407.01688 "How We Built Cedar: A Verification-Guided Approach"
[3]: https://arxiv.org/abs/2610.32053 "Wang et al. — Are LLM-Generated Formal Specifications Faithful to Their Requirements?"
[4]: https://kiro.dev/blog/deep-spec-analysis/ "Kiro — Requirements analysis: catching requirement bugs before they become code"
