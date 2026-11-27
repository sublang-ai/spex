<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Reading the report

What each line of `spex verify`'s report means, and what to do next.
The rule under all of it: never weaken a case, a translation or the declared values to get a pass, and never change a translation to fit the code.

Every report in this file is real output, for one made-up guard: `lock-9`, on a lock that one user holds while others wait, with translations `a` and `b`.
[formats.md](formats.md) shows its items, its declaration and the translation `a`.

## Contents

- [What a run does](#what-a-run-does)
- [The lines of a guard's block](#the-lines-of-a-guards-block)
- [A guard that cannot be checked](#a-guard-that-cannot-be-checked)
- [Why the check of cases fails](#why-the-check-of-cases-fails)
- [A distinguishing sequence](#a-distinguishing-sequence)
- [The results](#the-results)
- [Conflict in the items](#conflict-in-the-items)
- [Violated on the code](#violated-on-the-code)
- [Code differs from the model](#code-differs-from-the-model)
- [Case failed](#case-failed)
- [Why a result is Inconclusive](#why-a-result-is-inconclusive)
- [What a passing result rests on](#what-a-passing-result-rests-on)
- [Why a kept fault is not tried or not caught](#why-a-kept-fault-is-not-tried-or-not-caught)
- [Why a guard does not pass](#why-a-guard-does-not-pass)
- [Keeping what TLC ran](#keeping-what-tlc-ran)
- [How the command ends](#how-the-command-ends)

## What a run does

`spex verify` checks every guard, in name order; `spex verify <guard>…` checks the ones named.
Name order is by code unit, so `environments-100` comes before `environments-56`.
It calls no agent and no language model, draws nothing at random and writes nothing in the project: the same files and code give the same run.
It needs Java 11 or later, from `JAVA_HOME` or else the `java` on the path, and one pinned TLC, TLC 2.19, which the first run downloads to the Spex home, checking its digest.
Where `SPEX_TLC_JAR` names a `tla2tools.jar`, that one is used.

Without the code, by TLC, for each guard:

1. **Form.** Each translation is read alone. Every error of every translation is printed, and nothing else is checked until there is none.
2. **Cases.** Every translation must allow each permitted case and forbid each forbidden case, and under every translation the rule must apply at some step of a permitted case.
3. **Translations against each other.** TLC checks all translations side by side: at every step any of them reaches they must give the same four answers, compared in this order: whether the event is legal, what the model's effect is, whether the rule applies, and whether an effect is forbidden, the last for every declared effect. A guard needs two translations or more: one has nothing to be compared with, and the guard then does not pass.
4. **On the model.** TLC checks the model of the first translation in name order: in every state the model reaches, for every legal event, the model's effect is a declared effect and the rule does not forbid it. TLC ends only when no state is left, so the check is complete for this model and the declared values.

On a copy of the code, which is testing, and only where the cases are as marked, the translations agree or there is one alone, and the model was checked to its end:

5. Each permitted case's steps are caused, and each stated effect field compared.
6. Every step of the model is caused once: a fresh start, a shortest sequence to its state, then its event. The observed effect must equal the model's. An observed effect that differs is given to TLC, which says whether the rule forbids it. Where TLC is stopped at the time limit before it says, the step is counted as `not judged`.
7. Steps 5 and 6 run again on a copy with each kept fault. A fault is caught only where the rule forbids an observed effect.

A **step** is one event with its params and an effect: stated in a case, given by the model, judged by the rule, observed on the code.
A **step of the model** is one legal event in one state of the model.
A translation **allows** a permitted case where every step is legal, its model gives each effect field the step states, and no step is forbidden.
It **forbids** a forbidden case where the steps before the last go so, and at the last step the rule applies, some declared effect agrees with the stated fields, and every such effect is forbidden.
An event is **legal** where the event can happen in this state at all, as a refund cannot before a charge.
An event that is not legal is not tried on the code; it is never a violation.

This is the report of a passing run of the made-up guard:

```text
Protect critical behavior on every change

lock-9 — checks the rule lock-3:
  While a user holds the lock, when another user takes it, the lock shall stay with its holder,
  refuse the taker and report the taker among those waiting, as [lock-4] orders them.
  Approval: approved
  Cases, without the code: each of 2 translations allows the 2 permitted cases and forbids the 1 forbidden case
  Translations against each other: 2 translations, in agreement at every step TLC reached
  On the model: TLC 2.19 checked every state the model of translation a reaches: 13 states, 40 steps; the rule applied at 12 steps
    TLC's own estimate of the chance it missed a state: 8.0E-17
  On the code: 40 steps tested, each after a shortest sequence from a fresh start: each gave the model's effect
    the 2 permitted cases went as their steps state
  Result: Model checked, code tested
    assumes: the declared values are the ones that matter (user = ann, bob, cy)
             what the code does next depends only on the model's state, each step being tried from one sequence
             the binding causes and observes truly
    Spex 5.0.0, Node 22.23.5, TLC 2.19 (the pinned copy), Java 21.0.13.1
    no Git revision, copied files sha256 10a99333b2f6
    limits: 60 seconds for each run of TLC and each command
  Kept fault grants-twice: caught at step 2 of the permitted case "a second taker waits"
    1. take who=ann -> granted=true holder=ann waiting={}
    2. take who=bob
       the model gives granted=false holder=ann waiting={bob}
       the code gave   granted=true holder=ann waiting={bob}
       forbidden by the rule
  Passes

1 of 1 guards pass.
```

Its revision line reads `no Git revision` because the made-up project is no Git repository.

## The lines of a guard's block

| Line | Means | Do next |
| --- | --- | --- |
| `<guard> — checks the rule <item>:` | The guard and the rule, the behavior item its guard item cites | Nothing |
| the lines under it | The rule's statement, each link printed as its text, so a citation reads `[lock-4]` | Nothing |
| `Cannot be checked — <cause>` | Something does not load or cannot be read, and nothing else ran for this guard. The block is the guard's name and these lines alone | See [A guard that cannot be checked](#a-guard-that-cannot-be-checked) |
| `Approval: approved` | Every item and file is as the approval record holds it | Nothing |
| `Approval: not approved — changed: …; added: …; gone: …` | The named items or files differ from the record | Before the first approval, nothing. Later, review each named change. Where an item changed, draft the translations again. Then ask the person; run `spex approve <guard>` only on their word |
| `Approval: not approved — no approval record` | The guard was never approved | Finish the draft, then ask the person |
| `Approval: not approved — <path>: <cause>` | The approval record cannot be read as `spex approve` writes it, as after a merge conflict | Review the guard as for a first approval, then ask the person; `spex approve <guard>` replaces the record |
| `review the guard's items and files, then run spex approve <guard>` | Printed under every `not approved`, for the person | It is not the person's word; never run `spex approve` on this line |
| `Cases, without the code: each of <m> translations allows the <p> permitted cases and forbids the <f> forbidden cases` | Every translation allows each permitted case and forbids each forbidden case. With one translation the line starts `the translation allows` | Nothing |
| `Cases, without the code: <n> cases, <m> translations, <k> failures` | One line follows for each failure | See [Why the check of cases fails](#why-the-check-of-cases-fails) |
| `Cases, without the code: not checked — TLC was stopped after <n> seconds while it evaluated the cases` | A timeout | See [Why a result is Inconclusive](#why-a-result-is-inconclusive) |
| `Translations against each other: <m> translations, in agreement at every step TLC reached` | Printed for two translations or more: TLC found no step, in any state any of them reaches, at which their answers differ | Nothing. Agreement shows the Drafters read the items alike, not that the reading is right: the cases and the person's approval carry that |
| `Translations against each other: 1 translation, nothing to compare it with` | The guard has one translation. It is still checked and tested in full, and it does not pass | Step 2: have fresh Drafters draft the translations again, so that two or more are compared |
| `Translations against each other: <m> translations, they differ at step <k> of this sequence` | TLC's shortest sequence to a difference follows, with the question its last step puts and each translation's answer | See [A distinguishing sequence](#a-distinguishing-sequence) |
| `Translations against each other: <m> translations, not compared — TLC was stopped after <n> seconds` | A timeout | See [Why a result is Inconclusive](#why-a-result-is-inconclusive) |
| `On the model: TLC <v> checked every state the model of translation <name> reaches: <n> states, <n> steps; the rule applied at <n> steps` | TLC ended with no state left: in every state, for every legal event, the model's effect is a declared one and the rule does not forbid it | A rule that applied at few steps is thinly checked: look at the declared values with the person |
| `TLC's own estimate of the chance it missed a state: <x>` | TLC's own figure, printed with every complete check: the chance that it took two different states for one | Nothing |
| `On the model: Conflict in the items — …` | The items, as translated, require an effect the rule forbids | See [Conflict in the items](#conflict-in-the-items) |
| `On the model: not checked — TLC was stopped after <n> seconds` | A timeout | See [Why a result is Inconclusive](#why-a-result-is-inconclusive) |
| `On the code: <n> steps tested, each after a shortest sequence from a fresh start: each gave the model's effect` | Every step of the model was caused on the copy once, and the observed effect equalled the model's each time. For a model of one step the line reads `1 step tested, after a shortest sequence from a fresh start: it gave the model's effect` | Nothing |
| `On the code: <n> steps tested, …: <a> gave the model's effect, <b> an effect the rule forbids, <c> another effect, <d> not reached` | Some did not. A step is not reached, and is counted and not judged, where an earlier step of its sequence already gave another effect. The line ends `, <e> not judged` where the run of TLC that judges the code's effects was stopped at the time limit: those steps gave an effect that is not the model's, and nothing was said of it. The five counts add up to the steps tested | See the result |
| `On the code: <m> of <n> steps tested` | The copy's process did not get through every step | See the cause under `Result:` |
| `the <p> permitted cases went as their steps state`, `<m> of <p> permitted cases went as their steps state` | How many permitted cases the code acted out. The line is printed only where a case was caused, so not after a binding that failed before any event | For fewer than all, see [Case failed](#case-failed) |
| `On the code: not tested — <why>` | The checks without the code did not all hold, so no copy was made | See the line the reason names |
| `On the code: not tested` | A failing binding or a timeout before the copy's process started: no module or no `files`, a copy that could not be made, or a command that failed or was stopped | See the cause under `Result:` |
| `Result: <result>` | The one result for the guard, the highest row found | See [The results](#the-results) |
| `assumes: …`, and the two lines under it | The three things `Model checked, code tested` rests on, one to a line | Tell the person all three: [What a passing result rests on](#what-a-passing-result-rests-on) |
| `Spex …, Node …, TLC … (the pinned copy), Java …` | The versions the run used. `not the pinned copy` where `SPEX_TLC_JAR` names a jar with another digest | For another jar, tell the person: the result is by a TLC Spex does not pin |
| `revision <commit> [with changes], copied files sha256 <digest>` | The code that was tested: the Git commit, `with changes` where a copied file differs from it, and the first 12 hex digits of the copied files' digest. Without Git the line starts `no Git revision`; where no copy was made it ends `no files copied` | Nothing |
| `limits: <n> seconds for each run of TLC and each command` | The time limit of the guard file | Nothing |
| `Kept fault <name>: caught at step <k> of …` | On the copy with the fault, the code gave an effect the rule forbids; the sequence follows, with the model's effect and the observed effect at its last step | Nothing |
| `Kept fault <name>: not tried — <reason>`, `not caught — <reason>` | The guard did not catch that fault | See [Why a kept fault is not tried or not caught](#why-a-kept-fault-is-not-tried-or-not-caught) |
| `Passes` | The guard passes | Nothing |
| `Does not pass — <reasons>` | Every reason that holds | See [Why a guard does not pass](#why-a-guard-does-not-pass) |

A step of a printed sequence reads `<n>. <event> <param>=<value> … -> <field>=<value> …`: the event, its params, then an effect.
Which effect it is depends on the place: the model's in a distinguishing sequence and in a conflict, the observed one in a sequence on the code, the stated one in what `spex approve` prints.
A step with no effect to show has no `->`.
A set prints as `{a, b}` and the missing value as `none`.
After a count of one the report writes `case`, `translation`, `failure`, `state`, `step` and `second`.

## A guard that cannot be checked

The block is the guard's name and one `Cannot be checked` line for each cause.
A note and steps stand under a cause where TLC met it at a place.
A guard that cannot be checked does not pass, and is not a result: nothing was found about the items or the code.

Two translations with errors of form, both printed in one run:

```text
lock-9
  Cannot be checked — guards/lock-9/translations/a.tla:22:28: CHOOSE is not for a translation: choose among declared values with <Values>First or <Values>Rank, so no answer rests on TLC's own order
  Cannot be checked — guards/lock-9/translations/b.tla:7:1: Was expecting "==== or more Module body" Encountered "Holder" at line 7, column 1 and token ">>"
```

An expression TLC could not evaluate, with the sequence that reached it:

```text
lock-9
  Cannot be checked — guards/lock-9/translations/a.tla:20:22: Attempted to compute the value of an expression of form CHOOSE x \in S: P, but no element of S satisfied P.
    TLC met it on the model, after this sequence
      1. take who=ann -> granted=true holder=ann waiting={}
```

An effect that is no declared effect:

```text
lock-9
  Cannot be checked — guards/lock-9/translations/a.tla: the model gives leave an effect the declaration does not hold: {holder: none, queue: 5}
    TLC met it on the model, at step 2 of this sequence
      1. take who=ann -> granted=true holder=ann waiting={}
      2. leave who=ann
```

| Cause | Means | Do next |
| --- | --- | --- |
| `guards/<guard>/translations/<name>.tla:<line>:<col>: <message>`, or the same with no line | The translation's form: a word or a prime it may not hold, an operator missing or with the wrong number of parameters, text TLC's parser refuses, a file it may not load, an expression TLC could not evaluate, a definition that calls itself without end, or an effect the declaration does not hold | Relay the whole line, with any note and steps under it, to that translation's Drafter, to correct its form from the cause alone. Never correct a translation yourself |
| `guards/<guard>/translations/<name>.tla: a translation's name is …`, `'<name>' is the name of a file TLC or Spex loads; pick another` | The file's name | Rename the file and have its Drafter change its `---- MODULE <name> ----` line to match |
| `guards/<guard>/translations: no translation; a guard needs two or more` | No translation is saved yet, or every one was dropped | Step 2 |
| `guards/<guard>/translations/<name>.tla: TLC was stopped after <n> seconds while it read the file` | A timeout while the file was parsed | Run again; if it repeats, relay it to the Drafter |
| `guards/<guard>/guard.yaml: <cause>`, `guards/bindings/<binding>/binding.yaml: <cause>`, an item or a patch | A file or an item does not load | Correct what is named. For a case with no entry, an entry for no case or a case entered twice, make the labels in the guard file and in the item the same. A change to the declaration's values or events means drafting the translations again |
| `<guard item>: the list entry '<line>' starts with <word> and is not written as a case: …` | A list entry of the guard item starts with `permitted` or `forbidden`, in any letter case, and is not in a case's form, so a reader would take it for a case that `spex verify` does not check | Write it as a case, in the form the line gives, or reword it so that it starts otherwise |
| `guards/bindings/<binding>/binding.yaml: the declaration in TLA+ does not parse: <message>` | Spex's own generated file was refused | Report it to the person with the message: it is an error in Spex, not in the guard |
| `Java was not found: …`, `Java <version> is too old: …` | `spex verify` runs TLC, which needs Java 11 or later | Have the person install one, or set `JAVA_HOME` to one |
| `SPEX_TLC_JAR names <value>, which is no file — …` | The variable names no file | Set it to a `tla2tools.jar`, or unset it |
| `TLC 2.19 could not be downloaded from <url>: <cause> — …`, `what <url> gave is not TLC 2.19: …`, `TLC 2.19 could not be kept at <path>: …` | The pinned TLC could not be had | Have the person download the file the line names, check its sha256 against the one the line gives, and set `SPEX_TLC_JAR` to it |
| `Java ended with status <n> before TLC started: <Java's words>`, `Java was ended before TLC started` | Java ran and TLC did not. Where the line goes on `— SPEX_TLC_JAR names <jar>, which is not the pinned tla2tools.jar`, that file is the likely cause | Set `SPEX_TLC_JAR` to a `tla2tools.jar`, or unset it for Spex to download TLC. Otherwise show the person Java's words |
| `TLC ended with status <n> <doing>`, `TLC was ended <doing>`, `TLC could not start: <cause>` | A run of TLC ended in a way Spex does not read. TLC's words, or else Java's, follow a colon where there are any | Run again with `--keep` ([Keeping what TLC ran](#keeping-what-tlc-ran)) and show the person TLC's own output |
| `TLC's table of the model's steps cannot be read: <cause>` | TLC checked the model, and Spex could not read the table of steps it wrote; for `it is too large, <n> bytes` the model has too many steps | For a table too large, declare fewer values with the person, which means drafting the translations again. Otherwise run again with `--keep` and show the person |

The note under a cause says where TLC met it: `on the model`, `comparing the translations`, in a named case, or `judging the effect the code gave`, with the sequence before it.
A note with no steps under it, as `TLC met it on the model`, means that TLC printed no sequence.
Give the Drafter the note and the sequence with the cause: they say which state reached the expression.

## Why the check of cases fails

Each failure names one case, by its kind and its label in quotes, and one translation:

```text
  Cases, without the code: 3 cases, 2 translations, 1 failure
    forbidden case "a second taker gets the lock", translation b: step 2 is not forbidden: the rule allows granted=true holder=none waiting={} and 31 more
```

| Failure | Means | Do next |
| --- | --- | --- |
| `step <n> is not legal` | The translation finds that event cannot happen there | The case is the person's word, so the translation is wrong: drop it, by deleting its file. Where you doubt the case's steps say what its words say, check them first |
| `at step <n> the model gives <effect>` | The translation's model gives another effect than a step states | The same |
| `step <n> is forbidden: the model gives <effect>` | The translation's rule forbids its own model's effect at a step that must be allowed | The same |
| `the rule does not apply at step <n>` | At a forbidden case's last step the translation's rule does not apply | The same |
| `step <n> is not forbidden: the rule allows <effect> and <k> more` | The translation allows what a forbidden case says must never happen: some declared effect that agrees with the fields the last step states | Check first that the step states every field the case's words speak of: a field left out stands for all its values. Then the same |
| `translation <name>: the rule applies at no step of a permitted case` | Under that translation no permitted case shows the rule at work | Where one translation says so, drop it. Where every translation does, add, with the person, a permitted case in which the rule applies |

Never edit a translation to make a case hold.
A report that lists a failure may print a distinguishing sequence too: delete each file a failure names and run again before you ask the person about it ([A distinguishing sequence](#a-distinguishing-sequence)).
If no translation is left, the items do not yet say what the person means: correct the items with them and return to Step 2 with fresh Drafters.

## A distinguishing sequence

Where a guard has two translations or more, TLC checks them side by side, over every sequence of events any of them allows.
The check is complete when it ends: `in agreement at every step TLC reached` means no step, in any state any of them reaches, at which they answer differently.
Where they differ, TLC's shortest sequence to a difference is the **distinguishing sequence**.
Every step before its last is one all the translations agree on, shown with the model's effect.
Under the last step stand the one question that step puts and each translation's answer:

```text
  Translations against each other: 2 translations, they differ at step 3 of this sequence
    1. take who=ann -> granted=true holder=ann waiting={}
    2. take who=bob -> granted=false holder=ann waiting={bob}
    3. take who=bob
       is step 3 legal? a: no, b: yes
       not run on the code: the effects of the earlier steps are the model's, on which the translations agree
  On the model: TLC 2.19 checked every state the model of translation a reaches: 13 states, 40 steps; the rule applied at 12 steps
    TLC's own estimate of the chance it missed a state: 8.0E-17
  On the code: not tested — the translations differ
  Result: Inconclusive
    the translations differ
    Spex 5.0.0, Node 22.23.5, TLC 2.19 (the pinned copy), Java 21.0.13.1
    no Git revision, no files copied
    limits: 60 seconds for each run of TLC and each command
  Kept fault grants-twice: not tried — the translations differ
  Does not pass — the translations differ; the result is Inconclusive; kept fault grants-twice not tried
```

The sequence is not run on the code.
The last line under the question says so, and that the effects shown on the earlier steps are the model's, on which the translations agree; each answer to the question is one translation's own.
Where the translations differ at the first step, that line reads `not run on the code` alone.
Without agreement no translation judges the code: the result is `Inconclusive`, no copy is made, and each kept fault is `not tried`.
The `On the model` line is still printed, for the first translation in name order.

The person answers the question, and their answer settles the difference in one of two ways:

- **A case, where a case can show the answer.** Add the case to the guard item, under a new label and in plain words, and under the same label its steps to the guard file.
- **A reworded item, where no case can.** Reword the item with the person so that it says their answer.

Either way an item has changed, so fresh Drafters draft all the translations again from the changed items: delete the translations and return to Step 2.
Never edit a translation to make it agree.

For every question:

1. Say it to the person in plain words, as a case would: what happened, in order, and what the last step asks. Use no notation, and do not say which translation answered what.
2. Ask them, and wait for their answer. Never choose it yourself.
3. Add the case or reword the item, as the table says.
4. Have fresh Drafters draft all the translations again (Step 2), then run again: one run prints one sequence, and the next run prints the next.

| Question | The person's answer becomes |
| --- | --- |
| `is step <k> legal?` | Legal: a permitted case that holds the step. Not legal: no case can show it, so the item is reworded |
| `what must step <k> give?` | The person names the effect, and a permitted case states it. Where no item says it, the item is reworded too |
| `does the rule apply at step <k>?` | It applies: a forbidden case that ends at the step. It does not: no case can show it, so the rule's item is reworded |
| `is this effect forbidden at step <k>?` | Forbidden: a forbidden case. Permitted, and the model's effect: a permitted case. Permitted, and not the model's effect: no case can show it, so the rule's item is reworded |

A case need not repeat the printed sequence: it may state any steps that put the same question.
Where a case was added, it also tells the translations apart without help: one that the answer contradicts fails the check of cases, with the failure named below.

**`is step <k> legal?`**

```text
  Translations against each other: 2 translations, they differ at step 3 of this sequence
    1. take who=ann -> granted=true holder=ann waiting={}
    2. take who=bob -> granted=false holder=ann waiting={bob}
    3. take who=bob
       is step 3 legal? a: no, b: yes
       not run on the code: the effects of the earlier steps are the model's, on which the translations agree
```

Ask whether that event can happen there at all: "bob is already waiting for the lock ann holds. Can bob ask for it again?"

- It can: ask what is seen when it does, and add a permitted case that ends with that step and that effect. A translation that answers `no` fails it with `step <k> is not legal`.
- It cannot: no case can hold a step that cannot happen. Reword the item so that it says so.

**`what must step <k> give?`**

```text
  Translations against each other: 2 translations, they differ at step 2 of this sequence
    1. take who=ann -> granted=true holder=ann waiting={}
    2. leave who=ann
       what must step 2 give?
         a: holder=none queue=0
         b: holder=ann queue=0
       not run on the code: the effects of the earlier steps are the model's, on which the translations agree
```

Each translation's model gives another effect.
Ask what is seen: "ann holds the lock and nobody waits. Ann leaves. Who holds the lock then?"
The person names the effect.
Add a permitted case that ends with that step and states that effect: a translation whose model gives another fails it with `at step <k> the model gives …`.
Where no item says the effect, reword the item too, or the item it should cite, so that it does.

**`does the rule apply at step <k>?`**

```text
  Translations against each other: 2 translations, they differ at step 2 of this sequence
    1. take who=ann -> granted=true holder=ann waiting={}
    2. reset
       does the rule apply at step 2? a: no, b: yes
       not run on the code: the effects of the earlier steps are the model's, on which the translations agree
```

Ask whether the rule has anything to say about that step: "ann holds the lock, and the lock is made new. Does the rule about a held lock say what must be seen then?"

- It does: ask what must never be seen there, and add a forbidden case that ends with that step and that effect. A translation that answers `no` fails it with `the rule does not apply at step <k>`.
- It does not: no case can show it, because a translation whose rule applies there may still allow what the step gives. Reword the rule's item so that it says where it stops applying. A permitted case that ends with that step still shows a reader where the rule stops, as the last two cases of the worked guard in formats.md do.

**`is this effect forbidden at step <k>?`**

```text
  Translations against each other: 2 translations, they differ at step 2 of this sequence
    1. take who=ann -> granted=true holder=ann waiting={}
    2. take who=bob
       is this effect forbidden at step 2? granted=false holder=ann waiting={ann, bob}
         a: no, b: yes
       the model gives granted=false holder=ann waiting={bob}
       not run on the code: the effects of the earlier steps are the model's, on which the translations agree
```

The translations agree on what the step gives and on whether the rule applies, and differ on one declared effect the rule might forbid.
The line under the answers says what the model gives at that step.
Here the effect asked about is one the model never gives: ann both holds the lock and waits for it.
Where the effect asked about is the model's own, that line reads `the model gives this effect`.
Ask whether it may ever be seen: "ann holds the lock and bob asks for it. Bob is refused and the lock stays with ann, and both ann and bob are reported waiting. Must that never be seen?"

| The answer | Do |
| --- | --- |
| Forbidden | Add a forbidden case that ends with that step and that effect. A translation that answers `no` fails it with `step <k> is not forbidden` |
| Permitted, and the report reads `the model gives this effect` | Add a permitted case that ends with that step and that effect. A translation that answers `yes` fails it with `step <k> is forbidden` |
| Permitted, and the report names another effect as the model's | No case can show it: a permitted case states what the items require, and the items require another effect here. With the person, reword the rule's item to say what it leaves free |

**A sequence beside a failure**

A translation that fails the check of cases is still compared with the others, so one report may hold both a failure and a distinguishing sequence.
Here `b`'s rule allows any effect:

```text
  Cases, without the code: 3 cases, 2 translations, 1 failure
    forbidden case "a second taker gets the lock", translation b: step 2 is not forbidden: the rule allows granted=true holder=none waiting={} and 31 more
  Translations against each other: 2 translations, they differ at step 2 of this sequence
    1. take who=ann -> granted=true holder=ann waiting={}
    2. take who=bob
       is this effect forbidden at step 2? granted=false holder=none waiting={}
         a: yes, b: no
       the model gives granted=false holder=ann waiting={bob}
       not run on the code: the effects of the earlier steps are the model's, on which the translations agree
```

Act on the failure first: delete each file a failure names and run again, and ask the person nothing about a sequence printed beside a failure.
Never edit a translation to make it agree, and never delete one alone without a failure that names it.
If no translation is left, the items do not yet say what the person means: correct them with the person and return to Step 2 with fresh Drafters.

## The results

A guard gets one result: the highest row of this table that a run finds.

| Result | What it establishes |
| --- | --- |
| `Conflict in the items` | TLC found a sequence after which the items, as translated, require an effect the rule forbids |
| `Violated on the code` | The code did what the rule forbids |
| `Code differs from the model` | The code gave an effect the model does not give and the rule does not forbid |
| `Case failed` | A permitted case did not go on the code as its steps state |
| `Inconclusive` | The check could not settle, as when time ran out, a case did not hold without the code, the translations differ, the rule applied at no step, a sequence did not repeat, or the binding failed |
| `Model checked, code tested` | TLC checked every state the model reaches, complete for the declared values, and the model never gives an effect the rule forbids. Every step of the model was then caused on the code once, and the code gave the model's effect each time |

Report a result in these words, with what it assumes.
Spex gives no one-word verdict: never call a guard verified, valid or proved.

## Conflict in the items

```text
  On the model: Conflict in the items — TLC 2.19 found it at step 2 of this sequence, as translation a reads the items
    1. take who=bob -> granted=true holder=bob waiting={}
    2. take who=cy
       the model gives granted=true holder=bob waiting={cy}
       forbidden by the rule
  On the code: not tested — the model conflicts with the rule
  Result: Conflict in the items
    Spex 5.0.0, Node 22.23.5, TLC 2.19 (the pinned copy), Java 21.0.13.1
    no Git revision, no files copied
    limits: 60 seconds for each run of TLC and each command
  Kept fault grants-twice: not tried — the model conflicts with the rule
  Does not pass — the result is Conflict in the items; kept fault grants-twice not tried
```

In the model of the first translation in name order, TLC reached a step at which the model's effect is one the rule forbids.
The model says only what the items say, so, as that translation reads them, one item requires what the rule forbids.
No code is tested, and this is settled before any agent reads the code.

1. Say the sequence to the person in plain words: what happens, what the items say is then seen, and that the rule forbids it.
2. Ask them which is meant.
3. Reword the item that says what they do not mean, with them: the rule, or the item that says what the event gives.
4. Draft the translations again, from Step 2, with fresh Drafters: the items' meaning changed.

Where the person says the items are right and do not conflict, the translation misread them, which translations in agreement make unlikely.
Then have fresh Drafters draft the translations again.
Never edit a translation to make the conflict go away.

## Violated on the code

```text
  On the code: 40 steps tested, each after a shortest sequence from a fresh start: 10 gave the model's effect, 6 an effect the rule forbids, 0 another effect, 24 not reached
    1 of 2 permitted cases went as their steps state
    Violated on the code — found at step 2 of the permitted case "a second taker waits"
      1. take who=ann -> granted=true holder=ann waiting={}
      2. take who=bob
         the model gives granted=false holder=ann waiting={bob}
         the code gave   granted=true holder=ann waiting={bob}
         forbidden by the rule
    Case failed — case "a second taker waits", step 2, field granted: stated false, observed true
  Result: Violated on the code
```

On the copy, a step gave an effect the rule forbids.
The report prints the sequence with the observed effects, the model's effect and the code's at its last step, and `forbidden by the rule`.
It is found at a step of the model, `of this sequence`, or at a step of a permitted case.
Only the first violation is printed; the counts tell how many steps gave a forbidden effect, and how many were not reached because an earlier step of their sequence had already gone another way.

The code breaks the rule on that sequence.
Show the person the sequence in plain words.
If the code is wrong, the guard has done its work: the fix is a change to the code, and the same command prints the same sequence until it is made.
If the person says the sequence is fine, the items say something they did not mean: correct the items with them and draft the translations again.
Change no translation, case or declared value to make it go away.

## Code differs from the model

```text
  On the code: 40 steps tested, each after a shortest sequence from a fresh start: 37 gave the model's effect, 0 an effect the rule forbids, 3 another effect, 0 not reached
    1 of 2 permitted cases went as their steps state
    Code differs from the model — found at step 4 of this sequence
      1. take who=ann -> granted=true holder=ann waiting={}
      2. take who=bob -> granted=false holder=ann waiting={bob}
      3. take who=cy -> granted=false holder=ann waiting={bob, cy}
      4. leave who=ann
         the model gives holder=bob queue=1
         the code gave   holder=cy queue=1
         not forbidden by the rule
    Case failed — case "the first waiting user is next", step 4, field holder: stated bob, observed cy
  Result: Code differs from the model
```

The code gave an effect the model does not give and the rule does not forbid.
The rule was not seen broken, and the check cannot go on from there: every later step of that sequence would start from a state the model does not describe.
So the guard does not pass.

Ask the person which is right, in plain words: "After ann, bob and cy ask for the lock and ann leaves, the items say the lock passes to bob. The code passes it to cy. Which is meant?"

| The person says | Do |
| --- | --- |
| The items are right | The code is wrong, though not against this rule. The fix is a change to the code |
| The code is right | An item says something they did not mean, or leaves the effect open and the Drafters filled it in. Reword the item with them, and draft the translations again from Step 2 |

Check the module first: a binding that reports the effect wrongly gives the same line.
Never change a translation to fit the code: what must hold comes from the items and the person.

## Case failed

```text
  On the code: 40 steps tested, each after a shortest sequence from a fresh start: each gave the model's effect
    1 of 2 permitted cases went as their steps state
    Case failed — case "the first waiting user is next", step 4, field holder: stated bob, observed cy
  Result: Case failed
```

A permitted case did not go on the code as its steps state: a stated effect field was not what the code gave.
It is a difference from the model, found at a step of a case; where the observed effect is also one the rule forbids, the result is `Violated on the code`.

Check the module first: does it cause that event and return what the code did?
A mistake there is yours to correct.
Otherwise show the person: either the case states something the code does not do, or the code is wrong.
Never change a case's words or its stated effect to match the code without them.

## Why a result is Inconclusive

The causes are printed under `Result: Inconclusive`.

| Printed cause | Means | Do next |
| --- | --- | --- |
| `the check of cases without the code failed` | A failure is listed under the `Cases, without the code` line | See [Why the check of cases fails](#why-the-check-of-cases-fails) |
| `the translations differ` | A distinguishing sequence is printed, and no translation judges the code | See [A distinguishing sequence](#a-distinguishing-sequence) |
| `the translations were not compared: TLC was stopped after <n> seconds` | Comparing them took longer than the limit | Declare fewer values, or raise `limits.seconds` where the comparison is large for good reason. Where one translation's model reaches no end of states, relay that to its Drafter |
| `a timeout: TLC was stopped after <n> seconds while it evaluated the cases`, `… while it checked the model`, `… while it judged the effects the code gave` | A run of TLC took longer than the limit. Where it was the judging run, the `On the code` line counts the steps it left as `not judged` | For the model: a state that grows with every event, as a count or a log does, gives a model with no end. Relay it to the Drafter of the first translation; do not raise the limit for it. Otherwise declare fewer values or raise `limits.seconds` |
| `a timeout: not done after <n> seconds` | A command, or the copy's process, was stopped at `limits.seconds`, and every process it started with it, but on macOS and Linux not one that has left its group by starting a session of its own | Find what is slow or never returns in the commands, the module or the code. Raise `seconds` only where the code is slow for good reason |
| `the rule applied at no step of the model` | TLC checked the model to its end, and in no state did the rule apply | The declared values or events cannot reach what the rule speaks of. Look at the declaration with the person; a change to it means drafting the translations again |
| `a failing binding: <cause>` | The binding lacks its module (`no binding.mjs`) or its `files` (`the declaration names no files`), the copy could not be made, a command could not start or ended with a non-zero status, the module did not load or lacks an export, a function threw, a returned value is not the declared effect, or the copy's process ended before every sequence was caused. A path the cause names inside the copy is relative to the copy | Before Step 4, `no binding.mjs` is expected. Otherwise correct the module, `files` or `commands`. Where the cause names a value outside its declared type, the declaration may be too narrow: changing its values or events means drafting the translations again |
| `a project file loaded from outside the copy: <path>` | The module, or code it loads, reached a project file that `files` does not name. This is seen in the main thread of the copy's process alone | Add it to `files` |
| `a sequence did not repeat: caused again, its last step gave another effect` | The same events from a fresh start gave two effects; both are printed, as `first` and `again` | Find what the module or the code keeps from one sequence to the next, or what depends on the clock, a random number or the order of a listing. Correct the module; where it is the code's own behavior, make its cause an event, or tell the person the behavior cannot be tested this way |

A failing binding:

```text
  On the code: 0 of 40 steps tested
    1 of 2 permitted cases went as their steps state
  Result: Inconclusive
    a failing binding: leave threw: the queue is full
```

A sequence that does not repeat:

```text
  On the code: 40 steps tested, each after a shortest sequence from a fresh start: 27 gave the model's effect, 0 an effect the rule forbids, 0 another effect, 13 not reached
    the 2 permitted cases went as their steps state
  Result: Inconclusive
    a sequence did not repeat: caused again, its last step gave another effect
      1. take who=bob
         first  granted=true holder=bob waiting={}
         again  granted=true holder=bob waiting={bob}
```

## What a passing result rests on

`Model checked, code tested` is two things, and say which is which:

- **The model is checked.** TLC, a model checker others trust, checked every state the model reaches, complete for this model and the declared values: the model never gives an effect the rule forbids. That is the formal half.
- **The code is tested.** Every step of the model was caused on the copy once, from a fresh start after one shortest sequence, and the code gave the model's effect. That is testing: nothing is drawn at random, and nothing is left out among the model's steps, but Spex does not explore the code's own states.

The report's three `assumes:` lines say what the result takes for granted, and the person must hear all three:

| Assumed | Means |
| --- | --- |
| `the declared values are the ones that matter (<set> = <values> …)` | Only the declared events were tried, with only the declared values. Another way into the code, or a value outside the sets, was not |
| `what the code does next depends only on the model's state, each step being tried from one sequence` | Where the code keeps something the model's state does not hold, two sequences to one state of the model could behave differently, and only one of them was tried |
| `the binding causes and observes truly` | The module causes each event as declared and reports what the code did |

Beyond those: the translation says what the items mean, and the cases the person approved are what tie it to the items' words.
The kept faults show that the same check, on code with a known defect, sees the rule broken.

## Why a kept fault is not tried or not caught

A kept fault is caught only where, on its copy, the code gives an effect the rule forbids.
A mere difference from the model does not catch it.
It is `not tried` where no copy was made for it, and otherwise `not caught`.
Either keeps the guard from passing.

```text
  Kept fault last-waiting: not caught — the code gave no effect the rule forbids in 40 steps tested; 3 did not give the model's effect
  Does not pass — not approved; kept fault last-waiting not caught
```

| Printed after `Kept fault <name>:` | Means | Do next |
| --- | --- | --- |
| `not tried — the check of cases without the code failed`, `the translations differ`, `the translations were not compared`, `the model conflicts with the rule`, `the model was not checked`, `the rule applies at no step of the model` | The checks without the code did not all hold, so no copy was made | See the line the reason names |
| `not tried — the binding failed: <cause>` | The binding failed before a copy stood: it has no module, as before Step 4, its declaration names no `files`, or the copy could not be made | Before Step 4, nothing. Otherwise correct what the cause names |
| `not caught — the code gave no effect the rule forbids in <n> steps tested`, with `; <k> did not give the model's effect` where some differed | With the kept fault, no step of the model or of a permitted case gave an effect the rule forbids | Where steps differed from the model, the kept fault plants a defect the rule does not forbid: plant one that breaks this rule. Where none differed, the kept fault changes nothing the declared events and values reach: plant a defect they reach, or widen the declaration, which means drafting the translations again |
| `not caught — the patch does not apply: <cause>` | A file it names was not copied or is not text, or a hunk matches nowhere: the code has moved | Write a replacement for the same defect on today's code. It needs the person's approval |
| `not caught — the patch changes nothing` | After the patch every copied file is as it was | Write a patch that changes what the code does |
| `not caught — the binding failed: <cause>` | With the kept fault, a command or the module failed | Where the cause names a value outside its declared type, the declaration is too narrow for what broken code returns: widen it and draft the translations again. Otherwise choose a kept fault that leaves the code building and running, and changes only what it does |
| `not caught — a timeout: not done after <n> seconds`, `TLC was stopped after <n> seconds while it judged the effects the code gave` | With the kept fault, a command, the copy's process or TLC was stopped at the time limit | Choose a kept fault that does not hang the code |
| `not caught — a project file was loaded from outside the copy: <path>` | With the kept fault, the module reached a project file that `files` does not name | Add it to `files` |

A patch that names a path outside the binding's `files`, or that is no unified diff of the kind allowed, is not one of these: the guard is `Cannot be checked` ([formats.md](formats.md)).

## Why a guard does not pass

| Reason | Do next |
| --- | --- |
| `not approved` | Alone, at the end of a draft, it is what you want before you ask the person. Otherwise see the `Approval` line |
| `the check of cases without the code failed` | See [Why the check of cases fails](#why-the-check-of-cases-fails) |
| `only one translation` | A guard passes only with two translations or more in agreement. Step 2: have fresh Drafters draft the translations again |
| `the translations differ`, `the translations were not compared` | See [A distinguishing sequence](#a-distinguishing-sequence) and [Why a result is Inconclusive](#why-a-result-is-inconclusive) |
| `the result is <result>` | See [The results](#the-results) |
| `no kept fault` | Step 4: a guard needs at least one |
| `kept fault <name> not tried`, `kept fault <name> not caught` | See [Why a kept fault is not tried or not caught](#why-a-kept-fault-is-not-tried-or-not-caught) |

A guard passes only where all of these hold:

- the approval is current;
- every translation allows each permitted case and forbids each forbidden case;
- it has two translations or more, and they agree;
- the result is `Model checked, code tested`;
- it has at least one kept fault, and every one is caught.

## Keeping what TLC ran

`spex verify --keep <folder> [<guard>…]` leaves, for each guard that reaches TLC, `<folder>/<guard>/` with the file `spex-verify.txt`, which marks the folder as kept by `spex verify`, and one folder for each run of TLC:

| Folder | The run |
| --- | --- |
| `form-<translation>` | one translation read alone |
| `cases` | the cases under every translation |
| `compare` | the translations side by side |
| `model` | the model of the first translation, with TLC's table of its steps in `SpexModel.dump` |
| `judge`, `judge-<fault>` | the effects the code gave, judged by the rule; there only where an effect needed judging |

Each holds `Declaration.tla`, the translations used, the TLA+ file and `.cfg` Spex generated, TLC's output and `command.txt`, the exact command line:

```text
# Run in this folder, with java-tmp empty and no states folder,
# and without JAVA_TOOL_OPTIONS, _JAVA_OPTIONS and JDK_JAVA_OPTIONS.
<java> -XX:+UseParallelGC -Djava.io.tmpdir=java-tmp -cp <jar> tlc2.TLC -tool -workers 1 -fp 0 -metadir states -userFile SpexModel.user -dump SpexModel.dump -config SpexModel.cfg SpexModel
```

So anyone can run each step of TLC again without Spex, and read the files TLC judged.
The folder must lie outside the project, or be one Git ignores: `spex verify` writes nothing among the project's files.
A second run replaces `<folder>/<guard>`; a folder of that name that `spex verify` did not make is refused.
Offer it to the person where they want to see what was checked.

For a guard that has no translation yet, the run reaches no TLC and needs no Java.
It ends `Cannot be checked — guards/<guard>/translations: no translation; a guard needs two or more`, and leaves `<folder>/<guard>/` with `spex-verify.txt` and `Declaration.tla`, the declaration in TLA+.
That is where Step 2 takes the file it gives the Drafters ([formats.md](formats.md)).

## How the command ends

| Case | Exit status |
| --- | --- |
| Every guard it checked passes, or `No guards under guards/.` | `0` |
| A guard does not pass or cannot be checked; a name that is no guard; an unknown option; a `--keep` folder it cannot use; a Node older than 22.15 | `1` |
| An interrupt (SIGINT) | `130` |
| A quit (SIGQUIT) | `131` |
| A request to end (SIGTERM); a hangup (SIGHUP) | `143`; `129` |

On any of the four signals `spex verify` first stops every process it started and removes every temp folder.
The first line of a report is the heading `Protect critical behavior on every change`, and the last is `<p> of <n> guards pass.`

`spex approve <guard>` asks no question and runs neither TLC nor the code, so run `spex verify` before it and after it.
It prints, in order:

1. `<guard> — the guard item:`, and under it the guard item's statement;
2. `<behavior item> — the rule:`, and under it the rule's statement;
3. each case, in the item's order, as `<kind> — <label>`, under it its plain words, and under them its steps from the guard file, each with the effect it states;
4. `Also recorded, not printed here:`, and under it one line for every other file and item the record holds: each translation, each kept fault, the binding's files and each item the guard item or the rule cites;
5. how the guard stands against the last record: `First approval.`, `Since the last approval:` with the `changed: …`, `added: …` and `gone: …` lines under it, or `The last record cannot be read — <path>: <cause>.`;
6. `Approved <guard> — commit guards/<guard>/approval.json.`, once the record is written.

Where nothing changed since the last approval, it writes nothing and ends, in place of 5 and 6, with the one line `Nothing changed since the last approval: guards/<guard>/approval.json stands as it was.`
Where the record held the same digests in a file laid out otherwise, it prints `Nothing changed since the last approval.` at 5 and writes the record again.
It exits `0`. On a guard that cannot be checked it exits `1` with the cause and writes nothing.
The person approves the translations, the kept faults and the binding too, so show them those files where they ask: the list names them.

What it printed for the made-up guard:

```text
lock-9 — the guard item:
  When `spex verify` checks the lock, it shall find that a held lock stays with its holder [lock-3],
  reading the rule by these cases:

lock-3 — the rule:
  While a user holds the lock, when another user takes it, the lock shall stay with its holder,
  refuse the taker and report the taker among those waiting, as [lock-4] orders them.

permitted — a second taker waits
  ann takes the free lock and gets it, and bob takes it; the lock is refused, stays with ann, and
  bob waits
    1. take who=ann -> granted=true
    2. take who=bob -> granted=false holder=ann waiting={bob}

forbidden — a second taker gets the lock
  the same two takes, ending with the lock granted
    1. take who=ann
    2. take who=bob -> granted=true

permitted — the first waiting user is next
  ann takes, cy takes, bob takes, and ann leaves; the lock passes to bob and one user still waits
    1. take who=ann
    2. take who=cy
    3. take who=bob
    4. leave who=ann -> holder=bob queue=1

Also recorded, not printed here:
  file guards/bindings/lock/binding.mjs
  file guards/bindings/lock/binding.yaml
  file guards/lock-9/faults/grants-twice.patch
  file guards/lock-9/translations/a.tla
  file guards/lock-9/translations/b.tla
  item lock-4

First approval.
Approved lock-9 — commit guards/lock-9/approval.json.
```
