<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Writing Strong Spex Specs

These five rules explain the normative [demo format](specs/meta.md) through the course website.
If the guide and META differ, META controls.

## 1. A package is a self-contained behavioral owner

A package owns one cohesive vocabulary, responsibility, and—when stateful—lifecycle ([META-7](specs/meta.md#meta-7)).
It is not automatically a screen, service, code module, database table, team, or directory.

The course system separates:

- [SYLL](specs/packages/learning/course-syllabus.md): mutable drafts and publication snapshots;
- [CAT](specs/packages/learning/course-catalog.md): immutable releases and current learner selection;
- [VIDS](specs/packages/media/video-library.md): upload, media lifecycle, and private playback; and
- [SITE](specs/packages/web/application-shell.md): this product's routes and presentation language.

Those packages participate in one feature but have different owners, failure modes, consistency boundaries, and reuse axes.
One read should define every package-owned meaning, failure, and variation point and expose every intentional fixed dependency by an exact link ([META-9](specs/meta.md#meta-9)).
The Intent is standalone prose without citations; it states purpose, nearby exclusions, and honest reuse scope.

Reusable does not mean generic.
`GHID` is GitHub-identity-specific, `VIDS` is Supabase-Storage-specific, `ROLE` owns this course site's two-role policy, and `SITE` is deliberately project-local.
Specialization is healthy when Intent says so and the package remains unchanged wherever that contract applies.

When package A appears to use package B, choose the relationship deliberately:

| Relationship | Source form | Use when |
| --- | --- | --- |
| fixed semantic dependency | A's precondition or trigger cites B's exact External Behavior | replacing B would change A's declared contract |
| selectable semantic supplier | A defines a provider-neutral Internal requirement; a Binding selects B's External Behavior | the installation chooses the supplier |
| replaceable code allocation | no package dependency, Binding, or Scenario | only implementation structure changes |

A peer may never rely on B's Internal Behavior.
A reusable package never cites project decisions or compositions; an exact peer-External citation is itself the fixed dependency declaration, so no Binding restates it.
The demo deliberately has no fixed package dependency: [SYLL-12](specs/packages/learning/course-syllabus.md#syll-12) is supplied through [PUBLISH-1](specs/compositions/authoring/publish-course.md#publish-1), and [CAT-16](specs/packages/learning/course-catalog.md#cat-16) through [ACCESS-4](specs/compositions/access/install-course-access.md#access-4).
Do not invent a direct citation merely to demonstrate one.

The litmus for a selectable supply is the swap: a compatible supplier can replace the installed one without editing the client package.
If the client text must change, either the dependency was fixed or the abstraction was incomplete.

Package inventory never implies exclusivity.
Having only `GHID` does not mean other login methods are forbidden.
[DR-001](specs/decisions/001-web-platform.md) selects GitHub-only entry; [PLAT-1](specs/compositions/operations/install-platform.md#plat-1) installs the authority and [ENTRY-2](specs/compositions/access/enter-site.md#entry-2) specifies the journey, while GHID remains reusable beside another identity package.

## 2. The audience is per-package

External and Internal are relative to the package boundary, not to whether a human sees the behavior ([META-10](specs/meta.md#meta-10), [META-11](specs/meta.md#meta-11)).

| Section | Meaning | Example |
| --- | --- | --- |
| External Behavior | outcome or guarantee a package user may rely on | [SYLL-2](specs/packages/learning/course-syllabus.md#syll-2) save result; [SYLL-10](specs/packages/learning/course-syllabus.md#syll-10) publication snapshot |
| Internal Behavior | provider-neutral consumed requirement or private semantic invariant hidden from package users | [SYLL-12](specs/packages/learning/course-syllabus.md#syll-12) content requirement; [SYLL-17](specs/packages/learning/course-syllabus.md#syll-17) revision invariant |

A package user may be a human, host, component, or higher layer.
[PIPE-1](specs/packages/operations/github-delivery.md#pipe-1) is External to PIPE for a contributor, and SYLL's snapshot is External to SYLL for a publisher, although neither is visible to a learner.
A component can be internal to the installed website while remaining an external user of another package.

Internal does not mean classes, hooks, source files, algorithms, framework mechanics, or replaceable library choices.
Keep only behavior that a contract test or inspection can distinguish.
For example, [DR-001](specs/decisions/001-web-platform.md) selects shadcn/ui, while [SITE-5](specs/packages/web/application-shell.md#site-5) owns the accessibility outcome; “use a shared button primitive” is not another behavior item.

Inside Internal Behavior, ask whether a controlled collaborator could satisfy the item:

- If yes, it is a consumed requirement and may be a Binding client. Give it one complete meaning and rejection rule.
- If no, it is a private invariant. Verify it locally and never bind it.

This distinction prevents a database choice from masquerading as domain behavior.
Supabase Postgres does not supply CAT's slug ownership or SYLL's revision invariant; [PLAT-6](specs/compositions/operations/install-platform.md#plat-6) instead binds Supabase to LIVE's explicit runtime-service requirement.

It also resolves undefined authorization tokens such as the former `course.author`.
[SYLL-13](specs/packages/learning/course-syllabus.md#syll-13) defines course-authoring permission entirely in SYLL's vocabulary; [ACCESS-4](specs/compositions/access/install-course-access.md#access-4) selects ROLE as this installation's supplier.

## 3. Bindings install; Scenarios run

A Binding records one atomic static installation decision.
A Scenario records a triggered system-user- or operator-meaningful outcome produced by multiple packages.
User visibility does not decide the item kind: a visible slot selection remains a Binding, while a walk through that slot is a Scenario ([META-16](specs/meta.md#meta-16), [META-20](specs/meta.md#meta-20)).
Section presence expresses a composition file's shape; no file-kind flag repeats it.

A Binding may:

- supply one or more complete Internal consumed requirements with External Behavior or a selected service, as [PUBLISH-1](specs/compositions/authoring/publish-course.md#publish-1) supplies SYLL's content requirement with VIDS;
- assemble External roles, as [ENTRY-1](specs/compositions/access/enter-site.md#entry-1) places GHID's visible results into SITE's login roles; or
- provide policy owned by the installation and computed over load-bearing External inputs, even when no package offers the whole policy as a supplier contract.

Direction and scope live once in constrained GEARS prose ([META-18](specs/meta.md#meta-18)):

- `Where` names the exact installation scope and resolved client instances; package behavior citations there are client givens.
- The shall clause states the provision; package behavior citations there are supplier behavior or load-bearing External input. A named service and its selecting decision also belong there.

This is the ordinary GEARS reading: preconditions carry an item's givens and its shall clause carries what it provides.
Do not write “where package B is installed” inside package A.
A states the needed capability in its own vocabulary; an applicable, resolved Binding is the instantiation.
For example, SYLL defines its [learning-content requirement](specs/packages/learning/course-syllabus.md#syll-12), and [PUBLISH-1](specs/compositions/authoring/publish-course.md#publish-1) makes that requirement its client given and VIDS's content contract its provision.

Do not add `Clients:`, `Suppliers:`, or `Scope:` fields.
The sentence must remain natural for readers, while clause position gives tooling a deterministic direction.
For n:m relationships, pair each client and provision in adjacent prose or a normative table; citation order never implies pairing.
[ACCESS-4](specs/compositions/access/install-course-access.md#access-4) maps four protected capabilities, and [PUBLISH-3](specs/compositions/authoring/publish-course.md#publish-3) pairs success with success and conflict with conflict; neither relies on citation order.
Derived views treat each Binding as one hyperedge: they retain its complete client and provision sets and render the authoritative pairing prose or table rather than invent pairwise facts.

Installation-owned policy is valid even when its load-bearing External inputs do not offer the whole policy as a supplier contract.
This demo instead makes current-lesson entitlement an explicit CAT provision ([CAT-11](specs/packages/learning/course-catalog.md#cat-11)), so [LEARN-1](specs/compositions/learning/browse-and-watch.md#learn-1) is a supply Binding; if the site owned that authorization rule, its Binding would compute over CAT's publication state without relabeling CAT as the policy supplier.

Split a Binding when the installation owner intends an endpoint or scope to be selected, changed, or verified independently—not merely because another technical split is imaginable.
For each resolved client item, package instance, and applicable scope, exactly one effective Binding is the default.
Absence means an incomplete installation unless the client explicitly defines optionality, aggregation, fallback, another cardinality, or runtime selection ([META-19](specs/meta.md#meta-19)).
[PLAT-1](specs/compositions/operations/install-platform.md#plat-1) and [PLAT-2](specs/compositions/operations/install-platform.md#plat-2) validly bind the same GHID requirement because their named production and verification instances have disjoint scopes.

An applicable, resolved Binding declares the installed relationship; conformance Verification proves that a deployment realizes it.
A Binding cannot broaden, weaken, or translate an endpoint; required conversion belongs in an adapter package.

A Scenario cites materially necessary behavior from at least two packages inline at the phrase where the handoff occurs, including External Behavior grounding the system outcome.
It may cite Internal Behavior only when the integrated outcome or inspection genuinely needs it; that citation does not expose the item or let another package depend on it.
An inline Binding citation means the adjacent phrase directly exercises that installed handoff.

Every item citation in a Scenario is operative.
Do not add a detached trace list or cite background, transitive behavior, package inventory, a mere code call, or “see also” context.
If a large citation list cannot be placed naturally beside causal phrases, narrow the Scenario or remove ambient links.

Binding and Scenario may colocate when they share one intent, owner, scope, and change cadence and every same-file Binding is inline-cited by at least one same-file Scenario ([META-21](specs/meta.md#meta-21)).

- [PUBLISH](specs/compositions/authoring/publish-course.md) is mixed because its static selections enable its journeys.
- [PLAT](specs/compositions/operations/install-platform.md) is binding-only because platform selections are cross-cutting.
- [GUARD](specs/compositions/security/protect-course-content.md) is scenario-only because it specifies triggered security outcomes and cites bindings owned elsewhere.

Name a composition file after its installed concern or outcome, never a concatenation of package names.
Directories below `packages/` and `compositions/` are navigation-only collections.
`compositions/` is preferred to `interactions/` because it includes static supply, assembly, and policy as well as UX-facing journeys.

## 4. Verification follows ownership and audience

Verification has three grades:

- Package Verification checks External contracts, consumed requirements, private invariants, and local failures using controlled collaborators.
- Binding Verification checks endpoint compatibility, selection, scope, and realization in the actual installation. Exercise a relationship observable outside the installed system boundary at that external surface; inspect an installation-hidden relationship for conformance. The external consumer may be human, operator, host, component, or higher layer.
- Scenario Verification checks the integrated system outcome through acceptance evidence.

Every Binding and Scenario must be inline-cited beside an assertion in same-file Verification, but one Verification item need not cite both kinds merely because a file is mixed ([META-22](specs/meta.md#meta-22)).
A journey may exercise a binding whose authoritative conformance check remains in another file.

Citation meaning follows the source and target sections:

| Source | Target | Meaning |
| --- | --- | --- |
| package Behavior | same-package Behavior or peer External Behavior | owned semantic reuse or fixed dependency |
| Binding `Where` clause | package Behavior | resolved client given in the stated scope |
| Binding shall clause | package External Behavior | supplier behavior or load-bearing policy input |
| Binding shall clause | selecting decision | named external service selection |
| Scenario | package Behavior | directly composed behavior |
| Scenario | Binding | directly exercised installed handoff |
| package Verification | same-package Behavior | directly checked package contract |
| composition Verification | same-file Binding/Scenario or directly checked external Binding | directly checked installed or integrated target |

Place each citation beside the exact phrase, table cell, or assertion it qualifies.
Within Scenario and Verification, supporting or incidental item citations are invalid; rationale belongs in Intent or a decision.
These inline composition and verification edges replace `Composes:`, `Bindings:`, and `Verifies:` and prevent prose and detached trace metadata from drifting.

Scenarios should cover most product acceptance: primary journeys, representative denials, dependency failure and recovery, cross-package consistency, integrated accessibility, security boundaries, and deployed operation ([META-24](specs/meta.md#meta-24)).
They should not absorb package-local validation matrices, races, replay, idempotence, or provider edge cases that one package can verify with a double.

Keep finite policy matrices beside their owning behavior and sweep every cell.
[ROLE-7](specs/packages/access/role-access.md#role-7) owns the capability table, [ROLE-12](specs/packages/access/role-access.md#role-12) checks it locally, and [GUARD-10](specs/compositions/security/protect-course-content.md#guard-10) exercises the installed boundary.

The traces are complementary:

```text
Behavior -> inline package Verification citation -> contract evidence
External or materially relevant Internal Behavior -> inline Scenario citation -> Scenario -> inline Verification citation -> acceptance evidence
Binding Where citation -> client requirement or role
Binding shall citation or named service -> supplier behavior or load-bearing External input
applicable resolved Binding -> declared installed relationship
Binding -> inline Scenario citation -> Scenario
Binding -> inline Verification citation -> deployment conformance evidence
```

This demo verifies every Scenario and Binding while retaining package-local suites for the behavior compositions should not duplicate.

## 5. Reusable sources and installed views stay separate

Raw package source answers “What does this package promise and require?”
An installed view answers “Who supplies each requirement here?”

Do not answer the second question by adding `Requires:`, `Uses:`, `Binds:`, or copied Binding annotations to package files.
Bindings are n:m and shared; distributed copies drift.
The authoritative package and Binding sources remain separate ([META-23](specs/meta.md#meta-23)).
Because Binding direction comes from `Where` versus shall-clause placement, tooling can derive it without guessing from External/Internal classification; assembly endpoints may both be External, and a policy provision may consume several External facts.

Tools may derive:

- a package overlay such as `SYLL-12 → PUBLISH-1 → VIDS-10`;
- a global binding explorer or socket index; and
- deterministic Markdown or text for GitHub, CLI, CI, and agents.

The desktop UI may be the best interactive view, but every projection must resolve from the same authoritative graph and remain read-only.
Generated text should be committed only when reproducible and checked for staleness.

Published source identity matters too.
Before publication, compact provisional IDs freely; after an ID and concern appear in a release, never renumber, reuse, or re-mean them ([META-4](specs/meta.md#meta-4)).
Moving a file between navigation collections changes paths and affected links, not its short form, anchors, ownership, or behavior.

## Authoring workflow

1. Write concrete journeys, failures, races, and recovery cases.
2. Record durable product, provider, and technology choices in decisions.
3. Split concepts by owner, lifecycle, consistency boundary, and reuse axis.
4. Write one standalone package Intent and classify behavior by that package's audience.
5. Define every value, state, provenance rule, scope, mismatch, and provider-neutral socket locally.
6. Verify packages with controlled collaborators, then record static supplier, assembly, and policy decisions through Bindings.
7. Write Scenarios for integrated outcomes and cite only material behavior and bindings.
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

When ... the <owned subject> shall <consumed requirement or private invariant>.

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
