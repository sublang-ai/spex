<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Codex DR draft: Spec Packages and Environments

## Status

Draft revised 2026-10-04; not accepted or implemented.
Read with [Spaces, Projects, and Storage](codex-dr-spaces-projects-and-storage.md).
Implementation requires coordinated spec, registry, and runtime changes; exact schemas follow acceptance.

## Context

Source material, specs, skills, and runnable workflows often describe the same work.
They should share one identity and version, while people choose the parts they need.
A reproducible installation must say where those parts came from and exactly which bytes it uses.

## Decision

### 1. Three concepts

| Concept | Meaning |
| --- | --- |
| Spec package | Artifacts for one shared intent, released together under one identity and version. |
| Artifact | One part of a spec package: source material, a spec, a skill, or an applet. |
| Environment | A project's requested spec packages, its exact locked choices, and their installed files. |

Any artifact may be absent; a spec package has at least one artifact and at most one spec artifact.
An applet is runnable content for a native runtime; a playbook is an applet executed by Playbook.
A skill may contain full instructions or invoke an applet.
Locales and implementations are variants of an artifact, not new spec-package types.

Every project checkout owns one environment, using its current source revision.
A space is a group of projects and has no environment of its own.
A shared tool library is an ordinary project with its own requests and lock.
The same rules apply to personal work, team work, and bundled workflows.

### 2. Keep the spec whole

