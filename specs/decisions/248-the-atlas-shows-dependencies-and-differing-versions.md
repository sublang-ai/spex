<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-248: The Atlas Shows Dependencies and Differing Versions

## Status

Accepted (2026-11-22).
Amends [DR-242](242-skills-shipped-from-the-repository-and-an-atlas-of-them.md) in the links the page shows, the exported page, what a shared name reports, the insights' levels and the page's controls.
Amends [DR-245](245-skills-and-the-atlas-in-the-readers-language.md) in the page's settings and their labels, retiring the setting for mentions, and in the control choosing the page's language.
Amended in the name of workflows, pipelines since, by [DR-250](250-the-atlas-arranges-pipelines.md).

## Context

- The exported page let a reader edit workflows and download them as a file ([DR-242](242-skills-shipped-from-the-repository-and-an-atlas-of-them.md)).
  Nobody edits an exported copy: its reader has neither the skills nor the state folder, so an edit there reaches no one.
- The page drew two kinds of link, a call and a mention, a skill named without being run.
  A mention answers an author's proofreading question, not a reader's question of what depends on what, and it cost a control, a style and a concept.
  The scan still needs the distinction: "do not use `/lint`" is no call.
- Every pair of differing skills of one name was reported as a problem.
  Whether it is one depends on which of them an agent reads, and that differs by agent: each loads its own set of folders, invokes a skill by its declared name or its folder's, and ranks the folders in its own order or none.
  Modelling each agent's loading to tell a conflict from an intended override was tried and dropped:
  - unbounded: every agent the atlas knows needs its own rule, and there may be a hundred;
  - unverifiable: each rule rests on documentation that is incomplete or changes, and every review round found another rule wrong;
  - noisy: it named agents not installed, such as Cursor "may load either" on a machine without Cursor.
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
  - warning on every differing copy as a problem: a reader learns to ignore a warning that is usually intended;
  - modelling each agent's loading and ranking: see above;
  - the page judging each insight's level: the digest an agent reads would then disagree with the page;
  - a two-state language toggle: a third catalog a reader adds would need code.

## Decision

- The exported page is read-only: it shows the atlas and the workflows, and offers no control that would change them.
- The page shows dependencies only, the calls between skills, and names the relation a dependency.
  - The scan still classifies every link as a call or a mention, an unresolved one included, and reports both.
- Skills of one name with different content are one fact, stated without a verdict.
  - A skill goes by its declared name in each of its folders and by `<plugin>:<name>` in a plugin's, so the differing skills of two plugins, or of a plugin and of none, never share a name.
  - Folders reached through links to one folder, and byte-for-byte copies of one declared name, a plugin's included, are one skill already; each skill lists the other skills going by a name it goes by, which differ from it.
  - Each such name is one note listing, for each version, the folders where it goes by that name: an agent reading more than one of those folders picks one by its own rules.
  - The atlas gives no cleanup advice: deleting a folder another links to would remove each version reached through it.
  - The atlas names no agent for it and ranks no version over another; the reader judges.
  - The page notes on each skill its other versions by folder, and shows any two of them side by side, never marking a line alike in both as differing.
- A link to a name several skills hold reaches the one in the caller's own folder, else the first in the scanner's order, and `<plugin>:<name>` reaches that plugin's skill.
- Every insight has a level the scan sets, the one test being whether the reader must act on it:
  - a problem: a call to a skill not installed, a cycle, frontmatter that does not read, a translation behind its source, edited apart from it or with other steps, an annotation written from another text;
  - a note: a name with different versions, no steps, over 500 lines, no description, a name differing from its folder, and a name only mentioned that is not installed, as it runs nothing.
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
- Differing versions of a name raise a note, not a problem, whether intended or not; the reader who knows which agents they use decides.
- No agent's rule needs maintaining, so a new agent changes nothing but the folders the scan reads.
- A machine whose skills are only long or unannotated shows no count, so a count means there is something to fix.
- An atlas from an older scan, holding no levels, reads every insight as a problem.
- A catalog may name its language's short name; the page's text gains entries for its new words and loses those of the retired controls.
