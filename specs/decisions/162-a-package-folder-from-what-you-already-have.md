<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-162: A Package Folder from What You Already Have

## Status

Accepted (2026-10-29), under the owner's goal that a fresh user publishes a spec, a skill or a playbook end to end, the CLI alone where that is the simplest way.
Extends [DR-151](151-publish-local-spec-packages.md) in how the local folder it publishes comes to exist, and [DR-157](157-a-cli-attached-to-the-local-core.md) in the published CLI's commands that need no server.

## Context

- Publishing a skill or a spec needs a folder in the release layout of DR-104 with a manifest. The guide says "prepare a valid package folder" and nothing makes one: a person who wrote a skill in Claude Code has `.claude/skills/<name>/SKILL.md`, and a project's spec is `specs/packages/<pkg>.md`; neither is a package.
- New playbook makes the folder for a playbook alone, as `spex-packages/<id>/` in the working folder.
- The published CLI scaffolds and lints without a server; a person with a skill at hand is already in a terminal.

## Decision

- `spex package init <org>/<name>` makes `spex-packages/<name>/` in the current directory — the project's working folder — holding `meta.yaml` with `format: 2`, the org and name, version `0.1.0`, a description, a license and the artifacts named below, a `README.md` carrying the name and description, and the project's root `LICENSE` copied beside them where the project has one.
- `--skill <folder>`, given once or more, copies an Agent Skills folder into `skills/<language>/<id>/`, `<id>` the `name` its `SKILL.md` declares; a folder without a `SKILL.md` naming an Agent Skills name, or two skills of one id, is refused. `--move` moves the folder instead, so a skill kept under an agent's folder is handed to the package and the environment's export puts it back once the package is added, where a copy would stand in the export's way.
- `--spec <file>` copies a spec file into `specs/<language>/<name>.md`; a file whose basename is not `<name>` is refused naming the rule, since its items are `<name>-<N>`.
- `--language <tag>` names the artifacts' language, `en` by default. `--description <text>` names the description; without it, the first skill's `description` stands, else the spec's first paragraph under its Intent heading, else the command is refused asking for one. `--license <id>` names the license; without it, `Apache-2.0` where the project's `LICENSE` begins with "Apache License", `MIT` where it begins with "MIT License", else `Apache-2.0`.
- At least one artifact is required; an existing destination folder is refused; a refusal writes nothing.
- The command ends by naming the folder and the next steps: in the IDE, Playbooks → Add from folder with `<org>/<name>` and `spex-packages/<name>`, then Publish on its row; or `spex package add <org>/<name> --path spex-packages/<name>` and `spex package publish spex-packages/<name> --dry-run` from the CLI.
- The command needs no server and touches no Spex storage; it stands beside scaffold and lint in the published CLI.
- Playbooks are not made this way: New playbook compiles them, and a folder brought in by Git becomes a session's package as [DR-104](104-spec-package-format-and-client-environments.md) says.

### Considered and declined

- The same act in the IDE, picking a skill folder in a form: the person made the skill in a terminal or an agent, the files are at hand there, and the IDE's Add from folder and Publish take it from the folder on.
- Packing and uploading in one command without the core: a second publishing stack with a separate token, which DR-151 declined.
- Writing the package where the skill is, under `.claude/skills/`: the agent folder is the export's destination, not a source the environment reads.

## Consequences

- `attached-cli` gains the command with its refusals and its printed next steps; the CLI's guide and the Spex Space guide show the two flows from a skill and from a spec.
- A spec package of a project's own spec keeps the project's item ids, so citations into it keep working where the package is installed.
