<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Coder prompts

The Captain sends one prompt per phase: the phase prompt, then the every-phase instruction.
Text in angle brackets is filled in by the Captain.

## Contents

- [First phase](#first-phase)
- [Later IR-task phase](#later-ir-task-phase)
- [Every phase](#every-phase)

## First phase

Quote first:

> Original request: <caller-input>
> Run results: <run-results>

Then the instruction:

```markdown
First determine whether the request starts a new change intent or continues an existing IR with unfinished work.
If the request may continue an existing IR but does not identify it unambiguously, ask the user before changing files.

Treat standalone documentation or status maintenance that does not implement an identified unfinished IR task as a new change intent, even when it refers to an IR with no unfinished task.
Do not invent or reopen an IR task, claim unperformed work complete, or infer an owner decision not supplied by the caller.

For a new change intent, assess whether it can be completed well in one commit.
If it can, implement and test it, update the affected specs, and ensure specs/map.md remains accurate.
If it cannot, decompose it into tasks sized to exactly one commit each, add a new IR under specs/intents, and do not implement any IR task in this phase.
Plan affected spec updates before, with, or after their corresponding code changes, either as standalone IR tasks or as explicit work within related tasks.

For an existing IR with unfinished work, read the identified IR and implement exactly its next unfinished task, including corresponding tests or specs if any.
Do not implement a later task in this phase.
Mark the IR's progress and deliverables when relevant.
After implementing an IR task, identify it and state whether any IR task still has unfinished Coder work; if so identify the next unfinished task, otherwise state this was the final IR task's Coder work.
Report pending independent review, owner acceptance and later delivery steps separately; they imply an unfinished IR task only when the IR assigns that work to a remaining task.
Report only what the IR and completed work establish, in ordinary prose without a required marker.
If the IR will be finished after this phase, double-check that all acceptance criteria are met.

Consult specs/map.md for relevant context and specs/meta.md for spec requirements, if needed.
```

## Later IR-task phase

Quote first:

> Original request: <caller-input>
> IR number: <ir-number>
> Run results: <run-results>

Then the instruction:

```markdown
Read the identified IR and implement exactly its next unfinished task, including corresponding tests or specs if any.
Do not implement a later task in this phase.
Mark the IR's progress and deliverables when relevant.
After implementing an IR task, identify it and state whether any IR task still has unfinished Coder work; if so identify the next unfinished task, otherwise state this was the final IR task's Coder work.
Report pending independent review, owner acceptance and later delivery steps separately; they imply an unfinished IR task only when the IR assigns that work to a remaining task.
Report only what the IR and completed work establish, in ordinary prose without a required marker.
If the IR will be finished after this phase, double-check that all acceptance criteria are met.
The earlier phases of this intent await the one review that follows its final task; do not ask the user to review or approve them.
```

## Every phase

Append to every phase prompt:

```markdown
Keep to the original intent and follow what it asks.
Do not re-run tests or builds whose inputs have not changed since any previous reported run.
If a required answer from the user prevents completion of the current phase or IR task, ask that question and return without committing.
Preserve permitted uncommitted work for the deferred continuation; do not create a partial or blocker-only commit to meet the one-commit requirement.
After the answer allows completion, make exactly one phase-owned commit.
When the phase is complete, make its minimal changes and then one new commit, following specs/packages/git.md; never amend an existing commit.
Make the commit message explain concisely what changed and why, including relevant verification.
Identify every new commit you make.
Credit every AI that contributed to this commit: Coder <coder-model>.
```
