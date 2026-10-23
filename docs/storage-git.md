<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Synchronize a spex repository with Git

Every project and group keeps its records in its own spex repository, cloned under `~/.spex/workspace/` and synced on its `spex` branch.
The desktop and server app sync each one from the Space surface without stopping the core.
The commands below are the command-line path for one spex repository and require the core stopped.

Each command names the home with `--home` (else `SPEX_HOME`, else `~/.spex`) and the spex repository with `--repository <key>`, the clone's path under `workspace/`, such as `alice/a-spex` or `@spex.pub/acme/a-spex`.
Spex writes `.gitignore` and `.gitattributes` in every clone for the portable format.

Stop the desktop/server core and all CLI sessions of that spex repository before committing, checking out or merging its records. Run each session on only one device at a time. The commands below operate locally; use ordinary Git fetch/push for transport.

A spex repository may be placed at several instances, one placement per instance, and its clone holds one remote per placement.
Each placement at an instance is a remote named by the instance's folder, such as `@spex.pub` for spex.pub, with the host's id for it in that remote's own section of the clone's Git configuration, `remote.@spex.pub.spexId`, so renaming or removing the remote takes its id with it.
Each placement at an instance is also named in its own tracked file, `placements/<folder>.yaml`.
A remote you named yourself is `origin`, a placement with no instance and no file.
Once the instances migration has moved them, the clones an earlier Spex made that record the host's id have their remote named by the folder too, while a remote you named stays `origin`; `git remote` in the clone shows which.

Sync with each placement in turn, in the order the clone's Git configuration lists them, which is the order they were added, with `origin` last.
The example below syncs the project `@spex.pub/acme/a-spex`, placed first at spex.pub and then at a second instance whose folder is `@spex.example.com`:

```sh
cd ~/.spex/workspace/@spex.pub/acme/a-spex
umask 077
git config --get-regexp '^remote\..*\.url$'
```

Start with the first placement:

```sh
git fetch @spex.pub
node /path/to/spex/scripts/storage-git.mjs --repository @spex.pub/acme/a-spex plan HEAD @spex.pub/spex
git merge --no-commit --no-ff @spex.pub/spex
```

The plan compares both revisions with their common ancestor. Each `sessions/<id>` entry is one complete root/replay-descriptor/chunks/assets bundle, or a legacy manifest/replay/assets bundle; each `intents/<id>` is one intent file with its attachments; each `authoring/<id>` is one authoring session; `environment` is `spex.yaml` with `spex.lock`; the configuration, `project.json` and each `placements/<folder>.yaml` are separate entries. A `conflict` requires an explicit choice even if Git reports a clean text merge. An intent added on either side is never a conflict.

While the merge is pending, choose each conflicting entry, apply the validated selection, commit and push to that placement:

```sh
node /path/to/spex/scripts/storage-git.mjs --repository @spex.pub/acme/a-spex select \
  sessions/<session-id>=theirs \
  intents/<intent-id>=ours

git diff --cached
git commit
git push @spex.pub spex
```

Omit choices for entries that changed on only one side or agree. `select` applies those entries automatically, validates the complete candidate, takes the home and session leases, then stages each selected file. A session, intent or authoring bundle is selected or deleted whole, including its owned assets. Replaced sessions lose local hints and viewed markers. No history is combined or discarded outside Git; the unselected revision remains available there.
For bounded sessions, dependencies precede the replay descriptor and replacement root; obsolete dependencies leave after that root is published, while deletion removes the manifest last.
A chunk added while selection waits for its lease counts as a changed session and refuses replacement.

Where Git answers that the branch is already up to date, there is nothing to select or commit; push and go on.

Then sync the next placement the same way.
Its plan compares against `spex` as the first placement's merge left it, so the entries that merge took from the first placement are your side now:

```sh
git fetch @spex.example.com
node /path/to/spex/scripts/storage-git.mjs --repository @spex.pub/acme/a-spex plan HEAD @spex.example.com/spex
git merge --no-commit --no-ff @spex.example.com/spex
node /path/to/spex/scripts/storage-git.mjs --repository @spex.pub/acme/a-spex select <choices>
git commit
git push @spex.example.com spex
```

Once every placement is merged, push `spex` again to each earlier placement the later merges left behind; each push is a fast-forward:

```sh
git push @spex.pub spex
```

A push that is rejected means that placement moved meanwhile: fetch it and merge it again as above.

A merge may remove a placement's file, or change it to name another repository; leave that remote as it stands.
At its next sync the app drops that remote or, where the file was removed and a signed-in instance's file names the same repository, renames it to that instance.
A placement file that does not read names no placement; `select` and `validate` report it without blocking anything.

Validation failure leaves the selected files unapplied. Resolve the reported issue or use `git merge --abort`. A filesystem failure during application may leave an incomplete merge; run `select` again before reopening. Never bypass a held or unverifiable lease.

After an ordinary checkout or fast-forward, validate before reopening:

```sh
node /path/to/spex/scripts/storage-git.mjs --repository alice/alice-spex validate
```

Validation tightens safe session, chunk and asset permissions and rejects malformed data, mismatched replay bytes, missing chunks or assets, corrupt content, duplicate open sources and invalid dispatches. With the core stopped, pair a spex repository with its working folder on this device:

```sh
node /path/to/spex/scripts/storage-git.mjs --repository alice/a-spex rebind alice/a-spex /local/repository \
  --alias /recorded/repository
```

Repeat `--alias` for other recorded paths. Omit it to retain existing aliases; supplied aliases replace that list. The command rescans history and reports remaining unpaired clones and folders. Aliases let a session continue in the folder it ran in; they do not relocate checkpoints.

**Different repository or module paths permit history only under schema 7.** Git does not undo external actions; continuation still requires repository/effect reconciliation.

See the [catalog](storage.md) for file ownership and the [storage contract](../specs/packages/storage.md) for exact validation and selection rules.
