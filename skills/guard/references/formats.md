<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Guard files

The form of every item and file a guard is made of, as `spex verify` and `spex approve` read them.
One small example runs through this file: an entitlement that a user is granted, loses and uses.

## Contents

- [Where the files are](#where-the-files-are)
- [The items](#the-items)
- [Types and values](#types-and-values)
- [The declaration: binding.yaml](#the-declaration-bindingyaml)
- [The module: binding.mjs](#the-module-bindingmjs)
- [A reading](#a-reading)
- [The expression language](#the-expression-language)
- [The guard file: guard.yaml](#the-guard-file-guardyaml)
- [Kept faults](#kept-faults)
- [The approval record](#the-approval-record)
- [Before the code is read](#before-the-code-is-read)
- [The example's code](#the-examples-code)

## Where the files are

The root is the top folder of the Git repository, or the current folder where there is none.

| Kept | Where |
| --- | --- |
| The behavior item, the assertion and the examples | one spec package, `specs/packages/<package>.md` |
| The guard file: its binding, its bounds and each example's sequence | `guards/<guard>/guard.yaml` |
| Each reading | `guards/<guard>/readings/<name>.yaml` |
| Each kept fault | `guards/<guard>/faults/<name>.patch` |
| The approval record, written by `spex approve` alone | `guards/<guard>/approval.json` |
| A binding's declaration and module | `guards/bindings/<binding>/binding.yaml` and `binding.mjs` |

- `<guard>` is the ID of the assertion item, such as `entitlement-2`.
- Every folder directly under `guards/` other than `bindings` is a guard. One with no `guard.yaml` is reported as `Cannot be checked — guards/<name>/guard.yaml: not found`, so keep no other folder there.
- A guard's folder holds `guard.yaml`, `readings/`, `faults/` and `approval.json` and nothing else. `readings/` holds only `<name>.yaml` files and `faults/` only `<name>.patch` files. Any other entry is an error, a `.DS_Store` file aside.
- A binding's folder with no `binding.yaml` or no `binding.mjs` is an error.
- A binding's folder may hold other files the module needs; each one is approved with the guard.
- A name of a guard, binding, reading or fault is letters, digits, `.`, `_` and `-`, starting with a letter or digit.
- The three YAML files hold `format: 1`. A key this file does not name is an error.

## The items

A spec package is one Markdown file with the sections `Intent`, `External Behavior`, optionally `Internal Behavior`, and `Verification`, in that order.
An item is a heading whose text is its ID, `<package>-<N>`, followed by one GEARS statement:

```text
[Where <fixed conditions>] [While <state>] [When <trigger>] <subject> shall <behavior>.
```

| Item | Where | Rule |
| --- | --- | --- |
| The behavior item | `External Behavior` or `Internal Behavior` | Says the behavior itself |
| The assertion | `Verification`, same file | Says one thing that must hold, and cites the behavior item; it cites no other behavior item of that file |
| Each example | `Verification`, same file | Describes one sequence and what is seen, and cites the behavior item |

A citation is a link to the item's heading with the ID as its text: `[[entitlement-1](#entitlement-1)]`.
An approval covers these items and every item they cite, one step away.
Where the project uses `spex lint`, run it after you write the items.

The example's package, `specs/packages/entitlement.md`:

```markdown
# entitlement: Use of a Paid Feature

## Intent

This package defines who may use the paid feature.

## External Behavior

### entitlement-1

When a user uses the feature, the service shall allow the use only while that user holds a grant that has not been revoked.

## Verification

### entitlement-2

When a user who holds no grant uses the feature, the check shall find the use refused [[entitlement-1](#entitlement-1)].

### entitlement-3

When Ann is granted the feature, her grant is revoked and she then uses the feature, the check shall find the use refused [[entitlement-1](#entitlement-1)].

### entitlement-4

When Bob, who was never granted the feature, uses it, the check shall find that an allowed use is forbidden [[entitlement-1](#entitlement-1)].
```

`entitlement-2` is the assertion, so the guard is `entitlement-2`.
`entitlement-3` is a permitted example that shows the behavior happening; `entitlement-4` is a forbidden one.

## Types and values

A type is written as text in the declaration and in a reading's `state`.

| Type | Its values | Written in YAML or JSON as |
| --- | --- | --- |
| `bool` | true and false | a boolean |
| `int <a>..<b>` | the whole numbers from `a` to `b`, both included | an integer in the range |
| the name of a `values` set, such as `user` | the strings of that set | one of its strings |
| `set of <values name>`, `set of int <a>..<b>` | every set of those | a list without repeats, in any order |
| `map <values name> to <type>` | one value of the type for every string of the set | a mapping that holds every key |
| `<type>?` | the type's values and the missing value | the value, or `null` |

- `?` is written once, at the end: `set of user?` is a set that may be missing.
- After `map <values name> to <type>` a `?` belongs to that type, and `(<type>)?` groups: `map user to bool?` is a map whose values may be missing, and `(map user to bool)?` is a map that may be missing.
- Give an effect field room for what broken code could return. A returned value outside its declared type is a failing binding and never a violation, so a fault that drives a balance declared `int 0..100` to -1 cannot be caught.
- Values are written this way in an example's params and effects, in a state variable's `start`, and in what the module is given and returns.
- A name of a `values` set, an event, a param, an effect field or a state variable is letters, digits and `_`, not starting with a digit, and is no word of the expression language.
- A `values` set is none of `bool`, `int`, `set`, `of`, `map` and `to`.

## The declaration: binding.yaml

```yaml
format: 1
values:                # named finite sets of plain strings; order has meaning, earlier is less
  user: [ann, bob]
events:                # what the binding can cause, and what it can observe of each
  grant:
    params: { who: user }      # who is given a grant
  revoke:
    params: { who: user }      # whose grant is revoked
  use:
    params: { who: user }      # who uses the feature
    effect: { allowed: bool }  # whether the use was allowed
files:                 # the project files a run copies
  - src
commands: []           # run in the copy, in order, to build it
```

| Key | Holds |
| --- | --- |
| `values` | Each set has at least one string. A string is in one set only, once, is not empty, is none of `none`, `true` and `false`, and has no single quote, no control character such as a line break, and no space at either end. May be left out |
| `events` | At least one event. `params` are its named inputs and `effect` the named fields observed of it, each with a type. Either may be left out. A param may not have the name of a `values` set |
| `files` | One or more paths that exist in the project, from the root, written with `/`, each listed once and with no `node_modules` or `.git` part. None is `guards` or under it, by name or through a link: the binding's folder is copied by itself and is no code under test. A folder is copied whole, without `node_modules` and `.git` folders |
| `commands` | Each a list of words, the program first, run without a shell with the copy as working folder. A first word of `node` runs the Node that runs `spex`. A non-zero exit is a failing binding. Each is stopped after `sample.seconds` seconds, which is a timeout. May be left out |

Keep the values few: a check draws every param from its type, so two or three users reach more states than twenty.
Say in a comment beside each param and effect field what it means, in the items' words, as someone using the behavior would.
The Drafters are given the `values` and `events` with these comments, and a name alone can be read in more than one way.

**The copy.**
Every run checks a copy outside the project: the `files` and the binding's folder, at the paths they have in the project.
The copy uses the project's installed dependencies: wherever the project holds a `node_modules` folder, at the root, in a folder above a copied path or in a copied folder, the copy has a link to it at the same place.
`files` must therefore name the project files behind everything the module loads, directly or through another file.
Where the code is built, `files` names the sources and what the build reads, `commands` build them in the copy, and the module imports what that build wrote there.
Never name built output in `files`: the run would check the last build and not the code, and a kept fault in a source would change nothing the module loads.
Never name `guards` or a path under it either: that is an error when the guard loads, `Cannot be checked — guards/bindings/<name>/binding.yaml: files: '<entry>' is under guards/; a binding's folder is copied by itself and is no code under test`.

A run that loads a project file from outside the copy is `Inconclusive` and names the file.
This is seen for modules resolved in the main thread of the copy's process, by `import`, `require` or `import.meta.resolve`.
What a worker thread, or a process the code starts, loads is not seen in this stage: where the code uses either, check yourself that it reads the copy alone.

## The module: binding.mjs

```js
import { createEntitlements } from '../../../src/entitlement.mjs';

// A fresh state for one sequence.
export function start() {
  return createEntitlements();
}

// One function for each declared event: cause it, return what was observed.
export const events = {
  grant(state, { who }) {
    state.grant(who);
    return {};
  },
  revoke(state, { who }) {
    state.revoke(who);
    return {};
  },
  use(state, { who }) {
    return { allowed: state.use(who) };
  },
};

// Optional; always called after a sequence.
export function stop(state) {}
```

- Each function may return at once or as a promise.
- An event function returns an object with exactly the declared effect fields, each a value of its type. An event that declares no effect field may return `{}` or nothing.
- The module runs from the copy, so it reaches the project's code by relative path alone.
- Every sequence starts from a fresh state. Keep nothing between sequences outside what `start` returns.
- Where the behavior depends on a clock or a restart, make that an event the module causes.
- The commands and the copy's process are given the OS temp-folder variables pointing inside the copy's own fresh folder, so what the module leaves under the OS temp folder goes with the copy.
- The module reports what the code did. It never holds what should have happened.
- A **failing binding** is a copy that cannot be made, a command that cannot start or ends with a non-zero status, a module that does not load, a missing `start` or event function, a `stop` that is no function, a function that throws, a returned value that is not the declared effect, a process that ends before it gave its result, or a sequence that broke the assertion and does not when run again. It makes a check `Inconclusive` and never counts as catching a fault.

## A reading

A reading is one account of the assertion, as data in one YAML file.
This one is for the example, whose declaration has the values `user: [ann, bob]` and the events `grant`, `revoke` and `use`, each with the param `who: user`, `use` with the effect `allowed: bool`.

```yaml
format: 1
state:                       # the reading's own memory; may be left out
  holders: { type: set of user, start: [] }
events:                      # an event left out is always legal and changes nothing
  grant:
    legal: "true"            # when the event is legal; "true" where left out
    then:                    # the new state after the event
      holders: "holders union {who}"
  revoke:
    then:
      holders: "holders minus {who}"
assertion:                   # one or more rules
  - on: use                  # an event, or a list of events
    when: "not (who in holders)"       # when the rule applies; "true" where left out
    shall: "effect.allowed == false"   # what must then hold
```

Every condition and new value is an expression of the language below, written as a quoted string.
A YAML boolean or whole number where an expression is expected, as in `legal: true`, stands for itself.

| Key | Holds | May read |
| --- | --- | --- |
| `state.<variable>` | `type`, and `start`, its value when a sequence starts | nothing |
| `events.<event>.legal` | when the event is legal | the state and the event's params |
| `events.<event>.then.<variable>` | the variable's new value | the state before the event, its params and `effect.<field>` |
| a rule's `on` | a declared event, or a list of them | nothing |
| a rule's `when` | when the rule applies | the state before the event and its params |
| a rule's `shall` | what must then hold | the state before the event, its params and `effect.<field>` |

- A variable that no `then` names keeps its value.
- A state variable may not have the name of a `values` set or of any event's param.
- A rule that names several events must read only what each of them has.

For one step, which is an event with its params and an observed effect, a reading finds:

| Found | When |
| --- | --- |
| **legal** | the event's `legal` is true |
| **applies** | some rule naming the event has a true `when` |
| **forbidden** | some rule that applies has a false `shall` |
| the next state | each variable's `then`, read at the state before the step |

Whether a step is forbidden is found for every reading before any reading's next state is worked out.
A step every reading forbids is a violation and ends its sequence there: no next state is read after it, nor after an example's last step.
A new value outside its variable's type, or a whole number an expression gives beyond 9007199254740991 either side of zero, is a **reading error**.

## The expression language

The language is closed: no loops, no definitions, no input or output.
Every expression is typed when the files load, and a type error names the file and the expression.
The forms, from the one that binds loosest to the one that binds tightest:

| Form | Reads as |
| --- | --- |
| `if c then a else b` | `a` where `c` holds, else `b` |
| `all x in S: e`, `any x in S: e` | `e` holds for every member `x` of `S`, for some member |
| `map x in V: e` | the map giving `e` for each string `x` of the `values` set `V` |
| `a implies b` | `b` wherever `a`; groups to the right |
| `a or b` | either |
| `a and b` | both |
| `not a` | the opposite |
| `a == b`, `a != b`, `a < b`, `a <= b`, `a > b`, `a >= b` | a comparison; never chained |
| `x in S` | `x` is a member of `S` |
| `S union T`, `S minus T` | the members of either; the members of `S` not in `T` |
| `S intersect T` | the members of both |
| `a + b`, `a - b` | sum and difference |
| `a * b` | product |
| `-a` | the negative |
| `m[k]` | the map's value at key `k` |

The first three forms take everything to their right, and may stand wherever an operand may, as in `b or all x in S: e` and `1 + if c then 1 else 2`.
Forms on one row group from the left.
Parentheses group.

| Simple form | Reads as |
| --- | --- |
| `true`, `false` | the two truth values |
| `none` | the missing value |
| digits, such as `12` | a whole number |
| a string in single quotes, such as `'ann'` | that string of a `values` set |
| `{a, b}`, `{}` | the set of the listed values; the empty set |
| `{x in S: e}` | the members `x` of `S` for which `e` holds |
| a name | a state variable, a param, a `values` set as the set of all its strings, or the `x` of an enclosing form |
| `effect.<field>` | a field of the observed effect |
| `size(S)` | how many members `S` has |
| `min(S)`, `max(S)` | the least and the greatest member of `S`; missing for the empty set |
| `default(e, d)` | `e` where it is present, else `d` |

What each form takes and gives:

| Form | Takes | Gives |
| --- | --- | --- |
| `not`, `and`, `or`, `implies` | `bool` | `bool` |
| `==`, `!=` | two values of one type, or of a type and the same type with `?` | `bool` |
| `<`, `<=`, `>`, `>=` | two whole numbers, or two values of one `values` set, compared by declared order | `bool` |
| `x in S` | a set and a value of its member type, with or without `?`; `none in S` is false | `bool` |
| `union`, `minus`, `intersect` | two sets of one member type | a set of that type |
| `+`, `-`, `*`, `-a` | whole numbers | a whole number |
| `m[k]` | a map and a value of its key set | the map's value type |
| `size(S)` | a set | a whole number |
| `min(S)`, `max(S)` | a set of whole numbers or of one `values` set | the member type with `?` |
| `default(e, d)` | a value of a type with `?`, and one of that type without | the type without `?` |
| `if c then a else b` | `bool`, then two values that `==` could compare | their type, with `?` where either has it |
| `all x in S: e`, `any x in S: e` | a set, and `e` a `bool` | `bool` |
| `{x in S: e}` | a set, and `e` a `bool` | the type of `S` |
| `map x in V: e` | the name of a `values` set, and `e` of any type | a map from `V` to the type of `e` |

- A `legal`, a `when` and a `shall` are `bool`; a `then` has its variable's type, with or without `?` where the variable has it.
- `all`, `any` or `{x in S: e}` over a bare `{}` is a type error: nothing says what the set holds.
- A name is letters, digits and `_`, not starting with a digit, and none of these words: `true`, `false`, `none`, `not`, `and`, `or`, `implies`, `in`, `union`, `minus`, `intersect`, `size`, `min`, `max`, `default`, `if`, `then`, `else`, `all`, `any`, `map`, `effect`.
- The `x` of a form may not be the name of a state variable, a param, a `values` set or an enclosing `x`.
- There is no division. Written digits beyond 9007199254740991 are an error when the file loads, and a whole number an expression gives beyond it, either side of zero, is a reading error.

## The guard file: guard.yaml

```yaml
format: 1
binding: entitlements
sample: { sequences: 200, events: 12, seed: 1, seconds: 300 }
examples:
  - item: entitlement-3
    kind: permitted
    steps:
      - { event: grant, params: { who: ann } }
      - { event: revoke, params: { who: ann } }
      - { event: use, params: { who: ann }, effect: { allowed: false } }
  - item: entitlement-4
    kind: forbidden          # the last step is the one that must never happen
    steps:
      - { event: use, params: { who: bob }, effect: { allowed: true } }
```

| Key | Holds |
| --- | --- |
| `binding` | the name of a folder under `guards/bindings/` |
| `sample.sequences` | how many sequences a check generates; 1 or more |
| `sample.events` | the most events in one sequence; 1 or more |
| `sample.seed` | the seed; 0 to 2147483647 |
| `sample.seconds` | the time limit in seconds, for each of the binding's commands and for the copy's checking process; 1 or more |
| `examples` | at least one permitted and one forbidden, each with `item`, an example item named once, `kind` and `steps` |
| a step | `event`, `params` with a value for every param of the event, and `effect` with a value for each effect field its item speaks of |

- All four bounds are required. The four in the example are a fair start.
- Before you ask for approval, run with two or three other seeds and note the sequence at which each kept fault is caught. Where a seed misses it, or catches it only near the last sequence, add with the person a permitted example that leads to the case, or raise `sequences`. Then put the seed back: never choose a seed because it passes.
- At the time limit the command or the copy's process is stopped, and every process it started with it. That is a timeout.
- A process a command starts is stopped when that command ends: start what a sequence needs in the module's `start`, never in `commands`.
- On macOS and Linux a process that has left the group of the one that started it, by starting a session of its own, is not stopped, at the time limit or at any other time. Where the code starts one, end it in the module's `stop`, and after a timeout check that none is left.
- A guard with no reading, no permitted example or no forbidden example is `Cannot be checked`.
- An example has at least one step and at most `sample.events` steps.
- An effect field a step leaves out is not compared with the code. It is an error where a reading needs that field at that step: the `shall` of a rule that applies there reads it, or the event's `then` reads it and a later step follows. The report then reads `Cannot be checked — guards/<guard>/guard.yaml: example <item>, step <n>: reading <name> reads effect.<field>, which the step does not state`. Several fields of one step are written `effect.<a> and effect.<b>`, and several steps are joined by `; `.
- Where that error names a field the item does not speak of, the item leaves something unsaid: ask the person what is seen at that step, say it in the item and state it in the step. Never fill it in from the code.
- A generated sequence is the first steps of one permitted example, any number from none to all, followed by events drawn from the declaration, cut to `sample.events` events. The seed fixes the sequences, so a run gives the same report until something it uses changes.

## Kept faults

A kept fault is a unified diff as `git diff` writes it, in `guards/<guard>/faults/<name>.patch`.

- Its paths are from the root. Each path it names is one of the binding's `files` or under one of them, with no `node_modules` or `.git` part: a fault is a defect in the code a run copies, never in the binding or in an installed dependency.
- Any other path is an error when the guard loads: `Cannot be checked — guards/<guard>/faults/<name>.patch: <path> is not among the binding's files`.
- It changes text files that exist. A patch that is no unified diff, that adds, removes or renames a file, or whose hunk has more lines than its header's counts say, is an error when the guard loads, naming the file and, unless it holds no change at all, the line.
- Text before the first `diff --git` or `--- ` line is its description, for people; the report names a fault by its file's name.
- `spex` applies it itself, without Git, to a copy: each hunk at the line it states, else at the nearest place where its context lines and removed lines match, the earlier of two equally near. Applying it never writes to a file outside the copy.

The example's fault, `guards/entitlement-2/faults/revoke-keeps-grant.patch`:

```diff
Revoke leaves the grant in place.

diff --git a/src/entitlement.mjs b/src/entitlement.mjs
--- a/src/entitlement.mjs
+++ b/src/entitlement.mjs
@@ -7,3 +7,3 @@
     revoke(user) {
-      holders.delete(user);
+      // the grant stays
     },
```

To plant a fault, with the files it touches free of uncommitted changes:

1. Edit the code to make the defect.
2. Write the patch: `git diff --src-prefix=a/ --dst-prefix=b/ -- <paths> > guards/<guard>/faults/<name>.patch`.
3. Put the code back: `git apply -R guards/<guard>/faults/<name>.patch`.
4. Add the description above the first `diff --git` line.

To restore a past defect that commit `<fix>` corrected: `git diff --src-prefix=a/ --dst-prefix=b/ <fix> <fix>~1 -- <paths> > guards/<guard>/faults/<name>.patch`, then add the description.
The two prefix options make the patch read the same under any Git setting.
Where the clone does not hold that commit, as a shallow clone may not, or the patch no longer applies to today's code, plant the same defect by hand.
A patch that applies at other lines than it states needs no change.
Without Git, write the diff by hand in the form above.

A fault must leave the code building and the binding working: it changes what the code does, not whether it runs.

## The approval record

`spex approve <guard>` writes `guards/<guard>/approval.json`: one digest for each item and file the guard is made of.
Never write or edit it by hand.
`spex verify` names each of them that has changed, been added or gone since, and the guard does not pass until it is approved again.
A record that cannot be read as written, as after a merge conflict, leaves the guard `not approved — <path>: <cause>`; `spex approve` says so and replaces it.
The code the binding's `files` name is not part of the record: the code may change freely, and the guard checks it.

## Before the code is read

`spex verify` loads a whole guard, so the declaration needs `files` and a module before the code may be read.
Until Step 4 of the workflow, use these stand-ins:

- `files` lists the spec package's file alone, such as `specs/packages/entitlement.md`;
- `binding.mjs` is this:

```js
// Stand-in until the binding is written.
export function start() {
  throw new Error('the binding is not written yet');
}
export const events = {};
```

With them the report's `Examples against the readings` line is complete, and its `On the code` line reads `Inconclusive` for a failing binding.
Replace both in Step 4.

## The example's code

The project's code, `src/entitlement.mjs`:

```js
export function createEntitlements() {
  const holders = new Set();
  return {
    grant(user) {
      holders.add(user);
    },
    revoke(user) {
      holders.delete(user);
    },
    use(user) {
      return holders.has(user);
    },
  };
}
```

With the files above and the reading saved as `readings/a.yaml`, the guard is whole.
Its examples are as the reading states them, and `entitlement-3` shows the behavior happening: at its third step Ann holds no grant, so the assertion applies.
On a copy with the kept fault, the sequence grant Ann, revoke Ann, use by Ann ends with `allowed=true`, which the reading forbids, so the fault is caught.
[results.md](results.md) explains the report `spex verify entitlement-2` prints.
