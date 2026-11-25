<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-251: Installs Copy from the Store

## Status

Accepted (2026-11-25), by the owner's direction.
Amends, under [DR-046](046-decision-record-evolution.md):

- [DR-104](104-spec-package-format-and-client-environments.md) in how the store's bytes reach an installed tree and in the store's layout: an install copies them, and the executable copy kept apart goes;
- [DR-165](165-one-package-manager-hosted-by-the-cli-and-the-app.md) in the one sentence saying the store is hard-linked into installs;
- [DR-113](113-a-projects-environment-lives-in-its-working-folder.md) in the store it says stands as DR-104 decided.

The store itself, its place under the home, the lock's digests, atomic installs and the collection at the core's start stand.

## Context

- [DR-104](104-spec-package-format-and-client-environments.md) took the store from pnpm: each distinct file once, named by its SHA-256, hard-linked into every environment installing it, "so installs share bytes" [[1]].
  That sentence is the only reason any record gives, and the record's declined alternatives never weigh plain copies.
- The saving is small.
  On the owner's device the store holds 3.2 MB for five environments, so links save about 6.4 MB over copies.
- The cost is not.
  A hard link shares its file's bytes and mode with every other link:
  - a stored file must be read-only, since an edit through any link changes every environment's file and the store's;
  - an executable file needs a second stored copy, under `store/x/<sha256>`, because links share one mode;
  - Windows keeps one read-only mark for all links of a file and refuses to remove a read-only file, so removing any installed tree there makes the stored files writable, and the store marked them read-only again before each link, after each removal and at each collection.
- That last rule took a pull request of its own on 2026-11-06 [[2]], 445 lines added over 11 files, with a suite of 294 lines that CI runs on Windows on the Node the app ships.
- npm keeps the same kind of store, a cache of verified content under the user's home, and copies out of it into each project, checking the content's integrity as it reads [[3]].
- What the store does beside sharing bytes is worth keeping: bytes are verified against the lock's digest before they are kept, the built-in spec package installs offline from its seed, an update fetches only the files the store lacks, and a tree is built again from stored bytes without the network.
- Environments installed until now are hard links, read-only, in every folder the app or the command line installed into, and the home records only the folders the app knows.

## Decision

### Principle

The store is a cache of verified bytes, and an install copies from it.
An installed tree shares nothing with the store or with another environment.

### The store

- The store stays under the home and keeps each distinct file once, under `store/<sha256>`, written once after its digest is verified.
- A stored file is written read-only, a guard against an edit by mistake.
  Nothing relies on that mark and nothing restores it: every copy out is checked instead.
- `store/x/` goes.
  Whether a file is executable is the lock's fact about a path, not a second kind of stored bytes.
- The collection at the core's start stands: it removes the stored files no lock of an environment the home knows selects and no seeded built-in release holds, so the cache stays bounded, and it marks nothing.

### An install

- An install copies each selected file out of the store into the staged tree, then swaps the tree in as before.
- The copy's bytes are hashed as they are read.
  Bytes that no longer match their digest are never installed: the stored file is removed, the install fails naming the file with the last files in place, and the next install fetches it again.
- An installed file is an ordinary writable file, `0755` where the lock marks it executable and `0644` otherwise, whatever the umask.
  The read-only mark existed to protect bytes that every link shared; a copy shares none, and a read-only tree is what made removing one differ by platform.
- `.spex/` stays nothing the reader's to edit.
  An install still takes a tree as current by its install record and the presence of its files, as npm takes `node_modules`, so an edit inside `.spex/packages/` stands until the lock changes or the reader deletes the tree and installs again.
- Removing a tree still makes a read-only file writable first on Windows and still follows no link, for trees an earlier release installed, for Git's objects and for a playbook's engine links.
  It no longer touches the store.

### Existing homes

- A tree records how it was installed: the install record under `.spex/packages/` moves to `format: 2`, which says its files are copies.
- A tree whose record is of the former format is not the lock's installed tree to an install, so the next install by this release replaces it whole with copies, from the store, fetching only what the store lacks.
  Until then it reads installed and runs as it did.
