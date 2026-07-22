<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-003: Designate the Initial Administrator

## Status

Accepted for the demo.

## Context

The first deployment needs one administrator without making login order, mutable profile data, or a manual database edit part of authorization.
The designation must survive GitHub login changes while keeping role administration outside this minimal product.

## Decision

- Deployment configuration designates the administrator by the exact pair `github` and one canonical GitHub numeric subject stored as a string.
  Trusted sign-in evidence supplies that stable subject; usernames, display names, email addresses, and client claims do not participate in the comparison.
- The first account to sign in receives no special status.
  A matching account becomes administrator on that sign-in, and every nonmatching authenticated account becomes a member, regardless of sign-in order.
- The product provides no role-management, promotion, invitation, or administrator-transfer interface and requires no manually seeded role record.
- Administrator rotation changes the configured subject and takes effect for each affected account at its next sign-in.
  A session established before the change may retain its assigned role until it signs out or expires, so an old and new administrator session may overlap during the rotation window.
  Immediate cutoff therefore requires ending the old session.

## Consequences

- The designation is deterministic, avoids a first-login race and manual seed, and survives username and profile changes.
- Rotation is configuration-driven but is not instantaneous for active sessions; the temporary overlap is an accepted limitation of this version.
- Role administration and multiple designated administrators remain outside the product.
