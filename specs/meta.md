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
| `interactions/` | cross-package behaviors, scenarios, and their tests | [\<path\>/]\<kebab-case\>.md |
| `map.md` | spec index for navigation | - |
| `meta.md` | the spec of specs | - |

### META-3

Each item file shall include an `## Intent` section stating its purpose.

### META-21

Test items shall focus on integration and system testing.

A package's `## Verification` section shall hold test items that check that package's own claims.
Test items that involve multiple spec packages shall live in `interactions/` files.

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
Implementation details shall be included only when they are part of the design contract.

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
Related packages may be grouped into subdirectories of `packages/` for navigation convenience.

### META-10

A spec package shall have a basename \<kebab-case\>.md unique across `specs/packages/` and `specs/interactions/`, with a short form \<ALLCAPS\> unique across the same set.

Example: `package-management.md` has short form `PKGMGT`.

### META-28

Each package file shall contain only the following `##` sections, in this order:

| Section | Presence | Content |
| ------- | -------- | ------- |
| `## Intent` | required | the package's purpose ([META-3](#meta-3)) |
| `## External Behavior` | optional | user-visible behavior: what the system does |
| `## Internal Behavior` | optional | implementation requirements: how the system is built |
| `## Verification` | optional | test items checking this package's claims ([META-21](#meta-21)) |
| `## References` | optional | external sources ([META-19](#meta-19)) |

At least one of `## External Behavior` and `## Internal Behavior` shall be present.
Topic subsections (`###`) and item headings (`###` or `####`) live inside the behavior and Verification sections.
Localized scaffolds translate these section headings; the bundled templates define the active names.

### META-11

Each item shall have an ID unique within `specs/`, following \<PACK\>-\<N...\> format (e.g., AUTH-11, URL-3) as a markdown heading for anchor linking.

Note: \<PACK\> refers to the short form of the containing file's name.

### META-12

An item ID and the normative concern it identifies are reserved if they appeared in any prior release.
A reserved ID shall not be renumbered, reused, or reassigned; wording under it may change only compatibly with the published concern.
Before publication, provisional items may be renumbered, replaced, or removed, and an ID absent from every prior release may be reassigned.

### META-13

A spec package shall define a closed set of subjects and their behaviors for a single intent. The shall clause (see [META-6](#meta-6)) of any item shall only involve subjects and behaviors within its own package.

### META-14

The precondition and trigger clauses (Where, While, When; see [META-6](#meta-6)) of items shall be allowed to reference subjects and behaviors from other spec packages.

### META-15

Each spec package shall minimize references to the containing project. When a project-specific reference is essential to a package's intent, it shall be documented in the package's `## Intent` section.

### META-30

Files under `interactions/` shall describe how multiple spec packages work together.

- Each file shall cover one behavior or scenario and be named after it; file names shall not be concatenations of package names.
- Each file shall follow the item-file conventions: an H1 with a short form ([META-10](#meta-10)), an `## Intent` section ([META-3](#meta-3)), and GEARS items ([META-6](#meta-6)); other sections are free-form.
- Integration and acceptance test items that span multiple packages shall live here, each carrying a `Verifies:` line ([META-20](#meta-20)) citing items from two or more packages.

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

Each test item shall include one `Verifies:` metadata line immediately below its item ID heading.

The `Verifies:` line shall contain one or more comma-separated [citations](#meta-16) to the behavior items that the test item verifies: same-file anchors for a package's own Verification items, and `packages/` citations for interaction test items.

## Authoring language

### META-27

Authoring language: en

Where a specs tree declares an authoring language, the specs shall be authored in that language.

The declaration line in this item is the machine-readable scaffold language marker.
It shall use the exact format `Authoring language: <code>`, where `<code>` contains only ASCII letters, digits, and hyphens.

## References

[1]: https://sublang.ai/ref/gears-ai-ready-spec-syntax "GEARS: AI-Ready Spec Syntax"
[2]: https://github.com/npryce/adr-tools "ADR Tools"
