<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-024: App-Supplied Agent Runtimes

## Status

Accepted

## Context

- [DR-023](023-runtime-compatibility-from-cligent.md) removed the agent SDKs from `packages/core` and left supplying them for live and packaged runs as an open app-shell concern: cligent declares them as optional peers, so the dependency closure installs none, a clean checkout cannot run its default live adapters, and the packaged app — which [app-shell-13](../packages/app-shell.md) already requires to ship agent-SDK binaries asar-unpacked — would ship none at all.
- Adapter readiness ([settings-14](../packages/settings.md), [core-service-9](../packages/core-service.md)) promises rules identical to the playbook launcher's, and cites the credential table of [DR-004](004-config-and-persistence.md). The launcher's rules have moved: since playbook 4.0.0 it gates on runtime usability as well as credentials, deriving both from cligent. A credential-only check can report `codex` ready while its SDK is absent, promising a session that fails on the first live call.
- cligent publishes the runtime knowledge a readiness check needs — per-adapter targets with supported floors, tested versions, and pinned repair specifiers — and one-line verdict descriptions, so Spex can render runtime readiness without owning a version literal.

## Decision

- The desktop app supplies the `claude` and `codex` SDKs as its own dependencies, declared at the unconstrained `*` range: which versions work is cligent's to enforce at load, and any range Spex stated would be a second copy that can only drift — a caret froze Codex once already. The lockfile pins the resolution; a refresh moves it.
  `gemini`, `kimi`, and `opencode` remain operator-supplied, as they were before DR-023: their runtimes are CLIs found on `PATH`, not packages an app manifest can place there.
- Packaged builds ship both SDK trees asar-unpacked, realizing [app-shell-13](../packages/app-shell.md) for every executable the SDKs spawn.
- Adapter readiness gains a runtime half derived from cligent's published targets, combined with the credential half of [DR-004](004-config-and-persistence.md): a missing or below-floor runtime reports not ready carrying cligent's verdict and pinned install command, whatever the adapter's credential class; both halves unmet report both requirements; a usable runtime with no credential rule keeps null readiness with verify-yourself guidance.

## Consequences

- A clean checkout install and the packaged app carry the default live adapters again; the open consequence recorded in DR-023 is settled.
- Readiness matches what a session start will actually do, so the UI cannot promise a session that fails on its first live call for a reason the core could see.
- The desktop's install closure regains the two SDK trees; the published CLI and `packages/core` stay SDK-free.
- A cligent floor move still forces no Spex release: the `*` range admits whatever cligent accepts, and readiness text follows cligent's descriptor automatically.
