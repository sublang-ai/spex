<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-217: A Packaging Check on Resumed Claude Models, and Models Read Again on Re-check

## Status

Accepted (2026-11-03) on the owner's direction for P0-6, after the Workshop's manual verification behind a third-party Claude service.
Amends [DR-206](206-the-workshop-points-to-its-guide.md).
Amended by [DR-238](238-claude-resumes-keep-the-session-model.md).

## Context

- Behind a third-party Claude service the seed runs every Claude agent on the provider's default [DR-205](205-agent-cards-read-alike.md).
  A Cligent that refused a resumed Claude call on the provider's default failed every workflow step resuming a Claude session, `/decide` and `/review` among them; Cligent admits that call and omits the model [[1]].
- The shells declare the agent SDKs at `*` [DR-024](024-app-supplied-agent-runtimes.md), so a fresh install may bring a Claude Code whose fresh or resumed model selection departs from the contract Spex relies on; Cligent's acceptance check does not ship with its package, so Spex cannot run it.
  Were that to happen, a role's model could change or stay without an error.
- The setup guide has the attendee write the settings file while Spex is open and press Re-check; the card turned ready with its service, but kept the model it had read before, "Unavailable" or the official default, until the page was left.

## Decision

- **Packaging check.** Both native packaging commands run a check after the build and before the packager, failing packaging where it fails:
  - it runs the Claude adapter of the Cligent the core resolves under a temporary home holding only the settings it needs, against a loopback model API fixture, with inherited Anthropic and Claude variables removed;
  - its cases assert the fresh and resumed Claude model selection contract of [DR-238](238-claude-resumes-keep-the-session-model.md).
- **Models on Re-check.** Once a Re-check's readiness request settles, each agent card reads its model catalog again:
  - until it arrives the card keeps the model it read, in a muted tone beside "Updating model…", and is marked busy;
  - a failed reading shows "Unavailable", never the earlier model;
  - a readiness request on the window regaining focus, and the other editors' catalogs, read none.

## Consequences

- Resumed Claude steps run behind a third-party service, on the provider's default as seeded.
- A packaging run takes about ten seconds longer, and needs no network.
- A Claude Code release that breaks the selection contract stops packaging with that reason instead of shipping.
- Pull requests do not package, so the check runs on local packaging and the app release workflow.

## References

[1]: https://github.com/sublang-ai/cligent/blob/v0.38.0/CHANGELOG.md "Cligent 0.38.0 changelog"
