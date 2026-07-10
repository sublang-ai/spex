<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DASH: Dashboard Implementation Requirements

## Intent

This spec defines implementation constraints for the Dashboard
surface of Spex
([DR-002](../decisions/002-desktop-app-architecture.md)): attention
state is derived deterministically from the session record stream
([DR-003](../decisions/003-runtime-reuse.md)) and review state
persisted in the app-local store
([DR-004](../decisions/004-config-and-persistence.md)), and forge
data flows only through the forge adapter
([DR-006](../decisions/006-projects-and-forge.md)).

## Attention Derivation

### DASH-10

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

### DASH-11

While the app store's record history and review state are intact,
when the core restarts, the attention derivation shall produce,
from persisted state alone, the same attention set that was live
before the restart.

## Data Sources

### DASH-12

Where Dashboard state is assembled, the dashboard read model shall
source live-session state — attention conditions, running sessions,
current engagement state ids — from the in-process record bus, and
historical state — finished sessions, usage rollups, review
markers — from the app-local store
([DR-004](../decisions/004-config-and-persistence.md)).
It shall not query the embedded runtime directly, and it shall not
reach a forge except through the forge adapter
([DR-006](../decisions/006-projects-and-forge.md)).

## Usage Rollups

### DASH-13

Where usage rollups are computed, the dashboard read model shall
aggregate exactly the usage figures carried by player `done`
events, keyed per session and per calendar day of the record
timestamp in the local timezone.
Usage carried by `hidden`-visibility records shall be included,
since hidden traffic still incurs cost
([DR-003](../decisions/003-runtime-reuse.md)).
A `done` event carrying no usage shall contribute nothing; the read
model shall not substitute estimates.

## Forge List Caching

### DASH-14

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
