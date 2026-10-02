<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-100: New Project Specs Follow the Reader's Language

## Status

Accepted (2026-10-02).
Amends [DR-006](006-projects-and-forge.md) in the create flow's scaffold language and extends [DR-096](096-the-app-supplies-the-scaffold.md) in the arguments passed to the supplied scaffold.

## Context

- A reader using the Chinese interface creates a project and receives an English spec tree whose authoring-language declaration directs subsequent work into English.
- The scaffold already supports English and Simplified Chinese, but project creation passes no language.
- A browser following its device language can speak Chinese while its remote core speaks English.

## Decision

- New project scaffolding uses the creating page's resolved interface language at submission.
- A protocol caller may name the scaffold language; with none named, the core uses its own resolved interface language.
- The scaffold remains responsible for localized templates and existing-tree language conflicts.
- Changing the interface language later does not translate an existing project, and adding a repository or seeding the Academy example does not change its authored content.

## Consequences

- Chinese-only teams start with a project that directs new spec content into Chinese.
- The creation request carries a supported language explicitly across the browser/core boundary.
- The browser journey verifies the real scaffold from a Chinese browser against an English host, without an agent or an external registry.
