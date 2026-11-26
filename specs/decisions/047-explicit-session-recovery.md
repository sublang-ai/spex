<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-047: Explicit Session Recovery

## Status

Accepted (2026-09-05).
Amends [DR-045](045-unified-session-storage.md).
Amended by [DR-060](060-failed-workflow-control.md), [DR-088](088-playbook-17-slc-0-12-cligent-0-27-adoption.md), [DR-134](134-execution-ownership.md).

## Context

Playbook already offers explicit CLI recovery for interrupted turns.
Shared storage must make the same recovery available in desktop without making normal submission retry uncertain work.

## Decision

- Amends [DR-045](045-unified-session-storage.md) with desktop access to uncertain-turn recovery.
- Expose Restore and Discard for uncertain sessions on the session's assigned runtime alone ([DR-134](134-execution-ownership.md)), whichever interface wrote them.
- Restore opens the session in Playbook's recover mode and runs one turn that restores the saved position and reports what was recorded, repeating nothing ([DR-088](088-playbook-17-slc-0-12-cligent-0-27-adoption.md)).
- Discard restores the preceding settled checkpoint, offered only where Playbook's discard predicate holds; a never-settled fresh session may be removed under that same rule.
- Both operations use Playbook's exclusive session lease and recovery lifecycle. Discard loads no agents or configuration.
- Show the saved input, and Discard's consequences before its confirmation; preserve history and the refusal reason when recovery is unsafe.
- Block normal submissions and queued sends until uncertainty is resolved.
- A workflow parked in its recoverable failure state, which never stands with uncertainty, has its own control ([DR-060](060-failed-workflow-control.md)).

## Consequences

Desktop and CLI share recovery decisions and effect evidence.
Discard cannot undo external work, and Restore repeats no effects.
