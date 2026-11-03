<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-216: Registry and Space Accounts Stay Apart

## Status

Accepted (2026-11-03) on the owner's direction that package management, playbook authoring and publishing use only the registry account, while groups and servers use only the Space account.
Amends [DR-168](168-independent-package-registry.md) in legacy registry selection, namespace suggestions and the CLI's default account report; [DR-127](127-a-home-signed-in-to-several-instances.md) in group-derived authoring defaults and registry rehoming at placement; [DR-173](173-the-registry-is-no-face-of-a-space.md) in package-surface account context; and [DR-200](200-publishing-names-need-registry-authority.md) in group-derived Org suggestions.
The scoped account links of [DR-202](202-registry-guidance-keeps-account-scope.md) remain.

## Context

- Legacy manifests without `registry` still selected a Space's origin and credential for package operations.
- Authoring could suggest a Space group's path as a publishing Org, including while no registry account was signed in.
- Distinct sign-in controls cannot express independent accounts while defaults, suggestions or installation fallback still cross that boundary.

## Decision

- Package operations select the explicit `registry` in `spex.yaml`, else `https://spex.sublang.ai`, independent of `space`, placement and the home's Spaces.
  Package account displays, sign-in, namespace suggestions and publishing links use that registry alone; Space groups, account names and addresses supply none of them.
  `spex whoami` defaults to the selected registry; a Space account is reported only through `--space`.
- Every registry operation uses registry-purpose credentials or anonymous access, never a Space grant, including when the origins are equal and when reading an older lock.
  Signing in, refreshing or signing out either account changes no credential or account state of the other.
- Authoring suggests only namespaces authorized by the selected registry account, the first by name as its untouched Org default, or an empty field without an answer.
  Account and registry changes refresh untouched fields; manually entered names and existing packages remain as they are.
- Existing manifests, credentials and package names are not rewritten merely because this rule changes.
  Explicit registry choices remain; exact installs retain the lock's source origin, version, checksum and file digests, requesting only that registry or an explicitly trusted mapping, with a registry grant where needed.
  Space placement never rehomes a package source, and matching bytes transfer no authority.
  Old private sources may require their own registry sign-in; choosing a different future package destination requires an explicit `registry` choice.

## Consequences

- New and legacy environments have the same registry-account boundary without losing their locked provenance or Space accounts.
- Offline authoring remains available with a manually entered Org; publication still requires fresh registry authorization.
- Shared-library, core, CLI and rendered-surface integration coverage exercises missing-registry manifests, same-origin independent grants, locked-source installation and registry-only authoring context.
