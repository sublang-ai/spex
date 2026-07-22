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
The demo deliberately has no fixed package dependency: [SYLL-13](specs/packages/learning/course-syllabus.md#syll-13) is supplied through [PUBLISH-10](specs/compositions/authoring/publish-course.md#publish-10), and [CAT-24](specs/packages/learning/course-catalog.md#cat-24) through [ACCESS-4](specs/compositions/access/install-course-access.md#access-4).
Do not invent a direct citation merely to demonstrate one.

The litmus for a selectable supply is the swap: a compatible supplier can replace the installed one without editing the client package.
If the client text must change, either the dependency was fixed or the abstraction was incomplete.

Package inventory never implies exclusivity.
Having only `GHID` does not mean other login methods are forbidden.
[DR-001](specs/decisions/001-web-platform.md) selects GitHub-only entry; [PLAT-1](specs/compositions/operations/install-platform.md#plat-1) installs the authority and [ENTRY-1](specs/compositions/access/enter-site.md#entry-1) specifies the journey, while GHID remains reusable beside another identity package.

## 2. The audience is per-package

External and Internal are relative to the package boundary, not to whether a human sees the behavior ([META-10](specs/meta.md#meta-10), [META-11](specs/meta.md#meta-11)).

| Section | Meaning | Example |
| --- | --- | --- |
| External Behavior | outcome or guarantee a package user may rely on | [SYLL-2](specs/packages/learning/course-syllabus.md#syll-2) save result; [SYLL-11](specs/packages/learning/course-syllabus.md#syll-11) publication snapshot |
| Internal Behavior | provider-neutral consumed requirement or private semantic invariant hidden from package users | [SYLL-13](specs/packages/learning/course-syllabus.md#syll-13) content requirement; [SYLL-10](specs/packages/learning/course-syllabus.md#syll-10) revision invariant |

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
Supabase Postgres does not supply CAT's slug ownership or SYLL's revision invariant; [PLAT-7](specs/compositions/operations/install-platform.md#plat-7) instead binds Supabase to LIVE's explicit runtime-service requirement.

It also resolves undefined authorization tokens such as the former `course.author`.
[SYLL-14](specs/packages/learning/course-syllabus.md#syll-14) defines course-authoring permission entirely in SYLL's vocabulary; [ACCESS-4](specs/compositions/access/install-course-access.md#access-4) selects ROLE as this installation's supplier.

## 3. Bindings select; Scenarios compose

A Binding records one atomic installation decision, which may connect multiple endpoints.
A Scenario records a system-user- or operator-meaningful outcome produced by multiple packages.
They are separate item kinds even when they share a file ([META-16](specs/meta.md#meta-16)).
Section presence expresses a composition file's shape; no file-kind flag repeats it.

Bindings have two forms:

- An assembly Binding joins External roles visible through a package or host surface. [ENTRY-10](specs/compositions/access/enter-site.md#entry-10) installs GHID's sign-in states in SITE's login roles.
- A supply Binding selects External Behavior or a named service for a client's Internal requirement. [PUBLISH-10](specs/compositions/authoring/publish-course.md#publish-10) selects VIDS for SYLL's content socket.

Every Binding carries `Clients:`, `Suppliers:`, and `Scope:` ([META-18](specs/meta.md#meta-18)).
They remain structured because citations alone cannot reveal endpoint direction, role pairing, cardinality, installed instances, or applicability; they are not duplicate trace lists.
Endpoint role labels make n:m relationships explicit; list order never implies pairing.
[ACCESS-4](specs/compositions/access/install-course-access.md#access-4) is one atomic policy decision supplying four capability meanings across SYLL, CAT, and VIDS.
Do not mix External assembly clients with Internal supply clients in one item.
A named service must identify the exact selected capability and cite its selecting decision; Binding prose explains compatibility without copying vendor protocols or endpoint mechanics.

Split a Binding when the installation owner intends an endpoint or scope to be selected, changed, or verified independently—not merely because another technical split is imaginable.
For each cited client role, resolved package instance, and scope, exactly one effective Binding must exist unless the client defines aggregation, fallback, or runtime selection ([META-19](specs/meta.md#meta-19)).
[PLAT-1](specs/compositions/operations/install-platform.md#plat-1) and [PLAT-2](specs/compositions/operations/install-platform.md#plat-2) validly bind the same GHID requirement because their production and verification instances do not overlap.

A Binding selects compatible meanings; it cannot broaden, weaken, or translate them.
Required conversion belongs in an adapter package.
These are installation-time bindings unless the contract explicitly defines runtime selection.

A Scenario cites materially necessary behavior from at least two packages inline at the phrase where the handoff occurs, including External Behavior grounding the system outcome ([META-20](specs/meta.md#meta-20)).
It may cite Internal Behavior only when the integrated outcome or inspection genuinely needs it; that citation does not expose the item or let another package depend on it.
An inline Binding citation means the adjacent phrase directly exercises that installed handoff.

Every item citation in a Scenario is operative.
Do not add a detached trace list or cite background, transitive behavior, package inventory, a mere code call, or “see also” context.
If a large citation list cannot be placed naturally beside causal phrases, narrow the Scenario or remove ambient links.

Binding and Scenario may colocate when they share one intent, owner, scope, and change cadence and every same-file Binding is inline-cited by at least one same-file Scenario ([META-21](specs/meta.md#meta-21)).

- [PUBLISH](specs/compositions/authoring/publish-course.md) is mixed because its content and publication bindings enable its journeys.
- [PLAT](specs/compositions/operations/install-platform.md) is binding-only because platform selections are cross-cutting.
- [GUARD](specs/compositions/security/protect-course-content.md) is scenario-only and cites bindings owned elsewhere.

Name a composition file after its installed concern or outcome, never a concatenation of package names.
Directories below `packages/` and `compositions/` are navigation-only collections.
`compositions/` is preferred to `interactions/` because it includes supply and assembly as well as UX-facing journeys.

## 4. Verification follows ownership and audience

Verification has three grades:

- Package Verification checks External contracts, consumed requirements, private invariants, and local failures using controlled collaborators.
- Binding Verification checks endpoint compatibility, selection, and scope. Assembly bindings are exercised at the assembled External surface; supply bindings may use conformance or deployment inspection.
- Scenario Verification checks the integrated system outcome through acceptance evidence.

Every Binding and Scenario must be inline-cited beside an assertion in same-file Verification, but one Verification item need not cite both kinds merely because a file is mixed ([META-22](specs/meta.md#meta-22)).
A journey may exercise a binding whose authoritative conformance check remains in another file.

Citation meaning follows the source and target sections:

| Source | Target | Meaning |
| --- | --- | --- |
| package Behavior | same-package Behavior or peer External Behavior | owned semantic reuse or fixed dependency |
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
[ROLE-14](specs/packages/access/role-access.md#role-14) owns the capability table, [ROLE-20](specs/packages/access/role-access.md#role-20) checks it locally, and [GUARD-23](specs/compositions/security/protect-course-content.md#guard-23) exercises the installed boundary.

The traces are complementary:

```text
Behavior -> inline package Verification citation -> contract evidence
External or materially relevant Internal Behavior -> inline Scenario citation -> Scenario -> inline Verification citation -> acceptance evidence
External supplier -> Binding -> External client role
External supplier or selected service -> Binding -> Internal requirement
Binding -> inline Scenario citation -> Scenario
Binding -> inline Verification citation -> conformance evidence
```

This demo verifies every Scenario and Binding while retaining package-local suites for the behavior compositions should not duplicate.

## 5. Reusable sources and installed views stay separate

Raw package source answers “What does this package promise and require?”
An installed view answers “Who supplies each requirement here?”

Do not answer the second question by adding `Requires:`, `Uses:`, `Binds:`, or copied Binding annotations to package files.
Bindings are n:m and shared; distributed copies drift.
The authoritative package and Binding sources remain separate ([META-23](specs/meta.md#meta-23)).

Tools may derive:

- a package overlay such as `SYLL-13 → PUBLISH-10 → VIDS-10`;
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
6. Verify packages with controlled collaborators, then install assembly roles and selectable suppliers through Bindings.
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

### SHORT-10

When ... the <owned subject> shall <consumed requirement or private invariant>.

## Verification

### SHORT-20

Where ... when ... the contract suite shall assert the
[offered guarantee](#short-1) and [private invariant](#short-10).
```

Omit empty behavior sections.
Never add package Binding or relationship metadata.

### Composition

```markdown
# OUTCOME: Composition Title

## Intent

This composition installs or composes <one cohesive system concern>.

## Binding

### OUTCOME-10
Clients: `role` = [AAA-10](...)
Suppliers: `role` = [BBB-1](...)
Scope: <resolved package instances and installation scope>

Where ... the installation shall ...

## Scenario

### OUTCOME-1

Where [AAA behavior](...) holds, when the system exercises the
[installed handoff](#outcome-10) with [BBB behavior](...), the system
shall <integrated outcome>.

## Verification

### OUTCOME-20

Where ... when the acceptance suite exercises the
[integrated outcome](#outcome-1), it shall ...

### OUTCOME-21

Where ... when the conformance suite inspects the
[installed handoff](#outcome-10), it shall ...
```

`Binding` and `Scenario` are each optional; at least one is required.
`Verification` is always required.
