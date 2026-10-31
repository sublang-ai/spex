<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-168: An Independent Package Registry

## Status

Accepted (2026-10-30) on the owner's direction to separate package management, Space management and server execution, preserving existing accounts and records.
Amended by [DR-172](172-surfaces-a-fresh-user-reads.md) in how a site's two faces show.
Amends [DR-165](165-one-package-manager-hosted-by-the-cli-and-the-app.md) and [DR-127](127-a-home-signed-in-to-several-instances.md) in registry selection and credentials, [DR-151](151-publish-local-spec-packages.md) in publishing selection, and [DR-132](132-team-servers.md) in the credentials a seat needs to install private packages.
The instance-only presentation of [DR-120](120-the-instance-is-the-space.md), project placements and execution ownership stand.

## Context

The package manager is already one library used by the standalone CLI and IDE, and each Space already authorizes independently hosted servers.
However, an environment's `space` also selects its registry, publishing destination, account and credential.
Registry failures can sign out the Space, and origin-only credential slots cannot represent independent registry and Space grants at the same URL.
The owner requires one public default registry, isolated Spaces and independent package permissions, including on a server seat.

## Decision

- A registry supplies immutable packages and controls namespace ownership, publication and private reads.
  A Space controls groups, records and admission to its servers; a server executes projects in member seats.
  The same origin may offer both registry and Space capabilities.
- `spex.yaml` names the package registry independently as `registry: <origin>`.
  New environments record `https://spex.sublang.ai` as the default registry; an explicitly chosen registry is preserved across Space placement and execution-place changes.
  `space` continues to select collaboration and the preferred credential broker for Git sources, never the registry of an environment that names one.
- Existing manifests without `registry` retain their former package destination through a compatibility path until explicitly migrated.
  A migration preserves private-source selection, publishing destination, locked versions, checksums and origin provenance; matching bytes alone never transfer namespace ownership or permission.
  Independent installs use the locked registry or an explicitly trusted equivalent source, not every signed-in Space.
- Registry sign-in and Space sign-in are separate grants, credential slots, refresh and sign-out operations even when their origins are equal.
  Existing origin-only credentials remain Space credentials and are not promoted to registry credentials.
  A registry failure cannot sign out a Space, and a Space failure cannot sign out the registry.
- `login`, `logout` and `whoami` accept mutually exclusive `--registry <origin>` and `--space <origin>` targets; package-manager use without a target chooses the environment's registry.
  A registry sign-in creates no Space entry, requires no repository grant and works without joining a Space or running an IDE.
  The IDE exposes the same independent registry account and package operations through the shared library.
- Public packages need no account.
  The canonical registry authenticates through GitHub.com or GitLab.com; private reads and publication need that registry's own grant and live namespace permission.
  A person with only a Space sign-in can install public packages; no Space membership creates registry authority.
- Publishing offers all registry namespaces the registry account may publish to, with provider metadata.
  A project's root-group name may suggest a matching namespace but cannot hide other authorized choices or require a Space association.
- The public registry directory lists Spaces by display name, origin and sign-in kinds, and the IDE offers these choices beside a custom URL.
  Discovery supplies no credential trust and exposes no backend locator or configuration.
- A server seat receives only its Space grant through admission.
  Private package use on that seat requires its own registry sign-in; server admission, tickets, leases and execution ownership are unchanged.

## Consequences

The shared CLI library, Core and IDE gain independent registry configuration and account state while retaining the current package format, immutable lock sources and server model.
Compatibility registry reads remain served at old origins until their data and client migration are verified; authenticated reads are never redirected across origins.
Integration and live acceptance cover independent same-origin sign-in, refresh and sign-out; anonymous public installs; private installation and publication; explicit legacy migration; two Spaces using one registry; directory discovery; and a server seat before and after registry sign-in.
