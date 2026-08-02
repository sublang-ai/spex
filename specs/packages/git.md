<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# git: Git Workflow

## Intent

This package lets contributors and maintainers create auditable project commits with consistent messages and AI attribution.
It owns commit preparation and message conventions, not branching, review, or release policy.
It is project-local.

## External Behavior

### git-1

When a contributor or maintainer asks the commit workflow to prepare a commit, the commit preparation shall report the configured `user.name` and `user.email` or identify each missing value and create no commit until both are configured.

### git-2

When writing a commit message subject, the commit message shall use `<type>(<scope>)<!>: <subject>` format, where `<scope>` is optional, `!` is included for breaking changes, `<type>` is one of `feat|fix|docs|style|refactor|test|ci|build|perf|chore`, and `<subject>` is imperative, <=50 chars, with no trailing period.

### git-3

Where a commit message includes a body, when writing the body, the commit body shall explain what and why rather than how, wrap at 72 chars, and use bullets if clearer.

### git-4

When AI assists in coding or authoring, the commit message shall include a `Co-authored-by` trailer in the format `<model> (<role>) <email>`, where `<role>` is one of `coder|reviewer|maintainer` and `<email>` is `cligent@sublang.ai`:

Example: `Co-authored-by: GPT-5.2-Codex (coder) <cligent@sublang.ai>`

### git-5

Where a commit realizes a recorded intent, the commit message shall reference the intent record by its bare ID in the `IR-<N>` form, in the subject or body.

## Verification

### git-6

When a prepared commit is audited, the audit shall assert the commit follows this package's conventions:

- the commit records the configured `user.name` and `user.email` [[git-1](#git-1)];
- the subject line follows the `<type>(<scope>)<!>: <subject>` format [[git-2](#git-2)];
- any body explains what and why, wrapped at 72 chars [[git-3](#git-3)];
- an AI-assisted commit carries the `Co-authored-by` attribution trailer [[git-4](#git-4)];
- a commit realizing a recorded intent references the intent record's ID [[git-5](#git-5)].
