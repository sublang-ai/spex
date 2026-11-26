<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Reading the report

What each line of `spex verify`'s report means, and what to do next.
The rule under all of it: never weaken an example, a reading or the bounds to get a pass.

## Contents

- [What a run does](#what-a-run-does)
- [The lines of a guard's block](#the-lines-of-a-guards-block)
- [Why an example is not as stated](#why-an-example-is-not-as-stated)
- [The four results](#the-four-results)
- [Why a result is Inconclusive](#why-a-result-is-inconclusive)
- [Why a kept fault is not caught](#why-a-kept-fault-is-not-caught)
- [Why a guard does not pass](#why-a-guard-does-not-pass)
- [How the command ends](#how-the-command-ends)

## What a run does

`spex verify` checks every guard, in name order; `spex verify <guard>…` checks the ones named, in the order given.
Name order is by code unit, so `entitlement-10` comes before `entitlement-2`.
It calls no model and writes nothing in the project.
For each guard it:

1. loads the guard's files and items;
2. compares them with the approval record;
3. checks every example against every reading, without the code;
4. runs each permitted example on a copy of the project's code;
5. runs the sampled check on that copy: generated sequences of the declared events, each judged step by step by every reading;
6. runs the same sampled check, at the same bounds, on a copy with each kept fault.

In the sampled check an event is caused only when every reading finds it legal, and skipped when every reading finds it not legal.
A step every reading forbids is a violation, and its sequence ends there.
A violation found in a permitted example ends the checks on that copy, so the sampled check does not run.
A guard that cannot be checked gets none of steps 2 to 6.

## The lines of a guard's block

| Line | Means | Do next |
| --- | --- | --- |
| `<guard> — protects <item>` | The guard and the behavior item its assertion cites | Nothing |
| the line under it | The assertion item's statement, each link printed as its text, so a citation reads `[entitlement-1]` | Nothing |
| `Cannot be checked — <file or item>: <cause>` | A file, an item or an expression has an error, and nothing else ran for this guard. The block is the guard's name and this line alone | Correct what is named. For a reading, relay the cause to its Drafter; never correct a reading yourself. For an effect field `guard.yaml` does not state, see Step 2 |
| `Approval: approved` | Every item and file is as the approval record holds it | Nothing |
| `Approval: not approved — changed: …; added: …; gone: …` | The named items or files differ from the record | Before the first approval, nothing. Later, review each named change. Where an item changed, draft the readings again. Then ask the person; run `spex approve <guard>` only on their word |
| `Approval: not approved — no approval record` | The guard was never approved | Finish the draft, then ask the person |
| `Approval: not approved — <path>: <cause>` | The approval record cannot be read as `spex approve` writes it, as after a merge conflict | Review the guard as for a first approval, then ask the person; `spex approve <guard>` replaces the record |
| `run spex approve <guard> after reviewing` | Printed under every `not approved`, for the person | It is not the person's word; never run `spex approve` on this line |
| `Examples against the readings: <n> examples, <m> readings, all as stated` | Every reading takes every permitted example as permitted and every forbidden one as forbidden, and a permitted example shows the behavior happening | Nothing |
| `Examples against the readings: <n> examples, <m> readings, <k> not as stated` | One line follows for each failure: `<example item>, reading <name>: <failure>` | See [Why an example is not as stated](#why-an-example-is-not-as-stated) |
| `On the code: <result>` | The one result for the project's code | See [The four results](#the-four-results) |
| `<n> sequences, <k> in which the assertion applied` | How many sequences ran, and in how many the assertion applied at some step under every reading | A small `<k>` means a thin sample: see `no sequence in which the assertion applied` below |
| `<event>: caused <n>, skipped <m>` | How often the event was caused, and how often skipped as not legal | An event never caused is not being checked: look at the readings' `legal` conditions with the person |
| `fast-check …, Spex …, Node …` | The versions the run used | Nothing |
| `revision <commit> [with changes], copied files sha256 <digest>` | The code that was checked: the Git commit, `with changes` where a copied file differs from it, and the first 12 hex digits of the copied files' digest. Without Git the line starts `no Git revision` | Nothing |
| `bounds: …` | The four bounds of the guard file | Nothing |
| `legal when — <reading>: …` | What each reading assumes about when each event can happen | Tell the person any condition other than `true`: it is an assumption of the result |
| `Kept fault <name>: caught at sequence <n>` | On the copy with the fault, the check found an effect every reading forbids; the shrunk sequence follows, its last step marked `forbidden by every reading` | Nothing |
| `Kept fault <name>: not caught — <reason>` | The guard did not catch that fault | See [Why a kept fault is not caught](#why-a-kept-fault-is-not-caught) |
| `Passes` | The guard passes | Nothing |
| `Does not pass — <reasons>` | Every reason that holds | See [Why a guard does not pass](#why-a-guard-does-not-pass) |

A step of a printed sequence reads `<n>. <event> <param>=<value> … -> <field>=<value> …`: the event, its params, then the effect that was observed.
A step with no effect field to show, such as `1. grant who=ann`, has no `->`.
A set prints as `{a, b}`, a map as `{ann: 1, bob: 0}` and the missing value as `none`.
After a count of one the report writes `example`, `reading`, `time` and `second`.

## Why an example is not as stated

Each failure names one example and one reading.

| Failure | Means | Do next |
| --- | --- | --- |
| `step <n> is not legal` | The reading finds that event cannot happen there | Step 3: settle with the person whether the example may happen, then drop each reading it contradicts |
| `step <n> is forbidden` | The reading forbids a step of a permitted example | Step 3 |
| `step <n> is forbidden before the last step` | The reading forbids a forbidden example before its last step | Step 3 |
| `the last step is not forbidden` | The reading allows what a forbidden example says must never happen | Step 3 |
| `step <n>: <cause>` | A reading error at that step: a new value outside its variable's type, or a number too large | Relay it to that reading's Drafter. If it is more than a slip of form, drop the reading |
| `no permitted example has a step at which the assertion applies under every reading` | No permitted example shows the behavior happening. This line names no example or reading | Add, with the person, a permitted example in which the assertion applies |

## The four results

The first of these that a run finds is the result.

| Result | The run found | Do next |
| --- | --- | --- |
| `Violated on the implementation` | An effect on the project's code that every reading forbids. The report prints `found in example <item>`, or `found at sequence <n> with seed <seed>, shrunk <k> times`, then the sequence, and marks the step `forbidden by every reading` | This is a finding. Show the person the sequence in plain words. If the code is wrong, the guard has done its work: the fix is a change to the code, and the same command prints the same sequence until it is made. If the person says the sequence is fine, the items say something they did not mean: correct the items with them and draft the readings again. Change no reading, example or bound to make it go away |
| `Disagreement with the model` | A permitted example whose stated effect the code did not produce, or one that shows the behavior against the readings and not on the code. The report prints `example <item>, step <n>, field <field>: stated <value>, observed <value>`, or `example <item> shows the protected behavior against the readings and not on the code` | Check the module first: does it cause that event and return what the code did? A mistake there is yours to correct. Otherwise show the person: either the example states something the code does not do, or the code is wrong. Never change an example's effect to match the code without them |
| `Inconclusive` | The check could not settle the question | See the next section |
| `Sampled on the implementation` | None of the above, with every sequence run | Say it as it is: a sample of that many sequences within those bounds found no forbidden effect, and it shows nothing beyond that sample |

## Why a result is Inconclusive

| Cause, as printed | Means | Do next |
| --- | --- | --- |
| `the examples do not agree with the readings` | A failure is listed under the `Examples against the readings` line | See [Why an example is not as stated](#why-an-example-is-not-as-stated) |
| `an undecided event at sequence <n>: the readings differ on whether it is legal` | Some readings find an event legal there and others do not. It was not caused. The report prints the sequence up to it, the event marked `(not caused)`, and each reading's finding, as `legal — a: no, b: yes` | Step 3: show the person that sequence, ending with the event |
| `an undecided step in example <item>: the readings differ on whether …`, `an undecided step at sequence <n>: the readings differ on whether …` | The line ends with what the readings differ on: `the event is legal`, `the assertion applies` or `the effect is forbidden`, two of them joined by ` and whether ` where they differ on both. The report prints the sequence up to the step and each reading's finding | Step 3: show the person that sequence with the effect that was seen |
| `a failing binding: <cause>` | The copy could not be made, a command could not start or failed, the module did not load, a function is missing or threw, a returned value is not the declared effect, the copy's process ended before it gave its result, or a sequence that broke the assertion did not when run again. For a command or process that ended early, the cause is the last line it wrote to standard error, stack lines aside | Correct the module, `files` or `commands`. Where the cause names a value outside its declared type, the declaration may be too narrow: changing its values or events means drafting the readings again |
| `a reading error: <cause>` | A reading gave a new value outside its variable's type, or a number too large. The cause names the reading | Relay it to that reading's Drafter. If it is more than a slip of form, drop the reading |
| `a project file loaded from outside the copy: <file>` | The module, or code it loads, reached a project file that `files` does not name. This is seen in the main thread of the copy's process alone, not in a worker thread or a process the code starts | Add it to `files` |
| `a timeout: not done after <n> seconds` | A command, or the copy's process, was stopped at `sample.seconds`, and every process it started with it, but on macOS and Linux not one that has left its group by starting a session of its own | Find what is slow or never returns in the commands, the module or the code. Raise `seconds` only where the checks are slow for good reason |
| `no sequence in which the assertion applied` | The sample never reached a case the assertion speaks of | Add, with the person, a permitted example that reaches such a case, since every sequence starts from one. Keep the declared values few. Raise `sequences` or `events` if that is not enough |

## Why a kept fault is not caught

A fault is caught only when the sampled check on its copy finds an effect every reading forbids.

| Reason, as printed | Means | Do next |
| --- | --- | --- |
| `the patch does not apply: <cause>` | A file it names was not copied or is not text, or a hunk matches nowhere: the code has moved | Write a replacement for the same defect on today's code. It needs the person's approval |
| `the patch changes nothing` | After the patch every copied file is as it was | Write a patch that changes what the code does |
| `the binding failed: <cause>` | With the fault, a command or the module failed | Where the cause names a value outside its declared type, the declaration is too narrow for what broken code returns: widen it and draft the readings again. Otherwise choose a fault that leaves the code building and running, and changes only what it does |
| `a timeout: not done after <n> seconds` | With the fault, a command or the copy's process was stopped at the time limit | Choose a fault that does not hang the code |
| `a reading error: <cause>` | With the fault, a reading gave a value outside its variable's type or a number too large | As `a reading error: <cause>` above |
| `a project file was loaded from outside the copy: <file>` | With the fault, the module reached a project file that `files` does not name | Add it to `files` |
| `the readings disagreed` | An undecided event or step on the copy with the fault, and no violation. The report prints no sequence here | Read the readings side by side on the case the fault breaks, find a sequence they answer differently, and take it to Step 3 |
| `no violation in <n> sequences` | Every sequence ran and none showed a forbidden effect | The guard does not catch this fault. Work out by hand the sequence that should show it. If there is none, the fault does not break the assertion: plant one that does. If there is one, add with the person a permitted example that leads up to it, or raise `sequences` or `events` |

A patch that names a path outside the binding's `files`, or that is no unified diff of the kind allowed, is not one of these: the guard is `Cannot be checked` ([formats.md](formats.md)).

## Why a guard does not pass

| Reason | Do next |
| --- | --- |
| `not approved` | Alone, at the end of a draft, it is what you want before you ask the person. Otherwise see the `Approval` line |
| `examples do not agree with the readings` | Step 3 |
| `the check on the code is <result>` | See [The four results](#the-four-results) |
| `no kept fault` | Step 4: a guard needs at least one |
| `kept fault <name> not caught` | See [Why a kept fault is not caught](#why-a-kept-fault-is-not-caught) |

## How the command ends

| Case | Exit status |
| --- | --- |
| Every guard it checked passes, or `No guards under guards/.` | `0` |
| A guard does not pass or cannot be checked; a name that is no guard; an option; a Node older than 22.15 | `1` |
| An interrupt (SIGINT) | `130` |
| A quit (SIGQUIT) | `131` |
| A request to end (SIGTERM); a hangup (SIGHUP) | `143`; `129` |

On any of the four signals `spex verify` first stops every process of its copies and removes every copy.
The last line of a run is `<n> of <m> guards pass.`

`spex approve <guard>` runs no check and asks no question, so run `spex verify` before it and after it.
It prints, in order:

1. `<guard> — protects <behavior item>`, and under it the assertion item's statement;
2. each example as `<example item> — <kind>`, its item's statement and its stored sequence;
3. how the guard stands against the last record: `First approval.`, `Nothing changed since the last approval.`, `Since the last approval:` with the `changed: …`, `added: …` and `gone: …` lines under it, or `The last record cannot be read — <path>: <cause>.`;
4. `Approved <guard> — commit guards/<guard>/approval.json.`, once the record is written.

It exits `0`. On a guard that cannot be checked it exits `1` with the cause and writes nothing.
