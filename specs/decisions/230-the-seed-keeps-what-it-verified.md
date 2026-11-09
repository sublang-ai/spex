<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-230: The Seed Keeps What It Verified

## Status

Accepted (2026-11-09) after the cache seed's first run on `main` saved no cache during GitHub's release-asset timeouts.
Extends [DR-228](228-ci-keeps-its-downloads.md): the seed's triggers, scope and caches are unchanged, its jobs and retries refined.

## Context

- The seed's first run, on the merge of DR-228, met 504 responses from GitHub's release downloads: Electron's fetch failed on Linux and Windows and dugite's download inside `npm ci` on macOS.
- A job saves its caches only when it succeeds, so each platform's one job saved none, not even npm's cache and dugite's archive that its install had already verified.
- With nothing under `main`, the next pull request missed both archives and failed the same way twice before a rerun passed.
- A cache may hold only what a step verified: a dugite archive cut short and saved would fail every later install that restored it.
- dugite 3.3.2, finding an archive that fails its checksum, removes it and then fails unpacking it, so a partial archive left in the cache wastes the next try.
- npm may roll back a whole new install once any package's script fails: after dugite's own download is cut short, or after another package fails once dugite verified its archive, the project's dugite, and with it the checksum, is gone while the archive stays.

## Decision

- On each platform the seed runs the install and Electron's fetch as jobs of their own, so a failed download fails only its own job.
  The install's success saves npm's package cache and dugite's archive, both verified by that install; the fetch's success saves Electron's archive, verified by its installer against the checksums Electron's package ships.
- The fetch's job installs packages without their scripts, from the registry alone, and saves no npm cache, which would lack what those scripts fetch.
- Each of the two downloads is tried up to three times, waiting longer before each retry.
  Before an install's next try, dugite's cache keeps only an archive matching the locked dugite's checksum; anything else, such as what a download cut short left behind, is dropped and fetched afresh, while an archive restored or fetched intact survives a failure before or beside dugite.
  The checksum comes from a copy of the locked dugite release installed apart from the project, from the registry and without its scripts, since npm may roll the project's install back, dugite with it, whichever package's script failed.
  Without that copy the project's dugite gives it; with neither, the cache is kept as it is and the run warns, since a partial archive kept costs one try while an intact one dropped costs a download.
- A failure after the last try still fails its job, so a cache no job verified is never saved.

## Consequences

- A transient outage of the release downloads costs the seed minutes of retries rather than every cache; a lasting one still fails the seed, and its rerun recovers what remains.
- Each lockfile change on `main` runs six seed jobs instead of three, one more of them on macOS.
- Pull requests and releases restore and save as before; their installs are not retried.
