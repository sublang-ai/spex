<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Changelog

All notable changes to the Spex app — the desktop and server shells over
one core and one interface — are documented in this file. The scaffold
CLI keeps its own changelog under `packages/cli`.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
App releases ship as source under `app-v*` tags; run them with `npm ci`
and `npm start` (desktop) or `npm run start:server` (server).

## [Unreleased]

### Added

- **Sessions continue.** An ended session is a paused conversation: a
  message continues it, after the app restarts too, from a token-free
  Captain snapshot kept beside the session; the End confirm says so.
- **Every session can be deleted**, sessions run from the playbook
  terminal included, behind a lease check that refuses while a
  terminal still writes them.
- **Spec editing.** Packages, decision records, and intent records
  open in a plain-text editor with a markdown preview from the Specs
  tab; saves are atomic and refuse to clobber a file an agent changed
  meanwhile.
- **Intent controls.** A working intent can be dropped from the
  session's working line and the Dashboard's Now band; the Captain
  home's next card can remove its intent.

### Changed

- **Chrome that fits.** The composer is rebuilt — field on top, actions
  beneath, "Send" and "Send next", no native grip — and every row,
  toolbar, and header yields at narrow widths instead of overlapping;
  a browser journey now measures overlap at widths from 320px.
- Record rows look and act alike everywhere — Specs decisions, History,
  Sources — and open the record in the records reader.

### Fixed

- History and Sources record rows opened nothing; they now land in the
  records reader.
- A stale ledger reply could outlive a fresh one, leaving a started
  intent shown as still queued.

## [0.1.0] - 2026-09-02

### Added

- **Workspace.** Local git repositories as projects; Boss sessions with
  a Captain pane, one pane per session player, live machine cards for
  the playbook run, and a composer that queues messages during a turn
  and answers a player's question in place; the project palette, the
  Specs tab with outline, search, citations, and graph, and the
  project Overview.
- **Dashboard as the intent ledger.** An attention queue of questions,
  failures, and finished work awaiting a verdict; per-project History,
  Now, Up next, and Sources; one-gesture capture from GitHub issues,
  pull requests, intent records, or a typed line; Start stages an
  intent into the composer; Confirm or Drop closes it; History shows
  done work with fixed bugs crossed out.
- **Playbooks.** The `@sublang/playbook` built-ins (`/code`, `/review`,
  `/decide`, `/dev`), per-role inline agents with fast mode, the
  pipeline view, and a compile flow through `slc`.
- **Settings.** The Captain agent, session players, adapter readiness
  with in-place re-check, notifications, and comment-preserving edits
  of the shared playbook config.
- **Shared file state.** App state under `~/.spex` and sessions in the
  playbook CLI's own store, so a session run from a terminal appears
  in the app; the shared config lives under `~/.spex/playbook`.
- **Server shell.** The interface and the core served from one port
  behind a token URL, with optional TLS, for browsing a machine you own
  from another.
- **Desktop shell.** Single instance, OS notifications and dock badge,
  and a guarded source launch that rebuilds and restores the native
  module.
- **Acceptance.** Browser journeys driving the served interface in
  Chromium against a real core with substitute agents, including an
  accessibility scan of every surface in both themes.

[Unreleased]: https://github.com/sublang-ai/spex/compare/app-v0.1.0...HEAD
[0.1.0]: https://github.com/sublang-ai/spex/releases/tag/app-v0.1.0
