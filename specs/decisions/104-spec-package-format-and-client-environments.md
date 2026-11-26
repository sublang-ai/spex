<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-104: Spec Package Format and Client Environments

## Status

Accepted (2026-10-04); revised (2026-10-06).
Amends [DR-015](015-reference-content.md), [DR-036](036-file-state-store.md), [DR-037](037-playbook-12-adoption.md), [DR-045](045-unified-session-storage.md), [DR-058](058-chat-assisted-playbook-authoring.md), [DR-059](059-issue-delivery-through-dev.md), [DR-081](081-the-app-supplies-the-compiler.md).
Amended by [DR-113](113-a-projects-environment-lives-in-its-working-folder.md), [DR-124](124-skills-reach-every-agent.md), [DR-125](125-your-own-groups-path-sources-live-in-its-clone.md), [DR-151](151-publish-local-spec-packages.md), [DR-152](152-install-a-known-package.md), [DR-161](161-an-applet-is-a-page-the-ide-serves.md), [DR-165](165-one-package-manager-hosted-by-the-cli-and-the-app.md), [DR-172](172-surfaces-a-fresh-user-reads.md), [DR-174](174-what-a-package-provides-is-placed.md), [DR-176](176-global-playbooks-and-a-placed-playbook-runs.md), [DR-241](241-reviewable-builtin-gears.md), [DR-246](246-remove-groups-and-team-servers-from-the-clients.md), [DR-251](251-installs-copy-from-the-store.md).

## Context

- Spex decides the spec package format and the environments; spex.pub, the registry, keeps the dependency declaration it checks [[8]] and its interface [[9]], and takes the format in its own decision record [[11]].
- This record builds on [DR-103](103-the-home-and-its-groups.md), which defines the home's global and project records and the working folders.
- Spex's work forms one pipeline. Source material, such as a description or an intent, becomes a spec in the GEARS form [[meta-6](../meta.md#meta-6)]. A spec becomes skills, playbooks and applets, which are browser-server applications. Each phase is optional.
- The purpose: you install any subset of this, in the language you want, for one project or for yourself, and every clone of a project gets the same tools.
- The Agent Skills specification [[1]] fixes a skill folder's layout. Playbooks and applets have native layouts. The spec package format holds each in its own layout instead of restating it.
- Spex copies four things from package managers: Cargo keeps requests apart from the exact lock [[4]]; a Cargo dependency comes from a registry, a local path or a Git repository [[5]]; npm installs a package with the packages it depends on [[10]]; and pnpm keeps each distinct file once in one store [[6]].

## Decision

- Amends [DR-081](081-the-app-supplies-the-compiler.md) and [DR-058](058-chat-assisted-playbook-authoring.md): registering a compiled playbook becomes requesting its spec package and naming the player for each role; the launcher gets the module's location from Spex at launch instead of from the launcher config. The compile flow stands.
- Amends [DR-036](036-file-state-store.md) and [DR-045](045-unified-session-storage.md): the playbook library folder `playbooks/<id>/` gives way to installed spec packages.
- Amends [DR-015](015-reference-content.md), [DR-037](037-playbook-12-adoption.md) and [DR-059](059-issue-delivery-through-dev.md): the built-in playbooks come from a spec package the app ships, not from Playbook's registry modules and starter.

### Principle

- A spec package is one GEARS contract: the sources it is written from, the spec that states it, and the skills, playbooks and applets made from it. One name, one version.
- An environment is what a project or the home installs: `spex.yaml` says which spec packages it wants, and `spex.lock` records exactly what it got. Every project has one, at the root of its working folder ([DR-113](113-a-projects-environment-lives-in-its-working-folder.md)); what you add for yourself is in the global environment, in the global records repository.
- Spex installs verified files under the environment root's `.spex/` ([DR-165](165-one-package-manager-hosted-by-the-cli-and-the-app.md)) and places what each package provides ([DR-174](174-what-a-package-provides-is-placed.md)): skills where agents read them, specs in a project's `specs/packages/`, and playbooks where Playbook's launcher, the command that runs a session, loads them. Spex commits nothing with the code; the reader commits the environment's files with it.

