<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR (draft): Spec Package Format and Client Environments

## Status

Draft, revised on 2026-10-04 after the owner's review; first draft 2026-10-02.
Not yet numbered; on acceptance it takes the next number under [[meta-22](specs/meta.md#meta-22)].
What the review changed: a spec variant is one file in the form of [[meta-30](specs/meta.md#meta-30)], with no `user`, `dev` or `test` groups and no merged spec index; a spec package comes from a registry, a path or a Git repository, as in mainstream package managers; there is no merged global environment; built-in playbooks are a spec package like any other.
The spec package format and the environments are Spex's. spex.pub keeps the dependency declaration its registry checks [[8]] and the registry interface [[9]]; the materialization rules its dependency record describes in the old group names are retired by this record.
On acceptance it supersedes: the playbook library folder `playbooks/<id>/` of [DR-036](specs/decisions/036-file-state-store.md) and [DR-045](specs/decisions/045-unified-session-storage.md), and registering a compiled playbook by writing its locator into the launcher config under [DR-005](specs/decisions/005-compilation-integration.md) and [DR-058](specs/decisions/058-chat-assisted-playbook-authoring.md).
It fits [the companion draft](claude-home-and-spaces.md): a project's working folder and a space's `spex` repository are the two environments.

## Context

- Spex artifacts form one pipeline. Source material, such as a description or an intent, becomes GEARS specs. GEARS specs become runnable applets, such as playbooks. Each phase is optional. A wrapper skill stands in for a full skill by invoking the applet.
- People install any subset of this, in the language and the implementation they want, for one project or for themselves.
- The Agent Skills specification [[1]] fixes a skill folder's layout. Applets have native layouts. The format encloses these standards instead of restating them.
- Mainstream package managers do three things we copy: requests are kept apart from the exact lock [[4]]; a dependency comes from a registry, a local path, or a Git repository at a commit [[5]]; one content-addressed store shares bytes between installs [[6]].
- Today the home holds a compiled playbook library and registers a playbook by writing a locator into the launcher config. Both become a request and an installed view.

## Decision

### The essence

- A spec package is one GEARS contract with everything made from it: sources, the spec, skills and applets. One name, one version.
- An environment is a folder that says which spec packages it wants, in `spex.yaml`, and records exactly what it got, in `spex.lock`. There are two kinds: a project's working folder and a space's `spex` repository.
- Spex installs verified files into the environment's `.spex/` folder, exports skills to agents, and exports playbooks to the launcher.

### A spec package

| Term | Meaning |
| --- | --- |
| Spec package | `<org>/<pkg>`, both lowercase kebab-case, at most 64 characters |
| Release | The immutable files of one spec package at one version [[2]] |
| Artifact | One thing in a release: a `source`, the `spec`, a `skill` or an `applet`. A release has at least one artifact and at most one spec |
| Variant | One folder of an artifact, chosen by `locale` for text, `form` for a skill, `impl` for an applet. A playbook is an applet variant with `impl: playbook`. A variant's path is its name |

| Path in a release | Content |
| --- | --- |
| `meta.yaml` | The manifest |
| `README.md`, `LICENSE` | Optional description and license |
| `sources/<locale>/<id>/` | A source variant: Markdown, entered at `SOURCE.md`, with attachments beside it |
| `specs/<locale>/<pkg>.md` | A spec variant: one spec package file in the form of [[meta-30](specs/meta.md#meta-30)], with its sections, item ids and citations kept whole |
| `skills/<form>/<locale>/<id>/` | A skill variant: an Agent Skills folder [[1]] whose `SKILL.md` name is `<id>`; `<form>` is `full` or `wrapper` |
| `applets/<id>/<impl>/` | An applet variant: a native project for one implementation |

- The manifest and the folders name the same variants. Every file is under one variant or is a root file.
- Paths are portable: components of at most 255 bytes, no control characters, none of `/ \ : * ? " < > |`, no trailing dot or space, no Windows device name [[3]], unique after NFC and case folding. Links and special files are rejected.
- A release keeps, per file, its path, its bytes and one executable flag. Nothing else.

### The manifest

| `meta.yaml` field | Content |
| --- | --- |
| `format` | `2` |
| `org`, `name`, `version` | The identity and the version |
| `description`, `license`, `repository` | A description, the license, and an optional source repository URL |
| `dependencies` | Optional: `<org>/<pkg>` to `{version, mode}` [[8]] |
| `artifacts` | Artifact id to `{kind, locale, spec, from, variants}` |

- `kind` is `source`, `spec`, `skill` or `applet`.
- `locale` is the authoritative locale of a source, spec or skill. One of its variants carries it.
- `spec` and `from` record provenance: which spec this artifact implements, and what it was derived from. They install nothing.
- `variants` is an ordered list. Each variant carries the fields of its kind and nothing else: `locale` as a BCP 47 tag [[7]] written like its folder; `form` and, for a wrapper, `invokes` as `<applet id>#<target>`; `impl`, an optional `runtime` requirement such as `python>=3.12`, and `entrypoints` from each target `cli`, `browser` or `desktop` to `{entry}`; optional `translated-from`, the version whose text this translation renders; optional `generated-by` as `{agent, model}`.
- A skill's id is its Agent Skills name. A source's or applet's id is its folder name.
- A full skill carries complete instructions. A wrapper only invokes its applet, by spec package and target, through Spex. A spec package that ships a wrapper also ships the full skill, because a wrapper cannot be turned back into one.
- A translated spec keeps the item ids of the authoritative one.

### Dependencies

- A dependency says which spec packages this one builds on and which versions fit. The installer fetches them; it moves no text between specs.
- `mode` says what the dependency is to this spec package's users: `compose` when its External Behavior is part of this one's own surface, `include` when it is an implementation detail. Verification never crosses spec packages.
- A spec cites a dependency's items by inline citation, as [[meta-14](specs/meta.md#meta-14)] requires. The written form of a citation across spec packages is decided with meta.md and the lint, not here.

| Requirement | Example | Satisfied by |
| --- | --- | --- |
| exact | `1.2.3` | that version only |
| caret | `^1.2.3` | that version up to the next major; for major zero, the next minor; for major and minor zero, the next patch |
| tilde | `~1.2.3` | that version up to the next minor |

- Build metadata is ignored. A prerelease satisfies a requirement only when the requirement itself names a prerelease of the same `major.minor.patch`.

### An environment

- An environment resolves from its own `spex.yaml` and `spex.lock` and nothing else. Two devices with the same files install the same thing.
- An environment's audience is its repository's. Installing shares nothing.
- An environment holds one version of a spec package and one variant of an artifact.

| Path | Content | Committed |
| --- | --- | --- |
| `spex.yaml` | Requests | Yes |
| `spex.lock` | Resolution | Yes, as one sync unit with `spex.yaml` |
| `.spex/packages/<org>/<pkg>/` | The root files and selected variants of one release, at their release paths | No |
| `.spex/skills/<name>/`, `.spex/bin/<name>` | One folder per exported skill; one launcher per exported applet with a `cli` target | No |

### Requests: `spex.yaml`

| Field | Content |
| --- | --- |
| `format` | `1` |
| `registries` | Optional names to URLs. `default` is spex.pub unless mapped. A name a request uses and this map lacks is an error |
| `locale` | Optional preferred locale. Absent means each artifact's authoritative locale |
| `agents` | Optional list of agent adapters that receive skills |
| `packages` | `<org>/<pkg>` to a request |

A request names one source:

| Source | Fields | Meaning |
| --- | --- | --- |
| Registry | `version`, optional `registry` | A requirement, resolved at the named registry or `default` |
| Path | `path` | A folder inside this environment's repository |
| Git | `git`, `rev`, optional `path` | A repository the Git host or the machine's Git can read, at a branch, tag or commit, with an optional folder inside |

- A request may add `select`, a list of `{artifact, locale, form, impl}`; `alias`, artifact id to exported name; and `agents`, overriding the environment's list.
- A direct request fixes the source of that spec package for the whole graph. Every other spec package comes from `default`.

### The lock: `spex.lock`

| Field | Content |
| --- | --- |
| `format` | `1` |
| `requests` | A digest of the `spex.yaml` this lock resolved |
| `packages` | `<org>/<pkg>` to a resolution |

- A resolution holds the exact `source`: a registry, version and archive checksum; a path; or a repository and commit. It also holds `manifest-format`; `required-by`, who pulled this spec package in; `variants`, each selected variant path with its reasons; `fallbacks`, each artifact whose preferred locale was unavailable; `files`, every selected file with its SHA-256 and executable flag; and `exports`, skill and launcher names to artifact ids.
- A lock is stale when its `requests` digest no longer matches `spex.yaml`, or a path source's files no longer match. A stale lock installs nothing new; the last view stays, and Spex asks for resolution.

### Resolution

- The graph holds the requested spec packages and, for every selected spec, the spec packages its `dependencies` name. A cycle adds nothing.
- A solution gives every spec package one version and every selected artifact one variant, so that every requirement, selector and wrapper holds. Caret and tilde reach active versions only. An exact requirement or a lock replay may reach a yanked one. Nothing reaches a suppressed one.
- Among solutions Spex takes the highest, comparing requested spec packages first, each by name and then by version. A newer release without a usable variant never blocks an older solution.
- No solution is an error that names the requirements in conflict. A lock replay installs what the lock says, without resolving.
- A variant is chosen by its attributes, never by what runtime this device has. Running checks `runtime` separately.

Selection, within a solution:

1. Variants: among the variants that satisfy the explicit attributes, prefer `full` over `wrapper`, then the environment locale, then the authoritative locale, then declaration order. Record a fallback when the environment locale was wanted but not found.
2. Wrappers: a selected wrapper selects its applet. The first declared applet variant that provides every target the wrappers need is chosen.
3. Files: the root files and every file under a selected variant.
4. Exports: each selected skill and each applet with a `cli` target, under its artifact id or its alias. Two exports with one name in one environment are an error.

### The installed view

- The store at `~/.spex/store/files/sha256/<digest>` and `<digest>-exec` keeps one immutable blob per content and executable flag, written once after its digest is verified, kept while any known lock selects it. `cache/` holds fetched archives and metadata and may be deleted. Registry credentials live in `local/credentials.yaml`.
- Installing keeps only the selected files. It fetches them by any transport the registry offers [[9]], from the path, or from the repository at the locked commit. It stores a file only when its digest matches the manifest or the digest taken at resolution. It re-checks the path rules. It runs no code.
- Materialization uses links, clones or copies. An environment changes atomically: the new `.spex/` is complete before it replaces the old one.
- An aliased skill is copied with its `name` rewritten, because Agent Skills requires the name to match the folder. Verified files are never changed.

### Exports

- A project's environment exports to the project: its skills into the project's agent folders, and its playbooks into the sessions started in it.
- A space's environment exports to the projects in that space: its skills into their agent folders, and its playbooks into their sessions. Your default space also exports its skills into your agents' home folders.
- When a project and its space export one skill name, both are exported. The space's one gets the space's name appended, as in `review-acme`, checked for collisions. Spex Desktop lists both under the same name with a small note saying where each comes from.
- An adapter named in `agents` that this device lacks leaves that export unbound and listed. The adapter table belongs to the CLI.

### Playbooks are applets

- A playbook applet variant holds what the launcher loads: the playbook source, the compiled module and its artifacts, in Playbook's native layout. Its `entry` names the module.
- Compiling is authoring. `slc` runs in the project that holds the spec package, in an authoring session, and writes the compiled files beside the source. The registry never compiles. Installing copies verified files.
- A playbook is available wherever its spec package is installed. It is enabled where a launcher configuration carries a `playbooks.<id>` entry that binds its roles to players. Spex fills that entry's `from` with the installed module's location. An entry with no installed module, or with players the roster lacks, is left out and listed.
- The built-in playbooks are a spec package the app ships. The app seeds its files into the store and requests it in the first-start space, so it works offline. The lock pins its version like any other; an app update changes an environment only through an explicit update. Playbook's compiled-in built-ins move into that spec package.

### Publishing

- A spec package under development is a folder in the release layout, inside a project. Publishing uploads it as it is, after the same checks the registry makes. A project may hold any number of them.
- The registry checks shape and references only. It never compiles, converts, translates or runs content. Translation parity and the content of sources, skills and applets are the publisher's.
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

- One merged global environment built from every mounted space: a resolution nobody authored, conflicts between teams you cannot edit, and a wrapper that might call an applet from another resolution. Each environment now resolves on its own.
- Editable spec packages under local UUIDs with committed snapshots: a second identity scheme and copies of bytes. A Git source at a commit does the job, as in Cargo and npm.
- Spec groups `user`, `dev` and `test`, and a merged spec index: retired long ago; a spec is one file, and citations say what depends on what.
- A device-level registry file: two devices would resolve one name differently from one lock.
- Built-in playbooks outside the format: one more special case, for no gain.
- An error when a project and its space export one skill name: appending the space's name keeps both usable.

## Consequences

- One name and one version carry sources, the spec, skills and applets of one GEARS contract. A user picks any subset by kind, locale, form and implementation.
- A team's toolset is its space's `spex.yaml` and `spex.lock`. Every member installs the same thing. The home's `playbooks/<id>/` library and its registration writes disappear.
- A spec package under development is requested by `path` from the project that holds it, or by `git` from anywhere its repository can be read.
- The Playbooks surface becomes a view over environments: what each installs, enable by binding roles, author in a project.
- spex.pub retires the materialization rules of its dependency record and validates the one-file spec variant.
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
