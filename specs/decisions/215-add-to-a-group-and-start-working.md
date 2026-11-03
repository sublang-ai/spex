<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-215: Add to a Group and Start Working

## Status

Accepted (2026-11-03) on the owner's request to remove the remaining sharing confirmation and complete adding, uploading and server opening without another click, with a checklist of real progress.
Amends [DR-103](103-the-home-and-its-groups.md) and [DR-128](128-a-spex-repository-placed-at-several-instances.md) in first-send acknowledgement, [DR-192](192-choose-a-group-before-adding.md) in the destination review and committing action, and [DR-159](159-projects-in-groups-opened-where-you-work.md) and [DR-210](210-open-on-a-server-without-an-acknowledgement.md) in opening the group's server as part of adding the project.

## Context

Adding a project to a group could stop at Waiting for you to continue, with Share and Cancel elsewhere on the page.
After sharing completed, opening the project's server still required a separate command from its overflow.
The member had already chosen to add the project to that group; repeating that decision and finding another opening action did not help them reach their work.

## Decision

- Add to group, Connect project, Place, Attach and Sync authorize the records they name without a separate sharing acknowledgement or remembered acceptance.
  First and later sends use the same normal permission and transport checks.
  An attached destination left unpublished by the former gate resumes its ordinary sync while idle, without replacing real errors or conflict choices.
  A paired project recovered this way also continues to its sole matching group server, retaining that pending intent if upload finishes before the server listing arrives; already-published projects are not opened automatically.
- The group form retains its named destination and one committing action, with no repeated sharing warning.
  It names the group's available server and also opens the project there after its records are available.
  A single server is selected automatically; several are chosen in that same form; none leaves the project on this computer.
  Servers are those the member may open at the selected Space whose group is the destination group or an ancestor.
- One accepted action continues through the actual upload, server connection, sign-in and project opening, following the working folder when adding changes its records key.
  Existing connection and join flows are reused; reading a page never starts unrelated projects.
  The project appears in the server's sidebar group when that server actually lists it, with no second Open command.
- A compact inline checklist shows Add to group, Upload records, Connect to server and Open project.
  Each check follows its observed result; active work is distinguished from completed and waiting steps.
  The completed checklist remains available to review and dismiss.
  A failure names the affected step and its cause, with retry; genuine permissions, missing credentials and records conflicts keep their existing ways forward.
- Legacy acknowledgement parameters and stored preferences are inert compatibility data, and new operations write no acceptance preference.

## Consequences

One group action takes a project through to usable work, and the member can see how far it has reached.
No new persistent workflow store or second connection mechanism is needed: the existing records, per-placement outcomes, server state and project list establish completion.
Acceptance covers a real local code repository added to a shared group, actual records pushed, a fresh server admitted and signed in, its code cloned and project listed, and the sidebar remaining correct after Refresh and reload.
