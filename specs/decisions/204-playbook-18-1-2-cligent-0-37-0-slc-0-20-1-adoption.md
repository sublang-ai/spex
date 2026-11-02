<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-204: Playbook 18.1.2, Cligent 0.37.0 and slc 0.20.1 Adoption

## Status

Accepted (2026-11-02) on the owner's direction for P0-6, so a Workshop attendee's seeded agents run the latest Codex model at a measured effort.
Amends [DR-154](154-the-seed-follows-playbooks-rule.md) in the Playbook floor and built-in release alone; its seeding rule stands.
Amends [DR-153](153-playbook-18-0-1-cligent-0-36-1-slc-0-19-1-adoption.md) in the Cligent floor and lock resolution alone.
Amends [DR-167](167-the-compiler-shares-the-apps-engine.md) in the slc and shell Playbook floors alone; its shared-engine gate stands.
Amends [DR-182](182-published-desktop-runtime-adoption.md) in the Playbook, Cligent and slc floors alone: Cligent 0.37.0 and Playbook 18.1.2 carry its published Windows fixes, and slc 0.20.0 no longer admits that Cligent.

## Context

- Playbook 18.1.2 seeds the Captain and every player at effort `medium`, a `dev.reviewer` seeded on Codex beside Claude agents at `high`, and names `gpt-6.1-sol` for Codex [[1]].
- It requires Cligent `^0.37.0`, the first release whose Codex runtime floor `0.159.1` serves `gpt-6.1-sol` [[2]].
- slc 0.20.0 requires Cligent `^0.36.1`, which excludes 0.37.0, so the app would install a second Cligent; slc 0.20.1 requires Cligent `^0.37.0` and the Playbook peer `^18.1.2` [[3]].
- Spex's first-run config is Playbook's seed, so the seeded agents change with the installed Playbook alone [[core-service-3](../packages/core-service.md#core-service-3)].

## Decision

- **Floors.** The core, both shells and root acceptance tooling require Playbook `^18.1.2`; the core requires Cligent `^0.37.0`; both shells require slc `^0.20.1`.
- **Lock.** Resolve the verified public artifacts through npm, with one shared Cligent and xstate and no overrides or links for these dependencies; the shells' agent SDKs stay at `*`.
- **Built-ins.** Stage `sublang/playbooks` 18.1.2 from the installed Playbook release; its playbooks are 18.1.0's unchanged.

## Consequences

- A fresh seed, or a reseed of an untouched one, runs Codex on `gpt-6.1-sol` and every agent at `medium` but a second-adapter `dev.reviewer` at `high`.
- An existing config the reader has edited keeps its models and efforts.
- A Codex runtime older than `0.159.1` is refused by Cligent's floor, so the shells' Codex SDK resolves at least that release.

## References

[1]: https://github.com/sublang-ai/playbook/blob/v18.1.2/CHANGELOG.md "Playbook 18.1.2 changelog"
[2]: https://github.com/sublang-ai/cligent/blob/v0.37.0/CHANGELOG.md "Cligent 0.37.0 changelog"
[3]: https://github.com/sublang-ai/slc/blob/v0.20.1/CHANGELOG.md "slc 0.20.1 changelog"
