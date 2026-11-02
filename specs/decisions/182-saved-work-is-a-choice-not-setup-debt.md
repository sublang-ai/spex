<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-182: Saved Work Is a Choice, Not Setup Debt

## Status

Accepted (2026-11-02) on the owner's rejection of the repair screen's unexplained names, connection language and ambiguous folder action.
Amends [DR-177](177-repairs-explain-the-next-step.md) in its repair presentation, next steps and issue count; structured causes and preservation remain.
Amends [DR-065](065-repairs-the-reader-answers.md) in acknowledgement meaning and presentation: Not now postpones optional recovery, without asserting where a project belongs.
Amends [DR-172](172-surfaces-a-fresh-user-reads.md) in the repairs' heading, attention styling, naming and actions, and extends [DR-069](069-key-phrases-not-sentences.md) to make an action's purpose and scope visible before asking for it.

Amended by [DR-183](183-read-saved-conversations-before-locating-files.md) in source explanation, project grouping and reading history before locating files.

Amended by [DR-184](184-a-review-count-and-a-way-back.md) in the header review count and persistent return path.

Amended by [DR-185](185-dismiss-reminders-without-losing-history.md) in unified dismissal, separated active and dismissed items, and preserved-history notice acknowledgement.

## Context

The previous repair screen made storage diagnostics into mandatory setup work after sign-in.
A personal history container's derived name stood as a project name, a folder's relationship to it was described as a connection, and selecting an existing folder looked like an invitation to create or convert one.
Personal conversations may have used a general folder: a missing project relationship does not prove that project files were lost.
An older session waiting for that same folder appeared as a second problem.
Error styling should be reserved for problems that need to interrupt work [[1]], and validation should identify the specific input and how to correct it [[2]].

## Decision

- Nonblocking recovery is an optional Saved work review, quiet and initially closed; a blocking problem alone calls for attention and opens the review.
- The task is to continue recognizable saved conversations: show up to three recent conversation titles, with saved-date or untitled fallbacks, and a project name only when project metadata supplies it.
- Storage-derived names and group/project composites never identify a recovery task.
- Previously used folders are labelled as such; their checks and technical failures live in collapsed Technical details, not as errors before the person has made a choice.
- Choose project… asks for an existing project folder in which all the conversations in that task will continue, with that purpose and scope visible before confirmation.
- The editor starts with a checked valid proposal or an empty candidate, never a known unusable folder; a failed submission names the exact candidate and explains the existing-Git-project requirement without creating one.
- Not now keeps the conversations and leaves the task for later; returning to it retains the choice to select a folder.
- One folder task also carries its dependent older-session import failures, so one choice is not counted twice.
- Saving a folder retries those imports immediately; the outcome confirms the saved folder, while any remaining unreadable conversation keeps its own report.
- A conversation Spex cannot read is described as unavailable with its original file preserved, not as homework to share details through a support route that does not exist.
- Controls and explanations name their effect; technical correctness alone is insufficient when the reader cannot tell which saved work, folder or action a phrase refers to.

## Consequences

The normal Space page remains usable while optional recovery waits.
Folder choice still requires a valid project root and preserves the existing identity, aliases, leases and environment setup.
The protocol carries recognizable conversation previews and explicit relationships between diagnostics; it derives neither from diagnostic prose.
English and Chinese follow the same flow, with keyboard, narrow-width and real-browser acceptance coverage.

## References

[1]: https://www.nngroup.com/articles/hostile-error-messages/ "Hostile Patterns in Error Messages — Nielsen Norman Group"
[2]: https://design-system.service.gov.uk/components/error-message/ "Error message — GOV.UK Design System"
