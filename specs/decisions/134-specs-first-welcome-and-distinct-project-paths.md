<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-134: Specs-First Welcome and Distinct Project Paths

## Status

Accepted (2026-10-22) for the owner's P0-0 revision.
Amends [DR-132](132-a-welcome-page-before-the-first-project.md) in the welcome copy and action order, and [DR-133](133-the-first-project-picker-leads-with-a-folder.md) in the first-project palette.
The value explanation, Academy caption placement, and creation form's redundant link are amended by [DR-135](135-welcome-flow-copy-and-scoped-academy-note.md).

## Context

- The first welcome copy describes reviewable changes without naming specs, although specs are Spex's leading value.
- A reader who removes their last project also reaches the zero-project page; the Academy example is not necessarily that reader's next action.
- The folder picker looks clickable when presented as a regular button, without a filled brand treatment.
- Existing-path registration and new-path creation look like duplicate path fields when both are shown together.

## Decision

- The welcome headline names checkable specs first and playbook-driven delivery second. Supporting copy explains that specs set goals and acceptance criteria and that natural-language playbooks compile into workflows for implementation and review.
- The generic zero-project page makes "Add a local project" its primary action and keeps the Academy specs example visible as a secondary learning route. The page does not infer first-time use from an empty project list.
- In the first-project palette, the folder picker remains the first focused action where available but uses a neutral button treatment.
- The manual existing-repository path stays behind an explicit alternative on desktop. The new-project path is shown only after choosing creation; switching between these choices does not leave both fields visible.
- Existing-path copy says that the Git repository already exists; new-path copy says that Spex will create the folder and initialize Git. The specs-scaffold option remains on the creation route.

## Consequences

- Returning readers can start from their local repository, while new readers can still discover the Academy example.
- The two path controls communicate different effects before submission.
