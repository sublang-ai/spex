<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-248: The Atlas Shows Dependencies and Real Conflicts

## Status

Accepted (2026-11-22).
Amends [DR-242](242-skills-shipped-from-the-repository-and-an-atlas-of-them.md) in the links the page shows, the exported page, what a shared name reports, the insights' levels and the page's controls.
Amends [DR-245](245-skills-and-the-atlas-in-the-readers-language.md) in the page's settings and their labels, retiring the setting for mentions, and in the control choosing the page's language.

## Context

- The exported page let a reader edit workflows and download them as a file ([DR-242](242-skills-shipped-from-the-repository-and-an-atlas-of-them.md)).
  Nobody edits an exported copy: its reader has neither the skills nor the state folder, so an edit there reaches no one.
- The page drew two kinds of link, a call and a mention, a skill named without being run.
  A mention answers an author's proofreading question, not a reader's question of what depends on what, and it cost a control, a style and a concept.
  The scan still needs the distinction: "do not use `/lint`" is no call.
- Every pair of differing skills of one name was reported as a problem.
  A differing copy is a problem only where it was not intended, and the folders tell which it is:
  - an agent loading both from places it ranks alike may load either, a conflict;
  - an agent ranking one place first loads that one, an override such as a project's own version of a skill;
  - an agent loading only one sees no other, as where two agents each keep a copy that may have drifted apart.
- Agents rank places differently.
  Claude Code prefers the home folder's skill to a project's and the repository root's to a nearer folder's, keeping the nearer one under another name, and names a plugin's skills by their plugin [[1]].
  Codex offers both skills of a name and ranks neither [[2]].
  Gemini CLI prefers a workspace's skill to the user's and, in one of them, the shared `.agents` folder's to its own [[3]].
  OpenCode prefers its own folders to the shared `.agents` and that to Claude Code's, a project's over the home folder's in each [[4]].
  Kimi Code prefers a project's skill to the user's and, in each, its own, Claude Code's and Codex's folders to the shared ones [[7]].
  Roo Code prefers a project's skill to the global one and, in each, its own folder's to the shared `.agents` [[8]].
  Agents name skills differently too: OpenCode and Cursor by the folder, Claude Code, Codex and GitHub Copilot by the declared name, Claude Code a plugin's skill by its plugin [[1]] [[2]] [[4]] [[5]] [[6]].
  Several load other agents' folders as well, Cursor Claude Code's and Codex's, OpenCode and GitHub Copilot Claude Code's, each in its own order or none [[4]] [[5]] [[6]].
  Two agents loading both copies may so load different ones, and a call reaches the copy the agent running its caller loads.
- Every insight weighed alike: a skill with no steps or a long `SKILL.md` carried the same dot and count as a conflict, so the dot and the count stopped telling a reader where to act.
- The page's chrome said more than it meant:
  - a native list chose the language, unlike every other control;
  - "Expand all" and "Collapse all" acted on groups and cards at once, two links for one choice;
  - a card spelt out zeros ("Depends on 0", "no steps", empty categories) and a bare "×6" for its folders;
  - Rescan weighed as much as Insights;
  - a Details button opened the panel that selecting a skill already opens, and with nothing selected the panel held the legend and the keys;
  - a property holding fields read as a JSON string;
  - hovering a card dimmed every other line, so moving the pointer across the canvas flickered it.
- Considered and declined:
  - teaching the export's reader to run a server: the export exists for a reader who cannot;
  - keeping mentions behind a toggle: the control, its style and its concept stay, for a question few readers ask;
  - warning on every differing copy: a reader learns to ignore a warning that is usually intended;
  - the page judging each insight's level: the digest an agent reads would then disagree with the page;
  - a two-state language toggle: a third catalog a reader adds would need code.

## Decision

- The exported page is read-only: it shows the atlas and the workflows, and offers no control that would change them.
- The page shows dependencies only, the calls between skills, and names the relation a dependency.
  - The scan still classifies every link as a call or a mention, an unresolved one included, and reports both.
