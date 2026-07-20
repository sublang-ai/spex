<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# SHIP: Deliver a Production Change

## Intent

This composition covers an integrated DevOps outcome: every GitHub change gets a safe fixture preview and clean local integration evidence, a production-configured candidate proves the deployed course-site boundaries, and only that verified artifact receives production traffic.

## Scenarios

### SHIP-1
Composes: [PIPE-1](../../packages/operations/github-delivery.md#pipe-1), [GHID-1](../../packages/access/github-identity.md#ghid-1), [SITE-1](../../packages/web/application-shell.md#site-1), [SITE-2](../../packages/web/application-shell.md#site-2), [LIVE-5](../../packages/operations/production-runtime.md#live-5)
Binds:
- [PIPE-0](../../packages/operations/github-delivery.md#pipe-0) `FixturePreviewRecord` -> [LIVE-0](../../packages/operations/production-runtime.md#live-0) `FixturePreviewRecord`
- [PIPE-0](../../packages/operations/github-delivery.md#pipe-0) `FixtureTrustProfile` -> [LIVE-0](../../packages/operations/production-runtime.md#live-0) `FixtureTrustProfile`
- [LIVE-0](../../packages/operations/production-runtime.md#live-0) `ReadinessReport` -> [PIPE-0](../../packages/operations/github-delivery.md#pipe-0) `ReadinessReport`
- [GHID-0](../../packages/access/github-identity.md#ghid-0) `IdentityView` -> [SITE-0](../../packages/web/application-shell.md#site-0) `IdentityView`
- [GHID-0](../../packages/access/github-identity.md#ghid-0) `SessionState` -> [SITE-0](../../packages/web/application-shell.md#site-0) `SessionState`

When a contributor opens or updates a pull request, the project shall report every required GitHub check, including clean local Supabase composition evidence, and a secret-free fixture preview where course routes and GitHub-only login states render and readiness explicitly identifies the preview as fixture-only rather than provider-integrated or production-ready.

### SHIP-2
Composes: [PIPE-3](../../packages/operations/github-delivery.md#pipe-3), [LIVE-6](../../packages/operations/production-runtime.md#live-6), [GHID-1](../../packages/access/github-identity.md#ghid-1), [SITE-2](../../packages/web/application-shell.md#site-2)
Binds:
- [PIPE-0](../../packages/operations/github-delivery.md#pipe-0) `ProductionCandidateRecord` -> [LIVE-0](../../packages/operations/production-runtime.md#live-0) `ProductionCandidateRecord`
- [PIPE-0](../../packages/operations/github-delivery.md#pipe-0) `ProviderConfigurationAttestation` -> [LIVE-0](../../packages/operations/production-runtime.md#live-0) `ProviderConfigurationAttestation`
- [LIVE-0](../../packages/operations/production-runtime.md#live-0) `ReadinessReport` -> [PIPE-0](../../packages/operations/github-delivery.md#pipe-0) `ReadinessReport`
- [LIVE-0](../../packages/operations/production-runtime.md#live-0) `RuntimeSmokeTarget` -> [PIPE-0](../../packages/operations/github-delivery.md#pipe-0) `RuntimeSmokeTarget`
- [LIVE-0](../../packages/operations/production-runtime.md#live-0) `RuntimeSmokeResult` -> [PIPE-0](../../packages/operations/github-delivery.md#pipe-0) `RuntimeSmokeResult`
- [LIVE-0](../../packages/operations/production-runtime.md#live-0) `ServiceRevisionReport` -> [PIPE-0](../../packages/operations/github-delivery.md#pipe-0) `ServiceRevisionReport`

Where an accepted `main` commit has compatible database and provider configuration, when its unaliased candidate reports all providers ready and passes smoke checks for the login surface and protected-route boundary, the project shall assign that exact recorded deployment ID, commit, database revision, and provider-configuration revision to the production domain without rebuilding it.

### SHIP-3
Composes: [PIPE-4](../../packages/operations/github-delivery.md#pipe-4), [LIVE-2](../../packages/operations/production-runtime.md#live-2), [CAT-1](../../packages/learning/course-catalog.md#cat-1)
Binds:
- [LIVE-0](../../packages/operations/production-runtime.md#live-0) `ReadinessReport` -> [PIPE-0](../../packages/operations/github-delivery.md#pipe-0) `ReadinessReport`
- [LIVE-0](../../packages/operations/production-runtime.md#live-0) `RuntimeSmokeResult` -> [PIPE-0](../../packages/operations/github-delivery.md#pipe-0) `RuntimeSmokeResult`
- [LIVE-0](../../packages/operations/production-runtime.md#live-0) `ServiceRevisionReport` -> [PIPE-0](../../packages/operations/github-delivery.md#pipe-0) `ServiceRevisionReport`

Where a previous production deployment serves a published catalog, when a later change fails any required check, migration, candidate readiness, smoke check, or promotion, the project shall keep the previous deployment and its catalog serving at the production domain and shall mark the failed step on GitHub.

### SHIP-4
Composes: [PIPE-1](../../packages/operations/github-delivery.md#pipe-1), [PIPE-6](../../packages/operations/github-delivery.md#pipe-6), [LIVE-5](../../packages/operations/production-runtime.md#live-5), [CAT-6](../../packages/learning/course-catalog.md#cat-6)
Binds:
- [PIPE-0](../../packages/operations/github-delivery.md#pipe-0) `FixturePreviewRecord` -> [LIVE-0](../../packages/operations/production-runtime.md#live-0) `FixturePreviewRecord`
- [PIPE-0](../../packages/operations/github-delivery.md#pipe-0) `FixtureTrustProfile` -> [LIVE-0](../../packages/operations/production-runtime.md#live-0) `FixtureTrustProfile`

Where production contains sentinel accounts and courses, when an untrusted-fork or same-repository fixture preview is created, the preview shall expose no production sentinel data or secret, shall report provider capabilities not applicable, and shall never bind to a production provider.

### SHIP-5
Composes: [PIPE-5](../../packages/operations/github-delivery.md#pipe-5), [LIVE-4](../../packages/operations/production-runtime.md#live-4), [CAT-1](../../packages/learning/course-catalog.md#cat-1)
Binds:
- [LIVE-0](../../packages/operations/production-runtime.md#live-0) `ServiceRevisionReport` -> [PIPE-0](../../packages/operations/github-delivery.md#pipe-0) `ServiceRevisionReport`
- [LIVE-0](../../packages/operations/production-runtime.md#live-0) `RetainedDeploymentCompatibility` -> [PIPE-0](../../packages/operations/github-delivery.md#pipe-0) `RetainedDeploymentCompatibility`

Where the retained prior production deployment is compatible with every current database, Auth, Storage, and secret revision, when an operator confirms rollback, the project shall restore the exact prior web deployment without rebuild or durable-service rollback and shall continue serving the committed catalog and video metadata through those unchanged current services.
Where the retained deployment is incompatible, the project shall refuse rollback and leave current traffic and durable services unchanged.

### SHIP-6
Composes: [PIPE-7](../../packages/operations/github-delivery.md#pipe-7), [LIVE-1](../../packages/operations/production-runtime.md#live-1), [LIVE-4](../../packages/operations/production-runtime.md#live-4), [GHID-2](../../packages/access/github-identity.md#ghid-2), [GHID-3](../../packages/access/github-identity.md#ghid-3), [ROLE-2](../../packages/access/role-access.md#role-2), [CAT-1](../../packages/learning/course-catalog.md#cat-1), [SITE-1](../../packages/web/application-shell.md#site-1)
Binds:
- [GHID-0](../../packages/access/github-identity.md#ghid-0) `Principal` -> [ROLE-0](../../packages/access/role-access.md#role-0) `Principal`
- [GHID-0](../../packages/access/github-identity.md#ghid-0) `DataAccessIdentity` -> [ROLE-0](../../packages/access/role-access.md#role-0) `DataAccessIdentity`
- [ROLE-0](../../packages/access/role-access.md#role-0) `AuthorizationDecision` for `course.consume` -> [CAT-0](../../packages/learning/course-catalog.md#cat-0) `AuthorizationDecision` for `course.consume`
- [ROLE-0](../../packages/access/role-access.md#role-0) `DataRoleProjection` -> [CAT-0](../../packages/learning/course-catalog.md#cat-0) `DataRoleProjection`
- [GHID-0](../../packages/access/github-identity.md#ghid-0) `IdentityView` -> [SITE-0](../../packages/web/application-shell.md#site-0) `IdentityView`
- [GHID-0](../../packages/access/github-identity.md#ghid-0) `SessionState` -> [SITE-0](../../packages/web/application-shell.md#site-0) `SessionState`
- [ROLE-0](../../packages/access/role-access.md#role-0) `RoleView` -> [SITE-0](../../packages/web/application-shell.md#site-0) `RoleView`
- [CAT-0](../../packages/learning/course-catalog.md#cat-0) `CatalogListView` -> [SITE-0](../../packages/web/application-shell.md#site-0) `CatalogListView`
- [LIVE-0](../../packages/operations/production-runtime.md#live-0) `ServiceRevisionReport` -> [PIPE-0](../../packages/operations/github-delivery.md#pipe-0) `ServiceRevisionReport`
- [LIVE-0](../../packages/operations/production-runtime.md#live-0) `RetainedDeploymentCompatibility` -> [PIPE-0](../../packages/operations/github-delivery.md#pipe-0) `RetainedDeploymentCompatibility`

Where the exact deployment is serving the production domain, when a designated operator completes the documented real-GitHub provider smoke, the website shall create the expected member session, show no administrator navigation, and open the current catalog, and the project shall attach the redacted result to that deployment's evidence.
When the operator cancels GitHub sign-in or the provider authentication step fails, the website shall create no application session from that attempt.
When the real-GitHub provider smoke result is canceled, the project shall keep traffic unchanged, attach canceled evidence, and require a later successful smoke without reporting real-provider evidence passed.
When the real-GitHub provider smoke result fails at authentication, catalog access, or another smoke step, the project shall attach failed evidence and restore the exact previously serving deployment without rebuilding only when fresh compatibility and same-contract provider evidence allow it; otherwise it shall keep traffic unchanged, mark production degraded, and require operator recovery without reporting real-provider evidence passed.

## Verification

### SHIP-20
Verifies: [SHIP-1](#ship-1), [SHIP-4](#ship-4)

Where a test repository has production sentinel data and supports same-repository and untrusted-fork pull requests, when delivery runs for each, the acceptance suite shall assert every required GitHub status for the exact commit, clean local Supabase recreation, the sole GitHub login action and authenticated/anonymous fixture states on usable fixture routes, accurate fixture-only readiness identity, complete protected-resource withholding, and absence of every sentinel value and secret.

### SHIP-21
Verifies: [SHIP-2](#ship-2), [SHIP-3](#ship-3)

Where production serves a known catalog and the delivery test control plane can fail required checks, build, database reconciliation, provider configuration, attestation integrity, candidate creation, readiness, smoke, and promotion in turn, when one successful change and each failure case run, the acceptance suite shall assert the GitHub-only login surface and protected-route boundary on the exact protected production-configured candidate, promotion of its recorded deployment ID without rebuild only on complete success, commit plus database/provider revision evidence, actionable redacted failure evidence, and the previous compatible catalog remaining live for every failure.

### SHIP-22
Verifies: [SHIP-5](#ship-5)

Where compatible and incompatible retained production deployments and current durable course/video metadata exist, when rollback is confirmed for each, the acceptance suite shall assert exact compatible prior-artifact reassignment, no durable-service rollback, retained data identity, a healthy catalog response, complete evidence, and refusal of the incompatible target with current traffic and durable services unchanged.

### SHIP-23
Verifies: [SHIP-6](#ship-6)

Where the production OAuth application and Supabase redirect configuration have passed non-interactive readiness and fixtures provide compatible and incompatible previously serving deployments, when a designated operator performs successful, canceled, provider-authentication-failed, and post-authentication catalog-failed real-GitHub smokes after promotion, the acceptance record shall capture the deployment ID, redacted GitHub identity or failure outcome, catalog outcome, time, and operator without storing provider tokens; the acceptance suite shall assert no application session for cancellation or provider-authentication failure, unchanged traffic plus incomplete evidence on cancellation, exact no-rebuild compatible restoration with durable data continuity on eligible failure, degraded unchanged production on ineligible failure, and no passed real-provider evidence for cancellation or either failure class.
