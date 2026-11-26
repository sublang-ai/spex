<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-252: A Guard Is Kept Beside the Code

## Status

Accepted (2026-11-25).
Amends [DR-145](145-merge-on-green.md), [DR-165](165-one-package-manager-hosted-by-the-cli-and-the-app.md), [DR-199](199-release-gated-full-validation.md), [DR-242](242-skills-shipped-from-the-repository-and-an-atlas-of-them.md), [DR-243](243-guards-protect-critical-behavior-on-every-change.md), [DR-244](244-a-guard-is-checked-on-the-implementation.md).

## Context

[DR-243](243-guards-protect-critical-behavior-on-every-change.md) and [DR-244](244-a-guard-is-checked-on-the-implementation.md) leave open where a project keeps a guard, how a person's approval is recorded and who drafts the readings.
The command line has no model to call, and a project may have no IDE, running app or account.
A prototype of this stage ran one guard on Spex's package library and a second rule on the core's ledger, and what it found is in the choices below.

Considered and declined:

- a guard's files under `specs/`: the assertion and examples are already there as items, while a binding, a patch and an approval record name code and change with it; `spex lint` warns of any other entry under `specs/`, and a release carries one spec file, so nothing kept there would travel with a package;
- a rule in `meta.md` marking guard items: the guard's folder and file name them by ID, so `meta.md`, the scaffold and `spex lint` do not change;
- a model called from the command line: a check would depend on an agent's sign-in, and [DR-244](244-a-guard-is-checked-on-the-implementation.md) allows no agent in a verification run;
- JavaScript as a reading's stored form: no fixed rule translates arbitrary code for TLC or Z3, and code could read the implementation or the clock;
- an existing expression language: each has values TLC or Z3 cannot take, so Spex would still define a subset;
- a signed approval, or asking who is at the keyboard: a project may have no account, and a committed record shows in every review of the change;
- checking the code where it stands: a build older than its sources would be checked as if it were current;
- a new seed on every run: a result would change with no input changing, and a long-hidden violation would land on an unrelated change;
- a stored result that lets a run skip a guard: to be trusted it would have to name every installed dependency and tool, and CI stores none;
- tool versions in the approval: a tool is installed with the command line and not kept in the repository, so a record would hold on one machine and fail on another with nothing to review.

## Decision

- This is the first stage of [DR-243](243-guards-protect-critical-behavior-on-every-change.md) and [DR-244](244-a-guard-is-checked-on-the-implementation.md): fast-check alone, the command line and one skill, no IDE; it reads those two records narrowly where "Where this stage is narrower" lists.
- Amends [DR-165](165-one-package-manager-hosted-by-the-cli-and-the-app.md) with `spex approve`, [DR-242](242-skills-shipped-from-the-repository-and-an-atlas-of-them.md) in what a shipped skill may need — the `guard` skill needs the `spex` command — and [DR-145](145-merge-on-green.md) and [DR-199](199-release-gated-full-validation.md) with `spex verify` in this repository's checks.

### Where a guard is kept

A guard's assertion and examples are GEARS test items in the package that holds the behavior item, and each cites that item [[meta-20](../meta.md#meta-20)].
A guard is named by its assertion item's ID.
Its other files are committed under `guards/`, beside `specs/`.

| Kept | Where |
| --- | --- |
| The guard file: its binding, its bounds and each example's sequence | `guards/<assertion>/guard.yaml` |
| The surviving readings | `guards/<assertion>/readings/` |
| Each kept fault, as a patch | `guards/<assertion>/faults/` |
| The approval record | `guards/<assertion>/approval.json` |
| A binding: its declaration and its module | `guards/bindings/<name>/` |

The guard file names each example item as permitted or forbidden and holds it again as the sequence of events and stated effects the item describes.
A run keeps nothing: no result and no copy.

### What is stored

A reading is data, not code.
It holds its own state and, for each event, when the event is legal and how the state changes with the observed effect.
It holds the assertion as when it applies and what must then hold of the observed effect.
Its conditions are written in one small language that Spex defines, over finite values, with no loops, definitions, input or output, so that every condition has a value and fixed rules can later translate it for TLC and Z3.

### The binding

A binding's declaration names the events it can cause, the effects it can observe, the files a run copies and the commands that build the copy.
Its module is JavaScript, with one function for each event.
In this stage a binding controls every condition a check uses.
Each sequence starts from a fresh state, and a clock or a restart, where a behavior depends on one, is an event the binding causes.

Every run uses a copy outside the project.
Spex copies the declared files and the binding, applies a kept fault's patch where there is one, runs the commands, and runs the module in a process of its own, each command and that process stopped at the time limit.
A kept fault's patch changes existing files among the declared files only, never the binding.
The copy uses the project's installed dependencies.
A run whose process loads, in its main thread, a module of the project from outside the copy is Inconclusive, naming the file.
What a worker thread or a process the code starts loads, and a file read as data, is not seen in this stage.
A binding that fails, by an error, an effect outside its declaration or a failed command, makes the check Inconclusive and never counts as catching a fault.
The declared files are the code the guard reaches, and a result names their digest.

### Approval

`spex approve <guard>` prints each example's item beside its stored sequence and names what changed since the last record.
It then writes the approval record, one digest for each of these inputs.

- the assertion, the behavior item, the examples and the items those cite directly
- the guard file, the readings, the kept faults and the binding

`spex verify` names each input that changed, was added or is gone, and the guard cannot pass until it is approved again.
Spex does not try to tell a person from an agent.
The record is a committed file, so an approval shows as a change in any review.
A guard is removed by deleting its folder, which shows the same way.

### What a run checks

