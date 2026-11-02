<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-191: Invite Several Members Together

## Status

Accepted (2026-11-02) on the owner's request to enter several usernames when that can use the existing membership operation without a large new feature.
Amends [DR-190](190-membership-with-a-clear-scope.md) in the invitation's one-username limit, submission and outcome; its permission model, role guidance, immediate access and group deletion are unchanged.

## Context

A workshop organizer often adds several people at the same role.
Repeating the form for every person creates unnecessary work, while an unstructured list obscures which usernames will be submitted and which additions succeeded.
The Space already supports adding one existing account with an independent outcome, so several additions need no new service contract.

## Decision

- Usernames is one field with removable username tokens; Enter or a comma commits the current entry, and pasted lists may use commas or line breaks.
- Each username is trimmed and loses a leading `@`; empty entries are ignored and exact normalized duplicates collapse to their first occurrence.
- The form visibly explains the separators and the requirement for each person to have an account at the named Space; one selected role applies to all listed usernames.
- Submission includes any uncommitted entry and adds each username in order through the existing operation, updating the roster after every successful response.
- While adding, the form holds its entries and role, prevents a second submission or cancellation, and shows progress apart from the fixed Adding… button label.
- Complete success closes the form and returns focus to Invite members; one addition names the person and role, and several additions report the successful count and role.
- Partial success keeps the form open with a per-user error, removes successful usernames from its entry tokens, and retains only failed or unsent usernames; an explicit retry submits only those retained entries.
- A lost connection stops issuing further requests, preserves every unsent username and gives reconnect guidance; no automatic retry, rollback or atomic completion is promised.
- Refreshing the same target preserves an active form; leaving the panel stops issuing requests after any in-flight one, without persisting an invitation draft.

## Consequences

- Several existing accounts can be added in one form with one shared role, while every accepted addition takes effect immediately.
- Username tokens are entries to submit, not a claim that an account has been found; no directory search, email invitation or new service batch operation is introduced.
- Keyboard, pasted input, sequential progress, partial success and reconnect behavior are verified through the rendered surface and the organizer's browser journey.
