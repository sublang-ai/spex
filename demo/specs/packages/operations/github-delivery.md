<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# PIPE: GitHub Delivery

## Intent

This package turns reviewed GitHub commits into safe fixture previews and a verified Vercel production change while preserving the last good production service on failure.
It is the concrete DevOps package for this demo.


## External Behavior

### PIPE-1

When a contributor opens or updates a pull request to `main`, the delivery status shall run the complete required check set for that commit, publish one secret-free `FixturePreviewRecord`, label its limited capability and trust profile, and show each check's pending, passed, failed, or canceled result on the pull request.

### PIPE-2

Where a pull request targets `main`, the repository gate shall prevent merge until the branch is current, one approving review exists, every required check for the head commit passes, and every review-requested change is resolved.
The repository gate shall enforce those conditions through the `main` ruleset rather than report them as advisory [[2]].

### PIPE-3

When an accepted commit reaches `main`, the delivery status shall serialize one production change, reconcile the received `ServiceRevisionReport`, create one protected unaliased `ProductionCandidateRecord` without assigning the production domain, apply only reviewed database and provider-configuration changes compatible with both the serving and candidate deployments, require successful `ReadinessReport` and `RuntimeSmokeResult` for that exact deployment, and assign production traffic to its recorded deployment ID without rebuilding only after every step succeeds.

### PIPE-4

When a required check, migration, build, readiness probe, smoke check, or promotion fails, the delivery status shall produce failed `DeliveryEvidence` for the commit and step with actionable diagnostics, expose no secret, and leave the previously assigned production deployment serving traffic.

### PIPE-5

Where a prior production deployment has `RetainedDeploymentCompatibility` with the current database, Auth, Storage, and secret revisions, when an operator confirms rollback, the delivery status shall produce an allowed `RollbackDecision`, reassign production traffic to that exact deployment without rebuilding it, and record the operator, source deployment, target deployment, current service revisions, time, and result.
Where compatibility cannot be proved, the delivery status shall produce a denied `RollbackDecision`, refuse rollback, and identify the incompatible revision.

### PIPE-6

Where pull-request code originates from an untrusted fork, when delivery evaluates it, the delivery status shall run only jobs and fixture preview that receive no protected environment, provider credential, or production data.
It shall require a maintainer to bring the reviewed commit into a trusted repository ref before any protected delivery job can evaluate that code.

### PIPE-7

Where a promoted deployment is serving, when its exact `RealProviderSmokeResult` passes, the delivery status shall attach redacted passed `DeliveryEvidence` to that exact `ProductionDeploymentRecord` and shall not store a provider token.
When that result is canceled, the delivery status shall attach canceled evidence, mark real-provider evidence incomplete, keep current traffic unchanged, and require a later successful smoke before reporting the evidence passed.
When that result fails, the delivery status shall attach failed evidence and shall reassign the exact previously serving deployment without rebuild only when a fresh `RetainedDeploymentCompatibility` covers every current service revision and retained evidence proves that deployment passed the same smoke contract at the current provider-configuration revision; otherwise it shall keep current traffic unchanged, mark production degraded, and require operator recovery without reporting real-provider evidence passed.

## Internal Behavior

### PIPE-10

When delivery work starts for a commit, the workflow boundary shall grant each job only the repository and environment permissions it needs and shall cancel superseded pull-request or pre-mutation production work that can no longer produce a current result.
When production mutation begins, the workflow boundary shall hold the exclusive production environment and shall not cancel or overlap the mutation-through-evidence sequence.

### PIPE-11

When a fixture preview is created, the preview boundary shall bind only deterministic non-secret fixtures, mark the commit, `fixture-preview` profile, and `FixtureTrustProfile` in its `FixturePreviewRecord`, and reject any Supabase service credential, OAuth secret, or production provider identity.
It shall give untrusted fork code no path to a protected job; maintainer approval alone shall not inject secrets into the fork's workflow context.

### PIPE-12

When a production change includes database changes, the migration boundary shall reconcile the current applied history to an exact prefix of versioned Supabase migrations and shall accept only reviewed, forward-applicable changes compatible with both the previously serving and candidate application revisions [[3]].
The migration boundary shall apply destructive contraction only in a later change after production evidence shows no serving or retained rollback revision depends on the removed shape.
It shall run transactional changes atomically and shall require a reviewed recovery procedure before any non-transactional change can begin.

### PIPE-13

