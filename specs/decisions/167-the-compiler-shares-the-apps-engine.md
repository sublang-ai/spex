<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-167: The Compiler Shares the App's Engine

## Status

Accepted (2026-10-29) on the owner's direction to publish a shared-engine dependency contract and enforce it in Spex; revised (2026-11-26).
Amends [DR-081](081-the-app-supplies-the-compiler.md), [DR-093](093-a-players-subagent-model.md), [DR-178](178-native-windows-private-storage.md), [DR-183](183-windows-bounded-codex-commands.md).

## Context

slc reads compiler definitions and executes phases using its resolved Playbook, while the app provisions generated artifacts with its own engine.
Where slc brings Playbook through an ordinary dependency, npm installs a second engine beside the app's.
Their ABI and schema declarations may agree, but those declarations do not prove identical definitions or execution behavior.
A required peer expresses slc's compatibility with the application's engine [[1]], but npm can place separate peer groups in different subtrees; the application must verify its installed closure.
A root `overrides` entry that forces one copy is a standing exception that outlives its reason, and a vendored archive cannot satisfy a public-registry dependency gate.

## Decision

- Both shells require slc and directly supply Playbook, matching the core and root acceptance tooling.
- slc owns its required Playbook peer range and its separately locked development release, definitions, bundles and provenance; Spex owns the integrated installation.
- The app's lock and installed dependency tree contain one physical copy each of Playbook, Cligent and xstate, with the compiler's Playbook peer satisfied by the app's selected installation.
- The dependency gate checks real module resolution from both shells, the core, the compiler and Playbook, and integration verification provisions, bundles and executes an artifact against the same engine.
- Builds, CI and pre-push validation reject a divergent or stale closure, including two copies reporting the same version or ABI.
- npm uses strict peer checking [[2]]; the root `package.json` carries no `overrides` entry, and dependency-tree links do not substitute for compatible published dependencies.
- Runtime inputs are the published registry packages with their integrity values: the tree holds no vendored runtime archive or patch payload.
- Codex calls use the supplied Cligent adapter's official SDK path, with explicit policies passed through its public configuration; Spex adds no intermediate launch wrapper, forced Windows backend or fixed shell guidance.
- The compiler's separately versioned Spex grammar dependency remains ordinary and may differ from the app's scaffold CLI.
- A Playbook upgrade waits for an slc release whose declared range admits it; any exception requires an explicit successor decision and corresponding gate change.

## Consequences

Compiler and runtime upgrades remain independently versioned, but an incompatible selection cannot pass Spex's release checks.
The gate verifies the application installation, not every possible slc consumer or a later manual modification of an installation.
The runtime ABI/schema guard remains useful for diagnosing changed installations.
Tag builds obtain their runtime inputs from npm without separately uploaded local dependency archives.

## References

[1]: https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#peerdependencies "npm package.json: peerDependencies"
[2]: https://docs.npmjs.com/cli/v11/using-npm/config/#strict-peer-deps "npm config: strict-peer-deps"
