<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-081: The App Supplies the Compiler

## Status

Accepted (2026-09-24).
Amends [DR-005](005-compilation-integration.md): the compiler is the app's own copy of `@sublang/slc`, found in the module tree the shell declares it in and run on the app's own runtime when that meets the compiler's floor; the resolution order through a global install and `npx`, the premise that Electron's Node cannot run the compiler, and the missing-toolchain guidance that asks for a system Node give way, while the never-in-process rule, the compile flow, the registry generation and the library placement stand.
Extends [DR-024](024-app-supplied-agent-runtimes.md): the compiler joins the runtimes both shells supply, for the reason the agent SDKs did.
Amended by [DR-084](084-the-block-is-the-whole-compiler-agent.md) in the handoff alone: `--config` names an empty configuration when the block drives the compile, so what the block leaves unset is the adapter's default.

## Context

- `slc` compiles by driving a coding agent through its own nested `@sublang/cligent`, whose agent SDKs are optional peer dependencies: neither `npm install -g @sublang/slc` nor `npx @sublang/slc` installs one, and the first agent call fails with `ERR_MODULE_NOT_FOUND` for the SDK — reported by a user on a fresh machine as a dependency error calling agents.
  slc's own README asks for the SDKs to be installed beside it and notes that a global SDK is invisible to a project's nested cligent.
- The maintainer's machine hid this: the SDKs sit as siblings of a global slc, resolvable by walking up from it, and `npx` there reuses that stale global 0.1.0 instead of the published 0.10.0 — the same command behaves differently per machine.
- Sessions never hit it because the app shells declare the SDKs themselves ([DR-024](024-app-supplied-agent-runtimes.md)); the compile ran a compiler outside that tree.
- [DR-005](005-compilation-integration.md) resolved a system Node >= 23.6 because Electron's Node then lacked type stripping; Node strips types by default since 22.18 and 23.6 [[1]], Electron 44 bundles Node 24.18 [[2]], and `ELECTRON_RUN_AS_NODE=1` runs the app's own binary as that Node — cligent already spawns Node helpers this way under Electron.
  The variable is inherited by every descendant, so an Electron-based tool an agent launched would start as bare Node unless it is dropped again.
- Spex parses the compiler's contract — its progress lines, exit code 2 with the clarification report, the `<id>.playbook/` layout, the `<id>.ts` entry, `SLC_STALL_TIMEOUT` — so unlike an SDK, whose usable versions cligent enforces at load, the compiler's version is Spex's to track; [DR-023](023-runtime-compatibility-from-cligent.md) recorded that a caret on a 0.x version pins the minor.
- `slc` links artifacts against the playbook engine beside it and Spex bundles the artifact against the app's; both engines declare a runtime ABI and the artifact schemas they support (Playbook DR-022), which today agree across slc's playbook 14.1 and the app's 15.0.
- `slc` chooses its agent from `SLC_AGENT`, `SLC_MODEL`, `SLC_EFFORT` and `SLC_FAST_MODE`, else from a config it seeds with `claude-code` on first run, so a Codex-only home compiled with Claude unless the person configured slc by hand; the draft's authoring agent already follows the draft's block, the Captain's by default ([DR-058](058-chat-assisted-playbook-authoring.md)).

## Decision

- Both shells declare `@sublang/slc` at a caret on the CLI contract Spex tracks; every slc minor is an explicit manifest bump, and the lockfile pins the resolution.
  Installed beside the SDKs the shells declare, the compiler's nested cligent resolves them by walking up, as slc's own install rules require.
- The shell that declares the compiler tells the core where it lives: each shell hands the core its own executable and the node_modules directories above its own module as the compile runtime, and the core finds `@sublang/slc` there — never on `PATH`, never through `npx`; `SPEX_SLC` stays the explicit override the test stubs use.
  A tree without the copy reports the compile unavailable with the restore command and spawns nothing.
- The compiler runs on the runtime the app already runs on when it meets slc's floor — Electron's Node in the desktop, through `ELECTRON_RUN_AS_NODE=1`, the server's own Node otherwise — else on a `PATH` Node that does; `SPEX_NODE` stays the explicit override.
  On Electron the compiler starts behind a preload that drops the variable, so the compiler runs as Node while the agents it spawns inherit nothing of it.
- The core reads the engine the compiler's own playbook declares and refuses the compiler, naming both engines, when its runtime ABI differs from the app's or it emits an artifact schema the app does not support; a shared copy is the app's engine and agrees by construction.
- The compile's agent is the block the compile is resolved from — the draft's answering agent, or the Captain's for the registry form — handed to slc as `SLC_AGENT`, `SLC_MODEL`, `SLC_EFFORT` and `SLC_FAST_MODE`, unless the environment sets any of the four, in which case the environment configures slc wholesale.
  An adapter slc does not drive is refused before the compiler runs, naming the adapters it drives: left to slc's seeded default the compile would run on Claude and fail at sign-in with no cause named.
  The progress log names the agent and its source, so an environment that configured slc is visible; a compile is not a session, so no per-conversation tuning ([DR-067](067-tuning-for-one-conversation.md)) applies, and model ids pass through as written.

Considered and declined:

- naming the SDKs on the `npx` command (`npx -p @sublang/slc -p <sdk> slc`): a second copy of the SDKs downloaded per machine, chosen per adapter by Spex, and cached by npx at whatever version it first saw;
- documenting a global install of slc plus SDKs: homework the interface exists to remove, and the same versions drift per machine;
- installing the compiler into the Spex home at runtime: a network install the app would own, with no lockfile;
- keeping the `PATH` compiler ahead of the app's: a stale global copy without SDKs is exactly the trap;
- the core finding the compiler by walking up from its own package: it works while npm hoists one copy to the root and silently fails the day the shells' ranges diverge.

## Consequences

- A fresh checkout compiles with nothing installed beyond `npm ci` and a signed-in agent; the compiler, its cligent and the SDKs move together with the lockfile.
  Adding the compiler pulled the hoisted `xstate` and `yaml` forward within their ranges and adds about 35 MB, a second TypeScript included.
- The desktop asks for no separately installed Node for the compiler itself; a Codex compile's wrapper still finds `node` on `PATH`, as sessions already do.
  The server shell compiles only when its own Node, or a `PATH` Node, meets slc's floor; the root's Node 22 floor runs it but does not compile, which the README states, and `npm ci` on Node 22 warns about slc's engines without failing.
- The compiler's nested cligent and playbook are its own versions beside the core's; an effort, model or fast mode the compiler's cligent rejects fails the compile before the compiler ran, as the toolchain failure the workspace already shows, and the two cligent copies may drift until the next bump.
- slc seeds its own user config on the first compile that finds none, and Spex's variables override it per key; the compiler's `@sublang/spex` dependency is met by the workspace's CLI link until the CLI's next major nests a registry copy under it, harmless since the compiler never imports it.
- A packaged build keeps the compiler inside the archive — Electron as Node reads an ESM entry and its imports from an asar, and slc spawns no executable of its own — while the SDK binaries the agents spawn stay unpacked [[app-shell-13](../packages/app-shell.md#app-shell-13)]; packaging remains a local option ([DR-040](040-source-only-app-releases.md)), and its acceptance does not yet compile.
- The core stays private to the workspace, so nothing resolves the compiler outside a shell; the catalogs lose the `npx` guidance and gain the restore and engine guidance; the README no longer asks for `slc`.

## References

[1]: https://nodejs.org/api/typescript.html "Node.js — Modules: TypeScript (type stripping)"
[2]: https://releases.electronjs.org/release/v44.0.0 "Electron 44.0.0 release"
