<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-001: Web and Service Platform

## Status

Accepted for the demo.

## Context

The product requirements select Next.js, Tailwind CSS, shadcn/ui, Vercel, Supabase, and GitHub.
The remaining placement choices affect authorization, large uploads, environment isolation, and delivery behavior.

## Decision

- The application is a TypeScript Next.js application using the App Router.
- User-facing styling uses Tailwind CSS and reusable shadcn/ui components.
- Vercel hosts secret-free fixture previews, protected unaliased Production candidates, and promoted production deployments.
- Supabase Auth is the identity authority and has only the GitHub OAuth provider enabled.
  Email/password, magic-link, phone, anonymous, and every other direct sign-up or sign-in method are disabled.
  A generic Supabase `authenticated` JWT is not membership: the server must verify a GitHub identity record and an active application session before producing a trusted principal.
  The immutable provider subject comes from the server-validated `identities[].provider_id` string, never mutable user metadata and never a JavaScript number [[1]][[2]][[8]].
- Authenticated App Router responses, authentication callbacks, Route Handlers, and Server Actions use request-scoped Supabase clients and private, non-shared caching.
  Every protected entry point performs its own session and authorization check; no user-specific response or `Set-Cookie` response may be served from shared static, ISR, or CDN cache [[9]].
- Supabase Postgres is the source of truth for accounts, active application sessions, roles, drafts, releases, upload attempts, and video metadata.
  Every application table and view in an exposed schema has Row Level Security enabled; ordinary requests use the caller's user-scoped client, exposed views/functions preserve the caller's policies, and every member/administrator policy requires both the Auth user ID and JWT session ID to match one active application-session row [[3]][[14]].
  A separate service-role client may perform only the named exact-object signing, upload finalization/cleanup, identity reconciliation, application-session revocation, and readiness operations after the owning package has authorized the request.
  It is never used as a general application data client and never reaches a browser.
- The semantic data-access matrix is:

  | Surface | Anonymous or non-GitHub Auth user | Registered member | Administrator | Privileged server operation |
  | --- | --- | --- | --- | --- |
  | own account/session/role view | none | own row only | own row only | reconcile the exact verified identity or revoke the exact session |
  | course drafts | none | none | read/write after `course.author` | none |
  | current catalog releases | none | read current published releases | member read plus publish/unpublish after `course.publish` | none |
  | video registry | none | exact current entitled descriptor only | manage after `video.manage`; playback still requires exact entitlement | finalize or clean the exact authorized upload attempt |
  | private Storage objects | none | exact bounded playback bearer grant only | exact upload capability or playback grant only | sign the exact authorized object; verify/clean the exact attempt |

  No exposed table, view, function, or Storage policy may broaden this matrix.
  A revoked application session with an otherwise unexpired Auth JWT is treated as anonymous by every row, view, and RPC policy.
  Upload capabilities, TUS upload URLs, and playback grants become transferable bearer credentials after issuance; possession permits only their exact object operation, while issuance and finalization still require an active authorized account.
- Supabase Storage on a Pro-or-higher project holds video objects in a private bucket with a 1 GiB project and bucket limit.
  Large uploads use its resumable direct-upload facility so video bytes do not pass through a Vercel request handler [[4]][[10]].
  Each upload uses a new immutable object key and a signed capability scoped to that exact key with overwrite disabled.
- Playback uses bearer grants nominally expiring after no more than five minutes for exact private objects.
  Every new grant requires an online-verified GitHub principal, an active application-session record, and a fresh server-only catalog entitlement for that request.
  Sign-out revokes the application session before clearing browser state, so no new grant is issued afterward.
  Supabase access tokens may remain valid until expiry, and a browser or Smart CDN may retain bytes or a signed response beyond the nominal grant expiry; the product therefore promises no new application grant or Storage-origin authorization, not erasure or a strict byte cutoff [[5]][[9]][[11]][[13]].
- Local development and pull-request integration checks use a fresh Supabase local stack per commit and a deterministic fake GitHub OAuth authority.
  Every pull request also receives a Vercel fixture preview with no protected provider secrets or production data; that preview is explicitly limited to route, responsive, and view-state evaluation and is never reported as provider-integrated production readiness.
  The production candidate and production deployment use one dedicated Supabase Pro project and one dedicated GitHub OAuth application.
  This avoids pretending that concurrent pull requests are isolated on one mutable non-production project.
- Database schema, policies, bucket configuration, and seed fixtures are versioned as reviewed migrations/configuration in GitHub [[6]].
- GitHub Actions supplies required quality checks and the clean local Supabase integration environment.
  Vercel's GitHub integration supplies fixture previews and staged production deployment primitives [[7]].
- Vercel automatic assignment of custom production domains is disabled.
  Delivery creates a protected, unaliased Production deployment using production configuration, records its deployment ID, and promotes that exact artifact without rebuilding only after readiness and smoke evidence pass [[12]].
- GitHub's callback registered at the OAuth provider is the Supabase Auth provider callback.
  Supabase's application redirect allowlist separately names the website's `/auth/callback` origins; protected delivery verifies both sets and every non-GitHub Auth method and produces a provider-configuration attestation for runtime readiness.
- Database migrations and reviewed Auth/API/Storage configuration are applied by separate explicit delivery steps.
  Production mutation is serialized and non-cancelable from its first mutation through evidence capture.
  Web rollback reassigns a retained deployment but does not roll back Postgres, Auth, or Storage state; the retained deployment must first prove compatibility with their current revisions.
- Runtime code receives the provider-configuration attestation but no Supabase or GitHub control-plane management credential.
  Runtime readiness checks its own binding and functional provider health; protected delivery alone reads or changes plan, Auth-provider, callback, redirect, and global Storage settings.

## Consequences

- Authorization is enforced at both trusted application boundaries and the data/storage boundaries.
- Video uploads can be resumed and do not depend on Vercel body-size or execution-time limits.
- Pull-request code can prove application behavior without receiving production identities, content, or credentials.
- The playback contract states the limits of signed URLs and caches instead of promising impossible immediate revocation.
- The specs constrain observable security and delivery outcomes while leaving source layout and algorithms to implementation.

## References

[1]: https://supabase.com/docs/guides/auth/social-login/auth-github "Supabase: Login with GitHub"
[2]: https://nextjs.org/docs/app/guides/authentication "Next.js: Authentication"
[3]: https://supabase.com/docs/guides/database/postgres/row-level-security "Supabase: Row Level Security"
[4]: https://supabase.com/docs/guides/storage/uploads/resumable-uploads "Supabase: Resumable Uploads"
[5]: https://supabase.com/docs/guides/storage/serving/downloads "Supabase: Serving Storage assets"
[6]: https://supabase.com/docs/guides/local-development/overview "Supabase: Local development and migrations"
[7]: https://vercel.com/docs/git/vercel-for-github "Vercel for GitHub"
[8]: https://supabase.com/docs/guides/auth/identities "Supabase: User identities"
[9]: https://supabase.com/docs/guides/auth/server-side/advanced-guide "Supabase: Advanced server-side Auth guide"
[10]: https://supabase.com/docs/guides/storage/uploads/file-limits "Supabase: Storage file limits"
[11]: https://supabase.com/docs/guides/storage/cdn/smart-cdn "Supabase: Smart CDN"
[12]: https://vercel.com/docs/deployments/promoting-a-deployment "Vercel: Promoting a deployment"
[13]: https://supabase.com/docs/guides/auth/signout "Supabase: Sign out"
[14]: https://supabase.com/docs/guides/auth/sessions "Supabase: Sessions"
