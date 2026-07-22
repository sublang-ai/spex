<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-001: Web and Service Platform

## Status

Accepted for the demo.

## Context

The product requirements select Next.js, Tailwind CSS, shadcn/ui, Vercel, Supabase, and GitHub.
The remaining choices must keep public catalog reads simple while protecting administration and video content.

## Decision

- The application uses Next.js App Router with strict TypeScript, Server Components by default, Server Actions for mutations, Tailwind CSS, and one in-repository shadcn/ui component set.
- Supabase Auth is the identity authority and enables GitHub OAuth only.
  The server obtains the immutable GitHub subject from verified provider identity rather than mutable profile metadata, and every protected request validates its current session online [[1]][[2]][[7]][[8]][[13]].
- Supabase Postgres stores application accounts and sessions, roles, mutable courses and ordered syllabi, publication state, and video records.
  Row Level Security permits anonymous reads only of CAT's published public fields; protected reads and mutations require the exact active account and installed authorization decision [[3]].
- Supabase Storage holds complete video objects in a private bucket with a 1 GiB limit.
  The browser uploads directly with byte progress through the exact installed private-object capability; an interrupted transfer creates no listed video, and retry begins at byte zero.
  Storage provides no permanent public object URL [[9]].
- Playback uses transferable signed bearer locations scoped to one video and expiring no later than five minutes [[4]].
  Every new grant requires a current GitHub application session and the installed rule for an available video attached to a currently published lesson.
  Sign-out, unpublication, or course deletion prevents later grants but does not invalidate an already-issued bearer before expiry.
  Video deletion prevents later grants and removes the origin object; neither case can retract bytes already delivered or cached [[10]][[12]].
- Request-specific authentication responses and public course responses use request-scoped clients and non-shared caching so another account's state or a stale saved, unpublished, or deleted course is not served [[8]].
- Local provider integration uses a fresh local Supabase stack and deterministic fake GitHub authority; fixture previews receive no production identity, data, or secret [[5]].
- GitHub hosts the repository and required Actions checks.
  Vercel's Git integration publishes secret-free previews and protected production candidates; delivery promotes the exact tested candidate without rebuilding [[6]][[11]].
- Provider configuration, database migrations, policies, and bucket configuration are reviewed in GitHub.
  Runtime receives application credentials only; protected delivery alone receives the provider control-plane credentials needed to inspect or change configuration.

## Consequences

- Public course discovery needs no account, while administration and video grants remain server-authorized.
- Upload retry is intentionally simple and may resend the whole file.
- Signed bearer expiry bounds session and course-policy staleness without claiming impossible immediate byte revocation.
- Preview and production data remain isolated, and every production artifact traces to reviewed GitHub evidence.

## References

[1]: https://supabase.com/docs/guides/auth/social-login/auth-github "Supabase: Login with GitHub"
[2]: https://nextjs.org/docs/app/guides/authentication "Next.js: Authentication"
[3]: https://supabase.com/docs/guides/database/postgres/row-level-security "Supabase: Row Level Security"
[4]: https://supabase.com/docs/guides/storage/serving/downloads "Supabase: Serving Storage assets"
[5]: https://supabase.com/docs/guides/local-development/overview "Supabase: Local development and migrations"
[6]: https://vercel.com/docs/git/vercel-for-github "Vercel for GitHub"
[7]: https://supabase.com/docs/guides/auth/identities "Supabase: User identities"
[8]: https://supabase.com/docs/guides/auth/server-side/advanced-guide "Supabase: Advanced server-side Auth guide"
[9]: https://supabase.com/docs/guides/storage/uploads/file-limits "Supabase: Storage file limits"
[10]: https://supabase.com/docs/guides/storage/cdn/smart-cdn "Supabase: Smart CDN"
[11]: https://vercel.com/docs/deployments/promoting-a-deployment "Vercel: Promoting a deployment"
[12]: https://supabase.com/docs/guides/auth/signout "Supabase: Sign out"
[13]: https://supabase.com/docs/guides/auth/sessions "Supabase: Sessions"
