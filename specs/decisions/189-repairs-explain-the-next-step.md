<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-189: Repairs Explain the Next Step

## Status

Amended by [DR-194](194-saved-work-is-a-choice-not-setup-debt.md): optional saved-work recovery replaces the repair list’s connection language and urgency, related imports form one task and folder choice retries them without a restart; structured causes and preservation stand.

Accepted (2026-11-02) for the owner's request to make the warnings after signing in understandable to fresh users.
Amends [DR-172](172-surfaces-a-fresh-user-reads.md) in the repair wording: an unconnected project folder is not described as missing, and storage failures carry a next step with their technical evidence behind Details.
Extends [DR-063](063-space-setup-and-repair.md) without changing folder pairing, import, acknowledgement or data preservation.

## Context

A first sign-in can show existing local history problems beside a project-folder repair.
“Folder missing” claims absence even when the recorded folder exists but is not a project root.
“Kept on this computer only; never synced” fails to name the folder location as its subject.
Older-session import failures expose paths and implementation terms without guidance, and an absent project folder can produce the same failure as invalid older session metadata.

## Decision

- An unpaired project's row reads “Project folder not connected on this computer”, naming the server instead where applicable.
- A recorded folder checked as absent is named as not found; an unknown check claims no absence.
- A recorded folder that exists but is not a project root asks for the project's Git folder, not its parent; the editor names the project folder and states that only its location is saved on this computer.
- “Not on this computer” explains in its tooltip that it sets aside the reminder and keeps saved sessions.
- An older session's failed import reads “Older session not imported”; one known to need a project folder reads “Older session needs a project folder”, asking the reader on this computer to choose it and restart Spex; on a server, it asks for help recovering the session instead.
- Other import failures ask the reader to share Details for help recovering the session; no automatic recovery or corruption is claimed.
- Every remaining storage diagnostic shows a plain summary and next step, with its file and original reason inside collapsed Details; a blocking diagnostic says “Needs repair before continuing”, and a nonblocking one says “Other work can continue”.
- The core identifies older-session cases at the operation that reports them; the interface never infers a cause from technical error prose.

## Consequences

The issue count and available repair actions stay the same.
English and Chinese carry the same explanations.
The diagnostic protocol gains an optional code without changing existing consumers or storage operations.
