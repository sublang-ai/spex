<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# RUN: Run View Implementation Requirements

## Intent

This spec defines implementation requirements for the project
session run view in the UI package of
[DR-002](../decisions/002-desktop-app-architecture.md).
The view renders exclusively from the WebSocket protocol and the
record stream it carries, per
[DR-003](../decisions/003-runtime-reuse.md).

## Protocol Boundary

### RUN-13

Where the run view renders a project session, the run view shall
consume only messages of the versioned WebSocket protocol defined in
`packages/core`
([DR-002](../decisions/002-desktop-app-architecture.md)).
The run view shall not import Node-only modules and shall not call
`@sublang/cligent` or `@sublang/playbook` APIs directly; every
record it renders arrives as a protocol message
([DR-003](../decisions/003-runtime-reuse.md)).

### RUN-14

Where the run view receives a session's ordered record stream, the
run view shall render pane structure and content as a function of the
received messages alone, so that replaying a recorded stream
reproduces an identical view with no live runtime attached.

## Transcript Rendering

### RUN-15

Where a player transcript exceeds the visible viewport, the
transcript view shall mount only the entries in and near the
viewport, keeping the mounted entry count bounded regardless of
transcript length. When the user scrolls, the transcript view shall
reveal previously unmounted entries with content identical to an
unvirtualized render.

### RUN-16

While consecutive text deltas for the same player message are
pending within one render frame, the transcript view shall coalesce
them into a single append, preserving delta order and content
byte-for-byte. The transcript view shall not merge deltas across
different messages or players.

## Captain Pane Rendering

### RUN-17

When the session record stream delivers a captain record whose kind
is outside the glyph vocabulary of
[RUN-1](../user/run-view.md#run-1), the Captain pane shall render
the record's text as a plain line rather than dropping the record.

## Pane Management

### RUN-18

When a `player_view_changed` record arrives, the pane manager shall
recompute the pane set to exactly the players the record marks
visible, creating panes for newly visible players and removing
panes for players no longer visible. The pane manager shall not
route records carrying `hidden` visibility to any pane.
