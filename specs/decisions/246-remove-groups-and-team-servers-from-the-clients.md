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
Spex has no public users who need an upgrade path for these features.

## Decision

### Personal projects in a Space

- Space shows a flat project list for each signed-in account. Opening or creating a local project needs no Space account and opens no destination picker. To sync its records, the person chooses a Space and the IDE uses their own namespace there. On a second computer they can sign in, select the project and open it using the existing folder and records flow.
- Remove group trees, group sessions, membership and invitations, project sharing, and group choices from Space, project rows, the welcome screen and the project picker. Delete their commands and listings from the client protocol.
- Personal sessions, global settings and playbooks keep their existing storage. Space keeps sign-in, sign-out, Forget, sync conflict resolution and Files & history, including local recovery while signed out ([DR-214](214-project-navigation-and-contextual-recovery.md)).
- The CLI keeps `login`, `logout` and `whoami` with `--space` or `--registry`. Package installation and publishing keep their existing registry selection and credentials. CLI help, IDE guidance and their translations describe the supported workflows.

### Record sync

Discover, open and sync a Space repository only when that Space identifies it as belonging to the signed-in account's own namespace.
Each transfer uses that rule, even if a repository has moved since the last sync.
An explicitly configured non-Space records remote follows its existing rules [[space-5](../packages/space.md#space-5)].
Removing a project or detaching a destination uses the existing loss confirmation for records whose transfer to a remaining eligible destination cannot be confirmed [[projects-9](../packages/projects.md#projects-9)] [[space-98](../packages/space.md#space-98)].

### One core per IDE

The desktop uses its own core, and the standalone browser IDE uses the single core serving the page ([DR-033](033-remote-gui-serving.md)).
Remove team-server discovery, admission, sign-in, relays and remote project opening from the IDE and its client protocol, including indirect entry points in navigation, Settings, Dashboard and approvals.
Removing the relay also removes its startup reconnect and pending-open flows.

An operator can serve seats, enforce leases, evict a seat and retire a deployment's credentials independently of either IDE.
Keep the hub, the seat modes of the server shell and core, their operating contract and the privileged CI lane that checks them ([DR-148](148-a-lapsed-seat-is-stopped-by-a-sweep.md), [DR-149](149-the-privileged-lane-runs-on-ci.md), [DR-201](201-shared-codex-subscription-access.md)).

## Consequences

Start with a fresh Spex home if a development installation depends on Groups or team Servers.
Their records, credentials and pending work have no migration or recovery requirement.
The separate Space service continues to govern access to personal records.

Acceptance starts with two fresh homes under the same account.
A person syncs a project from the first and opens it on the second.
Neither IDE shell exposes group or team-server operations, and registry sign-in stays independent of Space sign-in.
