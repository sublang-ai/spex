<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Codex DR draft: Unified Packages and Environments

## Status

Draft for review, 2026-10-02; design consolidated, not accepted or implemented.
The requested `codex-` filename remains outside `specs/decisions/` until acceptance assigns a numeric DR ID.
This is the package companion to the [spaces and storage draft](codex-dr-spaces-projects-and-storage.md); neither draft silently amends accepted specs.
Scope: package files, selection and environment contracts, local snapshots, and the registry boundary; CLI commands, compiler algorithms, runtime adapters, and backend implementations are out of scope.

## Context

One optional pipeline connects source material, localized GEARS specifications, and runnable applets; a full skill is source material in Agent Skills form, a playbook is an applet, and a wrapper skill invokes an applet.
A package groups related artifacts without requiring every phase or installing every variant.
This consolidates the earlier package, dependency, environment, and registry decisions [[1]] [[2]] [[3]] [[4]] and reconciles them with independently shareable projects and their Home environments.
Authored requests and exact locks serve different purposes, as in Cargo [[5]], while a shared content store avoids duplicating installed bytes, as in pnpm [[6]].
The package format must enclose native standards and remain independent of Git, GitLab, storage projects, and user accounts.

## Decision

### 1. Concepts and ownership

| Concept | Precise definition |
| --- | --- |
| Editable package | Work under a project-local package UUID; may be incomplete, unnamed, and unversioned; includes source and retained derived outputs |
| Package identity | `<org>/<name>`; names a package within a selected registry, not a Spex space, project UUID, or GitLab namespace |
| Release | Immutable complete package tree at one identity and SemVer version; all artifacts share that version; remote identity includes the registry URL |
| Artifact | A named logical `source`, `spec`, `skill`, or `applet`; at least one artifact per release and at most one spec artifact |
| Variant | A selectable directory of one artifact: locale for source/spec, form plus locale for skill, implementation for applet; its derived relative path is its identifier |
| Environment | A directory containing requests in `spex.yaml`, exact resolution in `spex.lock`, and generated `.spex/`; at most one source/version per package identity and one variant per artifact |
| Local snapshot | Immutable selected package files retained with the project, permitting lock replay independently of later source edits or deletion |
| Registry | A release publication and retrieval service; separate from the backend that shares mutable projects |

`org`, `name`, artifact IDs, and implementation names match `[a-z0-9]+(?:-[a-z0-9]+)*`, are at most 64 ASCII characters, and obey the portable-component rules below.
Registry-specific reserved names and namespace ownership are publication policy, not restrictions on unpublished local identities.
A playbook uses `kind: applet` and `impl: playbook`, with the targets it actually supports.
Package UUIDs belong to the enclosing project, never `meta.yaml`; copying into another project may allocate a new local UUID without changing publication identity.
Every artifact, variant, source file, and session inside one storage project shares that project's audience; package selection is not an access-control boundary.

### 2. Complete release layout

The archive has exactly one `<name>/` root; paths below are relative to that root, which is omitted in installed trees and file inventories.

| Path | Exact contents |
| --- | --- |
| `meta.yaml` | Required release manifest |
| `README.md`, `LICENSE` | Optional root description and license text |
| `sources/<locale>/<artifact>/` | `SOURCE.md` entry plus arbitrary attachments; free-form source/intent text |
| `specs/<locale>/` | At least one of `user/<name>.md`, `dev/<name>.md`, `test/<name>.md`; each present group contains exactly that file |
| `skills/<form>/<locale>/<artifact>/` | Native Agent Skills directory with `SKILL.md`; `form` is `full` or `wrapper` [[7]] |
| `applets/<artifact>/<impl>/` | Nonempty native runtime project; code, assets, native manifests and lockfiles stay in their native layout |

