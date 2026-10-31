<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# cli: The spex Command Line

## Intent

This package defines the package commands of the published `spex` executable under [DR-165](../decisions/165-one-package-manager-hosted-by-the-cli-and-the-app.md): the environment of the current folder read and changed with `add`, `remove`, `install`, `update`, `list` and `search`, a package made with `new` and published with `publish`, and a device signed in at a Space with `login`, `logout` and `whoami`.
The commands run the same package-manager library the app's core hosts, on the home `SPEX_HOME` names or `~/.spex` [[storage-1](storage.md#storage-1)], and need no running app.
Scaffolding and linting keep their own contracts.

## External Behavior

### The folder and the home

#### cli-1

When a package command runs, the CLI shall act on the environment whose root is the nearest folder, the current one included, holding `spex.yaml`, else the top level of the Git work tree the current folder lies in, else the current folder, reading and writing its files where they live [[environments-26](environments.md#environments-26)] and starting, finding or needing no core ([DR-165](../decisions/165-one-package-manager-hosted-by-the-cli-and-the-app.md)):

- the environment's instance is the `space` its `spex.yaml` names, else the home's default instance [[environments-2](environments.md#environments-2)], independently of its selected registry [[environments-38](environments.md#environments-38)];
- the home is created where it is missing, with nothing in it but what the command writes; no clone, lease or record of the home is read or written;
- `--help` names every command and `scaffold` and `lint` run as before.

### The environment

#### cli-2

When `spex add <org>/<pkg>[@<requirement>]` or `spex add <org>/<pkg> --path <folder>` runs, the CLI shall write the request into `spex.yaml` [[environments-15](environments.md#environments-15)], made explicitly naming the public registry as `registry` where the root holds none [[environments-2](environments.md#environments-2)] — a registry request at the requirement given, else a caret requirement at the newest version the registry lists that is no prerelease and is neither yanked nor suppressed, or a path request at `<folder>` relative to the root — then resolve, install and export [[environments-5](environments.md#environments-5)] [[environments-7](environments.md#environments-7)] [[environments-8](environments.md#environments-8)], and print each spec package the lock gained or moved with its version and where its exports went:

- a name that is not `<org>/<pkg>`, a malformed requirement, a requirement and a path together, a path leading out of the root, and a spec package the registry does not list each refuse the command before any write, naming the rule.

#### cli-3

When `spex remove <org>/<pkg>` or its alias `spex rm` runs, the CLI shall drop the request from `spex.yaml` [[environments-15](environments.md#environments-15)], resolve, install and export [[environments-5](environments.md#environments-5)] [[environments-7](environments.md#environments-7)] [[environments-8](environments.md#environments-8)], and print each spec package the lock lost, a name `spex.yaml` does not request refused before any write.

#### cli-4

When `spex install` or its alias `spex i` runs, the CLI shall install the lock [[environments-7](environments.md#environments-7)] and export [[environments-8](environments.md#environments-8)], resolving first [[environments-5](environments.md#environments-5)] where the lock is missing or stale, and print each spec package installed with its version, each export written and what the export left out:

- a root holding no `spex.yaml` is refused naming the folder and `spex add`;
- a lock installing as it stands resolves nothing and rewrites no file;
- the app's built-in spec package that no seed and no registry serves is left out as not installed and named as the app's, the rest installed [[environments-7](environments.md#environments-7)].

#### cli-5

When `spex update` runs, the CLI shall resolve again from `spex.yaml` [[environments-5](environments.md#environments-5)], install and export [[environments-7](environments.md#environments-7)] [[environments-8](environments.md#environments-8)], and print each spec package whose version moved, with both versions, or that nothing moved.

#### cli-6

When `spex list` or its alias `spex ls` runs, the CLI shall print the environment as its files stand [[environments-14](environments.md#environments-14)]: its instance; each request with its source and requirement; each spec package of the lock with its version, its source, who required it and whether its files are installed as the lock records them; each exported skill with its folders; what the last export left out; and that the lock is missing or stale, where it is.

#### cli-7

When `spex search <query>` runs, the CLI shall ask the environment's registry, presenting the selected registry grant as resolving does [[environments-12](environments.md#environments-12)], for the spec packages matching the query and print each spec package found with its description and versions, newest first.

### A package of your own

#### cli-8

When `spex new <org>/<pkg>` runs with `--skill <folder>` once or more and/or `--spec <file>`, and optionally `--language <tag>`, `--description <text>`, `--license <id>` and `--move`, the CLI shall make `spex-packages/<org>/<pkg>/` under the root as a release folder [[environments-1](environments.md#environments-1)] holding the artifacts named, then request it by path and install it as `spex add --path` does [[cli-2](#cli-2)], so its skills reach the folder's agents at once ([DR-165](../decisions/165-one-package-manager-hosted-by-the-cli-and-the-app.md)):

| Written | Content |
| --- | --- |
| `meta.yaml` | `format: 2`, `org`, `name`, `version: 0.1.0`, `description`, `license`, and under `artifacts` each skill as `{kind: skill, language}` under its id and the spec as `{kind: spec, language}` under `<pkg>` |
| `README.md` | a heading naming `<org>/<pkg>` and the description |
| `LICENSE` | the root's `LICENSE`, copied where the root holds one |
| `skills/<language>/<id>/` | each `--skill` folder's regular files and folders, copied, or moved with `--move`, under the `name` its `SKILL.md` frontmatter declares when read as a release's [[environments-1](environments.md#environments-1)] |
| `specs/<language>/<pkg>.md` | the `--spec` file, copied |

- `<language>` is `--language`, else `en`; the description is `--description`, else the first skill's `SKILL.md` `description`, else the spec's first paragraph under its Intent heading; the license is `--license`, else `Apache-2.0` where the root's `LICENSE` begins with "Apache License" past a byte order mark and whitespace, `MIT` where it begins with "MIT License", else `Apache-2.0`;
- refused before anything is written, naming the rule: a name that is not `<org>/<pkg>` in lowercase kebab-case of at most 64 characters each; no artifact named; an existing `spex-packages/<org>/<pkg>/`; a skill folder without a `SKILL.md` whose `name` is an Agent Skills name, two skills of one id, or a skill of the spec's id `<pkg>`; a spec file whose basename is not `<pkg>.md`; a skill folder holding a link or a special file, or, with `--move`, the destination; no description from any source;
- the command ends naming the folder, that a skill moved from an agent folder now stands there as Spex's export, and the next steps: edit the folder, then `spex publish <org>/<pkg> --dry-run` and `spex publish <org>/<pkg>`.

#### cli-9

When `spex publish [<org>/<pkg>] [--dry-run]` runs, the CLI shall publish the package's folder — the folder of the environment's path request for that name where it has one, else `spex-packages/<org>/<pkg>/` under the root, and with no name the one package folder under `spex-packages/` — to the environment's registry as the account signed in for its selected registry purpose [[environments-10](environments.md#environments-10)], printing the destination as the instance's name and `<org>/<pkg>@<version>`, with a dry run listing the declared files and uploading nothing, and a publish printing the package's page at the instance, `<origin>/<org>/<pkg>`:

- refused before any upload, naming the rule: no folder found; a folder whose `meta.yaml` names another package; a folder that is no release; a manifest without `description` or `license`; no name given while `spex-packages/` holds no package or several, those listed; the device not signed in for the environment's selected registry purpose, naming `spex login`.

### A device at a service

#### cli-10

When `spex login [--registry <origin> | --space <origin>] [--force]` runs, the CLI shall sign this device in by the device flow at the selected service and purpose [[git-host-31](git-host.md#git-host-31)], defaulting to the environment's package origin [[environments-38](environments.md#environments-38)] with registry purpose, printing the verification URL and code and waiting for confirmation, denial or expiry [[git-host-3](git-host.md#git-host-3)] ([DR-168](../decisions/168-independent-package-registry.md)):

- both flags together are refused before any write or network request;
- registry login reads the public descriptor [[environments-39](environments.md#environments-39)], stores only its registry credential and records no Space;
- explicit Space login keeps the instance account/default registration and same-account admission rules [[storage-2](storage.md#storage-2)];
- an existing selected credential is reported without replacement unless `--force`; a failed flow preserves its prior credential, and a replaced credential is revoked after successful replacement.

#### cli-11

When `spex logout [--registry <origin> | --space <origin>]` runs, the CLI shall revoke and remove only the selected purpose's credential [[git-host-31](git-host.md#git-host-31)], defaulting to the environment's package origin with registry purpose [[environments-38](environments.md#environments-38)], marking `home.yaml` signed out only for an explicit Space logout [[storage-2](storage.md#storage-2)], and refusing both flags together before any request ([DR-168](../decisions/168-independent-package-registry.md)).

#### cli-12

When `spex whoami [--registry <origin> | --space <origin>]` runs, the CLI shall report the selected purpose's sign-in without printing secrets, defaulting to the environment's package origin with registry purpose [[environments-38](environments.md#environments-38)], reading registry identity from its account API and explicit Space identity from its existing home entry, and refusing both flags together ([DR-168](../decisions/168-independent-package-registry.md)).

#### cli-13

When a package command ends, the CLI shall exit `0` only on its success, `1` on a refusal or failure with the cause on standard error, and `130` on an interrupt, printing no token or code of an app token at any time:

- a cause names what refused — the registry, the instance, a file — in the library's own words, and what to do where there is one thing to do;
- an interrupted install or publish leaves the last files standing [[environments-7](environments.md#environments-7)], the interrupt promising no rollback of an upload the registry already took.

## Internal Behavior

#### cli-14

The published `@sublang/spex` package shall export the package-manager library — the format, requests and lock, resolution, the store and installs, exports, the registry client and stand-in registry, publishing, the sign-in client with its credential store and the home's instance entries — as its own modules, which the core imports from the workspace, so one implementation serves the command line and the app ([DR-165](../decisions/165-one-package-manager-hosted-by-the-cli-and-the-app.md)):

- the library depends on no agent SDK and on no Cligent, Playbook or compiler package;
- beside the library, its exports keep the scaffold's files resolvable by name, as `@sublang/spex/scaffold/<path>`;
- the CLI prepares no playbook artifact to run on an engine, which the app does at its installs and uses [[environments-7](environments.md#environments-7)].

## Verification

#### cli-15

When the packed CLI, installed into a scratch prefix from `npm pack`, runs with a scratch home against the library's stand-in registry in a scratch Git working folder, with no core running, the integration suite shall assert:

- `spex new acme/hello --skill .claude/skills/greet --spec specs/hello.md` writes `spex-packages/acme/hello/` with its manifest, README, LICENSE, skill and spec, a path request in `spex.yaml` made with `registry` naming the public registry, the lock, `.spex/packages/acme/hello/` absent for a path source and the skill exported into `.agents/skills/greet/` while `.claude/skills/greet/`, the reader's own folder, is left out and reported so, and ends naming the folder and the two publish commands; `--move` leaves the original skill folder as Spex's export in both agent folders; each refusal of the list writes nothing [[cli-8](#cli-8)];
- `spex add demo/tool@^1.0.0` and `spex add demo/other` from the stand-in registry write the requirement given and `^` at the newest listed non-prerelease version, resolve, install under `.spex/packages/` and export, with `.spex/.gitignore` ignoring everything, and each refusal of the list writes nothing [[cli-2](#cli-2)];
- `spex list` names the instance, both requests, each package's version and source and installed state, each exported skill and nothing left out [[cli-6](#cli-6)]; `spex search tool` lists the registry's match with its versions newest first [[cli-7](#cli-7)];
- a second scratch folder holding the committed `spex.yaml` and `spex.lock` alone, `spex install` there resolves nothing and yields byte-identical `.spex/packages/` and exports, and a second `spex install` rewrites nothing; with `spex.yaml` alone, it resolves first; with neither, it is refused naming `spex add` [[cli-4](#cli-4)];
- a lock recording the app's built-in spec package at a checksum no registry serves installs the rest, names the built-in as the app's, and `spex list` reads it not installed [[cli-4](#cli-4)] [[cli-6](#cli-6)];
- once the registry publishes `demo/tool` 1.1.0, `spex update` moves the lock and prints both versions, and prints that nothing moved when run again [[cli-5](#cli-5)];
- `spex remove demo/other` drops the request, the files and the export and prints the loss, a name not requested refused [[cli-3](#cli-3)];
- the environment root is found from a subfolder of the working folder, and from a working folder without `spex.yaml` at its Git top level [[cli-1](#cli-1)].

#### cli-16

When the packed CLI runs `publish` against the stand-in registry answering for the instance the folder's `spex.yaml` names as `space`, the integration suite shall assert that `--dry-run` prints the instance's name, `acme/hello@0.1.0` and the declared files and uploads nothing, that a publish lands the release there and prints the package's page at the instance, that with no name and one package under `spex-packages/` the same package publishes, and that no folder, another package's manifest, a missing license, two packages with no name and a device signed out there are each refused with nothing uploaded [[cli-9](#cli-9)].

#### cli-17

When the real CLI runs `login`, `whoami` and `logout` against a scoped service fixture at one origin, the integration suite shall assert registry login by default, explicit Space login preserving the other grant, mutually exclusive target flags refused, an existing credential reported unless forced, no Space registration from registry login [[cli-10](#cli-10)], registry identity reported without secrets [[cli-12](#cli-12)], and registry logout preserving the Space credential and home entry [[cli-11](#cli-11)].

#### cli-18

When the packed CLI's commands end in success, refusal and interrupt, the integration suite shall assert the exit codes `0`, `1` and `130`, the cause on standard error, no token in any output, and that an install interrupted mid-download leaves the previous files and lock standing [[cli-13](#cli-13)].

#### cli-19

When the package-build integration inspects the packed `@sublang/spex`, it shall assert that its dependencies name no agent SDK, no Cligent, no Playbook and no compiler package, that the scaffold's `specs/meta.md` and `i18n/zh/specs/meta.md` resolve by name from the installed package, that the core's sources import the library from the workspace package and hold no copy of its modules, and that the CLI's install of a playbook artifact leaves its folder without engine links [[cli-14](#cli-14)].

#### cli-20

When the real CLI runs against a scoped HTTP fixture, the integration suite shall verify public registry defaults in new manifests, preserved legacy destinations [[cli-2](#cli-2)], independent registry and Space login with mutually exclusive flags [[cli-10](#cli-10)], purpose-specific whoami [[cli-12](#cli-12)] and logout preserving the other purpose [[cli-11](#cli-11)].
