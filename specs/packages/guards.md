<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# guards: Guards Checked from the Command Line

## Intent

This package defines guards as the `spex` command line checks them, under [DR-243](../decisions/243-guards-protect-critical-behavior-on-every-change.md) and [DR-244](../decisions/244-a-guard-is-checked-on-the-implementation.md) in the first stage [DR-252](../decisions/252-a-guard-is-kept-beside-the-code.md) sets: where a project keeps a guard, the items and files a guard is made of, the form of its translations, the approval a person records with `spex approve`, and what `spex verify` checks, tests, finds and reports.
A **guard** is a test item that `spex verify` carries out, together with the files under `guards/<its ID>/` that say how.
The item is the **guard item**, and `guard.yaml` is the **guard file**.
A guard checks one **behavior item**, the **rule**, on every change, has shown that it catches a planted defect, and changes only with a person's approval.
A **case** is one entry of the guard item's list, in plain words, **permitted** or **forbidden**: something the code does and the rule allows, or something the code must never do.
A guard's items hold plain words alone; the typed form of its cases and its translations are kept under `guards/`.
A **binding** connects Spex to the code through an interface the project already uses: its **declaration** names the values, each **event** it can cause with its **params**, the values an event is caused with, and the **effect** it observes of it, and its **module**, the file `binding.mjs`, causes them.
A **translation** is the guard's items written in TLA+ [[1]], one TLA+ file: the rule, and the model.
The **model** is what the items say each event gives: a start, and for each legal event one effect and the state after it.
A model may say only what the guard item, the rule and the items those cite say.
The **declaration in TLA+** is the file `Declaration.tla` that Spex generates from a binding's declaration.
An event is **legal** where the event can happen in this state at all, as a refund cannot before a charge.
An event that is not legal is not tried on the code; it is never a violation.
A **step** is one event with its params and an effect: stated in a case, given by the model, judged by the rule, observed on the code.
An effect is named for where it comes from: the model's effect, a stated effect, a declared effect, the observed effect.
A **step of the model** is one legal event in one state of the model.
A **sequence** is steps in order from a fresh start.
A translation answers four questions about a step, compared in this order: whether its event is legal, what the model's effect is, whether the rule applies, and whether an effect is forbidden.
**TLC** [[2]] is the model checker of the TLA+ tools, named with its version in every result.
Translations are read in name order, and the first is the one whose model TLC checks and the code is tested against.
A **kept fault** is a patch that plants a defect the guard must catch.
A **copy** is the code a run tests, made outside the project.
The **time limit** is the seconds each run of TLC, each command and a copy's process may take.
An **input** is an item or file whose digest the **approval record** holds, and a **result** is what the checks and tests established.
An **error** is what leaves a guard one that cannot be checked, which is no result: something wrong in its files or items, a Java or a TLC that cannot be had, or something TLC cannot read or evaluate in a translation.
What `spex verify` does without the code is a check by TLC, complete for the model and the declared values; what it does on a copy of the code is testing.
**Name order**, and every order this package calls sorted, is by UTF-16 code unit, so `environments-100` comes before `environments-55`.
Approval here is a person's approval of a guard, not the live tool approvals of the `approvals` package.
This package owns the two commands and the files they read, not the `guard` skill that drafts a guard [[agent-skills-13](agent-skills.md#agent-skills-13)], not the usage that lists the commands [[cli-21](cli.md#cli-21)], and not any guard's own items, which stand in the package of the behavior they check.

## External Behavior

### Where a guard is kept

#### guards-1

Where a project keeps guards, the CLI shall read them from `guards/` at the project's root, taking as a guard every folder directly under `guards/` other than `bindings`, and naming it by that folder's name ([DR-252](../decisions/252-a-guard-is-kept-beside-the-code.md)):

| Kept | Where |
| --- | --- |
| the guard file: its binding, its time limit and each case's steps [[guards-10](#guards-10)] | `guards/<guard>/guard.yaml` |
| each translation [[guards-6](#guards-6)] | `guards/<guard>/translations/<name>.tla` |
| each kept fault [[guards-11](#guards-11)] | `guards/<guard>/faults/<name>.patch` |
| the approval record [[guards-15](#guards-15)] | `guards/<guard>/approval.json` |
| a binding's declaration and module [[guards-3](#guards-3)] [[guards-5](#guards-5)] | `guards/bindings/<name>/binding.yaml` and `binding.mjs` |

- the root is the top level of the enclosing Git repository, or the current folder outside any, as `spex lint` targets it when it is given no path [[lint-1](lint.md#lint-1)];
- a guard's name is the ID of its guard item [[guards-2](#guards-2)];
- a translation's or kept fault's name is its file's name without the extension, and both are read in name order by that name, so `a` comes before `a-b`;
- the name of a guard, a binding and a kept fault is made of letters, digits, `.`, `_` and `-`, and starts with a letter or digit, and a translation's name is narrower [[guards-6](#guards-6)];
- a guard's folder holds `guard.yaml`, `translations/`, `faults/` and `approval.json` and nothing else, `translations/` holds `<name>.tla` files alone and `faults/` holds `<name>.patch` files alone, a `.DS_Store` file aside;
- a folder under `guards/` with no `guard.yaml` is still a guard, one that cannot be checked [[guards-18](#guards-18)];
- a binding's folder holds `binding.yaml`, may still lack `binding.mjs` [[guards-36](#guards-36)], and may hold other files, each an input [[guards-14](#guards-14)].

#### guards-2

When the CLI loads a guard, it shall read these spec items [[meta-11](../meta.md#meta-11)] from `specs/meta.md` and the files under `specs/packages/` at the root [[guards-1](#guards-1)], each one missing or out of place being an error that names it:

| Item | Which |
| --- | --- |
| the guard item | the item whose ID is the guard's name, in a Verification section [[meta-30](../meta.md#meta-30)] |
| the behavior item | the one item in the External Behavior or Internal Behavior section of the same file that the guard item cites, none or several being an error naming the guard item |
| each cited item | every other spec item cited by a link [[meta-16](../meta.md#meta-16)] in the body of the guard item or of the behavior item, one step only, a link to a decision record being no item |

- an ID that no item has, or that several items have, is an error naming it;
- an item's text, for its digest, runs from its heading line to the line before the next heading of the same or a shallower depth, with trailing blank lines dropped and line endings as LF;
- an item's statement, for printing, is the first non-empty paragraph of its body, which ends at a blank line or before a list item, joined on one line, with each Markdown link replaced by its text, so that a citation prints as `[environments-41]`.

#### guards-37

When the CLI loads a guard, it shall read the cases of the guard item [[guards-2](#guards-2)] from that item's body, the one wording of an item it reads beyond IDs, sections and citations, each error below naming the item:

| Part | Read as |
| --- | --- |
| a case entry | a list item of the body, marked `-`, `*` or `+` with no indent, that starts `permitted — ` or `forbidden — `, the dash being U+2014 with one space either side, together with the indented lines that follow it |
| its kind | that first word, `permitted` or `forbidden` |
| its label | the text between the dash and the first colon after it, without the spaces at its two ends |
| its plain words | the text after that colon to the end of the entry, its lines joined by one space, each Markdown link replaced by its text, and one `;` or `.` at its end dropped |

- a list item a reader would take for a case and that is not written as one is an error, so that no case the item shows goes unchecked: any list item, with or without an indent, marked `-`, `*`, `+` or by a number, whose first word is `permitted` or `forbidden` in any letter case;
- that error is said as `<item>: the list entry '<line>' starts with <word> and is not written as a case: a case is a list item with no indent, '- <kind> — <label>: <the case in plain words>', the dash being — with one space either side`, `<word>` being the word as written and `<kind>` the same in lower case;
- any other list item is no case and is passed over;
- the cases keep the order the item gives them, which is the order they are checked and printed in everywhere;
- a label is compared as written, character by character;
- these are errors too: a case entry with no colon after its label, an empty label, a case with no plain words, a label two cases share, an item with no permitted case, and an item with no forbidden case.

### The binding

#### guards-3

Each binding shall declare, in its `binding.yaml`, what it can cause and observe, the files a run copies and the commands that build the copy:

| Key | Holds |
| --- | --- |
| `format` | `1` |
| `values` | named finite sets of plain strings, each a list of one string or more whose order has meaning, earlier before later |
| `events` | each event by name, with `params`, the named values it is caused with and their types, and `effect`, the named fields observed of it and their types |
| `files` | the project files a run copies, a list of paths, each relative to the root and written with `/`, a folder copied whole |
| `commands` | the commands that build the copy, run in order, each a list of one word or more, the program first, run without a shell [[guards-12](#guards-12)] |

| Type | Its values |
| --- | --- |
| `bool` | true and false |
| `<a>..<b>` | the whole numbers from `a` to `b`, both included, with `a` no greater than `b` and neither beyond 2147483647 either side of zero, the widest TLC holds |
| the name of a `values` set | the strings of that set |
| `set of` that name, or `set of <a>..<b>` | every set of those |
| `<type>?` | the type's values and the missing value |

- `values`, `files` and `commands` may be left out, as may an event's `params` and `effect`, `events` names at least one event, and any other key is refused;
- a declaration that names no `files` loads, and no copy can then be made [[guards-36](#guards-36)];
- `?` is written once, at the end, so `set of <name>?` is a set that may be missing;
- there is no map, no set of sets and no set of `bool`;
- a string of `values` is printable ASCII, U+0020 to U+007E, is not empty, has no space at either end, is none of `none`, `true` and `false`, and is in one `values` set only, once;
- the name of a `values` set, a param or an effect field is a lowercase letter followed by letters and digits, and an event's name is a letter followed by letters, digits and `_`;
- no `values` set is named `bool`, `set` or `of`, no param is named `event`, and the names a `values` set takes in the declaration in TLA+ are free [[guards-8](#guards-8)];
- each path of `files` is listed once, exists in the project, stays inside it and has no `node_modules` or `.git` part;
- no path of `files` is `guards` or under it, links followed, the binding's folder being copied by itself [[guards-12](#guards-12)] and no code under test, and such an entry is an error naming the file and the entry.

#### guards-4

Wherever a value of a declared type is written as YAML or JSON — a step's params and effect in the guard file, the params a binding's module is given and the effect it returns — the CLI shall read and write it by its type:

| Type | Written as |
| --- | --- |
| `bool` | a boolean |
| `<a>..<b>` | an integer in the range |
| the name of a `values` set | one of its strings |
| a set | a list without repeats, in any order, read into the declared order of its members |
| the missing value | `null` |

- anything else is not a value of the type;
- the **declared order** of a type's values is the missing value first, false before true, whole numbers rising, the strings of a `values` set as the declaration lists them, and sets by size and then by their members in order;
- the declared order of an event's effects is by the value of its first declared field, then of its second, and so on.

#### guards-5

Each binding's module, the `binding.mjs` beside its declaration, shall export what a run calls to drive the code:

| Export | Called |
| --- | --- |
| `start()` | before each sequence, to return a fresh state of the module's own for that sequence |
| `events.<event>(state, params)` | to cause one declared event with its params, and return the observed effect, an object holding every declared field [[guards-4](#guards-4)] |
| `stop(state)` | after each sequence, however it ended, where the module exports it |

- each may return at once or later, as a promise;
- `events` holds one function for each declared event, as a property of its own;
- an event that declares no effect field may return nothing, which is taken as the effect with no field;
- a fresh state keeps nothing of an earlier sequence, so the same sequence caused again gives the same effects [[guards-22](#guards-22)];
- the module is loaded from the copy, at the path it has in the project, and reaches the project's code by relative path alone [[guards-12](#guards-12)];
- what the module leaves under the OS temp folder goes with the copy [[guards-12](#guards-12)];
- a binding's folder with no `binding.mjs`, and a module that does otherwise, is a failing binding [[guards-36](#guards-36)].

#### guards-36

When a binding lacks what a test on the code needs, or its command or module does not do what its declaration and its exports promise [[guards-3](#guards-3)] [[guards-5](#guards-5)], the CLI shall find a **failing binding**, which ends the tests on that copy, with the cause of its case:

| Part | Fails when | Cause, as printed |
| --- | --- | --- |
| the binding's folder | it holds no `binding.mjs` | `no binding.mjs` |
| the declaration | it names no `files` | `the declaration names no files` |
| the copy | it cannot be made | `the copy could not be made: <cause>` |
| a command | it cannot start | `command <n> (<words>) could not start: <cause>` |
| a command | it ends with a non-zero status, or without one | `command <n> (<words>) ended with status <n>[: <cause>]`, or `command <n> (<words>) ended early[: <cause>]` |
| the module | it does not load | `binding.mjs does not load: <cause>` |
| the module | it exports no `start` function, no `events`, no function for a declared event, or a `stop` that is no function | `binding.mjs exports no start function`, `binding.mjs exports no events`, `binding.mjs exports no function for event <event>`, `binding.mjs exports a stop that is not a function` |
| a call | `start`, an event function or `stop` throws | `start threw: <cause>`, `<event> threw: <cause>`, `stop threw: <cause>` |
| an effect | the returned value is not the declared effect: a field missing, a field too many or a value out of its type [[guards-4](#guards-4)] | `<event> returned what is not its declared effect: <cause>` |
| the copy's process | it ends before every sequence was caused | `the process ended before every sequence was caused[ (status <n>)][: <cause>]` |

- the first two are found, in that order, before any copy is made, and no copy is then made, so that a guard's translations can be checked before its module is written;
- the cause given for a command or process that ended early is the last line of its standard error that is neither a `Node.js v…` line nor a stack line starting with `at `;
- a path a cause names inside the copy's fresh folder [[guards-12](#guards-12)], as a path or as a `file:` URL, is printed relative to the copy, as `src/lock.mjs` for a copied file, so that the cause is the same in every run;
- a sequence's own failure is found before a failure of the `stop` that follows it;
- what the copy's process observed before a failing binding stands [[guards-23](#guards-23)];
- a timeout is not a failing binding [[guards-12](#guards-12)].

### The declaration in TLA+

#### guards-8

When `spex verify` runs TLC for a guard [[guards-40](#guards-40)], it shall generate the declaration in TLA+, the file `Declaration.tla`, from the binding's declaration [[guards-3](#guards-3)] by the rules below, the same declaration always giving the same bytes, as this declaration of a binding `lock` gives the file under it ([DR-244](../decisions/244-a-guard-is-checked-on-the-implementation.md)):

```yaml
format: 1
values:
  user: [ann, bob, cy]
events:
  take:
    params: { who: user }
    effect: { granted: bool, holder: user?, waiting: set of user }
  leave:
    params: { who: user }
    effect: { holder: user?, queue: 0..2 }
  reset: {}
files:
  - src
```

```tla
---- MODULE Declaration ----
\* Generated by Spex from guards/bindings/lock/binding.yaml. Do not edit.
EXTENDS Integers, FiniteSets, Sequences

\* The value of a field of a type `T?` that holds nothing.
\* Each .cfg file Spex writes makes it a value equal to nothing else.
CONSTANT Missing

\* values.user; each value's place in the declared order, from 1;
\* and the member of a nonempty set of them that comes first in that order.
User == {"ann", "bob", "cy"}
UserRank(v) == CASE v = "ann" -> 1 [] v = "bob" -> 2 [] v = "cy" -> 3
UserFirst(S) == CHOOSE x \in S : \A y \in S : UserRank(x) <= UserRank(y)

\* Every event with its params: a record whose field `event` names it.
Events ==
  [event : {"take"}, who : User]
  \cup
  [event : {"leave"}, who : User]
  \cup
  [event : {"reset"}]

\* Every effect the event `e` is declared to give.
Effects(e) ==
  CASE e.event = "take" -> [granted : BOOLEAN, holder : (User \cup {Missing}), waiting : (SUBSET User)]
    [] e.event = "leave" -> [holder : (User \cup {Missing}), queue : (0..2)]
    [] e.event = "reset" -> {<<>>}
====
```

| Declared | Written |
| --- | --- |
| a `values` set `xyz`, in the order of `values` | `Xyz`, the set of its strings, `XyzRank(v)`, a string's place in the declared order from 1, and `XyzFirst(S)`, the member of a nonempty set of them that comes first in that order, `Xyz` being the name with its first letter in upper case |
| a string | a TLA+ string, with `\` written `\\` and `"` written `\"` |
| `bool` | `BOOLEAN` |
| `<a>..<b>` | `(a..b)`, a negative bound in parentheses, as `((-2)..3)` |
| the name of a `values` set | `Xyz` |
| `set of <type>` | `(SUBSET <type>)` |
| `<type>?` | `(<type> \cup {Missing})` |
| the events, in declared order | `Events`, one set of records for each event, joined by `\cup`, a record's field `event` holding the event's name and its other fields the params |
| the effects, in declared order | `Effects(e)`, one `CASE` arm for each event giving the set of records of its effect fields, and `{<<>>}` for an event with no effect field, whose one effect is `<<>>` |

- an event is a flat record, so `e.event` is its name and `e.<param>` a param;
- `Missing` is the value of a field of a type `<type>?` that holds nothing, and every `.cfg` file makes it a value equal to nothing else [[guards-40](#guards-40)], so `Missing = x` is FALSE for every other `x`, without an error;
- a `values` set whose `Xyz`, `XyzRank` or `XyzFirst` is one of the reserved names below, or a name another set gives, is refused when the guard loads, as `values: '<set>' cannot name a values set: the declaration in TLA+ would define <Name>, which is taken`, or `…, as values <other> does` [[guards-18](#guards-18)].

```text
Missing Events Effects Start Legal Effect After When While Shall Nat Int Seq Len Head Tail
Append SubSeq SelectSeq IsFiniteSet Cardinality Print PrintT Assert JavaTime TLCGet TLCSet
Permutations SortSeq RandomElement Any ToString TLCEval T M Form Agrees Applies Forbidden Same
Difference Row Init Take Land Next Agree Declared Kept Reached Judge ACTION ASSUME ASSUMPTION
AXIOM BOOLEAN BY CASE CHOOSE CONSTANT CONSTANTS COROLLARY DEF DEFINE DEFS DOMAIN ELSE ENABLED
EXCEPT EXTENDS FALSE HAVE HIDE IF IN INSTANCE LAMBDA LEMMA LET LOCAL MODULE NEW OBVIOUS OMITTED
ONLY OTHER PICK PROOF PROPOSITION PROVE QED RECURSIVE STATE STRING SUBSET SUFFICES TAKE TEMPORAL
THEN THEOREM TRUE UNCHANGED UNION USE VARIABLE VARIABLES WITH WITNESS
```

### A translation

#### guards-6

Each translation shall be one TLA+ file [[1]], `guards/<guard>/translations/<name>.tla`, named in TLA+ as the file is, that defines the seven operators [[guards-7](#guards-7)] over the declaration in TLA+ [[guards-8](#guards-8)], in this form, read from its text with every comment and every string's content blanked out ([DR-244](../decisions/244-a-guard-is-checked-on-the-implementation.md)):

| Part | Rule | The error, said after the file |
| --- | --- | --- |
| the name | a lowercase letter, then lowercase letters, digits and `_` | `a translation's name is a lowercase letter, then lowercase letters, digits and _` |
| the name | none of `declaration`, `naturals`, `integers`, `reals`, `finitesets`, `sequences`, `bags`, `tlc`, `tlcext`, `randomization`, `realtime` and `toolbox`, and not starting with `spex` | `'<name>' is the name of a file TLC or Spex loads; pick another` |
| the opening line | exactly one line `---- MODULE <name> ----` in the file, with four dashes or more either side, `<name>` being the file's name | `the file holds one line ---- MODULE <name> ----, and no other MODULE line` |
| the words `INSTANCE`, `CONSTANT`, `CONSTANTS`, `VARIABLE`, `VARIABLES`, `ASSUME`, `ASSUMPTION`, `AXIOM`, `CHOOSE`, `ENABLED` and `UNCHANGED`, and the prime `'` | none is used | `<WORD> is not for a translation: <why>`, at its first place, the prime being said as `'` |
| the operators `Start`, `Legal(s, e)`, `Effect(s, e)`, `After(s, e)`, `When(e)`, `While(s, e)` and `Shall(s, e, f)` | each is defined at the start of a line | `it does not define <Operator(params)>` |
| an operator's parameters | as many as the row above shows, under any names | `it defines <Operator> with <n> parameter[s], not as <Operator(params)>`, at its definition |
| what it loads | `Declaration`, `Naturals`, `Integers`, `FiniteSets` and `Sequences` alone, as TLC reports it [[guards-42](#guards-42)] | as [[guards-42](#guards-42)] says |

| Word | `<why>` |
| --- | --- |
| `INSTANCE` | `a translation loads only what it extends` |
| `CONSTANT`, `CONSTANTS` | `a translation declares no constant` |
| `VARIABLE`, `VARIABLES` | `a translation declares no variable` |
| `ASSUME`, `ASSUMPTION`, `AXIOM` | `a translation assumes nothing` |
| `CHOOSE` | `choose among declared values with <Values>First or <Values>Rank, so no answer rests on TLC's own order` |
| `'`, `ENABLED`, `UNCHANGED` | `a translation speaks of the state it is given, never of the next` |

- an error in the name is found when the guard loads, and the others by `spex approve` [[guards-16](#guards-16)] and by `spex verify` [[guards-42](#guards-42)], each making the guard one that cannot be checked [[guards-18](#guards-18)];
- an error with a place is said as `<file>:<line>:<col>: <error>`, lines and columns counted from 1, and errors are listed in the file's order, those without a place first;
- a line ends at LF, CRLF or a lone CR, as TLC reads it, so a `\*` comment ends where TLC ends it and a place Spex names is the one TLC names;
- outside a comment and a string, a prime is TLA+'s mark of the next state and nothing else;
- a translation may define other operators of its own, under names the declaration in TLA+ and the files it loads do not define;
- a comment is not read, so a drafter may name there the item a branch translates.

#### guards-7

Each translation's seven operators shall say, in values of the declaration in TLA+ [[guards-8](#guards-8)], what the guard's items require, the first four being the model and the last three the rule, clause by clause as its item reads ([DR-244](../decisions/244-a-guard-is-checked-on-the-implementation.md)):

| Operator | Gives | Says | TLC evaluates it |
| --- | --- | --- | --- |
| `Start` | a value | the model's starting state | once |
| `Legal(s, e)` | TRUE or FALSE | the event `e` can happen in state `s` at all | for every state the model reaches and every `e \in Events` |
| `Effect(s, e)` | a member of `Effects(e)` | the one effect the items require `e` to give in `s` | only where `Legal(s, e)` |
| `After(s, e)` | a state | the state after it | only where `Legal(s, e)` |
| `When(e)` | TRUE or FALSE | the rule's When clause | only where `Legal(s, e)` |
| `While(s, e)` | TRUE or FALSE | the rule's Where and While clauses, in the state before the event | only where `Legal(s, e)` and `When(e)` |
| `Shall(s, e, f)` | TRUE or FALSE | the effect `f` is what the rule requires | only where `Legal`, `When` and `While` hold, for any `f \in Effects(e)` |

- a state is `Start` or a value `After` gave, its shape is the translation's own, and the states of two translations are never compared, only their answers;
- the rule **applies** at a step where `When(e) /\ While(s, e)`, and the effect `f` is **forbidden** there where `~Shall(s, e, f)`;
- the model reaches finitely many states, or TLC does not end and is stopped at the time limit [[guards-38](#guards-38)];
- TLC stops, and the guard cannot be checked [[guards-18](#guards-18)], at an expression it cannot evaluate: `XyzFirst` of an empty set or of a set holding `Missing`, `XyzRank` of a value not in the set, a `CASE` with no true arm, a comparison of values of different kinds, a field a record does not have, a test of `Missing` against `SUBSET` of a set, as `Missing \in SUBSET User`, or a `Legal`, `When`, `While` or `Shall` that is not TRUE or FALSE;
- `Missing = x` is FALSE for every other value `x`, and `Missing \in S` is FALSE for a set `S` of strings or of whole numbers, both without an error;
- an `Effect` that is no member of `Effects(e)` also leaves the guard one that cannot be checked [[guards-18](#guards-18)];
- an `Effect` that holds `Missing` in a field of a type `set of …` without `?` makes TLC test `Missing` against `SUBSET` of a set, so its error is in TLC's words;
- as an example, this translation `a` writes two items of a lock over the declaration of [[guards-8](#guards-8)]: the rule `lock-3`, "While a user holds the lock, when another user takes it, the lock shall stay with its holder, refuse the taker and report the taker among those waiting, as [lock-4] orders them", and `lock-4`, "When the holder leaves, the lock shall pass to the waiting user who comes first among ann, bob and cy".

```tla
---- MODULE a ----
EXTENDS Declaration, Naturals, FiniteSets

\* The model's state: who holds the lock, and who waits for it.
Start == [holder |-> Missing, waiting |-> {}]

\* A user takes the lock only while neither holding it nor waiting; only the holder leaves.
Legal(s, e) ==
  CASE e.event = "take"  -> e.who # s.holder /\ e.who \notin s.waiting
    [] e.event = "leave" -> e.who = s.holder
    [] e.event = "reset" -> TRUE

After(s, e) ==
  CASE e.event = "take" ->
         IF s.holder = Missing
         THEN [holder |-> e.who, waiting |-> {}]
         ELSE [holder |-> s.holder, waiting |-> s.waiting \cup {e.who}]
    \* lock-4
    [] e.event = "leave" ->
         IF s.waiting = {}
         THEN [holder |-> Missing, waiting |-> {}]
         ELSE [holder |-> UserFirst(s.waiting), waiting |-> s.waiting \ {UserFirst(s.waiting)}]
    [] e.event = "reset" -> Start

Effect(s, e) ==
  CASE e.event = "take" ->
         [granted |-> s.holder = Missing, holder |-> After(s, e).holder, waiting |-> After(s, e).waiting]
    [] e.event = "leave" ->
         [holder |-> After(s, e).holder, queue |-> Cardinality(After(s, e).waiting)]
    [] e.event = "reset" -> <<>>

\* lock-3, clause by clause.
When(e) == e.event = "take"
While(s, e) == s.holder # Missing /\ s.holder # e.who
Shall(s, e, f) == ~f.granted /\ f.holder = s.holder /\ e.who \in f.waiting
====
```

### The guard file and its kept faults

#### guards-10

Each guard file shall name its binding, fix its time limit and hold each case of the guard item [[guards-37](#guards-37)] again as steps:

| Key | Holds |
| --- | --- |
| `format` | `1` |
| `binding` | the name of a folder under `guards/bindings/` |
| `limits.seconds` | the time limit, a whole number of seconds from 1 to 2147483, the longest a timer of Node runs, for each run of TLC [[guards-40](#guards-40)], each of the binding's commands and the copy's process [[guards-12](#guards-12)], each separately |
| `cases` | a list, each entry holding `case`, the label of a case of the guard item, and `steps` |
| a step | `event`, a declared event, `params`, a value for every param of the event, and `effect`, a value for each effect field the case speaks of [[guards-4](#guards-4)] |

| Error, naming the label | When |
| --- | --- |
| `a case with no entry: <label>` | a case of the item has no entry in `cases` |
| `an entry for no case: <label>` | an entry's `case` is the label of no case of the item |
| `a case entered twice: <label>` | two entries hold one label |

- the file, `limits`, an entry and a step hold no other key, and `limits` holds `seconds` alone;
- a time limit that is none is refused as `limits.seconds must be a whole number from 1 to 2147483, found <value>`;
- a case's kind is the item's and is not written here, the entries may stand in any order, and the item's order is used;
- a case has at least one step;
- a forbidden case's last step is the offending one;
- a step's `effect` may be left out, and an effect field a step leaves out is compared neither with the model nor with the code.

#### guards-11

Each kept fault shall be a patch that the CLI applies itself, without Git, to a copy:

- the patch is a unified diff as `git diff` writes it, its paths relative to the root, changing text files that exist;
- the first folder of each of a change's two file names is dropped where it is one character long, as in `a/` and `b/`, `i/` and `w/`, `c/` and `o/` or `1/` and `2/`, and the two names are then equal;
- each path it names is one of the binding's `files` [[guards-3](#guards-3)] or under one of them, so that no kept fault changes a binding, and has no `node_modules` or `.git` part;
- a path that is not is an error when the guard loads, `guards/<guard>/faults/<name>.patch: <path> is not among the binding's files` [[guards-18](#guards-18)];
- where the declaration names no `files`, which is no error [[guards-3](#guards-3)], only a path that is `guards` or under it, or that has a `node_modules` or `.git` part, is that error, so that the guard still loads;
- a patch that is no such diff, that adds, removes or renames a file, or whose hunk has more lines than its header's counts say, is an error when the guard loads, naming the file and, unless it holds no change at all, the line;
- text before the first line that starts `diff --git` or `--- ` is its description and no part of the diff;
- each hunk is applied at the line it states, else at the nearest place where its context lines and removed lines match, the earlier of two equally near;
- lines compare with a trailing CR ignored, and a patched file keeps its own line endings;
- applying a patch writes to no file whose real path, links followed, is outside the copy;
- a patch **does not apply** where a file it names was not copied, is outside the copy or is not text, or a hunk matches nowhere;
- a patch **changes nothing** where every copied file has the same bytes after it as before.

### The copy

#### guards-12

When `spex verify` tests code — the project's code, and each kept fault apart — it shall make a copy outside the project and cause its events in a process of its own, by these steps ([DR-252](../decisions/252-a-guard-is-kept-beside-the-code.md)):

1. make a fresh folder `spex-guard-…` under the OS temp folder;
2. copy each of the binding's `files` [[guards-3](#guards-3)] and the binding's folder to the paths they have in the project, following links and leaving out every `node_modules` and `.git` folder;
3. wherever the project holds a `node_modules` folder — at the root, in a folder above a copied path or in a copied folder — put a link to it at the same place in the copy, so that the copy uses the project's installed dependencies;
4. apply the kept fault's patch, where the copy is a kept fault's [[guards-11](#guards-11)];
5. run the binding's `commands` in order, with the copy as the working folder, a command whose first word is `node` running the Node that runs Spex, and each stopped at the time limit [[guards-10](#guards-10)];
6. start one process on the Node that runs Spex, with the copy as its working folder, which loads the module from the copy [[guards-5](#guards-5)] and causes the sequences it is given, each from a fresh start, noting each sequence's observed effects as soon as it has them [[guards-21](#guards-21)] [[guards-22](#guards-22)];
7. stop that process at the time limit;
8. remove the folder.

- a command or the copy's process stopped at the limit is a **timeout**;
- when a command or the copy's process ends, is stopped at the limit, or the run is interrupted [[guards-27](#guards-27)], every process it started is stopped with it, so nothing a command starts outlives that command;
- `spex verify` does not wait for what such a process still prints or holds open;
- on Windows such a process is found only while the one that started it still runs;
- on macOS and Linux a process that has left the group of the one that started it, by starting a session of its own, is not stopped;
- the commands and the copy's process are given the OS temp-folder variables pointing inside the fresh folder of step 1, so what they leave there goes with the copy;
- a link that leads back to a folder holding it is not followed, and the copy cannot then be made [[guards-36](#guards-36)];
- the digest of the copied files is one SHA-256 over the sorted relative paths and the bytes of everything step 2 copied, before any patch;
- what the code prints takes no part in a result.

#### guards-13

While a copy's process runs, the CLI shall note every file that the main thread of that process resolves — by `import`, `require` or `import.meta.resolve` — to a path inside the project's root, outside the copy and under no `node_modules` folder as a **project file loaded from outside the copy**, end the process once the file has loaded or the sequence then being caused has ended, and name the first one in the result [[guards-23](#guards-23)], real paths being compared with links followed ([DR-252](../decisions/252-a-guard-is-kept-beside-the-code.md)):

- the sequence during which it was resolved is not counted among those caused;
- a file resolved in a worker thread, or in a process the code starts, is not seen in this stage.

### Approval

#### guards-14

When the CLI reads a guard's inputs, for `spex approve` and for `spex verify` alike, it shall take one SHA-256 digest, written in hex, for each of these under its label ([DR-252](../decisions/252-a-guard-is-kept-beside-the-code.md)):

| Label | Input |
| --- | --- |
| `item <id>` | the text [[guards-2](#guards-2)] of the guard item, the behavior item and each cited item |
| `file <path>` | `guard.yaml`, each translation, each kept fault's patch and every file under the binding's folder outside a `node_modules` or `.git` folder, by its path from the root with forward slashes |

- a digest is taken over the text with LF line endings, and over the bytes as they are where a file is not UTF-8 text;
- the guard item's text holds its cases, so a change to a case's plain words changes that item's digest;
- the approval record is no input, and neither is the code the binding's `files` name.

#### guards-15

The approval record of a guard shall be the JSON file `approval.json` holding `format` and, under `inputs`, the digest of every input under its label [[guards-14](#guards-14)], written with sorted keys, an indent of two spaces and a newline at its end, as is this record of a guard `lock-9` on the binding `lock`, with two translations and one kept fault, whose two items cite `lock-4` and no other item:

```json
{
  "format": 1,
  "inputs": {
    "file guards/bindings/lock/binding.mjs": "<64 hex digits>",
    "file guards/bindings/lock/binding.yaml": "<64 hex digits>",
    "file guards/lock-9/faults/grants-twice.patch": "<64 hex digits>",
    "file guards/lock-9/guard.yaml": "<64 hex digits>",
    "file guards/lock-9/translations/a.tla": "<64 hex digits>",
    "file guards/lock-9/translations/b.tla": "<64 hex digits>",
    "item lock-3": "<64 hex digits>",
    "item lock-4": "<64 hex digits>",
    "item lock-9": "<64 hex digits>"
  }
}
```

#### guards-16

When `spex approve <guard>` runs, the CLI shall load the one guard named [[guards-18](#guards-18)], check each translation's form by its text [[guards-6](#guards-6)], print what a person is approving, each case's plain words above its steps, and write its approval record [[guards-15](#guards-15)], running no TLC, needing no Java and asking no question ([DR-252](../decisions/252-a-guard-is-kept-beside-the-code.md)):

1. print `<guard> — the guard item:` and, under it, the guard item's statement [[guards-2](#guards-2)];
2. print `<behavior item> — the rule:` and, under it, that item's statement;
3. print each case, in the item's order: `<kind> — <label>`, under it its plain words [[guards-37](#guards-37)], and under them its steps from the guard file [[guards-10](#guards-10)], one line for each, as the report writes a step [[guards-26](#guards-26)];
4. print `Also recorded, not printed here:` and, under it, the label [[guards-14](#guards-14)] of every input but the guard item, the rule and the guard file, one to a line in sorted order;
5. print how the inputs stand against the last record [[guards-19](#guards-19)], as the table below says;
6. write the record and print `Approved <guard> — commit guards/<guard>/approval.json.`

| The last record | Printed by step 5 |
| --- | --- |
| there is none | `First approval.` |
| holds the same labels and digests, in a file of the bytes step 6 would write | `Nothing changed since the last approval: guards/<guard>/approval.json stands as it was.`, step 6 then writing and printing nothing |
| holds the same labels and digests, in a file of other bytes | `Nothing changed since the last approval.` |
| differs | `Since the last approval:` and, under it, the labels that differ as `changed: …`, `added: …` and `gone: …` |
| cannot be read as written | `The last record cannot be read — <path>: <cause>.`, step 6 then replacing it |

- a blank line stands before what step 2 prints, before each case, before what step 4 prints and before what step 5 prints;
- a statement and a case's plain words are wrapped at 100 columns and indented two spaces, a step is indented four, and a label of step 4 two;
- a step prints the effect fields it states and no other;
- a guard that does not load, or whose translation's form does not hold, fails the command, which writes nothing and says `<guard> cannot be checked — <cause>`, the causes joined by `; ` [[guards-27](#guards-27)].

### What `spex verify` checks

#### guards-17

When `spex verify [--keep <folder>] [<guard>…]` runs, the CLI shall check every guard in name order, or the guards named in the order given, each by these steps in order, calling no language model, drawing nothing at random and keeping no result ([DR-243](../decisions/243-guards-protect-critical-behavior-on-every-change.md), [DR-244](../decisions/244-a-guard-is-checked-on-the-implementation.md), [DR-252](../decisions/252-a-guard-is-kept-beside-the-code.md)):

| Step | What it does |
| --- | --- |
| 1 | load the guard's files and items [[guards-18](#guards-18)] |
| 2 | compare its inputs with the approval record [[guards-19](#guards-19)] |
| 3 | find Java and TLC, once for the run [[guards-9](#guards-9)] |
| 4 | check each translation's form [[guards-42](#guards-42)] |
| 5 | without the code, by three runs of TLC started together: the cases under every translation [[guards-20](#guards-20)], the translations against each other [[guards-39](#guards-39)] and the model of the first translation in name order [[guards-38](#guards-38)] |
| 6 | on a copy of the project's code, test each permitted case [[guards-21](#guards-21)] and every step of the model [[guards-22](#guards-22)] |
| 7 | make the same tests on a copy with each kept fault [[guards-24](#guards-24)] |

- a guard whose step 1, 3 or 4 finds an error, or in whose translation TLC meets one at a later step, cannot be checked and gets no result [[guards-18](#guards-18)];
- steps 3 to 7 run whatever step 2 found;
- steps 6 and 7 make a copy only where step 5 found every case as marked under every translation, the translations in agreement or the guard with one translation, which is checked and tested as any other though it cannot pass [[guards-25](#guards-25)], the model checked to its end with no conflict, and the rule applying at some step of it;
- otherwise the code is not tested, for the first of the reasons [[guards-24](#guards-24)] lists;
- Spex's own part is to generate the declaration in TLA+ [[guards-8](#guards-8)] and the TLA+ files it runs TLC on, run TLC, read the values it prints, count the model's states and steps from TLC's table, compare an observed effect with the model's for equality and with the fields a permitted case states, find a shortest sequence to each state from TLC's table, pick the effect a question on a forbidden effect asks about, and drive the binding;
- Spex evaluates no TLA+ and answers none of the four questions;
- the same inputs, code and versions give the same report, aside from a time limit reached;
- with no `guards/` folder, or no guard in it, the command prints `No guards under guards/.` and exits `0`.

#### guards-18

When a guard's files or items hold an error, Java or TLC cannot be had, or TLC cannot read or evaluate a translation, the CLI shall find that the guard **cannot be checked**, `spex verify` printing the guard's name, one `Cannot be checked — <cause>` line for each cause and no result, and `spex approve` failing with a cause it finds without TLC [[guards-16](#guards-16)]:

| Error | Where it is defined |
| --- | --- |
| a folder with no `guard.yaml`, as `guards/<name>/guard.yaml: not found`, a name that is not allowed, or an entry a guard's folder may not hold | [[guards-1](#guards-1)] |
| a binding the guard file names that has no folder, or whose folder holds no `binding.yaml` | [[guards-1](#guards-1)] |
| a file that cannot be read as this package writes it: one that is not YAML, holds another `format`, or holds a key this package does not name, the error naming the file and the key | [[guards-3](#guards-3)] [[guards-10](#guards-10)] |
| a path of a binding's `files` that may not be listed, or a `values` set whose names in TLA+ are taken | [[guards-3](#guards-3)] [[guards-8](#guards-8)] |
| an item missing or out of place | [[guards-2](#guards-2)] |
| a case of the guard item that cannot be read, a list item that looks like a case and is not written as one, or an item without a permitted or a forbidden case | [[guards-37](#guards-37)] |
| a case with no entry in the guard file, an entry for no case, or a case entered twice | [[guards-10](#guards-10)] |
| a value that is not of its type | [[guards-4](#guards-4)] |
| a guard with no translation, as `guards/<guard>/translations: no translation; a guard needs two or more`, a file there that is no `<name>.tla`, or a translation's name that is not allowed | [[guards-1](#guards-1)] [[guards-6](#guards-6)] |
| a kept fault's patch that is no unified diff of the kind allowed, or that names a path not among the binding's `files` | [[guards-11](#guards-11)] |
| Java or TLC that cannot be had | [[guards-9](#guards-9)] |
| a translation whose form does not hold | [[guards-6](#guards-6)] [[guards-42](#guards-42)] |
| an expression of a translation TLC cannot evaluate, or a model's effect that is no declared effect | [[guards-7](#guards-7)] |
| a table of the model's steps that cannot be read | [[guards-38](#guards-38)] |
| a run in which Java ends before TLC starts, or a run of TLC that ends in no way this package names | [[guards-40](#guards-40)] |

```text
<guard>
  Cannot be checked — <cause>
    <note>
      <step line>
      …
```

| Cause, `<t>` being the translation's file | When |
| --- | --- |
| `<file or item>: <what does not load>` | an error of the guard's files or items |
| `<t>:<line>:<col>: <TLC's message>` | an expression TLC could not evaluate, at the innermost place TLC names in the translation |
| `<t>: <TLC's message>` | the same, where TLC names no place in the translation |
| `a translation: <TLC's message>` | the same, met in the comparison where TLC names no place in any translation |
| `<t>: TLC threw a <class>[: <message>]` | the same, where TLC gives a Java exception and no message of its own, the exception's stack being left out |
| `<t>: This was a Java StackOverflowError. It was probably the result of an incorrect recursive function definition that caused TLC to enter an infinite loop when trying to compute the function or its application to an element in its putative domain.` | the same, where that exception is a stack overflow, as from a definition that calls itself without end |
| `<t>: the model gives <event> an effect the declaration does not hold: <effect>` | a model's effect that is no declared effect, under whichever translation gives it |
| `TLC's table of the model's steps cannot be read: <cause>` | a table Spex cannot read, the cause of one too large being `it is too large, <n> bytes` |
| `Java ended with status <n> before TLC started[: <words>][ — SPEX_TLC_JAR names <jar>, which is not the pinned tla2tools.jar: set it to a tla2tools.jar, or unset it for Spex to download TLC 2.19]`, or the same after `Java was ended before TLC started` | a run in which Java ended, or was ended by a signal, without running TLC |
| `TLC ended with status <n> <doing>[: <words>]`, or `TLC was ended <doing>[: <words>]` | a run that ended in no way this package names |
| `TLC could not start: <cause>` | a run that could not start |

| Note | Under it |
| --- | --- |
| `TLC met it on the model, after this sequence` | the steps TLC took to it, each with the model's effect |
| `TLC met it on the model, at the start` | nothing, TLC having printed the start alone or not yet computed it |
| `TLC met it on the model` | nothing, TLC having printed no sequence after it computed the start |
| `TLC met it on the model, at step <n> of this sequence` | for an effect that is no declared effect, the steps, the last without its effect |
| `TLC met it comparing the translations`, alone or with `, after this sequence` or `, at the start`, as for the model | the steps every translation agreed on |
| `TLC met it comparing the translations, at step <n> of this sequence` | for an effect that is no declared effect, the steps, the last without its effect |
| `TLC met it in the <permitted or forbidden> case "<label>"` | the case's steps, with their stated effects |
| `TLC met it in the <permitted or forbidden> case "<label>", at step <n>` | for an effect that is no declared effect, the case's steps up to that one |
| `TLC met it in the cases` | nothing |
| `TLC met it judging the effect the code gave at the last step of this sequence` | the events caused before it, then its event with the observed effect |

- `<doing>` is `reading <t>`, `evaluating the cases`, `comparing the translations`, `checking the model` or `judging an effect the code gave`;
- `<words>` in a `TLC ended` cause are TLC's own where it gave some, else the first two lines Java wrote on standard error that are no line of a stack, and in a `Java ended` cause those two lines;
- the part of the `Java ended` cause after its dash is printed only where the jar is not the pinned one [[guards-9](#guards-9)], and that cause names no translation;
- a message of TLC is printed whole on one line, and a message it holds within another without the marks that open and close it;
- a note and its steps are printed only where TLC met the cause at a place;
- every error of every translation's form is printed, and nothing else is then checked [[guards-42](#guards-42)];
- of the runs of step 5 [[guards-17](#guards-17)], a translation TLC could not go on in is told once, as the model's run met it, else the comparison, else the cases;
- where runs started together end in a way this package names no result for, the one told is the first in a fixed order, whichever ended first: the translations in name order for their form, and the model, the comparison, the cases for step 5;
- a binding's folder with no `binding.mjs`, and a declaration that names no `files`, are no such error [[guards-36](#guards-36)];
- a guard that cannot be checked does not pass [[guards-25](#guards-25)].

#### guards-19

When `spex verify` compares a guard's inputs [[guards-14](#guards-14)] with its approval record [[guards-15](#guards-15)], it shall find the guard approved only where both hold the same labels with the same digests, and otherwise name what differs ([DR-252](../decisions/252-a-guard-is-kept-beside-the-code.md)):

| Named as | When |
| --- | --- |
| `changed` | a label is in both, with another digest |
| `added` | a label is among the inputs and not in the record |
| `gone` | a label is in the record and not among the inputs |
| `no approval record` | there is no record at all |
| `<path>: <cause>` | the record cannot be read as [[guards-15](#guards-15)] writes it: it is not JSON, holds another `format`, a key too many, a label that is no input's, or a value that is no digest |

#### guards-42

When `spex verify` checks the form of a guard's translations, it shall check each translation alone, by its text [[guards-6](#guards-6)] and then by one run of TLC [[guards-40](#guards-40)] that parses it beside the declaration in TLA+ [[guards-8](#guards-8)] and reports the files it loads, the runs started together, and name each error with its file and, where it has one, its place ([DR-244](../decisions/244-a-guard-is-checked-on-the-implementation.md)):

| Error | Said as, `<t>` being the translation's file |
| --- | --- |
| an error of form found in the text | as [[guards-6](#guards-6)] says, and TLC is not run on that translation |
| the parser refuses the translation at a place in it | `<t>:<line>:<col>: <the parser's message>` |
| the parser refuses it and names no place in it | `<t>: <the parser's message>` |
| the parser refuses the declaration in TLA+ | `guards/bindings/<binding>/binding.yaml: the declaration in TLA+ does not parse: <the parser's message>` |
| it loads another file than it may | `<t>: it loads the module <Module>; a translation loads only Declaration, Naturals, Integers, FiniteSets, Sequences` |
| TLC is stopped at the time limit | `<t>: TLC was stopped after <n> second[s] while it read the file` |

- the file TLC parses names the translation's seven operators with their parameters and evaluates nothing, so a name the translation uses without a definition is the parser's to refuse;
- `Declaration` already extends `Integers`, `FiniteSets` and `Sequences`;
- a parser's message of several lines is printed whole, on one line;
- every error of every translation is printed, each as one cause, and a guard with one gets no other check [[guards-18](#guards-18)].

#### guards-20

When `spex verify` checks a guard's cases without the code, it shall have TLC evaluate, in one run [[guards-40](#guards-40)], each case's steps under each translation from that translation's `Start` [[guards-7](#guards-7)], and list as a failure each case and translation that are not as marked ([DR-244](../decisions/244-a-guard-is-checked-on-the-implementation.md)):

| Case | As marked when |
| --- | --- |
| permitted | the translation **allows** it: every step is legal, its model gives each effect field the step states, and no step is forbidden |
| forbidden | the translation **forbids** it: the steps before the last go so, and at the last step the event is legal, the rule applies, and every declared effect that agrees with the stated fields is forbidden |

| Failure, the first one ending the case under that translation | Said as |
| --- | --- |
| a step that is not legal | `step <n> is not legal` |
| a step, other than a forbidden case's last, whose model's effect differs from a field the step states | `at step <n> the model gives <effect>` |
| such a step whose model's effect the rule forbids | `step <n> is forbidden: the model gives <effect>` |
| a forbidden case's last step at which the rule does not apply | `the rule does not apply at step <n>` |
| a forbidden case's last step with a declared effect that agrees with the stated fields and that the rule allows | `step <n> is not forbidden: the rule allows <effect>[ and <n> more]`, the effect being the first such in declared order [[guards-4](#guards-4)] |
| a translation under which the rule applies at no step of any permitted case it allows | `translation <name>: the rule applies at no step of a permitted case` |

- an effect agrees with a step's stated fields where it holds the stated value in every field the step states;
- at a forbidden case's last step the model's effect takes no part, the rule being asked about every declared effect that agrees with the stated fields;
- a model's effect that is no declared effect, and an expression TLC cannot evaluate, leave the guard one that cannot be checked [[guards-18](#guards-18)];
- one failure or more is a failed check of cases, and so is a run stopped at the time limit, which leaves the cases not checked;
- no code is run.

#### guards-39

When `spex verify` checks a guard that has two translations or more, it shall have TLC model-check all of them side by side in one run [[guards-40](#guards-40)], each at its own state from its own `Start`, comparing at every state they reach and for every declared event with its params their answers to the four questions in order, and find the translations **in agreement** only where that run ends complete with no difference ([DR-244](../decisions/244-a-guard-is-checked-on-the-implementation.md)):

| Compared, in this order | A difference, and the question it puts |
| --- | --- |
| legal: whether the event is legal | `is step <k> legal?`, each translation answering `yes` or `no` |
| the model's effect, where the event is legal | `what must step <k> give?`, each translation answering with its model's effect |
| applies: whether the rule applies | `does the rule apply at step <k>?`, `yes` or `no` |
| forbidden: for every declared effect of the event, whether the rule forbids it | `is this effect forbidden at step <k>?`, with the effect, `yes` or `no` |

| The run ends | Found |
| --- | --- |
| complete, with no state left | the translations are in agreement at every step TLC reached |
| at a difference | the translations **differ** |
| stopped at the time limit | the translations were **not compared**, the cause being `TLC was stopped after <n> second[s]` |
| at a step where some translation's model gives an effect that is no declared effect | the guard cannot be checked, with one cause for each such translation [[guards-18](#guards-18)] |
| at an expression TLC cannot evaluate | the guard cannot be checked [[guards-18](#guards-18)] |

- an event no translation finds legal is passed over, and an event all find legal and agree on is a step every translation takes, each to its own state after it;
- a difference is given as the **distinguishing sequence**: TLC's shortest sequence to it, the steps every translation agrees on, each with the model's effect, then the step at which they differ, with the one question it puts and each translation's answer in name order;
- a question on a forbidden effect asks about the model's effect where the translations differ on it, and otherwise about the first effect in declared order on which they differ [[guards-4](#guards-4)];
- under that question stands the model's effect at the step, on which the translations agree: `the model gives this effect` where the effect asked about is the model's, else `the model gives <effect>`;
- a distinguishing sequence is not run on the code: the effects of its earlier steps are the model's, on which the translations agree, and each answer to its question is one translation's own;
- a person answers the one question, and the answer becomes a case, added to the guard item and the guard file, where a case can show it, and a reworded item where none can;
- no case can show the answer that a step is not legal, that the rule does not apply at it, or that the rule allows an effect the model does not give there;
- all the translations are then drafted again by fresh drafters [[agent-skills-13](agent-skills.md#agent-skills-13)], none being edited to agree, and an added case also fails, in the check of cases [[guards-20](#guards-20)], every translation the answer contradicts;
- agreement shows that the translations read the items alike, not that the reading is right, which the cases and the person's approval carry;
- without agreement, whether the translations differ or were not compared, the code is not tested [[guards-17](#guards-17)] and the result is `Inconclusive` [[guards-23](#guards-23)].

#### guards-38

When `spex verify` checks a guard's model, it shall have TLC model-check the first translation in name order in one run [[guards-40](#guards-40)], finding for every state the model reaches from `Start` and every legal event that the model's effect is a declared effect and that the rule does not forbid it [[guards-7](#guards-7)], and writing in the same run its table of the model's steps ([DR-244](../decisions/244-a-guard-is-checked-on-the-implementation.md)):

| The run ends | Found |
| --- | --- |
| complete, with no state left | the model is **checked**: complete for this model and the declared values, the model never giving an effect the rule forbids |
| at a step whose model's effect the rule forbids | the result `Conflict in the items` [[guards-23](#guards-23)], with TLC's sequence to that step: the items, as translated, require an effect the rule forbids |
| at a step whose model's effect is no declared effect, or at an expression TLC cannot evaluate | the guard cannot be checked [[guards-18](#guards-18)] |
| stopped at the time limit | the model is **not checked**, the cause being `TLC was stopped after <n> second[s]` |
| complete, with a table Spex cannot read, as one too large for it to hold | the guard cannot be checked [[guards-18](#guards-18)] |

- the table holds one row for each step of the model, in TLC's order: its state, its event with its params, the model's effect, the state after it and whether the rule applies;
- two states are the same where TLC prints the same value for both, fields and members sorted;
- Spex counts from the table the states the model reaches, its steps and the steps at which the rule applies, and prints TLC's own estimate of the chance it missed a state, which it could by taking two states for one;
- the table is read only where the run was not stopped at the time limit;
- a shortest sequence to each state is found by walking the table breadth first from the start, ties in TLC's order;
- a model in which the rule applies at no step leaves the code not tested [[guards-17](#guards-17)] and the result `Inconclusive` [[guards-23](#guards-23)].

### What `spex verify` tests on the code

#### guards-21

When `spex verify` tests a guard's permitted cases on a copy [[guards-12](#guards-12)], it shall cause each case's steps in order from a fresh start through the module — `start`, each event with its stated params, `stop` [[guards-5](#guards-5)] — and compare each observed effect with the fields the step states [[guards-10](#guards-10)]:

| Found | When |
| --- | --- |
| a **failed case** | an observed effect differs from a field the step states, each such field named with the case, the step and both values |
| a violation, found in that case | at that step the rule forbids the observed effect, as TLC judges it [[guards-22](#guards-22)] |

- the cases are caused in the item's order, before the steps of the model and in the same process;
- a case is compared no further than its first step with a field that differs;
- TLC judges that step's observed effect only where the code gave the model's effect at every earlier step of the case and the step is a step of the model;
- an observed effect of a case that the rule does not forbid is a failed case and no difference from the model;
- a case **goes as its steps state** where no stated field differs.

#### guards-22

When `spex verify` tests the model's steps on a copy [[guards-12](#guards-12)], it shall cause every step of the model [[guards-38](#guards-38)] once — a fresh start, the events of a shortest sequence to its state, then its event — shortest sequences first and ties in TLC's order, and compare the observed effect with the model's for equality ([DR-244](../decisions/244-a-guard-is-checked-on-the-implementation.md)):

| Found for a step | When |
| --- | --- |
| the model's effect | the code gave the model's effect at every step of the sequence |
| **not reached** | an earlier step of its sequence gave another effect than the model's, the step being counted and not judged |
| a **violation** | its observed effect is not the model's and TLC says the rule forbids it |
| a **difference from the model** | its observed effect is not the model's and TLC says the rule does not forbid it |
| **not judged** | its observed effect is not the model's and TLC was stopped at the time limit before it said |

- TLC judges every such effect of one copy in one more run [[guards-40](#guards-40)], each from the model's state after the events caused before it, with its event and the observed effect;
- where that run is stopped at the time limit, no effect of that copy is judged: no violation and no difference is found on it, each such step of the model is counted as **not judged** [[guards-26](#guards-26)], and the timeout stands under the result [[guards-23](#guards-23)];
- the first violation and the first difference are kept, each with its sequence: the steps before it with the observed effects, its event, the model's effect and the observed effect;
- a difference means that the code gave an effect the model does not give and the rule does not forbid: the rule was not seen broken, and the check cannot go on from there;
- **a sequence did not repeat** where the same events from a fresh start, caused again in the same process, give another effect at their last step, the first such being kept with both effects;
- a failing binding [[guards-36](#guards-36)], a project file loaded from outside the copy [[guards-13](#guards-13)] and a timeout [[guards-12](#guards-12)] end the process, the steps not yet caused being not tested;
- an event the model does not find legal is no step of the model and is not tried;
- Spex tries each step from one sequence and does not explore the code's own states.

#### guards-23

When the checks and tests of a guard that can be checked end, `spex verify` shall give the guard one result, the first row of this table that it found ([DR-243](../decisions/243-guards-protect-critical-behavior-on-every-change.md), [DR-252](../decisions/252-a-guard-is-kept-beside-the-code.md)):

| Result | What it establishes |
| --- | --- |
| `Conflict in the items` | TLC found a sequence after which the items, as translated, require an effect the rule forbids [[guards-38](#guards-38)] |
| `Violated on the code` | the code did what the rule forbids, at a step of a permitted case [[guards-21](#guards-21)] or of the model [[guards-22](#guards-22)] |
| `Code differs from the model` | at a step of the model the code gave an effect the model does not give and the rule does not forbid [[guards-22](#guards-22)] |
| `Case failed` | a permitted case did not go on the code as its steps state [[guards-21](#guards-21)] |
| `Inconclusive` | the checks could not settle: a failed check of cases [[guards-20](#guards-20)], translations that differ or were not compared [[guards-39](#guards-39)], a model not checked or one in which the rule applies at no step [[guards-38](#guards-38)], a failing binding [[guards-36](#guards-36)], a project file loaded from outside the copy [[guards-13](#guards-13)], a timeout of a command or of the copy's process [[guards-12](#guards-12)], a run of TLC stopped at the time limit while it judged the code's effects, a sequence that did not repeat, or a step of the model not tested, not reached or not judged [[guards-22](#guards-22)] |
| `Model checked, code tested` | none of these: TLC checked every state the model reaches, complete for the declared values, and the model never gives an effect the rule forbids; every step of the model was then caused on the code once and the code gave the model's effect each time, and every permitted case went as its steps state |

- what was found stands whatever comes after it: what a copy's process observed in the sequences it caused to their end, before a failing binding, a timeout or its early end, is still compared and judged;
- a row above `Inconclusive` is the result though something also left the checks short, which is then printed under it [[guards-26](#guards-26)], as `Case failed` is where a case failed and the run that judges the code's effects was stopped;
- `Model checked, code tested` assumes that the declared values are the ones that matter, that what the code does next depends only on the model's state, each step being tried from one sequence, and that the binding causes and observes truly.

#### guards-24

When `spex verify` checks a kept fault, it shall make the tests of [[guards-21](#guards-21)] and [[guards-22](#guards-22)] on a copy of its own with the fault's patch applied [[guards-12](#guards-12)], TLC judging that copy's effects in a run of its own, and find the fault **caught** only where TLC says the rule forbids an observed effect, never at a mere difference from the model, **not tried** where no copy is made for it, and otherwise **not caught**, for the first of these reasons that holds ([DR-252](../decisions/252-a-guard-is-kept-beside-the-code.md)):

| Found | Reason, as printed | When |
| --- | --- | --- |
| not tried | `the check of cases without the code failed` | the check of cases failed or was not made [[guards-20](#guards-20)] |
| not tried | `the translations differ` | as [[guards-39](#guards-39)] says |
| not tried | `the translations were not compared` | their comparison was stopped at the time limit [[guards-39](#guards-39)] |
| not tried | `the model conflicts with the rule` | the result is `Conflict in the items` [[guards-38](#guards-38)] |
| not tried | `the model was not checked` | its check was stopped at the time limit [[guards-38](#guards-38)] |
| not tried | `the rule applies at no step of the model` | as [[guards-38](#guards-38)] says |
| not tried | `the binding failed: <cause>` | a failing binding that leaves no copy made: one found before any copy, or a copy that cannot be made [[guards-36](#guards-36)] |
| not caught | `the patch does not apply: <cause>` | as [[guards-11](#guards-11)] says |
| not caught | `the patch changes nothing` | as [[guards-11](#guards-11)] says |
| not caught | `the binding failed: <cause>` | a command of the binding fails [[guards-36](#guards-36)] |
| not caught | `a timeout: not done after <n> second[s]` | a command is stopped at the time limit |
| caught | — | TLC says the rule forbids an effect the copy's process observed |
| not caught | `TLC was stopped after <n> second[s] while it judged the effects the code gave` | the judging run is stopped at the time limit |
| not caught | `the binding failed: <cause>`, `a timeout: not done after <n> second[s]`, or `a project file was loaded from outside the copy: <path>` | the copy's process ended before every sequence was caused, for that cause |
| not caught | `the code gave no effect the rule forbids in <n> step[s] tested[; <n> did not give the model's effect]` | every sequence was caused |

- the first six reasons are also why the project's code is not tested [[guards-17](#guards-17)];
- a kept fault not tried is not caught, so it too keeps the guard from passing [[guards-25](#guards-25)];
- a forbidden effect a copy's process observed stands, and the fault is caught, though the process fails or is stopped after it;
- a caught fault is given with its sequence, as a violation is [[guards-22](#guards-22)].

#### guards-25

When `spex verify` has checked a guard, it shall find that the guard passes only where all of these hold ([DR-243](../decisions/243-guards-protect-critical-behavior-on-every-change.md), [DR-252](../decisions/252-a-guard-is-kept-beside-the-code.md)):

- its inputs are approved [[guards-19](#guards-19)];
- every translation allows each permitted case and forbids each forbidden case [[guards-20](#guards-20)];
- it has two translations or more, and they are in agreement [[guards-39](#guards-39)], a guard with one being checked and tested in full and given its result all the same;
- the result is `Model checked, code tested` [[guards-23](#guards-23)];
- it has at least one kept fault, and every kept fault is caught [[guards-24](#guards-24)].

### TLC and Java

#### guards-9

When `spex verify` first needs TLC in a run, it shall find Java and the one TLC that Spex pins, once for the run, an error here being a cause for which every guard that loads cannot be checked [[guards-18](#guards-18)] ([DR-244](../decisions/244-a-guard-is-checked-on-the-implementation.md)):

| Needed | Found |
| --- | --- |
| Java | `$JAVA_HOME/bin/java`, `java.exe` on Windows, where `JAVA_HOME` is set and that file exists, else `java` on `PATH`; `java -version` must run and name a version of 11 or later, `1.8…` counting as 8 |
| the jar | first the file `SPEX_TLC_JAR` names, where it is set; else `tools/tla2tools-1.7.4.jar` under the Spex home [[storage-1](storage.md#storage-1)], where its SHA-256 is the pinned one; else one download of the pinned release to that path, kept only where its SHA-256 is the pinned one |
| the pin | TLC 2.19, the `tla2tools.jar` of TLA+ tools v1.7.4 [[2]], at `https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar`, sha256 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88` |

```text
Java was not found: spex verify runs TLC, which needs Java 11 or later — install one, or set JAVA_HOME to one
<java> -version names no version: spex verify runs TLC, which needs Java 11 or later — install one, or set JAVA_HOME to one
Java <version> is too old: spex verify runs TLC, which needs Java 11 or later — install one, or set JAVA_HOME to one
SPEX_TLC_JAR names <value>, which is no file — set it to a tla2tools.jar, or unset it for Spex to download TLC 2.19
TLC 2.19 could not be downloaded from <url>: <cause> — download it yourself, check that its sha256 is <sha256>, and set SPEX_TLC_JAR to the file
what <url> gave is not TLC 2.19: its sha256 is <found>; nothing was kept — download it yourself, check that its sha256 is <sha256>, and set SPEX_TLC_JAR to the file
TLC 2.19 could not be kept at <path>: <cause> — download it yourself, check that its sha256 is <sha256>, and set SPEX_TLC_JAR to the file
```

- Spex ships no jar;
- a jar `SPEX_TLC_JAR` names is named in the result as `not the pinned copy` unless its SHA-256 is the pinned one;
- the download runs in a child Node with `NODE_USE_ENV_PROXY=1`, so it follows the host's proxy variables where that Node can, follows redirects, and takes 300 seconds at most;
- only `spex verify` needs Java and the jar, and only once a guard loads: `spex approve` and the rest of the CLI do not.

#### guards-40

When `spex verify` runs TLC, it shall make each run in a folder of its own under a fresh folder `spex-verify-…` in the OS temp folder, holding the declaration in TLA+ [[guards-8](#guards-8)], the translations the run uses, the TLA+ file Spex generates for it and its `.cfg`, with this command line and the run's folder as working folder, and count the run complete only by TLC's exit status and messages, with no state left ([DR-244](../decisions/244-a-guard-is-checked-on-the-implementation.md)):

```text
<java> -XX:+UseParallelGC -Djava.io.tmpdir=java-tmp -cp <jar> tlc2.TLC -tool -workers 1 -fp 0 -metadir states -userFile <Name>.user [-dump <Name>.dump] -config <Name>.cfg <Name>
```

| Run | Folder | `<Name>`, the generated TLA+ file's | Its `.cfg` holds |
| --- | --- | --- | --- |
| a translation's form [[guards-42](#guards-42)] | `form-<translation>` | `SpexForm` | `CONSTANT Missing = Missing` |
| the cases [[guards-20](#guards-20)] | `cases` | `SpexCases` | the same line |
| the translations against each other [[guards-39](#guards-39)] | `compare` | `SpexCompare` | that line, `INIT Init`, `NEXT Next`, `INVARIANT Agree`, `CHECK_DEADLOCK FALSE` |
| the model [[guards-38](#guards-38)], with `-dump` | `model` | `SpexModel` | that line, `INIT Init`, `NEXT Next`, `INVARIANT Declared`, `INVARIANT Kept`, `CHECK_DEADLOCK FALSE` |
| the effects of a copy [[guards-22](#guards-22)] | `judge`, and `judge-<fault>` for a kept fault's copy | `SpexJudge` | the first line |

| Read | From, on standard output unless said |
| --- | --- |
| complete | exit status 0, TLC's message 2193, and `0 states left on queue` in message 2199 |
| TLC's version | message 2262, the word after `Version` |
| TLC's estimate of the chance it missed a state | message 2193, after `calculated (optimistic):  val = ` |
| the files loaded | the lines `Parsing file <path>` |
| a file that does not parse | exit status 150, and the parser's words after message 2220 with the place they name, a message of several lines read whole |
| a violated invariant | exit status 12, and message 2110, `Invariant <Name> is violated.` |
| a sequence | the messages 2217, one state each |
| an expression TLC cannot evaluate | the first message of severity 1 other than 2110, 2121, 2103 and 3002, with the places it and message 2103 name, read without the opening and closing marks of a message it holds within it |
| a Java exception TLC gives no message of its own for | message 1000, the exception's class and message |
| that TLC computed the model's start | message 2190 |
| Java ending before TLC started | no message 2262 in a run that was not stopped at the time limit |
| printed values | the file of `-userFile` |
| the table of the model's steps | the file of `-dump`, read only where the run was not stopped at the time limit |

- `<jar>` is an absolute path and every other path is inside the run's folder, so the line runs again anywhere;
- `java-tmp` is made empty before the run, and `states` does not exist;
- the child's environment is Spex's own without `JAVA_TOOL_OPTIONS`, `_JAVA_OPTIONS` and `JDK_JAVA_OPTIONS`;
- there is no `VIEW` and no `-continue`;
- `CONSTANT Missing = Missing` makes `Missing` a TLC model value [[guards-8](#guards-8)];
- standard output goes to `<Name>.out` and standard error to `<Name>.err`;
- the run is stopped at the time limit [[guards-10](#guards-10)], the process and all it started;
- runs started together are each waited for to their end, so no run of TLC outlives the report of its guard;
- the folder is never under the project and is removed after the run;
- a run with nothing to judge is not made, and neither is the comparison of a guard with one translation;
- two values TLC prints are equal where they are the same after their fields and members are sorted;
- a record TLC prints may name a field with letters, digits and `_`, a digit first included;
- any other ending of a run, and output that cannot be read, leaves the guard one that cannot be checked [[guards-18](#guards-18)].

#### guards-41

When `spex verify --keep <folder>` or `--keep=<folder>` runs, the CLI shall leave in `<folder>/<guard>/`, for each guard that reaches TLC, every file generated for each run of TLC [[guards-40](#guards-40)] with the exact command line, so that anyone can make each run again without Spex ([DR-244](../decisions/244-a-guard-is-checked-on-the-implementation.md)):

| Left | Holds |
| --- | --- |
| `<folder>/<guard>/spex-verify.txt` | first the line `Kept by spex verify.` |
| one folder for each run, named as [[guards-40](#guards-40)] names it | `Declaration.tla`, the translations used, the generated `.tla` and `.cfg`, `<Name>.out`, `<Name>.err`, `<Name>.user`, for the model `SpexModel.dump`, an empty `java-tmp/` and `command.txt` |
| `command.txt` | two comment lines, then the command line as run, each word quoted as a shell takes it |

```text
# Run in this folder, with java-tmp empty and no states folder,
# and without JAVA_TOOL_OPTIONS, _JAVA_OPTIONS and JDK_JAVA_OPTIONS.
/usr/bin/java -XX:+UseParallelGC -Djava.io.tmpdir=java-tmp -cp /home/ann/.spex/tools/tla2tools-1.7.4.jar tlc2.TLC -tool -workers 1 -fp 0 -metadir states -userFile SpexModel.user -dump SpexModel.dump -config SpexModel.cfg SpexModel
```

- a second run replaces `<folder>/<guard>` where `spex-verify.txt` is there;
- for a guard that loads but for having no translation yet, `<folder>/<guard>/` holds `spex-verify.txt` and `Declaration.tla`, the declaration in TLA+ [[guards-8](#guards-8)], alone, so that it can be handed to drafters, no Java being needed, and the guard still cannot be checked [[guards-18](#guards-18)];
- these are refused before any guard is checked [[guards-27](#guards-27)]: no folder after `--keep`, a folder that lies among the project's files, and a `<folder>/<guard>` that stands without `spex-verify.txt`;
- a folder under the project's root is taken only where `git check-ignore` says Git ignores it, asked about as a folder, so that a rule such as `kept/` takes a folder that is not there yet, and the root itself never.

### What `spex verify` reports

#### guards-26

When `spex verify` has checked its guards, it shall print on standard output the heading `Protect critical behavior on every change`, a block for each guard with a blank line before it, and the count of guards that pass, printing each value of a step, an effect or an answer its own way, leaving TLC's own words to the message of a `Cannot be checked` cause [[guards-18](#guards-18)], and using in its own words none of "verified", "valid" and "proved", as in this run of the guard `lock-9` of [[guards-15](#guards-15)] in a project kept outside Git ([DR-243](../decisions/243-guards-protect-critical-behavior-on-every-change.md)):

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

| Line | Rule |
| --- | --- |
| the block's first | `<guard> — checks the rule <behavior item>:` [[guards-2](#guards-2)] |
| the statement | the behavior item's statement [[guards-2](#guards-2)], wrapped at 100 columns and indented two spaces |
| `Approval:` | how the inputs stand [[guards-19](#guards-19)] |
| `Cases, without the code:` | the check of cases [[guards-20](#guards-20)] |
| `Translations against each other:` | how the translations compare [[guards-39](#guards-39)], or that a guard with one translation has nothing to compare it with |
| `On the model:` | what TLC found on the model [[guards-38](#guards-38)] |
| `On the code:` | what the tests on the project's code found [[guards-21](#guards-21)] [[guards-22](#guards-22)], or why there were none |
| `Result:` | the result [[guards-23](#guards-23)], and under it one line or block for each thing that left the checks short, then `assumes:` under `Model checked, code tested` alone, one assumption to a line |
| the versions | `Spex <v>, Node <v>, TLC <v> (the pinned copy)` or `(not the pinned copy)` [[guards-9](#guards-9)], then `, Java <v>` |
| the revision | `revision <commit>`, the short Git commit of the root, with ` with changes` where Git reports a change in the copied files, or `no Git revision`, then `, copied files sha256 <12 hex>`, the first 12 hex digits of the copied files' digest [[guards-12](#guards-12)], or `, no files copied` where no copy was made |
| `limits:` | `<n> second[s] for each run of TLC and each command` [[guards-10](#guards-10)] |
| `Kept fault <name>:` | one for each kept fault, in name order [[guards-24](#guards-24)] |
| the last of a block | `Passes`, or `Does not pass — ` and every reason that holds [[guards-25](#guards-25)], joined by `; ` |
| the last of the run | `<p> of <n> guards pass.` |

- a step line is `<n>. <event> <param>=<value> … -> <field>=<value> …`, the ` -> …` part left out where no effect is shown or the effect has no field;
- a value prints as `true`, `false`, a number, the string itself, `none` for the missing value, and `{a, b}` for a set in declared order, and an effect with no field prints `{}` where it stands alone;
- a value that is no declared one, as in an effect the declaration does not hold, prints as `{k: v, …}` for a record, `{a, b}` for a set and `<a, b>` for a tuple;
- a line stands two spaces deeper than the line it is under, and a line under a step three deeper than the step;
- `[s]` marks a word written in the singular after a count of one, `their` is then `its`, and `guards` in the last line stays;
- translations and kept faults are listed in name order, and cases in the item's order [[guards-37](#guards-37)];
- a sequence found on the code is printed with the observed effects of the run that found it;
- a guard that cannot be checked has its name and its `Cannot be checked` lines alone [[guards-18](#guards-18)];
- the lines take these forms, an answer of a translation standing after its name and every translation named in name order.

`Approval:`, the second line under each `not approved`:

```text
  Approval: approved
  Approval: not approved — no approval record
  Approval: not approved — changed: <label>, …; added: <label>, …; gone: <label>, …
  Approval: not approved — guards/<guard>/approval.json: <why it cannot be read>
    review the guard's items and files, then run spex approve <guard>
```

`Cases, without the code:`, a failure as [[guards-20](#guards-20)] says it:

```text
  Cases, without the code: the translation allows the <n> permitted case[s] and forbids the <n> forbidden case[s]
  Cases, without the code: each of <n> translations allows the <n> permitted case[s] and forbids the <n> forbidden case[s]
  Cases, without the code: <n> case[s], <n> translation[s], <n> failure[s]
    <permitted|forbidden> case "<label>", translation <name>: <failure>
    translation <name>: the rule applies at no step of a permitted case
  Cases, without the code: not checked — TLC was stopped after <n> second[s] while it evaluated the cases
```

`Translations against each other:`, with one of the four questions of [[guards-39](#guards-39)] under the last step, under a question on a forbidden effect one of the two `the model gives` lines, and last one of the two `not run on the code` lines, the shorter where the sequence has one step:

```text
  Translations against each other: 1 translation, nothing to compare it with
  Translations against each other: <n> translations, in agreement at every step TLC reached
  Translations against each other: <n> translations, not compared — TLC was stopped after <n> second[s]
  Translations against each other: <n> translations, they differ at step <k> of this sequence
    <step line, with the model's effect>
    <k>. <event> <params>
       is step <k> legal? <a>: yes, <b>: no
       does the rule apply at step <k>? <a>: no, <b>: yes
       what must step <k> give?
         <a>: <effect>
         <b>: <effect>
       is this effect forbidden at step <k>? <effect>
         <a>: yes, <b>: no
       the model gives <effect>
       the model gives this effect
       not run on the code: the effects of the earlier steps are the model's, on which the translations agree
       not run on the code
```

`On the model:`:

```text
  On the model: TLC <v> checked every state the model of translation <name> reaches: <n> state[s], <n> step[s]; the rule applied at <n> step[s]
    TLC's own estimate of the chance it missed a state: <x>
  On the model: Conflict in the items — TLC <v> found it at step <k> of this sequence, as translation <name> reads the items
    <step line, with the model's effect>
    <k>. <event> <params>
       the model gives <effect>
       forbidden by the rule
  On the model: not checked — TLC was stopped after <n> second[s]
```

`On the code:`, where only the first violation and the first difference are printed, with all counts, and every failed case field:

```text
  On the code: <n> step[s] tested, each after a shortest sequence from a fresh start: each gave the model's effect
  On the code: 1 step tested, after a shortest sequence from a fresh start: it gave the model's effect
  On the code: <n> step[s] tested, each after a shortest sequence from a fresh start: <a> gave the model's effect, <b> an effect the rule forbids, <c> another effect, <d> not reached[, <e> not judged]
  On the code: <m> of <n> step[s] tested, each after a shortest sequence from a fresh start: …
  On the code: 0 of <n> step[s] tested
    the <n> permitted case[s] went as their steps state
    <m> of <n> permitted case[s] went as their steps state
    Violated on the code — found at step <k> of this sequence
    Violated on the code — found at step <k> of the permitted case "<label>"
      <step line, with the observed effect>
      <k>. <event> <params>
         the model gives <effect>
         the code gave   <effect>
         forbidden by the rule
    Code differs from the model — found at step <k> of this sequence
      <step line, with the observed effect>
      <k>. <event> <params>
         the model gives <effect>
         the code gave   <effect>
         not forbidden by the rule
    Case failed — case "<label>", step <n>, field <field>: stated <value>, observed <value>
  On the code: not tested — <why>
  On the code: not tested
```

- `<why>` is the first that holds of the six reasons a kept fault is not tried for [[guards-24](#guards-24)];
- `not tested` stands alone where a failing binding or a timeout came before the copy's process started: a binding found failing before any copy, a copy that cannot be made, or a command that fails or is stopped at the time limit [[guards-36](#guards-36)] [[guards-12](#guards-12)];
- once the copy's process started, the line counts the steps tested, `0 of <n>` where none was;
- the line on the permitted cases is printed only where a case was caused to its end, so not after a binding that failed before any event;
- `, <e> not judged` is printed only where the run of TLC that judges the code's effects was stopped at the time limit, `<e>` being the steps it left [[guards-22](#guards-22)], so that `<a>` to `<e>` add up to the steps tested.

Under `Result:`, each that holds, in this order, then the versions, the revision and the limits:

```text
    the check of cases without the code failed
    a timeout: TLC was stopped after <n> second[s] while it evaluated the cases
    the translations differ
    the translations were not compared: TLC was stopped after <n> second[s]
    a timeout: TLC was stopped after <n> second[s] while it checked the model
    the rule applied at no step of the model
    a timeout: TLC was stopped after <n> second[s] while it judged the effects the code gave
    a sequence did not repeat: caused again, its last step gave another effect
      <step line>
      <k>. <event> <params>
         first  <effect>
         again  <effect>
    a failing binding: <cause>
    a timeout: not done after <n> second[s]
    a project file loaded from outside the copy: <path>
    assumes: the declared values are the ones that matter (<set> = <v>, <v> and <event> <param> = <a>..<b>)
             what the code does next depends only on the model's state, each step being tried from one sequence
             the binding causes and observes truly
```

- the second and third assumptions stand under the first, 13 spaces in;
- the parenthesis of `assumes:` lists each `values` set a param's type names, as `values` orders them, then each param's whole-number range, as the declaration orders them, joined by ` and `, and is left out where there is none.

`Kept fault`, with the reasons of [[guards-24](#guards-24)]:

```text
  Kept fault <name>: caught at step <k> of this sequence
  Kept fault <name>: caught at step <k> of the permitted case "<label>"
    <step line, with the observed effect>
    <k>. <event> <params>
       the model gives <effect>
       the code gave   <effect>
       forbidden by the rule
  Kept fault <name>: not caught — <reason>
  Kept fault <name>: not tried — <reason>
```

The reasons after `Does not pass — `, in this order:

```text
not approved
the check of cases without the code failed
only one translation
the translations differ
the translations were not compared
the result is <result>
no kept fault
kept fault <name> not caught
kept fault <name> not tried
```

#### guards-27

When `spex verify` or `spex approve` ends, the CLI shall exit with the status of its case, its reports on standard output and a refusal's cause on standard error:

| Case | Status | Printed |
| --- | --- | --- |
| `spex verify`: every guard it checked passes, or there is none [[guards-17](#guards-17)] | `0` | the report [[guards-26](#guards-26)] |
| `spex verify`: a guard does not pass [[guards-25](#guards-25)] or cannot be checked [[guards-18](#guards-18)] | `1` | the report |
| `spex approve`: the record written, or left as it was where its file held the same bytes already [[guards-16](#guards-16)] | `0` | what was approved |
| `spex approve`: a guard that cannot be checked | `1` | `spex approve: <guard> cannot be checked — <cause>[; <cause>]`, nothing being written |
| a name that is no guard under `guards/` | `1` | `spex verify: <name> is no guard under guards/`, or the same after `spex approve:`, nothing being checked or written |
| an option the command does not take | `1` | `spex verify: unknown option <option>` or `spex approve: unknown option <option>`, and the command's usage line |
| `spex approve` with no guard, or with several | `1` | `spex approve: missing <guard>`, or `spex approve: unexpected argument <word>`, and the usage line |
| `spex verify --keep` refused [[guards-41](#guards-41)] | `1` | `spex verify: --keep needs a folder` and the usage line, `spex verify: --keep <folder>: the folder lies among the project's files — name a folder outside the project, or one Git ignores`, or `spex verify: --keep <folder>: <folder>/<guard> was not kept by spex verify — remove it, or name another folder` |
| `spex verify` on a Node older than 22.15, which it needs to see what a copy's process loads [[guards-13](#guards-13)] | `1` | `spex verify: needs Node 22.15 or newer to see what a copy's process loads; this is Node <v>` |
| `spex verify` interrupted, by the signal SIGINT | `130` | nothing more |
| `spex verify` hung up, by SIGHUP, quit, by SIGQUIT, or asked to end, by SIGTERM | `129`, `131`, `143` | nothing more |

- the usage lines are `Usage: spex verify [--keep <folder>] [<guard>…]` and `Usage: spex approve <guard>`;
- a refusal is found before any guard is checked, and prints nothing on standard output;
- before it exits on any of the four signals, `spex verify` stops every process it started and removes every folder it made under the OS temp folder [[guards-12](#guards-12)] [[guards-40](#guards-40)].

#### guards-28

While `spex verify` runs, the CLI shall write nothing in the project — no result, no copy and no generated file — but under a folder `--keep` names there, which Git ignores [[guards-41](#guards-41)], keeping each copy [[guards-12](#guards-12)] and each run of TLC [[guards-40](#guards-40)] under the OS temp folder until it ends and leaving nothing there, so that the approval record `spex approve` writes [[guards-16](#guards-16)] is the one tracked file either command leaves in the project and an earlier run decides nothing in a later one ([DR-252](../decisions/252-a-guard-is-kept-beside-the-code.md)).

## Verification

#### guards-29

When the built CLI runs `spex verify`, with real TLC on the machine's Java, in a fixture project the suite writes to a temp folder — a lock one user holds while others wait, of plain `.mjs` files; its items in a package file under `specs/packages/`, a rule, an item the rule cites and a guard item with two permitted cases and a forbidden one; and an approved guard on it with a binding of three events, two translations whose states have different shapes, each case's steps and a kept fault — the integration suite shall assert:

- the command exits `0`, prints the heading, the guard's block and `1 of 1 guards pass.` and no other line, so that none of its own words is "verified", "valid" or "proved", and nothing on standard error [[guards-27](#guards-27)] [[guards-26](#guards-26)] [[guards-17](#guards-17)];
- the block's first line names the guard by its folder and the rule its guard item cites, and under it stands the rule's statement, wrapped at 100 columns, a citation printed as `[<id>]` [[guards-1](#guards-1)] [[guards-2](#guards-2)];
- the block then holds, in order, `Approval: approved` [[guards-19](#guards-19)], the cases line counting two translations, two permitted cases and one forbidden case [[guards-37](#guards-37)] [[guards-10](#guards-10)] [[guards-20](#guards-20)], the translations in agreement [[guards-39](#guards-39)], the model's line with TLC's version, the states, the steps and the steps at which the rule applied that the suite works out by hand, and TLC's estimate under it [[guards-6](#guards-6)] [[guards-7](#guards-7)] [[guards-38](#guards-38)], the code's line with every step of the model tested and giving the model's effect and the two permitted cases gone as their steps state [[guards-21](#guards-21)] [[guards-22](#guards-22)], the result `Model checked, code tested` with what it assumes, one assumption to a line [[guards-23](#guards-23)], the versions of Spex, Node, TLC, pinned or not, and Java [[guards-9](#guards-9)], `no Git revision` with the digest, the limits, the kept fault caught at a step of a permitted case with the model's effect and the observed one [[guards-24](#guards-24)], and `Passes` [[guards-25](#guards-25)];
- a module that returns a set in another order than declared, an event function that returns later and an event with no effect whose function returns nothing are no failing binding [[guards-3](#guards-3)] [[guards-4](#guards-4)] [[guards-5](#guards-5)];
- with one translation, the guard named on the command line and the project in a Git repository with a copied file changed, the cases line says `the translation`, the line on translations says that there is one and nothing to compare it with, the model is checked and the code tested to the result `Model checked, code tested`, the revision line names the short commit `with changes`, the kept fault is caught, the last line is `Does not pass — only one translation`, and the exit is `1` [[guards-17](#guards-17)] [[guards-23](#guards-23)] [[guards-25](#guards-25)] [[guards-26](#guards-26)] [[guards-27](#guards-27)];
- without an approval record the block says `Approval: not approved — no approval record` and the line that says to review and then run `spex approve`, the result is still `Model checked, code tested`, the last line is `Does not pass — not approved`, and the exit is `1` [[guards-19](#guards-19)] [[guards-23](#guards-23)] [[guards-25](#guards-25)] [[guards-27](#guards-27)];
- after an edit to a translation, the kept fault removed and another added, the approval line names the three under `changed`, `added` and `gone` [[guards-14](#guards-14)] [[guards-19](#guards-19)];
- that other kept fault, whose defect the rule does not forbid, is not caught, for no effect the rule forbids in the steps tested, with the count of those that did not give the model's effect, and the last line names both reasons [[guards-24](#guards-24)] [[guards-25](#guards-25)] [[guards-26](#guards-26)];
- a guard with no kept fault ends `Does not pass — no kept fault` [[guards-25](#guards-25)];
- after every run the project holds the same files with the same bytes as before it, and the OS temp folder the run was given holds nothing [[guards-28](#guards-28)] [[guards-12](#guards-12)] [[guards-40](#guards-40)].

#### guards-30

When the built CLI runs `spex approve` in the fixture project of [[guards-29](#guards-29)], the integration suite shall assert:

- with no approval record, it prints the guard's name over the guard item's statement, the rule's ID over its statement, then each case in the item's order, though the guard file enters them in another, with its kind, its label, its plain words on joined lines without the mark that ends the entry, and under them its steps with the effect fields they state, then under `Also recorded, not printed here:` the label of every other input but the guard file, then `First approval.` and the `Approved` line, and exits `0` [[guards-16](#guards-16)] [[guards-37](#guards-37)] [[guards-10](#guards-10)] [[guards-14](#guards-14)] [[guards-27](#guards-27)];
- the record it writes holds `format` `1` and, in sorted order, one label for each file of the binding's folder, the kept fault, the guard file, each translation, the guard item, the rule and the item the rule cites, a translation's digest being the SHA-256 of its text [[guards-15](#guards-15)] [[guards-14](#guards-14)] [[guards-2](#guards-2)];
- run again, it ends with the one line that nothing changed and that the record stands as it was, prints no `Approved` line, exits `0` and leaves the record's file untouched, and after an edit to a translation it names that file under `changed` and ends with the `Approved` line [[guards-16](#guards-16)] [[guards-19](#guards-19)] [[guards-27](#guards-27)];
- with no Java on `PATH`, no `JAVA_HOME` and no `SPEX_TLC_JAR`, it still exits `0` [[guards-16](#guards-16)] [[guards-9](#guards-9)];
- with a translation that holds `CONSTANT`, it exits `1`, says on standard error that the guard cannot be checked, with the file, the line, the column and why the word is not for a translation, and leaves the record as it was [[guards-16](#guards-16)] [[guards-6](#guards-6)] [[guards-27](#guards-27)].

#### guards-31

When the built CLI runs `spex verify` in variants of the fixture project of [[guards-29](#guards-29)], each with one error that leaves the guard not checkable, the integration suite shall assert:

- with `CHOOSE` in one translation and a syntax error in the other, both errors are printed and nothing else, the first with its line, its column and what to use in its place, the second with the parser's place and message [[guards-6](#guards-6)] [[guards-42](#guards-42)] [[guards-18](#guards-18)];
- an operator left out, an operator with another number of parameters, a name the translation uses without a definition, and a translation that extends `TLC` are each one cause naming the file, the second and third with their place [[guards-6](#guards-6)] [[guards-42](#guards-42)];
- a translation whose model asks for the first of an empty set is told with TLC's message at its line and column, the note that TLC met it on the model, and the sequence that reached it with the model's effect, and one with a definition that calls itself without end is told in TLC's words for a stack overflow, without Java's stack, under the note alone [[guards-7](#guards-7)] [[guards-38](#guards-38)] [[guards-18](#guards-18)];
- a translation whose model gives an effect out of a declared range is told with the event, the effect in Spex's own print, the note naming the step, and the sequence, the last step without an effect, and the same effect in the second translation is told by the comparison, naming that translation [[guards-7](#guards-7)] [[guards-38](#guards-38)] [[guards-39](#guards-39)] [[guards-18](#guards-18)] [[guards-26](#guards-26)];
- a guard file with an unknown key under `limits` or a time limit beyond the greatest allowed, a declaration with a `values` set whose name in TLA+ is taken, a translation's name with an upper-case letter, and a guard with no translation are each one cause naming the file or the folder [[guards-10](#guards-10)] [[guards-3](#guards-3)] [[guards-8](#guards-8)] [[guards-6](#guards-6)] [[guards-1](#guards-1)] [[guards-18](#guards-18)];
- with no Java on `PATH` and no `JAVA_HOME`, and with `SPEX_TLC_JAR` naming no file, the one cause says what was not found and what to install or set, and with `SPEX_TLC_JAR` naming a file that holds no TLC the one cause says that Java ended before TLC started, with Java's words and what to set, and names no translation [[guards-9](#guards-9)] [[guards-40](#guards-40)] [[guards-18](#guards-18)];
- in each, the block is the guard's name and its `Cannot be checked` lines, with no line on approval, result or passing, the run ends `0 of 1 guards pass.` and exits `1` [[guards-18](#guards-18)] [[guards-26](#guards-26)] [[guards-27](#guards-27)].

#### guards-32

When the built CLI runs `spex verify` in variants of the fixture project of [[guards-29](#guards-29)], each with one change to a translation that TLC finds without the code, the integration suite shall assert:

- with a second translation whose rule allows any effect, the cases line counts three cases, two translations and one failure, and under it the forbidden case is listed with that translation, its step, the first effect the rule allows and how many more [[guards-20](#guards-20)] [[guards-26](#guards-26)];
- in that run the code is `not tested — the check of cases without the code failed`, the kept fault is not tried for the same reason, the revision line says `no files copied`, the result is `Inconclusive` with that cause and `the translations differ` under it, and the last line names both and the result [[guards-17](#guards-17)] [[guards-23](#guards-23)] [[guards-24](#guards-24)] [[guards-25](#guards-25)];
- with one translation whose model grants every take, the failures are a permitted case whose model's effect differs from a stated field, a permitted case with a forbidden step, and the rule applying at no step of a permitted case, and the result is `Conflict in the items`, the highest row found [[guards-20](#guards-20)] [[guards-38](#guards-38)] [[guards-23](#guards-23)];
- with one translation whose rule never applies, the forbidden case fails because the rule does not apply at its last step, the model's line says the rule applied at 0 steps, and the result's causes are the failed check of cases and the rule applying at no step of the model [[guards-20](#guards-20)] [[guards-38](#guards-38)] [[guards-23](#guards-23)];
- with a second translation that differs on whether an event is legal, on the model's effect, on whether the rule applies and on whether an effect is forbidden, each run prints the distinguishing sequence, its earlier steps with the model's effect, the question its last step puts with each translation's answer in name order, under a question on a forbidden effect the model's effect at that step, and the `not run on the code` line, which speaks of the earlier steps' effects and stands alone where the translations differ at the first step [[guards-39](#guards-39)] [[guards-26](#guards-26)];
- in each of those runs the code is `not tested — the translations differ`, the kept fault not tried for the same, the result `Inconclusive`, and the last line starts with `the translations differ` and the result [[guards-17](#guards-17)] [[guards-23](#guards-23)] [[guards-24](#guards-24)] [[guards-25](#guards-25)];
- with two translations whose models both grant a take of a held lock in a state no case reaches, the cases are as marked, the translations are in agreement, the model's line reads `Conflict in the items` with TLC's sequence, the model's effect and `forbidden by the rule`, the code is not tested because the model conflicts with the rule, and the last line names the result and the kept fault not tried [[guards-38](#guards-38)] [[guards-39](#guards-39)] [[guards-23](#guards-23)] [[guards-24](#guards-24)] [[guards-25](#guards-25)];
- with one translation whose model reaches states without end and a time limit of 12 seconds, the model is `not checked — TLC was stopped after 12 seconds`, the code not tested because the model was not checked, the result `Inconclusive` with a timeout naming the model's check, and the limits line says 12 seconds [[guards-38](#guards-38)] [[guards-40](#guards-40)] [[guards-10](#guards-10)] [[guards-23](#guards-23)].

#### guards-33

When the built CLI runs `spex verify` in variants of the fixture project of [[guards-29](#guards-29)], each with one change to its code or its binding, the integration suite shall assert:

- with code that grants a take of a held lock, the code's line counts the steps that gave the model's effect, an effect the rule forbids, another effect, and those not reached, one of the two permitted cases went as stated, `Violated on the code` is found at a step of a permitted case with its sequence, the model's effect, the observed effect and `forbidden by the rule`, the failed case field is listed, the result is `Violated on the code` with no `assumes` line, and the exit is `1` [[guards-21](#guards-21)] [[guards-22](#guards-22)] [[guards-23](#guards-23)] [[guards-26](#guards-26)] [[guards-27](#guards-27)];
- in that run the kept fault, whose patch no longer matches the code, is not caught because the patch does not apply [[guards-11](#guards-11)] [[guards-24](#guards-24)] [[guards-25](#guards-25)];
- with code that passes the lock to the last waiting user, `Code differs from the model` is found at the last step of a sequence with both effects and `not forbidden by the rule`, the failed case field is listed, the result is `Code differs from the model`, and the kept fault is caught all the same [[guards-22](#guards-22)] [[guards-21](#guards-21)] [[guards-23](#guards-23)] [[guards-24](#guards-24)];
- with code that passes the lock to whoever waited first, the permitted case that tells the two apart is listed as failed with its step, field and both values, every step of the model gave the model's effect, and the result is `Case failed` [[guards-21](#guards-21)] [[guards-22](#guards-22)] [[guards-23](#guards-23)];
- with an event function that throws in the second permitted case, the result is `Inconclusive` with `a failing binding:` and the cause, the code's line says that none of the steps was tested, the line under it counts the one permitted case caused before it, and the kept fault, whose copy showed a forbidden effect before it failed, is caught [[guards-36](#guards-36)] [[guards-23](#guards-23)] [[guards-24](#guards-24)] [[guards-26](#guards-26)];
- with an event function that throws in the first permitted case, and with a module that imports a file that is not there, no line on the permitted cases is printed [[guards-26](#guards-26)];
- that module's cause names the file and the module by their paths in the copy, no line names the copy's own folder, and a second run prints the same report [[guards-36](#guards-36)] [[guards-17](#guards-17)];
- an event function that returns a value out of its field's range is a failing binding naming the event, the field, the type and the value [[guards-36](#guards-36)] [[guards-4](#guards-4)];
- with a module that keeps a count from one sequence to the next and then reports another effect, the result is `Inconclusive` with `a sequence did not repeat`, its step and the two effects [[guards-22](#guards-22)] [[guards-5](#guards-5)] [[guards-23](#guards-23)];
- with a module that imports the project's code by a path outside the copy, the result's cause names that project file as loaded from outside the copy [[guards-13](#guards-13)] [[guards-23](#guards-23)];
- with a command of the binding that does not end and a time limit of 12 seconds, the code is `not tested`, the result's cause is a timeout after 12 seconds, and the kept fault is not caught for the same [[guards-12](#guards-12)] [[guards-23](#guards-23)] [[guards-24](#guards-24)];
- with one translation whose rule takes without end to say whether an effect only the code gives is forbidden, code that gives it in a state no case reaches and a time limit of 12 seconds, the code's line counts those steps as `not judged`, its five counts adding up to the steps tested, the result is `Inconclusive` with a timeout naming the judging of the code's effects, and the kept fault is not caught for the same [[guards-22](#guards-22)] [[guards-23](#guards-23)] [[guards-24](#guards-24)] [[guards-26](#guards-26)];
- a command that ends with status 3 is a failing binding naming the command by its number and words, the status and the last line of its standard error [[guards-36](#guards-36)] [[guards-12](#guards-12)] [[guards-3](#guards-3)].

#### guards-34

When the built CLI is given `--keep`, misused or interrupted in the fixture project of [[guards-29](#guards-29)], the integration suite shall assert:

- `spex verify --keep <folder>` with a folder outside the project exits `0` and leaves `<folder>/<guard>/` with `spex-verify.txt`, which starts with its mark, and one folder for each run of TLC: the form of each translation, the cases, the comparison, the model and the judging of the kept fault's copy, none for the project's code, which gave nothing to judge [[guards-41](#guards-41)] [[guards-40](#guards-40)];
- the model's folder holds the declaration in TLA+, the translation with the bytes it has in the project, the generated file and its `.cfg`, what TLC wrote, the dump, an empty `java-tmp` and `command.txt`, and the comparison's `.cfg` holds its five lines [[guards-41](#guards-41)] [[guards-40](#guards-40)] [[guards-8](#guards-8)];
- the last line of `command.txt` is the command line of [[guards-40](#guards-40)] with the Java and the jar of the run, and run in that folder without the three Java variables it exits `0`, reports that no error was found and writes the same dump [[guards-41](#guards-41)] [[guards-40](#guards-40)];
- for a guard with no translation, `--keep` leaves `spex-verify.txt` and the declaration in TLA+ alone, the run still saying that the guard has no translation, and that file has the bytes every run of TLC is given once a translation is there [[guards-41](#guards-41)] [[guards-8](#guards-8)] [[guards-18](#guards-18)];
- a second run with the same folder exits `0`, a folder whose `<guard>` Spex did not keep is refused naming it, a folder inside the project is refused and not made, each refusal with exit `1`, and a folder inside the project that Git ignores by a rule naming it as a folder is taken though it is not there yet [[guards-41](#guards-41)] [[guards-27](#guards-27)] [[guards-28](#guards-28)];
- `spex verify` with an unknown option, `--keep` with no folder, `spex approve` with no guard, with two and with an option each exit `1` with the cause and the command's usage line on standard error and nothing on standard output, `spex verify` with a name that is no guard exits `1` with the cause naming it, and none writes a file [[guards-27](#guards-27)];
- in a folder with no `guards/`, `spex verify` prints `No guards under guards/.` and exits `0` [[guards-17](#guards-17)];
- on macOS and Linux, an interrupt while an event never returns exits `130` with the heading alone printed, the copy's process gone, nothing left under the OS temp folder and the project's files as they were [[guards-27](#guards-27)] [[guards-12](#guards-12)] [[guards-28](#guards-28)].

#### guards-35

When the CLI's guards library loads fixture guards the suite writes to temp folders — the items, the binding, the guard file, the translations and the kept faults of a guard, whole or with one fault each — the suite shall assert:

- every folder under `guards/` other than `bindings` is listed as a guard, in name order, with or without a `guard.yaml`, none where there is no `guards/`, and translations and kept faults are listed by their name without the extension [[guards-1](#guards-1)];
- each item is read with its text, its statement and its citations, the same from a CRLF checkout, the guard item with the one behavior item it cites and what the two cite, one step only [[guards-2](#guards-2)];
- an ID no item has, an ID two items have, a guard item outside Verification, and one that cites no behavior item of its file or several are each an error naming the item [[guards-2](#guards-2)] [[guards-18](#guards-18)];
- a guard item's cases are read with their kind, label and plain words in the item's order, an entry's indented lines joined, a link as its text and one ending mark dropped, a list item that does not look like a case passed over, and each error of [[guards-37](#guards-37)], a list item that looks like a case and is not written as one among them, naming the item;
- a declaration is read with its values, its events in declared order, its files and its commands, with or without the parts it may leave out, and one that names no files loads [[guards-3](#guards-3)];
- a declaration with another `format`, an unknown key, no event, a value in two sets or not printable ASCII, a name that is not allowed, an unknown type, a param named `event`, a `values` set whose name in TLA+ is taken or given by another set, a path that leaves the project, is listed twice, has a `node_modules` part or is under `guards/`, also through a link, or a command that is no list of words is refused, naming the file and the error [[guards-3](#guards-3)] [[guards-8](#guards-8)] [[guards-18](#guards-18)];
- a guard file is read with its binding, its time limit and each entry's steps, each case of the item getting its steps in the item's order, and one with another `format`, an unknown key, also under `limits`, a time limit that is no whole number from 1 to the greatest allowed, a case with no entry, an entry for no case, a case entered twice, a case with no step, or a step with an undeclared event, a param left out, or a param or effect field undeclared or of another type is refused, naming the file and the error [[guards-10](#guards-10)] [[guards-4](#guards-4)] [[guards-18](#guards-18)];
- a stray file in a guard's folder, among its translations or among its kept faults, a binding with no folder or no declaration, a guard with no translation, and a translation named with an upper-case letter, as a file TLC loads or as one of Spex's own files are each an error naming the path, while a translation's text is loaded without being read for what it means [[guards-1](#guards-1)] [[guards-6](#guards-6)] [[guards-18](#guards-18)];
- a kept fault that is no patch, that adds a file, whose change has more lines than its header says, or that names a path outside the binding's files, the binding's own module, or a path in a `node_modules` or `.git` folder is refused, and with a declaration that names no files only a path under `guards/` or in such a folder is [[guards-11](#guards-11)] [[guards-18](#guards-18)];
- a patch applied to a folder changes every file it names, a change found at its stated line or at the nearest place that matches, a CRLF file keeping its line endings, and it does not apply, writing nothing, where a file is not there, is not text or is reached through a link out of the folder, or a change matches nowhere, and changes nothing where every file stays as it was [[guards-11](#guards-11)];
- a guard whose binding's folder holds no `binding.mjs` loads [[guards-36](#guards-36)];
- the inputs hold one digest for each item and file of the guard, the same on every load and from a CRLF checkout, only the changed input's digest changing, one word of a case's plain words changing the guard item's, and loading writes nothing into the project and does not read the approval record [[guards-14](#guards-14)] [[guards-28](#guards-28)];
- an approval record is written with sorted keys, a two-space indent and a final newline, read back as written, refused where it is not as [[guards-15](#guards-15)] writes it, and compared with the inputs as approved, as having no record, or by what changed, was added and is gone [[guards-15](#guards-15)] [[guards-19](#guards-19)].

#### guards-43

When the CLI's guards library makes copies, runs processes and runs real TLC on the machine's Java in temp folders, the suite shall assert:

- a copy holds each path at the place it has in the project, under the OS temp folder, leaves out every `node_modules` and `.git` folder and links the project's `node_modules` instead, follows a link to a file and to a folder, refuses a link back to a folder that holds it and leaves no folder behind, and has one digest over the sorted paths and the bytes copied [[guards-12](#guards-12)];
- a path into a copy, written as a path or as a `file:` URL, is told relative to the copy [[guards-36](#guards-36)];
- removing a copy leaves the project, its `node_modules` included, as it was, and every copy and every folder made for the runs of TLC still standing is removed at once [[guards-28](#guards-28)];
- a process gives its status and the end of what it wrote on standard error, is stopped at the time limit with what it started, and is not waited for where it left a process running, which is stopped too [[guards-12](#guards-12)];
- the cause read from a real crash is the last line that is neither Node's version line nor a line of a stack [[guards-36](#guards-36)];
- the machine's Java is found, a `PATH` with no Java gives the error that says what to install, a `JAVA_HOME` that holds no Java is passed over, and a Java that names version 1.8 is refused as too old [[guards-9](#guards-9)];
- the jar `SPEX_TLC_JAR` names is taken and said not to be the pinned copy where its digest is another, a name that is no file is the error that says what to set, and the pinned release and the jar's place under the home are the ones [[guards-9](#guards-9)] states;
- a download from a server of the suite's own, through a redirect, is kept where its digest is the pinned one with nothing beside it, and nothing is kept, with the error naming the address and what to do, where the digest is another or the server refuses [[guards-9](#guards-9)];
- TLC parses the declaration in TLA+ generated from a declaration with every form of type and with values that hold a space, a `"` and a `\`, counts its events and effects as the suite works them out, gives a value's place and the first of a set, finds `Missing` equal to nothing, and leaves nothing in the run's `java-tmp` [[guards-8](#guards-8)] [[guards-40](#guards-40)];
- the command line holds the fixed options, with the jar's path alone outside the run's folder [[guards-40](#guards-40)];
- the folder of `--keep` is made with its mark, one Spex marked is replaced, and any other is left alone and refused [[guards-41](#guards-41)].

## References

[1]: https://lamport.azurewebsites.net/tla/tla.html "The TLA+ Home Page"
[2]: https://github.com/tlaplus/tlaplus/releases/tag/v1.7.4 "TLA+ tools v1.7.4, with TLC 2.19"
