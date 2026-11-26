<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-006: Projects and Forge Integration

## Status

Accepted.
Amended by [DR-036](036-file-state-store.md), [DR-051](051-runtime-held-for-a-turn.md), [DR-096](096-the-app-supplies-the-scaffold.md), [DR-099](099-project-creation-preserves-existing-repositories.md), [DR-100](100-new-project-specs-follow-the-readers-language.md), [DR-103](103-the-home-and-its-groups.md).

## Context

- [DR-002](002-desktop-app-architecture.md) defines Projects as a workspace surface — a local git repo plus forge binding — and the run environment for playbook sessions.
- The Dashboard surface ([DR-002](002-desktop-app-architecture.md)) needs forge data: issues to do and PRs to review.
- The product owner decided (2026-07-10) a GitHub-first forge integration through the locally-authenticated `gh` CLI, with GitLab later, and no tokens or OAuth secrets stored in Spex.
- The cloud port ([DR-002](002-desktop-app-architecture.md)) will run where local CLI presence differs from a developer desktop, so forge access needs a replaceable seam.

## Decision

### Project model

- A **Project** is a registered local Git working folder, identified by its repository root path; its records live apart from the code in a spex repository ([DR-103](103-the-home-and-its-groups.md)).
- The project is the run environment: a playbook session launched for a project runs with its cwd at the project root (embedded runtime per [DR-003](003-runtime-reuse.md)).
- One working turn per project at a time; several projects may run turns concurrently ([DR-051](051-runtime-held-for-a-turn.md)).
- Registration flows:

| Flow | Steps |
| --- | --- |
| Pick existing | select a directory; it must be a Git repository root with an initial commit |
| Create new | refuse a folder already holding a Git repository ([DR-099](099-project-creation-preserves-existing-repositories.md)); `git init` in a chosen directory + optional spec scaffolding in the creating page's language ([DR-100](100-new-project-specs-follow-the-readers-language.md)) via the app's own scaffold CLI ([DR-096](096-the-app-supplies-the-scaffold.md)) + a real initial commit |

- Project registrations are app-only state in the home's registry file ([DR-036](036-file-state-store.md)); nothing is written into the project repo except what the create flow commits.

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
