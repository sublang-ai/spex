<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-085: Boss talks through Captain

## Status

Accepted.
Amends [DR-003](003-runtime-reuse.md), [DR-010](010-interface-craft.md), [DR-035](035-intent-ledger.md), [DR-041](041-chrome-that-fits.md).
Amended by [DR-088](088-playbook-17-slc-0-12-cligent-0-27-adoption.md), [DR-097](097-media-and-browser-tools-across-hosts.md).

## Context

Boss must understand and answer through Captain alone.
Raw player questions can be unclear, and queued text can accidentally answer a question that had not yet arrived.

## Decision

Playbook's Captain owns the wording of player requests and the routing of Boss messages, each carrying the Boss's exact text with any attachments beside it ([DR-097](097-media-and-browser-tools-across-hosts.md)).
The desktop displays Captain's replies without creating a second question from raw runtime data.
It uses current pending questions only to show that an answer is waiting, including parallel questions.
While a turn runs, the composer and Send are disabled, with drafts preserved and Abort available.
Between turns Boss may answer or ask Captain for clarification; neither a submission nor Captain's reply clears the wait.
Only a runtime report that the question is gone clears it, the parked run's ending within a turn ([DR-073](073-letting-go-ends-the-parked-run.md)) among them.

This amends question presentation in [DR-003](003-runtime-reuse.md) and [DR-010](010-interface-craft.md), active-turn input in [DR-041](041-chrome-that-fits.md), and what clears a session question in [DR-035](035-intent-ledger.md): the runtime's report, never the next Boss turn.

## Consequences

Player panes remain read-only and optional.
A hermetic browser journey proves the relay: a real shell's player question reaches the Boss as the Captain's reply alone ([DR-088](088-playbook-17-slc-0-12-cligent-0-27-adoption.md)).
A late busy rejection preserves the draft instead of queueing it.
Existing saved queued messages remain visible, but do not automatically answer a waiting question.