### A spec package

| Term | Meaning |
| --- | --- |
| Spec package name | `<org>/<pkg>`, both lowercase kebab-case, at most 64 characters |
| Release | The immutable files of one spec package at one version [[2]] |
| Artifact | One thing in a release: a `source`, the `spec`, a `skill`, a `playbook` or an `applet`. A release has at least one artifact and at most one spec |

| Path in a release | Content |
| --- | --- |
| `meta.yaml` | The manifest |
| `README.md`, `LICENSE` | Optional description and license |
| `sources/<language>/<id>/` | Source material: Markdown, entered at `SOURCE.md`, with attachments beside it |
| `specs/<language>/<pkg>.md` | The spec: one spec file in the form of [[meta-30](../meta.md#meta-30)], with its sections, item ids and citations kept whole |
| `skills/<language>/<id>/` | A skill: an Agent Skills folder [[1]] whose `SKILL.md` name is `<id>` |
| `playbooks/<language>/<id>/` | A playbook: a workflow in Playbook's native layout, with the text the compiler reads, its compiled module and what the compiler wrote beside them |
| `applets/<id>/` | An applet: a browser-server application in its native layout ([DR-161](161-an-applet-is-a-page-the-ide-serves.md)) |

- The manifest and the folders name the same artifacts and languages. Every file is under one artifact or is one of the three root files: `meta.yaml`, `README.md` and `LICENSE`.
- Paths are portable: components of at most 255 bytes, no control characters, none of `/ \ : * ? " < > |`, no trailing dot or space, no Windows device name [[3]], unique after NFC and case folding. Links and special files are rejected.
- A release keeps, per file, its path, its bytes and one executable flag. Nothing else.
- A playbook's or an applet's native dependencies stay in its native files. Spex does not replace npm, Cargo or other language tools.

### The manifest

| `meta.yaml` field | Content |
| --- | --- |
| `format` | `2` |
| `org`, `name`, `version` | The identity and the version |
| `description`, `license`, `repository` | A description, the license, and an optional repository URL |
| `provides` | Optional: the artifact kinds the project is offered ([DR-174](174-what-a-package-provides-is-placed.md)) |
| `dependencies` | Optional: `<org>/<pkg>` to a version requirement, for every spec package this one requires |
| `artifacts` | Artifact id to `{kind, language, from, requires, generated-by}` |

- `kind` is one of the five kinds above.
- `language` is the original text's language: a BCP 47 tag [[7]], such as `en` or `zh-Hans`, that names its folder. An applet has none. The artifact's other language folders are its translations.
- `from` is optional: the id of the artifact in this release this one was made from, such as the spec a skill implements or the source a spec was written from. It installs nothing.
- `requires` is optional: the ids of artifacts in this release that must be installed with this one, as the playbook `code` requires `review`.
- `generated-by` is optional: `{agent, model}` of generated content.
- A skill's id is its Agent Skills name. A playbook's id is its Playbook id, and an Agent Skills name as well [[1]], because Spex exports under it a skill that runs the playbook. A skill and a playbook in one release never share an id. A spec's id is `<pkg>`. A source's or an applet's id is its folder name.
- A translated spec keeps the item ids of the original.

### Dependencies

- A dependency names another spec package this one requires, and which versions fit. Installing a spec package installs what it requires, whichever of its artifacts you selected. When a playbook needs an artifact of another spec package, its spec package lists that spec package in `dependencies`; when it needs a sibling in its own spec package, it lists the sibling in `requires`. Either way both are installed.
- Installing supplies no credentials and authorizes nothing to run.
- A citation of another spec package's items is not a dependency; `dependencies` lists only what must be installed.

| Form | Example | Satisfied by |
| --- | --- | --- |
| exact | `1.2.3` | that version only |
| caret | `^1.2.3` | that version up to the next major; for major zero, the next minor; for major and minor zero, the next patch |
| tilde | `~1.2.3` | that version up to the next minor |

- Build metadata is ignored. A prerelease satisfies a version requirement only when the version requirement itself names a prerelease of the same `major.minor.patch`.

### An environment

- An environment resolves from its own `spex.yaml` and `spex.lock` and nothing else.
- A project's environment is committed with its code, so every clone, on every device, installs the same registry and Git content. The global environment follows you to every device you sign in on.
- The Git host controls who reads the code and the records. The registry controls who publishes and downloads. Neither permission grants the other.

| Path, from the environment's root | Content | Committed or synced |
| --- | --- | --- |
| `spex.yaml` | Requests | Yes |
| `spex.lock` | Resolution | Yes, together with `spex.yaml` |
| `.spex/packages/<org>/<pkg>/` | The root files and selected artifacts of one spec package from the registry or Git, at their release paths | No |
| `.spex/skills/<name>/` | One folder per exported skill: an installed skill, its `name` rewritten when aliased, or the skill generated for a playbook; the agents' folders are filled from here | No |

### Requests: `spex.yaml`

| Field | Content |
| --- | --- |
| `format` | `1` |
| `language` | Optional preferred language. Absent means each artifact's original text |
| `space` | Optional: the origin of the environment's Space ([DR-165](165-one-package-manager-hosted-by-the-cli-and-the-app.md)) |
| `registry` | Optional: the package registry's origin ([DR-168](168-independent-package-registry.md)) |
| `packages` | `<org>/<pkg>` to a request |

A request names one source:

| Source | Fields | Meaning |
| --- | --- | --- |
| Registry | `version` | A version requirement, met from the registry |
| Path | `path` | A folder by relative path: in a project, inside its working folder; in the global environment, inside the global records clone ([DR-125](125-your-own-groups-path-sources-live-in-its-clone.md)) |
| Git | `git`, `rev`, optional `path` | A repository the Git host or this device's Git can read, at a branch, tag or commit, with an optional folder inside |

- A request may add `select`, a list of `{artifact, language}`, and `alias`, the id of a skill or playbook to the Agent Skills name [[1]] its skill is exported under.
- A direct request fixes the source of that spec package for everything that requires it. Every other spec package comes from the registry.

### The lock: `spex.lock`

| Field | Content |
| --- | --- |
| `format` | `1` |
| `requests` | A digest of the `spex.yaml` this lock resolved |
| `packages` | `<org>/<pkg>` to a resolution |

- A resolution holds the exact `source`: a registry version and archive checksum; a path with the version, dependencies and `requires` its manifest states; or a repository and commit. It also holds `required-by`, which spec packages required it; `artifacts`, each selected artifact with its chosen language and whether that was a fallback, both shown where environments are listed; `files`, every selected file with its SHA-256 and executable flag; and `exports`, exported names to artifact ids.
- A path source records no files. It is used where it is, as path dependencies are in Cargo [[5]] and npm [[10]]: nothing is copied into `.spex/packages/`, each working folder runs its own files, and a device whose working folder lacks it reports it missing.
- A lock is stale when its `requests` digest no longer matches `spex.yaml`, or a path source's manifest no longer states the version, dependencies and `requires` the lock recorded or no longer holds an artifact the lock selected. A stale lock installs nothing new; the last files stay, and Spex asks you to resolve again. A lock changes only when you change `spex.yaml` or ask Spex to resolve again.

### Resolution

- The dependency graph holds the requested spec packages and everything they require, at any depth. A cycle is allowed and adds nothing.
- A solution gives every spec package one version and every selected artifact one language, so that every version requirement and `select` entry holds. Caret and tilde never pick a version its publisher yanked; an exact version requirement or installing from the lock may. Nothing picks a version the registry's operator suppressed.
- Among solutions Spex takes the highest: it compares the versions of the requested spec packages first, then of the rest, each in name order. A newer release that lacks a selected artifact never blocks an older solution.
- When no solution exists, Spex reports, before anything runs, the version requirements in conflict. Installing from an existing lock takes what the lock says and resolves nothing.

Selection, within a solution:

1. Artifacts: those a request selects, or all of them by default, plus everything any requiring spec package needs, together with everything they require.
2. Languages: for each selected artifact, the language its `select` entry names; else the environment's `language` when the artifact has it; else its original text, recorded as a fallback when another language was wanted.
3. Files: the root files and every file of each selected artifact in its chosen language.
4. Exports: each provided playbook under its id, and one skill for each provided skill and each provided playbook, under the artifact's id or its alias; a provided spec is placed as [DR-174](174-what-a-package-provides-is-placed.md) decides. Two playbooks with one id, or two skills with one name, in one environment are an error.

### Installing

- The store, under the home, is a cache of verified bytes: it keeps each distinct file once, named by its SHA-256, written once after its digest is verified and kept while a lock of an environment the home knows selects it; an install copies each selected file out of it, verified again, as an ordinary file ([DR-251](251-installs-copy-from-the-store.md)). `cache/` holds fetched archives and metadata and may be deleted. Registry credentials live in `local/credentials.yaml`.
- Installing keeps only the selected files. It fetches them by any transport the registry offers [[9]] or from the repository at the locked commit, and stores a file only when its SHA-256 matches the lock's `files`, taken from the registry's file list [[9]] or, for a Git source, at resolution. It re-checks the portable-path rules. It runs no code.
- An environment changes atomically: the new installed files are complete before they replace the old ones.
- An aliased skill is copied with its `name` rewritten, because Agent Skills requires a skill's `name` to match its folder's name [[1]]. Verified files are never changed.

### Exports

- A working folder belongs to one project, so its agent folders hold one environment's exports.
- A project's environment exports its skills into the agent folders of each of its working folders on this device, kept out of Git there, and its playbooks to the launcher for sessions started there.
- The global environment exports its skills into your agents' home folders on each device, so they reach every session you run there.
- For every exported playbook, Spex writes a skill, under the playbook's id or its alias, that runs it in the working folder of the session. That skill names the exact spec package and version it came from.
- An exported skill or playbook is bound to the environment whose lock exported it: it runs that environment's installed files, or, for a path source, the files in the working folder it was exported to, never another environment's copy of the same name and version.
- When a project and the global environment export one skill name, both keep it, one in the project's agent folder and one in your agent's home folder, and the agent chooses between them by its own rule. Spex lists both, saying where each comes from. To use both, rename one with `alias`.
- Spex exports into the folders where each agent reads its skills ([DR-124](124-skills-reach-every-agent.md)). Nothing in a shared file chooses a path on your device.

### Playbooks

- Compiling is authoring. `slc`, the playbook compiler, runs in an authoring session, a session that writes the spec package, in the working folder that holds it, and writes the compiled files beside the playbook's text. The registry never compiles.
- A placed playbook runs wherever its environment reaches; a `playbooks.<id>` entry in the config a session runs with names the player for each role, and a role no entry binds is played by `dev.<role>` ([DR-176](176-global-playbooks-and-a-placed-playbook-runs.md)). Spex hands the launcher each placed playbook's module location at launch and writes no path into a shared file.
- The built-in playbooks are a spec package the app ships. The app seeds its files into the store and requests it once in the global environment when the home is made ([DR-176](176-global-playbooks-and-a-placed-playbook-runs.md)), so the built-in playbooks work offline from the first start. The lock pins its version like any other; an app update changes no environment by itself, except that startup advances the global environment's registry-sourced built-ins to the release the app ships ([DR-241](241-reviewable-builtin-gears.md)).

### Publishing

- A spec package under development is a folder in the release layout, `spex-packages/<org>/<pkg>/` in the environment's root ([DR-165](165-one-package-manager-hosted-by-the-cli-and-the-app.md)). Publishing uploads it as it is, after the same checks the registry makes. It uploads the declared release files only. A working folder may hold any number of spec packages under development.
- The registry checks shape and references only. It never compiles, converts, translates or runs content. Whether a translation says what its original says, and the content of sources, skills, playbooks and applets, are the publisher's.
- To share before publishing, request the spec package by `git` from its repository at a commit, or publish a prerelease to a private namespace at the registry.

### Schema versions

| Schema | Version | Meaning |
| --- | --- | --- |
| Manifest | `format: 2` | This record's format |
| Registry API | `/api/v1` [[9]] | Transport, independent of the format |

- A breaking change raises `format`. A compatible addition is an `x-` prefixed field a reader ignores. A reader refuses a format it does not know.

### Considered and declined

- One merged environment across projects, or a shared one for a team: a resolution nobody authored, and tools that differ by what a member can read.
- Editable spec packages under local UUIDs with committed snapshots: a second identity scheme and copies of bytes. A path source edits in place and a Git source at a commit shares, as in Cargo [[5]].
- The `user`, `dev` and `test` spec folders, and a merged spec tree: retired by [DR-012](012-spec-package-files.md); a spec is one file.
- A `mode` on a dependency, saying whether it is part of this spec's own contract: nothing installs or runs differently, and citations already say what depends on what.
- Dependencies that apply only when the spec text is selected: a playbook's needs do not depend on whether someone also reads the spec.
- A generic word, "variant", for an artifact's languages, forms and implementations: with playbook a kind of its own, only language remains, and the word only confused.
- Shipped wrapper skills, and several implementations of one artifact: a skill that only runs a playbook is generated, and a workflow with two implementations is a playbook and an applet implementing one spec.
- Several versions of one spec package in one environment: one skill name would export twice.
- A separate override table for a dependency's source: a direct request already names its source.
- A `registries` map and a per-request registry: an environment names one registry.
- An `agents` list in a shared file: which agents a device has is the device's fact, and Spex exports to all of them.
- A `spec` field beside `from`: both say what an artifact was made from, and a release has at most one spec.
- A manifest format in the lock: the installed `meta.yaml` carries its own.
- Built-in playbooks outside the format: one more special case, for no gain.
- A suffix Spex adds to a skill name that both the global environment and a project export: the name you type would change with the project open.
- Skill names and playbook ids checked apart: every exported playbook also exports a skill, so one list of skill names holds both.

## Consequences

- The Playbooks surface becomes a view over environments: what each installs, the player for each role, and authoring.
- Acceptance checks: a whole spec file published and installed unchanged; a translation chosen by the environment's language and a fallback recorded; what a playbook requires installed with it, and an unresolvable dependency reported before running; the same lock installed on two devices; a stale lock after changed requests or a changed path-source manifest; a path source missing on a device reported; two working folders of one project each running their own path source; a Git source at a commit; conflicting version requirements named; a generated skill running the exact playbook in the project's working folder; the built-in spec package working offline; a skill and a playbook of one name refused in one environment until one is aliased; compile, request and launch in one flow.
- spex.pub's DR-017 [[11]] retires the `mode` of its DR-013 [[8]] and validates the one-file spec, the language folders, and the playbook and applet kinds.

## References

[1]: https://agentskills.io/specification "Agent Skills specification"
[2]: https://semver.org/spec/v2.0.0.html "Semantic Versioning 2.0.0"
[3]: https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file "Naming Files, Paths, and Namespaces"
[4]: https://doc.rust-lang.org/cargo/guide/cargo-toml-vs-cargo-lock.html "Cargo.toml vs Cargo.lock"
[5]: https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html "Cargo: specifying dependencies from registries, paths and Git repositories"
[6]: https://pnpm.io/motivation "pnpm: Motivation"
[7]: https://www.rfc-editor.org/rfc/rfc5646 "BCP 47: Tags for Identifying Languages (RFC 5646)"
[8]: https://github.com/sublang-ai/spex-pub/blob/main/specs/decisions/013-package-dependencies-compose-include.md "spex.pub DR-013: Package Dependencies with Compose and Include"
[9]: https://github.com/sublang-ai/spex-pub/blob/main/specs/decisions/016-registry-interface-for-format-2.md "spex.pub DR-016: Registry Interface for Format 2"
[10]: https://docs.npmjs.com/cli/v11/commands/npm-install/ "npm install: a package's declared dependencies are installed with it, and a folder is installed in place"
[11]: https://github.com/sublang-ai/spex-pub/blob/main/specs/decisions/017-format-2-releases-at-the-registry.md "spex.pub DR-017: Format 2 Releases at the Registry"
