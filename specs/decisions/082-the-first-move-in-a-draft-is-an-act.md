<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-082: The First Move in a Draft Is an Act

## Status

Accepted (2026-09-24) on the owner's review of the authoring workspace's empty conversation: "I don't understand what the quick texts mean", and the direction to design it for a fresh reader and verify it.
Amends [DR-058](058-chat-assisted-playbook-authoring.md), which remains accepted, in the workspace's empty conversation alone: the caption stays, the three phrase chips become two acts, and the prompt teaches the agent what a SKILL.md is.
Applies [DR-066](066-every-summons-has-a-door.md) to an offer: a control names the act it performs.
Applies [DR-069](069-key-phrases-not-sentences.md): an opener that repeats the caption and the placeholder goes.

## Context

- The empty conversation showed a caption — what the playbook does, who does what, when it is done — and three chips, "Describe a workflow", "Adapt a SKILL.md", "Show me an example", each placing its own label in the composer without sending.
  DR-058 never mentions them and the spec recorded only that mechanism; nothing recorded what they were for.
- The chips wear the bordered-pill grammar of the Captain home's "Add a project…" and "Try the Academy example", and those act.
  A click here moved four words into the field, and "Enter sends" beneath invited the reader to send them: a bare label reached the agent, the header ticked "working", and the reply was a question back.
- "Describe a workflow" repeated the caption and the placeholder "Describe the playbook…".
- "Adapt a SKILL.md" named the most valuable way in — an Agent Skills file many readers already have — and offered no way to bring the file: the paste mode that takes one lives on the other pane, the prompt never said what a SKILL.md is, so "adapt" had no defined meaning for the agent, and a sandboxing adapter reads nothing outside the draft directory.
- "Show me an example" routed a question with a fixed answer — slc's six-line demo, which the Library already shows and the prompt already quotes — through a model call that takes time, costs tokens, and, under the working rule to write a first draft at once, may write the demo into the source file.

## Decision

- The empty conversation keeps its caption and offers two openers, each an act whose outcome its label names, neither sending anything:
  - "Use a SKILL.md…" brings a file in and readies the ask.
    Where the shell offers a file pick, the pick runs first and a canceled pick changes nothing; a draft with no source takes the picked file as its source at once and the Source tab shows it, while a draft that already has one opens the Source tab's paste mode with the path placed, so "Use as source" is the overwrite's confirmation.
    Without a pick, the paste mode opens with its text field focused.
    In every case the composer then holds "Adapt this file into a playbook: keep what it does, name who does what, and say when it is done", and one Enter sends it.
  - "Try the example" places slc's six-line demo prose in the composer: the demo is the shape of a good first message, and sending it shows the whole loop — the agent writes the source, asks for the compile, proposes the registration.
  - "Describe a workflow" goes: the focused empty composer under the caption is that affordance.
- The prompt's preamble teaches the agent that a source the Boss placed may be a SKILL.md — YAML frontmatter `name` and `description`, then instructions — or other workflow markdown, to be rewritten in place into a source: the description becomes the title and the registration intent, the instructions the prompts, the actors the roles.
- A write the core refuses — a compile running, an unreadable file — reports in the strip above the composer, as any refused draft command does; the opener is never withheld on a prediction.

Considered and declined:

- Chips that send a complete message on click: a model call the reader did not compose, and no complete message exists without the reader's content.
- The example as an agent turn: a fixed answer through a paid, slow, nondeterministic channel, with the source file at risk.
- The example as a client-rendered bubble in the thread: a transcript entry no record backs, gone at the first message.
- Handing the picked path to the agent to read: a read outside the draft directory is not every adapter's to make, and the source file is the contract DR-058 drew.

## Consequences

- `playbook-library-84` names the two openers and their acts, `playbook-library-65` adds the SKILL.md line to the preamble, and `playbook-library-77` walks both openers in the browser.
- Three catalog entries retire and five arrive in both languages: two labels, the ask, two tooltips.
- A SKILL.md brought in is the draft's source verbatim until the agent rewrites it, so the Source tab may show a skill rather than a playbook for a turn; the state chip reads as for any source.
