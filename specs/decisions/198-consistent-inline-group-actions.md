<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-198: Consistent Inline Group Actions

## Status

Accepted (2026-11-02) on the owner's request for consistent presentation, punctuation and repeated-button behavior across group selection, Members and Delete group.
Amended by [DR-211](211-a-panel-carries-its-own-way-out.md) in reserving Members' trailing header position for its visible Close action.
Amends [DR-190](190-membership-with-a-clear-scope.md) in membership-panel presentation and dismissal, [DR-192](192-choose-a-group-before-adding.md) in repeated chooser activation, and [DR-193](193-group-deletion-follows-the-space-policy.md) in repeated confirmation activation and its presentation.
Extended by [DR-203](203-groups-within-groups-and-deletion-review.md) in applying the attached presentation and bounded editor layout to top-level and nested New group.
Extends [DR-187](187-the-group-chooser-belongs-to-its-project.md)'s attached expansion to Members and Delete group.
Applies [DR-010](010-interface-craft.md)'s visual and keyboard rules to these flows and the related New group and Invite members editors.

## Context

The chooser, members list and deletion confirmation had different backgrounds, borders, type weight and spacing despite opening beside the item they affect.
Some opening buttons toggled their panel, others did nothing visibly, and repeating Delete group cleared a completed check without starting another.
Members had no visible Close, and its enclosing controls could discard an in-flight addition or removal.

## Decision

- Add to a group, Members and Delete group share one quiet attached expansion with the owning project or group heading, a thin interaction-colour left rule, compact spacing, normal 14-pixel text, medium-weight titles and 12-pixel secondary text.
  Group children remain outside the heading's expansion; each panel still names its affected project or group, with the Space where it informs the action.
  No independent raised card or coloured warning slab encloses these tasks; the final destructive action remains red.
- Activating an already-open task brings its existing panel or editor into focus without collapsing it, clearing a draft, changing a destination or repeating a read.
  This also applies to New group and Invite members; opening again after closing starts the ordinary fresh read or editor.
- Members offers Close; unfinished tasks offer Cancel; Escape closes the nearest idle editor or panel, returning focus to its opener.
  Menus and explicitly indicated disclosures remain toggles, and committing controls perform their named actions.
- Pending mutations prevent duplicate submission and closure or replacement through their local enclosing controls, with their current progress visible.
  Navigating away retains the existing batch-stop guarantee rather than promising background completion.
- A trailing ellipsis marks a command requiring information to define its action, following the information-required convention [[1]]: Add to a group…, Invite members… and New group… require a destination, people or a name.
  Members only opens a view and Delete group only asks for confirmation of the already-named action, so neither takes an ellipsis; final action labels have none.
  Invite members… is a fixed whole phrase outside the compact-label budget, wrapping within its row.
  Progress labels such as Adding… and the More menu's ellipsis icon retain their separate meanings.

## Consequences

The reader can recognize the affected item and use the same opening, closing and keyboard behavior throughout these group-management flows.
Rendered integration and browser acceptance verify repeat activation, preserved state, focus, pending guards, both themes, translations and narrow containers.
The underlying group, membership and sharing operations do not change.

## References

[1]: https://developer.apple.com/design/human-interface-guidelines/menus "Apple Human Interface Guidelines: Menus"
