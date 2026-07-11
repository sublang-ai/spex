<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-007: Conversational Session Start

## Status

Accepted (revised 2026-07-11 after the owner's review of the first build)

## Context

- v1 landed with Sessions empty until the user first visited Projects, registered a repo by typing an absolute path, and clicked "Open session" — three surfaces before the first conversation.
- The product owner's review (2026-07-10): opening the app must put a Captain conversation front and center, where the user can naturally pick or add a project, see and invoke playbooks, and see or change the captain's agent/model.
- The first build (a composer with a form around it) drew a second review (2026-07-11): the Captain must show up **like a human chatting in an IM app** — greeting first, hints in its own words, no instruction labels; project picking should be a compact chip menu in the Claude Desktop style (without copying it); playbook chips do not scale and must become a dismissible quick start; discovery belongs in a `/` menu in the composer.
- All the needed capabilities already exist on the protocol; this is presentation only ([DR-003](003-runtime-reuse.md) semantics untouched).

## Decision

### Sessions is the landing surface, and it opens as a Captain chat

- The app opens on **Sessions**; with no live session (or on the "+" tab) it shows the **Captain home**: a chat thread, not a form.
- The Captain opens the thread itself with a client-rendered greeting — a hello plus two or three high-level hints (pick a project, type `/` for playbooks, or just describe a task) — so the surface is never blank and needs no instruction copy.
- Playbook runs read as an IM conversation everywhere: the user's messages appear as their own chat bubbles, Captain speech as counterpart bubbles, and shell status lines as small system lines between them.

### Project chip

- A compact project chip sits in the composer toolbar (folder icon + name); clicking it opens a menu of registered projects plus **Open folder…** (native picker per [DR-008](008-native-shell-bridge.md); a path field inside the menu when the bridge is absent).
- Choosing a folder that is not a git repository **initializes one silently** (git init, no scaffold, no dialog) and registers it — no branching flows, no branch/worktree options.
- Sending with no project chosen opens the chip menu instead of erroring.

### Quick start and discovery

- Highlighted playbooks render as a **quick start card** in the thread (command + intent per row); the card is dismissible and stays dismissed across launches once the user knows the ropes.
- Typing `/` at the start of any composer opens a **slash menu**: the configured playbooks filtered as the user types, each with its intent as the hint; selecting inserts the command.

### Captain identity

- The Captain's profile and model appear compactly near the composer with a small gear that jumps to the profile in Settings; profile pickers elsewhere carry the same gear affordance.

## Consequences

- Zero-to-first-turn happens inside one conversation; Projects becomes a management view rather than a required doorway.
- The greeting is client-side (no LLM call), so the home is instant and free; the Captain's first real reply still comes from the runtime.
- Quick-start dismissal is a UI preference (local store), not config.
- tmux-play has no equivalent surface; the verification-twin property of [DR-003](003-runtime-reuse.md) is unaffected.
