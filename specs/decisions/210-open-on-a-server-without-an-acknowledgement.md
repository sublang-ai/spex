<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-210: Open on a Server Without an Acknowledgement

## Status

Accepted (2026-11-02) on the owner's request to remove the server's separate acknowledgement because it leaves a project waiting for a confirmation elsewhere on the page.
Amends [DR-132](132-team-servers.md) in the first-open contract, [DR-133](133-one-desktop-over-several-cores.md) in rendering that contract, and [DR-159](159-projects-in-groups-opened-where-you-work.md) in opening a server when a project needs it.

## Context

The first Open on a server waits for I understand below the server's line, separate from the project the person opened.
The same action on later opens proceeds immediately because the device remembers the acknowledgement.
Group membership, admission, sign-in and revocation already determine whether the requested work is allowed.

## Decision

- Open on a server authorizes the connection needed for that project, on the first and every later use.
  The connection starts immediately, with no terms panel, I understand, Cancel or stored acknowledgement.
- The Space row and project picker use the same connection and project-opening flow.
  A new connection started from the picker shows the existing Space progress, sign-in and failure status without waiting for another decision.
  Repeated activation while connecting sends no duplicate admission.
- The existing `server.open` command continues to carry `consented: true`, recording the explicit project-opening request.
  Server access, sign-in, credentials and revocation retain their existing authority.
- Guidance about server administrators and separate registry sign-in remains in the user guide, outside the opening flow.

## Consequences

A member who has added a project to a group meets no additional acknowledgement when choosing its server.
The UI loses the confirmation state and per-device acknowledgement storage, while existing clients and cores keep the same command contract.
Rendered integration and served-browser journeys cover first use, reconnects, duplicate activation, failures, sign-in and eventual project opening in English and Chinese.
