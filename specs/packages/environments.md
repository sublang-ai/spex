<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# environments: Spec Packages and Environments

## Intent

This package defines spec packages and the environments that install them under [DR-104](../decisions/104-spec-package-format-and-client-environments.md): the release layout and manifest the core reads and checks, the requests and lock of each project and group, resolution, installing through the content-addressed store, the exports that put skills and specs where agents read them and playbooks where the launcher loads them, spec packages under development, the built-in spec package the app ships, and the registry and Git sources.
A **spec package** is one GEARS contract with the sources, spec, skills, playbooks and applets made from it, named `<org>/<pkg>`; a **release** is its immutable files at one version; an **artifact** is one `source`, `spec`, `skill`, `playbook` or `applet` of a release.
An **environment** is what a project or a group installs: `spex.yaml` says which spec packages it wants and `spex.lock` records exactly what it got, at the root of a project's working folder or of a group's own spex repository's clone [[environments-26](#environments-26)] [[storage-1](storage.md#storage-1)].
An **instance** is a deployment of spex.pub known by its origin, whose registry answers under that origin's `/api/v1`; an environment's instance is its spex repository's [[storage-31](storage.md#storage-31)], none for a local-only one, and **the registry** of an environment is its instance's, or the home's default instance's where it has none [[storage-2](storage.md#storage-2)] ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)).
A **working folder** is where a project's or a group's sessions run, paired with the spex repository whose environment it uses [[storage-6](storage.md#storage-6)].

## External Behavior

### The Format

#### environments-1

When the core reads a release — from the registry, a Git commit, a path source's folder [[environments-2](#environments-2)], or the app's own built-in spec package — it shall accept it only as a folder in the release layout with a `meta.yaml` manifest of `format: 2`, refusing any other with its reasons ([DR-104](../decisions/104-spec-package-format-and-client-environments.md)):

| Path in a release | Content |
| --- | --- |
| `meta.yaml` | the manifest |
| `README.md`, `LICENSE` | optional description and license |
| `sources/<language>/<id>/` | source material entered at `SOURCE.md`, attachments beside it |
| `specs/<language>/<pkg>.md` | the one spec file, with its sections, item ids and citations kept whole |
| `skills/<language>/<id>/` | an Agent Skills folder [[1]] whose `SKILL.md` name is `<id>` |
| `playbooks/<language>/<id>/` | a playbook in Playbook's native layout: the text the compiler reads, its compiled module and what the compiler wrote beside them, except its `.slc/` build history and `.slc-verify/` verifier support, which a folder read as a release leaves out wherever they stand in it |
| `applets/<id>/` | a browser-server application in its native layout |

| `meta.yaml` field | Content |
| --- | --- |
| `format` | `2` |
| `org`, `name`, `version` | lowercase kebab-case names of at most 64 characters, and a Semantic Versioning 2.0.0 version [[2]] |
| `description`, `license`, `repository` | a description and the license, both required to publish [[environments-10](#environments-10)], and an optional repository URL |
| `dependencies` | optional: `<org>/<pkg>` to a version requirement [[environments-4](#environments-4)] |
| `artifacts` | artifact id to `{kind, language, from, requires, generated-by}` |

- `kind` is one of the five kinds; `language` is a BCP 47 tag [[3]] naming the artifact's original folder, absent for an applet, the artifact's other language folders being its translations; `from` and `requires` name artifact ids of the same release; `generated-by` is an optional `{agent, model}`; an `x-` prefixed field is ignored and any other unknown field refused;
- the manifest and the folders name the same artifacts and languages; every file lies under one artifact or is one of the three root files; a release has at most one spec, whose id is `<pkg>`; a skill's id is its Agent Skills name [[1]], a playbook's id its Playbook id and an Agent Skills name as well, and no skill and playbook share an id; a translated spec keeps the original's item ids;
- a path is portable: components of at most 255 bytes, no control characters, none of `/ \ : * ? " < > |`, no trailing dot or space, no Windows device name [[4]], unique after NFC and case folding; a link or special file is refused;
- a release keeps, per file, its path, its bytes and one executable flag.

### Requests and the Lock

#### environments-26

The core shall keep an environment's `spex.yaml` and `spex.lock` at the root of the working folder for a project, and at the root of the clone for a group's own spex repository [[storage-1](storage.md#storage-1)], reading them at each use and writing them there, never staging, committing or ignoring them in a working folder's Git ([DR-113](../decisions/113-a-projects-environment-lives-in-its-working-folder.md)):

- a project's environment is committed with its code by the reader, so it follows the code's branches and history, and a working folder cloned with them holds its environment before Spex writes anything;
- a project's environment is this device's alone while the code's `HEAD` lacks either file, read from the folder's Git at each use, so a file added but not committed counts as not committed, as does a folder that is no repository or has no commit;
- a use is the core's start, the pairing of a working folder, a session start, an export and `environment.get`, and the files as the folder holds them at that read are the environment, so a branch switch, a pull or a hand edit shows at the next use.

#### environments-2

The core shall read an environment's `spex.yaml` [[environments-26](#environments-26)] as exactly `{format: 1, language?, packages}` — an optional preferred language, and `<org>/<pkg>` to one request — refusing a `format` it does not know ([DR-104](../decisions/104-spec-package-format-and-client-environments.md)):

| Source | Fields | Meaning |
| --- | --- | --- |
| registry | `version` | a version requirement [[environments-4](#environments-4)], met from the registry |
| path | `path` | a folder inside the environment's path root, by a path relative to it, used in place |
| Git | `git`, `rev`, optional `path` | a repository an instance or this device's Git can read, at a branch, tag or commit, with an optional folder inside |

- a request names exactly one source and may add `select`, a list of `{artifact, language}`, and `alias`, the id of a skill, playbook or spec to the Agent Skills name its skill is exported under;
- an environment's path root is the root of the working folder paired with its spex repository on this device, which holds a project's `spex.yaml` [[environments-26](#environments-26)], for a project's or another group's environment, none while this device pairs no working folder, and the root of its clone, which holds its `spex.yaml`, for your own group's, confined as [[environments-32](#environments-32)] states ([DR-125](../decisions/125-your-own-groups-path-sources-live-in-its-clone.md));
- a direct request fixes the source of that spec package for everything that requires it; every other spec package comes from the registry.

#### environments-32

When the core reads a request by path in your own group's environment — before writing it [[environments-15](#environments-15)], at each resolution [[environments-5](#environments-5)] and at each install [[environments-7](#environments-7)] — it shall accept only a folder below its clone's root that lies outside Spex's own paths, is reached through no link, lies in no Git repository of its own, and holds nothing the clone's sync drops or refuses, refusing any other with the path and its reason, so the folder syncs with the clone ([DR-125](../decisions/125-your-own-groups-path-sources-live-in-its-clone.md)):

| Refused | Reason |
| --- | --- |
| the clone's root, or a path leading out of it | not below the clone's root |
| a path whose first segment — compared without case after Unicode compatibility normalization (NFKC) — is `config`, `sessions`, `intents`, `authoring`, `packages`, `skills`, `local`, `.git`, `.spex-uploads`, `spex.yaml`, `spex.lock`, `project.json`, `.gitignore`, `.gitattributes`, `.spex-apply.json` or a name beginning `.lock` | a path Spex keeps [[storage-1](storage.md#storage-1)] |
| a path the clone's Git rules ignore, such as one under a folder named `*.tmp` [[storage-17](storage.md#storage-17)] | not synced |
| a folder that is a link, or lies under one | reached through a link |
| a folder that is, or lies under, a Git repository of its own — a folder below the root holding `.git` | a repository the sync does not carry, named |
| a folder holding a file of its release [[environments-1](#environments-1)] the clone's Git rules ignore, or one of an ignored family of the catalog [[storage-1](storage.md#storage-1)], which a sync refuses to share [[space-15](space.md#space-15)] | a file not synced, named |
| a folder holding at any depth, where the clone's Git rules do not ignore it, a Git repository of its own, a link, or an entry that is no regular file or folder | an entry the sync does not carry, named |
| an existing subtree the clone's Git rules do not ignore whose entries cannot be inspected | confinement cannot be established, the unreadable path named |

- the clone's Git rules are Git's own reading of its `.gitignore` files and this device's excludes, under which a file Git tracks is never ignored, so a rule of one device's excludes refuses no file another device committed;
- a request is checked against what stands at its path when it arrives, so a folder not made yet is refused only by the first five rows, and the last three read it at the first resolution or install finding it;
- an install finding a folder refused fails before anything is installed or linked, its cause naming the path and the reason, the last files and exports staying [[environments-7](#environments-7)].

#### environments-3

The core shall write and read an environment's `spex.lock` [[environments-26](#environments-26)] as exactly `{format: 1, requests, packages}` — a SHA-256 digest of the `spex.yaml` it resolved, and `<org>/<pkg>` to one resolution — refusing a `format` it does not know ([DR-104](../decisions/104-spec-package-format-and-client-environments.md)):

| Resolution field | Content |
| --- | --- |
| `source` | the exact source: `{registry, version, checksum}`, `registry` naming an instance by its origin [[environments-5](#environments-5)]; `{path, version, dependencies, requires}` as the path's manifest states them; or `{git, commit, path?}` |
| `required-by` | the spec packages that required it, `[]` for a direct request alone |
| `artifacts` | each selected artifact id to `{language, fallback}`: its chosen language and whether that was a fallback |
| `files` | every selected file as `{path, sha256, executable}`; empty for a path source |
| `exports` | exported Agent Skills name to artifact id |

- a lock changes only when `spex.yaml` changes, the reader asks to resolve again, or a pick places its local-only clone at an instance [[environments-11](#environments-11)]; installing from an existing lock resolves nothing.

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
- the environment's registry is asked as [[environments-12](#environments-12)] states, and each spec package resolved from it records it in its resolution, keeping instead the registry the lock records, by its canonical origin, where that names an origin and it resolves to the version and checksum recorded there ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md));
- a path source resolves to the manifest in its folder [[environments-2](#environments-2)], your own group's once the folder passes [[environments-32](#environments-32)], a Git source to the named commit's manifest, with their dependencies from the registry;
- when no solution exists, the core replies `invalid_request` naming the version requirements in conflict, before anything is installed or run;
- the lock is written only while `spex.yaml` still holds the bytes resolved and `spex.lock` the bytes read before resolving, each checked at the instant of the write; a resolution overtaken meanwhile writes nothing, a caller awaiting it is refused `conflict` naming the file that changed meanwhile, to retry, and it records no failure in the environment's state ([DR-111](../decisions/111-the-core-coordinates-as-git-does.md));
- a resolution that fails, or finds no solution, once either file no longer holds the bytes it read is overtaken in the same way, its outcome recorded nowhere, so it never replaces what a later operation left.

#### environments-6

When a solution stands, the core shall select, within it, in this order ([DR-104](../decisions/104-spec-package-format-and-client-environments.md)):

1. artifacts: those a request selects, or all of them by default, plus everything any requiring spec package needs, together with everything they `requires`;
2. languages: for each selected artifact, the language its `select` entry names; else the environment's `language` when the artifact has it; else its original text, recorded as a fallback when another language was wanted;
3. files: the root files and every file of each selected artifact in its chosen language;
4. exports: each selected playbook under its id, and one skill for each selected skill and each selected playbook, under the artifact's id, and for the selected spec, under `<org>-<pkg>`, or `<pkg>` where that is longer than an Agent Skills name may be [[1]] — each skill under its alias where the request names one ([DR-115](../decisions/115-a-spec-reaches-the-agents.md)).

- two playbooks with one id, or two exported skill names alike, in one environment are refused naming both, until one is aliased.

### Installing

#### environments-7

When a client sends `environment.install` for a spex repository, or a resolve or a sync of a group's own spex repository changed its lock, or a use's read [[environments-26](#environments-26)] finds a lock other than the one installed, the core shall install the lock's selected files under `<clone>/packages/<org>/<pkg>/` at their release paths through the store under the home, atomically ([DR-104](../decisions/104-spec-package-format-and-client-environments.md)):

- the store keeps each distinct file once under `store/<sha256>`, written once after its digest is verified, with an executable copy apart under `store/x/<sha256>`, and keeps a file while a lock of an environment on this device [[environments-26](#environments-26)] selects it; `cache/` holds fetched archives and metadata and may be deleted at any time;
- a spec package from a registry is fetched from the registry of the environment's instance where it has one, else from the registry its lock records, else from that of any other instance the home is signed in to, whichever first serves its release at the locked version and checksum, each asked as [[environments-12](#environments-12)] states; where none does, the install fails naming the spec package; the built-in spec package [[environments-11](#environments-11)] is served first from this device's seed at the locked version where the seed's files carry the digests the lock records for them, its archive's checksum aside ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md));
- a file is fetched by any transport the registry serving it offers — the release archive, or raw files — or from the Git source at the locked commit, and stored only when its SHA-256 matches the lock's `files`; the portable-path rules [[environments-1](#environments-1)] are re-checked; no code runs;
- a path source copies nothing: its files are used where its path resolves [[environments-2](#environments-2)] — in a working folder, each running its own, or in your own group's clone, each device running the copy its clone syncs —; a device lacking the folder reports it missing, and the environment stays otherwise installed;
- every playbook artifact folder of the lock, a path source's where its path resolves included, is prepared to run on the app's engine [[playbook-library-46](playbook-library.md#playbook-library-46)], also where the installed files already match the lock;
- the new installed files are complete, prepared privately, before they replace the old ones; a failure before that replacement commits leaves the last files in place and reports its cause;
- the replacement commits when the complete new tree stands at `packages/`; removing the obsolete tree afterward is garbage collection, whose failure leaves the new files installed, does not prevent their exports, and records a diagnostic naming the retained tree and cause;
- the replacement happens only while the clone stands, the environment's `spex.lock` [[environments-26](#environments-26)] still holds the bytes installed, and the lock still matches `spex.yaml` and its path sources, checked at the instant before the swap; an install overtaken meanwhile publishes nothing, the last files staying, a caller awaiting it is refused `conflict` naming the file that changed meanwhile, to retry, and it records no failure in the environment's state; a clone gone meanwhile is never made again, and an install awaited on it is refused ([DR-111](../decisions/111-the-core-coordinates-as-git-does.md));
- the exports of an install are written only while the lock and the installed files still stand as it left them, so no export mixes two locks; where either changed after the swap, the exports standing are not rewritten, the swapped-in files stay, and the install is overtaken as above;
- an install's outcome — its failure, its stale report, or its success clearing an earlier failure — is recorded only while `spex.yaml` and `spex.lock` still hold the bytes the install read or itself wrote; otherwise the install is overtaken as above, what it installed and exported standing;
- a stale lock — its `requests` digest no longer matching `spex.yaml`, or a path source's manifest no longer stating the version, dependencies and `requires` the lock recorded, or lacking an artifact the lock selected — installs and exports nothing new: the last files stay, and the core reports that resolving again is needed, refusing an install its caller awaits with that reason.

### Exports

#### environments-8

When an environment is installed or a group's own lock applied by a sync, the core shall export its skills, playbooks and specs, so that every member of a project gets the same tools ([DR-104](../decisions/104-spec-package-format-and-client-environments.md), [DR-115](../decisions/115-a-spec-reaches-the-agents.md)):

| Export | Where |
| --- | --- |
| each selected skill, copied with its `name` rewritten, as a YAML string, where aliased [[1]] | `<clone>/skills/<name>/`, then into the agent folders of each working folder paired with the spex repository, listed in that folder's `.git/info/exclude` so Git ignores them |
| a generated skill per selected playbook, under the playbook's id or alias, that runs the playbook in the working folder of the session and names the exact spec package and version it came from | `<clone>/skills/<name>/`, then Claude Code's agent folders of the places each selected skill goes [[environments-16](#environments-16)] |
| a generated skill per selected spec, under its exported name [[environments-6](#environments-6)], that holds the spec file in its chosen language copied byte for byte as `<pkg>.md` and names the spec package's org, name, version and description | the places each selected skill goes |
| your own group's skills | your agents' user-level folders on this device as well, so they reach every session run here |

- the agent folders are the folders where each agent Spex drives reads project-level and user-level skills, as the core's agent table states them [[environments-16](#environments-16)];
- an exported skill, playbook or spec is bound to the environment whose lock exported it: it runs or holds that environment's installed files, or a path source's files where its path resolves for that environment [[environments-2](#environments-2)], never another environment's copy of the same name;
- when a project and your own group export one skill name, both keep it, one in the project's agent folder and one in the agent's user-level folder, and the Playbooks surface lists both saying where each comes from [[playbook-library-1](playbook-library.md#playbook-library-1)];
- an export leaves nothing it did not write: a folder the agent table names holds only the exported skills of that environment beside what the reader put there;
- a folder the reader put in an agent folder under an exported name stays as it is, that skill left out of that agent folder alone, and an exported artifact whose files the export does not find, as a path source the working folder lacks [[environments-7](#environments-7)], is exported nowhere.

#### environments-31

When a working folder is paired with a spex repository whose clone this device holds [[storage-6](storage.md#storage-6)], the core shall export that repository's environment into the folder as an install does [[environments-8](#environments-8)], after any install the pairing's read starts [[environments-7](#environments-7)] ([DR-104](../decisions/104-spec-package-format-and-client-environments.md), [DR-124](../decisions/124-skills-reach-every-agent.md)).

#### environments-9

When a session starts in a working folder, the core shall hand the launcher the module location of each playbook its composed configuration enables [[core-service-2](core-service.md#core-service-2)] — the installed playbook artifact's module in the project's environment, else your own group's, else, for a path source, the module where its path resolves [[environments-2](#environments-2)] — and shall write no path into a shared file ([DR-104](../decisions/104-spec-package-format-and-client-environments.md)):

- a playbook the configuration enables and no environment of the session exports is a config error naming the playbook and the spex repository whose environment lacks it;
- a registry or Git source supplies a module only while its package is installed as the current lock records it — the install record naming the same source, files and artifacts, every selected file there [[environments-14](#environments-14)]; retained files from another lock are unavailable and are not imported during configuration loading, including after a failed install [[environments-7](#environments-7)], while a path source is used in place;
- a playbook available in an environment but enabled in no configuration is listed and not launched.

### Authoring and Publishing

#### environments-10

When an authoring session [[storage-23](storage.md#storage-23)] writes a spec package under development, the core shall keep it as a folder in the release layout inside the working folder, compile its playbooks there with the compiler in the playbook's artifact folder [[playbook-library-57](playbook-library.md#playbook-library-57)], and offer to request it from the project's environment by `path` and to publish it ([DR-104](../decisions/104-spec-package-format-and-client-environments.md)):

- publishing uploads the declared release files only, after the same checks the core makes on a release [[environments-1](#environments-1)], to the registry of the environment the publish names [[environments-17](#environments-17)] as the account signed in at that registry's instance [[environments-12](#environments-12)] ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md));
- a manifest without a `description` or a `license`, which the registry requires, is refused naming each missing field before any upload, its preview included [[environments-17](#environments-17)];
- to share before publishing, the folder is requested by `git` at a commit, or published as a prerelease to a private namespace at the registry; to use it yourself on every device, it is kept in your own group's clone and requested by path there [[environments-2](#environments-2)];
- a working folder may hold any number of spec packages under development.

#### environments-27

While the home is signed in to an instance, when the core asks that instance's registry for the orgs its account there may publish to, it shall send one `GET /api/v1/account/orgs` to that registry presenting that instance's app token as resolving and installing do [[environments-12](#environments-12)], and take a `200` whose `orgs` lists each org's `name`, its group's `path` in that instance and the account's `role`, sorted by name, as the answer ([DR-120](../decisions/120-the-instance-is-the-space.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)):

- any status but `200`, a body not in that shape, a network failure, or no answer within two seconds is no answer.

### The Built-In Spec Package

#### environments-11

When the core starts, it shall seed the app's built-in spec package — the playbooks Playbook ships, as one spec package named `sublang/playbooks` at Playbook's version, each playbook an artifact in `en` with `code` and `decide` requiring `review` — into the store, and shall request it with a caret requirement in your own group's environment where that environment lacks it, and in a new project's environment, written at pairing [[storage-6](storage.md#storage-6)], so the built-in playbooks work offline from the first start ([DR-104](../decisions/104-spec-package-format-and-client-environments.md)):

- the lock pins its version like any other, so an app update never changes an environment by itself: the newer release is seeded beside the older, which the store keeps while a lock selects it;
- the built-in release's resolution, made from the seed offline, records the environment's registry as the one it was resolved at [[environments-5](#environments-5)], and a pick placing a local-only clone at an instance [[storage-35](storage.md#storage-35)] records that instance's registry in its place while the environment requests the built-in spec package alone and its lock holds just the resolution a pairing writes for it ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md));
- the seeded release's checksum is that of the release archive this device packs from its seed;
- while an environment's lock selects an older release than the one this app ships and the version requirement its `spex.yaml` requests the built-in spec package at admits the shipped one [[environments-4](#environments-4)], its state [[environments-14](#environments-14)] names both releases, the lock unchanged until the reader resolves again [[environments-5](#environments-5)];
- the seeded artifacts carry the playbook text and the module as the app's Playbook ships them, the module's engine resolved through the engine links provisioned in each installed playbook artifact's folder as a compile provisions them [[playbook-library-46](playbook-library.md#playbook-library-46)].

### Sources

#### environments-12

When the core resolves or installs from a registry, it shall read the registry's version index for every spec package of the graph, read a version resource only for each version it picks, fetch files by the raw-file URLs or the release archive, and present the app token of the instance the registry answers for where the home is signed in to it and none otherwise — the access secret kept current before each call [[git-host-4](git-host.md#git-host-4)], an answer that it expired reported as a failure of that operation — so a private namespace the account there may read installs and a public one needs no credential ([DR-104](../decisions/104-spec-package-format-and-client-environments.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)):

- the registry answering `invalid_token`, `token_revoked` or `reauth_required` to an instance's token signs that instance alone out [[git-host-4](git-host.md#git-host-4)] and fails that call;
- a release whose `format` the core does not know is refused naming it; a registry answer the core cannot read, or a digest that does not match, installs nothing and is reported;
- the Git host controls who reads a spex repository and the registry who downloads; neither grants the other, so a member lacking the registry's permission is told which spec package they cannot fetch.

#### environments-13

When the core resolves or installs a Git source, it shall fetch the repository at the named `rev` with the credential brokered by an instance the home is signed in to at whose Git origin the repository lies [[git-host-9](git-host.md#git-host-9)], the environment's own instance preferred where it is one, and with this device's Git where none is, record the commit, read the manifest at the optional `path`, digest every file at resolution and install from those bytes ([DR-104](../decisions/104-spec-package-format-and-client-environments.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)):

- a `rev` naming a branch or tag resolves to its commit at resolution and the lock holds the commit alone;
- a repository at the Git origin of no instance the home is signed in to, a signed-out instance's included, is fetched with this device's own Git, so a public one still installs and a private one reports Git's refusal.

### Listing

#### environments-14

When a client sends `environment.get` for a spex repository, the core shall reply with the environment as the Playbooks surface lists it, read at the reply from the environment's files where it lives [[environments-26](#environments-26)] and the files installed in the spex repository's clone: every request with its source, every resolved spec package with its version, source, who required it, its selected artifacts with their chosen language and fallback mark, its exports, whether its files are installed as the lock locks them — recorded by the install that placed them, with the same source, files and artifacts, every file there — a path source missing on this device, the environment's path root on this device or none [[environments-2](#environments-2)], what the core's last export of the environment left out where that export went into the working folder now paired, or into none while none is [[environments-8](#environments-8)] — each skill a folder the reader put under its name kept out of an agent folder, with that folder as the agent table names it [[environments-16](#environments-16)], and each spec package an exported artifact of which it did not find — the lock's staleness, the step of the latest operation still running — one begun before the clone moved counted, and its end announced, at the new address — the failure the last failing operation recorded, cleared by a later success and never recorded by an operation overtaken by a change of its files [[environments-5](#environments-5)] [[environments-7](#environments-7)], the conflict report while `spex.yaml` still holds the bytes the failed resolution read, and, for a project, whether its two files are committed with the code, both in the code's `HEAD`, or not and so this device's alone [[environments-26](#environments-26)] ([DR-104](../decisions/104-spec-package-format-and-client-environments.md), [DR-111](../decisions/111-the-core-coordinates-as-git-does.md)).

#### environments-29

The core shall present generated environment source labels, conflict requirements and operation failures using the instance's naming boundary ([DR-120](../decisions/120-the-instance-is-the-space.md)):

- a Git request is a display summary, distinct from the command that authors its transport locator; a local path or file URL stays as given, while a network repository reads as the display name of an instance under whose reported Git origin its remote lies — the environment's own where it is one, else the earliest in the home's list —, as the external remote with any embedded HTTP(S) user removed when under none, and as an unnamed remote while the home's default instance or an instance it lists has not reported its origin [[git-host-5](git-host.md#git-host-5)] ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)); the same rule governs a locked package's source detail;
- generated failures and conflict requirements follow that source rule, including failures returned by an awaited operation and those reported through state; a transport failure for an instance source, or one whose origin is not known, carries no raw transport output;
- source labels and conflict requirements use the latest known origin without requesting another host read; a recorded failure keeps the safe explanation generated from its operation's source and the origin known when it failed, independent of later request edits;
- presentation changes no request, lock or installed file, and never substitutes a displayed label for the locator Git fetches [[environments-13](#environments-13)].

#### environments-15

When a client sends `environment.request` for a spex repository with a spec package name and a request [[environments-2](#environments-2)], or `environment.remove` with a name, the core shall write `spex.yaml` where the environment lives [[environments-26](#environments-26)], preserving comments and key order, then resolve [[environments-5](#environments-5)] and install [[environments-7](#environments-7)], and announce the environment changed:

- a request naming a path while its environment has no path root on this device, a path outside that root [[environments-2](#environments-2)] or one your own group's clone refuses [[environments-32](#environments-32)], a malformed requirement, or a name that is not `<org>/<pkg>` is refused before any write;
- a repository naming no clone on this device when the command arrives is refused `not_found` before any write;
- the candidate is prepared from the bytes read and written under their version, so a file changed meanwhile, or a clone gone after the command read it, is refused `conflict` — changed meanwhile, retry — with the newer file kept and no folder made ([DR-111](../decisions/111-the-core-coordinates-as-git-does.md));
- every command starts at once, beside any operation still running on the environment, and none waits for or refuses another;
- once the core stops, no operation starts, and a request or install its caller awaits is refused before any write.

## Internal Behavior

#### environments-16

The core package shall keep the agent folder table that exports read [[environments-8](#environments-8)] as one data file naming, per agent Spex drives, the home folder that shows the device has it and whether playbook skills go there, and taking that agent's project-level folder relative to a working folder and user-level folder relative to the user's home from Cligent's published native-skill support [[5]] ([DR-104](../decisions/104-spec-package-format-and-client-environments.md), [DR-124](../decisions/124-skills-reach-every-agent.md), [DR-130](../decisions/130-playbook-17-11-0-cligent-0-36-0-slc-0-19-0-adoption.md)):

| Agent | Home folder | Project-level | User-level | Playbook skills |
| --- | --- | --- | --- | --- |
| `claude` | `~/.claude` | `.claude/skills` | `~/.claude/skills` | yes |
| `codex` | `~/.codex` | `.agents/skills` | `~/.agents/skills` | no |
| `gemini` | `~/.gemini` | `.agents/skills` | `~/.agents/skills` | no |
| `kimi` | `~/.kimi-code` | `.agents/skills` | `~/.agents/skills` | no |
| `opencode` | `~/.config/opencode` or `~/.local/share/opencode` | `.agents/skills` | `~/.agents/skills` | no |

- every working folder paired with the spex repository receives each project-level folder, whatever agents the device has, and two folders a link makes one are written once, taking playbook skills where either does; a user-level folder is written only where the home folder of an agent reading it exists on this device, so Spex never creates an agent's own home folder, and your own group's user-level export runs only for the default home or one the shell names as the person's, never for a scratch home;
- the generated skill for a playbook is a `SKILL.md` whose `name` is a YAML string and whose `description`, within the Agent Skills limit of 1024 characters [[1]], says that it starts the playbook, naming its id and spec package, through Spex in the working folder and that it is not for an agent already playing a role in a playbook, and whose body tells the agent to run the playbook's command through Spex in the working folder, naming the spec package, version and playbook id, then tells an agent already inside a Spex session as a player of a playbook, given a role and a step, that the skill does not apply and to do that step, and nothing else;
- the generated skill for a spec is a `SKILL.md` whose `name` is a YAML string and whose `description`, within the Agent Skills limit of 1024 characters [[1]], names the spec package, its version and the manifest's `description` where it has one, and whose body names the org, name, version and that description and tells the agent the spec is the `<pkg>.md` beside it, and nothing else.

#### environments-30

When an export mirrors a skill into an agent folder [[environments-8](#environments-8)], the core shall leave a folder whose files already match as it is and replace a changed one whole, renaming a complete copy staged beside the agent folder into place and restoring the replaced one where that rename fails, so a run reading the folder meanwhile never finds a skill half-written, a changed one being absent only between two renames ([DR-124](../decisions/124-skills-reach-every-agent.md)).

#### environments-17

The core shall expose environments through these commands and one message, each reply validated against the command schema, `repository` naming a spex repository by its key and so the environment of the working folder it pairs with, or a group's own [[environments-26](#environments-26)]:

| Command | Input | Result | Errors |
| --- | --- | --- | --- |
| `environment.get` | `{ repository }` | `EnvironmentState` [[environments-14](#environments-14)] | `not_found` |
| `environment.request` | `{ repository, name, request }` | `{ accepted: true }` | `invalid_request`, `not_found`, `conflict` |
| `environment.remove` | `{ repository, name }` | `{ accepted: true }` | `invalid_request`, `not_found`, `conflict` |
| `environment.resolve` | `{ repository }` | `{ accepted: true }` | `not_found` |
| `environment.install` | `{ repository }` | `{ accepted: true }` | `not_found` |
| `environment.search` | `{ repository, query }`, searching the registry of `repository`'s environment ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)) | `{ packages: [{ name, description, versions }] }` | `invalid_request` (signed out of that registry's instance and the registry refusing), `not_found` |
| `environment.publish` | `{ repository, path, dryRun? }`, `path` naming a folder inside the environment's path root [[environments-2](#environments-2)] | `{ accepted: true }`, a dry run uploading nothing and adding `preview: { name, version, files }` | `invalid_request` (no path root on this device; outside it; not a release; no `description` or `license`; not signed in at the instance it publishes to [[environments-10](#environments-10)]) |

- `environment.state { repository, state: EnvironmentState }` is broadcast after every resolve, install, publish, sync-applied lock and pairing's export [[environments-31](#environments-31)]; a long command replies `accepted` at once and reports through state, never a hung reply ([DR-010](../decisions/010-interface-craft.md) §5).

#### environments-18

The core package shall ship a stand-in registry for its own tests and the browser journeys: an in-process HTTP server serving the registry's version index, version resources, raw files and release archives from a directory of releases, answering at each stand-in instance set to relay to it, so one registry may stand behind several instances, with scripted yank, suppression, private namespaces honouring the app tokens of each instance it answers at, a scripted `token_revoked` answer to one instance's tokens, the orgs listed for an app token — any other token, or none, refused `401` — answered after a scripted delay, and a publish endpoint that validates as the core does and stores the archive.

## Verification

#### environments-19

When an integration suite reads releases from a fixture directory, it shall assert the format's acceptance and refusals [[environments-1](#environments-1)]: a release with every kind and two languages accepted whole; a manifest without `format: 2`, an unknown field, a file under no artifact, a folder without a manifest entry, a skill whose `SKILL.md` name differs from its id, a skill and a playbook sharing an id, a translation whose item ids differ, a non-portable path and a link each refused naming the reason.

#### environments-20

When an integration suite resolves fixture requests against the stand-in registry [[environments-18](#environments-18)], it shall assert:

- exact, caret and tilde requirements admit and refuse the versions of the table, prereleases only when named [[environments-4](#environments-4)];
- a two-level graph resolves to the highest solution reading the version index alone, a yanked version is skipped by caret and taken by exact, a suppressed one never, and a cycle resolves [[environments-5](#environments-5)];
- conflicting requirements are reported by name before anything is installed [[environments-5](#environments-5)];
- a `select` entry, the environment's `language` and the original text choose the language in that order with the fallback recorded; what a playbook `requires` is selected with it; two skills of one name are refused until one is aliased; a spec exports under `<org>-<pkg>`, under `<pkg>` where `<org>-<pkg>` is longer than 64 characters, and under its alias [[environments-6](#environments-6)];
- a lock recording a release's registry by another spelling of an origin, resolved again where that release reproduces its version and checksum, keeps the origin in its canonical form, and one recording a path, a file URL, a user or no URL records the registry asked [[environments-5](#environments-5)] [[environments-3](#environments-3)];
- the lock written is exactly the encoding of [[environments-3](#environments-3)] and installing from it on a second scratch home resolves nothing and yields byte-identical `packages/` [[environments-3](#environments-3)] [[environments-7](#environments-7)].

#### environments-21

When an integration suite installs locked environments on a scratch home, it shall assert:

- every selected file lands under `packages/` with its bytes and executable flag, the store holds each distinct file once with an executable copy apart, a wrong digest installs nothing and is reported, `cache/` deleted mid-way is rebuilt, and a file leaves the store only when no lock on the device selects it [[environments-7](#environments-7)];
- the replacement is atomic: a failure between fetch and replace leaves the previous files whole and retains its primary cause; where a readable but nonwritable old tree prevents its removal after replacement, the new files stay installed and export to the working folder, the obsolete tree retained with its cause reported [[environments-7](#environments-7)];
- through a real core with an install's download held at the registry: a lock replaced meanwhile, or a `spex.yaml` changed meanwhile, publishes nothing, the files standing stay, and the state records no failure while reading the current lock's standing [[environments-7](#environments-7)] [[environments-14](#environments-14)]; an install awaited by the enabling path whose `spex.lock` is rewritten, or whose install record is removed, after its swap and before its exports is refused `conflict` naming that change, to retry, the exports standing byte for byte on the same inodes, the swapped-in files staying and no failure recorded [[environments-7](#environments-7)]; a download held and failing once released, after `spex.yaml` changed and a later install succeeded, records no failure, the later installed state standing [[environments-7](#environments-7)]; an install succeeding after an earlier failure was recorded, whose `spex.yaml` changes after its files are installed and before its exports, is refused `conflict` naming `spex.yaml` once its exports are written, the exports standing and the earlier failure still recorded, and an install of a lock a path-source manifest change made stale, whose `spex.yaml` changes before its report is recorded, is refused `conflict` naming `spex.yaml`, not with its stale reasons [[environments-7](#environments-7)]; a clone removed meanwhile is not made again, no staged tree outlives the refusal, `environment.request` and `environment.remove` on it are refused `not_found`, and a request or install then awaited on it is refused [[environments-15](#environments-15)]; an install of the lock left stale then installs and exports nothing and reports its stale reasons alone, and with `spex.yaml` gone beside an installed lock an install awaited by the enabling path is refused, resolving again needed; and `environment.get` reports a package installed only where the install record matches the lock, never for files of another lock under the same names [[environments-7](#environments-7)] [[environments-14](#environments-14)];
- a changed `spex.yaml`, a changed path-source manifest and a path source lacking a selected artifact each mark the lock stale, install nothing new and report resolving again [[environments-7](#environments-7)];
- a path source is used in place, a second working folder of the same project runs its own copy, and a device whose working folder lacks it reports it missing [[environments-7](#environments-7)];
- a Git source at a branch resolves to its commit, installs from that commit through the stand-in host's credential, and the lock holds the commit alone [[environments-13](#environments-13)];
- a project's `spex.yaml` and `spex.lock` stand at its working folder's root and nowhere in its clone, the core having staged, committed and ignored nothing [[environments-26](#environments-26)]; a working folder paired while holding a committed environment installs from it with nothing written [[environments-26](#environments-26)] [[environments-7](#environments-7)]; a lock changed by a Git checkout in the folder is installed at the next use [[environments-7](#environments-7)]; and the environment is listed as this device's while the files are untracked, still after `git add` alone, and as committed once a commit holds both [[environments-14](#environments-14)];
- a private namespace at the stand-in registry installs with the app token of the instance it answers at and refuses without, naming the spec package [[environments-12](#environments-12)].

#### environments-22

When an integration suite exports an installed environment to a working folder with the core's agent table, it shall assert:

- each selected skill stands in `<clone>/skills/<name>/` and in the folder's `.claude/skills/<name>/` and `.agents/skills/<name>/`, an aliased one with its `name` rewritten as a YAML string even where YAML would read the alias as another type, the folder's `.git/info/exclude` listing them, and your own group's skills in the scratch user home's `.claude/skills/` and, once an agent reading it has a home folder there, `.agents/skills/` [[environments-8](#environments-8)] [[environments-16](#environments-16)];
- the table names every agent Spex drives, each with the project-level and user-level folders Cligent's native-skill support publishes for it, and with no home folder of a reader in the scratch user home, no user-level `.agents/skills/` and no agent home folder is made, while the working folder still receives both project-level folders [[environments-16](#environments-16)];
- where the working folder's `.agents/skills` links to its `.claude/skills` before that folder exists, an export, and a second one, leaves every skill and the playbook's generated skill standing there [[environments-16](#environments-16)];
- a generated skill per playbook stands in `.claude/skills/` and not in `.agents/skills/`, and a generated playbook's or spec's `name` stays the string it is exported under even where YAML would read it as another type [[environments-16](#environments-16)]; it names the spec package, version and id and runs that playbook in the working folder [[environments-8](#environments-8)] [[environments-16](#environments-16)], its `description` within 1024 characters and saying it is not for an agent already playing a role in a playbook, and its body ending by sending such a player back to the step it was given [[environments-16](#environments-16)]; the project's and your own group's skill of one name both stand with their origins listed [[environments-8](#environments-8)] [[environments-16](#environments-16)];
- a session started in the folder hands the launcher the installed playbook's module location, your own group's where the project lacks it, the path source's in the folder for a path request, and a config enabling a playbook no environment exports is refused naming both [[environments-9](#environments-9)];
- through a real core, a failed startup restoration leaves another lock's files unavailable without importing them; one successful resolve installs and prepares the selected release and makes the same process's configuration valid without a restart or a session; a Git source absent from the install record does not import retained files [[environments-9](#environments-9)] [[environments-7](#environments-7)];
- a path source's spec stands as a generated skill under `<org>-<pkg>` in the folder's `.claude/skills/`, its `<pkg>.md` byte-equal to the working folder's spec file and its `SKILL.md` naming the org, name, version and description [[environments-8](#environments-8)] [[environments-16](#environments-16)];
- a folder the reader put under an exported name in the working folder's `.agents/skills/`, and one in the user home's `.agents/skills/`, stands byte for byte while the skill stands in each other agent folder, and an export into a working folder whose `.agents/skills` links to its `.claude/skills` leaves such a folder there as it is [[environments-8](#environments-8)];
- a re-export removes a skill the lock no longer selects and leaves a reader-placed skill beside it [[environments-8](#environments-8)], leaves an unchanged skill's files as they were, stands a changed skill whole with no staging copy left behind, and, where the changed skill cannot be moved or renaming its new copy in fails, leaves the previous one standing whole [[environments-30](#environments-30)];
- through a real core, a spec-only spec package requested from the stand-in registry by `environment.request` exports its spec as a generated skill into the project's working folder's `.claude/skills/<org>-<pkg>/` and `.agents/skills/<org>-<pkg>/`, listed in its `.git/info/exclude`, its `<pkg>.md` byte-equal to the release's spec file [[environments-8](#environments-8)]; requested in your own group's environment, the same skill stands in the scratch user home's `.claude/skills/` [[environments-8](#environments-8)]; and after `environment.remove` and its install, the skill, its copy in the user home and its exclude line are gone [[environments-8](#environments-8)] [[environments-15](#environments-15)];
- through a real core, a project whose environment requests two skills from the stand-in registry and a path source in its working folder, once installed and rebound to a second working folder, broadcasts its state [[environments-17](#environments-17)] and has both skills in the second folder's `.claude/skills/` and the one the reader did not shadow in its `.agents/skills/`, each listed in its `.git/info/exclude`, with no environment command sent [[environments-31](#environments-31)]; the reader's folder under the other skill's name in `.agents/skills/` stays byte for byte [[environments-8](#environments-8)], the path source the second folder lacks has its skill in neither agent folder there [[environments-8](#environments-8)], and `environment.get` names that skill with `.agents/skills`, and that path source, as left out [[environments-14](#environments-14)]; once the reader's folder is moved away and the path source copied in, `environment.install` exports both there and the state names nothing left out [[environments-8](#environments-8)] [[environments-14](#environments-14)]; rebound to a third working folder while the registry spec package's installed files are gone, it installs them [[environments-7](#environments-7)] and exports both skills there with no environment command sent [[environments-31](#environments-31)], the state naming the path source the third folder lacks as left out [[environments-14](#environments-14)]; and rebound to a fourth whose path source states another version, so the lock is stale there, the state names nothing left out [[environments-14](#environments-14)].

#### environments-33

When an integration suite, through real cores on two scratch homes whose own groups' clones sync through the stand-in host, requests by path in your own group's environment a spec package kept in its clone, it shall assert:

- `environment.request` with a path below the clone's root resolves the folder's manifest, the lock holding the path and no files, and `environment.get` names the clone as the path root and the package installed [[environments-2](#environments-2)] [[environments-5](#environments-5)] [[environments-14](#environments-14)];
- the package's skill stands in the first home's user `.claude/skills/` and `.agents/skills/`, and an edit to its `SKILL.md` in the clone stands there after `environment.install` [[environments-7](#environments-7)] [[environments-8](#environments-8)]; a dry run of `environment.publish` with the same path previews that folder's release [[environments-17](#environments-17)];
- a file named `*.bak` then added to the folder fails the next `environment.install`, the state naming the path, the file and its reason and neither user folder's skill holding the file, and once it is removed an install clears the failure [[environments-32](#environments-32)] [[environments-14](#environments-14)];
- with your own group's spex repository paired with a Git working folder holding another release at the same path, `environment.get` still names the clone as the path root and the folder's `.claude/skills/` holds the skill with the clone's bytes [[environments-2](#environments-2)] [[environments-8](#environments-8)] [[environments-14](#environments-14)];
- the clone's root, a path leading out of it, a path under each first segment Spex keeps, a first segment `Sessions`, a folder named `*.tmp`, a folder reached through a link, a folder that is a Git repository of its own, a folder holding a file named `*.tmp`, one holding a `*.tmp` file Git was forced to track, one holding a Git repository of its own and one holding a link under `node_modules/` are each refused naming its reason, `spex.yaml` keeping its bytes [[environments-32](#environments-32)] [[environments-15](#environments-15)]; a folder holding a file Git tracks that this device's excludes match is accepted [[environments-32](#environments-32)];
- a path requested before its folder exists is accepted, and once the folder stands holding a file named `*.tmp`, `environment.resolve` fails, the state naming the path, the file and its reason, `spex.lock` keeping its bytes [[environments-32](#environments-32)] [[environments-5](#environments-5)];
- an otherwise valid folder holding a nonignored `node_modules/` that is a Git repository is refused while readable and while unreadable, the unreadable path named by `environment.request`, resolution and install, with the request, lock and previous exports unchanged; ignoring that subtree permits the same folder, while a genuinely absent source retains its missing-folder behavior [[environments-32](#environments-32)] [[environments-15](#environments-15)] [[environments-5](#environments-5)] [[environments-7](#environments-7)];
- once the second home's own group's clone syncs from the host, the folder, `spex.yaml` and `spex.lock` stand there, `environment.get` there names the package installed, and the skill stands in that home's user `.claude/skills/` and `.agents/skills/` with the bytes of the first home's edit [[environments-7](#environments-7)] [[environments-8](#environments-8)].

#### environments-23

When an integration suite starts a real core on a fresh scratch home with no registry reachable, it shall assert that the built-in spec package is seeded into the store, requested in your own group's environment and, at the working folder's root, in a new project's, every built-in playbook launches from it, and a core started with a newer built-in release seeds it beside the older without changing either lock [[environments-11](#environments-11)], each environment's state naming the newer release and the older its lock selects until `environment.resolve` moves that lock to the newer, and naming none for an environment whose lock selects the newer or whose request admits only the older [[environments-11](#environments-11)], and that a lock's checksum for the seeded release is that of the archive the seed packs to [[environments-11](#environments-11)], a lock recording another archive checksum with the same files' digests installing from the seed and one recording another digest for a file failing naming the spec package [[environments-7](#environments-7)].

#### environments-24

When an integration suite runs an authoring session that writes a spec package in a working folder, compiles its playbook, requests it by path, enables it and starts a session with it, then publishes it to the stand-in registry and requests the published version from a second scratch home, it shall assert each step's outcome and that the published release equals the folder's declared files [[environments-10](#environments-10)] [[environments-15](#environments-15)] [[environments-12](#environments-12)], none of them under a `.slc/` or `.slc-verify/` placed in the playbook's folder, in the preview or at the registry [[environments-1](#environments-1)], its manifest carrying a `description` and a `license`, while a dry run of the folder with `license` taken out of its `meta.yaml` was refused naming the field with nothing reaching the registry [[environments-10](#environments-10)] [[environments-17](#environments-17)].

#### environments-25

When an integration suite drives the environment commands over the protocol, it shall assert each command's reply and refusal of the table, the `environment.state` broadcast after resolve, install and a sync-applied lock, and `environment.get` carrying every field the surface lists [[environments-17](#environments-17)] [[environments-14](#environments-14)] [[environments-15](#environments-15)]:

- with a resolution held at the registry, a second request is admitted and written beside the first, the final lock resolves both, the state reads busy until the last operation ends, and the overtaken resolution, once released after the second installed both, writes no lock and records no failure, the state reading both installed with no error [[environments-15](#environments-15)] [[environments-5](#environments-5)] [[environments-14](#environments-14)];
- with `environment.resolve` held at the registry and `spex.lock` rewritten by hand, `spex.yaml` unchanged, the rewritten lock stands and no failure is recorded, while a resolution the enabling path awaits, held and overtaken the same way, is refused `conflict` naming `spex.lock` [[environments-5](#environments-5)];
- a resolution held at the registry while `spex.yaml` changes, and failing there once released after a later resolution succeeded, records no failure, the later outcome standing; and one finding no solution once released after a later request's resolution failed leaves that later failure standing [[environments-5](#environments-5)];
- a clone whose lock and installed files are removed, sent `environment.resolve`, resolves from its current files and installs again [[environments-5](#environments-5)];
- an operation held while its clone is renamed and the store and environment follow the move reads busy at the new address, and its end is announced there with busy cleared and no failure recorded, nothing written at the old [[environments-14](#environments-14)] [[environments-5](#environments-5)];
- once the core stops, a request and an install awaited by the enabling path are refused `aborted` with `spex.yaml` unchanged [[environments-15](#environments-15)];
- a conflict report reads while `spex.yaml` holds the bytes its resolution read and no longer after the file changes [[environments-14](#environments-14)];
- with Git sources inside and outside the stand-in instance, replies and broadcasts carry display summaries before and after the origin is reported, with no backing storage locator and no embedded HTTP(S) user, and no extra host read for presentation [[environments-29](#environments-29)]; an actual instance-source install fetches the locked commit while the authored request, lock and installed bytes retain their transport and content [[environments-13](#environments-13)] [[environments-29](#environments-29)]; missing revisions, invalid releases, conflicting requirements and refused transports read safely both in state and through an awaited operation [[environments-29](#environments-29)].

#### environments-28

When an integration suite asks the stand-in registry [[environments-18](#environments-18)] for the orgs a person may publish to, it shall assert that one request presenting the app token the orgs are scripted for reads them sorted by name, and that another token, no token, an outage, and an answer delayed a second past the timeout each read as no answer, the last once two seconds have passed [[environments-27](#environments-27)].

#### environments-34

When an integration suite, through a real core on a scratch home signed in to two stand-in instances over one stand-in Git backend, each answered by a stand-in registry of its own [[environments-18](#environments-18)], the first the home's default instance, and on a second scratch home signed in only to a third stand-in instance that the first's registry also answers, drives the environments of a project at the second instance and of a local-only project, it shall assert:

- the second's project resolves at the second's registry with the second's token, its lock recording the second's origin, and installs from it, and the local-only project resolves at the first's [[environments-5](#environments-5)] [[environments-12](#environments-12)] [[environments-3](#environments-3)] [[environments-7](#environments-7)];
- a lock recording the first's origin for a release the second's registry also holds at that version and checksum, resolved again in the second's project, keeps the first's origin [[environments-5](#environments-5)];
- a new project paired at the second instance, and a local-only project picked there, has the built-in spec package locked at the second's origin [[environments-11](#environments-11)] [[environments-3](#environments-3)];
- the second's project installs a public release its lock records at the first's origin, which the second's registry lacks, from the first's [[environments-7](#environments-7)]; and on the second home, a local-only project whose lock records a private release at the first's origin installs it through the third instance with its token, the first's registry refusing it without one, and with the third signed out fails naming the spec package [[environments-7](#environments-7)] [[environments-12](#environments-12)];
- `environment.search` for the second's project lists the second's registry's spec packages and not the first's [[environments-17](#environments-17)];
- a Git source at the shared Git backend's origin, requested in the second's project, is fetched with the credential the second instance brokers, and its source reads as the second's display name [[environments-13](#environments-13)] [[environments-29](#environments-29)];
- the orgs asked of the second's registry are read with the second's token [[environments-27](#environments-27)];
- a publish from the second's project lands at the second's registry and one from the local-only project at the first's, and once the second is signed out, a publish from its project is refused as not signed in there [[environments-10](#environments-10)] [[environments-17](#environments-17)];
- with the first's registry answering `token_revoked` to the first's tokens, a resolution in the local-only project signs the first instance alone out, the second staying signed in and its project's resolution and install succeeding [[environments-12](#environments-12)];
- with the first signed out and your own group's own repository following the second by its remote, a start finding your own group's `spex.yaml` and `spex.lock` gone requests the built-in spec package there, its lock recording the second's origin [[environments-11](#environments-11)];
- the first then forgotten, your own group's environment, whose own repository was created at the first and now syncs with the second, resolves at the second's registry, its lock recording the second's origin, and a publish from it lands there [[environments-5](#environments-5)] [[environments-10](#environments-10)].

## References

[1]: https://agentskills.io/specification "Agent Skills specification"
[2]: https://semver.org/spec/v2.0.0.html "Semantic Versioning 2.0.0"
[3]: https://www.rfc-editor.org/rfc/rfc5646 "BCP 47: Tags for Identifying Languages (RFC 5646)"
[4]: https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file "Naming Files, Paths, and Namespaces"
[5]: https://github.com/sublang-ai/cligent/blob/v0.36.0/specs/packages/skills.md#skills-11 "Cligent skills-11: native-skill support per adapter"