When a production candidate is requested, the promotion boundary shall first verify that Vercel automatic assignment of custom production domains is disabled and shall refuse `ProductionCandidateRecord` creation when it is not.
Where that setting is disabled, the promotion boundary shall create a staged Production deployment without the production domain, record it as `ProductionCandidateRecord`, protect its unaliased target from ordinary traffic, and grant only the smoke job a scoped bypass [[1]].
When that exact deployment passes smoke verification, the promotion boundary shall assign its recorded deployment ID to the production domain without rebuilding it and shall bind the deployment record to its immutable Git commit and current database and provider-configuration revisions.

### PIPE-14

When any delivery result is reported, the evidence boundary shall produce `DeliveryEvidence` associating it with workflow run, Git commit, environment, deployment identity, database migration revision, provider-configuration revision, timestamps, and conclusion so a maintainer can audit which artifact and service state were tested and promoted.

### PIPE-15

When reviewed Supabase Auth, API, or Storage configuration differs from production, the provider-configuration boundary shall require compatibility with both the serving and candidate deployments, apply the exact versioned change through its protected control-plane management path, and capture its resulting revision separately from database migration history.
After reading the resulting control-plane state, it shall produce a trusted tamper-evident `ProviderConfigurationAttestation` naming project identity, plan, GitHub provider state, provider callback registration, application redirect allowlist, disabled Auth methods, private bucket, global/bucket Storage limits, configuration revision, workflow, commit, and time without containing a management credential.

### PIPE-16

When web rollback is requested, the migration boundary shall leave current Postgres, Auth, and Storage state unchanged and the promotion boundary shall require the retained deployment's declared compatibility range to include every current service revision before reassignment.

### PIPE-17

When a `RealProviderSmokeResult` is received, the evidence boundary shall accept it only when its deployment ID, commit, smoke-contract revision, provider-configuration revision, designated runner identity, and result identity match the current `ProductionDeploymentRecord` and shall bind an exact result identity at most once.
The evidence boundary shall reject a browser-supplied, altered, replayed, cross-deployment, stale-configuration, or unauthorized-runner result without changing traffic or existing evidence.

## Verification

