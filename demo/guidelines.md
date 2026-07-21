<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Spec Organization Guidelines

Five guidelines for organizing spec items, distilled from building
the Academy demo.
Each is stated as a rule, grounded in the demo's files, and named
by the META items of [specs/meta.md](specs/meta.md) that encode it.

## 1. Draw package boundaries so every package is self-contained

A package is one file, one intent, one closed set of subjects
([META-9](specs/meta.md#meta-9),
[META-13](specs/meta.md#meta-13)).
Self-contained means the shall clause never reaches into another
package:

- **Reference other packages only in preconditions.** A Where,
  While, or When clause may cite another package's item; the
  shall clause may not
  ([META-13](specs/meta.md#meta-13),
  [META-14](specs/meta.md#meta-14)).
  [CAT-4](specs/packages/catalog/course-catalog.md#cat-4) is
  guarded admin-only by citing
  [ROLE-2](specs/packages/identity/access-control.md#role-2) in
  its Where clause, while its shall clause acts only on the
  course manager — a CAT subject.
- **Leave open slots where another party must plug in, and name
  them abstractly.** The catalog stores "one media attachment as
  an opaque reference" from "the deployment's media provider"
  ([CAT-8](specs/packages/catalog/course-catalog.md#cat-8));
  the video library serves "host surfaces"
  ([VID-5](specs/packages/catalog/video-library.md#vid-5));
  the shell's header entries are unbound slots
  ([SHELL-1](specs/packages/site/web-shell.md#shell-1)).
  Neither side of a slot names the other.
- **Bind slots in compositions, nowhere else**
  ([META-31](specs/meta.md#meta-31)).
  [PUB-1](specs/compositions/course-publishing.md#pub-1) binds
  the catalog's media slot to the video library;
  [NAV-1](specs/compositions/site-navigation.md#nav-1) binds the
  shell's header slots to the product's surfaces; the platform
  seams no user walks bind there too
  ([PLAT-1](specs/compositions/platform-services.md#plat-1)) —
  decisions only choose.
- **Make the boundary itself testable from both sides.**
  [CAT-10](specs/packages/catalog/course-catalog.md#cat-10):
  deleting a course never deletes a provider asset.
  [VID-10](specs/packages/catalog/video-library.md#vid-10):
  deleting an asset never touches host data.
  Each package verifies its own side with a stub for the other.

## 2. Split external from internal behavior by audience, and admit only observable behavior

External behavior is the language the package speaks with its own
user; internal behavior is the discipline that keeps that
language honest — still observable, but only by deliberately
looking (payload inspection, security testing, restart survival).

- **Write the strongest constraints as external/internal pairs.**
  [AUTH-1](specs/packages/identity/github-login.md#auth-1)
  (external): the sign-in page offers exactly one method.
  [AUTH-10](specs/packages/identity/github-login.md#auth-10)
  (internal): exactly one provider is enabled, so no request
  path can mint a session another way.
  Likewise [CAT-3](specs/packages/catalog/course-catalog.md#cat-3)
  (drafts read as not-found) pairs with
  [CAT-12](specs/packages/catalog/course-catalog.md#cat-12)
  (drafts are excluded at the data-access layer).
- **The audience is per-package.** For the delivery package the
  user is the developer-operator: pull-request checks and
  preview links are external
  ([DELIV-1](specs/packages/ops/delivery.md#deliv-1)); secret
  storage and migration ordering are internal
  ([DELIV-5](specs/packages/ops/delivery.md#deliv-5),
  [DELIV-6](specs/packages/ops/delivery.md#deliv-6)).
- **Every item, internal included, states an observable outcome**
  ([META-26](specs/meta.md#meta-26)).
  What no test or inspection could distinguish is not behavior.
  The demo once had such an item — "primitives come from the
  shared component kit" — and the cure was deletion, not
  relocation: no observable outcome separates a kit button from
  a pixel-identical hand-rolled one.
- **Decisions are not where implementation details live**
  ([META-24](specs/meta.md#meta-24)).
  A detail that code generation requires is a spec item with its
  outcome stated; a detail that code generation does not require
  appears in no spec.
  Decision records hold choices, constraints, and tradeoffs —
  the why, never the how.

## 3. Keep packages standalone and reusable; bind them in decisions and compositions

Four of Academy's six packages contain no product noun and would
drop into another product unchanged.

- **Intents are self-contained prose with no citations**
  ([META-15](specs/meta.md#meta-15)).
  A dependency worth stating is already an item-level
  precondition citation; repeating it in the Intent couples the
  package to its current neighbors.
- **Packages name platforms abstractly; decisions choose,
  binding items wire.**
  The specs say "the identity store", "an access grant",
  "the pipeline";
  [DR-002](specs/decisions/002-platform-and-devops.md) chooses
  Supabase, Vercel, and GitHub, and the binding items of
  [PLAT](specs/compositions/platform-services.md) wire each
  subject to its service, citing the package items they bind —
  never the reverse.
  Swapping a vendor is a new decision record plus rewritten
  binding items; package items stay unchanged.
  The exception proves the rule: GitHub appears in
  [AUTH](specs/packages/identity/github-login.md) items because
  the user sees GitHub; the technology is the behavior there.
- **Reuse within a project is citation from preconditions.**
  [ROLE-2](specs/packages/identity/access-control.md#role-2) is
  defined once and cited by
  [CAT-4](specs/packages/catalog/course-catalog.md#cat-4),
  [VID-1](specs/packages/catalog/video-library.md#vid-1), and
  the BOOT and GUARD compositions — one denial grammar, four
  consumers.
- **Packages never cite compositions**
  ([META-33](specs/meta.md#meta-33)).
  The dependency direction stays acyclic — decisions and
  compositions cite packages, like an application importing
  libraries — so lifting a package out drags no scenario
  context along.
  Moving [AUTH](specs/packages/identity/github-login.md) to
  another product means retargeting a few precondition
  citations and nothing else.
- **Collections carry no semantics**
  ([META-32](specs/meta.md#meta-32)).
  `packages/identity/` and `packages/catalog/` are shelves, not
  layers; a file's identity is its basename and short form, so
  regrouping never changes an ID, anchor, or meaning.

## 4. Derive release acceptance from compositions

Release acceptance is the composition tests plus each package's
Verification items; the compositions alone cover everything
integrated.

- **Each composition is one integrated behavior, and its tests
  are acceptance tests**
  ([META-21](specs/meta.md#meta-21),
  [META-31](specs/meta.md#meta-31)).
  The demo's release acceptance
  ([IR-003](specs/iterations/003-video-pipeline.md)) is
  literally the composition test list: the member journey
  ([PLAY-3](specs/compositions/lesson-playback.md#play-3)),
  authoring and publishing
  ([PUB-4](specs/compositions/course-publishing.md#pub-4)),
  day zero
  ([BOOT-3](specs/compositions/admin-bootstrap.md#boot-3)),
  navigation bindings
  ([NAV-3](specs/compositions/site-navigation.md#nav-3)), and
  the gating sweep
  ([GUARD-3](specs/compositions/protected-content.md#guard-3),
  [GUARD-4](specs/compositions/protected-content.md#guard-4)).
- **Specify matrix behavior as a map and sweep it.**
  [GUARD-1](specs/compositions/protected-content.md#guard-1)
  pins the whole gating surface as one audience-by-surface
  table; its tests assert every cell.
  Deny paths are inherently cross-package, so security
  acceptance lands in compositions naturally.
- **Composition tests cite what they execute: their own scenario
  or binding items plus items from at least two packages**
  ([META-20](specs/meta.md#meta-20),
  [META-31](specs/meta.md#meta-31)).
  These Verifies lines make coverage mechanically auditable —
  in the demo's adversarial review, every stale citation and
  unverified map cell was caught by walking them.
- **Know what compositions do not cover.** Single-package
  behavior that is still acceptance-relevant — upload refusal
  ([VID-2](specs/packages/catalog/video-library.md#vid-2)),
  responsive fit
  ([SHELL-4](specs/packages/site/web-shell.md#shell-4)),
  editor validation
  ([CAT-7](specs/packages/catalog/course-catalog.md#cat-7)) —
  lives in package Verification, which is why the release run
  includes both.

## 5. Split composition from supply by audience

Guideline 2's split recurs between packages, and every seam is
a binding item in `compositions/`
([META-13](specs/meta.md#meta-13),
[META-15](specs/meta.md#meta-15)).
Composition is the external relationship: the product's user
walks the seam, so it gets scenario items and acceptance tests.
Supply is the internal one: a client consumes a supplier's
external behavior as pure implementation, so it gets a binding
item and inspection tests.
A supplier may be a vendor or an in-house package; the client
cannot tell, which is the point.

- **Every seam is an item; the decision record keeps the why**
  ([META-24](specs/meta.md#meta-24)).
  [PUB-1](specs/compositions/course-publishing.md#pub-1) binds
  the catalog's media slot
  ([CAT-8](specs/packages/catalog/course-catalog.md#cat-8)) to
  the video library — the admin crosses that seam in person
  ([PUB-4](specs/compositions/course-publishing.md#pub-4)).
  [PLAT-3](specs/compositions/platform-services.md#plat-3)
  binds the library's private storage and grants
  ([VID-7](specs/packages/catalog/video-library.md#vid-7),
  [VID-8](specs/packages/catalog/video-library.md#vid-8)) to
  Supabase Storage — no user observes that seam
  ([META-26](specs/meta.md#meta-26)), so
  [PLAT-6](specs/compositions/platform-services.md#plat-6)
  inspects a deployment instead.
  [DR-002](specs/decisions/002-platform-and-devops.md) only
  chooses the vendors, citing the PLAT items; when its table
  carried "private bucket, signed URLs" as prose, that
  codegen-required detail sat in the why layer and hid a hole —
  the role store
  ([ROLE-3](specs/packages/identity/access-control.md#role-3))
  was bound nowhere.
  [PLAT-2](specs/compositions/platform-services.md#plat-2)
  closes it.
- **The litmus is the swap.**
  Rebind a supplier and every package item reads unchanged:
  swapping Supabase is a new DR plus rewritten PLAT items,
  nothing else.
  Rebind a composition and the product changes: aim the media
  slot at a different library and
  [PUB-4](specs/compositions/course-publishing.md#pub-4) walks
  a different journey.
  GitHub in
  [AUTH-2](specs/packages/identity/github-login.md#auth-2)
  stays the exception: a user-visible counterparty with no
  package of its own is named in items (guideline 3), not
  supplied silently.
- **A client never names its supplier — not even in a
  precondition.**
  Citation is for behavior the client's own user lives through:
  [CAT-4](specs/packages/catalog/course-catalog.md#cat-4) cites
  [ROLE-2](specs/packages/identity/access-control.md#role-2)
  because a member experiences that denial.
  A supplier appears in no clause of its client: the client
  states an abstract subject — "the identity store"
  ([AUTH-7](specs/packages/identity/github-login.md#auth-7)),
  "the platform's environment configuration"
  ([DELIV-5](specs/packages/ops/delivery.md#deliv-5)) — and the
  deployment's binding item does the naming
  ([PLAT-1](specs/compositions/platform-services.md#plat-1),
  [META-15](specs/meta.md#meta-15)).
- **An in-house supplier gets the same item, citable on both
  ends.**
  Every demo supplier happens to be a vendor; were the
  component kit a package with observable behavior of its own,
  its supply binding would cite the kit's items exactly as
  [PUB-1](specs/compositions/course-publishing.md#pub-1) cites
  [VID-4](specs/packages/catalog/video-library.md#vid-4).
  Each side still tests alone: the client drives a double of
  the supplied subject
  ([VID-11](specs/packages/catalog/video-library.md#vid-11)'s
  storage test double), the supplier a stub of its host
  ([VID-13](specs/packages/catalog/video-library.md#vid-13)) —
  no scenario required.
- **Files take four shapes; audience picks the test kind, never
  the residence** ([META-34](specs/meta.md#meta-34)).
  Scenario-only
  ([PLAY](specs/compositions/lesson-playback.md),
  [GUARD](specs/compositions/protected-content.md),
  [BOOT](specs/compositions/admin-bootstrap.md)); binding-only
  with walked seams
  ([NAV](specs/compositions/site-navigation.md),
  acceptance-tested); binding-only supply
  ([PLAT](specs/compositions/platform-services.md),
  inspection-tested); and mixed
  ([PUB](specs/compositions/course-publishing.md)).
  NAV and PLAT share one shape with opposite audiences — which
  is why no declared "binding file type" exists.
- **Colocate a binding with scenarios only where a scenario
  depends on it** ([META-34](specs/meta.md#meta-34)).
  In a mixed file, each binding item is cited by a same-file
  scenario
  ([PUB-2](specs/compositions/course-publishing.md#pub-2)
  cites [PUB-1](specs/compositions/course-publishing.md#pub-1));
  conformance and acceptance may share one test
  ([PUB-4](specs/compositions/course-publishing.md#pub-4)) but
  need not.
  A binding no same-file scenario depends on, or one serving
  several concerns — every journey needs storage — lives in a
  bindings-only file: that is what keeps
  [PLAT-2](specs/compositions/platform-services.md#plat-2) out
  of [PUB](specs/compositions/course-publishing.md).
