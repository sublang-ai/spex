<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-094: The Compiler Adopts the App's Cligent

## Status

Accepted (2026-10-01).
Amends [DR-093](093-a-players-subagent-model.md) in its one-Cligent consequence alone: the root override of slc's Cligent range retires; everything else DR-093 decided stands.
Amends [DR-092](092-playbook-17-1-slc-0-13-cligent-0-28-adoption.md) in its slc floor alone: both shells declare `@sublang/slc` `^0.14.0`, and its one engine and one Cligent follow from the dependencies alone again.
Amended by [DR-095](095-a-subagents-effort-and-the-agents-own-model.md) in its floors alone: Cligent `^0.30.0`, Playbook `^17.3.0` and slc `^0.15.0`.

## Context

slc 0.13 declared Cligent `^0.28.0`, which a `0.x` caret closes below the 0.29 [DR-093](093-a-players-subagent-model.md) requires, so the app kept one Cligent only through a root `overrides` entry pointing slc's range at `^0.29.0`.
slc 0.14 declares Cligent `^0.29.0` and Playbook `^17.2.0` itself, its adapter factory typed for Cligent 0.29, its release checks and its opt-in acceptance gate passed on that set ([sublang-ai/slc#31](https://github.com/sublang-ai/slc/issues/31), closed by that release).
An override that the dependency now makes redundant is a standing exception with no reason left, and a `0.x` floor the app reads from its own `package.json` is the plainer statement.

## Decision

Both shells require `@sublang/slc` `^0.14.0`, the root `package.json` carries no `overrides` entry, and the lock regenerated from the public registry resolves one Cligent 0.29.0, one Playbook 17.2.0 and one slc 0.14.0.
Nothing the compiler does changes: its agent still runs on its block's model, effort and fast mode, and the subagent model is not carried to it.

## Consequences

- The root `package.json` loses one key and both shells' slc range rises; the lock shrinks to the tree DR-092 described.
- This ships in the next beta of the 0.9.0 line; a host still on slc 0.13 would nest a second Cligent, which the floors now forbid.
