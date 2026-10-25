<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-150: Spex Space Product and Destination

## Status

Accepted (2026-10-25), on the owner's naming direction.
Amends [DR-103](103-the-home-and-its-groups.md) in the IDE destination's name: Space replaces Groups, while group objects keep their name.
Amends [DR-127](127-a-home-signed-in-to-several-instances.md) in the default origin for a newly created home.
Clarifies [DR-120](120-the-instance-is-the-space.md): Spex Space names the server product, and an instance remains one deployment of it.

## Context

The public server product needs a name independent of its domain.
Its IDE destination covers sign-in, groups, sharing, synchronization and team servers, broader than the former Groups label.
An existing home's origin is part of the identity of its connections and stored placements.

## Decision

- The server product is **Spex Space**; its source repository is `spex.space`.
- The current production origin and new-home default are `https://spex.sublang.ai`.
- The proposed future domain `spex.space` is not an endpoint until the owner acquires it and authorizes a separate cutover.
- The IDE destination is **Space**; groups, subgroups, projects and their actions retain their meanings and names.
- Saved origins, credentials, repository keys and placements remain unchanged; configuring another origin continues to use the existing sign-in flow.
- Naming and presentation changes preserve operations, permissions and storage formats.
- Current documentation and examples use the new product and address; historical decisions and release evidence retain their original context.

## Consequences

The product name remains stable when hosting changes.
Space describes the collaboration destination without conflating a group with a deployment.
Existing installations are not silently redirected or migrated by a branding update.
