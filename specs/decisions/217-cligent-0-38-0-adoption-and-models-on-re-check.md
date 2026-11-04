<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-217: Cligent 0.38.0, Playbook 18.1.3 and slc 0.20.2 Adoption, a Packaging Check on Resumed Claude Defaults, and Models Read Again on Re-check

## Status

Accepted (2026-11-03) on the owner's direction for P0-6, after the Workshop's manual verification behind a third-party Claude service.
Amends [DR-208](208-playbook-18-1-2-cligent-0-37-0-slc-0-20-1-adoption.md) in the Playbook, Cligent and slc floors and the built-in release alone.
Amends [DR-206](206-the-workshop-points-to-its-guide.md) in what a Re-check reads afresh: the agent cards' model catalogs too.

Amended by [DR-224](224-playbook-18-1-4-adoption.md) in the Playbook floor and the built-in release.

## Context

- Behind a third-party Claude service the seed runs every Claude agent on the provider's default [DR-205](205-agent-cards-read-alike.md).
  Cligent 0.37.0 refused a resumed Claude call on the provider's default, holding that Claude Code then restores the session's earlier model, so every workflow step resuming a Claude session failed, `/decide` and `/review` among them.
- Probes of Claude Code 2.1.284 showed the premise false: a resume with no model requests the default current at that resume — `ANTHROPIC_MODEL` from the environment or the settings `env`, else the settings `model`, else the built-in default.
  Cligent 0.38.0 admits that call and omits the model [[1]].
- Playbook 18.1.2 and slc 0.20.1 require Cligent `^0.37.0`, which excludes 0.38.0, so the app would install a second Cligent and the built-in playbooks would keep the refusal; Playbook 18.1.3 and slc 0.20.2 change only that requirement to `^0.38.0` [[2]] [[3]].
- The packaged app could not read Claude's model catalog: Cligent 0.37.0's discovery spawned the native binary inside `app.asar`, failing with `spawn ENOTDIR`; Cligent 0.38.0 spawns the unpacked binary as a run does [[1]].
- The shells declare the agent SDKs at `*` [DR-024](024-app-supplied-agent-runtimes.md), so a fresh install may bring a Claude Code whose resume restores the earlier model; Cligent's acceptance check does not ship with its package, so Spex cannot run it.
  Were that to happen, a role moved to the provider's default mid-workflow, or a default changed in the settings, would keep running the earlier model with no error; the seed's roles run one model throughout, so the effect is narrow.
- The setup guide has the attendee write the settings file while Spex is open and press Re-check; the card turned ready with its service, but kept the model it had read before, "Unavailable" or the official default, until the page was left.

## Decision

- **Floors.** The core, both shells and root acceptance tooling require Playbook `^18.1.3`; the core requires Cligent `^0.38.0`; both shells require slc `^0.20.2`; one shared Cligent as before.
- **Built-ins.** Stage `sublang/playbooks` 18.1.3 from the installed Playbook release; its playbooks are 18.1.2's unchanged.
- **Packaging check.** Both native packaging commands run a check after the build and before the packager, failing packaging where it fails:
  - it runs the Claude adapter of the Cligent the core resolves, under a temporary home holding only a settings file whose `env.ANTHROPIC_MODEL` is the default — the attendee's setup — against a loopback model API fixture, with inherited Anthropic and Claude variables removed;
  - a call on an explicit model, then the default changed, then a resume with no model must request the changed default;
  - it covers that one default source; Cligent's own acceptance check covers the others.
- **Models on Re-check.** Once a Re-check's readiness request settles, each agent card reads its model catalog again:
  - until it arrives the card keeps the model it read, in a muted tone beside "Updating model…", and is marked busy;
  - a failed reading shows "Unavailable", never the earlier model;
  - a readiness request on the window regaining focus, and the other editors' catalogs, read none.

## Consequences

- Resumed Claude steps run behind a third-party service, on the provider's default as seeded.
- The packaged app's cards and model fields read Claude's catalog.
- A packaging run takes about ten seconds longer, and needs no network.
- A Claude Code release that restores the earlier model on resume stops packaging with that reason instead of shipping.
- Pull requests do not package, so the check runs on local packaging and the app release workflow.

## References

[1]: https://github.com/sublang-ai/cligent/blob/v0.38.0/CHANGELOG.md "Cligent 0.38.0 changelog"
[2]: https://github.com/sublang-ai/playbook/blob/v18.1.3/CHANGELOG.md "Playbook 18.1.3 changelog"
[3]: https://github.com/sublang-ai/slc/blob/v0.20.2/CHANGELOG.md "slc 0.20.2 changelog"
