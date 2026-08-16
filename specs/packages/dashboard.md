<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# dashboard: Dashboard

## Intent

This spec defines the observable behavior, implementation constraints, and integration coverage of the Dashboard, the Spex workspace surface that aggregates what needs the Boss's attention across projects.
Attention state is derived deterministically from the session record stream and review state persisted in the app-local store, and forge data flows only through the forge adapter.
Integration coverage drives fixture record streams, persisted app-store state, and stubbed forge adapters through the core and asserts the derived Dashboard state, so that attention derivation, clearing, usage rollups, and forge lists are verified end to end rather than per unit.

## External Behavior

### Attention Queue

#### dashboard-1

While at least one of the attention conditions below holds across the registered projects' sessions, the Dashboard shall display an attention queue as its topmost section, with exactly one entry per holding condition:

| Kind | Attention condition |
| --- | --- |
| Pending Boss question | the captain awaits a Boss reply (`awaitBossReply`) |
| Permission request | a player awaits a permission decision |
| Failure | an engagement failure or runtime error is unacknowledged |
| Turn awaiting review | a Boss turn finished and its session has not been viewed since |

- Each entry shows its kind, its project and session, and a one-line summary of the condition.

#### dashboard-2

While the attention queue contains two or more entries, the Dashboard shall order them by kind precedence, and by longest waiting time first within a kind:

| Precedence | Kind |
| --- | --- |
| 1 | Permission request |
| 2 | Pending Boss question |
| 3 | Failure |
| 4 | Turn awaiting review |

#### dashboard-3

When the user activates an attention entry, the Dashboard shall open the entry's project session and focus the surface the entry originates from: the Captain pane for pending Boss questions and failures, the originating player pane for permission requests, and the session view for turns awaiting review.

#### dashboard-4

While an attention entry is displayed, when its underlying condition resolves — the question is answered by a new Boss turn, the permission request is decided or its turn ends, the failure is acknowledged, or the awaiting-review session is viewed — the Dashboard shall remove that entry without any user action on the Dashboard itself:

- Resolving one entry removes no other entry.

### Running Sessions

#### dashboard-5

While one or more project sessions are live, the Dashboard shall display a running-sessions overview listing, per session: the project name, the active playbook id (or an idle indicator when no engagement is active), a human-readable state label for the engagement's current state — tinted by the state's tone, with the raw state id in the tooltip ([DR-010](../decisions/010-interface-craft.md) §2) — and the elapsed time since the session started:

- The overview updates as session records arrive, without a manual refresh.

### Next Work

#### dashboard-6

Where a project is bound to a forge repository and the forge adapter ([DR-006](../decisions/006-projects-and-forge.md)) reports ready, the Dashboard shall display next-work lists for that project: open issues to do and open pull requests to review:

