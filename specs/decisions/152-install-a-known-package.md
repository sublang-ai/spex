<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-152: Install a Known Package

## Status

Accepted (2026-10-25), under the owner's fresh-user package publishing and installation goal.
Extends [DR-104](104-spec-package-format-and-client-environments.md) in the registry installation surface.

## Context

Private packages are intentionally absent from registry search, including for their members.
The IDE's registry form offers only search, so installing a known private release currently requires editing the environment file.
The core already accepts named registry requests with a version requirement and checks access when resolving and installing them.

## Decision

- Add from registry also offers Add by name, accepting a known `org/name` and an explicit version requirement.
- This submits the existing registry request for the selected environment, through its normal instance and account; it does not search for or enumerate private packages.
- Exact, caret and tilde requirements retain their existing meaning; the form invents no default version and does not turn an exact version into a range.
- Request acceptance is not installation success; existing resolution, refusal and installation state remain authoritative.
- Search, registry visibility, package format, locking, authentication and the core protocol remain unchanged.

## Consequences

Public and private known releases can be installed from the IDE without a configuration-file edit.
The publisher still needs to give a private recipient the package name and version, and that recipient needs access.
One small request form reuses the existing installer instead of adding a private-search service or a second metadata protocol.
