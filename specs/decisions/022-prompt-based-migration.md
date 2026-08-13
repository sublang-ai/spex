<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-022: Prompt-Based Spec Migration

## Status

Accepted

## Context

- Spec-generation migration requires judgment, so it cannot be reduced to CLI rewrites.
- The installable skill chosen in [DR-021](021-skill-based-migration.md) duplicates an agent prompt while adding installation and agent-specific discovery steps.
- The published CLI does not ship the repository's `skills/` or `docs/` directories, so its guidance points installed users at files they do not have.

## Decision

- The CLI shall bundle one self-contained, agent-neutral migration prompt and print it when `spex scaffold --update` detects a legacy spec generation.
- A legacy update shall print that migration prompt instead of the ordinary update merge prompt.
- The CLI shall continue to refresh the spec law without restructuring legacy content; an AI agent applies the printed prompt, `spex lint` is the sole mechanical gate, and human review closes the migration.
- The migration skill, its separate guide, and its skill-local checker shall retire.

## Consequences

- Any capable AI agent can migrate a tree without installing or discovering a skill.
- The instructions users receive are shipped with the CLI and cannot drift from its guidance.
- Legacy updates print a longer prompt, but only when that judgment work is required.
