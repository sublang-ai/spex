<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-115: A Spec Reaches the Agents

## Status

Accepted (2026-10-11).
Amends [DR-104](104-spec-package-format-and-client-environments.md) in its exports: a selected spec is exported as a generated skill beside the skills and the playbooks' skills, and `alias` names a spec's id as well.

## Context

- [DR-104](104-spec-package-format-and-client-environments.md) exports skills where agents read them and playbooks to the launcher; a spec is installed under `packages/<org>/<pkg>/specs/<language>/<pkg>.md` in the spex repository's clone and exported nowhere.
- In the 2026-10-11 workshop simulation, a team added a spec-only spec package from the registry to recast a project from the spec alone; no agent in the working folder could read it, so the person found the clone's path and pasted it into the prompt.
- The clone's path is this device's, outside the working folder, where an agent's file tools may not reach; the folders where agents read skills are inside it, and an agent lists the skills it has.

## Decision

- For every selected spec, Spex writes a skill, as it does for a playbook: the spec file in its chosen language, copied byte for byte as `<pkg>.md`, beside a `SKILL.md` saying what the spec package is — its org, name, version and description.
- The skill is named `<org>-<pkg>`, so it takes no name the spec package's own skills and playbooks export under their ids; where that is longer than an Agent Skills name allows [[1]], `<pkg>`; `alias` renames it like any other export.
- It goes where the other exports go, is bound like them to the environment whose lock exported it, counts among the skill names whose clash is refused, and leaves when the lock no longer selects it.

## Consequences

- A request can name a spec package, and an agent in the working folder reads its spec; your own group's specs reach every session on this device.
- A lock resolved before this records no spec export, so its spec reaches no agent until it is resolved again.
- An agent reads a copy: an edit to it changes nothing installed, and the next export writes it again.

## References

[1]: https://agentskills.io/specification "Agent Skills specification"
