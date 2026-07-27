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
| `decisions/` | decision records (DRs) | \<NNN\>-\<kebab-case\>.md |
| `intents/` | intent records (IRs) | \<NNN\>-\<kebab-case\>.md |
| `packages/` | spec packages ([META-9](#meta-9)) | [\<path\>/]\<kebab-case\>.md |
| `compositions/` | composition files ([META-31](#meta-31)) | [\<path\>/]\<kebab-case\>.md |
| `map.md` | spec index for navigation | - |
| `meta.md` | the spec of specs | - |

### META-43

A record's ID shall join its kind prefix to its filename's leading number: `DR-<NNN>` under `decisions/`, `IR-<NNN>` under `intents/`.
The leading number shall be unique within each record kind.

### META-3

Each item file — a file holding spec items — shall include an `## Intent` section stating its purpose.

## Record format

### META-4

Each decision record (DR) shall follow the ADR format [[2]], with sections Status, Context, Decision, and Consequences.

### META-5

Each intent record (IR) shall contain sections Goal, Deliverables (with checkboxes), Tasks (numbered, each sized to one commit), and Acceptance criteria.

### META-23

A record shall contain only what is needed to act on it or audit it, preferring bullets and tables to prose.

### META-24

A DR shall record design decisions and constraints, not implementation logic.
A DR is sufficient when an implementer can generate or audit code from it.
An outcome that code must honor shall be a spec item ([META-26](#meta-26)); a technology or architecture choice shall be a recorded decision with its rationale; a detail that is neither shall appear in no spec.

### META-25

In DR and IR prose, each sentence shall begin on a new line.
List items and table cells are exempt.
A sentence may wrap at a fixed column.

### META-37

An intent whose realization spans commits, or must be tracked before completion, shall have an IR; an intent realized in one commit needs none.
An IR shall carry only what is needed to understand the intent and its realization state, citing commits and issues rather than duplicating them.
The Deliverables checkboxes carry that state; realizing commits are found by their `IR-<N>` references, not relisted; an abandoned intent shall be marked abandoned, not deleted.

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

- It shall have no implicit dependency on any section outside its own subsections.
- Every reliance on another spec or on a shared section shall be an explicit citation.

### META-26

A spec item shall state behavior as observable outcomes — file state, exit code, printed output, return value, network call — under named conditions, including any condition under which an outcome shall not occur.

### META-42

Each behavior, binding, scenario, or test item shall have one governing GEARS clause ([META-6](#meta-6)) naming one domain contract: a request, a decision, a state transition, an invariant, an installed relationship, a journey, or a verification run.
The item's attachments — its lists, tables, and code blocks — inherit the clause's normative force and shall elaborate that contract alone, including any format, grammar, or definition the clause names:

| Item kind | Attachments may carry |
| --- | --- |
| Behavior | ordered steps, or the cases and outcomes of one operation, decision, transition, or invariant |
| Binding | the mappings of one installed relationship ([META-36](#meta-36)) |
| Scenario | the stages of one journey or transition, or the cases of one standing rule |
| Test | the assertions of one verification objective: one setup and execution flow, or one explicit case matrix |

A condition inside an attachment is a case label, not a trigger; the one-trigger rule of [META-6](#meta-6) governs the clause alone.
Differing triggers or lifecycles are evidence of two contracts.
An umbrella phrase — "handle correctly", "support behavior" — names no contract.

## Spec packages

### META-9

A spec package shall be one item file ([META-3](#meta-3)) under `packages/`.
Subdirectories of `packages/` group files for navigation only ([META-32](#meta-32)).

### META-10

A spec package shall have a basename \<kebab-case\>.md unique across `specs/packages/` and `specs/compositions/`, and a short form \<ALLCAPS\> unique across the same set.

Example: `package-management.md` has short form `PKGMGT`.

### META-28

Each package file shall contain only the following `##` sections, in this order:

| Section | Presence | Content |
| ------- | -------- | ------- |
| `## Intent` | required | the package's purpose ([META-3](#meta-3)) |
| `## External Behavior` | optional | outcomes and guarantees the package's users may rely on |
| `## Internal Behavior` | optional | consumed requirements and private invariants ([META-35](#meta-35)), hidden from the package's users |
| `## Verification` | optional | test items verifying the package's own items ([META-38](#meta-38)) |
| `## References` | optional | external sources ([META-19](#meta-19)) |

At least one of `## External Behavior` and `## Internal Behavior` shall be present.
A package's user is any human, host, or peer component using its contract; External and Internal are relative to each package; a peer may rely on External Behavior only.
Topic subsections (`###`) and item headings (`###` or `####`) live inside the behavior and Verification sections.
Localized scaffolds translate these section headings; the bundled templates define the active names.

### META-11

Each item shall have an ID unique within `specs/`, in \<PACK\>-\<N...\> format (e.g., AUTH-11, URL-3), as a markdown heading for anchor linking.
\<PACK\> is the short form ([META-10](#meta-10)) of the containing file.

### META-12

An ID that has appeared in a release is reserved, together with the concern it names: it shall not be renumbered, reused, or reassigned, and its wording may change only while that concern is preserved.
An ID that has appeared in no release may be renumbered, reassigned, or overwritten; a new item takes the next free ID.

### META-13

A spec package shall define a closed set of subjects and their behaviors for a single intent.
The shall clause ([META-6](#meta-6)) of a package item shall involve only subjects and behaviors of its own package.
A party the package requires but does not select (e.g., "the deployment's media provider") shall be named abstractly; such a name is a slot, and only a binding item ([META-36](#meta-36)) binds it.

### META-14

A precondition or trigger clause ([META-6](#meta-6)) of a package item may cite another package's External Behavior where the reliance is a fixed semantic dependency of the citing package's contract; no clause of a package item shall cite another package's Internal Behavior.
Where the counterparty is selectable, the item shall name a slot ([META-13](#meta-13)) instead.

### META-15

A spec package shall stand alone, minimizing references to the containing project; its `## Intent` section shall be self-contained prose with no citations.
A package's dependencies on other packages shall appear only as clause citations ([META-14](#meta-14)); a slot's binding shall live under `compositions/` ([META-31](#meta-31)), and the DR that selects the bound party shall cite the binding item ([META-17](#meta-17)).
A package shall claim no exclusivity over the deployment; exclusivity is a deployment rule, stated by a binding item ([META-36](#meta-36)).

### META-32

A subdirectory under `packages/` or `compositions/` is a navigation collection only: no spec, tool, or reader shall infer relationships, layering, or ownership from directory placement.
A file's identity is its basename and short form ([META-10](#meta-10)); moving a file between collections changes relative citation paths and shall change no item ID, short form, or anchor.

### META-33

Files under `packages/` shall not cite files under `compositions/`.

## Compositions

### META-31

Files under `compositions/` shall describe the deployment: the installed system that packages and selected external services compose.
They shall use two item kinds: a binding item declares one installed relationship ([META-36](#meta-36)); a scenario item declares one runtime behavior of the deployment, triggered or standing, and may take the deployment as its subject.
Each composition file shall cover one concern and be named after that concern, not after the packages it involves.

### META-34

Each composition file shall contain only the following `##` sections, in this order:

| Section | Presence | Content |
| ------- | -------- | ------- |
| `## Intent` | required | the concern's purpose ([META-3](#meta-3)) |
| `## Binding` | optional | binding items ([META-36](#meta-36)) |
| `## Scenario` | optional | scenario items ([META-31](#meta-31)) |
| `## Tests` | required | test items citing what they verify ([META-20](#meta-20)) |
| `## References` | optional | external sources ([META-19](#meta-19)) |

At least one of `## Binding` and `## Scenario` shall be present.
Where both are present, each binding item shall be cited by at least one same-file scenario item whose outcome depends on it; a binding no same-file scenario depends on, or one serving several files' concerns, shall live in a bindings-only file.
Overlays, indexes, and other projections over composition files shall be derived, read-only views.
Localized scaffolds translate these section headings; the bundled templates define the active names.

### META-35

Only a declared counterparty is bindable: a slot ([META-13](#meta-13)), or a deployment surface the binding item itself names ([META-36](#meta-36)).
A consumed requirement is an Internal Behavior item stating a supplied meaning together with the package's own acceptance and rejection handling of it.
A private invariant is an Internal Behavior item whose behavior no declared counterparty supplies; it shall not be a binding endpoint, and declaring a counterparty solely to externalize it does not make it consumed.
Replaceability alone creates no slot: a dependency no package item names — a library, a framework — gets no binding item, and its selection lives in a DR.
A slot stays bindable however its party is realized: in-process, in-house, or remote.

### META-36

A binding item shall declare one installed relationship by clause: each precondition clause cites the client need it serves — a slot ([META-13](#meta-13)), a consumed requirement ([META-35](#meta-35)), or a deployment surface the item itself names — and the shall clause states the provision.
The provision shall be one or more mappings, each in one of two forms: resolve the need to a supplier — another package's External Behavior, or a named external service; or state what the deployment itself supplies — a rule over cited External inputs (an authorization policy, an exclusivity constraint), or a concrete installed value (a name, a label).
The item's wording shall make each mapping's form plain.
A provision-side citation shall target External Behavior only; a DR citation in either clause is a policy reference, not an endpoint.
A binding item is static: Where preconditions and a shall clause, never a While or When trigger; a triggered sequence is a scenario item ([META-31](#meta-31)).
A binding item declares; whether the deployment realizes the relationship is the question of its tests ([META-39](#meta-39)).
Each client need shall have exactly one effective binding per deployment, unless its own declaration defines aggregation or selection; a need with no effective binding marks an incomplete deployment, not a disabled feature.

A binding item reads as one GEARS sentence:

```text
Where <the client need>, the deployment shall <resolve it to supplier External Behavior or a named external service, or state the deployment's own rule or value>.
```

## Testing

### META-21

Spec test items shall specify integration and system tests only.
Unit tests belong to the implementation; no spec item shall specify one.

### META-38

A package's `## Verification` section shall hold only test items that verify the package's own items.
Such a test shall execute no other package and no external service; where an item relies on another party — a cited peer ([META-14](#meta-14)) or a slot ([META-13](#meta-13)) — the test itself supplies that party's behavior.
A test that executes another package or an external service is a composition test ([META-39](#meta-39)).

### META-39

A test item that executes more than one package, or a package with an external service, shall live in a composition file.
A composition test shall cite ([META-20](#meta-20)) the same-file binding or scenario items it executes, and the package items it directly checks.
A scenario test shall cite items of two or more packages; a binding test may involve one package and its service.

### META-40

Every binding and scenario item shall be cited by at least one same-file test item.

### META-41

A composition test's grade shall follow visibility: what is observable at the deployment's external boundary shall be tested there, as an acceptance test; what is observable only inside the deployment may be verified by deployment inspection.

## Citation

### META-16

A citation of an item shall be a relative link with an anchor (e.g., `[META-1](meta.md#meta-1)`), written inline at the phrase that relies on it; a reference-style link is not a citation.

### META-17

DRs and items may cite each other.

### META-18

No spec except `map.md` shall cite an IR; naming an IR in prose is a citation.

### META-19

An external reference shall cite an authoritative source (e.g., official docs) by a numbered marker (e.g., `[[1]]`) linked to a specific URL in the `## References` section; that section shall hold no uncited entry.

### META-20

A test item shall cite every behavior item it verifies, inline at the assertion that verifies it: a Verification item cites same-file anchors; a composition test cites `packages/` items plus the same-file binding or scenario anchors ([META-39](#meta-39)).
A citation binds its adjacent phrase: it shall cite exactly the behavior that phrase relies on, exercises, or checks — never ambient, transitive, or merely invoked behavior.
A binding item's precondition may cite a consumed requirement as its client ([META-35](#meta-35)); a scenario or test item may cite Internal Behavior its claim materially needs; neither citation reclassifies or exposes the cited item.
No item shall carry a relationship-metadata line — `Verifies:`, `Binds:`, `Clients:`, or any other line declaring a relationship; the citations in an item's clauses are the single source of its relationships.
A machine-readable declaration an item defines as its own content — like the language marker of [META-27](#meta-27) — is not relationship metadata.

## Authoring language

### META-27

Authoring language: en

Where a specs tree declares an authoring language, the specs shall be authored in that language.
The declaration line in this item is the machine-readable scaffold language marker; it shall use the exact format `Authoring language: <code>`, where `<code>` contains only ASCII letters, digits, and hyphens.

## References

[1]: https://sublang.ai/ref/gears-ai-ready-spec-syntax "GEARS: AI-Ready Spec Syntax"
[2]: https://github.com/npryce/adr-tools "ADR Tools"