- Each list entry shows its title and number; activating it opens its canonical forge URL in the external browser.
- Each list shows the age of its data and refreshes when the user triggers a manual refresh [[dashboard-14](#dashboard-14)].

#### dashboard-24

Where a project's `specs/` tree lists intent records [[spec-view-14](spec-view.md#spec-view-14)], the Dashboard shall carry the project's intents in its next-work lists beside the forge lists [[dashboard-6](#dashboard-6)], because an intent record is work to finish, not spec law ([DR-027](../decisions/027-linked-views-contract.md)):

- each entry names the record's ID and title; activating it opens that record in the project's Specs surface's records reader [[spec-view-7](spec-view.md#spec-view-7)];
- the list shows the age of its data and refreshes when the user triggers a manual refresh;
- a project whose tree lists no intents contributes no intents list.

### Usage

#### dashboard-7

Where completed turns have reported usage, the Dashboard shall display usage and cost rollups aggregated per session and per calendar day, with per-day totals spanning all projects:

- The rollups reflect only usage reported by adapter done payloads [[dashboard-13](#dashboard-13)]; the Dashboard displays no estimated figures for turns that reported none.

### Empty States

#### dashboard-8

While a Dashboard section has no content, the Dashboard shall display guidance in place of that section's content, and shall not render the section blank:

| Section | Empty condition | Guidance |
| --- | --- | --- |
| Attention queue | no attention condition holds | an all-clear indication |
| Running sessions | no live session | how to start a session, with a navigation control to the Workspace |
| Next work | no bound project, or forge adapter not ready | a plain-language note with a navigation control to the Workspace, whose Repo tab is where GitHub is connected ([DR-006](../decisions/006-projects-and-forge.md)) |
| Usage | no recorded usage | a statement that no usage has been recorded yet |

### Attention Badge

#### dashboard-9

The Dashboard shall publish an attention count equal to the number of entries in the attention queue, for consumers such as the desktop shell's dock badge ([DR-002](../decisions/002-desktop-app-architecture.md)):

- When the queue changes, the published count updates to the new queue size.

### Work-List Organization

#### dashboard-20

When the next-work lists render with items from more than one project, the Dashboard shall group issues and pull requests by project with per-project counts, order items within each group by update recency, and show each item's labels:

- When the user selects a project filter, the Dashboard shows only that project's items until the filter is cleared.

### No Takeover

#### dashboard-21

While no project is registered, the Dashboard shall still render its sections with their per-section empty states [[dashboard-8](#dashboard-8)] and shall not replace the surface with a welcome takeover; first-run onboarding belongs to the Captain home as the single onboarding narrative ([DR-010](../decisions/010-interface-craft.md) §1).

## Internal Behavior

### Attention Derivation

#### dashboard-10

Where the core derives attention state, the attention derivation shall be a deterministic function of the session record stream and the review state persisted in the app store: identical record history and review state yield an identical attention set, independent of record arrival timing.

Attention entries enter and clear exactly as follows:

| Kind | Enters on | Clears on |
| --- | --- | --- |
| Pending Boss question | a captain record signaling `awaitBossReply` | the next Boss turn starting (`turn_started`) in the same session |
| Permission request | a player event carrying `permission_request` | a later record for the same player in the same turn, or the turn finishing or aborting |
| Failure | a `runtime_error` record or a captain failure status | a persisted acknowledgement of that failure, or the session ending |
| Turn awaiting review | a `turn_finished` record later than the session's persisted last-viewed marker | the last-viewed marker advancing past that turn |

- The attention derivation produces no attention entry from records with `hidden` visibility ([DR-003](../decisions/003-runtime-reuse.md)).
- A session carries at most one turn-awaiting-review entry: the one for its latest finished turn.

#### dashboard-11

While the app store's record history and review state are intact, when the core restarts, the attention derivation shall produce, from persisted state alone, the same attention set that was live before the restart.

### Data Sources

#### dashboard-12

Where Dashboard state is assembled, the dashboard read model shall source live-session state — attention conditions, running sessions, current engagement state ids — from the in-process record bus, and historical state — finished sessions, usage rollups, review markers — from the app-local store ([DR-004](../decisions/004-config-and-persistence.md)):

- It does not query the embedded runtime directly, and it does not reach a forge except through the forge adapter ([DR-006](../decisions/006-projects-and-forge.md)).

### Usage Rollups

#### dashboard-13

Where usage rollups are computed, the dashboard read model shall aggregate exactly the usage figures carried by player `done` events, keyed per session and per calendar day of the record timestamp in the local timezone:

- Usage carried by `hidden`-visibility records is included, since hidden traffic still incurs cost ([DR-003](../decisions/003-runtime-reuse.md)).
- A `done` event carrying no usage contributes nothing; the read model does not substitute estimates.

### Forge List Caching

#### dashboard-14

Where next-work lists are served, the dashboard read model shall serve issue and pull-request lists from a per-project cache persisted in the app store and refreshed through the forge adapter ([DR-006](../decisions/006-projects-and-forge.md)):

- While the Dashboard is displayed, a cache entry older than 10 minutes triggers a background refresh; a fresher entry triggers no adapter call.
- When the user triggers a manual refresh, the read model calls the forge adapter regardless of cache age.
- When an adapter call fails, the read model retains the last cached entries and surfaces the failure together with the data age; it does not clear cached lists on failure.

## Verification

### Attention Coverage

#### dashboard-15

Where a fixture record stream spans two project sessions and contains a player `permission_request`, a captain `awaitBossReply` question, a `runtime_error`, a `turn_finished`, and a `hidden`-visibility record, when Dashboard state is derived, the test suite shall assert that the attention queue contains exactly one entry per non-hidden condition [[dashboard-1](#dashboard-1)], that each entry identifies its source project and session, that entries follow the kind precedence of [[dashboard-2](#dashboard-2)], and that the hidden record produced no entry [[dashboard-10](#dashboard-10)].

#### dashboard-16

While the attention queue contains a pending Boss question among other entries, when the fixture stream continues with a Boss turn starting in that question's session, the test suite shall assert that the question entry is removed [[dashboard-4](#dashboard-4)], that all other entries remain [[dashboard-10](#dashboard-10)], and that the published attention count decreases by exactly one [[dashboard-9](#dashboard-9)].

#### dashboard-17

Where a fixture record stream and review state are persisted to the app store, when attention derivation is re-run from persisted state alone, as after a core restart, the test suite shall assert that the resulting attention set equals the set derived live from the same stream [[dashboard-11](#dashboard-11)].

### Usage Coverage

#### dashboard-18

Where fixture player `done` events carry usage payloads across two sessions and two calendar days, including one on a `hidden`-visibility record and one `done` event without usage, when rollups are computed, the test suite shall assert that per-session and per-day totals equal hand-computed sums of the fixture payloads [[dashboard-7](#dashboard-7)], that the hidden record's usage is included [[dashboard-13](#dashboard-13)], and that the usage-less `done` event contributes nothing.

### Forge Coverage

#### dashboard-19

Where a stubbed forge adapter returns fixture open issues and pull requests for a bound project, when the Dashboard is displayed, the test suite shall assert that the next-work lists render the fixture entries with titles and numbers [[dashboard-6](#dashboard-6)], that a manual refresh invokes the stub again, and that a stub failure on refresh leaves the previously served lists in place with the failure and data age surfaced [[dashboard-14](#dashboard-14)].

### Intents Coverage

#### dashboard-25

Where a fixture project's `specs/` tree lists intent records and a second project's tree lists none, the test suite shall assert the intents next-work lists of [[dashboard-24](#dashboard-24)]: the first project's entries render with record IDs and titles, activating one requests that record in the project's Specs surface [[dashboard-24](#dashboard-24)], and the second project shows no intents list [[dashboard-24](#dashboard-24)].

### Empty-State Coverage

#### dashboard-22

Where Dashboard state is derived with no registered project, the test suite shall assert that the Dashboard renders its sections with their empty-state guidance [[dashboard-8](#dashboard-8)] rather than a welcome takeover [[dashboard-21](#dashboard-21)], and that the next-work empty state offers an activatable navigation control to the Workspace [[dashboard-8](#dashboard-8)].

### Label Coverage

#### dashboard-23

Where a live session's view carries an engagement state id, the test suite shall assert that the running-sessions row renders the human-readable state label with the raw state id available in the tooltip [[dashboard-5](#dashboard-5)].
