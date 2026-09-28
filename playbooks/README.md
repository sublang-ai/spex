<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Maintainer playbooks

Playbook sources for work on this repository that a maintainer runs
through Spex itself. Each file is prose the compiler turns into a
workflow; nothing here is compiled in the repository.

| Source | Command | What it does |
| --- | --- | --- |
| [`release.md`](release.md) | `/release` | Prepares one app release: reconciles the changelog with the commits, bumps both shell manifests, runs the gates the release kind requires (the smoke, the live smoke, and the regression for a regular release), records their outcomes under `docs/releases/`, and stops before the tag, which stays the Boss's act. |

## Compile and register

1. In Spex, open Playbooks → New playbook, give it the source's id (`release`), and choose Paste in the Source tab; paste the file's text and use it as the source.
2. Compile from the workspace's own control. The compile runs on the draft's agent — pick a roster player for it when the Captain's block is not the one you want.
3. Register: one session player per role, then invoke it from a session on this repository, for example `/release regular 0.9.0` or `/release beta 0.9.0-beta.1`.

The compiled artifacts live in the Spex home's library, not here: they
depend on the installed playbook engine, so each maintainer compiles
the source once per engine generation.
