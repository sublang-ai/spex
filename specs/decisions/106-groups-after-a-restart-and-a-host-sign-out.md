<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-106: Groups After a Restart

## Status

Accepted (2026-10-07).
Amends [DR-103](103-the-home-and-its-groups.md) in when Spex reads the host: also once when it starts signed in.

## Context

- Spex reads the host when you sign in, when you press Refresh, and before a sync ([DR-103](103-the-home-and-its-groups.md)).
- After a restart on a signed-in home, Groups therefore reads "Not read yet", and "Pick a group" offers your own group alone, until you press Refresh.

## Decision

- A core that starts signed in reads the host once, when a client first asks for the Groups state and no read has begun since the start.
- That ask is answered with the state as it stands; the read's outcome arrives as any read's does.
- Spex still never reads the host on a timer.

## Consequences

- A restarted app shows the host's groups and the picker's choices without a Refresh.
- A start on a signed-in home contacts the host as soon as any surface first asks for the Groups state, with no one pressing anything.
