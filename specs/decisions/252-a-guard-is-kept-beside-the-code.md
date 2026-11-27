<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-252: A Guard Is Kept Beside the Code

## Status

Accepted (2026-11-25); revised (2026-11-27).
Amends [DR-145](145-merge-on-green.md), [DR-165](165-one-package-manager-hosted-by-the-cli-and-the-app.md), [DR-199](199-release-gated-full-validation.md), [DR-242](242-skills-shipped-from-the-repository-and-an-atlas-of-them.md), [DR-243](243-guards-protect-critical-behavior-on-every-change.md), [DR-244](244-a-guard-is-checked-on-the-implementation.md).

## Context

[DR-243](243-guards-protect-critical-behavior-on-every-change.md) says what a guard is, and [DR-244](244-a-guard-is-checked-on-the-implementation.md) says how one is checked.
They leave open where a project keeps a guard, how a person's approval is recorded, where TLC comes from, who drafts the translations and which guard comes first.
The command line has no language model to call, and a project may have no IDE, running app or account.

Considered and declined:

- a guard's other files under `specs/`: the rule and the cases are already there as items, while a binding, a patch and an approval record name code and change with it; `spex lint` warns of any other entry under `specs/`, and a release carries one spec file, so nothing kept there would travel with a package;
- a case's steps in its item: typed events and effects are not for a reader of the specs, so the item holds the case in plain words and the guard file holds its steps under the same label;
- a rule in `meta.md` marking guard items: the guard's folder names its item by ID, so `meta.md`, the scaffold and `spex lint` do not change;
- a language model called from the command line: a check would depend on an agent's sign-in, and [DR-243](243-guards-protect-critical-behavior-on-every-change.md) allows no agent in a run;
- JavaScript as a translation's stored form: TLC could not check it, and code could read the project's code or the clock;
- a signed approval, or asking who is at the keyboard: a project may have no account, and a committed record shows in every review of the change;
- an approval record written by an agent on its own: approval is a person's act, so the skill runs `spex approve` only when the person says so;
- checking the code where it stands: a build older than its sources would be checked as if it were current;
- a stored result that lets a run skip a guard: to be trusted it would have to name every installed dependency and tool, and CI stores none;
- tool versions in the approval: Java is the machine's and TLC is pinned by the version of Spex, so a record would hold on one machine and fail on another with nothing to review.

## Decision

This record is the first stage of [DR-243](243-guards-protect-critical-behavior-on-every-change.md) and [DR-244](244-a-guard-is-checked-on-the-implementation.md): the command line and one skill, no IDE.
It extends [DR-165](165-one-package-manager-hosted-by-the-cli-and-the-app.md) with `spex approve`.
It amends [DR-242](242-skills-shipped-from-the-repository-and-an-atlas-of-them.md) in what a shipped skill may need: the `guard` skill needs the `spex` command and Java.
It extends [DR-145](145-merge-on-green.md) and [DR-199](199-release-gated-full-validation.md) with `spex verify` in this repository's checks.

### Where a guard is kept

A guard's rule and its guard item, with the cases, stand in the package that holds the behavior.
Its files are committed under `guards/`, beside `specs/`, in a folder named by the guard item's ID.
A binding has a folder of its own there.

| Kept | Where |
| --- | --- |
| The guard file: its binding, its limits and each case's steps | `guards/<guard>/guard.yaml` |
| Each translation | `guards/<guard>/translations/<name>.tla` |
| Each kept fault, as a patch | `guards/<guard>/faults/` |
| The approval record | `guards/<guard>/approval.json` |
| A binding: its declaration and its module | `guards/bindings/<name>/` |

The **guard file** holds each case a second time, as its steps in the binding's vocabulary ([DR-244](244-a-guard-is-checked-on-the-implementation.md)).
It names the case by its label in the guard item.
Whether the case is permitted or forbidden is read from the item and never repeated.
Spex checks this mapping whenever it loads a guard: every case of the item has exactly one entry of steps, and every entry names a case of the item.
A reader of the spec therefore sees every case a run carries out, and a run carries out none the spec does not show.

The guard file's **limits** are one time limit in seconds.
It bounds each run of TLC and each command separately, and a run it stops makes the result Inconclusive.
The `guards` package holds the exact form of each file.

### What is stored

