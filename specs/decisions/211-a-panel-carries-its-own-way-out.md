<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-211: A Panel Carries Its Own Way Out

## Status

Accepted (2026-11-03) on the owner's request to make every temporary panel easy to close in the app's existing visual language.
Amends [DR-010](010-interface-craft.md), [DR-158](158-a-legible-graph-and-outline.md), [DR-194](194-saved-work-is-a-choice-not-setup-debt.md).
Amended by [DR-212](212-panel-dismissal-as-quiet-chrome.md), [DR-225](225-bounded-surfaces-and-attached-records.md), [DR-246](246-remove-groups-and-team-servers-from-the-clients.md).

## Context

Panels opened beside the item they affect had different backgrounds, borders, type weight and spacing.
Some opening buttons toggled their panel, others did nothing visibly, and repeating one could clear a completed check without starting another.
Temporary views depended on remembering an opener, pressing Escape, or clicking outside, leaving no visible way out in the content itself.
Some panels contain a pending change or a duty that closing the view must not silently discard.

## Decision

### One attached presentation

- Extends [DR-010](010-interface-craft.md)'s visual and keyboard rules to temporary panels and their dismissal.
- A panel opened from a row stands as one quiet attached expansion of that row, with a thin interaction-colour left rule, compact spacing, normal 14-pixel text, medium-weight titles and 12-pixel secondary text; it names its affected project, with the Space where that informs the action.
  No independent raised card or coloured warning slab encloses these tasks; a final destructive action remains red.
- Activating an already-open task brings its existing panel or editor into focus without collapsing it, clearing a draft, changing a destination or repeating a read; opening again after closing starts the ordinary fresh read or editor.
  Menus and explicitly indicated disclosures remain toggles, and committing controls perform their named actions.
- A trailing ellipsis marks a command requiring information to define its action, following the information-required convention [[1]], as "Sync to a Space…" and "Locate folder…" require a destination or a folder; a command that only opens a view or confirms an already-named action takes none, nor does a final action label.
  Progress labels such as Syncing… and the More menu's ellipsis icon retain their separate meanings.

### A visible way out

- The affected temporary panels carry a visible secondary dismissal action in their own content: Close in the header for a view, Cancel beside the actions for an unfinished form, and Close for a completed result.
  Controls retain the surrounding typography, spacing, theme and button styles.
- Escape dismisses the nearest eligible panel; an open menu, model list or nested editor handles its own Escape first.
  Dismissal returns focus to the actual opener, or to an appropriate surviving control if the opener no longer exists.
- The project palette, the Space records panel, first-destination panel and review, authoring browser setup, the package-add form, the adapter-wide model editor, the approval inbox and the pinned graph selection card expose this explicit way out.
  Ordinary local chevron disclosures, native details, menus, listboxes and passive hover previews keep their established behavior.
- A pending repair, notice, destination, package-add or model mutation prevents duplicate submission and local dismissal or replacement until its response, its progress visible.
  Browser preparation remains cancellable: closing its setup view cancels the work it owns, as its existing preparation contract requires.
  Closing records does not stop synchronization.
- Amends [DR-194](194-saved-work-is-a-choice-not-setup-debt.md): closing a diagnostic review preserves its warning and unresolved count, and a newly appearing blocker opens review again.
- Closing the approval inbox preserves every pending request and its attention entry, without approving or denying anything.
- Amends [DR-158](158-a-legible-graph-and-outline.md): closing the graph's pinned card clears the shared selection and returns focus to its package node without reopening a hover preview.

## Consequences

The dismissal action is available where the reader is looking, without another menu or a new card style.
Each surface retains its own task semantics, while repeat activation, nested keyboard behavior, focus restoration and pending-state guards remain reviewable in its integration tests and browser journeys, in both themes, both languages and narrow containers.

## References

[1]: https://developer.apple.com/design/human-interface-guidelines/menus "Apple Human Interface Guidelines: Menus"
