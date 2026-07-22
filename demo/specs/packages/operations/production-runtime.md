<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# LIVE: Vercel–Supabase Runtime

## Intent

This package gives operators ready/not-ready behavior for Vercel environments, environment-scoped configuration, and Supabase Auth, Postgres, and Storage dependencies across non-production and production.
It owns environment integrity rather than application behavior or delivery decisions and can be reused unchanged with different declared capabilities, provider policy, smoke checks, and privileged-operation inventory.

## External Behavior

### LIVE-1

Where every capability required by the deployment's declared profile is configured and reachable at its expected revision and every supplied application-capability observation has been accepted under [LIVE-16](#live-16), when an operator requests readiness, the runtime status shall provide a readiness report naming that profile and deployed commit and reporting `ready` for each required capability [[1]].

Each deployment shall declare one of these profiles:

| Profile | Observable meaning |
| --- | --- |
| `fixture-preview` | a Vercel preview using deterministic non-secret fixtures; only its declared non-provider capabilities can be ready, and provider-integrated capabilities are not applicable |
| `production-candidate` | a protected unaliased Vercel Production deployment using the production Supabase project and declared provider policy for readiness and smoke checks |
| `production` | the exact promoted candidate serving the production domain with the same durable providers and revisions |

The readiness report shall identify the immutable commit and deployment, report each declared capability as `ready`, `not ready`, `degraded`, or `not applicable`, name the exact provider and policy revisions used for the evaluation, and contain only redacted correlation information.

### LIVE-2

Where any required configuration is absent, malformed, bound to the wrong environment, or reports an unexpected revision, when an operator requests readiness, the runtime status shall report `not ready`, identify the affected capability and environment, and provide a correlation ID without revealing a secret or private object location.

### LIVE-3

While a dependency is unavailable after a deployment is serving, when an operator requests readiness, the runtime status shall report the affected capability as degraded, preserve the status of unaffected capabilities, and keep its diagnostic report reachable.

### LIVE-4

When a new web deployment replaces or rolls back another deployment, the production runtime shall preserve every committed record and object held by its durable Supabase services at the declared compatible revisions.

### LIVE-5

Where a `fixture-preview` is correctly configured, when an operator requests readiness, the runtime status shall identify it as fixture-only, report its declared non-provider capabilities ready, report provider-integrated Auth/Postgres/Storage as not applicable rather than ready, and confirm that no production project identity, data, or secret is connected.

### LIVE-6

Where a `production-candidate` is correctly configured, when an operator requests readiness, the runtime status shall identify the exact unaliased deployment and immutable commit as the protected smoke target, confirm every production provider and policy revision in the readiness report, and keep the target unavailable to ordinary public traffic while allowing the authorized smoke identity.
The reported target shall name its expected service revisions and scoped smoke-access requirement without containing a bypass credential.

### LIVE-13

