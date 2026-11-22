<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-246: Remove Client Groups and Retire Team Servers

## Status

Proposed (2026-11-22).
On acceptance this would supersede the following decisions in full.

| Workflow | Decisions |
| --- | --- |
| Group chooser, membership and invitations | [DR-187](187-the-group-chooser-belongs-to-its-project.md), [DR-190](190-membership-with-a-clear-scope.md), [DR-191](191-invite-several-members-together.md), [DR-192](192-choose-a-group-before-adding.md) |
| Group deletion, restoration, unavailable operations and nested creation | [DR-186](186-unavailable-group-operations.md), [DR-193](193-group-deletion-follows-the-space-policy.md), [DR-203](203-groups-within-groups-and-deletion-review.md) |
| Multi-core IDE and Open on a server | [DR-133](133-one-desktop-over-several-cores.md), [DR-210](210-open-on-a-server-without-an-acknowledgement.md) |
| Team servers and seats, ticket sign-in, shared subscriptions, lease sweep and privileged CI lane | [DR-132](132-team-servers.md), [DR-164](164-the-seat-signs-in-on-its-ticket.md), [DR-201](201-shared-codex-subscription-access.md), [DR-148](148-a-lapsed-seat-is-stopped-by-a-sweep.md), [DR-149](149-the-privileged-lane-runs-on-ci.md) |

Other decisions would receive scoped amendments.

| Affected scope | Decisions |
| --- | --- |
| Group work destinations, member labels and client listings. Personal account setup, attribution and second-device sync continue. | [DR-103](103-the-home-and-its-groups.md), [DR-106](106-groups-after-a-restart-and-a-host-sign-out.md), [DR-114](114-groups-and-sharing-from-spex.md), [DR-120](120-the-instance-is-the-space.md), [DR-127](127-a-home-signed-in-to-several-instances.md), [DR-150](150-spex-space-product-and-destination.md), [DR-171](171-personal-names-are-space-logins.md) |
| Which destinations count for sync, project removal and detachment | [DR-122](122-a-sync-reads-its-destination.md), [DR-128](128-a-spex-repository-placed-at-several-instances.md) |
| Each IDE's connection, sidebar and Dashboard return to one core | [DR-002](002-desktop-app-architecture.md), [DR-029](029-session-history-home.md), [DR-035](035-intent-ledger.md), [DR-033](033-remote-gui-serving.md) |
| Group actions, alternate opening destinations and automatic server opening. Explicit personal sync and code matching across devices continue. | [DR-159](159-projects-in-groups-opened-where-you-work.md), [DR-172](172-surfaces-a-fresh-user-reads.md), [DR-175](175-projects-shown-where-they-are-open.md), [DR-209](209-a-project-row-with-one-menu.md), [DR-213](213-public-github-code-opens-over-https.md), [DR-215](215-add-to-a-group-and-start-working.md) |
| The Playbooks place selector and the group-specific panels and dismissal controls. Player bindings still resolve by name. | [DR-176](176-global-playbooks-and-a-placed-playbook-runs.md), [DR-198](198-consistent-inline-group-actions.md), [DR-211](211-a-panel-carries-its-own-way-out.md), [DR-212](212-panel-dismissal-as-quiet-chrome.md) |
| Server-specific location wording and recovery navigation. Local Files & history continues. | [DR-189](189-repairs-explain-the-next-step.md), [DR-195](195-read-saved-conversations-before-locating-files.md), [DR-196](196-a-review-count-and-a-way-back.md), [DR-214](214-project-navigation-and-contextual-recovery.md) |
| Seat-only execution, credentials, configuration, storage checks and applet restrictions. Each home's runtime still owns its work. | [DR-134](134-execution-ownership.md), [DR-156](156-an-untouched-seed-follows-the-credentials.md), [DR-161](161-an-applet-is-a-page-the-ide-serves.md), [DR-168](168-independent-package-registry.md), [DR-204](204-workshop-agents-in-one-pass.md), [DR-205](205-agent-cards-read-alike.md), [DR-223](223-windows-storage-checks-what-macos-checks.md) |
| Group and seat examples in user guidance, and the hub lane in app validation and download caching | [DR-202](202-registry-guidance-keeps-account-scope.md), [DR-199](199-release-gated-full-validation.md), [DR-228](228-ci-keeps-its-downloads.md) |

