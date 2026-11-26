<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-058: Chat-Assisted Playbook Authoring

## Status

Accepted (2026-09-12) on the owner's direction.
Amends [DR-015](015-reference-content.md).
Amended by [DR-082](082-the-first-move-in-a-draft-is-an-act.md), [DR-097](097-media-and-browser-tools-across-hosts.md), [DR-103](103-the-home-and-its-groups.md), [DR-104](104-spec-package-format-and-client-environments.md), [DR-111](111-the-core-coordinates-as-git-does.md), [DR-112](112-authoring-permissions-use-the-package-working-directory.md), [DR-172](172-surfaces-a-fresh-user-reads.md), [DR-176](176-global-playbooks-and-a-placed-playbook-runs.md).

## Context

- The owner directed a two-pane authoring workspace — a conversation with an agent on the left, the generated source and its compilation watched on the right — modeled on Claude Design's layout.
- The Playbooks surface compiled from pasted markdown or a picked file plus typed role names; users do not know what a source should say, compiles take 30–120 minutes, and a failed phase's output lands in a log the user must read and act on alone.
- A source is prose the compiler reads under fixed conventions — a `Roles:` list, prose behaviors in `Captain shall prompt <Role>:` form, blockquoted prompts one point per line, fenced `markdown` instruction blocks, values relayed in quotes (`>`), `Results:` contracts, nested `Captain shall call playbook` items — documented in the installed `@sublang/playbook` package (`slc/text2gears.md`) beside four maintained sources (`reference/sdlc/{code,review,decide,dev}.md`) and their compiled gears; slc's repository carries a six-line demo.
- slc reports phases as lines — `→ <phase>`, `✓ <phase> … (<elapsed>)`, `✗ <phase> failed at … (<elapsed>)`, a `… <phase> still running (<elapsed>)` heartbeat every thirty seconds of silence, `◇` status lines — over the phases normalize, text2gears, optimize, gears2fsm, link; it exits 2 with a `SLC_CLARIFICATION:` JSON report when the source is ambiguous.
- The core already runs every session player through cligent, resolves an agent block to an adapter through one import table, substitutes a scripted fake adapter in tests, runs one compile per playbook id with `compile.abort`, and renders agent transcripts in the run view's player pane; `compilePlaybook` compiles an `<id>.md` already in the directory when given no source, and re-packages with `skipSlc` — the registry wrapper is where command and intent are baked.
- The Captain's block is tool-free only inside the Captain shell, which restricts control-call tools per adapter ([DR-019](019-inline-agent-configuration.md)); the block itself names an adapter, model, effort, and fast mode like any player's.
- Cligent holds a provider resume token per instance for the app's run; a rejected resume is signaled by Kimi and OpenCode as `SESSION_RESUME_REJECTED`, while the Claude adapter — the default Captain — reports a stale session as an ordinary error, so no resume strategy may depend on that signal.
- The shared config is playbook-owned ([DR-004](004-config-and-persistence.md)): no Spex-only key may be added, and `local/` is never portable.
- slc derives the entry id from the source's basename, so the id fixes the directory, the file, and the compiled entry.

## Decision

- Compile inputs may come from a directory an agent writes, and compilation and its addition are two steps, the addition confirmed by the user after the compile derives the roles.
- Amends [DR-015](015-reference-content.md): the slc example's prefill opens an authoring session in paste mode instead of filling a form.

### The workspace

- "New playbook" takes one thing — the playbook id — and opens an authoring session in a two-pane workspace on the Playbooks tab or surface ([DR-172](172-surfaces-a-fresh-user-reads.md)): a conversation with an authoring agent on the left; on the right a pane of four tabs, Source / Gears / Machine / Add, with the compile watched in a band under the tab strip.
- An authoring session belongs to a project, or to the global environment, and writes a spec package under development there ([DR-103](103-the-home-and-its-groups.md), [DR-104](104-spec-package-format-and-client-environments.md), [DR-176](176-global-playbooks-and-a-placed-playbook-runs.md)).
- The empty conversation offers two acts — bring a SKILL.md in as the source, and place the example as the first message ([DR-082](082-the-first-move-in-a-draft-is-an-act.md)).
- The boundary is the house divider ([DR-030](030-workspace-chrome.md)); below the `@2xl` container step the panes stack — conversation above, artifacts below — with the divider turned into the horizontal grip ([DR-041](041-chrome-that-fits.md)); the workspace header carries the session's state chip so a failure is never behind a fold.
- The paste-or-pick path survives as the Source tab's paste mode; nothing else of the old compile form remains.
- The chat reuses the run view's transcript folds and segment renderers and the composer's one shape; the right pane reuses the stage boxes and the registry form. No second transcript or form grammar is introduced.

### The agent

