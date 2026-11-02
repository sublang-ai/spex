<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-187: The Group Chooser Belongs to Its Project

## Status

Accepted (2026-11-02) on the owner's request to integrate the group chooser with the surrounding typography and make its project unmistakable.
Amends [DR-180](180-choose-a-group-before-adding.md) in the chooser's visual attachment and scale; destination selection, sharing review and explicit confirmation remain.
Applies [DR-010](010-interface-craft.md)'s one visual grammar and [DR-041](041-chrome-that-fits.md)'s container fit to the existing inline form.

## Context

The group chooser was structurally inside its project row but looked like a separate elevated card.
Its white fill, shadow, large heading and generous spacing gave it more emphasis than the surrounding list.
A title naming the project did not compensate for that visual separation from the row that opened it.

## Decision

- In Space, the owning project row and its chooser form one continuous expanded block with a quiet shared background and a thin interaction-colour left rule.
- The original project name and opening control stay visible; the opener identifies the expanded form for assistive technology, and the form keeps its visible project-specific title.
- The chooser uses the surrounding list's normal 14-pixel text, a medium-weight title, 12-pixel secondary labels and standard action buttons; spacing is compact without shrinking hit targets or hiding consequences.
- The chooser has no independent raised card, shadow, white slab or oversized heading; its content width is bounded and its text wraps within the available container.
- Inside the project palette, the same compact form uses the palette's existing enclosing surface without row-specific decoration or another nested card.
- Destination selection still sends nothing until explicit confirmation, and the complete destination and access review stays visible before submission.
- While submitting, the owning row's controls cannot close or replace the form; success and cancellation retain the existing focus and acknowledgement behavior.

## Consequences

A reader can identify the affected project from both the list structure and the form's title.
The change uses the current visual system and preserves the existing protocol and group-selection flow.
Acceptance checks compare the form with neighboring rows in light and dark themes, both languages and narrow containers.