### PIPE-20
Verifies: [PIPE-1](#pipe-1), [PIPE-2](#pipe-2), [PIPE-6](#pipe-6), [PIPE-10](#pipe-10), [PIPE-11](#pipe-11)

Where repository fixtures cover branch updates, stale approvals, failed checks, same-repository changes, untrusted forks, and superseded commits, when pull-request delivery runs, the workflow contract suite shall assert the exact `RequiredStatusSet`, `FixtureTrustProfile`, and limited `FixturePreviewRecord`, merge blocking, minimal permissions, complete protected-resource withholding for fork code, and cancellation of obsolete safe-to-cancel work.

### PIPE-21
Verifies: [PIPE-3](#pipe-3), [PIPE-4](#pipe-4), [PIPE-7](#pipe-7), [PIPE-12](#pipe-12), [PIPE-13](#pipe-13), [PIPE-14](#pipe-14), [PIPE-15](#pipe-15), [PIPE-17](#pipe-17)

Where a fake deployment control plane, database model, provider-management model, and concurrent main commits exercise success, pre-mutation cancellation, forbidden post-mutation cancellation, overlap attempts, attestation tampering, failure at each production step, exact and forged/replayed/cross-deployment post-promotion results, and passed/canceled/failed real-provider smoke with compatible-current-evidence and incompatible/no-evidence retained targets, when delivery runs, the contract suite shall assert exact-prefix reconciliation, expand-first compatibility, transactional or declared recovery behavior, exclusive noncancelable mutation-through-evidence, complete non-secret `ProviderConfigurationAttestation`, matching `ProductionCandidateRecord`, `RuntimeSmokeTarget`, `ReadinessReport`, and `RuntimeSmokeResult`, promotion without rebuild only on full pre-promotion success, acceptance of only the exact designated `RealProviderSmokeResult`, exact redacted real-provider evidence state, exact prior-artifact reassignment only with both current compatibility and same-contract/current-provider passing evidence, degraded current traffic otherwise, no provider-token storage, and complete `DeliveryEvidence`/`ProductionDeploymentRecord` linkage.

### PIPE-22
Verifies: [PIPE-5](#pipe-5), [PIPE-16](#pipe-16)

Where retained compatible and incompatible production deployments exist against current `ServiceRevisionReport`, when rollback is confirmed for each, the workflow contract suite shall assert an allowed `RollbackDecision` and exact compatible-artifact reassignment without rebuild, no database/Auth/Storage rollback, complete evidence, and a denied `RollbackDecision` for the incompatible target.

## References

[1]: https://vercel.com/docs/deployments/promoting-a-deployment "Vercel: Promoting a deployment"
[2]: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets "GitHub: About rulesets"
[3]: https://supabase.com/docs/guides/deployment/database-migrations "Supabase: Database migrations"

## Binding

### PIPE-0

| Field | Contract |
| --- | --- |
| Human users | contributors, reviewers, maintainers, and deployment operators |
| Owns | delivery status, repository gate and ruleset configuration, workflow/preview/migration/provider-configuration/promotion/evidence boundaries, migration plan/history, required checks, `RequiredStatusSet`, pull-request delivery status, `FixtureTrustProfile`, `FixturePreviewRecord`, serialized production change, `ProductionCandidateRecord`, `ProviderConfigurationAttestation`, `DeliveryEvidence`, `ProductionDeploymentRecord`, `RollbackDecision`, rollback action |
| Receives | `GitChange` naming commit, pull request, and trust class; `ApplicationCheckResults`; versioned Supabase migrations and Auth/API/Storage configuration; `ReadinessReport`; `RuntimeSmokeTarget`; `RuntimeSmokeResult`; trusted post-promotion `RealProviderSmokeResult` from the designated runner; `ServiceRevisionReport`; `RetainedDeploymentCompatibility` |
| Provides | `RequiredStatusSet`; `FixtureTrustProfile`; `FixturePreviewRecord`; trusted tamper-evident `ProviderConfigurationAttestation`; immutable `ProductionCandidateRecord`; `DeliveryEvidence`; `ProductionDeploymentRecord`; `RollbackDecision` |
| Excludes | application behavior, migration content, runtime health semantics, domain data, secret values |
| Reuse | template candidate for GitHub, Vercel, and Supabase projects; required check set and smoke contract are explicit variation points |

The delivery contracts are:

| Contract | Meaning |
| --- | --- |
| `RequiredStatusSet` | the exact required-check names and pending/passed/failed/canceled conclusion for one immutable commit |
| `GitChange` | immutable commit, pull-request/base identity when present, repository-ref trust class, and supersession state |
| `ApplicationCheckResults` | check name, immutable commit, conclusion, and redacted evidence for the required check set |
| `FixtureTrustProfile` | `trusted-fixture` or `untrusted-fixture`, both secret-free and incapable of protected-provider access |
| `FixturePreviewRecord` | preview URL, immutable commit, `fixture-preview` profile, trust profile, declared route/view-only capabilities, and status |
| `ProviderConfigurationAttestation` | tamper-evident project/configuration facts named in [PIPE-15](#pipe-15), with workflow/commit/time and no management credential |
| `ProductionCandidateRecord` | immutable commit, protected unaliased deployment ID/target, declared compatibility range, and exact database/provider revision expectations |
| `DeliveryEvidence` | workflow, commit, environment, candidate/deployment identity, service revisions, step conclusions, timestamps, redacted diagnostics, and `real-provider-evidence: pending`, `passed`, `failed`, or `canceled` |
| `RealProviderSmokeResult` | result ID, exact production deployment ID and commit, smoke-contract and provider-configuration revisions, passed/failed/canceled result, redacted identity or failure class, catalog outcome, designated runner/operator identity, and time, with no provider token |
| `ProductionDeploymentRecord` | the exact promoted deployment ID, commit, production domain assignment, service revisions, promotion time, and linked evidence |
| `RollbackDecision` | allowed with one exact compatible retained deployment target, or denied with the incompatible service revision and no traffic change |

The required pull-request check set is:

| Check | Required outcome |
| --- | --- |
| formatting and lint | repository and spec conventions pass |
| types | TypeScript type check passes |
| package tests | all package Verification suites pass |
| composition tests | every automatable composition Verification suite passes; the separately authorized real-provider smoke remains release evidence |
| production build | Next.js production build succeeds |
| database recreation | migrations, policies, bucket config, generated types, and seed fixtures recreate a clean local Supabase environment |
| fixture preview | secret-free Vercel preview renders the route, view-state, responsive, and accessibility smoke set and reports the fixture-only profile |
