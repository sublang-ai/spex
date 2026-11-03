<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-206: The Workshop Points to Its Guide, and a Re-check Reseeds

## Status

Accepted (2026-11-02) on the owner's direction during the Workshop's manual verification.
Amends [DR-204](204-workshop-agents-in-one-pass.md) in its routes: a not-ready card offers the configuration document alone, as its primary action, and no online service.
Amends [DR-205](205-agent-cards-read-alike.md) in "The online service before its address": the action is removed, not enabled.
Amends [DR-156](156-an-untouched-seed-follows-the-credentials.md) in when an untouched seed is reseeded: on each readiness request too, a re-check among them, not only at start and on a seat's agent-credential change.
Amended by [DR-217](217-cligent-0-38-0-adoption-and-models-on-re-check.md) in what a Re-check reads afresh: the agent cards' model catalogs too.

## Context

- The card's primary action sent attendees to the online model service, so an attendee with a subscription or key of their own was steered away from it; the owner wants the service told in the room by the lecturer, for those who need it, and the card to lead to the local setup.
- With the online route gone, a question asking whether the attendee holds a subscription or key no longer chooses between routes, and the configuration document becomes the card's one action.
- An attendee who set up an agent after Spex started pressed Re-check and saw no change, then saw it after reopening Spex:
  - a variable set with `setx` or in a shell's login file reaches only processes started after it, never the running core;
  - Claude Code's user settings and an agent's own sign-in are read afresh by every readiness check, but the seed — which agents run on which adapter, and the official model names behind a third-party service — was rewritten only at start.

## Decision

- Where the Workshop switch is on, a card not ready for a local credential says whom the setup is for and offers "Open the setup guide" as its primary action, opening the configuration document at the reader's platform; no online route, no "or".
- Its closing line says to press Re-check once connected, and to quit and reopen Spex where nothing changes, since a key set as an environment variable reaches only a new process.
- The Re-check tooltip names what it reads afresh — each agent's sign-in and Claude Code's settings — and that a key in an environment variable needs Spex reopened.
- A readiness request reseeds an untouched seed by [DR-156](156-an-untouched-seed-follows-the-credentials.md)'s rule before it reads readiness, so a re-check reaches every agent's adapter and model as a start would; a file changed in any byte stays as it is.
- The configuration document leads Claude's key through Claude Code's user settings, which a re-check reads, rather than an environment variable, which it cannot.
- Reading the user's current environment variables — the registry on Windows, a login shell elsewhere — on a re-check was considered and deferred: it depends on shell startup and its precedence over the settings file, while the settings route needs neither.

## Consequences

- An attendee who follows the document sees a card turn ready, and the seed follow, on Re-check with no restart.
- An attendee who sets a key as an environment variable still needs Spex reopened, as the closing line says.
- Each readiness request may ask each agent's status command where its folder stands and no credential variable is set, as a start's seed does: once per request, its answer shared by the reseed, the reload and the readiness returned, and not at all for the reseed where no seed is recorded.
- The online service, once open, reaches attendees only as the lecturer tells them; the interface holds no address for it.
