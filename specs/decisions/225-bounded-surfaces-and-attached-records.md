<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-225: Bounded Surfaces and Attached Records

## Status

Accepted (2026-11-08) under the owner's delegation to resolve Playbooks scrolling, Space width and the distance between a row and its records.
Extends [DR-041](041-chrome-that-fits.md) with the content and scroll bounds of global Playbooks and Space, [DR-159](159-projects-in-groups-opened-where-you-work.md) with records expanded beneath their row, and [DR-198](198-consistent-inline-group-actions.md)'s attached presentation to those records.
The dismissal and pending-operation contracts of [DR-211](211-a-panel-carries-its-own-way-out.md) and [DR-212](212-panel-dismissal-as-quiet-chrome.md) apply within the expansion.

## Context

Playbooks bounds its content and its scrolling to the same narrow box, so scrolling over the surrounding empty space does nothing.
Space stretches project names and their controls across the available width, and opens records after the entire groups list, separating an action from its context.
Bounded responsive content is an established layout pattern [[1]], and expanded rows keep supplementary information beside the item it describes [[2]].

## Decision

- Global Playbooks and Space use a centered content column capped at 48rem inside a positioned, height-constrained surface that spans the available width.
  The surface owns vertical scrolling across the content and both side gutters.
- Space opens one repository's Sync and Explore tabs immediately beneath its owning row, before the next row.
  The row and records use the same continuous quiet expansion, left rule, type scale and spacing as Members and Add to a group.
- The row's name remains a disclosure, with its expanded state and controlled panel exposed to assistive technology [[3]].
  Sync and Explore retain their tabs, contextual trailing Close, nearest Escape, opener focus restoration and pending-mutation guards.
- Explore stays in the surface flow with a viewing area for its tree and preview of 60vh bounded between 24rem and 36rem.
  Its tree and preview retain their own scrolling and existing 42rem side-by-side threshold, stacking beneath it.

## Consequences

The bounded content keeps each row's identity and controls close together while the full surface remains available for scrolling.
Records stay adjacent to their owner within the existing groups hierarchy.
Browser evidence covers gutter scrolling, inline placement, wide and narrow fit, both themes and both interface languages.

## References

[1]: https://design-system.service.gov.uk/styles/layout/ "GOV.UK Design System: Layout"
[2]: https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines "Carbon Design System: Data table"
[3]: https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/ "WAI-ARIA Authoring Practices: Disclosure"
