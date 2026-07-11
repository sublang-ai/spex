<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# RUN: Run View Acceptance Tests

## Intent

This spec defines required integration coverage for the project
session run view. Coverage replays recorded record-stream fixtures
through the WebSocket protocol of
[DR-002](../decisions/002-desktop-app-architecture.md), exercising
the record-driven rendering contract of
[DR-003](../decisions/003-runtime-reuse.md) without live agents.

## Fixture Replay Coverage

### RUN-20
Verifies: [RUN-1](../user/run-view.md#run-1), [RUN-3](../user/run-view.md#run-3), [RUN-4](../user/run-view.md#run-4), [RUN-6](../user/run-view.md#run-6), [RUN-14](../dev/run-view.md#run-14)

Where a recorded fixture stream of a completed playbook session is
replayed into the run view over the protocol, the test suite shall
assert that the rendered result matches the fixture's expectations:
the Captain pane holds the expected glyph lines in arrival order,
one pane exists per visible player, player transcripts render the
expected Markdown text, tool-use entries appear as collapsed cards,
and every completed turn with usage data shows its usage and cost.

### RUN-21
Verifies: [RUN-7](../user/run-view.md#run-7), [RUN-18](../dev/run-view.md#run-18)

Where a fixture stream contains records marked hidden (judge or
router traffic), when the fixture is replayed into the run view,
the test suite shall assert that no rendered pane contains the
hidden records' content and that no pane exists for a player
appearing only in hidden records.

## Interaction Coverage

### RUN-22
Verifies: [RUN-9](../user/run-view.md#run-9)

Where a replayed fixture stream ends in an await-Boss-reply state
carrying a player question, the test suite shall assert that the
question appears above the Boss composer and inside the asking
player's pane. When text is then submitted in the composer, the
test suite shall assert that the submission is sent over the
protocol as the reply to the waiting question — not as a new Boss
prompt — and that the question display clears.

### RUN-23
Verifies: [RUN-8](../user/run-view.md#run-8), [RUN-10](../user/run-view.md#run-10)

While a replayed fixture stream holds a turn active, when the abort
control is activated and the turn-aborted record is then delivered,
the test suite shall assert that an abort command was sent over the
protocol, that the interrupted turn shows a visible aborted marker,
and that a submission made after the abort is dispatched
immediately rather than queued.

### RUN-24
Verifies: [RUN-8](../user/run-view.md#run-8)

While a replayed fixture stream holds a turn active, when text is
submitted in the Boss composer, the test suite shall assert that
the submission is queued with a visible queued indicator and that
no Boss prompt is dispatched over the protocol. When the
turn-finished record is then delivered, the test suite shall assert
that the queued submission is dispatched and the indicator clears.

### RUN-29

Verifies: [RUN-25](../user/run-view.md#run-25),
[RUN-26](../user/run-view.md#run-26)

Where no session is live, when the Sessions surface renders with a
fixture config of one project and one playbook, the test suite
shall assert the Captain home shows the greeting with hints, the
chat composer, the project chip, and the captain identity; when
text is submitted with the project chosen, the test suite shall
assert a session is created for that project and the text is
dispatched as its first Boss turn.

### RUN-31

Verifies: [RUN-27](../user/run-view.md#run-27),
[RUN-30](../user/run-view.md#run-30)

When `/` is typed at the start of the Captain home composer, the
test suite shall assert the slash menu lists the fixture playbook
with its intent, filters as more is typed, and inserts the command
without dispatching on selection; when the quick start card is
dismissed and the view is remounted, the test suite shall assert
the card stays dismissed; when a fixture stream containing a boss
turn is replayed, the test suite shall assert the submitted text
renders as a user bubble in the Captain thread.
