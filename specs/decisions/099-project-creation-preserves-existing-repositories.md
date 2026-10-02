<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-099: Project Creation Preserves Existing Repositories

## Status

Accepted (2026-10-02).
Amends [DR-006](006-projects-and-forge.md) in the create flow's treatment of an existing repository.

## Context

- Creation promises an initial commit before registration, with or without a spec scaffold.
- Reinitializing an existing repository and committing can absorb its staged files or append an unintended commit.
- A failed creation leaves its files and repository available for inspection, so a later attempt can encounter an unborn repository.

## Decision

- Create refuses a folder already containing its own Git repository before changing its files, index, or history.
- A repository with an initial commit is registered through Add.
- An unborn repository is completed in a terminal before Add; the refusal names both steps.
- A fresh repository receives its real initial commit before registration, empty when no scaffold is requested.
- Staging and commit failures remain visible failures and retain files for inspection; no fallback identity or signing-policy override is introduced.

## Consequences

- Creating a project cannot commit a pre-existing index.
- Repair after a failed initial commit preserves the repository and uses the same Add path as any existing project.
- Creation respects the user's Git identity, hooks, and signing policy.
