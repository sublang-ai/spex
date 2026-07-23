<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DASH: Dashboard

## Intent

This spec defines the observable behavior, implementation
constraints, and integration coverage of the Dashboard, the Spex
workspace surface
([DR-002](../decisions/002-desktop-app-architecture.md)) that
aggregates what needs the Boss's attention across projects.
Dashboard content derives from the session record stream
([DR-003](../decisions/003-runtime-reuse.md)), the app-local store
([DR-004](../decisions/004-config-and-persistence.md)), and the
forge adapter
([DR-006](../decisions/006-projects-and-forge.md)).
Attention state is derived deterministically from the session
record stream and review state persisted in the app-local store,
and forge data flows only through the forge adapter.
Integration coverage drives fixture record streams, persisted
app-store state, and stubbed forge adapters through the core and
asserts the derived Dashboard state, so that attention derivation,
clearing, usage rollups, and forge lists are verified end to end
rather than per unit.

## External Behavior

### Attention Queue

#### DASH-1

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

#### DASH-2

While the attention queue contains two or more entries, the
Dashboard shall order them by kind precedence, and by longest
waiting time first within a kind:

| Precedence | Kind |
| --- | --- |
| 1 | Permission request |
| 2 | Pending Boss question |
| 3 | Failure |
| 4 | Turn awaiting review |

#### DASH-3

When the user activates an attention entry, the Dashboard shall
open the entry's project session and focus the surface the entry
originates from: the Captain pane for pending Boss questions and
failures, the originating player pane for permission requests, and
the session view for turns awaiting review.

#### DASH-4

While an attention entry is displayed, when its underlying
condition resolves — the question is answered by a new Boss turn,
the permission request is decided or its turn ends, the failure is
acknowledged, or the awaiting-review session is viewed — the
Dashboard shall remove that entry without any user action on the
Dashboard itself.
Resolving one entry shall not remove any other entry.

### Running Sessions

#### DASH-5

While one or more project sessions are live, the Dashboard shall
display a running-sessions overview listing, per session: the
project name, the active playbook id (or an idle indicator when no
engagement is active), a human-readable state label for the
engagement's current state — tinted by the state's tone, with the
raw state id in the tooltip
([DR-010](../decisions/010-interface-craft.md) §2) — and the
elapsed time since the session started.
The overview shall update as session records arrive, without a
manual refresh.

### Next Work

#### DASH-6

