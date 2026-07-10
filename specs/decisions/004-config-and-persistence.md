<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-004: Configuration Ownership and Persistence

## Status

Accepted

## Context

- The playbook CLI owns a shared config file at `${XDG_CONFIG_HOME:-$HOME/.config}/playbook/playbook.config.yaml` [[1]] with top-level maps:
  `profiles` (adapter, optional model, reasoning effort, permissions), `captain`, `playbooks.<id>` (`from`, optional `command`, `players.<role>`, plus a per-playbook option slice), and optional `layout`, `notifications`, `theme` [[3]].
- The playbook launcher validates that file fail-closed (missing `from`, import failure, key/manifest id mismatch, duplicate id or command, reserved captain role, unresolved required role, zero visible roles, profile-id vs adapter-shorthand collision) and composes it into runtime options with namespaced `<id>-<role>` player ids (`^[a-z][a-z0-9_-]*$`) [[3]].
- Spex embeds the same runtime and captain shell ([DR-003](003-runtime-reuse.md)) and keeps tmux-play as a verification twin ([DR-002](002-desktop-app-architecture.md)), so both hosts must accept the same config.
- Users hand-edit the config file for CLI use, including its comments; a Settings UI that rewrote the file wholesale would destroy them.
- Spex also needs state the config file was never meant to hold: projects ([DR-006](006-projects-and-forge.md)), session history, usage rollups, UI preferences.
- macOS GUI apps do not inherit the user's shell environment, so credentials exported in shell profiles (e.g., `ANTHROPIC_API_KEY`) are invisible to a plainly launched desktop app.

## Decision

### Shared config file remains the source of truth

- `${XDG_CONFIG_HOME:-$HOME/.config}/playbook/playbook.config.yaml` [[1]] stays the single source of truth for `profiles`, `captain`, `playbooks`, `layout`, `notifications`, and `theme`.
- Spex reads and writes this file; the Settings UI is an editor over it, not a parallel store.
- Writes are comment-preserving: targeted YAML edits keep comments, key order, and untouched formatting intact, so the file stays hand-editable for CLI use.

### Compatibility contract with the playbook launcher

- Spex validation mirrors the launcher's fail-closed rules: a config Spex accepts also launches under the playbook CLI.
- Config-to-runtime composition (top-level maps to runtime options, `<id>-<role>` player id namespacing) is kept behaviorally identical to the launcher.
- Future work: extract validation and composition upstream into a package shared by the playbook CLI and Spex; until then, parity is enforced by tests, not shared code.

### External edits

- Spex watches the config file and reflects external changes live in Settings and dependent state.
- Concurrent write conflicts resolve last-writer-wins with a UI notice; no merge is attempted.

### First-run seeding

- When the shared config file is absent, Spex seeds it with the same bundled starter semantics as the playbook CLI: a commented template.
- An existing config file is never overwritten by seeding.

### App-local state

- App-only state lives in an app-local SQLite database [[2]] under the platform app-data directory (Electron `userData`).
- Contents: project registry ([DR-006](006-projects-and-forge.md)), session/turn/record history ([DR-003](003-runtime-reuse.md)), usage/cost rollups, UI preferences.
- No secrets are ever stored — no API keys, tokens, or captured environment values.
- The config file gains no app-only keys; anything the playbook CLI does not read belongs in SQLite.

### Credentials and readiness

- Credential storage and refresh are delegated entirely to the agent SDKs/CLIs; Spex never persists or proxies credentials.
- At startup the shell captures a login-shell environment (GUI apps do not inherit shell env) and hands it to the core for spawning agents and running checks; the capture is a startup snapshot.
- The core runs launcher-equivalent per-adapter readiness checks and surfaces results in Settings with fix instructions:

| Adapter | Readiness signal |
| --- | --- |
| claude | `ANTHROPIC_API_KEY` env var or `~/.claude` present |
| codex | `OPENAI_API_KEY` env var or `~/.codex` present |
| gemini, opencode | no light check; surfaced as unverified |

## Consequences

- The config stays CLI-compatible; users switch between Spex and the playbook CLI freely, and tmux-play verification runs use the same file unmodified.
- Validation and composition are duplicated until upstream extraction; the drift risk is carried by parity tests.
- Hidden records ([DR-003](003-runtime-reuse.md)) persisted to SQLite are local-only and can be purged from the app; nothing hidden leaves the machine.
- The SQLite schema is app-internal and may change freely pre-1.0, with no migration guarantees before then.
- Last-writer-wins can drop a concurrent edit; accepted for v1 on a single-user file, with the UI notice making the loss visible.
- The environment snapshot means credential changes in the shell require an app restart to be picked up.

## References

[1]: https://specifications.freedesktop.org/basedir-spec/latest/ "XDG Base Directory Specification"
[2]: https://www.sqlite.org/docs.html "SQLite documentation"
[3]: https://github.com/sublang-ai/playbook "sublang-ai/playbook — playbook CLI, launcher, and Playbook Captain shell"
