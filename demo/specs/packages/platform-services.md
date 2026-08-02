<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# platform-services: Platform Services

## Intent

The installed platform realizes the product's session, persistence, protected-media, hosting, and deployment behavior through Supabase, Vercel, and GitHub, here and nowhere else.
No product user observes these seams, so verification inspects a deployment rather than walking a journey.

## External Behavior

### platform-services-1

Where sessions are established by GitHub sign-in [[github-login-2](identity/github-login.md#github-login-2)] and verified server-side [[github-login-10](identity/github-login.md#github-login-10)], the installed platform shall supply session issuance and verification through Supabase Auth, with GitHub OAuth the one enabled provider and every other Supabase Auth method disabled, so the sign-in page offers GitHub as the only method — sign-in exclusivity is this installation's policy ([DR-000](../decisions/000-product-scope.md)).

### platform-services-2

Where user records are created and refreshed [[github-login-8](identity/github-login.md#github-login-8)] [[github-login-9](identity/github-login.md#github-login-9)], requests act under each account's current role [[access-control-2](identity/access-control.md#access-control-2)], committed catalog changes appear atomically on the next read [[course-catalog-14](catalog/course-catalog.md#course-catalog-14)], and library assets keep stable identities [[video-library-8](catalog/video-library.md#video-library-8)], the installed platform shall realize those persistence behaviors through the environment's Supabase Postgres project.

### platform-services-3

Where stored asset content has no permanently valid public URL and requires a valid access grant [[video-library-12](catalog/video-library.md#video-library-12)], the library issues access only after host authorization [[video-library-11](catalog/video-library.md#video-library-11)] and stops serving deleted assets [[video-library-5](catalog/video-library.md#video-library-5)], the installed platform shall realize those privacy, access, deletion, and grant-validity behaviors through a private Supabase Storage bucket and signed URLs that remain redeemable until the grant's expiry [[video-library-14](catalog/video-library.md#video-library-14)].

### platform-services-4

Where the pipeline publishes previews and production deployments [[delivery-3](ops/delivery.md#delivery-3)], [[delivery-4](ops/delivery.md#delivery-4)] and previews run against non-production backing services [[delivery-5](ops/delivery.md#delivery-5)], the installed platform shall host the site on Vercel through its Git integration, with previews backed by a non-production Supabase project and the serving revision reporting the commit the integration built it from [[delivery-6](ops/delivery.md#delivery-6)].

### platform-services-5

Where required checks report on a pull request [[delivery-1](ops/delivery.md#delivery-1)] and gate its merge [[delivery-2](ops/delivery.md#delivery-2)], and every production deployment traces to one default-branch commit [[delivery-6](ops/delivery.md#delivery-6)], the installed platform shall keep the repository on GitHub, run the required checks with GitHub Actions, and gate merging with branch protection.

## Internal Behavior

### platform-services-6

Where behavior depends on deployment configuration — the initial-admin designation [[access-control-1](identity/access-control.md#access-control-1)], session expiry [[github-login-7](identity/github-login.md#github-login-7)], the configured size cap governing upload acceptance [[video-library-1](catalog/video-library.md#video-library-1)], signed-URL expiry [[platform-services-3](#platform-services-3)], and secret handling [[delivery-7](ops/delivery.md#delivery-7)] — the installed platform shall realize those configurable behaviors through the Vercel project's per-environment variables, secrets marked as such, and the pipeline's credentials in the repository's GitHub Actions secrets.

## Verification

### platform-services-7

Where the audit suite inspects a deployed environment's configuration and network egress, the suite shall assert each seam:

1. session issuance and verification go through Supabase Auth, with GitHub OAuth the only enabled method and the sign-in page offering no other [[platform-services-1](#platform-services-1)];
2. user records, roles, catalog content, and video asset records live in that environment's Supabase Postgres project [[platform-services-2](#platform-services-2)];
3. asset content is served only from the private bucket through signed URLs that stop working at expiry [[platform-services-3](#platform-services-3)];
4. every configured value — the initial-admin ID, session lifetime, upload cap, and grant expiry — resolves from the environment's Vercel configuration with secrets absent from the repository [[platform-services-6](#platform-services-6)];
5. no other identity, database, or storage service appears in the configuration or the observed egress [[platform-services-1](#platform-services-1)] [[platform-services-2](#platform-services-2)] [[platform-services-3](#platform-services-3)].

### platform-services-8

Where a fixture pull request runs through the pipeline, the audit suite shall assert each leg:

1. the required checks report from GitHub Actions and branch protection refuses the merge while one fails [[platform-services-5](#platform-services-5)];
2. the pipeline's credentials resolve from the repository's GitHub Actions secrets with none in tracked content [[platform-services-6](#platform-services-6)];
3. the preview publishes on Vercel against a non-production Supabase project disjoint from production's [[platform-services-4](#platform-services-4)];
4. a default-branch commit reaches production through the Git integration with no manual step [[platform-services-4](#platform-services-4)].

### platform-services-9

Where production is served through the Vercel Git integration, the audit suite shall assert by deployment inspection that the serving revision reports the default-branch commit the integration built it from [[platform-services-4](#platform-services-4)] — not merely a commit that exists on that branch.
