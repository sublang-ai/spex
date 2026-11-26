<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# guards: Guards Checked from the Command Line

## Intent

This package defines guards as the `spex` command line checks them, under [DR-243](../decisions/243-guards-protect-critical-behavior-on-every-change.md) and [DR-244](../decisions/244-a-guard-is-checked-on-the-implementation.md) in the first stage [DR-252](../decisions/252-a-guard-is-kept-beside-the-code.md) sets: where a project keeps a guard, the items and files a guard is made of, the language its readings are written in, the approval a person records with `spex approve`, and what `spex verify` checks, finds and reports.
A **guard** protects one behavior on every change: it checks one assertion on the project's code, has shown that it catches a fault, and changes only with a person's approval.
Its **assertion** is a test item saying what must hold, its **behavior item** is the item that assertion cites, and an **example** is a test item describing one sequence, **permitted** or **forbidden**.
A **binding** connects guards to the code: its **declaration** names each **event** it can cause and the **effect** it observes of it, and its **module** causes them.
A **reading** is one account of the assertion, held as data: its own **state**, when each event is **legal**, when the assertion **applies**, and when an observed effect is **forbidden**.
A **sequence** is events in order, each with its params.
A **kept fault** is a patch that plants a defect the guard must catch.
A **copy** is the code a run checks, made outside the project.
The **bounds** are the number of sequences, the most events in one, the **seed** and the time limit.
An **input** is an item or file whose digest the **approval record** holds, and a **result** is what the checks established on the project's code.
**Name order**, and every order this package calls sorted, is by UTF-16 code unit, so `environments-100` comes before `environments-55`.
Approval here is a person's approval of a guard, not the live tool approvals of the `approvals` package.
This package owns the two commands and the files they read, not the `guard` skill that drafts a guard [[agent-skills-13](agent-skills.md#agent-skills-13)], not the usage that lists the commands [[cli-21](cli.md#cli-21)], and not any guard's own items, which stand in the package of the behavior they protect.

## External Behavior

### Where a guard is kept

#### guards-1

Where a project keeps guards, the CLI shall read them from `guards/` at the project's root, taking as a guard every folder directly under `guards/` other than `bindings`, and naming it by that folder's name ([DR-252](../decisions/252-a-guard-is-kept-beside-the-code.md)):

| Kept | Where |
| --- | --- |
| the guard file: its binding, its bounds and each example's sequence [[guards-10](#guards-10)] | `guards/<guard>/guard.yaml` |
| each reading [[guards-6](#guards-6)] | `guards/<guard>/readings/<name>.yaml` |
| each kept fault [[guards-11](#guards-11)] | `guards/<guard>/faults/<name>.patch` |
| the approval record [[guards-15](#guards-15)] | `guards/<guard>/approval.json` |
| a binding's declaration and module [[guards-3](#guards-3)] [[guards-5](#guards-5)] | `guards/bindings/<name>/binding.yaml` and `binding.mjs` |

- the root is the top level of the enclosing Git repository, or the current folder outside any, as `spex lint` targets it when it is given no path [[lint-1](lint.md#lint-1)];
- a guard's name is the ID of its assertion item [[guards-2](#guards-2)];
- a reading's or kept fault's name is its file's name without the extension;
- the name of a guard, a binding, a reading and a kept fault is made of letters, digits, `.`, `_` and `-`, and starts with a letter or digit;
- a guard's folder holds `guard.yaml`, `readings/`, `faults/` and `approval.json` and nothing else, `readings/` holds `<name>.yaml` files alone and `faults/` holds `<name>.patch` files alone, a `.DS_Store` file aside;
- a folder under `guards/` with no `guard.yaml` is still a guard, one that cannot be checked [[guards-18](#guards-18)];
- a binding's folder may hold other files, each an input [[guards-14](#guards-14)].

#### guards-2

When the CLI loads a guard, it shall read these spec items [[meta-11](../meta.md#meta-11)] from `specs/meta.md` and the files under `specs/packages/` at the root [[guards-1](#guards-1)], each one missing or out of place being an error that names it:

| Item | Which |
| --- | --- |
| the assertion item | the item whose ID is the guard's name, in a Verification section [[meta-30](../meta.md#meta-30)] |
| the behavior item | the one item in the External Behavior or Internal Behavior section of the same file that the assertion item cites, none or several being an error naming the assertion item |
| each example item | an item the guard file names [[guards-10](#guards-10)], other than the assertion item, in the Verification section of the same file, citing that behavior item |
| each cited item | every spec item cited by a link [[meta-16](../meta.md#meta-16)] in the body of the assertion item, the behavior item or an example item, one step only, a link to a decision record being no item |

- an ID that no item has, or that several items have, is an error naming it;
- an item's text, for its digest, runs from its heading line to the line before the next heading of the same or a shallower depth, with trailing blank lines dropped and line endings as LF;
- an item's statement, for printing, is the first non-empty paragraph of its body, joined on one line, with each Markdown link replaced by its text, so that a citation prints as `[environments-41]`.

### The binding

#### guards-3

Each binding shall declare, in its `binding.yaml`, what it can cause and observe, the files a run copies and the commands that build the copy:

| Key | Holds |
| --- | --- |
| `format` | `1` |
| `values` | named finite sets of plain strings, each a list of one string or more whose order has meaning, earlier before later |
| `events` | each event by name, with `params`, its named inputs and their types, and `effect`, the named fields observed of it and their types |
| `files` | the project files a run copies, a list of one path or more, each relative to the root and written with `/`, a folder copied whole |
| `commands` | the commands that build the copy, run in order, each a list of one word or more, the program first, run without a shell [[guards-12](#guards-12)] |

| Type | Its values |
| --- | --- |
| `bool` | true and false |
| `int <a>..<b>` | the whole numbers from `a` to `b`, both included, with `a` no greater than `b` |
| the name of a `values` set | the strings of that set |
| `set of` that name, or `set of int <a>..<b>` | every set of those |
| `map <values name> to <type>` | one value of the type for every string of the set |
| `<type>?` | the type's values and the missing value |

- `values` and `commands` may be left out, as may an event's `params` and `effect`, and `events` names at least one event;
- `?` is written once, at the end, so `set of <name>?` is a set that may be missing;
- after `map <name> to <type>` a `?` belongs to that type, and `(<type>)?` groups, so `(map <name> to bool)?` is a map that may be missing;
- a string is in one `values` set only, once, is none of `none`, `true` and `false`, is not empty, and has no single quote, no control character and no space at either end;
- the name of a `values` set, an event, a param or an effect field is a name of the language [[guards-8](#guards-8)];
- no `values` set is named `bool`, `int`, `set`, `of`, `map` or `to`, and no param has the name of a `values` set;
- each path of `files` is listed once, exists in the project, stays inside it and has no `node_modules` or `.git` part;
- no path of `files` is `guards` or under it, links followed, the binding's folder being copied by itself [[guards-12](#guards-12)] and no code under test, and such an entry is an error naming the file and the entry.

#### guards-4

Wherever a value of a declared type is written as YAML or JSON — an example's params and effects, a state variable's `start`, what a binding's module is given and what it returns — the CLI shall read and write it by its type:

| Type | Written as |
| --- | --- |
| `bool` | a boolean |
| `int <a>..<b>` | an integer in the range |
| the name of a `values` set | one of its strings |
| a set | a list without repeats, in any order, read into the declared order of its members |
| a map | a mapping holding every key |
| the missing value | `null` |

- anything else is not a value of the type.

#### guards-5

Each binding's module, the `binding.mjs` beside its declaration, shall export what a run calls to drive the code:

| Export | Called |
| --- | --- |
| `start()` | before each sequence, to return a fresh state of the module's own for that sequence |
| `events.<event>(state, params)` | to cause one declared event with its params, and return the effect observed, an object holding every declared field [[guards-4](#guards-4)] |
| `stop(state)` | after each sequence, however it ended, where the module exports it |

- each may return at once or later, as a promise;
- an event that declares no effect field may return nothing, which reads as `{}`;
- the module is loaded from the copy, at the path it has in the project, and reaches the project's code by relative path alone [[guards-12](#guards-12)];
- what the module leaves under the OS temp folder goes with the copy [[guards-12](#guards-12)];
- a module that does otherwise is a failing binding [[guards-36](#guards-36)].

### A reading

#### guards-6

Each reading shall hold, in its YAML file, its own state, its rules for each event and the assertion, every condition and new value an expression of the language [[guards-8](#guards-8)] written as a string:

| Key | Holds | May read |
| --- | --- | --- |
| `format` | `1` | nothing |
| `state.<variable>` | `type`, a declared type [[guards-3](#guards-3)], and `start`, its value when a sequence starts [[guards-4](#guards-4)] | nothing |
| `events.<event>.legal` | when the event is legal, `true` where left out | the state and the event's params |
| `events.<event>.then.<variable>` | the variable's new value after the event | the state before the event, its params and `effect.<field>` |
| `assertion` | one or more rules, each with `on`, `when` and `shall` | as below |
| a rule's `on` | a declared event's name, or a list of them, each once | nothing |
| a rule's `when` | when the rule applies, `true` where left out | the state before the event and its params |
| a rule's `shall` | what must then hold | the state before the event, its params and `effect.<field>` |

- `state` may be empty or left out, and an event left out of `events` is always legal and changes nothing;
- a variable no `then` names keeps its value;
- a rule naming several events is typed for each of them;
- a state variable's name is a name of the language [[guards-8](#guards-8)], and no state variable has the name of a param or of a `values` set;
- a YAML boolean or whole number where an expression is expected stands for itself.

#### guards-7

When the readings judge one step — an event with its params and an effect, each reading at its own state — the CLI shall find for each reading:

| Found | When |
| --- | --- |
| legal | the event's `legal` is true |
| applies | some rule naming the event has a true `when` |
| forbidden | some rule that applies has a false `shall` |
| the next state | each variable's `then`, read at the state before the step |

- legal and applies read no effect and are found before the event is caused;
- whether the step is forbidden is found for every reading before any reading's next state is worked out;
- no next state is worked out after a violation [[guards-21](#guards-21)] [[guards-22](#guards-22)], nor after the last step of an example, so a reading error there hides no forbidden step;
- a new value outside its variable's declared type, or a whole number that an expression gives beyond the range JavaScript holds exactly, 9007199254740991 either side of zero, is a **reading error**.

### The expression language

#### guards-8

An expression in a reading shall be written in this closed language, which has no loops, definitions, input or output, its forms listed from the one that binds loosest to the one that binds tightest:

| Form | Reads as |
| --- | --- |
| `if c then a else b` | `a` where `c` holds, else `b` |
| `all x in S: e`, `any x in S: e` | `e` holds for every member `x` of `S`, for some member |
| `map x in V: e` | the map giving `e` for each string `x` of the `values` set `V` |
| `a implies b` | `b` wherever `a`, grouping to the right |
| `a or b` | either |
| `a and b` | both |
| `not a` | the opposite |
| `a == b`, `a != b`, `a < b`, `a <= b`, `a > b`, `a >= b` | a comparison, never chained |
| `x in S` | `x` is a member of `S` |
| `S union T`, `S minus T` | the members of either, the members of `S` not in `T` |
| `S intersect T` | the members of both |
| `a + b`, `a - b` | sum and difference |
| `a * b` | product |
| `-a` | the negative |
| `m[k]` | the map's value at key `k` |

| Simple form | Reads as |
| --- | --- |
| `true`, `false` | the two truth values |
| `none` | the missing value |
| digits, such as `12` | a whole number |
| a string in single quotes, such as `'acme/kit'` | that string of a `values` set |
| `{a, b}`, `{}` | the set of the listed values, the empty set |
| `{x in S: e}` | the members `x` of `S` for which `e` holds |
| a name | a state variable, a param, a `values` set as the set of all its strings, or the `x` of an enclosing form |
| `effect.<field>` | a field of the observed effect |
| `size(S)` | how many members `S` has |
| `min(S)`, `max(S)` | the least and the greatest member of `S`, missing for the empty set |
| `default(e, d)` | `e` where it is present, else `d` |
| `(e)` | `e`, grouped |

- the first three forms take everything to their right, and may stand wherever an operand may, as in `b or all x in S: e` and `1 + if c then 1 else 2`;
- forms on one row group from the left;
- a name is a letter or underscore followed by letters, digits and underscores, and is no word of the language;
- there is no division.

#### guards-9

When a guard's files load, the CLI shall type every expression against the binding's declaration and the reading's state by these rules, a breach being a type error that names the file and the expression:

| Form | Takes | Gives |
| --- | --- | --- |
| `true`, `false` | nothing | `bool` |
| digits | nothing | a whole number |
| a quoted string | a string of some `values` set | that set's type |
| `none` | nothing | the missing value of any `<type>?` |
| `{a, b}` | whole numbers, or values of one `values` set | a set of them |
| `{}` | nothing | the empty set of any member type |
| the name of a `values` set | nothing | the set of all its strings |
| a state variable, a param, `effect.<field>` | nothing | its declared type |
| `not`, `and`, `or`, `implies` | `bool` | `bool` |
| `==`, `!=` | two values of one type, or of a type and the same type with `?` | `bool` |
| `<`, `<=`, `>`, `>=` | two whole numbers, or two values of one `values` set, compared by declared order | `bool` |
| `x in S` | a set and a value of its member type, with or without `?`, `none in S` being false | `bool` |
| `union`, `minus`, `intersect` | two sets of one member type | a set of that type |
| `+`, `-`, `*`, `-a` | whole numbers | a whole number |
| `m[k]` | a map and a value of its key set | the map's value type |
| `size(S)` | a set | a whole number |
| `min(S)`, `max(S)` | a set of whole numbers or of one `values` set | the member type with `?` |
| `default(e, d)` | a value of a type with `?`, and one of that type without | the type without `?` |
| `if c then a else b` | `bool`, then two values that `==` could compare | their type, with `?` where either has it |
| `all x in S: e`, `any x in S: e` | a set, and `e` a `bool` with `x` a member | `bool` |
| `{x in S: e}` | a set, and `e` a `bool` with `x` a member | the type of `S` |
| `map x in V: e` | the name of a `values` set, and `e` of any type with `x` one of its strings | a map from `V` to the type of `e` |

- a `legal`, a `when` and a `shall` are `bool`, and a `then` has its variable's type, with or without `?` where the variable has it;
- a whole number in an expression has no range of its own, a declared range being checked only where a value is stored [[guards-7](#guards-7)];
- these are type errors: a name read where [[guards-6](#guards-6)] does not allow it, an unknown name, and an `x` that has the name of a state variable, a param, a `values` set or an enclosing `x`;
- `all`, `any` or `{x in S: e}` over a bare `{}` is a type error, since nothing says what the set holds;
- written digits beyond the range JavaScript holds exactly are an error when the file loads;
- `and`, `or`, `implies` and `if` work out only the side they need, the left first;
- every expression that types has a value, with the one exception of a whole number beyond that range on a side that is worked out, a reading error [[guards-7](#guards-7)].

### The guard file and its kept faults

#### guards-10

Each guard's `guard.yaml` shall name its binding, fix its bounds and hold each example again as a sequence:

| Key | Holds |
| --- | --- |
| `format` | `1` |
| `binding` | the name of a folder under `guards/bindings/` |
| `sample.sequences` | how many sequences the sampled check generates, a positive whole number |
| `sample.events` | the most events in one sequence, a positive whole number |
| `sample.seed` | the seed, a whole number from 0 to 2147483647 |
| `sample.seconds` | the time limit, a positive whole number of seconds, for each of the binding's commands and for the copy's process [[guards-12](#guards-12)] |
| `examples` | a list, each entry holding `item`, the ID of an example item [[guards-2](#guards-2)] named once, `kind`, `permitted` or `forbidden`, and `steps` |
| a step | `event`, a declared event, `params`, a value for every param of the event, and `effect`, a value for each effect field the item speaks of [[guards-4](#guards-4)] |

- all four bounds are required;
- an example has at least one step and at most `sample.events` steps;
- a forbidden example's last step is the offending one;
- an effect field a step leaves out is not compared with the code;
- a left-out field is an error naming the example, the step, the reading and the field where that reading needs it at that step [[guards-7](#guards-7)]: the `shall` of a rule that applies there reads it, or the event's `then` reads it and a later step follows.

#### guards-11

Each kept fault shall be a patch that the CLI applies itself, without Git, to a copy:

- the patch is a unified diff as `git diff` writes it, its paths relative to the root, changing text files that exist;
- the first folder of each of a change's two file names is dropped where it is one character long, as in `a/` and `b/`, `i/` and `w/`, `c/` and `o/` or `1/` and `2/`, and the two names are then equal;
- each path it names is one of the binding's `files` [[guards-3](#guards-3)] or under one of them, so that no kept fault changes a binding, and has no `node_modules` or `.git` part;
- a path that is not is an error when the guard loads, `guards/<guard>/faults/<name>.patch: <path> is not among the binding's files` [[guards-18](#guards-18)];
- a patch that is no such diff, that adds, removes or renames a file, or whose hunk has more lines than its header's counts say, is an error when the guard loads, naming the file and, unless it holds no change at all, the line;
- text before the first line that starts `diff --git` or `--- ` is its description and no part of the diff;
- each hunk is applied at the line it states, else at the nearest place where its context lines and removed lines match, the earlier of two equally near;
- lines compare with a trailing CR ignored, and a patched file keeps its own line endings;
- applying a patch writes to no file whose real path, links followed, is outside the copy;
- a patch **does not apply** where a file it names was not copied, is outside the copy or is not text, or a hunk matches nowhere;
- a patch **changes nothing** where every copied file has the same bytes after it as before.

### The copy

#### guards-12

When `spex verify` checks code — the project's code, and each kept fault apart — it shall make a copy outside the project and run that copy's checks in a process of its own, by these steps ([DR-252](../decisions/252-a-guard-is-kept-beside-the-code.md)):

1. make a fresh folder under the OS temp folder;
2. copy each of the binding's `files` [[guards-3](#guards-3)] and the binding's folder to the paths they have in the project, following links and leaving out every `node_modules` and `.git` folder;
3. wherever the project holds a `node_modules` folder — at the root, in a folder above a copied path or in a copied folder — put a link to it at the same place in the copy, so that the copy uses the project's installed dependencies;
4. apply the kept fault's patch, where the copy is a kept fault's [[guards-11](#guards-11)];
5. run the binding's `commands` in order, with the copy as the working folder, a command whose first word is `node` running the Node that runs Spex, and each stopped `sample.seconds` seconds after it started [[guards-10](#guards-10)];
6. start one process on the Node that runs Spex, with the copy as its working folder, which loads the module from the copy [[guards-5](#guards-5)] and runs the checks;
7. stop that process `sample.seconds` seconds after it started;
8. remove the folder.

- a command or the copy's process stopped at the limit is a **timeout**;
- when a command or the copy's process ends, is stopped at the limit, or the run is interrupted [[guards-27](#guards-27)], every process it started is stopped with it, so nothing a command starts outlives that command;
- `spex verify` does not wait for what such a process still prints or holds open;
- on Windows such a process is found only while the one that started it still runs;
- on macOS and Linux a process that has left the group of the one that started it, by starting a session of its own, is not stopped;
- the commands and the copy's process are given the OS temp-folder variables pointing inside the fresh folder of step 1, so what they leave there goes with the copy;
- the digest of the copied files is one SHA-256 over the sorted relative paths and the bytes of everything step 2 copied, before any patch;
- what the code prints takes no part in a result.

#### guards-13

While a copy's process runs, the CLI shall note every module that is resolved in the main thread of that process — by `import`, `require` or `import.meta.resolve` — to a path inside the project's root, outside the copy and under no `node_modules` folder as a **project file loaded from outside the copy**, and name the first one in the result [[guards-23](#guards-23)], real paths being compared with links followed ([DR-252](../decisions/252-a-guard-is-kept-beside-the-code.md)):

- a module resolved in a worker thread, or in a process the code starts, is not seen in this stage.

#### guards-36

When a binding's command or module does not do what its declaration and its exports promise [[guards-3](#guards-3)] [[guards-5](#guards-5)], the CLI shall find a **failing binding**, which ends the checks on that copy, in each of these cases:

| Part | Fails when |
| --- | --- |
| the copy | it cannot be made |
| a command | it cannot start, or ends with a non-zero status |
| the module | it does not load, exports no `start`, exports no function for a declared event, or exports a `stop` that is no function |
| a call | `start`, an event function or `stop` throws |
| an effect | the returned value is not the declared effect: a field missing, a field too many or a value out of its type [[guards-4](#guards-4)] |
| the copy's process | it ends before it gave its result |
| a sequence | it broke the assertion and does not when run again |

- the cause given for a command or process that ended early is the last line of its standard error that is neither a `Node.js v…` line nor a stack line starting with `at `;
- a timeout is not a failing binding [[guards-12](#guards-12)].

### Approval

#### guards-14

When the CLI reads a guard's inputs, for `spex approve` and for `spex verify` alike, it shall take one SHA-256 digest, written in hex, for each of these under its label ([DR-252](../decisions/252-a-guard-is-kept-beside-the-code.md)):

| Label | Input |
| --- | --- |
| `item <id>` | the text [[guards-2](#guards-2)] of the assertion item, the behavior item, each example item and each cited item |
| `file <path>` | `guard.yaml`, each reading, each kept fault's patch and every file under the binding's folder outside a `node_modules` or `.git` folder, by its path from the root with forward slashes |

- a digest is taken over the text with LF line endings, and over the bytes as they are where a file is not UTF-8 text;
- the approval record is no input, and neither is the code the binding's `files` name.

#### guards-15

The approval record of a guard shall be the JSON file `approval.json` holding `format` and, under `inputs`, the digest of every input under its label [[guards-14](#guards-14)], written with sorted keys, an indent of two spaces and a newline at its end, as is the first guard's:

```json
{
  "format": 1,
  "inputs": {
    "file guards/bindings/exports/binding.mjs": "<64 hex digits>",
    "file guards/bindings/exports/binding.yaml": "<64 hex digits>",
    "file guards/environments-55/faults/first-by-org.patch": "<64 hex digits>",
    "file guards/environments-55/guard.yaml": "<64 hex digits>",
    "file guards/environments-55/readings/a.yaml": "<64 hex digits>",
    "item environments-26": "<64 hex digits>",
    "item environments-41": "<64 hex digits>",
    "item environments-42": "<64 hex digits>",
    "item environments-55": "<64 hex digits>",
    "item environments-56": "<64 hex digits>",
    "item environments-57": "<64 hex digits>",
    "item environments-58": "<64 hex digits>",
    "item environments-59": "<64 hex digits>"
  }
}
```

#### guards-16

When `spex approve <guard>` runs, the CLI shall load the one guard named [[guards-18](#guards-18)], print what a person is approving, and write its approval record [[guards-15](#guards-15)], running no check and asking no question ([DR-252](../decisions/252-a-guard-is-kept-beside-the-code.md)):

1. print `<guard> — protects <behavior item>` and, under it, the assertion item's statement [[guards-2](#guards-2)];
2. print each example: `<example item> — <kind>`, its item's statement, and its stored sequence with one line for each step, as the report writes a step [[guards-26](#guards-26)];
3. print how the inputs stand against the last record [[guards-19](#guards-19)], as the table below says;
4. write the record and print `Approved <guard> — commit guards/<guard>/approval.json.`

| The last record | Printed |
| --- | --- |
| there is none | `First approval.` |
| holds the same labels and digests | `Nothing changed since the last approval.` |
| differs | `Since the last approval:` and, under it, the labels that differ as `changed: …`, `added: …` and `gone: …` |
| cannot be read as written | `The last record cannot be read — <path>: <cause>.`, step 4 then replacing it |

- a guard that cannot be checked [[guards-18](#guards-18)] fails the command, which writes nothing [[guards-27](#guards-27)].

### What `spex verify` checks

#### guards-17

When `spex verify [<guard>…]` runs, the CLI shall check every guard in name order, or the guards named in the order given, each by these steps in order, calling no model ([DR-243](../decisions/243-guards-protect-critical-behavior-on-every-change.md), [DR-252](../decisions/252-a-guard-is-kept-beside-the-code.md)):

| Step | What it does |
| --- | --- |
| 1 | load the guard's files and items [[guards-18](#guards-18)] |
| 2 | compare its inputs with the approval record [[guards-19](#guards-19)] |
| 3 | check every example against every reading, without the code [[guards-20](#guards-20)] |
| 4 | run each permitted example on a copy of the project's code [[guards-21](#guards-21)] |
| 5 | run the sampled check on that copy [[guards-22](#guards-22)] |
| 6 | run the same sampled check, at the same bounds, on a copy with each kept fault [[guards-24](#guards-24)] |

- a guard whose step 1 finds an error gets no later step;
- steps 3 to 6 run whatever steps 2 and 3 found;
- with no `guards/` folder, or no guard in it, the command prints `No guards under guards/.` and exits `0`.

#### guards-18

When a guard's files, items or expressions hold an error, the CLI shall find that the guard cannot be checked, `spex verify` printing `Cannot be checked — <file or item>: <cause>` and running nothing else for it, and `spex approve` failing with that cause [[guards-16](#guards-16)]:

| Error | Where it is defined |
| --- | --- |
| a folder with no `guard.yaml`, as `guards/<name>/guard.yaml: not found`, a name that is not allowed, or an entry a guard's folder may not hold | [[guards-1](#guards-1)] |
| a binding's folder with no `binding.yaml` or no `binding.mjs` | [[guards-1](#guards-1)] |
| a file that cannot be read as this package writes it | [[guards-3](#guards-3)] [[guards-6](#guards-6)] [[guards-10](#guards-10)] |
| a path of a binding's `files` that may not be listed, as one under `guards/` may not | [[guards-3](#guards-3)] |
| an item missing or out of place | [[guards-2](#guards-2)] |
| a value that is not of its type | [[guards-4](#guards-4)] |
| a type error | [[guards-9](#guards-9)] |
| a kept fault's patch that is no unified diff of the kind allowed, or that names a path not among the binding's `files` | [[guards-11](#guards-11)] |

- a file cannot be read as written where it is not YAML, holds another `format`, or holds a key this package does not name, the error naming the file and the key;
- a guard with no reading, with no permitted example or with no forbidden example cannot be checked;
- such a guard does not pass [[guards-25](#guards-25)].

#### guards-19

When `spex verify` compares a guard's inputs [[guards-14](#guards-14)] with its approval record [[guards-15](#guards-15)], it shall find the guard approved only where both hold the same labels with the same digests, and otherwise name what differs ([DR-252](../decisions/252-a-guard-is-kept-beside-the-code.md)):

| Named as | When |
| --- | --- |
| `changed` | a label is in both, with another digest |
| `added` | a label is among the inputs and not in the record |
| `gone` | a label is in the record and not among the inputs |
| `no approval record` | there is no record at all |
| `<path>: <cause>` | the record cannot be read as [[guards-15](#guards-15)] writes it: it is not JSON, holds another `format`, a key too many, a label that is no input's, or a value that is no digest |

#### guards-20

When `spex verify` checks a guard's examples against its readings, it shall walk each example under each reading from that reading's start state, judging each step with the effect the example states [[guards-7](#guards-7)] and running no code, and list as a failure each example and reading that are not as stated:

| Example | As stated when |
| --- | --- |
| permitted | every step is legal and no step is forbidden |
| forbidden | every step is legal, no step before the last is forbidden, and the last step is forbidden |

| Failure | Said as |
| --- | --- |
| a step that is not legal, which ends the walk | `step <n> is not legal` |
| a permitted example's step that is forbidden | `step <n> is forbidden` |
| a forbidden example's step before the last that is forbidden | `step <n> is forbidden before the last step` |
| a forbidden example's last step that is not forbidden | `the last step is not forbidden` |
| a reading error, which ends the walk | `step <n>: <cause>` |
| no permitted example that shows the protected behavior | `no permitted example has a step at which the assertion applies under every reading` |

- a forbidden step that is not the example's last is listed and the walk goes on from its next state;
- a permitted example shows the protected behavior happening where, under every reading, the assertion applies at one of its steps;
- a guard with no such example has that as a failure.

#### guards-21

When `spex verify` runs a guard's permitted examples on the copy of the project's code, it shall cause each example's steps in order through the module — `start`, each event with its stated params, `stop` [[guards-5](#guards-5)] — have every reading judge each observed effect, its state following what was observed [[guards-7](#guards-7)], and find:

| Found | When |
| --- | --- |
| a violation | every reading forbids a step |
| an undecided step | the readings differ on whether a step is legal, applies or is forbidden |
| a disagreement | an observed effect differs from a field the example states, named with the example, the step, the field and both values |
| a disagreement | an example that showed the protected behavior against the readings [[guards-20](#guards-20)] has, on the code, no step at which the assertion applies under every reading |

- a violation ends its example at that step and ends the checks of that copy, without the sampled check [[guards-22](#guards-22)];
- a failing binding [[guards-36](#guards-36)] or a reading error [[guards-7](#guards-7)] ends the checks of that copy.

#### guards-22

When `spex verify` runs the sampled check on a copy, it shall have fast-check generate `sample.sequences` sequences from `sample.seed`, each of at most `sample.events` events [[guards-10](#guards-10)], run each from a fresh `start` through the module, and have every reading judge each step it causes ([DR-244](../decisions/244-a-guard-is-checked-on-the-implementation.md), [DR-252](../decisions/252-a-guard-is-kept-beside-the-code.md)):

- a sequence is the first steps of one permitted example, any number of them from none to all, with their events and params, then generated events, each drawn evenly from the declared events with each param drawn from its type, the whole cut to `sample.events` events;
- a drawn set of whole numbers has at most 32 members;
- the seed, the guard's files and the versions of fast-check and Spex alone decide the sequences;
- an event every reading finds legal is caused, and one every reading finds not legal is skipped;
- an event the readings differ on is not caused and is noted as an **undecided event**, and the sequence goes on without it;
- after a caused event the effect is read by its type [[guards-4](#guards-4)], and every reading judges the step and, unless the step is a violation, moves its state, after the sequence's last event too [[guards-7](#guards-7)];
- a step every reading forbids is a **violation**, which ends the sequence there and alone fails it, and fast-check shrinks the failing sequence, which is then run once more to observe its effects;
- a step on which the readings differ whether the assertion applies or the effect is forbidden is noted as an **undecided step**, and the sequence goes on;
- `stop` is called after every sequence [[guards-5](#guards-5)];
- a failing binding [[guards-36](#guards-36)] or a reading error [[guards-7](#guards-7)] ends the check;
- a check without a violation counts the sequences run, the sequences in which the assertion applied at some step under every reading, and for each event how often it was caused and how often skipped.

#### guards-23

When the checks on the project's code end [[guards-21](#guards-21)] [[guards-22](#guards-22)], `spex verify` shall give the guard one result, the first of these that it found ([DR-243](../decisions/243-guards-protect-critical-behavior-on-every-change.md), [DR-252](../decisions/252-a-guard-is-kept-beside-the-code.md)):

| Result | Found |
| --- | --- |
| `Violated on the implementation` | a violation, in a permitted example or in the sampled check |
| `Disagreement with the model` | a disagreement in a permitted example |
| `Inconclusive` | a failure of the examples against the readings [[guards-20](#guards-20)], an undecided event or step, a failing binding [[guards-36](#guards-36)], a reading error [[guards-7](#guards-7)], a project file loaded from outside the copy [[guards-13](#guards-13)], a timeout [[guards-12](#guards-12)], or no sequence in which the assertion applied |
| `Sampled on the implementation` | none of these, with every sequence run |

#### guards-24

When `spex verify` checks a kept fault, it shall run the sampled check alone [[guards-22](#guards-22)], at the guard's bounds, on a copy of its own with the fault's patch applied [[guards-12](#guards-12)], and find the fault **caught** only where that check finds a violation, and otherwise not caught for the first of these reasons that holds ([DR-252](../decisions/252-a-guard-is-kept-beside-the-code.md)):

| Reason, as printed | When |
| --- | --- |
| `the patch does not apply: <cause>` | as [[guards-11](#guards-11)] says |
| `the patch changes nothing` | as [[guards-11](#guards-11)] says |
| `the binding failed: <cause>` | a failing binding [[guards-36](#guards-36)] |
| `a timeout: not done after <n> seconds` | a command or the process was stopped at the time limit |
| `a reading error: <cause>` | a reading error ended the check [[guards-7](#guards-7)] |
| `a project file was loaded from outside the copy: <file>` | as [[guards-13](#guards-13)] says |
| `the readings disagreed` | an undecided event or step, and no violation |
| `no violation in <n> sequences` | every sequence ran and none was a violation |

#### guards-25

When `spex verify` has checked a guard, it shall find that the guard passes only where all of these hold ([DR-252](../decisions/252-a-guard-is-kept-beside-the-code.md)):

- its inputs are approved [[guards-19](#guards-19)];
- its examples have no failure against its readings [[guards-20](#guards-20)], so it has a forbidden example and a permitted one that shows the protected behavior happening;
- the result on the project's code is `Sampled on the implementation` [[guards-23](#guards-23)];
- it has at least one kept fault, and every kept fault is caught [[guards-24](#guards-24)].

### What `spex verify` reports

#### guards-26

When `spex verify` has checked its guards, it shall print on standard output the heading `Protect critical behavior on every change`, a block for each guard with a blank line before it, and the count of guards that pass, never the words "verified", "valid" or "proved", as in this run of one guard ([DR-243](../decisions/243-guards-protect-critical-behavior-on-every-change.md)):

```text
Protect critical behavior on every change

environments-55 — protects environments-41
  <the assertion item's statement>
  Approval: approved
  Examples against the readings: 4 examples, 1 reading, all as stated
  On the code: Sampled on the implementation
    200 sequences, 98 in which the assertion applied
    install: caused 1297, skipped 0
    fast-check 4.11.0, Spex 5.0.0, Node 22.23.5
    revision b9de95c with changes, copied files sha256 3f2a9c04be17
    bounds: 200 sequences, at most 12 events, seed 1, 300 seconds
    legal when — a: install: true
  Kept fault first-by-org: caught at sequence 3
    1. install selected={zeta/kit} providing={acme/kit, zeta/kit} -> placed=zeta/kit blocked={}
    2. install selected={acme/kit, zeta/kit} providing={acme/kit, zeta/kit} -> placed=acme/kit blocked={zeta/kit}
       forbidden by every reading
  Passes

1 of 1 guards pass.
```

| Line | Rule |
| --- | --- |
| the block's first | the guard's name and the behavior item it protects |
| the statement | the assertion item's statement [[guards-2](#guards-2)], wrapped at 100 columns and indented two spaces |
| `Approval:` | `approved`; else `not approved — ` followed by `no approval record`, by `<path>: <cause>` for a record that cannot be read, or by the groups `changed: …`, `added: …` and `gone: …` that have a label, groups joined by `; ` and a group's labels by `, ` [[guards-19](#guards-19)]; where it is not approved the next line is `run spex approve <guard> after reviewing` |
| `Examples against the readings:` | how many examples and readings, then `all as stated`, or `<k> not as stated` and under it one line for each failure [[guards-20](#guards-20)], `<example item>, reading <name>: <failure>`, which names the reading once; the failure of no permitted example showing the behavior is printed alone, without an example or a reading |
| `On the code:` | the result [[guards-23](#guards-23)] |
| the counts | on `Sampled on the implementation`, the sequences run, those in which the assertion applied, and each event's times caused and skipped [[guards-22](#guards-22)] |
| the versions | fast-check, Spex and Node |
| `revision` | the short Git commit of the root, with `with changes` where Git reports a change in the copied files, or `no Git revision` where there is no Git or no repository, then the first 12 hex digits of the copied files' digest [[guards-12](#guards-12)], or `no files copied` in the digest's place where the copy could not be made |
| `bounds:` | the four bounds of the guard file [[guards-10](#guards-10)] |
| `legal when` | for each reading, each event's `legal` expression [[guards-6](#guards-6)] as `<event>: <expression>`, joined by `; ` |
| `Kept fault <name>:` | `caught at sequence <n>` with the shrunk sequence, or `not caught — ` and its reason [[guards-24](#guards-24)] |
| the last of a block | `Passes`, or `Does not pass — ` and every reason that holds, joined by `; `, of `not approved`, `examples do not agree with the readings`, `the check on the code is <result>`, `no kept fault` and `kept fault <name> not caught` [[guards-25](#guards-25)] |
| the last of the run | `<n> of <m> guards pass.` |

| Result | Printed under `On the code:` |
| --- | --- |
| `Violated on the implementation` | `found in example <item>`, or `found at sequence <n> with seed <seed>, shrunk <k> times` with the number of the first failing sequence, then the sequence step by step, and `forbidden by every reading` under its last step |
| `Disagreement with the model` | `example <item>, step <n>, field <field>: stated <value>, observed <value>`, or `example <item> shows the protected behavior against the readings and not on the code` [[guards-21](#guards-21)] |
| `Inconclusive` | one line for each finding: `the examples do not agree with the readings`, `a failing binding: <cause>`, `a reading error: <cause>`, `a project file loaded from outside the copy: <file>`, `a timeout: not done after <n> seconds`, `no sequence in which the assertion applied`, or an undecided event or step |

- a step is written as its number, its event, each param as `<param>=<value>`, then `->` and each observed effect field as `<field>=<value>`;
- readings and kept faults are listed in name order, and examples in the guard file's order;
- a set is written as `{a, b}` in declared order, a map as `{ann: 1, bob: 0}` and the missing value as `none`;
- an undecided event or step prints where it was found, in an example or at a sequence, and what the readings differ on, then the sequence up to it, an event that was not caused marked `(not caused)`, and each reading's finding, as `legal — a: no, b: yes`;
- after a count of one, `example`, `reading`, `time` and a timeout's `second` are written in the singular;
- a guard that cannot be checked has its name and the `Cannot be checked` line [[guards-18](#guards-18)] alone.

#### guards-27

When `spex verify` or `spex approve` ends, the CLI shall exit with the status of its case, its reports on standard output and a refusal's cause on standard error:

| Case | Status | Printed |
| --- | --- | --- |
| `spex verify`: every guard it checked passes, or there is none [[guards-17](#guards-17)] | `0` | the report [[guards-26](#guards-26)] |
| `spex verify`: a guard does not pass [[guards-25](#guards-25)] or cannot be checked [[guards-18](#guards-18)] | `1` | the report |
| `spex approve`: the record written [[guards-16](#guards-16)] | `0` | what was approved |
| `spex approve`: a guard that cannot be checked | `1` | the cause, nothing being written |
| a name that is no guard under `guards/` | `1` | the cause naming it, nothing being checked or written |
| an option, or `spex approve` with no guard or with several | `1` | the cause and the command's usage line, `Usage: spex verify [<guard>…]` or `Usage: spex approve <guard>` |
| `spex verify` on a Node older than 22.15, which it needs to see what a copy's process loads [[guards-13](#guards-13)] | `1` | that it needs Node 22.15 or newer |
| `spex verify` interrupted, by the signal SIGINT | `130` | nothing more |
| `spex verify` hung up, by SIGHUP, quit, by SIGQUIT, or asked to end, by SIGTERM | `129`, `131`, `143` | nothing more |

- before it exits on any of the four signals, `spex verify` stops every process of its copies and removes every copy [[guards-12](#guards-12)].

#### guards-28

While `spex verify` runs, the CLI shall write nothing in the project — no result, no copy and no record — keeping each copy under the OS temp folder until its checks end [[guards-12](#guards-12)], so that the approval record `spex approve` writes [[guards-16](#guards-16)] is the one file either command leaves and an earlier run decides nothing in a later one ([DR-252](../decisions/252-a-guard-is-kept-beside-the-code.md)).

## Verification

#### guards-29

When the built CLI runs `spex verify` in a fixture project the suite writes to a temp folder — a small entitlement module of plain `.mjs` files with `grant`, `revoke` and `use`, its items in a package file under `specs/packages/`, and an approved guard on it with a binding, readings, a permitted and a forbidden example and a kept fault — the integration suite shall assert:

- the command exits `0` and prints the heading, the guard's block and `1 of 1 guards pass.` [[guards-27](#guards-27)] [[guards-26](#guards-26)];
- the block's first line names the guard by its folder and the behavior item its assertion cites, and its second is that assertion item's statement, read from the files where a guard is kept [[guards-1](#guards-1)] [[guards-2](#guards-2)];
- the statement is printed with each link as its text, a citation as `[<id>]` and no address [[guards-2](#guards-2)];
- the block holds `Approval: approved` [[guards-19](#guards-19)], the examples line with the counts of the guard file's examples and of the readings and `all as stated` [[guards-10](#guards-10)] [[guards-20](#guards-20)], `On the code: Sampled on the implementation` [[guards-23](#guards-23)] with its counts, versions, revision, digest, bounds and each reading's `legal` expression for each event [[guards-6](#guards-6)], the kept fault caught, and `Passes` [[guards-25](#guards-25)];
- the permitted examples run on the code with nothing found [[guards-21](#guards-21)];
- the counts show sequences in which the assertion applied, each declared event caused, and an event the readings find not legal skipped, with params and effects of each declared type passing through the module [[guards-3](#guards-3)] [[guards-4](#guards-4)] [[guards-5](#guards-5)] [[guards-7](#guards-7)] [[guards-22](#guards-22)];
- the module importing a dependency installed in the project's `node_modules`, and a second fixture whose binding's `commands` run a small Node script that writes a file the module loads, both pass, the commands and the module running in the copy [[guards-3](#guards-3)] [[guards-12](#guards-12)];
- with two guards, `spex verify` checks both in name order and `spex verify` with both names checks them in the order given, each ending `2 of 2 guards pass.`, and in a project with no `guards/` folder it prints `No guards under guards/.` and exits `0` [[guards-17](#guards-17)];
- in a Git repository the revision line names the short commit, and adds `with changes` once a copied file changes [[guards-26](#guards-26)];
- after every run the project holds the same files with the same bytes as before it [[guards-28](#guards-28)].

#### guards-30

When the built CLI runs `spex approve` and `spex verify` in the fixture project of [[guards-29](#guards-29)] with its approval record removed, the integration suite shall assert:

- `spex verify` prints `Approval: not approved — no approval record`, the line naming `spex approve`, and `Does not pass — not approved`, and exits `1` [[guards-19](#guards-19)] [[guards-26](#guards-26)] [[guards-27](#guards-27)];
- `spex approve <guard>` prints the guard with the behavior item it protects, the assertion item's statement, each example's statement, kind and sequence, `First approval.` and the `Approved` line, exits `0`, runs no check, and writes `approval.json` in its stated form with one digest for each item and file of the guard [[guards-16](#guards-16)] [[guards-15](#guards-15)] [[guards-14](#guards-14)];
- `spex verify` then passes [[guards-25](#guards-25)];
- after an edit to the behavior item, a reading added and a file of the binding's folder removed, `spex verify` names the three under `changed`, `added` and `gone` and exits `1`, `spex approve` names the same three, and `spex verify` after it finds the guard approved [[guards-19](#guards-19)] [[guards-16](#guards-16)];
- an approved guard with one reading deleted and nothing else changed is `Approval: not approved — gone: file <path>` and does not pass [[guards-19](#guards-19)] [[guards-25](#guards-25)];
- an approved guard with one reading added and nothing else changed is `Approval: not approved — added: file <path>` and does not pass [[guards-19](#guards-19)] [[guards-25](#guards-25)];
- with an approval record that cannot be read as written, `spex verify` prints `Approval: not approved — <path>: <cause>` and the guard does not pass, `spex approve` says the last record cannot be read and replaces it, and `spex verify` after it finds the guard approved [[guards-19](#guards-19)] [[guards-16](#guards-16)] [[guards-26](#guards-26)];
- an edit to an item the assertion item cites is named as changed, and an edit to an item none of the guard's items cites is not [[guards-2](#guards-2)] [[guards-14](#guards-14)];
- a guard file rewritten with CRLF line endings stays approved [[guards-14](#guards-14)].

#### guards-31

When the built CLI runs `spex verify` in variants of the fixture project of [[guards-29](#guards-29)], each with one change to its code, its examples or its readings, the integration suite shall assert:

- with a defect in the project's code that the assertion forbids, the command exits `1` and prints `On the code: Violated on the implementation`, the shrunk sequence with each event's params and observed effect, the step every reading forbids, the seed, the failing sequence's number and the shrink count, and `Does not pass — the check on the code is Violated on the implementation` [[guards-22](#guards-22)] [[guards-23](#guards-23)] [[guards-26](#guards-26)] [[guards-27](#guards-27)];
- a second run prints the same report and neither run leaves a file in the project [[guards-28](#guards-28)];
- with a defect whose effect, at the step every reading forbids, would take a reading's next state out of its range, the result is still `Violated on the implementation` with its sequence, and no reading error [[guards-7](#guards-7)] [[guards-23](#guards-23)];
- with a defect that a permitted example meets, the result is `Violated on the implementation`, found in that example [[guards-21](#guards-21)] [[guards-23](#guards-23)];
- with a permitted example stating an effect the code does not produce, the result is `Disagreement with the model`, naming the example, the step, the field and both values [[guards-21](#guards-21)] [[guards-23](#guards-23)];
- with an example that shows the protected behavior against the readings and not on the code, the result is `Disagreement with the model`, naming the example [[guards-21](#guards-21)] [[guards-26](#guards-26)];
- with readings that differ on a step of a permitted example run on the code, the result is `Inconclusive` with the undecided step found in that example [[guards-21](#guards-21)] [[guards-23](#guards-23)];
- with two readings that differ on whether an event is legal, the result is `Inconclusive`, the event is not caused, and the report gives the sequence up to it and each reading's finding [[guards-22](#guards-22)] [[guards-23](#guards-23)] [[guards-26](#guards-26)];
- with two readings that differ on whether an effect is forbidden, the result is `Inconclusive` with the undecided step [[guards-7](#guards-7)] [[guards-22](#guards-22)];
- with bounds under which the assertion applies in no sequence, the result is `Inconclusive`, naming that [[guards-23](#guards-23)];
- with a forbidden example whose last step a reading does not forbid, the examples line lists the failure with its example, reading and step, the result is `Inconclusive`, and the block ends `Does not pass` with `examples do not agree with the readings` among its reasons [[guards-20](#guards-20)] [[guards-23](#guards-23)] [[guards-25](#guards-25)];
- a permitted example a reading forbids, and one with a step a reading finds not legal, are each listed as a failure with its example, reading and step [[guards-20](#guards-20)] [[guards-26](#guards-26)].

#### guards-32

When the built CLI runs `spex verify` in variants of the fixture project of [[guards-29](#guards-29)], each with one change to its kept faults, the integration suite shall assert:

- the fixture's own kept fault prints `caught at sequence <n>` and its shrunk sequence, the last step marked as forbidden by every reading [[guards-24](#guards-24)] [[guards-26](#guards-26)];
- a patch whose hunk states a line that lines added above have moved still applies and is caught, and a patched file with CRLF line endings keeps them [[guards-11](#guards-11)];
- a patch whose context matches nowhere is not caught because it does not apply, and the command exits `1` with `Does not pass — kept fault <name> not caught` [[guards-11](#guards-11)] [[guards-24](#guards-24)] [[guards-25](#guards-25)];
- a patch naming a file under the binding's `files` that was not copied is not caught because it does not apply [[guards-11](#guards-11)] [[guards-24](#guards-24)];
- a patch that leaves every copied file as it was is not caught because it changes nothing [[guards-11](#guards-11)] [[guards-24](#guards-24)];
- a patch whose change the assertion does not forbid is not caught, for no violation in the bound's number of sequences [[guards-24](#guards-24)];
- a patch naming the binding's own module, one naming a path under `node_modules`, and one naming a project file outside the binding's `files`, each make the guard `Cannot be checked`, the cause saying the path is not among the binding's files, and change no file of the project [[guards-11](#guards-11)] [[guards-18](#guards-18)] [[guards-28](#guards-28)];
- two kept faults that are both caught are listed in name order [[guards-26](#guards-26)];
- with two kept faults of which one is caught and one is not, each checked on a copy of its own, the guard does not pass and its last line names the one not caught alone [[guards-12](#guards-12)] [[guards-24](#guards-24)] [[guards-25](#guards-25)];
- with readings that differ on whether an event is legal, the kept fault is `not caught — the readings disagreed` [[guards-24](#guards-24)];
- a guard with no kept fault ends `Does not pass — no kept fault` [[guards-25](#guards-25)];
- the file a patch names has, in the project, the same bytes after the run as before it [[guards-12](#guards-12)] [[guards-28](#guards-28)].

#### guards-33

When the built CLI runs `spex verify` in variants of the fixture project of [[guards-29](#guards-29)], each with one fault in its binding, the integration suite shall assert:

- an event function that throws, an effect with a value out of its type, an effect with a field too many or one missing, and a command that ends non-zero each give `Inconclusive` naming a failing binding and its cause, with exit `1` [[guards-36](#guards-36)] [[guards-4](#guards-4)] [[guards-3](#guards-3)] [[guards-23](#guards-23)];
- a module that does not load, and one that lacks a function for a declared event, each give `Inconclusive` naming a failing binding [[guards-5](#guards-5)] [[guards-36](#guards-36)];
- a module that ends its process before the result gives `Inconclusive` naming a failing binding [[guards-36](#guards-36)] [[guards-23](#guards-23)];
- a command or a copy's process that crashes is named with the last line of its standard error that is no `Node.js v…` line and no stack line [[guards-36](#guards-36)];
- an event that declares no effect and whose function returns nothing is no failing binding [[guards-5](#guards-5)];
- a kept fault whose copy's binding fails is not caught, the binding having failed [[guards-24](#guards-24)];
- a module importing a project file by a path that leads out of the copy gives `Inconclusive` naming that file, and the kept fault is not caught for the same file [[guards-13](#guards-13)] [[guards-23](#guards-23)] [[guards-24](#guards-24)];
- an event that never returns, with `seconds: 1`, gives `Inconclusive` naming a timeout, and the command ends [[guards-12](#guards-12)] [[guards-23](#guards-23)];
- a command that never ends, with `seconds: 1`, gives `Inconclusive` naming a timeout [[guards-12](#guards-12)] [[guards-23](#guards-23)];
- where a command, or the code, leaves a process running that holds its output open, `spex verify` still ends, at the latest at the time limit, and that process is gone when it has ended [[guards-12](#guards-12)].

#### guards-34

When the built CLI runs `spex verify` on fixture guards whose readings are written to try the language and whose files hold one error each, the integration suite shall assert:

- a guard whose examples agree with its reading only if every literal, operator, function and `x in S` form of the language has the grouping and the value the language gives it has its examples `all as stated` [[guards-8](#guards-8)] [[guards-9](#guards-9)] [[guards-20](#guards-20)];
- a reading comparing a set with a whole number, one reading an unknown name, one reading `effect` in a `legal`, and one chaining two comparisons each make the guard `Cannot be checked`, naming the file and the expression [[guards-9](#guards-9)] [[guards-6](#guards-6)] [[guards-18](#guards-18)];
- a key this package does not name in `guard.yaml`, in `binding.yaml` and in a reading, a `format` other than `1`, an unknown type, and a state variable named as a param each make the guard `Cannot be checked`, naming the file [[guards-3](#guards-3)] [[guards-6](#guards-6)] [[guards-10](#guards-10)] [[guards-18](#guards-18)];
- a folder under `guards/` with no `guard.yaml` is `Cannot be checked — guards/<name>/guard.yaml: not found`, and the run exits `1` [[guards-1](#guards-1)] [[guards-18](#guards-18)];
- a guard folder named for no item, an assertion item outside Verification, an assertion item citing two behavior items, and an example item that does not cite the behavior item each make the guard `Cannot be checked`, naming the item [[guards-2](#guards-2)] [[guards-18](#guards-18)];
- a guard with no reading, one with no permitted example, one with no forbidden example, an example with more steps than `sample.events`, a step leaving out a param, a missing bound, and an effect field left out that a reading reads each make the guard `Cannot be checked` [[guards-10](#guards-10)] [[guards-18](#guards-18)];
- a kept fault's patch that is no unified diff, that adds a file, or whose hunk has more lines than its header says makes the guard `Cannot be checked`, naming the patch and, unless it holds no change at all, the line [[guards-11](#guards-11)] [[guards-18](#guards-18)];
- a binding whose `files` names its own folder, or `guards`, makes the guard `Cannot be checked`, naming the binding's declaration and the entry [[guards-3](#guards-3)] [[guards-18](#guards-18)];
- an entry a guard's folder may not hold, and a guard folder whose name is not allowed, each make the guard `Cannot be checked` [[guards-1](#guards-1)] [[guards-18](#guards-18)];
- a `then` giving a value outside its variable's type gives `Inconclusive` naming a reading error, and where an example meets it the examples line lists it, naming the reading once [[guards-7](#guards-7)] [[guards-20](#guards-20)] [[guards-23](#guards-23)] [[guards-26](#guards-26)];
- a guard that cannot be checked has no line after `Cannot be checked`, the other guard of the same run is checked and passes, and the run ends `1 of 2 guards pass.` with exit `1` [[guards-17](#guards-17)] [[guards-18](#guards-18)] [[guards-26](#guards-26)] [[guards-27](#guards-27)].

#### guards-35

When the built CLI is misused or stopped in the fixture project of [[guards-29](#guards-29)], the integration suite shall assert:

- `spex verify` with a name that is no guard exits `1` with the cause naming it on standard error and checks nothing [[guards-27](#guards-27)] [[guards-17](#guards-17)];
- `spex verify` with an option, `spex approve` with no guard and `spex approve` with two each exit `1` with the cause and the command's usage line on standard error [[guards-27](#guards-27)];
- `spex approve` on a guard that cannot be checked exits `1` with the cause and leaves `approval.json` as it was, or absent [[guards-16](#guards-16)] [[guards-27](#guards-27)];
- a Node older than 22.15, which the suite stands in for by taking away the module hooks such a Node lacks, is refused by `spex verify` with exit `1` and the words that it needs Node 22.15 or newer [[guards-27](#guards-27)] [[guards-13](#guards-13)];
- an interrupt during a check exits `130`, a quit `131`, a request to end `143` and a hangup `129`, each leaving no process of its copies running and no copy behind under the OS temp folder [[guards-27](#guards-27)] [[guards-12](#guards-12)].