A translation is stored as one `.tla` file, and its name in TLA+ is its file's name.
A guard has two translations or more; with one it is still checked and tested, and does not pass ([DR-243](243-guards-protect-critical-behavior-on-every-change.md)).
Translations are read in name order, and the first is the one whose model TLC checks and the code is tested against.
The declaration in TLA+ is not stored: Spex generates it on every run, and the same declaration always gives the same bytes.

### The binding and the copy

Beside its values and events, a binding's declaration names the files a run copies and the commands that build the copy.
Its module is JavaScript: it starts a fresh state and has one function for each event, which causes the event and returns the observed effect.
A guard loads before its binding has a module, so the translations can be compared and the model checked before the module is written.
The tests on the code then find a failing binding.

Every run uses a copy outside the project.
Spex copies the declared files and the binding, applies a kept fault's patch where there is one, runs the commands, and runs the module in a process of its own.
Each command and that process are stopped at the time limit.
A kept fault's patch changes existing files among the declared files only, never the binding.
The copy uses the project's installed dependencies.
A run whose process loads, in its main thread, a file of the project from outside the copy is Inconclusive, naming the file.
In this stage Spex does not see files loaded by a worker thread or by a process the code starts, or files read as data.
A binding that fails, by an error, an effect outside its declaration or a failed command, makes the check Inconclusive and never counts as catching a kept fault.
The cause it prints names a file of the copy by its path in the copy, never by the copy's own folder, so two runs print the same cause.
The declared files are the code the guard reaches, and a result names their digest.

### Approval

`spex approve <guard>` prints the guard item's statement, the rule, then each case with its steps.
For a case it prints the label, whether the case is permitted or forbidden, its plain words from the item and, under them, its steps from the guard file.
So a person can check that the steps say what the words say.
It lists the other inputs by name, says what changed since the last record, and writes the approval record, one digest for each of these **inputs**.

- the guard item, the rule and every item either cites directly
- the guard file, each translation, each kept fault and every file of the binding

`spex approve` needs neither Java nor TLC.
`spex verify` names each input that changed, was added or is gone, and the guard cannot pass until it is approved again.
Spex does not try to tell a person from an agent.
The record is a committed file, so an approval shows as a change in any review.
A guard is removed by deleting its folder, which shows the same way.

The approval covers the items that the guard item and the rule cite directly, and no further.
To any depth the first guard would cover more than a third of this tree's items.

### What a run does

`spex verify` checks every guard, or the ones it is given.

1. It loads the guard's files and items, and a guard with an error in them cannot be checked and does not pass.
2. It compares the inputs with the approval record.
3. It finds Java and TLC, and a guard cannot be checked without them.
4. TLC reads each translation alone. Every error of every translation is printed with its file and, where it has one, its place, before any other check, and the guard cannot be checked.
5. Without the code, TLC evaluates the cases under every translation, compares the translations with each other and checks the model. The three runs may start together.
6. On a copy of the project's code, Spex causes each permitted case's steps and every step of the model, and TLC judges each observed effect that differs.
7. It does the same on a copy with each kept fault.

Steps 4 to 7 and the result they give are those of [DR-244](244-a-guard-is-checked-on-the-implementation.md), and the pass rule is that of [DR-243](243-guards-protect-critical-behavior-on-every-change.md).
The code is tested only where the cases are as marked under every translation, the translations agree or there is one alone, and the model was checked to its end with no conflict and the rule applying at some step.
A translation TLC cannot evaluate, or a model's effect outside the declared effects, leaves the guard not checkable, with the place in the translation and the sequence that reached it; it is never a result.
A kept fault whose patch no longer applies, or changes none of the copied files, is not caught.
A kept fault that was not tried is reported so with the reason.
`spex verify` exits `0` only when every guard it checked passes.

### Where TLC comes from

`spex verify` needs Java 11 or later, from `JAVA_HOME` or else the `java` on the path.
The rest of the command line does not.