- One loading model says, per agent, the places it loads, the name it invokes a skill by and its ranking of the places, each as its documentation says; where the documentation states no ranking, the places rank alike.
- Each differing skill of a shared name is reported with how it stands to each other one, told from that model: a conflict where an agent may run either, an override naming the skill loaded where an agent runs one over the other, or another agent's copy.
  - An agent may run the copies under a name that no other copy it loads under that name outranks, so copies ranked below the one it runs are no conflict.
  - A link reaches the skill an agent loading its caller runs under the name, so a dependency and an override name the same skill, and a name reaching none is unresolved, as one not installed is.
  - Where the agents loading both copies differ in the one they load, each copy loaded is reported with the agents loading it, alike from either side, and one agent's conflict hides no other's override.
  - Another agent's copy names no agent loading both, as there is none; the page names the agents loading it from its folders.
  - A plugin's skill shares its name only with the same plugin's skills.
- Only a conflict is a problem, one per name and set of copies an agent may run: it names the agents that may load either copy and each copy's folder, and says to delete one, rename one's folder and declared name alike, or move it out of those agents' folders.
  An override and another agent's copy carry a quiet note instead, the note naming a conflict's other copies too, and the page can show any two copies side by side, never marking a line alike in both as differing.
- Every insight has a level the scan sets, the one test being whether the reader must act on it:
  - a problem: a conflict, a call to a skill not installed, a cycle, frontmatter that does not read, a translation behind its source, edited apart from it or with other steps, an annotation written from another text;
  - a note: no steps, over 500 lines, no description, a name differing from its folder, and a name only mentioned that is not installed, as it runs nothing.
- Only problems mark a card and count on the Insights control; the insights list the problems first, then the notes under a quiet heading, and a skill's details still show its notes.
  The digest counts both and lists each under its level.
- The page's chrome says only what it means:
  - the language is chosen from a menu of every offered language in its own name, opened by a globe and the language's short name, the catalog's or its tag's language in capitals, which begins the control's name to assistive technology so it can be spoken as seen;
  - one control opens or closes the shown cards' steps, never groups, each group keeping its own;
  - a card shows only counts that are not zero, each category named with its count, and "{n} places" where it is installed in more than one folder, its folders named in its tooltip and accessible name;
  - Rescan is an icon, named and busy while it scans;
  - the frontmatter shows as properties, a value holding fields a field to a row.
- A selected or focused skill's dependencies draw at full strength and every other dims; hovering emphasizes nothing.
- The details panel opens only on a selection and closes with it, and the legend and the keys move to a Help control: a Details button only duplicated selecting a skill, and the legend and the keys are help, not details.

## Consequences

- An exported page has fewer controls, and a reader who wants to arrange workflows runs the page from the skill.
- A mention no longer shows on the page; an unresolved name the skill steers away from is not shown either.
- A machine with intended overrides shows no insight for them, so the insights left are the ones to act on.
- An agent whose documentation states no ranking is read as ranking none, so its copies of one name are reported as a conflict, which renaming or removing one settles.
- A machine whose skills are only long or unannotated shows no count, so a count means there is something to fix.
- An atlas from an older scan, holding no levels, reads every insight as a problem.
- A catalog may name its language's short name; the page's text gains entries for its new words and loses those of the retired controls.

## References

[1]: https://code.claude.com/docs/en/skills "Claude Code: Extend Claude with skills"
[2]: https://learn.chatgpt.com/docs/build-skills "Codex: Build skills"
[3]: https://geminicli.com/docs/cli/skills "Gemini CLI: Agent Skills"
[4]: https://opencode.ai/docs/skills/ "OpenCode: Agent Skills"
[5]: https://cursor.com/help/customization/skills "Cursor: Skills"
[6]: https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference "GitHub Copilot CLI command reference"
[7]: https://moonshotai.github.io/kimi-cli/en/customization/skills.html "Kimi Code CLI: Agent Skills"
[8]: https://roocodeinc.github.io/Roo-Code/features/skills "Roo Code: Skills"
