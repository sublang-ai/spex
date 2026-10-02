<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-096: The App Supplies the Scaffold

## Status

Accepted (2026-10-01).
Extended by [DR-100](100-new-project-specs-follow-the-readers-language.md) in the scaffold's language argument.
Extends [DR-081](081-the-app-supplies-the-compiler.md) and [DR-024](024-app-supplied-agent-runtimes.md): the scaffold CLI joins the compiler and the agent SDKs the app supplies, for the reason the compiler did.
Amends [DR-006](006-projects-and-forge.md) in the create flow's scaffold step alone: the `@sublang/spex` scaffold CLI it names is the checkout's own copy, the registry's only where none is built.

## Context

- The palette's create flow scaffolded through `npx --yes @sublang/spex`: the core fell back to it because neither shell passed a scaffold command, though the checkout carries `packages/cli` and `npm run build` builds it before either shell starts.
- So a project received whatever the registry served at that moment, not the CLI the app ships; a fix in the app's CLI reached the palette only after a separate npm release; offline or behind a slow registry, Create failed or hung on the fetch; the first Create on a machine paid an unannounced download.
- Both shells already hand the core their own executable and the module directories above their own module as the compile runtime, and the workspace links `@sublang/spex` into the root `node_modules` the way it links the compiler's package.

## Decision

- Each shell names the scaffold command when it starts the core: the checkout's own `@sublang/spex` entry, found over the module directories the shell already names for the compiler and resolved to its real file, on the shell's own executable — Electron's as Node through `ELECTRON_RUN_AS_NODE=1`, the server's Node bare.
- The scaffold CLI spawns no agent, so no preload drops the variable as the compiler's does.
- A tree without a built copy names no command, and the core falls back to the registry's `npx --yes @sublang/spex`; a failed scaffold names the command that ran, and for the registry's, that the app's own CLI was not supplied.
- The shells declare no dependency on `@sublang/spex`: the CLI is a workspace package of the same checkout, built by the same command, and a declaration would add only a second link to it.

## Consequences

- Create works offline and with the registry down, pays no download, and scaffolds exactly what the app's CLI generates; a CLI fix ships with the app.
- The fresh-install smoke creates a scaffolded project through the server shell with the registry unreachable, so a server shell that stopped naming its CLI fails the smoke; the desktop's own test suite asserts the scaffold command the desktop resolves.
- The core's command runner accepts the variables a command runs under; nothing else in its contract changes.
