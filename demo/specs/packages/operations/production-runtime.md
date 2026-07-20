<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# LIVE: Production Runtime

## Intent

This package gives operators a ready/not-ready contract for Vercel environments and environment-scoped configuration [[1]][[2]], plus their Supabase Auth, Postgres, and Storage dependencies across non-production and production.
It owns environment integrity, not domain behavior or delivery decisions.


## External Behavior

### LIVE-1

Where every capability required by the deployment's declared profile is configured and reachable at its expected revision, when an operator requests readiness, the runtime status shall provide `ReadinessReport` naming that profile and deployed commit and reporting `ready` for each required capability.
For `production-candidate` and `production`, the runtime status shall require and report web, GitHub-only authentication, role readiness, Postgres schema/policies, and private video storage.

### LIVE-2

Where any required configuration is absent, malformed, bound to the wrong environment, or reports an unexpected revision, when an operator requests readiness, the runtime status shall report `not ready`, identify the affected capability and environment, and provide a correlation ID without revealing a secret or private object location.

### LIVE-3

While a dependency is unavailable after a deployment is serving, when an operator requests readiness, the runtime status shall report the affected capability as degraded, preserve the status of unaffected capabilities, and keep its diagnostic report reachable.

### LIVE-4

When a new web deployment replaces or rolls back another deployment, the production runtime shall preserve accounts, roles, drafts, releases, video metadata, and complete video objects at their committed service revisions.

### LIVE-5

Where a `fixture-preview` is correctly configured, when an operator requests readiness, the runtime status shall identify it as fixture-only, report its route/view capabilities ready, report provider-integrated Auth/Postgres/Storage as not applicable rather than ready, and confirm that no production project identity, data, or secret is bound.

### LIVE-6

Where a `production-candidate` is correctly configured, when an operator requests readiness, the runtime status shall provide `RuntimeSmokeTarget` identifying the exact unaliased deployment and commit, confirm every production provider and policy revision in `ReadinessReport`, and keep the target unavailable to ordinary public traffic while allowing the authorized smoke identity.

## Internal Behavior

### LIVE-10

Where fixture-preview and production profiles exist, the environment registry shall bind fixture preview to deterministic non-secret data and shall bind production candidate and production to the same dedicated production Supabase project and GitHub OAuth application at their declared revisions.
It shall provide no Supabase service credential, OAuth secret, production database identity, or production Storage identity to fixture preview.

### LIVE-11

When a deployment starts or readiness is requested, the configuration boundary shall validate the declared runtime profile, expected application origin and Supabase project identity, publishable key, exact server-only application credential inventory, Postgres migration/policy revision, functional private-bucket access, and bootstrap-role readiness.
For production profiles, it shall also require a current trusted `ProviderConfigurationAttestation` for that exact project, commit-compatible configuration revision, Pro-or-higher plan, GitHub-only Auth identity state [[3]], disabled alternative Auth methods, GitHub-to-Supabase provider callback, website redirect allowlist, and global/bucket 1 GiB limits [[4]].
The configuration boundary shall not receive or use a GitHub or Supabase control-plane management credential to recreate those delivery-time checks.

### LIVE-12

When browser-visible configuration is produced, the configuration boundary shall include only the application origin, Supabase URL, and Supabase publishable key appropriate to the declared profile.
The configuration boundary shall withhold and redact every provider secret and privileged credential from responses, build output, logs, readiness detail, and correlation metadata.

### LIVE-13

When environment health is evaluated, the readiness boundary shall use non-mutating probes against the exact environment and shall not create an account, role, course, release, or video asset as a side effect.
When a `RuntimeSmokeObservation` is supplied for a `RuntimeSmokeTarget`, the readiness boundary shall provide `RuntimeSmokeResult` only when its target identity, immutable commit, smoke-contract revision, and expected service revisions match that exact target and shall reject a replay or observation from another deployment.

### LIVE-14

When the web deployment changes, the durable-service boundary shall keep Supabase Auth, Postgres, and Storage identity independent of the ephemeral web deployment and shall reject startup against a schema revision outside the deployment's declared compatible range.
When current service revisions or retained-deployment compatibility are requested, the durable-service boundary shall provide one `ServiceRevisionReport` for the exact environment and one `RetainedDeploymentCompatibility` per requested retained deployment without changing service state.

### LIVE-15

When a privileged Supabase client is made available, the privileged-operation inventory shall constrain it to exact verified identity reconciliation, application-session revocation, playback signing, upload finalization/cleanup, or readiness probes after the owning package's server authorization.
It shall make ordinary account, role, draft, catalog, and video reads or mutations use the caller's user-scoped client and shall report any unlisted privileged call as a readiness and security failure.

## Verification

