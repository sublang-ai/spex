<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# cli: The spex Command Line

## Intent

This package defines the package commands of the published `spex` executable under [DR-165](../decisions/165-one-package-manager-hosted-by-the-cli-and-the-app.md): the environment of the current folder read and changed with `add`, `remove`, `install`, `update`, `list` and `search`, a package built with `export` from the project's own files and published with `publish`, and a device independently signed in to a package registry or Space with `login`, `logout` and `whoami` ([DR-168](../decisions/168-independent-package-registry.md)).
The commands run the same package-manager library the app's core hosts, on the home `SPEX_HOME` names or `~/.spex` [[storage-1](storage.md#storage-1)], and need no running app.
They are a project's Packages tab without an app, verb for verb, in the same words ([DR-172](../decisions/172-surfaces-a-fresh-user-reads.md)).
Scaffolding and linting keep their own contracts.

## External Behavior

### Usage

#### cli-21

When `spex` is asked for its usage, a command's help or its version, the CLI shall print what was asked on standard output and exit `0`, reading and writing no environment ([DR-172](../decisions/172-surfaces-a-fresh-user-reads.md)):

| Asked | Printed |
| --- | --- |
| `spex` alone, or `spex --help` | the usage below, each command under its heading with its one-line intent |
| `spex <command> --help`, for every command of the usage | that command's lines of the usage and every option it takes |
| `spex --version` | the version of the installed `@sublang/spex` |

```text
Usage: spex <command> [options]

Packages in this folder (spex.yaml, spex.lock, .spex/)
  add <org>/<pkg>[@<version>]      Add a package (newest by default)
  add <org>/<pkg> --path <folder>  Add a package from a folder in this project
  remove, rm <org>/<pkg>           Remove a package
  install, i                       Install what spex.lock records
  update                           Update to the newest versions spex.yaml allows
  list, ls                         What is added, installed, and placed for your agents
  search <query>                   Find packages at the registry

Your packages
  export <org>/<pkg> [--spec <file>] [--skill <folder>]…   Build it in spex-packages/<org>/<pkg>/ from your files
  publish [<org>/<pkg>] [--dry-run]                         Publish it to the registry

Sign-in
  login [--registry <url> | --space <url>]              Sign in with a code in your browser
  logout [--registry <url> | --space <url>]             Sign out
  whoami [--registry <url> | --space <url>]             Who you are signed in as, and where

Specs
  scaffold [<path> | --update]                          Start specs/ and point your agents at it
  lint [<path>]                                         Check specs/ for structure, IDs and citations

spex --version · spex <command> --help · Home: $SPEX_HOME or ~/.spex
```

### The folder and the home

#### cli-1

