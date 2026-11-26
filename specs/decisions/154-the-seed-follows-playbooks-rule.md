<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-154: The Seed Follows Playbook's Rule

## Status

Accepted (2026-10-26).
Amends [DR-019](019-inline-agent-configuration.md), [DR-037](037-playbook-12-adoption.md).
Amended by [DR-156](156-an-untouched-seed-follows-the-credentials.md), [DR-205](205-agent-cards-read-alike.md), [DR-246](246-remove-groups-and-team-servers-from-the-clients.md).

## Context

- The owner's P0-2 asks for a default configuration that runs on the machine it is written on.
- Spex seeded the global configuration from Playbook's bundled starter template, as written but for `playbooks.*.from`.
- The `playbook` CLI seeds the same template through a rule that reads which adapters' credentials the machine has, so on one machine the two front ends could seed different agents.
- With both Claude and Codex signed in, Playbook seeds `dev.reviewer` on Codex so review comes from another provider; with only Codex, it seeds every agent on Codex, which a copied all-Claude template cannot run at all.
- Playbook publishes that rule as `@sublang/playbook/seed-config`, returning the text it seeds for a given environment and home.
- DR-019's reason for a single-vendor seed was that Spex had no launch gate to catch a cold second-vendor sign-in; Spex now checks readiness before a run and names a failed call's agent with its recovery, and the rule only picks a second vendor whose credentials are present.

## Decision

- When Spex writes a first-run config, its text is Playbook's seed for the core's own environment and home through `@sublang/playbook/seed-config`, with every `playbooks.<id>.from` removed; Spex holds no adapter, model, effort or writable-path choice of its own beyond [DR-205](205-agent-cards-read-alike.md)'s for a third-party Claude service.
- The seed is chosen from credentials alone — which ones count is [DR-205](205-agent-cards-read-alike.md)'s — read before the file is written; no model call or quota check takes part.
- Seeding is one exclusive create of an absent file, never touching an existing config; an untouched seed is reseeded under [DR-156](156-an-untouched-seed-follows-the-credentials.md).
- The promise is that the Captain's and each player's agent settings (`adapter`, `model`, `effort`, `writablePaths`) match what the CLI seeds under the same credentials and home, but where [DR-205](205-agent-cards-read-alike.md) departs from Playbook's rule; the two files are not promised equal, since they sit at different paths and Spex removes `from`.
- Amends [DR-019](019-inline-agent-configuration.md) in §"Spex writes only blocks": the seed keeps no single-vendor lineup of its own; its agents are the ones Playbook's seeding rule selects from this machine's credentials.
- Amends [DR-037](037-playbook-12-adoption.md) in its seeding: the first-run config is not the installed template copied as written, and the two hosts' files are not identical by construction; only their agent settings are.
- Unifying the two hosts' config locations and the `from` convention is out of scope.

## Consequences

- A Codex-only machine starts on Codex, and a machine with both runs review on Codex and everything else on Claude.
- A credential that counts does not prove a working call: a failed call names its agent and offers its recovery in the run view.
- Tests asserting the seeded file pin the environment and home they seed under, since the seed is a function of them.
- Rule and model-table changes reach Spex by upgrading Playbook, with nothing to mirror.
