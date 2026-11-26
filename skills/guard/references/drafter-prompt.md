<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Drafter prompts

The lead sends every Drafter the same first prompt, in one turn.
Text in angle brackets is filled in by the lead.

## Contents

- [What the lead fills in](#what-the-lead-fills-in)
- [Draft a reading](#draft-a-reading)
- [Correct a reading's form](#correct-a-readings-form)

## What the lead fills in

| Placeholder | Holds |
| --- | --- |
| `<behavior-item>` | The behavior item's whole text, from its heading |
| `<assertion-item>` | The assertion item's whole text, from its heading |
| `<example-items>` | Every example item's whole text, from its heading |
| `<cited-items>` | The whole text of every other item those items cite, or `none` |
| `<declaration>` | The `values` and `events` of `binding.yaml` with their comments, and nothing else of that file |
| `<format>` | The sections *Types and values*, *A reading* and *The expression language* of [formats.md](formats.md), word for word |
| `<reading>` | The Drafter's reading as it was saved |
| `<cause>` | The cause `spex verify` printed after `Cannot be checked` |

Give a Drafter nothing else: no code, no path into the code, no guard file, no other reading, and no word of what you expect.

## Draft a reading

Quote first:

> Behavior item: <behavior-item>
> Assertion: <assertion-item>
> Examples: <example-items>
> Items they cite: <cited-items>
> Declaration: <declaration>
> Format: <format>

Then the instruction:

```markdown
Draft one reading of the assertion quoted above, as one YAML document in the format quoted.

Work from the quoted items and the declaration alone.
Do not read the project's code, its tests, its history or any file under guards/, and do not look for another reading.
Take what must hold from the items' words, not from how you expect software to behave.
Where the items leave a case open, choose what you find most faithful to their words and go on; do not ask.

The reading says:
- the state it must remember, and no more than the assertion needs;
- for each event, when it is legal and how the state changes;
- as rules, when the assertion applies and what must then hold of the observed effect.

Give an event a legal condition only where the items say when it can happen.
State the assertion alone: add no rule for other behavior, even where the items imply one.
Use only the declared values, events, params and effect fields, and only the forms of the expression language.

Reply with the YAML document in one fenced block.
After it, list in plain words each case the items left open and what you chose.
```

The lead saves the fenced document unchanged, under any header comment lines the project requires, and keeps the list for Step 3.

## Correct a reading's form

Sent to the Drafter of a reading that `spex verify` cannot read.
Continue the same Drafter where the host allows it; otherwise send a fresh one the first prompt with these two quotes added.

> Your reading: <reading>
> Cause: <cause>

```markdown
The reading quoted above cannot be read, for the cause quoted.
Correct its form so that it says what you meant, and change nothing else.
Do not read the project's code or another reading.
Reply with the whole YAML document in one fenced block.
```