A spec variant is one Markdown file with Intent, External Behavior, optional Internal Behavior, Verification, and optional References, following [[meta-9](specs/meta.md#meta-9)] and [[meta-30](specs/meta.md#meta-30)].
Publishing preserves those sections, item IDs, and citations together.
There are no `user`, `dev`, or `test` directories and no conversion into those groups.

Relationships between behaviors remain inline citations, as required by [[meta-14](specs/meta.md#meta-14)].
Dependency declarations tell the installer what to retrieve and which versions are compatible.
They do not move another spec's behavior into this spec or turn its verification into this spec's tests.
The old `compose`/`include` materialization rules and grouped spec index are removed.
A reader can follow a citation to the dependency selected by the current lock.

### 3. One release layout

A release is an immutable spec package identified by registry, namespace, name, and version.
Its manifest describes the artifacts and their variants.
For example, one spec package may offer an English and Chinese spec, a skill, and a Playbook applet implementing it.

| Path inside a release | Contents |
| --- | --- |
| `meta.yaml` | Identity, version, description, license, dependencies, and artifact declarations. |
| `README.md`, `LICENSE` | Optional overview and license text. |
| `sources/<locale>/<artifact>/` | Source material, with `SOURCE.md` as its entry. |
| `specs/<locale>/<name>.md` | One complete spec file. |
| `skills/<form>/<locale>/<artifact>/` | An Agent Skills directory with `SKILL.md`; form is `full` or `wrapper` [[1]]. |
| `applets/<artifact>/<implementation>/` | Code, assets, entry points, and native dependency files for that implementation. |

Every file belongs to a declared artifact variant or an allowed root file.
Text artifacts declare an authoritative locale; translations keep spec item IDs.
Applets declare their runtime requirements and supported entry points, such as command line or browser.
Source and generation provenance describe origins without installing other artifacts.

Artifact requirements describe what else is needed: a wrapper's applet, a called workflow, or a cited spec.
A requirement names the target artifact; a target in another spec package also has a declared version constraint.
Follow only the requirements of selected artifacts, repeating until all required artifacts and entry points are present.
These are installation links, distinct from provenance and the behavioral meaning of citations.
Native JavaScript, Python, and other runtime dependencies stay in their native manifests and lockfiles.
Spex does not replace npm, Cargo, or other language tools.

The release builder validates the complete tree and its references before publication.
If publication changes document paths, it preserves citation targets through release-relative links or explicit spec-package references resolved through the lock.
Installation preserves the resulting published bytes.

### 4. Explicit sources, portable sharing

Spex accepts two sources for a spec package:

| Source | Use |
| --- | --- |
| Registry release | Sharing between repositories, including prereleases in a private namespace. |
| Relative directory inside this repository | Developing and trying a spec package before publication. |

A local directory must contain a valid candidate when installed; unfinished authoring can remain outside the installed environment.
Its declared identity and version must match the request and any incoming constraints.
To customize a spec package, obtain a complete editable copy in the project and request that local directory; verified release files stay unchanged.
Sharing that work without publishing means cloning the owning project and using its environment.
Another project's unpublished spec package is not referenced through a local path.

This is a deliberate scope choice for Spex, not a universal restriction of dependency tools.
Cargo and npm support local paths and Git sources; Cargo records the selected Git commit in its lock [[2]] [[3]].
The useful principle is an explicit source and a reproducible selection, not mandatory publication everywhere.
This restriction concerns spec packages only; native applet dependencies follow their own tools.

Each environment declares its registry routes.
Every spec-package identity has one source within that environment; missing routes fail without searching another registry or project.
The Git host controls repository access, and the spec registry controls publication and download access.
Neither permission grants the other.

### 5. Requests, lock, installed files

| File or directory | Purpose |
| --- | --- |
| `spex.yaml` | Requested spec-package sources, version constraints, artifact choices, locale preferences, and export targets. |
| `spex.lock` | Exact sources, versions, selected variants, and file integrity. |
| `.spex/` | Generated installed files, exports, and reproducible builds; ignored by Git. |
| Home's shared store | Verified immutable bytes reused by any environment; it makes no selection decisions. |

Commit requests, lock, and required local source files together on the project's source branch.
The lock records a digest of the parsed request values and each selected file's path, content digest, size, and executable flag, always including `meta.yaml`.
Registry selections also identify the exact release and archive digest; local selections identify their repository-relative directory.
Derived explanations and UI names need not be duplicated in the lock.

Resolve each environment independently, choosing one version per spec-package identity and one variant per selected artifact.
Support exact, caret, and tilde version constraints; prereleases require an explicit prerelease constraint [[2]].
Resolve versions and artifact requirements together, so a newer release missing a required implementation does not hide an older valid choice.
Resolution is deterministic and prefers the highest compatible versions.
Conflicting requirements are reported together, leaving the working installation intact.

Explicit variant choices take precedence.
Otherwise, skills first prefer full instructions; text then prefers the requested locale followed by its authoritative locale.
Declaration order breaks remaining ties, and selected wrappers require compatible applet entry points.
Missing runtimes do not change the lock; execution reports what is unavailable.

Installing a lock checks and restores its selected content without resolving again.
Changed requests or selected local files make the lock stale; Spex offers an update while retaining the last working installation.
Local source history lives in Git, with no separate spec-package UUID or snapshot store.
Replaying an older local selection requires its matching source revision.
A lock records content, not a promise that a remote will remain accessible.

There is no global lock, dependency merge across projects, inherited registry configuration, or launcher configuration assembled from mount order.
A combined skill list is only a view of several independent environments.

### 6. Distinguish skills instead of hiding them

All selected skills remain visible.
The desktop shows the skill name with a quiet source note, for example **Review** with “Acme / Tools · acme/review”.
If that is still ambiguous, it also shows the checkout or version.
Changing the project order changes only the list order.

An invocation identifies the source environment, spec package, and artifact, not just its display name.
A library skill works on the selected project using that project's runtime settings.
Its applets and dependencies still come from the library's locked environment.
Selecting it neither changes the working folder nor merges the two environments.

External agents that require a flat skill directory receive names with a stable distinguishing suffix, such as `review-acme-tools-7c2a`.
The suffix identifies the source, stays within the agent's naming rules, and is checked for collisions.
Spex adapts only a generated export copy when the native skill name must match its directory; verified release files stay unchanged.
No skill silently replaces another, including an installation Spex does not own.
Device-local bindings decide where exports may be written; shared files cannot authorize arbitrary filesystem writes.

### 7. Built-in workflows use the same model

Playbook's maintained workflows become ordinary first-party spec packages containing applets.
They use the same manifest, lock, list, update, enable, and launch rules as other workflows.
“Bundled” describes how their bytes arrive, not another kind of workflow.

Spex ships verified copies of their releases for offline first use and adds explicit default requests when creating an environment.
Existing environments change only through an explicit update.
A lock never means “whatever built-in version this device happens to have”.
The Playbook engine remains the native runtime; it need not be copied into every spec package.

Selecting an applet makes its content available.
Enabling it binds that exact content to the project's commands, players, and role settings.
Spex artifact bindings live in `config/spex.yaml`; players and roles stay in `config/playbook.config.yaml`.
Runtime adapters derive machine-specific module paths at launch, preserving authored settings and comments.
Native runtime validation still applies, including compatibility and command conflicts.
Changed or removed content keeps the saved choices but requires validation before the new content runs.
Unavailable workflows remain listed with the reason.

### 8. Preserve content and separate execution

Validate complete local candidates and releases before selection; check installed files against the lock's selected inventory.
Allow only regular files and directories with portable relative paths; reject traversal, links, special files, and names that collide after Unicode normalization or case folding.
Preserve file bytes and executable flags.
Verify digests before accepting content into the shared store, which distinguishes equal bytes with different executable flags.
Native layouts remain intact, and mutable runtime output goes outside verified files.

For an applet, the flow is **write → compile if needed → install → enable → launch**.
Compilation runs in the authoring project and retains the module and native artifacts needed to run the applet.
Compiling alone does not enable it, and authoring conversations remain project records.
Build a complete new installation before replacing the old one.
Failure leaves the previous installation usable.
Installation neither imports nor executes artifact code; native dependency installation, builds, activation, and launch are separate operations.
Clearing generated files or caches loses no authored work; restoring remote content can still require access.

Publishing includes declared release files only, never project history or authoring conversations.
The registry validates and serves immutable files; it does not compile, translate, resolve dependencies, or run applets.
Its file inventory supports both whole-archive and selected-file downloads with the same integrity checks.
Format changes are explicit and versioned; immutable releases are never reinterpreted.

## Consequences

One spec-package model covers authored, published, and bundled workflows.
One environment model covers every project.
Whole spec files, independent locks, and qualified skill names remove the grouped spec tree, global resolver, shadowing rules, and local snapshot layer.

Acceptance must update the registry's old dependency/materialization contract [[4]] and coordinate its release interface [[5]].
It also requires scoped successor decisions for customization ([DR-000](specs/decisions/000-spec-structure-format.md)), compilation and registration ([DR-005](specs/decisions/005-compilation-integration.md)), library storage ([DR-036](specs/decisions/036-file-state-store.md)), authoring history ([DR-058](specs/decisions/058-chat-assisted-playbook-authoring.md)), and configuration ([DR-080](specs/decisions/080-the-config-directory-is-named-config.md)), plus Playbook's built-in loading.

Acceptance checks must cover a whole spec through publication, identical lock replay on two devices, stale local sources, conflicting requirements, duplicate skill names, offline bundled workflows, and compile → install → enable → launch.

## References

[1]: https://agentskills.io/specification "Agent Skills specification"
[2]: https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html "Cargo dependency sources and version requirements"
[3]: https://docs.npmjs.com/cli/v11/configuring-npm/package-json/ "npm local and Git dependencies"
[4]: https://github.com/sublang-ai/spex-pub/blob/main/specs/decisions/013-package-dependencies-compose-include.md "Registry dependency contract requiring revision"
[5]: https://github.com/sublang-ai/spex-pub/blob/main/specs/decisions/016-registry-interface-for-format-2.md "Registry release and file-integrity interface"
