<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-016: Project Workspace and Spec View

## Goal

Implement DR-011: the project-first four-surface taxonomy, the
project palette, per-project workspace memory, and the interactive
per-project spec view.

## Deliverables

- [ ] Core: `specs.get` (packages/items/records parse per DR-011
  data rules) and `specs.read` (confined record fetch), with
  fixture-tree tests covering nested directories, group subsets,
  prefix mismatches, path-inconsistent basenames, empty and
  malformed files
- [ ] Spec view UI: outline tree with per-group counts, package
  expansion with section-preserving item lists, one-line item rows
  expanding to full markdown, group filters + text search,
  citation jumps + Verifies backlinks + copy-ID, records reader,
  freshness triggers, view-state persistence, empty/degraded
  states
- [ ] Workspace IA: nav renamed Workspace with the Projects
  surface dissolved into the Repo tab + palette; project bar +
  centered palette (filtering, add/create/open-folder, live-state
  rows, keyboard contract); first-turn tab titles; per-project
  last-active-tab memory; scoped past sessions with all-projects
  toggle; shortcuts (Cmd/Ctrl+P, Cmd/Ctrl+Shift+S, amended tab
  cycling)
- [ ] Store: `currentProjectId` contract (palette / focusSession /
  boot persistence), bootstrap activation within the current
  project, attention routing that focuses the needy session
- [ ] Dev harness: fake dev-core seeds a demo `specs/` tree
  (nested directory, mixed group coverage) so the view demos live
- [ ] Specs: DR-011 recorded; SPECV package (user/dev/test); RUN
  and PROJ amendments; map.md rows

## Acceptance criteria

- Root build/test green with the fixture-tree parser tests and
  spec-view component tests.
- Live walkthrough: palette-driven project switch restoring
  per-project tabs; spec view over the seeded demo tree (filters,
  search, item expand, Verifies jump, copy ID); Repo tab showing
  the current project's state.
- Electron acceptance passes with zero console errors; the spec
  view renders spex's own specs tree (275+ items) legibly.
