<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# platform-services: Platform Services

## Intent

The installed platform wires the product to its concrete backing services: Supabase for identity, data, and media storage; Vercel for hosting and configuration; GitHub for the repository and its pipeline.
Each service seam the product's packages leave open — session issuance, the identity and role stores, catalog data, media storage and access grants, hosting, and the pipeline — is supplied by exactly one of these services, here and nowhere else.
No product user observes these seams, so verification inspects a deployment rather than walking a journey.

## External Behavior

### platform-services-1

Where sessions are established by GitHub sign-in [[github-login-2](identity/github-login.md#github-login-2)] and verified server-side [[github-login-9](identity/github-login.md#github-login-9)], the installed platform shall supply session issuance and verification through Supabase Auth, with GitHub OAuth the one enabled provider and every other Supabase Auth method disabled, so the sign-in page offers GitHub as the only method — sign-in exclusivity is this installation's policy ([DR-000](../decisions/000-product-scope.md)).

### platform-services-2

Where the identity store maintains user records [[github-login-7](identity/github-login.md#github-login-7)], [[github-login-15](identity/github-login.md#github-login-15)], the role store records each account's role, the catalog store keeps content in explicit order, and asset records live in the library's asset store, the installed platform shall keep those stores in the environment's Supabase Postgres project — the installation supplies the storage only; each package's invariants over that storage remain its own.

### platform-services-3

Where the content store holds asset content privately and the library's short-lived access grants rely on an installed grant mechanism, the installed platform shall back the content store with a private Supabase Storage bucket and realize each grant as a signed URL whose expiry is the grant's configured expiry.

### platform-services-4

Where the pipeline publishes previews and production deployments [[delivery-2](ops/delivery.md#delivery-2)], [[delivery-3](ops/delivery.md#delivery-3)] and previews run against non-production backing services [[delivery-4](ops/delivery.md#delivery-4)], the installed platform shall host the site on Vercel through its Git integration, with previews backed by a non-production Supabase project.

### platform-services-5

Where required checks report on a pull request [[delivery-1](ops/delivery.md#delivery-1)] and gate its merge [[delivery-12](ops/delivery.md#delivery-12)], and every production deployment traces to one default-branch commit [[delivery-7](ops/delivery.md#delivery-7)], the installed platform shall keep the repository on GitHub, run the required checks with GitHub Actions, and gate merging with branch protection.

## Internal Behavior

### platform-services-8

Where behavior follows deployment configuration — the initial-admin account ID [[access-control-1](identity/access-control.md#access-control-1)], the session lifetime [[github-login-6](identity/github-login.md#github-login-6)], the upload size cap [[video-library-1](catalog/video-library.md#video-library-1)], the grant expiry, and the secrets and variables of the platform's environment configuration [[delivery-5](ops/delivery.md#delivery-5)] — the installed platform shall hold those values in the Vercel project's per-environment variables, secrets marked as such, and the pipeline's credentials in the repository's GitHub Actions secrets.

## Verification

### platform-services-6

Where the audit suite inspects a deployed environment's configuration and network egress, the suite shall assert each seam:

1. session issuance and verification go through Supabase Auth, with GitHub OAuth the only enabled method and the sign-in page offering no other [[platform-services-1](#platform-services-1)];
2. user records, roles, catalog content, and video asset records live in that environment's Supabase Postgres project [[platform-services-2](#platform-services-2)];
3. asset content is served only from the private bucket through signed URLs that stop working at expiry [[platform-services-3](#platform-services-3)];
4. every configured value — the initial-admin ID, session lifetime, upload cap, and grant expiry — resolves from the environment's Vercel configuration with secrets absent from the repository [[platform-services-8](#platform-services-8)];
5. no other identity, database, or storage service appears in the configuration or the observed egress.

### platform-services-7

Where a fixture pull request runs through the pipeline, the audit suite shall assert each leg:

1. the required checks report from GitHub Actions [[delivery-1](ops/delivery.md#delivery-1)] and branch protection refuses the merge while one fails [[platform-services-5](#platform-services-5)], [[delivery-12](ops/delivery.md#delivery-12)];
2. the pipeline's credentials resolve from the repository's GitHub Actions secrets with none in tracked content [[platform-services-8](#platform-services-8)];
3. the preview publishes on Vercel against a non-production Supabase project disjoint from production's [[platform-services-4](#platform-services-4)], [[delivery-4](ops/delivery.md#delivery-4)];
4. a default-branch commit reaches production through the Git integration with no manual step [[platform-services-4](#platform-services-4)], [[delivery-3](ops/delivery.md#delivery-3)].

### platform-services-9

Where production is served through the Vercel Git integration [[platform-services-4](#platform-services-4)], the audit suite shall assert by deployment inspection that the serving revision reports the default-branch commit the integration built it from — not merely a commit that exists on that branch [[delivery-7](ops/delivery.md#delivery-7)].
