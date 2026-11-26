<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-221: The Personal Records Folder Is a Lowercase Name, Checked Before It Moves

## Status

Accepted (2026-11-03) on the owner's direction.
Amends [DR-103](103-the-home-and-its-groups.md), [DR-127](127-a-home-signed-in-to-several-instances.md).

## Context

- A first sign-in as a login with capitals moved every clone in the personal records folder while `home.yaml` refused the new folder name, so the sidebar listed no project and no session.
- The personal records folder's name in `home.yaml` must be lowercase kebab-case, while a login at a Space may hold capitals, `.` or `_`.
- A folder under `workspace/` whose name ends `-spex` is read as a clone, so a personal records folder so named hides the clones inside it.
- The first sign-in named the folder after the login as the host spells it, moved the clones on disk, then wrote `home.yaml`, which refused the name: the clones stood where the home named nothing.
- A Space accepts only lowercase kebab-case repository names, so the global records repository, named after the login as the host spells it, was refused for such a login and never created.
- A host's rename, a sync's follow and choosing a Space for a clone also move a clone on disk before `home.yaml` follows.

## Decision

- Amends [DR-103](103-the-home-and-its-groups.md) and [DR-127](127-a-home-signed-in-to-several-instances.md) in the name the first sign-in gives the personal records folder, and in when a move of clones on disk is checked against `home.yaml`.
- The first sign-in names the personal records folder after the login in lowercase kebab-case — every run of characters other than `a`–`z` and `0`–`9` one hyphen, none leading or trailing — or `me` where nothing remains, and the global records repository `<that name>-spex`.
  A trailing `-spex` is dropped, since a folder so named reads as a spex repository's clone rather than the personal records folder.
- The global records repository at a Space takes the same name, `<that name>-spex`, since a Space accepts only lowercase kebab-case repository names.
- Every move of clones on disk — the sign-in's, a sync's and choosing a Space's — first checks that `home.yaml` reads and would stand with the move written, and moves nothing where it would not.
- A move that fails partway, or whose write of `home.yaml` fails after the clones moved, moves the clones already moved back, last first, each only onto a path that stands empty or, after a case-only rename where the filesystem folds case, is the clone itself, leaving `home.yaml` as it was.

## Consequences

- A first sign-in with any login leaves `home.yaml` and `workspace/` agreeing.
- A home already left in the earlier state is not repaired by this decision.
- A crash between the moves on disk and the write of `home.yaml`, or a clone that cannot move back, is not recovered by this decision.
