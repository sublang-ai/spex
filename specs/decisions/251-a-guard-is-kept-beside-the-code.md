<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-251: A Guard Is Kept Beside the Code

## Status

Proposed (2026-11-25), as the first stage of [DR-243](243-guards-protect-critical-behavior-on-every-change.md) and [DR-244](244-a-guard-is-checked-on-the-implementation.md).
Extends [DR-165](165-one-package-manager-hosted-by-the-cli-and-the-app.md) with `spex verify` and `spex approve`, and [DR-242](242-skills-shipped-from-the-repository-and-an-atlas-of-them.md) with the `guard` skill.

## Context

DR-243 and DR-244 say what a guard is, how it is checked and what a result means.
They leave open where a project keeps a guard, how a person's approval is recorded and who drafts the readings.
The command line has no model to call, and a project may have no IDE, running app or account.
The first stage checks with fast-check alone and leaves the IDE out.

Considered and declined:

- Keeping a guard's files under `specs/`. Specs state behavior and never name the tests that realize them, and a binding, a patch or a run record names code.
- Marking a guard in the spec law. A guard file that names item IDs leaves `meta.md`, the scaffold and `spex lint` as they are.
- Calling a model from the command line. A check would then depend on an agent's sign-in, and DR-244 keeps agents out of a verification run.
- JavaScript as the stored form of a reading. No fixed rule translates arbitrary code for TLC or Z3.
- An existing expression language. Each would bring types that the later tools cannot take, so Spex would still own a subset.
- Signed approvals, or asking who is at the keyboard. A committed record under the project's own review is as strong as the project's other rules and needs no account.
- Checking the project's code in place. A stale build would be checked under a fresh digest.
- A new seed on every run. A result would then change with no input changing.

## Decision

### Where a guard is kept

A guard's meaning stays in `specs/`.
Its assertion and its examples are GEARS test items in the package that holds the behavior item, each citing that item as the spec law requires of any test item.
The guard takes its name from its assertion item.

Everything else is kept in a committed `guards/` folder at the project's root, beside the code it names.

| Kept | Where |
| --- | --- |
| The guard file: its items, binding, checks, examples as sequences and kept faults | `guards/<assertion>/guard.yaml` |
| The surviving readings | `guards/<assertion>/readings/` |
| Each kept fault, as a patch | `guards/<assertion>/faults/` |
| The approval record | `guards/<assertion>/approval.json` |
| Each violation, kept after closure | `guards/<assertion>/violations/` |
| A binding: its declaration and its module | `guards/bindings/<name>/` |
| The results of runs, never committed | `.spex/verify/` |

The guard file says which item is the assertion, which items are its examples, whether each is permitted or forbidden, and which permitted one shows the protected behavior happening.

### What is stored

A reading is data.
It holds its own state with starting values and, for each event, when the event is legal, the effect its rules expect and how the state changes.
It holds the assertion as when it applies and what must then hold of the observed effect.

Conditions are written in one small closed language.
It has truth values, whole numbers, names from finite sets, and sets and maps over those, with comparison, logic, arithmetic, membership, and “all” and “any” over a finite set.
It has no loops, no definitions and no input or output, so every condition has a value.
Spex runs a reading directly on a sequence, and the same form can later be translated for TLC and Z3 by fixed rules.

An example is stored once in the guard file as its sequence of events and stated effects, beside the item it translates.
Spex prints any stored sequence, an example's or a violation's, as its events and effects in order.

### The binding

A binding has a declaration and a module.
The declaration names the events it can cause with their values, the effects it can observe, the conditions it controls, the project files it drives and the commands that prepare them.
The conditions are state, clock, order and restart.
The module is JavaScript that Node loads, and it drives the code under the folder it is given.

Every run uses a copy.
Spex copies the declared files, applies a kept fault's patch where there is one, runs the declared commands and drives the module against the copy.
The project's code and a faulted copy are therefore checked the same way, and a result names the digest of exactly the files copied.
The declared files are the code the guard reaches.

### Approval

`spex approve <guard>` writes the approval record: one digest for each input that needs a person's approval.
Those are the assertion, the behavior item, the examples and every item they cite to any depth, the guard file, the readings, the kept faults, the binding, each tool by name and major version, and the version of Spex's rules for that tool.
`spex verify` computes them again.
A difference names the changed input, and the guard cannot pass until it is approved again.
The project's code and the tools' exact versions are inputs to a result and not to the approval.

Spex does not try to tell a person from an agent.
The record is a committed file, and the project's own review of `guards/` is where a person's approval is enforced.
Removing a guard is deleting its folder with the record in it, which the same review sees.
A person closes a violation with the same command and a reason, and the closure is one of the approved inputs.

### What a run checks in this stage

`spex verify` checks each guard in this order and calls no model.

1. It reads the files and the items, and compares the inputs with the approval record.
2. It checks every example against every reading without the code.
3. It runs each permitted example on a copy of the project's code.
4. It runs the sampled check: fast-check generates sequences of the declared events, Spex drives each through the binding and judges every step by every reading, and fast-check shrinks a failing sequence.
5. It runs the same check at the same bounds on a copy for each kept fault.
6. It replays each open violation's recorded sequence.

The guard file fixes the bounds of the sampled check: the number of sequences, the most events in one, the seed and a time limit.

| Finding | Result |
| --- | --- |
| A step whose observed effect every reading forbids | Violated on the implementation |
| Under control, an effect that differs from the one an example states or every reading expects, or the showing example not applying | Disagreement with the model |
| An example a reading does not accept, a step the readings judge differently, the time limit, no sequence in which the assertion applied, or a condition the assertion needs and the binding does not control | Inconclusive |
| None of these, with every sequence run | Sampled on the implementation |

Conflict in the items, Violated in the model, Checked within bounds and Proved under assumptions wait for the tools that can establish them.

A guard passes when its inputs are approved, its required check is Sampled on the implementation, it has at least one kept fault, every kept fault ends Violated on the implementation, and no violation is open.
A kept fault whose patch no longer applies is not caught.
Spex records a violation with its sequence and closes it by itself only when a controlled replay of that sequence no longer shows it and the code or the approved inputs have changed since.
`spex verify` skips a guard whose stored result passed on the same inputs, and runs every guard where no result is stored, as in CI.
It exits `0` only when every guard it was asked for passes.

### Drafting

One shipped skill, `guard`, drafts a guard with the person.
It writes the assertion and examples as items, has independent agents each draft a reading from the items alone, and settles their differences by example.
`spex verify` has two aids for it that read no code: one prints the items a reading is drawn from, and one compares the readings and prints a sequence they judge differently.
The skill drafts the binding and a kept fault only after the readings stand.
It runs `spex approve` only on the person's word.

### The first guard

The first guard is on Spex itself.
It protects the rule that an install never replaces the placed spec of a package that stays selected with another package's spec.
Its kept fault restores the defect fixed in `6000e8c`, where the path went to the first package by `<org>`.
The tests of that day passed with the defect, because they only tried packages that arrived together.
This repository runs `spex verify` in CI and before a push.

## Consequences

A project adds a guard with the command line and one skill, and a second guard on the same interface reuses the binding.
Only code that a Node module can drive is reachable until other kinds of binding follow.
An edit to any item a guard's meaning cites asks for approval again, and so does a new major version of a tool.
The same seed gives the same sequences on every run, so a wider search is a separate, later check.
fast-check becomes a dependency of `@sublang/spex` and so of the apps that host its library.
TLC, Z3, recorded runs, imported proofs and the IDE build on the same stored form and records.
