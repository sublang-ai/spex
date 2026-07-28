<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Changelog

All notable changes to the Spex desktop app are documented in this
file. The app ships on the `desktop-v*` tag channel, separate from the
`@sublang/spex` CLI's `v*` channel (see `packages/cli/CHANGELOG.md`);
both are cut from the same history.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Inline agent configuration.** Every agent — the Captain and each
  playbook role — carries its own adapter, model, effort, and
  permissions, edited in place from one editor wherever an agent
  appears: Settings for the Captain, the playbook's own row for each
  player, and the Captain-home chip. Adapters offer the runtime's set
  with live readiness, efforts follow the chosen adapter's vocabulary,
  and a new role starts from a neutral default or copies the Captain.
  A config written for the retired profiles model migrates itself on
  first load, keeping its comments and leaving a backup beside it.

- **Live desktop smoke.** `npm run smoke:desktop` boots the packaged
  shell against a scratch home and walks the release-critical path —
  seeded config, example project, session, a real playbook dispatch
  with signed-in agents, abort, and teardown — so an app release is
  exercised end to end before it ships.

### Fixed

- **Codex Captains work again.** The Captain's adapter now reaches the
  playbook shell, so a Codex Captain uses prompt-level tool
  restriction instead of failing every turn at the first routing call.

- **Attention badge and notifications** recognize the playbook shell's
  structured state records, so a parked question or a failure raises
  the dock badge and its banner again.

## [0.1.0] - unreleased

Initial desktop app: project-first workspace with a Captain-led
conversation, read-only player transcripts over a single Boss
composer, the spec view, the playbook library with its compile flow,
the dashboard, and settings over the shared configuration.
