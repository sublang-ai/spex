<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.1.0] - 2026-08-04

### Added

- `spex scaffold --update --lang <code>` switches a tree's authoring
  language, rewriting the bundled specs in the target language in
  either direction and printing an agent prompt for translating the
  project's own specs. A code matching the tree's current language is
  an ordinary update.

- Scaffold and update runs now manage agent instructions for Claude
  Code, Codex, Gemini CLI, Kimi Code, and OpenCode through `CLAUDE.md`,
  `AGENTS.md`, and `GEMINI.md`. Interactive runs confirm or choose the
  selection; `--agents=<names>` selects it non-interactively; switching
  agents removes only Spex's managed section from deselected targets.

### Changed

- `spex scaffold --update` no longer assumes English when a tree's
  authoring language cannot be determined. A `specs/meta.md` that
  declares no language and matches no bundled version now stops the
  update before any write, naming the marker line to restore; a missing
  `specs/meta.md` proceeds as English with a warning. Previously both
  cases silently replaced a localized tree's framework files with
  English ones.

- Legacy-generation updates now print one bundled, agent-neutral
  migration prompt instead of directing users to a separately installed
  skill and guide. `spex lint` remains the mechanical migration gate.

## [2.0.0] - 2026-08-02

### Changed

- **The scaffolded spec law now uses one behavior-level binding model.**
  Fixed, polymorphic, and composed package relationships cite peer
  External Behavior inline; every package requires Verification of its
  own behavior; record citations use plain ID links; and attachments
  follow a statement-ending colon. Existing 1.x trees must run
  `spex scaffold --update` and reconcile their packages with the new law.
- **`spex lint` enforces the 2.0 law.** It rejects missing Verification
  sections, peer behavior citations from Verification, malformed record
  citations, and basename collisions involving any item-bearing file.
- Agent and update guidance now points to the normative meta rules,
  permits implementation-led exploration, resolves conflicts in the
  specs before coding against them, and requires specs and code to agree
  before an intent completes.
- Chinese scaffolds are source-pinned and streamlined while retaining
  Chinese GEARS syntax and a localized `map.md`.

### Fixed

- Managed `CLAUDE.md` and `AGENTS.md` refreshes now parse Markdown H2
  boundaries, so heading-like lines inside fenced code blocks cannot
  replace or truncate the managed Specs section.

## [1.0.0] - 2026-07-31

Version 0.4.0 was prepared but never published; its changes are folded
into this release. npm users upgrade straight from 0.3.0.

### Added

- **The 1.0 spec generation.** `spex scaffold` seeds the spec law this
  release stabilizes: a packages-only `specs/` tree (`decisions/`,
  `intents/`, `packages/`, `map.md`, `meta.md`) where every spec
  package is one file with `Intent`, `External Behavior`,
  `Internal Behavior`, and `Verification` sections; behavior that
  emerges from several packages working together is itself a package
  citing the peers' External Behavior — there is no compositions
  directory. Item IDs are the lowercase file basename
  (`github-login-3`), citations are enclosed inline links
  (`[[github-login-3](github-login.md#github-login-3)]`) written at
  the phrase that relies on the cited behavior, and each item is one
  GEARS statement elaborated only by attachments. Starter packages
  (`git.md`, `licensing.md`) and a sample intent record seed the tree.
- **`spex lint`, rewritten for that law.** It validates the layout,
  package sections and their order, basename item IDs unique across
  the tree, enclosed citations whose files and anchors exist,
  Verification items citing the behaviors they check, record
  sections, reference markers, and the `map.md` index.
  Relationship-metadata lines like `Verifies:` are errors; directories
  of previous generations are errors pointing at the migration skill.
  Errors exit non-zero.
- **Agent-driven migration for 0.x trees.** The bundled
  `spec-structure-migration` skill (with a meta-ID mapping and a
  mechanical conformance checker) plus the `docs/spec-migration.md`
  walkthrough migrate a tree from any 0.x generation; `spex lint` is
  the mechanical gate the migrated tree must pass.
- **Intent records.** `specs/intents/` replaces `specs/iterations/`:
  an IR carries `Status`, `Intent`, `Deliverables`, `Tasks`, and
  `Verification`, plans an intent's implementation, and is cited only
  by `map.md`; commits realizing a recorded intent reference its bare
  `IR-<N>` id.
