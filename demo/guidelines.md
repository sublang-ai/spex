<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Writing Strong Spex Specs

This guide explains the normative [demo format](specs/meta.md) through the course website.
If they disagree, `specs/meta.md` controls.

## Key conclusions

### 1. A package boundary is behavioral ownership

A package owns one cohesive vocabulary, responsibility, and—when stateful—lifecycle.
It is not automatically a screen, service, code module, database table, team, or directory.

The course system separates:

- [SYLL](specs/packages/learning/course-syllabus.md): mutable drafts and publication snapshots;
- [CAT](specs/packages/learning/course-catalog.md): immutable releases and current learner selection;
- [VIDS](specs/packages/media/video-library.md): video upload, lifecycle, and private playback; and
- [SITE](specs/packages/web/application-shell.md): this product's routes and presentation language.

They participate in one feature but have different owners, failure modes, and reuse axes.
A package is self-contained when its file defines every package-owned meaning, makes any fixed peer dependency an exact External citation, and states how its contract can be checked with controlled collaborators.

### 2. External and Internal are package-relative

| Section | Meaning | Demo example |
| --- | --- | --- |
| External Behavior | outcome or guarantee a package user may rely on | [SYLL-2](specs/packages/learning/course-syllabus.md#syll-2) save result; [SYLL-11](specs/packages/learning/course-syllabus.md#syll-11) publication snapshot |
| Internal Behavior | provider-neutral requirement consumed by the package, or a private semantic invariant | [SYLL-13](specs/packages/learning/course-syllabus.md#syll-13) required content description; [SYLL-10](specs/packages/learning/course-syllabus.md#syll-10) revision invariant |

Internal does not mean implementation design.
Do not specify classes, hooks, source files, algorithms, or replaceable library choices there.
The package boundary alone decides the section: External is what this package's user may rely on; Internal is hidden from that user.
The user may be a human, host, component, or higher layer.
Thus [PIPE-1](specs/packages/operations/github-delivery.md#pipe-1) is External to PIPE for a contributor, and [SYLL-11](specs/packages/learning/course-syllabus.md#syll-11) is External to SYLL for a publisher, although neither is visible to a learner.
A component may be internal to the installed website while still being an external user of the package it calls.

Keep only behavior that a contract test or inspection can distinguish.
For example, [DR-001](specs/decisions/001-web-platform.md) selects shadcn/ui as a durable stack constraint, while [SITE-5](specs/packages/web/application-shell.md#site-5) owns the visible accessibility guarantee; “use a shared button primitive” is not a second Internal Behavior rule.

Inside Internal Behavior, ask whether a controlled collaborator could satisfy the meaning.
If yes, it is a consumed requirement and may be bound, as [SYLL-13](specs/packages/learning/course-syllabus.md#syll-13) is; if no, it is a private invariant and cannot be bound, as [SYLL-10](specs/packages/learning/course-syllabus.md#syll-10) is.
Keep each consumed requirement in its own item with its rejection behavior, because a Binding cites the whole item anchor.

There are three cases when package A uses package B:

- If B itself is an intentional fixed semantic dependency, A cites B's exact External Behavior. A may never cite B's Internal Behavior, and no Binding restates the fixed citation.
- If A needs a meaning but the installed supplier is selectable, A defines a provider-neutral Internal requirement and a Binding selects B's External Behavior. A does not name B.
- If B is only replaceable implementation allocation, A owns the relevant outcome and there is no spec dependency, Binding, or Scenario.

The demo has no fixed package dependency: [SYLL-13](specs/packages/learning/course-syllabus.md#syll-13) / [PUBLISH-10](specs/compositions/authoring/publish-course.md#publish-10) and [CAT-24](specs/packages/learning/course-catalog.md#cat-24) / [ACCESS-4](specs/compositions/access/install-course-access.md#access-4) are selectable supplies.
Do not invent a direct citation merely to exercise the first case.

For a selectable supply, test both endpoints independently: the client exercises its Internal requirement with a controlled supplier, the provider exercises its External guarantee with a controlled client, and Binding Verification checks the installed pair.
[SYLL-21](specs/packages/learning/course-syllabus.md#syll-21), [VIDS-20](specs/packages/media/video-library.md#vids-20), and [PUBLISH-24](specs/compositions/authoring/publish-course.md#publish-24) demonstrate those three grades.

This resolves the former `course.author` problem: [SYLL-14](specs/packages/learning/course-syllabus.md#syll-14) defines course-authoring permission completely in SYLL's language; [ACCESS-4](specs/compositions/access/install-course-access.md#access-4) selects ROLE as this system's supplier.

### 3. Reusable packages stay unchanged

A reusable package remains unchanged wherever its stated contract and dependencies are accepted.
A polymorphic package defines provider-neutral variation points and lets each installed system supply compatible bindings; a package with an intentional fixed dependency may instead cite that peer's External Behavior.
Neither form cites peer Internal Behavior, project decisions, Bindings, or Scenarios.

Reusable need not mean generic:

- `GHID` is intentionally GitHub-identity-specific.
- `VIDS` is intentionally Supabase-Storage-specific.
- `ROLE` is intentionally a two-role course policy.
- `SITE` honestly declares itself project-local.

Intrinsic domain or provider specialization is useful when Intent states it clearly.
Prefer a provider-neutral Internal requirement when supplier choice is real; use a direct External citation when changing the peer would change the package's declared meaning rather than merely its installation.

Three reuse forms stay distinct: the same package source can be installed unchanged in another system; one system can name several instances in `Scope:`—as [PLAT-1](specs/compositions/operations/install-platform.md#plat-1) and [PLAT-2](specs/compositions/operations/install-platform.md#plat-2) do for production and verification GHID—and one supplied behavior can satisfy several client roles, as ROLE does in [ACCESS-4](specs/compositions/access/install-course-access.md#access-4).

### 4. Package presence never means “only”

Absence is not normative.
Having only `GHID` in a tree does not prove that the system rejects every other login method.

The installed GitHub-only policy is explicit in:

- [DR-001](specs/decisions/001-web-platform.md), which selects the provider policy;
- [PLAT-1](specs/compositions/operations/install-platform.md#plat-1), which installs Supabase Auth with GitHub as the sole method; and
- [ENTRY-1](specs/compositions/access/enter-site.md#entry-1), which requires one login action and no second method.

Keep a package scoped to what it owns; state system-wide exclusivity in installed bindings and scenarios.

### 5. Bindings select; Scenarios compose

A Binding records an installed endpoint selection: either an External assembly role or a hidden semantic supply relationship.
A Scenario records a system-user- or operator-meaningful outcome produced by multiple packages.
They are different even when they share a file.

[ENTRY-10](specs/compositions/access/enter-site.md#entry-10) is an assembly Binding: GHID's External sign-in states fill SITE's External login roles.
[PUBLISH-10](specs/compositions/authoring/publish-course.md#publish-10) is a supply Binding: VIDS's External Behavior satisfies SYLL's Internal requirement.
The endpoint sections reveal the distinction; no `Kind:` or file-type flag repeats it.

| Relationship | Authoritative home | Example |
| --- | --- | --- |
| required meaning | client package Internal Behavior | SYLL-13 content description |
| provided meaning | supplier package External Behavior | VIDS-10 video description |
| installed selection | composition `Binding` item | [PUBLISH-10](specs/compositions/authoring/publish-course.md#publish-10) |
| integrated outcome | composition `Scenario` item | [PUBLISH-1](specs/compositions/authoring/publish-course.md#publish-1) |
| replaceable code dependency | implementation artifacts | a revision library behind SYLL |
| installed package overlay | nowhere; derived view | SYLL's reverse links to PUBLISH-10 and ACCESS-4 |

Package files contain no `Requires:`, `Uses:`, or `Binds:` metadata.
The one authoritative Binding item carries `Clients:`, `Suppliers:`, and `Scope:`.

Do not mistake implementation allocation for supply.
Supabase Postgres does not itself supply CAT's slug ownership or SYLL's revision rules, so no Binding points it at those private invariants; [PLAT-7](specs/compositions/operations/install-platform.md#plat-7) instead binds the selected Supabase service set to LIVE's explicit runtime-service requirement.

### 6. A Binding is not one-to-one

A Binding item may have several clients and suppliers when they form one atomic installation decision.
[ACCESS-4](specs/compositions/access/install-course-access.md#access-4) binds one ROLE decision/policy pair to SYLL, CAT, and VIDS across four capability meanings.
The listed suppliers collectively satisfy the listed clients according to the item's explicit role mapping; list order never implies pairing.
Split an endpoint or scope when this installation's owner intends to select, change, or verify it independently; theoretical technical replaceability alone does not split one declared policy decision.

Do not infer a seam from a recurring noun.
Name every endpoint role and cite every affected item.
For each client role and scope, require exactly one effective binding unless the client explicitly defines aggregation, fallback, or runtime selection.
Identify that role by its cited item, role label, resolved package instance, and scope.
[PLAT-1](specs/compositions/operations/install-platform.md#plat-1) and [PLAT-2](specs/compositions/operations/install-platform.md#plat-2) validly bind the same GHID requirement because their production and test scopes do not overlap.
These are installation/link-time bindings; call a relationship dynamic only when its contract defines runtime selection.

A Binding selects compatible meanings; it cannot broaden, weaken, or translate them.
If conversion is needed, introduce an adapter package that owns the conversion.

### 7. Binding and Scenario may colocate

Colocate them when they have one intent, owner, scope, and change cadence and the binding materially serves the same-file outcome.

- [PUBLISH](specs/compositions/authoring/publish-course.md) is mixed: its content, snapshot, and result bindings directly enable its publication scenarios.
- [PLAT](specs/compositions/operations/install-platform.md) is binding-only: platform services are cross-cutting and change independently of one journey.
- [GUARD](specs/compositions/security/protect-course-content.md) is scenario-only and cites shared bindings defined elsewhere.

In a mixed file, every Binding must be cited by at least one same-file Scenario through `Bindings:`.
Every Binding and Scenario must also be verified.
Do not require one Verification item to cite both: endpoint compatibility may need an inspection while the Scenario needs a journey test.
A non-user-facing supply Binding may still support a user journey; its audience does not make it irrelevant to acceptance.

### 8. Compositions cover most acceptance, not all tests

Scenarios should cover primary journeys, representative denials, dependency failure and recovery, cross-package consistency, integrated accessibility, security boundaries, and deployed operation.

Package Verification keeps local validation matrices, private invariants, races, replay, idempotence, and provider-edge cases that one package can check with controlled collaborators.
Binding Verification checks the selected endpoints and scope.
Scenario Verification checks the integrated outcome.
Assembly Binding Verification exercises the assembled package-user- or host-visible role at its external surface; supply Binding Verification may use conformance inspection.

The demo has acceptance coverage for every Scenario and audience-appropriate coverage for every Binding, while substantial package-local Verification remains.

When behavior has finite dimensions, keep one authoritative table beside its owning item and sweep every cell instead of repeating the policy in prose.
[ROLE-14](specs/packages/access/role-access.md#role-14) owns the capability table; [ROLE-20](specs/packages/access/role-access.md#role-20) checks it locally and [GUARD-23](specs/compositions/security/protect-course-content.md#guard-23) exercises the installed boundary.
Derive any additional audience-by-surface view from those sources rather than maintain a second matrix.

## Why `compositions/`

`compositions/` means system-instantiation modules: bindings, scenarios, or both.
It is broader and less UX-confusable than `interactions/`.
The section grammar, not a file-type flag or directory name, reveals what a file contains.

Directories below `packages/` and `compositions/` are navigation-only collections.
Moving a file changes paths, not ownership, visibility, dependency, runtime, or test semantics.

## Authoring workflow

1. Write concrete journeys and failures: concurrent draft saves, interrupted upload, reused video, stale playback grant, unsafe redirect, failed production candidate.
2. Record durable scope, provider, and technology choices in decisions.
3. Find concepts with distinct owners, lifecycles, consistency boundaries, and reuse axes.
4. Write one package Intent per cohesive responsibility, including nearby exclusions and honest specialization.
5. Write every outcome or guarantee on which a human, host, or component package user may rely as External Behavior.
6. Write provider-neutral consumed requirements and private semantic invariants as Internal Behavior.
7. Define every token, state, value shape, provenance, scope, and mismatch outcome locally.
8. Cite a peer's External Behavior only for an intentional fixed dependency; otherwise expose a provider-neutral socket.
9. Verify each package with controlled collaborators.
10. Install External assembly roles and selectable suppliers with Binding items outside the packages.
11. Write Scenarios for integrated outcomes and cite material bindings.
12. Add binding conformance and scenario acceptance, then update the map.

Starting from journeys is discovery, not ownership.
After boundaries are chosen, each rule gets one authoritative home.

## Package boundary tests

A good package passes these tests:

- Intent states purpose, contract audience when applicable, owned concepts, exclusions, and reuse scope.
- Each shall-clause subject is package-owned.
- One file defines all package-owned domain meaning and links every intentional fixed dependency exactly.
- The package can be contract-tested with controlled collaborators.
- Replacing a supplier for a provider-neutral socket does not require editing the package.
- Every token such as `course-authoring permission` is defined locally; every intentional fixed peer dependency cites exact External Behavior.
- Internal Behavior is semantic and testable, never a code design.

Split when concepts have independent lifecycle, consistency, security, or reuse meaning.
Merge when proposed packages merely divide one behavior by page, tier, team, or table.

## Writing a Binding

Use explicit endpoint roles because one item may be n:m:

```markdown
### PUBLISH-10
Clients: `learning-content input` = [SYLL-13](../../packages/learning/course-syllabus.md#syll-13)
Suppliers: `video reference and description` = [VIDS-10](../../packages/media/video-library.md#vids-10)
Scope: lesson content in this course website, with `video` as the sole installed content kind

The installation shall supply SYLL with VIDS's unchanged chooser descriptions and
exact-reference status for the same active account and request, preserving the
identity, lifecycle, reference-completeness, and unavailable-result meanings owned
by the two endpoints.
```

`Scope:` is required, even when its value is simply `all deployments`, because overlap and multi-instance reuse must be checkable without an implicit default.

Check that:

- a supply client cites Internal Behavior that states the complete consumed meaning and its package supplier cites External Behavior;
- an assembly Binding uses External Behavior for its package-user- or host-visible roles;
- External and Internal client roles are not mixed in one item;
- a controlled collaborator could satisfy every consumed requirement, while no Binding targets a private invariant;
- a private invariant or implementation allocation is never presented as a consumed endpoint;
- a named external service's exact capability is selected by a cited decision and checked against the client meaning;
- Scope explicitly identifies package instances, environment, profile, request, resource, or tenant, even when it applies broadly;
- prose explains semantic compatibility without redefining endpoints;
- the item states how supplier roles satisfy client roles and groups only one atomic installation decision;
- independently owned installation decisions are split;
- no competing effective binding covers the same client role and scope; and
- verification checks the selected provider and client together.

## Writing a Scenario

A Scenario is named after an outcome, not a pair of packages.
Its `Composes:` line immediately follows the item heading and cites behavior from at least two packages, including External Behavior that grounds the system-user- or operator-meaningful outcome.
It may also cite Internal Behavior materially needed to state or inspect that integrated outcome; the citation does not expose the behavior or let another package depend on it.
Its optional `Bindings:` line immediately follows `Composes:` and cites only installed seams materially used by the scenario.
Its prose states shared preconditions, causal order, handoffs, visible result, and failure result in product language.
[GUARD-5](specs/compositions/security/protect-course-content.md#guard-5) concretely cites the packages' Internal trust boundaries because its integrated direct-client matrix inspects them; its External items still ground the system security outcome.

```markdown
### PUBLISH-1
Composes: [SYLL-1](...), [VIDS-1](...), [CAT-3](...)
Bindings: [ACCESS-4](...), [PUBLISH-10](#publish-10), [PUBLISH-11](#publish-11), [PUBLISH-12](#publish-12)

Where the administrator starts with no course, when ...,
the website shall publish one coherent release and return its accepted baseline.
```

Do not cite an Internal item merely because code calls it, own a package entity, restate a Binding, or turn the file into a call graph.

## Verification traces

Package Verification cites same-package behavior.
Composition Verification must cite a same-file Binding or Scenario; it may also cite an external Binding that it directly checks.
Every Binding and Scenario item must be covered, but one verification may cover several closely related items.

```text
External or materially relevant Internal Behavior -> Composes -> Scenario -> Verifies -> acceptance evidence
External supplier -> Binding -> External client role
External supplier or selected service -> Binding -> Internal requirement
```

Verification must not invent an outcome absent from the item it cites.
An external Binding listed by a Scenario remains authoritatively verified in its defining file; the journey may additionally exercise it.

## Derived installed views

Reading a raw package answers: “What does this package promise and require?”
Reading it as installed answers: “Who supplies each requirement here?”

Do not solve the second question by editing package files or duplicating bindings beside every client item.
Bindings are n:m and shared; copied annotations drift.

Resolve authoritative package and Binding sources deterministically to produce:

- a package-focused overlay such as `SYLL-13 → bound by PUBLISH-10 to VIDS-10`;
- a global binding explorer or socket index; and
- deterministic Markdown/text output for GitHub, CLI, CI, and agents.

The desktop UI may be the best interactive view, but it must consume the same model as text tooling.
All projections must agree on the installed graph.
Generated views are read-only, are never independent truth, and should be committed only when reproducible and checked for staleness.

## Minimal skeletons

### Package

```markdown
# SHORT: Package Title

## Intent

This package defines <cohesive capability> for <contract audience or purpose>.
It owns <concepts>, excludes <nearby concerns>, and is <reuse scope>.

## External Behavior

### SHORT-1

Where ... when ... the <owned subject> shall <package-user-visible outcome or provided guarantee>.

### SHORT-10

When ... the <owned provider> shall <External guarantee offered to a component or host>.

## Internal Behavior

### SHORT-15

When ... the <owned subject> shall <consumed requirement or private invariant>.

## Verification

### SHORT-20
Verifies: [SHORT-1](#short-1), [SHORT-10](#short-10), [SHORT-15](#short-15)

Where ... when ... the contract suite shall ...
```

Omit empty behavior sections.
Never add package `Binding`, `Dependencies`, `Requires:`, `Uses:`, or `Binds:` content.

### Composition

```markdown
# OUTCOME: Composition Title

## Intent

This composition installs or verifies <one cohesive system concern>.

## Binding

### OUTCOME-10
Clients: `role` = [AAA-15](...)
Suppliers: `role` = [BBB-10](...)
Scope: <installation scope>

Where ... the installation shall ...

## Scenario

### OUTCOME-1
Composes: [AAA-1](...), [BBB-1](...)
Bindings: [OUTCOME-10](#outcome-10)

Where ... when ... the system shall <integrated outcome>.

## Verification

### OUTCOME-20
Verifies: [OUTCOME-1](#outcome-1)

Where ... when ... the acceptance suite shall ...

### OUTCOME-21
Verifies: [OUTCOME-10](#outcome-10)

Where ... when ... the conformance suite shall ...
```

`Binding` and `Scenario` are each optional; at least one is required.
`Verification` is always required.

## Final audit

- Does every package define its meanings locally, cite only intentional peer External dependencies, and omit installed-system citations?
- Is every package-user contract External and every hidden consumed requirement or private invariant Internal, regardless of whether the user is human or software?
- Can a peer rely only on another package's External Behavior?
- Is every undefined-looking token explained locally?
- Does every installed External assembly role or selectable semantic dependency have one Binding source with explicit roles and scope?
- Are overlapping bindings absent unless aggregation, fallback, or runtime selection is defined?
- Does every mixed-file Binding serve and get cited by a same-file Scenario?
- Are cross-cutting bindings separated when that improves ownership and cadence?
- Does every Scenario describe a meaningful system-user or operator outcome rather than a dependency graph?
- Are all Binding and Scenario items verified at the right evidence grade?
- Do Scenarios cover the important journeys, denials, recovery, security boundaries, accessibility, and deployment operation without duplicating package-local matrices?
- Could code be generated without inventing policy, endpoint meaning, supplier selection, or failure behavior?
