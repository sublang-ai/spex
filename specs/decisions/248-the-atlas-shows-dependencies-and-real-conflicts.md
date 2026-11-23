<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-248: The Atlas Shows Dependencies and Real Conflicts

## Status

Accepted (2026-11-22).
Amends [DR-242](242-skills-shipped-from-the-repository-and-an-atlas-of-them.md) in the links the page shows, the exported page and what a shared name reports.
Amends [DR-245](245-skills-and-the-atlas-in-the-readers-language.md) in the page's settings and their labels, retiring the setting for mentions.

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
- Considered and declined:
  - teaching the export's reader to run a server: the export exists for a reader who cannot;
  - keeping mentions behind a toggle: the control, its style and its concept stay, for a question few readers ask;
  - warning on every differing copy: a reader learns to ignore a warning that is usually intended.

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

## Consequences

- An exported page has fewer controls, and a reader who wants to arrange workflows runs the page from the skill.
- A mention no longer shows on the page; an unresolved name the skill steers away from is not shown either.
- A machine with intended overrides shows no insight for them, so the insights left are the ones to act on.
- An agent whose ranking the scanner does not know is read by the common rule, so its overrides may be reported where it ranks otherwise.

## References

[1]: https://code.claude.com/docs/en/skills "Claude Code: Extend Claude with skills"
[2]: https://learn.chatgpt.com/docs/build-skills "Codex: Build skills"
[3]: https://geminicli.com/docs/cli/skills "Gemini CLI: Agent Skills"
