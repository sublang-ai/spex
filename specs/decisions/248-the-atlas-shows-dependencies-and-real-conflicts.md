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
  Two agents loading both copies may so load different ones.
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
- Each differing skill of a shared name is reported with how it stands to each other one, told from the places each agent loads them from: a conflict, an override naming the skill loaded, or another agent's copy.
  - An agent ranks a project's folder over the home folder's and a nearer project folder over a farther one, unless its documentation ranks otherwise; Claude Code, Codex and Gemini CLI rank as their documentation says.
  - Where the agents loading both copies differ in the one they load, each copy loaded is reported with the agents loading it, alike from either side.
  - Another agent's copy names no agent loading both, as there is none; the page names the agents loading it from its folders.
  - A plugin's skill shares its name only with the same plugin's skills.
- Only a conflict is a problem: it names the agents that may load either copy and each copy's folder, and says to keep one.
  An override and another agent's copy carry a quiet note instead, and the page can show any two copies side by side.
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
- An agent whose ranking the scanner does not know is read by the common rule, so its overrides may be reported where it ranks otherwise.
- A machine whose skills are only long or unannotated shows no count, so a count means there is something to fix.
- An atlas from an older scan, holding no levels, reads every insight as a problem.
- A catalog may name its language's short name; the page's text gains entries for its new words and loses those of the retired controls.

## References

[1]: https://code.claude.com/docs/en/skills "Claude Code: Extend Claude with skills"
[2]: https://learn.chatgpt.com/docs/build-skills "Codex: Build skills"
[3]: https://geminicli.com/docs/cli/skills "Gemini CLI: Agent Skills"
