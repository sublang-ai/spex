<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-057: The Space Surface

## Status

Accepted (2026-09-12) on the owner's mandate to manage the Spex home from the app.
Amends ([DR-046](046-decision-record-evolution.md)):

- [DR-045](045-unified-session-storage.md) §Git synchronization: the app syncs one shared branch `main`, the core performs every Git operation under the home lease it holds and between Boss turns, and a home joining an existing remote compares against the empty tree; per-device branches and the stop-the-core rule remain the command-line path.
- [DR-011](011-project-workspace.md) and [DR-029](029-session-history-home.md): the sidebar's "Workspace" entry and section read "Projects" in user-facing copy and spec vocabulary, and the taxonomy gains a fifth surface, Space, between Playbooks and Settings; internal identifiers keep `Workspace`.
- [DR-008](008-native-shell-bridge.md): the bridge gains a second capability, `revealPath(path)`, which clears the bridge's own bar.

## Context

- Since [DR-045](045-unified-session-storage.md) the Spex home is portable, but using that means a terminal: stop the core, `umask 077`, `git fetch`, `plan`, `merge --no-commit`, `select`, `validate`, `rebind`, restart ([docs/storage-git.md](../../docs/storage-git.md)).
  A desktop user has no terminal in the product and no view of what `~/.spex` holds or what leaves the machine when it is shared.
