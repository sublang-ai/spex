<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-003: Admin Designation

## Status

Accepted

## Context

An admin must exist before any admin UI can, and the site is publicly reachable from its first deployment.
Options considered:

- First user to sign in becomes admin — rejected: a public deployment can be hijacked between deploy and first sign-in.
- Seeded database row — rejected: a manual step outside the spec'd deployment path [[delivery-4](../packages/ops/delivery.md#delivery-4)].
- Configured GitHub username — rejected: usernames are mutable and reusable, so a rename lets a squatter inherit the designation at their next sign-in.
- Configured stable GitHub account ID — chosen.

## Decision

- The deployment configuration names exactly one GitHub account, by its stable account ID, as the initial admin.
- The stored role is recomputed from that configuration at every sign-in, matching the account's stable ID [[access-control-1](../packages/identity/access-control.md#access-control-1)] [[access-control-5](../packages/identity/access-control.md#access-control-5)].
- No role management UI exists ([DR-000](000-product-scope.md)).

## Consequences

- Day zero needs one sign-in and nothing else (the admin-bootstrap package).
- Rotating the admin is a configuration change; it takes effect at each affected account's next sign-in.
- Between a rotation and the demoted account's next sign-in, both accounts may act as admin; the window closes at that account's next sign-in anywhere — the re-recorded role governs all its sessions at once — or when its sessions end, whichever comes first.
- A compromised configuration store equals a compromised admin; the configuration is a secret-grade value [[delivery-7](../packages/ops/delivery.md#delivery-7)].
