<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-164: The Seat Signs In on Its Ticket

## Status

Accepted (2026-10-29) on the owner's direction: a member who opened a seat consented already, and the seat's sign-in completes on that consent with no page to approve.
Amends, under [DR-046](046-decision-record-evolution.md):

- [DR-159](159-projects-in-groups-opened-where-you-work.md) in "A seat opens when needed": the open hands the ticket it presented to the seat's sign-in, and the approval page is opened only where the space still asks for it; its declined item on the ticket's consent is now decided here.
- [DR-132](132-team-servers.md) in "A seat signs in to the instance through the device flow": the seat's request carries the ticket beside the server and the person.

## Context

- [DR-159](159-projects-in-groups-opened-where-you-work.md) made the open start the seat's sign-in and relay its approval page, so a member consented twice: the contract on their own device before the ticket, then "Sign in Spex on <server> for @<login>?" in a browser while the seat waited.
- Spex Space [[1]] grants a pending device code at its token endpoint without the page where the request carries the ticket the member's client presented and a server redeemed: within ten minutes of the redemption, for that server and that person, once, and only where the ticket was minted by an unrevoked device of the member's that is no seat; the seat's device is revoked with that device.
- The ticket is in the local core's hands at the open, and the seat's sign-in is started by the local core over a connection of its own ([DR-133](133-one-desktop-over-several-cores.md)); the seat's device request already names the server and the person ([DR-132](132-team-servers.md)).
- A space that does not grant on the ticket — an older deployment — answers that the sign-in is pending, and the page is the way; the device flow's first poll comes after the interval the instance names, five seconds, and a grant on the ticket comes at that poll.

## Decision

- The local core keeps the ticket it presented at the server with the seat's relay, in memory alone, until the relay's first hello starts the seat's sign-in; it hands the ticket to the seat in that start and holds it no longer.
  A sign-in started again by the person, or by a relay reopened at the core's start, carries no ticket and meets the page as before, at once.
- On a seat, the device request carries the ticket beside the server and the person where the start named one; off a seat, a start naming a ticket is refused.
- A sign-in started with the ticket reads as running — the page opened by the desktop shell, its link on the server's line — only where the grant has not come by the end of the first poll interval the seat's reply names, plus a short margin; a sign-in the space grants on the ticket passes from pending to signed in with no page opened.
  Until then the server's line reads "Signing in to <instance>…".
- The stand-in instance grants on the ticket as Spex Space does — minted by it, spent by a server's admission within the last ten minutes, for that server and the person who asked it, once — and can be scripted to keep the page, so the core's suite walks both paths and the local simulation the grant.

### Considered and declined

- Minting a new ticket for "Sign in again": a ticket is granted only once a server redeemed it, and a second admission replaces the seat; the page serves that rare case.
- The shell deciding when to open the page: the core knows the interval the instance named and hears the grant first.
- The ticket in the seats file: a secret with a ten-minute life, of no use at the next start, when the seat is signed in already or the page stands.

## Consequences

- `core-service` changes in the open keeping the ticket for the seat's sign-in and in the sign-in's states; `git-host` in the seat's request, the start's reply naming the interval and the stand-in's grant; `run-view` in the server line's words while the seat signs in; `hub` in the local simulation reaching Connected with no page; the tests of each.
- The protocol's `space.signin.start` gains an optional `ticket`, and its device reply the `interval`; nothing is lost, but a seat of an earlier release refuses a key it does not know, so the protocol version bumps and such a seat reads mismatched until its server is updated.
- The local simulation sees the seat signed in with no approval link; the browser journeys' seats, plain cores standing in for seats, boot signed in; the core's suite keeps the page by scripting the stand-in.

## References

[1]: https://github.com/sublang-ai/spex.space/blob/main/specs/decisions/035-a-tickets-consent-approves-the-seats-sign-in.md "Spex Space DR-035: A Ticket's Consent Approves the Seat's Sign-In"
