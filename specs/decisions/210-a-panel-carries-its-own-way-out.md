<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-210: A Panel Carries Its Own Way Out

## Status

Accepted (2026-11-03) on the owner's request to make Members and every comparable temporary panel easy to close in the app's existing visual language.
Extends [DR-010](010-interface-craft.md)'s keyboard and visual grammar to explicit panel dismissal.
Amends [DR-198](198-consistent-inline-group-actions.md) in the Members header, [DR-194](194-saved-work-is-a-choice-not-setup-debt.md) in closing a diagnostic review, and [DR-158](158-a-legible-graph-and-outline.md) in clearing the pinned selection card.

## Context

Members' dismissal was difficult to find beside a wrapping title and invitation action.
Other temporary views depended on remembering an opener, pressing Escape, or clicking outside, leaving no visible action in the content itself.
Some panels contain a pending change or a duty that closing the view must not silently discard.

## Decision

- The affected temporary panels carry a visible secondary dismissal action in their own content: Close in the header for a view, Cancel beside the actions for an unfinished form, and Close for a completed result.
  Members reserves the trailing header position for Close in group, project and placement views, including read-only and loading states.
  Controls retain the surrounding typography, spacing, theme and button styles.
- Escape dismisses the nearest eligible panel; an open menu, model list or nested editor handles its own Escape first.
  Dismissal returns focus to the actual opener, or to an appropriate surviving control if the opener no longer exists.
  Reopening an already-open model editor focuses it without losing its draft.
- The project palette, Space records panel and review, authoring browser setup, package-add form, adapter-wide model editor, approval inbox and pinned graph selection card expose this explicit way out.
  Ordinary local chevron disclosures, native details, menus, listboxes and passive hover previews keep their established behavior.
- A pending membership, repair, notice, package-add or model mutation prevents local dismissal or replacement until its response.
  Browser preparation remains cancellable: closing its setup view cancels the work it owns, as its existing preparation contract requires.
  Closing records does not stop synchronization.
- Closing a diagnostic review preserves its warning and unresolved count; a newly appearing blocker opens review again.
  Closing the approval inbox preserves every pending request and its attention entry, without approving or denying anything.
  Closing the graph's pinned card clears the shared selection and returns focus to its package node without reopening a hover preview.

## Consequences

The dismissal action is available where the reader is looking, without another menu or a new card style.
Each surface retains its own task semantics, while nested keyboard behavior, focus restoration and pending-state guards remain reviewable in its integration tests.
