<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR (draft): Spec Package Format and Client Environments

## Status

Draft (2026-10-02), unnumbered until accepted; on acceptance it takes the next number under [[meta-22](specs/meta.md#meta-22)].
Carries into Spex the client side of three spex.pub records, which keep the registry side: the package format of [spex.pub DR-014](https://github.com/sublang-ai/spex-pub/blob/main/specs/decisions/014-unified-package-format.md), the dependency grammar and resolution of [spex.pub DR-013](https://github.com/sublang-ai/spex-pub/blob/main/specs/decisions/013-package-dependencies-compose-include.md), and the environments and store of [spex.pub DR-015](https://github.com/sublang-ai/spex-pub/blob/main/specs/decisions/015-client-environments-and-store.md).
Revises them in three places for the home design of [the companion draft](claude-dr-spaces-projects-and-storage.md): a space is a declared environment, a package may be sourced from a project directory, and the user environment is composed from the spaces a device mounts.
Would supersede, on acceptance: the playbook library directory `playbooks/<id>/` of [DR-036](specs/decisions/036-file-state-store.md) and [DR-045](specs/decisions/045-unified-session-storage.md), and the registration of a compiled playbook by writing its locator into the launcher config under [DR-005](specs/decisions/005-compilation-integration.md) and [DR-058](specs/decisions/058-chat-assisted-playbook-authoring.md); a playbook is an applet of a package, and a registration is a request in an environment.

## Context

- Spex artifacts form one pipeline: source material such as a description or an intent becomes GEARS specs, and GEARS specs become runnable applets, of which a playbook is one kind; each phase is optional, and a wrapper skill can stand in for a full skill by invoking the applet.
- Users install any subset of these artifacts, in the natural language and the implementation of their choice, from one identity and version, for themselves or for one project.
- The Agent Skills specification [[1]] fixes a skill directory's layout and frontmatter, and playbook and applet implementations have native layouts of their own, so the format encloses those standards rather than restating them.
- Established package managers separate requests from the resolved installation [[4]], keep per-project and global installations distinct [[5]], and share immutable file content through one content-addressed store [[6]].
- The companion draft makes a team's shared declarations a space, a repository on a host the team already uses, so a team shares an unpublished package by sharing the project that holds it, and the registry serves publication.
- Today the home holds a compiled playbook library and registers a playbook by writing a locator into the launcher config; under one package format both become requests and a derived view.

## Decision

### Package model

- A package is `<org>/<pkg>` at one Semantic Versioning version [[2]]; `<org>` is a registry namespace and `<pkg>` is unique within it, both lowercase kebab-case of at most 64 characters, and every artifact of a release shares that identity and version.
- A release holds one or more artifacts of kind `source`, `spec`, `skill`, or `applet`, and at most one of kind `spec`.
- An artifact has one or more variants; a variant is one directory selected by its attributes: `locale` for text, `impl` for implementation, and `form` for skills.
- A variant's path is its identifier in metadata, lockfiles, and raw-file URLs.
- A playbook is an applet variant whose `impl` is `playbook`; there is no separate playbook kind.
- Source-phase material stands alone as a `source` artifact of free-form Markdown; a full skill is Source-phase material in the Agent Skills form.

### Layout

| Path | Content | Constraints |
| --- | --- | --- |
| `<pkg>/meta.yaml` | Manifest | Required, exactly one |
| `<pkg>/README.md`, `<pkg>/LICENSE` | Description and license text | Optional |
| `<pkg>/sources/<locale>/<name>/` | One source variant: Markdown with `SOURCE.md` as its entry and attachments beside it | One directory per declared source variant |
| `<pkg>/specs/<locale>/` | One spec variant: `user/`, `dev/`, and `test/` group folders, at least one present, each holding exactly one `<pkg>.md` | One directory per declared spec variant |
| `<pkg>/skills/<form>/<locale>/<name>/` | One skill variant: an Agent Skills directory [[1]] whose `SKILL.md` frontmatter `name` equals `<name>` | One directory per declared skill variant; `<form>` is `full` or `wrapper` |
| `<pkg>/applets/<name>/<impl>/` | One applet variant: a native project for one implementation | One non-empty directory per declared applet variant; contents opaque to the registry |

- The tree and the manifest declare the same set of variants and nothing else; every file lies under exactly one variant root or is a root file above.
- Every entry is a regular file or a directory at a relative path of portable components: a component is non-empty UTF-8 of at most 255 bytes, is neither `.` nor `..`, contains no control character and none of `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, or `|`, ends in neither a dot nor a space, and is not a Windows reserved device name [[3]] with or without an extension.
- After Unicode NFC normalization and case folding, every file path and every implied directory path is unique, and no file path equals a directory path.
- Generated components obey the same rules: `<locale>` is a BCP 47 tag [[7]], `<impl>` and artifact IDs are lowercase kebab-case, and exported names are one portable component.
- A release preserves, per file, its path, bytes, and one executable flag; nothing else.
- Localized text lives in per-locale variant directories; applet code is locale-neutral and localizes itself natively.

### Manifest (`meta.yaml`)

| Field | Content |
| --- | --- |
| `format` | `2`, required |
| `name`, `org` | Package identity |
| `version` | Semantic Versioning version |
| `description`, `license`, `repository` | Human description, license, and source repository URL |
| `dependencies` | Optional map from `<org>/<pkg>` to `{version, mode}`, applied to the spec artifact; never the package itself |
| `artifacts` | Map from artifact ID to artifact record; at least one entry |

| Artifact field | Content |
| --- | --- |
| `kind` | `source`, `spec`, `skill`, or `applet` |
| `locale` | Authoritative locale of a `source`, `spec`, or `skill` artifact, carried by at least one of its variants |
| `spec` | Optional ID of the package's spec artifact this artifact implements or describes |
| `from` | Optional IDs of the artifacts this one was derived from |
| `variants` | List of variant records; at least one |

| Variant field | Applies to | Content |
| --- | --- | --- |
| `locale` | source, spec, skill | BCP 47 tag written exactly as its directory name, such as `en` or `zh-Hans` |
| `form` | skill | `full` or `wrapper` |
| `invokes` | skill wrapper | `<applet-id>#<target>`, a target some variant of that applet provides |
| `impl` | applet | Implementation name, also its directory name, such as `playbook`, `python`, or `typescript` |
| `runtime` | applet | Optional requirement string, such as `python>=3.12` |
| `entrypoints` | applet | Map from each provided target, `cli`, `browser`, or `desktop`, to `{entry}`, with `entry` an optional runtime-specific string |
| `translated-from` | source, spec, skill | Optional package version whose authoritative text this translation renders |
| `generated-by` | any | Optional `{agent, model}` provenance of generated content |

- An artifact ID is lowercase kebab-case and unique within the package; a skill's ID is its Agent Skills `name`, and a source's or applet's ID names its directory.
- Item IDs of a translated spec variant equal those of the authoritative variant.
- A `full` skill carries complete standalone instructions; a `wrapper` skill's instructions consist of invoking its target.
- `spec` and `from` record provenance only; `invokes` is the only installation requirement between artifacts, and every referenced artifact and target exists in the same package.
- A wrapper invokes its applet by package identity and target through the client, never by an exported command name.
- A skill variant is an unmodified Agent Skills directory [[1]]; Spex-specific data inside `SKILL.md` uses the standard `metadata` map with `spex-` prefixed keys, and the manifest stays authoritative.

### Dependencies

| Mode | Materialization, with A depending on B | Choose when |
| --- | --- | --- |
| `compose` | B's user specs into A's user group; B's dev specs into A's dev group | B's user-visible contract is part of A's own |
| `include` | B's user and dev specs, both into A's dev group | B informs A's implementation only |

- B's test specs never materialize into A.
- A dependency keeps its user specs in the user group when some path to it consists of `compose` edges only; one whose every path crosses an `include` edge materializes into dev.

| Requirement | Example | Satisfied by |
| --- | --- | --- |
| exact | `1.2.3` | that version only |
| caret | `^1.2.3` | versions at or above the base below the next major; for major zero the next minor; for major and minor zero the next patch |
| tilde | `~1.2.3` | versions at or above the base with the base's major and minor |

- The base is a full Semantic Versioning version; build metadata is ignored, and a prerelease satisfies a requirement only when the base carries a prerelease with the same `major.minor.patch`.

### Environments

An environment is a directory that declares requests in `spex.yaml`; a resolving environment records their resolution in `spex.lock` and holds a generated `.spex/` view.

| Environment | Where | Declares | Resolves and materializes |
| --- | --- | --- | --- |
| Project | A project's root | Its own requests, committed with the project | `spex.lock` committed with the project; `<project>/.spex/`, machine-local |
| Space | A space's root, per the companion draft | The requests its members share, committed in the space | Nothing: a space's requests are resolved only inside the user environment of each device that composes it |
| User | `~/.spex/global/` | Nothing authored: its `spex.yaml` is generated by the composition below and written by the core alone | `global/spex.lock` and `global/.spex/` |

| Composed field of `global/spex.yaml` | Rule over the composing spaces, in mount order |
| --- | --- |
| `packages` | Every request is kept, so requirements on one package combine as in resolution; `select` lists unite; two spaces giving one package different `alias` or `agents` is an error naming both |
| `registries` | United; one name with two URLs is an error naming both spaces |
| `locale`, `agents` | The first mount that sets the value |

- A request a device cannot resolve because its `path` names a project not bound on that device is reported and contributes nothing.
- The no-solution error names the space each conflicting requirement came from; the remedy is editing a request the person may write, or composing that space no longer.

- The home is `~/.spex` as the companion draft resolves it, `SPEX_HOME` first.
- An environment installs at most one version of a package and at most one variant of an artifact.
- Every environment file carries `format: 1`, and a reader rejects an unsupported `format` clearly.

| Path under a materialized environment | Content | Handling |
| --- | --- | --- |
| `.spex/packages/<org>/<pkg>/` | The root files and selected variants of one release at their package-relative paths | Generated from the store; verified bytes only |
| `.spex/specs/<org>/<pkg>.yaml` | The composed spec index of one package | Generated; derived and never locked |
| `.spex/skills/<exported name>/` | One agent-facing directory per exported skill | Generated; exported to agents |
| `.spex/bin/<exported name>` | One launcher per exported applet `cli` target | Generated |

### `spex.yaml`

| Field | Content |
| --- | --- |
| `format` | `1` |
| `registries` | Optional map from registry name to base URL; a name absent here resolves through `config/registries.yaml`, and `default` applies when a request names none |
| `locale` | Optional preferred locale for every selection; the user environment takes the home's language when absent |
| `agents` | Optional default list of agent adapters that receive exported skills |
| `packages` | Map from `<org>/<pkg>` to a request |

| Request field | Content |
| --- | --- |
| `version` | Version requirement; required unless `path` is given |
| `registry` | Optional registry name |
| `path` | Optional directory holding the package: relative to the environment's root in a project, and `<project id>:<relative path>` in a space, resolved through the device's binding of that project |
| `select` | Optional list of `{artifact, locale, form, impl}` selectors; omitted selects every artifact with default attributes, and an attribute no variant satisfies is an error |
| `alias` | Optional map from artifact ID to the name exported instead, one portable component and for a skill a valid Agent Skills name |
| `agents` | Optional override of the environment `agents` |

- A path-sourced package satisfies requirements on it by its manifest's version and is resolved from the directory's content each time; a path and a version in one request is an error.

### `spex.lock`

| Field | Content |
| --- | --- |
| `format` | `1` |
| `packages` | Map from `<org>/<pkg>` to a resolution |

| Resolution field | Content |
| --- | --- |
| `source` | `{registry, version, checksum}` for a release, the checksum its archive's SHA-256; `{path}` for a path-sourced package, the path as requested |
| `manifest-format` | The manifest `format` |
| `required-by` | Packages whose spec dependencies pulled this package in; empty for a requested package |
| `variants` | Map from selected variant path to `{artifact, by}`, where `by` lists every cause: `request`, a wrapper variant path that invokes it, or a package whose spec dependency needs it |
| `fallbacks` | Map from artifact ID to `{preferred, applied}` locales where the preferred locale was unavailable |
| `files` | Map from package-relative path to `{sha256, executable}` for every selected file, root files included |
| `exports` | `{skills, bin}`, each a map from exported name to artifact ID |

- The lock binds the path, SHA-256, and executable flag of every selected file, so a later installation from the lock verifies without reading registry metadata; a path-sourced package whose files no longer match is re-resolved from its directory.

### Composed spec index

| Field | Content |
| --- | --- |
| `format` | `1` |
| `locale` | Locale of the package's selected spec variant |
| `user`, `dev`, `test` | Lists of environment-relative paths of verified spec files forming each group |

- The index realizes the dependency modes over the packages reachable from the package through spec dependencies, excluding itself: a reachable package's user specs join `user` when some path to it is `compose` edges only and otherwise `dev`, its dev specs always join `dev`, and `test` holds only the package's own files.
- Each file is listed once, after the package's own files, in lexicographic order of `<org>/<pkg>`.
- Files stay at their verified paths under `.spex/packages/`, so composing never merges, copies, or rewrites a file.

### Shared storage under `~/.spex`

| Path | Content | Handling |
| --- | --- | --- |
| `store/files/sha256/<digest>` and `<digest>-exec` | One immutable blob per distinct pair of file content and executable flag | Written once after its digest is verified; retained while any known lock selects it |
| `cache/` | Fetched archives and registry metadata | Disposable |
| `config/registries.yaml` | Named registries and the default | Configuration |
| `local/credentials.yaml` | Registry credentials, beside the host tokens the companion draft places there | Owner-only permissions; never inside an environment, the store, or synced data |

- The file is the unit of storage and integrity: a release may be present partially and grows as selections widen.
- The store holds bytes and installs nothing; only an environment's `spex.lock` states what is installed.

### Resolution

- The requirement graph holds the requested packages and, for every package whose spec artifact is selected, the packages its `dependencies` name, whose spec artifacts are thereby selected.
- A solution assigns one version to every package in the graph so that each requirement on it holds; a caret or tilde requirement reaches an active version only, while an exact requirement or a lock replay also accepts a yanked version and never a suppressed one.
- Among solutions, the resolver produces the one that is highest when packages are compared in lexicographic order of `<org>/<pkg>` and versions by Semantic Versioning precedence.
- No solution is an error naming the requirements that cannot hold together; a dependency cycle adds no requirement and is not an error.
- A lock replay installs the locked versions and variants without resolving anew.
- A team that wants every member on one version pins it with an exact requirement; nothing else makes two devices' resolutions agree across registry changes.

Within the chosen versions, selection proceeds in this order, and any failure leaves the environment untouched:

1. Variants: for each artifact named by a selector, or every artifact by default, the candidates are its variants satisfying every explicit attribute; one is chosen by preference, `full` before `wrapper` for a skill, then the environment `locale`, then the authoritative locale, then declaration order, with a fallback recorded when the environment `locale` was preferred but not chosen; an applet's candidate is chosen in step 2, and a dependency's spec variant follows the same rule.
2. Invocations: every selected wrapper's applet is selected; the targets all selected wrappers require of an applet are collected first, an explicitly selected variant lacking one is an error, and otherwise the first declared variant providing all of them is selected.
3. Files: the selected files are the root files and every file under a selected variant path.
4. Exports: each selected skill exports under its artifact ID, each selected applet variant providing `cli` exports a launcher under its artifact ID, an `alias` replaces either name, and two exports with one name in one environment are an error.

### Rules

- A project resolves entirely from its own lock; the user environment never satisfies a project's requirements.
- Installation retains only the selected files, retrieves them by any transport the registry offers or from the path source, and stores a file only when its SHA-256 matches the manifest's metadata or, for a path source, the digest taken at resolution.
- The installer re-checks the path constraints above and rejects any file that violates them.
- Materialization uses links, clones, or copies at the implementation's choice; an environment changes atomically, the new `.spex/` complete before it replaces the old one.
- Installation executes no package code.
- An aliased skill export copies the directory and rewrites its `name`, because Agent Skills requires the name to match the directory.
- `.spex/skills/<exported name>` is exported into each configured agent's skill discovery directory: the user environment into the agent's home directory, a project environment into the project's agent directory with relative links; the adapter table belongs to the CLI, not to this format.

### Playbooks are applets

- A playbook package's applet variant `applets/<name>/playbook/` holds what the launcher loads: the playbook source and the compiled registry module and its artifacts, in Playbook's native layout.
- Compiling is authoring, not installing: `slc` runs in the project that holds the package, in an authoring session, and writes the compiled files beside the source; the registry never compiles, and installation copies verified files only.
- The launcher's `playbooks.<id>.from` locators are derived: the composed launcher config the core writes at `~/.spex/config/playbook.config.yaml`, per the companion draft, carries one absolute locator per playbook applet selected in the user environment, pointing into `global/.spex/packages/`, beside the entries the composing spaces author; a person registers a playbook by requesting its package in a space or a project, and unregisters it by removing the request.
- The built-in playbooks are a package the app ships and requests by default.

### Schema versioning

| Schema | Version field | Meaning |
| --- | --- | --- |
| Package content | `version`, Semantic Versioning | The package's content and public contracts; immutable once published |
| Manifest | `format: 2` | The package schema of this record |
| Environment files | `format: 1` each | Requests, resolved state, and composed indexes, versioned independently |
| Registry API | `/api/v1` | Transport contract, independent of the package schema |

- A breaking schema change increments that schema's format number; a compatible addition is an `x-` prefixed, namespaced extension field a reader ignores when unknown.

### Duties

- The registry validates format, layout, path constraints, manifest-tree consistency, per-kind entry files, reference integrity, and the Agent Skills `name` and `description` constraints; it never compiles, converts, translates, or executes content.
- The client resolves, verifies, materializes, composes, and exports; it re-checks every constraint the registry checks before it installs from a path source.
- Item-ID parity of translations and the content of `SOURCE.md`, `SKILL.md`, and applets are publisher duties.

## Consequences

- One identity and version carries source material, specs, skills, and applets sharing one GEARS contract, and a user selects any subset by kind, locale, form, and implementation.
- A team's toolset is its space's `spex.yaml`; every member's device composes it with their own requests into one resolution, so the home's `playbooks/<id>/` library and its registration writes disappear.
- A space carries no lock, because nothing replays one: the only resolutions are a project's and a device's.
- A package under development is requested by path from the project that holds it, so a team shares unpublished work by sharing the project, and publishing changes the request's source and nothing else.
- Two spaces pinning different versions of one package surface as an error naming both, never as a silently shadowed install.
- The Playbook library surface becomes a view over environments: browse the packages the composed environment installs, enable or disable by editing a request, and author in a project.
- Windows without symlink privileges falls back to copies without a format change.
- Resolution and materialization are the Spex CLI's; the registry stores and serves.

## References

[1]: https://agentskills.io/specification "Agent Skills specification"
[2]: https://semver.org/spec/v2.0.0.html "Semantic Versioning 2.0.0"
[3]: https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file "Naming Files, Paths, and Namespaces"
[4]: https://doc.rust-lang.org/cargo/guide/cargo-toml-vs-cargo-lock.html "Cargo.toml vs Cargo.lock"
[5]: https://docs.npmjs.com/cli/v11/configuring-npm/folders "npm folders"
[6]: https://pnpm.io/motivation "pnpm motivation: one content-addressable store"
[7]: https://www.rfc-editor.org/rfc/rfc5646 "BCP 47: Tags for Identifying Languages (RFC 5646)"
