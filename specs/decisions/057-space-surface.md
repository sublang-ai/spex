<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-057: The Space Surface

## Status

Accepted (2026-09-12) on the owner's mandate to manage the Spex home from the app.
Amends [DR-008](008-native-shell-bridge.md), [DR-011](011-project-workspace.md), [DR-029](029-session-history-home.md), [DR-045](045-unified-session-storage.md).
Amended by [DR-064](064-honest-remote-failure.md), [DR-065](065-repairs-the-reader-answers.md), [DR-103](103-the-home-and-its-groups.md), [DR-111](111-the-core-coordinates-as-git-does.md), [DR-127](127-a-home-signed-in-to-several-instances.md), [DR-128](128-a-spex-repository-placed-at-several-instances.md), [DR-172](172-surfaces-a-fresh-user-reads.md), [DR-246](246-remove-groups-and-team-servers-from-the-clients.md).

## Context

- Since [DR-045](045-unified-session-storage.md) the Spex home is portable, but using that means a terminal: stop the core, `umask 077`, `git fetch`, `plan`, `merge --no-commit`, `select`, `validate`, `rebind`, restart ([docs/storage-git.md](../../docs/storage-git.md)).
  A desktop user has no terminal in the product and no view of what the home holds or what leaves the computer when it syncs.
- The core already owns what a sync needs: the plan/validate/apply code, the session index with its history-replaced broadcast and the intents fold.
- The existing `select` relies on `git merge --no-commit` rewriting the working tree; inside a serving core that is wrong: a text-merged bundle or conflict marker on disk — even briefly, even in a crash window — violates the whole-unit law [[storage-11](../packages/storage.md#storage-11)].
- Three users were walked end to end: the first-time user who wants few gestures; the two-laptop user who wants a daily one-click sync that asks one question per diverged unit in that unit's own words; the curious user who wants to know what the home holds and what never leaves.
- Per-device branches were chosen when Git ran outside the app; inside it they add a branch model to explain and a second merge to narrate, for no safety the whole-unit picker does not already give.
- The interface laws fix the shape: no forced surface switch ([DR-009](009-at-hand-interaction.md)), honest async with in-place confirms ([DR-010](010-interface-craft.md)), 14-character controls and the yield ladder ([DR-041](041-chrome-that-fits.md)).

## Decision

### One surface

- **Space** is a global surface beside Dashboard, Projects, Playbooks and Settings that manages the home's records: understand them (a read-only explorer annotated from the catalog), choose where they sync, sync them, and repair a project's folder ([DR-065](065-repairs-the-reader-answers.md)).
- It offers no branch management, no history browsing, no editing or deleting of files, and no typed credential.
- Amends [DR-011](011-project-workspace.md) and [DR-029](029-session-history-home.md): the sidebar's "Workspace" entry and section read "Projects" in user-facing copy and spec vocabulary, and Space is a surface of the rail; internal identifiers keep `Workspace`.
- Amends [DR-008](008-native-shell-bridge.md): the bridge gains a second capability, `revealPath(path)`, which clears the bridge's own bar.

### A sync run by the core

- Amends [DR-045](045-unified-session-storage.md) §Git synchronization: the app syncs each spex repository's records branch with each of its placements, the core performing every Git operation; per-device branches and the stop-the-core rule remain the command-line path.
- The app never creates or names a per-device branch.
- A sync is: save local changes as a commit → check the placement → compare under the whole-unit law → ask per conflicting unit → apply the selection as one merge commit → refresh the core's view → push.
  "Choices needed" ends the sync with the repository clean; Apply is a sync carrying the choices, replanned against the placement as it stands then.
- The core never runs `git merge`: it stages the selected blobs in a private copy, validates the complete candidate, replaces files by versioned writes, stages them, and composes the merge commit with `write-tree`, `commit-tree` over both branches and a compare-and-swap `update-ref`; a fast-forward is the same validated apply.
  The working tree only ever holds validated, selected bytes; `MERGE_HEAD` never exists; a unit changed under the apply restarts the sync once from Save; an apply interrupted by a crash is repaired from its recorded selection before anything reopens.
- Every tracked path belongs to exactly one unit — a session bundle, an intent, an authoring session, a spec package folder, the environment pair, or a single file — chosen whole; the app performs no text merge.
- Histories that share no ancestor join only by an explicit act, comparing against the empty tree, so a mistyped remote never silently imports foreign sessions; a placement holding no records branch is filled by the first push.
- Git runs non-interactively: `GIT_TERMINAL_PROMPT=0`, `ssh -oBatchMode=yes` where no `GIT_SSH_COMMAND` is set, `LC_ALL=C`, umask 077 around tree-writing steps, signing and hooks disabled for commits it writes, a bounded and cancelable transport, and, where the clone's Space is not signed in and Git has no identity, a committer identity of `Spex <spex@<hostname>>`.
- Authentication at a remote outside a Space is the computer's — SSH keys, agents, credential helpers; the app prompts for and stores no credential for it and refuses a remote URL embedding one.

### What the user sees

- Local and incoming changes are listed by unit in human words — a session by its title, an intent by its title, Settings and other files with a text diff — never a session diff; incoming changes are listed before anything merges.
- Conflicts are chosen per unit under the unit's label, keeping this computer's version or taking the Space's, each side summarized, nothing preselected, confirmed once inline with the safe control focused and the unchosen version named as staying in Git history.
- The explorer is a read-only tree of a repository annotated from the catalog — what it is, whether it syncs or stays here, size, the owning session or intent — with previews for JSON, YAML, Markdown and JSONL; provider hints are withheld; a "Stays on this computer" panel gives every ignored family its reason.
- The desktop reveals a path in the OS file manager through the bridge; the served page copies the path instead.

### Considered and declined

- per-device branches in the app: two branches per person and a merge the user must still perform;
- `git merge --no-commit` inside the core: Git's merge output on disk, a crash window with `MERGE_HEAD`, watchers reading half-merged bundles;
- a background or scheduled sync: transport can hang or fail and a merge can ask a question — both want a person present;
- a modal sync wizard: honest async is a surface the user can leave mid-flight, the steps standing in place;
- a separate Commit control: every commit is a sync's Save step;
- editing or deleting in the explorer: the core is the sole writer, and a file deleted by hand breaks a bundle;
- text-merging playbook sources or rules: a whole-file choice is one question the user can answer;
- conflict copies, tombstones, encrypted hint sync: declined by [DR-045](045-unified-session-storage.md); hints are worthless off their machine.

## Consequences

- The package `space.md` specifies the surface and the sync; `storage.md` holds the unit and join rules; `app-shell` holds the external reveal and the bridge's second capability; `run-view` and `dashboard` say "Projects".
- The protocol carries the `space.*` commands and the `space.state` message; the storage Git code plans over a caller-supplied ancestor behind a seam the command-line tool shares.
- Integration suites and browser journeys sync against a stand-in Git host and a peer home, so every sync test is hermetic.
