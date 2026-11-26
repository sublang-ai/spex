<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-011: Project-First Workspace and the Spec View

## Status

Accepted.
Amended by [DR-015](015-reference-content.md), [DR-019](019-inline-agent-configuration.md), [DR-029](029-session-history-home.md), [DR-035](035-intent-ledger.md), [DR-038](038-history-is-done-work.md), [DR-043](043-minimal-spec-editing.md), [DR-057](057-space-surface.md), [DR-065](065-repairs-the-reader-answers.md), [DR-136](136-the-first-project-picker-leads-with-a-folder.md), [DR-158](158-a-legible-graph-and-outline.md), [DR-161](161-an-applet-is-a-page-the-ide-serves.md), [DR-172](172-surfaces-a-fresh-user-reads.md), [DR-246](246-remove-groups-and-team-servers-from-the-clients.md).

## Context

- The owner (2026-07-11): each project needs an interactive spec view — organized by spec packages like the `map.md` index, tolerating package directories, packages expanding into items, three colored group filters. And: "rethink the info arch — that's the essential point"; a project has many sessions but one spec view; the project choice belongs above the session level.
- The session had been the primary axis: the tab strip mixed projects, the project was picked per-composer, a Projects surface duplicated project context, and specs were invisible in an app that exists to run spec-driven playbooks.
- A four-lens adversarial panel reviewed the first draft of this DR; its blockers (taxonomy dodged, tab identity undefined, expanded packages illegible at real scale) and majors are resolved below.

## Decision

### Taxonomy: project-first

| Nav | Scope | Content |
| --- | --- | --- |
| Dashboard | all projects | attention queue and per-project ledger groups ([DR-035](035-intent-ledger.md)) |
| Projects (internal `Workspace`) | current project | session tabs + "+", then the tabs Specs, Playbooks, Packages and Overview, then one per installed applet ([DR-038](038-history-is-done-work.md), [DR-161](161-an-applet-is-a-page-the-ide-serves.md), [DR-172](172-surfaces-a-fresh-user-reads.md)) |
| Playbooks | global | the global playbooks and their authoring |
| Space | global | sign-in, the person's projects and their records ([DR-057](057-space-surface.md)) |
| Settings | global | agents, language, config |

- The sidebar carries project identity ([DR-029](029-session-history-home.md)); Dashboard is deliberately the one cross-project surface.
- A project's repository facts (git state, GitHub binding) and removal live in its Overview tab.

### Project palette (the switcher)

- The sidebar's palette control — or Cmd/Ctrl+P, or Enter in a composer with no project chosen — opens a centered command-palette popover: filter-as-you-type list of the local projects, "Open folder…" (native picker when present), add-by-path, and "Create a project…"; the welcome page's own-project action opens it in a first-project layout ([DR-136](136-the-first-project-picker-leads-with-a-folder.md)).
- The palette is where projects are browsed, chosen and created; a Space repair also adds the project it names ([DR-065](065-repairs-the-reader-answers.md)), and personal projects at a Space are discovered and opened through Space ([DR-246](246-remove-groups-and-team-servers-from-the-clients.md)).
- Palette rows carry each project's live state: running-session count (emerald dot) and attention (amber/red dot + count), so quiet runs in other projects stay one keystroke away. Each sidebar project row carries the same attention dot in its most severe color.
- Keyboard contract: the palette owns focus while open; arrows/Enter pick, Escape closes; when opened from a composer, focus returns to that composer with the draft intact and never auto-sends. Cmd/Ctrl+P is preventDefault'ed in browsers.

### Workspace state

- Session tabs are titled by the session's first Boss turn (truncated snippet; "new session" before the first turn), full prompt and start time in the tooltip — the project name leaves the tab (it lives in the sidebar). A11y labels use the same title.
- Per-project memory: each project remembers its own working set and which tab is active, restored on switch; arriving via an attention affordance (Dashboard row, palette row) focuses the session that needs the human instead. The current project persists across launches.
- With no project chosen, the strip (including pinned tabs) is absent. The strip renders in every other workspace state, including zero open sessions.
- The start tab has no composer project chip; it names the project a new session would target. Cmd/Ctrl+Shift+[ ] cycle the strip's tabs (sessions and pinned); Cmd/Ctrl+Shift+S toggles Specs ↔ the previous tab.

### The spec view

One per project, from the project's `specs/` tree, editable a whole file at a time ([DR-043](043-minimal-spec-editing.md)).

- **Data.** A `specs.get { projectId }` core command parses the tree in one reply, in the packages layout ([DR-015](015-reference-content.md)); a `specs.read` command returns one record's markdown (path confined to `specs/`). No symlink escape from the project; unknown top-level entries are ignored with a tree notice. Same basename at different paths renders as separate nodes with a consistency notice.
- **Tree.** Left-rooted collapsible outline (directories → package nodes), not a radial mind map: same structure, denser, keyboard/screen-reader operable ([DR-010](010-interface-craft.md) §6/§7). Packages sort by short form within their directory, like `map.md`.
- **Package node.** The collapsed node never knows less than the `map.md` row it mirrors: its identifier, intent and per-group item counts. Expanding shows the items.
- **Items.** Per-file document order with the files' `##` section headings preserved as sub-group labels — never sorted by ID ([[meta-12](../meta.md#meta-12)] makes numbering non-positional). Default row: ID chip + first sentence, one line; expanding renders the full body as markdown (tables, lists, code; horizontal overflow contained). Expand-all per package. Every ID chip is click-to-copy with a confirmation.
- **Groups and color.** The three groups are the package sections — external, internal and test — in sky, lime and teal ([DR-015](015-reference-content.md), [DR-158](158-a-legible-graph-and-outline.md)), hues outside the status palette and clear of interaction purple. Color is never the only channel: chips and counts carry group names and aria-labels.
- **Filters and search.** Three group toggles with project-wide counts, all-on by default, persisted in local UI storage; filtered-out groups hide their items while packages stay visible (muted when emptied) — the structure never vanishes. A filter-as-you-type box matches item IDs and text: matching packages auto-expand, non-matches dim, match count shown.
- **Citations.** All same-tree item citations in item bodies resolve to in-view jumps: expand ancestors, reveal the target even when its group is filtered off (marked "shown despite filter"), scroll and flash. Items show computed inbound backlinks. DR citations open the records reader; external URLs open in the OS browser; unresolvable links render inert.
- **Records.** The tree's records open in an in-app reader with a Back control, reached from the outline pane's footer ([DR-158](158-a-legible-graph-and-outline.md)); no OS editor.
- **Freshness.** The view re-reads on tab activation, window focus, any current-project turn end, and a manual refresh control that shows the last-read time. No file watcher. Expansion, scroll, filters, and search survive re-reads and project switches (state keyed by package path, per project).
- **Empty and degraded states.** No `specs/`: an instructive empty state naming the scaffold command with a copyable block. Parse failures render per-file notices; the view never blanks.

## Consequences

- The spec-view package holds the view; the run-view package holds the start flow, tab strip, and shortcuts; the projects package holds the palette.
- The store gains `currentProjectId` with one contract: set only by the palette, by the sidebar, by `focusSession` (deriving from the session), or at boot (persisted value, else the first open session's project).
- Deferred, recorded: side-by-side spec panel next to a running session (revisit when dogfooding shows frequent mid-run spec consultation); a specs file watcher; per-package coverage badges; open-in-editor.
