<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-070: Playbook Artifacts in the Views They Deserve

## Status

Done.

## Intent

A playbook's Gears stage is a GEARS package file, so the Playbooks card renders it with the Specs outline's own item rows — chip, group, first line, an expandable body, in-file citation jumps — instead of a wall of markdown, and the State machine stage keeps its derived state list pinned above the scrolling code rather than scrolled away with it ([DR-011](../decisions/011-project-workspace.md), [DR-005](../decisions/005-compilation-integration.md)).

## Deliverables

- [x] The Gears stage parses the artifact with the Specs view's package parser and renders its items as the outline's read-only item rows, collapsed by default, each expanding to its body, with a citation of another item in the same artifact jumping within the box; an artifact the parser cannot read falls back to rendered markdown (playbook-library-22, spec-view).
- [x] The State machine stage pins its state list as the box's header above the scrolling code, so the states stay in view at any scroll position and any frame height (playbook-library-22).
- [x] Unit coverage of both stages over the built-in artifacts and the Playbooks journey extended; the fit journey stays green.

## Tasks

1. Gears items through the outline's rows; spec items amended.
2. Pinned state list; tests and the journey.

## Verification

- `npm test -w packages/core`: 183 tests pass, including the artifacts suite — the compiled layout's gears served parsed with first lines, bodies, and citations; gears the parser reads no item from serving markdown alone; and every installed built-in (code, review, decide) serving its shipped gears as items.
- `cd packages/ui && npx vitest run`: 426 tests pass, the Library suite covering the Gears rows collapsed on ID, group, and first line with no edit control, one row expanding to its body, a sibling citation landing expanded and highlighted, the markdown fallback where the parse is absent, and the state list standing outside and above the scroll frame.
- `npx tsc --noEmit -p packages/ui`: clean, after the outline's item row moved to `SpecItemRows.tsx` with the spec view's own coverage (77 tests) unchanged.
- `cd e2e && npx playwright test`: 36 journeys pass, including the Playbooks journey working the Gears rows and the pinned state list past a scrolled frame, and the fit journey at every width.
- `node packages/cli/dist/cli.js lint`: no problems found.
