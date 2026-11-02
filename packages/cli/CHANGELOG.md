<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `spex --help` groups the commands as a project's Packages tab does,
  each with one line saying what it is for. `spex <command> --help`,
  `-h` or `spex help <command>` prints a command's lines and every
  option it takes; `spex --version` (`-V`) prints the installed version.
- `spex export <org>/<pkg>` builds `spex-packages/<org>/<pkg>/` by
  copying `--spec` and `--skill` files, which stay where they are, and
  adds nothing to `spex.yaml`. A first export writes `meta.yaml` with
  `provides` listing the kinds given; run again, it keeps `meta.yaml`
  and refreshes the spec from `specs/` and each skill from the agent
  folders. The spec's citations are rewritten for the package: another
  package's spec by its address, a spec of no package dropped and a
  decision record's link reduced to its text, each with a warning.
- `meta.yaml` takes `provides`, the kinds a package offers a project —
  `[spec]`, `[skill]`, `[playbook, skill]` — every kind it holds where
  absent; an empty list is refused.
- An install places a provided spec in the project's
  `specs/packages/<pkg>.md`, opening with a marker line naming its
  package and version, for you to commit with the code. Its citations
  of other packages' placed specs become relative links; the rest are
  dropped, their words kept, until that package is added. An unedited
  copy follows its package and leaves with it; an edited one is left as
  yours, the newer version waiting; a file of yours by that name keeps
  it out.
- `spex lint` reads the marker line, so a placed spec `specs/map.md` does
  not list draws no warning.
- `spex list` says beneath each package where its spec stands in
  `specs/` — placed, edited and left as yours, kept out by a file of
  yours, or waiting for `spex scaffold` — and each package its links
  wait for, with `spex add <org>/<pkg>`; `spex add`, `spex install` and
  `spex update` say the same of what they placed.

### Changed

- Every printed line speaks the Packages tab's words. `spex list` heads
  with `Folder` and `Registry`, then lists what is Added, Installed and
  placed under Skills for agents, last with what to do where `spex.lock`
  is stale or a package is not installed; `add`, `remove`, `install` and
  `update` say Added, Updated, Removed and Installed, `install` says
  Already installed for a package in place, and `update` says Up to date
  where nothing moved. `publish` says `Publishing <org>/<pkg>@<version>
  to <registry>`. The built-in playbooks read `built in`, and
  `spex remove sublang/playbooks` is refused: "sublang/playbooks comes
  with Spex".
- A registry is named by the display name its descriptor gives, kept in
  the home's `cache/registries/`, else by its host, and never by a Space
  at the same address. `whoami` lists the registry and every Space in
  one grammar; `login` and `logout` print one line each.
- Every refusal is one phrase ending in what to do: an unknown command
  or option with the command's usage, a package not at the registry or
  private — at `install` and `update` too, never a conflict of versions —
  an expired sign-in, a registry that cannot be reached or is down, an
  org not yours, a folder package's folder missing or holding no
  package, and a `spex.lock` from a newer Spex or one that cannot be
  read, which `spex update` writes again. `spex add --path` checks the
  folder holds the package before writing `spex.yaml`.
- The stand-in registry of `@sublang/spex/testing` describes itself at
  `/api/v1/registry` and names a scripted account at `/api/v1/whoami`.
- Only what a package provides is placed. A support artifact — one a
  sibling names in `from`, or one a sibling of another kind names in
  `requires` — is installed but placed nowhere, so a playbook's support
  skill no longer reaches the agent folders.
- In a project, a package's spec is no longer placed as a generated
  `<org>-<pkg>` skill; a Personal package's spec still is.

### Removed

- **Breaking:** `spex new` and its `--move`, replaced by `spex export`.

### Fixed

- A checkout that converts line endings — Git for Windows by default —
  keeps a committed `spex.lock` current and reads a placed spec as its
  package's copy, which an update then rewrites: the lock's digest of
  `spex.yaml` and the comparison of a placed copy with its derivation
  read CRLF as LF, and a placed spec is written with LF line endings.
  A lock resolved earlier from a `spex.yaml` with CRLF line endings reads
  stale once, and `spex install` resolves it again.

### Fixed

