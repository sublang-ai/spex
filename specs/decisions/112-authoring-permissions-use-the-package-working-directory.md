<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-112: Authoring Permissions Use the Package Working Directory

## Status

Accepted (2026-10-10).
Clarifies [DR-058](058-chat-assisted-playbook-authoring.md) in the authoring agent's permission projection and the limits of adapter enforcement; the spec package working directory introduced by [DR-104](104-spec-package-format-and-client-environments.md) stays unchanged.

## Context

Authoring supplied its absolute package directory as both `cwd` and `permissions.writablePaths`.
Cligent 0.33.3 treats writable paths as additional workspace-relative subpaths and rejects that absolute path before the agent starts.
Direct chat, compile-failure repair and successful-compile proposals share this projection.
The scripted adapter accepted it, so its argument assertions did not catch the failure at the real permission mapping boundary.

## Decision

- Authoring keeps the spec package directory as `cwd` and supplies exactly `{ mode: "auto" }`, omitting `writablePaths` and the agent block's own permission policy.
- The working directory establishes the authoring location; each adapter's native auto policy governs access.
  An ambient adapter's access is not a filesystem confinement guarantee, and the prompt continues to restrict edits to the source and manifest description.
- Integration verification passes captured authoring options through the installed adapters' real permission mappers, including chat, repair, proposal, resume and agent-switch calls.

## Consequences

Authoring no longer sends a redundant invalid grant, without changing its directory, approval mode, compiler, registration confirmation or persisted compilation results.
The fix needs no data migration or recompilation of an already successful playbook.
