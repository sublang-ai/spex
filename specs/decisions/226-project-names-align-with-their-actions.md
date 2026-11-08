<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-226: Project Names Align with Their Actions

## Status

Accepted (2026-11-08) under the owner's design delegation after review of the local Space rows.
Amends [DR-172](172-surfaces-a-fresh-user-reads.md) in code-location presentation and extends [DR-209](209-a-project-row-with-one-menu.md) in project-row alignment.

## Context

A project name followed by metadata forms a taller block than its opening action, so centering the action against that block places it below the name.
A code glyph alone on the metadata line leaves its meaning behind a tooltip, and the owner asked what it meant.

## Decision

- A Space row aligns its project name and action group within matching 28-pixel leading frames, with secondary metadata beneath the name at the same leading edge.
  At narrow widths the action group wraps within the row.
- Configured code reads as the secondary caption "Code: <where>", retaining the same phrase in its tooltip and the existing omission below 28rem.
  Its location keeps the Space display-name and code-address rules of the existing code status.
- Missing code configuration retains its labelled information control and attached explanation.

## Consequences

The project name and opening action share one visual line while metadata can vary in height.
The code location is readable without interpreting a glyph or hovering it.
Browser verification includes a long-named project that has not been opened here, rows with other metadata, and narrow reflow.
