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
A package is self-contained when its file alone defines what it promises, what it needs, and how it can be contract-tested with controlled collaborators.

### 2. Divide behavior by audience and direction

| Section | Meaning | Demo example |
| --- | --- | --- |
| User Behavior | outcome visible to a named human | [SYLL-2](specs/packages/learning/course-syllabus.md#syll-2) save result |
| Collaborator Behavior | output or guarantee offered to another package or host | [SYLL-11](specs/packages/learning/course-syllabus.md#syll-11) publication snapshot |
| Internal Behavior | provider-neutral requirement consumed by the package, or a private semantic invariant | [SYLL-13](specs/packages/learning/course-syllabus.md#syll-13) required content description; [SYLL-10](specs/packages/learning/course-syllabus.md#syll-10) revision invariant |

Internal does not mean implementation design.
Do not specify classes, hooks, source files, algorithms, or replaceable library choices there.
Classification follows who may rely on which direction of meaning, not code visibility or human visibility alone.
Use User Behavior when the human is the contract audience and Collaborator Behavior when a peer or host relies on the output; invisibility alone never makes behavior Internal.

Inside Internal Behavior, ask whether a controlled collaborator could satisfy the meaning.
If yes, it is a consumed requirement and may be bound, as [SYLL-13](specs/packages/learning/course-syllabus.md#syll-13) is; if no, it is a private invariant and cannot be bound, as [SYLL-10](specs/packages/learning/course-syllabus.md#syll-10) is.
Keep each consumed requirement in its own item with its rejection behavior, because a Binding cites the whole item anchor.

There are two cases when package A uses package B:

- If A's specified contract depends on a semantic guarantee supplied by B, A defines one provider-neutral Internal requirement, B offers Collaborator Behavior, and an external Binding installs B; neither package names the other.
- If B is only replaceable implementation allocation, A owns the relevant outcome and there is no spec dependency, Binding, or Scenario.

This resolves the former `course.author` problem: [SYLL-14](specs/packages/learning/course-syllabus.md#syll-14) defines course-authoring permission completely in SYLL's language; [ACCESS-4](specs/compositions/access/install-course-access.md#access-4) selects ROLE as this system's supplier.

### 3. Reusable packages stay unchanged

A reusable package is a polymorphic contract: it defines collaborator meanings and variation points, while each installed system supplies compatible bindings.
The package source remains unchanged and contains no peer, project-decision, Binding, or Scenario citations.

Reusable need not mean generic:

- `GHID` is intentionally GitHub-identity-specific.
- `VIDS` is intentionally Supabase-Storage-specific.
- `ROLE` is intentionally a two-role course policy.
- `SITE` honestly declares itself project-local.

Intrinsic domain or provider specialization is useful when Intent states it clearly.
An exact peer package is never imported into a reusable package spec: define the required meaning locally, then bind the installed supplier externally.

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

A Binding records an installed endpoint selection: either a public assembly role or a non-user-facing semantic supply relationship.
A Scenario records a human- or operator-meaningful outcome produced by multiple packages.
They are different even when they share a file.

[ENTRY-10](specs/compositions/access/enter-site.md#entry-10) is a public Binding: GHID's visible sign-in states fill SITE's login roles.
[PUBLISH-10](specs/compositions/authoring/publish-course.md#publish-10) is a supply Binding: VIDS's Collaborator Behavior satisfies SYLL's Internal requirement.
The endpoint sections reveal the distinction; no `Kind:` or file-type flag repeats it.

| Relationship | Authoritative home | Example |
| --- | --- | --- |
| required meaning | client package Internal Behavior | SYLL-13 content description |
| provided meaning | supplier package Collaborator Behavior | VIDS-10 video description |
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
Public Binding Verification exercises the assembled human- or host-visible role at its public surface; supply Binding Verification may use conformance inspection.

The demo has acceptance coverage for every Scenario and audience-appropriate coverage for every Binding, while substantial package-local Verification remains.

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
5. Write human-visible outcomes as User Behavior.
6. Write outputs offered to hosts or peers as Collaborator Behavior.
7. Write provider-neutral consumed requirements and private semantic invariants as Internal Behavior.
8. Define every token, state, value shape, provenance, scope, and mismatch outcome locally.
9. Verify each package with controlled collaborators.
10. Install public roles and concrete suppliers with Binding items outside the packages.
11. Write Scenarios for integrated outcomes and cite material bindings.
12. Add binding conformance and scenario acceptance, then update the map.

Starting from journeys is discovery, not ownership.
After boundaries are chosen, each rule gets one authoritative home.

## Package boundary tests

A good package passes these tests:

- Intent states purpose, contract audience when applicable, owned concepts, exclusions, and reuse scope.
- Each shall-clause subject is package-owned.
- One file defines all required domain meaning.
- The package can be contract-tested with controlled collaborators.
- Replacing a compatible supplier does not require editing the package.
- No project or peer package is needed to explain a token such as `course.author`.
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

For a chooser, the installation shall supply VIDS's unchanged descriptor set,
requiring references for `ready` and `unavailable` but allowing omission for `uploading` and `failed`.
For exact-reference status, it shall return the matching `ready` or `unavailable` description, or unavailable.
```

`Scope:` is required, even when its value is simply `all deployments`, because overlap and multi-instance reuse must be checkable without an implicit default.

Check that:

- a supply client cites Internal Behavior that states the complete consumed meaning and its package supplier cites Collaborator Behavior;
- a public Binding uses User or Collaborator Behavior for its visible or host-visible roles;
- public and Internal client roles are not mixed in one item;
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
Its `Composes:` line immediately follows the item heading and cites public behavior from at least two packages, including a User Behavior item that grounds the visible outcome.
Its optional `Bindings:` line immediately follows `Composes:` and cites only installed seams materially used by the scenario.
Its prose states shared preconditions, causal order, handoffs, visible result, and failure result in product language.

```markdown
### PUBLISH-1
Composes: [SYLL-1](...), [VIDS-1](...), [CAT-3](...)
Bindings: [ACCESS-4](...), [PUBLISH-10](#publish-10), [PUBLISH-11](#publish-11), [PUBLISH-12](#publish-12)

Where the administrator starts with no course, when ...,
the website shall publish one coherent release and return its accepted baseline.
```

Do not cite Internal Behavior, own a package entity, restate a Binding, or turn the file into a call graph.

## Verification traces

Package Verification cites same-package behavior.
Composition Verification must cite a same-file Binding or Scenario; it may also cite an external Binding that it directly checks.
Every Binding and Scenario item must be covered, but one verification may cover several closely related items.

```text
User/Collaborator Behavior -> Composes -> Scenario -> Verifies -> acceptance evidence
User/Collaborator supplier -> Binding -> public client role
Collaborator Behavior or selected service -> Binding -> Internal requirement
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

## User Behavior

### SHORT-1

Where ... when ... the <owned subject> shall <human-visible outcome>.

## Collaborator Behavior

### SHORT-10

When ... the <owned provider> shall <provided semantic outcome>.

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

- Does every package stand alone with no peer or installed-system citation?
- Is each human-facing contract User, each peer/host guarantee Collaborator, and each consumed requirement/private invariant Internal?
- Can a peer rely only on Collaborator Behavior?
- Is every undefined-looking token explained locally?
- Does every installed public role or semantic dependency have one Binding source with explicit roles and scope?
- Are overlapping bindings absent unless aggregation, fallback, or runtime selection is defined?
- Does every mixed-file Binding serve and get cited by a same-file Scenario?
- Are cross-cutting bindings separated when that improves ownership and cadence?
- Does every Scenario describe a meaningful human or operator outcome rather than a dependency graph?
- Are all Binding and Scenario items verified at the right evidence grade?
- Do Scenarios cover the important journeys, denials, recovery, security boundaries, accessibility, and deployment operation without duplicating package-local matrices?
- Could code be generated without inventing policy, endpoint meaning, supplier selection, or failure behavior?
