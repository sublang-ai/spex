<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# delivery: Delivery

## Intent

This spec covers how changes reach production: repository checks, preview deployments, production deployment, secret handling, and schema migrations.
Its user is the developer-operator; external behavior is what they observe on the repository and its deployments.

## External Behavior

### Checks

#### delivery-1

When a pull request is opened or updated, the pipeline shall run and report the required checks — lint, type check, tests, and production build — on that pull request.

#### delivery-12

While any required check fails on a pull request, merging it into the default branch shall be blocked.

#### delivery-2

When a pull request's build succeeds, the pipeline shall publish a preview deployment of that revision and link it from the pull request.

### Deployment

#### delivery-3

When commits land on the default branch, the pipeline shall deploy that revision to production with no further manual action — a failed deployment leaving the previously deployed revision serving.

#### delivery-4

Where preview deployments run, they shall bind to non-production backing services and shall neither read nor write production data.

### Provenance

#### delivery-7

Every production deployment shall report the one default-branch commit that produced it.

### Secrets

#### delivery-5

Credentials and other secret values shall live only in the platform's environment configuration:

- the repository carries no secret values;
- the repository carries an example environment file listing every required variable name with no values.

## Internal Behavior

### Migrations

#### delivery-6

Where the database schema changes, the change shall ship as a versioned migration applied in order before the new revision serves traffic — a failed migration never switching traffic to the new revision.

#### delivery-11

A migration applied before cutover [[delivery-6](#delivery-6)] shall stay compatible with the still-serving revision, so a failure after migration leaves that revision serving correctly.

## Verification

### Check Coverage

#### delivery-8

Where fixture pull requests exercise the check pipeline, the audit suite shall assert each case:

| Fixture | Asserted outcome |
| --- | --- |
| a pull request carrying a failing check | the required checks are reported on it [[delivery-1](#delivery-1)], and merging it into the default branch is blocked [[delivery-12](#delivery-12)] |
| a pull request whose build passes | a preview deployment link appears on the pull request [[delivery-2](#delivery-2)] |

### Deployment Coverage

#### delivery-9

Where a preview environment rehearses deployment, the audit suite shall assert each case:

- a revision with a deliberately failing migration leaves the serving revision unchanged [[delivery-6](#delivery-6)];
- a revision whose migration succeeds but whose activation then fails leaves the previous revision serving correctly against the migrated schema [[delivery-3](#delivery-3)], [[delivery-11](#delivery-11)];
- a passing revision serves after its migrations apply [[delivery-3](#delivery-3)];
- the preview's backing-service endpoints are disjoint from production's [[delivery-4](#delivery-4)].

### Hygiene Coverage

#### delivery-10

The audit suite shall assert a repository scan finds no secret values and that the example environment file lists every required variable name with no values [[delivery-5](#delivery-5)].