### LIVE-20
Verifies: [LIVE-1](#live-1), [LIVE-2](#live-2), [LIVE-6](#live-6), [LIVE-11](#live-11), [LIVE-13](#live-13)

Where an environment fixture can vary every runtime value, trusted/stale/tampered provider attestation, schema/policy revision, role status, application credential, functional health response, and exact/mismatched/replayed smoke observation without supplying control-plane credentials, when readiness and smoke result are requested for the valid production candidate and one fault at a time, the contract suite shall assert exact ready/not-ready capability, profile, commit, protected `RuntimeSmokeTarget`, acceptance only of the matching observation, redaction, correlation ID, and absence of probe-created data.

### LIVE-21
Verifies: [LIVE-3](#live-3), [LIVE-5](#live-5), [LIVE-10](#live-10), [LIVE-12](#live-12)

Where fixture-preview and production fixtures have sentinel secrets and data and each dependency can fail, when both deployments and their browser state, logs, and status are inspected, the contract suite shall assert typed degradation, continued unaffected status, accurate fixture-only capability reporting, and no production binding or sentinel disclosure in preview.

### LIVE-22
Verifies: [LIVE-4](#live-4), [LIVE-14](#live-14)

Where durable fixture data exists and deployment revisions declare compatible and incompatible schema ranges, when replacement, service-revision reporting, compatibility evaluation, and rollback are simulated, the contract suite shall assert exact `ServiceRevisionReport`, one `RetainedDeploymentCompatibility` per target, data and object continuity for compatible changes, and startup refusal without mutation for incompatible changes.

### LIVE-23
Verifies: [LIVE-15](#live-15)

Where every application operation is observed with distinct user-scoped and sentinel service-role clients, when ordinary and named privileged paths run, the contract suite shall assert user-scoped access for every ordinary operation, exact authorization and scope for each named privileged operation, and a failure report for any unlisted privileged call.

## References

[1]: https://vercel.com/docs/deployments/environments "Vercel: Environments"
[2]: https://vercel.com/docs/environment-variables "Vercel: Environment variables"
[3]: https://supabase.com/docs/guides/auth/identities "Supabase: User identities"
[4]: https://supabase.com/docs/guides/storage/uploads/file-limits "Supabase: Storage file limits"

## Binding

### LIVE-0

| Field | Contract |
| --- | --- |
| Human users | operators diagnosing and validating deployed environments |
| Owns | production runtime and runtime status, environment profile/registry/identity, configuration boundary and provider/credential inventory, readiness boundary, `ReadinessReport`, `RuntimeSmokeTarget`, `RuntimeSmokeResult`, `ServiceRevisionReport`, `RetainedDeploymentCompatibility`, diagnostic correlation ID, environment isolation, privileged-operation inventory, durable-service boundary and continuity |
| Receives | `FixturePreviewRecord` or `ProductionCandidateRecord`; `FixtureTrustProfile`; environment-scoped application configuration and secrets; trusted tamper-evident `ProviderConfigurationAttestation` from protected delivery; functional provider health; `RuntimeSmokeObservation` from the authorized smoke runner; `RoleReadiness`; migration/policy state |
| Provides | `ReadinessReport`; protected unaliased `RuntimeSmokeTarget`; `RuntimeSmokeResult`; `ServiceRevisionReport`; `RetainedDeploymentCompatibility` |
| Excludes | application features, authorization policy meaning, migration contents, GitHub checks, traffic promotion, provider internals |
| Reuse | template candidate for Vercel plus Supabase systems with explicit fixture-preview, candidate, and production profiles |

The runtime contracts are:

| Contract | Meaning |
| --- | --- |
| `ReadinessReport` | environment profile, immutable commit/deployment identity, capability-by-capability `ready`, `not-ready`, `degraded`, or `not-applicable` status, exact provider/policy revisions, and redacted correlation IDs |
| `RuntimeSmokeTarget` | exact protected unaliased candidate deployment, immutable commit, scoped smoke-access requirement, and expected service revisions; it contains no bypass credential |
| `RuntimeSmokeObservation` | target identity, immutable commit, smoke-contract revision, observed conclusion, time, and redacted correlation evidence returned by the authorized smoke runner |
| `RuntimeSmokeResult` | target identity, smoke contract revision, pass/fail conclusion, time, and redacted correlation evidence for that exact target |
| `ServiceRevisionReport` | current database migration, Auth/API/Storage configuration, secret-set, and durable-provider revisions for one environment |
| `RetainedDeploymentCompatibility` | one retained deployment ID and commit plus compatible/incompatible result against every revision in one `ServiceRevisionReport` |

The runtime profiles are:

| Profile | Providers and allowed use |
| --- | --- |
| `fixture-preview` | Vercel preview with deterministic, non-secret fixtures; routes, responsive states, and accessibility only; never provider-integrated readiness |
| `production-candidate` | protected unaliased Vercel Production deployment bound to the production Supabase project and configuration for readiness and smoke |
| `production` | the exact promoted candidate deployment serving the production domain with the same durable providers |
