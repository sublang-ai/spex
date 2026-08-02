<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# forge-work-lists: Forge-Backed Work Lists

## Intent

This package covers how GitHub work reaches the Boss's attention: the Projects package binds a repository to its forge and owns the forge adapter, and the Dashboard renders cross-project next-work lists from that same adapter.
The value — one consistent view of what needs doing — emerges only when the two packages agree on the data path.

## External Behavior

### forge-work-lists-1

Where a project is bound to a GitHub repository and its forge data is served through the project's forge adapter, when its issues and pull requests are displayed anywhere in the app — the project's Repo tab [[projects-6](projects.md#projects-6)] or the Dashboard's next-work lists [[dashboard-6](dashboard.md#dashboard-6)] — both surfaces shall apply one selection and representation, presenting identical items whenever they render the same adapter fetch.

## Verification

### forge-work-lists-2

Where a registered fixture repository is bound to GitHub and a stub `gh` executable on `PATH` reports an authenticated account and returns fixture issues and pull requests, the integration suite shall assert that the Repo tab's lists and the Dashboard's next-work lists render the same fixture items for that project [[forge-work-lists-1](#forge-work-lists-1)] — the two surfaces present the same forge data for the project.
