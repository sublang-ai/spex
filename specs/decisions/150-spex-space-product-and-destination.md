<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-150: Spex Space Product and Destination

## Status

Accepted (2026-10-25) on the owner's naming direction.
Amends [DR-103](103-the-home-and-its-groups.md), [DR-120](120-the-instance-is-the-space.md), [DR-127](127-a-home-signed-in-to-several-instances.md).
Amended by [DR-246](246-remove-groups-and-team-servers-from-the-clients.md).

## Context

The public server product needs a name independent of its domain.
Its IDE destination covers sign-in, personal projects and synchronization.
An existing home's origin is part of the identity of its connections and stored placements.

## Decision

- The server product is **Spex Space**; its source repository is `spex.space`. An instance remains one deployment of it ([DR-120](120-the-instance-is-the-space.md)).
- `https://spex.sublang.ai` is the intended public origin of the existing internal Cloudflare deployment and the default origin of a newly created home ([DR-127](127-a-home-signed-in-to-several-instances.md)); server setup and the address cutover are pending.
- The cutover reuses that deployment's existing data and resources; instances keep distinct canonical origins.
- The proposed future domain `spex.space` is not an endpoint until the owner acquires it and authorizes a separate cutover.
- The IDE destination is **Space** ([DR-103](103-the-home-and-its-groups.md)).
- Saved origins, credentials, repository keys and placements remain unchanged; configuring another origin continues to use the existing sign-in flow.
- Naming and presentation changes preserve operations, permissions and storage formats.
- Current documentation and examples use the new product and address; historical decisions and release evidence retain their original context.

## Consequences

The product name remains stable when hosting changes.
Space names the destination without conflating it with a deployment.
Existing installations are not silently redirected or migrated by a branding update.
