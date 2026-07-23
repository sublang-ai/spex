<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-011: Project-First Workspace and the Spec View

## Status

Accepted; the spec view's data layout and group model are amended by [DR-015](015-reference-content.md) — packages-layout parsing with section-kind groups replaces the user/dev/test triple.

## Context

- The owner (2026-07-11): each project needs an interactive spec
  view — organized by spec packages like the `map.md` index, never
  by `user/`/`dev/`/`test/` at the top level, tolerating package
  directories, packages expanding into items, three colored group
  filters. And: "rethink the info arch — that's the essential
  point"; a project has many sessions but one spec view; the
  project choice belongs above the session level.
- Today the session is the primary axis: the tab strip mixes
  projects, the project is picked per-composer, the Projects
  surface duplicates project context, and specs are invisible in
  an app that exists to run spec-driven playbooks.
- A four-lens adversarial panel reviewed the first draft of this
  DR; its blockers (taxonomy dodged, tab identity undefined,
  expanded packages illegible at real scale) and majors are
  resolved below.

## Decision

### Taxonomy: four surfaces, project-first

| Nav | Scope | Content |
| --- | --- | --- |
| Workspace | current project | project bar; session tabs + "+"; pinned Specs and Repo tabs |
| Dashboard | all projects | attention queue, running sessions, work lists, usage (unchanged) |
| Playbooks | global | configured playbooks + compile (unchanged) |
| Settings | global | profiles, captain, notifications, theme (unchanged) |

- The Sessions nav entry is renamed **Workspace**; the standalone
  Projects surface is dissolved: its per-repo content (git state,
  GitHub issues/PRs, forge binding) becomes the workspace's
  **Repo** tab scoped to the current project; registry management
  (add, create, remove) moves to the project palette and the Repo
  tab. Dashboard is deliberately the one cross-project surface.

### Project palette (the switcher)

- The project bar names the current project; activating it — or
  Cmd/Ctrl+P, or Enter in a composer with no project chosen —
  opens a centered command-palette popover: filter-as-you-type
  list of projects, "Open folder…" (native picker when present),
  add-by-path, and "Create a project…". Register→silent-git-init
  fallback (RUN-27) moves to one store action the palette owns.
- Palette rows carry each project's live state: running-session
  count (emerald dot) and attention (amber/red dot + count), so
  quiet runs in other projects stay one keystroke away. The bar
  chip carries a dot in the most severe color of non-current
  projects' attention.
- Keyboard contract: the palette owns focus while open;
  arrows/Enter pick, Escape closes; when opened from a composer,
  focus returns to that composer with the draft intact and never
  auto-sends. Cmd/Ctrl+P is preventDefault'ed in browsers.

### Workspace state

- Session tabs are titled by the session's first Boss turn
  (truncated snippet; "new session" before the first turn), full
  prompt and start time in the tooltip — the project name leaves
  the tab (it lives in the bar). Close confirms and a11y labels
  use the same title.
- Per-project memory: each project remembers its last-active tab
  (session, start, Specs, or Repo), restored on switch; arriving
  via an attention affordance (Dashboard row, palette row) focuses
  the session that needs the human instead. The current project
  persists across launches.
- With no project chosen, the strip (including pinned tabs) is
  absent; the bar and the Captain home's guidance are the whole
  surface. The bar and strip render in every other workspace
  state, including zero live sessions and past-transcript
  browsing.
- The Captain home loses its composer project chip; past sessions
  list is scoped to the current project with an "all projects"
  toggle. Cmd/Ctrl+Shift+[ ] cycle the strip's tabs (sessions and
  pinned); Cmd/Ctrl+Shift+S toggles Specs ↔ the previous tab.

### The spec view

One per project, from the project's `specs/` tree, read-only.

- **Data.** A `specs.get { projectId }` core command parses the
  tree in one reply: packages keyed by relative path + basename
  (META-9); per-group files with intent, items in document order,
  per-file parse errors as notices; decisions/iterations as
  id+title lists; a `specs.read` command returns one record's
  markdown (path confined to `specs/`). No symlink escape from
  the project; unknown top-level entries are ignored with a tree
  notice. Same basename at different paths renders as separate
  nodes with a consistency notice.
- **Tree.** Left-rooted collapsible outline (directories → package
  nodes), not a radial mind map: same structure, denser,
  keyboard/screen-reader operable (DR-010 §6/§7); connector lines
  keep the map feel. Packages sort by short form within their
  directory, like `map.md`.
- **Package node.** Short-form chip (the ID prefix shared by its
  items; fallback: uppercased basename, no chip; per-file prefix
  disagreements → notice), basename, intent (user file's, falling
  back dev, then test), and per-group item **counts** in the group
  colors (zero renders muted; counts carry aria-labels) — the
  collapsed node never knows less than the `map.md` row it
  mirrors. Expanding shows each present group's intent line, then
  the items.
- **Items.** Per-file document order with the files' `##` section
  headings preserved as sub-group labels — never sorted by ID
  (META-12 makes numbering non-positional). Default row: ID chip +
  group tag + first sentence, one line; expanding renders the full
  body as markdown (tables, lists, code; horizontal overflow
  contained). Expand-all per package. Every ID chip is
  click-to-copy with a confirmation tick.
- **Groups and color.** user sky, dev fuchsia, test teal — three
  hues outside the status palette (DR-010 §8: emerald, amber, red,
  indigo keep their meanings). Color is never the only channel:
  chips and counts carry group tags and aria-labels.
- **Filters and search.** Three group toggles with project-wide
  counts, all-on by default, persisted in local UI storage;
  filtered-out groups hide their items while packages stay visible
  (muted when emptied) — the structure never vanishes. A
  filter-as-you-type box matches item IDs and text: matching
  packages auto-expand, non-matches dim, match count shown.
- **Citations.** All same-tree item citations in item bodies and
  `Verifies:` lines resolve to in-view jumps: expand ancestors,
  reveal the target even when its group is filtered off (marked
  "shown despite filter"), scroll and flash. Test items' Verifies
  render as link rows; user/dev items show computed inbound
  "verified by" backlinks. DR/IR citations open the records
  reader; external URLs open in the OS browser; unresolvable
  links render inert.
- **Records.** A footer line — "N decisions · M iterations" —
  opens an at-hand list (id + title); picking one swaps the view
  for the record's rendered markdown with a Back control (no
  DR-008 change; no OS editor).
- **Freshness.** The view re-reads on tab activation, window
  focus, any current-project turn end, and a manual refresh
  control that shows the last-read time. No file watcher yet.
  Expansion, scroll, filters, and search survive re-reads and
  project switches (state keyed by package path, per project).
- **Empty and degraded states.** No `specs/`: an instructive empty
  state naming the scaffold path (`npx @sublang/spex` in the
  project) with a copyable command. Parse failures render per-file
  notices; the view never blanks.

## Consequences

- New spec package SPECV (`spec-view.md`); RUN items for the start
  flow, tab strip, and shortcuts are amended; PROJ items are
  amended to the Repo tab + palette reality.
- The store gains `currentProjectId` with one contract: set only
  by the palette, by `focusSession` (deriving from the session),
  or at boot (persisted value, else the first live session's
  project); bootstrap session activation happens within it.
- `tabTitles()` (project-path titling) is replaced by first-turn
  titling.
- Deferred, recorded: side-by-side spec panel next to a running
  session (revisit when dogfooding shows frequent mid-run spec
  consultation); a specs file watcher; per-package
  coverage badges (inbound backlinks ship now; the aggregate
  badge waits for real use); open-in-editor / reveal-in-Finder
  (needs a DR-008 amendment).
