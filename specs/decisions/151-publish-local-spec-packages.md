<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-151: Publish Local Spec Packages

## Status

Accepted (2026-10-25), under the owner's fresh-user publishing and installation goal.
Extends [DR-104](104-spec-package-format-and-client-environments.md) in the publishing surface for packages without an authoring session.
Amended by [DR-165](165-one-package-manager-hosted-by-the-cli-and-the-app.md) in where a package is published from: by its name, from `spex-packages/<org>/<name>/`.

## Context

A spec package may contain only a spec or an ordinary skill.
The core can publish these packages, but the IDE offers publishing only inside a compiled playbook's authoring workspace.
Requiring an HTTP client and a separate API token makes the ordinary package workflow unnecessarily difficult.
The existing publish display can also mistake a retained success for the result of a later refused attempt at the same immutable version.

## Decision

- A directly requested local folder has Publish beside its package in Playbooks, using the same preview and confirmation as playbook authoring.
- This publishes the current folder through the environment's existing instance and account rules; neither a playbook nor a compilation is required.
- Registry and Git requests do not offer publication of their installed copies.
- Publishing remains an explicit upload of the declared release files; adding a folder, installing it, or opening a preview publishes nothing.
- A retained successful receipt does not establish success of a later attempt, and a repeated refusal remains visible.
- The existing package format, validation, immutable versions and publishing protocol remain unchanged; no new package editor or credential flow is introduced.

## Consequences

Specs, skills and playbooks use one package publishing flow in the IDE.
Authors still prepare the package folder and its manifest with their usual tools or agents.
The preview describes the folder read for that preview; confirmation uses the existing publish operation's read of the current folder.
