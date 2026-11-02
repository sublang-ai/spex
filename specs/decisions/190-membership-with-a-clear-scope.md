<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-190: Membership with a Clear Scope

## Status

Accepted (2026-11-02) on the owner's request to make inviting group members understandable and to offer group deletion under the Space's permission policy.
Amends [DR-114](114-groups-and-sharing-from-spex.md) in the members panel and its invitation editor, [DR-120](120-the-instance-is-the-space.md) in membership guidance and empty-group deletion, and [DR-172](172-surfaces-a-fresh-user-reads.md) in the group overflow's actions.
Extends [DR-069](069-key-phrases-not-sentences.md): the invitation's scope, required account, role capability and immediate effect are essential guidance beside their controls, visible without hovering.
Amended by [DR-191](191-invite-several-members-together.md) in the one-username limit, submission and outcome: removable username tokens share one role, additions run sequentially, and only failed or unsent entries remain for an explicit retry.
Amended by [DR-193](193-group-deletion-follows-the-space-policy.md) in empty-group deletion: a fresh Space check names every blocking content item instead of relying on cached rows, and a safe request preserves scheduled state and restoration where allowed.

Amended by [DR-198](198-consistent-inline-group-actions.md) in the Members panel’s attached presentation, visible Close, repeated activation and mutation guards.

## Context

The owner's screenshot places Share directly beneath their own member row, making it read as account sharing.
Its sign-in-like field label and uncaptioned role list give no way to know whom to enter or what access the choice grants.
The Space already adds an existing account immediately and decides which roles and group operations the person may use.
An empty group can already be deleted through the core, but [DR-172](172-surfaces-a-fresh-user-reads.md) removed that action from the app.

## Decision

- The members panel names its group or project and puts Invite members in its header, apart from every member's row; the current account reads You beside its username.
- Invite members opens a bounded form above the roster, headed Invite to the named group or project, with explicit Username and Role labels, a username example, the Space account requirement, one username per submission, and the access scope.
- Role is a single-choice dropdown containing the Space's names in its order, with the least role that may send records preselected; a visible description explains the recognized standard roles in plain language where their reported send capability agrees, while an unfamiliar or mismatched role describes only that reported capability; the hints never gate an operation or invent a role.
- The form says access begins immediately, and its committing action reads Add member; no pending invitation, email delivery or acceptance step is promised.
- The group's scope includes its projects and nested groups; a project's scope is its records at that Space.
- Delete group… returns to a group's overflow only where the Space says the person may delete it; known projects, copies listed there, nested groups or a server using it disable deletion with a visible reason.
- Deletion uses the existing empty-group operation and its authority; the inline confirmation names the group and Space and the effect for all members, with Cancel focused and Escape cancelling before submission.
- A successful deletion request is acknowledged as a request, with no promise of an immediate permanent deletion or a recovery period the Space has not reported.

## Consequences

- Invitation guidance and access failures use the same Invite members label; Share remains the verb for sharing records into a group.
- The Space's role names, permission flags and refusal remain authoritative; the redesign adds no directory search, email invitation or bulk addition contract.
- The UI preserves typed input on refusal, prevents duplicate submissions, returns focus when an editor closes, and explains consequential choices in both offered languages.
