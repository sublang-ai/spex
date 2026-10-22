<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-120: The Instance Is the Space

## Status

Accepted (2026-10-12) on the owner's correction of that day: "End users should only see the workshop group, their own personal groups, and projects."
Supersedes [DR-118](118-the-host-page-a-first-group-is-made-on.md) whole: no link to the Git host's site stands at the groups list's head.
Amended by [DR-129](129-content-size-is-not-permission.md) for explicit content-size rejections: their public report carries the instance-only cause and reported limit rather than raw transport words, with access unchanged and no membership guidance.
Amends [DR-114](114-groups-and-sharing-from-spex.md) in its amendment of [DR-064](064-honest-remote-failure.md) and in "Everything else stays on the Git host … reached through the "Open at <host>" link a members panel keeps": no door to the host's pages stands anywhere; renaming a group, deleting an empty group and moving a spex repository to another group are done in Spex; roles, visibility, archive and group transfer are not offered; where membership decides, a failure names Share, or a member who may share, in Spex.
Amends [DR-064](064-honest-remote-failure.md) in what a report prints and in its guidance: no URL under the Git host's origin is printed, the clone's own remote reading as the repository's path in the instance and any other as the host's display name; any other remote URL is printed only with its embedded user removed; a host transport that reaches no rule is classified as the host's error, never shown as Git's words; where membership decides, a failure names Share, or a member who may share, in Spex, never the host's members page.
Amends [DR-103](103-the-home-and-its-groups.md) in "What Spex does on a Git host" item 6 and in its Consequences, whose link to the host's members page goes, and in its scenarios, which gain "Set up a workshop or a team"; its tree under `workspace/` still mirrors the paths the host answers, which are now paths in the instance.
Amended by [DR-127](127-a-home-signed-in-to-several-instances.md) in its keys, its entries and rows, the list's head, its collisions and its Org-default consequence: a key and a folder name the instance before the path in it; a host repository is one by its Git origin and id, whichever instances list it, its clone keyed under one of them and following another that lists it while that one is signed out; the Groups state keys its entries by instance and id, your namespace at an instance by instance and login; each instance's heading carries what the list's head carried; a group collides with a login only within its instance, the collision with your own group's folder name dropped; the Org default matches the key without its instance segment against the orgs of the project's instance.
Amended by [DR-128](128-a-spex-repository-placed-at-several-instances.md) in its keys, its entries and rows, its acts and its Git lines: a clone's key follows its first placement; a placed clone has one row, under the group its key placement's instance last named for it, every other group that lists a placement of it showing one line; a move acts on one placement; a report reads each placement's remote as its path in its instance.

## Context

- A spex.pub deployment, an **instance**, keeps every group its people make inside one group of its own, its container, on the Git system behind it, run by a service identity of its own; that system is its storage [[1]].
- In the 2026-10-11 workshop simulation the organizer was sent to the Git system's own site to make the workshop group ([DR-118](118-the-host-page-a-first-group-is-made-on.md), workshop issue W-20), made it outside the instance, and moved eleven projects back through the protocol, the surface offering no move (W-39); New playbook's Org default read the container's path off the keys (W-36).
- An unreleased first draft of this record modelled the instance's own group in the client — a heading "this host's group", "ask its owner to share it with you", its path in every key — and so built the storage into the person's model.
- The owner's correction: a person sees the instance alone, by its URL; the Git system's top-level group is storage.
- spex.pub now answers every group and repository path relative to the instance's root, lists only the groups inside it and each person's own, makes a group at the root with its service identity and adds the person as Owner, leaves that identity out of every member list, says whether the instance makes groups, and answers no page URL [[1]].
- A group at the instance's root may bear a path equal to an account's login: the host refuses that at creation, but a later sign-up, or a member added outside Spex, can still meet one.

## Decision

### What a person sees

- The instance is the space: Spex names only the instance — its URL and display name — on every surface, in every protocol reply, key and workspace folder, and in every Git line a report carries; never the Git system behind it, its container, its paths or its pages. The client has no naming exception.
- The Groups surface lists your own group; the groups of the instance you belong to, each by its path in the instance; their spex repositories; and the spex repositories shared with you from another person's own group, under that person's login.
- Keys and workspace folders are the paths the host answers (`workspace/claude-workshop-261011/lumen-labs/invite-codes-spex`); your own group's folder stays your login.
- The groups list's head reads "New group" where the host's view says you may create a group; where it says you may not, the one phrase "Groups are made by the people who run <display name>", with no link and no control; before a read, neither.

### Entries and rows

- The Groups state keys its entries by the group's id, your own by `own`, and one entry per other account's login under which the host lists a spex repository; that entry has no abilities, no Members, New subgroup or Share on its heading, and is never offered in a pick; its rows carry their own state and members.
- A row stands under the group the host's last read names for its id, under its key's group only where the host lists nothing for it; a clone the host moved stands under its new heading with its key unchanged until its next sync moves it ([DR-103](103-the-home-and-its-groups.md)); a listed group never displaces your own group or takes its rows.
- A listed group whose path equals, ignoring case, your own group's folder name or another listed login, or lies beneath it, is colliding: its repositories take no folder, read "Unreachable: a group named like your login" with no Join and no Sync, and a pick into it is refused.

### Acts

- No door to the host's pages: no "Open at <host>", no members page, no "New group at <site>". Where membership decides, a failure names Share, or a member who may share it, in Spex.
- Mistakes are undone in Spex, each act as the person and shown where the host's view says the person may: rename a group; delete a group under which the view lists no spex repository and no group; move a spex repository to another group the view lists, its clone moved by its next sync. Roles, visibility, archive and group transfer are not offered.
- A member is `{id, login, displayName, role, direct, via}`; no group, member, profile or members page URL crosses the protocol.

### Git's lines

- No line a report carries — Git's last lines and the host's `remote:` words alike — holds a URL under the host's Git origin: the clone's own remote, with or without `.git` and a trailing `/`, reads as the repository's path in the instance, and any other URL under that origin as the host's display name.
- A transport to the host that reaches no classification rule stops as "<host> answered with an error", with the HTTP status Git printed, and Retry.
- The Groups state carries a clone's remote at the host as its path in the instance; the Git origin stays inside the core, for the credential helper and the remote checks.

### Scenarios

[DR-103](103-the-home-and-its-groups.md)'s scenarios gain one:

| Situation | What happens |
| --- | --- |
| Set up a workshop or a team | Sign in. New group makes the workshop's group; New subgroup makes each team's; Share adds each team's people. |

## Consequences

- The eleven workshop clones keyed under the container's path move once each, by one sync: a read already lists each under the host's current heading with its key unchanged, and the sync's Check moves the clone, rewriting its pairs, session locations and sync preferences and keeping its remote and id; no move on a read is added.
- New playbook's Org default stands unchanged: with the registry answering an org's path in the instance, its prefix match against a project's key holds.
- `space` (the head, entries, collision, Git's lines, members, the pick, and the undo acts), `git-host` (the read, members, the stand-in), `storage` (folder names) and `environments` (an org's path) change; the protocol drops `groups[].url`, `Member.url` and `membersUrl`.
- The stand-in host keeps no group of its own, answers paths in the instance, lets the person create groups unless scripted otherwise, hides a scripted service identity from members, and lists a repository under another login.

## References

[1]: https://github.com/sublang-ai/spex-pub/blob/main/specs/packages/host.md "spex.pub host package"
