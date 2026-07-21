<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# PIPE: GitHub–Vercel–Supabase Delivery

## Intent

This package turns reviewed GitHub commits for TypeScript Next.js applications into secret-free fixture previews and verified Vercel production changes backed by Supabase.
It preserves the last good production service on failure and can be reused unchanged by repositories using the stated package/composition verification conventions and supplying their integration branch, review threshold, check names, provider policy, and smoke expectations.

## User Behavior

### PIPE-1

When a contributor opens or updates a pull request to the configured integration branch, the delivery status shall run the complete required check set for that commit, publish one secret-free fixture preview, label its limited capability and trust profile, and show each check's pending, passed, failed, or canceled result on the pull request.

The required check set shall cover these outcomes, using the repository's configured check names:

| Outcome | Requirement |
| --- | --- |
| formatting and lint | repository and specification conventions pass |
| types | TypeScript type checking passes |
| package tests | every package Verification suite passes, with each package-declared browser or tool matrix recorded by exact version in check evidence |
| composition tests | every automatable composition Verification suite passes; separately authorized real-provider smoke remains release evidence |
| production build | the production Next.js build succeeds |
| database recreation | migrations, policies, bucket configuration, generated types, and seed fixtures recreate a clean local Supabase environment |
| fixture preview | the secret-free Vercel preview renders its declared route, responsive, and accessibility smoke set and reports its fixture-only profile |

### PIPE-2

Where a pull request targets the configured integration branch, the repository gate shall prevent merge until the branch is current, the configured approving-review threshold is met, every required check for the head commit passes, and every review-requested change is resolved.
The repository gate shall enforce those conditions through that branch's ruleset rather than report them as advisory [[2]].

### PIPE-3

