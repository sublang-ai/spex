<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-165: One Package Manager, Hosted by the CLI and the App

## Status

Accepted (2026-10-29).
Replaces the attached CLI decided on 2026-10-27 and the `package init` and endpoint-file decisions of 2026-10-29, formerly DR-157, DR-162 and DR-163: the owner had their records removed from the tree with the design they recorded, and Git history keeps them.
Amends, under [DR-046](046-decision-record-evolution.md):

- [DR-104](104-spec-package-format-and-client-environments.md) in where an environment's installed files live, in the field naming its Space, in the source of the agent table, in how a publish names its package and in where the manager's code lives;
- [DR-113](113-a-projects-environment-lives-in-its-working-folder.md), accepted here as proposed and extended: a project's environment is complete in its working folder, installed files included;
- [DR-124](124-skills-reach-every-agent.md) and [DR-130](130-playbook-17-11-0-cligent-0-36-0-slc-0-19-0-adoption.md) in the agent table's source;
- [DR-127](127-a-home-signed-in-to-several-instances.md) in how an environment's instance is named;
- [DR-151](151-publish-local-spec-packages.md) in how a publish names its package;
- [DR-161](161-an-applet-is-a-page-the-ide-serves.md) in where an installed applet's folder stands.

Amended by [DR-168](168-independent-package-registry.md) for independent registry selection, account authority and credentials; Space collaboration and server admission remain unchanged.
Amended by [DR-170](170-space-is-written-at-every-pairing.md) in that sentence: `space` is written at every pairing and pick naming the project's instance, the home's default included.
Amended by [DR-172](172-surfaces-a-fresh-user-reads.md) in where packages are managed and in the two verbs.

## Context

The package manager — the release format, requests and lock, resolution, the content-addressed store, installs, exports, the registry client and publishing — was written as a module of the app's core, and the `spex` command line reached it only by attaching to a running app over its WebSocket endpoint.
So `spex package add` and `spex package publish` needed the IDE open, a project registered in the IDE, and an endpoint file to find it; `package init` alone worked offline.
A project's environment had moved to its working folder (DR-113, proposed), but its installed files still lay under the project's records clone in the home, found through the pairing the IDE records, so the environment was not usable without that registration.
The folder a package is developed in was keyed by its name alone, `spex-packages/<name>/`, although a package is named `<org>/<pkg>` everywhere else.
The owner's direction is the one npm and cargo follow: the command line is the package manager, complete on its own, and the app uses the same code; a dependency is named with `add` and the manifest is materialized with `install`; commands are top-level verbs; the folder a package is made in is the folder it is published from.
What the core needs for packages — files, versions, an HTTP client, a sign-in — fits a library; what needs a running core is sessions and the Space sync, which packages do not touch.
Cligent, which publishes the agents' skill folders, carries the agent SDKs as peer dependencies, so a command line that depended on it would pull every agent SDK into a fresh `npx`.
The app's engine, which installed playbook artifacts link to, is the app's alone.

## Decision

### One library, two hosts

The package manager is one library inside the published `@sublang/spex` package: the format, requests and the lock, resolution, the store and installs, exports, the registry client, publishing, the Space sign-in with its credentials, and the home's instances.
The `spex` executable is its first host and the app's core its second, importing it from the workspace; no copy of it lives in the core.
The CLI starts no core, needs none running and discovers none; the app needs no `spex` executable.
Reader-facing words stay each host's own: the CLI speaks English, the core its catalog.

### The commands

Beside `scaffold` and `lint`, which keep their contracts, `spex` offers top-level verbs on the environment of the current folder, needing no project registered anywhere:

| Verb | Meaning |
| --- | --- |
| `add <org>/<pkg>[@<requirement>]`, `add <org>/<pkg> --path <folder>` | record a request and install it; without a requirement, a caret at the newest version the registry lists |
| `remove <org>/<pkg>` (`rm`) | drop a request and install what remains |
| `install` (`i`) | materialize the lock, resolving first where it is missing or stale |
| `update` | resolve again from `spex.yaml` and install |
| `list` (`ls`), `search <query>` | read the environment; search the registry |
| `new <org>/<pkg> [--skill <folder>]... [--spec <file>]` | make `spex-packages/<org>/<pkg>/` from what you have, request it by path and install it |
| `publish [<org>/<pkg>] [--dry-run]` | publish that package's folder to the environment's Space |
| `login`, `logout`, `whoami` [`--space <origin>`] | sign this device in at a Space by the device flow, sign it out, say who is signed in where |

