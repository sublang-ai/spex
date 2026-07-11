<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DASH: User-Facing Dashboard Behavior

## Intent

This spec defines user-visible behavior of the Dashboard, the Spex
workspace surface
([DR-002](../decisions/002-desktop-app-architecture.md)) that
aggregates what needs the Boss's attention across projects.
Dashboard content derives from the session record stream
([DR-003](../decisions/003-runtime-reuse.md)), the app-local store
([DR-004](../decisions/004-config-and-persistence.md)), and the
forge adapter
([DR-006](../decisions/006-projects-and-forge.md)).

## Attention Queue

### DASH-1

While at least one of the attention conditions below holds across
the registered projects' sessions, the Dashboard shall display an
attention queue as its topmost section, with exactly one entry per
holding condition:

| Kind | Attention condition |
| --- | --- |
| Pending Boss question | the captain awaits a Boss reply (`awaitBossReply`) |
| Permission request | a player awaits a permission decision |
| Failure | an engagement failure or runtime error is unacknowledged |
| Turn awaiting review | a Boss turn finished and its session has not been viewed since |

Each entry shall show its kind, its project and session, and a
one-line summary of the condition.

### DASH-2

While the attention queue contains two or more entries, the
Dashboard shall order them by kind precedence, and by longest
waiting time first within a kind:

| Precedence | Kind |
| --- | --- |
| 1 | Permission request |
| 2 | Pending Boss question |
| 3 | Failure |
| 4 | Turn awaiting review |

### DASH-3

When the user activates an attention entry, the Dashboard shall
open the entry's project session and focus the surface the entry
originates from: the Captain pane for pending Boss questions and
failures, the originating player pane for permission requests, and
the session view for turns awaiting review.

### DASH-4

While an attention entry is displayed, when its underlying
condition resolves — the question is answered by a new Boss turn,
the permission request is decided or its turn ends, the failure is
acknowledged, or the awaiting-review session is viewed — the
Dashboard shall remove that entry without any user action on the
Dashboard itself.
Resolving one entry shall not remove any other entry.

## Running Sessions

### DASH-5

While one or more project sessions are live, the Dashboard shall
display a running-sessions overview listing, per session: the
project name, the active playbook id (or an idle indicator when no
engagement is active), the engagement's current state id, and the
elapsed time since the session started.
The overview shall update as session records arrive, without a
manual refresh.

## Next Work

### DASH-6

Where a project is bound to a forge repository and the forge
adapter ([DR-006](../decisions/006-projects-and-forge.md)) reports
ready, the Dashboard shall display next-work lists for that
project: open issues to do and open pull requests to review.
Each list entry shall show its title and number, and activating it
shall open its canonical forge URL in the external browser.
Each list shall show the age of its data, and the Dashboard shall
refresh a list when the user triggers a manual refresh (see
[DASH-14](../dev/dashboard.md#dash-14)).

## Usage

### DASH-7

Where completed turns have reported usage, the Dashboard shall
display usage and cost rollups aggregated per session and per
calendar day, with per-day totals spanning all projects.
The rollups shall reflect only usage reported by adapter done
payloads (see [DASH-13](../dev/dashboard.md#dash-13)); the
Dashboard shall not display estimated figures for turns that
reported none.

## Empty States

### DASH-8

While a Dashboard section has no content, the Dashboard shall
display guidance in place of that section's content, and shall not
render the section blank:

| Section | Empty condition | Guidance |
| --- | --- | --- |
| Attention queue | no attention condition holds | an all-clear indication |
| Running sessions | no live session | how to start a session from a project |
| Next work | no bound project, or forge adapter not ready | forge setup steps per [DR-006](../decisions/006-projects-and-forge.md) |
| Usage | no recorded usage | a statement that no usage has been recorded yet |

## Attention Badge

### DASH-9

The Dashboard shall publish an attention count equal to the number
of entries in the attention queue, for consumers such as the
desktop shell's dock badge
([DR-002](../decisions/002-desktop-app-architecture.md)).
When the queue changes, the published count shall update to the new
queue size.

## Work-List Organization

### DASH-20

When the next-work lists render with items from more than one
project, the Dashboard shall group issues and pull requests by
project with per-project counts, order items within each group by
update recency, and show each item's labels. When the user selects
a project filter, the Dashboard shall show only that project's
items until the filter is cleared.
