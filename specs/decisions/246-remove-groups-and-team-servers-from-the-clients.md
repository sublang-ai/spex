<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-246: Remove Groups and Team Servers from the CLI and IDE

## Status

Proposed (2026-11-22).
On acceptance this would supersede the following client workflows in full.

| Workflow | Decisions |
| --- | --- |
| Group chooser, membership and invitations | [DR-187](187-the-group-chooser-belongs-to-its-project.md), [DR-190](190-membership-with-a-clear-scope.md), [DR-191](191-invite-several-members-together.md), [DR-192](192-choose-a-group-before-adding.md) |
| Group deletion, restoration, unavailable operations and nested creation | [DR-186](186-unavailable-group-operations.md), [DR-193](193-group-deletion-follows-the-space-policy.md), [DR-203](203-groups-within-groups-and-deletion-review.md) |
| Multi-core IDE and Open on a server | [DR-133](133-one-desktop-over-several-cores.md), [DR-210](210-open-on-a-server-without-an-acknowledgement.md) |

Other decisions would receive scoped amendments.

| Affected scope | Decisions |
| --- | --- |
| Group work destinations, membership controls and client listings. Personal account setup and second-device sync continue. | [DR-103](103-the-home-and-its-groups.md), [DR-106](106-groups-after-a-restart-and-a-host-sign-out.md), [DR-114](114-groups-and-sharing-from-spex.md), [DR-120](120-the-instance-is-the-space.md), [DR-127](127-a-home-signed-in-to-several-instances.md) |
| Which destinations count for sync, project removal and detachment | [DR-122](122-a-sync-reads-its-destination.md), [DR-128](128-a-spex-repository-placed-at-several-instances.md) |
| Group actions, alternate server destinations and place selection for recovery. The records panel and local recovery continue. | [DR-159](159-projects-in-groups-opened-where-you-work.md), [DR-172](172-surfaces-a-fresh-user-reads.md), [DR-175](175-projects-shown-where-they-are-open.md), [DR-198](198-consistent-inline-group-actions.md), [DR-209](209-a-project-row-with-one-menu.md), [DR-214](214-project-navigation-and-contextual-recovery.md) |
| Client admission, ticket handoff and the automatic server open after adding a project to a group. A person's explicit sync still authorizes the transfer. | [DR-132](132-team-servers.md), [DR-164](164-the-seat-signs-in-on-its-ticket.md), [DR-215](215-add-to-a-group-and-start-working.md) |

## Context

A person can already keep project records in their own namespace at a Space and open that project on a second computer.
The published `spex` executable has no group or team-server commands, and its `--space` option lets a person sign in to a Space independently of their package registry ([DR-216](216-registry-and-space-accounts-stay-apart.md)).
The core reconnects saved team servers at startup even when the Space page is closed.
A records sync visits every attached destination, so it can still send new records to a group omitted from that page [[space-12](../packages/space.md#space-12)].

## Decision

### Personal projects in a Space

- Space shows a flat project list for each signed-in account. Opening or creating a local project needs no Space account and opens no destination picker. To sync its records, the person chooses a Space and the IDE uses their own namespace there. On a second computer they can sign in, select the project and open it using the existing folder and records flow.
- Remove group trees, group sessions as a work destination, membership and invitation controls, project sharing, and group choices from Space, project rows, the welcome screen and the project picker. The client protocol omits those listings and rejects requests to manage groups or members, join another account's project, or place records in a group.
- Personal sessions, global settings and playbooks keep their existing storage. Space keeps sign-in, sign-out, Forget, sync conflict resolution and Files & history, including local recovery while signed out ([DR-214](214-project-navigation-and-contextual-recovery.md)).
- The CLI keeps `login`, `logout` and `whoami` with `--space` or `--registry`. Package installation and publishing keep their existing registry selection and credentials. CLI help, IDE guidance and their translations describe the supported workflows.

### Existing records and destinations

A Space placement is eligible for discovery, joining or sync only when the Space identifies the repository as belonging to the signed-in account's own namespace.
A stored path, matching login text or permission to write a repository is insufficient.
Apply this rule to each Space destination before transferring records, including retries and the final catch-up pass of a multi-destination sync.
If ownership cannot be verified, leave that destination idle and report that its sync did not complete.
An explicitly configured non-Space records remote keeps its existing sync rules [[space-5](../packages/space.md#space-5)].
A known Space destination is subject to the ownership check under any remote name.

Opening an existing home preserves project identities, working folders, record locations and placement metadata.
A project formerly placed in a group remains usable from its local copy, with its locally held history readable.
Conversations stored for a former group itself open as read-only history, and its queued intents cannot start.
The upgrade neither transfers those records to a new personal destination nor changes who can read the existing remote copy.
Where a clone already has both a personal and a group placement, only the eligible placement participates in Space sync.

Removing a project counts a record as having reached another destination only if that destination is eligible under the same rule [[projects-9](../packages/projects.md#projects-9)].
Detaching a placement counts copies at the remaining eligible destinations by the same rule [[space-98](../packages/space.md#space-98)].
An ineligible destination being detached uses the existing unread-destination confirmation without fetching from it.
Both checks use the existing whole-record comparison and count again if the records, destinations or evidence of eligibility change before the count is used.
If any records lack that evidence, the existing extra confirmation reports how many could not be confirmed at a usable destination and lets the person cancel or proceed, including offline.

### One core per IDE

The desktop uses its own core, and the standalone browser IDE uses the single core serving the page ([DR-033](033-remote-gui-serving.md)).
Remove team-server discovery, admission, sign-in, relays and remote project opening from the IDE and its client protocol, including indirect entry points in navigation, Settings, Dashboard and approvals.
Startup ignores remembered server connections and unfinished group uploads or server opens.
An available local copy of a former server session stays readable, and execution of sessions and intents stays with the originally assigned runtime ([DR-134](134-execution-ownership.md)).

An operator can serve seats, enforce leases, evict a seat and retire a deployment's credentials independently of either IDE.
Keep the hub, the seat modes of the server shell and core, their operating contract and the privileged CI lane that checks them ([DR-148](148-a-lapsed-seat-is-stopped-by-a-sweep.md), [DR-149](149-the-privileged-lane-runs-on-ci.md), [DR-201](201-shared-codex-subscription-access.md)).

## Consequences

People can still sync their own project records between devices.
Projects available only through a group and work held only on a team server become inaccessible through these clients.
Existing permissions on personal records still apply, including access previously granted to another person.
Both IDE shells enforce the removal at their core's client protocol.
Other consumers can continue to use the published library through its own entry points.
The change needs no home migration or change to the separate Space service.

Acceptance covers two devices syncing and opening a personal project, independent Space and registry CLI accounts, and an older home with a mixed-placement clone and a saved server connection.
In that home, a sync reaches the personal copy without fetching or pushing the group copy, and neither a restart nor an old client command can reopen a team server or resume a group upload.
Removal and detachment each ask before proceeding when a record's only other copy reached a former group or an unverified destination, and credit the same record when it reached an eligible destination that will remain.
Local history and folder recovery still work.
