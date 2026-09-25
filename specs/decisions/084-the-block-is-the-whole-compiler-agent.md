<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-084: The Block Is the Whole Compiler Agent

## Status

Accepted (2026-09-24) on a review finding against [DR-081](081-the-app-supplies-the-compiler.md): a block naming only its adapter reached `slc` as `SLC_AGENT` alone, and `slc` filled the model, effort and fast mode from a configuration of its own — a Codex block ran a Claude model where the reader had once configured `slc` by hand.
Amends [DR-081](081-the-app-supplies-the-compiler.md), which remains accepted, in the handoff alone: what the block leaves unset stays unset for `slc`.

## Context

- `slc` layers its environment over a configuration file it discovers — `slc.config.yaml` in the working directory, else the one under the user's config home, which it seeds on first run — field by field, so an unset `SLC_MODEL` takes the file's model whatever agent the environment named.
- A block that names an adapter and no model means the adapter's own default; a model from another adapter's configuration is a contradiction `slc` cannot see.
- `slc` accepts `--config` naming a file, in which case it discovers none; a file holding no setting leaves every field to the environment and the defaults.

## Decision

- When the block drives the compile, the runner hands `slc` the block as today and names, with `--config`, an empty configuration the core ships, so nothing `slc` would discover fills what the block leaves unset: a model, an effort or fast mode the block does not set is the adapter's default.
- When the environment configures `slc` with any of its four variables, the runner passes nothing — no variable and no `--config` — and `slc`'s own configuration stands, as [DR-081](081-the-app-supplies-the-compiler.md) decided.

Considered and declined:

- Filling the unset fields from Spex: the adapter's default model is cligent's to know, not Spex's.
- Writing a configuration into the working directory: the playbook's directory is tracked and shared, and the file would outlive the run.
- Redirecting the config home: it is the config home of the agent CLIs `slc` runs as well.

## Consequences

- `playbook-library-42` states the handoff's omission semantics and `playbook-library-81` asserts the `--config` in both cases; the core ships one empty configuration file beside its other assets.