When environment health is evaluated, the readiness boundary shall use non-mutating probes against the exact environment and shall not create or change an application record, identity, or stored object as a side effect.
Where a smoke target has been accepted under [LIVE-17](#live-17), when an authorized smoke runner supplies an observation naming that deployment, immutable commit, smoke-contract revision, observed conclusion, time, and redacted correlation evidence, the readiness boundary shall accept it only when the expected service revisions also match and shall reject a replay or observation from another deployment.
An accepted smoke result shall repeat the target identity, environment, immutable commit, smoke-contract revision, and service revisions, give its pass or fail conclusion and time, and contain only the redacted correlation evidence for that exact target.

### LIVE-14

When the web deployment changes, the durable-service boundary shall keep Supabase Auth, Postgres, and Storage identity independent of the ephemeral web deployment and shall reject startup against a schema revision outside the deployment's declared compatible range.
When current service revisions or retained-deployment compatibility are requested, the durable-service boundary shall report the current database migration, Auth/API/Storage configuration, secret-set, and durable-provider revisions for the exact environment without changing service state.
That current-service report shall name the environment, evaluation time, and redacted correlation evidence.
For each requested retained deployment, it shall name that deployment ID, commit, environment, declared compatibility range, evaluation time, and redacted correlation evidence and report compatible or incompatible against every one of those current revisions, also without changing service state.

### LIVE-15

When a privileged Supabase client is made available, the privileged-operation inventory shall constrain it to the exact operations declared for the environment after the owning application behavior has authorized each call.
It shall make every ordinary application read or mutation use the caller's user-scoped client and shall report any undeclared privileged call as a readiness and security failure.

### LIVE-24

When deployment readiness evidence is requested by a trusted delivery boundary, the readiness boundary shall report the exact deployment ID, immutable commit, environment, readiness-policy revision, current service revisions, ready, not-ready, or degraded conclusion, evaluation time, and redacted correlation evidence.
It shall produce no evidence for a browser request, a different deployment, a stale policy, or a readiness evaluation with side effects.

## Internal Behavior

### LIVE-11

Where web-deployment and durable-service configuration have been accepted under [LIVE-19](#live-19) and [LIVE-25](#live-25), when a deployment starts or readiness is requested, the configuration boundary shall validate the declared runtime profile, expected application origin and project identities, publishable key, exact server-only application credential inventory, every declared application capability, Postgres migration/policy revision, and functional private-bucket access [[2]].
For production profiles, it shall also require provider-configuration evidence accepted under [LIVE-18](#live-18) for that exact project and commit-compatible configuration revision and shall verify every declared requirement for plan, Auth providers and methods, callbacks, redirect allowlist, bucket privacy, and Storage limits.
The configuration boundary shall not receive or use an identity-provider or Supabase control-plane management credential to recreate those delivery-time checks.

### LIVE-12

When browser-visible configuration is produced, the configuration boundary shall include only the application origin, Supabase URL, and Supabase publishable key appropriate to the declared profile.
The configuration boundary shall withhold and redact every provider secret and privileged credential from responses, build output, logs, readiness detail, and correlation metadata.

### LIVE-10

Where fixture-preview and production profiles exist, the environment registry shall associate fixture preview with deterministic non-secret data and shall associate production candidate and production with the same dedicated production Supabase project and declared external identity-provider applications at their expected revisions.
It shall provide no Supabase service credential, OAuth secret, production database identity, or production Storage identity to fixture preview.

### LIVE-16

When an application-capability readiness observation is supplied during an exact deployment evaluation, the capability intake shall accept it only from the capability's trusted package boundary and only when it names a stable observation ID, evaluation time, capability, expected policy revision, ready or not-ready conclusion, and redacted evidence.
It shall associate an accepted observation with the current deployment and immutable commit, reject browser-supplied, stale, mismatched, replayed, or side-effecting observations, and report the affected capability not ready after rejection.

### LIVE-17

When a protected smoke target is supplied, the smoke-target intake shall accept only a trusted unaliased deployment identity with its immutable commit, environment, expected service revisions, smoke-contract revision, and scoped smoke-access requirement.
It shall reject an aliased, public, stale, browser-supplied, or mismatched target and shall provide no ready smoke result for it.

### LIVE-18

When provider-configuration evidence is supplied, the attestation intake shall accept only a trusted tamper-evident report naming the exact Supabase project, immutable delivery commit, plan, required and forbidden Auth methods, provider callbacks, application redirect allowlist, bucket privacy and limits, configuration revision, workflow, and time without a management credential.
It shall reject browser-supplied, stale, altered, cross-project, cross-commit, incomplete, or credential-bearing evidence.

### LIVE-19

When a web deployment is supplied, the web-deployment intake shall accept only an environment-scoped immutable deployment naming its ID, commit, profile, application origin, public configuration, server-only credential inventory, traffic state, and protected-candidate access when applicable.
It shall reject a cross-environment, mutable, aliased candidate, production-connected fixture, public candidate, or deployment that cannot keep request-specific server state and cookie-changing responses private and non-shared.

### LIVE-25

When durable runtime services are supplied, the service intake shall accept only one environment-scoped Supabase project set naming Auth, Postgres, and Storage identities and their expected policy, migration, configuration, secret-set, and durable-provider revisions, with health operations sufficient for readiness and compatibility evaluation.
It shall reject production services in a fixture profile, cross-project identities, missing revisions, browser credentials beyond the publishable key, or services whose durable identity changes with the web deployment.

## Verification

### LIVE-20
Verifies: [LIVE-1](#live-1), [LIVE-2](#live-2), [LIVE-6](#live-6), [LIVE-11](#live-11), [LIVE-13](#live-13), [LIVE-16](#live-16), [LIVE-17](#live-17), [LIVE-18](#live-18), [LIVE-19](#live-19), [LIVE-24](#live-24), [LIVE-25](#live-25)

Where an environment fixture can vary every runtime value, trusted/stale/tampered provider attestation, schema/policy revision, declared application-capability status, application credential, functional health response, and exact/mismatched/replayed smoke observation without supplying control-plane credentials, when readiness and smoke result are requested for the valid production candidate and one fault at a time, the contract suite shall assert exact ready/not-ready capability, profile, commit, protected smoke target, acceptance only of the matching observation, redaction, correlation ID, and absence of probe-created data.

### LIVE-21
Verifies: [LIVE-3](#live-3), [LIVE-5](#live-5), [LIVE-10](#live-10), [LIVE-12](#live-12)

Where fixture-preview and production fixtures have sentinel secrets and data and each dependency can fail, when both deployments and their browser state, logs, and status are inspected, the contract suite shall assert typed degradation, continued unaffected status, accurate fixture-only capability reporting, and no production-provider connection or sentinel disclosure in preview.

### LIVE-22
Verifies: [LIVE-4](#live-4), [LIVE-14](#live-14)

Where durable fixture data exists and deployment revisions declare compatible and incompatible schema ranges, when replacement, service-revision reporting, compatibility evaluation, and rollback are simulated, the contract suite shall assert an exact current-revision report, one revision-by-revision compatibility result per retained target, data and object continuity for compatible changes, and startup refusal without mutation for incompatible changes.

### LIVE-23
Verifies: [LIVE-15](#live-15)

Where every application operation is observed with distinct user-scoped and sentinel service-role clients, when ordinary and named privileged paths run, the contract suite shall assert user-scoped access for every ordinary operation, exact authorization and scope for each named privileged operation, and a failure report for any unlisted privileged call.

## References

[1]: https://vercel.com/docs/deployments/environments "Vercel: Environments"
[2]: https://vercel.com/docs/environment-variables "Vercel: Environment variables"
