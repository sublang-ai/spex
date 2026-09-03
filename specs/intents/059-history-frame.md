<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-059: History in a Capped Frame

## Status

In progress.

## Intent

The Dashboard's History band stops growing the project group each time "Older…" reveals more: the rows scroll inside a frame a fixed number of rows tall, so a long history is browsed quickly in place and the groups below never move ([DR-038](../decisions/038-history-is-done-work.md)).

## Deliverables

- [ ] The History band lists every loaded row inside a frame eight rows tall that scrolls when the rows exceed it; the group's height never grows past that frame (dashboard-27).
- [ ] The next page loads from the frame's end — the control at the bottom of the scrolled list, or reaching it — so paging keeps its semantics without moving the groups below (dashboard-27).
- [ ] Unit coverage of the frame and the paging; the fit journey and the Dashboard journeys updated.

## Tasks

1. The frame and the in-frame paging control; spec item amended.
2. Tests and journeys.

## Verification

Recorded on completion.
