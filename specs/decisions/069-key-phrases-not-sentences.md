<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-069: Key Phrases, Not Sentences

## Status

Accepted (2026-09-16) on the owner's review of the interface's copy: "I really don't like lengthy text here and there — if you put some key phrases at the right place, it is much easier to understand and saves the reader's burden."

Amends [DR-010](010-interface-craft.md) with a tenth principle.
Amends [DR-068](068-an-agents-settings-where-the-agent-is.md) in its §"One agent's control opens one agent's settings" alone: the editor's two sentences become one phrase.

## Context

- A walk through every surface found the same habit in five places: a sentence explaining what a control already shows, a sentence explaining what a surface does not offer, and a fact repeated in prose beside the control that carries it.
  The session start told the reader three times on one screen to type `/`; the Space setup card wrapped one field and one button in five sentences; Settings explained each section under its heading; the per-conversation agent editor and the Library's binding editor each closed with two paragraphs about scope and about what lives elsewhere.
- [DR-010](010-interface-craft.md) governs status words, guardrails and labels, and [DR-041](041-chrome-that-fits.md) bounds a control's label, but nothing bounds the prose around a control.
- The facts in those sentences are mostly required — [[space-3](../packages/space.md#space-3)] names what the setup guidance must say — so the question is form, not content.

## Decision

### §10 Key phrases, not sentences

- A surface explains nothing its controls already show: a heading is a name, an option label carries its own meaning ("from Settings (claude-opus-5)"), and a mark or a value stands where a sentence about it stood.
- A scope or a boundary is a phrase at the place it applies — a subtitle, a caption, an option label — never a paragraph after the fields.
- What a surface does not offer is not explained on it; the reader finds every other setting where the product keeps it.
- A fact the reader needs only sometimes lives in a title or at the moment it matters — a refusal at Save, not a warning above the fields.
- A required fact keeps its place but takes the shortest form that still states it: a label and a value, a phrase, a list in one caption.

### The cuts made now

- The session start's greeting keeps its one sentence; the tip beneath it goes, the composer's caption already reading "/ for playbooks · Enter sends".
- The per-conversation agent editor reads the agent's name with "This conversation only" as its subtitle; the sentence about Settings not changing and the sentence about adapter, instruction and permissions go, and a role the agent's bindings tune of their own accord is named in one phrase.
- The Library's binding editor keeps "Also answers ⟨roles⟩" and drops both the clause after it and the closing sentence about Settings.
- Settings shows the config path alone under its title, with the sharing explained in the path's tooltip, and no section carries a sentence under its heading.
- The Space setup card reads a title, the field, the control with one caption naming what an empty and an occupied remote each mean, and one caption naming what syncs, what stays, and that nothing is contacted before setup.

## Consequences

- [DR-010](010-interface-craft.md)'s review list gains this principle: new copy beside a control is held to it.
- `run-view-138` is amended to the phrase form; the other cuts change no spec item, because no item pinned the sentences' form.
- Tests that quoted a cut sentence now quote the phrase that replaced it.
