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
  While, or When clause may cite another package's External
  Behavior — a fixed semantic dependency; a selectable
  counterparty gets a slot instead — and the shall clause cites
  no other package
  ([META-13](specs/meta.md#meta-13),
  [META-14](specs/meta.md#meta-14)).
  [CAT-4](specs/packages/catalog/course-catalog.md#cat-4) is
  guarded admin-only by citing
  [ROLE-2](specs/packages/identity/access-control.md#role-2) in
  its Where clause, while its shall clause acts only on the
  course manager — a CAT subject.
  And no clause leans on an undefined token: a phrase like
  "the course's author" would name nothing — no package defines
  authorship — which is why admin gating cites
  [ROLE-2](specs/packages/identity/access-control.md#role-2)
  rather than an imagined owner field.
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
  An unbound slot is an incomplete installation, not a disabled
  feature.
- **Make the boundary itself testable from both sides.**
  [CAT-10](specs/packages/catalog/course-catalog.md#cat-10):
  deleting a course never deletes a provider asset.
  [VID-10](specs/packages/catalog/video-library.md#vid-10):
  deleting an asset never touches host data.
  Each package verifies its own side with a stub for the other.

## 2. Split external from internal behavior by audience, and admit only observable behavior

External behavior is what a package's users — humans, hosts, or
peer packages — may rely on; internal behavior is the package's
consumed requirements and private invariants.
No peer package may rely on or cite an internal item; the
outsiders with standing are the installation's binding items,
which may target a consumed requirement as their client
([META-31](specs/meta.md#meta-31)); scenario items, where an
integrated claim materially needs an internal gate —
[GUARD-2](specs/compositions/protected-content.md#guard-2)
pins four without exposing one; and tests, which may inspect
anything they verify ([META-20](specs/meta.md#meta-20)).
Observability grade is independent of the split: some external
guarantees show only under deliberate inspection (payload
inspection, security testing, restart survival).

- **Write the strongest constraints as external/internal pairs.**
  [CAT-3](specs/packages/catalog/course-catalog.md#cat-3)
  (external): drafts read as not-found.
  [CAT-12](specs/packages/catalog/course-catalog.md#cat-12)
  (internal): drafts are excluded at the data-access layer, so
  no payload can leak one.
  Likewise [SHELL-2](specs/packages/site/web-shell.md#shell-2)
  (the admin entry appears only for admins) pairs with
  [SHELL-6](specs/packages/site/web-shell.md#shell-6)
  (chrome resolves server-side, so no served markup carries
  another role's entries).
- **The audience is per-package, and peers count as users.**
  For the delivery package the user is the developer-operator:
  pull-request checks, preview links, and the secret-handling
  contract the operator works with — the example environment
  file, the no-tracked-secrets guarantee — are external
  ([DELIV-1](specs/packages/ops/delivery.md#deliv-1),
  [DELIV-5](specs/packages/ops/delivery.md#deliv-5));
  migration ordering is internal
  ([DELIV-6](specs/packages/ops/delivery.md#deliv-6)).
  [AUTH-9](specs/packages/identity/github-login.md#auth-9)'s
  verification guarantee is external because
  [VID-8](specs/packages/catalog/video-library.md#vid-8)
  relies on it — what a peer may rely on is offered behavior
  ([META-28](specs/meta.md#meta-28)).
- **Every item, internal included, states an observable outcome**
  ([META-26](specs/meta.md#meta-26)).
  What no test or inspection could distinguish is not behavior.
  The demo once had such an item — "primitives come from the
  shared component kit" — and the cure was deletion, not
  relocation: no observable outcome separates a kit button from
  a pixel-identical hand-rolled one.
- **Decisions are not where implementation details live**
  ([META-24](specs/meta.md#meta-24)).
  Three buckets: an observable outcome code generation must
  honor is a spec item; a technology or architecture choice is
  a decision with its rationale; what neither constrains
  behavior nor records a choice appears in no spec.
  Decision records hold choices, constraints, and tradeoffs —
  the choice and its rationale, never duplicated behavioral
  logic.

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
  A replaceable code library gets less still — no binding item
  at all: its behavioral guarantee, if any, belongs to the
  package that owns the outcome, and its selection to a
  decision record ([META-31](specs/meta.md#meta-31)).
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
  The demo's release gate
  ([IR-003](specs/iterations/003-video-pipeline.md)) is one
  closed rule — every package Verification item plus every
  composition test item — whose composition half spans the
  member journey
  ([PLAY-3](specs/compositions/lesson-playback.md#play-3)),
  authoring and publishing
  ([PUB-4](specs/compositions/course-publishing.md#pub-4)),
  day zero
  ([BOOT-3](specs/compositions/admin-bootstrap.md#boot-3)),
  navigation bindings
  ([NAV-3](specs/compositions/site-navigation.md#nav-3)),
  the gating sweep
  ([GUARD-3](specs/compositions/protected-content.md#guard-3),
  [GUARD-4](specs/compositions/protected-content.md#guard-4)),
  and the substrate inspections
  ([PLAT-6](specs/compositions/platform-services.md#plat-6),
  [PLAT-7](specs/compositions/platform-services.md#plat-7)).
- **Specify matrix behavior as a map and sweep it.**
  [GUARD-1](specs/compositions/protected-content.md#guard-1)
  pins the whole gating surface as one audience-by-surface
  table; its tests assert every cell.
  Deny paths are inherently cross-package, so security
  acceptance lands in compositions naturally.
- **Composition tests cite what they execute: their own scenario
  or binding items plus the package items they check** — a
  scenario test spans two or more packages; a binding inspection
  may touch one package and its service
  ([META-20](specs/meta.md#meta-20),
  [META-31](specs/meta.md#meta-31)).
  These inline citations make coverage mechanically auditable —
  in the demo's adversarial review, every stale citation and
  unverified map cell was caught by walking them.
  Items carry no relationship-metadata lines; the citations in
  an item's clauses are the single source of its relationships
  ([META-20](specs/meta.md#meta-20)).
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

Guideline 2's split recurs between packages, and every open
slot resolves through a binding item in `compositions/` — a
fixed dependency is just a precondition citation (guideline 1)
([META-13](specs/meta.md#meta-13),
[META-15](specs/meta.md#meta-15)).
Composition is the external relationship: the product's user
walks the seam, so its tests are acceptance tests — with
scenario items where the journey itself needs stating; a
walked binding alone, like NAV's, needs only its acceptance
test.
Supply is the internal one: a client consumes a supplier's
external behavior as pure implementation, so it gets a binding
item and inspection tests.
A supplier may be a vendor or an in-house package; the client
cannot tell, which is the point.

- **Every open slot is an item; the decision record keeps the
  why** ([META-24](specs/meta.md#meta-24)).
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
  installation obligation sat in the why layer and hid a hole —
  the role store
  ([ROLE-3](specs/packages/identity/access-control.md#role-3))
  was bound nowhere.
  [PLAT-2](specs/compositions/platform-services.md#plat-2)
  closes it.
  Every binding declares its endpoints by clause — its
  preconditions cite the clients, its shall clause the
  suppliers or the inputs of a rule the installation owns — and
  the provision side cites only offered behavior: External
  items or a named service
  ([META-31](specs/meta.md#meta-31)).
  When no single supplier serves the need, the shall clause
  states a rule the installation itself owns:
  [GUARD-5](specs/compositions/protected-content.md#guard-5)
  answers the video library's authorization socket
  ([VID-15](specs/packages/catalog/video-library.md#vid-15))
  with a deployment-owned rule — published-course membership —
  citing [CAT-2](specs/packages/catalog/course-catalog.md#cat-2)
  and [CAT-3](specs/packages/catalog/course-catalog.md#cat-3)
  as the rule's inputs, not as suppliers.
- **Bindings install; scenarios run.**
  A binding item is static — Where clauses and a shall clause,
  never a trigger
  ([PLAT-1](specs/compositions/platform-services.md#plat-1) has
  no When: it states what the deployment wires, not what
  happens); the moment a walk or an outcome sequence appears —
  sign in, then play
  ([PLAY-1](specs/compositions/lesson-playback.md#play-1)) — it
  is a scenario item.
  Visibility does not decide the kind, and a trigger only
  disqualifies: what makes a binding is the installed
  relationship it declares, while a scenario states integrated
  runtime behavior — triggered or standing, like
  [GUARD-1](specs/compositions/protected-content.md#guard-1)'s
  map, which has no trigger and is still a scenario.
  And a binding only declares the installed relationship:
  whether a deployment realizes it is its tests' question,
  which is why
  [PLAT-6](specs/compositions/platform-services.md#plat-6)
  inspects configuration and egress instead of walking a
  journey.
- **A socket is one complete consumed requirement — rejection
  arm included.**
  [VID-15](specs/packages/catalog/video-library.md#vid-15)
  states everything the video library asks of its host —
  authorize this asset for this requester — plus what happens
  when the answer is no, so
  [GUARD-5](specs/compositions/protected-content.md#guard-5)
  can bind it whole.
  The test for socket-hood is the stand-in for a declared
  collaborator: VID-15 names the embedding host, and a stub
  host can supply the answer it consumes, so it is consumed and
  bindable.
  [CAT-12](specs/packages/catalog/course-catalog.md#cat-12)
  names no collaborator — excluding drafts at the data layer is
  the catalog's own discipline — so it is a private invariant,
  and inventing a "draft-filter provider" to bind it would not
  make it consumed ([META-31](specs/meta.md#meta-31)).
- **The litmus is the swap.**
  Rebind a supplier and every package item reads unchanged:
  swapping Supabase is a new DR plus rewritten PLAT items,
  nothing else.
  Were a package's own text to change under the swap, its
  dependency was really fixed — or its consumed requirement
  incomplete.
  Rebind a composition and the product changes: aim the media
  slot at a different library and
  [PUB-4](specs/compositions/course-publishing.md#pub-4) walks
  a different journey.
  GitHub in
  [AUTH-2](specs/packages/identity/github-login.md#auth-2)
  stays the exception: a user-visible counterparty with no
  package of its own is named in items (guideline 3), not
  supplied silently.
  Exclusivity claims are installation policy, not package
  behavior ([META-15](specs/meta.md#meta-15)): AUTH offers
  GitHub sign-in, and only
  [PLAT-1](specs/compositions/platform-services.md#plat-1)
  makes it the sole method.
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
  [BOOT](specs/compositions/admin-bootstrap.md)); binding-only
  with walked seams
  ([NAV](specs/compositions/site-navigation.md),
  acceptance-tested); binding-only supply
  ([PLAT](specs/compositions/platform-services.md),
  inspection-tested); and mixed
  ([PUB](specs/compositions/course-publishing.md),
  [GUARD](specs/compositions/protected-content.md)).
  NAV and PLAT share one shape with opposite audiences — which
  is why no declared "binding file type" exists.
  Any per-package overlay of these bindings — say
  CAT-8 → PUB-1 → VID-4 — is a derived, read-only view
  ([META-34](specs/meta.md#meta-34)): bindings are shared n:m
  facts, and copies pushed into package files would drift.
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