- **Root `LICENSE` seeding.** `spex scaffold` writes the verbatim
  Apache-2.0 text at the target root when no `LICENSE` exists there;
  an existing file is never touched.

### Changed

- **`spex scaffold --update` refreshes; it no longer restructures.**
  It refreshes the spex-owned framework files (`specs/meta.md` and the
  spec-format decision record) unconditionally — warning when it
  replaces locally modified content — refreshes pristine seed files,
  and updates the managed section of an existing
  `CLAUDE.md`/`AGENTS.md`. On a tree carrying a legacy generation it
  leaves every legacy file untouched and prints migration guidance
  naming the skill and the guide. Plain `spex scaffold` refuses a tree
  with a legacy directory so two generations never entangle.
- The bundled `zh` overlays (`meta.md`, `map.md`) carry the 1.0 law;
  files without a localized template still fall back to English.
- The CLI parses Markdown with unified/remark-parse/remark-gfm and
  github-slugger; it is no longer dependency-free.
- The release workflow requires the CI workflow to conclude
  successfully for the tagged commit before publishing to npm or
  creating the GitHub release.

### Removed

- **The scripted structural migrations.** The 0.x mechanical
  restructures — merging `specs/user`/`dev`/`test` into packages,
  flattening `specs/items/`, moving `specs/interactions/` — are
  retired; generation migration is judgment work done by an agent
  following the bundled skill.
- **The compositions directory.** The interim composed model
  (`specs/compositions/` with binding and scenario items) never
  shipped to npm and does not exist in the 1.0 law; composition is a
  package pattern.

### Fixed

- Duplicate record numbers are caught instead of colliding silently:
  `spex lint` errors on a repeated number per record kind, and
  `spex scaffold --update` keeps an id-colliding legacy record in
  place, reporting the conflict instead of migrating into it.

## [0.3.0] - 2026-06-25

### Added

- `spex scaffold --lang <code>` scaffolds specs in a non-English
  language via per-language template overlays (DR-001). Chinese
  (`zh`) is bundled; any file without a localized overlay falls back
  to the English template, so the tree is always complete. The
  authoring language is recorded in `specs/meta.md` (META-27) and
  reused automatically by `--update`. Unsupported codes are rejected,
  and `--lang` is rejected on `--update` and on a tree whose declared
  language differs.

### Changed

- `spex scaffold --update` now warns when it replaces a framework
  file (`specs/meta.md`, the spec-format decision record) that
  contained local modifications, naming each affected file and
  pointing to `git diff -- specs` to recover and reapply the changes.
  Framework files that merely match an older bundled version are still
  refreshed silently.
- Tighten the `LIC-5` note in the scaffold's `dev/licensing.md`
  template: each preserved upstream SPDX line satisfies its
  respective `LIC-1`/`LIC-2` requirement, and any missing required
  line is supplied from upstream, not the project license.

## [0.2.3] - 2026-05-10

### Added

- New `LIC-5` item in the scaffold's `specs/dev/licensing.md`
  template: when a file's first comment block already carries
  upstream SPDX headers (e.g., a scaffold template copied from
  another project), those lines are preserved unmodified, even
  when the project root is licensed differently. `LIC-1`/`LIC-2`
  are satisfied by the preserved upstream headers.

### Changed

- Trim the bundled `iterations/000-spdx-headers.md` IR: cite
  `dev/licensing.md` as the normative source instead of duplicating
  its scope/exclusions, and reframe the format-documentation task
  as adding a `## Format` section to `dev/licensing.md` with the
  project's actual license and copyright.

## [0.2.2] - 2026-05-09

### Changed

- `spex scaffold --update` no longer prints post-prompt path
  summary sections. Per-file indicators are now the single
  file-level action log.
- `spex scaffold --update` now reports absent seed files as
  `(created)` and combines same-run legacy migration plus seed
  refresh status into one indicator line.

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

[Unreleased]: https://github.com/sublang-ai/spex/compare/v2.1.0...HEAD
[2.1.0]: https://github.com/sublang-ai/spex/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/sublang-ai/spex/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/sublang-ai/spex/compare/v0.3.0...v1.0.0
[0.3.0]: https://github.com/sublang-ai/spex/compare/v0.2.3...v0.3.0
[0.2.3]: https://github.com/sublang-ai/spex/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/sublang-ai/spex/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/sublang-ai/spex/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/sublang-ai/spex/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/sublang-ai/spex/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/sublang-ai/spex/releases/tag/v0.1.0
