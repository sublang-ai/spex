<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# PLAT: Install Platform Services

## Intent

This composition installs the external platform services shared across product journeys.
It is binding-only because these cross-cutting selections change with platform configuration rather than with one user scenario.

## Binding

### PLAT-1
Clients: `identity authority` = [GHID-18](../../packages/access/github-identity.md#ghid-18)
Suppliers: `authority` = [Supabase Auth with GitHub OAuth](../../decisions/001-web-platform.md)
Scope: the `production GHID` instance across production-candidate and production deployments

The installation shall supply GHID with the dedicated Supabase Auth authority configured with GitHub OAuth as its sole sign-in method, the declared callback and redirect allowlists, online authority-session validation and termination, and the canonical GitHub subject.

### PLAT-2
Clients: `identity authority` = [GHID-18](../../packages/access/github-identity.md#ghid-18)
Suppliers: `authority` = [deterministic fake GitHub OAuth and local Supabase Auth](../../decisions/001-web-platform.md)
Scope: the `verification GHID` instance across local development and automated pull-request verification

The installation shall supply the same GHID meanings as [PLAT-1](#plat-1) through deterministic non-production authorities carrying no production identity, data, or secret.

### PLAT-4
Clients: `private object service` = [VIDS-25](../../packages/media/video-library.md#vids-25)
Suppliers: `object service` = [private Supabase Storage with TUS upload and signed download](../../decisions/001-web-platform.md)
Scope: each provider-integrated environment's declared private video bucket

The installation shall supply VIDS with the environment-scoped private object service selected by [DR-001](../../decisions/001-web-platform.md), satisfying [VIDS-25](../../packages/media/video-library.md#vids-25) for the declared bucket without broadening object, path, credential, or lifecycle scope or changing package-owned windows and limits.

### PLAT-5
Clients: `web deployment` = [LIVE-19](../../packages/operations/production-runtime.md#live-19)
Suppliers: `web runtime` = [Vercel with Next.js App Router](../../decisions/001-web-platform.md)
Scope: fixture-preview, production-candidate, and production profiles

The installation shall supply LIVE with an immutable environment-scoped Vercel deployment, request-isolated Next.js server execution, private response controls, the exact profile configuration, and protected unaliased candidates; fixture preview shall receive no production connection.

### PLAT-6
Clients: `delivery control planes` = [PIPE-19](../../packages/operations/github-delivery.md#pipe-19)
Suppliers: `repository and CI` = [GitHub repository and Actions](../../decisions/001-web-platform.md), `web deployment` = [Vercel project](../../decisions/001-web-platform.md), `data and provider configuration` = [Supabase project control planes](../../decisions/001-web-platform.md)
Scope: pull-request verification and protected production delivery for this repository

The installation shall supply PIPE only the environment-scoped control planes selected by DR-001, withholding every protected control plane from untrusted refs and fixture previews.

### PLAT-7
Clients: `durable runtime services` = [LIVE-25](../../packages/operations/production-runtime.md#live-25)
Suppliers: `service project` = [environment-scoped Supabase Auth, Postgres, and Storage](../../decisions/001-web-platform.md)
Scope: local provider integration, production-candidate, and production profiles

The installation shall supply LIVE with one environment-scoped Supabase project set naming Auth, Postgres, and Storage identities and their complete expected revisions and health operations, while keeping that durable identity independent of Vercel deployment replacement.

## Verification

### PLAT-20
Verifies: [PLAT-1](#plat-1), [PLAT-2](#plat-2)

Where production and deterministic fixture authorities are configured in turn, when their callbacks, redirect policies, subjects, sessions, provider inventories, and sentinel secrets are inspected, the platform conformance suite shall assert equivalent GHID contract meaning, GitHub-only production entry, and complete production isolation for the fixture authority.

### PLAT-21
Verifies: [PLAT-4](#plat-4), [PLAT-7](#plat-7)

Where clean local and hosted Supabase projects expose Auth, Postgres, and Storage identities and revisions and exercise private object upload, 24-hour TUS resumption, playback, missing/unreadable/mismatched observation, completed-object cleanup, and incomplete-chunk expiry, when the two client contracts are checked against the selected services, the platform conformance suite shall assert environment isolation, complete service identity, durable revision reporting, private exact-object access, distinct cleanup and provider-expiry behavior, stated windows and limits, and no broadened client behavior.

### PLAT-22
Verifies: [PLAT-5](#plat-5), [PLAT-6](#plat-6)

Where fixture, candidate, production, trusted-repository, and untrusted-fork profiles are inspected, when runtime and delivery configuration is resolved, the platform conformance suite shall assert exact project identity, request isolation, correct public/server credential inventory, protected control-plane access only in the matching trusted environment, and no production connection from fixture code.
