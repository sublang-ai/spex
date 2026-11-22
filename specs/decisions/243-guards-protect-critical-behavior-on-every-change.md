<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-243: Guards Protect Critical Behavior on Every Change

## Status

Proposed (2026-11-21) as an extension to the CLI in [DR-165](165-one-package-manager-hosted-by-the-cli-and-the-app.md) with `spex verify`.
[DR-244](244-a-guard-is-checked-on-the-implementation.md) describes how Spex checks a guard.

## Context

Agents can change code faster than people can review it.
Teams have caught defects by testing production code against a few important properties [[1]] [[2]].
A weak property can survive every test, especially when the agent writing it has already seen the faulty code [[3]].
GEARS gives the person who owns the behavior a way to say what matters and recognize a failure.

## Decision

### What a person approves

A **guard** checks one property on every change that reaches it.
A GEARS test item states the assertion and cites the behavior item it protects.
Several guards can cover different properties of the same item.
Spex presents selective formal verification as “protect critical behavior on every change” and names the assertion each guard checks.
People own guards entirely in GEARS.

A person approves at least one permitted and one forbidden example per guard.
Each example is a GEARS test item that belongs to that guard and cites its behavior item.
One permitted example must show the protected behavior happening.
If plausible readings disagree, the person decides by example and records the intended meaning and any assumptions in the items.

To qualify, the guard must pass its checks on the project's code and report a violation of its assertion on a copy with a planted fault or a restored past defect.
The faulted copy supplies evidence only about the guard's ability to detect that fault.
Spex keeps each fault and must catch it as a violation of the same assertion whenever an input changes, including project code.
A fault that no longer applies needs an approved replacement.

### What runs on a change

`spex verify` runs locally and in CI for every guard a change reaches, or for all guards if its reach is uncertain.
The following inputs determine a guard's result.

- its assertion, behavior item, examples, assumptions, kept faults and every item its meaning depends on through citations
- the derived check, the binding that connects it to the code, and the code it reaches
- the tools, translations, required checks, bounds and settings
- the evidence read, its source and its selection rule

Changing any input immediately makes the previous result stale, even while a rerun is pending.
A person approves guard removal and input changes, except for changes to project code and fresh evidence from an approved source and selection rule.

Each run checks that the derivation accepts every permitted example and rejects every forbidden one.
It also runs each permitted example on the code, checking the stated effect where the binding controls its conditions and what the assertion requires elsewhere.
If the example meant to demonstrate the behavior fails to show it, the result is a disagreement under controlled conditions and inconclusive otherwise.
An observed effect that the assertion forbids on the project's code always takes precedence.

### What a result means

Each result names its tool and version, code revision, bounds and assumptions.
Model and implementation results are reported separately.

| Result | What it establishes |
| --- | --- |
| Violated on the implementation | A live or recorded run of the project's code exhibited a forbidden effect. |
| Disagreement with the model | The code produced an effect the assertion permits but the model excludes, or missed the required demonstration under controlled conditions. |
| Conflict in the items | The items contradict each other or leave a required decision open. |
| Violated in the model | The model allows a forbidden sequence that has yet to be observed on the code. |
| Sampled on the implementation | The sample covered at least one applicable case on the code. Every case was checked and none violated the assertion. |
| Checked within bounds | The tool completed the full search within the stated scope and found no violation or rule conflict. |
| Proved under assumptions | A named prover established the assertion for the stated target and assumptions. |
| Inconclusive | The evidence cannot settle the check, including when it times out. |

A guard passes only when it meets all three conditions.

- Every required check finishes at its required bounds or wider, with current results of **Sampled on the implementation**, **Checked within bounds** or **Proved under assumptions**.
- At least one required result covers the implementation, and the guard still catches every kept fault.
- No blocking violation remains open.

A violation from a required check blocks, as does a violation any check observes on the project's code at the revision being checked.
All other optional results are advisory.

A rerun can settle an inconclusive check.
A violation keeps its item ID, initial conditions, actions, observed effect and local replay command.
After a relevant code or approved guard change, Spex can close it by replaying the original sequence under controlled conditions and observing that the assertion now holds.
A change to search settings alone or a failure to reproduce under uncontrolled conditions leaves it open.
A person can close an uncontrolled finding or a misreport demonstrated on the original evidence with a corrected check.
Closed findings remain in the record.

## Consequences

A project can start with one approval, billing or entitlement rule through one interface, without complete specs, an IDE, a running Spex app or an account.
Retries and competing owners follow once the project can control the timing they depend on.
The adoption measure is the effort to add a second guard through the same interface.
Examples and kept faults give reviewers evidence of what a guard catches, within the limits of the assertion they approved.

## References

[1]: https://www.amazon.science/publications/using-lightweight-formal-methods-to-validate-a-key-value-storage-node-in-amazon-s3 "Bornholt et al. — Using Lightweight Formal Methods to Validate a Key-Value Storage Node in Amazon S3"
[2]: https://arxiv.org/abs/2407.01688 "How We Built Cedar: A Verification-Guided Approach"
[3]: https://arxiv.org/abs/2610.32053 "Wang et al. — Are LLM-Generated Formal Specifications Faithful to Their Requirements?"
