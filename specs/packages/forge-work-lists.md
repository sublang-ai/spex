<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# forge-work-lists: Forge-Backed Work Lists

## Intent

This package covers how GitHub work reaches the Boss's attention: the Projects package binds a repository to its forge and owns the forge adapter, and the Dashboard renders per-project Sources rows from that same adapter.
The value — one consistent view of what needs doing — emerges only when the two packages agree on the data path.

## External Behavior

### forge-work-lists-1

Where a project is bound to a GitHub repository and its forge data is served through the project's forge adapter, when its issues and pull requests are displayed anywhere in the app — the project's Overview tab [[projects-6](projects.md#projects-6)] or the Dashboard's Sources rows [[dashboard-6](dashboard.md#dashboard-6)] — both surfaces shall apply one selection and representation, presenting identical items whenever they render the same adapter fetch:

- each row carries its entry's number and title, at most two of its forge labels as tags followed by a "+N" tag whose title lists every label ([DR-041](../decisions/041-chrome-that-fits.md)), and a Queue control capturing the entry as an intent;
- a row whose issue or pull request already has an open intent shows that intent's state in place of the Queue control, on both surfaces alike, and regains the control when that intent closes;
- the row's trailing cluster yields before the row widens its pane ([DR-041](../decisions/041-chrome-that-fits.md)): the title owns the row's slack, the state chip truncates within 6rem with its words in its tooltip, and below 28rem of row the label tags — at-a-glance duplicates — leave, every label riding the row's own title.

## Verification

### forge-work-lists-2

Where a registered fixture repository is bound to GitHub and a stub `gh` executable on `PATH` reports an authenticated account and returns fixture issues and pull requests carrying labels, the integration suite shall assert that the Repo tab's lists and the Dashboard's Sources rows render the same fixture items for that project — numbers, titles, label tags, and Queue controls alike [[forge-work-lists-1](#forge-work-lists-1)] — and that while one fixture issue holds an open intent, both surfaces show that intent's state in place of that row's Queue control, restoring the control after the intent closes [[forge-work-lists-1](#forge-work-lists-1)].
