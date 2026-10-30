<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-134: One Package Manager, Hosted by the CLI and the App

## Status

In progress (2026-10-29).

## Intent

Make the `spex` command line the package manager, complete without a running app, and have the app's core host the same library: top-level `add`, `remove`, `install`, `update`, `list`, `search`, `new`, `publish`, `login`, `logout` and `whoami`; environments complete in their folder under `.spex/`; the Space an environment names; packages under development at `spex-packages/<org>/<pkg>/` published by name; the attached client, the endpoint file and the `project`, `auth` and `package` groups gone, under [DR-165](../decisions/165-one-package-manager-hosted-by-the-cli-and-the-app.md).

## Deliverables

- [x] DR-165, the `cli` spec package, and the amended `environments`, `playbook-library`, `storage`, `core-service`, `server-shell` and `space` packages, with the superseded records and `attached-cli` removed [[cli-1](../packages/cli.md#cli-1)] [[environments-26](../packages/environments.md#environments-26)].
- [x] The package-manager library moved into `packages/cli` and exported from `@sublang/spex`, the core importing it, the agent table as library data with the core's parity test, the stand-in registry moved with it [[cli-14](../packages/cli.md#cli-14)] [[environments-16](../packages/environments.md#environments-16)] [[environments-18](../packages/environments.md#environments-18)].
- [ ] Environments complete in their folder: installs under `<root>/.spex/`, `.spex/.gitignore`, the former clone trees removed at the next install, `space` in `spex.yaml` and written at pairing, engine preparation at use [[environments-26](../packages/environments.md#environments-26)] [[environments-7](../packages/environments.md#environments-7)] [[environments-2](../packages/environments.md#environments-2)] [[environments-11](../packages/environments.md#environments-11)] [[environments-9](../packages/environments.md#environments-9)].
- [ ] The command line's verbs with their integration suites against the stand-in registry and host, the attached client, endpoint file and old groups removed [[cli-2](../packages/cli.md#cli-2)] [[cli-8](../packages/cli.md#cli-8)] [[cli-9](../packages/cli.md#cli-9)] [[cli-10](../packages/cli.md#cli-10)] [[cli-15](../packages/cli.md#cli-15)].
- [ ] `spex-packages/<org>/<pkg>/` in the authoring session, the Add-from-folder placeholder, Publish by name on the Enable tab and the environment rows, and the browser journeys [[environments-10](../packages/environments.md#environments-10)] [[playbook-library-70](../packages/playbook-library.md#playbook-library-70)] [[playbook-library-93](../packages/playbook-library.md#playbook-library-93)].
- [ ] The getting-started guide, the CLI README, both changelogs, the manual at the public Space, and CLI 5.0.0 released.

## Tasks

1. Specs: DR-165, `cli.md`, the amendments and removals, `spex lint` clean.
2. Library: move `packages/core/src/environment/`, the versioned-file and origin helpers, the registry client, the sign-in client and credential store and the home's instance entries into `packages/cli/src/lib/`, export them from `@sublang/spex`, make the core depend on the workspace package, static agent table with the parity test, stand-in registry moved; every suite green.
3. Environments in their folder: `.spex/` layout, `.gitignore`, migration of former clone trees, `space` field and pairing write, engine preparation at use, `environment.publish` by name; the core's suites and journeys green.
4. The command line: the verbs, their output and exit codes, the removal of the attached client and endpoint file and of the core's hello marker; `cli-15` to `cli-19` green.
5. The IDE: `spex-packages/<org>/<pkg>/` in authoring and Add from folder, Publish by name; UI tests and journeys green.
6. Docs, changelogs and the public manual; CLI 5.0.0 prepared, tagged and published.

## Verification

- `spex lint` clean after each spec change.
- `npm test` across workspaces and `npm run e2e` green on the branch; CI green on each pull request before merge.
- The packed CLI walked on a scratch home against the stand-in registry and host, and `spex search`, `spex add` and `spex install` walked against the public Space from a fresh `npx @sublang/spex@5.0.0`.
