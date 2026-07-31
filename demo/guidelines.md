<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Spec Organization Guidelines

Five guidelines for organizing spec items, distilled from building the Academy demo.
Each is stated as a rule, grounded in the demo's files, and named by the meta items of [specs/meta.md](specs/meta.md) that encode it.

## 1. Draw package boundaries so every package is self-contained

A package is one file, one intent, one closed set of subjects ([[meta-9](specs/meta.md#meta-9)], [[meta-13](specs/meta.md#meta-13)]).
It stands alone: readable in full without following any link ([[meta-15](specs/meta.md#meta-15)]).

- **Rely on another package only by citing it, at the exact phrase that relies on it.**
  A citation is the only relationship between packages, and it binds a phrase to a specific External Behavior item of the cited package ([[meta-14](specs/meta.md#meta-14)], [[meta-16](specs/meta.md#meta-16)]).
  [[course-catalog-4](specs/packages/catalog/course-catalog.md#course-catalog-4)] is guarded admin-only by citing [[access-control-2](specs/packages/identity/access-control.md#access-control-2)] in its Where clause, while its shall clause acts only on the course manager — a course-catalog subject.
  And no clause leans on an undefined token: a phrase like "the course's author" would name nothing — no package defines authorship — which is why admin gating cites [[access-control-2](specs/packages/identity/access-control.md#access-control-2)] rather than an imagined owner field.
- **Name a selectable counterparty abstractly, and let neither side name the other.**
  A fixed semantic dependency gets a citation; a replaceable counterparty stays an uncited general phrase, which is sufficient ([[meta-14](specs/meta.md#meta-14)]).
  The catalog stores "one media attachment as an opaque reference" from "the deployment's media provider" ([[course-catalog-8](specs/packages/catalog/course-catalog.md#course-catalog-8)]); the video library serves "host surfaces" ([[video-library-5](specs/packages/catalog/video-library.md#video-library-5)]); the shell carries "the deployment's navigation entries" ([[web-shell-1](specs/packages/site/web-shell.md#web-shell-1)]).
- **State the wiring as a composition package's own behavior, nowhere else.**
  A composition package is an ordinary package whose behavior emerges only when several packages work together; one phrase may cite several packages exactly when it composes their behaviors ([[meta-14](specs/meta.md#meta-14)]).
  [[course-publishing-1](specs/packages/course-publishing.md#course-publishing-1)] serves every media delegation the catalog leaves open through the video library, citing both sides — "here and nowhere else"; [[site-navigation-1](specs/packages/site-navigation.md#site-navigation-1)] names what the shell's header presents; the platform seams no user walks are supplied in [platform-services.md](specs/packages/platform-services.md) — decisions only choose.
- **Make the boundary itself testable from both sides.**
  [[course-catalog-10](specs/packages/catalog/course-catalog.md#course-catalog-10)]: deleting a course never deletes a provider asset.
  [[video-library-10](specs/packages/catalog/video-library.md#video-library-10)]: deleting an asset never touches host data.
  Each package verifies its own side against a double of the abstract counterparty — [[meta-32](specs/meta.md#meta-32)] prefers executing the real behavior of a *cited* package, and the counterparty is deliberately uncited.

## 2. Split external from internal behavior by audience

External behavior is what a package's users — humans, hosts, or peer packages — may rely on; internal behavior is implementation hidden from them ([[meta-30](specs/meta.md#meta-30)]).
No behavior item cites a peer's internal item ([[meta-14](specs/meta.md#meta-14)]): [[protected-content-2](specs/packages/protected-content.md#protected-content-2)] pins four independent gate layers naming the internal ones only generally, while its sweep test [[protected-content-3](specs/packages/protected-content.md#protected-content-3)] cites [[course-catalog-12](specs/packages/catalog/course-catalog.md#course-catalog-12)] and [[web-shell-6](specs/packages/site/web-shell.md#web-shell-6)] directly — a citation the meta law is silent on: it neither licenses nor forbids a test citing peer Internal Behavior, and the citation reclassifies nothing.
The split governs use, not verification: every stated behavior is verified unless verification is irrelevant to it, white-box or black-box ([[meta-33](specs/meta.md#meta-33)]).

- **Write the strongest constraints as external/internal pairs.**
  [[course-catalog-3](specs/packages/catalog/course-catalog.md#course-catalog-3)] (external): drafts read as not-found.
  [[course-catalog-12](specs/packages/catalog/course-catalog.md#course-catalog-12)] (internal): drafts are excluded at the data-access layer, so no payload can leak one.
  Likewise [[web-shell-2](specs/packages/site/web-shell.md#web-shell-2)] (the admin entry appears only for admins) pairs with [[web-shell-6](specs/packages/site/web-shell.md#web-shell-6)] (chrome resolves server-side, so no served markup carries another role's entries).
- **The audience is per-package, and peers count as users.**
  For the delivery package the user is the developer-operator: pull-request checks, preview links, and the secret-handling contract the operator works with are external ([[delivery-1](specs/packages/ops/delivery.md#delivery-1)], [[delivery-5](specs/packages/ops/delivery.md#delivery-5)]); migration ordering is internal ([[delivery-6](specs/packages/ops/delivery.md#delivery-6)]).
  [[github-login-9](specs/packages/identity/github-login.md#github-login-9)]'s verification guarantee is external because [[video-library-8](specs/packages/catalog/video-library.md#video-library-8)] relies on it — what a peer may rely on is External Behavior ([[meta-30](specs/meta.md#meta-30)], [[meta-14](specs/meta.md#meta-14)]).
- **State only behavior some test or inspection could distinguish** ([[meta-23](specs/meta.md#meta-23)], [[meta-33](specs/meta.md#meta-33)]).
  The demo once had an item no check could tell from its absence — "primitives come from the shared component kit" — and the cure was deletion, not relocation: no observable outcome separates a kit button from a pixel-identical hand-rolled one.
- **One GEARS statement per item; attachments elaborate it** ([[meta-29](specs/meta.md#meta-29)]).
  [[course-publishing-1](specs/packages/course-publishing.md#course-publishing-1)] carries four delegations of one supplier relationship; [[course-catalog-6](specs/packages/catalog/course-catalog.md#course-catalog-6)] carries publish and unpublish as two rows of one publication-state transition; and [[delivery-3](specs/packages/ops/delivery.md#delivery-3)] folds its failure outcome into a rider of the one deployment attempt.
  A condition inside an attachment is a case label, not a trigger, so counting `When` decides nothing.
  What decides is whether a part answers a *different contract*: [[web-shell-13](specs/packages/site/web-shell.md#web-shell-13)] left [[web-shell-10](specs/packages/site/web-shell.md#web-shell-10)] because cache privacy and response freshness are independent standing invariants, and [[video-library-18](specs/packages/catalog/video-library.md#video-library-18)] left [[video-library-4](specs/packages/catalog/video-library.md#video-library-4)] because listing assets and ending one's life are separately initiated operations.
  If naming an item's purpose needs "and" — "asset listing and deletion" — inspect it for a split: differing stateful preconditions or triggers are evidence of additional items ([[meta-29](specs/meta.md#meta-29)]).
- **Decisions are not where implementation details live** ([[meta-24](specs/meta.md#meta-24)]).
  Three buckets: an observable outcome code generation must honor is a spec item; a technology or architecture choice is a decision with its rationale; what neither constrains behavior nor records a choice appears in no spec.
  Decision records hold choices, constraints, and tradeoffs — the choice and its rationale, never duplicated behavioral logic.

## 3. Keep packages standalone and reusable; decisions choose, composition packages wire

Four of Academy's packages — [github-login](specs/packages/identity/github-login.md), [access-control](specs/packages/identity/access-control.md), [video-library](specs/packages/catalog/video-library.md), and [web-shell](specs/packages/site/web-shell.md) — contain no product noun and would drop into another product unchanged.

- **Intents are self-contained prose with no citations** ([[meta-30](specs/meta.md#meta-30)], [[meta-15](specs/meta.md#meta-15)]).
  A dependency worth stating is already an item-level citation; repeating it in the Intent couples the package to its current neighbors.
- **Packages name platforms abstractly; decisions choose, the platform package supplies.**
  The specs say "the identity store", "an access grant", "the pipeline"; [DR-002](specs/decisions/002-platform-and-devops.md) chooses Supabase, Vercel, and GitHub, and the items of [platform-services.md](specs/packages/platform-services.md) supply each seam, citing the package items they serve — never the reverse.
  Swapping a vendor is a new decision record plus rewritten platform-services items; every other package's items stay unchanged.
  The exception proves the rule: GitHub appears in [github-login](specs/packages/identity/github-login.md) items because the user sees GitHub; the technology is the behavior there.
- **Reuse within a project is citation.**
  [[access-control-2](specs/packages/identity/access-control.md#access-control-2)] is defined once and cited by [[course-catalog-4](specs/packages/catalog/course-catalog.md#course-catalog-4)], [[video-library-1](specs/packages/catalog/video-library.md#video-library-1)], and the admin-bootstrap and protected-content packages — one denial grammar, four consumers.
- **Keep the citation direction acyclic.**
  Composition packages cite the packages they compose, like an application importing libraries; the composed packages never cite back, so lifting one out drags no journey context along.
  Moving [github-login](specs/packages/identity/github-login.md) to another product means retargeting a few citations and nothing else.
- **Collections carry no semantics** ([[meta-31](specs/meta.md#meta-31)]).
  `packages/identity/` and `packages/catalog/` are shelves, not layers; a file's identity is its basename ([[meta-10](specs/meta.md#meta-10)]), so regrouping changes relative citation paths but never an ID, an anchor, or a meaning.
  The six composition packages sit flat under `packages/` because each spans domains — no shelf could claim one.

## 4. Derive release acceptance from the composition packages

Release acceptance is every package's Verification items; the composition packages' tests alone cover everything integrated.

- **Each composition package is one integrated concern, and its tests are release evidence — acceptance journeys for seams users walk, inspections for hidden ones** ([[meta-33](specs/meta.md#meta-33)]).
  The demo's release gate is one closed rule — every package's Verification items — whose integrated half spans the member journey ([[lesson-playback-3](specs/packages/lesson-playback.md#lesson-playback-3)]), authoring and publishing ([[course-publishing-4](specs/packages/course-publishing.md#course-publishing-4)]), day zero ([[admin-bootstrap-3](specs/packages/admin-bootstrap.md#admin-bootstrap-3)]), navigation ([[site-navigation-3](specs/packages/site-navigation.md#site-navigation-3)]), the gating sweep ([[protected-content-3](specs/packages/protected-content.md#protected-content-3)], [[protected-content-4](specs/packages/protected-content.md#protected-content-4)]), and the substrate inspections ([[platform-services-6](specs/packages/platform-services.md#platform-services-6)], [[platform-services-7](specs/packages/platform-services.md#platform-services-7)]).
- **Specify matrix behavior as a map and sweep it.**
  [[protected-content-1](specs/packages/protected-content.md#protected-content-1)] pins the whole gating surface as one audience-by-surface table; its tests assert every cell.
  Deny paths are inherently cross-package, so security acceptance lands in composition packages naturally.
- **A test cites every behavior it verifies, inline at the assertion that verifies it** ([[meta-20](specs/meta.md#meta-20)]).
  These inline citations make coverage mechanically auditable — in the demo's adversarial review, every stale citation and unverified map cell was caught by walking them.
  Items carry no relationship-metadata lines; the citations in an item's clauses are the single source of its relationships ([[meta-16](specs/meta.md#meta-16)]).
  And a test prefers executing the real behavior of a cited package to substituting it ([[meta-32](specs/meta.md#meta-32)]): the composition tests run the composed packages for real on seeded deployments, with a stub only for the outside vendor ([[lesson-playback-3](specs/packages/lesson-playback.md#lesson-playback-3)]'s stub GitHub provider).
- **Know what the composition packages do not cover.**
  Single-package behavior that is still acceptance-relevant — upload refusal ([[video-library-2](specs/packages/catalog/video-library.md#video-library-2)]), responsive fit ([[web-shell-4](specs/packages/site/web-shell.md#web-shell-4)]), editor validation ([[course-catalog-7](specs/packages/catalog/course-catalog.md#course-catalog-7)]) — lives in its own package's Verification, which is why the release run includes both.

## 5. Split user-walked composition from inspection-only supply by audience

Two composition packages share one shape — behavior stated over other packages' items — with opposite audiences.
[course-publishing](specs/packages/course-publishing.md) composes seams the product's users walk; [platform-services](specs/packages/platform-services.md) supplies seams no product user observes.
The split moves the External/Internal placement and the verification kind, and nothing else — both are ordinary packages under the same law.

- **A user-walked seam is External Behavior with acceptance tests.**
  [[course-publishing-2](specs/packages/course-publishing.md#course-publishing-2)]: publish once and exactly the resolvable lessons play — the admin crosses the picker seam in person, so [[course-publishing-4](specs/packages/course-publishing.md#course-publishing-4)] walks a course from creation through deletion as a journey.
  The wiring behind it is Internal Behavior: [[course-publishing-1](specs/packages/course-publishing.md#course-publishing-1)] serves the catalog's media delegations through the video library, hidden from members and cited by the package's own tests at the assertions that verify it ([[meta-20](specs/meta.md#meta-20)]).
- **An inspection-only supply seam is verified by inspecting a deployment.**
  No product user observes which store holds a record, so [[platform-services-6](specs/packages/platform-services.md#platform-services-6)] inspects configuration and egress instead of walking a journey — verification may be white-box ([[meta-33](specs/meta.md#meta-33)]).
  The supply items are External Behavior all the same: their users are the operator and the decision record, and [DR-002](specs/decisions/002-platform-and-devops.md) cites them to support its choices.
- **A client never names its supplier — the composition package does the naming.**
  The catalog states "the deployment's media provider" ([[course-catalog-8](specs/packages/catalog/course-catalog.md#course-catalog-8)]); the login package states "the identity store" ([[github-login-7](specs/packages/identity/github-login.md#github-login-7)]); delivery states "the platform's environment configuration" ([[delivery-5](specs/packages/ops/delivery.md#delivery-5)]).
  [[course-publishing-1](specs/packages/course-publishing.md#course-publishing-1)] and [[platform-services-1](specs/packages/platform-services.md#platform-services-1)] name the video library and Supabase Auth, citing the items they serve; the cited packages never cite back.
- **Exclusivity claims are installation policy, not package behavior.**
  github-login offers GitHub sign-in and knows nothing of other methods; only [[platform-services-1](specs/packages/platform-services.md#platform-services-1)] makes GitHub the sole method, and the product scope record ([DR-000](specs/decisions/000-product-scope.md)) keeps the why.
- **State what a package asks of its host whole — rejection arm included — and leave the host general.**
  [[video-library-15](specs/packages/catalog/video-library.md#video-library-15)] states everything the library asks of its embedding host — authorize this asset for this requester — plus what happens when the answer is no.
  [[protected-content-5](specs/packages/protected-content.md#protected-content-5)] answers it with a deployment-owned rule — published-course eligibility — citing [[video-library-15](specs/packages/catalog/video-library.md#video-library-15)] at the host's question and [[course-catalog-2](specs/packages/catalog/course-catalog.md#course-catalog-2)] and [[course-catalog-3](specs/packages/catalog/course-catalog.md#course-catalog-3)] as the rule's inputs; the library's own items still name only the embedding host, a general phrase being sufficient for a replaceable counterparty ([[meta-14](specs/meta.md#meta-14)]).
- **The litmus is the swap.**
  Rebind a supplier and every other package's items read unchanged: swapping Supabase is a new DR plus rewritten platform-services items, nothing else.
  Rebind a composition and the product changes: serve the catalog's media delegations from a different library and [[course-publishing-4](specs/packages/course-publishing.md#course-publishing-4)] walks a different journey.
  GitHub in [[github-login-2](specs/packages/identity/github-login.md#github-login-2)] stays the exception: a user-visible counterparty with no package of its own is named in items (guideline 3), not supplied silently.