Where a project is bound to a forge repository and the forge
adapter ([DR-006](../decisions/006-projects-and-forge.md)) reports
ready, the Dashboard shall display next-work lists for that
project: open issues to do and open pull requests to review.
Each list entry shall show its title and number, and activating it
shall open its canonical forge URL in the external browser.
Each list shall show the age of its data, and the Dashboard shall
refresh a list when the user triggers a manual refresh (see
[DASH-14](#dash-14)).

### Usage

#### DASH-7

Where completed turns have reported usage, the Dashboard shall
display usage and cost rollups aggregated per session and per
calendar day, with per-day totals spanning all projects.
The rollups shall reflect only usage reported by adapter done
payloads (see [DASH-13](#dash-13)); the
Dashboard shall not display estimated figures for turns that
reported none.

### Empty States

#### DASH-8

While a Dashboard section has no content, the Dashboard shall
display guidance in place of that section's content, and shall not
render the section blank:

| Section | Empty condition | Guidance |
| --- | --- | --- |
| Attention queue | no attention condition holds | an all-clear indication |
| Running sessions | no live session | how to start a session, with a navigation control to the Sessions surface |
| Next work | no bound project, or forge adapter not ready | a plain-language note with a navigation control to the Projects surface, where GitHub is connected ([DR-006](../decisions/006-projects-and-forge.md)) |
| Usage | no recorded usage | a statement that no usage has been recorded yet |

### Attention Badge

#### DASH-9

The Dashboard shall publish an attention count equal to the number
of entries in the attention queue, for consumers such as the
desktop shell's dock badge
([DR-002](../decisions/002-desktop-app-architecture.md)).
When the queue changes, the published count shall update to the new
queue size.

### Work-List Organization

#### DASH-20

When the next-work lists render with items from more than one
project, the Dashboard shall group issues and pull requests by
project with per-project counts, order items within each group by
update recency, and show each item's labels. When the user selects
a project filter, the Dashboard shall show only that project's
items until the filter is cleared.

### No Takeover

#### DASH-21

While no project is registered, the Dashboard shall still render
its sections with their per-section empty states
([DASH-8](#dash-8)) and shall not replace the surface with a
welcome takeover; first-run onboarding belongs to the Captain home
as the single onboarding narrative
([DR-010](../decisions/010-interface-craft.md) §1).

## Internal Behavior

### Attention Derivation

#### DASH-10

Where the core derives attention state, the attention derivation
shall be a deterministic function of the session record stream and
the review state persisted in the app store: identical record
history and review state shall yield an identical attention set,
independent of record arrival timing.
The attention derivation shall produce no attention entry from
records with `hidden` visibility
([DR-003](../decisions/003-runtime-reuse.md)).
Attention entries shall enter and clear exactly as follows:

| Kind | Enters on | Clears on |
| --- | --- | --- |
| Pending Boss question | a captain record signaling `awaitBossReply` | the next Boss turn starting (`turn_started`) in the same session |
| Permission request | a player event carrying `permission_request` | a later record for the same player in the same turn, or the turn finishing or aborting |
| Failure | a `runtime_error` record or a captain failure status | a persisted acknowledgement of that failure, or the session ending |
| Turn awaiting review | a `turn_finished` record later than the session's persisted last-viewed marker | the last-viewed marker advancing past that turn |

A session shall carry at most one turn-awaiting-review entry: the
one for its latest finished turn.

#### DASH-11

While the app store's record history and review state are intact,
when the core restarts, the attention derivation shall produce,
from persisted state alone, the same attention set that was live
before the restart.

### Data Sources

#### DASH-12

Where Dashboard state is assembled, the dashboard read model shall
source live-session state — attention conditions, running sessions,
current engagement state ids — from the in-process record bus, and
historical state — finished sessions, usage rollups, review
markers — from the app-local store
([DR-004](../decisions/004-config-and-persistence.md)).
It shall not query the embedded runtime directly, and it shall not
reach a forge except through the forge adapter
([DR-006](../decisions/006-projects-and-forge.md)).

### Usage Rollups

#### DASH-13

Where usage rollups are computed, the dashboard read model shall
aggregate exactly the usage figures carried by player `done`
events, keyed per session and per calendar day of the record
timestamp in the local timezone.
Usage carried by `hidden`-visibility records shall be included,
since hidden traffic still incurs cost
([DR-003](../decisions/003-runtime-reuse.md)).
A `done` event carrying no usage shall contribute nothing; the read
model shall not substitute estimates.

### Forge List Caching

#### DASH-14

Where next-work lists are served, the dashboard read model shall
serve issue and pull-request lists from a per-project cache
persisted in the app store and refreshed through the forge adapter
([DR-006](../decisions/006-projects-and-forge.md)):

- While the Dashboard is displayed, a cache entry older than 10
  minutes shall trigger a background refresh; a fresher entry shall
  trigger no adapter call.
- When the user triggers a manual refresh, the read model shall
  call the forge adapter regardless of cache age.
- When an adapter call fails, the read model shall retain the last
  cached entries and surface the failure together with the data
  age; it shall not clear cached lists on failure.

## Verification

### Attention Coverage

#### DASH-15
Verifies [DASH-1](#dash-1), [DASH-2](#dash-2), [DASH-10](#dash-10).

Where a fixture record stream spans two project sessions and
contains a player `permission_request`, a captain `awaitBossReply`
question, a `runtime_error`, a `turn_finished`, and a
`hidden`-visibility record, when Dashboard state is derived, the
test suite shall assert that the attention queue contains exactly
one entry per
non-hidden condition, that each entry identifies its source project
and session, that entries follow the kind precedence of
[DASH-2](#dash-2), and that the hidden record
produced no entry.

#### DASH-16
Verifies [DASH-4](#dash-4), [DASH-9](#dash-9), [DASH-10](#dash-10).

While the attention queue contains a pending Boss question among
other entries, when the fixture stream continues with a Boss turn
starting in that question's session, the test suite shall assert
that the question entry is removed, that all other entries remain,
and that the published attention count decreases by exactly one.

#### DASH-17
Verifies [DASH-11](#dash-11).

Where a fixture record stream and review state are persisted to the
app store, when attention derivation is re-run from persisted state
alone, as after a core restart, the test suite shall assert that
the resulting attention set equals the set derived live from the
same stream.

### Usage Coverage

#### DASH-18
Verifies [DASH-7](#dash-7), [DASH-13](#dash-13).

Where fixture player `done` events carry usage payloads across two
sessions and two calendar days, including one on a
`hidden`-visibility record and one `done` event without usage, when
rollups are computed, the test suite shall assert that per-session
and per-day totals equal hand-computed sums of the fixture
payloads, that the hidden record's usage is included, and that the
usage-less `done` event contributes nothing.

### Forge Coverage

#### DASH-19
Verifies [DASH-6](#dash-6), [DASH-14](#dash-14).

Where a stubbed forge adapter returns fixture open issues and pull
requests for a bound project, when the Dashboard is displayed,
the test suite shall assert that the next-work lists render the
fixture entries with titles and numbers, that a manual refresh
invokes the stub again, and that a stub failure on refresh leaves
the previously served lists in place with the failure and data age
surfaced.

### Empty-State and Label Coverage

#### DASH-22

Verifies [DASH-5](#dash-5),.
[DASH-8](#dash-8),
[DASH-21](#dash-21)

Where Dashboard state is derived with no registered project, the
test suite shall assert that the Dashboard renders its sections
with their empty-state guidance rather than a welcome takeover,
and that the next-work empty state offers an activatable
navigation control to the Projects surface. Where a live session's
view carries an engagement state id, the test suite shall assert
that the running-sessions row renders the human-readable state
label with the raw state id available in the tooltip.
