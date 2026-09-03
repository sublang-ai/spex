<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-070: Playbook Artifacts in the Views They Deserve

## Status

In progress.

## Intent

A playbook's Gears stage is a GEARS package file, so the Playbooks card renders it with the Specs outline's own item rows — chip, group, first line, an expandable body, in-file citation jumps — instead of a wall of markdown, and the State machine stage keeps its derived state list pinned above the scrolling code rather than scrolled away with it ([DR-011](../decisions/011-project-workspace.md), [DR-005](../decisions/005-compilation-integration.md)).

## Deliverables

- [x] The Gears stage parses the artifact with the Specs view's package parser and renders its items as the outline's read-only item rows, collapsed by default, each expanding to its body, with a citation of another item in the same artifact jumping within the box; an artifact the parser cannot read falls back to rendered markdown (playbook-library-22, spec-view).
- [ ] The State machine stage pins its state list as the box's header above the scrolling code, so the states stay in view at any scroll position and any frame height (playbook-library-22).
- [ ] Unit coverage of both stages over the built-in artifacts and the Playbooks journey extended; the fit journey stays green.

## Tasks

1. Gears items through the outline's rows; spec items amended.
2. Pinned state list; tests and the journey.

## Verification

Recorded on completion.