- A Git source's files are read as the repository holds them, whatever
  this computer's Git line-ending settings, so a `spex.lock` resolved
  on Windows installs on macOS and Linux, and the reverse.

## [5.0.0] - 2026-10-31

### Added

- The standalone command line is the package manager, with no running app
  or IDE project registration. Commands use the nearest `spex.yaml`, else
  the Git work tree's root, else the current folder. Commit `spex.yaml`
  and `spex.lock` with code; installed files, generated skills and the
  install record live under the ignored `.spex/`. The IDE reads the same
  files. Skills export to `.claude/skills/` and `.agents/skills/`.
  - `spex add <org>/<pkg>[@<requirement>]` or `--path <folder>` records
    a request and installs; without a requirement it uses a caret at the
    newest eligible release;
  - `spex remove` (`rm`) drops a request and installs what remains;
  - `spex install` (`i`) installs the lock, resolving if missing or stale;
  - `spex update` resolves again and installs;
  - `spex list` (`ls`) shows registry, Space, requests, lock and exports;
    `spex search <query>` searches the selected registry.
- New manifests explicitly select the public package registry with
  `registry: https://spex.sublang.ai`. Optional `space` selects records
  and Git-source brokerage independently. Existing manifests without
  `registry` retain their prior package source until explicitly migrated.
- `spex new <org>/<pkg>` makes `spex-packages/<org>/<pkg>/` from skill
  folders and a spec, requests it by path and installs it. Publishing
  names the requested folder, else that package folder, or the one package
  there when the name is omitted. `--dry-run` previews without upload.
- `login`, `logout` and `whoami` accept mutually exclusive `--registry`
  and `--space` origins, defaulting to the environment's package registry.
  Registry sign-in creates no Space entry or repository consent. Credentials
  are owner-readable and never printed; logout and refresh affect only the
  selected purpose, including at the same origin.
- Every package command exits `0` on success, `1` on refusal or failure with
  its cause on standard error, and `130` on interrupt.
- The shared library ships as `@sublang/spex/environment`, `files`,
  `instance`, `git-host`, `home-file` and `words`, with the stand-in as
  `@sublang/spex/testing`. The Spex app runs the same library.

### Changed

- Registry selection, publication and private reads are independent of
  Space membership. A machine or server seat needs its own registry grant
  for private packages. Locked source origins, versions and checksums stay
  authoritative; installs do not search every signed-in Space.
- `spex publish [<org>/<pkg>] [--dry-run]` publishes the named package's
  folder to the environment's registry with that registry's grant.
- `spex install` uses the app's built-in package, `sublang/playbooks`, from
  the same home's copy or a registry; where neither serves it, that package
  is left to the app while the rest install.
- A developed package lives at `spex-packages/<org>/<pkg>/`, where the old
  `spex package init` wrote `spex-packages/<name>/`.
- **Breaking:** the package declares an `exports` map for the library,
  scaffold paths and `package.json`; arbitrary deep imports such as
  `@sublang/spex/dist/cli.js` no longer resolve.

### Removed

- **Breaking:** attached `auth`, `project` and `package` command groups,
  `--server`, `SPEX_SERVER_URL`, `--project` and `--timeout`; the CLI no
  longer connects to a running app, and exit code `2` is gone.
- **Breaking:** `spex package init`, replaced by `spex new`.

## [4.2.0] - 2026-10-29

### Added

- `spex package init <org>/<name>` makes `spex-packages/<name>/` from
  `--skill` folders and/or a `--spec` file, with a format 2 manifest, a
  README and the project's LICENSE, and prints the next steps in the app
  and the CLI. It needs no server; `--move` moves the skill folders
  instead of copying them, and every refusal writes nothing.
- Attached commands find the running Spex app — desktop or server shell —
  through the `local/endpoint.json` file it keeps in `SPEX_HOME` or
  `~/.spex`. `--server` and `SPEX_SERVER_URL` still win; without either
  and without a running app, the command says the app must be running.

## [4.1.0] - 2026-10-27

### Added

- Attach to a running compatible local Spex server for project
  registration, Space sign-in/status and package search, add, remove,
  install, resolve, status and publish. Use `--server` or `SPEX_SERVER_URL`;
  scaffold and lint continue to work without a server.
- Package commands wait for their own result, with actual destination
  and receipt for publication. Connection loss and observation timeout
  report an unknown outcome without automatic replay.

