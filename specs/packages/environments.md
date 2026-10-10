<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# environments: Spec Packages and Environments

## Intent

This package defines spec packages and the environments that install them under [DR-104](../decisions/104-spec-package-format-and-client-environments.md): the release layout and manifest the core reads and checks, the requests and lock of each spex repository, resolution, installing through the content-addressed store, the exports that put skills where agents read them and playbooks where the launcher loads them, spec packages under development, the built-in spec package the app ships, and the registry and Git sources.
A **spec package** is one GEARS contract with the sources, spec, skills, playbooks and applets made from it, named `<org>/<pkg>`; a **release** is its immutable files at one version; an **artifact** is one `source`, `spec`, `skill`, `playbook` or `applet` of a release.
An **environment** is what a project or a group installs: `spex.yaml` says which spec packages it wants and `spex.lock` records exactly what it got, at the root of a project's working folder or of a group's own spex repository's clone [[environments-26](#environments-26)] [[storage-1](storage.md#storage-1)]; **the registry** is spex.pub.
A **working folder** is where a project's or a group's sessions run, paired with the spex repository whose environment it uses [[storage-6](storage.md#storage-6)].

## External Behavior

### The Format

#### environments-1

When the core reads a release — from the registry, a Git commit, a path inside a working folder, or the app's own built-in spec package — it shall accept it only as a folder in the release layout with a `meta.yaml` manifest of `format: 2`, refusing any other with its reasons ([DR-104](../decisions/104-spec-package-format-and-client-environments.md)):

| Path in a release | Content |
| --- | --- |
| `meta.yaml` | the manifest |
| `README.md`, `LICENSE` | optional description and license |
| `sources/<language>/<id>/` | source material entered at `SOURCE.md`, attachments beside it |
| `specs/<language>/<pkg>.md` | the one spec file, with its sections, item ids and citations kept whole |
| `skills/<language>/<id>/` | an Agent Skills folder [[1]] whose `SKILL.md` name is `<id>` |
| `playbooks/<language>/<id>/` | a playbook in Playbook's native layout: the text the compiler reads, its compiled module and what the compiler wrote beside them |
| `applets/<id>/` | a browser-server application in its native layout |

| `meta.yaml` field | Content |
| --- | --- |
| `format` | `2` |
| `org`, `name`, `version` | lowercase kebab-case names of at most 64 characters, and a Semantic Versioning 2.0.0 version [[2]] |
| `description`, `license`, `repository` | a description, the license, an optional repository URL |
| `dependencies` | optional: `<org>/<pkg>` to a version requirement [[environments-4](#environments-4)] |
| `artifacts` | artifact id to `{kind, language, from, requires, generated-by}` |

- `kind` is one of the five kinds; `language` is a BCP 47 tag [[3]] naming the artifact's original folder, absent for an applet, the artifact's other language folders being its translations; `from` and `requires` name artifact ids of the same release; `generated-by` is an optional `{agent, model}`; an `x-` prefixed field is ignored and any other unknown field refused;
- the manifest and the folders name the same artifacts and languages; every file lies under one artifact or is one of the three root files; a release has at most one spec, whose id is `<pkg>`; a skill's id is its Agent Skills name [[1]], a playbook's id its Playbook id and an Agent Skills name as well, and no skill and playbook share an id; a translated spec keeps the original's item ids;
- a path is portable: components of at most 255 bytes, no control characters, none of `/ \ : * ? " < > |`, no trailing dot or space, no Windows device name [[4]], unique after NFC and case folding; a link or special file is refused;
- a release keeps, per file, its path, its bytes and one executable flag.

### Requests and the Lock

#### environments-26

The core shall keep an environment's `spex.yaml` and `spex.lock` at the root of the working folder for a project, and at the root of the clone for a group's own spex repository [[storage-1](storage.md#storage-1)], writing the two files there and never staging, committing or ignoring them in a working folder's Git ([DR-113](../decisions/113-a-projects-environment-lives-in-its-working-folder.md)):

- a project's environment is committed with its code by the reader, so it follows the code's branches and history, and a working folder cloned with them holds its environment before Spex writes anything;
- while a project's two files are untracked in its working folder — the reader cannot push the code, keeps it clean, or the folder is no repository — the environment is this device's alone, which the listing says [[environments-14](#environments-14)];
- the files as the working folder holds them are the environment whenever the core reads it, so a branch switch, a pull or a hand edit that changed the lock is installed [[environments-7](#environments-7)], and one that changed `spex.yaml` alone leaves the lock stale [[environments-7](#environments-7)];
- a command names an environment by its spex repository's key [[environments-17](#environments-17)], the home pairing that key with one working folder on this device [[storage-2](storage.md#storage-2)].

#### environments-2

The core shall read a spex repository's `spex.yaml` as exactly `{format: 1, language?, packages}` — an optional preferred language, and `<org>/<pkg>` to one request — refusing a `format` it does not know ([DR-104](../decisions/104-spec-package-format-and-client-environments.md)):

| Source | Fields | Meaning |
| --- | --- | --- |
| registry | `version` | a version requirement [[environments-4](#environments-4)], met from the registry |
| path | `path` | a folder inside the working folder, by relative path, used in place |
| Git | `git`, `rev`, optional `path` | a repository the Git host or this device's Git can read, at a branch, tag or commit, with an optional folder inside |

- a request names exactly one source and may add `select`, a list of `{artifact, language}`, and `alias`, the id of a skill or playbook to the Agent Skills name its skill is exported under;
- a direct request fixes the source of that spec package for everything that requires it; every other spec package comes from the registry.

#### environments-3

The core shall write and read a spex repository's `spex.lock` as exactly `{format: 1, requests, packages}` — a SHA-256 digest of the `spex.yaml` it resolved, and `<org>/<pkg>` to one resolution — refusing a `format` it does not know ([DR-104](../decisions/104-spec-package-format-and-client-environments.md)):

| Resolution field | Content |
| --- | --- |
| `source` | the exact source: `{registry, version, checksum}`; `{path, version, dependencies, requires}` as the path's manifest states them; or `{git, commit, path?}` |
| `required-by` | the spec packages that required it, `[]` for a direct request alone |
| `artifacts` | each selected artifact id to `{language, fallback}`: its chosen language and whether that was a fallback |
| `files` | every selected file as `{path, sha256, executable}`; empty for a path source |
| `exports` | exported Agent Skills name to artifact id |

- a lock changes only when `spex.yaml` changes or the reader asks to resolve again; installing from an existing lock resolves nothing.

#### environments-4

When the core matches a version requirement, it shall accept exactly the three forms below and no other, ignoring build metadata and admitting a prerelease only where the requirement itself names a prerelease of the same `major.minor.patch` [[2]]:

| Form | Example | Satisfied by |
| --- | --- | --- |
| exact | `1.2.3` | that version only |
| caret | `^1.2.3` | that version up to the next major; for major zero, the next minor; for major and minor zero, the next patch |
| tilde | `~1.2.3` | that version up to the next minor |

### Resolution

#### environments-5

When a client sends `environment.resolve` for a spex repository, or its `spex.yaml` has no lock, the core shall resolve the requested spec packages and everything they require at any depth into one solution — every spec package at one version and every selected artifact in one language, so that every version requirement and `select` entry holds — and write the lock [[environments-3](#environments-3)] ([DR-104](../decisions/104-spec-package-format-and-client-environments.md)):

- a cycle in the dependency graph is allowed and adds nothing;
- caret and tilde never pick a version its publisher yanked; an exact requirement, or installing from the lock, may; nothing picks a version the registry's operator suppressed;
- among solutions the core takes the highest, comparing the requested spec packages' versions first, then the rest, each in name order; a newer release lacking a selected artifact never blocks an older solution;
- a path source resolves to the manifest in the working folder, a Git source to the named commit's manifest, with their dependencies from the registry;
- when no solution exists, the core replies `invalid_request` naming the version requirements in conflict, before anything is installed or run.

#### environments-6

When a solution stands, the core shall select, within it, in this order ([DR-104](../decisions/104-spec-package-format-and-client-environments.md)):

1. artifacts: those a request selects, or all of them by default, plus everything any requiring spec package needs, together with everything they `requires`;
2. languages: for each selected artifact, the language its `select` entry names; else the environment's `language` when the artifact has it; else its original text, recorded as a fallback when another language was wanted;
3. files: the root files and every file of each selected artifact in its chosen language;
4. exports: each selected playbook under its id, and one skill for each selected skill and each selected playbook, under the artifact's id or its alias.

- two playbooks with one id, or two exported skill names alike, in one environment are refused naming both, until one is aliased.

### Installing

#### environments-7

When a client sends `environment.install` for a spex repository, or a sync or resolve changed its lock, the core shall install the lock's selected files under `<clone>/packages/<org>/<pkg>/` at their release paths through the store under the home, atomically ([DR-104](../decisions/104-spec-package-format-and-client-environments.md)):

- the store keeps each distinct file once under `store/<sha256>`, written once after its digest is verified, with an executable copy apart under `store/x/<sha256>`, and keeps a file while a lock in a spex repository on this device selects it; `cache/` holds fetched archives and metadata and may be deleted at any time;
- a file is fetched by any transport the registry offers — the release archive, or raw files — or from the Git source at the locked commit, and stored only when its SHA-256 matches the lock's `files`; the portable-path rules [[environments-1](#environments-1)] are re-checked; no code runs;
- a path source copies nothing: its files are used where they are, in the working folder, each working folder running its own; a device whose working folder lacks the path reports it missing, and the environment stays otherwise installed;
- the new installed files are complete before they replace the old ones; an install that fails leaves the last files in place and reports its cause;
- a stale lock — its `requests` digest no longer matching `spex.yaml`, or a path source's manifest no longer stating the version, dependencies and `requires` the lock recorded, or lacking an artifact the lock selected — installs nothing new: the last files stay, and the core reports that resolving again is needed.

### Exports

#### environments-8

When an environment is installed or its lock applied by a sync, the core shall export its skills and playbooks, so that every member of a project gets the same tools ([DR-104](../decisions/104-spec-package-format-and-client-environments.md)):

| Export | Where |
| --- | --- |
| each selected skill, copied with its `name` rewritten where aliased [[1]] | `<clone>/skills/<name>/`, then into the agent folders of each working folder paired with the spex repository, listed in that folder's `.git/info/exclude` so Git ignores them |
| a generated skill per selected playbook, under the playbook's id or alias, that runs the playbook in the working folder of the session and names the exact spec package and version it came from | the same places |
| your own group's skills | your agents' home folders on this device as well, so they reach every session run here |

- the agent folders are, per agent this device has, the folders where that agent reads project-level and user-level skills, as the core's agent table states until Cligent says them [[environments-16](#environments-16)];
- an exported skill or playbook is bound to the environment whose lock exported it: it runs that environment's installed files, or a path source's files in the working folder it was exported to, never another environment's copy of the same name;
- when a project and your own group export one skill name, both keep it, one in the project's agent folder and one in the agent's home folder, and the Playbooks surface lists both saying where each comes from [[playbook-library-1](playbook-library.md#playbook-library-1)];
- an export leaves nothing it did not write: a folder the agent table names holds only the exported skills of that environment beside what the reader put there.

#### environments-9

When a session starts in a working folder, the core shall hand the launcher the module location of each playbook its composed configuration enables [[core-service-2](core-service.md#core-service-2)] — the installed playbook artifact's module in the project's environment, else your own group's, else, for a path source, the module in the working folder — and shall write no path into a shared file ([DR-104](../decisions/104-spec-package-format-and-client-environments.md)):

- a playbook the configuration enables and no environment of the session exports is a config error naming the playbook and the spex repository whose environment lacks it;
- a playbook available in an environment but enabled in no configuration is listed and not launched.

### Authoring and Publishing

#### environments-10

When an authoring session [[storage-23](storage.md#storage-23)] writes a spec package under development, the core shall keep it as a folder in the release layout inside the working folder, compile its playbooks there with the compiler in the playbook's artifact folder [[playbook-library-57](playbook-library.md#playbook-library-57)], and offer to request it from the project's environment by `path` and to publish it ([DR-104](../decisions/104-spec-package-format-and-client-environments.md)):

- publishing uploads the declared release files only, after the same checks the core makes on a release [[environments-1](#environments-1)], to the registry as the signed-in account [[environments-12](#environments-12)];
- to share before publishing, the folder is requested by `git` at a commit, or published as a prerelease to a private namespace at the registry;
- a working folder may hold any number of spec packages under development.

### The Built-In Spec Package

#### environments-11

When the core starts, it shall seed the app's built-in spec package — the playbooks Playbook ships, as one spec package named `sublang/playbooks` at Playbook's version, each playbook an artifact in `en` with `code` and `decide` requiring `review` — into the store, and shall request it with a caret requirement in your own group's environment where that environment lacks it, and in a new project's environment when it makes the spex repository [[storage-6](storage.md#storage-6)], so the built-in playbooks work offline from the first start ([DR-104](../decisions/104-spec-package-format-and-client-environments.md)):

- the lock pins its version like any other, so an app update never changes an environment by itself: the newer release is seeded beside the older, which the store keeps while a lock selects it;
- the seeded artifacts carry the playbook text and the module as the app's Playbook ships them, the module's engine resolved through the engine links provisioned in each installed playbook artifact's folder as a compile provisions them [[playbook-library-8](playbook-library.md#playbook-library-8)].

### Sources

#### environments-12

When the core resolves or installs from the registry, it shall read the registry's version index for every spec package of the graph, read a version resource only for each version it picks, fetch files by the raw-file URLs or the release archive, and present the device's app token where the home is signed in — the access secret kept current before each call [[git-host-4](git-host.md#git-host-4)], an answer that it expired reported as a failure of that operation — so a private namespace the account may read installs and a public one needs no credential ([DR-104](../decisions/104-spec-package-format-and-client-environments.md)):

- a release whose `format` the core does not know is refused naming it; a registry answer the core cannot read, or a digest that does not match, installs nothing and is reported;
- the Git host controls who reads a spex repository and the registry who downloads; neither grants the other, so a member lacking the registry's permission is told which spec package they cannot fetch.

#### environments-13

When the core resolves or installs a Git source, it shall fetch the repository at the named `rev` with the Git host's credential where the repository is at the Git host's origin [[git-host-9](git-host.md#git-host-9)] and this device's Git otherwise, record the commit, read the manifest at the optional `path`, digest every file at resolution and install from those bytes ([DR-104](../decisions/104-spec-package-format-and-client-environments.md)):

- a `rev` naming a branch or tag resolves to its commit at resolution and the lock holds the commit alone;
- while the home is signed out, a repository at the Git host's origin is fetched with this device's own Git, so a public one still installs and a private one reports Git's refusal.

### Listing

#### environments-14

When a client sends `environment.get` for a spex repository, the core shall reply with the environment as the Playbooks surface lists it: every request with its source, every resolved spec package with its version, source, who required it, its selected artifacts with their chosen language and fallback mark, its exports, whether its files are installed, a path source missing on this device, the lock's staleness, and the conflict report where resolution failed ([DR-104](../decisions/104-spec-package-format-and-client-environments.md)).

#### environments-15

When a client sends `environment.request` for a spex repository with a spec package name and a request [[environments-2](#environments-2)], or `environment.remove` with a name, the core shall write `spex.yaml` accordingly, preserving comments and key order, then resolve [[environments-5](#environments-5)] and install [[environments-7](#environments-7)], and announce the environment changed:

- a request naming a path outside the working folder, a malformed requirement, or a name that is not `<org>/<pkg>` is refused before any write;
- the write is refused `busy` while the spex repository syncs [[space-21](space.md#space-21)].

## Internal Behavior

#### environments-16

The core package shall keep the agent folder table that exports read [[environments-8](#environments-8)] as one data file naming, per agent Cligent drives, the project-level folder relative to a working folder and the user-level folder relative to the user's home — `claude`: `.claude/skills` and `~/.claude/skills` — and shall replace the table with Cligent's answer once Cligent reports where each agent reads its skills ([DR-104](../decisions/104-spec-package-format-and-client-environments.md)):

- an agent absent from the table receives no export and is listed as such; an agent whose user-level folder's parent is absent on this device receives no user-level export, so Spex never creates an agent's own home folder, and your own group's user-level export runs only for the default home or one the shell names as the person's, never for a scratch home;
- the generated skill for a playbook is a `SKILL.md` whose body tells the agent to run the playbook's command through Spex in the working folder, naming the spec package, version and playbook id, and nothing else.

#### environments-17

The core shall expose environments through these commands and one message, each reply validated against the command schema, `repository` naming a spex repository by its key:

| Command | Input | Result | Errors |
| --- | --- | --- | --- |
| `environment.get` | `{ repository }` | `EnvironmentState` [[environments-14](#environments-14)] | `not_found` |
| `environment.request` | `{ repository, name, request }` | `{ accepted: true }` | `invalid_request`, `busy` |
| `environment.remove` | `{ repository, name }` | `{ accepted: true }` | `invalid_request`, `busy` |
| `environment.resolve` | `{ repository }` | `{ accepted: true }` | `busy` |
| `environment.install` | `{ repository }` | `{ accepted: true }` | `busy` |
| `environment.search` | `{ query }` | `{ packages: [{ name, description, versions }] }` | `invalid_request` (signed out and the registry refusing) |
| `environment.publish` | `{ repository, path }` | `{ accepted: true }` | `invalid_request` (not a release; not signed in), `busy` |

- `environment.state { repository, state: EnvironmentState }` is broadcast after every resolve, install, publish and sync-applied lock; a long command replies `accepted` at once and reports through state, never a hung reply ([DR-010](../decisions/010-interface-craft.md) §5).

#### environments-18

The core package shall ship a stand-in registry for its own tests and the browser journeys: an in-process HTTP server serving the registry's version index, version resources, raw files and release archives from a directory of releases, with scripted yank, suppression, private namespaces honouring the stand-in host's app tokens, and a publish endpoint that validates as the core does and stores the archive.

## Verification

#### environments-19

When an integration suite reads releases from a fixture directory, it shall assert the format's acceptance and refusals [[environments-1](#environments-1)]: a release with every kind and two languages accepted whole; a manifest without `format: 2`, an unknown field, a file under no artifact, a folder without a manifest entry, a skill whose `SKILL.md` name differs from its id, a skill and a playbook sharing an id, a translation whose item ids differ, a non-portable path and a link each refused naming the reason.

#### environments-20

When an integration suite resolves fixture requests against the stand-in registry [[environments-18](#environments-18)], it shall assert:

- exact, caret and tilde requirements admit and refuse the versions of the table, prereleases only when named [[environments-4](#environments-4)];
- a two-level graph resolves to the highest solution reading the version index alone, a yanked version is skipped by caret and taken by exact, a suppressed one never, and a cycle resolves [[environments-5](#environments-5)];
- conflicting requirements are reported by name before anything is installed [[environments-5](#environments-5)];
- a `select` entry, the environment's `language` and the original text choose the language in that order with the fallback recorded; what a playbook `requires` is selected with it; two skills of one name are refused until one is aliased [[environments-6](#environments-6)];
- the lock written is exactly the encoding of [[environments-3](#environments-3)] and installing from it on a second scratch home resolves nothing and yields byte-identical `packages/` [[environments-3](#environments-3)] [[environments-7](#environments-7)].

#### environments-21

When an integration suite installs locked environments on a scratch home, it shall assert:

- every selected file lands under `packages/` with its bytes and executable flag, the store holds each distinct file once with an executable copy apart, a wrong digest installs nothing and is reported, `cache/` deleted mid-way is rebuilt, and a file leaves the store only when no lock on the device selects it [[environments-7](#environments-7)];
- the replacement is atomic: a failure between fetch and replace leaves the previous files whole [[environments-7](#environments-7)];
- a changed `spex.yaml`, a changed path-source manifest and a path source lacking a selected artifact each mark the lock stale, install nothing new and report resolving again [[environments-7](#environments-7)];
- a path source is used in place, a second working folder of the same project runs its own copy, and a device whose working folder lacks it reports it missing [[environments-7](#environments-7)];
- a Git source at a branch resolves to its commit, installs from that commit through the stand-in host's credential, and the lock holds the commit alone [[environments-13](#environments-13)];
- a private namespace at the stand-in registry installs with the device's app token and refuses without, naming the spec package [[environments-12](#environments-12)].

#### environments-22

When an integration suite exports an installed environment to a working folder with the agent table naming `claude`, it shall assert:

- each selected skill stands in `<clone>/skills/<name>/` and in the folder's `.claude/skills/<name>/`, an aliased one with its `name` rewritten, the folder's `.git/info/exclude` listing them, and your own group's skills in the scratch user home's `.claude/skills/` [[environments-8](#environments-8)];
- a generated skill per playbook names the spec package, version and id and runs that playbook in the working folder; the project's and your own group's skill of one name both stand with their origins listed [[environments-8](#environments-8)] [[environments-16](#environments-16)];
- a session started in the folder hands the launcher the installed playbook's module location, your own group's where the project lacks it, the path source's in the folder for a path request, and a config enabling a playbook no environment exports is refused naming both [[environments-9](#environments-9)];
- a re-export removes a skill the lock no longer selects and leaves a reader-placed skill beside it [[environments-8](#environments-8)].

#### environments-23

When an integration suite starts a real core on a fresh scratch home with no registry reachable, it shall assert that the built-in spec package is seeded into the store, requested in your own group's environment and in a new project's, every built-in playbook launches from it, and a core started with a newer built-in release seeds it beside the older without changing either lock [[environments-11](#environments-11)].

#### environments-24

When an integration suite runs an authoring session that writes a spec package in a working folder, compiles its playbook, requests it by path, enables it and starts a session with it, then publishes it to the stand-in registry and requests the published version from a second scratch home, it shall assert each step's outcome and that the published release equals the folder's declared files [[environments-10](#environments-10)] [[environments-15](#environments-15)] [[environments-12](#environments-12)].

#### environments-25

When an integration suite drives the environment commands over the protocol, it shall assert each command's reply and refusal of the table, the `environment.state` broadcast after resolve, install and a sync-applied lock, `environment.get` carrying every field the surface lists, and `busy` during that spex repository's sync [[environments-17](#environments-17)] [[environments-14](#environments-14)] [[environments-15](#environments-15)].

## References

[1]: https://agentskills.io/specification "Agent Skills specification"
[2]: https://semver.org/spec/v2.0.0.html "Semantic Versioning 2.0.0"
[3]: https://www.rfc-editor.org/rfc/rfc5646 "BCP 47: Tags for Identifying Languages (RFC 5646)"
[4]: https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file "Naming Files, Paths, and Namespaces"
