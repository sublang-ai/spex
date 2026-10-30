<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-167: The Compiler Shares the App's Engine

## Status

Accepted (2026-10-29) on the owner's direction to publish a shared-engine dependency contract and enforce it in Spex.
Amends [DR-144](144-bounded-session-storage.md) and [DR-153](153-playbook-18-0-1-cligent-0-36-1-slc-0-19-1-adoption.md) by withdrawing the compiler-only nested Playbook exception and raising the slc floor; their storage, Cligent and xstate decisions stand.
Extends [DR-081](081-the-app-supplies-the-compiler.md): each shell supplies Playbook beside the compiler, while the existing ABI/schema refusal remains.

## Context

The app locks Playbook 18.1.0 while slc 0.19.1 brings Playbook 17.11.1 through its ordinary dependency.
slc reads compiler definitions and executes phases using its resolved Playbook, while the app provisions generated artifacts with its own engine.
Their ABI and schema declarations agree, but those declarations do not prove identical definitions or execution behavior.
A required peer expresses slc's compatibility with the application's engine [[1]], but npm can place separate peer groups in different subtrees; the application must verify its installed closure.

## Decision

- Both shells require slc `^0.20.0` and directly supply Playbook `^18.1.0`, matching the core and root acceptance tooling.
- slc owns its required Playbook peer range and its separately locked development release, definitions, bundles and provenance; Spex owns the integrated installation.
- The app's lock and installed dependency tree contain one physical copy each of Playbook, Cligent and xstate, with the compiler's Playbook peer satisfied by the app's selected installation.
- The dependency gate checks real module resolution from both shells, the core, the compiler and Playbook, and integration verification provisions, bundles and executes an artifact against the same engine.
- Builds, CI and pre-push validation reject a divergent or stale closure, including two copies reporting the same version or ABI.
- npm uses strict peer checking [[2]]; overrides and dependency-tree links do not substitute for compatible published dependencies.
- The adoption preserves Cligent 0.36.1, xstate 5.33.3 and existing agent SDK resolutions; the compiler's separately versioned Spex grammar dependency remains ordinary and may differ from the app's scaffold CLI.
- A future Playbook upgrade waits for an slc release whose declared range admits it; any exception requires an explicit successor decision and corresponding gate change.

## Consequences

Compiler and runtime upgrades remain independently versioned, but an incompatible selection cannot pass Spex's release checks.
The gate verifies the application installation, not every possible slc consumer or a later manual modification of an installation.
The current runtime ABI/schema guard remains useful for diagnosing changed installations.

## References

[1]: https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#peerdependencies "npm package.json: peerDependencies"
[2]: https://docs.npmjs.com/cli/v11/using-npm/config/#strict-peer-deps "npm config: strict-peer-deps"
