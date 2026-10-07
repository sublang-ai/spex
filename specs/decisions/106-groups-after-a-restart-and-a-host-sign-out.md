<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-106: Groups After a Restart and a Host Sign-Out

## Status

Accepted (2026-10-07).
Amends [DR-103](103-the-home-and-its-groups.md) in when Spex reads the host: also once when it starts signed in.

## Context

- Spex reads the host when you sign in, when you press Refresh, and before a sync ([DR-103](103-the-home-and-its-groups.md)).
- After a restart on a signed-in home, Groups therefore reads "Not read yet", and "Pick a group" offers your own group alone, until you press Refresh.
- When the host refuses the device's token, Spex signs the device out and Groups shows the card of a home never signed in, which hides that the host ended the sign-in and as whom you were signed in.
- `home.yaml` marks a home signed out with a boolean that every Spex reading the file validates, so a richer value would make an older Spex refuse the home.

## Decision

- A core that starts signed in reads the host once, when a client first asks for the Groups state and no read has begun since the start.
- That ask is answered with the state as it stands; the read's outcome arrives as any read's does.
- Spex still never reads the host on a timer.
- When the host signs the device out, Groups says so, naming the host and the account you were signed in as, and offers to sign in again.
- That the host signed the device out is held for the core's run alone, until the next sign-in; `home.yaml` keeps its boolean mark.

## Consequences

- A restarted app shows the host's groups and the picker's choices without a Refresh.
- A start on a signed-in home contacts the host as soon as any surface first asks for the Groups state, with no one pressing anything.
- After a restart, a home the host signed out reads as any signed-out home.