- The authoring agent defaults to the Captain's block — adapter, model, effort, fast mode — run directly through cligent, outside the Captain shell, with permissions `{ mode: "auto" }` and nothing else ([DR-112](112-authoring-permissions-use-the-package-working-directory.md)): no `allowedTools`/`disallowedTools` (Codex, Kimi, and OpenCode reject them), the block's own `permissions` and `writablePaths` dropped, its `instruction` not carried (cligent has no such option; the Captain's instruction is shell prose).
  `mode: "auto"` is the one posture every adapter maps — Claude's auto permission mode, Codex's workspace sandbox with auto-reviewed approvals, Gemini's yolo approval, Kimi's native auto (the only policy Kimi accepts), OpenCode's permission map — and the working directory is the spec package's directory, so a sandboxing adapter confines writes there with no extra grant; an ambient adapter's access is no confinement guarantee, and the prompt restricts edits to the source and the manifest's description.
  This is how the Captain's tool-free posture is overridden: the posture lives in the shell, not in the block.
- A picker in the conversation header switches to any roster player; the choice is a Spex preference of the authoring session, never a config key.
- A Boss message carries structured content with owned media, and the agent's browser access is explicit, as in a session ([DR-097](097-media-and-browser-tools-across-hosts.md)).
- The source file `<id>.md` is the contract between agent and compiler: the agent edits it with its own file tools; Spex reads it back after every tool result and at the turn's end and streams it to the Source tab; Spex never rewrites it behind the agent.
- The system prompt is short and points at shipped documents by absolute path — `slc/text2gears.md` as the format's law, `reference/sdlc/review.md`, `reference/sdlc/code.md`, and `reference/sdlc/review.playbook/review.gears.md` as exemplars, all in the installed `@sublang/playbook` files — inlining only a distilled shape of a source and the six-line slc demo.
  Nothing is materialized into the package directory, so slc sees only `<id>.md`.

### Directives, not side channels

- The agent speaks to Spex through fenced ```` ```spex ```` YAML blocks in its reply — `kind: compile` and `kind: register` — parsed by the core when the turn ends: every top-level fence of the reply's final text, the last block per kind winning, a fence nested in another fence never a directive, a malformed block left visible as code and named at the head of the agent's next prompt.
  Considered and declined: a marker file the core watches (fires mid-turn before the source is settled, needs a watcher per draft, invisible in the transcript); a shell command the agent runs (needs a binary on every adapter's PATH inside every sandbox); a trailing marker line (a sign-off after it silently drops the request); a bare `/compile` line (matches inside fences).
  A reply is the one channel every adapter has, a turn boundary is the moment the source is settled, and the block reads in the transcript as a card.
- A compile the agent requests is honored at once when Compile would be enabled, with Cancel one click away and the log naming who asked; the prompt teaches the agent to request a compile only once the Boss has said the source is ready or asked for it, or after a relayed failure — consent lives in the conversation, not in a modal.
- The user presses Compile whenever no compile of the session runs.

### Compile, feedback, and adding

- An authoring session's compile runs slc in the package directory — one per artifact destination, a duplicate refused ([DR-111](111-the-core-coordinates-as-git-does.md)), cancelable — over the `<id>.md` already there, with placeholder judgment fields, and stops after packaging and fail-closed validation; it writes no config.
- A failed phase's output, or slc's clarification questions, is fed to the agent automatically: as a relay turn when nothing waits, else as the preface of the next queued Boss message.
  The relay is bounded — three consecutive failed compiles with no Boss message between them end the automation until the Boss speaks — and a canceled compile, a compile the core stop interrupted, and a toolchain failure are never relayed.
- A successful compile starts one short system turn asking the agent to propose the addition; the Add tab is meanwhile prefilled from derived defaults (command = id, intent = the source's first prose paragraph, `dev.<role>` per derived role), so it is never empty.
- Add re-packages the compiled entry with the confirmed command and intent (`skipSlc`), writes any new player first, then requests the package by path from the environment of the page the playbook was created on and writes its players as the `playbooks.<id>` entry, re-keyed onto the derived roles ([DR-176](176-global-playbooks-and-a-placed-playbook-runs.md)).
  The id is the session's and the roles are the compiled entry's; the agent proposes neither.
  Nothing is written until the user presses Add.

### Messages queue

- A session's compile may run beside its turn ([DR-111](111-the-core-coordinates-as-git-does.md)); a Boss message sent while a turn or compile runs is accepted and queued by the core, dispatched in order when the session is idle — before any relay turn — and its arrival resets the relay count.
- The runtime is held only for a turn ([DR-051](051-runtime-held-for-a-turn.md)): no `Cligent` instance outlives a turn; the provider resume token is an in-memory hint for the app's run, so a turn within one run continues the provider conversation, and a restart or an agent switch starts a fresh provider conversation reseeded from the stored transcript.
  Persisting tokens across restarts is left open: the Claude adapter cannot say when a token has gone stale.

### Sessions persist

- The source is `<id>.md` in the spec package, tracked; the session's state, queue, and transcript are kept with its project's or the global records and replayed on open ([DR-103](103-the-home-and-its-groups.md)).

### Acceptance

- The change is accepted when a two-role `changelog` playbook — Coder drafts release notes from the commits since the last tag and commits them; Reviewer checks them against the commits — is authored, compiled, and added through this workspace alone.

## Consequences

- The playbook-library package carries the workspace, the conversation, the compile trigger, the addition's confirmation, and authoring sessions as external behavior; the conversation runner, prompt composition, directive parsing, the session's compile, and the session store as internal behavior; the compile form's items are re-homed (source entry becomes paste mode, the registry form becomes the Add tab, the example prefill opens an authoring session).
- The core gains an authoring runner beside the session manager — a second consumer of cligent's adapters — a `draft.*` command family, a `draft` channel kind with `draft.record`, `draft.state`, and `draft.source` messages, and a protocol version bump; core and UI move together.
- The fake adapter gains a write effect and a permissions capture so the hermetic suite can drive a source-writing agent; the stub slc gains failing, clarifying, and blocking variants.
- The authoring agent runs with tools in the package's directory; ambient adapters (Claude, Kimi) rely on the instruction to touch nothing else — accepted for a developer tool.
- Revising an added playbook through the same workspace, and resuming provider conversations across restarts, are follow-ons.
