<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-003: Admin Designation

## Status

Accepted

## Context

An admin must exist before any admin UI can, and the site is
publicly reachable from its first deployment.
Options considered:

- First user to sign in becomes admin — rejected: a public
  deployment can be hijacked between deploy and first sign-in.
- Seeded database row — rejected: a manual step outside the
  spec'd deployment path
  ([DELIV-7](../packages/ops/delivery.md#deliv-7)).
- Configured GitHub username — chosen.

## Decision

- The deployment configuration names exactly one GitHub username
  as the initial admin.
- The stored role is recomputed from that configuration at every
  sign-in, matching case-insensitively
  ([ROLE-1](../packages/identity/access-control.md#role-1),
  [ROLE-3](../packages/identity/access-control.md#role-3)).
- No role management UI exists
  ([DR-000](000-product-scope.md)).

## Consequences

- Day zero needs one sign-in and nothing else
  ([BOOT](../compositions/admin-bootstrap.md)).
- Rotating the admin is a configuration change; it takes effect
  at each affected account's next sign-in.
- A compromised configuration store equals a compromised admin;
  the configuration is a secret-grade value
  ([DELIV-5](../packages/ops/delivery.md#deliv-5)).
