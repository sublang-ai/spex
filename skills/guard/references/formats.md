<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Guard files

The form of every item and file a guard is made of, as `spex verify` and `spex approve` read them.
A guard is a test item that `spex verify` carries out, together with the files under `guards/<its ID>/` that say how.
The item is the **guard item**, `guard.yaml` is the **guard file**, and the **rule** is the one behavior item the guard checks.
One guard runs through this file as the worked example: the first guard of Spex itself, `environments-56`, which checks that a spec an install placed in a project keeps its path when a later install brings another package's spec of the same name.
Its translations are not shown: [A translation](#a-translation) uses a made-up rule in their place, so that no Drafter of this guard reads one.

## Contents

- [Where the files are](#where-the-files-are)
- [The items](#the-items)
- [Types and values](#types-and-values)
- [The declaration: binding.yaml](#the-declaration-bindingyaml)
- [The declaration in TLA+](#the-declaration-in-tla)
- [The guard file: guard.yaml](#the-guard-file-guardyaml)
- [A translation](#a-translation)
- [The module: binding.mjs](#the-module-bindingmjs)
- [Kept faults](#kept-faults)
- [The approval record](#the-approval-record)
- [Before the code is read](#before-the-code-is-read)

## Where the files are

The root is the top folder of the Git repository, or the current folder where there is none.

| Kept | Where |
| --- | --- |
| The rule and the guard item with its cases | one spec package, `specs/packages/<package>.md` |
| The guard file: its binding, its time limit and each case's steps | `guards/<guard>/guard.yaml` |
| Each translation, a TLA+ file | `guards/<guard>/translations/<name>.tla` |
| Each kept fault | `guards/<guard>/faults/<name>.patch` |
| The approval record, written by `spex approve` alone | `guards/<guard>/approval.json` |
| A binding's declaration and module | `guards/bindings/<binding>/binding.yaml` and `binding.mjs` |

- `<guard>` is the ID of the guard item, such as `environments-56`.
- Every folder directly under `guards/` other than `bindings` is a guard. One with no `guard.yaml` is reported as `Cannot be checked — guards/<name>/guard.yaml: not found`, so keep no other folder there.
- A guard's folder holds `guard.yaml`, `translations/`, `faults/` and `approval.json` and nothing else. `translations/` holds only `<name>.tla` files and `faults/` only `<name>.patch` files. Any other entry is an error, a `.DS_Store` file aside.
- A binding's folder holds `binding.yaml`. It may still lack `binding.mjs` ([Before the code is read](#before-the-code-is-read)), and may hold other files the module needs; each one is approved with the guard.
- A name of a guard, binding or kept fault is letters, digits, `.`, `_` and `-`, starting with a letter or digit. A translation's name is narrower ([A translation](#a-translation)).
- The two YAML files hold `format: 1`. A key this file does not name is an error.
- The translations and the kept faults are read in name order. The first translation in name order is the one whose model is checked and tested against the code.

## The items

A spec package is one Markdown file with the sections `Intent`, `External Behavior`, optionally `Internal Behavior`, and `Verification`, in that order.
An item is a heading whose text is its ID, `<package>-<N>`, followed by one GEARS statement:

```text
[Where <fixed conditions>] [While <state>] [When <trigger>] <subject> shall <behavior>.
```

| Item | Where | Holds |
| --- | --- | --- |
| The rule, a behavior item | `External Behavior` or `Internal Behavior` | One requirement, with the system as its subject |
| The guard item | `Verification`, same file | A test item that says what `spex verify` shall find, cites the rule and no other behavior item of that file, and lists the cases |

A citation is a link to the item's heading with the ID as its text: `[[environments-55](#environments-55)]`.
An approval covers the guard item, the rule and every item either of them cites, one step away.
Where the project uses `spex lint`, run it after you write the items.

**The rule is one requirement.**
Where the behavior to guard is one clause of a longer item, split that item first: move the clause into an item of its own and have the old item cite it.
In the example the rule was one clause of the item that says how an install places a spec; it became `environments-55`.

**The items say what each event gives.**
A translation holds, beside the rule, a model: what the items say each event gives.
It may say only what the guard item, the rule and the items those two cite say, so have the rule cite the item that says what the behavior does where the rule is silent.
The example's rule cites `environments-41`, the item that says how an install places a spec.

**A case** is one entry of the guard item's list:

```text
- permitted — <label>: <the case in plain words>;
- forbidden — <label>: <the case in plain words>.
```

- The entry is a list item with no indent, marked `-`, `*` or `+`, that starts `permitted — ` or `forbidden — `: the dash is an em dash, U+2014, with one space either side.
- Any other list item is no case and is passed over, with one exception. A list item, indented or numbered ones included, that starts with the word `permitted` or `forbidden` in any letter case and is not written as above is an error, so that nothing a reader takes for a case goes unchecked. `- Forbidden - a second taker gets the lock: …`, with a capital and a hyphen, is such an entry.
- The label runs from the dash to the first colon. It is the case's name everywhere else, so keep it short, and give no two cases of one item the same label.
- The rest, to the end of the entry, is the case in plain words: what happens, in order, and what is seen. One `;` or `.` at its end is dropped.
- An item has at least one permitted and one forbidden case.
- Use no event name, param or value notation in a case, and none of the words model, TLC, TLA+ and translation in any item: someone who reads only the specs must understand it. A name the behavior's users know, such as a package's, is plain words.
- A change to a case's words changes the guard item, so it needs approval again.

The example's two items, in `specs/packages/environments.md`:

```markdown
## External Behavior

#### environments-55

While a package's copy stands at `specs/packages/<pkg>.md` [[environments-41](#environments-41)], with that package still selected and its release still providing the spec, when an install runs in a project's environment, the core shall leave that copy in place as that package's and report exactly the other selected packages whose releases provide a `<pkg>` spec as blocked at that path ([DR-174](../decisions/174-what-a-package-provides-is-placed.md)).

## Verification

#### environments-56

When `spex verify` checks installs into a project in which several packages provide a spec of one name, it shall find that the code keeps the rule that a standing copy keeps its path [[environments-55](#environments-55)] at every step it tries, reading the rule by these cases:

- permitted — a later arrival is blocked: an install selects `zeta/kit` alone and its copy stands, and a second selects `acme/kit` too, both releases providing a `kit` spec; `zeta/kit`'s copy still stands and `acme/kit` alone is reported blocked;
- forbidden — a later arrival takes the path: the same two installs, ending with `acme/kit`'s copy standing and `zeta/kit` reported blocked;
- forbidden — the standing package is reported blocked: the same two installs, ending with `zeta/kit`'s copy still standing and both packages reported blocked;
- forbidden — a package not selected is reported blocked: the same two installs, ending with `zeta/kit`'s copy still standing and `acme/kit` and `mid/kit` reported blocked;
- permitted — a copy no longer selected leaves: an install selects `zeta/kit` alone and its copy stands, and a second selects `acme/kit` alone, each release providing a `kit` spec; `acme/kit`'s copy stands and no package is reported blocked;
- permitted — a copy no longer provided leaves: an install selects `zeta/kit` alone and its copy stands, and a second selects `acme/kit` too, when only `acme/kit`'s release still provides a `kit` spec; `acme/kit`'s copy stands and no package is reported blocked.
```

`environments-55` is the rule and `environments-56` the guard item, so the guard is `environments-56`.
Its first case shows the rule at work; its second, third and fourth are what must never happen; the last two mark where the rule stops applying.

## Types and values

A type is written as text in the declaration.

| Type | Its values | Written in YAML or JSON as |
| --- | --- | --- |
| `bool` | true and false | a boolean |
| `<a>..<b>` | the whole numbers from `a` to `b`, both included; either may be negative | a whole number in the range |
| the name of a `values` set, such as `package` | the strings of that set | one of its strings |
| `set of <values name>`, `set of <a>..<b>` | every set of those | a list without repeats, in any order |
| `<type>?` | the type's values and the missing value | the value, or `null` |

- `?` is written once, at the end: `set of package?` is a set that may be missing.
- There is no `int` word, no map, no set of sets and no set of `bool`.
- Give an effect field room for what broken code could return. A returned value outside its declared type is a failing binding and never a violation, so a kept fault that drives a balance declared `0..100` to -1 cannot be caught.
- Values are written this way in a step's params and effects, and in what the module is given and returns.
- The name of a `values` set, a param or an effect field is a lowercase letter, then letters and digits. A param is not named `event`.
- An event's name is a letter, then letters, digits and `_`.
- A value of a `values` set is a string of printable ASCII, not empty, with no space at either end, and none of `none`, `true` and `false`. A value belongs to one set and is listed once.
- A `values` set is none of `bool`, `set` and `of`. In TLA+ a set `xyz` is named `Xyz`, `XyzRank` and `XyzFirst` ([The declaration in TLA+](#the-declaration-in-tla)), and none of the three may be a name TLA+, its standard modules or Spex's generated files already use, such as `Events`, `Start`, `Nat` or `Init`: the error names the set.

## The declaration: binding.yaml

The example's declaration, `guards/bindings/installs/binding.yaml`, without its header comment:

```yaml
format: 1
values:
  # Listed in order of <org>, the order in which packages claim a path:
  # the declaration in TLA+ gives it as PackageRank and PackageFirst.
  package: [acme/kit, mid/kit, zeta/kit]
events:
  # One install. `selected`: the packages the lock holds. `providing`:
  # the packages whose release provides a `kit` spec. Listing a package
  # that is not selected changes nothing.
  install:
    params: { selected: set of package, providing: set of package }
    # `standing`: whose copy stands at specs/packages/kit.md afterwards.
    # `blocked`: the packages the install reported blocked.
    effect: { standing: package?, blocked: set of package }
files:
  - packages/cli/src
  - packages/cli/tsconfig.json
  - packages/cli/package.json
commands:
  # The library's TypeScript build, into packages/cli/dist of the copy.
  - [node, node_modules/typescript/bin/tsc, -p, packages/cli]
```

| Key | Holds |
| --- | --- |
| `values` | Named finite sets of plain strings, in an order that has meaning: `XyzRank` and `XyzFirst` give it to a translation. May be left out |
| `events` | What the binding can cause, and what it can observe of each. At least one event. `params` are its named inputs and `effect` the named fields observed of it, each with a type. Either may be left out |
| `files` | The project files a run copies. Paths that exist in the project, from the root, written with `/`, each listed once and with no `node_modules` or `.git` part. None is `guards` or under it, by name or through a link: the binding's folder is copied by itself and is no code under test. A folder is copied whole, without `node_modules` and `.git` folders. Left out until the code is read |
| `commands` | Run in the copy, in order, to build it. Each a list of words, the program first, run without a shell with the copy as working folder. A first word of `node` runs the Node that runs `spex`. A non-zero exit is a failing binding. Each is stopped after `limits.seconds` seconds, which is a timeout. May be left out |

Say in a comment beside each param and effect field what it means, in the items' words, as someone using the behavior would.
Say in a comment what the order of a `values` set means, where the items rely on one.
The Drafters are given the `values` and `events` with these comments, and a name alone can be read in more than one way.

**Keep the values few.**
TLC tries every event with every combination of its params' values, in every state the model reaches, and compares the translations on every declared effect of each.
The code is then tested on every one of those steps.
The example's three packages give 8 sets for `selected` and 8 for `providing`, so 64 installs to try in each state, each with 32 declared effects; a fourth package would make it 256 installs with 80.
Two or three values of each kind reach the cases that matter, and the report names them as what the result assumes.

**The copy.**
Every run tests a copy outside the project: the `files` and the binding's folder, at the paths they have in the project.
The copy uses the project's installed dependencies: wherever the project holds a `node_modules` folder, at the root, in a folder above a copied path or in a copied folder, the copy has a link to it at the same place.
`files` must therefore name the project files behind everything the module loads, directly or through another file.
Where the code is built, `files` names the sources and what the build reads, `commands` build them in the copy, and the module imports what that build wrote there.
Never name built output in `files`: the run would test the last build and not the code, and a kept fault in a source would change nothing the module loads.
Never name `guards` or a path under it either: that is an error when the guard loads.

A run that loads a project file from outside the copy is `Inconclusive` and names the file.
This is seen for files resolved in the main thread of the copy's process, by `import`, `require` or `import.meta.resolve`.
What a worker thread, or a process the code starts, loads is not seen: where the code uses either, check yourself that it reads the copy alone.

## The declaration in TLA+

The **declaration in TLA+** is the file `Declaration.tla` that Spex generates from `binding.yaml`.
Every translation is written over it.
Spex generates it on every run and keeps it nowhere in the project, and the same declaration always gives the same text.

To give it to the Drafters, run `spex verify --keep <folder> <guard>` before any translation is saved, with a folder outside the project.
The run needs no Java.
It ends `Cannot be checked — guards/<guard>/translations: no translation; a guard needs two or more`, and leaves the file at `<folder>/<guard>/Declaration.tla`.
Never write the file by hand.
For the example's declaration it is:

```tla
---- MODULE Declaration ----
\* Generated by Spex from guards/bindings/installs/binding.yaml. Do not edit.
EXTENDS Integers, FiniteSets, Sequences

\* The value of a field of a type `T?` that holds nothing.
\* Each .cfg file Spex writes makes it a value equal to nothing else.
CONSTANT Missing

\* values.package; each value's place in the declared order, from 1;
\* and the member of a nonempty set of them that comes first in that order.
Package == {"acme/kit", "mid/kit", "zeta/kit"}
PackageRank(v) == CASE v = "acme/kit" -> 1 [] v = "mid/kit" -> 2 [] v = "zeta/kit" -> 3
PackageFirst(S) == CHOOSE x \in S : \A y \in S : PackageRank(x) <= PackageRank(y)

\* Every event with its params: a record whose field `event` names it.
Events ==
  [event : {"install"}, selected : (SUBSET Package), providing : (SUBSET Package)]

\* Every effect the event `e` is declared to give.
Effects(e) ==
  CASE e.event = "install" -> [standing : (Package \cup {Missing}), blocked : (SUBSET Package)]
====
```

[What the declaration in TLA+ defines](#what-the-declaration-in-tla-defines) says what each of its names is.

## The guard file: guard.yaml

The example's guard file, `guards/environments-56/guard.yaml`, without its header comment:

```yaml
format: 1
binding: installs
limits: { seconds: 300 }
cases:
  - case: a later arrival is blocked
    steps:
      - event: install
        params: { selected: [zeta/kit], providing: [zeta/kit] }
        effect: { standing: zeta/kit }
      - event: install
        params: { selected: [acme/kit, zeta/kit], providing: [acme/kit, zeta/kit] }
        effect: { standing: zeta/kit, blocked: [acme/kit] }
  - case: a later arrival takes the path
    steps:
      - event: install
        params: { selected: [zeta/kit], providing: [zeta/kit] }
        effect: { standing: zeta/kit }
      - event: install
        params: { selected: [acme/kit, zeta/kit], providing: [acme/kit, zeta/kit] }
        effect: { standing: acme/kit, blocked: [zeta/kit] }
  - case: the standing package is reported blocked
    steps:
      - event: install
        params: { selected: [zeta/kit], providing: [zeta/kit] }
        effect: { standing: zeta/kit }
      - event: install
        params: { selected: [acme/kit, zeta/kit], providing: [acme/kit, zeta/kit] }
        effect: { standing: zeta/kit, blocked: [acme/kit, zeta/kit] }
  - case: a package not selected is reported blocked
    steps:
      - event: install
        params: { selected: [zeta/kit], providing: [zeta/kit] }
        effect: { standing: zeta/kit }
      - event: install
        params: { selected: [acme/kit, zeta/kit], providing: [acme/kit, zeta/kit] }
        effect: { standing: zeta/kit, blocked: [acme/kit, mid/kit] }
  - case: a copy no longer selected leaves
    steps:
      - event: install
        params: { selected: [zeta/kit], providing: [zeta/kit] }
        effect: { standing: zeta/kit }
      - event: install
        params: { selected: [acme/kit], providing: [acme/kit, zeta/kit] }
        effect: { standing: acme/kit, blocked: [] }
  - case: a copy no longer provided leaves
    steps:
      - event: install
        params: { selected: [zeta/kit], providing: [zeta/kit] }
        effect: { standing: zeta/kit }
      - event: install
        params: { selected: [acme/kit, zeta/kit], providing: [acme/kit] }
        effect: { standing: acme/kit, blocked: [] }
```

| Key | Holds |
| --- | --- |
| `binding` | the name of a folder under `guards/bindings/` |
| `limits` | `seconds` alone: the time limit in seconds, a whole number from 1 to 2147483, for each run of TLC, each of the binding's commands and the process that causes events on a copy, each separately |
| `cases` | one entry for each case of the guard item, with `case`, its label, and `steps` |
| a step | `event`, `params` with a value for every param of the event, and `effect` with a value for each effect field the case speaks of; `effect` may be left out |

A **step** is one event with its params and an effect.
A case states an effect, the model gives one, the rule judges one, and a run observes one on the code.

- `case` is the label exactly as the item writes it, character for character. A case's kind is read from the item and never written here.
- Every case of the item has one entry and every entry names a case of the item. A case with no entry, an entry for no case, and a label entered twice are each an error that names the label, and the guard is `Cannot be checked`.
- The entries may stand in any order; the report and `spex approve` print the cases in the item's order.
- `limits.seconds` is required, and there is nothing else to set: a run draws nothing at random, and the same files and code give the same run.
- A case has at least one step. A forbidden case's last step is the one that must never happen, and the rule must apply at it.
- A step states only what the case's words speak of: the example's `providing` lists only the packages its cases name.
- An effect field a step leaves out is not compared: a permitted case's step may then give any value of it, and a forbidden case's last step forbids every declared effect that agrees with the fields it does state.
- At the time limit the run of TLC, the command or the copy's process is stopped, and every process it started with it. That is a timeout.
- A process a command starts is stopped when that command ends: start what a sequence needs in the module's `start`, never in `commands`.
- On macOS and Linux a process that has left the group of the one that started it, by starting a session of its own, is not stopped, at the time limit or at any other time. Where the code starts one, end it in the module's `stop`, and after a timeout check that none is left.

**Choosing the limit.**
Give `limits.seconds` room for the slowest of them: the build, one run of TLC, or the process that causes every step of the model on the copy.
A model that reaches no end of states is never done at any limit: correct the translation, not the limit.

## A translation

A translation is the guard's items written in TLA+, in one file, `guards/<guard>/translations/<name>.tla`.
It holds two things:

- the **rule**, clause by clause as its item reads;
- the **model**: what the items say each event gives, as a start and, for each legal event, one effect and the state after it. The model may say only what the guard item, the rule and the items those two cite say.

It is written over the **declaration in TLA+**, the file `Declaration.tla` that Spex generates from the binding's declaration.
TLC, the model checker of the TLA+ tools, reads the file as it stands and makes every judgement on it.

The example in this section is not the worked guard's.
This section is what a Drafter is given, and a Drafter must never read a translation of the items it drafts from, so this file shows no translation of its worked guard.
The example here is a made-up rule on a made-up binding: a lock that one user holds while others wait.

### What the declaration in TLA+ defines

The made-up binding's declaration:

```yaml
values:
  # Listed in the order in which waiting users are served.
  user: [ann, bob, cy]
events:
  # `who` asks for the lock.
  take:
    params: { who: user }
    # `granted`: whether `who` got the lock.
    # `holder`: who holds the lock afterwards, if anyone.
    # `waiting`: the users who wait for it afterwards.
    effect: { granted: bool, holder: user?, waiting: set of user }
  # `who` gives the lock up.
  leave:
    params: { who: user }
    # `holder`: who holds the lock afterwards, if anyone.
    # `queue`: how many users still wait.
    effect: { holder: user?, queue: 0..2 }
  # The lock is made new: nobody holds it and nobody waits.
  reset: {}
```

Its declaration in TLA+:

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

| Name | Is |
| --- | --- |
| `Missing` | the value of a field of a type `T?` that holds nothing. `Missing = x` is FALSE for every other value `x`, and `Missing \in S` is FALSE for a set `S` of strings or of whole numbers, both without an error. A test of `Missing` against `SUBSET Xyz` is an error |
| `Xyz`, for a `values` set `xyz` | the set of its values, as TLA+ strings |
| `XyzRank(v)` | the place of the value `v` in the declared order, from 1 |
| `XyzFirst(S)` | the member of a nonempty set `S` of those values that comes first in the declared order |
| `Events` | every event with its params. An event is a record: `e.event` is its name, a string, and `e.<param>` a param |
| `Effects(e)` | every effect the event `e` is declared to give, each a record with every effect field. An event with no effect field has the one effect `<<>>` |

A declared type is a TLA+ set: `bool` is `BOOLEAN`, `a..b` is `a..b`, a `values` set `xyz` is `Xyz`, `set of T` is `SUBSET T`, and `T?` is `T \cup {Missing}`.

### The seven operators

A translation defines seven operators, with these names, each at the start of a line.
The parameters' names are free; their number is not.

| Operator | Gives | Says | TLC evaluates it |
| --- | --- | --- | --- |
| `Start` | a value | the model's starting state | once |
| `Legal(s, e)` | TRUE or FALSE | the event `e` can happen in state `s` at all | for every state the model reaches and every `e \in Events` |
| `Effect(s, e)` | a member of `Effects(e)` | the one effect the items require `e` to give in `s` | only where `Legal(s, e)` |
| `After(s, e)` | a state | the state after it | only where `Legal(s, e)` |
| `When(e)` | TRUE or FALSE | the rule's When clause | only where `Legal(s, e)` |
| `While(s, e)` | TRUE or FALSE | the rule's Where and While clauses, in the state before the event | only where `Legal(s, e)` and `When(e)` |
| `Shall(s, e, f)` | TRUE or FALSE | the effect `f` is what the rule requires | only where `Legal`, `When` and `While` hold, for any `f \in Effects(e)` |

`Start`, `Legal`, `Effect` and `After` are the model; `When`, `While` and `Shall` are the rule.

- A **step** is one event with its params and an effect. The model gives one effect for a step, and the rule judges any effect a step could have.
- An event is **legal** where the event can happen in this state at all, as a refund cannot before a charge. An event that is not legal is not tried on the code; it is never a violation. So `Legal` says when an event can happen, and never what the rule forbids: that is for `Shall`.
- The rule **applies** at a step where `When(e) /\ While(s, e)`. A step's effect `f` is **forbidden** where the rule applies and `Shall(s, e, f)` is FALSE.
- `Shall` is asked of every declared effect, not only of the model's: of an effect a case states, and of one the code gave. Write it to judge any `f \in Effects(e)`.
- A state is `Start` or a value `After` gave; its shape is the translation's own. States of two translations are never compared, only their answers.
- Keep in the state only what the items make a later event depend on. The model must reach finitely many states, or TLC does not end and is stopped at the time limit.

### What a translation holds

1. One opening line, `---- MODULE <name> ----`, and one closing line, `====`, with `<name>` the file's name without `.tla`. The name is a lowercase letter, then lowercase letters, digits and `_`. It is none of `declaration`, `naturals`, `integers`, `reals`, `finitesets`, `sequences`, `bags`, `tlc`, `tlcext`, `randomization`, `realtime` and `toolbox`, and does not start with `spex`.
2. `EXTENDS Declaration` and, where needed, `Naturals`, `Integers`, `FiniteSets` and `Sequences`. `Declaration` already extends the last three. A translation loads nothing else.
3. The seven operators.
4. Operators of its own where it needs them, with `LET` and `RECURSIVE` if it likes, under names the declaration in TLA+ and the files it loads do not define.
5. Above each branch, the ID of the item it translates, in a TLA+ comment. Comments, `\* …` to the end of the line and `(* … *)`, are free and are not read.

Outside comments and strings it holds none of these:

| Word or mark | Why not |
| --- | --- |
| `INSTANCE` | a translation loads only what it extends |
| `CONSTANT`, `CONSTANTS` | a translation declares no constant |
| `VARIABLE`, `VARIABLES` | a translation declares no variable |
| `ASSUME`, `ASSUMPTION`, `AXIOM` | a translation assumes nothing |
| `CHOOSE` | choose among declared values with `XyzFirst` or `XyzRank`, so no answer rests on TLC's own order |
| the prime `'`, `ENABLED`, `UNCHANGED` | a translation speaks of the state it is given, never of the next |

TLC stops, and the guard cannot be checked, on any of these:

- `XyzFirst` of an empty set or of a set that holds `Missing`, and `XyzRank` of a value not in the set;
- a `CASE` with no true arm;
- a comparison of values of different kinds, as a string with a number;
- a field a record does not have;
- a `Legal`, `When`, `While` or `Shall` that is neither TRUE nor FALSE;
- an `Effect` that is no member of `Effects(e)`;
- a test of `Missing` against `SUBSET Xyz`, as an `Effect` that holds `Missing` in a field of a type `set of …` without `?`;
- a name the file uses and nothing defines.

### An example

The made-up items:

```markdown
#### lock-3

While a user holds the lock, when another user takes it, the lock shall stay with its holder, refuse the taker and report the taker among those waiting, as [[lock-4](#lock-4)] orders them.

#### lock-4

When the holder leaves, the lock shall pass to the waiting user who comes first among ann, bob and cy.

#### lock-9

When `spex verify` checks the lock, it shall find that a held lock stays with its holder [[lock-3](#lock-3)], reading the rule by these cases:

- permitted — a second taker waits: ann takes the free lock and gets it, and bob takes it; the lock is refused, stays with ann, and bob waits;
- forbidden — a second taker gets the lock: the same two takes, ending with the lock granted;
- permitted — the first waiting user is next: ann takes, cy takes, bob takes, and ann leaves; the lock passes to bob and one user still waits.
```

`lock-3` is the rule, `lock-9` the guard item, and `lock-4` an item the rule cites.
A translation of them, in a file `a.tla`:

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

- `When`, `While` and `Shall` read as `lock-3` does: when another user takes the lock, while a user holds it, the lock shall refuse the taker, stay with its holder and report the taker among those waiting.
- `Legal` says what cannot happen at all: a user who holds the lock or waits for it does not take it again, and only the holder leaves. The items do not say so in as many words; this translation chose it, and its Drafter listed the choice.
- `After` uses `UserFirst` for "the waiting user who comes first", under a comment that names `lock-4`.
- `Effect` gives every field of the declared effect, read from the state after the event.
- The state is a record of the translation's own; another translation of the same items may keep a pair, and the two agree as long as their answers do.

A guard needs two translations or more.
`spex verify` has TLC compare them at every step any of them reaches, and the guard passes only where they agree ([results.md](results.md)).
A guard with one translation is still checked and tested in full, and does not pass: there is nothing to compare the translation with.

## The module: binding.mjs

The example's module, `guards/bindings/installs/binding.mjs`, in outline, without the two helpers that write a package's release and read whose copy stands:

```js
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// The code under test, as the binding's command built it in the copy.
import { exportEnvironment } from '../../../packages/cli/dist/lib/environment/exports.js';

const PACKAGES = ['acme/kit', 'mid/kit', 'zeta/kit'];

// A fresh state for one sequence: an empty project under the OS temp folder.
export function start() {
  const root = mkdtempSync(join(tmpdir(), 'spex-guard-installs-'));
  mkdirSync(join(root, 'specs', 'packages'), { recursive: true });
  mkdirSync(join(root, '.git'));
  return { root };
}

// One function for each declared event: cause it, return what was observed.
export const events = {
  async install({ root }, { selected, providing }) {
    const packages = {};
    for (const name of PACKAGES) {
      rmSync(join(root, '.spex', 'packages', ...name.split('/')), { recursive: true, force: true });
      // `release` is a helper, not shown: it writes one package's release.
      if (selected.includes(name)) packages[name] = release(root, name, providing.includes(name));
    }
    const report = await exportEnvironment({
      root,
      lock: { format: 1, requests: '0'.repeat(64), packages },
      workingFolder: root,
      userHome: null,
      agents: [],
    });
    return {
      // `standing` is a helper, not shown: whose copy stands at the path.
      standing: standing(root),
      blocked: report.specs.filter((spec) => spec.state === 'blocked').map((spec) => spec.name),
    };
  },
};

// Optional; always called after a sequence.
export function stop(state) {
  if (state) rmSync(state.root, { recursive: true, force: true });
}
```

| Export | Called |
| --- | --- |
| `start()` | before each sequence, to return a fresh state of the module's own for that sequence |
| `events.<event>(state, params)` | to cause one declared event with its params, and return the effect observed |
| `stop(state)` | where exported, after each sequence, however it ended |

- Each function may return at once or as a promise.
- An event function returns an object with every declared effect field, each a value of its type. An event that declares no effect field may return nothing.
- The module runs from the copy, so it reaches the project's code by relative path alone.
- Every sequence starts from a fresh state. A run causes each permitted case, then each step of the model after a shortest sequence to its state, and causes some sequences more than once: keep nothing between sequences outside what `start` returns, and let nothing depend on the clock, a random number or the order of a folder's listing.
- What the code does next must depend only on the events caused since `start`. Each step of the model is tried from one sequence, and the result assumes that another sequence to the same state of the model would give the same effect.
- Where the behavior depends on a clock or a restart, make that an event the module causes.
- The commands and the copy's process are given the OS temp-folder variables pointing inside the copy's own fresh folder, so what the module leaves under the OS temp folder goes with the copy.
- The module reports what the code did. It never holds what should have happened.
- A **failing binding** is a binding's folder with no `binding.mjs`, a declaration that names no `files`, a copy that cannot be made, a command that cannot start or ends with a non-zero status, a module that does not load, a missing `start` or event function, a `stop` that is no function, a function that throws, a returned value that is not the declared effect, or a process that ends before every sequence was caused. It makes the result `Inconclusive` and never counts as catching a kept fault. A path its cause names inside the copy is printed relative to the copy, as `src/lock.mjs`, never with the copy's own temporary folder.

## Kept faults

A kept fault is a unified diff as `git diff` writes it, in `guards/<guard>/faults/<name>.patch`.

- Its paths are from the root. Each path it names is one of the binding's `files` or under one of them, with no `node_modules` or `.git` part: a kept fault plants a defect in the code a run copies, never in the binding or in an installed dependency.
- Any other path is an error when the guard loads: `Cannot be checked — guards/<guard>/faults/<name>.patch: <path> is not among the binding's files`.
- It changes text files that exist. A patch that is no unified diff, that adds, removes or renames a file, or whose hunk has more lines than its header's counts say, is an error when the guard loads, naming the file and, unless it holds no change at all, the line.
- Text before the first `diff --git` or `--- ` line is its description, for people; the report names a kept fault by its file's name.
- `spex` applies it itself, without Git, to a copy: each hunk at the line it states, else at the nearest place where its context lines and removed lines match, the earlier of two equally near. Applying it never writes to a file outside the copy.

The example's kept fault, `guards/environments-56/faults/first-by-org.patch`, restores a defect the project once had:

```diff
Restores the behavior before 6000e8c: the path goes to the first package by <org>, even over a standing copy.

diff --git a/packages/cli/src/lib/environment/exports.ts b/packages/cli/src/lib/environment/exports.ts
--- a/packages/cli/src/lib/environment/exports.ts
+++ b/packages/cli/src/lib/environment/exports.ts
@@ -663,18 +663,10 @@
     if (!held.has(path) && standingMarker(root, path)?.name === name) held.set(path, name);
   }
 
-  // 1. The basename's claim: the package whose copy stands at the path,
-  //    else the first in name order.
-  const standsFor = (source: SpecSource): boolean => {
-    const path = placedSpecPath(source.id);
-    const digest = digestOf(path);
-    if (digest === null || digest === NOT_A_FILE) return false;
-    return previous[source.name]?.path === path || standingMarker(root, path)?.name === source.name;
-  };
-  const claimants = [...ordered].sort((a, b) => Number(standsFor(b)) - Number(standsFor(a)) || byName(a, b));
+  // 1. The basename's claim: the first in name order.
   const claims = new Map<string, SpecSource>();
   const blocked = new Set<string>();
-  for (const source of claimants) {
+  for (const source of ordered) {
     const path = placedSpecPath(source.id);
     if (claims.has(path) || held.has(path)) blocked.add(source.name);
     else claims.set(path, source);
```

To plant a defect and keep it as a kept fault, with the files it touches free of uncommitted changes:

1. Edit the code to make the defect.
2. Write the patch: `git diff --src-prefix=a/ --dst-prefix=b/ -- <paths> > guards/<guard>/faults/<name>.patch`.
3. Put the code back: `git apply -R guards/<guard>/faults/<name>.patch`.
4. Add the description above the first `diff --git` line.

To restore a past defect that commit `<fix>` corrected: `git diff --src-prefix=a/ --dst-prefix=b/ <fix> <fix>~1 -- <paths> > guards/<guard>/faults/<name>.patch`, then add the description.
The two prefix options make the patch read the same under any Git setting.
Where the clone does not hold that commit, as a shallow clone may not, or the patch no longer applies to today's code, plant the same defect by hand.
A patch that applies at other lines than it states needs no change.
Without Git, write the diff by hand in the form above.

A kept fault must leave the code building and the binding working: it changes what the code does, not whether it runs.
It must make the code give an effect the rule forbids, with the declared values, at a step of the model or of a permitted case.
A kept fault that only makes the code differ from the model, in a way the rule does not forbid, is not caught.

## The approval record

`spex approve <guard>` writes `guards/<guard>/approval.json`: one digest for each item and file the guard is made of.

| Approved | Which |
| --- | --- |
| items | the guard item with its cases, the rule, and every item either cites, one step away |
| files | `guard.yaml`, each translation, each kept fault's patch and every file under the binding's folder |

Before it writes, it prints what the person is approving: the guard item's statement, the rule's statement, then each case with its kind, its plain words and under them its steps.
Under `Also recorded, not printed here:` it then names every other file and item of the record, one to a line.
It checks each translation's form on its text first, and needs neither Java nor TLC.
Where nothing changed since the last approval it leaves the record as it is and says so.
Never write or edit the record by hand.
`spex verify` names each item or file that has changed, been added or gone since, and the guard does not pass until it is approved again.
A record that cannot be read as written, as after a merge conflict, leaves the guard `not approved — <path>: <cause>`; `spex approve` says so and replaces it.
The code the binding's `files` name is not part of the record: the code may change freely, and the guard tests it.

## Before the code is read

`spex verify` loads a guard whose binding has no module yet, so the translations can be drafted, compared and checked by TLC before any agent reads the code.
Until Step 4 of the workflow:

- the binding's folder holds `binding.yaml` alone, with `values` and `events` and no `files` or `commands`;
- the guard's folder holds `guard.yaml` and `translations/`, and no kept fault.

Before the first translation is saved, the guard `Cannot be checked` for having none, and `spex verify --keep` leaves the declaration in TLA+ for the Drafters ([The declaration in TLA+](#the-declaration-in-tla)).

With these the report's `Cases, without the code`, `Translations against each other` and `On the model` lines are complete, and nothing of the project runs.
Its `On the code` line reads `not tested`, with the cause where the checks before it fell short, and its result is `Inconclusive`: with `the translations differ` while they do, and with `a failing binding: no binding.mjs` once they agree and the model is checked.
The block ends `Does not pass`.
Step 4 adds the module, `files`, `commands` and the kept fault.
[results.md](results.md) explains the report.