## Context

A person can already keep project records in their own namespace at a Space and open that project on a second computer.
The published `spex` executable has no group or team-server commands, and its `--space` option lets a person sign in to a Space independently of their package registry ([DR-216](216-registry-and-space-accounts-stay-apart.md)).
Members reach a team-server seat through the IDE relay to open a group's project.
The hub's operator commands can manage seats but provide no way to work on a project.
Spex has no public users who need an upgrade path for these features.

## Decision

### Personal projects in a Space

**At each Space, a person sees only their own projects and records.**
Wherever Spex identifies the service, it names only the Space, including in replies, keys, folders and documents ([DR-120](120-the-instance-is-the-space.md)).
On acceptance, replace the workshop-and-personal-groups rule in `AGENTS.md`, `CLAUDE.md` and `GEMINI.md` with this rule.

- Space shows a flat project list for each signed-in account. Opening or creating a local project needs no Space account and opens no destination picker. To sync its records, the person chooses a Space and the IDE uses their own namespace there. On a second computer they can sign in, select the project and open it using the existing folder and records flow.
- Remove group trees, group sessions, membership and invitations, project sharing, and group choices from Space, project rows, the welcome screen and the project picker. Delete their commands and listings from the client protocol.
- Personal sessions, global settings and playbooks keep their existing storage. Space keeps sign-in, sign-out, Forget, sync conflict resolution and Files & history, including local recovery while signed out ([DR-214](214-project-navigation-and-contextual-recovery.md)).
- Sync and Explore stay attached to their project row in the flat list ([DR-225](225-bounded-surfaces-and-attached-records.md)).
- The CLI keeps `login`, `logout` and `whoami` with `--space` or `--registry`. Package installation and publishing keep their existing registry selection and credentials. CLI help, IDE guidance and their translations describe the supported workflows.

### Record sync

Discover, open and sync a Space repository only when that Space identifies it as belonging to the signed-in account's own namespace.
Each transfer uses that rule, even if a repository has moved since the last sync.
An explicitly configured non-Space records remote follows its existing rules [[space-5](../packages/space.md#space-5)].
Project removal and placement detachment may credit a copy only at a remaining destination eligible for sync.
Exclude a group destination or a Space destination whose ownership cannot be verified, even if its last sync succeeded.
Count each record for which the existing whole-record comparison finds no evidence of receipt at an eligible destination.
If the count is positive, show it and ask whether to proceed.
Detaching an ineligible destination uses the existing unread-destination confirmation without fetching records from it.
On acceptance, apply this change to project removal [[projects-9](../packages/projects.md#projects-9)] and detachment [[space-98](../packages/space.md#space-98)] and their verification.

### One core per IDE

The desktop uses its own core, and the standalone browser IDE uses the single core serving the page ([DR-033](033-remote-gui-serving.md)).
The sidebar lists that core's projects and sessions directly, the Dashboard shows its attention queue, and approvals go back to that core.
Remove team-server discovery, admission, ticket sign-in, relays and remote project opening from both IDE shells and their protocol.

Retire this repository's hub and operator command, the server shell and core seat modes, and the seat-only credential, account and lease machinery.
Remove their installer, service units, hub specification, simulations, seat-only tests and privileged CI lane, including its release gate.
The standalone single-user browser shell and its validation continue.

## Consequences

Start with a fresh Spex home if a development installation depends on Groups or team Servers.
Their records, credentials and pending work have no migration or recovery requirement.
The separate Space service continues to govern access to personal records.

Acceptance starts with two fresh homes under the same account.
A person syncs a project from the first and opens it on the second.
If the Space subsequently moves a project's repository into a group, its cached copy cannot suppress the loss warning on removal or detachment when it is the only other evidence for a record.
Neither IDE shell exposes group or team-server operations, and registry sign-in stays independent of Space sign-in.
