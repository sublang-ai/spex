<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-085: Boss talks through Captain

## Status

Accepted; amends question presentation in [DR-010](010-interface-craft.md) and active-turn input in [DR-041](041-chrome-that-fits.md).
Amends [DR-035](035-intent-ledger.md), which remains accepted, in what clears a session question: the runtime's report that the question is gone, never the next Boss turn; the parked run's ending within a turn ([DR-073](073-letting-go-ends-the-parked-run.md)) still clears it.

## Context

Boss must understand and answer through Captain alone.
Raw player questions can be unclear, and queued text can accidentally answer a question that had not yet arrived.

## Decision

Playbook's Captain owns the wording of player requests and the routing of Boss messages.
The desktop displays Captain's replies without creating a second question from raw runtime data.
It uses current pending questions only to show that an answer is waiting, including parallel questions.
While a turn runs, the composer and Send are disabled, with drafts preserved and Abort available.
Between turns Boss may answer or ask Captain for clarification; neither a submission nor Captain's reply clears the wait.
Only a runtime report that the question is gone clears it.

## Consequences

Player panes remain read-only and optional.
A late busy rejection preserves the draft instead of queueing it.
Existing saved queued messages remain visible, but do not automatically answer a waiting question.
