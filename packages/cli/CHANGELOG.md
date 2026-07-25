<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-07-23

### Added

- `spex lint` checks the specs tree: layout, package and composition
  file sections, item ID uniqueness and prefixes, inline-citation
  coverage (package Verification items cite the same-file items they
  check; composition Tests items cite the same-file Binding or
  Scenario items they execute; every Binding and Scenario item is
  covered; scenario tests cite items in two distinct packages — a
  file link without an item anchor counts toward none; in a mixed
  file, every Binding item is cited by a same-file Scenario item),
  the static-binding rule (no `When`/`While` clause in a
  `## Binding` item), citations (files and anchors), reference
  markers, record sections, and the `map.md` index. Item bodies
  span nested subheadings, and structure lives on root-level
  headings only — a package wrapped in a blockquote satisfies
  nothing, and a quoted lookalike heading disturbs nothing, while
  anchors still cover every heading. Relationship-metadata lines
  (`Verifies:`, `Binds:`, `Composes:`, `Clients:`, `Suppliers:`,
  `Scope:`, `Requires:`, `Uses:`) are errors: the citations in an
  item's clauses are the single source of its relationships
  (META-20). So are a detached `Verifies …` sentence left by
  mechanical migration (META-20), a citation inside a package
  `## Intent` (META-15), a package citation of a peer item outside
  its `## External Behavior` (META-14, META-28), a peer citation
  outside a precondition or trigger clause — decided by the clause
  keywords of either bundled language (META-13) — a package link
  into `specs/compositions/` (META-33), an iteration reference
  outside `specs/map.md`, linked or textual, with an iteration
  record exempt only for its own ID (META-18), and a scenario test
  citing items in fewer than two packages (META-21). A peer
  citation must resolve to an item anchor of the peer file, and
  clause membership is checked on both sides over the parsed
  inline text — inline code and link labels excluded — so a
  subject-position citation after a real precondition still fails
  and markup cannot fake a keyword or separator; the citation must
  share a separator-free span with its clause keyword, so an
  appositive comma after a shall-clause subject, or a trailing
  `where` clause behind a shall, cannot pose as a precondition —
  sentence ends require closing punctuation before whitespace, so
  a dot inside a version number reopens nothing; a separator
  counts as inside a citation group only between two citations,
  so a directly linked shall-subject fails; and a peer citation
  in section prose outside every item body is an error, since
  item clauses are the single relationship source (META-13,
  META-14, META-20). Reference-style links are errors in item files,
  exempting only the literal wrapped `[[N]]` marker form — a bare
  `[N]`, collapsed `[N][]`, or full reference is an error even
  with a numeric label, and a numbered definition must sit under
  `## References` pointing at an external URL, so the marker
  mechanism cannot smuggle an item citation — citations are
  inline (META-16, META-19).
  Binding-trigger detection covers the Chinese clause keywords over
  the parsed inline text, so lists, quotes, and emphasis cannot
  hide a trigger; all keyword detection follows the parsed code
  spans — GFM-correct for fences of any delimiter length and
  indented code. Errors exit non-zero; warnings do not.
- `spex scaffold --update` migrates the legacy `specs/user`/`dev`/`test`
  layout to the new structure: each package's item files are merged
  into a single `specs/packages/<name>.md` (`## External Behavior`,
  `## Internal Behavior`, `## Verification` sections; heading levels
  demoted; reference markers renumbered; `Verifies:` lines rewritten
  as inline sentences), citations across `specs/` are rewritten to
  the new paths, a customized `map.md` is restructured in place —
  every map transform scoped through root-level H2 Layout,
  Packages, and Interactions sections, so fenced, blockquoted,
  listed, and nested lookalike headings are never mistaken for
  the real ones — and a prompt for filling `specs/compositions/`
  is printed for your AI agent.
- `spex scaffold --update` migrates `specs/interactions/` to
  `specs/compositions/` (SCAF-50): files move with conflict-keeping,
  each `Verifies:` block — including wrapped continuation lines —
  collapses to one inline sentence, citations, a `## Interactions`
  map heading, and an `interactions/` layout-block line are
  rewritten, and the retired `.gitkeep` is dropped via the legacy
  manifest. Moved files are not reshaped into the META-34 grammar;
  the remaining lint errors are reconciliation work for the
  printed compositions prompt.
- Composition section headings have Chinese names: the bundled zh
  `meta.md` translates META-28 and META-34, defining
  意图/外部行为/内部行为/验证/参考资料 for packages and
  绑定/场景/测试 for compositions, and `spex lint` accepts them
  alongside the English names.

### Changed

- The spec model is the composed model (DR-000, META-1–36):
  `specs/packages/` holds standalone package contracts and
  `specs/compositions/` holds binding items — static installed
  relationships — plus scenario items and the tests that span
  packages, per the META-34 grammar (`Intent`, `Binding?`,
  `Scenario?`, `Tests`, `References?`). Fresh scaffolds create the
  new layout; bundled seeds moved to `specs/packages/git.md` and
  `specs/packages/licensing.md`, and the bundled meta, decision
  record, prompts, and agent instructions carry the converged
  conventions (bindability, binding form, release-boundary item
  IDs, inline citations).
- `spex scaffold --update` now also refreshes the managed specs
  section of an existing `CLAUDE.md`/`AGENTS.md` (absent files are not
  created).
- The CLI now depends on unified/remark-parse/remark-gfm and
  github-slugger to parse Markdown reliably during migration and
  linting; it is no longer dependency-free.
- The release workflow now gates publishing on CI: it waits for and
  requires the CI workflow (`ci.yml`) to conclude successfully for the
  tagged commit before publishing to npm or creating the GitHub
  release, and fails without publishing otherwise (RELEASE-18).
- This repository's own `specs/` tree is migrated to the composed
  model and lint-gated by the CLI test suite; the desktop app's
  spec view still parses the legacy layout and remains deferred
  (IR-017).

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

[Unreleased]: https://github.com/sublang-ai/spex/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/sublang-ai/spex/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/sublang-ai/spex/compare/v0.2.3...v0.3.0
[0.2.3]: https://github.com/sublang-ai/spex/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/sublang-ai/spex/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/sublang-ai/spex/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/sublang-ai/spex/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/sublang-ai/spex/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/sublang-ai/spex/releases/tag/v0.1.0
