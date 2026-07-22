<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Writing Strong Spex Specs

These five rules explain the normative [demo format](specs/meta.md) through the course website.
If this guide and META differ, META controls.

## 1. Give each package one self-contained behavioral boundary

A package owns one cohesive vocabulary, responsibility, and—when stateful—lifecycle ([META-7](specs/meta.md#meta-7)).
It is not automatically a screen, service, code module, database table, team, or directory.

The course system separates:

- [CAT](specs/packages/learning/course-catalog.md), which owns mutable courses, ordered syllabi, stable routes, publication state, and opaque lesson-media references;
- [VIDS](specs/packages/media/video-library.md), which owns reusable private video assets and bounded playback grants;
- [ROLE](specs/packages/access/role-access.md), which owns one two-role capability policy; and
- [SITE](specs/packages/web/application-shell.md), which owns this product's routes and presentation language.

The CAT–VIDS split is observable, not architectural guesswork.
Deleting a course removes its references but leaves every asset unchanged ([CAT-11](specs/packages/learning/course-catalog.md#cat-11)); deleting a video leaves any course reference for CAT to report and repair ([VIDS-6](specs/packages/media/video-library.md#vids-6), [CAT-9](specs/packages/learning/course-catalog.md#cat-9)).
CAT also states the chosen simple lifecycle explicitly: saving a published course changes that same record immediately and atomically ([CAT-7](specs/packages/learning/course-catalog.md#cat-7)).

One read must define every package-owned value, state, failure, and variation point.
The Intent is standalone prose without citations; it states purpose, nearby exclusions, and honest reuse scope.
A package may be specialized and still reusable: `GHID` is GitHub-specific, `ROLE` is reusable only with its two roles and three capabilities, and `SITE` is deliberately project-local.

When package A appears to use package B, choose the relationship deliberately:

| Relationship | Source form | Use when |
| --- | --- | --- |
| fixed semantic dependency | A's precondition or trigger cites B's exact External Behavior | replacing B would change A's declared contract |
| selectable semantic supplier | A defines a provider-neutral Internal requirement; a Binding selects B's External Behavior | each installation may choose the supplier |
| replaceable code allocation | no package dependency, Binding, or Scenario | only implementation structure changes |

A peer may rely only on another package's External Behavior.
A reusable package never cites project decisions or compositions.
An exact peer-External citation is itself the fixed dependency declaration, so no Binding restates it.
The demo deliberately uses selectable dependencies instead: CAT defines complete media inputs ([CAT-15](specs/packages/learning/course-catalog.md#cat-15), [CAT-16](specs/packages/learning/course-catalog.md#cat-16)), and [PUBLISH-1](specs/compositions/authoring/publish-course.md#publish-1) installs VIDS without changing CAT.

The swap test is practical: a compatible supplier can replace VIDS without editing CAT.
If CAT's text had to change, the dependency would be fixed or its consumed requirement incomplete.

Package inventory never implies exclusivity.
Having only `GHID` does not itself forbid another login method.
[DR-001](specs/decisions/001-web-platform.md), [PLAT-1](specs/compositions/operations/install-platform.md#plat-1), and [ENTRY-2](specs/compositions/access/enter-site.md#entry-2) together make this installation GitHub-only while GHID remains usable beside another identity package.

## 2. Classify behavior by the package's audience

External and Internal are relative to the package boundary, not to human visibility or public accessibility ([META-10](specs/meta.md#meta-10), [META-11](specs/meta.md#meta-11)).

| Section | Meaning | Example |
| --- | --- | --- |
| External Behavior | outcome or guarantee on which a package user may rely | CAT's public dual-order catalog ([CAT-1](specs/packages/learning/course-catalog.md#cat-1)); VIDS's host-facing reference resolution ([VIDS-5](specs/packages/media/video-library.md#vids-5)) |
| Internal Behavior | provider-neutral consumed requirement or private semantic invariant hidden from package users | CAT's media-selection input ([CAT-15](specs/packages/learning/course-catalog.md#cat-15)); CAT's identity, order, slug, and atomicity invariant ([CAT-17](specs/packages/learning/course-catalog.md#cat-17)) |

A package user may be a human, host, component, or higher layer.
[VIDS-5](specs/packages/media/video-library.md#vids-5) is External because a host component consumes it, although visitors never see its opaque reference.
That component can be internal to the website while remaining external to VIDS.
[CAT-13](specs/packages/learning/course-catalog.md#cat-13) is likewise External to CAT's trusted host even though its eligibility result is server-only.
Conversely, [CAT-15](specs/packages/learning/course-catalog.md#cat-15) is Internal because CAT's users cannot rely on the collaborator intake; the installation may still bind a supplier to it.

Internal does not mean source layout, classes, algorithms, framework mechanics, or replaceable library choices.
Keep only behavior a contract test or inspection can distinguish.
For example, [DR-001](specs/decisions/001-web-platform.md) selects shadcn/ui, while [SITE-5](specs/packages/web/application-shell.md#site-5) owns the accessibility outcome; a shared button primitive is not another behavior item.

For each Internal item, ask whether a controlled collaborator could satisfy it:

- If yes, it is a consumed requirement and may be a Binding client. Give it one complete meaning and rejection rule.
- If no, it is a private invariant. Verify it locally and never bind it.

This distinction keeps infrastructure choices out of domain behavior.
Supabase Postgres does not supply CAT's atomicity invariant; it supplies a runtime-service requirement at the platform seam.
It also prevents undefined tokens such as `course.author`: CAT defines its exact course-management authorization intake ([CAT-14](specs/packages/learning/course-catalog.md#cat-14)), and [ACCESS-4](specs/compositions/access/install-course-access.md#access-4) installs ROLE's decision as its supplier.

## 3. Bindings install; Scenarios run

A Binding records one atomic static installation decision.
A Scenario records a triggered system-user- or operator-meaningful outcome produced by multiple packages.
Visibility does not decide the item kind: a visible slot selection is still a Binding; a walk through it is a Scenario ([META-16](specs/meta.md#meta-16), [META-20](specs/meta.md#meta-20)).

A Binding may:

- supply Internal requirements, as [PUBLISH-1](specs/compositions/authoring/publish-course.md#publish-1) supplies CAT's selection and resolution inputs with VIDS;
- assemble External roles, as [ENTRY-1](specs/compositions/access/enter-site.md#entry-1) places GHID behavior into SITE's entry surfaces; or
- supply installation-owned policy over load-bearing External facts, as [GUARD-1](specs/compositions/security/protect-course-content.md#guard-1) supplies VIDS's playback decision from GHID session, ROLE capability, and CAT publication-and-attachment facts.

Direction and scope live once in constrained GEARS prose ([META-18](specs/meta.md#meta-18)):

- `Where` states applicability, resolved client instances, and client givens; cited package behavior there denotes clients.
- The shall clause states the provision; cited package behavior there denotes supplier behavior or load-bearing policy input. A named service and its selecting decision also belong there.

Do not infer direction from External versus Internal alone.
Assembly can connect two External roles, while policy can compute from several External facts.
The clause structure is the reliable signal.
Do not add `Clients:`, `Suppliers:`, or `Scope:` fields, and do not write “where package B is installed” in package A.

For n:m relationships, pair each client and provision in adjacent prose or a normative table; citation order never implies pairing.
[PUBLISH-1](specs/compositions/authoring/publish-course.md#publish-1) pairs CAT's two inputs with the corresponding parts of VIDS's one chooser-and-resolution contract.
Derived views must preserve that whole hyperedge and its authoritative pairing instead of inventing pairwise facts.

Split a Binding when the installation owner intends an endpoint or scope to change or be verified independently, not merely because another technical split is imaginable.
For each resolved client and applicable scope, exactly one effective Binding is the default unless the client explicitly defines other cardinality or runtime selection ([META-19](specs/meta.md#meta-19)).
An applicable Binding declares the relationship; same-file Verification proves its realization.

A Scenario inline-cites only behavior and Bindings that causally produce its outcome.
It cites materially necessary behavior from at least two packages, including External Behavior grounding the system outcome.
An Internal citation is allowed only when the outcome genuinely requires it; that does not expose the item.
Do not add detached `Composes:`, `Bindings:`, or `Verifies:` lists or cite ambient, transitive, or merely called behavior.

Binding and Scenario may share a file when they have one intent, owner, scope, and change cadence, and every Binding materially serves and is cited by a same-file Scenario ([META-21](specs/meta.md#meta-21)).

- [PUBLISH](specs/compositions/authoring/publish-course.md) is mixed because its media Binding enables its authoring journeys.
- [GUARD](specs/compositions/security/protect-course-content.md) is mixed because its playback-policy Binding enables its security journeys.
- [PLAT](specs/compositions/operations/install-platform.md) is binding-only because platform selections are cross-cutting.
- [LEARN](specs/compositions/learning/browse-and-watch.md) is scenario-only because it walks bindings owned by other concerns.

Name a composition after its installed concern or outcome, never a concatenation of package names.
Directories below `packages/` and `compositions/` are navigation-only collections.
`compositions/` is preferable to `interactions/` because it includes static supply, assembly, and policy as well as user journeys.

## 4. Verification follows ownership and audience

Verification has three grades:

- Package Verification checks External contracts, consumed requirements, private invariants, and local failures with controlled collaborators.
- Binding Verification checks endpoint compatibility, selection, scope, and realization. Exercise an externally observable seam at that surface; inspect an installation-hidden seam for conformance.
- Scenario Verification checks the integrated outcome through acceptance evidence.

Every same-file Binding and Scenario must be inline-cited beside a direct assertion in Verification ([META-22](specs/meta.md#meta-22)).
One Verification item need not cite both kinds merely because its file is mixed.
Each citation means direct coverage; supporting context belongs in Intent or a decision.

Keep finite policy matrices beside their owner and sweep them locally.
[ROLE-2](specs/packages/access/role-access.md#role-2) owns the three-capability policy and [ROLE-9](specs/packages/access/role-access.md#role-9) checks its full matrix.
[GUARD-3](specs/compositions/security/protect-course-content.md#guard-3) and [GUARD-8](specs/compositions/security/protect-course-content.md#guard-8) then exercise representative installed denials without copying the matrix.

Scenarios should cover most product acceptance: primary journeys, representative denials, dependency failure and recovery, cross-package consistency, integrated accessibility, security boundaries, and deployed operation ([META-24](specs/meta.md#meta-24)).
They should not absorb package-local validation matrices, races, replay, idempotence, or provider edge cases that one package can verify with a double.

The public-catalog/private-video distinction shows the split.
[CAT-1](specs/packages/learning/course-catalog.md#cat-1) locally guarantees public published listings and [VIDS-7](specs/packages/media/video-library.md#vids-7) locally guarantees bounded authorized playback.
[GUARD-2](specs/compositions/security/protect-course-content.md#guard-2) and [LEARN-1](specs/compositions/learning/browse-and-watch.md#learn-1) compose and accept the product rule: browsing requires no login, while explicit playback does.

The trace is therefore:

```text
Behavior -> inline package Verification citation -> contract evidence
Behavior -> inline Scenario citation -> Scenario -> inline Verification citation -> acceptance evidence
Binding Where citation -> client requirement or role
Binding shall citation -> supplier behavior or load-bearing policy input
Binding -> inline Scenario citation -> integrated use
Binding -> inline Verification citation -> deployment conformance evidence
```

## 5. Keep reusable source separate from installed views

Raw package source answers “What does this package promise and require?”
An installed view answers “What supplies each requirement here?”

Do not add `Requires:`, `Uses:`, `Binds:`, or copied installation annotations to package files.
Bindings are n:m and shared, so distributed copies drift.
Authoritative package and Binding sources remain separate ([META-23](specs/meta.md#meta-23)).

Tools may derive:

- a package overlay such as `CAT-15 + CAT-16 → PUBLISH-1 → VIDS-5`;
- a global Binding explorer or socket index; and
- deterministic Markdown or text for GitHub, CLI, CI, and agents.

The desktop UI may be the best interactive view, but every projection must resolve from the same authoritative graph and remain read-only.
Generated text should be committed only when reproducible and checked for staleness.

Published source identity matters too.
Before publication, compact provisional IDs freely; after an ID and concern appear in a spec release, never renumber, reuse, or re-mean them ([META-4](specs/meta.md#meta-4)).
Moving a file between navigation collections changes paths and affected links, not its short form, anchors, ownership, or behavior.

## Authoring workflow

1. Write concrete journeys, failures, races, and recovery cases.
2. Record durable product, provider, and technology choices in decisions.
3. Split concepts by owner, lifecycle, consistency boundary, and reuse axis.
4. Write one standalone package Intent and classify behavior by that package's audience.
5. Define every value, state, provenance rule, scope, mismatch, and provider-neutral input locally.
6. Verify packages with controlled collaborators, then record static supplier, assembly, and policy decisions through Bindings.
7. Write Scenarios for integrated outcomes and cite only material behavior and Bindings.
8. Add conformance and acceptance evidence, update the map, and confirm code generation need not invent policy or wiring.

Starting from journeys is discovery, not ownership.
After boundaries are chosen, each rule gets one authoritative home.

## Minimal skeletons

### Package

```markdown
# SHORT: Package Title

## Intent

This package defines <cohesive capability>, owns <concepts>, excludes
<nearby concerns>, and is <honest reuse scope>.

## External Behavior

### SHORT-1

Where ... when ... the <owned subject> shall <guarantee offered to a package user>.

## Internal Behavior

### SHORT-2

When ... the <owned subject> shall <complete consumed requirement or private invariant>.

## Verification

### SHORT-3

Where ... when ... the contract suite shall assert the
[offered guarantee](#short-1) and [private invariant](#short-2).
```

Omit empty behavior sections.
Never add package Binding or relationship metadata.

### Composition

```markdown
# OUTCOME: Composition Title

## Intent

This composition installs or composes <one cohesive system concern>.

## Binding

### OUTCOME-1

Where the `production AAA` instance's [complete client requirement](...)
applies to <exact scope>, the installation shall satisfy it with
[BBB's External provision](...) for the same <identity and request>.

## Scenario

### OUTCOME-2

Where [AAA behavior](...) holds, when the system exercises the
[installed handoff](#outcome-1) with [BBB behavior](...), the system
shall <integrated outcome>.

## Verification

### OUTCOME-3

Where ... when the acceptance suite exercises the
[integrated outcome](#outcome-2), it shall ...

### OUTCOME-4

Where ... when the conformance suite inspects the
[installed handoff](#outcome-1), it shall ...
```

`Binding` and `Scenario` are each optional; at least one is required.
`Verification` is always required.
