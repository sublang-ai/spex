<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# SHIP: Deliver a Production Change

## Intent

This composition covers an integrated DevOps outcome: every GitHub change gets a safe fixture preview and clean local integration evidence, a production-configured candidate proves the deployed course-site boundaries, and only that verified artifact receives production traffic.

## Binding

### SHIP-10
Clients: `provider-configuration attestation` = [LIVE-18](../../packages/operations/production-runtime.md#live-18)
Suppliers: `trusted attestation` = [PIPE-15](../../packages/operations/github-delivery.md#pipe-15)
Scope: each production-candidate and production deployment

The installation shall supply LIVE only PIPE's trusted attestation for the same Supabase project, immutable commit, and provider-configuration revision.

### SHIP-11
Clients: `protected smoke target` = [LIVE-17](../../packages/operations/production-runtime.md#live-17)
Suppliers: `production candidate` = [PIPE-13](../../packages/operations/github-delivery.md#pipe-13)
Scope: each protected production candidate before promotion

The installation shall supply LIVE with PIPE's exact unaliased deployment ID, commit, expected service revisions, smoke contract, and scoped smoke-access requirement without assigning the production domain.

### SHIP-12
Clients: `runtime evidence` = [PIPE-18](../../packages/operations/github-delivery.md#pipe-18)
Suppliers: `readiness result` = [LIVE-24](../../packages/operations/production-runtime.md#live-24), `smoke result` = [LIVE-13](../../packages/operations/production-runtime.md#live-13), `service revisions and compatibility` = [LIVE-14](../../packages/operations/production-runtime.md#live-14)
Scope: promotion, post-promotion evidence, and rollback for each production deployment

The installation shall return LIVE's readiness, smoke, current-service, and retained-compatibility evidence to PIPE unchanged and under the matching evidence shape for the delivery step that requested it.

## Scenario

### SHIP-1

When a contributor opens or updates a [pull request to `main`](../../packages/operations/github-delivery.md#pipe-1), the project shall apply the [protected merge gate](../../packages/operations/github-delivery.md#pipe-2), requiring the branch to be current, one approving review, every requested change resolved, and every configured GitHub check passing for the head commit before merge.
It shall include clean local Supabase composition evidence and a secret-free fixture preview where the public catalog plus GitHub-only login, private playback, and protected administrator states render and [readiness identifies the preview as fixture-only](../../packages/operations/production-runtime.md#live-5) rather than provider-integrated or production-ready.
Its package-check evidence shall record the exact Chrome, Firefox, and WebKit/Safari versions that exercised every accepted video profile.

### SHIP-2

Where an accepted `main` commit has compatible database configuration and an [installed trusted provider attestation](#ship-10) proving the dedicated Supabase Pro project, GitHub as the sole Auth method, exact provider callback and website redirect origins, private video bucket, 1 GiB project and bucket limits, and the declared privileged-operation inventory, when its [installed protected candidate](#ship-11) reports [production-candidate readiness](../../packages/operations/production-runtime.md#live-6) and its authorized smoke runner separately proves [public catalog access](../../packages/learning/course-catalog.md#cat-1) without an application session, an [authenticated GitHub session](../../packages/access/github-identity.md#ghid-3), [exact playback](../../packages/media/video-library.md#vids-4), and [member denial](../../packages/access/role-access.md#role-2) at an administrator surface, the [installed runtime evidence](#ship-12) shall let the [delivery boundary](../../packages/operations/github-delivery.md#pipe-3) assign that exact recorded deployment ID, commit, database revision, and provider-configuration revision to the production domain without rebuilding it.

### SHIP-3

Where a previous production deployment serves a [published catalog](../../packages/learning/course-catalog.md#cat-1), when a later change causes a [delivery failure](../../packages/operations/github-delivery.md#pipe-4) through any required check, migration, candidate readiness, smoke check, or promotion, including a [not-ready runtime](../../packages/operations/production-runtime.md#live-2), the project shall keep the previous deployment and its catalog serving at the production domain and shall mark the failed step on GitHub.

### SHIP-4

Where production contains sentinel accounts and courses, when an [untrusted-fork preview](../../packages/operations/github-delivery.md#pipe-6) or same-repository fixture preview is created, the preview shall expose no production sentinel data or secret, shall report [provider capabilities not applicable](../../packages/operations/production-runtime.md#live-5), shall return the catalog's [uniform unavailable outcome](../../packages/learning/course-catalog.md#cat-6) rather than reveal a production-only course, and shall never connect to a production provider.

### SHIP-5

Where [installed runtime evidence](#ship-12) proves the retained prior production deployment compatible with every current database migration, Auth/API/Storage configuration, secret-set, and durable-provider revision, when an operator confirms the [delivery rollback](../../packages/operations/github-delivery.md#pipe-5), the project shall restore the exact prior web deployment without rebuild or durable-service rollback, [preserve the durable records and objects](../../packages/operations/production-runtime.md#live-4), and continue serving the [committed catalog](../../packages/learning/course-catalog.md#cat-1) and video metadata through those unchanged current services.
Where the retained deployment is incompatible, the project shall refuse rollback and leave current traffic and durable services unchanged.

### SHIP-6

Where the exact deployment is [ready on the production domain](../../packages/operations/production-runtime.md#live-1), when a designated operator completes the documented [real-provider smoke](../../packages/operations/github-delivery.md#pipe-7), the website shall first open the [current catalog](../../packages/learning/course-catalog.md#cat-1) without an application session, then create the [expected member session through GitHub](../../packages/access/github-identity.md#ghid-3), show no administrator navigation, enforce [member denial](../../packages/access/role-access.md#role-2) at the administrator surface, and play the [exact attached smoke video](../../packages/media/video-library.md#vids-4), and the project shall attach the separate redacted results to that deployment's evidence.
When the operator cancels GitHub sign-in or the provider authentication step fails, the website shall follow the [unsuccessful sign-in outcome](../../packages/access/github-identity.md#ghid-2) and create no application session from that attempt.
When the real-GitHub provider smoke result is canceled, the project shall keep traffic unchanged, attach canceled evidence, and require a later successful smoke without reporting real-provider evidence passed.
When the real-GitHub provider smoke result fails at anonymous catalog access, authentication, playback, administrator denial, or another smoke step, the project shall attach failed evidence and restore the exact previously serving deployment without rebuilding only when fresh compatibility and same-contract [runtime evidence](#ship-12) allow [durable-service preservation](../../packages/operations/production-runtime.md#live-4); otherwise it shall keep traffic unchanged, mark production degraded, and require operator recovery without reporting real-provider evidence passed.

## Verification

### SHIP-20

Where a test repository has production sentinel data and supports stale/current branches, missing/present approval, unresolved/resolved changes, failing/passing checks, and same-repository and untrusted-fork pull requests, when delivery runs for each, the acceptance suite shall assert the [pull-request gate and fixture-preview outcome](#ship-1), the [preview-isolation boundary](#ship-4), exact recorded Chrome/Firefox/WebKit-Safari matrix versions, clean local Supabase recreation, usable fixture routes, complete protected-resource withholding, and absence of every sentinel value and secret.

### SHIP-21

Where production serves a known catalog and the delivery test control plane can fail required checks, build, database reconciliation, each declared provider-policy fact, attestation integrity, candidate creation, each application readiness capability, each separated smoke step, and promotion in turn, when one successful change and each failure case run, the acceptance suite shall assert the [successful candidate promotion](#ship-2) only on complete success and the [previous-production preservation](#ship-3) for every failure, including anonymous public-catalog access, sole GitHub login with exact callbacks and redirects, exact authenticated playback, member denial, private 1 GiB storage limits, privileged-operation inventory, revision evidence, and actionable redacted diagnostics.

### SHIP-22

Where compatible and incompatible retained production deployments and current durable course/video metadata exist, when rollback is confirmed for each, the acceptance suite shall assert the [compatible and incompatible rollback outcomes](#ship-5): exact compatible prior-artifact reassignment, no durable-service rollback, retained data identity, a healthy catalog response, complete evidence, and refusal of the incompatible target with current traffic and durable services unchanged.

### SHIP-23

Where the production OAuth application and Supabase redirect configuration have passed non-interactive readiness and fixtures provide compatible and incompatible previously serving deployments, when a designated operator performs each [real-GitHub smoke outcome](#ship-6) after promotion, the acceptance record shall capture the deployment ID, separate public-catalog, redacted GitHub identity, playback, and administrator-boundary outcomes, time, and operator without storing provider tokens; the acceptance suite shall assert no authentication attempt after anonymous-catalog failure, no application session for cancellation or provider-authentication failure, unchanged traffic plus incomplete evidence on cancellation, exact no-rebuild compatible restoration with durable data continuity on each eligible failure, degraded unchanged production on each ineligible failure, and no passed real-provider evidence for any incomplete or failed class.

### SHIP-24

Where [provider attestation](#ship-10), [candidate target](#ship-11), and [runtime evidence](#ship-12) fixtures vary project, deployment, commit, environment, revision, and trust source one field at a time, when the installed delivery/runtime seams are checked directly, the conformance suite shall accept only exact matching evidence and shall leave traffic unchanged for every mismatch.