When a package command runs, the CLI shall act on the environment whose root is the nearest folder, the current one included, holding `spex.yaml`, else the top level of the Git work tree the current folder lies in, else the current folder, reading and writing its files where they live [[environments-26](environments.md#environments-26)] and starting, finding or needing no core ([DR-165](../decisions/165-one-package-manager-hosted-by-the-cli-and-the-app.md)):

- the environment's instance is the `space` its `spex.yaml` names, else the home's default instance [[environments-2](environments.md#environments-2)], independently of its selected registry [[environments-38](environments.md#environments-38)];
- the home is created where it is missing, with nothing in it but what the command writes; no clone, lease or record of the home is read or written.

### The environment

#### cli-2

When `spex add <org>/<pkg>[@<version>]` or `spex add <org>/<pkg> --path <folder>` runs, the CLI shall write the request into `spex.yaml` [[environments-15](environments.md#environments-15)], made explicitly naming the public registry as `registry` where the root holds none [[environments-2](environments.md#environments-2)] — a registry request at the version requirement given, else a caret requirement at the newest version the registry lists that is no prerelease and is neither yanked nor suppressed, or a path request at `<folder>` relative to the root — then resolve, install and place [[environments-5](environments.md#environments-5)] [[environments-7](environments.md#environments-7)] [[environments-8](environments.md#environments-8)], and print each package the lock gained or moved with its version and where its placements went, a provided spec's line as [[cli-6](#cli-6)] reads it:

- a name that is not `<org>/<pkg>`, a malformed version requirement, a version and a path together, a path leading out of the root, a folder holding no `meta.yaml` of that package, and a package the registry does not list to this device each refuse the command before any write, naming the rule and what to do, the last as [[cli-13](#cli-13)] words it.

#### cli-3

When `spex remove <org>/<pkg>` or its alias `spex rm` runs, the CLI shall drop the request from `spex.yaml` [[environments-15](environments.md#environments-15)], resolve, install and place [[environments-5](environments.md#environments-5)] [[environments-7](environments.md#environments-7)] [[environments-8](environments.md#environments-8)], and print each package the lock lost, refusing before any write a name `spex.yaml` does not request and the built-in package [[environments-11](environments.md#environments-11)], the latter with "sublang/playbooks comes with Spex".

#### cli-4

When `spex install` or its alias `spex i` runs, the CLI shall install the lock [[environments-7](environments.md#environments-7)] and place [[environments-8](environments.md#environments-8)], resolving first [[environments-5](environments.md#environments-5)] where the lock is missing or stale, and print each package installed with its version, what was placed for your agents and into `specs/` — beneath the package, a provided spec's line as [[cli-6](#cli-6)] reads it — and what was left out:

- a root holding no `spex.yaml` is refused naming the folder and `spex add`;
- a lock installing as it stands resolves nothing and rewrites no file;
- the app's built-in package that no seed and no registry serves is left out as not installed and marked `built in`, the rest installed [[environments-7](environments.md#environments-7)].

#### cli-5

When `spex update` runs, the CLI shall resolve again from `spex.yaml` [[environments-5](environments.md#environments-5)], install and place [[environments-7](environments.md#environments-7)] [[environments-8](environments.md#environments-8)], and print each package whose version moved, with both versions and, beneath it, a provided spec's line as [[cli-6](#cli-6)] reads it, or that nothing moved.

#### cli-6

When `spex list` or its alias `spex ls` runs, the CLI shall print the environment as its files stand [[environments-14](environments.md#environments-14)], in the words of a project's Packages tab ([DR-172](../decisions/172-surfaces-a-fresh-user-reads.md)):

| Part | Printed |
| --- | --- |
| head | `Folder <root>` and `Registry <registry>`, the environment's registry named as [[cli-22](#cli-22)] names it |
| `Added` | each request with its version requirement or folder |
| `Installed` | each package of the lock with its version, its source — `from the registry`, `from folder <path>`, `from Git <repository> at <rev>` or `built in` — the packages requiring it, and `installed`, `not installed` or `files missing`; beneath a package providing a spec, its placement [[environments-41](environments.md#environments-41)] as `spec in specs/packages/<pkg>.md`, `spec edited in specs/ — left as yours`, `, <version> waiting` appended where a newer release waits, `spec not placed — specs/ holds <pkg>.md already` or `spec needs specs/ — spex scaffold`, then one line `<n> links wait for <org>/<pkg> — spex add <org>/<pkg>`, `1 link waits` for one, per package its links wait for |
| `Skills for agents` | each placed skill with the agent folders it is placed in, or `not placed` with why |
| a root holding neither `spex.yaml` nor `spex.lock` | the one line `No packages in <root> yet — spex add <org>/<pkg>` |

- a last line says what to do where the lock is missing, `Not installed yet — spex install`, where it is stale, what changed with `spex update`, a folder package's `meta.yaml` that cannot be read named to fix first, and where a package an install places is not installed, `Not installed yet — spex install`.

#### cli-7

When `spex search <query>` runs, the CLI shall ask the environment's registry, presenting the selected registry grant as resolving does [[environments-12](environments.md#environments-12)], for the packages matching the query and print each package found with its description and versions, newest first.

### A package of your own

#### cli-23

When `spex export <org>/<pkg>` runs — `--spec <file>` and `--skill <folder>`, once or more, naming the project's own files on a first export and wherever an artifact is added, and optionally `--language <tag>`, `--description <text>` and `--license <id>` — the CLI shall build `spex-packages/<org>/<pkg>/` under the root as a release folder [[environments-1](environments.md#environments-1)] from those files by copying, so the project's files stay where they are, requesting nothing from the environment ([DR-174](../decisions/174-what-a-package-provides-is-placed.md)):

| Written | Content |
| --- | --- |
| `meta.yaml` | on a first export, `format: 2`, `org`, `name`, `version: 0.1.0`, `description`, `license`, `provides` listing the kinds given, and under `artifacts` each skill as `{kind: skill, language}` under its id and the spec as `{kind: spec, language}` under `<pkg>`; afterwards kept as the author left it, gaining an entry per artifact a flag adds |
| `README.md` | a heading naming `<org>/<pkg>` and the description, on a first export |
| `LICENSE` | the root's `LICENSE`, copied where the root holds one, on a first export |
| `skills/<language>/<id>/` | each skill folder's regular files and folders, copied, under the `name` its `SKILL.md` frontmatter declares when read as a release's [[environments-1](environments.md#environments-1)] |
| `specs/<language>/<pkg>.md` | the spec file with its citations rewritten for the release [[environments-42](environments.md#environments-42)] |

- without flags, each artifact the manifest names is refreshed from the project by identity — the spec `<pkg>.md` wherever it stands under `specs/`, a skill from an agent folder of the root [[environments-8](environments.md#environments-8)] holding a folder of its name that no placement wrote — a playbook's folder left as it is and an artifact found nowhere reported and left as it was;
- `<language>` is `--language`, else `en`; the description is `--description`, else the first skill's `SKILL.md` `description`, else the spec's first paragraph under its Intent heading; the license is `--license`, else `Apache-2.0` where the root's `LICENSE` begins with "Apache License" past a byte order mark and whitespace, `MIT` where it begins with "MIT License", else `Apache-2.0`;
- refused before anything is written, naming the rule: a name that is not `<org>/<pkg>` in lowercase kebab-case of at most 64 characters each; a first export naming no artifact; a folder whose `meta.yaml` names another package; a skill folder without a `SKILL.md` whose `name` is an Agent Skills name, two skills of one id, or a skill of the spec's id `<pkg>`; a spec file whose basename is not `<pkg>.md`; a skill folder holding a link or a special file; no description from any source;
- each citation the rewrite removed or reduced is printed as a warning naming the item and the target, and the command ends naming the folder, what it holds, and the next steps: `spex publish <org>/<pkg> --dry-run` and `spex publish <org>/<pkg>`.

#### cli-9

When `spex publish [<org>/<pkg>] [--dry-run]` runs, the CLI shall publish the package's folder — the folder of the environment's path request for that name where it has one, else `spex-packages/<org>/<pkg>/` under the root, and with no name the one package folder under `spex-packages/` — to the environment's registry as the account signed in for its selected registry purpose [[environments-10](environments.md#environments-10)], printing `Publishing <org>/<pkg>@<version> to <registry>`, the registry named as [[cli-22](#cli-22)] names it, with a dry run listing the declared files and publishing nothing, and a publish printing the package's page at the registry, `<origin>/<org>/<pkg>`:

- refused before anything is published, naming the rule: no folder found; a folder whose `meta.yaml` names another package; a folder that is no release; a `meta.yaml` without `description` or `license`; no name given while `spex-packages/` holds no package or several, those listed; the device not signed in for the environment's selected registry purpose, naming `spex login`.

### A device at a service

#### cli-10

When `spex login [--registry <url> | --space <url>] [--force]` runs, the CLI shall sign this device in by the device flow at the selected service and purpose [[git-host-31](git-host.md#git-host-31)], defaulting to the environment's package origin [[environments-38](environments.md#environments-38)] with registry purpose, printing the verification URL and code and waiting for confirmation, denial or expiry [[git-host-3](git-host.md#git-host-3)] ([DR-168](../decisions/168-independent-package-registry.md)):

- both flags together are refused before any write or network request;
- registry login reads the public descriptor [[environments-39](environments.md#environments-39)], stores only its registry credential and records no Space;
- explicit Space login keeps the instance account/default registration and same-account admission rules [[storage-2](storage.md#storage-2)];
- an existing selected credential is reported without replacement unless `--force`; a failed flow preserves its prior credential, and a replaced credential is revoked after successful replacement.

#### cli-11

When `spex logout [--registry <url> | --space <url>]` runs, the CLI shall revoke and remove only the selected purpose's credential [[git-host-31](git-host.md#git-host-31)], defaulting to the environment's package origin with registry purpose [[environments-38](environments.md#environments-38)], marking `home.yaml` signed out only for an explicit Space logout [[storage-2](storage.md#storage-2)], and refusing both flags together before any request ([DR-168](../decisions/168-independent-package-registry.md)).

#### cli-12

When `spex whoami [--registry <url> | --space <url>]` runs, the CLI shall print, without secrets, one line for the environment's registry [[environments-38](environments.md#environments-38)] and one for each Space the home lists [[storage-2](storage.md#storage-2)] — or, with a flag, the selected service's line alone — each its kind, its name as [[cli-22](#cli-22)] names it and `@<login>` or `signed out`, the home's default Space marked `(default)`, reading registry identity from its account API and Space identity from its home entry, and refusing both flags together ([DR-168](../decisions/168-independent-package-registry.md), [DR-172](../decisions/172-surfaces-a-fresh-user-reads.md)):

```text
Registry  Spex Space  @me
Space     Spex Space  @me (default)
```

### Output

#### cli-22

Where a package command names a registry or a Space in what it prints, the CLI shall name a registry by the display name its descriptor gives [[environments-39](environments.md#environments-39)], never by a Space entry of the home at its origin, and a Space by the display name its home entry holds [[storage-2](storage.md#storage-2)], each by its origin's host where no display name is known ([DR-168](../decisions/168-independent-package-registry.md), [DR-172](../decisions/172-surfaces-a-fresh-user-reads.md)).

#### cli-13

When a package command ends, the CLI shall exit `0` only on its success, `1` on a refusal or failure with the cause on standard error, and `130` on an interrupt, printing no token or code of an app token at any time:

- an interrupted install or publish leaves the last files standing [[environments-7](environments.md#environments-7)], the interrupt promising no rollback of an upload the registry already took;
- a cause is one phrase in the usage's words, never a runtime's or a library's own text, naming the registry or Space as [[cli-22](#cli-22)] does and a file by its name, and ends in what to do where there is something to do ([DR-172](../decisions/172-surfaces-a-fresh-user-reads.md)), as in these cases:

| Case | Cause |
| --- | --- |
| the registry lists no `<org>/<pkg>` to a device signed out there | `<org>/<pkg>: not at <registry>, or private — spex login, then retry` |
| the registry lists no `<org>/<pkg>` to a device signed out of the Space whose sign-in a `spex.yaml` naming no `registry` reads with [[environments-38](environments.md#environments-38)] | `<org>/<pkg>: not at <registry>, or private — spex login --space <origin>, then retry` |
| the registry lists no `<org>/<pkg>` to the account signed in there | `<org>/<pkg>: not at <registry>, or not shared with @<login> — check the name, or ask its owner` |
| the registry refuses the account a read of `<org>/<pkg>` (403) | `<org>/<pkg>: not shared with @<login> at <registry> — ask its owner` |
| the registry refuses the account a publish to `<org>` (403) | `<org> is not yours at <registry> — claim it at <origin>/account/orgs` |
| the registry finds the sign-in expired (401) | `sign-in expired at <registry> — spex login` |
| the registry cannot be reached | `<registry> could not be reached — check the connection, then retry` |
| `spex.lock` is of a format newer than this Spex reads | `spex.lock is from a newer Spex — update Spex` |
| `spex.lock` cannot be read | `spex.lock cannot be read: <cause> — spex update rewrites it` |
| `spex.lock` names a package's registry by no address | `<org>/<pkg>: spex.lock names no registry address for it — spex update writes spex.lock again` |
| a folder package's folder is missing | `<org>/<pkg>: no folder at <path> — fix its path in spex.yaml, or spex remove <org>/<pkg>` |

## Internal Behavior

#### cli-14

The published `@sublang/spex` package shall export the package-manager library — the format, requests and lock, resolution, the store and installs, placement, the registry client and stand-in registry, publishing, the sign-in client with its credential store and the home's instance entries — as its own modules, which the core imports from the workspace, so one implementation serves the command line and the app ([DR-165](../decisions/165-one-package-manager-hosted-by-the-cli-and-the-app.md)):

- the library depends on no agent SDK and on no Cligent, Playbook or compiler package;
- beside the library, its exports keep the scaffold's files resolvable by name, as `@sublang/spex/scaffold/<path>`;
- the CLI prepares no playbook artifact to run on an engine, which the app does at its installs and uses [[environments-7](environments.md#environments-7)].

## Verification

#### cli-15

When the packed CLI, installed into a scratch prefix from `npm pack`, runs with a scratch home against the library's stand-in registry in a scratch Git working folder holding a scaffolded `specs/`, with no core running, the integration suite shall assert:

- `spex --help` prints the usage as [[cli-21](#cli-21)] writes it, `spex add --help` and `spex scaffold --help` print that command's lines and options, and `spex --version` prints the installed version, each exiting `0` and writing nothing [[cli-21](#cli-21)];
- `spex export acme/hello --skill .claude/skills/greet --spec specs/packages/hello.md` writes `spex-packages/acme/hello/` with its `meta.yaml` carrying `provides: [skill, spec]`, README, LICENSE, skill and spec — the spec's citation of an installed package's spec written as an address and its citation of another project spec removed with a warning naming both — writes no request, leaves the project's two files as they were, and ends naming the folder and the two publish commands; a second `spex export acme/hello` after an edit to the project's spec refreshes the release's copy; a project spec holding CRLF line endings is written into its release with LF; each refusal of the list writes nothing [[cli-23](#cli-23)];
- `spex add demo/tool@^1.0.0` and `spex add demo/other` from the stand-in registry write the requirement given and `^` at the newest listed non-prerelease version, resolve, install under `.spex/packages/` and place, with `.spex/.gitignore` ignoring everything and `.gitattributes` pinning `spex.yaml`, `spex.lock` and `specs/packages/*.md` to LF, and each refusal of the list writes nothing [[cli-2](#cli-2)]; `spex add demo/spec`, a package providing a spec citing `demo/other` and `demo/absent` by address, prints its spec placed at `specs/packages/spec.md` with the one link to `demo/other` relative and `1 link waits for demo/absent — spex add demo/absent` [[cli-2](#cli-2)];
- `spex list` heads with `Folder` and `Registry` naming the stand-in registry's display name, lists both requests under `Added`, each package under `Installed` with its version, `from the registry` and `installed`, `demo/spec` with `spec in specs/packages/spec.md` and its waiting line, then `spec edited in specs/ — left as yours` after a hand edit, each placed skill under `Skills for agents` with its folders, a stale lock last with what changed and `spex update`, the committed files alone last with `Not installed yet — spex install`, and, in a folder holding neither file, prints `No packages in <folder> yet — spex add <org>/<pkg>` alone [[cli-6](#cli-6)]; `spex search tool` lists the registry's match with its versions newest first [[cli-7](#cli-7)];
- in a second clone of the committed `spex.yaml`, `spex.lock`, placed spec and `.gitattributes`, made by a Git converting line endings, each of the four checked out with LF, `spex install` resolves nothing, reads the committed copy as the package's, rewrites nothing in `specs/` and yields byte-identical `.spex/packages/` and skills, and a second `spex install` rewrites nothing; with `spex.yaml` alone beside a `.gitattributes` line of the reader's, it resolves first, appends the three LF rules beneath that line and places no spec where `specs/` is missing, naming `spex scaffold`; with neither, it is refused naming `spex add` [[cli-4](#cli-4)];
- a lock recording the app's built-in package at a checksum no registry serves installs the rest and marks the built-in `built in`, and `spex list` reads it `built in` and `not installed` [[cli-4](#cli-4)] [[cli-6](#cli-6)];
- once the registry publishes `demo/tool` 1.1.0, `spex update` moves the lock and prints both versions, and prints that nothing moved when run again [[cli-5](#cli-5)];
- after a hand edit to `demo/spec`'s placed copy, `spex install` prints `spec edited in specs/ — left as yours` beneath `demo/spec` [[cli-4](#cli-4)], and once the registry publishes `demo/spec` 1.1.0, `spex update` prints `demo/spec` with both versions and, beneath it, `spec edited in specs/ — left as yours, 1.1.0 waiting` [[cli-5](#cli-5)];
- `spex remove demo/other` drops the request, the files and the placement and prints the loss, a name not requested refused, and `spex remove sublang/playbooks` is refused with "sublang/playbooks comes with Spex" and nothing written [[cli-3](#cli-3)];
- the environment root is found from a subfolder of the working folder, and from a working folder without `spex.yaml` at its Git top level [[cli-1](#cli-1)].

#### cli-16

When the packed CLI runs `publish` against the stand-in registry the folder's `spex.yaml` names, the home holding a Space entry of another display name at its origin, the integration suite shall assert that `--dry-run` prints `Publishing acme/hello@0.1.0 to` the registry's own display name [[cli-22](#cli-22)] and the declared files and publishes nothing, that a publish lands the release there and prints the package's page at the registry, that with no name and one package under `spex-packages/` the same package publishes, and that no folder, another package's `meta.yaml`, a missing license, two packages with no name and a device signed out there are each refused with nothing published [[cli-9](#cli-9)].

#### cli-17

When the real CLI runs `login`, `whoami` and `logout` against a scoped service fixture at one origin, the integration suite shall assert registry login by default, explicit Space login preserving the other grant, mutually exclusive target flags refused, an existing credential reported unless forced, no Space registration from registry login [[cli-10](#cli-10)], `whoami` printing the registry's line and each Space's by display name with `@<login>` or `signed out` and the default Space marked, and a flag's line alone, without secrets [[cli-12](#cli-12)] [[cli-22](#cli-22)], and registry logout preserving the Space credential and home entry [[cli-11](#cli-11)].

#### cli-18

When the packed CLI's commands end in success, refusal and interrupt, the integration suite shall assert the exit codes `0`, `1` and `130`, the cause on standard error, no token in any output, each case of the causes table printing its phrase against a stand-in registry answering it — a private package to a device signed out and signed in, at `add`, `install` and `update`, and to a device signed out of the Space a `spex.yaml` naming no `registry` reads with, a refused read, a refused publish, an expired sign-in, an unreachable registry, a `spex.lock` of a newer format, one that cannot be read and one naming a registry by no address, and a folder package's missing folder — and that an install interrupted mid-download leaves the previous files and lock standing [[cli-13](#cli-13)].

#### cli-19

When the package-build integration inspects the packed `@sublang/spex`, it shall assert that its dependencies name no agent SDK, no Cligent, no Playbook and no compiler package, that the scaffold's `specs/meta.md` and `i18n/zh/specs/meta.md` resolve by name from the installed package, that the core's sources import the library from the workspace package and hold no copy of its modules, and that the CLI's install of a playbook artifact leaves its folder without engine links [[cli-14](#cli-14)].

#### cli-20

When the real CLI runs against a scoped HTTP fixture, the integration suite shall verify the public registry named in a new `spex.yaml`, preserved legacy destinations [[cli-2](#cli-2)], independent registry and Space login with mutually exclusive flags [[cli-10](#cli-10)], purpose-specific whoami [[cli-12](#cli-12)] and logout preserving the other purpose [[cli-11](#cli-11)].
