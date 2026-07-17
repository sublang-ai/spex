<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DELIV: Delivery

## Intent

This spec covers how changes reach production: repository checks,
preview deployments, production deployment, secret handling, and
schema migrations.
Its user is the developer-operator; external behavior is what
they observe on the repository and its deployments.
The hosting and CI bindings are a deployment decision
([DR-002](../../decisions/002-platform-and-devops.md)).

## External Behavior

### Checks

#### DELIV-1

When a pull request is opened or updated, the pipeline shall run
and report the required checks — lint, type check, tests, and
production build — on that pull request; while any required check
fails, merging into the default branch shall be blocked.

#### DELIV-2

When a pull request's build succeeds, the pipeline shall publish
a preview deployment of that revision and link it from the pull
request.

### Deployment

#### DELIV-3

When commits land on the default branch, the pipeline shall
deploy that revision to production with no further manual action;
when the deployment fails, the previously deployed revision shall
keep serving.

#### DELIV-4

Where preview deployments run, they shall bind to non-production
backing services and shall neither read nor write production
data.

## Internal Behavior

### Secrets

#### DELIV-5

Credentials and other secret values shall live only in the
platform's environment configuration; the repository shall carry
no secret values, and shall carry an example environment file
listing every required variable name with no values.

### Migrations

#### DELIV-6

Where the database schema changes, the change shall ship as a
versioned migration applied in order before the new revision
serves traffic; when a migration fails, the deployment shall not
switch traffic to the new revision.

### Traceability

#### DELIV-7

Every production deployment shall be traceable to the one commit
on the default branch that produced it, and no deployment path
shall exist that bypasses the repository.

## Verification

### Check Coverage

#### DELIV-8
Verifies: [DELIV-1](#deliv-1), [DELIV-2](#deliv-2)

Where a fixture pull request carries a failing check, the audit
suite shall assert the required checks are reported on it and the
branch protection blocks its merge; where the fixture's build
passes, the suite shall assert a preview deployment link appears
on the pull request.

### Deployment Coverage

#### DELIV-9
Verifies: [DELIV-3](#deliv-3), [DELIV-4](#deliv-4), [DELIV-6](#deliv-6)

Where a preview environment rehearses deployment, the audit suite
shall assert: a revision with a deliberately failing migration
leaves the serving revision unchanged; a passing revision serves
after its migrations apply; and the preview's backing-service
endpoints are disjoint from production's.

### Hygiene Coverage

#### DELIV-10
Verifies: [DELIV-5](#deliv-5), [DELIV-7](#deliv-7)

The audit suite shall assert a repository scan finds no secret
values, the example environment file lists every required
variable name with no values, and the serving production revision
reports a commit identifier that exists on the default branch.
