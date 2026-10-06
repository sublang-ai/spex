<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Synchronize a spex repository with Git

Every project and group keeps its records in its own spex repository, cloned under `~/.spex/workspace/` and synced on its `spex` branch.
The desktop and server app sync each one from the Space surface without stopping the core.
The commands below are the command-line path for one spex repository and require the core stopped.

Each command names the home with `--home` (else `SPEX_HOME`, else `~/.spex`) and the spex repository with `--repository <key>`, the clone's path under `workspace/`, such as `alice/a-spex`.
Spex writes `.gitignore` and `.gitattributes` in every clone for the portable format.

Stop the desktop/server core and all CLI sessions of that spex repository before committing, checking out or merging its records. Run each session on only one device at a time. The commands below operate locally; use ordinary Git fetch/push for transport.

```sh
cd ~/.spex/workspace/alice/a-spex
umask 077

git fetch origin
node /path/to/spex/scripts/storage-git.mjs --repository alice/a-spex plan HEAD origin/spex
git merge --no-commit --no-ff origin/spex
```

The plan compares both revisions with their common ancestor. Each `sessions/<id>` entry is one manifest/replay/assets bundle; each `intents/<id>` is one intent file with its attachments; each `authoring/<id>` is one authoring session; `environment` is `spex.yaml` with `spex.lock`; the configuration and `project.json` are separate entries. A `conflict` requires an explicit choice even if Git reports a clean text merge. An intent added on either side is never a conflict.

While the merge is pending, choose each conflicting entry and apply the validated selection:

```sh
node /path/to/spex/scripts/storage-git.mjs --repository alice/a-spex select \
  sessions/<session-id>=theirs \
  intents/<intent-id>=ours

git diff --cached
git commit
```

Omit choices for entries that changed on only one side or agree. `select` applies those entries automatically, validates the complete candidate, takes the home and session leases, then stages each selected file. A session, intent or authoring bundle is selected or deleted whole, including its owned assets. Replaced sessions lose local hints and viewed markers. No history is combined or discarded outside Git; the unselected revision remains available there.

Validation failure leaves the selected files unapplied. Resolve the reported issue or use `git merge --abort`. A filesystem failure during application may leave an incomplete merge; run `select` again before reopening. Never bypass a held or unverifiable lease.

After an ordinary checkout or fast-forward, validate before reopening:

```sh
node /path/to/spex/scripts/storage-git.mjs --repository alice/a-spex validate
```

Validation tightens safe session and asset permissions and rejects malformed data, mismatched replay bytes, missing referenced assets or corrupt content, duplicate open sources and invalid dispatches. With the core stopped, pair a spex repository with its working folder on this device:

```sh
node /path/to/spex/scripts/storage-git.mjs --repository alice/a-spex rebind alice/a-spex /local/repository \
  --alias /recorded/repository
```

Repeat `--alias` for other recorded paths. Omit it to retain existing aliases; supplied aliases replace that list. The command rescans history and reports remaining unpaired clones and folders. Aliases let a session continue in the folder it ran in; they do not relocate checkpoints.

**Different repository or module paths permit history only under schema 7.** Git does not undo external actions; continuation still requires repository/effect reconciliation.

See the [catalog](storage.md) for file ownership and the [storage contract](../specs/packages/storage.md) for exact validation and selection rules.
