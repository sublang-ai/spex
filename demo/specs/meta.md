<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# META: Spec Definition

## Intent

This spec defines the structure and organization of specifications
(specs) for this project.
Cross-package behavior lives under `compositions/`
([META-31](#meta-31)); the deviations from the current Spex
conventions are listed in the demo [README](../README.md).

## Organization

### META-1

The `specs/` directory shall contain the following subdirectories
and files:

| Path | Content | File Naming |
| --------- | ------- | ------ |
| `decisions/` | Decision records (DRs) | \<NNN\>-\<kebab-case\>.md |
| `iterations/` | Iteration records (IRs) | \<NNN\>-\<kebab-case\>.md |
| `packages/` | spec packages, one item file per package | [\<path\>/]\<kebab-case\>.md |
| `compositions/` | cross-package compositions: scenarios, bindings, and their tests | [\<path\>/]\<kebab-case\>.md |
| `map.md` | spec index for navigation | - |
| `meta.md` | the spec of specs | - |

### META-3

Each item file shall include an `## Intent` section stating its
purpose.

### META-21

Test items shall focus on integration and system testing.

A package's `## Verification` section shall hold test items that
check that package's own claims.
Test items that involve multiple spec packages shall live in
`compositions/` files.

Unit tests shall be part of the implementation and shall not be
specified as spec items.

## Record format

### META-4

Each decision record (DR) shall follow the ADR format [[2]] with
the following sections: Status, Context, Decision, and
Consequences.

### META-5

Each iteration record (IR) shall contain the following sections:
Goal, Deliverables (with checkboxes), Tasks (numbered, each in
one-commit size), and Acceptance criteria.

### META-23

DRs and IRs shall be written in concise language, including only
what is needed to act on or audit the record, with preference for
bullets and tables over prose paragraphs.

### META-24

A DR shall specify design decisions and constraints, not duplicate
implementation logic.
A DR is sufficient when an implementer can generate or audit code
from the design intent, constraints, and tradeoffs.
DRs shall carry no implementation details: a detail that code
generation requires shall be a spec item with its observable
outcome stated ([META-26](#meta-26)); a detail that code
generation does not require shall appear in no spec.

### META-25

In prose paragraphs of DRs and IRs, each sentence shall begin on a
new line for diff readability.
List items and table cells are exempt, since their delimiters
already isolate per-entry changes.
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

Where test cases are expressed by Given-When-Then (GWT), their
spec items shall map GWT to GEARS [[1]]:

| GWT | Clause |
| --- | ------ |
| Given | Where + While |
| When | When |
| Then | shall |

### META-8

Each item shall be self-contained:

- It shall have no implicit dependency on sections other than its
  own subsections.
- Citations to other specs or shared sections shall be explicit.

### META-26

A spec item shall describe behavior as observable outcomes (e.g.,
file state, exit code, printed output, return value, network
call) under named conditions, including any conditions under
which a particular outcome shall not occur.

## Spec packages

### META-9

A spec package shall be a single item file under `packages/`, so
one read covers the whole package.
Packages may be grouped into subdirectories of `packages/` for
navigation convenience ([META-32](#meta-32)).

### META-10

A spec package shall have a basename \<kebab-case\>.md unique
across `specs/packages/` and `specs/compositions/`, with a short
form \<ALLCAPS\> unique across the same set.

The short form is a mnemonic handle, not a derivation: it need
only be unique and stable (e.g., `github-login.md` may use short
form `AUTH`).

### META-28

Each package file shall contain only the following `##` sections,
in this order:

| Section | Presence | Content |
| ------- | -------- | ------- |
| `## Intent` | required | the package's purpose ([META-3](#meta-3)) |
| `## External Behavior` | optional | user-visible behavior: what the system does |
| `## Internal Behavior` | optional | system-facing constraints not exposed to the package's user |
| `## Verification` | optional | test items checking this package's claims ([META-21](#meta-21)) |
| `## References` | optional | external sources ([META-19](#meta-19)) |

At least one of `## External Behavior` and `## Internal Behavior`
shall be present.
Topic subsections (`###`) and item headings (`###` or `####`)
live inside the behavior and Verification sections.

### META-11

Each item shall have an ID unique within `specs/`, following
\<PACK\>-\<N...\> format (e.g., AUTH-11, CAT-3) as a markdown
heading for anchor linking.

Note: \<PACK\> refers to the short form of the containing file's
name.

### META-12

Item IDs shall not be modified once released; new items shall use
higher IDs per package.

### META-13

A spec package shall define a closed set of subjects and their
behaviors for a single intent.
The shall clause (see [META-6](#meta-6)) of any item shall only
involve subjects and behaviors within its own package; where a
package leaves an open slot for another party (e.g., "the
deployment's media provider"), the slot shall be named
abstractly, and its binding shall live in a composition
([META-31](#meta-31)).

### META-14

The precondition and trigger clauses (Where, While, When; see
[META-6](#meta-6)) of items shall be allowed to reference
subjects and behaviors from other spec packages.

### META-15

Each spec package shall minimize references to the containing
project and stand alone: its `## Intent` section shall be
self-contained prose carrying no citations.
Dependencies on other packages shall appear only as item-level
precondition citations ([META-14](#meta-14)); bindings of
abstract subjects — to another package or to an external
service — shall be binding items under `compositions/`
([META-31](#meta-31)), and the decision record that chooses the
bound party shall cite those binding items
([META-17](#meta-17)).

### META-31

Files under `compositions/` shall describe how multiple spec
packages work together.

- Each file shall cover one integrated behavior, scenario, or
  binding concern and be named after it; file names shall not
  be concatenations of package names.
- Each file shall follow the item-file conventions: an H1 with a
  short form ([META-10](#meta-10)), an `## Intent` section
  ([META-3](#meta-3)), and GEARS items ([META-6](#meta-6));
  other sections are free-form.
- Composition items may take the composed system as their
  subject, and may bind an open slot one package leaves to a
  surface another package provides (a binding item).
  Where no product user observes the seam, a binding item may
  bind an abstract subject to an external service instead (a
  supply binding); its tests are inspections of a deployment
  rather than user journeys.
- Integration and acceptance test items that span multiple
  packages shall live here, each carrying a `Verifies:` line
  ([META-20](#meta-20)) citing items from two or more
  packages — for a file whose bindings are all supply bindings,
  from every package whose seams it binds; a test item shall
  also cite the same-file scenario or binding items it
  executes.

### META-34

Each composition file shall contain only the following `##`
sections, in this order:

| Section | Presence | Content |
| ------- | -------- | ------- |
| `## Intent` | required | the concern's purpose ([META-3](#meta-3)) |
| `## Binding` | optional | binding items ([META-31](#meta-31)) |
| `## Scenario` | optional | integrated-behavior items over the composed system |
| `## Tests` | required | test items with `Verifies:` lines ([META-20](#meta-20)) |
| `## References` | optional | external sources ([META-19](#meta-19)) |

At least one of `## Binding` and `## Scenario` shall be
present.
A file may hold bindings alone; whether its tests are
acceptance journeys or deployment inspections follows from its
seams' audience ([META-31](#meta-31)), not from the file's
section shape.

### META-32

Subdirectories under `packages/` and `compositions/` shall be
navigation collections only, with no semantic meaning: no spec,
tool, or reader shall infer package relationships, layering, or
ownership from directory placement.
A file's identity is its basename and short form
([META-10](#meta-10)); moving a file between collections changes
relative citation paths but shall change no item ID, short form,
or anchor.

### META-33

Files under `packages/` shall not cite files under
`compositions/`.
Compositions cite package items; packages stay ignorant of the
compositions built on them, so a package can be moved to another
project without dragging scenario context along.

## Citation

### META-16

Citations to specific items shall use relative links with anchors
(e.g., `[META-1](meta.md#meta-1)`).

### META-17

DRs and items shall be allowed to cite each other.

### META-18

IRs shall not be cited by any spec except `map.md`.

### META-19

External references in specs shall cite authoritative sources
(e.g., official docs) with numbered markers (e.g., `[[1]]`)
linked to specific URLs in a `## References` section that shall
have no uncited entries.

### META-20

Each test item shall include one `Verifies:` metadata line
immediately below its item ID heading.

The `Verifies:` line shall contain one or more comma-separated
[citations](#meta-16) to the behavior items that the test item
verifies: same-file anchors for a package's own Verification
items, and `packages/` citations plus same-file scenario anchors
for composition test items ([META-31](#meta-31)).

## Authoring language

### META-27

Authoring language: en

Where a specs tree declares an authoring language, the specs
shall be authored in that language.

The declaration line in this item is the machine-readable
scaffold language marker.
It shall use the exact format `Authoring language: <code>`, where
`<code>` contains only ASCII letters, digits, and hyphens.

## References

[1]: https://sublang.ai/ref/gears-ai-ready-spec-syntax "GEARS: AI-Ready Spec Syntax"
[2]: https://github.com/npryce/adr-tools "ADR Tools"
