<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-170: `space` Is Written at Every Pairing

## Status

Accepted (2026-10-31), recording a rule the items and the code have followed since 2026-10-30.
Amends [DR-165](165-one-package-manager-hosted-by-the-cli-and-the-app.md) in its sentence on when the app writes `space`: at every pairing and pick, naming the instance the project's spex repository is placed at, the home's default included; a project placed nowhere names none.

## Context

DR-165 had the app write `space` only where a project's instance was not the home's default, so a project at the default instance carried a `spex.yaml` naming no Space.
A `spex.yaml` naming no Space resolves at the home's default instance, which is each device's own, so a file committed by one teammate read differently on another's device, and an environment placed before `space` existed had nothing keeping it at its Space.
On 2026-10-30 the items and the code changed to write `space` wherever the project has an instance, citing DR-165, without a record of the change.
[DR-168](168-independent-package-registry.md) then made the registry independent of `space`, which keeps selecting collaboration and the credential brokered for Git sources.

## Decision

- The app writes `space` in every `spex.yaml` it writes for a project, naming the instance the project's spex repository is placed at, the home's default included: at pairing, and at a pick placing a local-only project.
- A project placed nowhere names no `space` and resolves its collaboration at the home's default instance until it is picked.
- Your own group's environment names the instance its own repository's remote names, as before.

## Consequences

- `environments-11` states the rule for pairing and picks, and `environments-34` asserts a pick into the default instance beside one into another instance; every other item that writes a project's `spex.yaml` follows the same rule.
- A project's `spex.yaml` reads the same on every device of every teammate, the default instance included.
- DR-165's sentence stands as accepted; this record amends it.
