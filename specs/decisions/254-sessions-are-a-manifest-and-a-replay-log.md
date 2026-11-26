<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-254: Sessions Are a Manifest and a Replay Log

## Status

Proposed (2026-11-26).
Amends [DR-045](045-unified-session-storage.md), [DR-050](050-shared-storage-cutover.md), [DR-144](144-bounded-session-storage.md), [DR-189](189-repairs-explain-the-next-step.md), [DR-194](194-saved-work-is-a-choice-not-setup-debt.md), [DR-197](197-dismiss-reminders-without-losing-history.md).

## Context

- Playbook's DR-111, accepted for its next major release, stores a session as `<id>.json`, the whole manifest replaced atomically, beside append-only replay segments in `<id>.replay/`, with values past the per-file bound in `<id>.blobs/` and attachments in `<id>.assets/` as before [[1]].
- Its run time reads only that format, schema 9:
  - a session in schema 7 (one manifest) or schema 8 (chunks) is listed as unsupported and left unchanged;
  - `playbook sessions upgrade [<dir>] [--recursive] [--dry-run]`, run by hand, converts them and keeps the originals in `.legacy-sessions/` beside the sessions folder;
  - the store's `migrate()` and `migrateLegacyDefault()`, and the reading of schema 2–6 records and desktop sidecars, are removed.
- On a long trial session, the schema 8 store held 9,451 files and the new one 9.
  On Windows, a warm validation fell from 20 s to 0.6 s, acquiring a session from 81 s to 1.5 s, and a cold `git add -A` from 52 s to 3 s [[2]].
- Spex names the schema 8 files in its sync units, write order, explorer families, Git rules, scans and session fingerprint.
- Two imports rely on what Playbook removes: the former XDG session store at startup ([DR-050](050-shared-storage-cutover.md)) and desktop sidecars ([DR-045](045-unified-session-storage.md)).
- A third import moves schema 8 sessions that the Playbook CLI writes to its default, the home's root `sessions/`, into the matching clone at open ([DR-144](144-bounded-session-storage.md)); after the upgrade the CLI writes schema 9 there.
- The owner wants no conversion code kept in Spex; documenting Playbook's command is enough.

## Decision

### The session unit

- A session's tracked unit is every path of `sessions/` named for its id — `<id>.json`, and the files under `<id>.replay/`, `<id>.blobs/` and `<id>.assets/` — with provider hints, leases and temporary files ignored.
- Spex knows a session's files by its id alone, and Playbook's storage versions by number; it reads and validates sessions through Playbook's store and implements no part of its format.
- Sync takes a unit whole from one revision, as before.
  It writes every other member before the root, removes a replaced root's obsolete files after it, and removes the session's folders the write emptied, so no folder names a session whose root no longer stands.
  A file added or appended under the unit since the selection began is a changed member.
- Scans and the session fingerprint follow the root, the replay and blob folders, and the open segment.
  No watch of `sessions/` reports an append inside a replay folder, so while another host's writer holds a session, Spex looks at its newest segment on a short interval, opening nothing.
- An unfinished final record is an append not yet made, withheld without marking the replay incomplete.

### Earlier formats

- Spex reads what its Playbook reads.
- A session whose root Playbook refuses in an earlier format — schema 7 or 8, or a schema 2–6 record — stands as a nonblocking `session-upgrade` notice, the existing older-conversation notice, with its files unchanged.
  Spex does not open, continue, delete or convert it.
- A desktop sidecar is no longer read; its files stay unchanged.
- A root naming a later Playbook's storage version is unsupported likewise, never damage.
- Sync keeps its rule for unsupported sessions: a tracked one refuses the candidate, naming it; an untracked one stays local.
- `.legacy-sessions/` is ignored in every clone and is an ignored family of the catalog.

### Conversion is documented, not built

- Spex adds no command, startup step or detection for conversion.
- Its documentation tells the reader, on each device sharing the home:
  1. quit Spex and every other host using the home;
  2. upgrade them all to releases on the same Playbook major;
  3. run `npx @sublang/playbook@<major> sessions upgrade --recursive "<home>"`, which needs Node.js 20.6 or later and converts the home's root `sessions/` and every clone's;
  4. start Spex and sync.

### Imports

- The import of sessions arriving in the home's root `sessions/` takes Playbook's current format, schema 9, moving each session's files whole as before; an earlier-format session there waits for conversion.
- The startup import of the former XDG session store and the desktop sidecar import are removed.
  So are the `session-import` and `session-folder-required` codes only they produced, and the folder task's folding of dependent imports.
- The files those two imports read stay where they are, unchanged.
  A home still holding them, or an import receipt an earlier release left incomplete, is opened once by an earlier Spex release, and is then converted.
- The released groups migration of the former home layout is unchanged.
- Invalid data still blocks only the operations that depend on it, keeping startup and unrelated valid projects available; on acceptance this decision, the last in force of [DR-050](050-shared-storage-cutover.md), moves here and DR-050 is deleted.

### Adoption

- Under [DR-241](241-reviewable-builtin-gears.md), the floors rise to Playbook `^20.0.0` and the first slc release accepting it, and the built-ins stage at Playbook's version, only once both are published.
- Until then the change is verified against Playbook's main branch, installed into Spex's dependencies as a built copy.

Considered and declined:

- a `spex` command wrapping the converter, or converting at startup: more Spex code to keep, and a startup conversion cannot see another device or host writing the same sessions;
- syncing unconverted sessions as opaque files: it keeps the retired layout's names in the sync code for files no runtime reads;
- porting the removed imports onto the converter: Playbook offers no conversion API, and their inputs predate the current home layout;
- removing the root `sessions/` import: sessions the Playbook CLI runs would no longer reach Spex.

## Consequences

- A long session is a few tracked paths instead of thousands, so Save, Compare and staging cost follow its bytes.
- After the upgrade, an earlier session cannot be read until converted, and a clone tracking one cannot sync until it is.
- A device without Node.js 20.6 cannot run the documented conversion.
- A home still holding inputs of the removed imports needs an earlier release first.
- Spex keeps the root `sessions/` import, now for schema 9.

## References

[1]: https://github.com/sublang-ai/playbook/blob/main/specs/decisions/111-a-session-is-a-manifest-and-a-replay-log.md "Playbook DR-111: A Session Is a Manifest and a Replay Log"
[2]: https://github.com/sublang-ai/playbook/pull/120#issuecomment-7028324112 "DR-111 measurements on macOS and Windows"