`spex verify` checks every guard, or the ones it is given, and calls no model.
A guard whose files or items hold an error cannot be checked and does not pass.

1. It compares the inputs with the approval record.
2. It checks every example against every reading, without the code.
3. It runs each permitted example on a copy.
4. It runs the sampled check on that copy.
5. It runs the same check at the same bounds on a copy with each kept fault.

In the sampled check fast-check generates sequences of the declared events, each continuing the start of a permitted example.
Spex causes an event only when every reading finds it legal, and skips it when every reading finds it not legal.
An event the readings disagree on is not caused, is named in the result, and the sequence goes on without it.
Spex judges each caused step by every reading and has fast-check shrink a failing sequence.
The guard file fixes the bounds: the number of sequences, the most events in one, the seed and the time limit.

| Finding on the project's code | Result |
| --- | --- |
| An observed effect every reading forbids | Violated on the implementation |
| A permitted example whose stated effect the code does not produce, or which shows the protected behavior against the readings and not on the code | Disagreement with the model |
| A permitted example a reading rejects, a forbidden one in which a reading finds a step not legal or does not forbid the last effect, a timeout, no sequence in which the assertion applied, or a failing binding | Inconclusive |
| An event some readings find legal and others not, or a step on which they differ whether the assertion applies or the effect is forbidden | Inconclusive |
| None of these, with every sequence run | Sampled on the implementation |

A violation comes before any other finding.
The other four results wait for the tools that can establish them.
The check of the examples against the readings is reported apart from the checks on the code.
A result names the versions of fast-check and Spex, the Git revision and the digest of the copied files, the bounds, and each reading's conditions for an event being legal.

A guard passes only when all of these hold.

- Its inputs are approved.
- It has a forbidden example and a permitted one that shows the protected behavior happening.
- The sampled check on the project's code is **Sampled on the implementation**.
- It has a kept fault, and every kept fault is caught: on its copy the sampled check finds an effect every reading forbids.

A patch that no longer applies, or that changes none of the copied files, is not caught, and the guard waits for an approved replacement.
`spex verify` exits `0` only when every guard it checked passes.

### Where this stage is narrower

| DR-243 or DR-244 | This stage |
| --- | --- |
| A person approves every input change except code and fresh evidence | The versions of fast-check and Spex need no approval. Every run checks every example and must catch every kept fault again with the versions it has. |
| The inputs include every item a guard's meaning depends on through citations | The approval covers the guard's items, the behavior item and the items those cite directly. To any depth the first guard would cover more than 460 of this tree's roughly 1,300 items. |
| `spex verify` runs for every guard a change reaches | It runs every guard and keeps no result, so none can be stale. |
| A violation keeps its sequence and replay command, and is closed by a replay or a person | A violation is printed with its shrunk sequence and not recorded. The same command prints it again while nothing the run uses changes, the versions of fast-check and Spex included. A run reports only what it found, and an earlier violation blocks no later run. Whether it was corrected waits for its record and a replay of its sequence. |
| A binding declares which conditions it controls | A binding controls them all. |
| Spex derives the readings, and again when their inputs change | The skill's agents draft them, and `spex verify` only names the input that changed. |
| Spex finds a distinguishing sequence where readings disagree | The skill's agents find one by reading, and Spex compares readings only on the examples and on the sequences it runs. |
| Disagreement with the model covers any effect the model excludes | A reading states no expected effects yet, so only an example's stated effect can disagree. |

### Drafting

One shipped skill, `guard`, drafts a guard with a person.

1. It writes the assertion and the examples as items, and the binding's events and effects from those items.
2. It has independent agents each draft a reading from the items and that declaration alone, before any agent reads the code.
3. Where readings disagree, it shows the person one distinguishing sequence, the person marks it permitted or forbidden, it becomes an example, and the readings it contradicts are dropped.
4. It then reads the code to write the binding's module, files and commands, and plants a fault or restores a past defect.
5. It runs `spex verify`, and runs `spex approve` only when the person says so.

When an item changes, the skill drafts the readings again before it asks for approval.

### The first guard

The first guard is on Spex itself: while a package's spec stays selected and its release still provides it, an install never replaces its standing copy with another package's [[environments-41](../packages/environments.md#environments-41)].
Where the spec is no longer selected or provided, its unedited copy leaves and another package may take the path, which a permitted example shows.
Its kept fault restores the behavior changed on 2026-11-01 in `6000e8c`, where the path went to the first package by `<org>` even over a standing copy.
The item of that day required that behavior, and the tests tried a later arrival only where the standing package also came first by `<org>`.
The defect was in the requirement, and the guard's forbidden example is what would have exposed it.
In the prototype the sampled check passed on today's code and caught the restored fault.
This repository runs `spex verify` in its pull-request checks and before a push.

## Consequences

A project adds a guard with two commands and one skill, and a second guard on the same interface reuses the binding.
A binding is a JavaScript module until other kinds follow, so only code it can drive is reachable.
`spex verify` needs Node 22.15 or newer, which it uses to see what a copy's process loads.
An approval rests on the project's review, and a project that merges without one has only the record's history.
The seed is fixed, so the same sequences are generated on every change until the version of fast-check or Spex or the guard's inputs change, and a wider search is a separate, later check.
Starting each sequence from an example matters: on the prototype's second rule, sequences generated without one caught the restored fault on none of twenty seeds at the same bounds, and with one on all twenty.
Refactoring the lines a kept fault patches stops the guard until a replacement is approved.
fast-check becomes a dependency of `@sublang/spex` and of the apps that host its library.
Violation records, uncontrolled conditions, a model's expected effects, TLC, Z3, recorded runs, imported proofs and the IDE follow on the same stored form.
