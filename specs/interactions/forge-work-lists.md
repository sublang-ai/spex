<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# FORGE: Forge-Backed Work Lists

## Intent

This interaction spec covers how GitHub work reaches the Boss's
attention: the Projects package binds a repository to its forge and
owns the adapter, and the Dashboard renders cross-project next-work
lists from that same adapter
([DR-006](../decisions/006-projects-and-forge.md)).
The value — one consistent view of what needs doing — emerges only
from the two packages agreeing on the data path.

## Scenario

### FORGE-1

Where a project is bound to a GitHub repository, when its issues and
pull requests are displayed anywhere in the app — the project's Repo
tab or the Dashboard's next-work lists — both surfaces shall present
the same items obtained through the project's forge adapter, with no
second fetch path
([PROJ-11](../packages/projects.md#proj-11),
[DASH-6](../packages/dashboard.md#dash-6)).

## Tests

### FORGE-2
Verifies: [PROJ-19](../packages/projects.md#proj-19), [DASH-6](../packages/dashboard.md#dash-6)

Where a registered fixture repository is bound to GitHub and a stub
`gh` executable returns fixture issues and pull requests, the
integration suite shall assert that the Repo tab's lists and the
Dashboard's next-work lists render the same fixture items for that
project, so both surfaces demonstrably share the adapter.