The manifest declares exactly the variant roots in a complete release, and every file belongs to one such root or the allowed root files.
An artifact has no duplicate attribute tuple; equivalent BCP 47 tags differing only in case identify the same locale [[8]].
Locale spelling is preserved in paths; matching is case-insensitive and otherwise exact, with no inferred language-region fallback.
Applet code has no package-level locale axis; native applet localization remains inside its implementation.
Required operational files must be inside the selected variant; the only package-managed cross-variant execution edge is the wrapper invocation defined below.
References for provenance or documentation do not silently install their targets.

Every archive entry is a regular file or directory; absolute paths, traversal components, symlinks, hard-link entries, and special files are rejected.
A component is 1–255 UTF-8 bytes, is neither `.` nor `..`, contains no control character or `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`, and ends in neither dot nor space.
Windows reserved device names, including their extension and superscript-digit forms, are forbidden [[9]].
Files and implied directory prefixes are unique after NFC normalization and Unicode case folding, with no file/directory collision.
Each file preserves its relative path, exact bytes, and one boolean executable flag, true when any archive execute bit is set; ownership, timestamps, other permission bits, and empty directories have no package meaning.
These constraints apply equally to publication, local snapshots, installation, and generated export names.

### 3. `meta.yaml`: package format 2

All fields in the following tables are required unless marked optional; fields listed for a kind are forbidden on other kinds.

| Field | Type and meaning |
| --- | --- |
| `format` | Integer `2` |
| `org`, `name` | Identity strings |
| `version` | Full SemVer 2.0.0 string, at most 256 ASCII bytes [[10]] |
| `description`, `license` | Nonempty strings; license identifies the applicable terms |
| `repository` | Optional absolute source-repository URL without embedded credentials; local work need not have a repository |
| `dependencies` | Optional map, null/absent means `{}`; `<org>/<name>` to `{version,mode}` as defined below; nonempty only with a spec artifact |
| `artifacts` | Nonempty map from artifact ID to artifact record |

| Artifact field | Type and meaning |
| --- | --- |
| `kind` | `source`, `spec`, `skill`, or `applet` |
| `locale` | For source/spec/skill: authoritative BCP 47 locale, represented by at least one variant |
| `spec` | Optional ID of this package's spec artifact; allowed on source/skill/applet |
| `from` | Optional list of distinct other artifact IDs in this package; provenance only |
| `variants` | Nonempty ordered list of variant records; declaration order breaks selection ties |

| Variant field | Applies to | Type and meaning |
| --- | --- | --- |
| `locale` | source/spec/skill | BCP 47 tag determining the locale directory |
| `form` | skill | `full` or `wrapper` |
| `invokes` | wrapper only | `<applet-id>#<target>`; referenced applet has at least one variant providing that target |
| `impl` | applet | Implementation name determining its directory |
| `runtime` | applet | Optional nonempty native runtime requirement string, e.g. `python>=3.12`; registry stores it without interpreting it |
| `entrypoints` | applet | Nonempty map of supported targets `cli`, `browser`, `desktop` to `{entry?}`; optional entry is a nonempty runtime-specific string |
| `translated-from` | source/spec/skill | Optional package version identifying the authoritative text translated; forbidden on the authoritative locale |
| `generated-by` | any | Optional `{agent,model}`, both nonempty strings, identifying generation provenance |

A skill artifact ID equals its native `SKILL.md` name; frontmatter name, description, and any native optional fields follow Agent Skills [[7]].
Spex metadata within native `SKILL.md`, if needed, uses its string-valued `metadata` map with `spex-` prefixed keys; `meta.yaml` owns package selection.
A full skill contains standalone instructions; a wrapper contains the call to its declared applet target, addressed by package identity, applet ID, and target through the selected environment, never an export alias.
Full and wrapper forms share artifact-level provenance/spec and can coexist as variants; retain full instructions when generating a wrapper because the inverse transformation is not lossless.
All referenced artifact IDs exist; `spec` and `from` never create installation edges.
Spec translations preserve authoritative item IDs; translation parity and native body/runtime correctness are publisher responsibilities.