- The core installs every environment the home knows at its start, so each one whose install runs and succeeds is copies after the first start with this release.
  One whose install does not run or does not finish keeps its former tree until an install of it succeeds: a lock gone stale, a project with no folder on this device, a fetch that fails.
  A folder only the command line installed into follows at its next `install`, `add`, `update` or `remove`.
- A file's former copy under `store/x/<sha256>` is taken as the stored file where the store lacks it, its digest verified as any stored bytes are: at an install that selects the file, and at the collection for every file it keeps, so a lock whose install did not run, stale or with no folder on this device, keeps its bytes.
  The collection then removes `store/x/`, keeping only a copy it could not take for a reason other than its digest, such as a store that takes no new file, for a later collection; replacing a former tree of an environment the home knows needs no network.
- A folder only the command line installed into was never among the locks the collection reads, under the earlier release as now, so its files may have left the store, and replacing its tree may fetch them.
- No receipt is written under `local/migrations/`.
  A receipt keeps the reader's original bytes so a migration can be undone or resumed; an installed tree holds none, the lock rebuilds it, and its own record says whether it was replaced.
- The Windows re-marking goes with this release, not after a later one.
  Removing a former tree there still makes stored files writable, and the file of a former tree not yet replaced, in a folder the home does not know or of an environment whose install has not succeeded yet, may be writable while it still shares bytes with the store.
  The check at each copy is what makes that safe for every tree this release installs: bytes changed through such a link are never copied into another environment.
  Former trees not yet replaced, wherever they stand, still share their files with each other and with the store until each is installed again, as under the earlier release, now without the read-only mark on Windows once a removal has cleared it.
- An earlier release installing into a folder links it again, and the next install by this release copies again; the app and the command line upgrade together.

### Considered and declined

- Keeping hard links where the file system allows and copying elsewhere: two behaviors to specify and test, and the read-only, mode and Windows rules stay for the saving above.
- Dropping the store as well, fetching each release into its environment: the built-in spec package would not install offline, an update would fetch whole releases, and unverified bytes would have no one place they are checked.
- Read-only installed copies, as Go keeps its module cache: a guard for files the lock rebuilds, paid for by a tree that ordinary tools refuse to remove on Windows.
- Verifying every installed file against the lock at each install: npm does not for `node_modules`, and an edit there harms only its own tree.
- A migration with a receipt that walks every environment once: it cannot reach folders the home does not know, and the install record already says which trees remain.
- Keeping the re-marking until every former tree is gone: no release can know that, since the command line installs into folders the home never sees.
- No collection, as npm leaves its cache to grow: the collection exists, is cheap and keeps the home small.

## Consequences

- These specs change: `environments` for the store, the copy, the former tree, the collection and their verification; `playbook-library` for the test that prepares a module linked from the store; `storage` for the home's table.
- The library's store loses `link`, `removeLinked` and the executable half of every key, so the next release of `@sublang/spex` is a major.
- The Windows coverage on the Node the app ships narrows to what Windows still does differently: read-only files from an earlier release or from Git, and junctions.
- Acceptance checks: an installed tree reading whole after its stored files are removed; two environments holding one file as independent copies, an edit or a removal in one leaving the other and the store as they were; a wrong digest installing nothing; a stored file changed behind the store installing nothing and fetched at the next install; `cache/` deleted mid-way rebuilt; the built-in spec package installing offline; an update fetching only the files the store lacks; a former linked tree replaced by copies with nothing fetched; a file a stale lock selects, stored under `store/x/` alone, still stored after the collection.
- What the reader sees: `.spex/packages/` a few megabytes larger per environment, its files writable, and one reinstall of each environment at the first start.

## References

[1]: https://pnpm.io/motivation "pnpm: Motivation"
[2]: https://github.com/sublang-ai/spex/pull/366 "Spex pull request 366 — Remove read-only store files on Windows"
[3]: https://docs.npmjs.com/cli/v11/commands/npm-cache "npm cache: data verified for integrity on insertion and extraction"