`add` and `install` are two verbs with two meanings, never aliases of each other; `new` makes a new folder as `cargo new` does, while `scaffold` keeps seeding `specs/` in place.
The `project`, `auth` and `package` command groups, `--server`, `SPEX_SERVER_URL` and the endpoint file go away.

### An environment is complete in its folder

An environment is its root folder's `spex.yaml` and `spex.lock` and, under `<root>/.spex/`, the installed files, the generated skills and the install record; `.spex/` carries its own `.gitignore` ignoring everything in it, so the reader commits the two files and never the installed tree.
A project's root is its working folder; a group's own environment's root is its clone, where `.spex/` is likewise ignored and never synced.
The IDE's registration of a working folder pairs it with its records and nothing else: an environment needs no registration, and either host finds it by the `spex.yaml` in the folder.
The environment root of a command line invocation is the nearest folder, the current one included, holding `spex.yaml`, else the Git work tree's top level, else the current folder.
The store under the home remains a cache of verified bytes hard-linked into installs, so a byte removed from it breaks no installed tree.

### The environment's Space

`spex.yaml` may name its instance as `space: <origin>`; an environment's instance is that, else the home's default instance, which is the public Space while the home has signed in nowhere.
The registry, the credential brokered for Git sources, the orgs a person may publish to and the publish destination all follow it.
When the app writes a new project's environment at pairing and the project's instance is not the home's default, it writes `space` naming it, so a project at a private Space keeps resolving there on every device.

### Packages under development

A package you develop lives at `spex-packages/<org>/<pkg>/` in the environment's root, the org a directory as npm's scopes are, so two orgs' packages of one name coexist.
`new` and the IDE's authoring session make that folder; the environment requests it by path; `publish <org>/<pkg>` publishes the folder of the environment's path request for that name, else that path; `publish` with no name publishes the one package under `spex-packages/` and lists them where there are several.
The IDE's Publish on a row passes the same name.

### What the app keeps for itself

Engine preparation: the app prepares each installed playbook artifact's folder to run on its engine at its own installs and at each use that hands the launcher module locations, so a playbook the CLI installed runs; the CLI installs files and prepares nothing.
The built-in spec package stays the app's seed, requested at pairing as before.
The agent folder table is the library's own data, and a test of the core checks it against Cligent's native-skill support, so the CLI carries no agent SDK.

### Coordination

The CLI takes no root lease: it writes the environment's files under their versions, bytes into the store once by digest, exports whole, and `home.yaml` and the credential file as the core does, read, changed and written in one step.
Both hosts read an environment from its files at each use, so what one wrote the other sees at its next use.

### Release

`@sublang/spex` 5.0.0 carries the change; the removed commands make it a major.

## Consequences

- The environment module, the versioned-file and origin helpers, the registry client, the sign-in client with its credential store and the home's instance entries move from the core into `packages/cli` and are exported from `@sublang/spex`; the core depends on the workspace package and keeps its orchestration, progress, broadcasts and words.
- The stand-in registry moves with the library for the CLI's own tests and ships as its `testing` export for the core's tests and the browser journeys; the stand-in host stays in the core and serves the CLI's sign-in tests through the core's testing export.
- `@sublang/spex` declares its exports: the library's modules, `testing`, the scaffold's files by path and `package.json`; any other deep import, such as `dist/`, stops resolving.
- `specs/packages/cli.md` is new; `attached-cli.md` is removed; `environments.md`, `playbook-library.md`, `storage.md`, `core-service.md` and `server-shell.md` lose the attached client, the endpoint file and the clone-relative installed tree.
- Existing homes migrate by use: the app's next install of an environment writes `.spex/` at its root and removes the former `<clone>/packages/` and `<clone>/skills/`.
- The authoring session's folder, the IDE's Add-from-folder placeholder and the browser journeys follow `spex-packages/<org>/<pkg>/`.
- The getting-started guide, the CLI's README and the manual at the public Space describe the new verbs.
- Not offered now: the command line on your own group's environment (an `-g` later), `update` of one named package, and Git sources from the command line, which `spex.yaml` still accepts by hand.