### 4. Authored work and package environments

The grouped release format does not replace one-file GEARS authoring under [DR-012](specs/decisions/012-spec-package-files.md) and [[meta-9](specs/meta.md#meta-9)].
Editable roots may contain development files and incomplete stages; packaging explicitly constructs the complete release tree, including any necessary section/citation conversion, before validation.
The registry never infers this conversion or runs package code.
Native development compilation may run before a complete release exists; installation requires a complete validated candidate tree, but local org/name/version metadata requires no registry account or publication.
AI-generated specs/code and other non-reproducible results remain authored project content; only reproducible products belong in the generated build directory.

| Location | Contract |
| --- | --- |
| `~/.spex/projects/<project-id>/` | Managed environment root; the selected personal Home is the user/global environment, every other project resolves independently |
| Any explicitly chosen working root | May hold the same environment files; it is not automatically a mounted/synchronized Spex project |
| `<environment>/spex.yaml`, `spex.lock` | Portable request and resolution files; no implicit dependency on another project's settings |
| `<environment>/packages/<package-id>/` | Editable local package; package UUID canonical lowercase, independent of publication identity |
| `<environment>/package-snapshots/<digest>/` | Portable immutable selected local-package snapshot, schema below |
| `<environment>/.spex/packages/<org>/<name>/` | Verified root files and selected variant files at unchanged package-relative paths |
| `<environment>/.spex/specs/<org>/<name>.yaml` | Generated composed spec index, never replacement spec text |
| `<environment>/.spex/skills/<export>/` | Generated native skill export |
| `<environment>/.spex/bin/<export>` | Generated launcher for an applet's selected CLI target |
| `<environment>/.spex/build/` | Disposable native build products, separated from immutable installed files |
| `~/.spex/store/files/sha256/<digest>[-exec]` | Shared immutable file bytes, key is digest plus executable flag; `-exec` blobs carry executable mode |
| `~/.spex/cache/` | Disposable archives and metadata; no authored files, sole local snapshots, or credentials |
| `~/.spex/local/` | Device bindings and credential-provider data, owned by the spaces/storage draft |

`SPEX_HOME` and platform defaults follow the spaces/storage draft; there is no additional `global/` environment or home-wide registry configuration that affects project resolution.
A project or Home preference may seed a new request file, but does not subsequently override it.
A standalone working root uses the same relative snapshot/package paths; mounting it for backend storage requires the separate project-identity contract.

### 5. `spex.yaml`: request format 2

| Field | Type and default |
| --- | --- |
| `format` | Required integer `2` |
| `registries` | Optional map of registry names to absolute HTTPS base URLs, no userinfo/query/fragment or trailing slash; all references resolve here |
| `locale` | Optional BCP 47 selection preference; absent means use the artifact's authoritative locale |
| `agents` | Optional list of distinct adapter IDs for skill export, default `[]`; no paths or credentials |
| `packages` | Required map from identity to request record, possibly empty |

A request has exactly one source form: registry `{version,registry?}` or local `{local}`.
`version` is a requirement below, `registry` names an entry in `registries` and defaults to `default`, and `local` is the UUID of `packages/<UUID>` in this environment.
Each request may also contain `select`, `alias`, and `agents`, with the following meanings.

| Field | Meaning |
| --- | --- |
| `select` | Optional list with at most one `{artifact,locale?,form?,impl?}` per artifact; absence selects all artifacts, `[]` selects none directly; attributes must apply to that kind |
| `alias` | Optional artifact-ID to export-name map; entries must name selected exportable artifacts; absence uses artifact ID |
| `agents` | Optional adapter list overriding the environment list for this package; `[]` exports to no agents |

The local manifest must match the request key, and its single version must satisfy every incoming requirement.
A direct request fixes its source for that identity throughout the graph; every other identity uses this environment's `default` registry, including dependencies of a local package or a package from a named registry.
A missing required registry mapping is an error, never a public-registry or Home fallback.
A request with `select: []` may explicitly route/constrain a transitive dependency without selecting extra artifacts; dependency-required specs are still added.
One environment cannot select two sources for the same identity; qualified release identity is retained in the lock even though the installed path needs only `<org>/<name>`.
No registry URL, local path, or credential is inherited from a published dependency declaration.

### 6. Dependency and variant resolution

A dependency entry is `{version,mode}`, where mode is `compose` or `include`; self-dependencies are invalid, other cycles are allowed.
Requirements are exact full versions, `^<version>` (at or above the base and below the next major for nonzero major, next minor for zero major/nonzero minor, or next patch for `0.0.x`), and `~<version>` (same major/minor at or above the base).
An exact requirement names the literal release version including build metadata; ranges compare SemVer precedence without build metadata.
A prerelease candidate is eligible only when the requirement's base is a prerelease with the same major/minor/patch.
Caret/tilde requirements admit active releases only; exact requirements and lock replay may admit yanked releases, and new resolution never admits a suppressed release.
When several requirements apply, every one must hold, including its release-state rule.

A valid solution chooses versions and variants together: all root requests, incoming requirements, explicit selections, wrapper target unions, and dependency-required spec artifacts must be satisfiable.
Only a selected spec artifact activates that release's dependencies; each such edge requires the dependency's spec artifact recursively, unioned with any explicit selection.
No extra package appears unless directly requested or reachable through these active edges.
A newer version lacking a requested artifact or viable variant does not preclude an older satisfying solution.
Within a solution, variant selection follows this contract:

1. Filter variants by explicit attributes; an empty candidate set makes the solution invalid.
2. For source/spec/skill choose one candidate, preferring `full` before `wrapper` for skills, then the requested environment locale, then the authoritative locale, then declaration order; explicit attributes always win over preferences.
3. Every selected wrapper selects its applet; for every selected applet, including directly selected ones, collect all wrapper-required targets (possibly none), filter by any explicit `impl`, then select the first declared candidate providing all required targets.
4. Select root files unconditionally and all files under every selected variant; an implicit selection cannot remove or override an explicit one.
5. Export selected skills and CLI applets under artifact IDs or aliases; duplicate names after portable normalization are errors, including across packages and export kinds.

Among valid solutions compare directly requested identities first in lexicographic order, then transitive identities in lexicographic order, preferring higher SemVer precedence and breaking equal-precedence ties by ascending ASCII full-version string.
For comparison across different transitive graphs, compare their union of identities at the first difference and rank any present version above absence; version indexes considered in a resolution are finite snapshots.
Thus an older root release is never preferred merely because it retains an alphabetically earlier dependency.
This is an outcome contract, not a greedy traversal algorithm; failure names the incompatible source/version/selection requirements.
Host runtime availability does not silently choose a different variant; installation can prepare content for another host, while execution separately checks native runtime requirements.

### 7. `spex.lock`: resolution format 2

| Field | Meaning |
| --- | --- |
| `format` | Required integer `2` |
| `requests-sha256` | Required SHA-256 of the JSON-canonicalized parsed `spex.yaml`, excluding ignored extension fields on fixed-field records only; user-keyed map entries remain data, and comments/key order do not affect the digest [[11]] |
| `packages` | Required identity-to-resolution map, including roots and transitive dependencies |

| Resolution field | Meaning |
| --- | --- |
| `registry`, `checksum` | Registry entries only: exact base URL and SHA-256 of the published archive |
| `local`, `snapshot` | Local entries only: package UUID and immutable snapshot-manifest digest; replace both registry fields |
| `version`, `manifest-format` | Exact version string and manifest integer `2` |
| `required-by` | List of all incoming dependency package identities, including for a directly requested package |
| `variants` | Selected variant path to `{artifact,by}`; by is a nonempty list of causes `{kind:request}`, `{kind:dependency,package}`, or `{kind:invocation,variant}` within this package |
| `fallbacks` | Artifact ID to `{preferred,applied}` for environment-locale preferences not chosen; explicit locale constraints never fall back |
| `files` | Selected package-relative path to `{sha256,size,executable}`, including root files; size is byte length |
| `exports` | `{skills,bin}`, each an export-name to artifact-ID map |

Every listed field is required except the mutually exclusive source forms; empty lists/maps represent no entries.
Lock validation checks source identity, request digest, graph requirements, chosen variants, exports, and agreement with the verified `meta.yaml` and selected inventory.
Changed requests require explicit resolution; replay reports a stale lock rather than silently installing obsolete choices.
Replay uses exact locked versions/variants and file attributes without resolving or rereading mutable local source; it needs no fresh registry metadata for integrity.
A registry can deny subsequent retrieval after suppression or access loss; an offline lock cannot attest to current remote availability or grants.
Each environment update publishes one consistent lock and generated view, leaving the previous installation active on failure; transaction mechanics are outside this format.

### 8. Local snapshots, store, and export boundaries

A local snapshot contains `manifest.json` and `files/<package-relative-path>`.
The manifest is `{format:1,files:[{path,sha256,size,executable}]}`, with entries sorted by Unicode code-point path order, serialized as JSON Canonicalization Scheme bytes without a trailing newline [[11]].
Its SHA-256 is the snapshot directory name and the lock's `snapshot`; every listed file exists with matching bytes/size/flag, and no unlisted content exists under `files/`.
Its inventory must equal the corresponding lock entry's selected inventory, including `meta.yaml`; a complete candidate was validated before selection, but a partial snapshot is never falsely checked as a complete release.
Refresh creates a new immutable snapshot and lock; source edits or deletion do not alter installed snapshots.
Snapshots referenced by current project locks remain portable content even when the local store already holds identical bytes; removing an unused snapshot is separate from editing a package.

Shared blobs are accepted only after digest verification, are immutable, and may be materialized by links, clones, or copies without changing their modes.
Editable package roots and mutable runtime/build outputs never share writable store inodes.
Deleting caches/store/generated installations must lose no local-source bytes needed by a lock; missing remote bytes still depend on registry availability and access.
Installation executes no package code and retains only selected files, regardless of whether raw files or a full archive provided them.
Native runtime package installation, builds, and launching are separate operations, not implied by selecting a Spex artifact.

Agent-facing skill exports preserve native files; aliasing copies the skill and changes only frontmatter `name` to match its export directory, leaving verified originals intact.
Export aliases must be valid portable components and, for skills, valid Agent Skills names.
Actual agent destinations are device choices: user scope uses only the selected personal Home; project scope names an explicitly chosen working-directory binding, which need not be the storage mount itself.
For managed projects, `local/bindings.json` records exports as `{projectId,scope,workingDirectoryId?,agents}`, with scope `user` or `project`, a required same-project working-directory ID only for project scope, and distinct adapter IDs.
A binding authorizes destinations; each package exports only to the intersection of its effective requested adapters and the binding's adapters.
A requested adapter with no matching destination remains visibly unbound without invalidating package installation or guessing a path.
A standalone environment takes an explicit local export destination rather than manufacturing a project identity.
Adapters own discovery paths and link/copy mechanics; exports neither overwrite unrelated installations silently nor turn a shared project's settings into permission to execute it.

### 9. Composed spec index format 1

`.spex/specs/<org>/<name>.yaml` contains `{format:1,locale,user,dev,test}`; locale is the selected spec locale and each group is an ordered list of environment-relative verified file paths.
Only packages with a selected spec artifact get an index.
Start with the package's own group files, then consider all packages reachable through activated dependencies, excluding itself.
A reachable package's user file joins `user` if any compose-only path reaches it, otherwise `dev`; its dev file always joins `dev`, and its test file never propagates.
List each file once in its assigned group, dependencies in identity order and user before dev when both enter dev; cycles and diamonds remain finite.
Files stay under `.spex/packages/`, preserving published bytes and internal relative references; the index records composition without merging trees or rewriting citations.

### 10. Registry boundary and storage-backend mapping

The registry owns immutable releases and publication authorization; the spaces backend owns mutable project snapshots and membership.
Neither membership in a Spex space nor a GitLab group implicitly claims a publication namespace, grants registry access, or publishes a package.

| Registry operation | HTTP boundary and required result |
| --- | --- |
| List releases | `GET /api/v1/packages/:org/:name`: identity plus `versions`, each `{version,format,checksum,published_at,yanked,suppressed}`; active means neither yanked nor suppressed |
| Read release | `GET /api/v1/packages/:org/:name/:version`: manifest identity/metadata, `format`, `artifacts`, `dependencies`, distinct text-variant `languages`, archive `checksum`/`size`, timestamp/state, complete `files:[{path,size,sha256,executable}]`, and `dist:{tarball,sha256}` |
| Publish | `PUT` to the release path with the complete gzip tar rooted at `<name>/`; validate format/layout/manifest and reject an existing immutable version or invalid publication authorization |
| Download archive | `GET` release path plus `/download`: exact published archive, matching `checksum` and `dist.sha256` |
| Read file | `GET /:org/:name/:version/<path>`: exact bytes, each path component percent-encoded; attributes/integrity come from release metadata |

The file inventory is authoritative across transports; partial fetch does not require a variant-archive endpoint or completeness state in the store.
Suppression retains metadata but withholds file inventory/download locations and denies file/archive retrieval; yanking preserves exact-version retrieval.
The registry validates shape, paths, required entries, native skill frontmatter, and intra-package references; it does not resolve dependencies, compile, translate, or execute files.
Transport/authentication and quota policies remain registry-owned: the existing spex.pub profile caps archives at 5 MiB compressed, 20 MiB expanded and 900 files, among its other bounds [[12]]; those deployment limits do not define the portable package format.
API `/api/v1` and manifest `format: 2` are independent; no released format-1 package compatibility is required.

| Package-related item/interface | GitLab-backed project storage mapping |
| --- | --- |
| Editable packages and authoring records | Ordinary portable project files under `data/packages/` and `data/authoring/` in the owning storage project's repository; native source repositories remain independent resources |
| Requests, locks, local snapshots | `data/spex.yaml`, `data/spex.lock`, `data/package-snapshots/`; project snapshot/readFile/commit operations transfer bytes and executable flags, with LFS transparent to this contract |
| Installed views, builds, store, credentials, export bindings | No remote mapping; device/generated data excluded from project snapshots |
| Published release and registry operations | No assumed GitLab Package Registry mapping; a separate registry implements the HTTP contract above, independently of project storage |
| Rename, transfer, share, or fork a storage project | No implicit package republish or release identity rewrite; local references are project-relative, and captured snapshots travel with the copied project |

The spaces/storage draft defines the provider-neutral project operations and their GitLab dependencies; package handling requires no additional GitLab group, project, permission, or API.

### 11. Encoding, schema evolution, and scenario checks

Spex-owned YAML is UTF-8 YAML 1.2 restricted to JSON-compatible values, unique string keys, no custom tags, aliases, or nonfinite numbers; manifest and request optional fields do not accept null except where explicitly stated.
New owned text uses LF; native/integrity-bound bytes remain unchanged.
Fixed-field records are closed except ignored optional `x-<namespace>-<name>` extensions; keys of user-keyed maps, such as artifact IDs, are always data rather than extension fields; digests are lowercase SHA-256, file sizes are nonnegative safe integers, and executable is boolean.
Registry names and adapter IDs use the lowercase kebab-case grammar above; lists representing sets have no duplicate entries, and locale-valued comparisons use case-insensitive BCP 47 matching.
Each schema requires its independent version: `meta.yaml: 2`, `spex.yaml: 2`, `spex.lock: 2`, composed index and snapshot manifest: `1`; native standards retain their own versions.
Breaking changes increment only the affected schema, unknown formats fail clearly without rewriting original files, and published versions remain immutable.
The environment number advances from the earlier draft's format 1 to distinguish local-source/snapshot support; it implies no legacy migration implementation.

| Scenario | Required outcome |
| --- | --- |
| Source-only, spec-only, skill-only, or applet-only package | Valid with the relevant native entry/manifest; absent phases create no hidden dependency |
| Full skill replaced by wrapper; multiple wrappers target one applet | One skill export switches form, shared applet resolves the union of targets; no duplicated specs/implementation |
| Preferred locale exists only in the other skill form | Filter explicit constraints, apply form/locale order to real variants, record any locale fallback |
| Newest version lacks requested implementation or dependency spec | Choose a fully satisfiable lower version if available; never fail merely due to greedy version choice |
| Cyclic/diamond spec dependencies; mixed include/compose paths | One version per identity and finite index with compose-only reachability deciding user versus dev |
| Two registries/local source offer the same identity | Environment routing fixes one source; no implicit fallback or mixed-source installation |
| Local edit/deletion, second device, or cleared shared store | Lock replays portable snapshot; incomplete snapshot is an error, not permission to read changed source |
| Project-only recipient cannot read Home | Complete requests/locks/snapshots are in the project; private registry access is separately required for uncached remote releases |
| Identical bytes need different executable flags | Distinct store keys preserve both modes; hard-linked views never chmod the shared inode |
| Partial selection, malformed paths, export alias collision | Validate selected inventory and portable paths, reject collisions without changing the active environment |
| Changed request or unsupported schema | Stale/unsupported error; no silent resolution, migration, or execution |
| Project moved, shared, copied, or stored without Git | Local UUID binding changes only when explicitly copied; package files, snapshots, and release identities remain provider-independent |

## Consequences

One package groups the pipeline, one environment chooses a reproducible subset, and one shared store reuses verified bytes.
Portable local snapshots make unpublished installations reproducible across devices without treating editable sources or shared cache as immutable releases.
Explicit environment routing removes hidden dependencies on Home settings, and grouped release specs remain separate from repository authoring.
Acceptance requires coordinated successor/amendment records for the earlier package/environment contracts and updates to package installation, registry validation, storage, and playbook-library specs; this draft does not implement them.

## References

[1]: https://github.com/sublang-ai/spex-pub/blob/0bba86c/specs/decisions/014-unified-package-format.md "Unified package format, reviewed baseline"
[2]: https://github.com/sublang-ai/spex-pub/blob/0bba86c/specs/decisions/013-package-dependencies-compose-include.md "Compose and include dependencies, reviewed baseline"
[3]: https://github.com/sublang-ai/spex-pub/blob/0bba86c/specs/decisions/015-client-environments-and-store.md "Client environments and shared store, reviewed baseline"
[4]: https://github.com/sublang-ai/spex-pub/blob/0bba86c/specs/decisions/016-registry-interface-for-format-2.md "Registry interface, reviewed baseline"
[5]: https://doc.rust-lang.org/cargo/guide/cargo-toml-vs-cargo-lock.html "Cargo: requests versus exact locks"
[6]: https://pnpm.io/symlinked-node-modules-structure "pnpm: shared content and materialized installations"
[7]: https://agentskills.io/specification "Agent Skills specification"
[8]: https://www.rfc-editor.org/rfc/rfc5646 "BCP 47 language tags"
[9]: https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file "Windows portable filename constraints"
[10]: https://semver.org/spec/v2.0.0.html "Semantic Versioning 2.0.0"
[11]: https://www.rfc-editor.org/rfc/rfc8785 "JSON Canonicalization Scheme"
[12]: https://github.com/sublang-ai/spex-pub/blob/0bba86c/specs/decisions/006-bounded-synchronous-publishing.md "spex.pub publication limits"
