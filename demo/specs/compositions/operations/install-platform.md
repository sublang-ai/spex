<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# PLAT: Install Platform Services

## Intent

This composition installs the external platform services shared across product journeys.
It is binding-only because these cross-cutting selections change with platform configuration rather than with one user scenario.

## Binding

### PLAT-1

Where the `production GHID` instance across production-candidate and production deployments uses GHID's [identity-authority intake](../../packages/access/github-identity.md#ghid-14), the installation shall supply the dedicated Supabase Auth authority with GitHub OAuth as its sole sign-in method, declared callback and redirect allowlists, online authority-session validation and termination, and the canonical GitHub subject, as selected by [DR-001](../../decisions/001-web-platform.md).

### PLAT-2

Where the `verification GHID` instance across local development and automated pull-request verification uses GHID's [identity-authority intake](../../packages/access/github-identity.md#ghid-14), the installation shall supply the same GHID meanings through the deterministic fake GitHub OAuth authority and local Supabase Auth selected by [DR-001](../../decisions/001-web-platform.md), carrying no production identity, data, or secret.

### PLAT-3

Where the `local video bucket` instance for local provider integration and the shared `production video bucket` instance for production-candidate and production use VIDS's [private object-service intake](../../packages/media/video-library.md#vids-20), the installation shall supply each with its environment-scoped private Supabase Storage service with TUS upload and signed download selected by [DR-001](../../decisions/001-web-platform.md), without broadening object, path, credential, or lifecycle scope or changing package-owned windows and limits.

### PLAT-4

Where fixture-preview, production-candidate, and production profiles use LIVE's [web-deployment intake](../../packages/operations/production-runtime.md#live-17), the installation shall supply the immutable environment-scoped Vercel deployment with request-isolated Next.js server execution, private response controls, exact profile configuration, and protected unaliased candidates selected by [DR-001](../../decisions/001-web-platform.md); fixture preview shall receive no production connection.

### PLAT-5

Where pull-request verification and protected production delivery for this repository use PIPE's [delivery-control-plane intake](../../packages/operations/github-delivery.md#pipe-17), the installation shall supply only the environment-scoped GitHub repository and Actions, Vercel project, and Supabase project control planes selected by [DR-001](../../decisions/001-web-platform.md), withholding every protected control plane from untrusted refs and fixture previews.

### PLAT-6

Where the `local Supabase services` instance for local provider integration and the shared `production Supabase services` instance for production-candidate and production use LIVE's [durable-runtime-service intake](../../packages/operations/production-runtime.md#live-18), the installation shall supply each with its environment-scoped Supabase project set naming Auth, Postgres, and Storage identities and their complete expected revisions and health operations, as selected by [DR-001](../../decisions/001-web-platform.md), while keeping each durable identity independent of Vercel deployment replacement.

## Verification

### PLAT-7

Where the [production identity authority](#plat-1) and [deterministic fixture authority](#plat-2) are configured in turn, when their callbacks, redirect policies, subjects, sessions, provider inventories, and sentinel secrets are inspected, the platform conformance suite shall assert equivalent GHID contract meaning, GitHub-only production entry, and complete production isolation for the fixture authority.

### PLAT-8

Where clean local and hosted Supabase projects expose the [installed durable runtime services](#plat-6) and exercise the [installed private object service](#plat-3) through upload, 24-hour TUS resumption, playback, missing/unreadable/mismatched observation, completed-object cleanup, and incomplete-chunk expiry, when the two client contracts are checked against those services, the platform conformance suite shall assert environment isolation, complete service identity, durable revision reporting, private exact-object access, distinct cleanup and provider-expiry behavior, stated windows and limits, and no broadened client behavior.

### PLAT-9

Where fixture, candidate, production, trusted-repository, and untrusted-fork profiles are inspected, when the [web runtime](#plat-4) and [delivery control planes](#plat-5) are resolved, the platform conformance suite shall assert exact project identity, request isolation, correct public/server credential inventory, protected control-plane access only in the matching trusted environment, and no production connection from fixture code.
