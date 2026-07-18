<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Spec Organization Guidelines

Four guidelines for organizing spec items, distilled from building
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
  shell's header slots to the product's surfaces.
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
- **Packages name platforms abstractly; decisions bind them.**
  The specs say "the identity provider", "an access grant",
  "the pipeline"; the binding table of
  [DR-002](specs/decisions/002-platform-and-devops.md) maps each
  abstract subject to Supabase, Vercel, or GitHub and cites the
  items it binds — never the reverse.
  Swapping a vendor is a new decision record, not a spec
  rewrite.
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
  items plus items from at least two packages**
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