When an accepted commit reaches the configured integration branch, the delivery status shall serialize one production change, reconcile runtime evidence accepted under [PIPE-18](#pipe-18), create one protected unaliased production candidate without assigning the production domain, apply only reviewed database and provider-configuration changes compatible with both the serving and candidate deployments, require successful readiness and smoke results for that exact deployment, and assign production traffic to its recorded deployment ID without rebuilding only after every step succeeds.

### PIPE-4

When a required check, migration, build, readiness probe, smoke check, or promotion fails, the delivery status shall record failed delivery evidence for the commit and step with actionable diagnostics, expose no secret, and leave the previously assigned production deployment serving traffic.

### PIPE-5

Where runtime evidence accepted under [PIPE-18](#pipe-18) proves a prior production deployment compatible with every current database migration, Auth/API/Storage configuration, secret-set, and durable-provider revision, when an operator confirms rollback, the delivery status shall allow rollback, reassign production traffic to that exact deployment without rebuilding it, and record the operator, source deployment, target deployment, current service revisions, time, and result.
Where compatibility with any current revision cannot be proved, the delivery status shall deny rollback, leave traffic unchanged, and identify the incompatible revision.

### PIPE-6

Where pull-request code originates from an untrusted fork, when delivery evaluates it, the delivery status shall run only jobs and fixture preview that receive no protected environment, provider credential, or production data.
It shall require a maintainer to bring the reviewed commit into a trusted repository ref before any protected delivery job can evaluate that code.

### PIPE-7

Where a promoted deployment is serving, when its exact authorized real-provider smoke report passes, the delivery status shall attach redacted passed evidence to that exact production deployment record and shall not store a provider token.
When that report is canceled, the delivery status shall attach canceled evidence, mark real-provider evidence incomplete, keep current traffic unchanged, and require a later successful smoke before reporting the evidence passed.
When that report fails, the delivery status shall attach failed evidence and shall reassign the exact previously serving deployment without rebuild only when fresh compatibility evidence covers every current service revision and retained evidence proves that deployment passed the same smoke contract at the current provider-configuration revision; otherwise it shall keep current traffic unchanged, mark production degraded, and require operator recovery without reporting real-provider evidence passed.

## Collaborator Behavior

### PIPE-11

When a fixture preview is created, the preview boundary shall associate only deterministic non-secret fixtures and shall record its URL, immutable commit, `fixture-preview` profile, declared route and view-only capabilities, current status, and a `trusted fixture` or `untrusted fixture` classification derived from the repository-ref trust class.
The preview boundary shall keep both classifications secret-free and incapable of protected-provider access and shall reject any Supabase service credential, OAuth secret, or production provider identity.
It shall give untrusted fork code no path to a protected job; maintainer approval alone shall not inject secrets into the fork's workflow context.

### PIPE-13

When a production candidate is requested, the promotion boundary shall first verify that Vercel automatic assignment of custom production domains is disabled and shall refuse candidate creation when it is not.
Where that setting is disabled, the promotion boundary shall create a staged Production deployment without the production domain, record its `production-candidate` environment, immutable commit, protected unaliased deployment ID and target, declared compatibility range, smoke-contract revision, complete expected database, Auth/API/Storage configuration, secret-set, and durable-provider revisions, protect the target from ordinary traffic, and grant only the smoke job a scoped bypass [[1]].
When that exact deployment passes smoke verification, the promotion boundary shall assign its recorded deployment ID to the production domain without rebuilding it and shall associate the production deployment record with its immutable Git commit, production-domain assignment, current service revisions, promotion time, and linked delivery evidence.

### PIPE-14

When any delivery result is reported, the evidence boundary shall record its workflow run, Git commit, environment, deployment identity, database migration revision, provider-configuration revision, every exact browser or tool matrix reported by required checks, timestamps, conclusion, and redacted diagnostics so a maintainer can audit which artifact, test environment, and service state were tested and promoted.

### PIPE-15

When provider-configuration evidence is requested for a production candidate, the provider-configuration boundary shall compare reviewed Supabase Auth, API, and Storage configuration with production.
Where they differ, it shall require compatibility with both serving and candidate deployments, apply the exact versioned change through its protected control-plane management path, and capture its resulting revision separately from database migration history; where they match, it shall perform no configuration mutation.
In either case, after reading current control-plane state, it shall produce a trusted tamper-evident attestation naming project identity, plan, every Auth provider and method required or forbidden by the declared policy, provider callbacks, application redirect allowlist, bucket privacy and Storage limits, configuration revision, workflow, exact candidate commit, and time without containing a management credential.

### PIPE-17

When an authorized real-provider smoke report is received, the evidence boundary shall require it to name a stable result identity, exact production deployment ID and commit, smoke-contract and provider-configuration revisions, a passed, failed, or canceled conclusion, the declared smoke outcomes or redacted failure class, designated runner or operator identity, and time, and to contain no provider token.
The evidence boundary shall accept it only when its deployment ID, commit, smoke-contract revision, provider-configuration revision, designated runner or operator identity, and result identity match the current production deployment record and shall associate an exact result identity at most once.
The evidence boundary shall reject a browser-supplied, altered, replayed, cross-deployment, stale-configuration, or unauthorized-runner result without changing traffic or existing evidence.

## Internal Behavior

### PIPE-10

When delivery work starts for a commit, the workflow boundary shall grant each job only the repository and environment permissions it needs and shall cancel superseded pull-request or pre-mutation production work that can no longer produce a current result.
When production mutation begins, the workflow boundary shall hold the exclusive production environment and shall not cancel or overlap the mutation-through-evidence sequence.

### PIPE-12

When a production change includes database changes, the migration boundary shall reconcile the current applied history to an exact prefix of versioned Supabase migrations and shall accept only reviewed, forward-applicable changes compatible with both the previously serving and candidate application revisions [[3]].
The migration boundary shall apply destructive contraction only in a later change after production evidence shows no serving or retained rollback revision depends on the removed shape.
It shall run transactional changes atomically and shall require a reviewed recovery procedure before any non-transactional change can begin.

### PIPE-16

When web rollback is requested, the migration boundary shall leave current Postgres, Auth, and Storage state unchanged and the promotion boundary shall require the retained deployment's declared compatibility range to include every current service revision before reassignment.

### PIPE-18

When candidate readiness, smoke, current-service revision, or retained-deployment compatibility evidence is supplied, the runtime-evidence intake shall accept it only from a trusted source and only when the fields required below match the exact delivery step that requested them:

| Evidence | Required matching fields |
| --- | --- |
| candidate readiness | deployment ID, immutable commit, environment, readiness-policy revision, current service revisions, conclusion, evaluation time, redacted correlation evidence |
| smoke | deployment ID, immutable commit, environment, smoke-contract revision, service revisions, conclusion, time, redacted correlation evidence |
| current services | environment, database/Auth/API/Storage/secret-set/durable-provider revisions, evaluation time, redacted correlation evidence |
| retained compatibility | retained deployment ID and commit, environment, declared compatibility range, every current service revision, compatible or incompatible conclusion, evaluation time, redacted correlation evidence |

It shall reject missing, stale, replayed, browser-supplied, cross-deployment, cross-environment, or mismatched evidence and shall allow neither promotion nor rollback from a rejected result.

### PIPE-19

When repository, deployment, database, or provider-configuration control-plane access is supplied, the control-plane intake shall accept only the configured GitHub repository and Actions environment, Vercel project, and Supabase project for the exact environment and delivery commit.
It shall reject a cross-project, cross-environment, untrusted-ref, browser-supplied, or mismatched control plane and shall begin no protected mutation through it.

## Verification

### PIPE-20
Verifies: [PIPE-1](#pipe-1), [PIPE-2](#pipe-2), [PIPE-6](#pipe-6), [PIPE-10](#pipe-10), [PIPE-11](#pipe-11)

Where repository fixtures cover branch updates, stale approvals, failed checks, same-repository changes, untrusted forks, and superseded commits, when pull-request delivery runs, the workflow contract suite shall assert the exact required-check results, fixture trust classification, and limited preview identity and capabilities; merge blocking; minimal permissions; complete protected-resource withholding for fork code; and cancellation of obsolete safe-to-cancel work.

### PIPE-21
Verifies: [PIPE-3](#pipe-3), [PIPE-4](#pipe-4), [PIPE-7](#pipe-7), [PIPE-12](#pipe-12), [PIPE-13](#pipe-13), [PIPE-14](#pipe-14), [PIPE-15](#pipe-15), [PIPE-17](#pipe-17), [PIPE-18](#pipe-18), [PIPE-19](#pipe-19)

Where a fake deployment control plane, database model, provider-management model with both matching and changed provider configuration, and concurrent integration-branch commits exercise success, pre-mutation cancellation, forbidden post-mutation cancellation, overlap attempts, attestation tampering, failure at each production step, exact and forged/replayed/cross-deployment post-promotion results, and passed/canceled/failed real-provider smoke with compatible-current-evidence and incompatible/no-evidence retained targets, when delivery runs, the contract suite shall assert no mutation for matching configuration, exact versioned mutation for changed configuration, complete non-secret attestation in both cases, exact-prefix reconciliation, expand-first compatibility, transactional or declared recovery behavior, exclusive noncancelable mutation-through-evidence, matching candidate, smoke target, readiness, and smoke result, promotion without rebuild only on full pre-promotion success, acceptance of only the exact designated real-provider result, exact redacted evidence state including every required versioned browser or tool matrix, exact prior-artifact reassignment only with both current compatibility and same-contract/current-provider passing evidence, degraded current traffic otherwise, no provider-token storage, and complete delivery-to-deployment evidence linkage.

### PIPE-22
Verifies: [PIPE-5](#pipe-5), [PIPE-16](#pipe-16)

Where retained compatible and incompatible production deployments exist against the current database migration, Auth/API/Storage configuration, secret-set, and durable-provider revisions, when rollback is confirmed for each, the workflow contract suite shall assert exact compatible-artifact reassignment without rebuild, no database/Auth/Storage rollback, complete allowed evidence, and a denied result with no traffic change for the incompatible target.

## References

[1]: https://vercel.com/docs/deployments/promoting-a-deployment "Vercel: Promoting a deployment"
[2]: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets "GitHub: About rulesets"
[3]: https://supabase.com/docs/guides/deployment/database-migrations "Supabase: Database migrations"
