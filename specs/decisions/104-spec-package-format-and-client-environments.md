<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-104: Spec Package Format and Client Environments

## Status

Accepted (2026-10-04).
Revised the same day, while still being worked on: a playbook is a kind of its own, an applet is a browser-server application, translations replace the earlier variants, an environment is a project or this device, and a spec package's requirements are installed with it.
The spec package format and the environments are Spex's. spex.pub keeps the dependency declaration its registry checks [[8]] and the registry interface [[9]]; the materialization rules and the `mode` its dependency record describes are retired by this record.
It fits [DR-103](103-the-home-and-its-spaces.md): a project's working folder and this device's `~/.spex/global/` are the two environments.
Amends ([DR-046](046-decision-record-evolution.md)):

- [DR-005](005-compilation-integration.md) and [DR-058](058-chat-assisted-playbook-authoring.md): a compiled playbook is registered by requesting its spec package and naming the player for each role, not by writing a locator into the launcher config. The compile flow stands.
- [DR-036](036-file-state-store.md) and [DR-045](045-unified-session-storage.md): the playbook library folder `playbooks/<id>/` gives way to installed spec packages.

## Context

- Spex artifacts form one pipeline. Source material, such as a description or an intent, becomes GEARS specs. GEARS specs become runnable playbooks and applications. Each phase is optional.
- People install any subset of this, in the language they want, for one project or for themselves.
- The Agent Skills specification [[1]] fixes a skill folder's layout. Playbooks and applications have native layouts. The format encloses these standards instead of restating them.
- Mainstream package managers do four things we copy: requests are kept apart from the exact lock [[4]]; a dependency comes from a registry, a local path, or a Git repository at a commit [[5]]; what a package requires is installed with it, because a manager cannot guess undeclared needs [[10]]; one content-addressed store shares bytes between installs [[6]].
- Until now the home held a compiled playbook library and registered a playbook by writing a locator into the launcher config. Both become a request and an installed view.

## Decision

### Principle

- A spec package is one GEARS contract with everything made from it: sources, the spec, skills, playbooks and applets. One name, one version.
- An environment is a folder that says which spec packages it wants, in `spex.yaml`, and records exactly what it got, in `spex.lock`. There are two: a project's working folder, and `~/.spex/global/` for what you add on this device.
- Spex installs verified files into the environment's `.spex/` folder, exports skills to agents, and exports playbooks to the launcher.

### A spec package

| Term | Meaning |
| --- | --- |
| Spec package | `<org>/<pkg>`, both lowercase kebab-case, at most 64 characters |
| Release | The immutable files of one spec package at one version [[2]] |
| Artifact | One thing in a release: a `source`, the `spec`, a `skill`, a `playbook` or an `applet`. A release has at least one artifact and at most one spec |
| Language | Everything but an applet is written in a language and may carry translations, each a folder named by its BCP 47 tag [[7]], such as `en` or `zh-Hans`. One of them is the original text |