Spex pins one TLC: TLC 2.19, the `tla2tools.jar` of TLA+ tools v1.7.4 [[1]], with SHA-256 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`.
Spex does not ship the jar.

| Where Spex looks, in order | What it does |
| --- | --- |
| The file `SPEX_TLC_JAR` names | Uses it, and names it in the result as not the pinned copy unless its digest is the pinned one. |
| Its copy under the Spex home | Uses it where its digest is the pinned one. |
| The pinned release | Downloads it once, checks the digest and keeps it under the Spex home. |

Without Java, or without a jar it can use, a guard cannot be checked, and Spex says what to install or set.

Every run of TLC is made the same way.

- It has a fresh folder of its own under the run's temporary folder, never under the project.
- It uses one worker and fixed options, and takes no Java option from the environment.
- It counts as complete only by TLC's exit status and messages, with no state left.

The CLI's tests of guards use real TLC and the machine's Java, and a missing Java fails them by name.
CI restores the pinned jar through its download caches ([DR-228](228-ci-keeps-its-downloads.md)), names it in `SPEX_TLC_JAR`, and runs TLC on the runner's Java 21.
This repository runs `spex verify` on its own guards in its pull-request checks and before a push.
In CI that is one step on Linux alone, because once per change is enough.

### Drafting

One shipped skill, `guard`, drafts a guard with a person.

1. With the person, it writes the rule as a behavior item, splitting a broader item where needed, and the guard item with its cases in plain words. From those items it writes the binding's declaration and the guard file, with its time limit and each case's steps.
2. It has independent agents, two at the least, each draft a translation, saved as `<name>.tla`, before any agent reads the code. A drafter is given the items, the declaration, the declaration in TLA+ and the form of a translation, and nothing else. The declaration in TLA+ is the file `spex verify --keep` leaves for a guard that has no translation yet.
3. It runs `spex verify`. Where translations differ, the person answers the one question printed. The skill adds a case where a case can show the answer and rewords the item where none can ([DR-244](244-a-guard-is-checked-on-the-implementation.md)), has fresh drafters draft all the translations again, and repeats until they agree. A Conflict in the items is settled with the person here too.
4. Only then does it read the code, to write the binding's module, the files and the commands, and to plant a defect or restore a past one as a kept fault.
5. It runs `spex verify`, tells the person what it found, and runs `spex approve` only when the person says so.

When an item of a guard changes later, the skill has the translations drafted again before it asks for approval.

### The first guard

The first guard's rule and guard item are [[environments-55](../packages/environments.md#environments-55)] and [[environments-56](../packages/environments.md#environments-56)] ([DR-243](243-guards-protect-critical-behavior-on-every-change.md)).
Its binding, `installs` ([DR-244](244-a-guard-is-checked-on-the-implementation.md)), drives the package library's install into a scratch project.
Its declaration gives `install` 64 combinations of params and 32 declared effects.
Its time limit is 300 seconds.
Its kept fault restores the behavior changed on 2026-11-01 in `6000e8c`, where the path went to the first package by `<org>` even over a standing spec.

On the code of 2026-11-27 the guard's run shows this.
Three independently drafted translations each allow the three permitted cases and forbid the three forbidden cases, and they agree at every step TLC reached.
The model has 4 states and 256 steps, and the rule applies at 48 of them.
All 256 steps and the three permitted cases were tested on the code, and the code gave the model's effect each time.
The run took 13.7 seconds on a four-core Linux machine, with Java 21.0.13.1 and Node 22.23.5.

On the run's copy with the kept fault, the case “a later arrival is blocked” fails at its second install.
The code gives the path to `acme/kit` and reports `zeta/kit` blocked, which is the effect the case “a later arrival takes the path” forbids, and the kept fault is caught there.

## Consequences

A project adds a guard with two commands and one skill.
A binding's module is JavaScript until other kinds follow, so only code it can drive is reachable.
`spex verify` needs Node 22.15 or newer, which it uses to see what a copy's process loads.
Checking guards adds no dependency to `@sublang/spex`.
The first `spex verify` on a machine downloads TLC, so a machine that cannot reach the release needs `SPEX_TLC_JAR`.
An approval rests on the project's review, and a project that merges without one has only the record's history.
A guard that passed can fail later only because an input, the code or a version changed, a sequence caused again gave another effect, or a slower machine reached the time limit.
The IDE, and what [DR-243](243-guards-protect-critical-behavior-on-every-change.md) and [DR-244](244-a-guard-is-checked-on-the-implementation.md) leave for later, follow on the same stored form.

## References

[1]: https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar "TLA+ tools v1.7.4 — tla2tools.jar"