## [4.0.1] - 2026-10-21

### Fixed

- English and Chinese licensing seeds now specify verification of
  project-owned SPDX headers: native comment syntax and placement,
  the project's license and copyright holder, first-inclusion year,
  and no unresolved placeholders. Updated template history lets
  `--update` refresh recognized pristine seeds while preserving
  user-modified files.

## [4.0.0] - 2026-10-02

### Changed

- **The CLI requires Node.js 22 or later.** Node 20 reached end of life
  in April 2026, and every Spex package now declares the same floor
  (DR-079). Raising the supported runtime makes this a major release.

### Fixed

- Chinese scaffolds now translate the complete bundled spec tree, including
  the authoring rules, structure decision, Git and licensing contracts, and
  starter intent. Source pins and drift checks preserve canonical meanings,
  identifiers, and links as the English templates change.
- The managed agent-instruction section told coding agents to run
  `spex lint`, which fails wherever no `spex` command is on PATH — a
  project created from the Spex app, for one. It now names
  `npx @sublang/spex lint`, with `spex lint` as the alternative where
  the CLI is installed; an existing project picks the sentence up on
  `spex scaffold --update`.
- `spex scaffold` pinned no copyright holder for the project: every
  seeded file carried SubLang's upstream SPDX line and nothing named
  the project's own, so an agent adding a file copied the template's.
  The licensing seed now carries `licensing-9` with the project's
  header format, resolved at scaffold time — `git config user.name`
  and email as the holder, the current year, and `Apache-2.0` when the
  root `LICENSE` is the bundled text. A value the scaffold cannot
  resolve stays a `<holder>` or `<license>` placeholder, reported on
  stderr, and IR-000 now asks for it to be replaced rather than for
  `licensing-9` to be written. Template files keep their upstream
  lines (scaffold-58).

## [3.0.0] - 2026-08-13

### Changed

- **Intent records are now disposable, non-addressable planning
  artifacts.** No other spec may cite or name an IR, and `specs/map.md`
  indexes decisions and packages only. `spex lint` enforces this across
  maps and intent records while allowing a record to identify itself.
  Existing trees must run `spex scaffold --update`, remove intent-map
  rows and cross-IR references, then reconcile until `spex lint` passes.

- Decision-record `References` sections are required only when the DR
  cites an external source. English and Chinese scaffolds carry the
  clarified law.

### Fixed

- `spex lint` now warns when a decision file, as well as a package file,
  is missing from `specs/map.md`.

## [2.1.1] - 2026-08-05

### Fixed

- Interactive agent selection no longer fails with `EAGAIN` in a real
  terminal. The fresh-scaffold selector and the `--update`
  confirmation both waited on a raw file-descriptor read that any
  touch of Node's stdin stream — or a spawning parent — could switch
  to non-blocking; the reader now probes the terminal at the
  descriptor level and tolerates a non-blocking descriptor.

- Removing the managed specs section now keeps a CRLF file's line
  endings when the content surviving above the section is a single
  line, completing the 2.1.0 line-ending fix in the other direction.

## [2.1.0] - 2026-08-04

### Fixed

- Removing the managed specs section no longer rewrites the rest of a
  file's line endings. The seam now follows the surviving content
  rather than the whole file, so a section carrying CRLF cannot push
  CRLF into an otherwise LF file.

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

[Unreleased]: https://github.com/sublang-ai/spex/compare/cli-v5.0.0...HEAD
[5.0.0]: https://github.com/sublang-ai/spex/compare/cli-v4.2.0...cli-v5.0.0
[4.2.0]: https://github.com/sublang-ai/spex/compare/cli-v4.1.0...cli-v4.2.0
[4.1.0]: https://github.com/sublang-ai/spex/compare/cli-v4.0.1...cli-v4.1.0
[4.0.1]: https://github.com/sublang-ai/spex/compare/cli-v4.0.0...cli-v4.0.1
[4.0.0]: https://github.com/sublang-ai/spex/compare/v3.0.0...cli-v4.0.0
[3.0.0]: https://github.com/sublang-ai/spex/compare/v2.1.1...v3.0.0
[2.1.1]: https://github.com/sublang-ai/spex/compare/v2.1.0...v2.1.1
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
