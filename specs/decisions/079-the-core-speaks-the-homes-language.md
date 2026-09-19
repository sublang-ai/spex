<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-079: The Core Speaks the Home's Language

## Status

Accepted (2026-09-18) on the owner's rule: text a reader sees in normal operation, and any message that informs or instructs the reader, is translated; an exceptional internal error keeps English.
Extends [DR-078](078-the-interface-speaks-the-readers-language.md) in scope: the prose the core authors, and the Node 22 floor for every package, the scaffold CLI included; everything else in it stands.

## Context

- After [DR-078](078-the-interface-speaks-the-readers-language.md), about a hundred and forty messages the core authors still reach a Chinese page in English, across some thirty protocol fields: a refusal's message, a config error, a readiness requirement, a diagnostic's reason, the Space's messages and guidance, a unit's label and detail, a compile step's line and the toolchain's guidance, a draft's diagnostic, an authoring thread's status line, a specs notice.
- DR-078 left two ways open. Codes the page phrases, the failure catalogue's way ([DR-075](075-a-failure-says-what-and-what-now.md)), would make the protocol carry every fact each of those phrases needs and rewrite every test that pins a message; the core phrasing in the home's language reuses the catalog tooling as it stands, in a package built like the desktop shell.
- The core already holds the home's choice; for the reader's system it has what its host passes: the desktop shell's OS is the reader's device, while a served page may sit elsewhere.
- The scaffold CLI still declares Node 20, which reached end of life in April 2026, while the app requires 22.

## Decision

- **The core is a speaking package.** Text the core composes for the reader passes through its own catalog beside its source, in the same form as the UI bundle's and the desktop shell's, and the same check gates its build.
- **What speaks and what stays.** A refusal's message, a config error, a readiness requirement, a diagnostic's reason, the Space's messages and guidance, a unit's label and detail, a compile step's line and the toolchain's guidance, a draft's diagnostic, an authoring thread's status line and a specs notice are the reader's and translate.
  A message that names an internal failure for a developer, text relayed from a runtime, a tool, a file or a library, and a wire text the page matches to phrase itself stay as they are.
- **The language the core speaks** is the home's choice; with none stored, the reader's system as the embedding shell passes it at start — the desktop shell passes the OS's preferred languages — and the process's own locale where a shell passes none.
  The core changes language the moment the choice is set.
- **A change re-reads live state.** The core re-derives and broadcasts the states it caches, and a page re-reads what it holds, so every phrase the core composed reads in the new language; a record already written keeps the language it was written in.
- **Tests speak English**: the core's test harness starts the service with English system languages, so no host's locale colours a run.
- **Node 22 everywhere.** Every package declares the floor, the scaffold CLI included; the CLI's next release is a major.

Considered and declined:

- Codes for every message: right for a closed set the interface phrases in its own words, the failure catalogue; too costly for a hundred and forty free-form messages, each code carrying the facts its phrase needs.
- A language per client in the core: the choice is the home's; a served page whose system differs from the host's reads the host's language until the reader chooses.

## Consequences

- The `localization` package names the core a speaking package and states the re-read on change; core-service gains the item and its test; the desktop shell passes the OS's languages to the core it embeds.
- The page phrases pipeline stage names itself, recognizes a withheld read by its kind rather than its reason's words, and re-reads the config, readiness, the Space and diagnostics when the choice changes.
- A served page whose browser language is Chinese, on a host whose system is not, reads Chinese chrome and English core prose until the reader chooses 简体中文.
- The scaffold CLI's changelog notes the floor; [DR-040](040-source-only-app-releases.md)'s run-from-source line and the release notes say Node 22.
