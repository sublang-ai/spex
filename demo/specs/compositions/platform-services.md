<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# PLAT: Platform Services

## Intent

This composition binds the platform seams: the abstract service
subjects the packages leave open — session issuance, the
identity and role stores, catalog data, media storage and access
grants, hosting, and the pipeline — each resolve to one concrete
backing service here, and nowhere else.
No product user observes these seams, so this file holds no
scenario: its items are supply bindings, and their tests inspect
a deployment rather than walk a journey.
The choice of services and its tradeoffs live in
[DR-002](../decisions/002-platform-and-devops.md); this file is
what the deployment must wire.

## Binding

### PLAT-1

Where sessions are established by GitHub sign-in
([AUTH-2](../packages/identity/github-login.md#auth-2)) and
verified server-side
([AUTH-9](../packages/identity/github-login.md#auth-9)), the
deployment shall issue and verify sessions with Supabase Auth,
with GitHub OAuth as the one enabled provider and every other
Supabase Auth method disabled, so the sign-in page offers
GitHub as the only method — sign-in exclusivity is this
installation's policy
([DR-000](../decisions/000-product-scope.md)).

### PLAT-2

Where the identity store maintains user records
([AUTH-7](../packages/identity/github-login.md#auth-7)), the
role store records each account's role
([ROLE-3](../packages/identity/access-control.md#role-3)),
catalog content is stored with explicit ordering
([CAT-11](../packages/catalog/course-catalog.md#cat-11)), and
asset records live in the library's asset store
([VID-16](../packages/catalog/video-library.md#vid-16)), the
deployment shall keep those stores in the environment's
Supabase Postgres project — the binding allocates storage;
each package's invariants over that storage remain its own.

### PLAT-3

Where asset content is stored privately
([VID-7](../packages/catalog/video-library.md#vid-7)) and
playback runs on short-lived access grants
([VID-8](../packages/catalog/video-library.md#vid-8)), the
deployment shall store assets in a private Supabase Storage
bucket and realize each access grant as a signed URL whose
expiry is the grant's configured expiry.

### PLAT-4

Where the pipeline publishes previews and production
deployments
([DELIV-2](../packages/ops/delivery.md#deliv-2),
[DELIV-3](../packages/ops/delivery.md#deliv-3)) and previews
bind to non-production backing services
([DELIV-4](../packages/ops/delivery.md#deliv-4)), the
deployment shall host on Vercel through its Git integration,
with previews bound to a non-production Supabase project.

### PLAT-5

Where required checks gate merging
([DELIV-1](../packages/ops/delivery.md#deliv-1)) and every
production deployment traces to one default-branch commit
([DELIV-7](../packages/ops/delivery.md#deliv-7)), the
repository shall live on GitHub, with the required checks run
by GitHub Actions and merging gated by branch protection.

### PLAT-8

Where behavior follows deployment configuration — the
initial-admin account ID
([ROLE-1](../packages/identity/access-control.md#role-1)), the
session lifetime
([AUTH-6](../packages/identity/github-login.md#auth-6)), the
upload size cap
([VID-1](../packages/catalog/video-library.md#vid-1)), the
grant expiry
([VID-8](../packages/catalog/video-library.md#vid-8)), and the
secrets and variables of the platform's environment
configuration
([DELIV-5](../packages/ops/delivery.md#deliv-5)) — the
deployment shall hold those values in the Vercel project's
per-environment variables, secrets marked as such, and the
pipeline's credentials in the repository's GitHub Actions
secrets.

## Tests

### PLAT-6

Where the audit suite inspects a deployed environment's
configuration and network egress, the suite shall assert:
session issuance and verification go through Supabase Auth with
GitHub OAuth the only enabled method and the sign-in page
offering no other ([PLAT-1](#plat-1)); user records, roles,
catalog content, and video asset records live in that
environment's Supabase Postgres project ([PLAT-2](#plat-2)); asset content is served only from
the private bucket
([VID-7](../packages/catalog/video-library.md#vid-7)) through
signed URLs that stop working at expiry ([PLAT-3](#plat-3));
every configured value — the initial-admin ID, session
lifetime, upload cap, and grant expiry — resolves from the
environment's Vercel configuration with secrets absent from
the repository ([PLAT-8](#plat-8)); and no other identity,
database, or storage service appears in the configuration or
the observed egress.

### PLAT-7

Where a fixture pull request runs through the pipeline, the
audit suite shall assert the required checks report from GitHub
Actions ([PLAT-5](#plat-5)), the pipeline's credentials resolve
from the repository's GitHub Actions secrets with none in
tracked content ([PLAT-8](#plat-8)), the preview publishes on
Vercel against a non-production Supabase project disjoint from
production's ([PLAT-4](#plat-4),
[DELIV-4](../packages/ops/delivery.md#deliv-4)), and the
serving production revision reports a commit that exists on the
default branch of the GitHub repository
([DELIV-7](../packages/ops/delivery.md#deliv-7)).
