<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Drafter prompts

The lead sends every Drafter the same first prompt, in one turn, with a name of its own in it.
Text in angle brackets is filled in by the lead.

## Contents

- [What the lead fills in](#what-the-lead-fills-in)
- [Draft a translation](#draft-a-translation)
- [Correct a translation's form](#correct-a-translations-form)

## What the lead fills in

| Placeholder | Holds |
| --- | --- |
| `<name>` | The translation's name, which is its file's and the one its opening line, `---- MODULE <name> ----`, gives: `a`, `b`, `c` and so on, another for each Drafter |
| `<rule-item>` | The rule's whole text, from its heading |
| `<guard-item>` | The guard item's whole text, from its heading, with every case |
| `<cited-items>` | The whole text of every other item those two cite, or `none` |
| `<declaration>` | The `values` and `events` of `binding.yaml` with their comments, and nothing else of that file |
| `<declaration-in-tla>` | The declaration in TLA+: the whole file `Declaration.tla` that `spex verify --keep` left, as [formats.md](formats.md) says |
| `<format>` | The section *A translation* of [formats.md](formats.md), word for word |
| `<translation>` | The Drafter's translation as it was saved |
| `<cause>` | Every `Cannot be checked` line `spex verify` printed that names this translation, each with the lines printed under it |

Give a Drafter nothing else: no code, no path into the code, no guard file, no other translation, and no word of what you expect.
A Drafter is an independent agent: it drafts from the items, the declaration and the declaration in TLA+ alone.

## Draft a translation

Quote first:

> Rule: <rule-item>
> Guard item, with its cases: <guard-item>
> Items they cite: <cited-items>
> Declaration: <declaration>
> Declaration in TLA+: <declaration-in-tla>
> Format: <format>

Then the instruction:

```markdown
Draft one translation of the items quoted above: one TLA+ file in the format quoted, opened by the line `---- MODULE <name> ----`.
A translation is the items written in TLA+: the rule, clause by clause, and the model, which is what the items say each event gives.

Work from the quoted items, the declaration and the declaration in TLA+ alone.
Do not read the project's code, its tests, its history or any file under guards/, and do not look for another translation.
Take what must hold, and what each event gives, from the items' words, not from how you expect software to behave.
The cases show what the items' author means: your translation must allow each permitted case and forbid each forbidden case.
Where the items leave something open, choose what you find most faithful to their words and go on; do not ask.

Define the seven operators, under these names and with these parameters:
- `Start`, `Legal(s, e)`, `Effect(s, e)` and `After(s, e)`, the model: its starting state, when the event `e` can happen in the state `s` at all, the one effect the items require it to give there, and the state after it;
- `When(e)`, `While(s, e)` and `Shall(s, e, f)`, the rule, clause by clause as its item reads: its trigger, its conditions in the state before the event, and whether the effect `f` is what it requires.

Let the model say only what the quoted items say.
Say that an event is not legal only where it cannot happen in that state at all; what the rule forbids belongs in `Shall`, never in `Legal`.
Write `Shall` to judge every declared effect of the event, not only the one your model gives.
Keep in the state only what the items make a later event depend on, so that the model reaches finitely many states.
Put the ID of the item a branch translates in a TLA+ comment above it.
Use only the declared values, events, params and effect fields, under the names the declaration in TLA+ gives them.
Never write `CHOOSE`: choose among declared values with the declaration's `First` and `Rank` operators.
Never write a prime, `ENABLED` or `UNCHANGED`: a translation speaks of the state it is given, never of the next.
Extend `Declaration` and, where you need them, `Naturals`, `Integers`, `FiniteSets` and `Sequences`, and nothing else.

Reply with the whole TLA+ file in one fenced block.
After it, list in plain words each point the items left open and what you chose.
```

The lead saves the fenced file unchanged as `<name>.tla`, with any header comment lines the project requires under its first line.
The points a Drafter lists are for the lead to read: where two Drafters chose differently, `spex verify` will print a sequence that tells their translations apart.

## Correct a translation's form

Sent to the Drafter of a translation that `spex verify` cannot check.
Continue the same Drafter where the host allows it; otherwise send a fresh one the first prompt with these two quotes added.

> Your translation, saved as <name>.tla: <translation>
> Cause: <cause>

```markdown
The translation quoted above cannot be checked, for the cause quoted.
A place in the cause is a line and a column of the file as it was saved; a sequence under it is the events after which the cause was met.
Correct the file's form so that it says what you meant, and change nothing else.
Work from the cause alone: do not read the project's code or another translation.
Reply with the whole TLA+ file in one fenced block.
```

The lead gives the Drafter no reading of the cause and no suggestion of its own.
