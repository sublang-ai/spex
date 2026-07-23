<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# META: Spec Definition

## Intent

This spec defines the structure and organization of specifications (specs), per [DR-000](decisions/000-spec-structure-format.md).

## Organization

### META-1

The `specs/` directory shall contain the following subdirectories and files:

| Path | Content | File Naming |
| --------- | ------- | ------ |
| `decisions/` | Decision records (DRs) | \<NNN\>-\<kebab-case\>.md |
| `iterations/` | Iteration records (IRs) | \<NNN\>-\<kebab-case\>.md |
| `packages/` | spec packages, one item file per package | [\<path\>/]\<kebab-case\>.md |
| `compositions/` | cross-package compositions: scenarios, bindings, and their tests | [\<path\>/]\<kebab-case\>.md |
| `map.md` | spec index for navigation | - |
| `meta.md` | the spec of specs | - |

### META-3

Each item file shall include an `## Intent` section stating its purpose.

### META-21

Test items shall focus on integration and system testing.

A package's `## Verification` section shall hold test items that check that package's own claims.
Package test items shall drive the package against controlled collaborators — stubs standing in for its peers and services — never by executing a selected supplier; supplier-facing checks are composition tests ([META-31](#meta-31)).
Test items that involve multiple spec packages shall live in `compositions/` files.

Unit tests shall be part of the implementation and shall not be specified as spec items.

## Record format

### META-4

Each decision record (DR) shall follow the ADR format [[2]] with the following sections: Status, Context, Decision, and Consequences.

### META-5

Each iteration record (IR) shall contain the following sections: Goal, Deliverables (with checkboxes), Tasks (numbered, each in one-commit size), and Acceptance criteria.

### META-23

DRs and IRs shall be written in concise language, including only what is needed to act on or audit the record, with preference for bullets and tables over prose paragraphs.

### META-24

A DR shall specify design decisions and constraints, not duplicate implementation logic.
A DR is sufficient when an implementer can generate or audit code from the design intent, constraints, and tradeoffs.
DRs shall carry no implementation details: a detail that code generation requires shall be a spec item with its observable outcome stated ([META-26](#meta-26)); a detail that code generation does not require shall appear in no spec.

### META-25

In prose paragraphs of DRs and IRs, each sentence shall begin on a new line for diff readability.
List items and table cells are exempt, since their delimiters already isolate per-entry changes.
Fixed-width column wrapping within a sentence is allowed.

## Item syntax

### META-6

Each spec item shall use the GEARS pattern [[1]]:

```text
[Where <static precondition(s)>] [While <stateful precondition(s)>] [When <trigger>] The <subject> shall <behavior>.
```

Clauses and punctuation shall follow standard English conventions.

| Clause | Purpose | Example |
| ------ | ------- | ------- |
| Where | Static preconditions (features, config) | Where debug mode is enabled |
| While | Stateful preconditions (runtime state) | While the connection is active |
| When | Trigger event (at most one) | When the user clicks submit |
| shall | Required behavior | The form shall validate inputs |

### META-7

Where test cases are expressed by Given-When-Then (GWT), their spec items shall map GWT to GEARS [[1]]:

| GWT | Clause |
| --- | ------ |
| Given | Where + While |
| When | When |
| Then | shall |

### META-8

Each item shall be self-contained:

- It shall have no implicit dependency on sections other than its own subsections.
- Citations to other specs or shared sections shall be explicit.

### META-26

A spec item shall describe behavior as observable outcomes (e.g., file state, exit code, printed output, return value, network call) under named conditions, including any conditions under which a particular outcome shall not occur.

## Spec packages

### META-9

A spec package shall be a single item file under `packages/`, so one read covers the whole package.
Packages may be grouped into subdirectories of `packages/` for navigation convenience ([META-32](#meta-32)).

### META-10

A spec package shall have a basename \<kebab-case\>.md unique across `specs/packages/` and `specs/compositions/`, with a short form \<ALLCAPS\> unique across the same set.

Example: `package-management.md` has short form `PKGMGT`.

### META-28

Each package file shall contain only the following `##` sections, in this order:

| Section | Presence | Content |
| ------- | -------- | ------- |
| `## Intent` | required | the package's purpose ([META-3](#meta-3)) |
| `## External Behavior` | optional | outcomes and guarantees the package's users may rely on |
| `## Internal Behavior` | optional | consumed requirements and private invariants, hidden from the package's users |
| `## Verification` | optional | test items checking this package's claims ([META-21](#meta-21)) |
| `## References` | optional | external sources ([META-19](#meta-19)) |

At least one of `## External Behavior` and `## Internal Behavior` shall be present.
A package's user is any human, host, or peer component using its contract; classification is package-relative, and a peer may rely only on External Behavior.
Topic subsections (`###`) and item headings (`###` or `####`) live inside the behavior and Verification sections.
Localized scaffolds translate these section headings; the bundled templates define the active names.

### META-11

Each item shall have an ID unique within `specs/`, following \<PACK\>-\<N...\> format (e.g., AUTH-11, URL-3) as a markdown heading for anchor linking.

Note: \<PACK\> refers to the short form of the containing file's name.

### META-12

An item ID, and the concern it identifies, is reserved once it has appeared in any release; a reserved ID shall not be renumbered, reused, or reassigned, and wording may change under it only while it preserves the cited concern.
Unreleased IDs may be renumbered or overwritten to keep a file's numbering compact; an ID that has appeared in no release may be reassigned, and new items take the next free ID.

### META-13

A spec package shall define a closed set of subjects and their behaviors for a single intent. The shall clause (see [META-6](#meta-6)) of any item shall only involve subjects and behaviors within its own package; where a package leaves an open slot for another party (e.g., "the deployment's media provider"), the slot shall be named abstractly, and its binding shall live in a composition ([META-31](#meta-31)).

### META-14

The precondition and trigger clauses (Where, While, When; see [META-6](#meta-6)) of items may cite another package's External Behavior where the reliance is an intentional, fixed semantic dependency of the package's contract; such citations shall never target a peer's Internal Behavior.
Where the counterparty is selectable, the package shall state an abstract subject instead, bound in a composition ([META-31](#meta-31)).

### META-15

Each spec package shall minimize references to the containing project and stand alone: its `## Intent` section shall be self-contained prose carrying no citations.
Dependencies on other packages shall appear only as item-level precondition citations ([META-14](#meta-14)); bindings of abstract subjects — to another package or to an external service — shall be binding items under `compositions/` ([META-31](#meta-31)), and the decision record that chooses the bound party shall cite those binding items ([META-17](#meta-17)).
A package shall claim no site-wide exclusivity for itself; exclusivity is an installation policy, stated by a binding item ([META-31](#meta-31)).

### META-31

Files under `compositions/` shall describe how multiple spec packages work together.

- Each file shall cover one integrated behavior, scenario, or binding concern and be named after it; file names shall not be concatenations of package names.
- Each file shall follow the item-file conventions: an H1 with a short form ([META-10](#meta-10)), an `## Intent` section ([META-3](#meta-3)), and GEARS items ([META-6](#meta-6)), with sections per [META-34](#meta-34).
- Composition items may take the composed system as their subject, and may bind an open slot one package leaves to a surface another package provides (a binding item). Where no product user observes the seam, a binding item may bind an abstract subject to an external service instead (a supply binding); its tests are inspections of a deployment rather than user journeys. What a controlled stand-in could satisfy is consumed behavior and bindable; what no stand-in could satisfy is a private invariant, and no binding may target it. A replaceable code dependency — a library, a framework — is no seam at all: it gets no binding item, and its selection lives in a decision record.
- A binding item declares its endpoints by clause: its precondition clauses cite the client items — or name the deployment surface — it serves, and its shall clause cites the supplier items or names the service. This is the uniform GEARS reading — preconditions carry an item's givens, the shall clause its provision; a binding's given is the client's stated need. A binding item is static: Where preconditions and a shall clause, never a While or When trigger — a triggered sequence is a scenario item. A binding declares the installed relationship; whether the deployment realizes it is its tests' question. Citations to decision records in either clause are policy references, not endpoints. Supplier-side citations shall be External Behavior — what the supplier offers its users — never another package's internal items. Where no single supplier serves the need, the shall clause may state a rule the installation itself owns — an authorization policy, an exclusivity constraint — citing the External Behavior it depends on as the rule's inputs. Clause placement alone fixes the direction: a provision-side citation reads as the supplier serving the need or, under an installation-owned rule, as the rule's input — both provide, neither consumes. Each slot or abstract subject shall have exactly one effective binding per deployment, unless the client item itself defines aggregation or selection; a slot with no effective binding is an incomplete installation, not a disabled feature.
- Integration and acceptance test items shall live here, each citing ([META-20](#meta-20)) the same-file scenario or binding items it executes plus the package items it directly checks; a scenario test shall cite items from two or more packages. Every binding and scenario item shall be cited by at least one same-file test item.

A binding item reads as one GEARS sentence:

```text
Where <the client's cited need or named deployment surface>, the deployment shall <serve it: cite supplier External Behavior, name the selected service, or state the installation's own rule over cited External inputs>.
```

### META-32

Subdirectories under `packages/` and `compositions/` shall be navigation collections only, with no semantic meaning: no spec, tool, or reader shall infer package relationships, layering, or ownership from directory placement.
A file's identity is its basename and short form ([META-10](#meta-10)); moving a file between collections changes relative citation paths but shall change no item ID, short form, or anchor.

### META-33

Files under `packages/` shall not cite files under `compositions/`.
Composition files cite package items; packages stay ignorant of the compositions built on them, so a package can be moved to another project without dragging scenario context along.

### META-34

Each composition file shall contain only the following `##` sections, in this order:

| Section | Presence | Content |
| ------- | -------- | ------- |
| `## Intent` | required | the concern's purpose ([META-3](#meta-3)) |
| `## Binding` | optional | binding items ([META-31](#meta-31)) |
| `## Scenario` | optional | integrated-behavior items over the composed system |
| `## Tests` | required | test items citing what they verify ([META-20](#meta-20)) |
| `## References` | optional | external sources ([META-19](#meta-19)) |

At least one of `## Binding` and `## Scenario` shall be present.
A file may hold bindings alone; whether its tests are acceptance journeys or deployment inspections follows from its seams' audience ([META-31](#meta-31)), not from the file's section shape.
Where both sections are present, each binding item shall be cited by at least one same-file scenario item whose outcome depends on it — a binding no same-file scenario depends on, or one that serves several files' concerns, shall live in a bindings-only file.
Binding conformance and scenario acceptance may share one test item but need not.
Binding overlays, package-focused indexes, and other projections over these files shall be derived, read-only views — never a second source of truth.
Localized scaffolds translate these section headings; the bundled templates define the active names.

## Citation

### META-16

Citations to specific items shall use relative links with anchors (e.g., `[META-1](meta.md#meta-1)`).

### META-17

DRs and items shall be allowed to cite each other.

### META-18

IRs shall not be cited by any spec except `map.md`.

### META-19

External references in specs shall cite authoritative sources (e.g., official docs) with numbered markers (e.g., `[[1]]`) linked to specific URLs in a `## References` section that shall have no uncited entries.

### META-20

A test item shall cite every behavior item it verifies, inline at the assertion that verifies it: same-file anchors for a package's own Verification items, and `packages/` citations plus same-file scenario or binding anchors for composition test items ([META-31](#meta-31)).
A citation binds its adjacent phrase: cite exactly the behavior that phrase directly relies on, exercises, or checks — never ambient, transitive, or merely invoked behavior.
Spec items shall carry no relationship-metadata lines — `Verifies:`, `Binds:`, `Composes:`, `Clients:`, `Suppliers:`, `Scope:`, or any other line declaring an item relationship; the citations in an item's clauses are the single source of its relationships.
A machine-readable declaration an item itself defines — like the language marker of [META-27](#meta-27) — is item content, not relationship metadata.

## Authoring language

### META-27

Authoring language: en

Where a specs tree declares an authoring language, the specs shall be authored in that language.

The declaration line in this item is the machine-readable scaffold language marker.
It shall use the exact format `Authoring language: <code>`, where `<code>` contains only ASCII letters, digits, and hyphens.

## References

[1]: https://sublang.ai/ref/gears-ai-ready-spec-syntax "GEARS: AI-Ready Spec Syntax"
[2]: https://github.com/npryce/adr-tools "ADR Tools"
