<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-004: Configuration Ownership and Persistence

## Status

Accepted.
Amended by [DR-019](019-inline-agent-configuration.md), [DR-036](036-file-state-store.md), [DR-080](080-the-config-directory-is-named-config.md), [DR-154](154-the-seed-follows-playbooks-rule.md), [DR-156](156-an-untouched-seed-follows-the-credentials.md), [DR-204](204-workshop-agents-in-one-pass.md), [DR-246](246-remove-groups-and-team-servers-from-the-clients.md).

## Context

- The playbook CLI owns a shared config file, `playbook.config.yaml`, with top-level maps for the Captain, the session players, the playbooks and their role bindings and options, and optional `layout`, `notifications` and `theme` [[1]].
- The playbook launcher validates that file fail-closed and composes it into runtime options [[1]].
- Spex embeds the same runtime and captain shell ([DR-003](003-runtime-reuse.md)) and keeps tmux-play as a verification twin ([DR-002](002-desktop-app-architecture.md)), so both hosts must accept the same config.
- Users hand-edit the config file for CLI use, including its comments; a Settings UI that rewrote the file wholesale would destroy them.
- Spex also needs state the config file was never meant to hold: projects ([DR-006](006-projects-and-forge.md)), session history, usage rollups, UI preferences.
- macOS GUI apps do not inherit the user's shell environment, so credentials exported in shell profiles (e.g., `ANTHROPIC_API_KEY`) are invisible to a plainly launched desktop app.

## Decision

### Shared config file remains the source of truth

- The shared Playbook config, `config/playbook.config.yaml` in the home's global records ([DR-080](080-the-config-directory-is-named-config.md)), stays the single source of truth for the Captain, players, playbooks, `layout`, `notifications`, and `theme`; every agent carries its settings inline ([DR-019](019-inline-agent-configuration.md)).
- Spex reads and writes this file; the Settings UI is an editor over it, not a parallel store.
- Writes are comment-preserving: targeted YAML edits keep comments, key order, and untouched formatting intact, so the file stays hand-editable for CLI use.

### Compatibility contract with the playbook launcher

- Spex validation mirrors the launcher's fail-closed rules: a config Spex accepts also launches under the playbook CLI.
- Config-to-runtime composition is kept behaviorally identical to the launcher.
- Future work: extract validation and composition upstream into a package shared by the playbook CLI and Spex; until then, parity is enforced by tests, not shared code.

### External edits

- Spex watches the config file and reflects external changes live in Settings and dependent state.
- An edit names the revision of the config it was composed from and is refused as a conflict when another writer changed the file meanwhile; no merge is attempted.

### First-run seeding

- When the shared config file is absent, Spex seeds it with the agents Playbook's credential-based seeding rule selects ([DR-154](154-the-seed-follows-playbooks-rule.md)).
- An existing config file is never overwritten by seeding, except an untouched seed that follows the credentials ([DR-156](156-an-untouched-seed-follows-the-credentials.md)).

### App-local state

- App-only state lives in plain files under the home ([DR-036](036-file-state-store.md)): project registry ([DR-006](006-projects-and-forge.md)) and UI preferences; session history ([DR-003](003-runtime-reuse.md)) lives in the session store shared with the playbook CLI.
- No secrets are ever stored — no API keys, tokens, or captured environment values.
- The config file gains no app-only keys; anything the playbook CLI does not read belongs in the home's own files.

### Credentials and readiness

- Credential storage and refresh are delegated entirely to the agent SDKs/CLIs; Spex never persists or proxies credentials.
- At startup the shell captures a login-shell environment (GUI apps do not inherit shell env) and hands it to the core for spawning agents and running checks; the capture is a startup snapshot.
- The core runs per-adapter readiness checks and surfaces results in Settings with fix instructions: the credential variables follow Playbook's, a home folder alone is no credential, the agent's own sign-in status decides where no variable is set, faults are reported by kind, and `claude` and `codex` are always reported ([DR-204](204-workshop-agents-in-one-pass.md)).

## Consequences

- The config stays CLI-compatible; users switch between Spex and the playbook CLI freely, and tmux-play verification runs use the same file unmodified.
- Validation and composition are duplicated until upstream extraction; the drift risk is carried by parity tests.
- Hidden records ([DR-003](003-runtime-reuse.md)) persist with their session in the shared session store.
- A refused conflicting edit is visible to the reader, who reads the config again before retrying.
- The environment snapshot means credential changes in the shell require an app restart to be picked up.

## References

[1]: https://github.com/sublang-ai/playbook "sublang-ai/playbook — playbook CLI, launcher, and Playbook Captain shell"
