<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# FORGE: Forge-Backed Work Lists

## Intent

This composition covers how GitHub work reaches the Boss's
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
the same items, obtained through the project's forge adapter
([PROJ-14](../packages/projects.md#proj-14),
[DASH-6](../packages/dashboard.md#dash-6)).

## Tests

### FORGE-2

Where a registered fixture repository is bound to GitHub
([PROJ-6](../packages/projects.md#proj-6)) and a stub `gh`
executable returns fixture issues and pull requests
([PROJ-15](../packages/projects.md#proj-15)), the integration
suite shall assert that the Repo tab's lists and the Dashboard's
next-work lists ([DASH-6](../packages/dashboard.md#dash-6)) render
the same fixture items for that project ([FORGE-1](#forge-1)) —
the two surfaces agree on the adapter-delivered data.