- The core already owns what a sync needs: the home lease [[storage-14](../packages/storage.md#storage-14)], the plan/validate/apply code, the session index with its history-replaced broadcast, the intents fold, and — since [DR-051](051-runtime-held-for-a-turn.md) — the fact that between turns nothing writes sessions, so "stop the writers" is a check the core makes rather than an instruction to the operator.
- The existing `select` reserves the home lease itself and relies on `git merge --no-commit` rewriting the working tree; inside a serving core both are wrong: the lease is already held, and a text-merged bundle or conflict marker on disk — even briefly, even in a crash window — violates the whole-unit law [[storage-11](../packages/storage.md#storage-11)].
- Three users were walked end to end: the first-time user with an empty repository who wants three gestures; the two-laptop user who wants a daily one-click sync that asks one question per diverged unit in that unit's own words; the curious user who wants to know what the directory holds and what never leaves.
- Per-device branches were chosen when Git ran outside the app; inside it they add a branch model to explain and a second merge to narrate, for no safety the whole-unit picker does not already give.
- The interface laws fix the shape: no forced surface switch ([DR-009](009-at-hand-interaction.md)), honest async with in-place confirms ([DR-010](010-interface-craft.md)), 14-character controls and the yield ladder ([DR-041](041-chrome-that-fits.md)).

## Decision

### One surface, four duties

- **Space** is a global surface — Dashboard, Projects, Playbooks, Space, Settings — that manages the Spex home and nothing else: understand it (a read-only explorer annotated from the catalog), set it up (Initialize, Join a space, the remote), share it (what leaves this device and what never does), and sync it.
- Nothing beyond that: no branch management, no history browsing, no editing or deleting files, no credential entry, no binding controls of its own — an unbound project is pointed to the project palette, which already rebinds.

### One shared branch, synced by the core

- Every device's home is on `main` with one remote, `origin`; the app never creates or names a device branch, and a home on another branch is shown as such with Sync refused.
- A sync is: save local changes as a commit → check the remote → compare under the whole-unit law → ask per conflicting unit → apply the selection as one merge commit → refresh the core's view → push.
  "Choices needed" ends the sync with the repository clean; Apply is a sync carrying the choices, replanned against the remote as it stands then.
- The core is the only actor: it runs `git` itself under the home lease it already holds, admits a sync only while no session of any project has a turn in flight, no session is held by another host, no compile runs and no other Space operation runs — refusing by name otherwise — and while a sync runs refuses every command that writes under the home, intent commands included.
  The gate is set before the admission checks, so a turn cannot slip between check and act.
- The core never runs `git merge`: it stages the selected blobs in a scratch directory, validates the complete candidate, replaces files atomically, stages them, and composes the merge commit with `write-tree`, `commit-tree -p main -p origin/main` and a compare-and-swap `update-ref`; a fast-forward is the same validated apply with `main` moved to the remote's commit.
  The working tree only ever holds validated, selected bytes; `MERGE_HEAD` never exists; a working tree that changed under the sync restarts it once from the save step; an apply interrupted by a crash is repaired from its recorded selection before anything reopens.
- Every tracked path belongs to exactly one unit — a session bundle, a `playbooks/<id>/` directory, or a single file — chosen whole; the app performs no text merge.
- A home whose `main` shares no ancestor with the remote's joins only on an explicit Join, comparing against the empty tree, so a mistyped remote never silently imports foreign sessions; a remote holding no `main` is filled by the first push.
- Git runs non-interactively: `GIT_TERMINAL_PROMPT=0`, `ssh -oBatchMode=yes` where no `GIT_SSH_COMMAND` is set, `LC_ALL=C`, umask 077 around tree-writing steps, signing and hooks disabled for the space repository, a bounded and cancelable transport, and a committer identity of `Spex <spex@<hostname>>` where Git has none.
  Authentication is the machine's — SSH keys, agents, credential helpers; the app prompts for and stores no credential and refuses a remote URL embedding one.

### What the user sees

- Local and incoming changes are listed by unit in human words — a session by its title and project (new, updated, deleted); a queue by acts appended per project; the registry by registrations; Settings and playbook sources with a text diff — never a session diff; incoming changes are listed before anything merges.
- Conflicts are chosen per unit under the unit's label, "Keep mine" or "Take remote", each side summarized, nothing preselected, confirmed once inline with the safe control focused and the unchosen version named as staying in Git history.
- The explorer is a read-only tree of the home annotated from the catalog — what it is, whether it is shared or stays here, size, the owning project or session — with previews for JSON, YAML, Markdown and JSONL; provider hints, migration inputs and config backups are withheld; a "Stays on this device" panel gives every ignored family its reason.
- The desktop reveals a path in the OS file manager through the bridge; the served page copies the path instead.

### Considered and declined

- per-device branches in the app: two branches per person and a merge to `main` the user must still perform;
- `git merge --no-commit` inside the core: Git's merge output on disk, a crash window with `MERGE_HEAD`, watchers reading half-merged bundles;
- a background or scheduled sync: transport can hang or fail and a merge can ask a question — both want a person present;
- a modal sync wizard: honest async is a surface the user can leave mid-flight, the steps standing in place;
- a separate Commit control: the first commit is Initialize's, every later one is Sync's first step;
- editing or deleting in the explorer: the core is the sole writer, and a file deleted by hand breaks a bundle;
- text-merging playbook sources or rules: a whole-file choice is one question the user can answer;
- conflict copies, tombstones, encrypted hint sync: declined by [DR-045](045-unified-session-storage.md); hints are worthless off their machine.

## Consequences

- New package `space.md`; `storage-11` and `storage-19` gain the playbook-directory unit and the empty-tree join, `storage-5` the `space:lastSync` key, `storage-10` a note that the app path exists; `app-shell` gains the external reveal item and the bridge's second capability; `run-view`, `dashboard` and the shortcut sheet say "Projects" and count five surfaces; `docs/storage.md` and `docs/storage-git.md` describe the app path beside the command-line one.
- The protocol gains the `space.*` commands and the `space.state` message and bumps its version; `storage-git.ts` gains a seam that plans over a caller-supplied ancestor and applies under a caller-held lease; `Store` gains one reload of its application indexes; the CLI script keeps its command surface.
- The journey harness gains a bare `file://` remote and a peer home, so every sync journey is hermetic; the fit and accessibility journeys gain the surface.
- Left open: a live journey against a hosted remote (manual release smoke until CI holds a deploy key); retention of the space repository's history.
