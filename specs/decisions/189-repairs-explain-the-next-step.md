<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-189: Repairs Explain the Next Step

## Status

Accepted (2026-11-02) for the owner's request to make the warnings after signing in understandable to fresh users.
Amends [DR-065](065-repairs-the-reader-answers.md), [DR-172](172-surfaces-a-fresh-user-reads.md).
Amended by [DR-194](194-saved-work-is-a-choice-not-setup-debt.md), [DR-246](246-remove-groups-and-team-servers-from-the-clients.md).

## Context

A first sign-in can show existing local history problems beside a project-folder repair.
“Folder missing” claimed absence even when the recorded folder existed but was not a project root.
Older-session import failures exposed paths and implementation terms without guidance, and an absent project folder could produce the same failure as invalid older session metadata.

## Decision

- Amends [DR-065](065-repairs-the-reader-answers.md) and [DR-172](172-surfaces-a-fresh-user-reads.md) in repair wording and storage-failure presentation, without changing folder pairing, dismissal or data preservation.
- A recorded folder checked as absent is named as not found; an unknown check claims no absence.
- A recorded folder that exists but is not a project root asks for the project's Git folder, not its parent.
- The core identifies an older session's failed import at the operation that reports it, with a code saying whether it needs a project folder, could not be imported, or could not be upgraded; the interface never infers a cause from technical error prose.
- Every remaining storage diagnostic shows a plain summary and next step, with its file and original reason inside collapsed Technical details; no automatic recovery or corruption is claimed.

## Consequences

The available repair actions stay the same.
English and Chinese carry the same explanations.
The diagnostic protocol carries an optional code without changing existing consumers or storage operations.
