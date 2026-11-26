<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-168: An Independent Package Registry

## Status

Accepted (2026-10-30).
Amends [DR-127](127-a-home-signed-in-to-several-instances.md), [DR-151](151-publish-local-spec-packages.md), [DR-165](165-one-package-manager-hosted-by-the-cli-and-the-app.md).
Amended by [DR-172](172-surfaces-a-fresh-user-reads.md), [DR-173](173-the-registry-is-no-face-of-a-space.md), [DR-188](188-registry-sign-in-opens-the-browser.md), [DR-200](200-publishing-names-need-registry-authority.md), [DR-216](216-registry-and-space-accounts-stay-apart.md), [DR-246](246-remove-groups-and-team-servers-from-the-clients.md).

## Context

The owner directed that package management and Space management be separated, preserving existing accounts and records.
The package manager is already one library used by the standalone CLI and IDE.
However, an environment's `space` also selected its registry, publishing destination, account and credential.
Registry failures could sign out the Space, and origin-only credential slots cannot represent independent registry and Space grants at the same URL.
The owner requires one public default registry, isolated Spaces and independent package permissions.

## Decision

- Amends [DR-165](165-one-package-manager-hosted-by-the-cli-and-the-app.md) and [DR-127](127-a-home-signed-in-to-several-instances.md) in registry selection and credentials, and [DR-151](151-publish-local-spec-packages.md) in publishing selection.
  The Space-only presentation of [DR-120](120-the-instance-is-the-space.md) and project placements stand.
- A registry supplies immutable packages and controls namespace ownership, publication and private reads.
  A Space holds a person's records.
  The same origin may offer both registry and Space capabilities.
- `spex.yaml` names the package registry independently as `registry: <origin>`.
  New environments record `https://spex.sublang.ai` as the default registry; an explicitly chosen registry is preserved across Space placement.
  `space` selects record sync and the preferred credential broker for Git sources, never the registry.
- A manifest without `registry` selects the public registry ([DR-216](216-registry-and-space-accounts-stay-apart.md)).
  Installs keep the lock's source origin, version, checksums and provenance, using the locked registry or an explicitly trusted equivalent source, not every signed-in Space; matching bytes alone never transfer namespace ownership or permission.
- Registry sign-in and Space sign-in are separate grants, credential slots, refresh and sign-out operations even when their origins are equal.
  Existing origin-only credentials remain Space credentials and are not promoted to registry credentials.
  A registry failure cannot sign out a Space, and a Space failure cannot sign out the registry.
- `login`, `logout` and `whoami` accept mutually exclusive `--registry <origin>` and `--space <origin>` targets; package-manager use without a target chooses the environment's registry.
  A registry sign-in creates no Space entry, requires no repository grant and works without joining a Space or running an IDE.
  The IDE exposes the same independent registry account and package operations through the shared library.
- Public packages need no account.
  The canonical registry authenticates through GitHub.com or GitLab.com; private reads and publication need that registry's own grant and live namespace permission.
  A person with only a Space sign-in can install public packages; no Space account creates registry authority.
- Publishing offers all registry namespaces the registry account may publish to, with provider metadata.
- The public registry directory lists Spaces by display name, origin and sign-in kinds, and the IDE offers these choices beside a custom URL.
  Discovery supplies no credential trust and exposes no backend locator or configuration.

## Consequences

The shared CLI library, Core and IDE gain independent registry configuration and account state while retaining the current package format and immutable lock sources.
Compatibility registry reads remain served at old origins until their data and client migration are verified; authenticated reads are never redirected across origins.
Integration and live acceptance cover independent same-origin sign-in, refresh and sign-out; anonymous public installs; private installation and publication; manifests without `registry`; two Spaces using one registry; and directory discovery.
