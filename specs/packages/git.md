<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# GIT: Git Workflow

## Intent

This package lets contributors and maintainers create auditable project commits with consistent messages and AI attribution.
It owns commit preparation and message conventions, not branching, review, or release policy.
It is project-local.

## External Behavior

### GIT-1

When a contributor or maintainer asks the commit workflow to prepare a commit, the commit preparation shall report the configured `user.name` and `user.email` or identify each missing value and create no commit until both are configured.

### GIT-2

When writing a commit message subject, the commit message shall use `<type>(<scope>)<!>: <subject>` format, where `<scope>` is optional, `!` is included for breaking changes, `<type>` is one of `feat|fix|docs|style|refactor|test|ci|build|perf|chore`, and `<subject>` is imperative, <=50 chars, with no trailing period.

### GIT-3

Where a commit message includes a body, when writing the body, the commit body shall explain what and why rather than how, wrap at 72 chars, and use bullets if clearer.

### GIT-4

When AI assists in coding or authoring, the commit message shall include a `Co-authored-by` trailer in the format `<model> (<role>) <email>`, where `<role>` is one of `coder|reviewer|maintainer` and `<email>` is `cligent@sublang.ai`.

Example: `Co-authored-by: GPT-5.2-Codex (coder) <cligent@sublang.ai>`
