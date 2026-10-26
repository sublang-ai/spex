<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-154: The Seed Follows Playbook's Rule

## Status

Accepted (2026-10-26) for the owner's P0-2 default configuration.
Amends [DR-019](019-inline-agent-configuration.md) in §"Spex writes only blocks": the seed no longer keeps a single-vendor lineup of its own; its agents are the ones Playbook's seeding rule selects from this machine's credentials.
Amends [DR-153](153-playbook-18-0-1-cligent-0-36-1-slc-0-19-1-adoption.md) in the Playbook floor and built-in release alone; its Cligent, slc and lock decisions stand.
Amends [DR-037](037-playbook-12-adoption.md) in its seeding: the first-run config is no longer the installed template copied as written, and the two hosts' files are no longer identical by construction; only their agent settings are.
Amended by [DR-156](156-an-untouched-seed-follows-the-credentials.md): a seeded file still at the bytes the core wrote is reseeded when the credentials change; the exclusive first create and the text stand.

## Context

- Spex seeds your own group's config from Playbook's bundled starter template, as written but for `playbooks.*.from`.
- The `playbook` CLI seeds the same template through a rule that reads which adapters' credentials the machine has, so on one machine the two front ends can seed different agents.
- With both Claude and Codex signed in, Playbook seeds `dev.reviewer` on Codex so review comes from another provider; with only Codex, it seeds every agent on Codex, which a copied all-Claude template cannot run at all.
- Playbook now publishes that rule as `@sublang/playbook/seed-config`, returning the text it seeds for a given environment and home.
- DR-019's reason for a single-vendor seed was that Spex had no launch gate to catch a cold second-vendor sign-in; Spex now checks readiness before a run and names a failed call's agent with its recovery, and the rule only picks a second vendor whose credentials are present.

## Decision

- When Spex writes a first-run config, its text is Playbook's seed for the core's own environment and home through `@sublang/playbook/seed-config`, with every `playbooks.<id>.from` removed as before; Spex holds no adapter, model, effort or writable-path choice of its own.
- The rule reads credentials only — an API key in the environment, or the `~/.claude` and `~/.codex` sign-in folders — synchronously before the file is written; no runtime probe, model call or quota check takes part.
- Seeding stays one exclusive create of an absent file, never touching an existing config; nothing rewrites a seeded file afterwards.
- The promise is that the Captain's and each player's agent settings (`adapter`, `model`, `effort`, `writablePaths`) match what the CLI seeds under the same credentials and home; the two files are not promised equal, since they sit at different paths and Spex removes `from`.
- Unifying the two hosts' config locations and the `from` convention is out of scope.
- The core and root acceptance tooling require Playbook `^18.1.0`, the first release publishing `@sublang/playbook/seed-config`; its dependencies are 18.0.1's, so the lock changes only Playbook's own entry.
- The staged built-in release follows the installed Playbook to `sublang/playbooks` 18.1.0, whose playbooks are 18.0.1's unchanged.

## Consequences

- A Codex-only machine starts on Codex, and a machine with both runs review on Codex and everything else on Claude.
- A present sign-in folder does not prove a working sign-in: a failed call names its agent and offers its recovery in the run view.
- Tests asserting the seeded file pin the environment and home they seed under, since the seed is a function of them.
- Rule and model-table changes reach Spex by upgrading Playbook, with nothing to mirror.
