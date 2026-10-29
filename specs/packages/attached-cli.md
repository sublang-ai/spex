<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# attached-cli: Attached Package CLI

## Intent

This package defines the published `spex` executable's local-server client commands under [DR-157](../decisions/157-a-cli-attached-to-the-local-core.md), and its `package init` command, which makes a spec package folder from a skill or a spec with no server under [DR-162](../decisions/162-a-package-folder-from-what-you-already-have.md).
Scaffolding and linting retain their separate contracts.
The selected server owns its home, credentials and project files; this client starts no core and mutates no Spex storage directly.

## External Behavior

### attached-cli-1

When an attached command is invoked, the CLI shall connect only to an explicit `--server <access-url>`, else `SPEX_SERVER_URL`, else the `url` of `local/endpoint.json` in the home `SPEX_HOME` names or `~/.spex` [[storage-1](storage.md#storage-1)] — the file the running app keeps [[core-service-143](core-service.md#core-service-143)] ([DR-163](../decisions/163-the-cli-finds-the-running-app.md)) — using the authenticated endpoint [[core-service-24](core-service.md#core-service-24)] and waiting for both matching protocol version and `attachedCliVersion: 1` in hello [[core-service-1](core-service.md#core-service-1)] before any command:

- Accept HTTP, HTTPS, WS or WSS URLs with literal loopback host `localhost`, `127.0.0.1` or `::1`, path `/` and one nonempty `token`; convert HTTP(S) to WS(S), refusing userinfo, fragments, other query fields and other addresses or paths before connection, from the file as from an explicit URL.
- With no explicit URL, a missing or unreadable file, a file not in that shape, and a connection refused at its URL each fail naming that the Spex app must be running on this computer; failed authentication and incompatible hello produce an actionable nonzero failure; none starts a server, replays a mutation or reconnects, and no discovery but the file is made.
- The capability never appears in normal output or diagnostics and is not persisted by the CLI.
- Help and existing scaffold/lint commands require no server.
- An attached command observes for 600 seconds by default; an optional `--timeout <seconds>` overrides it with a finite positive duration fitting the platform timer range, validated with all flags before connecting.

### attached-cli-2

When a project command or package project selector is used, the CLI shall resolve the target through the selected server's project list and registration behavior [[storage-6](storage.md#storage-6)]:

| Form | Behavior |
| --- | --- |
| `spex project list` | Send `project.list` and show registered project names and paths. |
| `spex project add <folder>` | Send `project.register` with the folder, retaining the server's validation and idempotent pairing. |
| Package `--project <folder>` | Select the registered project whose path equals the resolved folder. |
| Package without `--project` | Select the registered project whose path equals the invoking working directory. |
| No matching project | Fail with project-registration guidance; do not register implicitly or substitute your own group's environment. |

- The server's returned repository key is only the internal command target; names and paths identify projects in human output.

### attached-cli-3

When an authentication command is used, the CLI shall use the server's Space sign-in and status behavior [[git-host-3](git-host.md#git-host-3)] [[space-108](space.md#space-108)]:

| Form | Behavior |
| --- | --- |
| `spex auth login --instance <origin>` | Send `space.signin.start` with `reportCompletion: true`, show its browser/device instructions, and wait for that request's completion. |
| `spex auth status` | Send `space.get` and show each instance's sign-in standing and account, without credentials. |

- Authentication success claims only committed sign-in, never successful catalog reading or Sync.

### attached-cli-4

When a package command is used for the selected project [[attached-cli-2](#attached-cli-2)], the CLI shall invoke the environment's existing operation with request-specific terminal waits [[environments-35](environments.md#environments-35)] for mutations:

| Form | Command |
| --- | --- |
| `spex package search <query>` | `environment.search` through the environment's registry [[environments-12](environments.md#environments-12)]. |
| `spex package add <org/name> --version <requirement>` | `environment.request` with `{ kind: "registry", version }`; resolve/install/export follow that request, with exactly one of `--version` and `--path` [[environments-15](environments.md#environments-15)]. |
| `spex package add <org/name> --path <relative-folder>` | `environment.request` with `{ kind: "path", path }`, preserving the core's path confinement [[environments-15](environments.md#environments-15)]. |
| `spex package remove <org/name>` | `environment.remove` [[environments-15](environments.md#environments-15)]. |
| `spex package status` | `environment.get` [[environments-14](environments.md#environments-14)]. |
| `spex package install` | `environment.install`, preserving the lock's selections [[environments-7](environments.md#environments-7)]. |
| `spex package resolve` | `environment.resolve` [[environments-5](environments.md#environments-5)]. |
| `spex package publish <relative-folder> --dry-run` | `environment.publish` with `dryRun: true`, showing actual instance, name, version and declared files without upload [[environments-10](environments.md#environments-10)]. |
| `spex package publish <relative-folder>` | `environment.publish` with `wait: true`, directly reporting its actual publication receipt and destination, without a confirmation prompt or preview binding [[environments-10](environments.md#environments-10)]. |


### attached-cli-12

When `spex package init <org>/<name>` is invoked with `--skill <folder>` once or more and/or `--spec <file>`, and optionally `--language <tag>`, `--description <text>`, `--license <id>` and `--move`, the CLI shall make `spex-packages/<name>/` in the current directory as a release folder [[environments-1](environments.md#environments-1)] holding the artifacts named, connecting to no server and touching no Spex storage ([DR-162](../decisions/162-a-package-folder-from-what-you-already-have.md)):

| Written | Content |
| --- | --- |
| `meta.yaml` | `format: 2`, `org`, `name`, `version: 0.1.0`, `description`, `license`, and under `artifacts` each skill as `{kind: skill, language}` under its id and the spec as `{kind: spec, language}` under `<name>` |
| `README.md` | a heading naming `<org>/<name>` and the description |
| `LICENSE` | the project's root `LICENSE`, copied where the current directory holds one |
| `skills/<language>/<id>/` | each `--skill` folder's regular files and folders, copied, or moved with `--move`, under the `name` its `SKILL.md` frontmatter declares |
| `specs/<language>/<name>.md` | the `--spec` file, copied |

- `<language>` is `--language`, else `en`; the description is `--description`, else the first skill's `SKILL.md` `description`, else the spec's first paragraph under its Intent heading; the license is `--license`, else `Apache-2.0` where the project's `LICENSE` begins with "Apache License" past a byte order mark and whitespace, `MIT` where it begins with "MIT License", else `Apache-2.0`;
- refused before anything is written, naming the rule: a name that is not `<org>/<name>` in lowercase kebab-case of at most 64 characters each; no artifact named; an existing `spex-packages/<name>/`; a skill folder without a `SKILL.md` whose `name` is an Agent Skills name, or two skills of one id; a spec file whose basename is not `<name>.md`; a skill folder holding a link; no description from any source;
- the command ends naming the folder and the next steps: Playbooks → Add from folder with `<org>/<name>` and `spex-packages/<name>` then Publish on its row in the IDE, or `spex package add <org>/<name> --path spex-packages/<name>` and `spex package publish spex-packages/<name> --dry-run` from the CLI.

### attached-cli-5

When an attached command finishes or loses observation, the CLI shall report only that invocation's known outcome:

- Exit `0` only on its successful read, dry run or correlated completion, not on acceptance or a later aggregate state.
- Report the existing refusal code and explanation on stderr and exit `1` for rejected commands or connection failure before dispatch.
- After dispatch, a dropped connection or observation timeout exits `2` and says the result is unknown and the operation may still complete, with no automatic resend.
- SIGINT exits `130`; for package work it stops observation alone and states that work may still complete, while sign-in uses matched cancellation [[space-109](space.md#space-109)] where the connection permits it.
- Neither a failure nor stopping observation promises rollback of request, lock, installation or publication writes already completed.

## Internal Behavior

### attached-cli-11

When the CLI package builds, its staging step shall derive only `PROTOCOL_VERSION` and `ATTACHED_CLI_VERSION` from the canonical `packages/core/src/protocol.ts` declarations into an ignored generated module, refusing missing or ambiguous declarations instead of copying a command schema or depending on the private core package.

## Verification

### attached-cli-6

When the packed CLI connects to a real local fixture server across valid, missing-token, foreign-address and incompatible-hello cases, the integration suite shall assert that only the admitted compatible connection sends commands, secrets stay absent from output, and help/scaffold/lint require no server [[attached-cli-1](#attached-cli-1)]; that with neither `--server` nor `SPEX_SERVER_URL` a scratch home's `local/endpoint.json` naming the fixture server connects, one naming a foreign address is refused, and an absent file, one of another shape and one naming a closed port each fail naming that the app must be running, an explicit URL winning over the file [[attached-cli-1](#attached-cli-1)]; the package-build integration asserts canonical constant values and refusal of missing or ambiguous source declarations [[attached-cli-11](#attached-cli-11)].

### attached-cli-13

When the packed CLI runs `package init` in a scratch Git working folder holding an Apache-2.0 `LICENSE`, a skill folder under `.claude/skills/` and a spec file, the integration suite shall assert: the folder written from the skill and the spec, with its manifest, README, copied LICENSE, the skill under its declared `name` and the spec under `<name>.md`, reads as a release the core accepts [[attached-cli-12](#attached-cli-12)]; the description and license default as specified and `--description`, `--license` and `--language` override them [[attached-cli-12](#attached-cli-12)]; `--move` leaves the skill's original folder gone and a plain run leaves it standing [[attached-cli-12](#attached-cli-12)]; each refusal of the list writes nothing [[attached-cli-12](#attached-cli-12)]; the printed next steps name the folder, the IDE path and the two CLI commands [[attached-cli-12](#attached-cli-12)]; and no server is contacted [[attached-cli-12](#attached-cli-12)].

### attached-cli-7

When the packed CLI registers and selects fixture Git working folders, the integration suite shall assert idempotent registration, exact project selection and actionable missing-pair refusal without implicit registration [[attached-cli-2](#attached-cli-2)].

### attached-cli-8

When the packed CLI signs in against a controlled instance and reads status, the integration suite shall assert instructions, request-specific success/failure and account standing without claiming a later setup read succeeded [[attached-cli-3](#attached-cli-3)].

### attached-cli-9

When the packed CLI searches, adds, removes, installs, resolves and publishes fixture packages through the real core, the integration suite shall assert the mapped registry/path requests, locked installation, terminal outcomes, dry-run destination/files without upload, and direct publication without an approval prompt [[attached-cli-4](#attached-cli-4)].

### attached-cli-10

When a packed CLI invocation is refused, interrupted or disconnected during delayed work, the integration suite shall assert its exit/output classification, no rollback claim and exactly one dispatched mutation without replay [[attached-cli-5](#attached-cli-5)].
