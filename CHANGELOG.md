<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] - 2026-05-08

### Changed

- `spex scaffold --update` now writes absent seed files
  (`map.md`, `dev/git.md`, `dev/licensing.md`, `test/licensing.md`,
  the sample iteration, `user/.gitkeep`) from the bundled template
  and reports the path with `(updated)`. The previous
  `(kept — missing)` indicator is removed. Remove a seed after
  `--update` if you do not want it.

### Fixed

- `spex scaffold --update` no longer fails with
  "framework files tracked in HEAD" when upgrading a repository
  whose `specs/` tree predates the current framework set. Missing
  framework files are now written from the bundled template,
  including any missing parent directories.

## [0.2.0] - 2026-05-08

### Added

- `spex scaffold --update` mode to refresh framework templates and
  pristine seeds in place, with state-matrix coverage and indicator
  output (SCAF-11, SCAF-12)
- Automatic migration of legacy `specs/items/{user,dev,test}/`
  layouts to the flat `specs/{user,dev,test}/` layout on `--update`
- Bundled file-history manifest (SCAF-21) used to distinguish
  customized seeds from pristine ones during `--update`
- Copy-paste-ready LLM merge prompt printed by `--update`,
  fenced for unambiguous selection
- Spec rules META-21 (test scope), META-23/24/25 (DR/IR drafting
  style), and META-26 (observable-outcome behaviors)

### Changed

- Project specs flattened from `specs/items/{user,dev,test}/` to
  `specs/{user,dev,test}/`; DR-000 and meta.md restructured to match,
  with citation block renumbered (META-15..META-19 → META-16..META-20)
- `--update` reports `unchanged` for refreshes whose post-run
  content equals the pre-run content, instead of `(updated)`
- Customized seed files are kept on `--update` and reported as
  `(kept — user-modified)`
- Trailing hints around the merge prompt reframed as suggestions
  rather than commands

### Fixed

- Canonical hashing for the file-history manifest normalizes
  CRLF/CR line endings so cross-platform refreshes match
- `.gitkeep` normalized to 0 bytes for stable hashing
- File-history manifest scoped to published states only

## [0.1.1] - 2026-04-05

### Changed

- Package description and npm keywords for better discoverability
- README rewritten with workflow overview, usage example, and contributing section
- RELEASE spec expanded with README requirement (RELEASE-14)

## [0.1.0] - 2026-04-05

### Added

- `spex scaffold [<path>]` subcommand to create specs directory structure
- Target resolution: explicit path, git repo root, or cwd fallback
- Recursive template copying from bundled `scaffold/specs/`
- Agent spec instructions in `CLAUDE.md` and `AGENTS.md` with section replacement
- Idempotent reruns with `(already exists)` / `(skipped)` indicators
- CRLF support in agent file section detection
- CI workflow for ubuntu, macos, windows with Node 20 and 22
- Integration tests exercising the CLI binary end-to-end
- RELEASE spec package with package hygiene and pre-release checks

[Unreleased]: https://github.com/sublang-ai/spex/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/sublang-ai/spex/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/sublang-ai/spex/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/sublang-ai/spex/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/sublang-ai/spex/releases/tag/v0.1.0
