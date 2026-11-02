<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-197: Dismiss Reminders Without Losing History

## Status

Accepted (2026-11-02) on the owner's request to dismiss the remaining format-incompatibility notice and distinguish active reminders from dismissed ones with consistent actions.
Amends [DR-194](194-saved-work-is-a-choice-not-setup-debt.md) in optional-reminder acknowledgement and [DR-196](196-a-review-count-and-a-way-back.md) in dismissal wording, list grouping and the sidebar return path.

## Context

A folder reminder can be set aside, but an unrelated old-format import failure remains counted with no useful action.
Placing that failure beneath Locate project files suggests a folder choice could resolve it.
Both acknowledging a folder reminder and dismissing an unavailable-history notice remove a reminder without recovering or deleting the saved work.
Keeping dismissed rows among active warnings makes the remaining count hard to understand.

## Decision

- Use Dismiss for both optional folder reminders and eligible older-conversation notices; replace Not now and For later in the current interface.
- Active items remain visible, with standalone notices separated from Locate project files and its explanation.
- Move dismissed folder reminders and notices into one collapsed Dismissed section with its own item count, excluded from the header warning count.
- A dismissed folder reminder retains its conversations and folder actions; Show again restores either kind of item to the active list and warning count.
- The sidebar's Locate project files action reveals dismissed folder reminders as well as active ones, while an ordinary Review visit starts with Dismissed collapsed.
- Dismissal is a preference of the core's own home, surviving restart without modifying source files, recovering a conversation or changing execution restrictions.
- Only a verified, nonblocking standalone older-conversation import or upgrade failure can offer notice dismissal; blocking and unclassified diagnostics remain visible.
- A dismissal names the exact reported failure and source-file identity/version; a changed source or failure counts afresh, and an unknown or stale request is refused.
- A failed dismissal remains visible with its error; a successful dismissal confirms preservation, and dismissed-only review remains reachable at zero.

## Consequences

The same action has the same name and visible destination across optional reminders.
A format incompatibility no longer implies mandatory folder setup.
Saved history remains available for later inspection or compatible recovery without repeatedly demanding attention.