| Path in a release | Content |
| --- | --- |
| `meta.yaml` | The manifest |
| `README.md`, `LICENSE` | Optional description and license |
| `sources/<locale>/<id>/` | Source material: Markdown, entered at `SOURCE.md`, with attachments beside it |
| `specs/<locale>/<pkg>.md` | The spec: one spec package file in the form of [[meta-30](../meta.md#meta-30)], with its sections, item ids and citations kept whole |
| `skills/<locale>/<id>/` | A skill: an Agent Skills folder [[1]] whose `SKILL.md` name is `<id>` |
| `playbooks/<locale>/<id>/` | A playbook: a workflow in Playbook's native layout, with its source, its compiled module and their artifacts |
| `applets/<id>/` | An applet: a browser-server application in its native layout |

- The manifest and the folders name the same artifacts and languages. Every file is under one artifact or is a root file.
- Paths are portable: components of at most 255 bytes, no control characters, none of `/ \ : * ? " < > |`, no trailing dot or space, no Windows device name [[3]], unique after NFC and case folding. Links and special files are rejected.
- A release keeps, per file, its path, its bytes and one executable flag. Nothing else.
- A playbook's or an applet's native dependencies stay in its native files. Spex does not replace npm, Cargo or other language tools.

### The manifest

| `meta.yaml` field | Content |
| --- | --- |
| `format` | `2` |
| `org`, `name`, `version` | The identity and the version |
| `description`, `license`, `repository` | A description, the license, and an optional source repository URL |
| `dependencies` | Optional: `<org>/<pkg>` to a version requirement, for every spec package this one requires |
| `artifacts` | Artifact id to `{kind, locale, spec, from, requires, generated-by}` |

- `kind` is `source`, `spec`, `skill`, `playbook` or `applet`.
- `locale` is the language of the original text. An applet has none. The other language folders of the artifact are its translations.
- `spec` and `from` say where an artifact came from: which spec it implements, and what it was derived from. They install nothing.
- `requires` is optional: the ids of artifacts in this release that must be installed with this one, as the built-in `code` requires `review`. Selecting an artifact selects what it requires.
- `generated-by` is optional: `{agent, model}` of generated content.
- A skill's id is its Agent Skills name. A playbook's id is its Playbook id. A source's or an applet's id is its folder name.
- A translated spec keeps the item ids of the original.

### Dependencies

- A dependency names another spec package this one requires, and which versions fit. Installing a spec package installs what it requires, whichever of its artifacts you selected. A playbook that needs one from another spec package says so here; one that needs a sibling in its own spec package says so with `requires`. Either way both are installed.
- A requirement that cannot be met is reported before anything runs. Installing supplies no credentials and authorizes nothing to run.
- A spec cites another spec's items by inline citation, as [[meta-14](../meta.md#meta-14)] requires. The written form of a citation across spec packages is decided with meta.md and the lint, not here.

| Requirement | Example | Satisfied by |
| --- | --- | --- |
| exact | `1.2.3` | that version only |
| caret | `^1.2.3` | that version up to the next major; for major zero, the next minor; for major and minor zero, the next patch |
| tilde | `~1.2.3` | that version up to the next minor |

- Build metadata is ignored. A prerelease satisfies a requirement only when the requirement itself names a prerelease of the same `major.minor.patch`.

### An environment

- An environment resolves from its own `spex.yaml` and `spex.lock` and nothing else. Two devices with the same files install the same thing.
- A project's environment is committed with its code, so every member of the project installs the same thing. This device's environment is yours alone.
- The Git host controls who reads a repository. The registry controls who publishes and downloads. Neither permission grants the other.
- An environment holds one version of a spec package and one language of an artifact.

| Path | Content | Committed |
| --- | --- | --- |
| `spex.yaml` | Requests | Yes, in a project |
| `spex.lock` | Resolution | Yes, in a project, as one sync unit with `spex.yaml` |
| `.spex/packages/<org>/<pkg>/` | The root files and selected artifacts of one release, at their release paths | No |
| `.spex/skills/<name>/` | One folder per exported skill | No |

### Requests: `spex.yaml`

| Field | Content |
| --- | --- |
| `format` | `1` |
| `registries` | Optional names to URLs. `default` is spex.pub unless mapped. A name a request uses and this map lacks is an error |
| `locale` | Optional preferred language. Absent means each artifact's original text |
| `agents` | Optional list of agent adapters that receive skills |
| `packages` | `<org>/<pkg>` to a request |

A request names one source:

| Source | Fields | Meaning |
| --- | --- | --- |
| Registry | `version`, optional `registry` | A requirement, resolved at the named registry or `default` |
| Path | `path` | A folder inside this environment's repository |
| Git | `git`, `rev`, optional `path` | A repository the Git host or the machine's Git can read, at a branch, tag or commit, with an optional folder inside |

- A request may add `select`, a list of `{artifact, locale}`; `alias`, artifact id to exported name; and `agents`, overriding the environment's list.
- A direct request fixes the source of that spec package for the whole graph. Every other spec package comes from `default`.

### The lock: `spex.lock`

| Field | Content |
| --- | --- |
| `format` | `1` |
| `requests` | A digest of the `spex.yaml` this lock resolved |
| `packages` | `<org>/<pkg>` to a resolution |

- A resolution holds the exact `source`: a registry, version and archive checksum; a path; or a repository and commit. It also holds `manifest-format`; `required-by`, who pulled this spec package in; `artifacts`, each selected artifact with its chosen language and whether that was a fallback; `files`, every selected file with its SHA-256 and executable flag; and `exports`, skill names to artifact ids.
- A lock is stale when its `requests` digest no longer matches `spex.yaml`, or a path source's files no longer match. A stale lock installs nothing new; the last view stays, and Spex asks for resolution.
- A lock records content, not a promise that a registry or repository stays reachable.

### Resolution

- The graph holds the requested spec packages and everything they require, at any depth. A cycle adds nothing.
- A solution gives every spec package one version and every selected artifact one language, so that every requirement and selector holds. Caret and tilde reach active versions only. An exact requirement or a lock replay may reach a yanked one. Nothing reaches a suppressed one.
- Among solutions Spex takes the highest, comparing requested spec packages first, each by name and then by version. A newer release that lacks a selected artifact never blocks an older solution.
- No solution is an error that names the requirements in conflict. A lock replay installs what the lock says, without resolving.

Selection, within a solution:

1. Artifacts: those a request selects, or all of them by default, together with everything they require.
2. Languages: for each selected artifact, the language its selector names; else the environment's `locale` when the artifact has it; else its original text, recorded as a fallback when another language was wanted.
3. Files: the root files and every file of each selected artifact in its chosen language.
4. Exports: each selected skill under its artifact id or its alias. Two exports with one name in one environment are an error.

### Installing

- The store at `~/.spex/store/files/sha256/<digest>` and `<digest>-exec` keeps one immutable blob per content and executable flag, written once after its digest is verified, kept while any known lock selects it. `cache/` holds fetched archives and metadata and may be deleted. Registry credentials live in `local/credentials.yaml`.
- Installing keeps only the selected files. It fetches them by any transport the registry offers [[9]], from the path, or from the repository at the locked commit. It stores a file only when its digest matches the manifest or the digest taken at resolution. It re-checks the path rules. It runs no code.
- Installing uses links, clones or copies. An environment changes atomically: the new `.spex/` is complete before it replaces the old one.
- An aliased skill is copied with its `name` rewritten, because Agent Skills requires the name to match the folder. Verified files are never changed.

### Exports

- A project's environment exports to the project: its skills into the project's agent folders, and its playbooks into the sessions started in it.
- This device's environment exports its skills into your agents' home folders.
- Where an agent should be able to start a playbook, Spex writes a skill that runs it. That skill names the exact spec package and version it came from and runs the playbook in the project's folder, with everything the playbook requires.
- An exported skill or playbook is bound to the environment whose lock exported it: it runs that environment's installed files, never another environment's copy of the same name and version.
- When a project and this device export one skill name, each keeps its name in its own folder and the agent's own precedence decides between them. Spex Desktop lists both, saying where each comes from. A person who wants both usable renames one with `alias`.
- Exports go only to the folders the adapter table names. Nothing in a shared file chooses a path on your device. An adapter named in `agents` that this device lacks leaves that export unbound and listed. The adapter table belongs to the CLI.

### Playbooks

- A playbook artifact holds what the launcher loads: the playbook source, the compiled module and their artifacts, in Playbook's native layout. The launcher finds the module by that layout.
- Compiling is authoring. `slc` runs in the project that holds the spec package, in an authoring session, and writes the compiled files beside the source. The registry never compiles. Installing copies verified files.
- A playbook is available wherever its spec package is installed. It is enabled where the project's `config/playbook.config.yaml`, or this device's for a session outside any project, carries a `playbooks.<id>` entry naming which player each role uses. Spex fills that entry's `from` with the installed module's location. A player this device does not have is reported before the session starts.
- The built-in playbooks are a spec package the app ships. The app seeds its files into the store and requests it in this device's environment, and the scaffold requests it in a new project, so it works offline from the first start. The lock pins its version like any other; an app update changes an environment only through an explicit update. Playbook's compiled-in built-ins move into that spec package.

### Applets

- An applet is a browser-server application in its native layout. Spex installs its files; nothing more is decided here.

### Publishing

- A spec package under development is a folder in the release layout, inside a project. Publishing uploads it as it is, after the same checks the registry makes. It uploads the declared release files only, never project history or conversations. A project may hold any number of spec packages.
- The registry checks shape and references only. It never compiles, converts, translates or runs content. Translation parity and the content of sources, skills, playbooks and applets are the publisher's.
- To share before publishing, request the spec package by `git` from its repository at a commit, or publish a prerelease to a private namespace.

### Schema versions

| Schema | Version | Meaning |
| --- | --- | --- |
| Release | `version`, Semantic Versioning | The content, immutable once published |
| Manifest | `format: 2` | This record's format |
| Environment files | `format: 1` each | Requests and lock, versioned on their own |
| Registry API | `/api/v1` [[9]] | Transport, independent of the format |

- A breaking change raises that format number. A compatible addition is an `x-` prefixed field a reader ignores. A reader refuses a format it does not know.

### Considered and declined

- One merged environment across projects, or a shared one for a team: a resolution nobody authored, and tools that differ by what a member can read. A project's environment is in the project, and every member installs the same thing.
- Editable spec packages under local UUIDs with committed snapshots: a second identity scheme and copies of bytes. A Git source at a commit does the job, as in Cargo and npm.
- Spec groups `user`, `dev` and `test`, and a merged spec index: retired long ago; a spec is one file, and citations say what depends on what.
- A `mode` on a dependency, saying whether it is part of this spec's own surface: nothing installs or runs differently, and citations already say what depends on what.
- Dependencies that apply only when the spec text is selected: a playbook's needs do not depend on whether someone also reads the spec.
- A generic word, "variant", for an artifact's languages, forms and implementations: with playbook a kind of its own, only language remains, and the word only confused.
- Shipped wrapper skills, and several implementations of one artifact: a skill that only runs a playbook is generated, and a workflow with two implementations is a playbook and an applet implementing one spec.
- A device-level registry file: two devices would resolve one name differently from one lock.
- Built-in playbooks outside the format: one more special case, for no gain.
- A suffix Spex adds to a skill name that both this device and a project export: the name a person types would change with the project open. The agent's precedence applies, and `alias` renames one for good.

## Consequences

- One name and one version carry sources, the spec, skills, playbooks and applets of one GEARS contract. A user picks any subset by artifact and language, and gets what it requires.
- A project's tools are its own `spex.yaml` and `spex.lock`. Every member installs the same thing. The home's `playbooks/<id>/` library and its registration writes disappear.
- A spec package under development is requested by `path` from the project that holds it, or by `git` from anywhere its repository can be read.
- The Playbooks surface becomes a view over environments: what each installs, enable by naming players for roles, author in a project.
- Spec packages change: `playbook-library` for the surface over environments, enabling by roles and authoring in a project; `storage` for the retired library folder and the store; `settings` for the filled `from` and the missing-player report; and a new package for requests, resolution and installing. They are updated under this record before the code follows.
- Acceptance checks: a whole spec file published and installed unchanged; a translation chosen by the environment's language and a fallback recorded; a playbook's requirement installed with it and a missing one reported before running; the same lock replayed on two devices; a stale lock after changed requests or changed path files; a Git source at a commit; conflicting requirements named; a generated skill running the exact playbook in the project's folder; the built-in spec package working offline; compile, install, enable and launch in one flow.
- spex.pub retires the materialization rules and the `mode` of its dependency record, and validates the one-file spec, the language folders, and the playbook and applet kinds.
- Ask to Playbook: the built-in playbooks become a spec package.

## References

[1]: https://agentskills.io/specification "Agent Skills specification"
[2]: https://semver.org/spec/v2.0.0.html "Semantic Versioning 2.0.0"
[3]: https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file "Naming Files, Paths, and Namespaces"
[4]: https://doc.rust-lang.org/cargo/guide/cargo-toml-vs-cargo-lock.html "Cargo.toml vs Cargo.lock"
[5]: https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html "Cargo: specifying dependencies from registries, paths and Git repositories"
[6]: https://pnpm.io/motivation "pnpm motivation: one content-addressable store"
[7]: https://www.rfc-editor.org/rfc/rfc5646 "BCP 47: Tags for Identifying Languages (RFC 5646)"
[8]: https://github.com/sublang-ai/spex-pub/blob/main/specs/decisions/013-package-dependencies-compose-include.md "spex.pub DR-013: Package Dependencies with Compose and Include"
[9]: https://github.com/sublang-ai/spex-pub/blob/main/specs/decisions/016-registry-interface-for-format-2.md "spex.pub DR-016: Registry Interface for Format 2"
[10]: https://docs.npmjs.com/cli/v11/commands/npm-install/ "npm install: a package's declared dependencies are installed with it"
