<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-006: Projects and Forge Integration

## Status

Accepted

## Context

- [DR-002](002-desktop-app-architecture.md) defines Projects as a workspace surface — a local git repo plus forge binding — and the run environment for playbook sessions.
- The Dashboard surface ([DR-002](002-desktop-app-architecture.md)) needs forge data: issues to do and PRs to review.
- The product owner decided (2026-07-10) a GitHub-first forge integration through the locally-authenticated `gh` CLI, with GitLab later, and no tokens or OAuth secrets stored in Spex.
- The cloud port ([DR-002](002-desktop-app-architecture.md)) will run where local CLI presence differs from a developer desktop, so forge access needs a replaceable seam.

## Decision

### Project model

- A **Project** is a registered local git repository, identified by its repository root path.
- The project is the run environment: a playbook session launched for a project runs with its cwd at the project root (embedded runtime per [DR-003](003-runtime-reuse.md)).
- At most one live session per project; several projects may run sessions concurrently ([DR-002](002-desktop-app-architecture.md)).
- Registration flows:

| Flow | Steps |
| --- | --- |
| Pick existing | select a directory; it must be a git repository root |
| Create new | `git init` in a chosen directory + optional spec scaffolding via the `@sublang/spex` scaffold CLI + an initial commit |

- Project registrations are app-only state in the app-local SQLite store ([DR-004](004-config-and-persistence.md)); nothing is written into the project repo except what the create flow commits.

### Forge adapter interface

- All forge access in the core goes through one small adapter interface; UI surfaces never talk to a forge directly.
- The v1 interface is read-only and limited to:

| Capability | Purpose |
| --- | --- |
| Auth status | whether the adapter is ready to serve, and as whom |
| Repo binding | resolve a project's git remote to a forge repository |
| List issues | open issues of the bound repository |
| List PRs | open pull requests of the bound repository |
| Item URLs | canonical web URLs for issues and PRs, opened in the external browser |

- Consumers are the Projects and Dashboard surfaces ([DR-002](002-desktop-app-architecture.md)); forge mutations (creating issues, PRs, comments) are out of scope for v1.

### GitHub adapter (v1)

- Exactly one adapter ships in v1: GitHub, implemented over the locally-authenticated `gh` CLI [[1]].
- Spex stores no forge tokens or OAuth secrets; auth state is whatever `gh auth status` reports [[2]], surfaced as-is.
- GitLab via `glab` [[3]] is the named second adapter and is deferred past v1.

### Graceful degradation

- A project with no forge binding, or a machine with no usable `gh`, works fully for compiling, configuring, and running playbooks.
- In that case forge panels show setup guidance (install `gh`, authenticate, add a remote) instead of forge data; no surface outside the forge panels degrades.

### Local repo state

- Repo state on project cards — current branch, dirty flag, ahead/behind counts — comes from local git commands only.
- No forge or network call is made to render project cards.

## Consequences

- No OAuth or secret-storage surface exists in Spex v1; credential lifecycle stays with `gh` and the operating system.
- Forge coverage is limited to hosts the local `gh` is authenticated against.
- The adapter interface is the seam for the GitLab (`glab`) adapter and for the cloud deployment, where CLI presence differs and an adapter may need a token- or app-backed implementation instead.
- Ahead/behind counts reflect the last local fetch, not live forge state; accepted for v1.
- Forge data freshness, latency, and rate limits are inherited from the `gh` CLI.

## References

[1]: https://cli.github.com/manual/ "GitHub CLI manual"
[2]: https://cli.github.com/manual/gh_auth_status "gh auth status — GitHub CLI manual"
[3]: https://gitlab.com/gitlab-org/cli "glab — the GitLab CLI"
