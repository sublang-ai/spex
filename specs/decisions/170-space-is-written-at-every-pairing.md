<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-170: `space` Is Written at Every Pairing

## Status

Accepted (2026-10-31).
Amends [DR-165](165-one-package-manager-hosted-by-the-cli-and-the-app.md).

## Context

DR-165 had the app write `space` only where a project's Space was not the home's default, so a project at the default Space carried a `spex.yaml` naming no Space.
A `spex.yaml` naming no Space resolves at the home's default Space, which is each device's own, so a file committed on one device read differently on another, and an environment placed before `space` existed had nothing keeping it at its Space.
On 2026-10-30 the items and the code changed to write `space` wherever the project has a Space, citing DR-165, without a record of the change; this decision records that rule.
[DR-168](168-independent-package-registry.md) made the registry independent of `space`, which keeps selecting record sync and the credential brokered for Git sources.

## Decision

- Amends [DR-165](165-one-package-manager-hosted-by-the-cli-and-the-app.md) in when the app writes `space`.
- The app writes `space` in every `spex.yaml` it writes for a project, naming the Space the project's spex repository is placed at, the home's default included: at pairing, and at a pick placing a local-only project.
- A project placed nowhere names no `space` and resolves at the home's default Space until it is picked.
- The global environment names the Space its records repository's remote names, as before.

## Consequences

- `environments-11` states the rule for pairing and picks, and `environments-34` asserts a pick into the default Space beside one into another Space; every other item that writes a project's `spex.yaml` follows the same rule.
- A project's `spex.yaml` reads the same on every device, the default Space included.
