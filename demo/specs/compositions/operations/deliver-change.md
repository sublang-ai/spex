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
Composes: [PIPE-1](../../packages/operations/github-delivery.md#pipe-1), [PIPE-2](../../packages/operations/github-delivery.md#pipe-2), [GHID-1](../../packages/access/github-identity.md#ghid-1), [VIDS-1](../../packages/media/video-library.md#vids-1), [SITE-1](../../packages/web/application-shell.md#site-1), [SITE-2](../../packages/web/application-shell.md#site-2), [LIVE-5](../../packages/operations/production-runtime.md#live-5)
Bindings: [ENTRY-10](../access/enter-site.md#entry-10), [PLAT-2](install-platform.md#plat-2), [PLAT-5](install-platform.md#plat-5), [PLAT-6](install-platform.md#plat-6), [PLAT-7](install-platform.md#plat-7)

When a contributor opens or updates a pull request to `main`, the project shall require the branch to be current, one approving review, every requested change resolved, and every configured GitHub check passing for the head commit before merge.
It shall include clean local Supabase composition evidence and a secret-free fixture preview where course routes and GitHub-only login states render and readiness explicitly identifies the preview as fixture-only rather than provider-integrated or production-ready.
Its package-check evidence shall record the exact Chrome, Firefox, and WebKit/Safari versions that exercised every accepted video profile.

### SHIP-2
Composes: [PIPE-3](../../packages/operations/github-delivery.md#pipe-3), [LIVE-6](../../packages/operations/production-runtime.md#live-6), [GHID-1](../../packages/access/github-identity.md#ghid-1), [SITE-2](../../packages/web/application-shell.md#site-2)
Bindings: [ENTRY-10](../access/enter-site.md#entry-10), [PLAT-1](install-platform.md#plat-1), [PLAT-4](install-platform.md#plat-4), [PLAT-5](install-platform.md#plat-5), [PLAT-6](install-platform.md#plat-6), [PLAT-7](install-platform.md#plat-7), [ACCESS-5](../access/install-course-access.md#access-5), [SHIP-10](#ship-10), [SHIP-11](#ship-11), [SHIP-12](#ship-12)

Where an accepted `main` commit has compatible database configuration and a provider attestation proving the dedicated Supabase Pro project, GitHub as the sole Auth method, exact provider callback and website redirect origins, private video bucket, 1 GiB project and bucket limits, and the declared privileged-operation inventory, when its unaliased candidate reports the web surface, authentication, role bootstrap, Postgres policies, and video storage ready and passes smoke checks for login and a protected route, the project shall assign that exact recorded deployment ID, commit, database revision, and provider-configuration revision to the production domain without rebuilding it.

### SHIP-3
Composes: [PIPE-4](../../packages/operations/github-delivery.md#pipe-4), [LIVE-2](../../packages/operations/production-runtime.md#live-2), [CAT-1](../../packages/learning/course-catalog.md#cat-1)
Bindings: [SHIP-10](#ship-10), [SHIP-11](#ship-11), [SHIP-12](#ship-12)

Where a previous production deployment serves a published catalog, when a later change fails any required check, migration, candidate readiness, smoke check, or promotion, the project shall keep the previous deployment and its catalog serving at the production domain and shall mark the failed step on GitHub.

### SHIP-4
Composes: [PIPE-1](../../packages/operations/github-delivery.md#pipe-1), [PIPE-6](../../packages/operations/github-delivery.md#pipe-6), [LIVE-5](../../packages/operations/production-runtime.md#live-5), [CAT-6](../../packages/learning/course-catalog.md#cat-6)
Bindings: [PLAT-2](install-platform.md#plat-2), [PLAT-5](install-platform.md#plat-5), [PLAT-6](install-platform.md#plat-6)

Where production contains sentinel accounts and courses, when an untrusted-fork or same-repository fixture preview is created, the preview shall expose no production sentinel data or secret, shall report provider capabilities not applicable, and shall never connect to a production provider.

### SHIP-5
Composes: [PIPE-5](../../packages/operations/github-delivery.md#pipe-5), [LIVE-4](../../packages/operations/production-runtime.md#live-4), [CAT-1](../../packages/learning/course-catalog.md#cat-1)
Bindings: [PLAT-4](install-platform.md#plat-4), [PLAT-5](install-platform.md#plat-5), [PLAT-7](install-platform.md#plat-7), [SHIP-12](#ship-12)

Where the retained prior production deployment is compatible with every current database migration, Auth/API/Storage configuration, secret-set, and durable-provider revision, when an operator confirms rollback, the project shall restore the exact prior web deployment without rebuild or durable-service rollback and shall continue serving the committed catalog and video metadata through those unchanged current services.
Where the retained deployment is incompatible, the project shall refuse rollback and leave current traffic and durable services unchanged.

### SHIP-6
Composes: [PIPE-7](../../packages/operations/github-delivery.md#pipe-7), [LIVE-1](../../packages/operations/production-runtime.md#live-1), [LIVE-4](../../packages/operations/production-runtime.md#live-4), [GHID-2](../../packages/access/github-identity.md#ghid-2), [GHID-3](../../packages/access/github-identity.md#ghid-3), [ROLE-2](../../packages/access/role-access.md#role-2), [CAT-1](../../packages/learning/course-catalog.md#cat-1), [SITE-1](../../packages/web/application-shell.md#site-1)
Bindings: [ENTRY-10](../access/enter-site.md#entry-10), [PLAT-1](install-platform.md#plat-1), [PLAT-4](install-platform.md#plat-4), [PLAT-5](install-platform.md#plat-5), [PLAT-7](install-platform.md#plat-7), [ACCESS-1](../access/install-course-access.md#access-1), [ACCESS-3](../access/install-course-access.md#access-3), [ACCESS-4](../access/install-course-access.md#access-4), [SHIP-10](#ship-10), [SHIP-11](#ship-11), [SHIP-12](#ship-12)

Where the exact deployment is serving the production domain, when a designated operator completes the documented real-GitHub provider smoke, the website shall create the expected member session, show no administrator navigation, and open the current catalog, and the project shall attach the redacted result to that deployment's evidence.
When the operator cancels GitHub sign-in or the provider authentication step fails, the website shall create no application session from that attempt.
When the real-GitHub provider smoke result is canceled, the project shall keep traffic unchanged, attach canceled evidence, and require a later successful smoke without reporting real-provider evidence passed.
When the real-GitHub provider smoke result fails at authentication, catalog access, or another smoke step, the project shall attach failed evidence and restore the exact previously serving deployment without rebuilding only when fresh compatibility and same-contract provider evidence allow it; otherwise it shall keep traffic unchanged, mark production degraded, and require operator recovery without reporting real-provider evidence passed.

## Verification

### SHIP-20
Verifies: [SHIP-1](#ship-1), [SHIP-4](#ship-4)

Where a test repository has production sentinel data and supports stale/current branches, missing/present approval, unresolved/resolved changes, failing/passing checks, and same-repository and untrusted-fork pull requests, when delivery runs for each, the acceptance suite shall assert the exact `main` merge gate, every required GitHub status for the head commit, exact recorded Chrome/Firefox/WebKit-Safari matrix versions, clean local Supabase recreation, the sole GitHub login action and authenticated/anonymous fixture states on usable fixture routes, accurate fixture-only readiness identity, complete protected-resource withholding, and absence of every sentinel value and secret.

### SHIP-21
Verifies: [SHIP-2](#ship-2), [SHIP-3](#ship-3)

Where production serves a known catalog and the delivery test control plane can fail required checks, build, database reconciliation, each declared provider-policy fact, attestation integrity, candidate creation, each application readiness capability, smoke, and promotion in turn, when one successful change and each failure case run, the acceptance suite shall assert the sole GitHub login surface, exact callbacks and redirects, private 1 GiB video storage limits, declared privileged-operation inventory, and protected-route boundary on the exact protected production-configured candidate; promotion of its recorded deployment ID without rebuild only on complete success; commit plus database/provider revision evidence; actionable redacted failure evidence; and the previous compatible catalog remaining live for every failure.

### SHIP-22
Verifies: [SHIP-5](#ship-5)

Where compatible and incompatible retained production deployments and current durable course/video metadata exist, when rollback is confirmed for each, the acceptance suite shall assert exact compatible prior-artifact reassignment, no durable-service rollback, retained data identity, a healthy catalog response, complete evidence, and refusal of the incompatible target with current traffic and durable services unchanged.

### SHIP-23
Verifies: [SHIP-6](#ship-6)

Where the production OAuth application and Supabase redirect configuration have passed non-interactive readiness and fixtures provide compatible and incompatible previously serving deployments, when a designated operator performs successful, canceled, provider-authentication-failed, and post-authentication catalog-failed real-GitHub smokes after promotion, the acceptance record shall capture the deployment ID, redacted GitHub identity or failure outcome, catalog outcome, time, and operator without storing provider tokens; the acceptance suite shall assert no application session for cancellation or provider-authentication failure, unchanged traffic plus incomplete evidence on cancellation, exact no-rebuild compatible restoration with durable data continuity on eligible failure, degraded unchanged production on ineligible failure, and no passed real-provider evidence for cancellation or either failure class.

### SHIP-24
Verifies: [SHIP-10](#ship-10), [SHIP-11](#ship-11), [SHIP-12](#ship-12)

Where provider attestations, candidate targets, readiness, smoke, service-revision, and compatibility fixtures vary project, deployment, commit, environment, revision, and trust source one field at a time, when the installed delivery/runtime seams are checked directly, the conformance suite shall accept only exact matching evidence and shall leave traffic unchanged for every mismatch.
